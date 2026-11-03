import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPack, generateQuestions, generateScript, buildScriptRequest, buildQuestionRequest, isJapanese, hasHangul, EXPLAIN_LANGS, READINGS, maskInput, MODELS, buildReviewRequest, generateReview, buildReverseRequest, generateReverse, countSpecific, reverseQuestionOk, buildTranslationRequest } from "../lib/coach.js";
import { kanaToHangul } from "../lib/kana.js";
import { POST } from "../api/questions.js";
import { POST as scriptPOST } from "../api/script.js";
import { POST as reviewPOST } from "../api/review.js";
import { POST as reversePOST } from "../api/reverse.js";
import { fakeClient, fixture, scriptFixture, reviewFixture, reverseFixture, asModelScript, scriptKana } from "./fake-claude.js";
import { readFileSync } from "node:fs";

// V4: the script response also carries the model's raw hiragana reading as `kana` (read-aloud check compares on it).
const scriptOut = { ...scriptFixture, kana: scriptKana };
// C3·C5 (11/03) add parts/closing/issues to every script result; whole-output comparisons check the earlier fields only.
const core = ({ parts, closing, issues, ttsSig, ...x }) => x; // ttsSig: API only (11/03)
const MAIL = readFileSync(new URL("../samples/agent-mail-sample.txt", import.meta.url), "utf8");

const pack = loadPack("jp");

test("generateQuestions (fake Claude): 10 questions, ids, valid enums, personal data redacted", async () => {
  const out = await generateQuestions(fakeClient(), pack, "MAIL", []);
  assert.equal(out.questions.length, 10);
  assert.deepEqual(out.questions.map((q) => q.id), Array.from({ length: 10 }, (_, i) => `q${i + 1}`));
  for (const q of out.questions) {
    assert.ok(pack.question_taxonomy.stages.includes(q.stage), q.stage);
    // Optional categories (e.g. 日本で働く理由・在留) are valid output, so check against the union.
    assert.ok([...pack.question_taxonomy.categories, ...(pack.question_taxonomy.optional_categories ?? [])].includes(q.category), q.category);
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

// Field renamed question_ja → question and the error names the pack's target language (2-axis rule, 11/03); same check.
test("generateQuestions retries once when question is not Japanese, then fails", async () => {
  const korean = { ...fixture, questions: fixture.questions.map((q, i) => (i === 0 ? { ...q, question: "지원 동기를 말해 주세요" } : q)) };
  const once = fakeClient({ responses: [korean, fixture] });
  assert.equal((await generateQuestions(once, pack, "M", [])).questions.length, 10);
  assert.equal(once.calls(), 2);
  const twice = fakeClient({ responses: [korean, korean] });
  await assert.rejects(generateQuestions(twice, pack, "M", []), /question not in ja/);
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
  // The model-facing key stays the target language code: with a neutral "text" key the live model wrote the
  // reading/translation/points in Japanese too (11/03, 3/3). The app still receives `text` from generateScript.
  assert.equal(r.output_config.format.schema.required.join(), "ja,reading,translation,points");
  // Intent changed (11/03): the reading is now hiragana, so only translation/points must be in the native language.
  assert.match(r.system, /translation・points は[^\n]*（ja と reading だけが日本語）/);
  assert.doesNotMatch(r.system, /reading・translation・points/);
  assert.ok(!buildScriptRequest(pack, { question: "Q", answer: "A" }).messages[0].content.includes("company_material"));
});

test("generateScript: valid script passes; wrong language retried once, then fails", async () => {
  assert.deepEqual(core(await generateScript(fakeClient({ result: asModelScript(scriptFixture) }), pack, { question: "Q", answer: "A" })), scriptOut);
  const bad = asModelScript({ ...scriptFixture, text: "견적이 어긋나면" });
  const retry = fakeClient({ responses: [bad, asModelScript(scriptFixture)] });
  assert.deepEqual(core(await generateScript(retry, pack, { question: "Q", answer: "A" })), scriptOut);
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
  const res200 = await scriptPOST(req("c0de", ok), { client: fakeClient({ result: asModelScript(scriptFixture) }) });
  assert.equal(res200.status, 200);
  assert.deepEqual(core(await res200.json()), scriptOut);
  const failed = await scriptPOST(req("c0de", { ...ok, answer: "秘密の回答" }), { client: fakeClient({ fail: new Error("boom") }) });
  const text = await failed.text();
  assert.equal(failed.status, 502);
  assert.deepEqual(JSON.parse(text), { code: "generation_failed" });
  assert.ok(!text.includes("秘密の回答"));
});

// The model sends the reading in hiragana (enKana); the API returns it as romaji (lib/kana.js).
const enKana = "はい、 /みつもりが 《ずれた》 ばあいわ↘";
const enScript = { text: scriptFixture.text, reading: "hai, /mitsumoriga 《zureta》 baaiwa↘", translation: "Yes, when an estimate slips, I first check the impact.", points: ["Lower the end of the first sentence.", "Stress the numbers."] };
const enModel = asModelScript({ ...enScript, reading: enKana });
// Japan + Japanese screen is the same language: no reading/translation (2-axis rule, 11/03). The kana-only
// reading check now applies to a Korean script for a Japanese speaker (katakana), so it moved to that pack.
const jaScript = { text: scriptFixture.text, points: ["最初の文は語尾を下げる。", "数字ははっきり言う。"] };
const kr = loadPack("kr");
const krJaScript = { text: "네, 일정이 밀렸을 때는 먼저 영향 범위를 확인합니다.", reading: "ネ、/イルジョンイ 《ミルリョッスル》 テヌン↘", translation: "はい、日程が遅れたときは、まず影響範囲を確認します。", points: ["最初の文は語尾を下げる。", "数字ははっきり言う。"] };

// Reading names moved from EXPLAIN_LANGS to READINGS[target][native]; jp + ja has none (same language).
test("explain languages: ko, en, ja are registered; prompts name the language and its reading script", () => {
  assert.deepEqual(Object.keys(EXPLAIN_LANGS).sort(), ["en", "ja", "ko"]);
  for (const lang of Object.keys(EXPLAIN_LANGS)) {
    const L = EXPLAIN_LANGS[lang];
    const R = READINGS.ja[lang];
    const s = buildScriptRequest(pack, { question: "Q", answer: "A", lang });
    assert.ok(s.system.includes(L.name), `${lang} script system names ${L.name}`);
    // jp readings are asked for in hiragana (converted afterwards), so the prompt names the asked script.
    if (R) assert.ok(s.system.includes((R.ask ?? R).name), `${lang} script system names reading ${(R.ask ?? R).name}`);
    else assert.doesNotMatch(s.system, /reading/, `${lang}: same language, no reading asked`);
    const q = buildQuestionRequest(pack, "M", [], lang);
    assert.ok(q.system.includes(L.name) || q.messages[0].content.includes(L.name), `${lang} question request names ${L.name}`);
  }
  assert.ok(!buildScriptRequest(pack, { question: "Q", answer: "A", lang: "en" }).system.includes("韓国語"));
});

test("generateScript gate follows the language: en needs romaji/English, ja needs kana/Japanese", async () => {
  assert.deepEqual(core(await generateScript(fakeClient({ result: enModel }), pack, { question: "Q", answer: "A", lang: "en" })), { ...enScript, kana: enKana });
  assert.deepEqual(core(await generateScript(fakeClient({ result: asModelScript(jaScript) }), pack, { question: "Q", answer: "A", lang: "ja" })), jaScript);
  // Korean output when English was asked → retried, then rejected
  await assert.rejects(generateScript(fakeClient({ responses: [asModelScript(scriptFixture), asModelScript(scriptFixture)] }), pack, { question: "Q", answer: "A", lang: "en" }), /language check/);
  // kanji left in a kana reading → rejected (kana reading = Korean script for a Japanese speaker, see jaScript note)
  assert.deepEqual(core(await generateScript(fakeClient({ result: asModelScript(krJaScript, "ko") }), kr, { question: "Q", answer: "A", lang: "ja" })), krJaScript);
  const kanji = { ...krJaScript, reading: "日程が 《ミルリョッスル》" };
  await assert.rejects(generateScript(fakeClient({ responses: [asModelScript(kanji, "ko"), asModelScript(kanji, "ko")] }), kr, { question: "Q", answer: "A", lang: "ja" }), /language check/);
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
  assert.equal((await scriptPOST(req("/api/script", { question: "Q", answer: "A", lang: "en" }), { client: fakeClient({ result: enModel }) })).status, 200);
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
  const client = fakeClient({ result: asModelScript(scriptFixture) });
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
  assert.deepEqual(items.items.required, ["question", "intent"]); // renamed from question_ja (target-neutral field)
});

test("F10 generateReverse gates: exactly 3, Japanese question, intent in the explain language, no pay/conditions", async () => {
  assert.equal((await generateReverse(fakeClient({ result: reverseFixture }), pack, { context: CTX })).questions.length, 3);
  const pay = { questions: [{ question: "年収はどのくらい上がりますか。", intent: "연봉을 확인합니다." }, ...reverseFixture.questions.slice(1)] };
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
  const dbl = { questions: [{ question: "最初の半年に期待される成果は何でしょうか。また、課題はどこにあるとお考えでしょうか。", intent: "기대치와 과제를 확인합니다." }, ...reverseFixture.questions.slice(1)] };
  await assert.rejects(generateReverse(fakeClient({ responses: [dbl, dbl] }), pack, { context: CTX }), /reverse check/);
  const long = { questions: [{ question: "需".repeat(81) + "ですか。", intent: "길다." }, ...reverseFixture.questions.slice(1)] };
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
    assert.equal((await scriptPOST(new Request("http://x/api/script", { method: "POST", headers: h, body }), { client: fakeClient({ result: asModelScript(scriptFixture) }) })).status, 200, `script ${i + 1}`);
  }
});

test("EVAL-06: English explanations may quote Japanese terms; Korean reading must be pure Hangul", () => {
  const en = EXPLAIN_LANGS.en, ko = READINGS.ja.ko; // readings live in READINGS[target][native] now
  assert.equal(en.isText("The 復唱 step is missing: restate 「最も大変だったこと」 first."), true);
  assert.equal(en.isText("Use 私としては instead."), true);
  assert.equal(en.isText("これは日本語の説明です。"), false);
  assert.equal(en.isText("결론이 없습니다"), false);
  assert.equal(ko.is("하이↗ / 미츠모리가 《즈레타》"), true);
  assert.equal(ko.is("하이↗ 見積もり"), false, "kanji left in a Hangul reading");
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
  // Generic words moved to pack data (question_taxonomy.generic_terms), so the pack's list is passed in.
  const qs = [{ question: "これまでの経験とチームでの開発について教えてください。", refs: ["経験", "チーム", "開発"] }, { question: "需要予測の刷新をどう進めますか。", refs: ["需要予測"] }];
  assert.equal(countSpecific(qs, "経験 チーム 開発 需要予測の刷新", pack.question_taxonomy.generic_terms), 1);
});

test("EVAL-08: numbers in the model script must come from the answer/question/context (blanks are fine)", async () => {
  const invented = { ...scriptFixture, text: "はい、前職で手戻りを3割減らし、5年間リーダーを務めました。御社ではいかがでしょうか。" };
  await assert.rejects(generateScript(fakeClient({ responses: [asModelScript(invented), asModelScript(invented)] }), pack, { question: "見積もりは？", answer: "手戻りを減らしました" }), /language check|number check/);
  const grounded = fakeClient({ responses: [asModelScript(invented)] });
  assert.ok(await generateScript(grounded, pack, { question: "見積もりは？", answer: "手戻りを3割減らし、５年間リーダーでした" }), "numbers present in the answer (full-width too) pass");
  assert.ok(await generateScript(fakeClient({ result: asModelScript(scriptFixture) }), pack, { question: "Q", answer: "A" }), "blank placeholders pass");
});

test("F10 gate vs collected reverse-question cases (D2): good pass; conditions/double/too_long fail", () => {
  const raw = JSON.parse(readFileSync(new URL("./eval/reverse-cases.json", import.meta.url), "utf8"));
  const items = Array.isArray(raw) ? raw : raw.items ?? raw.cases;
  for (const x of items.filter((i) => i.label === "good")) assert.equal(reverseQuestionOk(x.question), true, x.id);
  for (const x of items.filter((i) => ["conditions", "double", "too_long"].includes(i.bad_type))) assert.equal(reverseQuestionOk(x.question), false, `${x.id} ${x.bad_type}`);
});

// Readings moved to READINGS[target][native]; the hiragana case became katakana for a Korean script (jp + ja has no reading).
test("readings may carry the script's ［blanks］ verbatim (seen live: Korean reading copied ［ここに実績の数字］)", () => {
  assert.equal(READINGS.ja.ko.is("젠쇼쿠데와 ［ここに実績の数字］ 헤라시마시타↘"), true);
  assert.equal(READINGS.ja.en.is("zenshoku dewa ［ここに実績の数字］ herashimashita↘"), true);
  assert.equal(READINGS.ko.ja.is("チョンジクエソヌン ［여기에 실적 숫자］ チュルヨッスムニダ↘"), true);
  assert.equal(READINGS.ja.ko.is("젠쇼쿠데와 実績 헤라시마시타"), false, "kanji outside blanks still fails");
});

// Live 11/03 (ko screen, n=6): 3/6 scripts failed because the "Hangul" reading came back in kana/kanji. The model now
// writes hiragana only and lib/kana.js converts it, so the API still returns Hangul (ko) / romaji (en).
test("jp reading: hiragana from the model → Hangul for ko, romaji for en", async () => {
  assert.equal(kanaToHangul(scriptKana), scriptFixture.reading, "script.json reading is the converter output of scriptKana");
  const model = { ja: scriptFixture.text, reading: "ぜんしょくで 《もっとも》↗ かんりつーるを", translation: scriptFixture.translation, points: scriptFixture.points };
  assert.equal((await generateScript(fakeClient({ result: model }), pack, { question: "Q", answer: "A", lang: "ko" })).reading, "젠쇼쿠데 《못토모》↗ 칸리츠우루오");
  const en = { ...model, translation: enScript.translation, points: enScript.points };
  assert.equal((await generateScript(fakeClient({ result: en }), pack, { question: "Q", answer: "A", lang: "en" })).reading, "zenshokude 《mottomo》↗ kanritsuuruo");
  const s = buildScriptRequest(pack, { question: "Q", answer: "A", lang: "ko" });
  assert.match(s.output_config.format.schema.properties.reading.description, /ひらがなだけで書く/);
  assert.match(s.system, /reading: ja をひらがなで発音表記する（カタカナ語や数字もひらがなで書き/);
});

test("V4: kana = the model's raw hiragana reading (marks kept) for jp + ko/en; none when no reading is asked", async () => {
  const ko = await generateScript(fakeClient({ result: asModelScript(scriptFixture) }), pack, { question: "Q", answer: "A", lang: "ko" });
  assert.equal(ko.kana, scriptKana);
  assert.equal(ko.reading, kanaToHangul(scriptKana), "reading is still the converted Hangul");
  assert.equal((await generateScript(fakeClient({ result: enModel }), pack, { question: "Q", answer: "A", lang: "en" })).kana, enKana);
  assert.equal("kana" in (await generateScript(fakeClient({ result: asModelScript(jaScript) }), pack, { question: "Q", answer: "A", lang: "ja" })), false);
  assert.equal("kana" in (await generateScript(fakeClient({ result: asModelScript(krJaScript, "ko") }), kr, { question: "Q", answer: "A", lang: "ja" })), false);
  // Additive output only: the request (prompt + schema) does not change.
  assert.equal(JSON.stringify(buildScriptRequest(pack, { question: "Q", answer: "A", lang: "ko" })).includes("kana"), false);
});

test("hiragana gate: kanji, 々, Hangul, Latin or digits in the model's reading are rejected (retried, then fail)", async () => {
  const gate = READINGS.ja.ko.ask;
  assert.equal(gate, READINGS.ja.en.ask);
  for (const ok of ["もっとも↗ /《かんり》", "コーヒーを ［ここに実績の数字］ へらしました↘。", "るーる、 [期限]"]) assert.equal(gate.is(ok), true, ok);
  for (const bad of ["前職で もっとも", "ひとびと 時々", "々", "젠쇼쿠데", "zenshoku", "にじゅう 20", "にじゅう ２０", "", "↗ /《》", "［ここに］"]) assert.equal(gate.is(bad), false, bad);
  for (const lang of ["ko", "en"]) {
    for (const reading of ["ぜんしょくで 最も", "젠쇼쿠데 못토모", "zenshoku de"]) {
      const bad = { ja: scriptFixture.text, reading, translation: lang === "ko" ? scriptFixture.translation : enScript.translation, points: lang === "ko" ? scriptFixture.points : enScript.points };
      const client = fakeClient({ responses: [bad, bad] });
      await assert.rejects(generateScript(client, pack, { question: "Q", answer: "A", lang }), /language check/, `${lang}: ${reading}`);
      assert.equal(client.calls(), 2);
    }
  }
});

test("translation-only retry: one small call for the translation, never more than 2 calls in total", async () => {
  const jpTr = "見積もりがずれた場合は、まず影響範囲を確認します。";
  const badTr = asModelScript({ ...scriptFixture, translation: jpTr });
  // 1st call: everything but the translation passes → 2nd call asks only for the translation, keeps the rest.
  const fixed = fakeClient({ responses: [badTr, { translation: scriptFixture.translation }] });
  assert.deepEqual(core(await generateScript(fixed, pack, { question: "Q", answer: "A", lang: "ko" })), scriptOut);
  assert.equal(fixed.calls(), 2);
  const tr = fixed.requests[1];
  assert.deepEqual(tr.output_config.format.schema.required, ["translation"]);
  assert.ok(tr.messages[0].content.includes(`<text>\n${scriptFixture.text}\n</text>`) && tr.system.includes("韓国語"));
  assert.deepEqual(tr, buildTranslationRequest(pack, scriptFixture.text, "ko"));
  // The translation-only call fails too → error, no 3rd call.
  const still = fakeClient({ responses: [badTr, { translation: jpTr }, asModelScript(scriptFixture)] });
  await assert.rejects(generateScript(still, pack, { question: "Q", answer: "A", lang: "ko" }), /language check/);
  assert.equal(still.calls(), 2);
  // 1st call fails on the text → full retry; 2nd call fails only on the translation → error, no 3rd call.
  const badText = asModelScript({ ...scriptFixture, text: "견적이 어긋나면" });
  const late = fakeClient({ responses: [badText, badTr, { translation: scriptFixture.translation }] });
  await assert.rejects(generateScript(late, pack, { question: "Q", answer: "A", lang: "ko" }), /language check/);
  assert.equal(late.calls(), 2);
  // An invented number on the 1st call → full retry (a new translation would not fix the text).
  const invented = asModelScript({ ...scriptFixture, translation: jpTr, text: "はい、手戻りを3割減らしました。御社ではいかがでしょうか。" });
  const full = fakeClient({ responses: [invented, asModelScript(scriptFixture)] });
  assert.deepEqual(core(await generateScript(full, pack, { question: "Q", answer: "A", lang: "ko" })), scriptOut);
  assert.equal(full.requests[1].output_config.format.schema.required.join(), "ja,reading,translation,points");
});

// YC review 11/03: 「五名」「三割」 slipped past the number gate (it only read Arabic digits). Kanji numerals before a
// counter are compared as numbers on both sides; idioms (一般・一緒・もう一度・一つ) and a lone 一 are not numbers.
test("number gate reads kanji numerals before a counter, not idioms", async () => {
  const { groundedNumbers } = await import("../lib/script.js");
  assert.equal(groundedNumbers("チームを五名で回しました。", "チームで回しました"), false);
  assert.equal(groundedNumbers("手戻りを三割減らしました。", "手戻りを減らしました"), false);
  assert.equal(groundedNumbers("手戻りを三割減らしました。", "手戻りを3割減らした"), true);
  assert.equal(groundedNumbers("5名のチームです。", "チームは五名でした"), true);
  assert.equal(groundedNumbers("十二件、三万円です。", "12件で30000円"), true);
  assert.equal(groundedNumbers("一般的に、一緒に、もう一度、一つの基準で、一人で決めました。", "決めました"), true);
});

// Decision 11/03 (PRD §16-15): 復唱 is recommended, not required; the 4th step closes by question type, decided by code
// (category + question text, packs/jp.json closing_rules) and shared by review and script so both judge the same way.
test("closingOf: category + question text pick the closing; a pack without rules returns null", async () => {
  const { closingOf } = await import("../lib/pack.js");
  const c = (question, category) => closingOf(pack, { question, category });
  assert.equal(c("見積もりがずれたら、どうしますか。", "技術"), "options");
  assert.equal(c("優先順位はどう判断しますか。", "マネジメント"), "options");
  assert.equal(c("あなたの弱みを教えてください。", "経歴・志望動機"), "improvement");
  assert.equal(c("当社を志望する理由を教えてください。", "経歴・志望動機"), "contribution");
  assert.equal(c("チームをまとめた経験を教えてください。", "マネジメント"), "contribution");
  assert.equal(c("困ったときの経験を教えてください。", "技術"), "contribution", "an experience question is not a judgment question");
  // Past tense = what you did (experience → contribution); present = what you would do (judgment → options).
  assert.equal(c("チームで意見が対立したとき、どう対応しましたか。", "マネジメント"), "contribution");
  assert.equal(c("見積もりがずれたとき、どのように判断しましたか。", "技術"), "contribution");
  assert.equal(c("障害が起きたとき、どう対応しますか。", "技術"), "options");
  assert.equal(c("機能を止めずに新しい仕組みへ移行するには、どのように進めますか。", "技術"), "options");
  // Review 11/03: present-tense judgment verbs beyond します, and 苦手 as an adjective about others.
  for (const q of ["技術的な優先順位をどう決めますか。", "障害が起きたらどう対処しますか。", "トラブルがあったらどうされますか。", "納期とのバランスをどう考えますか。", "メンバーの負荷をどう管理しますか。"]) assert.equal(c(q, "技術"), "options", q);
  assert.equal(c("優先順位をどう決めましたか。", "技術"), "contribution", "past tense stays an experience question");
  assert.equal(c("お客様が苦手とする作業を、どう改善しましたか。", "技術"), "contribution");
  assert.equal(c("苦手なことは何ですか。", "経歴・志望動機"), "improvement");
  assert.equal(c("見積もりがずれたとき、どのような基準で判断しますか。", "技術"), "options");
  assert.equal(c("最後に、何か質問はありますか。", "逆質問"), "question");
  assert.equal(c("何か質問はありますか。"), "question", "no category: the text rule still applies");
  assert.equal(closingOf(kr, { question: "약점은 무엇인가요?" }), null);
});

test("review prompt: 復唱 recommended, 4th step uses the question's closing; the result carries it", async () => {
  const cl = pack.answer_structure.closings;
  const r = buildReviewRequest(pack, { question: "当社を志望する理由を教えてください。", answer: "A", category: "経歴・志望動機" });
  assert.ok(r.system.includes(cl.contribution.rule));
  assert.ok(!r.system.includes(cl.options.rule));
  assert.match(r.system, /復唱[^\n]*推奨/);
  assert.ok(buildReviewRequest(pack, { question: "見積もりがずれたらどうしますか。", answer: "A" }).system.includes(cl.options.rule));
  assert.equal((await generateReview(fakeClient({ result: reviewFixture }), pack, B)).closing, "contribution");
});

test("script prompt closes by the question's type, not always with 選択肢", () => {
  const cl = pack.answer_structure.closings;
  const s = buildScriptRequest(pack, { question: "当社を志望する理由を教えてください。", answer: "A", category: "経歴・志望動機" }).system;
  assert.ok(s.includes(cl.contribution.rule));
  assert.ok(!s.includes("選択肢で結ぶ"));
  assert.ok(buildScriptRequest(pack, { question: "見積もりがずれたらどうしますか。", answer: "A" }).system.includes(cl.options.rule));
});

test("/api/review and /api/script pass category to the closing decision", async () => {
  let ip = 1;
  const req = (path, body) => new Request(`http://x${path}`, { method: "POST", headers: { "x-access-code": "c0de", "x-forwarded-for": `7.7.1.${ip++}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  const q = { question: "最後に伺いたいことはありますか。", answer: B.answer, category: "逆質問" };
  const rc = fakeClient({ result: reviewFixture });
  await reviewPOST(req("/api/review", q), { client: rc });
  assert.ok(rc.requests[0].system.includes(pack.answer_structure.closings.question.rule));
  const sc = fakeClient({ result: asModelScript(scriptFixture) });
  await scriptPOST(req("/api/script", q), { client: sc });
  assert.ok(sc.requests[0].system.includes(pack.answer_structure.closings.question.rule));
});

test("questions result marks 復唱 optional so the UI shows a tip, not ✗", async () => {
  const out = await generateQuestions(fakeClient(), pack, "MAIL", []);
  assert.deepEqual(out.pack.steps.map((s) => s.optional ?? false), [true, false, false, false]);
});

// Consistency PR-1 (research/CONSISTENCY-PLAN.md C1·C2·C6): code-side levers, since Sonnet 5.5 rejects sampling params.
test("C1: the script prompt carries each step's example (last step = the question's closing example)", () => {
  const q = { question: "見積もりがずれたらどうしますか。", answer: "A" };
  const sys = buildScriptRequest(pack, q).system;
  const s = pack.answer_structure;
  for (const st of s.steps.slice(0, -1)) assert.ok(sys.includes(`例: 「${st.example}」`), st.key);
  assert.ok(sys.includes(`例: 「${s.closings.options.example}」`));
});

test("C1/T2: pack step and closing examples carry no Arabic digits (the number gate would retry on a copied 3)", () => {
  for (const p of [pack, kr]) {
    const s = p.answer_structure;
    const ex = [...s.steps.map((x) => x.example), ...Object.values(s.closings ?? {}).map((x) => x.example)];
    for (const e of ex) assert.ok(!/[0-9０-９]/.test(e), `${p.id}: ${e}`);
  }
});

test("C2: a truncated script response is retried once; two truncations still fail", async () => {
  const good = asModelScript(scriptFixture);
  const c = fakeClient({ responses: [good, good], stops: ["max_tokens", "end_turn"] });
  const out = await generateScript(c, pack, { question: "見積もりは？", answer: "手戻りを減らしました" });
  assert.equal(out.text, scriptFixture.text);
  assert.equal(c.calls(), 2);
  await assert.rejects(generateScript(fakeClient({ responses: [good, good], stops: ["max_tokens", "max_tokens"] }), pack, { question: "Q", answer: "A" }), /truncated/);
  await assert.rejects(generateScript(fakeClient({ stop: "refusal" }), pack, { question: "Q", answer: "A" }), /refusal/);
});

test("C6: review rule ids and verdict are lower-cased; corrections follow their order in the answer", async () => {
  const answer = "なんか、課題が多かったです。ちゃんと確認しました。";
  const r = { ...reviewFixture, answers_question: "YES", corrections: [
    { rule_id: "DEL-CHANTO", before: "ちゃんと確認しました", after: "確認しました", reason: "어린 인상" },
    { rule_id: "del-nanka", before: "なんか、課題が多かった", after: "課題が多かった", reason: "의미 없음" },
  ] };
  const out = await generateReview(fakeClient({ result: r }), pack, { question: "Q", answer });
  assert.equal(out.answers_question, "yes");
  assert.deepEqual(out.corrections.map((c) => c.rule_id), ["del-nanka", "del-chanto"]);
  assert.equal(out.corrections[1].pattern, "ちゃんと");
});

// C3 (CONSISTENCY-PLAN): one string per step in the schema, joined by code in pack order.
test("C3: script schema has one required string per step under the target key; text is joined in pack order", async () => {
  const { scriptSchema } = await import("../lib/script.js");
  const r = buildScriptRequest(pack, { question: "見積もりがずれたらどうしますか。", answer: "A" });
  const ja = r.output_config.format.schema.properties.ja;
  const keys = pack.answer_structure.steps.map((s) => s.key);
  assert.deepEqual(ja.required, keys);
  assert.equal(ja.additionalProperties, false);
  assert.ok(ja.properties.sentakushi.description.includes(pack.answer_structure.closings.options.rule));
  assert.equal(typeof scriptSchema, "function");
  const p = { sentakushi: "どちらから、お話ししましょうか。", kijun: "基準は、残りのコストです。", fukusho: "判断、ですね。", ketsuron: "三つから選びます。" };
  const out = await generateScript(fakeClient({ result: { ...asModelScript(scriptFixture), ja: p } }), pack, { question: "見積もりがずれたらどうしますか。", answer: "A" });
  assert.equal(out.text, "判断、ですね。三つから選びます。基準は、残りのコストです。どちらから、お話ししましょうか。");
  assert.deepEqual(Object.keys(out.parts), keys);
  assert.equal(out.closing, "options");
});

// C5: deterministic soft gate (pack.consistency), thresholds from the 11/03 baseline (15 scripts: 172–250 chars) [Low].
const P = (o = {}) => ({ fukusho: "見積もりがずれたときの判断、ですね。", ketsuron: "止める・縮小する・続けるの三つから、事業側と一緒に選びます。", kijun: "基準は、ここから先にかかるコストと、ここから先に見込めるリターンの二つです。すでに使った工数は、判断に入れません。前職の管理ツール導入では、ずれが分かった時点でこの二つを表にして、範囲を縮小する案を出しました。その結果、リリースを［ここに期間］早められました。", sentakushi: "判断の基準と、関係者への伝え方のどちらから、詳しくお話ししましょうか。", ...o });
test("C5: a clean options script has no issues; each broken rule is named", async () => {
  const { scriptIssues } = await import("../lib/script.js");
  assert.deepEqual(scriptIssues(pack, "options", P()), []);
  assert.deepEqual(scriptIssues(pack, "options", P({ fukusho: "見積もりについてお答えします。" })), ["fukusho"]);
  assert.deepEqual(scriptIssues(pack, "options", P({ ketsuron: "三つから選ぶ。" })), ["ending"]);
  assert.deepEqual(scriptIssues(pack, "options", P({ sentakushi: "以上です。" })), ["closing"]);
  assert.deepEqual(scriptIssues(pack, "contribution", P()), ["closing"]);
  assert.deepEqual(scriptIssues(pack, "contribution", P({ sentakushi: "御社でも、この手順を活かします。" })), []);
  assert.deepEqual(scriptIssues(pack, "options", P({ kijun: P().kijun.replace("［ここに期間］", "［期限］") })), ["blank"]);
  assert.deepEqual(scriptIssues(pack, "options", P({ kijun: P().kijun.replace("［ここに期間］", "［ここに期間］［ここに数字］［ここに数字］［ここに数字］") })), ["blank"]);
  assert.deepEqual(scriptIssues(pack, "options", P({ kijun: `${P().kijun}以上が基準です。` })), ["sentences:kijun"]);
  assert.deepEqual(scriptIssues(pack, "options", P({ kijun: "基準は、コストです。" })), ["length"]);
  assert.deepEqual(scriptIssues(pack, "question", { fukusho: "", ketsuron: "前職では導入初期の定着に苦労しました。", kijun: "定着には現場の担当者が数字を追える仕組みが一番効くと考えています。", sentakushi: "御社では、導入後の定着をどのように支えていますか。" }), [], "逆質問: no 復唱, no length gate");
  assert.deepEqual(scriptIssues(kr, "options", { fukusho: "x" }), [], "a pack without consistency data: no-op");
});

test("C5: soft retry inside the 2-call budget — better 2nd call wins, otherwise the 1st comes back with its issues", async () => {
  const q = { question: "見積もりがずれたとき、どのように判断しますか。", answer: "前職で見積もりのずれを判断しました" };
  const mk = (ja) => ({ ...asModelScript(scriptFixture), ja });
  const clean = mk(P()), issueful = mk(P({ fukusho: "見積もりについてお答えします。" })), worse = mk(P({ fukusho: "見積もりについてお答えします。", sentakushi: "以上です。" }));
  const a = fakeClient({ responses: [issueful, clean] });
  const outA = await generateScript(a, pack, q);
  assert.deepEqual([outA.issues, a.calls()], [[], 2]);
  const b = await generateScript(fakeClient({ responses: [issueful, worse] }), pack, q);
  assert.deepEqual(b.issues, ["fukusho"]);
  const hardFail = { ...issueful, ja: P({ ketsuron: "三つから選び、12件を処理します。" }) }; // 12 is not in the answer
  assert.deepEqual((await generateScript(fakeClient({ responses: [issueful, hardFail] }), pack, q)).issues, ["fukusho"]);
  const c = fakeClient({ responses: [clean] });
  assert.deepEqual([(await generateScript(c, pack, q)).issues, c.calls()], [[], 1], "clean first call: no retry");
});

// Live 11/03 (3 scripts): a short user answer gives a short script (no invented facts), and the retry stayed short both
// times (136 → 136, 129 → 129 chars). So "length" is reported but never buys a 2nd call.
test("C5: a length-only issue is reported without a retry", async () => {
  const q = { question: "見積もりがずれたとき、どのように判断しますか。", answer: "前職で見積もりのずれを判断しました" };
  const short = { ...asModelScript(scriptFixture), ja: P({ kijun: "基準は、コストです。" }) };
  const c = fakeClient({ responses: [short, { ...asModelScript(scriptFixture), ja: P() }] });
  const out = await generateScript(c, pack, q);
  assert.deepEqual([out.issues, c.calls()], [["length"], 1]);
});

// PRD §16-16: the audience follows (destination, screen language). Same language = a candidate at home, not a foreigner;
// other screen languages keep the prompt byte-identical (snapshots jp-ko / jp-en unchanged).
test("prompts call the user a foreign job seeker only when the screen language differs from the destination's", () => {
  for (const [lang, foreign] of [["ko", true], ["en", true], ["ja", false]]) {
    const q = buildQuestionRequest(pack, "MAIL", [], lang).system;
    const s = buildScriptRequest(pack, { question: "Q", answer: "A", lang }).system;
    for (const sys of [q, s]) {
      assert.equal(sys.includes("外国人求職者"), foreign, `${lang}: ${sys.slice(0, 40)}`);
      assert.ok(sys.includes("求職者のための"), lang);
    }
  }
  assert.ok(!buildScriptRequest(kr, { question: "Q", answer: "A", lang: "ko" }).system.includes("外国人"), "kr pack + Korean screen");
  assert.ok(buildScriptRequest(kr, { question: "Q", answer: "A", lang: "ja" }).system.includes("外国人求職者"), "kr pack + Japanese screen");
});

// PRD §16-17 (revised 11/03): a Japanese screen reader is a native speaker for every pack (jp: at home, kr: a Japanese
// candidate for Korea), so explanations are plain 日本語 everywhere — no やさしい日本語 in any prompt.
test("Japanese explanations are plain 日本語 for every pack (no やさしい日本語)", () => {
  for (const p of [pack, kr]) {
    const sys = [buildQuestionRequest(p, "MAIL", [], "ja").system, buildScriptRequest(p, { question: "Q", answer: "A", lang: "ja" }).system,
      buildReviewRequest(p, { question: "Q", answer: "A", lang: "ja" }).system, buildReverseRequest(p, { context: "C", lang: "ja" }).system];
    for (const x of sys) assert.ok(!x.includes("やさしい") && x.includes("日本語"), `${p.id}: ${x.slice(0, 60)}`);
  }
});

// Product review 11/03: the gate compared substrings — 「3,000万円」 in the answer vs 「3000万円」 in the script failed (a
// correct answer ended in 502), and 「15%」 passed because the source had 「2015年」. Numbers are now whole tokens.
test("number gate compares whole numbers: thousands commas match, digits inside another number do not", async () => {
  const { groundedNumbers } = await import("../lib/script.js");
  assert.equal(groundedNumbers("3000万円の予算を管理しました。", "前職で3,000万円の予算を管理しました。"), true);
  assert.equal(groundedNumbers("3,000万円の予算を管理しました。", "前職で3000万円の予算"), true);
  assert.equal(groundedNumbers("売上を15%伸ばしました。", "2015年に入社しました"), false);
  assert.equal(groundedNumbers("5名のチームです。", "2025年から"), false);
  assert.equal(groundedNumbers("2025年から5名のチームです。", "2025年から5名で"), true);
});

// Security review 11/03: a non-JSON reply made JSON.parse throw a message quoting the model output ("私の名前は山田太郎…"),
// which the API handlers log. The error must not carry the content.
test("askJson: a non-JSON reply fails without quoting the model text", async () => {
  const { askJson } = await import("../lib/claude.js");
  const client = fakeClient({ result: "私の名前は山田太郎です。連絡先は秘密です。" });
  await assert.rejects(askJson(client, {}), (e) => e.message === "bad_json" && !String(e.message).includes("山田"));
});

// Product review 11/03: a step the answer already has shows no note in the UI, yet an empty note there failed the
// language check and the whole review ended in 502.
test("review language check ignores notes of steps that are present (they are never shown)", async () => {
  const r = { ...reviewFixture, steps: { ...reviewFixture.steps, kijun: { present: true, note: "" } } };
  const out = await generateReview(fakeClient({ result: r }), pack, B);
  assert.equal(out.steps.kijun.present, true);
});

// Demo review 11/03: a recorded question began with a stray quote marker (">プロジェクトの見積もりが…").
test("generated questions lose a leading quote marker (> ＞ 》) before they are shown", async () => {
  const q = { ...fixture, questions: fixture.questions.map((x, i) => (i === 1 ? { ...x, question: `>${x.question}` } : i === 2 ? { ...x, question: `＞ ${x.question}` } : x)) };
  const out = await generateQuestions(fakeClient({ result: q }), pack, "MAIL", []);
  assert.equal(out.questions[1].question, fixture.questions[1].question);
  assert.equal(out.questions[2].question, fixture.questions[2].question);
});

// Demo re-record 11/03: the 結論 example was a frame (「三つで判断します」); the script copied it and the review then
// failed the script's own conclusion. The example states an actual decision, and the rule says so.
test("結論 rule and example ask for the content of the conclusion, not a frame", () => {
  const k = pack.answer_structure.steps.find((s) => s.key === "ketsuron");
  assert.match(k.rule, /中身/);
  assert.doesNotMatch(k.example, /で判断します。$/);
});

// Product review 11/03: only the rule ID was checked, so a 資産 (rep-shisan) correction on 「残りのコスト」 passed.
// Vocabulary rules carry a token that the quoted part must contain; structure rules (str-*) have none.
test("vocabulary corrections must quote their rule's expression; structure rules are not token-checked", async () => {
  const answer = "残りのコストを基準に判断しました。ちゃんと確認しました。前職では成功しました。";
  const r = { ...reviewFixture, corrections: [
    { rule_id: "rep-shisan", before: "残りのコスト", after: "残りの工数", reason: "자산이 아님" },
    { rule_id: "del-chanto", before: "ちゃんと確認しました", after: "確認しました", reason: "유치하게 들림" },
    { rule_id: "str-ketsuron", before: "前職では成功しました", after: "［結論］と判断しました", reason: "결론을 먼저" },
  ] };
  const out = await generateReview(fakeClient({ result: r }), pack, { question: "Q", answer });
  assert.deepEqual(out.corrections.map((c) => c.rule_id), ["del-chanto", "str-ketsuron"]);
  assert.equal(out.dropped, 1);
  for (const rule of pack.correction_rules) assert.equal("token" in rule, rule.type !== "structure", rule.id);
});

test("/api/script returns a TTS signature for exactly the script text", async () => {
  const { sign } = await import("../lib/guard.js");
  process.env.ACCESS_CODE = "c0de";
  const res = await scriptPOST(new Request("http://x/api/script", { method: "POST", headers: { "x-access-code": "c0de", "x-forwarded-for": "6.6.9.1", "content-type": "application/json" }, body: JSON.stringify({ question: "見積もりは？", answer: "手戻りを減らしました" }) }), { client: fakeClient({ result: asModelScript(scriptFixture) }) });
  const d = await res.json();
  assert.equal(d.ttsSig, sign(d.text));
});
