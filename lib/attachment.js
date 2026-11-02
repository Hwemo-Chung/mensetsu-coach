import mammoth from "mammoth";

// Vercel caps request bodies at 4.5MB; base64 adds ~33%, so 3MB raw keeps us under it.
export const MAX_BYTES = 3 * 1024 * 1024;
const IMAGE = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// The UI turns the code into a sentence in the user's language.
// A DOCX is a zip: a 1MB file can expand to hundreds of MB and exhaust function memory (measured: 725KB → 2.9GB).
// Sum the uncompressed sizes in the central directory before handing it to mammoth.
export const MAX_UNZIPPED = 20 * 1024 * 1024;
export function unzippedSize(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) return Infinity;
  let p = buf.readUInt32LE(eocd + 16), total = 0;
  for (let i = buf.readUInt16LE(eocd + 10); i > 0; i--) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) return Infinity;
    const size = buf.readUInt32LE(p + 24);
    if (size === 0xffffffff) return Infinity; // zip64: treat as too large
    total += size;
    p += 46 + buf.readUInt16LE(p + 28) + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return total;
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
    return [{ type: "text", text: value }];
  }
  if (type.startsWith("text/") || ext === "txt" || ext === "md") {
    return [{ type: "text", text: buf.toString("utf8") }];
  }
  throw new AttachmentError("attachment_unsupported");
}
