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
      avatarUrl: user.avatarUrl || '/image_index/profile.svg'
    };

    req.login(userForSession, async (err) => {
      if (err) { return next(err); }
      req.session.user = userForSession;
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

// 로그인 상태 확인 (수정 없음)
router.get('/check-auth', async (req, res) => {
  if (req.session.user) {
    const [rows] = await db.query(
      `SELECT u.avatarUrl, u.is_subscribed, u.phone, u.bizNum, u.email, u.academyName, u.academyPhone, bk.plan
       FROM users u
       LEFT JOIN billing_keys bk ON u.id = bk.user_id
       WHERE u.id = ?`,
      [req.session.user.id]
    );
    const u = rows[0] || {};
    const avatarUrl    = u.avatarUrl    || '/image_index/profile.svg';
    const hasPaid      = req.session.user.role === 'admin' || u.is_subscribed == 1;
    const phone        = u.phone        || '-';
    const bizNum       = u.bizNum       || '';
    const academyName  = u.academyName  || '';
    const academyPhone = u.academyPhone || '';
    const email        = u.email        || req.session.user.email || '-';
    const plan         = u.plan         || null;
    Object.assign(req.session.user, { avatarUrl, hasPaid, phone, bizNum, academyName, academyPhone, email, plan });
    return res.json({
      isLoggedIn: true,
      user: { ...req.session.user, avatarUrl, hasPaid, phone, bizNum, academyName, academyPhone, email, plan }
    });
  }
  res.json({ isLoggedIn: false });
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