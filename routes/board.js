import express from 'express';
import bcrypt from 'bcrypt';
import db from '../config/database.js';
import { s3, fileUpload, deleteS3 } from '../config/s3.js';
import { isLoggedIn } from '../middleware/auth.js';
import { verifyOrigin, boardDownloadLimiter } from '../middleware/security.js';
import { numericIdxParam } from '../middleware/validators.js';

const router = express.Router();

// 일반 게시판 글 등록
router.post('/', isLoggedIn, verifyOrigin, fileUpload.array('fileInput', 10), async (req, res) => {
  try {
    const { boardType, title, password, content } = req.body;
    const files = req.files && req.files.length > 0
      ? req.files.map(f => f.key).join(',')
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

// 일반 게시판 목록
router.get('/', isLoggedIn, verifyOrigin, async (req, res) => {
  try {
    const type = req.query.type;
    const [rows] = await db.query(
      'SELECT id, title, content, created_at, files FROM board WHERE boardType=? ORDER BY id DESC',
      [type]
    );
    const sanitized = rows.map(r => ({
      id: r.id,
      title: r.title,
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

// 일반 게시판 상세
router.get('/:id', isLoggedIn, verifyOrigin, async (req, res) => {
  try {
    const [[row]] = await db.query('SELECT * FROM board WHERE id=?', [req.params.id]);
    if (!row) return res.status(404).json({ message: '글 없음' });
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
    res.json(sanitized);
  } catch (e) {
    res.status(500).json({ message: '게시글 상세 오류', error: e.message });
  }
});

// 일반 게시판 첨부파일 다운로드
router.get('/:id/attachment/:idx', isLoggedIn, verifyOrigin, boardDownloadLimiter, numericIdxParam, async (req, res) => {
    const postId = Number(req.params.id);
    const idx = Number(req.params.idx);
    const [[row]] = await db.query('SELECT title, files FROM board WHERE id=?', [postId]);
    if (!row) return res.status(404).send('글 없음');
    const keys = (row.files || '').split(',').map(s => s.trim()).filter(Boolean);
    const key = keys[idx];
    if (!key) return res.status(404).send('첨부 없음');
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

// 일반 게시판 글 삭제
router.post('/:id/delete', async (req, res) => {
  try {
    const { password } = req.body;
    const [rows] = await db.query('SELECT * FROM board WHERE id=?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: '글 없음' });

    if (rows[0].password && password !== rows[0].password) {
      return res.status(403).json({ message: '비밀번호 불일치' });
    }
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

// 보안 게시판 글 등록
router.post('/secure', fileUpload.array('fileInput', 10), async (req, res) => {
  try {
    const { boardType, title, password, content } = req.body;
    const files = req.files && req.files.length > 0 ? req.files.map(f => f.key).join(',') : '';
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

// 보안 게시판 목록
router.get('/secure', isLoggedIn, verifyOrigin, async (req, res) => {
  try {
    const type = req.query.type;
    const [rows] = await db.query(
      'SELECT id, title, created_at FROM board_secure WHERE boardType=? ORDER BY id DESC',
      [type]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: '보안 게시글 목록 오류', error: e.message });
  }
});

// 보안 게시판 비밀번호 확인
router.post('/secure/:id/checkpw', async (req, res) => {
  try {
    const { password } = req.body;
    const [[row]] = await db.query('SELECT * FROM board_secure WHERE id=?', [req.params.id]);
    if (!row) return res.status(404).json({ message: '글 없음' });
    const isMatch = await bcrypt.compare(password, row.password);
    if (!isMatch) return res.status(403).json({ message: '비밀번호 틀림' });
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

// 보안 게시판 글 삭제
router.post('/secure/:id/delete', async (req, res) => {
  try {
    const { password } = req.body;
    const [[row]] = await db.query('SELECT * FROM board_secure WHERE id=?', [req.params.id]);
    if (!row) return res.status(404).json({ message: '글 없음' });
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

// 보안 게시판 첨부파일 다운로드
router.get('/secure/:id/attachment/:idx', isLoggedIn, verifyOrigin, boardDownloadLimiter, numericIdxParam, async (req, res) => {
    const postId = Number(req.params.id);
    const idx = Number(req.params.idx);
    const [[row]] = await db.query('SELECT title, files FROM board_secure WHERE id=?', [postId]);
    if (!row) return res.status(404).send('글 없음');
    const keys = (row.files || '').split(',').map(s => s.trim()).filter(Boolean);
    const key = keys[idx];
    if (!key) return res.status(404).send('첨부 없음');
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


export default router;