import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPack, generateQuestions } from "../lib/coach.js";
import { POST } from "../api/questions.js";
import { fakeClient, fixture } from "./fake-claude.js";

const pack = loadPack("jp");

test("generateQuestions (fake Claude): 10 questions, ids, valid enums, personal data redacted", async () => {
  const out = await generateQuestions(fakeClient(), pack, "MAIL", []);
  assert.equal(out.questions.length, 10);
  assert.deepEqual(out.questions.map((q) => q.id), Array.from({ length: 10 }, (_, i) => `q${i + 1}`));
  for (const q of out.questions) {
    assert.ok(pack.question_taxonomy.stages.includes(q.stage), q.stage);
    assert.ok(pack.question_taxonomy.categories.includes(q.category), q.category);
  }
  assert.ok(out.company_context.facts.every((f) => !f.includes("@")));
  assert.ok(out.company_context.facts.some((f) => f.includes("[email]")));
});

test("generateQuestions rejects refusal, truncation and a wrong question count", async () => {
  await assert.rejects(generateQuestions(fakeClient({ stop: "refusal" }), pack, "M", []), /refusal/);
  await assert.rejects(generateQuestions(fakeClient({ stop: "max_tokens" }), pack, "M", []), /truncated/);
  const nine = { ...fixture, questions: fixture.questions.slice(0, 9) };
  await assert.rejects(generateQuestions(fakeClient({ result: nine }), pack, "M", []), /expected 10/);
});

test("API route with fake client: valid code + mail → 10 questions, no network", async () => {
  process.env.ACCESS_CODE = "c0de";
  const req = new Request("http://x/api/questions", {
    method: "POST",
    headers: { "x-access-code": "c0de", "x-forwarded-for": "7.7.7.7", "content-type": "application/json" },
    body: JSON.stringify({ mail: "テスト" }),
  });
  const res = await POST(req, { client: fakeClient() });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).questions.length, 10);
});

test("API route: Claude failure → 502 with a generic message (no mail text echoed)", async () => {
  process.env.ACCESS_CODE = "c0de";
  const req = new Request("http://x/api/questions", {
    method: "POST",
    headers: { "x-access-code": "c0de", "x-forwarded-for": "7.7.7.8", "content-type": "application/json" },
    body: JSON.stringify({ mail: "秘密のメール本文" }),
  });
  const res = await POST(req, { client: fakeClient({ fail: new Error("boom") }) });
  const text = await res.text();
  assert.equal(res.status, 502);
  assert.ok(!text.includes("秘密のメール本文"));
});
