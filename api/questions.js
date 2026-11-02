import Anthropic from "@anthropic-ai/sdk";
import { loadPack, generateQuestions } from "../lib/coach.js";
import { toContentBlocks, AttachmentError } from "../lib/attachment.js";
import { checkAccess, rateLimit } from "../lib/guard.js";

const MAX_MAIL_CHARS = 8000;
const json = (status, body) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

let client;

// Vercel web-standard handler; dev.js calls the same function locally.
export async function POST(request, deps = {}) {
  if (!checkAccess(request.headers.get("x-access-code"))) return json(401, { code: "access_denied" });
  const ip = (request.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
  if (!rateLimit(ip)) return json(429, { code: "rate_limited" });

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { code: "bad_request" });
  }
  const mail = typeof body?.mail === "string" ? body.mail.trim() : "";
  if (!mail) return json(400, { code: "mail_required" });
  if (mail.length > MAX_MAIL_CHARS) return json(400, { code: "mail_too_long", max: MAX_MAIL_CHARS });

  try {
    const blocks = await toContentBlocks(body.attachment);
    const c = deps.client ?? (client ??= new Anthropic());
    return json(200, await generateQuestions(c, loadPack("jp"), mail, blocks));
  } catch (e) {
    if (e instanceof AttachmentError) return json(400, { code: e.code, ...e.extra });
    if (e instanceof Anthropic.RateLimitError) return json(503, { code: "ai_busy" });
    console.error("questions failed:", e?.status ?? "", e?.message); // never log the mail or attachment
    return json(502, { code: "generation_failed" });
  }
}
