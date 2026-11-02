import { readFileSync } from "node:fs";

// Stands in for the Anthropic client: tests and the local UI (MOCK_CLAUDE=1) run without network or tokens.
export const fixture = JSON.parse(readFileSync(new URL("./fixtures/questions.json", import.meta.url), "utf8"));

export function fakeClient({ result = fixture, stop = "end_turn", fail } = {}) {
  const text = typeof result === "string" ? result : JSON.stringify(result);
  const finalMessage = async () => {
    if (fail) throw fail;
    return { stop_reason: stop, content: [{ type: "text", text }] };
  };
  return { beta: { messages: { stream: () => ({ finalMessage }) } } };
}
