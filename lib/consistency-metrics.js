// Pure metrics for the N-run consistency eval (scripts/eval.mjs --only consistency). No Claude calls, no I/O.
// Conventions follow EVIDENCE-V3 §3.3 so numbers stay comparable: NFKC, whitespace removed, each ［…］ = 1 char,
// and the closed ending vocabulary regex is copied verbatim from §4.4.
import { groundedNumbers, joinParts } from "./script.js";
import { EXPLAIN_LANGS, TARGET_LANGS, READINGS } from "./lang.js";

const BLANK = /\[[^\]]*\]/g; // after NFKC, ［…］ becomes […]
const nfkc = (s) => String(s ?? "").normalize("NFKC");

// shortcut: splits inside 「」 quotes too (「…です。」と言いました → 2 sentences); fine for model answers, which rarely quote.
export const sentences = (text) => nfkc(text).split(/(?<=[。?!])/).map((s) => s.trim()).filter(Boolean);

export const charLen = (text) => nfkc(text).replace(BLANK, "□").replace(/\s/g, "").length;

export const blankCount = (text) => (nfkc(text).match(BLANK) ?? []).length;

export const ENDING = /(です|ます|ました|ません|でした|ですね|ですか|ますか|ましょうか|でしょうか)[。？]$/;
// NFKC turns ？ into ?, so the verbatim regex is applied to the sentence with its full-width ending restored.
export const endingOk = (s) => ENDING.test(s.replace(/\?$/, "？").replace(/(?<![。？])$/, "。"));

// Step markers per sentence (F 復唱 / K 基準・数字 / C 選択肢・貢献 / O その他).
// 結論 has no surface marker (it is defined by position), so it is not detected: O = "結論 or anything unmarked".
// 復唱 openers seen live (11/03 baseline): 「〜についてですね」「〜について、お答えします」「〜について、事例をお話しします」
// 「自己紹介をいたします」. Only the first sentence is tested, so the broad 「を(…)いたします」 tail rarely misfires.
const FUKUSHO = /(ですね|について、?.{0,6}(お答え|お話し|ご説明)(いた)?します|を(ご紹介)?いたします|というご質問(です)?)[。?]?$/;
const ASK = /(ましょうか|でしょうか|ますか|ませんか)[。?]?$/; // handing the turn back = 選択肢
const CLOSE = /選択肢|どちら|いずれか|ご提示|ご判断いただけ|貢献|活かし|お役に立て|御社|貴社|よろしくお願い/; // only the last sentence (活かし is common mid-answer); the options gate's words, and a self-introduction's greeting or link to the company
const EVID = /基準|\[|\d|割|%|数字|具体的|前職では|実際に|例えば/;
export function stepLabels(text) {
  const ss = sentences(text);
  return ss.map((s, i) => {
    if (i === 0 && FUKUSHO.test(s)) return "F";
    if (ASK.test(s) || (i === ss.length - 1 && CLOSE.test(s))) return "C";
    if (EVID.test(s)) return "K";
    return "O";
  });
}
// Collapsed shape, e.g. F K K O C → "F-K-O-C". Agreement is computed on this string.
export const stepPattern = (text) => stepLabels(text).filter((l, i, a) => l !== a[i - 1]).join("-");
// 4文型 frame: opens with 復唱 and ends handing back (選択肢/貢献). Middle order is not judged (see O above).
// fukusho = false: the closing leaves 復唱 out (user decision 11/06), so the frame must not open with it.
export const frameOk = (text, fukusho = true) => (fukusho ? /^F-.*C$/ : /^(?!F).*C$/).test(stepPattern(text));

// Share of values equal to the most frequent one (ties: first seen).
export function modeShare(values) {
  if (!values.length) return { mode: null, share: 0, n: 0 };
  const c = new Map();
  for (const v of values) c.set(v, (c.get(v) ?? 0) + 1);
  const [mode, k] = [...c].reduce((a, b) => (b[1] > a[1] ? b : a));
  return { mode, share: k / values.length, n: values.length };
}

export function spread(nums) {
  if (!nums.length) return { n: 0 };
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const sd = Math.sqrt(nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length); // population sd: N is the whole sample
  return { n: nums.length, min: Math.min(...nums), max: Math.max(...nums), mean, cv: mean ? sd / mean : 0 };
}

// Jaccard of two sets; two empty sets agree (1). Callers must also report how many runs were empty.
export const jaccard = (a, b) => {
  const A = new Set(a), B = new Set(b);
  const inter = [...A].filter((x) => B.has(x)).length;
  const uni = new Set([...A, ...B]).size;
  return uni ? inter / uni : 1;
};
export function meanPairwiseJaccard(sets) {
  const js = [];
  for (let i = 0; i < sets.length; i++) for (let j = i + 1; j < sets.length; j++) js.push(jaccard(sets[i], sets[j]));
  return js.length ? js.reduce((a, b) => a + b, 0) / js.length : null;
}

// Re-applies generateScript's gates to one RAW script response (before retries), to see which gate a first call failed.
// Mirrors lib/script.js generateScript; if that changes, this must change too (the eval also counts calls per run,
// which does not depend on this copy).
export function scriptGates(raw, source, lang = "ko", target = "ja") {
  const L = EXPLAIN_LANGS[lang], R = READINGS[target][lang], A = R?.ask ?? R;
  const text = raw[target] && typeof raw[target] === "object" ? joinParts(raw[target], Object.keys(raw[target]), target) : raw[target]; // C3 parts
  const textOk = TARGET_LANGS[target].is(text);
  const readingOk = !R || (A.is(raw.reading) && R.is(R.convert ? R.convert(raw.reading) : raw.reading));
  const pointsOk = Array.isArray(raw.points) && raw.points.every((x) => L.isText(x, target));
  const translationOk = !R || (L.isText(raw.translation, target) && (L.isProse ?? L.isText)(raw.translation, target));
  const grounded = typeof text === "string" && groundedNumbers(text, source);
  return { textOk, readingOk, pointsOk, translationOk, grounded, all: textOk && readingOk && pointsOk && translationOk && grounded };
}

// Metrics over the successful script outputs of one input. ok/N is carried so agreement over 2 runs never reads as 5/5.
export function summarizeScripts(texts, source, N = texts.length, { fukusho = true } = {}) {
  const counts = texts.map((t) => sentences(t).length);
  const allSent = texts.flatMap(sentences);
  return {
    ok: `${texts.length}/${N}`,
    pattern: modeShare(texts.map(stepPattern)),
    frame_ok: texts.filter((t) => frameOk(t, fukusho)).length,
    sentences: { ...spread(counts), mode: modeShare(counts) },
    chars: spread(texts.map(charLen)),
    ending_ok: `${allSent.filter(endingOk).length}/${allSent.length}`,
    blank_runs: texts.filter((t) => blankCount(t) > 0).length,
    blanks: spread(texts.map(blankCount)),
    ungrounded: texts.filter((t) => !groundedNumbers(t, source)).length,
  };
}

export function summarizeReviews(outs, N = outs.length) {
  const sets = outs.map((o) => o.corrections.map((c) => c.rule_id));
  const keys = Object.keys(outs[0]?.steps ?? {});
  return {
    ok: `${outs.length}/${N}`,
    answers_question: modeShare(outs.map((o) => o.answers_question)),
    steps: Object.fromEntries(keys.map((k) => [k, modeShare(outs.map((o) => o.steps[k].present))])),
    rule_jaccard: meanPairwiseJaccard(sets),
    empty_runs: sets.filter((s) => !s.length).length,
    rule_sets: sets.map((s) => [...new Set(s)].sort().join(",") || "∅"),
  };
}

// $ per million tokens (claude-api skill table, cached 2026-10-06). Unknown model → null, never a guess.
export const PRICES = { "claude-sonnet-5-5": [2, 10], "claude-opus-5-5": [4, 20] };
export function costOf(calls) {
  let usd = 0;
  const unknown = new Set();
  for (const c of calls) {
    const p = PRICES[c.model];
    if (!p) { unknown.add(c.model); continue; }
    usd += (c.in * p[0] + c.out * p[1]) / 1e6;
  }
  return { usd, calls: calls.length, in: calls.reduce((a, c) => a + c.in, 0), out: calls.reduce((a, c) => a + c.out, 0), unknown_models: [...unknown] };
}
