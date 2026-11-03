// F6: turns the browser session into one Markdown document. Pure function, so tests run it in Node.
// Same patterns and order as lib/privacy.js maskInput (public/ cannot import lib/; test/export.test.js keeps them equal).
const EMAIL = /[\w.+-]+[@＠][\w-]+(\.[\w-]+)+/g;
const PHONE = /\+?[\d０-９][\d０-９ \t.\-－‐]{8,}[\d０-９]/g;
const DATE = /^\d{4}[.\-/－]\d{1,2}[.\-/－]\d{1,2}$/;
const POSTAL = /(?:〒\s?)?[\d０-９]{3}[-－][\d０-９]{4}/g;
const SALUTATION = /^[ \t　]*[^\s　、。,.]{1,12}?(?:[ \t　][^\s　、。,.]{1,12}?)?[ \t　]*(様|さん|殿|님)[ \t　]*$/gm;
export const mask = (s) => String(s ?? "").replace(EMAIL, "[email]").replace(PHONE, (m) => (DATE.test(m) ? m : "[phone]")).replace(POSTAL, "[〒]").replace(SALUTATION, "[氏名]$1");

// JP labels are the fallback for sessions saved before the server sent pack meta.
const JP_STEPS = [{ key: "fukusho", label: "復唱", optional: true }, { key: "ketsuron", label: "結論" }, { key: "kijun", label: "基準・数字" }, { key: "sentakushi", label: "締め" }];

export function sessionToMarkdown(session, t) {
  const c = session.company_context;
  const target = session.pack?.target ?? "ja"; // sessions saved before pack meta are Japan
  const out = [`# ${t.export.title} — ${c.company} · ${c.position}`, ""];
  if (c.facts?.length) out.push(...c.facts.map((f) => `- ${f}`), "");
  out.push(`## ${t.export.questions} (${session.questions.length})`, "");
  for (const q of session.questions) {
    out.push(`${q.id.slice(1)}. [${t.stages[q.stage] ?? q.stage} · ${t.categories[q.category] ?? q.category}] ${q.question}`, ...(q.question_tr ? [`   - ${q.question_tr}`] : []), `   - ${t.chat.basis}: ${q.basis}`);
    const note = session.notes?.[q.id]?.trim();
    if (note) out.push(`   - ${t.export.notes}: ${note.replace(/\n/g, "\n     ")}`); // indented so a multi-line memo stays in the item
  }
  session.attempts.forEach((a, i) => {
    const q = session.questions.find((x) => x.id === a.question_id);
    out.push("", `## ${t.export.practice} ${i + 1}: Q${q ? q.id.slice(1) : "?"}`, "", `> ${q?.question ?? ""}`, "", `**${t.export.myAnswer}**`, "", a.answer, "");
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
      out.push(`### ${t.script.title}`, "", `**${t.script.text[target]}**`, "", s.text, "");
      // No reading/translation when the interview language is the screen language.
      if (s.reading != null) out.push(`**${t.script.reading[target]}**`, "", s.reading, "", `_${t.script.legend}_`, "");
      if (s.translation != null) out.push(`**${t.script.translation}**`, "", s.translation, "");
      out.push(`**${t.script.points}**`, "", ...s.points.map((p) => `- ${p}`));
    }
  });
  if (session.reverse?.length) {
    out.push("", `## ${t.reverse.title}`, "");
    session.reverse.forEach((q, i) => out.push(`${i + 1}. ${q.question}`, `   - ${t.reverse.intent}: ${q.intent}`));
  }
  const habits = habitCounts(session);
  if (habits.length) {
    out.push("", `## ${t.habits.summary}`, "", `| ${t.habits.rule} | ${t.habits.count} |`, "|---|---|");
    for (const h of habits) out.push(`| ${h.label}${h.habit ? " ⚠" : ""} | ${h.count} |`);
  }
  return mask(out.join("\n")) + "\n";
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
