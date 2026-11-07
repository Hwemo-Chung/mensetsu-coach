#!/usr/bin/env node
// 公開用の伏せ字版: 期間中にデモ動画のナレーション確認で実行したスクリプト。変更点はリポジトリの絶対パスを REPO 環境変数（既定: カレントディレクトリ）に置き換えたことだけです。
// Every narration line of the demo video, read by the VOICEVOX engine: its kana reading (misreads such as Haiku →
// エイチ アイク show up here) and the synthesised seconds at the build's tempo, plus the total. Local engine only, 0 tokens.
// Lines come from `node scripts/build-video.mjs --lines` and `node scripts/record-video.mjs --lines` (one table each).
// Usage: node narration-check.mjs [--out <dir>]                                  → table, <dir>/lines.json
//        node narration-check.mjs --transcript <whisper.txt> [--lines <lines.json>]  → each line against the transcript
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.env.REPO ?? process.cwd();
const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const out = opt("--out") ?? HERE;

const fromScripts = () => ["build-video.mjs", "record-video.mjs"].flatMap((s) =>
  Object.entries(JSON.parse(execFileSync(process.execPath, [join(ROOT, "scripts", s), "--lines"], { cwd: ROOT, encoding: "utf8" }))).map(([key, text]) => ({ key: `${s.split("-")[0]}.${key}`, text })));
const lines = opt("--lines") ? JSON.parse(readFileSync(opt("--lines"), "utf8")) : fromScripts();

if (!opt("--transcript")) {
  const { narrate, kana } = await import(join(ROOT, "scripts/narration.mjs"));
  let total = 0;
  for (const l of lines) {
    l.kana = await kana(l.text);
    l.sec = (await narrate(l.text)).sec;
    total += l.sec;
    console.log(`${l.key.padEnd(22)} ${l.sec.toFixed(2).padStart(5)}s  ${l.text}\n${"".padEnd(30)}${l.kana}`);
  }
  console.log(`\n${lines.length} lines, ${total.toFixed(1)} s of speech (scenes add 0.3 s each; a scene with more frames than speech keeps its frame time)`);
  writeFileSync(join(out, "lines.json"), JSON.stringify(lines, null, 1));
  console.log(`→ ${join(out, "lines.json")}`);
  process.exit(0);
}

// Compare: the best window of the transcript for each line (character-bigram Dice), then the character diff of that
// window, so a short misread inside a long line is still listed.
const norm = (s) => s.normalize("NFKC").replace(/[^\p{L}\p{N}]/gu, "");
const grams = (s) => { const m = new Map(); for (let i = 0; i < s.length - 1; i++) m.set(s.slice(i, i + 2), (m.get(s.slice(i, i + 2)) ?? 0) + 1); return m; };
const dice = (a, b) => { const ga = grams(a), gb = grams(b); let hit = 0; for (const [g, n] of ga) hit += Math.min(n, gb.get(g) ?? 0); return (2 * hit) / Math.max(1, a.length - 1 + b.length - 1); };
function diff(a, b) { // LCS alignment → spans of 「line」→「heard」
  const n = a.length, m = b.length, L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const spans = []; let i = 0, j = 0, da = "", db = "";
  const flush = () => { if (da || db) spans.push(`「${da || "∅"}」→「${db || "∅"}」`); da = db = ""; };
  while (i < n && j < m) {
    if (a[i] === b[j]) { flush(); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) da += a[i++]; else db += b[j++];
  }
  da += a.slice(i); db += b.slice(j); flush();
  return spans;
}
const heard = norm(readFileSync(opt("--transcript"), "utf8"));
const rows = [];
for (const l of lines) {
  const t = norm(l.text); let best = { score: -1, w: "" };
  for (const w of new Set([Math.round(t.length * 0.85), t.length, Math.round(t.length * 1.15)])) for (let s = 0; s + w <= heard.length; s++) { const win = heard.slice(s, s + w), score = dice(t, win); if (score > best.score) best = { score, w: win }; }
  rows.push({ key: l.key, score: best.score, spans: diff(t, best.w) });
}
for (const r of rows) console.log(`${r.score < 0.75 ? "!!" : "  "} ${r.score.toFixed(2)} ${r.key.padEnd(22)} ${r.spans.join(" ") || "(exact)"}`);
const low = rows.filter((r) => r.score < 0.75);
console.log(`\n${rows.length} lines, mean ${(rows.reduce((s, r) => s + r.score, 0) / rows.length).toFixed(3)}, ${low.length} under 0.75${low.length ? ": " + low.map((r) => r.key).join(", ") : ""}`);
