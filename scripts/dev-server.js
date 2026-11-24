// 로컬 테스트용 간단 서버 (Vercel 없이 실행)
// 사용법(PowerShell): $env:GEMINI_API_KEY="..."; $env:GEMINI_MODEL="gemini-3.5-flash-lite"; npm run dev
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import handler from "../api/chat.js";

// 어느 폴더에서 실행하든 저장소 루트를 기준으로 파일을 찾도록 맞춘다.
process.chdir(path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));

const PORT = Number(process.env.PORT || 3000);

http
  .createServer(async (req, res) => {
    if (req.url.startsWith("/api/chat")) {
      let raw = "";
      for await (const c of req) raw += c;
      req.body = raw ? JSON.parse(raw) : {};
      res.status = (code) => ((res.statusCode = code), res);
      res.json = (obj) => {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify(obj));
      };
      return handler(req, res);
    }
    if (req.url === "/" || req.url === "/index.html") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.end(fs.readFileSync(path.join(process.cwd(), "index.html")));
    }
    res.statusCode = 404;
    res.end("Not found");
  })
  .listen(PORT, () => console.log(`http://localhost:${PORT}`));
