// Stage R step 6: post-interview debrief. Pure helpers only: storage is passed in, overlap uses no AI.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadDebrief, saveDebrief, clearDebriefs, DEBRIEF_KEY, saveSession, clearSession, SESSION_KEY } from "../public/session.js";
import { questionOverlap, sessionToMarkdown } from "../public/export.js";
import { LANGS } from "../public/i18n/index.js";

const memory = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k), raw: m };
};
const qs = (...list) => list.map((question, i) => ({ id: `q${i + 1}`, question }));

test("debrief: stored per company; spelling variants of one company share an entry; another company stays apart", () => {
  const s = memory();
  assert.equal(saveDebrief(s, "株式会社サンプル（仮）", { asked: "志望動機", difficult: "", outcome: "二次へ" }), true);
  assert.deepEqual(loadDebrief(s, "(株) サンプル（仮）"), { asked: "志望動機", outcome: "二次へ" });
  assert.equal(loadDebrief(s, "別会社（仮）"), null);
  saveDebrief(s, "別会社（仮）", { outcome: "結果待ち" });
  assert.equal(loadDebrief(s, "株式会社サンプル（仮）").outcome, "二次へ");
});

test("debrief: lives under its own key, outlives the session, and is deleted only by emptying or clearing", () => {
  const s = memory();
  saveSession(s, { questions: [] });
  saveDebrief(s, "A", { asked: "x" });
  clearSession(s);
  assert.equal(s.getItem(SESSION_KEY), null);
  assert.deepEqual(loadDebrief(s, "A"), { asked: "x" });
  saveDebrief(s, "B", { asked: "y" });
  saveDebrief(s, "A", { asked: "  " });
  assert.equal(loadDebrief(s, "A"), null, "emptied fields delete that company only");
  assert.deepEqual(loadDebrief(s, "B"), { asked: "y" });
  saveDebrief(s, "B", {});
  assert.equal(s.getItem(DEBRIEF_KEY), null, "nothing left, no key left");
  saveDebrief(s, "C", { asked: "z" });
  clearDebriefs(s);
  assert.equal(s.getItem(DEBRIEF_KEY), null);
});

test("debrief: unknown fields are not stored and odd company names or broken storage stay harmless", () => {
  const s = memory();
  saveDebrief(s, "__proto__", { asked: "x", evil: "y" });
  assert.deepEqual(loadDebrief(s, "__proto__"), { asked: "x" });
  assert.equal(loadDebrief(s, "constructor"), null);
  assert.equal(({}).asked, undefined);
  s.setItem(DEBRIEF_KEY, "{broken");
  assert.equal(loadDebrief(s, "A"), null);
  assert.equal(saveDebrief(s, "A", { asked: "after broken" }), true, "a broken store does not block a new entry");
  const full = { getItem: () => null, setItem: () => { throw new Error("quota"); }, removeItem: () => { throw new Error("blocked"); } };
  assert.equal(saveDebrief(full, "A", { asked: "x" }), false, "the dialog must be able to say it was not saved");
  assert.doesNotThrow(() => clearDebriefs(full));
});

test("overlap: same question in other words counts; shared polite endings alone do not", () => {
  const generated = qs("当社を志望した動機を教えてください。", "見積もりがずれたときの判断の仕方を教えてください。", "メンバーの育成と評価の経験について聞かせてください。");
  assert.deepEqual(questionOverlap(generated, "志望動機を教えてください\n見積もりがずれたときの判断は？"), { asked: 2, matched: 2, ids: ["q1", "q2"] });
  assert.deepEqual(questionOverlap(generated, "趣味を教えてください\n通勤時間はどのくらいですか？"), { asked: 2, matched: 0, ids: [] }, "「教えてください」 is not a match");
});

test("overlap: full-width input, numbering and bullets normalize; a question repeated by the interviewer stays one Q id", () => {
  const generated = qs("AWSの運用経験を教えてください");
  assert.deepEqual(questionOverlap(generated, "1. ＡＷＳの運用経験を教えて下さい\n・AWSの運用経験は？"), { asked: 2, matched: 2, ids: ["q1"] });
});

test("overlap: several questions on one line split; Korean works; the translation counts too", () => {
  assert.equal(questionOverlap(qs("지원 동기를 말씀해 주세요"), "지원 동기를 알려 주세요? 취미는 무엇인가요?").matched, 1);
  assert.equal(questionOverlap(qs("지원 동기를 말씀해 주세요"), "지원 동기를 알려 주세요? 취미는 무엇인가요?").asked, 2);
  const tr = [{ id: "q1", question: "志望動機を教えてください", question_tr: "Why did you apply to this company?" }];
  assert.equal(questionOverlap(tr, "Why did you apply to the company?").matched, 1);
});

test("overlap: nothing written gives zero, not a division by zero; marks and one-character lines are no question", () => {
  assert.deepEqual(questionOverlap(qs("志望動機"), ""), { asked: 0, matched: 0, ids: [] });
  assert.deepEqual(questionOverlap(qs("志望動機"), undefined), { asked: 0, matched: 0, ids: [] });
  assert.deepEqual(questionOverlap(qs("志望動機"), "？？\n・\nA"), { asked: 0, matched: 0, ids: [] });
  assert.deepEqual(questionOverlap([{ id: "q1", question: "はい" }], "志望動機"), { asked: 1, matched: 0, ids: [] }, "too short to compare");
});

const session = { company_context: { company: "サンプル（仮）", position: "PM（仮）" }, questions: qs("志望動機を教えてください"), attempts: [] };

test("export: the debrief appears masked with its three labels, in every language; empty fields leave no heading", () => {
  const debrief = { asked: "志望動機\n連絡先 03-1234-5678", outcome: "二次へ a@example.com" };
  for (const t of Object.values(LANGS)) {
    const md = sessionToMarkdown(session, t, debrief);
    for (const s of [`## ${t.debrief.title}`, t.debrief.asked, t.debrief.outcome, "志望動機\n連絡先 [phone]", "二次へ [email]"]) assert.ok(md.includes(s), s);
    assert.ok(!md.includes(t.debrief.difficult), "an empty field has no label");
  }
});

test("export: without a debrief the file is the same as before; the overlap figure never goes into the file", () => {
  const t = LANGS.ja;
  const plain = sessionToMarkdown(session, t);
  assert.ok(!plain.includes(t.debrief.title));
  assert.equal(plain, sessionToMarkdown(session, t, null));
  const md = sessionToMarkdown(session, t, { asked: "志望動機を教えてください" });
  assert.ok(!md.includes(t.debrief.overlap({ matched: 1, asked: 1, ids: "Q1" })));
});
