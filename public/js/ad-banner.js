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

    // 카드별 SVG 아이콘 반환 함수
    function getIconSvg(iconKey) {
      switch (iconKey) {
        case 1:
          // 예: 네이버 느낌 아이콘
          return `
            <svg class="ad-card-icon-svg" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="11" fill="#03C75A"></circle>
              <path d="M9 7h3l3 5v-5h2v10h-3l-3-5v5H9z" fill="#ffffff"></path>
            </svg>
          `;
        case 2:
          // 예: % 아이콘 (할인/구독)
          return `
            <svg class="ad-card-icon-svg" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="11" fill="#2563EB"></circle>
              <path d="M8 16l8-8" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/>
              <circle cx="9" cy="9" r="1.6" fill="#ffffff"/>
              <circle cx="15" cy="15" r="1.6" fill="#ffffff"/>
            </svg>
          `;
        case 3:
          // 예: 말풍선 아이콘 (챗봇/상담)
          return `
            <svg class="ad-card-icon-svg" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="11" fill="#F97316"></circle>
              <path d="M8 9a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v3.5a1 1 0 0 1-1 1h-3l-2.2 2.2a.6.6 0 0 1-1-.42V13.5H9a1 1 0 0 1-1-1V9z" fill="#ffffff"/>
              <circle cx="10" cy="10.5" r="0.7" fill="#F97316"/>
              <circle cx="12" cy="10.5" r="0.7" fill="#F97316"/>
              <circle cx="14" cy="10.5" r="0.7" fill="#F97316"/>
            </svg>
          `;
        case 4:
          // 예: 문서/연필 아이콘 (시험지/에디터)
          return `
            <svg class="ad-card-icon-svg" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="11" fill="#6366F1"></circle>
              <rect x="8" y="7" width="8" height="10" rx="1.2" fill="#ffffff"/>
              <path d="M9.5 9.2h5" stroke="#6366F1" stroke-width="1.4" stroke-linecap="round"/>
              <path d="M9.5 11.5h5" stroke="#6366F1" stroke-width="1.4" stroke-linecap="round"/>
              <path d="M9.5 13.8h3" stroke="#6366F1" stroke-width="1.4" stroke-linecap="round"/>
            </svg>
          `;
        default:
          // 기본: 1번과 같은 아이콘
          return `
            <svg class="ad-card-icon-svg" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="11" fill="#03C75A"></circle>
              <path d="M9 7h3l3 5v-5h2v10h-3l-3-5v5H9z" fill="#ffffff"></path>
            </svg>
          `;
      }
    }

    // 카드/도트 생성 (이미지 대신 컬러 패널 카드)
    items.forEach((it, i) => {
      const nth = (i % 4) + 1; // 1~4번 카드 색상용
      const iconKey = it.iconType || nth; // ← 카드별 아이콘 키 (없으면 nth 사용)

      const a = document.createElement('a');
      a.className = `ad-card ad-card-${nth}`;
      a.href = it.url || '#';
      a.target = it.target || '_self';
      a.setAttribute('aria-label', it.alt || it.title || `광고 ${i + 1}`);

      const title = it.title || '';
      const desc  = it.desc  || '';
      const tag   = it.tag   || `PROMO ${nth}`;  // ← 상단 작은 문구

      // 👉 제목을 1줄/2줄로 나누고, 2번째 줄 앞에 SVG 아이콘 붙이기
      let titleHtml = '';
      if (title) {
        if (title.includes('<br>')) {
          const [line1, ...rest] = title.split('<br>');
          const line2 = rest.join('<br>'); // <br>가 여러 개여도 뒤에 붙이기
          const iconSvg = getIconSvg(iconKey);

          titleHtml = `
            <div class="ad-card-title">
              <div>${line1}</div>
              <div class="ad-card-title-line2">
                <span class="ad-card-icon" aria-hidden="true">
                  ${iconSvg}
                </span>
                <span class="ad-card-title-line2-text">${line2}</span>
              </div>
            </div>
          `;
        } else {
          // 한 줄짜리면 기존처럼 그대로
          titleHtml = `<div class="ad-card-title">${title}</div>`;
        }
      }

      a.innerHTML = `
        <div class="ad-card-content">
          ${tag ? `<div class="ad-card-tag">${tag}</div>` : ''}
          ${titleHtml}
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
