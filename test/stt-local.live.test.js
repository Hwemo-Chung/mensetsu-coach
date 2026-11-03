// The real Whisper model (public/stt-whisper.js) in Node on the 11/03 TTS sample set. Downloads ~260 MB once; 0 API
// credits. Needs `npm i --no-save @huggingface/transformers@=4.3.2` first (not saved: it stays out of the Vercel
// install). Run by hand after a model or prompt change:
//   STT_SAMPLES=../BuiltWithClaude-2026-private/internal-docs/session-2026-11-03/stt-exp node --test test/stt-local.live.test.js
// The samples (items.json + <id>.wav, 24 kHz PCM) are synthetic and stay outside the repo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as tf from "@huggingface/transformers";
import { load, recognize, RATE } from "../public/stt-whisper.js";

const dir = process.env.STT_SAMPLES;

// 16-bit PCM mono WAV → Float32 at 16 kHz (linear interpolation; enough for a check).
function wav16k(buf) {
  const rate = buf.readUInt32LE(24), data = buf.indexOf("data", 12) + 8;
  const n = (buf.length - data) >> 1, out = new Float32Array(Math.floor((n * RATE) / rate));
  for (let i = 0; i < out.length; i++) {
    const x = (i * rate) / RATE, j = Math.floor(x), f = x - j;
    const a = buf.readInt16LE(data + 2 * j), b = j + 1 < n ? buf.readInt16LE(data + 2 * (j + 1)) : a;
    out[i] = (a + (b - a) * f) / 32768;
  }
  return out;
}

test("whisper-small keeps the fillers and errors the rules coach (ja ≥ 13/15, ko ≥ 3/4)", { skip: !dir && "STT_SAMPLES not set" }, async () => {
  const items = JSON.parse(readFileSync(`${dir}/items.json`, "utf8"));
  const m = await load(tf);
  const kept = { ja: [0, 0], ko: [0, 0] };
  for (const it of items) {
    const text = await recognize(m, wav16k(readFileSync(`${dir}/${it.id}.wav`)), it.lang);
    console.log(it.id, text);
    kept[it.lang][0] += it.fillers.filter((f) => text.includes(f)).length;
    kept[it.lang][1] += it.fillers.length;
  }
  console.log(kept);
  assert.ok(kept.ja[0] >= 13, `ja ${kept.ja}`);
  assert.ok(kept.ko[0] >= 3, `ko ${kept.ko}`);
});
