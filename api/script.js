import Anthropic from "@anthropic-ai/sdk";
import { loadPack, generateScript, EXPLAIN_LANGS, maskInput } from "../lib/coach.js";
import { checkAccess, rateLimit } from "../lib/guard.js";

const MAX_ANSWER_CHARS = 2000;
const MAX_QUESTION_CHARS = 1000;
const MAX_CONTEXT_CHARS = 8000;
const json = (status, body) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
const text = (v) => (typeof v === "string" ? v.trim() : "");

let client;

// Model script for one answer. Same gate order as /api/questions: access → rate limit → validation → Claude.
export async function POST(request, deps = {}) {
  if (!checkAccess(request.headers.get("x-access-code"))) return json(401, { code: "access_denied" });
  const ip = (request.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
  if (!rateLimit(`script:${ip}`, { limit: 30 })) return json(429, { code: "rate_limited" });

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { code: "bad_request" });
  }
  const lang = body?.lang ?? "ko";
  if (!Object.hasOwn(EXPLAIN_LANGS, lang)) return json(400, { code: "lang_unsupported" });
  const answer = text(body?.answer);
  const question = text(body?.question);
  if (!answer) return json(400, { code: "answer_required" });
  if (answer.length > MAX_ANSWER_CHARS) return json(400, { code: "answer_too_long", max: MAX_ANSWER_CHARS });
  if (!question) return json(400, { code: "question_required" });
  if (question.length > MAX_QUESTION_CHARS) return json(400, { code: "question_too_long", max: MAX_QUESTION_CHARS });
  // shortcut: context is our own company_context echoed back by the UI, so it is cut, not rejected.
  const context = text(body?.context).slice(0, MAX_CONTEXT_CHARS);

  try {
    const c = deps.client ?? (client ??= new Anthropic());
    return json(200, await generateScript(c, loadPack("jp"), { question, answer: maskInput(answer), context: maskInput(context), lang }));
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json(503, { code: "ai_busy" });
    console.error("script failed:", e?.status ?? "", e?.message); // never log the answer
    return json(502, { code: "generation_failed" });
  }
}
