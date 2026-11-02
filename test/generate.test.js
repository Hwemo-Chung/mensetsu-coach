import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPack, generateQuestions, generateScript, buildScriptRequest, buildQuestionRequest, isJapanese, hasHangul, EXPLAIN_LANGS, maskInput } from "../lib/coach.js";
import { POST } from "../api/questions.js";
import { POST as scriptPOST } from "../api/script.js";
import { fakeClient, fixture, scriptFixture } from "./fake-claude.js";
import { readFileSync } from "node:fs";

const MAIL = readFileSync(new URL("../samples/agent-mail-sample.txt", import.meta.url), "utf8");

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
  assert.equal(r.output_config.format.schema.required.join(), "ja,reading,translation,points");
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

const enScript = { ja: scriptFixture.ja, reading: "hai, /mitsumori ga 《zureta》 baai wa↘", translation: "Yes, when an estimate slips, I first check the impact.", points: ["Lower the end of the first sentence.", "Stress the numbers."] };
const jaScript = { ja: scriptFixture.ja, reading: "はい、/みつもりが 《ずれた》 ばあいは↘", translation: "見積もりのずれは、影響を確認してすぐ共有する。", points: ["最初の文は語尾を下げる。", "数字ははっきり言う。"] };

test("explain languages: ko, en, ja are registered; prompts name the language and its reading script", () => {
  assert.deepEqual(Object.keys(EXPLAIN_LANGS).sort(), ["en", "ja", "ko"]);
  for (const lang of Object.keys(EXPLAIN_LANGS)) {
    const L = EXPLAIN_LANGS[lang];
    const s = buildScriptRequest(pack, { question: "Q", answer: "A", lang });
    assert.ok(s.system.includes(L.name), `${lang} script system names ${L.name}`);
    assert.ok(s.system.includes(L.reading), `${lang} script system names reading ${L.reading}`);
    const q = buildQuestionRequest(pack, "M", [], lang);
    assert.ok(q.system.includes(L.name) || q.messages[0].content.includes(L.name), `${lang} question request names ${L.name}`);
  }
  assert.ok(!buildScriptRequest(pack, { question: "Q", answer: "A", lang: "en" }).system.includes("韓国語"));
});

test("generateScript gate follows the language: en needs romaji/English, ja needs kana/Japanese", async () => {
  assert.deepEqual(await generateScript(fakeClient({ result: enScript }), pack, { question: "Q", answer: "A", lang: "en" }), enScript);
  assert.deepEqual(await generateScript(fakeClient({ result: jaScript }), pack, { question: "Q", answer: "A", lang: "ja" }), jaScript);
  // Korean output when English was asked → retried, then rejected
  await assert.rejects(generateScript(fakeClient({ responses: [scriptFixture, scriptFixture] }), pack, { question: "Q", answer: "A", lang: "en" }), /language check/);
  // kanji left in a kana reading → rejected
  const kanji = { ...jaScript, reading: "見積もりが 《ずれた》" };
  await assert.rejects(generateScript(fakeClient({ responses: [kanji, kanji] }), pack, { question: "Q", answer: "A", lang: "ja" }), /language check/);
});

test("generateQuestions gate: question_tr must be in the explain language", async () => {
  const en = { ...fixture, questions: fixture.questions.map((q) => ({ ...q, question_tr: "Tell me about your experience.", basis: "From the posting." })) };
  assert.equal((await generateQuestions(fakeClient({ result: en }), pack, "M", [], "en")).questions.length, 10);
  await assert.rejects(generateQuestions(fakeClient({ responses: [fixture, fixture] }), pack, "M", [], "en"), /not in en/);
});

test("APIs reject an unknown language with a code, default to ko when omitted", async () => {
  process.env.ACCESS_CODE = "c0de";
  let ip = 0;
  const req = (path, body) => new Request(`http://x${path}`, { method: "POST", headers: { "x-access-code": "c0de", "x-forwarded-for": `5.5.5.${ip++}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  const s = await scriptPOST(req("/api/script", { question: "Q", answer: "A", lang: "xx" }));
  assert.equal(s.status, 400);
  assert.deepEqual(await s.json(), { code: "lang_unsupported" });
  const q = await POST(req("/api/questions", { mail: "M", lang: "xx" }));
  assert.equal(q.status, 400);
  assert.deepEqual(await q.json(), { code: "lang_unsupported" });
  assert.equal((await scriptPOST(req("/api/script", { question: "Q", answer: "A", lang: "en" }), { client: fakeClient({ result: enScript }) })).status, 200);
  assert.equal((await POST(req("/api/questions", { mail: "M" }), { client: fakeClient() })).status, 200);
});

const generic = { ...fixture, questions: fixture.questions.map((q, i) => (i < 5 ? q : { ...q, refs: ["存在しない語句"] })) };

test("F2 specificity gate: counts only refs found in both the question and the material", async () => {
  const out = await generateQuestions(fakeClient(), pack, MAIL, []);
  assert.deepEqual(out.specificity, { referenced: 10, required: 6, passed: true });
  // a ref the model claims but the material does not contain does not count
  const lie = { ...fixture, questions: fixture.questions.map((q) => ({ ...q, refs: ["ブロックチェーン"] })) };
  const c = fakeClient({ responses: [lie, lie] });
  const low = await generateQuestions(c, pack, MAIL, []);
  assert.deepEqual(low.specificity, { referenced: 0, required: 6, passed: false });
  assert.equal(c.calls(), 2, "regenerates once when below 6");
});

test("F2 specificity gate: 5/10 → regenerate, keep the better attempt", async () => {
  const c = fakeClient({ responses: [generic, fixture] });
  const out = await generateQuestions(c, pack, MAIL, []);
  assert.equal(c.calls(), 2);
  assert.equal(out.specificity.referenced, 10);
  const worse = fakeClient({ responses: [generic, { ...fixture, questions: fixture.questions.map((q) => ({ ...q, refs: [] })) }] });
  assert.equal((await generateQuestions(worse, pack, MAIL, [])).specificity.referenced, 5, "first attempt was better");
});

test("F2 prompt asks for material phrases in refs", () => {
  const r = buildQuestionRequest(pack, MAIL, []);
  assert.ok(r.output_config.format.schema.properties.questions.items.required.includes("refs"));
  assert.match(r.messages[0].content, /refs/);
  assert.match(r.messages[0].content, /6/);
});

test("L9 maskInput: email, phone, postal code and a salutation-only name line are masked; company and role stay", () => {
  const raw = "テスト太郎様\nいつもお世話になっております。\n連絡先: taro.test@example.co.jp / 090-1234-5678 / +81 3 1234 5678\n〒123-4567 東京都\n株式会社サンプルロジ（仮）様より、エンジニアリングマネージャーの件です。\nPython / AWS、5名の開発チーム";
  const m = maskInput(raw);
  for (const leak of ["テスト太郎", "taro.test@example.co.jp", "090-1234-5678", "+81 3 1234 5678", "123-4567"]) assert.ok(!m.includes(leak), leak);
  for (const keep of ["株式会社サンプルロジ（仮）様より", "エンジニアリングマネージャー", "Python / AWS", "5名の開発チーム"]) assert.ok(m.includes(keep), keep);
  assert.match(m, /\[氏名\]様/);
});

test("L9 questions API: personal data is masked BEFORE it reaches Claude", async () => {
  process.env.ACCESS_CODE = "c0de";
  const client = fakeClient();
  const req = new Request("http://x/api/questions", { method: "POST", headers: { "x-access-code": "c0de", "x-forwarded-for": "4.4.4.4", "content-type": "application/json" },
    body: JSON.stringify({ mail: "テスト花子様\n担当: hanako@example.jp 080-9999-0000\n" + MAIL }) });
  assert.equal((await POST(req, { client })).status, 200);
  const sent = JSON.stringify(client.requests);
  for (const leak of ["テスト花子", "hanako@example.jp", "080-9999-0000"]) assert.ok(!sent.includes(leak), leak);
  assert.ok(sent.includes("需要予測"), "business content still sent");
});

test("L9 script API: personal data in the answer is masked before Claude", async () => {
  process.env.ACCESS_CODE = "c0de";
  const client = fakeClient({ result: scriptFixture });
  const req = new Request("http://x/api/script", { method: "POST", headers: { "x-access-code": "c0de", "x-forwarded-for": "4.4.4.5", "content-type": "application/json" },
    body: JSON.stringify({ question: "Q", answer: "제 메일은 me@example.com, 전화 010-1234-5678입니다" }) });
  assert.equal((await scriptPOST(req, { client })).status, 200);
  const sent = JSON.stringify(client.requests);
  for (const leak of ["me@example.com", "010-1234-5678"]) assert.ok(!sent.includes(leak), leak);
});
