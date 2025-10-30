// 스택형 카드 캐러셀 모듈
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

    // 카드/도트 생성
    items.forEach((it, i) => {
      const a = document.createElement('a');
      a.className = 'ad-card';
      a.href = it.url || '#';
      a.target = it.target || '_self';
      a.setAttribute('aria-label', it.alt || it.title || `광고 ${i+1}`);
      a.innerHTML = `<img src="${it.img}" alt="${it.alt || it.title || ''}">`;
      cardsWrap.appendChild(a);

      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'ad-dot';
      dot.setAttribute('aria-label', `${i+1}번째 배너 보기`);
      dot.addEventListener('click', () => goTo(i, true));
      dotsWrap.appendChild(dot);
    });

    function applyClasses() {
      const cards = cardsWrap.querySelectorAll('.ad-card');
      const dots  = dotsWrap.querySelectorAll('.ad-dot');
      cards.forEach(c => c.className = 'ad-card');
      dots.forEach(d => d.classList.remove('is-active'));

      const n = cards.length;
      const iActive = index % n;
      const iNext   = (index + 1) % n;
      const iTail   = (index + 2) % n;

      cards[iActive].classList.add('is-active');
      cards[iNext].classList.add('is-next');
      cards[iTail].classList.add('is-tail');
      dots[iActive].classList.add('is-active');
    }

    function next()   { index = (index + 1) % items.length; applyClasses(); }
    function goTo(i){ index = i % items.length; applyClasses(); restart(); }
    function start(){ if (!timer) timer = setInterval(next, delay); }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    function restart(){ stop(); start(); }

    applyClasses(); start();

    // 호버/가시성 제어
    root.addEventListener('mouseenter', stop);
    root.addEventListener('mouseleave', start);
    document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());

    return { next, start, stop, goTo };
  };
})();
