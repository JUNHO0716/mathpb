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

// 업서트 실행 (있는 컬럼만 채움)
async function upsertSchools(rows, levelFilter /* '고등'|'중등'|null */) {
  const cols = await detectSchoolCols();

  const baseCols = ['name', 'region', 'district', 'level'];
  if (cols.hasShort)    baseCols.push('short_name');
  if (cols.hasStatus)   baseCols.push('status');
  if (cols.hasHomepage) baseCols.push('homepage');
  if (cols.hasAddress)  baseCols.push('address');
  if (cols.hasOffice)   baseCols.push('neis_office_code');
  if (cols.hasCode)     baseCols.push('neis_school_code');
  if (cols.hasLastSeen) baseCols.push('last_seen_at');

  const updates = [];
  if (cols.hasStatus)   updates.push(`status=COALESCE(VALUES(status),schools.status)`);
  if (cols.hasShort)    updates.push(`short_name=COALESCE(VALUES(short_name),schools.short_name)`);
  if (cols.hasHomepage) updates.push(`homepage=CASE WHEN VALUES(homepage) IS NULL OR VALUES(homepage)='' THEN schools.homepage ELSE VALUES(homepage) END`);
  if (cols.hasAddress)  updates.push(`address=COALESCE(NULLIF(VALUES(address),''),schools.address)`);
  if (cols.hasOffice)   updates.push(`neis_office_code=COALESCE(VALUES(neis_office_code),schools.neis_office_code)`);
  if (cols.hasCode)     updates.push(`neis_school_code=COALESCE(VALUES(neis_school_code),schools.neis_school_code)`);
  if (cols.hasLastSeen) updates.push(`last_seen_at=GREATEST(COALESCE(schools.last_seen_at,'1970-01-01'), COALESCE(VALUES(last_seen_at), NOW()))`);

  // ✅ [수정] mysql2 방식에 맞게 VALUES ? 와 2차원 배열 사용
  const sql = `
    INSERT INTO schools (${baseCols.join(',')})
    VALUES ?
    ON DUPLICATE KEY UPDATE ${updates.length ? updates.join(',') : 'name=name'}
  `;

  // ✅ [수정] 1차원 params 배열 대신 2차원 allRows 배열 생성
  const allRows = [];
  const now = new Date(); // 모든 행에 동일한 시간 적용

  for (const r of rows) {
    const kLevel = mapLevel(r.SCHUL_KND_SC_NM);
    if (!kLevel) continue;
    if (levelFilter && kLevel !== levelFilter) continue;

    const name     = (r.SCHUL_NM||'').trim();
    const region   = (r.LCTN_SC_NM||'').trim();            // 시/도
    const district = extractDistrictFromNEISRow(r);        // ✅ 시/군/구
    const homepage = (r.HMPG_ADRES||'').trim() || null;
    const address  = (r.ORG_RDNMA||r.ORG_RDNDA||'').trim() || null;
    const shortN   = makeShortName(name);
    const office   = (r.ATPT_OFCDC_SC_CODE||'').trim() || null;
    const code     = (r.SD_SCHUL_CODE||'').trim() || null;

    // ✅ [수정] 1차원 배열(rowData) 생성
    const rowData = [name, region, district, kLevel];
    if (cols.hasShort)    rowData.push(shortN);
    if (cols.hasStatus)   rowData.push('active');
    if (cols.hasHomepage) rowData.push(homepage);
    if (cols.hasAddress)  rowData.push(address);
    if (cols.hasOffice)   rowData.push(office);
    if (cols.hasCode)     rowData.push(code);
    if (cols.hasLastSeen) rowData.push(now);
    
    // ✅ [수정] 2차원 배열에 rowData 추가
    allRows.push(rowData);
  }

  if (!allRows.length) return { inserted: 0, updated: 0 };

  // ✅ [수정] db.query에 sql과 2차원 배열(allRows)을 [allRows]로 감싸서 전달
  const [result] = await db.query(sql, [allRows]);
  return { affected: result.affectedRows || 0 };
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
