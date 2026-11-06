// Daily limit mode (DECISIONS 11/06 17:25, 17:40): with OPEN_ACCESS=1 the chat starts at the mail with the tour, a 429
// quota shows the notice with a code field, and the reviewer's code (there or in the options) lifts the limit.
// The code-first mode (OPEN_ACCESS unset, the harness default) is what every other UI test runs.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, launch, openApp, bubbles, send, CODE, MAIL, ANSWER, VIEWPORTS, scriptCard, shot, noHorizontalOverflow, TOUR, tourTo } from "./harness.js";
import { LANGS } from "../../public/i18n/index.js";

const ko = LANGS.ko;
let server, browser;
before(async () => { [server, browser] = await Promise.all([startServer({ OPEN_ACCESS: "1", DAILY_LIMIT_IP: "1" }), launch()]); });
after(async () => { await browser?.close(); server?.stop(); });

// One IP per test (dev.js passes the browser's headers on); `used` spends that IP's single call of the day first.
async function openAs(ip, { used = false, viewport = VIEWPORTS.desktop } = {}) {
  const o = await openApp(browser, server.url, viewport);
  await o.context.setExtraHTTPHeaders({ "x-forwarded-for": ip });
  if (used) assert.equal((await o.page.request.post(`${server.url}/api/questions`, { headers: { "x-forwarded-for": ip }, data: {} })).status(), 400, "counted, then refused for the empty mail");
  o.codes = [];
  o.page.on("request", (r) => { if (new URL(r.url()).pathname.startsWith("/api/")) o.codes.push([new URL(r.url()).pathname, r.headers()["x-access-code"] ?? ""]); });
  return o;
}
const quota = (page) => bubbles(page, "err").filter({ hasText: ko.errors.quota() });
async function unlock(box, value, expected) {
  await box.getByLabel(ko.opts.code).fill(value);
  await box.getByRole("button", { name: ko.opts.codeSend }).click();
  await box.getByRole("status").filter({ hasText: expected }).waitFor();
}

test("open: the first screen asks for the mail with the tour, no code step; the code field is in the options", async () => {
  const { context, page, errors } = await openAs("10.9.0.1", { viewport: VIEWPORTS.mobile });
  const first = bubbles(page, "coach").first();
  assert.match(await first.innerText(), new RegExp(ko.chat.askMail.split("\n")[0]));
  await first.getByRole("button", { name: ko.demo.button }).waitFor();
  assert.equal(await bubbles(page, "coach").filter({ hasText: ko.chat.askCode }).count(), 0);
  assert.equal(await page.getAttribute("#input", "placeholder"), ko.chat.mailPlaceholder);
  await page.click("#opts");
  await page.locator("#options").getByLabel(ko.opts.code).waitFor();
  assert.ok(await noHorizontalOverflow(page));
  await shot(page, "access-open-options");
  assert.deepEqual(errors, []);
  await context.close();
});

test("open: a quota on the questions shows the notice and a code field; the code lifts it and the mail goes through", async () => {
  const { context, page, errors, codes } = await openAs("10.9.0.2", { used: true, viewport: VIEWPORTS.mobile });
  await send(page, MAIL);
  const notice = quota(page);
  await notice.waitFor();
  assert.ok(await noHorizontalOverflow(page), "the code field fits a phone");
  assert.equal(await page.inputValue("#input"), MAIL.trim(), "the mail is back in the box (trimmed on send)");
  await shot(page, "access-quota-questions", notice);
  await unlock(notice, CODE, ko.opts.unlimited);
  await page.press("#input", "Control+Enter");
  await bubbles(page, "coach").filter({ hasText: ko.chat.askPick({ count: 10 }) }).waitFor();
  assert.deepEqual(codes.filter(([p]) => p === "/api/questions"), [["/api/questions", ""], ["/api/questions", CODE]]);
  assert.deepEqual(errors, []);
  await context.close();
});

test("open: a quota on the answer shows the notice in the cards; a wrong code says so, the right one lifts it", async () => {
  const { context, page, errors } = await openAs("10.9.0.3");
  await send(page, MAIL); // the IP's one call of the day
  await bubbles(page, "coach").filter({ hasText: ko.chat.askPick({ count: 10 }) }).waitFor();
  await send(page, "1");
  await page.fill("#input", ANSWER);
  await page.press("#input", "Control+Enter");
  await quota(page).first().waitFor();
  // Intent changed (refutation 14, 11/06): review and script are both refused, but the same notice and code field show once.
  await page.waitForFunction(() => !document.querySelector("#log > .msg.typing"));
  assert.equal(await quota(page).count(), 1);
  assert.equal(await page.locator("#log .code-field").count(), 1);
  assert.equal(await page.inputValue("#input"), ANSWER, "the answer is back in the box");
  const box = quota(page).first();
  await unlock(box, "wrong-code", ko.errors.access_denied());
  await unlock(box, CODE, ko.opts.unlimited);
  await page.press("#input", "Control+Enter");
  await scriptCard(page).getByRole("button", { name: ko.tts.play }).waitFor();
  assert.deepEqual(errors, []);
  await context.close();
});

test("open: the script's check over the limit keeps the script and shows the notice with the code field", async () => {
  const three = await startServer({ OPEN_ACCESS: "1", DAILY_LIMIT_IP: "3" }); // questions, review, script pass; the check is the 4th
  const { context, page, errors } = await openApp(browser, three.url, VIEWPORTS.desktop);
  try {
    await send(page, MAIL);
    await bubbles(page, "coach").filter({ hasText: ko.chat.askPick({ count: 10 }) }).waitFor();
    await send(page, "1");
    await page.fill("#input", ANSWER);
    await page.press("#input", "Control+Enter");
    await scriptCard(page).getByRole("button", { name: ko.tts.play }).waitFor();
    await quota(page).getByLabel(ko.opts.code).waitFor();
    assert.equal(await scriptCard(page).locator(".script-check").innerText(), ko.script.unchecked);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
    three.stop();
  }
});

test("open: the code entered in the options lifts the limit; Enter checks it without closing the dialog", async () => {
  const { context, page, errors } = await openAs("10.9.0.4", { used: true });
  await page.click("#opts");
  const dlg = page.locator("#options");
  await unlock(dlg, "wrong-code", ko.errors.access_denied());
  await dlg.getByLabel(ko.opts.code).fill(CODE);
  await dlg.getByLabel(ko.opts.code).press("Enter");
  await dlg.getByRole("status").filter({ hasText: ko.opts.unlimited }).waitFor();
  assert.ok(await dlg.evaluate((d) => d.open), "still open");
  await page.getByRole("button", { name: ko.opts.close }).click();
  await send(page, MAIL);
  await bubbles(page, "coach").filter({ hasText: ko.chat.askPick({ count: 10 }) }).waitFor();
  assert.equal(await quota(page).count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test("open: a 401 (a stale code) drops the code and stays at the mail, no code step", async () => {
  const { context, page, errors, codes } = await openAs("10.9.0.6");
  await page.click("#opts");
  await unlock(page.locator("#options"), CODE, ko.opts.unlimited);
  await page.getByRole("button", { name: ko.opts.close }).click();
  await page.route("**/api/questions", (r) => r.fulfill({ status: 401, json: { code: "access_denied" } }), { times: 1 });
  await send(page, MAIL);
  await bubbles(page, "err").filter({ hasText: ko.errors.access_denied() }).waitFor();
  assert.equal(await bubbles(page, "coach").filter({ hasText: ko.chat.askCode }).count(), 0);
  assert.equal(await bubbles(page, "coach").filter({ hasText: ko.chat.askMail.split("\n")[0] }).count(), 1, "not sent back to the start");
  assert.equal(await page.getAttribute("#input", "placeholder"), ko.chat.mailPlaceholder);
  await send(page, MAIL);
  await bubbles(page, "coach").filter({ hasText: ko.chat.askPick({ count: 10 }) }).waitFor();
  assert.deepEqual(codes.filter(([p]) => p === "/api/questions").map(([, c]) => c), [CODE, ""], "the stale code is dropped");
  assert.deepEqual(errors, []);
  await context.close();
});

// Refutation 1 (11/06): closing or skipping the tour and then sending a mail must leave no demo state behind.
// "a" keeps the demo's review in the panel after the tour, "b" shows the next-step card; both default by screen language.
test("open: after the tour is skipped, a sent mail starts clean in both tour-end modes", async () => {
  for (const [mode, ip] of [["a", "10.9.0.7"], ["b", "10.9.0.8"]]) {
    const { context, page, errors } = await openAs(ip);
    await page.evaluate((m) => localStorage.setItem("mensetsu-tour-end", m), mode);
    await page.getByRole("button", { name: ko.demo.button }).click();
    await tourTo(page, TOUR.review); // the demo's review is in the panel from here on
    await page.locator("#tourSkip").click();
    if (mode === "a") await page.locator("#reviewBox > *").first().waitFor();
    else await page.locator("#start").waitFor();
    await send(page, MAIL);
    await bubbles(page, "coach").filter({ hasText: ko.chat.askPick({ count: 10 }) }).waitFor();
    assert.ok(await page.locator("#start").isHidden(), `${mode}: the next-step card is gone`);
    assert.equal(await page.locator("#reviewBox > *").count(), 0, `${mode}: no demo review in the panel`);
    const set = bubbles(page, "qs").last();
    assert.equal(await set.locator(".practice:not([disabled])").count(), 10, `${mode}: every [Practice] works`);
    assert.equal(await page.locator(".rail-q:not([disabled])").count(), 10, `${mode}: every rail item works`);
    assert.deepEqual(errors, []);
    await context.close();
  }
});

// Refutation 2 (11/06): without a code, [Save & finish] must come back to the mail, as the saved message says.
test("open: [Save & finish] without a code comes back to the mail step", async () => {
  const { context, page, errors } = await openAs("10.9.0.9");
  await send(page, MAIL);
  await bubbles(page, "coach").filter({ hasText: ko.chat.askPick({ count: 10 }) }).waitFor();
  await Promise.all([page.waitForEvent("download"), page.click("#end")]);
  await page.click("#mailLater");
  assert.equal(await page.evaluate(() => document.body.dataset.stage), "mail");
  assert.equal(await page.getAttribute("#input", "placeholder"), ko.chat.mailPlaceholder);
  assert.deepEqual(errors, []);
  await context.close();
});

test("open: [Try it] at the end of the tour comes back to the mail, not to a code", async () => {
  const { context, page, errors } = await openAs("10.9.0.5");
  await page.evaluate(() => localStorage.setItem("mensetsu-tour-tips", "0")); // the plain replay: five steps, no coach marks
  await page.getByRole("button", { name: ko.demo.button }).click();
  for (let i = 0; i < 5; i++) await page.locator("#log .next-btn").click();
  await page.getByRole("button", { name: ko.demo.try }).click();
  await bubbles(page, "coach").filter({ hasText: ko.chat.askMail.split("\n")[0] }).nth(1).waitFor();
  assert.equal(await page.getAttribute("#input", "placeholder"), ko.chat.mailPlaceholder);
  assert.equal(await bubbles(page, "coach").filter({ hasText: ko.chat.askCode }).count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});
