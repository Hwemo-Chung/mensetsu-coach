// In-browser answer STT (public/stt-whisper.js): chunking, the filler prompt per interview language, and the shared
// quality gate. Offline, 0 tokens, no model download (the model run is test/stt-local.live.test.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { chunks, PROMPT, RATE, MAX_CHUNK_S, speechQuality } from "../public/stt-whisper.js";
import { speechQuality as serverQuality } from "../lib/stt.js";
import { PACKS, loadPack } from "../lib/coach.js";

test("every pack's interview language has a filler prompt (the language is fixed, never auto-detected)", () => {
  for (const p of PACKS) {
    const target = loadPack(p).language_pair.target;
    assert.ok(PROMPT[target]?.length > 5, `${p} → ${target}`);
  }
});

test("chunks: ≤30 s is one piece; longer audio is cut at the quietest 100 ms near each window's end, nothing lost", () => {
  const short = new Float32Array(RATE * 12).fill(0.5);
  assert.deepEqual(chunks(short).map((c) => c.length), [short.length]);

  // 70 s of "speech" with one quiet 100 ms gap at 27 s and another at 55 s → cuts land inside the gaps.
  const long = new Float32Array(RATE * 70).fill(0.5);
  for (const s of [27, 55]) long.fill(0, s * RATE, s * RATE + RATE / 10);
  const parts = chunks(long);
  assert.equal(parts.reduce((n, c) => n + c.length, 0), long.length, "every sample kept, in order");
  assert.ok(parts.every((c) => c.length <= MAX_CHUNK_S * RATE), "each piece fits Whisper's 30 s window");
  const cuts = parts.slice(0, -1).reduce((a, c) => [...a, (a.at(-1) ?? 0) + c.length], []);
  assert.equal(cuts.length, 2);
  assert.ok(Math.abs(cuts[0] / RATE - 27.05) < 0.1, `first cut ${cuts[0] / RATE}`);
  assert.ok(Math.abs(cuts[1] / RATE - 55.05) < 0.1, `second cut ${cuts[1] / RATE}`);

  // No quiet spot at all → a hard cut at 30 s, still nothing lost.
  const flat = new Float32Array(RATE * 45).fill(0.5);
  assert.deepEqual(chunks(flat).map((c) => c.length), [RATE * 30, RATE * 15]);
});

test("speechQuality: the browser and /api/stt use one function", () => {
  assert.equal(speechQuality, serverQuality);
});

test("CSP allows WebAssembly and the model host only, the page is cross-origin isolated; the ORT runtime is served from /vendor (no CDN script)", () => {
  const csp = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8")).headers[0].headers
    .find((h) => h.key === "Content-Security-Policy").value;
  assert.match(csp, /script-src 'self' 'wasm-unsafe-eval';/);
  assert.match(csp, /connect-src 'self' https:\/\/huggingface\.co https:\/\/\*\.hf\.co;/);
  // Cross-origin isolation → multi-threaded WASM: 15 s of speech 9.3 s → 2.9 s in Chrome (STT-OSS-EVAL.md).
  const h = Object.fromEntries(JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8")).headers[0].headers.map((x) => [x.key, x.value]));
  assert.equal(h["Cross-Origin-Opener-Policy"], "same-origin");
  assert.equal(h["Cross-Origin-Embedder-Policy"], "require-corp");
  for (const f of ["transformers.min.js", "ort-wasm-simd-threaded.asyncify.mjs", "ort-wasm-simd-threaded.asyncify.wasm"]) {
    assert.ok(statSync(new URL(`../public/vendor/${f}`, import.meta.url)).size > 1000, f);
  }
});
