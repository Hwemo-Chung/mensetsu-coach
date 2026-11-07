// Claude Code Workflow script used during development (multi-agent orchestration, run 2026-11-07). Paths made repo-relative for publication.
// 公開用の伏せ字版: ローカルの絶対パスを相対パスに、非公開資料の場所を <PRIVATE_DIR> に、作業用の一時フォルダ（セッション ID を含む）を <SCRATCH_DIR> に置き換えました。個人の近況に関する規則の文言は一般化しています。
export const meta = {
  name: 'crosscheck-video-script',
  description: 'Cross-check the v8 demo narration: facts vs code, publishing/contest rules + feature coverage, VOICEVOX readings',
  phases: [{ title: 'Check' }],
}
const OUT = {
  type: 'object',
  properties: {
    findings: { type: 'array', items: { type: 'object', properties: {
      line_key: { type: 'string' }, line_text: { type: 'string' }, severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
      problem: { type: 'string' }, evidence: { type: 'string' }, suggested_text: { type: 'string' } },
      required: ['line_key', 'line_text', 'severity', 'problem', 'evidence', 'suggested_text'] } },
    summary: { type: 'string' },
  },
  required: ['findings', 'summary'],
}
const COMMON = `Project: the repository root (hackathon entry "面接コーチ", a Japanese job-interview coach). The 3-minute demo video's narration is Japanese, spoken by VOICEVOX. Every narration line lives in code: run \`node scripts/build-video.mjs --lines\` (29 lines outside the take, keys like intro1, limit, mail) and \`node scripts/record-video.mjs --lines\` (lines spoken during the live take) from the repo root; the scene table is <PRIVATE_DIR>/04-video/v8-2026-11-06/storyboard.md (292 lines; read in chunks) and the on-screen panel texts are in scripts/build-video.mjs and scripts/record-video.mjs. Do NOT edit any file, do not commit, do not call paid APIs. Report only concrete problems with evidence (file:line or command output); for each, propose replacement text of similar or shorter length (Japanese, natural, plain). Return an empty findings list if none.`
const LENSES = [
  { key: 'facts', prompt: `${COMMON}\nYour lens: FACTUAL ACCURACY of every narration line and on-screen panel/caption claim against the current code and docs (README.md, 01_設計文書/PRD-INTERVIEW-COACH.md, packs/jp.json, lib/, public/, api/). Examples to verify: numbers (10 questions, 6 stages, '口ぐせは2回で警告', '約47万人' vs README line 15 '468,068人'), model names per task (lib/claude.js MODELS: questions/script/reverse/fit/digest = Sonnet, review = Opus, research = Haiku), 'コードは不要。1日の上限で案内が出て、審査用コードで外れます' (lib/guard.js gate, OPEN_ACCESS), the new mail line ('登録すると、練習のまとめと次のメールの見本が、すぐに届きます' — api/subscribe.js, lib/digest.js), calendar, practice log, F15 script check, prep document claims ('最初に、必ず確認、と出ます' etc.), tour zero calls, mobile, kr beta, Claude Code usage claims (skills count, subagents, pre-push scan: check .claude/skills and README). Flag anything the code does not do or says differently.` },
  { key: 'rules', prompt: `${COMMON}\nYour lens: RULES and COVERAGE. (1) Private publishing rules <PRIVATE_DIR>/00-current/PUBLISH-RULES.md and the video section of <PRIVATE_DIR>/00-current/DECISIONS.md: the author's experience only as past experience marked 以前の, nothing about the author's present personal circumstances, no real names/companies/faces, no NEW accuracy figures, no access code anywhere (end card only repo URL + demo URL + 「審査用コードは提出フォームでお伝えします」), VOICEVOX credit 'VOICEVOX:青山龍星' present, 'real output' labels only on real outputs, fictional data labelled. (2) Contest rules in the project CLAUDE.md. (3) COVERAGE: every feature row of SCORES §1 (<PRIVATE_DIR>/00-current/SCORES.md, section 1) must appear on screen in some scene (storyboard §0 has the mapping table; the mail signup F13 row is NEW and now has a scene '⑩b Mail signup' added to scripts/build-video.mjs before ⑬). List any row with no scene, and any scene whose mapping is stale after these changes: open mode is now implemented (SEL.limit filled), prep stages/calendar/practice selectors now filled.` },
  { key: 'speech', prompt: `${COMMON}\nYour lens: PRONUNCIATION and TIME. A local VOICEVOX engine listens on 127.0.0.1:50021. Run \`node <PRIVATE_DIR>/05-raw/harness-2026-11-06/narration-check.mjs --out <SCRATCH_DIR>/narration-v8h\` (0 tokens) and read its table: each line's kana reading and seconds at the build tempo, and the total. Compare with the previous run <PRIVATE_DIR>/05-raw/harness-2026-11-06/narration-check-v8g.log. Flag misreadings (wrong reading of a kanji, English/product names read oddly — e.g. Claude, Sonnet, Opus, Haiku, Markdown, Google, Gemini — numbers, 在留資格, 面接, 逆質問, 内定, 見本, 台本), unnatural pauses, and any line whose length grew. Report the new total speech seconds and which lines changed since v8g. Propose kana-friendly rewrites only where the reading is wrong.` },
]
phase('Check')
const results = await parallel(LENSES.map((l) => () => agent(l.prompt, { label: `check:${l.key}`, phase: 'Check', schema: OUT })))
return LENSES.map((l, i) => ({ lens: l.key, summary: results[i]?.summary ?? null, findings: results[i]?.findings ?? null }))
