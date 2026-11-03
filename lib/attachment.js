import mammoth from "mammoth";
import { inflateRawSync } from "node:zlib";
import { maskInput } from "./privacy.js";

// Vercel caps request bodies at 4.5MB; base64 adds ~33%, so 3MB raw keeps us under it.
export const MAX_BYTES = 3 * 1024 * 1024;
const IMAGE = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// The UI turns the code into a sentence in the user's language.
// A DOCX is a zip: a 1MB file can expand to hundreds of MB and exhaust function memory (measured: 725KB → 2.9GB).
// Inflate each entry with a hard output cap before handing the file to mammoth.
export const MAX_UNZIPPED = 20 * 1024 * 1024;
export const MAX_PDF_PAGES = 10;
const MAX_TEXT = 20000; // chars of extracted text per attachment (cost cap; a resume is ~2–7k)
// Actual inflated size (capped), not the size the file declares: a forged header must not get past this.
export function unzippedSize(buf, cap = MAX_UNZIPPED) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) return Infinity;
  let p = buf.readUInt32LE(eocd + 16), total = 0, n = 0;
  // Walk every central-directory record the way jszip does, not the count the end record claims (a forged 0 skipped
  // the whole check, security review 11/03). zip64 markers are refused: we never need them for a resume.
  for (; p + 46 <= buf.length && buf.readUInt32LE(p) === 0x02014b50; n++) {
    const method = buf.readUInt16LE(p + 10), comp = buf.readUInt32LE(p + 20), local = buf.readUInt32LE(p + 42);
    if (comp === 0xffffffff || local === 0xffffffff) return Infinity;
    if (local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) return Infinity;
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + comp);
    if (method === 0) total += data.length;
    else if (method === 8) {
      try { total += inflateRawSync(data, { maxOutputLength: cap - total + 1 }).length; } catch { return Infinity; }
    } else return Infinity;
    if (total > cap) return Infinity;
    p += 46 + buf.readUInt16LE(p + 28) + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return n ? total : Infinity; // no readable record: not a DOCX we can check
}

export class AttachmentError extends Error {
  constructor(code, extra = {}) {
    super(code);
    this.code = code;
    this.extra = extra;
  }
}

// Turns an uploaded file ({name, type, data: base64}) into Claude content blocks. Nothing is written to disk.
export async function toContentBlocks(file) {
  if (!file) return [];
  const { name = "", type = "", data } = file;
  if (typeof data !== "string" || !data) throw new AttachmentError("attachment_empty");
  const buf = Buffer.from(data, "base64");
  if (buf.length > MAX_BYTES) throw new AttachmentError("attachment_too_large", { max_mb: MAX_BYTES / 1024 / 1024 });
  const ext = name.toLowerCase().split(".").pop();

  if (type === "application/pdf" || ext === "pdf") {
    if (buf.subarray(0, 5).toString() !== "%PDF-") throw new AttachmentError("attachment_not_pdf");
    // A PDF goes to Claude whole (and twice on a specificity retry): cap pages, a résumé is 1–4 (review 11/03).
    // shortcut: pages inside compressed object streams (PDF 1.5+) are not counted; raise to a parser if abused.
    if ((buf.toString("latin1").match(/\/Type\s*\/Page(?![a-z])/g) ?? []).length > MAX_PDF_PAGES) throw new AttachmentError("attachment_too_large");
    return [{ type: "document", source: { type: "base64", media_type: "application/pdf", data } }];
  }
  if (IMAGE.has(type)) {
    return [{ type: "image", source: { type: "base64", media_type: type, data } }];
  }
  if (type === DOCX || ext === "docx") {
    if (buf.subarray(0, 2).toString() !== "PK") throw new AttachmentError("attachment_not_docx");
    if (unzippedSize(buf) > MAX_UNZIPPED) throw new AttachmentError("attachment_too_large", { max_mb: MAX_BYTES / 1024 / 1024 });
    const { value } = await mammoth.extractRawText({ buffer: buf });
    if (!value.trim()) throw new AttachmentError("attachment_docx_empty");
    return [{ type: "text", text: maskInput(value.slice(0, MAX_TEXT)) }];
  }
  if (type.startsWith("text/") || ext === "txt" || ext === "md") {
    return [{ type: "text", text: maskInput(buf.toString("utf8").slice(0, MAX_TEXT)) }];
  }
  throw new AttachmentError("attachment_unsupported");
}
