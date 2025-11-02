// js/sync_schools_neis.js
import 'dotenv/config';
import db from '../config/database.js';

// Node 18+ 에서는 fetch 내장
const API_KEY = process.env.NEIS_API_KEY;
const ENDPOINT = 'https://open.neis.go.kr/hub/schoolInfo';

function toLevel(kind) {
  if (!kind) return null;
  if (kind.includes('고등')) return 'high';
  if (kind.includes('중학교')) return 'middle';
  return null; // 초/특수 제외
}

function splitRegionDistrict(addr = '') {
  const p = addr.trim().split(/\s+/);
  return { region: p[0] || '', district: p[1] || '' };
}

async function fetchPage(pIndex) {
  const url = `${ENDPOINT}?KEY=${API_KEY}&Type=json&pIndex=${pIndex}&pSize=1000`;
  const res = await fetch(encodeURI(url));
  if (!res.ok) throw new Error(`NEIS HTTP ${res.status}`);
  const json = await res.json();
  const root = json.schoolInfo;
  if (!Array.isArray(root) || root.length < 2) return { rows: [], total: 0 };

  const head = root[0]?.head?.[0];
  const total = Number(head?.list_total_count || 0);

  const rows = (root[1]?.row || []).map(r => ({
    officeCode: r.ATPT_OFCDC_SC_CODE,
    schoolCode: r.SD_SCHUL_CODE,
    name:       r.SCHUL_NM,
    kind:       r.SCHUL_KND_SC_NM,
    addr:       r.ORG_RDNMA || r.ORG_RDNDA || '',
    homepage:   r.HMPG_ADRES || null
  }));
  return { rows, total };
}

async function upsertBatch(items) {
  if (!items.length) return;
  // 개별 실행(안전) — 배치화도 가능하지만 안정성 우선
  for (const it of items) {
    const level = toLevel(it.kind);
    if (!level) continue;
    const { region, district } = splitRegionDistrict(it.addr);

    await db.query(
      `INSERT INTO schools
         (name, short_name, region, district, level, status,
          neis_office_code, neis_school_code, address, homepage, last_seen_at)
       VALUES (?,?,?,?,?,'active', ?,?,?,?, NOW())
       ON DUPLICATE KEY UPDATE
         name=VALUES(name),
         region=VALUES(region),
         district=VALUES(district),
         level=VALUES(level),
         status='active',
         address=VALUES(address),
         homepage=VALUES(homepage),
         last_seen_at=VALUES(last_seen_at)`,
      [it.name, null, region, district, level,
       it.officeCode, it.schoolCode, it.addr, it.homepage]
    );
  }
}

export async function run() {
  if (!API_KEY) throw new Error('NEIS_API_KEY not set in .env');

  const first = await fetchPage(1);
  await upsertBatch(first.rows);

  const pages = Math.ceil(first.total / 1000);
  for (let p = 2; p <= pages; p++) {
    const { rows } = await fetchPage(p);
    await upsertBatch(rows);
  }
  console.log(`[NEIS] sync complete. total≈${first.total}`);
}

// 직접 실행
if (import.meta.url === `file://${process.argv[1]}`) {
  run().then(() => process.exit(0)).catch(e => {
    console.error(e); process.exit(1);
  });
}
