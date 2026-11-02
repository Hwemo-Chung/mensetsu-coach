// REL-4: the practice session lives only in this browser's localStorage. Pure helpers (storage is passed in),
// so Node tests run them without a DOM. Every storage call is wrapped: a full or blocked storage must never
// turn a paid API result into an error.
export const SESSION_KEY = "mensetsu-session";
export const SESSION_VERSION = 2; // 1 (unversioned): question_ja / script.ja, before the pack-neutral field names

const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);
const str = (v) => typeof v === "string";

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
  const out = { ...s, version: SESSION_VERSION, company_context: { ...c, facts: Array.isArray(c.facts) ? c.facts : [] }, questions, attempts, notes: isObj(s.notes) ? s.notes : {} };
  if (Array.isArray(s.reverse)) out.reverse = s.reverse.filter(isObj).map(({ question_ja, ...r }) => ({ ...r, question: r.question ?? question_ja }));
  return out;
}
