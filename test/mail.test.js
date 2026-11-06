import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPack } from "../lib/coach.js";
import { readFileSync } from "node:fs";
import { dailyTip, subscriberId, tipIndex, ownerTip, makeStore, makeMailer } from "../lib/mail.js";
import { claimOwner, noteHabit, weakSummary } from "../public/owner.js";
import { POST as access } from "../api/access.js";
import { POST as subscribe } from "../api/subscribe.js";
import { GET as unsubscribe } from "../api/unsubscribe.js";
import { GET as cron } from "../api/cron/daily.js";
import { POST as demand, TARGETS } from "../api/demand.js";

const pack = loadPack("jp");
const SECRET = "test-secret";

// In-memory stand-ins for Upstash (hash) and Resend. No network, no tokens.
const fakeStore = () => {
  const m = new Map();
  const counts = {};
  const kv = new Map();
  return { m, counts, kv, set: async (id, v) => m.set(id, v), del: async (id) => m.delete(id), all: async () => [...m.entries()], incr: async (k) => (counts[k] = (counts[k] ?? 0) + 1), put: async (k, v) => kv.set(k, v), get: async (k) => kv.get(k) ?? null };
};
const fakeMailer = () => {
  const sent = [];
  return { sent, send: async (msg) => (sent.push(msg), { id: `m${sent.length}` }) };
};
// Intent changed 11/05: signup and the subscriber loop now need MAIL_PUBLIC=1, so the tests of that path set it.
const env = () => {
  Object.assign(process.env, { ACCESS_CODE: "c0de", MAIL_SECRET: SECRET, CRON_SECRET: "cron", APP_URL: "https://app.example", MAIL_PUBLIC: "1" });
  delete process.env.MAIL_OWNER_TO;
  delete process.env.MAIL_OWNER_TOKEN;
};
const TOKEN = "owner-token-0123456789-abc";
const OWNER = "owner@example.com";
// The shipped default: public path closed, owner configured.
const ownerEnv = () => {
  env();
  delete process.env.MAIL_PUBLIC;
  Object.assign(process.env, { MAIL_OWNER_TO: OWNER, MAIL_OWNER_TOKEN: TOKEN });
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
  // Label 選択肢 → 締め 11/03 (PRD §16-15: the last step closes by question type); intent unchanged.
  assert.ok(ko.text.includes("復唱") && ko.text.includes("締め"));
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
  assert.equal(res.status, 502, "a partial failure is visible to the caller");
  assert.deepEqual(await res.json(), { sent: 1, failed: 1 });
});

test("demand counter: allowlisted targets only, no personal data, logs one line, counts when the store exists", async () => {
  // Intent changed 11/03: KR opened as a beta destination, so only still-unavailable destinations are counted.
  assert.deepEqual(TARGETS, ["anglo", "other"]);
  const store = fakeStore();
  const logs = [];
  const req = (body) => new Request("http://x/api/demand", { method: "POST", headers: { "x-forwarded-for": `1.1.1.${ip++}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  const ok = await demand(req({ target: "anglo", email: "x@y.z" }), { store, log: (l) => logs.push(l) });
  assert.equal(ok.status, 200);
  assert.deepEqual(store.counts, { anglo: 1 });
  assert.deepEqual(logs, ['{"event":"demand","target":"anglo"}']);
  assert.equal((await demand(req({ target: "mars" }), { store, log: () => {} })).status, 400);
  assert.equal((await demand(req({ target: "kr" }), { store, log: () => {} })).status, 400, "KR is open now, not a demand count");
  assert.equal((await demand(req({ target: "other" }), { store: null, log: () => {} })).status, 200, "no store → still logged, still ok");
});

// --- Public path closed by default, owner-only weak-point mail ---

const cronReq = (q = "") => new Request(`http://x/api/cron/daily${q}`, { headers: { authorization: "Bearer cron" } });
const accessCall = () => access(new Request("http://x/api/access", { method: "POST", headers: { "x-access-code": "c0de", "x-forwarded-for": `3.3.3.${ip++}` } })).then((r) => r.json());
const MONDAY = new Date("2026-11-16T00:00:00Z"); // 09:00 JST, a Monday in Japan
const WEAK = { rules: { "del-chanto": 4, "rep-touka": 3, "str-number": 2, "del-nanka": 1 }, steps: { kijun: 3, ketsuron: 1 }, no: 2, attempts: 12, lang: "ko", job_tags: ["pm"] };
const weakReq = (body, { code = "c0de", owner = TOKEN } = {}) => new Request("http://x/api/subscribe?action=weak", { method: "POST", headers: { "x-access-code": code, "x-mail-owner": owner, "x-forwarded-for": `4.4.4.${ip++}`, "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });

test("/api/access: mail is true only with MAIL_PUBLIC=1, keys or not", async () => {
  ownerEnv();
  Object.assign(process.env, { RESEND_API_KEY: "k", MAIL_FROM: "x@example.com" });
  try {
    assert.equal((await accessCall()).mail, false);
    process.env.MAIL_PUBLIC = "0";
    assert.equal((await accessCall()).mail, false);
    process.env.MAIL_PUBLIC = "1";
    assert.equal((await accessCall()).mail, true);
  } finally {
    delete process.env.RESEND_API_KEY;
    delete process.env.MAIL_FROM;
  }
});

test("subscribe: without MAIL_PUBLIC signup is refused with mail_off and nothing is stored", async () => {
  ownerEnv();
  const store = fakeStore();
  const res = await subscribe(subReq({ email: "a@b.co", consent: true }), { store });
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { code: "mail_off" });
  assert.equal(store.m.size, 0);
  assert.equal((await subscribe(subReq({ email: "a@b.co", consent: true }, "bad"), { store })).status, 401, "the code check still comes first");
});

test("cron: with keys but no MAIL_PUBLIC and no owner, nobody gets mail", async () => {
  env();
  delete process.env.MAIL_PUBLIC;
  const store = fakeStore(), mailer = fakeMailer();
  await store.set(subscriberId("a@b.co", SECRET), { email: "a@b.co", lang: "ko" });
  const res = await cron(cronReq(), { store, mailer });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { code: "mail_off" });
  assert.deepEqual(mailer.sent, []);
});

test("cron: without MAIL_PUBLIC the owner alone gets mail, keyed for the JST date, and store subscribers get none", async () => {
  ownerEnv();
  const store = fakeStore(), mailer = fakeMailer();
  await store.set(subscriberId("a@b.co", SECRET), { email: "a@b.co", lang: "ko" });
  const res = await cron(cronReq(), { store, mailer, now: () => new Date("2026-11-03T15:30:00Z") }); // already 11/04 in Japan
  assert.equal(res.status, 200);
  assert.deepEqual(mailer.sent.map((m) => m.to), [OWNER]);
  assert.equal(mailer.sent[0].idempotencyKey, "tip/2026-11-04/owner");
  assert.deepEqual(store.kv.get("mail:last"), { date: "2026-11-04", sent: 1, failed: 0, deduped: 0, skipped: 0 });
});

test("cron: a short token, a missing address or a missing mailer disables the owner mail", async () => {
  ownerEnv();
  process.env.MAIL_OWNER_TOKEN = "x".repeat(19);
  let mailer = fakeMailer();
  assert.deepEqual(await (await cron(cronReq(), { store: fakeStore(), mailer })).json(), { code: "mail_off" });
  assert.deepEqual(mailer.sent, []);
  ownerEnv();
  delete process.env.MAIL_OWNER_TO;
  mailer = fakeMailer();
  assert.deepEqual(await (await cron(cronReq(), { store: fakeStore(), mailer })).json(), { code: "mail_off" });
  assert.deepEqual(mailer.sent, []);
  ownerEnv();
  assert.deepEqual(await (await cron(cronReq(), { store: fakeStore(), mailer: null })).json(), { code: "mail_off" });
});

test("cron: the owner mail needs no store and falls back to the common tip when the store fails", async () => {
  ownerEnv();
  let mailer = fakeMailer();
  assert.equal((await cron(cronReq(), { store: null, mailer, now: () => MONDAY })).status, 200);
  assert.equal(mailer.sent.length, 1);
  assert.ok(!mailer.sent[0].text.includes("답변 원문"));
  mailer = fakeMailer();
  const broken = { ...fakeStore(), get: async () => { throw new Error("down"); }, put: async () => { throw new Error("down"); } };
  assert.equal((await cron(cronReq(), { store: broken, mailer, now: () => MONDAY })).status, 200, "a store outage neither blocks the mail nor fails the run");
  assert.equal(mailer.sent.length, 1);
});

test("cron: a failed owner send is a 502 with counts only in the log, and is recorded in mail:last", async (t) => {
  ownerEnv();
  const store = fakeStore();
  const logged = t.mock.method(console, "error", () => {});
  const res = await cron(cronReq(), { store, mailer: { send: async () => { throw new Error("mail 500"); } }, now: () => MONDAY });
  assert.equal(res.status, 502);
  assert.deepEqual(await res.json(), { sent: 0, failed: 1 });
  assert.deepEqual(store.kv.get("mail:last"), { date: "2026-11-16", sent: 0, failed: 1, deduped: 0, skipped: 0 });
  const line = logged.mock.calls.map((c) => c.arguments.join(" ")).join("\n");
  assert.match(line, /"failed":1/);
  assert.ok(!line.includes(OWNER) && !line.includes("example.com"));
});

test("cron: a corrupted subscriber row or a failing store.all does not stop the rest", async () => {
  env();
  const store = fakeStore(), mailer = fakeMailer();
  await store.set("bad", null);
  await store.set("numeric", { email: 7, lang: "ko" });
  await store.set(subscriberId("a@b.co", SECRET), { email: "a@b.co", lang: "ko" });
  const res = await cron(cronReq(), { store, mailer, now: () => MONDAY });
  assert.equal(res.status, 200);
  assert.deepEqual(mailer.sent.map((m) => m.to), ["a@b.co"]);
  assert.equal(mailer.sent[0].idempotencyKey, `tip/2026-11-16/${subscriberId("a@b.co", SECRET)}`);
  assert.equal(store.kv.get("mail:last").skipped, 2);

  ownerEnv();
  process.env.MAIL_PUBLIC = "1";
  const owner = fakeMailer();
  const res2 = await cron(cronReq(), { store: { ...fakeStore(), all: async () => { throw new Error("down"); } }, mailer: owner, now: () => MONDAY });
  assert.equal(res2.status, 502, "subscribers could not be read");
  assert.deepEqual(owner.sent.map((m) => m.to), [OWNER], "the owner mail still went out");
});

test("cron: ?date= pins the tip and the key; a malformed or impossible date is a 400 and sends nothing", async () => {
  ownerEnv();
  const mailer = fakeMailer();
  assert.equal((await cron(cronReq("?date=2026-11-16"), { store: fakeStore(), mailer, now: () => new Date("2026-12-25T00:00:00Z") })).status, 200);
  assert.equal(mailer.sent[0].idempotencyKey, "tip/2026-11-16/owner");
  assert.match(mailer.sent[0].subject, /11\/16/);
  for (const bad of ["2026-11-1", "2026-02-30", "2026-13-01", "20261116", "x", "", "1969-12-31", "0000-01-01"]) {
    const m = fakeMailer();
    const res = await cron(cronReq(`?date=${bad}`), { store: fakeStore(), mailer: m });
    assert.equal(res.status, 400, bad);
    assert.deepEqual(await res.json(), { code: "bad_request" });
    assert.deepEqual(m.sent, []);
  }
  assert.equal((await cron(new Request("http://x/api/cron/daily?date=2026-11-16"), { store: fakeStore(), mailer })).status, 401, "CRON_SECRET still required");
});

test("owner tip: §5 layout in the stored language, weak block, Monday checkpoint matching job_tags", () => {
  const { subject, text } = ownerTip(pack, MONDAY, WEAK, "https://app.example");
  assert.match(subject, /11\/16/);
  const i = tipIndex(MONDAY);
  assert.ok(text.includes(pack.daily_questions[i % pack.daily_questions.length]));
  for (const s of ["■ 오늘의 질문", "■ 4문형으로 답해 보기", "1. 질문 확인 — ", "4. 맺음 — ", "■ 최근 12회 답변에서 자주 나온 것", "자주 빠지는 단계: 근거 하나 3회", "질문에 답하지 않음: 2회", "※답변 원문은 저장하지 않습니다.", "■ 오늘의 표현", "■ 이번 주 확인 포인트", "▶ 연습하러 가기: https://app.example"]) assert.ok(text.includes(s), s);
  assert.ok(text.includes(pack.research.checkpoint_templates.find((c) => c.tags?.includes("pm")).text), "the job tag's checkpoint");
  assert.ok(!text.includes("결론 1회"), "a step missed once is not frequent");
  const ja = ownerTip(pack, MONDAY, { ...WEAK, lang: "ja" }).text;
  for (const s of ["■ 今日の質問", "1. 復唱 — ", "■ 直近12回で多かったもの", "抜けやすい段階: 基準・数字 3回", "※回答の本文は保存していません。", "■ 今日の表現"]) assert.ok(ja.includes(s), s);
  const en = ownerTip(pack, MONDAY, { ...WEAK, lang: "en" }).text;
  assert.ok(en.includes("■ Today's question") && en.includes("1. Restate — ") && !/[가-힣]/.test(en));
});

test("owner tip: TOP3 of rules seen 2+ times rotate by date; expression rules show before/after, structure rules do not", () => {
  const days = [0, 1, 2].map((d) => ownerTip(pack, new Date(MONDAY.getTime() + d * 86400000), WEAK).text);
  const rule = (id) => pack.correction_rules.find((r) => r.id === id);
  const shown = (t) => ["「ちゃんと」 4회", "「透過」 3회", "「根拠が複数並ぶ」 2회"].filter((l) => t.includes(l));
  for (const t of days) assert.equal(shown(t).length, 1, t);
  assert.equal(new Set(days.map((t) => shown(t)[0])).size, 3, "all three come round");
  for (const t of days) assert.ok(!t.includes("なんか」"), "a rule seen once never leads");
  const chanto = days.find((t) => t.includes("「ちゃんと」"));
  assert.ok(chanto.includes(`  ${rule("del-chanto").example_before}\n  → ${rule("del-chanto").example_after}`));
  const structure = days.find((t) => t.includes("「根拠が複数並ぶ」"));
  assert.ok(!structure.includes(rule("str-number").example_before));
  const four = ownerTip(pack, MONDAY, { ...WEAK, rules: { ...WEAK.rules, "del-nanka": 2, "del-chotto": 5 } }).text;
  assert.ok(!four.includes("「なんか」"), "the fourth rule is outside the TOP3 on every date");
});

test("owner tip: no data is the common tip; no internal id on any date in any language; visa rule never shown", () => {
  const plain = ownerTip(pack, MONDAY, null);
  assert.ok(plain.text.includes("■ 오늘의 질문") && plain.text.includes("■ 오늘의 표현"), "no data → ko common tip");
  assert.ok(!plain.text.includes("답변 원문") && !plain.text.includes("- - -"));
  assert.ok(!ownerTip(pack, MONDAY, { rules: {}, steps: {}, no: 0, attempts: 3, lang: "ko", job_tags: [] }).text.includes("- - -"), "nothing to say → no block");
  assert.ok(plain.text.includes("■ 이번 주 확인 포인트"), "Monday, no tags → a general checkpoint");
  assert.ok(!ownerTip(pack, new Date("2026-11-17T00:00:00Z"), null).text.includes("■ 이번 주 확인 포인트"), "Tuesday → none");
  const expressions = pack.correction_rules.filter((r) => r.token);
  assert.equal(expressions.length, 16);
  const seen = new Set();
  const visa = { ...WEAK, rules: { "str-visa-facts": 9 } };
  for (const lang of ["ko", "en", "ja"]) for (let d = 0; d < 130; d++) {
    const { text } = ownerTip(pack, new Date(MONDAY.getTime() + d * 86400000), { ...visa, lang }, "https://app.example");
    assert.ok(!text.includes("【"), text);
    for (const r of pack.correction_rules) assert.ok(!text.includes(r.id), r.id);
    assert.ok(!text.includes("ビザは大丈夫です"), "the visa rule's example is not mailed");
    for (const r of expressions) if (text.includes(`${r.example_before}\n→ ${r.example_after}`)) seen.add(r.id);
  }
  assert.equal(seen.size, 16, "every expression comes round");
});

test("weak API: needs the access code and the owner token; a short configured token disables it", async () => {
  ownerEnv();
  const store = fakeStore();
  const denied = async (req) => { const res = await subscribe(req, { store }); assert.equal(res.status, 401); assert.deepEqual(await res.json(), { code: "access_denied" }); };
  await denied(weakReq(WEAK, { code: "bad" }));
  await denied(weakReq(WEAK, { owner: "wrong-token-0123456789-abc" }));
  await denied(weakReq(WEAK, { owner: "short" }));
  process.env.MAIL_OWNER_TOKEN = "x".repeat(19);
  await denied(weakReq(WEAK, { owner: "x".repeat(19) }));
  delete process.env.MAIL_OWNER_TOKEN;
  await denied(weakReq(WEAK, { owner: "" }));
  assert.equal(store.kv.size, 0);
});

test("weak API: stores the allowlisted counts under weak:owner by overwriting; works with MAIL_PUBLIC off", async () => {
  ownerEnv();
  const store = fakeStore();
  const now = () => new Date("2026-11-05T01:00:00Z");
  const res = await subscribe(weakReq({ ...WEAK, rules: { "del-chanto": 1, "del-nanka": 9 } }), { store, now });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal((await subscribe(weakReq(WEAK), { store, now })).status, 200);
  assert.deepEqual(store.kv.get("weak:owner"), { ...WEAK, updated_at: "2026-11-05T01:00:00.000Z" });
  assert.equal(store.m.size, 0, "never touches the subscribers");
  assert.equal((await subscribe(weakReq(WEAK), { store: null })).status, 503);
  assert.equal((await subscribe(weakReq(WEAK), { store: { put: async () => { throw new Error("down"); } } })).status, 502);
});

test("weak API: anything outside the allowlist is a 400 and nothing is stored", async () => {
  ownerEnv();
  const store = fakeStore();
  const cases = {
    "not JSON": "{",
    "array body": [],
    "extra top-level key": { ...WEAK, answer: "x" },
    "company": { ...WEAK, company: "x" },
    "missing key": { rules: {}, steps: {}, no: 0, attempts: 0, lang: "ko" },
    "visa rule": { ...WEAK, rules: { "str-visa-facts": 1 } },
    "unknown rule": { ...WEAK, rules: { nope: 1 } },
    "proto key": `{"rules":{"__proto__":1},"steps":{},"no":0,"attempts":0,"lang":"ko","job_tags":[]}`,
    "optional step": { ...WEAK, steps: { fukusho: 1 } },
    "unknown step": { ...WEAK, steps: { nope: 1 } },
    "rules array": { ...WEAK, rules: [] },
    "negative": { ...WEAK, no: -1 },
    "too big": { ...WEAK, attempts: 1000 },
    "float": { ...WEAK, rules: { "del-chanto": 1.5 } },
    "string count": { ...WEAK, steps: { kijun: "3" } },
    "bad lang": { ...WEAK, lang: "xx" },
    "bad tag": { ...WEAK, job_tags: ["ceo"] },
    "tags not array": { ...WEAK, job_tags: "pm" },
  };
  for (const [name, body] of Object.entries(cases)) {
    const res = await subscribe(weakReq(body), { store });
    assert.equal(res.status, 400, name);
    assert.deepEqual(await res.json(), { code: "bad_request" }, name);
  }
  assert.equal(store.kv.size, 0);
});

test("weak API: an owner practising fast is not stopped by the signup limit", async () => {
  ownerEnv();
  const store = fakeStore();
  const req = () => new Request("http://x/api/subscribe?action=weak", { method: "POST", headers: { "x-access-code": "c0de", "x-mail-owner": TOKEN, "x-forwarded-for": "5.5.5.5" }, body: JSON.stringify(WEAK) });
  for (let n = 0; n < 12; n++) assert.equal((await subscribe(req(), { store })).status, 200, `call ${n}`);
});

test("makeStore: a corrupted row comes back as null instead of failing the whole read; plain keys use SET EX and GET", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (_, init) => {
    const args = JSON.parse(init.body);
    calls.push({ args, signal: init.signal });
    const result = args[0] === "HGETALL" ? ["a", "{broken", "b", '{"email":"b@c.co"}'] : args[0] === "GET" ? (args[1] === "bad" ? "{broken" : '{"x":1}') : "OK";
    return Response.json({ result });
  });
  const store = makeStore({ KV_REST_API_URL: "http://kv.example", KV_REST_API_TOKEN: "t" });
  assert.deepEqual(await store.all(), [["a", null], ["b", { email: "b@c.co" }]]);
  assert.deepEqual(await store.get("k"), { x: 1 });
  await store.put("k", { x: 1 }, 60);
  assert.deepEqual(calls.at(-1).args, ["SET", "k", '{"x":1}', "EX", 60]);
  for (const c of calls) assert.ok(c.signal instanceof AbortSignal, "every store call has a timeout");
});

test("makeMailer: sends the Idempotency-Key with a timeout; a replay with a changed body counts as already sent, a concurrent one as a failure", async (t) => {
  let reply = () => Response.json({ id: "m1" });
  const seen = [];
  t.mock.method(globalThis, "fetch", async (url, init) => { seen.push({ url, init }); return reply(); });
  const timeout = t.mock.method(AbortSignal, "timeout");
  const mailer = makeMailer({ RESEND_API_KEY: "k", MAIL_FROM: "x@example.com" });
  assert.deepEqual(await mailer.send({ to: OWNER, subject: "s", text: "t", idempotencyKey: "tip/2026-11-16/owner" }), { id: "m1" });
  assert.equal(seen[0].init.headers["idempotency-key"], "tip/2026-11-16/owner");
  assert.ok(seen[0].init.signal instanceof AbortSignal);
  assert.equal(timeout.mock.calls[0].arguments[0], 10000);
  reply = () => Response.json({ name: "invalid_idempotent_request" }, { status: 409 });
  assert.deepEqual(await mailer.send({ to: OWNER, subject: "s", text: "t2", idempotencyKey: "tip/2026-11-16/owner" }), { deduped: true });
  reply = () => Response.json({ name: "concurrent_idempotent_requests" }, { status: 409 });
  await assert.rejects(mailer.send({ to: OWNER, subject: "s", text: "t", idempotencyKey: "k" }), /mail 409/);
});

test("cron: a replay with a changed body is deduped, not a failure", async () => {
  ownerEnv();
  const store = fakeStore();
  const res = await cron(cronReq(), { store, mailer: { send: async () => ({ deduped: true }) }, now: () => MONDAY });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { sent: 0, failed: 0 });
  assert.equal(store.kv.get("mail:last").deduped, 1);
});

// Browser side, pure with storage passed in.
const memory = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k) };
};
const fakeHistory = () => ({ calls: [], replaceState(...a) { this.calls.push(a); } });
const STEPS = pack.answer_structure.steps;
const reviewOf = (over = {}) => ({ answers_question: "yes", steps: { fukusho: { present: false }, ketsuron: { present: true }, kijun: { present: false }, sentakushi: { present: true } }, corrections: [{ rule_id: "del-chanto", before: "秘密の答え", after: "x" }, { rule_id: "str-visa-facts", before: "ビザ", after: "y" }], ...over });

test("claimOwner: stores a valid token, always strips the hash, ignores other hashes", () => {
  const loc = (hash) => ({ hash, pathname: "/", search: "?a=1" });
  let s = memory(), h = fakeHistory();
  claimOwner(s, loc(`#owner=${TOKEN}`), h);
  assert.equal(s.m.get("mensetsu-owner"), TOKEN);
  assert.deepEqual(h.calls, [[null, "", "/?a=1"]]);
  s = memory(), h = fakeHistory();
  claimOwner(s, loc("#owner=short"), h);
  assert.equal(s.m.size, 0, "a token the server would refuse is not kept");
  assert.equal(h.calls.length, 1, "but it does not stay in the address bar");
  s = memory(), h = fakeHistory();
  claimOwner(s, loc("#other"), h);
  assert.equal(s.m.size, 0);
  assert.equal(h.calls.length, 0);
  h = fakeHistory();
  claimOwner(null, loc(`#owner=${TOKEN}`), h);
  assert.equal(h.calls.length, 1, "blocked storage does not throw");
});

test("noteHabit: keeps the last 30, required missed steps only, never the visa rule or any text", () => {
  const s = memory();
  noteHabit(s, reviewOf(), STEPS);
  assert.deepEqual(JSON.parse(s.m.get("mensetsu-habits")), [{ r: ["del-chanto"], s: ["kijun"], a: true }]);
  assert.ok(!s.m.get("mensetsu-habits").includes("秘密"));
  for (let n = 0; n < 40; n++) noteHabit(s, reviewOf({ answers_question: n === 39 ? "no" : "unclear" }), STEPS);
  const list = JSON.parse(s.m.get("mensetsu-habits"));
  assert.equal(list.length, 30);
  assert.equal(list.at(-1).a, false, "only a plain no counts as not answering");
  assert.equal(list.at(-2).a, true);
  const broken = memory({ "mensetsu-habits": "{broken" });
  assert.equal(noteHabit(broken, reviewOf(), STEPS).length, 1, "broken leftovers start over");
  assert.equal(noteHabit(memory({ "mensetsu-habits": "[null,3]" }), reviewOf(), STEPS).length, 1, "so do broken entries");
  assert.equal(noteHabit(null, reviewOf(), STEPS).length, 1, "blocked storage does not throw");
});

test("weakSummary: the counts the server allowlist accepts, and nothing else", async () => {
  ownerEnv();
  const list = [{ r: ["del-chanto", "del-chanto"], s: ["kijun"], a: true }, { r: ["del-chanto"], s: ["kijun", "ketsuron"], a: false }];
  const sum = weakSummary(list, "ja", ["pm"]);
  assert.deepEqual(sum, { rules: { "del-chanto": 3 }, steps: { kijun: 2, ketsuron: 1 }, no: 1, attempts: 2, lang: "ja", job_tags: ["pm"] });
  assert.equal(weakSummary([{ r: Array(1200).fill("del-chanto"), s: [], a: true }], "ko", []).rules["del-chanto"], 999, "stays inside what the server accepts");
  assert.equal((await subscribe(weakReq(sum), { store: fakeStore() })).status, 200);
});

test("deploy config: /api/subscribe can read the pack", () => {
  assert.equal(JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8")).functions["api/subscribe.js"]?.includeFiles, "packs/**");
});
