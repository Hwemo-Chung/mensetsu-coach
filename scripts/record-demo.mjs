// Records the no-code demo (public/demo/demo-<lang>.json) with real API calls on synthetic data.
// Usage: ENV_FILE=… node scripts/record-demo.mjs [ja ko en]   (5 calls per language, costs credits)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { loadPack, generateQuestions, generateReview, generateScript, maskInput } from "../lib/coach.js";

try { process.loadEnvFile(process.env.ENV_FILE ?? ".env"); } catch {}
const langs = process.argv.slice(2).length ? process.argv.slice(2) : ["ja", "ko", "en"];
const client = new Anthropic();
const pack = loadPack("jp");
const mail = readFileSync(new URL("../samples/agent-mail-sample.txt", import.meta.url), "utf8");

// The interview point in the sample mail is "how you judge when an estimate slips", so the demo practises that.
const OFF_TARGET = "はい、前職ではチームで新しい管理ツールを導入しまして、メンバーとも協力して、プロジェクトは無事に成功しました。社内でも評価をいただきました。";
// The second answer follows the product story: the user takes the model script and fills its ［blanks］ with
// their own facts. For the demo the facts are fictional and filled by Claude; everything else stays verbatim.
async function fillBlanks(ja) {
  const msg = await client.messages.create({
    model: "claude-sonnet-5-5", max_tokens: 2000,
    output_config: { effort: "low", format: { type: "json_schema", schema: { type: "object", properties: { answer: { type: "string" } }, required: ["answer"], additionalProperties: false } } },
    system: "面接回答の［］の空欄を、もっともらしい架空の具体的な事実（数字を含む）で埋めてください。空欄以外の文は一字も変えないでください。実在の会社名・人名は使わないでください。",
    messages: [{ role: "user", content: ja }],
  });
  return JSON.parse(msg.content.filter((b) => b.type === "text").map((b) => b.text).join("")).answer;
}

mkdirSync(new URL("../public/demo/", import.meta.url), { recursive: true });
for (const lang of langs) {
  const q = await generateQuestions(client, pack, maskInput(mail), [], lang);
  const pick = Math.max(0, q.questions.findIndex((x) => /見積/.test(x.question_ja)));
  const question = q.questions[pick].question_ja;
  const context = q.company_context.facts.join("\n");
  const [before, script] = await Promise.all([
    generateReview(client, pack, { question, answer: OFF_TARGET, lang }),
    generateScript(client, pack, { question, answer: OFF_TARGET, context, lang }),
  ]);
  const IMPROVED = await fillBlanks(script.ja);
  const after = await generateReview(client, pack, { question, answer: IMPROVED, lang });
  const demo = { lang, recorded: new Date().toISOString().slice(0, 10), mail, company_context: q.company_context, questions: q.questions, specificity: q.specificity, pick, steps: [{ answer: OFF_TARGET, review: before, script }, { answer: IMPROVED, review: after }] };
  writeFileSync(new URL(`../public/demo/demo-${lang}.json`, import.meta.url), JSON.stringify(demo, null, 1) + "\n");
  const ok = (r) => `${r.answers_question} ${Object.values(r.steps).map((s) => (s.present ? "✓" : "✗")).join("")}`;
  console.log(lang, "pick", pick + 1, "| before:", ok(before), "| after:", ok(after), "| specificity", q.specificity.referenced);
}
