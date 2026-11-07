// Records the no-code demo (public/demo/demo-<lang>.json) with real API calls on synthetic data.
// Usage: ENV_FILE=… node scripts/record-demo.mjs [--voice] [ja ko en]   (5 calls per language, costs credits)
//        ENV_FILE=… node scripts/record-demo.mjs --extras [ja ko en]  adds to the existing recording, nothing else moves:
//        the app's own checks through its route handlers (script check, reverse questions, F15 verify of a pasted script;
//        ja only, for the video) and a fresh model script for any step whose script no longer passes today's gates.
// --voice: the first answer is spoken (macOS `say`, voice Kyoko) and transcribed by the app's own in-browser recogniser
// code (public/stt-whisper.js, run in Node), so it is exactly what the 🎤 puts in the box, fillers included (video ③-a,
// 11/03). Needs macOS and `npm i --no-save @huggingface/transformers@=4.3.2`; 0 extra AI calls (Whisper is local).
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { loadPack, generateQuestions, generateReview, generateScript, maskInput, EXPLAIN_LANGS, READINGS } from "../lib/coach.js";

try { process.loadEnvFile(process.env.ENV_FILE ?? ".env"); } catch {}
const args = process.argv.slice(2), VOICE = args.includes("--voice"), EXTRAS = args.includes("--extras");
const langs = args.filter((a) => !a.startsWith("--")).length ? args.filter((a) => !a.startsWith("--")) : ["ja", "ko", "en"];
const client = new Anthropic();
const pack = loadPack("jp");
if (EXTRAS) {
  const { POST: verifyRoute } = await import("../lib/verify-api.js");
  const { POST: reverseRoute } = await import("../api/reverse.js");
  const call = async (route, body) => {
    const r = await route(new Request("http://local/", { method: "POST", headers: { "x-access-code": process.env.ACCESS_CODE ?? "", "content-type": "application/json", "x-forwarded-for": "127.0.0.1" }, body: JSON.stringify(body) }), { client });
    const j = await r.json();
    if (!r.ok) throw new Error(`${r.status} ${j.code}`);
    return j;
  };
  // The F15 sample: a pasted script with one claim the resume line does not back (三倍) — fictional, as the video says.
  const F15 = { script: "ご質問は、志望動機ですね。御社の理念に感動したので志望しました。前職では新しいシステムの導入で売上を三倍にしました。その経験を、御社の在庫管理サービスの改善に生かしたいと考えています。入社後は、まず［ここに担当したい領域］を担当し、半年で成果を出したいと考えています。", material: "サンプル物流（架空） 在庫管理システムの開発を担当。" };
  for (const lang of langs) {
    const file = new URL(`../public/demo/demo-${lang}.json`, import.meta.url);
    const demo = JSON.parse(readFileSync(file, "utf8"));
    const q = demo.questions[demo.pick], L = EXPLAIN_LANGS[lang], R = READINGS.ja[lang];
    const context = demo.company_context.facts.join("\n");
    // A script recorded before today's gates (11/07: a Japanese first sentence in the ko translation) is made again.
    for (const step of demo.steps) {
      const s = step.script;
      const bad = R && (typeof s.translation !== "string" || !(L.isProse ?? L.isText)(s.translation, "ja") || !(s.points ?? []).every((p) => L.isText(p, "ja")));
      if (!bad) continue;
      const fresh = await generateScript(client, pack, { question: q.question, category: q.category, answer: step.answer, context, lang });
      if (typeof fresh.translation !== "string") throw new Error(`${lang}: the new script has no translation either; record again`);
      step.script = fresh;
      console.log(lang, "re-made a script that failed today's gates");
    }
    if (lang === "ja") {
      // app.js checkScript: the first model script against the answer it came from; a 200 without checked is "not checked".
      const c = await call(verifyRoute, { script: demo.steps[0].script.text, question: q.question, category: q.category, facts: demo.company_context.facts, material: demo.steps[0].answer, pack: "jp" });
      demo.steps[0].script.check = c.checked ? { unsupported: c.unsupported, ...(c.dropped > 0 && { dropped: c.dropped }) } : null;
      demo.reverse = await call(reverseRoute, { context: demo.company_context, lang, pack: "jp" });
      const [review, verify] = await Promise.all([
        generateReview(client, pack, { question: q.question, category: q.category, answer: F15.script, lang }),
        call(verifyRoute, { script: F15.script, question: q.question, category: q.category, facts: demo.company_context.facts, material: F15.material, pack: "jp" }),
      ]);
      demo.verify = { ...F15, review, verify };
      console.log(lang, "| check unsupported:", demo.steps[0].script.check?.unsupported?.length ?? "not checked", "| reverse:", demo.reverse.questions.length, "| verify unsupported:", verify.unsupported?.length ?? "-");
    }
    demo.extras_recorded = new Date().toISOString().slice(0, 10);
    writeFileSync(file, JSON.stringify(demo, null, 1) + "\n");
  }
  process.exit(0);
}
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
