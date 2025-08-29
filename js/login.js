// ===== 모든 초기 애니메이션이 끝난 뒤 모달 오픈 (DOMContentLoaded 보장) =====
document.addEventListener('DOMContentLoaded', function () {
  const modal = document.getElementById('infoModal');
  if (!modal) return;

  const openModal = () => {
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  };
  const closeModal = () => {
    modal.classList.remove('open');
    document.body.style.overflow = '';
  };

  modal.querySelector('.close')?.addEventListener('click', closeModal);
  modal.querySelector('[data-close]')?.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  const lastPanel = document.querySelector('.login-card');
  let opened = false;
  const show = () => {
    if (opened) return;
    opened = true;
    openModal();
  };

  if (lastPanel) {
    const cs = getComputedStyle(lastPanel);
    const hasAnim = cs.animationName && cs.animationName !== 'none';
    if (hasAnim) {
      lastPanel.addEventListener('animationend', show, { once: true });
      setTimeout(show, 4100); // delay(2.8s)+duration(1.0s)+여유
    } else {
      setTimeout(show, 300);
    }
  } else {
    setTimeout(show, 300);
  }
});

// 아이디 저장 기능 (로컬스토리지 사용)
window.onload = function() {
  const saved = localStorage.getItem('saved_id');
  if(saved) {
    document.getElementById('login_email').value = saved;
    document.getElementById('save_id').checked = true;
  }
};
document.getElementById('save_id').addEventListener('change', function() {
  const email = document.getElementById('login_email').value;
  if(this.checked && email) {
    localStorage.setItem('saved_id', email);
  } else {
    localStorage.removeItem('saved_id');
  }
});
document.getElementById('login_email').addEventListener('input', function() {
  if(document.getElementById('save_id').checked) {
    localStorage.setItem('saved_id', this.value);
  }
});

// 실제 서버 연동 로그인 (Node.js + MySQL)
document.getElementById('loginForm').onsubmit = async function(e) {
  e.preventDefault();
  const id = document.getElementById('login_email').value.trim();
  const password = document.getElementById('login_password').value;
  const box = document.getElementById('loginResult');
  try {
    const res = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, password })
    });
    const data = await res.json();
    if (res.ok) {
      localStorage.setItem('userId', id);
      window.location.href = '/index.html'; // 이동
    } else {
      box.className = 'login-result error';
      box.textContent = data.msg || '아이디 또는 비밀번호가 올바르지 않습니다.';
      box.style.display = 'block';
    }
  } catch (err) {
    box.className = 'login-result error';
    box.textContent = '서버 연결 오류';
    box.style.display = 'block';
  }
};
