

document.addEventListener('DOMContentLoaded', () => {
  // ★ Toss 테스트 클라이언트 키로 교체하세요 (test_ck_... 형태)
  const TOSS_CLIENT_KEY = "test_ck_0RnYX2w532okP2MNZRyPVNeyqApQ";

  // 단축 선택자
  const $  = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  // 필수 엘리먼트
  const mBtn = $('#mBtn');
  const yBtn = $('#yBtn');
  const planCards = $$('.plan');
  const subscribeBtn = $('#subscribeBtn');
  const agree = $('#agree');
  const chosen = $('#chosen');
  const methodChips = $$('.chip');

  // 요소 없으면 조용히 종료(다른 페이지에서 실행돼도 안 터지게)
  if (!mBtn || !yBtn || !subscribeBtn || !agree || !chosen || !planCards.length) {
    console.warn('[pricing] required elements not found; skip init');
    return;
  }

  // 상태
  let billingCycle = 'month'; // 'month' | 'year'
  let selected = null;
  let method = 'toss';        // 지금은 토스만 지원
  let busy = false; 

  // 결제수단(지금은 UI만)
  methodChips.forEach(chip => {
    chip.addEventListener('click', () => {
      methodChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      method = chip.dataset.method || 'toss';
    });
  });

  // 요금제 카드 선택 (selected 클래스로 통일)
  planCards.forEach(card => {
    card.addEventListener('click', () => {
      planCards.forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');

      const id = card.dataset.plan; // basic | standard | pro
      const price = billingCycle === 'year' ? Number(card.dataset.year)
                                            : Number(card.dataset.month);
      selected = { id, price };

      const title = card.querySelector('h3')?.textContent.trim() || id;
      chosen.textContent = `${title} - ${price.toLocaleString()}원 / ${billingCycle === 'year' ? '년' : '월'}`;
      refresh();
    });
  });

  // 월/연 전환
  [mBtn, yBtn].forEach(btn => {
    btn.addEventListener('click', () => {
      const month = (btn === mBtn);
      mBtn.classList.toggle('active', month);
      yBtn.classList.toggle('active', !month);
      billingCycle = month ? 'month' : 'year';

      const active = document.querySelector('.plan.selected');
      if (active && selected) {
        selected.price = month ? Number(active.dataset.month) : Number(active.dataset.year);
        const title = active.querySelector('h3')?.textContent.trim() || selected.id;
        chosen.textContent = `${title} - ${selected.price.toLocaleString()}원 / ${billingCycle === 'year' ? '년' : '월'}`;
      }
      refresh();
    });
  });

  // 약관 동의 → 버튼 활성화
  agree.addEventListener('change', refresh);
  function refresh(){ subscribeBtn.disabled = !(agree.checked && !!selected); }

    // 교체 후 (토스 v2 권장 방식)
async function openTossBilling(init) {
  try {
    const tossBilling = window.TossBilling(TOSS_CLIENT_KEY); // ✅ TossBilling 으로 변경
    await tossBilling.requestBillingAuth('카드', {          // ✅ '카드' 추가
      customerKey: init.customerKey,
      successUrl: init.successUrl,
      failUrl: init.failUrl
    });
  } catch (e) {
    console.error('Toss error:', e);
    alert(`토스 호출 실패: ${e?.code || ''} ${e?.message || e}`);
  }
}

  // 구독 시작하기
  subscribeBtn.addEventListener('click', async () => {
    if (subscribeBtn.disabled || busy) return;
    busy = true; 
    subscribeBtn.disabled = true;
    if (method !== 'toss') { alert('지금은 토스만 지원합니다.'); return; }

    try {
      const res = await fetch('/api/billing/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: selected.id, cycle: billingCycle })
      });

      if (res.status === 401) {
        alert('로그인 후 이용해주세요.');
        location.href = '/login.html?next=/pricing.html';
        return;
      }
      if (!res.ok) throw new Error(await res.text().catch(()=>res.statusText));

      const init = await res.json();
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
