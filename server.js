const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs').promises;
const upload = multer({ dest: 'uploads/' });


const app = express();
app.use(cors());
app.use(express.static('public'));

const db = mysql.createPool({
  host: 'localhost',      // 여기에 본인 MySQL host (보통 localhost)
  user: 'root',           // 본인 MySQL 아이디
  password: '',           // 본인 MySQL 비밀번호 (없으면 빈칸)
  database: 'userdb',     // 위에서 만든 DB 이름
  port: 3306,             // 보통 3306
});

// 회원가입 (POST /register)
app.post('/register', async (req, res) => {
  const { email, password, name, phone } = req.body;
  if (!email || !password || !name || !phone) return res.status(400).json({ msg: "필수 입력값" });
  try {
    const hash = await bcrypt.hash(password, 10);
    await db.query(
      'INSERT INTO users (email, password, name, phone) VALUES (?, ?, ?, ?)',
      [email, hash, name, phone]
    );
    res.json({ msg: "회원가입 성공" });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      res.status(409).json({ msg: "이미 존재하는 이메일" });
    } else {
      res.status(500).json({ msg: "서버 오류", error: e.message });
    }
  }
});

// 로그인 (POST /login)
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const [rows] = await db.query('SELECT * FROM users WHERE email=?', [email]);
    if (!rows.length) return res.status(401).json({ msg: "이메일 또는 비밀번호 오류" });
    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ msg: "이메일 또는 비밀번호 오류" });
    res.json({ msg: "로그인 성공" });
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

// 공지 등록 (제목/내용/이미지)
app.post('/api/notices', upload.single('image'), async (req, res) => {
  const { title, content } = req.body;
  const imageUrl = req.file ? '/uploads/' + req.file.filename : null;
  const today = new Date().toISOString().slice(0,10);
  // 컬럼 순서 반드시 맞춰야 제대로 들어감!
await db.query(
  'INSERT INTO notices (title, date, content, imageUrl) VALUES (?, ?, ?, ?)',
  [title, today, content, imageUrl]
);
  res.json({ msg: "공지 등록 성공" });
});

// 공지사항 목록 (제목, 날짜만)
app.get('/api/notices', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, title, date FROM notices ORDER BY date DESC, id DESC LIMIT 10'
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

// 공지 삭제
app.delete('/api/notices/:id', async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM notices WHERE id=?', [req.params.id]);
    if (result.affectedRows > 0) {
      res.json({ msg: "삭제 성공" });
    } else {
      res.status(404).json({ msg: "공지 없음" });
    }
  } catch (e) {
    res.status(500).json({ msg: "공지 삭제 오류", error: e.message });
  }
});
// 파일 업로드 (관리자용)
app.post('/api/upload', upload.array('files'), async (req, res) => {
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
      const path = __dirname + '/uploads/' + filename;
      try { await fs.unlink(path); } catch (e) {}
    }

    res.json({ message: "삭제 성공" });
  } catch (e) {
    res.status(500).json({ message: "삭제 오류", error: e.message });
  }
});
// 자료 정보 수정
app.put('/api/files/:id', async (req, res) => {
  try {
    const { region, district, school, grade, year, semester, title } = req.body;
    const [result] = await db.query(
      `UPDATE files SET region=?, district=?, school=?, grade=?, year=?, semester=?, title=? WHERE id=?`,
      [region, district, school, grade, year, semester, title, req.params.id]
    );
    if (result.affectedRows > 0) {
      res.json({ message: '수정 성공' });
    } else {
      res.status(404).json({ message: '자료 없음' });
    }
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

// 서버 실행
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`서버 실행 http://localhost:${PORT}`);
});