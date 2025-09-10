// src/pricing.entry.js
import { loadTossPayments } from '@tosspayments/tosspayments-sdk';

document.addEventListener('DOMContentLoaded', () => {
  const CLIENT_KEY = (typeof window !== 'undefined' && window.TOSS_CLIENT_KEY)
    ? window.TOSS_CLIENT_KEY
    : 'test_ck_0RnYX2w532okP2MNZRyPVNeyqApQ';

  const $  = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  const mBtn         = $('#mBtn');
  const yBtn         = $('#yBtn');
  const planCards    = $$('.plan');
  const subscribeBtn = $('#subscribeBtn');
  const agree        = $('#agree');
  const chosen       = $('#chosen');
  const methodChips  = $$('.methods .chip');

  let billingCycle = 'month';
  let selected     = null;
  let method       = 'toss';
  let busy         = false;

  const fmt = (n) => Number(n).toLocaleString('ko-KR');

  methodChips.forEach(chip => {
    chip.addEventListener('click', () => {
      methodChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      method = chip.dataset.method || 'toss';
    });
  });

  planCards.forEach(card => {
    const btn = card.querySelector('.select-btn');
    btn?.addEventListener('click', () => {
      planCards.forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      updateSelection();
    });
  });

  // 2. 연간 버튼 스크립트 오류 수정
  [mBtn, yBtn].forEach(btn => {
    btn.addEventListener('click', () => {
      const isMonth = (btn === mBtn);
      billingCycle = isMonth ? 'month' : 'year';
      mBtn.classList.toggle('active', isMonth);
      yBtn.classList.toggle('active', !isMonth);

      // 모든 플랜 카드의 가격 표시를 업데이트
      planCards.forEach(card => {
        const priceEl = card.querySelector('.price .num');
        const smallEl = card.querySelector('.price small');
        if (priceEl && smallEl) {
          const newPrice = isMonth ? card.dataset.month : card.dataset.year;
          priceEl.textContent = fmt(newPrice);
          smallEl.textContent = isMonth ? '/ 월' : '/ 년';
        }
      });
      // 선택된 요약 정보도 업데이트
      updateSelection();
    });
  });

  function updateSelection() {
    const selectedCard = $('.plan.selected');
    if (selectedCard) {
      const id = selectedCard.dataset.plan;
      const price = (billingCycle === 'year') ? Number(selectedCard.dataset.year) : Number(selectedCard.dataset.month);
      selected = { id, price };
      const title = selectedCard.querySelector('h3')?.textContent.trim() || id;
      chosen.textContent = `${title} - ${fmt(price)}원 / ${billingCycle === 'year' ? '년' : '월'}`;
    } else {
      selected = null;
      chosen.textContent = '아직 선택하지 않았어요.';
    }
    refresh();
  }

  agree.addEventListener('change', refresh);
  function refresh() {
    subscribeBtn.disabled = !(agree.checked && !!selected);
  }

  // 3. 토스 결제창 취소 메시지 수정
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
      if (e?.code === 'USER_CANCEL') {
        alert('결제가 취소되었습니다.');
      } else {
        alert(`결제창 호출 중 오류가 발생했습니다: ${e?.message || '알 수 없는 오류'}`);
      }
    }
  }

  subscribeBtn.addEventListener('click', async () => {
    if (subscribeBtn.disabled || busy) return;

    if (method !== 'toss') {
      alert('지금은 토스 간편결제만 지원합니다.');
      return;
    }

    busy = true;
    subscribeBtn.disabled = true;

    try {
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

      const init = await res.json();
      await openTossBilling(init);
    } catch (err) {
      console.error(err);
      alert('결제를 시작할 수 없습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      busy = false;
      refresh();
    }
  });

  refresh();
});
