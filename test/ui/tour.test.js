// Tutorial (rework 11/03, 9 steps): each step spotlights the user's action (input, 📎, Send), then its result; a fixed
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

test("tour: 9 steps — action then result is spotlit, whole page dimmed, Back undoes a step, Close at the end (desktop)", async () => {
  const { context, page, errors, api } = await open(VIEWPORTS.desktop);
  assert.equal(N, 9);
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

  await next(page, 3); // 3: pick by number → Send → the picked question
  await bubbles(page, "me").filter({ hasText: new RegExp(`^${demo.pick + 1}$`) }).waitFor();
  await page.locator("#log > .msg.coach.spot", { hasText: `Q${demo.pick + 1}.` }).waitFor();
  await framed(page, "3");

  await next(page, 4); // 4: the answer is typed (Next waits), sent, and the sent answer is spotlit
  await page.waitForFunction((len) => { const i = document.querySelector("#input"); return i.readOnly && i.value.length > 0 && i.value.length < len; }, demo.steps[0].answer.length);
  assert.equal(await page.isDisabled("#tourNext"), true, "Next waits while the step plays");
  await page.locator("#log > .msg.me.spot").waitFor();
  await framed(page, "4");

  await next(page, 5); // 5: desktop spotlights the readable copy in the panel
  const review = page.locator("#log > .msg.review");
  await review.waitFor();
  assert.ok(await review.evaluate((e) => e.classList.contains("appear")), "result card fades in");
  await page.locator("#reviewBox > .review.spot").waitFor();
  assert.equal(await page.inputValue("#input"), "");
  await framed(page, "5");
  await shot(page, "desktop-14-tour-5");

  await page.click("#tourPrev"); // Back removes what step 5 added
  await stepIs(page, 4);
  assert.equal(await review.count(), 0);
  assert.equal(await page.locator("#reviewBox > *").count(), 0, "panel back to its state before step 5");
  await page.locator("#log > .msg.me.spot").waitFor();
  await next(page, 5);
  await review.waitFor();

  await next(page, 6); // 6: script copy in the panel, with 🔊 (device voice in the tour)
  await page.locator("#reviewBox > .script.spot:not(.review) .listen").waitFor();
  await framed(page, "6");

  await next(page, 7); // 7: corrected answer typed and sent → before/after in the panel
  await page.locator("#reviewBox > .compare.spot").waitFor();
  assert.equal(await review.count(), 2);
  await framed(page, "7");
  await shot(page, "desktop-15-tour-7");

  await next(page, 8); // 8: notes tab and Finish·save
  await page.locator("#tabNotes.spot").waitFor();
  await page.locator("#end.spot").waitFor();
  // A spotlit control is opaque: a transparent tab let the dimmer show through (11/03).
  assert.equal(await page.locator("#tabNotes").evaluate((e) => getComputedStyle(e).backgroundColor), "rgb(255, 255, 255)");
  await framed(page, "8");

  await next(page, 9);
  assert.equal(await page.locator(".next-btn").count(), 0, "no Next on the last step");
  assert.equal(await page.textContent("#tourNext"), ko.tour.close);
  assert.equal(await page.locator("#tourSkip").isHidden(), true);
  await page.getByRole("button", { name: ko.demo.try }).and(page.locator(".spot")).waitFor();
  await framed(page, "9");
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

test("tour: reduced motion shows each step at once; Esc skips to the code button; fits 390px (mobile)", async () => {
  const { context, page, errors, api } = await open(VIEWPORTS.mobile);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: ko.demo.button }).click();
  await stepIs(page, 1);
  assert.ok(await noHorizontalOverflow(page), "popup fits 390px");
  await shot(page, "mobile-12-tour-1");
  for (let n = 2; n <= 5; n++) await next(page, n);
  // No typing: the review is there well before the 1.5s the typing motion would take.
  await page.locator("#log > .msg.review").waitFor({ timeout: 500 });
  assert.equal(await page.locator("#log .appear").count(), 0, "no fade-in");
  assert.equal(await page.inputValue("#input"), "");
  await page.locator("#log > .msg.review.spot").waitFor(); // phone: the chat card (the panel is an overlay); not motion: kept
  await framed(page, "mobile 5");
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
