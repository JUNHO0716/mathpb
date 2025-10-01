// index.js가 이 페이지를 불러온 뒤 실행할 수 있도록 전체를 함수로 감쌉니다.
window.initializeHomePage = function(user) {

  // --- 원본 스크립트 기능 100% 유지 ---
  
  // 1. 광고 배너 슬라이더 실행
  const adSwiper = new Swiper('.home-ad-swiper', {
    loop: true,
    grabCursor: true,
    autoplay: { delay: 5000 },
    pagination: {
      el: '.home-ad-swiper-pagination',
      clickable: true,
    },
  });

  // 2. 탭 기능 카드 캐러셀 관련 로직 실행
  setupTabbedCarousel();

  // 3. 프로필 카드 펼치기/접기 기능 실행
  setupProfileToggle();

  // 4. 페이지 초기화 함수들 실행
  pageInit(user);
  fetchNotices();
  loadMySheetRequests();
  loadRequestStats(user);   // 👈 (user) 전달
  loadDownloadStats(user);  // 👈 (user) 전달
  loadUserStats();
  
  // 5. 기타 기능 실행
  setupModal(adSwiper);
  setupNoticeMoreButton();
  loadFooter();

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
        { title: '오픈 기념 특별 이벤트', subtitle: '지금 가입하면 프리미엄 플랜 1개월 무료 체험 기회를 드립니다.', caption: '이벤트 바로가기', icon: 'fas fa-gift', url: 'event.html' },
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
        slidesPerView: 'auto',
        spaceBetween: 30,
        loop: slidesData.length > 3,
        grabCursor: true,
        autoplay: {
          delay: 3000,
          disableOnInteraction: false,
        },
      });
    }

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

  function setupModal(adSwiper) {
      const modal = document.getElementById('adModal');
      const modalBox = document.querySelector('.home-modal-content');
      const closeBtn = document.querySelector('.home-modal-close');
      
      if (modal && modalBox && closeBtn && adSwiper) {
          document.querySelectorAll('.home-ad-swiper .swiper-slide').forEach(slide => {
              slide.addEventListener('click', () => {
                  const url = slide.dataset.url;
                  const frame = modalBox.querySelector('iframe');
                  if (frame) frame.src = url;
                  modal.style.display = 'flex';
                  adSwiper.autoplay.stop();
              });
          });

          const hideModal = () => {
              const frame = modalBox.querySelector('iframe');
              if (frame) frame.src = 'about:blank';
              modal.style.display = 'none';
              adSwiper.autoplay.start();
          };
          closeBtn.onclick = hideModal;
          modal.onclick = e => { if (e.target === modal) hideModal(); };
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
      document.getElementById('footer-container').innerHTML = footerHtml;
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

  async function fetchNotices() {
      let noticeData = [];
      try {
          const res = await fetch('/api/notices');
          noticeData = await res.json();
      } catch (e) {
          noticeData = [{ id: 0, title: '공지사항을 불러올 수 없습니다.' }];
      }

      const listEl = document.getElementById('noticeList');
      if (!listEl) return;
      listEl.innerHTML = noticeData.slice(0, 7).map((n, i) => `
      <div class="home-notice-item">
        <span class="home-notice-num">${i + 1}</span>
        <span class="home-notice-title">${n.title}</span>
      </div>`).join('');
  }

  async function loadRecentUploads() {
    try {
      const res = await fetch('/api/uploads/recent', { credentials:'include' });
      const data = await res.json();
      const tbody = document.querySelector('.home-uploads-card .home-rf-table tbody');
      if (!tbody) return;
      if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2" style="text-align:center;color:#aaa;">최근 업로드 내역이 없습니다.</td></tr>';
        return;
      }
      tbody.innerHTML = data.map(file => `
        <tr>
          <td class="home-title" title="${(file.name || '-').replace(/"/g, '&quot;')}">${file.name}</td>
          <td>${file.date}</td>
        </tr>
      `).join('');
    } catch(e) { console.error("최근 업로드 로딩 실패:", e); }
  }

  async function loadRecentDownloads(user) { // 👈 (user) 추가
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
      tbody.innerHTML = data.map(row => `
        <tr>
          <td style="text-align:left;" class="home-title" title="${(row.name || '-').replace(/"/g, '&quot;')}">${row.name || '-'}</td>
          <td style="text-align:center;">${new Date(row.date).toLocaleDateString()}</td>
          <td style="text-align:center;">
            <img src="image_download/hwp_download.png" alt="HWP" style="width:24px;cursor:pointer;" onclick="window.parent.downloadFile('${row.id}', 'hwp')">
            <img src="image_download/pdf_download.png" alt="PDF" style="width:24px;cursor:pointer;" onclick="window.parent.downloadFile('${row.id}', 'pdf')">
          </td>
        </tr>
      `).join('');
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