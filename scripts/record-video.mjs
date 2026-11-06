// Records section ③ of the demo video: the real app UI driven like a user (paste → pick → 🎤 or type → Send → review →
// 🔊 → answer again → ✓), one continuous take with no Next buttons and no cuts. API answers are the real outputs
// recorded by scripts/record-demo.mjs (public/demo/demo-<lang>.json), served after a short "generating" pause, so
// the take is reproducible and makes 0 AI calls. 🔊 uses the MOCK server's TTS stream (the video has no sound;
// narration is added in editing).
// Frames come from the Chrome DevTools screencast at 1.5× device pixels (crisp 1920×1080 text) and are joined by the
// system ffmpeg with their real timings — no Playwright ffmpeg download (the 10/21 presentation pipeline, wiki).
// Usage: [NARRATE=1] node scripts/record-video.mjs [ja|ko|en] [out.mp4]   (needs system Chrome and ffmpeg)
import { readFileSync, writeFileSync, mkdtempSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { startServer, launch, CODE } from "../test/ui/harness.js";
import { CPS } from "./narration.mjs";

const [lang = "ja", out = `demo-${lang}-section3.mp4`] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const demo = JSON.parse(readFileSync(new URL(`../public/demo/demo-${lang}.json`, import.meta.url), "utf8"));
const pack = JSON.parse(readFileSync(new URL("../packs/jp.json", import.meta.url), "utf8"));
// What the viewer sees of each generation (real: 10–20 s). Over 3 s so the app's own wait label ("checking your
// answer…") shows up next to the dots: dots alone read as a hang (user, 11/03).
const GEN_MS = 3100; // still past 3 s, so the wait label shows; faster tempo (user 11/04)
const HOLD_MS = 1200; // each "stop and explain" pause, at least (11/06: was 1800, longer than the shortest lines)
// Explanation captions (storyboard approved 11/03): one big line + one note. Japanese is the video's language.
// Every caption states only what the recorded data shows (demo review 11/03): counts are computed, "all ✓" only if true.
const after = demo.steps[1].review, allOk = after.answers_question === "yes" && Object.values(after.steps).every((s) => s.present);
// v4 (user 11/04, benchmark A2/A1): the caption is the big headline in the panel left of the app (build-video.mjs draws
// it from <out>.panels.json). Title lines split with \n; step = the 4-step usage rail; tone = panel colour.
const n = demo.specificity.referenced;
const CAPTIONS = {
  paste: ["メールを\n貼るだけ", "求人やエージェントのメールを、<br>そのまま"],
  questions: ["この会社だけの\n質問、10問", `${n}問が、メールの言葉を<br>そのまま使っています`],
  research: ["この会社を\n調べる", "検索に送るのは、企業名と職種名だけ"],
  brief: ["違いを\n面接で確かめる", "判定はしません。<br>デモは架空の会社です"],
  pick: ["練習する質問を\n選ぶ", "ボタンを押すだけ"],
  voice: ["声で\n答える", "話したそのままが、<br>端末の中で文字になる"],
  verdict: ["質問に、\n答えていない", "最初に見るのは、<br>聞かれたことに答えたかどうか"],
  steps: ["足りない部分が\n赤で分かる", "直し方も、すぐ下に出ます"],
  rule: ["直すのは\nルール表だけ", "どのルールかを、ルールIDで示します"],
  habit: ["口ぐせまで\n見つける", "声で答えると「なんか」も<br>そのまま残るから"],
  script: ["自分の答えを\nもとにした台本", "数字は［空欄］。自分の事実で埋めます"],
  retry: ["空欄を埋めて\n答え直す", "デモでは、架空の数字を入れています"],
  compare: [allOk ? "答え直したら\nすべて ✓" : "答え直したら\n✗ が ✓ に", "最初の答えと並べて比べます"],
};
// What each caption walks through while it is spoken (user 11/04: arrows and interaction, not still screens). A selector
// starting with * takes every match, otherwise the first one. Set after R/SC exist, see WALK below.
const STEP = { paste: 1, questions: 1, research: 2, brief: 2, pick: 3, voice: 4, verdict: 4, steps: 4, rule: 4, habit: 4, script: 4, retry: 5, compare: 5 };
const TONE = { verdict: "alert", compare: "peak" };
// NARRATE=1 (+ a local VOICEVOX engine): each caption is also spoken. Lines say it in full sentences (no ✓/［］ for
// the voice). Lines are made before recording, so each hold lasts as long as its line.
// v8: shorter lines (the take was 77.5 s in v7; the budget is 72 s, storyboard 04-video/v8). Every line is checked
// with VOICEVOX's kana reading (narration-check.mjs) and the Whisper round trip of the finished video.
const SAY = {
  paste: "求人メールを、貼るだけ。",
  questions: `その会社だけの質問、10問。${n}問は、メールの言葉のまま。`,
  research: "会社も調べます。",
  brief: "メールとの違いを、面接で聞く質問に。会社は架空です。",
  pick: "質問を、ボタンで選びます。",
  voice: "話したそのままが、端末の中で文字になります。",
  verdict: "質問に、答えていません。まず、聞かれたことに答えたかどうか。",
  steps: "足りない部分が赤。直し方も、すぐ下に。",
  rule: "直すのは、ルール表の項目だけ。IDで示します。",
  habit: "口ぐせも見つけます。声だと、「なんか」まで残るからです。", // まで: 「も残る」 was heard as 物凝る (Whisper, smoke v8d)
  script: "自分の答えをもとにした台本。数字は空欄のまま。",
  retry: "空欄を埋めて、答え直します。数字は架空です。",
  compare: `${allOk ? "答え直したら、すべてにチェック。" : "答え直したら、バツがチェックに。"}最初の答えとならべて比べます。`, // ならべて: the engine read 並べて as なべて (Whisper round trip of v7)
  // Bridges: spoken over a wait, so the take has no long silence (v5 measured up to 5.4 s). The wait stays over 3 s for the app's label.
  waitQuestions: "質問を作っています。",
  mic: "マイクを押して、話します。",
  waitReview: "AIが、答えを確認しています。",
  waitAgain: "同じ質問で、もう一度。",
};
// --lines: the narration table as JSON, nothing recorded (narration-check.mjs reads every line from here).
if (process.argv.includes("--lines")) { console.log(JSON.stringify(SAY)); process.exit(0); }
const NARRATE = process.env.NARRATE === "1";
const lines = {};
if (NARRATE) {
  const { narrate } = await import("./narration.mjs");
  for (const [k, t] of Object.entries(SAY)) lines[k] = await narrate(t);
}
const panels = []; // { key, title, note, step, tone, t } — the headline panel track for build-video.mjs
const cues = []; // { wav, t } — t = wall clock when the caption appears (same clock as the screencast timestamps)
// The spoken answer is the in-browser recogniser's real output for the TTS voice, replayed like the API answers (0 calls).
const spoken = demo.steps[0].spoken === true;
// Only a filler rule the recorded review actually returned gets the habit caption (captions state only what the data shows).
const habitRule = demo.steps[0].review.corrections.find((c) => /^del-/.test(c.rule_id) && demo.steps[0].answer.includes(c.before))?.rule_id;
const VIEW = { width: 854, height: 720 }; // × 1.5 = the right 2/3 of 1920×1080: one column, larger text than the dashboard

const server = await startServer({ OPEN_ACCESS: "1" }); // the submission's public mode (DECISIONS 11/06 17:40)
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
let reviews = 0, scripts = 0, questionCalls = 0;
const steps = pack.answer_structure.steps.map(({ key, label, optional }) => ({ key, label, ...(optional && { optional }) }));
const answers = {
  "/api/access": () => ({ ok: true, stt: false, research: true }),
  "/api/research": () => demo.brief,
  "/api/fit": () => ({ fit_evaluation: demo.brief.fit_evaluation, mismatch_flags: demo.brief.mismatch_flags, company_checkpoints: demo.brief.company_checkpoints }),
  "/api/questions": () => ({ company_context: demo.company_context, questions: demo.questions, specificity: demo.specificity, pack: { id: "jp", target: "ja", steps } }),
  "/api/review": () => demo.steps[Math.min(reviews++, 1)].review,
  "/api/script": () => (demo.steps[Math.min(scripts++, 1)].script ?? demo.steps[0].script), // 2nd answer → its own script
};
await page.route("**/api/**", async (route) => {
  const path = new URL(route.request().url()).pathname;
  if (!answers[path]) return route.continue(); // /api/tts → the MOCK stream
  // One visible wait per answer; research and the calls that follow one are cut short (the research scene is a few seconds, user 11/05).
  if (path !== "/api/access") await new Promise((r) => setTimeout(r, ["/api/fit", "/api/research", "/api/script"].includes(path) || (path === "/api/questions" && questionCalls++) ? 120 : GEN_MS));
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(answers[path]()) });
});

// Playwright video has no mouse pointer: draw one so the viewer sees where the "user" clicks (CSSOM styles, CSP-safe).
async function pointer(sel) {
  await page.locator(sel).first().scrollIntoViewIfNeeded(); // a card's button may be below the fold: scroll before the ring moves
  const box = await page.locator(sel).first().boundingBox();
  await page.evaluate(({ x, y }) => {
    let p = document.getElementById("rec-pointer");
    if (!p) {
      p = document.createElement("div");
      p.id = "rec-pointer";
      Object.assign(p.style, { position: "fixed", zIndex: 99, width: "30px", height: "30px", marginLeft: "-15px", marginTop: "-15px", borderRadius: "50%", background: "transparent", border: "3px solid rgba(4,122,53,.8)", boxShadow: "0 0 0 2px #fff", pointerEvents: "none", transition: "left .3s ease, top .3s ease" });
      document.body.append(p);
    }
    Object.assign(p.style, { left: `${x}px`, top: `${y}px` });
  }, { x: box.x + Math.max(box.width / 2, box.width - 16), y: box.y + box.height / 2 }); // near the right edge: the label stays visible
  await page.waitForTimeout(300); // the ring's own .3 s move
}
const click = async (sel) => { await pointer(sel); await page.click(sel); };

// Stop and explain: scroll the target's own scroller (chat log or panel) so it comes up near the top (0.35 s, visible),
// dim the rest, frame the target in green above a caption band, hold, then put the layout back. CSSOM only.
// top: caption band at the top of the screen (the target sits at the bottom, e.g. the input).
async function explain(sels, caption, hold = HOLD_MS, during) {
  const [title, note] = caption, key = Object.keys(CAPTIONS).find((k) => CAPTIONS[k] === caption), line = lines[key];
  // Silent preview: the same reading time as the narration at TEMPO, so the cut keeps its length.
  hold = Math.max(hold, line ? Math.round(line.sec * 1000) + 100 : Math.round(SAY[key].length / CPS * 1000) + 100);
  // 11/06 (user: too many empty gaps): the line and its panel start with the scroll, and the hold counts from here.
  const t0 = now();
  if (line) cues.push({ wav: line.wav, t: t0 });
  panels.push({ key, title, note, step: STEP[key], tone: TONE[key], t: t0 });
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
        const k = Math.min(1, (t - t0) / 350), e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
        sc.scrollTop = from + (to - from) * e;
        k < 1 ? requestAnimationFrame(step) : done();
      };
      requestAnimationFrame(step);
    });
  }, sels);
  if (during) await during();
  const n = await page.evaluate(({ sels, walk }) => {
    const els = walk.flatMap((s) => (s[0] === "*" ? [...document.querySelectorAll(s.slice(1))].slice(0, 6) : [document.querySelector(s)])).filter(Boolean);
    const hl = document.createElement("div"); hl.id = "rec-hl";
    Object.assign(hl.style, { position: "fixed", zIndex: 98, border: "3px solid #06c755", borderRadius: "6px", boxShadow: "0 0 0 9999px rgba(0,0,0,.28)", pointerEvents: "none", transition: "all .28s cubic-bezier(.2,.8,.2,1)" });
    const ar = document.createElementNS("http://www.w3.org/2000/svg", "svg"); ar.id = "rec-arrow";
    ar.setAttribute("viewBox", "0 0 48 32");
    ar.innerHTML = '<path d="M2 11h24V2l20 14-20 14v-9H2z" fill="#ffe14d" stroke="#111" stroke-width="2.5" stroke-linejoin="round"/>';
    Object.assign(ar.style, { position: "fixed", zIndex: 99, width: "54px", height: "36px", pointerEvents: "none", transition: "left .28s cubic-bezier(.2,.8,.2,1), top .28s cubic-bezier(.2,.8,.2,1)" });
    document.body.append(hl, ar);
    ar.animate([{ transform: "translateX(-9px)" }, { transform: "translateX(2px)" }], { duration: 340, iterations: Infinity, direction: "alternate", easing: "ease-in-out" });
    window.__walk = (i) => {
      const el = els[i], sc = document.querySelector("[data-rec]");
      if (sc) { const r = el.getBoundingClientRect(), box = sc.getBoundingClientRect(); if (r.bottom > box.bottom - 16 || r.top < box.top + 16) sc.scrollTop += r.top - box.top - 40; }
      const r = el.getBoundingClientRect();
      Object.assign(hl.style, { left: `${r.left - 8}px`, top: `${r.top - 5}px`, width: `${r.width + 16}px`, height: `${Math.min(r.height, innerHeight - r.top - 12) + 10}px` });
      Object.assign(ar.style, { left: `${Math.max(4, r.left - 66)}px`, top: `${r.top + Math.min(r.height, 60) / 2 - 18}px` });
    };
    return els.length;
  }, { sels, walk: WALK[key] ?? sels });
  await page.evaluate(() => window.__walk(0));
  const left = Math.max(0, hold - (now() - t0) * 1000);
  for (let i = 1; i < n; i++) { await pause(left / n); await page.evaluate((k) => window.__walk(k), i); }
  await pause(left / n);
  await page.evaluate(() => {
    for (const id of ["rec-hl", "rec-arrow"]) document.getElementById(id)?.remove();
    for (const e of document.querySelectorAll("[data-rec]")) { e.style.paddingBottom = ""; delete e.dataset.rec; }
    const log = document.querySelector(".log"); log.scrollTop = log.scrollHeight; // the app's own position again
  });
}
const pause = (ms) => page.waitForTimeout(ms);
const bridge = (key) => { if (lines[key]) cues.push({ wav: lines[key].wav, t: now() + 0.1 }); };
async function type(text, perChar) {
  await pointer("#input");
  await page.click("#input");
  await page.keyboard.type(text, { delay: perChar });
  await pause(400);
}

// Off camera: the access code, only while the app still asks for one (DECISIONS 11/06 17:25: the gate becomes a daily
// limit). body[data-stage] is the app's own marker, so this works before and after that change. The take keeps the chat
// above it, so such a take shows the code prompt and its •••• echo, which the video may not (user 11/06 18:12):
// panels.json records codeStage and build-video.mjs takes only codeStage: false outside PREVIEW.
await page.goto(server.url);
await page.locator(".msg.coach").first().waitFor();
const codeStage = await page.evaluate(() => document.body.dataset.stage === "code");
if (codeStage) {
  console.warn("the app still asks for an access code: this take shows its prompt and •••• echo (PREVIEW only)");
  await page.fill("#input", CODE);
  await page.click("#send");
  await page.waitForFunction(() => document.body.dataset.stage !== "code" && !document.querySelector("#send").disabled);
}
await pause(300);
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, everyNthFrame: 1 });
await pause(500);
const start = now();

const R = "#log .msg.review", SC = "#log .msg.script:not(.review)";
const WALK = {
  paste: ["#input", "#send"],
  research: [".brief-confirm .inline-btn"],
  brief: ["#rec-flag-a", "#rec-flag-b", "#rec-check"],
  questions: ["*#log .q"],
  pick: ["#rec-pick", "#rec-pick button"],
  voice: ["#mic", "#input"],
  verdict: [`${R} .verdict`, `${R} .verdict + .tr`],
  steps: [`*${R} .step.miss`],
  rule: [`${R} .rule`, `${R} .rule + .ja`],
  habit: ["#rec-habit", "#rec-habit + .ja"],
  script: [`${SC} .listen`, `${SC} .ja`, `${SC} .points`],
  retry: ["#input", "#send"],
  compare: ["*#log .msg.compare .cmp tbody tr"],
};
// ③ on camera. The chat column only (no rail or panel under 1024 px), so targets live in #log.
await pointer("#input");
await page.fill("#input", demo.mail); // a paste lands at once
await explain(["#input"], CAPTIONS.paste);
await click("#send");
bridge("waitQuestions");
await page.locator("#log .q").first().waitFor({ timeout: 15000 });
await pause(100);
await explain(["#log .q:nth-of-type(1)", "#log .q:nth-of-type(3)"], CAPTIONS.questions);
// Stage R with the tour's fictional sample (0 AI calls): confirm, brief, the mismatch, then the question to ask.
await page.locator(".brief-confirm .inline-btn").waitFor({ timeout: 15000 });
await explain([".brief-confirm"], CAPTIONS.research, 900);
await click(".brief-confirm .inline-btn");
const flag = demo.brief.mismatch_flags[0], check = demo.brief.company_checkpoints[0].question;
await page.waitForFunction((q) => document.querySelector("#log").innerText.includes(q), flag.side_b.quote, { timeout: 15000 });
await page.waitForFunction(() => !document.querySelector("#send").disabled, null, { timeout: 15000 });
await pause(100);
await page.evaluate(({ a, b, c, q }) => {
  const find = (t, tag = "p") => [...document.querySelectorAll(`#log .brief ${tag}`)].find((e) => e.textContent.includes(t));
  find(a).id = "rec-flag-a"; find(b).id = "rec-flag-b"; find(c).id = "rec-flag-c"; find(q, "*:not(div)").id = "rec-check";
}, { a: flag.side_a.quote, b: flag.side_b.quote, c: flag.verify_prompt, q: check });
await explain(["#rec-flag-a", "#rec-flag-b", "#rec-check"], CAPTIONS.brief);
const pick = `#log .q button[data-pick="${demo.pick + 1}"]:not([disabled])`;
await page.evaluate((s) => { document.querySelector(s).closest(".q").id = "rec-pick"; }, pick); // the first match in the regenerated set
await explain(["#rec-pick"], CAPTIONS.pick);
await click(pick);
await pause(200);
if (spoken) { // answer by voice; the transcript lands in the box (fillers kept), checked, then sent
  await click("#mic");
  bridge("mic");
  await pause(1500); // the recording timer runs while the "user" speaks (shortened; 11/06: 1800 → 1500)
  await click("#mic");
  await page.waitForFunction(() => document.querySelector("#input").value.length > 20);
  await pause(100);
  await explain(["#input", "#mic"], CAPTIONS.voice);
} else await type(demo.steps[0].answer, 12); // the off-target answer
await click("#send");
bridge("waitReview");
await page.locator(R).waitFor({ timeout: 15000 });
await page.locator(`${SC} .listen`).waitFor({ timeout: 15000 });
await pause(100);
await explain([`${R} .verdict`, `${R} .verdict + .tr`], CAPTIONS.verdict);
await explain([`${R} .step.miss, ${R} .step.tip`, `${R} .hint`], CAPTIONS.steps);
await explain([`${R} .rule`, `${R} .rule + .ja`], CAPTIONS.rule);
if (spoken && habitRule) { // the spoken filler is caught by the pack's rule
  await page.evaluate(({ id, R }) => { const r = [...document.querySelectorAll(`${R} .rule`)].find((e) => e.textContent.includes(id)); r.id = "rec-habit"; }, { id: habitRule, R });
  await explain(["#rec-habit", "#rec-habit + .ja"], CAPTIONS.habit);
}
// With 🔊: the whole card comes up, the read-along highlight runs while the line plays.
await explain([SC], CAPTIONS.script, 2600, () => click(`${SC} .listen`));
// The same question again, tapped if a quick reply offers it, else by number. The corrected answer is pasted (no human
// types 200 characters in seconds) and labelled as filled with fictional numbers.
const again = page.locator(`#log button[data-pick="${demo.pick + 1}"]:not([disabled])`);
if (await again.count()) await click(`#log button[data-pick="${demo.pick + 1}"]:not([disabled])`);
else { await page.fill("#input", String(demo.pick + 1)); await click("#send"); }
await pause(100);
await pointer("#input");
await page.fill("#input", demo.steps[1].answer);
await explain(["#input"], CAPTIONS.retry);
await click("#send");
bridge("waitAgain");
await page.locator("#log .msg.compare").waitFor({ timeout: 15000 });
await pause(100);
// The peak (benchmark A3): the ✗ → ✓ table grows before it is framed, so it reads at a glance.
await explain(["#log .msg.compare .cmp"], CAPTIONS.compare, 2600, () => page.evaluate(() => { document.querySelector("#log .msg.compare .cmp").style.zoom = "1.9"; }));
await pause(150);
const end = now();
await cdp.send("Page.stopScreencast");
await browser.close();
server.stop();

// Screencast frames arrive only when the page changes: each frame lasts until the next one (variable rate → 30 fps).
const shots = frames.filter((f) => f.t >= start - 1 && f.t <= end);
writeFileSync(`${out}.panels.json`, JSON.stringify({ duration: end - shots[0].t, codeStage, panels: panels.map((p, i) => ({ ...p, t: i ? p.t - shots[0].t : 0 })) }, null, 1));
const list = shots.map((f, i) => `file '${f.file}'\nduration ${((shots[i + 1]?.t ?? end) - f.t).toFixed(3)}`).join("\n");
writeFileSync(join(dir, "list.txt"), `${list}\nfile '${shots.at(-1).file}'\n`);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", join(dir, "list.txt"), "-vf", "scale=1280:1080:flags=lanczos,fps=30", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-movflags", "+faststart", join(dir, "out.mp4")]);
if (cues.length) { // mix the lines in at their caption times (video t = 0 is the first kept frame)
  const t0 = shots[0].t, n = cues.length;
  const filter = cues.map((c, k) => `[${k + 1}:a]aresample=48000,adelay=${Math.max(0, Math.round((c.t - t0) * 1000))}:all=1[a${k}]`).join(";") + `;${cues.map((_, k) => `[a${k}]`).join("")}amix=inputs=${n}:normalize=0:duration=longest[aout]`;
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", join(dir, "out.mp4"), ...cues.flatMap((c) => ["-i", c.wav]), "-filter_complex", filter, "-map", "0:v", "-map", "[aout]", "-c:v", "copy", "-c:a", "aac", "-ar", "48000", "-ac", "1", "-t", String(end - t0), join(dir, "narrated.mp4")]);
  copyFileSync(join(dir, "narrated.mp4"), out);
} else copyFileSync(join(dir, "out.mp4"), out);
console.log(`${out}: ${(end - start).toFixed(1)} s, ${shots.length} frames (one take, ${reviews} reviews${spoken ? `, spoken; habit caption: ${habitRule ?? "none"}` : ""}${cues.length ? `, ${cues.length} narrated captions` : ""}${codeStage ? ", CODE STEP ON SCREEN: PREVIEW only" : ""})`);
