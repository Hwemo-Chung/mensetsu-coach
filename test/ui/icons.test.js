// Duotone icons (ICON-DUOTONE.md): one sprite (public/icons.svg, Phosphor MIT) via <use>, no emoji pictographs in the
// UI chrome, states shown by icon swap + colour (never a background box). MOCK server: 0 Claude / 0 Gemini calls.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { LANGS } from "../../public/i18n/index.js";
import { startServer, launch, openApp, bubbles, send, shot, CODE, MAIL, ANSWER, VIEWPORTS } from "./harness.js";

const ko = LANGS.ko;
let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); server?.stop(); });

const IDS = ["attach", "check", "compare", "download", "file", "flag", "globe", "habits", "mic", "notes", "panel", "play", "question", "record", "send", "settings", "speaker", "stop", "tip", "warning", "x"];
const ICON_ONLY = ["#opts", "#chipX", ".attach", "#mic", ".listen"];

// UI chrome only: model/user content (.ja .tr .reading .points .basis .q, the user's bubbles) and <option> text are
// excluded. Kept notation is outside the ranges: arrows U+2190–21FF (→ ↗ ↘), ①② U+2460–24FF, × U+00D7 (0.8×, "2×").
async function chromeGlyphs(page) {
  return page.evaluate(() => {
    const RE = /[⌀-⏿■-➿⬀-⯿\u{1F000}-\u{1FAFF}]/u;
    const hits = [];
    const check = (where, text) => { if (RE.test(text)) hits.push(`${where}: ${text.trim().slice(0, 40)}`); };
    for (const e of document.querySelectorAll("button, label, .title, .verdict, .step, .legend, .label, .tab, .chip, #micStatus, #tourTitle, #tourBody, .tts-note")) {
      const c = e.cloneNode(true);
      for (const x of c.querySelectorAll("option, select, .ja, .tr, .reading, .points, .basis, .q")) x.remove();
      check(e.id || e.className || e.tagName, c.textContent);
    }
    // The app's own sentences sit directly in coach/note bubbles (askMail, saved, habits line).
    for (const b of document.querySelectorAll("#log > .msg.coach, #log > .msg.note")) {
      for (const n of b.childNodes) if (n.nodeType === 3) check("bubble", n.data);
      for (const n of b.querySelectorAll(":scope > span")) check("bubble span", n.textContent);
    }
    return hits;
  });
}
// External <use> loads asynchronously: wait until every icon on screen has a real box.
const iconsResolve = (page) => page.waitForFunction(() => {
  const all = [...document.querySelectorAll("svg.icon")].filter((s) => s.getClientRects().length);
  return all.length > 0 && all.every((s) => s.querySelector("use")?.getBBox().width > 0);
}, null, { timeout: 4000 });
async function iconOnlyButtons(page) {
  return page.evaluate((sel) => [...document.querySelectorAll(sel.join(","))].map((b) => ({
    who: b.id || b.className, text: b.textContent.trim(), bg: getComputedStyle(b).backgroundColor,
    icon: b.querySelector(":scope > svg.icon > use")?.getAttribute("href") ?? null, label: b.getAttribute("aria-label"),
  })), ICON_ONLY);
}
function assertIconOnly(list) {
  for (const b of list) {
    assert.equal(b.text, "", `${b.who}: icon only, no glyph text`);
    assert.match(b.icon ?? "", /^\/icons\.svg#/, `${b.who}: sprite icon`);
    assert.equal(b.bg, "rgba(0, 0, 0, 0)", `${b.who}: no background box`);
    assert.ok(b.label, `${b.who}: accessible name`);
  }
}

test("sprite: served as image/svg+xml with every mapped id and the MIT licence next to it", async () => {
  const res = await fetch(`${server.url}/icons.svg`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /^image\/svg\+xml/);
  const svg = await res.text();
  assert.match(svg, /Phosphor Icons \(MIT\)/);
  for (const id of IDS) assert.match(svg, new RegExp(`<symbol id="${id}" viewBox="0 0 256 256"><path [^>]*opacity="0\\.2"`), `${id}: duotone tint layer`);
  assert.doesNotMatch(svg, /id="close"/, "plain x has a square tint box; x-circle is used instead");
  const lic = await fetch(`${server.url}/icons.LICENSE.txt`);
  assert.equal(lic.status, 200);
  assert.match(await lic.text(), /Copyright \(c\) 2023 Phosphor Icons[\s\S]*Permission is hereby granted/);
});

for (const lang of ["ko", "en", "ja"]) {
  test(`static chrome + demo replay: no emoji pictographs, icons resolve, icon buttons have no background (${lang})`, async () => {
    const t = LANGS[lang];
    const { context, page, errors } = await openApp(browser, server.url, VIEWPORTS.desktop, lang);
    await iconsResolve(page);
    assert.deepEqual(await chromeGlyphs(page), []);
    await page.getByRole("button", { name: t.demo.button }).click();
    for (let i = 0; i < 5; i++) await page.locator(".next-btn").click();
    await bubbles(page, "coach").filter({ hasText: t.demo.done }).waitFor();
    const reviews = page.locator("#log > .msg.review");
    // Steps: x-circle on a missing step, check-circle on a present one; the verdict carries its own icon.
    assert.ok(await reviews.nth(0).locator('.step.miss > svg.icon > use[href="/icons.svg#x"]').count() > 0);
    assert.equal(await reviews.nth(1).locator('.step.ok > svg.icon > use[href="/icons.svg#check"]').count(), 4);
    assert.equal(await reviews.nth(0).locator('.verdict.no > svg.icon > use[href="/icons.svg#warning"]').count(), 1);
    assert.equal(await page.locator('#log .compare .cmp svg.icon').count() > 0, true, "compare table marks are icons");
    await iconsResolve(page);
    assert.deepEqual(await chromeGlyphs(page), []);
    if (lang === "ko") await shot(page, "redesign-icons-demo-review", reviews.nth(0));
    assert.deepEqual(errors, []);
    await context.close();
  });
}

const micStub = () => {
  const md = navigator.mediaDevices ?? {};
  md.getUserMedia = async () => ({ getTracks: () => [{ stop() {} }] });
  if (!navigator.mediaDevices) Object.defineProperty(navigator, "mediaDevices", { value: md });
  window.MediaRecorder = class {
    static isTypeSupported(t) { return t.startsWith("audio/webm"); }
    constructor() { this.mimeType = "audio/webm"; this.state = "inactive"; }
    start() { this.state = "recording"; }
    stop() {
      this.state = "inactive";
      this.ondataavailable?.({ data: new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3])], { type: this.mimeType }) });
      this.onstop?.();
    }
  };
};

test("live flow: attach chip, mic/record, listen/stop, panel open — icon swap + colour, never a background box (desktop)", async () => {
  const { context, page, errors } = await openApp(browser, server.url, VIEWPORTS.desktop);
  await context.addInitScript(micStub);
  await page.reload();
  await page.locator(".msg.coach").first().waitFor();
  await send(page, CODE);
  await bubbles(page, "coach").filter({ hasText: ko.chat.askMail.split("\n")[0] }).waitFor();
  await page.setInputFiles("#file", { name: "cv.txt", mimeType: "text/plain", buffer: Buffer.from("経歴") });
  await page.locator('#chip:not([hidden]) #chipName > svg.icon > use[href="/icons.svg#file"]').waitFor();
  await send(page, MAIL);
  await page.locator('#log > .msg.me > svg.icon > use[href="/icons.svg#file"]').waitFor();
  await bubbles(page, "coach").filter({ hasText: ko.chat.askPick({ count: 10 }) }).waitFor();
  await send(page, "1");
  await page.locator("#mic").waitFor();
  // Recording: mic → stop in red, the timer carries the record icon.
  await page.click("#mic");
  await page.locator('#mic[aria-pressed="true"] > svg.icon > use[href="/icons.svg#stop"]').waitFor();
  assert.equal(await page.locator("#mic").evaluate((b) => getComputedStyle(b).color), "rgb(176, 0, 32)");
  await page.locator('#micStatus > svg.icon > use[href="/icons.svg#record"]').waitFor();
  assertIconOnly(await iconOnlyButtons(page));
  assert.deepEqual(await chromeGlyphs(page), []);
  await iconsResolve(page);
  await page.click("#mic");
  await page.locator("#micStatus", { hasText: ko.mic.hint }).waitFor({ timeout: 4000 });

  await send(page, ANSWER);
  const card = page.locator("#log > .msg.script:not(.review):not(.reverse)");
  await card.locator(".listen").waitFor();
  await iconsResolve(page);
  assertIconOnly(await iconOnlyButtons(page));
  assert.deepEqual(await chromeGlyphs(page), []);

  // Playing: speaker → stop, and the state is in the colour, not a box.
  const listen = card.locator(".listen");
  const idle = await listen.evaluate((b) => getComputedStyle(b).color);
  await listen.click();
  await page.locator('.listen[aria-pressed="true"] > svg.icon > use[href="/icons.svg#stop"]').waitFor();
  assert.notEqual(await listen.evaluate((b) => getComputedStyle(b).color), idle, "playing changes the colour");
  assertIconOnly(await iconOnlyButtons(page));
  await shot(page, "redesign-icons-live", card);

  // The answer turn completes (habits line + panel redraw ran without throwing).
  await bubbles(page, "coach").filter({ hasText: ko.chat.askPickAgain }).last().waitFor();

  // Panel open: the toggle swaps its icon, no pastel fill.
  const toggle = page.locator("#panelToggle");
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  await page.locator('#panelToggle[aria-expanded="true"] > svg.icon > use[href="/icons.svg#x"]').waitFor();
  const bg = await toggle.evaluate((b) => getComputedStyle(b).backgroundColor);
  await toggle.click();
  await page.locator('#panelToggle[aria-expanded="false"] > svg.icon > use[href="/icons.svg#panel"]').waitFor();
  assert.equal(await toggle.evaluate((b) => getComputedStyle(b).backgroundColor), bg, "open/closed differ by icon, not background");
  assert.deepEqual(errors, []);
  await context.close();
});
