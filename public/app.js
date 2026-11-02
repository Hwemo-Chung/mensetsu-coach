const $ = (id) => document.getElementById(id);
const log = $("log"), input = $("input"), send = $("send"), fileInput = $("file");
const SESSION_KEY = "mensetsu-session";
let attachment = null;
let stage = "code"; // code → mail → pick ⇄ answer
let session = null; // { company_context, questions, attempts }
let current = null; // question being answered

import { LANGS } from "./i18n/index.js";

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

const PLACEHOLDER = { code: "codePlaceholder", mail: "mailPlaceholder", pick: "pickPlaceholder", answer: "answerPlaceholder" };
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

function renderScript(s) {
  const t = T().script;
  const b = bubble("coach script", null);
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

async function onMail(text) {
  bubble("me", text.length > 300 ? `${text.slice(0, 300)}…` : text);
  if (attachment) bubble("me", `📄 ${attachment.name}`);
  const wait = bubble("coach typing", T().chat.waitQuestions);
  try {
    const { res, data } = await post("/api/questions", { mail: text, attachment, lang });
    if (!res.ok) return failed(res, data);
    // Session keeps only the model's company summary + questions, never the raw mail or attachment.
    session = { company_context: data.company_context, questions: data.questions, attempts: [] };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    attachment = null;
    $("chip").hidden = true;
    renderQuestions(data);
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

async function onAnswer(text) {
  bubble("me", text);
  const wait = bubble("coach typing", T().chat.waitScript);
  try {
    const context = session.company_context.facts.join("\n");
    const { res, data } = await post("/api/script", { question: current.question_ja, answer: text, context, lang });
    if (!res.ok) return failed(res, data);
    renderScript(data);
    session.attempts.push({ question_id: current.id, answer: text, script: data });
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    askForPick(true);
  } finally {
    wait.remove();
  }
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
  for (const e of document.querySelectorAll("[data-i18n-label]")) {
    e.setAttribute("aria-label", t.ui[e.dataset.i18nLabel]);
    e.title = t.ui[e.dataset.i18nLabel];
  }
  input.placeholder = t.chat[PLACEHOLDER[stage]];
}
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
