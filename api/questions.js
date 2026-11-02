import Anthropic from "@anthropic-ai/sdk";
import { loadPack, generateQuestions } from "../lib/coach.js";
import { toContentBlocks, AttachmentError } from "../lib/attachment.js";
import { checkAccess, rateLimit } from "../lib/guard.js";

const MAX_MAIL_CHARS = 8000;
const json = (status, body) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

let client;

// Vercel web-standard handler; dev.js calls the same function locally.
export async function POST(request) {
  if (!checkAccess(request.headers.get("x-access-code"))) return json(401, { error: "접근 코드가 맞지 않습니다." });
  const ip = (request.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
  if (!rateLimit(ip)) return json(429, { error: "요청이 너무 많습니다. 10분 뒤에 다시 시도해 주세요." });

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "요청 형식이 올바르지 않습니다." });
  }
  const mail = typeof body?.mail === "string" ? body.mail.trim() : "";
  if (!mail) return json(400, { error: "구인 정보나 메일 내용을 붙여넣어 주세요." });
  if (mail.length > MAX_MAIL_CHARS) return json(400, { error: `메일은 ${MAX_MAIL_CHARS}자 이하로 붙여넣어 주세요.` });

  try {
    const blocks = await toContentBlocks(body.attachment);
    client ??= new Anthropic();
    return json(200, await generateQuestions(client, loadPack("jp"), mail, blocks));
  } catch (e) {
    if (e instanceof AttachmentError) return json(400, { error: e.message });
    if (e instanceof Anthropic.RateLimitError) return json(503, { error: "AI 서버가 혼잡합니다. 잠시 뒤 다시 시도해 주세요." });
    console.error("questions failed:", e?.status ?? "", e?.message); // never log the mail or attachment
    return json(502, { error: "질문을 만들지 못했습니다. 다시 시도해 주세요." });
  }
}
