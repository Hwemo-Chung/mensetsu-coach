# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

Hackathon workspace for **Built with Claude: Japan 2026** (solo). Product: 日本転職面接スクリプトコーチ (仮称 メンセツ・コーチ).
**Premise for every judgment: this is an MVP for testing, and feature implementation comes first.** Security hardening is a release task, not a blocker: list weaknesses in the README section `実運用前に修正が必要な点` instead of fixing them now. Never invent career facts, and keep real names and the current job search out of public files.
Public GitHub repo. Only publicly shareable data is committed; secrets and personal data live outside the repo (see Layout).

## Commands
- `npm run dev` — local server at http://localhost:3000. Reads `ENV_FILE` (default `.env`: `ANTHROPIC_API_KEY`, `ACCESS_CODE`; optional `GEMINI_API_KEY` (TTS/STT), `STT_ENABLED=1` (read-aloud check via Gemini STT; the answer 🎤 is on-device and always on), `PREP_ENABLED=1` (interview prep document, Sonnet, about $0.3 each), `MAIL_PUBLIC=1` (public mail signup, off for the submission), `MAIL_SECRET`, `RESEND_API_KEY`, `MAIL_FROM`, `KV_REST_API_URL`/`KV_REST_API_TOKEN` or `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` (daily-tip mail), `CRON_SECRET`, `APP_URL` (cron), `PORT` (dev)). Real secrets: `ENV_FILE=../BuiltWithClaude-2026-private/secrets/.env npm run dev`. Token-free UI test: `MOCK_CLAUDE=1 npm run dev` (fixed answer from `test/fixtures/questions.json`, no Claude call).
- `npm test` — offline, 0 tokens: unit tests, fake Claude client (`test/fake-claude.js`), PII scan. Scan the real denylist with `PII_DENYLIST=../BuiltWithClaude-2026-private/secrets/.pii-denylist.txt npm test`
- `npm run test:live` — real Claude call (~35s, costs credits). Run by hand once after a prompt or model change, never in routine checks.
- `npm run test:ui` — Playwright browser regression suite (`test/ui/*.test.js`, one at a time; starts `dev.js` with `MOCK_CLAUDE`, needs system Chrome, 0 tokens).
- `npm run eval` — real-API evals (F4/F3/F2/consistency, costs credits): `ENV_FILE=… node scripts/eval.mjs --only …`.
- `npm i --no-save @huggingface/transformers@=4.3.2 && npm run vendor:stt` — re-copy the in-browser STT runtime into `public/vendor/` (`--no-save` keeps it out of the Vercel install). Then `STT_SAMPLES=<dir> node --test test/stt-local.live.test.js` runs the real Whisper model in Node (0 credits, ~260 MB download once).

## Code map (only what the code does not show)
- All errors are `{ code }`; the UI turns codes into sentences. `dev.js` runs the same handlers with `vercel.json` headers; `MOCK_CLAUDE=1` uses per-route fixtures (0 tokens). Model ids live only in `lib/claude.js` `MODELS`.
- `public/`: no inline script (CSP `script-src 'self' 'wasm-unsafe-eval'`, COOP/COEP for threaded WASM). Enter = newline, Ctrl/Cmd+Enter = send (keep). `test/i18n.test.js` fails on a missing key. Session JSON stays in browser localStorage.
- Answer 🎤 is on-device Whisper (`research/STT-OSS-EVAL.md`); Gemini STT serves only the read-aloud check (`?kana=1`, `STT_ENABLED`).
- Stage R (`RESEARCH_ENABLED=1`, jp pack only; spec `01_설계문서/SUPPLEMENT-AUTO-RESEARCH.md`): Haiku needs the basic `web_search_20250305` tools (the newer ones made zero real searches). The extraction schema sits near the API's compiled-grammar limit: adding fields returns 400 for every call, and offline tests cannot see it. Review sites are never collected.
- Vercel Hobby allows 12 functions (`api/` is at the limit, a test guards it): `/api/fit` is `lib/fit-api.js` behind a `vercel.json` rewrite to `/api/research?route=fit`.

Deadline: **11/8 (日) 20:00 submit, target 17:00** (キックオフ告知、非公開フォルダ). DESIGN-KAKAOTALK-INTERVIEW-COACH.md still says 11/10 — that date is stale.

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
- Submission needs a **public GitHub repo** (account in the private notes) with README covering overview, how to run, and how Claude is used; plus a public 3-min demo video.

## Architecture rules
- Standalone web UI, no messenger-platform integration (the contest penalizes platform tie-ins).
- All country rules, prompts data and question categories live in `packs/`; adding a pack must not need code changes. Reverse questions are JP-only.
- No corrections outside the rule DB; if unsure, ask a clarifying question instead of guessing.

## Acceptance checks (PRD §5)

- F1/F2: one sample agent email → 10 company-specific questions, categorized.
- F3: a deliberately off-target answer gets the missing 4文型 step flagged correctly.
- F4: every rule example in DESIGN-KAKAOTALK §5 is reproduced.
- F6: session Q&A exports as Markdown.

## Design principle

シンプル・明瞭・直感的: first screen shows one action; labels understandable without prior knowledge (demo must be understandable to a child).
