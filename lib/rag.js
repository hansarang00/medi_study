// 문서 로딩, 청크 분할, BM25 검색
// 한국어는 형태소 분석 없이도 잘 맞도록 "글자 2-gram(bigram)"을 검색 단위로 쓴다.
import fs from "node:fs";
import path from "node:path";

const CHUNK_SIZE = 700; // 청크 최대 글자 수(대략)
const CHUNK_OVERLAP = 150; // 이전 청크 끝부분을 다음 청크 앞에 겹쳐 넣는 길이

let cache = null;

// 질문 어미·의문사에서 나오는 bigram은 검색에 도움이 안 되므로 질문 쪽에서만 뺀다.
const QUERY_STOP = new Set([
  "무엇", "엇인", "인가", "가요", "나요", "있나", "니까", "습니", "합니", "입니",
  "세요", "어떻", "떻게", "는가", "에요", "예요", "알려", "려주", "주세", "설명",
  "명해", "해주", "뭔가", "인지", "대해", "해서",
]);

// 텍스트 → 검색 토큰(공백 제거 후 글자 bigram + 영문/숫자 단어)
export function tokenize(text) {
  const lower = text.toLowerCase();
  const tokens = [];
  const words = lower.match(/[a-z0-9]+/g) || [];
  tokens.push(...words);
  const hangul = lower.replace(/[^가-힣一-龥]+/g, " ").split(" ").filter(Boolean);
  for (const w of hangul) {
    if (w.length === 1) tokens.push(w);
    for (let i = 0; i < w.length - 1; i++) tokens.push(w.slice(i, i + 2));
  }
  return tokens;
}

// 문서를 장(chapter) 단위로 나눈 뒤, 장 안에서 문단을 모아 청크를 만든다.
function buildChunks(raw) {
  const lines = raw.replace(/\r/g, "").split("\n");

  // 목차 다음부터 "1. 제목", "2. 제목" … 순서대로 나오는 짧은 줄을 장 제목으로 본다.
  const chapters = [];
  let expected = 1;
  let current = { title: "머리말", lines: [] };
  for (const line of lines) {
    const t = line.trim();
    const m = t.match(/^(\d+)\.\s+(.+)$/);
    if (m && Number(m[1]) === expected && t.length <= 80) {
      chapters.push(current);
      current = { title: `${m[1]}. ${m[2].trim()}`, lines: [] };
      expected++;
      continue;
    }
    current.lines.push(t);
  }
  chapters.push(current);

  const chunks = [];
  for (const ch of chapters) {
    if (ch.title === "머리말") continue; // 제목·목차 부분은 검색 대상에서 제외
    const paragraphs = ch.lines.filter(Boolean);
    let buf = "";
    const flush = () => {
      if (buf.trim()) chunks.push({ chapter: ch.title, text: buf.trim() });
    };
    for (const p of splitLong(paragraphs)) {
      if (buf && buf.length + p.length + 1 > CHUNK_SIZE) {
        flush();
        buf = buf.slice(-CHUNK_OVERLAP) + "\n" + p;
      } else {
        buf = buf ? buf + "\n" + p : p;
      }
    }
    flush();
  }
  return chunks.map((c, i) => ({ id: i, ...c }));
}

// 너무 긴 문단은 문장 단위로 잘라 CHUNK_SIZE 안쪽으로 맞춘다.
function splitLong(paragraphs) {
  const out = [];
  for (const p of paragraphs) {
    if (p.length <= CHUNK_SIZE) {
      out.push(p);
      continue;
    }
    const sentences = p.match(/[^.!?。]+[.!?。]*["'”’)]*\s*/g) || [p];
    let buf = "";
    for (const s of sentences) {
      if (buf && buf.length + s.length > CHUNK_SIZE) {
        out.push(buf.trim());
        buf = "";
      }
      buf += s;
    }
    if (buf.trim()) out.push(buf.trim());
  }
  return out;
}

// BM25 색인 생성
function buildIndex(chunks) {
  const docs = chunks.map((c) => {
    const tf = new Map();
    const toks = tokenize(c.chapter + " " + c.text);
    for (const t of toks) tf.set(t, (tf.get(t) || 0) + 1);
    return { tf, len: toks.length };
  });
  const df = new Map();
  for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) || 0) + 1);
  const avgLen = docs.reduce((s, d) => s + d.len, 0) / Math.max(docs.length, 1);
  return { docs, df, avgLen, N: docs.length };
}

function load() {
  if (cache) return cache;
  const raw = fs.readFileSync(path.join(process.cwd(), "data", "document.txt"), "utf8");
  const chunks = buildChunks(raw);
  cache = { chunks, index: buildIndex(chunks) };
  return cache;
}

// 질문과 가장 관련 있는 청크 topK개를 돌려준다.
export function search(query, topK = 6) {
  const { chunks, index } = load();
  const k1 = 1.2;
  const b = 0.75;
  const qTokens = [...new Set(tokenize(query))].filter((t) => !QUERY_STOP.has(t));
  const scores = index.docs.map((d, i) => {
    let s = 0;
    for (const t of qTokens) {
      const f = d.tf.get(t);
      if (!f) continue;
      const n = index.df.get(t);
      const idf = Math.log(1 + (index.N - n + 0.5) / (n + 0.5));
      s += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / index.avgLen)));
    }
    return { i, s };
  });
  return scores
    .filter((x) => x.s > 0)
    .sort((a, b2) => b2.s - a.s)
    .slice(0, topK)
    .map((x) => ({ ...chunks[x.i], score: Number(x.s.toFixed(3)) }));
}

export function stats() {
  const { chunks } = load();
  return { chunks: chunks.length, chapters: new Set(chunks.map((c) => c.chapter)).size };
}
