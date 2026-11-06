import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gate } from "../lib/guard.js";
import { POST as access } from "../api/access.js";
import { POST as questions } from "../api/questions.js";
import { POST as script } from "../api/script.js";
import { POST as review } from "../api/review.js";
import { POST as reverse } from "../api/reverse.js";
import { POST as research } from "../api/research.js";
import { POST as tts } from "../api/tts.js";
import { POST as stt } from "../api/stt.js";

// Daily limit (DECISIONS 11/06 17:25, 17:40, 18:05). OPEN_ACCESS=1: no code needed, DAILY_LIMIT calls a JST day in all
// (DAILY_LIMIT_IP per IP); the right code lifts the limit, a wrong one is still 401. Unset: the code gate as before.
const req = (code, ip = "1.2.3.4", url = "http://x/api/questions", body = "{}") => new Request(url, { method: "POST", headers: { ...(code != null && { "x-access-code": code }), "x-forwarded-for": ip, "content-type": "application/json" }, body });
const status = async (r) => r && [r.status, (await r.json()).code];
const open = (extra = {}) => ({ ACCESS_CODE: "c0de", OPEN_ACCESS: "1", ...extra });
const noon = (day) => Date.parse(`${day}T03:00:00Z`); // 12:00 JST; each test has its own day, so the in-memory counts do not mix

test("gate: the right code passes uncounted in both modes, a wrong code is 401, no code is 401 without OPEN_ACCESS", async () => {
  const now = noon("2030-01-01");
  for (const env of [{ ACCESS_CODE: "c0de" }, open({ DAILY_LIMIT_IP: "1" })]) {
    for (let i = 0; i < 3; i++) assert.equal(await gate(req("c0de", "10.0.0.1"), { env, now }), null);
    assert.deepEqual(await status(await gate(req("bad", "10.0.0.1"), { env, now })), [401, "access_denied"]);
  }
  for (const code of [null, ""]) assert.deepEqual(await status(await gate(req(code, "10.0.0.2"), { env: { ACCESS_CODE: "c0de" }, now })), [401, "access_denied"]);
  const env = open({ DAILY_LIMIT_IP: "1" });
  assert.equal(await gate(req(null, "10.0.0.1"), { env, now }), null, "the code calls above were not counted");
  assert.deepEqual(await status(await gate(req(null, "10.0.0.1"), { env, now })), [429, "quota"]);
  assert.equal(await gate(req("c0de", "10.0.0.1"), { env, now }), null, "the code lifts the limit");
});

test("gate: the IP limit is checked first, so a call over it does not use up the global count", async () => {
  const env = open({ DAILY_LIMIT: "3", DAILY_LIMIT_IP: "2" }), now = noon("2030-01-02");
  const at = (ip) => gate(req(null, ip), { env, now });
  assert.equal(await at("10.0.1.1"), null);
  assert.equal(await at("10.0.1.1"), null);
  const over = await at("10.0.1.1");
  assert.equal(over.status, 429);
  assert.deepEqual(await over.json(), { code: "quota", resets_at: "2030-01-02T15:00:00.000Z" }, "next 00:00 JST");
  assert.equal(await at("10.0.1.2"), null, "3rd of the 3 global calls");
  assert.deepEqual(await status(await at("10.0.1.3")), [429, "quota"], "global limit");
});

// Intent changed by the user on 11/06 19:30: one trial without a code (1 question set + 1 answer = 4 calls) replaces 15 per IP.
test("gate: defaults are 60 a day and 4 per IP (user, 11/06 19:30); empty or broken values keep them", async () => {
  for (const [env, day] of [[open(), "2030-01-03"], [open({ DAILY_LIMIT: "", DAILY_LIMIT_IP: "abc" }), "2030-01-04"]]) {
    const at = (ip) => gate(req(null, ip), { env, now: noon(day) });
    for (let i = 0; i < 4; i++) assert.equal(await at("10.0.2.1"), null, `${day} 1/${i}`);
    assert.deepEqual(await status(await at("10.0.2.1")), [429, "quota"], "5th from one IP, with 4 of 60 used");
    for (let ip = 2; ip <= 15; ip++) for (let i = 0; i < 4; i++) assert.equal(await at(`10.0.2.${ip}`), null, `${day} ${ip}/${i}`);
    assert.deepEqual(await status(await at("10.0.2.99")), [429, "quota"], "61st of the day");
  }
});

// Values pasted with a trailing newline (echo into `vercel env add`) must not silently change the mode or the limit.
test("gate: a trailing newline in OPEN_ACCESS or DAILY_LIMIT_IP keeps the meaning", async () => {
  const env = open({ OPEN_ACCESS: "1\n", DAILY_LIMIT_IP: "2\n" }), at = () => gate(req(null, "10.0.7.1"), { env, now: noon("2030-01-10") });
  assert.equal(await at(), null, "open, not 401");
  assert.equal(await at(), null);
  assert.deepEqual(await status(await at()), [429, "quota"], "the 3rd call is over 2, not over the default");
});

test("gate: counts per JST day and resets at 00:00 JST", async () => {
  const env = open({ DAILY_LIMIT_IP: "1" }), midnight = Date.parse("2030-01-05T15:00:00Z"); // 2030-01-06 00:00 JST
  assert.equal(await gate(req(null, "10.0.3.1"), { env, now: midnight - 1 }), null);
  const over = await gate(req(null, "10.0.3.1"), { env, now: midnight - 1 });
  assert.deepEqual(await over.json(), { code: "quota", resets_at: "2030-01-05T15:00:00.000Z" });
  assert.equal(await gate(req(null, "10.0.3.1"), { env, now: midnight }), null, "a new day");
});

test("gate with KV: INCR the IP key then the global key, expire at 00:00 JST on the first hit, the store's count decides", async () => {
  const calls = [], counts = new Map([["quota:2030-01-07:10.0.4.1", 3]]);
  const fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, auth: init.headers.authorization, body });
    if (body[0] === "INCR") counts.set(body[1], (counts.get(body[1]) ?? 0) + 1);
    return Response.json({ result: body[0] === "INCR" ? counts.get(body[1]) : 1 });
  };
  const env = open({ KV_REST_API_URL: "https://kv.example", KV_REST_API_TOKEN: "tok" }), now = noon("2030-01-07");
  assert.equal(await gate(req(null, "10.0.4.1"), { env, fetch, now }), null, "4th from this IP");
  const at = Date.parse("2030-01-07T15:00:00Z") / 1000;
  assert.deepEqual(calls.map((c) => c.body), [["INCR", "quota:2030-01-07:10.0.4.1"], ["INCR", "quota:2030-01-07"], ["EXPIREAT", "quota:2030-01-07", at]]);
  assert.ok(calls.every((c) => c.url === "https://kv.example" && c.auth === "Bearer tok"));
  assert.deepEqual(await status(await gate(req(null, "10.0.4.1"), { env, fetch, now })), [429, "quota"], "5th, counted by the store");
  assert.equal(calls.length, 4, "over the IP limit: the global key is not touched");
  counts.set("quota:2030-01-07", 60);
  assert.deepEqual(await status(await gate(req(null, "10.0.4.2"), { env, fetch, now })), [429, "quota"], "61st, counted by the store");
});

test("gate: a failing KV falls back to memory, one log line per call, without values", async (t) => {
  const log = t.mock.method(console, "error", () => {});
  const env = open({ DAILY_LIMIT_IP: "1", KV_REST_API_URL: "https://kv.example", KV_REST_API_TOKEN: "secret-token" }), now = noon("2030-01-08");
  const down = async () => new Response("down", { status: 500 });
  assert.equal(await gate(req(null, "10.0.5.1"), { env, fetch: down, now }), null);
  assert.deepEqual(await status(await gate(req(null, "10.0.5.1"), { env, fetch: down, now })), [429, "quota"], "still limited, in memory");
  const thrown = async () => { throw new Error("network"); };
  const odd = async () => Response.json({ error: "ERR" });
  assert.equal(await gate(req(null, "10.0.5.2"), { env, fetch: thrown, now }), null);
  assert.equal(await gate(req(null, "10.0.5.3"), { env, fetch: odd, now }), null);
  assert.equal(log.mock.callCount(), 4);
  for (const c of log.mock.calls) assert.doesNotMatch(c.arguments.join(" "), /10\.0\.5|secret-token|kv\.example|quota:/);
});

test("gate: without ACCESS_CODE the limit still works and no code lifts it", async () => {
  const env = { OPEN_ACCESS: "1", DAILY_LIMIT_IP: "1" }, now = noon("2030-01-09");
  assert.equal(await gate(req(null, "10.0.6.1"), { env, now }), null);
  assert.deepEqual(await status(await gate(req("anything", "10.0.6.2"), { env, now })), [401, "access_denied"]);
  assert.deepEqual(await status(await gate(req(null, "10.0.6.1"), { env, now })), [429, "quota"]);
});

// Every route that calls a model or an outside API: research covers the fit, prep and verify rewrites.
const ROUTES = [
  ["questions", questions, "http://x/api/questions"],
  ["script", script, "http://x/api/script"],
  ["review", review, "http://x/api/review"],
  ["reverse", reverse, "http://x/api/reverse"],
  ["research", research, "http://x/api/research"],
  ["fit", research, "http://x/api/research?route=fit"],
  ["prep", research, "http://x/api/research?route=prep"],
  ["verify", research, "http://x/api/research?route=verify"],
  ["tts", tts, "http://x/api/tts"],
  ["stt", stt, "http://x/api/stt?pack=jp&lang=ko"],
];
const noCall = () => { throw new Error("must not be called"); };
const deps = { client: { messages: { create: noCall } }, fetch: noCall, enabled: true };

test("every model or provider route goes through the gate: 401 closed, 429 open over the limit, the code passes", async () => {
  process.env.ACCESS_CODE = "c0de";
  process.env.DAILY_LIMIT_IP = "0";
  let n = 0;
  for (const [name, POST, url] of ROUTES) {
    delete process.env.OPEN_ACCESS;
    assert.deepEqual(await status(await POST(req(null, `10.1.0.${++n}`, url), deps)), [401, "access_denied"], `${name} closed`);
    process.env.OPEN_ACCESS = "1";
    assert.deepEqual(await status(await POST(req(null, `10.1.0.${++n}`, url), deps)), [429, "quota"], `${name} open, over the limit`);
    const passed = await POST(req("c0de", `10.1.0.${++n}`, url), deps);
    assert.ok(![401, 429].includes(passed.status), `${name}: the code passes the gate (got ${passed.status})`);
  }
});

test("/api/access: reports open; no code is 200 limited with OPEN_ACCESS, 401 without it, and never counts toward the wrong-code lock", async () => {
  process.env.ACCESS_CODE = "c0de";
  delete process.env.OPEN_ACCESS;
  const call = async (code, ip) => { const r = await access(req(code, ip, "http://x/api/access", undefined)); return [r.status, await r.json()]; };
  for (let i = 0; i < 25; i++) assert.deepEqual(await call(null, "10.2.0.1"), [401, { code: "access_denied" }]);
  const [s, b] = await call("c0de", "10.2.0.1");
  assert.deepEqual([s, b.ok, b.open, b.unlimited], [200, true, false, true], "25 calls without a code did not lock the IP");
  process.env.OPEN_ACCESS = "1";
  const [s2, b2] = await call(null, "10.2.0.2");
  assert.deepEqual([s2, b2.ok, b2.open, b2.unlimited], [200, true, true, false]);
  for (const k of ["stt", "research", "mail", "prep"]) assert.equal(typeof b2[k], "boolean", k);
  const [s3, b3] = await call("c0de", "10.2.0.2");
  assert.deepEqual([s3, b3.open, b3.unlimited], [200, true, true]);
  assert.deepEqual(await call("bad", "10.2.0.2"), [401, { code: "access_denied" }]);
  process.env.OPEN_ACCESS = "1\n"; // the gate reads it trimmed, so the page must see the same mode
  const [s4, b4] = await call(null, "10.2.0.3");
  assert.deepEqual([s4, b4.open], [200, true]);
});

// Refutation 11 (11/06): the page said the IP stays in memory only, but the open mode keeps a daily count under a key with the IP (README),
// and it did not say what the calendar link sends.
test("the privacy page says the daily count key holds the IP until midnight, and what the calendar link sends", () => {
  const html = readFileSync(new URL("../public/privacy.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /回数制限をサーバーのメモリ上で行います（保存しません）。AI/);
  assert.match(html, /日付と IP アドレスを含むキー/);
  assert.match(html, /日本時間0時/);
  assert.match(html, /Google カレンダーで開く/);
});
