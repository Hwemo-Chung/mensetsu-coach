const $ = (id) => document.getElementById(id);
const log = $("log"), input = $("input"), send = $("send"), fileInput = $("file");
const SESSION_KEY = "mensetsu-session";
let attachment = null;

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
  bubble("coach", "안녕하세요! 시작하려면 안내받은 접근 코드를 입력해 주세요.");
  input.placeholder = "접근 코드";
}
function askForMail() {
  bubble("coach", "면접 볼 회사의 구인 정보나 에이전트 메일을 아래에 붙여넣어 주세요.\n이력서·경력서가 있으면 📎로 함께 올려 주세요. (선택)");
  input.placeholder = "메일 내용을 붙여넣기…";
}

function renderQuestions({ company_context: c, questions }) {
  const b = bubble("coach", `${c.company} · ${c.position}\n예상 질문 10개를 만들었어요.`);
  for (const q of questions) {
    const item = el("div", "q");
    item.append(el("span", "tag", q.stage), el("span", "tag", q.category));
    item.append(el("p", "ja", `${q.id.slice(1)}. ${q.question_ja}`), el("p", "ko", q.question_ko), el("p", "basis", `근거: ${q.basis_ko}`));
    b.append(item);
  }
  log.scrollTop = log.scrollHeight;
}

fileInput.addEventListener("change", () => {
  const f = fileInput.files[0];
  fileInput.value = "";
  if (!f) return;
  if (f.size > 3 * 1024 * 1024) return bubble("err", "파일은 3MB 이하만 올릴 수 있어요.");
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

  if (!sessionStorage.getItem("code")) {
    sessionStorage.setItem("code", text);
    bubble("me", "••••");
    return askForMail();
  }

  bubble("me", text.length > 300 ? `${text.slice(0, 300)}…` : text);
  if (attachment) bubble("me", `📄 ${attachment.name}`);
  const wait = bubble("coach typing", "회사에 맞는 질문을 만들고 있어요… (30초 정도 걸려요)");
  send.disabled = true;
  try {
    const res = await fetch("/api/questions", {
      method: "POST",
      headers: { "content-type": "application/json", "x-access-code": sessionStorage.getItem("code") },
      body: JSON.stringify({ mail: text, attachment }),
    });
    const data = await res.json().catch(() => ({ error: "서버 응답을 읽지 못했어요." }));
    wait.remove();
    if (res.status === 401) {
      sessionStorage.removeItem("code");
      bubble("err", data.error);
      return askForCode();
    }
    if (!res.ok) return bubble("err", data.error);
    // Session keeps only the model's company summary + questions, never the raw mail or attachment.
    localStorage.setItem(SESSION_KEY, JSON.stringify({ company_context: data.company_context, questions: data.questions, attempts: [] }));
    attachment = null;
    $("chip").hidden = true;
    renderQuestions(data);
  } catch {
    wait.remove();
    bubble("err", "네트워크 오류가 났어요. 다시 보내 주세요.");
  } finally {
    send.disabled = false;
  }
});

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) $("composer").requestSubmit();
});

sessionStorage.getItem("code") ? askForMail() : askForCode();
