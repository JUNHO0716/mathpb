import dotenv from 'dotenv';
dotenv.config();

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import passport from 'passport';
import GoogleStrategy from 'passport-google-oauth20';
import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';
import cors from 'cors';
import AWS from 'aws-sdk';
import multer from 'multer';
import multerS3 from 'multer-s3';
import express from 'express';
import session from 'express-session';

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
  if (req.session.user) return next();
  return res.status(401).json({ msg: '로그인 필요' });
}
function isAdmin(req, res, next) {
  if (req.session.user?.role === 'admin') return next();
  return res.status(403).json({ msg: '관리자 전용' });
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
    const { title, content } = req.body;
    if (!title || !content)
      return res.status(400).json({ msg: '필수 입력값' });

    const imageUrl = req.file ? req.file.location : null;   // S3 URL
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
    app.post('/api/upload', isLoggedIn, isAdmin, fileUpload.array('files'), async (req,res)=> {
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

    // 파일 목록(필터/검색)
    app.get('/api/files', async (req, res) => {
      try {
        const { region, district, school, grade, year, semester, level } = req.query;
        let sql = "SELECT * FROM files WHERE 1=1";
        let params = [];
        if(region)   { sql += " AND region=?";   params.push(region); }
        if(district) { sql += " AND district=?"; params.push(district); }
        if(school)   { sql += " AND school=?";   params.push(school); }
        if (grade !== '' && grade !== undefined) {
            sql += " AND grade = ?";
            params.push(grade);
          }
        if(year)     { sql += " AND year=?";     params.push(year); }
        if(semester) { sql += " AND semester=?"; params.push(semester); }
        if(level)    { sql += " AND level=?";    params.push(level); }
        sql += " ORDER BY uploaded_at DESC";
        const [rows] = await db.query(sql, params);

        // rows 배열을 프론트 요구형태로 가공!
        const newRows = rows.map(r => ({
          ...r,
          files: {
            pdf: !!r.pdf_filename,      // 파일이 있으면 true, 없으면 false
            hwp: !!r.hwp_filename
          }
        }));

        res.json(newRows);
      } catch (e) {
        res.status(500).json({ message: 'DB 오류', error: e.message });
      }
    });

    // 파일 다운로드
    // /download/:id?hwp OR ?pdf
app.get('/api/download/:id', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT hwp_filename, pdf_filename, title FROM files WHERE id=?',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).send('파일 없음');
    const { hwp_filename, pdf_filename, title } = rows[0];

    const type = req.query.type;
    let filename = null, ext = null;
    if (type === 'pdf') {
      filename = pdf_filename;
      ext = '.pdf';
    } else {
      filename = hwp_filename;
      ext = '.hwp';
      if (filename && filename.endsWith('.hwpx')) ext = '.hwpx';
    }
    if (!filename) return res.status(404).send('해당 형식 파일 없음');

    const downloadFileName = `${title}${ext}`;
    console.log('다운로드시 파일명:', downloadFileName); // 실제 찍어보기

    const signed = s3.getSignedUrl('getObject', {
      Bucket: process.env.AWS_S3_BUCKET,
      Key: filename,
      Expires: 60,
      ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(downloadFileName)}`
    });
    return res.redirect(signed);
  } catch (e) {
    console.error('다운로드 오류:', e);
    res.status(500).send('다운로드 오류');
  }
});

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
app.post('/api/board',  fileUpload.array('fileInput', 10), async (req, res) => {
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

// 로그인 상태 확인 API
app.get('/check-auth', async (req, res) => {
  if (req.session.user) {
    // 세션 정보로 DB에서 avatarUrl을 다시 읽어옴
    const [rows] = await db.query('SELECT avatarUrl FROM users WHERE id = ?', [req.session.user.id]);
    const avatarUrl = rows.length && rows[0].avatarUrl ? rows[0].avatarUrl : '/icon_my_b.png';
    req.session.user.avatarUrl = avatarUrl; // 세션에도 업데이트
    return res.json({ isLoggedIn: true, user: { ...req.session.user, avatarUrl } });
  }
  res.json({ isLoggedIn: false });
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

// ──────────────────────────────────────
//  관리자만 접근 가능한 정적 페이지
// ──────────────────────────────────────
app.get('/admin_upload.html', isLoggedIn, isAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin_upload.html'));
});

app.get('/admin_files.html',  isLoggedIn, isAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin_files.html'));
});

app.use(express.static('public'));

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
app.get('/api/uploads/recent', async (req, res) => {
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


// 서버 실행
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`서버 실행 http://localhost:${PORT}`);
});

