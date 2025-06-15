// folder.js

// 1. localStorage 키 정의
const STORAGE_KEY = 'myFolders';

// 2. 저장된 폴더 목록 불러오기 (없으면 빈 배열)
function loadFolders() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) return JSON.parse(raw);
  return [];
}

// 3. 폴더 목록을 저장하기
function saveFolders(arr) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
}

// 4. 화면에 폴더 목록 그리기
function renderFolders() {
  const list = loadFolders();
  const ul = document.getElementById('folderList');
  ul.innerHTML = ''; // 지우고

  list.forEach((name, idx) => {
    const li = document.createElement('li');
    li.textContent = name;

    // 삭제 버튼
    const btnDel = document.createElement('button');
    btnDel.textContent = '❌';
    btnDel.style.marginLeft = '8px';
    btnDel.onclick = () => {
      list.splice(idx, 1);      // 배열에서 제거
      saveFolders(list);
      renderFolders();          // 다시 그리기
    };

    li.appendChild(btnDel);
    ul.appendChild(li);
  });
}

// 5. 새 폴더 추가 버튼 클릭 처리
document.addEventListener('DOMContentLoaded', () => {
  renderFolders(); // 첫 실행 시 목록 뿌리기

  document.getElementById('addFolderBtn').onclick = () => {
    const name = prompt('새 폴더 이름을 입력하세요:');
    if (!name) return;              // 취소했으면 아무것도 안 함

    const list = loadFolders();
    list.push(name);                // 새 이름 추가
    saveFolders(list);
    renderFolders();                // 화면 갱신
  };
});
