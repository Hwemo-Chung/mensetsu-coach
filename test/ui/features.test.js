// Features on top of the layout: REL-4 restore, F7 lines, before/after compare, notes, KR beta. MOCK server, 0 tokens.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { LANGS } from "../../public/i18n/index.js";
import { countSpecific, loadPack } from "../../lib/coach.js";
import { fixture } from "../fake-claude.js";
import { startServer, launch, openApp, bubbles, send, shot, noHorizontalOverflow, CODE, MAIL, ANSWER, VIEWPORTS } from "./harness.js";

const ko = LANGS.ko;
let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); server?.stop(); });

const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("mensetsu-session")));
async function toQuestions(page) {
  await send(page, CODE);
  await bubbles(page, "coach").filter({ hasText: ko.chat.askMail.split("\n")[0] }).waitFor();
  await send(page, MAIL);
  await bubbles(page, "coach").filter({ hasText: ko.chat.askPick({ count: 10 }) }).waitFor();
}
// Pick question n and answer it; resolves when the next "pick again" prompt is on screen.
async function answer(page, n) {
  const again = bubbles(page, "coach").filter({ hasText: ko.chat.askPickAgain });
  const before = await again.count();
  await send(page, String(n));
  await page.fill("#input", ANSWER);
  await page.press("#input", "Control+Enter");
  await again.nth(before).waitFor();
}

test("F7 lines, before/after compare after two answers to one question, notes saved and exported (desktop)", async () => {
  const { context, page, errors } = await openApp(browser, server.url, VIEWPORTS.desktop);
  await toQuestions(page);
  // F7: specificity is always shown on the question card, computed the same way as the server gate.
  const n = countSpecific(fixture.questions, MAIL, loadPack("jp").question_taxonomy.generic_terms);
  await bubbles(page, "coach").locator(".legend", { hasText: ko.chat.specificity({ n, total: 10 }) }).waitFor();

  await answer(page, 1);
  // The mock review has one correction whose `before` is not in the answer (del-chanto): the gate drops it.
  // Intent changed 11/04 (UIUX §11.3): desktop shows the review details (incl. the F7 line) in the panel only.
  await page.locator("#reviewBox > .review .legend", { hasText: ko.review.dropped({ n: 1 }) }).waitFor();
  assert.equal(await page.locator("#log > .msg.compare").count(), 0, "one attempt: no compare yet");

  await answer(page, 1);
  const cmp = page.locator("#log > .msg.compare");
  assert.equal(await cmp.count(), 1);
  assert.equal(await cmp.locator(".title").textContent(), ko.compare.title({ n: "1" }));
  assert.equal(await cmp.locator("tbody tr").count(), 5, "answered + 4 steps");
  assert.equal(await page.locator("#log > .msg.review").count(), 2, "compare is not a review bubble");
  // Intent changed 11/04 (layout check): first | latest sit side by side only when the card is ≥560px wide. The
  // 3-column dashboard's chat column is narrower (two columns held ~10 characters a line), so the chat copy stacks and
  // the wide panel copy (④) shows them side by side.
  const [a, b] = await Promise.all([0, 1].map((i) => cmp.locator(".cmp-answer").nth(i).boundingBox()));
  assert.ok(b.y > a.y + a.height - 1, "desktop chat column: answers stacked");
  const pc = page.locator("#reviewBox .compare");
  const [pa, pb] = await Promise.all([0, 1].map((i) => pc.locator(".cmp-answer").nth(i).boundingBox()));
  assert.ok(pb.x > pa.x && Math.abs(pa.y - pb.y) < 2, "desktop panel: answers side by side");
  // Panel (open by default on desktop). Intent changed (layout B, 11/03): the pane is one document ① ② ③ ④, so the
  // compare section is now the last one (④) instead of sitting above the review.
  await page.locator("#reviewBox > .compare:last-child").waitFor();
  assert.ok(await noHorizontalOverflow(page));
  await shot(page, "desktop-10-compare", cmp);

  // Notes: per question, saved, exported under that question, gone after finishing.
  await page.click("#tabNotes");
  assert.equal(await page.textContent("#noteLabel"), ko.notes.title({ n: "1" }));
  await page.fill("#note", "復唱 먼저!\n숫자: 3개월 → 2개월");
  await page.locator("#noteStatus", { hasText: ko.notes.saved }).waitFor();
  assert.equal((await stored(page)).notes.q1, "復唱 먼저!\n숫자: 3개월 → 2개월");
  const mine = await bubbles(page, "me").count();
  await page.keyboard.press("Enter"); // Enter in the memo is a newline, never a send
  assert.equal(await bubbles(page, "me").count(), mine);
  await shot(page, "desktop-11-notes");
  const [download] = await Promise.all([page.waitForEvent("download"), page.click("#end")]);
  const md = await readFile(await download.path(), "utf8");
  const q1 = md.indexOf(fixture.questions[0].question), memo = md.indexOf(`${ko.export.notes}: 復唱 먼저!\n     숫자`);
  assert.ok(q1 > 0 && memo > q1 && memo < md.indexOf(fixture.questions[1].question), "memo exported under Q1");
  await page.click("#mailLater");
  assert.equal(await stored(page), null);
  assert.equal(await page.locator("#noteBox").isHidden(), true, "notes cleared with the session");
  assert.deepEqual(errors, []);
  await context.close();
});

test("REL-4: reload → code → session restored with notice; answers continue; [Save & start over] downloads then clears (mobile)", async () => {
  const { context, page, errors } = await openApp(browser, server.url, VIEWPORTS.mobile);
  await toQuestions(page);
  await answer(page, 1);
  await page.reload();
  await bubbles(page, "coach").filter({ hasText: ko.chat.askCode }).waitFor();
  assert.equal(await page.locator("#log .q").count(), 0, "nothing restored before the code check");
  await send(page, CODE);
  const notice = bubbles(page, "coach").filter({ hasText: ko.chat.restored({ q: 10, a: 1 }) });
  await notice.waitFor();
  assert.equal(await page.locator("#log .q").count(), 10);
  await page.locator("#log .legend", { hasText: "資料参照" }).waitFor();
  await bubbles(page, "coach").filter({ hasText: ko.chat.askPickAgain }).waitFor();
  assert.equal(await page.getByRole("button", { name: ko.chat.profileButton }).count(), 0, "no mail kept: no career-line offer");
  assert.equal(await notice.getByRole("button", { name: ko.reverse.button }).count(), 1);
  assert.equal(await page.locator("#panelToggle").isVisible(), true);
  assert.equal(await page.locator("#panel").isHidden(), true, "mobile: restored review does not open the overlay");
  await shot(page, "mobile-10-restored", notice);

  // The restored attempt counts: a second answer to Q1 brings the compare view, stacked on a phone.
  await answer(page, 1);
  const cmp = page.locator("#log > .msg.compare");
  const [a, b] = await Promise.all([0, 1].map((i) => cmp.locator(".cmp-answer").nth(i).boundingBox()));
  assert.ok(b.y > a.y + a.height - 1, "mobile: answers stacked");
  assert.ok(await noHorizontalOverflow(page));
  await shot(page, "mobile-11-compare", cmp);

  const [download] = await Promise.all([page.waitForEvent("download"), notice.getByRole("button", { name: ko.chat.restoreNew }).click()]);
  assert.ok((await readFile(await download.path(), "utf8")).includes(ANSWER));
  await page.click("#mailLater");
  assert.equal(await stored(page), null, "cleared after the download");
  assert.deepEqual(errors, []);
  await context.close();
});

test("REL-4: old field names migrate, broken data goes to the mail step, a failing setItem does not break paid results", async () => {
  const { context, page, errors } = await openApp(browser, server.url, VIEWPORTS.desktop);
  const old = { company_context: { company: "〇〇株式会社", position: "SE", facts: [] }, questions: [{ id: "q1", stage: "一次面接", category: "技術", question_ja: "移行で難しかった点は？", question_tr: "이행에서 어려웠던 점은?", basis: "b" }], attempts: [] };
  await page.evaluate((s) => localStorage.setItem("mensetsu-session", JSON.stringify(s)), old);
  await page.reload();
  await send(page, CODE);
  await bubbles(page, "coach").filter({ hasText: ko.chat.restored({ q: 1, a: 0 }) }).waitFor();
  await page.locator("#log .q", { hasText: "移行で難しかった点は？" }).waitFor();
  assert.equal((await page.textContent("#log")).includes("undefined"), false);
  assert.equal((await stored(page))?.version ?? null, null, "restoring alone does not rewrite storage");

  await page.evaluate(() => localStorage.setItem("mensetsu-session", "{"));
  await page.reload();
  await send(page, CODE);
  await bubbles(page, "coach").filter({ hasText: ko.chat.askMail.split("\n")[0] }).waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem("mensetsu-session")), null, "broken session removed");

  // Storage full: questions, review and script still show; only the memo says it could not be saved.
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException("full", "QuotaExceededError"); }; });
  await send(page, MAIL);
  await bubbles(page, "coach").filter({ hasText: ko.chat.askPick({ count: 10 }) }).waitFor();
  await answer(page, 2);
  assert.equal(await page.locator("#log > .msg.review").count(), 1);
  assert.equal(await page.locator("#log > .msg.script:not(.review):not(.reverse)").count(), 1);
  assert.equal(await page.locator("#log > .msg.err").count(), 0, "no error bubble for a storage failure");
  await page.click("#tabNotes");
  await page.fill("#note", "x");
  await page.locator("#noteStatus", { hasText: ko.notes.saveFailed }).waitFor();
  assert.deepEqual(errors, []);
  await context.close();
});

test("KR beta: listed in every UI language; questions request carries pack kr; no reverse-question button", async () => {
  const { context, page, errors } = await openApp(browser, server.url, VIEWPORTS.desktop);
  for (const l of ["en", "ja", "ko"]) {
    await page.selectOption("#lang", l); // nothing to lose yet: no dialog
    assert.equal(await page.locator("#dest option[value=kr]").textContent(), `${LANGS[l].dest.kr} · ${LANGS[l].dest.beta}`);
  }
  await page.selectOption("#dest", "kr");
  const demand = [];
  page.on("request", (r) => { if (r.url().endsWith("/api/demand")) demand.push(r.postDataJSON()); });
  let body;
  // The MOCK fixture is Japanese, which the kr target-language gate rejects; answer with a Korean set instead.
  await page.route("**/api/questions", async (route) => {
    body = route.request().postDataJSON();
    const kr = loadPack("kr");
    await route.fulfill({ json: {
      pack: { id: "kr", target: "ko", steps: kr.answer_structure.steps.map(({ key, label }) => ({ key, label })) },
      company_context: { company: "〇〇주식회사", position: "백엔드 개발자", facts: ["결제 시스템 이전"] },
      questions: Array.from({ length: 10 }, (_, i) => ({ id: `q${i + 1}`, stage: kr.question_taxonomy.stages[0], category: kr.question_taxonomy.categories[i % 5], question: `입사 후 ${i + 1}개월 안에 맡고 싶은 일은?`, basis: "결제 시스템 이전" })),
      specificity: { referenced: 7, required: 6, passed: true },
    } });
  });
  await toQuestions(page);
  assert.equal(body.pack, "kr");
  assert.equal(body.lang, "ko");
  assert.equal(await page.getByRole("button", { name: ko.chat.profileButton }).count(), 1);
  assert.equal(await page.getByRole("button", { name: ko.reverse.button }).count(), 0, "reverse questions are JP-only");
  await send(page, "1");
  await bubbles(page, "coach").filter({ hasText: ko.chat.askAnswer.ko }).waitFor();
  await shot(page, "desktop-12-kr");
  assert.deepEqual(demand, [], "KR is open: no demand count");
  await page.selectOption("#dest", "anglo"); // still unavailable: counted, select snaps back
  await page.waitForFunction(() => document.querySelector("#dest").value === "kr");
  await page.waitForTimeout(100);
  assert.deepEqual(demand, [{ target: "anglo" }]);
  assert.deepEqual(errors, []);
  await context.close();
});
