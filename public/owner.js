// Owner-only weak-point sync. Without a token in this browser none of this runs. Pure (storage is passed in), so Node tests run it.
const OWNER_KEY = "mensetsu-owner", HABITS_KEY = "mensetsu-habits", WINDOW = 30;
const NEVER_SENT = "str-visa-facts"; // residence-status signal must not be tied to an address

// The hash never reaches a server, and it goes even when the token is refused, so it does not linger in the address bar or history.
export function claimOwner(storage, loc, hist) {
  const m = /^#owner=(.*)$/.exec(loc.hash);
  if (!m) return;
  hist.replaceState(null, "", loc.pathname + loc.search);
  if (/^[!-~]{20,}$/.test(m[1])) try { storage.setItem(OWNER_KEY, m[1]); } catch {}
}

export function loadOwner(storage) {
  try { return storage.getItem(OWNER_KEY); } catch { return null; }
}

// Returns the window with this review added. Only ids, step keys and one flag are kept: "unclear" is not counted as not answering.
export function noteHabit(storage, review, steps) {
  let list = [];
  try {
    const saved = JSON.parse(storage.getItem(HABITS_KEY));
    if (Array.isArray(saved)) list = saved.filter((e) => e && typeof e === "object");
  } catch {}
  list = [...list, {
    r: (review.corrections ?? []).map((c) => c.rule_id).filter((id) => id !== NEVER_SENT),
    s: steps.filter((s) => !s.optional && !review.steps?.[s.key]?.present).map((s) => s.key),
    a: review.answers_question !== "no",
  }].slice(-WINDOW);
  try { storage.setItem(HABITS_KEY, JSON.stringify(list)); } catch {}
  return list;
}

const tally = (ids) => {
  const out = {};
  for (const id of ids) out[id] = Math.min((out[id] ?? 0) + 1, 999); // the server refuses anything above 999
  return out;
};

export const weakSummary = (list, lang, job_tags) => ({
  rules: tally(list.flatMap((e) => e.r ?? [])),
  steps: tally(list.flatMap((e) => e.s ?? [])),
  no: list.filter((e) => e.a === false).length,
  attempts: list.length,
  lang,
  job_tags,
});
