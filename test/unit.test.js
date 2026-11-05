import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPack, buildSystemPrompt, buildQuestionRequest, redact } from "../lib/coach.js";
import { randomBytes } from "node:crypto";
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
  // Label 選択肢 → 締め 11/03 (PRD §16-15: the last step closes by question type); intent unchanged.
  assert.deepEqual(pack.answer_structure.steps.map((s) => s.label), ["復唱", "結論", "基準・数字", "締め"]);
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

test("optional question category: in the enum, excluded from 最低1つ, used only on residence/visa material", () => {
  const t = pack.question_taxonomy;
  assert.deepEqual(t.optional_categories, ["日本で働く理由・在留"]);
  const req = buildQuestionRequest(pack, "MAIL");
  assert.deepEqual(req.output_config.format.schema.properties.questions.items.properties.category.enum, [...t.categories, ...t.optional_categories]);
  const text = req.messages[0].content;
  assert.ok(text.includes(`各カテゴリ（${t.categories.join(" / ")}）を最低1つ含める。`), text);
  assert.doesNotMatch(text, /最低1つ[^。]*在留/);
  assert.match(text, /日本で働く理由・在留 は、資料に在留資格・外国籍採用・ビザ・海外拠点の記述があるときだけ、最大1問使う。/);
  // A pack without optional categories (future packs) gets no condition sentence and the required enum only.
  const plain = { ...pack, question_taxonomy: { ...t, optional_categories: undefined } };
  const r2 = buildQuestionRequest(plain, "MAIL");
  assert.deepEqual(r2.output_config.format.schema.properties.questions.items.properties.category.enum, t.categories);
  assert.doesNotMatch(r2.messages[0].content, /最大1問|undefined/);
  // The 国籍・出身 guard stays in the pack.
  assert.ok(pack.culture_notes.some((n) => n.includes("本籍・出生地")));
});

test("redact catches phone numbers written with parentheses, and leaves dates beside parentheses alone", () => {
  for (const phone of ["03(1234)5678", "０９０（１２３４）５６７８", "(090)1234-5678", "（03）1234-5678", "(03) 1234 5678", "03-(1234)-5678", "+81(3)1234-5678"]) {
    assert.ok(!/[\d０-９]/.test(redact(`TEL ${phone} まで`)), phone);
  }
  for (const text of ["2026-11-04 (10:00)", "2026.11.04(水)", "2019.04.01 (2020.03.31)", "株式会社サンプルテック（仮）", "売上 100(前年比 120)", "第3四半期(2026)"]) {
    assert.equal(redact(text), text);
  }
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

// Reviews 11/03: every code check counted, so a judging venue behind one IP was locked out after 20 page loads even
// with the right code. Only wrong codes count now; after 20 wrong ones the IP is locked (right code too: no oracle).
test("access check counts only wrong codes; a shared IP entering the right code is never locked out by that", async () => {
  process.env.ACCESS_CODE = "c0de";
  const req = (code, ip) => new Request("http://x/api/access", { method: "POST", headers: { "x-access-code": code, "x-forwarded-for": ip } });
  for (let i = 0; i < 30; i++) assert.equal((await checkCode(req("c0de", "7.7.7.7"))).status, 200, `right code #${i + 1}`);
  for (let i = 0; i < 20; i++) assert.equal((await checkCode(req("bad", "7.7.7.8"))).status, 401);
  assert.equal((await checkCode(req("bad", "7.7.7.8"))).status, 429);
  assert.equal((await checkCode(req("c0de", "7.7.7.8"))).status, 429, "locked after 20 wrong codes, right code included");
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

test("SEC-5: a zip whose central directory LIES about the size is still caught (actual inflate is capped)", async () => {
  const bomb = zipOne("word/document.xml", "A".repeat(25 * 1024 * 1024));
  // forge the declared uncompressed size in local + central headers to 100 bytes
  const eocd = bomb.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const cd = bomb.readUInt32LE(eocd + 16);
  bomb.writeUInt32LE(100, cd + 24);
  bomb.writeUInt32LE(100, 22);
  await assert.rejects(toContentBlocks({ name: "cv.docx", type: "", data: bomb.toString("base64") }), (e) => e instanceof AttachmentError && e.code === "attachment_too_large");
});

// Security review 11/03: with the EOCD entry count forged to 0 the size check walked nothing (total 0), while jszip
// (mammoth) reads every central-directory record anyway and inflates them all (local repro: RSS 72MB → 1.19GB).
test("SEC-5b: a zip whose end record LIES about the entry count (0) is still caught", async () => {
  const bomb = zipOne("word/document.xml", "A".repeat(25 * 1024 * 1024));
  const eocd = bomb.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  bomb.writeUInt16LE(0, eocd + 8);
  bomb.writeUInt16LE(0, eocd + 10);
  await assert.rejects(toContentBlocks({ name: "cv.docx", type: "", data: bomb.toString("base64") }), (e) => e instanceof AttachmentError && e.code === "attachment_too_large");
});

// Audit 11/05: the check walked the directory the end record points at, while jszip rebases by extraBytes or follows the
// zip64 record to another one. Both layouts hide a real entry behind a decoy (local repro: RSS 64MB → 3GB).
function zipWithDecoyDir({ zip64 }) {
  const pieces = (z) => { const end = z.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])), cd = z.readUInt32LE(end + 16); return [z.subarray(0, cd), Buffer.from(z.subarray(cd, end))]; };
  const [decoyLocal, decoyCd] = pieces(zipOne("a", "x")), [realLocal, realCd] = pieces(zipOne("word/document.xml", "A".repeat(1024 * 1024)));
  const pad = Buffer.alloc(200, 0x20), gap = Buffer.alloc(4);
  const r = decoyLocal.length + pad.length, f = r + realLocal.length, c = f + decoyCd.length + gap.length;
  realCd.writeUInt32LE(zip64 ? r : r - (c - f), 42);
  const z64 = Buffer.alloc(zip64 ? 76 : 0);
  if (zip64) {
    z64.writeUInt32LE(0x06064b50, 0); z64.writeBigUInt64LE(44n, 4); z64.writeBigUInt64LE(1n, 24); z64.writeBigUInt64LE(1n, 32);
    z64.writeBigUInt64LE(BigInt(realCd.length), 40); z64.writeBigUInt64LE(BigInt(c), 48);
    z64.writeUInt32LE(0x07064b50, 56); z64.writeBigUInt64LE(BigInt(c + realCd.length), 64); z64.writeUInt32LE(1, 72);
  }
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(zip64 ? 0xffff : 1, 8); end.writeUInt16LE(zip64 ? 0xffff : 1, 10);
  end.writeUInt32LE(realCd.length, 12); end.writeUInt32LE(f, 16);
  return Buffer.concat([decoyLocal, pad, realLocal, decoyCd, gap, realCd, z64, end]);
}

for (const [label, zip64] of [["a decoy central directory", false], ["a zip64 end record", true]]) {
  test(`SEC-5c: ${label} that sends the parser elsewhere is refused before walking`, async () => {
    const { unzippedSize } = await import("../lib/attachment.js");
    const { default: JSZip } = await import("jszip");
    const buf = zipWithDecoyDir({ zip64 });
    // The fixture is only worth testing while jszip really takes the other path and finds the hidden entry.
    assert.ok((await JSZip.loadAsync(buf)).files["word/document.xml"]);
    assert.equal(unzippedSize(buf), Infinity);
    await assert.rejects(toContentBlocks({ name: "cv.docx", type: "", data: buf.toString("base64") }), (e) => e instanceof AttachmentError && e.code === "attachment_unsupported");
  });
}

test("attachments: a DOCX that stays under the old 20MB cap but would exhaust the XML parser is rejected before parsing", async () => {
  const { unzippedSize } = await import("../lib/attachment.js");
  const bomb = zipOne("word/document.xml", "<a/>".repeat(5 * 1024 * 1024 / 4));
  // This goes first: without the cap, toContentBlocks would feed the bomb to mammoth (measured: 1.9GB RSS).
  assert.equal(unzippedSize(bomb), Infinity);
  await assert.rejects(toContentBlocks({ name: "cv.docx", type: "", data: bomb.toString("base64") }), (e) => e instanceof AttachmentError && e.code === "attachment_too_large");
});

test("attachments: an upload at the size limit made of incompressible images is still under the unzipped cap", async () => {
  const { unzippedSize, MAX_BYTES, MAX_UNZIPPED } = await import("../lib/attachment.js");
  assert.ok(unzippedSize(zipOne("word/media/photo.jpg", randomBytes(MAX_BYTES - 1024))) <= MAX_UNZIPPED);
});

test("attachments: a zip mammoth cannot read is the user's file problem (400 code), not a server error", async () => {
  await assert.rejects(toContentBlocks({ name: "cv.docx", type: "", data: zipOne("a.txt", "x").toString("base64") }), (e) => e instanceof AttachmentError && e.code === "attachment_unsupported");
});

test("SEC-5c: a zip comment still passes; an end record cut short is refused without a crash", async () => {
  const { unzippedSize } = await import("../lib/attachment.js");
  const zip = zipOne("word/document.xml", "<x/>");
  zip.writeUInt16LE(2, zip.length - 2);
  assert.equal(unzippedSize(Buffer.concat([zip, Buffer.from("ok")])), 4);
  const cut = Buffer.concat([zip, Buffer.from([0x50, 0x4b, 0x05, 0x06])]);
  await assert.rejects(toContentBlocks({ name: "cv.docx", type: "", data: cut.toString("base64") }), (e) => e instanceof AttachmentError && e.code === "attachment_unsupported");
});

test("SEC-5b: a normal zip still gets its real inflated size (no false rejection)", async () => {
  const { unzippedSize } = await import("../lib/attachment.js");
  assert.equal(unzippedSize(zipOne("word/document.xml", "<w:document>こんにちは</w:document>")), Buffer.byteLength("<w:document>こんにちは</w:document>"));
  assert.equal(unzippedSize(Buffer.from("not a zip")), Infinity);
});

test("P2: personal data in an attached text resume is masked", async () => {
  const out = await toContentBlocks({ name: "cv.txt", type: "text/plain", data: Buffer.from("連絡先 taro@example.com 090-1234-5678").toString("base64") });
  assert.ok(!out[0].text.includes("taro@example.com") && !out[0].text.includes("090-1234-5678"), out[0].text);
});

// Product review 11/03: common Japanese mail formats slipped through the mask before Claude.
test("masking covers spaced names, full-width ＠ and digits, and dotted phone numbers", async () => {
  const { maskInput } = await import("../lib/privacy.js");
  assert.equal(maskInput("山田 太郎 様"), "[氏名]様");
  assert.equal(maskInput("山田　太郎　様"), "[氏名]様");
  assert.equal(maskInput("連絡先 taro＠example.co.jp"), "連絡先 [email]");
  assert.equal(maskInput("TEL：０９０－１２３４－５６７８"), "TEL：[phone]");
  assert.equal(maskInput("090.1234.5678"), "[phone]");
  assert.equal(maskInput("株式会社サンプル様より書類選考通過のご連絡"), "株式会社サンプル様より書類選考通過のご連絡", "mid-sentence names stay");
});

// Résumé dates (2019.04.01〜2023.03.31, 2020-04-01) were masked as phone numbers; a date is not contact data.
test("masking keeps dates (yyyy.mm.dd / yyyy-mm-dd) and still masks phones", async () => {
  const { maskInput } = await import("../lib/privacy.js");
  const { mask } = await import("../public/export.js");
  for (const f of [maskInput, mask]) {
    assert.equal(f("在籍 2019.04.01〜2023.03.31"), "在籍 2019.04.01〜2023.03.31");
    assert.equal(f("2020-04-01〜2024-03-31"), "2020-04-01〜2024-03-31");
    assert.equal(f("電話 090-1234-5678"), "電話 [phone]");
  }
});

// Security review 11/03: a PDF is sent whole and the specificity retry sends it twice, so page count is capped
// (a résumé is 1–4 pages). shortcut: pages inside compressed object streams (PDF 1.5+) are not counted.
test("attachments: a PDF over 10 pages is refused; a short one passes", async () => {
  const pdf = (n) => Buffer.from(`%PDF-1.4\n${Array.from({ length: n }, (_, i) => `${i + 3} 0 obj << /Type /Page /Parent 2 0 R >> endobj\n`).join("")}2 0 obj << /Type /Pages /Count ${n} >> endobj\n%%EOF`).toString("base64");
  await assert.rejects(toContentBlocks({ name: "cv.pdf", type: "application/pdf", data: pdf(11) }), (e) => e instanceof AttachmentError && e.code === "attachment_too_large");
  const ok = await toContentBlocks({ name: "cv.pdf", type: "application/pdf", data: pdf(3) });
  assert.equal(ok[0].type, "document");
});
