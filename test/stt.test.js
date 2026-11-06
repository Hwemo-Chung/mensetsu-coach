// /api/stt: offline, fake fetch (no Gemini call).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { POST } from "../api/stt.js";
import { MODELS, wavDurationMs, speechQuality, MIN_CHARS_PER_SEC, sttEnabled } from "../lib/stt.js";
import { POST as access } from "../api/access.js";

// Primary = gemini-3.5-flash-lite in JSON mode (keeps できるです; the transcribe model corrected it, PoC 11/03).
const fixture = JSON.parse(readFileSync(new URL("./fixtures/stt.json", import.meta.url), "utf8"));
const FIXTURE_JSON = JSON.parse(fixture.candidates[0].content.parts[0].text);
const FIXTURE_TEXT = FIXTURE_JSON.text;
const AUDIO = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4]); // "RIFF…"; the fake never decodes it

process.env.ACCESS_CODE = "c0de";
let ipN = 0;
const req = ({ code = "c0de", type = "audio/webm;codecs=opus", body = AUDIO, headers = {}, query = "", ip = `10.0.0.${++ipN}` } = {}) =>
  new Request(`http://x/api/stt${query}`, { method: "POST", headers: { "x-access-code": code, "content-type": type, "x-forwarded-for": ip, ...headers }, body, duplex: "half" });

// Fake Gemini: replies[i] answers the i-th call (Response or function → Response); calls records each request body.
const fakeFetch = (...replies) => {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    const r = replies[calls.length - 1] ?? replies.at(-1);
    return typeof r === "function" ? r() : r.clone();
  };
  fn.calls = calls;
  return fn;
};
const ok = (j = fixture) => Response.json(j);
// Primary (JSON) reply and fallback (transcribe) reply shapes.
const said = (o) => ok({ candidates: [{ content: { parts: [{ text: JSON.stringify({ language: "ja", ...o }) }] } }] });
const heard = (text) => ok({ candidates: [{ content: { parts: [{ audioTranscription: { text } }] } }] });
const OK_BODY = { text: FIXTURE_TEXT, quality: "ok" };
const deps = (fetch = fakeFetch(ok())) => ({ fetch, apiKey: "k", enabled: true });
const check = async (res, status, body) => {
  assert.equal(res.status, status);
  assert.deepEqual(await res.json(), body);
};

test("rate limit comes before the access code", async () => {
  const ip = "10.9.9.9";
  for (let i = 0; i < 20; i++) assert.equal((await POST(req({ code: "bad", ip }), deps())).status, 401);
  await check(await POST(req({ code: "bad", ip }), deps()), 429, { code: "rate_limited" });
});

test("wrong access code → 401, Gemini not called", async () => {
  const f = fakeFetch(ok());
  await check(await POST(req({ code: "bad" }), deps(f)), 401, { code: "access_denied" });
  assert.equal(f.calls.length, 0);
});

// Decision 11/03: the Gemini free tier forbids personal data, and a recorded answer carries names and companies.
// Recording stays off until STT_ENABLED=1 (paid tier); the route refuses before reading the audio, so a direct POST
// cannot reach Gemini either. /api/access tells the UI whether to show 🎤.
test("STT_ENABLED unset → 503 stt_unavailable before any Gemini call, even with a key", async () => {
  const saved = process.env.STT_ENABLED;
  delete process.env.STT_ENABLED;
  const f = fakeFetch(ok());
  await check(await POST(req(), { fetch: f, apiKey: "k" }), 503, { code: "stt_unavailable" });
  assert.equal(f.calls.length, 0);
  assert.equal(sttEnabled({}), false);
  assert.equal(sttEnabled({ STT_ENABLED: "0" }), false);
  assert.equal(sttEnabled({ STT_ENABLED: "1" }), true);
  if (saved !== undefined) process.env.STT_ENABLED = saved;
});

test("/api/access reports stt so the UI shows 🎤 only when recording is allowed", async () => {
  const saved = process.env.STT_ENABLED;
  const call = () => access(new Request("http://x/api/access", { method: "POST", headers: { "x-access-code": "c0de", "x-forwarded-for": `10.9.0.${++ipN}` } })).then((r) => r.json());
  delete process.env.STT_ENABLED;
  // Intent unchanged (stt follows the flag): the body gained the research flag 11/04 and the mail and prep flags 11/05, open and unlimited 11/06; test/research.test.js, test/mail.test.js, test/prep.test.js and test/guard.test.js cover those.
  assert.deepEqual(await call(), { ok: true, open: false, unlimited: true, stt: false, research: false, mail: false, prep: false });
  process.env.STT_ENABLED = "1";
  assert.deepEqual(await call(), { ok: true, open: false, unlimited: true, stt: true, research: false, mail: false, prep: false });
  if (saved === undefined) delete process.env.STT_ENABLED; else process.env.STT_ENABLED = saved;
});

test("no GEMINI key → 503 stt_unavailable (fail closed)", async () => {
  const saved = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  const f = fakeFetch(ok());
  await check(await POST(req(), { fetch: f, enabled: true }), 503, { code: "stt_unavailable" });
  assert.equal(f.calls.length, 0);
  if (saved !== undefined) process.env.GEMINI_API_KEY = saved;
});

test("unsupported content type → 415 audio_unsupported", async () => {
  for (const type of ["video/webm", "application/json", "audio/flac", ""]) await check(await POST(req({ type }), deps()), 415, { code: "audio_unsupported" });
});

test("all browser audio types are accepted, codecs params included", async () => {
  for (const type of ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg; codecs=opus", "audio/mpeg", "audio/wav", "AUDIO/WEBM"]) {
    const f = fakeFetch(ok());
    await check(await POST(req({ type }), deps(f)), 200, OK_BODY);
    assert.equal(f.calls[0].body.contents[0].parts[1].inlineData.mimeType, type.split(";")[0].trim().toLowerCase());
  }
});

test("content-length over 4 MB → 413 before reading or calling Gemini", async () => {
  const f = fakeFetch(ok());
  await check(await POST(req({ headers: { "content-length": String(4 * 1024 * 1024 + 1) } }), deps(f)), 413, { code: "audio_too_large" });
  assert.equal(f.calls.length, 0);
});

test("lying content-length: body over 4 MB is cut off while streaming → 413", async () => {
  const f = fakeFetch(ok());
  const big = new Uint8Array(4 * 1024 * 1024 + 10);
  await check(await POST(req({ body: big, headers: { "content-length": "10" } }), deps(f)), 413, { code: "audio_too_large" });
  // Also without any content-length (chunked).
  const chunked = new ReadableStream({ pull(c) { c.enqueue(new Uint8Array(1024 * 1024)); } });
  await check(await POST(req({ body: chunked }), deps(f)), 413, { code: "audio_too_large" });
  assert.equal(f.calls.length, 0);
});

test("empty body → 400 bad_request", async () => {
  await check(await POST(req({ body: new Uint8Array(0) }), deps()), 400, { code: "bad_request" });
});

test("pack and lang are validated (query or header)", async () => {
  await check(await POST(req({ query: "?pack=xx" }), deps()), 400, { code: "pack_unsupported" });
  await check(await POST(req({ headers: { "x-lang": "fr" } }), deps()), 400, { code: "lang_unsupported" });
});

test("prompt demands verbatim, keeps fillers, names the pack's spoken language; audio sent as base64", async () => {
  const f = fakeFetch(ok());
  await POST(req({ query: "?pack=kr&lang=ja" }), deps(f));
  const [prompt, audio] = f.calls[0].body.contents[0].parts;
  assert.equal(audio.inlineData.data, Buffer.from(AUDIO).toString("base64"));
  assert.match(prompt.text, /VERBATIM/);
  assert.match(prompt.text, /Do not translate/);
  for (const w of ["えーと", "あの", "なんか", "ちょっと", "음", "어", "그니까", "できるです"]) assert.ok(prompt.text.includes(w), w);
  assert.match(prompt.text, /most likely in ko/);
  assert.match(prompt.text, /first language may be ja/);
  assert.match(f.calls[0].url, new RegExp(`/${MODELS[0].id}:generateContent$`));
  assert.equal(f.calls[0].body.systemInstruction, undefined); // the transcribe model rejects it (400); same body for both
  assert.ok(prompt.text.includes("［？］"), "asks for a marker on unintelligible parts instead of a guess");
});

test("model order: flash-lite (JSON, follows the verbatim prompt) first, transcribe (ignores prompts) second", () => {
  assert.deepEqual(MODELS.map((m) => [m.id, m.json]), [["gemini-3.5-flash-lite", true], ["gemini-3.5-transcribe", false]]);
});

test("primary busy (429) → transcribe fallback → 200 with verbatim: false (it may correct grammar/fillers)", async () => {
  const f = fakeFetch(new Response("{}", { status: 429 }), heard(" 음, 어, 그니까 "));
  await check(await POST(req(), deps(f)), 200, { text: "음, 어, 그니까", quality: "ok", verbatim: false });
  assert.equal(f.calls.length, 2);
  assert.match(f.calls[0].url, new RegExp(`/${MODELS[0].id}:generateContent$`));
  assert.equal(f.calls[0].body.generationConfig.responseMimeType, "application/json");
  assert.deepEqual(f.calls[0].body.generationConfig.responseSchema.required, ["text", "language"]);
  assert.match(f.calls[1].url, new RegExp(`/${MODELS[1].id}:generateContent$`));
  assert.deepEqual(f.calls[1].body.generationConfig, {}); // transcribe rejects JSON mode (400)
});

test("network error on primary → fallback", async () => {
  const f = fakeFetch(() => { throw new TypeError("fetch failed"); }, heard(FIXTURE_TEXT));
  await check(await POST(req(), deps(f)), 200, { ...OK_BODY, verbatim: false });
  assert.equal(f.calls.length, 2);
});

test("both models busy (429 then 503) → 503 stt_busy, no third call", async () => {
  const f = fakeFetch(new Response("{}", { status: 429 }), new Response("{}", { status: 503 }));
  await check(await POST(req(), deps(f)), 503, { code: "stt_busy" });
  assert.equal(f.calls.length, 2);
});

test("Gemini 400 or unparsable output → 502 generation_failed (no fallback on 400)", async () => {
  const f = fakeFetch(Response.json({ error: { code: 400, status: "INVALID_ARGUMENT" } }, { status: 400 }));
  await check(await POST(req(), deps(f)), 502, { code: "generation_failed" });
  assert.equal(f.calls.length, 1);
  const g = fakeFetch(ok({ candidates: [{ content: { parts: [{ text: "not json" }] } }] }));
  await check(await POST(req(), deps(g)), 502, { code: "generation_failed" });
  assert.equal(g.calls.length, 1);
});

test("PII in the transcript is masked and the text is capped at 2000 chars", async () => {
  await check(await POST(req(), deps(fakeFetch(said({ text: "電話は090-1234-5678、メールはa.b@example.com です" })))), 200, { text: "電話は[phone]、メールは[email] です", quality: "ok" });
  const res = await POST(req({ query: "?kana=1" }), deps(fakeFetch(said({ text: "あ".repeat(2500), kana: "あ".repeat(2500) }))));
  const body = await res.json();
  assert.equal(body.text.length, 2000);
  assert.equal(body.kana.length, 2000);
});

// ── V3: recognition quality. low → the UI asks to speak again slowly instead of filling the answer box. ──

// 16-bit mono PCM WAV of the given length (silence; the fake never decodes it).
const wav = (ms, rate = 24000) => {
  const data = Math.round((rate * 2 * ms) / 1000);
  const b = Buffer.alloc(44 + data);
  b.write("RIFF", 0); b.writeUInt32LE(36 + data, 4); b.write("WAVE", 8);
  b.write("fmt ", 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write("data", 36); b.writeUInt32LE(data, 40);
  return b;
};

test("wavDurationMs reads the RIFF header; anything else → null (never throws)", () => {
  assert.equal(wavDurationMs(wav(10_000)), 10_000);
  assert.equal(wavDurationMs(wav(1_500, 16000)), 1_500);
  for (const bad of [AUDIO, new Uint8Array(0), Buffer.from("OggS".padEnd(60, "x")), wav(1000).subarray(0, 30)]) assert.equal(wavDurationMs(bad), null);
  // Streaming writers put 0xFFFFFFFF as the data size: use the bytes actually present.
  const open = wav(2_000);
  open.writeUInt32LE(0xffffffff, 40);
  assert.equal(wavDurationMs(open), 2_000);
});

test("thresholds come from measured speech: ja ≈ 5.2 chars/s, ko ≈ 3.3 chars/s → about 30%", () => {
  assert.deepEqual(MIN_CHARS_PER_SEC, { ja: 1.5, ko: 1.0 });
});

test("speechQuality: empty, unclear marker, too few characters for the duration; no duration → length not judged", () => {
  assert.deepEqual(speechQuality("", 5000, "ja"), { quality: "low", reason: "empty" });
  assert.deepEqual(speechQuality(" 、。 ", 5000, "ja"), { quality: "low", reason: "empty" });
  assert.deepEqual(speechQuality("前職では［？］を導入しました。", undefined, "ja"), { quality: "low", reason: "unclear" });
  assert.deepEqual(speechQuality("前職では[?]を導入しました。", undefined, "ja"), { quality: "low", reason: "unclear" });
  // 10 s of ja: 15 chars (1.5/s) is enough, 14 is not. Punctuation, spaces and marks are not counted.
  assert.deepEqual(speechQuality("あ".repeat(15), 10_000, "ja"), { quality: "ok" });
  assert.deepEqual(speechQuality(`${"あ".repeat(7)}、 。${"あ".repeat(7)}`, 10_000, "ja"), { quality: "low", reason: "too_short" });
  assert.deepEqual(speechQuality("가".repeat(10), 10_000, "ko"), { quality: "ok" });
  assert.deepEqual(speechQuality("가".repeat(9), 10_000, "ko"), { quality: "low", reason: "too_short" });
  assert.deepEqual(speechQuality("はい", undefined, "ja"), { quality: "ok" });
  assert.deepEqual(speechQuality("はい", 0, "ja"), { quality: "ok" });
  // Unknown language → the stricter ja threshold is not applied blindly: falls back to the lower (ko) one.
  assert.deepEqual(speechQuality("a".repeat(10), 10_000, "xx"), { quality: "ok" });
});

test("API: empty transcript → 200 low/empty (the text is still returned; the UI does not fill the box)", async () => {
  await check(await POST(req(), deps(fakeFetch(said({ text: "" })))), 200, { text: "", quality: "low", reason: "empty" });
});

test("API: WAV duration from the header → too_short when far fewer characters than the speech length", async () => {
  await check(await POST(req({ type: "audio/wav", body: wav(10_000) }), deps(fakeFetch(said({ text: "はい。" })))), 200, { text: "はい。", quality: "low", reason: "too_short" });
  await check(await POST(req({ type: "audio/wav", body: wav(10_000) }), deps(fakeFetch(said({ text: FIXTURE_TEXT })))), 200, OK_BODY);
});

test("API: webm/mp4 duration from x-duration-ms, clamped to 0–90000; missing or garbage → not judged", async () => {
  const text = "あ".repeat(140); // 140 chars in 90 s = 1.56/s → ok; in 999 s it would be too_short
  await check(await POST(req({ headers: { "x-duration-ms": "999999" } }), deps(fakeFetch(said({ text })))), 200, { text, quality: "ok" });
  await check(await POST(req({ headers: { "x-duration-ms": "20000" } }), deps(fakeFetch(said({ text: "はい" })))), 200, { text: "はい", quality: "low", reason: "too_short" });
  for (const d of ["abc", "-5", ""]) await check(await POST(req({ headers: { "x-duration-ms": d } }), deps(fakeFetch(said({ text: "はい" })))), 200, { text: "はい", quality: "ok" });
});

test("API: the speech language picks the threshold (Korean answer in the jp pack is judged at ko speed)", async () => {
  const text = "가".repeat(12); // 12 chars / 10 s = 1.2/s: low for ja, ok for ko
  await check(await POST(req({ headers: { "x-duration-ms": "10000" } }), deps(fakeFetch(said({ text, language: "ko" })))), 200, { text, quality: "ok" });
  await check(await POST(req({ headers: { "x-duration-ms": "10000" } }), deps(fakeFetch(said({ text, language: "ja-JP" })))), 200, { text, quality: "low", reason: "too_short" });
});

test("API: an unintelligible-part marker from the model → low/unclear", async () => {
  const text = "前職では、［？］を導入しました。";
  await check(await POST(req(), deps(fakeFetch(said({ text })))), 200, { text, quality: "low", reason: "unclear" });
});

// ── V4: ?kana=1 asks the same single request for a hiragana rendering of what was heard (read-aloud check). ──

test("?kana=1: kana is required in the schema, asked as pronounced (は→わ like the script reading), returned masked", async () => {
  const f = fakeFetch(said({ text: "見積もりがすれた場合は", kana: "みつもりが すれた ばあいわ" }));
  await check(await POST(req({ query: "?kana=1" }), deps(f)), 200, { text: "見積もりがすれた場合は", quality: "ok", kana: "みつもりが すれた ばあいわ" });
  assert.equal(f.calls.length, 1, "one Gemini request per read-aloud");
  assert.deepEqual(f.calls[0].body.generationConfig.responseSchema.required, ["text", "language", "kana"]);
  const prompt = f.calls[0].body.contents[0].parts[0].text;
  assert.match(prompt, /hiragana/);
  assert.match(prompt, /わ/);
  assert.match(prompt, /VERBATIM/);
});

test("?kana=1 without the flag or for a non-Japanese pack → no kana asked, none returned", async () => {
  const f = fakeFetch(said({ text: FIXTURE_TEXT, kana: "えーと" }));
  await check(await POST(req(), deps(f)), 200, OK_BODY);
  assert.deepEqual(f.calls[0].body.generationConfig.responseSchema.required, ["text", "language"]);
  assert.doesNotMatch(f.calls[0].body.contents[0].parts[0].text, /hiragana/);
  const g = fakeFetch(said({ text: "음, 저는", language: "ko", kana: "x" }));
  await check(await POST(req({ query: "?pack=kr&kana=1" }), deps(g)), 200, { text: "음, 저는", quality: "ok" });
  assert.deepEqual(g.calls[0].body.generationConfig.responseSchema.required, ["text", "language"]);
});

test("?kana=1 on the transcribe fallback → no kana (it cannot follow instructions), verbatim: false", async () => {
  const f = fakeFetch(new Response("{}", { status: 503 }), heard("見積もりがずれた場合は"));
  await check(await POST(req({ query: "?kana=1" }), deps(f)), 200, { text: "見積もりがずれた場合は", quality: "ok", verbatim: false });
});
