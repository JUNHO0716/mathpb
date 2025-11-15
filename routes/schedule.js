// routes/schedule.js
import express from 'express';
import db from '../config/database.js';

const router = express.Router();

// ------------------------
// Utils
// ------------------------

// YYYY-MM-DD -> YYYYMMDD
const yyyymmdd = (iso) => (iso || '').replaceAll('-', '').slice(0, 8);

// 이름 비교용 정규화(공백/대소문자 무시)
const norm = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();

// ✅ 제목 필터: "토요휴업일" 변형들 제거 (공백/대소문자 무시)
const isSkipTitle = (title) => {
  const s = String(title || '').replace(/\s+/g, '').toLowerCase();
  return /(토요|토요일)휴업(일)?/.test(s);
};

// ✅ 학교급 판별/비교
const levelFromName = (name = '') => {
  const s = String(name);
  if (s.includes('고등학교')) return '고';
  if (s.includes('중학교')) return '중';
  if (s.includes('초등학교')) return '초';
  return '';
};
const isSameLevel = (val, want) => {
  if (!want) return true; // 원하는 급 정보가 없으면 통과
  const s = String(val || '').replace(/\s+/g, '');
  return (want === '고' && /고등학교/.test(s))
      || (want === '중' && /중학교/.test(s))
      || (want === '초' && /초등학교/.test(s));
};

// ------------------------
// Schema check
// ------------------------

// ✅ schools 테이블에 "NEIS 사무국 코드 후보"와 "NEIS 학교 코드 후보" 중
//    각각 최소 1개 이상 존재하면 통과(데이터가 어느 컬럼에 있든 작동)
async function requireSchoolCols() {
  const [rows] = await db.query(`
    SELECT column_name AS c
    FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'schools'
  `);
  const set = new Set(rows.map(r => String(r.c).toLowerCase()));

  const officeCandidates = [
    'neis_office_code', 'atpt_ofcdc_sc_code', 'office_code', 'moe_code'
  ];
  const schoolCandidates = [
    'neis_school_code', 'sd_schul_code', 'neis_code', 'neiscode', 'code'
  ];

  const hasOffice = officeCandidates.some(n => set.has(n));
  const hasSchool = schoolCandidates.some(n => set.has(n));

  const missing = [];
  if (!hasOffice) missing.push('NEIS office code column');
  if (!hasSchool) missing.push('NEIS school code column');

  return { ok: hasOffice && hasSchool, missing };
}

// ===== Picks helpers (GLOBAL, single source of truth) =====
const toKrLevelFromAny = (v) =>
  (v==='high'||v==='고'?'고등' : v==='middle'||v==='중'?'중등' : (v||'').replace('학교','') || '고등');

// 표준 스키마 보장: user_id + level + codes
async function ensurePicksTable(){
  await db.query(`
    CREATE TABLE IF NOT EXISTS user_schedule_picks (
      user_id    VARCHAR(191) NOT NULL,
      level      ENUM('고등','중등') NOT NULL,
      codes      JSON NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, level)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

// 현재 테이블의 실제 컬럼명 감지 (codes vs codes_json, level vs level_kr)
async function getPicksCols(){
  const [rows] = await db.query(`
    SELECT column_name AS c
    FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'user_schedule_picks'
  `);
  const set = new Set(rows.map(r => String(r.c).toLowerCase()));
  const codesCol = set.has('codes_json') ? 'codes_json' : 'codes';
  const levelCol = set.has('level_kr')   ? 'level_kr'   : 'level';
  return { codesCol, levelCol };
}



// ------------------------
// Mapping (codes -> NEIS meta)
// ------------------------

// ✅ 존재 컬럼 자동감지 + id/code/neis 어떤 값이 와도 NEIS 코드로 통일 매핑
async function getSchoolMetaMap(codes = []) {
  if (!codes.length) return new Map();

  // 1) schools 컬럼 목록
  const [colRows] = await db.query(`
    SELECT column_name AS c
    FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'schools'
  `);
  const has = n => colRows.some(r => r.c.toLowerCase() === String(n).toLowerCase());

  // 존재하는 컬럼만 COALESCE로 병합
  const coalesceExpr = (list, fallback = "''") => {
    const cols = list.filter(has).map(c => `\`${c}\``);
    if (!cols.length) return fallback;
    return cols.length === 1 ? cols[0] : `COALESCE(${cols.join(',')})`;
  };

  const officeExpr = coalesceExpr(['neis_office_code', 'ATPT_OFCDC_SC_CODE', 'atpt_ofcdc_sc_code', 'office_code', 'moe_code']);
  const neisExpr   = coalesceExpr(['neis_school_code', 'SD_SCHUL_CODE', 'sd_schul_code', 'NEIS_CODE', 'neis_code', 'code']);
  const nameExpr   = coalesceExpr(['name', 'SCHUL_NM', 'schul_nm', '학교명', 'short_name']);
  const cityExpr   = coalesceExpr(['city', 'ATPT_OFCDC_SC_NM', 'region']);
  const distExpr   = coalesceExpr(['district', 'JU_ORG_NM', 'SGG_NM']);
  const levelExpr  = coalesceExpr(['level', 'SCHUL_KND_SC_NM', 'schul_knd_sc_nm', 'school_level']);

  const idCol   = has('id') ? '`id`' : null;
  const codeCol = has('code') ? '`code`' : null;

  // 2) id/code/neis 직접 매칭
  const matchCols = [neisExpr, codeCol, idCol].filter(Boolean);
  const whereSql  = matchCols.length ? matchCols.map(c => `${c} IN (?)`).join(' OR ') : '1=0';
  const params    = matchCols.map(() => codes);

  const [rows] = await db.query(`
    SELECT
      ${officeExpr} AS office,
      ${neisExpr}   AS neis_code,
      ${nameExpr}   AS name,
      ${idCol || 'NULL'}   AS id,
      ${codeCol || 'NULL'} AS legacy_code
    FROM schools
    WHERE ${whereSql}
  `, params);

  const map = new Map();
  const found = new Set();

  // 매핑된 것들 맵에 적재
  for (const r of rows) {
    const meta = { office: r.office, name: r.name || '', neis: String(r.neis_code || '') };
    [r.neis_code, r.id, r.legacy_code].forEach(k => {
      if (k !== null && k !== undefined && String(k).trim() !== '') {
        map.set(String(k), meta);
        found.add(String(k));
      }
    });
  }

  // 3) 남은 키: "시/도|구/군|학교명" 이름 기반 느슨 매칭 (DB → 필요 시 NEIS 폴백)
  /* ✅ '서울특별시교육청', '송파교육지원청' 같은 값도 '서울', '송파'로 통일 */
  const normCity = s => String(s||'')
    .replace(/(특별자치도|특별자치시|광역시|특별시|자치도|도|시|교육청|교육지원청)/g,'')
    .trim();
  const normDist = s => String(s||'')
    .replace(/(시|군|구|교육지원청|교육청)/g,'')
    .trim();

  const leftovers = codes.filter(k => {
    const s = String(k || '');
    if (!s || found.has(s)) return false;
    const [c1, c2, c3] = s.split('|');
    return (c1 || c2 || c3); // "city|dist|name" 형태만 남김
  });

  for (const key of leftovers) {
    const [city = '', dist = '', nameRaw = ''] = String(key).split('|');
    const wantCity = normCity(city);
    const wantDist = normDist(dist);
    const fullName = nameRaw.trim();
    const shortNm  = fullName.replace(/(고등학교|중학교|초등학교)$/, '').trim();
    const wantLvl  = levelFromName(fullName);

    const [rowsByName] = await db.query(`
      SELECT
        ${officeExpr} AS office,
        ${neisExpr}   AS neis_code,
        ${nameExpr}   AS name,
        ${cityExpr}   AS region,
        ${distExpr}   AS district,
        ${levelExpr}  AS level
      FROM schools
      WHERE ${nameExpr} IN (?, ?)
      LIMIT 50
    `, [fullName, shortNm]);

    // ① 정확 동일명 우선
    const exactRows = rowsByName.filter(r => norm(r.name) === norm(fullName));
    const candRows  = exactRows.length ? exactRows : rowsByName;

    let picked = null;
    // ② 도시/구군/학교급까지 맞는 것 우선
    for (const r of candRows) {
      const rc = normCity(r.region);
      const rd = normDist(r.district);
      const cityOk  = !wantCity || rc === wantCity;
      const distOk  = !wantDist || rd === wantDist;
      const levelOk = isSameLevel(r.level, wantLvl);
      if (cityOk && distOk && levelOk) { picked = r; break; }
    }
    // ③ 그래도 없으면 학교급만 일치 → 마지막으로 첫 항목
    if (!picked) picked = candRows.find(r => isSameLevel(r.level, wantLvl)) || candRows[0];


    if (picked?.neis_code) {
      map.set(String(key), {
        office: picked.office,
        name: picked.name || fullName,
        neis: String(picked.neis_code)
      });
      continue;
    }

    // 3-2) (DB에 없을 때) NEIS schoolInfo 폴백
    if (process.env.NEIS_API_KEY) {
      try {
        const url = new URL('https://open.neis.go.kr/hub/schoolInfo');
        url.searchParams.set('KEY', process.env.NEIS_API_KEY);
        url.searchParams.set('Type', 'json');
        url.searchParams.set('pIndex', '1');
        url.searchParams.set('pSize', '100');
        // 1순위: 풀네임으로 정확 검색
        url.searchParams.set('SCHUL_NM', fullName || shortNm);

        let r = await fetch(url.toString());
        let j = await r.json().catch(() => ({}));
        let arr = j?.schoolInfo?.[1]?.row || [];

        // 결과 없으면 단축명으로 재시도
        if ((!arr || !arr.length) && shortNm && shortNm !== fullName) {
          url.searchParams.set('SCHUL_NM', shortNm);
          r = await fetch(url.toString());
          j = await r.json().catch(() => ({}));
          arr = j?.schoolInfo?.[1]?.row || [];
        }

        let list = arr;
        if (list.length) list = list.filter(v => isSameLevel(v.SCHUL_KND_SC_NM, wantLvl)) || list;   // ① 학교급
        const byExact = list.filter(v => norm(v.SCHUL_NM) === norm(fullName));
        if (byExact.length) list = byExact;                                                          // ② 정확 동일명

        let pick = null;                                                                             // ③ 도시/구군
        for (const v of list) {
          const rc = normCity(v.LCTN_SC_NM || v.ATPT_OFCDC_SC_NM);
          const rd = normDist(v.JU_ORG_NM || '');
          if ((!wantCity || rc === wantCity) && (!wantDist || rd === wantDist)) { pick = v; break; }
        }
        if (!pick) pick = list[0] || arr[0];     


        if (pick?.ATPT_OFCDC_SC_CODE && pick?.SD_SCHUL_CODE) {
          map.set(String(key), {
            office: String(pick.ATPT_OFCDC_SC_CODE),
            name:   String(pick.SCHUL_NM || fullName),
            neis:   String(pick.SD_SCHUL_CODE)
          });
        }
      } catch {}
    }
  }

  return map;
}

// 이름 정규화(공백/대소문자 무시) 유틸이 이미 있으니 재사용합니다: norm()

// ✅ NEIS schoolInfo로 이름 기준 매핑(정확동명 우선) 찾아오기 (풀네임 → 짧은이름 순)
async function lookupSchoolByName(fullName){
  if (!process.env.NEIS_API_KEY || !fullName) return null;

  const url = new URL('https://open.neis.go.kr/hub/schoolInfo');
  url.searchParams.set('KEY', process.env.NEIS_API_KEY);
  url.searchParams.set('Type', 'json');
  url.searchParams.set('pIndex', '1');
  url.searchParams.set('pSize', '100');
  url.searchParams.set('SCHUL_NM', fullName);

  const r = await fetch(url.toString());
  const j = await r.json().catch(()=> ({}));
  let arr = j?.schoolInfo?.[1]?.row || [];
  // 🔁 풀네임이 0건이면 '고/중/초등학교' 꼬리 제거한 이름으로 재조회
  if (!arr.length) {
    const shortNm = String(fullName).replace(/(고등학교|중학교|초등학교)$/,'').trim();
    if (shortNm) {
      url.searchParams.set('SCHUL_NM', shortNm);
      const r2 = await fetch(url.toString());
      const j2 = await r2.json().catch(()=> ({}));
      arr = j2?.schoolInfo?.[1]?.row || [];
    }
    if (!arr.length) return null;
  }

  // ① 정확 동일명 우선 → ② 첫 번째
  const pick = arr.find(v => norm(v.SCHUL_NM) === norm(fullName)) || arr[0];
  if (pick?.ATPT_OFCDC_SC_CODE && pick?.SD_SCHUL_CODE) {
    return {
      office: String(pick.ATPT_OFCDC_SC_CODE),
      neis:   String(pick.SD_SCHUL_CODE),
      name:   String(pick.SCHUL_NM || fullName),
    };
  }
  return null;
}
// ------------------------
// Route
// ------------------------

/**
 * GET /api/schedule/events
 * @query codes  : 콤마로 구분된 SD_SCHUL_CODE 목록 또는 "시/도|구/군|학교명" 목록
 * @query start  : "YYYY-MM-DD"
 * @query end    : "YYYY-MM-DD"
 *
 * 응답: { events: [{ schoolCode, schoolName, date:"YYYY-MM-DD", title }] }
 */
router.get('/events', async (req, res) => {
  const rawCodes = req.query.codes ?? '';
  const startISO = String(req.query.start || '').slice(0, 10);
  const endISO   = String(req.query.end   || '').slice(0, 10);

  const fromYMD = yyyymmdd(startISO);
  const toYMD   = yyyymmdd(endISO);

  console.log('[schedule] codes=', rawCodes, ' start=', startISO, ' end=', endISO, ' →', fromYMD, toYMD);

  try {
    const codeArr = String(rawCodes).split(',').map(s => s.trim()).filter(Boolean);

    if (!codeArr.length) return res.json({ events: [] });
    if (!startISO || !endISO) {
      return res.status(400).json({ error: 'start/end 쿼리 필요(YYYY-MM-DD)' });
    }
    if (!process.env.NEIS_API_KEY) {
      return res.status(500).json({ error: 'NEIS_API_KEY 미설정' });
    }

    // ✅ 필수 컬럼 점검
    const colCheck = await requireSchoolCols();
    if (!colCheck.ok) {
      return res.status(422).json({
        error: 'missing_columns',
        message: 'schools 테이블에 필요한 컬럼이 없습니다.',
        missing: colCheck.missing
      });
    }

    const metaMap = await getSchoolMetaMap(codeArr);
    console.log('[schedule] resolved keys →', Array.from(metaMap.keys()).slice(0, 10), '... size=', metaMap.size);

    // ✅ 매핑된 키만 호출
    const keys = codeArr.filter(k => metaMap.has(k));
    if (keys.length === 0) {
      return res.status(422).json({
        error: 'unmapped',
        message: '요청 키 중 DB에서 매핑된 학교가 없습니다.',
        keys: codeArr
      });
    }

    // 하나의 학교 일정 가져오기
    const fetchOne = async (key) => {
      const meta = metaMap.get(key);
      if (!meta) return [];
      let office   = meta.office;
      let neisCode = meta.neis;
      const label  = meta.name || '';
      if (!office || !neisCode) return [];

      // 내부 호출 함수
      async function callSchedule(officeCode, schoolCode){
        const url = new URL('https://open.neis.go.kr/hub/SchoolSchedule');
        url.searchParams.set('KEY', process.env.NEIS_API_KEY);
        url.searchParams.set('Type', 'json');
        url.searchParams.set('pIndex', '1');
        url.searchParams.set('pSize', '1000');
        url.searchParams.set('ATPT_OFCDC_SC_CODE', officeCode);
        url.searchParams.set('SD_SCHUL_CODE', schoolCode);
        url.searchParams.set('AA_FROM_YMD', fromYMD);
        url.searchParams.set('AA_TO_YMD', toYMD);

        const r = await fetch(url.toString(), { headers: { 'User-Agent': 'mathpb-schedule' } });
        if (!r.ok) return [];
        const j = await r.json().catch(() => ({}));
        const rows = j?.SchoolSchedule?.[1]?.row || j?.SchoolSchedule?.row || [];
        return Array.isArray(rows) ? rows : [];
      }

      // ① 1차 조회
      let rows = await callSchedule(office, neisCode);

      // ② 0건이면 이름으로 학교코드 재검증(가락고등학교 등 오매핑 보정)
      if (!rows.length && label) {
        const alt = await lookupSchoolByName(label);
        if (alt && (alt.office !== office || alt.neis !== neisCode)) {
          office   = alt.office;
          neisCode = alt.neis;
          rows     = await callSchedule(office, neisCode);
        }
      }

      // ③ 결과 변환(+ 토요휴업일 제외)
      return rows.map(v => {
        const ymd = String(v.AA_YMD || '');
        const d = ymd.length === 8 ? `${ymd.slice(0,4)}-${ymd.slice(4,6)}-${ymd.slice(6,8)}` : '';
        return {
          schoolCode: neisCode,
          schoolName: label || v.SCHUL_NM || '',
          date: d,
          title: v.EVENT_NM || v.EVENT_CONTENT || v.CONT || ''
        };
      }).filter(e => e.date && e.title && !isSkipTitle(e.title));
    };


    // 병렬 요청(10개 단위)
    const chunk = (arr, n) => arr.reduce((a,_,i)=> (i % n ? a : [...a, arr.slice(i, i+n)]), []);
    const chunks = chunk(keys, 10);

    let events = [];
    for (const group of chunks) {
      const part = await Promise.all(group.map(fetchOne));
      events = events.concat(...part);
    }

    // 중복 제거(같은 학교/날짜/제목)
    const uniq = new Map();
    for (const e of events) {
      const k = `${e.schoolCode}|${e.date}|${e.title}`;
      if (!uniq.has(k)) uniq.set(k, e);
    }

    return res.json({ events: Array.from(uniq.values()) });
  } catch (e) {
    console.error('[schedule/events] error', e);
    return res.status(500).json({ error: 'failed', detail: String(e?.message || e) });
  }
});

function isLoggedInJson(req, res, next) {
  const u = req.session?.user || req.user;
  if (u?.id) return next();
  return res.status(401).json({ ok:false, msg:'로그인이 필요합니다.' });
}

// ------------------------------------------------------------------
// 사용자별 '선택한 학교' 목록: 불러오기 / 저장 / 초기화
// ------------------------------------------------------------------
router.get('/picks', isLoggedInJson, async (req, res) => {
  try {
    await ensurePicksTable();
    const { codesCol, levelCol } = await getPicksCols();
    const userId = (req.session?.user || req.user).id;
    const level  = toKrLevelFromAny(req.query.level || req.query.l || '고등');

const [[row]] = await db.query(
  `SELECT ${codesCol} AS codes FROM user_schedule_picks WHERE user_id=? AND ${levelCol}=?`,
  [userId, level]
);

let codes = [];
const raw = row?.codes;

// 1) 안전 파싱: JSON이면 그대로, 문자열이면 JSON 시도 → 실패시 CSV 스플릿
if (Array.isArray(raw)) {
  codes = raw;
} else if (typeof raw === 'string') {
  const s = raw.trim();
  if (!s) codes = [];
  else {
    try { codes = JSON.parse(s); }
    catch { codes = s.split(',').map(v=>v.trim()).filter(Boolean); }
  }
} else if (raw && typeof raw === 'object') {
  // MySQL JSON 컬럼이 파싱돼 객체/배열로 오는 경우
  codes = Array.isArray(raw) ? raw : [];
}

// 2) 정규화: 문자열화, 공백 제거, 중복 제거, 15개 제한
codes = Array.from(new Set(codes.map(v => String(v).trim()).filter(Boolean))).slice(0, 15);

// 3) 만약 DB에 CSV(또는 JSON 아님)였다면, 이번 기회에 JSON으로 자동 교정 저장
if (typeof raw === 'string' && raw.trim() && raw.trim()[0] !== '[') {
  await db.query(
    `UPDATE user_schedule_picks SET ${codesCol}=? , updated_at=NOW()
     WHERE user_id=? AND ${levelCol}=?`,
    [JSON.stringify(codes), userId, level]
  );
}

return res.json({ ok:true, codes });

  } catch (e) {
    console.error('[GET /api/schedule/picks] error', e);
    res.status(500).json({ ok:false, msg:String(e?.message || e) });
  }
});

router.put('/picks', isLoggedInJson, async (req, res) => {
  try {
    await ensurePicksTable();
    const { codesCol, levelCol } = await getPicksCols();
    const userId = (req.session?.user || req.user).id;
    const level  = toKrLevelFromAny(req.body?.level || '고등');
    let codes  = Array.isArray(req.body?.codes) ? req.body.codes : [];
    codes = Array.from(new Set(codes.map(v => String(v).trim()).filter(Boolean))).slice(0, 15);

    await db.query(`
      INSERT INTO user_schedule_picks (user_id, ${levelCol}, ${codesCol})
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE ${codesCol}=VALUES(${codesCol}), updated_at=NOW()
    `, [userId, level, JSON.stringify(codes)]);

    res.json({ ok:true, saved: codes.length });
  } catch (e) {
    console.error('[PUT /api/schedule/picks] error', e);
    res.status(500).json({ ok:false, msg:String(e?.message || e) });
  }
});

router.delete('/picks', isLoggedInJson, async (req, res) => {
  try {
    await ensurePicksTable();
    const { codesCol, levelCol } = await getPicksCols();
    const userId = (req.session?.user || req.user).id;
    const level  = toKrLevelFromAny(req.query.level || req.query.l || '고등');

    await db.query(`
      INSERT INTO user_schedule_picks (user_id, ${levelCol}, ${codesCol})
      VALUES (?, ?, '[]')
      ON DUPLICATE KEY UPDATE ${codesCol}='[]', updated_at=NOW()
    `, [userId, level]);

    res.json({ ok:true, saved: 0 });
  } catch (e) {
    console.error('[DELETE /api/schedule/picks] error', e);
    res.status(500).json({ ok:false, msg:String(e?.message || e) });
  }
});


export default router;
