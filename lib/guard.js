import { timingSafeEqual, createHash, createHmac } from "node:crypto";

const digest = (s) => createHash("sha256").update(String(s)).digest();

// Fails closed: with no ACCESS_CODE configured, nobody gets in.
export function checkAccess(given, expected = process.env.ACCESS_CODE) {
  if (!expected || !given) return false;
  return timingSafeEqual(digest(given), digest(expected));
}

// shortcut: per-instance memory, so limits reset on cold start and aren't shared across Vercel instances; move to Upstash/KV if abused.
// Keys are "route:ip" so one practice session (2 calls per answer) does not starve the other routes.
const hits = new Map();
export function rateLimit(key, { limit = 10, windowMs = 10 * 60 * 1000, now = Date.now() } = {}) {
  if (hits.size > 5000) for (const [k, ts] of hits) if (!ts.some((t) => now - t < windowMs)) hits.delete(k); // bound memory
  const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}
// Whether a key is over its limit, without counting a hit (the access check counts failures only).
export function limited(key, { limit = 10, windowMs = 10 * 60 * 1000, now = Date.now() } = {}) {
  return (hits.get(key) || []).filter((t) => now - t < windowMs).length >= limit;
}

// TTS reads only what /api/script wrote (security review 11/03): the script response carries an HMAC of its text and
// /api/tts checks it, so the shared free Gemini quota cannot be spent on arbitrary text. Secret: TTS_SECRET, else ACCESS_CODE.
const ttsSecret = () => process.env.TTS_SECRET || process.env.ACCESS_CODE || "";
export const sign = (text) => createHmac("sha256", ttsSecret()).update(String(text).trim()).digest("base64url").slice(0, 32);
export const signed = (text, sig) => typeof sig === "string" && sig.length === 32 && timingSafeEqual(Buffer.from(sig), Buffer.from(sign(text)));
