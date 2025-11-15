// routes/admin_schools.js
import express from 'express';
import db from '../config/database.js';
import { isLoggedIn } from '../middleware/auth.js';
import { verifyOrigin } from '../middleware/security.js';

const router = express.Router();

// 👉 files.js에 있는 ensureAdmin 그대로 복붙 (DB로 최종 관리자 확인)
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
        req.session.user.role   = row.role || req.session.user.role;
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

// ===== schools 컬럼 캐싱해서 address 존재 여부 확인 =====
let SCHOOL_COLS = null;
async function hasAddressCol() {
  if (!SCHOOL_COLS) {
    const [rows] = await db.query(`
      SELECT column_name AS c
      FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = 'schools'
    `);
    SCHOOL_COLS = new Set(rows.map(r => String(r.c).toLowerCase()));
  }
  return SCHOOL_COLS.has('address');
}

// 학교명 비교용 키(공백 / "학교" 제거)
function makeSchoolKey(s) {
  if (!s) return '';
  return String(s)
    .replace(/학교/g, '')
    .replace(/\s+/g, '')
    .trim();
}

// 🟣 학교 검색 (관리자용 – 학교명으로 region/district/관 확인)
router.get(
  '/api/admin/school-lookup',
  isLoggedIn,
  ensureAdmin,
  verifyOrigin,
  async (req, res) => {
    try {
      const q = String(req.query.q || '').trim();
      if (!q) return res.json({ items: [] });

      const key = makeSchoolKey(q);
      const hasAddr = await hasAddressCol();

      // address 컬럼이 있을 때만 SELECT에 포함
      const selectCols = hasAddr
        ? 'name, region, district, level, address'
        : 'name, region, district, level';

      const [rows] = await db.query(
        `
        SELECT ${selectCols}
        FROM schools
        WHERE
          -- 완전 일치
          name = ?
          OR REPLACE(name,'학교','') = REPLACE(?, '학교','')
          -- 공백/학교 제거 후, 문자열 포함 검색
          OR REPLACE(REPLACE(name,'학교',''),' ','') LIKE CONCAT('%', ?, '%')
        ORDER BY LENGTH(name)   -- 이름 짧은 것(보통 정식 교명) 우선
        LIMIT 20
        `,
        [q, q, key]
      );

      // address 컬럼이 없으면 그대로 반환 (지금처럼 "수지구"만 표시)
      if (!hasAddr) {
        return res.json({ items: rows });
      }

      // 📌 address(전체 주소)를 이용해서 district를 보기 좋게 가공
      const items = rows.map(row => {
        const out = { ...row };
        const addr = (row.address || '').trim();
        if (!addr) return out;

        // 예) "경기도 용인시 수지구 수풍로 73 ..."
        const parts = addr.split(/\s+/);
        const regionWord = parts[0] || '';   // 경기도 / 서울특별시 / 인천광역시 ...
        const second     = parts[1] || '';   // 용인시 / 송파구 / 부평구 ...
        const third      = parts[2] || '';   // 수지구 / (동 이름 등)

        let districtLabel = row.district || '';

        // 1) 경기도 용인시 수지구 → "용인시 수지구"
        if (/도$/.test(regionWord) && /시$/.test(second) && /구$/.test(third)) {
          districtLabel = `${second} ${third}`;
        }
        // 2) 서울특별시 송파구, 인천광역시 부평구 → "송파구", "부평구"
        else if (/시$/.test(regionWord) && /구$/.test(second)) {
          districtLabel = second;
        }
        // 3) 그 외: 두 번째 토큰이 시/군 정보인 경우 그대로 사용 (포천시 등)
        else if (!districtLabel && second) {
          districtLabel = second;
        }

        out.district = districtLabel;
        return out;
      });

      return res.json({ items });

    } catch (e) {
      console.error('school-lookup error:', e);
      res.status(500).json({ items: [], error: 'DB 오류' });
    }
  }
);

export default router;
