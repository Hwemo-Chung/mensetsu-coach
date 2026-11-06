import Anthropic from "@anthropic-ai/sdk";
import { askJson } from "./claude.js";
import { maskInput } from "./privacy.js";
import { gate, rateLimit } from "./guard.js";
import { PACKS, loadPack } from "./pack.js";
import { blankCount, buildVerifyRequest, gateVerify, spokenTime, targetSeconds } from "./verify.js";

const MAX_SCRIPT_CHARS = 2000, MAX_QUESTION_CHARS = 1000; // /api/review's limits: the browser sends the same text to both
const MAX_MATERIAL_CHARS = 20000, MAX_FACT_CHARS = 500, MAX_FACTS = 30; // /api/prep's: the same resume and the same facts
const json = (status, body) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
const str = (v) => (typeof v === "string" ? v.trim() : "");

let client;

// F15 ④⑤: the browser sends the same script to /api/review for ①②③. Same gate order as the other APIs. Nothing is stored or logged.
export async function POST(request, deps = {}) {
  const ip = (request.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
  if (!rateLimit(`verify:${ip}`, { limit: 30 })) return json(429, { code: "rate_limited" }); // /api/review's: one check is one hit on each
  const denied = await gate(request);
  if (denied) return denied;

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { code: "bad_request" });
  }
  if (!body || typeof body !== "object") return json(400, { code: "bad_request" });
  const packId = body.pack ?? "jp";
  if (!PACKS.includes(packId)) return json(400, { code: "pack_unsupported" });
  const rawScript = str(body.script), rawQuestion = str(body.question), material = str(body.material);
  if (!rawScript) return json(400, { code: "answer_required" });
  if (rawScript.length > MAX_SCRIPT_CHARS) return json(400, { code: "answer_too_long", max: MAX_SCRIPT_CHARS });
  if (!rawQuestion) return json(400, { code: "question_required" });
  if (rawQuestion.length > MAX_QUESTION_CHARS) return json(400, { code: "question_too_long", max: MAX_QUESTION_CHARS });
  if (material.length > MAX_MATERIAL_CHARS) return json(400, { code: "material_too_long", max: MAX_MATERIAL_CHARS });

  const pack = loadPack(packId), script = maskInput(rawScript);
  const counts = { ...spokenTime(script, pack, targetSeconds(pack, { question: rawQuestion, category: str(body.category) })), blanks: blankCount(script) };
  // Company facts say nothing about the candidate, so without a resume, a mail or the user's own answer every career sentence would be flagged: no call.
  if (!material) return json(200, { ...counts, checked: false, unsupported: [], dropped: 0 });

  try {
    const c = deps.client ?? (client ??= new Anthropic({ timeout: 50_000, maxRetries: 1 }));
    const facts = (Array.isArray(body.facts) ? body.facts : []).filter((f) => typeof f === "string").slice(0, MAX_FACTS).map((f) => maskInput(f).slice(0, MAX_FACT_CHARS));
    const out = await askJson(c, buildVerifyRequest({ script, question: maskInput(rawQuestion), facts, material: maskInput(material) }));
    return json(200, { ...counts, checked: true, ...gateVerify(out, script) });
  } catch (e) {
    // ④ and the blank count are the code's: a model failure keeps them and names only its code (529 = Anthropic overloaded).
    const failed = e instanceof Anthropic.RateLimitError || e?.status === 529 ? "ai_busy" : "generation_failed";
    if (failed === "generation_failed") console.error("verify failed:", e?.status ?? "", e?.message); // never log the script or the material
    return json(200, { ...counts, checked: false, failed, unsupported: [], dropped: 0 });
  }
}
