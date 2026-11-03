// Voice UI (UIUX-SPEC §9): 🔊 on the model script (one /api/tts call per script, streamed, read-along highlight,
// device-voice fallback), 🎤 left of Send in the pill bar (record → in-browser Whisper → answer box, never auto-sent), three-dot loader.
// MOCK server: TTS = ~3 s of silence streamed in 6 chunks, 🎤 = test/fixtures/stt-local.mock.js. 0 Claude / 0 Gemini calls.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { LANGS } from "../../public/i18n/index.js";
import { startServer, launch, openApp, bubbles, send, shot, noHorizontalOverflow, CODE, MAIL, ANSWER, VIEWPORTS, ROOT, scriptCard, toAnswer, toScript, ttsRequests, speechStub, micStub, TOUR, tourTo } from "./harness.js";

const ko = LANGS.ko;
import { MOCK_TEXT as STT_TEXT } from "../fixtures/stt-local.mock.js";
let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); server?.stop(); });

const readState = (card) => card.evaluate((c) => {
  const p = c.querySelector(".ja"), r = p.querySelector(".read");
  const cs = r && getComputedStyle(r);
  return { full: p.textContent, read: r?.textContent ?? null, color: cs?.color, weight: cs?.fontWeight };
});

test("🔊 streams the whole script in ONE request, highlights the read part in green bold, tap again stops (desktop)", async () => {
  const { context, page, errors } = await openApp(browser, server.url, VIEWPORTS.desktop);
  const reqs = ttsRequests(page);
  await toScript(page);
  const card = scriptCard(page);
  const btn = card.getByRole("button", { name: ko.tts.play });
  assert.equal(await btn.getAttribute("aria-pressed"), "false");
  // Top-right of the card, 44px.
  const [c, b] = await Promise.all([card.boundingBox(), btn.boundingBox()]);
  assert.ok(b.width >= 44 && b.height >= 44, `${b.width}x${b.height}`);
  assert.ok(c.x + c.width - (b.x + b.width) < 20 && b.y - c.y < 20, "button sits at the top-right corner");

  await btn.click();
  const stop = card.getByRole("button", { name: ko.tts.stop });
  assert.equal(await stop.getAttribute("aria-pressed"), "true");
  await page.waitForFunction(() => { const r = document.querySelector(".msg.script .ja .read"); return r && r.textContent.length > 0 && r.textContent.length < r.parentElement.textContent.length; }, null, { timeout: 4000 });
  const mid = await readState(card);
  assert.equal(mid.color, "rgb(4, 122, 53)");
  assert.equal(mid.weight, "700");
  assert.ok(mid.full.startsWith(mid.read), "the highlighted part is a prefix of the script");
  await page.waitForFunction(() => { const r = document.querySelector(".msg.script .ja .read"); return r && r.textContent.length * 3 > r.parentElement.textContent.length; }, null, { timeout: 4000 });
  await shot(page, "desktop-21-tts-highlight", card);

  assert.equal(reqs.length, 1, "one request per script, not per sentence");
  const body = reqs[0].postDataJSON();
  assert.equal(body.text, mid.full, "the whole script text is sent");
  assert.deepEqual([body.voice, body.pack], ["Kore", "jp"]);
  assert.ok(reqs[0].headers()["x-access-code"]);

  // Monotonic progress, then the end restores the plain card.
  const later = await page.waitForFunction((n) => (document.querySelector(".msg.script .ja .read")?.textContent.length ?? 0) > n, mid.read.length, { timeout: 4000 });
  assert.ok(later);
  await card.getByRole("button", { name: ko.tts.play }).waitFor({ timeout: 6000 });
  assert.equal((await readState(card)).read, null, "highlight removed after the end");

  // Replay comes from the browser's copy (free tier ≈ 3 TTS requests/min); tapping again mid-read stops.
  await card.getByRole("button", { name: ko.tts.play }).click();
  await page.waitForFunction(() => (document.querySelector(".msg.script .ja .read")?.textContent.length ?? 0) > 0, null, { timeout: 4000 });
  await card.getByRole("button", { name: ko.tts.stop }).click();
  assert.equal(await card.getByRole("button", { name: ko.tts.play }).getAttribute("aria-pressed"), "false");
  assert.equal((await readState(card)).read, null);
  assert.equal(reqs.length, 1, "replay made no second request");
  assert.equal(await card.locator(".tts-note").count(), 0, "cloud voice: no device-voice line");
  assert.deepEqual(errors, []);
  await context.close();
});

test("reduced motion: the highlight moves by whole sentences", async () => {
  const { context, page, errors } = await openApp(browser, server.url, VIEWPORTS.desktop);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await toScript(page);
  const card = scriptCard(page);
  await card.getByRole("button", { name: ko.tts.play }).click();
  await page.waitForFunction(() => (document.querySelector(".msg.script .ja .read")?.textContent.length ?? 0) > 0, null, { timeout: 4000 });
  const s = await readState(card);
  assert.ok(s.read === s.full || /[。！？!?]$/.test(s.read), `ends at a sentence end: ${s.read}`);
  await card.getByRole("button", { name: ko.tts.stop }).click();
  assert.deepEqual(errors, []);
  await context.close();
});

test("⚙ options: voice Kore/Charon and speed 0.8/1.0/1.2 are kept and used for the next request", async () => {
  const { context, page, errors } = await openApp(browser, server.url, VIEWPORTS.desktop);
  const reqs = ttsRequests(page);
  await page.click("#opts");
  const dlg = page.locator("#options");
  await dlg.getByLabel(ko.opts.voiceCharon).check();
  await dlg.getByLabel(ko.opts.speed).selectOption("1.2");
  assert.deepEqual(await dlg.getByLabel(ko.opts.speed).evaluate((s) => [...s.options].map((o) => o.value)), ["0.8", "1", "1.2"]);
  await dlg.getByText(ko.opts.speedHint).waitFor();
  await shot(page, "desktop-22-options-voice", dlg);
  await page.keyboard.press("Escape");
  assert.deepEqual(await page.evaluate(() => [localStorage.getItem("mensetsu-tts-voice"), localStorage.getItem("mensetsu-tts-speed")]), ["Charon", "1.2"]);
  await page.reload();
  await page.click("#opts");
  assert.ok(await page.locator("#options").getByLabel(ko.opts.voiceCharon).isChecked(), "kept after reload");
  await page.keyboard.press("Escape");
  await toScript(page);
  await scriptCard(page).getByRole("button", { name: ko.tts.play }).click();
  await scriptCard(page).getByRole("button", { name: ko.tts.stop }).waitFor();
  assert.equal(reqs.at(-1).postDataJSON().voice, "Charon");
  await scriptCard(page).getByRole("button", { name: ko.tts.stop }).click();
  assert.deepEqual(errors, []);
  await context.close();
});

test("cloud TTS busy → device voice from the allow-list only (Kyoko), one line under the card; none allowed → cannot-play line", async () => {
  for (const [names, line] of [[["Eddy", "Kyoko"], ko.tts.device], [["Eddy", "Grandma"], ko.tts.noVoice]]) {
    const { context, page, errors } = await openApp(browser, server.url, VIEWPORTS.desktop);
    await context.addInitScript(speechStub, names);
    await page.reload();
    await page.route("**/api/tts", (r) => r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "tts_busy" }) }));
    await page.locator(".msg.coach").first().waitFor();
    await toScript(page);
    const card = scriptCard(page);
    await card.getByRole("button", { name: ko.tts.play }).click();
    await page.locator(".tts-note", { hasText: line }).waitFor({ timeout: 4000 });
    const spoken = await page.evaluate(() => window.__spoken);
    if (line === ko.tts.device) {
      assert.ok(spoken.length >= 1 && spoken.every((s) => s.voice === "Kyoko"), JSON.stringify(spoken));
      await page.waitForFunction(() => (document.querySelector(".msg.script .ja .read")?.textContent.length ?? 0) > 0, null, { timeout: 2000 });
      // One utterance per sentence (Google 日本語 cuts long utterances); all of them, in order, make the script.
      await card.getByRole("button", { name: ko.tts.play }).waitFor({ timeout: 5000 });
      const all = await page.evaluate(() => window.__spoken.map((s) => s.text).join(""));
      assert.equal(all, (await readState(card)).full);
    } else {
      assert.equal(spoken.length, 0, "never reads with a rejected voice");
      assert.equal(await card.getByRole("button", { name: ko.tts.play }).getAttribute("aria-pressed"), "false");
    }
    assert.equal(await page.locator(".tts-note").count(), 1, "one line only");
    assert.deepEqual(errors, []);
    await context.close();
  }
});

// Intent changed 11/03 (user decision): the tutorial shows 🔊 too, reading with the device voice — still 0 AI calls.
test("tutorial 🔊 reads with the device voice: no /api/tts request", async () => {
  const { context, page, errors } = await openApp(browser, server.url, VIEWPORTS.desktop);
  const reqs = ttsRequests(page);
  await page.getByRole("button", { name: ko.demo.button }).click();
  await tourTo(page, TOUR.script);
  await scriptCard(page).waitFor();
  const listen = page.locator(".spot .listen");
  await listen.click();
  await page.waitForTimeout(500);
  assert.equal(reqs.length, 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test("🎤 beside Send at the answer stage only: record → timer → stop → in-browser transcript in the box, never sent, audio never uploaded (mobile)", async () => {
  const { context, page, errors } = await openApp(browser, server.url, VIEWPORTS.mobile);
  await context.addInitScript(micStub, {});
  await page.reload();
  await page.locator(".msg.coach").first().waitFor();
  assert.ok(await page.locator("#mic").isHidden(), "code stage: no mic");
  const stt = [];
  page.on("request", (r) => { if (r.url().includes("/api/stt")) stt.push(r); });
  await toAnswer(page);
  const mic = page.getByRole("button", { name: ko.mic.start });
  const [m, s] = await Promise.all([mic.boundingBox(), page.locator("#send").boundingBox()]);
  assert.ok(m.width >= 44 && m.height >= 44, `${m.width}x${m.height}`);
  // Intent changed 11/03 (UIUX §11): was "🎤 stacked above a tall Send"; the composer is now one pill row, 🎤 just left of Send.
  assert.ok(Math.abs((m.y + m.height / 2) - (s.y + s.height / 2)) <= 2 && m.x + m.width <= s.x + 1 && s.x - (m.x + m.width) <= 8, "same row, left of Send");
  assert.equal(await mic.getAttribute("aria-pressed"), "false");

  await page.fill("#input", "前置き");
  const me = await bubbles(page, "me").count();
  await mic.click();
  const stopBtn = page.getByRole("button", { name: ko.mic.stop });
  assert.equal(await stopBtn.getAttribute("aria-pressed"), "true");
  // ● glyph → record sprite icon in front of the timer (ICON-DUOTONE §4); the timer itself is still checked.
  await page.locator("#micStatus", { hasText: /^0:01$/ }).locator('svg.icon > use[href="/icons.svg#record"]').waitFor({ timeout: 3000 });
  assert.equal(await page.locator("#micStatus").getAttribute("aria-live"), "polite");
  // Intent unchanged (recording is visibly red); the redesign drops the box, so the red is the icon colour, not a border.
  assert.equal(await stopBtn.evaluate((b) => getComputedStyle(b).color), "rgb(176, 0, 32)", "red stop icon while recording");
  assert.ok(await noHorizontalOverflow(page));
  await shot(page, "mobile-23-mic-recording");

  await stopBtn.click();
  await page.locator("#micStatus", { hasText: ko.mic.hint }).waitFor({ timeout: 4000 });
  assert.equal(await page.inputValue("#input"), `前置き\n${STT_TEXT}`, "appended to what was typed");
  assert.equal(await page.evaluate(() => document.activeElement.id), "input");
  assert.ok(await page.locator("#send.ready").count(), "Send is highlighted");
  assert.equal(await bubbles(page, "me").count(), me, "not sent automatically");
  assert.equal(stt.length, 0, "the answer audio stays in the browser");
  // Recognised in the pack's interview language (jp → ja), whatever the screen language (ko).
  const calls = await page.evaluate(() => window.__sttCalls);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].lang, "ja");
  assert.match(calls[0].type, /^audio\/webm/);
  assert.ok(await page.evaluate(() => window.__mic.stopped > 0), "microphone released");
  await shot(page, "mobile-24-mic-transcribed");

  await page.press("#input", "Control+Enter");
  await bubbles(page, "me").nth(me).waitFor();
  assert.ok(await page.locator("#micStatus").isHidden(), "hint goes away once sent");
  assert.equal(await page.locator("#send.ready").count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test("🎤 unsupported or permission denied: dimmed, one line on tap", async () => {
  for (const [opt, line] of [[{ unsupported: true }, ko.mic.unsupported], [{ denied: true }, ko.mic.denied]]) {
    const { context, page, errors } = await openApp(browser, server.url, VIEWPORTS.mobile);
    await context.addInitScript(micStub, opt);
    await page.reload();
    await page.locator(".msg.coach").first().waitFor();
    await toAnswer(page);
    const mic = page.getByRole("button", { name: ko.mic.start });
    await mic.click();
    await page.locator("#micStatus", { hasText: line }).waitFor({ timeout: 3000 });
    assert.equal(await mic.getAttribute("aria-pressed"), "false");
    assert.ok(Number(await mic.evaluate((b) => getComputedStyle(b).opacity)) < 1, "dimmed");
    assert.deepEqual(errors, []);
    await context.close();
  }
});

test("loader: three dots right away, the stage label after 3 s, static with reduced motion; never leaks into a card", async () => {
  const { context, page, errors } = await openApp(browser, server.url, VIEWPORTS.mobile);
  await page.route("**/api/questions", async (r) => { await new Promise((ok) => setTimeout(ok, 6000)); await r.continue(); }); // long enough for the 3 s label, the screenshot and the reduced-motion check
  await send(page, CODE);
  await bubbles(page, "coach").filter({ hasText: ko.chat.askMail.split("\n")[0] }).waitFor();
  await send(page, MAIL);
  const wait = page.locator("#log > .msg.typing");
  await wait.locator(".dots").waitFor({ timeout: 1000 });
  assert.equal(await wait.locator(".dots i").count(), 3);
  assert.notEqual(await wait.locator(".dots i").first().evaluate((e) => getComputedStyle(e).animationName), "none");
  assert.ok(await wait.getByText(ko.chat.waitQuestions).isHidden(), "no label before 3 s");
  await wait.getByText(ko.chat.waitQuestions).waitFor({ timeout: 3500 });
  await shot(page, "mobile-25-dots-loader");
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(await wait.locator(".dots i").first().evaluate((e) => getComputedStyle(e).animationName), "none");
  await bubbles(page, "coach").filter({ hasText: ko.chat.askPick({ count: 10 }) }).waitFor();
  assert.equal(await wait.count(), 0, "loader removed");

  // Fast replies (MOCK): the 3 s label timer must not write into the filled review/script cards.
  await page.unroute("**/api/questions");
  await send(page, "1");
  await page.fill("#input", ANSWER);
  await page.press("#input", "Control+Enter");
  await scriptCard(page).waitFor();
  await page.waitForTimeout(3300);
  for (const t of [ko.chat.waitScript, ko.chat.waitReview.ja]) assert.equal(await page.locator("#log").getByText(t).count(), 0, t);
  assert.deepEqual(errors, []);
  await context.close();
});


// Review M3 (11/03): the panel's ③ copy is the readable one (18px) but had no 🔊; it now has its own, reading along there.
test("🔊 on the panel's ③ script copy plays and highlights inside the panel (desktop)", async () => {
  const { context, page, errors } = await openApp(browser, server.url, VIEWPORTS.desktop);
  const reqs = ttsRequests(page);
  await toScript(page);
  const copy = page.locator("#reviewBox > .script:not(.review)");
  const btn = copy.getByRole("button", { name: ko.tts.play });
  await btn.click();
  await page.waitForFunction(() => (document.querySelector("#reviewBox > .script:not(.review) .ja .read")?.textContent.length ?? 0) > 0, null, { timeout: 4000 });
  assert.equal(await page.locator("#log .msg.script .ja .read").count(), 0, "the chat card is not the one highlighted");
  // The panel card is a grid on desktop, where float is ignored: 🔊 must not take a grid cell and push the title down.
  const m = await copy.evaluate((c) => {
    const r = (s) => c.querySelector(s).getBoundingClientRect();
    return { title: r(".title"), pts: r(".pts"), btn: r(".listen"), card: c.getBoundingClientRect() };
  });
  assert.ok(m.title.top < m.pts.top, `title above the points (${m.title.top} vs ${m.pts.top})`);
  assert.ok(m.btn.bottom <= m.title.bottom + 1 && m.card.right - m.btn.right < 20, "🔊 at the card's top-right");
  assert.equal(reqs.length, 1);
  assert.deepEqual(errors, []);
  await context.close();
});
