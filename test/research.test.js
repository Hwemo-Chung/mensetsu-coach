// Stage R brief: schema shape and the code gates (model claims are not trusted). Offline, synthetic data only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MODELS } from "../lib/claude.js";
import { POST as access } from "../api/access.js";
import {
  researchEnabled, extractionSchema, fitSchema, briefSchema, NOT_FOUND, EXCERPT_MAX,
  resultUrls, gateSourceUrls, gateEntity, gateClaim, gatePosition, clipExcerpt, reportedLabel, researchStatus, gateBrief,
} from "../lib/research.js";

const COMPANY = "株式会社サンプルテック（仮）";
const url = (p) => `https://example.com/${p}`;
const searchBlock = (...paths) => ({ type: "web_search_tool_result", tool_use_id: "t1", content: paths.map((p) => ({ type: "web_search_result", title: p, url: url(p), encrypted_content: "x", page_age: null })) });
const fetchBlock = (p) => ({ type: "web_fetch_tool_result", tool_use_id: "t2", content: { type: "web_fetch_result", url: url(p), content: { type: "document" } } });
const searchError = { type: "web_search_tool_result", tool_use_id: "t3", content: { type: "web_search_tool_result_error", error_code: "invalid_tool_input" } };
const fetchError = { type: "web_fetch_tool_result", tool_use_id: "t4", content: { type: "web_fetch_tool_error", error_code: "url_not_accessible" } };
const ran = { server_tool_use: { web_search_requests: 2, web_fetch_requests: 1 } };
const none = { server_tool_use: { web_search_requests: 0, web_fetch_requests: 0 } };
const source = (id, extra = {}) => ({ id, title: `${COMPANY} ${id}`, url: url(id), published_date: "", entity_match: "exact", position_match: "exact", source_type: "news", ...extra });
const claim = (value, ...source_ids) => ({ value, source_ids, confidence: "medium" });
const DATE = "2026-11-04";

// Everything a search can say about the fictional company; individual tests swap the sources.
const model = (sources, ids = ["s1"]) => ({
  company_snapshot: { business: claim("業務システムの開発", ...ids), business_model: claim("自社製品と受託", ...ids), size: claim("従業員100名", ...ids), founded: claim("2010年", ...ids), locations: claim("東京", ...ids), recent_news: [claim("新製品を発表", ...ids)] },
  position_analysis: { position_match: "exact", actual_work: claim("要件定義と進行管理", ...ids), team_context: claim("5名のチーム", ...ids), required_skills: [claim("Java", ...ids)], preferred_skills: [claim("AWS", ...ids)], salary: { ...claim("600万〜800万円", ...ids), bonus_included: "yes", overtime_pay_included: "no" }, conditions: [claim("残業 月20時間", ...ids)] },
  reputation_themes: [{ ...claim("残業の話題が多い", ...ids), polarity: "negative", sample_size: "12件", representativeness: "low" }],
  interview_intelligence: { selection_stages: [claim("面接2回", ...ids)], reported_questions: [claim("なぜ弊社を志望しましたか", ...ids)] },
  sources,
});
const gate = (m, content = [searchBlock("s1", "s2")], usage = ran) => gateBrief(m, { content, usage, date: DATE });

const allClaims = (b) => [
  ...Object.values(b.company_snapshot).flat(),
  ...Object.values(b.position_analysis).filter((v) => typeof v === "object").flat(),
  ...b.reputation_themes,
  ...Object.values(b.interview_intelligence).flat(),
];
const objectsIn = (schema) => {
  const out = [];
  const walk = (s) => {
    if (s?.type === "object") out.push(s);
    Object.values(s?.properties ?? {}).forEach(walk);
    if (s?.items) walk(s.items);
  };
  walk(schema);
  return out;
};

test("RESEARCH_ENABLED=1 is the only way on", () => {
  assert.equal(researchEnabled({}), false);
  assert.equal(researchEnabled({ RESEARCH_ENABLED: "0" }), false);
  assert.equal(researchEnabled({ RESEARCH_ENABLED: "1" }), true);
});

test("/api/access reports the research flag", async () => {
  const saved = process.env.RESEARCH_ENABLED;
  const savedCode = process.env.ACCESS_CODE;
  process.env.ACCESS_CODE = "c0de";
  const call = () => access(new Request("http://x/api/access", { method: "POST", headers: { "x-access-code": "c0de", "x-forwarded-for": "10.8.0.1" } })).then((r) => r.json());
  delete process.env.RESEARCH_ENABLED;
  assert.equal((await call()).research, false);
  process.env.RESEARCH_ENABLED = "1";
  assert.equal((await call()).research, true);
  if (saved === undefined) delete process.env.RESEARCH_ENABLED; else process.env.RESEARCH_ENABLED = saved;
  if (savedCode === undefined) delete process.env.ACCESS_CODE; else process.env.ACCESS_CODE = savedCode;
});

test("model ids: search on Haiku, fit on Sonnet, pinned in MODELS", () => {
  assert.equal(MODELS.research, "claude-haiku-5-5");
  assert.equal(MODELS.fit, "claude-sonnet-5-5");
});

test("brief schema has every section, the identity enums and research_status", () => {
  for (const k of ["research_status", "research_date", "company_snapshot", "position_analysis", "reputation_themes", "interview_intelligence", "fit_evaluation", "mismatch_flags", "company_checkpoints", "sources"]) assert.ok(k in briefSchema.properties, k);
  assert.deepEqual(briefSchema.properties.research_status.enum, ["ok", "unavailable"]);
  assert.deepEqual(briefSchema.required, ["research_status", "research_date"], "an unavailable brief has no sections");
  assert.ok("needs_user_confirmation" in briefSchema.properties.fit_evaluation.properties);
  assert.deepEqual(briefSchema.properties.position_analysis.properties.position_match.enum, ["exact", "similar", "unknown"]);
  const src = briefSchema.properties.sources.items.properties;
  assert.deepEqual(src.entity_match.enum, ["exact", "similar", "unknown"]);
  assert.deepEqual(src.position_match.enum, ["exact", "similar", "unknown"]);
  assert.deepEqual(briefSchema.properties.company_snapshot.properties.business.properties.confidence.enum, ["high", "medium", "unknown"]);
  const flag = briefSchema.properties.mismatch_flags.items.properties;
  for (const side of ["side_a", "side_b"]) assert.deepEqual(flag[side].required, ["origin", "quote", "source_ids"], "each flag cites both sides");
});

test("schemas sent to the API stay strict: closed objects, everything required, only supported keywords", () => {
  for (const schema of [extractionSchema, fitSchema]) {
    for (const o of objectsIn(schema)) {
      assert.equal(o.additionalProperties, false);
      assert.deepEqual([...o.required].sort(), Object.keys(o.properties).sort());
    }
    const text = JSON.stringify(schema);
    for (const k of ["maxLength", "minLength", "maximum", "minimum", "citations"]) assert.ok(!text.includes(`"${k}"`), k);
  }
  assert.ok(!("fit_evaluation" in extractionSchema.properties), "fit is not part of the search call");
  assert.ok(!("sources" in fitSchema.properties), "fit searches nothing");
});

test("no verdict field anywhere in the schema", () => {
  for (const o of objectsIn(briefSchema)) for (const k of Object.keys(o.properties)) assert.doesNotMatch(k, /verdict|recommend|score|rating|judg/i);
});

test("gate 1: result URLs come only from real result blocks", () => {
  const urls = resultUrls([
    { type: "server_tool_use", name: "web_fetch", input: { url: url("asked-only") } },
    searchBlock("a", "b"), fetchBlock("c"), searchError, fetchError,
    { type: "text", text: url("said-only") },
  ]);
  assert.deepEqual([...urls].sort(), [url("a"), url("b"), url("c")]);
  assert.equal(resultUrls(undefined).size, 0);
});

test("gate 1: a source whose URL was not in the results is dropped", () => {
  const kept = gateSourceUrls([source("a"), source("made-up"), source("c")], [searchBlock("a"), fetchBlock("c")]);
  assert.deepEqual(kept.map((s) => s.id), ["a", "c"]);
});

test("gate 1: only the fragment and a trailing slash may differ; the query is a different page", () => {
  const content = [searchBlock("page?id=1")];
  const keep = (u) => gateSourceUrls([source("x", { url: u })], content).length === 1;
  assert.equal(keep(url("page?id=1")), true);
  assert.equal(keep(url("page/?id=1")), true);
  assert.equal(keep(`${url("page?id=1")}#top`), true);
  assert.equal(keep(url("page?id=2")), false);
  assert.equal(keep(url("page")), false);
});

test("gate 1: unparsable or non-http URLs never survive, even if a result carries them", () => {
  const content = [{ type: "web_search_tool_result", content: [{ type: "web_search_result", url: "javascript:alert(1)" }, { type: "web_search_result", url: "not a url" }] }];
  assert.equal(resultUrls(content).size, 0);
  assert.deepEqual(gateSourceUrls([source("x", { url: "javascript:alert(1)" }), source("y", { url: "not a url" }), source("z", { url: undefined })], content), []);
});

test("gate 2: a claim keeps only surviving sources; none left, or none given, is not_found", () => {
  const sources = [source("s1")];
  assert.deepEqual(gateClaim(claim("事実", "s1", "dropped"), sources).source_ids, ["s1"]);
  const gone = gateClaim(claim("事実", "dropped"), sources);
  assert.deepEqual(gone, { value: NOT_FOUND, source_ids: [], confidence: "unknown", source_count: 0, single_source: false });
  assert.deepEqual(gateClaim(claim("出典なし"), sources), gone);
  assert.deepEqual(gateClaim(undefined, sources), gone);
  assert.deepEqual(gateClaim({ ...claim(NOT_FOUND, "s1"), confidence: "high" }, sources), gone, "the model's own not_found stays one");
  assert.deepEqual(gateClaim(claim("  ", "s1"), sources), gone, "a blank value says nothing");
});

test("gate 3: source_count and single_source are computed, not taken from the model", () => {
  const sources = [source("s1"), source("s2")];
  const one = gateClaim({ ...claim("事実", "s1"), source_count: 9, single_source: false }, sources);
  assert.equal(one.source_count, 1);
  assert.equal(one.single_source, true);
  const two = gateClaim({ ...claim("事実", "s1", "s2", "s1"), source_count: 1, single_source: true }, sources);
  assert.equal(two.source_count, 2);
  assert.equal(two.single_source, false);
  assert.deepEqual(two.source_ids, ["s1", "s2"]);
});

test("gate 3: two ids for one page count as one source", () => {
  const sources = [source("s1"), source("s2", { url: `${url("s1")}/#top` })];
  const c = gateClaim(claim("事実", "s1", "s2"), sources);
  assert.equal(c.source_count, 1);
  assert.equal(c.single_source, true);
});

test("gate 4: only an exact entity can support facts", () => {
  const sources = [source("e"), source("s", { entity_match: "similar" }), source("u", { entity_match: "unknown" })];
  assert.deepEqual(gateEntity(sources).map((s) => s.id), ["e"]);
});

test("gate 4: similar-name results give an honest empty brief, research_status ok", () => {
  const b = gate(model([source("s1", { entity_match: "similar" }), source("s2", { entity_match: "unknown" })], ["s1", "s2"]));
  assert.equal(b.research_status, "ok");
  assert.deepEqual(b.sources, []);
  for (const c of [b.company_snapshot.business, b.company_snapshot.size, b.position_analysis.actual_work, b.position_analysis.salary]) assert.equal(c.value, NOT_FOUND);
  for (const l of [b.company_snapshot.recent_news, b.position_analysis.conditions, b.reputation_themes, b.interview_intelligence.reported_questions]) assert.deepEqual(l, []);
  assert.ok(!JSON.stringify(b).includes("新製品"), "no fact of the other company leaks");
  assert.equal(b.position_analysis.salary.bonus_included, "unknown", "a dropped salary cannot keep its bonus claim");
  assert.equal(b.position_analysis.salary.overtime_pay_included, "unknown");
  assert.equal(b.position_analysis.position_match, "unknown");
});

test("gate 4: a list claim backed only by a similar company disappears, the exact one stays", () => {
  const m = model([source("s1"), source("s2", { entity_match: "similar" })]);
  m.company_snapshot.recent_news = [claim("本物のニュース", "s1"), claim("別会社のニュース", "s2")];
  assert.deepEqual(gate(m).company_snapshot.recent_news.map((c) => c.value), ["本物のニュース"]);
});

test("gate 5: a condition from a similar posting is labelled and never stated as this position's", () => {
  const sources = [source("x"), source("y", { position_match: "similar" }), source("z", { position_match: "unknown" })];
  const exact = gatePosition(claim("年収800万", "x", "y"), sources);
  assert.equal(exact.position_match, "exact");
  assert.equal(exact.applies_to_position, true);
  const similar = gatePosition(claim("年収800万", "y", "z"), sources);
  assert.equal(similar.position_match, "similar");
  assert.equal(similar.applies_to_position, false);
  assert.equal(similar.value, "年収800万", "kept, but labelled");
  const unknown = gatePosition(claim("年収800万", "z"), sources);
  assert.equal(unknown.position_match, "unknown");
  assert.equal(unknown.applies_to_position, false);
  const gone = gatePosition(claim("年収800万", "dropped"), sources);
  assert.equal(gone.value, NOT_FOUND);
  assert.equal(gone.position_match, "unknown");
  assert.equal(gone.applies_to_position, false);
});

test("gate 5: the section's position_match is computed from sources, not taken from the model", () => {
  const b = gate(model([source("s1", { position_match: "similar" })]));
  assert.equal(b.position_analysis.position_match, "similar", "the model said exact");
  assert.equal(b.position_analysis.salary.applies_to_position, false);
  assert.equal(b.position_analysis.conditions[0].applies_to_position, false);
  assert.equal(gate(model([source("s1")])).position_analysis.position_match, "exact");
});

test("gate 6: reported question wording is cut to 80 characters, by code point", () => {
  assert.equal(EXCERPT_MAX, 80);
  assert.equal(clipExcerpt("短い質問"), "短い質問");
  assert.equal([...clipExcerpt("あ".repeat(81))].length, 80);
  assert.equal(clipExcerpt("😀".repeat(81)), "😀".repeat(80), "a surrogate pair is not split");
  const m = model([source("s1")]);
  m.interview_intelligence.reported_questions = [claim("問".repeat(500), "s1")];
  assert.equal(gate(m).interview_intelligence.reported_questions[0].value, "問".repeat(80));
});

test("gate 6: no page text is stored: long summaries are cut, tool results and unknown fields never enter the brief", () => {
  const m = model([{ ...source("s1", { title: "題".repeat(1000) }), page_text: "ページ全文" }]);
  m.company_snapshot.business = { ...claim("文".repeat(5000), "s1"), page_text: "ページ全文" };
  m.page_text = "ページ全文";
  const content = [{ ...searchBlock("s1"), secret: "ページ全文" }, { type: "web_fetch_tool_result", content: { type: "web_fetch_result", url: url("s1"), content: { type: "document", source: { data: "ページ全文" } } } }];
  const b = gate(m, content);
  const text = JSON.stringify(b);
  assert.ok(!text.includes("ページ全文"));
  assert.ok(text.length < 8000, `brief is ${text.length} chars`);
});

test("reported questions are unverified unless every source is an official careers page", () => {
  const off = source("o", { source_type: "official_careers" });
  const post = source("p", { source_type: "interview_post" });
  assert.equal(reportedLabel(claim("Q", "o"), [off, post]), "official");
  assert.equal(reportedLabel(claim("Q", "p"), [off, post]), "reported_unverified");
  assert.equal(reportedLabel(claim("Q", "o", "p"), [off, post]), "reported_unverified");
  assert.equal(reportedLabel(claim("Q", "dropped"), [off, post]), "reported_unverified");
  assert.equal(reportedLabel(claim("Q"), [off]), "reported_unverified");
  const b = gate(model([post, off], ["p"]), [searchBlock("p", "o")]);
  assert.equal(b.interview_intelligence.reported_questions[0].label, "reported_unverified");
});

test("research_status: a tool failure is unavailable, never not_found", () => {
  assert.equal(researchStatus([searchError], none), "unavailable");
  assert.equal(researchStatus([], none), "unavailable", "nothing searched cannot mean nothing exists");
  assert.equal(researchStatus([searchError], ran), "unavailable", "every search failed");
  assert.equal(researchStatus(undefined, undefined), "unavailable");
  assert.equal(researchStatus([searchError, searchBlock("a")], ran), "ok", "one failure among real results");
  assert.equal(researchStatus([searchBlock()], ran), "ok", "a real search with zero hits");
  assert.equal(researchStatus([searchBlock("a")], none), "unavailable", "the usage count is the proof of a real search");
});

test("an unavailable brief carries no sections, so no not_found can be shown", () => {
  const b = gate(model([source("s1")]), [searchError], none);
  assert.deepEqual(b, { research_status: "unavailable", research_date: DATE });
  assert.ok(!JSON.stringify(b).includes(NOT_FOUND));
});

test("a real search with no hits is an honest empty brief, not a failure", () => {
  const b = gate({ ...model([]), sources: [] }, [searchBlock()]);
  assert.equal(b.research_status, "ok");
  assert.equal(b.company_snapshot.business.value, NOT_FOUND);
});

test("a good brief keeps sourced facts, know-how fields and the research date", () => {
  const b = gate(model([source("s1", { published_date: "2026-10-01" }), source("s2")], ["s1", "s2"]));
  assert.equal(b.research_status, "ok");
  assert.equal(b.research_date, DATE);
  assert.equal(b.company_snapshot.business.value, "業務システムの開発");
  assert.equal(b.company_snapshot.business.confidence, "medium");
  assert.equal(b.company_snapshot.business.source_count, 2);
  assert.equal(b.company_snapshot.business.single_source, false);
  assert.deepEqual(b.position_analysis.salary.bonus_included, "yes");
  assert.deepEqual(b.position_analysis.salary.overtime_pay_included, "no");
  assert.equal(b.position_analysis.salary.applies_to_position, true);
  const theme = b.reputation_themes[0];
  assert.deepEqual([theme.polarity, theme.sample_size, theme.representativeness], ["negative", "12件", "low"]);
  assert.deepEqual(b.sources[0], { id: "s1", title: `${COMPANY} s1`, url: url("s1"), accessed_date: DATE, published_date: "2026-10-01", entity_match: "exact", position_match: "exact", source_type: "news" });
  for (const c of allClaims(b)) assert.ok(Array.isArray(c.source_ids) && c.source_count > 0, JSON.stringify(c));
});

test("a verdict smuggled in by the model never reaches the brief", () => {
  const m = { ...model([source("s1")]), recommended: true, verdict: "not recommended" };
  m.company_snapshot.recommended = true;
  const text = JSON.stringify(gate(m));
  assert.doesNotMatch(text, /recommended|verdict/);
});
