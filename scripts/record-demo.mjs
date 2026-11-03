// Records the no-code demo (public/demo/demo-<lang>.json) with real API calls on synthetic data.
// Usage: ENV_FILE=… node scripts/record-demo.mjs [--voice] [ja ko en]   (5 calls per language, costs credits)
// --voice: the first answer is spoken (macOS `say`, voice Kyoko) and transcribed by the app's own in-browser recogniser
// code (public/stt-whisper.js, run in Node), so it is exactly what the 🎤 puts in the box, fillers included (video ③-a,
// 11/03). Needs macOS and `npm i --no-save @huggingface/transformers@=4.3.2`; 0 extra AI calls (Whisper is local).
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { loadPack, generateQuestions, generateReview, generateScript, maskInput } from "../lib/coach.js";

try { process.loadEnvFile(process.env.ENV_FILE ?? ".env"); } catch {}
const args = process.argv.slice(2), VOICE = args.includes("--voice");
const langs = args.filter((a) => a !== "--voice").length ? args.filter((a) => a !== "--voice") : ["ja", "ko", "en"];
const client = new Anthropic();
const pack = loadPack("jp");
const mail = readFileSync(new URL("../samples/agent-mail-sample.txt", import.meta.url), "utf8");

// The interview point in the sample mail is "how you judge when an estimate slips", so the demo practises that.
const TYPED = "はい、前職ではチームで新しい管理ツールを導入しまして、メンバーとも協力して、プロジェクトは無事に成功しました。社内でも評価をいただきました。";
// The same answer as spoken, with the fillers a nervous speaker adds (えーと, なんか → the pack's del-nanka rule).
const SPOKEN = "えーと、はい、前職ではチームで新しい管理ツールを導入しまして、なんか、メンバーとも協力して、プロジェクトは無事に成功しました。社内でも評価をいただきました。";
async function heard(text) {
  const dir = mkdtempSync(join(tmpdir(), "mensetsu-voice-")), aiff = join(dir, "a.aiff"), wav = join(dir, "a.wav");
  execFileSync("say", ["-v", "Kyoko", "-o", aiff, text]);
  execFileSync("afconvert", ["-f", "WAVE", "-d", "LEI16@16000", "-c", "1", aiff, wav]); // 16 kHz mono PCM = Whisper's input
  const b = readFileSync(wav), d = b.indexOf("data") + 8, x = new Float32Array((b.length - d) >> 1);
  for (let i = 0; i < x.length; i++) x[i] = b.readInt16LE(d + 2 * i) / 32768;
  const tf = await import("@huggingface/transformers"), { load, recognize } = await import("../public/stt-whisper.js");
  return recognize(await load(tf), x, "ja");
}
const OFF_TARGET = VOICE ? await heard(SPOKEN) : TYPED;
if (VOICE) console.log("heard:", OFF_TARGET);
// The second answer follows the product story: the user takes the model script and fills its ［blanks］ with
// their own facts. For the demo the facts are fictional and filled by Claude; everything else stays verbatim.
async function fillBlanks(ja) {
  const msg = await client.messages.create({
    model: "claude-sonnet-5-5", max_tokens: 2000,
    output_config: { effort: "low", format: { type: "json_schema", schema: { type: "object", properties: { answer: { type: "string" } }, required: ["answer"], additionalProperties: false } } },
    system: "面接回答の［］の空欄を、もっともらしい架空の具体的な事実（数字を含む）で埋めてください。空欄1つにつき事実は1つだけ。基準や根拠の空欄には基準を1つだけ入れ、複数並べないでください。空欄以外の文は一字も変えないでください。実在の会社名・人名は使わないでください。", // one fact per blank: two criteria in one blank broke the 基準 rule (re-record 11/03)
    messages: [{ role: "user", content: ja }],
  });
  return JSON.parse(msg.content.filter((b) => b.type === "text").map((b) => b.text).join("")).answer;
}

mkdirSync(new URL("../public/demo/", import.meta.url), { recursive: true });
for (const lang of langs) {
  const q = await generateQuestions(client, pack, maskInput(mail), [], lang);
  const pick = Math.max(0, q.questions.findIndex((x) => /見積/.test(x.question)));
  const { question, category } = q.questions[pick]; // category: the closing type, as the app sends it (PRD §16-15)
  const context = q.company_context.facts.join("\n");
  const [before, script] = await Promise.all([
    generateReview(client, pack, { question, category, answer: OFF_TARGET, lang }),
    generateScript(client, pack, { question, category, answer: OFF_TARGET, context, lang }),
  ]);
  // A filler once slipped a Hungarian word into the Japanese answer ("ずれtelepülésen際に", 11/03): a Latin word that the
  // script did not have means a broken fill, so fill once more and stop if it repeats.
  const foreign = (t) => (t.match(/[A-Za-zÀ-ž]{3,}/g) ?? []).filter((w) => !script.text.includes(w));
  let IMPROVED = await fillBlanks(script.text);
  if (foreign(IMPROVED).length) IMPROVED = await fillBlanks(script.text);
  if (foreign(IMPROVED).length) throw new Error(`${lang}: filled answer has foreign words: ${foreign(IMPROVED)}`);
  // The corrected answer gets its own script too: the video shows it after the second answer (demo review 11/03).
  const [after, script2] = await Promise.all([
    generateReview(client, pack, { question, category, answer: IMPROVED, lang }),
    generateScript(client, pack, { question, category, answer: IMPROVED, context, lang }),
  ]);
  const demo = { lang, recorded: new Date().toISOString().slice(0, 10), mail, company_context: q.company_context, questions: q.questions, specificity: q.specificity, pick, steps: [{ answer: OFF_TARGET, ...(VOICE && { spoken: true }), review: before, script }, { answer: IMPROVED, review: after, script: script2 }] };
  writeFileSync(new URL(`../public/demo/demo-${lang}.json`, import.meta.url), JSON.stringify(demo, null, 1) + "\n");
  const ok = (r) => `${r.answers_question} ${Object.values(r.steps).map((s) => (s.present ? "✓" : "✗")).join("")}`;
  const habit = before.corrections.filter((c) => /^del-/.test(c.rule_id)).map((c) => c.rule_id); // filler rules the video can show
  console.log(lang, "pick", pick + 1, "| before:", ok(before), "| after:", ok(after), "| specificity", q.specificity.referenced, "| filler rules:", habit.join(",") || "none");
}
