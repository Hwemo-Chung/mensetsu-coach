// REL-4: the practice session lives only in this browser's localStorage. Pure helpers (storage is passed in),
// so Node tests run them without a DOM. Every storage call is wrapped: a full or blocked storage must never
// turn a paid API result into an error.
export const SESSION_KEY = "mensetsu-session";
export const SESSION_VERSION = 3; // 1 (unversioned): question_ja / script.ja, before the pack-neutral field names; 2: before company_context.research_brief

const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);
const str = (v) => typeof v === "string";
const RESEARCH_STATUSES = ["ok", "unavailable"];

export function saveSession(storage, session) {
  try {
    storage.setItem(SESSION_KEY, JSON.stringify({ ...session, version: SESSION_VERSION }));
    return true;
  } catch {
    return false;
  }
}

export function clearSession(storage) {
  try { storage.removeItem(SESSION_KEY); } catch {}
}

export function loadSession(storage) {
  try {
    return migrateSession(JSON.parse(storage.getItem(SESSION_KEY)));
  } catch {
    return null;
  }
}

// Validates a stored session and upgrades older shapes. Anything that cannot be drawn safely returns null.
export function migrateSession(s) {
  if (!isObj(s) || (s.version ?? 1) > SESSION_VERSION) return null;
  const c = s.company_context;
  if (!isObj(c) || !str(c.company) || !str(c.position)) return null;
  if (!Array.isArray(s.questions) || !s.questions.length) return null;
  const questions = s.questions.map((q) => {
    if (!isObj(q)) return null;
    const { question_ja, ...rest } = q;
    return { ...rest, question: q.question ?? question_ja };
  });
  if (!questions.every((q) => q && str(q.id) && str(q.question))) return null;
  const attempts = (Array.isArray(s.attempts) ? s.attempts : [])
    .filter((a) => isObj(a) && str(a.question_id) && str(a.answer))
    .map((a) => {
      if (!isObj(a.script) || !("ja" in a.script) || "text" in a.script) return a;
      const { ja, ...script } = a.script;
      return { ...a, script: { ...script, text: ja } };
    });
  // A bad brief loses only the brief: the questions and attempts must still come back.
  const { research_brief, ...context } = c;
  if (isObj(research_brief) && RESEARCH_STATUSES.includes(research_brief.research_status)) context.research_brief = research_brief;
  const { research_names, ...rest } = s;
  const out = { ...rest, version: SESSION_VERSION, company_context: { ...context, facts: Array.isArray(c.facts) ? c.facts : [] }, questions, attempts, notes: isObj(s.notes) ? s.notes : {} };
  if (isObj(research_names) && str(research_names.company) && str(research_names.position)) out.research_names = research_names;
  if (Array.isArray(s.reverse)) out.reverse = s.reverse.filter(isObj).map(({ question_ja, ...r }) => ({ ...r, question: r.question ?? question_ja }));
  return out;
}

// Source ids restart per run, so the old brief's output stops citing; the research label stays (figures out of model answers, reports unverified) and objects stay in place for state.current.
export function forgetBrief(session) {
  for (const q of session.questions) {
    if (q.basis_type !== "research") continue;
    delete q.source_ids;
    q.stale = true;
  }
  const hadReverse = !!session.reverse?.length;
  delete session.research_basis;
  delete session.reverse;
  return hadReverse;
}

// Desired position profile: reused across companies, so it has its own key and outlives the session. Sent only to the fit call.
export const DESIRED_KEY = "mensetsu-desired-profile";
const DESIRED_FIELDS = ["role_content", "excluded_roles", "hard_conditions", "min_salary_man", "max_overtime_hours"];

export function loadDesired(storage) {
  try {
    const v = JSON.parse(storage.getItem(DESIRED_KEY));
    return isObj(v) ? v : null;
  } catch {
    return null;
  }
}

export function saveDesired(storage, values) {
  const kept = Object.fromEntries(DESIRED_FIELDS.filter((k) => str(values[k]) && values[k].trim()).map((k) => [k, values[k]]));
  try {
    Object.keys(kept).length ? storage.setItem(DESIRED_KEY, JSON.stringify(kept)) : storage.removeItem(DESIRED_KEY);
  } catch {}
}

export function clearDesired(storage) {
  try { storage.removeItem(DESIRED_KEY); } catch {}
}

// The fit sections can quote the profile, so deleting it takes them too.
export function forgetFit(session) {
  const b = session?.company_context?.research_brief;
  if (!b) return;
  delete b.fit_evaluation;
  delete b.mismatch_flags;
  delete b.company_checkpoints;
}

// Post-interview debrief, one entry per company. Own key on purpose: it must survive finish and reset (the interview comes after
// practice, and the next round of the same company reuses it), and it is never part of the session the app sends from.
// It goes away by emptying the fields (that company) or from the options dialog (all). No API call receives it.
export const DEBRIEF_KEY = "mensetsu-debriefs";
const DEBRIEF_FIELDS = ["asked", "difficult", "outcome"];
const companyKey = (company) => String(company ?? "").normalize("NFKC").replace(/株式会社|\(株\)|\s/g, "").toLowerCase();

function allDebriefs(storage) {
  try {
    const v = JSON.parse(storage.getItem(DEBRIEF_KEY));
    return isObj(v) ? v : {};
  } catch {
    return {};
  }
}

export function loadDebrief(storage, company) {
  const all = allDebriefs(storage), k = companyKey(company);
  return Object.hasOwn(all, k) && isObj(all[k]) ? all[k] : null;
}

// false = not stored (full or blocked storage), so the dialog can say so.
export function saveDebrief(storage, company, values) {
  const { [companyKey(company)]: _, ...others } = allDebriefs(storage);
  const kept = Object.fromEntries(DEBRIEF_FIELDS.filter((k) => str(values[k]) && values[k].trim()).map((k) => [k, values[k]]));
  const all = Object.keys(kept).length ? { ...others, [companyKey(company)]: kept } : others;
  try {
    Object.keys(all).length ? storage.setItem(DEBRIEF_KEY, JSON.stringify(all)) : storage.removeItem(DEBRIEF_KEY);
    return true;
  } catch {
    return false;
  }
}

export function clearDebriefs(storage) {
  try { storage.removeItem(DEBRIEF_KEY); } catch {}
}
