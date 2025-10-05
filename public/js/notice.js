window.initializeNoticePage = function(user) {
  let IS_ADMIN = user?.role === 'admin';
  let selectedType = '공지';
  let noticeListData = [];
  let currentPage = 1;
  const perPage = 7;
  let openedDetail = null;

  async function loadNotices() {
    currentPage = 1;
    try {
        const res = await fetch(`/api/notices?type=${encodeURIComponent(selectedType)}`);
        const data = await res.json();
        noticeListData = data || [];
        renderNoticeList();
        
        // 수정: 새로운 페이지네이션 렌더링 함수 호출
        const totalPages = Math.ceil(noticeListData.length / perPage);
        renderPagination('.pagination', currentPage, totalPages, handlePageClick);

    } catch (e) {
        console.error("공지사항 로드 실패:", e);
    }
  }

  function renderNoticeList() {
    const tbody = document.getElementById('notice-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (noticeListData.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" style="padding:40px;text-align:center;color:#777;">등록된 공지사항이 없습니다.</td></tr>';
      return;
    }

    const start = (currentPage - 1) * perPage;
    const end = start + perPage;
    const view = noticeListData.slice(start, end);

    view.forEach(item => {
      const tr = document.createElement('tr');
      tr.tabIndex = 0;
      tr.setAttribute('data-id', item.id);
      tr.onclick = () => toggleDetail(tr, item.id);
      tr.onkeydown = e => { if (e.key === 'Enter') toggleDetail(tr, item.id); };

      const tdCat = document.createElement('td');
      tdCat.className = 'cat';
      tdCat.textContent = item.category || '공지';

      const tdTitle = document.createElement('td');
      tdTitle.className = 'title';
      const written = new Date(item.date);
      if ((new Date() - written) / (1000 * 60 * 60 * 24) <= 7) {
        const badge = document.createElement('span');
        badge.className = 'badge-new';
        badge.textContent = 'NEW';
        tdTitle.appendChild(badge);
      }
      tdTitle.append(item.title);

      const tdDate = document.createElement('td');
      tdDate.className = 'date';
      const d = new Date(item.date);
      tdDate.textContent = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
      
      tr.append(tdCat, tdTitle, tdDate);
      tbody.appendChild(tr);
    });
  }

  // ▼▼▼ [수정됨] 페이지네이션 로직 전체 교체 ▼▼▼
  
  /**
   * 페이지 클릭을 처리하는 콜백 함수
   * @param {number} pageNumber - 이동할 페이지 번호
   */
  function handlePageClick(pageNumber) {
    const totalPages = Math.ceil(noticeListData.length / perPage);
    if (pageNumber < 1 || pageNumber > totalPages || pageNumber === currentPage) return;
    
    currentPage = pageNumber;
    
    renderNoticeList(); // 테이블 내용 다시 그리기
    renderPagination('.pagination', currentPage, totalPages, handlePageClick); // 페이지네이션 다시 그리기
  }

  /**
   * 페이지네이션 UI를 동적으로 생성하는 함수
   * @param {string} containerSelector - 페이지네이션이 그려질 CSS 선택자
   * @param {number} currentPage - 현재 활성화된 페이지 번호
   * @param {number} totalPages - 전체 페이지 수
   * @param {function} onPageClick - 페이지 버튼 클릭 시 실행될 콜백 함수
   */
  function renderPagination(containerSelector, currentPage, totalPages, onPageClick) {
    const container = document.querySelector(containerSelector);
    if (!container) return;
    container.innerHTML = '';

    const createButton = (text, pageNumber, classes = []) => {
      const button = document.createElement('button');
      button.className = `page ${classes.join(' ')}`;
      button.innerHTML = text;
      if (pageNumber) {
        button.onclick = () => onPageClick(pageNumber);
      }
      if (classes.includes('disabled') || classes.includes('active')) {
          button.onclick = null;
      }
      return button;
    };
    
    const createEllipsis = () => {
        const ellipsis = document.createElement('span');
        ellipsis.className = 'pagination-ellipsis';
        ellipsis.textContent = '...';
        return ellipsis;
    };

    if (totalPages <= 0) return;

    container.appendChild(createButton('&lt;', currentPage - 1, currentPage === 1 ? ['disabled'] : []));
    
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) {
        container.appendChild(createButton(i, i, i === currentPage ? ['active'] : []));
      }
    } else {
      container.appendChild(createButton(1, 1, 1 === currentPage ? ['active'] : []));
      
      if (currentPage > 4) {
        container.appendChild(createEllipsis());
      }

      let startPage = Math.max(2, currentPage - 1);
      let endPage = Math.min(totalPages - 1, currentPage + 1);

      if (currentPage <= 4) {
          startPage = 2;
          endPage = 5;
      }
      if (currentPage >= totalPages - 3) {
          startPage = totalPages - 4;
          endPage = totalPages - 1;
      }
      
      for (let i = startPage; i <= endPage; i++) {
          container.appendChild(createButton(i, i, i === currentPage ? ['active'] : []));
      }

      if (currentPage < totalPages - 3) {
        container.appendChild(createEllipsis());
      }

      container.appendChild(createButton(totalPages, totalPages, totalPages === currentPage ? ['active'] : []));
    }

    container.appendChild(createButton('&gt;', currentPage + 1, currentPage === totalPages ? ['disabled'] : []));
  }
  // ▲▲▲ 페이지네이션 로직 교체 끝 ▲▲▲


  async function toggleDetail(row, id) {
    if (openedDetail && openedDetail.nextSibling) {
      openedDetail.nextSibling.remove();
      openedDetail.classList.remove('active');
      if (openedDetail === row) { openedDetail = null; return; }
    }
    const res = await fetch(`/api/notices/${id}`);
    const data = await res.json();
    const detailTr = document.createElement('tr');
    detailTr.className = 'notice-detail-row';
    const detailTd = document.createElement('td');
    detailTd.colSpan = 3;
    let contentHtml = '';
    if (IS_ADMIN) {
      contentHtml += `<button class="btn-delete-notice" onclick="window.deleteNotice('${id}')">삭제</button>`;
    }
    contentHtml += `<div class="notice-content-body">${data.content}</div>`;
    if (data.imageUrl) {
      contentHtml += `<img src="${data.imageUrl}" class="notice-content-image">`;
    }
    detailTd.innerHTML = contentHtml;
    detailTr.appendChild(detailTd);
    row.after(detailTr);
    row.classList.add('active');
    openedDetail = row;
  }
  
  window.deleteNotice = async (id) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    const r = await fetch(`/api/notices/${id}`, { method: 'DELETE', credentials: 'include' });
    if (r.ok) { alert('삭제되었습니다.'); loadNotices(); } 
    else { alert('삭제 실패'); }
  };

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

  // --- 초기화 및 이벤트 바인딩 ---
  const tabs = document.querySelectorAll('.tab-btn');
  const indicator = document.querySelector('.tab-indicator');

  function updateIndicator(selectedTab) {
    if (indicator) {
        indicator.style.height = `${selectedTab.offsetHeight}px`;
        indicator.style.top = `${selectedTab.offsetTop}px`;
    }
  }

  const initialActiveTab = document.querySelector('.tab-btn.active');
  if (initialActiveTab) {
    setTimeout(() => updateIndicator(initialActiveTab), 50);
  }

  tabs.forEach(btn => {
    btn.onclick = () => {
      document.querySelector('.tab-btn.active').classList.remove('active');
      btn.classList.add('active');
      updateIndicator(btn);
      selectedType = btn.dataset.type;
      loadNotices();
    };
  });

  loadNotices();
  loadFooter();
};