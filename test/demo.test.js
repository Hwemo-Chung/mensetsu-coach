import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LANGS } from "../public/i18n/index.js";
import { loadPack, isJapanese, EXPLAIN_LANGS } from "../lib/coach.js";

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
    assert.ok(isJapanese(before.script.ja) && EXPLAIN_LANGS[lang].isReading(before.script.reading), `${lang}: script language`);
    for (const k of pack.answer_structure.steps.map((s) => s.key)) assert.ok(k in after.review.steps, k);
  }
});

test("demo recordings contain no contact data", () => {
  for (const lang of Object.keys(LANGS)) {
    const t = JSON.stringify(load(lang));
    assert.ok(!/[\w.+-]+@[\w-]+\.[\w.-]+/.test(t.replace(/\[email\]/g, "")), `${lang}: email`);
  }
});

test("every language has the demo UI strings", () => {
  for (const [code, L] of Object.entries(LANGS)) for (const k of ["button", "banner", "next", "try", "mail", "pick", "bad", "script", "good", "done"]) assert.ok(L.demo?.[k], `${code} demo.${k}`);
});
