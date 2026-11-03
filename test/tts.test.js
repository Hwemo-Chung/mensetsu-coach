// /api/tts: offline, fake fetch stands in for the Gemini API (no network, no tokens).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { POST } from "../api/tts.js";
import { sign } from "../lib/guard.js";
import { PRIMARY_MODEL, FALLBACK_MODEL } from "../lib/tts.js";
import { highlightLength, weight, totalSeconds, estimateSeconds, fromBoundary } from "../public/tts-timing.js";

process.env.ACCESS_CODE = "test-code";
let ipSeq = 0;
// Unique IP per request: rate-limit memory is module-global and shared with other test files.
// Like the real client, a body carries the signature /api/script returned for that text (security review 11/03);
// a test that sets `sig` itself (null, forged) keeps it.
const call = (body, { ip = `10.9.0.${++ipSeq}`, code = "test-code", raw } = {}) =>
  new Request("http://x/api/tts", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip, ...(code ? { "x-access-code": code } : {}) }, body: raw ?? JSON.stringify(body && typeof body.text === "string" && !("sig" in body) ? { ...body, sig: sign(body.text) } : body) });

const PCM = Buffer.from(Array.from({ length: 960 }, (_, i) => i % 256));
// Gemini SSE: CRLF-separated "data:" events, audio split over several events, then a text-only STOP event.
const sse = (mimeType = "audio/l16; rate=24000; channels=1", pcm = PCM) => {
  const ev = (o) => `data: ${JSON.stringify(o)}\r\n\r\n`;
  const part = (b) => ev({ candidates: [{ content: { parts: [{ inlineData: { mimeType, data: b.toString("base64") } }] } }] });
  const text = part(pcm.subarray(0, 480)) + part(pcm.subarray(480)) + ev({ candidates: [{ content: { parts: [{ text: "" }] }, finishReason: "STOP" }] });
  const bytes = new TextEncoder().encode(text);
  // Deliver in 7-byte network reads so events straddle chunk boundaries.
  return new Response(new ReadableStream({ start(c) { for (let i = 0; i < bytes.length; i += 7) c.enqueue(bytes.slice(i, i + 7)); c.close(); } }), { headers: { "content-type": "text/event-stream" } });
};
// statuses: one HTTP status per call (200 = audio stream, "text" = 200 without audio); records every request.
function fakeFetch(statuses = [200], mime) {
  const calls = [];
  const f = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    const s = statuses[Math.min(calls.length - 1, statuses.length - 1)];
    if (s === "text") return new Response(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: "I cannot" }] }, finishReason: "STOP" }] })}\r\n\r\n`);
    return s === 200 ? sse(mime) : Response.json({ error: { code: s } }, { status: s });
  };
  f.calls = calls;
  return f;
}
const bytesOf = async (r) => Buffer.from(await r.arrayBuffer());
let textSeq = 0;
const uniq = () => `${++textSeq}件の改善を担当しました。`; // distinct text per test so the instance cache never leaks between tests
// One monotonic fake clock for the whole file; by default every read jumps past the 60 s primary cooldown,
// so a 429 in one test never makes the next test skip the primary model.
let clock = 1e12;
const deps = (f, now = () => (clock += 61_000)) => ({ fetch: f, apiKey: "k", now });

test("rate limit is checked before the access code (429 before 401)", async () => {
  const ip = "10.8.0.1";
  for (let i = 0; i < 60; i++) assert.equal((await POST(call({}, { ip, code: null }), deps(fakeFetch()))).status, 401);
  const r = await POST(call({}, { ip, code: null }), deps(fakeFetch()));
  assert.equal(r.status, 429);
  assert.deepEqual(await r.json(), { code: "rate_limited" });
});

test("bad JSON, voice, pack, empty text → 400 with a code", async () => {
  const f = fakeFetch();
  const cases = [
    [{ raw: "{" }, "bad_request"],
    [{ body: { text: "はい。", voice: "Puck", pack: "jp" } }, "bad_request"],
    [{ body: { text: "はい。", voice: "Kore", pack: "us" } }, "pack_unsupported"],
    [{ body: { text: "  ", voice: "Kore", pack: "jp" } }, "bad_request"],
    [{ body: { text: 42, voice: "Kore", pack: "jp" } }, "bad_request"],
  ];
  for (const [c, code] of cases) {
    const r = await POST(call(c.body, { raw: c.raw }), deps(f));
    assert.equal(r.status, 400, JSON.stringify(c));
    assert.equal((await r.json()).code, code, JSON.stringify(c));
  }
  assert.equal(f.calls.length, 0);
});

test("a whole script up to 600 chars is one request; over 600 → 400 text_too_long with max", async () => {
  const f = fakeFetch();
  const ok = await POST(call({ text: `${++textSeq}${"あ".repeat(599 - String(textSeq).length)}`, voice: "Kore", pack: "jp" }), deps(f));
  assert.equal(ok.status, 200);
  assert.equal(f.calls.length, 1);
  const r = await POST(call({ text: "あ".repeat(601), voice: "Kore", pack: "jp" }), deps(f));
  assert.equal(r.status, 400);
  assert.deepEqual(await r.json(), { code: "text_too_long", max: 600 });
});

test("text not in the pack's target language → 400", async () => {
  const f = fakeFetch();
  for (const [text, pack] of [["안녕하세요.", "jp"], ["Hello there.", "jp"], ["はい、そうです。", "kr"]]) {
    const r = await POST(call({ text, voice: "Kore", pack }), deps(f));
    assert.equal(r.status, 400, text);
  }
  assert.equal(f.calls.length, 0);
  const ok = await POST(call({ text: "네, 맞습니다［3건］.", voice: "Charon", pack: "kr" }), deps(f));
  assert.equal(ok.status, 200);
});

test("［blanks］ are replaced by their inner text, not dropped; only the sentence + voice are sent", async () => {
  const f = fakeFetch();
  const r = await POST(call({ text: "前職では［ここに実績の数字］件を改善しました。", voice: "Charon", pack: "jp" }), deps(f));
  assert.equal(r.status, 200);
  const sent = f.calls[0].body;
  const t = sent.contents[0].parts[0].text;
  assert.equal(t, "前職ではここに実績の数字件を改善しました。", "no prefix: the lite model reads any instruction aloud");
  assert.equal(sent.contents.length, 1);
  assert.equal(sent.contents[0].parts.length, 1);
  assert.equal(sent.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, "Charon");
  assert.deepEqual(sent.generationConfig.responseModalities, ["AUDIO"]);
  assert.equal(f.calls[0].init.headers["x-goog-api-key"], "k");
  assert.ok(f.calls[0].url.includes(`/models/${PRIMARY_MODEL}:streamGenerateContent?alt=sse`));
  assert.ok(f.calls[0].init.signal instanceof AbortSignal);
});

test("mask is applied before the text leaves the server", async () => {
  const f = fakeFetch();
  const r = await POST(call({ text: "連絡は090-1234-5678かa.b@example.jpまでお願いします。", voice: "Kore", pack: "jp" }), deps(f));
  assert.equal(r.status, 200);
  const t = f.calls[0].body.contents[0].parts[0].text;
  assert.doesNotMatch(t, /090|example/);
  assert.match(t, /\[phone\].*\[email\]/);
});

test("streams raw PCM chunks in order with the sample rate from the mimeType", async () => {
  const r = await POST(call({ text: uniq(), voice: "Kore", pack: "jp" }), deps(fakeFetch([200], "audio/l16; rate=16000; channels=1")));
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-type"), "audio/L16;rate=16000;channels=1");
  assert.equal(r.headers.get("x-sample-rate"), "16000");
  assert.equal(r.headers.get("x-audio-bytes"), null, "length unknown while streaming");
  const reader = r.body.getReader(), got = [];
  for (let x; !(x = await reader.read()).done; ) got.push(Buffer.from(x.value));
  assert.equal(got.length, 2, "one body chunk per audio event");
  assert.deepEqual(Buffer.concat(got), PCM);
});

test("no audio from the primary (text-only reply) → fallback model", async () => {
  const f = fakeFetch(["text", 200]);
  const r = await POST(call({ text: uniq(), voice: "Kore", pack: "jp" }), deps(f));
  assert.equal(r.status, 200);
  assert.deepEqual(await bytesOf(r), PCM);
  assert.equal(f.calls.length, 2);
});

test("429 on the primary model falls back to the second model", async () => {
  const f = fakeFetch([429, 200]);
  const r = await POST(call({ text: uniq(), voice: "Kore", pack: "jp" }), deps(f));
  assert.equal(r.status, 200);
  assert.equal(f.calls.length, 2);
  assert.ok(f.calls[1].url.includes(`/models/${FALLBACK_MODEL}:streamGenerateContent?alt=sse`));
});

test("free-tier quota: after a 429 the primary is skipped for 60 s, then tried again", async () => {
  clock += 61_000; // past any cooldown an earlier test started
  const now = () => clock;
  const f = fakeFetch([429, 200, 200, 200]);
  assert.equal((await POST(call({ text: uniq(), voice: "Kore", pack: "jp" }), deps(f, now))).status, 200);
  clock += 59_000;
  assert.equal((await POST(call({ text: uniq(), voice: "Kore", pack: "jp" }), deps(f, now))).status, 200);
  assert.equal(f.calls.length, 3, "inside the cooldown: one request, straight to the fallback");
  assert.ok(f.calls[2].url.includes(`/models/${FALLBACK_MODEL}:`));
  clock += 2_000;
  assert.equal((await POST(call({ text: uniq(), voice: "Kore", pack: "jp" }), deps(f, now))).status, 200);
  assert.equal(f.calls.length, 4);
  assert.ok(f.calls[3].url.includes(`/models/${PRIMARY_MODEL}:`), "cooldown over: primary again");
});

test("a 5xx on the primary does not start the cooldown", async () => {
  clock += 61_000; // past any cooldown an earlier test started
  const now = () => clock;
  const f = fakeFetch([503, 200, 200]);
  await POST(call({ text: uniq(), voice: "Kore", pack: "jp" }), deps(f, now));
  await POST(call({ text: uniq(), voice: "Kore", pack: "jp" }), deps(f, now));
  assert.ok(f.calls[2].url.includes(`/models/${PRIMARY_MODEL}:`));
});

test("both models busy (429/5xx) → 503 tts_busy", async () => {
  const r = await POST(call({ text: uniq(), voice: "Kore", pack: "jp" }), deps(fakeFetch([503, 429])));
  assert.equal(r.status, 503);
  assert.deepEqual(await r.json(), { code: "tts_busy" });
});

test("a 4xx from the provider does not retry → 502 generation_failed", async () => {
  const f = fakeFetch([403]);
  const r = await POST(call({ text: uniq(), voice: "Kore", pack: "jp" }), deps(f));
  assert.equal(r.status, 502);
  assert.deepEqual(await r.json(), { code: "generation_failed" });
  assert.equal(f.calls.length, 1);
});

test("no API key → 503 tts_unavailable (fail closed), no fetch", async () => {
  const saved = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    const f = fakeFetch();
    const r = await POST(call({ text: uniq(), voice: "Kore", pack: "jp" }), { fetch: f });
    assert.equal(r.status, 503);
    assert.deepEqual(await r.json(), { code: "tts_unavailable" });
    assert.equal(f.calls.length, 0);
  } finally {
    if (saved !== undefined) process.env.GEMINI_API_KEY = saved;
  }
});

test("a completed script is cached (even after a fallback) and replayed whole with its length", async () => {
  const text = uniq();
  const f = fakeFetch([429, 200]);
  const a = await bytesOf(await POST(call({ text, voice: "Kore", pack: "jp" }), deps(f)));
  const r2 = await POST(call({ text, voice: "Kore", pack: "jp" }), deps(f));
  assert.equal(f.calls.length, 2, "second request made no fetch");
  assert.equal(r2.headers.get("x-audio-bytes"), String(PCM.length));
  assert.deepEqual(await bytesOf(r2), a);
  await POST(call({ text, voice: "Charon", pack: "jp" }), deps(f));
  assert.equal(f.calls.length, 3, "another voice is a different entry");
});

test("a stream the client abandoned is not cached", async () => {
  const text = uniq();
  const f = fakeFetch();
  const r = await POST(call({ text, voice: "Kore", pack: "jp" }), deps(f));
  await r.body.getReader().cancel();
  await POST(call({ text, voice: "Kore", pack: "jp" }), deps(f));
  assert.equal(f.calls.length, 2);
});

test("highlight: weights follow mora; brackets and small kana are silent", () => {
  assert.equal(weight("あ"), 1);
  assert.equal(weight("ょ"), 0);
  assert.equal(weight("面"), 2);
  assert.equal(weight("한"), 1);
  assert.equal(weight("［"), 0);
  assert.ok(weight("。") > weight("、"));
});

test("highlight: monotonic, starts at 0, ends at full length, kanji take longer than kana", () => {
  for (const text of ["前職では［ここに実績の数字］件を改善しました。", "네, 맞습니다. 3건을 개선했습니다!", "はい。"]) {
    let prev = 0;
    assert.equal(highlightLength(text, 0, 5), 0, text);
    for (let t = 0; t <= 5.2; t += 0.05) {
      const n = highlightLength(text, t, 5);
      assert.ok(n >= prev && n <= text.length, `${text} @${t}: ${n} < ${prev}`);
      prev = n;
    }
    assert.equal(highlightLength(text, 5, 5), text.length);
    assert.equal(highlightLength(text, 1, 0), text.length, "unknown total shows everything rather than nothing");
  }
  // Half the time: the kanji half (面接面接 = 8) is not done when the kana half would be.
  assert.equal(highlightLength("あいうえ面接面接", 2, 6), 4);
});

test("highlight: total grows with the stream and becomes exact at the end", () => {
  const text = "前職では件を改善しました。";
  const est = estimateSeconds(text);
  assert.ok(est > 1 && est < 6, String(est));
  assert.equal(totalSeconds({ text, bytes: 48000, rate: 24000, done: false }), Math.max(1, est));
  assert.equal(totalSeconds({ text, bytes: 48000 * 20, rate: 24000, done: false }), 20, "arrived audio beats a short estimate");
  assert.equal(totalSeconds({ text, bytes: 48000 * 3, rate: 24000, done: true }), 3);
});

test("speechSynthesis boundary fallback never moves backwards", () => {
  assert.equal(fromBoundary(0, { charIndex: 3, charLength: 2 }), 5);
  assert.equal(fromBoundary(5, { charIndex: 1, charLength: 1 }), 5);
  assert.equal(fromBoundary(5, { charIndex: 7 }), 7);
});

test("fixture WAV is a valid tiny silence file", () => {
  const w = readFileSync(new URL("./fixtures/tts-silence.wav", import.meta.url));
  assert.equal(w.toString("ascii", 0, 4), "RIFF");
  assert.equal(w.readUInt32LE(40), w.length - 44);
  assert.ok(w.length < 1024);
});


// Security review 11/03: /api/tts read any text with a kana in it, on the free Gemini quota every user shares. It
// now reads only text that /api/script signed (HMAC, server secret); missing or forged signatures never reach Gemini.
test("TTS reads only scripts the server signed: missing or forged signature → 400 before any Gemini call", async () => {
  const f = fakeFetch();
  for (const sig of [undefined, null, "x".repeat(32), sign("別の文です。")]) {
    const r = await POST(call({ text: "はい、承知いたしました。", voice: "Kore", pack: "jp", sig }), deps(f));
    assert.equal(r.status, 400, String(sig));
  }
  assert.equal(f.calls ? f.calls.length : 0, 0);
});
