// Speech-to-text for one spoken answer via the Gemini API. The transcript must be VERBATIM: the F4 rules
// (del-nanka, del-chotto, …) only fire when the filler words are still in the answer.
// Measured 11/03 on TTS-generated answers (cleaner than real speech): gemini-3.5-transcribe ~1.7 s, keeps Japanese fillers
// (なんか once became 何か) but drops Korean fillers and fixes some grammar (できるです → できます); WAV, webm/opus, mp4/aac accepted.
// It ignores the prompt (3 variants, identical output) and rejects systemInstruction and JSON mode (400), returning
// parts[].audioTranscription.text. The fallback follows the prompt (keeps errors, spoken numbers) but misheard words
// (御社 → 弊社) and took 2–17 s. gemini-3.8-flash / 3.5-flash were 503 or hung 20 s on the free tier that day.
export const MODELS = [
  { id: "gemini-3.5-transcribe", json: false },
  { id: "gemini-3.5-flash-lite", json: true },
];
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
    `This is a job-interview answer, most likely in ${target}; the speaker's first language may be ${lang}.`,
  ].join("\n");

export class SttError extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

// audio: Uint8Array; mime: one of AUDIO_TYPES. Returns { text, language?, model }.
// Throws SttError("stt_busy", 503) when both models are busy/time out, SttError("generation_failed", 502) on a bad response.
export async function transcribe({ audio, mime, target, lang, fetch = globalThis.fetch, apiKey }) {
  const prompt = sttPrompt(target, lang);
  const total = AbortSignal.timeout(TOTAL_MS);
  const data = Buffer.from(audio).toString("base64");
  for (const model of MODELS) {
    const generationConfig = model.json
      ? { responseMimeType: "application/json", responseSchema: { type: "OBJECT", properties: { text: { type: "STRING" }, language: { type: "STRING" } }, required: ["text", "language"] } }
      : {};
    let res;
    try {
      res = await fetch(`${API}/${model.id}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        // Instructions before the audio: the measured order.
        body: JSON.stringify({ contents: [{ parts: [{ text: model.json ? `${prompt}\nReturn JSON {text, language} (language = BCP-47 code of the speech).` : prompt }, { inlineData: { mimeType: mime, data } }] }], generationConfig }),
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
      if (!model.json) return { text: out.trim(), model: model.id };
      const { text, language } = JSON.parse(out || "{}");
      if (typeof text !== "string") throw new Error("no text");
      return { text: text.trim(), language, model: model.id };
    } catch (e) {
      console.error("stt bad response:", model.id, e?.name);
      throw new SttError("generation_failed", 502);
    }
  }
  throw new SttError("stt_busy", 503);
}
