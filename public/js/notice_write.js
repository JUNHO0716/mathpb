window.initializeNoticeWritePage = function(user) {
    // 관리자가 아니면 차단하고 공지사항 목록으로 돌려보냄
    if (!user || user.role !== 'admin') {
        alert('관리자만 접근 가능합니다.');
        // loadContent는 index.js에 정의된 전역 함수이므로 바로 사용 가능
        if(typeof loadContent === 'function') {
            loadContent('notice.html');
        }
        return;
    }

    const colors = ['#000000', '#e60000', '#ff9900', '#ffff00', '#008a00', '#0066cc', '#9933ff', '#ffffff', '#facccc', '#ffebcc', '#ffffcc', '#cce8cc', '#cce0f5', '#ebd6ff', '#bbbbbb', '#f06666', '#ffc266', '#ffff66', '#66b966', '#66a3e0', '#c285ff', '#888888', '#a10000', '#b26b00', '#b2b200', '#006100', '#0047b2', '#6b24b2', '#444444', '#5c0000', '#734600', '#737300', '#003a00', '#00297a', '#49167a'];
    const quill = new Quill('#editor', {
        theme: 'snow',
        placeholder: '내용을 입력하세요...',
        modules: {
            toolbar: {
                container: [
                    [{ 'font': [] }, { 'size': ['small', false, 'large', 'huge'] }],
                    ['bold', 'italic', 'underline', 'strike'],
                    [{ 'color': colors }, { 'background': colors }],
                    [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                    [{ 'align': [] }],
                    ['link', 'image']
                ],
                handlers: {
                    'image': imageHandler
                }
            }
        }
    });

    function imageHandler() {
        const input = document.createElement('input');
        input.setAttribute('type', 'file');
        input.setAttribute('accept', 'image/*');
        input.click();

        input.onchange = async () => {
            const file = input.files[0];
            if (file) {
                const formData = new FormData();
                formData.append('image', file);
                try {
                    // 서버에 이미지 업로드 API 엔드포인트가 필요합니다 (예: /api/upload-image)
                    const res = await fetch('/api/upload-image', {
                        method: 'POST',
                        body: formData,
                        credentials: 'include'
                    });
                    const result = await res.json();
                    if (res.ok) {
                        const range = quill.getSelection(true);
                        quill.insertEmbed(range.index, 'image', result.imageUrl);
                    } else {
                        alert('이미지 업로드 실패: ' + (result.msg || '서버 응답 오류'));
                    }
                } catch (e) {
                    console.error('이미지 업로드 오류:', e);
                    alert('이미지 업로드 중 서버 오류가 발생했습니다.');
                }
            }
        };
    }

    const emojiPanel = document.getElementById('emojiPanel');
    const illustrationPanel = document.getElementById('illustrationPanel');
    
    function toggleEmojiPanel() {
        illustrationPanel.classList.remove('active');
        emojiPanel.classList.toggle('active');
        if (emojiPanel.classList.contains('active') && emojiPanel.innerHTML === '') {
            loadEmojis();
        }
    }

    function loadEmojis() {
        const emojis = ['😊', '😂', '😍', '🤔', '🔥', '👍', '🎉', '💯', '✨', '💡', '📌', '✅', '❌', '❓', '❗'];
        emojis.forEach(emoji => {
            const btn = document.createElement('button');
            btn.textContent = emoji;
            btn.onclick = () => insertEmoji(emoji);
            emojiPanel.appendChild(btn);
        });
    }

    function insertEmoji(emoji) {
        const range = quill.getSelection(true);
        quill.insertText(range.index, emoji);
    }

    function toggleIllustrationPanel() {
        emojiPanel.classList.remove('active');
        illustrationPanel.classList.toggle('active');
        if (illustrationPanel.classList.contains('active') && illustrationPanel.innerHTML === '') {
            loadIllustrations();
        }
    }

    function loadIllustrations() {
        const illustrations = [
            'image_banner/ad_big1.jpg',
            'image_banner/ad_big2.jpg',
            'image_banner/ad_big3.jpg',
        ];
        illustrations.forEach(imagePath => {
            const img = document.createElement('img');
            img.src = imagePath;
            img.onclick = () => insertIllustration(imagePath);
            illustrationPanel.appendChild(img);
        });
    }

    function insertIllustration(imagePath) {
        const range = quill.getSelection(true);
        quill.insertEmbed(range.index, 'image', imagePath);
    }

    async function submitPost() {
        const title = document.getElementById('titleInput').value.trim();
        const content = quill.root.innerHTML.trim();
        const category = document.getElementById('categorySelect').value;

        if (!title || !quill.getText().trim()) {
            alert('제목과 내용을 모두 입력해주세요.');
            return;
        }

        const formData = new FormData();
        formData.append('title', title);
        formData.append('content', content);
        formData.append('category', category);

        try {
            const res = await fetch('/api/notices', {
                method: 'POST',
                credentials: 'include',
                body: formData
            });
            const result = await res.json();
            if (res.ok) {
                alert('공지사항이 등록되었습니다!');
                // ▼▼▼ 페이지 새로고침 대신, 공지사항 메뉴를 클릭하여 목록으로 이동합니다 ▼▼▼
                document.getElementById('menu6').click();
            } else {
                alert('등록 실패: ' + (result.msg || '알 수 없는 오류'));
            }
        } catch (e) {
            console.error('공지 등록 오류:', e);
            alert('서버 오류가 발생했습니다.');
        }
    }
    
    // --- 이벤트 리스너 바인딩 ---
    quill.getModule('toolbar').addHandler('image', imageHandler);
    document.querySelector('.submit-btn').onclick = submitPost;
    document.getElementById('emojiToggle').onclick = toggleEmojiPanel;
    document.getElementById('illustrationToggle').onclick = toggleIllustrationPanel;
    
    // 패널 외부 클릭 시 패널 닫기
    document.addEventListener('click', function(e) {
        if (!emojiPanel.contains(e.target) && e.target.id !== 'emojiToggle') {
            emojiPanel.classList.remove('active');
        }
        if (!illustrationPanel.contains(e.target) && e.target.id !== 'illustrationToggle') {
            illustrationPanel.classList.remove('active');
        }
    });
};