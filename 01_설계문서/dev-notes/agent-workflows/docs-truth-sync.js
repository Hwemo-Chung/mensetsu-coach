// Claude Code Workflow script used during development (multi-agent orchestration). Paths made repo-relative for publication.
export const meta = {
  name: 'docs-truth-sync',
  description: 'Find stale/false statements in project docs vs current code, verify with two skeptics, fix only confirmed items',
  phases: [
    { title: 'Find', detail: 'one finder per doc' },
    { title: 'Verify', detail: 'two skeptics per doc (code lens, UI/copy lens)' },
    { title: 'Fix', detail: 'one fixer per doc, confirmed items only' },
    { title: 'Critic', detail: 'review all doc diffs for introduced errors' },
  ],
}

const ROOT = '.'
const PRIV = '../BuiltWithClaude-2026-private/internal-docs'
const COMMON = `Project root: ${ROOT}. Truth = the CURRENT code and data in that repo (lib/, api/, public/ incl. public/i18n/*.js labels, packs/, scripts/, test/, vercel.json, package.json) and git HEAD. Production equals git HEAD ea4c03a plus uncommitted local changes. Never invent facts; every claim you make must cite a file:line or a command you ran (offline only: never call Claude/Gemini APIs, never request the production URL, never run ~/.local/bin/omo).
Off limits for you: do not edit anything under lib/, api/, public/, test/, scripts/, packs/ (another engineer is fixing code there right now). Treat these specific topics as IN FLUX and do not report or change statements about them: the number-grounding gate (groundedNumbers), input masking (maskInput), the Japanese language gate (isJapanese), access-code rate limiting order and limits, closing_rules regexes, the kr pack name, the DOCX zip check.
History is not drift: do not rewrite DEVLOG, anything under archive/ or research/, or existing rows of the PRD §16 decision log (append-only). Dated status lines that are clearly marked as past ("11/02 기준") are fine unless they claim to be current.`

const DOCS = [
  { key: 'readme', path: `${ROOT}/README.md`, focus: 'Public README read by Japanese judges. Check the 試し方 steps against the real UI labels (e.g. the demo/tour button label in public/i18n/ja.js, how many tour steps, where to find a sample, which screen language shows readings/translation per lib/lang.js), the Claude usage section, evaluation table caveats (dates, what was measured before 11/03 changes such as C5 retries), privacy section, file map, roadmap and any "current status" dates. Suggest adding a line that Korean/English screens show readings and translations (verify in code), and replacing a link to a Korean-named folder with the example text inline if the link is in the Japanese judge path.' },
  { key: 'claudemd', path: `${ROOT}/CLAUDE.md`, focus: 'Project instructions for coding agents. Check the Commands and Code map sections against the real files (ls lib/ public/ scripts/ api/), scripts in package.json (test, test:ui, test:live, eval), env vars actually read (e.g. STT_ENABLED, GEMINI_API_KEY), model assignments in lib/claude.js, stage flow in public/app.js, deadline lines. Keep it concise; fix wrong or missing facts only.' },
  { key: 'prd', path: `${ROOT}/01_설계문서/PRD-INTERVIEW-COACH.md`, focus: 'PRD (source of truth for scope). Check §0 implementation status and the feature table rows (F1..F14, voice V1..V4, tutorial, rubric, consistency C1..C6) against code: what is implemented, hidden (STT_ENABLED), changed (tour 9 steps, closing types, plain 日本語, destination labels). Check numeric specs that code contradicts (e.g. reverse question length limit in lib/reverse.js vs the PRD text). Never edit existing §16 rows; you may append a dated note under a section saying what changed.' },
  { key: 'uiux', path: `${ROOT}/01_설계문서/UIUX-SPEC.md`, focus: 'UI/UX spec. Check every statement presented as the CURRENT UI against public/index.html, public/style.css, public/*.js and i18n labels: header controls, composer (input width %, send 112x56 desktop / 88 mobile, right aligned), select chevrons, panel tabs and the 🔊 on the panel script copy, tour (9 steps, page-wide dimmer #tourDim, button label), 🎤 visibility (STT_ENABLED), loader dots + label after 3 s, rubric display (復唱 tip, 締め with closing label). Old mockups that are explicitly superseded may stay if marked; add a short "현재 구현(11/03)" note where the doc would mislead.' },
  { key: 'demoscript', path: `${PRIV}/DEMO-SCRIPT.md`, focus: 'Private 3-minute demo video script (Japanese narration + Korean gloss) and production notes. Compare with scripts/record-video.mjs (its CAPTIONS, scene order, caption pixel sizes 30px/18px CSS at deviceScaleFactor 1.5 = 45/27 px in video, which the user approved in a storyboard) and with public/demo/demo-ja.json + current closingOf. Flag captions/narration that state something the recorded data or code contradicts (e.g. a claim that every generated question uses words from the mail — check specificity.referenced and refs in demo-ja.json; "ない数字は作らない" vs what the script invents; 「24時間、何度でも」 vs per-IP rate limits in lib/guard.js and api/*.js). Japanese wording issues count only if clearly wrong. Note: section ③ is now one continuous take with scroll+pause+caption, no cuts; the user forbade references to the September videos.' },
]

const FIND = { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: {
  line: { type: 'number' }, quote: { type: 'string' }, problem: { type: 'string' }, truth: { type: 'string' }, evidence: { type: 'string' }, kind: { type: 'string', enum: ['stale', 'false', 'missing'] } },
  required: ['line', 'quote', 'problem', 'truth', 'evidence', 'kind'] } } }, required: ['items'] }
const VERDICT = { type: 'object', properties: { verdicts: { type: 'array', items: { type: 'object', properties: {
  index: { type: 'number' }, real: { type: 'boolean' }, reason: { type: 'string' } }, required: ['index', 'real', 'reason'] } } }, required: ['verdicts'] }
const FIXED = { type: 'object', properties: { changed: { type: 'array', items: { type: 'object', properties: { line: { type: 'number' }, before: { type: 'string' }, after: { type: 'string' } }, required: ['line', 'before', 'after'] } }, skipped: { type: 'array', items: { type: 'string' } } }, required: ['changed', 'skipped'] }

const results = await pipeline(DOCS,
  (d) => agent(`${COMMON}\n\nTask: read ${d.path} and list every statement that is stale, false, or missing versus the current code. ${d.focus}\nReturn only real drift with evidence; an empty list is fine.`, { label: `find:${d.key}`, phase: 'Find', schema: FIND }),
  async (found, d) => {
    const items = (found && found.items) || []
    if (!items.length) return { d, items: [], kept: [] }
    const list = items.map((x, i) => `#${i} line ${x.line}: "${x.quote}" — claimed problem: ${x.problem} — claimed truth: ${x.truth} — evidence: ${x.evidence}`).join('\n')
    const lenses = [
      'CODE lens: open the cited code/files yourself and decide if the doc statement is really wrong or stale today.',
      'USER lens: think as a judge or user reading the doc against the actual UI labels (public/i18n/*.js), file names and data; decide if the doc would mislead today.',
    ]
    const votes = await parallel(lenses.map((lens) => () => agent(`${COMMON}\n\nYou are a skeptic. Try to REFUTE each claimed doc problem below for ${d.path}. ${lens} Default to real=false when the evidence does not hold up, when the doc is actually correct, when it is history, or when it touches the IN FLUX topics.\n${list}`, { label: `verify:${d.key}`, phase: 'Verify', schema: VERDICT })))
    const ok = (v, i) => v && v.verdicts.some((x) => x.index === i && x.real)
    const kept = items.filter((_, i) => votes.every((v) => ok(v, i)))
    log(`${d.key}: ${items.length} found, ${kept.length} confirmed by both skeptics`)
    return { d, items, kept }
  },
  async (r) => {
    if (!r.kept.length) return { key: r.d.key, path: r.d.path, changed: [], skipped: [], found: r.items.length, confirmed: 0 }
    const list = r.kept.map((x) => `line ${x.line}: "${x.quote}" → ${x.truth} (evidence: ${x.evidence})`).join('\n')
    const fixed = await agent(`${COMMON}\n\nEdit ONLY ${r.d.path}. Apply exactly these confirmed corrections, nothing else; keep the document's language (Japanese/Korean as written), structure and tone; make the smallest wording change that makes each statement true; do not add claims you cannot back with code. Report each change.\n${list}`, { label: `fix:${r.d.key}`, phase: 'Fix', schema: FIXED })
    return { key: r.d.key, path: r.d.path, ...(fixed || { changed: [], skipped: ['fixer failed'] }), found: r.items.length, confirmed: r.kept.length }
  })

phase('Critic')
const summary = results.filter(Boolean).map((r) => `${r.key}: found ${r.found}, confirmed ${r.confirmed}, changed ${r.changed.length}`).join('\n')
const critic = await agent(`${COMMON}\n\nRun \`git -C ${ROOT} diff -- README.md CLAUDE.md 01_설계문서/PRD-INTERVIEW-COACH.md 01_설계문서/UIUX-SPEC.md\` and read ${PRIV}/DEMO-SCRIPT.md. Doc edits just made:\n${summary}\nCheck every changed line against the code: did any edit introduce a new false statement, delete history, or break the document? Do not edit; list problems with file:line and the correct text, or say none.`, { label: 'critic', phase: 'Critic' })
return { results, critic }