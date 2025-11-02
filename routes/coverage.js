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

async function ensureSchoolsReady() {
  if (!(await hasSchoolsTable())) return;         // 테이블 자체가 없으면 패스(폴백 로직이 처리)

  // 1) 비어 있으면 1회 시드
  const [[cnt]] = await db.query(`SELECT COUNT(*) AS c FROM schools`);
  if ((cnt?.c || 0) === 0) {
    await db.query(`
      INSERT INTO schools (name, short_name, region, district, level, status, last_seen_at)
      SELECT
        f.school                           AS name,
        NULL                                AS short_name,
        f.region, f.district, f.level,
        'active'                            AS status,
        NOW()                               AS last_seen_at
      FROM files f
      WHERE f.school IS NOT NULL AND f.school <> ''
      GROUP BY f.school, f.region, f.district, f.level
    `);
  }

  try {
    // 1️⃣ 신규 학교 추가
    await db.query(`
      INSERT IGNORE INTO schools (name, short_name, region, district, level, status, last_seen_at)
      SELECT f.school, NULL, f.region, f.district, f.level, 'active', NOW()
      FROM files f
      WHERE f.school IS NOT NULL AND f.school <> ''
      GROUP BY f.school, f.region, f.district, f.level
    `);

    // 2️⃣ 잠깐 쉬었다가(락 해제 대기)
    await new Promise(resolve => setTimeout(resolve, 200));

    // 3️⃣ 최근 업로드 시점 갱신
    await db.query(`
      UPDATE schools s
      JOIN (
        SELECT f.school, f.region, f.district, f.level, MAX(f.uploaded_at) AS seen
          FROM files f
        GROUP BY f.school, f.region, f.district, f.level
      ) x
        ON x.school=s.name AND x.region=s.region AND x.district=s.district AND x.level=s.level
      SET s.last_seen_at = COALESCE(x.seen, s.last_seen_at)
    `);
  } catch (err) {
    if (err.code === 'ER_LOCK_DEADLOCK') {
      console.warn('⚠️ Deadlock 발생 → 재시도 중...');
      await new Promise(r => setTimeout(r, 500));
      return await ensureSchoolsReady(); // 1회 재시도
    }
    throw err;
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
    const [rows] = await db.query(sql, [year, level]);
    return res.json(rows.map(r => ({
      city: r.city,
      total: r.total,
      filled: r.filled,
      pct: r.total ? Math.round((r.filled / r.total) * 100) : 0
    })));
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
    const [rows] = await db.query(sql, [year, level, city]);
    return res.json(rows.map(r => ({
      district: r.district,
      total: r.total,
      filled: r.filled,
      pct: r.total ? Math.round((r.filled / r.total) * 100) : 0
    })));
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

/* ---------- [D] 전체/선택영역 통계 ---------- */
r.get('/stats', async (req, res) => {
  const { level, year, city, district } = req.query;
  if (!level || !year) return res.status(400).json({ error: 'level, year required' });

    await ensureSchoolsReady();              // ← 추가

  const hasSchools = await hasSchoolsTable();
  if (hasSchools) {
    const where = ['s.level=?'];
    const params = [level];
    if (city)     { where.push('s.region=?');   params.push(city); }
    if (district) { where.push('s.district=?'); params.push(district); }

    const sql = `
      SELECT COUNT(*) AS total,
             SUM( EXISTS( SELECT 1 FROM files f
                          WHERE f.school   = s.name
                            AND f.region   = s.region
                            AND f.district = s.district
                            AND f.level    = s.level
                            AND f.year     = ? ) ) AS filled
        FROM schools s
       WHERE ${where.join(' AND ')}
    `;
    const [[row]] = await db.query(sql, [year, ...params]);
    const total  = row?.total  || 0;
    const filled = row?.filled || 0;
    return res.json({ total, filled, pct: total ? Math.round((filled / total) * 100) : 0 });
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
  const [[yr]] = await db.query(
    `SELECT COUNT(DISTINCT CONCAT_WS('|', school, region, district, level)) AS filled
       FROM files
      WHERE ${conds.concat(['year=?']).join(' AND ')}`, [...args, year]
  );
  const total  = base?.total  || 0;
  const filled = yr?.filled   || 0;
  res.json({ total, filled, pct: total ? Math.round((filled / total) * 100) : 0 });
});

/* ---------- [E] 허니콤(학교 리스트) ---------- */
r.get('/schools', async (req, res) => {
  const { level, year, city, district } = req.query;
  if (!level || !year) return res.status(400).json({ error: 'level, year required' });

    await ensureSchoolsReady();              // ← 추가

  const hasSchools = await hasSchoolsTable();
  if (hasSchools) {
    const where = ['s.level=?'];
    const params = [level];
    if (city)     { where.push('s.region=?');   params.push(city); }
    if (district) { where.push('s.district=?'); params.push(district); }

    const sql = `
      SELECT s.id, s.name, s.short_name, s.region, s.district,
             EXISTS( SELECT 1 FROM files f
                     WHERE f.school   = s.name
                       AND f.region   = s.region
                       AND f.district = s.district
                       AND f.level    = s.level
                       AND f.year     = ? ) AS has_any
        FROM schools s
       WHERE ${where.join(' AND ')}
       ORDER BY s.region, s.district, s.name
    `;
    const [rows] = await db.query(sql, [year, ...params]);
    return res.json(rows.map(r => ({
      id: r.id,
      name: r.name,
      short_name: r.short_name || r.name,
      region: r.region,
      district: r.district,
      has_any: !!r.has_any
    })));
  }

  // ■ 폴백: files에서 파생
  const conds = ['f.level=?'];
  const args  = [level];
  if (city)     { conds.push('f.region=?');   args.push(city); }
  if (district) { conds.push('f.district=?'); args.push(district); }

  const [rows] = await db.query(
    `SELECT
        MIN(f.id) AS pseudo_id,   -- 임시 id
        f.school  AS name,
        NULL      AS short_name,
        f.region, f.district
     FROM files f
     WHERE ${conds.join(' AND ')}
     GROUP BY f.school, f.region, f.district
     ORDER BY f.region, f.district, f.school`,
    args
  );

  // 해당 연도 업로드 여부
  const [yr] = await db.query(
    `SELECT f.school, f.region, f.district,
            COUNT(*) AS c
       FROM files f
      WHERE ${conds.concat(['f.year=?']).join(' AND ')}
      GROUP BY f.school, f.region, f.district`,
    [...args, year]
  );
  const hasMap = new Map(yr.map(r => [r.school + '|' + r.region + '|' + r.district, r.c]));

  return res.json(rows.map(r => ({
    id: r.pseudo_id,  // 숫자지만 schools.id는 아님
    name: r.name,
    short_name: r.name,
    region: r.region,
    district: r.district,
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
