import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionToMarkdown, exportFileName } from "../public/export.js";
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
  for (const q of fixture.questions) assert.ok(md.includes(q.question_ja), q.question_ja);
  assert.ok(md.includes("① 구조 점검") && md.includes("② 첨삭") && md.includes("③ 모범 스크립트"));
  assert.ok(md.includes(scriptFixture.ja) && md.includes(scriptFixture.reading) && md.includes(scriptFixture.translation));
  assert.ok(md.includes("【str-ketsuron】"));
  assert.ok(md.includes("1차 면접"), "stage label translated");
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
  assert.ok(sessionToMarkdown({ ...session, attempts: [] }, LANGS.ja).includes(fixture.questions[0].question_ja));
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
