// Side panel (添削 | ノート) re-draws the latest review; chat bubbles stay the source. Desktop: beside the chat.
// Mobile: full-screen overlay, opened only by the button, with the chat behind it inert.
import { $, el, state, T, persist, renderReview, renderVerify, renderCompare, renderScript, habitsLine, renderRail, JP_STEPS, stepName } from "./render.js";
import { addListen } from "./voice.js";

export const panel = $("panel");
const toggle = $("panelToggle");
export const wide = matchMedia("(min-width: 1024px)");
const PANEL_CLOSED = "mensetsu-panel-closed"; // the user closed it once in this tab: no more auto-open (sessionStorage)
function syncInert() {
  const cover = !panel.hidden && !wide.matches;
  for (const e of [document.querySelector(".bar"), $("log"), $("composer")]) e.inert = cover;
}
wide.addEventListener("change", syncInert);
// Open/closed shows as an icon swap (panel ↔ x), never as a background fill.
function expanded(on) {
  toggle.setAttribute("aria-expanded", String(on));
  toggle.querySelector("use").setAttribute("href", `/icons.svg#${on ? "x" : "panel"}`);
}
function openPanel() {
  panel.hidden = false;
  expanded(true);
  syncInert();
  if (!wide.matches) panel.querySelector('[role=tab][aria-selected="true"]').focus();
}
export function closePanel() {
  // Only a desktop close counts: closing the phone overlay is just the way back to the chat.
  if (wide.matches) try { sessionStorage.setItem(PANEL_CLOSED, "1"); } catch {}
  panel.hidden = true;
  expanded(false);
  syncInert();
  toggle.focus();
}
toggle.addEventListener("click", () => (panel.hidden ? openPanel() : closePanel()));
$("panelClose").addEventListener("click", closePanel);
const tabs = [$("tabReview"), $("tabNotes")];
function selectTab(tab) {
  for (const x of tabs) {
    x.setAttribute("aria-selected", String(x === tab));
    x.tabIndex = x === tab ? 0 : -1;
    $(x.getAttribute("aria-controls")).hidden = x !== tab;
  }
  tab.focus();
}
for (const x of tabs) {
  x.addEventListener("click", () => selectTab(x));
  x.addEventListener("keydown", (e) => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") selectTab(tabs[1 - tabs.indexOf(x)]); });
}
// Layout B: on desktop the panel is open by default once a session has questions (empty state until the first
// review), unless the user closed it once. Called right after renderQuestions(); a phone never opens it by itself.
export function openByDefault() {
  renderGuide(); // the tour opens the panel without a session: the 4-step guide still fills it
  let closedByUser = false;
  try { closedByUser = sessionStorage.getItem(PANEL_CLOSED) === "1"; } catch {}
  if (wide.matches && panel.hidden && !closedByUser) openPanel();
}
// 添削 tab = one document of the latest attempt: ①② review, ③ model script (when there is one), ④ first ↔ latest.
// Copies of the chat cards without bubble styling; ③ gets its own 🔊 (review M3: the panel copy is the readable one).
export function showReview(r, cmp, script) {
  const rv = el("div");
  renderReview(r, rv);
  rv.className = "script review";
  const habits = habitsLine();
  if (habits) { const p = el("p", "tr"); p.append(...habits); rv.append(p); }
  const parts = [rv];
  if (script) { const s = el("div"); renderScript(script, s); s.className = "script"; addListen(s, script.text, script.ttsSig); parts.push(s); }
  if (cmp) {
    const c = renderCompare(cmp, el("div"));
    c.className = "compare";
    c.firstChild.prepend("④ "); // ①②③ are in the i18n titles; the chat compare card keeps its plain title
    parts.push(c);
  }
  $("reviewBox").replaceChildren(...parts);
  $("reviewEmpty").hidden = true;
}

// F15: the script check takes the 添削 tab. One of the two is missing when its call failed.
export function showVerify(review, verify) {
  const parts = [];
  if (review) { const rv = el("div"); renderReview(review, rv, true); rv.className = "script review"; parts.push(rv); }
  if (verify) { const v = el("div"); renderVerify(verify, v); v.className = "script verify"; parts.push(v); }
  $("reviewBox").replaceChildren(...parts);
  $("reviewEmpty").hidden = true;
}

// ノート tab: a free memo per question (the one being practiced, else the last one answered). Kept in the session,
// saved 400ms after typing stops, exported under that question, cleared with the session.
const note = $("note");
let noteTimer = 0;
// Before the first review the 添削 tab is not blank (UIUX §11.3): the question being practised and the 4-step structure.
// CSS hides this guide once #reviewEmpty is hidden (a review is shown).
function renderGuide() {
  const q = state.current, t = T();
  const parts = q ? [el("p", "ja", `Q${q.id.slice(1)}. ${q.question}`), ...(q.question_tr ? [el("p", "tr", q.question_tr)] : [])] : [];
  const ol = el("ol", "guide-steps");
  for (const s of state.session?.pack?.steps ?? JP_STEPS) ol.append(el("li", null, `${stepName(s, " — ")}${s.optional ? ` (${t.review.recommended})` : ""}`));
  $("reviewGuide").replaceChildren(...parts, el("p", "title", t.panel.guide), ol);
}
export function renderNotes() {
  renderGuide();
  const session = state.session;
  const q = state.current ?? session?.questions.find((x) => x.id === session.attempts.at(-1)?.question_id);
  const on = Boolean(session && q);
  $("notesEmpty").hidden = on;
  $("noteBox").hidden = !on;
  $("noteStatus").textContent = "";
  if (!on) return;
  $("noteLabel").textContent = T().notes.title({ n: q.id.slice(1) });
  note.placeholder = T().notes.placeholder;
  note.dataset.qid = q.id;
  note.value = session.notes?.[q.id] ?? "";
}
note.addEventListener("input", () => {
  if (!state.session) return;
  (state.session.notes ??= {})[note.dataset.qid] = note.value;
  $("noteStatus").textContent = "";
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => { if (state.session) $("noteStatus").textContent = persist() ? T().notes.saved : T().notes.saveFailed; }, 400);
});
export function resetPanel() {
  $("reviewBox").replaceChildren();
  $("reviewEmpty").hidden = false;
  panel.hidden = toggle.hidden = true;
  expanded(false);
  syncInert();
  renderRail(); // no session (finished, reset, or the demo left) → the rail's 3-step guide
}
