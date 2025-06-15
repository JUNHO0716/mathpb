// public/js/folderModel.js

const STORAGE_KEY = 'folders_user_1'; // 실제 userId 로 동적 처리하세요

export function loadFolderTree() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) return JSON.parse(raw);
  const initial = { userId: 'user_1', folders: [] };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
  return initial;
}

export function saveFolderTree(tree) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tree));
}

export function insertIntoTree(nodes, targetId, newObj, mode) { /* 앞 예제 복사 */ }
export function removeFromTree(nodes, targetId, mode) { /* 앞 예제 복사 */ }
export function findPath(nodes, targetId, path = []) { /* 앞 예제 복사 */ }
