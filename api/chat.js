// Vercel Serverless Function: POST /api/chat
// 환경변수: GEMINI_API_KEY (필수), GEMINI_MODEL (선택, 예: gemini-3.5-flash-lite)
import { search } from "../lib/rag.js";

const SYSTEM_PROMPT = `당신은 레스터 레븐슨의 책 《궁극의 자유를 위한 열쇠》(Keys To The Ultimate Freedom)의 내용에 기초해서만 답하는 도우미입니다.
규칙:
1. 아래 [참고 문서]에 있는 내용만 근거로 답하세요. 문서에 없는 내용은 지어내지 말고 "문서에서 해당 내용을 찾지 못했습니다"라고 말하세요.
2. 원문 문장을 그대로 옮기거나 따옴표로 인용하지 마세요. 문서 내용을 이해한 뒤, 처음 읽는 사람도 알아듣게 쉬운 일상어로 풀어서 설명하세요.
3. 책에만 나오는 개념(예: 참자아, 내려놓음, 카르마)이 나오면 짧게 뜻을 풀어 주세요.
4. 답변은 한국어로, 핵심을 한두 문장으로 먼저 말하고 필요한 만큼만 덧붙이세요. 필요하면 쉬운 예를 들어도 되지만, 예시가 문서 내용과 어긋나면 안 됩니다.
5. 어느 부분을 근거로 했는지 알 수 있도록 문단 끝에 [1], [2]처럼 참고 번호만 붙이세요. 문장마다 붙이지는 마세요.`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "POST만 지원합니다." });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
  if (!apiKey) {
    return res.status(500).json({ error: "서버에 GEMINI_API_KEY 환경변수가 설정되지 않았습니다." });
  }

  const body = typeof req.body === "string" ? safeJson(req.body) : req.body || {};
  const question = String(body.question || "").trim().slice(0, 1000);
  const history = Array.isArray(body.history) ? body.history.slice(-6) : [];
  if (!question) return res.status(400).json({ error: "질문을 입력해 주세요." });

  // 검색: 직전 사용자 질문도 함께 넣어 "그건 왜요?" 같은 후속 질문에도 문맥을 잡는다.
  const lastUser = [...history].reverse().find((h) => h.role === "user");
  const sources = search(lastUser ? `${question} ${lastUser.text}` : question, 6);

  const context = sources.length
    ? sources.map((s, i) => `[${i + 1}] (${s.chapter})\n${s.text}`).join("\n\n")
    : "(관련 내용을 찾지 못함)";

  const contents = [
    ...history
      .filter((h) => h && (h.role === "user" || h.role === "model") && h.text)
      .map((h) => ({ role: h.role, parts: [{ text: String(h.text).slice(0, 2000) }] })),
    {
      role: "user",
      parts: [{ text: `[참고 문서]\n${context}\n\n[질문]\n${question}` }],
    },
  ];

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents,
          generationConfig: { temperature: 0.3 },
        }),
      }
    );
    const data = await r.json();
    if (!r.ok) {
      const msg = data?.error?.message || `Gemini API 오류 (HTTP ${r.status})`;
      return res.status(502).json({ error: msg });
    }
    const answer =
      data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") ||
      "답변을 생성하지 못했습니다.";

    return res.status(200).json({
      answer,
      model,
      sources: sources.map((s, i) => ({
        n: i + 1,
        chapter: s.chapter,
        excerpt: s.text.slice(0, 200) + (s.text.length > 200 ? "…" : ""),
      })),
    });
  } catch (e) {
    return res.status(500).json({ error: `요청 처리 중 오류: ${e.message}` });
  }
}

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
