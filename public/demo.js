// No-code demo and tutorial: replays a real recorded run (public/demo/demo-<lang>.json; only its "brief" is hand-written, and its card says so). No API, no session, no storage.
import { $, el, icon, state, T, message, bubble, still, withTr, renderQuestions, renderReview, renderCompare, renderScript, renderRail, renderVerify, renderReverse, habitsLine, practiceLog } from "./render.js";
import { showReview, resetPanel, openByDefault, wide } from "./panel.js";
import { addListen } from "./voice.js";
import { renderBrief } from "./brief.js";
import { compareAttempts } from "./export.js";

const log = $("log"), input = $("input"), send = $("send");
// Tour end on a wide screen (user 11/04): "a" = the demo's last review stays in the panel and its questions (with ✓/✗) in
// the rail; "b" = a "next step" card in the right column. Default per screen language (ja → a; ko, en → b); ⚙ overrides.
export const TOUR_END = "mensetsu-tour-end";
export const tourEndMode = () => {
  try { const v = localStorage.getItem(TOUR_END); if (v === "a" || v === "b") return v; } catch {}
  return state.lang === "ja" ? "a" : "b";
};
const startCard = $("start");
$("startCta").addEventListener("click", () => input.focus());

// ⚙ Options: tutorial tips (default on). Unreadable storage counts as on.
export const TOUR_TIPS = "mensetsu-tour-tips";
export const tourTipsOn = () => { try { return localStorage.getItem(TOUR_TIPS) !== "0"; } catch { return true; } };

// Tutorial tips on (default): coach-mark tour. Off: the plain replay with an explanation bubble per step.
// onTry = app.js askForStart, passed in so this module does not import app.js.
export async function startDemo(onTry) {
  const my = state.epoch;
  state.demoActive = true;
  startCard.hidden = true;
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

// The six steps of the plain replay (tutorial tips off). `me(text)` shows the user's input and resolves false if the
// demo was left meanwhile. The last step ("try it with your code") is shared with the tour.
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

// Tutorial (UIUX-SPEC (k), rework 11/03; 16 steps since 11/07): popup n/16 above the composer and a page-wide dimmer. Each step spotlights the
// user's action first (composer row with 📎, then Send), then its result; on desktop the readable panel copy is the
// result. prefers-reduced-motion: no typing, no pauses, no fade (the spotlight is not motion and stays).
const tourBox = $("tour"), dim = $("tourDim"), row = document.querySelector(".composer .row");
const sleep = (ms) => new Promise((r) => setTimeout(r, still() ? 0 : ms));
function unspot() { for (const e of document.querySelectorAll(".spot")) e.classList.remove("spot", "spot-head"); }
function spot(target) {
  unspot();
  const list = [target].flat().filter(Boolean);
  for (const e of list) {
    e.classList.add("spot");
    if (e.getBoundingClientRect().height > innerHeight * 0.7) e.classList.add("spot-head"); // head only, fits the screen
  }
  list[0]?.scrollIntoView({ block: "start" }); // "center" pushes the top of a tall card (the key line) off a phone screen
}
const panelOpen = () => wide.matches && !$("panel").hidden;
function tourScenes(d, say, onTry) {
  const q = d.questions[d.pick], attempts = d.steps.map((x) => ({ question_id: q.id, ...x }));
  const cmp = compareAttempts({ attempts }, q.id);
  const reviewed = (r) => { const b = bubble("coach", ""); renderReview(r, b); return b; };
  const inPanel = (sel, chat) => (panelOpen() ? $("reviewBox").querySelector(sel) ?? chat : chat);
  const last = demoScenes(d, null, onTry).at(-1); // the "try it with your code" step is shared with the plain replay
  return [
    async () => (await say(d.mail.length > 300 ? `${d.mail.slice(0, 300)}…` : d.mail)) && send,
    async () => { const b = renderQuestions(d); openByDefault(); return b; },
    async () => { const b = renderBrief(d.brief, d.company_context, undefined, false, null, d.sample_profile); b.querySelector(".title").after(el("p", "caution", T().research.fictional), b.querySelector(".fit-flags"), b.querySelector(".fit-conditions")); return b; }, // a tall spotlit card shows its head only, so the flag moves up
    async () => { if (!(await say(String(d.pick + 1)))) return; return bubble("coach", `Q${d.pick + 1}. ${withTr(q)}`); },
    async () => say(d.steps[0].answer),
    async () => { const b = reviewed(d.steps[0].review); showReview(d.steps[0].review); return inPanel(":scope > .review", b); },
    async () => {
      const b = bubble("coach", "");
      renderScript(d.steps[0].script, b);
      addListen(b, d.steps[0].script.text); // device voice in the tour (voice.js), 0 AI calls
      showReview(d.steps[0].review, null, d.steps[0].script);
      return inPanel(":scope > .script:not(.review)", b);
    },
    async () => {
      if (!(await say(d.steps[1].answer))) return;
      reviewed(d.steps[1].review);
      const c = renderCompare(cmp, bubble("coach", ""));
      showReview(d.steps[1].review, cmp);
      return inPanel(":scope > .compare", c);
    },
    // The rest of the service (user 11/07: the tour explains every feature). Recorded outputs where the run has them
    // (record-demo.mjs --extras); the controls themselves are shown disabled, as nothing is called in the tour.
    async () => {
      const b = bubble("coach note", null);
      b.append(...(habitsLine({ questions: d.questions, attempts }) ?? [T().habits.title({ n: attempts.length })]));
      return b;
    },
    async () => {
      const t = T().chat, b = bubble("coach", null);
      for (const [mode, text] of [["answer", t.modeAnswer], ["verify", t.modeVerify]]) b.append(off("inline-btn pick-mode", text, { "aria-pressed": String(mode === "verify") }), " ");
      if (!d.verify) return b;
      const v = bubble("coach", "");
      renderVerify(d.verify.verify, v);
      return [b, v];
    },
    async () => (d.reverse ? renderReverse(d.reverse) : bubble("coach", null).appendChild(off("inline-btn", T().reverse.button)).parentElement),
    async () => {
      const p = T().prep, b = bubble("coach", null);
      b.append(off("inline-btn prep-ctl", p.button), el("p", "legend", STAGES.map((k) => p.stageNames[k]).join(" → ")));
      return b;
    },
    async () => {
      const item = log.querySelector(`.msg.qs .q[data-q="${q.id}"]`);
      if (item) practiceLog(item, q.id, attempts.map((a) => ({ ...a, at: new Date().toISOString() }))); // practised now, in the tour
      const b = bubble("coach", null);
      b.append(off("inline-btn", T().debrief.button));
      return [log.querySelector(".msg.qs .calendar-open"), item?.querySelector(".practice-log"), b].filter(Boolean);
    },
    async () => [$("lang").closest(".picker"), $("dest").closest(".picker")],
    async () => [panelOpen() ? $("tabNotes") : $("panelToggle"), $("end")],
    last,
  ];
}
const STAGES = ["casual", "first", "second", "executive", "final", "offer"]; // index.html #prepStage, in order
// A control as the tour shows it: the real class and label, never clickable.
function off(cls, text, attrs = {}) {
  const b = el("button", cls, text);
  b.type = "button";
  b.disabled = true;
  for (const [k, v] of Object.entries(attrs)) b.setAttribute(k, v);
  return b;
}
function startTour(d, my, onTry) {
  const tr = { i: 0, marks: [], panels: [], targets: [] };
  // The user's turn: spotlight the composer row (input + 📎), type, spotlight Send, then the sent bubble.
  // Resolves to the bubble, or null if the tour was left meanwhile.
  const say = async (text) => {
    const left = () => state.tour !== tr || my !== state.epoch;
    spot(row);
    if (!still()) {
      // At most 60 characters × 25ms = 1.5s; a longer text lands in one go after that.
      for (let k = 1; k <= Math.min(text.length, 60); k++) {
        input.value = text.slice(0, k);
        await sleep(25);
        if (left()) return null;
      }
    }
    spot(send);
    await sleep(600);
    input.value = "";
    if (left()) return null;
    return bubble("me", text);
  };
  tr.scenes = tourScenes(d, say, onTry);
  // The tour's end state (both answers reviewed) for the rail in mode "a"; during the tour the rail stays ○.
  const q = d.questions[d.pick];
  tr.finalRail = () => renderRail({ questions: d.questions, attempts: d.steps.map((x) => ({ question_id: q.id, ...x })) });
  state.tour = tr;
  input.readOnly = true;
  send.disabled = true;
  tourBox.hidden = false;
  dim.hidden = false;
  play(0);
}
async function play(n) {
  const tr = state.tour;
  tr.i = n;
  tr.marks[n] = log.children.length; // [戻る] removes what this step appended
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
// done = the user closed or skipped the tour (not a reset, not "try it yourself").
export function endTour(done = false) {
  const tr = state.tour;
  if (!tr) return;
  state.tour = null;
  tourBox.hidden = true;
  dim.hidden = true;
  unspot();
  input.readOnly = false;
  send.disabled = false;
  input.value = "";
  if (done && tourEndMode() === "a") return void tr.finalRail(); // the result stays until the code is accepted (app.js onCode resets the panel)
  resetPanel(); // the demo's review must not stay in the panel once the tour is over
  startCard.hidden = !done;
}
// [スキップ]/Esc: close the popup and leave only step 6 (the "enter your code" button).
export function skipTour() {
  const tr = state.tour;
  if (!tr) return;
  endTour(true);
  if (tr.i < tr.scenes.length - 1) tr.scenes.at(-1)();
}
$("tourNext").addEventListener("click", () => {
  const tr = state.tour;
  if (!tr) return;
  if (tr.i === tr.scenes.length - 1) return endTour(true);
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
