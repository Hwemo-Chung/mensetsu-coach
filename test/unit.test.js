import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPack, buildSystemPrompt, buildQuestionRequest, redact } from "../lib/coach.js";
import { toContentBlocks, AttachmentError } from "../lib/attachment.js";
import { checkAccess, rateLimit } from "../lib/guard.js";
import { POST } from "../api/questions.js";
import { POST as checkCode } from "../api/access.js";

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
  const code = (c) => (e) => e instanceof AttachmentError && e.code === c;
  await assert.rejects(toContentBlocks({ name: "x.txt", type: "text/plain", data: "" }), code("attachment_empty"));
  await assert.rejects(toContentBlocks({ name: "x.pdf", type: "application/pdf", data: b64("nope") }), code("attachment_not_pdf"));
  await assert.rejects(toContentBlocks({ name: "x.docx", type: "", data: b64("nope") }), code("attachment_not_docx"));
  await assert.rejects(toContentBlocks({ name: "x.exe", type: "application/octet-stream", data: b64("MZ") }), code("attachment_unsupported"));
  await assert.rejects(toContentBlocks({ name: "big.txt", type: "text/plain", data: Buffer.alloc(3 * 1024 * 1024 + 1).toString("base64") }), code("attachment_too_large"));
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
  const check = async (res, status, body) => { assert.equal(res.status, status); assert.deepEqual(await res.json(), body); };
  await check(await POST(req("bad", { mail: "x" })), 401, { code: "access_denied" });
  await check(await POST(req("c0de", { mail: "  " })), 400, { code: "mail_required" });
  await check(await POST(req("c0de", { mail: "x".repeat(8001) })), 400, { code: "mail_too_long", max: 8000 });
});

test("access check: wrong code 401, right code 200, no AI call", async () => {
  process.env.ACCESS_CODE = "c0de";
  const req = (code) => new Request("http://x/api/access", { method: "POST", headers: { "x-access-code": code, "x-forwarded-for": "8.8.8.8" } });
  const bad = await checkCode(req("bad"));
  assert.equal(bad.status, 401);
  assert.deepEqual(await bad.json(), { code: "access_denied" });
  assert.equal((await checkCode(req("c0de"))).status, 200);
});

// Minimal zip writer for tests: one deflated entry, real sizes in the central directory.
import { deflateRawSync, crc32 } from "node:zlib";
function zipOne(name, content) {
  const data = Buffer.from(content), comp = deflateRawSync(data), n = Buffer.from(name);
  const crc = crc32(data);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
  local.writeUInt32LE(crc, 14); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(n.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(8, 10);
  central.writeUInt32LE(crc, 16); central.writeUInt32LE(comp.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(n.length, 28);
  const localPart = Buffer.concat([local, n, comp]);
  const cd = Buffer.concat([central, n]);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(localPart.length, 16);
  return Buffer.concat([localPart, cd, end]);
}

test("attachments: a DOCX whose content expands past the limit (zip bomb) is rejected before parsing", async () => {
  const bomb = zipOne("word/document.xml", "A".repeat(25 * 1024 * 1024));
  assert.ok(bomb.length < 200 * 1024, `bomb is small on the wire (${bomb.length} bytes)`);
  await assert.rejects(toContentBlocks({ name: "cv.docx", type: "", data: bomb.toString("base64") }), (e) => e instanceof AttachmentError && e.code === "attachment_too_large");
});

test("SEC: extracted attachment text is capped at 20,000 characters", async () => {
  const out = await toContentBlocks({ name: "cv.txt", type: "text/plain", data: Buffer.from("あ".repeat(30000)).toString("base64") });
  assert.equal(out[0].text.length, 20000);
});
