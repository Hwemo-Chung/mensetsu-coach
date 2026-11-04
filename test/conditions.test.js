// Stage R: per-condition matching is a browser pure function. met / unmet / unknown per row, never a total or a grade.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkConditions, conditionProfile, selectCheckpoints } from "../public/conditions.js";
import { fitDesired, saveDesired, loadDesired, loadCompanyNotes, saveCompanyNotes, clearCompanyNotes } from "../public/session.js";

const on = (value, extra = {}) => ({ value, source_ids: ["s1"], source_count: 1, confidence: "high", position_match: "exact", applies_to_position: false, ...extra });
const brief = (position = {}, source_type = "official_careers") => ({
  research_status: "ok",
  sources: [{ id: "s1", source_type }],
  position_analysis: {
    salary: on("年収600万〜800万円（架空）", { min_jpy: 6_000_000, max_jpy: 8_000_000, fixed_overtime_hours: 45 }),
    overtime: on("月平均20時間（架空）", { monthly_hours: 20 }),
    employment: on("正社員（架空）", { kind: "seishain" }),
    work_location: on("東京都千代田区（架空）"),
    work_style: on("週2日リモート可（架空）"),
    actual_work: on("デリバリー管理とPMO（架空）"),
    client_site_work: on("顧客先常駐なしと記載（架空）", { stated: "stated_no" }),
    ...position,
  },
});
const status = (rows, axis) => rows.find((r) => r.axis === axis)?.status;
const row = (b, profile, axis) => checkConditions(b, profile).find((r) => r.axis === axis);

test("salary floor and target are separate rows: a range straddling the wish stays unknown", () => {
  const rows = checkConditions(brief(), { salary_min_jpy: 5_000_000, salary_target_jpy: 7_000_000 });
  assert.deepEqual(rows.map((r) => [r.axis, r.status]), [["salary_min", "met"], ["salary_target", "unknown"]]);
  assert.equal(status(checkConditions(brief(), { salary_min_jpy: 9_000_000 }), "salary_min"), "unmet");
  assert.equal(status(checkConditions(brief({ salary: on("非公開", { min_jpy: null, max_jpy: null }) }), { salary_min_jpy: 1 }), "salary_min"), "unknown");
  assert.equal(status(checkConditions(brief({ salary: on("非公開", { min_jpy: null, max_jpy: null }) }), { salary_min_jpy: 0 }), "salary_min"), "unknown", "null is no figure");
});

test("overtime reads the posting's monthly hours; fixed overtime is never actual overtime", () => {
  assert.equal(status(checkConditions(brief(), { monthly_overtime_max: 20 }), "overtime"), "met");
  assert.equal(status(checkConditions(brief(), { monthly_overtime_max: 10 }), "overtime"), "unmet");
  const fixedOnly = brief({ overtime: on("記載なし", { monthly_hours: null }) });
  assert.equal(status(checkConditions(fixedOnly, { monthly_overtime_max: 10 }), "overtime"), "unknown");
});

test("employment, location, remote, excluded roles and client site follow their tables", () => {
  assert.equal(status(checkConditions(brief(), { employment_required: ["seishain"] }), "employment"), "met");
  assert.equal(status(checkConditions(brief(), { employment_required: ["contract"] }), "employment"), "unmet");
  assert.equal(status(checkConditions(brief({ employment: on("記載なし", { kind: "unknown" }) }), { employment_required: ["contract"] }), "employment"), "unknown");
  assert.equal(status(checkConditions(brief(), { locations: ["千代田"] }), "location"), "met");
  assert.equal(status(checkConditions(brief(), { locations: ["大阪"] }), "location"), "unknown", "absence is not a miss");
  const remote = row(brief(), { remote_min_days: 2 }, "remote");
  assert.equal(remote.status, "unknown", "a stated policy never proves the frequency");
  assert.match(remote.observed, /リモート/);
  assert.equal(status(checkConditions(brief(), { excluded_roles: ["PMO"] }), "excluded_role"), "unmet");
  assert.equal(status(checkConditions(brief(), { excluded_roles: ["営業"] }), "excluded_role"), "unknown", "absence is not met");
  assert.equal(status(checkConditions(brief(), { exclude_client_site: true }), "client_site"), "met");
  assert.equal(status(checkConditions(brief({ client_site_work: on("常駐あり", { stated: "stated_yes" }) }), { exclude_client_site: true }), "client_site"), "unmet");
  assert.equal(status(checkConditions(brief({ client_site_work: on("記載なし", { stated: "unstated" }) }), { exclude_client_site: true }), "client_site"), "unknown");
});

test("only official and job-board sources move a status; the value may still show", () => {
  for (const type of ["news", "company_db", "interview_post", "review_site", "other"]) {
    const r = row(brief({}, type), { monthly_overtime_max: 30 }, "overtime");
    assert.equal(r.status, "unknown", type);
    assert.match(r.observed, /20時間/);
  }
  for (const type of ["official_careers", "official_other", "job_board"]) assert.equal(status(checkConditions(brief({}, type), { monthly_overtime_max: 30 }), "overtime"), "met", type);
  const mixed = { ...brief(), sources: [{ id: "s1", source_type: "official_careers" }, { id: "s2", source_type: "news" }] };
  mixed.position_analysis.overtime.source_ids = ["s1", "s2"];
  assert.equal(status(checkConditions(mixed, { monthly_overtime_max: 30 }), "overtime"), "unknown", "one outside source may be where the figure came from");
});

test("a similar posting never decides; an exact name match is labelled, a user's own posting URL is not", () => {
  const similar = brief({ overtime: on("月20時間", { monthly_hours: 20, position_match: "similar" }) });
  assert.equal(status(checkConditions(similar, { monthly_overtime_max: 30 }), "overtime"), "unknown");
  assert.equal(row(brief(), { monthly_overtime_max: 30 }, "overtime").basis, "posting_name_match");
  const own = brief({ overtime: on("月20時間", { monthly_hours: 20, applies_to_position: true }) });
  assert.equal(row(own, { monthly_overtime_max: 30 }, "overtime").basis, "posting_url");
});

test("no row without a wish, no total on the result, input order kept, and no review data needed", () => {
  assert.deepEqual(checkConditions(brief(), {}), []);
  assert.deepEqual(checkConditions(brief(), null), []);
  const rows = checkConditions(brief(), { exclude_client_site: true, salary_min_jpy: 1, monthly_overtime_max: 30 });
  assert.ok(Array.isArray(rows));
  assert.deepEqual(rows.map((r) => r.axis), ["salary_min", "overtime", "client_site"]);
  for (const r of rows) assert.deepEqual(Object.keys(r).sort(), ["ask", "axis", "basis", "desired", "observed", "source_ids", "status"]);
  assert.ok(!/score|total|grade|verdict/.test(JSON.stringify(rows)));
  assert.deepEqual(checkConditions({ research_status: "ok" }, { salary_min_jpy: 1 }).map((r) => r.status), ["unknown"], "an empty brief is all unknown");
});

test("an answer the user chose to record outranks the posting, with who said it", () => {
  const rows = checkConditions(brief(), { monthly_overtime_max: 30 }, { overtime: { status: "unmet", speaker: "人事", written: true, date: "2026-11-04" } });
  assert.equal(rows[0].status, "unmet");
  assert.equal(rows[0].basis, "user_answer");
  assert.deepEqual(rows[0].answer, { speaker: "人事", written: true, date: "2026-11-04" });
  assert.equal(checkConditions(brief(), { monthly_overtime_max: 30 }, { overtime: { status: "good" } })[0].basis, "posting_name_match", "only the three statuses count");
});

test("the stored form maps onto the profile without renaming what the fit call reads", () => {
  assert.deepEqual(conditionProfile({ min_salary_man: "700", salary_target_man: "800", max_overtime_hours: "20", employment_required: "seishain", locations: "東京、大阪", remote_min_days: "2", excluded_roles: "PMO、営業", exclude_client_site: "1", job_tag: "pm" }), {
    salary_min_jpy: 7_000_000, salary_target_jpy: 8_000_000, monthly_overtime_max: 20, employment_required: ["seishain"], locations: ["東京", "大阪"], remote_min_days: 2, excluded_roles: ["PMO", "営業"], exclude_client_site: true, job_tags: ["pm"],
  });
  assert.deepEqual(conditionProfile(null), {});
  assert.deepEqual(conditionProfile({ min_salary_man: "abc" }), {});
});

test("checkpoint templates: a settled axis asks nothing, tags need the job type, the memo question needs a memo", () => {
  const templates = [
    { axis: "overtime", audience: "manager", ask: "interview", text: "残業" },
    { axis: "common", audience: "agent", ask: "agent", text: "共通" },
    { axis: "common", audience: "hr", ask: "interview", text: "PM", tags: ["pm"] },
    { axis: "review_memo", audience: "manager", ask: "interview", text: "メモ" },
  ];
  const settled = [{ axis: "overtime", status: "met" }];
  assert.deepEqual(selectCheckpoints(templates, settled).map((t) => t.text), ["共通"]);
  assert.deepEqual(selectCheckpoints(templates, [{ axis: "overtime", status: "unknown" }]).map((t) => t.text), ["残業", "共通"]);
  assert.deepEqual(selectCheckpoints(templates, [], { tags: ["pm"], memo: true }).map((t) => t.text), ["残業", "共通", "PM", "メモ"]);
  assert.deepEqual(selectCheckpoints(undefined, []), [], "a pack without templates, or an old session");
});

test("fields only the browser reads never reach the fit call", () => {
  const box = new Map();
  const storage = { getItem: (k) => box.get(k) ?? null, setItem: (k, v) => box.set(k, v), removeItem: (k) => box.delete(k) };
  saveDesired(storage, { min_salary_man: "700", excluded_roles: "PMO", locations: "東京", employment_required: "seishain", exclude_client_site: "1", salary_target_man: "800", remote_min_days: "2", job_tag: "pm", junk: "x" });
  const stored = loadDesired(storage);
  assert.equal(stored.locations, "東京", "kept for the browser");
  assert.ok(!("junk" in stored));
  assert.deepEqual(fitDesired(stored), { min_salary_man: "700", excluded_roles: "PMO" });
  assert.equal(fitDesired({ locations: "東京" }), null, "nothing to compare, nothing to pay for");
  assert.equal(fitDesired(null), null);
});

test("review memos and answers live under their own key per company and clear on demand", () => {
  const box = new Map();
  const storage = { getItem: (k) => box.get(k) ?? null, setItem: (k, v) => box.set(k, v), removeItem: (k) => box.delete(k) };
  assert.deepEqual(loadCompanyNotes(storage, "株式会社サンプル"), { memos: [], answers: {} });
  assert.equal(saveCompanyNotes(storage, "株式会社サンプル", { memos: [{ site: "A", date: "2026-11-01", sample: "12", summary: "要約" }], answers: { overtime: { status: "met" } } }), true);
  assert.equal(loadCompanyNotes(storage, "サンプル").memos[0].summary, "要約", "the same company key as the debrief");
  assert.deepEqual(loadCompanyNotes(storage, "別の会社"), { memos: [], answers: {} });
  assert.ok(![...box.keys()].includes("mensetsu-session"));
  clearCompanyNotes(storage);
  assert.equal(box.size, 0);
});
