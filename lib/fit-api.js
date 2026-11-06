import Anthropic from "@anthropic-ai/sdk";
import { EXPLAIN_LANGS } from "./lang.js";
import { maskInput } from "./privacy.js";
import { gate, rateLimit } from "./guard.js";
import { toContentBlocks, AttachmentError } from "./attachment.js";
import { PACKS, loadPack } from "./pack.js";
import { desiredProfileText, generateFit, researchEnabled } from "./research.js";

const MAX_MAIL_CHARS = 8000, MAX_PROFILE_CHARS = 200; // the same limits as /api/questions: this is the same material
const MAX_BRIEF_CHARS = 100_000; // a gated brief stays far under this; the body is what the browser says it is
const json = (status, body) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
const str = (v) => (typeof v === "string" ? v.trim() : "");

let client;

// Stage R fit. Same gate order as the other APIs. The only route that receives the desired profile.
export async function POST(request, deps = {}) {
  const ip = (request.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
  if (!rateLimit(`fit:${ip}`, { limit: 10 })) return json(429, { code: "rate_limited" });
  const denied = await gate(request);
  if (denied) return denied;
  if (!(deps.enabled ?? researchEnabled())) return json(503, { code: "research_unavailable" });

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { code: "bad_request" });
  }
  const lang = body?.lang ?? "ko";
  if (!Object.hasOwn(EXPLAIN_LANGS, lang)) return json(400, { code: "lang_unsupported" });
  const packId = body?.pack ?? "jp";
  if (!PACKS.includes(packId)) return json(400, { code: "pack_unsupported" });
  const brief = body?.brief;
  if (brief?.research_status !== "ok" || JSON.stringify(brief).length > MAX_BRIEF_CHARS) return json(400, { code: "bad_request" });
  const mail = str(body.mail), line = str(body.profile);
  if (mail.length > MAX_MAIL_CHARS) return json(400, { code: "mail_too_long", max: MAX_MAIL_CHARS });
  if (line.length > MAX_PROFILE_CHARS) return json(400, { code: "profile_too_long", max: MAX_PROFILE_CHARS });

  try {
    // Text only: a PDF or an image can be neither masked nor checked against a quote (guardrail 7, §10).
    const attached = (await toContentBlocks(body.attachment)).filter((b) => b.type === "text").map((b) => b.text);
    const material = [maskInput(line), ...attached].filter(Boolean).join("\n");
    const c = deps.client ?? (client ??= new Anthropic({ timeout: 50_000, maxRetries: 1 }));
    return json(200, await generateFit(c, { brief, material, profile: desiredProfileText(body.desired_profile), mail: maskInput(mail), lang, banned: loadPack(packId).research?.banned_terms }));
  } catch (e) {
    if (e instanceof AttachmentError) return json(400, { code: e.code, ...e.extra });
    if (e instanceof Anthropic.RateLimitError || e?.status === 529) return json(503, { code: "ai_busy" }); // 529 = Anthropic overloaded
    console.error("fit failed:", e?.status ?? "", e?.message); // never log the material or the profile
    return json(502, { code: "generation_failed" });
  }
}
