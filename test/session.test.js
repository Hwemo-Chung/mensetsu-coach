// REL-4 session helpers: save never throws, load validates and migrates the pre-rename shape.
import { test } from "node:test";
import assert from "node:assert/strict";
import { saveSession, loadSession, clearSession, migrateSession, SESSION_KEY, SESSION_VERSION } from "../public/session.js";
import { fixture, scriptFixture, reviewFixture } from "./fake-claude.js";

const memory = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
};
const session = {
  pack: { id: "jp", target: "ja", steps: [] },
  company_context: fixture.company_context,
  questions: fixture.questions.map((q, i) => ({ id: `q${i + 1}`, ...q })),
  attempts: [{ question_id: "q1", answer: "A", review: reviewFixture, script: scriptFixture }],
  specificity: { referenced: 7, required: 6, passed: true },
  notes: { q1: "memo" },
};

test("save → load round-trips with a version; clear removes it", () => {
  const s = memory();
  assert.equal(saveSession(s, session), true);
  assert.equal(JSON.parse(s.getItem(SESSION_KEY)).version, SESSION_VERSION);
  const back = loadSession(s);
  assert.deepEqual(back.questions, session.questions);
  assert.deepEqual(back.notes, { q1: "memo" });
  assert.deepEqual(back.specificity, session.specificity);
  clearSession(s);
  assert.equal(loadSession(s), null);
});

test("a throwing storage (quota, blocked) is reported, never thrown", () => {
  const bad = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("QuotaExceededError"); }, removeItem: () => { throw new Error("blocked"); } };
  assert.equal(saveSession(bad, session), false);
  assert.equal(loadSession(bad), null);
  assert.doesNotThrow(() => clearSession(bad));
});

test("broken, empty or future sessions load as null", () => {
  for (const raw of [null, "", "{", "[]", "1", JSON.stringify({}), JSON.stringify({ ...session, questions: [] }), JSON.stringify({ ...session, company_context: null }),
    JSON.stringify({ ...session, questions: [{ id: "q1" }] }), JSON.stringify({ ...session, version: SESSION_VERSION + 1 })]) {
    assert.equal(loadSession(memory({ [SESSION_KEY]: raw })), null, String(raw));
  }
});

test("version-1 sessions (question_ja, script.ja, reverse question_ja) migrate to the neutral names", () => {
  const old = {
    company_context: { company: "〇〇株式会社", position: "SE" }, // no facts in very old sessions
    questions: [{ id: "q1", stage: "一次面接", category: "技術", question_ja: "移行で難しかった点は？", question_tr: "이행에서 어려웠던 점은?", basis: "b" }],
    attempts: [{ question_id: "q1", answer: "A", review: reviewFixture, script: { ja: "台本", reading: "다이혼", translation: "대본", points: [] } }, { bogus: true }],
    reverse: [{ question_ja: "逆質問？", intent: "i" }],
  };
  const s = migrateSession(old);
  assert.equal(s.version, SESSION_VERSION);
  assert.equal(s.questions[0].question, "移行で難しかった点は？");
  assert.ok(!("question_ja" in s.questions[0]));
  assert.equal(s.attempts.length, 1, "malformed attempt dropped");
  assert.equal(s.attempts[0].script.text, "台本");
  assert.ok(!("ja" in s.attempts[0].script));
  assert.equal(s.reverse[0].question, "逆質問？");
  assert.deepEqual(s.company_context.facts, []);
  assert.deepEqual(s.notes, {});
});
