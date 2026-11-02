import { loadPack, PACKS, EXPLAIN_LANGS, maskInput } from "../lib/coach.js";
import { checkAccess, rateLimit } from "../lib/guard.js";
import { transcribe, SttError, AUDIO_TYPES } from "../lib/stt.js";

const MAX_AUDIO_BYTES = 4 * 1024 * 1024; // 90 s of opus/aac is ~1 MB; under Vercel's 4.5 MB request body limit
const MAX_TEXT_CHARS = 2000; // same as the answer limit in /api/script
const json = (status, body) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

// Reads at most max bytes; null when the body is larger (content-length may lie or be absent).
async function readCapped(body, max) {
  if (!body) return new Uint8Array(0);
  const reader = body.getReader();
  const chunks = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.byteLength;
    if (n > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

// One recorded answer (raw audio body, e.g. MediaRecorder webm/opus or mp4/aac) → { text } for the answer box. Not auto-sent.
// Same gate order as /api/script: rate limit → access → validation → provider. pack/lang come from the query or x-pack/x-lang.
// Audio goes to Gemini unmasked (like PDF/image resumes); only the transcript is masked.
export async function POST(request, deps = {}) {
  const ip = (request.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
  if (!rateLimit(`stt:${ip}`, { limit: 20 })) return json(429, { code: "rate_limited" });
  if (!checkAccess(request.headers.get("x-access-code"))) return json(401, { code: "access_denied" });
  const apiKey = deps.apiKey ?? process.env.GEMINI_API_KEY;
  if (!apiKey) return json(503, { code: "stt_unavailable" }); // fail closed, before reading the audio

  const q = new URL(request.url).searchParams;
  const pack = q.get("pack") ?? request.headers.get("x-pack") ?? "jp";
  if (!PACKS.includes(pack)) return json(400, { code: "pack_unsupported" });
  const lang = q.get("lang") ?? request.headers.get("x-lang") ?? "ko";
  if (!Object.hasOwn(EXPLAIN_LANGS, lang)) return json(400, { code: "lang_unsupported" });
  const mime = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!AUDIO_TYPES.includes(mime)) return json(415, { code: "audio_unsupported" });
  if (Number(request.headers.get("content-length")) > MAX_AUDIO_BYTES) return json(413, { code: "audio_too_large" });
  const audio = await readCapped(request.body, MAX_AUDIO_BYTES);
  if (!audio) return json(413, { code: "audio_too_large" });
  if (!audio.length) return json(400, { code: "bad_request" });

  try {
    const { text } = await transcribe({ audio, mime, target: loadPack(pack).language_pair.target, lang, fetch: deps.fetch, apiKey });
    return json(200, { text: maskInput(text).slice(0, MAX_TEXT_CHARS) });
  } catch (e) {
    if (e instanceof SttError) return json(e.status, { code: e.code });
    console.error("stt error:", e?.name); // never log the transcript
    return json(502, { code: "generation_failed" });
  }
}
