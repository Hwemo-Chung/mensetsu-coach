// Stage R fit in the browser: desired profile in the options dialog, the fit call, what never leaves. MOCK, 0 tokens.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { LANGS } from "../../public/i18n/index.js";
import { startServer, launch, openApp, bubbles, send, noHorizontalOverflow, CODE, MAIL } from "./harness.js";

const ko = LANGS.ko, r = ko.research, o = ko.opts;
const PHONE = { width: 390, height: 844 };
const KEY = "mensetsu-desired-profile";
const EXCLUDED = "デリバリー専任の職種（架空の希望）";

let server, browser, questions, research;
before(async () => {
  server = await startServer({ RESEARCH_ENABLED: "1" });
  browser = await launch();
  const call = (path, body) => fetch(`${server.url}${path}`, { method: "POST", headers: { "x-access-code": CODE, "content-type": "application/json" }, body: JSON.stringify(body) }).then((q) => q.json());
  questions = await call("/api/questions", { mail: MAIL, lang: "ko" });
  // /api/research allows 5 per server; one answer from the real gates serves the whole file.
  research = await call("/api/research", { company: "株式会社サンプルテック（仮）", position: "プロダクトマネージャー（仮）", lang: "ko" });
});
after(async () => { await browser?.close(); server?.stop(); });

const confirmCard = (page) => page.locator("#log > .msg.brief-confirm");
const briefCard = (page) => page.locator("#log > .msg.brief:not(.brief-confirm)").last();
const storedBrief = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("mensetsu-session")).company_context.research_brief ?? null);
const sentTo = (page, part) => {
  const list = [];
  page.on("request", (q) => { if (q.url().includes(part)) list.push(q); });
  return list;
};
const routes = async (page) => {
  await page.route("**/api/questions", (q) => q.fulfill({ json: questions }));
  await page.route("**/api/research", (q) => q.fulfill({ json: research }));
};
async function toQuestions(page) {
  await routes(page);
  await send(page, CODE);
  await bubbles(page, "coach").filter({ hasText: ko.chat.askMail.split("\n")[0] }).waitFor();
  await send(page, MAIL);
  await bubbles(page, "coach").filter({ hasText: ko.chat.askPick({ count: 10 }) }).waitFor();
}
const start = (page) => confirmCard(page).last().getByRole("button", { name: r.start }).click();
const fillDesired = async (page) => {
  await page.locator("#opts").click();
  const dlg = page.locator("#options");
  await dlg.getByLabel(o.desiredExcluded).fill(EXCLUDED);
  await dlg.getByLabel(o.desiredOvertime).fill("20");
  await page.getByRole("button", { name: o.close }).click();
};
const mismatch = (page) => briefCard(page).getByRole("heading", { name: r.mismatch });

test("the MOCK fit goes through the real gates: traced items show, the rest moves or goes, and the order holds", async () => {
  const { context, page, errors } = await openApp(browser, server.url, PHONE);
  const fit = sentTo(page, "/api/fit"), searches = sentTo(page, "/api/research");
  await toQuestions(page);
  assert.equal(fit.length, 0, "nothing to compare before the card");
  await start(page);
  await mismatch(page).waitFor();
  const text = await briefCard(page).innerText();
  for (const s of ["需要予測機能の刷新プロジェクトの推進", "製品の要件定義と開発チームとの進行管理（架空）", "担当業務の割合を確認しましょう（架空）", r.matches, "Python / AWS", r.gaps, r.confirm, "資料にない経験を確認できますか（架空）", r.checkpoints, "担当業務の割合（架空）を確認できますか？"]) assert.ok(text.includes(s), s);
  for (const s of ["どこにも書かれていない相違", "この職種は避けるべきです"]) assert.ok(!text.includes(s), s);
  assert.ok(text.indexOf(r.snapshot) < text.indexOf(r.mismatch) && text.indexOf(r.mismatch) < text.indexOf(r.reputation) && text.indexOf(r.questions) < text.indexOf(r.fit) && text.indexOf(r.fit) < text.indexOf(r.checkpoints), "spec order");
  const stored = await storedBrief(page);
  assert.equal(stored.mismatch_flags.length, 1);
  assert.equal(stored.research_status, "ok");
  assert.equal(fit.length, 1);
  const body = fit[0].postDataJSON();
  assert.equal(body.mail, MAIL.trim());
  assert.ok(!("fit_evaluation" in body.brief) && !("mismatch_flags" in body.brief), "only the research goes back");
  assert.deepEqual(Object.keys(searches[0].postDataJSON()).sort(), ["company", "lang", "position"]);
  assert.deepEqual(errors, []);
  await context.close();
});

test("desired profile: visible with the flag, kept under its own key across a reload, sent only to the fit call", async () => {
  const { context, page, errors } = await openApp(browser, server.url, PHONE);
  const all = [];
  page.on("request", (q) => { if (q.url().includes("/api/")) all.push(q); });
  await toQuestions(page);
  await page.locator("#opts").click();
  const dlg = page.locator("#options");
  await dlg.getByLabel(o.desiredRole).waitFor();
  assert.ok(await noHorizontalOverflow(page));
  await dlg.getByLabel(o.desiredRole).fill("プロダクト企画（架空の希望）");
  await dlg.getByLabel(o.desiredExcluded).fill(EXCLUDED);
  await dlg.getByLabel(o.desiredHard).fill("週2日以上の在宅（架空の希望）");
  await dlg.getByLabel(o.desiredSalary).fill("700");
  await dlg.getByLabel(o.desiredOvertime).fill("20");
  await page.getByRole("button", { name: o.close }).click();
  assert.deepEqual(JSON.parse(await page.evaluate((k) => localStorage.getItem(k), KEY)), { role_content: "プロダクト企画（架空の希望）", excluded_roles: EXCLUDED, hard_conditions: "週2日以上の在宅（架空の希望）", min_salary_man: "700", max_overtime_hours: "20" });
  await start(page);
  await mismatch(page).waitFor();
  const reverse = page.waitForRequest("**/api/reverse");
  await page.getByRole("button", { name: ko.reverse.button }).first().click();
  await reverse;
  const fits = all.filter((q) => q.url().includes("/api/fit"));
  assert.equal(fits.length, 1);
  assert.equal(fits[0].postDataJSON().desired_profile.excluded_roles, EXCLUDED);
  for (const q of all.filter((x) => !x.url().includes("/api/fit"))) assert.ok(!q.postData()?.includes("架空の希望"), q.url());
  assert.ok(all.some((q) => q.url().includes("/api/questions")) && all.some((q) => q.url().includes("/api/research")));
  await page.reload();
  await page.locator("#opts").click();
  assert.equal(await page.locator("#desired").isVisible(), false, "the flag is known only after the code");
  await page.getByRole("button", { name: o.close }).click();
  await send(page, CODE);
  await briefCard(page).waitFor();
  await page.locator("#opts").click();
  assert.equal(await dlg.getByLabel(o.desiredExcluded).inputValue(), EXCLUDED);
  assert.deepEqual(errors, []);
  await context.close();
});

test("deleting the profile clears the fields, the key and every fit section, and keeps the brief", async () => {
  const { context, page, errors } = await openApp(browser, server.url, PHONE);
  await toQuestions(page);
  await fillDesired(page);
  await start(page);
  await mismatch(page).waitFor();
  await page.locator("#opts").click();
  const dlg = page.locator("#options");
  await dlg.getByRole("button", { name: o.desiredDelete }).click();
  await dlg.getByText(o.desiredDeleted).waitFor();
  assert.equal(await dlg.getByLabel(o.desiredExcluded).inputValue(), "");
  assert.equal(await page.evaluate((k) => localStorage.getItem(k), KEY), null);
  await page.getByRole("button", { name: o.close }).click();
  const card = briefCard(page), text = await card.innerText();
  for (const s of [r.mismatch, r.fit, r.checkpoints]) assert.ok(!text.includes(s), s);
  assert.ok(text.includes(r.snapshot));
  const b = await storedBrief(page);
  assert.ok(!("mismatch_flags" in b) && !("fit_evaluation" in b) && !("company_checkpoints" in b));
  assert.equal(b.research_status, "ok");
  assert.deepEqual(errors, []);
  await context.close();
});

test("a fit answer arriving after the delete is dropped", async () => {
  const { context, page } = await openApp(browser, server.url, PHONE);
  let release, entered;
  const held = new Promise((res) => { release = res; }), hit = new Promise((res) => { entered = res; });
  await page.route("**/api/fit", async (q) => { entered(); await held; return q.fulfill({ json: { fit_evaluation: { matches: [], gaps: [], needs_user_confirmation: [] }, mismatch_flags: [{ topic: "遅れた結果（架空）", side_a: { origin: "desired_profile", quote: EXCLUDED, source_ids: [] }, side_b: { origin: "research", quote: "x", source_ids: ["s1"] }, verify_prompt: "x", ask: "agent" }], company_checkpoints: [] } }); });
  await toQuestions(page);
  await fillDesired(page);
  await start(page);
  await hit;
  await page.locator("#opts").click();
  await page.locator("#options").getByRole("button", { name: o.desiredDelete }).click();
  await page.getByRole("button", { name: o.close }).click();
  release();
  await briefCard(page).getByText(r.fitWait).waitFor({ state: "detached" });
  assert.ok(!(await briefCard(page).innerText()).includes("遅れた結果"));
  assert.ok(!("mismatch_flags" in await storedBrief(page)));
  await context.close();
});

test("a failed fit keeps the paid brief, says so, and the button tries again", async () => {
  const { context, page, errors } = await openApp(browser, server.url, PHONE);
  let fail = true;
  await page.route("**/api/fit", (q) => (fail ? q.fulfill({ status: 503, json: { code: "ai_busy" } }) : q.fallback()));
  await toQuestions(page);
  await start(page);
  const card = briefCard(page);
  await card.getByText(r.fitFailed).waitFor();
  assert.ok((await card.innerText()).includes(r.snapshot));
  assert.equal((await storedBrief(page)).research_status, "ok");
  fail = false;
  await card.getByRole("button", { name: r.refit }).click();
  await mismatch(page).waitFor();
  assert.ok(!(await card.innerText()).includes(r.fitFailed), "the failure line goes with the result");
  assert.ok(await card.getByRole("button", { name: r.refit }).isEnabled(), "and it can run again after a profile edit");
  assert.deepEqual(errors.filter((e) => !/503/.test(e)), []);
  await context.close();
});

test("a PDF is not uploaded for the comparison and the card says it was not used; a text file is", async () => {
  for (const [file, sent] of [[{ name: "cv.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7 synthetic") }, false], [{ name: "cv.txt", mimeType: "text/plain", buffer: Buffer.from("架空の経歴") }, true]]) {
    const { context, page } = await openApp(browser, server.url, PHONE);
    const fit = sentTo(page, "/api/fit");
    await routes(page);
    await send(page, CODE);
    await bubbles(page, "coach").filter({ hasText: ko.chat.askMail.split("\n")[0] }).waitFor();
    await page.locator("#file").setInputFiles(file);
    await page.locator("#chip").waitFor();
    await send(page, MAIL);
    await bubbles(page, "coach").filter({ hasText: ko.chat.askPick({ count: 10 }) }).waitFor();
    await start(page);
    await mismatch(page).waitFor();
    const body = fit[0].postDataJSON(), text = await briefCard(page).innerText();
    assert.equal(!!body.attachment, sent, file.name);
    assert.equal(text.includes(r.fitNoFile), !sent, file.name);
    await context.close();
  }
});

test("a reload shows the stored fit and calls nothing; an honest empty brief with nothing to compare calls nothing", async () => {
  const { context, page } = await openApp(browser, server.url, PHONE);
  await toQuestions(page);
  await start(page);
  await mismatch(page).waitFor();
  await page.reload();
  const fit = sentTo(page, "/api/fit");
  await send(page, CODE);
  await mismatch(page).waitFor();
  assert.equal(fit.length, 0, "a restore spends nothing by itself");
  assert.equal(await briefCard(page).getByRole("button", { name: r.refit }).count(), 0, "the mail is gone, so a re-run could only lose its side");
  await context.close();

  const empty = await openApp(browser, server.url, PHONE);
  const none = sentTo(empty.page, "/api/fit");
  await toQuestions(empty.page);
  await empty.page.unroute("**/api/research");
  await empty.page.route("**/api/research", (q) => q.fulfill({ json: { research_status: "ok", research_date: "2026-11-04", tool_errors: 0, company_snapshot: {}, position_analysis: {}, reputation_themes: [], interview_intelligence: {}, sources: [] } }));
  await start(empty.page);
  await briefCard(empty.page).getByText(r.empty).waitFor();
  assert.equal(none.length, 0);
  await empty.context.close();
});

test("unavailable research calls no fit", async () => {
  const { context, page } = await openApp(browser, server.url, PHONE);
  const fit = sentTo(page, "/api/fit");
  await toQuestions(page);
  await page.unroute("**/api/research");
  await page.route("**/api/research", (q) => q.fulfill({ json: { research_status: "unavailable", research_date: "2026-11-04" } }));
  await start(page);
  await briefCard(page).getByText(r.unavailable).waitFor();
  assert.equal(fit.length, 0);
  await context.close();
});

test("flag off: no profile fields, no card, no fit call", async () => {
  const off = await startServer();
  const { context, page } = await openApp(browser, off.url, PHONE);
  const fit = sentTo(page, "/api/fit");
  await toQuestions(page);
  await page.locator("#opts").click();
  assert.equal(await page.locator("#desired").isVisible(), false);
  await page.getByRole("button", { name: o.close }).click();
  assert.equal(await confirmCard(page).count(), 0);
  assert.equal(fit.length, 0);
  await context.close();
  off.stop();
});
