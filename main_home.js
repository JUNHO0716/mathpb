document.addEventListener('DOMContentLoaded', function() {
  // 1. 로그인 안 되어 있으면 로그인 창으로 이동
  const email = localStorage.getItem('userEmail');
  if (!email) {
    window.location.href = 'index.html';
    return;
  }

  // 2. 1구역에 내 아이디(이메일) 표시
  document.getElementById('userId').textContent = email;

  // 3. 더보기/프로필 메뉴 닫기 (바깥 클릭 시)
  document.body.addEventListener('click', function() {
    document.getElementById('moreMenu').style.display = 'none';
    document.getElementById('profileMenu').style.display = 'none';
  });

  // 4. 더보기 버튼 클릭: 메뉴 열기
  document.getElementById('moreMenuBtn').onclick = function(e) {
    e.stopPropagation();
    document.getElementById('moreMenu').style.display = 'block';
    document.getElementById('profileMenu').style.display = 'none';
  };

  // 5. 프로필 버튼 클릭: 메뉴 열기
  document.getElementById('profileMenuBtn').onclick = function(e) {
    e.stopPropagation();
    document.getElementById('profileMenu').style.display = 'block';
    document.getElementById('moreMenu').style.display = 'none';
  };

  // 6. 메뉴 내에서 클릭 시 메뉴가 닫히지 않도록(버블링 차단)
  document.getElementById('moreMenu').onclick = function(e) { e.stopPropagation(); };
  document.getElementById('profileMenu').onclick = function(e) { e.stopPropagation(); };

  // 7. 로그아웃 버튼 연결 (메뉴가 열려 있을 때만 동작)
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.onclick = function(e) {
      e.preventDefault();
      localStorage.removeItem('userEmail');
      window.location.href = 'login.html';
    };
  } else {
    console.warn('로그아웃 버튼이 없습니다!');
  }
});
