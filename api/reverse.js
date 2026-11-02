import Anthropic from "@anthropic-ai/sdk";
import { loadPack, generateReverse, EXPLAIN_LANGS, maskInput } from "../lib/coach.js";
import { checkAccess, rateLimit } from "../lib/guard.js";

const json = (status, body) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
const MAX_FACTS = 20;
const str = (v, max) => (typeof v === "string" ? maskInput(v.trim()).slice(0, max) : "");

let client;

// F10: reverse questions from the company summary the UI already holds. Same gate order as the other APIs.
export async function POST(request, deps = {}) {
  if (!checkAccess(request.headers.get("x-access-code"))) return json(401, { code: "access_denied" });
  const ip = (request.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
  if (!rateLimit(`reverse:${ip}`, { limit: 10 })) return json(429, { code: "rate_limited" });
  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { code: "bad_request" });
  }
  const lang = body?.lang ?? "ko";
  if (!Object.hasOwn(EXPLAIN_LANGS, lang)) return json(400, { code: "lang_unsupported" });
  const c = body?.context;
  if (!c || typeof c !== "object" || !Array.isArray(c.facts)) return json(400, { code: "context_required" });
  const context = { company: str(c.company, 200), position: str(c.position, 200), facts: c.facts.slice(0, MAX_FACTS).map((f) => str(f, 300)) };
  try {
    const cl = deps.client ?? (client ??= new Anthropic());
    return json(200, await generateReverse(cl, loadPack("jp"), { context, lang }));
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json(503, { code: "ai_busy" });
    console.error("reverse failed:", e?.status ?? "", e?.message);
    return json(502, { code: "generation_failed" });
  }
}
