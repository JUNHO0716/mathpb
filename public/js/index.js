// 날짜 표시
const wk = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const mo = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function setToday() {
  const t = new Date();
  document.getElementById('todayTxt').textContent =
    `${wk[t.getDay()]}  ${String(t.getDate()).padStart(2, '0')} ${mo[t.getMonth()]} ${t.getFullYear()}`;
}

let currentUser = null;

// js/index.js 파일에서 이 함수를 통째로 바꿔주세요.

async function loadContent(url) {
  const contentFrame = document.getElementById('contentFrame');
  if (!contentFrame) return;

  // 1. 기존 내용을 지우고 로딩 스피너를 표시합니다.
  contentFrame.innerHTML = '<div class="spinner"></div>';
  contentFrame.classList.add('loading');

  try {
    const pageUrl = url.split('?')[0];

    const response = await fetch(url + (url.includes('?') ? '&' : '?') + 'ts=' + Date.now(), {
      credentials: 'include',
      cache: 'no-store'
    });

    if (response.status === 401) {
      location.href = '/login.html';
      return;
    }
    if (!response.ok) {
      throw new Error('페이지를 불러올 수 없습니다.');
    }

    const htmlText = await response.text();
    
    // 2. 로딩이 완료되면 스피너 관련 클래스를 제거합니다.
    contentFrame.classList.remove('loading');
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, 'text/html');
    
    // 3. 가져온 페이지의 내용으로 교체합니다.
    contentFrame.innerHTML = doc.body.innerHTML;

    const scripts = Array.from(doc.body.querySelectorAll('script'));
    for (const oldScript of scripts) {
      const newScript = document.createElement('script');
      if (oldScript.src) {
        newScript.src = oldScript.src;
        newScript.async = false;
        await new Promise((resolve) => {
          newScript.onload = resolve;
          newScript.onerror = resolve;
          document.body.appendChild(newScript);
        });
      } else {
        newScript.textContent = oldScript.textContent;
        document.body.appendChild(newScript);
        newScript.remove();
      }
    }

    // 불러온 페이지(url)에 따라 정확한 초기화 함수를 직접 호출해줍니다.
    switch (pageUrl) {
      case 'notice.html':
        if (window.initializeNoticePage) window.initializeNoticePage(currentUser);
        break;
      case 'profile.html':
        if (window.initializeProfilePage) window.initializeProfilePage(currentUser);
        break;
      case 'bookcase.html':
        if (window.initializeBookcasePage) window.initializeBookcasePage(currentUser);
        break;
      case 'upload.html':
        if (window.initializeUploadPage) window.initializeUploadPage(currentUser);
        break;
      case 'high.html':
        if (window.initializeHighPage) window.initializeHighPage(currentUser);
        break;
      case 'home.html':
        if (window.initializeHomePage) window.initializeHomePage(currentUser);
        break;
    }

    // 한번 사용한 초기화 함수들은 전역(window)에서 깔끔하게 정리합니다.
    delete window.initializeNoticePage;
    delete window.initializeProfilePage;
    delete window.initializeBookcasePage;
    delete window.initializeUploadPage;
    delete window.initializeHighPage;
    delete window.initializeHomePage;

  } catch (error) {
    console.error('콘텐츠 로딩 실패:', error);
    
    // 에러 발생 시에도 스피너를 제거하고 에러 메시지를 표시합니다.
    contentFrame.classList.remove('loading');
    contentFrame.innerHTML =
      `<div style="padding:40px; text-align:center;">페이지를 불러오는 데 실패했습니다.</div>`;
  }
}


/* [수정 1]
  기존의 window.addEventListener('message', ...) 코드를 삭제하고,
  그 역할을 대신할 이 함수를 새로 만들었습니다.
  home.html 같은 페이지에서 이 함수를 호출하게 됩니다.
*/
window.handleChildNavigation = (data) => {
  // "더보기" 버튼 클릭 시
  if (data && data.type === 'goNoticeMore') {
    document.querySelectorAll('.menu-item').forEach(i => {
      i.classList.remove('active');
      const icon = i.querySelector('.menu-icon');
      if (icon) icon.src = icon.dataset.iconWhite;
    });
    const noticeMenu = document.getElementById('menu6');
    noticeMenu.classList.add('active');
    const icon = noticeMenu.querySelector('.menu-icon');
    if (icon) icon.src = icon.dataset.iconWhite.replace('_w.png', '_b.png');
    const pageTitle = document.getElementById('pageTitle');
    if (pageTitle) pageTitle.innerHTML = `<span class="highlight">No</span>tice`;
    loadContent('notice.html');
  }

  // "최근 업로드 더보기" 버튼 클릭 시
  if (data && data.type === 'goUploadMore') {
    document.querySelectorAll('.menu-item').forEach(i => {
      i.classList.remove('active');
      const icon = i.querySelector('.menu-icon');
      if (icon) icon.src = icon.dataset.iconWhite;
    });
    const menu3 = document.getElementById('menu3');
    menu3.classList.add('active');
    const icon = menu3.querySelector('.menu-icon');
    if (icon) icon.src = icon.dataset.iconWhite; // 수정됨
    const pageTitle = document.getElementById('pageTitle');
    if (pageTitle) pageTitle.innerHTML = `<span class="highlight">Te</span>st paper`;
    loadContent('high.html');
  }

  // 특정 공지사항으로 바로 이동 시
  if (data && data.type === 'goNotice') {
    // ... (위와 동일한 메뉴 활성화/타이틀 변경 로직) ...
    loadContent('notice.html?id=' + data.noticeId);
  }
};


/* 로그인·프로필 바인딩 + 관리자 판별 */
let IS_ADMIN = false;
async function bindUser() {
  try {
    const res = await fetch('/check-auth?ts=' + Date.now(), {
      credentials: 'include',
      cache: 'no-store'
    });
    const d = await res.json();
    if (!d.isLoggedIn) return;
    const u = d.user || {};
    currentUser = u;

    // ✅ 로그인한 사용자의 챗봇 저장 키를 계정별로 고정
    window.__USER_ID = `u_${
      (u?.id && String(u.id).trim())
      || (u?.username && String(u.username).trim())
      || (u?.loginId && String(u.loginId).trim())
      || (u?.email === 'Kakao' ? (u?.name || '').trim() : ((u?.email || '').split('@')[0] || ''))
      || 'unknown'
    }`;

    // (선택) 과거 공용키('anon')로 저장된 기록은 노출 방지 차원에서 한 번만 지웁니다.
    try {
      localStorage.removeItem('mathpb_chat_history_v1:anon:' + location.pathname);
    } catch (e) {}
    
    let displayName;

    const loginType = u?.loginType || 'local';
    const rawId     = (typeof u?.id === 'string' ? u.id.trim() : '');
    const rawEmail  = (u?.email || '').trim();
    const name      = (u?.name || '').trim();

    // 이메일이 있으면 @ 앞부분
    let emailPrefix = '';
    if (rawEmail && rawEmail !== 'Kakao') {
      emailPrefix = rawEmail.includes('@') ? rawEmail.split('@')[0] : rawEmail;
    }

    // 1) 소셜 로그인(google/naver/kakao) → 이메일 @ 앞부분 우선
    if (loginType !== 'local') {
      if (emailPrefix)      displayName = emailPrefix;
      else if (name)        displayName = name;
      else if (rawId)       displayName = rawId;
      else                  displayName = 'Guest';
    }
    // 2) 예전 카카오(이메일이 'Kakao'로만 오는 경우) → 이름 사용
    else if (rawEmail === 'Kakao' && name) {
      displayName = name;
    }
    // 3) 일반 로그인 → 아이디 / username / loginId
    else if (rawId) {
      displayName = rawId;
    } else if (typeof u?.username === 'string' && u.username.trim()) {
      displayName = u.username.trim();
    } else if (typeof u?.loginId === 'string' && u.loginId.trim()) {
      displayName = u.loginId.trim();
    }
    // 4) 그 외는 이메일 @앞 → 이름 → Guest
    else if (emailPrefix) {
      displayName = emailPrefix;
    } else if (name) {
      displayName = name;
    } else {
      displayName = 'Guest';
    }

    document.getElementById('index-headerProfileName').textContent =
      displayName || 'Guest';
    
    const avatarEl = document.getElementById('index-headerAvatar');
    
    if (avatarEl) {
      if (u.avatarUrl && u.avatarUrl.trim() !== "") {
        avatarEl.src = u.avatarUrl;
      } else {
        avatarEl.src = 'image_index/profile.png';
      }
      avatarEl.alt = displayName;
    }

      document.getElementById('userBox').classList.remove('loading');

      // 서버가 주는 어떤 키라도 받아서 불리언으로 통일
      const isAdmin = !!(u.isAdmin ?? u.is_admin);
      IS_ADMIN = isAdmin;

      const menu = document.getElementById('dropdownMenu');
      let goAdminEl = document.getElementById('goAdminPage');

      // ❗ 없다면 직접 만들어서 메뉴에 삽입
      if (!goAdminEl && menu) {
        goAdminEl = document.createElement('a');
        goAdminEl.id = 'goAdminPage';
        goAdminEl.href = '/admin.html';
        goAdminEl.textContent = '관리자 페이지';

        // 기존 항목 클래스 복사(디자인 유지)
        const sample = menu.querySelector('a');
        if (sample) goAdminEl.className = sample.className;

        goAdminEl.style.display = 'none';
        // 첫 항목 위쪽/아래쪽 원하는 위치로 조정 가능
        menu.insertBefore(goAdminEl, menu.firstChild);

        goAdminEl.addEventListener('click', (e) => {
          e.preventDefault();
          window.location.href = '/admin.html';
        });
      }

      // ❗ 최종 토글
      if (goAdminEl) {
        goAdminEl.style.display = isAdmin ? 'block' : 'none';
      }

  } catch (e) {
    console.error(e);
  }
}

// 프로필 드롭다운
function initDropdown() {
  const box = document.getElementById('userBox');
  const menu = document.getElementById('dropdownMenu');
  const arrow = document.getElementById('arrowIcon');

  box.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = menu.classList.contains('show');
    menu.classList.toggle('show');
    arrow.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
  });

  document.addEventListener('click', e => {
    if (!menu.contains(e.target) && !box.contains(e.target)) {
      menu.classList.remove('show');
      arrow.style.transform = 'rotate(0deg)';
    }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  // 기본 UI 설정
  setToday();
  initDropdown();

    // ▼▼▼ 여기에 스크롤 감지 코드를 추가하세요 ▼▼▼
  const contentFrame = document.getElementById('contentFrame');
  const mobileNav = document.getElementById('mobileNav');

  if (contentFrame && mobileNav) {
    let lastScrollTop = 0; // 마지막 스크롤 위치를 저장

    // AJAX 콘텐츠 영역인 contentFrame의 스크롤을 감지합니다.
    contentFrame.addEventListener('scroll', function() {
      // 뷰포트 너비가 768px 이하일 때만 동작 (모바일에서만)
      if (window.innerWidth <= 768) {
        let scrollTop = contentFrame.scrollTop; // 현재 스크롤 위치

        // 아래로 스크롤하고, 스크롤 위치가 50px 이상일 때
        if (scrollTop > lastScrollTop && scrollTop > 50) {
          mobileNav.classList.add('mobile-nav--hidden'); // 메뉴 숨기기
        } else {
          mobileNav.classList.remove('mobile-nav--hidden'); // 메뉴 보이기
        }
        lastScrollTop = scrollTop <= 0 ? 0 : scrollTop;
      }
    });
  }
  // ▲▲▲ 여기까지 추가 ▲▲▲

    // ▼▼▼ 모바일 드롭다운 '공지사항' 버튼 이벤트 (추가) ▼▼▼
  const mobileNoticeBtn = document.getElementById('mobileNoticeBtn');
  if (mobileNoticeBtn) {
    mobileNoticeBtn.addEventListener('click', (e) => {
      e.preventDefault();

      // 1. 공지사항 페이지 로드
      loadContent('notice.html');

      // 2. 페이지 제목 변경
      const t = menuTitles.menu6;
      if (t) setPageTitle(t.highlight, t.text);

      // 3. 하단 메뉴 활성화 모두 해제
      document.querySelectorAll('.mobile-nav-item').forEach(i => {
        i.classList.remove('active');
      });

      // 4. 드롭다운 닫기
      const menu = document.getElementById('dropdownMenu');
      const arrow = document.getElementById('arrowIcon');
      menu.classList.remove('show');
      arrow.style.transform = 'rotate(0deg)';
    });
  }
  // ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲
  
  // 사용자 정보를 가져올 때까지 기다립니다.
  await bindUser();

  // 사용자 정보 로딩이 끝난 후, 첫 화면을 로딩합니다.
  const first = document.getElementById('menu1');
  first.classList.add('active');
  const firstIcon = first.querySelector('.menu-icon');
  // 아이콘 변경: 첫 메뉴를 선택된 아이콘(_b.png)으로 설정
  firstIcon.src = firstIcon.dataset.iconWhite.replace('_w.png', '_b.png');
  document.querySelectorAll('.menu-item:not(#menu1) .menu-icon').forEach(icon => {
    icon.src = icon.dataset.iconWhite;
  });
  loadContent(first.dataset.url);

  // 나머지 이벤트 리스너들을 설정합니다.
  const sidebarLogout = document.getElementById('menu8');
  if (sidebarLogout) sidebarLogout.addEventListener('click', async () => {
    try {
      await fetch('/logout', {
        credentials: 'include'
      });
      location.href = '/login.html';
    } catch (e) {
      console.error('로그아웃 실패', e);
    }
  });
  const dropdownLogout = document.getElementById('logoutBtn');
  async function logout() {
    await fetch('/logout', {
      credentials: 'include'
    });
    location.href = '/login.html';
  }
  if (sidebarLogout) sidebarLogout.addEventListener('click', logout);
  if (dropdownLogout) dropdownLogout.addEventListener('click', logout);

  // ▼▼▼▼▼ 모바일 하단 메뉴 이벤트 리스너 (추가) ▼▼▼▼▼
  document.querySelectorAll('.mobile-nav-item').forEach(item => {
    item.addEventListener('click', function(e) {
      e.preventDefault(); // a 태그의 기본 동작 방지
      
      const url = this.dataset.url;
      const menuId = this.id.replace('mobile-', ''); // 'mobile-menu1' -> 'menu1'
      const t = menuTitles[menuId];

      // '시험지 요청'(menu5) 클릭 시 권한 확인 로직 (PC와 동일)
      if (menuId === 'menu5') {
        const plan = (currentUser?.plan || 'free').toLowerCase();
        const ok = (currentUser?.role === 'admin') || ['standard','pro'].includes(plan);
        if (ok) {
          setMobileActiveMenu(this);
          if (t) setPageTitle(t.highlight, t.text);
          loadContent(url);
        } else {
          Swal.fire({
            icon: 'warning',
            title: '이용 불가',
            text: 'STANDARD 이상 구독 시 이용 가능한 기능입니다.',
            showCancelButton: true,
            showConfirmButton: false,
            cancelButtonText: '닫기',
            cancelButtonColor: '#444',
            background: '#1a1a1a',
            color: '#ffffff',
            iconColor: '#FDC512',
            customClass: {
              actions: 'swal2-actions-center'
            }
          });
        }
      } else if (url) {
        // 다른 메뉴 항목은 정상적으로 페이지 로드 및 메뉴 활성화
        setMobileActiveMenu(this);
        if (t) setPageTitle(t.highlight, t.text);
        loadContent(url);
      }
    });
  });

  function setMobileActiveMenu(activeItem) {
    document.querySelectorAll('.mobile-nav-item').forEach(i => {
      i.classList.remove('active');
    });
    activeItem.classList.add('active');
  }
  // ▲▲▲▲▲ 모바일 하단 메뉴 이벤트 리스너 (추가) ▲▲▲▲▲



});

// 메뉴 등장 애니메이션 순차적 적용
window.addEventListener('DOMContentLoaded', () => {
  const menuIds = ["menu1", "menu2", "menu3", "menu4", "menu5", "menu6", "menu7", "menu8"];
  menuIds.forEach((id, idx) => {
    const el = document.getElementById(id);
    setTimeout(() => {
      el.classList.add("show");
    }, 300 + idx * 80);
  });
});

function toggleSidebarAnim() {
  const sb = document.getElementById('sidebar');
  const btn = document.getElementById('toggleBtn');
  sb.classList.toggle('collapsed');
  btn.classList.toggle('active');
}

// ▼▼▼▼▼ 여기가 수정된 부분입니다 ▼▼▼▼▼
document.querySelectorAll('.menu-item').forEach(item => {
  item.addEventListener('click', function() {
    const url = this.dataset.url;
    const menuId = this.id;
    const t = menuTitles[menuId];

    // '시험지 요청'(menu5) 클릭 시 권한 확인 로직
    if (menuId === 'menu5') {
      const plan = (currentUser?.plan || 'free').toLowerCase();
      const ok = (currentUser?.role === 'admin') || ['standard','pro'].includes(plan);
      if (ok) {
        setActiveMenu(this);
        if (t) setPageTitle(t.highlight, t.text);
        loadContent(url);
      } else {
        Swal.fire({
          icon: 'warning',
          title: '이용 불가',
          text: 'STANDARD 이상 구독 시 이용 가능한 기능입니다.',
          showCancelButton: true,
          showConfirmButton: false,
          cancelButtonText: '닫기',
          cancelButtonColor: '#444',
          background: '#1a1a1a',
          color: '#ffffff',
          iconColor: '#FDC512',
          customClass: {
            actions: 'swal2-actions-center'
          }
        });
      }
    } else if (url) {
      // 다른 메뉴 항목은 정상적으로 페이지 로드 및 메뉴 활성화
      setActiveMenu(this);
      if (t) setPageTitle(t.highlight, t.text);
      loadContent(url);
    }
  });
});
// ▲▲▲▲▲ 여기가 수정된 부분입니다 ▲▲▲▲▲

// 메뉴 활성화 및 타이틀 변경을 위한 헬퍼 함수
function setActiveMenu(activeItem) {
  // 모든 메뉴를 비활성화하고 아이콘을 흰색(_w.png)으로 변경
  document.querySelectorAll('.menu-item').forEach(i => {
    i.classList.remove('active');
    var icon = i.querySelector('.menu-icon');
    if (icon) icon.src = icon.dataset.iconWhite;
  });
  // 클릭한 메뉴를 활성화
  activeItem.classList.add('active');
  var activeIcon = activeItem.querySelector('.menu-icon');
  // 활성화된 메뉴의 아이콘을 검은색(_b.png)으로 변경
  if (activeIcon) activeIcon.src = activeIcon.dataset.iconWhite.replace('_w.png', '_b.png');
}

function setPageTitle(highlight, text) {
  const pageTitle = document.getElementById('pageTitle');
  if (pageTitle) {
    pageTitle.innerHTML = `<span class="highlight">${highlight}</span>${text}`;
  }
}


window.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const menuParam = params.get('menu');
  if (menuParam === 'notice') {
    document.querySelectorAll('.menu-item').forEach(i => {
      i.classList.remove('active');
      var icon = i.querySelector('.menu-icon');
      if (icon) icon.src = icon.dataset.iconWhite;
    });
    const noticeMenu = document.getElementById('menu6');
    noticeMenu.classList.add('active');
    const icon = noticeMenu.querySelector('.menu-icon');
    if (icon) icon.src = icon.dataset.iconWhite.replace('_w.png', '_b.png');
    const pageTitle = document.getElementById('pageTitle');
    pageTitle.innerHTML = `<span class="highlight">No</span>tice`;
    
    /* [수정 2] 버그 수정
      .src 속성은 div에 없으므로 loadContent() 함수를 호출하도록 변경했습니다.
    */
    loadContent('notice.html');
  }
});

(function() {
  const sb = document.getElementById('sidebar');
  const btn = document.getElementById('toggleBtn');
  const willOpen = sb.classList.contains('collapsed');
  sb.classList.toggle('collapsed');
  btn.classList.toggle('active');
  sb.classList.remove('expanded');
  if (willOpen) {
    setTimeout(() => sb.classList.add('expanded'), 300);
  }
});

const menuTitles = {
  menu1: {
    highlight: "Ma",
    text: "in home"
  },
  menu2: {
    highlight: "Pr",
    text: "oblem Bank"
  },
  menu3: {
    highlight: "Te",
    text: "st paper"
  },
  menu4: {
    highlight: "My",
    text: " Library"
  },
  menu5: {
    highlight: "Up",
    text: "load files"
  },
  menu6: {
    highlight: "No",
    text: "tice"
  },
  menu7: {
    highlight: "My",
    text: " Account"
  },
  menu8: {
    highlight: "Lo",
    text: "gout"
  }
};

(function() {
  const KEY = 'mathbee_intro_dismissed_until'; // 저장 키 이름을 용도에 맞게 변경

  function qs(id) { return document.getElementById(id); }

  function bindIntroModal() {
    const overlay = qs('introOverlay');
    if (!overlay) return;
    const btnClose = qs('introCloseBtn'),
          btnOk = qs('introOkBtn'),
          btnTodayClose = qs('introTodayCloseBtn');
    
    function openIntro() { overlay.classList.add('show'); document.body.style.overflow = 'hidden'; }
    function closeIntro(remember) {
      overlay.classList.remove('show'); document.body.style.overflow = '';
      if (remember) {
        try {
          const expiry = new Date().getTime() + (24 * 60 * 60 * 1000);
          localStorage.setItem(KEY, expiry);
        } catch (e) {}
      }
    }
    
    btnClose?.addEventListener('click', () => closeIntro(false));
    btnOk?.addEventListener('click', () => closeIntro(false));
    btnTodayClose?.addEventListener('click', () => closeIntro(true));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeIntro(false); });
    
    const dismissedUntil = localStorage.getItem(KEY);
    if (!dismissedUntil || new Date().getTime() > dismissedUntil) {
      setTimeout(openIntro, 800);
    }
    window.showIntro = function() { localStorage.removeItem(KEY); openIntro(); };
  }

// ✅ 매쓰비 챗봇 버튼: main.html 쉘로 라우팅
document.addEventListener('DOMContentLoaded', () => {
  const chatBtn = document.getElementById('headerChatbotBtn');
  if (!chatBtn) return;

  chatBtn.addEventListener('click', (e) => {
    e.preventDefault();
    window.location.href = 'main.html?menu=chatbot_main';
  });
});

  bindIntroModal();
})();

