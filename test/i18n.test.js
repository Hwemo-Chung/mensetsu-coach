import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
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
  const codes = ["pack_unsupported", "access_denied", "rate_limited", "bad_request", "lang_unsupported", "mail_required", "mail_too_long", "answer_required", "answer_too_long", "question_required", "question_too_long", "attachment_empty", "attachment_too_large", "attachment_not_pdf", "attachment_not_docx", "attachment_docx_empty", "attachment_unsupported", "ai_busy", "generation_failed", "network", "unknown", "email_invalid", "consent_required", "mail_unavailable", "profile_too_long", "context_required", "tts_busy", "tts_unavailable", "text_too_long", "stt_busy", "stt_unavailable", "audio_too_large", "audio_unsupported", "name_required", "name_too_long", "name_invalid", "research_unavailable"];
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

// The hand-written list above missed research_unsupported, so the codes come from the source as well.
test("every error code the server returns has a label in every language", () => {
  const dirs = ["api", "lib"].map((d) => new URL(`../${d}/`, import.meta.url));
  const source = dirs.flatMap((d) => readdirSync(d).filter((f) => f.endsWith(".js")).map((f) => readFileSync(new URL(f, d), "utf8"))).join("\n");
  const codes = new Set([...source.matchAll(/\bcode: "([a-z_]+)"/g)].map((m) => m[1]));
  assert.ok(codes.size > 20, "the pattern still finds the codes");
  for (const [lang, L] of Object.entries(LANGS)) for (const c of codes) assert.equal(typeof L.errors[c], "function", `${lang} ${c}`);
});

test("labels in the screen language: a Japanese term is not left in the Korean or English strings", () => {
  for (const lang of ["ko", "en"]) {
    assert.doesNotMatch(LANGS[lang].chat.specificity({ n: 1, total: 2 }), /[\u4e00-\u9fff]/, lang);
    assert.doesNotMatch(LANGS[lang].script.text.ja, /[\u4e00-\u9fff]/, lang);
    assert.doesNotMatch(LANGS[lang].mail.body, /日本語/, lang);
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

// Decision 11/03 (PRD §16-16): who the coach is for comes from the (destination, screen language) pair — e.g. Japanese
// screen + Japan = a Japanese candidate at home — so destination labels never name an audience.
// The pack name goes into the prompts ("${pack.name}で転職する…"): same rule as the menu (PRD §16-16, review 11/03).
test("pack names name the country only, never an audience", () => {
  for (const id of PACKS) assert.doesNotMatch(loadPack(id).name, /向け|求職者|외국인|for non/i, id);
});

test("destination labels name the country only, never an audience (外国人向け / 日本人向け / 외국인용 / for non-…)", () => {
  for (const [code, t] of Object.entries(LANGS)) for (const d of ["jp", "kr", "anglo", "other"]) {
    assert.doesNotMatch(t.dest[d], /向け|외국인|내국인|용\)|for non|foreign/i, `${code}.dest.${d}: ${t.dest[d]}`);
  }
});

// English UI for US/UK readers (benchmark 11/04: GOV.UK / Microsoft style): plain sentences of at most 25 words, and
// counts that read right in the singular ("1 answer", never "1 answers" or "correction(s)").
test("en copy: every sentence ≤ 25 words; singular and plural counts read right", () => {
  const en = LANGS.en, long = [];
  const strings = (o) => Object.values(o).flatMap((v) => (typeof v === "string" ? [v] : v && typeof v === "object" ? strings(v) : []));
  for (const s of strings(en)) for (const sentence of s.split(/(?<=[.!?])\s+|\n/)) if (sentence.trim().split(/\s+/).length > 25) long.push(sentence);
  assert.deepEqual(long, []);
  assert.match(en.habits.title({ n: 1 }), /\b1 answer\)/);
  assert.match(en.habits.title({ n: 2 }), /\b2 answers\)/);
  assert.doesNotMatch(en.review.dropped({ n: 1 }), /\(s\)/);
  assert.match(en.chat.restored({ q: 10, a: 1 }), /\b1 answer\b/);
  assert.match(en.chat.specificity({ n: 1, total: 10 }), /\b1 question quotes\b/);
});

// Refutation 4 (11/06): the start card and the tour's last step show in both access modes, and the open mode has no code step.
test("the start card and the tour's last step do not send anyone to a code step", () => {
  for (const [code, L] of Object.entries(LANGS)) for (const s of [L.start.lead, L.start.cta, L.tour.steps.at(-1).body]) assert.doesNotMatch(s, new RegExp(L.chat.codePlaceholder, "i"), `${code}: ${s}`);
});

// Refutation 19 (11/06): the screen names prep sections from these labels (public/prep.js), so the pack's guidance
// 「準備は4〜8問、時間に合わせて2〜3問を選ぶ」 never reached it.
test("the reverse-question section label says how many to prepare and how many to ask, in every language", () => {
  for (const [code, L] of Object.entries(LANGS)) assert.match(L.prep.sections.reverse_questions, /4\D{1,3}8[^]*2\D{1,3}3/, code);
});
