import Anthropic from "@anthropic-ai/sdk";
import { EXPLAIN_LANGS, loadPack } from "../lib/coach.js";
import { checkAccess, gate, rateLimit } from "../lib/guard.js";
import { makeStore, makeMailer, signupMails, normalizeEmail, isEmail, subscriberId, mailPublic, ownerToken, validWeak } from "../lib/mail.js";
import { capRecord, digest } from "../lib/digest.js";

let client;

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

// Signup (11/07): mails ① a Claude digest of the session record and ② the preview the browser built, at once; then stores
// only email + language + consent time, keyed by an HMAC id, for the optional scheduled mail (MAIL_ROUTINE).
const text = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
export async function POST(request, deps = {}) {
  const ip = (request.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
  if (new URL(request.url).searchParams.get("action") === "weak") return saveWeak(request, deps, ip);
  if (!rateLimit(`subscribe:${ip}`, { limit: 5 })) return json(429, { code: "rate_limited" });
  const given = request.headers.get("x-access-code");
  if (!checkAccess(given) && (given || process.env.OPEN_ACCESS?.trim() !== "1")) return json(401, { code: "access_denied" }); // gate()'s rule, before anything is counted
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
  const record = capRecord(text(body?.record, Infinity)), preview = text(body?.preview, 20_000);
  const store = "store" in deps ? deps.store : makeStore();
  const mailer = "mailer" in deps ? deps.mailer : makeMailer();
  const app = process.env.APP_URL ?? "", keep = store && process.env.MAIL_SECRET && app; // stored only when each mail can carry the link that undoes it
  if ((record || preview) ? !mailer : !keep) return json(503, { code: "mail_unavailable" });
  const now = (deps.now ?? (() => new Date()))();
  let summary = null;
  // The digest is one counted call; over the daily limit (or on any failure) mail ① is the record itself.
  if (record && !(await gate(request))) {
    try { summary = await digest(deps.client ?? (client ??= new Anthropic({ timeout: 50_000, maxRetries: 1 })), record, lang); }
    catch (e) { console.error("digest failed:", e?.status ?? "", e?.message); }
  }
  const id = keep ? subscriberId(email, process.env.MAIL_SECRET) : "";
  const mails = signupMails({ digest: summary, record, preview, lang, date: now, appUrl: app, unsubscribeUrl: id ? `${app}/api/unsubscribe?id=${id}` : "" });
  let sent = 0;
  try {
    for (const m of mails) { await mailer.send({ to: email, ...m }); sent++; }
  } catch (e) {
    console.error("signup mail failed:", sent, e?.message); // never log the email
    // Once one mail went out the signup stands (a retry would mail ① again); before that, 403 = Resend's test sender, own address only.
    if (!sent) return e?.message === "mail 403" ? json(403, { code: "mail_test_only" }) : json(502, { code: "mail_unavailable" });
  }
  if (!keep) return json(200, { ok: true, sent });
  try {
    await store.set(id, { email, lang, consented_at: now.toISOString() });
    return json(200, { ok: true, sent });
  } catch (e) {
    console.error("subscribe failed:", e?.message); // never log the email
    return sent ? json(200, { ok: true, sent }) : json(502, { code: "mail_unavailable" }); // the mails went out; the routine list is optional
  }
}
