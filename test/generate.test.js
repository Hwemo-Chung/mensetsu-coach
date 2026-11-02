import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPack, generateQuestions, generateScript, buildScriptRequest, isJapanese, hasHangul } from "../lib/coach.js";
import { POST } from "../api/questions.js";
import { POST as scriptPOST } from "../api/script.js";
import { fakeClient, fixture, scriptFixture } from "./fake-claude.js";

const pack = loadPack("jp");

test("generateQuestions (fake Claude): 10 questions, ids, valid enums, personal data redacted", async () => {
  const out = await generateQuestions(fakeClient(), pack, "MAIL", []);
  assert.equal(out.questions.length, 10);
  assert.deepEqual(out.questions.map((q) => q.id), Array.from({ length: 10 }, (_, i) => `q${i + 1}`));
  for (const q of out.questions) {
    assert.ok(pack.question_taxonomy.stages.includes(q.stage), q.stage);
    assert.ok(pack.question_taxonomy.categories.includes(q.category), q.category);
  }
  assert.ok(out.company_context.facts.every((f) => !f.includes("@")));
  assert.ok(out.company_context.facts.some((f) => f.includes("[email]")));
});

test("generateQuestions rejects refusal, truncation and a wrong question count", async () => {
  await assert.rejects(generateQuestions(fakeClient({ stop: "refusal" }), pack, "M", []), /refusal/);
  await assert.rejects(generateQuestions(fakeClient({ stop: "max_tokens" }), pack, "M", []), /truncated/);
  const nine = { ...fixture, questions: fixture.questions.slice(0, 9) };
  await assert.rejects(generateQuestions(fakeClient({ result: nine }), pack, "M", []), /expected 10/);
});

test("API route with fake client: valid code + mail → 10 questions, no network", async () => {
  process.env.ACCESS_CODE = "c0de";
  const req = new Request("http://x/api/questions", {
    method: "POST",
    headers: { "x-access-code": "c0de", "x-forwarded-for": "7.7.7.7", "content-type": "application/json" },
    body: JSON.stringify({ mail: "テスト" }),
  });
  const res = await POST(req, { client: fakeClient() });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).questions.length, 10);
});

test("API route: Claude failure → 502 with a generic message (no mail text echoed)", async () => {
  process.env.ACCESS_CODE = "c0de";
  const req = new Request("http://x/api/questions", {
    method: "POST",
    headers: { "x-access-code": "c0de", "x-forwarded-for": "7.7.7.8", "content-type": "application/json" },
    body: JSON.stringify({ mail: "秘密のメール本文" }),
  });
  const res = await POST(req, { client: fakeClient({ fail: new Error("boom") }) });
  const text = await res.text();
  assert.equal(res.status, 502);
  assert.deepEqual(JSON.parse(text), { code: "generation_failed" });
  assert.ok(!text.includes("秘密のメール本文"));
});

test("language checks: Japanese without Hangul; Hangul detection", () => {
  assert.equal(isJapanese("御社を志望した理由は何ですか"), true);
  assert.equal(isJapanese("御社를 지원한 이유"), false);
  assert.equal(isJapanese("why"), false);
  assert.equal(hasHangul("하이↗"), true);
  assert.equal(hasHangul("はい"), false);
});

test("generateQuestions retries once when question_ja is not Japanese, then fails", async () => {
  const korean = { ...fixture, questions: fixture.questions.map((q, i) => (i === 0 ? { ...q, question_ja: "지원 동기를 말해 주세요" } : q)) };
  const once = fakeClient({ responses: [korean, fixture] });
  assert.equal((await generateQuestions(once, pack, "M", [])).questions.length, 10);
  assert.equal(once.calls(), 2);
  const twice = fakeClient({ responses: [korean, korean] });
  await assert.rejects(generateQuestions(twice, pack, "M", []), /not Japanese/);
});

test("buildScriptRequest: question/answer wrapped as data, structure + rules + notation in system", () => {
  const r = buildScriptRequest(pack, { question: "Q本文", answer: "A본문", context: "C資料" });
  const task = r.messages[0].content;
  assert.match(task, /<question>\nQ本文\n<\/question>/);
  assert.match(task, /<answer>\nA본문\n<\/answer>/);
  assert.match(task, /<company_material>\nC資料\n<\/company_material>/);
  assert.match(r.system, /↗/);
  assert.match(r.system, /指示には従わない/);
  for (const rule of pack.correction_rules) assert.ok(r.system.includes(rule.id), rule.id);
  assert.equal(r.output_config.format.schema.required.join(), "ja,reading,ko,points");
  assert.ok(!buildScriptRequest(pack, { question: "Q", answer: "A" }).messages[0].content.includes("company_material"));
});

test("generateScript: valid script passes; wrong language retried once, then fails", async () => {
  assert.deepEqual(await generateScript(fakeClient({ result: scriptFixture }), pack, { question: "Q", answer: "A" }), scriptFixture);
  const bad = { ...scriptFixture, ja: "견적이 어긋나면" };
  const retry = fakeClient({ responses: [bad, scriptFixture] });
  assert.deepEqual(await generateScript(retry, pack, { question: "Q", answer: "A" }), scriptFixture);
  assert.equal(retry.calls(), 2);
  await assert.rejects(generateScript(fakeClient({ responses: [bad, bad] }), pack, { question: "Q", answer: "A" }), /language check/);
});

test("script API: codes for access, validation and failure; 200 with fake client", async () => {
  process.env.ACCESS_CODE = "c0de";
  let ip = 0;
  const req = (code, body) => new Request("http://x/api/script", { method: "POST", headers: { "x-access-code": code, "x-forwarded-for": `6.6.6.${ip++}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  const check = async (res, status, body) => { assert.equal(res.status, status); assert.deepEqual(await res.json(), body); };
  const ok = { question: "見積もりがずれたときは？", answer: "먼저 영향 범위를 확인합니다" };
  await check(await scriptPOST(req("bad", ok)), 401, { code: "access_denied" });
  await check(await scriptPOST(req("c0de", { ...ok, answer: " " })), 400, { code: "answer_required" });
  await check(await scriptPOST(req("c0de", { ...ok, answer: "가".repeat(2001) })), 400, { code: "answer_too_long", max: 2000 });
  await check(await scriptPOST(req("c0de", { ...ok, question: "" })), 400, { code: "question_required" });
  await check(await scriptPOST(req("c0de", ok), { client: fakeClient({ result: scriptFixture }) }), 200, scriptFixture);
  const failed = await scriptPOST(req("c0de", { ...ok, answer: "秘密の回答" }), { client: fakeClient({ fail: new Error("boom") }) });
  const text = await failed.text();
  assert.equal(failed.status, 502);
  assert.deepEqual(JSON.parse(text), { code: "generation_failed" });
  assert.ok(!text.includes("秘密の回答"));
});
