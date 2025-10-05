window.initializeHighPage = function(user) {

  let fileData = [];
  let currentPage = 1;
  const pageSize = 30;
  let currentLevel = '중등';
  let sortState = { column: null, direction: 'asc' };

  // ▼▼▼ [추가] 상세보기 패널 요소 변수 선언 ▼▼▼
  const detailsPanel = document.getElementById('details-panel');
  const detailsPanelContent = document.getElementById('details-panel-content');
  const detailsPanelClose = document.getElementById('details-panel-close');
  const detailsOverlay = document.getElementById('details-overlay');
  const fileListBody = document.getElementById('file-list');
  // ▲▲▲ [추가] 상세보기 패널 요소 변수 선언 ▲▲▲


  const locationData = { "서울특별시": ["강남구", "강동구", "강북구", "강서구", "관악구", "광진구", "구로구", "금천구", "노원구", "도봉구", "동대문구", "동작구", "마포구", "서대문구", "서초구", "성동구", "성북구", "송파구", "양천구", "영등포구", "용산구", "은평구", "종로구", "중구", "중랑구"], "부산광역시": ["강서구", "금정구", "기장군", "남구", "동구", "동래구", "부산진구", "북구", "사상구", "사하구", "서구", "수영구", "연제구", "영도구", "중구", "해운대구"], "대구광역시": ["군위군", "남구", "달서구", "달성군", "동구", "북구", "서구", "수성구", "중구"], "인천광역시": ["강화군", "계양구", "남동구", "동구", "미추홀구", "부평구", "서구", "연수구", "옹진군", "중구"], "광주광역시": ["광산구", "남구", "동구", "북구", "서구"], "대전광역시": ["대덕구", "동구", "서구", "유성구", "중구"], "울산광역시": ["남구", "동구", "북구", "울주군", "중구"], "세종특별자치시": [], "경기도": ["가평군", "고양시", "과천시", "광명시", "광주시", "구리시", "군포시", "김포시", "남양주시", "동두천시", "부천시", "성남시", "수원시", "시흥시", "안산시", "안성시", "안양시", "양주시", "양평군", "여주시", "연천군", "오산시", "용인시", "의왕시", "의정부시", "이천시", "파주시", "평택시", "포천시", "하남시", "화성시"], "강원특별자치도": ["강릉시", "고성군", "동해시", "삼척시", "속초시", "양구군", "양양군", "영월군", "원주시", "인제군", "정선군", "철원군", "춘천시", "태백시", "평창군", "홍천군", "화천군", "횡성군"], "충청북도": ["괴산군", "단양군", "보은군", "영동군", "옥천군", "음성군", "제천시", "증평군", "진천군", "청주시", "충주시"], "충청남도": ["계룡시", "공주시", "금산군", "논산시", "당진시", "보령시", "부여군", "서산시", "서천군", "아산시", "예산군", "천안시", "청양군", "태안군", "홍성군"], "전북특별자치도": ["고창군", "군산시", "김제시", "남원시", "무주군", "부안군", "순창군", "완주군", "익산시", "임실군", "장수군", "전주시", "정읍시", "진안군"], "전라남도": ["강진군", "고흥군", "곡성군", "광양시", "구례군", "나주시", "담양군", "목포시", "무안군", "보성군", "순천시", "신안군", "여수시", "영광군", "영암군", "완도군", "장성군", "장흥군", "진도군", "함평군", "해남군", "화순군"], "경상북도": ["경산시", "경주시", "고령군", "구미시", "김천시", "문경시", "봉화군", "상주시", "성주군", "안동시", "영덕군", "영양군", "영주시", "영천시", "예천군", "울릉군", "울진군", "의성군", "청도군", "청송군", "칠곡군", "포항시"], "경상남도": ["거제시", "거창군", "고성군", "김해시", "남해군", "밀양시", "사천시", "산청군", "양산시", "의령군", "진주시", "창녕군", "창원시", "통영시", "하동군", "함안군", "함양군", "합천군"], "제주특별자치도": ["서귀포시", "제주시"] };
  const gradeOptions = { '중등': ['중1', '중2', '중3'], '고등': ['고1', '고2', '고3'] };

  // ▼▼▼ [추가] 상세보기 패널 제어 함수 ▼▼▼
function openDetailsPanel(fileData) {
  const uploadedDate = fileData.uploaded_at ? new Date(fileData.uploaded_at).toLocaleDateString('ko-KR') : '정보 없음';
  const memoButtonText = fileData.memo ? '메모 수정' : '메모 저장';

  detailsPanelContent.innerHTML = `
    <div class="details-section">
      <h4 class="details-section-title">파일명</h4>
      <p class="details-filename-text" title="${fileData.title}">${fileData.title}</p>
    </div>

    <div class="details-section">
      <h4 class="details-section-title">시험지 정보</h4>
      <div class="details-info-grid">
        <span class="details-info-label">학교</span>
        <span class="details-info-value">${fileData.school || '정보 없음'}</span>
        <span class="details-info-label">학년</span>
        <span class="details-info-value">${fileData.grade}</span>
        <span class="details-info-label">과목</span>
        <span class="details-info-value">${fileData.subject || '-'}</span>
        <span class="details-info-label">연도/학기</span>
        <span class="details-info-value">${fileData.year} / ${fileData.semester}</span>
        <span class="details-info-label">업로드일</span>
        <span class="details-info-value">${uploadedDate}</span>
      </div>
    </div>

    <div class="details-section">
      <h4 class="details-section-title">요청사항 (메모)</h4>
      <textarea id="details-memo-textarea" class="details-memo-textarea" placeholder="관리자에게 전달할 메모를 남겨주세요.">${fileData.memo || ''}</textarea>
      <div class="details-button-wrapper">
        <button id="details-memo-save-btn" class="details-save-btn" data-id="${fileData.id}">${memoButtonText}</button>
      </div>
    </div>
  `;
  detailsPanel.classList.add('is-open');
  detailsOverlay.classList.add('is-open');
}

  function closeDetailsPanel() {
    detailsPanel.classList.remove('is-open');
    detailsOverlay.classList.remove('is-open');
  }

// [신규 추가] 메모 저장 함수
async function saveMemo(fileId) {
  const memoTextarea = document.getElementById('details-memo-textarea');
  const saveButton = document.getElementById('details-memo-save-btn');
  if (!memoTextarea || !saveButton) return;

  const memo = memoTextarea.value;
  saveButton.disabled = true;
  saveButton.innerText = '저장 중...';

  try {
    const response = await fetch(`/api/files/${fileId}/memo`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memo })
    });

    if (response.ok) {
      alert('메모가 성공적으로 저장되었습니다.');
      const updatedFile = fileData.find(file => file.id == fileId);
      if (updatedFile) updatedFile.memo = memo;
      saveButton.innerText = '메모 수정';
    } else {
      alert('메모 저장에 실패했습니다.');
    }
  } catch (error) {
    console.error('Memo save error:', error);
    alert('메모 저장 중 오류가 발생했습니다.');
  } finally {
    saveButton.disabled = false;
    if (saveButton.innerText !== '메모 수정') {
      saveButton.innerText = memo ? '메모 수정' : '메모 저장';
    }
  }
}

  function switchLevel(level) {
    currentLevel = level;
    document.getElementById('level-title').textContent = `${level}관`;
    document.getElementById('levelText').textContent = level;
    document.getElementById('levelToggle').checked = (level === '중등');

    const gradeSelect = document.getElementById('grade');
    gradeSelect.innerHTML = '<option value="">학년</option>';
    gradeOptions[level].forEach(optionText => {
      const option = document.createElement('option');
      option.value = optionText;
      option.textContent = optionText;
      gradeSelect.appendChild(option);
    });

    clearFilters();
    fetchFiles();
  }

  function clearFilters() {
    document.getElementById('region').value = '';
    document.getElementById('district').innerHTML = '<option value="">구/군</option>';
    document.getElementById('school').value = '';
    document.getElementById('grade').value = '';
    document.getElementById('subject').value = '';
    document.getElementById('year').value = '';
    document.getElementById('semester').value = '';
  }

  function debounce(func, delay) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), delay);
    };
  }

  function setLoading(isLoading) {
    const btn = document.getElementById('searchBtn');
    btn.disabled = isLoading;
    btn.querySelector('.spinner').style.display = isLoading ? 'block' : 'none';
    btn.querySelector('.fa-magnifying-glass').style.display = isLoading ? 'none' : 'inline-block';
  }

  function sortData(column) {
    if (sortState.column === column) {
      sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
    } else {
      sortState.column = column;
      sortState.direction = 'asc';
    }
    renderPage();
    updateSortIcons();
  }

  function updateSortIcons() {
    document.querySelectorAll('th[data-sort]').forEach(th => {
      th.classList.remove('sorted');
      th.removeAttribute('data-direction');

      if (th.dataset.sort === sortState.column) {
        th.classList.add('sorted');
        th.dataset.direction = sortState.direction;
      }
    });
  }


  async function fetchFiles() {
    setLoading(true);
    const params = new URLSearchParams({
      region: document.getElementById('region').value,
      district: document.getElementById('district').value,
      school: document.getElementById('school').value,
      grade: document.getElementById('grade').value,
      year: document.getElementById('year').value,
      semester: document.getElementById('semester').value,
      level: currentLevel
    });
    try {
      const res = await fetch(`/api/files?${params}`);
      fileData = await res.json();
      currentPage = 1;
      sortState = { column: null, direction: 'asc' };
      renderPage();
      updateSortIcons();
    } catch (e) {
      console.error('파일 목록 조회 실패:', e);
    } finally {
      setLoading(false);
    }
  }

  window.searchFiles = fetchFiles;

  function renderPage() {
    let dataToRender = [...fileData];
    if (sortState.column) {
      dataToRender.sort((a, b) => {
        if (a[sortState.column] < b[sortState.column]) return sortState.direction === 'asc' ? -1 : 1;
        if (a[sortState.column] > b[sortState.column]) return sortState.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    renderTable(dataToRender.slice(start, end));
    renderPagination();
  }

  function renderPagination() {
    const pagination = document.getElementById('pagination');
    const totalPages = Math.ceil(fileData.length / pageSize);
    pagination.innerHTML = '';

    if (totalPages <= 1) return;

    const createPageElement = (pageNumber, text, isDisabled = false, isActive = false) => {
        const pageEl = document.createElement('div');
        pageEl.className = 'page';
        if (isDisabled) pageEl.classList.add('disabled');
        if (isActive) pageEl.classList.add('active');
        pageEl.innerHTML = text || pageNumber;
        if (!isDisabled && pageNumber) {
            pageEl.onclick = () => { currentPage = pageNumber; renderPage(); };
        }
        return pageEl;
    };

    const createEllipsis = () => {
        const ellipsisEl = document.createElement('span');
        ellipsisEl.className = 'pagination-ellipsis';
        ellipsisEl.textContent = '...';
        return ellipsisEl;
    };

    pagination.appendChild(createPageElement(currentPage - 1, '&lt;', currentPage === 1));

    const pagesToShow = new Set();
    pagesToShow.add(1);

    if (totalPages > 1) {
        pagesToShow.add(totalPages);
    }

    for (let i = -1; i <= 1; i++) {
        const page = currentPage + i;
        if (page > 1 && page < totalPages) {
            pagesToShow.add(page);
        }
    }

    const sortedPages = Array.from(pagesToShow).sort((a, b) => a - b);

    let lastPage = 0;
    sortedPages.forEach(page => {
        if (lastPage !== 0 && page - lastPage > 1) {
            pagination.appendChild(createEllipsis());
        }
        pagination.appendChild(createPageElement(page, page, false, page === currentPage));
        lastPage = page;
    });

    pagination.appendChild(createPageElement(currentPage + 1, '&gt;', currentPage === totalPages));
  }

 function renderTable(list) {
    fileListBody.innerHTML = '';

    if (!list || list.length === 0) {
      fileListBody.innerHTML = '<tr><td colspan="8" style="padding:20px; color:#9ba4b0;">자료가 없습니다</td></tr>';
      return;
    }

    list.forEach((file, index) => {
      const tr = document.createElement('tr');
      // ▼▼▼ [추가] tr에 data-id 속성 추가 ▼▼▼
      tr.dataset.id = file.id;

      const hasPdf = file.files && file.files.pdf;
      const hasHwp = file.files && file.files.hwp;

      const pdfButton = hasPdf ? `
        <button class="download-btn" title="PDF 다운로드" onclick="downloadFile('${file.id}','pdf')"
            style="background:none;border:none;cursor:pointer;">
            <img src="image_download/pdf_download.png" alt="PDF 다운로드">
        </button>` : '';

      const hwpButton = hasHwp ? `
        <button class="download-btn" title="HWP 다운로드" onclick="downloadFile('${file.id}','hwp')"
            style="background:none;border:none;cursor:pointer;">
            <img src="image_download/hwp_download.png" alt="HWP 다운로드">
        </button>` : '';
      
      // ▼▼▼ [수정] 자료명을 a 태그로 감싸고, class와 data-id 추가 ▼▼▼
      tr.innerHTML = `
        <td>${(currentPage - 1) * pageSize + index + 1}</td>
        <td style="text-align:left;">
          <a href="#" class="file-title-link" data-id="${file.id}">${file.title}</a>
        </td>
        <td>${file.subject || '-'}</td>
        <td>${file.grade}</td>
        <td>${file.semester}</td>
        <td>${file.year}</td>
        <td>${formatDate(file.uploaded_at)}</td>
        <td>
          ${pdfButton}${hwpButton}
        </td>
      `;
      fileListBody.appendChild(tr);
    });
  }

  window.downloadFile = (id, type) => {
    // 이벤트 버블링을 막아 패널이 열리지 않도록 함
    event.stopPropagation();
    if (!user || (!user.hasPaid && user.role !== 'admin')) {
      Swal.fire({ icon: 'warning', title: '다운로드 권한 없음', text: '결제 후 이용 가능합니다.', showCancelButton: true, showConfirmButton: false, cancelButtonText: '닫기', cancelButtonColor: '#444', background: '#1a1a1a', color: '#ffffff', iconColor: '#FDC512', customClass: { actions: 'swal2-actions-center' } });
      return;
    }
    const url = `/api/download/${id}?type=${encodeURIComponent(type)}`;
    window.location.href = url;
  };

  function formatDate(dateString) {
    return dateString ? new Date(dateString).toLocaleDateString() : '-';
  }

  function populateRegions() {
    const regionSelect = document.getElementById('region');
    Object.keys(locationData).forEach(region => {
      const option = document.createElement('option');
      option.value = region;
      option.textContent = region;
      regionSelect.appendChild(option);
    });
  }

  function populateDistricts(districts) {
    const districtSelect = document.getElementById('district');
    districtSelect.innerHTML = '<option value="">구/군</option>';
    districts.forEach(district => {
      const option = document.createElement('option');
      option.value = district;
      option.textContent = district;
      districtSelect.appendChild(option);
    });
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
  
  // ▼▼▼ [추가] 이벤트 리스너: 파일명 클릭 시 상세보기 패널 열기 ▼▼▼
  fileListBody.addEventListener('click', (event) => {
    const target = event.target;
    // 클릭된 요소가 file-title-link 클래스를 가진 a 태그인지 확인
    if (target.matches('a.file-title-link')) {
      event.preventDefault(); // a 태그의 기본 동작(페이지 이동) 방지
      const fileId = target.dataset.id;
      const selectedFile = fileData.find(file => file.id == fileId);
      if (selectedFile) {
        openDetailsPanel(selectedFile);
      }
    }
  });
  // ▲▲▲ [추가] 이벤트 리스너 ▲▲▲

  document.getElementById('levelToggle').addEventListener('change', function(event) {
    switchLevel(event.target.checked ? '중등' : '고등');
  });

  document.getElementById('region').addEventListener('change', function() {
    const selectedRegion = this.value;
    const districts = selectedRegion ? locationData[selectedRegion] : [];
    populateDistricts(districts);
  });

  const debouncedSearch = debounce(fetchFiles, 500);
  document.querySelectorAll('.filter').forEach(filter => {
    const eventType = filter.tagName.toLowerCase() === 'input' ? 'input' : 'change';
    filter.addEventListener(eventType, debouncedSearch);
  });

  document.getElementById('table-head').addEventListener('click', (e) => {
    const header = e.target.closest('th[data-sort]');
    if (header) {
      sortData(header.dataset.sort);
    }
  });

  detailsPanelClose.addEventListener('click', closeDetailsPanel);
  detailsOverlay.addEventListener('click', closeDetailsPanel);

  // [추가] 상세보기 패널 내부 '메모 저장' 버튼 클릭 이벤트
  detailsPanelContent.addEventListener('click', (event) => {
      if (event.target && event.target.id === 'details-memo-save-btn') {
          const fileId = event.target.dataset.id;
          saveMemo(fileId);
      }
  });
  // ▲▲▲ [추가] 상세보기 패널 닫기 이벤트 리스너 ▲▲▲

  populateRegions();
  switchLevel('중등');
  loadFooter();
};