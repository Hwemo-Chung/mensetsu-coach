// Screens that need no access code: language switch, no-code demo replay, privacy page.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { LANGS } from "../../public/i18n/index.js";
import { startServer, launch, openApp, bubbles, shot, noHorizontalOverflow, VIEWPORTS, TOUR, tourTo } from "./harness.js";

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); server?.stop(); });

test("(6) UI language switch ko/en/ja changes static labels", async () => {
  const { context, page, errors } = await openApp(browser, server.url, VIEWPORTS.desktop);
  for (const lang of ["en", "ja", "ko"]) {
    const t = LANGS[lang];
    await page.selectOption("#lang", lang);
    assert.equal(await page.textContent("#end"), t.ui.end);
    assert.equal(await page.textContent("#send"), t.ui.send);
    assert.equal(await page.getAttribute("#input", "placeholder"), t.chat.codePlaceholder);
    assert.equal(await page.getAttribute("html", "lang"), lang);
    assert.equal(await page.title(), t.ui.title);
    assert.equal(await page.locator("#dest option").first().textContent(), t.dest.jp);
  }
  // The choice survives a reload.
  await page.selectOption("#lang", "en");
  await page.reload();
  await bubbles(page, "coach").filter({ hasText: LANGS.en.chat.askCode }).waitFor();
  assert.deepEqual(errors, []);
  await context.close();
});

// ko on both viewports; ja (Japan + Japanese screen = same language) checks that reading/translation stay hidden.
for (const [lang, vp] of [["ko", "mobile"], ["ko", "desktop"], ["ja", "desktop"]]) {
  const viewport = VIEWPORTS[vp];
  test(`(7) no-code demo replays without access code or API calls (${lang}, ${vp})`, async () => {
    const L = LANGS[lang], t = L.demo;
    const { context, page, errors } = await openApp(browser, server.url, viewport, lang);
    const api = [];
    page.on("request", (r) => { if (new URL(r.url()).pathname.startsWith("/api/")) api.push(r.url()); });
    await page.getByRole("button", { name: t.button }).click();
    await bubbles(page, "demo-banner").filter({ hasText: t.banner }).waitFor();
    await tourTo(page, TOUR.try); // 9-step tour (11/03): the questions arrive at step 2, so they are counted at the end
    assert.equal(await page.locator("#log .q").count(), 10);
    await bubbles(page, "coach").filter({ hasText: t.done }).waitFor();
    assert.equal(await page.locator(".next-btn").count(), 0);
    // Scene: off-target answer gets ✗ steps, the revised answer (after the script) gets all ✓.
    const reviews = page.locator("#log > .msg.review");
    assert.equal(await reviews.count(), 2);
    assert.ok(await reviews.nth(0).locator(".step.miss").count() > 0, "first answer flags missing steps");
    assert.equal(await reviews.nth(1).locator(".step.ok").count(), 4);
    assert.equal(await reviews.nth(1).locator(".step.miss").count(), 0);
    const script = page.locator("#log > .msg.script:not(.review)").first();
    await script.waitFor();
    await script.getByText(L.script.text.ja, { exact: true }).waitFor();
    assert.equal(await page.locator("#log").textContent().then((x) => x.includes("undefined")), false, "no undefined field printed");
    if (lang === "ja") {
      assert.equal(await script.locator(".reading").count(), 0, "same language: no reading");
      assert.equal(await script.locator(".label", { hasText: L.script.translation }).count(), 0, "same language: no translation");
      assert.equal(await page.locator("#log .q .tr").count(), 0, "same language: no question translation");
    }
    assert.deepEqual(api, [], "demo must not call the API");
    await shot(page, `${vp}-06-demo${lang === "ko" ? "" : `-${lang}`}`, reviews.nth(0));
    assert.ok(await noHorizontalOverflow(page), "horizontal overflow in demo");
    // "Try it yourself" returns to the code prompt.
    await page.getByRole("button", { name: t.try }).click();
    assert.equal(await bubbles(page, "coach").filter({ hasText: L.chat.askCode }).count(), 2);
    assert.deepEqual(errors, []);
    await context.close();
  });
}

test("(8) privacy link resolves with 200", async () => {
  const { context, page } = await openApp(browser, server.url, VIEWPORTS.mobile);
  const href = await page.locator(".note a").getAttribute("href");
  assert.equal(href, "/privacy.html");
  const res = await page.goto(server.url + href);
  assert.equal(res.status(), 200);
  assert.ok((await page.textContent("body")).trim().length > 0);
  await context.close();
});
