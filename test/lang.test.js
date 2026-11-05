// 2-axis language rule (user-confirmed 11/03): the pack's target language is what is spoken in the interview
// (questions, scripts); everything else is in the native language (= UI lang). Reading script depends on both.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPack, PACKS, TARGET_LANGS, READINGS, EXPLAIN_LANGS, buildQuestionRequest, buildScriptRequest, buildReviewRequest, generateQuestions, generateScript, generateReview, maskInput, countSpecific } from "../lib/coach.js";
import { POST as questionsPOST } from "../api/questions.js";
import { POST as scriptPOST } from "../api/script.js";
import { POST as reviewPOST } from "../api/review.js";
import { POST as reversePOST } from "../api/reverse.js";
import { sessionToMarkdown } from "../public/export.js";
import { LANGS } from "../public/i18n/index.js";
import { fakeClient, fixture, scriptFixture, reviewFixture, reverseFixture, asModelScript } from "./fake-claude.js";

// Expected reading scripts, written independently of the registry: [target][native] → pattern for its name.
const EXPECTED_READING = { ja: { ko: /ハングル/, en: /ヘボン/ }, ko: { ja: /カタカナ/, en: /Revised Romanization/ }, en: { ko: /IPA/, ja: /IPA/ } };

// C3·C5 (11/03) add parts/closing/issues to every script result; whole-output comparisons check the earlier fields only.
const core = ({ parts, closing, issues, ttsSig, ...x }) => x; // ttsSig: API only (11/03)
test("registries: packs jp/kr, target languages ja/ko/en, reading table follows the rule", () => {
  assert.deepEqual(PACKS, ["jp", "kr"]);
  assert.deepEqual(Object.keys(TARGET_LANGS).sort(), ["en", "ja", "ko"]);
  for (const [target, row] of Object.entries(EXPECTED_READING)) {
    for (const [native, re] of Object.entries(row)) assert.match(READINGS[target][native].name, re, `${target}/${native}`);
    assert.equal(READINGS[target][target], undefined, `${target}/${target}: same language has no reading`);
  }
});

for (const id of ["jp", "kr"]) {
  const pack = loadPack(id);
  const target = pack.language_pair.target;
  const TL = TARGET_LANGS[target];
  for (const lang of ["ko", "en", "ja"]) {
    const L = EXPLAIN_LANGS[lang];
    const same = target === lang;
    test(`${id}/${lang}: interview text in ${target}, explanations in ${lang}, reading ${same ? "and translation absent" : "per table"}`, () => {
      // questions: valid schema for this pack, question in the target language, translation/basis in native
      const q = buildQuestionRequest(pack, "MAIL", [], lang);
      const item = q.output_config.format.schema.properties.questions.items;
      assert.ok(item.properties.stage.enum.length > 0 && item.properties.category.enum.length > 0, "non-empty enums");
      assert.ok("question" in item.properties && !("question_ja" in item.properties));
      assert.ok(q.messages[0].content.includes(`question は必ず${TL.name}で書く`));
      // Intent changed (review 11/03): target == native → no translation at all, so question_tr is neither requested nor in the schema.
      if (same) {
        assert.ok(!("question_tr" in item.properties) && !item.required.includes("question_tr"), "same language: no question_tr in schema");
        assert.ok(!q.messages[0].content.includes("question_tr") && q.messages[0].content.includes(`basis は${L.name}で書く`));
      } else {
        assert.ok(item.required.includes("question_tr"));
        assert.ok(q.messages[0].content.includes(`question_tr と basis は${L.name}で書く`));
      }
      assert.ok(q.system.includes(`面接で話す文は${TL.name}`) && q.system.includes(`説明は${L.name}`));
      // ③ format line is built from the reading table and the native language name (no pack-fixed Korean/Japanese text).
      const third = q.system.split("\n").find((l) => l.startsWith("③"));
      if (same) assert.ok(third.includes(`${TL.name}の模範回答`) && !/発音表記|訳/.test(third), third);
      else assert.ok(third.includes(`${TL.name}の1文ごとに、${READINGS[target][lang].name}の発音表記と${L.name}訳`), third);
      for (const k of Object.keys(LANGS)) if (k !== lang && k !== target) assert.ok(!third.includes(READINGS[target][k].name), `${third} mentions ${k} reading`);

      // script: text in target; reading per table; same language → no reading/translation at all
      const s = buildScriptRequest(pack, { question: "Q", answer: "A", lang });
      const schema = s.output_config.format.schema;
      // Model-facing key = target language code (see generate.test.js: neutral "text" made the live model write everything in the target language).
      assert.deepEqual(schema.required, same ? [target, "points"] : [target, "reading", "translation", "points"]);
      assert.ok(s.system.includes(`${target}: ${TL.name}のビジネス敬語`));
      assert.ok(s.system.includes(`points: ${L.name}で`));
      if (same) {
        assert.ok(!("reading" in schema.properties) && !("translation" in schema.properties));
        assert.doesNotMatch(s.system, /reading|translation/);
      } else {
        // Intent changed (11/03): a Japanese reading is asked for in hiragana and converted to the table's script afterwards.
        assert.match(s.system, new RegExp(`reading: ${target} を[^\\n]*${target === "ja" ? "ひらがな" : EXPECTED_READING[target][lang].source}`));
        assert.ok(s.system.includes(`translation: ${L.name}の訳`));
      }

      // review: corrections only on target-language text, notes in native
      const r = buildReviewRequest(pack, { question: "Q", answer: "A", lang });
      assert.ok(r.system.includes(`添削は${TL.name}の文にだけ`) && r.system.includes(`${L.name}で書きます`));
      assert.ok(r.system.includes(`${pack.country}の面接の採点者`));
      assert.ok(r.output_config.format.schema.properties.corrections.items.properties.rule_id.enum.length > 0);
    });
  }
}

const kr = loadPack("kr");
const krQuestions = { ...fixture, questions: fixture.questions.map((q, i) => ({ ...q, stage: kr.question_taxonomy.stages[0], category: kr.question_taxonomy.categories[i % 5], question: "우리 회사에 지원한 이유를 말씀해 주십시오.", question_tr: "当社を志望した理由を教えてください。", basis: "募集要項にある事業です。" })) };

test("kr pack: beta, filled stages, a source note, 3 rules of the PRD shape, generic_terms", () => {
  assert.equal(kr.id, "kr");
  assert.equal(kr.beta, true);
  assert.ok(kr.question_taxonomy.stages.length >= 2 && typeof kr.note === "string" && kr.note.length > 0);
  // Intent changed (review 11/03): kr now carries Korean generic terms like jp, so empty is no longer expected.
  assert.ok(kr.question_taxonomy.generic_terms.length >= 10 && kr.question_taxonomy.generic_terms.includes("회사"));
  for (const p of [kr, loadPack("jp")]) {
    assert.ok(!("description" in p.model_answer_format) && !("lines" in p.model_answer_format), `${p.id}: dead format fields removed`);
    assert.ok(!("native" in p.language_pair), `${p.id}: native comes from the UI language, not the pack`);
  }
  assert.equal(kr.correction_rules.length, 3);
  for (const r of kr.correction_rules) for (const k of ["id", "pattern", "type", "replacement", "reason", "example_before", "example_after"]) assert.ok(k in r, `${r.id} ${k}`);
  assert.ok(loadPack("jp").question_taxonomy.generic_terms.includes("チーム"), "jp keeps its generic terms as data");
});

test("kr gates: Korean question passes, Japanese question is retried then fails; result carries pack meta", async () => {
  const out = await generateQuestions(fakeClient({ result: krQuestions }), kr, "MAIL", [], "ja");
  assert.deepEqual(out.pack, { id: "kr", target: "ko", steps: kr.answer_structure.steps.map(({ key, label }) => ({ key, label })) });
  await assert.rejects(generateQuestions(fakeClient({ responses: [fixture, fixture] }), kr, "MAIL", [], "ja"), /question not in ko/);
});

test("kr/ja script gate: katakana reading; a Japanese explanation may quote Korean (은/는)", async () => {
  const ok = { text: "네, 일정이 밀렸을 때는 먼저 영향 범위를 확인합니다.", reading: "ネ、/イルジョンイ 《ミルリョッスル》 テヌン↘", translation: "はい、日程が遅れたときは、まず影響範囲を確認します。", points: ["「은/는」ではなく「이/가」で新しい情報を示す。", "最後は下げて言い切る。"] };
  assert.deepEqual(core(await generateScript(fakeClient({ result: asModelScript(ok, "ko") }), kr, { question: "Q", answer: "A", lang: "ja" })), ok);
  const hangulReading = { ...ok, reading: "네, 일정이" };
  await assert.rejects(generateScript(fakeClient({ responses: [asModelScript(hangulReading, "ko"), asModelScript(hangulReading, "ko")] }), kr, { question: "Q", answer: "A", lang: "ja" }), /language check/);
  // The quote tolerance is for a Korean target only: on the jp pack a Japanese explanation still may not contain Hangul.
  assert.equal(EXPLAIN_LANGS.ja.isText("「은/는」ではなく「이/가」を使う。", "ko"), true);
  assert.equal(EXPLAIN_LANGS.ja.isText("「은/는」ではなく「이/가」を使う。", "ja"), false);
  assert.equal(EXPLAIN_LANGS.en.isText("Use 이/가 instead of 은/는 here.", "ko"), true);
  assert.equal(EXPLAIN_LANGS.en.isText("Use 이/가 instead of 은/는 here.", "ja"), false);
});

test("same language (kr/ko, jp/ja): script is text + points only and passes the gate", async () => {
  const krSame = { text: "네, 먼저 영향 범위를 확인합니다.", points: ["결론을 먼저 말합니다.", "끝을 내려 말합니다."] };
  assert.deepEqual(core(await generateScript(fakeClient({ result: asModelScript(krSame, "ko") }), kr, { question: "Q", answer: "A", lang: "ko" })), krSame);
  const jpSame = { text: scriptFixture.text, points: ["最初の文は語尾を下げる。", "数字ははっきり言う。"] };
  assert.deepEqual(core(await generateScript(fakeClient({ result: asModelScript(jpSame) }), loadPack("jp"), { question: "Q", answer: "A", lang: "ja" })), jpSame);
});

test("kr review gate: a correction whose 'after' is not Korean is dropped; notes in Japanese may quote Korean", async () => {
  const answer = "회의 중에 갑자기 서버는 멈췄습니다. 저는 팀을 이끄셨습니다.";
  const steps = Object.fromEntries(kr.answer_structure.steps.map((s) => [s.key, { present: false, note: "最初に「질문 확인」を入れる。" }]));
  const res = { answers_question: "unclear", answers_question_reason: "質問への答えが分からない。", steps, corrections: [
    { rule_id: "kr-topic-ga", before: "서버는 멈췄습니다", after: "서버가 멈췄습니다", reason: "新しい情報なので「은/는」ではなく「이/가」。" },
    { rule_id: "kr-shi-overuse", before: "이끄셨습니다", after: "率いました", reason: "自分の行為に「-시」は使わない。" },
  ] };
  const out = await generateReview(fakeClient({ result: res }), kr, { question: "Q", answer, lang: "ja" });
  assert.deepEqual(out.corrections.map((c) => c.rule_id), ["kr-topic-ga"]);
  assert.equal(out.dropped, 1);
});

test("APIs: pack allowlist → 400 pack_unsupported; reverse is JP-only; pack kr works end to end with the fake client", async () => {
  process.env.ACCESS_CODE = "c0de";
  let ip = 0;
  const req = (path, body) => new Request(`http://x${path}`, { method: "POST", headers: { "x-access-code": "c0de", "x-forwarded-for": `2.4.6.${ip++}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  const check = async (res, status, body) => { assert.equal(res.status, status); assert.deepEqual(await res.json(), body); };
  const bad = { code: "pack_unsupported" };
  await check(await questionsPOST(req("/api/questions", { mail: "M", pack: "zz" })), 400, bad);
  await check(await questionsPOST(req("/api/questions", { mail: "M", pack: "../jp" })), 400, bad);
  await check(await scriptPOST(req("/api/script", { question: "Q", answer: "A", pack: "zz" })), 400, bad);
  await check(await reviewPOST(req("/api/review", { question: "Q", answer: "A", pack: "zz" })), 400, bad);
  await check(await reversePOST(req("/api/reverse", { context: { company: "C", position: "P", facts: [] }, pack: "kr" })), 400, bad);
  const ok = await questionsPOST(req("/api/questions", { mail: "M", pack: "kr", lang: "ja" }), { client: fakeClient({ result: krQuestions }) });
  assert.equal(ok.status, 200);
  const data = await ok.json();
  assert.equal(data.pack.id, "kr");
  assert.ok(data.questions.every((q) => "question" in q && !("question_ja" in q)));
  // default pack stays jp
  const jp = await (await questionsPOST(req("/api/questions", { mail: "M" }), { client: fakeClient() })).json();
  assert.equal(jp.pack.id, "jp");
  assert.equal((await reversePOST(req("/api/reverse", { context: { company: "C", position: "P", facts: [] } }), { client: fakeClient({ result: reverseFixture }) })).status, 200);
});

test("maskInput: a Korean salutation line (…님) is masked like 様", () => {
  assert.equal(maskInput("홍길동 님\n안녕하세요"), "[氏名]님\n안녕하세요");
});

// Review 11/03: POSTAL ran before PHONE, so 090-1234-5678 became "[〒]-5678" and the tail digits leaked.
test("maskInput: an employment period is a date, not a phone; the same digits as one number still are", () => {
  for (const p of ["2019.04 - 2023.03", "2019.04-2023.03", "2019-04 - 2023-03", "2019.04.01 - 2023.03.31", "2019.04 - 2023.03 2023.04 - 2025.03"]) assert.equal(maskInput(`在籍 ${p} 担当`), `在籍 ${p} 担当`, p);
  for (const p of ["2019-0420-2303", "0120-04-2023-03"]) assert.equal(maskInput(`連絡先 ${p}`), "連絡先 [phone]", p);
});

test("maskInput: every JP/KR phone format becomes [phone]; postal codes stay [〒]", () => {
  for (const p of ["090-1234-5678", "080-9999-0000", "03-1234-5678", "010-1234-5678", "02-123-4567", "01012345678", "09012345678", "+81-90-1234-5678", "+81 3 1234 5678", "+82-10-1234-5678", "+82 10 1234 5678", "0120-123-456"]) {
    assert.equal(maskInput(`連絡先: ${p} まで`), "連絡先: [phone] まで", p);
  }
  assert.equal(maskInput("〒123-4567 東京都"), "[〒] 東京都");
  assert.equal(maskInput("住所 123-4567 東京都"), "住所 [〒] 東京都", "the space before a bare postal code stays");
  assert.equal(maskInput("〒100-0001\n090-0000-0000"), "[〒]\n[phone]");
});

test("countSpecific with the kr pack ignores Korean generic terms", () => {
  const terms = kr.question_taxonomy.generic_terms;
  for (const w of ["회사", "경험", "개발", "업무", "프로젝트", "직무", "역량", "고객", "서비스"]) assert.ok(terms.includes(w), w);
  const mail = "회사 경험 개발 업무 프로젝트 직무 역량 고객 서비스 물류 재고관리 SaaS";
  const generic = ["회사", "경험", "개발", "업무", "프로젝트", "직무", "역량", "고객", "서비스"].map((w) => ({ question: `${w}에 대해 말씀해 주십시오.`, refs: [w] }));
  assert.equal(countSpecific(generic, mail, terms), 0);
  assert.equal(countSpecific([...generic, { question: "재고관리 SaaS 경험을 말씀해 주십시오.", refs: ["재고관리"] }], mail, terms), 1);
});

test("same language (jp/ja): questions without question_tr pass the gate", async () => {
  const noTr = { ...fixture, questions: fixture.questions.map(({ question_tr, ...q }) => ({ ...q, basis: "求人票の事業です。" })) };
  const out = await generateQuestions(fakeClient({ result: noTr }), loadPack("jp"), "MAIL", [], "ja");
  assert.ok(out.questions.every((q) => !("question_tr" in q)));
});

test("TARGET_LANGS.en: a Hangul blank ［…］ is allowed like ko, bare Hangul is not", () => {
  assert.equal(TARGET_LANGS.en.is("I reduced it by ［여기에 실적 숫자］ percent."), true);
  assert.equal(TARGET_LANGS.en.is("I reduced it by 실적 percent."), false);
});

test("export: renamed fields, pack step labels (JP fallback), reading/translation skipped when absent", () => {
  const questions = fixture.questions.map((q, i) => ({ id: `q${i + 1}`, ...q }));
  const review = { ...reviewFixture, corrections: [] };
  const base = { company_context: fixture.company_context, questions, attempts: [{ question_id: "q1", answer: "A", review, script: scriptFixture }] };
  const md = sessionToMarkdown(base, LANGS.ko);
  assert.ok(md.includes(questions[0].question) && md.includes(scriptFixture.text) && md.includes(scriptFixture.reading));
  // 復唱 is optional since 11/03 (PRD §16-15): a missing one exports as "·" (recommended), not ✗; intent unchanged.
  assert.ok(md.includes("· 復唱"), "no pack meta → JP step labels");
  const krSession = { ...base, pack: { id: "kr", target: "ko", steps: kr.answer_structure.steps.map(({ key, label }) => ({ key, label })) }, attempts: [{ question_id: "q1", answer: "A", review, script: { text: "네, 확인합니다.", points: ["결론 먼저"] } }] };
  const md2 = sessionToMarkdown(krSession, LANGS.ko);
  assert.ok(md2.includes("✗ 질문 확인") && !md2.includes("復唱"));
  assert.ok(md2.includes("네, 확인합니다.") && !md2.includes("**발음") && !md2.includes(LANGS.ko.script.legend));
  assert.ok(md2.includes(`**${LANGS.ko.script.text.ko}**`), "kr script labelled with the Korean target");
  // Same language: no question_tr → no "undefined" line.
  const noTr = { ...base, questions: questions.map(({ question_tr, ...q }) => q), attempts: [] };
  assert.ok(!sessionToMarkdown(noTr, LANGS.ja).includes("undefined"));
});

test("labels follow the pack target and the native script (kr session, Japanese screen)", () => {
  const ja = LANGS.ja;
  const s = { company_context: fixture.company_context, questions: [{ id: "q1", stage: "1차 실무면접", category: "즉시 기여", question: "입사 후 무엇을 하겠습니까?", question_tr: "入社後、何をしますか。", basis: "求人票" }],
    pack: { id: "kr", target: "ko", steps: kr.answer_structure.steps.map(({ key, label }) => ({ key, label })) },
    attempts: [{ question_id: "q1", answer: "A", script: { text: "네, 확인합니다.", reading: "ネ、/ファギナムニダ↘", translation: "はい、確認します。", points: ["結論を先に言う。"] } }] };
  const md = sessionToMarkdown(s, ja);
  for (const label of ["**韓国語**", "**読み方（カタカナ）**", "**日本語訳**"]) assert.ok(md.includes(label), label);
  assert.ok(!md.includes("**日本語**") && !md.includes("ひらがな"));
});

test("ko translation gate: Hangul must be the majority; review notes may still quote Japanese heavily", async () => {
  assert.equal(EXPLAIN_LANGS.ko.isProse("前職で最も大変だったことは、新しい管理ツールの導入です。［여기］"), false);
  assert.equal(EXPLAIN_LANGS.ko.isProse("전 직장에서 가장 힘들었던 점은 새 관리 도구 도입입니다."), true);
  assert.equal(EXPLAIN_LANGS.ko.isText("예: 「前職で最も大変だったことですね。」"), true);
  const jp = loadPack("jp");
  const jpTranslation = asModelScript({ ...scriptFixture, translation: "前職で最も大変だったことは導入です。여기" });
  // 2nd call = translation-only retry (generate.test.js); a Japanese translation there fails too.
  await assert.rejects(generateScript(fakeClient({ responses: [jpTranslation, jpTranslation] }), jp, { question: "Q", answer: "A", lang: "ko" }), /language check/);
});

// Intent changed (11/03): the fixHangulReading hack (drop ッ, ー → -) turned もっとも into 모토모. The model now writes
// hiragana and lib/kana.js converts it; a Hangul reading with leftover kana is no longer patched, it is retried.
test("Hangul reading comes from hiragana: もっとも → 못토모, ルール → 루우루; a mixed reading is rejected", async () => {
  const jp = loadPack("jp");
  const out = await generateScript(fakeClient({ result: { ...asModelScript(scriptFixture), reading: "ぜんしょくで 《もっとも》 かんりるーる" } }), jp, { question: "Q", answer: "A", lang: "ko" });
  assert.equal(out.reading, "젠쇼쿠데 《못토모》 칸리루우루");
  const mixed = { ...asModelScript(scriptFixture), reading: "젠쇼쿠데 《모ッ토모》" };
  await assert.rejects(generateScript(fakeClient({ responses: [mixed, mixed] }), jp, { question: "Q", answer: "A", lang: "ko" }), /language check/);
  assert.equal("fixHangulReading" in await import("../lib/lang.js"), false);
});

// Product review 11/03: isJapanese only rejected Hangul, so Chinese and mostly-English lines passed as Japanese.
// A long line without kana is Chinese; Latin letters outnumbering Japanese characters is English. Short kanji-only
// words (a correction like 「理解」) still count as Japanese.
test("isJapanese rejects Chinese sentences and mostly-English lines, keeps short kanji words", async () => {
  const { isJapanese } = await import("../lib/lang.js");
  assert.equal(isJapanese("请介绍一下你在团队管理方面的经验。"), false);
  assert.equal(isJapanese("Please describe your 経験 in teams."), false);
  for (const ok of ["理解", "承知いたしました。", "Python / AWSの環境で進めるとしたら、最初に何を確認しますか。", "見積もりがずれたときの判断、ですね。"]) assert.equal(isJapanese(ok), true, ok);
});
