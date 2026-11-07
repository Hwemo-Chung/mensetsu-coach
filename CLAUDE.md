# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

Hackathon workspace for **Built with Claude: Japan 2026** (solo). Product: 日本転職面接スクリプトコーチ (仮称 メンセツ・コーチ).
**Premise for every judgment: this is an MVP for testing, and feature implementation comes first.** Security hardening is a release task, not a blocker: list weaknesses in the README section `実運用前に修正が必要な点` instead of fixing them now. Never invent career facts, and keep real names and personal circumstances out of public files.
Public GitHub repo. Only publicly shareable data is committed; secrets and personal data live outside the repo (see Layout).

## Commands
- `npm run dev` — local server at http://localhost:3000. Reads `ENV_FILE` (default `.env`: `ANTHROPIC_API_KEY`, `ACCESS_CODE`; optional `GEMINI_API_KEY` (TTS/STT), `STT_ENABLED=1` (read-aloud check via Gemini STT; the answer 🎤 is on-device and always on), `PREP_ENABLED=1` (interview prep document, Sonnet, about $0.3 each), `MAIL_PUBLIC=1` (mail signup: sends a Claude digest of the saved session and a preview at once), `SMTP_USER`/`SMTP_PASS` (Gmail app password; else `RESEND_API_KEY`/`MAIL_FROM`), `MAIL_ROUTINE=1` (scheduled cron mail, off by default), `MAIL_SECRET`, `OPEN_ACCESS=1` (no code needed up to a daily limit; unset = code required), `DAILY_LIMIT`/`DAILY_LIMIT_IP` (that limit, all/per IP), `KV_REST_API_URL`/`KV_REST_API_TOKEN` or `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` (daily-tip mail and the daily-limit counts), `CRON_SECRET`, `APP_URL` (cron), `PORT` (dev)). Real secrets: `ENV_FILE=../BuiltWithClaude-2026-private/secrets/.env npm run dev`. Token-free UI test: `MOCK_CLAUDE=1 npm run dev` (fixed answer from `test/fixtures/questions.json`, no Claude call).
- `npm test` — offline, 0 tokens: unit tests, fake Claude client (`test/fake-claude.js`), PII scan. Scan the real denylist with `PII_DENYLIST=../BuiltWithClaude-2026-private/secrets/.pii-denylist.txt npm test`
- `npm run test:live` — real Claude call (~35s, costs credits). Run by hand once after a prompt or model change, never in routine checks.
- `npm run test:ui` — Playwright browser regression suite (`test/ui/*.test.js`, one at a time; starts `dev.js` with `MOCK_CLAUDE`, needs system Chrome, 0 tokens).
- `npm run eval` — real-API evals (F4/F3/F2/consistency, costs credits): `ENV_FILE=… node scripts/eval.mjs --only …`.
- `npm i --no-save @huggingface/transformers@=4.3.2 && npm run vendor:stt` — re-copy the in-browser STT runtime into `public/vendor/` (`--no-save` keeps it out of the Vercel install). Then `STT_SAMPLES=<dir> node --test test/stt-local.live.test.js` runs the real Whisper model in Node (0 credits, ~260 MB download once).

- Before any commit or push, follow `/publish-check`; for a production deploy, follow `/deploy-verify`, never `vercel:deploy` (it says uncommitted changes stay out, here they ship). These two skills do not load by themselves. The project hook `.claude/settings.json` → `.claude/hooks/publish-gate.mjs` runs the same scan before any `git push` or Vercel deploy that Claude Code starts and blocks on a hit (exit 2); a local `pre-push` hook covers pushes typed by hand.

## Code map (only what the code does not show)
- All errors are `{ code }`; the UI turns codes into sentences. `dev.js` runs the same handlers with `vercel.json` headers; `MOCK_CLAUDE=1` uses per-route fixtures (0 tokens). Model ids live only in `lib/claude.js` `MODELS`.
- `public/`: no inline script (CSP `script-src 'self' 'wasm-unsafe-eval'`, COOP/COEP for threaded WASM). Enter = newline, Ctrl/Cmd+Enter = send (keep). `test/i18n.test.js` fails on a missing key. Session JSON stays in browser localStorage.
- Answer 🎤 is on-device Whisper (`research/STT-OSS-EVAL.md`); Gemini STT serves only the read-aloud check (`?kana=1`, `STT_ENABLED`).
- Stage R (`RESEARCH_ENABLED=1`, jp pack only; spec `01_設計文書/SUPPLEMENT-AUTO-RESEARCH.md`): Haiku needs the basic `web_search_20250305` tools (the newer ones made zero real searches). The extraction schema sits near the API's compiled-grammar limit: adding fields returns 400 for every call, and offline tests cannot see it. Review sites are never collected.
- Vercel Hobby allows 12 functions (`api/` is at the limit, a test guards it): `/api/fit` is `lib/fit-api.js` behind a `vercel.json` rewrite to `/api/research?route=fit`.
- `/api/verify` (F15, the script check: ④⑤; ①②③ are `/api/review`) is `lib/verify-api.js` behind the same kind of rewrite, `/api/research?route=verify`. It calls Claude only when there is material (a pasted resume or mail, or the user's own answer: the UI checks every model script against its answer once), and nothing it receives is stored.
- Access: `lib/guard.js` `gate()` runs on every route that calls a model or an outside API. The right code passes uncounted, a wrong one is 401; no code is 401 unless `OPEN_ACCESS=1`, then a JST-day limit (KV, else per-instance memory). Answering one question costs 3 (review, script, verify).
- Interview stages: `/api/prep` takes `stage` (keys of the jp pack's `script_doc.stages`, default `first`, unknown 400); the stage picks the sections and adds its focus and rule. `agent` exists in the pack but not in the UI.
- `public/calendar.js` only builds Google Calendar's prefilled link (no OAuth, no server call); the title never carries the company, a question or an answer. Attempts carry `at` (the practice log and the export use it).

Deadline: **11/8 (日) 20:00 submit, target 17:00** (キックオフ告知、非公開フォルダ).

## Layout

- `01_設計文書/` — public specs and research. **`PRD-INTERVIEW-COACH.md` is the source of truth** (scope, features, data model, daily milestones). DEVLOG, `research/`. The original design and the rejected backup idea were deleted on 11/06 (git history only). Internal ops docs (schedule, submission drafts, competitor scans, market analysis) live in `../BuiltWithClaude-2026-private/internal-docs/`, not in the repo.
- Private folder `../BuiltWithClaude-2026-private/` (outside the repo): `02_ローカル原本/`, `samples/`, `internal-docs/`, `secrets/` (`.env`, `.env.local`, `.pii-denylist.txt`).
  - `02_ローカル原本/` and the private `samples/` are reference material. **Read-only input, not code to reuse.** Never copy their contents into the repo. Tests and demo use `TEST-CASES.md` and the repo's `samples/` (synthetic).
  - The correction rules behind `packs/jp.json` come from there, as rule data only. `02_ローカル原本/im-not-ai/` is a separate third-party git repo (own CLAUDE.md), style-correction reference only.

## Contest rules that constrain code

- Only code written during the contest period (from 11/2 12:30). No copying code from existing projects, including `im-not-ai/`. The user's own correction know-how may be used **as rule data only**; keep that distinction explicit in README.
- No code/data without rights. Avoid generic project types (AI resume screening, basic RAG, Streamlit app).
- Submission needs a **public GitHub repo** (account in the private notes) with README covering overview, how to run, and how Claude is used; plus a public 3-min demo video.

## Architecture rules
- Standalone web UI, no messenger-platform integration (the contest penalizes platform tie-ins).
- All country rules, prompts data and question categories live in `packs/`. A new pack still needs registration in code (`add-pack` skill lists every place); shrinking that list is the goal. Reverse questions are JP-only.
- No corrections outside the rule DB; if unsure, ask a clarifying question instead of guessing.

## Acceptance checks (PRD §5)

- F1/F2: one sample agent email → 10 company-specific questions, categorized.
- F3: a deliberately off-target answer gets the missing 4文型 step flagged correctly.
- F4: every `example_before` of `packs/jp.json` `correction_rules` is corrected under its own rule id (`ENV_FILE=… node scripts/eval.mjs --only f4`, real API).
- F6: session Q&A exports as Markdown.

## Design principle

シンプル・明瞭・直感的: first screen shows one action; labels understandable without prior knowledge (demo must be understandable to a child).
