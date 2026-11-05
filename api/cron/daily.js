import { loadPack } from "../../lib/coach.js";
import { makeStore, makeMailer, dailyTip, ownerTip, ownerAddress, mailPublic, jstDate, parseTipDate } from "../../lib/mail.js";

const LAST_TTL = 7 * 24 * 60 * 60; // Hobby logs last an hour; this is how a failed morning is found later

// Vercel Cron, 00:00 UTC = 09:00 JST (vercel.json). Vercel sends "Authorization: Bearer $CRON_SECRET".
// A manual re-run after 15:00 UTC is already the next JST day, so ?date=YYYY-MM-DD pins the tip and its idempotency key.
export async function GET(request, deps = {}) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ code: "access_denied" }, { status: 401 });
  }
  const pinned = new URL(request.url).searchParams.get("date");
  const now = pinned === null ? (deps.now ?? (() => new Date()))() : parseTipDate(pinned);
  if (!now) return Response.json({ code: "bad_request" }, { status: 400 });
  const store = "store" in deps ? deps.store : makeStore();
  const mailer = "mailer" in deps ? deps.mailer : makeMailer();
  const owner = ownerAddress();
  const open = mailPublic() && !!store;
  if (!mailer || (!owner && !open)) return Response.json({ code: "mail_off" });

  const pack = loadPack("jp");
  const app = process.env.APP_URL ?? "";
  const date = jstDate(now);
  let sent = 0, failed = 0, deduped = 0, skipped = 0;
  const deliver = async (to, tip, label) => {
    try {
      const r = await mailer.send({ to, subject: tip.subject, text: tip.text, idempotencyKey: `tip/${date}/${label}` });
      r?.deduped ? deduped++ : sent++;
    } catch (e) {
      failed++;
      console.error("daily mail failed:", label.slice(0, 8), e?.message); // id prefix only, never the email
    }
  };

  if (owner) {
    let weak = null;
    try { weak = (await store?.get("weak:owner")) ?? null; } catch (e) { console.error("weak read failed:", e?.message); } // the common tip is still worth sending
    await deliver(owner, ownerTip(pack, now, weak, app), "owner");
  }
  if (open) {
    let rows = [];
    try { rows = await store.all(); } catch (e) { failed++; console.error("subscribers read failed:", e?.message); }
    for (const [id, sub] of rows) {
      if (typeof sub?.email !== "string" || !sub.email) { skipped++; continue; }
      let tip;
      try { tip = dailyTip(pack, now, sub.lang, `${app}/api/unsubscribe?id=${id}`, app); } catch { skipped++; continue; }
      await deliver(sub.email, tip, id);
    }
  }

  const result = { date, sent, failed, deduped, skipped };
  if (failed) console.error(JSON.stringify({ event: "mail_daily", ...result }));
  try { await store?.put("mail:last", result, LAST_TTL); } catch (e) { console.error("mail:last failed:", e?.message); }
  return Response.json({ sent, failed }, { status: failed ? 502 : 200 });
}
