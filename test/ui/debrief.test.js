// Stage R step 6 in the browser: the debrief dialog, its own storage, the local overlap figure, the export. MOCK, 0 tokens.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { LANGS } from "../../public/i18n/index.js";
import { startServer, launch, openApp, bubbles, send, noHorizontalOverflow, CODE, ANSWER, VIEWPORTS, toAnswer } from "./harness.js";

const ko = LANGS.ko, d = ko.debrief;
const KEY = "mensetsu-debriefs";
const SECRET = "面接で聞かれた内容（架空） 03-1234-5678";

let server, off, browser;
before(async () => {
  server = await startServer({ RESEARCH_ENABLED: "1" });
  off = await startServer();
  browser = await launch();
});
after(async () => { await browser?.close(); server?.stop(); off?.stop(); });

const answered = async (page) => {
  await toAnswer(page);
  await page.fill("#input", ANSWER);
  await page.press("#input", "Control+Enter");
  await page.locator(".quick").waitFor();
};
const openDialog = (page) => page.locator(".quick").getByRole("button", { name: d.button }).click();
const dlg = (page) => page.locator("#debrief");

for (const [name, viewport] of [["390", { width: 390, height: 844 }], ["1280", { width: 1280, height: 800 }]]) {
  test(`debrief at ${name}: three fields, overlap with a generated question, nothing sent, not in the session, in the export, outlives finish`, async () => {
    const { context, page, errors } = await openApp(browser, server.url, viewport);
    await answered(page);
    const api = [];
    page.on("request", (r) => { if (new URL(r.url()).pathname.startsWith("/api/")) api.push(r.url()); });
    const first = await page.evaluate(() => JSON.parse(localStorage.getItem("mensetsu-session")).questions[0]);
    await openDialog(page);
    assert.ok(await dlg(page).evaluate((e) => e.open));
    assert.ok(await noHorizontalOverflow(page));
    assert.equal(await dlg(page).getByLabel(d.asked).inputValue(), "");
    await dlg(page).getByLabel(d.asked).fill(`${first.question}\n${SECRET}`);
    await dlg(page).getByLabel(d.difficult).fill("聞き返された場面（架空）");
    await dlg(page).getByLabel(d.outcome).fill("二次面接へ（架空）");
    await dlg(page).locator("#debriefOverlap", { hasText: d.overlap({ matched: 1, asked: 2, ids: "Q1" }) }).waitFor();
    await dlg(page).getByRole("button", { name: ko.opts.close }).click();

    const stored = await page.evaluate((k) => ({ debrief: localStorage.getItem(k), session: localStorage.getItem("mensetsu-session") }), KEY);
    assert.ok(stored.debrief.includes("二次面接へ（架空）"));
    assert.ok(!stored.session.includes("二次面接へ（架空）"), "the session is what the app sends from; the debrief stays out of it");

    await openDialog(page);
    assert.equal(await dlg(page).getByLabel(d.outcome).inputValue(), "二次面接へ（架空）", "reopening shows what was written");
    await dlg(page).getByRole("button", { name: ko.opts.close }).click();

    const [download] = await Promise.all([page.waitForEvent("download"), page.click("#end")]);
    const md = await readFile(await download.path(), "utf8");
    for (const s of [`## ${d.title}`, d.asked, d.difficult, d.outcome, "二次面接へ（架空）", "[phone]"]) assert.ok(md.includes(s), s);
    assert.ok(!md.includes("03-1234-5678"), "masked in the file");
    assert.ok(!md.includes(d.overlap({ matched: 1, asked: 2, ids: "Q1" })), "the figure stays on the screen");
    assert.deepEqual(api, [], "writing, reopening and exporting call no API");
    assert.ok((await page.evaluate((k) => localStorage.getItem(k), KEY)).includes("二次面接へ（架空）"), "finish keeps it, the privacy text says so");

    await page.locator("#mail").evaluate((m) => m.open && m.close());
    await page.locator("#opts").click();
    await page.getByRole("button", { name: d.deleteAll }).click();
    await page.locator("#debriefStatus", { hasText: d.deleted }).waitFor();
    assert.equal(await page.evaluate((k) => localStorage.getItem(k), KEY), null);
    assert.deepEqual(errors, []);
    await context.close();
  });
}

test("debrief after a reload: the restore notice offers it (the usual way back after the interview)", async () => {
  const { context, page, errors } = await openApp(browser, server.url, VIEWPORTS.mobile);
  await answered(page);
  await page.reload();
  await send(page, CODE);
  await bubbles(page, "coach").getByRole("button", { name: d.button }).first().click();
  assert.ok(await dlg(page).evaluate((e) => e.open));
  assert.deepEqual(errors, []);
  await context.close();
});

test("flag off: no debrief button, no delete control, nothing in the file", async () => {
  const { context, page, errors } = await openApp(browser, off.url, VIEWPORTS.mobile);
  await answered(page);
  assert.equal(await page.getByRole("button", { name: d.button }).count(), 0);
  await page.locator("#opts").click();
  assert.equal(await page.getByRole("button", { name: d.deleteAll }).isVisible(), false);
  await page.getByRole("button", { name: ko.opts.close }).click();
  await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ "x": { asked: "架空" } })), KEY);
  const [download] = await Promise.all([page.waitForEvent("download"), page.click("#end")]);
  assert.ok(!(await readFile(await download.path(), "utf8")).includes(d.title));
  assert.deepEqual(errors, []);
  await context.close();
});
