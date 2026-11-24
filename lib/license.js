import { createHash } from "node:crypto";

// The paid pass (Gumroad). A buyer pastes the licence key Gumroad mailed into the same field as the
// review code; the key is checked once against Gumroad and the answer is kept for a while, so every
// call after that costs no API request. Grading, not the app: the key is never stored, only the
// hash of (product, key) and whether it was accepted.
//
// Set GUMROAD_PRODUCT_ID (preferred) or GUMROAD_PRODUCT_PERMALINK so a key for another product is
// refused, and GUMROAD_PRODUCT_URL so the screen can offer the purchase. No product: no pass, and
// the shared ACCESS_CODE is the only way in (the behaviour before this file existed).

const VERIFY = "https://api.gumroad.com/v2/licenses/verify";
// A good key is kept long enough that one buyer's session never reaches Gumroad twice; a refused
// key is kept briefly, so a corrected key or a late refund is seen soon and guessing stays cheap.
export const OK_MS = 12 * 60 * 60 * 1000;
export const DENY_MS = 10 * 60 * 1000;
// What Gumroad issues (e.g. A1B2C3D4-1234567890123). Anything else cannot be a key, so it is not sent.
const SHAPE = /^[A-Za-z0-9_-]{4,128}$/;

// Which product a key must belong to: the id when given, else the permalink (the slug in the URL).
export function passProduct(env = process.env) {
  const id = String(env.GUMROAD_PRODUCT_ID ?? "").trim();
  if (id) return { field: "product_id", value: id };
  const permalink = String(env.GUMROAD_PRODUCT_PERMALINK ?? "").trim();
  if (permalink) return { field: "product_permalink", value: permalink };
  return null;
}

// Where a blocked visitor is sent to buy: the screen shows the link only when this is set.
export const checkoutUrl = (env = process.env) => {
  const url = String(env.GUMROAD_PRODUCT_URL ?? "").trim();
  return /^https:\/\/[^\s"'<>]+$/.test(url) ? url : null;
};

// The answer to "does this key open the app": ok, or why not. "unavailable" is Gumroad's fault, not
// the buyer's, so callers answer that with retry, never with "wrong key".
export async function verifyLicense(key, { env = process.env, fetch: fetchFn = fetch, now = Date.now(), ip } = {}) {
  const product = passProduct(env);
  if (!product) return { ok: false, reason: "disabled" };
  const license = String(key ?? "").trim();
  if (!SHAPE.test(license)) return { ok: false, reason: "invalid" }; // no network for what cannot be a key
  const id = createHash("sha256").update(`${product.field}:${product.value}\n${license}`).digest("hex");
  const cached = await cacheGet(id, { env, fetch: fetchFn, now });
  if (cached === "ok") return { ok: true, cached: true };
  if (cached === "refunded") return { ok: false, reason: "refunded", cached: true };
  if (cached === "deny") return { ok: false, reason: "invalid", cached: true };
  // A stranger guessing keys must not spend Gumroad's API: 10 checks per IP in 10 minutes, cached keys free.
  // "throttled" is not the buyer's mistake and not Gumroad's fault either, so the screen says "too many".
  if (overChecks(ip, now)) return { ok: false, reason: "throttled" };

  let data;
  try {
    const r = await fetchFn(VERIFY, {
      method: "POST",
      signal: AbortSignal.timeout(4000),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ [product.field]: product.value, license_key: license, increment_uses_count: "false" }),
    });
    if (!r.ok) throw new Error(`gumroad ${r.status}`);
    data = await r.json();
  } catch (e) {
    console.error("licence check: Gumroad unavailable", e?.message ?? ""); // never the key or the product
    return { ok: false, reason: "unavailable" };
  }
  if (data?.success !== true) {
    await cacheSet(id, "deny", DENY_MS, { env, fetch: fetchFn, now });
    return { ok: false, reason: "invalid" };
  }
  // success alone is not enough: a refund or a chargeback ends the pass even while the key is valid.
  const p = data.purchase ?? {};
  if (p.refunded === true || p.chargebacked === true || p.disputed === true) {
    await cacheSet(id, "refunded", DENY_MS, { env, fetch: fetchFn, now });
    return { ok: false, reason: "refunded" };
  }
  await cacheSet(id, "ok", OK_MS, { env, fetch: fetchFn, now });
  return { ok: true };
}

// Upstash Redis REST, the same env as the daily counts (lib/guard.js); without it, this instance's
// memory, so each instance asks Gumroad once per key. A store that fails is not an error the buyer
// should see: the request goes to Gumroad again.
const checks = new Map(); // ip -> times of the Gumroad checks this instance made (guessing protection)
const CHECKS_PER_IP = 10, CHECKS_WINDOW_MS = 10 * 60 * 1000;
function overChecks(ip, now) {
  if (!ip) return false;
  if (checks.size > 5000) checks.clear(); // bound memory; the limit is per instance anyway
  const recent = (checks.get(ip) || []).filter((t) => now - t < CHECKS_WINDOW_MS);
  if (recent.length >= CHECKS_PER_IP) { checks.set(ip, recent); return true; }
  recent.push(now);
  checks.set(ip, recent);
  return false;
}
const store = (env) => {
  const url = env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL, token = env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
};
const mem = new Map(); // id -> { value, expires }: a hit here skips the store on every call in this instance
const MEM_AFTER_STORE_MS = 60 * 1000; // a store hit is kept briefly here; the store's own expiry decides the rest

async function cacheGet(id, { env, fetch: fetchFn, now }) {
  const hit = mem.get(id);
  if (hit && hit.expires > now) return hit.value;
  if (hit) mem.delete(id);
  const kv = store(env);
  if (!kv) return null;
  try {
    const r = await fetchFn(kv.url, {
      method: "POST",
      signal: AbortSignal.timeout(1500),
      headers: { authorization: `Bearer ${kv.token}`, "content-type": "application/json" },
      body: JSON.stringify(["GET", `license:${id}`]),
    });
    if (!r.ok) throw new Error(`store ${r.status}`);
    const { result } = await r.json();
    const value = result === "ok" || result === "deny" || result === "refunded" ? result : null;
    if (value) mem.set(id, { value, expires: now + MEM_AFTER_STORE_MS });
    return value;
  } catch {
    return null; // count on Gumroad, not on the store
  }
}

async function cacheSet(id, value, ttlMs, { env, fetch: fetchFn, now }) {
  const kv = store(env);
  // With a store, it decides and this instance keeps the answer only briefly; without one, memory is all there is.
  mem.set(id, { value, expires: now + (kv ? Math.min(ttlMs, MEM_AFTER_STORE_MS) : ttlMs) });
  if (mem.size > 2000) for (const [k, v] of mem) if (v.expires <= now) mem.delete(k); // bound memory
  if (!kv) return;
  try {
    await fetchFn(kv.url, {
      method: "POST",
      signal: AbortSignal.timeout(1500),
      headers: { authorization: `Bearer ${kv.token}`, "content-type": "application/json" },
      body: JSON.stringify(["SET", `license:${id}`, value, "PX", ttlMs]),
    });
  } catch {
    // the memory entry above still saves the call in this instance
  }
}
