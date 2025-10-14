import express from 'express';
import crypto from 'crypto';
import db from '../config/database.js';
import { isLoggedIn, isAdmin, needAuthJson } from '../middleware/auth.js';
import { getPrice, resolvePlan, resolveCycle } from '../utils/pricing.js';
import { tossAuthHeader } from '../utils/toss.js';
import fetch from 'node-fetch';

const router = express.Router();
const BASE_URL = process.env.BASE_URL || 'https://mathpb.com';

// --- 카카오페이 API 호출 헬퍼 함수 ---
const callKakaoApi = async (url, body) => {
  const headers = {
    'Authorization': `SECRET_KEY ${process.env.KAKAO_ADMIN_KEY}`,
    'Content-Type': 'application/json',
  };
  const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  return response.json();
};

// 구독 상태
router.get('/subscription/status', needAuthJson, async (req, res) => {
  const uid = req.session.user.id;
  const [[u]] = await db.query(
    `SELECT is_subscribed, subscription_start, subscription_end FROM users WHERE id=?`, [uid]
  );
  if (!u) return res.status(404).json({ ok:false });
  const now = new Date();
  const end = u.subscription_end ? new Date(u.subscription_end) : null;
  const active = (u.is_subscribed === 1) || (end && end > now);
  res.json({
    ok: true,
    status: active ? 'active' : 'inactive',
    next_billing_at: end ? u.subscription_end : null,
    pay_method: null
  });
});

// 결제 이력
router.get('/subscription/history', needAuthJson, async (req, res) => {
  res.json({ ok:true, items: [] });
});

// 구독 해지
router.post('/subscription/cancel', needAuthJson, async (req, res) => {
  await db.query(`UPDATE users SET is_subscribed=0 WHERE id=?`, [req.session.user.id]);
  res.json({ ok:true, message:'cancel scheduled' });
});

// 결제수단 등록 시작
router.post('/start', isLoggedIn, async (req, res) => {
  try {
    const user = req.session.user;
    const { plan, cycle, method } = req.body || {};
    const planKey  = resolvePlan(plan);
    const cycleKey = resolveCycle(cycle);
    const price    = getPrice(planKey, cycleKey);
    const customerKey = `u_${user.id}`;
    const orderId = `bill_${crypto.randomUUID()}`;

    req.session._subMeta = { plan: planKey, price, cycle: cycleKey, orderId };

    if (method === 'kakao') {
      // --- 카카오페이 결제 준비 ---
      const kakaoBody = {
        cid: process.env.KAKAO_CID_SUBSCRIPTION,
        partner_order_id: orderId,
        partner_user_id: customerKey,
        item_name: `${planKey} ${cycleKey} 정기결제`,
        quantity: 1,
        total_amount: 0, // 첫 결제는 인증이므로 0원
        tax_free_amount: 0,
        approval_url: `${BASE_URL}/api/billing/callback/kakao/approve`,
        cancel_url: `${BASE_URL}/api/billing/callback/kakao/cancel`,
        fail_url: `${BASE_URL}/api/billing/callback/kakao/fail`,
      };
      const data = await callKakaoApi('https://open-api.kakaopay.com/online/v1/payment/ready', kakaoBody);
      
console.log('카카오페이 응답:', data);

      if (data.tid) {
        req.session._subMeta.tid = data.tid;
        res.json({
          method: 'kakao',
          redirectUrl: data.next_redirect_pc_url
        });
      } else {
        throw new Error(data.msg || '카카오페이 준비 실패');
      }
    } else {
      // --- 기존 토스페이먼츠 로직 ---
      const successUrl = `${BASE_URL}/api/billing/callback/success`;
      const failUrl    = `${BASE_URL}/api/billing/callback/fail`;
      res.json({
        method: 'toss',
        customerKey, orderId, amount: 0, orderName: `${planKey} ${cycleKey}`, successUrl, failUrl
      });
    }
  } catch (e) {
    console.error('billing/start error', e);
    res.status(500).json({ msg: '초기화 실패' });
  }
});

// 토스페이먼츠 등록 성공 콜백
router.get('/callback/success', isLoggedIn, async (req, res) => {
  try {
    const { customerKey, authKey } = req.query;
    if (!customerKey || !authKey) return res.status(400).send('누락된 파라미터');

    const r = await fetch('https://api.tosspayments.com/v1/billing/authorizations/issue', {
      method: 'POST',
      headers: { 'Authorization': tossAuthHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerKey, authKey })
    });
    const data = await r.json();
    if (!r.ok) {
      console.error('Issue billingKey failed:', data);
      return res.status(400).send(`빌링키 발급 실패: ${data.message || data.code || 'error'}`);
    }

    const billingKey = data?.billingKey;
    if (!billingKey) return res.status(500).send('billingKey 없음');

    const meta = req.session._subMeta || {};
    delete req.session._subMeta;

    await db.query(`
      INSERT INTO billing_keys (user_id, provider, customer_key, billing_key, plan, cycle, price)
      VALUES (?, 'toss', ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        provider = 'toss', customer_key = VALUES(customer_key), billing_key  = VALUES(billing_key),
        plan = VALUES(plan), cycle = VALUES(cycle), price = VALUES(price)
    `, [req.session.user.id, customerKey, billingKey, meta.plan || null, meta.cycle || null, meta.price || null]);

    const startDate = new Date();
    const endDate = new Date();
    if (meta.cycle === 'year') {
      endDate.setFullYear(startDate.getFullYear() + 1);
    } else {
      endDate.setMonth(startDate.getMonth() + 1);
    }
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    await db.query(`
      UPDATE users SET is_subscribed = 1, subscription_start = ?, subscription_end = ? WHERE id = ?
    `, [startDateStr, endDateStr, req.session.user.id]);

    return res.redirect('/index.html?payment_success=true');
  } catch (e) {
    console.error('billing success cb error', e);
    return res.status(500).send('서버 오류');
  }
});

// 카카오페이 정기결제 승인 콜백
router.get('/callback/kakao/approve', isLoggedIn, async (req, res) => {
    const { pg_token } = req.query;
    const meta = req.session._subMeta || {};
    const customerKey = `u_${req.session.user.id}`;

    if (!pg_token || !meta.tid) {
        return res.status(400).send('카카오페이 승인 실패: 필수 정보 누락');
    }
    try {
        const approveBody = {
            cid: process.env.KAKAO_CID_SUBSCRIPTION,
            tid: meta.tid,
            partner_order_id: meta.orderId,
            partner_user_id: customerKey,
            pg_token: pg_token,
        };
        const data = await callKakaoApi('https://open-api.kakaopay.com/online/v1/payment/approve', approveBody);

        if (data.sid) {
            await db.query(`
              INSERT INTO billing_keys (user_id, provider, customer_key, billing_key, plan, cycle, price)
              VALUES (?, 'kakao', ?, ?, ?, ?, ?)
              ON DUPLICATE KEY UPDATE
                provider = 'kakao', customer_key = VALUES(customer_key), billing_key = VALUES(billing_key),
                plan = VALUES(plan), cycle = VALUES(cycle), price = VALUES(price)
            `, [req.session.user.id, customerKey, data.sid, meta.plan || null, meta.cycle || null, meta.price || null]);

            const startDate = new Date();
            const endDate = new Date();
            if (meta.cycle === 'year') {
                endDate.setFullYear(startDate.getFullYear() + 1);
            } else {
                endDate.setMonth(startDate.getMonth() + 1);
            }
            const startDateStr = startDate.toISOString().split('T')[0];
            const endDateStr = endDate.toISOString().split('T')[0];

            await db.query(`
              UPDATE users SET is_subscribed = 1, subscription_start = ?, subscription_end = ? WHERE id = ?
            `, [startDateStr, endDateStr, req.session.user.id]);

            delete req.session._subMeta;
            return res.redirect('/index.html?payment_success=true');
        } else {
            throw new Error(data.msg || `승인 실패 코드: ${data.code}`);
        }
    } catch (e) {
        console.error('Kakao approve callback error', e);
        return res.status(500).send('서버 오류: 카카오페이 승인 실패');
    }
});

// 카카오페이 실패/취소 콜백
router.get('/callback/kakao/fail', isLoggedIn, (req, res) => {
    res.status(400).send(`카카오페이 등록 실패`);
});
router.get('/callback/kakao/cancel', isLoggedIn, (req, res) => {
    res.redirect('/pricing.html');
});

// 토스페이먼츠 등록 실패 콜백
router.get('/callback/fail', isLoggedIn, (req, res) => {
  const { code, message } = req.query;
  res.status(400).send(`결제수단 등록 실패 [${code}] ${message || ''}`);
});

// 자동결제 승인
router.post('/charge', isLoggedIn, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { orderName } = req.body;
    const [[bk]] = await db.query(
      'SELECT customer_key, billing_key, price, plan, cycle FROM billing_keys WHERE user_id=?', [userId]
    );
    if (!bk) return res.status(400).json({ msg: '등록된 결제수단(빌링키) 없음' });

    const amount = Number(bk.price);
    if (!(amount > 0)) return res.status(400).json({ msg: '금액 오류' });

    const orderId = `sub_${crypto.randomUUID()}`;
    const url = `https://api.tosspayments.com/v1/billing/${encodeURIComponent(bk.billing_key)}`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': tossAuthHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, orderId, orderName: orderName || '정기 구독 결제', customerKey: bk.customer_key })
    });
    const data = await r.json();
    if (!r.ok) {
      console.error('billing charge failed:', data);
      return res.status(400).json({ ok: false, error: data });
    }

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const end = new Date(); end.setDate(today.getDate() + 30);
    const endStr = end.toISOString().split('T')[0];

    await db.execute(`
      UPDATE users SET is_subscribed = 1, subscription_start = ?, subscription_end = ? WHERE id = ?
    `, [todayStr, endStr, userId]);

    return res.json({ ok: true, payment: data });
  } catch (e) {
    console.error('billing charge error', e);
    res.status(500).json({ ok: false, msg: '서버 오류' });
  }
});

// 포인트 결제 요청
router.post('/api/payment-request', isLoggedIn, async (req, res) => {
  try {
    const { payer, amount, note } = req.body;
    await db.query(
      'INSERT INTO point_payments (user_id, payer, amount, note, status) VALUES (?, ?, ?, ?, "대기중")',
      [req.session.user.id, payer, amount, note]
    );
    await db.query(`
      DELETE FROM point_payments
      WHERE id NOT IN (SELECT id FROM (SELECT id FROM point_payments ORDER BY requested_at DESC LIMIT 100) tmp)
    `);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;