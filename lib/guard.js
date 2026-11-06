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

// Access gate for every route that calls a model or an outside API (DECISIONS 11/06). The right code passes uncounted.
// A wrong code is 401. No code: 401 unless OPEN_ACCESS=1, then a daily limit per JST day, the IP's first so that one
// IP over its limit cannot use up everyone's count. Returns null to go on, or the response to send.
const DAY = 86_400_000, JST = 9 * 3_600_000;
const limitOf = (v, fallback) => (/^\d+$/.test(v?.trim() ?? "") ? Number(v) : fallback); // empty or broken env keeps the default; a pasted newline is not broken
const json = (status, body) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
export async function gate(request, { env = process.env, fetch: fetchFn = fetch, now = Date.now() } = {}) {
  const given = request.headers.get("x-access-code");
  if (checkAccess(given, env.ACCESS_CODE ?? "")) return null;
  if (given || env.OPEN_ACCESS?.trim() !== "1") return json(401, { code: "access_denied" });
  const day = new Date(now + JST).toISOString().slice(0, 10), resets = now + DAY - ((now + JST) % DAY);
  const ip = (request.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
  let kv = kvCounter(env, fetchFn, resets / 1000);
  const hit = async (key) => {
    if (kv) try { return await kv(key); } catch { kv = null; console.error("daily limit: KV unavailable, counting in this instance's memory"); }
    return countHere(key, day);
  };
  const over = (await hit(`quota:${day}:${ip}`)) > limitOf(env.DAILY_LIMIT_IP, 4) || (await hit(`quota:${day}`)) > limitOf(env.DAILY_LIMIT, 60);
  return over ? json(429, { code: "quota", resets_at: new Date(resets).toISOString() }) : null;
}
// Upstash Redis REST, the same env and call as lib/mail.js. The key carries the day, so the expiry only frees the store.
function kvCounter(env, fetchFn, expireAt) {
  const url = env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL, token = env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const cmd = async (...args) => {
    const r = await fetchFn(url, { method: "POST", signal: AbortSignal.timeout(2000), headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(args) });
    if (!r.ok) throw new Error(`store ${r.status}`);
    return (await r.json()).result;
  };
  return async (key) => {
    const n = await cmd("INCR", key);
    if (!Number.isInteger(n)) throw new Error("store result");
    if (n === 1) await cmd("EXPIREAT", key, expireAt).catch(() => {});
    return n;
  };
}
// shortcut: per-instance memory without KV, so each Vercel instance counts on its own; set KV_REST_API_* in production.
let hereDay = "", here = new Map();
function countHere(key, day) {
  if (day !== hereDay) [hereDay, here] = [day, new Map()]; // 00:00 JST: yesterday's counts go
  here.set(key, (here.get(key) ?? 0) + 1);
  return here.get(key);
}

// TTS reads only what /api/script wrote (security review 11/03): the script response carries an HMAC of its text and
// /api/tts checks it, so the shared free Gemini quota cannot be spent on arbitrary text. Secret: TTS_SECRET, else ACCESS_CODE.
const ttsSecret = () => process.env.TTS_SECRET || process.env.ACCESS_CODE || "";
export const sign = (text) => createHmac("sha256", ttsSecret()).update(String(text).trim()).digest("base64url").slice(0, 32);
export const signed = (text, sig) => typeof sig === "string" && sig.length === 32 && timingSafeEqual(Buffer.from(sig), Buffer.from(sign(text)));
