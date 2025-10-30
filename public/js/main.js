// 전역 변수 선언
let currentUser = null;

// 사용자 정보 바인딩 함수
async function bindUser() {
  try {
    const res = await fetch('/check-auth?ts=' + Date.now(), {
      credentials: 'include',
      cache: 'no-store'
    });
    if (!res.ok) {
        if (res.status === 401) window.location.href = '/login.html';
        return;
    }
    const d = await res.json();
    if (!d.isLoggedIn) return;

    const u = d.user || {};
    currentUser = u;

    let displayName = u.name || 'Guest'; // 기본값은 이름으로 설정

    // 카카오가 아닌 다른 사용자(구글, 네이버, 일반)이고 이메일이 있다면,
    // 이메일의 @ 앞부분을 이름으로 사용합니다.
    if (u.email && u.email !== 'Kakao') {
        displayName = u.email.split('@')[0];
    } else if (u.email === 'Kakao') {
        // 카카오 사용자는 DB의 name 필드(카카오 닉네임)를 그대로 사용합니다.
        displayName = u.name;
    }

    document.getElementById('profileName').textContent = displayName || 'Guest';
    
    const avatarEl = document.getElementById('avatar');
    if (u.avatarUrl && u.avatarUrl.trim() !== "") {
      avatarEl.src = u.avatarUrl;
    } else {
      avatarEl.src = 'icon_my_b.png';
    }
    
    document.getElementById('userBox').classList.remove('loading');
    
    if (u.role === 'admin') {
      document.getElementById('goAdminPage').style.display = 'block';
    } else {
      document.getElementById('goAdminPage').style.display = 'none';
    }
  } catch (e) {
    console.error("사용자 정보 로딩 실패:", e);
    document.getElementById('userBox').classList.remove('loading');
  }
}

// 드롭다운 초기화 함수
function initDropdown() {
  const box = document.getElementById('userBox');
  const menu = document.getElementById('dropdownMenu');
  const arrow = document.getElementById('arrowIcon');

  if (!box || !menu || !arrow) return;

  box.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = menu.style.display === 'block';
    menu.style.display = isOpen ? 'none' : 'block';
    arrow.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
  });

  document.addEventListener('click', e => {
    if (menu.style.display === 'block' && !menu.contains(e.target)) {
      menu.style.display = 'none';
      arrow.style.transform = 'rotate(0deg)';
    }
  });
}

async function loadContent(url) {
  const contentFrame = document.getElementById('content-area');
  if (!contentFrame) return;

  contentFrame.innerHTML = '';

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('페이지를 불러올 수 없습니다.');
    const htmlText = await response.text();

    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, 'text/html');

    // ① 외부 스타일시트(head/body 모두) → <head>로 승격 & 중복 방지
    const existingHrefs = Array.from(document.head.querySelectorAll('link[rel="stylesheet"]'))
      .map(l => l.getAttribute('href'));
    const cssLinks = Array.from(doc.querySelectorAll('link[rel="stylesheet"]'));
    for (const linkEl of cssLinks) {
      const href = linkEl.getAttribute('href');
      if (!href) continue;
      if (!existingHrefs.includes(href)) {
        const newLink = document.createElement('link');
        newLink.rel = 'stylesheet';
        newLink.href = href;
        document.head.appendChild(newLink); // CSS는 비동기 로드
      }
    }

    // ② 본문 주입
    contentFrame.innerHTML = doc.body.innerHTML;

    // ③ 스크립트 재주입(기존 로직 유지)
    const scripts = Array.from(doc.body.querySelectorAll('script'));
    for (const oldScript of scripts) {
      const newScript = document.createElement('script');
      Array.from(oldScript.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
      if (oldScript.src) {
        await new Promise((resolve, reject) => {
          newScript.onload = resolve;
          newScript.onerror = reject;
          document.head.appendChild(newScript);
        });
      } else {
        newScript.textContent = oldScript.textContent;
        document.body.appendChild(newScript).remove();
      }
    }
  } catch (error) {
    console.error('콘텐츠 로딩 실패:', error);
    contentFrame.innerHTML = `<div style="padding:40px; text-align:center;">페이지를 불러오는 데 실패했습니다.</div>`;
  }
}


document.addEventListener('DOMContentLoaded', function () {
  const navLinks = document.querySelectorAll('header .nav-link, .mobile-bottom-nav .nav-link');
  bindUser();
  initDropdown();

  // 모바일 하단 메뉴 활성화 전용 함수
  function setActiveMobileMenu(page) {
    document.querySelectorAll('.mobile-bottom-nav .icon-button').forEach(btn => {
      if (btn.dataset.page === page) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  // 모바일 하단 메뉴 스크롤 기능
  const contentArea = document.getElementById('content-area');
  const mobileNav = document.querySelector('.mobile-bottom-nav');
  if (contentArea && mobileNav) {
    let lastScrollTop = 0;
    contentArea.addEventListener('scroll', function() {
      if (window.innerWidth <= 1023) {
        let scrollTop = contentArea.scrollTop;
        if (scrollTop > lastScrollTop && scrollTop > 50) {
          mobileNav.classList.add('mobile-bottom-nav--hidden');
        } else {
          mobileNav.classList.remove('mobile-bottom-nav--hidden');
        }
        lastScrollTop = scrollTop <= 0 ? 0 : scrollTop;
      }
    });
  }

  // 로그아웃 버튼 이벤트
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
            await fetch('/logout', { credentials: 'include' });
            window.location.href = '/login.html';
        } catch (err) {
            console.error('로그아웃 실패:', err);
            alert('로그아웃 중 오류가 발생했습니다.');
        }
    });
  }

  // ▼▼▼ [핵심 수정] 내비게이션 링크 클릭 이벤트 핸들러 ▼▼▼
  navLinks.forEach(link => {
    link.addEventListener('click', function (e) {
      e.preventDefault();
      
      // 1. 클릭된 링크에서 pageToLoad 변수를 가져옵니다.
      const pageToLoad = this.getAttribute('data-page');

      if (pageToLoad) {
        // 2. 콘텐츠를 로드합니다.
        loadContent(pageToLoad);

        // 3. 모든 메뉴의 활성 상태를 초기화합니다.
        navLinks.forEach(item => item.classList.remove('active'));
        
        // 4. 클릭된 메뉴와 동일한 data-page를 가진 모든 링크(PC+모바일)를 활성화합니다.
        document.querySelectorAll(`.nav-link[data-page="${pageToLoad}"]`).forEach(btn => {
          btn.classList.add('active');
        });

        // 5. 모바일 하단 메뉴 아이콘의 활성 상태를 별도로 관리합니다.
        setActiveMobileMenu(pageToLoad);
      }
    });
  });

  // 페이지 처음 로드 시 URL 파라미터 확인
  const params = new URLSearchParams(window.location.search);
  const menuToActivate = params.get('menu');
  if (menuToActivate) {
    const pageToLoad = `${menuToActivate}.html`;
    const buttonToClick = document.querySelector(`.nav-link[data-page="${pageToLoad}"]`);
    
    if (buttonToClick) {
      loadContent(pageToLoad);
      navLinks.forEach(item => item.classList.remove('active'));
      document.querySelectorAll(`.nav-link[data-page="${pageToLoad}"]`).forEach(btn => {
        btn.classList.add('active');
      });
      setActiveMobileMenu(pageToLoad);
    }
  }
});