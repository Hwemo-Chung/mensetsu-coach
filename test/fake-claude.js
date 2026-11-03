import { readFileSync } from "node:fs";

// Stands in for the Anthropic client: tests and the local UI (MOCK_CLAUDE=1) run without network or tokens.
const load = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
export const fixture = load("questions.json");
export const scriptFixture = load("script.json");
export const reviewFixture = load("review.json");
export const reverseFixture = load("reverse.json");
// The model writes the jp reading in hiragana (lib/kana.js converts it); script.json holds the converted API output.
export const scriptKana = "はい、 /みつもりが 《ずれた》 ばあいわ、 /まず えいきょうはんいを かくにんし↘、 /かんけいしゃに はやめに きょうゆうします↘。 /ぜんしょくでわ、 /おくれを ［期限］ いないに ほうこくする るーるを つくり、 /てもどりを ［ここに実績の数字］ へらしました↘。 /すすめかたに ついて、 /おんしゃの やりかたも ぜひ うかがえますでしょうか↗。";
// The model answers the script under the target language code (ja/ko); generateScript maps it to `text`.
// The fixture's Hangul reading goes back to the hiragana the model would send (keeps MOCK_CLAUDE=1 in dev.js working).
export const asModelScript = ({ text, ...rest }, key = "ja") => ({ [key]: text, ...rest, ...(rest.reading === scriptFixture.reading && { reading: scriptKana }) });

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
