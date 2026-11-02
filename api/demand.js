import { rateLimit } from "../lib/guard.js";
import { makeStore } from "../lib/mail.js";

// "Coming soon" destinations (KR opened as beta on 11/03, so it is no longer counted). A click is one anonymous count:
// no code, no email, no IP is stored.
export const TARGETS = ["anglo", "other"];
const json = (status, body) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

export async function POST(request, deps = {}) {
  const ip = (request.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
  if (!rateLimit(`demand:${ip}`)) return json(429, { code: "rate_limited" });
  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { code: "bad_request" });
  }
  const target = body?.target;
  if (!TARGETS.includes(target)) return json(400, { code: "bad_request" });
  (deps.log ?? console.log)(JSON.stringify({ event: "demand", target })); // Vercel logs are the fallback counter
  const store = "store" in deps ? deps.store : makeStore();
  try {
    if (store) await store.incr(target);
  } catch (e) {
    console.error("demand count failed:", e?.message);
  }
  return json(200, { ok: true });
}
