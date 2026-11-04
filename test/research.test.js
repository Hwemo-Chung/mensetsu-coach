// Stage R brief: schema shape and the code gates (model claims are not trusted). Offline, synthetic data only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MODELS } from "../lib/claude.js";
import { POST as access } from "../api/access.js";
import { POST as research } from "../api/research.js";
import { fakeClient, researchMessage } from "./fake-claude.js";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  researchEnabled, extractionSchema, fitSchema, briefSchema, NOT_FOUND, EXCERPT_MAX,
  resultUrls, gateSourceUrls, gateEntity, gateClaim, gatePosition, clipExcerpt, researchStatus, gateBrief,
  buildResearchRequest, runResearch, searchQueries, queryLogPath, logQueries, today, extractionWireSchema,
} from "../lib/research.js";

const COMPANY = "株式会社サンプルテック（仮）";
const url = (p) => `https://example.com/${p}`;
const searchBlock = (...paths) => ({ type: "web_search_tool_result", tool_use_id: "t1", content: paths.map((p) => ({ type: "web_search_result", title: p, url: url(p), encrypted_content: "x", page_age: null })) });
const fetchBlock = (p) => ({ type: "web_fetch_tool_result", tool_use_id: "t2", content: { type: "web_fetch_result", url: url(p), content: { type: "document" } } });
const searchError = { type: "web_search_tool_result", tool_use_id: "t3", content: { type: "web_search_tool_result_error", error_code: "invalid_tool_input" } };
const maxUsesError = { type: "web_search_tool_result", tool_use_id: "t5", content: { type: "web_search_tool_result_error", error_code: "max_uses_exceeded" } };
const rateLimited = { type: "web_search_tool_result", tool_use_id: "t6", content: { type: "web_search_tool_result_error", error_code: "too_many_requests" } };
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
  assert.deepEqual([...urls.keys()].sort(), [url("a"), url("b"), url("c")]);
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

test("gate 1 through gateBrief: an exact source with an invented URL is dropped and its claims are not_found", () => {
  const b = gate(model([source("s1", { url: url("invented") })]));
  assert.deepEqual(b.sources, []);
  assert.equal(b.company_snapshot.business.value, NOT_FOUND);
  assert.deepEqual(b.company_snapshot.recent_news, []);
  assert.ok(!JSON.stringify(b).includes("invented"));
});

test("gate 1: the stored URL is the real result's string, never the model's", () => {
  const stored = (modelUrl) => gate(model([source("s1", { url: modelUrl })])).sources[0].url;
  assert.equal(stored(`${url("s1")}#${"本文".repeat(5000)}`), url("s1"), "a fragment cannot carry page text");
  assert.equal(stored("https:\\\\example.com\\s1"), url("s1"));
  assert.equal(stored(`https://example.com/\ns1`), url("s1"));
  assert.equal(gate(model([source("s1", { url: url("page") })]), [searchBlock("page/")]).sources[0].url, url("page/"), "the slash the result really had");
});

test("gate 6: source ids are assigned by code, so the model's id cannot carry text", () => {
  const long = "本文".repeat(5000);
  const b = gate(model([source(long, { title: "t", url: url("s1") }), source("s9", { url: url("s2") })], [long, "s9"]));
  assert.deepEqual(b.sources.map((s) => s.id), ["s1", "s2"]);
  assert.deepEqual(b.company_snapshot.business.source_ids, ["s1", "s2"]);
  assert.ok(!JSON.stringify(b).includes("本文"));
});

test("gate 6: reassigning ids keeps every citation on its own page", () => {
  const swapped = model([source("s2", { url: url("s1") }), source("s1", { url: url("s2") })], ["s2"]);
  const b = gate(swapped);
  const page = (id) => b.sources.find((s) => s.id === id).url;
  assert.deepEqual(b.company_snapshot.business.source_ids.map(page), [url("s1")]);
  const dropped = gate(model([source("s1", { url: url("invented") }), source("x", { url: url("s1") })], ["s1"]));
  assert.deepEqual(dropped.sources.map((s) => s.id), ["s1"]);
  assert.equal(dropped.company_snapshot.business.value, NOT_FOUND, "a dropped source's id must not land on the renumbered survivor");
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
  const exact = gatePosition(claim("年収800万", "x"), sources);
  assert.equal(exact.position_match, "exact");
  assert.equal(exact.applies_to_position, true);
  // Intent changed: one exact source used to clear a claim that also cites a similar posting, whose figures may be the ones stated.
  const mixed = gatePosition(claim("年収800万", "x", "y"), sources);
  assert.equal(mixed.position_match, "similar");
  assert.equal(mixed.applies_to_position, false);
  assert.deepEqual(mixed.source_ids, ["x", "y"], "both stay citable");
  assert.equal(mixed.source_count, 1, "a similar posting does not add support for this position");
  assert.equal(mixed.single_source, true);
  const similar = gatePosition(claim("年収800万", "y"), sources);
  assert.equal(similar.position_match, "similar");
  assert.equal(similar.applies_to_position, false);
  assert.equal(similar.value, "年収800万", "kept, but labelled");
  assert.equal(similar.source_count, 1, "similar-only stays listed");
  // Intent changed with the worst-value rule: citing a page of unknown relation can no longer read as similar.
  const weakest = gatePosition(claim("年収800万", "y", "z"), sources);
  assert.equal(weakest.position_match, "unknown");
  assert.equal(weakest.applies_to_position, false);
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

test("gate 5: a mixed salary stays listed through gateBrief but is not this position's", () => {
  const m = model([source("s1"), source("s2", { position_match: "similar" })]);
  m.position_analysis.salary = { ...claim("年収800万", "s1", "s2"), bonus_included: "yes", overtime_pay_included: "no" };
  m.position_analysis.conditions = [claim("残業 月20時間", "s2")];
  const pos = gate(m).position_analysis;
  assert.equal(pos.salary.applies_to_position, false);
  assert.equal(pos.salary.source_count, 1);
  assert.equal(pos.salary.bonus_included, "yes");
  assert.equal(pos.conditions[0].value, "残業 月20時間", "similar-only conditions are not dropped by the list filter");
  assert.equal(pos.conditions[0].applies_to_position, false);
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
  const m = model([{ ...source("s1", { title: "題".repeat(1000), published_date: "日".repeat(1000) }), page_text: "ページ全文" }]);
  m.reputation_themes = [{ ...claim("残業の話題", "s1"), polarity: "negative", sample_size: "件".repeat(1000), representativeness: "low" }];
  m.company_snapshot.business = { ...claim("文".repeat(5000), "s1"), page_text: "ページ全文" };
  m.page_text = "ページ全文";
  const content = [{ ...searchBlock("s1"), secret: "ページ全文" }, { type: "web_fetch_tool_result", content: { type: "web_fetch_result", url: url("s1"), content: { type: "document", source: { data: "ページ全文" } } } }];
  const b = gate(m, content);
  const text = JSON.stringify(b);
  assert.ok(!text.includes("ページ全文"));
  assert.equal([...b.company_snapshot.business.value].length, 400);
  assert.equal([...b.sources[0].title].length, 200);
  assert.equal([...b.sources[0].published_date].length, 40);
  assert.equal([...b.reputation_themes[0].sample_size].length, 40);
  assert.ok(text.length < 8000, `brief is ${text.length} chars`);
});

// Intent changed: official_careers was trusted as the model's own reading, so a review page saying it is official could strip the label.
test("interview reports stay unverified: the model's official_careers mark cannot remove the label", () => {
  for (const source_type of ["interview_post", "review_site", "official_careers"]) {
    const iv = gate(model([source("s1", { url: url("review-site/company/1"), source_type })]), [searchBlock("review-site/company/1")]).interview_intelligence;
    assert.equal(iv.reported_questions[0].label, "reported_unverified", source_type);
    assert.equal(iv.selection_stages[0].label, "reported_unverified", source_type);
  }
});

test("every list is capped, so a page cannot be stored whole by splitting it into items", () => {
  const many = Array.from({ length: 200 }, (_, i) => claim(`${"文".repeat(399)}${i}`, "s1"));
  const m = model([source("s1")]);
  m.company_snapshot.recent_news = many;
  m.position_analysis.required_skills = many;
  m.position_analysis.preferred_skills = many;
  m.position_analysis.conditions = many;
  m.reputation_themes = many.map((c) => ({ ...c, polarity: "negative", sample_size: "1件", representativeness: "low" }));
  m.interview_intelligence.selection_stages = many;
  m.interview_intelligence.reported_questions = many;
  const b = gate(m);
  for (const l of [b.company_snapshot.recent_news, b.position_analysis.required_skills, b.position_analysis.preferred_skills, b.position_analysis.conditions, b.reputation_themes, b.interview_intelligence.selection_stages, b.interview_intelligence.reported_questions]) assert.equal(l.length, 10);
});

test("the cap counts surviving claims: dropped items do not use it up", () => {
  const m = model([source("s1")]);
  m.company_snapshot.recent_news = [...Array.from({ length: 50 }, () => claim("出典なし", "dropped")), claim("本物のニュース", "s1")];
  assert.deepEqual(gate(m).company_snapshot.recent_news.map((c) => c.value), ["本物のニュース"]);
});

test("the source list is capped: one URL under many ids cannot store a page through its titles", () => {
  const b = gate(model(Array.from({ length: 200 }, (_, i) => source(`x${i}`, { title: "題".repeat(200), url: url("s1") })), ["x0", "x199"]));
  assert.equal(b.sources.length, 30);
  assert.deepEqual(b.company_snapshot.business.source_ids, ["s1"], "a citation of a capped-out source is gone");
});

test("contact details from the web are redacted before anything is stored", () => {
  const contact = "hr-contact@example.com 03-1234-5678";
  const m = model([source("s1", { title: `採用担当 ${contact}` })]);
  m.company_snapshot.business = claim(`問い合わせ ${contact}`, "s1");
  m.company_snapshot.recent_news = [claim(`広報 ${contact}`, "s1")];
  m.position_analysis.salary = { ...claim(`担当 ${contact}`, "s1"), bonus_included: "yes", overtime_pay_included: "no" };
  m.reputation_themes = [{ ...claim(`投稿者 ${contact}`, "s1"), polarity: "negative", sample_size: contact, representativeness: "low" }];
  m.interview_intelligence.selection_stages = [claim(`連絡先 ${contact}`, "s1")];
  m.interview_intelligence.reported_questions = [claim("面接官 03-1234-5678 が聞いた", "s1")];
  const text = JSON.stringify(gate(m));
  assert.ok(!text.includes("hr-contact@example.com"));
  assert.ok(!text.includes("1234"));
  assert.ok(text.includes("[email]") && text.includes("[phone]"));
});

test("a phone number at the length limit is redacted before the cut, so no part of it survives", () => {
  const m = model([source("s1", { title: `${"題".repeat(192)}03-1234-5678` })]);
  m.company_snapshot.business = claim(`${"文".repeat(392)}03-1234-5678`, "s1");
  m.interview_intelligence.reported_questions = [claim(`${"問".repeat(72)}03-1234-5678`, "s1")];
  assert.ok(!JSON.stringify(gate(m)).includes("03-1234"));
  assert.ok(!clipExcerpt(`${"問".repeat(72)}03-1234-5678`).includes("03-1234"));
});

test("research_status: a tool failure is unavailable, never not_found", () => {
  assert.equal(researchStatus([searchError], none), "unavailable");
  assert.equal(researchStatus([], none), "unavailable", "nothing searched cannot mean nothing exists");
  assert.equal(researchStatus([searchError], ran), "unavailable", "every search failed");
  assert.equal(researchStatus(undefined, undefined), "unavailable");
  assert.equal(researchStatus([searchError, searchBlock("a")], ran), "ok", "one failure among real results");
  assert.equal(researchStatus([searchBlock()], ran), "ok", "a real search with zero hits");
  assert.equal(researchStatus([rateLimited, rateLimited, rateLimited, searchBlock()], ran), "unavailable", "zero hits with failures is not nothing found");
  assert.equal(researchStatus([searchBlock(), fetchError, fetchError], ran), "unavailable", "the fetch failures could have been the answer");
  assert.equal(researchStatus([maxUsesError, searchBlock()], ran), "ok", "the use cap is not a failure");
  assert.equal(researchStatus([searchBlock(), { ...fetchError, content: { ...fetchError.content, error_code: "max_uses_exceeded" } }], ran), "ok", "nor on fetch");
  assert.equal(researchStatus([searchBlock(), fetchBlock("c"), fetchError], ran), "ok", "a fetched page is a real result");
  assert.equal(researchStatus([searchBlock("a")], none), "unavailable", "the usage count is the proof of a real search");
});

test("an unavailable brief carries no sections, so no not_found can be shown", () => {
  const b = gate(model([source("s1")]), [searchError], none);
  assert.deepEqual(b, { research_status: "unavailable", research_date: DATE });
  assert.ok(!JSON.stringify(b).includes(NOT_FOUND));
});

test("failed searches with zero hits give no sections, so no not_found can be shown", () => {
  const b = gate(model([]), [rateLimited, rateLimited, rateLimited, searchBlock()], { server_tool_use: { web_search_requests: 4 } });
  assert.deepEqual(b, { research_status: "unavailable", research_date: DATE });
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

// --- Step 2: the search call and POST /api/research ---
const POSITION = "プロダクトマネージャー";
const MAIL = "この求人メールの本文は検索に使わない";
const PROFILE = "職務要約の本文も検索に使わない";
const searchUse = (query, id = "u1") => ({ type: "server_tool_use", id, name: "web_search", input: { query } });
const turn = (stop_reason, content, searches = 1, fetches = 0) => ({ stop_reason, content, usage: { input_tokens: 1, output_tokens: 1, server_tool_use: { web_search_requests: searches, web_fetch_requests: fetches } } });
const jsonText = (m) => ({ type: "text", text: JSON.stringify(m) });
const unavailable = { research_status: "unavailable", research_date: today() };

let ipCounter = 0;
const post = (body, { deps, code = "c0de", ip = `10.9.0.${++ipCounter}` } = {}) => {
  process.env.ACCESS_CODE = "c0de";
  const headers = { "x-forwarded-for": ip, ...(code && { "x-access-code": code }) };
  return research(new Request("http://x/api/research", { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) }), { enabled: true, ...deps });
};
const names = { company: COMPANY, position: POSITION, lang: "ja" };

test("the search request uses the verified Haiku tools and the brief schema, with nothing unverified", () => {
  const r = buildResearchRequest(COMPANY, POSITION, "ja");
  assert.equal(r.model, MODELS.research);
  assert.deepEqual(r.tools.map(({ type, name, max_uses }) => ({ type, name, max_uses })), [
    { type: "web_search_20250305", name: "web_search", max_uses: 4 },
    { type: "web_fetch_20250910", name: "web_fetch", max_uses: 4 },
  ]);
  assert.ok(r.tools[1].max_content_tokens > 0, "one page cannot fill the context");
  assert.deepEqual(r.output_config.format, { type: "json_schema", schema: extractionWireSchema });
  const text = JSON.stringify(r);
  for (const k of ["citations", "temperature", "fallbacks", "betas", "web_search_20260209"]) assert.ok(!text.includes(k), k);
});

// A real call 11/04 answered 400 "compiled grammar is too large" for the expanded schema, which offline tests cannot see.
test("the schema on the wire shares repeated shapes through $defs and means exactly the same", () => {
  const w = extractionWireSchema;
  const expand = (s) => {
    if (s.$ref) {
      const { $ref, ...rest } = s;
      return { ...expand(w.$defs[$ref.split("/").pop()]), ...rest };
    }
    return { ...s, ...(s.properties && { properties: Object.fromEntries(Object.entries(s.properties).map(([k, v]) => [k, expand(v)])) }), ...(s.items && { items: expand(s.items) }) };
  };
  const { $defs, ...root } = w;
  assert.deepEqual(expand(root), extractionSchema);
  assert.equal(root.type, "object", "the root stays an object");
  for (const d of Object.values($defs)) {
    assert.equal(d.additionalProperties, false);
    assert.deepEqual([...d.required].sort(), Object.keys(d.properties).sort());
  }
  const shapes = Object.values($defs).filter((d) => "value" in d.properties && "confidence" in d.properties);
  assert.equal(shapes.length, 3, "the plain claim, salary and the reputation theme: 25 claims must not expand into the grammar");
});

test("the search prompt: Japanese first, source priority, public pages only, web content is untrusted data", () => {
  const { system, messages } = buildResearchRequest(COMPANY, POSITION, "en", "2026-11-04");
  assert.match(system, /日本語.*先/);
  const order = ["公式", "IR", "採用", "報道", "口コミ", "面接体験"].map((w) => system.indexOf(w));
  assert.ok(order.every((n) => n >= 0), "every source class is named");
  assert.deepEqual([...order].sort((a, b) => a - b), order, "in priority order");
  assert.match(system, /12か月/);
  assert.match(system, /公開ページ/);
  assert.match(system, /ログイン/);
  assert.match(system, /信頼できないデータ/);
  assert.match(system, /指示.*従わない/);
  assert.match(system, /untrusted_web_content/);
  assert.match(system, /英語/, "explanations follow the screen language");
  assert.doesNotMatch(system, /verdict|推奨する/);
  const user = messages[0].content;
  assert.ok(user.includes(COMPANY) && user.includes(POSITION));
  assert.ok(user.includes("2026-11-04"), "12 months needs today's date");
  assert.equal(messages.length, 1);
});

test("guardrail 1: the request sent holds no mail, profile or attachment text, whatever the body carried", async () => {
  const client = fakeClient({ turns: [researchMessage] });
  const res = await post({ ...names, mail: MAIL, profile: PROFILE, attachment: { name: "cv.txt", data: PROFILE }, desired_position_profile: PROFILE, extra: MAIL }, { deps: { client } });
  assert.equal(res.status, 200);
  assert.equal(client.requests.length, 1);
  const sent = JSON.stringify(client.requests[0]);
  assert.ok(sent.includes(COMPANY) && sent.includes(POSITION));
  assert.ok(!sent.includes(MAIL) && !sent.includes(PROFILE));
  assert.deepEqual(client.requests[0], buildResearchRequest(COMPANY, POSITION, "ja", today()), "built from the two names and nothing else");
});

test("guardrail 1: contact details and a pasted mail never reach the search", async () => {
  const client = fakeClient({ turns: [researchMessage] });
  await post({ ...names, company: "サンプル hr-contact@example.com 03-1234-5678" }, { deps: { client } });
  const sent = JSON.stringify(client.requests[0]);
  assert.ok(!sent.includes("hr-contact@example.com") && !sent.includes("1234"));
  const untouched = fakeClient({ turns: [researchMessage] });
  const res = await post({ ...names, company: "本文".repeat(51) }, { deps: { client: untouched } });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { code: "name_too_long", max: 100 });
  assert.equal(untouched.requests.length, 0);
});

test("a multi-line name is one line by the time it is searched", async () => {
  const client = fakeClient({ turns: [researchMessage] });
  await post({ ...names, position: `${POSITION}\n\t候補` }, { deps: { client } });
  assert.ok(client.requests[0].messages[0].content.includes(`${POSITION} 候補`));
});

test("POST: the fixture run gives a gated brief, with the similar-name company's facts gone", async () => {
  const res = await post(names, { deps: { client: fakeClient({ turns: [researchMessage] }) } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  const b = await res.json();
  assert.equal(b.research_status, "ok");
  assert.equal(b.research_date, today());
  assert.deepEqual(b.sources.map((s) => s.url), ["https://example.com/sampletech/careers", "https://example.com/reviews/sampletech"]);
  assert.equal(b.company_snapshot.size.value, NOT_FOUND);
  assert.equal(b.company_snapshot.business.source_count, 1, "the similar company's page adds no support");
  assert.equal(b.position_analysis.salary.applies_to_position, true);
  assert.equal(b.position_analysis.salary.bonus_included, "unknown");
  assert.equal(b.interview_intelligence.reported_questions[0].label, "reported_unverified");
  assert.ok(!JSON.stringify(b).includes("架空の企業の架空の採用ページ"), "no page text");
  assert.ok(!JSON.stringify(b).includes("synthetic"), "no tool payload");
});

test("POST: gate order is rate limit, then access, then flag, then validation; the client is not called", async () => {
  const client = fakeClient({ turns: [researchMessage] });
  const code = async (res) => [res.status, (await res.json()).code];
  assert.deepEqual(await code(await post(names, { deps: { client }, code: null })), [401, "access_denied"]);
  assert.deepEqual(await code(await post(names, { deps: { client }, code: "wrong" })), [401, "access_denied"]);
  assert.deepEqual(await code(await post(names, { deps: { client, enabled: false } })), [503, "research_unavailable"]);
  assert.deepEqual(await code(await post("{not json", { deps: { client } })), [400, "bad_request"]);
  assert.deepEqual(await code(await post({ ...names, lang: "fr" }, { deps: { client } })), [400, "lang_unsupported"]);
  assert.deepEqual(await code(await post({ ...names, lang: "constructor" }, { deps: { client } })), [400, "lang_unsupported"]);
  for (const bad of [undefined, "", "   ", 5, null, ["a"]]) {
    assert.deepEqual(await code(await post({ ...names, company: bad }, { deps: { client } })), [400, "name_required"]);
    assert.deepEqual(await code(await post({ ...names, position: bad }, { deps: { client } })), [400, "name_required"]);
  }
  assert.deepEqual(await code(await post({ ...names, position: "職".repeat(101) }, { deps: { client } })), [400, "name_too_long"]);
  assert.equal(client.requests.length, 0);
});

test("POST: the flag comes from the server's environment", async () => {
  const saved = process.env.RESEARCH_ENABLED;
  delete process.env.RESEARCH_ENABLED;
  process.env.ACCESS_CODE = "c0de";
  const req = () => new Request("http://x/api/research", { method: "POST", headers: { "x-access-code": "c0de", "x-forwarded-for": `10.9.1.${++ipCounter}` }, body: JSON.stringify(names) });
  assert.equal((await research(req(), { client: fakeClient({ turns: [researchMessage] }) })).status, 503);
  process.env.RESEARCH_ENABLED = "1";
  assert.equal((await research(req(), { client: fakeClient({ turns: [researchMessage] }) })).status, 200);
  if (saved === undefined) delete process.env.RESEARCH_ENABLED; else process.env.RESEARCH_ENABLED = saved;
});

test("POST: the limit is 5 per 10 minutes per IP, checked before anything else", async () => {
  const client = fakeClient({ turns: [researchMessage] });
  for (let i = 0; i < 5; i++) assert.equal((await post(names, { deps: { client }, ip: "10.9.2.1" })).status, 200);
  const over = await post(names, { deps: { client }, ip: "10.9.2.1", code: null });
  assert.equal(over.status, 429);
  assert.deepEqual(await over.json(), { code: "rate_limited" });
  assert.equal((await post(names, { deps: { client }, ip: "10.9.2.2" })).status, 200, "another IP is unaffected");
  assert.equal(client.requests.length, 6);
});

test("degrade path: every failure is 200 unavailable, with no sections and no error text", async () => {
  const failing = {
    "API error": fakeClient({ fail: Object.assign(new Error("boom secret"), { status: 500 }) }),
    "rate limit": fakeClient({ fail: Object.assign(new Error("slow down"), { status: 429 }) }),
    "not JSON": fakeClient({ turns: [turn("end_turn", [searchUse("q"), searchBlock("s1"), { type: "text", text: "申し訳ありません" }])] }),
    truncated: fakeClient({ turns: [turn("max_tokens", [searchBlock("s1"), { type: "text", text: "{" }])] }),
    refusal: fakeClient({ turns: [turn("refusal", [])] }),
    "JSON of the wrong shape": fakeClient({ turns: [turn("end_turn", [searchBlock("s1"), { type: "text", text: "null" }])] }),
    "still paused": fakeClient({ turns: [turn("pause_turn", [searchUse("q"), searchBlock("s1")])] }),
    "search errors": fakeClient({ turns: [turn("end_turn", [searchError, jsonText(model([source("s1")]))], 0)] }),
    "failed searches with zero hits": fakeClient({ turns: [turn("end_turn", [rateLimited, searchBlock(), jsonText(model([]))], 2)] }),
  };
  for (const [name, client] of Object.entries(failing)) {
    const res = await post(names, { deps: { client } });
    assert.equal(res.status, 200, name);
    assert.deepEqual(await res.json(), unavailable, name);
  }
});

test("degrade path: the whole run has one deadline, so it answers before Vercel kills the function", async () => {
  const signals = [];
  const hanging = { beta: { messages: { stream: (_, opts) => (signals.push(opts?.signal), { finalMessage: () => new Promise((_, reject) => opts.signal.addEventListener("abort", () => reject(new Error("aborted")))) }) } } };
  const res = await post(names, { deps: { client: hanging, deadlineMs: 20 } });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), unavailable);
  assert.equal(signals.length, 1);
  const seen = [];
  const client = fakeClient({ turns: [turn("pause_turn", [searchUse("q"), searchBlock("s1")]), turn("end_turn", [jsonText(model([source("s1")]))], 0)] });
  const stream = client.beta.messages.stream;
  client.beta.messages.stream = (req, opts) => (seen.push(opts?.signal), stream(req, opts));
  await post(names, { deps: { client } });
  assert.equal(seen.length, 2);
  assert.ok(seen[0] instanceof AbortSignal);
  assert.equal(seen[0], seen[1], "resumes share the first call's deadline");
  assert.ok(Number(JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url))).functions["api/research.js"].maxDuration) * 1000 > 105_000, "the deadline fits maxDuration");
});

test("tool failure vs honest empty: a real search on a fictional name is ok and all not_found", async () => {
  const onlySimilar = model([source("s1", { entity_match: "similar" })]);
  const res = await post(names, { deps: { client: fakeClient({ turns: [turn("end_turn", [searchUse("q"), searchBlock("s1"), jsonText(onlySimilar)])] }) } });
  const b = await res.json();
  assert.equal(b.research_status, "ok");
  assert.deepEqual(b.sources, []);
  assert.equal(b.company_snapshot.business.value, NOT_FOUND);
  const none = await post(names, { deps: { client: fakeClient({ turns: [turn("end_turn", [searchUse("q"), searchBlock(), jsonText(model([]))])] }) } });
  assert.equal((await none.json()).research_status, "ok", "a search that matched nothing is not a failure");
});

test("pause_turn: resumes with every paused response in order, no new user message, the same tools, no more tool use", async () => {
  const first = [searchUse("q1"), searchBlock("s1")];
  const second = [searchUse("q2", "u2"), { type: "server_tool_use", id: "u3", name: "web_fetch", input: { url: url("s2") } }];
  const client = fakeClient({ turns: [turn("pause_turn", first), turn("pause_turn", second, 1), turn("end_turn", [fetchBlock("s2"), jsonText(model([source("s1"), source("s2")], ["s1", "s2"]))], 0, 1)] });
  const b = await runResearch(client, COMPANY, POSITION, "ja", { date: DATE });
  const base = buildResearchRequest(COMPANY, POSITION, "ja", DATE);
  assert.equal(client.requests.length, 3);
  assert.deepEqual(client.requests[0], base);
  assert.deepEqual(client.requests[1].messages, [...base.messages, { role: "assistant", content: first }]);
  assert.deepEqual(client.requests[2].messages, [...base.messages, { role: "assistant", content: first }, { role: "assistant", content: second }]);
  for (const r of client.requests.slice(1)) {
    assert.deepEqual(r.tools, base.tools, "a pending server tool must stay defined");
    assert.deepEqual(r.tool_choice, { type: "none" }, "max_uses is per request, so a resume could spend the budget again");
  }
  // Gate 1 and the search count must see every turn: s1 came back only in the first one.
  assert.equal(b.research_status, "ok");
  assert.deepEqual(b.sources.map((s) => s.url), [url("s1"), url("s2")]);
  assert.equal(b.company_snapshot.business.source_count, 2);
});

test("pause_turn: searches in an earlier turn count even when the last turn reports none", async () => {
  const client = fakeClient({ turns: [turn("pause_turn", [searchUse("q"), searchBlock("s1")], 1), turn("end_turn", [jsonText(model([source("s1")]))], 0)] });
  assert.equal((await runResearch(client, COMPANY, POSITION, "ja", { date: DATE })).research_status, "ok");
});

test("pause_turn: resumes are bounded", async () => {
  const client = fakeClient({ turns: [turn("pause_turn", [searchUse("q"), searchBlock("s1")])] });
  await assert.rejects(runResearch(client, COMPANY, POSITION, "ja", { date: DATE }));
  assert.equal(client.requests.length, 3);
  const res = await post(names, { deps: { client } });
  assert.deepEqual(await res.json(), unavailable);
});

test("only the JSON after the last tool result is parsed: a preamble before a search does not fail the run", async () => {
  const content = [{ type: "text", text: "検索します。" }, searchUse("q"), searchBlock("s1"), { type: "thinking", thinking: "", signature: "x" }, jsonText(model([source("s1")]))];
  const b = await runResearch(fakeClient({ turns: [turn("end_turn", content)] }), COMPANY, POSITION, "ja", { date: DATE });
  assert.equal(b.company_snapshot.business.value, "業務システムの開発");
});

test("searchQueries: real queries from the response blocks only", () => {
  const content = [searchUse("a b"), { type: "server_tool_use", name: "web_fetch", input: { url: url("x") } }, { type: "server_tool_use", name: "web_search", input: { params: {} } }, { type: "text", text: "c" }, searchBlock("s1")];
  assert.deepEqual(searchQueries(content), ["a b"]);
  assert.deepEqual(searchQueries(undefined), []);
});

test("query log: only with RESEARCH_DEBUG=1, outside production and Vercel, and to a path outside the repo", () => {
  const on = { RESEARCH_DEBUG: "1", RESEARCH_DEBUG_LOG: join(tmpdir(), "queries.log") };
  assert.equal(queryLogPath(on), on.RESEARCH_DEBUG_LOG);
  assert.equal(queryLogPath({}), null);
  assert.equal(queryLogPath({ ...on, RESEARCH_DEBUG: "0" }), null);
  assert.equal(queryLogPath({ RESEARCH_DEBUG: "1" }), null, "no path, no log");
  assert.equal(queryLogPath({ ...on, NODE_ENV: "production" }), null);
  assert.equal(queryLogPath({ ...on, VERCEL: "1" }), null);
  const inRepo = new URL("../queries.log", import.meta.url).pathname;
  assert.equal(queryLogPath({ ...on, RESEARCH_DEBUG_LOG: inRepo }), null);
  assert.equal(queryLogPath({ ...on, RESEARCH_DEBUG_LOG: new URL("../test/x/../q.log", import.meta.url).pathname }), null);
  assert.equal(queryLogPath({ ...on, RESEARCH_DEBUG_LOG: "queries.log" }), null, "relative to the repo");
});

test("query log: a run writes its real queries from every turn and nothing else; a write failure does not fail the run", async () => {
  const dir = mkdtempSync(join(tmpdir(), "research-log-"));
  const path = join(dir, "q.log");
  const env = { RESEARCH_DEBUG: "1", RESEARCH_DEBUG_LOG: path };
  const client = fakeClient({ turns: [turn("pause_turn", [searchUse(`${COMPANY} 採用`), searchBlock("s1")]), turn("end_turn", [searchUse(`${COMPANY} 面接`, "u2"), jsonText(model([source("s1")]))], 1)] });
  await runResearch(client, COMPANY, POSITION, "ja", { date: DATE, env });
  assert.deepEqual(readFileSync(path, "utf8").trim().split("\n").map((l) => JSON.parse(l)), [`${COMPANY} 採用`, `${COMPANY} 面接`]);
  const bad = { ...env, RESEARCH_DEBUG_LOG: join(dir, "missing", "q.log") };
  assert.equal((await runResearch(fakeClient({ turns: [researchMessage] }), COMPANY, POSITION, "ja", { date: DATE, env: bad })).research_status, "ok");
  assert.doesNotThrow(() => logQueries([searchUse("x")], bad));
  rmSync(dir, { recursive: true });
});

test("vercel.json gives the route 120 s, as the spec fixes", () => {
  assert.equal(JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url))).functions["api/research.js"].maxDuration, 120);
});
