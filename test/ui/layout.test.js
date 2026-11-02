// Hybrid layout (side panel / mobile overlay), language·destination confirm dialog, ⚙ options. MOCK server, 0 tokens.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { LANGS } from "../../public/i18n/index.js";
import { startServer, launch, openApp, bubbles, send, shot, noHorizontalOverflow, CODE, MAIL, VIEWPORTS } from "./harness.js";

const ko = LANGS.ko, en = LANGS.en;
let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); server?.stop(); });

const focused = (page) => page.evaluate(() => document.activeElement?.id);
// The dialog's `close` event (which reverts or applies) is a task queued after [open] is removed, so wait for the value.
const valueIs = (page, sel, v) => page.waitForFunction(([s, x]) => document.querySelector(s).value === x, [sel, v], { timeout: 3000 });
async function toQuestions(page, t = ko) {
  await send(page, CODE);
  await bubbles(page, "coach").filter({ hasText: t.chat.askMail.split("\n")[0] }).waitFor();
  await send(page, MAIL);
  await bubbles(page, "coach").filter({ hasText: t.chat.askPick({ count: 10 }) }).waitFor();
}

test("desktop: side panel beside the chat, auto-opens once on the first review, close is remembered", async () => {
  const { context, page, errors } = await openApp(browser, server.url, VIEWPORTS.desktop);
  const toggle = page.locator("#panelToggle"), panel = page.locator("#panel");
  assert.equal(await toggle.isHidden(), true, "toggle hidden until questions exist");
  await page.getByRole("button", { name: ko.demo.button }).click();
  await page.locator("#log .q").first().waitFor();
  await toggle.waitFor();
  assert.equal(await toggle.getAttribute("aria-expanded"), "false");
  assert.equal(await toggle.getAttribute("aria-controls"), "panel");
  await shot(page, "desktop-07-panel-closed");

  // Step 3 is the first review: the panel opens by itself with that review.
  await page.locator(".next-btn").click();
  await page.locator(".next-btn").click();
  await panel.waitFor();
  assert.equal(await toggle.getAttribute("aria-expanded"), "true");
  assert.ok(await panel.locator(".step.miss").count() > 0, "panel shows the latest review");
  const [chat, side] = await Promise.all([page.locator("#log").boundingBox(), panel.boundingBox()]);
  assert.ok(Math.abs(chat.width - 560) < 2, `chat column stays 560px (got ${chat.width})`);
  assert.ok(side.x >= chat.x + chat.width - 1, "panel sits right of the chat");
  assert.ok(await noHorizontalOverflow(page), "horizontal overflow with panel open");
  assert.ok(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight), "page must not grow; log and panel scroll inside");
  assert.equal(await page.locator("#log").evaluate((e) => e.inert), false, "desktop panel does not block the chat");
  await shot(page, "desktop-08-panel-open");

  // Tabs: click and arrow keys.
  await page.click("#tabNotes");
  assert.equal(await page.getAttribute("#tabNotes", "aria-selected"), "true");
  await page.locator("#paneNotes").getByText(ko.notes.empty).waitFor();
  await page.press("#tabNotes", "ArrowLeft");
  assert.equal(await page.getAttribute("#tabReview", "aria-selected"), "true");
  assert.equal(await focused(page), "tabReview");

  // Close: focus back on the toggle; the next review does not reopen it.
  await page.click("#panelClose");
  await panel.waitFor({ state: "hidden" });
  assert.equal(await focused(page), "panelToggle");
  const closed = await page.locator("#log").boundingBox();
  assert.ok(Math.abs(closed.width - 560) < 2, "back to one 560px column");
  await page.locator(".next-btn").click();
  await page.locator(".next-btn").click();
  await page.locator("#log > .msg.review").nth(1).waitFor();
  assert.equal(await panel.isHidden(), true, "closed by the user: not reopened automatically");
  await toggle.click();
  assert.equal(await panel.locator(".step.ok").count(), 4, "toggle opens on the latest (revised) review");
  await toggle.click();
  await panel.waitFor({ state: "hidden" });
  assert.deepEqual(errors, []);
  await context.close();
});

test("mobile: panel opens only by button as a full-screen overlay; Esc and Close return focus", async () => {
  const { context, page, errors } = await openApp(browser, server.url, VIEWPORTS.mobile);
  const toggle = page.locator("#panelToggle"), panel = page.locator("#panel");
  await page.getByRole("button", { name: ko.demo.button }).click();
  await page.locator(".next-btn").click();
  await page.locator(".next-btn").click();
  await page.locator("#log > .msg.review").first().waitFor();
  assert.equal(await panel.isHidden(), true, "mobile never auto-opens");
  assert.ok(await noHorizontalOverflow(page), "390px header with the new buttons fits");
  await shot(page, "mobile-07-panel-closed");
  await toggle.click();
  await panel.waitFor();
  assert.deepEqual(await panel.boundingBox(), { x: 0, y: 0, width: 390, height: 844 }, "full-screen overlay");
  assert.equal(await page.locator("#log").evaluate((e) => e.inert), true, "chat is inert behind the overlay");
  assert.equal(await focused(page), "tabReview");
  assert.ok(await noHorizontalOverflow(page));
  await shot(page, "mobile-08-panel-open");
  await page.keyboard.press("Escape");
  await panel.waitFor({ state: "hidden" });
  assert.equal(await focused(page), "panelToggle");
  assert.equal(await page.locator("#log").evaluate((e) => e.inert), false);
  await toggle.click();
  await page.click("#panelClose");
  await panel.waitFor({ state: "hidden" });
  assert.equal(await focused(page), "panelToggle");
  assert.deepEqual(errors, []);
  await context.close();
});

test("language change with history: asks in the current language; No/Esc keep everything; Yes resets to the mail step", async () => {
  const { context, page, errors } = await openApp(browser, server.url, VIEWPORTS.desktop);
  await toQuestions(page);
  const count = await page.locator("#log > .msg").count();
  const dlg = page.locator("#confirm");

  await page.selectOption("#lang", "en");
  await dlg.waitFor();
  assert.equal(await page.textContent("#confirmTitle"), ko.confirm.lang, "text in the language before the change");
  assert.equal(await page.textContent("#confirmYes"), ko.confirm.yes);
  assert.equal(await focused(page), "confirmNo", "the destructive choice is not the default");
  await shot(page, "desktop-09-confirm");
  await page.click("#confirmNo");
  await dlg.waitFor({ state: "hidden" });
  await valueIs(page, "#lang", "ko"); // No reverts the select
  assert.equal(await page.locator("#log > .msg").count(), count);
  assert.equal(await page.textContent("#end"), ko.ui.end);

  await page.selectOption("#lang", "en");
  await dlg.waitFor();
  await page.keyboard.press("Escape");
  await dlg.waitFor({ state: "hidden" });
  await valueIs(page, "#lang", "ko"); // Esc reverts the select
  assert.equal(await page.locator("#log > .msg").count(), count);
  assert.equal(await page.evaluate(() => localStorage.getItem("mensetsu-lang")), "ko");

  await page.selectOption("#lang", "en");
  await dlg.waitFor();
  await page.click("#confirmYes");
  await bubbles(page, "coach").filter({ hasText: en.chat.askMail.split("\n")[0] }).waitFor();
  assert.equal(await page.locator("#log > .msg").count(), 1, "old bubbles cleared");
  assert.equal(await page.textContent("#log"), en.chat.askMail, "only new-language text in the chat");
  assert.equal(await page.textContent("#end"), en.ui.end);
  assert.equal(await page.getAttribute("#input", "placeholder"), en.chat.mailPlaceholder);
  assert.equal(await page.evaluate(() => sessionStorage.getItem("code")), CODE, "verified code kept");
  assert.equal(await page.evaluate(() => localStorage.getItem("mensetsu-session")), null, "stored session cleared");
  assert.equal(await page.evaluate(() => localStorage.getItem("mensetsu-lang")), "en");
  assert.equal(await page.locator("#panelToggle").isHidden(), true);
  // Still in the mail step: a new mail is sent with lang=en. The MOCK question fixture has Korean question_tr, so the
  // server's language gate rejects it for en; the English error sentence proves the request went out in the new language.
  await send(page, MAIL);
  await bubbles(page, "err").filter({ hasText: en.errors.generation_failed() }).waitFor();
  assert.deepEqual(errors, []);
  await context.close();
});

test("destination: KR listed as beta; no history → no dialog; with history No reverts, Yes resets", async () => {
  const { context, page, errors } = await openApp(browser, server.url, VIEWPORTS.desktop);
  const dlg = page.locator("#confirm");
  assert.equal(await page.locator("#dest option[value=kr]").textContent(), `${ko.dest.kr} · ${ko.dest.beta}`);
  await page.selectOption("#dest", "kr");
  assert.equal(await dlg.isHidden(), true, "nothing to lose: switch silently");
  assert.equal(await page.inputValue("#dest"), "kr");
  await page.selectOption("#dest", "jp");

  await toQuestions(page);
  await page.selectOption("#dest", "kr");
  await dlg.waitFor();
  assert.equal(await page.textContent("#confirmTitle"), ko.confirm.dest);
  await page.click("#confirmNo");
  await dlg.waitFor({ state: "hidden" });
  await valueIs(page, "#dest", "jp"); // No reverts the select
  assert.ok(await page.locator("#log .q").count() === 10, "questions kept");

  await page.selectOption("#dest", "kr");
  await dlg.waitFor();
  await page.click("#confirmYes");
  await page.waitForFunction(() => document.querySelectorAll("#log > .msg").length === 1, null, { timeout: 3000 }); // old bubbles cleared
  assert.equal(await page.textContent("#log"), ko.chat.askMail);
  assert.equal(await page.inputValue("#dest"), "kr");
  // A later language switch (nothing to lose now) must not snap the destination back to jp.
  await page.selectOption("#lang", "en");
  assert.equal(await dlg.isHidden(), true);
  assert.equal(await page.inputValue("#dest"), "kr");
  assert.deepEqual(errors, []);
  await context.close();
});

test("language change during the demo restarts the demo in the new language", async () => {
  const { context, page, errors } = await openApp(browser, server.url, VIEWPORTS.desktop);
  const api = [];
  page.on("request", (r) => { if (new URL(r.url()).pathname.startsWith("/api/")) api.push(r.url()); });
  await page.getByRole("button", { name: ko.demo.button }).click();
  await bubbles(page, "demo-banner").waitFor();
  await page.locator(".next-btn").click();
  await page.selectOption("#lang", "en");
  await page.locator("#confirm").waitFor();
  await page.click("#confirmYes");
  await bubbles(page, "demo-banner").filter({ hasText: en.demo.banner }).waitFor();
  assert.equal(await bubbles(page, "demo-banner").count(), 1, "replay starts over, old run cleared");
  assert.equal(await page.locator("#log").textContent().then((x) => x.includes(ko.demo.banner)), false);
  for (let i = 0; i < 5; i++) await page.locator(".next-btn").click();
  await bubbles(page, "coach").filter({ hasText: en.demo.done }).waitFor();
  assert.deepEqual(api, [], "demo must not call the API");
  assert.deepEqual(errors, []);
  await context.close();
});

test("options: tutorial tips toggle defaults on and survives a reload; 44px touch targets", async () => {
  const { context, page, errors } = await openApp(browser, server.url, VIEWPORTS.mobile);
  for (const sel of ["#dest", "#lang", "#opts", "#end", "#send"]) {
    const box = await page.locator(sel).boundingBox();
    assert.ok(box.height >= 44, `${sel} touch target ${box.height}px`);
  }
  assert.equal(await page.getAttribute("#opts", "aria-label"), ko.opts.button);
  await page.click("#opts");
  const dlg = page.locator("#options");
  await dlg.waitFor();
  assert.equal(await page.isChecked("#tourTips"), true, "default on");
  await shot(page, "mobile-09-options");
  await page.click("#tourTips");
  await page.keyboard.press("Escape");
  await dlg.waitFor({ state: "hidden" });
  assert.equal(await focused(page), "opts");
  assert.equal(await page.evaluate(() => localStorage.getItem("mensetsu-tour-tips")), "0");
  await page.reload();
  await page.locator(".msg.coach").first().waitFor();
  await page.click("#opts");
  await dlg.waitFor();
  assert.equal(await page.isChecked("#tourTips"), false, "choice survives a reload");
  await page.getByRole("button", { name: ko.opts.close }).click();
  await dlg.waitFor({ state: "hidden" });
  assert.ok(await noHorizontalOverflow(page));
  assert.deepEqual(errors, []);
  await context.close();
});
