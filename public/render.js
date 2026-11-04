// Shared state and the chat cards. Leaf module: imports only i18n, export.js and session.js.
import { LANGS } from "./i18n/index.js";
import { habitCounts, statusOf } from "./export.js";
import { saveSession } from "./session.js";

export const $ = (id) => document.getElementById(id);
const log = $("log");

// The one state object shared by app.js, panel.js and demo.js; module-local state stays in its module.
export const state = {
  lang: "ko", // set by app.js before anything renders
  session: null, // { company_context, questions, attempts }
  current: null, // question being answered
  tour: null, // { i, marks, targets, scenes } while the tour plays
  epoch: 0, // bumped by resetChat(); a response that started in an older epoch is dropped, never drawn
  demoActive: false, // the no-code demo is on screen and counts as history for the reset dialog
};
export const T = () => LANGS[state.lang];
// Server returns codes; the sentence comes from the selected language file.
export const message = (d) => (T().errors[d?.code] ?? T().errors.unknown)(d ?? {});

// Reading the localStorage property itself throws where storage is blocked; session.js handles a null store.
export const LS = (() => { try { return localStorage; } catch { return null; } })();
export const persist = () => saveSession(LS, state.session); // false = not saved; the paid result on screen stays valid

export const targetOf = () => state.session?.pack?.target ?? "ja"; // interview language; the demo and old sessions are Japan
// question_tr is absent when the interview language is the screen language (2-axis rule).
export const withTr = (q) => (q.question_tr ? `${q.question}\n(${q.question_tr})` : q.question);
export const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text; // textContent only: model output is never parsed as HTML
  return e;
}
// Duotone sprite icon (public/icons.svg, Phosphor MIT). Decorative: the text or aria-label beside it carries the meaning.
const SVG = "http://www.w3.org/2000/svg";
export function icon(name) {
  const svg = document.createElementNS(SVG, "svg"), use = document.createElementNS(SVG, "use");
  svg.setAttribute("class", "icon");
  svg.setAttribute("aria-hidden", "true");
  use.setAttribute("href", `/icons.svg#${name}`);
  svg.append(use);
  return svg;
}
// el() with an icon in front of the text.
export const iel = (tag, cls, name, text) => { const e = el(tag, cls); e.append(icon(name), text); return e; };

export function bubble(cls, text) {
  const b = el("div", `msg ${cls}`, text);
  // Role label above the row (CSS ::before, so textContent stays the message). Errors are the app's, not the coach's.
  const who = cls.split(" ")[0];
  if (who !== "err") b.dataset.role = who === "me" ? T().ui.roleMe : T().ui.roleCoach;
  if (state.tour && !still()) b.classList.add("appear");
  log.append(b);
  log.scrollTop = log.scrollHeight;
  return b;
}

// Waiting bubble: three dots right away; the stage label only after 3 s, so a quick reply never flashes text.
// fill() swaps the class, so a slot already filled by its card never gets the label.
export function waiting(label) {
  const b = bubble("coach typing", null);
  const dots = el("span", "dots");
  dots.setAttribute("aria-hidden", "true");
  dots.append(el("i"), el("i"), el("i"));
  const text = el("span", "wait-label", label);
  text.hidden = true;
  b.append(dots, text);
  setTimeout(() => {
    if (!b.classList.contains("typing")) return;
    text.hidden = false;
    log.scrollTop = log.scrollHeight; // the label can wrap the bubble onto a second line
  }, 3000);
  return b;
}

// Display order and labels of the 4 steps: the session's pack (from /api/questions), else packs/jp.json.
export const JP_STEPS = [
  { key: "fukusho", label: "復唱", optional: true },
  { key: "ketsuron", label: "結論" },
  { key: "kijun", label: "基準・数字" },
  { key: "sentakushi", label: "締め" },
];

// One card per question with a [練習する] button (UIUX §11.2); app.js handles every button[data-pick] (cards, rail,
// quick replies) like a typed number. Cards of an earlier set, and the demo's, cannot start a practice.
export function renderQuestions(data) {
  const { company_context: c, questions, specificity } = data;
  const t = T();
  for (const old of log.querySelectorAll("button[data-pick]")) old.disabled = true;
  const b = bubble("coach qs", t.chat.questionsMade({ company: c.company, position: c.position, count: questions.length }));
  // F7: always shown (also on the demo and a restored session), not only when the gate fails.
  if (specificity) b.append(el("p", "legend", t.chat.specificity({ n: specificity.referenced, total: questions.length })));
  for (const q of questions) {
    const item = el("div", "q");
    item.append(el("span", "tag", t.stages[q.stage] ?? q.stage), el("span", "tag", t.categories[q.category] ?? q.category));
    item.append(el("p", "ja", `${q.id.slice(1)}. ${q.question}`));
    if (q.question_tr) item.append(el("p", "tr", q.question_tr));
    item.append(el("p", "basis", `${t.chat.basis}: ${q.basis}`));
    const go = el("button", "inline-btn practice", t.chat.practice);
    go.type = "button";
    go.dataset.pick = q.id.slice(1);
    go.disabled = state.demoActive;
    item.append(go);
    b.append(item);
  }
  renderRail(state.session ?? data);
  $("panelToggle").hidden = false;
  log.scrollTop = log.scrollHeight;
  return b;
}

// Question rail (≥1280px, UIUX §11.3): progress and ○/✗/✓ per question; no question set → the 3-step guide.
const STATUS_ICON = { todo: "circle", miss: "x", ok: "check" };
export function renderRail(src = state.session) {
  $("railGuide").hidden = Boolean(src);
  $("railList").hidden = !src;
  if (!src) return $("railItems").replaceChildren();
  const t = T(), set = { ...src, attempts: src.attempts ?? [] };
  const status = src.questions.map((q) => statusOf(set, q.id));
  const done = status.filter((x) => x !== "todo").length;
  $("railProgress").textContent = t.rail.progress({ n: done, total: src.questions.length });
  Object.assign($("railBar"), { max: src.questions.length, value: done });
  $("railItems").replaceChildren(...src.questions.map((q, i) => {
    const b = el("button", "rail-q");
    b.type = "button";
    b.dataset.pick = q.id.slice(1);
    b.dataset.status = status[i];
    b.disabled = state.demoActive;
    if (q.id === state.current?.id) b.setAttribute("aria-current", "true");
    // Needs work / Done are visible words beside the icon (benchmark 11/04); "Not started" is screen-reader text only
    // (the ○ shape already differs from ✗ and ✓, and nine "Not started" labels would crowd out the category).
    b.append(icon(STATUS_ICON[status[i]]), el("span", status[i] === "todo" ? "rail-status vh" : "rail-status", t.rail[status[i]]), el("span", "rail-meta", `Q${q.id.slice(1)} · ${t.categories[q.category] ?? q.category}`), el("span", "rail-text", q.question));
    const li = el("li");
    li.append(b);
    return li;
  }));
}

// <details> fold appended to a card; returns its body (class cls) for the folded content.
export function fold(card, label, cls) {
  const d = el("details", "fold"), body = el("div", cls);
  d.append(el("summary", null, label), body);
  card.append(d);
  return body;
}

// Cards are created in ①②③ order up front and filled as each response lands.
export function fill(slot, cls) {
  slot.className = `msg ${cls}${slot.classList.contains("appear") ? " appear" : ""}`; // keep the tour's fade-in
  slot.textContent = "";
  if (cls === "err") delete slot.dataset.role; // a waiting row that failed is the app's error, not the coach
  return slot;
}

// The pack's (Japanese) step label next to its name in the screen language. On a Japanese screen the two can say the
// same thing (結論 / 結論, 締め / 締め方): a name that contains the other is shown alone (layout check 11/04).
export function stepName(step, sep = " ") {
  const local = T().steps[step.key];
  if (!local || local.includes(step.label)) return local || step.label;
  if (step.label.includes(local)) return step.label;
  return `${step.label}${sep}${local}`;
}

const VERDICT_ICON = { yes: "check", no: "warning", unclear: "question" };
// English UI (benchmark 11/04: LinkedIn readiness, strengths → areas to improve, "not a grade"): a summary from the same
// review data, no extra AI call. Readiness: off-topic → low; on topic with every required step → high; else medium.
function summary(r) {
  const t = T().review, steps = state.session?.pack?.steps ?? JP_STEPS, name = (s) => T().steps[s.key];
  const missing = steps.filter((s) => !s.optional && !r.steps[s.key]?.present);
  const level = r.answers_question === "no" ? "low" : r.answers_question === "yes" && !missing.length ? "high" : "medium";
  const has = steps.filter((s) => r.steps[s.key]?.present);
  const out = [el("p", `readiness ${level}`, t.readiness({ level: t.levels[level] })), el("p", "legend", t.signal)];
  if (has.length) out.push(iel("p", "sum ok", "check", `${t.strengths}: ${has.map(name).join(", ")}`));
  if (missing.length) out.push(iel("p", "sum miss", "x", `${t.improve}: ${missing.map(name).join(", ")}`));
  return out;
}
export function renderReview(r, slot) {
  const t = T().review;
  const b = fill(slot, "coach script review");
  b.append(el("p", "title", t.title));
  if (T().ui.western) b.append(...summary(r));
  b.append(iel("p", `verdict ${r.answers_question}`, VERDICT_ICON[r.answers_question] ?? "question", t.answers[r.answers_question]), el("p", "tr", r.answers_question_reason));
  // PRD §16-15: an optional step (復唱) that is missing is a tip, not ✗; the last step is named by r.closing.
  const steps = state.session?.pack?.steps ?? JP_STEPS;
  steps.forEach((step, i) => {
    const v = r.steps[step.key];
    const name = `${stepName(step)}${i === steps.length - 1 && r.closing ? ` · ${T().closings[r.closing]}` : ""}`;
    if (v.present) b.append(iel("p", "step ok", "check", name));
    else if (step.optional) b.append(iel("p", "step tip", "tip", `${name} (${t.recommended})`), el("p", "hint", `${t.tip}: ${v.note}`));
    else b.append(iel("p", "step miss", "x", name), el("p", "hint", `→ ${v.note}`));
  });
  // English UI: ② starts folded, its count in the title (benchmark 11/04, progressive disclosure); chat and panel alike.
  const into = T().ui.western ? fold(b, `${t.corrections} (${r.corrections.length})`, "script review fold-body") : (b.append(el("p", "title", t.corrections)), b);
  if (!r.corrections.length) into.append(el("p", "tr", t.noCorrections));
  for (const c of r.corrections) {
    into.append(el("p", "rule", `【${c.rule_id}】`), el("p", "ja", `${c.before} → ${c.after}`), el("p", "tr why", c.reason)); // .why: margin note in the panel
  }
  // F7: the server drops corrections whose `before` is not in the answer; 0 is shown too, so the gate is visible.
  if (r.dropped != null) into.append(el("p", "legend", t.dropped({ n: r.dropped })));
  log.scrollTop = log.scrollHeight;
}

// Before/after (UIUX-SPEC (e)): first vs latest reviewed attempt at one question, from compareAttempts().
export function renderCompare(c, slot) {
  const t = T().compare;
  const b = fill(slot, "coach compare");
  const cell = (ok, name) => { const td = el("td", ok ? "cmp-ok" : "cmp-miss"); td.append(icon(name)); return td; };
  const row = (label, a, z) => { const r = el("tr"); r.append(el("th", null, label), a, z); return r; };
  const head = el("thead"), body = el("tbody"), table = el("table", "cmp");
  head.append(row("", el("th", null, t.first), el("th", null, t.last)));
  body.append(row(t.answered, ...c.answered.map((v) => cell(v === "yes", VERDICT_ICON[v] ?? "question"))));
  const mark = (ok, s) => cell(ok, ok ? "check" : s.optional ? "tip" : "x");
  for (const s of c.steps) body.append(row(stepName(s), mark(s.first, s), mark(s.last, s)));
  table.append(head, body);
  const answers = el("div", "cmp-answers");
  c.answers.forEach((a, i) => { const box = el("div", "cmp-answer"); box.append(el("p", "label", i ? t.last : t.first), el("p", "ja", a)); answers.append(box); });
  b.append(el("p", "title", t.title({ n: c.n })), table, answers);
  log.scrollTop = log.scrollHeight;
  return b;
}

export function renderScript(s, slot) {
  const t = T().script;
  const b = fill(slot, "coach script");
  // English UI: ③ starts folded with its title as the summary; 🔊 (added to the card later) stays outside the fold and
  // opens it, so the read-along highlight is visible.
  let into = b;
  if (T().ui.western) {
    into = fold(b, t.title, "script fold-body");
    // composedPath: the button swaps its icon on click, so e.target may already be detached when the event gets here.
    b.addEventListener("click", (e) => { if (e.composedPath().some((n) => n.classList?.contains("listen") || n.classList?.contains("readaloud"))) into.parentElement.open = true; });
  } else b.append(el("p", "title", t.title));
  into.append(el("p", "label", t.text[targetOf()]), el("p", "ja", s.text));
  // Same language as the screen (e.g. Japan + Japanese): the server sends no reading or translation.
  if (s.reading != null) into.append(el("p", "label", t.reading[targetOf()]), el("p", "reading", s.reading), el("p", "legend", t.legend));
  if (s.translation != null) into.append(el("p", "label", t.translation), el("p", "tr", s.translation));
  const ul = el("ul", "points");
  for (const p of s.points) ul.append(el("li", null, p));
  into.append(el("p", "label pts", t.points), ul); // .pts + .points: margin note in the panel
  log.scrollTop = log.scrollHeight;
}

// F9: one line after each answer with the running count of rule hits in this session. Nodes (icons), or null when empty.
export function habitsLine() {
  const h = state.session ? habitCounts(state.session) : [];
  if (!h.length) return null;
  const t = T().habits;
  const out = [icon("habits"), `${t.title({ n: state.session.attempts.length })}\n`];
  h.forEach((x, i) => {
    const s = el("span", "habit", `${x.label} ${t.times({ c: x.count })}`);
    if (x.habit) s.append(icon("warning"));
    out.push(...(i ? [" · "] : []), s);
  });
  return out;
}
