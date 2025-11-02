import express from 'express';
import db from '../config/database.js';

const router = express.Router();

function requireLogin(req, res, next) {
  if (req.user) return next();
  return res.status(401).json({ error: 'unauthorized' });
}

// 내 메모 조회
router.get('/api/my/memos/:fileId', requireLogin, async (req, res) => {
  try {
    const uid = String(
      req.user.id ?? req.user.user_id ?? req.user.username ?? req.session?.user?.id
    );
    const fid = String(req.params.fileId);

    const [rows] = await db.query(
      'SELECT memo FROM file_memos WHERE user_id=? AND file_id=? LIMIT 1',
      [uid, fid]
    );
    return res.json({ memo: rows.length ? rows[0].memo : '' });
  } catch (err) {
    console.error('[myMemos:get]', err);
    return res.status(500).json({ error: 'get_failed' });
  }
});

// 내 메모 저장(Upsert)
router.patch('/api/my/memos/:fileId', requireLogin, async (req, res) => {
  try {
    const uid = String(
      req.user.id ?? req.user.user_id ?? req.user.username ?? req.session?.user?.id
    );
    const fid = String(req.params.fileId);
    const memo = (req.body?.memo ?? '').toString();

    await db.query(
      `INSERT INTO file_memos (user_id, file_id, memo)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE memo=VALUES(memo), updated_at=CURRENT_TIMESTAMP`,
      [uid, fid, memo]
    );
    return res.json({ ok: true, memo });
  } catch (err) {
    console.error('[myMemos:patch]', err);
    return res.status(500).json({ error: 'upsert_failed' });
  }
});

export default router;
