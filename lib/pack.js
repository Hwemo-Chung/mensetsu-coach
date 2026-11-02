import { readFileSync } from "node:fs";

// Packs a request may name (body.pack). loadPack only checks the id shape; the APIs check this list first.
export const PACKS = ["jp", "kr"];

export function loadPack(id = "jp") {
  if (!/^[a-z]{2}$/.test(id)) throw new Error(`invalid pack id: ${id}`);
  return JSON.parse(readFileSync(new URL(`../packs/${id}.json`, import.meta.url), "utf8"));
}

export function formatRules(pack) {
  return pack.correction_rules
    .map((r) => `- [${r.id}] (${r.type}) ${r.pattern} → ${r.replacement || "削除"}｜理由: ${r.reason}｜例: 「${r.example_before}」→「${r.example_after}」`)
    .join("\n");
}
