import express from 'express';
import path from 'path';
import db from '../config/database.js';
import { s3 } from '../config/s3.js';
import { isLoggedIn, isLoggedInJson } from '../middleware/auth.js';
import { verifyOrigin, downloadLimiter } from '../middleware/security.js';
import { numericIdParam } from '../middleware/validators.js';

const router = express.Router();

// 파일 목록 (필터/검색)
router.get('/api/files', isLoggedInJson, verifyOrigin, async (req, res) => {
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
      memo: r.memo,
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
router.get('/api/download/:id', downloadLimiter, numericIdParam, isLoggedIn, verifyOrigin, async (req, res) => {
    const user = req.session.user;
    if (!user) return res.status(403).send('권한이 없습니다.');

    const [[dbUser]] = await db.query('SELECT is_subscribed, role FROM users WHERE id=?', [user.id]);
    if (!(dbUser.role === 'admin' || dbUser.is_subscribed == 1)) {
      return res.status(403).send('권한이 없습니다.');
    }

    try {
      const [rows] = await db.query('SELECT hwp_filename, pdf_filename, title FROM files WHERE id=?', [req.params.id]);
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

// 파일 다운로드 로그
router.post('/api/download-log', isLoggedIn, verifyOrigin, async (req, res) => {
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

// 다운로드 통계
router.get('/api/downloads/stats', isLoggedIn, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT
          COUNT(DISTINCT l.file_id) AS total,
          COUNT(CASE WHEN f.grade LIKE '고%' THEN 1 END) AS highSchool,
          COUNT(CASE WHEN f.grade LIKE '중%' THEN 1 END) AS middleSchool
       FROM downloads_log l
       JOIN files f ON l.file_id = f.id
       WHERE l.user_email = ?`,
      [req.session.user.email]
    );
    res.json(rows[0] || { total: 0, highSchool: 0, middleSchool: 0 });
  } catch (e) {
    console.error('downloads-stats 조회 오류:', e);
    res.status(500).json({ msg: '통계 조회 실패' });
  }
});

// 최근 다운로드
router.get('/api/downloads/recent', isLoggedIn, verifyOrigin, async (req, res) => {
  try {
    const sessionEmail = req.session.user.email;
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

// 최근 업로드 (id 포함)
router.get('/api/uploads/recent', isLoggedIn, verifyOrigin, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, title AS name, DATE_FORMAT(uploaded_at, '%Y-%m-%d') AS date
       FROM files
       ORDER BY uploaded_at DESC
       LIMIT 10`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: '업로드 목록 오류', error: e.message });
  }
});

// 파일 상세 조회
router.get('/api/files/:id', isLoggedInJson, verifyOrigin, async (req, res) => {
  try {
    const fileId = req.params.id;
    const [rows] = await db.query(`
      SELECT id, region, district, school, grade, year, semester, title, level,
             uploaded_at, subject, memo, hwp_filename, pdf_filename
      FROM files
      WHERE id = ?
      LIMIT 1
    `, [fileId]);

    if (!rows.length) {
      return res.status(404).json({ message: '파일 없음' });
    }

    const r = rows[0];
    res.set('Cache-Control', 'no-store');
    res.set('X-Robots-Tag', 'noindex, nofollow');

    return res.json({
      id: r.id,
      region: r.region,
      district: r.district,
      school: r.school,
      grade: r.grade,
      year: r.year,
      semester: r.semester,
      subject: r.subject,
      title: r.title,
      level: r.level,
      uploaded_at: r.uploaded_at,
      memo: r.memo,
      files: {
        pdf: !!r.pdf_filename,
        hwp: !!r.hwp_filename
      }
    });
  } catch (e) {
    res.status(500).json({ message: 'DB 오류', error: e.message });
  }
});



// [신규 추가] 자료실 파일 메모 저장/수정
router.patch('/api/files/:id/memo', isLoggedIn, async (req, res) => {
  try {
    const fileId = req.params.id;
    const { memo } = req.body;

    if (memo === undefined) {
      return res.status(400).json({ msg: '메모 내용이 없습니다.' });
    }

    const [result] = await db.query(
      'UPDATE files SET memo = ? WHERE id = ?',
      [memo, fileId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ msg: '해당 파일을 찾을 수 없습니다.' });
    }

    res.json({ msg: '메모가 성공적으로 저장되었습니다.' });

  } catch (err) {
    console.error('PATCH /api/files/:id/memo error:', err);
    res.status(500).json({ msg: '메모 저장 중 서버 오류가 발생했습니다.' });
  }
});

export default router;