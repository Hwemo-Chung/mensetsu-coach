#!/usr/bin/env node
// Standalone check of jp-draft-v2.json against packs/jp.json (PRD §4.1). Not wired into npm test.
// Usage: node validate-draft.mjs [draft.json] [base.json]
// Budget = code points of pattern/replacement/reason/example_before/example_after of new rules
//        + new culture_notes + new question_taxonomy enum strings (delta vs base).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";

const here = dirname(fileURLToPath(import.meta.url));
const draftPath = resolve(process.argv[2] ?? resolve(here, "jp-draft-v2.json"));
const basePath = resolve(process.argv[3] ?? resolve(here, "../../packs/jp.json"));
const LIMIT = { rules: 3, notes: 5, chars: 1000 };
const FIELDS = ["id", "type", "pattern", "replacement", "reason", "example_before", "example_after"];
const TEXT = FIELDS.slice(2);
const TYPES = ["delete", "replace", "structure"];

const errors = [];
const fail = (m) => errors.push(m);
const len = (s) => [...s].length;

let draft, base;
try {
  draft = JSON.parse(readFileSync(draftPath, "utf8"));
  base = JSON.parse(readFileSync(basePath, "utf8"));
} catch (e) {
  console.error(`FAIL: cannot read/parse JSON: ${e.message}`);
  process.exit(1);
}

// 1. exactly the same top-level keys
const dk = Object.keys(draft).sort(), bk = Object.keys(base).sort();
if (!isDeepStrictEqual(dk, bk)) fail(`top-level keys differ: draft=[${dk}] base=[${bk}]`);

// 2. untouched keys stay identical; only the 3 §4.1 slots may change
for (const k of bk) {
  if (["correction_rules", "culture_notes", "question_taxonomy"].includes(k)) continue;
  if (!isDeepStrictEqual(draft[k], base[k])) fail(`key "${k}" changed (only append slots may change)`);
}

// 3. append-only: base entries are an unchanged prefix
const prefix = (name, d = [], b = []) => {
  if (!Array.isArray(d)) return fail(`${name} is not an array`), [];
  if (!isDeepStrictEqual(d.slice(0, b.length), b)) fail(`${name}: base entries changed or reordered`);
  return d.slice(b.length);
};
const newRules = prefix("correction_rules", draft.correction_rules, base.correction_rules);
const newNotes = prefix("culture_notes", draft.culture_notes, base.culture_notes);
const qt = draft.question_taxonomy ?? {};
if (!isDeepStrictEqual(Object.keys(qt).sort(), Object.keys(base.question_taxonomy).sort()))
  fail("question_taxonomy keys differ from base");
const newEnums = Object.keys(base.question_taxonomy).flatMap((k) => {
  const added = prefix(`question_taxonomy.${k}`, qt[k], base.question_taxonomy[k]);
  if (new Set(qt[k] ?? []).size !== (qt[k] ?? []).length) fail(`question_taxonomy.${k}: duplicate values`);
  return added;
});

// 4. every rule: exactly 7 fields, string values, valid type; ids unique
const ids = new Set();
for (const [i, r] of (draft.correction_rules ?? []).entries()) {
  const tag = `correction_rules[${i}] (${r?.id})`;
  const keys = Object.keys(r ?? {}).sort();
  if (!isDeepStrictEqual(keys, [...FIELDS].sort())) fail(`${tag}: fields must be exactly ${FIELDS.join(",")}; got ${keys.join(",")}`);
  for (const f of FIELDS) if (typeof r?.[f] !== "string") fail(`${tag}: ${f} must be a string`);
  for (const f of ["id", "pattern", "reason", "example_before", "example_after"])
    if (typeof r?.[f] === "string" && !r[f].trim()) fail(`${tag}: ${f} is empty`);
  if (!TYPES.includes(r?.type)) fail(`${tag}: invalid type "${r?.type}"`);
  if (ids.has(r?.id)) fail(`${tag}: duplicate id`);
  ids.add(r?.id);
}
for (const [i, n] of newNotes.entries()) if (typeof n !== "string" || !n.trim()) fail(`new culture_notes[${i}] must be a non-empty string`);
for (const v of newEnums) if (typeof v !== "string" || !v.trim()) fail(`new enum value must be a non-empty string`);

// 5. injection budget vs base
const ruleChars = newRules.reduce((s, r) => s + TEXT.reduce((t, f) => t + (typeof r?.[f] === "string" ? len(r[f]) : 0), 0), 0);
const noteChars = newNotes.reduce((s, n) => s + (typeof n === "string" ? len(n) : 0), 0);
const enumChars = newEnums.reduce((s, v) => s + (typeof v === "string" ? len(v) : 0), 0);
const total = ruleChars + noteChars + enumChars;
if (newRules.length > LIMIT.rules) fail(`budget: +${newRules.length} correction_rules > ${LIMIT.rules}`);
if (newNotes.length > LIMIT.notes) fail(`budget: +${newNotes.length} culture_notes > ${LIMIT.notes}`);
if (total > LIMIT.chars) fail(`budget: +${total} chars > ${LIMIT.chars}`);

console.log(`draft: ${draftPath}\nbase:  ${basePath}`);
console.log(`+rules ${newRules.length}/${LIMIT.rules} (${newRules.map((r) => r?.id).join(", ")})`);
console.log(`+notes ${newNotes.length}/${LIMIT.notes}, +enums ${newEnums.length} (${newEnums.join(", ")})`);
console.log(`+chars ${total}/${LIMIT.chars} (rules ${ruleChars}, notes ${noteChars}, enums ${enumChars})`);
if (errors.length) {
  for (const e of errors) console.error(`FAIL: ${e}`);
  process.exit(1);
}
console.log("OK");
