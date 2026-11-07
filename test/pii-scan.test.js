// Scans research outputs and draft packs for personal identifiers listed in the denylist (PII_DENYLIST env, a file outside the repo).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const denyPath = process.env.PII_DENYLIST ?? fileURLToPath(new URL("../BuiltWithClaude-2026-private/secrets/.pii-denylist.txt", root));
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { logQueries } from "../lib/research.js";
import { researchMessage, fakeClient, reviewFixture, scriptFixture, asModelScript } from "./fake-claude.js";
import { POST as reviewPOST } from "../api/review.js";
import { POST as scriptPOST } from "../api/script.js";
// Every tracked text file (plus untracked files under research/ that are about to be committed).
const tracked = (() => { try { return execFileSync("git", ["ls-files", "-z", "-co", "--exclude-standard"], { cwd: fileURLToPath(root), encoding: "utf8" }).split("\0"); } catch { return []; } })();
const targets = tracked.filter((p) => p && /\.(json|md|js|mjs|txt|html|css)$/.test(p) && !p.startsWith("node_modules/") && existsSync(new URL(p, root)));

// git quotes a non-ASCII path ("01_\350…") unless -z, and the quoted name exists nowhere: every file under 01_設計文書/ went unscanned (11/06).
test("the scan reads files under non-ASCII paths", () => assert.ok(targets.includes("01_設計文書/PRD-INTERVIEW-COACH.md")));

test("no denylisted personal identifiers in packs/ or research outputs", { skip: !existsSync(denyPath) && ".pii-denylist.txt not present" }, () => {
  const terms = readFileSync(denyPath, "utf8").split("\n").map((s, i) => [s.trim(), i + 1]).filter(([s]) => s && !s.startsWith("#"));
  const hits = [];
  for (const p of targets) {
    const text = readFileSync(new URL(p, root), "utf8");
    for (const [t, n] of terms) if (text.includes(t)) hits.push(`${p}: denylist line ${n}`); // never the term: test output gets shared
  }
  assert.deepEqual(hits, [], `PII found:\n${hits.join("\n")}`);
});

// URLs are stripped first: government document IDs (mhlw.go.jp/content/.../001742822.pdf) look like phone numbers.
const piiMatches = (text) => text.replace(/https?:\/\/\S+/g, "").match(/(?<!\d)0[1-9]\d{0,2}-?\d{2,4}-?\d{4}(?!\d)|[\w.+-]+@[\w-]+\.[\w.-]+/g);

test("PII detector still catches phone/email but ignores URL document IDs", () => {
  assert.deepEqual(piiMatches("tel 090-1234-5678 / a.b@example.jp"), ["090-1234-5678", "a.b@example.jp"]);
  assert.equal(piiMatches("[PDF](https://www.mhlw.go.jp/content/11655000/001742822.pdf)"), null);
  assert.equal(piiMatches("文書番号 001603370 と 001366995"), null, "document numbers starting 00 are not phones");
});

// Resend's documented test sender (PRD §15.5, MAIL-SERVICE-EVAL): a service's address, not a person's. Exact match only.
const PUBLIC_ADDRESSES = ["onboarding@resend.dev"];

test("generic PII patterns (phone / email) absent from packs and research", () => {
  const bad = [];
  // test/ holds deliberate fake contacts for masking tests; the denylist test above still covers it.
  for (const p of targets.filter((x) => !x.startsWith("test/"))) {
    const text = readFileSync(new URL(p, root), "utf8");
    const m = piiMatches(text)?.filter((x) => !/@(?:[\w-]+\.)*example(?:\.[a-z]+)+$/i.test(x) && !PUBLIC_ADDRESSES.includes(x));
    if (m?.length) bad.push(`${p}: line ${[...new Set(m.map((x) => text.slice(0, text.indexOf(x)).split("\n").length))].join(", ")}`); // lines, not the values
  }
  assert.deepEqual(bad, [], bad.join("\n"));
});

// Intent changed: this scanned the log after redaction, so it could not fail. The redacted flag is what records a contact sent to the search.
test("the development query log shows no contact in the queries actually sent (spec §7 privacy test)", () => {
  const dir = mkdtempSync(join(tmpdir(), "pii-log-"));
  const path = join(dir, "queries.log");
  const env = { RESEARCH_DEBUG: "1", RESEARCH_DEBUG_LOG: path };
  const search = (query) => ({ type: "server_tool_use", name: "web_search", input: { query } });
  const lines = () => readFileSync(path, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  logQueries(researchMessage.content, env);
  const clean = lines();
  assert.ok(clean.some((l) => l.q.includes("株式会社サンプルテック（仮）")), "the log is not empty");
  assert.deepEqual(clean.filter((l) => l.redacted), []);
  // A page could tell the model to search for a contact: the check must catch it, and the log still must not keep it.
  logQueries([search("採用担当 hr-contact@example.jp 03-1234-5678")], env);
  const leaked = lines().slice(clean.length);
  const log = readFileSync(path, "utf8");
  rmSync(dir, { recursive: true });
  assert.deepEqual(leaked, [{ q: "採用担当 [email] [phone]", redacted: true }]);
  assert.equal(piiMatches(log), null);
});

// The question comes from the browser like the answer: /api/review and /api/script mask it before Claude, as /api/verify does.
test("/api/review and /api/script mask the question before Claude", async () => {
  process.env.ACCESS_CODE = "c0de";
  const question = "採用担当 hr-contact@example.jp 03-1234-5678 に伝えた志望動機を教えてください。";
  for (const [i, [post, result]] of [[reviewPOST, reviewFixture], [scriptPOST, asModelScript(scriptFixture)]].entries()) {
    const client = fakeClient({ result });
    const res = await post(new Request("http://x/api", { method: "POST", headers: { "x-access-code": "c0de", "x-forwarded-for": `8.8.0.${i}`, "content-type": "application/json" }, body: JSON.stringify({ question, answer: "物流システムの開発を担当しました。" }) }), { client });
    assert.equal(res.status, 200);
    const sent = JSON.stringify(client.requests);
    assert.ok(sent.includes("[email]") && sent.includes("[phone]"), "the masked question is in the prompt");
    assert.ok(!sent.includes("hr-contact@example.jp") && !sent.includes("03-1234-5678"), i ? "script" : "review");
  }
});
