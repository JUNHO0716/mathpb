import db from '../config/database.js';

export function isLoggedIn(req, res, next) {
  if (req.session?.user) return next();
  return res.status(401).redirect('/login.html');
}

export function isLoggedInJson(req, res, next) {
  if (req.session?.user) return next();
  return res.status(401).json({ msg: '로그인이 필요합니다.' });
}

export function isAdmin(req, res, next) {
  if (req.session?.user?.role === 'admin') return next();
  return res.status(403).send('관리자 전용');
}

/**
 * 기존 isSubscribed 유지:
 * - 관리자이거나 users.is_subscribed=1 이면 통과
 * - 필요 시 subscription_end 검증 로직을 추가해도 됨
 */
export async function isSubscribed(req, res, next) {
  if (!req.session?.user) {
    return res.status(401).redirect('/login.html');
  }
  try {
    const [[user]] = await db.query(
      'SELECT role, is_subscribed FROM users WHERE id = ?', 
      [req.session.user.id]
    );
    if (user && (user.role === 'admin' || user.is_subscribed == 1)) {
      return next();
    }
    return res.status(403).send('구독 회원 전용 서비스입니다. 접근 권한이 없습니다.');
  } catch (e) {
    return res.status(500).send('서버 오류가 발생했습니다.');
  }
}

export const needAuthJson = (req, res, next) => {
  if (!req.session || !req.session.user || !req.session.user.id) {
    return res.status(401).json({ ok:false, message:'login required' });
  }
  next();
};

/**
 * ➕ 추가: 플랜 등급 기반 접근 미들웨어
 *  - Basic: 1, Standard: 2, Pro: 3
 *  - 예) requirePlan('standard') => standard 이상만 통과
 */
const PLAN_RANK = { basic: 1, standard: 2, pro: 3 };

export function requirePlan(minPlan = 'basic') {
  const minRank = PLAN_RANK[minPlan] ?? 1;

  return async function(req, res, next) {
    try {
      const u = req.session?.user;
      if (!u?.id) return res.status(401).redirect('/login.html');

      // 현재 플랜과 구독 상태 조회
      const [[row]] = await db.query(`
        SELECT u.role, u.is_subscribed, u.subscription_end, LOWER(IFNULL(bk.plan,'')) AS plan
        FROM users u
        LEFT JOIN billing_keys bk ON bk.user_id = u.id
        WHERE u.id = ?
        LIMIT 1
      `, [u.id]);

      // 관리자면 무조건 통과
      if (row?.role === 'admin') return next();

      // 구독 활성(전부 '구독' 정책) + 플랜 등급 확인
      const plan = row?.plan || '';                     // 'basic' | 'standard' | 'pro' | ''
      const rank = PLAN_RANK[plan] ?? 0;
      const active = row?.is_subscribed == 1;           // 이미 update-plan에서 모두 1로 관리

      if (active && rank >= minRank) return next();

      return res.status(403).redirect('/pricing.html');
    } catch (e) {
      console.error('requirePlan error:', e);
      return res.status(500).send('권한 확인 실패');
    }
  };
}
