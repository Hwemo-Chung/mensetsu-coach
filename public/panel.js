// Side panel (첨삭 | 노트) re-draws the latest review; chat bubbles stay the source. Desktop: beside the chat.
// Mobile: full-screen overlay, opened only by the button, with the chat behind it inert.
import { $, el, state, T, persist, renderReview, renderCompare, habitsLine } from "./render.js";

export const panel = $("panel");
const toggle = $("panelToggle");
export const wide = matchMedia("(min-width: 1024px)");
const PANEL_CLOSED = "mensetsu-panel-closed"; // the user closed it once: no more auto-open
function syncInert() {
  const cover = !panel.hidden && !wide.matches;
  for (const e of [document.querySelector(".bar"), $("log"), $("composer")]) e.inert = cover;
}
wide.addEventListener("change", syncInert);
function openPanel() {
  panel.hidden = false;
  toggle.setAttribute("aria-expanded", "true");
  syncInert();
  if (!wide.matches) panel.querySelector('[role=tab][aria-selected="true"]').focus();
}
export function closePanel() {
  try { localStorage.setItem(PANEL_CLOSED, "1"); } catch {}
  panel.hidden = true;
  toggle.setAttribute("aria-expanded", "false");
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
// 첨삭 tab: the before/after table first (same question answered twice), then the latest review.
// auto=false (restored session) fills the tab without opening the panel.
export function showReview(r, cmp, auto = true) {
  const rv = el("div");
  renderReview(r, rv);
  rv.className = "script review"; // same content as the chat card, without bubble styling
  const habits = habitsLine();
  if (habits) rv.append(el("p", "tr", habits));
  const top = cmp ? [renderCompare(cmp, el("div"))] : [];
  for (const c of top) c.className = "compare";
  $("reviewBox").replaceChildren(...top, rv);
  $("reviewEmpty").hidden = true;
  let closedByUser = false;
  try { closedByUser = localStorage.getItem(PANEL_CLOSED) === "1"; } catch {}
  if (auto && wide.matches && panel.hidden && !closedByUser) openPanel();
}

// 노트 tab: a free memo per question (the one being practiced, else the last one answered). Kept in the session,
// saved 400ms after typing stops, exported under that question, cleared with the session.
const note = $("note");
let noteTimer = 0;
export function renderNotes() {
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
  toggle.setAttribute("aria-expanded", "false");
  syncInert();
}
