// Browser regression harness: starts dev.js with MOCK_CLAUDE (0 tokens) on a free port and drives system Chrome.
// Not a test file itself (no .test.js), so `node --test test/ui/` only picks up the *.test.js files.
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { LANGS } from "../../public/i18n/index.js";

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
// STT_ENABLED=1 by default so the 🎤 tests keep running; voice-off.test.js passes { STT_ENABLED: "0" } (the shipped default).
export async function startServer(extraEnv = {}) {
  const port = await freePort();
  const env = { ...process.env, MOCK_CLAUDE: "1", ACCESS_CODE: CODE, ANTHROPIC_API_KEY: "dummy", ANTHROPIC_BASE_URL: "http://127.0.0.1:9", PORT: String(port), ENV_FILE: "/dev/null", STT_ENABLED: "1", ...extraEnv };
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

// Shared by voice.test.js and readaloud.test.js (stage helpers in ko; browser stubs for the mic and device voices).
const ko = LANGS.ko;
export const scriptCard = (page) => page.locator("#log > .msg.script:not(.review):not(.reverse)");
export async function toAnswer(page) {
  await send(page, CODE);
  await bubbles(page, "coach").filter({ hasText: ko.chat.askMail.split("\n")[0] }).waitFor();
  await send(page, MAIL);
  await bubbles(page, "coach").filter({ hasText: ko.chat.askPick({ count: 10 }) }).waitFor();
  await send(page, "1");
  await page.locator("#mic").waitFor();
}
export async function toScript(page) {
  await toAnswer(page);
  await page.fill("#input", ANSWER);
  await page.press("#input", "Control+Enter");
  await scriptCard(page).getByRole("button", { name: ko.tts.play }).waitFor();
}
export const ttsRequests = (page) => {
  const list = [];
  page.on("request", (r) => { if (r.url().includes("/api/tts")) list.push(r); });
  return list;
};
// speechSynthesis stub: records each utterance; fires one boundary and the end.
export const speechStub = (names) => {
  window.__spoken = [];
  const voices = names.map((name) => ({ name, lang: "ja-JP" }));
  window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
  Object.defineProperty(window, "speechSynthesis", { configurable: true, value: {
    getVoices: () => voices, addEventListener() {}, removeEventListener() {}, cancel() { window.__cancelled = true; },
    speak(u) {
      window.__spoken.push({ text: u.text, voice: u.voice?.name, rate: u.rate, lang: u.lang });
      setTimeout(() => u.onboundary?.({ charIndex: 1, charLength: 2 }), 30);
      setTimeout(() => u.onend?.(), 300);
    },
  } });
};

export const micStub = ({ denied = false, unsupported = false } = {}) => {
  window.__mic = { stopped: 0 };
  if (unsupported) { delete window.MediaRecorder; window.MediaRecorder = undefined; return; }
  const md = navigator.mediaDevices ?? {};
  md.getUserMedia = async () => {
    if (denied) throw new DOMException("denied", "NotAllowedError");
    return { getTracks: () => [{ stop: () => window.__mic.stopped++ }] };
  };
  if (!navigator.mediaDevices) Object.defineProperty(navigator, "mediaDevices", { value: md });
  window.MediaRecorder = class {
    static isTypeSupported(t) { return t.startsWith("audio/webm"); }
    constructor(stream, o) { this.mimeType = o?.mimeType ?? "audio/webm"; this.state = "inactive"; }
    start() { this.state = "recording"; }
    stop() {
      this.state = "inactive";
      this.ondataavailable?.({ data: new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3])], { type: this.mimeType }) });
      this.onstop?.();
    }
  };
};

