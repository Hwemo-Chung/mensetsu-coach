// The first result stays in view, and a failed request gives the typed text back. MOCK, 0 tokens.
// Research and prep are on, as in production: the cards after the question list are what pushed it off screen.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { LANGS } from "../../public/i18n/index.js";
import { startServer, launch, openApp, bubbles, send, scriptCard, toAnswer, CODE, MAIL, ANSWER, VIEWPORTS } from "./harness.js";

const ko = LANGS.ko;
const BUSY = (r) => r.fulfill({ status: 503, json: { code: "ai_busy" } });
const DOWN = (r) => r.abort();
const FIRST_WAIT_ENDS = 3300; // waiting() scrolls once 3 s after it was created, even when the request has already ended
let server, browser, questions;
before(async () => {
  server = await startServer({ RESEARCH_ENABLED: "1", PREP_ENABLED: "1" });
  browser = await launch();
  // /api/questions allows 10 per server; one real answer serves this whole file (test/ui/flow.test.js covers the real path).
  questions = await (await fetch(`${server.url}/api/questions`, { method: "POST", headers: { "x-access-code": CODE, "content-type": "application/json" }, body: JSON.stringify({ mail: MAIL, lang: "ko" }) })).json();
});
after(async () => { await browser?.close(); server?.stop(); });

async function open(viewport) {
  const o = await openApp(browser, server.url, viewport);
  await o.page.route("**/api/questions", (r) => r.fulfill({ json: questions }));
  return o;
}
const stageIs = (page, stage) => page.locator(`body[data-stage=${stage}]`).waitFor();
const toMail = async (page) => {
  await send(page, CODE);
  await stageIs(page, "mail");
};
const toPick = async (page) => {
  await toMail(page);
  await send(page, MAIL);
  await stageIs(page, "pick");
};
const submit = async (page, text) => {
  await page.fill("#input", text);
  await page.press("#input", "Control+Enter");
};
const composer = (page) => page.inputValue("#input");
const attempts = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("mensetsu-session")).attempts.length);
const atLogTop = async (page, card) => {
  const [c, log] = await Promise.all([card.boundingBox(), page.locator("#log").boundingBox()]);
  assert.ok(Math.abs(c.y - log.y) <= 1, `card top ${c.y} at log top ${log.y}`);
};

for (const [vp, viewport] of Object.entries(VIEWPORTS)) {
  test(`${vp}: the question list opens at its top, with the first question on screen`, async () => {
    const { context, page, errors } = await open(viewport);
    await toPick(page);
    const card = page.locator("#log > .msg.qs");
    await page.locator("#log > .msg.brief-confirm").waitFor();
    const check = async () => {
      await atLogTop(page, card);
      const [q, log] = await Promise.all([card.locator(".q").first().boundingBox(), page.locator("#log").boundingBox()]);
      assert.ok(q.y + q.height <= log.y + log.height, "the first question fits on screen");
    };
    await check();
    await page.waitForTimeout(FIRST_WAIT_ENDS);
    await check();
    assert.deepEqual(errors, []);
    await context.close();
  });
}

test("mobile: after an answer the verdict opens at its top", async () => {
  const { context, page, errors } = await open(VIEWPORTS.mobile);
  await toAnswer(page);
  await submit(page, ANSWER);
  await page.locator("#log > .quick").waitFor();
  await atLogTop(page, page.locator("#log > .msg.review"));
  await page.waitForTimeout(FIRST_WAIT_ENDS);
  await atLogTop(page, page.locator("#log > .msg.review"));
  assert.deepEqual(errors, []);
  await context.close();
});

test("desktop: after an answer the log stays at its end, since the verdict is in the panel", async () => {
  const { context, page, errors } = await open(VIEWPORTS.desktop);
  await toAnswer(page);
  await submit(page, ANSWER);
  await page.locator("#log > .quick").waitFor();
  await page.locator("#reviewBox .review").waitFor();
  assert.ok(await page.locator("#log").evaluate((e) => e.scrollTop + e.clientHeight >= e.scrollHeight - 1), "log is at its end");
  assert.deepEqual(errors, []);
  await context.close();
});

for (const [name, fail] of [["an error answer", BUSY], ["no connection", DOWN]]) {
  test(`mail, ${name}: the mail comes back and can be sent again`, async () => {
    const { context, page, errors } = await open(VIEWPORTS.mobile);
    await toMail(page);
    await page.route("**/api/questions", fail, { times: 1 });
    await submit(page, MAIL);
    await bubbles(page, "err").waitFor();
    assert.equal(await composer(page), MAIL.trim());
    assert.equal(await page.locator("body").getAttribute("data-stage"), "mail");
    await page.press("#input", "Control+Enter");
    await stageIs(page, "pick");
    assert.equal(await composer(page), "");
    assert.deepEqual(errors, []);
    await context.close();
  });
}

test("mail, 401: the composer asks for the code, so the mail must not land in it", async () => {
  const { context, page, errors } = await open(VIEWPORTS.mobile);
  await toMail(page);
  await page.route("**/api/questions", (r) => r.fulfill({ status: 401, json: { code: "access_denied" } }), { times: 1 });
  await submit(page, MAIL);
  await stageIs(page, "code");
  assert.equal(await composer(page), "");
  assert.deepEqual(errors, []);
  await context.close();
});

test("career line, failure: the line comes back, not the mail", async () => {
  const { context, page, errors } = await open(VIEWPORTS.mobile);
  await toPick(page);
  await page.getByRole("button", { name: ko.chat.profileButton }).click();
  await stageIs(page, "profile");
  await page.route("**/api/questions", BUSY, { times: 1 });
  await submit(page, "架空の経歴の一行");
  await bubbles(page, "err").waitFor();
  assert.equal(await composer(page), "架空の経歴の一行");
  assert.equal(await page.locator("body").getAttribute("data-stage"), "profile");
  assert.deepEqual(errors, []);
  await context.close();
});

test("a regeneration started by the brief fails: what is being typed stays", async () => {
  const { context, page, errors } = await open(VIEWPORTS.mobile);
  await toPick(page);
  const fact = { value: "新製品を発表（架空）", source_ids: ["s1"], confidence: "medium", source_count: 1, single_source: true };
  await page.route("**/api/research", (r) => r.fulfill({ json: { research_status: "ok", research_date: "2026-11-04", tool_errors: 0, company_snapshot: { recent_news: [fact] }, position_analysis: { position_match: "unknown" }, interview_intelligence: { selection_stages: [], reported_questions: [] }, sources: [{ id: "s1", title: "採用情報（架空）", url: "https://example.com/", accessed_date: "2026-11-04", published_date: "", entity_match: "exact", position_match: "exact", source_type: "official_careers" }] } }));
  await page.route("**/api/fit", (r) => r.fulfill({ json: { fit_evaluation: { matches: [], gaps: [], needs_user_confirmation: [] }, mismatch_flags: [], company_checkpoints: [] } }));
  await page.route("**/api/questions", BUSY);
  await page.fill("#input", "入力中の下書き");
  await page.locator("#log > .msg.brief-confirm").getByRole("button", { name: ko.research.start }).click();
  await bubbles(page, "err").waitFor();
  assert.equal(await composer(page), "入力中の下書き");
  assert.deepEqual(errors, []);
  await context.close();
});

test("mail, connection drops after the chat was reset: the erased session leaves no trace", async () => {
  const { context, page, errors } = await open(VIEWPORTS.mobile);
  await toMail(page);
  let release;
  const gate = new Promise((r) => (release = r));
  await page.route("**/api/questions", async (r) => { await gate; await r.abort(); }, { times: 1 });
  const failed = page.waitForEvent("requestfailed", (r) => r.url().endsWith("/api/questions"));
  await submit(page, MAIL);
  await page.selectOption("#lang", "en");
  await page.locator("#confirmYes").click();
  await stageIs(page, "mail");
  await page.fill("#input", "入力中の下書き");
  release();
  await failed;
  await page.waitForTimeout(100);
  assert.equal(await composer(page), "入力中の下書き");
  assert.equal(await bubbles(page, "err").count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

for (const [name, fail] of [["an error answer", BUSY], ["no connection", DOWN]]) {
  test(`answer, ${name} from both calls: same question, the answer comes back and can be sent again`, async () => {
    const { context, page, errors } = await open(VIEWPORTS.mobile);
    await toAnswer(page);
    await page.route("**/api/review", fail, { times: 1 });
    await page.route("**/api/script", fail, { times: 1 });
    await submit(page, ANSWER);
    // Intent changed (refutation 14, 11/06): the same error from both calls shows once, as in the script check (onVerify).
    await page.waitForFunction(() => document.querySelectorAll("#log > .msg.err").length === 1 && !document.querySelector("#log > .msg.typing"));
    assert.equal(await bubbles(page, "err").count(), 1);
    assert.equal(await composer(page), ANSWER);
    assert.equal(await page.locator("body").getAttribute("data-stage"), "answer");
    assert.equal(await page.locator("#log > .quick").count(), 0);
    assert.equal(await attempts(page), 0);
    await page.press("#input", "Control+Enter");
    await page.locator("#log > .msg.review").waitFor();
    await stageIs(page, "pick");
    assert.equal(await composer(page), "");
    assert.equal(await attempts(page), 1);
    assert.deepEqual(errors, []);
    await context.close();
  });
}

for (const [broken, kept] of [["script", (page) => page.locator("#log > .msg.review")], ["review", scriptCard]]) {
  test(`answer, only ${broken} fails: the other result counts and the flow moves on as before`, async () => {
    const { context, page, errors } = await open(VIEWPORTS.mobile);
    await toAnswer(page);
    await page.route(`**/api/${broken}`, BUSY, { times: 1 });
    await submit(page, ANSWER);
    await stageIs(page, "pick");
    await kept(page).waitFor();
    assert.equal(await bubbles(page, "err").count(), 1);
    assert.equal(await composer(page), "");
    assert.equal(await attempts(page), 1);
    assert.deepEqual(errors, []);
    await context.close();
  });
}
