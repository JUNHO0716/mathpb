import express from 'express';
import path from 'path';
import db from '../config/database.js';
import { s3, fileUpload, deleteS3 } from '../config/s3.js';
import { isLoggedIn, isAdmin } from '../middleware/auth.js';
import { verifyOrigin } from '../middleware/security.js';

const router = express.Router();

// 미들웨어: 이 파일의 모든 라우트는 isLoggedIn, isAdmin을 통과해야 함
router.use(isLoggedIn, isAdmin);

// 사용자 목록
router.get('/users', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT id, email, name, created_at, is_subscribed, subscription_start, subscription_end,
             academyName, academyPhone, bizNum
      FROM users
      ORDER BY created_at DESC
    `);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: '회원 목록 조회 오류', error: e.message });
  }
});

// 사용자 구독 상태 변경
router.post('/update-subscription', async (req, res) => {
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

// 자료실 파일 업로드
router.post('/upload', verifyOrigin, fileUpload.array('files'), async (req, res) => {
  try {
    const { region, district, school, grade, year, semester, title, level } = req.body;
    const files = req.files;
    if(!files || files.length === 0) return res.status(400).json({ message: '파일이 없습니다.' });

    let hwpKey = null, pdfKey = null;
    for (const f of files) {
      const ext = path.extname(f.originalname).toLowerCase();
      if (['.hwp', '.hwpx'].includes(ext)) hwpKey = f.key;
      if (ext === '.pdf') pdfKey = f.key;
    }

    await db.query(
      `INSERT INTO files (region, district, school, grade, year, semester, title, hwp_filename, pdf_filename, level)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [region, district, school, grade, year, semester, title, hwpKey, pdfKey, level]
    );
    res.json({ message: '업로드 성공' });
  } catch (e) {
    res.status(500).json({ message: '서버 오류', error: e.message });
  }
});

// 자료실 파일 수정
router.put('/files/:id', fileUpload.array('files'), async (req, res) => {
  try {
    const { region, district, school, grade, year, semester, title, level } = req.body;
    const files = req.files || [];
    if (!files.length) {
      await db.query(`
        UPDATE files SET region=?, district=?, school=?, grade=?, year=?,
          semester=?, title=?, level=? WHERE id=?`,
        [region, district, school, grade, year, semester, title, level, req.params.id]
      );
      return res.json({ message: '수정 완료(파일 변경 없음)' });
    }

    const [[row]] = await db.query('SELECT hwp_filename, pdf_filename FROM files WHERE id=?', [req.params.id]);
    if (!row) return res.status(404).json({ message: '자료 없음' });

    let newHwp = row.hwp_filename, newPdf = row.pdf_filename;
    for (let f of files) {
      const ext = path.extname(f.originalname).toLowerCase();
      if (['.hwp', '.hwpx'].includes(ext)) {
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

// 자료실 파일 삭제
router.delete('/files/:id', async (req, res) => {
  try {
    const [[row]] = await db.query('SELECT hwp_filename, pdf_filename FROM files WHERE id=?', [req.params.id]);
    if (!row) return res.status(404).json({ message: '자료 없음' });

    if (row.hwp_filename) { try { await deleteS3(row.hwp_filename); } catch (e) {} }
    if (row.pdf_filename) { try { await deleteS3(row.pdf_filename); } catch (e) {} }

    await db.query('DELETE FROM files WHERE id=?', [req.params.id]);
    res.json({ message: '삭제 성공' });
  } catch (e) {
    res.status(500).json({ message: '삭제 오류', error: e.message });
  }
});

// 사용자 업로드 목록 (관리자용)
router.get('/uploads', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, user_id, filename, status, reject_reason, uploaded_at, completed_at
       FROM uploads ORDER BY uploaded_at DESC`
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ msg: '관리자 업로드 조회 실패' });
  }
});

// 사용자 업로드 상태 변경
router.patch('/uploads/:id', express.json(), async (req, res) => {
  try {
    const { status, reason } = req.body;
    const id = req.params.id;
    let sql, params;
    if (status === 'in_progress') {
      sql = 'UPDATE uploads SET status=? WHERE id=?'; params = ['제작중', id];
    } else if (status === 'rejected') {
      sql = 'UPDATE uploads SET status=?, reject_reason=? WHERE id=?'; params = ['반려', reason || '', id];
    } else if (status === 'completed') {
      sql = 'UPDATE uploads SET status=?, completed_at=NOW() WHERE id=?'; params = ['완료', id];
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
});

// 사용자 업로드 파일 다운로드
router.get('/uploads/:id/download', verifyOrigin, async (req, res, next) => {
  try {
    const [[row]] = await db.query('SELECT s3_key, filename FROM uploads WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).send('업로드 없음');
    const key = row.s3_key;
    const origName = row.filename;
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
});

// 포인트 결제 요청 목록
router.get('/payment-list', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT p.id, u.name AS user_name, p.payer, p.amount, p.note, p.status, p.requested_at
       FROM point_payments p JOIN users u ON p.user_id = u.id
       ORDER BY p.requested_at DESC LIMIT 100`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ msg: '조회 오류', error: e.message });
  }
});

// 포인트 결제 완료 처리
router.post('/payment-complete', async (req, res) => {
  try {
    const { id } = req.body;
    await db.query('UPDATE point_payments SET status="완료" WHERE id=?', [id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;