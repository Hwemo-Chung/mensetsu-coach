// F15 in the browser: pick a question, paste a script, read ①–⑤. MOCK, 0 tokens; every sentence is invented.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LANGS } from "../../public/i18n/index.js";
import { scriptFixture } from "../fake-claude.js";
import { startServer, launch, openApp, bubbles, send, noHorizontalOverflow, shot, scriptCard, CODE, MAIL, ANSWER, VIEWPORTS } from "./harness.js";

const ko = LANGS.ko;
const FLAGGED = "前職では、遅れを［期限］以内に報告するルールを作り、手戻りを［ここに実績の数字］減らしました。"; // the MOCK /api/verify names this sentence of the MOCK script
const SCRIPT = "前職では新しいシステムの導入で売上を三倍にしました。御社の理念に感動したので志望しました。今後は［ここに担当したい領域］を担当したいです。";
const MATERIAL = "サンプル物流（架空） 在庫管理システムの開発を担当。";
const BUSY = (r) => r.fulfill({ status: 503, json: { code: "ai_busy" } });
let server, browser, questions;
before(async () => {
  server = await startServer();
  browser = await launch();
  questions = await (await fetch(`${server.url}/api/questions`, { method: "POST", headers: { "x-access-code": CODE, "content-type": "application/json" }, body: JSON.stringify({ mail: MAIL, lang: "ko" }) })).json();
});
after(async () => { await browser?.close(); server?.stop(); });

// question: replaces Q1's text (the target time follows the question).
async function open(viewport, lang = "ko", question) {
  const o = await openApp(browser, server.url, viewport, lang);
  const set = question ? { ...questions, questions: questions.questions.map((x, i) => (i ? x : { ...x, question })) } : questions;
  await o.page.route("**/api/questions", (r) => r.fulfill({ json: set }));
  await send(o.page, CODE);
  await o.page.locator("body[data-stage=mail]").waitFor();
  await send(o.page, MAIL);
  await o.page.locator("body[data-stage=pick]").waitFor();
  return o;
}
const stageIs = (page, stage) => page.locator(`body[data-stage=${stage}]`).waitFor();
const toVerify = async (page, t = ko) => {
  await send(page, "1");
  await stageIs(page, "answer");
  await page.getByRole("button", { name: t.chat.modeVerify, exact: true }).last().click();
  await stageIs(page, "verify");
};
const submit = async (page, text = SCRIPT) => {
  await page.fill("#input", text);
  await page.press("#input", "Control+Enter");
};
const chatResult = (page) => page.locator("#log > .msg.verify");

for (const [vp, viewport] of Object.entries(VIEWPORTS)) {
  test(`${vp}: picking a question offers both, and a pasted script gets ①–⑤ and the blank count`, async () => {
    const { context, page, errors } = await open(viewport);
    await send(page, "1");
    await stageIs(page, "answer");
    const answer = page.getByRole("button", { name: ko.chat.modeAnswer, exact: true }), check = page.getByRole("button", { name: ko.chat.modeVerify, exact: true });
    assert.equal(await answer.getAttribute("aria-pressed"), "true");
    assert.equal(await check.getAttribute("aria-pressed"), "false");
    assert.equal(await page.locator("#verifyMaterial").isVisible(), false);
    await check.click();
    await stageIs(page, "verify");
    assert.equal(await check.getAttribute("aria-pressed"), "true");
    assert.equal(await page.getAttribute("#input", "placeholder"), ko.chat.verifyPlaceholder);
    assert.equal((await page.locator("#send .lbl").textContent()).trim(), ko.verify.send);
    assert.equal(await page.locator("#mic").isVisible(), false);
    assert.equal(await page.locator(".composer .attach").isVisible(), false, "a file here would go unused");
    assert.equal(await page.locator("#verifyMaterial").isVisible(), true);
    assert.ok(await noHorizontalOverflow(page));
    await page.fill("#verifyMaterial", MATERIAL);
    await submit(page);
    await stageIs(page, "pick");
    await page.locator("#log > .quick").waitFor();

    // Desktop: the panel holds the result. Phone: the panel stays closed, and the chat opens at the top of the result.
    const place = vp === "desktop" ? page.locator("#reviewBox") : page.locator("#log");
    if (vp === "desktop") await place.waitFor();
    else assert.equal(await page.locator("#panel").isVisible(), false);
    for (const title of [ko.verify.answers, ko.verify.steps, ko.verify.corrections, ko.verify.time, ko.verify.grounds]) assert.ok(await place.getByText(title, { exact: true }).first().isVisible(), title);
    const text = await place.textContent();
    assert.ok(text.includes(ko.verify.blanks({ n: 1 })), "the blank count");
    assert.ok(text.includes("前職では新しいシステムの導入で売上を三倍にしました。"));
    assert.ok(text.includes("御社の理念に感動したので志望しました。"));
    assert.ok(!text.includes("台本にない文は画面に出ません。"), "the MOCK's invented sentence stops at the gate");
    assert.ok(text.includes(ko.verify.kinds.number) && text.includes(ko.verify.kinds.motive));
    assert.ok(text.includes(ko.verify.notFound));
    assert.ok(text.includes(ko.verify.dropped({ n: 2 })), "the fixture's two sentences outside this script"); // the MOCK script's sentence and the invented one
    assert.ok(!text.includes(ko.verify.noMaterial));
    if (vp === "mobile") {
      const [r, log] = await Promise.all([page.locator("#log > .msg.review").last().boundingBox(), page.locator("#log").boundingBox()]);
      assert.ok(Math.abs(r.y - log.y) <= 1, `result top ${r.y} at log top ${log.y}`);
    }
    await shot(page, `verify-${vp}`);
    assert.ok(await noHorizontalOverflow(page));
    assert.deepEqual(errors, []);
    await context.close();
  });
}

test("no material: nothing is checked and the screen says so; the code's counts still show", async () => {
  const { context, page, errors } = await open(VIEWPORTS.mobile);
  await toVerify(page);
  const answered = page.waitForResponse("**/api/verify");
  await submit(page);
  await stageIs(page, "pick");
  const data = await (await answered).json(), text = await chatResult(page).textContent();
  assert.equal(data.target_seconds, 60);
  assert.ok(text.includes(ko.verify.noMaterial));
  assert.ok(text.includes(ko.verify.blanks({ n: 1 })));
  // ④ is a range from the pack's band (3.3–5.0 chars/s), with the target beside it; this script is within it.
  assert.ok(text.includes(ko.verify.seconds({ chars: data.chars, lo: data.seconds[0], hi: data.seconds[1], fast: "5.0", slow: "3.3" })), text);
  assert.ok(text.includes(ko.verify.within({ target: 60 })));
  assert.ok(!text.includes("御社の理念に感動したので志望しました。"));
  assert.deepEqual(errors, []);
  await context.close();
});

// 400 chars: over the 60 s answer even at the fast end, within a 90 s self-introduction, and not judged for a condition question.
for (const [name, question, shown, hidden] of [
  ["the usual answer warns only when even a fast reading runs over", undefined, [ko.verify.longer({ n: 20, target: 60 })], [ko.verify.within({ target: 60 })]],
  ["a self-introduction gets 90 s", "自己紹介をお願いします。", [ko.verify.within({ target: 90 })], [ko.verify.longer({ n: 20, target: 60 }), ko.verify.noTarget]],
  ["a condition question gets no verdict at all", "入社可能時期を教えてください。", [ko.verify.noTarget], [ko.verify.within({ target: 60 }), ko.verify.longer({ n: 20, target: 60 })]],
]) {
  test(`④ follows the question: ${name}`, async () => {
    const { context, page, errors } = await open(VIEWPORTS.mobile, "ko", question);
    await toVerify(page);
    await submit(page, "あ".repeat(400));
    await stageIs(page, "pick");
    const text = await chatResult(page).textContent();
    assert.ok(text.includes(ko.verify.seconds({ chars: 400, lo: 80, hi: 120, fast: "5.0", slow: "3.3" })), text);
    for (const s of shown) assert.ok(text.includes(s), s);
    for (const s of hidden) assert.ok(!text.includes(s), s);
    assert.deepEqual(errors, []);
    await context.close();
  });
}

test("the request: review gets the script as its answer, verify gets the session's facts and the material, and the material goes nowhere else", async () => {
  const { context, page, errors } = await open(VIEWPORTS.desktop);
  await toVerify(page);
  const sent = {};
  page.on("request", (r) => { const p = new URL(r.url()).pathname; if (["/api/review", "/api/verify"].includes(p)) sent[p] = r.postDataJSON(); });
  await page.fill("#verifyMaterial", MATERIAL);
  await submit(page);
  await stageIs(page, "pick");
  assert.equal(sent["/api/review"].answer, SCRIPT);
  assert.equal(sent["/api/review"].question, questions.questions[0].question);
  assert.ok(!JSON.stringify(sent["/api/review"]).includes("サンプル物流"));
  assert.equal(sent["/api/verify"].script, SCRIPT);
  assert.equal(sent["/api/verify"].material, MATERIAL);
  assert.equal(sent["/api/verify"].category, questions.questions[0].category, "the target time follows the question's closing");
  assert.deepEqual(sent["/api/verify"].facts, questions.company_context.facts);
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
  assert.ok(!stored.includes("サンプル物流"), "the material is in neither storage");
  assert.ok(!stored.includes("三倍"), "the pasted script is not a practice attempt");
  assert.deepEqual(errors, []);
  await context.close();
});

test("the material stays in the box for the next question, and leaves with the session", async () => {
  const { context, page, errors } = await open(VIEWPORTS.desktop);
  await toVerify(page);
  await page.fill("#verifyMaterial", MATERIAL);
  await submit(page);
  await stageIs(page, "pick");
  await send(page, "2");
  await stageIs(page, "answer");
  await page.getByRole("button", { name: ko.chat.modeVerify, exact: true }).last().click();
  assert.equal(await page.inputValue("#verifyMaterial"), MATERIAL);
  const download = page.waitForEvent("download");
  await page.click("#end");
  await download;
  assert.equal(await page.inputValue("#verifyMaterial"), "");
  assert.deepEqual(errors, []);
  await context.close();
});

test("a pasted script changes neither the rail, the habit count nor the saved Markdown", async () => {
  const { context, page, errors } = await open(VIEWPORTS.desktop);
  await toVerify(page);
  await submit(page);
  await stageIs(page, "pick");
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("mensetsu-session")).attempts.length), 0);
  assert.equal(await page.locator(`.msg.coach.note:has-text("${ko.habits.title({ n: 1 }).slice(0, 4)}")`).count(), 0);
  // The session survives a reload as before.
  await page.reload();
  await page.locator(".msg.coach").first().waitFor();
  await send(page, CODE);
  await stageIs(page, "pick");
  assert.equal(await page.locator("#log .msg.qs .q").count(), questions.questions.length);
  assert.deepEqual(errors, []);
  await context.close();
});

// Defect 1 (real run 11/06): the model script can state an action or a judgment the answer never had. After the card is drawn, one
// /api/verify call with the answer as the material names such sentences on the card; the pasted-script mode stays the only other caller.
const checks = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("mensetsu-session")).attempts.map((a) => a.script?.check));
for (const [vp, viewport] of Object.entries(VIEWPORTS)) {
  test(`${vp}: the answer path: typing right after the pick sends an answer, and the script card is checked against that answer`, async () => {
    const { context, page, errors } = await open(viewport);
    await send(page, "1");
    await stageIs(page, "answer");
    const verifies = [];
    page.on("request", (r) => { if (r.url().endsWith("/api/verify")) verifies.push(r.postDataJSON()); });
    await submit(page, ANSWER);
    await stageIs(page, "pick");
    assert.equal(verifies.length, 1, "one call per script");
    assert.equal(verifies[0].material, ANSWER, "the answer is the material");
    assert.equal(verifies[0].script, scriptFixture.text);
    assert.equal(verifies[0].category, questions.questions[0].category);
    const card = scriptCard(page);
    assert.equal(await card.count(), 1, "the model script still comes");
    const line = card.locator(".script-check");
    assert.ok((await line.textContent()).startsWith(ko.script.unsupported));
    assert.ok((await line.textContent()).includes(`「${FLAGGED}」（${ko.verify.kinds.achievement}）`));
    assert.ok(!(await line.textContent()).includes("台本にない文は画面に出ません。"), "the gate drops a sentence that is not in the script");
    // Refutation 7 (11/06): the flags the gate dropped are kept and shown too (the MOCK check names 3 sentences not in the script).
    assert.ok((await line.textContent()).includes(ko.verify.dropped({ n: 3 })));
    assert.deepEqual(await checks(page), [{ unsupported: [{ sentence: FLAGGED, kind: "achievement" }], dropped: 3 }], "kept with the attempt");
    if (vp === "desktop") assert.ok((await page.locator("#reviewBox .script-check").textContent()).includes(FLAGGED), "the panel copy shows it too");
    await shot(page, `script-check-${vp}`, card);
    assert.deepEqual(errors, []);
    await context.close();
  });
}

test("the check fails: the script stays, the card says it was not checked, and a reload keeps saying so", async () => {
  const { context, page, errors } = await open(VIEWPORTS.desktop);
  await send(page, "1");
  await stageIs(page, "answer");
  await page.route("**/api/verify", BUSY, { times: 1 });
  await submit(page, ANSWER);
  await stageIs(page, "pick");
  const card = scriptCard(page);
  assert.ok((await card.textContent()).includes(scriptFixture.text));
  assert.equal((await card.locator(".script-check").textContent()).trim(), ko.script.unchecked);
  assert.equal(await bubbles(page, "err").count(), 0, "the script is not an error");
  assert.deepEqual(await checks(page), [null]);
  await page.reload();
  await page.locator(".msg.coach").first().waitFor();
  await send(page, CODE);
  await stageIs(page, "pick");
  assert.equal((await page.locator("#reviewBox .script-check").textContent()).trim(), ko.script.unchecked);
  assert.deepEqual(errors, []);
  await context.close();
});

test("the check finds nothing: the card says the answer backs every sentence", async () => {
  const { context, page, errors } = await open(VIEWPORTS.mobile);
  await send(page, "1");
  await stageIs(page, "answer");
  await page.route("**/api/verify", (r) => r.fulfill({ json: { chars: 100, seconds: [20, 30], rate: [5, 3.3], target_seconds: 60, over: false, blanks: 2, checked: true, unsupported: [], dropped: 0 } }), { times: 1 });
  await submit(page, ANSWER);
  await stageIs(page, "pick");
  assert.equal((await scriptCard(page).locator(".script-check").textContent()).trim(), ko.script.checked);
  assert.deepEqual(await checks(page), [{ unsupported: [] }]);
  assert.deepEqual(errors, []);
  await context.close();
});

// Refutation 7 (11/06): flags the server dropped (no matching sentence) went unchecked, so the card must not say nothing is unsupported.
test("the check dropped flags it could not match: the card says so instead of 'nothing unsupported'", async () => {
  const { context, page, errors } = await open(VIEWPORTS.mobile);
  await send(page, "1");
  await stageIs(page, "answer");
  await page.route("**/api/verify", (r) => r.fulfill({ json: { chars: 100, seconds: [20, 30], rate: [5, 3.3], target_seconds: 60, over: false, blanks: 0, checked: true, unsupported: [], dropped: 2 } }), { times: 1 });
  await submit(page, ANSWER);
  await stageIs(page, "pick");
  assert.equal((await scriptCard(page).locator(".script-check").textContent()).trim(), ko.verify.dropped({ n: 2 }));
  assert.deepEqual(await checks(page), [{ unsupported: [], dropped: 2 }]);
  assert.deepEqual(errors, []);
  await context.close();
});

// Refutation 6 (11/06): the check runs after the script for up to ~100 s. The answer is saved before it, so [Save & finish] meanwhile
// keeps the answer in the file, and the check's late return neither errors nor puts the answer back in the box.
test("an answer is saved before its script check ends: finishing during the check keeps it, with no error after", async () => {
  const { context, page, errors } = await open(VIEWPORTS.desktop);
  await send(page, "1");
  await stageIs(page, "answer");
  let release;
  const held = new Promise((ok) => { release = ok; });
  await page.route("**/api/verify", async (r) => { await held; await r.continue(); }, { times: 1 });
  await submit(page, ANSWER);
  await scriptCard(page).locator(".script-check", { hasText: ko.script.checking }).waitFor();
  assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem("mensetsu-session"))).attempts.length, 1, "saved while the check runs");
  const [download] = await Promise.all([page.waitForEvent("download"), page.click("#end")]);
  assert.ok(readFileSync(await download.path(), "utf8").includes(ANSWER), "the answer is in the file");
  await page.click("#mailLater");
  release();
  await scriptCard(page).locator(".script-check", { hasText: FLAGGED }).waitFor();
  await stageIs(page, "mail");
  assert.equal(await bubbles(page, "err").count(), 0, "no network error when the check returns");
  assert.equal(await page.inputValue("#input"), "", "the answer is not put back in the box");
  assert.deepEqual(errors, []);
  await context.close();
});

// A 200 that ran no check (checked: false, no failure code) is not a clean result: the card must not say the answer backs every sentence.
test("the check did not run: the card says it was not checked, not that nothing was found", async () => {
  const { context, page, errors } = await open(VIEWPORTS.mobile);
  await send(page, "1");
  await stageIs(page, "answer");
  await page.route("**/api/verify", (r) => r.fulfill({ json: { chars: 100, seconds: [20, 30], rate: [5, 3.3], target_seconds: 60, over: false, blanks: 0, checked: false, unsupported: [], dropped: 0 } }), { times: 1 });
  await submit(page, ANSWER);
  await stageIs(page, "pick");
  assert.equal((await scriptCard(page).locator(".script-check").textContent()).trim(), ko.script.unchecked);
  assert.deepEqual(await checks(page), [null]);
  assert.deepEqual(errors, []);
  await context.close();
});

test("the no-code demo has no check mode and makes no verify call; its last step points to the code", async () => {
  const { context, page, errors } = await openApp(browser, server.url, VIEWPORTS.desktop, "ko");
  await page.evaluate(() => localStorage.setItem("mensetsu-tour-tips", "0")); // the plain replay: five steps, no coach marks
  await page.reload();
  await page.locator(".msg.coach").first().waitFor();
  let verifies = 0;
  page.on("request", (r) => { if (r.url().endsWith("/api/verify")) verifies++; });
  await page.getByRole("button", { name: ko.demo.button }).click();
  for (let i = 0; i < 5; i++) {
    const next = page.locator("#log > .next-btn");
    await next.waitFor();
    await next.click();
  }
  await page.getByRole("button", { name: ko.demo.try }).waitFor();
  assert.equal(verifies, 0);
  assert.equal(await page.locator(".pick-mode").count(), 0, "the demo never offers the pasted-script mode");
  assert.equal(await page.locator(".script-check:not([hidden])").count(), 0, "a recorded script is not checked");
  assert.deepEqual(errors, []);
  await context.close();
});

test("switching back to answer before sending goes down the answer path", async () => {
  const { context, page, errors } = await open(VIEWPORTS.mobile);
  await toVerify(page);
  await page.getByRole("button", { name: ko.chat.modeAnswer, exact: true }).click();
  await stageIs(page, "answer");
  assert.equal(await page.locator("#mic").isVisible(), true);
  assert.equal(await page.locator("#verifyMaterial").isVisible(), false);
  assert.notEqual((await page.locator("#send .lbl").textContent()).trim(), ko.verify.send);
  assert.deepEqual(errors, []);
  await context.close();
});

test("after the result the mode buttons are spent: a late click cannot bring the verify stage back", async () => {
  const { context, page, errors } = await open(VIEWPORTS.desktop);
  await toVerify(page);
  await submit(page);
  await stageIs(page, "pick");
  assert.equal(await page.getByRole("button", { name: ko.chat.modeVerify, exact: true }).isDisabled(), true);
  assert.deepEqual(errors, []);
  await context.close();
});

// The same text goes to both APIs, so one input error would come back twice: it is shown once.
for (const [name, fail] of [["an error answer", BUSY], ["no connection", (r) => r.abort()]]) {
  test(`both calls, ${name}: one error row, same question, the script comes back and can be sent again`, async () => {
    const { context, page, errors } = await open(VIEWPORTS.mobile);
    await toVerify(page);
    await page.route("**/api/review", fail, { times: 1 });
    await page.route("**/api/verify", fail, { times: 1 });
    await submit(page);
    await page.waitForFunction((s) => document.getElementById("input").value === s, SCRIPT);
    assert.equal(await bubbles(page, "err").count(), 1);
    assert.equal(await page.locator("body").getAttribute("data-stage"), "verify");
    assert.equal(await page.locator("#log > .quick").count(), 0);
    await page.press("#input", "Control+Enter");
    await stageIs(page, "pick");
    assert.equal(await page.inputValue("#input"), "");
    await chatResult(page).waitFor();
    assert.deepEqual(errors, []);
    await context.close();
  });
}

for (const [broken, kept] of [["review", "#log > .msg.verify"], ["verify", "#log > .msg.review"]]) {
  test(`only ${broken} fails: the other result shows, and the script still comes back to retry`, async () => {
    const { context, page, errors } = await open(VIEWPORTS.mobile);
    await toVerify(page);
    await page.route(`**/api/${broken}`, BUSY, { times: 1 });
    await submit(page);
    await bubbles(page, "err").waitFor();
    await page.locator(kept).waitFor();
    await page.waitForFunction((s) => document.getElementById("input").value === s, SCRIPT);
    assert.equal(await page.locator("body").getAttribute("data-stage"), "verify");
    assert.equal(await page.locator("#log > .quick").count(), 0);
    assert.deepEqual(errors, []);
    await context.close();
  });
}

test("a 401: the composer asks for the code, so the script must not land in it", async () => {
  const { context, page, errors } = await open(VIEWPORTS.mobile);
  await toVerify(page);
  const denied = (r) => r.fulfill({ status: 401, json: { code: "access_denied" } });
  await page.route("**/api/review", denied, { times: 1 });
  await page.route("**/api/verify", denied, { times: 1 });
  await submit(page);
  await stageIs(page, "code");
  assert.equal(await page.inputValue("#input"), "");
  assert.deepEqual(errors, []);
  await context.close();
});

test("Enter is a newline in both boxes; Ctrl+Enter sends from either", async () => {
  const { context, page, errors } = await open(VIEWPORTS.desktop);
  await toVerify(page);
  await page.fill("#input", "一行目");
  await page.press("#input", "Enter");
  assert.equal(await page.locator("body").getAttribute("data-stage"), "verify");
  await page.fill("#input", SCRIPT);
  await page.fill("#verifyMaterial", "資料の一行目");
  await page.press("#verifyMaterial", "Enter");
  assert.equal(await page.locator("body").getAttribute("data-stage"), "verify");
  await page.press("#verifyMaterial", "Control+Enter");
  await stageIs(page, "pick");
  assert.deepEqual(errors, []);
  await context.close();
});

const checked = { chars: 250, seconds: [50, 75], rate: [5, 200 / 60], target_seconds: 60, over: false, checked: true, unsupported: [] };
const time = ko.verify.seconds({ chars: 250, lo: 50, hi: 75, fast: "5.0", slow: "3.3" });
for (const [name, answer, shown, hidden, retry] of [
  ["nothing flagged, nothing left out", { ...checked, blanks: 0, dropped: 0 }, [ko.verify.allFound, time, ko.verify.within({ target: 60 })], [ko.verify.dropped({ n: 2 })]],
  ["nothing flagged, but copies that match no sentence", { ...checked, blanks: 0, dropped: 2 }, [ko.verify.dropped({ n: 2 })], [ko.verify.allFound]],
  ["nothing flagged, but blanks left", { ...checked, blanks: 2, dropped: 0 }, [ko.verify.blanksUnchecked({ n: 2 })], [ko.verify.allFound]],
  ["a script not in the interview language", { ...checked, chars: 0, seconds: null, blanks: 0, dropped: 0 }, [ko.verify.noTime], [ko.verify.within({ target: 60 })]],
  // The model failed: ④ and the blank count (the code's) stay on screen, ⑤ says why, and the script comes back for another try.
  ["the model failed", { ...checked, blanks: 1, checked: false, failed: "ai_busy", dropped: 0 }, [time, ko.verify.blanks({ n: 1 }), ko.errors.ai_busy()], [ko.verify.allFound, ko.verify.noMaterial], true],
]) {
  test(`⑤④: ${name}`, async () => {
    const { context, page, errors } = await open(VIEWPORTS.mobile);
    await toVerify(page);
    await page.route("**/api/verify", (r) => r.fulfill({ json: answer }));
    await page.fill("#verifyMaterial", MATERIAL);
    await submit(page);
    if (retry) await page.waitForFunction((s) => document.getElementById("input").value === s, SCRIPT);
    else await stageIs(page, "pick");
    const text = await chatResult(page).textContent();
    for (const s of shown) assert.ok(text.includes(s), s);
    for (const s of hidden) assert.ok(!text.includes(s), s);
    if (retry) assert.equal(await page.locator("body").getAttribute("data-stage"), "verify");
    assert.deepEqual(errors, []);
    await context.close();
  });
}

test("the material box: at its limit the line says what was cut, below it nothing; on a phone both boxes leave room for the chat", async () => {
  const { context, page, errors } = await open(VIEWPORTS.mobile);
  await toVerify(page);
  const cut = page.locator("#materialCut");
  assert.equal(await cut.isVisible(), false);
  await page.fill("#verifyMaterial", "あ".repeat(20000));
  assert.equal(await cut.isVisible(), true);
  assert.equal((await cut.textContent()).trim(), ko.verify.materialCut);
  await page.fill("#input", "あ".repeat(2000));
  const [composer, input] = await Promise.all([page.locator("#composer").boundingBox(), page.locator("#input").boundingBox()]);
  assert.ok(composer.height <= VIEWPORTS.mobile.height * 0.6, `composer ${composer.height}px`);
  assert.ok(input.y + input.height <= VIEWPORTS.mobile.height, "the script box stays on screen");
  assert.ok(await noHorizontalOverflow(page));
  await page.fill("#verifyMaterial", "あ".repeat(19999));
  assert.equal(await cut.isVisible(), false);
  assert.deepEqual(errors, []);
  await context.close();
});

test("hostile text in a flagged sentence stays text", async () => {
  const { context, page, errors } = await open(VIEWPORTS.desktop);
  await toVerify(page);
  const hostile = '<img src=x onerror="window.__pwned=1">売上を三倍にしました。';
  await page.route("**/api/verify", (r) => r.fulfill({ json: { ...checked, chars: 25, seconds: [5, 8], blanks: 0, unsupported: [{ sentence: hostile, kind: "number" }], dropped: 0 } }));
  await page.fill("#verifyMaterial", MATERIAL);
  await submit(page);
  await stageIs(page, "pick");
  assert.ok((await chatResult(page).textContent()).includes(hostile));
  assert.equal(await page.evaluate(() => window.__pwned), undefined);
  assert.deepEqual(errors, []);
  await context.close();
});

for (const lang of ["en", "ja"]) {
  test(`${lang}: the same flow in the screen language`, async () => {
    const t = LANGS[lang];
    const { context, page, errors } = await open(VIEWPORTS.desktop, lang);
    // The MOCK review is written in Korean, and the language gate would refuse it on this screen.
    await page.route("**/api/review", async (r) => r.fulfill({ json: await (await fetch(`${server.url}/api/review`, { method: "POST", headers: { "x-access-code": CODE, "content-type": "application/json" }, body: JSON.stringify({ question: "質問（架空）", answer: SCRIPT, lang: "ko" }) })).json() }));
    await toVerify(page, t);
    await page.fill("#verifyMaterial", MATERIAL);
    await submit(page);
    await stageIs(page, "pick");
    const box = await page.locator("#reviewBox").textContent();
    for (const s of [t.verify.time, t.verify.grounds, t.verify.notFound]) assert.ok(box.includes(s), s);
    assert.deepEqual(errors, []);
    await context.close();
  });
}
