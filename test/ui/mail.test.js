// 11/07 (user): signing up after a save mails ① a digest of that session and ② a preview of later mails, at once.
// MOCK: dev.js gives /api/subscribe a fake Claude and a fake mailer, so nothing is sent.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, launch, openApp, toScript, bubbles, VIEWPORTS } from "./harness.js";

let server, browser;
before(async () => {
  server = await startServer({ KV_REST_API_URL: "" });
  browser = await launch();
});
after(async () => {
  await browser?.close();
  server?.stop();
});

test("signup after saving sends the saved record and the preview; the dialog says the content will grow; done bubble", async () => {
  const { context, page, errors } = await openApp(browser, server.url, VIEWPORTS.desktop);
  await toScript(page);
  const question = await page.locator(".bubble.coach .ja").first().textContent().catch(() => "");
  await Promise.all([page.waitForEvent("download"), page.click("#end")]);
  await page.locator("#mail[open]").waitFor();
  assert.match(await page.locator("#mail").textContent(), /추후 보완·추가 예정/);
  await page.fill("#mailEmail", "me@example.com");
  await page.check("#mailConsent");
  // hold the reply: while it is on its way, "not now" and Esc cannot dismiss the dialog (review 11/07)
  let release;
  const held = new Promise((r) => (release = r));
  await page.route("**/api/subscribe", async (route) => { await held; await route.continue(); });
  const reqP = page.waitForRequest((r) => r.url().endsWith("/api/subscribe")), resP = page.waitForResponse((r) => r.url().endsWith("/api/subscribe"));
  await page.click("#mailSubmit");
  const req = await reqP;
  assert.equal(await page.locator("#mailLater").isDisabled(), true);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#mail[open]").count(), 1, "Esc does not close it while sending");
  release();
  const res = await resP;
  const body = req.postDataJSON();
  assert.equal(body.email, "me@example.com");
  assert.deepEqual([body.lang, body.pack], ["ko", "jp"], "the screen language and the destination decide the mails");
  assert.ok(body.record.startsWith("# ") && (!question || body.record.includes(question.trim())), "the saved Markdown");
  assert.match(body.preview, /일본어 모범답안 예/);
  assert.deepEqual(await res.json(), { ok: true, sent: 2 });
  await page.locator("#mail[open]").waitFor({ state: "detached" }).catch(() => {});
  assert.equal(await page.locator("#mail[open]").count(), 0, "dialog closed");
  assert.match(await bubbles(page, "coach").last().textContent(), /메일을 보냈어요/);
  assert.deepEqual(errors, []);
  await context.close();
});
