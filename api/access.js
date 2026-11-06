import { checkAccess, rateLimit, limited } from "../lib/guard.js";
import { sttEnabled } from "../lib/stt.js";
import { researchEnabled } from "../lib/research.js";
import { prepEnabled } from "../lib/prep.js";
import { mailPublic } from "../lib/mail.js";

const json = (status, body) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

// Checks the access code before the chat moves on. Calls no AI. stt: whether the UI may offer 🎤 recording. research: whether it may offer stage R. mail: whether it may offer the tip signup. prep: whether it may offer the prep document.
// open: OPEN_ACCESS=1, the UI starts without a code under the daily limit (lib/guard.js gate). unlimited: a right code lifts it.
export async function POST(request) {
  const ip = (request.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
  const open = process.env.OPEN_ACCESS?.trim() === "1", given = request.headers.get("x-access-code"); // trimmed as in the gate
  const flags = () => ({ ok: true, open, stt: sttEnabled(), research: researchEnabled(), mail: mailPublic(), prep: prepEnabled() });
  // The page asks without a code on every load to learn the mode; no code is no guess, so it never counts toward the lock.
  if (!given) return open ? json(200, { ...flags(), unlimited: false }) : json(401, { code: "access_denied" });
  // Only wrong codes count (reviews 11/03: a venue behind one IP was locked out by page reloads with the right code).
  // Once 20 wrong codes hit, the IP is locked for every code, so the lock cannot be used to test guesses.
  const fails = `access-fail:${ip}`;
  if (limited(fails, { limit: 20 })) return json(429, { code: "rate_limited" });
  if (!checkAccess(given)) {
    rateLimit(fails, { limit: 20 });
    return json(401, { code: "access_denied" });
  }
  return json(200, { ...flags(), unlimited: true });
}
