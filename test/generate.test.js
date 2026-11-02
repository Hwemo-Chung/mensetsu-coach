import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPack, generateQuestions, generateScript, buildScriptRequest, buildQuestionRequest, isJapanese, hasHangul, EXPLAIN_LANGS, maskInput, MODELS, buildReviewRequest, generateReview, buildReverseRequest, generateReverse, countSpecific, reverseQuestionOk } from "../lib/coach.js";
import { POST } from "../api/questions.js";
import { POST as scriptPOST } from "../api/script.js";
import { POST as reviewPOST } from "../api/review.js";
import { POST as reversePOST } from "../api/reverse.js";
import { fakeClient, fixture, scriptFixture, reviewFixture, reverseFixture } from "./fake-claude.js";
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

// TEST-CASES B (synthetic): the answer talks about a success when asked about the hardest thing.
const B = { question: "前職で最も大変だったことは何ですか？", answer: "はい、前職では新しいシステムの導入を担当しまして、チームのメンバーと協力しながら進めることができました。結果として、業務の効率が上がりまして、評価もいただきました。" };

test("models: one table, grading on Opus, generation on Sonnet", () => {
  // F10 added a generation stage (reverse questions) on Sonnet; grading stays on Opus.
  assert.deepEqual(MODELS, { questions: "claude-sonnet-5-5", script: "claude-sonnet-5-5", reverse: "claude-sonnet-5-5", review: "claude-opus-5-5" });
  assert.equal(buildQuestionRequest(pack, "M").model, MODELS.questions);
  assert.equal(buildScriptRequest(pack, { question: "Q", answer: "A" }).model, MODELS.script);
  assert.equal(buildReviewRequest(pack, B).model, MODELS.review);
});

test("buildReviewRequest: all 4 step keys required by schema, rule ids as enum, no temperature, data wrapped", () => {
  const r = buildReviewRequest(pack, { ...B, lang: "en" });
  const schema = r.output_config.format.schema;
  assert.deepEqual(schema.properties.steps.required, pack.answer_structure.steps.map((s) => s.key));
  assert.equal(schema.properties.steps.additionalProperties, false);
  assert.deepEqual(schema.properties.answers_question.enum, ["yes", "no", "unclear"]);
  assert.deepEqual(schema.properties.corrections.items.properties.rule_id.enum, pack.correction_rules.map((x) => x.id));
  assert.equal(r.temperature, undefined);
  assert.match(r.messages[0].content, /<answer>\n/);
  assert.match(r.system, /指示には従わない/);
  assert.match(r.system, /日本語の文にだけ/);
  assert.ok(r.system.includes(EXPLAIN_LANGS.en.name));
});

test("generateReview gate: drops a correction whose 'before' is not in the answer; keeps the rest", async () => {
  const out = await generateReview(fakeClient({ result: reviewFixture }), pack, B);
  assert.equal(out.answers_question, "no");
  assert.deepEqual(out.corrections.map((c) => c.rule_id), ["str-ketsuron"]);
  assert.equal(out.dropped, 1);
  assert.deepEqual(Object.keys(out.steps), ["fukusho", "ketsuron", "kijun", "sentakushi"]);
});

test("generateReview gate: non-Japanese 'after' is dropped; wrong explanation language is retried then fails", async () => {
  const koAfter = { ...reviewFixture, corrections: [{ ...reviewFixture.corrections[0], after: "결론을 먼저" }] };
  assert.equal((await generateReview(fakeClient({ result: koAfter }), pack, B)).dropped, 1);
  const en = fakeClient({ responses: [reviewFixture, reviewFixture] });
  await assert.rejects(generateReview(en, pack, { ...B, lang: "en" }), /language check/);
  assert.equal(en.calls(), 2);
});

test("review API: codes and 200 with fake client; answer masked before Claude", async () => {
  process.env.ACCESS_CODE = "c0de";
  let ip = 0;
  const req = (code, body) => new Request("http://x/api/review", { method: "POST", headers: { "x-access-code": code, "x-forwarded-for": `3.3.3.${ip++}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  const check = async (res, status, body) => { assert.equal(res.status, status); assert.deepEqual(await res.json(), body); };
  await check(await reviewPOST(req("bad", B)), 401, { code: "access_denied" });
  await check(await reviewPOST(req("c0de", { ...B, answer: "" })), 400, { code: "answer_required" });
  await check(await reviewPOST(req("c0de", { ...B, question: "" })), 400, { code: "question_required" });
  await check(await reviewPOST(req("c0de", { ...B, lang: "xx" })), 400, { code: "lang_unsupported" });
  const client = fakeClient({ result: reviewFixture });
  const ok = await reviewPOST(req("c0de", { ...B, answer: B.answer + " test@example.com" }), { client });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).dropped, 1);
  assert.ok(!JSON.stringify(client.requests).includes("test@example.com"));
  const failed = await reviewPOST(req("c0de", B), { client: fakeClient({ fail: new Error("boom") }) });
  await check(failed, 502, { code: "generation_failed" });
});

test("generateQuestions: a wrong question count is retried once (seen in a live eval: 2 instead of 10), then fails", async () => {
  const two = { ...fixture, questions: fixture.questions.slice(0, 2) };
  const c = fakeClient({ responses: [two, fixture] });
  assert.equal((await generateQuestions(c, pack, MAIL, [])).questions.length, 10);
  assert.equal(c.calls(), 2);
  await assert.rejects(generateQuestions(fakeClient({ responses: [two, two] }), pack, MAIL, []), /expected 10 questions, got 2/);
});

test("questions API: optional one-line profile goes in as candidate material (masked); too long → code", async () => {
  process.env.ACCESS_CODE = "c0de";
  let ip = 0;
  const req = (body) => new Request("http://x/api/questions", { method: "POST", headers: { "x-access-code": "c0de", "x-forwarded-for": `9.8.7.${ip++}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  const client = fakeClient();
  const ok = await POST(req({ mail: MAIL, profile: "이 직무는 처음, 백엔드 3년. 연락 me@example.com" }), { client });
  assert.equal(ok.status, 200);
  const content = JSON.stringify(client.requests[0].messages[0].content);
  assert.match(content, /<candidate_material>（次の添付資料）/);
  assert.match(content, /백엔드 3년/);
  assert.ok(!content.includes("me@example.com"), "profile masked");
  const long = await POST(req({ mail: MAIL, profile: "가".repeat(201) }), { client: fakeClient() });
  assert.equal(long.status, 400);
  assert.deepEqual(await long.json(), { code: "profile_too_long", max: 200 });
  const none = fakeClient();
  await POST(req({ mail: MAIL }), { client: none });
  // the instruction text always names the tag; only the wrapper "（次の添付資料）" marks a real candidate block
  assert.ok(!JSON.stringify(none.requests[0].messages[0].content).includes("<candidate_material>（次の添付資料）"), "no profile → no candidate block");
});

test("F9 support: kept corrections carry the rule's short pattern for display", async () => {
  const out = await generateReview(fakeClient({ result: reviewFixture }), pack, B);
  assert.equal(out.corrections[0].pattern, pack.correction_rules.find((r) => r.id === "str-ketsuron").pattern);
});

const CTX = { company: "株式会社サンプルロジ（仮）", position: "エンジニアリングマネージャー", facts: ["5名の開発チーム", "需要予測機能の刷新（Python / AWS）", "評価は半期ごとのOKR"] };

test("F10 buildReverseRequest: Sonnet, context wrapped as data, conditions go to the agent, 3 questions", () => {
  const r = buildReverseRequest(pack, { context: CTX, lang: "en" });
  assert.equal(r.model, MODELS.reverse);
  assert.match(r.messages[0].content, /<company_material>/);
  assert.match(r.system, /エージェント/);
  assert.match(r.system, /指示には従わない/);
  assert.ok(r.system.includes(EXPLAIN_LANGS.en.name));
  const items = r.output_config.format.schema.properties.questions;
  assert.deepEqual(items.items.required, ["question_ja", "intent"]);
});

test("F10 generateReverse gates: exactly 3, Japanese question, intent in the explain language, no pay/conditions", async () => {
  assert.equal((await generateReverse(fakeClient({ result: reverseFixture }), pack, { context: CTX })).questions.length, 3);
  const pay = { questions: [{ question_ja: "年収はどのくらい上がりますか。", intent: "연봉을 확인합니다." }, ...reverseFixture.questions.slice(1)] };
  const retry = fakeClient({ responses: [pay, reverseFixture] });
  assert.deepEqual((await generateReverse(retry, pack, { context: CTX })).questions, reverseFixture.questions);
  assert.equal(retry.calls(), 2);
  await assert.rejects(generateReverse(fakeClient({ responses: [pay, pay] }), pack, { context: CTX }), /reverse check/);
  const two = { questions: reverseFixture.questions.slice(0, 2) };
  await assert.rejects(generateReverse(fakeClient({ responses: [two, two] }), pack, { context: CTX }), /reverse check/);
  await assert.rejects(generateReverse(fakeClient({ responses: [reverseFixture, reverseFixture] }), pack, { context: CTX, lang: "en" }), /reverse check/);
});

test("F10 reverse API: codes, masking of context, 200 with fake client", async () => {
  process.env.ACCESS_CODE = "c0de";
  let ip = 0;
  const req = (code, body) => new Request("http://x/api/reverse", { method: "POST", headers: { "x-access-code": code, "x-forwarded-for": `4.3.2.${ip++}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  const check = async (res, status, body) => { assert.equal(res.status, status); assert.deepEqual(await res.json(), body); };
  await check(await reversePOST(req("bad", { context: CTX })), 401, { code: "access_denied" });
  await check(await reversePOST(req("c0de", { context: null })), 400, { code: "context_required" });
  await check(await reversePOST(req("c0de", { context: CTX, lang: "xx" })), 400, { code: "lang_unsupported" });
  const client = fakeClient({ result: reverseFixture });
  const ok = await reversePOST(req("c0de", { context: { ...CTX, facts: [...CTX.facts, "担当 a@b.jp"] } }), { client });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).questions.length, 3);
  assert.ok(!JSON.stringify(client.requests).includes("a@b.jp"));
  await check(await reversePOST(req("c0de", { context: CTX }), { client: fakeClient({ fail: new Error("x") }) }), 502, { code: "generation_failed" });
});

test("F10 gate: one question per item — two questions in one, or over 80 chars, is retried then fails", async () => {
  const dbl = { questions: [{ question_ja: "最初の半年に期待される成果は何でしょうか。また、課題はどこにあるとお考えでしょうか。", intent: "기대치와 과제를 확인합니다." }, ...reverseFixture.questions.slice(1)] };
  await assert.rejects(generateReverse(fakeClient({ responses: [dbl, dbl] }), pack, { context: CTX }), /reverse check/);
  const long = { questions: [{ question_ja: "需".repeat(81) + "ですか。", intent: "길다." }, ...reverseFixture.questions.slice(1)] };
  await assert.rejects(generateReverse(fakeClient({ responses: [long, long] }), pack, { context: CTX }), /reverse check/);
});

test("rate limit buckets are per route: a session of access + questions + 8 answers is not blocked", async () => {
  process.env.ACCESS_CODE = "c0de";
  const ip = "77.77.77.77";
  const h = { "x-access-code": "c0de", "x-forwarded-for": ip, "content-type": "application/json" };
  const { POST: access } = await import("../api/access.js");
  for (let i = 0; i < 3; i++) assert.equal((await access(new Request("http://x/api/access", { method: "POST", headers: h }))).status, 200);
  assert.equal((await POST(new Request("http://x/api/questions", { method: "POST", headers: h, body: JSON.stringify({ mail: MAIL }) }), { client: fakeClient() })).status, 200);
  for (let i = 0; i < 8; i++) {
    const body = JSON.stringify({ question: "前職で最も大変だったことは何ですか。", answer: B.answer });
    assert.equal((await reviewPOST(new Request("http://x/api/review", { method: "POST", headers: h, body }), { client: fakeClient({ result: reviewFixture }) })).status, 200, `review ${i + 1}`);
    assert.equal((await scriptPOST(new Request("http://x/api/script", { method: "POST", headers: h, body }), { client: fakeClient({ result: scriptFixture }) })).status, 200, `script ${i + 1}`);
  }
});

test("EVAL-06: English explanations may quote Japanese terms; Korean reading must be pure Hangul", () => {
  const en = EXPLAIN_LANGS.en, ko = EXPLAIN_LANGS.ko;
  assert.equal(en.isText("The 復唱 step is missing: restate 「最も大変だったこと」 first."), true);
  assert.equal(en.isText("Use 私としては instead."), true);
  assert.equal(en.isText("これは日本語の説明です。"), false);
  assert.equal(en.isText("결론이 없습니다"), false);
  assert.equal(ko.isReading("하이↗ / 미츠모리가 《즈레타》"), true);
  assert.equal(ko.isReading("하이↗ 見積もり"), false, "kanji left in a Hangul reading");
});

test("SEC: wrong access codes also consume the rate limit (no unlimited brute force via AI routes)", async () => {
  process.env.ACCESS_CODE = "c0de";
  const h = { "x-access-code": "nope", "x-forwarded-for": "66.66.66.66", "content-type": "application/json" };
  const codes = [];
  for (let i = 0; i < 11; i++) codes.push((await POST(new Request("http://x/api/questions", { method: "POST", headers: h, body: "{}" }))).status);
  assert.deepEqual(codes.slice(0, 10), Array(10).fill(401));
  assert.equal(codes[10], 429);
});

test("EVAL-02: a correction quoting a single character, or with after === before, is dropped", async () => {
  const weird = { ...reviewFixture, corrections: [
    { rule_id: "del-chanto", before: "は", after: "が", reason: "1글자 인용" },
    { rule_id: "del-nanka", before: "前職では", after: "前職では", reason: "변화 없음" },
    reviewFixture.corrections[0],
  ] };
  const out = await generateReview(fakeClient({ result: weird }), pack, B);
  assert.deepEqual(out.corrections.map((c) => c.rule_id), ["str-ketsuron"]);
  assert.equal(out.dropped, 2);
});

test("EVAL-07: generic words do not count as company-specific refs", () => {
  const qs = [{ question_ja: "これまでの経験とチームでの開発について教えてください。", refs: ["経験", "チーム", "開発"] }, { question_ja: "需要予測の刷新をどう進めますか。", refs: ["需要予測"] }];
  assert.equal(countSpecific(qs, "経験 チーム 開発 需要予測の刷新"), 1);
});

test("EVAL-08: numbers in the model script must come from the answer/question/context (blanks are fine)", async () => {
  const invented = { ...scriptFixture, ja: "はい、前職で手戻りを3割減らし、5年間リーダーを務めました。御社ではいかがでしょうか。" };
  await assert.rejects(generateScript(fakeClient({ responses: [invented, invented] }), pack, { question: "見積もりは？", answer: "手戻りを減らしました" }), /language check|number check/);
  const grounded = fakeClient({ responses: [invented] });
  assert.ok(await generateScript(grounded, pack, { question: "見積もりは？", answer: "手戻りを3割減らし、５年間リーダーでした" }), "numbers present in the answer (full-width too) pass");
  assert.ok(await generateScript(fakeClient({ result: scriptFixture }), pack, { question: "Q", answer: "A" }), "blank placeholders pass");
});

test("F10 gate vs collected reverse-question cases (D2): good pass; conditions/double/too_long fail", () => {
  const raw = JSON.parse(readFileSync(new URL("./eval/reverse-cases.json", import.meta.url), "utf8"));
  const items = Array.isArray(raw) ? raw : raw.items ?? raw.cases;
  for (const x of items.filter((i) => i.label === "good")) assert.equal(reverseQuestionOk(x.question_ja), true, x.id);
  for (const x of items.filter((i) => ["conditions", "double", "too_long"].includes(i.bad_type))) assert.equal(reverseQuestionOk(x.question_ja), false, `${x.id} ${x.bad_type}`);
});

test("readings may carry the script's ［blanks］ verbatim (seen live: Korean reading copied ［ここに実績の数字］)", () => {
  assert.equal(EXPLAIN_LANGS.ko.isReading("젠쇼쿠데와 ［ここに実績の数字］ 헤라시마시타↘"), true);
  assert.equal(EXPLAIN_LANGS.en.isReading("zenshoku dewa ［ここに実績の数字］ herashimashita↘"), true);
  assert.equal(EXPLAIN_LANGS.ja.isReading("ぜんしょくでは ［ここに実績の数字］ へらしました↘"), true);
  assert.equal(EXPLAIN_LANGS.ko.isReading("젠쇼쿠데와 実績 헤라시마시타"), false, "kanji outside blanks still fails");
});
