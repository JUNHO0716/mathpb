(function (global) {
  // ===== 기본 설정 =====
  const Defaults = {
    listSelector: '#file-list',                 // 파일 목록 tbody
    linkSelector: 'a.file-title-link',          // 목록 내 클릭 타겟
    panelSelector: '#details-panel',            // 패널
    overlaySelector: '#details-overlay',        // 오버레이
    contentSelector: '#details-panel-content',  // 내용 영역
    closeSelector: '#details-panel-close',      // 닫기 버튼
    // 상세 조회: 1) getFileById() → 2) window.fileData[] → 3) GET /api/files/:id
    getDetails: async (id) => {
      let file = null;

      if (typeof global.getFileById === 'function') {
        const v = await Promise.resolve(global.getFileById(id));
        if (v) file = { ...v };
      }
      if (!file && Array.isArray(global.fileData)) {
        const v = global.fileData.find(x => String(x.id) === String(id));
        if (v) file = { ...v };
      }
      if (!file) {
        const res = await fetch(`/api/files/${encodeURIComponent(id)}`, {
          credentials: 'include' // ← 세션 쿠키 보장
        });
        if (!res.ok) throw new Error('상세 조회 실패');
        file = await res.json();
      }
            // ★ 유저별 메모 가져오기 (분리 엔드포인트)
      try {
        const r = await fetch(`/api/my/memos/${encodeURIComponent(id)}`);
        if (r.ok) {
          const j = await r.json();
          file.myMemo = j.memo || '';
        }
      } catch (_) { /* ignore */ }

      return file;
    },

    saveMemo: async (id, memo) => {
      const res = await fetch(`/api/files/${encodeURIComponent(id)}/memo`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memo })
      });
      if (!res.ok) throw new Error('메모 저장 실패');
      return true;
    },

    // 렌더 템플릿(기본)
    render: (f) => {
      const up = f && f.uploaded_at ? new Date(f.uploaded_at).toLocaleDateString('ko-KR') : '정보 없음';
      const canMemo = !!(f && f.id);
      const currentMemo = (f?.myMemo ?? f?.memo ?? '');
      const memoBtn = canMemo ? (currentMemo ? '메모 수정' : '메모 저장') : '메모 불가';
      const title = f?.title ?? '';
      return `
        <div class="details-section">
          <h4 class="details-section-title">파일명</h4>
          <p class="details-filename-text" title="${title}">${title}</p>
        </div>
        <div class="details-section">
          <h4 class="details-section-title">시험지 정보</h4>
          <div class="details-info-grid">
            <span class="details-info-label">학교</span><span class="details-info-value">${f?.school || '정보 없음'}</span>
            <span class="details-info-label">학년</span><span class="details-info-value">${f?.grade ?? '-'}</span>
            <span class="details-info-label">과목</span><span class="details-info-value">${f?.subject ?? '-'}</span>
            <span class="details-info-label">연도/학기</span><span class="details-info-value">${f?.year ?? '-'} / ${f?.semester ?? '-'}</span>
            <span class="details-info-label">업로드일</span><span class="details-info-value">${up}</span>
          </div>
        </div>
        <div class="details-section">
          <h4 class="details-section-title">요청사항 (메모)</h4>
          <textarea
            id="details-memo-textarea"
            class="details-memo-textarea"
            placeholder="${canMemo ? '관리자에게 전달할 메모를 남겨주세요.' : '등록된 시험지에만 메모를 남길 수 있습니다.'}"
            ${canMemo ? '' : 'disabled'}
          >${canMemo ? currentMemo : ''}</textarea>
          <div class="details-button-wrapper">
            <button
              id="details-memo-save-btn"
              class="details-save-btn"
              data-id="${f?.id ?? ''}"
              ${canMemo ? '' : 'disabled'}
            >${memoBtn}</button>
          </div>
          ${canMemo ? '' : '<p class="details-hint">등록되지 않은 시험지는 메모 기능을 사용할 수 없습니다.</p>'}
        </div>
      `;
    },
  };

  let cfg, panel, overlay, content, closeBtn;

  let onContentClick = null;
  let onListClick = null;

  function bindClose() {
    function close() {
      panel && panel.classList.remove('is-open');
      overlay && overlay.classList.remove('is-open');
    }
    if (closeBtn) closeBtn.addEventListener('click', close);
    if (overlay) overlay.addEventListener('click', close);
    return close;
  }

  function openWith(file) {
    if (!panel || !overlay || !content) return;
    content.innerHTML = cfg.render(file);
    // ❌ 여기서는 더 이상 content에 리스너를 붙이지 않음
    panel.classList.add('is-open');
    overlay.classList.add('is-open');
  }


  function attachClick() {
    const list = document.querySelector(cfg.listSelector);
    if (!list) return;
    if (onListClick) list.removeEventListener('click', onListClick);
    onListClick = async (e) => {
      const a = e.target.closest(cfg.linkSelector);
      if (!a) return;
      e.preventDefault();
      const id = a.dataset.id;
      try {
        const file = await cfg.getDetails(id);
        openWith(file);
      } catch (err) {
        console.error(err);
        alert('상세 정보를 불러오지 못했습니다.');
      }
    };
    list.addEventListener('click', onListClick);
  }


function init(options) {
  cfg = Object.assign({}, Defaults, options || {});
  panel   = document.querySelector(cfg.panelSelector);
  overlay = document.querySelector(cfg.overlaySelector);
  content = document.querySelector(cfg.contentSelector);
  closeBtn= document.querySelector(cfg.closeSelector);

  if (!panel || !overlay || !content) {
    console.warn('[details-panel] 필수 요소를 찾을 수 없습니다.');
    return;
  }
  bindClose();

  // ▼ 메모 저장 핸들러: 한 번만 붙이도록 정리
  if (onContentClick) content.removeEventListener('click', onContentClick);
  onContentClick = async (e) => { /* 기존 그대로 */ };
  content.addEventListener('click', onContentClick);

  attachClick(); // 기존: #file-list 클릭 전용

  // ✅ 추가: 홈/커버리지에서 쏘는 이벤트도 직접 처리
  document.removeEventListener('coverage:fileClick', onCoverageFileClick, { passive: true });
  document.addEventListener('coverage:fileClick', onCoverageFileClick, { passive: true });
}

// 새로 추가
async function onCoverageFileClick(e) {
  try {
    const { id, placeholder } = (e && e.detail) || {};
    if (id) {
      const file = await Defaults.getDetails(id); // ← 위에서 보강한 getDetails 사용
      openWith(file);
    } else if (placeholder) {
      openWith(placeholder); // 최소 정보라도 표시
    }
  } catch (err) {
    console.error(err);
    alert('상세 정보를 불러오지 못했습니다.');
  }
}


  // 전역 API (원하면 다른 페이지에서 옵션 주입도 가능)
  global.DetailsPanel = { init, open: openWith };

  // 자동 초기화: DOMContentLoaded 시 기본 셋업
  document.addEventListener('DOMContentLoaded', () => init());
})(window);
