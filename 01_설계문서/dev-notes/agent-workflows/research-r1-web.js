// Claude Code Workflow script used during development (multi-agent orchestration). Paths made repo-relative for publication.
export const meta = {
  name: 'research-r1-web',
  description: 'R1 web research (C2, T4, T2b, T5, T2a, SNS patterns) per RESEARCH-PRD v0.2: research → compressed verify, 2 units at a time; then synthesize + completeness critic',
  phases: [
    { title: 'Research', detail: '6 units, exactly 2 concurrent; each writes its own md + claims.json' },
    { title: 'Verify', detail: '1 compressed verifier per unit (rights/PII gate, evidence+fit, stereotype veto); refuter only on blocking' },
    { title: 'Synthesize', detail: 'jp-draft-v2.json, VERIFICATION-LOG, SUMMARY, README-SECTION, validator' },
    { title: 'Completeness', detail: 'critic: gaps, PII, contract violations' },
  ],
}

const RD = './01_설계문서/research'
const PRD = './01_설계문서/RESEARCH-PRD.md'
const PACK = './packs/jp.json'
const RAW = args.rawDir

const HARD = `HARD RULES (violating any of these is a failure):
- NEVER run the \`omo\` command. NEVER pass an x.com or twitter.com URL to any tool (insane-search, WebFetch, curl, anything). X/Twitter is out of scope for you — it froze the machine earlier today.
- Do not create or modify anything under packs/, lib/, api/, public/, test/, package.json, vercel.json. Write only the files named in your task.
- Never copy private-source sentences: no run of ≥20 Japanese/Korean characters or ≥15 English words identical to a private source. Summarize facts; write example sentences yourself.
- No personal names of private individuals, no identifiable personal cases, no handles. Companies only as industry descriptors unless they are public institutions.
- Public source (go.jp, lg.jp, 独立行政法人, laws) counts as kind:"public" ONLY if you opened that site's 利用規約/著作権 page and confirmed PDL1.0, 政府標準利用規約(第2.0版) or CC BY 4.0; record it as terms_url. Otherwise kind:"private". JETRO and ハローワーク求人情報 are not usable.
- Tag every claim with confidence high|medium|low. If you cannot find a source, say "미확인" — never invent sources, numbers or URLs.
- Prefer the insane-search skill for non-X sites when WebFetch is blocked; WebSearch for discovery.`

const UNITS = [
  { key: 'C2', title: '한국어 화자의 일본어 면접 발화 간섭 패턴', scope: 'PRD §2.1 C2 row. Goal: candidate correction_rules (7 fields: id,type,pattern,replacement,reason,example_before,example_after) for spoken interview Japanese by Korean speakers — 한자어 false friend, 조사·어순 직역, 〜させていただく 과잉, 御社/貴社, 身内謙譲, 役職+様, 頑張ります 과잉, 大丈夫です 다의성 etc. Read ' + PACK + ' first and do NOT duplicate its existing correction_rules. Each candidate needs ≥1 source (Japanese-teaching research, 国語/日本語教育 public material, or ≥2 independent private sources). Phrase rules as language-transfer patterns, never as traits of Koreans. Example sentences must be your own.' },
  { key: 'T4', title: '외국인 고유 면접 질문군·逆質問 운용·不適切質問 대응', scope: 'PRD §2.1 T4 row. Extend (do not redo) ' + RD + '/T4-interview.md. Focus: foreigner-specific questions (定着性·帰国予定, なぜ日本か, 日本語 자가평가, 在留資格と期限) with answer structures; 逆質問 rules (conditions→agent, business/org→company, stage differences, NG list); handling questions that fall under 厚生労働省「公正な採用選考の基本」 配慮事項 (redirect to the job without refusing rudely). Anchor on 厚労省 公正な採用選考 pages.' },
  { key: 'T2b', title: 'オファー・退職 단계 (年収·内定·辞退)', scope: 'PRD §2.1 T2b row. Extend ' + RD + '/T2-midcareer.md. Focus: how to answer 希望年収 inside an interview (current salary basis + range + defer details to agent), how to ask an agent to negotiate, 内定 承諾/保留(他社選考中)/辞退 timing and contact order when an agent is involved, 退職交渉→入社日. Separate legal facts (労働基準法, 職業安定法) from customary practice and label which is which.' },
  { key: 'T5', title: '在留資格·就労許可 (転職 시)', scope: 'PRD §2.1 T5 row. Primary sources: 出入国在留管理庁 pages and laws (e-Gov). Cover 技人国 requirements (学歴·業務関連性), 所属機関に関する届出 within 14 days on job change, 就労資格証明書 (what it is, optional), 高度専門職 points overview, statuses without work restriction; and interview stock questions about status/expiry with neutral answer structures. Mark legal duty vs administrative guidance vs custom. Not legal advice.' },
  { key: 'T2a', title: '中途 면접 단계별 평가축과 선고 플로우', scope: 'PRD §2.1 T2a row. Extend ' + RD + '/T2-midcareer.md. Flow 書類→適性検査→カジュアル面談→一次→二次→最終→オファー面談→内定→リファレンスチェック→退職交渉→入社·試用期間; what each stage evaluates; 転職理由 negative→positive framing; スカウト reply structure. Output also a proposed question_taxonomy.stages append list (e.g. カジュアル面談, 二次面接) with evidence.' },
  { key: 'SNS', title: '외국인 일본 면접 실패 사례 패턴 (SNS·커뮤니티, 내부 리서치)', scope: 'Collect real failure reports of foreigners in Japanese job interviews/hiring (Reddit r/movingtojapan r/japanlife r/japan_career, Naver blogs/cafes, YouTube transcripts, public blogs, Q&A sites like 知恵袋). X/Twitter is EXCLUDED. Save raw notes (with URLs) ONLY under ' + RAW + '/ (create files there) — never in the repo. In the repo files write ONLY patterns that recur in ≥2 independent reports, rewritten in your own words, with no URLs, handles, quotes or identifiable details; claims.json for this unit uses source_url "internal-research" and publisher "community (n reports)". Each pattern: 상황 → 원인 → 교훈 → 코치가 할 말(한 줄, ko + ja).' },
]

const RESEARCH_SCHEMA = {
  type: 'object',
  properties: {
    md_path: { type: 'string' }, claims_path: { type: 'string' },
    claim_count: { type: 'integer' },
    candidates: { type: 'array', description: 'pack candidates per PRD §4.1 contract', items: { type: 'object', properties: {
      slot: { type: 'string', enum: ['correction_rules', 'culture_notes', 'question_taxonomy', 'failure_pattern', 'doc_only'] },
      id: { type: 'string' }, payload_json: { type: 'string', description: 'JSON string of the exact object/string to add' },
      claim_ids: { type: 'array', items: { type: 'string' } }, confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    }, required: ['slot', 'id', 'payload_json', 'claim_ids', 'confidence'] } },
    unverified: { type: 'array', items: { type: 'string' } },
  },
  required: ['md_path', 'claims_path', 'claim_count', 'candidates', 'unverified'],
}

const VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    verdicts: { type: 'array', items: { type: 'object', properties: {
      candidate_id: { type: 'string' }, keep: { type: 'boolean' },
      failed: { type: 'string', enum: ['none', 'rights_pii', 'evidence_fit', 'stereotype'] },
      blocking: { type: 'boolean' }, reason: { type: 'string' }, rewrite_payload_json: { type: 'string', description: 'fixed payload if fixable, else empty' },
    }, required: ['candidate_id', 'keep', 'failed', 'blocking', 'reason', 'rewrite_payload_json'] } },
    doc_issues: { type: 'array', items: { type: 'string' }, description: 'claims in the md that lack sources, PII, verbatim copying, wrong terms_url, invented URLs' },
  },
  required: ['verdicts', 'doc_issues'],
}

const REFUTE_SCHEMA = {
  type: 'object',
  properties: { results: { type: 'array', items: { type: 'object', properties: {
    candidate_id: { type: 'string' }, upheld: { type: 'boolean', description: 'true = the blocking rejection stands' }, reason: { type: 'string' },
  }, required: ['candidate_id', 'upheld', 'reason'] } } },
  required: ['results'],
}

const research = u => agent(`You are research unit ${u.key}: ${u.title}.
Read ${PRD} (§2.1, §3, §4.1) and ${RD}/README.md first. Prior work in ${RD}/T1~T4-*.md is to be EXTENDED, not redone — cite it by file name instead of re-fetching what it already verified.

Scope: ${u.scope}

${HARD}

Deliverables — write BOTH files yourself with the Write tool BEFORE returning (persistence: the session may hit a usage limit):
1. ${RD}/R1-${u.key}.md — Korean. Sections: 요약 / 확인된 사실(각 문장 끝에 [claim id]) / 팩 후보 / 미확인 / 출처 목록(publisher, URL, accessed 2026-11-02, kind, terms_url).
2. ${RD}/R1-${u.key}.claims.json — array of {id, claim_ko, source_url, publisher, kind: "public"|"private", terms_url, key_tokens: [..], confidence}.
Pack candidates must follow PRD §4.1: correction_rules use the 7 existing fields; culture_notes are one Japanese sentence each; injected text in Japanese. Return the structured summary.`,
  { label: `research:${u.key}`, phase: 'Research', schema: RESEARCH_SCHEMA, effort: 'high' })

const verify = (u, r) => agent(`You are the single compressed verifier for research unit ${u.key}. Read ${RD}/R1-${u.key}.md, ${RD}/R1-${u.key}.claims.json, ${PRD} §3/§4.1, and ${PACK}.
For a sample of the most important claims (at least the ones backing candidates), open the source URL and check the claim's key tokens actually appear (for SNS: skip URL checks; check only that patterns are generalized, have no identifiable details, and are not stereotypes).
For EACH candidate below decide keep/drop with exactly one failed lens:
(a) rights_pii — HARD GATE: verbatim copying (≥20 ja/ko chars or ≥15 en words from a private source), PII, identifiable personal case, public source without valid terms_url mislabelled public, invented URL.
(b) evidence_fit — claim not supported by its sources, overclaim, or unusable by the coach (contract: correction_rules 7 fields + spoken-sentence before/after; culture_notes one Japanese sentence; taxonomy enum strings), or duplicates an existing pack entry.
(c) stereotype — ${u.key === 'C2' ? 'VETO lens: run substitution test (still true if the origin is swapped → it is a general rule, not origin-specific: rewrite as general or drop) and deficit test (implies the candidate is deficient → drop).' : 'only if the text attributes behaviour to a nationality.'}
Mark blocking=true only for (a) or (c) failures. Provide rewrite_payload_json when a fix makes it pass (then keep=true).
CANDIDATES:
${JSON.stringify(r.candidates)}
Also list doc_issues in the md (unsourced factual sentences, PII, verbatim, bad URLs).`,
  { label: `verify:${u.key}`, phase: 'Verify', schema: VERIFY_SCHEMA, effort: 'high' })

const refute = (u, blocking) => agent(`Independently re-check these BLOCKING rejections for research unit ${u.key} (files ${RD}/R1-${u.key}.md and .claims.json). Try to show each rejection is WRONG (e.g. the text is not actually verbatim, the source terms do allow use, the rule is not a stereotype). Default to upheld=true when uncertain.
${JSON.stringify(blocking)}`, { label: `refute:${u.key}`, phase: 'Verify', schema: REFUTE_SCHEMA, effort: 'high' })

const runUnit = u => research(u).then(async r => {
  if (!r) return null
  const v = await verify(u, r)
  if (!v) return { unit: u.key, research: r, verify: null }
  const blocking = v.verdicts.filter(x => x.blocking && !x.keep)
  if (blocking.length) {
    const rf = await refute(u, blocking)
    if (rf) for (const res of rf.results) if (!res.upheld) {
      const t = v.verdicts.find(x => x.candidate_id === res.candidate_id)
      if (t) { t.keep = true; t.reason += ' | refuter overturned: ' + res.reason }
    }
  }
  return { unit: u.key, research: r, verify: v }
})

// exactly 2 units in flight (another workflow is using 8 slots; user cap is 10)
const results = []
for (let i = 0; i < UNITS.length; i += 2) {
  const chunk = UNITS.slice(i, i + 2)
  log(`units ${chunk.map(c => c.key).join(', ')}`)
  const out = await parallel(chunk.map(u => () => runUnit(u)))
  results.push(...out)
}
const done = results.filter(Boolean)
const missing = UNITS.map(u => u.key).filter(k => !done.find(d => d.unit === k))
if (missing.length) log(`units with no result: ${missing.join(', ')}`)

const kept = done.flatMap(d => d.research.candidates.map(c => {
  const v = d.verify && d.verify.verdicts.find(x => x.candidate_id === c.id)
  return { unit: d.unit, ...c, keep: v ? v.keep : false, failed: v ? v.failed : 'unverified', reason: v ? v.reason : 'no verifier result', payload_json: v && v.rewrite_payload_json ? v.rewrite_payload_json : c.payload_json }
}))
log(`candidates: ${kept.length}, kept ${kept.filter(k => k.keep).length}`)

phase('Synthesize')
const synth = await agent(`Write the R1 research deliverables (PRD ${PRD} §4, §4.1, §5). Read ${PACK} and every ${RD}/R1-*.md first.
Write with the Write tool:
1. ${RD}/jp-draft-v2.json — SAME top-level keys as ${PACK} (copy jp.json, then append ONLY kept candidates of slot correction_rules / culture_notes / question_taxonomy). Respect the injection budget: at most +3 correction_rules, +5 culture_notes, +1,000 chars total; rank by confidence then usefulness; put overflow in SUMMARY as "다음 병합 후보". failure_pattern items go into a separate file ${RD}/failure-patterns-r1.json (array).
2. ${RD}/validate-draft.mjs — standalone Node ESM script (no deps): checks jp-draft-v2.json has exactly jp.json's top-level keys, every correction_rule has the 7 fields with valid type, ids unique, budget not exceeded vs jp.json; exits 1 on failure. Do NOT add it to npm test.
3. ${RD}/VERIFICATION-LOG.md — every candidate: unit, id, keep/drop, failed lens, reason (include drops; hide nothing). Plus each unit's doc_issues.
4. ${RD}/SUMMARY.md — per unit counts, what changes in coach output, unverified cells, next-merge candidates, measured scope.
5. ${RD}/README-SECTION.md — データの出典とライセンス: (1) 개발자 본인 노하우 = 규칙 데이터 (2) 공적 출처 + 출처 표기 (3) 민간·커뮤니티 = 요약·패턴만.
6. Update the index table in ${RD}/README.md (§3) with the new files; mark T1~T4 "[Medium] — 검증 로그 파일 부재" honestly.
Do not touch packs/ lib/ api/ public/ test/.
CANDIDATES WITH VERDICTS:
${JSON.stringify(kept)}
UNITS MISSING: ${JSON.stringify(missing)}
DOC ISSUES: ${JSON.stringify(done.map(d => ({ unit: d.unit, issues: d.verify ? d.verify.doc_issues : ['verifier failed'] })))}`,
  { label: 'synthesize', phase: 'Synthesize', effort: 'high', schema: { type: 'object', properties: { files_written: { type: 'array', items: { type: 'string' } }, added: { type: 'object', properties: { correction_rules: { type: 'integer' }, culture_notes: { type: 'integer' }, taxonomy: { type: 'integer' }, failure_patterns: { type: 'integer' } }, required: ['correction_rules', 'culture_notes', 'taxonomy', 'failure_patterns'] }, notes: { type: 'string' } }, required: ['files_written', 'added', 'notes'] } })

phase('Completeness')
const critic = await agent(`Completeness & privacy critic. Read ${RD}/SUMMARY.md, VERIFICATION-LOG.md, jp-draft-v2.json, failure-patterns-r1.json, every R1-*.md, and ${PRD}.
Report: (1) privacy/rights hits (file + string) — personal names, handles, URLs in SNS outputs, verbatim private text; (2) PRD contract violations (extra top-level keys, budget, Korean text in injected fields); (3) important gaps per unit that block the coach (not nice-to-haves). Do not edit files.`,
  { label: 'completeness', phase: 'Completeness', effort: 'high', schema: { type: 'object', properties: { privacy_hits: { type: 'array', items: { type: 'string' } }, contract_violations: { type: 'array', items: { type: 'string' } }, gaps: { type: 'array', items: { type: 'string' } } }, required: ['privacy_hits', 'contract_violations', 'gaps'] } })

return { units_done: done.map(d => d.unit), missing, candidates: kept.length, kept: kept.filter(k => k.keep).length, synth, critic }
