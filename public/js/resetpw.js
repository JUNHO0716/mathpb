document.addEventListener('DOMContentLoaded', () => {
    // UI 요소들
    const step1 = document.getElementById('step1-identify');
    const step2 = document.getElementById('step2-verify');
    const step3 = document.getElementById('step3-reset');

    const emailInput = document.getElementById('email');
    const viaEmailBtn = document.getElementById('viaEmailBtn');
    const viaPhoneBtn = document.getElementById('viaPhoneBtn');
    const sendCodeBtn = document.getElementById('sendCodeBtn');
    const step1Msg = document.getElementById('step1-msg');
    
    const verifyTitle = document.getElementById('verify-title');
    const verifyDesc = document.getElementById('verify-desc');
    const authCodeInput = document.getElementById('authCode');
    const timerSpan = document.getElementById('timer');
    const verifyCodeBtn = document.getElementById('verifyCodeBtn');
    const step2Msg = document.getElementById('step2-msg');

    const newPwInput = document.getElementById('newpw');
    const newPw2Input = document.getElementById('newpw2');
    const resetPwBtn = document.getElementById('resetPwBtn');
    const step3Msg = document.getElementById('step3-msg');
    
    let timerInterval;
    let selectedAuthMethod = 'email'; // 기본값

    // UI 상태 변경 함수
    function updateUIState(currentState) {
        step1.style.display = 'none';
        step2.style.display = 'none';
        step3.style.display = 'none';
        if (currentState === 'identify') step1.style.display = 'block';
        if (currentState === 'verify') step2.style.display = 'block';
        if (currentState === 'reset') step3.style.display = 'block';
    }
    
    // 인증 방식 선택 이벤트
    viaEmailBtn.addEventListener('click', () => {
        selectedAuthMethod = 'email';
        viaEmailBtn.classList.add('active');
        viaPhoneBtn.classList.remove('active');
    });
    viaPhoneBtn.addEventListener('click', () => {
        selectedAuthMethod = 'phone';
        viaPhoneBtn.classList.add('active');
        viaEmailBtn.classList.remove('active');
    });

    // 타이머 함수
    function startTimer(duration) {
        // (이전과 동일)
    }

    // 1단계: 인증번호 받기
    sendCodeBtn.addEventListener('click', async () => {
        const email = emailInput.value.trim();
        if (!email) {
            step1Msg.textContent = "아이디(이메일)를 입력해주세요.";
            step1Msg.style.color = 'red';
            return;
        }

        try {
            const res = await fetch('/send-verification-code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, method: selectedAuthMethod }) // 선택한 인증 방식 전달
            });
            const data = await res.json();
            
            if (res.ok) {
                updateUIState('verify');
                verifyTitle.textContent = selectedAuthMethod === 'email' ? '이메일 인증' : '휴대폰 인증';
                verifyDesc.textContent = data.maskedDestination 
                    ? `${data.maskedDestination}(으)로 발송된 6자리 인증번호를 입력해주세요.`
                    : '인증번호가 발송되었습니다. 6자리를 입력해주세요.';
                startTimer(180);
            } else {
                step1Msg.textContent = data.msg || "오류가 발생했습니다.";
                step1Msg.style.color = 'red';
            }
        } catch(err) {
            step1Msg.textContent = "서버와 통신할 수 없습니다.";
            step1Msg.style.color = 'red';
        }
    });

    // 2단계: 인증번호 확인
    verifyCodeBtn.addEventListener('click', async () => {
        // (이전과 동일)
    });

    // 3단계: 비밀번호 변경
    resetPwBtn.addEventListener('click', async () => {
        // (이전과 동일)
    });
});