// Kana reading → Hangul / Hepburn romaji, deterministically. The model writes the Japanese reading in hiragana only
// (live 11/03: asked for Hangul directly, it left kana/kanji in 3/6 runs), and these turn it into the reader's script.
//
// Hangul: the 국립국어원 외래어 표기법 Japanese table (つ 츠, ざ 자, じ 지, ず 즈, ち 치, しゃ 샤, じゃ 자, っ = ㅅ batchim,
// ん = ㄴ batchim) with two changes for pronouncing, not spelling:
// - か/た/ぱ rows use 카·타·파 everywhere instead of 가·다·바 at the start of a word. A Korean reader says a
//   word-initial 가 like が, so the strict rule erases the か/が contrast; the aspirated letter keeps it.
// - Long vowels are written out because length changes meaning (おばさん/おばあさん): ー repeats the vowel
//   (るーる 루우루) and う after an o-sound is 오 (ほうこく 호오코쿠, said hoo-). えい stays 에이 (both are heard).
// ふぁ/ふぃ… are 화/휘… (ふ is a breathy f, nearer ㅎ than the stop ㅍ).
// Romaji: modified Hepburn without macrons, spelled from the kana like the existing en readings (houkoku, ruuru);
// ん = n (also before b/m/p), n' before a vowel or y; っ doubles the next consonant (っち tchi), dropped at a word end.
// shortcut: は/へ particles cannot be told apart from kana, so they are read as written (ha/he); the prompt asks the
// model to write わ/え. う after o always lengthens, so 思う is 오모오 (also said that way in speech).
// shortcut: ん before a vowel stays ㄴ (げんいん 겐인), which a Korean reader may link as 게닌; no Hangul spelling avoids it.

const T = {}; // kana (1 or 2 chars) → [Hangul, romaji]
const row = (kana, ko, ro) => [...kana].forEach((k, i) => (T[k] = [[...ko][i], ro.split(" ")[i]]));
row("あいうえお", "아이우에오", "a i u e o");
row("かきくけこ", "카키쿠케코", "ka ki ku ke ko");
row("さしすせそ", "사시스세소", "sa shi su se so");
row("たちつてと", "타치츠테토", "ta chi tsu te to");
row("なにぬねの", "나니누네노", "na ni nu ne no");
row("はひふへほ", "하히후헤호", "ha hi fu he ho");
row("まみむめも", "마미무메모", "ma mi mu me mo");
row("やゆよ", "야유요", "ya yu yo");
row("らりるれろ", "라리루레로", "ra ri ru re ro");
row("わゐゑを", "와이에오", "wa i e o");
row("がぎぐげご", "가기구게고", "ga gi gu ge go");
row("ざじずぜぞ", "자지즈제조", "za ji zu ze zo");
row("だぢづでど", "다지즈데도", "da ji zu de do");
row("ばびぶべぼ", "바비부베보", "ba bi bu be bo");
row("ぱぴぷぺぽ", "파피푸페포", "pa pi pu pe po");
row("ゔぁぃぅぇぉゃゅょゎゕゖ", "부아이우에오야유요와카케", "vu a i u e o ya yu yo wa ka ke");
// yōon: head + ゃゅょ
for (const [head, ko, ro] of [["き", "캬큐쿄", "kya kyu kyo"], ["ぎ", "갸규교", "gya gyu gyo"], ["し", "샤슈쇼", "sha shu sho"], ["じ", "자주조", "ja ju jo"],
  ["ち", "차추초", "cha chu cho"], ["ぢ", "자주조", "ja ju jo"], ["に", "냐뉴뇨", "nya nyu nyo"], ["ひ", "햐휴효", "hya hyu hyo"],
  ["び", "뱌뷰뵤", "bya byu byo"], ["ぴ", "퍄퓨표", "pya pyu pyo"], ["み", "먀뮤묘", "mya myu myo"], ["り", "랴류료", "rya ryu ryo"]]) {
  ["ゃ", "ゅ", "ょ"].forEach((s, i) => (T[head + s] = [[...ko][i], ro.split(" ")[i]]));
}
// Loanword combinations with small vowels: "kana Hangul romaji" triples.
for (const e of ("ふぁ화fa ふぃ휘fi ふぇ훼fe ふぉ훠fo ふゅ휴fyu てぃ티ti でぃ디di とぅ투tu どぅ두du てゅ튜tyu でゅ듀dyu うぃ위wi うぇ웨we うぉ워wo いぇ예ye " +
  "しぇ셰she じぇ제je ちぇ체che つぁ차tsa つぃ치tsi つぇ체tse つぉ초tso ゔぁ바va ゔぃ비vi ゔぇ베ve ゔぉ보vo くぁ콰kwa ぐぁ과gwa").split(" ")) T[e.slice(0, 2)] = [e[2], e.slice(3)];

const VOWEL = { a: "아", i: "이", u: "우", e: "에", o: "오" };
const PUNCT = { "、": ",", "。": ".", "！": "!", "？": "?", "・": " ", "　": " " };
const BLANK = /(［[^］]*］|\[[^\]]*\])/; // same blanks as lib/lang.js unblank; their contents are never converted

// Adds a final consonant (ㄴ 4, ㅅ 19) to the last Hangul syllable if it has none.
const batchim = (ko, f) => {
  const c = ko.at(-1)?.charCodeAt(0);
  if (!(c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 === 0) || ko.at(-1).length !== 1) return false;
  ko[ko.length - 1] = String.fromCharCode(c + f);
  return true;
};

function convert(s) {
  const ko = [], ro = [];
  let vowel = "", sokuon = false, nasal = false; // vowel = the last kana's vowel ("" after anything else)
  const chars = [...s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    let u = T[c + chars[i + 1]];
    if (u) i++;
    else u = T[c];
    if (c === "っ") { if (vowel) batchim(ko, 19); sokuon = true; continue; }
    if (c === "ん") { if (!(vowel && batchim(ko, 4))) ko.push("응"); ro.push("n"); vowel = ""; sokuon = false; nasal = true; continue; }
    if (c === "ー") { if (vowel) ko.push(VOWEL[vowel]), ro.push(vowel); continue; }
    if (!u) { const p = PUNCT[c] ?? c; ko.push(p); ro.push(p); vowel = ""; sokuon = nasal = false; continue; }
    let [k, r] = u;
    if (u === T.う && vowel === "o") k = "오";
    if (sokuon && !/^[aeiou]/.test(r)) r = (r.startsWith("ch") ? "t" : r[0]) + r;
    if (nasal && /^[aeiouy]/.test(r)) r = `'${r}`;
    ko.push(k); ro.push(r); vowel = r.at(-1); sokuon = nasal = false;
  }
  return [ko.join(""), ro.join("")];
}

// A word-final は is the topic particle and reads わ (the model separates words with spaces; review 11/03).
const particle = (s) => s.replace(/(?<=[ぁ-んァ-ヶー])は(?=[\s、。,./↗↘》？?!！]|$)/g, "わ"); // after a word only: a lone は is the kana itself
const by = (col) => (s) => String(s).split(BLANK).map((part, i) => (i % 2 ? part : convert(particle(part))[col])).join("");
export const kanaToHangul = by(0);
export const kanaToRomaji = by(1);
