> Public copy (2026-11-02). Account balance removed; otherwise as written during development.

# Claude Resources — What We Need to Check

Compiled 2026-11-02 from the resource list shared in the hackathon Discord (Level 2: docs while building; Level 3: deeper reading, English). Every item below was read on 2026-11-02 from the linked page itself; where only an index was skimmed, that is stated. Prices and model names are as listed on the models overview page on that date — re-verify in the Console before locking any decision that depends on them.

Project context: Japan job-change interview script coach. Fixed 5-stage pipeline (material analysis → question generation → structure scoring → rule-based correction → model answer), country-pack architecture (JP pack only for the MVP), one builder working in ~5-hour daily sessions, submission deadline 2026-11-08 20:00 JST.

---

## 1. Model lineup and stage assignment

Source: [Models overview](https://platform.claude.com/docs/ja/about-claude/models/overview) (retrieved 2026-11-02). All current models: text + image input, text output, multilingual, vision, tool use; 1M-token context; 128K max output.

| Model | Positioning (per docs) | Price (per MTok, in / out) | Speed |
|---|---|---|---|
| Claude Fable 5.1 | Demanding reasoning, long-horizon agentic work | $10 / $50 | Slower |
| Claude Opus 5.5 | Default starting point for most workloads; long-running agentic coding and knowledge work | $4 / $20 | Moderate |
| Claude Sonnet 5.5 | Best combination of speed and intelligence | $2 / $10 | Fast |
| Claude Haiku 5.5 | High-volume, latency-sensitive tasks: classification, extraction, routing | from $0.10 / from $0.50 | Fastest |

Docs guidance: start with Opus 5.5 for most workloads; move to Fable 5.1 when a task needs demanding reasoning / long-horizon agency, or when Opus 5.5 at higher effort still misses your eval bar.

**Checklist for our pipeline (decide by eval, not by feel):**
- [ ] Extraction and routing stages (company-context extraction, question-category classification, filler-pattern pre-checks) → Haiku 5.5 class: cheap, fast, structured output.
- [ ] Generation stages (question generation, model answers) → Sonnet 5.5 baseline; Opus 5.5 if eval cases show weak Japanese business register.
- [ ] Scoring stage (4-element rubric) → the strongest model we can afford per call; this stage decides coaching quality.
- [ ] Do not hardcode model IDs from memory: query the Models API (`max_input_tokens`, `max_tokens`, `capabilities`) and pin exact IDs in one config file.
- [ ] Track spend against the $500 event credit; prompt caching and batch discounts exist — see the full pricing page before optimizing blindly.
- [ ] Note the `thinking` capability flags per model (`thinking.types.disabled`, `thinking.types.between_tools` differ per model — e.g. Sonnet 5.5 reports between_tools supported, disabled not supported). Check before sending thinking parameters.

## 2. Claude Code best practices — build-process checklist

Source: [Claude Code best practices](https://code.claude.com/docs/ja/best-practices) (page updated 2026-10-30; read in full 2026-11-02). Core frame: instructions are either non-deterministic (prompts, CLAUDE.md, skills — Claude decides) or deterministic (hooks, deny rules, settings — the harness enforces). Use prompts for judgment calls, harness features for rules that must never break.

**Give Claude what it cannot see:**
- [ ] Keep `CLAUDE.md` short (docs recommend under ~200 lines; `/init` to generate, `/doctor` to prune). Put only what the code cannot tell: exact test/typecheck/lint commands, misleading legacy patterns, decisions that live outside the repo, anything already fixed twice.
- [ ] Personal preferences go in `CLAUDE.local.md` (gitignored), not the repo file.
- [ ] Scope partial rules with `.claude/rules/` + `paths:` filters instead of bloating the global file.
- [ ] Repeatable team procedures belong in skills (`.claude/skills/<name>/SKILL.md`) — loaded only when relevant; add `disable-model-invocation: true` for workflows with side effects.
- [ ] Write specific prompts (file names, symptom, definition of "fixed"). Hand over artifacts directly (`@file`, pasted screenshots, piped command output) instead of describing them.
- [ ] For open questions, let Claude interview you first, write the result into a SPEC file, then start a fresh session to build from it. (Our PRD already plays this role — keep building against it.)

**Give Claude checks it can run:**
- [ ] Claude stops when work *looks* done. Give it pass/fail evidence loops: tests, build exit codes, linters, fixture-comparison scripts, screenshots.
- [ ] The most useful single line in `CLAUDE.md` is the command that runs the check.
- [ ] Demand evidence, not summaries: command + output, or a screenshot. "All tests passed" alone is near-worthless.
- [ ] Escalation ladder for checks: prompt-level ("run X and keep going until it passes") → `/goal <condition>` (a separate model re-checks after every turn; built for long unattended runs) → `Stop` hook (harness-enforced; exit code 2 sends Claude back to work) → `/code-review` (a fresh subagent that never saw the producing conversation).
- [ ] For spec conformance, use a reviewer subagent with `tools: Read, Grep, Glob` only (`.claude/agents/reviewer.md`) — it physically cannot edit, and the restriction is enforced by Claude Code, not requested in a prompt.

**Enforce no-exception rules in the harness, not in prose:**
- [ ] Hooks: shell command / HTTP / MCP tool / prompt-or-agent hook at fixed loop points. True enforcement needs `command` or `http` hooks (prompt/agent hooks are another model's judgment). Add `onFailure: "block"` where a crashed checker must stop the action (e.g. a secret scanner before commit).
- [ ] Deny rules for never-read files (`.env`) belong in `.claude/settings.json` — they hold in every permission mode including auto and bypass. `Read` rules also catch common shell reads (`cat .env`) but not scripts that open files — combine with `/sandbox` for OS-level limits.
- [ ] Our concrete candidates: deny rule for any real-personal-data fixture file; PostToolUse formatter hook; PreToolUse block on edits to `packs/` rule data during pure-UI sessions (optional).

**Defaults, cost, and session steering:**
- [ ] Default session: Opus 5.5 at medium effort, auto permission mode (a classifier reviews risky actions; deterministic deny rules and hooks run before the classifier).
- [ ] Effort is the control that replaced prompt phrasing: raise to high/xhigh for easily-missed edge cases (schema changes, flaky tests, legacy formats); low for brainstorming and mechanical renames; `ultrathink` in a single prompt for one hard question; reserve `max` for unattended hard problems.
- [ ] Subagents cost extra tokens (each sends its own requests against the same usage). Use them for parallel work, isolating noisy output, and fresh-eyes review — set `model: haiku` for simple sweeps, ask for short summaries back, watch `/usage` by subagent type.
- [ ] `/clear` between unrelated tasks (free; stops paying to re-read irrelevant history); `/compact <focus>` with an explicit focus for long sessions; `/rewind` to retry bold approaches safely; name long efforts (`/rename`, `claude --resume <name>`).
- [ ] Headless use for scripted checks: `claude -p` with `--bare` (skips hooks/skills/MCP/CLAUDE.md for reproducibility), `--allowedTools`, `--permission-mode dontAsk`, `--output-format json`. Candidate use: running our TEST-CASES set against prompt versions.
- [ ] Before any unattended run, answer the docs' five questions: what "done" means; what check verifies it; what it may touch; what stops it (`--max-turns`, `--max-budget-usd`, spend caps); where results go and who approves irreversible steps.

**Advice we can stop following (model caught up — from the docs' own list):**
- No more IMPORTANT/all-caps shouting in prompts; plain lines are followed, over-emphasis causes over-application. Unbendable rules → hooks/deny rules.
- No aggressive context-window management: 1M windows + automatic compaction; still `/clear` between tasks for focus and cost.
- No "keep working / don't be lazy" nagging lines; give pass/fail checks instead.
- No `think hard` / `be thorough` as depth control; effort settings do that.
- No architecture/file-layout essays in `CLAUDE.md`; Claude reads the repo itself.

## 3. Agent architecture patterns — what our pipeline actually is

Source: [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) (originally Dec 2024; the page now carries a note that the tooling landscape has changed and points to the Managed Agents docs — patterns below are from the article itself).

Definitions that matter for our submission copy: a **workflow** orchestrates LLMs through predefined code paths; an **agent** lets the LLM direct its own process. Our product is a workflow, and saying so precisely is a strength, not a weakness.

**Pattern mapping to our 5 stages:**
- [ ] **Prompt chaining with gates** — our core shape. Each stage's output feeds the next; add programmatic gates between stages (schema validation on structured output; "corrections must cite a rule ID from the pack" as a hard gate).
- [ ] **Routing** — classify first, then specialize: question category routes to category-specific generation/scoring prompts; difficulty can route between model tiers (easy → Haiku-class, hard → Opus-class), which is the article's own cost example.
- [ ] **Evaluator-optimizer** — our answer-rewrite loop is this pattern: one call drafts/coaches, another scores against the 4-element rubric and feeds back, loop until pass or a fixed iteration cap. The article's fit test matches us exactly: clear evaluation criteria + responses that demonstrably improve when feedback is articulated (their example is literary translation refinement — the closest published analogue to Japanese answer polishing).
- [ ] **Parallelization (voting)** — optional: multiple scorers vote on intent-match for borderline answers. Only if evals show single-scorer instability.
- [ ] **Orchestrator-workers / autonomous agents** — not needed for the MVP. Do not add agentic loops where a fixed pipeline suffices.

**Operating principles to cite and follow:**
- [ ] Simplest solution first; add complexity only when it *demonstrably* improves outcomes on evals (our TEST-CASES.md is the measurement harness).
- [ ] Prefer direct API calls over frameworks at first; framework abstractions hide prompts and responses and make debugging harder.
- [ ] Transparency: show the pipeline steps explicitly (in the UI and in the submission's Claude-usage answer) — the article lists this as a core principle.
- [ ] If tools are introduced later, treat tool design like an API contract (ACI): self-contained, minimal overlap, descriptive parameters, tested.

## 4. Context engineering — prompt and context discipline

Source: [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) (published 2025-09-29, updated 2026-10-18; read in full 2026-11-02).

- [ ] Context is a finite resource with diminishing returns ("context rot": recall degrades as tokens grow). Guiding principle: **the smallest set of high-signal tokens** that makes the desired outcome likely.
- [ ] System prompts at the "right altitude": specific enough to guide, flexible enough to leave heuristics to the model. No brittle hardcoded logic chains; no vague aspirations either. Organize into clear sections (background / instructions / output description) with headers or XML tags.
- [ ] Start from a minimal prompt against the best available model, then add instructions and examples based on observed failure modes — not preemptively.
- [ ] Examples beat rule lists: curate a few diverse, canonical few-shot examples instead of stuffing every edge case into the prompt. For us: canonical before/after correction pairs from the real corrections document, not the whole document.
- [ ] **Just-in-time context**: keep lightweight references and load on demand. Applied to our app: per API call, load only the selected company's extracted context + the relevant rule subset for that stage — never the whole pack or full session history.
- [ ] Long-horizon techniques, if ever needed: compaction (summarize + restart; tune for recall first, then precision; tool-result clearing is the lightest form), structured note-taking (an external NOTES file the agent re-reads), sub-agent architectures (specialists return 1–2K-token distilled summaries). For our request/response pipeline these are mostly unnecessary — but note-taking maps directly onto our own build process: DEVLOG.md is the structured note that carries state across the daily 5-hour Claude Code sessions.

## 5. Claude Managed Agents — checked, verdict: not for the MVP

Sources: [Managed Agents overview](https://platform.claude.com/docs/ja/managed-agents/overview) and [quickstart](https://platform.claude.com/docs/ja/managed-agents/quickstart) (read in full 2026-11-02).

What it is: a pre-built, configurable agent harness on managed infrastructure (vs. the Messages API's direct model access). Four concepts: **Agent** (model, system prompt, tools, MCP servers, skills), **Environment** (Anthropic-managed cloud sandbox or self-hosted sandbox), **Session** (a running instance), **Events** (messages exchanged, streamed over SSE, persisted server-side). Built-in tools: bash, file operations, web search/fetch (domain allow/block lists), MCP servers. Built-in prompt caching and compaction.

Access facts: beta; requires an API key and the beta header `managed-agents-2026-04-01` on all requests; enabled by default for all API accounts (MCP tunnels and "dreaming" are limited research previews requiring a separate access request). Quickstart uses the `ant` CLI (`brew install anthropics/tap/ant`), defines agents as markdown files applied with `ant apply` (IDs recorded in `claude-lock.json`), and streams session events via SDK. Reference full apps exist pairing managed sessions with Chat SDK, assistant-ui, and CopilotKit front-ends.

**Checks and verdict:**
- [ ] Fit test from the docs: long-running tasks (minutes to hours), sandboxed code execution, stateful sessions, scheduled runs. Our MVP is short request/response coaching calls with no code execution — **Messages API is the right surface; Managed Agents would be complexity without payoff** (consistent with §3's simplicity principle).
- [ ] Data-handling flag: Managed Agents is stateful by design (conversation history, sandbox state, outputs stored server-side) and is currently **out of scope for Zero Data Retention and HIPAA BAA**. Our product principle is "no personal identifiers stored" — server-side persisted sessions cut against it. If this is ever adopted, session/file deletion APIs exist and must be wired in.
- [ ] Roadmap candidate only: post-hackathon, a long mock-interview practice mode (stateful, multi-turn, tool-using) is the first feature where Managed Agents could earn its place. Re-evaluate then.

## 6. Claude Agent SDK — checked, verdict: know the boundary, use if the product grows an agent loop

Source: [Agent SDK overview](https://code.claude.com/docs/ja/agent-sdk/overview) (read in full 2026-11-02).

- The SDK exposes the same tools, agent loop, and context management as Claude Code, programmable from Python and TypeScript: built-in tools (read/write/edit, commands, web search), hooks, subagents, MCP, permissions, sessions, skills — loaded from the same `.claude/` locations as Claude Code.
- The four-way boundary, in one line each: **Agent SDK** = embed Claude Code's loop in your own Python/TS app; **CLI** = interactive/one-off terminal work; **Client SDK** = call the API directly and write (or delegate) the tool loop yourself; **Managed Agents** = Anthropic hosts the harness.
- [ ] MVP stays on direct API calls (Client SDK level). Reconsider the Agent SDK only if a future feature needs a genuine agent loop inside our own process.
- [ ] **Branding rule to respect in UI/submission copy** (from the SDK docs): "Powered by Claude" phrasing is allowed; the product must not be presented as "Claude Code" or a "Claude Code Agent", and must not mimic Claude Code branding.

## 7. Cookbook — recipes worth opening next

Source: [Claude Cookbook](https://platform.claude.com/cookbook) index (skimmed 2026-11-02). The first two recipes below were read in full on 2026-11-02 — verified takeaways are in §10. The rest remain pointers, not verified content.

Priority for our design:
- [x] **"Outcomes: agents that verify their own work"** (May 2026) — READ 2026-11-02. Grade-and-revise loop with an independent grader; rubric-writing principles in §10.
- [x] **"Content policy enforcement with Claude"** (Aug 2026) — READ 2026-11-02. Prose policy → deterministic JSON rules, model-free engine, three-valued logic; architecture validation in §10.
- [ ] **"Cost Optimization on the Claude API"** (Aug 2026) — eval-driven application of the API's cost levers on frontier models; relevant to staying inside the $500 credit with headroom.
- [ ] **"Context engineering: memory, compaction, and tool clearing"** (Mar 2026) and **"Session memory compaction"** (Jan 2026) — the cookbook companions to §4.
- [ ] **"Managed Agents tutorial: prompt versioning and rollback"** (Apr 2026) — server-side prompt versions evaluated against a labelled test set, with rollback by pinning. The versioning discipline is worth copying even on the plain Messages API.
- [ ] **"Orchestrator pattern: big models for planning, small models for execution"** (Jul 2026) — measured two-model economics; backup evidence for our model-tier split (§1).

## 8. Developer blog (claude.dev) — reading list

Source: [claude.dev](https://claude.dev/) front page (titles and dates only, 2026-11-02; articles not yet read).

- [ ] "Using Claude Code: Spending your effort" (Sep 25, 2026) — effort budgeting, pairs with §2.
- [ ] "What a task costs on Opus 5.5" (Sep 25, 2026) — cost expectations for our build sessions and eval runs.
- [ ] "Automating eval design and hillclimbing with Claude" (Sep 28, 2026) — pairs with TEST-CASES.md.
- [ ] "Building effective agent automations" (Oct 08, 2026) and "How the Claude Code team does code review" (Oct 15, 2026) — process references.

Note: the Anthropic Engineering index page itself did not render readable content in this check; the two engineering articles above were read directly from their own URLs.

## 9. Consolidated pre-build checklist

Build process (Claude Code):
- [ ] `CLAUDE.md` under ~200 lines: test/check commands + repo-invisible decisions only; personal prefs in `CLAUDE.local.md`.
- [ ] One runnable pass/fail check wired from Day 1 (TEST-CASES fixtures); evidence = command output, pasted back.
- [ ] Reviewer subagent (read-only tools) compares work against PRD at each day's end.
- [ ] `/clear` between unrelated tasks; DEVLOG updated as the structured note across sessions.
- [ ] Deny rule for real-personal-data files; secret-scan hook before any public commit.

App design (API usage):
- [ ] Model tiers per stage (§1), exact IDs pinned in one config, Models API used to verify limits/capabilities.
- [ ] Pipeline = prompt chaining with programmatic gates; evaluator-optimizer loop capped at a fixed iteration count.
- [ ] Grader independence (§10.1): the scoring call sees only (question, answer, rubric) — never the generation chain; rubric criteria evidence-forcing, feedback format mandated (scoreboard + one bullet per failure).
- [ ] Answer verdicts are computed by a deterministic engine over extracted typed fields (§10.2), with a three-valued outcome: pass / fail / needs-review (unknown is never forced into a confident verdict).
- [ ] Corrections never exceed the rule DB: gate = rule ID citation required.
- [ ] Per-call context = company context + stage-relevant rules + canonical examples only (just-in-time, smallest high-signal set).
- [ ] Prompt versions labelled (v1, v2…) and evaluated against the same test set before switching.
- [ ] Managed Agents and Agent SDK: deliberately not used in the MVP; rationale recorded (§5, §6) for the submission's Claude-usage answer.

Submission copy:
- [ ] Describe the architecture with the docs' own vocabulary: workflow (prompt chaining, routing, evaluator-optimizer), not "autonomous agent".
- [ ] Respect branding rules: "Powered by Claude" OK; never imply the product is Claude Code.

---

## 10. Cookbook deep-reads (verified 2026-11-02)

### 10.1 Outcomes — how to build our scoring loop without Managed Agents
Recipe: [Outcomes: agents that verify their own work](https://platform.claude.com/cookbook/managed-agents-cma-verify-with-outcome-grader). Outcomes itself is a Managed Agents feature (a `user.define_outcome` event provisions a separate grader), but the design rules transfer directly to a hand-rolled evaluator-optimizer loop on the Messages API:

- **Separation is the mechanism.** The grader runs in a fresh context window, sees only the artifact + rubric, and cannot see the writer's reasoning — a writer that knows the criteria still grades its own work leniently. Our implementation: the scoring call receives (question, user's answer, rubric) only — never the generation chain or its own prior commentary.
- **The default failure mode is a grader that approves everything.** Rubric wording decides whether any checking happens. Vague criterion ("covers demand charges") → skim and pass. Evidence-forcing criterion ("confirm it states a $/kW figure or a % of operating cost") → real verification.
- **Six rubric principles** (from the recipe): ① every criterion checkable, and the rubric more specific than the task; ② make the grader earn "satisfied" — require concrete evidence (for us: quote the answer span that satisfies each of the 4 elements); ③ describe the goal, not the steps; ④ anticipate shortcuts — name them as failures (for us: restating the question without a conclusion; adding a number that is not a criterion; returning options that are actually questions back); ⑤ mandate the feedback format — one-line scoreboard, then one bullet per failure: what's wrong + what to do (this is exactly the feedback our UI shows the user); ⑥ tell the grader what to ignore (style nits outside the rule pack), so it doesn't thrash.
- **Iteration cap:** `max_iterations` defaults to 3 (max 20). If every pass fails on the same kind of issue, the writer cannot act on the feedback and further loops just cost tokens — surface the failure to the user instead.
- **No rubric yet?** Derive criteria from a known-good example: have Claude analyze what makes a good artifact good, then turn that into criteria. For us: derive the 4-element rubric wording from the user's real corrected model answers, not from a blank page.
- Description (for the writer) and rubric (for the grader) are separate artifacts with separate jobs; they must agree on the artifact's format or the loop fails instead of converging.

### 10.2 Content policy enforcement — our rule-pack architecture, validated and upgraded
Recipe: [Content policy enforcement with Claude](https://platform.claude.com/cookbook/capabilities-content-moderation-guide) (all data in the recipe is synthetic, stated up front). The pipeline splits into four parts, and Claude **never decides the verdict**:

1. **Schema** (hand-written): the typed fields that can be known about the content. Field descriptions do double duty — they are the extraction instructions at runtime AND what the compiler reads. Fields may be null on purpose: "couldn't tell" is a legitimate value.
2. **Compiler** (Claude, once per policy change): turns each prose clause into rules over those fields, checked by a static validator (validator-driven repair loop). Clauses that can't be reduced are declared `uncompilable` explicitly rather than forced.
3. **Extractor** (Claude, once per item): one call reads the content into typed fields (structured outputs).
4. **Engine** (no model, ~200 lines, pure function of rules+fields+context): same inputs → same verdict, with a per-assertion audit trail (rule, expected vs. actual).

Design details worth copying into `packs/jp.json` and the coaching engine:
- **Rule language**: one JSON document; conditions compose with `all` / `any` / `not` over leaf assertions (`eq, neq, gt, gte, lt, lte, in, not_in, contains, not_contains, regex, exists`); `when` = the violation (linter convention, traces read "fired because X").
- **Scope is split from the violation**: a second, small **context schema** holds facts the code already knows (placement, channel) and passes in — nothing is extracted for them. For us: question category and country pack are context, supplied by our code, never guessed by the model.
- **Three-valued logic**: missing values evaluate to *unknown*; a rule that would fire but can't be confirmed yields `needs_review` instead of a confident verdict. Our UX equivalent: a "판정 보류 — 직접 확인" state instead of a forced pass/fail.
- **LLM assertions as derived fields**: judgments that can't reduce to comparisons (their example: "no one who appears under 25") are manufactured as derived fields with a precise yes/no judge instruction, answered inside the same single extraction call — the engine stays pure. For us: "the answer addresses the question's actual intent" becomes one derived judged field in the answer schema.
- **Answer schema (derived from this pattern)**: typed fields per user answer — restatement_present, conclusion_first, criterion_or_number_present, options_returned, filler_hits[] (from rule patterns), plus the derived intent_match judgment. The deterministic engine then applies the 4-element and correction rules over these fields; the model is used for extraction and generation, never for the verdict itself.
- **Versioned, diffable rule artifacts you can replay**, evaluated against labeled samples — i.e. pack changes go through TEST-CASES like code changes.

---

Sources (all accessed 2026-11-02): Claude Code best practices; Models overview; Managed Agents overview; Managed Agents quickstart; Agent SDK overview; Building effective agents; Effective context engineering for AI agents; Claude Cookbook (index + the two recipes in §10, read in full); claude.dev (front page). URLs as given in the resource list shared by the user.
