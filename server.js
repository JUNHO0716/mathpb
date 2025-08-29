import dotenv from 'dotenv';
dotenv.config();

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import passport from 'passport';
import GoogleStrategy from 'passport-google-oauth20';
import mysql from 'mysql2/promise';
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  charset: 'utf8mb4',
  timezone: 'Z'
});
db.on('connection', conn => conn.query("SET NAMES utf8mb4"));
import bcrypt from 'bcrypt';
import cors from 'cors';
import AWS from 'aws-sdk';
import multer from 'multer';
import multerS3 from 'multer-s3';
import express from 'express';
import session from 'express-session';
import iconv from 'iconv-lite';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

// ─── ES 모듈에서 require() 쓰도록 ───────────────────
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// AWS S3 연결
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});

const deleteS3 = key =>
  s3.deleteObject({ Bucket: process.env.AWS_S3_BUCKET, Key: key }).promise();

// ─── 로그인·관리자 체크 ───
function isLoggedIn(req, res, next) {
  if (req.session?.user) return next();
  return res.status(401).redirect('/login.html');
}
function isLoggedInJson(req, res, next) {      // API 전용 (리다이렉트 대신 JSON)
  if (req.session?.user) return next();
  return res.status(401).json({ msg: '로그인이 필요합니다.' });
}
function isAdmin(req, res, next) {
  if (req.session?.user?.role === 'admin') return next();
  return res.status(403).send('관리자 전용');
}

// ─── 새 업로더 두 개 (코드 최상단에) ───
const avatarUpload = multer({
  storage: multerS3({
    s3,
    bucket: process.env.AWS_S3_BUCKET,      
    contentType: multerS3.AUTO_CONTENT_TYPE, // ★ 올바른 MIME 설정
    key: (req,file,cb)=> {
      const ext=file.originalname.split('.').pop();
      cb(null,`profile/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
    }
  })
});

const fileUpload = multer({
  storage: multerS3({ s3, bucket: process.env.AWS_S3_BUCKET,
    key: (req,file,cb)=> {
      const today=new Date().toISOString().slice(0,10);
      const ext=file.originalname.split('.').pop();
      cb(null,`files/${today}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
    }
  })
});

const app = express();
// ✅ Render 등 프록시 뒤에 있을 때 IP/HTTPS 인식 정확히 하려면 필수
app.set('trust proxy', 1);

// Express 기본 헤더 숨김 (보안 상수)
app.disable('x-powered-by');

// 보안 헤더 세트업
app.use(
  helmet({
    // 1) HTTPS에서만 HSTS 적용(운영만)
    hsts: process.env.NODE_ENV === 'production' ? {
      maxAge: 60 * 60 * 24 * 180, // 180일
      includeSubDomains: true,
      preload: false
    } : false,

    // 2) Referrer 최소화
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },

    // 3) S3 등 외부 리소스 대응
    crossOriginResourcePolicy: { policy: 'cross-origin' },

    // 4) CSP: 먼저 'reportOnly: true'로 시작 → 콘솔 에러 확인 후 enforce 권장
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "base-uri": ["'self'"],
        "form-action": ["'self'"],
        "object-src": ["'none'"],

        // 🔹 실제 사용하는 스크립트 CDN만 허용
        "script-src": [
          "'self'",
          "https://cdn.jsdelivr.net",
          "https://cdnjs.cloudflare.com",
          "https://apis.google.com"
        ],

        // 🔹 인라인 스타일이 있다면 'unsafe-inline' 유지 (가능하면 나중에 제거)
        "style-src": [
          "'self'",
          "'unsafe-inline'",
          "https://fonts.googleapis.com",
          "https://cdnjs.cloudflare.com"
        ],

        "font-src": [
          "'self'",
          "https://fonts.gstatic.com"
        ],

        // 🔹 S3에서 이미지 로드 허용
        "img-src": [
          "'self'",
          "data:",
          "blob:",
          "https://*.amazonaws.com"
        ],

        // 🔹 fetch/XHR 허용 출처 (본 서비스 도메인 + 로컬 개발)
        "connect-src": [
          "'self'",
          "https://mathpb.com",
          "http://mathpb.com",
          "http://localhost:3000",
          "http://localhost:5173"
        ],

        // 🔒 클릭재킹 방지 (관리 페이지 임베드 금지)
        "frame-ancestors": ["'none'"]
      },
      reportOnly: false   // ← 1~2일 모니터링 후 false로 바꿔서 실적용
    }
  })
);

// (추가) 혹시라도 누락되었을 때 nosniff 보강 (helmet이 기본 제공하지만 중복 무해)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});


// ✅ 전역 레이트 리밋(완만하게). 15분에 1000회
//  → 로그인/다운로드는 5단계에서 개별 제한 더 빡세게 추가할 것
const commonLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1000,                 // v7 옵션명: limit
  standardHeaders: 'draft-7',  // 응답헤더에 속도제한 정보 노출(표준)
  legacyHeaders: false,
});
app.use(commonLimiter);

const PROD = process.env.NODE_ENV === 'production';

const ALLOWED_HOSTS = new Set(
  PROD
    ? ['mathpb.com', 'www.mathpb.com']                 // 운영: HTTPS 도메인만
    : ['mathpb.com', 'www.mathpb.com', 'localhost']    // 개발: 로컬 허용
);

function getHostOnly(h) {
  return (h || '').toLowerCase().split(':')[0]; // 포트 제거
}

function originHost(urlStr) {
  try { return new URL(urlStr).hostname.toLowerCase(); }
  catch { return ''; }
}

function verifyOrigin(req, res, next) {
  const origin  = req.get('Origin');            // ex) https://mathpb.com
  const referer = req.get('Referer');           // ex) https://mathpb.com/index.html
  const xfHost  = req.get('X-Forwarded-Host');  // 프록시가 원래 Host 넘겨줄 수 있음
  const host    = req.get('Host');              // ex) mathpb.com

  const oHost = originHost(origin);
  const rHost = originHost(referer);
  const hHost = getHostOnly(xfHost || host);

  const allowed =
    (oHost && ALLOWED_HOSTS.has(oHost)) ||
    (rHost && ALLOWED_HOSTS.has(rHost)) ||
    (hHost && ALLOWED_HOSTS.has(hHost));

  if (!allowed) {
    return res.status(403).json({ error: 'FORBIDDEN_ORIGIN', detail: '출처 검증 실패' });
  }
  next();
}

// ▼ 게시판 첨부 다운로드 제한 (1분 30회)
const boardDownloadLimiter = rateLimit({ windowMs: 60 * 1000, max: 30 });

// ▼ /api/board/:id/attachment/:idx → idx 숫자만 허용
function numericIdxParam(req, res, next) {
  if (!/^\d+$/.test(req.params.idx)) return res.status(400).send('잘못된 요청');
  next();
}

const downloadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false
});

// /api/download/:id → 숫자만 허용
function numericIdParam(req, res, next) {
  if (!/^\d+$/.test(req.params.id)) {
    return res.status(400).send('잘못된 요청');
  }
  next();
}

app.use(cors({
  origin: PROD
    ? ['https://mathpb.com']                           // 운영: HTTPS만
    : ['https://mathpb.com', 'http://mathpb.com', 'http://localhost:3000', 'http://localhost:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// 프리플라이트(OPTIONS) 요청까지 허용
app.options('*', cors());
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,   // ✅ 로그인 전에는 세션 안 만듦
  cookie: {
    httpOnly: true,           // ✅ JS로 쿠키 접근 차단
    sameSite: 'lax',          // ✅ 다른 사이트에서 함부로 요청 못함 (CSRF 완화)
    secure: process.env.NODE_ENV === 'production', // ✅ HTTPS에서만 전송
    maxAge: 1000 * 60 * 60 * 2 // 2시간
  }
}));
app.use(express.json());

function multerErrorHandler(err, req, res, next) {
  if (err && err.field === 'avatar') {
    return res.status(400).json({ ok: false, code: err.code, msg: err.message, field: err.field });
  }
  next(err);
}
app.use(multerErrorHandler);

// ──────────────────────────────────────────────
// 아이디 중복 확인  POST /check-id
// Body: { id : "사용자가 입력한 아이디" }
// ──────────────────────────────────────────────
app.post('/check-id', async (req, res) => {
  try {
    const { id } = req.body;

    // 1) 값이 비었으면 400
    if (!id) return res.status(400).json({ msg: '아이디를 입력하세요.' });

    // 2) DB 조회   ★컬럼명(userId)과 테이블(users) 확인!
    const [rows] = await db.query(
      'SELECT id FROM users WHERE id = ?',
      [id]
    );

    // 3) 있으면 409, 없으면 200
    if (rows.length) {
      return res.status(409).json({ msg: '이미 사용 중인 아이디입니다.' });
    }
    return res.json({ msg: '사용 가능한 아이디입니다.' });
  } catch (err) {
    console.error('check-id error:', err);
    return res.status(500).json({ msg: '서버 오류' });
  }
});

app.post('/api/update-biznum', isLoggedIn, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { bizNum } = req.body;
    if (!bizNum) return res.json({ success: false });
    await db.query('UPDATE users SET bizNum = ? WHERE id = ?', [bizNum, userId]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/admin/users', isLoggedIn, isAdmin, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT id, email, name, created_at, is_subscribed, subscription_start, subscription_end
      FROM users
      ORDER BY created_at DESC
    `);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: '회원 목록 조회 오류', error: e.message });
  }
});

app.post('/api/update-subscription', isLoggedIn, isAdmin, async (req, res) => {
  const { userId, action } = req.body;
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const endDate = new Date();
  endDate.setDate(today.getDate() + 30);
  const endDateStr = endDate.toISOString().split('T')[0];

  try {
    if (action === 'extend') {
      await db.execute(`
        UPDATE users SET is_subscribed = 1, subscription_start = ?, subscription_end = ?
        WHERE id = ?
      `, [todayStr, endDateStr, userId]);
      res.json({ success: true, message: '✅ 구독이 연장되었습니다.' });
    } else if (action === 'cancel') {
      await db.execute(`
        UPDATE users SET is_subscribed = 0, subscription_end = ?
        WHERE id = ?
      `, [todayStr, userId]);
      res.json({ success: true, message: '❌ 구독이 해지되었습니다.' });
    } else {
      res.status(400).json({ success: false, message: '올바른 action 아님' });
    }
  } catch (e) {
    res.status(500).json({ success: false, message: '서버 오류', error: e.message });
  }
});



// [1] passport 초기화 및 세션 연결
app.use(passport.initialize());
app.use(passport.session());

// [2] GoogleStrategy 설정
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const email = profile.emails[0].value;
    const name = profile.displayName;
    const avatarUrl = profile.photos && profile.photos[0]?.value || null;

    // DB에 이미 있는 유저인지 확인
    const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);

    let user;
    if (rows.length) {
      user = rows[0];
      // DB에 사진이 없으면 업데이트
      if (avatarUrl && (!user.avatarUrl || user.avatarUrl === '/icon_my_b.png')) {
        await db.query('UPDATE users SET avatarUrl=? WHERE id=?', [avatarUrl, user.id]);
        user.avatarUrl = avatarUrl; // 메모리상에도 갱신
      }
    } else {
      // 신규 가입: avatarUrl까지 같이 저장!
      await db.query(
        'INSERT INTO users (id, email, name, password, phone, avatarUrl) VALUES (?, ?, ?, NULL, "", ?)',
        [profile.id, email, name, avatarUrl]
      );
      const [newUser] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
      user = newUser[0];
    }

    return done(null, {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      avatarUrl: user.avatarUrl || '/icon_my_b.png'
    });
  } catch (err) {
    console.error('Google Strategy error:', err);
    return done(err);
  }
}));

passport.serializeUser((user, done) => {
  done(null, user);
});
passport.deserializeUser((obj, done) => {
  done(null, obj);
});

// 서버 상태 확인용 라우트 (MySQL 연결 확인)
app.get('/ping-db', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT NOW() AS now');
    res.send(`✅ DB 연결 성공! 현재 시간: ${rows[0].now}`);
  } catch (e) {
    console.error('❌ DB 연결 실패:', e);
    res.status(500).send('DB 연결 실패');
  }
});

// 회원가입 (POST /register)
app.post('/register', async (req, res) => {
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
    console.error('회원가입 에러:', e);  // 에러 로그
    if (e.code === 'ER_DUP_ENTRY') {
      res.status(409).json({ msg: "이미 존재하는 이메일" });
    } else {
      res.status(500).json({ msg: "서버 오류", error: e.message });
    }
  }
});

app.post(
  '/api/user-upload',
  isLoggedIn,
  fileUpload.array('fileInput', 10),
  async (req, res) => {
    try {
      const userId = req.session.user.id;
      const files  = req.files;
      if (!files || !files.length) {
        return res.status(400).json({ msg: '파일이 없습니다.' });
      }

      for (const f of files) {
       // 헤더 바이트를 latin1 로 뽑아서 → UTF-8 로 해석
       const decodedName = Buffer
         .from(f.originalname, 'latin1')
         .toString('utf8');


        // ③ DB에 저장할 때는 decodedName 을 사용!
        await db.query(
          'INSERT INTO uploads (user_id, filename, s3_key, status) VALUES (?, ?, ?, ?)',
          [userId, decodedName, f.key, '확인중']
        );
      }

      res.json({ msg: '업로드 성공' });
    } catch (e) {
      console.error(e);
      res.status(500).json({ msg: '서버 오류', error: e.message });
    }
  }
);

// 로그인 API - 세션 저장 포함
app.post('/login', async (req, res) => {
  const { id, password } = req.body; // email -> id
  try {
    const [rows] = await db.query('SELECT * FROM users WHERE id=?', [id]);
    if (!rows.length) return res.status(401).json({ msg: "아이디 또는 비밀번호 오류" });

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ msg: "아이디 또는 비밀번호 오류" });

    req.session.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role || 'user',
      avatarUrl: user.avatarUrl || '/icon_my_b.png'
    };
    res.json({ msg: "로그인 성공", user: req.session.user });
  } catch (e) {
    res.status(500).json({ msg: "서버 오류", error: e.message });
  }
});

// 비밀번호 재설정 (POST /resetpw)
// 이메일+이름+핸드폰번호가 모두 맞아야 변경 가능!
app.post('/resetpw', async (req, res) => {
  const { email, name, phone, password } = req.body;
  if (!email || !name || !phone || !password) return res.status(400).json({ msg: "입력값 오류" });
  try {
    // 세 정보가 모두 맞는 회원만 비번 변경 허용
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

// 공지 등록 (POST /api/notices) ─ 관리자만
app.post('/api/notices',
  isLoggedIn, isAdmin,
  fileUpload.single('image'),
  async (req, res) => {
    const { title, content, category } = req.body;
    if (!title || !content)
      return res.status(400).json({ msg: '필수 입력값' });

    const imageUrl = req.file ? req.file.location : null;   // S3 URL
    const today    = new Date().toISOString().slice(0, 10);

    await db.query(
      'INSERT INTO notices (title, date, content, imageUrl, category) VALUES (?,?,?,?,?)',
      [title, today, content, imageUrl, category || '공지']
    );
    res.json({ msg: '공지 등록 성공' });
});

// 공지사항 목록 (제목, 날짜만)
app.get('/api/notices', async (req, res) => {
  const type = req.query.type || '공지';  // 기본값: 공지

  try {
    const [rows] = await db.query(
      'SELECT * FROM notices WHERE category = ? ORDER BY id DESC',
      [type]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'DB 오류' });
  }
});

// 공지 상세 조회
app.get('/api/notices/:id', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM notices WHERE id=?', [req.params.id]);
    if (rows.length) res.json(rows[0]);
    else res.status(404).json({ msg: "공지 없음" });
  } catch (e) {
    res.status(500).json({ msg: "공지 상세 오류", error: e.message });
  }
});

// 공지 삭제 (DELETE /api/notices/:id) ─ 관리자만
app.delete('/api/notices/:id',
  isLoggedIn, isAdmin,
  async (req, res) => {
    const [r] = await db.query('DELETE FROM notices WHERE id=?', [req.params.id]);
    if (r.affectedRows) return res.json({ msg: '삭제 성공' });
    res.status(404).json({ msg: '공지 없음' });
});

    // 업로드 API (관리자용)
    app.post('/api/upload',
  isLoggedIn, isAdmin, verifyOrigin,  // 여기 추가!
  fileUpload.array('files'),
  async (req, res) => {
      try {
        const { region, district, school, grade, year, semester, title, level } = req.body;
        const files = req.files;
        if(!files || files.length === 0) return res.status(400).json({ message: '파일이 없습니다.' });

        // 확장자별로 구분
        let hwpKey = null, pdfKey = null;
for (const f of files) {
  const ext = path.extname(f.originalname).toLowerCase();   // ✅ ext 선언
  if (['.hwp', '.hwpx'].includes(ext)) hwpKey = f.key;
  if (ext === '.pdf')               pdfKey = f.key;
}

        await db.query(
          `INSERT INTO files 
            (region, district, school, grade, year, semester, title, hwp_filename, pdf_filename, level)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [region, district, school, grade, year, semester, title, hwpKey, pdfKey, level]
        );
        res.json({ message: '업로드 성공' });
      } catch (e) {
        res.status(500).json({ message: '서버 오류', error: e.message });
      }
    });

// – 로그인된 사용자만, 본인이 올린 항목만 삭제 가능
app.delete('/api/uploads/:id', isLoggedIn, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const uploadId = req.params.id;

    // 본인이 올린 것만 삭제
    const [result] = await db.query(
      'DELETE FROM uploads WHERE id = ? AND user_id = ?',
      [uploadId, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ msg: '삭제할 업로드가 없거나 권한이 없습니다.' });
    }
    res.json({ msg: '삭제 성공' });
  } catch (err) {
    console.error('DELETE /api/uploads/:id error:', err);
    res.status(500).json({ msg: '서버 오류' });
  }
});


// [bizNum 업데이트 바로 아래쯤에]
app.post('/api/save-academy', isLoggedIn, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { name, phone } = req.body;
    if (!name) return res.json({ success: false, msg: '학원명을 입력하세요.' });

    // users 테이블에 academyName, academyPhone 업데이트
    await db.query(
      'UPDATE users SET academyName = ?, academyPhone = ? WHERE id = ?',
      [name, phone || '', userId]
    );

    // 세션에도 반영
    req.session.user.academyName  = name;
    req.session.user.academyPhone = phone || '';
    req.session.save(err => {
      if (err) console.error('세션 저장 오류:', err);
    });

    res.json({ success: true });
  } catch (e) {
    console.error('/api/save-academy error:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ▶ /check-auth 핸들러 수정
app.get('/check-auth', async (req, res) => {
  if (req.session.user) {
   const [rows] = await db.query(
     'SELECT avatarUrl, is_subscribed, phone, bizNum, email, academyName, academyPhone FROM users WHERE id = ?',
     [req.session.user.id]
   );
    const u = rows[0] || {};
    const avatarUrl    = u.avatarUrl    || '/icon_my_b.png';
    const hasPaid       = req.session.user.role === 'admin' || u.is_subscribed == 1;
    const phone        = u.phone        || '-';
    const bizNum       = u.bizNum       || '';
    const academyName  = u.academyName  || '';
    const academyPhone = u.academyPhone || '';
    const email        = u.email        || req.session.user.email || '-'; // email 필드 보장

    // 세션 동기화
    Object.assign(req.session.user, { avatarUrl, hasPaid, phone, bizNum, academyName, academyPhone, email });

    return res.json({
      isLoggedIn: true,
      user: {
        ...req.session.user,
        avatarUrl,
        hasPaid,
        phone,
        bizNum,
        academyName,
        academyPhone,
        email    // 프론트에서도 이 키 써야 함!
      }
    });
  }
  res.json({ isLoggedIn: false });
});

// 파일 목록(필터/검색)
app.get('/api/files', isLoggedInJson, verifyOrigin, async (req, res) => {
  try {
    const { region, district, school, grade, year, semester, level } = req.query;
    let sql = "SELECT * FROM files WHERE 1=1";
    const params = [];
    if(region)   { sql += " AND region=?";   params.push(region); }
    if(district) { sql += " AND district=?"; params.push(district); }
    if(school)   { sql += " AND school=?";   params.push(school); }
    if (grade !== '' && grade !== undefined) { sql += " AND grade=?"; params.push(grade); }
    if(year)     { sql += " AND year=?";     params.push(year); }
    if(semester) { sql += " AND semester=?"; params.push(semester); }
    if(level)    { sql += " AND level=?";    params.push(level); }
    sql += " ORDER BY uploaded_at DESC";

    const [rows] = await db.query(sql, params);

    // ⬇ 필요한 정보만 응답, S3 키는 빼고 Boolean만 제공
    const sanitized = rows.map(r => ({
      id: r.id,
      region: r.region,
      district: r.district,
      school: r.school,
      grade: r.grade,
      year: r.year,
      semester: r.semester,
      title: r.title,
      level: r.level,
      uploaded_at: r.uploaded_at,
      files: {
        pdf: !!r.pdf_filename,
        hwp: !!r.hwp_filename
      }
    }));

    res.set('Cache-Control', 'no-store');
    res.set('X-Robots-Tag', 'noindex, nofollow');
    res.json(sanitized);
  } catch (e) {
    res.status(500).json({ message: 'DB 오류', error: e.message });
  }
});

// 파일 다운로드 (사용자)
app.get(
  '/api/download/:id',
  downloadLimiter,   // ⬅ ① 남용 방지
  numericIdParam,    // ⬅ ② id 형식 검사
  isLoggedIn,
  verifyOrigin,
  async (req, res) => {
    const user = req.session.user;
    if (!user) return res.status(403).send('권한이 없습니다.');

    // DB에서 구독/권한 확인
    const [[dbUser]] = await db.query(
      'SELECT is_subscribed, role FROM users WHERE id=?',
      [user.id]
    );
    if (!(dbUser.role === 'admin' || dbUser.is_subscribed == 1)) {
      return res.status(403).send('권한이 없습니다.');
    }

    try {
      const [rows] = await db.query(
        'SELECT hwp_filename, pdf_filename, title FROM files WHERE id=?',
        [req.params.id]
      );
      if (!rows.length) return res.status(404).send('파일 없음');
      const { hwp_filename, pdf_filename, title } = rows[0];

      const type = req.query.type;
      let key = null, ext = null;
      if (type === 'pdf') {
        key = pdf_filename;  ext = '.pdf';
      } else {
        key = hwp_filename;  ext = '.hwp';
        if (key && key.endsWith('.hwpx')) ext = '.hwpx';
      }
      if (!key) return res.status(404).send('해당 형식 파일 없음');

      // ⬅ ③ 캐시/검색엔진 차단
      res.set('Cache-Control', 'no-store');
      res.set('X-Robots-Tag', 'noindex, nofollow');

      const downloadFileName = `${title}${ext}`;
      const signed = s3.getSignedUrl('getObject', {
        Bucket: process.env.AWS_S3_BUCKET,
        Key: key,
        Expires: 60,
        ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(downloadFileName)}`
      });

      return res.redirect(302, signed);
    } catch (e) {
      console.error('다운로드 오류:', e);
      return res.status(500).send('다운로드 오류');
    }
  }
);


      // 파일 정보 수정 (관리자)
      app.put('/api/files/:id', isLoggedIn, isAdmin, fileUpload.array('files'), async (req, res) => {
        try {
          const { region, district, school, grade, year, semester, title, level } = req.body;
      const files = req.files || [];
      // 첨부파일 없이 메타데이터만 수정할 때
      if (!files.length) {
        await db.query(`
          UPDATE files SET region=?, district=?, school=?, grade=?, year=?,
            semester=?, title=?, level=? WHERE id=?`,
          [region, district, school, grade, year, semester, title, level, req.params.id]
        );
        return res.json({ message: '수정 완료(파일 변경 없음)' });
      }

        // 기존 파일명 조회
        const [[row]] = await db.query('SELECT hwp_filename, pdf_filename FROM files WHERE id=?', [req.params.id]);
        if (!row) return res.status(404).json({ message: '자료 없음' });

        let newHwp = row.hwp_filename, newPdf = row.pdf_filename;

        for (let f of files) {
          const ext = path.extname(f.originalname).toLowerCase();
          if (['.hwp', '.hwpx'].includes(ext)) {
            // 기존 파일 실제 삭제
            if (newHwp) { try { await deleteS3(newHwp); } catch (e) {} }
            newHwp = f.key;
          }
          if (ext === '.pdf') {
            if (newPdf) { try { await deleteS3(newPdf); } catch (e) {} }
            newPdf = f.key;
          }
        }

        await db.query(
          `UPDATE files SET
            region=?, district=?, school=?, grade=?, year=?, semester=?, title=?, level=?,
            hwp_filename=?, pdf_filename=?
          WHERE id=?`,
          [region, district, school, grade, year, semester, title, level, newHwp, newPdf, req.params.id]
        );
        res.json({ message: '수정 완료' });
      } catch (e) {
        res.status(500).json({ message: '수정 오류', error: e.message });
      }
    });
// 문의/업로드 글 등록 (POST /api/board)
app.post('/api/board', isLoggedIn, verifyOrigin, fileUpload.array('fileInput', 10), async (req, res) => {
  try {
    const { boardType, title, password, content } = req.body;
    // 첨부파일명(여러개 콤마로)
  const files = req.files && req.files.length > 0
      ? req.files.map(f => f.key).join(',')        // ✅ S3 Key
      : '';
    await db.query(
      'INSERT INTO board (boardType, title, password, content, files) VALUES (?, ?, ?, ?, ?)',
      [boardType, title, password, content, files]
    );
    res.json({ message: '글 등록 성공' });
  } catch (e) {
    res.status(500).json({ message: '글 등록 오류', error: e.message });
  }
});


app.get('/api/my-uploads', isLoggedIn, async (req, res) => {
  try {
    const [rows] = await db.query(`
       SELECT id,
        filename,
        status,
        reject_reason,
        uploaded_at    AS created_at,
        completed_at
      FROM uploads
      WHERE user_id = ?
      ORDER BY uploaded_at DESC
    `, [req.session.user.id]);

    // 새로 업로드된 이름은 이미 UTF-8로 잘 저장돼 있으므로 바로 내려줍니다.
    res.json(rows);
  } catch (e) {
    console.error('my-uploads 조회 오류:', e);
    res.status(500).json({ msg: '업로드 조회 실패', error: e.message });
  }
});

// ✅ 게시판 목록 (키 노출 금지 + 로그인 보호)
app.get('/api/board', isLoggedIn, verifyOrigin, async (req, res) => {
  try {
    const type = req.query.type; // 'ask' | 'upload' 등
    const [rows] = await db.query(
      'SELECT id, title, content, created_at, files FROM board WHERE boardType=? ORDER BY id DESC',
      [type]
    );

    // files(키 문자열) → 존재 여부 Boolean으로 축소
    const sanitized = rows.map(r => ({
      id: r.id,
      title: r.title,
      // 필요하면 content 요약/삭제 가능
      created_at: r.created_at,
      files: { exists: !!(r.files && r.files.trim().length) }
    }));

    res.set('Cache-Control', 'no-store');
    res.set('X-Robots-Tag', 'noindex, nofollow');
    res.json(sanitized);
  } catch (e) {
    res.status(500).json({ message: '게시글 목록 오류', error: e.message });
  }
});

// ✅ 게시글 상세 (키 노출 금지 + 로그인 보호)
app.get('/api/board/:id', isLoggedIn, verifyOrigin, async (req, res) => {
  try {
    const [[row]] = await db.query('SELECT * FROM board WHERE id=?', [req.params.id]);
    if (!row) return res.status(404).json({ message: '글 없음' });

    const hasFiles = !!(row.files && row.files.trim().length);

    // files(키 문자열) 제거 → 최소 정보만
    const sanitized = {
      id: row.id,
      title: row.title,
      content: row.content,
      created_at: row.created_at,
      files: { exists: hasFiles }
    };

    res.set('Cache-Control', 'no-store');
    res.set('X-Robots-Tag', 'noindex, nofollow');
    res.json(sanitized);
  } catch (e) {
    res.status(500).json({ message: '게시글 상세 오류', error: e.message });
  }
});

// ✅ 게시판 첨부 다운로드 (키 노출 없이 302로 S3 이동)
app.get('/api/board/:id/attachment/:idx',
  isLoggedIn,           // 로그인 필수
  verifyOrigin,         // 허용 도메인만
  boardDownloadLimiter, // 남용 방지
  numericIdxParam,      // idx 유효성
  async (req, res) => {
    const postId = Number(req.params.id);
    const idx = Number(req.params.idx);

    const [[row]] = await db.query('SELECT title, files FROM board WHERE id=?', [postId]);
    if (!row) return res.status(404).send('글 없음');

    const keys = (row.files || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    const key = keys[idx];
    if (!key) return res.status(404).send('첨부 없음');

    // (옵션) 작성자/관리자만 허용하려면 여기서 추가 검증

    res.set('Cache-Control', 'no-store');
    res.set('X-Robots-Tag', 'noindex, nofollow');

    const fileName = `${row.title || 'attachment'}-${idx + 1}`;
    const signed = s3.getSignedUrl('getObject', {
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key,
      Expires: 60,
      ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`
    });

    return res.redirect(302, signed);
  }
);

// ── 관리자 전용 업로드 리스트 조회 ──
// GET /api/admin/uploads
app.get(
  '/api/admin/uploads',
  isLoggedIn, isAdmin,
  async (req, res) => {
    try {
      const [rows] = await db.query(
        `SELECT id, user_id, filename, status, reject_reason, uploaded_at, completed_at
         FROM uploads
         ORDER BY uploaded_at DESC`
      );
      res.json(rows);
    } catch (e) {
      console.error(e);
      res.status(500).json({ msg: '관리자 업로드 조회 실패' });
    }
  }
);

// ── 관리자 전용 상태 변경 ──
// PATCH /api/admin/uploads/:id
// Body: { status: "in_progress"|"rejected"|"completed", reason?: string }
app.patch(
  '/api/admin/uploads/:id',
  isLoggedIn, isAdmin,
  express.json(),
  async (req, res) => {
    try {
      const { status, reason } = req.body;
      const id = req.params.id;
      let sql, params;

      if (status === 'in_progress') {
        sql    = 'UPDATE uploads SET status=? WHERE id=?';
        params = ['제작중', id];

      } else if (status === 'rejected') {
        sql    = 'UPDATE uploads SET status=?, reject_reason=? WHERE id=?';
        params = ['반려', reason || '', id];

      } else if (status === 'completed') {
        sql    = 'UPDATE uploads SET status=?, completed_at=NOW() WHERE id=?';
        params = ['완료', id];

      } else {
        return res.status(400).json({ msg: '올바른 status만 변경 가능합니다.' });
      }

      const [r] = await db.query(sql, params);
      if (r.affectedRows === 0) return res.status(404).json({ msg: '해당 업로드가 없습니다.' });
      res.json({ msg: '상태 변경 성공' });

    } catch (e) {
      console.error(e);
      res.status(500).json({ msg: '상태 변경 실패', error: e.message });
    }
  }
);

// 글 삭제 (관리자/본인, POST /api/board/:id/delete)
app.post('/api/board/:id/delete', async (req, res) => {
  try {
    // 관리자: 그냥 삭제, 본인: 비밀번호 체크 필요!
    const { password } = req.body;
    const [rows] = await db.query('SELECT * FROM board WHERE id=?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: '글 없음' });

    // 비공개글이면 비번 체크
    if (rows[0].password && password !== rows[0].password) {
      return res.status(403).json({ message: '비밀번호 불일치' });
    }

    // 첨부파일 삭제
    if (rows[0].files) {
      const fileArr = rows[0].files.split(',');
      for (let f of fileArr) {
        if (f) {
          try { await deleteS3(f); } catch (e) {}
        }
      }
    }

    await db.query('DELETE FROM board WHERE id=?', [req.params.id]);
    res.json({ message: '삭제 성공' });
  } catch (e) {
    res.status(500).json({ message: '글 삭제 오류', error: e.message });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});



// 로그아웃 API
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ msg: '로그아웃 되었습니다' });
  });
});
// Google 로그인 시작
app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/admin_review.html', isLoggedIn, isAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin_review.html'));
});

// 로그인 후 콜백 처리
app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login.html' }),
  (req, res) => {
    req.session.user = req.user;  // 세션 저장
    res.redirect('/index.html'); // 로그인 성공 후 메인으로 이동
  }
);

// ──────────────────────────────────────
//  관리자만 접근 가능한 정적 페이지
// ──────────────────────────────────────
app.get('/admin_upload.html', isLoggedIn, isAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin_upload.html'));
});

app.get('/admin_files.html',  isLoggedIn, isAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin_files.html'));
});

 // 파일 다운로드 log
app.post('/api/download-log', isLoggedIn, verifyOrigin, async (req, res) => {
  const { fileId, type } = req.body;
  if (!fileId || !type) return res.status(400).json({ error: '데이터 누락' });

  const conn = await db.getConnection();
  try {
    const [[file]] = await conn.query('SELECT title FROM files WHERE id = ?', [fileId]);
    const title = file?.title || '제목없음';

    await conn.query(`
      INSERT INTO downloads_log (file_id, file_name, type, user_email, downloaded_at)
      VALUES (?, ?, ?, ?, NOW())
    `, [fileId, title, type, req.session.user.email]);

    res.json({ success: true });
  } catch (e) {
    console.error('다운로드 로그 저장 실패', e);
    res.status(500).json({ error: '서버 오류' });
  } finally {
    conn.release();
  }
});

app.get('/api/downloads/recent', isLoggedIn, verifyOrigin, async (req, res) => {
  try {
    const sessionEmail = req.session.user.email;  // ✅ 세션 기준
    const [rows] = await db.query(`
      SELECT f.id, l.file_name AS name, COUNT(*) AS count, MAX(l.downloaded_at) AS date
      FROM downloads_log l
      JOIN files f ON f.title = l.file_name
      WHERE l.user_email = ?
      GROUP BY f.id, l.file_name
      ORDER BY date DESC
      LIMIT 5
    `, [sessionEmail]);

    res.json(rows);
  } catch (e) {
    console.error('최근 다운로드 불러오기 실패', e);
    res.status(500).json({ error: '서버 오류' });
  }
});


// 파일 삭제 (관리자만)
app.delete('/api/files/:id', isLoggedIn, isAdmin, async (req, res) => {
  try {
    // 파일명 조회 (첨부파일 실제 삭제)
    const [[row]] = await db.query('SELECT hwp_filename, pdf_filename FROM files WHERE id=?', [req.params.id]);
    if (!row) return res.status(404).json({ message: '자료 없음' });

    // 실제 파일 삭제 (존재하면)
    if (row.hwp_filename) {
      try { await deleteS3(row.hwp_filename); } catch (e) {}
    }
    if (row.pdf_filename) {
      try { await deleteS3(row.pdf_filename); } catch (e) {}
    }

    // DB에서 삭제
    await db.query('DELETE FROM files WHERE id=?', [req.params.id]);
    res.json({ message: '삭제 성공' });
  } catch (e) {
    res.status(500).json({ message: '삭제 오류', error: e.message });
  }
});

app.post('/api/board_secure', fileUpload.array('fileInput', 10), async (req, res) => {
  try {
    const { boardType, title, password, content } = req.body;
    const files = req.files && req.files.length > 0
      ? req.files.map(f => f.key).join(',')
      : '';

    const hash = await bcrypt.hash(password, 10);

    await db.query(
      'INSERT INTO board_secure (boardType, title, password, content, files) VALUES (?, ?, ?, ?, ?)',
      [boardType, title, hash, content, files]
    );

    res.json({ message: '보안글 등록 성공' });
  } catch (e) {
    res.status(500).json({ message: '보안글 등록 오류', error: e.message });
  }
});

app.get('/api/board_secure', isLoggedIn, verifyOrigin, async (req, res) => {
  try {
    const type = req.query.type; // 예: 'notice' 등
    const [rows] = await db.query(
      'SELECT id, title, created_at FROM board_secure WHERE boardType=? ORDER BY id DESC',
      [type]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: '보안 게시글 목록 오류', error: e.message });
  }
});

// ✅ 보안 게시판 비번 검증 (S3 key 제거, Boolean만 내려줌)
app.post('/api/board_secure/:id/checkpw', async (req, res) => {
  try {
    const { password } = req.body;
    const [[row]] = await db.query('SELECT * FROM board_secure WHERE id=?', [req.params.id]);

    if (!row) return res.status(404).json({ message: '글 없음' });
    const isMatch = await bcrypt.compare(password, row.password);
    if (!isMatch) return res.status(403).json({ message: '비밀번호 틀림' });

    // files 컬럼은 key 대신 "존재 여부만" 내려줌
    const hasFiles = !!(row.files && row.files.trim().length);

    const sanitized = {
      id: row.id,
      title: row.title,
      content: row.content,
      created_at: row.created_at,
      files: { exists: hasFiles }
    };

    res.set('Cache-Control', 'no-store');
    res.set('X-Robots-Tag', 'noindex, nofollow');
    return res.json(sanitized);
  } catch (e) {
    res.status(500).json({ message: '비번 검증 오류', error: e.message });
  }
});

app.post('/api/board_secure/:id/delete', async (req, res) => {
  try {
    const { password } = req.body;
    const [[row]] = await db.query('SELECT * FROM board_secure WHERE id=?', [req.params.id]);
    if (!row) return res.status(404).json({ message: '글 없음' });

    // 관리자
    if (req.session.user?.role === 'admin') {
      await db.query('DELETE FROM board_secure WHERE id=?', [req.params.id]);
      return res.json({ message: '관리자가 삭제 완료' });
    }

    const isMatch = await bcrypt.compare(password, row.password);
    if (!isMatch) return res.status(403).json({ message: '비밀번호 불일치' });

    await db.query('DELETE FROM board_secure WHERE id=?', [req.params.id]);
    res.json({ message: '삭제 성공' });
  } catch (e) {
    res.status(500).json({ message: '보안 글 삭제 오류', error: e.message });
  }
});

// ✅ 보안 게시판 첨부 다운로드 (비번 검증된 사용자/관리자만 쓰게 하려면 추가 검증 가능)
app.get('/api/board_secure/:id/attachment/:idx',
  isLoggedIn,
  verifyOrigin,
  boardDownloadLimiter, // 이미 위에서 선언한 rateLimit 재사용
  numericIdxParam,      // 이미 위에서 선언한 idx 숫자 검증 함수 재사용
  async (req, res) => {
    const postId = Number(req.params.id);
    const idx = Number(req.params.idx);

    const [[row]] = await db.query('SELECT title, files FROM board_secure WHERE id=?', [postId]);
    if (!row) return res.status(404).send('글 없음');

    const keys = (row.files || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    const key = keys[idx];
    if (!key) return res.status(404).send('첨부 없음');

    // (옵션) 작성자/관리자만 허용할지 등 추가 검증 가능

    res.set('Cache-Control', 'no-store');
    res.set('X-Robots-Tag', 'noindex, nofollow');

    const fileName = `${row.title || 'attachment'}-${idx + 1}`;
    const signed = s3.getSignedUrl('getObject', {
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key,
      Expires: 60,
      ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`
    });

    return res.redirect(302, signed);
  }
);


 // ――― 프로필 사진 업로드 ―――
 //  1)  클라이언트쪽 필드명이 'avatar' 또는 'file' 둘 다 올 수 있게 처리
 //  2)  multer / S3 단계에서 발생한 에러도 500 → 400 으로 내려주기
app.post(
  '/api/upload-profile-photo',
  isLoggedIn,
  avatarUpload.single('avatar'),      // ← 한 줄이면 충분 (필드명 'avatar'만 씀)
  async (req, res) => {
    console.log('req.body:', req.body);
    console.log('req.file:', req.file);
    try {
      if (!req.file) {
        return res.status(400).json({ msg: '업로드된 파일이 없습니다.' });
      }

      const url = req.file.location;   // S3 public URL

      // ① DB 저장
      await db.query(
        'UPDATE users SET avatarUrl=? WHERE id=?',
        [url, req.session.user.id]
      );

      // ② 세션에도 반영하고, 반드시 save!
      req.session.user.avatarUrl = url;
      req.session.save(err => {
        if (err) {
          console.error('세션 저장 오류:', err);
          return res.status(500).json({ msg: '세션 저장 오류' });
        }
        // ③ 클라이언트에 새 URL 반환
        res.json({ success: true, avatarUrl: url });
      });
    } catch (e) {
      console.error('프로필 사진 업로드 오류:', e);
      res.status(500).json({ msg: '서버 오류', error: e.message });
    }
  }
);

    app.delete('/api/delete-profile-photo', isLoggedIn, async (req, res) => {
  try {
    const url = req.session.user.avatarUrl;
    if (url && !url.includes('/icon_my_b.png')) { // 기본이미지 아니면
      const key = url.split('.amazonaws.com/')[1];
      await deleteS3(key);
    }

    await db.query('UPDATE users SET avatarUrl=? WHERE id=?',
      ['/icon_my_b.png', req.session.user.id]);
    req.session.user.avatarUrl = '/icon_my_b.png';

    res.json({ success: true, avatarUrl: '/icon_my_b.png' });
  } catch (e) {
    console.error('프로필 삭제 오류:', e);
    res.status(500).json({ msg: '삭제 오류', error: e.message });
  }
});

// 최근 업로드 10개를 반환하는 API
app.get('/api/uploads/recent', isLoggedIn, verifyOrigin, async (req, res) => {
  try {
    // files 테이블에서 최신 10개의 파일명(title), 업로드일(uploaded_at)만 뽑기
    const [rows] = await db.query(
      `SELECT title AS name, DATE_FORMAT(uploaded_at, '%Y-%m-%d') AS date
       FROM files
       ORDER BY uploaded_at DESC
       LIMIT 10`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: '업로드 목록 오류', error: e.message });
  }
});

app.post('/api/save-academy-address', isLoggedIn, async (req, res) => {
  const userId = req.session.user?.id;
  const { address } = req.body;
  if (!userId || !address) return res.json({ success: false });

  await db.execute('UPDATE users SET academyAddress = ? WHERE id = ?', [address, userId]);
  res.json({ success: true });
});

// 비밀번호 확인 API
app.post('/api/check-password', isLoggedIn, async (req, res) => {
  const { password } = req.body;
  if (!password) return res.json({ success: false, msg: '비밀번호를 입력하세요.' });
  try {
    const [rows] = await db.query('SELECT password FROM users WHERE id=?', [req.session.user.id]);
    if (!rows.length) return res.json({ success: false, msg: '사용자 정보 없음' });

    const valid = await bcrypt.compare(password, rows[0].password);
    if (valid) return res.json({ success: true });
    return res.json({ success: false, msg: '비밀번호가 일치하지 않습니다.' });
  } catch (e) {
    res.json({ success: false, msg: '서버 오류' });
  }
});

// 비밀번호 변경 API
app.post('/api/change-password', isLoggedIn, async (req, res) => {
  const { password } = req.body;
  if (!password) return res.json({ success: false, msg: '새 비밀번호를 입력하세요.' });
  try {
    const hash = await bcrypt.hash(password, 10);
    await db.query('UPDATE users SET password=? WHERE id=?', [hash, req.session.user.id]);
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, msg: '비밀번호 변경 오류' });
  }
});

app.post('/api/payment-request', isLoggedIn, async (req, res) => {
  try {
    const { payer, amount, note } = req.body;
    await db.query(
      'INSERT INTO point_payments (user_id, payer, amount, note, status) VALUES (?, ?, ?, ?, "대기중")',
      [req.session.user.id, payer, amount, note]
    );
    // 100개 초과시 오래된 것 삭제
    await db.query(`
      DELETE FROM point_payments
      WHERE id NOT IN (SELECT id FROM (SELECT id FROM point_payments ORDER BY requested_at DESC LIMIT 100) tmp)
    `);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});


app.get('/api/admin/payment-list', isLoggedIn, isAdmin, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT p.id, u.name AS user_name, p.payer, p.amount, p.note, p.status, p.requested_at
       FROM point_payments p
       JOIN users u ON p.user_id = u.id
       ORDER BY p.requested_at DESC
       LIMIT 100`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ msg: '조회 오류', error: e.message });
  }
});

app.post('/api/admin/payment-complete', isLoggedIn, isAdmin, async (req, res) => {
  try {
    const { id } = req.body;
    await db.query('UPDATE point_payments SET status="완료" WHERE id=?', [id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});


// server.js (Express)
app.get(
  '/api/admin/uploads/:id/download',
  isLoggedIn, isAdmin, verifyOrigin,
  async (req, res, next) => {
    try {
      const [[row]] = await db.query(
        'SELECT s3_key, filename FROM uploads WHERE id = ?',
        [req.params.id]
      );
      if (!row) return res.status(404).send('업로드 없음');

      const key = row.s3_key;
      const origName = row.filename;

      // ⬇ 여기 추가
      res.set('Cache-Control', 'no-store');
      res.set('X-Robots-Tag', 'noindex, nofollow');

      const signedUrl = s3.getSignedUrl('getObject', {
        Bucket: process.env.AWS_S3_BUCKET,
        Key: key,
        Expires: 60,
        ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(origName)}`
      });

      return res.redirect(signedUrl);
    } catch (err) {
      console.error(err);
      next(err);
    }
  }
);

// 서버 실행
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`서버 실행 http://localhost:${PORT}`);
});

// ──────────────────────────────────────
//  정적 HTML “주소창 직접 접근” 제어  ※ express.static 위에 위치
// ──────────────────────────────────────
const PUBLIC_PAGES = [
  'login.html', 'resetpw.html', 'signup.html'
];

const MEMBER_ONLY_PAGES = [
  'index.html', 'home.html', 'problem_bank.html',
  'high.html', 'middle.html', 'bookcase.html',
  'upload.html', 'notice.html', 'profile.html'
];

const ADMIN_PAGES = [
  'admin.html', 'admin_files.html', 'admin_Membership.html',
  'admin_payment.html', 'admin_upload_review.html',
  'admin_review.html' // ← 추가
];


// 공개: 누구나 접근
for (const page of PUBLIC_PAGES) {
  app.get('/' + page, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', page));
  });
}

// 회원 전용: 로그인 필요
for (const page of MEMBER_ONLY_PAGES) {
  app.get('/' + page, isLoggedIn, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', page));
  });
}

// 관리자 전용
for (const page of ADMIN_PAGES) {
  app.get('/' + page, isLoggedIn, isAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', page));
  });
}

// 루트 접근: 미로그인 → 로그인 페이지로
app.get('/', (req, res) => {
  if (!req.session?.user) return res.redirect('/login.html');
  return res.redirect('/index.html'); // 필요 시 home.html 등으로 변경
});


 app.use(
   express.static(path.join(__dirname, 'public'), {
     setHeaders: (res, filePath) => {
       if (filePath.endsWith('.html')) {
         res.setHeader('Content-Type', 'text/html; charset=UTF-8');
       } else if (filePath.endsWith('.js')) {
         res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
       } else if (filePath.endsWith('.css')) {
         res.setHeader('Content-Type', 'text/css; charset=UTF-8');
       }
     }
   })
 );
 
