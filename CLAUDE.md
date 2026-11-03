# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

Hackathon workspace for **Built with Claude: Japan 2026** (solo). Product: 日本転職面接スクリプトコーチ (仮称 メンセツ・コーチ).
Public GitHub repo. Only publicly shareable data is committed; secrets and personal data live outside the repo (see Layout).

## Commands
- `npm run dev` — local server at http://localhost:3000. Reads `ENV_FILE` (default `.env`: `ANTHROPIC_API_KEY`, `ACCESS_CODE`; optional `GEMINI_API_KEY` (TTS/STT), `STT_ENABLED=1` (read-aloud check via Gemini STT; the answer 🎤 is on-device and always on), `MAIL_SECRET`, `RESEND_API_KEY`, `MAIL_FROM`, `KV_REST_API_URL`/`KV_REST_API_TOKEN` or `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` (daily-tip mail), `CRON_SECRET`, `APP_URL` (cron), `PORT` (dev)). Real secrets: `ENV_FILE=../BuiltWithClaude-2026-private/secrets/.env npm run dev`. Token-free UI test: `MOCK_CLAUDE=1 npm run dev` (fixed answer from `test/fixtures/questions.json`, no Claude call).
- `npm test` — offline, 0 tokens: unit tests, fake Claude client (`test/fake-claude.js`), PII scan. Scan the real denylist with `PII_DENYLIST=../BuiltWithClaude-2026-private/secrets/.pii-denylist.txt npm test`
- `npm run test:live` — real Claude call (~35s, costs credits). Run by hand once after a prompt or model change, never in routine checks.
- `npm run test:ui` — Playwright browser regression suite (`test/ui/*.test.js`, one at a time; starts `dev.js` with `MOCK_CLAUDE`, needs system Chrome, 0 tokens).
- `npm run eval` — real-API evals (F4/F3/F2/consistency, costs credits): `ENV_FILE=… node scripts/eval.mjs --only …`.
- `npm i --no-save @huggingface/transformers@=4.3.2 && npm run vendor:stt` — re-copy the in-browser STT runtime into `public/vendor/` (`--no-save` keeps it out of the Vercel install). Then `STT_SAMPLES=<dir> node --test test/stt-local.live.test.js` runs the real Whisper model in Node (0 credits, ~260 MB download once).

## Code map
- `api/questions.js`, `api/script.js`, `api/review.js`, `api/reverse.js` — Vercel web-standard `POST` handlers (access code → rate limit → validation incl. `lang` → Claude). `api/access.js` checks the code only (no AI). All errors are `{ code }`; the UI turns codes into sentences. `dev.js` runs the same handlers locally with `vercel.json` headers; `MOCK_CLAUDE=1` uses per-route fixtures (0 tokens). Also `api/tts.js`, `api/stt.js` (Gemini voice; fail closed on missing key or flag; STT now serves only the read-aloud check `?kana=1`), `api/subscribe.js`, `api/unsubscribe.js` (`GET`), `api/demand.js`, `api/cron/daily.js` (Vercel cron `0 0 * * *`, `CRON_SECRET`).
- `lib/coach.js` — barrel re-exporting `claude.js` (`MODELS`: questions/script/reverse = Sonnet 5.5, review = Opus 5.5, IDs verified via Models API 11/02; `askJson`), `pack.js` (`PACKS`, `loadPack`), `lang.js` (`EXPLAIN_LANGS`, `TARGET_LANGS`), `privacy.js` (`redact`), `questions.js` (`countSpecific`, `MIN_SPECIFIC` = 6), `script.js`, `review.js`, `reverse.js`. Together: pack loading, prompts, question/script/review requests (structured JSON output), `EXPLAIN_LANGS` (language registry + gates, 1 retry), F2 specificity gate (`countSpecific`, ≥6/10), review gate (drop corrections not quoting the answer), `maskInput` (before Claude) / `redact` (output)
- `lib/attachment.js` — resume upload → Claude content blocks (PDF/image native, DOCX via mammoth, text); nothing touches disk
- `lib/tts.js` (Gemini TTS, `gemini-3.8-flash-lite-tts` with `gemini-3.8-flash-tts` fallback), `lib/stt.js` (Gemini STT, `STT_ENABLED` gate; `speechQuality` re-exported from `public/stt-whisper.js`), `lib/kana.js` (kana → Hangul/romaji), `lib/mail.js` (daily tip, Resend + Upstash/KV), `lib/consistency-metrics.js` (eval metrics)
- `lib/guard.js` — fail-closed access code, in-memory rate limit
- `public/` — static chat UI (no inline script; CSP `script-src 'self' 'wasm-unsafe-eval'`, COOP/COEP for threaded WASM). Answer 🎤 = open-source Whisper-small in the browser: `stt-local.js` (decode + worker; MOCK swaps in `test/fixtures/stt-local.mock.js`), `stt-worker.js`, `stt-whisper.js` (shared with Node: language fixed to the pack target, filler prompt, 30 s chunks, `speechQuality`), runtime vendored in `public/vendor/`, model from huggingface.co (`research/STT-OSS-EVAL.md`). Stages code → mail → pick ⇄ answer, plus an optional `profile` stage (one-line career summary that regenerates the questions), entered from the offerProfile button. Enter = newline, Ctrl/Cmd+Enter = send (keep). `public/i18n/{ko,en,ja}.js` + `index.js`; `test/i18n.test.js` fails on a missing key. Session JSON lives in browser localStorage only.
- Deploy: Vercel, `outputDirectory: public`. `.vercelignore` excludes `01_설계문서/`, `02_로컬원본/`.

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

## Planned architecture (from PRD)

- Standalone web chat UI, LINE-like styling, single screen. No messenger-platform integration (contest penalizes platform tie-ins). Stack: Node + `@anthropic-ai/sdk` + `mammoth`, no framework, deployed on Vercel.
- Claude API does question generation, coaching and grading; responses streamed.
- **Country pack** separation: all rules/prompts for Japan live in `packs/jp.json` (interview target language from the pack (ja or ko); explanation language = one of `EXPLAIN_LANGS` ko/en/ja, chosen by the UI language; correction rules, model-answer format, question categories, culture notes). Two packs exist: `packs/jp.json` and `packs/kr.json` (marked `beta`); `PACKS = ["jp", "kr"]`. Reverse questions are JP-only. Structure must allow adding other packs without code changes.
  - Rule = `{ pattern, type: delete|replace|structure, replacement, reason, example_before, example_after }`
  - Session (local JSON, no names/contacts stored) = `{ company_context, questions[], attempts[{ question_id, answer, feedback{ structure, corrections[], model_answer } }] }`
- System prompt = coach role + pack rules injected + company context + fixed output order: ① structure check (4文型 復唱→結論→基準・数字→選択肢) ② Japanese corrections (before/after + 1-line reason) ③ 60-second model answer (Japanese + pronunciation + Korean).
- Prompt principle: no corrections outside the rule DB; if unsure, ask a clarifying question instead of guessing.

## Acceptance checks (PRD §5)

- F1/F2: one sample agent email → 10 company-specific questions, categorized.
- F3: a deliberately off-target answer gets the missing 4文型 step flagged correctly.
- F4: every rule example in DESIGN-KAKAOTALK §5 is reproduced.
- F6: session Q&A exports as Markdown.

## Design principle

シンプル・明瞭・直感的: first screen shows one action; labels understandable without prior knowledge (demo must be understandable to a child).
