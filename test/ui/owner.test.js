// Public mail path closed by default; the owner token lives only in the browser that opened the #owner link.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, launch, openApp, toScript, bubbles, VIEWPORTS, ANSWER } from "./harness.js";

const TOKEN = "ui-owner-token-0123456789";
let server, browser;
before(async () => {
  server = await startServer({ MAIL_PUBLIC: "", MAIL_OWNER_TOKEN: TOKEN, KV_REST_API_URL: "" });
  browser = await launch();
});
after(async () => {
  await browser?.close();
  server?.stop();
});

const local = (page, key) => page.evaluate((k) => localStorage.getItem(k), key);
const weakCalls = (page) => {
  const list = [];
  page.on("request", (r) => { if (r.url().includes("/api/subscribe")) list.push(r); });
  return list;
};

test("no token, MAIL_PUBLIC off: access says mail:false, no dialog after saving, no weak request, nothing stored", async () => {
  const { context, page, errors } = await openApp(browser, server.url, VIEWPORTS.desktop);
  const calls = weakCalls(page);
  const access = page.waitForResponse((r) => r.url().endsWith("/api/access"));
  await toScript(page);
  assert.equal((await (await access).json()).mail, false);
  await Promise.all([page.waitForEvent("download"), page.click("#end")]);
  await bubbles(page, "coach").last().waitFor();
  assert.equal(await page.locator("#mail[open]").count(), 0, "no dialog");
  assert.equal(await local(page, "mensetsu-mail-asked"), null, "not remembered as asked: it was never offered");
  assert.deepEqual(calls, []);
  assert.equal(await local(page, "mensetsu-habits"), null);
  assert.equal(await local(page, "mensetsu-owner"), null);
  assert.deepEqual(errors, []);
  await context.close();
});

test("#owner=<token> is stored and leaves the address bar; a bad one is stripped and not stored", async () => {
  const { context, page, errors } = await openApp(browser, `${server.url}/#owner=${TOKEN}`, VIEWPORTS.desktop);
  assert.equal(await local(page, "mensetsu-owner"), TOKEN);
  assert.equal(await page.evaluate(() => location.hash), "");
  assert.ok(!page.url().includes(TOKEN));
  await context.close();
  const bad = await openApp(browser, `${server.url}/#owner=short`, VIEWPORTS.desktop);
  assert.equal(await local(bad.page, "mensetsu-owner"), null);
  assert.equal(await bad.page.evaluate(() => location.hash), "");
  assert.deepEqual([...errors, ...bad.errors], []);
  await bad.context.close();
});

test("with a token: each review sends counts only, with both headers; no store on the server changes nothing on screen", async () => {
  const { context, page, errors } = await openApp(browser, `${server.url}/#owner=${TOKEN}`, VIEWPORTS.desktop);
  const calls = weakCalls(page);
  const reply = page.waitForResponse((r) => r.url().includes("action=weak"));
  await toScript(page);
  assert.equal((await reply).status(), 503, "this mock server has no store");
  assert.equal(calls.length, 1);
  const req = calls[0], body = req.postData();
  assert.equal(req.method(), "POST");
  assert.equal(req.headers()["x-mail-owner"], TOKEN);
  assert.ok(req.headers()["x-access-code"]);
  // Fixture review: answers_question "no", all steps missing, only str-ketsuron survives the review gate.
  assert.deepEqual(JSON.parse(body), { rules: { "str-ketsuron": 1 }, steps: { ketsuron: 1, kijun: 1, sentakushi: 1 }, no: 1, attempts: 1, lang: "ko", job_tags: [] });
  assert.ok(!body.includes(ANSWER) && !body.includes("前職"), "no answer text");
  assert.deepEqual(JSON.parse(await local(page, "mensetsu-habits")), [{ r: ["str-ketsuron"], s: ["ketsuron", "kijun", "sentakushi"], a: false }]);
  assert.equal(await bubbles(page, "err").count(), 0, "a failed send shows nothing");
  assert.deepEqual(errors, []);
  await context.close();
});
