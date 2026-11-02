import { EXPLAIN_LANGS } from "../lib/coach.js";
import { checkAccess, rateLimit } from "../lib/guard.js";
import { makeStore, normalizeEmail, isEmail, subscriberId } from "../lib/mail.js";

const json = (status, body) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

// Daily-tip signup. Stores only email + language + consent time, keyed by an HMAC id.
export async function POST(request, deps = {}) {
  if (!checkAccess(request.headers.get("x-access-code"))) return json(401, { code: "access_denied" });
  const ip = (request.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
  if (!rateLimit(ip)) return json(429, { code: "rate_limited" });
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
