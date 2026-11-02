// Local dev server: serves public/ and the same api/ handler Vercel runs, with vercel.json headers.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, normalize, join } from "node:path";
import { Readable } from "node:stream";
import { POST as questions } from "./api/questions.js";
import { POST as access } from "./api/access.js";
import { POST as script } from "./api/script.js";
import { fakeClient, scriptFixture } from "./test/fake-claude.js";

try { process.loadEnvFile(process.env.ENV_FILE ?? ".env"); } catch {}
const MOCK = !!process.env.MOCK_CLAUDE;
const mockDeps = { "/api/questions": { client: fakeClient() }, "/api/script": { client: fakeClient({ result: scriptFixture }) } };
const vercel = JSON.parse(await readFile("vercel.json", "utf8"));
const securityHeaders = Object.fromEntries(vercel.headers[0].headers.map((h) => [h.key, h.value]));
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".txt": "text/plain; charset=utf-8" };
const PORT = Number(process.env.PORT) || 3000;

createServer(async (req, res) => {
  for (const [k, v] of Object.entries(securityHeaders)) res.setHeader(k, v);
  const url = new URL(req.url, "http://localhost");
  try {
    const api = { "/api/questions": questions, "/api/access": access, "/api/script": script }[url.pathname];
    if (api) {
      if (req.method !== "POST") return res.writeHead(405).end();
      const r = await api(new Request(url, { method: "POST", headers: req.headers, body: Readable.toWeb(req), duplex: "half" }), MOCK ? mockDeps[url.pathname] ?? {} : {});
      res.writeHead(r.status, Object.fromEntries(r.headers));
      return res.end(Buffer.from(await r.arrayBuffer()));
    }
    const rel = normalize(url.pathname === "/" ? "/index.html" : url.pathname);
    if (rel.includes("..")) return res.writeHead(400).end();
    const body = await readFile(join("public", rel));
    res.writeHead(200, { "content-type": TYPES[extname(rel)] || "application/octet-stream" }).end(body);
  } catch (e) {
    if (e.code === "ENOENT") return res.writeHead(404).end("not found");
    console.error(e);
    res.writeHead(500).end();
  }
}).listen(PORT, () => console.log(`http://localhost:${PORT}${MOCK ? " (MOCK_CLAUDE: 고정 응답, Claude 호출 없음)" : ""}`));
