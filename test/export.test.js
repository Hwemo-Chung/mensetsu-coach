import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionToMarkdown, exportFileName, compareAttempts, mask } from "../public/export.js";
import { maskInput } from "../lib/privacy.js";
import { LANGS } from "../public/i18n/index.js";
import { fixture, scriptFixture, reviewFixture } from "./fake-claude.js";

const session = {
  company_context: fixture.company_context,
  questions: fixture.questions.map((q, i) => ({ id: `q${i + 1}`, ...q })),
  attempts: [{ question_id: "q3", answer: "먼저 영향 범위를 확인합니다. 연락처 test@example.com", review: { ...reviewFixture, corrections: reviewFixture.corrections.slice(0, 1), dropped: 1 }, script: scriptFixture }],
};

test("F6 markdown: company, all 10 questions, each attempt with ① review ② corrections ③ script", () => {
  const md = sessionToMarkdown(session, LANGS.ko);
  assert.match(md, /^# /);
  assert.ok(md.includes(fixture.company_context.position));
  for (const q of fixture.questions) assert.ok(md.includes(q.question), q.question);
  assert.ok(md.includes("① 구조 점검") && md.includes("② 첨삭") && md.includes("③ 모범 스크립트"));
  assert.ok(md.includes(scriptFixture.text) && md.includes(scriptFixture.reading) && md.includes(scriptFixture.translation));
  assert.ok(md.includes("【str-ketsuron】"));
  assert.ok(md.includes("1차 면접"), "stage label translated");
});

// m5: public/ cannot import lib/, so export.js carries a copy of lib/privacy.js maskInput; this keeps the two in step.
test("F6 masking: export mask equals the server maskInput on the same samples (postal code in a memo included)", () => {
  const samples = ["〒100-0001 東京都千代田区", "100-0001", "連絡先 03-1234-5678 / +81 90 1234 5678", "mail: a.b+c@example.co.jp", "山田様", "  홍길동 님", "〒100-0001\n090-1234-5678", "株式会社サンプル 様式 3-4"];
  for (const s of samples) assert.equal(mask(s), maskInput(s), s);
  const md = sessionToMarkdown({ ...session, notes: { q1: "面接会場 〒100-0001\n担当 山田様" } }, LANGS.ko);
  assert.ok(!md.includes("100-0001"), "postal code in a memo is masked");
});

test("F6 markdown: personal-data patterns are masked in the exported document (PRD F6 gate)", () => {
  const md = sessionToMarkdown(session, LANGS.ko);
  assert.ok(!/[\w.+-]+@[\w-]+\.[\w.-]+/.test(md), "no email");
  assert.ok(!/0\d{1,3}-\d{2,4}-\d{4}/.test(md), "no phone");
  assert.ok(md.includes("[email]"));
});

test("F6 markdown: works with no attempts and with a failed review; labels follow the language", () => {
  const md = sessionToMarkdown({ ...session, attempts: [{ question_id: "q1", answer: "A", review: null, script: scriptFixture }] }, LANGS.en);
  assert.ok(md.includes("③ Model script"));
  assert.ok(!md.includes("① Structure check"));
  assert.ok(sessionToMarkdown({ ...session, attempts: [] }, LANGS.ja).includes(fixture.questions[0].question));
});

test("F6 file name: date only, no company name", () => {
  assert.equal(exportFileName(new Date("2026-11-02T10:00:00+09:00")), "mensetsu-2026-11-02.md");
});

test("F9 habitCounts: counts corrections per rule across attempts, flags ≥2 as a habit, uses the short pattern", async () => {
  const { habitCounts } = await import("../public/export.js");
  const mk = (ids) => ({ review: { corrections: ids.map((id) => ({ rule_id: id, pattern: id === "del-chanto" ? "ちゃんと" : "〜の形 / 〜という形で" })) } });
  const counts = habitCounts({ attempts: [mk(["del-chanto", "del-katachi"]), mk(["del-chanto"]), { review: null }, mk(["del-chanto"])] });
  assert.deepEqual(counts, [{ rule_id: "del-chanto", label: "ちゃんと", count: 3, habit: true }, { rule_id: "del-katachi", label: "〜の形", count: 1, habit: false }]);
  assert.deepEqual(habitCounts({ attempts: [] }), []);
});

test("F9 export includes a habit summary when there are corrections", () => {
  const withC = { ...session, attempts: [{ ...session.attempts[0] }] };
  const md = sessionToMarkdown(withC, LANGS.ko);
  assert.ok(md.includes(LANGS.ko.habits.summary));
});

test("notes: each question's memo is exported under that question and masked", () => {
  const md = sessionToMarkdown({ ...session, notes: { q2: "숫자 먼저\n연락 test@example.com" } }, LANGS.ko);
  const at = md.indexOf(fixture.questions[1].question);
  const memo = md.indexOf(`- ${LANGS.ko.export.notes}: 숫자 먼저\n     연락 [email]`);
  assert.ok(at > 0 && memo > at && memo < md.indexOf(fixture.questions[2].question), "memo sits under Q2");
  assert.equal(sessionToMarkdown(session, LANGS.ko).includes(`${LANGS.ko.export.notes}:`), false, "no memo, no line");
});

test("compareAttempts: null below two reviewed attempts; first vs latest per step otherwise", () => {
  const miss = { ...reviewFixture, answers_question: "no" };
  const all = { ...reviewFixture, answers_question: "yes", steps: Object.fromEntries(Object.keys(reviewFixture.steps).map((k) => [k, { present: true, note: "" }])) };
  const s = { ...session, attempts: [{ question_id: "q3", answer: "first", review: miss }, { question_id: "q4", answer: "other", review: all }, { question_id: "q3", answer: "no review", review: null }] };
  assert.equal(compareAttempts(s, "q3"), null, "one reviewed attempt only");
  s.attempts.push({ question_id: "q3", answer: "mid", review: miss }, { question_id: "q3", answer: "last", review: all });
  const c = compareAttempts(s, "q3");
  assert.equal(c.n, "3");
  assert.deepEqual(c.answered, ["no", "yes"]);
  assert.deepEqual(c.answers, ["first", "last"]);
  // Label 選択肢 → 締め 11/03 (PRD §16-15: the last step closes by question type); intent unchanged.
  assert.deepEqual(c.steps.map((x) => x.label), ["復唱", "結論", "基準・数字", "締め"], "JP labels when the session has no pack meta");
  assert.ok(c.steps.every((x) => x.last));
  assert.deepEqual(c.steps.map((x) => x.first), Object.values(miss.steps).map((v) => v.present));
  const kr = compareAttempts({ ...s, pack: { steps: [{ key: "ketsuron", label: "결론" }] } }, "q3");
  assert.deepEqual(kr.steps.map((x) => x.label), ["결론"], "pack step labels win");
});
