import { createHmac } from "node:crypto";

// Daily tip mailing. The tip is built from the pack by date (no AI call). Storage and sending are plain REST
// calls (Upstash Redis, Resend) so tests swap them for in-memory fakes.

const DAY = 24 * 60 * 60 * 1000;
const JST = 9 * 60 * 60 * 1000;
const TIMEOUT = 10_000; // per call: a hung provider must not use up the cron's whole run
export const tipIndex = (date) => Math.floor((date.getTime() + JST) / DAY);
const jstMonthDay = (date) => {
  const d = new Date(date.getTime() + JST);
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}`;
};

export const normalizeEmail = (e) => String(e ?? "").trim().toLowerCase();
export const isEmail = (e) => /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 254;
// The id is the only thing that appears in links, so an email address never ends up in a URL or a log.
export const subscriberId = (email, secret) => createHmac("sha256", secret).update(normalizeEmail(email)).digest("hex").slice(0, 40);

const TEXT = {
  ko: { subject: (d) => `[面接コーチ] 오늘의 면접 연습 ${d}`, question: "오늘의 질문", structure: "4문형으로 답해 보기", rule: "오늘의 첨삭 규칙", practice: "연습하러 가기", unsubscribe: "수신 거부" },
  en: { subject: (d) => `[面接コーチ] Today's interview practice ${d}`, question: "Today's question", structure: "Answer in the 4-step pattern", rule: "Today's correction rule", practice: "Practice now", unsubscribe: "Unsubscribe" },
  ja: { subject: (d) => `[面接コーチ] 今日の面接練習 ${d}`, question: "今日の質問", structure: "4文型で答えてみる", rule: "今日の添削ルール", practice: "練習する", unsubscribe: "配信停止" },
};
export const MAIL_LANGS = Object.keys(TEXT);

// Off by default: with API keys set, the app must still not offer signup or mail anyone but the owner.
export const mailPublic = (env = process.env) => env.MAIL_PUBLIC === "1";
export const ownerToken = (env = process.env) => (env.MAIL_OWNER_TOKEN?.length >= 20 ? env.MAIL_OWNER_TOKEN : null);
export const ownerAddress = (env = process.env) => (ownerToken(env) && env.MAIL_OWNER_TO) || null;

export const jstDate = (date) => new Date(date.getTime() + JST).toISOString().slice(0, 10);
// 00:00 UTC is 09:00 JST, the hour the cron runs. The round trip rejects dates like 02-30; before 1970 tipIndex goes negative and indexes nothing.
export function parseTipDate(s) {
  const d = new Date(`${s}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && d.getTime() >= 0 && jstDate(d) === s ? d : null;
}

const NEVER_SENT = "str-visa-facts"; // residence-status signal must not be tied to an address
const isCount = (n) => Number.isInteger(n) && n >= 0 && n <= 999;
const counts = (o, allowed) => o !== null && typeof o === "object" && !Array.isArray(o) && Object.entries(o).every(([k, n]) => allowed.has(k) && isCount(n));

// True only for exactly the counts the browser may sync: no other key can carry answer text or a company name.
export function validWeak(b, pack) {
  if (b === null || typeof b !== "object" || Array.isArray(b)) return false;
  if (Object.keys(b).sort().join() !== "attempts,job_tags,lang,no,rules,steps") return false;
  const rules = new Set(pack.correction_rules.map((r) => r.id).filter((id) => id !== NEVER_SENT));
  const steps = new Set(pack.answer_structure.steps.filter((s) => !s.optional).map((s) => s.key));
  const tags = new Set(pack.research.checkpoint_templates.flatMap((t) => t.tags ?? []));
  return counts(b.rules, rules) && counts(b.steps, steps) && isCount(b.no) && isCount(b.attempts) && MAIL_LANGS.includes(b.lang) && Array.isArray(b.job_tags) && b.job_tags.every((t) => tags.has(t));
}

const OWNER_TEXT = {
  ko: { steps: { fukusho: "질문 확인", ketsuron: "결론", kijun: "근거 하나", sentakushi: "맺음" }, times: (n) => `${n}회`, weak: (n) => `최근 ${n}회 답변에서 자주 나온 것`, missed: "자주 빠지는 단계", noAnswer: "질문에 답하지 않음", notStored: "※답변 원문은 저장하지 않습니다.", expression: "오늘의 표현", checkpoint: "이번 주 확인 포인트" },
  en: { steps: { fukusho: "Restate", ketsuron: "Conclusion", kijun: "One reason or number", sentakushi: "Close" }, times: (n) => `${n} times`, weak: (n) => `Most frequent in your last ${n} answers`, missed: "Steps you often miss", noAnswer: "Did not answer the question", notStored: "* Your answers themselves are not stored.", expression: "Today's expression", checkpoint: "This week's checkpoint" },
  ja: { steps: { fukusho: "復唱", ketsuron: "結論", kijun: "基準・数字", sentakushi: "締め" }, times: (n) => `${n}回`, weak: (n) => `直近${n}回で多かったもの`, missed: "抜けやすい段階", noAnswer: "質問に答えていない", notStored: "※回答の本文は保存していません。", expression: "今日の表現", checkpoint: "今週の確認ポイント" },
};

const ruleLabel = (r) => r.pattern.split(" / ")[0].replace(/（[^）]*）/g, "").trim(); // same label as the app's F9 line (public/export.js)
const SEPARATOR = "- - - - - - - - - - - - - - - - - - - -";

function weakBlock(pack, weak, t, i) {
  if (!weak) return [];
  // Walks the pack, not the stored keys, so a stored id can never reach the mail by itself.
  const byCount = (list, of) => list.filter((x) => of[x.id ?? x.key] >= 2).sort((a, b) => of[b.id ?? b.key] - of[a.id ?? a.key]);
  const top = byCount(pack.correction_rules.filter((r) => r.id !== NEVER_SENT), weak.rules ?? {}).slice(0, 3);
  const rule = top[i % top.length];
  const missed = byCount(pack.answer_structure.steps, weak.steps ?? {});
  const lines = [
    ...(rule ? [`「${ruleLabel(rule)}」 ${t.times(weak.rules[rule.id])}`] : []),
    ...(rule?.token ? [`  ${rule.example_before}`, `  → ${rule.example_after}`] : []),
    ...(missed.length ? [`${t.missed}: ${missed.map((s) => `${t.steps[s.key]} ${t.times(weak.steps[s.key])}`).join(", ")}`] : []),
    ...(weak.no > 0 ? [`${t.noAnswer}: ${t.times(weak.no)}`] : []),
  ];
  return lines.length ? [SEPARATOR, `■ ${t.weak(weak.attempts)}`, ...lines, t.notStored, SEPARATOR, ""] : [];
}

// shortcut: one template per tag today, so a tagged owner sees the same line every Monday; add templates or alternate with the general ones if that gets stale.
function mondayCheckpoint(pack, tags, i) {
  const all = pack.research.checkpoint_templates;
  const fit = all.filter((c) => c.tags?.some((x) => tags.includes(x)));
  const pool = fit.length ? fit : all.filter((c) => !c.tags && c.axis !== "review_memo");
  return pool[Math.floor(i / 7) % pool.length].text;
}

// The owner's mail: every sentence comes from the pack or from OWNER_TEXT, no AI call. weak = null is the common tip.
export function ownerTip(pack, date, weak, appUrl = "") {
  const lang = MAIL_LANGS.includes(weak?.lang) ? weak.lang : "ko";
  const t = OWNER_TEXT[lang], base = TEXT[lang], i = tipIndex(date);
  const expressions = pack.correction_rules.filter((r) => r.token);
  const expression = expressions[i % expressions.length];
  const monday = new Date(date.getTime() + JST).getUTCDay() === 1;
  const tags = Array.isArray(weak?.job_tags) ? weak.job_tags : [];
  const text = [
    `■ ${base.question}`, pack.daily_questions[i % pack.daily_questions.length], "",
    `■ ${base.structure}`, ...pack.answer_structure.steps.map((s, n) => `${n + 1}. ${t.steps[s.key]} — ${s.example}`), "",
    ...weakBlock(pack, weak, t, i),
    `■ ${t.expression}`, expression.example_before, `→ ${expression.example_after}`, "",
    ...(monday ? [`■ ${t.checkpoint}`, mondayCheckpoint(pack, tags, i), ""] : []),
    ...(appUrl ? [`▶ ${base.practice}: ${appUrl}`] : []),
  ].join("\n").trim();
  return { subject: base.subject(jstMonthDay(date)), text };
}

export function dailyTip(pack, date, lang, unsubscribeUrl, appUrl = "") {
  const t = TEXT[lang] ?? TEXT.ko;
  const i = tipIndex(date);
  const question = pack.daily_questions[i % pack.daily_questions.length];
  const rule = pack.correction_rules[i % pack.correction_rules.length];
  const steps = pack.answer_structure.steps.map((s, n) => `${n + 1}. ${s.label} — ${s.example}`).join("\n");
  const text = [
    `■ ${t.question}`, question, "",
    `■ ${t.structure}`, steps, "",
    `■ ${t.rule}`, `【${rule.id}】 ${rule.example_before} → ${rule.example_after}`, "",
    appUrl ? `▶ ${t.practice}: ${appUrl}` : "",
    `${t.unsubscribe}: ${unsubscribeUrl}`,
  ].filter((l, n, a) => l !== "" || a[n - 1] !== "").join("\n");
  return { subject: t.subject(jstMonthDay(date)), question, text };
}

// Upstash Redis REST (Vercel Marketplace sets KV_REST_API_*). Returns null when not configured.
export function makeStore(env = process.env) {
  const url = env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const cmd = async (...args) => {
    const r = await fetch(url, { method: "POST", signal: AbortSignal.timeout(TIMEOUT), headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(args) });
    if (!r.ok) throw new Error(`store ${r.status}`);
    return (await r.json()).result;
  };
  return {
    set: (id, v) => cmd("HSET", "subscribers", id, JSON.stringify(v)),
    del: (id) => cmd("HDEL", "subscribers", id),
    incr: (target) => cmd("HINCRBY", "demand", target, 1),
    put: (key, value, seconds) => cmd("SET", key, JSON.stringify(value), "EX", seconds),
    get: async (key) => JSON.parse(await cmd("GET", key)),
    // A corrupted row comes back as null, so one bad row cannot stop everyone else's mail.
    all: async () => {
      const flat = (await cmd("HGETALL", "subscribers")) ?? [];
      const out = [];
      for (let i = 0; i < flat.length; i += 2) {
        let row = null;
        try { row = JSON.parse(flat[i + 1]); } catch {}
        out.push([flat[i], row]);
      }
      return out;
    },
  };
}

// Resend REST. Returns null when not configured.
export function makeMailer(env = process.env) {
  if (!env.RESEND_API_KEY || !env.MAIL_FROM) return null;
  return {
    send: async ({ to, subject, text, idempotencyKey }) => {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        signal: AbortSignal.timeout(TIMEOUT),
        headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json", ...(idempotencyKey && { "idempotency-key": idempotencyKey }) },
        body: JSON.stringify({ from: env.MAIL_FROM, to, subject, text }),
      });
      // Same key with another body: today's mail already went out and the weak counts moved since, so a re-run is not a failure.
      if (r.status === 409 && (await r.clone().json().catch(() => ({}))).name === "invalid_idempotent_request") return { deduped: true };
      if (!r.ok) throw new Error(`mail ${r.status}`);
      return r.json();
    },
  };
}
