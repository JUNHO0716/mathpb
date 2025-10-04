// 📄 routes/notices.js (새로 만들기)

import express from 'express';
import db from '../config/database.js';
import { isLoggedIn, isAdmin } from '../middleware/auth.js';
import { fileUpload } from '../config/s3.js';

const router = express.Router();

// 1. 공지사항 목록 보기 (GET /api/notices) - 누구나
router.get('/', async (req, res) => {
  try {
    // ▼▼▼ WHERE category = ? 조건 삭제 ▼▼▼
    const [rows] = await db.query(
      'SELECT * FROM notices ORDER BY id DESC'
    );
    // ▲▲▲ 카테고리 필터링 제거 ▲▲▲
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'DB 오류' });
  }
});

// 2. 공지사항 상세 보기 (GET /api/notices/:id) - 누구나
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM notices WHERE id=?', [req.params.id]);
    if (rows.length) res.json(rows[0]);
    else res.status(404).json({ msg: "공지 없음" });
  } catch (e) {
    res.status(500).json({ msg: "공지 상세 오류", error: e.message });
  }
});

// --- 여기서부터는 관리자 전용 기능 ---

// 3. 공지 등록 (POST /api/notices) - 관리자만
router.post('/', isLoggedIn, isAdmin, fileUpload.single('image'), async (req, res) => {
  const { title, content, category } = req.body;
  if (!title || !content) return res.status(400).json({ msg: '필수 입력값' });

  const imageUrl = req.file ? req.file.location : null;
  const today    = new Date().toISOString().slice(0, 10);

  await db.query(
    'INSERT INTO notices (title, date, content, imageUrl, category) VALUES (?,?,?,?,?)',
    [title, today, content, imageUrl, category || '공지']
  );
  res.json({ msg: '공지 등록 성공' });
});

// 4. 공지 삭제 (DELETE /api/notices/:id) - 관리자만
router.delete('/:id', isLoggedIn, isAdmin, async (req, res) => {
  const [r] = await db.query('DELETE FROM notices WHERE id=?', [req.params.id]);
  if (r.affectedRows) return res.json({ msg: '삭제 성공' });
  res.status(404).json({ msg: '공지 없음' });
});

export default router;