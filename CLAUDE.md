# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

Hackathon workspace for **Built with Claude: Japan 2026** (solo). Product: 일본 이직 면접 스크립트 코치 (가칭 멘세츠 코치).
Public GitHub repo. Only publicly shareable data is committed; secrets and personal data live outside the repo (see Layout).

## Commands
- `npm run dev` — local server at http://localhost:3000. Reads `ENV_FILE` (default `.env`: `ANTHROPIC_API_KEY`, `ACCESS_CODE`). Real secrets: `ENV_FILE=../BuiltWithClaude-2026-private/secrets/.env npm run dev`
- `npm test` — offline unit tests + PII scan. Scan the real denylist with `PII_DENYLIST=../BuiltWithClaude-2026-private/secrets/.pii-denylist.txt npm test`
- `npm run test:live` — real Claude call with `samples/agent-mail-sample.txt`, asserts 10 questions (~35s, costs credits)

## Code map
- `api/questions.js` — Vercel web-standard `POST` handler (access code → rate limit → validation → Claude). `dev.js` runs the same handler locally with `vercel.json` headers.
- `lib/coach.js` — pack loading, system prompt v1, question request (structured JSON output, enums from pack taxonomy), PII redaction
- `lib/attachment.js` — resume upload → Claude content blocks (PDF/image native, DOCX via mammoth, text); nothing touches disk
- `lib/guard.js` — fail-closed access code, in-memory rate limit
- `public/` — static chat UI (no inline script; CSP `script-src 'self'`). Session JSON lives in browser localStorage only.
- Deploy: Vercel, `outputDirectory: public`. `.vercelignore` excludes `01_설계문서/`, `02_로컬원본/`.

Deadline: **11/8 (일) 20:00 submit, target 17:00** (킥오프 공지, 비공개 폴더). DESIGN-KAKAOTALK-INTERVIEW-COACH.md still says 11/10 — that date is stale.

## Layout

- `01_설계문서/` — public specs and research. **`PRD-INTERVIEW-COACH.md` is the source of truth** (scope, F1–F10, data model, daily milestones). DESIGN-KAKAOTALK (original design), DESIGN-COMPARISON / DESIGN-INTL-MAIL-AGENT (rejected backup idea — ignore), DEVLOG, `research/`. Internal ops docs (schedule, submission drafts, competitor scans, market analysis) live in `../BuiltWithClaude-2026-private/internal-docs/`, not in the repo.
- Private folder `../BuiltWithClaude-2026-private/` (outside the repo): `02_로컬원본/`, `internal-docs/`, `secrets/` (`.env`, `.env.local`, `.pii-denylist.txt`), `samples/` (the real agent mail).
  - `02_로컬원본/` — reference material from the user's Mac. **Read-only input, not code to reuse.** Never copy its contents into the repo.
  - `02_로컬원본/business_japanese_corrections_1022.md` — origin of the correction rules → becomes `packs/jp.json` data.
  - `02_로컬원본/interview_scripts_1022_final.md`, `면접일정_INDEX.md`, `scout-mail-reply-runbook.md` — real personal/company data. Reference only; tests and demo use `TEST-CASES.md` and `samples/` (synthetic).
  - `02_로컬원본/im-not-ai/` — separate third-party git repo (own CLAUDE.md), style-correction reference only.

## Contest rules that constrain code

- Only code written during the contest period (from 11/2 12:30). No copying code from existing projects, including `im-not-ai/`. The user's own correction know-how may be used **as rule data only**; keep that distinction explicit in README.
- No code/data without rights. Avoid generic project types (AI resume screening, basic RAG, Streamlit app).
- Submission needs a **public GitHub repo** (account: tolaria@naver.com) with README covering overview, how to run, and how Claude is used; plus a public 3-min demo video.

## Planned architecture (from PRD)

- Standalone web chat UI, LINE-like styling, single screen. No messenger-platform integration (contest penalizes platform tie-ins). Stack: Node + `@anthropic-ai/sdk` + `mammoth`, no framework, deployed on Vercel.
- Claude API does question generation, coaching and grading; responses streamed.
- **Country pack** separation: all rules/prompts for Japan live in `packs/jp.json` (language pair ja→ko, correction rules, model-answer format, question categories, culture notes). Only JP is implemented; structure must allow adding other packs without code changes.
  - Rule = `{ pattern, type: delete|replace|structure, replacement, reason, example_before, example_after }`
  - Session (local JSON, no names/contacts stored) = `{ company_context, questions[], attempts[{ question_id, answer, feedback{ structure, corrections[], model_answer } }] }`
- System prompt = coach role + pack rules injected + company context + fixed output order: ① structure check (4문형 復唱→結論→基準·数字→選択肢) ② Japanese corrections (before/after + 1-line reason) ③ 60-second model answer (Japanese + pronunciation + Korean).
- Prompt principle: no corrections outside the rule DB; if unsure, ask a clarifying question instead of guessing.

## Acceptance checks (PRD §5)

- F1/F2: one sample agent email → 10 company-specific questions, categorized.
- F3: a deliberately off-target answer gets the missing 4문형 step flagged correctly.
- F4: every rule example in DESIGN-KAKAOTALK §5 is reproduced.
- F6: session Q&A exports as Markdown.

## Design principle

단순·명료·직관: first screen shows one action; labels understandable without prior knowledge (demo must be understandable to a child).
