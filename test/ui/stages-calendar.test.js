// Interview stages in the prep dialog, the Google Calendar link and the practice record (DECISIONS 11/06). MOCK, 0 tokens.
// Google's own event page is not opened here: the link's href is what this checks; that page is checked in Chrome by hand.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { LANGS } from "../../public/i18n/index.js";
import { calendarLink } from "../../public/calendar.js";
import { practiceTime } from "../../public/export.js";
import { loadPack } from "../../lib/coach.js";
import { startServer, launch, openApp, bubbles, send, shot, CODE, MAIL, ANSWER, VIEWPORTS } from "./harness.js";

const ko = LANGS.ko, stages = loadPack("jp").script_doc.stages;
const RESUME = "サンプル物流（架空） 在庫管理システムの開発を担当。";
const SHOWN = ["casual", "first", "second", "executive", "final", "offer"];
let server, browser;
before(async () => { server = await startServer({ PREP_ENABLED: "1" }); browser = await launch(); });
after(async () => { await browser?.close(); server?.stop(); });

const card = (page) => page.locator("#log > .msg.prep");
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("mensetsu-session")));
const apiCalls = (page) => { const list = []; page.on("request", (r) => { if (new URL(r.url()).pathname.startsWith("/api/")) list.push(r); }); return list; };
async function toQuestions(page) {
  await send(page, CODE);
  await bubbles(page, "coach").filter({ hasText: ko.chat.askMail.split("\n")[0] }).waitFor();
  await send(page, MAIL);
  await bubbles(page, "coach").filter({ hasText: ko.chat.askPick({ count: 10 }) }).waitFor();
}

test("stage: the dialog sends the chosen stage; the card, the file and the next dialog keep it; a retry keeps the document's", async () => {
  const { context, page, errors } = await openApp(browser, server.url, VIEWPORTS.desktop);
  await toQuestions(page);
  const calls = apiCalls(page), prepBodies = () => calls.filter((r) => r.url().endsWith("/api/prep")).map((r) => r.postDataJSON());
  await page.getByRole("button", { name: ko.prep.button }).first().click();
  assert.equal(await page.inputValue("#prepStage"), "first");
  assert.deepEqual(await page.locator("#prepStage option").evaluateAll((os) => os.map((o) => [o.value, o.textContent])), SHOWN.map((k) => [k, ko.prep.stageNames[k]]));
  await page.selectOption("#prepStage", "executive");
  await page.fill("#prepMaterial", RESUME);
  await page.click("#prepSubmit");
  await card(page).waitFor();
  assert.equal(prepBodies().at(-1).stage, "executive");
  assert.equal(await card(page).locator(".stage").textContent(), ko.prep.stageNames.executive);
  assert.deepEqual(await card(page).locator("details").evaluateAll((ds) => ds.map((d) => d.dataset.section)), stages.executive.required, "the server made the executive sections only");
  await shot(page, "stage-executive-card", card(page));
  const [dl] = await Promise.all([page.waitForEvent("download"), card(page).getByRole("button", { name: ko.prep.download }).click()]);
  assert.ok((await readFile(await dl.path(), "utf8")).includes(`${ko.prep.stage}: ${ko.prep.stageNames.executive}`));

  await page.getByRole("button", { name: ko.prep.button }).first().click();
  assert.equal(await page.inputValue("#prepStage"), "executive", "the dialog opens on the last stage");
  await page.click("#prepCancel");

  // A failed part is made again for the same document: its stage, not what the dialog was last left on.
  const part = (await stored(page)).prep, failed = { ...structuredClone(part), failed: [{ key: "motivation", section: "motivation", bundle: "intro", reason: ["number"] }] };
  const answers = [failed, part];
  await page.route("**/api/prep", (r) => r.fulfill({ json: answers.shift() }));
  await page.getByRole("button", { name: ko.prep.button }).first().click();
  await page.click("#prepSubmit"); // the resume is still in the dialog
  await card(page).getByRole("button", { name: ko.prep.retry }).waitFor();
  await page.getByRole("button", { name: ko.prep.button }).first().click();
  await page.selectOption("#prepStage", "offer");
  await page.click("#prepCancel");
  await card(page).getByRole("button", { name: ko.prep.retry }).click(); // the resume is there, so no dialog
  await page.waitForFunction(() => !JSON.parse(localStorage.getItem("mensetsu-session")).prep.failed.length);
  assert.deepEqual([prepBodies().at(-1).stage, prepBodies().at(-1).bundles], ["executive", ["intro"]]);
  assert.equal((await stored(page)).prep.stage, "executive");
  await page.reload();
  await send(page, CODE); // a session comes back after the code check only
  await card(page).locator(".stage").waitFor();
  assert.equal(await card(page).locator(".stage").textContent(), ko.prep.stageNames.executive);
  assert.deepEqual(errors, []);
  await context.close();
});

test("practice record and calendar: the card counts and times each practice; the link holds the title and the time only", async () => {
  const { context, page, errors } = await openApp(browser, server.url, VIEWPORTS.desktop);
  await toQuestions(page);
  const q1 = page.locator("#log > .msg.qs .q").first();
  assert.equal(await page.locator(".practice-log").count(), 0, "nothing before a practice");
  await send(page, "1");
  await page.locator("#mic").waitFor();
  const t0 = Date.now();
  await page.fill("#input", ANSWER);
  await page.press("#input", "Control+Enter");
  await q1.locator(".practice-log").waitFor();
  const s = await stored(page), at = s.attempts[0].at;
  assert.ok(Date.parse(at) >= t0 - 1000 && Date.parse(at) <= Date.now(), at);
  assert.equal(await q1.locator(".practice-log").textContent(), ko.chat.practiced({ n: 1, at: practiceTime(at) }));
  assert.equal(await page.locator(".practice-log").count(), 1, "only the question practised");

  const calls = apiCalls(page);
  await page.click(".calendar-open");
  await page.locator("#calendar[open]").waitFor();
  assert.equal(await page.locator("#calendarLink").isHidden(), true, "no link before a time is set");
  assert.deepEqual([await page.inputValue("#calendarKind"), await page.inputValue("#calendarMinutes")], ["interview", "60"]);
  await page.fill("#calendarAt", "2026-12-01T10:00");
  const link = page.locator("#calendarLink");
  assert.equal(await link.getAttribute("href"), calendarLink("2026-12-01T10:00", 60, ko.calendar.titles.interview({})));
  assert.deepEqual([await link.getAttribute("target"), await link.getAttribute("rel")], ["_blank", "noopener noreferrer"]);
  await page.selectOption("#calendarKind", "practice");
  assert.equal(await page.inputValue("#calendarMinutes"), "30");
  const href = await link.getAttribute("href");
  assert.equal(href, calendarLink("2026-12-01T10:00", 30, ko.calendar.titles.practice({ n: 9 })), "9 of 10 questions not reviewed yet");
  assert.match(href, /dates=20261201T010000Z%2F20261201T013000Z/);
  for (const secret of [ANSWER, s.company_context.company, s.questions[0].question]) assert.ok(!decodeURIComponent(href).includes(secret), secret);
  assert.equal(await page.textContent("#calendarText"), ko.calendar.text({ title: ko.calendar.titles.practice({ n: 9 }) }));
  await shot(page, "calendar-dialog", page.locator("#calendar"));
  await page.fill("#calendarAt", "");
  assert.equal(await link.isHidden(), true);
  assert.equal(calls.length, 0, "no server call");
  await page.locator("#calendar").getByRole("button", { name: ko.opts.close }).click();
  assert.equal(await page.locator("#calendar[open]").count(), 0);

  await page.reload(); // the record comes back with the session, after the code check
  await send(page, CODE);
  await page.locator("#log > .msg.qs .q").first().locator(".practice-log").waitFor();
  assert.equal(await page.locator("#log > .msg.qs .q").first().locator(".practice-log").textContent(), ko.chat.practiced({ n: 1, at: practiceTime(at) }));
  await page.evaluate(() => { const x = JSON.parse(localStorage.getItem("mensetsu-session")); delete x.attempts[0].at; localStorage.setItem("mensetsu-session", JSON.stringify(x)); });
  await page.reload(); // a session saved before the time was recorded
  await send(page, CODE);
  await page.locator("#log > .msg.qs .q").first().locator(".practice-log").waitFor();
  assert.equal(await page.locator("#log > .msg.qs .q").first().locator(".practice-log").textContent(), ko.chat.practiced({ n: 1 }));
  assert.deepEqual(errors, []);
  await context.close();
});

test("calendar in the demo: no session and no server call, the link still works", async () => {
  const { context, page, errors } = await openApp(browser, server.url, VIEWPORTS.mobile);
  await page.evaluate(() => localStorage.setItem("mensetsu-tour-tips", "0"));
  const calls = apiCalls(page);
  await page.getByRole("button", { name: ko.demo.button }).click();
  await page.locator("#log > .msg.qs .calendar-open").click();
  await page.fill("#calendarAt", "2026-12-24T19:30");
  await page.selectOption("#calendarKind", "practice");
  assert.equal(await page.getAttribute("#calendarLink", "href"), calendarLink("2026-12-24T19:30", 30, ko.calendar.titles.practice({ n: 0 })));
  assert.equal(calls.length, 0);
  assert.deepEqual(errors, []);
  await context.close();
});
