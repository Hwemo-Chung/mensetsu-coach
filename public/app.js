import { LANGS } from "./i18n/index.js";
import { sessionToMarkdown, exportFileName, compareAttempts, statusOf, briefFacts, reverseFacts } from "./export.js";
import { loadSession, clearSession, forgetBrief, SESSION_KEY } from "./session.js";
import { $, el, iel, icon, state, T, message, LS, persist, bubble, fill, waiting, withTr, targetOf, habitsLine, renderQuestions, retireBriefMarks, renderReview, renderCompare, renderScript, renderRail } from "./render.js";
import { panel, wide, closePanel, showReview, renderNotes, resetPanel, openByDefault } from "./panel.js";
import { startDemo, endTour, skipTour, tourTipsOn, TOUR_TIPS, tourEndMode, TOUR_END } from "./demo.js";
import { renderConfirm, renderBrief } from "./brief.js";
import { initVoice, addListen, addReadAloud, showMic, voiceSent, stopVoice, stopTts, allowRecording } from "./voice.js";

const log = $("log"), input = $("input"), send = $("send"), fileInput = $("file");
let attachment = null;
// Verified access code. sessionStorage only mirrors it and can throw where site data is blocked, so memory is the source.
let code = null;
function keepCode(v) {
  code = v;
  try { v ? sessionStorage.setItem("code", v) : sessionStorage.removeItem("code"); } catch {}
}
let stage = "code"; // code → mail → pick ⇄ answer
let lastMail = null, lastAttachment = null, lastProfile = ""; // memory only, for the career-line and brief regenerations
let destPack = "jp"; // destination pack for the next question set (jp, or kr beta)
const packOf = () => state.session?.pack?.id ?? "jp"; // a running session keeps the pack it was made with
let researchOn = false; // from /api/access; off = no card and no call
let researchRun = 0; // finish() does not bump state.epoch, so this drops a response meant for an earlier question set
let regenerating = false; // Ctrl+Enter submits even with #send disabled, and a practice must not start on a set about to be replaced

const LANG_KEY = "mensetsu-lang";
const stored = (() => { try { return localStorage.getItem(LANG_KEY); } catch { return null; } })();
const browser = (navigator.language || "ko").slice(0, 2);
state.lang = LANGS[stored] ? stored : LANGS[browser] ? browser : "ko";

const PLACEHOLDER = { code: "codePlaceholder", mail: "mailPlaceholder", pick: "pickPlaceholder", answer: "answerPlaceholder", profile: "profilePlaceholder" };
function setStage(next) {
  stage = next;
  document.body.dataset.stage = next; // CSS: the privacy line shows only while the code and the mail are entered
  showMic(next === "answer");
  input.placeholder = T().chat[PLACEHOLDER[stage]];
}
function askForCode() {
  setStage("code");
  const b = bubble("coach", T().chat.askCode);
  const demoBtn = iel("button", "inline-btn", "play", T().demo.button);
  demoBtn.type = "button";
  demoBtn.addEventListener("click", () => { demoBtn.disabled = true; startDemo(askForCode); });
  b.append(el("br"), demoBtn);
}

function askForMail() {
  setStage("mail");
  bubble("coach", T().chat.askMail);
}
function askForPick(again) {
  setStage("pick");
  return bubble("coach", again ? T().chat.askPickAgain : T().chat.askPick({ count: state.session.questions.length }));
}

async function post(path, body, extraHeaders = {}) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", "x-access-code": code ?? "", ...extraHeaders },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({ code: "generation_failed" }));
  return { res, data };
}

// A 401 mid-session means the code changed or expired: start over from the code step.
function failed(res, data) {
  bubble("err", message(data));
  if (res.status === 401) {
    keepCode(null);
    askForCode();
  }
}

async function onCode(text) {
  bubble("me", "••••");
  // A header value must be Latin-1 or fetch throws; such a code can never match, so refuse it here.
  if (/[^\u0000-\u00ff]/.test(text)) {
    bubble("err", message({ code: "access_denied" }));
    return askForCode();
  }
  const my = state.epoch;
  const { res, data } = await post("/api/access", null, { "x-access-code": text });
  if (my !== state.epoch) return;
  if (res.ok) {
    keepCode(text);
    allowRecording(data.stt);
    researchOn = data.research === true;
    $("start").hidden = true; // the tour's next-step card has done its job
    // Entering the code ends a plain demo replay: it no longer counts as history, and its review leaves the panel.
    if (state.demoActive) {
      state.demoActive = false;
      resetPanel();
    }
    // REL-4: restore after the code check only. A 401 re-ask keeps the session in memory and must not draw it twice.
    if (!state.session) {
      const saved = loadSession(LS);
      if (saved) return restore(saved);
      clearSession(LS); // broken or unreadable leftovers would keep triggering the reset dialog
    }
    return askForMail();
  }
  bubble("err", message(data));
  askForCode();
}

// Optional career line (offered once per question set): same mail + one line as candidate material.
function profileButton(cls, text) {
  const btn = el("button", cls, text);
  btn.type = "button";
  btn.addEventListener("click", () => {
    btn.disabled = true;
    setStage("profile");
    input.focus();
  });
  return btn;
}
function offerProfile() {
  const b = bubble("coach note", T().chat.profileOffer);
  b.append(el("br"), profileButton("inline-btn", T().chat.profileButton));
  if (packOf() === "jp") b.append(" ", reverseButton()); // reverse questions are JP-only (api/reverse returns pack_unsupported)
}
function reverseButton(cls = "inline-btn", text = T().reverse.button) {
  const rev = el("button", cls, text);
  rev.type = "button";
  rev.addEventListener("click", () => { rev.disabled = true; makeReverse(); });
  return rev;
}

// REL-4 (UIUX-SPEC (g)): one-line notice, the question list again, then pick. The mail is never stored, so the
// career-line offer cannot come back; reverse questions only need the company summary.
function restore(saved) {
  state.session = saved;
  destPack = packOf();
  fillDest();
  const b = bubble("coach", T().chat.restored({ q: state.session.questions.length, a: state.session.attempts.length }));
  const again = el("button", "inline-btn", T().chat.restoreNew);
  again.type = "button";
  again.addEventListener("click", finish); // same as 끝내기·저장: download first, never a delete-only button
  b.append(el("br"), again);
  if (packOf() === "jp") b.append(" ", reverseButton());
  renderQuestions(state.session);
  openByDefault();
  const last = state.session.attempts.findLast((a) => a.review);
  if (last) showReview(last.review, compareAttempts(state.session, last.question_id), last.script);
  renderNotes();
  if (researchOn) {
    const brief = state.session.company_context.research_brief;
    if (brief) renderBrief(brief, researchNames(), () => offerResearch());
    else offerResearch();
  }
  askForPick(true);
}

// Stage R. The names sent are only what the user confirmed on this card; a reload or a new question set never searches by itself.
const researchNames = () => state.session.research_names ?? state.session.company_context;
const offerResearch = (names = researchNames()) => renderConfirm(names, startResearch);
function endResearch() {
  researchRun++;
  for (const e of log.querySelectorAll(".research-ctl")) e.disabled = true;
}
async function startResearch(names, unlock) {
  const wait = waiting(T().research.wait);
  const my = state.epoch, run = researchRun;
  const current = () => my === state.epoch && run === researchRun;
  try {
    const { res, data } = await post("/api/research", { ...names, lang: state.lang });
    if (!current()) return;
    if (!res.ok) {
      unlock();
      return failed(res, data);
    }
    // A failed re-run must not cost the user the paid brief they already have.
    const c = state.session.company_context;
    const kept = data.research_status !== "ok" && c.research_brief?.research_status === "ok";
    const replaced = !kept && c.research_brief?.research_status === "ok";
    const hadReverse = replaced && forgetBrief(state.session);
    if (replaced) retireBriefMarks();
    if (!kept) {
      c.research_brief = data;
      state.session.research_names = names;
      persist();
    }
    const card = renderBrief(data, names, () => offerResearch(names), kept);
    if (!kept) {
      const top = log.scrollTop; // a long card is read from its top; what follows it must not move the view
      if (hadReverse) offerReverseAgain();
      followBrief(data, card);
      log.scrollTop = top;
    }
  } catch {
    if (!current()) return;
    unlock();
    bubble("err", message({ code: "network" }));
  } finally {
    wait.remove();
  }
}

// Stage R step 4: the questions follow the brief. Practice already done is never wiped without asking.
function followBrief(brief, card) {
  const facts = briefFacts(brief).length > 0;
  if (!facts && !state.session.questions.some((q) => q.stale)) return; // nothing sourced to add and nothing old to clear: the questions stay
  if (!lastMail) return bubble("coach note", T().research.noRegen); // restored session: the mail was never stored
  const { attempts, notes } = state.session;
  if (!send.disabled && !state.current && stage !== "profile" && !attempts.length && !Object.values(notes ?? {}).some((n) => n?.trim())) return regenerate({ card });
  offerRegen(facts);
}
function offerRegen(facts) {
  const r = T().research, b = bubble("coach note", facts ? r.regenOffer : r.staleOffer), btn = el("button", "inline-btn research-ctl", facts ? r.regenButton : r.staleButton);
  btn.type = "button";
  btn.addEventListener("click", () => {
    if (send.disabled) return;
    btn.disabled = true;
    regenerate({});
  });
  b.append(el("br"), btn);
}
async function regenerate({ card }) {
  regenerating = send.disabled = true;
  try {
    await requestQuestions(lastMail, lastAttachment, lastProfile, T().research.regenWait, { fromBrief: true, card });
  } catch {
    bubble("err", message({ code: "network" }));
  } finally {
    regenerating = send.disabled = false;
  }
}

function offerReverseAgain() {
  bubble("coach note", T().research.reverseDropped).append(el("br"), reverseButton());
}

// F10: reverse questions from the company summary already in the session (no mail re-sent).
async function makeReverse() {
  const wait = waiting(T().reverse.wait);
  const my = state.epoch;
  try {
    // The stored brief can quote the desired profile, which only the fit call may receive; reverseFacts picks what may leave.
    const { research_brief, ...context } = state.session.company_context;
    const brief = researchOn ? reverseFacts(research_brief) : [];
    const { res, data } = await post("/api/reverse", { context, lang: state.lang, pack: packOf(), ...(brief.length ? { brief } : {}) });
    if (my !== state.epoch) return;
    if (!res.ok) return failed(res, data);
    // Their ids and wording come from a brief the user has since replaced.
    if (brief.length && research_brief !== state.session.company_context.research_brief) return offerReverseAgain();
    const t = T().reverse;
    const b = bubble("coach script reverse", null);
    b.append(el("p", "title", t.title));
    data.questions.forEach((q, i) => {
      b.append(el("p", "ja", `${i + 1}. ${q.question}`), el("p", "tr", `${t.intent}: ${q.intent}`));
      if (q.source_ids?.length) b.append(el("p", "legend", `${t.source}: ${q.source_ids.join(", ")}`));
    });
    if (data.research_basis && !data.research_basis.passed) b.append(el("p", "legend", t.lowResearch));
    b.append(iel("p", "legend", "tip", t.tip));
    state.session.reverse = data.questions;
    persist();
  } catch {
    bubble("err", message({ code: "network" }));
  } finally {
    wait.remove();
  }
}

function showHabits() {
  const line = habitsLine();
  if (line) bubble("coach note", null).append(...line);
}

async function onProfile(text) {
  bubble("me", text);
  await requestQuestions(lastMail, lastAttachment, text, T().chat.waitRegenerate);
}

async function onMail(text) {
  bubble("me", text.length > 300 ? `${text.slice(0, 300)}…` : text);
  if (attachment) bubble("me", null).append(icon("file"), attachment.name);
  lastMail = text;
  lastAttachment = attachment;
  await requestQuestions(text, attachment, "", T().chat.waitQuestions);
}

// card: show the wait inside it and leave the view alone, so the brief being read is not scrolled away.
async function requestQuestions(mail, file, profile, waitText, { fromBrief = false, card = null } = {}) {
  const regen = !!profile || fromBrief;
  const wait = card ? el("p", "legend", waitText) : waiting(waitText);
  card?.firstChild.after(wait);
  const my = state.epoch, run = researchRun;
  try {
    const sentBrief = regen ? state.session.company_context.research_brief : undefined;
    const brief = regen && researchOn ? briefFacts(sentBrief) : [];
    const { res, data } = await post("/api/questions", { mail, attachment: file, lang: state.lang, pack: destPack, ...(profile ? { profile } : {}), ...(brief.length ? { brief } : {}) });
    if (my !== state.epoch || (fromBrief && run !== researchRun)) return;
    if (!res.ok) return failed(res, data);
    const top = log.scrollTop;
    // Session keeps only the model's company summary + questions, never the raw mail or attachment.
    // A regenerated set (career line, brief) starts fresh, notes and reverse questions included; it is the same company, so a paid brief stays.
    const prev = regen ? state.session : null, research_brief = prev?.company_context.research_brief;
    if (!regen) endResearch();
    lastProfile = profile;
    // A set made with the brief keeps the mail-only summary: these facts reach the script call, which must not receive research (L6).
    const summary = brief.length ? prev.company_context : data.company_context;
    state.session = { pack: data.pack, company_context: research_brief ? { ...summary, research_brief } : summary, questions: data.questions, attempts: [], specificity: data.specificity, notes: {}, ...(data.research_basis && { research_basis: data.research_basis }), ...(prev?.research_names && { research_names: prev.research_names }) };
    state.current = null;
    // A re-run finished while this set was being made: its ids point into the brief that was replaced.
    const outrun = brief.length > 0 && research_brief !== sentBrief;
    if (outrun) forgetBrief(state.session);
    persist();
    renderNotes();
    attachment = null;
    $("chip").hidden = true;
    renderQuestions(state.session);
    openByDefault();
    if (data.specificity && !data.specificity.passed) bubble("coach note", T().chat.lowSpecificity(data.specificity));
    if (data.research_basis && !data.research_basis.passed) bubble("coach note", T().chat.lowResearch(data.research_basis));
    if (outrun && !briefFacts(research_brief).length) offerRegen(false);
    if (!regen && researchOn) offerResearch();
    if (!regen) offerProfile();
    // A 401 elsewhere or a career line being typed keeps its stage: the new set must not take over the composer.
    if (!(fromBrief && ["profile", "code"].includes(stage))) askForPick(false);
    if (card) log.scrollTop = top;
  } finally {
    wait.remove();
  }
}

function onPick(text) {
  bubble("me", text);
  const n = Number(text.normalize("NFKC"));
  const q = Number.isInteger(n) ? state.session.questions[n - 1] : undefined;
  if (!q) return bubble("err", T().chat.badPick({ count: state.session.questions.length }));
  state.current = q;
  renderNotes();
  renderRail();
  setStage("answer");
  bubble("coach", `Q${n}. ${withTr(q)}\n\n${T().chat.askAnswer[targetOf()]}`);
}

// Review (①②) and script (③) run at the same time; a failed review does not block the script.
async function onAnswer(text) {
  stopTts(); // the previous script card is no longer the one being practised
  bubble("me", text);
  const q = state.current;
  const reviewSlot = waiting(T().chat.waitReview[targetOf()]);
  const scriptSlot = waiting(T().chat.waitScript);
  const attempt = { question_id: q.id, answer: text, review: null, script: null };
  const my = state.epoch;
  let denied = null;
  const run = async (path, body, render, key, slot) => {
    try {
      const { res, data } = await post(path, body);
      if (res.ok) return render(data, slot), (attempt[key] = data);
      if (res.status === 401) denied = { res, data };
      fill(slot, "err").textContent = message(data);
    } catch {
      fill(slot, "err").textContent = message({ code: "network" });
    }
  };
  await Promise.all([
    run("/api/review", { question: q.question, category: q.category, answer: text, lang: state.lang, pack: packOf() }, renderReview, "review", reviewSlot),
    run("/api/script", { question: q.question, category: q.category, answer: text, context: state.session.company_context.facts.join("\n"), lang: state.lang, pack: packOf(), ...(q.basis_type === "research" && { basis_type: "research" }) }, (d, slot) => { renderScript(d, slot); addListen(slot, d.text, d.ttsSig); addReadAloud(slot, d); }, "script", scriptSlot),
  ]);
  if (my !== state.epoch) return;
  if (denied) return failed(denied.res, denied.data);
  if (attempt.review || attempt.script) {
    state.session.attempts.push(attempt);
    persist();
    showHabits();
    renderRail();
  }
  const cmp = attempt.review ? compareAttempts(state.session, q.id) : null;
  if (cmp) renderCompare(cmp, bubble("coach", ""));
  if (attempt.review) showReview(attempt.review, cmp, attempt.script);
  askForPick(true);
  quickReplies();
}

// LINE-style quick replies under the prompt (UIUX §11.2): up to 3 questions not practised yet, reverse questions (JP),
// the career line (only while the mail is in memory). Only the latest row stays; it scrolls sideways on a phone.
function quickReplies() {
  for (const old of log.querySelectorAll(".quick")) old.remove();
  const t = T(), row = el("div", "quick");
  row.setAttribute("role", "group");
  row.setAttribute("aria-label", t.quick.label);
  // English UI: re-drill the question just reviewed when it still needs work (benchmark 11/04: Final Round, Huru).
  if (t.ui.western && state.current && statusOf(state.session, state.current.id) === "miss") {
    const b = el("button", null, t.quick.again({ n: state.current.id.slice(1) }));
    b.type = "button";
    b.dataset.pick = state.current.id.slice(1);
    row.append(b);
  }
  state.session.questions.filter((q) => q !== state.current && statusOf(state.session, q.id) === "todo").slice(0, 3).forEach((q) => {
    const b = el("button", null, `Q${q.id.slice(1)} ${q.question}`);
    b.type = "button";
    b.dataset.pick = q.id.slice(1);
    row.append(b);
  });
  if (packOf() === "jp") row.append(reverseButton(null, t.quick.reverse));
  if (lastMail) row.append(profileButton(null, t.quick.profile));
  if (row.children.length) log.append(row);
  log.scrollTop = log.scrollHeight;
}

// Tap = typing the number (UIUX §11.4-2): question cards, rail items and quick replies all carry data-pick.
// Not during the tour or a pending request, and never for cards of an earlier set (renderQuestions disables those).
document.querySelector(".app").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-pick]");
  if (!b || !state.session || state.tour || send.disabled || !["pick", "answer", "profile"].includes(stage)) return;
  onPick(b.dataset.pick);
  if (wide.matches) input.focus();
});

// The label wraps a hidden input, so it is the keyboard target itself (review M4).
document.querySelector(".attach").addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  e.preventDefault();
  fileInput.click();
});
fileInput.addEventListener("change", () => {
  const f = fileInput.files[0];
  fileInput.value = "";
  if (!f) return;
  if (f.size > 3 * 1024 * 1024) return bubble("err", message({ code: "attachment_too_large", max_mb: 3 }));
  const reader = new FileReader();
  reader.onload = () => {
    attachment = { name: f.name, type: f.type, data: String(reader.result).split(",")[1] };
    $("chipName").replaceChildren(icon("file"), f.name);
    $("chip").hidden = false;
  };
  reader.readAsDataURL(f);
});
$("chipX").addEventListener("click", () => { attachment = null; $("chip").hidden = true; });

$("composer").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  if (state.tour || regenerating) return; // the tour types demo text into the composer; never send it (Ctrl+Enter submits even with #send disabled)
  const text = input.value.trim();
  if (!text) return;
  voiceSent();
  input.value = "";
  send.disabled = true;
  try {
    if (stage === "code") await onCode(text);
    else if (stage === "mail") await onMail(text);
    else if (stage === "pick") onPick(text);
    else if (stage === "profile") await onProfile(text);
    else await onAnswer(text);
  } catch {
    bubble("err", message({ code: "network" }));
    if (stage === "code") askForCode();
  } finally {
    send.disabled = false;
  }
});

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) $("composer").requestSubmit();
});

// Static labels follow the language; bubbles already shown stay as they were.
// Plain keys live in `ui`; dotted keys ("panel.review") are paths from the language root.
const label = (t, k) => (k.includes(".") ? k.split(".").reduce((o, x) => o[x], t) : t.ui[k]);
function applyLanguage() {
  const t = T();
  document.documentElement.lang = state.lang;
  document.title = t.ui.title;
  document.querySelector(".bar .sub").hidden = t.ui.title === document.querySelector(".brand").firstChild.textContent.trim(); // ja: the subtitle would repeat the name
  for (const e of document.querySelectorAll("[data-i18n]")) e.textContent = label(t, e.dataset.i18n);
  for (const e of document.querySelectorAll("[data-i18n-mail]")) e.textContent = t.mail[e.dataset.i18nMail];
  for (const e of document.querySelectorAll("[data-i18n-label]")) {
    e.setAttribute("aria-label", label(t, e.dataset.i18nLabel));
    e.title = label(t, e.dataset.i18nLabel);
  }
  input.placeholder = t.chat[PLACEHOLDER[stage]];
  fillDest();
}
// F6: the session lives only in this browser, so the document is built and downloaded here, then cleared.
// The session is cleared only after the download was triggered; if building it fails, nothing is lost.
function finish() {
  if (!state.session) return bubble("coach", T().export.empty);
  const file = exportFileName(new Date());
  try {
    const url = URL.createObjectURL(new Blob([sessionToMarkdown(state.session, T())], { type: "text/markdown;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: file });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    return bubble("err", message({ code: "unknown" }));
  }
  endResearch();
  state.session = null;
  lastMail = null;
  lastAttachment = null;
  state.current = null;
  clearSession(LS);
  resetPanel();
  renderNotes();
  // The file name sits on its own line of the sentence; the file icon goes in front of it.
  const [pre, post] = T().export.saved({ file }).split(file);
  bubble("coach", null).append(pre, icon("file"), file, post);
  if (code) setStage("mail");
  offerMail();
}
$("end").addEventListener("click", finish);

// Daily-tip signup: offered once after the first save; "not now" is remembered too.
const MAIL_ASKED = "mensetsu-mail-asked";
const dialog = $("mail");
function offerMail() {
  try { if (localStorage.getItem(MAIL_ASKED)) return; } catch {}
  $("mailMsg").textContent = "";
  $("mailEmail").placeholder = T().mail.placeholder;
  dialog.showModal();
}
function closeMail() {
  try { localStorage.setItem(MAIL_ASKED, "1"); } catch {}
  dialog.close();
}
$("mailLater").addEventListener("click", closeMail);
$("mailForm").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const msg = $("mailMsg");
  $("mailSubmit").disabled = true;
  try {
    const { res, data } = await post("/api/subscribe", { email: $("mailEmail").value, consent: $("mailConsent").checked, lang: state.lang });
    if (!res.ok) return void (msg.textContent = message(data));
    closeMail();
    bubble("coach", T().mail.done);
  } catch {
    msg.textContent = message({ code: "network" });
  } finally {
    $("mailSubmit").disabled = false;
  }
});

// Destination menu: Japan, Korea (beta); the rest are "coming soon" and each click is an anonymous demand count.
const DESTS = ["jp", "kr", "anglo", "other"];
const OPEN_DESTS = ["jp", "kr"];
const dest = $("dest");
function fillDest() {
  const t = T().dest;
  const name = (d) => (d === "jp" ? t.jp : `${t[d]} · ${d === "kr" ? t.beta : t.soonTag}`);
  dest.replaceChildren(...DESTS.map((d) => new Option(name(d), d, false, d === destPack)));
  dest.setAttribute("aria-label", t.label);
  dest.title = t.label;
}
dest.addEventListener("change", () => {
  const d = dest.value;
  if (OPEN_DESTS.includes(d)) return switchTo("dest", dest, () => (dest.value = destPack), () => { destPack = d; });
  bubble("coach", T().dest.soon({ name: T().dest[d] }));
  fetch("/api/demand", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ target: d }) }).catch(() => {});
  dest.value = destPack;
});

const picker = $("lang");
for (const [code, t] of Object.entries(LANGS)) picker.append(new Option(t.label, code, false, code === state.lang));
picker.addEventListener("change", () => switchTo("lang", picker, () => (picker.value = state.lang), () => {
  state.lang = picker.value;
  try { localStorage.setItem(LANG_KEY, state.lang); } catch {}
  applyLanguage();
}));

// Language/destination change (UIUX-SPEC (j)): nothing to lose → switch silently. Otherwise ask in the current
// language; Yes clears chat, session, stored session and panel (the verified code stays), No/Esc reverts the select.
const hasHistory = () => Boolean(state.session || state.demoActive || send.disabled || (() => { try { return LS.getItem(SESSION_KEY); } catch { return null; } })());
const confirmDlg = $("confirm");
function confirmReset(kind, select) {
  const t = T().confirm;
  $("confirmTitle").textContent = t[kind];
  $("confirmBody").textContent = t.body;
  $("confirmNo").textContent = t.no;
  $("confirmYes").textContent = t.yes;
  confirmDlg.returnValue = "";
  confirmDlg.showModal();
  $("confirmNo").focus();
  // `close` fires for No, Yes and Esc alike; only the Yes button sets returnValue "yes".
  return new Promise((done) => confirmDlg.addEventListener("close", () => { select.focus(); done(confirmDlg.returnValue === "yes"); }, { once: true }));
}
async function switchTo(kind, select, revert, apply) {
  const had = hasHistory();
  if (had && !(await confirmReset(kind, select))) return revert();
  const demo = state.demoActive;
  if (had) resetChat();
  apply();
  if (!had) return;
  if (demo && kind === "lang") startDemo(askForCode); // recordings exist per language, not per destination
  else if (code) askForMail();
  else askForCode();
}
function resetChat() {
  state.epoch++;
  stopVoice();
  state.demoActive = false;
  endTour();
  $("start").hidden = true;
  log.replaceChildren();
  state.session = state.current = null;
  lastMail = lastAttachment = attachment = null;
  $("chip").hidden = true;
  clearSession(LS);
  resetPanel();
  renderNotes();
}

// Esc: a mobile panel closes first, else the tour is skipped. Open dialogs handle their own Esc.
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || document.querySelector("dialog[open]")) return;
  if (!panel.hidden && !wide.matches) closePanel();
  else if (state.tour) skipTour();
});

const tourEndRadios = document.querySelectorAll("input[name=tourEnd]");
$("opts").addEventListener("click", () => {
  $("tourTips").checked = tourTipsOn();
  for (const r of tourEndRadios) r.checked = r.value === tourEndMode();
  $("options").showModal();
});
for (const r of tourEndRadios) r.addEventListener("change", () => { try { localStorage.setItem(TOUR_END, r.value); } catch {} });
$("tourTips").addEventListener("change", (e) => { try { localStorage.setItem(TOUR_TIPS, e.target.checked ? "1" : "0"); } catch {} });
$("options").addEventListener("close", () => $("opts").focus());

// Clear any unverified code left by an earlier page version; the chat always asks for the code on load.
keepCode(null);
initVoice({ code: () => code, pack: packOf });
applyLanguage();
askForCode();
