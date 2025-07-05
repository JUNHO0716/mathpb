import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import session from 'express-session';
import passport from 'passport';
import GoogleStrategy from 'passport-google-oauth20';
import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs/promises';
import fssync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fssync.existsSync(UPLOAD_DIR)) fssync.mkdirSync(UPLOAD_DIR);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const ext      = path.extname(file.originalname);         // .pdf …
    const basename = path.basename(file.originalname, ext);   // 원본이름
    const stamp    = Date.now() + '-' + Math.round(Math.random()*1e4);
    cb(null, `${basename}-${stamp}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB 제한 (필요시)
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png', '.hwp', '.doc', '.xls', '.xlsx', '.html', '.hwpx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('허용되지 않는 파일형식'));
  }
});

// ─── [추가] 로그인·관리자 체크 미들웨어 ───
function isLoggedIn(req, res, next) {
  if (req.session.user) return next();
  return res.status(401).json({ msg: '로그인 필요' });
}
function isAdmin(req, res, next) {
  if (req.session.user?.role === 'admin') return next();
  return res.status(403).json({ msg: '관리자 전용' });
}

const app = express();
app.use(cors({
  origin: [
    'https://mathpb.com',      // 실제 서비스 도메인
    'http://mathpb.com',       // http도 대비
    'http://localhost:3000',   // 개발용
    'http://localhost:5173'    // 개발용(vite)
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// 프리플라이트(OPTIONS) 요청까지 허용
app.options('*', cors());
app.use(session({
  secret: process.env.SESSION_SECRET,     // 나중에 .env로 숨겨도 됨
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 1000 * 60 * 60 * 2 }  // 2시간 유지
}));
app.use(express.json());

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

    // DB에 이미 있는 유저인지 확인
    const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);

    let user;
    if (rows.length) {
      user = rows[0];
    } else {
      // 없으면 새로 회원가입 처리
      await db.query(
        'INSERT INTO users (id, email, name, password, phone) VALUES (?, ?, ?, NULL, "")',
        [profile.id, email, name]
      );
      const [newUser] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
      user = newUser[0];
    }

      return done(null, {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatarUrl: profile.photos && profile.photos[0]?.value || null
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
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
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
      role: user.role || 'user'
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
// 업로드된 이미지 파일 접근
app.use('/uploads', express.static('uploads'));

// 공지 등록 (POST /api/notices) ─ 관리자만
app.post('/api/notices',
  isLoggedIn, isAdmin,
  upload.single('image'),
  async (req, res) => {
    const { title, content } = req.body;
    if (!title || !content)
      return res.status(400).json({ msg: '필수 입력값' });

    const imageUrl = req.file ? '/uploads/' + req.file.filename : null;
    const today    = new Date().toISOString().slice(0, 10);

    await db.query(
      'INSERT INTO notices (title, date, content, imageUrl) VALUES (?,?,?,?)',
      [title, today, content, imageUrl]
    );
    res.json({ msg: '공지 등록 성공' });
});

// 공지사항 목록 (제목, 날짜만)
app.get('/api/notices', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, title, date FROM notices ORDER BY date DESC, id DESC'
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ msg: '공지 불러오기 오류', error: e.message });
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
    app.post('/api/upload', isLoggedIn, isAdmin, upload.array('files'), async (req, res) => {
      try {
        const { region, district, school, grade, year, semester, title, level } = req.body;
        const files = req.files;
        if(!files || files.length === 0) return res.status(400).json({ message: '파일이 없습니다.' });

        // 확장자별로 구분
        let hwpFile = null, pdfFile = null;
        for (let f of files) {
          const ext = path.extname(f.originalname).toLowerCase();
          if (['.hwp', '.hwpx'].includes(ext)) hwpFile = f.filename;
          if (ext === '.pdf') pdfFile = f.filename;
        }

        await db.query(
          `INSERT INTO files 
            (region, district, school, grade, year, semester, title, hwp_filename, pdf_filename, level)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [region, district, school, grade, year, semester, title, hwpFile, pdfFile, level]
        );
        res.json({ message: '업로드 성공' });
      } catch (e) {
        res.status(500).json({ message: '서버 오류', error: e.message });
      }
    });

    // 파일 목록(필터/검색)
    app.get('/api/files', async (req, res) => {
      try {
        const { region, district, school, grade, year, semester, level } = req.query;
        let sql = "SELECT * FROM files WHERE 1=1";
        let params = [];
        if(region)   { sql += " AND region=?";   params.push(region); }
        if(district) { sql += " AND district=?"; params.push(district); }
        if(school)   { sql += " AND school=?";   params.push(school); }
        if(grade)    { sql += " AND grade=?";    params.push(grade); }
        if(year)     { sql += " AND year=?";     params.push(year); }
        if(semester) { sql += " AND semester=?"; params.push(semester); }
        if(level)    { sql += " AND level=?";    params.push(level); }
        sql += " ORDER BY uploaded_at DESC";
        const [rows] = await db.query(sql, params);
        res.json(rows);
      } catch (e) {
        res.status(500).json({ message: 'DB 오류', error: e.message });
      }
    });

    // 파일 다운로드
    // /download/:id?hwp OR ?pdf
    app.get('/download/:id', async (req, res) => {
      try {
        const [rows] = await db.query('SELECT hwp_filename, pdf_filename, title FROM files WHERE id=?', [req.params.id]);
        if (!rows.length) return res.status(404).send('파일 없음');
        const { hwp_filename, pdf_filename, title } = rows[0];

        // 어떤 타입인지 쿼리 파라미터로 지정 (예: /download/123?type=pdf)
        const type = req.query.type;
        let filename = null, ext = null;
        if (type === 'pdf') {
          filename = pdf_filename;
          ext = '.pdf';
        } else {
          // 기본값: hwp
          filename = hwp_filename;
          ext = '.hwp'; // hwpx도 hwp로 표시
          if (filename && filename.endsWith('.hwpx')) ext = '.hwpx';
        }
        if (!filename) return res.status(404).send('해당 형식 파일 없음');
        const filePath = path.join(__dirname, 'uploads', filename);

        // 한글 파일명 처리
        const downloadName = encodeURIComponent(title + ext);
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${downloadName}`);
        res.sendFile(filePath);
      } catch (e) {
        res.status(500).send('다운로드 오류');
      }
    });

    // 파일 정보 수정 (관리자)
    app.put('/api/files/:id', upload.array('files'), async (req, res) => {
      try {
        const { region, district, school, grade, year, semester, title, level } = req.body;
        const files = req.files || [];

        // 기존 파일명 조회
        const [[row]] = await db.query('SELECT hwp_filename, pdf_filename FROM files WHERE id=?', [req.params.id]);
        if (!row) return res.status(404).json({ message: '자료 없음' });

        let newHwp = row.hwp_filename, newPdf = row.pdf_filename;

        for (let f of files) {
          const ext = path.extname(f.originalname).toLowerCase();
          if (['.hwp', '.hwpx'].includes(ext)) {
            // 기존 파일 실제 삭제
            if (newHwp) { try { await fs.unlink(__dirname + '/uploads/' + newHwp); } catch (e) {} }
            newHwp = f.filename;
          }
          if (ext === '.pdf') {
            if (newPdf) { try { await fs.unlink(__dirname + '/uploads/' + newPdf); } catch (e) {} }
            newPdf = f.filename;
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
app.post('/api/board', upload.array('fileInput', 10), async (req, res) => {
  try {
    const { boardType, title, password, content } = req.body;
    // 첨부파일명(여러개 콤마로)
    const files = req.files && req.files.length > 0
      ? req.files.map(f => f.filename).join(',')
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

// 게시판 목록 (GET /api/board?type=ask OR type=upload)
app.get('/api/board', async (req, res) => {
  try {
    const type = req.query.type; // 'ask' or 'upload'
    const [rows] = await db.query(
      'SELECT id, title, created_at, files FROM board WHERE boardType=? ORDER BY id DESC',
      [type]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: '게시글 목록 오류', error: e.message });
  }
});

// 게시글 상세조회 (GET /api/board/:id)
app.get('/api/board/:id', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM board WHERE id=?', [req.params.id]);
    if (rows.length) res.json(rows[0]);
    else res.status(404).json({ message: '글 없음' });
  } catch (e) {
    res.status(500).json({ message: '글 상세 오류', error: e.message });
  }
});

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
          try { await fs.unlink(__dirname + '/uploads/' + f); } catch (e) {}
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

// 로그인 상태 확인 API
app.get('/check-auth', (req, res) => {
  if (req.session.user) {
    res.json({ isLoggedIn: true, user: req.session.user });
  } else {
    res.json({ isLoggedIn: false });
  }
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

// 로그인 후 콜백 처리
app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login.html' }),
  (req, res) => {
    req.session.user = req.user;  // 세션 저장
    res.redirect('/index.html'); // 로그인 성공 후 메인으로 이동
  }
);

app.use(express.static('public'));

// 파일 삭제 (관리자만)
app.delete('/api/files/:id', isLoggedIn, isAdmin, async (req, res) => {
  try {
    // 파일명 조회 (첨부파일 실제 삭제)
    const [[row]] = await db.query('SELECT hwp_filename, pdf_filename FROM files WHERE id=?', [req.params.id]);
    if (!row) return res.status(404).json({ message: '자료 없음' });

    // 실제 파일 삭제 (존재하면)
    if (row.hwp_filename) {
      try { await fs.unlink(path.join(__dirname, 'uploads', row.hwp_filename)); } catch (e) {}
    }
    if (row.pdf_filename) {
      try { await fs.unlink(path.join(__dirname, 'uploads', row.pdf_filename)); } catch (e) {}
    }

    // DB에서 삭제
    await db.query('DELETE FROM files WHERE id=?', [req.params.id]);
    res.json({ message: '삭제 성공' });
  } catch (e) {
    res.status(500).json({ message: '삭제 오류', error: e.message });
  }
});

app.post('/api/board_secure', upload.array('fileInput', 10), async (req, res) => {
  try {
    const { boardType, title, password, content } = req.body;
    const files = req.files && req.files.length > 0
      ? req.files.map(f => f.filename).join(',')
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

app.get('/api/board_secure', async (req, res) => {
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

app.post('/api/board_secure/:id/checkpw', async (req, res) => {
  try {
    const { password } = req.body;
    const [[row]] = await db.query('SELECT * FROM board_secure WHERE id=?', [req.params.id]);
    if (!row) return res.status(404).json({ message: '글 없음' });

    // 관리자
    if (req.session.user?.role === 'admin') {
      return res.json({ success: true, data: row });
    }

    const isMatch = await bcrypt.compare(password, row.password);
    if (!isMatch) return res.status(403).json({ message: '비밀번호 불일치' });

    res.json({ success: true, data: row });
  } catch (e) {
    res.status(500).json({ message: '비밀번호 확인 오류', error: e.message });
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


// 서버 실행
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`서버 실행 http://localhost:${PORT}`);
});