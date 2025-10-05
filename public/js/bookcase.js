window.initializeBookcasePage = function(user) {
  
  const sidebar = document.getElementById('bookcaseSidebar');
  const toggleButton = document.getElementById('bookcaseToggleBtn');
  const menuIcon = document.getElementById('bookcaseMenuIcon');

  // 너비 계산 로직 없이, 클래스와 아이콘만 변경하는 단순한 기능
  function toggleSidebarAnim() {
    if (!sidebar || !menuIcon) return;
    const isCollapsed = sidebar.classList.contains('collapsed');
    sidebar.classList.toggle('collapsed');

    if (isCollapsed) {
      menuIcon.classList.remove('fa-download');
      menuIcon.classList.add('fa-xmark');
    } else {
      menuIcon.classList.remove('fa-xmark');
      menuIcon.classList.add('fa-download');
    }
  }

    async function loadFooter() {
    try {
      const response = await fetch('footer.html');
      const footerHtml = await response.text();
      const footerContainer = document.getElementById('footer-container');
      if (!footerContainer) return;
      
      // footer.html 내용을 삽입합니다.
      footerContainer.innerHTML = footerHtml;

      // --- ▼ [추가] 모바일 푸터 아코디언 기능 ---
      const header = footerContainer.querySelector('.footer-collapsible-header');
      const parent = footerContainer.querySelector('.footer-collapsible');
      if (header && parent) {
        header.addEventListener('click', () => {
          // 모바일 화면(768px 이하)에서만 작동합니다.
          if (window.innerWidth <= 768) {
            parent.classList.toggle('expanded');
          }
        });
      }
      // --- ▲ 여기까지 추가 ---

    } catch (error) {
      console.error('Footer loading failed:', error);
    }
  }

  async function loadRecentDownloads() {
    const sideTbody = document.getElementById('sidebarDownloadTbody');
    if (!user || !user.email) {
      if(sideTbody) sideTbody.innerHTML = `<tr><td colspan="3" style="text-align:center;color:#aaa;">로그인 필요</td></tr>`;
      return;
    }
    try {
      const res = await fetch('/api/downloads/recent', { credentials: 'include' });
      const data = await res.json();
      if (!sideTbody) return;
      if (!Array.isArray(data) || data.length === 0) {
        sideTbody.innerHTML = `<tr><td colspan="3" style="text-align:center;color:#aaa;">없음</td></tr>`;
      } else {
        sideTbody.innerHTML = data.slice(0, 5).map(row => `
          <tr>
            <td title="${row.name}">${row.name}</td>
            <td>${row.date ? row.date.split('T')[0] : ''}</td>
            <td>
              <a href="/api/download/${row.id}?type=hwp" title="한글 다운로드"><img src="/image_download/hwp_download.png" alt="HWP" /></a>
              <a href="/api/download/${row.id}?type=pdf" title="PDF 다운로드"><img src="/image_download/pdf_download.png" alt="PDF" /></a>
            </td>
          </tr>`).join('');
      }
    } catch (e) {
      console.error(e);
      if(sideTbody) sideTbody.innerHTML = `<tr><td colspan="3" style="text-align:center;color:red;">불러오기 실패</td></tr>`;
    }
  }

  if (toggleButton) {
    toggleButton.onclick = toggleSidebarAnim;
  }
  
  loadRecentDownloads();
};