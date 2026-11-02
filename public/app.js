const $ = (id) => document.getElementById(id);
const log = $("log"), input = $("input"), send = $("send"), fileInput = $("file");
const SESSION_KEY = "mensetsu-session";
let attachment = null;
let stage = "code"; // code → mail → pick ⇄ answer
let session = null; // { company_context, questions, attempts }
let current = null; // question being answered
let lastMail = null, lastAttachment = null; // memory only, for the optional career-line regeneration

import { LANGS } from "./i18n/index.js";
import { sessionToMarkdown, exportFileName, habitCounts } from "./export.js";

const LANG_KEY = "mensetsu-lang";
const stored = (() => { try { return localStorage.getItem(LANG_KEY); } catch { return null; } })();
const browser = (navigator.language || "ko").slice(0, 2);
let lang = LANGS[stored] ? stored : LANGS[browser] ? browser : "ko";
const T = () => LANGS[lang];
// Server returns codes; the sentence comes from the selected language file.
const message = (d) => (T().errors[d?.code] ?? T().errors.unknown)(d ?? {});

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text; // textContent only: model output is never parsed as HTML
  return e;
}
function bubble(cls, text) {
  const b = el("div", `msg ${cls}`, text);
  log.append(b);
  log.scrollTop = log.scrollHeight;
  return b;
}

// Display order and labels of the 4 steps (from packs/jp.json answer_structure).
const PACK_STEPS = [
  { key: "fukusho", label: "復唱" },
  { key: "ketsuron", label: "結論" },
  { key: "kijun", label: "基準・数字" },
  { key: "sentakushi", label: "選択肢" },
];
const PLACEHOLDER = { code: "codePlaceholder", mail: "mailPlaceholder", pick: "pickPlaceholder", answer: "answerPlaceholder", profile: "profilePlaceholder" };
function setStage(next) {
  stage = next;
  input.placeholder = T().chat[PLACEHOLDER[stage]];
}
function askForCode() {
  setStage("code");
  bubble("coach", T().chat.askCode);
}
function askForMail() {
  setStage("mail");
  bubble("coach", T().chat.askMail);
}
function askForPick(again) {
  setStage("pick");
  bubble("coach", again ? T().chat.askPickAgain : T().chat.askPick({ count: session.questions.length }));
}

function renderQuestions({ company_context: c, questions }) {
  const t = T();
  const b = bubble("coach", t.chat.questionsMade({ company: c.company, position: c.position, count: questions.length }));
  for (const q of questions) {
    const item = el("div", "q");
    item.append(el("span", "tag", t.stages[q.stage] ?? q.stage), el("span", "tag", t.categories[q.category] ?? q.category));
    item.append(el("p", "ja", `${q.id.slice(1)}. ${q.question_ja}`), el("p", "tr", q.question_tr), el("p", "basis", `${t.chat.basis}: ${q.basis}`));
    b.append(item);
  }
  log.scrollTop = log.scrollHeight;
}

// Cards are created in ①②③ order up front and filled as each response lands.
function fill(slot, cls) {
  slot.className = `msg ${cls}`;
  slot.textContent = "";
  return slot;
}

function renderReview(r, slot) {
  const t = T().review;
  const b = fill(slot, "coach script review");
  b.append(el("p", "title", t.title));
  b.append(el("p", `verdict ${r.answers_question}`, t.answers[r.answers_question]), el("p", "tr", r.answers_question_reason));
  for (const step of PACK_STEPS) {
    const v = r.steps[step.key];
    b.append(el("p", `step ${v.present ? "ok" : "miss"}`, `${v.present ? "✓" : "✗"} ${step.label} ${T().steps[step.key]}`));
    if (!v.present) b.append(el("p", "hint", `→ ${v.note}`));
  }
  b.append(el("p", "title", t.corrections));
  if (!r.corrections.length) b.append(el("p", "tr", t.noCorrections));
  for (const c of r.corrections) {
    b.append(el("p", "rule", `【${c.rule_id}】`), el("p", "ja", `${c.before} → ${c.after}`), el("p", "tr", c.reason));
  }
  log.scrollTop = log.scrollHeight;
}

function renderScript(s, slot) {
  const t = T().script;
  const b = fill(slot, "coach script");
  b.append(el("p", "title", t.title));
  b.append(el("p", "label", t.ja), el("p", "ja", s.ja));
  b.append(el("p", "label", t.reading), el("p", "reading", s.reading));
  b.append(el("p", "legend", t.legend));
  b.append(el("p", "label", t.translation), el("p", "tr", s.translation));
  const ul = el("ul", "points");
  for (const p of s.points) ul.append(el("li", null, p));
  b.append(el("p", "label", t.points), ul);
  log.scrollTop = log.scrollHeight;
}

async function post(path, body, extraHeaders = {}) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", "x-access-code": sessionStorage.getItem("code") ?? "", ...extraHeaders },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({ code: "generation_failed" }));
  return { res, data };
}

// A 401 mid-session means the code changed or expired: start over from the code step.
function failed(res, data) {
  bubble("err", message(data));
  if (res.status === 401) {
    sessionStorage.removeItem("code");
    askForCode();
  }
}

async function onCode(text) {
  bubble("me", "••••");
  const { res, data } = await post("/api/access", null, { "x-access-code": text });
  if (res.ok) {
    sessionStorage.setItem("code", text);
    return askForMail();
  }
  bubble("err", message(data));
  askForCode();
}

// Optional career line (offered once per question set): same mail + one line as candidate material.
function offerProfile() {
  const b = bubble("coach note", T().chat.profileOffer);
  const btn = el("button", "inline-btn", T().chat.profileButton);
  btn.type = "button";
  btn.addEventListener("click", () => {
    btn.disabled = true;
    setStage("profile");
    input.focus();
  });
  const rev = el("button", "inline-btn", T().reverse.button);
  rev.type = "button";
  rev.addEventListener("click", () => { rev.disabled = true; makeReverse(); });
  b.append(el("br"), btn, " ", rev);
}

// F10: reverse questions from the company summary already in the session (no mail re-sent).
async function makeReverse() {
  const wait = bubble("coach typing", T().reverse.wait);
  try {
    const { res, data } = await post("/api/reverse", { context: session.company_context, lang });
    if (!res.ok) return failed(res, data);
    const t = T().reverse;
    const b = bubble("coach script reverse", null);
    b.append(el("p", "title", t.title));
    data.questions.forEach((q, i) => b.append(el("p", "ja", `${i + 1}. ${q.question_ja}`), el("p", "tr", `${t.intent}: ${q.intent}`)));
    b.append(el("p", "legend", t.tip));
    session.reverse = data.questions;
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    bubble("err", message({ code: "network" }));
  } finally {
    wait.remove();
  }
}

// F9: one line after each answer with the running count of rule hits in this session.
function showHabits() {
  const h = habitCounts(session);
  if (!h.length) return;
  const t = T().habits;
  bubble("coach note", `${t.title({ n: session.attempts.length })}\n${h.map((x) => `${x.label} ${t.times({ c: x.count })}${x.habit ? " ⚠" : ""}`).join(" · ")}`);
}

async function onProfile(text) {
  bubble("me", text);
  await requestQuestions(lastMail, lastAttachment, text, T().chat.waitRegenerate);
}

async function onMail(text) {
  bubble("me", text.length > 300 ? `${text.slice(0, 300)}…` : text);
  if (attachment) bubble("me", `📄 ${attachment.name}`);
  lastMail = text;
  lastAttachment = attachment;
  await requestQuestions(text, attachment, "", T().chat.waitQuestions);
}

async function requestQuestions(mail, file, profile, waitText) {
  const wait = bubble("coach typing", waitText);
  try {
    const { res, data } = await post("/api/questions", { mail, attachment: file, lang, ...(profile ? { profile } : {}) });
    if (!res.ok) return failed(res, data);
    // Session keeps only the model's company summary + questions, never the raw mail or attachment.
    session = { company_context: data.company_context, questions: data.questions, attempts: [] };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    attachment = null;
    $("chip").hidden = true;
    renderQuestions(data);
    if (data.specificity && !data.specificity.passed) bubble("coach note", T().chat.lowSpecificity(data.specificity));
    if (!profile) offerProfile();
    askForPick(false);
  } finally {
    wait.remove();
  }
}

function onPick(text) {
  bubble("me", text);
  const n = Number(text.normalize("NFKC"));
  const q = Number.isInteger(n) ? session.questions[n - 1] : undefined;
  if (!q) return bubble("err", T().chat.badPick({ count: session.questions.length }));
  current = q;
  setStage("answer");
  bubble("coach", `Q${n}. ${q.question_ja}\n(${q.question_tr})\n\n${T().chat.askAnswer}`);
}

// Review (①②) and script (③) run at the same time; a failed review does not block the script.
async function onAnswer(text) {
  bubble("me", text);
  const q = current;
  const reviewSlot = bubble("coach typing", T().chat.waitReview);
  const scriptSlot = bubble("coach typing", T().chat.waitScript);
  const attempt = { question_id: q.id, answer: text, review: null, script: null };
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
    run("/api/review", { question: q.question_ja, answer: text, lang }, renderReview, "review", reviewSlot),
    run("/api/script", { question: q.question_ja, answer: text, context: session.company_context.facts.join("\n"), lang }, renderScript, "script", scriptSlot),
  ]);
  if (denied) return failed(denied.res, denied.data);
  if (attempt.review || attempt.script) {
    session.attempts.push(attempt);
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    showHabits();
  }
  askForPick(true);
}

fileInput.addEventListener("change", () => {
  const f = fileInput.files[0];
  fileInput.value = "";
  if (!f) return;
  if (f.size > 3 * 1024 * 1024) return bubble("err", message({ code: "attachment_too_large", max_mb: 3 }));
  const reader = new FileReader();
  reader.onload = () => {
    attachment = { name: f.name, type: f.type, data: String(reader.result).split(",")[1] };
    $("chipName").textContent = `📄 ${f.name}`;
    $("chip").hidden = false;
  };
  reader.readAsDataURL(f);
});
$("chipX").addEventListener("click", () => { attachment = null; $("chip").hidden = true; });

$("composer").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const text = input.value.trim();
  if (!text) return;
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
function applyLanguage() {
  const t = T();
  document.documentElement.lang = lang;
  document.title = t.ui.title;
  for (const e of document.querySelectorAll("[data-i18n]")) e.textContent = t.ui[e.dataset.i18n];
  for (const e of document.querySelectorAll("[data-i18n-mail]")) e.textContent = t.mail[e.dataset.i18nMail];
  for (const e of document.querySelectorAll("[data-i18n-label]")) {
    e.setAttribute("aria-label", t.ui[e.dataset.i18nLabel]);
    e.title = t.ui[e.dataset.i18nLabel];
  }
  input.placeholder = t.chat[PLACEHOLDER[stage]];
  fillDest();
}
// F6: the session lives only in this browser, so the document is built and downloaded here, then cleared.
$("end").addEventListener("click", () => {
  if (!session) return bubble("coach", T().export.empty);
  const file = exportFileName(new Date());
  const url = URL.createObjectURL(new Blob([sessionToMarkdown(session, T())], { type: "text/markdown;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: file });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  session = null;
  lastMail = null;
  lastAttachment = null;
  current = null;
  localStorage.removeItem(SESSION_KEY);
  bubble("coach", T().export.saved({ file }));
  if (sessionStorage.getItem("code")) setStage("mail");
  offerMail();
});

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
    const { res, data } = await post("/api/subscribe", { email: $("mailEmail").value, consent: $("mailConsent").checked, lang });
    if (!res.ok) return void (msg.textContent = message(data));
    closeMail();
    bubble("coach", T().mail.done);
  } catch {
    msg.textContent = message({ code: "network" });
  } finally {
    $("mailSubmit").disabled = false;
  }
});

// Destination menu: only Japan works today; the rest are "coming soon" and each click is an anonymous demand count.
const DESTS = ["jp", "kr", "anglo", "other"];
const dest = $("dest");
function fillDest() {
  const t = T().dest;
  dest.replaceChildren(...DESTS.map((d) => new Option(d === "jp" ? t.jp : `${t[d]} · ${t.soonTag}`, d, false, d === "jp")));
  dest.setAttribute("aria-label", t.label);
  dest.title = t.label;
}
dest.addEventListener("change", () => {
  const d = dest.value;
  if (d === "jp") return;
  bubble("coach", T().dest.soon({ name: T().dest[d] }));
  fetch("/api/demand", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ target: d }) }).catch(() => {});
  dest.value = "jp";
});

const picker = $("lang");
for (const [code, t] of Object.entries(LANGS)) picker.append(new Option(t.label, code, false, code === lang));
picker.addEventListener("change", () => {
  lang = picker.value;
  try { localStorage.setItem(LANG_KEY, lang); } catch {}
  applyLanguage();
});

// Clear any unverified code left by an earlier page version; the chat always asks for the code on load.
sessionStorage.removeItem("code");
applyLanguage();
askForCode();
