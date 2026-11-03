// Text-to-speech for one whole model script via the Gemini API, streamed as raw PCM (s16le mono).
// One request per script, not per sentence: the free tier allows ~3 TTS requests/min.
// Measured 11/03 (lite, 1 sentence): first audio chunk ~0.9 s, whole stream ~3.1 s for ~16 s of audio.
import { createHash } from "node:crypto";

export const PRIMARY_MODEL = "gemini-3.8-flash-lite-tts";
export const FALLBACK_MODEL = "gemini-3.8-flash-tts"; // only when the primary fails before its first audio chunk
export const VOICES = ["Kore", "Charon"];
export const MAX_TTS_CHARS = 600; // a 60-second script is ~300-350 ja chars
// No style instruction: measured 11/03 on the lite model, an in-text prefix (ja or "Say calmly…: ") is read aloud
// (16.1 s / 12.6 s vs 7.2 s for the sentence alone) and systemInstruction is rejected (400). Voice choice carries the tone.
const API = "https://generativelanguage.googleapis.com/v1beta/models";
const FIRST_CHUNK_MS = 15_000; // no audio by then → next model
const TOTAL_MS = 55_000; // 600 chars ≈ 140 s of audio ≈ 30 s at ~5x real time; under the 60 s function limit
const COOLDOWN_MS = 60_000; // free-tier quota is per minute: after a primary 429, retrying it only adds a wasted round trip
// shortcut: per-instance memory, so every Vercel instance pays its own first 429; share it (KV) or drop it on the paid tier.
let primaryBusyUntil = 0;

// shortcut: per-instance memory (lost on cold start, not shared across Vercel instances); move to Blob/KV if repeat plays get costly.
// Keyed on PRIMARY_MODEL as a version tag, so a script served by the fallback still hits the cache.
const cache = new Map();
const CACHE_MAX = 200;
const CACHE_MAX_BYTES = 50 * 1024 * 1024; // a 600-char script is ~6 MB of PCM (~8 scripts), so the entry cap alone is no memory bound
let cacheBytes = 0;
const keyOf = (voice, text) => createHash("sha256").update(`${PRIMARY_MODEL}|${voice}|${text}`).digest("hex");

export class TtsError extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

// SSE body → async iterator of { pcm: Buffer, rate } per audio part. Events are "data: {json}" separated by a blank line (CRLF on the wire).
async function* audioParts(body) {
  const dec = new TextDecoder();
  let buf = "";
  for await (const chunk of body) {
    buf += dec.decode(chunk, { stream: true }).replace(/\r/g, "");
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const line = buf.slice(0, i).split("\n").find((l) => l.startsWith("data:"));
      buf = buf.slice(i + 2);
      if (!line) continue;
      for (const p of JSON.parse(line.slice(5)).candidates?.[0]?.content?.parts ?? []) {
        if (p.inlineData?.data) yield { pcm: Buffer.from(p.inlineData.data, "base64"), rate: Number(/rate=(\d+)/.exec(p.inlineData.mimeType ?? "")?.[1]) || 24000 };
      }
    }
  }
}

// text is already validated and masked.
// Returns { body: Buffer, rate } on a cache hit, else { body: ReadableStream<Uint8Array>, rate } that starts with the first audio chunk.
// Throws TtsError("tts_busy" | "generation_failed") only before any audio was produced.
export async function synthesize({ text, voice, fetch = globalThis.fetch, apiKey, now = Date.now }) {
  const key = keyOf(voice, text);
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key); // LRU: re-insert as newest
    cache.set(key, hit);
    return hit;
  }
  const body = JSON.stringify({
    contents: [{ parts: [{ text }] }],
    generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
  });
  for (const model of now() < primaryBusyUntil ? [FALLBACK_MODEL] : [PRIMARY_MODEL, FALLBACK_MODEL]) {
    const ctl = new AbortController();
    const firstTimer = setTimeout(() => ctl.abort(), FIRST_CHUNK_MS);
    const signal = AbortSignal.any([ctl.signal, AbortSignal.timeout(TOTAL_MS)]);
    let res, parts, first;
    try {
      res = await fetch(`${API}/${model}:streamGenerateContent?alt=sse`, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": apiKey }, body, signal });
      if (res.ok) {
        parts = audioParts(res.body);
        first = (await parts.next()).value; // peek: the fallback is only possible before audio reaches the client
      }
    } catch (e) {
      console.error("tts fetch failed:", model, e?.name); // timeout/network/bad SSE → next model
      clearTimeout(firstTimer);
      continue;
    }
    clearTimeout(firstTimer);
    if (res.status === 429 || res.status >= 500) {
      console.error("tts busy:", model, res.status);
      if (res.status === 429 && model === PRIMARY_MODEL) primaryBusyUntil = now() + COOLDOWN_MS;
      continue;
    }
    if (!res.ok) {
      console.error("tts failed:", model, res.status); // never log the text
      throw new TtsError("generation_failed", 502);
    }
    if (!first) {
      console.error("tts no audio:", model);
      continue;
    }
    const got = [first.pcm];
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new Uint8Array(first.pcm));
      },
      async pull(c) {
        try {
          const { value, done } = await parts.next();
          if (done) {
            const entry = { body: Buffer.concat(got), rate: first.rate }; // only a complete script is cached
            cacheBytes += entry.body.length - (cache.get(key)?.body.length ?? 0); // two concurrent misses for one script
            cache.set(key, entry);
            while (cache.size > CACHE_MAX || cacheBytes > CACHE_MAX_BYTES) {
              const [oldest, old] = cache.entries().next().value;
              cache.delete(oldest);
              cacheBytes -= old.body.length;
            }
            return c.close();
          }
          got.push(value.pcm);
          c.enqueue(new Uint8Array(value.pcm));
        } catch (e) {
          console.error("tts stream broke:", model, e?.name);
          c.error(e);
        }
      },
      cancel() {
        ctl.abort(); // client left: stop paying for the rest
      },
    });
    return { body: stream, rate: first.rate };
  }
  throw new TtsError("tts_busy", 503);
}
