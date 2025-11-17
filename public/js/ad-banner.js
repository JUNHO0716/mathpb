// 스택형 카드 캐러셀 모듈 (색 카드 버전)
(function () {
  window.initAdBanner = function (rootSelector, items, opts = {}) {
    const root = typeof rootSelector === 'string' ? document.querySelector(rootSelector) : rootSelector;
    if (!root) return null;

    const delay = opts.delay || 4500; // 자동 전환 주기
    let index = 0, timer = null;

    // 마크업 구성
    root.classList.add('ad-stack-root');
    root.innerHTML = `
      <div class="ad-stack" role="region" aria-roledescription="carousel">
        <div class="ad-cards"></div>
        <div class="ad-dots" aria-hidden="true"></div>
      </div>
    `;
    const cardsWrap = root.querySelector('.ad-cards');
    const dotsWrap  = root.querySelector('.ad-dots');

    // 카드/도트 생성 (이미지 대신 컬러 패널 카드)
    items.forEach((it, i) => {
      const nth = (i % 4) + 1; // 1~4번 카드 색상용

      const a = document.createElement('a');
      a.className = `ad-card ad-card-${nth}`;
      a.href = it.url || '#';
      a.target = it.target || '_self';
      a.setAttribute('aria-label', it.alt || it.title || `광고 ${i + 1}`);

      const title = it.title || '';
      const desc  = it.desc  || '';

      a.innerHTML = `
        <div class="ad-card-content">
          <div class="ad-card-tag">PROMO ${nth}</div>
          <div class="ad-card-title">${title}</div>
          ${desc ? `<div class="ad-card-desc">${desc}</div>` : ''}
        </div>
      `;
      cardsWrap.appendChild(a);

      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'ad-dot';
      dot.setAttribute('aria-label', `${i + 1}번째 배너 보기`);
      dot.addEventListener('click', () => goTo(i, true));
      dotsWrap.appendChild(dot);
    });

    function applyClasses() {
      const cards = cardsWrap.querySelectorAll('.ad-card');
      const dots  = dotsWrap.querySelectorAll('.ad-dot');
      if (!cards.length) return;

      cards.forEach(c => {
        // is-active / is-next / is-tail 외에는 공통 ad-card만 유지
        c.className = c.className.split(' ')
          .filter(cls => !['is-active','is-next','is-tail'].includes(cls))
          .join(' ');
      });
      dots.forEach(d => d.classList.remove('is-active'));

      const n = cards.length;
      const iActive = index % n;
      const iNext   = (index + 1) % n;
      const iTail   = (index + 2) % n;

      cards[iActive].classList.add('is-active');
      if (n > 1) cards[iNext].classList.add('is-next');
      if (n > 2) cards[iTail].classList.add('is-tail');
      dots[iActive].classList.add('is-active');
    }

    function next()   { index = (index + 1) % items.length; applyClasses(); }
    function goTo(i){ index = i % items.length; applyClasses(); restart(); }
    function start(){ if (!timer && items.length > 1) timer = setInterval(next, delay); }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    function restart(){ stop(); start(); }

    if (items && items.length) {
      applyClasses();
      start();
    }

    // 호버/가시성 제어
    root.addEventListener('mouseenter', stop);
    root.addEventListener('mouseleave', start);
    document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());

    return { next, start, stop, goTo };
  };
})();
