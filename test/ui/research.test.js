// Stage R in the browser: confirm card, brief card, re-run, restore, export. MOCK, 0 tokens. The route-fulfilled briefs
// keep the server's 5-per-10-minutes limit out of the way and carry the fit sections, which the server adds in a later step.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { LANGS } from "../../public/i18n/index.js";
import { briefFacts, reverseFacts } from "../../public/export.js";
import { fixture } from "../fake-claude.js";
import { startServer, launch, openApp, bubbles, send, noHorizontalOverflow, CODE, MAIL, ANSWER } from "./harness.js";

const ko = LANGS.ko;
const PHONE = { width: 390, height: 844 }, DASHBOARD = { width: 1280, height: 800 };
const { company: COMPANY, position: POSITION } = fixture.company_context;
const claim = (value, extra = {}) => ({ value, source_ids: ["s1"], confidence: "medium", source_count: 1, single_source: true, ...extra });
const missing = { value: "not_found", source_ids: [], confidence: "unknown", source_count: 0, single_source: false };
const HOSTILE = '<img src=x onerror="window.__pwned=1">';
const LONG_URL = `https://example.com/${"long-path-without-any-break/".repeat(8)}`;
const FULL = {
  research_status: "ok",
  research_date: "2026-11-04",
  tool_errors: 1,
  company_snapshot: { business: claim(`業務システムの提供（架空）${HOSTILE}`), business_model: claim("自社製品が中心（架空）"), size: missing, founded: missing, locations: claim("本社は東京（架空）", { single_source: false, source_count: 2, source_ids: ["s1", "s2"], confidence: "high" }), recent_news: [claim("新製品を発表（架空）")] },
  position_analysis: {
    position_match: "exact",
    actual_work: claim("要件定義と進行管理（架空）", { position_match: "exact", applies_to_position: true }),
    team_context: { ...missing, position_match: "unknown", applies_to_position: false },
    required_skills: [claim("要件定義の経験（架空）", { position_match: "exact", applies_to_position: true })],
    preferred_skills: [],
    salary: claim("年収600万〜800万円（架空）", { position_match: "similar", applies_to_position: false, bonus_included: "yes", overtime_pay_included: "unknown" }),
    conditions: [],
  },
  reputation_themes: [claim("残業の話題が繰り返し挙がる（架空）", { polarity: "negative", sample_size: "12件", representativeness: "low" })],
  interview_intelligence: { selection_stages: [claim("面接2回（架空）", { label: "reported_unverified" })], reported_questions: [claim("製品のどこを改善しますか（架空）", { label: "reported_unverified" })] },
  fit_evaluation: {
    matches: [{ point: "要件定義の経験（架空）", basis: "user_material", quote: "要件定義を3年（架空）", source_ids: [] }],
    gaps: [{ point: "業界経験（架空）", basis: "company_info", quote: "物流の経験を歓迎（架空）", source_ids: ["s1"] }],
    needs_user_confirmation: ["夜間対応の有無を確認しますか（架空）"],
  },
  mismatch_flags: [{ topic: "職種の内容（架空）", side_a: { origin: "mail", quote: "プロダクトマネジメント（架空）", source_ids: [] }, side_b: { origin: "research", quote: "デリバリー管理（架空）", source_ids: ["s1"] }, verify_prompt: "担当業務の割合を確認しましょう（架空）" }],
  company_checkpoints: [{ question: "残業の実態を確認できますか（架空）", ask: "agent", source_ids: ["s1"] }],
  sources: [
    { id: "s1", title: `採用情報（架空）${HOSTILE}`, url: LONG_URL, accessed_date: "2026-11-04", published_date: "2026-10-01", entity_match: "exact", position_match: "exact", source_type: "official_careers" },
    { id: "s2", title: "口コミ（架空）", url: "http://example.com/reviews", accessed_date: "2026-11-04", published_date: "", entity_match: "exact", position_match: "unknown", source_type: "review_site" },
    { id: "s3", title: "危険なリンク（架空）", url: "javascript:window.__pwned=1", accessed_date: "2026-11-04", published_date: "", entity_match: "exact", position_match: "unknown", source_type: "other" },
  ],
};
const UNAVAILABLE = { research_status: "unavailable", research_date: "2026-11-04" };
const EMPTY = { research_status: "ok", research_date: "2026-11-04", tool_errors: 0, company_snapshot: { business: missing, business_model: missing, size: missing, founded: missing, locations: missing, recent_news: [] }, position_analysis: { position_match: "unknown" }, reputation_themes: [], interview_intelligence: { selection_stages: [], reported_questions: [] }, sources: [] };

let server, browser, questions;
before(async () => {
  server = await startServer({ RESEARCH_ENABLED: "1" });
  browser = await launch();
  // /api/questions allows 10 per server; one real answer serves this whole file (test/ui/flow.test.js covers the real path).
  questions = await (await fetch(`${server.url}/api/questions`, { method: "POST", headers: { "x-access-code": CODE, "content-type": "application/json" }, body: JSON.stringify({ mail: MAIL, lang: "ko" }) })).json();
});
after(async () => { await browser?.close(); server?.stop(); });

const confirmCard = (page) => page.locator("#log > .msg.brief-confirm");
const briefCard = (page) => page.locator("#log > .msg.brief:not(.brief-confirm)").last();
const storedBrief = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("mensetsu-session")).company_context.research_brief ?? null);
const researchRequests = (page) => {
  const list = [];
  page.on("request", (r) => { if (r.url().includes("/api/research")) list.push(r); });
  return list;
};
const answerWith = (page, ...bodies) => {
  let i = 0;
  return page.route("**/api/research", (r) => { const b = bodies[Math.min(i++, bodies.length - 1)]; return b.status ? r.fulfill({ status: b.status, json: b.json }) : r.fulfill({ json: b }); });
};
async function toQuestions(page, t = ko) {
  await page.route("**/api/questions", (r) => r.fulfill({ json: questions }));
  await send(page, CODE);
  await bubbles(page, "coach").filter({ hasText: t.chat.askMail.split("\n")[0] }).waitFor();
  await send(page, MAIL);
  await bubbles(page, "coach").filter({ hasText: t.chat.askPick({ count: 10 }) }).waitFor();
}
const start = (page, t = ko) => confirmCard(page).last().getByRole("button", { name: t.research.start }).click();
// Stages carry the same label and come before this heading, so only the question rows can satisfy a check on this slice.
const questionRows = (text, r) => text.slice(text.indexOf(r.questions));

for (const [name, viewport] of [["390", PHONE], ["1280", DASHBOARD]]) {
  test(`${name}px: nothing is searched until confirmed; the edited name goes through the real gates into the card`, async () => {
    const { context, page, errors } = await openApp(browser, server.url, viewport);
    const sent = researchRequests(page);
    await toQuestions(page);
    const card = confirmCard(page);
    assert.equal(await card.getByLabel(ko.research.company).inputValue(), COMPANY);
    assert.equal(await card.getByLabel(ko.research.position).inputValue(), POSITION);
    assert.equal(sent.length, 0, "an unconfirmed name is never researched");
    await card.getByLabel(ko.research.position).fill("  プロダクトマネージャー（仮） ");
    await start(page);
    await briefCard(page).waitFor();
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0].postDataJSON(), { company: COMPANY, position: "プロダクトマネージャー（仮）", lang: "ko" }, "only the confirmed names leave the page");
    const brief = briefCard(page), text = await brief.innerText();
    assert.ok(text.includes(ko.research.title({ company: COMPANY, position: "プロダクトマネージャー（仮）" })));
    assert.ok(text.includes("自社製品が中心"), "a claim on an exact source survives");
    assert.ok(!text.includes("別企業の従業員数"), "a claim on a similarly named company does not");
    assert.ok(text.includes(ko.research.notFound));
    assert.ok(!text.includes("not_found"), "the raw marker never shows");
    assert.ok(questionRows(text, ko.research).includes("当社の製品のどこを改善しますか（架空）"));
    assert.ok(questionRows(text, ko.research).includes(ko.research.unverified), "reported question labelled");
    assert.ok(text.includes(ko.research.singleSource));
    assert.ok(await card.getByRole("button", { name: ko.research.start }).isDisabled(), "the card cannot fire twice");
    const links = brief.locator("details a");
    assert.equal(await links.count(), 2, "the similar company's source is gone");
    assert.ok(!(await links.first().isVisible()), "sources start collapsed");
    assert.deepEqual(await page.evaluate(() => document.getElementById("log").scrollWidth <= document.getElementById("log").clientWidth), true);
    assert.ok(await noHorizontalOverflow(page));
    assert.ok((await storedBrief(page)).research_status === "ok", "the session stores the brief");
    assert.deepEqual(errors, []);
    await context.close();
  });

  test(`${name}px: full brief — every section, hostile text stays text, only http(s) links, no overflow`, async () => {
    const { context, page, errors } = await openApp(browser, server.url, viewport);
    await answerWith(page, FULL);
    await toQuestions(page);
    await start(page);
    const brief = briefCard(page);
    await brief.getByRole("heading", { name: ko.research.mismatch }).waitFor();
    const r = ko.research, text = await brief.innerText();
    for (const s of [r.snapshot, r.news, r.role, r.match.exact, r.claimMatch.similar, r.mismatchNote, r.origin.mail, r.origin.research, "プロダクトマネジメント（架空）", "デリバリー管理（架空）", "担当業務の割合を確認しましょう（架空）", r.reputation, "12件", r.rep.low, r.polarity.negative, r.questions, r.fit, r.matches, r.gaps, r.confirm, "夜間対応の有無を確認しますか（架空）", r.checkpoints, r.ask.agent, r.confidence.high, r.partial({ n: 1 }), r.salaryNote({ bonus: r.included.yes, overtime: r.included.unknown })]) assert.ok(text.includes(s), s);
    assert.ok(text.indexOf(r.snapshot) < text.indexOf(r.mismatch) && text.indexOf(r.mismatch) < text.indexOf(r.reputation) && text.indexOf(r.reputation) < text.indexOf(r.questions) && text.indexOf(r.questions) < text.indexOf(r.fit) && text.indexOf(r.fit) < text.indexOf(r.checkpoints), "spec order");
    assert.ok(questionRows(text, r).includes("製品のどこを改善しますか（架空）") && questionRows(text, r).includes(r.unverified), "the reported question itself is labelled");
    for (const s of [`${r.origin.research}: デリバリー管理（架空） · s1`, `${r.basis.company_info}: 物流の経験を歓迎（架空） · s1`, `${r.ask.agent}: 残業の実態を確認できますか（架空） · s1`]) assert.ok(text.includes(s), s);
    assert.ok(!text.includes("プロダクトマネジメント（架空） ·") && !text.includes("要件定義を3年（架空） ·"), "no separator without an id");
    assert.ok(text.includes(HOSTILE), "model text is shown as text");
    assert.equal(await brief.locator("img").count(), 0, "and never parsed as HTML");
    assert.equal(await page.evaluate(() => window.__pwned), undefined);
    await brief.locator("details > summary").click();
    const links = brief.locator("details a");
    assert.equal(await links.count(), 2, "javascript: is no link");
    assert.ok((await brief.locator("details").innerText()).includes("危険なリンク（架空）"), "that source stays listed as text");
    for (const a of await links.all()) {
      assert.match(await a.getAttribute("href"), /^https?:\/\//);
      assert.match(await a.getAttribute("rel"), /\bnoopener\b/);
      assert.equal(await a.getAttribute("target"), "_blank");
    }
    assert.ok(await brief.evaluate((c) => c.scrollWidth <= c.clientWidth), "a long URL wraps inside the card");
    assert.ok(await noHorizontalOverflow(page));
    const b = await brief.locator("details > summary").boundingBox();
    assert.ok(b.height >= 44, `summary is a 44px target (${b.height})`);
    assert.deepEqual(errors, []);
    await context.close();
  });
}

for (const match of ["similar", "unknown"]) {
  test(`position_match ${match}: the section opens with its own label`, async () => {
    const { context, page, errors } = await openApp(browser, server.url, PHONE);
    await answerWith(page, { ...FULL, position_analysis: { ...FULL.position_analysis, position_match: match } });
    await toQuestions(page);
    await start(page);
    const r = ko.research, role = briefCard(page).getByRole("heading", { name: r.role, exact: true });
    await role.waitFor();
    assert.equal(await role.locator("xpath=following-sibling::p[1]").innerText(), r.match[match]);
    assert.deepEqual(errors, []);
    await context.close();
  });
}

test("reverse questions: the stored brief stays in the browser; only sourced facts go, each question shows its source", async () => {
  const { context, page, errors } = await openApp(browser, server.url, PHONE);
  await answerWith(page, FULL);
  let body;
  await page.route("**/api/reverse", (r) => { body = r.request().postDataJSON(); return r.fulfill({ json: { questions: [{ question: "新製品の狙いは何でしょうか（架空）", intent: "의도（架空）", source_ids: ["s1"] }, { question: "評価の基準は何でしょうか（架空）", intent: "의도（架空）", source_ids: [] }], research_basis: { referenced: 0, required: 1, passed: false } } }); });
  await toQuestions(page);
  await start(page);
  await briefCard(page).getByRole("heading", { name: ko.research.snapshot }).waitFor();
  await page.getByRole("button", { name: ko.reverse.button }).click();
  const card = page.locator("#log > .msg.reverse");
  await card.waitFor();
  assert.deepEqual(body.context, questions.company_context, "the summary only, as before research existed");
  assert.deepEqual(body.brief, reverseFacts(FULL));
  for (const s of ["要件定義を3年", "夜間対応", "残業の実態", "製品のどこを改善"]) assert.ok(!JSON.stringify(body).includes(s), s);
  assert.equal(await card.getByText(`${ko.reverse.source}: s1`).count(), 1, "one source line: the question without a source has none");
  assert.equal(await card.getByText(ko.reverse.lowResearch).count(), 1);
  assert.equal((await storedBrief(page)).research_status, "ok", "the session keeps it");
  assert.deepEqual(errors, []);
  await context.close();
});

for (const lang of ["en", "ja"]) {
  test(`${lang} 390px: the cards read in the screen language`, async () => {
    const t = LANGS[lang];
    const { context, page, errors } = await openApp(browser, server.url, PHONE, lang);
    await answerWith(page, FULL);
    await toQuestions(page, t);
    assert.ok((await confirmCard(page).innerText()).includes(t.research.confirmBody));
    await start(page, t);
    const brief = briefCard(page);
    await brief.getByRole("heading", { name: t.research.snapshot }).waitFor();
    const text = await brief.innerText();
    for (const s of [t.research.mismatch, t.research.reputation, t.research.checkpoints]) assert.ok(text.includes(s), s);
    assert.ok(questionRows(text, t.research).includes(t.research.unverified));
    assert.ok(await noHorizontalOverflow(page));
    assert.deepEqual(errors, []);
    await context.close();
  });
}

test("waiting: the existing dots row, with its label after 3 s; practice stays usable meanwhile", async () => {
  const { context, page, errors } = await openApp(browser, server.url, PHONE);
  let release;
  const gate = new Promise((r) => { release = r; });
  await page.route("**/api/research", async (r) => { await gate; return r.fulfill({ json: FULL }); });
  await toQuestions(page);
  await start(page);
  const wait = bubbles(page, "coach.typing").filter({ hasText: ko.research.wait });
  await wait.locator(".wait-label").waitFor({ state: "visible", timeout: 6000 });
  await send(page, "1");
  await page.locator("#mic").waitFor(); // the composer is not blocked by the research
  release();
  await briefCard(page).getByRole("heading", { name: ko.research.snapshot }).waitFor();
  assert.equal(await wait.count(), 0, "the row goes away");
  assert.deepEqual(errors, []);
  await context.close();
});

test("unavailable: the questions stay, the wording is not 'nothing found', and only the button runs it again", async () => {
  const { context, page, errors } = await openApp(browser, server.url, PHONE);
  const sent = researchRequests(page);
  await answerWith(page, UNAVAILABLE, FULL);
  await toQuestions(page);
  await start(page);
  const r = ko.research, card = briefCard(page);
  await card.getByText(r.unavailable).waitFor();
  const text = await card.innerText();
  assert.ok(!text.includes(r.notFound) && !text.includes(r.empty), "a tool failure is not 'nothing exists'");
  assert.equal(await page.locator("#log .q").count(), 10, "the first questions stay on screen");
  assert.equal((await storedBrief(page)).research_status, "unavailable");
  assert.equal(sent.length, 1);
  await card.getByRole("button", { name: r.rerun }).click();
  assert.equal(sent.length, 1, "the re-run button only opens the confirm card");
  assert.equal(await confirmCard(page).last().getByLabel(r.company).inputValue(), COMPANY);
  await start(page);
  await briefCard(page).getByRole("heading", { name: r.snapshot }).waitFor();
  assert.equal(sent.length, 2);
  assert.equal((await storedBrief(page)).research_status, "ok");
  assert.deepEqual(errors, []);
  await context.close();
});

test("a failed re-run keeps the earlier brief; an honest empty brief replaces it and says so", async () => {
  const { context, page, errors } = await openApp(browser, server.url, PHONE);
  await answerWith(page, FULL, UNAVAILABLE, EMPTY);
  await toQuestions(page);
  await start(page);
  const r = ko.research;
  await briefCard(page).getByRole("heading", { name: r.snapshot }).waitFor();
  await briefCard(page).getByRole("button", { name: r.rerun }).click();
  await start(page);
  await briefCard(page).getByText(r.kept).waitFor();
  assert.equal((await storedBrief(page)).sources.length, FULL.sources.length, "the paid result is not lost");
  await briefCard(page).getByRole("button", { name: r.rerun }).click();
  await start(page);
  await briefCard(page).getByText(r.empty).waitFor();
  const text = await briefCard(page).innerText();
  assert.ok(text.includes(r.notFound) && text.includes(r.noReports));
  assert.deepEqual((await storedBrief(page)).sources, []);
  assert.deepEqual(errors, []);
  await context.close();
});

test("a refused name shows the sentence and the card stays usable; 401 returns to the code step", async () => {
  const { context, page, errors } = await openApp(browser, server.url, PHONE);
  await answerWith(page, { status: 400, json: { code: "name_required" } }, FULL, { status: 401, json: { code: "access_denied" } });
  await toQuestions(page);
  await start(page);
  await bubbles(page, "err").filter({ hasText: ko.errors.name_required() }).waitFor();
  const card = confirmCard(page);
  assert.ok(await card.getByRole("button", { name: ko.research.start }).isEnabled());
  assert.ok(await card.getByLabel(ko.research.company).isEditable());
  await start(page);
  await briefCard(page).getByRole("heading", { name: ko.research.snapshot }).waitFor();
  await briefCard(page).getByRole("button", { name: ko.research.rerun }).click();
  await start(page);
  await bubbles(page, "err").filter({ hasText: ko.errors.access_denied() }).waitFor();
  await bubbles(page, "coach").filter({ hasText: ko.chat.askCode }).last().waitFor();
  assert.equal(await page.getAttribute("#input", "placeholder"), ko.chat.codePlaceholder);
  assert.deepEqual(errors, []);
  await context.close();
});

test("a network failure: error sentence, questions stay, card usable again", async () => {
  const { context, page, errors } = await openApp(browser, server.url, PHONE);
  await page.route("**/api/research", (r) => r.abort());
  await toQuestions(page);
  await start(page);
  await bubbles(page, "err").filter({ hasText: ko.errors.network() }).waitFor();
  assert.ok(await confirmCard(page).getByRole("button", { name: ko.research.start }).isEnabled());
  assert.equal(await page.locator("#log .q").count(), 10);
  assert.deepEqual(errors, []);
  await context.close();
});

test("reload: the stored brief comes back with no new search; a session with no brief gets the card again", async () => {
  const { context, page, errors } = await openApp(browser, server.url, PHONE);
  const sent = researchRequests(page);
  await answerWith(page, FULL);
  await toQuestions(page);
  await confirmCard(page).getByLabel(ko.research.company).fill("株式会社サンプルテック（仮）");
  await start(page);
  await briefCard(page).getByRole("heading", { name: ko.research.snapshot }).waitFor();
  await page.reload();
  await page.locator(".msg.coach").first().waitFor();
  await send(page, CODE);
  await bubbles(page, "coach").filter({ hasText: ko.chat.askPickAgain }).waitFor();
  const brief = briefCard(page);
  assert.ok((await brief.innerText()).includes(ko.research.title({ company: "株式会社サンプルテック（仮）", position: POSITION })), "the confirmed name, not the extracted one");
  assert.equal(await confirmCard(page).count(), 0);
  assert.equal(sent.length, 1, "a reload never searches");
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem("mensetsu-session")); delete s.company_context.research_brief; delete s.research_names; localStorage.setItem("mensetsu-session", JSON.stringify(s)); });
  await page.reload();
  await page.locator(".msg.coach").first().waitFor();
  await send(page, CODE);
  await bubbles(page, "coach").filter({ hasText: ko.chat.askPickAgain }).waitFor();
  assert.equal(await confirmCard(page).getByLabel(ko.research.company).inputValue(), COMPANY);
  assert.equal(sent.length, 1);
  assert.deepEqual(errors, []);
  await context.close();
});

test("a broken stored brief cannot stop the restore", async () => {
  const { context, page, errors } = await openApp(browser, server.url, PHONE);
  await toQuestions(page);
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem("mensetsu-session")); s.company_context.research_brief = { research_status: "ok", company_snapshot: "x", position_analysis: 1, reputation_themes: "y", interview_intelligence: null, mismatch_flags: [null, { side_a: 1 }], fit_evaluation: { matches: 2 }, company_checkpoints: {}, sources: [null, 3, { url: "javascript:x" }] }; localStorage.setItem("mensetsu-session", JSON.stringify(s)); });
  await page.reload();
  await page.locator(".msg.coach").first().waitFor();
  await send(page, CODE);
  await bubbles(page, "coach").filter({ hasText: ko.chat.askPickAgain }).waitFor();
  assert.equal(await page.locator("#log .q").count(), 10);
  assert.ok((await briefCard(page).innerText()).includes(ko.research.notFound));
  assert.deepEqual(errors, []);
  await context.close();
});

test("the career-line regeneration keeps the brief and the confirmed names", async () => {
  const { context, page, errors } = await openApp(browser, server.url, PHONE);
  await answerWith(page, FULL);
  await toQuestions(page);
  await confirmCard(page).getByLabel(ko.research.company).fill("株式会社サンプルテック（仮）");
  await start(page);
  await briefCard(page).getByRole("heading", { name: ko.research.snapshot }).waitFor();
  await page.getByRole("button", { name: ko.chat.profileButton }).click();
  await send(page, "物流システムの開発7年");
  await bubbles(page, "coach").filter({ hasText: ko.chat.askPick({ count: 10 }) }).nth(1).waitFor();
  assert.equal((await storedBrief(page))?.research_status, "ok", "a paid brief survives the new question set");
  assert.equal(await confirmCard(page).count(), 1, "the card is not offered again");
  await briefCard(page).getByRole("button", { name: ko.research.rerun }).click();
  assert.equal(await confirmCard(page).last().getByLabel(ko.research.company).inputValue(), "株式会社サンプルテック（仮）");
  assert.deepEqual(errors, []);
  await context.close();
});

test("a response that arrives during the career-line regeneration still lands on the same company", async () => {
  const { context, page, errors } = await openApp(browser, server.url, PHONE);
  let release;
  const gate = new Promise((r) => { release = r; });
  await page.route("**/api/research", async (r) => { await gate; return r.fulfill({ json: FULL }); });
  await toQuestions(page);
  await start(page);
  await page.getByRole("button", { name: ko.chat.profileButton }).click();
  await send(page, "物流システムの開発7年");
  await bubbles(page, "coach").filter({ hasText: ko.chat.askPick({ count: 10 }) }).nth(1).waitFor();
  release();
  await briefCard(page).getByRole("heading", { name: ko.research.snapshot }).waitFor();
  assert.equal((await storedBrief(page))?.research_status, "ok");
  assert.deepEqual(errors, []);
  await context.close();
});

// Registered after toQuestions, so these answers win over the first set's route.
const regenRoute = async (page, answer) => {
  const bodies = [];
  await page.route("**/api/questions", (r) => { bodies.push(r.request().postDataJSON()); return answer(r); });
  return bodies;
};
const labelled = () => ({
  ...questions,
  company_context: { ...questions.company_context, facts: ["新製品を発表（架空）"] },
  research_basis: { referenced: 2, required: 3, passed: false },
  questions: questions.questions.map((q, i) => ({ ...q, ...[{ basis_type: "research", source_ids: ["s1", "s2"], reported: false }, { basis_type: "research", source_ids: ["s3"], reported: true }, { basis_type: "mail" }][i] ?? { basis_type: "pack" } })),
});

test("a brief with facts regenerates the questions: sourced facts go, labels show, the first set's cards die", async () => {
  const { context, page, errors } = await openApp(browser, server.url, PHONE);
  await answerWith(page, FULL);
  await toQuestions(page);
  const bodies = await regenRoute(page, (r) => r.fulfill({ json: labelled() }));
  await start(page);
  const c = ko.chat, sets = page.locator("#log > .msg.qs");
  await sets.nth(1).waitFor();
  assert.equal(bodies.length, 1);
  assert.deepEqual(bodies[0].brief, briefFacts(FULL));
  assert.equal(bodies[0].mail, MAIL.trim());
  for (const s of ["要件定義を3年", "残業", "年収", "プロダクトマネジメント"]) assert.ok(!JSON.stringify(bodies[0]).includes(s), s);
  const items = sets.nth(1).locator(".q");
  assert.ok((await items.nth(0).innerText()).includes(`${c.basisType.research} · s1 · s2`));
  assert.ok((await items.nth(1).innerText()).includes(`${c.basisType.reported} · s3`));
  assert.ok((await items.nth(2).innerText()).includes(c.basisType.mail));
  assert.ok((await items.nth(3).innerText()).includes(c.basisType.pack));
  assert.ok((await sets.nth(1).innerText()).includes(c.researchRefs({ n: 2, total: 10 })));
  await bubbles(page, "coach.note").filter({ hasText: c.lowResearch({ referenced: 2, required: 3 }) }).waitFor();
  assert.ok(await sets.nth(0).locator("button[data-pick]").first().isDisabled());
  assert.equal(await page.locator("#log .brief-confirm").count(), 1, "the card is not offered again");
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("mensetsu-session")));
  assert.equal(stored.company_context.research_brief.research_status, "ok");
  assert.equal(stored.questions[0].basis_type, "research");
  assert.equal(stored.research_basis.passed, false);
  assert.equal(await page.getAttribute("#input", "placeholder"), c.pickPlaceholder);
  await page.reload();
  await page.locator(".msg.coach").first().waitFor();
  await send(page, CODE);
  await bubbles(page, "coach").filter({ hasText: c.askPickAgain }).waitFor();
  assert.ok((await page.locator("#log > .msg.qs .q").nth(1).innerText()).includes(c.basisType.reported), "the label survives a reload");
  // L6: the script call gets the mail-only summary, not what a set made with the brief wrote into its own.
  assert.deepEqual(stored.company_context.facts, questions.company_context.facts);
  const script = page.waitForRequest("**/api/script");
  await send(page, "3");
  await page.fill("#input", ANSWER);
  await page.press("#input", "Control+Enter");
  assert.ok(!(await script).postDataJSON().context.includes("新製品"));
  assert.deepEqual(errors, []);
  await context.close();
});

test("nothing sourced to add: no regeneration, the first questions stay", async () => {
  for (const brief of [EMPTY, UNAVAILABLE]) {
    const { context, page, errors } = await openApp(browser, server.url, PHONE);
    await answerWith(page, brief);
    await toQuestions(page);
    const bodies = await regenRoute(page, (r) => r.fulfill({ json: questions }));
    await start(page);
    await briefCard(page).waitFor();
    await bubbles(page, "coach.typing").waitFor({ state: "detached" });
    assert.equal(bodies.length, 0);
    assert.equal(await page.locator("#log .q").count(), 10);
    assert.deepEqual(errors, []);
    await context.close();
  }
});

test("a practice in progress is not wiped: the button asks first, then the set is replaced", async () => {
  const { context, page, errors } = await openApp(browser, server.url, PHONE);
  await answerWith(page, FULL);
  await toQuestions(page);
  const bodies = await regenRoute(page, (r) => r.fulfill({ json: labelled() }));
  await send(page, "1");
  await page.locator("#mic").waitFor();
  await start(page);
  const r = ko.research, go = page.getByRole("button", { name: r.regenButton });
  await go.waitFor();
  assert.equal(bodies.length, 0, "nothing regenerated by itself");
  assert.ok((await bubbles(page, "coach.note").filter({ has: go }).innerText()).includes(r.regenOffer));
  await go.click();
  await page.locator("#log > .msg.qs").nth(1).waitFor();
  assert.equal(bodies.length, 1);
  assert.equal(await page.getAttribute("#input", "placeholder"), ko.chat.pickPlaceholder, "back to picking from the new set");
  assert.deepEqual(errors, []);
  await context.close();
});

test("the career line goes with the brief regeneration", async () => {
  const { context, page, errors } = await openApp(browser, server.url, PHONE);
  await answerWith(page, FULL);
  await toQuestions(page);
  const bodies = await regenRoute(page, (r) => r.fulfill({ json: questions }));
  await page.getByRole("button", { name: ko.chat.profileButton }).click();
  await send(page, "物流システムの開発7年");
  await page.locator("#log > .msg.qs").nth(1).waitFor();
  assert.equal(bodies[0].brief, undefined, "no brief yet");
  await start(page);
  await page.locator("#log > .msg.qs").nth(2).waitFor();
  assert.equal(bodies[1].profile, "物流システムの開発7年");
  assert.deepEqual(bodies[1].brief, briefFacts(FULL));
  assert.deepEqual(errors, []);
  await context.close();
});

test("a career line started during the regeneration keeps its stage", async () => {
  const { context, page, errors } = await openApp(browser, server.url, PHONE);
  await answerWith(page, FULL);
  await toQuestions(page);
  let release;
  const gate = new Promise((r) => { release = r; });
  await regenRoute(page, async (r) => { await gate; return r.fulfill({ json: questions }); });
  await start(page);
  const wait = briefCard(page).getByText(ko.research.regenWait);
  await wait.waitFor();
  await page.getByRole("button", { name: ko.chat.profileButton }).click();
  release();
  await wait.waitFor({ state: "detached" });
  assert.equal(await page.getAttribute("#input", "placeholder"), ko.chat.profilePlaceholder);
  assert.deepEqual(errors, []);
  await context.close();
});

test("a save while the set is regenerating: the late answer does not bring the session back", async () => {
  const { context, page, errors } = await openApp(browser, server.url, PHONE);
  await answerWith(page, FULL);
  await toQuestions(page);
  let release;
  const gate = new Promise((r) => { release = r; });
  await regenRoute(page, async (r) => { await gate; return r.fulfill({ json: labelled() }); });
  await start(page);
  const wait = briefCard(page).getByText(ko.research.regenWait);
  await wait.waitFor();
  assert.ok(await page.locator("#send").isDisabled(), "no practice starts on a set about to be replaced");
  await Promise.all([page.waitForEvent("download"), page.click("#end")]);
  release();
  await wait.waitFor({ state: "detached" });
  assert.equal(await page.evaluate(() => localStorage.getItem("mensetsu-session")), null);
  assert.equal(await page.locator("#log > .msg.qs").count(), 1);
  assert.ok(await page.locator("#send").isEnabled(), "the composer comes back");
  assert.deepEqual(errors, []);
  await context.close();
});

test("a restored session has no mail to regenerate from: it says so and keeps the questions", async () => {
  const { context, page, errors } = await openApp(browser, server.url, PHONE);
  await answerWith(page, FULL);
  await toQuestions(page);
  await page.reload();
  await page.locator(".msg.coach").first().waitFor();
  const bodies = await regenRoute(page, (r) => r.fulfill({ json: questions }));
  await send(page, CODE);
  await bubbles(page, "coach").filter({ hasText: ko.chat.askPickAgain }).waitFor();
  await start(page);
  await bubbles(page, "coach.note").filter({ hasText: ko.research.noRegen }).waitFor();
  assert.equal(bodies.length, 0);
  assert.equal(await page.locator("#log .q").count(), 10);
  assert.deepEqual(errors, []);
  await context.close();
});

test("a long brief opens at its top, not at its last line", async () => {
  const { context, page, errors } = await openApp(browser, server.url, PHONE);
  await answerWith(page, FULL);
  await toQuestions(page);
  await start(page);
  await briefCard(page).getByRole("heading", { name: ko.research.snapshot }).waitFor();
  const [card, log] = await Promise.all([briefCard(page).boundingBox(), page.locator("#log").boundingBox()]);
  assert.ok(Math.abs(card.y - log.y) <= 16, `card top ${card.y}, log top ${log.y}`);
  assert.deepEqual(errors, []);
  await context.close();
});

test("save: the research section is in the file; a response after save is dropped, and old cards are dead", async () => {
  const { context, page, errors } = await openApp(browser, server.url, PHONE);
  const sent = researchRequests(page);
  await answerWith(page, FULL);
  await toQuestions(page);
  await start(page);
  await briefCard(page).getByRole("heading", { name: ko.research.snapshot }).waitFor();
  const [download] = await Promise.all([page.waitForEvent("download"), page.click("#end")]);
  const md = await readFile(await download.path(), "utf8");
  assert.ok(md.includes(`## ${ko.research.title({ company: COMPANY, position: POSITION })}`));
  assert.ok(md.includes(ko.research.checkpoints) && md.includes(`- ${ko.research.ask.agent}: 残業の実態を確認できますか（架空）`));
  assert.ok(md.includes("http://example.com/reviews"));
  assert.ok(!md.includes("javascript:"));
  await page.locator("#mailLater").click();
  assert.ok(await briefCard(page).getByRole("button", { name: ko.research.rerun }).isDisabled(), "a saved company's card cannot research into the next session");
  assert.equal(sent.length, 1);

  // A second company, researched with the save racing the response.
  await page.unroute("**/api/research");
  let release;
  const gate = new Promise((r) => { release = r; });
  await page.route("**/api/research", async (r) => { await gate; return r.fulfill({ json: FULL }); });
  await send(page, MAIL);
  await confirmCard(page).nth(1).waitFor();
  await start(page);
  await Promise.all([page.waitForEvent("download"), page.click("#end")]);
  // The next company's questions arrive first, so a late brief would land on the wrong company.
  await send(page, MAIL);
  await confirmCard(page).nth(2).waitFor();
  const cards = await briefCard(page).count(), failures = await bubbles(page, "err").count();
  release();
  await bubbles(page, "coach.typing").waitFor({ state: "detached" });
  assert.equal(await briefCard(page).count(), cards, "no card from the saved company's run");
  assert.equal(await storedBrief(page), null, "and nothing stored on the next company");
  assert.equal(await bubbles(page, "err").count(), failures, "and no error for a run nobody waits for");
  assert.deepEqual(errors, []);
  await context.close();
});

test("flag off: no card and no call, the same flow as today", async () => {
  const off = await startServer();
  try {
    const { context, page, errors } = await openApp(browser, off.url, PHONE);
    const sent = researchRequests(page);
    const access = page.waitForResponse("**/api/access");
    await send(page, CODE);
    assert.equal((await (await access).json()).research, false);
    await bubbles(page, "coach").filter({ hasText: ko.chat.askMail.split("\n")[0] }).waitFor();
    await send(page, MAIL);
    await bubbles(page, "coach").filter({ hasText: ko.chat.askPick({ count: 10 }) }).waitFor();
    assert.equal(await page.locator("#log .brief").count(), 0);
    await send(page, "1");
    await page.fill("#input", ANSWER);
    await page.press("#input", "Control+Enter");
    await bubbles(page, "coach").filter({ hasText: ko.chat.askPickAgain }).waitFor();
    const [download] = await Promise.all([page.waitForEvent("download"), page.click("#end")]);
    assert.ok(!(await readFile(await download.path(), "utf8")).includes(ko.research.snapshot));
    assert.equal(sent.length, 0);
    assert.deepEqual(errors, []);
    await context.close();
  } finally {
    off.stop();
  }
});

test("flag off: a brief left in the session is kept for export but draws no card", async () => {
  const off = await startServer();
  try {
    const { context, page, errors } = await openApp(browser, off.url, PHONE);
    await toQuestions(page);
    await page.evaluate((b) => { const s = JSON.parse(localStorage.getItem("mensetsu-session")); s.company_context.research_brief = b; localStorage.setItem("mensetsu-session", JSON.stringify(s)); }, FULL);
    await page.reload();
    await page.locator(".msg.coach").first().waitFor();
    await send(page, CODE);
    await bubbles(page, "coach").filter({ hasText: ko.chat.askPickAgain }).waitFor();
    assert.equal(await page.locator("#log .brief").count(), 0);
    assert.equal((await storedBrief(page)).research_status, "ok");
    let body;
    await page.route("**/api/reverse", (r) => { body = r.request().postDataJSON(); return r.fulfill({ json: { questions: [] } }); });
    await page.getByRole("button", { name: ko.reverse.button }).click();
    await page.locator("#log > .msg.reverse").waitFor();
    assert.ok(!("brief" in body), "flag off sends what it sent before");
    assert.deepEqual(errors, []);
    await context.close();
  } finally {
    off.stop();
  }
});
