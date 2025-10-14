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
    
    let displayName = u.name || 'Guest'; // 기본값은 이름으로 설정

    // 카카오가 아닌 다른 사용자(구글, 네이버, 일반)이고 이메일이 있다면,
    // 이메일의 @ 앞부분을 이름으로 사용합니다.
    if (u.email && u.email !== 'Kakao') {
        displayName = u.email.split('@')[0];
    } else if (u.email === 'Kakao') {
        // 카카오 사용자는 DB의 name 필드(카카오 닉네임)를 그대로 사용합니다.
        displayName = u.name;
    }
    
    document.getElementById('index-headerProfileName').textContent = displayName || 'Guest';
    const avatarEl = document.getElementById('index-headerAvatar');
    
    if (avatarEl) {
      if (u.avatarUrl && u.avatarUrl.trim() !== "") {
        avatarEl.src = u.avatarUrl;
      } else {
        avatarEl.src = 'icon_my_b.png';
      }
      avatarEl.alt = displayName;
    }

    document.getElementById('userBox').classList.remove('loading');
    
    if (u.role === 'admin') {
      document.getElementById('goAdminPage').style.display = 'block';
    } else {
      document.getElementById('goAdminPage').style.display = 'none';
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
        if (currentUser && currentUser.hasPaid) {
          // 권한이 있으면 페이지 로드 및 메뉴 활성화
          setMobileActiveMenu(this);
          if (t) setPageTitle(t.highlight, t.text);
          loadContent(url);
        } else {
          // 권한이 없으면 모달창 표시
          Swal.fire({
            icon: 'warning',
            title: '이용 불가',
            text: '구독 회원만 이용 가능한 기능입니다.',
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
      if (currentUser && currentUser.hasPaid) {
        // 권한이 있으면 페이지 로드 및 메뉴 활성화
        setActiveMenu(this);
        if (t) setPageTitle(t.highlight, t.text);
        loadContent(url);
      } else {
        // 권한이 없으면 모달창 표시 (메뉴는 활성화하지 않음)
        Swal.fire({
          icon: 'warning',
          title: '이용 불가',
          text: '구독 회원만 이용 가능한 기능입니다.',
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

window.addEventListener('DOMContentLoaded', () => {
  const fab = document.getElementById('helpFab');
  const menu = document.getElementById('helpMenu');
  fab.addEventListener('click', () => {
    menu.classList.toggle('show');
  });
  document.addEventListener('click', e => {
    if (!menu.contains(e.target) && !fab.contains(e.target)) {
      menu.classList.remove('show');
    }
  });
  menu.querySelectorAll('li').forEach(li => {
    li.addEventListener('click', () => {
      const url = li.dataset.url;
      if (url) {
        // [수정] 문의 게시판 링크는 현재 창에서 이동하도록 변경
        if (url.includes('main.html?menu=cs')) {
          window.location.href = url;
        } else {
          window.open(url, '_blank'); // 나머지는 새 창으로 열기
        }
      }
      menu.classList.remove('show');
    });
  });
});

(function() {
  const KEY = 'mathbee_intro_dismissed_until'; // 저장 키 이름을 용도에 맞게 변경

  function qs(id) { return document.getElementById(id); }

  function bindIntroModal() {
    const overlay = qs('introOverlay');
    if (!overlay) return;
    // introTodayCloseBtn으로 ID 변경
    const btnClose = qs('introCloseBtn'), btnOk = qs('introOkBtn'), btnTodayClose = qs('introTodayCloseBtn');
    
    function openIntro() { overlay.classList.add('show'); document.body.style.overflow = 'hidden'; }
    function closeIntro(remember) {
      overlay.classList.remove('show'); document.body.style.overflow = '';
      if (remember) {
        try {
          // 영구 저장 대신, 현재 시간으로부터 24시간 뒤의 시간을 저장
          const expiry = new Date().getTime() + (24 * 60 * 60 * 1000);
          localStorage.setItem(KEY, expiry);
        } catch (e) {}
      }
    }
    
    btnClose?.addEventListener('click', () => closeIntro(false));
    btnOk?.addEventListener('click', () => closeIntro(false));
    // introTodayCloseBtn으로 이벤트 리스너 변경
    btnTodayClose?.addEventListener('click', () => closeIntro(true));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeIntro(false); });
    
    // 저장된 시간이 현재 시간보다 미래인지 확인
    const dismissedUntil = localStorage.getItem(KEY);
    if (!dismissedUntil || new Date().getTime() > dismissedUntil) {
      setTimeout(openIntro, 800);
    }
    
    window.showIntro = function() { localStorage.removeItem(KEY); openIntro(); };
  }
  bindIntroModal();
})();

// 🕒 날짜 자동 표시
const today = new Date();
const dateEl = document.getElementById("chatbotDate");
if (dateEl) {
  dateEl.textContent = `${today.getFullYear()}.${String(today.getMonth()+1).padStart(2,'0')}.${String(today.getDate()).padStart(2,'0')}`;
}

// 🟡 Chat 버튼 클릭 시 챗봇 열기/닫기 (애니메이션 버전)
const chatButton = document.getElementById("chatFab");
const chatbotBox = document.getElementById("chatbotBox");
const closeBtn   = document.getElementById("closeChatbot");
const chatInput  = document.getElementById("chatInput");

function openChat() {
  chatbotBox.classList.add("open");
  if (chatButton) chatButton.setAttribute("aria-expanded", "true");

  // 살짝 딜레이 후 포커스(전개 애니메이션과 겹치지 않게)
  setTimeout(() => chatInput?.focus(), 120);
  renderHistoryOnce(); // ← 추가
}
function closeChat() {
  chatbotBox.classList.remove("open");
  if (chatButton) chatButton.setAttribute("aria-expanded", "false");
}

if (chatButton && chatbotBox) {
  chatButton.setAttribute("aria-controls", "chatbotBox");
  chatButton.setAttribute("aria-expanded", "false");

  chatButton.addEventListener("click", () => {
    if (chatbotBox.classList.contains("open")) closeChat();
    else openChat();
  });
}

if (closeBtn) {
  closeBtn.addEventListener("click", closeChat);
}

// ESC로 닫기
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && chatbotBox.classList.contains("open")) {
    closeChat();
  }
});

// ✅ 챗봇 초기 인사
const messages = document.getElementById("chatbotMessages");
function addMessage(role, text) {
  const div = document.createElement("div");
  div.className = role === "user" ? "user-message" : "bot-message";

  if (role === "bot") {
    div.innerHTML = `
      <div class="avatar"></div>
      <div class="bubble">${text}</div>
    `;
  } else {
    div.innerHTML = `<div class="bubble">${text}</div>`;
  }

  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

// ===== 자동 스크롤 보정: 사용자가 위로 올려볼 땐 강제 스크롤 금지
let _autoStickToBottom = true;
function isNearBottom(el) {
  return el.scrollHeight - el.scrollTop - el.clientHeight < 20;
}
function maybeScrollToBottom() {
  if (_autoStickToBottom) messages.scrollTop = messages.scrollHeight;
}
messages.addEventListener('scroll', () => {
  _autoStickToBottom = isNearBottom(messages);
});

// 🧠 로딩 표시
function showLoading() {
  const loading = document.createElement("div");
  loading.className = "bot-message";
  loading.id = "loading";
  loading.innerHTML = `<div class="bubble"><span class="loading-dots">●●●</span></div>`;
  messages.appendChild(loading);
  messages.scrollTop = messages.scrollHeight;
}
function hideLoading() {
  const loading = document.getElementById("loading");
  if (loading) loading.remove();
}

// 인사 및 추천 버튼 표시
addMessage("bot", "안녕하세요 👋 MathPB 도우미입니다.<br>무엇을 도와드릴까요?");
messages.lastElementChild.style.marginBottom = "12px"; // 👈 추가
const suggestionBox = document.createElement("div");
suggestionBox.innerHTML = `
  <button class="suggest-btn">시험지 요청</button>
  <button class="suggest-btn">공지사항 보기</button>
  <button class="suggest-btn">결제 상태 확인</button>
`;
suggestionBox.style.display = "flex";
suggestionBox.style.flexWrap = "wrap";
suggestionBox.style.gap = "6px";
suggestionBox.style.marginTop = "8px";
messages.appendChild(suggestionBox);

let firstUserSent = false;
document.querySelectorAll(".suggest-btn").forEach(btn => {
  btn.style.border = "1px solid #ddd";
  btn.style.borderRadius = "20px";
  btn.style.padding = "6px 10px";
  btn.style.fontSize = "13px";
  btn.style.background = "#fff";
  btn.style.cursor = "pointer";

  btn.addEventListener("click", () => {
    const text = btn.textContent;

    // 첫 사용자 입력 시 칩과 말풍선 사이 간격 확보
    if (!firstUserSent) {
      const spacer = document.createElement("div");
      spacer.style.height = "8px";
      messages.appendChild(spacer);
      firstUserSent = true;
    }

    addMessage("user", text);
    showLoading();
    setTimeout(() => {
      hideLoading();
      addMessage("bot", `${text} 관련 안내를 드리겠습니다.`);
    }, 900);
  });
});

// Enter → 전송, Shift+Enter → 줄바꿈, 새로고침/새창 방지
// ============================
const chatForm = document.getElementById('chatbotForm');
const chatSendBtn = document.getElementById('chatSend');

// 폼 기본 제출(페이지 이동) 방지
if (chatForm) {
  chatForm.addEventListener('submit', (e) => e.preventDefault());
}

// 입력창: IME 조합 중(한글 입력) Enter는 무시, 일반 Enter는 전송
if (chatInput) {
  chatInput.addEventListener('keydown', (e) => {
    if (e.isComposing) return;          // 한글 조합 중이면 전송 금지
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();               // 폼 제출/개행 방지
      sendChatMessage();                // 전송
    }
    // Shift+Enter는 기본 동작으로 개행됨 (e.preventDefault() 안 함)
  });
}

// 전송 버튼 클릭 시도 동일 동작
if (chatSendBtn) {
  chatSendBtn.addEventListener('click', (e) => {
    e.preventDefault();
    sendChatMessage();
  });
}

// 실제 전송 함수 (우선 동작 검증용: 서버 스트림을 받아 텍스트로 붙임)
// ※ 3번(타자치는 효과), 4번(로딩 점 스타일/프로필/파도 효과)은 이후 단계에서 개선
async function sendChatMessage() {
  if (!chatInput) return;
  const text = chatInput.value.trim();
  if (!text) return;

  addMessage('user', text);

  chatHistory.push({ role: 'user', content: text, ts: Date.now() });
  saveChatHistory(chatHistory);
  chatInput.value = '';
  showLoading();

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: text }] })
    });

    // 서버가 text/event-stream으로 보내므로 스트림에서 한 덩어리씩 읽어서 합침
    const reader = res.body?.getReader?.();
    let botText = '';
    if (reader) {
      const decoder = new TextDecoder('utf-8');
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        // line 단위로 분리해 "data: {...}" 만 파싱
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const json = JSON.parse(data);
            botText += (json.output_text || '');
          } catch {}
        }
      }
    }
    finishBotTypingWith((botText && botText.trim()) ? botText : '(응답이 비어있습니다)');
    chatHistory.push({ role: 'bot', content: botText || '(응답이 비어있습니다)', ts: Date.now() });
    saveChatHistory(chatHistory);

    } catch (err) {
    finishBotTypingWith('(서버 연결에 실패했습니다. 잠시 후 다시 시도하세요)');
    chatHistory.push({ role: 'bot', content: '(서버 연결에 실패했습니다. 잠시 후 다시 시도하세요)', ts: Date.now() });
    saveChatHistory(chatHistory);

    console.error(err);
  }
}

// ============================
// [입력창 자동 높이] 최대 3줄까지 확장, 그 이후는 스크롤
// ============================
function autoResizeChatInput() {
  if (!chatInput) return;

  // 먼저 auto로 풀어 실제 scrollHeight를 정확히 측정
  chatInput.style.height = 'auto';

  const cs = window.getComputedStyle(chatInput);
  const lineHeight = parseFloat(cs.lineHeight) || 20;
  const paddingY =
    (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
  const borderY =
    (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0);

  // 최대 3줄까지
  const maxHeight = lineHeight * 3 + paddingY + borderY;

  // 실제 필요한 높이
  const needed = chatInput.scrollHeight;

  // 높이/스크롤 모드 반영
  chatInput.style.height = Math.min(needed, maxHeight) + 'px';
  chatInput.style.overflowY = needed > maxHeight ? 'auto' : 'hidden';
}

// 입력 변화 시 자동 리사이즈
if (chatInput) {
  // 기존 keydown(Enter/Shift+Enter) 로직은 그대로 두고,
  // 'input' 이벤트에서만 높이 갱신
  chatInput.addEventListener('input', autoResizeChatInput);

  // 초기 1회 세팅
  requestAnimationFrame(autoResizeChatInput);
}

// 메시지 전송 후 입력창 초기화 시에도 높이 재계산
const _origSendChatMessage = typeof sendChatMessage === 'function' ? sendChatMessage : null;
if (_origSendChatMessage) {
  window.sendChatMessage = async function(...args) {
    await _origSendChatMessage.apply(this, args);
    // 전송 과정에서 chatInput.value=''가 실행되므로 높이 축소
    autoResizeChatInput();
  }
}

// 챗봇 오픈 시 살짝 딜레이 후 포커스 + 높이 보정
// (openChat 함수가 위에 있다면 그 안에 아래 두 줄이 이미 있을 수 있습니다.)
if (typeof openChat === 'function') {
  const _origOpenChat = openChat;
  window.openChat = function(...args) {
    _origOpenChat.apply(this, args);
    setTimeout(() => {
      chatInput?.focus();
      autoResizeChatInput();
    }, 120);
  }
}

// ============================
// [타자 효과 유틸] HTML 태그는 한 번에, 텍스트는 한 글자씩
// ============================
function splitHTMLTokens(html) {
  const tokens = [];
  const regex = /(<[^>]+>)/g;
  let last = 0, m;
  while ((m = regex.exec(html)) !== null) {
    if (m.index > last) tokens.push({ type: 'text', value: html.slice(last, m.index) });
    tokens.push({ type: 'tag', value: m[1] });
    last = regex.lastIndex;
  }
  if (last < html.length) tokens.push({ type: 'text', value: html.slice(last) });
  return tokens;
}

function typeHTMLInto(el, html, speed = 18) {
  const tokens = splitHTMLTokens(html);
  let i = 0, j = 0, current = '';
  function step() {
    if (i >= tokens.length) return;
    const t = tokens[i];
    if (t.type === 'tag') {
      el.insertAdjacentHTML('beforeend', t.value);
      i++; j = 0;
      messages.scrollTop = messages.scrollHeight;
      requestAnimationFrame(step);
    } else {
      current = t.value;
      if (j < current.length) {
        el.insertAdjacentText('beforeend', current[j]);
        j++;
        messages.scrollTop = messages.scrollHeight;
        setTimeout(step, speed);
      } else {
        i++; j = 0;
        requestAnimationFrame(step);
      }
    }
  }
  step();
}

// ============================
// [봇 메시지 + 타자 효과로 출력]
// ============================
function addBotMessageTyping(text, speed = 18) {
  const div = document.createElement('div');
  div.className = 'bot-message';
  div.innerHTML = `<div class="avatar"></div><div class="bubble"></div>`;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;

  const bubble = div.querySelector('.bubble');
  // 개행 보정: \n → <br>
  const html = (text || '').replace(/\n/g, '<br>');
  typeHTMLInto(bubble, html, speed);
}

// ============================
// [봇 타이핑 대기 말풍선 관리]
// - showBotTyping(): 프로필+말풍선(+작은 점 파도) 추가
// - finishBotTypingWith(text): 같은 말풍선 안에 글자 타자치듯 출력
// - cancelBotTyping(): 말풍선 제거(실패 등)
// ============================
let _typingContainer = null; // .bot-message.typing
let _typingBubble = null;    // .bubble.typing

function showBotTyping() {
  // 중복 생성 방지
  if (_typingContainer && _typingBubble && document.body.contains(_typingContainer)) return;

  const div = document.createElement('div');
  div.className = 'bot-message typing';
  div.innerHTML = `
    <div class="avatar"></div>
    <div class="bubble typing">
      <span class="dots"><i></i><i></i><i></i></span>
    </div>
  `;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;

  _typingContainer = div;
  _typingBubble = div.querySelector('.bubble.typing');
}

function finishBotTypingWith(text, speed = 18) {
  if (_typingContainer && _typingBubble) {
    // 로딩 점 제거, typing 클래스 해제 후 같은 말풍선에 타자 효과
    _typingContainer.classList.remove('typing');
    _typingBubble.classList.remove('typing');
    _typingBubble.innerHTML = ''; // 점 삭제
    const html = (text || '').replace(/\n/g, '<br>');
    typeHTMLInto(_typingBubble, html, speed);

    // 사용 종료
    _typingContainer = null;
    _typingBubble = null;
  } else {
    // 혹시 로딩 말풍선이 없으면 새로 추가해서 출력
    addBotMessageTyping(text, speed);
  }
}

function cancelBotTyping() {
  if (_typingContainer) {
    _typingContainer.remove();
    _typingContainer = null;
    _typingBubble = null;
  }
}

// ===== 채팅 기록 저장/복원 (로컬스토리지) =====
const CHAT_HISTORY_KEY_BASE = 'mathpb_chat_history_v1';
function getChatUserKey() {
  // 로그인 사용자를 알 수 있으면 여기에 넣으세요. (예: window.__USER_ID)
  const user = window.__USER_ID || document.body?.dataset?.user || 'anon';
  // 페이지별로 분리 저장 (페이지가 여러 곳에서 챗봇을 쓸 수 있을 때 충돌 방지)
  return `${CHAT_HISTORY_KEY_BASE}:${user}:${location.pathname}`;
}
function loadChatHistory() {
  try {
    const raw = localStorage.getItem(getChatUserKey());
    const arr = raw ? JSON.parse(raw) : [];
    if (Array.isArray(arr)) return arr;
  } catch (e) { console.warn('history load failed', e); }
  return [];
}
function saveChatHistory(arr) {
  try {
    // 용량 방지를 위해 최근 200개까지만
    const trimmed = arr.slice(-200);
    localStorage.setItem(getChatUserKey(), JSON.stringify(trimmed));
  } catch (e) { console.warn('history save failed', e); }
}
let chatHistory = [];            // {role:'user'|'bot', content:'...', ts:number}[]
let _historyRendered = false;

function renderHistoryOnce() {
  if (_historyRendered) return;
  chatHistory = loadChatHistory();
  // 히스토리는 즉시 렌더(타자효과 X)
  chatHistory.forEach(m => {
    addMessage(m.role === 'user' ? 'user' : 'bot', m.content);
  });
  _historyRendered = true;
  // 렌더 후 하단 정렬(사용자가 올려 보기 전까지만)
  messages.scrollTop = messages.scrollHeight;
}

// 기존 showLoading/hideLoading 이 있었다면, 아래 두 개로 대체 사용:
function showLoading() { showBotTyping(); }
function hideLoading() { cancelBotTyping(); }


