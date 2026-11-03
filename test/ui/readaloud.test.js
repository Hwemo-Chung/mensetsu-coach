// V3/V4 voice UI: a recording the recogniser could not make out is never put in the answer box (retry row), and reading
// the model script aloud gets a recognition-based check (public/readcheck.js) beside the speaker. Own file = own MOCK
// server, so the questions rate limit (10 per server) is not shared with voice.test.js. 0 Claude / 0 Gemini calls.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LANGS } from "../../public/i18n/index.js";
import { compareReading } from "../../public/readcheck.js";
import { scriptKana, scriptFixture } from "../fake-claude.js";
import { loadPack } from "../../lib/coach.js";
import { startServer, launch, openApp, bubbles, send, shot, noHorizontalOverflow, CODE, MAIL, ANSWER, VIEWPORTS, ROOT, scriptCard, toAnswer, toScript, ttsRequests, speechStub, micStub, TOUR, tourTo } from "./harness.js";

const ko = LANGS.ko;
let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); server?.stop(); });

// ---- V3: a recording the recogniser could not make out is not put in the answer box ----
test("V3: low-quality transcript → box untouched, coach row with a retry mic that records again; x-duration-ms sent (mobile)", async () => {
  const { context, page, errors } = await openApp(browser, server.url, VIEWPORTS.mobile);
  await context.addInitScript(micStub, {});
  await page.reload();
  await page.locator(".msg.coach").first().waitFor();
  const stt = [];
  await page.route("**/api/stt*", (r) => { stt.push(r.request()); return r.fulfill({ json: { text: "えー", quality: "low", reason: "too_short" } }); });
  await toAnswer(page);
  await page.fill("#input", "前置き");
  await page.getByRole("button", { name: ko.mic.start }).click();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: ko.mic.stop }).click();
  const row = bubbles(page, "coach").filter({ hasText: ko.mic.lowQuality });
  await row.waitFor({ timeout: 4000 });
  assert.equal(await page.inputValue("#input"), "前置き", "nothing appended");
  assert.equal(await page.locator("#send.ready").count(), 0);
  const ms = Number(stt[0].headers()["x-duration-ms"]);
  assert.ok(ms >= 200 && ms < 5000, `x-duration-ms ${ms}`);
  const retry = row.getByRole("button", { name: ko.mic.retry });
  assert.equal(await retry.locator('svg.icon > use[href="/icons.svg#mic"]').count(), 1);
  const b = await retry.boundingBox();
  assert.ok(b.height >= 44, `${b.width}x${b.height}`);
  assert.ok(await noHorizontalOverflow(page));
  await shot(page, "redesign-mobile-v3-retry", row);
  await retry.click();
  assert.equal(await page.getByRole("button", { name: ko.mic.stop }).getAttribute("aria-pressed"), "true", "retry starts a new recording");
  await page.getByRole("button", { name: ko.mic.stop }).click();
  await page.waitForFunction(() => document.querySelectorAll("#log > .msg.coach").length && !document.querySelector("#mic").disabled);
  assert.equal(stt.length, 2);
  assert.deepEqual(errors, []);
  await context.close();
});

// ---- V4: read the model script aloud → recognition-based pronunciation check (public/readcheck.js) ----
const readBtn = (card) => card.getByRole("button", { name: ko.read.start });
const SENTENCES = scriptFixture.text.split(/(?<=[。！？!?])/);
// Sentence 1 clean; sentence 2 several slips; sentence 3 drops すすめかたについて → ratio .86 with 8 spans.
const MISS_KANA = "はい、みつもりが ずれた ばあいわ、まず えいきょうはんいを かくにんし、かんけいしゃに はやめに きょうゆうします。ぜんそくでわ、おぐれを みっか いないに ほこくする るるを つくり、てまどりを にわり へらしました。おんしゃの やりかたも ぜひ うかがいますでしょか。";
async function readAloud(page, card) {
  await readBtn(card).click();
  const stop = card.getByRole("button", { name: ko.mic.stop });
  assert.equal(await stop.getAttribute("aria-pressed"), "true");
  await page.waitForTimeout(200);
  await stop.click();
}

test("V4 ok: read-aloud mic beside the speaker → /api/stt?kana=1 → 'read well' with check-circle, no details (MOCK fixture)", async () => {
  const fx = JSON.parse(JSON.parse(readFileSync(`${ROOT}/test/fixtures/stt-read.json`, "utf8")).candidates[0].content.parts[0].text);
  const r = compareReading(scriptKana, fx.kana);
  assert.ok(r.ok && r.ratio < 1 && r.spans.length, "fixture: passes with a little recogniser noise");
  const { context, page, errors } = await openApp(browser, server.url, VIEWPORTS.desktop);
  await context.addInitScript(micStub, {});
  await page.reload();
  await page.locator(".msg.coach").first().waitFor();
  const stt = [];
  page.on("request", (q) => { if (q.url().includes("/api/stt")) stt.push(q); });
  await toScript(page);
  const card = scriptCard(page);
  assert.equal(await card.locator(".readaloud").count(), 1, "the class the hidden test counts");
  const [m, l] = await Promise.all([readBtn(card).boundingBox(), card.locator(".listen").boundingBox()]);
  assert.ok(m.width >= 44 && m.height >= 44, `${m.width}x${m.height}`);
  assert.ok(Math.abs(m.y - l.y) < 4 && m.x + m.width <= l.x + 1 && l.x - (m.x + m.width) < 24, "next to the speaker");
  assert.equal(await readBtn(card).locator('svg.icon > use[href="/icons.svg#mic"]').count(), 1);
  await readAloud(page, card);
  const ok = card.locator(".read-result", { hasText: ko.read.ok({ pct: Math.round(r.ratio * 100) }) });
  await ok.waitFor({ timeout: 4000 });
  assert.equal(await ok.locator('svg.icon > use[href="/icons.svg#check"]').count(), 1);
  assert.equal(await card.locator(".read-diff").count(), 0, "noise is not shown when ok");
  assert.equal(await card.locator(".ja .miss").count(), 0);
  await card.getByText(ko.read.note).waitFor();
  const u = new URL(stt[0].url());
  assert.deepEqual([u.searchParams.get("pack"), u.searchParams.get("lang"), u.searchParams.get("kana")], ["jp", "ko", "1"]);
  assert.ok(Number(stt[0].headers()["x-duration-ms"]) >= 100);
  assert.equal(await page.inputValue("#input"), "", "read-aloud never fills the answer box");
  await shot(page, "redesign-desktop-v4-ok", card);
  assert.deepEqual(errors, []);
  await context.close();
});

test("V4 mismatch: ratio, wavy underline on the wrong sentences, ≤3 'heard → expected' lines, listen-this-part, slow retry", async () => {
  for (const vp of ["desktop", "mobile"]) {
    const { context, page, errors } = await openApp(browser, server.url, VIEWPORTS[vp]);
    await context.addInitScript(micStub, {});
    await context.addInitScript(speechStub, ["Kyoko"]);
    await page.reload();
    await page.locator(".msg.coach").first().waitFor();
    await page.route("**/api/stt*", (q) => q.fulfill({ json: { text: "x", quality: "ok", kana: MISS_KANA } }));
    await toScript(page);
    const card = scriptCard(page);
    const full = await card.locator(".ja").first().textContent();
    await readAloud(page, card);
    const r = compareReading(scriptKana, MISS_KANA);
    await card.locator(".read-result", { hasText: ko.read.miss({ pct: Math.round(r.ratio * 100) }) }).waitFor({ timeout: 4000 });
    assert.equal(await card.locator(".read-result svg.icon > use[href=\"/icons.svg#x\"]").count(), 1);
    assert.equal(await card.locator(".ja").first().textContent(), full, "the script text itself is unchanged");
    assert.deepEqual(await card.locator(".ja .miss").allTextContents(), [SENTENCES[1], SENTENCES[2]], "sentences 2 and 3 underlined, not 1");
    assert.match(await card.locator(".ja .miss").first().evaluate((e) => getComputedStyle(e).textDecorationLine), /underline/);
    const diffs = card.locator(".read-diff");
    assert.equal(await diffs.count(), 3, `${r.spans.length} spans → 3 lines`);
    assert.ok((await diffs.first().textContent()).includes(ko.read.diff({ heard: ko.read.none, expected: "すすめかたについて" })), "the biggest slip first");
    await card.getByText(ko.read.note).waitFor();
    assert.ok(await noHorizontalOverflow(page));
    await shot(page, `redesign-${vp}-v4-mismatch`, card);
    if (vp === "desktop") {
      // Listen to just that sentence: device voice, one utterance, no extra cloud TTS request.
      const tts = ttsRequests(page);
      await diffs.first().getByRole("button", { name: ko.read.listen }).click();
      await page.waitForFunction(() => window.__spoken.length > 0);
      assert.deepEqual(await page.evaluate(() => window.__spoken.map((s) => [s.text, s.voice])), [[SENTENCES[2], "Kyoko"]]);
      assert.equal(tts.length, 0);
      await card.getByRole("button", { name: ko.read.again }).click();
      assert.equal(await card.getByRole("button", { name: ko.mic.stop }).getAttribute("aria-pressed"), "true", "slow retry records again");
      await card.getByRole("button", { name: ko.mic.stop }).click();
      await card.locator(".read-result", { hasText: ko.read.miss({ pct: Math.round(r.ratio * 100) }) }).waitFor({ timeout: 4000 });
      assert.equal(await card.locator(".ja .miss").count(), 2, "underlines redrawn, not doubled");
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
});

test("V4: no kana in the transcript → ask to read again, no ratio or details", async () => {
  const { context, page, errors } = await openApp(browser, server.url, VIEWPORTS.desktop);
  await context.addInitScript(micStub, {});
  await page.reload();
  await page.locator(".msg.coach").first().waitFor();
  await page.route("**/api/stt*", (q) => q.fulfill({ json: { text: "はい", quality: "ok", verbatim: false } }));
  await toScript(page);
  const card = scriptCard(page);
  await readAloud(page, card);
  await card.locator(".read-result", { hasText: ko.read.retry }).waitFor({ timeout: 4000 });
  assert.equal(await card.locator(".read-diff, .ja .miss").count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test("V4 hidden: same-language screen (jp + ja), KR pack, demo/tutorial replay", async () => {
  // jp + Japanese screen: the server sends no reading, so no kana to compare with.
  {
    const { context, page, errors } = await openApp(browser, server.url, VIEWPORTS.desktop, "ja");
    const ja = LANGS.ja;
    // The MOCK script fixture is ko-explained (the ja gate rejects it); answer like the server does for jp + ja: no reading/kana.
    await page.route("**/api/script", (route) => route.fulfill({ json: { text: scriptFixture.text, points: ["結論から話します。"] } }));
    await send(page, CODE);
    await bubbles(page, "coach").filter({ hasText: ja.chat.askMail.split("\n")[0] }).waitFor();
    await send(page, MAIL);
    await bubbles(page, "coach").filter({ hasText: ja.chat.askPick({ count: 10 }) }).waitFor();
    await send(page, "1");
    await page.fill("#input", ANSWER);
    await page.press("#input", "Control+Enter");
    await scriptCard(page).getByRole("button", { name: ja.tts.play }).waitFor();
    assert.equal(await page.locator(".readaloud").count(), 0);
    assert.deepEqual(errors, []);
    await context.close();
  }
  // KR beta: Korean target, no hiragana reading.
  {
    const { context, page, errors } = await openApp(browser, server.url, VIEWPORTS.desktop);
    await page.selectOption("#dest", "kr");
    const kr = loadPack("kr");
    await page.route("**/api/questions", (route) => route.fulfill({ json: {
      pack: { id: "kr", target: "ko", steps: kr.answer_structure.steps.map(({ key, label }) => ({ key, label })) },
      company_context: { company: "〇〇주식회사", position: "백엔드 개발자", facts: ["결제 시스템 이전"] },
      questions: Array.from({ length: 10 }, (_, i) => ({ id: `q${i + 1}`, stage: kr.question_taxonomy.stages[0], category: kr.question_taxonomy.categories[i % 5], question: `질문 ${i + 1}`, basis: "결제 시스템 이전" })),
      specificity: { referenced: 7, required: 6, passed: true },
    } }));
    await page.route("**/api/script", (route) => route.fulfill({ json: { text: "네, 먼저 영향 범위를 확인합니다.", points: ["결론부터 말합니다."] } }));
    await send(page, CODE);
    await bubbles(page, "coach").filter({ hasText: ko.chat.askMail.split("\n")[0] }).waitFor();
    await send(page, MAIL);
    await bubbles(page, "coach").filter({ hasText: ko.chat.askPick({ count: 10 }) }).waitFor();
    await send(page, "1");
    await page.fill("#input", "네, 답변입니다.");
    await page.press("#input", "Control+Enter");
    await scriptCard(page).getByRole("button", { name: ko.tts.play }).waitFor();
    assert.equal(await page.locator(".readaloud").count(), 0);
    assert.deepEqual(errors, []);
    await context.close();
  }
  // Demo / tutorial replay: 0 AI calls, so neither listen nor read-aloud.
  {
    const { context, page, errors } = await openApp(browser, server.url, VIEWPORTS.desktop);
    await page.evaluate(() => localStorage.setItem("mensetsu-tour-tips", "1"));
    await page.getByRole("button", { name: ko.demo.button }).click();
    await tourTo(page, TOUR.script); // 9-step tour (11/03)
    await scriptCard(page).waitFor();
    assert.equal(await page.locator(".readaloud").count(), 0);
    assert.deepEqual(errors, []);
    await context.close();
  }
});
