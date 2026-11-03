// MOCK_CLAUDE stand-in for public/stt-local.js (dev.js serves it at /stt-local.js): no model download, no decoding.
// Tests set window.__sttText to change the transcript; every call is recorded in window.__sttCalls.
export const MOCK_TEXT = "えーと、前職では、なんか、新しいツールをちょっと導入しまして、あの、プロジェクトは成功しました。";

export const supported = () => true;
export function warm() {}

export async function recognize(blob, lang, onProgress) {
  (globalThis.__sttCalls ??= []).push({ lang, type: blob.type, size: blob.size });
  onProgress?.(100);
  return globalThis.__sttText ?? MOCK_TEXT;
}
