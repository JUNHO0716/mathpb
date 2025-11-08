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
    SELECT id, email, name, created_at,
          is_subscribed, subscription_start, subscription_end,
          is_admin, 
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

// /routes/admin.js (77행 근처)

// --- 헬퍼 함수: 파일명 파싱 ---
// "2025 인천 부흥고 2학년 1학기 기말 대수"
function parseFilename(filename) {
  const parts = filename.replace(/\.[^/.]+$/, "").split(' '); // 확장자 제거 및 공백으로 분리
  if (parts.length < 7) return null; // [연도] [지역] [학교] [학년] [학기] [시험] [과목] 최소 7개

  const [year, region, school, grade, semester, exam, ...subjectParts] = parts;
  const subject = subjectParts.join(' ');

  // 학기 매핑
  let dbSemester = `${semester} ${exam}`;
  if (dbSemester === '1학기 중간') dbSemester = '1학기중간';
  else if (dbSemester === '1학기 기말') dbSemester = '1학기기말';
  else if (dbSemester === '2학기 중간') dbSemester = '2학기중간';
  else if (dbSemester === '2학기 기말') dbSemester = '2학기기말';
  else return null; // 학기 형식이 안 맞으면 실패

  return {
    year: parseInt(year, 10),
    regionQuery: region, // "인천" (DB 조회를 위한 키)
    schoolQuery: school, // "부흥고" (DB 조회를 위한 키)
    gradeQuery: grade,   // "2학년" (DB 조회를 위한 키)
    semester: dbSemester,
    subject: subject,
    title: filename.replace(/\.[^/.]+$/, "") // 제목은 파일명 그대로
  };
}

// --- 헬퍼 함수: DB에서 학교 정보 조회 (AI 두뇌) ---
async function findSchoolInfo(regionQuery, schoolQuery, gradeQuery) {
  // 1. "인천" -> "인천광역시" 매핑
  const regionMap = {
    '서울': '서울특별시', '경기': '경기도', '인천': '인천광역시', '부산': '부산광역시',
    '대구': '대구광역시', '광주': '광주광역시', '대전': '대전광역시', '울산': '울산광역시',
    '세종': '세종특별자치시', '강원': '강원특별자치도', '충북': '충청북도', '충남': '충청남도',
    '전북': '전북특별자치도', '전남': '전라남도', '경북': '경상북도', '경남': '경상남도', '제주': '제주특별자치도'
  };
  const region = regionMap[regionQuery] || regionQuery; // "인천" -> "인천광역시"

  // 2. DB 조회 (예: '부흥고' -> '부흥고등학교')
  const [[schoolDB]] = await db.query(
    `SELECT name, district, level FROM schools WHERE region = ? AND name LIKE ? LIMIT 1`,
    [region, `${schoolQuery}%`] // '부흥고'로 시작하는 학교
  );

  if (!schoolDB) {
    throw new Error(`'${region} ${schoolQuery}'에 해당하는 학교를 schools 테이블에서 찾을 수 없습니다.`);
  }

  // 3. 'grade' 재조정 (파싱된 '2학년'과 DB의 'level'을 조합)
  let finalGrade = gradeQuery; // 기본값
  if (schoolDB.level === '중등') {
    if (gradeQuery === '1학년') finalGrade = '중1';
    else if (gradeQuery === '2학년') finalGrade = '중2';
    else if (gradeQuery === '3학년') finalGrade = '중3';
  } else { // '고등'
    if (gradeQuery === '1학년') finalGrade = '고1';
    else if (gradeQuery === '2학년') finalGrade = '고2';
    else if (gradeQuery === '3학년') finalGrade = '고3';
  }

  return {
    region: region,             // "인천광역시"
    district: schoolDB.district, // "부평구"
    school: schoolDB.name,       // "부흥고등학교" (DB에 저장된 풀네임)
    level: schoolDB.level,       // "고등"
    grade: finalGrade,           // "고2"
  };
}


// 자료실 파일 업로드 (AI 파싱 적용)
router.post('/upload', verifyOrigin, fileUpload.array('files'), async (req, res) => {
  try {
    const files = req.files;
    if (!files || files.length === 0) return res.status(400).json({ message: '파일이 없습니다.' });

    // S3에 업로드된 HWP/PDF 키 찾기
    let hwpKey = null, pdfKey = null;
    let originalFilename = ''; // 파싱할 파일명
    for (const f of files) {
      originalFilename = f.originalname; // 첫 번째 파일 이름 사용
      const ext = path.extname(f.originalname).toLowerCase();
      if (['.hwp', '.hwpx'].includes(ext)) hwpKey = f.key;
      if (ext === '.pdf') pdfKey = f.key;
    }

    // 1. 파일명 파싱
    const parsed = parseFilename(originalFilename);
    
    // 2. 폼 데이터 (파싱 실패 시 사용)
    const { region, district, school, grade, year, semester, title, level } = req.body;

    if (!parsed) {
      // 💥 파싱 실패! 폼 데이터를 그대로 사용 (기존 로직)
      if (!region || !district || !school || !grade || !year || !semester || !title || !level) {
        // 파싱도 실패하고, 폼 데이터도 비어있으면 에러
        return res.status(400).json({ message: '파일명 형식이 맞지 않고, 폼 데이터도 비어있습니다.' });
      }
      await db.query(
        `INSERT INTO files (region, district, school, grade, year, semester, title, hwp_filename, pdf_filename, level)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [region, district, school, grade, year, semester, title || '제목 없음', hwpKey, pdfKey, level]
      );
      return res.json({ message: '업로드 성공 (폼 데이터 사용)' });
    }

    // 3. DB 조회 (AI 두뇌)
    const schoolInfo = await findSchoolInfo(parsed.regionQuery, parsed.schoolQuery, parsed.gradeQuery);

    // 4. DB에 저장
    await db.query(
      `INSERT INTO files (region, district, school, grade, year, semester, title, hwp_filename, pdf_filename, level, subject)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        schoolInfo.region,   // "인천광역시"
        schoolInfo.district, // "부평구"
        schoolInfo.school,   // "부흥고등학교"
        schoolInfo.grade,    // "고2" (findSchoolInfo가 변환한 값)
        parsed.year,         // 2025
        parsed.semester,     // "1학기기말"
        parsed.title,        // "2025 인천 부흥고 2학년 1학기 기말 대수"
        hwpKey,
        pdfKey,
        schoolInfo.level,    // "고등"
        parsed.subject       // "대수"
      ]
    );
    res.json({ message: '✅ AI 파싱 업로드 성공' });
  } catch (e) {
    console.error('AI 업로드 오류:', e);
    // S3에 업로드된 파일 롤백 (선택 사항)
    // if (req.files) {
    //   for (const f of req.files) { await deleteS3(f.key); }
    // }
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

router.post('/update-role', async (req, res) => {
  try {
    const { userId, makeAdmin } = req.body;
    if (!userId || typeof makeAdmin !== 'boolean') {
      return res.status(400).json({ success: false, message: '잘못된 요청입니다.' });
    }
    await db.execute('UPDATE users SET is_admin = ? WHERE id = ?', [makeAdmin ? 1 : 0, userId]);
    return res.json({
      success: true,
      message: makeAdmin ? '✅ 관리자 권한이 부여되었습니다.' : '✅ 관리자 권한이 해제되었습니다.'
    });
  } catch (e) {
    res.status(500).json({ success: false, message: '서버 오류', error: e.message });
  }
});

export default router;