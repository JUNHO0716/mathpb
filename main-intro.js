document.getElementById('login-form').addEventListener('submit', function(e) {
  e.preventDefault();
  const email = document.getElementById("email").value;
  const pw = document.getElementById("password").value;

  // ★ 서버 연동 전엔 아래처럼 임시 로그인으로!
  if (email === "test@aaa.com" && pw === "1234") {
    window.location.href = 'dashboard.html';
  } else {
    document.getElementById('login-error').style.display = 'block';
    document.getElementById('login-error').textContent = "로그인 정보가 올바르지 않습니다.";
  }
});
