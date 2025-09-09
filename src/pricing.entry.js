// src/pricing.entry.js
import { loadTossPayments } from '@tosspayments/tosspayments-sdk';

document.addEventListener('DOMContentLoaded', () => {
  // 공개 클라이언트 키: 테스트/운영에 맞게 server-side에서 주입하거나 window 전역으로 지정
  const CLIENT_KEY = (typeof window !== 'undefined' && window.TOSS_CLIENT_KEY)
    ? window.TOSS_CLIENT_KEY
    : 'test_ck_xxx';

  // 단축 선택자
  const $  = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  // 필수 엘리먼트
  const mBtn         = $('#mBtn');
  const yBtn         = $('#yBtn');
  const planCards    = $$('.plan');           // 각 요금제 article.plan (data-plan, data-month, data-year)
  const subscribeBtn = $('#subscribeBtn');
  const agree        = $('#agree');
  const chosen       = $('#chosen');          // 선택 요약 표시 영역
  const methodChips  = $$('.methods .chip');  // 결제수단 칩 (data-method="toss" | "card" | "vbank")

  // 상태값
  let billingCycle = 'month';   // 'month' | 'year'
  let selected     = null;      // { id, price }
  let method       = 'toss';    // UI 상에서만 쓰는 선택값 (현재는 토스만 지원)
  let busy         = false;

  // 유틸
  const fmt = (n) => Number(n).toLocaleString('ko-KR');

  // 초기화: 결제수단 칩 토글
  methodChips.forEach(chip => {
    chip.addEventListener('click', () => {
      methodChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      method = chip.dataset.method || 'toss';
    });
  });

  // 요금제 선택 버튼
  planCards.forEach(card => {
    const btn = card.querySelector('.select-btn');
    btn?.addEventListener('click', () => {
      // 기존 선택 해제
      planCards.forEach(c => c.classList.remove('selected'));

      // 현재 카드 선택
      card.classList.add('selected');

      const id     = card.dataset.plan;
      const price  = (billingCycle === 'year') ? Number(card.dataset.year)
                                               : Number(card.dataset.month);
      selected = { id, price };

      const title = card.querySelector('h3')?.textContent.trim() || id;
      chosen.textContent = `${title} - ${fmt(price)}원 / ${billingCycle === 'year' ? '년' : '월'}`;

      refresh();
    });
  });

  // 월/연 전환
  [mBtn, yBtn].forEach(btn => {
    btn.addEventListener('click', () => {
      const isMonth = (btn === mBtn);

      billingCycle = isMonth ? 'month' : 'year';
      mBtn.classList.toggle('active', isMonth);
      yBtn.classList.toggle('active', !isMonth);

      const active = document.querySelector('.plan.selected');
      if (active && selected) {
        selected.price = isMonth ? Number(active.dataset.month)
                                 : Number(active.dataset.year);

        const title = active.querySelector('h3')?.textContent.trim() || selected.id;
        chosen.textContent = `${title} - ${fmt(selected.price)}원 / ${billingCycle === 'year' ? '년' : '월'}`;
      }
      refresh();
    });
  });

  // 약관 동의 → 버튼 활성화
  agree.addEventListener('change', refresh);
  function refresh() {
    subscribeBtn.disabled = !(agree.checked && !!selected);
  }

  // 설치(npm) 방식: 통합 SDK → payment() → requestBillingAuth
  async function openTossBilling(init) {
    try {
      const toss = await loadTossPayments(CLIENT_KEY);
      const payment = toss.payment({ customerKey: init.customerKey });

      await payment.requestBillingAuth({
        method: 'CARD',
        successUrl: init.successUrl,
        failUrl: init.failUrl
      });
    } catch (e) {
      console.error('Toss billing open error:', e);
      alert(`토스 호출 실패: ${e?.message || e}`);
    }
}

  // 구독 시작하기
  subscribeBtn.addEventListener('click', async () => {
    if (subscribeBtn.disabled || busy) return;

    // ⚠️ 지금은 토스만 지원
    if (method !== 'toss') {
      alert('지금은 토스 간편결제만 지원합니다.');
      return;
    }

    busy = true;
    subscribeBtn.disabled = true;

    try {
      // 서버에서 등록창 파라미터 받기 (서버가 금액/주기 확정)
      const res = await fetch('/api/billing/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          plan:  selected?.id,
          cycle: billingCycle
        })
      });

      if (res.status === 401) {
        alert('로그인 후 이용해주세요.');
        location.href = '/login.html?next=/pricing.html';
        return;
      }
      if (!res.ok) {
        const msg = await res.text().catch(() => res.statusText);
        throw new Error(msg || '초기화 실패');
      }

      const init = await res.json(); // { customerKey, successUrl, failUrl, ... }
      await openTossBilling(init);
    } catch (err) {
      console.error(err);
      alert('결제를 시작할 수 없습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      busy = false;
      subscribeBtn.disabled = false;
    }
  });

  // 초기 버튼 상태
  refresh();
});
