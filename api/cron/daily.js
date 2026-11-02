import { loadPack } from "../../lib/coach.js";
import { makeStore, makeMailer, dailyTip } from "../../lib/mail.js";

// Vercel Cron, 00:00 UTC = 09:00 JST (vercel.json). Vercel sends "Authorization: Bearer $CRON_SECRET".
export async function GET(request, deps = {}) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ code: "access_denied" }, { status: 401 });
  }
  const store = "store" in deps ? deps.store : makeStore();
  const mailer = "mailer" in deps ? deps.mailer : makeMailer();
  if (!store || !mailer) return Response.json({ code: "mail_unavailable" }, { status: 503 });
  const now = (deps.now ?? (() => new Date()))();
  const pack = loadPack("jp");
  const app = process.env.APP_URL ?? "";
  let sent = 0, failed = 0;
  for (const [id, sub] of await store.all()) {
    try {
      const tip = dailyTip(pack, now, sub.lang, `${app}/api/unsubscribe?id=${id}`, app);
      await mailer.send({ to: sub.email, subject: tip.subject, text: tip.text });
      sent++;
    } catch (e) {
      failed++;
      console.error("daily mail failed:", id.slice(0, 8), e?.message); // id prefix only, never the email
    }
  }
  return Response.json({ sent, failed });
}
