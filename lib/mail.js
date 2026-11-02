import { createHmac } from "node:crypto";

// Daily tip mailing. The tip is built from the pack by date (no AI call). Storage and sending are plain REST
// calls (Upstash Redis, Resend) so tests swap them for in-memory fakes.

const DAY = 24 * 60 * 60 * 1000;
const JST = 9 * 60 * 60 * 1000;
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
    const r = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(args) });
    if (!r.ok) throw new Error(`store ${r.status}`);
    return (await r.json()).result;
  };
  return {
    set: (id, v) => cmd("HSET", "subscribers", id, JSON.stringify(v)),
    del: (id) => cmd("HDEL", "subscribers", id),
    incr: (target) => cmd("HINCRBY", "demand", target, 1),
    all: async () => {
      const flat = (await cmd("HGETALL", "subscribers")) ?? [];
      const out = [];
      for (let i = 0; i < flat.length; i += 2) out.push([flat[i], JSON.parse(flat[i + 1])]);
      return out;
    },
  };
}

// Resend REST. Returns null when not configured.
export function makeMailer(env = process.env) {
  if (!env.RESEND_API_KEY || !env.MAIL_FROM) return null;
  return {
    send: async ({ to, subject, text }) => {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({ from: env.MAIL_FROM, to, subject, text }),
      });
      if (!r.ok) throw new Error(`mail ${r.status}`);
      return r.json();
    },
  };
}
