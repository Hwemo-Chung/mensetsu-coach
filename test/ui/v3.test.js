// v3 layout (UIUX-SPEC §11.4 criteria 1–5): LINE-style phone (one-row header, coach mark, my bubbles on the right,
// tappable question cards, one pill composer) and the ≥1280px dashboard (question rail | chat | panel). MOCK, 0 tokens.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LANGS } from "../../public/i18n/index.js";
import { startServer, launch, openApp, bubbles, send, noHorizontalOverflow, CODE, MAIL, ANSWER, VIEWPORTS, TOUR, tourTo, ROOT } from "./harness.js";

const ko = LANGS.ko;
let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); server?.stop(); });

async function toQuestions(page, t = ko) {
  await send(page, CODE);
  await bubbles(page, "coach").filter({ hasText: t.chat.askMail.split("\n")[0] }).waitFor();
  await send(page, MAIL);
  await bubbles(page, "coach").filter({ hasText: t.chat.askPick({ count: 10 }) }).waitFor();
}

test("§11.4-1 390px (ko/en/ja): header is one row ≤ 56px, every control is a ≥44px target inside the screen, no overflow", async () => {
  for (const lang of ["ko", "en", "ja"]) {
    const { context, page, errors } = await openApp(browser, server.url, VIEWPORTS.mobile, lang);
    await page.evaluate(() => { document.getElementById("panelToggle").hidden = false; }); // widest state
    const m = await page.evaluate(() => {
      const bar = document.querySelector(".bar").getBoundingClientRect();
      const parts = [document.querySelector(".brand"), ...document.querySelectorAll(".controls > *")].map((e) => e.getBoundingClientRect());
      return { h: bar.height, centres: new Set(parts.map((r) => Math.round(r.top + r.height / 2))).size, right: Math.max(...parts.map((r) => r.right)) };
    });
    assert.ok(m.h <= 56, `${lang}: header ${m.h}px`);
    assert.equal(m.centres, 1, `${lang}: one row`);
    assert.ok(m.right <= 390, `${lang}: controls inside the screen (${m.right})`);
    for (const s of ["#dest", "#lang", "#panelToggle", "#opts", "#end"]) {
      const b = await page.locator(s).boundingBox();
      assert.ok(b.width >= 44 && b.height >= 44, `${lang} ${s} ${b.width}x${b.height}`);
    }
    assert.ok(await page.getByRole("button", { name: LANGS[lang].ui.end }).isVisible(), `${lang}: #end has its name`);
    assert.ok(await page.getByRole("button", { name: LANGS[lang].ui.panel }).isVisible(), `${lang}: #panelToggle has its name`);
    assert.ok(await noHorizontalOverflow(page), `${lang} overflow`);
    assert.deepEqual(errors, []);
    await context.close();
  }
});

test("§11.4-2 390px: my rows are right-aligned bubbles, coach rows carry the mark; [練習する] on a card = typing the number", async () => {
  const { context, page, errors } = await openApp(browser, server.url, VIEWPORTS.mobile);
  await toQuestions(page);
  const log = await page.locator("#log").boundingBox();
  const me = await bubbles(page, "me").last().boundingBox();
  assert.ok(log.x + log.width - (me.x + me.width) <= 20, `my bubble sits at the right (${me.x + me.width} of ${log.x + log.width})`);
  assert.ok(me.width <= 0.8 * log.width + 1, `my bubble ≤ 80% (${me.width})`);
  const mark = await bubbles(page, "coach").first().evaluate((e) => { const cs = getComputedStyle(e, "::after"); return { w: parseFloat(cs.width), content: cs.content }; });
  assert.ok(mark.w === 32 && mark.content !== "none", `coach mark ${JSON.stringify(mark)}`);

  const mine = await bubbles(page, "me").count();
  await page.locator("#log .q").nth(2).getByRole("button", { name: ko.chat.practice }).click();
  await bubbles(page, "me").nth(mine).filter({ hasText: /^3$/ }).waitFor(); // same bubble as typing "3"
  await bubbles(page, "coach").filter({ hasText: /^Q3\./ }).waitFor();
  await page.locator("#mic").waitFor(); // answer stage
  assert.equal(await page.getAttribute("#input", "placeholder"), ko.chat.answerPlaceholder);
  assert.ok(await noHorizontalOverflow(page));
  assert.deepEqual(errors, []);
  await context.close();
});

test("§11.4-3 390px: the composer is one pill row; 📎, 🎤 and Send are ≥44px targets on it", async () => {
  const { context, page, errors } = await openApp(browser, server.url, VIEWPORTS.mobile);
  await toQuestions(page);
  await send(page, "1");
  await page.locator("#mic").waitFor();
  const r = await page.evaluate(() => Object.fromEntries(["#composer .row", ".attach", "#input", "#mic", "#send"].map((s) => [s, document.querySelector(s).getBoundingClientRect().toJSON()])));
  const row = r["#composer .row"];
  assert.ok(row.height <= 64, `one row (${row.height}px)`);
  for (const s of [".attach", "#mic", "#send"]) {
    assert.ok(r[s].width >= 44 && r[s].height >= 44, `${s} ${r[s].width}x${r[s].height}`);
    assert.ok(r[s].top >= row.top - 1 && r[s].bottom <= row.bottom + 1, `${s} inside the bar`);
  }
  assert.ok(r[".attach"].right <= r["#input"].left + 1 && r["#input"].right <= r["#mic"].left + 1 && r["#mic"].right <= r["#send"].left + 1, "📎 | input | 🎤 | Send");
  assert.ok(Number(await page.locator("#composer .row").evaluate((e) => parseFloat(getComputedStyle(e).borderTopLeftRadius))) >= 20, "pill");
  assert.equal(await page.textContent("#send"), ko.ui.send, "Send keeps its (visually hidden) name");
  // A long answer grows the bar in height only; the box keeps the bar's width (field-sizing must not shrink it).
  await page.fill("#input", ANSWER.repeat(6));
  const [rw, iw] = await Promise.all([page.locator("#composer .row").boundingBox(), page.locator("#input").boundingBox()]);
  assert.ok(iw.width / rw.width >= 0.6 && iw.height > 44, `long text: input ${iw.width}x${iw.height} in a ${rw.width}px bar`);
  assert.deepEqual(errors, []);
  await context.close();
});

for (const width of [1440, 1920]) {
  test(`§11.4-4 ${width}px: rail | chat | panel; 10 questions with progress; a click practises; status turns ✗ after the review`, async () => {
    const { context, page, errors } = await openApp(browser, server.url, { width, height: 900 });
    const rail = page.locator("#rail");
    assert.equal(await rail.isVisible(), true, "rail shown before questions");
    assert.equal(await rail.locator("#railGuide li").count(), 3, "3-step guide before questions");
    await toQuestions(page);
    const [rb, lb, pb] = await Promise.all([rail.boundingBox(), page.locator("#log").boundingBox(), page.locator("#panel").boundingBox()]);
    assert.ok(Math.abs(rb.width - 280) <= 1 && rb.x <= 1, `rail 280px at the left (${rb.x}, ${rb.width})`);
    assert.ok(lb.x >= rb.x + rb.width - 1 && pb.x >= lb.x + lb.width - 1, "three columns left to right");
    const items = rail.locator("button[data-pick]");
    assert.equal(await items.count(), 10);
    assert.equal(await page.textContent("#railProgress"), ko.rail.progress({ n: 0, total: 10 }));
    assert.equal(await items.locator('use[href="/icons.svg#circle"]').count(), 10, "all ○ before practice");

    await items.nth(1).click();
    await bubbles(page, "coach").filter({ hasText: /^Q2\./ }).waitFor();
    assert.equal(await items.nth(1).getAttribute("aria-current"), "true", "current question highlighted");
    await page.fill("#input", ANSWER);
    await page.press("#input", "Control+Enter");
    await bubbles(page, "coach").filter({ hasText: ko.chat.askPickAgain }).waitFor();
    // The MOCK review misses every required step → ✗; ✓ is covered by statusOf() in test/export.test.js.
    await items.nth(1).locator('use[href="/icons.svg#x"]').waitFor();
    assert.equal(await items.nth(1).getAttribute("data-status"), "miss");
    assert.equal(await page.textContent("#railProgress"), ko.rail.progress({ n: 1, total: 10 }));
    assert.ok(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight), "page does not grow; columns scroll inside");
    assert.ok(await noHorizontalOverflow(page));
    assert.deepEqual(errors, []);
    await context.close();
  });
}

test("§11.4-5 1024px: two columns (chat | panel), no rail", async () => {
  const { context, page, errors } = await openApp(browser, server.url, { width: 1024, height: 768 });
  await toQuestions(page);
  assert.equal(await page.locator("#rail").isHidden(), true);
  const [lb, pb] = await Promise.all([page.locator("#log").boundingBox(), page.locator("#panel").boundingBox()]);
  assert.ok(lb.x <= 1 && pb.x >= lb.x + lb.width - 1, "chat | panel");
  assert.ok(await noHorizontalOverflow(page));
  assert.deepEqual(errors, []);
  await context.close();
});

// 11/04 layout check: on a Japanese screen the pack label and the screen-language name can say the same thing
// (結論 / 結論, 締め / 締め方); a name is never repeated. At ≥1024px with the panel open the full review lives in the
// panel, so the chat copy is a one-glance summary (verdict + steps) and the details are not shown twice side by side.
test("ja review: no repeated step names (chat, panel, guide); desktop chat keeps a review summary only", async () => {
  const ja = LANGS.ja;
  const { context, page, errors } = await openApp(browser, server.url, VIEWPORTS.desktop, "ja");
  // The MOCK fixtures are Korean-screen outputs (the ja language gate rejects them): serve the recorded ja demo instead.
  const demo = JSON.parse(readFileSync(new URL("../../public/demo/demo-ja.json", import.meta.url), "utf8"));
  await page.route("**/api/review", (r) => r.fulfill({ json: demo.steps[0].review }));
  await page.route("**/api/script", (r) => r.fulfill({ json: demo.steps[0].script }));
  await toQuestions(page, ja);
  await page.locator("#log .q button[data-pick]").first().click();
  const guide = await page.locator("#reviewGuide").innerText();
  assert.doesNotMatch(guide, /(\S+) — \1(\s|$)/, `guide: ${guide}`);
  await page.fill("#input", ANSWER);
  await page.press("#input", "Control+Enter");
  await page.locator("#reviewBox .review .step").first().waitFor();
  const names = await page.locator("#reviewBox .review .step, #log .review .step").allInnerTexts();
  for (const n of names) assert.doesNotMatch(n, /(^|\s)(\S+)\s+\2(\s|$)/, `repeated: ${n}`);
  assert.ok(names.some((n) => n.includes("締め方")) && !names.some((n) => /締め\s+締め方/.test(n)), names.join(" | "));
  const chat = page.locator("#log > .msg.review").last();
  assert.ok(await chat.locator(".step").first().isVisible(), "chat summary shows the steps");
  assert.equal(await chat.locator(".hint, .rule, .why").first().isVisible(), false, "details only in the panel");
  assert.ok(await page.locator("#reviewBox .review .rule").first().isVisible(), "panel has the details");
  assert.deepEqual(errors, []);
  await context.close();
});

// Tour end (user 11/04, plan B): closing the tutorial on a wide screen must not leave half the screen blank. A "next step"
// card fills the right column (what you get + enter the code) until the code is accepted; a phone never shows it.
for (const [width, height] of [[1024, 768], [1440, 900], [1920, 1080]]) {
  test(`tour end ${width}px: the right column shows the next-step card, gone once the code is accepted`, async () => {
    const { context, page, errors } = await openApp(browser, server.url, { width, height });
    const card = page.locator("#start");
    assert.equal(await card.isHidden(), true, "not on the first screen");
    await page.getByRole("button", { name: ko.demo.button }).click();
    await tourTo(page, TOUR.try);
    await page.click("#tourNext"); // [閉じる]
    await page.locator("#tour").waitFor({ state: "hidden" });
    await card.waitFor();
    const [lb, cb] = await Promise.all([page.locator("#log").boundingBox(), card.boundingBox()]);
    assert.ok(cb.x >= lb.x + lb.width - 1 && width - (cb.x + cb.width) <= 1, `card fills the right column (${cb.x}–${cb.x + cb.width})`);
    assert.ok(cb.width >= 0.3 * width, `card is a column, not a strip (${cb.width})`);
    assert.equal(await card.getByRole("heading", { name: ko.start.title }).count(), 1);
    assert.equal(await card.locator("li").count(), 3, "three things you get");
    await card.getByRole("button", { name: ko.start.cta }).click();
    assert.equal(await page.evaluate(() => document.activeElement.id), "input", "the button takes you to the code box");
    await send(page, CODE);
    await bubbles(page, "coach").filter({ hasText: ko.chat.askMail.split("\n")[0] }).waitFor();
    assert.equal(await card.isHidden(), true, "gone after the code");
    assert.ok(await noHorizontalOverflow(page));
    assert.deepEqual(errors, []);
    await context.close();
  });
}

test("tour end 390px: no next-step card on a phone (the chat fills the screen)", async () => {
  const { context, page, errors } = await openApp(browser, server.url, VIEWPORTS.mobile);
  await page.getByRole("button", { name: ko.demo.button }).click();
  await tourTo(page, TOUR.try);
  await page.click("#tourNext");
  await page.locator("#tour").waitFor({ state: "hidden" });
  assert.equal(await page.locator("#start").isVisible(), false);
  assert.deepEqual(errors, []);
  await context.close();
});

// Plan A by language (user 11/04): Japanese screens keep the demo result (A), Korean/English show the next-step card (B);
// ⚙ options switch it. A: the last review stays in the panel and the rail shows the demo's ✓, until the code is accepted.
async function tourClosed(page, t) {
  await page.getByRole("button", { name: t.demo.button }).click();
  await tourTo(page, TOUR.try);
  await page.click("#tourNext");
  await page.locator("#tour").waitFor({ state: "hidden" });
}
test("tour end 1440px, ja: plan A by default — demo result stays in the panel and the rail (✓), the code clears it", async () => {
  const ja = LANGS.ja;
  const { context, page, errors } = await openApp(browser, server.url, { width: 1440, height: 900 }, "ja");
  await tourClosed(page, ja);
  assert.equal(await page.locator("#start").isHidden(), true, "A has no next-step card");
  await page.locator("#reviewBox > .compare").waitFor();
  const pb = await page.locator("#panel").boundingBox();
  assert.ok(1440 - (pb.x + pb.width) <= 1, "panel fills the right column");
  const items = page.locator("#rail button[data-pick]");
  assert.equal(await items.count(), 10, "demo questions stay in the rail");
  assert.equal(await page.locator('#rail button[data-status="ok"]').count(), 1, "the demo's revised answer shows ✓");
  assert.notEqual(await page.textContent("#railProgress"), ja.rail.progress({ n: 0, total: 10 }), "progress is not 0/10");
  await send(page, CODE);
  await bubbles(page, "coach").filter({ hasText: ja.chat.askMail.split("\n")[0] }).waitFor();
  assert.equal(await page.locator("#panel").isHidden(), true, "cleared after the code");
  assert.equal(await page.locator("#railGuide").isVisible(), true);
  assert.deepEqual(errors, []);
  await context.close();
});

test("⚙ options: the tour-end choice overrides the language default and survives a reload", async () => {
  const { context, page, errors } = await openApp(browser, server.url, { width: 1440, height: 900 });
  await page.click("#opts");
  const dlg = page.locator("#options");
  assert.equal(await dlg.getByLabel(ko.opts.tourEndB).isChecked(), true, "ko default = B");
  await dlg.getByLabel(ko.opts.tourEndA).check();
  await page.keyboard.press("Escape");
  await page.reload();
  await page.locator(".msg.coach").first().waitFor();
  await tourClosed(page, ko);
  assert.equal(await page.locator("#start").isHidden(), true, "A chosen: no card");
  await page.locator("#reviewBox > .compare").waitFor();
  assert.deepEqual(errors, []);
  await context.close();
});

// Benchmark 11/04 (WCAG 1.4.1, GOV.UK task list): rail status is a visible word next to the icon, in every language.
// "Not started" stays screen-reader text: the ○ shape differs from ✗/✓, and nine labels would crowd out the category.
test("rail status: 'Needs work' / 'Done' are visible words next to the icon; 'Not started' is read, not shown", async () => {
  const { context, page, errors } = await openApp(browser, server.url, { width: 1440, height: 900 });
  await toQuestions(page);
  const tags = page.locator("#rail button[data-pick] .rail-status");
  assert.equal(await tags.first().textContent(), ko.rail.todo);
  assert.equal(await tags.first().evaluate((e) => e.classList.contains("vh")), true, "todo word is visually hidden");
  await page.locator("#rail button[data-pick]").first().click();
  await page.fill("#input", ANSWER);
  await page.press("#input", "Control+Enter");
  await bubbles(page, "coach").filter({ hasText: ko.chat.askPickAgain }).waitFor();
  const tag = tags.first();
  assert.equal(await tag.textContent(), ko.rail.miss);
  assert.ok(await tag.isVisible(), "status word is visible");
  assert.ok(parseFloat(await tag.evaluate((e) => getComputedStyle(e).fontSize)) >= 14);
  assert.deepEqual(errors, []);
  await context.close();
});

// English UI for US/UK readers (benchmark 11/04: LinkedIn readiness Low/Medium/High, strengths → areas to improve,
// "not a grade", re-drill): summary first on the review card, and an "Answer Q again" quick reply after a ✗.
test("en 1440px: review starts with readiness, strengths and areas to improve; an 'Answer again' chip re-drills a ✗", async () => {
  const en = LANGS.en, demo = JSON.parse(readFileSync(join(ROOT, "public/demo/demo-en.json"), "utf8"));
  const { context, page, errors } = await openApp(browser, server.url, { width: 1440, height: 900 }, "en");
  const answers = {
    "/api/questions": () => ({ company_context: demo.company_context, questions: demo.questions, specificity: demo.specificity }),
    "/api/review": () => demo.steps[0].review,
    "/api/script": () => demo.steps[0].script,
  };
  await page.route("**/api/**", (r) => { const p = new URL(r.request().url()).pathname; return answers[p] ? r.fulfill({ json: answers[p]() }) : r.continue(); });
  await toQuestions(page, en);
  assert.equal(await page.getAttribute("#input", "placeholder"), en.chat.pickPlaceholder);
  await page.locator("#log .q").nth(demo.pick).getByRole("button", { name: en.chat.practice }).click();
  assert.equal(await page.getAttribute("#input", "placeholder"), en.chat.answerPlaceholder);
  await page.fill("#input", demo.steps[0].answer);
  await page.press("#input", "Control+Enter");
  const card = page.locator("#log > .msg.review");
  await card.waitFor();
  const r = demo.steps[0].review, level = r.answers_question === "no" ? "low" : "medium";
  assert.equal(await card.locator(".readiness").textContent(), en.review.readiness({ level: en.review.levels[level] }));
  const first = await card.evaluate((c) => [...c.children].slice(0, 2).map((e) => e.className));
  assert.ok(first.some((c) => c.startsWith("readiness")), `readiness right under the title: ${first}`);
  assert.ok(await card.locator(".readiness").isVisible(), "the chat glance keeps the readiness line");
  // With the panel open (≥1024px) the full summary is read in the panel; the chat card keeps a glance (layout check 11/04).
  const pane = page.locator("#reviewBox > .review");
  await pane.getByText(en.review.signal).waitFor();
  await pane.locator(".sum", { hasText: en.review.improve }).waitFor();
  const again = page.locator(".quick").getByRole("button", { name: en.quick.again({ n: String(demo.pick + 1) }) });
  await again.click();
  await bubbles(page, "coach").filter({ hasText: new RegExp(`^Q${demo.pick + 1}\\.`) }).last().waitFor();
  assert.deepEqual(errors, []);
  await context.close();
});

test("ko/ja keep their review layout: no readiness line", async () => {
  const { context, page, errors } = await openApp(browser, server.url, { width: 1440, height: 900 });
  await toQuestions(page);
  await send(page, "1");
  await page.fill("#input", ANSWER);
  await page.press("#input", "Control+Enter");
  await page.locator("#log > .msg.review").waitFor();
  assert.equal(await page.locator(".readiness").count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

// English panel, progressive disclosure (benchmark 11/04, NN/g): summary and structure open; suggested edits and the
// stronger version start folded (with a count); first-vs-latest stays open. ko/ja panels are unchanged.
test("en panel: suggested edits and the stronger version start folded; opening shows them; ko has no folds", async () => {
  const en = LANGS.en, demo = JSON.parse(readFileSync(join(ROOT, "public/demo/demo-en.json"), "utf8"));
  const { context, page, errors } = await openApp(browser, server.url, { width: 1440, height: 900 }, "en");
  const answers = {
    "/api/questions": () => ({ company_context: demo.company_context, questions: demo.questions, specificity: demo.specificity }),
    "/api/review": () => demo.steps[0].review,
    "/api/script": () => demo.steps[0].script,
  };
  await page.route("**/api/**", (r) => { const p = new URL(r.request().url()).pathname; return answers[p] ? r.fulfill({ json: answers[p]() }) : r.continue(); });
  await toQuestions(page, en);
  await page.locator("#log .q").nth(demo.pick).getByRole("button", { name: en.chat.practice }).click();
  await page.fill("#input", demo.steps[0].answer);
  await page.press("#input", "Control+Enter");
  const folds = page.locator("#reviewBox details.fold");
  await folds.first().waitFor();
  assert.equal(await folds.count(), 2);
  assert.deepEqual(await folds.evaluateAll((ds) => ds.map((d) => d.open)), [false, false], "both start folded");
  const n = demo.steps[0].review.corrections.length;
  assert.equal(await folds.nth(0).locator("summary").textContent(), `${en.review.corrections} (${n})`);
  assert.equal(await folds.nth(1).locator("summary").textContent(), en.script.title);
  assert.ok(await page.locator("#reviewBox .readiness").isVisible(), "summary stays open");
  await folds.nth(0).locator("summary").click();
  await folds.nth(0).locator(".rule").first().waitFor();
  await folds.nth(1).locator("summary").click();
  await folds.nth(1).locator(".points").waitFor();
  await page.locator("#reviewBox > .script:not(.review)").getByRole("button", { name: en.tts.play }).waitFor();
  const sb = await folds.nth(0).locator("summary").boundingBox();
  assert.ok(sb.height >= 44, `summary is a 44px target (${sb.height})`);
  assert.deepEqual(errors, []);
  await context.close();

  const ko = await openApp(browser, server.url, { width: 1440, height: 900 });
  await toQuestions(ko.page);
  await send(ko.page, "1");
  await ko.page.fill("#input", ANSWER);
  await ko.page.press("#input", "Control+Enter");
  await ko.page.locator("#reviewBox > .review").waitFor();
  assert.equal(await ko.page.locator("#reviewBox details").count(), 0, "ko panel unchanged");
  assert.deepEqual(ko.errors, []);
  await ko.context.close();
});

// The same folds in the chat cards on a phone (user OK 11/04): ② and ③ start folded; 🔊 stays visible on the folded
// script card, and pressing it opens the card so the read-along highlight can be seen.
test("en 390px: chat cards fold ② and ③; 🔊 stays visible and opens the script", async () => {
  const en = LANGS.en, demo = JSON.parse(readFileSync(join(ROOT, "public/demo/demo-en.json"), "utf8"));
  const { context, page, errors } = await openApp(browser, server.url, VIEWPORTS.mobile, "en");
  const answers = {
    "/api/questions": () => ({ company_context: demo.company_context, questions: demo.questions, specificity: demo.specificity }),
    "/api/review": () => demo.steps[0].review,
    "/api/script": () => demo.steps[0].script,
  };
  await page.route("**/api/**", (r) => { const p = new URL(r.request().url()).pathname; return answers[p] ? r.fulfill({ json: answers[p]() }) : r.continue(); });
  await toQuestions(page, en);
  await page.locator("#log .q").nth(demo.pick).getByRole("button", { name: en.chat.practice }).click();
  await page.fill("#input", demo.steps[0].answer);
  await page.press("#input", "Control+Enter");
  const review = page.locator("#log > .msg.review"), script = page.locator("#log > .msg.script:not(.review):not(.reverse)");
  await script.locator("details.fold").waitFor();
  assert.equal(await review.locator("details.fold").evaluate((d) => d.open), false, "② folded in the chat card");
  assert.equal(await script.locator("details.fold").evaluate((d) => d.open), false, "③ folded in the chat card");
  assert.ok(await review.locator(".readiness").isVisible(), "summary visible");
  const listen = script.getByRole("button", { name: en.tts.play });
  assert.ok(await listen.isVisible(), "🔊 visible while folded");
  await listen.click();
  assert.equal(await script.locator("details.fold").evaluate((d) => d.open), true, "🔊 opens the script");
  await script.getByRole("button", { name: en.tts.stop }).click();
  assert.ok(await noHorizontalOverflow(page));
  assert.deepEqual(errors, []);
  await context.close();
});
