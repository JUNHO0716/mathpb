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
    const displayId = u.email ? u.email.split('@')[0] : (u.name || 'Guest');
    document.getElementById('profileName').textContent = displayId;
    
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

// 스크립트 실행이 가능하도록 개선된 loadContent 함수
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
        newScript.src = oldScript.src;
        await new Promise((resolve) => {
          newScript.onload = resolve;
          newScript.onerror = resolve; 
          document.body.appendChild(newScript);
        });
      } else {
        newScript.textContent = oldScript.textContent;
        document.body.appendChild(newScript);
      }
      newScript.remove();
    }
  } catch (error) {
    console.error('콘텐츠 로딩 실패:', error);
    contentFrame.innerHTML = `<div style="padding:40px; text-align:center;">페이지를 불러오는 데 실패했습니다.</div>`;
  }
}

document.addEventListener('DOMContentLoaded', function () {
  const navLinks = document.querySelectorAll('.nav-link');

  // 페이지 로드 시 사용자 정보 로딩 및 드롭다운 기능 활성화
  bindUser();
  initDropdown();
  
  // 로그아웃 버튼 이벤트 리스너
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

  // 네비게이션 링크 클릭 이벤트
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

  // ▼▼▼ [수정] URL 파라미터를 확인하는 로직을 일반화 ▼▼▼
  const params = new URLSearchParams(window.location.search);
  const menuToActivate = params.get('menu'); // e.g., 'subscribe', 'review'

  if (menuToActivate) {
    // URL 파라미터 값에 해당하는 버튼을 찾습니다.
    // e.g., menu=review -> data-page="review.html" 버튼을 찾음
    const buttonToClick = document.querySelector(`.nav-link[data-page="${menuToActivate}.html"]`);
    if (buttonToClick) {
      buttonToClick.click();
    }
  }
  // ▲▲▲ [수정] 로직 끝 ▲▲▲
});