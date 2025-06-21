require('dotenv').config(); // 이 줄을 맨 위에 추가!

const path = require('path');

const UPLOAD_DIR = path.join(__dirname, 'uploads');
const fsSync = require('fs');   // fs.promises 말고 동기 fs
if (!fsSync.existsSync(UPLOAD_DIR)) fsSync.mkdirSync(UPLOAD_DIR);
const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const cors = require('cors');
const multer  = require('multer');
const fs = require('fs').promises;
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
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
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png', '.hwp', '.doc', '.xls', '.xlsx'];
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
  origin: ['https://mathpb.com'],  // 실제 도메인 주소만!
  credentials: true
}));
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
      role: user.role
    });
  } catch (err) {
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
  const { email, password } = req.body;
  try {
    const [rows] = await db.query('SELECT * FROM users WHERE email=?', [email]);
    if (!rows.length) return res.status(401).json({ msg: "이메일 또는 비밀번호 오류" });

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ msg: "이메일 또는 비밀번호 오류" });

    // ✅ 로그인 성공: 세션에 사용자 정보 저장
    req.session.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role || 'user'  // 관리자 여부 포함
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

// 파일 업로드 (관리자용)
app.post('/api/upload', isLoggedIn, isAdmin, upload.array('files'), async (req, res) => {
  try {
    const { region, district, school, grade, year, semester, title, level } = req.body;
    const files = req.files;
    if(!files || files.length === 0) return res.status(400).json({ message: '파일이 없습니다.' });

    for(let f of files) {
      await db.query(
        `INSERT INTO files (region, district, school, grade, year, semester, title, filename, level)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [region, district, school, grade, year, semester, title, f.filename, level]
      );
    }
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
    if(level)    { sql += " AND level=?"; params.push(level); }
    sql += " ORDER BY uploaded_at DESC";
    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: 'DB 오류', error: e.message });
  }
});
// 파일 삭제 API (DB에서 삭제 + 실제 파일도 삭제)
app.delete('/api/files/:id', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT filename FROM files WHERE id=?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: "자료 없음" });
    const filename = rows[0].filename;

    // DB에서 자료 삭제
    await db.query('DELETE FROM files WHERE id=?', [req.params.id]);

    // 실제 파일도 uploads 폴더에서 삭제
    if (filename) {
    const filePath = __dirname + '/uploads/' + filename;
    try { await fs.unlink(filePath); } catch (e) {}
    }

    res.json({ message: "삭제 성공" });
      } catch (e) {
        res.status(500).json({ message: "삭제 오류", error: e.message });
      }
    });
    // 자료 정보 수정
    app.put('/api/files/:id', upload.single('file'), async (req, res) => {
      try {
        const { region, district, school, grade, year, semester, title, level } = req.body;

        // 1) 기존 파일명 조회
        const [[row]] = await db.query('SELECT filename FROM files WHERE id=?', [req.params.id]);
        if (!row) return res.status(404).json({ message: '자료 없음' });

        // 2) 파일 교체가 있을 때는 기존 파일 삭제 후 DB에 새 파일명 반영
        let newFileName = row.filename;              // 기본값 = 기존 파일 유지
        if (req.file) {
          // 기존 파일 실제 삭제 (실패-무시)
          try { await fs.unlink(__dirname + '/uploads/' + row.filename); } catch(e){}
          newFileName = req.file.filename;
        }

        // 3) DB 업데이트
        await db.query(
          `UPDATE files
            SET region=? , district=? , school=? , grade=? ,
                year=?   , semester=? , title=?  , level=? , filename=?
          WHERE id=?`,
          [region, district, school, grade, year, semester, title, level, newFileName, req.params.id]
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
    res.redirect('/main_home.html'); // 로그인 성공 후 메인으로 이동
  }
);

app.use(express.static('public'));

// 서버 실행
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`서버 실행 http://localhost:${PORT}`);
});