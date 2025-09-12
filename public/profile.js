document.addEventListener('DOMContentLoaded', function() {

  // --- 광고 배너 Swiper 초기화 ---
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

  // --- 사용자 정보 설정 (원본 기능 기반으로 전면 수정) ---
  async function setProfileInfo() {
    try {
      const res = await fetch('/check-auth?ts=' + Date.now(), { credentials: 'include', cache: 'no-store' });
      const d = await res.json();
      if (!d.isLoggedIn) return;
      const u = d.user;

      // --- 패널 1: 개인 프로필 카드 ---
      document.getElementById('profileAvatar').src = u.avatarUrl || 'default-avatar.png';
      document.getElementById('profileName').textContent = u.name;
      document.getElementById('mainHeaderName').textContent = u.name; // 중앙 헤더 이름
      document.getElementById('profileTitle').textContent = u.tier || 'Free'; // 등급 (또는 직책)
      
      let displayId = u.id;
      if (/^[0-9]{10,21}$/.test(u.id) && u.email && u.email.includes('@')) { 
        displayId = u.email.split('@')[0]; 
      }
      document.getElementById('profileId').textContent = displayId;
      document.getElementById('profileEmail').textContent = u.email;
      document.getElementById('profilePhone').textContent = u.phone;
      
      // --- 패널 1: 구독 관리 카드 ---
      // (구독 정보는 별도 API 호출로 유지)

      // --- 중앙 콘텐츠 카드 ---
      // 학원 정보
      const nameIn = document.getElementById('mem-academy-name');
      const phoneIn = document.getElementById('mem-academy-phone');
      const address1In = document.getElementById('mem-academy-address1');
      const address2In = document.getElementById('mem-academy-address2');
      const academyBtn = document.getElementById('academy-save-btn');

      if (u.academyName) {
        nameIn.value = u.academyName;
        phoneIn.value = u.academyPhone || '';
        // 원본에는 address1, 2가 없으므로 academyAddress를 분리하거나 API 수정 필요
        // 우선 academyAddress가 address1에 들어간다고 가정
        address1In.value = u.academyAddress || ''; 
        
        nameIn.disabled = phoneIn.disabled = address1In.disabled = address2In.disabled = true;
        academyBtn.textContent = '정보 변경';
      } else {
        nameIn.disabled = phoneIn.disabled = address2In.disabled = false;
        address1In.readOnly = true; 
        academyBtn.textContent = '정보 저장';
      }

      // 현금영수증
      if (u.bizNum) {
        showBizNum(u.bizNum);
      }

    } catch (e) { 
      console.error("사용자 정보 로딩 실패:", e); 
    }
  }

  // --- 구독 관리 기능 ---
  async function loadSubStatus() {
    try {
      const r = await fetch('/api/subscription/status', { credentials: 'include' });
      if (!r.ok) throw new Error('Failed to fetch status');
      const d = await r.json();
      const statusEl = document.getElementById('sub-status');
      if (statusEl) statusEl.textContent = d.status || '-';
      
      const nextBillEl = document.getElementById('next-bill');
      if(nextBillEl) nextBillEl.textContent = d.next_billing_at || '-';

      const subscribeBtn = document.getElementById('subscribeBtn');
      const cancelBtn = document.getElementById('btn-cancel');
      
      if (d.status === 'active') { 
        subscribeBtn.style.display = 'none';
        cancelBtn.style.display = 'block';
      } else {
        subscribeBtn.style.display = 'block';
        cancelBtn.style.display = 'none';
      }
    } catch (e) {
      console.error("구독 정보 로딩 실패:", e);
      const statusEl = document.getElementById('sub-status');
      if (statusEl) statusEl.textContent = '확인 실패';
    }
  }

  // --- 현금영수증 관련 기능 ---
  function showBizNum(bizNum) {
    document.getElementById('mem-biz-input').style.display = 'none';
    document.getElementById('mem-biz-save').style.display = 'none';
    const v = document.getElementById('mem-biz-view');
    v.textContent = bizNum;
    v.style.display = 'inline-block';
    document.getElementById('mem-biz-edit').style.display = 'inline-flex';
  }
  document.getElementById('mem-biz-save').onclick = async () => {
    const val = document.getElementById('mem-biz-input').value.trim();
    if (!val) return alert('번호를 입력하세요');
    const res = await fetch('/api/update-biznum', { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include', body:JSON.stringify({ bizNum:val }) });
    const d = await res.json();
    if (d.success) { showBizNum(val); alert('저장되었습니다!'); } else alert('저장 실패');
  };
  document.getElementById('mem-biz-edit').onclick = () => {
    document.getElementById('mem-biz-input').style.display = 'inline-block';
    document.getElementById('mem-biz-save').style.display = 'inline-flex';
    document.getElementById('mem-biz-view').style.display = 'none';
    document.getElementById('mem-biz-edit').style.display = 'none';
  };

  // --- 학원 정보 저장/변경 ---
  document.getElementById('academy-save-btn').onclick = async function() {
    const nameIn = document.getElementById('mem-academy-name'), 
          phoneIn = document.getElementById('mem-academy-phone'),
          address1In = document.getElementById('mem-academy-address1'),
          address2In = document.getElementById('mem-academy-address2'),
          btn = this;

    if (btn.textContent.includes('변경')) {
        nameIn.disabled = phoneIn.disabled = address2In.disabled = false;
        btn.textContent = '정보 저장';
        return;
    }
    
    const name = nameIn.value.trim(), phone = phoneIn.value.trim();
    const address1 = address1In.value.trim(), address2 = address2In.value.trim();
    const fullAddress = address1 + (address2 ? ' ' + address2 : '');

    if (!name || !phone || !address1) {
        return alert('학원명, 번호, 주소는 필수 입력 항목입니다.');
    }
    try {
        const res = await fetch('/api/save-academy', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            credentials: 'include',
            body: JSON.stringify({ name, phone, academyAddress: fullAddress }) // API에 맞게 academyAddress로 전송
        });
        const d = await res.json();
        if (d.success) {
            nameIn.disabled = phoneIn.disabled = address1In.disabled = address2In.disabled = true;
            btn.textContent = '정보 변경';
            alert('학원 정보가 저장되었습니다!');
        } else {
            alert(d.msg || '저장 실패');
        }
    } catch(e) {
        alert('저장 중 오류가 발생했습니다.');
    }
  };

  // --- 학원 주소 찾기 기능 ---
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
      if (result.success && result.avatarUrl) { document.getElementById('profileAvatar').src = result.avatarUrl; alert('프로필 사진이 변경되었습니다!'); selectedFile = null; document.getElementById('savePhotoBtn').style.display = 'none'; }
      else { alert('프로필 사진 업로드에 실패했습니다.'); }
    } catch (err) { alert('업로드 에러: ' + err); }
  });
  document.getElementById('deletePhotoBtn').addEventListener('click', async function() {
    if (!confirm('정말 프로필 사진을 기본 이미지로 변경하시겠습니까?')) return;
    try {
      const res = await fetch('/api/delete-profile-photo', { method: 'DELETE', credentials: 'include' });
      const result = await res.json();
      if (result.success) { document.getElementById('profileAvatar').src = '/icon_my_b.png'; alert('프로필 사진이 기본 이미지로 변경되었습니다.'); selectedFile = null; document.getElementById('savePhotoBtn').style.display = 'none'; }
      else { alert('프로필 사진 삭제 실패!'); }
    } catch (err) { alert('삭제 오류: ' + err); }
  });

  // --- 비밀번호 변경 관련 기능 ---
  document.getElementById('pw-check-btn').onclick = async function() {
    const curPw = document.getElementById('current-password').value; if (!curPw) return alert('기존 비밀번호를 입력하세요.');
    const res = await fetch('/api/check-password', { method: 'POST', headers: {'Content-Type':'application/json'}, credentials: 'include', body: JSON.stringify({ password: curPw }) });
    const d = await res.json();
    if (d.success) { document.getElementById('pw-modal').style.display = 'flex'; } else { alert(d.msg || '비밀번호가 일치하지 않습니다.'); }
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
      document.getElementById('pw-change-box').style.display = 'none'; document.getElementById('pw-check-box').style.display = 'flex';
      document.getElementById('current-password').value = ''; document.getElementById('new-password').value = ''; document.getElementById('confirm-password').value = '';
    } else { alert(d.msg || '비밀번호 변경 실패'); }
  };
    
  // --- 휴대폰 번호 변경 기능 ---
  document.getElementById('phone-change-btn').onclick = async () => {
    const newPhone = document.getElementById('new-phone').value.trim();
    if (!newPhone) return alert('새 휴대폰 번호를 입력하세요.');
    try {
        const res = await fetch('/api/change-phone', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            credentials: 'include',
            body: JSON.stringify({ phone: newPhone })
        });
        const d = await res.json();
        if (d.success) {
            alert('휴대폰 번호가 변경되었습니다!');
            document.getElementById('profilePhone').textContent = newPhone;
            document.getElementById('new-phone').value = '';
        } else {
            alert(d.msg || '휴대폰 번호 변경에 실패했습니다.');
        }
    } catch (e) {
        alert('오류가 발생했습니다.');
    }
  };

  // --- 이메일 변경 기능 ---
  document.getElementById('email-change-btn').onclick = async () => {
    const newEmail = document.getElementById('new-email').value.trim();
    if (!newEmail) return alert('새 이메일 주소를 입력하세요.');
    try {
        const res = await fetch('/api/change-email', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            credentials: 'include',
            body: JSON.stringify({ email: newEmail })
        });
        const d = await res.json();
        if (d.success) {
            alert('이메일이 변경되었습니다!');
            document.getElementById('profileEmail').textContent = newEmail;
            document.getElementById('new-email').value = '';
        } else {
            alert(d.msg || '이메일 변경에 실패했습니다.');
        }
    } catch (e) {
        alert('오류가 발생했습니다.');
    }
  };

  // --- 결제 이력 불러오기 ---
  async function loadSubHistory(){
    try{
      const r = await fetch('/api/subscription/history',{credentials:'include'});
      const d = await r.json();
      const ul = document.getElementById('sub-history-list');
      if(!d.items || !d.items.length){
        ul.innerHTML = '<li>이력 없음</li>'; return;
      }
      ul.innerHTML = d.items.map(it=>`<li><span>${it.approved_at||'-'} / ₩${(it.amount||0).toLocaleString()}</span><span>${it.status||'-'} ${it.receipt_url?`<a href="${it.receipt_url}" target="_blank">영수증</a>`:''}</span></li>`).join('');
    }catch(e){ console.error(e); }
  }

  // --- 구독 해지 ---
  document.getElementById('btn-cancel')?.addEventListener('click', async ()=>{
    if(!confirm('해지하시겠습니까? (기간 종료일까지 이용 가능, 다음 결제부터 미과금)')) return;
    const r = await fetch('/api/subscription/cancel', { method:'POST', credentials:'include' });
    if(r.ok){ alert('해지 요청 완료'); loadSubStatus(); } else { alert('해지 실패'); }
  });

  // --- Iframe 모달 컨트롤 ---
  const openModalBtn = document.getElementById('openPricingModalBtn');
  const closeModalBtn = document.getElementById('modalCloseBtn');
  const iframeModal = document.getElementById('iframeModal');
  const pricingIframe = document.getElementById('pricingIframe');
  openModalBtn.addEventListener('click', () => { pricingIframe.src = '/pricing.html'; iframeModal.style.display = 'flex'; });
  closeModalBtn.addEventListener('click', () => { iframeModal.style.display = 'none'; pricingIframe.src = ''; });
  iframeModal.addEventListener('click', (e) => { if (e.target === iframeModal) { iframeModal.style.display = 'none'; pricingIframe.src = ''; } });

  // --- 페이지 로드 시 초기 데이터 호출 ---
  setProfileInfo();
  loadSubStatus();
  loadSubHistory();
});