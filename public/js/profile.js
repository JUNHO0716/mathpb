window.initializeProfilePage = function(user) {

  let adSwiper = null; // adSwiper 변수를 함수 스코프 상단에 선언
  
  // --- 광고 배너 Swiper 초기화 (home.js와 동일하게 수정) ---
  if (typeof Swiper !== 'undefined') {
    adSwiper = new Swiper('.profile-ad-swiper', { // 클래스 이름을 새 HTML 구조에 맞게 변경
      loop: true,
      grabCursor: true,
      autoplay: { 
        delay: 5000 
      },
      pagination: {
        el: '.profile-ad-swiper-pagination', // 페이지네이션 요소 지정
        clickable: true,
      },
    });
  }

  // --- 모달창 기능 함수 (home.js에서 가져옴) ---
  function setupModal(swiperInstance) {
      const modal = document.getElementById('profileAdModal'); // 모달 ID
      if (!modal) return; // 모달이 없으면 함수 종료

      const modalBox = modal.querySelector('.profile-modal-content');
      const closeBtn = modal.querySelector('.profile-modal-close');
      
      if (!modalBox || !closeBtn || !swiperInstance) {
        console.error("모달 초기화에 필요한 요소를 찾을 수 없습니다.");
        return;
      }

      document.querySelectorAll('.profile-ad-swiper .swiper-slide').forEach(slide => {
          slide.addEventListener('click', () => {
              const url = slide.dataset.url;
              if (!url) return;
              
              const frame = modalBox.querySelector('iframe');
              if (frame) frame.src = url;
              modal.style.display = 'flex';
              swiperInstance.autoplay.stop(); // 모달 열리면 자동재생 멈춤
          });
      });

      const hideModal = () => {
          const frame = modalBox.querySelector('iframe');
          if (frame) frame.src = 'about:blank';
          modal.style.display = 'none';
          swiperInstance.autoplay.start(); // 모달 닫히면 자동재생 시작
      };
      closeBtn.onclick = hideModal;
      modal.onclick = e => { if (e.target === modal) hideModal(); };
  }

  // --- 사용자 정보 설정 (전달받은 데이터 사용) ---
  function setProfileInfo(u) {
    if (!u) {
      console.error("profile.js: 사용자 정보가 전달되지 않았습니다.");
      return;
    }
    document.getElementById('profileAvatar').src = u.avatarUrl || 'default-avatar.png';
    document.getElementById('cardProfileName').textContent = u.name; // ID를 cardProfileName으로 변경
    document.getElementById('profileTitle').textContent = u.tier || 'Free';
    
    let displayId = u.id;
    if (/^[0-9]{10,21}$/.test(u.id) && u.email && u.email.includes('@')) {
      displayId = u.email.split('@')[0];
    }
    document.getElementById('profileId').textContent = displayId;
    document.getElementById('profileEmail').textContent = u.email;
    document.getElementById('profilePhone').textContent = formatPhoneNumber(u.phone);
    
    const bizInput = document.getElementById('mem-biz-input');
    const bizBtn = document.getElementById('mem-biz-btn');
    if (u.bizNum) {
      bizInput.value = u.bizNum;
      bizInput.disabled = true;
      bizBtn.innerHTML = '<i class="fas fa-edit"></i>'; // 수정(연필) 아이콘
    } else {
      bizInput.disabled = false;
      bizBtn.innerHTML = '<i class="fas fa-save"></i>'; // 저장 아이콘
    }

    const nameIn = document.getElementById('mem-academy-name'), phoneIn = document.getElementById('mem-academy-phone'), address1In = document.getElementById('mem-academy-address1'), address2In = document.getElementById('mem-academy-address2'), btn = document.getElementById('academy-save-btn');
    if (u.academyName) {
      nameIn.value = u.academyName; 
      phoneIn.value = u.academyPhone || ''; 
      address1In.value = u.academyAddress1 || ''; 
      address2In.value = u.academyAddress2 || '';
      nameIn.disabled = phoneIn.disabled = address1In.disabled = address2In.disabled = true; 
      btn.textContent = '정보 변경';
    } else {
      nameIn.disabled = phoneIn.disabled = address2In.disabled = false; 
      address1In.readOnly = true; 
      btn.textContent = '정보 저장';
    }
  }

  // --- 나머지 모든 함수들 ---
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

  async function loadSubStatus() {
    try {
      const r = await fetch('/api/billing/subscription/history',{credentials:'include'});
      if (!r.ok) throw new Error('Failed to fetch status');
      const d = await r.json();
      
      const statusEl = document.getElementById('sub-status');
      if (statusEl) {
        const statusText = d.status === 'active' ? '구독 중' : '미구독';
        statusEl.textContent = statusText;
      }
      
      const nextBillEl = document.getElementById('next-bill');
      if(nextBillEl) {
        nextBillEl.textContent = d.next_billing_at ? d.next_billing_at.split('T')[0] : '-';
      }

      const subscribeBtn = document.getElementById('subscribeBtn'), cancelBtn = document.getElementById('btn-cancel');
      if(subscribeBtn && cancelBtn){
          if (d.status === 'active') { subscribeBtn.style.display = 'none'; cancelBtn.style.display = 'block'; }
          else { subscribeBtn.style.display = 'block'; cancelBtn.style.display = 'none'; }
      }
    } catch (e) {
      console.error("구독 정보 로딩 실패:", e);
      const statusEl = document.getElementById('sub-status');
      if (statusEl) statusEl.textContent = '확인 실패';
    }
  }

  async function loadSubHistory(){
    try{
      const r = await fetch('/api/subscription/history',{credentials:'include'});
      const d = await r.json();
      const ul = document.getElementById('sub-history-list');
      if(!d.items || !d.items.length){ ul.innerHTML = '<li>이력 없음</li>'; return; }
      ul.innerHTML = d.items.map(it=>`<li><span>${it.approved_at||'-'} / ₩${(it.amount||0).toLocaleString()}</span><span>${it.status||'-'} ${it.receipt_url?`<a href="${it.receipt_url}" target="_blank">영수증</a>`:''}</span></li>`).join('');
    }catch(e){ console.error(e); }
  }

  // --- 모든 이벤트 리스너 바인딩 ---
  document.getElementById('mem-biz-btn').onclick = async function() {
    const bizInput = document.getElementById('mem-biz-input');
    const btn = this;
    const isEditMode = btn.innerHTML.includes('fa-edit'); // 현재 수정 아이콘인지 확인

    if (isEditMode) {
      bizInput.disabled = false;
      bizInput.focus();
      btn.innerHTML = '<i class="fas fa-save"></i>'; // 저장 아이콘으로 변경
      return;
    }

    // 저장 모드일 때
    const val = bizInput.value.trim();
    if (!val) return alert('번호를 입력하세요');
    
    const res = await fetch('/api/update-biznum', { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include', body:JSON.stringify({ bizNum:val }) });
    const d = await res.json();
    
    if (d.success) {
      bizInput.disabled = true;
      btn.innerHTML = '<i class="fas fa-edit"></i>'; // 수정 아이콘으로 변경
      alert('저장되었습니다!');
    } else {
      alert('저장 실패');
    }
  };

  document.getElementById('academy-save-btn').onclick = async function() {
    const nameIn = document.getElementById('mem-academy-name'), phoneIn = document.getElementById('mem-academy-phone'), address1In = document.getElementById('mem-academy-address1'), address2In = document.getElementById('mem-academy-address2'), btn = this;
    if (btn.textContent.includes('변경')) {
        nameIn.disabled = phoneIn.disabled = address2In.disabled = false;
        btn.textContent = '정보 저장';
        return;
    }
    const name = nameIn.value.trim(), phone = phoneIn.value.trim(), address1 = address1In.value.trim(), address2 = address2In.value.trim();
    const fullAddress = address1 + (address2 ? ' ' + address2 : '');
    if (!name || !phone || !address1) { return alert('학원명, 번호, 주소는 필수 입력 항목입니다.'); }
    try {
        const res = await fetch('/api/save-academy', { method: 'POST', headers: {'Content-Type': 'application/json'}, credentials: 'include', body: JSON.stringify({ name, phone, academyAddress: fullAddress }) });
        const d = await res.json();
        if (d.success) {
            nameIn.disabled = phoneIn.disabled = address1In.disabled = address2In.disabled = true;
            btn.textContent = '정보 변경';
            alert('학원 정보가 저장되었습니다!');
        } else { alert(d.msg || '저장 실패'); }
    } catch(e) { alert('저장 중 오류가 발생했습니다.'); }
  };

  document.getElementById('academy-address-search-btn').onclick = function() {
    new daum.Postcode({
        oncomplete: function(data) {
            let addr = data.roadAddress ? data.roadAddress : data.jibunAddress;
            document.getElementById("mem-academy-address1").value = addr;
            document.getElementById("mem-academy-address2").focus();
        }
    }).open();
  };

  let selectedFile = null;
  document.getElementById('changePhotoBtn').onclick = () => document.getElementById('profileImageInput').click();
  
  document.getElementById('profileImageInput').addEventListener('change', function(e) {
    const file = e.target.files[0]; if (!file) return; selectedFile = file;
    const reader = new FileReader(); reader.onload = (evt) => { document.getElementById('profileAvatar').src = evt.target.result; };
    reader.readAsDataURL(file); document.getElementById('savePhotoBtn').style.display = 'inline-flex';
  });

  document.getElementById('savePhotoBtn').addEventListener('click', async function() {
    if (!selectedFile) { alert('사진을 먼저 선택하세요.'); return; }
    const formData = new FormData(); formData.append('avatar', selectedFile, selectedFile.name);
    try {
      const res = await fetch('/api/upload-profile-photo', { method: 'POST', body: formData, credentials: 'include' });
      const result = await res.json();
      if (result.success && result.avatarUrl) { 
        document.getElementById('profileAvatar').src = result.avatarUrl; 
        alert('프로필 사진이 변경되었습니다!'); 
        selectedFile = null; 
        document.getElementById('savePhotoBtn').style.display = 'none'; 
      }
      else { alert('프로필 사진 업로드에 실패했습니다.'); }
    } catch (err) { alert('업로드 에러: ' + err); }
  });

  document.getElementById('deletePhotoBtn').addEventListener('click', async function() {
    if (!confirm('정말 프로필 사진을 기본 이미지로 변경하시겠습니까?')) return;
    try {
      const res = await fetch('/api/delete-profile-photo', { method: 'DELETE', credentials: 'include' });
      const result = await res.json();
      if (result.success) { 
        document.getElementById('profileAvatar').src = 'default-avatar.png'; 
        alert('프로필 사진이 기본 이미지로 변경되었습니다.'); 
        selectedFile = null; 
        document.getElementById('savePhotoBtn').style.display = 'none'; 
      }
      else { alert('프로필 사진 삭제 실패!'); }
    } catch (err) { alert('삭제 오류: ' + err); }
  });

  document.getElementById('pw-check-btn').onclick = async function() {
    const curPw = document.getElementById('current-password').value; if (!curPw) return alert('기존 비밀번호를 입력하세요.');
    const res = await fetch('/api/check-password', { method: 'POST', headers: {'Content-Type':'application/json'}, credentials: 'include', body: JSON.stringify({ password: curPw }) });
    const d = await res.json();
    if (d.success) { document.getElementById('pw-modal').style.display = 'flex'; } 
    else { alert(d.msg || '비밀번호가 일치하지 않습니다.'); }
  };

  document.getElementById('pw-modal-btn').onclick = function() {
    document.getElementById('pw-modal').style.display = 'none';
    document.getElementById('pw-check-box').style.display = 'none';
    document.getElementById('pw-change-box').style.display = 'block';
  };

  document.getElementById('pw-change-btn').onclick = async function() {
    const newPw = document.getElementById('new-password').value, newPw2 = document.getElementById('confirm-password').value;
    if (!newPw || !newPw2) return alert('새 비밀번호를 입력하세요.'); if (newPw !== newPw2) return alert('비밀번호가 일치하지 않습니다.');
    const res = await fetch('/api/change-password', { method: 'POST', headers: {'Content-Type':'application/json'}, credentials: 'include', body: JSON.stringify({ password: newPw }) });
    const d = await res.json();
    if (d.success) {
      alert('비밀번호가 변경되었습니다!');
      document.getElementById('pw-change-box').style.display = 'none'; 
      document.getElementById('pw-check-box').style.display = 'flex';
      document.getElementById('current-password').value = ''; 
      document.getElementById('new-password').value = ''; 
      document.getElementById('confirm-password').value = '';
    } else { alert(d.msg || '비밀번호 변경 실패'); }
  };
  
  document.getElementById('phone-change-btn').onclick = async () => {
    const newPhone = document.getElementById('new-phone').value.trim();
    if (!newPhone) return alert('새 휴대폰 번호를 입력하세요.');
    const res = await fetch('/api/change-phone', { method: 'POST', headers: {'Content-Type': 'application/json'}, credentials: 'include', body: JSON.stringify({ phone: newPhone }) });
    const d = await res.json();
    if (d.success) {
        alert('휴대폰 번호가 변경되었습니다!');
        document.getElementById('profilePhone').textContent = formatPhoneNumber(newPhone);
        document.getElementById('new-phone').value = '';
    } else { alert(d.msg || '휴대폰 번호 변경에 실패했습니다.'); }
  };

  document.getElementById('email-change-btn').onclick = async () => {
    const newEmail = document.getElementById('new-email').value.trim();
    if (!newEmail) return alert('새 이메일 주소를 입력하세요.');
    const res = await fetch('/api/change-email', { method: 'POST', headers: {'Content-Type': 'application/json'}, credentials: 'include', body: JSON.stringify({ email: newEmail }) });
    const d = await res.json();
    if (d.success) {
        alert('이메일이 변경되었습니다!');
        document.getElementById('profileEmail').textContent = newEmail;
        document.getElementById('profileId').textContent = newEmail.split('@')[0];
        document.getElementById('new-email').value = '';
    } else { alert(d.msg || '이메일 변경에 실패했습니다.'); }
  };
  
  const cancelBtn = document.getElementById('btn-cancel');
  if(cancelBtn) {
    cancelBtn.addEventListener('click', async ()=>{
      if(!confirm('해지하시겠습니까? (기간 종료일까지 이용 가능, 다음 결제부터 미과금)')) return;
      const r = await fetch('/api/subscription/cancel', { method:'POST', credentials:'include' });
      if(r.ok){ alert('해지 요청 완료'); loadSubStatus(); } else { alert('해지 실패'); }
    });
  }
  
  const openModalBtn = document.getElementById('openPricingModalBtn');
  if (openModalBtn) {
    openModalBtn.addEventListener('click', () => {
      if (window.parent && window.parent.openPaymentModal) {
        window.parent.openPaymentModal();
      }
    });
  }

  const subscribeBtn = document.getElementById('subscribeBtn');
  if (subscribeBtn) {
    subscribeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (window.parent && window.parent.openPaymentModal) {
        window.parent.openPaymentModal();
      }
    });
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

  // --- 페이지 초기화 함수 실행 ---
  setProfileInfo(user); // 전달받은 user 객체로 정보 표시
  loadSubStatus();
  loadSubHistory();
  loadFooter();
  setupModal(adSwiper); // 추가: 모달 기능 활성화
};