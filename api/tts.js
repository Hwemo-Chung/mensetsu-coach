import { loadPack, PACKS, TARGET_LANGS, maskInput } from "../lib/coach.js";
import { checkAccess, rateLimit } from "../lib/guard.js";
import { synthesize, TtsError, VOICES, MAX_TTS_CHARS } from "../lib/tts.js";

const json = (status, body) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

// One script sentence → speech. Same gate order as /api/script: rate limit → access → validation → provider.
// Only the model script sentence is sent (the client splits it); never the user's answer.
// 200 body = raw PCM s16le mono, streamed (read it with fetch().body.getReader() + Web Audio).
// x-sample-rate gives the rate; x-audio-bytes is set only when the whole sentence is known up front (cache hit).
export async function POST(request, deps = {}) {
  const ip = (request.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
  // One script is several sentences, and a learner replays them.
  if (!rateLimit(`tts:${ip}`, { limit: 60 })) return json(429, { code: "rate_limited" });
  if (!checkAccess(request.headers.get("x-access-code"))) return json(401, { code: "access_denied" });

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { code: "bad_request" });
  }
  const pack = body?.pack ?? "jp";
  if (!PACKS.includes(pack)) return json(400, { code: "pack_unsupported" });
  if (!VOICES.includes(body?.voice)) return json(400, { code: "bad_request" });
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return json(400, { code: "bad_request" });
  if (text.length > MAX_TTS_CHARS) return json(400, { code: "text_too_long", max: MAX_TTS_CHARS });
  const target = loadPack(pack).language_pair.target;
  if (!TARGET_LANGS[target].is(text)) return json(400, { code: "bad_request" }); // the client only sends script sentences
  // ［blanks］ are read with their inner text; dropping them would cut the sentence.
  const spoken = maskInput(text).replace(/［([^］]*)］/g, "$1");

  const apiKey = deps.apiKey ?? process.env.GEMINI_API_KEY;
  if (!apiKey) return json(503, { code: "tts_unavailable" }); // fail closed
  try {
    const audio = await synthesize({ text: spoken, voice: body.voice, fetch: deps.fetch, apiKey });
    const headers = { "content-type": `audio/L16;rate=${audio.rate};channels=1`, "x-sample-rate": String(audio.rate), "cache-control": "no-store" };
    if (Buffer.isBuffer(audio.body)) headers["x-audio-bytes"] = String(audio.body.length);
    return new Response(audio.body, { headers });
  } catch (e) {
    if (e instanceof TtsError) return json(e.status, { code: e.code });
    console.error("tts error:", e?.name);
    return json(502, { code: "generation_failed" });
  }
}
