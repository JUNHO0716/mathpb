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
      req.user?.id ??
      req.user?.user_id ??
      req.user?.username ??
      req.session?.user?.id
    );
    const fid = String(req.params.fileId);

    const [rows] = await db.query(
      `
      SELECT
        fm.memo,
        fm.created_at,
        fm.updated_at,
        fm.user_id AS raw_user_id,
        u.id       AS user_pk,
        u.email    AS user_email,
        u.name     AS user_name
      FROM file_memos AS fm
      LEFT JOIN users AS u
        ON (
          BINARY fm.user_id = BINARY u.id OR
          BINARY fm.user_id = BINARY u.email
        )
      WHERE fm.user_id = ?
        AND fm.file_id = ?
      ORDER BY fm.updated_at DESC, fm.created_at DESC
      LIMIT 1
      `,
      [uid, fid]
    );

    // 메모가 아직 없을 때도 현재 로그인 유저 정보는 내려주기
    if (!rows.length) {
      const u = req.session?.user || req.user || {};
      return res.json({
        memo: '',
        user_id:   u.id   ?? null,
        user_name: u.name ?? null,
        user_email:u.email?? null,
        created_at: null,
        updated_at: null
      });
    }

    const r = rows[0];
    return res.json({
      memo:       r.memo       || '',
      // 조인 성공하면 user_pk 사용, 아니면 file_memos.user_id 그대로 사용
      user_id:    r.user_pk    || r.raw_user_id || null,
      user_name:  r.user_name  || null,
      user_email: r.user_email || null,
      created_at: r.created_at || null,
      updated_at: r.updated_at || null
    });
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
