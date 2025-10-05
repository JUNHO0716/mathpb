document.addEventListener('DOMContentLoaded', function () {
  // ▼ fetch 경로에서 맨 앞의 '/'를 제거하여 상대 경로로 수정했습니다.
   document.body.style.opacity = 1;
   
  fetch('footer.html')
    .then(response => {
      if (response.ok) return response.text();
      return Promise.resolve('');
    })
    .then(data => {
      if (data) {
        // 1. 푸터 내용을 페이지에 삽입합니다.
        document.body.insertAdjacentHTML('beforeend', data);

        // --- ▼▼▼ [핵심] 푸터 기능 활성화 코드를 여기에 추가합니다 ▼▼▼ ---
        const header = document.querySelector('.footer-collapsible-header');
        const parent = document.querySelector('.footer-collapsible');

        if (header && parent) {
          header.addEventListener('click', () => {
            // 모바일 화면(768px 이하)에서만 작동합니다.
            if (window.innerWidth <= 768) {
              parent.classList.toggle('expanded');
            }
          });
        }
        // --- ▲▲▲ 여기까지 추가 ▲▲▲ ---
      }
    })
    .catch(error => console.error('Footer loading failed:', error));

  // 아이디 저장 기능 (체크박스)
  const saveIdCheckbox = document.getElementById('save_id');
  const emailInput = document.getElementById('login_email');

  if (saveIdCheckbox && emailInput) {
    const savedId = localStorage.getItem('saved_id');
    if (savedId) {
      emailInput.value = savedId;
      saveIdCheckbox.checked = true;
    }
    saveIdCheckbox.addEventListener('change', function () {
      if (this.checked && emailInput.value) {
        localStorage.setItem('saved_id', emailInput.value);
      } else {
        localStorage.removeItem('saved_id');
      }
    });
    emailInput.addEventListener('input', function () {
      if (saveIdCheckbox.checked) {
        localStorage.setItem('saved_id', this.value);
      }
    });
  }

  // 로그인 폼 제출 기능
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.onsubmit = async function (e) {
      e.preventDefault();
      const id = document.getElementById('login_email').value.trim();
      const password = document.getElementById('login_password').value;
      const resultBox = document.getElementById('loginResult');
      const keepLoggedIn = document.getElementById('keep-login').checked;

      try {
        const res = await fetch('/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, password, keepLoggedIn })
        });
        const data = await res.json();
        
        if (res.ok) {
          if (document.getElementById('save_id').checked) {
              localStorage.setItem('saved_id', id);
          }
          // ▼▼▼▼▼ [수정된 부분] ▼▼▼▼▼
          // 1. body에 fade-out 클래스를 추가해 애니메이션을 시작합니다.
          document.body.classList.add('fade-out');
          
          // 2. CSS transition 시간(0.5초) 후에 페이지를 이동시킵니다.
          setTimeout(() => {
            window.location.href = '/index.html';
          }, 500); // 500밀리초 = 0.5초
          // ▲▲▲▲▲ [수정된 부분] ▲▲▲▲▲
        } else {
          resultBox.textContent = data.msg || '아이디 또는 비밀번호가 올바르지 않습니다.';
          resultBox.style.display = 'block';
        }
      } catch (err) {
        resultBox.textContent = '서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.';
        resultBox.style.display = 'block';
      }
    };
  }
});