import express from 'express';
import db from '../config/database.js';

const router = express.Router();

// ---- cache school table columns ----
let SCHOOL_COLS = null;
async function getSchoolCols() {
  if (SCHOOL_COLS) return SCHOOL_COLS;
  const [rows] = await db.query(`
    SELECT COLUMN_NAME
    FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'schools'
  `);
  SCHOOL_COLS = new Set(rows.map(r => r.COLUMN_NAME));
  return SCHOOL_COLS;
}
function pick(cols, list) {
  for (const name of list) {
    if (cols.has(name)) return `\`${name}\``;
  }
  return null;
}
// build safe expressions depending on existing columns
function buildExprs(cols) {
  const nameCol  = pick(cols, ['SCHUL_NM','schul_nm','name','학교명']) || `''`;
  // ✅ neis_school_code를 최우선으로 선택하도록 보강
  const codeCol  = pick(cols, ['neis_school_code','SD_SCHUL_CODE','sd_schul_code','NEIS_CODE','neis_code','code','id']) || `''`;
  const levelCol = pick(cols, ['level','학제']) || `''`;
  const cityRaw  = pick(cols, ['city','region','ATPT_OFCDC_SC_NM','시도']) || `''`;
  const distRaw  = pick(cols, ['SGG_NM','district','시군구','JU_ORG_NM']) || `''`;

  const cityExpr = `TRIM(REPLACE(${cityRaw}, '교육청',''))`;
  const distExpr = `TRIM(REPLACE(REPLACE(${distRaw}, '교육지원청',''), '교육청',''))`;
  const levelInHigh = `('고등','고','고등학교','H','HIGH','high','High')`;
  const levelInMid  = `('중등','중','중학교','M','MID','middle','Middle')`;

  const levelClause = (param) => `
    CASE ${param}
      WHEN '고등' THEN ${levelCol} IN ${levelInHigh}
      WHEN '중등' THEN ${levelCol} IN ${levelInMid}
      ELSE TRUE
    END
  `;

  return { nameCol, codeCol, levelCol, cityExpr, distExpr, levelClause };
}

// 제외 키워드 (정규식)
const EXCLUDE_RX =
  '(마이스터고|특성화고|에너지고|애니고|예술고|인공지능고|공업고|상업고|정보산업고|산업고|디자인고|관광고|조리고|세무고|금융고|경영고|애니메이션고|영상고|인터넷고|로봇고|생명과학고|해양고|재외한국학교|폴리텍고|정보.?고|비즈니스고|미디어고)';

// ---- years (from files) ----
router.get('/years', async (req, res) => {
  try {
    const [[row]] = await db.query(`SELECT MAX(year) AS maxY, MIN(year) AS minY FROM files`);
    const now = new Date().getFullYear();
    const maxY = Math.max(Number(row?.maxY || 0), now);
    const minY = Number(row?.minY || (now - 1));
    const years = [];
    for (let y = minY; y <= maxY; y++) years.push(y);
    res.json({ years });   // ← 프론트 기대형태
  } catch (e) {
    console.error('[coverage/years] error', e);
    res.status(500).json({ error: 'failed' });
  }
});

// ---- cities ----
router.get('/cities', async (req, res) => {
  try {
    const level = String(req.query.level || '').trim(); // '고등' | '중등' | ''
    const cols = await getSchoolCols();
    const { nameCol, cityExpr, levelClause } = buildExprs(cols);

    const sql = `
      SELECT DISTINCT ${cityExpr} AS city
      FROM schools
      WHERE ${levelClause('?')}
        AND ${nameCol} IS NOT NULL AND ${nameCol} <> ''
        AND ${nameCol} NOT RLIKE ?
      ORDER BY city
    `;
    const [rows] = await db.query(sql, [level, EXCLUDE_RX]);

    const allProvinces = [
  '서울특별시','부산광역시','대구광역시','인천광역시','광주광역시','대전광역시','울산광역시','세종특별자치시',
  '경기도','강원특별자치도','충청북도','충청남도','전라북도','전라남도','경상북도','경상남도','제주특별자치도'
];

// DB 결과 + 고정목록 병합
const set = new Set(rows.map(r => r.city).filter(Boolean));
allProvinces.forEach(n => set.add(n));

// (선택) '재외한국학교' 같은 비정규 항목 제거
set.delete('재외한국학교');

res.json([...set].sort());
return; // 여기서 조기 리턴

    res.json(rows.filter(r => r.city && r.city !== ''));
  } catch (e) {
    console.error('[coverage/cities] error', e);
    res.status(500).json({ error: 'failed' });
  }
});

// ---- districts ----
router.get('/districts', async (req, res) => {
  try {
    const level = String(req.query.level || '').trim();
    const city  = String(req.query.city  || '').trim();
    if (!city) return res.json([]);

    const cols = await getSchoolCols();
    const { nameCol, cityExpr, distExpr, levelClause } = buildExprs(cols);

    const sql = `
      SELECT DISTINCT ${distExpr} AS district
      FROM schools
      WHERE ${levelClause('?')}
        AND ${cityExpr} = ?
        AND ${nameCol} IS NOT NULL AND ${nameCol} <> ''
        AND ${nameCol} NOT RLIKE ?
      ORDER BY district
    `;
    const [rows] = await db.query(sql, [level, city, EXCLUDE_RX]);
    res.json(rows.filter(r => r.district && r.district !== ''));
  } catch (e) {
    console.error('[coverage/districts] error', e);
    res.status(500).json({ error: 'failed' });
  }
});

router.get('/schools', async (req, res) => {
  try {
    const level    = String(req.query.level || '').trim();
    const city     = String(req.query.city  || '').trim();
    const district = String(req.query.district || '').trim();
    const limit    = Math.min(parseInt(req.query.limit || '500', 10), 2000);

    const cols = await getSchoolCols();
    const { nameCol, codeCol, cityExpr, distExpr, levelClause } = buildExprs(cols);

    const conds = [`${levelClause('?')}`, `${nameCol} NOT RLIKE ?`];
    const args  = [level, EXCLUDE_RX];
    if (city)     { conds.push(`${cityExpr} = ?`); args.push(city); }
    if (district) { conds.push(`${distExpr} = ?`); args.push(district); }

    // ✅ 언제나 안전한 id: 코드가 비어있으면 (''), 지역|구|학교명으로 대체
    //    (NULLIF('', '') → NULL, IFNULL(NULL, 대체식) 으로 항상 fallback 보장)
    const idExpr = `IFNULL(NULLIF(${codeCol}, ''), CONCAT(${cityExpr},'|',${distExpr},'|',${nameCol}))`;

    // ✅ 정렬도 테이블에 실제 있는 컬럼/식으로! (옛 코드의 'SCHUL_NM' 잔재 차단)
    const orderExpr = (nameCol === `''`) ? '`name`' : nameCol;

    const sql = `
      SELECT
        ${idExpr} AS id,
        ${nameCol} AS name,
        ${cityExpr} AS city,
        ${distExpr} AS district
      FROM schools
      WHERE ${conds.join(' AND ')}
      ORDER BY ${orderExpr}
      LIMIT ?
    `;
    const [rows] = await db.query(sql, [...args, limit]);
    res.json(rows);
  } catch (e) {
    console.error('[coverage/schools] error', e);
    res.status(500).json({ error: 'failed' });
  }
});

// ---- stats (커버리지 비율) ----
router.get('/stats', async (req, res) => {
  try {
    const level    = String(req.query.level || '').trim();   // 고등/중등
    const year     = parseInt(req.query.year || '0', 10);
    const city     = String(req.query.city || '').trim();
    const district = String(req.query.district || '').trim();
    const grade    = String(req.query.grade || '').trim();    // '1','2','3' or ''
    const semester = String(req.query.semester || '').trim(); // '1'|'2' or ''
    const examType = String(req.query.exam_type || '').trim(); // 'mid'|'final' 또는 '중간'|'기말'
    const examTypeKr = examType === 'mid' ? '중간'
                      : examType === 'final' ? '기말'
                      : (examType === '중간' || examType === '기말' ? examType : '');

    const dbSemester = (semester && examType)
      ? `${semester === '1' ? '1학기' : '2학기'}${examType === 'mid' ? '중간' : '기말'}`
      : null;

    // 분모 multiplier
    let multiplier = 12;                  // 3학년 × 4회
    if (grade && !dbSemester) multiplier = 4;
    if (!grade && dbSemester) multiplier = 3;
    if (grade && dbSemester)  multiplier = 1;

    const cols = await getSchoolCols();
    const { nameCol, cityExpr, distExpr, levelClause } = buildExprs(cols);

    const schConds = [`${levelClause('?')}`, `${nameCol} NOT RLIKE ?`];
    const schArgs  = [level, EXCLUDE_RX];
    if (city)     { schConds.push(`${cityExpr} = ?`); schArgs.push(city); }
    if (district) { schConds.push(`${distExpr} = ?`); schArgs.push(district); }

    const [[{ totalSchools = 0 } = {}]] = await db.query(
      `SELECT COUNT(*) AS totalSchools FROM schools WHERE ${schConds.join(' AND ')}`,
      schArgs
    );
    const total = totalSchools * multiplier;

    const fileConds = ['year = ?'];
    const fileArgs  = [year];
    if (level)     { fileConds.push('level = ?');    fileArgs.push(level); }
    if (grade)     { fileConds.push('grade = ?');    fileArgs.push(grade); }
    if (semester)   { fileConds.push('semester = ?');  fileArgs.push(semester); }    // '1' | '2'
    if (examTypeKr) { fileConds.push('exam_type = ?'); fileArgs.push(examTypeKr); }  // '중간'|'기말'
    if (city)      { fileConds.push('region = ?');   fileArgs.push(city); }
    if (district)  { fileConds.push('district = ?'); fileArgs.push(district); }

    const [[{ filledFiles = 0 } = {}]] = await db.query(
      `SELECT COUNT(*) AS filledFiles FROM files WHERE ${fileConds.join(' AND ')}`,
      fileArgs
    );

    res.json({ total, filled: filledFiles, pct: total ? Math.round((filledFiles / total) * 100) : 0 });
  } catch (e) {
    console.error('[coverage/stats] error', e);
    res.status(500).json({ error: 'failed' });
  }
});

export default router;
