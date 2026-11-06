// Interview prep document: the dialog, the call and the card. Everything from the model or the web goes through textContent (el).
import { $, el, T, LS, state, bubble, waiting, fold, persist, message, readAttachment } from "./render.js";
import { briefFacts, linkable, listOf, mergePrep, objects, prepFileName, prepSlots, prepToMarkdown, prepView } from "./export.js";
import { forgetPrepBrief, loadDesired } from "./session.js";

const fields = (attr) => [...document.querySelectorAll(`[${attr}]`)];
const headerInputs = () => fields("data-prep-header"), answerInputs = () => fields("data-prep-input");
const values = (list, attr) => Object.fromEntries(list.map((e) => [e.getAttribute(attr), e.value.trim()]).filter(([, v]) => v));

let deps = null;
let card = null;
let running = false;
// The resume stays in the dialog and this variable, never in the session: a reload loses it, as with the mail.
let file = null;
let retryBundles = null;

const researchBrief = () => (deps.researchOn() ? state.session?.company_context.research_brief ?? null : null);
const slots = () => prepSlots(state.session, loadDesired(LS), T(), researchBrief());
const lock = (on) => { for (const b of document.querySelectorAll(".prep-ctl")) b.disabled = on; };

function button(cls, text, onClick) {
  const b = el("button", cls, text);
  b.type = "button";
  b.addEventListener("click", onClick);
  return b;
}

export const prepButton = () => {
  const b = button("inline-btn prep-ctl", T().prep.button, () => openDialog());
  b.disabled = running;
  return b;
};

function openDialog(bundles = null) {
  if (!state.session) return; // a button left in the log after finish
  retryBundles = bundles;
  const saved = state.session.prep_inputs;
  if (saved) {
    for (const e of headerInputs()) e.value = saved.header?.[e.dataset.prepHeader] ?? "";
    for (const e of answerInputs()) e.value = saved.inputs?.[e.dataset.prepInput] ?? "";
  }
  const pick = $("prepStage");
  pick.value = state.session.prep?.stage ?? "first"; // the stage of the document on screen; a document from before stages was first
  if (!pick.value) pick.value = "first"; // a stored stage the list does not offer
  pick.disabled = Boolean(bundles); // a retry remakes parts of that same document
  $("prepMsg").textContent = "";
  $("prep").showModal();
}

async function generate(bundles) {
  if (running || !state.session) return;
  running = true;
  lock(true);
  const t = T().prep, s = state.session, my = state.epoch, run = deps.run();
  const live = () => my === state.epoch && run === deps.run() && state.session;
  const wait = waiting(bundles ? t.waitRetry : t.wait);
  try {
    const brief = researchBrief(), names = deps.names(), facts = briefFacts(brief);
    const header = values(headerInputs(), "data-prep-header"), inputs = values(answerInputs(), "data-prep-input");
    const body = {
      material: $("prepMaterial").value.trim(), ...(file && { attachment: file }),
      questions: s.questions.map(({ id, question, category, basis_type }) => ({ id, question, category, ...(basis_type === "research" && { basis_type }) })),
      context: { company: names.company, position: names.position, facts: listOf(s.company_context.facts) },
      // briefFacts picks what may leave: the fit sections can quote the desired profile, which only the fit call may receive.
      ...(facts.length && { research_facts: facts, sources: listOf(brief.sources) }),
      header, inputs, lang: state.lang, pack: s.pack?.id ?? "jp", ...(bundles && { bundles }),
      stage: bundles ? s.prep?.stage ?? "first" : $("prepStage").value, // mergePrep must get the same document's sections back
    };
    const { res, data } = await deps.post("/api/prep", body);
    if (!live()) return;
    if (!res.ok) return deps.failed(res, data);
    const cur = state.session, doc = bundles && cur.prep ? mergePrep(cur.prep, data) : data;
    // Replaced while this was being made: its ids point into a brief that is gone, or it answers questions that are.
    if (brief && cur.company_context.research_brief !== brief) forgetPrepBrief(doc);
    if (cur.questions !== s.questions) doc.outdated = true;
    cur.prep = doc;
    cur.prep_inputs = { header, inputs };
    persist();
    if (bundles && card) draw();
    else {
      card?.remove();
      card = null;
      showPrep();
      card.parentElement.scrollTop = card.offsetTop - card.parentElement.offsetTop; // a long card is read from its top
    }
  } catch {
    if (live()) bubble("err", message({ code: "network" }));
  } finally {
    wait.remove();
    running = false;
    lock(false);
  }
}

function itemBody(box, x, p) {
  const q = el("div", "prep-q");
  q.append(el("p", "ja prep-question", x.question));
  const note = (label, v) => { if (v) q.append(el("p", "legend", `${label}: ${v}`)); };
  note(p.asked, x.asked);
  note(p.neighbor, x.neighbor);
  note(p.order, listOf(x.order).join(" → "));
  q.append(el("p", "label", p.example), el("p", "ja", x.answer));
  if (typeof x.reading === "string") q.append(el("p", "reading", x.reading));
  if (typeof x.translation === "string") q.append(el("p", "tr", x.translation));
  note(p.evidence, objects(x.evidence).map((e) => `${e.quote}${e.verified ? "" : ` (${p.notInMaterial})`}`).join(", "));
  note(p.followups, listOf(x.followups).join(" / "));
  if (x.unverified === true) q.append(el("p", "caution", p.unverified));
  for (const w of listOf(x.warnings)) q.append(el("p", "legend", p.warn[w] ?? w));
  box.append(q);
}

function reverseBody(box, x, i, t) {
  const q = el("div", "prep-q");
  q.append(el("p", "ja prep-question", `${i + 1}. ${x.question}`));
  if (typeof x.reading === "string") q.append(el("p", "reading", x.reading));
  if (typeof x.translation === "string") q.append(el("p", "tr", x.translation));
  q.append(el("p", "legend", `${t.reverse.intent}: ${x.intent ?? ""}`));
  box.append(q);
}

// Each cited id opens its page; an id without a usable page stays plain text.
function citedLinks(ids, pages) {
  const line = el("p", "legend");
  ids.forEach((id, i) => {
    if (i) line.append(" · ");
    const url = linkable(pages.find((x) => x.id === id)?.url);
    if (!url) return line.append(id);
    const a = el("a", null, id);
    Object.assign(a, { href: url, target: "_blank", rel: "noopener noreferrer" });
    line.append(a);
  });
  return line;
}

function rowsBody(box, s, p, pages) {
  for (const r of objects(s.rows)) {
    if (s.key === "company_position") {
      box.append(el("p", "claim", `${p.kinds[r.kind] ?? r.kind ?? ""}: ${r.value ?? ""}`), listOf(r.source_ids).length ? citedLinks(listOf(r.source_ids), pages) : el("p", "legend", p.unconfirmed));
    } else if (s.key === "sources") {
      box.append(el("p", "claim", `${p.sourceRows[r.key] ?? r.key ?? ""}: ${r.key === "inputs" ? String(r.value).split(",").map((k) => p.inputKinds[k] ?? k).join(", ") : r.value ?? ""}`));
    } else box.append(el("p", "claim", `${r.label ?? r.key ?? ""}: ${r.value ?? ""}`));
  }
}

function sourcesBody(box, s) {
  const list = objects(s.sources);
  if (!list.length) return;
  const ul = el("ul", "sources");
  for (const x of list) {
    const li = el("li"), url = linkable(x.url);
    li.append(`${x.id ?? ""} `);
    if (url) {
      const a = el("a", null, x.title ?? url);
      Object.assign(a, { href: url, target: "_blank", rel: "noopener noreferrer" });
      li.append(a);
    } else li.append(x.title ?? "");
    ul.append(li);
  }
  box.append(ul);
}

function section(s, doc, opened, t, pages) {
  const p = t.prep, items = objects(s.items), label = p.sections[s.key] ?? s.label ?? s.key ?? "";
  const box = fold(card, items.length ? `${label} (${items.length})` : label, "fold-body");
  const details = box.parentElement;
  details.dataset.section = s.key ?? "";
  details.open = opened(s.key);
  for (const l of listOf(s.lines)) box.append(el("p", "claim", l));
  rowsBody(box, s, p, pages);
  if (s.key === "unresolved") {
    for (const u of items) box.append(el("p", "claim", `${p.sections[u.section] ?? u.section ?? ""} — ${p.unresolvedKinds[u.kind] ?? u.kind ?? ""}: ${u.text ?? ""}`));
    if (!items.length) box.append(el("p", "legend", p.nothing));
  } else if (s.columns) items.forEach((x, i) => reverseBody(box, x, i, t));
  else for (const x of items) itemBody(box, x, p);
  if (s.key === "sources") sourcesBody(box, s);
  const missed = objects(doc.failed).filter((f) => f.section === s.key);
  if (!missed.length) return;
  // Outside the fold, so a failure shows without opening anything.
  const row = el("p", "caution prep-failed", `${p.failed({ n: missed.length })} `);
  const bundles = [...new Set(missed.map((f) => f.bundle).filter((b) => typeof b === "string"))];
  const again = button("inline-btn prep-ctl", p.retry, () => ($("prepMaterial").value.trim() || file ? generate(bundles) : openDialog(bundles)));
  again.disabled = running;
  row.append(again);
  card.append(row);
}

function draw() {
  const t = T(), p = t.prep, doc = state.session.prep, view = prepView(doc, slots());
  const had = card.querySelector("details") ? new Set([...card.querySelectorAll("details[open]")].map((d) => d.dataset.section)) : new Set(["self_intro"]);
  card.replaceChildren();
  const head = el("p", "title", `${p.title} — ${doc.company ?? ""} · ${doc.position ?? ""} `);
  head.append(el("span", "tag stage", p.stageNames[doc.stage ?? "first"] ?? doc.stage));
  card.append(head, el("p", "caution", p.verifyNotice), el("p", "legend", p.counts(view)), el("p", "legend", p.readNote));
  if (doc.outdated) card.append(el("p", "caution", p.outdated));
  const omitted = listOf(doc.omitted_questions);
  if (omitted.length) card.append(el("p", "caution", p.omitted({ ids: omitted.map((id) => `Q${String(id).slice(1)}`).join(", ") })));
  card.append(button("inline-btn", p.download, () => {
    try {
      deps.download(prepFileName(new Date()), `${prepToMarkdown(state.session.prep, T(), slots())}\n`);
    } catch {
      bubble("err", message({ code: "unknown" }));
    }
  }));
  const pages = view.sections.flatMap((s) => objects(s.sources));
  for (const s of view.sections) section(s, doc, (k) => had.has(k), t, pages);
}

// Draws the stored document in a new card (a finished run, or a restore).
export function showPrep() {
  if (!state.session?.prep) return;
  card = bubble("coach prep", null);
  draw();
}

// What the card shows also comes from the profile, the fit and the habits, so it follows them.
export function redrawPrep() {
  if (card && state.session?.prep) draw();
}

// The session is gone or replaced: its card stays readable but dead, and the next company starts with empty entries.
export function endPrep() {
  if (card) for (const b of card.querySelectorAll("button")) { b.classList.remove("prep-ctl"); b.disabled = true; }
  card = file = retryBundles = null;
  $("prepMaterial").value = $("prepFile").value = "";
  for (const e of [...headerInputs(), ...answerInputs()]) e.value = "";
}

export function initPrep(d) {
  deps = d;
  const msg = $("prepMsg"), dialog = $("prep");
  $("prepCancel").addEventListener("click", () => dialog.close());
  $("prepFile").addEventListener("change", (e) => {
    const f = e.target.files[0];
    file = null;
    msg.textContent = "";
    if (!f) return;
    const refuse = (text) => { msg.textContent = text; e.target.value = ""; };
    // lib/prep-api.js keeps text only: a PDF or an image can be neither masked nor checked against a quote.
    if (!/\.(docx|txt|md)$/i.test(f.name)) return refuse(message({ code: "material_required" }));
    readAttachment(f, (a) => { file = a; }, refuse);
  });
  $("prepForm").addEventListener("submit", (e) => {
    e.preventDefault();
    if (!$("prepMaterial").value.trim() && !file) return void (msg.textContent = message({ code: "material_required" }));
    dialog.close();
    generate(retryBundles);
  });
}
