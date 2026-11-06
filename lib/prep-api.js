import Anthropic from "@anthropic-ai/sdk";
import { EXPLAIN_LANGS } from "./lang.js";
import { maskInput } from "./privacy.js";
import { gate, rateLimit } from "./guard.js";
import { toContentBlocks, AttachmentError } from "./attachment.js";
import { PACKS, loadPack } from "./pack.js";
import { readBriefFacts } from "./questions.js";
import { generatePrep, prepEnabled } from "./prep.js";

const MAX_MATERIAL_CHARS = 20000; // the attachment limit: a pasted resume is the same material
const MAX_QUESTION_CHARS = 1000, MAX_INPUT_CHARS = 500, MAX_NAME_CHARS = 100, MAX_LIST = 30;
const DEADLINE_MS = 165_000; // the research route's: under maxDuration 180, so a slow run still answers
const INPUTS = ["change_reason", "axis", "other_offers", "start_date"], HEADER = ["date", "format", "counterpart"];
const json = (status, body) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
const str = (v) => (typeof v === "string" ? v.trim() : "");
const picked = (from, keys) => Object.fromEntries(keys.map((k) => [k, maskInput(str(from?.[k]))]).filter(([, v]) => v));

let client;

// Same gate order as the other APIs; one hit per document. Named fields only: a desired profile in the body reaches nothing (PRD decision 5).
export async function POST(request, deps = {}) {
  const ip = (request.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
  if (!rateLimit(`prep:${ip}`, { limit: 6 })) return json(429, { code: "rate_limited" });
  const denied = await gate(request);
  if (denied) return denied;
  if (!(deps.enabled ?? prepEnabled())) return json(503, { code: "prep_unavailable" });

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { code: "bad_request" });
  }
  if (!body || typeof body !== "object") return json(400, { code: "bad_request" });
  const lang = body.lang ?? "ko";
  if (!Object.hasOwn(EXPLAIN_LANGS, lang)) return json(400, { code: "lang_unsupported" });
  const packId = body.pack ?? "jp";
  if (!PACKS.includes(packId)) return json(400, { code: "pack_unsupported" });
  const pack = loadPack(packId);
  if (!pack.script_doc) return json(400, { code: "prep_unsupported" });
  const stage = body.stage ?? "first";
  if (!Object.hasOwn(pack.script_doc.stages, stage)) return json(400, { code: "bad_request" });

  const pasted = str(body.material);
  if (pasted.length > MAX_MATERIAL_CHARS) return json(400, { code: "material_too_long", max: MAX_MATERIAL_CHARS });
  const raw = Array.isArray(body.questions) ? body.questions.slice(0, MAX_LIST) : [];
  const questions = raw.filter((q) => /^q\d{1,2}$/.test(q?.id) && str(q.question)).map((q) => ({ id: q.id, question: maskInput(str(q.question)), category: str(q.category), ...(q.basis_type === "research" && { basis_type: "research" }) }));
  if (!questions.length) return json(400, { code: "questions_required" });
  if (questions.some((q) => q.question.length > MAX_QUESTION_CHARS)) return json(400, { code: "question_too_long", max: MAX_QUESTION_CHARS });
  const company = str(body.context?.company), position = str(body.context?.position);
  if (!company || company.length > MAX_NAME_CHARS || position.length > MAX_NAME_CHARS) return json(400, { code: "context_required" });
  if ([...INPUTS.map((k) => body.inputs?.[k]), ...HEADER.map((k) => body.header?.[k])].some((v) => str(v).length > MAX_INPUT_CHARS)) return json(400, { code: "input_too_long", max: MAX_INPUT_CHARS });
  const only = body.bundles;
  if (only !== undefined && !(Array.isArray(only) && only.length && only.every((b) => pack.script_doc.bundles.some((x) => x.key === b)))) return json(400, { code: "bad_request" });

  try {
    // Text only: a PDF or an image can be neither masked nor checked against a quote, as in /api/fit.
    const attached = (await toContentBlocks(body.attachment)).filter((b) => b.type === "text").map((b) => b.text.trim());
    const material = [maskInput(pasted), ...attached].filter(Boolean).join("\n");
    if (!material) return json(400, { code: "material_required" });
    const c = deps.client ?? (client ??= new Anthropic({ maxRetries: 1 }));
    return json(200, await generatePrep(c, pack, {
      material, questions, lang, bundles: only, stage,
      context: { company: maskInput(company), position: maskInput(position), facts: (Array.isArray(body.context?.facts) ? body.context.facts : []).filter((f) => typeof f === "string").slice(0, MAX_LIST).map((f) => maskInput(f).slice(0, MAX_INPUT_CHARS)) },
      facts: readBriefFacts(body.research_facts, ["company", "news", "role"]),
      sources: Array.isArray(body.sources) ? body.sources.slice(0, MAX_LIST) : [],
      header: picked(body.header, HEADER), inputs: picked(body.inputs, INPUTS),
      signal: AbortSignal.timeout(deps.deadlineMs ?? DEADLINE_MS),
    }));
  } catch (e) {
    if (e instanceof AttachmentError) return json(400, { code: e.code, ...e.extra });
    if (e instanceof Anthropic.RateLimitError || e?.status === 529) return json(503, { code: "ai_busy" }); // 529 = Anthropic overloaded
    console.error("prep failed:", e?.status ?? "", e?.message); // never log the material
    return json(502, { code: "generation_failed" });
  }
}
