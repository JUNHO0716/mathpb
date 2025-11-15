import express from 'express';
import path from 'path';
import db from '../config/database.js';
import { s3, fileUpload } from '../config/s3.js';
import { isLoggedIn, isAdmin, requirePlan } from '../middleware/auth.js';
import { verifyOrigin, downloadLimiter } from '../middleware/security.js';
import { numericIdParam } from '../middleware/validators.js';

const router = express.Router();

// 관리자 판별(세션/미들웨어 차이 모두 흡수)
async function ensureAdmin(req, res, next) {
  try {
    const u = req.session?.user || req.user || {};
    // 세션으로 먼저 판정
    if (u?.id && (u.role === 'admin' || u.isAdmin == 1 || u.is_admin == 1)) {
      return next();
    }
    // 세션이 애매하면 DB로 최종 확인
    if (!u?.id) return res.status(401).json({ success:false, message:'로그인이 필요합니다.' });
    const [[row]] = await db.query('SELECT role, is_admin FROM users WHERE id = ?', [u.id]);
    if (row && (row.role === 'admin' || row.is_admin == 1)) {
      // 세션에도 동기화
      if (req.session?.user) {
        req.session.user.role = row.role || req.session.user.role;
        req.session.user.is_admin = row.is_admin ? 1 : 0;
        req.session.user.isAdmin  = row.is_admin ? 1 : 0;
      }
      return next();
    }
    return res.status(403).json({ success:false, message:'관리자 전용' });
  } catch (e) {
    console.error('ensureAdmin error:', e);
    return res.status(500).json({ success:false, message:'권한 확인 실패' });
  }
}


// /routes/files.js (12행 근처)
// 파일 목록 (필터/검색)
router.get('/api/files', verifyOrigin, async (req, res) => {
  try {
    // ✅ 1. subject 파라미터를 받습니다.
    const { region, district, school, grade, year, semester, level, subject, exam_type } = req.query;
    let sql = "SELECT * FROM files WHERE 1=1";
    const params = [];
    if(region)   { sql += " AND region=?";   params.push(region); }
    if(district) { sql += " AND district=?"; params.push(district); }
    if(school)   { sql += " AND school=?";   params.push(school); }
    if (grade !== '' && grade !== undefined) { sql += " AND grade=?"; params.push(grade); }
    if(year)     { sql += " AND year=?";     params.push(year); }
    if(semester) { sql += " AND semester=?"; params.push(semester); }
    if(exam_type)  { sql += " AND exam_type=?";  params.push(exam_type); }
    if(level)    { sql += " AND level=?";    params.push(level); }
    if(subject)  { sql += " AND subject=?";  params.push(subject); } // ✅ 2. subject 쿼리 추가
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
      exam_type: r.exam_type,
      title: r.title,
      level: r.level,
      subject: r.subject, // ✅ 3. subject를 응답에 포함
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
router.get('/api/download/:id', downloadLimiter, numericIdParam, requirePlan('basic'), verifyOrigin, async (req, res) => {
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
});

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
          COUNT(CASE WHEN f.level='고등' THEN 1 END) AS highSchool,
          COUNT(CASE WHEN f.level='중등' THEN 1 END) AS middleSchool
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
      JOIN files f ON f.id = l.file_id
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

// 파일 상세 조회 (공개)
router.get('/api/files/:id', verifyOrigin, async (req, res) => {
  try {
    const fileId = req.params.id;
    const [rows] = await db.query(`
    SELECT id, region, district, school, grade, year, semester, exam_type, title, level,
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
      exam_type: r.exam_type,
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

// 관리자 전용 시험지 업로드 (admin_upload.html이 사용)
// 관리자 전용 시험지 업로드 (admin_upload.html이 사용)
router.post('/api/admin/exam-upload',
  isLoggedIn, ensureAdmin, verifyOrigin,
  fileUpload.single('file'),
  async (req, res) => {
    try {
      const meta = JSON.parse(req.body.meta_json || '{}');

      // 1) S3 키/확장자 → hwp/pdf 분기
      const s3Key = req.file?.key || '';
      const ext = (req.file?.originalname || '').split('.').pop().toLowerCase();
      const hwpKey = (ext === 'hwp' || ext === 'hwpx') ? s3Key : null;
      const pdfKey = (ext === 'pdf') ? s3Key : null;

      const clean = v => (v === '' || v === undefined ? null : v);

      // 2) 교명·관 정보 정리 (프론트에서 넘어온 값 우선 사용)
      let schoolFull = clean(meta.school);        // 예: '수지고등학교'
      let levelFinal = clean(meta.level);         // '고등' | '중등' | null

      // 파일명·교명으로 관(고등/중등) 유추
      const inferLevelFromSchool = (name) => {
        if (!name) return null;
        if (/고등학교/.test(name) || /고등\b/.test(name)) return '고등';
        if (/중학교/.test(name) || /중학\b/.test(name))   return '중등';
        return null;
      };

      if (!levelFinal) {
        levelFinal = inferLevelFromSchool(schoolFull);
      }

      // 프론트에서 교명을 짧게 보냈을 수도 있으니, 여기서도 한 번 보강
      const expandSchool = (name, levelHint) => {
        if (!name) return null;
        if (/고등학교$|중학교$/.test(name)) return name;
        if (levelHint === '고등') return name.replace(/\s+/g,'') + '고등학교';
        if (levelHint === '중등') return name.replace(/\s+/g,'') + '중학교';
        if (/여고$/.test(name))  return name.replace(/여고$/, '여자고등학교');
        if (/여중$/.test(name))  return name.replace(/여중$/, '여자중학교');
        if (/고$/.test(name))    return name + '등학교';
        if (/중$/.test(name))    return name + '학교';
        return name;
      };

      schoolFull = expandSchool(schoolFull, levelFinal);

      // 3) 시/도는 schools.region 값을 그대로 사용
      const normalizeRegion = (s) => {
        if (!s) return null;
        return String(s).trim();   // 공백만 정리
      };

      // 학교명 비교용 키(공백/“학교” 제거)
      const makeSchoolKey = (s) => {
        if (!s) return '';
        return String(s)
          .replace(/학교/g, '')
          .replace(/\s+/g, '')
          .trim();
      };

      // 4) region/district 우선순위
      //    ① 프론트(meta_json)에 값이 있으면 그대로 사용
      //    ② 없을 때만 schools 테이블에서 보강
      let region   = clean(meta.region);
      let district = clean(meta.district);

      try {
        if (schoolFull && (!region || !district)) {
          const keyBase = makeSchoolKey(schoolFull);   // 예: "수지고등학교" -> "수지고등"

          const [rows] = await db.query(
            `
            SELECT region, district, name, level
            FROM schools
            WHERE
              -- 완전 일치
              name = ?
              OR REPLACE(name,'학교','') = REPLACE(?, '학교')
              -- 공백/학교 제거 후, 문자열 어디에 있어도 허용
              OR REPLACE(REPLACE(name,'학교',''),' ','') LIKE CONCAT('%', ?, '%')
            ORDER BY LENGTH(name)  -- 가장 짧은 이름(보통 정식 교명) 우선
            LIMIT 1
            `,
            [schoolFull, schoolFull, keyBase]
          );

          if (rows && rows.length) {
            const sc = rows[0];

            // 프론트 값이 없을 때만 DB 값으로 채움
            region   = region   || normalizeRegion(sc.region);
            district = district || sc.district || null;

            if (!levelFinal) {
              levelFinal = sc.level ||
                           (/고등학교/.test(sc.name) ? '고등'
                            : /중학교/.test(sc.name) ? '중등' : null);
            }

            schoolFull = sc.name || schoolFull;
          } else {
            console.warn('[exam-upload] schools 매칭 0행:', schoolFull, keyBase);
          }
        }
      } catch (e) {
        console.warn('schools 조회 실패(무시):', e.message);
      }

      // schools 로도 못 정하면, 문자열만 보고 최종 관 판정
      if (!levelFinal) {
        if (/고등학교/.test(schoolFull)) levelFinal = '고등';
        else if (/중학교/.test(schoolFull)) levelFinal = '중등';
      }


      // 5) INSERT — region/district까지 함께 저장 + 보강된 school/level 사용
      await db.query(`
        INSERT INTO files(
          region, district,
          title, year, school, level, grade, semester, exam_type, subject,
          hwp_filename, pdf_filename, uploaded_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `, [
        clean(region), clean(district),
        clean(meta.title), clean(meta.year), clean(schoolFull), clean(levelFinal),
        clean(meta.grade), clean(meta.semester), clean(meta.exam_type), clean(meta.subject),
        hwpKey, pdfKey
      ]);

      return res.json({ success:true });
    } catch (e) {
      console.error('POST /api/admin/exam-upload error:', e);
      return res.status(500).json({ success:false, message:'업로드 실패' });
    }
  }
);

export default router;