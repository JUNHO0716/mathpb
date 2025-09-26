window.initializeUploadPage = function(user) {
  // --- 기본 요소 변수 선언 ---
  const modal = document.getElementById('delete-modal');
  if (modal) {
    document.body.appendChild(modal);
  }
  const confirmDeleteBtn = document.getElementById('confirm-delete');
  const cancelDeleteBtn = document.getElementById('cancel-delete');
  const fileInput = document.getElementById('fileInput');
  const previewCardContainer = document.getElementById('preview-card-container');
  const uploadBtn = document.getElementById('upload-btn');
  const addFileBtn = document.getElementById('add-file-btn');
  const dragArea = document.getElementById('drag-area');
  const uploadHeadArea = document.getElementById('upload-head-area');
  const leftPanel = document.querySelector('.upload-left-panel');
  const uploadCardContainer = document.getElementById('upload-card-container');
  const rejectedBody = document.getElementById('rejected-body');
  const rejectedSection = document.querySelector('.upload-rejected-section');
  const contentTitle = document.getElementById('content-title');
  const tabButtons = document.querySelectorAll('.upload-tab-btn');
  const tabIndicator = document.querySelector('.upload-tab-indicator');
  
  // --- 상세보기 패널 관련 요소 ---
  const detailsPanel = document.getElementById('details-panel');
  const detailsPanelContent = document.getElementById('details-panel-content');
  const detailsPanelClose = document.getElementById('details-panel-close');
  const detailsOverlay = document.getElementById('details-overlay');

  // --- 상태 변수 ---
  let selectedFiles = [];
  let activeFilter = '확인중';
  let allUploads = [];
  let cardIdToDelete = null; // 개별 삭제를 위한 ID 저장 변수

  // --- 함수 정의 ---

  // 상세보기 패널 열기
  function openDetailsPanel(cardData) {
    detailsPanelContent.innerHTML = `
      <p><strong>파일 ID:</strong> ${cardData.id}</p>
      <p><strong>파일명:</strong> ${cardData.filename}</p>
      <p><strong>상태:</strong> ${cardData.status}</p>
      <p><strong>요청일:</strong> ${new Date(cardData.created_at).toLocaleString()}</p>
      ${cardData.reject_reason ? `<p><strong>반려사유:</strong> ${cardData.reject_reason}</p>` : ''}
      `;
    detailsPanel.classList.add('is-open');
    detailsOverlay.classList.add('is-open');
  }

  // 상세보기 패널 닫기
  function closeDetailsPanel() {
    detailsPanel.classList.remove('is-open');
    detailsOverlay.classList.remove('is-open');
  }
  
  // 탭 표시기 이동
  function moveIndicator(target) {
    if (!target || !tabIndicator) return;
    tabIndicator.style.width = `${target.offsetWidth}px`;
    tabIndicator.style.left = `${target.offsetLeft}px`;
  }

  // (이하 기존 함수들은 내용이 길어 생략... 바로 아래 전체 코드에 포함되어 있습니다)


  // --- 이벤트 리스너 ---

  // 카드 컨테이너에 이벤트 위임 방식으로 클릭 리스너 추가
  uploadCardContainer.addEventListener('click', (event) => {
    const target = event.target;
    const detailsButton = target.closest('.card-btn-details');
    const deleteButton = target.closest('.card-btn-delete');

    if (detailsButton) {
      const cardId = detailsButton.dataset.id;
      const cardData = allUploads.find(item => item.id == cardId);
      if (cardData) {
        openDetailsPanel(cardData);
      }
    }

    if (deleteButton) {
      cardIdToDelete = deleteButton.dataset.id;
      modal.style.display = 'flex';
    }
  });
  
  // (이하 기존 이벤트 리스너들은 내용이 길어 생략... 바로 아래 전체 코드에 포함되어 있습니다)

  // --- 초기화 ---
  renderPreviewCards();
  fetchDataAndRender();
  setInterval(fetchDataAndRender, 5000);
  
  const initialActiveTab = document.querySelector('.upload-tab-btn.upload-active');
  if(initialActiveTab) {
      setTimeout(() => {
          moveIndicator(initialActiveTab);
      }, 100);
  }
};


// ----------------- [아래는 전체 코드입니다] -----------------

window.initializeUploadPage = function(user) {
  // 모달창 위치 문제를 해결하기 위해 모달을 body의 직속 자식으로 이동시킵니다.
  const modal = document.getElementById('delete-modal');
  if (modal) {
    document.body.appendChild(modal);
  }

  // --- 기본 요소 변수 선언 ---
  const confirmDeleteBtn = document.getElementById('confirm-delete');
  const cancelDeleteBtn = document.getElementById('cancel-delete');
  const fileInput = document.getElementById('fileInput');
  const previewCardContainer = document.getElementById('preview-card-container');
  const uploadBtn = document.getElementById('upload-btn');
  const addFileBtn = document.getElementById('add-file-btn');
  const dragArea = document.getElementById('drag-area');
  const uploadHeadArea = document.getElementById('upload-head-area');
  const leftPanel = document.querySelector('.upload-left-panel');
  const uploadCardContainer = document.getElementById('upload-card-container');
  const rejectedBody = document.getElementById('rejected-body');
  const rejectedSection = document.querySelector('.upload-rejected-section');
  const contentTitle = document.getElementById('content-title');
  const tabButtons = document.querySelectorAll('.upload-tab-btn');
  const tabIndicator = document.querySelector('.upload-tab-indicator');
  
  // --- 상세보기 패널 관련 요소 ---
  const detailsPanel = document.getElementById('details-panel');
  const detailsPanelContent = document.getElementById('details-panel-content');
  const detailsPanelClose = document.getElementById('details-panel-close');
  const detailsOverlay = document.getElementById('details-overlay');

  // --- 상태 변수 ---
  let selectedFiles = [];
  let activeFilter = '확인중';
  let allUploads = [];
  let cardIdToDelete = null; // 개별 삭제를 위한 ID 저장 변수

  // --- 함수 정의 ---

  // 상세보기 패널 열기
  function openDetailsPanel(cardData) {
    detailsPanelContent.innerHTML = `
      <p style="margin-top:0;"><strong>파일 ID:</strong> ${cardData.id}</p>
      <p><strong>파일명:</strong><br>${cardData.filename}</p>
      <p><strong>상태:</strong> ${cardData.status}</p>
      <p><strong>요청일:</strong> ${new Date(cardData.created_at).toLocaleString('ko-KR')}</p>
      ${cardData.reject_reason ? `<p><strong>반려사유:</strong> ${cardData.reject_reason}</p>` : ''}
    `;
    detailsPanel.classList.add('is-open');
    detailsOverlay.classList.add('is-open');
  }

  // 상세보기 패널 닫기
  function closeDetailsPanel() {
    detailsPanel.classList.remove('is-open');
    detailsOverlay.classList.remove('is-open');
  }
  
  // 탭 표시기 이동
  function moveIndicator(target) {
    if (!target || !tabIndicator) return;
    tabIndicator.style.width = `${target.offsetWidth}px`;
    tabIndicator.style.left = `${target.offsetLeft}px`;
  }

  function handleFileSelection(files) {
    const pdfs = files.filter(f => f.type === 'application/pdf');
    if (selectedFiles.length + pdfs.length > 10) {
      alert('최대 10개까지 업로드할 수 있습니다.');
      return;
    }
    pdfs.forEach(file => {
      if (!selectedFiles.some(f => f.name === file.name && f.size === file.size)) {
        selectedFiles.push(file);
      }
    });
    if (selectedFiles.length > 0) {
      uploadHeadArea.style.display = 'none';
      addFileBtn.style.display = 'block';
    } else {
      uploadHeadArea.style.display = '';
      addFileBtn.style.display = 'none';
    }
    renderPreviewCards();
  }

  function renderPreviewCards() {
    previewCardContainer.innerHTML = '';
    [...selectedFiles].slice().reverse().forEach((file, idx) => {
      const realIdx = selectedFiles.length - 1 - idx;
      const item = document.createElement('div');
      item.className = 'upload-preview-item';
      item.innerHTML = `
        <img src="image_upload/pdf_icon.png" alt="PDF Icon">
        <div class="upload-filename" title="${file.name}">${file.name}</div>
        <div style="color:#666;font-size:0.9em;margin-left:10px;">${(file.size/1024/1024).toFixed(2)} MB</div>
        <span class="upload-remove-btn" data-idx="${realIdx}" title="삭제"><i class="fas fa-times"></i></span>
      `;
      previewCardContainer.appendChild(item);
    });
    previewCardContainer.querySelectorAll('.upload-remove-btn').forEach(btn => {
      btn.onclick = () => {
        selectedFiles.splice(+btn.dataset.idx, 1);
        if (selectedFiles.length === 0) {
          uploadHeadArea.style.display = '';
          addFileBtn.style.display = 'none';
        }
        renderPreviewCards();
      };
    });
  }
  
  function renderContent() {
      uploadCardContainer.innerHTML = '';
      rejectedBody.innerHTML = '';
      
      if (activeFilter === '반려') {
          uploadCardContainer.style.display = 'none';
          rejectedSection.style.display = 'block';
          contentTitle.innerText = '반려 파일';
      } else {
          uploadCardContainer.style.display = 'grid';
          rejectedSection.style.display = 'none';
          contentTitle.innerText = {
            '확인중': '시험지 확인중',
            '제작중': '시험지 제작중',
            '완료': '제작 완료'
          }[activeFilter];
      }
      
      const filteredUploads = allUploads.filter(item => item.status === activeFilter);

      filteredUploads.forEach(item => {
        const { id, filename, status, reject_reason, created_at } = item;

        if (status === '반려') {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td title="${filename}">${filename.length > 20 ? filename.slice(0,20) + '…' : filename}</td>
            <td>${reject_reason || '사유 없음'}</td>
          `;
          rejectedBody.appendChild(tr);
          return;
        }
        
        let badgeClass, badgeText, iconImg;
        if (status === '확인중') { badgeClass = 'upload-check'; badgeText = '확인중'; iconImg = 'image_upload/pending.gif'; }
        else if (status === '제작중') { badgeClass = 'upload-make';  badgeText = '제작중'; iconImg = 'image_upload/working.gif'; }
        else { badgeClass = 'upload-done';  badgeText = '완료';    iconImg = 'image_upload/done.gif'; }
        let dateStr = '';
        if (created_at) {
          const d = new Date(created_at);
          dateStr = `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
        }
        const card = document.createElement('div');
        card.className = 'upload-card-statusbox';
        card.dataset.status = status;
        card.dataset.id = id;
        
        // [수정] 카드 HTML 생성 로직 변경
        card.innerHTML = `
          <div class="upload-card-left">
            <div class="upload-card-icon-wrap"><img src="${iconImg}" alt=""></div>
            <div class="upload-card-meta-box">
              <div class="upload-card-badge-group">
                <span class="upload-card-badge upload-req">시험지 요청</span>
                <span class="upload-card-badge ${badgeClass}">${badgeText}</span>
              </div>
              <div class="upload-card-filename" title="${filename}">${filename}</div>
              <div class="upload-card-upload-date">
                <span class="upload-date">${dateStr}</span>
                <span class="upload-label">· 요청일</span>
                <img src="image_upload/badge.png" class="upload-icon" alt="요청 아이콘" />
              </div>
            </div>
          </div>
          <div class="upload-card-right">
            <div class="upload-progress-step"><div class="upload-progress-num">1</div><div class="upload-progress-content"><div class="upload-progress-title">시험지 확인중……</div><div class="upload-progress-subtext">요청하신 시험지 작업이 가능한지 확인중</div></div></div>
            <div class="upload-progress-step"><div class="upload-progress-num">2</div><div class="upload-progress-content"><div class="upload-progress-title">시험지 제작중……</div><div class="upload-progress-subtext">요청하신 시험지를 한글화 작업이 진행중</div></div></div>
            <div class="upload-progress-step"><div class="upload-progress-num">3</div><div class="upload-progress-content"><div class="upload-progress-title">시험지 제작 완료</div><div class="upload-progress-subtext">요청하신 시험지를 업로드 완료했습니다.</div></div></div>
          </div>
          <div class="card-hover-buttons">
            <button class="card-action-btn card-btn-details" data-id="${id}">상세보기</button>
            ${status === '확인중' ? `<button class="card-action-btn delete card-btn-delete" data-id="${id}">삭제</button>` : ''}
          </div>
        `;
        
        uploadCardContainer.appendChild(card);
      });
  }

  async function fetchDataAndRender() {
    try {
      const res = await fetch('/api/my-uploads', { credentials: 'include' });
      allUploads = await res.json();
      allUploads.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      renderContent();
    } catch (e) { console.error('업로드 현황 로드 실패:', e); }
  }

  async function uploadFiles() {
    if (!selectedFiles.length) { alert('업로드할 파일을 선택하세요!'); return; }
    if (!confirm('파일을 정말 업로드하시겠습니까?')) { return; }
    uploadBtn.disabled = true;
    uploadBtn.innerText = '업로드 중...';
    const formData = new FormData();
    selectedFiles.forEach(file => formData.append('fileInput', file));
    const res = await fetch('/api/user-upload', { method: 'POST', credentials: 'include', body: formData });
    if (res.ok) {
      selectedFiles = [];
      renderPreviewCards();
      uploadHeadArea.style.display = 'none';
      addFileBtn.style.display = 'block';
      fetchDataAndRender();
      alert('업로드가 완료되었습니다!');
    } else {
      alert('업로드 실패');
    }
    uploadBtn.disabled = false;
    uploadBtn.innerText = '파일 업로드';
  }

  async function deleteCard(id) {
    modal.style.display = 'none';
    await fetch(`/api/uploads/${id}`, { method: 'DELETE', credentials: 'include' });
    fetchDataAndRender();
    cardIdToDelete = null;
  }

  // --- 이벤트 리스너 ---

  // 파일 선택 및 드래그앤드롭
  fileInput.addEventListener('change', (e) => handleFileSelection(Array.from(e.target.files)));
  addFileBtn.addEventListener('click', () => fileInput.click());
  ['dragenter', 'dragover'].forEach(evt => leftPanel.addEventListener(evt, e => {
    e.preventDefault();
    leftPanel.classList.add('upload-dragover');
  }));
  ['dragleave', 'drop'].forEach(evt => leftPanel.addEventListener(evt, e => {
    e.preventDefault();
    leftPanel.classList.remove('upload-dragover');
  }));
  leftPanel.addEventListener('drop', e => handleFileSelection(Array.from(e.dataTransfer.files)));

  // 탭 버튼
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      activeFilter = button.dataset.filter;
      tabButtons.forEach(btn => btn.classList.remove('upload-active'));
      button.classList.add('upload-active');
      moveIndicator(button);
      renderContent();
    });
  });

  // 파일 업로드 버튼
  uploadBtn.addEventListener('click', uploadFiles);

  // 카드 컨테이너에 이벤트 위임 방식으로 클릭 리스너 추가
  uploadCardContainer.addEventListener('click', (event) => {
    const target = event.target;
    const detailsButton = target.closest('.card-btn-details');
    const deleteButton = target.closest('.card-btn-delete');

    if (detailsButton) {
      const cardId = detailsButton.dataset.id;
      const cardData = allUploads.find(item => item.id == cardId);
      if (cardData) {
        openDetailsPanel(cardData);
      }
    }

    if (deleteButton) {
      cardIdToDelete = deleteButton.dataset.id;
      modal.style.display = 'flex';
    }
  });

    async function loadFooter() {
    try {
      const response = await fetch('footer.html');
      const footerHtml = await response.text();
      document.getElementById('footer-container').innerHTML = footerHtml;
    } catch (error) {
      console.error('Footer loading failed:', error);
    }
  }

  // 삭제 확인 모달
  confirmDeleteBtn.addEventListener('click', () => {
    if (cardIdToDelete) {
      deleteCard(cardIdToDelete);
    }
  });
  cancelDeleteBtn.addEventListener('click', () => {
    modal.style.display = 'none';
    cardIdToDelete = null;
  });

  // 상세보기 패널 닫기
  detailsPanelClose.addEventListener('click', closeDetailsPanel);
  detailsOverlay.addEventListener('click', closeDetailsPanel);

  // --- 초기화 ---
  renderPreviewCards();
  fetchDataAndRender();
  loadFooter();
  setInterval(fetchDataAndRender, 5000);
  
  const initialActiveTab = document.querySelector('.upload-tab-btn.upload-active');
  if(initialActiveTab) {
      setTimeout(() => {
          moveIndicator(initialActiveTab);
      }, 100);
  }
};


document.addEventListener('DOMContentLoaded', async () => {
  try {
    const response = await fetch('/check-auth', { credentials: 'include' });
    const data = await response.json();
    if (data.isLoggedIn) {
      window.initializeUploadPage(data.user);
    } else {
      window.location.href = '/login.html';
    }
  } catch (error) {
    console.error('Authentication check failed:', error);
    window.location.href = '/login.html';
  }
});