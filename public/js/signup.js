// 페이지 로드 시 실행될 초기화 함수들
document.addEventListener('DOMContentLoaded', function() {
  populateBirthdateSelectors();
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

// 모든 이벤트 리스너 등록
function addEventListeners() {
  document.getElementById('idCheckBtn').addEventListener('click', checkId);
  document.getElementById('addrSearchBtn').addEventListener('click', execDaumPostcode);
  document.getElementById('signup_email_select').addEventListener('change', (e) => setEmailDomain(e.target));
  document.getElementById('signupForm').addEventListener('submit', handleSignupSubmit);
  document.getElementById('signup_phone').addEventListener('input', formatPhoneNumber);
}

// 닫기 버튼 (인라인 onclick 유지 또는 JS로 이동)
function closeSignup() {
  location.href = "login.html";
}

// 이메일 도메인 자동 입력
function setEmailDomain(selectElement) {
  const domainInput = document.getElementById('signup_email_domain');
  if (selectElement.value && selectElement.value !== "직접입력") {
    domainInput.value = selectElement.value;
    domainInput.readOnly = true;
  } else {
    domainInput.value = "";
    domainInput.readOnly = false;
  }
}

// 아이디 중복 확인
async function checkId() {
  const id = document.getElementById('signup_id').value.trim();
  if (!id) {
    return showModal("중복확인", "아이디를 입력하세요!");
  }
  try {
    const res = await fetch('/check-id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    const data = await res.json();
    showModal(res.ok ? "사용 가능" : "사용 불가", data.msg);
  } catch (err) {
    showModal("오류", "서버 오류 발생");
  }
}

// 모달(팝업) 표시
function showModal(title, msg, onOk) {
  const modalBg = document.getElementById('modalBg');
  document.getElementById('modalTitle').textContent = title || '';
  document.getElementById('modalMsg').textContent = msg || '';
  modalBg.style.display = 'flex';
  
  const okBtn = document.getElementById('modalOkBtn');
  okBtn.onclick = function() {
    modalBg.style.display = 'none';
    if (typeof onOk === 'function') onOk();
  };
}

// 회원가입 폼 제출 처리
async function handleSignupSubmit(event) {
  event.preventDefault();
  
  const password = document.getElementById('signup_pw').value;
  const password2 = document.getElementById('signup_pw2').value;

  if (password !== password2) {
    return showModal("비밀번호 오류", "비밀번호가 일치하지 않습니다.");
  }
  
  const pwRule = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()\-_=+{}[\]:;"'<>,.?/]).{8,}$/;
  if (!pwRule.test(password)) {
    return showModal("비밀번호 조건 오류", "비밀번호는 대문자, 숫자, 특수문자를 포함해 8자 이상이어야 합니다.");
  }

  const formData = {
    id: document.getElementById('signup_id').value.trim(),
    email: `${document.getElementById('signup_email_id').value.trim()}@${document.getElementById('signup_email_domain').value.trim()}`,
    password: password,
    name: document.getElementById('signup_name').value.trim(),
    phone: document.getElementById('signup_phone').value.trim()
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
      showModal("회원가입 실패", data.msg || "중복된 이메일입니다.");
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

// 다음 주소 찾기
function execDaumPostcode() {
  new daum.Postcode({
    oncomplete: function(data) {
      let addr = data.roadAddress || data.jibunAddress;
      document.getElementById("signup_addr1").value = addr;
      document.getElementById("signup_addr2").focus();
    }
  }).open();
}