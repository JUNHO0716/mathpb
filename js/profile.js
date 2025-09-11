document.addEventListener('DOMContentLoaded', function() {

  // --- 광고 배너 Swiper 초기화 (추가) ---
  const topSwiper = new Swiper('.topSwiper', {
    loop: true,
    autoplay: { delay: 4000 },
    effect: 'fade',
    fadeEffect: { crossFade: true },
    speed: 1000,
    allowTouchMove: false,
    simulateTouch: false,
    pagination: {
      el: '.topSwiper .swiper-pagination',
      clickable: false
    }
  });

  // --- 사용자 정보 설정 ---
  async function setProfileInfo() {
    try {
      const res = await fetch('/check-auth?ts=' + Date.now(), { credentials: 'include', cache: 'no-store' });
      const d = await res.json();
      if (!d.isLoggedIn) return;
      const u = d.user;

      document.getElementById('profileAvatar').src = u.avatarUrl || 'default-avatar.png';
      document.getElementById('profileName').textContent = u.name;
      document.getElementById('mainHeaderName').textContent = u.name;
      document.getElementById('profileTitle').textContent = u.tier || 'Free';
      
      let displayId = u.id;
      if (/^[0-9]{10,21}$/.test(u.id) && u.email && u.email.includes('@')) { displayId = u.email.split('@')[0]; }
      document.getElementById('profileId').textContent = displayId;
      document.getElementById('profileEmail').textContent = u.email;
      document.getElementById('profilePhone').textContent = u.phone;
      
      if (u.bizNum) showBizNum(u.bizNum);

      const nameIn = document.getElementById('mem-academy-name');
      const phoneIn = document.getElementById('mem-academy-phone');
      const address1In = document.getElementById('mem-academy-address1');
      const address2In = document.getElementById('mem-academy-address2');
      const btn = document.getElementById('academy-save-btn');

      if (u.academyName) {
        nameIn.value = u.academyName;
        phoneIn.value = u.academyPhone || '';
        // 주소는 기본 주소와 상세 주소를 합쳐서 표시하거나, API 응답에 따라 분리해야 합니다.
        // 여기서는 예시로 기본 주소만 표시합니다.
        address1In.value = u.academyAddress1 || ''; 
        address2In.value = u.academyAddress2 || '';
        
        nameIn.disabled = phoneIn.disabled = address1In.disabled = address2In.disabled = true;
        btn.textContent = '정보 변경';
      } else {
        nameIn.disabled = phoneIn.disabled = address1In.disabled = address2In.disabled = false;
        // 주소 찾기 버튼으로 찾은 주소는 수정 불가하도록 설정
        address1In.readOnly = true; 
        btn.textContent = '정보 저장';
      }
    } catch (e) { console.error(e); }
  }

  // --- 구독 관리 기능 ---
  async function loadSubStatus() { /* 생략 */ }

  // --- 현금영수증 관련 기능 ---
  function showBizNum(bizNum) { /* 생략 */ }
  document.getElementById('mem-biz-save').onclick = async () => { /* 생략 */ };
  document.getElementById('mem-biz-edit').onclick = () => { /* 생략 */ };

  // --- 학원 정보 저장/변경 (수정) ---
  document.getElementById('academy-save-btn').onclick = async function() {
    const nameIn = document.getElementById('mem-academy-name');
    const phoneIn = document.getElementById('mem-academy-phone');
    const address1In = document.getElementById('mem-academy-address1');
    const address2In = document.getElementById('mem-academy-address2');
    const btn = this;

    // '정보 변경' 상태일 때는 입력 필드를 활성화
    if (btn.textContent.includes('변경')) {
        nameIn.disabled = phoneIn.disabled = address2In.disabled = false;
        // 주소 찾기로 입력되는 필드는 계속 비활성화 상태 유지
        // address1In.disabled = true; 
        btn.textContent = '정보 저장';
        return; // 저장 로직은 실행하지 않고 종료
    }
    
    // '정보 저장' 상태일 때
    const name = nameIn.value.trim();
    const phone = phoneIn.value.trim();
    const address1 = address1In.value.trim();
    const address2 = address2In.value.trim();

    if (!name || !phone || !address1) {
        return alert('학원명, 번호, 주소는 필수 입력 항목입니다.');
    }

    try {
        const res = await fetch('/api/save-academy', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            credentials: 'include',
            body: JSON.stringify({ name, phone, address1, address2 })
        });
        const d = await res.json();

        if (d.success) {
            nameIn.disabled = phoneIn.disabled = address2In.disabled = true;
            btn.textContent = '정보 변경';
            alert('학원 정보가 저장되었습니다!');
        } else {
            alert(d.msg || '저장 실패');
        }
    } catch(e) {
        alert('저장 중 오류가 발생했습니다.');
    }
  };

  // --- 학원 주소 찾기 기능 (추가) ---
  document.getElementById('academy-address-search-btn').onclick = function() {
    new daum.Postcode({
        oncomplete: function(data) {
            let addr = data.roadAddress ? data.roadAddress : data.jibunAddress;
            document.getElementById("mem-academy-address1").value = addr;
            document.getElementById("mem-academy-address2").focus();
        }
    }).open();
  };

  // --- 프로필 사진 관련 기능 ---
  let selectedFile = null;
  document.getElementById('changePhotoBtn').onclick = () => { /* 생략 */ };
  document.getElementById('profileImageInput').addEventListener('change', function(e) { /* 생략 */ });
  document.getElementById('savePhotoBtn').addEventListener('click', async function() { /* 생략 */ });
  document.getElementById('deletePhotoBtn').addEventListener('click', async function() { /* 생략 */ });

  // --- 비밀번호 변경 관련 기능 ---
  document.getElementById('pw-check-btn').onclick = async function() { /* 생략 */ };
  document.getElementById('pw-modal-btn').onclick = function() { /* 생략 */ };
  document.getElementById('pw-change-btn').onclick = async function() { /* 생략 */ };
    
  // --- 휴대폰 번호 & 이메일 변경 기능 ---
  document.getElementById('phone-change-btn').onclick = async () => { /* 생략 */ };
  document.getElementById('email-change-btn').onclick = async () => { /* 생략 */ };

  // --- 결제 이력 불러오기 ---
  async function loadSubHistory(){ /* 생략 */ }

  // --- 구독 해지 ---
  document.getElementById('btn-cancel')?.addEventListener('click', async ()=>{ /* 생략 */ });

  // --- Iframe 모달 컨트롤 ---
  const openModalBtn = document.getElementById('openPricingModalBtn');
  const closeModalBtn = document.getElementById('modalCloseBtn');
  const iframeModal = document.getElementById('iframeModal');
  const pricingIframe = document.getElementById('pricingIframe');
  openModalBtn.addEventListener('click', () => { /* 생략 */ });
  closeModalBtn.addEventListener('click', () => { /* 생략 */ });
  iframeModal.addEventListener('click', (e) => { /* 생략 */ });

  // --- 페이지 로드 시 초기 데이터 호출 ---
  setProfileInfo();
  loadSubStatus();
  loadSubHistory();
});