import { EXPLAIN_LANGS, loadPack } from "../lib/coach.js";
import { checkAccess, rateLimit } from "../lib/guard.js";
import { makeStore, normalizeEmail, isEmail, subscriberId, mailPublic, ownerToken, validWeak } from "../lib/mail.js";

const json = (status, body) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

const WEAK_TTL = 90 * 24 * 60 * 60; // a browser that stopped syncing should not leave its counts behind

// ?action=weak: the owner's browser overwrites its weak-point counts. Lives here because api/ is at the 12-function limit.
async function saveWeak(request, deps, ip) {
  // Its own limit: this fires on every answer, and the signup limit of 5 would silently drop a fast practice.
  if (!rateLimit(`weak:${ip}`, { limit: 60 })) return json(429, { code: "rate_limited" });
  if (!checkAccess(request.headers.get("x-access-code")) || !checkAccess(request.headers.get("x-mail-owner"), ownerToken())) return json(401, { code: "access_denied" });
  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { code: "bad_request" });
  }
  if (!validWeak(body, loadPack("jp"))) return json(400, { code: "bad_request" });
  const store = "store" in deps ? deps.store : makeStore();
  if (!store) return json(503, { code: "mail_unavailable" });
  try {
    await store.put("weak:owner", { ...body, updated_at: (deps.now ?? (() => new Date()))().toISOString() }, WEAK_TTL);
    return json(200, { ok: true });
  } catch (e) {
    console.error("weak sync failed:", e?.message);
    return json(502, { code: "mail_unavailable" });
  }
}

// Daily-tip signup. Stores only email + language + consent time, keyed by an HMAC id.
export async function POST(request, deps = {}) {
  const ip = (request.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
  if (new URL(request.url).searchParams.get("action") === "weak") return saveWeak(request, deps, ip);
  if (!rateLimit(`subscribe:${ip}`, { limit: 5 })) return json(429, { code: "rate_limited" });
  if (!checkAccess(request.headers.get("x-access-code"))) return json(401, { code: "access_denied" });
  if (!mailPublic()) return json(403, { code: "mail_off" });
  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { code: "bad_request" });
  }
  const email = normalizeEmail(body?.email);
  if (!isEmail(email)) return json(400, { code: "email_invalid" });
  if (body?.consent !== true) return json(400, { code: "consent_required" });
  const lang = body?.lang ?? "ko";
  if (!Object.hasOwn(EXPLAIN_LANGS, lang)) return json(400, { code: "lang_unsupported" });
  const store = "store" in deps ? deps.store : makeStore();
  if (!store || !process.env.MAIL_SECRET) return json(503, { code: "mail_unavailable" });
  try {
    const now = (deps.now ?? (() => new Date()))();
    await store.set(subscriberId(email, process.env.MAIL_SECRET), { email, lang, consented_at: now.toISOString() });
    return json(200, { ok: true });
  } catch (e) {
    console.error("subscribe failed:", e?.message); // never log the email
    return json(502, { code: "mail_unavailable" });
  }
}
