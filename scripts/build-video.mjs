// Builds the whole demo video v8: ① the 15-second opening → ② the promise → ③ the one-take demo (scripts/record-video.mjs
// output) with a headline panel on the left → ⑦ F15 台本を検証 → ⑧ the prep document and the interview stage → ⑨ reverse
// questions → ⑩ the calendar and the practice record → ⑬ who it is for, in two official figures → ④ the same review in Korean and English → ⑪ the other features
// (attachment, desired profile, script check, read-aloud check, habit tally, new rules, closings, debrief, export, kr beta,
// tour, phone) → ⑫ no code, the daily limit, the judges' code → ⑤ how Claude is used and how this was built → ⑥ the
// roadmap and the next person. Storyboard: private 04-video/v8-2026-11-06/storyboard.md (§0 maps every SCORES row to a scene).
// The app runs as submitted: the public mode (OPEN_ACCESS=1, DECISIONS 11/06 17:40). No access code is on screen, not even
// its •••• echo (user 11/06 18:12): the end card only says the judges get it through the submission form.
// Screens are the live app (MOCK server, recorded real outputs, 0 AI calls). Scene changes use a green wipe, never a fade
// through black (v3 blinked black on every still: scene cut measured 11/04).
// NARRATE=1 (+ a local VOICEVOX engine): Japanese narration (scripts/narration.mjs); each scene lasts as long as its
// line. Without it, scenes keep the same reading time, so a silent preview has the final length.
// PREVIEW=1: build even when a scene's data or screen is missing (the F15/F10 fixtures, the stage/calendar/limit selectors
// in SEL); the missing pieces are listed at the end. Without it the build stops at the first one, so the final cannot ship them.
// Usage: NARRATE=1 [PREVIEW=1] | PREVIEW=1 node scripts/build-video.mjs <section3.mp4> <out.mp4>   (needs system Chrome and ffmpeg)
//        node scripts/build-video.mjs --lines   → the narration table as JSON (narration-check.mjs)
import { readFileSync, writeFileSync, mkdtempSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { startServer, launch, CODE, MAIL, ANSWER, micStub } from "../test/ui/harness.js";
import { LANGS } from "../public/i18n/index.js";
import { CPS } from "./narration.mjs";

// Every narration line outside the take (the take's are SAY in record-video.mjs). Model names are written as the engine
// reads them (Haiku → エイチ アイク in v7). The storyboard quotes these verbatim; its cuts table lists every line shortened
// for the 180 s limit (11/06: every SCORES row must be on screen).
const LINES = {
  intro1: "以前の面接で、同じ質問を3回、聞き返されました。結果は、見送り。",
  intro2: "聞かれたことに、答えていなかった。直すと、バツがチェックに変わります。",
  intro3: "見送りで、終わらせない。面接コーチ。",
  promise: "メールを貼るだけで、その会社専用のコーチになります。",
  f15a: "自分の台本も検証できます。質問を選んで、貼るだけ。",
  f15b: "話す時間と、根拠の見つからない文を指摘します。",
  f15c: "嘘と決めつけず、自分で確かめる文として示します。",
  prep1: "準備資料は、暗記用の答えではなく、質問の地図です。",
  stage: "カジュアル面談から内定まで、段階ごとに。",
  prep2: "最初に、必ず確認、と出ます。",
  prep3: "全文を読まず、聞かれていることと話す順序だけを見ます。",
  prep4: "事実には出典。資料にない経験は空欄、自分で埋めます。",
  prep5: "マークダウンでも、持ち出せます。",
  reverse: "逆質問も、会社の情報から作ります。条件の話は、エージェントに。",
  calendar: "面接の日時は、カレンダーに登録。",
  practice: "練習した時刻も残ります。",
  mail: "登録すると、練習のまとめと、今後のメールの見本が、すぐに届きます。",
  impact: "この在留資格で働く外国人は、約47万人。",
  ko: "韓国語の画面なら、解説も翻訳も韓国語。読み方はハングル。",
  en: "英語なら、解説も翻訳も英語。読み方はローマ字。",
  more1: "履歴書の添付、希望条件、台本の自動照合、音読の確認。",
  more2: "口ぐせは2回で警告。締め方は質問の種類で決まり、事実と自己紹介は別。",
  more3: "韓国向けはベータ。ツアーは呼び出しゼロ。スマホでも。",
  limit: "コードは不要。1日の上限で案内が出て、審査用コードで外れます。",
  models: "調査はハイク、質問と台本はソネット、採点はオーパス。",
  built: "開発はクロードコード。スキル、攻撃するサブエージェント、プッシュ前のスキャン。",
  packs: "ルールは、くにごとに分かれています。国も言葉も、増やせます。", // 国ごと reads コクゴト (VOICEVOX 11/07)
  wall: "面接の壁は、言葉の壁ではなく、答え方の壁でした。",
  end: "次に日本で転職する、外国人のために。",
};
if (process.argv.includes("--lines")) { console.log(JSON.stringify(LINES)); process.exit(0); }

// Screens that are being built while this storyboard was written (DECISIONS 11/06: 6 interview stages, calendar, practice
// record, the daily limit instead of the code gate; the F15 ⑤ line on the script card is uncommitted work). Fill these in
// once, nothing else moves. shortcut: null = the scene is skipped under PREVIEW=1 and stops the build otherwise; replace
// with the real selectors when the UI lands.
const SEL = {
  prepStage: "#prepStage", // the stage choice in the prep form #prep (index.html, a <select> of 6)
  prepStageBadge: ".tag.stage", // the stage shown in the prep card (prep.js)
  calendar: { open: ".calendar-open:enabled", input: "#calendarAt", link: "#calendarLink" }, // render.js button, index.html #calendar dialog
  practice: { log: ".practice-log" }, // render.js: the practice record on the question card
  scriptCheck: ".script-check", // the F15 ⑤ line on the generated script card (render.js scriptCheck; the F15 work may rename it)
  // The daily limit: the { code } /api/questions returns at the limit, the notice's selector, the field the judges' code
  // goes into, and the button that sends it (the field's own form: the same selector as Enter would use).
  limit: { code: "quota", notice: "#log .msg:has(.code-field)", unlock: "#log .code-field input", submit: "#log .code-field button" }, // app.js codeField()
};
const PREVIEW = process.env.PREVIEW === "1";
if (!PREVIEW && process.env.NARRATE !== "1") throw new Error("the final build needs NARRATE=1 (a silent build is a preview: PREVIEW=1)");
const skipped = [], missingLines = [];
// say = the line of a scene the skip drops whole (its expected seconds go into the PREVIEW total); none when a stand-in keeps the scene.
const skip = (what, say) => { if (!PREVIEW) throw new Error(`${what}: not available yet (PREVIEW=1 builds without it)`); if (skipped.includes(what)) return; skipped.push(what); if (say) missingLines.push(say); console.warn(`skipped: ${what}`); };
const CODE_STEP = "the public mode (OPEN_ACCESS): the app still asks for a code, so these frames show its prompt and •••• echo";

const [take, out = "demo-full.mp4"] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!take) throw new Error("usage: node scripts/build-video.mjs <section3.mp4> <out.mp4>");
const dir = mkdtempSync(join(tmpdir(), "mensetsu-build-"));
const { duration: takeSec, panels, codeStage } = JSON.parse(readFileSync(`${take}.panels.json`, "utf8"));
// record-video.mjs writes codeStage: false only for a take with no code step on screen; older takes (v7) have none.
if (codeStage !== false) skip(`the take ${codeStage ? "shows the code step" : "predates the code check (v7: its first frames show the code prompt and ••••)"}: re-record it in the public mode`);
const pack = JSON.parse(readFileSync(new URL("../packs/jp.json", import.meta.url), "utf8"));
const steps = pack.answer_structure.steps.map(({ key, label, optional }) => ({ key, label, ...(optional && { optional }) }));
const MAX_SEC = 180;
const INK = "#0c1411", GREEN = "#06c755", SOFT = "#a9d8bd", RED = "#ff7a7a", YELLOW = "#ffe14d";
const FONT = "'Hiragino Sans','Noto Sans JP',sans-serif";
const ffmpeg = (...a) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...a]);
// All limited range: the JPEG screencasts are full range, and the final pass read the stills after the take as full (washed out, also in v5).
const enc = ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-color_range", "tv", "-r", "30", "-crf", "20", "-c:a", "aac", "-ar", "48000", "-ac", "1"];
const durationOf = (f) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString());

const server = await startServer({ STT_ENABLED: "0", OPEN_ACCESS: "1" });
const browser = await launch();
const canvas = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 })).newPage();
let n = 0;
async function snap(html, page = canvas) {
  const file = join(dir, `s${String(++n).padStart(3, "0")}.png`);
  await page.setContent(`<!doctype html><meta charset="utf-8"><body style="margin:0;overflow:hidden;font-family:${FONT}">${html}</body>`);
  await page.waitForTimeout(60);
  await page.screenshot({ path: file });
  return file;
}
const png64 = (f) => `data:image/png;base64,${readFileSync(f).toString("base64")}`;

// The headline panel (benchmark A1/A2): the 4-step usage rail, one big two-tone title, one note, a progress bar.
const RAIL = ["貼る", "調べる", "選ぶ", "答える", "直す"];
function panelHtml({ title, note = "", step, tone }, extra = "") {
  const peak = tone === "peak", [a, b = ""] = title.split("\n");
  const second = tone === "alert" ? RED : peak ? "#fff" : GREEN;
  const rail = step ? `<div style="display:flex;gap:9px;font-size:15px;font-weight:700">${RAIL.map((r, i) => `<span style="color:${i + 1 === step ? (peak ? "#fff" : GREEN) : peak ? "#0a5c30" : "#54675d"}">${String(i + 1).padStart(2, "0")} ${r}</span>`).join("")}</div>` : `<div style="font-size:18px;font-weight:700;color:${GREEN}">面接コーチ</div>`;
  const bar = step ? `<div style="position:absolute;left:28px;right:28px;bottom:30px;height:6px;background:${peak ? "#0a8f43" : "#22332b"}"><div style="height:6px;width:${step * 20}%;background:${peak ? "#fff" : GREEN}"></div></div>` : "";
  return `<div style="position:absolute;left:0;top:0;width:427px;height:720px;box-sizing:border-box;padding:30px 28px;background:${peak ? GREEN : INK};color:${peak ? INK : "#fff"}">
    ${rail}<div style="margin-top:${extra ? 26 : 190}px;font-size:${peak ? 54 : 50}px;font-weight:800;line-height:1.28;letter-spacing:-.5px">${a}<br><span style="color:${second}">${b}</span></div>
    <div style="margin-top:22px;font-size:21px;line-height:1.55;color:${peak ? INK : SOFT};font-weight:600">${note}</div>${extra}${bar}</div>`;
}
const splitHtml = (app, panel) => `<div style="position:absolute;left:427px;top:0;width:853px;height:720px;background:#fff"><img src="${png64(app)}" style="width:853px;height:720px;display:block"></div>${panel}`;

// A moving arrow PNG per direction (user 11/04: interaction instead of still screens). Frames may carry
// arrow: { x, y, dir } = the tip in CSS px of the 1280×720 canvas; it bobs while that frame shows.
const arrowPage = await (await browser.newContext({ viewport: { width: 72, height: 72 }, deviceScaleFactor: 1.5 })).newPage();
const ARROWS = {};
for (const [name, deg] of Object.entries({ right: 0, down: 90, left: 180, up: 270 })) {
  await arrowPage.setContent(`<!doctype html><body style="margin:0;background:transparent"><svg width="72" height="72" viewBox="0 0 48 48" style="transform:rotate(${deg}deg)"><path d="M3 18h24V8l18 16-18 16V30H3z" fill="${YELLOW}" stroke="#111" stroke-width="2" stroke-linejoin="round"/></svg></body>`);
  ARROWS[name] = join(dir, `arrow-${name}.png`);
  await arrowPage.screenshot({ path: ARROWS[name], omitBackground: true });
}
const PX = 108, BOB = 10;
function arrowOverlay({ x, y, dir }) {
  const tx = x * 1.5, ty = y * 1.5, wave = `${BOB}*sin(2*PI*1.7*t)`;
  if (dir === "right") return { x: `${tx - PX}+${wave}`, y: `${ty - PX / 2}` };
  if (dir === "left") return { x: `${tx}+${wave}`, y: `${ty - PX / 2}` };
  if (dir === "down") return { x: `${tx - PX / 2}`, y: `${ty - PX}+${wave}` };
  return { x: `${tx - PX / 2}`, y: `${ty}+${wave}` };
}

// A scene: one or more frames over one narration line. It lasts as long as its line (or the same reading time when
// silent); the time is spread over the frames, so the steps keep moving during the line.
const segs = []; // { file, chapter }
let segN = 0;
const segFile = () => join(dir, `seg${String(segN++).padStart(2, "0")}.mp4`);
let NARR = null;
if (process.env.NARRATE === "1") NARR = (await import("./narration.mjs")).narrate;
// 11/06 (user: too many empty gaps): a scene also shrinks to its line, so no frame outlasts the voice. A cut of 0.7 s or
// more keeps at least 0.7 s (readable); shorter frames are build-up steps and scale freely; keep: true frames never shrink.
const MIN_CUT = 0.7, PAD = 0.15; // PAD: after the line (the wav's own edges add about 0.15 s more)
const fit = (f, k) => (f.keep ? Math.max(f.sec, f.sec * k) : f.sec < MIN_CUT ? f.sec * k : Math.max(MIN_CUT, f.sec * k));
async function scene(chapter, frames, say = "") {
  const line = NARR && say ? await NARR(say) : null;
  const own = frames.reduce((s, f) => s + f.sec, 0);
  const need = line ? line.sec + PAD : say ? say.length / CPS + PAD : 0;
  let k = need ? need / own : 1;
  if (k < 1) { // the smallest k (not under 0.5) whose frames still cover the line (bisection: fit is monotone in k)
    let lo = 0.5, hi = 1;
    for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (frames.reduce((s, f) => s + fit(f, m), 0) >= need) hi = m; else lo = m; }
    k = hi;
  }
  const secs = frames.map((f) => fit(f, k)), total = secs.reduce((s, x) => s + x, 0);
  const file = segFile(), lf = `${file}.txt`;
  writeFileSync(lf, frames.map((f, i) => `file '${f.file}'\nduration ${secs[i].toFixed(3)}`).join("\n") + `\nfile '${frames.at(-1).file}'\n`);
  let clock = 0, chain = "[0:v]scale=1920:1080:flags=lanczos,fps=30[v0]", last = "v0";
  const inputs = [];
  frames.forEach((f, i) => {
    const a = clock, b = (clock += secs[i]);
    if (!f.arrow) return;
    const o = arrowOverlay(f.arrow);
    inputs.push("-i", ARROWS[f.arrow.dir]);
    const idx = inputs.length / 2 + 1, tag = `v${i + 1}`;
    chain += `;[${last}][${idx}:v]overlay=x='${o.x}':y='${o.y}':enable='between(t,${a.toFixed(3)},${b.toFixed(3)})':eof_action=repeat[${tag}]`;
    last = tag;
  });
  const audio = line ? ["-i", line.wav] : ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono"];
  const af = line ? "[1:a]adelay=50:all=1,apad[a]" : "[1:a]anull[a]";
  ffmpeg("-f", "concat", "-safe", "0", "-i", lf, ...audio, ...inputs, "-filter_complex", `${chain};${af}`, "-map", `[${last}]`, "-map", "[a]", "-t", total.toFixed(3), ...enc, file);
  segs.push({ file, chapter });
  return file;
}
const rectOf = (sel, page = canvas) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, sel);
const reveal = async (a, b, ...colors) => [
  { file: await snap(big(a.slice(0, Math.ceil(a.length / 2)), "", ...colors)), sec: 0.3 },
  { file: await snap(big(a, "", ...colors)), sec: 0.4 },
  { file: await snap(big(a, b.slice(0, Math.ceil(b.length / 2)), ...colors)), sec: 0.4 },
  { file: await snap(big(a, b, ...colors)), sec: 1 },
];

const big = (a, b, bg = INK, ca = "#fff", cb = GREEN) => `<div style="position:absolute;inset:0;background:${bg};display:flex;flex-direction:column;justify-content:center;padding:0 90px;font-size:84px;font-weight:900;line-height:1.3;letter-spacing:-1px"><div style="color:${ca}">${a}</div><div style="color:${cb};min-height:109px">${b}</div></div>`;
// ① A 15-second TV-spot opening with one selling point (user 11/04): the same question, ✗ becomes ✓. The interview's
// outcome is the author's own (user confirmed 見送り). Marks come from the recorded review data, never drawn by hand;
// the optional 復唱 is left out because it is a tip, not a ✗.
{
  const tag = `<span style="position:absolute;left:64px;top:36px;background:${YELLOW};color:${INK};font-size:27px;font-weight:800;padding:6px 16px">韓国出身のエンジニア</span>`;
  const slam = (a, b, c = RED, size = 120) => `<div style="position:absolute;inset:0;background:${INK};color:#fff">${tag}<div style="position:absolute;left:64px;right:64px;top:210px;font-size:58px;font-weight:800">${a}</div><div style="position:absolute;left:64px;right:64px;top:300px;font-size:${size}px;line-height:1.2;font-weight:900;color:${c}">${b}</div></div>`;
  await scene(1, [
    { file: await snap(slam("以前の面接で、同じ質問を", "")), sec: 0.7 },
    { file: await snap(slam("以前の面接で、同じ質問を", "3回、聞き返された。", YELLOW, 92)), sec: 2.6 },
    { file: await snap(slam("結果は、", "見送り。", RED, 180)), sec: 2.2 },
  ], LINES.intro1);

  const d = JSON.parse(readFileSync(new URL("../public/demo/demo-ja.json", import.meta.url), "utf8"));
  const [first, last] = [d.steps[0].review, d.steps[1].review];
  const rows = [["質問に答えている", first.answers_question === "yes", last.answers_question === "yes"], ...steps.filter((x) => !x.optional).map((x) => [x.label, first.steps[x.key].present, last.steps[x.key].present])];
  if (rows.some(([, a, z]) => a || !z)) throw new Error("the recording no longer goes from all ✗ to all ✓: rewrite the opening");
  const table = (flipped) => `<div style="position:absolute;inset:0;background:${INK};color:#fff;padding:44px 90px;box-sizing:border-box"><div style="font-size:50px;font-weight:900;margin-bottom:24px">同じ質問に、答え直す</div>
    <table style="width:100%;border-collapse:collapse;font-size:44px;font-weight:800"><tr style="font-size:26px;color:${SOFT}"><td></td><td style="text-align:center;width:190px">最初</td><td style="text-align:center;width:190px">答え直し</td></tr>
    ${rows.map(([label], i) => `<tr style="border-top:2px solid #22332b"><td style="padding:16px 0">${label}</td><td style="text-align:center;color:${RED};font-size:62px">✗</td><td data-row="${i}" style="text-align:center;color:${GREEN};font-size:62px">${i < flipped ? "✓" : ""}</td></tr>`).join("")}</table>
    <div style="position:absolute;right:90px;bottom:26px;font-size:20px;color:${SOFT};font-weight:600">実際の出力から作成</div></div>`;
  const frames = [...(await reveal("聞かれたことに、", "答えていなかった。", INK, "#fff", RED)).map((f) => ({ ...f, sec: f.sec * 0.75 })), { file: await snap(table(0)), sec: 0.5 }];
  for (let k = 1; k <= rows.length; k++) {
    const file = await snap(table(k)), r = await rectOf(`[data-row="${k - 1}"]`);
    frames.push({ file, sec: 0.6, arrow: { x: r.x + r.w - 20, y: r.y + r.h / 2, dir: "left" } });
  }
  await scene(1, frames, LINES.intro2);
  await scene(1, [{ file: await snap(`<div style="position:absolute;inset:0;background:${GREEN};color:${INK};display:flex;flex-direction:column;justify-content:center;align-items:center"><div style="font-size:110px;font-weight:900;color:#fff;letter-spacing:18px">✓✓✓✓</div><div style="font-size:82px;font-weight:900;margin-top:12px">見送りで、終わらせない。</div><div style="font-size:40px;font-weight:800;margin-top:22px">面接コーチ</div></div>`), sec: 2.3 }], LINES.intro3);
  const opening = segs.reduce((sum, s) => sum + durationOf(s.file), 0);
  if (opening > 15) throw new Error(`the opening is ${opening.toFixed(1)} s, over 15 s`);
}

// Recorded answers instead of Claude (0 AI calls), served from the page.
const demoOf = (lang) => JSON.parse(readFileSync(new URL(`../public/demo/demo-${lang}.json`, import.meta.url), "utf8"));
const routeAnswers = (page, answers) => page.route("**/api/**", (r) => { const p = new URL(r.request().url()).pathname; return answers[p] ? r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(answers[p]()) }) : r.continue(); });
const sessionAnswers = (demo) => ({
  "/api/access": () => ({ ok: true, open: true, stt: false }), // the submission's public mode: no code asked
  "/api/questions": () => ({ company_context: demo.company_context, questions: demo.questions, specificity: demo.specificity, pack: { id: "jp", target: "ja", steps } }),
  "/api/review": () => demo.steps[0].review,
  "/api/script": () => demo.steps[0].script,
});
// The access code only while the app still asks for one (DECISIONS 11/06 17:25: the gate becomes a daily limit, the
// judges' code lifts it). body[data-stage] is the app's own marker. The submission has no code step (OPEN_ACCESS=1), so a
// page that still asks for one is listed (CODE_STEP) and stops a final build.
async function enterCode(page) {
  if (await page.evaluate(() => document.body.dataset.stage !== "code")) return;
  skip(CODE_STEP);
  await page.fill("#input", CODE);
  await page.click("#send");
  await page.waitForFunction(() => document.body.dataset.stage !== "code" && !document.querySelector("#send").disabled);
}
// A live page in the take's width (one column), for the split screens. routes: answers served before the page loads.
const APP = { width: 854, height: 720 };
async function live(lang, { dest, viewport = APP, init, routes } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1.5, locale: lang, acceptDownloads: true });
  await ctx.addInitScript((l) => { try { localStorage.setItem("mensetsu-lang", l); } catch {} }, lang);
  if (init) await ctx.addInitScript(init, {});
  const page = await ctx.newPage();
  if (routes) await routeAnswers(page, routes);
  await page.goto(server.url);
  await page.locator(".msg.coach").first().waitFor();
  if (await page.evaluate(() => document.body.dataset.stage === "code")) skip(CODE_STEP); // the tour and the menus run before any code
  if (dest) await page.evaluate((d) => { const s = document.querySelector("#dest"); s.value = d; s.dispatchEvent(new Event("change", { bubbles: true })); }, dest);
  await page.waitForTimeout(350);
  return { ctx, page };
}
// No code on screen (user 11/06 18:12): the chat's •••• echo of an entered code must be out of view in every app frame.
const echoInView = (page) => page.evaluate(() => [...document.querySelectorAll("#log .msg.me")].some((m) => { const r = m.getBoundingClientRect(); return m.textContent.trim() === "••••" && r.bottom > 0 && r.top < innerHeight; }));
const appShot = async (page) => {
  if (await echoInView(page)) skip(CODE_STEP);
  const file = join(dir, `a${String(++n).padStart(3, "0")}.png`);
  await page.screenshot({ path: file });
  return file;
};
const SCRIPT = "#log .msg.script:not(.review)", REVIEW = "#log .msg.review";
// A session up to the review and script of the first answer; second: the corrected answer too (the ✗ → ✓ table, the
// habit tally with its ⚠). access: fields of the /api/access answer (stt: true for the 🎤 and the read-aloud check).
async function reviewed(lang, { viewport, access, init, routes, second } = {}) {
  const demo = demoOf(lang);
  let reviews = 0, scripts = 0;
  const { ctx, page } = await live(lang, { viewport, init, routes: { ...sessionAnswers(demo), "/api/access": () => ({ ok: true, open: true, stt: false, ...access }), "/api/review": () => demo.steps[Math.min(reviews++, 1)].review, "/api/script": () => demo.steps[Math.min(scripts++, 1)].script ?? demo.steps[0].script, ...routes } });
  await enterCode(page);
  const send = async (t) => { await page.fill("#input", t); await page.click("#send"); };
  await send(demo.mail); await page.locator("#log .q").first().waitFor();
  const answer = async (i) => { await send(String(demo.pick + 1)); await page.waitForTimeout(250); await send(demo.steps[i].answer); await page.locator(i ? "#log .msg.compare" : `${SCRIPT} .listen`).waitFor({ timeout: 15000 }); };
  await answer(0);
  if (second) await answer(1);
  await page.evaluate(() => { for (const d of document.querySelectorAll("#log details")) d.open = true; });
  await page.waitForTimeout(250);
  return { ctx, page, demo };
}

// ② The promise.
{
  const { ctx, page } = await live("ja");
  await enterCode(page); // the mail field, not the code field, even in a PREVIEW of an app that still asks for a code
  const box = await page.locator("#input").boundingBox(), S = 853 / 854;
  const promise = { title: "メールを\n貼るだけ", note: "その会社専用の面接コーチになります" }, arrow = { x: 427 + (box.x + box.width / 2) * S, y: box.y * S - 6, dir: "down" };
  const empty = await snap(splitHtml(await appShot(page), panelHtml(promise)));
  await page.fill("#input", demoOf("ja").mail);
  await page.waitForTimeout(150);
  const after = await page.locator("#input").boundingBox();
  await scene(2, [{ file: empty, sec: 1.0, arrow }, { file: await snap(splitHtml(await appShot(page), panelHtml(promise))), sec: 2.1, arrow: { ...arrow, y: after.y * S - 6 } }], LINES.promise);
  await ctx.close();
}

// ③ The take with its headline track: each panel slides in over the last one.
const panelPage = await (await browser.newContext({ viewport: { width: 427, height: 720 }, deviceScaleFactor: 1.5 })).newPage();
const panelFiles = [];
for (const p of panels) panelFiles.push(await snap(panelHtml(p), panelPage));
{
  const hasAudio = execFileSync("ffprobe", ["-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", take]).toString().trim() !== "";
  const chain = panels.map((p, i) => {
    const t = i ? p.t.toFixed(3) : "-1";
    return `[${i + 1}:v]scale=640:1080[p${i}];[v${i}][p${i}]overlay=x='if(lt(t-${t},0.2),-640+640*(t-${t})/0.2,0)':y=0:enable='gte(t,${t})':eof_action=repeat[v${i + 1}]`;
  }).join(";");
  const file = segFile();
  const filter = `[0:v]scale=1280:1080:flags=lanczos:out_range=tv,pad=1920:1080:640:0:color=${INK}[v0];${chain}`;
  const audio = hasAudio ? ["-map", "0:a"] : ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono", "-map", `${panels.length + 1}:a`];
  ffmpeg("-i", take, ...panelFiles.flatMap((f) => ["-i", f]), ...(hasAudio ? [] : audio.slice(0, 4)), "-filter_complex", filter, "-map", `[v${panels.length}]`, ...(hasAudio ? audio : audio.slice(4)), "-t", takeSec.toFixed(3), ...enc, file);
  segs.push({ file, chapter: 3 });
}

// A Japanese explanation beside the screen (user 11/04): each note sits at the height of the line it explains, joined by a short rule.
async function annotated(page, target, sels, panel, sec = 1.15) {
  await page.evaluate((s) => { const el = document.querySelector(s); let sc = el.parentElement; while (sc && !/(auto|scroll)/.test(getComputedStyle(sc).overflowY)) sc = sc.parentElement; if (sc) sc.scrollTop += el.getBoundingClientRect().top - sc.getBoundingClientRect().top - 8; }, target);
  await page.waitForTimeout(150);
  const rects = await page.evaluate((list) => list.map(([s]) => { const r = document.querySelector(s)?.getBoundingClientRect(); return r && { x: r.x, y: r.y, w: r.width, h: Math.min(r.height, 720 - r.y) }; }), sels);
  const scale = 853 / 854, shot = await appShot(page), out = [];
  let prev = -99;
  const ys = rects.map((r) => (r ? (prev = Math.max(panel.note ? 320 : 250, r.y * scale + 22, prev + 50)) : 0));
  const mark = (i) => {
    const r = rects[i], [, label] = sels[i], y = ys[i], left = 427 + r.x * scale, reaches = y >= r.y * scale && y <= (r.y + r.h) * scale;
    return `<div style="position:absolute;left:${left - 6}px;top:${r.y * scale - 5}px;width:${r.w * scale + 12}px;height:${r.h * scale + 10}px;border:3px solid ${YELLOW};box-sizing:border-box;border-radius:6px"></div>
      <div style="position:absolute;left:28px;top:${y - 22}px;width:320px;color:${YELLOW};font-size:27px;font-weight:800;line-height:1.3">${label}</div>
      ${reaches ? `<div style="position:absolute;left:350px;top:${y}px;width:${left - 356}px;height:3px;background:${YELLOW}"></div>` : ""}`;
  };
  const shown = sels.map((_, i) => i).filter((i) => rects[i] && rects[i].y <= 640);
  for (let k = 1; k <= shown.length; k++) {
    const r = rects[shown[k - 1]], down = sels[shown[k - 1]][2] === "down"; // an inline target: from the side the arrow would cover its sentence
    out.push({ file: await snap(splitHtml(shot, panelHtml(panel, " ")) + shown.slice(0, k).map(mark).join("")), sec, arrow: down ? { x: 427 + (r.x + r.w / 2) * scale, y: r.y * scale - 2, dir: "down" } : { x: 427 + r.x * scale - 8, y: r.y * scale + Math.min(r.h, 60) / 2, dir: "right" } });
  }
  return out;
}
// A montage cut (⑪, 1.0–1.5 s each): the last of annotated()'s frames, which carries every mark at once. annotated()
// returns none when its target is missing or below the fold, which would reach ffmpeg as `file 'undefined'`.
const one = (frames, sec = 1.0) => {
  if (!frames.length) throw new Error("no frame for a montage cut: its target is missing or off screen");
  return { ...frames.at(-1), sec };
};
// A downloaded Markdown file as a page: its name, then the given lines (HTML); [data-m] spans get the arrow.
const esc = (x) => x.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const mdView = (name, rows) => `<div style="position:absolute;left:427px;top:0;width:853px;height:720px;box-sizing:border-box;background:#fff;color:#1b1f1d;padding:30px 34px;font-size:22px;line-height:1.6;white-space:pre-wrap;word-break:break-all">
<div style="font:700 20px Menlo,monospace;color:#047a35;margin-bottom:14px">${esc(name)}</div>${rows.join("\n\n")}</div>`;
const mdLine = (md, re) => { const l = md.find((x) => re.test(x)); if (!l) throw new Error(`no ${re} in the Markdown`); return l; };
async function mdFrame(html, panel, sec = 1) { // the arrow on the last [data-m] span
  const file = await snap(html + panelHtml(panel)), r = await rectOf("[data-m]:last-of-type");
  return { file, sec, arrow: { x: Math.max(440, r.x - 6), y: r.y + 14, dir: "right" } };
}

// ⑦ F15 台本を検証 (v8): the real screen — the ［台本を検証］ mode button, #verifyMaterial, the ④⑤ card. Data: `verify` in
// public/demo/demo-ja.json once record-demo.mjs records it (script, material, review, verify: real outputs); until then
// PREVIEW=1 shows the MOCK fixture (test/fixtures/verify.json) and the recorded review of another text, and says so.
{
  const demo = demoOf("ja"), V = demo.verify;
  if (!V) skip("F15 verify data (public/demo/demo-ja.json `verify`, record-demo.mjs): the MOCK fixture stands in");
  const script = V?.script ?? "ご質問は、志望動機ですね。御社の理念に感動したので志望しました。前職では新しいシステムの導入で売上を三倍にしました。その経験を、御社の在庫管理サービスの改善に生かしたいと考えています。入社後は、まず［ここに担当したい領域］を担当し、半年で成果を出したいと考えています。";
  const material = V?.material ?? "サンプル物流（架空） 在庫管理システムの開発を担当。";
  const { ctx, page } = await live("ja", { routes: { ...sessionAnswers(demo), "/api/review": () => V?.review ?? demo.steps[1].review, ...(V && { "/api/verify": () => V.verify }) } });
  await enterCode(page);
  const send = async (t) => { await page.fill("#input", t); await page.click("#send"); };
  await send(demo.mail); await page.locator("#log .q").first().waitFor();
  await send(String(demo.pick + 1)); await page.locator("#log .pick-mode").last().waitFor();
  await page.evaluate(() => { [...document.querySelectorAll("#log .pick-mode")].at(-1).id = "rec-verify-btn"; }); // the second mode button: 台本を検証
  const panel = { title: "自分の台本も\n検証", note: "質問を選んで、貼るだけ" };
  const a = await annotated(page, "#rec-verify-btn", [["#rec-verify-btn", "台本を検証、を押す"]], panel, 1.3);
  await page.click("#rec-verify-btn");
  await page.locator("body[data-stage=verify]").waitFor();
  await page.fill("#verifyMaterial", material);
  await page.fill("#input", script);
  await page.waitForTimeout(150);
  const b = await annotated(page, "#verifyMaterial", [["#verifyMaterial", "履歴書を貼る（任意・架空）"], ["#input", "台本を貼る"]], panel, 1.3);
  await scene(7, [...a, ...b], LINES.f15a);
  await page.click("#send");
  const VC = "#log > .msg.verify";
  await page.locator(VC).waitFor({ timeout: 15000 });
  await page.locator("#log > .msg.review").waitFor({ timeout: 15000 });
  await page.waitForTimeout(250);
  const found = { title: "話す時間と\n根拠", note: "資料から見つからない文を示す" };
  // ①②③: the same review as an answer gets, numbered in this mode (render.js renderReview checking); ④⑤ in the card after it.
  await page.evaluate(() => { document.querySelectorAll("#log > .msg.review .title").forEach((t, i) => { t.id = `rec-part${i + 1}`; }); });
  const parts = one(await annotated(page, "#rec-part1", [["#rec-part1", "① 質問に答えているか"], ["#rec-part2", "② 4文型"], ["#rec-part3", "③ ルールの添削"]], { title: "台本を\n①〜⑤で検証", note: "①②③は、回答と同じ確認" }), 1.1);
  await scene(7, [parts, ...await annotated(page, VC, [[`${VC} .step`, "④ 超えたときだけ注意"], [`${VC} .ja`, "⑤ 根拠が見つからない文"]], found, 1.1)], LINES.f15b);
  await scene(7, await annotated(page, VC, [[`${VC} .legend`, "嘘とは言わない"]], found, 2.6), LINES.f15c);
  await ctx.close();
}

// ⑧ The prep document (user 11/05): the real flow on the MOCK server, fictional data only (test/fixtures/prep.json, research.json),
// shown as a question map, ending on the card and the Markdown it really downloads. The interview stage (v8) is chosen in
// the same form and shown on the card (SEL.prepStage, SEL.prepStageBadge). The same page (RESEARCH_ENABLED) also gives the
// frames of the desired profile (#desired, options) and the debrief (F17, #debrief) for ⑪, and the F10 rule line for ⑨.
let desiredFrames, debriefFrames, f10Frame;
{
  const prepServer = await startServer({ PREP_ENABLED: "1", RESEARCH_ENABLED: "1", STT_ENABLED: "0", OPEN_ACCESS: "1" });
  const ctx = await browser.newContext({ viewport: APP, deviceScaleFactor: 1.5, locale: "ja", acceptDownloads: true });
  await ctx.addInitScript(() => { try { localStorage.setItem("mensetsu-lang", "ja"); localStorage.setItem("mensetsu-tour-tips", "1"); } catch {} });
  const page = await ctx.newPage();
  await page.goto(prepServer.url);
  await page.locator(".msg.coach").first().waitFor();
  const send = async (t) => { await page.fill("#input", t); await page.click("#send"); };
  await enterCode(page);
  await send(MAIL); await page.locator(".brief-confirm .inline-btn").waitFor();
  await page.locator(".brief-confirm input").first().fill("株式会社サンプルテック（仮）");
  await page.locator(".brief-confirm input").nth(1).fill("プロダクトマネージャー");
  await page.locator(".brief-confirm .inline-btn").first().click();
  await page.locator("#log > .msg.brief:not(.brief-confirm)").last().waitFor();
  await page.waitForFunction(() => !document.querySelector("#send").disabled, null, { timeout: 20000 });
  await page.evaluate(() => { for (const e of document.querySelectorAll("#log .q .tr")) e.style.display = "none"; }); // the fixture's Korean line: a Japanese screen has none
  // The desired profile (⑪): the options dialog, three fictional conditions; the hint says they only feed the comparison.
  await page.click("#opts");
  await page.locator("#options[open] #desired:not([hidden])").waitFor();
  await page.fill("[data-desired=min_salary_man]", "600");
  await page.fill("[data-desired=remote_min_days]", "3");
  await page.selectOption("[data-desired=employment_required]", "seishain");
  desiredFrames = await annotated(page, "#desired", [["#desiredHint", "比較にだけ使う。検索には送らない"], ["[data-desired=min_salary_man]", "希望条件（架空）"]], { title: "希望の条件は\n比較にだけ", note: "このブラウザに保存" }, 1.0);
  await page.keyboard.press("Escape");
  await page.locator("#options").waitFor({ state: "hidden" }); // a closed <dialog> is never "visible"
  const panel = { title: "答えではなく\n質問の地図", note: "全文を読まない" };
  const opened = await page.locator("#log .prep-ctl").count();
  if (!opened) throw new Error("no prep button: PREP_ENABLED did not reach the app");
  const flow = [...await annotated(page, "#log .prep-ctl", [["#log .prep-ctl", "このボタンから"]], panel, 0.9)];
  await page.locator("#log .prep-ctl").first().click();
  await page.locator("#prepMaterial").fill("サンプル物流（架空） 在庫管理システムの開発を担当。");
  // The app's file control is drawn by Chrome in the machine's language, not the page's: hidden for this one frame.
  await page.evaluate(() => { document.querySelector("#prepFile").style.visibility = "hidden"; });
  flow.push(...await annotated(page, "#prep", [["#prepMaterial", "履歴書を貼る（架空）"]], panel, 0.9));
  const stagePanel = { title: "段階ごとの\n資料", note: "カジュアル面談から内定まで" };
  let stageFrames = [];
  if (SEL.prepStage && await page.locator(SEL.prepStage).count()) {
    await page.selectOption(SEL.prepStage, { index: 3 });
    await page.evaluate((s) => { const e = document.querySelector(s); if (e.tagName === "SELECT") e.size = e.options.length; }, SEL.prepStage); // all six stages visible in the frame
    stageFrames = await annotated(page, "#prep", [[SEL.prepStage, "面接の段階を選ぶ（6種）"]], stagePanel, 1.2);
    await page.evaluate((s) => { const e = document.querySelector(s); if (e.tagName === "SELECT") e.size = 0; }, SEL.prepStage);
    await page.selectOption(SEL.prepStage, "first"); // the scenes below read the first-interview document's sections
  } else skip("interview stage in the prep form (SEL.prepStage)", LINES.stage);
  let release;
  const gate = new Promise((r) => { release = r; });
  await page.route("**/api/prep", async (r) => { await gate; await r.continue(); });
  await page.locator("#prepSubmit").click();
  await page.locator("#log .msg.typing .wait-label").waitFor({ state: "visible", timeout: 6000 });
  flow.push(...await annotated(page, "#log .msg.typing", [["#log .msg.typing", "資料を作っています"]], panel, 0.7));
  release();
  const CARD = "#log > .msg.prep";
  await page.locator(CARD).waitFor({ timeout: 30000 });
  await page.waitForTimeout(200);
  flow.push(...await annotated(page, CARD, [[`${CARD} .title`, "架空の会社の資料"]], panel, 0.9));
  await scene(8, flow, LINES.prep1);
  if (stageFrames.length) {
    const badge = SEL.prepStageBadge && await page.locator(`${CARD} ${SEL.prepStageBadge}`).count() ? await annotated(page, CARD, [[`${CARD} ${SEL.prepStageBadge}`, "段階に合わせた資料"]], stagePanel, 1.2) : [];
    await scene(8, [...stageFrames, ...badge], LINES.stage);
  }
  const notice = await annotated(page, CARD, [[`${CARD} .caution`, "誤りを含む。必ず確認"]], panel, 0.8);
  await page.evaluate((C) => { document.querySelector(`${C} .caution`).style.zoom = "1.5"; }, CARD);
  notice.push(...await annotated(page, CARD, [[`${CARD} .caution`, "誤りを含む。必ず確認"]], panel, 1.6));
  await page.evaluate((C) => { document.querySelector(`${C} .caution`).style.zoom = ""; }, CARD);
  await scene(8, notice, LINES.prep2);
  await page.evaluate((C) => {
    const c = document.querySelector(C), sec = (k) => c.querySelector(`[data-section=${k}]`);
    sec("how_to_use").open = true;
    const by = (box, sel, t) => [...box.querySelectorAll(sel)].find((e) => e.textContent.includes(t));
    by(sec("how_to_use"), ".claim", "全文を読まない").id = "rec-howto";
    by(sec("self_intro"), ".legend", "聞かれていること").id = "rec-asked";
    by(sec("self_intro"), ".legend", "話す順序").id = "rec-order";
  }, CARD);
  await scene(8, await annotated(page, "#rec-howto", [["#rec-howto", "全文を読まない"], ["#rec-asked", "聞かれていること"], ["#rec-order", "話す順序"]], panel, 1.1), LINES.prep3);
  await page.evaluate((C) => {
    const c = document.querySelector(C), sec = (k) => c.querySelector(`[data-section=${k}]`);
    sec("how_to_use").open = false;
    sec("company_position").open = true;
    const fact = sec("company_position").querySelector(".claim");
    fact.id = "rec-fact";
    fact.nextElementSibling.querySelector("a").id = "rec-link";
    const p = [...sec("self_intro").querySelectorAll("p.ja")].find((e) => e.textContent.includes("［ここに"));
    p.id = "rec-example";
    p.innerHTML = p.textContent.replace(/［ここに[^］]*］/, (m) => `<span id="rec-blank">${m}</span>`);
    document.querySelector("#rec-blank").style.background = "#ffe14d";
  }, CARD);
  const fact = await annotated(page, "#rec-fact", [["#rec-fact", "会社の事実"], ["#rec-link", "出典のリンク"]], panel, 1);
  const blank = await annotated(page, "#rec-example", [["#rec-blank", "空欄は自分の事実で", "down"]], panel, 1.3);
  await scene(8, [...fact, ...blank], LINES.prep4);
  // Its Markdown: the real downloaded file, those lines verbatim.
  await page.evaluate((C) => document.querySelector(C).scrollIntoView(), CARD);
  const [dl] = await Promise.all([page.waitForEvent("download"), page.locator(CARD).getByRole("button", { name: "Markdown をダウンロード" }).click()]);
  const md = readFileSync(await dl.path(), "utf8").split("\n"), line = (re) => mdLine(md, re);
  const name = dl.suggestedFilename();
  const rows = (on) => [
    `<b>${esc(line(/^# /))}</b>`,
    `<span data-m="0"${on > 0 ? ` style="background:${YELLOW}"` : ""}>${esc(line(/^> ⚠ AI/))}</span>`,
    `${esc(line(/全文を読まない/))}`,
    esc(line(/^- 会社: .*\[s1\]/)).replace(/\(\[s1\]\((.*?)\)\)/, (_, u) => `<span data-m="1" style="display:inline-block;word-break:normal${on > 1 ? `;background:${YELLOW}` : ""}">([s1](${u}))</span>`),
    esc(line(/［ここに直近/)).replace(/［ここに[^］]*］/, (m) => `<span data-m="2"${on > 2 ? ` style="background:${YELLOW}"` : ""}>${m}</span>`),
  ];
  const frames = [];
  for (let k = 1; k <= 3; k++) {
    const file = await snap(mdView(name, rows(k)) + panelHtml({ title: "Markdown\nでも", note: "そのまま持ち出せる" })), r = await rectOf(`[data-m="${k - 1}"]`);
    frames.push({ file, sec: 0.85, arrow: k === 3 ? { x: r.x + r.w / 2, y: r.y - 2, dir: "down" } : { x: Math.max(440, r.x - 6), y: r.y + 14, dir: "right" } });
  }
  await scene(8, frames, LINES.prep5);
  // F10's rule (⑨): the pack's section label in the same file — prepare 4–8, pick 2–3 (packs/jp.json script_doc).
  f10Frame = await mdFrame(mdView(name, [`<b>${esc(line(/^# /))}</b>`, `<span data-m="0" style="background:${YELLOW}">${esc(line(/4〜8問/))}</span>`]), { title: "逆質問は\n4〜8問", note: "時間に合わせて 2〜3問を選ぶ" }, 1.2);
  // F17 the debrief (⑪): after one answer the quick replies offer 面接の振り返り; the dialog counts the overlap with the questions.
  // The recorded review and script answer it: the MOCK fixtures are Korean, and a Japanese screen refuses them (502).
  await routeAnswers(page, { "/api/review": () => demoOf("ja").steps[0].review, "/api/script": () => demoOf("ja").steps[0].script });
  await send("1"); await page.waitForTimeout(250);
  await send(ANSWER);
  await page.locator("#log > .quick button", { hasText: LANGS.ja.debrief.button }).waitFor({ timeout: 15000 });
  await page.evaluate((t) => { [...document.querySelectorAll("#log > .quick button")].find((b) => b.textContent.includes(t)).id = "rec-debrief"; }, LANGS.ja.debrief.button);
  const asked = await page.locator("#log .q").first().evaluate((q) => q.querySelector(".ja")?.textContent ?? q.textContent);
  await page.click("#rec-debrief");
  await page.locator("#debrief[open]").waitFor();
  await page.fill("[data-debrief=asked]", asked.trim().split("\n")[0]);
  await page.fill("[data-debrief=difficult]", "数字を聞かれて、すぐに答えられなかった（架空）");
  await page.waitForTimeout(150);
  debriefFrames = await annotated(page, "#debrief form", [["[data-debrief=asked]", "実際に聞かれた質問"], ["#debriefOverlap", "作った質問との重なり"]], { title: "面接の\n振り返り", note: "企業ごとに、このブラウザにだけ" }, 1.0);
  await ctx.close();
  prepServer.stop();
}

// ⑨ F10 reverse questions (v8): the quick reply under the first result, then the card, then the pack's rule in the prep
// Markdown (prepare 4–8, pick 2–3). Data: `reverse` in demo-ja.json once record-demo.mjs records it; until then
// PREVIEW=1 uses the MOCK fixture (test/fixtures/reverse.json), whose Korean ねらい lines are hidden, as a Japanese screen would not have them.
{
  const demo = demoOf("ja"), RV = demo.reverse;
  if (!RV) skip("F10 reverse data (public/demo/demo-ja.json `reverse`, record-demo.mjs): the MOCK fixture stands in");
  // Served from here, not the MOCK server: its language check refuses the fixture's Korean ねらい on a Japanese screen.
  const data = RV ?? JSON.parse(readFileSync(new URL("../test/fixtures/reverse.json", import.meta.url), "utf8"));
  const { ctx, page } = await reviewed("ja", { routes: { "/api/reverse": () => data } });
  await page.locator("#log > .quick button", { hasText: "逆質問を作る" }).waitFor();
  await page.evaluate(() => { [...document.querySelectorAll("#log > .quick button")].find((b) => b.textContent.includes("逆質問を作る")).id = "rec-reverse"; });
  const panel = { title: "逆質問も\n会社の情報から", note: "条件の質問はエージェントへ" };
  const a = await annotated(page, "#rec-reverse", [["#rec-reverse", "ボタンひとつ"]], panel, 1.1);
  await page.click("#rec-reverse");
  const RC = "#log > .msg.reverse";
  await page.locator(RC).waitFor({ timeout: 15000 });
  if (!RV) await page.evaluate((R) => { for (const e of document.querySelectorAll(`${R} .tr`)) e.style.display = "none"; }, RC);
  await page.waitForTimeout(250);
  await scene(9, [...a, ...await annotated(page, RC, [[`${RC} .ja`, "会社の情報から"], [`${RC} p:last-child`, "条件はエージェントへ"]], panel, 1.5), f10Frame], LINES.reverse);
  await ctx.close();
}

// ⑩ The interview date → calendar, and the practice record (v8, screens being built: SEL.calendar, SEL.practice).
{
  const { ctx, page } = await reviewed("ja");
  const C = SEL.calendar, P = SEL.practice;
  if (C.open && await page.locator(C.open).count()) {
    await page.click(C.open);
    await page.fill(C.input, "2026-12-01T10:00");
    await page.waitForTimeout(200);
    await scene(10, await annotated(page, C.input, [[C.input, "架空の日時を入れる"], [C.link, "カレンダーに登録"]], { title: "面接の日時を\nカレンダーへ", note: "Google カレンダーに登録" }, 1.3), LINES.calendar);
  } else skip("calendar (SEL.calendar)", LINES.calendar);
  if (P.log && await page.locator(P.log).count()) await scene(10, await annotated(page, P.log, [[P.log, "練習した時刻"]], { title: "練習の\n記録", note: "いつ練習したかが残る" }, 1.6), LINES.practice);
  else skip("practice record (SEL.practice)", LINES.practice);
  await ctx.close();
}

// ⑩b Mail signup (user 11/07): after the save, the dialog sends ① a digest and ② a preview at once. MOCK sends nothing
// (dev.js fake mailer); the inbox frame quotes the first lines of the two mails production really delivered on 11/07 for
// the synthetic job mail (Japanese screen, another practice than the take's), so it is labelled as real output. Quoted
// verbatim from the saved bodies (private 05-raw/scores/mail-20261107/ja-1-digest-*.txt, ja-2-preview-*.txt); "…" marks a cut.
{
  const { ctx, page } = await reviewed("ja", { access: { mail: true } });
  await Promise.all([page.waitForEvent("download"), page.click("#end")]);
  await page.locator("#mail[open]").waitFor();
  await page.fill("#mailEmail", "you@example.com");
  const a = await annotated(page, "#mail", [["#mailEmail", "メールアドレスだけ"], ["#mailSubmit", "すぐに2通届く"]], { title: "練習のまとめを\nメールで", note: "登録すると、すぐに届く" }, 1.3);
  await ctx.close();
  const card = (subject, lines) => `<div style="background:#fff;border-radius:12px;padding:18px 22px;margin-bottom:18px;box-shadow:0 2px 10px rgba(0,0,0,.25)">
    <div style="font-size:21px;font-weight:800;color:${INK}">${subject}</div>${lines.map((l) => `<div style="font-size:17px;line-height:1.5;color:#33433b;margin-top:6px">${l}</div>`).join("")}</div>`;
  const inbox = `${panelHtml({ title: "届いた\nメール", note: "架空の求人の別の練習で、本番から届いた2通（実際の出力・抜粋）" })}
    <div style="position:absolute;left:460px;right:40px;top:60px">
    ${card("[面接コーチ] 今日の練習のまとめ 11/07", ["■ 今日の要点", "今日は想定質問10問のうち、Q1（これまでのマネジメント経験と技術経験）を1問だけ練習しました。", "…", "結論、数字の根拠、入社後の貢献での締めが不足しており、次回はこの3つを入れて話します。"])}
    ${card("[面接コーチ] 次のメールのプレビュー 11/07", ["■ 最近のニュース", "企業調査をすると、最近のニュースがここに入ります。", "■ ポジションの論点 …"])}
    <div style="font-size:18px;color:${SOFT};font-weight:700">※ メールの内容は今後、補強・追加する予定です。</div></div>`;
  await scene(10, [...a, { file: await snap(`<div style="position:relative;width:1280px;height:720px;background:${INK}">${inbox}</div>`), sec: 2.6, keep: true }], LINES.mail);
}

// ⑬ Who it is for (user 11/06 18:40): README line 15's two figures, word for word, with both sources and the caution that
// 5.5% is a wish to move, not a turnover rate (on screen, small, so the figure cannot be read as more than it is).
{
  const impact = (second) => `<div style="position:absolute;inset:0;background:${INK};color:#fff">
    <div style="position:absolute;left:90px;right:60px;top:70px;font-size:34px;font-weight:800;color:${SOFT}">「技術・人文知識・国際業務」の在留資格を持つ外国人労働者</div>
    <div style="position:absolute;left:90px;top:120px;font-size:150px;font-weight:900;letter-spacing:-2px">468,068<span style="font-size:70px">人</span></div>
    <div style="position:absolute;left:90px;right:60px;top:345px;font-size:46px;font-weight:900;opacity:${second ? 1 : 0}">そのうち「日本国内の別の会社に移りたい」<span style="color:${GREEN};font-size:84px">5.5%</span></div>
    <div style="position:absolute;left:90px;right:60px;top:560px;font-size:19px;font-weight:600;line-height:1.55;color:${SOFT}">出典: 厚生労働省「外国人雇用状況」別表（2025年10月末）<br>出典: 「令和7年 外国人雇用実態調査」第21表<br><span style="color:${YELLOW}">5.5%は転職希望であり、実際の転職率ではありません</span></div></div>`;
  await scene(13, [{ file: await snap(impact(false)), sec: 1.3 }, { file: await snap(impact(true)), sec: 2.55 }], LINES.impact);
}

// ④ The same review in Korean and English (user 11/04). v8: the tutorial-end dashboards are gone (budget 9 s).
const langScene = async (lang, say, screen, reading, trans, sec) => {
  const { ctx, page } = await reviewed(lang);
  const panel = { title: `${screen}の\n画面`, note: "" };
  const a = await annotated(page, REVIEW, [[`${REVIEW} .verdict`, `解説は、${screen}`]], panel, sec);
  const b = await annotated(page, SCRIPT, [[`${SCRIPT} .ja`, "話すのは日本語"], [`${SCRIPT} .reading`, `読み方は${reading}`], [`${SCRIPT} p.tr`, `訳も${trans}`]], panel, sec);
  const offScreen = await page.evaluate((s) => document.querySelector(s).getBoundingClientRect().top > 640, `${SCRIPT} p.tr`);
  const c = offScreen ? await annotated(page, `${SCRIPT} .reading`, [[`${SCRIPT} p.tr`, `訳も${trans}`]], panel, sec) : [];
  await ctx.close();
  return scene(4, [...a, ...b, ...c], say);
};
await langScene("ko", LINES.ko, "韓国語", "ハングル", "韓国語", 0.9);
await langScene("en", LINES.en, "英語", "ローマ字", "英語", 0.8);

// ⑪ The other features (11/06: every SCORES row on screen), three montage scenes of 1-second cuts; each cut's panel is its
// caption. Claims are checked where the data could change (the ⚠ needs a repeated rule, the tour must make 0 calls).
{
  const demo = demoOf("ja");
  // F1 attachment: the chip after choosing a (tiny, fictional) PDF; the accepted kinds are read from the control itself.
  const { ctx: inCtx, page: inPage } = await live("ja");
  await enterCode(inPage);
  const accept = await inPage.getAttribute("#file", "accept");
  if (!["pdf", "docx", "image", "txt"].every((k) => accept.includes(k))) throw new Error(`#file accepts ${accept}: the caption lists PDF・DOCX・画像・TXT`);
  await inPage.setInputFiles("#file", { name: "履歴書（架空）.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%%EOF\n") });
  await inPage.locator("#chip:not([hidden])").waitFor();
  const attach = await annotated(inPage, "#chip", [["#chip", "PDF・DOCX・画像・TXT"]], { title: "履歴書は\n添付でも", note: "メールと一緒に送る" }, 1.0);
  await inCtx.close();
  // The script's own check (F15 ⑤ on the generated card, SEL.scriptCheck): the recorded result once record-demo.mjs stores
  // steps[0].script.check; until then PREVIEW=1 names one sentence of the recorded script as unsupported (a stand-in, not a judgement).
  const check = demo.steps[0].script.check;
  if (!check) skip("script check data (public/demo/demo-ja.json steps[0].script.check, record-demo.mjs): a stand-in names one recorded sentence");
  let verifies = 0;
  const standIn = { unsupported: [{ sentence: demo.steps[0].script.parts?.ketsuron ?? demo.steps[0].script.text.split("。")[1] + "。", kind: "judgment" }] };
  // checked: true = a check that ran (app.js checkScript keeps a 200 without it as "not checked").
  const { ctx: s2Ctx, page: s2 } = await reviewed("ja", { second: true, routes: { "/api/verify": () => ({ checked: true, ...(verifies++ ? { unsupported: [] } : check ?? standIn) }) } });
  const first = `${SCRIPT} ${SEL.scriptCheck}`; // querySelector: the first answer's card
  await s2.waitForFunction(([s, busy]) => { const p = document.querySelector(s); return p && !p.hidden && p.textContent !== busy; }, [first, LANGS.ja.script.checking]);
  const scriptCheck = await annotated(s2, first, [[first, "回答と照合した結果"]], { title: "台本も\n自動で照合", note: "回答に根拠のない文を示す" }, 1.0);
  // F9: the running tally after the second answer; the ⚠ is the code's rule (2 or more, export.js habitCounts).
  await s2.evaluate(() => { [...document.querySelectorAll("#log > .msg.note")].at(-1).id = "rec-habits"; });
  const warn = "#rec-habits .habit:has(.icon)";
  if (!await s2.locator(warn).count()) throw new Error("no habit with a ⚠ after the second answer: the recording no longer repeats a rule");
  const habits = await annotated(s2, "#rec-habits", [[warn, "2回以上で ⚠"]], { title: "口ぐせは\n回数で警告", note: "同じルールに 2回以上" }, 1.0);
  // F6: 終了・保存 downloads the session as Markdown; the lines shown are the file's own.
  const endBtn = await annotated(s2, "#log .msg.compare", [["#end", "終了・保存"]], { title: "終了・保存で\nMarkdown", note: "この練習を、ファイルに" }, 0.8);
  const [dl] = await Promise.all([s2.waitForEvent("download"), s2.click("#end")]);
  const md = readFileSync(await dl.path(), "utf8").split("\n");
  const exportFrame = await mdFrame(mdView(dl.suggestedFilename(), [`<b>${esc(mdLine(md, /^# /))}</b>`, esc(mdLine(md, /^## .*\(\d+\)/)), `<span data-m="0" style="background:${YELLOW}">${esc(mdLine(md, /⚠ \|/))}</span>`]), { title: "終了・保存で\nMarkdown", note: "口ぐせの集計も、その中に" }, 1.0);
  await s2Ctx.close();
  // The read-aloud check (ko screen: a Japanese screen has no kana reading, voice.js). The heard kana is the script's own
  // with one slip (a stand-in for Gemini STT; the match is the browser's code, readcheck.js).
  const ko = demoOf("ko"), slip = ko.steps[0].script.kana.replace("ます", "まず");
  const { ctx: rdCtx, page: rd } = await reviewed("ko", { access: { stt: true }, init: micStub, routes: { "/api/stt": () => ({ text: "", kana: slip }) } });
  const readBtn = `${SCRIPT} .readaloud`;
  await rd.locator(readBtn).waitFor();
  await rd.click(readBtn);
  await rd.waitForTimeout(300);
  await rd.click(readBtn);
  await rd.locator(`${SCRIPT} .read-result`).waitFor({ timeout: 10000 });
  const readAloud = await annotated(rd, SCRIPT, [[readBtn, "音読して確認"], [`${SCRIPT} .read-result`, "一致率を判定"]], { title: "音読の\n確認", note: "聞こえた読みと台本を比べる" }, 1.0);
  await rdCtx.close();
  // F5 closings by question type: the pack's own rules (packs/jp.json answer_structure.closings), labels from the Japanese screen.
  const C = pack.answer_structure.closings, L = LANGS.ja;
  const row = (k) => `<tr style="border-top:2px solid #22332b"><td style="padding:12px 0">${esc(C[k].rule.split("なので")[0])}</td><td style="color:${GREEN}">${esc(L.closings[k])}</td><td style="color:${SOFT};font-size:26px">${(C[k].skip ?? []).map((s) => L.steps[s]).join("・")}${C[k].skip?.length ? "なし" : ""}</td></tr>`;
  const closings = { file: await snap(`<div style="position:absolute;inset:0;background:${INK};color:#fff;padding:44px 90px;box-sizing:border-box"><div style="font-size:46px;font-weight:900;margin-bottom:18px">${esc(L.steps.sentakushi)}は、質問の種類で決まる</div><table style="width:100%;border-collapse:collapse;font-size:34px;font-weight:700"><tr style="font-size:24px;color:${SOFT}"><td>質問</td><td>締め</td><td>省く段階</td></tr>${Object.keys(C).map(row).join("")}</table></div>`), sec: 1.2 };
  // F4's newest rules (DECISIONS 11/06: kept unless f4neg finds false positives), drawn from packs/jp.json itself: a rule
  // dropped from the pack drops out of this cut, and with none left the build stops instead of showing a stale table.
  const added = ["rep-genshoku", "rep-onsha", "rep-daijoubu"].map((id) => pack.correction_rules.find((r) => r.id === id)).filter(Boolean);
  if (!added.length) throw new Error("none of the 3 new rules is in packs/jp.json: drop the rules cut and its §0 row");
  const rules = { file: await snap(`<div style="position:absolute;inset:0;background:${INK};color:#fff;padding:44px 90px;box-sizing:border-box"><div style="font-size:46px;font-weight:900;margin-bottom:22px">面接での言い方も、ルール表で直す</div>
    <table style="width:100%;border-collapse:collapse;font-weight:700">${added.map((r) => `<tr style="border-top:2px solid #22332b"><td style="padding:16px 18px 16px 0;font:700 22px Menlo,monospace;color:${SOFT};white-space:nowrap">${r.id}</td><td style="padding:16px 0;font-size:36px;line-height:1.35"><span style="color:${RED}">${esc(r.example_before)}</span><br><span style="color:${GREEN}">→ ${esc(r.example_after)}</span></td></tr>`).join("")}</table>
    <div style="position:absolute;right:90px;bottom:26px;font-size:20px;color:${SOFT};font-weight:600">ルール表（packs/jp.json）の例文</div></div>`), sec: 1.2 };
  // F14: the destination menu, Korea marked beta.
  const { ctx: krCtx, page: kr } = await live("ja", { dest: "kr" });
  const krLabel = await kr.locator("#dest option:checked").textContent();
  if (!krLabel.includes(LANGS.ja.dest.beta)) throw new Error(`#dest shows ${krLabel}: no beta mark`);
  // Under 1024 px the menu is an invisible select over the flag icon (style.css .picker), and a native dropdown is not in
  // screenshots: it is drawn opened as a list, with the app's own options.
  await kr.evaluate(() => { const s = document.querySelector("#dest"); s.size = s.options.length; Object.assign(s.style, { position: "absolute", inset: "auto", top: "48px", right: "0", width: "auto", height: "auto", opacity: "1", zIndex: "50", background: "#fff", color: "#1b1f1d", border: "1px solid #c9d3cd", borderRadius: "8px", fontSize: "17px", padding: "6px" }); });
  const beta = await annotated(kr, "#dest", [["#dest", esc(krLabel)]], { title: "韓国向けは\nベータ", note: "行き先ごとのルール表" }, 1.0);
  await krCtx.close();
  // The tour without a code: the recorded demo replayed in the page; the build counts the API calls it makes.
  const { ctx: tourCtx, page: tour } = await live("ja");
  let calls = 0;
  tour.on("request", (r) => { if (/\/api\/(?!access)/.test(r.url())) calls++; });
  await tour.locator("#log button", { hasText: LANGS.ja.demo.button }).first().click();
  await tour.locator("#tourStep", { hasText: /^1\// }).waitFor();
  for (let i = 0; i < 5; i++) { // up to the review step
    await tour.waitForFunction(() => !document.querySelector("#tourNext").disabled, null, { timeout: 30000 });
    await tour.click("#tourNext");
    await tour.waitForTimeout(150);
  }
  await tour.waitForFunction(() => !document.querySelector("#tourNext").disabled, null, { timeout: 30000 });
  if (calls) throw new Error(`the tour made ${calls} API calls: the caption says 0`);
  const tourFrame = await annotated(tour, "#tour", [["#tour", `チュートリアル ${await tour.textContent("#tourStep")}`]], { title: "コードなしの\nツアー", note: "録画した出力を再生。API 呼び出し 0回" }, 1.0);
  await tourCtx.close();
  // Phone and web, the real screens of the same review (v7).
  const shotAt = async (viewport) => { const { ctx, page } = await reviewed("ja", { viewport }), f = await appShot(page); await ctx.close(); return f; };
  const web = await shotAt({ width: 1280, height: 800 }), phone = await shotAt({ width: 390, height: 844 });
  const both = { file: await snap(`<div style="position:absolute;inset:0;background:${INK};color:#fff"><div style="position:absolute;left:56px;top:32px;font-size:52px;font-weight:900">スマホでも、<span style="color:${GREEN}">Web</span>でも</div>
    <img src="${png64(web)}" style="position:absolute;left:56px;top:130px;width:840px;height:525px;border-radius:8px"><div style="position:absolute;left:56px;top:664px;font-size:26px;font-weight:800;color:${SOFT}">Web</div>
    <img src="${png64(phone)}" style="position:absolute;left:950px;top:130px;width:243px;height:526px;border-radius:14px"><div style="position:absolute;left:950px;top:664px;font-size:26px;font-weight:800;color:${SOFT}">スマホ</div></div>`), sec: 1.2, arrow: { x: 1071, y: 128, dir: "down" } };
  // One frame per feature (11/06: 1.0–1.5 s a cut); each scene still lasts as long as its line.
  await scene(11, [one(attach), one(desiredFrames), one(scriptCheck), one(readAloud)], LINES.more1);
  await scene(11, [one(habits), rules, closings, one(debriefFrames), one(endBtn), exportFrame], LINES.more2);
  await scene(11, [one(beta), one(tourFrame), both], LINES.more3);
}

// ⑫ Access (DECISIONS 11/06 17:25, 17:40): the submission's public mode — no code, the notice at the daily limit, the
// judges' code lifts it. The screen is being built (SEL.limit). No code is on screen, not even masked (user 11/06 18:12):
// the field is shown empty, the code goes in between two frames, and appShot stops at a visible •••• echo.
// CODE is the public MOCK value of test/ui/harness.js; the real code is never in this file.
{
  const L = SEL.limit;
  if (!(L.code && L.notice && L.unlock && L.submit)) skip("daily limit and the judges' code (SEL.limit)", LINES.limit);
  else {
    const demo = demoOf("ja");
    const { ctx, page } = await live("ja", { routes: sessionAnswers(demo) });
    // Over the limit until a request carries the judges' code (the app sends it as x-access-code, app.js post).
    await page.route("**/api/questions", (r) => (r.request().headers()["x-access-code"] === CODE
      ? r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(sessionAnswers(demo)["/api/questions"]()) })
      : r.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ code: L.code }) })));
    if (await page.evaluate(() => document.body.dataset.stage === "code")) skip("start without a code (the app still asks for one)", LINES.limit);
    else {
      const send = async (t) => { await page.fill("#input", t); await page.click("#send"); };
      await page.fill("#input", demo.mail);
      const a = one(await annotated(page, "#input", [["#log .msg.coach", "コードは聞かれない"], ["#input", "メールを貼って送る"]], { title: "コードなしで\n使える", note: "1日の上限まで、そのまま" }), 1.0);
      await page.click("#send");
      await page.locator(L.notice).waitFor({ timeout: 10000 });
      const unlock = { title: "審査用コードで\n上限が外れる", note: "コードは提出フォームで" };
      const b = await annotated(page, L.notice, [[L.notice, "上限の案内"]], { title: "1日の上限に\n達したら", note: "案内が出る" }, 1.2);
      const c = await annotated(page, L.unlock, [[L.unlock, "審査用コードの欄"]], unlock, 1.0);
      await page.fill(L.unlock, CODE); // off camera: no frame until the limit is gone
      await page.click(L.submit);
      await page.evaluate(() => { for (const i of document.querySelectorAll("#log .code-field input")) i.value = ""; }); // not even masked dots on screen (user 11/06 18:12)
      // The app may retry the mail by itself or ask for it again: either way the questions come with the code.
      if (!await page.locator("#log .q").first().waitFor({ timeout: 5000 }).then(() => true, () => false)) await send(demo.mail);
      await page.locator("#log .q").first().waitFor({ timeout: 10000 });
      const d = await annotated(page, "#log .q", [["#log .q", "上限が外れて、続きから"]], unlock, 1.2);
      await scene(12, [a, ...b, ...c, ...d], LINES.limit);
    }
    await ctx.close();
  }
}

// ⑤ How the app uses Claude (criterion: choose and combine models). Facts: lib/claude.js MODELS, lib/review.js + lib/script.js
// gates, PRD F15 (the verify call is Sonnet).
const flow = (items) => items.map((x, i) => `<div style="padding:20px 28px;border-radius:8px;background:#16271e;color:#fff;font-size:34px;font-weight:700;line-height:1.35">${x}</div>${i < items.length - 1 ? `<div style="text-align:center;color:${GREEN};font-size:28px;line-height:1.2;margin:6px 0">↓</div>` : ""}`).join("");
{
  const BOX = ["調査は Haiku（基本版の web_search）", "質問・台本・準備資料・検証・メールのまとめは Sonnet", "採点は別の呼び出しで Opus", "出典のない情報と、回答にない添削は<br>プログラムが捨てる"];
  const frames = [];
  for (let k = 1; k <= BOX.length; k++) {
    const file = await snap(`<div style="position:absolute;inset:0;background:${INK};color:#fff;padding:44px 200px;box-sizing:border-box"><div style="font-size:42px;font-weight:800;color:${GREEN};margin-bottom:28px">アプリの中の Claude</div>${flow(BOX.map((b, i) => (i < k ? `<span data-b${i}>${b}</span>` : `<span style="opacity:.12">${b}</span>`)))}</div>`);
    const r = await rectOf(`[data-b${k - 1}]`);
    frames.push({ file, sec: 1.0, arrow: { x: 190, y: r.y + r.h / 2, dir: "right" } });
  }
  await scene(5, frames, LINES.models);
}

// How it was built (user 11/05: a few seconds of hard cuts, not a list). Facts: README 「Claude の使い方」「Claude Code での開発」:
// 4 project skills (publish-check and deploy-verify manual only), attack subagents refuted by another agent, the git
// pre-push hook (not a Claude Code hook), no MCP.
{
  const cut = (bg, fg, main, sub, size = 150) => `<div style="position:absolute;inset:0;background:${bg};color:${fg};display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;line-height:1.2"><div style="font-size:${size}px;font-weight:900">${main}</div><div style="font-size:38px;font-weight:800;margin-top:26px">${sub}</div></div>`;
  const cuts = [
    [GREEN, INK, "Claude Code", "開発の中心。復唱 → 記号 → 失敗するテスト", 130],
    [INK, "#fff", "Skills 4個", "公開とデプロイは手動だけ", 130],
    [YELLOW, INK, "サブエージェント", "アプリとデモを攻撃。別のエージェントが反証", 110],
    [INK, "#fff", "git の pre-push フック", "push 前に個人情報と秘密をスキャン", 96],
    [GREEN, INK, "この動画も", "Claude Code で", 130],
  ];
  const frames = [];
  for (const c of cuts) frames.push({ file: await snap(cut(...c)), sec: 1.0 });
  await scene(5, frames, LINES.built);
}

// ⑥ The roadmap, the lesson, then the next person (user 11/05: the peak is handing this on, not the tool's own score).
await scene(6, await reveal("国も、言葉も、", "足していける。"), LINES.packs);
await scene(6, [
  { file: await snap(big("面接の壁は、", "", GREEN, INK, INK)), sec: 0.7 },
  { file: await snap(big("面接の壁は、", "答え方の壁", GREEN, INK, "#fff")), sec: 0.7 },
  { file: await snap(big("面接の壁は、", "答え方の壁だった。", GREEN, INK, "#fff")), sec: 1.2 },
], LINES.wall);
{ // The end card: the message, the demo and the repository (user 11/06 18:12), where the judges' code comes from (never
  // the code itself), and the credit VOICEVOX's terms require. Screen text only, no line reads it.
  // The repository address comes from git at build time, so no account name is written in this file (PII scan).
  const REPO = execFileSync("git", ["remote", "get-url", "origin"], { cwd: new URL("..", import.meta.url) }).toString().trim().replace(/^git@([^:]+):/, "https://$1/").replace(/^https?:\/\//, "").replace(/\.git$/, "");
  const end = (a, b) => `<div style="position:absolute;inset:0;background:${INK};color:#fff"><div style="position:absolute;left:90px;right:60px;top:120px;font-size:78px;font-weight:900;line-height:1.3;letter-spacing:-1px">${a}<br><span style="color:${GREEN}">${b}</span></div>
    <div style="position:absolute;left:90px;right:60px;top:390px;font-size:40px;font-weight:900">面接コーチ</div>
    <div style="position:absolute;left:90px;right:60px;top:452px;font-size:28px;font-weight:700;color:${YELLOW}">スマホでも、Webでも · mensetsu-coach-ten.vercel.app</div>
    <div style="position:absolute;left:90px;right:60px;top:498px;font-size:28px;font-weight:700;color:${YELLOW}">ソースコード · ${REPO}</div>
    <div style="position:absolute;left:90px;right:60px;top:552px;font-size:26px;font-weight:700">審査用コードは提出フォームでお伝えします</div>
    <div style="position:absolute;left:90px;right:60px;top:618px;font-size:24px;font-weight:700;color:${SOFT}">ナレーション VOICEVOX:青山龍星 · Built with Claude: Japan 2026</div></div>`;
  await scene(6, [
    { file: await snap(end("次に日本で転職する", "")), sec: 1 },
    { file: await snap(end("次に日本で転職する", "外国人のために")), sec: 3.2, keep: true }, // the URLs and the code notice stay readable
  ], LINES.end);
}
await browser.close();
server.stop();

// One concat, then a green wipe over each chapter change: it covers the cut at its midpoint.
writeFileSync(join(dir, "list.txt"), segs.map((s) => `file '${s.file}'`).join("\n"));
const joined = join(dir, "joined.mp4");
ffmpeg("-f", "concat", "-safe", "0", "-i", join(dir, "list.txt"), "-c", "copy", joined);
const bounds = [];
let clock = 0;
segs.forEach((s, i) => { clock += durationOf(s.file); if (segs[i + 1] && segs[i + 1].chapter !== s.chapter) bounds.push(clock); });
const W = 0.45;
const wipe = bounds.length ? `color=c=${GREEN}:s=1920x1080:r=30,split=${bounds.length}${bounds.map((_, i) => `[g${i}]`).join("")};` + bounds.map((b, i) => `[v${i}][g${i}]overlay=x='-1920+(t-${(b - W / 2).toFixed(3)})/${W}*3840':y=0:enable='between(t,${(b - W / 2).toFixed(3)},${(b + W / 2).toFixed(3)})':shortest=1[v${i + 1}]`).join(";") : "";
const final = join(dir, "full.mp4");
ffmpeg("-i", joined, "-filter_complex", `[0:v]null[v0];${wipe}`, "-map", `[v${bounds.length}]`, "-map", "0:a", ...enc, "-movflags", "+faststart", final);
const sec = durationOf(final);
let at = 0;
for (const s of segs) { const d = durationOf(s.file); console.log(`ch${s.chapter} ${at.toFixed(1)}-${(at + d).toFixed(1)} (${d.toFixed(1)} s)`); at += d; }
if (skipped.length) {
  // shortcut: a dropped scene is estimated by its line only (scene() takes the longer of line and frames), so the total can be low.
  let est = 0;
  for (const say of missingLines) est += NARR ? (await NARR(say)).sec + PAD : say.length / CPS + PAD;
  console.log(`PREVIEW: not in this build — ${skipped.join("; ")}`);
  console.log(`PREVIEW: this build ${sec.toFixed(1)} s + dropped scenes about ${est.toFixed(1)} s (${missingLines.length}) = about ${(sec + est).toFixed(1)} s of ${MAX_SEC} s${sec + est > MAX_SEC ? " — OVER" : ""}`);
}
if (sec > MAX_SEC) throw new Error(`over the ${MAX_SEC} s limit: ${sec.toFixed(1)} s (${out} not written)`);
copyFileSync(final, out);
console.log(`${out}: ${sec.toFixed(1)} s, ${segs.length} segments, wipes at ${bounds.map((b) => b.toFixed(1)).join(", ")}`);
