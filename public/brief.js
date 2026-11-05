// Stage R cards: the name confirmation and the brief. Everything from the model or the web goes through textContent.
import { $, el, T, bubble, fold, LS, persist, state } from "./render.js";
import { SNAPSHOT_FIELDS, citedIds, claimFound, claimMeta, linkable, unknownText } from "./export.js";
import { checkConditions, conditionProfile, selectCheckpoints } from "./conditions.js";
import { forgetPrepClaim, loadCompanyNotes, loadDesired, saveCompanyNotes } from "./session.js";
import { redrawPrep } from "./prep.js";

const NAME_MAX = 100, URL_MAX = 250; // api/research.js refuses longer ones
const MEMO_MAX = 300; // a summary in the user's own words; pasted review text is a copyright problem and is warned against
const ANSWERS = ["met", "unmet", "unknown"];
const listOf = (v) => (Array.isArray(v) ? v : []);
const objects = (v) => listOf(v).filter((x) => x && typeof x === "object");
const heading = (b, text) => b.append(el("h3", "label", text));
const bold = (b, text) => { const p = el("p", "claim"); p.append(el("b", null, text)); b.append(p); };
const withIds = (text, x) => [text, ...citedIds(x)].join(" · ");

export function renderConfirm(names, onStart) {
  const r = T().research, b = bubble("coach brief brief-confirm", null), form = el("form", "brief-form");
  const field = (label, value, required = true, maxLength = NAME_MAX) => {
    const wrap = el("label", null, label), input = el("input", "research-ctl");
    Object.assign(input, { type: "text", value: value ?? "", required, maxLength, autocomplete: "off" });
    wrap.append(input);
    form.append(wrap);
    return input;
  };
  form.append(el("p", "title", r.confirmTitle), el("p", "legend", r.confirmBody));
  const company = field(r.company, names.company), position = field(r.position, names.position);
  const location = field(r.location, names.location, false), companyUrl = field(r.companyUrl, names.company_url, false, URL_MAX), postingUrl = field(r.postingUrl, names.posting_url, false, URL_MAX);
  form.append(el("p", "legend", r.urlNote));
  const go = el("button", "inline-btn research-ctl", r.start);
  form.append(go);
  const lock = (on) => { for (const e of [company, position, location, companyUrl, postingUrl, go]) e.disabled = on; };
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const optional = Object.entries({ location: location.value.trim(), company_url: companyUrl.value.trim(), posting_url: postingUrl.value.trim() }).filter(([, v]) => v);
    lock(true);
    onStart({ company: company.value.trim(), position: position.value.trim(), ...Object.fromEntries(optional) }, () => lock(false));
  });
  b.append(form);
  return b;
}

let hideable = false; // the tour's sample has nothing to correct and nowhere to save it

// Correction path: a hidden claim stops being a claim, so it also leaves every later request and the file.
function hideButton(c, r, nodes) {
  const b = el("button", "link-btn research-ctl", r.hide);
  b.type = "button";
  b.addEventListener("click", () => {
    forgetPrepClaim(state.session, c.value);
    Object.assign(c, { value: "not_found", source_ids: [], source_count: 0, single_source: false, unknown_kind: "hidden" });
    persist();
    for (const n of nodes) n.remove();
    redrawPrep();
  });
  return b;
}

// One claim: label + value, then its confidence, source count and ids; a not_found claim says what was actually done.
function claim(box, label, c, cautions = []) {
  const r = T().research, on = claimFound(c), p = el("p", "claim");
  if (label) p.append(el("b", null, label), " ");
  p.append(on ? c.value : unknownText(c, r));
  box.append(p);
  if (!on) return;
  const meta = el("p", "legend", claimMeta(c, r).join(" · ")), notes = cautions.map((text) => el("p", "caution", text));
  if (hideable) meta.append(" ", hideButton(c, r, [p, meta, ...notes]));
  box.append(meta, ...notes);
}

// Gate 5: anything not from this exact position says so on its own line and is never stated as its conditions; a matching title is not yet this offer.
const notThisPosition = (c, r) => (c?.applies_to_position === true ? [] : [c?.position_match === "exact" ? r.nameMatch : r.claimMatch[c?.position_match] ?? r.claimMatch.unknown]);

function position(b, p, r) {
  heading(b, r.role);
  b.append(el("p", "legend", r.match[p?.position_match] ?? r.match.unknown));
  let found = false;
  const row = (label, c, extra = []) => { if (claimFound(c)) { found = true; claim(b, label, c, [...notThisPosition(c, r), ...extra]); } };
  row(r.work, p?.actual_work);
  row(r.team, p?.team_context);
  for (const c of objects(p?.required_skills)) row(r.required, c);
  for (const c of objects(p?.preferred_skills)) row(r.preferred, c);
  const pay = (v) => r.included[v] ?? r.included.unknown;
  row(r.salary, p?.salary, [r.salaryNote({ bonus: pay(p?.salary?.bonus_included), overtime: pay(p?.salary?.overtime_pay_included) })]);
  for (const k of ["employment", "overtime", "work_location", "work_style", "client_site_work", "change_scope"]) row(r.positionFields[k], p?.[k]);
  for (const c of objects(p?.conditions)) row(r.conditions, c);
  if (!found) b.append(el("p", "claim", r.lacking));
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

// Rows without a total, a colour or a sort: each one is the user's own figure against a stated one, and a recorded answer outranks the posting.
function conditionRows(box, brief, company, r, profile, live) {
  const notes = live ? loadCompanyNotes(LS, company) : { memos: [], answers: {} };
  const rows = checkConditions(brief, profile, notes.answers);
  heading(box, r.conditions_);
  if (!rows.length) box.append(el("p", "legend", r.conditionsEmpty));
  for (const row of rows) {
    const p = el("p", "claim");
    p.append(el("b", null, r.axis[row.axis]), ` ${row.status === "unmet" && ["excluded_role", "client_site"].includes(row.axis) ? r.excludedHit : r.status[row.status]}`);
    box.append(p);
    if (row.observed) box.append(el("p", "legend", [row.observed, ...row.source_ids].join(" · ")));
    if (row.basis === "posting_name_match") box.append(el("p", "caution", r.nameMatch));
    if (row.answer) box.append(el("p", "legend", r.answered({ speaker: row.answer.speaker || r.answerUnknown, date: row.answer.date || r.answerUnknown, written: r.written[row.answer.written ? "yes" : "no"] })));
    if (row.status === "unknown") box.append(el("p", "side", r.ask[row.ask]));
    if (live) answerForm(box, row, company, r, () => showConditions(box.closest(".msg.brief"), brief, company));
  }
  if (rows.length) box.append(el("p", "legend", r.conditionsNotice));
  const guide = selectCheckpoints(brief.guides?.checkpoint_templates, rows, { tags: profile.job_tags, memo: notes.memos.length > 0 }).filter((t) => typeof t?.text === "string");
  if (!guide.length) return;
  const body = fold(box, r.guideTitle, "fold-body");
  body.append(el("p", "legend", r.quotePolicy));
  for (const t of guide) body.append(el("p", "side", `${r.audience[t.audience] ?? ""}: ${t.text}`));
}

// The user picks the status: a general answer must not silently outrank the posting.
function answerForm(box, row, company, r, redraw) {
  const body = fold(box, r.answerTitle, "fold-body"), saved = loadCompanyNotes(LS, company).answers[row.axis] ?? {};
  const status = el("select", "research-ctl"), speaker = el("input", "research-ctl"), date = el("input", "research-ctl"), written = el("input", "research-ctl");
  for (const v of ["", ...ANSWERS]) { const o = el("option", null, v ? r.status[v] : r.answerNone); o.value = v; status.append(o); }
  status.value = saved.status ?? "";
  Object.assign(speaker, { type: "text", maxLength: 50, value: saved.speaker ?? "", autocomplete: "off" });
  Object.assign(date, { type: "date", value: saved.date ?? "" });
  Object.assign(written, { type: "checkbox", checked: saved.written === true });
  const labelled = (text, input) => { const l = el("label", null, text); l.append(input); return l; };
  const save = el("button", "inline-btn research-ctl", r.answerSave);
  save.type = "button";
  save.addEventListener("click", () => {
    const notes = loadCompanyNotes(LS, company), { [row.axis]: _, ...others } = notes.answers;
    saveCompanyNotes(LS, company, { ...notes, answers: status.value ? { ...others, [row.axis]: { status: status.value, speaker: speaker.value.trim(), date: date.value, written: written.checked } } : others });
    redraw();
  });
  body.append(labelled(r.answerStatus, status), labelled(r.answerSpeaker, speaker), labelled(r.answerDate, date), labelled(r.answerWritten, written), save);
}

export function showConditions(card, brief, company, sample = null) {
  const box = card?.querySelector(".fit-conditions");
  if (!box) return;
  box.replaceChildren();
  conditionRows(box, brief, company, T().research, conditionProfile(sample ?? loadDesired(LS)), !sample);
}

const elapsedDays = (date) => { const n = Math.floor((Date.now() - Date.parse(date)) / 864e5); return n >= 1 ? n : 0; };

// Decision A: the server reads no review site. The user may look for themselves and keep their own short note here, which only unlocks one fixed open question.
function reviewCheck(b, brief, company, r) {
  const body = fold(b, r.memoTitle, "fold-body");
  const sites = el("ul", "review-sites");
  for (const s of objects(brief.guides?.review_sites)) {
    const url = linkable(s.url);
    if (!url) continue;
    const a = el("a", null, new URL(url).hostname.replace(/^www\./, ""));
    Object.assign(a, { href: url, target: "_blank", rel: "noopener noreferrer" });
    const li = el("li");
    li.append(a);
    sites.append(li);
  }
  body.append(el("p", "legend", r.memoNote), sites);
  const list = el("div"), form = el("form", "brief-form");
  const input = (label, attrs, tag = "input") => { const l = el("label", null, label), e = el(tag, "research-ctl"); Object.assign(e, attrs); l.append(e); form.append(l); return e; };
  const site = input(r.memoSite, { type: "text", maxLength: 50, required: true, autocomplete: "off" }), date = input(r.memoDate, { type: "date", required: true });
  const score = input(r.memoScore, { type: "text", maxLength: 10, autocomplete: "off" }), sample = input(r.memoSample, { type: "text", maxLength: 20, autocomplete: "off" }), summary = input(r.memoSummary, { maxLength: MEMO_MAX, rows: 2, required: true }, "textarea");
  const add = el("button", "inline-btn research-ctl", r.memoAdd);
  form.append(el("p", "caution", r.memoWarn), add);
  const save = (memos) => { saveCompanyNotes(LS, company, { ...loadCompanyNotes(LS, company), memos }); draw(); showConditions(b, brief, company); };
  const draw = () => {
    const { memos } = loadCompanyNotes(LS, company);
    list.replaceChildren();
    memos.forEach((m, i) => {
      const gone = el("button", "link-btn research-ctl", r.memoDelete);
      gone.type = "button";
      gone.addEventListener("click", () => save(memos.filter((_, j) => j !== i)));
      const days = elapsedDays(m.date);
      const meta = el("p", "legend", [m.site, m.date, ...(days ? [r.elapsed({ n: days })] : []), ...(m.score ? [r.memoScoreShown({ n: m.score })] : []), m.sample ? r.memoShown({ n: m.sample }) : r.memoNoSample, r.memoLabel].join(" · "));
      meta.append(" ", gone);
      list.append(el("p", "side", m.summary ?? ""), meta);
    });
  };
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    save([...loadCompanyNotes(LS, company).memos, { site: site.value.trim(), date: date.value, score: score.value.trim(), sample: sample.value.trim(), summary: summary.value.trim() }]);
    form.reset();
  });
  body.append(list, form);
  draw();
}

function conflicts(b, list, r) {
  if (!list.length) return; // four pages find a conflict only by chance, so no entry is no proof of agreement
  heading(b, r.conflicts);
  for (const x of list) {
    bold(b, x.topic ?? "");
    b.append(el("p", "side", withIds(x.side_a?.value ?? "", x.side_a)), el("p", "side", withIds(x.side_b?.value ?? "", x.side_b)));
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
    if (s.source_type === "job_board") li.append(el("span", "legend", ` · ${r.jobBoard}`));
    if (s.published_date) li.append(el("span", "legend", ` · ${r.published({ date: s.published_date })}`));
    li.append(el("span", "legend", ` · ${s.fetched ? r.fetched : r.searchOnly}`));
    if (s.retrieved_at) li.append(el("span", "legend", ` · ${r.retrieved({ at: s.retrieved_at })}`));
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

// names: what was searched. onRerun: absent in the tour, which calls no API. kept: a failed re-run, with the earlier brief still stored. onFit: absent when a re-run could only lose the mail's side. sample: the tour's fictional profile.
export function renderBrief(brief, names, onRerun, kept = false, onFit = null, sample = null) {
  const r = T().research, b = bubble("coach brief", null), log = $("log");
  hideable = !!onRerun;
  b.append(el("p", "title", r.title({ company: names.company, position: names.position })));
  if (brief.research_status === "ok") {
    const found = objects(brief.sources);
    const days = elapsedDays(brief.research_date);
    b.append(el("p", "legend", [r.date({ date: brief.research_date }), ...(days ? [r.elapsed({ n: days })] : [])].join(" · ")));
    const known = SNAPSHOT_FIELDS.filter((k) => claimFound(brief.company_snapshot?.[k])).length;
    if (known * 2 < SNAPSHOT_FIELDS.length) b.append(el("p", "caution", r.insufficient({ found: known, total: SNAPSHOT_FIELDS.length })));
    if (!found.length) b.append(el("p", "caution", r.empty));
    if (brief.tool_errors > 0) b.append(el("p", "caution", r.partial({ n: brief.tool_errors })));
    if (brief.coverage) b.append(el("p", "legend", [r.coverage({ searches: brief.coverage.searches, fetches: brief.coverage.fetches, ok: brief.coverage.fetch_ok }), ...(brief.coverage.budget_exhausted ? [r.budget] : [])].join(" · ")));
    if (!names.location) b.append(el("p", "legend", r.sameName));
    if (brief.banned_removed > 0) b.append(el("p", "legend", r.bannedRemoved({ n: brief.banned_removed })));
    if (brief.fair_hiring_removed > 0) b.append(el("p", "legend", r.fairHiring));
    b.append(el("p", "legend", r.notice));
    heading(b, r.snapshot);
    for (const k of SNAPSHOT_FIELDS) claim(b, r.fields[k], brief.company_snapshot?.[k]);
    const news = objects(brief.company_snapshot?.recent_news).filter(claimFound);
    if (news.length) heading(b, r.news);
    for (const c of news) claim(b, null, c);
    const money = objects(brief.company_snapshot?.financials).filter(claimFound);
    if (money.length) heading(b, r.financials);
    for (const c of money) claim(b, null, c);
    const claims = objects(brief.company_snapshot?.self_claims).filter(claimFound);
    if (claims.length) { heading(b, r.selfClaims); b.append(el("p", "legend", r.selfClaimsNote)); }
    for (const c of claims) claim(b, null, c);
    conflicts(b, objects(brief.source_conflicts), r);
    position(b, brief.position_analysis, r);
    b.append(el("div", "fit-conditions"), el("div", "fit-flags"));
    interview(b, brief.interview_intelligence, r);
    if (onRerun) reviewCheck(b, brief, names.company, r);
    b.append(el("div", "fit-rest"));
    showFit(b, brief);
    showConditions(b, brief, names.company, sample);
    sources(b, found, r);
  } else {
    b.append(el("p", "caution", r.unavailable));
    if (kept) b.append(el("p", "legend", r.kept));
  }
  if (onRerun) {
    const again = el("button", "inline-btn research-ctl", r.rerun);
    again.type = "button";
    again.addEventListener("click", () => { again.disabled = true; onRerun(); });
    b.append(again);
  }
  if (brief.research_status === "ok" && onFit) {
    const refit = el("button", "inline-btn research-ctl refit", r.refit);
    refit.type = "button";
    refit.addEventListener("click", () => onFit(b));
    b.append(" ", refit);
  }
  log.scrollTop = b.offsetTop - log.offsetTop; // a long card is read from its top, not its last line
  return b;
}
