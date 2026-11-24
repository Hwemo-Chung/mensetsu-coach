import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { passProduct, checkoutUrl, verifyLicense, OK_MS, DENY_MS } from "../lib/license.js";
import { gate } from "../lib/guard.js";
import { POST as access } from "../api/access.js";

// The paid pass (Gumroad licence, ¥1,980). A buyer enters the key Gumroad mailed in the same field as
// the review code; the server asks Gumroad once and keeps only "ok / deny / refunded" (lib/license.js).
// Each test uses its own product id, so the in-instance cache of one test cannot answer another.

const VERIFY = "https://api.gumroad.com/v2/licenses/verify";
const accepted = (purchase = {}) => ({ status: 200, body: { success: true, uses: 0, purchase } });
const refused = () => ({ status: 200, body: { success: false, message: "That license does not exist for the provided product." } });
// A fetch that answers like Gumroad and remembers every call, so a test can count them.
const gumroad = (answer) => {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    const a = typeof answer === "function" ? answer(calls.length) : answer;
    if (a instanceof Error) throw a;
    return Response.json(a.body, { status: a.status ?? 200 });
  };
  return { calls, fetch };
};
const form = (call) => new URLSearchParams(String(call.init.body));

test("passProduct: the id first, then the permalink, nothing when neither is set", () => {
  assert.deepEqual(passProduct({ GUMROAD_PRODUCT_ID: "prod_1" }), { field: "product_id", value: "prod_1" });
  assert.deepEqual(passProduct({ GUMROAD_PRODUCT_ID: "  ", GUMROAD_PRODUCT_PERMALINK: "mensetsu" }), { field: "product_permalink", value: "mensetsu" });
  assert.equal(passProduct({}), null);
  assert.equal(passProduct({ GUMROAD_PRODUCT_URL: "https://teagarden5.gumroad.com/l/mensetsu" }), null, "a sales page alone does not open the pass");
});

test("checkoutUrl: an https page, else nothing — the value becomes an href", () => {
  assert.equal(checkoutUrl({ GUMROAD_PRODUCT_URL: "https://teagarden5.gumroad.com/l/mensetsu" }), "https://teagarden5.gumroad.com/l/mensetsu");
  for (const bad of ["http://x.example/p", "javascript:alert(1)", " https://x.example/a b", "", undefined]) assert.equal(checkoutUrl({ GUMROAD_PRODUCT_URL: bad }), null, String(bad));
});

test("a key Gumroad accepts opens the pass; the request names the product, the key and no use increment", async () => {
  const g = gumroad(accepted({ email: "buyer@example.com", price: 1980 }));
  const r = await verifyLicense("A1B2C3D4-1234567890123", { env: { GUMROAD_PRODUCT_ID: "p-accept" }, fetch: g.fetch, now: 0, ip: "10.9.0.1" });
  assert.deepEqual(r, { ok: true }, "the purchase itself is not carried back");
  assert.equal(g.calls.length, 1);
  assert.equal(g.calls[0].url, VERIFY);
  assert.equal(g.calls[0].init.method, "POST");
  const f = form(g.calls[0]);
  assert.equal(f.get("product_id"), "p-accept");
  assert.equal(f.get("license_key"), "A1B2C3D4-1234567890123");
  assert.equal(f.get("increment_uses_count"), "false", "checking must not spend the buyer's uses");
});

test("the permalink form is sent when only GUMROAD_PRODUCT_PERMALINK is set", async () => {
  const g = gumroad(accepted());
  assert.deepEqual(await verifyLicense("PERMA-KEY-0001", { env: { GUMROAD_PRODUCT_PERMALINK: "mensetsu" }, fetch: g.fetch, now: 0 }), { ok: true });
  assert.equal(form(g.calls[0]).get("product_permalink"), "mensetsu");
  assert.equal(form(g.calls[0]).get("product_id"), null);
});

test("a key is checked once: later calls in the window do not reach Gumroad", async () => {
  const g = gumroad(accepted());
  const env = { GUMROAD_PRODUCT_ID: "p-cache" }, opts = { env, fetch: g.fetch };
  assert.equal((await verifyLicense("CACHE-KEY-0001", { ...opts, now: 0 })).ok, true);
  assert.deepEqual(await verifyLicense("CACHE-KEY-0001", { ...opts, now: 1000 }), { ok: true, cached: true });
  assert.equal(g.calls.length, 1);
  // Past the window the key is asked about again: a refund that happened after the first check must be seen.
  assert.equal((await verifyLicense("CACHE-KEY-0001", { ...opts, now: OK_MS + 1 })).cached, undefined);
  assert.equal(g.calls.length, 2);
});

test("a refunded or charged-back purchase is refused even though Gumroad says success", async () => {
  for (const flag of ["refunded", "chargebacked", "disputed"]) {
    const g = gumroad(accepted({ [flag]: true }));
    const env = { GUMROAD_PRODUCT_ID: `p-${flag}` };
    assert.deepEqual(await verifyLicense("REFUND-KEY-0001", { env, fetch: g.fetch, now: 0 }), { ok: false, reason: "refunded" }, flag);
    // The refusal is kept too, and keeps its reason, so a second attempt does not ask Gumroad again.
    assert.deepEqual(await verifyLicense("REFUND-KEY-0001", { env, fetch: g.fetch, now: 1000 }), { ok: false, reason: "refunded", cached: true }, flag);
    assert.equal(g.calls.length, 1, flag);
  }
});

test("Gumroad refusing the key is 'invalid', kept for the short window; a broken Gumroad is 'unavailable' and not kept", async () => {
  const g = gumroad(refused());
  const env = { GUMROAD_PRODUCT_ID: "p-refuse" };
  assert.deepEqual(await verifyLicense("WRONG-KEY-0001", { env, fetch: g.fetch, now: 0 }), { ok: false, reason: "invalid" });
  assert.deepEqual(await verifyLicense("WRONG-KEY-0001", { env, fetch: g.fetch, now: 1000 }), { ok: false, reason: "invalid", cached: true });
  assert.equal(g.calls.length, 1, "a repeated wrong key does not ask again");
  assert.equal(DENY_MS < OK_MS, true);

  // 500, a hung or blocked connection: never "your key is wrong", and never cached, so the buyer's next try asks again.
  for (const answer of [{ status: 500, body: { message: "down" } }, new Error("network")]) {
    const bad = gumroad(answer);
    assert.deepEqual(await verifyLicense("DOWN-KEY-0001", { env: { GUMROAD_PRODUCT_ID: "p-down" }, fetch: bad.fetch, now: 0 }), { ok: false, reason: "unavailable" });
    await verifyLicense("DOWN-KEY-0001", { env: { GUMROAD_PRODUCT_ID: "p-down" }, fetch: bad.fetch, now: 1000 });
    assert.equal(bad.calls.length, 2, "not cached");
  }
});

test("what cannot be a key never reaches Gumroad", async () => {
  const g = gumroad(accepted());
  const env = { GUMROAD_PRODUCT_ID: "p-shape" };
  for (const key of ["", "abc", "A1B2 C3D4", "키키키키키", "x".repeat(129), "bad<script>"]) {
    assert.deepEqual(await verifyLicense(key, { env, fetch: g.fetch, now: 0 }), { ok: false, reason: "invalid" }, key);
  }
  assert.equal(g.calls.length, 0);
});

test("without a product the pass is off: no call, the shared code stays the only way in", async () => {
  const g = gumroad(accepted());
  assert.deepEqual(await verifyLicense("A1B2C3D4-1234567890123", { env: {}, fetch: g.fetch, now: 0 }), { ok: false, reason: "disabled" });
  assert.equal(g.calls.length, 0);
});

// Upstash Redis REST, the same store as the daily counts: a cold instance must not ask Gumroad again.
test("with Upstash the answer is stored as ok/deny and read back by another window", async () => {
  const stored = new Map(), seen = [];
  let gumroadCalls = 0;
  const fetch = async (url, init) => {
    if (url === "https://kv.example") {
      const cmd = JSON.parse(init.body);
      seen.push({ cmd, auth: init.headers.authorization });
      if (cmd[0] === "GET") return Response.json({ result: stored.get(cmd[1]) ?? null });
      if (cmd[0] === "SET") { stored.set(cmd[1], cmd[2]); return Response.json({ result: "OK" }); }
    }
    gumroadCalls++;
    return Response.json({ success: true, purchase: {} });
  };
  const env = { GUMROAD_PRODUCT_ID: "p-kv", KV_REST_API_URL: "https://kv.example", KV_REST_API_TOKEN: "tok" };
  assert.equal((await verifyLicense("KV-KEY-00000001", { env, fetch, now: 0 })).ok, true);
  assert.equal(gumroadCalls, 1);
  const set = seen.find((s) => s.cmd[0] === "SET");
  assert.equal(set.cmd[1].startsWith("license:"), true, "the store key holds no licence key itself");
  assert.doesNotMatch(set.cmd[1], /KV-KEY/, "the key is only in the hash");
  assert.deepEqual(set.cmd.slice(2), ["ok", "PX", OK_MS]);
  assert.equal(set.auth, "Bearer tok");

  // After this instance's short memory window, the store answers: no second Gumroad call.
  const r = await verifyLicense("KV-KEY-00000001", { env, fetch, now: 61_000 });
  assert.deepEqual(r, { ok: true, cached: true });
  assert.equal(gumroadCalls, 1);
  assert.equal(seen.filter((s) => s.cmd[0] === "GET").length >= 1, true);
});

test("a store that fails is not an error the buyer sees: the check goes to Gumroad", async () => {
  let gumroadCalls = 0;
  const fetch = async (url) => {
    if (url === "https://kv.example") return new Response("down", { status: 500 });
    gumroadCalls++;
    return Response.json({ success: true, purchase: {} });
  };
  const env = { GUMROAD_PRODUCT_ID: "p-kv-down", KV_REST_API_URL: "https://kv.example", KV_REST_API_TOKEN: "tok" };
  assert.equal((await verifyLicense("KVDOWN-KEY-0001", { env, fetch, now: 0 })).ok, true);
  assert.equal(gumroadCalls, 1);
});

// Guessing must not spend Gumroad's API: 10 checks per IP in 10 minutes; cached answers are free.
test("at most 10 Gumroad checks per IP in 10 minutes, and a cached key is free", async () => {
  const g = gumroad(accepted());
  const env = { GUMROAD_PRODUCT_ID: "p-cap" }, ip = "10.9.7.7";
  for (let i = 0; i < 10; i++) assert.equal((await verifyLicense(`GUESS-KEY-000${i}`, { env, fetch: g.fetch, now: 0, ip })).ok, true);
  assert.equal(g.calls.length, 10);
  assert.deepEqual(await verifyLicense("GUESS-KEY-0010", { env, fetch: g.fetch, now: 0, ip }), { ok: false, reason: "throttled" });
  assert.equal(g.calls.length, 10, "the 11th key is not sent");
  assert.equal((await verifyLicense("GUESS-KEY-0000", { env, fetch: g.fetch, now: 1000, ip })).ok, true, "a key already known is still answered");
  assert.equal(g.calls.length, 10);
  // Another IP is not punished for the first one.
  assert.equal((await verifyLicense("GUESS-KEY-0011", { env, fetch: g.fetch, now: 0, ip: "10.9.7.8" })).ok, true);
});

// The gate every route uses: the pass opens it, ACCESS_CODE still comes first, and the refusals say why without leaking.
const req = (code, ip = "10.9.4.1") => new Request("http://x/api/questions", { method: "POST", headers: { ...(code != null && { "x-access-code": code }), "x-forwarded-for": ip, "content-type": "application/json" }, body: "{}" });
const status = async (r) => r && [r.status, (await r.json()).code];

test("gate: a licence key Gumroad accepts opens the route like the shared code", async () => {
  const g = gumroad(accepted());
  const env = { GUMROAD_PRODUCT_ID: "p-gate" };
  assert.equal(await gate(req("A1B2C3D4-0000000000001", "10.9.4.2"), { env, fetch: g.fetch, now: 0 }), null);
  assert.equal(await gate(req("A1B2C3D4-0000000000001", "10.9.4.2"), { env, fetch: g.fetch, now: 1000 }), null, "second call: cached");
  assert.equal(g.calls.length, 1);
});

test("gate: the shared ACCESS_CODE is checked first and never spends a Gumroad call", async () => {
  const g = gumroad(accepted());
  const env = { ACCESS_CODE: "c0de", GUMROAD_PRODUCT_ID: "p-gate-code" };
  assert.equal(await gate(req("c0de", "10.9.4.3"), { env, fetch: g.fetch, now: 0 }), null);
  assert.equal(g.calls.length, 0);
});

test("gate: refunded is 401 license_inactive, a broken Gumroad is 503 license_unavailable, a wrong key is 401 access_denied — each with the sales page", async () => {
  const url = "https://teagarden5.gumroad.com/l/mensetsu";
  const env = { GUMROAD_PRODUCT_ID: "p-gate-2", GUMROAD_PRODUCT_URL: url };
  const refunded = gumroad(accepted({ refunded: true }));
  const r1 = await gate(req("A1B2C3D4-0000000000002", "10.9.4.4"), { env, fetch: refunded.fetch, now: 0 });
  assert.equal(r1.status, 401);
  assert.deepEqual(await r1.json(), { code: "license_inactive", checkoutUrl: url });

  const down = gumroad({ status: 503, body: { message: "down" } });
  const r2 = await gate(req("A1B2C3D4-0000000000003", "10.9.4.5"), { env, fetch: down.fetch, now: 0 });
  assert.equal(r2.status, 503, "the buyer is told to retry, not that the key is wrong");
  assert.deepEqual(await r2.json(), { code: "license_unavailable", checkoutUrl: url });

  const wrong = gumroad(refused());
  const r3 = await gate(req("A1B2C3D4-0000000000004", "10.9.4.6"), { env, fetch: wrong.fetch, now: 0 });
  assert.deepEqual([r3.status, (await r3.json()).code], [401, "access_denied"]);

  // No code and OPEN_ACCESS unset: the same 401, and the sales page so the screen can offer the pass.
  const r4 = await gate(req(null, "10.9.4.7"), { env, fetch: wrong.fetch, now: 0 });
  assert.deepEqual(await r4.json(), { code: "access_denied", checkoutUrl: url });

  // Over the day's trial in open mode: 429 quota, with the sales page.
  const open = { ...env, OPEN_ACCESS: "1", DAILY_LIMIT_IP: "1" };
  assert.equal(await gate(req(null, "10.9.4.8"), { env: open, fetch: wrong.fetch, now: 0 }), null);
  const r5 = await gate(req(null, "10.9.4.8"), { env: open, fetch: wrong.fetch, now: 0 });
  assert.deepEqual([r5.status, (await r5.json()).code], [429, "quota"]);
});

test("/api/access: a licence key answers 200 unlimited, a refunded one 401 license_inactive, and every answer carries the sales page", async (t) => {
  const url = "https://teagarden5.gumroad.com/l/mensetsu";
  process.env.ACCESS_CODE = "c0de";
  process.env.GUMROAD_PRODUCT_ID = "p-access";
  process.env.GUMROAD_PRODUCT_URL = url;
  delete process.env.OPEN_ACCESS;
  const answer = { refund: false };
  t.mock.method(globalThis, "fetch", async (u) => {
    if (answer.refund) return Response.json({ success: true, purchase: { refunded: true } });
    return Response.json({ success: true, purchase: {} });
  });
  const call = async (code, ip) => { const r = await access(req(code, ip, "http://x/api/access")); return [r.status, await r.json()]; };

  const [s1, b1] = await call("A1B2C3D4-0000000000010", "10.9.5.1");
  assert.deepEqual([s1, b1.ok, b1.unlimited, b1.checkoutUrl], [200, true, true, url]);
  assert.equal(typeof b1.stt, "boolean");

  const [s2, b2] = await call(null, "10.9.5.2");
  assert.deepEqual([s2, b2.code, b2.checkoutUrl], [401, "access_denied", url], "the first screen knows where to buy");

  answer.refund = true;
  const [s3, b3] = await call("A1B2C3D4-0000000000011", "10.9.5.3");
  assert.deepEqual([s3, b3.code], [401, "license_inactive"]);

  const [s4, b4] = await call("c0de", "10.9.5.4");
  assert.deepEqual([s4, b4.unlimited], [200, true], "the shared code still works");

  // A refused key counts toward the wrong-code lock, like a wrong code: the 10th key ends the Gumroad checks
  // for this IP, and 20 refused attempts end the code step for 10 minutes.
  answer.refund = false;
  let last;
  for (let i = 0; i < 21; i++) last = await call(`A1B2C3D4-00000000${2000 + i}`, "10.9.5.5");
  assert.deepEqual(last, [429, { code: "rate_limited", checkoutUrl: url }]);
  delete process.env.GUMROAD_PRODUCT_ID;
  delete process.env.GUMROAD_PRODUCT_URL;
});

test("the operator settings are in .env.example, and the privacy page names Gumroad and the cache", () => {
  const env = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
  for (const k of ["GUMROAD_PRODUCT_ID", "GUMROAD_PRODUCT_PERMALINK", "GUMROAD_PRODUCT_URL"]) assert.match(env, new RegExp(`^${k}=`, "m"), k);
  const html = readFileSync(new URL("../public/privacy.html", import.meta.url), "utf8");
  assert.match(html, /Gumroad/);
  assert.match(html, /ライセンスキー/);
  assert.match(html, /12時間/);
});
