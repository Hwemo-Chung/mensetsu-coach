import Anthropic from "@anthropic-ai/sdk";
import { loadPack, generateReverse, readReverseFacts, EXPLAIN_LANGS, maskInput } from "../lib/coach.js";
import { researchEnabled } from "../lib/research.js";
import { gate, rateLimit } from "../lib/guard.js";

const json = (status, body) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
const MAX_FACTS = 20;
const str = (v, max) => (typeof v === "string" ? maskInput(v.trim()).slice(0, max) : "");

let client;

// F10: reverse questions from the company summary the UI already holds. Same gate order as the other APIs.
export async function POST(request, deps = {}) {
  const ip = (request.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
  if (!rateLimit(`reverse:${ip}`, { limit: 10 })) return json(429, { code: "rate_limited" });
  const denied = await gate(request);
  if (denied) return denied;
  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { code: "bad_request" });
  }
  const lang = body?.lang ?? "ko";
  if (!Object.hasOwn(EXPLAIN_LANGS, lang)) return json(400, { code: "lang_unsupported" });
  // Reverse questions are JP-only for now: the conditions list and one-question gate are Japanese-specific.
  if ((body?.pack ?? "jp") !== "jp") return json(400, { code: "pack_unsupported" });
  const c = body?.context;
  if (!c || typeof c !== "object" || !Array.isArray(c.facts)) return json(400, { code: "context_required" });
  const context = { company: str(c.company, 200), position: str(c.position, 200), facts: c.facts.slice(0, MAX_FACTS).map((f) => str(f, 300)) };
  const brief = (deps.enabled ?? researchEnabled()) ? readReverseFacts(body.brief) : [];
  try {
    const cl = deps.client ?? (client ??= new Anthropic({ timeout: 50_000, maxRetries: 1 }));
    return json(200, await generateReverse(cl, loadPack("jp"), { context, lang, brief }));
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError || e?.status === 529) return json(503, { code: "ai_busy" }); // 529 = Anthropic overloaded
    console.error("reverse failed:", e?.status ?? "", e?.message);
    return json(502, { code: "generation_failed" });
  }
}
