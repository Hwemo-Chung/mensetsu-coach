import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPack, buildSystemPrompt, buildQuestionRequest, redact } from "../lib/coach.js";
import { toContentBlocks, AttachmentError } from "../lib/attachment.js";
import { checkAccess, rateLimit } from "../lib/guard.js";
import { POST } from "../api/questions.js";

const pack = loadPack("jp");

test("pack covers every DESIGN §5 rule (F4 acceptance)", () => {
  const patterns = pack.correction_rules.map((r) => `${r.pattern} ${r.replacement}`).join("\n");
  for (const p of ["の形", "ちゃんと", "なんか", "ちょっと", "逆に", "自分的には", "透過", "理解", "集中", "承知", "資産", "コスト", "と思います", "事実"]) {
    assert.ok(patterns.includes(p), `missing rule for ${p}`);
  }
  const types = new Set(pack.correction_rules.map((r) => r.type));
  assert.deepEqual([...types].sort(), ["delete", "replace", "structure"]);
  assert.equal(pack.correction_rules.filter((r) => r.type === "structure").length >= 3, true);
});

test("every rule has the PRD shape", () => {
  for (const r of pack.correction_rules) {
    for (const k of ["id", "pattern", "type", "replacement", "reason", "example_before", "example_after"]) assert.ok(k in r, `${r.id} lacks ${k}`);
    if (r.type !== "structure") assert.notEqual(r.example_before, r.example_after, r.id);
  }
  assert.equal(new Set(pack.correction_rules.map((r) => r.id)).size, pack.correction_rules.length);
});

test("4文型 has the four steps in order", () => {
  assert.deepEqual(pack.answer_structure.steps.map((s) => s.label), ["復唱", "結論", "基準・数字", "選択肢"]);
});

test("pack id is validated", () => assert.throws(() => loadPack("../x")));

test("system prompt injects all rules, the output order and the no-guess rule", () => {
  const sp = buildSystemPrompt(pack);
  for (const r of pack.correction_rules) assert.ok(sp.includes(`[${r.id}]`), r.id);
  assert.ok(sp.indexOf("① 構造チェック") < sp.indexOf("② 日本語添削") && sp.indexOf("② 日本語添削") < sp.indexOf("③ 60秒"));
  assert.match(sp, /これ以外の添削はしない/);
  assert.match(sp, /確認の質問/);
  assert.ok(buildSystemPrompt(pack, "会社A").endsWith("会社A"));
});

test("question request wraps material and attaches blocks", () => {
  const req = buildQuestionRequest(pack, "MAIL", [{ type: "text", text: "CV" }]);
  assert.equal(req.output_config.format.type, "json_schema");
  const c = req.messages[0].content;
  assert.equal(c[1].text, "CV");
  assert.match(c.at(-1).text, /<company_material>\nMAIL/);
  assert.equal(typeof buildQuestionRequest(pack, "MAIL").messages[0].content, "string");
});

test("redact strips email and phone", () => {
  assert.equal(redact("a@b.co / 090-1234-5678 / 120名"), "[email] / [phone] / 120名");
});

test("attachments: pdf, text, rejects", async () => {
  const b64 = (s) => Buffer.from(s).toString("base64");
  assert.equal((await toContentBlocks({ name: "cv.pdf", type: "application/pdf", data: b64("%PDF-1.4 x") }))[0].type, "document");
  assert.deepEqual(await toContentBlocks({ name: "cv.txt", type: "text/plain", data: b64("経歴") }), [{ type: "text", text: "経歴" }]);
  assert.deepEqual(await toContentBlocks(undefined), []);
  await assert.rejects(toContentBlocks({ name: "x.pdf", type: "application/pdf", data: b64("nope") }), AttachmentError);
  await assert.rejects(toContentBlocks({ name: "x.docx", type: "", data: b64("nope") }), AttachmentError);
  await assert.rejects(toContentBlocks({ name: "x.exe", type: "application/octet-stream", data: b64("MZ") }), AttachmentError);
  await assert.rejects(toContentBlocks({ name: "big.txt", type: "text/plain", data: Buffer.alloc(3 * 1024 * 1024 + 1).toString("base64") }), AttachmentError);
});

test("access check fails closed", () => {
  assert.equal(checkAccess("x", undefined), false);
  assert.equal(checkAccess("", "c"), false);
  assert.equal(checkAccess("wrong", "c0de"), false);
  assert.equal(checkAccess("c0de", "c0de"), true);
});

test("rate limit blocks the 11th request in the window", () => {
  for (let i = 0; i < 10; i++) assert.equal(rateLimit("t", { now: 1000 }), true);
  assert.equal(rateLimit("t", { now: 1000 }), false);
  assert.equal(rateLimit("t", { now: 1000 + 10 * 60 * 1000 }), true);
});

test("API rejects bad access code and empty mail before calling Claude", async () => {
  process.env.ACCESS_CODE = "c0de";
  const req = (code, body) => new Request("http://x/api/questions", { method: "POST", headers: { "x-access-code": code, "x-forwarded-for": "9.9.9.9" }, body: JSON.stringify(body) });
  assert.equal((await POST(req("bad", { mail: "x" }))).status, 401);
  assert.equal((await POST(req("c0de", { mail: "  " }))).status, 400);
  assert.equal((await POST(req("c0de", { mail: "x".repeat(8001) }))).status, 400);
});
