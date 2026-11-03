// Main practice flow in a real browser, at phone and desktop width. Guards the current UI before layout/refactor work.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { LANGS } from "../../public/i18n/index.js";
import { fixture } from "../fake-claude.js";
import { startServer, launch, openApp, bubbles, send, shot, noHorizontalOverflow, CODE, MAIL, ANSWER, VIEWPORTS } from "./harness.js";

const t = LANGS.ko;
let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); server?.stop(); });

for (const [vp, viewport] of Object.entries(VIEWPORTS)) {
  test(`main flow (${vp} ${viewport.width}x${viewport.height})`, async () => {
    const { context, page, errors } = await openApp(browser, server.url, viewport);
    const fits = async (where) => assert.ok(await noHorizontalOverflow(page), `horizontal overflow at ${where}`);
    await shot(page, `${vp}-01-code`);
    await fits("code");

    // (1) wrong code → error sentence and the code prompt again; right code → mail stage.
    await send(page, "wrong-code");
    await bubbles(page, "err").filter({ hasText: t.errors.access_denied() }).waitFor();
    assert.equal(await bubbles(page, "coach").filter({ hasText: t.chat.askCode }).count(), 2);
    await send(page, CODE);
    await bubbles(page, "coach").filter({ hasText: t.chat.askMail.split("\n")[0] }).waitFor();
    assert.equal(await page.getAttribute("#input", "placeholder"), t.chat.mailPlaceholder);

    // (2) mail → 10 questions with stage/category tags.
    await send(page, MAIL);
    await bubbles(page, "coach").filter({ hasText: t.chat.askPick({ count: 10 }) }).waitFor();
    assert.equal(await page.locator("#log .q").count(), 10);
    assert.equal(fixture.questions.length, 10);
    await page.locator("#log .q").first().getByText(fixture.questions[0].question, { exact: false }).waitFor();
    await shot(page, `${vp}-02-questions`, page.locator("#log .q").first());
    await fits("questions");

    // (3) pick → answer. Enter alone inserts a newline; Ctrl+Enter sends.
    await send(page, "1");
    await bubbles(page, "coach").filter({ hasText: `Q1. ${fixture.questions[0].question}` }).waitFor();
    const mine = await bubbles(page, "me").count();
    await page.fill("#input", "");
    await page.locator("#input").pressSequentially("line1");
    await page.press("#input", "Enter");
    await page.locator("#input").pressSequentially("line2");
    assert.equal(await page.inputValue("#input"), "line1\nline2");
    assert.equal(await bubbles(page, "me").count(), mine, "Enter must not send");
    await page.fill("#input", ANSWER);
    await page.press("#input", "Control+Enter");
    const review = page.locator("#log > .msg.review");
    const script = page.locator("#log > .msg.script:not(.review):not(.reverse)");
    await review.waitFor();
    await script.waitFor();
    // F3: review.json marks all four steps missing.
    // Intent unchanged (each missing step is flagged); the ✗ glyph became the x-circle sprite icon (ICON-DUOTONE §4).
    for (const s of ["復唱", "結論", "基準・数字", "選択肢"]) await review.locator(".step.miss", { hasText: s }).locator('svg.icon > use[href="/icons.svg#x"]').waitFor();
    // F4: the correction quoting the answer stays; the one not in the answer (del-chanto) is dropped by the gate.
    await review.locator(".rule", { hasText: "【str-ketsuron】" }).waitFor();
    assert.equal(await review.locator(".rule", { hasText: "del-chanto" }).count(), 0);
    for (const label of [t.script.title, t.script.text.ja, t.script.reading.ja, t.script.points]) await script.getByText(label, { exact: true }).waitFor();
    await bubbles(page, "coach").filter({ hasText: t.habits.title({ n: 1 }) }).waitFor();
    await shot(page, `${vp}-03-review`, review);
    await fits("review");

    // (4) second answer (Cmd+Enter) → habits line counts the repeated rule as a habit (F9).
    await bubbles(page, "coach").filter({ hasText: t.chat.askPickAgain }).last().waitFor();
    await send(page, "2");
    await bubbles(page, "coach").filter({ hasText: `Q2. ${fixture.questions[1].question}` }).waitFor();
    await page.fill("#input", ANSWER);
    await page.press("#input", "Meta+Enter");
    const habits = bubbles(page, "coach").filter({ hasText: t.habits.title({ n: 2 }) });
    await habits.waitFor();
    // Intent unchanged (the repeated rule is marked as a habit); the ⚠ glyph became the warning sprite icon.
    await habits.locator(".habit", { hasText: t.habits.times({ c: 2 }) }).locator('svg.icon > use[href="/icons.svg#warning"]').waitFor();

    // F10: reverse questions from the offer under the question list.
    await page.getByRole("button", { name: t.reverse.button }).click();
    const reverse = page.locator("#log > .msg.reverse");
    await reverse.waitFor();
    assert.equal(await reverse.locator(".ja").count(), 3);
    await shot(page, `${vp}-04-reverse`, reverse);
    await fits("reverse");

    // (5) finish & save → Markdown download containing the practiced question, then the tip-mail dialog.
    const [download] = await Promise.all([page.waitForEvent("download"), page.click("#end")]);
    assert.match(download.suggestedFilename(), /^mensetsu-\d{4}-\d{2}-\d{2}\.md$/);
    const md = await readFile(await download.path(), "utf8");
    assert.ok(md.includes(fixture.questions[0].question), "export contains the question");
    assert.ok(md.includes(ANSWER) && md.includes("【str-ketsuron】") && md.includes(t.reverse.title));
    assert.ok(!md.includes("sample@example.com"), "export masks emails");
    await page.locator("#mail[open]").waitFor();
    await shot(page, `${vp}-05-saved`);
    await page.click("#mailLater");
    await bubbles(page, "coach").filter({ hasText: download.suggestedFilename() }).waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem("mensetsu-session")), null, "session cleared after save");

    assert.deepEqual(errors, []);
    await context.close();
  });
}
