import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LANGS } from "../public/i18n/index.js";
import { loadPack, isJapanese, READINGS } from "../lib/coach.js";

const pack = loadPack("jp");
const load = (l) => JSON.parse(readFileSync(new URL(`../public/demo/demo-${l}.json`, import.meta.url), "utf8"));

test("demo recordings exist for every UI language and tell the before → after story", () => {
  for (const lang of Object.keys(LANGS)) {
    const d = load(lang);
    assert.equal(d.lang, lang);
    assert.equal(d.questions.length, 10, lang);
    assert.ok(d.pick >= 0 && d.pick < 10, lang);
    const [before, after] = d.steps;
    assert.equal(before.review.answers_question, "no", `${lang}: first answer must miss the question`);
    assert.equal(after.review.answers_question, "yes", `${lang}: corrected answer must answer it`);
    assert.ok(Object.values(after.review.steps).filter((s) => s.present).length > Object.values(before.review.steps).filter((s) => s.present).length, `${lang}: structure improves`);
    // Script field ja → text; the ja recording is Japan + Japanese screen (same language), so it has no reading (2-axis rule, 11/03).
    const R = READINGS.ja[lang];
    assert.ok(isJapanese(before.script.text) && (R ? R.is(before.script.reading) : !("reading" in before.script) && !("translation" in before.script)), `${lang}: script language`);
    // Same language (ja screen + jp): no translation, so no question_tr either (review 11/03).
    if (!R) assert.ok(d.questions.every((q) => !("question_tr" in q)), `${lang}: question_tr absent`);
    for (const k of pack.answer_structure.steps.map((s) => s.key)) assert.ok(k in after.review.steps, k);
  }
});

test("demo recordings contain no contact data", () => {
  for (const lang of Object.keys(LANGS)) {
    const t = JSON.stringify(load(lang));
    assert.ok(!/[\w.+-]+@[\w-]+\.[\w.-]+/.test(t.replace(/\[email\]/g, "")), `${lang}: email`);
  }
});

test("demo step ④ names only what the recording shows (ja: no reading/translation)", () => {
  assert.doesNotMatch(LANGS.ja.demo.script, /読み方|訳/);
});

test("every language has the demo UI strings", () => {
  for (const [code, L] of Object.entries(LANGS)) for (const k of ["button", "banner", "next", "try", "mail", "pick", "bad", "script", "good", "done"]) assert.ok(L.demo?.[k], `${code} demo.${k}`);
});
