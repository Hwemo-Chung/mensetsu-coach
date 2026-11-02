import { readFileSync } from "node:fs";

// Stands in for the Anthropic client: tests and the local UI (MOCK_CLAUDE=1) run without network or tokens.
const load = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
export const fixture = load("questions.json");
export const scriptFixture = load("script.json");
export const reviewFixture = load("review.json");

// responses: one result per call, in order (for retry tests); otherwise every call returns `result`.
export function fakeClient({ result = fixture, responses, stop = "end_turn", fail } = {}) {
  let calls = 0;
  const finalMessage = async () => {
    if (fail) throw fail;
    const r = responses ? responses[calls] : result;
    calls++;
    return { stop_reason: stop, content: [{ type: "text", text: typeof r === "string" ? r : JSON.stringify(r) }] };
  };
  const requests = [];
  return { beta: { messages: { stream: (req) => (requests.push(req), { finalMessage }) } }, calls: () => calls, requests };
}
