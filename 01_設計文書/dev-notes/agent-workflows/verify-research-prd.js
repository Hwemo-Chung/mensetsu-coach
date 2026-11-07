// Claude Code Workflow script used during development (multi-agent orchestration). Paths made repo-relative for publication.
export const meta = {
  name: 'verify-research-prd',
  description: 'Adversarially verify and revise RESEARCH-PRD.md across 6 lenses until no blocking findings remain',
  phases: [
    { title: 'Critique', detail: '6 lenses attack the PRD' },
    { title: 'Refute', detail: '3 skeptics per major finding' },
    { title: 'Revise', detail: 'apply surviving findings to the file' },
    { title: 'Completeness', detail: 'what is still missing' },
  ],
}

const PRD = './01_設計文書/RESEARCH-PRD.md'
const CONTEXT = `Context files to read first (read them, do not guess):
- ${PRD} (the document under review)
- ./01_設計文書/PRD-INTERVIEW-COACH.md (product PRD)
- ./01_設計文書/KICKOFF-DAY1.md (contest rules, judging, deadline 11/8)
- ./packs/jp.json (current country pack the research must feed)
- ./lib/coach.js (how the pack is injected into the prompt)
Do NOT read anything under 02_ローカル原本/ (personal data). Do NOT modify any file.`

const FINDINGS = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          severity: { type: 'string', enum: ['blocking', 'major', 'minor'] },
          section: { type: 'string', description: 'PRD section number/heading the finding targets' },
          claim: { type: 'string', description: 'What is wrong or missing, one paragraph' },
          evidence: { type: 'string', description: 'Concrete evidence: quotes from the context files, facts about Japanese hiring, or reasoning. No hand-waving.' },
          proposed_change: { type: 'string', description: 'Exact replacement text or addition for the PRD, in Korean (敬語 not required in spec text)' },
        },
        required: ['title', 'severity', 'section', 'claim', 'evidence', 'proposed_change'],
      },
    },
  },
  required: ['findings'],
}

const VERDICT = {
  type: 'object',
  properties: {
    holds: { type: 'boolean', description: 'true only if the finding is correct AND the proposed change improves the PRD' },
    reason: { type: 'string' },
    amended_change: { type: 'string', description: 'If holds is true but the proposed change needs adjustment, the adjusted change; else empty string' },
  },
  required: ['holds', 'reason', 'amended_change'],
}

const REVISION = {
  type: 'object',
  properties: {
    new_version: { type: 'string' },
    applied: { type: 'array', items: { type: 'string' } },
    skipped: { type: 'array', items: { type: 'string' }, description: 'findings not applied and why' },
  },
  required: ['new_version', 'applied', 'skipped'],
}

const LENSES = [
  { key: 'rules', prompt: `Lens: CONTEST RULES & DATA RIGHTS. You are the hackathon's strictest judge. Attack the PRD's data-rights policy (§3) and sourcing plan: can any planned output violate "no code/data without rights", "only work created during the contest", or the generic-project avoid list? Is "要約のみ、転載禁止" actually enforceable and verifiable by an agent? Are public-institution sources correctly identified (厚労省, JASSO, 出入国在留管理庁, JETRO, ハローワーク — are there others that matter, e.g. 経済産業省, JICA, 文部科学省)? Does the README-disclosure requirement get covered? Find every hole.` },
  { key: 'bias', prompt: `Lens: STEREOTYPING, ETHICS, BIAS. You are a reviewer for a Japanese HR-tech ethics board. The PRD proposes "origin-specific difference rules" for Anglo/Korean/Chinese/SEA/Indian candidates. Attack §2.2, §2.3 and the anti-stereotype rule in §3: is the "2 independent sources or 1 public source" bar sufficient? Can "慣行単位" phrasing still produce harmful generalizations? Is grouping Vietnam/Philippines/Indonesia as one axis defensible? Would a Japanese company or the candidate find any planned rule offensive or legally risky (差別的取扱い)? Propose concrete guardrails and wording changes.` },
  { key: 'product', prompt: `Lens: PRODUCT FIT & SCHEMA. You are the engineer who must consume this data in lib/coach.js and packs/jp.json. Attack §4.1: does the schema actually fit how buildSystemPrompt injects rules (correction_rules shape, pattern/type/replacement/reason/example_before/example_after)? Can topic_rules and origin_notes be injected without a code change, or does the PRD need to specify how? Is "stage" the right discriminator? Is there a selection mechanism (user picks origin? auto-detect from resume?) — the PRD is silent; is that a gap? Will 20+ rules bloat the prompt and hurt the existing 4文型 coaching? Be concrete about what the PRD must specify.` },
  { key: 'feasibility', prompt: `Lens: SCHEDULE, COST, FEASIBILITY. You are a skeptical project manager. Submission deadline is 11/8 20:00 and Day 1 deliverable (deploy) is not finished. Attack §5, §6, §8: is ~38 Fable agents realistic for web research given site blocking (Japanese job sites, Naver, Reddit)? Are the completion criteria measurable by an agent without a human? "10 sourced claims per doc" — is that the right bar, or does it reward padding? Is the 1-extra-round cap sound? What should be cut, deferred to after 11/8, or reordered so that the hackathon is never at risk? Give a cut-list.` },
  { key: 'domain', prompt: `Lens: JAPANESE HIRING DOMAIN ACCURACY. You are a veteran Japanese recruiter (人材紹介, 外国人採用 specialist). Attack the taxonomy in §2.1 and §2.2 for factual accuracy and completeness: missing stages or concepts (e.g. 既卒/第二新卒, リファラル, 内定者フォロー, 在留資格「技術・人文知識・国際業務」 requirements and 学歴 matching, 特定技能 vs 技人国 vs 高度専門職, 職務経歴書 norms differing by industry, カジュアル面談, リファレンスチェック, 入社後の試用期間), wrong exclusions, wrong assumptions about which origin differences actually matter in practice. Which cells of the 4×5 matrix are high-value and which are noise? Be specific.` },
  { key: 'user', prompt: `Lens: USER VALUE & BUSINESS. You are the target persona (a Korean mid-career engineer interviewing in Japan via an agent) AND a B2B buyer (a 人材紹介 agency placing foreigners). Attack the PRD from "so what": which of these research outputs would change what the coach says to me tomorrow? Which would an agency pay for? What is missing that I actually struggle with (e.g. 年収交渉 wording, 退職交渉, 内定承諾の返事メール, 逆質問 for the agent vs for the company)? Does the PRD over-invest in 新卒 (T1) when the product persona is mid-career? Rank the 9 research units by value and propose reprioritization.` },
]

function criticPrompt(lens, round, history) {
  return `${CONTEXT}

${lens.prompt}

Round ${round}. ${history ? `Findings already applied in earlier rounds (do not repeat them; look for NEW problems or problems the revision introduced):\n${history}` : ''}

Return up to 8 findings, most severe first. severity: blocking = the research would produce unusable/unsafe/rule-violating output or endanger the 11/8 deadline; major = materially worse output; minor = polish. Every finding needs concrete evidence and an exact proposed change. If the section is sound, say so by returning fewer findings — do not pad.`
}

function refuterPrompt(f, lensKey, angle) {
  return `${CONTEXT}

A reviewer (lens: ${lensKey}) made this finding against the PRD:
- Title: ${f.title}
- Severity claimed: ${f.severity}
- Section: ${f.section}
- Claim: ${f.claim}
- Evidence: ${f.evidence}
- Proposed change: ${f.proposed_change}

Your job: try to REFUTE it from the angle "${angle}". Check the evidence against the actual files. A finding fails if: the claim is factually wrong, the PRD already covers it, the proposed change would make the PRD worse or conflict with contest rules/deadline, or the severity is inflated by two levels. Default to holds=false if you are uncertain. If it holds but the change wording needs fixing, set holds=true and give amended_change.`
}

const REFUTE_ANGLES = ['is the evidence actually in the files / factually true', 'does the proposed change conflict with the deadline, contest rules, or the product PRD', 'is this already covered or is the severity inflated']

let history = ''
let applied = []
for (let round = 1; round <= 3; round++) {
  log(`Round ${round}: critiquing PRD from ${LENSES.length} lenses`)
  const survivors = (await pipeline(
    LENSES,
    lens => agent(criticPrompt(lens, round, history), { label: `critic:${lens.key}:r${round}`, phase: 'Critique', schema: FINDINGS, effort: 'high' }),
    (res, lens) => {
      if (!res) return []
      const serious = res.findings.filter(f => f.severity !== 'minor')
      const minor = res.findings.filter(f => f.severity === 'minor').map(f => ({ ...f, lens: lens.key, votes: 'minor-unverified' }))
      return parallel(serious.map(f => () =>
        parallel(REFUTE_ANGLES.map((angle, i) => () =>
          agent(refuterPrompt(f, lens.key, angle), { label: `refute:${lens.key}:${i}`, phase: 'Refute', schema: VERDICT, effort: 'high' })))
          .then(vs => {
            const valid = vs.filter(Boolean)
            const yes = valid.filter(v => v.holds)
            const holds = valid.length > 0 && yes.length >= 2
            const change = (yes.find(v => v.amended_change && v.amended_change.trim()) || {}).amended_change || f.proposed_change
            return { ...f, lens: lens.key, holds, votes: `${yes.length}/${valid.length}`, final_change: change, refuter_reasons: valid.map(v => v.reason) }
          })
      )).then(judged => [...judged.filter(Boolean), ...minor])
    },
  )).flat()

  const confirmed = survivors.filter(f => f.holds)
  const minors = survivors.filter(f => f.votes === 'minor-unverified')
  const rejected = survivors.filter(f => f.holds === false)
  log(`Round ${round}: ${confirmed.length} confirmed (${confirmed.filter(f => f.severity === 'blocking').length} blocking), ${rejected.length} refuted, ${minors.length} minor unverified`)

  if (confirmed.length === 0 && minors.length === 0) { log('No findings survived — PRD stable'); break }

  const rev = await agent(`You are the PRD editor. Read ${PRD} and apply the confirmed findings below by editing the file IN PLACE with the Edit tool (keep Korean, keep structure, bump the version line at top to v0.${round + 1} and add a one-line changelog entry under the version line). Apply all CONFIRMED findings. Apply MINOR findings only if they are clearly correct and cheap; otherwise skip and say why. Never remove the data-rights policy or the "11/8 deadline not at risk" criterion — strengthen them if a finding asks. Keep the document under ~250 lines; merge, don't bloat.

CONFIRMED (verified by 2+/3 skeptics):
${JSON.stringify(confirmed.map(f => ({ lens: f.lens, severity: f.severity, section: f.section, title: f.title, claim: f.claim, change: f.final_change, skeptic_notes: f.refuter_reasons })), null, 2)}

MINOR (unverified):
${JSON.stringify(minors.map(f => ({ lens: f.lens, section: f.section, title: f.title, change: f.proposed_change })), null, 2)}

REFUTED (for your awareness only — do NOT apply; but if the refuters' reasons reveal a genuine ambiguity in the PRD, you may clarify wording):
${JSON.stringify(rejected.map(f => ({ title: f.title, votes: f.votes, reasons: f.refuter_reasons })), null, 2)}

Context files you may read: the product PRD, KICKOFF-DAY1.md, packs/jp.json, lib/coach.js. Do not touch any other file.`, { label: `revise:r${round}`, phase: 'Revise', schema: REVISION, effort: 'xhigh' })

  if (!rev) { log('Reviser failed; stopping'); break }
  applied.push(...rev.applied.map(a => `[r${round}] ${a}`))
  history = applied.join('\n')
  log(`Round ${round}: applied ${rev.applied.length}, skipped ${rev.skipped.length} → ${rev.new_version}`)

  const blockingLeft = confirmed.filter(f => f.severity === 'blocking').length
  if (blockingLeft === 0 && round >= 2) { log('No blocking findings in this round — stopping'); break }
}

phase('Completeness')
const gaps = await agent(`${CONTEXT}

The PRD has been through adversarial revision. Changes applied so far:
${history || '(none)'}

Act as the completeness critic: what is STILL missing or unverifiable? Check specifically: (1) every completion criterion in §5 can be checked by an agent or a script without a human; (2) the schema in §4.1 is consistent with the rest of the document; (3) every research unit in §2 has a clear question, a source strategy, and an owner stage in §6; (4) nothing in the PRD requires editing product code before 11/8; (5) data-rights and anti-stereotype rules are enforceable at the verification stage. Return findings only for real gaps; empty list if none.`, { label: 'completeness', phase: 'Completeness', schema: FINDINGS, effort: 'xhigh' })

return { applied, remaining_gaps: gaps ? gaps.findings : [] }
