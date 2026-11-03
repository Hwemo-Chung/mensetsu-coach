import { readFileSync } from "node:fs";

// Stands in for the Anthropic client: tests and the local UI (MOCK_CLAUDE=1) run without network or tokens.
const load = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
export const fixture = load("questions.json");
export const scriptFixture = load("script.json");
export const reviewFixture = load("review.json");
export const reverseFixture = load("reverse.json");
// The model writes the jp reading in hiragana (lib/kana.js converts it); script.json holds the converted API output.
export const scriptKana = "はい、 /みつもりが 《ずれた》 ばあいわ、 /まず えいきょうはんいを かくにんし↘、 /かんけいしゃに はやめに きょうゆうします↘。 /ぜんしょくでわ、 /おくれを ［期限］ いないに ほうこくする るーるを つくり、 /てもどりを ［ここに実績の数字］ へらしました↘。 /すすめかたに ついて、 /おんしゃの やりかたも ぜひ うかがえますでしょうか↗。";
// The model answers the script under the target language code (ja/ko) as one string per step (C3); generateScript joins
// them into `text`. Fixtures keep `text`: it goes whole into ketsuron (the join gives it back unchanged), so the fixture is
// not gate-clean (C5) and MOCK makes a 2nd fake call per script — free, and the fixture stays tied to scriptKana/stt-read.
// The fixture's Hangul reading goes back to the hiragana the model would send (keeps MOCK_CLAUDE=1 in dev.js working).
export const asModelScript = ({ text, parts, issues, closing, ...rest }, key = "ja") => ({ [key]: { fukusho: "", ketsuron: text, kijun: "", sentakushi: "" }, ...rest, ...(rest.reading === scriptFixture.reading && { reading: scriptKana }) });

// responses: one result per call, in order (for retry tests); otherwise every call returns `result`.
// stops: one stop_reason per call (C2 truncation retry); otherwise every call ends with `stop`.
export function fakeClient({ result = fixture, responses, stop = "end_turn", stops, fail } = {}) {
  let calls = 0;
  const finalMessage = async () => {
    if (fail) throw fail;
    const r = responses ? responses[Math.min(calls, responses.length - 1)] : result; // exhausted → repeat the last
    calls++;
    return { stop_reason: stops?.[calls - 1] ?? stop, content: [{ type: "text", text: typeof r === "string" ? r : JSON.stringify(r) }] };
  };
  const requests = [];
  return { beta: { messages: { stream: (req) => (requests.push(req), { finalMessage }) } }, calls: () => calls, requests };
}
