// Scans research outputs and draft packs for personal identifiers listed in the denylist (PII_DENYLIST env, a file outside the repo).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const denyPath = process.env.PII_DENYLIST ?? fileURLToPath(new URL(".pii-denylist.txt", root));
const targets = [
  ...(existsSync(new URL("packs/", root)) ? readdirSync(new URL("packs/", root)).map((f) => `packs/${f}`) : []),
  ...(existsSync(new URL("01_설계문서/research/", root)) ? readdirSync(new URL("01_설계문서/research/", root)).map((f) => `01_설계문서/research/${f}`) : []),
  ...(existsSync(new URL("01_설계문서/dev-notes/", root)) ? readdirSync(new URL("01_설계문서/dev-notes/", root), { recursive: true }).map((f) => `01_설계문서/dev-notes/${f}`) : []),
  "README.md",
].filter((p) => existsSync(new URL(p, root)) && /\.(json|md|js)$/.test(p));

test("no denylisted personal identifiers in packs/ or research outputs", { skip: !existsSync(denyPath) && ".pii-denylist.txt not present" }, () => {
  const terms = readFileSync(denyPath, "utf8").split("\n").map((s) => s.trim()).filter((s) => s && !s.startsWith("#"));
  const hits = [];
  for (const p of targets) {
    const text = readFileSync(new URL(p, root), "utf8");
    for (const t of terms) if (text.includes(t)) hits.push(`${p}: "${t}"`);
  }
  assert.deepEqual(hits, [], `PII found:\n${hits.join("\n")}`);
});

// URLs are stripped first: government document IDs (mhlw.go.jp/content/.../001742822.pdf) look like phone numbers.
const piiMatches = (text) => text.replace(/https?:\/\/\S+/g, "").match(/(?<!\d)0[1-9]\d{0,2}-?\d{2,4}-?\d{4}(?!\d)|[\w.+-]+@[\w-]+\.[\w.-]+/g);

test("PII detector still catches phone/email but ignores URL document IDs", () => {
  assert.deepEqual(piiMatches("tel 090-1234-5678 / a.b@example.jp"), ["090-1234-5678", "a.b@example.jp"]);
  assert.equal(piiMatches("[PDF](https://www.mhlw.go.jp/content/11655000/001742822.pdf)"), null);
  assert.equal(piiMatches("文書番号 001603370 と 001366995"), null, "document numbers starting 00 are not phones");
});

test("generic PII patterns (phone / email) absent from packs and research", () => {
  const bad = [];
  for (const p of targets) {
    const text = readFileSync(new URL(p, root), "utf8");
    const m = piiMatches(text);
    if (m) bad.push(`${p}: ${[...new Set(m)].join(", ")}`);
  }
  assert.deepEqual(bad, [], bad.join("\n"));
});
