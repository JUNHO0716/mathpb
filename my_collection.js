import {
  loadFolderTree, saveFolderTree,
  insertIntoTree, removeFromTree
} from './folderModel.js';

let tree, currentFolderId = null;

function renderFolderNode(node, parentUl) {
  // (이전 예제와 동일) li 생성, +하위, × 삭제, 클릭 시 currentFolderId 설정
}

function refreshFolderTree() {
  tree = loadFolderTree();
  const ul = document.getElementById('folder-tree-root');
  ul.innerHTML = '';
  tree.folders.forEach(node => renderFolderNode(node, ul));
}

function renderSheets() {
  const main = document.getElementById('sheet-list');
  main.innerHTML = '';
  if (!currentFolderId) return;
  const folder = /* 재귀 탐색으로 해당 노드 찾기 */;
  document.getElementById('current-folder-name').textContent = folder.name;
  folder.sheets.forEach(s => {
    const card = document.createElement('div');
    card.textContent = s.name;
    card.onclick = () => {
      location.href = `/test_detail.html?folderId=${currentFolderId}&sheetId=${s.id}`;
    };
    main.appendChild(card);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  // 1) 폴더 트리 초기 렌더
  refreshFolderTree();

  // 2) 새 최상위 폴더
  document.getElementById('createRootFolderBtn').onclick = ()=>{ /* prompt + insertIntoTree + save + refresh */ };

  // 3) 시험지 만들기 버튼
  document.getElementById('createSheetBtn').onclick = ()=> {
    if (!currentFolderId) return alert('폴더를 선택하세요');
    const name = prompt('시험지 이름:');
    const sheetObj = { id: 'sheet_'+Date.now(), name, createdAt:new Date().toISOString(), filename:'' };
    insertIntoTree(tree.folders, currentFolderId, sheetObj, 'sheet');
    saveFolderTree(tree);
    renderSheets();
  };

  // 4) HWP 병합 버튼
  document.getElementById('mergeHwpBtn').onclick = ()=> {
    // fetch POST to /merge API 혹은 Flask 서버 호출
  };
});
