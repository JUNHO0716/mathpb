// === Help FAB (독립 QR 모달 포털 버전) ===
(function () {
  document.addEventListener('DOMContentLoaded', function () {
    const fab  = document.getElementById('helpFab');
    const menu = document.getElementById('helpMenu');
    if (!fab || !menu) return;

    const closeMenu = () => menu.classList.remove('show');
    const toggleMenu = () => menu.classList.toggle('show');

    fab.addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(); });
    document.addEventListener('click', (e) => {
      if (!menu.contains(e.target) && !fab.contains(e.target)) closeMenu();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeKakaoQRPortal();
    });

    // ---------- QR 포털(Shadow DOM) ----------
    function ensureKakaoQRPortal() {
      let host = document.getElementById('kakao-qr-portal');
      if (host) return host;

      host = document.createElement('div');
      host.id = 'kakao-qr-portal';
      // 어떤 레이어/챗봇보다도 위에, 뷰포트 기준 고정
      host.style.position = 'fixed';
      host.style.inset = '0';
      host.style.zIndex = '2147483647'; // 최상위
      // flex 정중앙
      host.style.display = 'none';
      host.style.alignItems = 'center';
      host.style.justifyContent = 'center';
      // 다른 요소 CSS 영향 차단: Shadow DOM
      const shadow = host.attachShadow({ mode: 'open' });

      shadow.innerHTML = `
        <style>
          :host{ all: initial; }
          .backdrop{
            position: fixed; inset: 0;
            background: rgba(0,0,0,.45);
            backdrop-filter: blur(2px);
          }
          .card{
            position: relative;
            width: min(92vw, 360px);
            border-radius: 16px;
            background: #fff;
            box-shadow: 0 24px 80px rgba(0,0,0,.35);
            padding: 18px 18px 14px;
            text-align: center;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans KR", Arial, sans-serif;
          }
          h3{ margin: 2px 0 10px; font-size: 18px; color:#111; font-weight: 800; }
          img{ width: 240px; height: 240px; display:block; margin:12px auto 12px; }
          .open{
            display:inline-block; background:#FEE500; color:#191919; text-decoration:none;
            font-weight:800; padding:10px 14px; border-radius:10px;
          }
          .close{
            position:absolute; right:10px; top:8px; width:34px; height:34px;
            border-radius:50%; border:none; background:#f5f5f5; cursor:pointer;
            font-size:22px; line-height:1;
          }
          /* 포커스 아웃라인 */
          .close:focus, .open:focus { outline: 2px solid #111; outline-offset: 2px; }
          /* 중앙 정렬을 위한 래퍼 */
          .center{ position: fixed; inset: 0; display:flex; align-items:center; justify-content:center; }
        </style>
        <div class="backdrop" part="backdrop"></div>
        <div class="center">
          <div class="card" role="dialog" aria-modal="true" aria-labelledby="kakaoQrTitle">
            <button class="close" aria-label="닫기">&times;</button>
            <h3 id="kakaoQrTitle">카카오 채팅 QR</h3>
            <img id="kakaoQrImg" alt="카카오톡 채널 QR">
            <a id="kakaoQrOpen" class="open" target="_blank" rel="noopener">채팅창 열기</a>
          </div>
        </div>
      `;

      document.body.appendChild(host);

      const backdrop = shadow.querySelector('.backdrop');
      const closeBtn = shadow.querySelector('.close');
      backdrop.addEventListener('click', closeKakaoQRPortal);
      closeBtn.addEventListener('click', closeKakaoQRPortal);

      // ESC로 닫기
      window.addEventListener('keydown', escCloser, { passive: true });

      function escCloser(e){ if (e.key === 'Escape') closeKakaoQRPortal(); }

      // host에 컨트롤 함수 저장
      host._shadow = shadow;
      host._removeEsc = () => window.removeEventListener('keydown', escCloser);
      return host;
    }

    function openKakaoQRPortal(url, imgSrc) {
      const host = ensureKakaoQRPortal();
      const shadow = host._shadow;
      const img = shadow.getElementById('kakaoQrImg');
      const link = shadow.getElementById('kakaoQrOpen');

      const qr = imgSrc || ('https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=' + encodeURIComponent(url));
      img.src = qr;
      link.href = url;

      host.style.display = 'flex';
    }

    function closeKakaoQRPortal() {
      const host = document.getElementById('kakao-qr-portal');
      if (!host) return;
      host.style.display = 'none';
    }
    // ---------- QR 포털 끝 ----------

    // 메뉴 클릭 처리
    menu.querySelectorAll('li').forEach((li) => {
      li.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const url = li.dataset.url;
        const qrimg = li.dataset.qrimg;
        const isKakao = li.dataset.type === 'kakao' || li.dataset.qr === 'true';

        if (isKakao && url) {
          closeMenu();
          // ✅ 챗봇과 무관: 항상 독립 포털로 중앙에 띄움
          openKakaoQRPortal(url, qrimg);
          return;
        }

        if (url) {
          // ✅ 문의 게시판은 main.html 내부의 고객센터 페이지로 이동
          if (url.includes('main.html?menu=cs')) {
            location.href = url;
          } 
          // ✅ 나머지는 새 창으로 열기
          else {
            window.open(url, '_blank');
          }
        }
        closeMenu();
      });
    });
  });
})();
