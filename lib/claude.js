// Model ids and the one Claude call (streamed, structured JSON output).

// Question generation = Sonnet 5.5 (user decision 11/02: extract Haiku / generate Sonnet / grade Opus).
// research = Haiku for cost (spec guardrail 6); web_search_20250305 with JSON output checked by real calls 11/04.
export const MODELS = { questions: "claude-sonnet-5-5", script: "claude-sonnet-5-5", reverse: "claude-sonnet-5-5", review: "claude-opus-5-5", research: "claude-haiku-5-5", fit: "claude-sonnet-5-5" };

// The call without the parse: the research loop needs the blocks and usage too.
export async function ask(client, request, options) {
  const t0 = Date.now();
  const msg = await client.beta.messages.stream(request, options).finalMessage();
  // Cost/latency line for Vercel logs. Token counts only — never the content.
  if (msg.usage) console.log(JSON.stringify({ event: "claude_call", model: msg.model ?? request.model, in: msg.usage.input_tokens, out: msg.usage.output_tokens, ms: Date.now() - t0, stop: msg.stop_reason }));
  if (msg.stop_reason === "refusal") throw new Error("refusal");
  if (msg.stop_reason === "max_tokens") throw new Error("truncated");
  return msg;
}

export function parseJson(content) {
  const text = content.filter((b) => b.type === "text").map((b) => b.text).join("");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("bad_json"); // the SyntaxError message quotes the reply, and handlers log e.message
  }
}

export const askJson = async (client, request) => parseJson((await ask(client, request)).content);
