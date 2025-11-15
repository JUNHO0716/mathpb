// /public/js/schedule-tabs.js
(function(){
  const LABEL = { high:'고등', middle:'중등' };
  const toKrLevel = v => (v==='high' ? '고등' : v==='middle' ? '중등' : v);
  const el = (html) => { const t=document.createElement('template'); t.innerHTML=html.trim(); return t.content.firstChild; };
  const fmt = (d)=> `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

  // ✅ 최대 15개 팔레트(1=파랑, 2=노랑 ...)
  const MAX_SCHOOLS = 15;
  const PALETTE = ['#3B82F6','#FACC15','#22C55E','#EF4444','#A855F7',
                   '#14B8A6','#FB923C','#EC4899','#6366F1','#84CC16',
                   '#06B6D4','#F59E0B','#8B5CF6','#F43F5E','#64748B'];

  async function api(url, opt){
    const r = await fetch(url, Object.assign(
      { credentials:'include', cache:'no-store' },
      opt || {}
    ));
    if (!r.ok) throw new Error(url + ' ' + r.status);
    return r.json();
  }


  // coverage API 재사용
  const loadCities     = (state)=> api(`/api/coverage/cities?level=${encodeURIComponent(toKrLevel(state.level))}&year=${state.year}`);
  const loadDistricts  = (state)=> !state.city ? [] : api(`/api/coverage/districts?level=${encodeURIComponent(toKrLevel(state.level))}&year=${state.year}&city=${encodeURIComponent(state.city)}`);
  const loadSchools    = (state)=> {
    const q = new URLSearchParams({ level: toKrLevel(state.level), year: state.year });
    if (state.city) q.set('city', state.city);
    if (state.district) q.set('district', state.district);
    q.set('limit', '500');
    return api(`/api/coverage/schools?${q.toString()}`);
  };

  const loadSaved = (level) =>
  api(`/api/schedule/picks?level=${encodeURIComponent(level)}`);
const saveSaved = (level, codes) =>
  api(`/api/schedule/picks`, {
    method:'PUT', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ level, codes })
  });
const clearSaved = (level) =>
  api(`/api/schedule/picks?level=${encodeURIComponent(level)}`, { method:'DELETE' });

  // 다양한 키 이름 대비 (+ 빈값 방어)
  function pickName(s){
    return s?.name || s?.SCHUL_NM || s?.school || s?.학교명 || s?.SchoolName || '';
  }
  function pickCode(s){
    const cand =
      s?.orgCode || s?.org_code ||
      s?.NEIS_CODE || s?.SD_SCHUL_CODE || s?.SCHUL_CODE ||
      s?.schoolCode || s?.school_code ||
      s?.code || s?.id || s?.schoolId || s?.SchoolID;
    const code = (cand!==undefined && cand!==null) ? String(cand).trim() : '';
    if (code) return code;
    // ⚠️ 코드가 아예 없을 때는 이름/지역으로 안전한 가짜키 생성(중복 최소화)
    const name = pickName(s) || '';
    const city = s?.city || s?.ATPT_OFCDC_SC_NM || '';
    const dist = s?.district || s?.JU_ORG_NM || '';
    return `${city}|${dist}|${name}`;
  }

  // 학사일정 API (서버 라우터 준비 필요)
  async function loadEvents(codes, startISO, endISO){
    if (!codes.length) return [];
    const q = new URLSearchParams({ codes: codes.join(','), start: startISO, end: endISO });
    // 기대 응답: { events: [{ schoolCode, schoolName, date:'YYYY-MM-DD', title }] }
    const res = await api(`/api/schedule/events?${q.toString()}`);
    const arr = res?.events || res || [];
    // NEIS 원본일 수 있는 필드들을 정규화
    return arr.map(e => ({
      schoolCode: e.schoolCode || e.school_code || e.orgCode || e.SD_SCHUL_CODE || e.SCHUL_CODE || '',
      schoolName: e.schoolName || e.school_name || e.SCHUL_NM || e.school || '',
      date: (e.date || e.AA_YMD || e.YMD || '').slice(0,10),
      title: e.title || e.EVENT_NM || e.event || e.일정명 || ''
    })).filter(x => x.date && x.title);
  }

  function monthEdge(year, month){ // month: 1~12
    const first = new Date(year, month-1, 1);
    const last  = new Date(year, month, 0);
    return { first, last, lastDay: last.getDate() };
  }

    // neo-select(벌집 필터와 동일)용 공통 스타일 주입
  function ensureNeoSelectStyles(){
    if (document.getElementById('neo-select-style')) return;
    const st = document.createElement('style');
    st.id = 'neo-select-style';
    st.textContent = `
      .neo-select-wrap{ position:relative; overflow:visible !important; }
      .neo-menu{
        position:absolute; top:calc(100% + 6px); left:0; right:0;
        max-height:320px; overflow-y:auto;
        background:#fff; border:1px solid #e6e8eb; border-radius:12px;
        box-shadow:0 12px 28px #0002; padding:6px 0; z-index:9999;
      }
      .neo-menu-item{ padding:10px 12px; white-space:nowrap; cursor:pointer; }
      .neo-menu-item:hover{ background:#f5f5f7; }
      .neo-select.open{ outline:0; }
    `;
    document.head.appendChild(st);
  }

  // neo-select 셀렉트 박스를 커스텀 드롭다운으로 바꾸는 초기화 함수
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

      // 기존 클래스(.sch-level/.sch-city/.sch-district 등)를 래퍼로도 복사해서
      // CSS grid 배치가 그대로 유지되도록 함
      const orig = (select.getAttribute('class') || '')
        .split(/\s+/)
        .filter(c => c && c !== 'neo-select');
      wrap.className = 'neo-select-wrap' + (orig.length ? (' ' + orig.join(' ')) : '');

      select.parentNode.insertBefore(wrap, select);
      wrap.appendChild(select);

      // 네이티브 드롭다운 열림 차단 + 커스텀만 토글
      select.addEventListener('mousedown', (e) => {
        e.preventDefault();         // 브라우저 기본 열기 차단
        select.focus();             // 포커스 유지
        toggleMenu(select);         // 커스텀 메뉴 토글
      });

      // 클릭 기본 동작도 방지(일부 브라우저 이중 트리거 방지)
      select.addEventListener('click', (e) => e.preventDefault());

      // 키보드 접근성
      select.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowDown') {
          e.preventDefault();
          openMenu(select);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          closeMenu(select);
        }
      });

      // 값 변경 시 즉시 닫기
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

      // 스크롤 영역
      menu.style.maxHeight = '60vh';
      menu.style.overflowY = 'auto';

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
      select.classList.add('open');
    }

    function closeMenu(select){
      if (!select) return;
      const wrap = select.closest('.neo-select-wrap');
      if (!wrap) return;
      const menu = wrap.querySelector('.neo-menu');
      if (menu) menu.remove();
      select.classList.remove('open');
    }

    function closeAll(){
      root.querySelectorAll('.neo-select.open').forEach(closeMenu);
    }
  }


  function buildUI(root){
    root.innerHTML = `
      <div class="sch-card">
        <div class="sch-left">
          <div class="sch-monthbar">
            <button class="sch-nav" data-dir="-1" aria-label="이전달">‹</button>
            <div class="sch-monthlabel"></div>
            <button class="sch-nav" data-dir="+1" aria-label="다음달">›</button>
          </div>
          <div class="sch-weekheads">
            <div>일</div><div>월</div><div>화</div><div>수</div><div>목</div><div>금</div><div>토</div>
          </div>
          <div class="sch-calgrid"></div>
          <div class="sch-daily">
            <div class="sch-daily-list"></div>
          </div>
        </div>

        <div class="sch-right">
        <div class="sch-filters">
          <select class="sch-level neo-select">
            <option value="high">고등</option>
            <option value="middle">중등</option>
          </select>
          <select class="sch-city neo-select"><option value="">시/도</option></select>
          <select class="sch-district neo-select"><option value="">구/군</option></select>

            <div class="sch-searchbox">
              <input class="sch-search" placeholder="학교명 검색">
              <button class="sch-add" type="button">추가</button>
            </div>
          </div>

          <div class="sch-lists">
            <div class="sch-list">
              <div class="sch-list-head">학교 목록</div>
              <div class="sch-list-body sch-schools"></div>
            </div>
            <div class="sch-list">
              <div class="sch-list-head">선택한 학교</div>
              <div class="sch-list-body sch-picked"></div>
            </div>
          </div>

          <!-- ✅ 하단 버튼 -->
          <div class="sch-actions">
            <button type="button" class="sch-reset">초기화</button>
            <button type="button" class="sch-save" disabled>저장</button>
          </div>
          </div> <!-- .sch-right -->
          </div>   <!-- .sch-card -->

          <!-- ✅ 초기화 확인 모달 -->
          <div class="sch-modal" aria-hidden="true">
            <div class="sch-modal-dim"></div>
            <div class="sch-modal-card" role="dialog" aria-modal="true">
              <div class="sch-modal-title">선택한 학교를 모두 삭제할까요?</div>
              <div class="sch-modal-desc">이 작업은 즉시 저장됩니다. 되돌릴 수 없습니다.</div>
              <div class="sch-modal-actions">
                <button type="button" class="sch-modal-cancel">취소</button>
                <button type="button" class="sch-modal-ok">초기화</button>
              </div>
            </div>
          </div>
    `;
    return {
      monthBar: root.querySelector('.sch-monthbar'),
      monthLabel: root.querySelector('.sch-monthlabel'),
      cal: root.querySelector('.sch-calgrid'),
      daily: root.querySelector('.sch-daily-list'),
      levelSel: root.querySelector('.sch-level'),
      citySel: root.querySelector('.sch-city'),
      distSel: root.querySelector('.sch-district'),
      search: root.querySelector('.sch-search'),
      addBtn: root.querySelector('.sch-add'),
      schools: root.querySelector('.sch-schools'),
      picked: root.querySelector('.sch-picked'),
      // ⬇⬇ 추가
      saveBtn: root.querySelector('.sch-save'),
      resetBtn: root.querySelector('.sch-reset'),
      modal: root.querySelector('.sch-modal'),
      modalOk: root.querySelector('.sch-modal-ok'),
      modalCancel: root.querySelector('.sch-modal-cancel'),
    };
  }

  function renderCalendar(ui, year, month, eventsByDate, selectCb, state){
    const { first, last, lastDay } = monthEdge(year, month);
    const startIdx = first.getDay(); // 0=Sun
    const boxes = [];

    // 1) 앞쪽 빈 칸(이전달 영역)
    for (let i=0; i<startIdx; i++) boxes.push('<div class="sch-day empty"></div>');

    // 2) 이번달 날짜
    for (let d=1; d<=lastDay; d++){
      const ds = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const items = eventsByDate.get(ds) || [];
      // 날짜별로 '학교코드'만 고유 수집 후 15개까지 표시
      // ✅ 선택한 학교의 색을 그대로 쓰기 위해 코드/이름을 모두 이용해 매칭
      const uniqCodes = [];
      for (const it of items){
        // 1) 선택한 집합에 NEIS 코드가 그대로 있는 경우
        let code = state.colorIdx.has(it.schoolCode) ? it.schoolCode : null;
        // 2) 없다면 학교명으로 역매핑
        if (!code) code = resolvePickedCodeByName(state, it.schoolName);
        if (!code) continue;
        if (!uniqCodes.includes(code)) {
          uniqCodes.push(code);
          if (uniqCodes.length >= MAX_SCHOOLS) break;
        }
      }
      const dots = uniqCodes.map(code => `<i class="dot ${colorClassOf(code, state)}"></i>`).join('');

      boxes.push(`
        <div class="sch-day" data-date="${ds}">
          <div class="num">${d}</div>
          <div class="dots" title="${items.length}건 일정">${dots}</div>
        </div>`);
    }

    // 3) 항상 6주(42칸) 고정: 뒤쪽 빈 칸(다음달 영역) 채우기
    const total = startIdx + lastDay;
    const trailing = (42 - (total % 42 || 42));
    for (let i=0; i<trailing; i++) boxes.push('<div class="sch-day empty"></div>');

    // 렌더
    ui.cal.innerHTML = boxes.join('');
    ui.monthLabel.textContent = `${year}년 ${month}월`;

    // 날짜칸만 클릭 가능
    ui.cal.querySelectorAll('.sch-day[data-date]').forEach(cell=>{
      cell.addEventListener('click', ()=>{
        ui.cal.querySelectorAll('.sch-day.sel').forEach(c=>c.classList.remove('sel'));
        cell.classList.add('sel');
        selectCb(cell.dataset.date, state);   // ✅ state 전달
      });
    });
  }

    function recomputeColors(state){
    state.colorIdx.clear();
    [...state.pickedSet].slice(0, MAX_SCHOOLS).forEach((code, i)=>{
      state.colorIdx.set(code, (i % MAX_SCHOOLS) + 1); // 1..15
    });
  }
  const colorClassOf = (code, state) => 'c' + (state.colorIdx.get(code) || 1);
  const badgeClassOf = (code, state) => 'b' + (state.colorIdx.get(code) || 1); // ✅ 배지 색 클래스

  // ✅ 이벤트의 학교명이 원래 선택한 학교 코드와 다를 수 있어 이름으로 역매핑
  const _norm = s => String(s||'').replace(/\s+/g,'').toLowerCase();
  function resolvePickedCodeByName(state, name){
    const want = _norm(name);
    for (const [code, nm] of state.pickedMap.entries()){
      if (_norm(nm) === want) return code;
    }
    return null; // 못 찾으면 null
  }

  function renderDaily(ui, date, items, state){
    ui.daily.innerHTML = items.length
      ? items.map(it => {
          // 선택한 학교의 코드→색 매핑을 이용해 배지 색 결정
          let code = state.colorIdx.has(it.schoolCode) ? it.schoolCode : resolvePickedCodeByName(state, it.schoolName);
          if (!code) code = [...state.pickedSet][0]; // 폴백
          const bClass = badgeClassOf(code, state);
          return `
            <div class="sch-item">
              <span class="sch-school badge ${bClass}">${it.schoolName || it.schoolCode}</span>
              <span class="sch-title">${it.title}</span>
            </div>`;
        }).join('')
      : `<div class="sch-empty">해당 날짜의 일정이 없습니다.</div>`;
  }

  // ✅ 목록 렌더: 체크 이벤트 안전망 + 버튼상태 확실 반영
  function renderSchoolList(ui, list, keyword, stagedSet, pickedSet, onStage){
    const kw = (keyword||'').trim();
    const rx = kw ? new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), 'i') : null;

    const rows = list
      .filter(s => !kw || rx.test(pickName(s)))
      .filter(s => !pickedSet.has(pickCode(s))) // 이미 선택된 건 왼쪽에서 숨김
      .map(s => {
        const code = pickCode(s);
        const name = pickName(s);
        const checked = stagedSet.has(code) ? 'checked' : '';
        return `<label class="sch-row">
          <input type="checkbox" data-code="${code}" data-name="${name}" ${checked}/>
          <span>${name}</span>
        </label>`;
      });

    ui.schools.innerHTML = rows.join('') || '<div class="sch-empty">학교가 없습니다.</div>';

    // 개별 체크 리스너(+일부 브라우저 click 보강)
    ui.schools.querySelectorAll('input[type=checkbox]').forEach(inp=>{
      const onchg = ()=>{
        const code = inp.dataset.code, name = inp.dataset.name;
        onStage(code, name, inp.checked);
      };
      inp.addEventListener('change', onchg);
      inp.addEventListener('click', onchg);
    });

    // 컨테이너 안전망: 실제 체크 수로 다시 계산(매 렌더마다 작동)
    ui.schools.addEventListener('change', ()=>{
      stagedSet.clear();
      ui.schools.querySelectorAll('input[type=checkbox]:checked').forEach(inp=>{
        stagedSet.add(inp.dataset.code);
      });
      ui.addBtn.disabled = (stagedSet.size === 0);
    });
  }

  // ✅ 선택한 학교에는 "이름만" 표기 (삭제 버튼 제거)
  function renderPicked(ui, pickedSet, pickedMap, state){
    const arr = [...pickedSet].map(code => ({ code, name: pickedMap.get(code) || code }));
    ui.picked.innerHTML = arr.length
      ? arr.map(s => `
          <span class="sch-tag" data-code="${s.code}">
            <span class="dot dot-sm ${colorClassOf(s.code, state)}"></span>
            <span class="label">${s.name}</span>
            <button class="sch-rm" type="button" aria-label="삭제">-</button>
          </span>
        `).join('')
      : '<div class="sch-empty">선택된 학교가 없습니다.</div>';
  }

  // (탭 아이콘 자동 삽입 로직 제거) — 탭 아이콘은 home에서만 관리

window.renderScheduleWidget = async function(mount, opts={}){
    const root = (typeof mount === 'string') ? document.querySelector(mount) : mount;
    if (!root) return;

    // coverage 벌집 필터와 동일한 neo-select 드롭다운 스타일 주입
    ensureNeoSelectStyles();

    const state = {
      year: (opts.defaultYear || new Date().getFullYear()),
      level: (opts.defaultLevel === 'middle') ? 'middle' : 'high',
      city: '', district: '',
      schoolsAll: [],
      stagedSet: new Set(),  // 왼쪽 목록에서 '체크만 한' 코드
      pickedSet: new Set(),  // 오른쪽으로 '추가'된 코드
      pickedMap: new Map(),  // code -> name
      colorIdx: new Map(),   // code -> 1..15 (색 인덱스)
      curYM: [new Date().getFullYear(), new Date().getMonth()+1],
      events: new Map(),
      savedOrder: []
    };

    const getOrder = ()=> [...state.pickedSet];
    const isDirty  = ()=> JSON.stringify(getOrder()) !== JSON.stringify(state.savedOrder);
    const updateSaveBtn = ()=> { ui.saveBtn.disabled = !isDirty(); };

    const ui = buildUI(root);

    // neo-select 드롭다운 초기화 (학사일정 필터에도 적용)
    initNeoSelectMenus(root);

    ui.addBtn.disabled = true;
    updateSaveBtn();   // ⭐ 추가 후 저장버튼 상태 갱신

    // 필터 바인딩
    ui.levelSel.value = state.level;
    ui.levelSel.addEventListener('change', async ()=>{
      state.level = ui.levelSel.value;
      state.city = ''; state.district='';
      await refreshCities();
      await refreshSchools();
      await refreshEvents();
      await loadSavedIntoState();     // ✅ 추가
    });
    ui.citySel.addEventListener('change', async ()=>{
      state.city = ui.citySel.value || '';
      state.district = '';
      await refreshDistricts();
      await refreshSchools();
      await refreshEvents();
    });
    ui.distSel.addEventListener('change', async ()=>{
      state.district = ui.distSel.value || '';
      await refreshSchools();
      await refreshEvents();
    });
    ui.search.addEventListener('input', ()=>{
      renderSchoolList(ui, state.schoolsAll, ui.search.value, state.stagedSet, state.pickedSet, onStageSchool);
    });

    // 달력 내비
    ui.monthBar.querySelectorAll('.sch-nav').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const dir = parseInt(btn.dataset.dir,10); // -1 or +1
        const [y,m] = state.curYM;
        const d = new Date(y, m-1+dir, 1);
        state.curYM = [d.getFullYear(), d.getMonth()+1];
        await refreshEvents(); // 월 변경 시 새 범위 로드
      });
    });

    function onStageSchool(code, name, checked){
      if (!code) return; // ← 빈 코드 방지 (핵심)
      if (checked) {
        state.stagedSet.add(code);
        state.pickedMap.set(code, name || code);
      } else {
        state.stagedSet.delete(code);
      }
      ui.addBtn.disabled = (state.stagedSet.size === 0);
    }

    // ⬇ addBtn 핸들러 바깥(이벤트 바인딩 섹션)에 두세요.
    ui.picked.addEventListener('click', async (e)=>{
      const btn = e.target.closest('.sch-rm');
      if (!btn) return;
      const wrap = btn.closest('[data-code]');
      const code = wrap?.dataset.code;
      if (!code) return;

      // 선택 해제
      state.pickedSet.delete(code);
      state.stagedSet.delete(code);
      recomputeColors(state);

      renderPicked(ui, state.pickedSet, state.pickedMap, state);
      renderSchoolList(ui, state.schoolsAll || [], ui.search.value, state.stagedSet, state.pickedSet, onStageSchool);
      await refreshEvents();

      updateSaveBtn();   // ⭐ 삭제 후 저장버튼 상태 갱신
    });


    async function refreshCities(){
      const cities = await loadCities(state).catch(()=>[]);
      ui.citySel.innerHTML = `<option value="">시/도</option>` + (cities||[]).map(c=>`<option>${c.city || c.name || c}</option>`).join('');
      ui.distSel.innerHTML = `<option value="">구/군</option>`;
    }
    async function refreshDistricts(){
      const dists = await loadDistricts(state).catch(()=>[]);
      ui.distSel.innerHTML = `<option value="">구/군</option>` + (dists||[]).map(d=>`<option>${d.district || d.name || d}</option>`).join('');
    }
    async function refreshSchools(){
      const rows = await loadSchools(state).catch(()=>[]);
      state.schoolsAll = rows;
      renderSchoolList(ui, rows, ui.search.value, state.stagedSet, state.pickedSet, onStageSchool);
      renderPicked(ui, state.pickedSet, state.pickedMap, state);  // ← state 추가
      ui.addBtn.disabled = (state.stagedSet.size === 0);
    }

    async function refreshEvents(){
      const [y,m] = state.curYM;
      const { first, last } = monthEdge(y, m);
      const start = fmt(first);
      const end   = fmt(last);
      const codes = [...state.pickedSet];
      const rows  = await loadEvents(codes, start, end).catch(()=>[]);
      const map = new Map();
      rows.forEach(r => {
        if (!map.has(r.date)) map.set(r.date, []);
        map.get(r.date).push(r);
      });
      state.events = map;

      renderCalendar(ui, y, m, map, (selDate, state)=>{
        const items = map.get(selDate) || [];
        renderDaily(ui, selDate, items, state); // ✅ state 전달
      }, state);

      // 초기 선택: 오늘 or 1일
      const today = new Date();
      const isSameMonth = (today.getFullYear()===y && (today.getMonth()+1)===m);
      const seedDate = isSameMonth ? fmt(today) : `${y}-${String(m).padStart(2,'0')}-01`;
      const cell = ui.cal.querySelector(`.sch-day[data-date="${seedDate}"]`) || ui.cal.querySelector('.sch-day[data-date]');
      if (cell) {
        cell.click();
        cell.scrollIntoView({ block:'nearest' });
      }
    }

// 저장
ui.saveBtn.addEventListener('click', async () => {
  const kr = toKrLevel(state.level);
  const order = getOrder(state);
  await api('/api/schedule/picks', {
    method:'PUT',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ level: kr, codes: order })
  });
  state.savedOrder = order.slice();
  updateSaveBtn();   // ← 교정
});

// 초기화(모달 오픈)
ui.resetBtn.addEventListener('click', () => {
  ui.modal?.setAttribute('aria-hidden','false');
});

// 모달 취소
ui.modalCancel.addEventListener('click', () => {
  ui.modal?.setAttribute('aria-hidden','true');
});
// 바깥 클릭 닫기
ui.modal.addEventListener('click', (e)=>{
  if (e.target.classList.contains('sch-modal-dim')) ui.modal.setAttribute('aria-hidden','true');
});

// 모달 확인 => 즉시 비우고 서버에도 반영(=저장)
ui.modalOk.addEventListener('click', async () => {
  const kr = toKrLevel(state.level);
  state.pickedSet.clear();
  state.pickedMap.clear();
  state.savedOrder = [];
  // UI 갱신
  recomputeColors(state);
  renderPicked(ui, state.pickedSet, state.pickedMap, state);
  renderSchoolList(ui, state.schoolsAll || [], ui.search.value, state.stagedSet, state.pickedSet, onStageSchool);
  updateSaveBtn();
  await api(`/api/schedule/picks?level=${encodeURIComponent(kr)}`, { method:'DELETE' });
  await refreshEvents();
  ui.modal?.setAttribute('aria-hidden','true');
});

ui.addBtn.addEventListener('click', async ()=>{
  // 선택(체크)된 것들을 순서대로 최대 15개까지 옮기기
  for (const code of state.stagedSet) {
    if (state.pickedSet.size >= MAX_SCHOOLS) break;
    state.pickedSet.add(code);
  }
  // 이름 매핑은 onStageSchool에서 이미 깔렸음
  state.stagedSet.clear();
  recomputeColors(state);

  renderPicked(ui, state.pickedSet, state.pickedMap, state);
  renderSchoolList(ui, state.schoolsAll || [], ui.search.value, state.stagedSet, state.pickedSet, onStageSchool);
  await refreshEvents();

  ui.addBtn.disabled = true;
  updateSaveBtn();      // 추가 후 저장버튼 상태 갱신
});


    async function loadSavedIntoState(){
      const levelKr = (state.level === 'middle') ? '중등' : '고등';
      const saved = await loadSaved(levelKr).catch(()=>({codes:[]}));
      const codes = Array.isArray(saved?.codes) ? saved.codes.slice(0, 15) : [];

      state.pickedSet = new Set(codes);
      state.savedOrder = [...codes];

      state.pickedMap.clear();
      for (const code of codes){
        const found = (state.schoolsAll || []).find(r => pickCode(r) === code);
        let name = found ? pickName(found) : (code.includes('|') ? code.split('|').pop() : code);
        state.pickedMap.set(code, name);
      }
      recomputeColors(state);
      renderPicked(ui, state.pickedSet, state.pickedMap, state);
      await refreshEvents();
      updateSaveBtn();
    }

    // 최초 로딩
    await refreshCities();
    await refreshSchools();
    recomputeColors(state);   // ✅
    await refreshEvents();
    await loadSavedIntoState();       // ✅ 추가
  };
})();
