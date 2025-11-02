// index.js가 이 페이지를 불러온 뒤 실행할 수 있도록 전체를 함수로 감쌉니다.
window.initializeHomePage = function(user) {

  // --- 원본 스크립트 기능 100% 유지 ---
  
  const ad = window.initAdBanner('#AdBannerRoot', [
    { img: 'image_banner/ad1.jpg', url: 'promo1.html', title: '프로모션 1' },
    { img: 'image_banner/ad2.jpg', url: 'promo2.html', title: '프로모션 2' },
    { img: 'image_banner/ad3.jpg', url: 'promo3.html', title: '프로모션 3' },
    { img: 'image_banner/ad4.jpg', url: 'promo4.html', title: '프로모션 4' }
  ], { delay: 4500 });

  // 2. 탭 기능 카드 캐러셀 관련 로직 실행
  setupTabbedCarousel();

  // 3. 프로필 카드 펼치기/접기 기능 실행
  setupProfileToggle();

  // 4. 페이지 초기화 함수들 실행
  pageInit(user);
  fetchNotices();
  loadMySheetRequests();
  loadRequestStats(user);
  loadDownloadStats(user);
  loadUserStats();

  // ✅ 커버리지 위젯 렌더 (기본: 최신연도, 고등)
  if (window.renderCoverageWidget) {
    const now = new Date().getFullYear();
    // 연도는 API가 2024부터 현재/DB최대연도까지 자동 생성
    const defaultYear = Math.max(2024, Math.min(now, 9999));
    window.renderCoverageWidget('#coverageWidgetRoot', {
      defaultYear,
      defaultLevel: 'high', // 'high' | 'middle' (탭으로 전환)
    });
  }
  
  // 5. 기타 기능 실행
  setupNoticeMoreButton();
  loadFooter();

  /* 5-1. 홈 히어로 메뉴 → 인덱스/메인 라우팅 */
  (function bindHeroMenuRoutes() {
    // 인덱스 왼쪽 사이드 메뉴를 그대로 실행시켜 기존 로직/권한체크 재사용
    const clickIndexMenu = (menuId) => {
      const el = document.getElementById(menuId);
      if (el) el.click();
    };

    // 기출자료 → 인덱스 ‘내신기출 시험지’
    document.getElementById('btnPastExams')?.addEventListener('click', () => {
      clickIndexMenu('menu3');       // high.html 로드 + 타이틀/아이콘 처리
    });

    // 내 교재 → 인덱스 ‘내 책장’
    document.getElementById('btnMyBook')?.addEventListener('click', () => {
      clickIndexMenu('menu4');       // bookcase.html 로드
    });

    // 시험지 요청 → 인덱스 ‘시험지 요청’ (구독권한 체크 그대로)
    document.getElementById('btnRequestSheet')?.addEventListener('click', () => {
      clickIndexMenu('menu5');       // upload.html (hasPaid 검사 유지)
    });

    // 고객센터 → 메인 셸의 고객센터
    document.getElementById('btnCS')?.addEventListener('click', () => {
      window.location.href = 'main.html?menu=cs';
    });

    // AI 서비스 → 메인 셸의 챗봇
    document.getElementById('btnAI')?.addEventListener('click', () => {
      window.location.href = 'main.html?menu=chatbot_main';
    });
  })();


  // --- 원본의 모든 기능 함수 (100% 동일) ---

  function setupTabbedCarousel() {
    const cardData = {
      guide: [
        { title: '썸네일 테스트 영상', youtubeId: '8dJyRm2jJ-U', caption: '링크 미리보기' },
        { title: 'AI 문제추천 활용법', youtubeId: 'E4wYv22gA2Y', caption: 'AI 추천 기능 알아보기' },
        { title: '오답노트 200% 활용!', youtubeId: 'P69h3TfkPGo', caption: '오답노트 활용법' },
        { title: '2026 대입 개편안 분석', youtubeId: 'a3IPhv_d_hA', caption: '입시 전략 분석' },
        { title: '여름방학 학습 전략', youtubeId: 'pCoa202G_sM', caption: '수학 완전 정복' },
      ],
      news: [
        { title: '오픈 기념 특별 이벤트', subtitle: '지금 구독하면 스탠다드 플랜 1개월 무료 체험 기회를 드립니다.', caption: '이벤트 바로가기', icon: 'fas fa-gift', url: 'event.html' },
        { title: '콘텐츠 대규모 업데이트', subtitle: '2025년 개정 교과 과정을 모두 반영하여 콘텐츠가 업데이트되었습니다.', caption: '업데이트 내역', icon: 'fas fa-pen-ruler', url: '#' },
        { title: '서버 점검 안내 (9/22)', subtitle: '보다 안정적인 서비스를 위해 22일 새벽 서버 점검이 있습니다.', caption: '자세히 보기', icon: 'fas fa-server', url: '#' },
        { title: '제휴사 할인 이벤트', subtitle: '새로운 제휴사 할인 혜택을 확인해보세요.', caption: '이벤트 확인', icon: 'fas fa-handshake', url: '#' },
        { title: '친구 추천 이벤트 리뉴얼', subtitle: '친구를 추천하고 더 큰 혜택을 받아가세요! 푸짐한 혜택이 기다립니다.', caption: '참여하기', icon: 'fas fa-user-plus', url: '#' },
      ],
      admission: [
        { title: '2026 대입 개편안', subtitle: '주요 변경 사항 분석 리포트', caption: '분석 리포트', icon: 'fas fa-graduation-cap', url: '#' },
        { title: '9월 모의평가 심층 분석', subtitle: '과목별 난이도 및 등급컷 예측', caption: '자세히 보기', icon: 'fas fa-chart-line', url: '#' },
        { title: '수시 지원 전략 설명회', subtitle: '합격생 데이터 기반, 나만의 전략을 세워보세요.', caption: '전략 세우기', icon: 'fas fa-chalkboard-user', url: '#' },
        { title: '의대 정원 확대의 영향', subtitle: '변화된 입시 환경, 어떻게 대비해야 할까요?', caption: '영향 분석', icon: 'fas fa-microscope', url: '#' },
      ]
    };

    let cardSwiper = null;

    function initCardSlider(tabId) {
      if (cardSwiper) {
        cardSwiper.destroy(true, true);
      }
      const swiperWrapper = document.querySelector('.home-cardSwiper .swiper-wrapper');
      if (!swiperWrapper) return;
      
      const slidesData = cardData[tabId] || [];
      let slidesHtml = '';
      if (tabId === 'guide') {
          slidesHtml = slidesData.map(item => `
          <div class="swiper-slide">
              <a href="https://www.youtube.com/watch?v=${item.youtubeId}" target="_blank" class="home-youtube-thumbnail">
                  <img src="https://img.youtube.com/vi/${item.youtubeId}/hqdefault.jpg" alt="${item.title}">
              </a>
              <div class="home-card-caption">${item.caption}</div>
          </div>`).join('');
      } else {
          slidesHtml = slidesData.map(item => {
              const cardContent = `<i class="home-card-icon ${item.icon || 'fas fa-info-circle'}"></i><h3>${item.title}</h3><p class="home-card-subtitle">${item.subtitle || ''}</p>`;
              const slideInnerContent = `<div class="home-card">${cardContent}</div><div class="home-card-caption">${item.caption}</div>`;
              const finalHtml = item.url ? `<a href="${item.url}" target="_blank" class="home-card-link">${slideInnerContent}</a>` : slideInnerContent;
              return `<div class="swiper-slide">${finalHtml}</div>`;
          }).join('');
      }
      swiperWrapper.innerHTML = slidesHtml;

      cardSwiper = new Swiper('.home-cardSwiper', {
        // --- 기본 (모바일) 설정 ---
        slidesPerView: 'auto',
        spaceBetween: 15,          // 모바일에서 카드 사이 간격을 줄입니다.
        centeredSlides: true,       // ✨ 모바일에서 슬라이드를 가운데로 정렬하는 핵심 옵션입니다.
        loop: slidesData.length > 3,
        grabCursor: true,
        autoplay: {
          delay: 3000,
          disableOnInteraction: false,
        },

        // --- 데스크탑 설정 (769px 이상일 때 적용) ---
        breakpoints: {
          769: {
            spaceBetween: 30,       // 데스크탑에서는 원래 간격으로 복원합니다.
            centeredSlides: false,    // 데스크탑에서는 가운데 정렬을 비활성화합니다.
          }
        }
      });
    }

        // 홈 초기 로직 상단에 추가
    if (window.DetailsPanel?.init && !window.__detailsInited) {
      window.DetailsPanel.init({
        panelSelector: '#details-panel',
        overlaySelector: '#details-overlay',
        contentSelector: '#details-panel-content',
        closeSelector: '#details-panel-close'
      });
      window.__detailsInited = true; // 중복 방지
    }

    // coverage-widget에서 발생시키는 파일 클릭 이벤트 수신
    document.addEventListener('coverage:fileClick', async (e) => {
      const { id, file, placeholder } = e.detail || {};
      let data = file || placeholder || null;

      // 파일객체가 없고 id만 왔으면 한 번만 상세/내메모 받아서 채워서 열기
      if (!data && id) {
        try {
          const rf = await fetch(`/api/files/${encodeURIComponent(id)}`);
          if (rf.ok) data = await rf.json();
          if (data?.id) {
            const rm = await fetch(`/api/my/memos/${encodeURIComponent(data.id)}`);
            if (rm.ok) data.myMemo = (await rm.json()).memo || '';
          }
        } catch {}
      }

      // 그래도 없으면 정보 없음
      if (!data) {
        data = { id:'', title:'시험지', school:'정보 없음', grade:'-', subject:'-', year:'-', semester:'-', uploaded_at:null, myMemo:'' };
      }

      // 네가 가져온 details-panel.js 그대로 사용
      if (window.DetailsPanel?.open) window.DetailsPanel.open(data);
    });


    const tabButtons = document.querySelectorAll('.home-tab-btn');
    const tabIndicator = document.querySelector('.home-tab-indicator');
    if (!tabButtons.length || !tabIndicator) return;

    function moveIndicator(target) {
        tabIndicator.style.width = `${target.offsetWidth}px`;
        tabIndicator.style.left = `${target.offsetLeft}px`;
    }

    tabButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        const target = e.currentTarget;
        tabButtons.forEach(btn => btn.classList.remove('home-active'));
        target.classList.add('home-active');
        
        const tabId = target.dataset.tab;
        initCardSlider(tabId);
        moveIndicator(target);
      });
    });

    const initialActiveTab = document.querySelector('.home-tab-btn.home-active');
    if(initialActiveTab) {
        setTimeout(() => {
            moveIndicator(initialActiveTab);
        }, 100);
        initCardSlider(initialActiveTab.dataset.tab);
    } else {
        initCardSlider('news');
    }
  }

  function setupProfileToggle() {
      const profileCard = document.querySelector('.home-profile-card');
      const profileToggleBtn = document.querySelector('.home-profile-toggle-btn');
      if (profileToggleBtn && profileCard) {
          profileToggleBtn.addEventListener('click', () => {
              profileCard.classList.toggle('home-expanded');
          });
      }
  }

  function setupNoticeMoreButton() {
      const moreBtn = document.getElementById('noticeMoreBtn');
      if (moreBtn) {
          moreBtn.addEventListener('click', function() {
              if (window.parent && window.parent.handleChildNavigation) {
                  window.parent.handleChildNavigation({ type: 'goNoticeMore' });
              }
          });
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

  // --- 📞 전화번호 포맷팅 함수 추가 ---
  function formatPhoneNumber(phoneStr) {
    if (!phoneStr) return '-';
    const cleaned = ('' + phoneStr).replace(/\D/g, '');
    if (cleaned.length === 11) {
      return `${cleaned.substring(0, 3)}-${cleaned.substring(3, 7)}-${cleaned.substring(7)}`;
    } else if (cleaned.length === 10) {
      return `${cleaned.substring(0, 3)}-${cleaned.substring(3, 6)}-${cleaned.substring(6)}`;
    }
    return phoneStr;
  }

function bindUser(user) { 
  if (!user) return;
    
    // --- 👇 여기가 수정된 부분입니다 (ID 변경) ---
    const profileNameCollapsed = document.getElementById('home-profileName');
    const profileEmailCollapsed = document.getElementById('home-profileEmail');
    const profileAvatar = document.getElementById('home-profileAvatar');
    if(profileNameCollapsed) profileNameCollapsed.textContent = user.name || '-';
    if(profileEmailCollapsed) profileEmailCollapsed.textContent = user.email || '-';
    if(profileAvatar) profileAvatar.src = user.avatarUrl || 'https://via.placeholder.com/74';
    
    const profileNameExpanded = document.getElementById('home-profileNameExpanded');
    const profileAvatarExpanded = document.getElementById('home-profileAvatarExpanded');
    const profileIdValue = document.getElementById('home-profileIdValue');
    const profileEmailValue = document.getElementById('home-profileEmailValue');
    const profilePhoneValue = document.getElementById('home-profilePhoneValue');
    const profilePlan = document.querySelector('.home-profile-plan');

    if(profileNameExpanded) profileNameExpanded.textContent = user.name || '-';
    if(profileAvatarExpanded) profileAvatarExpanded.src = user.avatarUrl || 'https://via.placeholder.com/90';
        if(profileIdValue) {
        let displayId = user.id || '-'; // 기본값은 전체 ID
        // 이메일이 있고 '@'를 포함하면 @ 앞부분을 displayId로 사용
        if (user.email && user.email.includes('@')) {
            displayId = user.email.split('@')[0];
        }
        profileIdValue.textContent = displayId;
    }
    if(profileEmailValue) profileEmailValue.textContent = user.email || '-';
    
    if(profilePhoneValue) profilePhoneValue.textContent = formatPhoneNumber(user.phone);
    
    if(profilePlan) {
        let planText = 'Free';
        if (user.hasPaid && user.plan) {
            planText = user.plan.charAt(0).toUpperCase() + user.plan.slice(1);
        }
        if (user.role === 'admin') {
            planText = 'Admin';
        }
        profilePlan.textContent = planText;
    }
}

  async function pageInit(user) { // 👈 (user) 추가
    await bindUser(user); // 👈 (user) 전달
    loadRecentUploads();
    loadRecentDownloads(user); // 👈 (user) 전달
}

function bindRecentUploadsClick(tbody) {
  if (!tbody) return;

  if (tbody.__recentUploadsClickHandler) {
    tbody.removeEventListener('click', tbody.__recentUploadsClickHandler);
  }

  const handler = async (e) => {
    const row = e.target.closest('tr.rf-clickable');
    if (!row) return;

    let id = row.dataset.id;
    const name = row.dataset.name || '시험지';
    const uploaded_at = row.dataset.date || null;

    if (!id) {
      // ✅ 폴백1: 파일명으로 id resolve 시도 (백엔드가 제공하는 엔드포인트가 있다면 사용)
      try {
        const r = await fetch(`/api/files/resolve?name=${encodeURIComponent(name)}`);
        if (r.ok) {
          const j = await r.json();
          if (j && j.id) id = String(j.id);
        }
      } catch (err) {
        console.warn('resolve by name failed', err);
      }
    }

    if (id) {
      // 정상 경로: id로 상세/메모 불러와서 오픈 (메모 가능)
      document.dispatchEvent(new CustomEvent('coverage:fileClick', { detail: { id } }));
    } else {
      // ✅ 폴백2: 그래도 id가 없으면 placeholder라도 열어준다(모달이 "안 뜨는" 문제 방지)
      document.dispatchEvent(new CustomEvent('coverage:fileClick', {
        detail: {
          placeholder: {
            id: '',
            title: name,
            school: '정보 없음',
            grade: '-', subject: '-', year: '-', semester: '-',
            uploaded_at, myMemo: ''
          }
        }
      }));
    }
  };

  tbody.addEventListener('click', handler);
  tbody.__recentUploadsClickHandler = handler;
}


 // 이 함수 전체를 복사해서 기존 함수와 교체해 주세요.
  async function fetchNotices() {
      let noticeData = [];
      try {
          const res = await fetch('/api/notices');
          if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
          }
          noticeData = await res.json();

      } catch (e) {
          console.error("공지사항 API 호출 실패:", e);
          noticeData = [
              { id: 1, title: '[공지] 시험지 PDF 업로드 시 -> 해설 포함 한글(HWP) 파일로 변환...' },
              { id: 2, title: '[업데이트] 수학지니 정식 오픈!! 선생님들을 위한 문제은행 플랫폼' },
              { id: 3, title: '[수정] 일부 문제에서 발생한 오타 수정 안내' },
              { id: 4, title: '일반 공지사항 테스트입니다.' },
              { id: 5, title: '[공지] 서버 안정화 작업 안내 (10/5)' }
          ];
      }

      const listEl = document.getElementById('noticeList');
      if (!listEl) return;
      listEl.innerHTML = noticeData.slice(0, 7).map((n, i) => {
        // 0) 원본 제목
        let t = (n.title || '').trim();

        // 1) 앞쪽 이모지/ZWJ/variation + 공백 제거
        t = t.replace(/^[\p{Emoji_Presentation}\p{Emoji}\p{Extended_Pictographic}\ufe0f\u200d\s]+/gu, '').trim();

        // 2) [대괄호] 태그 우선 감지
        let kind = null;
        const m = t.match(/^\[([^\]]+)\]\s*/);
        if (m) {
          const key = m[1];
          if (/공지/.test(key)) kind = 'notice';
          else if (/(업데이트|업뎃|UP|오픈|OPEN)/i.test(key)) kind = 'update'; // ← 추가
          else if (/수정/.test(key)) kind = 'fix';
          t = t.slice(m[0].length).trim();
        } else {
          if (/^공지(\s+|:)?/.test(t)) { kind = 'notice'; t = t.replace(/^공지(\s+|:)?/, '').trim(); }
          else if (/^(업데이트|업뎃|UP|오픈|OPEN)(\s+|:)?/i.test(t)) { // ← 추가
            kind = 'update';
            t = t.replace(/^(업데이트|업뎃|UP|오픈|OPEN)(\s+|:)?/i,'').trim();
          }
          else if (/^수정(\s+|:)?/.test(t)) { kind = 'fix'; t = t.replace(/^수정(\s+|:)?/, '').trim(); }
        }

        const badge =
          kind === 'notice' ? '<span class="notice-chip">공지</span>' :
          kind === 'update' ? '<span class="notice-chip">U-D</span>' :
          kind === 'fix'    ? '<span class="notice-chip">수정</span>' : '';

        return `
          <div class="home-notice-item">
            <span class="home-notice-num">${i + 1}</span>
            ${badge}
            <span class="home-notice-title">${t}</span>
          </div>`;
      }).join('');

  }

  async function loadRecentUploads() {
    try {
      const res = await fetch('/api/uploads/recent', { credentials: 'include' });
      const data = await res.json();
      const tbody = document.querySelector('.home-uploads-card .home-rf-table tbody');
      if (!tbody) return;

      if (!Array.isArray(data) || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2" style="text-align:center;color:#aaa;">최근 업로드 내역이 없습니다.</td></tr>';
        return;
      }

tbody.innerHTML = data.map(file => {
  const name = file.name || '-';
  const parts = name.split('_');
  const school = parts.length > 1 ? parts[1] : name;

  const isHigh = /고등학교|고등|고$/u.test(school);
  const isMiddle = /중학교|중등|중$/u.test(school);

  let levelClass = '';
  let levelLabel = '';
  if (isHigh && !isMiddle) {
    levelClass = 'high';
    levelLabel = '고등';
  } else if (isMiddle && !isHigh) {
    levelClass = 'middle';
    levelLabel = '중등';
  } else {
    if (/고/u.test(school)) { levelClass = 'high'; levelLabel = '고등'; }
    else if (/중/u.test(school)) { levelClass = 'middle'; levelLabel = '중등'; }
  }

  // ✅ id 후보 더 늘림 (업로드/파일 API 혼용 대비)
  const fid =
    file.id ?? file.file_id ?? file.fileId ?? file.FileId ??
    file.upload_id ?? file.uploadId ?? file.UploadId ??
    file.FID ?? '';

  const badge = levelClass ? `<span class="level-badge ${levelClass}">${levelLabel}</span>` : '';
  return `
    <tr class="rf-clickable"
        ${fid ? `data-id="${String(fid)}"` : ''}
        data-name="${name.replace(/"/g, '&quot;')}"
        data-date="${file.date || ''}">
      <td class="home-title" style="text-align:left;">
        ${badge}<span title="${name.replace(/"/g, '&quot;')}">${name}</span>
      </td>
      <td>${file.date || ''}</td>
    </tr>
  `;
}).join('');

// ✅ 테이블 행 클릭 → coverage와 동일 모달 열기(이벤트 재사용)
bindRecentUploadsClick(tbody);



    } catch (e) {
      console.error('최근 업로드 로딩 실패:', e);
    }
  }

  async function loadRecentDownloads(user) {
    try {
      if (!user || !user.email) return;
      const res = await fetch('/api/downloads/recent', { credentials: 'include' });
      const data = await res.json();
      const tbody = document.getElementById('recentDownloadsTbody');
      if (!tbody) return;
      if (!Array.isArray(data) || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;color:#aaa;">최근 다운로드 내역이 없습니다.</td></tr>`;
        return;
      }
      tbody.innerHTML = data.map(row => {
        const date = new Date(row.date);
        // [수정] PC용 날짜와 모바일용(MM.DD) 날짜를 둘 다 준비합니다.
        const pcDate = date.toLocaleDateString();
        const mobileDate = `${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;

        return `
        <tr>
          <td style="text-align:left;" class="home-title" title="${(row.name || '-').replace(/"/g, '&quot;')}">${row.name || '-'}</td>
          <td style="text-align:center;" class="home-download-date-cell">
            <span class="pc-date">${pcDate}</span>
            <span class="mobile-date">${mobileDate}</span>
          </td>
          <td style="text-align:center;" class="home-download-icons-cell">
            <img src="image_download/hwp_download.png" alt="HWP" style="width:24px;cursor:pointer;" onclick="window.parent.downloadFile('${row.id}', 'hwp')">
            <img src="image_download/pdf_download.png" alt="PDF" style="width:24px;cursor:pointer;" onclick="window.parent.downloadFile('${row.id}', 'pdf')">
          </td>
        </tr>
      `;
      }).join('');
    } catch (e) { console.error("최근 다운로드 로딩 실패:", e); }
  }

  async function loadMySheetRequests() {
    try {
      const res = await fetch('/api/my-uploads', { credentials: 'include' });
      const data = await res.json();
      const tbody = document.getElementById('mysheetRequestTbody');
      if (!tbody) return;
      if (!Array.isArray(data) || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2" style="text-align:center;color:#aaa;">요청한 시험지가 없습니다.</td></tr>';
        return;
      }
      tbody.innerHTML = data.slice(0, 15).map(row => {
        // status 값(예: "확인중", "제작중", "완료", "반려")에 따라 처리
        let badgeClass = '';
        let iconHtml = '';
        const statusText = row.status || '';

        if (statusText === '확인중') {
            badgeClass = 'pending';
            iconHtml = '<i class="fas fa-hourglass-half"></i>';
        } else if (statusText === '제작중') {
            badgeClass = 'producing'; // CSS 클래스 이름에 맞춰 producing으로 변경
            iconHtml = '<i class="fas fa-spinner fa-spin"></i>';
        } else if (statusText === '완료') {
            badgeClass = 'completed';
            iconHtml = '<i class="fas fa-check"></i>';
        } else if (statusText === '반려') {
            badgeClass = 'rejected';
            iconHtml = '<i class="fas fa-ban"></i>';
        }

        // 최종적으로 반환하는 HTML 구조를 새로운 배지 형태로 변경
        return `<tr>
          <td class="home-title" title="${(row.filename || '-').replace(/"/g, '&quot;')}">${row.filename || '-'}</td>
          <td>
            <span class="status-badge ${badgeClass}">${iconHtml} ${statusText}</span>
          </td>
        </tr>`;
      }).join('');
    } catch(e) { console.error("내 문제지 요청 로딩 실패:", e); }
  }

    function animateCountUp(element, end, duration = 1500) {
      if (!element) return;

      // Easing 함수 (시작은 빠르게, 끝날수록 느려지는 효과)
      const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

      let startTimestamp = null;
      const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        
        // 1. 시간의 흐름에 따른 진행률 (0에서 1까지)
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        
        // 2. 진행률을 Easing 함수에 통과시켜 값의 변화에 곡선을 줍니다.
        const easedProgress = easeOutCubic(progress);
        
        // 3. Easing이 적용된 진행률로 현재 숫자를 계산합니다.
        element.textContent = Math.floor(easedProgress * end).toLocaleString();
        
        if (progress < 1) {
          window.requestAnimationFrame(step);
        }
      };
      window.requestAnimationFrame(step);
    }

  async function loadRequestStats(user) { // 👈 (user) 추가
  try {
      if (!user) return; // 👈 이 줄을 추가하세요
        const res = await fetch('/api/my-uploads/stats', { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to fetch stats');
        const stats = await res.json();
        
        animateCountUp(document.getElementById('statPending'), stats.pending);
        animateCountUp(document.getElementById('statProducing'), stats.producing);
        animateCountUp(document.getElementById('statCompleted'), stats.completed);
        animateCountUp(document.getElementById('statRejected'), stats.rejected);
    } catch (e) {
        console.error("통계 로딩 오류:", e);
    }
  }

  async function loadDownloadStats(user) { // 👈 (user) 추가
  try {
      if (!user) return; // 👈 이 줄을 추가하세요
        const res = await fetch('/api/downloads/stats', { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to fetch download stats');
        const stats = await res.json();
        
        animateCountUp(document.getElementById('statDownloadsTotal'), stats.total);
        animateCountUp(document.getElementById('statDownloadsHigh'), stats.highSchool);
        animateCountUp(document.getElementById('statDownloadsMiddle'), stats.middleSchool);
    } catch (e) {
        console.error("다운로드 통계 로딩 오류:", e);
    }
  }

  async function loadUserStats() {
    try {
        // 👇 [수정] API 호출 주소를 관리자(admin) 경로가 없는 새 주소로 변경합니다.
        const res = await fetch('/api/users/stats', { credentials: 'include' }); 

        // 기존 코드는 그대로 유지됩니다.
        if (!res.ok) {
            console.error(`사용자 통계 로딩 실패 (상태 코드: ${res.status})`);
            // API 호출 실패 시, 패널의 숫자들은 0으로 유지됩니다.
            return;
        }
        const stats = await res.json();
        
        animateCountUp(document.getElementById('statTotalUsers'), stats.totalUsers);
        animateCountUp(document.getElementById('statSubscribedUsers'), stats.subscribedUsers);
        animateCountUp(document.getElementById('statActiveUsers'), stats.activeUsers || 0);
    } catch (e) {
        console.error("사용자 통계 로딩 오류:", e);
    }
  }
};

// 부모가 initializeHomePage()를 호출하지 않는 경우를 대비한 자가 부팅
(function () {
  if (!window.__HOME_BOOTSTRAPPED__) {
    window.__HOME_BOOTSTRAPPED__ = true;
    window.addEventListener('DOMContentLoaded', function () {
      if (typeof window.initializeHomePage === 'function') {
        try { window.initializeHomePage(window.__USER__ || null); }
        catch (e) { console.error('[home boot]', e); }
      }
    });
  }
})();