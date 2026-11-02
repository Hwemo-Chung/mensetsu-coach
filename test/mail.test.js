import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPack } from "../lib/coach.js";
import { dailyTip, subscriberId, tipIndex } from "../lib/mail.js";
import { POST as subscribe } from "../api/subscribe.js";
import { GET as unsubscribe } from "../api/unsubscribe.js";
import { GET as cron } from "../api/cron/daily.js";

const pack = loadPack("jp");
const SECRET = "test-secret";

// In-memory stand-ins for Upstash (hash) and Resend. No network, no tokens.
const fakeStore = () => {
  const m = new Map();
  return { m, set: async (id, v) => m.set(id, v), del: async (id) => m.delete(id), all: async () => [...m.entries()] };
};
const fakeMailer = () => {
  const sent = [];
  return { sent, send: async (msg) => (sent.push(msg), { id: `m${sent.length}` }) };
};
const env = () => {
  Object.assign(process.env, { ACCESS_CODE: "c0de", MAIL_SECRET: SECRET, CRON_SECRET: "cron", APP_URL: "https://app.example" });
};
let ip = 0;
const subReq = (body, code = "c0de") => new Request("http://x/api/subscribe", { method: "POST", headers: { "x-access-code": code, "x-forwarded-for": `2.2.2.${ip++}`, "content-type": "application/json" }, body: JSON.stringify(body) });

test("daily tip: rotates by JST date; contains question, 4-step hint, one rule before→after; localized; no AI", () => {
  const d1 = new Date("2026-11-03T00:00:00Z"); // 09:00 JST
  const d2 = new Date("2026-11-04T00:00:00Z");
  assert.notEqual(tipIndex(d1), tipIndex(d2));
  const ko = dailyTip(pack, d1, "ko", "https://app.example/u?id=X");
  assert.ok(pack.daily_questions.includes(ko.question));
  assert.ok(ko.text.includes(ko.question));
  assert.ok(ko.text.includes("復唱") && ko.text.includes("選択肢"));
  const rule = pack.correction_rules.find((r) => ko.text.includes(`【${r.id}】`));
  assert.ok(rule && ko.text.includes(rule.example_before) && ko.text.includes(rule.example_after));
  assert.ok(ko.text.includes("https://app.example/u?id=X"));
  assert.match(ko.subject, /11\/03/);
  assert.notEqual(dailyTip(pack, d1, "en", "u").subject, ko.subject);
  // 15:00 UTC on 11/03 is already 11/04 in Japan
  assert.equal(tipIndex(new Date("2026-11-03T15:00:00Z")), tipIndex(d2));
});

test("subscriber id: HMAC of the normalized email, no email in it", () => {
  const a = subscriberId(" You@Example.com ", SECRET);
  assert.equal(a, subscriberId("you@example.com", SECRET));
  assert.notEqual(a, subscriberId("you@example.com", "other"));
  assert.ok(!a.includes("example"));
  assert.match(a, /^[0-9a-f]{32,}$/);
});

test("subscribe API: access code, email format, explicit consent, lang; stores only email+lang+time", async () => {
  env();
  const store = fakeStore();
  const deps = { store };
  const check = async (res, status, body) => { assert.equal(res.status, status); assert.deepEqual(await res.json(), body); };
  await check(await subscribe(subReq({ email: "a@b.co", consent: true }, "bad"), deps), 401, { code: "access_denied" });
  await check(await subscribe(subReq({ email: "nope", consent: true }), deps), 400, { code: "email_invalid" });
  await check(await subscribe(subReq({ email: "a@b.co" }), deps), 400, { code: "consent_required" });
  await check(await subscribe(subReq({ email: "a@b.co", consent: true, lang: "xx" }), deps), 400, { code: "lang_unsupported" });
  await check(await subscribe(subReq({ email: "A@B.co", consent: true, lang: "en" }), { store, now: () => new Date("2026-11-02T10:00:00Z") }), 200, { ok: true });
  const [[id, v]] = [...store.m.entries()];
  assert.equal(id, subscriberId("a@b.co", SECRET));
  assert.deepEqual(v, { email: "a@b.co", lang: "en", consented_at: "2026-11-02T10:00:00.000Z" });
});

test("subscribe API: without mail config → 503 mail_unavailable (keys not set yet)", async () => {
  env();
  const res = await subscribe(subReq({ email: "a@b.co", consent: true }), { store: null });
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { code: "mail_unavailable" });
});

test("unsubscribe: valid id removes the subscriber; unknown id is harmless", async () => {
  env();
  const store = fakeStore();
  const id = subscriberId("a@b.co", SECRET);
  await store.set(id, { email: "a@b.co", lang: "ja" });
  const res = await unsubscribe(new Request(`http://x/api/unsubscribe?id=${id}`), { store });
  assert.equal(res.status, 200);
  assert.equal(store.m.size, 0);
  assert.equal((await unsubscribe(new Request("http://x/api/unsubscribe?id=zzz"), { store })).status, 400);
});

test("cron: needs CRON_SECRET; sends one localized tip per subscriber with an unsubscribe link; never returns emails", async () => {
  env();
  const store = fakeStore();
  const mailer = fakeMailer();
  for (const [e, l] of [["a@b.co", "ko"], ["c@d.co", "ja"]]) await store.set(subscriberId(e, SECRET), { email: e, lang: l });
  assert.equal((await cron(new Request("http://x/api/cron/daily"), { store, mailer })).status, 401);
  const res = await cron(new Request("http://x/api/cron/daily", { headers: { authorization: "Bearer cron" } }), { store, mailer, now: () => new Date("2026-11-03T00:00:00Z") });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.deepEqual(body, { sent: 2, failed: 0 });
  assert.deepEqual(mailer.sent.map((m) => m.to).sort(), ["a@b.co", "c@d.co"]);
  for (const m of mailer.sent) assert.match(m.text, /https:\/\/app\.example\/api\/unsubscribe\?id=[0-9a-f]+/);
  assert.notEqual(mailer.sent[0].subject, mailer.sent[1].subject, "localized subjects differ");
});

test("cron: one failed send does not stop the others", async () => {
  env();
  const store = fakeStore();
  for (const e of ["a@b.co", "c@d.co"]) await store.set(subscriberId(e, SECRET), { email: e, lang: "ko" });
  let n = 0;
  const mailer = { send: async () => { if (n++ === 0) throw new Error("bounce"); return { id: "ok" }; } };
  const res = await cron(new Request("http://x/api/cron/daily", { headers: { authorization: "Bearer cron" } }), { store, mailer });
  assert.deepEqual(await res.json(), { sent: 1, failed: 1 });
});
