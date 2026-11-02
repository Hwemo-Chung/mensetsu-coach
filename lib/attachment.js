import mammoth from "mammoth";

// Vercel caps request bodies at 4.5MB; base64 adds ~33%, so 3MB raw keeps us under it.
export const MAX_BYTES = 3 * 1024 * 1024;
const IMAGE = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export class AttachmentError extends Error {}

// Turns an uploaded file ({name, type, data: base64}) into Claude content blocks. Nothing is written to disk.
export async function toContentBlocks(file) {
  if (!file) return [];
  const { name = "", type = "", data } = file;
  if (typeof data !== "string" || !data) throw new AttachmentError("파일이 비어 있습니다.");
  const buf = Buffer.from(data, "base64");
  if (buf.length > MAX_BYTES) throw new AttachmentError("파일은 3MB 이하만 올릴 수 있습니다.");
  const ext = name.toLowerCase().split(".").pop();

  if (type === "application/pdf" || ext === "pdf") {
    if (buf.subarray(0, 5).toString() !== "%PDF-") throw new AttachmentError("PDF 파일이 아닙니다.");
    return [{ type: "document", source: { type: "base64", media_type: "application/pdf", data } }];
  }
  if (IMAGE.has(type)) {
    return [{ type: "image", source: { type: "base64", media_type: type, data } }];
  }
  if (type === DOCX || ext === "docx") {
    if (buf.subarray(0, 2).toString() !== "PK") throw new AttachmentError("Word(.docx) 파일이 아닙니다.");
    const { value } = await mammoth.extractRawText({ buffer: buf });
    if (!value.trim()) throw new AttachmentError("Word 파일에서 글자를 찾지 못했습니다.");
    return [{ type: "text", text: value }];
  }
  if (type.startsWith("text/") || ext === "txt" || ext === "md") {
    return [{ type: "text", text: buf.toString("utf8") }];
  }
  throw new AttachmentError("PDF, Word(.docx), 이미지, 텍스트 파일만 올릴 수 있습니다.");
}
