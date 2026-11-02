// /api/stt: offline, fake fetch (no Gemini call).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { POST } from "../api/stt.js";
import { MODELS } from "../lib/stt.js";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/stt.json", import.meta.url), "utf8"));
const FIXTURE_TEXT = fixture.candidates[0].content.parts[0].audioTranscription.text;
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
const deps = (fetch = fakeFetch(ok())) => ({ fetch, apiKey: "k" });
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

test("no GEMINI key → 503 stt_unavailable (fail closed)", async () => {
  const saved = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  const f = fakeFetch(ok());
  await check(await POST(req(), { fetch: f }), 503, { code: "stt_unavailable" });
  assert.equal(f.calls.length, 0);
  if (saved !== undefined) process.env.GEMINI_API_KEY = saved;
});

test("unsupported content type → 415 audio_unsupported", async () => {
  for (const type of ["video/webm", "application/json", "audio/flac", ""]) await check(await POST(req({ type }), deps()), 415, { code: "audio_unsupported" });
});

test("all browser audio types are accepted, codecs params included", async () => {
  for (const type of ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg; codecs=opus", "audio/mpeg", "audio/wav", "AUDIO/WEBM"]) {
    const f = fakeFetch(ok());
    await check(await POST(req({ type }), deps(f)), 200, { text: FIXTURE_TEXT });
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
  assert.equal(f.calls[0].body.systemInstruction, undefined); // the transcribe model rejects it (400)
});

test("primary busy (429) → fallback model with JSON schema → 200", async () => {
  const f = fakeFetch(new Response("{}", { status: 429 }), ok({ candidates: [{ content: { parts: [{ text: JSON.stringify({ text: " 음, 어, 그니까 ", language: "ko" }) }] } }] }));
  await check(await POST(req(), deps(f)), 200, { text: "음, 어, 그니까" });
  assert.equal(f.calls.length, 2);
  assert.match(f.calls[1].url, new RegExp(`/${MODELS[1].id}:generateContent$`));
  assert.equal(f.calls[1].body.generationConfig.responseMimeType, "application/json");
  assert.deepEqual(f.calls[1].body.generationConfig.responseSchema.required, ["text", "language"]);
});

test("network error on primary → fallback", async () => {
  const f = fakeFetch(() => { throw new TypeError("fetch failed"); }, ok({ candidates: [{ content: { parts: [{ text: JSON.stringify({ text: FIXTURE_TEXT, language: "ja" }) }] } }] }));
  await check(await POST(req(), deps(f)), 200, { text: FIXTURE_TEXT });
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
  const g = fakeFetch(new Response("{}", { status: 500 }), ok({ candidates: [{ content: { parts: [{ text: "not json" }] } }] }));
  await check(await POST(req(), deps(g)), 502, { code: "generation_failed" });
});

test("PII in the transcript is masked and the text is capped at 2000 chars", async () => {
  const say = (text) => ok({ candidates: [{ content: { parts: [{ audioTranscription: { text } }] } }] });
  await check(await POST(req(), deps(fakeFetch(say("電話は090-1234-5678、メールはa.b@example.com です")))), 200, { text: "電話は[phone]、メールは[email] です" });
  const res = await POST(req(), deps(fakeFetch(say("あ".repeat(2500)))));
  assert.equal((await res.json()).text.length, 2000);
});
