// routes/neis_sync.js
import express from 'express';
import db from '../config/database.js';

const router = express.Router();

// Node 18+ 이면 global fetch 사용, 아니면 동적 임포트
async function httpGet(url) {
  if (typeof fetch === 'function') return (await fetch(url)).json();
  const { default: nf } = await import('node-fetch');
  const r = await nf(url);
  return r.json();
}

// schools 테이블 보유 컬럼 감지 → 존재하는 컬럼만 사용
async function detectSchoolCols() {
  const [rows] = await db.query(`
    SELECT column_name AS c
    FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'schools'
  `);
  const cols = new Set(rows.map(r => r.c));
  return {
    hasShort: cols.has('short_name'),
    hasStatus: cols.has('status'),
    hasHomepage: cols.has('homepage'),
    hasAddress: cols.has('address'),
    hasOffice: cols.has('neis_office_code'),
    hasCode: cols.has('neis_school_code'),
    hasLastSeen: cols.has('last_seen_at'),
  };
}

// 학교명 축약: “○○고등학교/중학교” → “○○고/중”
function makeShortName(name = '') {
  if (/고등학교$/.test(name)) return name.replace(/고등학교$/, '고');
  if (/중학교$/.test(name))   return name.replace(/중학교$/, '중');
  return name;
}

// NEIS → '고등'/'중등' 매핑
function mapLevel(knd = '') {
  if (knd === '고등학교') return '고등';
  if (knd === '중학교')   return '중등';
  return null; // 초등/기타는 스킵
}

// ✅ district(시/군/구) 추출
function extractDistrictFromNEISRow(r) {
  const sgg = (r.SGG_NM || '').trim();
  if (sgg) return sgg;

  const addr = ((r.ORG_RDNMA || r.ORG_RDNDA || '') + '').trim();
  if (!addr) return '';

  const parts = addr.split(/\s+/).filter(Boolean);
  for (let i = 1; i < Math.min(parts.length, 4); i++) {
    const t = parts[i];
    if (/[군구]$/.test(t)) return t;            // ○○군 / ○○구
    if (/시$/.test(t)) {
      if (i + 1 < parts.length && /구$/.test(parts[i + 1])) return parts[i + 1];
      return t;                                  // 단일 ‘○○시’
    }
  }
  return '';
}

// 한 페이지 로드
async function fetchSchoolPage(KEY, pIndex = 1, pSize = 1000) {
  const base = 'https://open.neis.go.kr/hub/schoolInfo';
  const url  = `${base}?Type=json&KEY=${encodeURIComponent(KEY)}&pIndex=${pIndex}&pSize=${pSize}`;
  const data = await httpGet(url);
  const block = Array.isArray(data?.schoolInfo) ? data.schoolInfo : [];
  const head  = block.find(v => v?.head)?.head || block[0]?.head || [];
  const rows  = (block.find(v => v?.row)?.row) || block[1]?.row || [];
  const total = Number((head?.find?.(h => 'list_total_count' in h) || {}).list_total_count || 0);
  return { total, rows: Array.isArray(rows) ? rows : [] };
}

// 전체 페이지 순회 수집
async function fetchAllSchools(KEY) {
  const first = await fetchSchoolPage(KEY, 1, 1000);
  const out = [...first.rows];
  const pages = Math.ceil((first.total || 0) / 1000);
  for (let i = 2; i <= pages; i++) {
    const pg = await fetchSchoolPage(KEY, i, 1000);
    if (pg.rows?.length) out.push(...pg.rows);
  }
  return out;
}

// /routes/neis_sync.js

// ✅ [최종_최종 수정] 중복 데이터를 완전히 정리하는 가장 확실한 로직
async function upsertSchools(rows, levelFilter) {
  const TEMP_TABLE = `temp_schools_${Date.now()}`;
  const now = new Date();
  let conn;

  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    // 1. 임시 테이블 생성
    await conn.query(`CREATE TEMPORARY TABLE ${TEMP_TABLE} LIKE schools`);

    // 2. NEIS 데이터를 임시 테이블에 삽입
    const cols = await detectSchoolCols();
    const baseCols = ['name', 'region', 'district', 'level'];
    // ... (이하 컬럼 추가 로직은 동일)
    if (cols.hasShort)    baseCols.push('short_name');
    if (cols.hasStatus)   baseCols.push('status');
    if (cols.hasHomepage) baseCols.push('homepage');
    if (cols.hasAddress)  baseCols.push('address');
    if (cols.hasOffice)   baseCols.push('neis_office_code');
    if (cols.hasCode)     baseCols.push('neis_school_code');
    if (cols.hasLastSeen) baseCols.push('last_seen_at');
    
    const allRows = [];
    for (const r of rows) {
      const kLevel = mapLevel(r.SCHUL_KND_SC_NM);
      if (!kLevel || (levelFilter && kLevel !== levelFilter)) continue;
      
      const rowData = [
        (r.SCHUL_NM||'').trim(), (r.LCTN_SC_NM||'').trim(), extractDistrictFromNEISRow(r), kLevel,
      ];
      if (cols.hasShort)    rowData.push(makeShortName(r.SCHUL_NM));
      if (cols.hasStatus)   rowData.push('active');
      if (cols.hasHomepage) rowData.push((r.HMPG_ADRES||'').trim() || null);
      if (cols.hasAddress)  rowData.push((r.ORG_RDNMA||r.ORG_RDNDA||'').trim() || null);
      if (cols.hasOffice)   rowData.push((r.ATPT_OFCDC_SC_CODE||'').trim() || null);
      if (cols.hasCode)     rowData.push((r.SD_SCHUL_CODE||'').trim() || null);
      if (cols.hasLastSeen) rowData.push(now);
      
      allRows.push(rowData);
    }

    if (allRows.length > 0) {
      const insertSql = `INSERT INTO ${TEMP_TABLE} (${baseCols.join(',')}) VALUES ?`;
      await conn.query(insertSql, [allRows]);
    }

    // 3. [DELETE] NEIS에 있는 학교와 이름/레벨이 같은 기존 '모든' 데이터를 삭제 (더러운 데이터 청소)
    const deleteSql = `
      DELETE s FROM schools s
      JOIN ${TEMP_TABLE} t ON s.name = t.name AND s.level = t.level
    `;
    await conn.query(deleteSql);

    // 4. [INSERT] 임시 테이블의 깨끗한 데이터를 schools 테이블에 다시 삽입
    const insertNewSql = `
      INSERT INTO schools (${baseCols.join(',')})
      SELECT ${baseCols.map(c => `t.${c}`).join(',')}
      FROM ${TEMP_TABLE} t
    `;
    const [insertResult] = await conn.query(insertNewSql);

    await conn.commit();
    return { affected: insertResult.affectedRows || 0 };

  } catch (err) {
    if (conn) await conn.rollback();
    console.error('[NEIS upsertSchools] Transaction Error:', err);
    throw err;
  } finally {
    if (conn) conn.release();
  }
}


// 관리자 트리거: 전체 동기화
// POST /api/admin/neis/sync?level=고등|중등 (생략 시 둘 다)
router.post('/sync', async (req, res) => {
  try {
    const KEY = process.env.NEIS_API_KEY;
    if (!KEY) return res.status(400).json({ ok:false, msg: 'NEIS_API_KEY 누락' });

    const wantLevel = (req.query.level === '고등' || req.query.level === '중등') ? req.query.level : null;

    const all = await fetchAllSchools(KEY);

    const BATCH = 800;
    let affected = 0;
    for (let i=0; i<all.length; i+=BATCH) {
      const chunk = all.slice(i, i+BATCH);
      const { affected: a } = await upsertSchools(chunk, wantLevel);
      affected += (a||0);
    }

    // ✅ 빈 district 중복 정리(선택 권장)
    await db.query(`
      DELETE s1 FROM schools s1
      JOIN schools s2
        ON s1.name=s2.name
       AND s1.region=s2.region
       AND s1.level=s2.level
       AND (s1.district IS NULL OR s1.district='')
       AND s2.district IS NOT NULL AND s2.district<>''
    `);

    res.json({ ok:true, affected, filtered: wantLevel || '고등/중등' });
  } catch (e) {
    console.error('[NEIS sync] error', e);
    res.status(500).json({ ok:false, msg: e.message });
  }
});

// 현황 확인(선택): level별 카운트
router.get('/status', async (_req, res) => {
  try {
    const [[hi]] = await db.query(`SELECT COUNT(*) AS c FROM schools WHERE level='고등'`);
    const [[mi]] = await db.query(`SELECT COUNT(*) AS c FROM schools WHERE level='중등'`);
    res.json({ ok:true, high: hi?.c||0, middle: mi?.c||0 });
  } catch (e) {
    res.status(500).json({ ok:false, msg:e.message });
  }
});

export default router;