import { checkAccess, rateLimit } from "../lib/guard.js";

const json = (status, body) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

// Checks the access code before the chat moves on. Calls no AI.
export async function POST(request) {
  const ip = (request.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
  if (!rateLimit(ip)) return json(429, { error: "요청이 너무 많습니다. 10분 뒤에 다시 시도해 주세요." });
  if (!checkAccess(request.headers.get("x-access-code"))) return json(401, { error: "접근 코드가 맞지 않습니다." });
  return json(200, { ok: true });
}
