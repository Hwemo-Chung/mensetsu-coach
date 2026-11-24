import { checkAccess, rateLimit, limited } from "../lib/guard.js";
import { verifyLicense, checkoutUrl } from "../lib/license.js";
import { sttEnabled } from "../lib/stt.js";
import { researchEnabled } from "../lib/research.js";
import { prepEnabled } from "../lib/prep.js";
import { mailPublic } from "../lib/mail.js";

const json = (status, body) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
// Where to buy the paid pass: on every answer, refusals included, so the screen can offer it at the step
// where a visitor is stopped (GUMROAD_PRODUCT_URL unset: no field at all, and the screen shows no link).
const pass = () => { const url = checkoutUrl(); return url ? { checkoutUrl: url } : {}; };

// Checks the access code before the chat moves on. Calls no AI. stt: whether the UI may offer 🎤 recording. research: whether it may offer stage R. mail: whether it may offer the tip signup. prep: whether it may offer the prep document.
// open: OPEN_ACCESS=1, the UI starts without a code under the daily limit (lib/guard.js gate). unlimited: a right code or a paid pass lifts it.
export async function POST(request) {
  const ip = (request.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
  const open = process.env.OPEN_ACCESS?.trim() === "1", given = request.headers.get("x-access-code"); // trimmed as in the gate
  const flags = () => ({ ok: true, open, stt: sttEnabled(), research: researchEnabled(), mail: mailPublic(), prep: prepEnabled() });
  // The page asks without a code on every load to learn the mode; no code is no guess, so it never counts toward the lock.
  if (!given) return open ? json(200, { ...flags(), unlimited: false, ...pass() }) : json(401, { code: "access_denied", ...pass() });
  // Only wrong codes count (reviews 11/03: a venue behind one IP was locked out by page reloads with the right code).
  // Once 20 wrong codes hit, the IP is locked for every code, so the lock cannot be used to test guesses.
  const fails = `access-fail:${ip}`;
  if (limited(fails, { limit: 20 })) return json(429, { code: "rate_limited", ...pass() });
  if (!checkAccess(given)) {
    // The paid pass (Gumroad): the same field carries a licence key. A refused key counts toward the lock
    // like a wrong code; Gumroad being down is not the buyer's mistake and is never counted.
    const licence = await verifyLicense(given, { ip });
    if (licence.ok) return json(200, { ...flags(), unlimited: true, ...pass() });
    if (licence.reason === "unavailable") return json(503, { code: "license_unavailable", ...pass() });
    rateLimit(fails, { limit: 20 });
    if (licence.reason === "throttled") return json(429, { code: "rate_limited", ...pass() }); // ten keys from one IP in ten minutes
    if (licence.reason === "refunded") return json(401, { code: "license_inactive", ...pass() });
    return json(401, { code: "access_denied", ...pass() });
  }
  return json(200, { ...flags(), unlimited: true, ...pass() });
}
