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
