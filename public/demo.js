// No-code demo and tutorial: replays a real recorded run (public/demo/demo-<lang>.json). No API, no session, no storage.
import { $, el, icon, state, T, message, bubble, still, withTr, renderQuestions, renderReview, renderCompare, renderScript } from "./render.js";
import { showReview, resetPanel, openByDefault } from "./panel.js";
import { compareAttempts } from "./export.js";

const log = $("log"), input = $("input"), send = $("send");

// ⚙ Options: tutorial tips (default on). Unreadable storage counts as on.
export const TOUR_TIPS = "mensetsu-tour-tips";
export const tourTipsOn = () => { try { return localStorage.getItem(TOUR_TIPS) !== "0"; } catch { return true; } };

// Tutorial tips on (default): coach-mark tour. Off: the plain replay with an explanation bubble per step.
// onTry = app.js askForCode, passed in so this module does not import app.js.
export async function startDemo(onTry) {
  const my = state.epoch;
  state.demoActive = true;
  let d;
  try {
    d = await (await fetch(`/demo/demo-${state.lang}.json`)).json();
  } catch {
    state.demoActive = false;
    return bubble("err", message({ code: "network" }));
  }
  if (my !== state.epoch) return;
  const t = T().demo;
  bubble("coach demo-banner", t.banner);
  if (tourTipsOn()) return startTour(d, my, onTry);
  const notes = [t.mail, t.pick, t.bad, t.script, t.good];
  const scenes = demoScenes(d, async (text) => (bubble("me", text), my === state.epoch), onTry);
  let i = 0;
  const next = async () => {
    if (i < notes.length) bubble("coach note", notes[i]);
    await scenes[i++]();
    if (my !== state.epoch || i >= scenes.length) return;
    const btn = el("button", "inline-btn next-btn", t.next);
    btn.append(icon("play"));
    btn.type = "button";
    btn.addEventListener("click", () => { btn.remove(); next(); });
    log.append(btn);
    log.scrollTop = log.scrollHeight;
  };
  next();
}

// The six demo steps. `me(text, typed)` shows the user's input and resolves false if the demo was left meanwhile.
// Each step returns the element the tour spotlights.
function demoScenes(d, me, onTry) {
  const t = T().demo, q = d.questions[d.pick];
  const cmp = compareAttempts({ attempts: d.steps.map((x) => ({ question_id: q.id, ...x })) }, q.id);
  const reviewed = (r) => { const b = bubble("coach", ""); renderReview(r, b); return b; };
  return [
    async () => { if (!(await me(d.mail.length > 300 ? `${d.mail.slice(0, 300)}…` : d.mail, false))) return; const b = renderQuestions(d); openByDefault(); return b; },
    async () => { if (!(await me(String(d.pick + 1), true))) return; bubble("coach", `Q${d.pick + 1}. ${withTr(q)}`); return input; },
    async () => { if (!(await me(d.steps[0].answer, true))) return; const b = reviewed(d.steps[0].review); showReview(d.steps[0].review); return b; },
    async () => { const b = bubble("coach", ""); renderScript(d.steps[0].script, b); showReview(d.steps[0].review, null, d.steps[0].script); return b; },
    async () => {
      if (!(await me(d.steps[1].answer, true))) return;
      reviewed(d.steps[1].review);
      const c = renderCompare(cmp, bubble("coach", ""));
      showReview(d.steps[1].review, cmp);
      return c;
    },
    async () => {
      const b = bubble("coach note", t.done);
      const btn = el("button", "inline-btn", t.try);
      btn.type = "button";
      btn.addEventListener("click", () => { btn.disabled = true; state.demoActive = false; endTour(); resetPanel(); onTry(); });
      b.append(el("br"), btn);
      return btn;
    },
  ];
}

// Tutorial (UIUX-SPEC (k), option A): popup n/6 above the composer, spotlight on the step's element, typing in the
// composer, fading cards. prefers-reduced-motion: no typing, no fade (the spotlight is not motion and stays).
const tourBox = $("tour");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function unspot() { for (const e of document.querySelectorAll(".spot")) e.classList.remove("spot"); }
function spot(e) {
  unspot();
  if (!e) return;
  e.classList.add("spot");
  e.scrollIntoView({ block: "start" }); // "center" pushes the top of a tall card (the key line) off a phone screen
}
function startTour(d, my, onTry) {
  const tr = { i: 0, marks: [], panels: [], targets: [] };
  const me = async (text, typed) => {
    if (typed && !still()) {
      spot(input);
      // At most 60 characters × 25ms = 1.5s; a longer answer lands in one go after that.
      for (let k = 1; k <= Math.min(text.length, 60); k++) {
        input.value = text.slice(0, k);
        await sleep(25);
        if (state.tour !== tr) return false;
      }
      input.value = "";
    }
    if (state.tour !== tr || my !== state.epoch) return false;
    bubble("me", text);
    return true;
  };
  tr.scenes = demoScenes(d, me, onTry);
  state.tour = tr;
  input.readOnly = true;
  send.disabled = true;
  tourBox.hidden = false;
  play(0);
}
async function play(n) {
  const tr = state.tour;
  tr.i = n;
  tr.marks[n] = log.children.length; // [이전] removes what this step appended
  tr.panels[n] = [...$("reviewBox").children]; // ...and puts back the panel as it was before this step
  showTip(n);
  busy(true);
  const target = await tr.scenes[n]();
  if (state.tour !== tr) return;
  spot((tr.targets[n] = target));
  busy(false);
}
function showTip(n) {
  const t = T().tour, last = n === t.steps.length - 1, next = $("tourNext");
  $("tourStep").textContent = `${n + 1}/${t.steps.length}`;
  $("tourTitle").textContent = t.steps[n].title;
  $("tourBody").textContent = t.steps[n].body;
  $("tourSkip").textContent = t.skip;
  $("tourSkip").hidden = last;
  $("tourPrev").textContent = t.prev;
  next.replaceChildren(...(last ? [t.close] : [T().demo.next, icon("play")]));
  next.classList.toggle("next-btn", !last);
  tourBox.focus();
}
// Buttons wait while a step types or draws; a click (or a test's click) simply waits for them to be enabled.
function busy(on) {
  $("tourNext").disabled = on;
  $("tourPrev").disabled = on || state.tour.i === 0;
}
export function endTour() {
  if (!state.tour) return;
  state.tour = null;
  tourBox.hidden = true;
  unspot();
  input.readOnly = false;
  send.disabled = false;
  input.value = "";
  resetPanel(); // the demo's review must not stay in the panel once the tour is over
}
// [건너뛰기]/Esc: close the popup and leave only step 6 (the "enter your code" button).
export function skipTour() {
  const tr = state.tour;
  if (!tr) return;
  endTour();
  if (tr.i < tr.scenes.length - 1) tr.scenes.at(-1)();
}
$("tourNext").addEventListener("click", () => {
  const tr = state.tour;
  if (!tr) return;
  if (tr.i === tr.scenes.length - 1) return endTour();
  play(tr.i + 1);
});
$("tourPrev").addEventListener("click", () => {
  const tr = state.tour;
  if (!tr || tr.i === 0) return;
  while (log.children.length > tr.marks[tr.i]) log.lastElementChild.remove();
  const before = tr.panels[tr.i];
  $("reviewBox").replaceChildren(...before);
  $("reviewEmpty").hidden = before.length > 0;
  tr.i--;
  showTip(tr.i);
  spot(tr.targets[tr.i]);
  busy(false);
});
$("tourSkip").addEventListener("click", skipTour);
