import Anthropic from "@anthropic-ai/sdk";
import { EXPLAIN_LANGS } from "../lib/lang.js";
import { redact } from "../lib/privacy.js";
import { checkAccess, rateLimit } from "../lib/guard.js";
import { researchEnabled, runResearch, today } from "../lib/research.js";

const MAX_NAME_CHARS = 100; // a name, not a pasted mail: this cap is part of what keeps candidate text out of the search
const DEADLINE_MS = 105_000; // under maxDuration 120, so a slow run still answers "unavailable" instead of a platform 504
const json = (status, body) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
// さん stays: it can be part of a name, and a search still finds it, whereas dropping it would search a name nobody confirmed.
const name = (v) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().replace(/\s*(?:様|殿|御中|님)$/, "") : "");
// A masked name is not what the user confirmed, so it is refused, not searched. F1 reads masked mail, so a placeholder can arrive as a "name".
const hasContact = (n) => redact(n) !== n || /\[(?:email|phone|〒|氏名)\]/.test(n);
const leavesTag = (n) => /[<>\p{Cc}]/u.test(n);

let client;

// Stage R search. Same gate order as the other APIs. Only the two confirmed names are read from the body.
export async function POST(request, deps = {}) {
  const ip = (request.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
  if (!rateLimit(`research:${ip}`, { limit: 5 })) return json(429, { code: "rate_limited" });
  if (!checkAccess(request.headers.get("x-access-code"))) return json(401, { code: "access_denied" });
  if (!(deps.enabled ?? researchEnabled())) return json(503, { code: "research_unavailable" });

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { code: "bad_request" });
  }
  const lang = body?.lang ?? "ko";
  if (!Object.hasOwn(EXPLAIN_LANGS, lang)) return json(400, { code: "lang_unsupported" });
  const company = name(body?.company);
  const position = name(body?.position);
  if (!company || !position) return json(400, { code: "name_required" });
  if (company.length > MAX_NAME_CHARS || position.length > MAX_NAME_CHARS) return json(400, { code: "name_too_long", max: MAX_NAME_CHARS });
  if (hasContact(company) || hasContact(position)) return json(400, { code: "name_required" });
  if (leavesTag(company) || leavesTag(position)) return json(400, { code: "name_invalid" });

  const date = today();
  try {
    const c = deps.client ?? (client ??= new Anthropic({ maxRetries: 1 }));
    return json(200, await runResearch(c, company, position, lang, { date, signal: AbortSignal.timeout(deps.deadlineMs ?? DEADLINE_MS) }));
  } catch (e) {
    console.error("research failed:", e?.status ?? "", e?.message); // never log the names
    return json(200, { research_status: "unavailable", research_date: date }); // the first questions stay on screen
  }
}
