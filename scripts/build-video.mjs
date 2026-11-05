// Builds the whole demo video v6: ① the 15-second opening → ② the promise → ③ the one-take demo (scripts/record-video.mjs
// output) with a headline panel on the left → the prep document → ④ the same review in Korean and English, phone and web →
// ⑤ how Claude is used and how this was built, in fast cuts → ⑥ who it is for, ending on the next person (user 11/05).
// Screens are the live app (MOCK server, recorded real outputs, 0 AI calls). Scene changes use a green wipe, never a fade
// through black (v3 blinked black on every still: scene cut measured 11/04).
// NARRATE=1 (+ a local VOICEVOX engine): Japanese narration (scripts/narration.mjs); each scene lasts as long as its
// line. Without it, scenes keep the same reading time, so a silent preview has the final length.
// Usage: [NARRATE=1] node scripts/build-video.mjs <section3.mp4> <out.mp4>   (needs system Chrome and ffmpeg)
import { readFileSync, writeFileSync, mkdtempSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { startServer, launch, CODE, MAIL } from "../test/ui/harness.js";

const [take, out = "demo-full.mp4"] = process.argv.slice(2);
if (!take) throw new Error("usage: node scripts/build-video.mjs <section3.mp4> <out.mp4>");
const dir = mkdtempSync(join(tmpdir(), "mensetsu-build-"));
const { duration: takeSec, panels } = JSON.parse(readFileSync(`${take}.panels.json`, "utf8"));
const pack = JSON.parse(readFileSync(new URL("../packs/jp.json", import.meta.url), "utf8"));
const steps = pack.answer_structure.steps.map(({ key, label, optional }) => ({ key, label, ...(optional && { optional }) }));
const MAX_SEC = 180;
const INK = "#0c1411", GREEN = "#06c755", SOFT = "#a9d8bd", RED = "#ff7a7a", YELLOW = "#ffe14d";
const FONT = "'Hiragino Sans','Noto Sans JP',sans-serif";
const ffmpeg = (...a) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...a]);
// All limited range: the JPEG screencasts are full range, and the final pass read the stills after the take as full (washed out, also in v5).
const enc = ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-color_range", "tv", "-r", "30", "-crf", "20", "-c:a", "aac", "-ar", "48000", "-ac", "1"];
const durationOf = (f) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString());

const server = await startServer({ STT_ENABLED: "0" });
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
async function scene(chapter, frames, say = "") {
  const line = NARR && say ? await NARR(say) : null;
  const own = frames.reduce((s, f) => s + f.sec, 0);
  const need = line ? line.sec + 0.3 : say ? say.length / 7.2 + 0.3 : 0;
  const total = Math.max(own, need), k = total / own;
  const file = segFile(), lf = `${file}.txt`;
  writeFileSync(lf, frames.map((f) => `file '${f.file}'\nduration ${(f.sec * k).toFixed(3)}`).join("\n") + `\nfile '${frames.at(-1).file}'\n`);
  let clock = 0, chain = "[0:v]scale=1920:1080:flags=lanczos,fps=30[v0]", last = "v0";
  const inputs = [];
  frames.forEach((f, i) => {
    const a = clock, b = (clock += f.sec * k);
    if (!f.arrow) return;
    const o = arrowOverlay(f.arrow);
    inputs.push("-i", ARROWS[f.arrow.dir]);
    const idx = inputs.length / 2 + 1, tag = `v${i + 1}`;
    chain += `;[${last}][${idx}:v]overlay=x='${o.x}':y='${o.y}':enable='between(t,${a.toFixed(3)},${b.toFixed(3)})':eof_action=repeat[${tag}]`;
    last = tag;
  });
  const audio = line ? ["-i", line.wav] : ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono"];
  const af = line ? "[1:a]adelay=120:all=1,apad[a]" : "[1:a]anull[a]";
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
  ], "以前の面接で、同じ質問を3回、聞き返されました。結果は、見送り。");

  const d = JSON.parse(readFileSync(new URL("../public/demo/demo-ja.json", import.meta.url), "utf8"));
  const [first, last] = [d.steps[0].review, d.steps[1].review];
  const rows = [["質問に答えている", first.answers_question === "yes", last.answers_question === "yes"], ...steps.filter((x) => !x.optional).map((x) => [x.label, first.steps[x.key].present, last.steps[x.key].present])];
  if (rows.some(([, a, z]) => a || !z)) throw new Error("the recording no longer goes from all ✗ to all ✓: rewrite the opening");
  const table = (flipped) => `<div style="position:absolute;inset:0;background:${INK};color:#fff;padding:44px 90px;box-sizing:border-box"><div style="font-size:50px;font-weight:900;margin-bottom:24px">同じ質問に、答え直す</div>
    <table style="width:100%;border-collapse:collapse;font-size:44px;font-weight:800"><tr style="font-size:26px;color:${SOFT}"><td></td><td style="text-align:center;width:190px">最初</td><td style="text-align:center;width:190px">答え直し</td></tr>
    ${rows.map(([label], i) => `<tr style="border-top:2px solid #22332b"><td style="padding:16px 0">${label}</td><td style="text-align:center;color:${RED};font-size:62px">✗</td><td data-row="${i}" style="text-align:center;color:${GREEN};font-size:62px">${i < flipped ? "✓" : ""}</td></tr>`).join("")}</table>
    <div style="position:absolute;right:90px;bottom:26px;font-size:20px;color:${SOFT};font-weight:600">実際の出力の録画</div></div>`;
  const frames = [...(await reveal("聞かれたことに、", "答えていなかった。", INK, "#fff", RED)).map((f) => ({ ...f, sec: f.sec * 0.75 })), { file: await snap(table(0)), sec: 0.5 }];
  for (let k = 1; k <= rows.length; k++) {
    const file = await snap(table(k)), r = await rectOf(`[data-row="${k - 1}"]`);
    frames.push({ file, sec: 0.6, arrow: { x: r.x + r.w - 20, y: r.y + r.h / 2, dir: "left" } });
  }
  await scene(1, frames, "聞かれたことに、答えていなかったんです。答え方を直すと、バツがチェックに変わります。");
  await scene(1, [{ file: await snap(`<div style="position:absolute;inset:0;background:${GREEN};color:${INK};display:flex;flex-direction:column;justify-content:center;align-items:center"><div style="font-size:110px;font-weight:900;color:#fff;letter-spacing:18px">✓✓✓✓</div><div style="font-size:82px;font-weight:900;margin-top:12px">見送りで、終わらせない。</div><div style="font-size:40px;font-weight:800;margin-top:22px">面接コーチ</div></div>`), sec: 2.3 }], "見送りで、終わらせない。面接コーチ。");
  const opening = segs.reduce((sum, s) => sum + durationOf(s.file), 0);
  if (opening > 15) throw new Error(`the opening is ${opening.toFixed(1)} s, over 15 s`);
}

// A live page in the take's width (one column), for the split screens.
const APP = { width: 854, height: 720 };
async function live(lang, dest, viewport = APP) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1.5, locale: lang });
  await ctx.addInitScript((l) => { try { localStorage.setItem("mensetsu-lang", l); } catch {} }, lang);
  const page = await ctx.newPage();
  await page.goto(server.url);
  await page.locator(".msg.coach").first().waitFor();
  if (dest) await page.evaluate((d) => { const s = document.querySelector("#dest"); s.value = d; s.dispatchEvent(new Event("change", { bubbles: true })); }, dest);
  await page.waitForTimeout(350);
  return { ctx, page };
}
const appShot = async (page) => { const file = join(dir, `a${String(++n).padStart(3, "0")}.png`); await page.screenshot({ path: file }); return file; };

// ② The promise.
{
  const { ctx, page } = await live("ja");
  const box = await page.locator("#input").boundingBox(), S = 853 / 854;
  const promise = { title: "メールを\n貼るだけ", note: "その会社専用の面接コーチになります" }, arrow = { x: 427 + (box.x + box.width / 2) * S, y: box.y * S - 6, dir: "down" };
  const empty = await snap(splitHtml(await appShot(page), panelHtml(promise)));
  await page.fill("#input", JSON.parse(readFileSync(new URL("../public/demo/demo-ja.json", import.meta.url), "utf8")).mail);
  await page.waitForTimeout(150);
  const after = await page.locator("#input").boundingBox();
  await scene(2, [{ file: empty, sec: 1.2, arrow }, { file: await snap(splitHtml(await appShot(page), panelHtml(promise))), sec: 2.3, arrow: { ...arrow, y: after.y * S - 6 } }], "メールを貼るだけで、その会社専用の面接コーチになります。");
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

// ④ The same review in Korean and English, with a Japanese explanation beside the screen (user 11/04): each note sits at
// the height of the line it explains, joined by a short rule.
const demoOf = (lang) => JSON.parse(readFileSync(new URL(`../public/demo/demo-${lang}.json`, import.meta.url), "utf8"));
async function reviewed(lang, viewport) {
  const demo = demoOf(lang), { ctx, page } = await live(lang, undefined, viewport);
  const answers = {
    "/api/access": () => ({ ok: true, stt: false }),
    "/api/questions": () => ({ company_context: demo.company_context, questions: demo.questions, specificity: demo.specificity, pack: { id: "jp", target: "ja", steps } }),
    "/api/review": () => demo.steps[0].review,
    "/api/script": () => demo.steps[0].script,
  };
  await page.route("**/api/**", (r) => { const p = new URL(r.request().url()).pathname; return answers[p] ? r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(answers[p]()) }) : r.continue(); });
  const send = async (t) => { await page.fill("#input", t); await page.click("#send"); };
  await send(CODE); await page.waitForTimeout(250);
  await send(demo.mail); await page.locator("#log .q").first().waitFor();
  await send(String(demo.pick + 1)); await page.waitForTimeout(250);
  await send(demo.steps[0].answer);
  await page.locator("#log .msg.script:not(.review) .listen").waitFor({ timeout: 15000 });
  await page.evaluate(() => { for (const d of document.querySelectorAll("#log details")) d.open = true; });
  await page.waitForTimeout(250);
  return { ctx, page };
}
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
const SCRIPT = "#log .msg.script:not(.review)", REVIEW = "#log .msg.review";
const langScene = async (lang, say, screen, reading, trans) => {
  const { ctx, page } = await reviewed(lang);
  const panel = { title: `${screen}の\n画面`, note: "" };
  const a = await annotated(page, REVIEW, [[`${REVIEW} .verdict`, `解説は、${screen}`]], panel);
  const b = await annotated(page, SCRIPT, [[`${SCRIPT} .ja`, "話すのは日本語"], [`${SCRIPT} .reading`, `読み方は${reading}`], [`${SCRIPT} p.tr`, `訳も${trans}`]], panel);
  const offScreen = await page.evaluate((s) => document.querySelector(s).getBoundingClientRect().top > 640, `${SCRIPT} p.tr`);
  const c = offScreen ? await annotated(page, `${SCRIPT} .reading`, [[`${SCRIPT} p.tr`, `訳も${trans}`]], panel) : [];
  await ctx.close();
  return scene(4, [...a, ...b, ...c], say);
};
// The prep document (user 11/05): the real flow on the MOCK server, fictional data only (test/fixtures/prep.json, research.json),
// shown as a question map, ending on the card and the Markdown it really downloads.
{
  const prepServer = await startServer({ PREP_ENABLED: "1", RESEARCH_ENABLED: "1", STT_ENABLED: "0" });
  const ctx = await browser.newContext({ viewport: APP, deviceScaleFactor: 1.5, locale: "ja", acceptDownloads: true });
  await ctx.addInitScript(() => { try { localStorage.setItem("mensetsu-lang", "ja"); localStorage.setItem("mensetsu-tour-tips", "1"); } catch {} });
  const page = await ctx.newPage();
  await page.goto(prepServer.url);
  await page.locator(".msg.coach").first().waitFor();
  const send = async (t) => { await page.fill("#input", t); await page.click("#send"); };
  await send(CODE); await page.waitForTimeout(400);
  await send(MAIL); await page.locator(".brief-confirm .inline-btn").waitFor();
  await page.locator(".brief-confirm input").first().fill("株式会社サンプルテック（仮）");
  await page.locator(".brief-confirm input").nth(1).fill("プロダクトマネージャー");
  await page.locator(".brief-confirm .inline-btn").first().click();
  await page.locator("#log > .msg.brief:not(.brief-confirm)").last().waitFor();
  await page.waitForFunction(() => !document.querySelector("#send").disabled, null, { timeout: 20000 });
  await page.evaluate(() => { for (const e of document.querySelectorAll("#log .q .tr")) e.style.display = "none"; }); // the fixture's Korean line: a Japanese screen has none
  const panel = { title: "答えではなく\n質問の地図", note: "全文を読まない" };
  const opened = await page.locator("#log .prep-ctl").count();
  if (!opened) throw new Error("no prep button: PREP_ENABLED did not reach the app");
  const flow = [...await annotated(page, "#log .prep-ctl", [["#log .prep-ctl", "このボタンから"]], panel, 0.9)];
  await page.locator("#log .prep-ctl").first().click();
  await page.locator("#prepMaterial").fill("サンプル物流（架空） 在庫管理システムの開発を担当。");
  // The app's file control is drawn by Chrome in the machine's language, not the page's: hidden for this one frame.
  await page.evaluate(() => { document.querySelector("#prepFile").style.visibility = "hidden"; });
  flow.push(...await annotated(page, "#prep", [["#prepMaterial", "履歴書を貼る（架空）"]], panel, 0.9));
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
  await scene(8, flow, "面接準備資料。暗記用の答えではなく、質問の地図です。");
  const notice = await annotated(page, CARD, [[`${CARD} .caution`, "誤りを含む。必ず確認"]], panel, 1.2);
  await page.evaluate((C) => { document.querySelector(`${C} .caution`).style.zoom = "1.5"; }, CARD);
  notice.push(...await annotated(page, CARD, [[`${CARD} .caution`, "誤りを含む。必ず確認"]], panel, 2.4));
  await page.evaluate((C) => { document.querySelector(`${C} .caution`).style.zoom = ""; }, CARD);
  await scene(8, notice, "最初に、誤りを含むことがある、必ず確認、と出ます。");
  await page.evaluate((C) => {
    const c = document.querySelector(C), sec = (k) => c.querySelector(`[data-section=${k}]`);
    sec("how_to_use").open = true;
    const by = (box, sel, t) => [...box.querySelectorAll(sel)].find((e) => e.textContent.includes(t));
    by(sec("how_to_use"), ".claim", "全文を読まない").id = "rec-howto";
    by(sec("self_intro"), ".legend", "聞かれていること").id = "rec-asked";
    by(sec("self_intro"), ".legend", "話す順序").id = "rec-order";
  }, CARD);
  await scene(8, await annotated(page, "#rec-howto", [["#rec-howto", "全文を読まない"], ["#rec-asked", "聞かれていること"], ["#rec-order", "話す順序"]], panel, 1.1), "全文を読まず、聞かれていることと話す順序だけを見ます。");
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
  await scene(8, [...fact, ...blank], "事実には出典のリンク。経験は空欄のまま、自分で埋めます。");
  // Its Markdown: the real downloaded file, those lines verbatim.
  await page.evaluate((C) => document.querySelector(C).scrollIntoView(), CARD);
  const [dl] = await Promise.all([page.waitForEvent("download"), page.locator(CARD).getByRole("button", { name: "Markdown をダウンロード" }).click()]);
  const md = readFileSync(await dl.path(), "utf8").split("\n"), line = (re) => { const l = md.find((x) => re.test(x)); if (!l) throw new Error(`no ${re} in the Markdown`); return l; };
  const esc = (x) => x.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const name = dl.suggestedFilename();
  const fileHtml = (on) => `<div style="position:absolute;left:427px;top:0;width:853px;height:720px;box-sizing:border-box;background:#fff;color:#1b1f1d;padding:30px 34px;font-size:22px;line-height:1.6;white-space:pre-wrap;word-break:break-all">
<div style="font:700 20px Menlo,monospace;color:#047a35;margin-bottom:14px">${esc(name)}</div>${[
    `<b>${esc(line(/^# /))}</b>`,
    `<span data-m="0"${on > 0 ? ` style="background:${YELLOW}"` : ""}>${esc(line(/^> ⚠ AI/))}</span>`,
    `${esc(line(/全文を読まない/))}`,
    esc(line(/^- 会社: .*\[s1\]/)).replace(/\(\[s1\]\((.*?)\)\)/, (_, u) => `<span data-m="1" style="display:inline-block;word-break:normal${on > 1 ? `;background:${YELLOW}` : ""}">([s1](${u}))</span>`),
    esc(line(/［ここに直近/)).replace(/［ここに[^］]*］/, (m) => `<span data-m="2"${on > 2 ? ` style="background:${YELLOW}"` : ""}>${m}</span>`),
  ].join("\n\n")}</div>`;
  const frames = [];
  for (let k = 1; k <= 3; k++) {
    const file = await snap(fileHtml(k) + panelHtml({ title: "Markdown\nでも", note: "そのまま持ち出せる" })), r = await rectOf(`[data-m="${k - 1}"]`);
    frames.push({ file, sec: 0.85, arrow: k === 3 ? { x: r.x + r.w / 2, y: r.y - 2, dir: "down" } : { x: Math.max(440, r.x - 6), y: r.y + 14, dir: "right" } });
  }
  await scene(8, frames, "マークダウンでも、持ち出せます。");
  await ctx.close();
  prepServer.stop();
}

// The finished tour on the full dashboard, as a visitor sees it (user 11/04): about 5 s per language, real screen frames,
// the arrow walking down the feedback panel to the ✗ → ✓ table.
async function finishedTour(lang, tag, say) {
  const line = NARR ? await NARR(say) : null;
  const sec = Math.max(3.2, line ? line.sec + 0.3 : say.length / 7.2 + 0.3);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5, locale: lang });
  await ctx.addInitScript((l) => { try { localStorage.setItem("mensetsu-lang", l); localStorage.setItem("mensetsu-tour-end", "a"); } catch {} }, lang);
  const page = await ctx.newPage();
  await page.goto(server.url);
  await page.locator(".msg.coach").first().waitFor();
  await page.locator("#log button").first().click();
  await page.locator("#tourStep", { hasText: /^1\// }).waitFor();
  for (let i = 0; i < 30; i++) {
    await page.waitForFunction(() => document.querySelector("#tour").hidden || !document.querySelector("#tourNext").disabled, null, { timeout: 30000 });
    if (await page.evaluate(() => document.querySelector("#tour").hidden)) break;
    await page.click("#tourNext");
    await page.waitForTimeout(150);
  }
  await page.evaluate((tag) => {
    for (const d of document.querySelectorAll("#reviewBox details")) d.open = true;
    const t = document.createElement("div");
    t.textContent = tag;
    Object.assign(t.style, { position: "fixed", zIndex: 99, left: "20px", bottom: "20px", padding: "8px 18px", background: "#ffe14d", color: "#0c1411", fontSize: "26px", fontWeight: "800", borderRadius: "4px" });
    document.body.append(t);
    const sc = document.querySelector("#paneReview");
    const els = [...document.querySelectorAll("#reviewBox .verdict, #reviewBox .step, #reviewBox .cmp")].filter((e) => e.getClientRects().length).slice(0, 6);
    const ar = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    ar.setAttribute("viewBox", "0 0 48 32");
    ar.innerHTML = '<path d="M2 11h24V2l20 14-20 14v-9H2z" fill="#ffe14d" stroke="#111" stroke-width="2.5" stroke-linejoin="round"/>';
    Object.assign(ar.style, { position: "fixed", zIndex: 99, width: "54px", height: "36px", pointerEvents: "none", transition: "left .25s, top .25s" });
    document.body.append(ar);
    ar.animate([{ transform: "translateX(-9px)" }, { transform: "translateX(2px)" }], { duration: 340, iterations: Infinity, direction: "alternate" });
    window.__clip = (i) => {
      const el = els[Math.min(i, els.length - 1)];
      sc.scrollTo({ top: sc.scrollTop + el.getBoundingClientRect().top - sc.getBoundingClientRect().top - 60, behavior: "smooth" });
      setTimeout(() => { const r = el.getBoundingClientRect(); Object.assign(ar.style, { left: `${Math.max(4, r.left - 60)}px`, top: `${r.top + 2}px` }); }, 260);
    };
    window.__clipN = els.length;
  }, tag);
  const cdp = await ctx.newCDPSession(page), frames = [], fdir = mkdtempSync(join(dir, "clip-"));
  cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
    const file = join(fdir, `f${String(frames.length).padStart(5, "0")}.jpg`);
    writeFileSync(file, Buffer.from(data, "base64"));
    frames.push({ file, t: metadata.timestamp });
    cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, everyNthFrame: 1 });
  const n = await page.evaluate(() => window.__clipN), t0 = Date.now() / 1000;
  for (let i = 0; i < n; i++) { await page.evaluate((k) => window.__clip(k), i); await page.waitForTimeout((sec * 1000) / n); }
  const t1 = Date.now() / 1000;
  await cdp.send("Page.stopScreencast");
  await ctx.close();
  const kept = frames.filter((f) => f.t <= t1);
  const list = join(fdir, "list.txt");
  writeFileSync(list, kept.map((f, i) => `file '${f.file}'\nduration ${Math.max(0.01, (kept[i + 1]?.t ?? t1) - Math.max(f.t, t0)).toFixed(3)}`).join("\n") + `\nfile '${kept.at(-1).file}'\n`);
  const file = segFile();
  const audio = line ? ["-i", line.wav] : ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono"];
  const af = line ? "[1:a]adelay=120:all=1,apad[a]" : "[1:a]anull[a]";
  ffmpeg("-f", "concat", "-safe", "0", "-i", list, ...audio, "-filter_complex", `[0:v]scale=1920:1080:flags=lanczos:out_range=tv,fps=30[v];${af}`, "-map", "[v]", "-map", "[a]", "-t", sec.toFixed(3), ...enc, file);
  return file;
}
const joinFiles = (a, b) => { const list = `${b}.join.txt`, file = segFile(); writeFileSync(list, `file '${a}'\nfile '${b}'\n`); ffmpeg("-f", "concat", "-safe", "0", "-i", list, "-c", "copy", file); return file; };
const koFull = await finishedTour("ko", "韓国語の画面", "チュートリアルを終えた画面です。こちらは韓国語。");
const enFull = await finishedTour("en", "英語の画面", "同じ画面を、英語でも。");
const ko = await langScene("ko", "韓国語の画面なら、解説も訳も韓国語。読み方はハングルで示します。", "韓国語", "ハングル", "韓国語");
segs.pop();
const en = await langScene("en", "英語の画面なら、解説も訳も英語。読み方はローマ字です。", "英語", "ローマ字", "英語");
segs.pop();
{ // Korean → slide → English, same composition.
  const koAll = joinFiles(koFull, ko), enAll = joinFiles(enFull, en);
  const file = segFile(), off = (durationOf(koAll) - 0.35).toFixed(3);
  ffmpeg("-i", koAll, "-i", enAll, "-filter_complex", `[0:v][1:v]xfade=transition=slideleft:duration=0.35:offset=${off}[v];[0:a][1:a]acrossfade=d=0.35[a]`, "-map", "[v]", "-map", "[a]", ...enc, file);
  segs.push({ file, chapter: 4 });
}
{ // Phone and web, the real screens of the same review.
  const shotAt = async (viewport) => { const { ctx, page } = await reviewed("ja", viewport), f = await appShot(page); await ctx.close(); return f; };
  const web = await shotAt({ width: 1280, height: 800 }), phone = await shotAt({ width: 390, height: 844 });
  const both = (showPhone) => `<div style="position:absolute;inset:0;background:${INK};color:#fff"><div style="position:absolute;left:56px;top:32px;font-size:52px;font-weight:900">スマホでも、<span style="color:${GREEN}">Web</span>でも</div>
    <img src="${png64(web)}" style="position:absolute;left:56px;top:130px;width:840px;height:525px;border-radius:8px"><div style="position:absolute;left:56px;top:664px;font-size:26px;font-weight:800;color:${SOFT}">Web</div>
    ${showPhone ? `<img src="${png64(phone)}" style="position:absolute;left:950px;top:130px;width:243px;height:526px;border-radius:14px"><div style="position:absolute;left:950px;top:664px;font-size:26px;font-weight:800;color:${SOFT}">スマホ</div>` : ""}</div>`;
  await scene(4, [
    { file: await snap(both(false)), sec: 1.2, arrow: { x: 800, y: 128, dir: "down" } },
    { file: await snap(both(true)), sec: 1.6, arrow: { x: 1071, y: 128, dir: "down" } },
  ], "スマホでも、ウェブでも使えます。");
}

// ⑤ How the app uses Claude (criterion: choose and combine models). Facts: lib/claude.js MODELS, lib/review.js + lib/script.js gates.
const flow = (items) => items.map((x, i) => `<div style="padding:20px 28px;border-radius:8px;background:#16271e;color:#fff;font-size:34px;font-weight:700;line-height:1.35">${x}</div>${i < items.length - 1 ? `<div style="text-align:center;color:${GREEN};font-size:28px;line-height:1.2;margin:6px 0">↓</div>` : ""}`).join("");
{
  const BOX = ["調査は Haiku、比較は Sonnet", "質問・台本・準備資料は Sonnet", "採点は別の呼び出しで Opus", "出典のない情報とルール外の添削は<br>プログラムが捨てる"];
  const frames = [];
  for (let k = 1; k <= BOX.length; k++) {
    const file = await snap(`<div style="position:absolute;inset:0;background:${INK};color:#fff;padding:44px 200px;box-sizing:border-box"><div style="font-size:42px;font-weight:800;color:${GREEN};margin-bottom:28px">アプリの中の Claude</div>${flow(BOX.map((b, i) => (i < k ? `<span data-b${i}>${b}</span>` : `<span style="opacity:.12">${b}</span>`)))}</div>`);
    const r = await rectOf(`[data-b${k - 1}]`);
    frames.push({ file, sec: 1.1, arrow: { x: 190, y: r.y + r.h / 2, dir: "right" } });
  }
  await scene(5, frames, "アプリの中では、調査はHaiku、比較と質問と台本はSonnet、採点は別の呼び出しでOpus。出典のない情報とルール外の添削は、プログラムが捨てます。");
}

// How it was built (user 11/05: a few seconds of hard cuts, not a list). Facts: README 「開発の進め方」.
{
  const cut = (bg, fg, main, sub, size = 150) => `<div style="position:absolute;inset:0;background:${bg};color:${fg};display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;line-height:1.2"><div style="font-size:${size}px;font-weight:900">${main}</div><div style="font-size:38px;font-weight:800;margin-top:26px">${sub}</div></div>`;
  const ascii = `<pre style="font:700 40px/1.25 Menlo,monospace;margin:0;color:${GREEN};text-align:left">+------------------+\n| mail      [paste]|\n| Q1  Q2  Q3   ... |\n| answer       [>] |\n+------------------+</pre>`;
  const cuts = [
    [GREEN, INK, "復唱", "何を・どこに・完了基準"],
    [INK, "#fff", ascii, "画面は、まず記号で"],
    ["#fff", INK, `<span style="color:#d83b3b">✗</span> → <span style="color:#059b45">✓</span>`, "失敗するテストから", 170],
    [YELLOW, INK, "攻撃", "サブエージェントが、アプリとデモを攻撃"],
    [INK, "#fff", "スキャン", "個人情報と秘密情報を確かめて、公開"],
    [GREEN, INK, "Claude Code", "この動画も、これで作りました", 130],
  ];
  const frames = [];
  for (const c of cuts) frames.push({ file: await snap(cut(...c)), sec: 0.75 });
  await scene(5, frames, "復唱、記号、失敗するテスト、攻撃、スキャン。動画も、Claude Codeで。");
}

// ⑥ The roadmap, the lesson, then the next person (user 11/05: the peak is handing this on, not the tool's own score).
const takeSeg = segs.find((s) => s.chapter === 3).file;
const grab = (key) => { const p = panels.find((x) => x.key === key), f = join(dir, `g-${key}.png`); ffmpeg("-ss", String(p.t + 1), "-i", takeSeg, "-frames:v", "1", f); return f; };
await scene(6, await reveal("国も、言葉も、", "足していける。"), "ルールは国ごとに分かれているので、国も言葉も足していけます。");
await scene(6, [
  { file: await snap(big("面接の壁は、", "", GREEN, INK, INK)), sec: 0.7 },
  { file: await snap(big("面接の壁は、", "答え方の壁", GREEN, INK, "#fff")), sec: 0.7 },
  { file: await snap(big("面接の壁は、", "答え方の壁だった。", GREEN, INK, "#fff")), sec: 1.2 },
], "面接の壁は、言葉の壁ではなく、答え方の壁でした。");
await scene(6, ["verdict", "compare", "script", "questions"].map((k) => ({ file: grab(k), sec: 0.65 })), "面接の前の夜に、開いてほしい。");
{ // The end card: the message, and the credit VOICEVOX's terms require.
  const end = (a, b) => `<div style="position:absolute;inset:0;background:${INK};color:#fff"><div style="position:absolute;left:90px;right:60px;top:170px;font-size:78px;font-weight:900;line-height:1.3;letter-spacing:-1px">${a}<br><span style="color:${GREEN}">${b}</span></div>
    <div style="position:absolute;left:90px;right:60px;top:480px;font-size:40px;font-weight:900">面接コーチ</div>
    <div style="position:absolute;left:90px;right:60px;top:540px;font-size:28px;font-weight:700;color:${YELLOW}">スマホでも、Webでも · mensetsu-coach-ten.vercel.app</div>
    <div style="position:absolute;left:90px;right:60px;top:600px;font-size:26px;font-weight:700;color:${SOFT}">ナレーション VOICEVOX:青山龍星 · Built with Claude: Japan 2026</div></div>`;
  await scene(6, [
    { file: await snap(end("次に日本で転職する", "")), sec: 1 },
    { file: await snap(end("次に日本で転職する", "外国人のために")), sec: 3.2 },
  ], "次に日本で転職する、外国人のために。");
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
copyFileSync(final, out);
console.log(`${out}: ${sec.toFixed(1)} s, ${segs.length} segments, wipes at ${bounds.map((b) => b.toFixed(1)).join(", ")}`);
let at = 0;
for (const s of segs) { const d = durationOf(s.file); console.log(`ch${s.chapter} ${at.toFixed(1)}-${(at + d).toFixed(1)} (${d.toFixed(1)} s)`); at += d; }
if (sec > MAX_SEC) throw new Error(`over the ${MAX_SEC} s limit: ${sec.toFixed(1)} s`);
