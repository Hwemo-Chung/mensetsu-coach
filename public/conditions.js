// Stage R: the user's own wishes against what a posting states, row by row, in the browser only. Pure, so tests run it in Node.
// Deliberately no total, score, sort or colour: arithmetic on the user's own figures is not a grade of the company.
const STATUSES = ["met", "unmet", "unknown"];
// News, company databases, interview posts and averages may be shown but never decide.
const DECIDING_SOURCES = ["official_careers", "official_other", "job_board"];
const found = (c) => typeof c?.value === "string" && c.value !== "not_found" && c.source_count > 0;
const words = (s) => String(s ?? "").split(/[\n,、，/／・]+/).map((w) => w.trim()).filter(Boolean);
const number = (s) => (/^\d{1,6}$/.test(s) ? Number(s) : undefined);

// The stored form stays strings under the keys the fit call already reads; this is the only place it is reshaped.
export function conditionProfile(d) {
  const min = number(d?.min_salary_man), target = number(d?.salary_target_man), hours = number(d?.max_overtime_hours), days = number(d?.remote_min_days);
  return {
    ...(min !== undefined && { salary_min_jpy: min * 10000 }),
    ...(target !== undefined && { salary_target_jpy: target * 10000 }),
    ...(hours !== undefined && { monthly_overtime_max: hours }),
    // shortcut: one required form from a select; let several be chosen if users ask.
    ...(d?.employment_required && { employment_required: [d.employment_required] }),
    ...(words(d?.locations).length && { locations: words(d.locations) }),
    ...(days !== undefined && { remote_min_days: days }),
    ...(words(d?.excluded_roles).length && { excluded_roles: words(d.excluded_roles) }),
    ...(d?.exclude_client_site === "1" && { exclude_client_site: true }),
    ...(d?.job_tag && { job_tags: [d.job_tag] }),
  };
}

// A floor at or above the wish meets it, a ceiling below misses it, and a range across it stays unknown. Number check first: null >= 0 is true in JS.
const pay = (want, c) => (Number.isInteger(c.min_jpy) && c.min_jpy >= want ? "met" : Number.isInteger(c.max_jpy) && c.max_jpy < want ? "unmet" : "unknown");

const AXES = [
  ["salary_min", "salary_min_jpy", "salary", pay],
  ["salary_target", "salary_target_jpy", "salary", pay],
  // fixed_overtime_hours is what the pay covers, not what is worked, so only monthly_hours decides.
  ["overtime", "monthly_overtime_max", "overtime", (want, c) => (!Number.isInteger(c.monthly_hours) ? "unknown" : c.monthly_hours <= want ? "met" : "unmet")],
  ["employment", "employment_required", "employment", (want, c) => (!c.kind || c.kind === "unknown" ? "unknown" : want.includes(c.kind) ? "met" : "unmet")],
  // shortcut: plain substring, so spelling variants stay unknown; normalize prefectures if that proves common.
  ["location", "locations", "work_location", (want, c) => (want.some((w) => c.value.includes(w)) ? "met" : "unknown")],
  ["remote", "remote_min_days", "work_style", () => "unknown"], // a stated policy never proves how often it is used
  ["excluded_role", "excluded_roles", "actual_work", (want, c) => (want.some((w) => c.value.includes(w)) ? "unmet" : "unknown")],
  ["client_site", "exclude_client_site", "client_site_work", (_, c) => ({ stated_no: "met", stated_yes: "unmet" })[c.stated] ?? "unknown"],
];

export function checkConditions(brief, profile, answers = {}) {
  const pos = brief?.position_analysis ?? {}, types = new Map((brief?.sources ?? []).map((s) => [s?.id, s?.source_type]));
  return AXES.flatMap(([axis, key, field, decide]) => {
    const desired = profile?.[key];
    if (desired === undefined || desired === null) return [];
    const c = pos[field], on = found(c), source_ids = on ? c.source_ids : [];
    const usable = on && c.position_match === "exact" && source_ids.every((id) => DECIDING_SOURCES.includes(types.get(id)));
    const row = { axis, desired, observed: on ? c.value : null, status: usable ? decide(desired, c) : "unknown", basis: usable ? (c.applies_to_position === true ? "posting_url" : "posting_name_match") : "none", source_ids, ask: "agent" };
    const a = answers?.[axis];
    // The user picks the status themselves, so a vague general answer never outranks the posting by itself.
    return [STATUSES.includes(a?.status) ? { ...row, status: a.status, basis: "user_answer", answer: { speaker: a.speaker ?? "", written: a.written === true, date: a.date ?? "" } } : row];
  });
}

// Web budget 0: what is worth asking is decided here. A settled axis asks nothing, since the answer changes no decision.
// shortcut: no separate placement for direct applications, because the app does not know the route; add an input if that matters.
export function selectCheckpoints(templates, rows = [], { tags = [], memo = false } = {}) {
  const settled = new Set(rows.filter((r) => r.status !== "unknown").map((r) => r.axis));
  return (Array.isArray(templates) ? templates : []).filter((t) => !settled.has(t?.axis) && (!t?.tags || t.tags.some((x) => tags.includes(x))) && (t?.axis !== "review_memo" || memo));
}
