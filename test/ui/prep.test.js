// Interview prep document in the browser: button, dialog, card, regeneration, download. MOCK, 0 tokens; the real path runs once,
// the rest answer from that one document because /api/prep allows 6 per 10 minutes. Every name and figure here is invented.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { LANGS } from "../../public/i18n/index.js";
import { startServer, launch, openApp, bubbles, send, noHorizontalOverflow, CODE, MAIL, ANSWER } from "./harness.js";

const ko = LANGS.ko;
const PHONE = { width: 390, height: 844 }, DASHBOARD = { width: 1280, height: 800 };
const RESUME = "サンプル物流（架空） 在庫管理システムの開発を担当。";
const HOSTILE = '<img src=x onerror="window.__pwned=1">';
const claim = (value) => ({ value, source_ids: ["s1"], confidence: "medium", source_count: 1, single_source: true });
const BRIEF = { research_status: "ok", research_date: "2026-11-04", tool_errors: 0, company_snapshot: { business: claim("業務システムの提供（架空）") }, position_analysis: { position_match: "exact" }, interview_intelligence: { selection_stages: [], reported_questions: [] }, fit_evaluation: { matches: [{ point: "要件定義の経験（架空）", basis: "user_material", quote: "要件定義（架空）", source_ids: [] }], gaps: [], needs_user_confirmation: [] }, mismatch_flags: [], company_checkpoints: [], sources: [{ id: "s1", title: "会社概要（架空）", url: "https://example.com/about", source_type: "official_other" }] };

let server, browser, questions, DOC, realBody;
const clone = (o) => JSON.parse(JSON.stringify(o));
before(async () => {
  server = await startServer({ PREP_ENABLED: "1", RESEARCH_ENABLED: "1" });
  browser = await launch();
  const call = (path, body) => fetch(`${server.url}${path}`, { method: "POST", headers: { "x-access-code": CODE, "content-type": "application/json" }, body: JSON.stringify(body) });
  questions = await (await call("/api/questions", { mail: MAIL, lang: "ko" })).json();
  realBody = { material: RESUME, questions: questions.questions.map(({ id, question, category }) => ({ id, question, category })), context: { company: questions.company_context.company, position: questions.company_context.position }, lang: "ko", pack: "jp" };
  DOC = await (await call("/api/prep", realBody)).json();
  assert.ok(DOC.sections, "the MOCK answers a document");
});
after(async () => { await browser?.close(); server?.stop(); });

const card = (page) => page.locator("#log > .msg.prep");
const openButton = (page) => page.getByRole("button", { name: ko.prep.button }).first();
const dialog = (page) => page.locator("#prep");
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("mensetsu-session")));
const section = (doc, key) => doc.sections.find((s) => s.key === key);
const fold = (page, key, t = ko) => card(page).locator("details").filter({ has: page.locator("summary", { hasText: t.prep.sections[key] }) });
async function toQuestions(page, t = ko) {
  await page.route("**/api/questions", (r) => r.fulfill({ json: questions }));
  await send(page, CODE);
  await bubbles(page, "coach").filter({ hasText: t.chat.askMail.split("\n")[0] }).waitFor();
  await send(page, MAIL);
  await bubbles(page, "coach").filter({ hasText: t.chat.askPick({ count: 10 }) }).waitFor();
}
const answerWith = async (page, ...docs) => {
  const bodies = [];
  await page.route("**/api/prep", (r) => { bodies.push(r.request().postDataJSON()); const d = docs[Math.min(bodies.length - 1, docs.length - 1)]; return d.status ? r.fulfill({ status: d.status, json: d.json }) : r.fulfill({ json: d }); });
  return bodies;
};
async function makeDoc(page, t = ko) {
  await page.getByRole("button", { name: t.prep.button }).first().click();
  await page.locator("#prepMaterial").fill(RESUME);
  await page.locator("#prepSubmit").click();
  await card(page).waitFor();
}
const download = async (page, action) => {
  const [d] = await Promise.all([page.waitForEvent("download"), action()]);
  return { name: d.suggestedFilename(), text: await readFile(await d.path(), "utf8") };
};
const docDownload = (page) => download(page, () => card(page).getByRole("button", { name: ko.prep.download }).click());
const failedDoc = () => {
  const d = clone(DOC);
  const exp = section(d, "experience_qa");
  const gone = exp.items.pop();
  d.failed = [{ key: gone.key, section: "experience_qa", bundle: "experience", reason: ["number"] }];
  d.unresolved = d.unresolved.filter((u) => u.key !== gone.key);
  d.blanks = 0; // the screen counts the document itself
  return { doc: d, gone };
};
const experienceOnly = () => {
  const d = clone(DOC);
  d.generated = ["experience"];
  for (const s of d.sections) if (s.bundle && s.bundle !== "experience") s.items = [];
  d.unresolved = d.unresolved.filter((u) => u.section === "experience_qa");
  return d;
};

for (const [name, viewport] of [["390", PHONE], ["1280", DASHBOARD]]) {
  test(`${name}px: button in the card's row → dialog → the real route → the card; download keeps the session`, async () => {
    const { context, page, errors } = await openApp(browser, server.url, viewport);
    await toQuestions(page);
    const row = bubbles(page, "coach.note").filter({ has: page.getByRole("button", { name: ko.reverse.button }) });
    assert.equal(await row.getByRole("button", { name: ko.prep.button }).count(), 1, "next to the reverse-question button");
    await openButton(page).click();
    const d = dialog(page);
    await d.waitFor();
    for (const key of ["material", "file", "date", "format", "counterpart", "change_reason", "axis", "other_offers", "start_date"]) assert.ok(await d.getByLabel(ko.prep[key]).first().isVisible(), key);
    assert.ok(await page.evaluate(() => { const b = document.querySelector("#prep"); return b.scrollWidth <= b.clientWidth; }), "the dialog does not overflow");
    assert.ok((await page.locator("#prepMaterial").boundingBox()).height >= 120, "room to paste a resume: field-sizing ignores rows");
    await d.getByLabel(ko.prep.date).fill("11/10 14:00");
    await d.getByLabel(ko.prep.change_reason).fill("役割を広げたいからです（架空）");
    await page.locator("#prepMaterial").fill(RESUME);
    const sent = page.waitForRequest("**/api/prep");
    await page.locator("#prepSubmit").click();
    const body = (await sent).postDataJSON();
    assert.equal(body.material, RESUME);
    assert.equal(body.pack, "jp");
    assert.equal(body.lang, "ko");
    assert.equal(body.header.date, "11/10 14:00");
    assert.equal(body.inputs.change_reason, "役割を広げたいからです（架空）");
    assert.equal(body.questions.length, 10);
    assert.deepEqual(Object.keys(body.questions[0]).sort(), ["category", "id", "question"]);
    assert.equal(body.bundles, undefined);
    await card(page).waitFor({ timeout: 30000 });
    const text = await card(page).innerText();
    const doc = (await stored(page)).prep;
    assert.ok(text.includes(ko.prep.counts({ blanks: doc.blanks, to_confirm: doc.to_confirm })));
    assert.equal(await card(page).locator("details").count(), 15, "one fold per section");
    assert.ok(await fold(page, "self_intro").evaluate((x) => x.open), "the first answer starts open");
    assert.ok(!(await fold(page, "cautions").evaluate((x) => x.open)));
    const first = section(doc, "self_intro").items[0];
    const open = await fold(page, "self_intro").innerText();
    for (const s of [first.answer, first.reading, first.translation, first.asked]) assert.ok(open.includes(s), s);
    assert.ok(await noHorizontalOverflow(page));
    assert.ok(await page.evaluate(() => { const l = document.getElementById("log"); return l.scrollWidth <= l.clientWidth; }), "no sideways scroll in the log");
    for (const box of await card(page).locator("details > summary").all()) assert.ok((await box.boundingBox()).height >= 44, "44px target");
    for (const det of await card(page).locator("details").all()) await det.evaluate((x) => { x.open = true; });
    assert.ok(await noHorizontalOverflow(page), "still none with every fold open");
    assert.ok(await card(page).evaluate((c) => c.scrollWidth <= c.clientWidth));
    assert.ok(!JSON.stringify(await stored(page)).includes(RESUME), "the resume itself is not stored");
    const before = await page.evaluate(() => localStorage.getItem("mensetsu-session"));
    const file = await docDownload(page);
    assert.match(file.name, /^mensetsu-prep-\d{4}-\d{2}-\d{2}\.md$/);
    assert.ok(file.text.includes("### Q. ") && file.text.includes("## 要本人確認"));
    assert.equal(await page.evaluate(() => localStorage.getItem("mensetsu-session")), before, "the session is not cleared");
    assert.ok(await page.locator("#log .q button").first().isEnabled(), "and practice goes on");
    assert.deepEqual(errors, []);
    await context.close();
  });
}

test("waiting: progress shows, the composer stays usable, the buttons cannot fire twice, and the wait goes away", async () => {
  const { context, page, errors } = await openApp(browser, server.url, PHONE);
  let release;
  const gate = new Promise((r) => { release = r; });
  const bodies = [];
  await page.route("**/api/prep", async (r) => { bodies.push(1); await gate; return r.fulfill({ json: DOC }); });
  await toQuestions(page);
  await openButton(page).click();
  await page.locator("#prepMaterial").fill(RESUME);
  await page.locator("#prepSubmit").click();
  const wait = bubbles(page, "coach.typing").filter({ hasText: ko.prep.wait });
  await wait.locator(".wait-label").waitFor({ state: "visible", timeout: 6000 });
  assert.ok(await openButton(page).isDisabled(), "no second paid run while one is going");
  await send(page, "1");
  await page.locator("#mic").waitFor();
  release();
  await card(page).waitFor();
  assert.equal(await wait.count(), 0);
  assert.ok(await openButton(page).isEnabled());
  assert.equal(bodies.length, 1);
  assert.deepEqual(errors, []);
  await context.close();
});

test("nothing to send: the dialog says so and calls nothing; a PDF is refused in the dialog; a file goes as an attachment", async () => {
  const { context, page, errors } = await openApp(browser, server.url, PHONE);
  const bodies = await answerWith(page, DOC);
  await toQuestions(page);
  await openButton(page).click();
  await page.locator("#prepSubmit").click();
  await page.locator("#prepMsg").filter({ hasText: ko.errors.material_required() }).waitFor();
  assert.equal(bodies.length, 0);
  assert.ok(await dialog(page).isVisible());
  await page.locator("#prepFile").setInputFiles({ name: "resume.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") });
  await page.locator("#prepMsg").filter({ hasText: ko.errors.material_required() }).waitFor();
  await page.locator("#prepSubmit").click();
  assert.equal(bodies.length, 0, "the refused file does not count as material");
  await page.locator("#prepFile").setInputFiles({ name: "resume.md", mimeType: "text/markdown", buffer: Buffer.from(RESUME) });
  await page.waitForFunction(() => document.querySelector("#prepMsg").textContent === "");
  await page.locator("#prepSubmit").click();
  await card(page).waitFor();
  assert.equal(bodies[0].attachment.name, "resume.md");
  assert.equal(Buffer.from(bodies[0].attachment.data, "base64").toString(), RESUME);
  assert.equal(bodies[0].material, "");
  assert.deepEqual(errors, []);
  await context.close();
});

test("the desired profile never leaves: only sourced facts go; the conditions are in this document, not the session file; deleting it updates the count", async () => {
  const { context, page, errors } = await openApp(browser, server.url, PHONE);
  await page.evaluate(() => localStorage.setItem("mensetsu-desired-profile", JSON.stringify({ min_salary_man: "612", hard_conditions: "夜勤なし（架空）", role_content: "業務の希望（架空）" })));
  await page.route("**/api/research", (r) => r.fulfill({ json: BRIEF }));
  await page.route("**/api/fit", (r) => r.fulfill({ json: { fit_evaluation: BRIEF.fit_evaluation, mismatch_flags: [], company_checkpoints: [] } }));
  const bodies = await answerWith(page, DOC);
  await toQuestions(page);
  await page.locator("#log > .msg.brief-confirm").getByRole("button", { name: ko.research.start }).click();
  await page.locator("#log > .msg.brief:not(.brief-confirm)").last().getByRole("heading", { name: ko.research.snapshot }).waitFor();
  await page.locator("#log > .msg.qs").first().waitFor();
  await makeDoc(page);
  const body = JSON.stringify(bodies[0]);
  for (const s of ["612", "夜勤なし", "業務の希望", "desired", "要件定義の経験", "fit_evaluation"]) assert.ok(!body.includes(s), s);
  assert.equal(bodies[0].research_facts[0].text, "業務システムの提供（架空）");
  assert.equal(bodies[0].sources[0].id, "s1");
  const view = await fold(page, "conditions").evaluate((x) => { x.open = true; return x.innerText; });
  assert.ok(view.includes("612") && view.includes("夜勤なし（架空）"), "assembled here");
  assert.ok(!JSON.stringify((await stored(page)).prep).includes("612"), "and not written into the stored document");
  const wins = await fold(page, "win_points").evaluate((x) => { x.open = true; return x.innerText; });
  assert.ok(wins.includes("要件定義の経験（架空）"), "the fit's matches go in the win section");
  const file = await docDownload(page);
  assert.ok(file.text.includes("612") && file.text.includes("## 年収・条件"));

  await page.locator("#opts").click();
  await page.locator("#desiredDelete").click();
  await page.evaluate(() => document.getElementById("options").close());
  const after = await fold(page, "conditions").evaluate((x) => { x.open = true; return x.innerText; });
  assert.ok(!after.includes("612"), "deleting the profile takes it off the card");
  assert.ok(!(await docDownload(page)).text.includes("612"), "and out of the next file");

  await page.evaluate(() => localStorage.setItem("mensetsu-desired-profile", JSON.stringify({ min_salary_man: "612" })));
  const f6 = await download(page, () => page.click("#end"));
  assert.ok(f6.text.includes("### Q. "), "saving does not lose the document");
  assert.ok(!f6.text.includes("612") && !f6.text.includes("## 年収・条件"), "the conditions stay out of the session file");
  assert.deepEqual(errors, []);
  await context.close();
});

test("a failed item: counted, [regenerate] sends only its bundle with the same resume; the rest stays and the top count follows", async () => {
  const { context, page, errors } = await openApp(browser, server.url, PHONE);
  const { doc } = failedDoc();
  const bodies = await answerWith(page, doc, experienceOnly());
  await toQuestions(page);
  await makeDoc(page);
  const row = card(page).locator(".prep-failed");
  assert.equal(await row.count(), 1);
  assert.ok((await row.innerText()).includes(ko.prep.failed({ n: 1 })));
  await row.getByRole("button", { name: ko.prep.retry }).click();
  await row.waitFor({ state: "detached" });
  assert.deepEqual(bodies[1].bundles, ["experience"]);
  assert.equal(bodies[1].material, RESUME, "no asking for the resume again");
  const s = (await stored(page)).prep;
  assert.deepEqual(s.failed, []);
  assert.equal(section(s, "experience_qa").items.length, section(DOC, "experience_qa").items.length);
  assert.equal(section(s, "self_intro").items.length, section(DOC, "self_intro").items.length, "the other bundles stay");
  assert.ok((await card(page).innerText()).includes(ko.prep.counts({ blanks: DOC.blanks, to_confirm: DOC.to_confirm })));
  assert.deepEqual(errors, []);
  await context.close();
});

test("a failed regeneration keeps the document and says why; a 401 goes back to the code", async () => {
  const { context, page, errors } = await openApp(browser, server.url, PHONE);
  const { doc } = failedDoc();
  await answerWith(page, doc, { status: 503, json: { code: "ai_busy" } }, { status: 401, json: { code: "access_denied" } });
  await toQuestions(page);
  await makeDoc(page);
  const retry = card(page).locator(".prep-failed").getByRole("button", { name: ko.prep.retry });
  await retry.click();
  await bubbles(page, "err").filter({ hasText: ko.errors.ai_busy() }).waitFor();
  assert.equal(section((await stored(page)).prep, "experience_qa").items.length, section(doc, "experience_qa").items.length);
  await page.waitForFunction(() => !document.querySelector(".prep-failed button").disabled);
  await retry.click();
  await bubbles(page, "err").filter({ hasText: ko.errors.access_denied() }).waitFor();
  assert.equal(await page.getAttribute("#input", "placeholder"), ko.chat.codePlaceholder);
  assert.deepEqual(errors, []);
  await context.close();
});

test("errors from the first run: the sentence shows, and the entries are still there for another try", async () => {
  const { context, page, errors } = await openApp(browser, server.url, PHONE);
  await answerWith(page, { status: 400, json: { code: "material_required" } }, DOC);
  await toQuestions(page);
  await openButton(page).click();
  await page.locator("#prepMaterial").fill(RESUME);
  await page.locator("#prepSubmit").click();
  await bubbles(page, "err").filter({ hasText: ko.errors.material_required() }).waitFor();
  assert.equal(await card(page).count(), 0);
  await openButton(page).click();
  assert.equal(await page.locator("#prepMaterial").inputValue(), RESUME);
  await page.locator("#prepSubmit").click();
  await card(page).waitFor();
  assert.deepEqual(errors, []);
  await context.close();
});

test("reload: the card and the entries come back, the resume does not; regenerating then asks for it", async () => {
  const { context, page, errors } = await openApp(browser, server.url, PHONE);
  const { doc } = failedDoc();
  const bodies = await answerWith(page, doc, experienceOnly());
  await toQuestions(page);
  await openButton(page).click();
  await dialog(page).getByLabel(ko.prep.date).fill("11/10 14:00");
  await dialog(page).getByLabel(ko.prep.axis).fill("裁量の広さ（架空）");
  await page.locator("#prepMaterial").fill(RESUME);
  await page.locator("#prepSubmit").click();
  await card(page).waitFor();
  await page.reload();
  await page.locator(".msg.coach").first().waitFor();
  await send(page, CODE);
  await bubbles(page, "coach").filter({ hasText: ko.chat.askPickAgain }).waitFor();
  await card(page).waitFor();
  assert.equal(bodies.length, 1, "a reload calls nothing");
  assert.ok(await openButton(page).isVisible());
  await card(page).locator(".prep-failed").getByRole("button", { name: ko.prep.retry }).click();
  await dialog(page).waitFor();
  assert.equal(await page.locator("#prepMaterial").inputValue(), "");
  assert.equal(await dialog(page).getByLabel(ko.prep.date).inputValue(), "11/10 14:00");
  assert.equal(await dialog(page).getByLabel(ko.prep.axis).inputValue(), "裁量の広さ（架空）");
  await page.locator("#prepMaterial").fill(RESUME);
  await page.locator("#prepSubmit").click();
  await card(page).locator(".prep-failed").waitFor({ state: "detached" });
  assert.deepEqual(bodies[1].bundles, ["experience"]);
  assert.equal(bodies[1].header.date, "11/10 14:00");
  assert.equal(bodies[1].inputs.axis, "裁量の広さ（架空）");
  assert.deepEqual(errors, []);
  await context.close();
});

test("a broken stored document cannot stop the restore; odd shapes inside one do not break the card", async () => {
  const { context, page, errors } = await openApp(browser, server.url, PHONE);
  await toQuestions(page);
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem("mensetsu-session")); s.prep = { sections: [null, 3, { key: "self_intro", items: [null, { question: 1, order: "x", evidence: 2, followups: 3 }] }, { key: "sources", rows: "x", sources: [null, { url: "javascript:x" }] }, { key: "company_position", rows: [null, { source_ids: 3 }] }], failed: 1, unresolved: "y", omitted_questions: 2 }; localStorage.setItem("mensetsu-session", JSON.stringify(s)); });
  await page.reload();
  await page.locator(".msg.coach").first().waitFor();
  await send(page, CODE);
  await bubbles(page, "coach").filter({ hasText: ko.chat.askPickAgain }).waitFor();
  assert.equal(await page.locator("#log .q").count(), 10);
  await card(page).waitFor();
  await docDownload(page);
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem("mensetsu-session")); s.prep = "broken"; localStorage.setItem("mensetsu-session", JSON.stringify(s)); });
  await page.reload();
  await page.locator(".msg.coach").first().waitFor();
  await send(page, CODE);
  await bubbles(page, "coach").filter({ hasText: ko.chat.askPickAgain }).waitFor();
  assert.equal(await card(page).count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test("hostile text stays text on the card; only http(s) links with rel; and the file stays inert", async () => {
  const { context, page, errors } = await openApp(browser, server.url, DASHBOARD);
  const d = clone(DOC);
  section(d, "self_intro").items[0].answer = `${HOSTILE}［ここに結果］`;
  section(d, "sources").sources = [{ id: "s1", title: HOSTILE, url: "https://example.com/a" }, { id: "s2", title: "悪いリンク（架空）", url: "javascript:window.__pwned=1" }];
  await answerWith(page, d);
  await toQuestions(page);
  await makeDoc(page);
  assert.ok((await fold(page, "self_intro").innerText()).includes(HOSTILE));
  assert.equal(await card(page).locator("img").count(), 0);
  assert.equal(await page.evaluate(() => window.__pwned), undefined);
  await fold(page, "sources").evaluate((x) => { x.open = true; });
  const links = fold(page, "sources").locator("a");
  assert.equal(await links.count(), 1);
  assert.equal(await links.first().getAttribute("rel"), "noopener noreferrer");
  const { text } = await docDownload(page);
  assert.ok(!text.replace(/\\</g, "").includes("<img"), "no raw markup in the file");
  assert.ok(!text.includes("javascript:"));
  assert.deepEqual(errors, []);
  await context.close();
});

test("the session keeps the document through a new question set and marks it; a re-run of the research stops its citing", async () => {
  const { context, page, errors } = await openApp(browser, server.url, PHONE);
  const d = clone(DOC);
  section(d, "company_position").rows = [{ kind: "company", value: "業務システムの提供（架空）", status: "confirmed", source_ids: ["s1"] }];
  section(d, "sources").sources = [{ id: "s1", title: "会社概要（架空）", url: "https://example.com/about" }];
  await answerWith(page, d);
  await page.route("**/api/research", (r) => r.fulfill({ json: BRIEF }));
  await page.route("**/api/fit", (r) => r.fulfill({ json: { fit_evaluation: BRIEF.fit_evaluation, mismatch_flags: [], company_checkpoints: [] } }));
  await toQuestions(page);
  await makeDoc(page);
  assert.ok(!(await card(page).innerText()).includes(ko.prep.outdated));
  assert.equal(await card(page).locator(".caution").first().innerText(), ko.prep.verifyNotice, "the check-it notice comes first");
  await fold(page, "company_position").evaluate((x) => { x.open = true; });
  const link = fold(page, "company_position").getByRole("link", { name: "s1" });
  assert.equal(await link.getAttribute("href"), "https://example.com/about", "the fact links to its page");
  assert.equal(await link.getAttribute("rel"), "noopener noreferrer");
  await page.getByRole("button", { name: ko.chat.profileButton }).click();
  await send(page, "物流システムの開発（架空）");
  await page.locator("#log > .msg.qs").nth(1).waitFor();
  await card(page).getByText(ko.prep.outdated).waitFor();
  assert.ok((await stored(page)).prep, "the regeneration keeps it");

  // Hold the regeneration back so the re-run is what the document sees.
  await page.unroute("**/api/questions");
  await page.route("**/api/questions", (r) => r.fulfill({ json: questions }));
  await page.locator("#log > .msg.brief-confirm").getByRole("button", { name: ko.research.start }).click();
  const brief = page.locator("#log > .msg.brief:not(.brief-confirm)").last();
  await brief.getByRole("heading", { name: ko.research.snapshot }).waitFor();
  await page.locator("#log > .msg.qs").nth(2).waitFor();
  await brief.getByRole("button", { name: ko.research.rerun }).click();
  await page.locator("#log > .msg.brief-confirm").last().getByRole("button", { name: ko.research.start }).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("mensetsu-session")).prep.sections.find((s) => s.key === "sources").sources.length === 0);
  const s = (await stored(page)).prep;
  assert.deepEqual(section(s, "company_position").rows[0].source_ids, []);
  assert.equal(section(s, "company_position").rows[0].status, "unconfirmed");
  await fold(page, "company_position").evaluate((x) => { x.open = true; });
  assert.ok(!(await fold(page, "company_position").innerText()).includes("s1"), "the redraw drops the id");
  assert.deepEqual(errors, []);
  await context.close();
});

test("hiding a claim takes it out of the document too", async () => {
  const { context, page, errors } = await openApp(browser, server.url, PHONE);
  const d = clone(DOC);
  section(d, "company_position").rows = [{ kind: "company", value: "業務システムの提供（架空）", status: "confirmed", source_ids: ["s1"] }];
  await answerWith(page, d);
  await page.route("**/api/research", (r) => r.fulfill({ json: BRIEF }));
  await page.route("**/api/fit", (r) => r.fulfill({ json: { fit_evaluation: BRIEF.fit_evaluation, mismatch_flags: [], company_checkpoints: [] } }));
  await toQuestions(page);
  await page.locator("#log > .msg.brief-confirm").getByRole("button", { name: ko.research.start }).click();
  const brief = page.locator("#log > .msg.brief:not(.brief-confirm)").last();
  await brief.getByRole("heading", { name: ko.research.snapshot }).waitFor();
  await page.locator("#log > .msg.qs").nth(1).waitFor();
  await makeDoc(page);
  await brief.getByText("業務システムの提供（架空）").locator("xpath=following-sibling::p[1]").getByRole("button", { name: ko.research.hide }).click();
  assert.ok(!JSON.stringify((await stored(page)).prep).includes("業務システムの提供"));
  await fold(page, "company_position").evaluate((x) => { x.open = true; });
  assert.ok(!(await fold(page, "company_position").innerText()).includes("業務システムの提供"));
  assert.deepEqual(errors, []);
  await context.close();
});

test("save: the document goes with the session, a late answer is dropped, the next company starts with empty entries", async () => {
  const { context, page, errors } = await openApp(browser, server.url, PHONE);
  let release;
  const gate = new Promise((r) => { release = r; });
  let late = false;
  await page.route("**/api/prep", async (r) => { if (late) await gate; return r.fulfill({ json: DOC }); });
  await toQuestions(page);
  await makeDoc(page);
  const f6 = await download(page, () => page.click("#end"));
  assert.ok(f6.text.includes(`# ${ko.prep.title}`));
  assert.equal(await page.evaluate(() => localStorage.getItem("mensetsu-session")), null);
  await page.locator("#mailLater").click();
  assert.ok(await card(page).getByRole("button", { name: ko.prep.download }).isDisabled(), "a saved company's card is dead");

  await send(page, MAIL);
  await bubbles(page, "coach").filter({ hasText: ko.chat.askPick({ count: 10 }) }).nth(1).waitFor();
  await page.getByRole("button", { name: ko.prep.button }).last().click();
  assert.equal(await page.locator("#prepMaterial").inputValue(), "", "the last company's resume is gone");
  late = true;
  await page.locator("#prepMaterial").fill(RESUME);
  await page.locator("#prepSubmit").click();
  await bubbles(page, "coach.typing").filter({ hasText: ko.prep.wait }).waitFor();
  await download(page, () => page.click("#end"));
  const cards = await card(page).count();
  release();
  await bubbles(page, "coach.typing").filter({ hasText: ko.prep.wait }).waitFor({ state: "detached" });
  assert.equal(await card(page).count(), cards, "the answer has no session to land on");
  assert.equal(await page.evaluate(() => localStorage.getItem("mensetsu-session")), null);
  assert.deepEqual(errors, []);
  await context.close();
});

test("practice after the document: a habit reaches the win section without a new call", async () => {
  const { context, page, errors } = await openApp(browser, server.url, PHONE);
  const bodies = await answerWith(page, DOC);
  await toQuestions(page);
  await makeDoc(page);
  for (let i = 0; i < 2; i++) {
    await send(page, "1");
    await page.locator("#mic").waitFor();
    await page.fill("#input", ANSWER);
    await page.press("#input", "Control+Enter");
    await bubbles(page, "coach").filter({ hasText: ko.chat.askPickAgain }).nth(i).waitFor();
  }
  const wins = await fold(page, "win_points").evaluate((x) => { x.open = true; return x.innerText; });
  assert.ok(wins.includes(ko.habits.summary));
  assert.equal(bodies.length, 1);
  assert.deepEqual(errors, []);
  await context.close();
});

for (const lang of ["en", "ja"]) {
  test(`${lang} 390px: labels in the screen language; items without a reading stay out; no overflow`, async () => {
    const t = LANGS[lang];
    const { context, page, errors } = await openApp(browser, server.url, PHONE, lang);
    const d = clone(DOC);
    if (lang === "ja") for (const s of d.sections) for (const x of s.items ?? []) { delete x.reading; delete x.translation; }
    await answerWith(page, d);
    await page.route("**/api/questions", (r) => r.fulfill({ json: questions }));
    await send(page, CODE);
    await bubbles(page, "coach").filter({ hasText: t.chat.askMail.split("\n")[0] }).waitFor();
    await send(page, MAIL);
    await bubbles(page, "coach").filter({ hasText: t.chat.askPick({ count: 10 }) }).waitFor();
    await makeDoc(page, t);
    const text = await card(page).innerText();
    assert.ok(text.includes(t.prep.title) && text.includes(t.prep.sections.experience_qa) && text.includes(t.prep.counts({ blanks: d.blanks, to_confirm: d.to_confirm })));
    for (const det of await card(page).locator("details").all()) await det.evaluate((x) => { x.open = true; });
    assert.ok(await noHorizontalOverflow(page));
    const [dl] = await Promise.all([page.waitForEvent("download"), card(page).getByRole("button", { name: t.prep.download }).click()]);
    const md = await readFile(await dl.path(), "utf8");
    assert.ok(md.includes(t.prep.asked));
    if (lang === "ja") {
      assert.equal(await card(page).locator(".reading").count(), 0);
      assert.ok(md.includes("聞かれていること") && md.includes("隣の質問に注意") && md.includes("話す順序") && md.includes("例文（たたき台）") && md.includes("使える素材") && md.includes("次に聞かれそう"));
      assert.ok(md.includes("## 使い方\n"), "no second label beside the same one");
    }
    assert.deepEqual(errors, []);
    await context.close();
  });
}

test("flag off: no button, no call, and a document left in the session is kept for the file but draws no card", async () => {
  const off = await startServer({ PREP_ENABLED: "" });
  try {
    const { context, page, errors } = await openApp(browser, off.url, PHONE);
    const sent = [];
    page.on("request", (r) => { if (r.url().includes("/api/prep")) sent.push(r); });
    const access = page.waitForResponse("**/api/access");
    await toQuestions(page);
    assert.equal((await (await access).json()).prep, false);
    assert.equal(await page.getByRole("button", { name: ko.prep.button }).count(), 0);
    await page.evaluate((d) => { const s = JSON.parse(localStorage.getItem("mensetsu-session")); s.prep = d; localStorage.setItem("mensetsu-session", JSON.stringify(s)); }, DOC);
    await page.reload();
    await page.locator(".msg.coach").first().waitFor();
    await send(page, CODE);
    await bubbles(page, "coach").filter({ hasText: ko.chat.askPickAgain }).waitFor();
    assert.equal(await page.getByRole("button", { name: ko.prep.button }).count(), 0);
    assert.equal(await card(page).count(), 0);
    assert.ok((await stored(page)).prep);
    const f6 = await download(page, () => page.click("#end"));
    assert.ok(f6.text.includes(`# ${ko.prep.title}`));
    assert.equal(sent.length, 0);
    assert.deepEqual(errors, []);
    await context.close();
  } finally {
    off.stop();
  }
});

test("a pack without the document (kr): no button", async () => {
  const { context, page, errors } = await openApp(browser, server.url, PHONE);
  await page.route("**/api/questions", (r) => r.fulfill({ json: { ...questions, pack: { ...questions.pack, id: "kr", target: "ko" } } }));
  await send(page, CODE);
  await bubbles(page, "coach").filter({ hasText: ko.chat.askMail.split("\n")[0] }).waitFor();
  await send(page, MAIL);
  await bubbles(page, "coach").filter({ hasText: ko.chat.askPick({ count: 10 }) }).waitFor();
  assert.equal(await page.getByRole("button", { name: ko.prep.button }).count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test("the privacy page says what happens to the resume and the entries", async () => {
  const { context, page, errors } = await openApp(browser, server.url, PHONE);
  await page.goto(`${server.url}/privacy.html`);
  const text = await page.locator("main").innerText();
  assert.match(text, /面接準備資料/);
  assert.match(text, /履歴書/);
  assert.match(text, /転職理由/);
  assert.deepEqual(errors, []);
  await context.close();
});
