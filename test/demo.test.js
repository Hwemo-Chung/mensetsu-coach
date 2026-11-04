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

// Tour step "brief": hand-written, not a recording, so the card labels it as fictional and the data must hold by itself.
test("the tour's fictional brief: every language, sources on example.com only, every citation real, a mismatch citing both sides", () => {
  for (const lang of Object.keys(LANGS)) {
    const d = load(lang), b = d.brief;
    assert.ok(LANGS[lang].research.fictional, lang);
    assert.equal(b.research_status, "ok", lang);
    const ids = new Set(b.sources.map((s) => s.id));
    assert.ok(ids.size >= 2, lang);
    for (const s of b.sources) assert.equal(new URL(s.url).hostname, "example.com", s.url);
    const claims = [...Object.values(b.company_snapshot).flat(), ...Object.values(b.position_analysis).flat(), ...b.interview_intelligence.reported_questions].filter((c) => c?.value && c.value !== "not_found");
    assert.ok(claims.length >= 5, lang);
    for (const c of claims) {
      assert.ok(c.source_ids.length && c.source_ids.every((id) => ids.has(id)), `${lang}: ${c.value}`);
      assert.equal(c.source_count, c.source_ids.length, `${lang}: ${c.value}`);
      assert.equal(c.single_source, c.source_ids.length === 1, `${lang}: ${c.value}`);
    }
    const [flag] = b.mismatch_flags;
    assert.equal(b.mismatch_flags.length, 1, lang);
    assert.ok(d.mail.includes(flag.side_a.quote), `${lang}: the mail side is quoted from the demo mail`);
    assert.equal(flag.side_a.origin, "mail");
    assert.equal(flag.side_b.origin, "research");
    assert.ok(flag.side_b.source_ids.length && flag.side_b.source_ids.every((id) => ids.has(id)), lang);
    assert.ok(flag.verify_prompt, lang);
    assert.ok(!/recommended|おすすめ|추천|verdict/i.test(JSON.stringify(b)), `${lang}: no verdict`);
  }
});
