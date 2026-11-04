// Claude Code Workflow script used during development (multi-agent orchestration). Paths made repo-relative for publication.
export const meta = {
  name: 'eval-adversarial-gold',
  description: 'Adversarial F3 golden items without surface markers (beats regex), then an independent refuter removes ambiguous labels. Writes test/eval/gold-adv.json.',
  phases: [{ title: 'Generate', detail: '2 shards' }, { title: 'Check', detail: 'refuter per shard' }],
}
const PACK = './packs/jp.json'
const RULES = 'Synthetic only: fictional companies with （仮）, no real names/emails/phones/URLs. Write ONLY the file named. Do not run omo or touch X/Twitter.'
const G = { type: 'object', properties: { path: { type: 'string' }, count: { type: 'integer' } }, required: ['path', 'count'] }
const C = { type: 'object', properties: { bad_ids: { type: 'array', items: { type: 'string' } }, reasons: { type: 'array', items: { type: 'string' } }, fixed_path: { type: 'string' } }, required: ['bad_ids', 'reasons', 'fixed_path'] }
const shards = [
  { key: 'adv1', qs: '前職で最も大変だったことは何ですか。 / 見積もりがずれたとき、どのように判断しますか。 / 当社を志望した理由は何ですか。' },
  { key: 'adv2', qs: 'チームで意見が対立したとき、どう対応しましたか。 / 入社後、最初の半年で何に取り組みたいですか。 / あなたの強みと弱みを教えてください。' },
]
const out = await pipeline(shards,
  (s) => agent(`Read ${PACK} (answer_structure: 復唱/結論/基準・数字/選択肢). Write ./test/eval/${s.key}.raw.json — {"items":[...]} with 10 ADVERSARIAL answers for these questions: ${s.qs}.
Goal: defeat a naive regex grader (復唱 = first sentence ends with 「ですね」; 基準 = contains 基準 or a digit; 選択肢 = last sentence ends with でしょうか/ますか). Mix these patterns, labels BY CONSTRUCTION:
 a) 復唱 present WITHOUT 「ですね」 (e.g. 「〜についてお答えします」「〜というご質問ですが」); b) 「ですね」 used at the start but NOT restating the question (e.g. 「そうですね、」 filler) → fukusho false;
 c) a number present that is NOT a criterion/evidence (dates, team size in passing) and no real criterion → kijun false; d) a criterion stated in words without the word 基準 or digits (「判断の軸は残りの費用対効果です」) → kijun true;
 e) final sentence ends in ますか but is a rhetorical/self question, not handing options to the interviewer → sentakushi false; f) options handed back as a statement (「AとBの二案をご提示できます。」) → sentakushi true;
 g) answers that share many keywords with the question but answer a different question → answers_question "no" (omit steps).
Item: {"id":"${s.key}-<n>","pattern":"a..g","question":..,"answer":..,"answers_question":"yes"|"no","steps":{...4 booleans}} (omit steps when "no"). ${RULES}
Write the file, return {path,count}.`, { label: `gen:${s.key}`, phase: 'Generate', schema: G, model: 'sonnet', effort: 'high' }),
  (g, s) => (g ? agent(`Adversarial label checker. Read ${g.path} and ${PACK}. For each item decide answers_question and each step from the answer text alone, by the pack definitions (復唱 = restates the asked question; 結論 = the answer is stated up front; 基準・数字 = one criterion or number used as evidence; 選択肢 = hands options/a decision back to the interviewer). Flag items whose stored label is wrong or where a careful grader could reasonably disagree. Write a cleaned copy without flagged items to ./test/eval/${s.key}.json. Default to flagging when uncertain. ${RULES}`, { label: `check:${s.key}`, phase: 'Check', schema: C, effort: 'high' }).then((c) => ({ key: s.key, generated: g.count, removed: c.bad_ids.length, file: c.fixed_path, reasons: c.reasons.slice(0, 4) })) : null))
return out.filter(Boolean)
