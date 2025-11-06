import express from 'express';
import db from '../config/database.js';   // routes/coverage.js 기준으로 상위 config 폴더
const r = express.Router();

/* ---------- 공통 유틸: schools 테이블 존재/시드 ---------- */
async function hasSchoolsTable() {
  const [[row]] = await db.query(`
    SELECT COUNT(*) AS c
      FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = 'schools'
  `);
  return (row?.c || 0) > 0;
}

// 파일 상단 (기존 변수 그대로 사용)
let _ENSURE_BUSY = false;
let _ENSURE_LAST = 0;
const ENSURE_COOLDOWN_MS = 60_000; // 60초 내 재실행 방지

async function ensureSchoolsReady() {
  // 0) schools 테이블 있는지 확인
  const [[tbl]] = await db.query(`
    SELECT COUNT(*) AS c
    FROM information_schema.tables
    WHERE table_schema = DATABASE() AND table_name = 'schools'
  `);
  if (!tbl?.c) return;

  // 1) 쿨다운
  const now = Date.now();
  if (now - _ENSURE_LAST < ENSURE_COOLDOWN_MS) return;

  // 2) 동일 프로세스 동시 진입 방지
  while (_ENSURE_BUSY) { await new Promise(r => setTimeout(r, 40)); }
  _ENSURE_BUSY = true;

  // 3) 프로세스 간 상호배제: advisory lock
  let gotLock = 0;
  try {
    const [lockRows] = await db.query(`SELECT GET_LOCK('ensureSchoolsReady', 5) AS got`);
    gotLock = lockRows?.[0]?.got || 0;
    if (!gotLock) { _ENSURE_BUSY = false; return; }

  const sql = `
    INSERT INTO schools (name, short_name, region, district, level, status, last_seen_at)
    SELECT school, NULL, region, district, level_norm, 'active', MAX(uploaded_at) AS last_seen_at
    FROM (
      SELECT
        f.school AS school,
        f.region, f.district,
        CASE
          WHEN f.level IN ('고등','고','고등학교','H','HIGH','high','High') THEN '고등'
          WHEN f.level IN ('중등','중','중학교','M','MID','middle','Middle') THEN '중등'
          ELSE NULL
        END AS level_norm,
        f.uploaded_at
      FROM files f
      WHERE f.school IS NOT NULL AND f.school <> ''
    ) t
    WHERE t.level_norm IS NOT NULL
    GROUP BY school, region, district, level_norm
    ON DUPLICATE KEY UPDATE
      status = 'active',
      last_seen_at = GREATEST(VALUES(last_seen_at), COALESCE(schools.last_seen_at, '1970-01-01'))
  `;

  try {
    await db.query(sql);
  } catch (e) {
    if (e?.code === 'ER_LOCK_DEADLOCK' || e?.errno === 1213) {
      console.warn('⚠️ Deadlock 발생 → 재시도(200~400ms 대기)…');
      await new Promise(r => setTimeout(r, 200 + Math.floor(Math.random() * 200)));
      await db.query(sql);
    } else {
      // Data truncated 등은 로깅만 하고 넘겨서 서버 다운 방지
      console.error('[ensureSchoolsReady] 업서트 실패:', e?.code, e?.sqlMessage || e?.message);
    }
  }

    _ENSURE_LAST = Date.now();
  } finally {
    if (gotLock) { try { await db.query(`SELECT RELEASE_LOCK('ensureSchoolsReady')`); } catch {} }
    _ENSURE_BUSY = false;
  }
}

/* ---------- [A] 연도 목록: 2024 ~ max(현재연도, files.max(year)) ---------- */
r.get('/years', async (_req, res) => {
  try {
    const [[row]] = await db.query(`SELECT MAX(year) AS maxYear FROM files`);
    const now = new Date().getFullYear();
    const maxY = Math.max(2024, row?.maxYear || 2024, now);
    const years = Array.from({ length: maxY - 2024 + 1 }, (_, i) => 2024 + i);
    res.json({ years });
  } catch {
    res.json({ years: [2024, 2025] });
  }
});

/* ---------- [B] 시/도 목록 + 커버리지 ---------- */
r.get('/cities', async (req, res) => {
  const { level, year } = req.query;
  if (!level || !year) return res.status(400).json({ error: 'level, year required' });

    await ensureSchoolsReady();              // ← 추가

  const hasSchools = await hasSchoolsTable();
  if (hasSchools) {
    const sql = `
      SELECT s.region AS city,
             COUNT(*) AS total,
             SUM( EXISTS( SELECT 1 FROM files f
                          WHERE f.school   = s.name
                            AND f.region   = s.region
                            AND f.district = s.district
                            AND f.level    = s.level
                            AND f.year     = ? ) ) AS filled
      FROM schools s
      WHERE s.level = ?
      GROUP BY s.region
      ORDER BY s.region
    `;
    const [srows] = await db.query(sql, [year, level]);
    if (srows.length > 0) {
      return res.json(srows.map(r => ({
        city: r.city,
        total: r.total,
        filled: r.filled,
        pct: r.total ? Math.round((r.filled / r.total) * 100) : 0
      })));
    }
// ▼ schools가 0행이면 files 기반 폴백 (아래 기존 폴백 코드 그대로 실행)

  }

const sqlFallback = `
  SELECT f.region AS city,
         COUNT(DISTINCT CONCAT_WS('|', f.school, f.region, f.district, f.level)) AS total_base
  FROM files f
  WHERE f.level = ?
  GROUP BY f.region
  ORDER BY f.region
`;
const [rows] = await db.query(sqlFallback, [level]);

// ✅ 여러 행 그대로 받아서 Map 구성
const [yr] = await db.query(`
  SELECT f.region AS city,
         COUNT(DISTINCT CONCAT_WS('|', f.school, f.region, f.district, f.level)) AS filled
  FROM files f
  WHERE f.level=? AND f.year=?
  GROUP BY f.region
`, [level, year]);

const filledByCity = new Map(yr.map(r => [r.city, r.filled]));


  return res.json(rows.map(r => {
    const filled = filledByCity.get(r.city) || 0;
    const total  = r.total_base || 0;
    return {
      city: r.city,
      total,
      filled,
      pct: total ? Math.round((filled / total) * 100) : 0
    };
  }));
});

/* ---------- [C] 시/군/구 목록 + 커버리지 ---------- */
r.get('/districts', async (req, res) => {
  const { level, year, city } = req.query;
  if (!level || !year || !city) return res.status(400).json({ error: 'level, year, city required' });
    await ensureSchoolsReady();              // ← 추가
  const hasSchools = await hasSchoolsTable();
  if (hasSchools) {
    const sql = `
      SELECT s.district,
             COUNT(*) AS total,
             SUM( EXISTS( SELECT 1 FROM files f
                          WHERE f.school   = s.name
                            AND f.region   = s.region
                            AND f.district = s.district
                            AND f.level    = s.level
                            AND f.year     = ? ) ) AS filled
      FROM schools s
      WHERE s.level=? AND s.region=?
      GROUP BY s.district
      ORDER BY s.district
    `;
const [srows] = await db.query(sql, [year, level, city]);
if (srows.length > 0) {
  return res.json(srows.map(r => ({
    district: r.district, total: r.total, filled: r.filled,
    pct: r.total ? Math.round((r.filled / r.total) * 100) : 0
  })));
}
// ▼ 폴백 (기존 코드 유지, 변수명만 충돌 안 나게)
const [baseRows] = await db.query(sqlFallback, [level, city]);
const [yrRows] = await db.query(`
  SELECT f.district,
         COUNT(DISTINCT CONCAT_WS('|', f.school, f.region, f.district, f.level)) AS filled
  FROM files f
  WHERE f.level=? AND f.region=? AND f.year=?
  GROUP BY f.district
`, [level, city, year]);
const filledMap = new Map(yrRows.map(r => [r.district, r.filled]));

return res.json(baseRows.map(r => {
  const filled = filledMap.get(r.district) || 0;
  const total  = r.total_base || 0;
  return { district: r.district, total, filled, pct: total ? Math.round((filled/total)*100) : 0 };
}));

  }

  // ■ 폴백
  const sqlFallback = `
    SELECT f.district,
           COUNT(DISTINCT CONCAT_WS('|', f.school, f.region, f.district, f.level)) AS total_base
      FROM files f
     WHERE f.level=? AND f.region=?
     GROUP BY f.district
     ORDER BY f.district
  `;
  const [rows] = await db.query(sqlFallback, [level, city]);
  const [yr] = await db.query(`
    SELECT f.district,
           COUNT(DISTINCT CONCAT_WS('|', f.school, f.region, f.district, f.level)) AS filled
      FROM files f
     WHERE f.level=? AND f.region=? AND f.year=?
     GROUP BY f.district
  `, [level, city, year]);
  const filledMap = new Map(yr.map(r => [r.district, r.filled]));

  return res.json(rows.map(r => {
    const filled = filledMap.get(r.district) || 0;
    const total  = r.total_base || 0;
    return {
      district: r.district,
      total,
      filled,
      pct: total ? Math.round((filled / total) * 100) : 0
    };
  }));
});

// /routes/coverage.js (214행 근처)
/* ---------- [D] 전체/선택영역 통계 ---------- */
r.get('/stats', async (req, res) => {
  // ✅ 1. 학년, 학기, 시험 정보를 받습니다.
  const { level, year, city, district, grade, semester, exam_type } = req.query;
  if (!level || !year) return res.status(400).json({ error: 'level, year required' });

  await ensureSchoolsReady();

  // ✅ 2. '1학기중간' 형태로 학기 정보를 조합합니다.
  let dbSemester = null;
  if (semester && exam_type) {
    const semKor = semester === '1' ? '1학기' : '2학기';
    const examKor = exam_type === 'mid' ? '중간' : '기말';
    dbSemester = `${semKor}${examKor}`;
  }

  const hasSchools = await hasSchoolsTable();
  if (hasSchools) {
    const where = ['s.level=?'];
    const params = [level];
    if (city)     { where.push('s.region=?');   params.push(city); }
    if (district) { where.push('s.district=?'); params.push(district); }

    // ✅ 3. 하위 쿼리(EXISTS)에도 필터 조건을 추가합니다.
    let subQueryFilter = 'AND f.year = ?';
    const subQueryParams = [year];
    if (grade) {
      subQueryFilter += ' AND f.grade = ?';
      subQueryParams.push(grade);
    }
    if (dbSemester) {
      subQueryFilter += ' AND f.semester = ?';
      subQueryParams.push(dbSemester);
    }

    const sql = `
      SELECT COUNT(*) AS total,
             SUM( EXISTS( SELECT 1 FROM files f
                          WHERE f.school   = s.name
                            AND f.region   = s.region
                            AND f.district = s.district
                            AND f.level    = s.level
                            ${subQueryFilter} ) ) AS filled
        FROM schools s
       WHERE ${where.join(' AND ')}
    `;
    // ✅ 4. 파라미터 순서를 [하위쿼리 파라미터, 메인쿼리 파라미터]로 변경
    const [[row]] = await db.query(sql, [...subQueryParams, ...params]); 
    const total  = row?.total  || 0;
    const filled = row?.filled || 0;
    if (total > 0) {
      return res.json({ total, filled, pct: Math.round((filled / total) * 100) });
    }
    // ▼ 폴백 (기존 files 기반 코드 그대로)
    const conds = ['level=?']; const args = [level];
    if (city)     { conds.push('region=?');   args.push(city); }
    if (district) { conds.push('district=?'); args.push(district); }

    const [[base]] = await db.query(
      `SELECT COUNT(DISTINCT CONCAT_WS('|', school, region, district, level)) AS total
         FROM files WHERE ${conds.join(' AND ')}`, args
    );
    
    // ✅ 5. 폴백 쿼리에도 필터를 동일하게 추가합니다.
    if (grade) { conds.push('grade=?'); args.push(grade); }
    if (dbSemester) { conds.push('semester=?'); args.push(dbSemester); }

    const [[yr]] = await db.query(
      `SELECT COUNT(DISTINCT CONCAT_WS('|', school, region, district, level)) AS filled
         FROM files WHERE ${conds.concat(['year=?']).join(' AND ')}`, [...args, year]
    );
    const t = base?.total || 0, f = yr?.filled || 0;
    return res.json({ total: t, filled: f, pct: t ? Math.round((f/t)*100) : 0 });

  }

  // ■ 폴백
  const conds = ['level=?'];
  const args  = [level];
  if (city)     { conds.push('region=?');   args.push(city); }
  if (district) { conds.push('district=?'); args.push(district); }

  const [[base]] = await db.query(
    `SELECT COUNT(DISTINCT CONCAT_WS('|', school, region, district, level)) AS total
       FROM files
      WHERE ${conds.join(' AND ')}`, args
  );

  // ✅ 5. 폴백 쿼리에도 필터를 동일하게 추가합니다.
  if (grade) { conds.push('grade=?'); args.push(grade); }
  if (dbSemester) { conds.push('semester=?'); args.push(dbSemester); }

  const [[yr]] = await db.query(
    `SELECT COUNT(DISTINCT CONCAT_WS('|', school, region, district, level)) AS filled
       FROM files
      WHERE ${conds.concat(['year=?']).join(' AND ')}`, [...args, year]
  );
  const total  = base?.total  || 0;
  const filled = yr?.filled   || 0;
  res.json({ total, filled, pct: total ? Math.round((filled / total) * 100) : 0 });
});

// /routes/coverage.js (214행 ~ 279행)

// /routes/coverage.js (276행 근처)
/* ---------- [E] 허니콤(학교 리스트) ---------- */
r.get('/schools', async (req, res) => {
  // ✅ 1. 학년, 학기, 시험 정보를 받습니다.
  const { level, year, city, district, grade, semester, exam_type } = req.query;
  if (!level || !year) return res.status(400).json({ error: 'level, year required' });

    await ensureSchoolsReady();

  // ✅ 2. '1학기중간' 형태로 학기 정보를 조합합니다.
  let dbSemester = null;
  if (semester && exam_type) {
    const semKor = semester === '1' ? '1학기' : '2학기';
    const examKor = exam_type === 'mid' ? '중간' : '기말';
    dbSemester = `${semKor}${examKor}`;
  }

  // ... (특성화고 제외 excludeKeywords 배열은 그대로 둡니다) ...
  const excludeKeywords = [
    '%마이스터고%', '%특성화고%', '%공업고%', '%상업고%', '%정보산업고%',
    '%산업고%', '%디자인고%', '%관광고%', '%조리고%', '%세무고%',
    '%금융고%', '%경영고%', '%애니메이션고%', '%영상고%', '%인터넷고%',
    '%로봇고%', '%생명과학고%', '%해양고%', '%재외한국학교%',
    '%폴리텍고%', '%정보_고%', '%비즈니스고%'
  ];

  const hasSchools = await hasSchoolsTable();
  if (hasSchools) {
    const where = ['s.level=?'];
    const params = [level];
    if (city)     { where.push('s.region=?');   params.push(city); }
    if (district) { where.push('s.district=?'); params.push(district); }

    if (level === '고등') {
      const excludeQuery = excludeKeywords.map(kw => `s.name NOT LIKE ${db.escape(kw)}`).join(' AND ');
      where.push(`(${excludeQuery})`);
    }

    // ✅ 3. 하위 쿼리(EXISTS)에도 필터 조건을 추가합니다.
    let subQueryFilter = 'AND f.year = ?';
    const subQueryParams = [year];
    if (grade) {
      subQueryFilter += ' AND f.grade = ?';
      subQueryParams.push(grade);
    }
    if (dbSemester) {
      subQueryFilter += ' AND f.semester = ?';
      subQueryParams.push(dbSemester);
    }

    const sql = `
      SELECT s.id, s.name, s.short_name, s.region, s.district,
             EXISTS( SELECT 1 FROM files f
                     WHERE f.school   = s.name
                       AND f.region   = s.region
                       AND f.district = s.district
                       AND f.level    = s.level
                       ${subQueryFilter} ) AS has_any
        FROM schools s
       WHERE ${where.join(' AND ')}
       ORDER BY s.region, s.district, s.name
    `;
    // ✅ 4. 파라미터 순서를 [하위쿼리, 메인쿼리]로 변경
    const [srows] = await db.query(sql, [...subQueryParams, ...params]);
    if (srows.length > 0) {
      return res.json(srows.map(r => ({
        id: r.id, name: r.name, short_name: r.short_name || r.name,
        region: r.region, district: r.district, has_any: !!r.has_any
      })));
    }
    // ▼ 폴백
  }

  // ■ 폴백: files에서 파생
  const conds = ['f.level=?'];
  const args  = [level];
  if (city)     { conds.push('f.region=?');   args.push(city); }
  if (district) { conds.push('f.district=?'); args.push(district); }
  
  // ✅ 5. 폴백 쿼리에도 필터를 동일하게 추가합니다.
  if (grade) { conds.push('grade=?'); args.push(grade); }
  if (dbSemester) { conds.push('semester=?'); args.push(dbSemester); }

  if (level === '고등') {
    const excludeQuery = excludeKeywords.map(kw => `f.school NOT LIKE ${db.escape(kw)}`).join(' AND ');
    conds.push(`(${excludeQuery})`);
  }

  const [rows] = await db.query(
    `SELECT MIN(f.id) AS pseudo_id, f.school AS name, NULL AS short_name, f.region, f.district
     FROM files f
     WHERE ${conds.join(' AND ')}
     GROUP BY f.school, f.region, f.district
     ORDER BY f.region, f.district, f.school`,
    args
  );

  // 해당 연도 업로드 여부 (필터링된 상태 기준)
  const [yr] = await db.query(
    `SELECT f.school, f.region, f.district, COUNT(*) AS c
       FROM files f
      WHERE ${conds.concat(['f.year=?']).join(' AND ')}
      GROUP BY f.school, f.region, f.district`,
    [...args, year]
  );
  const hasMap = new Map(yr.map(r => [r.school + '|' + r.region + '|' + r.district, r.c]));

  return res.json(rows.map(r => ({
    id: r.pseudo_id, name: r.name, short_name: r.name,
    region: r.region, district: r.district,
    has_any: !!hasMap.get(r.name + '|' + r.region + '|' + r.district)
  })));
});

/* ---------- [F] 학교별 파일 목록(모달) ---------- */
r.get('/school-files', async (req, res) => {
  const { schoolId, schoolName, region, district, year } = req.query;
  if (!year) return res.status(400).json({ error: 'year required' });

  const hasSchools = await hasSchoolsTable();
  if (hasSchools && schoolId) {
    const [[s]] = await db.query(
      `SELECT id, name, region, district, level FROM schools WHERE id=?`,
      [schoolId]
    );
    if (!s) return res.json({ school: null, files: [] });

    const [files] = await db.query(
      `SELECT id, title, grade, semester, subject, year
        FROM files
        WHERE school   = ?
          AND region   = ?
          AND district = ?
          AND level    = ?
          AND year     = ?
        ORDER BY year DESC, semester DESC, id DESC`,
      [s.name, s.region, s.district, s.level, year]
    );
    return res.json({ school: s, files });
  }

  // ■ 폴백: schools 없음 → 쿼리 파라미터로 식별
  if (!schoolName || !region || !district) {
    return res.json({ school: null, files: [] });
  }
  const [files] = await db.query(
    `SELECT id, title, grade, semester, subject, year
      FROM files
    WHERE school = ? AND region = ? AND district = ? AND year = ?
    ORDER BY year DESC, semester DESC, id DESC`,
    [schoolName, region, district, year]
  );
  return res.json({
    school: { name: schoolName, region, district },
    files
  });
});

export default r;
