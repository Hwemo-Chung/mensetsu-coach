import { test } from "node:test";
import assert from "node:assert/strict";
import { LANGS } from "../public/i18n/index.js";
import { EXPLAIN_LANGS, loadPack, PACKS } from "../lib/coach.js";

// Every leaf key path of a translation object; functions count as leaves.
const paths = (o, pre = "") => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" && !Array.isArray(v) ? paths(v, `${pre}${k}.`) : [`${pre}${k}`]));

test("UI languages match the server's explanation languages", () => {
  assert.deepEqual(Object.keys(LANGS).sort(), Object.keys(EXPLAIN_LANGS).sort());
});

test("every UI language has exactly the keys of ko (no missing, no extra)", () => {
  const base = paths(LANGS.ko).sort();
  for (const [code, t] of Object.entries(LANGS)) assert.deepEqual(paths(t).sort(), base, code);
});

// Loops over every pack (jp, kr): a kr session shows kr stages/categories with the same UI labels.
test("every pack stage, category and every API error code has a label in every language", () => {
  const codes = ["pack_unsupported", "access_denied", "rate_limited", "bad_request", "lang_unsupported", "mail_required", "mail_too_long", "answer_required", "answer_too_long", "question_required", "question_too_long", "attachment_empty", "attachment_too_large", "attachment_not_pdf", "attachment_not_docx", "attachment_docx_empty", "attachment_unsupported", "ai_busy", "generation_failed", "network", "unknown", "email_invalid", "consent_required", "mail_unavailable", "profile_too_long", "context_required", "tts_busy", "tts_unavailable", "text_too_long", "stt_busy", "stt_unavailable", "audio_too_large", "audio_unsupported"];
  for (const [code, L] of Object.entries(LANGS)) for (const id of PACKS) {
    const pack = loadPack(id), t = pack.question_taxonomy;
    for (const s of t.stages) assert.ok(L.stages[s], `${code} ${id} stage ${s}`);
    // Optional categories are valid model output too, so they need labels as well.
    for (const c of [...t.categories, ...(t.optional_categories ?? [])]) assert.ok(L.categories[c], `${code} ${id} category ${c}`);
    for (const st of pack.answer_structure.steps) assert.ok(L.steps[st.key], `${code} step ${st.key}`);
    for (const e of codes) assert.equal(typeof L.errors[e], "function", `${code} error ${e}`);
    assert.match(L.errors.mail_too_long({ max: 8000 }), /8000|8,000/, `${code} interpolates max`);
  }
});

// Labels that used to hard-code Japanese as the interview language are keyed by pack target (review 11/03).
// Within one file the native language is fixed, so the reading script depends on the target alone.
test("script/answer labels exist for every pack target; reading names the native script", () => {
  const targets = PACKS.map((id) => loadPack(id).language_pair.target);
  for (const [code, L] of Object.entries(LANGS)) for (const tg of targets) {
    for (const k of ["text", "reading"]) assert.ok(L.script[k][tg], `${code} script.${k}.${tg}`);
    for (const k of ["askAnswer", "waitReview"]) assert.ok(L.chat[k][tg], `${code} chat.${k}.${tg}`);
  }
  assert.match(LANGS.ko.script.reading.ja, /한글/);
  assert.match(LANGS.en.script.reading.ja, /romaji/i);
  assert.match(LANGS.en.script.reading.ko, /Revised Romanization/);
  assert.match(LANGS.ja.script.reading.ko, /カタカナ/);
  assert.doesNotMatch(JSON.stringify(Object.values(LANGS).map((L) => L.script)), /ひらがな/, "ja + jp has no reading (2-axis rule)");
  assert.match(LANGS.ja.chat.waitReview.ko, /韓国語/);
  assert.match(LANGS.ko.chat.askAnswer.ko, /^한국어로/);
  assert.equal(LANGS.ja.script.translation, "日本語訳");
});
