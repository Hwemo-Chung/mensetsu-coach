// Shared state and the chat cards. Leaf module: imports only i18n, export.js and session.js.
import { LANGS } from "./i18n/index.js";
import { habitCounts } from "./export.js";
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
export function bubble(cls, text) {
  const b = el("div", `msg ${cls}`, text);
  if (state.tour && !still()) b.classList.add("appear");
  log.append(b);
  log.scrollTop = log.scrollHeight;
  return b;
}

// Display order and labels of the 4 steps: the session's pack (from /api/questions), else packs/jp.json.
const JP_STEPS = [
  { key: "fukusho", label: "復唱" },
  { key: "ketsuron", label: "結論" },
  { key: "kijun", label: "基準・数字" },
  { key: "sentakushi", label: "選択肢" },
];

export function renderQuestions({ company_context: c, questions, specificity }) {
  const t = T();
  const b = bubble("coach", t.chat.questionsMade({ company: c.company, position: c.position, count: questions.length }));
  // F7: always shown (also on the demo and a restored session), not only when the gate fails.
  if (specificity) b.append(el("p", "legend", t.chat.specificity({ n: specificity.referenced, total: questions.length })));
  for (const q of questions) {
    const item = el("div", "q");
    item.append(el("span", "tag", t.stages[q.stage] ?? q.stage), el("span", "tag", t.categories[q.category] ?? q.category));
    item.append(el("p", "ja", `${q.id.slice(1)}. ${q.question}`));
    if (q.question_tr) item.append(el("p", "tr", q.question_tr));
    item.append(el("p", "basis", `${t.chat.basis}: ${q.basis}`));
    b.append(item);
  }
  $("panelToggle").hidden = false;
  log.scrollTop = log.scrollHeight;
  return b;
}

// Cards are created in ①②③ order up front and filled as each response lands.
export function fill(slot, cls) {
  slot.className = `msg ${cls}${slot.classList.contains("appear") ? " appear" : ""}`; // keep the tour's fade-in
  slot.textContent = "";
  return slot;
}

export function renderReview(r, slot) {
  const t = T().review;
  const b = fill(slot, "coach script review");
  b.append(el("p", "title", t.title));
  b.append(el("p", `verdict ${r.answers_question}`, t.answers[r.answers_question]), el("p", "tr", r.answers_question_reason));
  for (const step of state.session?.pack?.steps ?? JP_STEPS) {
    const v = r.steps[step.key];
    b.append(el("p", `step ${v.present ? "ok" : "miss"}`, `${v.present ? "✓" : "✗"} ${step.label} ${T().steps[step.key]}`));
    if (!v.present) b.append(el("p", "hint", `→ ${v.note}`));
  }
  b.append(el("p", "title", t.corrections));
  if (!r.corrections.length) b.append(el("p", "tr", t.noCorrections));
  for (const c of r.corrections) {
    b.append(el("p", "rule", `【${c.rule_id}】`), el("p", "ja", `${c.before} → ${c.after}`), el("p", "tr", c.reason));
  }
  // F7: the server drops corrections whose `before` is not in the answer; 0 is shown too, so the gate is visible.
  if (r.dropped != null) b.append(el("p", "legend", t.dropped({ n: r.dropped })));
  log.scrollTop = log.scrollHeight;
}

// Before/after (UIUX-SPEC (e)): first vs latest reviewed attempt at one question, from compareAttempts().
export function renderCompare(c, slot) {
  const t = T().compare, mark = { yes: "✓", no: "⚠", unclear: "?" };
  const b = fill(slot, "coach compare");
  const cell = (ok, text) => el("td", ok ? "cmp-ok" : "cmp-miss", text);
  const row = (label, a, z) => { const r = el("tr"); r.append(el("th", null, label), a, z); return r; };
  const head = el("thead"), body = el("tbody"), table = el("table", "cmp");
  head.append(row("", el("th", null, t.first), el("th", null, t.last)));
  body.append(row(t.answered, ...c.answered.map((v) => cell(v === "yes", mark[v] ?? "?"))));
  for (const s of c.steps) body.append(row(`${s.label} ${T().steps[s.key]}`, cell(s.first, s.first ? "✓" : "✗"), cell(s.last, s.last ? "✓" : "✗")));
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
  b.append(el("p", "title", t.title));
  b.append(el("p", "label", t.text[targetOf()]), el("p", "ja", s.text));
  // Same language as the screen (e.g. Japan + Japanese): the server sends no reading or translation.
  if (s.reading != null) b.append(el("p", "label", t.reading[targetOf()]), el("p", "reading", s.reading), el("p", "legend", t.legend));
  if (s.translation != null) b.append(el("p", "label", t.translation), el("p", "tr", s.translation));
  const ul = el("ul", "points");
  for (const p of s.points) ul.append(el("li", null, p));
  b.append(el("p", "label", t.points), ul);
  log.scrollTop = log.scrollHeight;
}

// F9: one line after each answer with the running count of rule hits in this session.
export function habitsLine() {
  const h = state.session ? habitCounts(state.session) : [];
  if (!h.length) return "";
  const t = T().habits;
  return `${t.title({ n: state.session.attempts.length })}\n${h.map((x) => `${x.label} ${t.times({ c: x.count })}${x.habit ? " ⚠" : ""}`).join(" · ")}`;
}
