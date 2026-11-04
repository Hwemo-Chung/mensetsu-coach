// Stage R cards: the name confirmation and the brief. Everything from the model or the web goes through textContent.
import { $, el, T, bubble, fold } from "./render.js";
import { SNAPSHOT_FIELDS, citedIds, claimFound, claimMeta, linkable } from "./export.js";

const NAME_MAX = 100; // api/research.js refuses longer names
const listOf = (v) => (Array.isArray(v) ? v : []);
const objects = (v) => listOf(v).filter((x) => x && typeof x === "object");
const heading = (b, text) => b.append(el("h3", "label", text));
const bold = (b, text) => { const p = el("p", "claim"); p.append(el("b", null, text)); b.append(p); };
const withIds = (text, x) => [text, ...citedIds(x)].join(" · ");

export function renderConfirm(names, onStart) {
  const r = T().research, b = bubble("coach brief brief-confirm", null), form = el("form", "brief-form");
  const field = (label, value) => {
    const wrap = el("label", null, label), input = el("input", "research-ctl");
    Object.assign(input, { type: "text", value: value ?? "", required: true, maxLength: NAME_MAX, autocomplete: "off" });
    wrap.append(input);
    form.append(wrap);
    return input;
  };
  form.append(el("p", "title", r.confirmTitle), el("p", "legend", r.confirmBody));
  const company = field(r.company, names.company), position = field(r.position, names.position);
  const go = el("button", "inline-btn research-ctl", r.start);
  form.append(go);
  const lock = (on) => { for (const e of [company, position, go]) e.disabled = on; };
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    lock(true);
    onStart({ company: company.value.trim(), position: position.value.trim() }, () => lock(false));
  });
  b.append(form);
  return b;
}

// One claim: label + value, then its confidence, source count and ids; a not_found claim says so in words.
function claim(box, label, c, cautions = []) {
  const r = T().research, on = claimFound(c), p = el("p", "claim");
  if (label) p.append(el("b", null, label), " ");
  p.append(on ? c.value : r.notFound);
  box.append(p);
  if (!on) return;
  box.append(el("p", "legend", claimMeta(c, r).join(" · ")));
  for (const text of cautions) box.append(el("p", "caution", text));
}

// Gate 5: anything not from this exact position says so on its own line and is never stated as its conditions.
const notThisPosition = (c, r) => (c?.applies_to_position === true ? [] : [r.claimMatch[c?.position_match] ?? r.claimMatch.unknown]);

function position(b, p, r) {
  heading(b, r.role);
  b.append(el("p", "legend", r.match[p?.position_match] ?? r.match.unknown));
  const row = (label, c, extra = []) => claimFound(c) && claim(b, label, c, [...notThisPosition(c, r), ...extra]);
  row(r.work, p?.actual_work);
  row(r.team, p?.team_context);
  for (const c of objects(p?.required_skills)) row(r.required, c);
  for (const c of objects(p?.preferred_skills)) row(r.preferred, c);
  const pay = (v) => r.included[v] ?? r.included.unknown;
  row(r.salary, p?.salary, [r.salaryNote({ bonus: pay(p?.salary?.bonus_included), overtime: pay(p?.salary?.overtime_pay_included) })]);
  for (const c of objects(p?.conditions)) row(r.conditions, c);
}

function mismatches(b, flags, r) {
  if (!flags.length) return;
  heading(b, r.mismatch);
  b.append(el("p", "legend", r.mismatchNote));
  // Gate 5 holds here too: a figure from a similar posting says so next to the quote.
  const side = (s) => [el("p", "side", withIds(`${r.origin[s?.origin] ?? ""}: ${s?.quote ?? ""}`, s)), ...(s?.position_match ? [el("p", "caution", r.claimMatch[s.position_match] ?? r.claimMatch.unknown)] : [])];
  for (const f of flags) {
    bold(b, f.topic ?? "");
    b.append(...side(f.side_a), ...side(f.side_b), el("p", "caution", f.verify_prompt ?? ""));
  }
}

function reputation(b, themes, r) {
  heading(b, r.reputation);
  if (!themes.length) return b.append(el("p", "claim", r.notFound));
  for (const t of themes) {
    const sample = t.sample_size && t.sample_size !== "unknown" ? r.sample({ n: t.sample_size }) : r.sampleUnknown;
    claim(b, r.polarity[t.polarity], t, [[sample, r.rep[t.representativeness]].filter(Boolean).join(" · ")]);
  }
}

function interview(b, iv, r) {
  const stages = objects(iv?.selection_stages).filter(claimFound), asked = objects(iv?.reported_questions).filter(claimFound);
  heading(b, r.interview);
  if (!stages.length && !asked.length) return b.append(el("p", "claim", r.noReports));
  for (const c of stages) claim(b, r.stages, c, [r.unverified]);
  if (asked.length) b.append(el("h3", "label", r.questions));
  for (const c of asked) claim(b, null, c, [r.unverified]);
}

function fit(b, f, r) {
  const matches = objects(f?.matches), gaps = objects(f?.gaps), confirm = listOf(f?.needs_user_confirmation);
  if (!matches.length && !gaps.length && !confirm.length) return;
  heading(b, r.fit);
  const items = (label, list) => {
    if (!list.length) return;
    bold(b, label);
    for (const x of list) b.append(el("p", "side", x.point ?? ""), el("p", "legend", withIds(`${r.basis[x.basis] ?? ""}: ${x.quote ?? ""}`, x)));
  };
  items(r.matches, matches);
  items(r.gaps, gaps);
  if (!confirm.length) return;
  bold(b, r.confirm);
  for (const q of confirm) b.append(el("p", "side", q));
}

function checkpoints(b, list, r) {
  if (!list.length) return;
  heading(b, r.checkpoints);
  for (const c of list) b.append(el("p", "side", withIds(`${r.ask[c.ask] ? `${r.ask[c.ask]}: ` : ""}${c.question ?? ""}`, c)));
}

// Only http(s) becomes a link; the rest stays listed as text. The title is text in either case.
function sources(b, list, r) {
  if (!list.length) return;
  const ul = el("ul", "sources");
  for (const s of list) {
    const li = el("li"), url = linkable(s.url);
    li.append(`${s.id ?? ""} `);
    if (url) {
      const a = el("a", null, s.title ?? url);
      Object.assign(a, { href: url, target: "_blank", rel: "noopener noreferrer" });
      li.append(a);
    } else li.append(s.title ?? "");
    if (s.published_date) li.append(el("span", "legend", ` · ${r.published({ date: s.published_date })}`));
    ul.append(li);
  }
  fold(b, r.sourcesTitle({ n: list.length }), "fold-body").append(ul);
}

// The fit call answers after the card is up, so its sections have their own places and keep the spec's order. An empty brief clears them.
export function showFit(card, brief) {
  const r = T().research, flags = card.querySelector(".fit-flags"), rest = card.querySelector(".fit-rest");
  if (!flags) return;
  flags.replaceChildren();
  rest.replaceChildren();
  mismatches(flags, objects(brief.mismatch_flags), r);
  fit(rest, brief.fit_evaluation, r);
  checkpoints(rest, objects(brief.company_checkpoints), r);
}

// names: what was searched. kept: a failed re-run, with the earlier brief still stored. onFit: absent when a re-run could only lose the mail's side.
export function renderBrief(brief, names, onRerun, kept = false, onFit = null) {
  const r = T().research, b = bubble("coach brief", null), log = $("log");
  b.append(el("p", "title", r.title({ company: names.company, position: names.position })));
  if (brief.research_status === "ok") {
    const found = objects(brief.sources);
    b.append(el("p", "legend", r.date({ date: brief.research_date })));
    if (!found.length) b.append(el("p", "caution", r.empty));
    if (brief.tool_errors > 0) b.append(el("p", "caution", r.partial({ n: brief.tool_errors })));
    heading(b, r.snapshot);
    for (const k of SNAPSHOT_FIELDS) claim(b, r.fields[k], brief.company_snapshot?.[k]);
    const news = objects(brief.company_snapshot?.recent_news).filter(claimFound);
    if (news.length) heading(b, r.news);
    for (const c of news) claim(b, null, c);
    position(b, brief.position_analysis, r);
    b.append(el("div", "fit-flags"));
    reputation(b, objects(brief.reputation_themes).filter(claimFound), r);
    interview(b, brief.interview_intelligence, r);
    b.append(el("div", "fit-rest"));
    showFit(b, brief);
    sources(b, found, r);
  } else {
    b.append(el("p", "caution", r.unavailable));
    if (kept) b.append(el("p", "legend", r.kept));
  }
  const again = el("button", "inline-btn research-ctl", r.rerun);
  again.type = "button";
  again.addEventListener("click", () => { again.disabled = true; onRerun(); });
  b.append(again);
  if (brief.research_status === "ok" && onFit) {
    const refit = el("button", "inline-btn research-ctl refit", r.refit);
    refit.type = "button";
    refit.addEventListener("click", () => onFit(b));
    b.append(" ", refit);
  }
  log.scrollTop = b.offsetTop - log.offsetTop; // a long card is read from its top, not its last line
  return b;
}
