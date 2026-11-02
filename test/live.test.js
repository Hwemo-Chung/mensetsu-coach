// Calls the real Claude API (costs credits). Run by hand only after a prompt or model change: npm run test:live. Key from ENV_FILE (default .env).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { loadPack, generateQuestions } from "../lib/coach.js";

try { process.loadEnvFile(process.env.ENV_FILE ?? ".env"); } catch {}

test("sample agent mail → 10 company-specific questions (Day 1 acceptance)", { skip: !process.env.ANTHROPIC_API_KEY && "ANTHROPIC_API_KEY not set", timeout: 180000 }, async () => {
  const pack = loadPack("jp");
  const mail = readFileSync(new URL("../samples/agent-mail-sample.txt", import.meta.url), "utf8");
  const out = await generateQuestions(new Anthropic(), pack, mail, []);
  assert.equal(out.questions.length, 10);
  const cats = new Set(out.questions.map((q) => q.category));
  for (const q of out.questions) {
    assert.ok(pack.question_taxonomy.categories.includes(q.category), q.category);
    assert.ok(pack.question_taxonomy.stages.includes(q.stage), q.stage);
  }
  assert.ok(cats.size >= 3, `only ${[...cats]}`);
  const all = out.questions.map((q) => q.question_ja + q.basis_ko).join("\n");
  assert.match(all, /需要予測|在庫|物流|海外|6名|OKR|見積/, "questions should reflect the sample company");
  console.log(JSON.stringify(out, null, 2));
});
