// Hybrid layout (side panel / mobile overlay), language·destination confirm dialog, ⚙ options. MOCK server, 0 tokens.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { LANGS } from "../../public/i18n/index.js";
import { startServer, launch, openApp, bubbles, send, shot, noHorizontalOverflow, CODE, MAIL, ANSWER, VIEWPORTS } from "./harness.js";

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

test("desktop: side panel beside the chat, open by default once questions exist, close is remembered", async () => {
  const { context, page, errors } = await openApp(browser, server.url, VIEWPORTS.desktop);
  const toggle = page.locator("#panelToggle"), panel = page.locator("#panel");
  assert.equal(await toggle.isHidden(), true, "toggle hidden until questions exist");
  await page.getByRole("button", { name: ko.demo.button }).click();
  await page.locator("#log .q").first().waitFor();
  await toggle.waitFor();
  // Intent changed (layout B, 11/03): was "closed until the first review auto-opens it". Now the desktop panel is
  // open by default as soon as there is a session, showing the empty state until the first review.
  await panel.waitFor();
  assert.equal(await toggle.getAttribute("aria-expanded"), "true");
  assert.equal(await toggle.getAttribute("aria-controls"), "panel");
  assert.equal(await page.locator("#reviewEmpty").isVisible(), true, "empty state before any review");
  await shot(page, "desktop-07-panel-empty");

  // Step 3 is the first review: it lands in the already open panel.
  await page.locator(".next-btn").click();
  await page.locator(".next-btn").click();
  await panel.locator(".step.miss").first().waitFor();
  assert.equal(await toggle.getAttribute("aria-expanded"), "true");
  assert.equal(await page.locator("#reviewEmpty").isHidden(), true);
  const [chat, side] = await Promise.all([page.locator("#log").boundingBox(), panel.boundingBox()]);
  // Intent changed (layout B): the fixed 560px chat column became fluid columns, minmax(420px,2fr) | minmax(560px,3fr).
  assert.ok(chat.width >= 420 && side.width >= 560, `fluid columns (chat ${chat.width}, panel ${side.width})`);
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
  // Intent changed (layout B): closed = the chat takes the whole width (was: back to one centred 560px column).
  assert.ok(closed.width >= 0.9 * VIEWPORTS.desktop.width, `chat spans the width when the panel is closed (${closed.width})`);
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
  assert.equal(await page.evaluate(() => localStorage.getItem("mensetsu-panel-closed")), null, "closing the phone overlay must not turn off the desktop default");
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

// Layout B (LAYOUT-BENCHMARK §5, approved 11/03): white top bar, flat rows with a role label, chat | document-style
// review pane across the viewport, each text column capped at 40em, nothing under 14px.
async function answered(page) {
  await toQuestions(page);
  await send(page, "1");
  await bubbles(page, "coach").filter({ hasText: /^Q1\./ }).waitFor();
  await send(page, ANSWER);
  await page.locator("#log > .msg.script .points").waitFor();
  await page.locator("#log > .msg.review .step").first().waitFor();
}
// Block-level elements holding text: rendered width / own font-size = the longest possible line in em (≈ CJK chars).
const lineEms = (root) => [...root.querySelectorAll("*")].flatMap((e) => {
  const cs = getComputedStyle(e), w = e.getBoundingClientRect().width;
  const text = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
  return text && w && !cs.display.startsWith("inline") ? [{ who: `${e.className || e.tagName}`, em: w / parseFloat(cs.fontSize) }] : [];
});
// Every visible element with its own text, anywhere on the page (header, chat, composer, panel).
const smallText = () => [...document.body.querySelectorAll("*")].filter((e) => e.getClientRects().length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
  .map((e) => ({ who: e.id || e.className || e.tagName, px: parseFloat(getComputedStyle(e).fontSize) })).filter((x) => x.px < 14);

for (const width of [1440, 1920]) {
  test(`layout B ${width}: chat | review fill ≥ 90% of the width; text ≤ 40em; nothing < 14px; flat labelled rows`, async () => {
    const { context, page, errors } = await openApp(browser, server.url, { width, height: 900 });
    await answered(page);
    const panel = page.locator("#panel");
    assert.equal(await panel.isVisible(), true, "open by default on desktop");
    const [chat, side, first] = await Promise.all([page.locator("#log").boundingBox(), panel.boundingBox(), page.locator("#log > .msg").first().boundingBox()]);
    assert.ok(side.x + side.width - chat.x >= 0.9 * width, `uses ${Math.round(side.x + side.width - chat.x)} of ${width}px`);
    assert.ok(first.x <= 24, `left gutter ${first.x}px ≤ 24`);
    assert.ok(width - (side.x + side.width) <= 24, "right gutter ≤ 24");

    const chatEms = await page.locator("#log").evaluate(lineEms);
    const paneEms = await page.locator("#reviewBox").evaluate(lineEms);
    assert.ok(chatEms.length > 10 && paneEms.length > 10, "measured something");
    for (const x of [...chatEms, ...paneEms]) assert.ok(x.em <= 40.05, `${x.who} line ${x.em.toFixed(1)}em > 40em`);
    assert.deepEqual(await page.evaluate(smallText), [], "no text under 14px");

    // Flat rows: no bubble shape, no shadow, no fill; a role label (CSS generated, so textContent stays clean) on top.
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), "rgb(255, 255, 255)");
    const rows = await page.locator("#log > .msg").evaluateAll((all) => all.map((e) => {
      const cs = getComputedStyle(e);
      return { cls: e.className, shadow: cs.boxShadow, bg: cs.backgroundColor, radius: Math.max(...["TopLeft", "TopRight", "BottomLeft", "BottomRight"].map((k) => parseFloat(cs[`border${k}Radius`]))), role: getComputedStyle(e, "::before").content };
    }));
    for (const r of rows) {
      assert.equal(r.shadow, "none", `${r.cls} shadow`);
      assert.ok(r.radius <= 4, `${r.cls} radius ${r.radius}`);
      assert.ok(r.bg === "rgba(0, 0, 0, 0)" || r.bg === "rgb(255, 255, 255)", `${r.cls} background ${r.bg}`);
      if (/\bme\b/.test(r.cls)) assert.equal(r.role, JSON.stringify(ko.ui.roleMe), r.cls);
      else if (/\bcoach\b/.test(r.cls)) assert.equal(r.role, JSON.stringify(ko.ui.roleCoach), r.cls);
    }
    // Document-style pane: ① structure ② corrections ③ model script, each section once.
    const titles = await page.locator("#reviewBox .title").allTextContents();
    for (const t of [ko.review.title, ko.review.corrections, ko.script.title]) assert.ok(titles.includes(t), `pane section ${t}`);
    assert.ok(await noHorizontalOverflow(page));
    await shot(page, `redesign-${width}-review`);
    assert.deepEqual(errors, []);
    await context.close();
  });
}

test("layout B: white header is one row at 1024/1440/1920 (ko, en, ja) with every control shown", async () => {
  for (const lang of ["ko", "en", "ja"]) for (const width of [1024, 1440, 1920]) {
    const { context, page, errors } = await openApp(browser, server.url, { width, height: 800 }, lang);
    await page.getByRole("button", { name: LANGS[lang].demo.button }).click();
    await page.locator("#panelToggle").waitFor(); // the fullest header: destination, language, panel, options, end
    const bar = await page.locator(".bar").evaluate((b) => {
      const parts = [b.querySelector(".brand"), ...b.querySelectorAll(".controls > *")].filter((e) => e.getClientRects().length).map((e) => e.getBoundingClientRect());
      const cs = getComputedStyle(b);
      return { oneRow: Math.max(...parts.map((r) => r.top)) < Math.min(...parts.map((r) => r.bottom)), n: parts.length, bg: cs.backgroundColor, line: cs.borderBottomWidth };
    });
    assert.ok(bar.oneRow && bar.n === 6, `${lang} ${width}: one row (${JSON.stringify(bar)})`);
    assert.equal(bar.bg, "rgb(255, 255, 255)", "white bar");
    assert.equal(bar.line, "1px", "hairline under the bar");
    assert.ok(await noHorizontalOverflow(page), `${lang} ${width} overflow`);
    if (lang === "ko" && width === 1024) await shot(page, "redesign-1024-header");
    assert.deepEqual(errors, []);
    await context.close();
  }
});

test("layout B 390: one column, review inline in the chat, panel only as an overlay, no overflow, nothing < 14px", async () => {
  const { context, page, errors } = await openApp(browser, server.url, VIEWPORTS.mobile);
  await answered(page);
  assert.equal(await page.locator("#panel").isHidden(), true);
  assert.equal(await page.locator("#log > .msg.review").isVisible(), true, "review inline in the chat");
  assert.ok(await noHorizontalOverflow(page));
  assert.deepEqual(await page.evaluate(smallText), [], "no text under 14px");
  await shot(page, "redesign-390-review");
  await page.click("#panelToggle");
  await page.locator("#panel").waitFor();
  assert.ok(await noHorizontalOverflow(page));
  await shot(page, "redesign-390-panel");
  assert.deepEqual(errors, []);
  await context.close();
});
