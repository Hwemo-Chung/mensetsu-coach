import { makeStore } from "../lib/mail.js";

const page = (status, msg) => new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>面接コーチ</title><p style="font-family:sans-serif;padding:24px">${msg}</p>`, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });

// Link target in every mail. The id (HMAC of the email) is a capability: holding it is enough to stop the mail.
export async function GET(request, deps = {}) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f]{40}$/.test(id)) return page(400, "Invalid link. / 링크가 올바르지 않습니다. / リンクが正しくありません。");
  const store = "store" in deps ? deps.store : makeStore();
  if (!store) return page(503, "Unavailable. / 지금은 처리할 수 없습니다. / 現在処理できません。");
  await store.del(id);
  return page(200, "Unsubscribed. / 수신을 거부했습니다. / 配信を停止しました。");
}
