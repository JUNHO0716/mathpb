// services/knowledge.js — ‘public/*.html’에서 텍스트 추출 → 임베딩 인덱스 생성
import fs from "fs";
import path from "path";
import OpenAI from "openai";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 서버 구조: server.js가 있는 곳을 기준으로 /public에 정적 파일 존재
const PUBLIC_DIR = path.resolve(__dirname, "..", "public");
const DATA_DIR   = path.resolve(__dirname, "..", "data");
const INDEX_PATH = path.join(DATA_DIR, "knowledge.index.json");

// 인덱싱 대상 페이지(필요 시 추가/수정)
const DOCS = [
  { file: "index.html",        title: "대시보드",            url: "/" },
  { file: "upload.html",       title: "시험지 요청",         url: "/upload.html" },
  { file: "notice.html",       title: "공지사항",            url: "/notice.html" },
  { file: "profile.html",      title: "내 계정",             url: "/profile.html" },
  { file: "bookcase.html",     title: "내 책장",             url: "/bookcase.html" },
  { file: "problem_bank.html", title: "문제 은행",           url: "/problem_bank.html" },
  { file: "pricing.html",      title: "요금제",              url: "/pricing.html" },
  { file: "privacy.html",      title: "개인정보 처리방침",   url: "/privacy.html" },
  { file: "terms.html",        title: "이용약관",            url: "/terms.html" },
  { file: "refund.html",       title: "환불 정책",           url: "/refund.html" },
  { file: "cs.html",           title: "고객센터",            url: "/cs.html" },
];

// 아주 단순한 HTML→TEXT(의존성 없이)
function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// 텍스트 청킹
function chunk(text, max = 1200, overlap = 150) {
  const out = [];
  for (let i = 0; i < text.length; i += (max - overlap)) {
    out.push(text.slice(i, Math.min(i + max, text.length)));
  }
  return out.filter(Boolean);
}

async function embedMany(texts) {
  if (!texts.length) return [];
  const res = await openai.embeddings.create({
    model: process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small",
    input: texts,
  });
  return res.data.map(d => d.embedding);
}

export async function buildKnowledgeIndex(force = false) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  if (!force && fs.existsSync(INDEX_PATH)) {
    try { return JSON.parse(fs.readFileSync(INDEX_PATH, "utf-8")); }
    catch {}
  }

  const chunks = [];
  for (const doc of DOCS) {
    const p = path.join(PUBLIC_DIR, doc.file);
    if (!fs.existsSync(p)) continue;
    const raw  = fs.readFileSync(p, "utf-8");
    const text = htmlToText(raw).slice(0, 120_000);
    const parts   = chunk(text, 1200, 150);
    const vectors = await embedMany(parts);

    parts.forEach((txt, idx) => {
      chunks.push({
        id: `${doc.url}#${idx}`,
        slug: doc.url,
        text: txt,
        meta: { title: doc.title, url: doc.url },
        vector: vectors[idx],
      });
    });
  }

  const index = { builtAt: new Date().toISOString(), chunks };
  fs.writeFileSync(INDEX_PATH, JSON.stringify(index));
  return index;
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i]*b[i]; na += a[i]*a[i]; nb += b[i]*b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-10);
}

export async function retrieveTopK(index, query, k = 5) {
  if (!index?.chunks?.length || !query) return [];
  const qv = (await embedMany([query]))[0];
  const scored = index.chunks.map(ch => ({ ...ch, score: cosine(qv, ch.vector) }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}
