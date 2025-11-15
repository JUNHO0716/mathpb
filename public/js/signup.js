// 스텝 상태 관리
let currentStep = 1;
const TOTAL_STEPS = 7;
let idVerified = false;

// 페이지 로드 시 실행될 초기화 함수들
document.addEventListener('DOMContentLoaded', function () {
  populateBirthdateSelectors();
  initStepUI();
  addEventListeners();
});

// 생년월일 드롭다운 채우기
function populateBirthdateSelectors() {
  const yearSelect = document.getElementById('birth_year');
  const monthSelect = document.getElementById('birth_month');
  const daySelect = document.getElementById('birth_day');
  const currentYear = new Date().getFullYear();

  for (let i = currentYear; i >= 1940; i--) {
    const option = document.createElement('option');
    option.value = i;
    option.textContent = i;
    yearSelect.appendChild(option);
  }
  for (let i = 1; i <= 12; i++) {
    const option = document.createElement('option');
    option.value = i;
    option.textContent = i;
    monthSelect.appendChild(option);
  }
  for (let i = 1; i <= 31; i++) {
    const option = document.createElement('option');
    option.value = i;
    option.textContent = i;
    daySelect.appendChild(option);
  }
}

// 스텝형 UI 초기화
function initStepUI() {
  updateStepUI();
}

// 스텝 이동
function goToStep(step) {
  if (step > TOTAL_STEPS) step = TOTAL_STEPS;
  if (step <= currentStep) return;
  currentStep = step;
  updateStepUI();
}

// 스텝 UI 갱신
function updateStepUI() {
  const blocks = document.querySelectorAll('.step-block');
  blocks.forEach((block) => {
    const step = parseInt(block.dataset.step || '1', 10);
    if (step <= currentStep) {
      block.classList.add('is-visible');
    } else {
      block.classList.remove('is-visible');
    }
  });

  const indicator = document.getElementById('stepIndicator');
  const barFill = document.getElementById('stepBarFill');
  if (indicator) indicator.textContent = `${currentStep} / ${TOTAL_STEPS}`;
  if (barFill) barFill.style.width = `${(currentStep / TOTAL_STEPS) * 100}%`;

  const submitBtn = document.querySelector('.signup-btn.submit');
  if (submitBtn) {
    submitBtn.disabled = currentStep < TOTAL_STEPS;
  }
}

// 모든 이벤트 리스너 등록
function addEventListeners() {
  const idCheckBtn = document.getElementById('idCheckBtn');
  if (idCheckBtn) idCheckBtn.addEventListener('click', checkId);

  const idInput = document.getElementById('signup_id');
  if (idInput) {
    idInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        checkId();
      }
    });
  }

  const addrSearchBtn = document.getElementById('addrSearchBtn');
  if (addrSearchBtn) addrSearchBtn.addEventListener('click', execDaumPostcode);

  const emailSelect = document.getElementById('signup_email_select');
  if (emailSelect) emailSelect.addEventListener('change', (e) => setEmailDomain(e.target));

  const signupForm = document.getElementById('signupForm');
  if (signupForm) signupForm.addEventListener('submit', handleSignupSubmit);

  const phoneInput = document.getElementById('signup_phone');
  if (phoneInput) {
    phoneInput.addEventListener('input', (e) => {
      formatPhoneNumber(e);
      handlePhoneStep();
    });
  }

  const pw = document.getElementById('signup_pw');
  const pw2 = document.getElementById('signup_pw2');
  if (pw) pw.addEventListener('input', handlePasswordStep);
  if (pw2) pw2.addEventListener('input', handlePasswordStep);

  const nameInput = document.getElementById('signup_name');
  if (nameInput) nameInput.addEventListener('blur', handleNameStep);

  const addr1Input = document.getElementById('signup_addr1');
  if (addr1Input) addr1Input.addEventListener('input', handleAddressStep);

  const emailIdInput = document.getElementById('signup_email_id');
  const emailDomainInput = document.getElementById('signup_email_domain');
  if (emailIdInput) emailIdInput.addEventListener('blur', handleEmailStep);
  if (emailDomainInput) emailDomainInput.addEventListener('blur', handleEmailStep);
}

// 닫기 버튼 (필요하면 사용)
function closeSignup() {
  location.href = 'login.html';
}

// 이메일 도메인 자동 입력
function setEmailDomain(selectElement) {
  const domainInput = document.getElementById('signup_email_domain');
  if (!domainInput) return;
  if (selectElement.value && selectElement.value !== '직접입력') {
    domainInput.value = selectElement.value;
    domainInput.readOnly = true;
  } else {
    domainInput.value = '';
    domainInput.readOnly = false;
  }
}

// 아이디 중복 확인
async function checkId() {
  const idInput = document.getElementById('signup_id');
  const id = idInput ? idInput.value.trim() : '';

  if (!id) {
    return showModal('중복확인', '아이디를 입력하세요!');
  }

  try {
    const res = await fetch('/check-id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    const data = await res.json();

    if (res.ok) {
      idVerified = true;
      showModal('사용 가능', data.msg || '사용 가능한 아이디입니다.', () => {
        goToStep(2);
        const pwInput = document.getElementById('signup_pw');
        if (pwInput) pwInput.focus();
      });
    } else {
      idVerified = false;
      showModal('사용 불가', data.msg || '이미 사용 중인 아이디입니다.');
    }
  } catch (err) {
    showModal('오류', '서버 오류 발생');
  }
}

// 비밀번호 유효성 & 스텝 진행
function handlePasswordStep() {
  const ok = isPasswordValid();
  if (ok && currentStep < 3) {
    goToStep(3);
    const nameInput = document.getElementById('signup_name');
    if (nameInput) nameInput.focus();
  }
}

function isPasswordValid() {
  const password = document.getElementById('signup_pw').value;
  const password2 = document.getElementById('signup_pw2').value;
  const pwRule = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()\-\_=+{}\[\]:;"'<>,.?/]).{8,}$/;
  const hintEl = document.getElementById('pwHint');

  let message = '대문자, 숫자, 특수문자를 포함해 8자 이상 입력해 주세요.';
  let statusClass = '';

  if (!password) {
    statusClass = '';
  } else if (!pwRule.test(password)) {
    message = '조건을 아직 만족하지 않았어요.';
    statusClass = 'error';
  } else if (password !== password2) {
    message = '비밀번호가 서로 일치하지 않습니다.';
    statusClass = 'error';
  } else {
    message = '좋아요! 안전한 비밀번호입니다.';
    statusClass = 'success';
  }

  if (hintEl) {
    hintEl.textContent = message;
    hintEl.classList.remove('error', 'success');
    if (statusClass) {
      hintEl.classList.add(statusClass);
    }
  }

  return pwRule.test(password) && password === password2;
}

// 이름 입력 후 다음 스텝
function handleNameStep() {
  const name = document.getElementById('signup_name').value.trim();
  if (name && currentStep < 4) {
    goToStep(4);
  }
}

// 주소 입력 후 다음 스텝
function handleAddressStep() {
  const addr = document.getElementById('signup_addr1').value.trim();
  if (addr && currentStep < 5) {
    goToStep(5);
  }
}

// 전화번호 입력 후 다음 스텝
function handlePhoneStep() {
  const phone = document.getElementById('signup_phone').value.replace(/\D/g, '');
  if (phone.length >= 10 && currentStep < 6) {
    goToStep(6);
  }
}

// 이메일 입력 후 다음 스텝
function handleEmailStep() {
  const id = document.getElementById('signup_email_id').value.trim();
  const domain = document.getElementById('signup_email_domain').value.trim();
  if (id && domain && currentStep < 7) {
    goToStep(7);
  }
}

// 모달(팝업) 표시
function showModal(title, msg, onOk) {
  const modalBg = document.getElementById('modalBg');
  const modalTitle = document.getElementById('modalTitle');
  const modalMsg = document.getElementById('modalMsg');
  const okBtn = document.getElementById('modalOkBtn');

  if (!modalBg || !modalTitle || !modalMsg || !okBtn) return;

  modalTitle.textContent = title || '';
  modalMsg.textContent = msg || '';
  modalBg.style.display = 'flex';

  okBtn.onclick = function () {
    modalBg.style.display = 'none';
    if (typeof onOk === 'function') onOk();
  };
}

// 회원가입 폼 제출 처리
// 회원가입 폼 제출 처리
async function handleSignupSubmit(event) {
  event.preventDefault();

    if (!idVerified) {
    return showModal("아이디 확인", "아이디 중복 확인을 먼저 해주세요.");
  }

  const password  = document.getElementById('signup_pw').value;
  const password2 = document.getElementById('signup_pw2').value;

  // 비밀번호 동일 여부
  if (password !== password2) {
    return showModal("비밀번호 오류", "비밀번호가 일치하지 않습니다.");
  }

  // 비밀번호 규칙 검사 (대문자, 숫자, 특수문자 포함 8자 이상)
  const pwRule = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()\-\_=+{}\[\]:;"'<>,.?/]).{8,}$/;
  if (!pwRule.test(password)) {
    return showModal(
      "비밀번호 조건 오류",
      "비밀번호는 대문자, 숫자, 특수문자를 포함해 8자 이상이어야 합니다."
    );
  }

  // ✅ 생년월일 필수 체크 + 날짜 유효성 체크
  const birthYear  = document.getElementById('birth_year').value;
  const birthMonth = document.getElementById('birth_month').value;
  const birthDay   = document.getElementById('birth_day').value;

  if (!birthYear || !birthMonth || !birthDay) {
    return showModal("생년월일 확인", "생년월일을 모두 선택해 주세요.");
  }

  const d = new Date(Number(birthYear), Number(birthMonth) - 1, Number(birthDay));
  const valid =
    d.getFullYear() === Number(birthYear) &&
    d.getMonth() + 1 === Number(birthMonth) &&
    d.getDate() === Number(birthDay);

  if (!valid) {
    return showModal("생년월일 확인", "유효한 생년월일을 선택해 주세요.");
  }

  const birthdate = `${birthYear}-${String(birthMonth).padStart(2, '0')}-${String(birthDay).padStart(2, '0')}`;

  // 기본 입력값들
  const id          = document.getElementById('signup_id').value.trim();
  const name        = document.getElementById('signup_name').value.trim();
  const phone       = document.getElementById('signup_phone').value.trim();
  const emailId     = document.getElementById('signup_email_id').value.trim();
  const emailDomain = document.getElementById('signup_email_domain').value.trim();
  const addr1       = document.getElementById('signup_addr1').value.trim();
  const addr2       = document.getElementById('signup_addr2').value.trim();

  const email = `${emailId}@${emailDomain}`;

  const formData = {
    id,
    email,
    password,
    name,
    phone,
    addr1,
    addr2,
    birthdate
  };

  try {
    const res = await fetch('/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });
    const data = await res.json();

    if (res.ok) {
      showModal("회원가입 성공", "회원가입이 완료되었습니다.", () => {
        location.href = "login.html";
      });
    } else {
      // ✅ 서버에서 오는 에러 메시지 우선 사용 (이메일/휴대폰 중복 등)
      showModal("회원가입 실패", data.msg || "이미 사용 중인 이메일 또는 휴대폰 번호입니다.");
    }
  } catch (err) {
    showModal("서버 오류", "서버 연결에 실패했습니다.");
  }
}


// 전화번호 자동 하이픈
function formatPhoneNumber(event) {
  let value = event.target.value.replace(/\D/g, '').slice(0, 11);
  let result = '';
  if (value.length < 4) {
    result = value;
  } else if (value.length < 8) {
    result = `${value.slice(0, 3)}-${value.slice(3)}`;
  } else {
    result = `${value.slice(0, 3)}-${value.slice(3, 7)}-${value.slice(7)}`;
  }
  event.target.value = result;
}

// 다음 주소 찾기 (Daum 우편번호)
function execDaumPostcode() {
  new daum.Postcode({
    oncomplete: function (data) {
      const addr = data.roadAddress || data.jibunAddress;
      document.getElementById('signup_addr1').value = addr;
      document.getElementById('signup_addr2').focus();
      handleAddressStep();
    }
  }).open();
}
