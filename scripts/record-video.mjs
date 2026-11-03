// Records section ③ of the demo video: the real app UI driven like a user (paste → pick → 🎤 or type → Send → review →
// 🔊 → answer again → ✓), one continuous take with no Next buttons and no cuts. API answers are the real outputs
// recorded by scripts/record-demo.mjs (public/demo/demo-<lang>.json), served after a short "generating" pause, so
// the take is reproducible and makes 0 AI calls. 🔊 uses the MOCK server's TTS stream (the video has no sound;
// narration is added in editing).
// Frames come from the Chrome DevTools screencast at 1.5× device pixels (crisp 1920×1080 text) and are joined by the
// system ffmpeg with their real timings — no Playwright ffmpeg download (the 10/21 presentation pipeline, wiki).
// Usage: [NARRATE=1 ENV_FILE=…] node scripts/record-video.mjs [ja|ko|en] [out.mp4]   (needs system Chrome and ffmpeg)
import { readFileSync, writeFileSync, mkdtempSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { startServer, launch, CODE } from "../test/ui/harness.js";

const lang = process.argv[2] ?? "ja";
const out = process.argv[3] ?? `demo-${lang}-section3.mp4`;
const demo = JSON.parse(readFileSync(new URL(`../public/demo/demo-${lang}.json`, import.meta.url), "utf8"));
const pack = JSON.parse(readFileSync(new URL("../packs/jp.json", import.meta.url), "utf8"));
// What the viewer sees of each generation (real: 10–20 s). Over 3 s so the app's own wait label ("checking your
// answer…") shows up next to the dots: dots alone read as a hang (user, 11/03).
const GEN_MS = 3600; // 4.5 → 3.6 s (11/03, narrated cut under 3:00): still past 3 s, so the wait label shows briefly
const HOLD_MS = 3000; // each "stop and explain" pause
// Explanation captions (storyboard approved 11/03): one big line + one note. Japanese is the video's language.
// Every caption states only what the recorded data shows (demo review 11/03): counts are computed, "all ✓" only if true.
const after = demo.steps[1].review, allOk = after.answers_question === "yes" && Object.values(after.steps).every((s) => s.present);
const CAPTIONS = {
  questions: ["この会社だけの質問、10問", `${demo.specificity.referenced}問が、メールの言葉をそのまま使っています`],
  verdict: ["質問に、答えていない", "最初に見るのは、聞かれたことに答えたかどうか"],
  steps: ["足りない部分が、赤で分かる", "直し方も、となりに出ます"],
  rule: ["直すのは、ルール表の項目だけ", "どのルールかを、ルールIDで示します"],
  script: ["自分の答えをもとにした台本", "数字は［空欄］。自分の事実で埋めます"],
  retry: ["空欄を埋めて、答え直す", "デモでは、空欄に架空の数字を入れています"],
  compare: [allOk ? "答え直したら、すべて ✓" : "答え直したら、✗ が ✓ に", "最初の答えと並べて比べます"],
  // ③-a/③-b (storyboard v2, PRESENTATION-BENCHMARK 11/03): the first answer is spoken (record-demo.mjs --voice).
  voice: ["声で答えても、いい", "話したそのままが、文字になる（端末の中で）"],
  habit: ["口ぐせまで、見つける", "声で答えると、「なんか」もそのまま残るから"],
};
// NARRATE=1 (+ GEMINI_API_KEY via ENV_FILE): each caption is also spoken (user 11/03: "the explaining captions become
// narration"). The line says the caption in full sentences (no ✓/［］ symbols for the voice); the caption stays on screen
// for muted viewers. Lines are made before recording, so each hold lasts as long as its line.
const SAY = {
  questions: `この会社だけの質問を、10問作ります。そのうち${demo.specificity.referenced}問が、メールの言葉をそのまま使っています。`,
  voice: "声で答えても大丈夫です。話したそのままが、端末の中で文字になります。",
  verdict: "質問に、答えていません。最初に見るのは、聞かれたことに答えたかどうかです。",
  steps: "足りない部分が、赤で分かります。直し方も、となりに出ます。",
  rule: "直すのは、ルール表の項目だけ。どのルールかを、ルールIDで示します。",
  habit: "口ぐせまで、見つけます。声で答えると、「なんか」もそのまま残るからです。",
  script: "自分の答えをもとにした台本です。数字は空欄のまま。自分の事実で埋めます。",
  retry: "空欄を埋めて、答え直します。このデモでは、空欄に架空の数字を入れています。",
  compare: `${allOk ? "答え直したら、すべてにチェックがつきました。" : "答え直したら、バツがチェックに変わりました。"}最初の答えと並べて比べます。`,
};
const NARRATE = process.env.NARRATE === "1";
const lines = {};
if (NARRATE) {
  const { narrate } = await import("./narration.mjs");
  for (const [k, t] of Object.entries(SAY)) lines[k] = await narrate(t);
}
const cues = []; // { wav, t } — t = wall clock when the caption appears (same clock as the screencast timestamps)
// The spoken answer is the in-browser recogniser's real output for the TTS voice, replayed like the API answers (0 calls).
const spoken = demo.steps[0].spoken === true;
// Only a filler rule the recorded review actually returned gets the habit caption (captions state only what the data shows).
const habitRule = demo.steps[0].review.corrections.find((c) => /^del-/.test(c.rule_id) && demo.steps[0].answer.includes(c.before))?.rule_id;
const VIEW = { width: 1280, height: 720 }; // × deviceScaleFactor 1.5 = 1920×1080: a 1.5× zoom, readable on a phone

const server = await startServer();
const browser = await launch();
const dir = mkdtempSync(join(tmpdir(), "mensetsu-video-"));
const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1.5, locale: lang });
await context.addInitScript((l) => { try { localStorage.setItem("mensetsu-lang", l); localStorage.setItem("mensetsu-tour-tips", "1"); } catch {} }, lang);
// 🎤 in headless Chrome: a stand-in microphone (MediaRecorder); the MOCK server's /stt-local.js returns __sttText.
if (spoken) await context.addInitScript((text) => {
  window.__sttText = text;
  navigator.mediaDevices.getUserMedia = async () => ({ getTracks: () => [{ stop() {} }] });
  window.MediaRecorder = class {
    static isTypeSupported(t) { return t.startsWith("audio/webm"); }
    constructor(s, o) { this.mimeType = o?.mimeType ?? "audio/webm"; }
    start() {}
    stop() { this.ondataavailable?.({ data: new Blob([new Uint8Array(64)], { type: this.mimeType }) }); this.onstop?.(); }
  };
}, demo.steps[0].answer);
const page = await context.newPage();
const frames = []; // { file, t } — t in seconds (screencast timestamps)
const cdp = await context.newCDPSession(page);
cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
  const file = join(dir, `f${String(frames.length).padStart(5, "0")}.jpg`);
  writeFileSync(file, Buffer.from(data, "base64"));
  frames.push({ file, t: metadata.timestamp });
  cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
});
const now = () => Date.now() / 1000;

// Recorded answers instead of Claude: the order of /api/review calls is first answer, then the corrected one.
let reviews = 0, scripts = 0;
const steps = pack.answer_structure.steps.map(({ key, label, optional }) => ({ key, label, ...(optional && { optional }) }));
const answers = {
  "/api/access": () => ({ ok: true, stt: false }),
  "/api/questions": () => ({ company_context: demo.company_context, questions: demo.questions, specificity: demo.specificity, pack: { id: "jp", target: "ja", steps } }),
  "/api/review": () => demo.steps[Math.min(reviews++, 1)].review,
  "/api/script": () => (demo.steps[Math.min(scripts++, 1)].script ?? demo.steps[0].script), // 2nd answer → its own script
};
await page.route("**/api/**", async (route) => {
  const path = new URL(route.request().url()).pathname;
  if (!answers[path]) return route.continue(); // /api/tts → the MOCK stream
  if (path !== "/api/access") await new Promise((r) => setTimeout(r, GEN_MS));
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(answers[path]()) });
});

// Playwright video has no mouse pointer: draw one so the viewer sees where the "user" clicks (CSSOM styles, CSP-safe).
async function pointer(sel) {
  const box = await page.locator(sel).first().boundingBox();
  await page.evaluate(({ x, y }) => {
    let p = document.getElementById("rec-pointer");
    if (!p) {
      p = document.createElement("div");
      p.id = "rec-pointer";
      Object.assign(p.style, { position: "fixed", zIndex: 99, width: "30px", height: "30px", marginLeft: "-15px", marginTop: "-15px", borderRadius: "50%", background: "transparent", border: "3px solid rgba(4,122,53,.8)", boxShadow: "0 0 0 2px #fff", pointerEvents: "none", transition: "left .6s ease, top .6s ease" });
      document.body.append(p);
    }
    Object.assign(p.style, { left: `${x}px`, top: `${y}px` });
  }, { x: box.x + Math.max(box.width / 2, box.width - 16), y: box.y + box.height / 2 }); // near the right edge: the label stays visible
  await page.waitForTimeout(700);
}
const click = async (sel) => { await pointer(sel); await page.click(sel); };

// Stop and explain: scroll the target's own scroller (chat log or panel) so it comes up near the top (0.8 s, visible),
// dim the rest, frame the target in green above a caption band, hold, then put the layout back. CSSOM only.
// top: caption band at the top of the screen (the target sits at the bottom, e.g. the input).
async function explain(sels, caption, hold = HOLD_MS, during, top = false) {
  const [title, note] = caption, line = lines[Object.keys(CAPTIONS).find((k) => CAPTIONS[k] === caption)];
  if (line) hold = Math.max(hold, Math.round(line.sec * 1000) + 400);
  await page.evaluate(async (sels) => {
    const el = document.querySelector(sels[0]);
    let sc = el.parentElement;
    while (sc && !/(auto|scroll)/.test(getComputedStyle(sc).overflowY)) sc = sc.parentElement;
    if (!sc) return;
    sc.dataset.rec = "1";
    sc.style.paddingBottom = "60vh"; // the last item can still come up to the top
    const from = sc.scrollTop, to = from + el.getBoundingClientRect().top - sc.getBoundingClientRect().top - 16;
    const t0 = performance.now();
    await new Promise((done) => {
      const step = (t) => {
        const k = Math.min(1, (t - t0) / 800), e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
        sc.scrollTop = from + (to - from) * e;
        k < 1 ? requestAnimationFrame(step) : done();
      };
      requestAnimationFrame(step);
    });
  }, sels);
  if (during) await during();
  await page.evaluate(({ sels, title, note, top }) => {
    const els = sels.flatMap((s) => [...document.querySelectorAll(s)]);
    const sc = document.querySelector("[data-rec]");
    const cap = document.createElement("div"); cap.id = "rec-cap";
    Object.assign(cap.style, { position: "fixed", zIndex: 99, left: "0", right: "0", ...(top ? { top: "0" } : { bottom: "0" }), padding: "14px 32px 18px", background: "rgba(17,17,17,.86)", color: "#fff", textAlign: "center", pointerEvents: "none", opacity: "0", transition: "opacity .3s" });
    const t = document.createElement("div"); t.textContent = title; Object.assign(t.style, { fontSize: "30px", fontWeight: "700", lineHeight: "1.3" });
    const n = document.createElement("div"); n.textContent = note; Object.assign(n.style, { fontSize: "18px", marginTop: "4px", color: "#cfe9d8" });
    cap.append(t, n);
    document.body.append(cap);
    const rs = els.map((e) => e.getBoundingClientRect()), lim = sc ? sc.getBoundingClientRect() : { top: 0 };
    const floor = top ? innerHeight - 4 : cap.getBoundingClientRect().top - 12; // the frame never runs under the caption band
    const b = { l: Math.min(...rs.map((r) => r.left)), t: Math.max(lim.top + 4, Math.min(...rs.map((r) => r.top))), r: Math.max(...rs.map((r) => r.right)), bt: Math.min(floor, Math.max(...rs.map((r) => r.bottom))) };
    const hl = document.createElement("div"); hl.id = "rec-hl";
    Object.assign(hl.style, { position: "fixed", zIndex: 98, left: `${b.l - 8}px`, top: `${b.t - 6}px`, width: `${b.r - b.l + 16}px`, height: `${b.bt - b.t + 12}px`, border: "3px solid #06c755", borderRadius: "6px", boxShadow: "0 0 0 9999px rgba(0,0,0,.28)", pointerEvents: "none", opacity: "0", transition: "opacity .3s" });
    document.body.append(hl);
    requestAnimationFrame(() => { cap.style.opacity = "1"; hl.style.opacity = "1"; });
  }, { sels, title, note, top });
  if (line) cues.push({ wav: line.wav, t: now() + 0.15 }); // starts as the caption fades in
  await pause(hold);
  await page.evaluate(() => {
    for (const id of ["rec-hl", "rec-cap"]) document.getElementById(id)?.remove();
    for (const e of document.querySelectorAll("[data-rec]")) { e.style.paddingBottom = ""; delete e.dataset.rec; }
    const log = document.querySelector(".log"); log.scrollTop = log.scrollHeight; // the app's own position again
  });
}
const pause = (ms) => page.waitForTimeout(ms);
async function type(text, perChar) {
  await pointer("#input");
  await page.click("#input");
  await page.keyboard.type(text, { delay: perChar });
  await pause(400);
}

// Off camera: the access code (trimmed away below).
await page.goto(server.url);
await page.locator(".msg.coach").first().waitFor();
await page.fill("#input", CODE);
await page.click("#send");
await page.waitForFunction(() => document.querySelector("#input").placeholder && !document.querySelector("#send").disabled);
await pause(300);
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, everyNthFrame: 1 });
await pause(500);
const start = now();

// ③ on camera.
await pointer("#input");
await page.fill("#input", demo.mail); // a paste lands at once
await pause(900);
await click("#send");
await page.locator("#log .q").first().waitFor({ timeout: 15000 });
await pause(600);
await explain(["#log .q:nth-of-type(1)", "#log .q:nth-of-type(3)"], CAPTIONS.questions);
await type(String(demo.pick + 1), 150);
await click("#send");
await pause(1200);
if (spoken) { // ③-a: answer by voice; the transcript lands in the box (fillers kept), checked, then sent
  await click("#mic");
  await pause(3500); // the recording timer runs while the "user" speaks (~13 s of speech, shortened)
  await click("#mic");
  await page.waitForFunction(() => document.querySelector("#input").value.length > 20);
  await pause(600);
  await explain(["#input", "#mic"], CAPTIONS.voice, HOLD_MS, undefined, true);
} else await type(demo.steps[0].answer, 35); // the off-target answer
await click("#send");
await page.locator("#reviewBox > .review").waitFor({ timeout: 15000 });
await page.locator("#reviewBox > .script:not(.review) .listen").waitFor({ timeout: 15000 });
await pause(800);
const R = "#reviewBox > .review";
await explain([`${R} .verdict`, `${R} .verdict + .tr`], CAPTIONS.verdict);
await explain([`${R} .step.miss, ${R} .step.tip`, `${R} .hint`], CAPTIONS.steps);
await explain([`${R} .rule`, `${R} .rule + .ja`], CAPTIONS.rule);
if (spoken && habitRule) { // ③-b: the spoken filler is caught by the pack's rule
  await page.evaluate((id) => { const r = [...document.querySelectorAll("#reviewBox > .review .rule")].find((e) => e.textContent.includes(id)); r.id = "rec-habit"; }, habitRule);
  await explain(["#rec-habit", "#rec-habit + .ja"], CAPTIONS.habit);
}
// ③ with 🔊: the whole card comes up (the button sits above the title), the read-along highlight runs under the caption.
await explain(["#reviewBox > .script:not(.review)"], CAPTIONS.script, 4500, () => click("#reviewBox > .script:not(.review) .listen"));
await type(String(demo.pick + 1), 150); // the app is back at "pick": the same question again, as a user would
await click("#send");
await pause(800);
// The corrected answer is pasted (no human types 200 characters in 4 s) and labelled as filled with fictional numbers.
await pointer("#input");
await page.fill("#input", demo.steps[1].answer);
await explain(["#input"], CAPTIONS.retry, 2500, undefined, true);
await click("#send");
await page.locator("#reviewBox > .compare").waitFor({ timeout: 15000 });
await pause(600);
await explain(["#reviewBox > .compare .cmp"], CAPTIONS.compare, 3500);
await pause(800);
const end = now();
await cdp.send("Page.stopScreencast");
await browser.close();
server.stop();

// Screencast frames arrive only when the page changes: each frame lasts until the next one (variable rate → 30 fps).
const shots = frames.filter((f) => f.t >= start - 1 && f.t <= end);
const list = shots.map((f, i) => `file '${f.file}'\nduration ${((shots[i + 1]?.t ?? end) - f.t).toFixed(3)}`).join("\n");
writeFileSync(join(dir, "list.txt"), `${list}\nfile '${shots.at(-1).file}'\n`);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", join(dir, "list.txt"), "-vf", "scale=1920:1080:flags=lanczos,fps=30", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-movflags", "+faststart", join(dir, "out.mp4")]);
if (cues.length) { // mix the lines in at their caption times (video t = 0 is the first kept frame)
  const t0 = shots[0].t, n = cues.length;
  const filter = cues.map((c, k) => `[${k + 1}:a]aresample=48000,adelay=${Math.max(0, Math.round((c.t - t0) * 1000))}:all=1[a${k}]`).join(";") + `;${cues.map((_, k) => `[a${k}]`).join("")}amix=inputs=${n}:normalize=0:duration=longest[aout]`;
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", join(dir, "out.mp4"), ...cues.flatMap((c) => ["-i", c.wav]), "-filter_complex", filter, "-map", "0:v", "-map", "[aout]", "-c:v", "copy", "-c:a", "aac", "-ar", "48000", "-ac", "1", "-t", String(end - t0), join(dir, "narrated.mp4")]);
  copyFileSync(join(dir, "narrated.mp4"), out);
} else copyFileSync(join(dir, "out.mp4"), out);
console.log(`${out}: ${(end - start).toFixed(1)} s, ${shots.length} frames (one take, ${reviews} reviews${spoken ? `, spoken; habit caption: ${habitRule ?? "none"}` : ""}${cues.length ? `, ${cues.length} narrated captions` : ""})`);
