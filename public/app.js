const $ = (id) => document.getElementById(id);
const log = $("log"), input = $("input"), send = $("send"), fileInput = $("file");
const SESSION_KEY = "mensetsu-session";
let attachment = null;
let stage = "code"; // code → mail → pick ⇄ answer
let session = null; // { company_context, questions, attempts }
let current = null; // question being answered

// Server returns codes; the sentence is chosen here (F12 will move this table into per-language files).
const MESSAGES = {
  access_denied: () => "접근 코드가 맞지 않아요.",
  rate_limited: () => "요청이 너무 많아요. 10분 뒤에 다시 시도해 주세요.",
  bad_request: () => "요청 형식이 올바르지 않아요.",
  mail_required: () => "구인 정보나 메일 내용을 붙여넣어 주세요.",
  mail_too_long: (d) => `메일은 ${d.max}자 이하로 붙여넣어 주세요.`,
  answer_required: () => "답변을 입력해 주세요.",
  answer_too_long: (d) => `답변은 ${d.max}자 이하로 입력해 주세요.`,
  question_required: () => "질문을 먼저 골라 주세요.",
  question_too_long: (d) => `질문은 ${d.max}자 이하여야 해요.`,
  attachment_empty: () => "파일이 비어 있어요.",
  attachment_too_large: (d) => `파일은 ${d.max_mb ?? 3}MB 이하만 올릴 수 있어요.`,
  attachment_not_pdf: () => "PDF 파일이 아니에요.",
  attachment_not_docx: () => "Word(.docx) 파일이 아니에요.",
  attachment_docx_empty: () => "Word 파일에서 글자를 찾지 못했어요.",
  attachment_unsupported: () => "PDF, Word(.docx), 이미지, 텍스트 파일만 올릴 수 있어요.",
  ai_busy: () => "AI 서버가 혼잡해요. 잠시 뒤 다시 시도해 주세요.",
  generation_failed: () => "만들지 못했어요. 다시 시도해 주세요.",
  network: () => "네트워크 오류가 났어요. 다시 보내 주세요.",
};
const message = (d) => (MESSAGES[d?.code] ?? (() => "알 수 없는 오류가 났어요."))(d ?? {});

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

function askForCode() {
  stage = "code";
  bubble("coach", "안녕하세요! 시작하려면 안내받은 접근 코드를 입력해 주세요.");
  input.placeholder = "접근 코드";
}
function askForMail() {
  stage = "mail";
  bubble("coach", "면접 볼 회사의 구인 정보나 에이전트 메일을 아래에 붙여넣어 주세요.\n이력서·경력서가 있으면 📎로 함께 올려 주세요. (선택)");
  input.placeholder = "메일 내용을 붙여넣기…";
}
function askForPick(again) {
  stage = "pick";
  bubble("coach", again ? "다른 질문 번호를 입력하면 이어서 연습할 수 있어요." : `연습할 질문 번호를 입력하세요 (1~${session.questions.length})`);
  input.placeholder = "질문 번호";
}

function renderQuestions({ company_context: c, questions }) {
  const b = bubble("coach", `${c.company} · ${c.position}\n예상 질문 ${questions.length}개를 만들었어요.`);
  for (const q of questions) {
    const item = el("div", "q");
    item.append(el("span", "tag", q.stage), el("span", "tag", q.category));
    item.append(el("p", "ja", `${q.id.slice(1)}. ${q.question_ja}`), el("p", "ko", q.question_ko), el("p", "basis", `근거: ${q.basis_ko}`));
    b.append(item);
  }
  log.scrollTop = log.scrollHeight;
}

function renderScript(s) {
  const b = bubble("coach script", null);
  b.append(el("p", "title", "모범 스크립트"));
  b.append(el("p", "label", "日本語"), el("p", "ja", s.ja));
  b.append(el("p", "label", "발음"), el("p", "reading", s.reading));
  b.append(el("p", "legend", "↗ 올려 읽기 · ↘ 내려 읽기 · 《 》 강하게 · / 끊어 읽기"));
  b.append(el("p", "label", "한국어"), el("p", "ko", s.ko));
  const ul = el("ul", "points");
  for (const p of s.points) ul.append(el("li", null, p));
  b.append(el("p", "label", "억양 포인트"), ul);
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
  const wait = bubble("coach typing", "회사에 맞는 질문을 만들고 있어요… (30초 정도 걸려요)");
  try {
    const { res, data } = await post("/api/questions", { mail: text, attachment });
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
  if (!q) return bubble("err", `1~${session.questions.length} 사이의 번호를 입력해 주세요.`);
  current = q;
  stage = "answer";
  bubble("coach", `Q${n}. ${q.question_ja}\n(${q.question_ko})\n\n한국어나 일본어로 답해 보세요.`);
  input.placeholder = "답변 입력…";
}

async function onAnswer(text) {
  bubble("me", text);
  const wait = bubble("coach typing", "모범 스크립트를 만들고 있어요… (20초 정도 걸려요)");
  try {
    const context = session.company_context.facts.join("\n");
    const { res, data } = await post("/api/script", { question: current.question_ja, answer: text, context });
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

// Clear any unverified code left by an earlier page version; the chat always asks for the code on load.
sessionStorage.removeItem("code");
askForCode();
