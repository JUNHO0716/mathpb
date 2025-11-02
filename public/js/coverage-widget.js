// /public/js/coverage-widget.js
(function () {
  const pct = n => (n || 0) + '%';
  const LABEL = { high: '고등', middle: '중등' };
  const CHUNK = 120;
  const MAX_HEX = 35; // ✅ 최대 벌집 개수 한도

  async function api(url) {
    const r = await fetch(url, { credentials: 'include', cache: 'no-store' });
    if (!r.ok) throw new Error(url + ' ' + r.status);
    return r.json();
  }
  const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; };

  // ▷ 벌집 배치 오프셋 적용
  function applyHoneycomb(grid){
    if (!grid) return;
    const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').length || 1;
    const items = grid.querySelectorAll('.hex');
    items.forEach((el, i) => {
      const row = Math.floor(i / cols);
      el.classList.toggle('_offset', row % 2 === 1); // 홀수(1,3,5...) 행만 반 칸 밀기
    });
  }

async function fetchYears() {
  try {
    const d = await api('/api/coverage/years');
    return (d && Array.isArray(d.years) && d.years.length) ? d.years : [2024, 2025];
  } catch (e) {
    console.warn('[coverage] years fallback:', e);
    return [2024, 2025];
  }
}

  async function loadCities(state){ return api(`/api/coverage/cities?level=${state.level}&year=${state.year}`); }
  async function loadDistricts(state){ if(!state.city) return []; return api(`/api/coverage/districts?level=${state.level}&year=${state.year}&city=${encodeURIComponent(state.city)}`); }
  async function loadStats(state, scoped=false){
    const q = new URLSearchParams({ level: state.level, year: state.year });
    if (scoped && state.city)     q.set('city', state.city);
    if (scoped && state.district) q.set('district', state.district);
    if (state.grade)              q.set('grade', state.grade);
    if (state.semester)           q.set('semester', state.semester);
    if (state.exam_type)          q.set('exam_type', state.exam_type);
    return api(`/api/coverage/stats?${q.toString()}`);
  }
  async function loadSchools(state){
    const q = new URLSearchParams({ level: state.level, year: state.year });
    if (state.city)               q.set('city', state.city);
    if (state.district)           q.set('district', state.district);
    if (state.grade)              q.set('grade', state.grade);
    if (state.semester)           q.set('semester', state.semester);
    if (state.exam_type)          q.set('exam_type', state.exam_type);
    return api(`/api/coverage/schools?${q.toString()}`);
  }

  async function loadSchoolFiles(id, year){ return api(`/api/coverage/school-files?schoolId=${id}&year=${year}`); }

function build(root, state){
  root.innerHTML = `
    <div class="cov-card">
      <div class="cov-top">
        <div class="seg seg-left">
          <select id="cov-year" class="neo-select"></select>
          <select id="cov-level" class="neo-select">
            <option value="high">고등</option>
            <option value="middle">중등</option>
          </select>

          <!-- ▼ 학년: 드롭다운(전체 제거) -->
          <select id="cov-grade" class="neo-select">
            <option value="1">1학년</option>
            <option value="2">2학년</option>
            <option value="3">3학년</option>
          </select>

          <!-- ▼ 학기/시험: 통합 드롭다운(전체 제거) -->
          <select id="cov-term" class="neo-select">
            <option value="1-mid">1학기 중간</option>
            <option value="1-final">1학기 기말</option>
            <option value="2-mid">2학기 중간</option>
            <option value="2-final">2학기 기말</option>
          </select>
        </div>

        <div class="filters">
          <select id="cov-city" class="neo-select"><option value="">시/도 전체</option></select>
          <select id="cov-district" class="neo-select" disabled><option value="">시/군/구 전체</option></select>
        </div>
      </div>

        <div id="cov-chips" class="cov-chips"></div>

        <!-- ▼ 메인 영역 좌우 7:1 분할 -->
        <div class="cov-main">
          <!-- 왼쪽: 벌집 -->
        <div class="cov-left">
          <div id="cov-grid" class="hexgrid"></div>
          <div id="cov-sentinel" class="cov-sentinel"></div>
          <!-- ▼ 왼쪽 전체(칩+벌집)를 한 번에 가리는 전역 로더 -->
          <div class="bulk-loader"><div class="spinner" aria-label="로딩중"></div></div>
        </div>

          <!-- 오른쪽: 통계 패널 -->
          <aside class="cov-right">
          <div class="cov-stats">
            <div class="stat glass-panel">
              <div class="label">전체 수거율</div>
              <div id="cov-all-pct" class="value">0%</div>
              <div id="cov-all-count" class="sub">0/0</div>
              <!-- ▼ 로딩 오버레이 -->
              <div class="loader"><div class="spinner" aria-label="로딩중"></div></div>
            </div>
            <div class="stat glass-panel">
              <div class="label">선택 영역</div>
              <div id="cov-region-pct" class="value">0%</div>
              <div id="cov-region-count" class="sub">0/0</div>
              <!-- ▼ 로딩 오버레이 -->
              <div class="loader"><div class="spinner" aria-label="로딩중"></div></div>
            </div>
          </div>
          </aside>
        </div>
      </div>
    `;

  const levelSel = root.querySelector('#cov-level');
  levelSel.value = state.level;
  levelSel.onchange = () => {
    state.level = levelSel.value;  // ← 상태 갱신
    state.city = '';
    state.district = '';
    refreshAll(root, state);       // ← 실제로 호출
  };


  root.querySelector('#cov-city').addEventListener('change', async e=>{
    state.city = e.target.value || '';
    state.district = '';
    setBulkLoading(root, true);
    try{
      await refreshDistricts(root, state);
      await Promise.all([ refreshStats(root, state, true), refreshGrid(root, state) ]);
    } finally {
      setBulkLoading(root, false);
    }
  });

    root.querySelector('#cov-district').addEventListener('change', async e=>{
      state.district = e.target.value || '';
      setBulkLoading(root, true);
      try{
        await Promise.all([ refreshStats(root, state, true), refreshGrid(root, state) ]);
      } finally {
        setBulkLoading(root, false);
      }
    });

// ▼ 학년 드롭다운
const gradeSel = root.querySelector('#cov-grade');
gradeSel.value = state.grade || '1';
gradeSel.onchange = async ()=>{
  state.grade = gradeSel.value;
  setBulkLoading(root, true);
  try{
    await Promise.all([ refreshStats(root, state), refreshGrid(root, state) ]);
  } finally { setBulkLoading(root, false); }
};

// ▼ 학기/시험 통합 드롭다운
const termSel = root.querySelector('#cov-term');
termSel.value = `${state.semester || '1'}-${state.exam_type || 'mid'}`;
termSel.onchange = async ()=>{
  const [sem, typ] = termSel.value.split('-');
  state.semester  = sem;        // '1' | '2'
  state.exam_type = typ;        // 'mid' | 'final'
  setBulkLoading(root, true);
  try{
    await Promise.all([ refreshStats(root, state), refreshGrid(root, state) ]);
  } finally { setBulkLoading(root, false); }
};


  } // ← 여기서 build()가 **정상 종료**


  
  // 패널 로딩 토글(첫번째=전체, 두번째=선택)
  function setStatLoading(root, target/* 'all' | 'region' */, on){
    const panel = root.querySelector(
      target === 'all' ? '.cov-stats .stat:nth-child(1)' : '.cov-stats .stat:nth-child(2)'
    );
    if (panel) panel.classList.toggle('is-loading', !!on);
  }

  // ▼ chips+벌집을 한꺼번에 가리는 전역 로딩
  function setBulkLoading(root, on){
    const card = root.querySelector('.cov-card');
    if (card) card.classList.toggle('is-bulk-loading', !!on);
  }

  function updateChips(root, state, scopedPct){
    const wrap = root.querySelector('#cov-chips');
    const loc = [state.city, state.district].filter(Boolean).join(' ');

    let v = (typeof scopedPct === 'number')
      ? scopedPct
      : (()=>{
          const el = root.querySelector('#cov-region-pct');
          if(!el) return 0;
          const m = (el.textContent || '').match(/([\d.]+)/);
          return m ? +m[1] : 0;
        })();

    wrap.innerHTML = `
      ${loc ? `<span class="chip">${loc}</span>` : `<span class="chip muted">전국</span>`}
      <span class="chip">${state.year}</span>
      <span class="chip">${state.level==='high'?'고등':'중등'}</span>
      <span class="chip strong">${pct(v)}</span>
    `;
  }

  async function refreshYears(root, state){
    const years = await fetchYears(); 
    state.years = years;
    const sel = root.querySelector('#cov-year');
    sel.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
    sel.value = String(state.year);
    sel.onchange = () => {
      state.year = +sel.value;
      state.city = '';
      state.district = '';
      refreshAll(root, state);
    };
  }
    async function refreshCities(root, state){
    const sel = root.querySelector('#cov-city');
    let list = [];
    try { list = await loadCities(state); } catch (e) { list = []; }
    sel.innerHTML = `<option value="">시/도 전체</option>` + list.map(
      c=>`<option value="${c.city}">${c.city} (${c.pct || 0}%)</option>`
    ).join('');
    sel.value = state.city || '';
    root.querySelector('#cov-district').disabled = !sel.value;
  }

  async function refreshDistricts(root, state){
    const sel = root.querySelector('#cov-district');
    if(!state.city){
      sel.innerHTML = `<option value="">시/군/구 전체</option>`;
      sel.disabled = true;
      return;
    }
    let list = [];
    try { list = await loadDistricts(state); } catch (e) { list = []; }
    sel.innerHTML = `<option value="">시/군/구 전체</option>` + list.map(
      d=>`<option value="${d.district}">${d.district} (${d.pct || 0}%)</option>`
    ).join('');
    sel.disabled = false;
    sel.value = state.district || '';
  }

async function refreshStats(root, state, scopedOnly=false){
  if (!scopedOnly){
    // 전체와 선택을 동시에 요청 → 완료 후 한 번에 표시
    setStatLoading(root, 'all', true);
    setStatLoading(root, 'region', true);
    const [allRes, selRes] = await Promise.allSettled([
      loadStats(state, false),
      loadStats(state, true)
    ]);

    // 전체
    if (allRes.status === 'fulfilled'){
      const all = allRes.value || {};
      root.querySelector('#cov-all-pct').textContent   = pct(all.pct||0);
      root.querySelector('#cov-all-count').textContent = `${all.filled||0} / ${all.total||0}`;
    }else{
      root.querySelector('#cov-all-pct').textContent   = '0%';
      root.querySelector('#cov-all-count').textContent = `0 / 0`;
    }

    // 선택
    if (selRes.status === 'fulfilled'){
      const sel = selRes.value || {};
      root.querySelector('#cov-region-pct').textContent   = pct(sel.pct||0);
      root.querySelector('#cov-region-count').textContent = `${sel.filled||0} / ${sel.total||0}`;
      updateChips(root, state, sel.pct||0);
    }else{
      root.querySelector('#cov-region-pct').textContent   = '0%';
      root.querySelector('#cov-region-count').textContent = `0 / 0`;
      updateChips(root, state, 0);
    }

    setStatLoading(root, 'all', false);
    setStatLoading(root, 'region', false);
    return;
  }

  // ▼ 지역만 갱신하는 경우(시/도·시/군/구 변경)
  setStatLoading(root, 'region', true);
  try{
    const sel = await loadStats(state, true);
    root.querySelector('#cov-region-pct').textContent   = pct(sel.pct||0);
    root.querySelector('#cov-region-count').textContent = `${sel.filled||0} / ${sel.total||0}`;
    updateChips(root, state, sel.pct||0);
  }catch{
    root.querySelector('#cov-region-pct').textContent   = '0%';
    root.querySelector('#cov-region-count').textContent = `0 / 0`;
    updateChips(root, state, 0);
  }
  setStatLoading(root, 'region', false);
}



function destroyObserver(state){
  if(state.observer){ state.observer.disconnect(); state.observer=null; }
  if(state.resizeObs){ state.resizeObs.disconnect(); state.resizeObs=null; } // 추가
}

// ✅ 로딩 오버레이를 함수 내부에서 직접 토글해 '애니메이션 → 일괄 표시' 보장
async function refreshGrid(root, state){
  setBulkLoading(root, true);            // ← 벌집 영역 로딩 ON
  try{
    destroyObserver(state);

    let list = [];
    try { list = await loadSchools(state); } catch (e) { list = []; }
    state._listAll = list.slice(0, MAX_HEX); // 최대 35개
    state._rendered = 0;

    const grid = root.querySelector('#cov-grid');

    // 이전 스케일/간격 초기화
    grid.style.removeProperty('--hexW');
    grid.style.removeProperty('--gap');

    // 기존 노드 제거
    grid.innerHTML = '';

    // 배치만 갱신(사이즈 변화 대응)
    state.resizeObs = new ResizeObserver(()=>{ layoutHoneycomb(grid); });
    state.resizeObs.observe(grid);

    if (state._listAll.length) {
      // 첫 렌더 (목록이 CHUNK 이하라면 한 번에 다 그려짐)
      renderNextChunk(root, state);

      // 필요 시 추가 청크 렌더(현재 MAX_HEX=35라 거의 동작하지 않음)
      const sentinel = root.querySelector('#cov-sentinel');
      state.observer = new IntersectionObserver(
        (ents)=>{ if(ents.some(e=>e.isIntersecting)) renderNextChunk(root, state); },
        { threshold: 0.1 }
      );
      state.observer.observe(sentinel);
    }
  } finally {
    setBulkLoading(root, false);         // ← 모든 준비 완료 후 로딩 OFF
  }
}

  // '검단고등학교' → '검단고', '성남여자고등학교' → '성남여자고', '분당중앙고' → 그대로
  function normalizeSchoolLabel(raw){
    const name = (raw || '').replace(/\s+/g, '');
    if (/고등학교/.test(name)) return name.replace(/고등학교.*$/, '고');
    if (/중학교/.test(name))   return name.replace(/중학교.*$/, '중');
    if (name.includes('고'))    return name.split('고')[0] + '고';
    if (name.includes('중'))    return name.split('중')[0] + '중';
    return name;
  }

  // 5글자 초과 시 2줄(5자/나머지) — 너무 길면 2번째 줄을 6자까지만 노출
  function makeLabel(raw){
    const s = normalizeSchoolLabel(raw);
    return (s.length > 5) ? (s.slice(0,5) + '<br>' + s.slice(5,11)) : s;
  }

  function renderNextChunk(root, state){
    const grid = root.querySelector('#cov-grid');
    const end = Math.min(state._rendered + CHUNK, state._listAll.length);
    const slice = state._listAll.slice(state._rendered, end);
    const frag = document.createDocumentFragment();
    slice.forEach(s=>{
      const label = makeLabel(s.short_name || s.name);  // ✅ '○○고/○○중' + 2줄 처리
      const div = el(`
        <div class="hex ${s.has_any?'filled':'empty'}" title="${s.name}" data-id="${s.id}">
          <span class="hex-label">${label}</span>
        </div>
      `);
      div.addEventListener('click', () => openSchoolModal(state, s));
      frag.appendChild(div);
    });
    grid.appendChild(frag);
    state._rendered = end;

    layoutHoneycomb(grid);   // 크기 고정 배치 (스케일 업 제거)
  }

  // 로딩 모달 없이: 먼저 파일을 조회하고, 결과에 따라 즉시 목록 모달 또는 상세패널만 띄운다.
  async function openSchoolModal(state, school){
    let files = [];
    try {
      const res = await loadSchoolFiles(school.id, state.year);
      files = (res && Array.isArray(res.files)) ? res.files : [];
    } catch (e) {
      files = [];
    }

    // 1) 파일이 없으면 상세 패널만 바로 오픈 (모달 없음)
    if (!files.length) {
      if (window.DetailsPanel && typeof window.DetailsPanel.open === 'function') {
        window.DetailsPanel.open({
          id: '',
          title: `${school.name} 시험지`,
          school: school.name,
          grade: '-',
          subject: '-',
          year: String(state.year),
          semester: '-',
          uploaded_at: null,
          myMemo: ''
        });
      }
      return;
    }

    // 2) 파일이 있으면 곧바로 목록 모달을 만든다(불러오기 모달 없음)
    const overlay = el(`
      <div class="cov-modal-backdrop">
        <div class="cov-modal">
          <div class="cov-modal-head">
            <div class="title">${school.region || ''} ${school.district || ''} ${school.name} — ${state.year} (${LABEL[state.level]})</div>
          </div>
          <div class="cov-modal-body">
            <ul class="file-list">
              ${files.map(f=>`
                <li class="file-item" data-file-id="${f.id}">
                  <div class="meta">
                    <span class="badge">${f.year || state.year}</span>
                    ${f.semester ? `<span class="badge">${f.semester}학기</span>` : ''}
                    ${f.exam_type ? `<span class="badge">${f.exam_type}</span>` : ''}
                    ${f.subject ? `<span class="badge">${f.subject}</span>` : ''}
                  </div>
                  <div class="title">${f.title || '제목없음'}</div>
                </li>`).join('')}
            </ul>
          </div>
        </div>
      </div>
    `);
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e)=>{ if(e.target===overlay) overlay.remove(); });

    // 파일 항목 클릭 → 기존 상세패널 오픈 후 모달 닫기
    const listEl = overlay.querySelector('.file-list');
    const __fileMap = new Map(files.map(v => [String(v.id), v]));
    listEl?.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      const li = ev.target.closest('.file-item[data-file-id]');
      if (!li) return;

      const id   = String(li.dataset.fileId);
      const file = __fileMap.get(id);

      if (!(window.DetailsPanel && typeof window.DetailsPanel.open === 'function')) {
        console.warn('[coverage] details-panel.js 로드 필요');
        return;
      }

      // myMemo 1회 조회
      if (file && file.id && file.myMemo === undefined) {
        try {
          const r = await fetch(`/api/my/memos/${encodeURIComponent(file.id)}`);
          if (r.ok) file.myMemo = (await r.json()).memo || '';
        } catch {}
      }

      window.DetailsPanel.open(file);
      overlay.remove();
    });
  }

  async function refreshAll(root, state){
    await refreshYears(root, state);
    await refreshCities(root, state);
    await refreshDistricts(root, state);
    await Promise.all([ refreshStats(root, state), refreshGrid(root, state) ]);
  }


  // ADD — 컨테이너 가로폭에 맞춰 육각형 크기/간격을 자동 스케일
function fitHoneycombToWidth(grid, {target=0.96, maxScale=1.4} = {}){
  if(!grid) return;
  const cs = getComputedStyle(grid);
  const W0 = parseFloat(cs.getPropertyValue('--hexW')) || 96;
  const G0 = parseFloat(cs.getPropertyValue('--gap'))  || 8;

  // 현재 배치된 클러스터 실제 가로폭 측정
  let min = Infinity, max = -Infinity;
  grid.querySelectorAll('.hex').forEach(el=>{
    const r = el.getBoundingClientRect();
    if (!r.width) return;
    if (r.left  < min) min = r.left;
    if (r.right > max) max = r.right;
  });
  const clusterW   = Math.max(0, max - min);
  const containerW = grid.getBoundingClientRect().width || 0;
  if (!clusterW || !containerW) return;

  const want  = containerW * target;        // 컨테이너의 96%까지 채우기
  if (clusterW >= want) return;             // 이미 충분히 넓으면 패스

  const scale = Math.min(maxScale, want / clusterW);
  grid.style.setProperty('--hexW', `${Math.round(W0 * scale)}px`);
  grid.style.setProperty('--gap',  `${Math.max(2, Math.round(G0 * scale))}px`);
}

  // 축좌표 기반 벌집 배치 (flat-top)
  function layoutHoneycomb(grid){
    if(!grid) return;
    const items = Array.from(grid.querySelectorAll('.hex'));

    // CSS 변수 읽기
    const cs   = getComputedStyle(grid);
    const W    = parseFloat(cs.getPropertyValue('--hexW')) || 96;     // 실제 육각 폭
    const G    = parseFloat(cs.getPropertyValue('--gap'))  || 8;      // 간격(gutter)
    const Wstep = W + G;                                              // 벌집 가로 스텝
    const Hstep = Wstep * 0.8660254037844386;                         // = (W+G)*√3/2

    // flat-top 축좌표(q,r) → 픽셀 (RedBlob 공식을 단순화)
    const q2x = q => 0.75 * Wstep * q;                                // x = 3/4 * (W+G) * q
    const qr2y = (q,r) => Hstep * (r + q/2);                          // y = H * (r + q/2)

    // 이웃 우선순위: 우상(1,-1) → 우하(1,0) → 상(0,-1) → 하(0,1) → 좌(-1,0) → 좌하(-1,1)
    const DIRS = [[1,-1],[1,0],[0,-1],[0,1],[-1,0],[-1,1]];

    // BFS로 좌표 생성: 항상 이전 타일에 "변"으로 붙게 확장
    const n     = items.length;
    const used  = new Set();
    const queue = [[0,0]];
    const pos   = [];
    const key   = (q,r)=>`${q}:${r}`;

    while(pos.length < n && queue.length){
      const [q,r] = queue.shift();
      const k = key(q,r);
      if(used.has(k)) continue;
      used.add(k);
      pos.push([q,r]);
      for(const [dq,dr] of DIRS){
        const nq=q+dq, nr=r+dr, nk=key(nq,nr);
        if(!used.has(nk) && !queue.some(([x,y])=>x===nq && y===nr)) queue.push([nq,nr]);
      }
    }
    // 좌상단 기준 좌표 수집
    let minX=Infinity, minY=Infinity;
    const raw = pos.map(([q,r])=>{
      const x = q2x(q), y = qr2y(q,r);
      if (x < minX) minX = x; if (y < minY) minY = y;
      return [x,y];
    });

    // 1차 보정(좌상단을 0,0으로 이동)
    const shifted = raw.map(([x,y]) => [x - minX, y - minY]);

    // ▶ 가로 중앙 정렬: 클러스터 너비와 컨테이너 너비를 비교해 offsetX 계산
    const hexWidth = W;
    let clusterRight = 0;
    shifted.forEach(([x,_]) => { if (x + hexWidth > clusterRight) clusterRight = x + hexWidth; });
    const containerWidth = grid.clientWidth;
    // 가운데 정렬: 남는 폭의 절반을 좌측 마진으로
    const offsetX = Math.max(0, (containerWidth - clusterRight) / 2);

    // 실제 위치 적용 + 컨테이너 높이 계산
    let maxY = -Infinity;
    shifted.forEach(([x,y],i)=>{
      const tx = x + offsetX;
      const ty = y;
      items[i].style.setProperty('--tx', `${tx}px`);
      items[i].style.setProperty('--ty', `${ty}px`);
      if (ty > maxY) maxY = ty;
    });

    // 컨테이너 높이 확보(육각 높이 + gutter 만큼 여유)
    const minH = parseFloat(cs.getPropertyValue('--minH')) || 520;
    const needH = (maxY + (W * 0.8660254037844386) + G);
    grid.style.height = Math.max(minH, needH) + 'px';
  }

window.renderCoverageWidget = async function(mount, opts={}){
  const root = (typeof mount==='string') ? document.querySelector(mount) : mount;
  if(!root) return;
  let years = await fetchYears();             // ← 내부에서 try/catch 처리됨
  if (!Array.isArray(years) || !years.length) years = [2024, 2025];

  const now = new Date().getFullYear();
  const latest = years[years.length-1] || Math.max(2024, now);

  const state = {
    years,
    year: (opts.defaultYear && years.includes(+opts.defaultYear)) ? +opts.defaultYear : latest,
    level: (opts.defaultLevel === 'middle') ? 'middle' : 'high',
    grade: '1',            // 기본 1학년
    semester: '1',         // 기본 1학기
    exam_type: 'mid',      // 기본 중간
    city:'', district:'', _listAll:[], _rendered:0, observer:null, honeyObs:null
  };

  function initNeoSelectMenus(root){
  const selects = root.querySelectorAll('.neo-select');
  selects.forEach(sel => setupOne(sel));
  // 바깥 클릭 시 닫기
  document.addEventListener('click', (e)=>{
    const anyOpen = root.querySelector('.neo-select.open');
    if (!anyOpen) return;
    const wrap = anyOpen.closest('.neo-select-wrap');
    if (wrap && !wrap.contains(e.target)) closeMenu(anyOpen);
  });
  // 스크롤/리사이즈 시 닫기
  ['scroll','resize'].forEach(ev=> window.addEventListener(ev, ()=> {
    root.querySelectorAll('.neo-select.open').forEach(closeMenu);
  }));
  function setupOne(select){
    // 이미 래핑되었으면 패스
    if (select.parentElement && select.parentElement.classList.contains('neo-select-wrap')) return;

    // 래퍼 생성 (포지셔닝용)
    const wrap = document.createElement('div');
    wrap.className = 'neo-select-wrap';
    select.parentNode.insertBefore(wrap, select);
    wrap.appendChild(select);

  // 🔒 네이티브 드롭다운 열림 차단 + 커스텀만 토글
  select.addEventListener('mousedown', (e) => {
    e.preventDefault();         // ← 브라우저 기본 열기 차단 (핵심)
    select.focus();             // 포커스 유지(스타일/키보드 조작용)
    toggleMenu(select);         // 커스텀 메뉴 토글
  });

  // 클릭 기본 동작도 방지(일부 브라우저 이중 트리거 방지)
  select.addEventListener('click', (e) => e.preventDefault());

  // 키보드 접근성: 포커스 상태에서 Space/Enter로 열기
  select.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      openMenu(select);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeMenu(select);
    }
  });

  // 값 변경 시 즉시 반영 후 닫기
  select.addEventListener('change', () => closeMenu(select));

  }

  function toggleMenu(select){
    if (select.classList.contains('open')) { closeMenu(select); }
    else { openMenu(select); }
  }
  function openMenu(select){
    // 이미 열려 있으면 무시
    if (select.classList.contains('open')) return;

    // 기존 메뉴 제거
    closeAll();

    const wrap = select.closest('.neo-select-wrap');
    const menu = document.createElement('div');
    menu.className = 'neo-menu';

    // option → 메뉴 아이템 생성
    Array.from(select.options).forEach(opt=>{
      const item = document.createElement('div');
      item.className = 'neo-menu-item';
      item.textContent = opt.textContent;
      item.dataset.value = opt.value;
      if (opt.disabled) { item.style.opacity = .5; item.style.pointerEvents = 'none'; }
      item.addEventListener('click', ()=>{
        select.value = opt.value;
        // change 이벤트 발생시켜 기존 로직과 연결
        select.dispatchEvent(new Event('change', { bubbles:true }));
        closeMenu(select);
      });
      menu.appendChild(item);
    });

    wrap.appendChild(menu);
    select.classList.add('open');   // ▼ 화살표 뒤집힘 (CSS로 처리)
  }

  function closeMenu(select){
    if (!select) return;
    const wrap = select.closest('.neo-select-wrap');
    if (!wrap) return;
    const menu = wrap.querySelector('.neo-menu');
    if (menu) menu.remove();
    select.classList.remove('open');  // ▼ 화살표 원래대로
  }
  function closeAll(){
    root.querySelectorAll('.neo-select.open').forEach(closeMenu);
  }
}


  build(root, state);
  initNeoSelectMenus(root);

  // 초기 로딩 on → 데이터 로드 → 예외와 무관하게 off
  setBulkLoading(root, true);
  setStatLoading(root, 'all', true);
  setStatLoading(root, 'region', true);
  try{
    await refreshAll(root, state);
  } finally {
    setBulkLoading(root, false);
    setStatLoading(root, 'all', false);
    setStatLoading(root, 'region', false);
  }
            // 내부 각 단계도 try/catch로 방어
  };

})();
