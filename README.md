# medi_study

레스터 레븐슨의 《궁극의 자유를 위한 열쇠》(Keys To The Ultimate Freedom) 내용에 **기초해서만** 답하는 RAG 챗봇입니다.
Gemini API를 쓰고 Vercel에 배포합니다.

## 동작 방식 (RAG)

1. `data/document.txt` — 원본 PDF에서 뽑은 전체 텍스트(46장).
2. `lib/rag.js` — 장(chapter) 단위로 나눈 뒤 약 700자 크기의 청크로 쪼개고, 한글 글자 2-gram 기반 **BM25** 검색 색인을 만듭니다. (별도 임베딩 API 호출이 없어 빠르고 비용이 없습니다.)
3. `api/chat.js` — 질문과 관련된 청크 6개를 찾아 Gemini에 "이 문서 안에서만 답하라"는 지시와 함께 보냅니다. 답변과 함께 참고한 구절 목록을 돌려줍니다.
4. `index.html` — 채팅 화면. 답변 아래에서 근거가 된 구절을 펼쳐 볼 수 있습니다.

## Vercel 환경변수

| 이름 | 필수 | 예시 |
|---|---|---|
| `GEMINI_API_KEY` | 예 | Google AI Studio에서 발급한 키 |
| `GEMINI_MODEL` | 아니오 (기본값 `gemini-2.5-flash`) | `gemini-2.5-flash` |

Vercel 프로젝트 → Settings → Environment Variables 에 넣고 다시 배포(Redeploy)하면 적용됩니다.
Framework Preset은 **Other**, 빌드 명령은 비워 두면 됩니다.

## 로컬 실행

```powershell
$env:GEMINI_API_KEY="발급받은키"; $env:GEMINI_MODEL="gemini-2.5-flash"; npm run dev
```

브라우저에서 http://localhost:3000 을 엽니다.

검색 단계만 확인(API 키 불필요):

```powershell
npm run test:search -- "카르마란 무엇인가요?"
```
