// Japanese narration for the demo video (build-video.mjs stills, record-video.mjs ③ captions): Gemini TTS (lib/tts.js)
// → WAV. Lines carry no personal data, so the free tier is OK (decision 11/03). Cached on disk by voice + text, so a
// rebuild costs no requests; new lines are spaced 21 s apart (free tier ≈ 3 TTS requests/min) and retried on 503.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const VOICE = "Kore";
// Played 1.22× (ffmpeg atempo, pitch kept): the user asked for a faster tempo (11/04).
export const TEMPO = 1.22;
const CACHE = join(tmpdir(), "mensetsu-narration");
let synth = null, last = 0;

// → { wav, sec } at TEMPO. Needs GEMINI_API_KEY (ENV_FILE, default .env) unless every line is already cached.
export async function narrate(text) {
  mkdirSync(CACHE, { recursive: true });
  const id = createHash("sha256").update(`${VOICE}|${text}`).digest("hex").slice(0, 16);
  const wav = join(CACHE, `${id}.wav`), meta = join(CACHE, `${id}.json`);
  if (existsSync(wav) && existsSync(meta)) return paced(wav, JSON.parse(readFileSync(meta, "utf8")).sec);
  if (!synth) {
    try { process.loadEnvFile(process.env.ENV_FILE ?? ".env"); } catch {}
    if (!process.env.GEMINI_API_KEY) throw new Error("narration needs GEMINI_API_KEY (ENV_FILE)");
    synth = (await import("../lib/tts.js")).synthesize;
  }
  const wait = last + 21_000 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  let a;
  for (let k = 0; ; k++) { // the free tier answers 503 tts_busy now and then: wait a minute, up to 3 tries
    try { a = await synth({ text, voice: VOICE, apiKey: process.env.GEMINI_API_KEY }); break; }
    catch (e) { if (k >= 2 || e?.status !== 503) throw e; console.log(`tts busy, retry in 60 s: ${text.slice(0, 12)}…`); await new Promise((r) => setTimeout(r, 60_000)); }
  }
  last = Date.now();
  const pcm = Buffer.isBuffer(a.body) ? a.body : Buffer.concat(await Array.fromAsync(a.body, (c) => Buffer.from(c)));
  const raw = join(CACHE, `${id}.pcm`);
  writeFileSync(raw, pcm);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "s16le", "-ar", String(a.rate), "-ac", "1", "-i", raw, wav]);
  const sec = pcm.length / 2 / a.rate;
  writeFileSync(meta, JSON.stringify({ sec, text }));
  return paced(wav, sec);
}

// The raw TTS stays cached at 1.0×; the played copy is made locally (no request) for the current TEMPO.
function paced(wav, sec) {
  const out = wav.replace(/\.wav$/, `-x${TEMPO}.wav`);
  if (!existsSync(out)) execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", wav, "-af", `atempo=${TEMPO}`, out]);
  return { wav: out, sec: sec / TEMPO };
}
