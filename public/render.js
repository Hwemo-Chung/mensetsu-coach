// Shared state and the chat cards. Leaf module: imports only i18n, export.js and session.js.
import { LANGS } from "./i18n/index.js";
import { habitCounts, statusOf, basisTag, practiceTime } from "./export.js";
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
    if (!b.isConnected || !b.classList.contains("typing")) return; // a removed bubble keeps its class, and this scroll would undo a card's scroll to its top
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
  const { company_context: c, questions, specificity, research_basis } = data;
  const t = T();
  for (const old of log.querySelectorAll("button[data-pick], .calendar-open")) old.disabled = true;
  const b = bubble("coach qs", t.chat.questionsMade({ company: c.company, position: c.position, count: questions.length }));
  // F7: always shown (also on the demo and a restored session), not only when the gate fails.
  if (specificity) b.append(el("p", "legend", t.chat.specificity({ n: specificity.referenced, total: questions.length })));
  if (research_basis) b.append(el("p", "legend research-refs", t.chat.researchRefs({ n: research_basis.referenced, total: questions.length })));
  for (const q of questions) {
    const item = el("div", "q");
    item.dataset.q = q.id;
    item.append(el("span", "tag", t.stages[q.stage] ?? q.stage), el("span", "tag", t.categories[q.category] ?? q.category));
    if (basisTag(q, t)) {
      const tag = item.appendChild(el("span", "tag", basisTag(q, t)));
      if (q.basis_type === "research") tag.dataset.afterRerun = q.reported ? "reported" : "stale";
    }
    item.append(el("p", "ja", `${q.id.slice(1)}. ${q.question}`));
    if (q.question_tr) item.append(el("p", "tr", q.question_tr));
    item.append(el("p", "basis", `${t.chat.basis}: ${q.basis}`));
    const go = el("button", "inline-btn practice", t.chat.practice);
    go.type = "button";
    go.dataset.pick = q.id.slice(1);
    go.disabled = state.demoActive;
    item.append(go);
    practiceLog(item, q.id, data.attempts);
    b.append(item);
  }
  // Only the latest set's is live (app.js opens the dialog); the demo's too, since the link needs no server.
  const cal = b.appendChild(el("button", "inline-btn calendar-open", t.calendar.button));
  cal.type = "button";
  renderRail(state.session ?? data);
  $("panelToggle").hidden = false;
  log.scrollTop = log.scrollHeight;
  return b;
}

// The practice record on a question card (DECISIONS 11/06): how many answers and when the last was made; nothing before the first.
export function practiceLog(item, qid, attempts) {
  const mine = (attempts ?? []).filter((a) => a.question_id === qid);
  if (!mine.length) return;
  const p = item.querySelector(".practice-log") ?? item.insertBefore(el("p", "legend practice-log"), item.querySelector(".practice"));
  p.textContent = T().chat.practiced({ n: mine.length, at: practiceTime(mine.at(-1).at) });
}

// The log is history, but a source id on it would now point into the new brief's list.
export function retireBriefMarks() {
  for (const tag of log.querySelectorAll("[data-after-rerun]")) tag.textContent = T().chat.basisType[tag.dataset.afterRerun];
  for (const e of log.querySelectorAll(".research-refs, .msg.reverse")) e.remove();
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

// The same 3 MB limit and shape for the composer's file and the prep dialog's.
export function readAttachment(f, done, tooLarge) {
  if (f.size > 3 * 1024 * 1024) return tooLarge(message({ code: "attachment_too_large", max_mb: 3 }));
  const reader = new FileReader();
  reader.onload = () => done({ name: f.name, type: f.type, data: String(reader.result).split(",")[1] });
  reader.readAsDataURL(f);
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
// checking: the F15 result numbers the same parts ①②③, with ④⑤ in the card after it.
export function renderReview(r, slot, checking = false) {
  const t = T().review, v = T().verify;
  const b = fill(slot, "coach script review");
  b.append(el("p", "title", checking ? v.answers : t.title));
  if (T().ui.western) b.append(...summary(r));
  b.append(iel("p", `verdict ${r.answers_question}`, VERDICT_ICON[r.answers_question] ?? "question", t.answers[r.answers_question]), el("p", "tr", r.answers_question_reason));
  if (checking) b.append(el("p", "title", v.steps));
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
  const corrections = checking ? v.corrections : t.corrections;
  const into = T().ui.western ? fold(b, `${corrections} (${r.corrections.length})`, "script review fold-body") : (b.append(el("p", "title", corrections)), b);
  if (!r.corrections.length) into.append(el("p", "tr", t.noCorrections));
  for (const c of r.corrections) {
    into.append(el("p", "rule", `【${c.rule_id}】`), el("p", "ja", `${c.before} → ${c.after}`), el("p", "tr why", c.reason)); // .why: margin note in the panel
  }
  // F7: the server drops corrections whose `before` is not in the answer; 0 is shown too, so the gate is visible.
  if (r.dropped != null) into.append(el("p", "legend", t.dropped({ n: r.dropped })));
  log.scrollTop = log.scrollHeight;
}

// F15 ④⑤ from /api/verify. ④ is a range at the pack's slow and fast speeds; only running over warns (user decision 11/06), a condition question has no target.
export function renderVerify(d, slot) {
  const t = T().verify, b = fill(slot, "coach script verify");
  b.append(el("p", "title", t.time));
  if (d.seconds == null) b.append(el("p", "tr", t.noTime));
  else {
    const [lo, hi] = d.seconds, [fast, slow] = d.rate, range = t.seconds({ chars: d.chars, lo, hi, fast: fast.toFixed(1), slow: slow.toFixed(1) }), target = d.target_seconds;
    if (target == null) b.append(el("p", "tr", `${range} — ${t.noTarget}`));
    else b.append(iel("p", `step ${d.over ? "tip" : "ok"}`, d.over ? "tip" : "check", `${range} — ${d.over ? t.longer({ n: Math.max(1, lo - target), target }) : t.within({ target })}`));
  }
  b.append(el("p", "tr", d.blanks ? t.blanks({ n: d.blanks }) : t.noBlanks));
  b.append(el("p", "title", t.grounds));
  if (d.failed) b.append(el("p", "err", message({ code: d.failed }))); // the model failed: ④ above is the code's and stays
  else if (!d.checked) b.append(el("p", "tr", t.noMaterial));
  else if (d.unsupported.length) b.append(el("p", "legend", t.notALie));
  else if (!d.dropped && !d.blanks) b.append(el("p", "tr", t.allFound)); // only when nothing went unchecked
  for (const u of d.unsupported) b.append(el("p", "ja", u.sentence), el("p", "tr why", `${t.kinds[u.kind]}: ${t.notFound}`));
  if (d.dropped) b.append(el("p", "legend", t.dropped({ n: d.dropped })));
  if (d.checked && d.blanks) b.append(el("p", "legend", t.blanksUnchecked({ n: d.blanks })));
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

// The /api/verify check of the script against the user's answer (app.js checkScript): s.check = { unsupported, dropped? } after the call, null when it
// failed, absent when it never ran or has not ended (the demo, an older session, a reload mid-check) — then the line is there but hidden, and app.js fills it while the call runs.
export function scriptCheck(s) {
  const t = T().script, p = el("p", "script-check legend");
  if (s.check === undefined) p.hidden = true;
  else if (s.check === null) p.textContent = t.unchecked;
  else if (!s.check.unsupported.length) p.textContent = s.check.dropped ? T().verify.dropped({ n: s.check.dropped }) : t.checked; // dropped flags went unchecked: never "nothing unsupported"
  else {
    p.className = "script-check warn"; // not .caution: that class is the code's word check, one line per card
    p.append(t.unsupported);
    for (const u of s.check.unsupported) p.append(el("br"), `「${u.sentence}」（${T().verify.kinds[u.kind] ?? u.kind}）`);
    if (s.check.dropped) p.append(el("br"), T().verify.dropped({ n: s.check.dropped }));
  }
  return p;
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
  if (s.unbacked?.length) into.append(el("p", "caution", `${t.unbacked} 「${s.unbacked.join("」「")}」`));
  into.append(scriptCheck(s));
  // Same language as the screen (e.g. Japan + Japanese): the server sends no reading or translation.
  if (s.reading != null) into.append(el("p", "label", t.reading[targetOf()]), el("p", "reading", s.reading), el("p", "legend", t.legend));
  if (s.translation != null) into.append(el("p", "label", t.translation), el("p", "tr", s.translation));
  if (s.points?.length) {
    const ul = el("ul", "points");
    for (const p of s.points) ul.append(el("li", null, p));
    into.append(el("p", "label pts", t.points), ul); // .pts + .points: margin note in the panel
  }
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
