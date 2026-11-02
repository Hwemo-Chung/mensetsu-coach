// Browser regression harness: starts dev.js with MOCK_CLAUDE (0 tokens) on a free port and drives system Chrome.
// Not a test file itself (no .test.js), so `node --test test/ui/` only picks up the *.test.js files.
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { chromium } from "playwright-core";

export const ROOT = fileURLToPath(new URL("../..", import.meta.url));
export const CODE = "ui-test-code";
export const VIEWPORTS = { mobile: { width: 390, height: 844 }, desktop: { width: 1440, height: 900 } };
// Synthetic agent mail already published with the demo (public/demo), so no private sample is needed.
export const MAIL = JSON.parse(readFileSync(join(ROOT, "public/demo/demo-ko.json"), "utf8")).mail;
// Contains review.json's first `before` verbatim, so the review gate keeps that correction (F4) and F9 can count it.
export const ANSWER = "はい、前職では新しいシステムの導入を担当しまして、チームで協力して進めました。";

// Screenshots go to the private folder (skipped when it is absent, e.g. other clones). Default is ui-current/, so routine
// runs never overwrite the frozen "before" set; re-baseline on purpose with UI_SHOT_DIR=<private>/internal-docs/ui-baseline.
const PRIVATE = join(ROOT, "../BuiltWithClaude-2026-private");
export const SHOT_DIR = process.env.UI_SHOT_DIR ?? join(PRIVATE, "internal-docs/ui-current");
export async function shot(page, name, focus) {
  if (!process.env.UI_SHOT_DIR && !existsSync(PRIVATE)) return;
  // The log auto-scrolls to the bottom; bring the state under test into view so the image actually shows it.
  if (focus) await focus.evaluate((e) => e.scrollIntoView({ block: "start" }));
  mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: join(SHOT_DIR, `${name}.png`), fullPage: true });
}

const freePort = () => new Promise((resolve, reject) => {
  const s = createServer().listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => resolve(port)); });
  s.on("error", reject);
});

// Fresh server per test file: the in-memory rate limit (lib/guard.js) starts empty each time.
export async function startServer() {
  const port = await freePort();
  const env = { ...process.env, MOCK_CLAUDE: "1", ACCESS_CODE: CODE, ANTHROPIC_API_KEY: "dummy", ANTHROPIC_BASE_URL: "http://127.0.0.1:9", PORT: String(port), ENV_FILE: "/dev/null" };
  const proc = spawn(process.execPath, ["dev.js"], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
  let err = "";
  proc.stderr.on("data", (d) => { err += d; });
  await new Promise((resolve, reject) => {
    proc.stdout.on("data", (d) => { if (String(d).includes(`localhost:${port}`)) resolve(); });
    proc.on("exit", (c) => reject(new Error(`dev.js exited ${c}: ${err}`)));
  });
  return { url: `http://127.0.0.1:${port}`, stop: () => proc.kill() };
}

export const launch = () => chromium.launch({ channel: "chrome", headless: true });

export async function openApp(browser, base, viewport, lang = "ko") {
  const context = await browser.newContext({ viewport, locale: lang, acceptDownloads: true });
  // Pin the starting UI language before app.js reads it; a choice made in the page (and reload) still wins.
  await context.addInitScript((l) => { try { localStorage.getItem("mensetsu-lang") || localStorage.setItem("mensetsu-lang", l); } catch {} }, lang);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  await page.locator(".msg.coach").first().waitFor();
  return { context, page, errors };
}

export const bubbles = (page, cls) => page.locator(`#log > .msg.${cls}`);
export async function send(page, text) {
  await page.fill("#input", text);
  await page.click("#send");
}
export const noHorizontalOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
