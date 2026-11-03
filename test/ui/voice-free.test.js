// Voice on the Gemini free tier (decision 11/03): the 🔊/⏹ button keeps its own corner of the script card, and the first
// recording of a session shows one line saying where the audio goes. MOCK server: 0 Claude / 0 Gemini calls.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { LANGS } from "../../public/i18n/index.js";
import { startServer, launch, openApp, bubbles, send, shot, CODE, MAIL, ANSWER, VIEWPORTS } from "./harness.js";

const ko = LANGS.ko;
let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); server?.stop(); });

const scriptCard = (page) => page.locator("#log > .msg.script:not(.review):not(.reverse)");
async function toAnswer(page) {
  await send(page, CODE);
  await bubbles(page, "coach").filter({ hasText: ko.chat.askMail.split("\n")[0] }).waitFor();
  await send(page, MAIL);
  await bubbles(page, "coach").filter({ hasText: ko.chat.askPick({ count: 10 }) }).waitFor();
  await send(page, "1");
  await page.locator("#mic").waitFor();
}

// Text lines (Range.getClientRects per text node) of the card's paragraphs that come within GAP px of the 🔊/⏹ button.
// Plain intersection is not enough: desktop-26 had ~10 px of air and still read as "the button covers 関係".
const GAP = 12;
const overlaps = (card) => card.evaluate((c, g) => {
  const r0 = c.querySelector(".listen").getBoundingClientRect();
  const b = { left: r0.left - g, right: r0.right + g, top: r0.top, bottom: r0.bottom };
  const hit = [];
  for (const p of c.querySelectorAll(":scope > p")) {
    const w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    for (let n; (n = w.nextNode()); ) {
      const r = document.createRange();
      r.selectNodeContents(n);
      for (const l of r.getClientRects()) if (l.width && l.left < b.right && b.left < l.right && l.top < b.bottom && b.top < l.bottom) hit.push(n.textContent.slice(0, 8));
    }
  }
  return hit;
}, GAP);
for (const vp of ["mobile", "desktop"]) {
  test(`🔊/⏹ never covers the card's text, also when the script is the first line and while reading (${vp})`, async () => {
    const { context, page, errors } = await openApp(browser, server.url, VIEWPORTS[vp]);
    await toAnswer(page);
    await page.fill("#input", ANSWER);
    await page.press("#input", "Control+Enter");
    const card = scriptCard(page);
    await card.getByRole("button", { name: ko.tts.play }).waitFor();
    assert.deepEqual(await overlaps(card), []);
    // desktop-26 (real Gemini): the bare script paragraph sat under the button.
    await card.evaluate((c) => { for (const p of c.querySelectorAll(":scope > p:not(.ja)")) p.hidden = true; });
    assert.deepEqual(await overlaps(card), [], "script as the first line");
    await card.getByRole("button", { name: ko.tts.play }).click();
    await page.waitForFunction(() => (document.querySelector(".msg.script .ja .read")?.textContent.length ?? 0) > 0, null, { timeout: 4000 });
    assert.deepEqual(await overlaps(card), [], "while reading (⏹ + highlight span)");
    if (vp === "desktop") await shot(page, "desktop-27-tts-button-fixed", card);
    await card.getByRole("button", { name: ko.tts.stop }).click();
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
    constructor(stream, o) { this.mimeType = o?.mimeType ?? "audio/webm"; }
    start() {}
    stop() { this.ondataavailable?.({ data: new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])], { type: this.mimeType }) }); this.onstop?.(); }
  };
};

// Intent changed 11/03: the answer 🎤 now recognises in the browser, so its first-use line says the model is downloaded once
// and the audio stays on the device; the Google free-tier line is left to the read-aloud check (still /api/stt).
test("on-device line: hidden until the first answer recording starts, then shown next to 🎤; not again; never the free-tier line (mobile)", async () => {
  const { context, page, errors } = await openApp(browser, server.url, VIEWPORTS.mobile);
  await context.addInitScript(micStub);
  await page.reload();
  await page.locator(".msg.coach").first().waitFor();
  await toAnswer(page);
  const line = page.getByText(ko.mic.local);
  assert.equal(await line.count(), 0, "not before recording");
  assert.equal(await page.getByText(ko.mic.freeTier).count(), 0);
  await page.getByRole("button", { name: ko.mic.start }).click();
  await line.waitFor({ timeout: 2000 });
  // ● glyph → record sprite icon (ICON-DUOTONE §4); intent unchanged: the timer still shows.
  assert.ok(await page.locator("#micStatus", { hasText: /^0:0\d$/ }).isVisible(), "the timer still shows");
  await page.getByRole("button", { name: ko.mic.stop }).click();
  await page.locator("#micStatus", { hasText: ko.mic.hint }).waitFor({ timeout: 4000 });
  await page.press("#input", "Control+Enter");
  await scriptCard(page).waitFor();
  assert.ok(await line.isHidden(), "gone once the answer is sent");
  await send(page, "2");
  await page.locator("#mic").waitFor({ state: "visible" });
  await page.getByRole("button", { name: ko.mic.start }).click();
  await page.getByRole("button", { name: ko.mic.stop }).waitFor();
  assert.ok(await line.isHidden(), "first recording only");
  assert.equal(await page.getByText(ko.mic.freeTier).count(), 0, "the answer audio never goes to Google");
  assert.deepEqual(errors, []);
  await context.close();
});
