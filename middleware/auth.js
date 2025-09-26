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
      return next(); // 관리자 또는 구독자이면 통과
    }
    // 권한이 없으면 접근 거부
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