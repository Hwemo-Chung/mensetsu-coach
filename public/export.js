import { selectCheckpoints } from "./conditions.js";

// F6: turns the browser session into one Markdown document. Pure function, so tests run it in Node.
// Same patterns and order as lib/privacy.js maskInput (public/ cannot import lib/; test/export.test.js keeps them equal).
const EMAIL = /[\w.+-]+[@＠][\w-]+(\.[\w-]+)+/g;
const PHONE = /\+?[\d０-９][\d０-９ \t.\-－‐]{8,}[\d０-９]/g;
const DATE = /^(?:\d{4}[.\-/－]\d{1,2}[.\-/－]\d{1,2}|(?:19|20)\d{2}[.\-－]\d{1,2}(?:[.\-－]\d{1,2})?(?:[ \t\-－‐]+(?:19|20)\d{2}[.\-－]\d{1,2}(?:[.\-－]\d{1,2})?)+)$/;
// 2026-11-05 11:00: PHONE stops at the colon and sees 「2026-11-05 11」. Only with a time right after it, so a phone never passes as this.
const DATETIME = /^(?:19|20)\d{2}[.\-](?:0?[1-9]|1[0-2])[.\-](?:0?[1-9]|[12]\d|3[01])[ \t]+(?:[01]?\d|2[0-3])$/;
// 11:00 - 2099-01-02 12:00: the first match starts at the minutes, so they are cut when a colon stands before them.
const isDate = (m, at, s) => {
  if (DATE.test(m)) return true;
  const t = m.normalize("NFKC");
  return /^[:：時]/.test(s.slice(at + m.length)) && DATETIME.test(/[:：]$/.test(s.slice(0, at)) ? t.replace(/^\d{2}[ \t]*[\-‐][ \t]*/, "") : t);
};
const PHONE_PAREN = /(?:\+?[\d０-９]+[ \t.\-－‐]?)?[(（][\d０-９]{1,5}[)）](?:[ \t.\-－‐]?[\d０-９]+)+/g;
const POSTAL = /(?:〒\s?)?[\d０-９]{3}[-－][\d０-９]{4}/g;
const SALUTATION = /^[ \t　]*[^\s　、。,.]{1,12}?(?:[ \t　][^\s　、。,.]{1,12}?)?[ \t　]*(様|さん|殿|님)[ \t　]*$/gm;
export const mask = (s) => String(s ?? "").replace(EMAIL, "[email]").replace(PHONE_PAREN, (m) => (m.match(/[\d０-９]/g).length >= 9 ? "[phone]" : m)).replace(PHONE, (m, at, s) => (isDate(m, at, s) ? m : "[phone]")).replace(POSTAL, "[〒]").replace(SALUTATION, "[氏名]$1");

// JP labels are the fallback for sessions saved before the server sent pack meta.
const JP_STEPS = [{ key: "fukusho", label: "復唱", optional: true }, { key: "ketsuron", label: "結論" }, { key: "kijun", label: "基準・数字" }, { key: "sentakushi", label: "締め" }];

export function sessionToMarkdown(session, t, debrief = null) {
  const c = session.company_context;
  const target = session.pack?.target ?? "ja"; // sessions saved before pack meta are Japan
  const out = [`# ${t.export.title} — ${c.company} · ${c.position}`, ""];
  if (c.facts?.length) out.push(...c.facts.map((f) => `- ${f}`), "");
  out.push(`## ${t.export.questions} (${session.questions.length})`, "");
  for (const q of session.questions) {
    out.push(`${q.id.slice(1)}. [${t.stages[q.stage] ?? q.stage} · ${t.categories[q.category] ?? q.category}] ${q.question}`, ...(q.question_tr ? [`   - ${q.question_tr}`] : []), `   - ${t.chat.basis}: ${q.basis}${basisTag(q, t) ? ` (${inert(basisTag(q, t))})` : ""}`);
    const note = session.notes?.[q.id]?.trim();
    if (note) out.push(`   - ${t.export.notes}: ${note.replace(/\n/g, "\n     ")}`); // indented so a multi-line memo stays in the item
  }
  session.attempts.forEach((a, i) => {
    const q = session.questions.find((x) => x.id === a.question_id);
    out.push("", `## ${t.export.practice} ${i + 1}: Q${q ? q.id.slice(1) : "?"}${practiceTime(a.at) ? ` (${practiceTime(a.at)})` : ""}`, "", `> ${q?.question ?? ""}`, "", `**${t.export.myAnswer}**`, "", a.answer, "");
    if (a.review) {
      const r = a.review;
      // The screen shows icons; the Markdown file keeps text marks (the i18n sentence itself has none).
      out.push(`### ${t.review.title}`, "", `- ${{ yes: "✓", no: "⚠" }[r.answers_question] ?? "?"} ${t.review.answers[r.answers_question]} — ${r.answers_question_reason}`);
      const steps = session.pack?.steps ?? JP_STEPS;
      steps.forEach(({ key, label, optional }, i) => {
        const v = r.steps[key];
        const name = `${label} ${t.steps[key]}${i === steps.length - 1 && r.closing ? ` · ${t.closings[r.closing]}` : ""}`;
        out.push(`- ${v.present ? "✓" : optional ? "·" : "✗"} ${name}${v.present ? "" : optional ? ` (${t.review.recommended}) → ${v.note}` : ` → ${v.note}`}`);
      });
      out.push("", `### ${t.review.corrections}`, "");
      if (!r.corrections.length) out.push(t.review.noCorrections);
      for (const x of r.corrections) out.push(`- 【${x.rule_id}】 ${x.before} → ${x.after} — ${x.reason}`);
      out.push("");
    }
    if (a.script) {
      const s = a.script;
      out.push(`### ${t.script.title}`, "", `**${t.script.text[target]}**`, "", s.text, "", ...scriptNotes(s, t));
      // No reading/translation when the interview language is the screen language.
      if (s.reading != null) out.push(`**${t.script.reading[target]}**`, "", s.reading, "", `_${t.script.legend}_`, "");
      if (s.translation != null) out.push(`**${t.script.translation}**`, "", s.translation, "");
      if (s.points?.length) out.push(`**${t.script.points}**`, "", ...s.points.map((p) => `- ${p}`));
    }
  });
  if (session.reverse?.length) {
    out.push("", `## ${t.reverse.title}`, "");
    session.reverse.forEach((q, i) => out.push(`${i + 1}. ${q.question}`, `   - ${t.reverse.intent}: ${q.intent}`, ...(citedIds(q).length ? [`   - ${t.reverse.source}: ${citedIds(q).map(inert).join(", ")}`] : [])));
  }
  const habits = habitCounts(session);
  if (habits.length) {
    out.push("", `## ${t.habits.summary}`, "", `| ${t.habits.rule} | ${t.habits.count} |`, "|---|---|");
    for (const h of habits) out.push(`| ${h.label}${h.habit ? " ⚠" : ""} | ${h.count} |`);
  }
  const written = ["asked", "difficult", "outcome"].filter((k) => debrief?.[k]?.trim());
  if (written.length) out.push("", `## ${t.debrief.title}`, "", written.map((k) => `**${t.debrief[k]}**\n\n${debrief[k].trim()}`).join("\n\n"));
  return mask(out.join("\n")) + researchSection(session, t) + (session.prep ? `\n\n${prepToMarkdown(session.prep, t, { omitBrowser: true })}` : "") + "\n";
}

// The script card's warnings as lines (render.js renderScript, scriptCheck): the code's word check, then the check against the answer; absent check = nothing claimed.
function scriptNotes(s, t) {
  const c = s.check, dropped = c?.dropped ? [t.verify.dropped({ n: c.dropped })] : [];
  const check = c === null ? [t.script.unchecked] : !c ? [] : c.unsupported.length ? [t.script.unsupported, ...c.unsupported.map((u) => `- 「${u.sentence}」（${t.verify.kinds[u.kind] ?? u.kind}）`), ...dropped] : dropped.length ? dropped : [t.script.checked];
  const lines = [...(s.unbacked?.length ? [`${t.script.unbacked} 「${s.unbacked.join("」「")}」`] : []), ...check];
  return lines.length ? [lines.join("\n"), ""] : [];
}

// Overlap between generated questions and those really asked. Text only, no AI. The tails are what nearly every question ends with; left in, they alone would match.
const QUESTION_TAIL = /(?:を|について|に関して)?(?:教えて|聞かせて|お聞かせ|話して|お話し|説明して|ご説明)?(?:ください|下さい|いただけますか|もらえますか|お願いします)$|(?:でしょうか|ですか|ますか|ますでしょうか)$|(?:에대해)?(?:말씀해|알려|설명해|얘기해|이야기해)?주세요$|(?:인가요|입니까|습니까|나요)$/;
const questionBigrams = (s) => {
  const t = s.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "").replace(QUESTION_TAIL, "");
  return new Set(Array.from({ length: Math.max(t.length - 1, 0) }, (_, i) => t.slice(i, i + 2)));
};
// Against the shorter side: an asked line is usually short notes, a generated question long and company-specific.
// shortcut: character pairs, so a paraphrase with other words is missed; enough for a private figure, no AI by design.
const sameQuestion = (a, b) => {
  if (Math.min(a.size, b.size) < 2) return false;
  return [...a].filter((x) => b.has(x)).length / Math.min(a.size, b.size) >= 0.6;
};

export function questionOverlap(questions, askedText) {
  const lines = String(askedText ?? "").normalize("NFKC").split(/[\n。?!]+/).map((l) => questionBigrams(l.replace(/^\s*\d+[.)、]/, ""))).filter((b) => b.size);
  const ids = new Set();
  let matched = 0;
  for (const line of lines) {
    const hit = questions.find((q) => [q.question, q.question_tr].some((text) => typeof text === "string" && sameQuestion(line, questionBigrams(text))));
    if (hit) { matched++; ids.add(hit.id); }
  }
  return { asked: lines.length, matched, ids: [...ids] };
}

// http(s) only, for the card's links and this file: a stored or model-written URL can carry any scheme.
export function linkable(url) {
  if (typeof url !== "string") return null;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

export const SNAPSHOT_FIELDS = ["legal_name", "business", "business_model", "size", "founded", "locations", "ownership"];
// Only what the code saw: a page read without the value, or not researched. Never "does not exist".
export const unknownText = (c, r) => r.unknownKind[c?.unknown_kind] ?? r.notFound;
// A claim counts only with a surviving source (gate 2), so a brief written by hand or edited in storage cannot show one without.
export const claimFound = (c) => typeof c?.value === "string" && c.value !== "not_found" && c.source_count > 0;
export const citedIds = (c) => (Array.isArray(c?.source_ids) ? c.source_ids : []);
export const claimMeta = (c, r) => [r.confidence[c.confidence] ?? r.confidence.unknown, c.single_source ? r.singleSource : r.sources({ n: c.source_count }), ...citedIds(c)];
export const listOf = (v) => (Array.isArray(v) ? v : []);

export const objects = (v) => listOf(v).filter((x) => x && typeof x === "object");

// What may leave the browser for the question call: sourced facts only. Self-claims, pay and conditions stay out, and the fit
// sections stay out because they can quote the desired profile, which only the fit call may receive.
export function briefFacts(b) {
  if (b?.research_status !== "ok") return [];
  const fact = (kind) => (c) => (claimFound(c) ? [{ kind, text: c.value, source_ids: citedIds(c) }] : []);
  const co = b.company_snapshot, pos = b.position_analysis;
  const thisPosition = (l) => l.filter((c) => c?.position_match === "exact"); // a matching posting is good enough to prepare from, unlike to compare conditions against
  return [
    ...SNAPSHOT_FIELDS.flatMap((k) => fact("company")(co?.[k])),
    ...listOf(co?.recent_news).flatMap(fact("news")),
    ...thisPosition([pos?.actual_work, pos?.team_context, ...listOf(pos?.required_skills)]).flatMap(fact("role")),
    ...thisPosition(listOf(pos?.preferred_skills)).flatMap(fact("role")).map((f) => ({ ...f, text: `歓迎: ${f.text}` })), // the prep document shows these as facts of the job (real run 11/06)
    ...listOf(b.interview_intelligence?.reported_questions).flatMap(fact("reported_question")),
  ];
}

// For reverse questions: facts minus candidate reports, plus interview checks; an unlabelled item or a research side without a real source stays out, so the desired profile cannot leave that way (gateFit traces quotes and relabels profile wording before this).
export function reverseFacts(b) {
  if (b?.research_status !== "ok") return [];
  const known = new Set(objects(b.sources).map((s) => s.id));
  const cited = (x) => citedIds(x).filter((id) => known.has(id));
  const quotable = (s) => typeof s?.quote === "string" && (s.origin === "mail" || (s.origin === "research" && cited(s).length > 0));
  const flags = objects(b.mismatch_flags).filter((f) => f.ask === "interview" && quotable(f.side_a) && quotable(f.side_b)).map((f) => {
    const sides = [f.side_a, f.side_b];
    // held: in the text as context for the model, but no proof of research (lib/reverse.js).
    return { text: `${f.topic ?? ""}: ${f.side_a.quote} / ${f.side_b.quote}`, source_ids: [...new Set(sides.flatMap((s) => (s.origin === "research" ? cited(s) : [])))], held: [f.topic, ...sides.filter((s) => s.origin === "mail").map((s) => s.quote)].filter((h) => typeof h === "string" && h) };
  });
  const checks = objects(b.company_checkpoints).filter((c) => c.ask === "interview" && ["mail", "research"].includes(c.origin) && typeof c.question === "string").map((c) => ({ text: c.question, source_ids: cited(c), ...(c.origin === "mail" && { held: [c.question] }) }));
  return [...briefFacts(b).filter((f) => f.kind !== "reported_question"), ...[...flags, ...checks].filter((c) => c.source_ids.length).map((c) => ({ kind: "check", ...c }))];
}

// Label from the fields code computed (lib/questions.js); a session without them gets none.
export function basisTag(q, t) {
  const research = q.basis_type === "research";
  const label = t.chat.basisType[research ? (q.reported ? "reported" : q.stale ? "stale" : "research") : q.basis_type];
  return label ? [label, ...(research ? citedIds(q) : [])].join(" · ") : "";
}

// Real links come only from a source that passed gate 1. Prefix only: Japanese has no spaces, so taking the rest of the token would eat the sentence.
export const noBareLinks = (s) => s.replace(/(?:https?|ftp):\/\/(?:www\.)?|www\./gi, "[url]");

// Web text must not become a link, image or HTML in a Markdown viewer, and a line break in it must not start a new block.
const inert = (s) => noBareLinks(String(s ?? "").replace(/\s+/g, " ")).replace(/[\\[\]<>`]/g, "\\$&");

// Stage R summary, checkpoints and sources. The URLs stay out of mask(): a long numeric page id would read as a phone number.
function researchSection(session, t) {
  const b = session.company_context.research_brief;
  if (b?.research_status !== "ok") return "";
  const r = t.research, sources = listOf(b.sources).filter((s) => s?.id);
  const out = ["", "", `## ${r.title(session.research_names ?? session.company_context)}`, "", r.date({ date: b.research_date }), ""];
  if (!sources.length) out.push(r.empty, "");
  if (b.tool_errors > 0) out.push(r.partial({ n: b.tool_errors }), "");
  out.push(`### ${r.snapshot}`, "");
  for (const k of SNAPSHOT_FIELDS) {
    const c = b.company_snapshot?.[k];
    out.push(`- ${r.fields[k]}: ${claimFound(c) ? `${inert(c.value)} (${claimMeta(c, r).map(inert).join(", ")})` : unknownText(c, r)}`);
  }
  out.push("", `### ${r.role}`, "", r.match[b.position_analysis?.position_match] ?? r.match.unknown);
  const checks = listOf(b.company_checkpoints).filter((c) => c?.question);
  if (checks.length) out.push("", `### ${r.checkpoints}`, "", ...checks.map((c) => { const ids = citedIds(c).map(inert).join(", "); return `- ${r.ask[c.ask] ? `${r.ask[c.ask]}: ` : ""}${inert(c.question)}${ids ? ` (${ids})` : ""}`; }));
  // No condition rows and no memo here: they are the user's own wishes and would read as a grade once the file is shared. The general questions are safe.
  const guide = selectCheckpoints(b.guides?.checkpoint_templates).filter((c) => typeof c?.text === "string");
  if (guide.length) out.push("", `### ${r.guideTitle}`, "", ...guide.map((c) => `- ${inert(r.audience[c.audience] ?? "")}: ${inert(c.text)}`));
  const lines = sources.map((s) => { const url = linkable(s.url); return `- ${mask(`${s.id}: ${inert(s.title)}`)}${url ? ` — ${url}` : ""}`; });
  return mask(out.join("\n")) + (lines.length ? `\n\n### ${r.sourceList}\n\n${lines.join("\n")}` : "");
}

// Interview prep document (PRD-SCRIPT-DOC). The two filled_by:"browser" sections come from what only this browser holds, at draw and download time, so they are never in the stored document.
const blanksIn = (s) => (typeof s === "string" ? s.match(/［[^］]*］/g) ?? [] : []);
const prepTexts = (s) => [...listOf(s.lines), ...objects(s.rows).map((r) => r.value), ...objects(s.items).map((x) => x.answer ?? x.question)];

// The user's own wishes as written; the status rows stay out because they read as a grade (see researchSection). job_tag and role_content are no conditions.
function conditionLines(d, t) {
  const o = t.opts, rows = [[o.desiredSalary, d?.min_salary_man], [o.desiredTarget, d?.salary_target_man], [o.desiredOvertime, d?.max_overtime_hours], [o.desiredEmployment, o.employment[d?.employment_required] ?? d?.employment_required], [o.desiredLocations, d?.locations], [o.desiredRemote, d?.remote_min_days], [o.desiredClientSite, d?.exclude_client_site === "1" ? o.desiredClientSiteNo : null], [o.desiredExcluded, d?.excluded_roles], [o.desiredHard, d?.hard_conditions]];
  return rows.filter(([, v]) => typeof v === "string" && v.trim()).map(([k, v]) => `${k}: ${v.trim()}`);
}

export function prepSlots(session, desired, t, brief) {
  const fit = brief?.research_status === "ok" ? brief.fit_evaluation : null, points = (label, v) => objects(v).filter((x) => typeof x.point === "string").map((x) => `${label}: ${x.point}`);
  return {
    wins: [...points(t.research.matches, fit?.matches), ...points(t.research.gaps, fit?.gaps), ...habitCounts(session).filter((h) => h.habit).map((h) => `${t.habits.summary}: ${h.label}`)],
    conditions: conditionLines(desired, t),
  };
}

// The one reader of a stored document, so the top count, the 要本人確認 list and the text cannot disagree (C4). omitBrowser: the session file, which holds neither browser section.
export function prepView(prep, { wins = [], conditions = [], omitBrowser = false } = {}) {
  const all = objects(prep?.sections), added = { win_points: wins, conditions }, order = all.map((s) => s.key);
  const slot = new Set(all.filter((s) => s.filled_by).map((s) => s.key));
  const shown = all.filter((s) => !(omitBrowser && s.filled_by && !s.keep)).map((s) => (s.filled_by ? { ...s, lines: [...listOf(s.lines), ...(added[s.key] ?? [])] } : s)); // keep: the pack's own sentences (offer), stored, so the session file has them
  const unresolved = [
    ...objects(prep?.unresolved).filter((u) => !slot.has(u.section)),
    ...shown.filter((s) => s.filled_by).flatMap((s) => s.lines.flatMap(blanksIn).map((text) => ({ kind: "blank", section: s.key, key: s.key, text }))),
  ].sort((a, b) => order.indexOf(a.section) - order.indexOf(b.section));
  return {
    sections: shown.map((s) => (s.key === "unresolved" ? { ...s, items: unresolved } : s)),
    unresolved,
    blanks: shown.filter((s) => s.key !== "unresolved").flatMap(prepTexts).flatMap(blanksIn).length,
    to_confirm: unresolved.filter((u) => u.kind !== "blank").length,
  };
}

// A regenerated bundle replaces its own sections only. An item that passed before and failed this time stays: it is paid for and passed the gates, as a failed re-run keeps the brief.
export function mergePrep(old, part) {
  const next = new Map(objects(part.sections).map((s) => [s.key, s]));
  const redone = (k) => listOf(part.generated).includes(next.get(k)?.bundle);
  const held = new Set();
  const sections = objects(old.sections).map((s) => {
    if (!redone(s.key)) return s;
    const fresh = objects(next.get(s.key).items), before = objects(s.items);
    if (s.columns) { // a numbered list: mixing two runs could repeat a question
      if (fresh.length >= before.length) return next.get(s.key);
      before.forEach((x) => held.add(x.key));
      if (!objects(old.failed).some((f) => f.key === s.key)) held.add(s.key);
      return s;
    }
    const kept = before.filter((x) => !fresh.some((y) => y.key === x.key));
    kept.forEach((x) => held.add(x.key));
    return { ...next.get(s.key), items: [...fresh, ...kept] }; // shortcut: a kept item goes last in its section; only after a failed retry, and the section order is what C1 fixes
  });
  const merged = {
    ...old, sections,
    failed: [...objects(old.failed).filter((f) => !listOf(part.generated).includes(f.bundle)), ...objects(part.failed).filter((f) => !held.has(f.key))],
    unresolved: [...objects(old.unresolved).filter((u) => !redone(u.section) || held.has(u.key)), ...objects(part.unresolved).filter((u) => redone(u.section) && !held.has(u.key))],
  };
  const { blanks, to_confirm } = prepView(merged);
  return { ...merged, blanks, to_confirm };
}

export const prepFileName = (d) => exportFileName(d).replace("mensetsu-", "mensetsu-prep-");

// inert keeps a string from becoming a link or HTML; at the start of a line it must not open a block either.
const mdLine = (s) => inert(s).replace(/^([#>+*|=~-])/, "\\$1").replace(/^(\d+)([.)])/, "$1\\$2");
// Two trailing spaces: Japanese / reading / meaning stay three lines of one set in a Markdown viewer.
const triple = (...lines) => lines.filter((x) => typeof x === "string" && x).map(mdLine).join("  \n");

function prepItemLines(x, p) {
  const bullets = [[p.asked, x.asked], [p.neighbor, x.neighbor], [p.order, listOf(x.order).join(" → ")]].filter(([, v]) => v).map(([k, v]) => `- ${k}: ${inert(v)}`);
  const evidence = objects(x.evidence).map((e) => `${inert(e.quote)}${e.verified ? "" : ` (${p.notInMaterial})`}`), followups = listOf(x.followups).map(inert);
  return [
    `### Q. ${inert(x.question)}`, "", ...(bullets.length ? [...bullets, ""] : []),
    `**${p.example}**`, "", triple(x.answer, x.reading, x.translation), "",
    ...(evidence.length ? [`- ${p.evidence}: ${evidence.join(", ")}`] : []),
    ...(followups.length ? [`- ${p.followups}: ${followups.join(" / ")}`] : []),
    ...(x.unverified === true ? [`- ⚠ ${p.unverified}`] : []),
    ...listOf(x.warnings).map((w) => `- ⚠ ${p.warn[w] ?? inert(w)}`),
    "",
  ];
}

// mask() would read a long numeric page id as a phone number, so the link replaces its marker after mask().
const SOURCE_MARK = /⟦(\d+)⟧/g;

function prepRowLine(s, r, p, pages) {
  if (s.key === "company_position") return `- ${p.kinds[r.kind] ?? inert(r.kind)}: ${inert(r.value)} (${listOf(r.source_ids).map((id) => (pages.has(id) ? `⟦${[...pages.keys()].indexOf(id)}⟧` : inert(id))).join(", ") || p.unconfirmed})`;
  if (s.key === "sources") return `- ${p.sourceRows[r.key] ?? inert(r.key)}: ${r.key === "inputs" ? String(r.value).split(",").map((k) => p.inputKinds[k] ?? inert(k)).join(", ") : inert(r.value)}`;
  return `- ${inert(r.label ?? r.key)}: ${inert(r.value)}`;
}

export function prepToMarkdown(prep, t, slots = {}) {
  const p = t.prep, view = prepView(prep, slots), failed = objects(prep?.failed), omitted = listOf(prep?.omitted_questions);
  const stage = prep?.stage ?? "first"; // a document from before stages was a first-interview one
  const out = [`# ${p.title} — ${inert(prep?.company)} · ${inert(prep?.position)}`, "", `> ⚠ ${p.verifyNotice}`, "", `${p.stage}: ${p.stageNames[stage] ?? inert(stage)}`, "", p.counts(view), "", p.readNote, ""];
  const cited = view.sections.filter((s) => s.key === "sources").flatMap((s) => objects(s.sources));
  const pages = new Map(cited.flatMap((s) => { const url = linkable(s.url); return url ? [[s.id, url]] : []; }));
  if (prep?.outdated) out.push(`> ⚠ ${p.outdated}`, "");
  if (omitted.length) out.push(`> ⚠ ${p.omitted({ ids: omitted.map((id) => `Q${inert(String(id).slice(1))}`).join(", ") })}`, "");
  for (const s of view.sections) {
    const native = p.sections[s.key], label = inert(s.label ?? s.key);
    out.push(`## ${label}${native && native !== s.label ? ` (${native})` : ""}`, "");
    for (const l of listOf(s.lines)) out.push(`- ${mdLine(l)}`);
    for (const r of objects(s.rows)) out.push(prepRowLine(s, r, p, pages));
    if (listOf(s.lines).length || objects(s.rows).length) out.push("");
    const items = objects(s.items);
    if (s.key === "unresolved") {
      for (const u of items) out.push(`- ${p.sections[u.section] ?? inert(u.section)} — ${p.unresolvedKinds[u.kind] ?? inert(u.kind)}: ${inert(u.text)}`);
      out.push(...(items.length ? [] : [p.nothing]), "");
    } else if (s.columns) items.forEach((x, i) => out.push(`**${i + 1}.** ${triple(x.question, x.reading, x.translation)}  `, `${t.reverse.intent}: ${inert(x.intent)}`, ""));
    else for (const x of items) out.push(...prepItemLines(x, p));
    const missed = failed.filter((f) => f.section === s.key).length;
    if (missed) out.push(`> ⚠ ${p.failed({ n: missed })}`, "");
  }
  // Outside mask() and last, as in researchSection: a long numeric page id would read as a phone number.
  const urls = cited.map((s) => { const url = linkable(s.url); return `- ${mask(`${inert(s.id)}: ${inert(s.title)}`)}${url ? ` — ${url}` : ""}`; });
  const ids = [...pages.keys()];
  const linked = mask(out.join("\n").trimEnd()).replace(SOURCE_MARK, (m, i) => (ids[i] === undefined ? m : `[${inert(ids[i])}](${pages.get(ids[i]).replace(/\(/g, "%28").replace(/\)/g, "%29")})`));
  return linked + (urls.length ? `\n\n${urls.join("\n")}` : "");
}

// F9: corrections per rule across the session. A rule seen twice or more is a habit.
export function habitCounts(session) {
  const m = new Map();
  for (const a of session.attempts) for (const c of a.review?.corrections ?? []) {
    const label = String(c.pattern ?? c.rule_id).split(" / ")[0].replace(/（[^）]*）/g, "").trim();
    const cur = m.get(c.rule_id) ?? { rule_id: c.rule_id, label, count: 0, habit: false };
    cur.count++;
    cur.habit = cur.count >= 2;
    m.set(c.rule_id, cur);
  }
  return [...m.values()].sort((x, y) => y.count - x.count);
}

export const exportFileName = (d) => {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  return `mensetsu-${p}.md`;
};

// When a practice was made (attempt.at), on the question card and in the file: Japan time like the calendar; a session saved before has none.
const AT = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", dateStyle: "short", timeStyle: "short" });
export const practiceTime = (at) => (Number.isFinite(Date.parse(at)) ? `${AT.format(new Date(at))} UTC+9` : "");

// Before/after view: the first and the latest reviewed attempt at one question. null until there are two.
export function compareAttempts(session, qid) {
  const tries = (session?.attempts ?? []).filter((a) => a.question_id === qid && a.review);
  if (tries.length < 2) return null;
  const [first, last] = [tries[0], tries.at(-1)];
  return {
    n: qid.slice(1),
    answered: [first.review.answers_question, last.review.answers_question],
    steps: (session.pack?.steps ?? JP_STEPS).map(({ key, label, optional }) => ({ key, label, ...(optional && { optional }), first: !!first.review.steps[key]?.present, last: !!last.review.steps[key]?.present })),
    answers: [first.answer, last.answer],
  };
}

// Rail status per question (UIUX §11.3), from the latest reviewed attempt: "todo" ○ none yet, "miss" ✗ the answer missed
// the question or a required step, "ok" ✓ answered with every required step (optional ones such as 復唱 do not count).
export function statusOf(session, qid) {
  const r = (session?.attempts ?? []).findLast((a) => a.question_id === qid && a.review)?.review;
  if (!r) return "todo";
  const steps = session.pack?.steps ?? JP_STEPS;
  return r.answers_question === "yes" && steps.every((s) => s.optional || r.steps[s.key]?.present) ? "ok" : "miss";
}
