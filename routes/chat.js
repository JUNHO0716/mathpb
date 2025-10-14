// routes/chat.js  — 홈페이지 학습(RAG) + 동적 DB 스냅샷 통합
import express from "express";
import OpenAI from "openai";
import db from "../config/database.js";
import { buildKnowledgeIndex, retrieveTopK } from "../services/knowledge.js";

const router = express.Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 인메모리 캐시(선행 빌드/중복 방지)
let KNOWLEDGE = null;
let BUILDING = false;
async function ensureKnowledge() {
  if (KNOWLEDGE || BUILDING) return KNOWLEDGE;
  BUILDING = true;
  try {
    KNOWLEDGE = await buildKnowledgeIndex();
    return KNOWLEDGE;
  } finally {
    BUILDING = false;
  }
}

// 동적 데이터(공지/업로드/내 계정) 스냅샷
async function buildDynamicFacts(userId, userQuery = "") {
  const facts = [];

  // 최근 공지 5개
  try {
    const [rows] = await db.query(
      "SELECT id, title, date, category FROM notices ORDER BY id DESC LIMIT 5"
    );
    if (rows?.length) {
      const lines = rows.map((n, i) =>
        `${i + 1}. [${n.category}] ${n.title} — ${new Date(n.date).toLocaleDateString('ko-KR')}`
      ).join("\n");
      facts.push("[최근 공지 5개]\n" + lines);
    }
  } catch {}

  // 자료실 최신 업로드 5개
  try {
    const [files] = await db.query(
      "SELECT id, title, grade, year, semester, created_at FROM files ORDER BY id DESC LIMIT 5"
    );
    if (files?.length) {
      const lines = files.map((f, i) =>
        `${i + 1}. ${f.title} (${f.grade ?? '-'}학년, ${f.year ?? ''}${f.semester ? ' / ' + f.semester : ''}) — 업로드: ${new Date(f.created_at).toLocaleDateString('ko-KR')}`
      ).join("\n");
      facts.push("[자료실 최신 업로드]\n" + lines);
    }
  } catch {}

  // 내 계정 요약(로그인한 경우)
  try {
    if (userId) {
      const [[u]] = await db.query(
        "SELECT id, name, email, is_subscribed, avatarUrl, tier FROM users WHERE id=?",
        [userId]
      );
      if (u) {
        facts.push(
          `[내 계정]\n이름: ${u.name}\n아이디: ${(u.email || '').split('@')[0] || u.id}\n구독: ${u.is_subscribed ? '활성' : '미구독'}\n등급: ${u.tier || 'Free'}\n프로필 이미지: ${u.avatarUrl ? '설정됨' : '기본'}`
        );
      }
    }
  } catch {}

  // 키워드 기반 힌트(경로 안내)
  if (/업로드|시험지 요청|파일 올리|자료실/i.test(userQuery)) {
    facts.push("[업로드 위치]\n좌측 메뉴 ‘시험지 요청(Upload)’ → 파일 추가 → 제출.");
  }
  if (/공지|새 공지|업데|패치|수정사항/i.test(userQuery)) {
    facts.push("[공지 위치]\n좌측 메뉴 ‘공지사항(Notice)’에서 최신순 확인.");
  }
  if (/프로필|계정|아바타|구독|요금/i.test(userQuery)) {
    facts.push("[프로필 위치]\n좌측 메뉴 ‘내 계정(Profile)’에서 아바타/비밀번호/구독 상태/사업자 정보 관리.");
  }

  return facts.join("\n\n");
}

function systemPrompt() {
  return `당신은 ‘매쓰비(MathPB)’ 사이트 전용 안내 챗봇입니다.
원칙:
- 모르면 추측하지 말고 확인 경로를 안내합니다.
- 메뉴명/버튼명을 그대로 사용합니다. (예: 좌측 사이드바 > 공지사항)
- 다운로드/열람 권한(구독/관리자)이 필요한 경우 고지합니다.
- 답변 끝에 관련 페이지 경로를 ‘참조’ 섹션으로 간단히 적습니다.
- 수치/날짜/금액은 한국어 표기 사용.`;
}

// SSE 헬퍼
function writeChunk(res, text) {
  res.write(`data: ${JSON.stringify({ output_text: text })}\n\n`);
}

// --- DB 파일 검색 함수 ---
async function searchFiles(query) {
  if (!query) return [];
  try {
    // 1. 검색어에서 불필요한 단어를 제거하고, 공백을 기준으로 키워드를 추출합니다.
    const keywords = query
      .replace(/시험지|파일|찾아줘|찾아|검색|기출|자료|문제/g, '')
      .trim().split(' ').filter(Boolean);

    if (keywords.length === 0) return [];

    // 2. SQL의 CONCAT_WS 함수를 사용해 여러 컬럼을 하나의 '검색용 문자열'로 합칩니다.
    //    이렇게 하면 '박문중 2학년 1학기 기말' 같은 문장을 더 자연스럽게 찾을 수 있습니다.
    const searchTarget = `CONCAT_WS(' ', title, school, grade, year, semester, subject)`;

    // 3. 각 키워드가 '검색용 문자열' 안에 모두 포함되는지(AND) 확인하는 조건을 만듭니다.
    const conditions = keywords.map(() => `${searchTarget} LIKE ?`).join(' AND ');
    const params = keywords.map(k => `%${k}%`);

    const sql = `
      SELECT id, title, school, grade, year, semester, subject, pdf_filename, hwp_filename
      FROM files WHERE ${conditions} ORDER BY year DESC, id DESC LIMIT 10
    `;

    const [rows] = await db.query(sql, params);

    // 4. 프론트엔드로 보낼 데이터 형식으로 가공합니다.
    return rows.map(file => ({
      id: file.id,
      name: `${file.year || ''} ${file.school || file.title || ''} ${file.grade || ''} ${file.semester || ''} ${file.subject || ''}`.replace(/\s+/g, ' ').trim(),
      files: {
        pdf: !!file.pdf_filename,
        hwp: !!file.hwp_filename
      }
    }));
  } catch (error) {
    console.error("File search error:", error);
    return [];
  }
}

// 메인 엔드포인트(스트리밍)
router.post("/", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");

  try {
    const user = req.session?.user || null;
    const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const userMsg = messages.at(-1)?.content?.slice(0, 4000) || "";

    // 1. 사용자 구독 상태 확인
    let isSubscribed = false;
    if (user?.id) {
      const [[dbUser]] = await db.query("SELECT is_subscribed, role FROM users WHERE id = ?", [user.id]);
      if (dbUser && (dbUser.is_subscribed === 1 || dbUser.role === 'admin')) {
        isSubscribed = true;
      }
    }

    // 2. 검색 요청인지 확인
    const isSearchQuery = /시험지|파일|찾아|검색|기출|자료|학년|학기|중학교|고등학교|중|고|\d{4}/.test(userMsg);

    if (isSearchQuery) {
      if (isSubscribed) {
        // 3. 구독자인 경우: 구체적인 검색어와 일반적인 요청을 구분
        const specificKeywords = userMsg.replace(/시험지|파일|찾아줘|찾아|검색|기출|자료|문제|좀|해줘/g, '').trim();

        if (userMsg.trim() === '시험지 찾기' || specificKeywords.length < 2) {
          // 3-1. "시험지 찾아줘" 같은 일반적인 요청일 경우 -> 검색 방법 안내
          const instructionsMsg = `시험지를 찾아 드릴게요! 🧐\n\n**학교 이름, 연도, 학년, 과목** 등을 조합해서 입력해 주세요.\n\n**이렇게 검색해 보세요:**\n• \`2024 박문중\`\n• \`박문중 2학년 1학기 기말\`\n• \`2023 고1 수학\``;
          writeChunk(res, instructionsMsg);
        } else {
          // 3-2. "박문중 2학년" 같은 구체적인 검색어일 경우 -> DB 검색 실행
          const files = await searchFiles(specificKeywords);
          if (files.length > 0) {
            // 결과가 있으면 파일 목록 전송
            const resultsText = `[SEARCH_RESULTS]${JSON.stringify(files)}[/SEARCH_RESULTS]`;
            writeChunk(res, resultsText);
          } else {
            // 결과가 없으면, 입력한 검색어를 포함하여 "결과 없음"을 명확히 안내
            const noResultsMsg = `죄송하지만, '**${specificKeywords}**'에 대한 시험지를 찾을 수 없었어요. 오타가 없는지 확인하시거나 다른 키워드로 검색해 보세요.`;
            writeChunk(res, noResultsMsg);
          }
        }
      } else {
        // 4. 비구독자인 경우 -> 구독 안내
        const subscribeMsg = `실시간 시험지 검색은 구독 회원 전용 기능이에요. 구독 후 더 편리하게 자료를 찾아보세요! 😊\n\n참조: /pricing.html`;
        writeChunk(res, subscribeMsg);
      }
      
      // 검색 관련 처리가 끝나면 AI 호출 없이 응답 종료
      res.write("data: [DONE]\n\n");
      return res.end();
    }

    // 5. 검색어가 아니면 기존 AI 로직으로 답변
    const knowledge = await ensureKnowledge();
    const retrieved = await retrieveTopK(knowledge, userMsg, 5);
    const ctx = retrieved.map((r, i) => `[#${i + 1}] ${r.meta.title} — ${r.meta.url}\n${r.text}`).join("\n\n");
    const dynamicFacts = await buildDynamicFacts(user?.id, userMsg);
    const chatMessages = [
      { role: "system", content: systemPrompt() },
      { role: "system", content: `컨텍스트(검색 TopK)\n\n${ctx}` },
      dynamicFacts ? { role: "system", content: `동적 데이터\n\n${dynamicFacts}` } : null,
      { role: "user", content: userMsg }
    ].filter(Boolean);

    const stream = await openai.chat.completions.create({
      model: process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini",
      temperature: 0.2, messages: chatMessages, stream: true,
    });

    let sentOnce = false;
    for await (const part of stream) {
      const delta = part.choices?.[0]?.delta?.content || "";
      if (!delta) continue;
      writeChunk(res, delta);
      sentOnce = true;
    }
    if (!sentOnce) writeChunk(res, "(응답이 비어있습니다)");

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    console.error("Chatbot error:", err);
    writeChunk(res, "⚠️ 서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
    res.write("data: [DONE]\n\n");
    res.end();
  }
});

// (선택) 관리자: 지식 재색인
router.post("/reindex", async (req, res) => {
  try {
    KNOWLEDGE = await buildKnowledgeIndex(true);
    return res.json({ ok: true, chunks: KNOWLEDGE?.chunks?.length || 0 });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message });
  }
});

export default router;
