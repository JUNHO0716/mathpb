// js/cs.js

// --- FAQ 아코디언 기능 ---
// DOMContentLoaded를 제거하여 AJAX로 로드될 때 바로 실행되도록 합니다.
const faqItems = document.querySelectorAll('.faq-item');
faqItems.forEach(item => {
    const questionButton = item.querySelector('.faq-question');
    questionButton.addEventListener('click', () => {
        const isOpen = item.classList.toggle('open');
        const answer = item.querySelector('.faq-answer');
        const icon = questionButton.querySelector('i');
        
        if (isOpen) {
            // 다른 열려있는 항목들을 닫습니다.
            faqItems.forEach(otherItem => {
                if (otherItem !== item && otherItem.classList.contains('open')) {
                    otherItem.classList.remove('open');
                    otherItem.querySelector('.faq-answer').style.maxHeight = null;
                    otherItem.querySelector('.faq-question i').classList.remove('rotate');
                }
            });
            
            // 현재 항목을 엽니다.
            answer.style.maxHeight = answer.scrollHeight + 'px';
            icon.classList.add('rotate');
        } else {
            answer.style.maxHeight = null;
            icon.classList.remove('rotate');
        }
    });
});

// --- 1:1 문의 전송 기능 ---
const inquiryForm = document.querySelector('.inquiry-form');
if(inquiryForm) { // 폼이 존재하는지 확인 후 이벤트 리스너 추가
    inquiryForm.addEventListener('submit', function (event) {
        // 1. 폼의 기본 제출 동작(새로고침)을 막습니다.
        event.preventDefault();

        // 2. 폼 데이터를 가져옵니다.
        const formData = new FormData(inquiryForm);
        const data = {
            type: formData.get('inquiry-type'),
            title: formData.get('inquiry-title'),
            content: formData.get('inquiry-content'),
            // 파일 처리는 더 복잡하므로 이 예제에서는 텍스트 데이터만 다룹니다.
        };

        // 3. fetch API를 사용해 백엔드 서버에 데이터를 전송합니다.
        fetch('/api/inquiry', { // 백엔드와 약속한 주소(API Endpoint)
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        })
        .then(response => {
            if (!response.ok) {
                // 서버에서 에러 응답이 온 경우를 처리
                return response.json().then(err => { throw new Error(err.message || '알 수 없는 오류') });
            }
            return response.json();
        })
        .then(result => {
            if (result.success) {
                alert('문의가 성공적으로 접수되었습니다.');
                inquiryForm.reset(); // 폼 초기화
            } else {
                alert('문의 접수에 실패했습니다: ' + (result.message || '내용을 확인해주세요.'));
            }
        })
        .catch(error => {
            console.error('Error:', error);
            alert('서버 통신 중 오류가 발생했습니다: ' + error.message);
        });
    });
}