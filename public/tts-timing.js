// Read-along highlight timing. Gemini TTS returns no word timestamps, so progress is estimated:
// each character gets a speaking weight (≈ mora; pauses for punctuation) and playback time is mapped onto the cumulative weight.

const SMALL_KANA = /[ゃゅょぁぃぅぇぉゎャュョァィゥェォヮ]/; // merges into the previous mora
const KANA = /[぀-ヿ]/; // incl. ー, っ, ん = 1 mora each
const KANJI = /[㐀-鿿]/; // ≈ 2 mora on average
const HANGUL = /[가-힯]/; // 1 syllable
const COMMA = /[、，,・：:；;]/;
const STOP = /[。．！？!?.…]/;
const BRACKET = /[［］\[\]「」『』（）()"]/; // not spoken (［blanks］ are read with their inner text)

export function weight(ch) {
  if (BRACKET.test(ch) || SMALL_KANA.test(ch)) return 0;
  if (KANJI.test(ch)) return 2;
  if (KANA.test(ch) || HANGUL.test(ch)) return 1;
  if (COMMA.test(ch)) return 2; // short pause
  if (STOP.test(ch)) return 3; // sentence pause
  if (/\d/.test(ch)) return 1.5; // 3 → さん, 10 → じゅう
  if (/\s/.test(ch)) return 0.5;
  return 0.6; // Latin letters, symbols
}

// Highlighted prefix length (in UTF-16 units of text) at `elapsed` of `total` seconds. Monotonic in elapsed; full length at the end.
export function highlightLength(text, elapsed, total) {
  const chars = [...text];
  if (!(total > 0) || elapsed >= total) return text.length;
  const ws = chars.map(weight);
  const sum = ws.reduce((a, b) => a + b, 0);
  const goal = (Math.max(0, elapsed) / total) * sum;
  let acc = 0, len = 0;
  for (let i = 0; i < chars.length; i++) {
    if (acc + ws[i] > goal) break;
    acc += ws[i];
    len += chars[i].length;
  }
  return len;
}

// Measured 11/03: a 58-weight ja sentence took 7.2 s (Kore, lite). Used only until the real length is known (stream end or x-audio-bytes).
export const MORA_PER_SEC = 8;
export const estimateSeconds = (text) => [...text].reduce((a, c) => a + weight(c), 0) / MORA_PER_SEC;

// Total duration while streaming: the larger of what already arrived and the estimate; exact once the stream is done.
export const totalSeconds = ({ text, bytes, rate, done }) => (done ? bytes / 2 / rate : Math.max(bytes / 2 / rate, estimateSeconds(text)));

// Browser fallback (speechSynthesis): boundary events give the spoken word directly. Never move backwards.
export const fromBoundary = (prev, e) => Math.max(prev, e.charIndex + (e.charLength || 0));
