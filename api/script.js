import Anthropic from "@anthropic-ai/sdk";
import { loadPack, generateScript, EXPLAIN_LANGS, PACKS, maskInput } from "../lib/coach.js";
import { gate, rateLimit, sign } from "../lib/guard.js";

const MAX_ANSWER_CHARS = 2000;
const MAX_QUESTION_CHARS = 1000;
const MAX_CONTEXT_CHARS = 8000;
const json = (status, body) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
const text = (v) => (typeof v === "string" ? v.trim() : "");

let client;

// Model script for one answer. Same gate order as /api/questions: access → rate limit → validation → Claude.
export async function POST(request, deps = {}) {
  const ip = (request.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
  if (!rateLimit(`script:${ip}`, { limit: 30 })) return json(429, { code: "rate_limited" });
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
  const pack = body?.pack ?? "jp";
  if (!PACKS.includes(pack)) return json(400, { code: "pack_unsupported" });
  const answer = text(body?.answer);
  const question = text(body?.question);
  if (!answer) return json(400, { code: "answer_required" });
  if (answer.length > MAX_ANSWER_CHARS) return json(400, { code: "answer_too_long", max: MAX_ANSWER_CHARS });
  if (!question) return json(400, { code: "question_required" });
  if (question.length > MAX_QUESTION_CHARS) return json(400, { code: "question_too_long", max: MAX_QUESTION_CHARS });
  // shortcut: context is our own company_context echoed back by the UI, so it is cut, not rejected.
  const context = text(body?.context).slice(0, MAX_CONTEXT_CHARS);

  try {
    const c = deps.client ?? (client ??= new Anthropic({ timeout: 50_000, maxRetries: 1 }));
    const out = await generateScript(c, loadPack(pack), { question: maskInput(question), answer: maskInput(answer), context: maskInput(context), lang, category: text(body?.category), ...(body?.basis_type === "research" && { basis_type: "research" }) });
    return json(200, { ...out, ttsSig: sign(out.text) }); // 🔊 may read exactly this text (api/tts.js)
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError || e?.status === 529) return json(503, { code: "ai_busy" }); // 529 = Anthropic overloaded
    console.error("script failed:", e?.status ?? "", e?.message); // never log the answer
    return json(502, { code: "generation_failed" });
  }
}
