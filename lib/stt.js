// Speech-to-text for one spoken answer via the Gemini API. The transcript must be VERBATIM: the F4 rules
// (del-nanka, del-chotto, …) only fire when the filler words are still in the answer.
// Measured 11/03 on TTS-generated answers (cleaner than real speech): gemini-3.5-transcribe ~1.7 s, keeps Japanese fillers
// (なんか once became 何か) but drops Korean fillers and fixes some grammar (できるです → できます); WAV, webm/opus, mp4/aac accepted.
// It ignores the prompt (3 variants, identical output) and rejects systemInstruction and JSON mode (400), returning
// parts[].audioTranscription.text. The fallback follows the prompt (keeps errors, spoken numbers) but misheard words
// (御社 → 弊社) and took 2–17 s. gemini-3.8-flash / 3.5-flash were 503 or hung 20 s on the free tier that day.
// Order flipped 11/03 (research/STT-STREAM-EVAL.md): the transcribe models, live ones too, correct grammar even in VERBATIM
// mode (できるです → できます, なんか → 何か, Korean fillers dropped), which hides exactly what we coach. flash-lite kept
// できるです, follows the prompt (［？］ marker, hiragana for the read-aloud check), so it goes first; transcribe stays as
// the fast fallback and the response says verbatim: false. ATTEMPT_MS 20 s covers flash-lite's measured 17 s worst case.
export const MODELS = [
  { id: "gemini-3.5-flash-lite", json: true },
  { id: "gemini-3.5-transcribe", json: false },
];
// Off unless STT_ENABLED=1 (decision 11/03): the Gemini free tier forbids personal data and a recorded answer carries
// names and companies. Turn on after the paid tier is set up; /api/access passes it to the UI (🎤 / read-aloud).
export const sttEnabled = (env = process.env) => env.STT_ENABLED === "1";
export const AUDIO_TYPES = ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav"];
const API = "https://generativelanguage.googleapis.com/v1beta/models";
const ATTEMPT_MS = 20_000;
const TOTAL_MS = 30_000;

export const sttPrompt = (target, lang) =>
  [
    "Transcribe this audio VERBATIM in the language actually spoken. Do not translate.",
    "Keep every filler and hesitation exactly as spoken (e.g. えーと, えー, あの, なんか, ちょっと, まあ, 음, 어, 그니까, 막), every repetition, false start and grammatical error.",
    "Write exactly what the speaker says, including hesitation sounds even when they are short or stand alone.",
    "Do not correct, clean up, summarise or rewrite anything. Keep grammatical mistakes as spoken (e.g. できるです stays できるです, not できます).",
    "Keep なんか and ちょっと in kana (never 何か). Write numbers the way they are spoken (이십 퍼센트, not 20%). Do not add or remove words.",
    "For Japanese use only 、 and 。 as punctuation and never put spaces between Japanese words.",
    "If a part cannot be made out, write ［？］ in its place. Never guess a word.",
    `This is a job-interview answer, most likely in ${target}; the speaker's first language may be ${lang}.`,
  ].join("\n");

// Read-aloud check (V4): the same speech in hiragana, spelled like the script reading (lib/lang.js HIRAGANA) so the two
// compare sound by sound. It must follow what was heard, not the correct reading of the words.
const KANA_PROMPT = "kana = the same speech written only in hiragana, exactly as pronounced: no kanji, katakana words and numbers in hiragana, the particles は/へ/を written as said (わ/え/お), a mispronounced sound written as heard, not as the correct word, fillers kept.";

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

// PCM WAV length from the RIFF header (byte rate + data size); null for anything else. MediaRecorder webm/mp4 need a
// container parser, so the browser sends x-duration-ms for those instead.
export function wavDurationMs(audio) {
  const b = Buffer.from(audio.buffer, audio.byteOffset, audio.byteLength);
  if (b.length < 44 || b.toString("latin1", 0, 4) !== "RIFF" || b.toString("latin1", 8, 12) !== "WAVE") return null;
  let byteRate = 0;
  for (let off = 12; off + 8 <= b.length; ) {
    const id = b.toString("latin1", off, off + 4), size = b.readUInt32LE(off + 4);
    if (id === "fmt " && off + 16 <= b.length) byteRate = b.readUInt32LE(off + 16);
    if (id === "data") return byteRate ? Math.round(((Math.min(size, b.length - off - 8)) / byteRate) * 1000) : null;
    off += 8 + size + (size % 2);
  }
  return null;
}

export class SttError extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

// audio: Uint8Array; mime: one of AUDIO_TYPES. kana: also ask for the hiragana rendering (JSON model only).
// Returns { text, language?, kana?, model, verbatim } (verbatim false = transcribe fallback, may have corrected the speech).
// Throws SttError("stt_busy", 503) when both models are busy/time out, SttError("generation_failed", 502) on a bad response.
export async function transcribe({ audio, mime, target, lang, kana = false, fetch = globalThis.fetch, apiKey }) {
  const prompt = sttPrompt(target, lang);
  const total = AbortSignal.timeout(TOTAL_MS);
  const data = Buffer.from(audio).toString("base64");
  for (const model of MODELS) {
    const properties = { text: { type: "STRING" }, language: { type: "STRING" }, ...(kana && { kana: { type: "STRING" } }) };
    const generationConfig = model.json ? { responseMimeType: "application/json", responseSchema: { type: "OBJECT", properties, required: Object.keys(properties) } } : {};
    const ask = model.json ? `${prompt}\n${kana ? `${KANA_PROMPT}\nReturn JSON {text, language, kana}` : "Return JSON {text, language}"} (language = BCP-47 code of the speech).` : prompt;
    let res;
    try {
      res = await fetch(`${API}/${model.id}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        // Instructions before the audio: the measured order.
        body: JSON.stringify({ contents: [{ parts: [{ text: ask }, { inlineData: { mimeType: mime, data } }] }], generationConfig }),
        signal: AbortSignal.any([total, AbortSignal.timeout(ATTEMPT_MS)]),
      });
    } catch (e) {
      console.error("stt fetch failed:", model.id, e?.name); // timeout/network → next model
      if (total.aborted) break;
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      console.error("stt busy:", model.id, res.status);
      continue;
    }
    if (!res.ok) {
      console.error("stt rejected:", model.id, res.status); // never log the audio or transcript
      throw new SttError("generation_failed", 502);
    }
    try {
      const parts = (await res.json()).candidates?.[0]?.content?.parts ?? [];
      const out = parts.map((p) => p.audioTranscription?.text ?? p.text ?? "").join("");
      if (!model.json) return { text: out.trim(), model: model.id, verbatim: false };
      const { text, language, kana: k } = JSON.parse(out || "{}");
      if (typeof text !== "string") throw new Error("no text");
      return { text: text.trim(), language, ...(kana && typeof k === "string" && { kana: k.trim() }), model: model.id, verbatim: true };
    } catch (e) {
      console.error("stt bad response:", model.id, e?.name);
      throw new SttError("generation_failed", 502);
    }
  }
  throw new SttError("stt_busy", 503);
}
