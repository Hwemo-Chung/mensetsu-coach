// F6: turns the browser session into one Markdown document. Pure function, so tests run it in Node.
const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
const PHONE = /\+?\d[\d\s-]{8,}\d/g;
const mask = (s) => String(s ?? "").replace(EMAIL, "[email]").replace(PHONE, "[phone]");

const STEPS = [["fukusho", "復唱"], ["ketsuron", "結論"], ["kijun", "基準・数字"], ["sentakushi", "選択肢"]];

export function sessionToMarkdown(session, t) {
  const c = session.company_context;
  const out = [`# ${t.export.title} — ${c.company} · ${c.position}`, ""];
  if (c.facts?.length) out.push(...c.facts.map((f) => `- ${f}`), "");
  out.push(`## ${t.export.questions} (${session.questions.length})`, "");
  for (const q of session.questions) {
    out.push(`${q.id.slice(1)}. [${t.stages[q.stage] ?? q.stage} · ${t.categories[q.category] ?? q.category}] ${q.question_ja}`, `   - ${q.question_tr}`, `   - ${t.chat.basis}: ${q.basis}`);
  }
  session.attempts.forEach((a, i) => {
    const q = session.questions.find((x) => x.id === a.question_id);
    out.push("", `## ${t.export.practice} ${i + 1}: Q${q ? q.id.slice(1) : "?"}`, "", `> ${q?.question_ja ?? ""}`, "", `**${t.export.myAnswer}**`, "", a.answer, "");
    if (a.review) {
      const r = a.review;
      out.push(`### ${t.review.title}`, "", `- ${t.review.answers[r.answers_question]} — ${r.answers_question_reason}`);
      for (const [key, label] of STEPS) {
        const v = r.steps[key];
        out.push(`- ${v.present ? "✓" : "✗"} ${label} ${t.steps[key]}${v.present ? "" : ` → ${v.note}`}`);
      }
      out.push("", `### ${t.review.corrections}`, "");
      if (!r.corrections.length) out.push(t.review.noCorrections);
      for (const x of r.corrections) out.push(`- 【${x.rule_id}】 ${x.before} → ${x.after} — ${x.reason}`);
      out.push("");
    }
    if (a.script) {
      const s = a.script;
      out.push(`### ${t.script.title}`, "", `**${t.script.ja}**`, "", s.ja, "", `**${t.script.reading}**`, "", s.reading, "", `_${t.script.legend}_`, "", `**${t.script.translation}**`, "", s.translation, "", `**${t.script.points}**`, "", ...s.points.map((p) => `- ${p}`));
    }
  });
  if (session.reverse?.length) {
    out.push("", `## ${t.reverse.title}`, "");
    session.reverse.forEach((q, i) => out.push(`${i + 1}. ${q.question_ja}`, `   - ${t.reverse.intent}: ${q.intent}`));
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
