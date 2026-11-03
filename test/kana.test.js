// lib/kana.js: the model writes a Japanese reading in hiragana only; Hangul (ko) and romaji (en) readings are
// converted from it deterministically (live 11/03: the model wrote "Hangul" readings in kana/kanji in 3/6 runs).
// The tables below are written independently of lib/kana.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import { kanaToHangul, kanaToRomaji } from "../lib/kana.js";

const check = (kana, ko, ro) => {
  assert.equal(kanaToHangul(kana), ko, `${kana} → Hangul`);
  assert.equal(kanaToRomaji(kana), ro, `${kana} → romaji`);
};
// One row = kana string, Hangul (one char per kana), romaji (space-separated per kana).
const rows = (list) => {
  for (const [kana, ko, ro] of list) {
    const k = [...kana], h = [...ko], r = ro.split(" ");
    assert.equal(h.length, k.length, kana);
    assert.equal(r.length, k.length, kana);
    k.forEach((c, i) => check(c, h[i], r[i]));
  }
};

test("gojūon, dakuten, handakuten: every kana, hiragana and katakana", () => {
  const table = [
    ["あいうえお", "아이우에오", "a i u e o"],
    ["かきくけこ", "카키쿠케코", "ka ki ku ke ko"],
    ["さしすせそ", "사시스세소", "sa shi su se so"],
    ["たちつてと", "타치츠테토", "ta chi tsu te to"],
    ["なにぬねの", "나니누네노", "na ni nu ne no"],
    ["はひふへほ", "하히후헤호", "ha hi fu he ho"],
    ["まみむめも", "마미무메모", "ma mi mu me mo"],
    ["やゆよ", "야유요", "ya yu yo"],
    ["らりるれろ", "라리루레로", "ra ri ru re ro"],
    ["わを", "와오", "wa o"],
    ["がぎぐげご", "가기구게고", "ga gi gu ge go"],
    ["ざじずぜぞ", "자지즈제조", "za ji zu ze zo"],
    ["だぢづでど", "다지즈데도", "da ji zu de do"],
    ["ばびぶべぼ", "바비부베보", "ba bi bu be bo"],
    ["ぱぴぷぺぽ", "파피푸페포", "pa pi pu pe po"],
    ["ゔ", "부", "vu"],
  ];
  rows(table);
  // Katakana gives the same result as hiragana.
  rows(table.map(([kana, ko, ro]) => [[...kana].map((c) => String.fromCharCode(c.charCodeAt(0) + 0x60)).join(""), ko, ro]));
  // Small vowels/ya-yu-yo alone read as their full kana.
  rows([["ぁぃぅぇぉゃゅょ", "아이우에오야유요", "a i u e o ya yu yo"]]);
});

test("yōon (きゃ…) for every row", () => {
  const yoon = [
    ["き", "캬큐쿄", "kya kyu kyo"], ["ぎ", "갸규교", "gya gyu gyo"],
    ["し", "샤슈쇼", "sha shu sho"], ["じ", "자주조", "ja ju jo"],
    ["ち", "차추초", "cha chu cho"], ["ぢ", "자주조", "ja ju jo"],
    ["に", "냐뉴뇨", "nya nyu nyo"], ["ひ", "햐휴효", "hya hyu hyo"],
    ["び", "뱌뷰뵤", "bya byu byo"], ["ぴ", "퍄퓨표", "pya pyu pyo"],
    ["み", "먀뮤묘", "mya myu myo"], ["り", "랴류료", "rya ryu ryo"],
  ];
  for (const [head, ko, ro] of yoon) ["ゃ", "ゅ", "ょ"].forEach((s, i) => check(head + s, [...ko][i], ro.split(" ")[i]));
  check("キョ", "쿄", "kyo");
});

test("small vowels in loanwords (ふぁ, てぃ, でゅ…)", () => {
  for (const [kana, ko, ro] of [
    ["ふぁ", "화", "fa"], ["ふぃ", "휘", "fi"], ["ふぇ", "훼", "fe"], ["ふぉ", "훠", "fo"], ["ふゅ", "휴", "fyu"],
    ["てぃ", "티", "ti"], ["でぃ", "디", "di"], ["とぅ", "투", "tu"], ["どぅ", "두", "du"], ["てゅ", "튜", "tyu"], ["でゅ", "듀", "dyu"],
    ["うぃ", "위", "wi"], ["うぇ", "웨", "we"], ["うぉ", "워", "wo"], ["いぇ", "예", "ye"],
    ["しぇ", "셰", "she"], ["じぇ", "제", "je"], ["ちぇ", "체", "che"],
    ["つぁ", "차", "tsa"], ["つぃ", "치", "tsi"], ["つぇ", "체", "tse"], ["つぉ", "초", "tso"],
    ["ゔぁ", "바", "va"], ["ゔぃ", "비", "vi"], ["ゔぇ", "베", "ve"], ["ゔぉ", "보", "vo"],
    ["くぁ", "콰", "kwa"], ["ぐぁ", "과", "gwa"],
  ]) check(kana, ko, ro);
  check("ふぁいる", "화이루", "fairu");
  check("パーティー", "파아티이", "paatii");
});

test("sokuon っ: ㅅ batchim in Hangul, doubled consonant in romaji (っち → tchi, っつ → ttsu)", () => {
  check("もっとも", "못토모", "mottomo"); // the old hack dropped っ: 모토모
  check("まっちゃ", "맛차", "matcha");
  check("みっつ", "밋츠", "mittsu");
  check("ざっし", "잣시", "zasshi");
  check("いっしょ", "잇쇼", "issho");
  check("がっこう", "갓코오", "gakkou");
  check("いっぱい", "잇파이", "ippai");
  check("だった", "닷타", "datta");
  check("ベッド", "벳도", "beddo");
  // Word-final (before a space or mark, or at the end): Hangul keeps the stop, romaji has no consonant to double.
  check("あっ", "앗", "a");
  check("あっ↘ はい", "앗↘ 하이", "a↘ hai");
  check("っと", "토", "tto");
});

test("long vowels: ー repeats the vowel; う after an o-sound is 오 in Hangul only", () => {
  check("るーる", "루우루", "ruuru");
  check("ルール", "루우루", "ruuru");
  check("コーヒー", "코오히이", "koohii");
  check("きゃー", "캬아", "kyaa");
  check("ほうこく", "호오코쿠", "houkoku");
  check("とうきょう", "토오쿄오", "toukyou");
  check("きょうゆう", "쿄오유우", "kyouyuu");
  check("でしょうか", "데쇼오카", "deshouka");
  check("せんせい", "센세이", "sensei"); // えい stays 에이
  check("おもう", "오모오", "omou"); // documented limit: verb-final う after o also lengthens in Hangul
  check("ー", "", "");
});

test("ん: ㄴ batchim; romaji n, n' before a vowel or y; n (not m) before b/m/p", () => {
  check("ほん", "혼", "hon");
  check("げんいん", "겐인", "gen'in");
  check("れんあい", "렌아이", "ren'ai");
  check("きんようび", "킨요오비", "kin'youbi");
  check("しんぶん", "신분", "shinbun");
  check("さんま", "산마", "sanma");
  check("かんぱい", "칸파이", "kanpai");
  check("てんき", "텐키", "tenki");
  check("ん", "응", "n");
});

// Intent changed 11/03: the prompt still asks for わ, but live output wrote は (1 of 3, 「젠쇼쿠데하」), so a word-final は
// is now read わ in code; へ is still read as written.
test("particles: を → 오/o; word-final は → 와/wa; へ is read as written", () => {
  check("ほんを", "혼오", "hon'o");
  check("わたしは", "와타시와", "watashiwa");
  check("わたしわ", "와타시와", "watashiwa");
});

test("marks, spaces, punctuation and ［blanks］ are kept; Japanese punctuation becomes ASCII", () => {
  check("はい、 /《もっとも》↗ たいへん↘。", "하이, /《못토모》↗ 타이헨↘.", "hai, /《mottomo》↗ taihen↘.");
  check("ほんとう？ はい！", "혼토오? 하이!", "hontou? hai!");
  check("［ここに実績の数字］ へらしました↘", "［ここに実績の数字］ 헤라시마시타↘", "［ここに実績の数字］ herashimashita↘");
  check("[期限] いないに", "[期限] 이나이니", "[期限] inaini");
  check("あい・うえ", "아이 우에", "ai ue");
  check("ぜんしょくで もっとも たいへんだった ことわ", "젠쇼쿠데 못토모 타이헨닷타 코토와", "zenshokude mottomo taihendatta kotowa");
});

test("non-kana text is returned unchanged (idempotent)", () => {
  for (const s of ["", "abc 123", "漢字 한글", "↗↘《》/ ,.", "못토모", "mottomo"]) {
    check(s, s, s);
    assert.equal(kanaToHangul(kanaToHangul(s)), s);
  }
  assert.equal(kanaToHangul(kanaToHangul("もっとも")), "못토모");
  assert.equal(kanaToRomaji(kanaToRomaji("もっとも")), "mottomo");
});

// Product review 11/03: the model writes the topic particle は as は in hiragana, and the table read it 「하/ha」
// (「젠쇼쿠데하」). The model separates words with spaces, so a word-final は is the particle and reads わ.
test("particle は at the end of a word reads wa; は inside a word stays ha", () => {
  assert.equal(kanaToHangul("ぜんしょくでは /きじゅんは"), kanaToHangul("ぜんしょくでわ /きじゅんわ"));
  assert.equal(kanaToRomaji("わたしは、"), kanaToRomaji("わたしわ、"));
  assert.equal(kanaToRomaji("はなし"), "hanashi");
  assert.equal(kanaToRomaji("こんにちは"), kanaToRomaji("こんにちわ"));
});
