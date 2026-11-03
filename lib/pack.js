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

// How the last step closes for this question (PRD §16-15): the first matching pack rule, decided by code so review and
// script always agree. A rule matches when its category (if any) equals and its regex (if any) hits the question.
export function closingOf(pack, { question = "", category } = {}) {
  const rules = pack.answer_structure.closing_rules;
  if (!rules) return null;
  return rules.find((r) => (!r.category || r.category === category) && (!r.match || new RegExp(r.match).test(question)))?.closing ?? null;
}

// The steps as the prompts state them: the last step takes the question's closing (締め・貢献 …).
export function stepsFor(pack, input) {
  const s = pack.answer_structure, closing = closingOf(pack, input), cl = closing && s.closings[closing];
  const last = s.steps.length - 1;
  return { closing, steps: s.steps.map((st, i) => (cl && i === last ? { ...st, label: `${st.label}・${cl.label}`, rule: cl.rule, example: cl.example } : st)) };
}
