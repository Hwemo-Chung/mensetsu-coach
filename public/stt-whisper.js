// Answer speech-to-text with open-source Whisper (transformers.js), browser + node: the worker (stt-worker.js) and the
// live test pass the transformers module in, so this file loads no runtime itself. Measured 11/03
// (research/STT-OSS-EVAL.md): whisper-small q8 with the language fixed to the pack's interview language and a
// filler-seeded prompt kept ja fillers 14/15 (できるです too) and ko 4/4; without the prompt it dropped most of them.
// Device floor (decision 11/03): RAM ≥ 4 GB. A 2 GB Android tab crashes loading the model (research/STT-OSS-EVAL.md §3).
export const MODEL = "onnx-community/whisper-small";
export const RATE = 16000; // Whisper input rate
export const MAX_CHUNK_S = 30; // Whisper's window
// Previous-text prompt (<|startofprev|>): fillers and interview words only, never a sentence (the eval sample text is
// not in here). Whisper copies the style of the prompt, so the fillers stay in the transcript.
export const PROMPT = {
  ja: "えーと、あの、御社、弊社、貴社、なんか、ちょっと、まあ、えー、そうですね。",
  ko: "음… 어… 그니까, 막, 그, 뭐, 저기, 어…",
};

// Cut audio longer than 30 s in the middle of the quietest 100 ms in the last 5 s of each window; a hard cut at 30 s when nothing
// there is quiet (< half the mean level). Returns subarrays that together are the whole input, in order.
export function chunks(samples, rate = RATE) {
  const max = MAX_CHUNK_S * rate, frame = rate / 10, look = 5 * rate, out = [];
  let start = 0;
  while (samples.length - start > max) {
    const levels = [];
    for (let f = start + max - look; f + frame <= start + max; f += frame / 2) { // 50 ms hop: a short pause is not split
      let e = 0;
      for (let i = f; i < f + frame; i++) e += samples[i] * samples[i];
      levels.push({ f, e });
    }
    const mean = levels.reduce((n, x) => n + x.e, 0) / levels.length;
    const q = levels.reduce((a, b) => (b.e < a.e ? b : a));
    const cut = q.e < mean / 2 ? q.f + frame / 2 : start + max;
    out.push(samples.subarray(start, cut));
    start = cut;
  }
  out.push(samples.subarray(start));
  return out;
}

// Measured on TTS answers (stt-exp, the English preamble cut): ja ≈ 5.2 chars/s (4.0–5.0 by transcript chars), ko ≈ 3.3.
// About 30% of that: below it, most of the recording was not recognised. Counted without punctuation/spaces/marks.
export const MIN_CHARS_PER_SEC = { ja: 1.5, ko: 1.0 };
const UNCLEAR = /［？］|\[\?\]/;

// → { quality: "ok" } or { quality: "low", reason: "empty" | "unclear" | "too_short" }. No duration → length not judged.
// Unknown language → the lowest threshold. No confidence score is invented: these are the only signals we have.
export function speechQuality(text, durationMs, lang) {
  const chars = [...String(text).replace(/［？］|\[\?\]|[\p{P}\p{S}\s]/gu, "")].length;
  if (!chars && !UNCLEAR.test(text)) return { quality: "low", reason: "empty" };
  if (UNCLEAR.test(text)) return { quality: "low", reason: "unclear" };
  const min = MIN_CHARS_PER_SEC[lang] ?? Math.min(...Object.values(MIN_CHARS_PER_SEC));
  if (durationMs > 0 && chars / (durationMs / 1000) < min) return { quality: "low", reason: "too_short" };
  return { quality: "ok" };
}

// tf = the @huggingface/transformers module. onProgress(pct) while the files download (cached by the runtime after).
export async function load(tf, onProgress = () => {}) {
  const files = new Map();
  const progress_callback = (p) => {
    if (p.status !== "progress" || !p.total) return;
    files.set(p.file, p);
    let loaded = 0, total = 0;
    for (const x of files.values()) { loaded += x.loaded; total += x.total; }
    onProgress(Math.floor((loaded / total) * 100));
  };
  const [processor, model] = await Promise.all([
    tf.AutoProcessor.from_pretrained(MODEL, { progress_callback }),
    tf.WhisperForConditionalGeneration.from_pretrained(MODEL, { dtype: "q8", progress_callback }),
  ]);
  return { processor, model };
}

// samples: mono Float32Array at 16 kHz; lang: the interview language (ja | ko), fixed — never auto-detected.
export async function recognize({ processor, model }, samples, lang) {
  const tok = processor.tokenizer, ids = (s) => tok.encode(s, { add_special_tokens: false });
  const prefix = [...ids("<|startofprev|>"), ...ids(` ${PROMPT[lang] ?? ""}`), ...ids("<|startoftranscript|>"), ...ids(`<|${lang}|>`), ...ids("<|transcribe|>"), ...ids("<|notimestamps|>")];
  let text = "";
  for (const part of chunks(samples)) {
    const { input_features } = await processor(part);
    // 448 = Whisper's decoder length; the prompt takes part of it.
    const out = await model.generate({ inputs: input_features, decoder_input_ids: [prefix], max_new_tokens: 448 - prefix.length });
    const t = tok.decode(out.tolist()[0].slice(prefix.length).map(Number), { skip_special_tokens: true }).trim();
    text += text && t && lang !== "ja" ? ` ${t}` : t; // Japanese has no spaces between words
  }
  return text;
}
