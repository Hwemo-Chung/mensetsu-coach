// Offline unit tests for lib/consistency-metrics.js. Known answers: EVIDENCE-V3 §3.3 hand-measured the three recorded
// demo scripts (220/163/138 chars, 7/4/5 sentences, 16/16 endings).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  sentences, charLen, blankCount, endingOk, stepLabels, stepPattern, frameOk, modeShare, spread,
  jaccard, meanPairwiseJaccard, scriptGates, summarizeScripts, summarizeReviews, costOf,
} from "../lib/consistency-metrics.js";

const demo = (l) => JSON.parse(readFileSync(new URL(`../public/demo/demo-${l}.json`, import.meta.url), "utf8")).steps[0].script.text;
const [ko, ja, en] = ["ko", "ja", "en"].map(demo);

test("length and sentence count reproduce the EVIDENCE-V3 hand measurement", () => {
  assert.deepEqual([ko, ja, en].map(charLen), [220, 163, 138]);
  assert.deepEqual([ko, ja, en].map((t) => sentences(t).length), [7, 4, 5]);
  assert.equal([ko, ja, en].flatMap(sentences).filter(endingOk).length, 16);
});

test("blank = one char and counted; half/full-width both", () => {
  assert.equal(charLen("［ここに数字］です。"), 4);
  assert.equal(charLen("[x] です。"), 4);
  assert.equal(blankCount(ko), 2);
  assert.equal(blankCount("なし。"), 0);
});

test("ending vocabulary: polite forms pass, plain forms and nouns fail", () => {
  for (const s of ["判断いたします。", "成功しました。", "どちらからご説明しましょうか？", "ですね", "伺えますか?"]) assert.ok(endingOk(s), s);
  for (const s of ["判断した。", "成功だ。", "以上、よろしくお願いします！", "基準は工数。"]) assert.ok(!endingOk(s), s);
});

test("step labels on the recorded scripts", () => {
  assert.deepEqual(stepLabels(ja), ["F", "K", "K", "C"]);
  assert.equal(stepPattern(ja), "F-K-C");
  assert.equal(stepPattern(en), "F-K-C");
  // 2nd sentence holds both 結論 and 基準 → K (known limit: 結論 is not detectable by markers)
  assert.equal(stepPattern(ko), "F-K-O-K-C");
  assert.ok([ko, ja, en].every(frameOk));
});

test("復唱 opener variants from the live baseline all count", () => {
  for (const s of ["見積もりがずれたときの判断について、お答えします。", "見積もりがずれたときの判断について、事例をお話しします。", "自己紹介をいたします。", "転職を考えた理由についてお答えいたします。", "自己紹介ですね。"])
    assert.equal(stepLabels(s + "基準は工数です。")[0], "F", s);
  // a conclusion-first opener is not 復唱
  assert.equal(stepLabels("成長したいからです。")[0], "O");
});

test("frame fails without 復唱 or without a hand-back", () => {
  assert.equal(stepPattern("前職ではチームで導入しました。評価もいただきました。"), "K-O");
  assert.ok(!frameOk("前職ではチームで導入しました。評価もいただきました。"));
  assert.ok(!frameOk("転職理由ですね。成長したいからです。"));
  // 貢献 counts as a close only in the last sentence
  assert.equal(stepPattern("転職理由ですね。経験を活かしたいと考えました。御社に貢献いたします。"), "F-O-C");
});

test("modeShare / spread", () => {
  assert.deepEqual(modeShare(["a", "b", "a"]), { mode: "a", share: 2 / 3, n: 3 });
  assert.deepEqual(modeShare([]), { mode: null, share: 0, n: 0 });
  const s = spread([2, 4]);
  assert.equal(s.mean, 3);
  assert.equal(s.cv, 1 / 3);
});

test("jaccard: empty-empty agrees, disjoint is 0", () => {
  assert.equal(jaccard([], []), 1);
  assert.equal(jaccard(["a"], ["b"]), 0);
  assert.equal(jaccard(["a", "b"], ["b", "c"]), 1 / 3);
  assert.equal(meanPairwiseJaccard([["a"], ["a"], ["b"]]), 1 / 3);
  assert.equal(meanPairwiseJaccard([["a"]]), null);
});

test("scriptGates names the failing gate on a raw first call", () => {
  const good = { ja: "判断についてですね。基準は［ここに数字］です。", reading: "はんだんについてですね", translation: "판단에 대해서군요. 기준은 숫자입니다.", points: ["끝을 내립니다."] };
  assert.ok(scriptGates(good, "質問").all);
  assert.equal(scriptGates({ ...good, ja: "基準は30%です。" }, "質問").grounded, false);
  assert.equal(scriptGates({ ...good, ja: "基準は30%です。" }, "30%減らしました").grounded, true);
  assert.equal(scriptGates({ ...good, reading: "判断について" }, "").readingOk, false);
  assert.equal(scriptGates({ ...good, translation: "判断についてですね。" }, "").translationOk, false);
  assert.equal(scriptGates({ ...good, points: ["語尾を下げる"] }, "").pointsOk, false);
});

test("summaries carry ok/N and flag empty correction runs", () => {
  const s = summarizeScripts([ja, en], "", 5);
  assert.equal(s.ok, "2/5");
  assert.equal(s.pattern.share, 1);
  assert.equal(s.ungrounded, 0);
  const r = (aq, ids, p = true) => ({ answers_question: aq, steps: { fukusho: { present: p } }, corrections: ids.map((rule_id) => ({ rule_id })) });
  const R = summarizeReviews([r("no", ["a"]), r("no", ["a", "b"]), r("yes", [], false)], 5);
  assert.equal(R.ok, "3/5");
  assert.equal(R.answers_question.mode, "no");
  assert.equal(R.steps.fukusho.share, 2 / 3);
  assert.equal(R.empty_runs, 1);
  assert.equal(R.rule_jaccard, (0.5 + 0 + 0) / 3);
});

test("cost: known prices, unknown model is reported not guessed", () => {
  const c = costOf([{ model: "claude-sonnet-5-5", in: 1e6, out: 1e5 }, { model: "claude-opus-5-5", in: 1e5, out: 1e5 }, { model: "x", in: 1, out: 1 }]);
  assert.equal(c.usd.toFixed(2), (2 + 1 + 0.4 + 2).toFixed(2));
  assert.deepEqual(c.unknown_models, ["x"]);
});
