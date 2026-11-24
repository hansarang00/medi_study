// 검색(Retrieval) 단계만 확인하는 스크립트. API 키 없이 실행된다.
import { search, stats } from "../lib/rag.js";

console.log("색인:", stats());
const queries = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["행복은 무엇에 달려 있나요?", "카르마란 무엇인가요?", "에고를 내려놓는 방법", "세도나"];
for (const q of queries) {
  console.log(`\n### ${q}`);
  for (const r of search(q, 3)) {
    console.log(`- (${r.score}) ${r.chapter} | ${r.text.slice(0, 80).replace(/\n/g, " ")}…`);
  }
}
