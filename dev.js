// Local dev server: serves public/ and the same api/ handler Vercel runs, with vercel.json headers.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, normalize, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { POST as questions } from "./api/questions.js";
import { POST as access } from "./api/access.js";
import { POST as script } from "./api/script.js";
import { POST as review } from "./api/review.js";
import { POST as reverse } from "./api/reverse.js";
import { POST as research } from "./api/research.js";
import { POST as fit } from "./lib/fit-api.js";
import { POST as prep } from "./lib/prep-api.js";
import { POST as verify } from "./lib/verify-api.js";
import { POST as subscribe } from "./api/subscribe.js";
import { GET as unsubscribe } from "./api/unsubscribe.js";
import { POST as demand } from "./api/demand.js";
import { POST as tts } from "./api/tts.js";
import { POST as stt } from "./api/stt.js";
import { fakeClient, scriptFixture, reviewFixture, reverseFixture, asModelScript, researchMessage, fitFixture, prepFixture, verifyFixture } from "./test/fake-claude.js";

try { process.loadEnvFile(process.env.ENV_FILE ?? ".env"); } catch {}
const MOCK = !!process.env.MOCK_CLAUDE;
// Voice mocks (0 Gemini calls): TTS = the silence fixture repeated to ~3 s, sent as 6 SSE events 150 ms apart, so the
// UI can be caught mid-read; STT = the fixed transcript.
const silence = (await readFile("test/fixtures/tts-silence.wav")).subarray(44);
const halfSecond = Buffer.concat(Array(Math.ceil(24000 / silence.length)).fill(silence)).subarray(0, 24000); // 0.5 s s16le @ 24 kHz
const sseEvent = (pcm) => `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/L16;codec=pcm;rate=24000", data: pcm.toString("base64") } }] } }] })}\r\n\r\n`;
const mockTtsFetch = async () => new Response(new ReadableStream({
  async start(c) {
    for (let i = 0; i < 6; i++) {
      c.enqueue(new TextEncoder().encode(sseEvent(halfSecond)));
      await new Promise((r) => setTimeout(r, 150));
    }
    c.close();
  },
}), { headers: { "content-type": "text/event-stream" } });
const sttMock = (body) => ({ fetch: async () => new Response(body, { headers: { "content-type": "application/json" } }), apiKey: "mock" });
// ?kana=1 = the read-aloud check of the MOCK model script: a reading that passes with a little recogniser noise.
const sttReadDeps = sttMock(await readFile("test/fixtures/stt-read.json", "utf8"));
const mockDeps = { "/api/questions": { client: fakeClient() }, "/api/script": { client: fakeClient({ result: asModelScript(scriptFixture) }) }, "/api/review": { client: fakeClient({ result: reviewFixture }) }, "/api/reverse": { client: fakeClient({ result: reverseFixture }) }, "/api/research": { client: fakeClient({ turns: [researchMessage] }) }, "/api/fit": { client: fakeClient({ result: fitFixture }) }, "/api/prep": { client: fakeClient({ result: prepFixture }) }, "/api/verify": { client: fakeClient({ result: verifyFixture }) }, "/api/tts": { fetch: mockTtsFetch, apiKey: "mock" }, "/api/stt": sttMock(await readFile("test/fixtures/stt.json", "utf8")) };
const vercel = JSON.parse(await readFile("vercel.json", "utf8"));
const securityHeaders = Object.fromEntries(vercel.headers[0].headers.map((h) => [h.key, h.value]));
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm", ".css": "text/css", ".txt": "text/plain; charset=utf-8", ".svg": "image/svg+xml" };
const PORT = Number(process.env.PORT) || 3000;

createServer(async (req, res) => {
  for (const [k, v] of Object.entries(securityHeaders)) res.setHeader(k, v);
  const url = new URL(req.url, "http://localhost");
  try {
    const api = { "/api/questions": questions, "/api/access": access, "/api/script": script, "/api/review": review, "/api/reverse": reverse, "/api/research": research, "/api/fit": fit, "/api/prep": prep, "/api/verify": verify, "/api/subscribe": subscribe, "/api/demand": demand, "/api/tts": tts, "/api/stt": stt }[url.pathname];
    if (url.pathname === "/api/unsubscribe") {
      const r = await unsubscribe(new Request(url));
      res.writeHead(r.status, Object.fromEntries(r.headers));
      return res.end(Buffer.from(await r.arrayBuffer()));
    }
    if (api) {
      if (req.method !== "POST") return res.writeHead(405).end();
      const r = await api(new Request(url, { method: "POST", headers: req.headers, body: Readable.toWeb(req), duplex: "half" }), MOCK ? (url.pathname === "/api/stt" && url.searchParams.get("kana") === "1" ? sttReadDeps : mockDeps[url.pathname] ?? {}) : {});
      res.writeHead(r.status, Object.fromEntries(r.headers));
      return r.body ? await pipeline(Readable.fromWeb(r.body), res) : res.end(); // streamed, like Vercel (TTS audio)
    }
    const rel = normalize(url.pathname === "/" ? "/index.html" : url.pathname);
    if (rel.includes("..")) return res.writeHead(400).end();
    // MOCK: the answer 🎤 gets a fixed transcript instead of downloading the Whisper model (test/ui).
    const body = await readFile(MOCK && rel === "/stt-local.js" ? "test/fixtures/stt-local.mock.js" : join("public", rel));
    res.writeHead(200, { "content-type": TYPES[extname(rel)] || "application/octet-stream" }).end(body);
  } catch (e) {
    if (e.code === "ENOENT") return res.writeHead(404).end("not found");
    if (res.headersSent) return res.destroy(); // client left mid-stream (e.g. TTS stopped)
    console.error(e);
    res.writeHead(500).end();
  }
}).listen(PORT, () => console.log(`http://localhost:${PORT}${MOCK ? " (MOCK_CLAUDE: 고정 응답, Claude 호출 없음)" : ""}`));
