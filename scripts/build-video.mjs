// Builds the whole demo video (subtitle-only cut) from DEMO-SCRIPT.md: ① story cards → ② first screen → ③ the one-take
// demo (scripts/record-video.mjs output) → ④ the same review in ko / en / ja + destination menu → ⑤ roadmap → closing.
// Screens are the live app (MOCK server, recorded real outputs, 0 AI calls); captions use the ③ caption band. Scene
// lengths follow reading time (~8 Japanese chars/s, at least 2.5 s) until the narration is decided.
// NARRATE=1 (+ GEMINI_API_KEY via ENV_FILE): Japanese narration from DEMO-SCRIPT.md read by Gemini TTS for the still
// scenes (no personal data in the lines, free tier OK); each scene lasts as long as its line. ③ keeps its own captions.
// Usage: [NARRATE=1 ENV_FILE=…] node scripts/build-video.mjs <section3.mp4> <out.mp4>   (needs system Chrome and ffmpeg)
import { readFileSync, writeFileSync, mkdtempSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { startServer, launch, CODE } from "../test/ui/harness.js";

const [take, out = "demo-full.mp4"] = process.argv.slice(2);
if (!take) throw new Error("usage: node scripts/build-video.mjs <section3.mp4> <out.mp4>");
const dir = mkdtempSync(join(tmpdir(), "mensetsu-build-"));
const VIEW = { width: 1280, height: 720 };
const read = (t) => Math.max(2.5, Math.ceil((t.replace(/\s/g, "").length / 8) * 2) / 2 + 1);
const pack = JSON.parse(readFileSync(new URL("../packs/jp.json", import.meta.url), "utf8"));
const steps = pack.answer_structure.steps.map(({ key, label, optional }) => ({ key, label, ...(optional && { optional }) }));

const server = await startServer({ STT_ENABLED: "0" });
const browser = await launch();
const shots = []; // { file, sec, say }
let n = 0;
async function shoot(page, sec, say = "") {
  const file = join(dir, `s${String(++n).padStart(2, "0")}.png`);
  await page.screenshot({ path: file });
  shots.push({ file, sec, say });
}

// Black story card (DEMO-SCRIPT ①, closing): one centred line.
async function card(page, line, sec = read(line), sub = "", say = "") {
  await page.setContent(`<!doctype html><meta charset="utf-8"><body style="margin:0;width:1280px;height:720px;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#111;color:#fff;font-family:'Hiragino Sans','Noto Sans JP',sans-serif">
    <div style="font-size:44px;font-weight:700;letter-spacing:1px">${line}</div>${sub ? `<div style="font-size:22px;margin-top:18px;color:#cfe9d8">${sub}</div>` : ""}</body>`);
  await shoot(page, sec, say);
}
// The ③ caption band over the live app.
async function caption(page, title, note) {
  await page.evaluate(({ title, note }) => {
    document.getElementById("rec-cap")?.remove();
    const cap = document.createElement("div"); cap.id = "rec-cap";
    Object.assign(cap.style, { position: "fixed", zIndex: 99, left: "0", right: "0", bottom: "0", padding: "14px 32px 18px", background: "rgba(17,17,17,.86)", color: "#fff", textAlign: "center" });
    const t = document.createElement("div"); t.textContent = title; Object.assign(t.style, { fontSize: "30px", fontWeight: "700", lineHeight: "1.3" });
    const n = document.createElement("div"); n.textContent = note; Object.assign(n.style, { fontSize: "18px", marginTop: "4px", color: "#cfe9d8" });
    cap.append(t, n); document.body.append(cap);
  }, { title, note });
}
// The app in one UI language, answered from that language's recording, stopped at the panel review.
async function reviewIn(lang) {
  const demo = JSON.parse(readFileSync(new URL(`../public/demo/demo-${lang}.json`, import.meta.url), "utf8"));
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1.5, locale: lang });
  await ctx.addInitScript((l) => { try { localStorage.setItem("mensetsu-lang", l); } catch {} }, lang);
  const page = await ctx.newPage();
  const answers = {
    "/api/access": () => ({ ok: true, stt: false }),
    "/api/questions": () => ({ company_context: demo.company_context, questions: demo.questions, specificity: demo.specificity, pack: { id: "jp", target: "ja", steps } }),
    "/api/review": () => demo.steps[0].review,
    "/api/script": () => demo.steps[0].script,
  };
  await page.route("**/api/**", (r) => { const p = new URL(r.request().url()).pathname; return answers[p] ? r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(answers[p]()) }) : r.continue(); });
  const send = async (t) => { await page.fill("#input", t); await page.click("#send"); };
  await page.goto(server.url);
  await page.locator(".msg.coach").first().waitFor();
  await send(CODE); await page.waitForTimeout(300);
  await send(demo.mail); await page.locator("#log .q").first().waitFor();
  await send(String(demo.pick + 1)); await page.waitForTimeout(300);
  await send(demo.steps[0].answer); await page.locator("#reviewBox > .review").waitFor();
  await page.waitForTimeout(400);
  return { ctx, page };
}

const blank = await (await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1.5 })).newPage();
// ① story (以前の転職活動 — no current interviews, user 11/03)
await card(blank, "同じ質問を、3回聞き返された。", undefined, "以前の転職活動の面接で", "以前の転職活動の面接で、同じ質問を3回聞き返されました。");
await card(blank, "日本語のせいではなかった。", undefined, "", "日本語が下手だったからではありません。");
await card(blank, "聞かれたことに、答えていなかった。", undefined, "", "聞かれたことではなく、準備した答えを話していたんです。");
// ② the first screen
{
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1.5, locale: "ja" });
  await ctx.addInitScript(() => { try { localStorage.setItem("mensetsu-lang", "ja"); } catch {} });
  const page = await ctx.newPage();
  await page.goto(server.url);
  await page.locator(".msg.coach").first().waitFor();
  await caption(page, "メールを貼るだけ。", "その会社専用の質問を、10問作ります"); await shoot(page, 3.5, "だから作りました。求人メールを貼るだけで、その会社専用の面接コーチになります。");
  await caption(page, "深夜でも、面接の直前でも。", "24時間、いつでも練習できます"); await shoot(page, 3.5, "深夜でも、面接の直前でも。24時間、いつでも練習できます。");
  await ctx.close();
}
const before = shots.length;
// ④ the same review explained in each screen language, then the destination menu
const four = [];
for (const [lang, label] of [["ko", "韓国語"], ["en", "English"], ["ja", "日本語"]]) {
  const { ctx, page } = await reviewIn(lang);
  await caption(page, "説明は、あなたの言葉で。", `画面の言語: ${label}`);
  await shoot(page, 3, lang === "ko" ? "説明は、韓国語・英語・日本語で。読み方も、その人の文字で書きます。" : "");
  four.push(shots.pop());
  await ctx.close();
}
{ // a real state: a fresh Japanese screen with the Korea destination actually selected (no session, so no reset dialog)
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1.5, locale: "ja" });
  await ctx.addInitScript(() => { try { localStorage.setItem("mensetsu-lang", "ja"); } catch {} });
  const page = await ctx.newPage();
  await page.goto(server.url);
  await page.locator(".msg.coach").first().waitFor();
  await page.selectOption("#dest", "kr");
  await page.waitForTimeout(500);
  await caption(page, "日本人の、韓国での転職にも。", "行き先「韓国で就職」はベータ版です");
  await shoot(page, 3.5, "韓国で働きたい日本人のための版も、ベータで動いています。");
  four.push(shots.pop());
  await ctx.close();
}
// ⑤ roadmap and closing
const tail = [];
for (const [t, s, say] of [["国を増やす", "ルールは国ごとのパック", "ルールは国ごとに分かれているので、国も言葉も足していけます。"], ["声で答える", "音声での回答と発音チェック（準備中）", "声での回答と発音チェックも、準備しています。"], ["毎朝1問", "メールで届く練習", "毎朝1問、メールで届く練習も。"]]) { await card(blank, t, 2.5, s, say); tail.push(shots.pop()); }
{
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1.5, locale: "ja" });
  await ctx.addInitScript(() => { try { localStorage.setItem("mensetsu-lang", "ja"); } catch {} });
  const page = await ctx.newPage();
  await page.goto(server.url);
  await page.locator(".msg.coach").first().waitFor();
  await caption(page, "あの時、欲しかったコーチ。", "転職活動のときの、自分のために");
  await shoot(page, 3.5, "転職活動のとき、私自身が欲しかったコーチです。"); tail.push(shots.pop());
  await ctx.close();
}
await card(blank, "面接の壁は、答え方の壁だった。", 4, "", "面接の壁は、言葉の壁ではなく、答え方の壁でした。"); tail.push(shots.pop());
await browser.close();
server.stop();

// Segments: stills → 30 fps clips at 1920×1080, the ③ take re-encoded to the same format, then one concat.
const seg = (i) => join(dir, `seg${String(i).padStart(2, "0")}.mp4`);
const enc = ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", "30", "-crf", "20", "-c:a", "aac", "-ar", "48000", "-ac", "1"];
const NARRATE = process.env.NARRATE === "1";
let synth = null;
if (NARRATE) {
  try { process.loadEnvFile(process.env.ENV_FILE ?? ".env"); } catch {}
  if (!process.env.GEMINI_API_KEY) throw new Error("NARRATE=1 needs GEMINI_API_KEY (ENV_FILE)");
  synth = (await import("../lib/tts.js")).synthesize;
}
let spoke = 0;
// One narration line → WAV (s16le mono PCM from Gemini); spaced 21 s apart for the free tier (~3 TTS requests/min).
async function narration(text, i) {
  if (spoke++) await new Promise((r) => setTimeout(r, 21_000));
  let a;
  for (let k = 0; ; k++) { // free tier answers 503 tts_busy now and then: wait a minute, up to 3 tries
    try { a = await synth({ text, voice: "Kore", apiKey: process.env.GEMINI_API_KEY }); break; }
    catch (e) { if (k >= 2 || e?.status !== 503) throw e; console.log(`tts busy, retry in 60 s: ${text.slice(0, 12)}…`); await new Promise((r) => setTimeout(r, 60_000)); }
  }
  const pcm = Buffer.isBuffer(a.body) ? a.body : Buffer.concat(await Array.fromAsync(a.body, (c) => Buffer.from(c)));
  const raw = join(dir, `n${i}.pcm`), wav = join(dir, `n${i}.wav`);
  writeFileSync(raw, pcm);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "s16le", "-ar", String(a.rate), "-ac", "1", "-i", raw, wav]);
  return { wav, sec: pcm.length / 2 / a.rate };
}
async function still(s, i) {
  const n = NARRATE && s.say ? await narration(s.say, i) : null;
  const sec = n ? Math.max(s.sec, n.sec + 0.8) : s.sec;
  const audio = n ? ["-i", n.wav, "-af", "adelay=300|300,apad"] : ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono"];
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-loop", "1", "-t", String(sec), "-i", s.file, ...audio, "-t", String(sec), "-vf", "scale=1920:1080:flags=lanczos,fade=t=in:st=0:d=0.25", ...enc, seg(i)]);
}
let i = 0;
for (const s of shots.slice(0, before)) await still(s, i++);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", take, "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono", "-shortest", "-vf", "scale=1920:1080:flags=lanczos,fps=30", ...enc, seg(i++)]);
for (const s of [...four, ...tail]) await still(s, i++);
writeFileSync(join(dir, "list.txt"), Array.from({ length: i }, (_, k) => `file '${seg(k)}'`).join("\n"));
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", join(dir, "list.txt"), "-c", "copy", "-movflags", "+faststart", join(dir, "full.mp4")]);
copyFileSync(join(dir, "full.mp4"), out);
const sec = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out]).toString());
console.log(`${out}: ${sec.toFixed(1)} s, ${i} segments`);
