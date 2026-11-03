// V4 read-aloud check: pure string comparison of the script's hiragana reading (/api/script `kana`) with the
// hiragana of what was heard (/api/stt?kana=1). No AI judgement, 0 calls.
import { test } from "node:test";
import assert from "node:assert/strict";
import { compareReading, READ_OK } from "../public/readcheck.js";
import { scriptKana } from "./fake-claude.js";

const strip = (r) => r.spans.map(({ expected, heard, sentence }) => ({ expected, heard, sentence }));

test("identical reading → ratio 1, no spans, ok", () => {
  assert.deepEqual(compareReading(scriptKana, scriptKana), { ratio: 1, ok: true, spans: [] });
  assert.equal(READ_OK, 0.9);
});

test("marks, spaces, punctuation and ［blanks］ in the script are ignored; the number said for a blank is not an error", () => {
  // What the speaker actually says: no ↗↘《》/ marks, real values in place of the blanks.
  const said = scriptKana.replace(/［期限］/, "みっか").replace(/［ここに実績の数字］/, "さんわり").replace(/[↗↘《》/\s]/g, "");
  const r = compareReading(scriptKana, said);
  assert.equal(r.ratio, 1);
  assert.equal(r.ok, true);
  assert.deepEqual(r.spans, []);
});

test("katakana vs hiragana and kanji vs kana spellings do not count", () => {
  assert.equal(compareReading("あたらしい つーるを", "アタラシイ ツールヲ").ratio, 1);
  // toKana: optional converter for either side (e.g. when only a kanji transcript is at hand).
  const toKana = (s) => s.replace(/見積もり/g, "みつもり");
  assert.equal(compareReading("みつもりが ずれた", "見積もりがずれた", { toKana }).ratio, 1);
  assert.ok(compareReading("みつもりが ずれた", "見積もりがずれた").ratio < 1, "without toKana the kanji really differ");
});

test("long vowels: ー, う after an o-sound, い after an e-sound are the same sound", () => {
  for (const [a, b] of [["ほうこく", "ほーこく"], ["ほうこく", "ほおこく"], ["るーる", "るうる"], ["せんせい", "せんせー"], ["きょうゆう", "きょーゆー"], ["けいけん", "けーけん"]]) {
    assert.equal(compareReading(a, b).ratio, 1, `${a} = ${b}`);
  }
  // A dropped long vowel is still a mistake (おばあさん ≠ おばさん).
  assert.deepEqual(strip(compareReading("おばあさん", "おばさん")), [{ expected: "あ", heard: "", sentence: 0 }]);
});

test("particles: は/わ, へ/え, を/お are read the same (the script reading writes them as pronounced)", () => {
  assert.equal(compareReading("ばあいわ かいしゃえ しごとお", "ばあいは かいしゃへ しごとを").ratio, 1);
});

test("voicing error ずれた → すれた is a span with its position and sentence; ratio drops", () => {
  const exp = "はい、みつもりが ずれた ばあいわ。まず かくにんします。";
  const r = compareReading(exp, "はい、みつもりがすれたばあいわ。まずかくにんします。");
  assert.deepEqual(r.spans, [{ expected: "ず", heard: "す", start: exp.indexOf("ず"), end: exp.indexOf("ず") + 1, sentence: 0 }]);
  assert.ok(r.ratio < 1 && r.ratio > 0.9);
  const second = compareReading(exp, "はい、みつもりがずれたばあいわ。まず かくにんしまう。");
  assert.deepEqual(strip(second), [{ expected: "す", heard: "う", sentence: 1 }]);
});

test("small っ is kept: もっとも ≠ もとも", () => {
  assert.deepEqual(strip(compareReading("もっとも", "もとも")), [{ expected: "っ", heard: "", sentence: 0 }]);
});

test("dropped words are spans with heard = '' and lower the ratio", () => {
  const exp = "まず えいきょうはんいを かくにんし、かんけいしゃに きょうゆうします。";
  const r = compareReading(exp, "えいきょうはんいを かくにんし、きょうゆうします。");
  assert.deepEqual(strip(r), [{ expected: "まず", heard: "", sentence: 0 }, { expected: "かんけいしゃに", heard: "", sentence: 0 }]);
  assert.equal(r.spans[0].start, 0);
  assert.equal(r.ok, false);
});

// Decision: extra words (fillers like えーと) are reported so the UI can show them, but the ratio only measures how
// much of the script was read correctly — a filler is not a pronunciation error (fillers are coached in the answer review).
test("extra fillers in the heard text are reported as insertions but do not lower the ratio", () => {
  const exp = "まず かくにんします。";
  const r = compareReading(exp, "えーと、まず、あの、かくにんします。");
  assert.equal(r.ratio, 1);
  assert.equal(r.ok, true);
  assert.deepEqual(strip(r), [{ expected: "", heard: "えーと", sentence: 0 }, { expected: "", heard: "あの", sentence: 0 }]);
  assert.equal(r.spans[0].start, 0);
  assert.equal(r.spans[0].end, 0);
});

test("ratio under 0.9 → not ok; at or above → ok", () => {
  const exp = "あいうえおかきくけこ"; // 10 sounds
  assert.equal(compareReading(exp, "あいうえおかきくけ").ok, true); // 9/10
  assert.equal(compareReading(exp, "あいうえおかきく").ok, false); // 8/10
  assert.equal(compareReading(exp, "あいうえおかきく").ratio, 0.8);
});

test("empty heard → ratio 0 with one span per sentence; empty expected → ratio 0, no spans", () => {
  const r = compareReading("はい。そうです。", "");
  assert.equal(r.ratio, 0);
  assert.equal(r.ok, false);
  assert.deepEqual(strip(r), [{ expected: "はい", heard: "", sentence: 0 }, { expected: "そうです", heard: "", sentence: 1 }]);
  assert.deepEqual(compareReading("", "はい"), { ratio: 0, ok: false, spans: [] });
  assert.deepEqual(compareReading("↗《》 /", ""), { ratio: 0, ok: false, spans: [] });
});

test("the fixture script read with one voicing error → still ok (≥ 0.9) with exactly that span", () => {
  const said = scriptKana.replace("ずれた", "すれた").replace(/［[^］]*］/g, "");
  const r = compareReading(scriptKana, said);
  assert.ok(r.ok && r.ratio < 1);
  assert.deepEqual(strip(r), [{ expected: "ず", heard: "す", sentence: 0 }]);
  assert.equal(scriptKana.slice(r.spans[0].start, r.spans[0].end), "ず");
});
