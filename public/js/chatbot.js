/* ================================
   Chatbot (standalone module)
   - DOMContentLoaded 후 자동 초기화
   - 로컬스토리지: 사용자별 기록 분리(window.__USER_ID 사용)
================================== */
(function () {
  // --- 엘리먼트 참조
const chatButton  = document.getElementById("chatFab");
const chatbotBox  = document.getElementById("chatbotBox");
const closeBtn    = document.getElementById("closeChatbot");
const chatInput   = document.getElementById("chatInput");
const chatForm    = document.getElementById("chatbotForm");
const messages    = document.getElementById("chatbotMessages");
const suggestBtn  = document.getElementById("chat-suggest-btn");
const suggPanel   = document.getElementById("suggestion-panel");
const suggClose   = document.getElementById("close-suggest-panel");

function openChat() {
  chatbotBox.classList.add("open");
  chatButton?.setAttribute("aria-expanded", "true");
  setTimeout(() => chatInput?.focus(), 120);

  const userKey = window.__USER_ID || document.body?.dataset?.user || getGuestId();
  const SESSION_FLAG = `mathpb_chat_session_started:${userKey}`;
  if (!sessionStorage.getItem(SESSION_FLAG)) {
    startNewThread();
    sessionStorage.setItem(SESSION_FLAG, '1');
  }
  renderHistoryOnce();
}

function closeChat() {
  chatbotBox.classList.remove("open");
  if (chatButton) chatButton.setAttribute("aria-expanded", "false");
}


  chatButton?.setAttribute("aria-controls", "chatbotBox");
  chatButton?.setAttribute("aria-expanded", "false");
  chatButton?.addEventListener("click", () => {
    if (chatbotBox.classList.contains("open")) closeChat();
    else openChat();
  });
  closeBtn?.addEventListener("click", closeChat);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && chatbotBox.classList.contains("open")) closeChat();
  });

  // --- 메시지 추가(렌더)
  function addMessage(role, html) {
    const wrap = document.createElement("div");
    wrap.className = role === "user" ? "user-message" : "bot-message";
    wrap.innerHTML = role === "user"
      ? `<div class="bubble">${html}</div>`
      : `<div class="avatar"></div><div class="bubble">${html}</div>`;
    messages.appendChild(wrap);
    maybeScrollToBottom();
  }

  // --- 자동 스크롤(사용자가 위로 올려볼 땐 유지)
  let _autoStickToBottom = true;
  function isNearBottom(el) {
    return el.scrollHeight - el.scrollTop - el.clientHeight < 20;
  }
  function maybeScrollToBottom() {
    if (_autoStickToBottom) messages.scrollTop = messages.scrollHeight;
  }
  messages.addEventListener('scroll', () => {
    _autoStickToBottom = isNearBottom(messages);
  });

  // --- 입력창 자동 높이(최대 3~4줄)
  function autoResize() {
    chatInput.style.height = 'auto';
    const cs = window.getComputedStyle(chatInput);
    const line = parseFloat(cs.lineHeight) || 20;
    const pad  = (parseFloat(cs.paddingTop)||0) + (parseFloat(cs.paddingBottom)||0);
    const bor  = (parseFloat(cs.borderTopWidth)||0) + (parseFloat(cs.borderBottomWidth)||0);
    const maxH = line * 3 + pad + bor;
    const need = chatInput.scrollHeight;
    chatInput.style.height = Math.min(need, maxH) + 'px';
    chatInput.style.overflowY = need > maxH ? 'auto' : 'hidden';
  }
  chatInput.addEventListener('input', () => {
    autoResize();
    chatForm.classList.toggle('has-text', chatInput.value.trim().length > 0);
  });
  requestAnimationFrame(autoResize);

  // --- 타자 효과 유틸(HTML 태그는 통째로, 텍스트는 한 글자씩)
  function splitHTMLTokens(html) {
    const tokens = []; const re = /(<[^>]+>)/g; let last = 0, m;
    while ((m = re.exec(html)) !== null) {
      if (m.index > last) tokens.push({type:'text', value:html.slice(last, m.index)});
      tokens.push({type:'tag', value:m[1]}); last = re.lastIndex;
    }
    if (last < html.length) tokens.push({type:'text', value:html.slice(last)});
    return tokens;
  }
  function typeHTMLInto(el, html, speed=18) {
    const tokens = splitHTMLTokens(html); let i=0, j=0, cur='';
    (function step() {
      if (i >= tokens.length) return;
      const t = tokens[i];
      if (t.type === 'tag') {
        el.insertAdjacentHTML('beforeend', t.value);
        i++; j=0; maybeScrollToBottom(); requestAnimationFrame(step);
      } else {
        cur = t.value;
        if (j < cur.length) {
          el.insertAdjacentText('beforeend', cur[j++]);
          maybeScrollToBottom(); setTimeout(step, speed);
        } else { i++; j=0; requestAnimationFrame(step); }
      }
    })();
  }

  // --- 로딩 말풍선 (점 3개)
  let _typingContainer=null, _typingBubble=null;
  function showBotTyping() {
    if (_typingContainer && document.body.contains(_typingContainer)) return;
    const div = document.createElement('div');
    div.className = 'bot-message typing';
    div.innerHTML = `<div class="avatar"></div>
      <div class="bubble typing"><span class="dots"><i></i><i></i><i></i></span></div>`;
    messages.appendChild(div);
    _typingContainer = div;
    _typingBubble = div.querySelector('.bubble.typing');
    maybeScrollToBottom();
  }
  function finishBotTypingWith(text, speed=18) {
    const html = (text || '').replace(/\n/g,'<br>');
    if (_typingContainer && _typingBubble) {
      _typingContainer.classList.remove('typing');
      _typingBubble.classList.remove('typing');
      _typingBubble.innerHTML = '';
      typeHTMLInto(_typingBubble, html, speed);
      _typingContainer = null; _typingBubble = null;
    } else {
      const div = document.createElement('div');
      div.className = 'bot-message';
      div.innerHTML = `<div class="avatar"></div><div class="bubble"></div>`;
      messages.appendChild(div);
      typeHTMLInto(div.querySelector('.bubble'), html, speed);
      maybeScrollToBottom();
    }
  }
  function cancelBotTyping() {
    if (_typingContainer) { _typingContainer.remove(); _typingContainer=null; _typingBubble=null; }
  }

  // --- 스레드 저장소 (사용자별)
  const THREADS_BASE = 'mathpb_threads_v1';

  function getGuestId() {
    try {
      let gid = localStorage.getItem('mathpb_guest_id');
      if (!gid) { gid = 'g_' + Math.random().toString(36).slice(2,10);
        localStorage.setItem('mathpb_guest_id', gid); }
      return gid;
    } catch { return 'guest'; }
  }

  function keys() {
    const user = window.__USER_ID || document.body?.dataset?.user || getGuestId();
    return {
      LIST:   `${THREADS_BASE}:${user}:list`,
      ACTIVE: `${THREADS_BASE}:${user}:active`,
    };
  }
  function loadAllThreads() {
    try {
      const raw = localStorage.getItem(keys().LIST);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  }
  function saveAllThreads(list) {
    try { localStorage.setItem(keys().LIST, JSON.stringify(list.slice(-200))); } catch {}
  }
  function getActiveThreadId() { return localStorage.getItem(keys().ACTIVE); }
  function setActiveThreadId(id) {
    localStorage.setItem(keys().ACTIVE, id || '');
  }
  function getActiveThread() {
    const id = getActiveThreadId();
    return loadAllThreads().find(t => t.id === id) || null;
  }
  function upsertThread(thread) {
    const list = loadAllThreads();
    const i = list.findIndex(t => t.id === thread.id);
    if (i >= 0) list[i] = thread; else list.push(thread);
    saveAllThreads(list);
  }
    function startNewThread() {
      // ▶ 위젯에서도 초기엔 draft=true로 생성
      const t = { id: 'thread_' + Date.now(), title: '새 대화', created: Date.now(), messages: [], draft: true };
      upsertThread(t);
      setActiveThreadId(t.id);
      return t;
    }

  let _historyRendered = false;

function renderHistoryOnce() {
  if (_historyRendered) return;

  let t = getActiveThread() || startNewThread();
  if (t.messages.length === 0) {
    t.messages.push({ role: 'bot', content: '안녕하세요 👋 MathPB 도우미입니다.<br>무엇을 도와드릴까요?', time: Date.now() });
    upsertThread(t);
  }

  t.messages.forEach(m => addMessage(m.role, m.content));
  _historyRendered = true;
  maybeScrollToBottom();
}



  // --- 추천 질문 패널
  suggestBtn?.addEventListener('click', () => suggPanel?.classList.add('show'));
  suggClose?.addEventListener('click', () => suggPanel?.classList.remove('show'));
  document.querySelectorAll('.suggest-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const text = btn.textContent;
      addMessage('user', text);
      sendChatMessage(text);
      suggPanel?.classList.remove('show');
    });
  });

  // --- 전송 핸들러
  chatForm.addEventListener('submit', (e) => { e.preventDefault(); sendChatMessage(); });
  chatInput.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
  });

async function sendChatMessage(preText=null) {
  const text = preText || chatInput.value.trim();
  if (!text) return;

  // UI 먼저
  if (!preText) {
    addMessage('user', text);
    chatInput.value = ''; chatForm.classList.remove('has-text'); autoResize();
  }

  // 활성 스레드에 저장
  let t = getActiveThread() || startNewThread();
  if (t.title === '새 대화') {
    t.title = text.split('\n')[0].slice(0, 30) || '새 대화';
  }
  t.messages.push({ role:'user', content:text, time:Date.now() });
  upsertThread(t);

  showBotTyping();
  try {
    const res = await fetch('/api/chat', {
      method:'POST', credentials:'include',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ messages:[{ role:'user', content:text }] })
    });

    const reader = res.body?.getReader?.();
    let botText = '';
    if (reader) {
      const decoder = new TextDecoder('utf-8');
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream:true });
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try { const json = JSON.parse(data); botText += (json.output_text || ''); } catch {}
        }
      }
    }

    if (botText.startsWith('[SEARCH_RESULTS]')) {
      const jsonString = botText.replace('[SEARCH_RESULTS]','').replace('[/SEARCH_RESULTS]','');
      cancelBotTyping();
      try {
        const files = JSON.parse(jsonString);
        addFileResultsMessage(files);
        t = getActiveThread() || t;
        t.messages.push({ role:'bot', content: botText, time:Date.now() });
        t.draft = false; // ▶ 동일하게 draft 해제
        upsertThread(t);
        return;
      } catch {
        finishBotTypingWith("검색 결과를 처리하는 중 오류가 발생했습니다.");
      }
    } else {
      const out = (botText && botText.trim()) ? botText : '(응답이 비어있습니다)';
      finishBotTypingWith(out);
    }

    t = getActiveThread() || t;
    t.messages.push({ role:'bot', content: botText || '(응답이 비어있습니다)', time:Date.now() });
    // ▶ 답변을 받았으니 draft 해제
    t.draft = false;
    upsertThread(t);

  } catch (err) {
    const msg='(서버 연결에 실패했습니다. 잠시 후 다시 시도하세요)';
    finishBotTypingWith(msg);
    t = getActiveThread() || t;
    t.messages.push({ role:'bot', content: msg, time:Date.now() });
    t.draft = false; // ▶ 오류여도 답변 수신으로 간주
    upsertThread(t);
    console.error(err);
  }
}


  // --- 파일 리스트 카드 메시지
  function addFileResultsMessage(files) {
    const outer = document.createElement("div");
    outer.className = "bot-message";
    const box = document.createElement("div");
    box.className = "file-list-container";
    box.innerHTML = `
      <p class="file-list-intro">요청하신 조건으로 <strong>${files.length}개의 시험지</strong>를 찾았어요.</p>
    `;
    files.forEach(f => {
      const pdf = f.files?.pdf ? `
        <a href="/api/download/${f.id}?type=pdf" class="download-btn pdf" aria-label="PDF 다운로드" download>
          <img src="image_download/pdf_download.png" alt="PDF">
        </a>` : '';
      const hwp = f.files?.hwp ? `
        <a href="/api/download/${f.id}?type=hwp" class="download-btn hwp" aria-label="HWP 다운로드" download>
          <img src="image_download/hwp_download.png" alt="HWP">
        </a>` : '';
      const row = document.createElement('div');
      row.className = 'file-item';
      row.innerHTML = `
        <span class="file-name">${f.name}</span>
        <div class="download-actions">${pdf}${hwp}</div>
      `;
      box.appendChild(row);
    });
    outer.innerHTML = `<div class="avatar"></div>`;
    outer.appendChild(box);
    messages.appendChild(outer);
    maybeScrollToBottom();
  }

    window.addEventListener('storage', (e) => {
    const k = e.key || '';
    if (k.startsWith(THREADS_BASE)) {
      if (chatbotBox.classList.contains("open")) {
        messages.innerHTML = '';
        _historyRendered = false;
        renderHistoryOnce();
      }
    }
  });

})();
