// Review fixes (11/03): tour input lock, panel after the demo, blocked storage, odd code input, Back and the panel,
// mobile spotlight, favicon, one-row desktop header. MOCK server, 0 tokens.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LANGS } from "../../public/i18n/index.js";
import { startServer, launch, openApp, bubbles, send, shot, noHorizontalOverflow, CODE, VIEWPORTS, ROOT, TOUR, tourTo } from "./harness.js";

const ko = LANGS.ko;
let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); server?.stop(); });

async function open(viewport, lang = "ko") {
  const o = await openApp(browser, server.url, viewport, lang);
  o.api = [];
  o.page.on("request", (r) => { if (new URL(r.url()).pathname.startsWith("/api/")) o.api.push(r.url()); });
  return o;
}
// Steps renumbered for the 9-step tour (11/03): review 3→5, compare 5→7; each test keeps its intent.
const stepIs = (page, n) => page.locator("#tourStep", { hasText: `${n}/${ko.tour.steps.length}` }).waitFor();
const next = (page) => page.locator(".next-btn").click();
const panelEmpty = async (page) => (await page.locator("#reviewBox > *").count()) === 0 && (await page.locator("#reviewEmpty").isVisible() || await page.locator("#panel").isHidden());
async function tipsOff(page) {
  await page.click("#opts");
  await page.click("#tourTips");
  await page.keyboard.press("Escape");
  await page.locator("#options").waitFor({ state: "hidden" });
}

test("M1: during the tour, [Send] and Ctrl+Enter do not submit the typed demo text", async () => {
  const { context, page, errors, api } = await open(VIEWPORTS.desktop);
  await page.getByRole("button", { name: ko.demo.button }).click();
  await stepIs(page, 1);
  assert.equal(await page.isDisabled("#send"), true, "send is off while the tour plays");
  await tourTo(page, TOUR.pick);
  await next(page);
  await stepIs(page, TOUR.answer);
  await page.waitForFunction(() => document.querySelector("#input").value.length > 0); // mid-typing
  await page.locator("#send").dispatchEvent("click");
  await page.locator("#input").press("Control+Enter");
  await page.locator("#log > .msg.me.spot").waitFor(); // the tour sent it, not the user
  assert.equal(await bubbles(page, "me").filter({ hasText: "••••" }).count(), 0);
  assert.equal(await bubbles(page, "err").count(), 0);
  await page.keyboard.press("Escape");
  await page.locator("#tour").waitFor({ state: "hidden" });
  assert.equal(await page.isDisabled("#send"), false, "send is back after the tour");
  assert.deepEqual(api, []);
  assert.deepEqual(errors, []);
  await context.close();
});

test("M2: the demo's review leaves the panel after Skip, after [Try it] and after the plain replay", async () => {
  const { context, page, errors } = await open(VIEWPORTS.desktop);
  await page.getByRole("button", { name: ko.demo.button }).click();
  await tourTo(page, TOUR.review);
  await page.locator("#reviewBox .review").waitFor();
  await page.click("#tourSkip");
  await page.locator("#tour").waitFor({ state: "hidden" });
  assert.ok(await panelEmpty(page), "panel empty after skip");
  await page.getByRole("button", { name: ko.demo.try }).click();
  await send(page, CODE);
  await bubbles(page, "coach").filter({ hasText: ko.chat.askMail.split("\n")[0] }).waitFor();
  assert.ok(await panelEmpty(page), "panel empty at the mail step");

  await context.close();

  // Tips off: the plain replay ends with [Try it] only.
  const o = await open(VIEWPORTS.desktop);
  await tipsOff(o.page);
  await o.page.getByRole("button", { name: ko.demo.button }).click();
  for (let i = 0; i < 5; i++) await o.page.locator("#log .next-btn").click();
  await o.page.locator("#reviewBox .compare").waitFor();
  await o.page.getByRole("button", { name: ko.demo.try }).click();
  assert.ok(await panelEmpty(o.page), "panel empty after [Try it] in the plain replay");
  assert.deepEqual([...errors, ...o.errors], []);
  await o.context.close();
});

test("M3: storage blocked (both getters throw) → the code step works and the flow reaches the mail step", async () => {
  const context = await browser.newContext({ viewport: VIEWPORTS.mobile, locale: "ko" });
  await context.addInitScript(() => {
    for (const k of ["localStorage", "sessionStorage"]) Object.defineProperty(window, k, { configurable: true, get() { throw new DOMException("blocked", "SecurityError"); } });
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(server.url);
  await bubbles(page, "coach").filter({ hasText: ko.chat.askCode }).waitFor({ timeout: 3000 });
  await send(page, CODE);
  await bubbles(page, "coach").filter({ hasText: ko.chat.askMail.split("\n")[0] }).waitFor({ timeout: 3000 });
  assert.equal(await page.getAttribute("#input", "placeholder"), ko.chat.mailPlaceholder);
  assert.deepEqual(errors, []);
  await context.close();
});

test("m1: a code with non-Latin-1 characters is refused on the client, without a request", async () => {
  const { context, page, errors, api } = await open(VIEWPORTS.mobile);
  await send(page, "접근코드");
  await bubbles(page, "err").filter({ hasText: ko.errors.access_denied() }).waitFor();
  await bubbles(page, "coach").filter({ hasText: ko.chat.askCode }).nth(1).waitFor();
  assert.deepEqual(api, []);
  assert.deepEqual(errors, []);
  await context.close();
});

test("m2: entering the code during the plain replay ends the demo; a later language change does not replay it", async () => {
  const { context, page, errors } = await open(VIEWPORTS.desktop);
  await tipsOff(page);
  await page.getByRole("button", { name: ko.demo.button }).click();
  await bubbles(page, "note").filter({ hasText: ko.demo.mail }).waitFor();
  await send(page, CODE);
  await bubbles(page, "coach").filter({ hasText: ko.chat.askMail.split("\n")[0] }).waitFor();
  await page.selectOption("#lang", "en");
  assert.equal(await page.locator("#confirm").isVisible(), false, "nothing to lose: no reset dialog");
  assert.equal(await page.getAttribute("#input", "placeholder"), LANGS.en.chat.mailPlaceholder);
  assert.equal(await bubbles(page, "demo-banner").count(), 1, "demo not restarted");
  assert.deepEqual(errors, []);
  await context.close();
});

test("m3: tour [Back] rolls the side panel back to the step it returns to", async () => {
  const { context, page, errors } = await open(VIEWPORTS.desktop);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: ko.demo.button }).click();
  await tourTo(page, TOUR.review);
  await page.locator("#reviewBox .review").waitFor();
  await page.click("#tourPrev");
  await stepIs(page, TOUR.answer);
  assert.equal(await page.locator("#reviewBox > *").count(), 0, "the step before the review had no review");
  assert.equal(await page.locator("#panelToggle").isVisible(), true, "questions are still there, so the toggle stays");
  await tourTo(page, TOUR.compare);
  await page.locator("#reviewBox .compare").waitFor();
  await page.click("#tourPrev");
  await stepIs(page, TOUR.script);
  assert.equal(await page.locator("#reviewBox .compare").count(), 0, "the step before compare had no compare");
  assert.equal(await page.locator("#reviewBox .review").count(), 1);
  assert.deepEqual(errors, []);
  await context.close();
});

test("m4: mobile step 3 spotlight shows the top of the review card", async () => {
  const { context, page, errors } = await open(VIEWPORTS.mobile);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: ko.demo.button }).click();
  await tourTo(page, TOUR.review);
  await page.locator("#log > .msg.review.spot").waitFor();
  const [card, log] = await Promise.all([page.locator("#log > .msg.review.spot").boundingBox(), page.locator("#log").boundingBox()]);
  assert.ok(card.y >= log.y - 1, `card top ${card.y} visible under log top ${log.y}`);
  assert.deepEqual(errors, []);
  await context.close();
});

// Headless Chrome does not fetch /favicon.ico, so the check is on the markup; a real browser would log a 404 without it.
test("m6: app and privacy pages declare an inline favicon (no /favicon.ico 404)", () => {
  for (const f of ["index.html", "privacy.html"]) assert.match(readFileSync(join(ROOT, "public", f), "utf8"), /<link rel="icon" href="data:,">/, f);
});

test("header: one row at 1440x900 and at 390x844 (≤ 56px on the phone), no overflow (ko/en/ja)", async () => {
  for (const lang of ["ko", "en", "ja"]) for (const vp of ["desktop", "mobile"]) {
    const { context, page, errors } = await open(VIEWPORTS[vp], lang);
    await page.evaluate(() => { document.getElementById("panelToggle").hidden = false; }); // widest state: all controls shown
    // Elements, not #ids: the pickers (icon + select, review M1 11/03) have no id; intent unchanged.
    const tops = await page.evaluate(() => [document.querySelector(".brand"), ...document.querySelectorAll(".controls > *")]
      .map((e) => { const r = e.getBoundingClientRect(); return Math.round(r.top + r.height / 2); })); // row = vertical centre (text and 44px buttons differ in height)
    const rows = new Set(tops).size;
    if (vp === "desktop") assert.equal(rows, 1, `${lang} desktop rows ${tops}`);
    // Intent changed 11/03 (UIUX §11.4-1): was "at most two rows on a phone"; now one row of icon controls, at most 56px tall.
    else {
      assert.equal(rows, 1, `${lang} mobile rows ${tops}`);
      assert.ok((await page.locator(".bar").boundingBox()).height <= 56, `${lang} mobile header height`);
    }
    assert.ok(await noHorizontalOverflow(page), `${lang} ${vp} overflow`);
    for (const s of ["#dest", "#lang", "#panelToggle", "#opts", "#end"]) {
      const h = (await page.locator(s).boundingBox()).height;
      assert.ok(h >= 44, `${s} ${h}px target`);
    }
    if (lang === "ko") await shot(page, `${vp}-17-header`);
    assert.deepEqual(errors, []);
    await context.close();
  }
});
