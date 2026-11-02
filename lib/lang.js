// Script detection, explanation/interview languages and reading formats (2-axis rule).

const HANGUL = /[\uac00-\ud7af]/;
const JAPANESE = /[\u3040-\u30ff\u3400-\u9fff]/;
const KANA = /[\u3040-\u30ff]/;
const KANJI = /[\u3400-\u9fff]/;
const KATAKANA = /[\u30a0-\u30ff]/;
const HANGUL_G = /[\uac00-\ud7af]/g;
const JAPANESE_G = /[\u3040-\u30ff\u3400-\u9fff]/g;
const count = (s, re) => (String(s).match(re) ?? []).length;
const LATIN = /[A-Za-z]/;
export const isJapanese = (s) => typeof s === "string" && JAPANESE.test(s) && !HANGUL.test(s);
export const hasHangul = (s) => typeof s === "string" && HANGUL.test(s);
const isStr = (s) => typeof s === "string" && s.length > 0;
// ［blanks］ come from the Japanese script and are copied into readings as-is; judge the reading without them.
const unblank = (s) => String(s).replace(/［[^］]*］|\[[^\]]*\]/g, " ");
const mostlyLatin = (s) => {
  // Hangul counts as non-Latin too (only reachable for a Korean target; otherwise Hangul is rejected first).
  const latin = count(s, /[A-Za-z]/g), other = count(s, JAPANESE_G) + count(s, HANGUL_G);
  return latin > 0 && latin >= other;
};

// Explanation languages (screen language). Adding one = one entry here + one UI file in public/i18n/.
// reading = how the Japanese script's pronunciation is written for that reader; checks are the language gates.
// isText(s, target): explanations may quote the interview (target) language, e.g. 復唱 or 은/는.
export const EXPLAIN_LANGS = {
  // isText: explanations (review notes quote Japanese examples heavily, so one Hangul char is enough).
  // isProse: a whole-sentence translation must be mostly Hangul — a Japanese "translation" used to pass (live 11/03).
  ko: { name: "韓国語", isText: (s) => hasHangul(s), isProse: (s) => isStr(s) && count(s, HANGUL_G) > count(s, JAPANESE_G) },
  // English text may quote Japanese terms (復唱, 「…」); it must still be mostly Latin. Hangul only as a Korean-target quote.
  en: { name: "英語", isText: (s, target = "ja") => isStr(s) && (target === "ko" || !HANGUL.test(s)) && mostlyLatin(s) },
  // Japanese text with a Korean target may quote Korean (은/는) as long as Japanese stays the majority.
  ja: { name: "やさしい日本語", isText: (s, target = "ja") => (target === "ko" ? isStr(s) && count(s, JAPANESE_G) > count(s, HANGUL_G) : isJapanese(s)) },
};

// Interview (target) languages: the name used in prompts and the gate for text spoken in the interview.
export const TARGET_LANGS = {
  ja: { name: "日本語", is: isJapanese, blank: "［ここに実績の数字］" },
  // Korean script may keep ［blanks］ from a Japanese-speaking user; kana outside them means the wrong language.
  ko: { name: "韓国語", is: (s) => hasHangul(s) && !KANA.test(unblank(s)), blank: "［여기에 실적 숫자］" },
  en: { name: "英語", is: (s) => isStr(s) && LATIN.test(s) && !HANGUL.test(unblank(s)) && !JAPANESE.test(unblank(s)), blank: "[your result number]" },
};

// The model sometimes leaves a sokuon or long-vowel mark in a Hangul reading (모ッ토모, 츠ー루): drop ッ/っ, write ー as -.
export const fixHangulReading = (s) => String(s).replace(/[ッっ]/g, "").replace(/ー/g, "-");

// Reading = pronunciation of the target-language script, written in the native script. READINGS[target][native];
// no entry when target == native (no reading, no translation). English target → IPA for every native language.
const IPA = { name: "IPA（国際音声記号）", is: (s) => isStr(s) && /[A-Za-z\u0250-\u02af]/.test(unblank(s)) && !HANGUL.test(unblank(s)) && !JAPANESE.test(unblank(s)) };
export const READINGS = {
  ja: {
    ko: { name: "ハングル", is: (s) => hasHangul(s) && !JAPANESE.test(unblank(fixHangulReading(s))) },
    en: { name: "ローマ字（ヘボン式）", is: (s) => isStr(s) && LATIN.test(unblank(s)) && !HANGUL.test(s) && !JAPANESE.test(unblank(s)) },
  },
  ko: {
    ja: { name: "カタカナ", is: (s) => isStr(s) && KATAKANA.test(unblank(s)) && !KANJI.test(unblank(s)) && !HANGUL.test(unblank(s)) },
    en: { name: "ローマ字（Revised Romanization）", is: (s) => isStr(s) && LATIN.test(unblank(s)) && !HANGUL.test(unblank(s)) && !JAPANESE.test(unblank(s)) },
  },
  en: { ko: IPA, ja: IPA },
};
