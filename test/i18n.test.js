import { test } from "node:test";
import assert from "node:assert/strict";
import { LANGS } from "../public/i18n/index.js";
import { EXPLAIN_LANGS, loadPack } from "../lib/coach.js";

// Every leaf key path of a translation object; functions count as leaves.
const paths = (o, pre = "") => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" && !Array.isArray(v) ? paths(v, `${pre}${k}.`) : [`${pre}${k}`]));

test("UI languages match the server's explanation languages", () => {
  assert.deepEqual(Object.keys(LANGS).sort(), Object.keys(EXPLAIN_LANGS).sort());
});

test("every UI language has exactly the keys of ko (no missing, no extra)", () => {
  const base = paths(LANGS.ko).sort();
  for (const [code, t] of Object.entries(LANGS)) assert.deepEqual(paths(t).sort(), base, code);
});

test("every pack stage, category and every API error code has a label in every language", () => {
  const t = loadPack("jp").question_taxonomy;
  const codes = ["access_denied", "rate_limited", "bad_request", "lang_unsupported", "mail_required", "mail_too_long", "answer_required", "answer_too_long", "question_required", "question_too_long", "attachment_empty", "attachment_too_large", "attachment_not_pdf", "attachment_not_docx", "attachment_docx_empty", "attachment_unsupported", "ai_busy", "generation_failed", "network", "unknown", "email_invalid", "consent_required", "mail_unavailable", "profile_too_long", "context_required"];
  for (const [code, L] of Object.entries(LANGS)) {
    for (const s of t.stages) assert.ok(L.stages[s], `${code} stage ${s}`);
    for (const c of t.categories) assert.ok(L.categories[c], `${code} category ${c}`);
    for (const st of loadPack("jp").answer_structure.steps) assert.ok(L.steps[st.key], `${code} step ${st.key}`);
    for (const e of codes) assert.equal(typeof L.errors[e], "function", `${code} error ${e}`);
    assert.match(L.errors.mail_too_long({ max: 8000 }), /8000|8,000/, `${code} interpolates max`);
  }
});
