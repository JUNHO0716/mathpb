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

    // --- 이 부분이 index.js와 동일하게 수정된 핵심 로직입니다 ---
    let displayName;
    // 1. 카카오 유저인지 먼저 확인합니다 (DB에 저장된 email이 'Kakao'인지 체크).
    if (u.email === 'Kakao') {
      // 2. 카카오 유저가 맞다면, DB에 저장된 name 필드(카카오 닉네임)를 헤더에 표시합니다.
      displayName = u.name;
    } else {
      // 3. 다른 유저(일반, 구글, 네이버)는 기존 표시 규칙을 그대로 따릅니다.
      const processedId = (u.id && u.id.includes('@')) ? u.id.split('@')[0] : u.id;
      displayName = processedId || u.name || (u.email ? u.email.split('@')[0] : 'Guest');
    }
    // --- 여기까지 ---

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
    if (!response.ok) {
      throw new Error('페이지를 불러올 수 없습니다.');
    }
    const htmlText = await response.text();
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, 'text/html');
    
    contentFrame.innerHTML = doc.body.innerHTML;

    const scripts = Array.from(doc.body.querySelectorAll('script'));
    for (const oldScript of scripts) {
      const newScript = document.createElement('script');
      
      Array.from(oldScript.attributes).forEach(attr => {
        newScript.setAttribute(attr.name, attr.value);
      });
      
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
  const navLinks = document.querySelectorAll('.nav-link');

  bindUser();
  initDropdown();
  
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

  navLinks.forEach(link => {
    link.addEventListener('click', function (e) {
      e.preventDefault(); 
      navLinks.forEach(item => item.classList.remove('active'));
      this.classList.add('active');
      const pageToLoad = this.getAttribute('data-page');
      if (pageToLoad) {
        loadContent(pageToLoad);
      }
    });
  });

  const params = new URLSearchParams(window.location.search);
  const menuToActivate = params.get('menu');

  if (menuToActivate) {
    const buttonToClick = document.querySelector(`.nav-link[data-page="${menuToActivate}.html"]`);
    if (buttonToClick) {
      buttonToClick.click();
    }
  }
});