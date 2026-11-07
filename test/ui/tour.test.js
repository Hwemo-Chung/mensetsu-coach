// Tutorial (rework 11/03; 10 steps since 11/04, the fictional brief became step 3, the rest moved up by one and keep their intent): each step spotlights the user's action (input, 📎, Send), then its result; a fixed
// dimmer covers the whole page (header and panel too); spotlit elements never exceed the viewport. Plus prev/skip/Esc,
// reduced motion and the tips-off replay (unchanged).
// Replays public/demo/demo-<lang>.json only: every test asserts zero /api/ requests.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LANGS } from "../../public/i18n/index.js";
import { startServer, launch, openApp, bubbles, shot, noHorizontalOverflow, VIEWPORTS, ROOT } from "./harness.js";

const ko = LANGS.ko;
const demo = JSON.parse(readFileSync(join(ROOT, "public/demo/demo-ko.json"), "utf8"));
let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); server?.stop(); });

async function open(viewport, lang = "ko") {
  const o = await openApp(browser, server.url, viewport, lang);
  o.api = [];
  o.page.on("request", (r) => { if (new URL(r.url()).pathname.startsWith("/api/")) o.api.push(r.url()); });
  return o;
}
const N = ko.tour.steps.length;
const stepIs = (page, n) => page.locator("#tourStep", { hasText: `${n}/${N}` }).waitFor();
const next = async (page, n) => { await page.locator(".next-btn:not([disabled])").click(); await stepIs(page, n); };
// Every spotlit element fits the viewport, and the dimmer (not the page) is what sits over the header.
async function framed(page, label) {
  await page.waitForFunction(() => !document.querySelector("#tourNext").disabled, null, { timeout: 15000 });
  const m = await page.evaluate(() => {
    const dim = document.querySelector("#tourDim");
    dim.style.pointerEvents = "auto"; // the dimmer is click-through; hit-test it for this check only
    const top = document.elementFromPoint(20, 20)?.id;
    dim.style.pointerEvents = "";
    return { spots: [...document.querySelectorAll(".spot")].map((e) => Math.round(e.getBoundingClientRect().height)), top, vh: innerHeight };
  });
  assert.ok(m.spots.length > 0, `${label}: something is spotlit`);
  for (const h of m.spots) assert.ok(h <= m.vh, `${label}: spotlit ${h}px > viewport ${m.vh}px`);
  assert.equal(m.top, "tourDim", `${label}: the dimmer covers the header`);
}

// A tall spotlit card is clipped to its head and the popup covers the rest: the sample mismatch must stay readable above both.
const flagInSight = (page) => page.locator("#log > .msg.brief.spot").evaluate((card) => {
  const last = card.querySelector(".fit-flags").lastElementChild.getBoundingClientRect();
  const limit = Math.min(card.getBoundingClientRect().top + card.clientHeight, document.querySelector("#tour").getBoundingClientRect().top);
  if (last.bottom > limit) throw new Error(`the mismatch flag ends at ${last.bottom}, visible until ${limit}`);
});

// Intent changed 11/07 (user: the tour explains every feature, i18n strict): 16 steps; 9–14 show the rest of the service
// with recorded outputs (record-demo.mjs --extras) or the real control, disabled. Notes/save and try moved to 15 and 16.
test("tour: 16 steps — action then result is spotlit, whole page dimmed, Back undoes a step, Close at the end (desktop)", async () => {
  const { context, page, errors, api } = await open(VIEWPORTS.desktop);
  assert.equal(N, 16); // was 10; +6 for the rest of the service (11/07)
  await page.getByRole("button", { name: ko.demo.button }).click();
  await stepIs(page, 1);
  assert.equal(await page.textContent("#tourTitle"), ko.tour.steps[0].title);
  assert.equal(await page.textContent("#tourBody"), ko.tour.steps[0].body);
  assert.equal(await page.isDisabled("#tourPrev"), true, "no Back on step 1");
  // 1: the mail is typed into the composer (input + 📎 spotlit), then Send is spotlit and the mail is sent.
  await page.locator(".composer .row.spot").waitFor();
  await page.waitForFunction(() => document.querySelector("#input").value.length > 0);
  await page.locator("#send.spot").waitFor();
  await bubbles(page, "me").first().waitFor();
  await framed(page, "1");
  await bubbles(page, "demo-banner").waitFor();
  assert.equal(await bubbles(page, "note").count(), 0, "explanations live in the popup, not in bubbles");
  await shot(page, "desktop-13-tour-1");

  await next(page, 2); // 2: the question list (head only)
  await page.locator("#log > .msg.spot .q").first().waitFor();
  await framed(page, "2");

  await next(page, 3); // 3: the fictional brief, labelled as such, with its sample mismatch; no re-run button because nothing may call the API
  const card = page.locator("#log > .msg.brief.spot");
  await card.waitFor();
  const text = await card.innerText();
  for (const s of [ko.research.fictional, ko.research.mismatch, demo.brief.mismatch_flags[0].side_a.quote, demo.brief.mismatch_flags[0].verify_prompt, ko.research.conditions_, ko.research.axis.overtime, ko.research.status.unmet]) assert.ok(text.includes(s), s);
  assert.ok(!text.includes(ko.research.memoTitle), "no memo form in the sample: nothing may be stored");
  assert.equal(await card.getByRole("button", { name: ko.research.rerun }).count(), 0);
  await framed(page, "3");
  await flagInSight(page);
  await page.click("#tourPrev");
  await stepIs(page, 2);
  assert.equal(await page.locator("#log > .msg.brief").count(), 0, "Back removes the brief card");
  await next(page, 3);

  await next(page, 4); // 4: pick by number → Send → the picked question
  await bubbles(page, "me").filter({ hasText: new RegExp(`^${demo.pick + 1}$`) }).waitFor();
  await page.locator("#log > .msg.coach.spot", { hasText: `Q${demo.pick + 1}.` }).waitFor();
  await framed(page, "4");

  await next(page, 5); // 5: the answer is typed (Next waits), sent, and the sent answer is spotlit
  await page.waitForFunction((len) => { const i = document.querySelector("#input"); return i.readOnly && i.value.length > 0 && i.value.length < len; }, demo.steps[0].answer.length);
  assert.equal(await page.isDisabled("#tourNext"), true, "Next waits while the step plays");
  await page.locator("#log > .msg.me.spot").waitFor();
  await framed(page, "5");

  await next(page, 6); // 6: desktop spotlights the readable copy in the panel
  const review = page.locator("#log > .msg.review");
  await review.waitFor();
  assert.ok(await review.evaluate((e) => e.classList.contains("appear")), "result card fades in");
  await page.locator("#reviewBox > .review.spot").waitFor();
  assert.equal(await page.inputValue("#input"), "");
  await framed(page, "6");
  await shot(page, "desktop-14-tour-5");

  await page.click("#tourPrev"); // Back removes what step 6 added
  await stepIs(page, 5);
  assert.equal(await review.count(), 0);
  assert.equal(await page.locator("#reviewBox > *").count(), 0, "panel back to its state before step 6");
  await page.locator("#log > .msg.me.spot").waitFor();
  await next(page, 6);
  await review.waitFor();

  await next(page, 7); // 7: script copy in the panel, with 🔊 (device voice in the tour)
  await page.locator("#reviewBox > .script.spot:not(.review) .listen").waitFor();
  await framed(page, "7");

  await next(page, 8); // 8: corrected answer typed and sent → before/after in the panel
  await page.locator("#reviewBox > .compare.spot").waitFor();
  assert.equal(await review.count(), 2);
  await framed(page, "8");
  await shot(page, "desktop-15-tour-7");

  await next(page, 9); // 9: the habit tally of both recorded answers
  await page.locator("#log > .msg.note.spot", { hasText: ko.habits.title({ n: 2 }).trim() }).waitFor();
  await framed(page, "9");

  await next(page, 10); // 10: Answer / Check my script (disabled) and the recorded F15 card
  await page.locator("#log > .msg.spot .pick-mode[aria-pressed=true]", { hasText: ko.chat.modeVerify }).waitFor();
  assert.equal(await page.locator("#log > .msg.spot .pick-mode").first().isDisabled(), true, "nothing is clickable in the tour");
  await page.locator("#log > .msg.verify.spot").waitFor();
  const vtext = await page.locator("#log > .msg.verify.spot").textContent();
  assert.ok(vtext.includes(demo.verify.verify.unsupported[0].sentence), vtext.slice(0, 300));
  await framed(page, "10");

  await next(page, 11); // 11: the recorded reverse questions
  const rev = page.locator("#log > .msg.reverse.spot");
  await rev.waitFor();
  for (const r of demo.reverse.questions) assert.ok((await rev.innerText()).includes(r.question));
  await framed(page, "11");

  await next(page, 12); // 12: the prep document button (disabled) and its six stages, from the i18n stage names
  const prep = page.locator("#log > .msg.spot", { has: page.locator(".prep-ctl") });
  await prep.waitFor();
  for (const k of ["casual", "first", "second", "executive", "final", "offer"]) assert.ok((await prep.innerText()).includes(ko.prep.stageNames[k]), k);
  await framed(page, "12");

  await next(page, 13); // 13: calendar button, the practice record on the picked question, the debrief button
  await page.locator(".calendar-open.spot").waitFor();
  await page.locator(`.q[data-q="${demo.questions[demo.pick].id}"] .practice-log.spot`).waitFor();
  await page.locator("#log > .msg.spot button", { hasText: ko.debrief.button }).waitFor();
  await framed(page, "13");

  await next(page, 14); // 14: screen language and destination pickers
  await page.locator(".picker.spot #lang").waitFor();
  await page.locator(".picker.spot #dest").waitFor();
  await framed(page, "14");

  await next(page, 15); // 15: notes tab and Finish·save
  await page.locator("#tabNotes.spot").waitFor();
  await page.locator("#end.spot").waitFor();
  // A spotlit control is opaque: a transparent tab let the dimmer show through (11/03).
  assert.equal(await page.locator("#tabNotes").evaluate((e) => getComputedStyle(e).backgroundColor), "rgb(255, 255, 255)");
  await framed(page, "15");

  await next(page, 16);
  assert.equal(await page.locator(".next-btn").count(), 0, "no Next on the last step");
  assert.equal(await page.textContent("#tourNext"), ko.tour.close);
  assert.equal(await page.locator("#tourSkip").isHidden(), true);
  await page.getByRole("button", { name: ko.demo.try }).and(page.locator(".spot")).waitFor();
  await framed(page, "16");
  await page.click("#tourNext");
  await page.locator("#tour").waitFor({ state: "hidden" });
  assert.equal(await page.locator(".spot").count(), 0);
  assert.equal(await page.locator("#tourDim").isHidden(), true);
  assert.equal(await page.locator("#input").evaluate((e) => e.readOnly), false);
  await page.getByRole("button", { name: ko.demo.try }).click();
  assert.equal(await bubbles(page, "coach").filter({ hasText: ko.chat.askCode }).count(), 2);
  assert.deepEqual(api, [], "tour must not call the API");
  assert.deepEqual(errors, []);
  await context.close();
});

// 11/07 (i18n strict): every step in ja and en too — the popup text is the language's own, nothing is called, no errors.
test("tour: ja and en run all 16 steps in their own language, with no API call and no error", async () => {
  for (const lang of ["ja", "en"]) {
    const t = LANGS[lang], { context, page, errors, api } = await open(VIEWPORTS.desktop, lang);
    await page.getByRole("button", { name: t.demo.button }).click();
    for (let n = 1; n <= N; n++) {
      if (n > 1) await next(page, n);
      else await stepIs(page, 1); // the popup is up before its text is read
      await page.waitForFunction(() => !document.querySelector("#tourNext").disabled, null, { timeout: 15000 });
      assert.equal(await page.textContent("#tourTitle"), t.tour.steps[n - 1].title, `${lang} ${n}`);
      assert.equal(await page.textContent("#tourBody"), t.tour.steps[n - 1].body, `${lang} ${n}`);
      assert.ok(await page.locator(".spot").count() > 0, `${lang} ${n}: something is spotlit`);
    }
    assert.deepEqual(api, [], `${lang}: tour must not call the API`);
    assert.deepEqual(errors, [], lang);
    await context.close();
  }
});

test("tour: reduced motion shows each step at once; Esc skips to the code button; fits 390px (mobile)", async () => {
  const { context, page, errors, api } = await open(VIEWPORTS.mobile);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: ko.demo.button }).click();
  await stepIs(page, 1);
  assert.ok(await noHorizontalOverflow(page), "popup fits 390px");
  await shot(page, "mobile-12-tour-1");
  await next(page, 2);
  await next(page, 3);
  await flagInSight(page);
  for (let n = 4; n <= 6; n++) await next(page, n);
  // No typing: the review is there well before the 1.5s the typing motion would take.
  await page.locator("#log > .msg.review").waitFor({ timeout: 500 });
  assert.equal(await page.locator("#log .appear").count(), 0, "no fade-in");
  assert.equal(await page.inputValue("#input"), "");
  await page.locator("#log > .msg.review.spot").waitFor(); // phone: the chat card (the panel is an overlay); not motion: kept
  await framed(page, "mobile 6");
  await page.keyboard.press("Escape");
  await page.locator("#tour").waitFor({ state: "hidden" });
  assert.equal(await page.locator(".spot").count(), 0);
  await bubbles(page, "coach").filter({ hasText: ko.demo.done }).getByRole("button", { name: ko.demo.try }).waitFor();
  assert.equal(await page.locator("#log > .msg.review").count(), 1, "skipping does not play the remaining steps");
  assert.deepEqual(api, []);
  assert.deepEqual(errors, []);
  await context.close();
});

test("tour: Skip on step 1 (ja labels)", async () => {
  const { context, page, errors, api } = await open(VIEWPORTS.desktop, "ja");
  const ja = LANGS.ja;
  await page.getByRole("button", { name: ja.demo.button }).click();
  await stepIs(page, 1);
  assert.equal(await page.textContent("#tourTitle"), ja.tour.steps[0].title);
  await page.getByRole("button", { name: ja.tour.skip }).click();
  await page.locator("#tour").waitFor({ state: "hidden" });
  await bubbles(page, "coach").filter({ hasText: ja.demo.done }).waitFor();
  assert.equal(await page.locator("#log > .msg.review").count(), 0);
  assert.deepEqual(api, []);
  assert.deepEqual(errors, []);
  await context.close();
});

test("tour: tips turned off in ⚙ options → the plain replay with explanation bubbles", async () => {
  const { context, page, errors, api } = await open(VIEWPORTS.mobile);
  await page.click("#opts");
  await page.click("#tourTips");
  await page.keyboard.press("Escape");
  await page.locator("#options").waitFor({ state: "hidden" });
  await page.getByRole("button", { name: ko.demo.button }).click();
  await bubbles(page, "note").filter({ hasText: ko.demo.mail }).waitFor();
  assert.equal(await page.locator("#tour").isHidden(), true);
  for (let i = 0; i < 5; i++) await page.locator("#log .next-btn").click();
  await bubbles(page, "coach").filter({ hasText: ko.demo.done }).waitFor();
  assert.equal(await page.locator("#log > .msg.compare").count(), 1, "plain replay shows the compare view too");
  assert.equal(await page.locator(".spot").count(), 0);
  assert.deepEqual(api, []);
  assert.deepEqual(errors, []);
  await context.close();
});

test("tour: tall spotlit cards keep a real height (head only, not collapsed) and the spotlit Send looks pressable", async () => {
  const { context, page } = await open(VIEWPORTS.desktop);
  await page.getByRole("button", { name: ko.demo.button }).click();
  await page.locator("#send.spot").waitFor();
  assert.equal(await page.locator("#send").evaluate((e) => getComputedStyle(e).opacity), "1");
  await page.waitForFunction(() => !document.querySelector("#tourNext").disabled);
  await next(page, 2);
  await page.locator("#log > .msg.spot").waitFor();
  const h = await page.locator("#log > .msg.spot").evaluate((e) => e.getBoundingClientRect().height);
  assert.ok(h > 200, `question card head is ${h}px`);
  await context.close();
});

// Found 11/04: at 1280×720 the tour's scrollIntoView scrolled the document itself (176 px), cutting off the header for
// good. .app is a fixed-height screen, so the document must never move; 1440×900 hid this because nothing overflowed.
for (const [w, h, lang] of [[1280, 720, "ja"], [1280, 720, "ko"], [390, 844, "ja"]]) {
  test(`the document stays at the top during and after the tour (${w}×${h}, ${lang})`, async () => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: lang });
    await ctx.addInitScript((l) => { localStorage.setItem("mensetsu-lang", l); localStorage.setItem("mensetsu-tour-end", "a"); }, lang);
    const page = await ctx.newPage();
    await page.goto(server.url);
    await page.locator(".msg.coach").first().waitFor();
    await page.locator("#log button").first().click();
    await page.locator("#tourStep", { hasText: /^1\// }).waitFor();
    for (let i = 0; i < 30; i++) {
      await page.waitForFunction(() => document.querySelector("#tour").hidden || !document.querySelector("#tourNext").disabled, null, { timeout: 30000 });
      assert.equal(await page.evaluate(() => scrollY), 0, `step ${i + 1}: the document scrolled`);
      if (await page.evaluate(() => document.querySelector("#tour").hidden)) break;
      await page.click("#tourNext");
      await page.waitForTimeout(150);
    }
    assert.equal(await page.evaluate(() => Math.round(document.querySelector("header").getBoundingClientRect().top)), 0, "the header is on screen");
    await ctx.close();
  });
}
