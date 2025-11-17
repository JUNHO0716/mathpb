import express from 'express';
import bcrypt from 'bcrypt';
import passport from 'passport';
import db from '../config/database.js';

const router = express.Router();

// 아이디 중복 확인 (수정 없음)
router.post('/check-id', async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ msg: '아이디를 입력하세요.' });

    const [rows] = await db.query('SELECT id FROM users WHERE id = ?', [id]);
    if (rows.length) {
      return res.status(409).json({ msg: '이미 사용 중인 아이디입니다.' });
    }
    return res.json({ msg: '사용 가능한 아이디입니다.' });
  } catch (err) {
    console.error('check-id error:', err);
    return res.status(500).json({ msg: '서버 오류' });
  }
});

// 회원가입 (수정 없음)
router.post('/register', async (req, res) => {
  const { id, email, password, name, phone } = req.body;
  console.log('회원가입 요청 데이터:', req.body);

  if (!id || !email || !password || !name || !phone) return res.status(400).json({ msg: "필수 입력값" });

  try {
    const hash = await bcrypt.hash(password, 10);
    await db.query(
      'INSERT INTO users (id, email, password, name, phone) VALUES (?, ?, ?, ?, ?)',
      [id, email, hash, name, phone]
    );
    res.json({ msg: "회원가입 성공" });
  } catch (e) {
    console.error('회원가입 에러:', e);
    if (e.code === 'ER_DUP_ENTRY') {
      res.status(409).json({ msg: "이미 존재하는 이메일" });
    } else {
      res.status(500).json({ msg: "서버 오류", error: e.message });
    }
  }
});

// 로그인 (수정 없음)
router.post('/login', async (req, res, next) => {
  const { id, password, keepLoggedIn } = req.body;
  try {
    const [rows] = await db.query('SELECT * FROM users WHERE id=?', [id]);
    if (!rows.length) return res.status(401).json({ msg: "아이디 또는 비밀번호 오류" });

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ msg: "아이디 또는 비밀번호 오류" });

    const userForSession = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role || 'user',
      avatarUrl: user.avatarUrl || '/image_index/profile.svg',
      isAdmin: user.is_admin == 1,
      loginType: 'local'              // ✅ 일반 로그인 표시
    };

    req.login(userForSession, async (err) => {
      if (err) { return next(err); }
      // ✅ 관리자 플래그를 세션에 명시적으로 저장
      req.session.user = {
        ...userForSession,
        is_admin: user.is_admin ? 1 : 0,
        isAdmin : user.is_admin ? 1 : 0
      };
      await db.query('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);
      if (keepLoggedIn) {
        const fourteenDays = 1000 * 60 * 60 * 24 * 14;
        req.session.cookie.maxAge = fourteenDays;
      }
      req.session.save(() => {
        res.json({ msg: "로그인 성공", user: req.session.user });
      });
    });
  } catch (e) {
    res.status(500).json({ msg: "서버 오류", error: e.message });
  }
});

// 비밀번호 재설정 (수정 없음)
router.post('/resetpw', async (req, res) => {
  const { email, name, phone, password } = req.body;
  if (!email || !name || !phone || !password) return res.status(400).json({ msg: "입력값 오류" });
  try {
    const [rows] = await db.query(
      'SELECT * FROM users WHERE email=? AND name=? AND phone=?',
      [email, name, phone]
    );
    if (!rows.length) return res.status(404).json({ msg: "입력 정보가 맞지 않습니다" });
    const hash = await bcrypt.hash(password, 10);
    await db.query('UPDATE users SET password=? WHERE email=?', [hash, email]);
    res.json({ msg: "비밀번호가 변경되었습니다!" });
  } catch (e) {
    res.status(500).json({ msg: "서버 오류", error: e.message });
  }
});

// 로그아웃 (수정 없음)
router.get('/logout', (req, res, next) => {
  req.logout(function(err) {
    if (err) { return next(err); }
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.json({ msg: '로그아웃 되었습니다' });
    });
  });
});

router.get('/check-auth', async (req, res) => {
  if (!req.session.user) return res.json({ isLoggedIn: false });

  const [[u]] = await db.query(
    `SELECT u.avatarUrl, u.is_subscribed, u.phone, u.bizNum, u.email,
            u.academyName, u.academyPhone, u.is_admin,    -- ✅ 추가
            bk.plan
     FROM users u
     LEFT JOIN billing_keys bk ON u.id = bk.user_id
     WHERE u.id = ?`,
    [req.session.user.id]
  );

  const avatarUrl = u?.avatarUrl || '/image_index/profile.svg';
  const hasPaid   = (req.session.user.role === 'admin') || (u?.is_subscribed == 1);
  const isAdmin   = (req.session.user.role === 'admin') || (u?.is_admin == 1);

  Object.assign(req.session.user, {
    avatarUrl,
    hasPaid,
    phone:         u?.phone        || '-',
    bizNum:        u?.bizNum       || '',
    academyName:   u?.academyName  || '',
    academyPhone:  u?.academyPhone || '',
    email:         u?.email        || req.session.user.email || '-',
    plan:          u?.plan         || null,
    is_admin:      u?.is_admin ? 1 : 0,   // ✅ 세션에 동기화
    isAdmin:       isAdmin ? 1 : 0        // ✅ 프론트/미들웨어 호환 키
  });

  return res.json({
    isLoggedIn: true,
    user: { ...req.session.user }
  });
});


// --- 소셜 로그인 (⚠️ 이 부분만 수정되었습니다) ---

// Google 로그인
router.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login.html' }),
  (req, res) => {
    req.session.user = req.user;
    // 세션 저장을 보장한 후 페이지를 이동시킵니다.
    req.session.save(() => {
      res.redirect('/index.html');
    });
  }
);

// Naver 로그인
router.get('/auth/naver', passport.authenticate('naver', { authType: 'reprompt' }));
router.get('/auth/naver/callback',
  passport.authenticate('naver', { failureRedirect: '/login.html' }),
  (req, res) => {
    req.session.user = req.user;
    // 세션 저장을 보장한 후 페이지를 이동시킵니다.
    req.session.save(() => {
      res.redirect('/index.html');
    });
  }
);

// Kakao 로그인
router.get('/auth/kakao', passport.authenticate('kakao'));
router.get('/auth/kakao/callback',
  passport.authenticate('kakao', { failureRedirect: '/login.html' }),
  (req, res) => {
    req.session.user = req.user;
    // 세션 저장을 보장한 후 페이지를 이동시킵니다.
    req.session.save(() => {
      res.redirect('/index.html');
    });
  }
);


export default router;