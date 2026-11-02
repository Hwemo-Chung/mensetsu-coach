import { timingSafeEqual, createHash } from "node:crypto";

const digest = (s) => createHash("sha256").update(String(s)).digest();

// Fails closed: with no ACCESS_CODE configured, nobody gets in.
export function checkAccess(given, expected = process.env.ACCESS_CODE) {
  if (!expected || !given) return false;
  return timingSafeEqual(digest(given), digest(expected));
}

// shortcut: per-instance memory, so limits reset on cold start and aren't shared across Vercel instances; move to Upstash/KV if abused.
const hits = new Map();
export function rateLimit(key, { limit = 10, windowMs = 10 * 60 * 1000, now = Date.now() } = {}) {
  const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}
