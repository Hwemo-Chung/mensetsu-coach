import Anthropic from "@anthropic-ai/sdk";
import { loadPack, generateQuestions, readBriefFacts, EXPLAIN_LANGS, PACKS, maskInput } from "../lib/coach.js";
import { researchEnabled } from "../lib/research.js";
import { toContentBlocks, AttachmentError } from "../lib/attachment.js";
import { checkAccess, rateLimit } from "../lib/guard.js";

const MAX_MAIL_CHARS = 8000;
const MAX_PROFILE_CHARS = 200;
const json = (status, body) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

let client;

// Vercel web-standard handler; dev.js calls the same function locally.
export async function POST(request, deps = {}) {
  const ip = (request.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
  if (!rateLimit(`questions:${ip}`, { limit: 10 })) return json(429, { code: "rate_limited" });
  if (!checkAccess(request.headers.get("x-access-code"))) return json(401, { code: "access_denied" });

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
  const mail = typeof body?.mail === "string" ? body.mail.trim() : "";
  if (!mail) return json(400, { code: "mail_required" });
  if (mail.length > MAX_MAIL_CHARS) return json(400, { code: "mail_too_long", max: MAX_MAIL_CHARS });
  // Optional one-line career summary (after the first questions). Sent as candidate material, never stored.
  const profile = typeof body?.profile === "string" ? body.profile.trim() : "";
  if (profile.length > MAX_PROFILE_CHARS) return json(400, { code: "profile_too_long", max: MAX_PROFILE_CHARS });

  // Stage R facts, only when the flag is on; off = today's request whatever the body carries.
  const brief = (deps.enabled ?? researchEnabled()) ? readBriefFacts(body.brief) : [];

  try {
    const blocks = [...(await toContentBlocks(body.attachment)), ...(profile ? [{ type: "text", text: maskInput(profile) }] : [])];
    const c = deps.client ?? (client ??= new Anthropic({ timeout: 50_000, maxRetries: 1 }));
    return json(200, await generateQuestions(c, loadPack(pack), maskInput(mail), blocks, lang, brief));
  } catch (e) {
    if (e instanceof AttachmentError) return json(400, { code: e.code, ...e.extra });
    if (e instanceof Anthropic.RateLimitError || e?.status === 529) return json(503, { code: "ai_busy" }); // 529 = Anthropic overloaded
    console.error("questions failed:", e?.status ?? "", e?.message); // never log the mail or attachment
    return json(502, { code: "generation_failed" });
  }
}
