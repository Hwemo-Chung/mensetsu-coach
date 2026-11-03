// V4 read-aloud check, browser + node: the script's hiragana reading (/api/script `kana`) vs the hiragana of what was
// heard (/api/stt?kana=1), aligned sound by sound (edit distance). Code only, no AI judgement.
// - Ignored: ↗↘《》/ marks, spaces, punctuation, katakana vs hiragana, ［blanks］ (and whatever is said in their place),
//   long-vowel spellings (ー = the vowel before it, おう = おお, えい = ええ) and particles は/へ/を = わ/え/お.
// - ratio = expected sounds heard correctly / expected sounds. Extra words (えーと) come back as spans with expected ""
//   but do not lower the ratio: a filler is not a pronunciation error (fillers are coached in the answer review).
// - spans: kana-level { expected, heard, start, end, sentence }; start/end index the expected text, sentence counts 。！？.
// shortcut: は/わ, へ/え, を/お are equal everywhere, so はな read as わな passes; fine for reading a known script.
export const READ_OK = 0.9;

const VOWEL = {};
for (const [v, row] of Object.entries({ a: "あかさたなはまやらわがざだばぱぁゃゎ", i: "いきしちにひみりぎじぢびぴぃ", u: "うくすつぬふむゆるぐずづぶぷぅゅゔ", e: "えけせてねへめれげぜでべぺぇ", o: "おこそとのほもよろをごぞどぼぽぉょ" })) {
  for (const c of row) VOWEL[c] = v;
}
const LONG = { a: "あ", i: "い", u: "う", e: "え", o: "お" };
const SAME = { は: "わ", へ: "え", を: "お" };
const BLANK = /［[^］]*］|\[[^\]]*\]/g;
const SENTENCE_END = /[。！？!?]/;

// → [{ ch (shown), key (compared), i (index in s), blank (a ［blank］ came right before it), sentence }], plus blankAtEnd.
function sounds(s) {
  const out = [];
  let vowel = "", blank = false, sentence = 0;
  const blanks = [...s.matchAll(BLANK)].map((m) => [m.index, m.index + m[0].length]);
  for (let i = 0; i < s.length; i++) {
    const b = blanks.find(([from]) => from === i);
    if (b) { blank = true; i = b[1] - 1; continue; }
    if (SENTENCE_END.test(s[i])) sentence++;
    if (!/[\p{L}\p{N}]/u.test(s[i])) continue;
    const ch = /[ァ-ヶ]/.test(s[i]) ? String.fromCharCode(s.charCodeAt(i) - 0x60) : s[i];
    let key = SAME[ch] ?? ch;
    if (ch === "ー" && vowel) key = LONG[vowel];
    else if ((key === "う" && vowel === "o") || (key === "い" && vowel === "e")) key = LONG[vowel];
    vowel = VOWEL[key] ?? (ch === "ー" ? vowel : "");
    out.push({ ch, key, i, blank, sentence });
    blank = false;
  }
  out.blankAtEnd = blank;
  return out;
}

export function compareReading(expectedText, heardText, { toKana = (s) => s } = {}) {
  const expected = toKana(String(expectedText ?? ""));
  const E = sounds(expected), H = sounds(toKana(String(heardText ?? "")));
  const n = E.length, m = H.length;
  if (!n) return { ratio: 0, ok: false, spans: [] };
  // d[i][j] = edit distance between E[i..] and H[j..] (suffixes, so the walk below goes left to right).
  const d = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: m + 1 }, (_, j) => (i === n ? m - j : j === m ? n - i : 0)));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      d[i][j] = Math.min(d[i + 1][j + 1] + (E[i].key === H[j].key ? 0 : 1), d[i + 1][j] + 1, d[i][j + 1] + 1);
    }
  }
  // Walk left to right; a match is taken whenever it is optimal, so a gap is pushed right and a dropped word stays one
  // piece (かんけいしゃに, not し…/ゃに). Then substitution, deletion, insertion.
  const ops = []; // null = match; { e } deleted; { h, at } inserted before E[at]; { e, h } substituted
  let i = 0, j = 0, matched = 0;
  while (i < n || j < m) {
    const both = i < n && j < m;
    if (both && E[i].key === H[j].key) { matched++; i++; j++; ops.push(null); }
    else if (both && d[i][j] === d[i + 1][j + 1] + 1) ops.push({ e: E[i++], h: H[j++] });
    else if (i < n && d[i][j] === d[i + 1][j] + 1) ops.push({ e: E[i++] });
    else ops.push({ h: H[j++], at: i });
  }
  const spans = [];
  let cur = null;
  for (const op of ops) {
    // A match ends a span; so do words said in place of a ［blank］ (the user's own numbers are not errors).
    if (!op || (!op.e && (op.at < n ? E[op.at].blank : E.blankAtEnd))) { cur = null; continue; }
    const pos = op.e ?? E[op.at]; // undefined = insertion after the last sound
    const sentence = pos ? pos.sentence : E[n - 1].sentence;
    if (!cur || cur.sentence !== sentence) {
      const start = pos ? pos.i : expected.length;
      cur = { expected: "", heard: "", start, end: start, sentence };
      spans.push(cur);
    }
    if (op.e) { cur.expected += op.e.ch; cur.end = op.e.i + 1; }
    if (op.h) cur.heard += op.h.ch;
  }
  const ratio = matched / n;
  return { ratio, ok: ratio >= READ_OK, spans };
}
