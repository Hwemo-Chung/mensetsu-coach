// Shipped default (decision 11/03): STT_ENABLED unset → no 🎤 answer recording and no read-aloud check, 🔊 stays.
// The Gemini free tier forbids personal data; recorded answers carry names and companies. MOCK server, 0 AI calls.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { LANGS } from "../../public/i18n/index.js";
import { startServer, launch, openApp, bubbles, send, CODE, MAIL, ANSWER, VIEWPORTS, scriptCard } from "./harness.js";

const ko = LANGS.ko;
let server, browser;
before(async () => { server = await startServer({ STT_ENABLED: "0" }); browser = await launch(); });
after(async () => { await browser?.close(); server?.stop(); });

test("STT off: answer stage has no 🎤, the script card has 🔊 but no read-aloud button, /api/stt never called", async () => {
  const { context, page, errors } = await openApp(browser, server.url, VIEWPORTS.desktop);
  const stt = [];
  page.on("request", (r) => { if (r.url().includes("/api/stt")) stt.push(r); });
  await send(page, CODE);
  await bubbles(page, "coach").filter({ hasText: ko.chat.askMail.split("\n")[0] }).waitFor();
  await send(page, MAIL);
  await bubbles(page, "coach").filter({ hasText: ko.chat.askPick({ count: 10 }) }).waitFor();
  await send(page, "1");
  await page.waitForFunction((ph) => document.querySelector("#input").placeholder === ph, ko.chat.answerPlaceholder);
  assert.equal(await page.locator("#mic").isHidden(), true, "🎤 hidden at the answer stage");
  await page.fill("#input", ANSWER);
  await page.press("#input", "Control+Enter");
  await scriptCard(page).getByRole("button", { name: ko.tts.play }).waitFor();
  assert.equal(await page.locator(".readaloud").count(), 0, "no read-aloud button anywhere");
  assert.equal(stt.length, 0);
  assert.deepEqual(errors, []);
  await context.close();
});
