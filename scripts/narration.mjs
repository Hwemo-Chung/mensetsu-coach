// Japanese narration for the demo video (build-video.mjs stills, record-video.mjs ③ captions): a local VOICEVOX engine
// → WAV, no API cost or quota. Its terms require the credit VOICEVOX:青山龍星 in the video or its description.
// Cached on disk by voice, tempo and text.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const ENGINE = process.env.VOICEVOX_URL ?? "http://127.0.0.1:50021";
const VOICE = ["青山龍星", "ノーマル"];
// The user asked for a faster tempo (11/04: 1.22, 11/06: 1.35, checked by the Whisper round trip).
export const TEMPO = 1.35;
// Characters per second of a line at TEMPO: the silent preview's reading time (7.2 was measured at 1.22).
export const CPS = 7.2 * TEMPO / 1.22;
const CACHE = join(tmpdir(), "mensetsu-narration");
let speaker = null;

const call = async (path, init) => {
  const res = await fetch(ENGINE + path, init).catch(() => { throw new Error(`narration needs the VOICEVOX engine at ${ENGINE}`); });
  if (!res.ok) throw new Error(`VOICEVOX ${path.split("?")[0]} ${res.status}`);
  return res;
};

async function query(text) {
  speaker ??= (await (await call("/speakers")).json()).find((s) => s.name === VOICE[0])?.styles.find((s) => s.name === VOICE[1])?.id;
  if (speaker === undefined) throw new Error(`VOICEVOX has no voice ${VOICE.join(" ")}`);
  return (await call(`/audio_query?speaker=${speaker}&text=${encodeURIComponent(text)}`, { method: "POST" })).json();
}
// The engine's reading of a line (its AquesTalk-style kana): the misread check (Haiku → エイチ アイク, v7) reads every line with this.
export const kana = async (text) => (await query(text)).kana;

// → { wav, sec } at TEMPO.
export async function narrate(text) {
  mkdirSync(CACHE, { recursive: true });
  const id = createHash("sha256").update(`${VOICE.join("/")}|${TEMPO}|${text}`).digest("hex").slice(0, 16);
  const wav = join(CACHE, `${id}.wav`), meta = join(CACHE, `${id}.json`);
  if (existsSync(wav) && existsSync(meta)) return { wav, sec: JSON.parse(readFileSync(meta, "utf8")).sec };
  const q = await query(text); // also resolves the speaker id
  const audio = await call(`/synthesis?speaker=${speaker}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...q, speedScale: TEMPO }) });
  writeFileSync(wav, Buffer.from(await audio.arrayBuffer()));
  const sec = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", wav], { encoding: "utf8" }));
  writeFileSync(meta, JSON.stringify({ sec, text }));
  return { wav, sec };
}
