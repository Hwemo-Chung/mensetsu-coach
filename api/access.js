import { checkAccess, rateLimit } from "../lib/guard.js";
import { sttEnabled } from "../lib/stt.js";

const json = (status, body) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

// Checks the access code before the chat moves on. Calls no AI. stt: whether the UI may offer 🎤 recording.
export async function POST(request) {
  const ip = (request.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
  if (!rateLimit(`access:${ip}`, { limit: 20 })) return json(429, { code: "rate_limited" });
  if (!checkAccess(request.headers.get("x-access-code"))) return json(401, { code: "access_denied" });
  return json(200, { ok: true, stt: sttEnabled() });
}
