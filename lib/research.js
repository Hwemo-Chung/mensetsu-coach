// Stage R brief: schemas and code gates (SUPPLEMENT-AUTO-RESEARCH §10). Server tools run at Anthropic, so model claims are checked here.
import { redact } from "./privacy.js";

export const researchEnabled = (env = process.env) => env.RESEARCH_ENABLED === "1";

export const NOT_FOUND = "not_found";
export const EXCERPT_MAX = 80;
const SUMMARY_MAX = 400; // guardrail 4: a claim is a summary, so a pasted page cannot be stored whole through it
const LIST_MAX = 10; // the length limits mean nothing if a page can be split across unlimited items; strict schemas forbid maxItems
const SOURCE_MAX = 30; // ids are free, so one URL could otherwise repeat under unlimited titles

const text = (description) => ({ type: "string", description });
const oneOf = (description, ...values) => ({ type: "string", enum: values, description });
const list = (items, description) => ({ type: "array", items, ...(description && { description }) });
const obj = (properties, description) => ({ type: "object", ...(description && { description }), properties, required: Object.keys(properties), additionalProperties: false });

const MATCH = ["exact", "similar", "unknown"];
const sourceIds = list({ type: "string" }, "根拠にした sources の id。なければ空");
const claim = (description, extra = {}) => obj({
  value: text(`${description}。出典がなければ ${NOT_FOUND}`),
  source_ids: sourceIds,
  confidence: oneOf("この主張の確信度", "high", "medium", "unknown"),
  ...extra,
});
const claims = (description) => list(claim(description));

// Search call (MODELS.research): company name and position only, so these sections never hold candidate data.
export const extractionSchema = obj({
  company_snapshot: obj({
    business: claim("事業内容"),
    business_model: claim("事業形態の事実（自社製品 / 受託 / 常駐 / 派遣の許可）。個々の職種の法的な契約形態は断定しない"),
    size: claim("規模"),
    founded: claim("設立"),
    locations: claim("本社・拠点"),
    recent_news: claims("直近12か月の報道"),
  }),
  position_analysis: obj({
    position_match: oneOf("確認済みの職種との一致度。参考値であり、コードが出典から計算し直す", ...MATCH),
    actual_work: claim("この企業でこの職種が実際に行う業務"),
    team_context: claim("公開されているチーム・組織の文脈"),
    required_skills: claims("公開された必須スキル"),
    preferred_skills: claims("公開された歓迎スキル"),
    salary: claim("公開された年収の範囲。保証ではない", {
      bonus_included: oneOf("年収に賞与が含まれるか。記載がなければ unknown", "yes", "no", "unknown"),
      overtime_pay_included: oneOf("年収に残業代が含まれるか。記載がなければ unknown", "yes", "no", "unknown"),
    }),
    conditions: claims("公開された勤務条件"),
  }),
  reputation_themes: list(claim("社員の口コミで繰り返し現れるテーマの集約。論評を加えず、業界平均を企業のスコアとして扱わない", {
    polarity: oneOf("テーマの向き", "positive", "negative"),
    sample_size: text("情報源に表示されているサンプル数。表示がなければ unknown"),
    representativeness: oneOf("サンプルが少ない、または特定の職種に偏っていれば low", "normal", "low", "unknown"),
  })),
  interview_intelligence: obj({
    selection_stages: claims("公開されている選考の段階"),
    reported_questions: claims(`報告された面接質問の文言。${EXCERPT_MAX}文字以内`),
  }),
  sources: list(obj({
    id: text("source_ids から参照する id"),
    title: text("ページの題名"),
    url: text("検索・取得の結果に実際に含まれていた URL のみ"),
    published_date: text("表示されている公開日。なければ空文字"),
    entity_match: oneOf("確認済みの企業そのものか。類似名の別企業は similar", ...MATCH),
    position_match: oneOf("確認済みの職種そのものの情報か。類似の求人は similar", ...MATCH),
    source_type: oneOf("情報源の種類", "official_careers", "official_other", "news", "review_site", "interview_post", "other"),
  })),
});

const fitItem = obj({
  point: text("一致点または相違点"),
  basis: oneOf("引用元", "user_material", "company_info"),
  quote: text("利用者資料または出典付き企業情報からの引用"),
  source_ids: sourceIds,
});
const flagSide = obj({
  origin: oneOf("この側の出どころ", "mail", "research", "desired_profile"),
  quote: text("この側の文面の引用"),
  source_ids: sourceIds,
});

// Fit call (MODELS.fit, no tools). Mismatches are prompts to verify: there is deliberately no verdict field.
export const fitSchema = obj({
  fit_evaluation: obj({
    matches: list(fitItem),
    gaps: list(fitItem),
    needs_user_confirmation: list({ type: "string" }, "引用できず事実として扱えない項目。確認の質問として書く"),
  }),
  mismatch_flags: list(obj({
    topic: text("相違の論点"),
    side_a: flagSide,
    side_b: flagSide,
    verify_prompt: text("確認を促す文。虚偽や職種の良し悪しを判定しない"),
  }), "重要な相違のみ。相違がなければ空"),
  company_checkpoints: list(obj({
    question: text("中立的な確認の質問。結論を書かない"),
    ask: oneOf("確認する相手。条件はエージェント", "agent", "interview"),
    source_ids: sourceIds,
  })),
});

// The stored brief = these sections (fit added by its own call) plus the fields the gates compute; unavailable has no sections.
export const briefSchema = {
  type: "object",
  properties: {
    research_status: oneOf("調査の成否", "ok", "unavailable"),
    research_date: text("調査日"),
    ...extractionSchema.properties,
    ...fitSchema.properties,
  },
  required: ["research_status", "research_date"],
  additionalProperties: false,
};

// Every model string stored goes through here. Redact first: a phone number cut in half no longer matches.
const clean = (s, max) => (typeof s === "string" ? [...redact(s)].slice(0, max).join("") : "");
export const clipExcerpt = (s) => clean(s, EXCERPT_MAX);

// Only the fragment and a trailing slash may differ; anything else is another page, and only http(s) may become a link.
const canonical = (url) => {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.hash = "";
    u.pathname = u.pathname.replace(/\/$/, "");
    return u.href;
  } catch {
    return null;
  }
};

// Gate 1. Result blocks only: server_tool_use is what was asked for, not what came back. Maps canonical form to the URL as returned.
export function resultUrls(content) {
  const urls = new Map();
  for (const b of content ?? []) {
    const results = b.type === "web_search_tool_result" && Array.isArray(b.content) ? b.content.filter((r) => r.type === "web_search_result")
      : b.type === "web_fetch_tool_result" && b.content?.type === "web_fetch_result" ? [b.content] : [];
    for (const r of results) {
      const u = canonical(r.url);
      if (u) urls.set(u, r.url);
    }
  }
  return urls;
}

// The stored URL is the result's: the model's string may differ in a fragment that can carry any text.
export function gateSourceUrls(sources, content) {
  const urls = resultUrls(content);
  return sources.filter((s) => urls.has(canonical(s.url))).map((s) => ({ ...s, url: urls.get(canonical(s.url)) }));
}

// Gate 4. Probes on a fictional name returned similarly named companies, so only exact may feed facts.
export const gateEntity = (sources) => sources.filter((s) => s.entity_match === "exact");

const cited = (c, sources) => [...new Set(c?.source_ids ?? [])].flatMap((id) => sources.filter((s) => s.id === id));

// Distinct pages are counted so two ids for one page stay single-source.
const counted = (hits) => {
  const source_count = new Set(hits.map((s) => canonical(s.url))).size;
  return { source_count, single_source: source_count === 1 };
};

// Gates 2 and 3. Pass the sources that survived gates 1 and 4.
export function gateClaim(c, sources) {
  const hits = cited(c, sources);
  const value = clean(c?.value, SUMMARY_MAX).trim();
  if (!hits.length || !value || value === NOT_FOUND) return { value: NOT_FOUND, source_ids: [], confidence: "unknown", source_count: 0, single_source: false };
  return { value, source_ids: [...new Set(hits.map((s) => s.id))], confidence: c.confidence, ...counted(hits) };
}

const bestMatch = (sources) => MATCH.find((m) => sources.some((s) => s.position_match === m)) ?? "unknown";
const worstMatch = (sources) => MATCH.findLast((m) => sources.some((s) => s.position_match === m)) ?? "unknown";

// Gate 5. A similar posting stays visible with its label; a claim citing one may state its figures, so only all-exact speaks for this position.
export function gatePosition(c, sources) {
  const out = gateClaim(c, sources);
  const hits = out.source_ids.length ? cited(c, sources) : [];
  const position_match = worstMatch(hits);
  const exact = hits.filter((s) => s.position_match === "exact");
  return { ...out, ...(exact.length ? counted(exact) : {}), position_match, applies_to_position: position_match === "exact" };
}

// The cap on tool uses says nothing about what exists; any other failure may have hidden the answer.
const toolFailed = (b) => /_tool_result$/.test(b.type) && !Array.isArray(b.content) && b.content?.error_code !== "max_uses_exceeded";

// §10-7. Search errors arrive as result objects, not exceptions; without a real search, "nothing found" would be a lie.
export function researchStatus(content, usage) {
  const searched = usage?.server_tool_use?.web_search_requests > 0;
  const answered = (content ?? []).some((b) => b.type === "web_search_tool_result" && Array.isArray(b.content));
  const emptyByFailure = resultUrls(content).size === 0 && (content ?? []).some(toolFailed);
  return searched && answered && !emptyByFailure ? "ok" : "unavailable";
}

// Named fields only: nothing the model adds, and no tool result text, can reach the session.
export function gateBrief(model, { content, usage, date }) {
  const research_status = researchStatus(content, usage);
  if (research_status === "unavailable") return { research_status, research_date: date };
  const kept = gateEntity(gateSourceUrls(model.sources ?? [], content)).slice(0, SOURCE_MAX);
  // Code-assigned ids: the model's id is unbounded text. Claims are rekeyed first, so a dropped source's id cannot land on a survivor.
  const ids = new Map([...new Set(kept.map((s) => s.id))].map((id, i) => [id, `s${i + 1}`]));
  const sources = kept.map((s) => ({ ...s, id: ids.get(s.id) }));
  const rekeyed = (c) => ({ ...c, source_ids: (c?.source_ids ?? []).map((id) => ids.get(id)) });
  const { company_snapshot: co = {}, position_analysis: pos = {}, interview_intelligence: iv = {} } = model;
  const fact = (c) => gateClaim(rekeyed(c), sources);
  const posFact = (c) => gatePosition(rekeyed(c), sources);
  const found = (items, gate) => (items ?? []).map(gate).filter((c) => c.source_count).slice(0, LIST_MAX);
  // shortcut: official_careers is only the model's reading of a page and code has no official domain to check it against, so every report stays unverified; lift it for hosts confirmed at the name-check step if that step ever collects one.
  const reported = (c) => ({ ...c, label: "reported_unverified" });

  const salary = posFact(pos.salary);
  const position = {
    actual_work: posFact(pos.actual_work),
    team_context: posFact(pos.team_context),
    required_skills: found(pos.required_skills, posFact),
    preferred_skills: found(pos.preferred_skills, posFact),
    salary: {
      ...salary,
      bonus_included: salary.source_count ? pos.salary.bonus_included : "unknown",
      overtime_pay_included: salary.source_count ? pos.salary.overtime_pay_included : "unknown",
    },
    conditions: found(pos.conditions, posFact),
  };

  return {
    research_status,
    research_date: date,
    company_snapshot: {
      business: fact(co.business),
      business_model: fact(co.business_model),
      size: fact(co.size),
      founded: fact(co.founded),
      locations: fact(co.locations),
      recent_news: found(co.recent_news, fact),
    },
    position_analysis: { position_match: bestMatch(Object.values(position).flat()), ...position },
    reputation_themes: found(model.reputation_themes, (t) => ({ ...fact(t), polarity: t.polarity, sample_size: clean(t.sample_size, 40) || "unknown", representativeness: t.representativeness })),
    interview_intelligence: {
      selection_stages: found(iv.selection_stages, (s) => reported(fact(s))),
      reported_questions: found(iv.reported_questions, (q) => reported(fact({ ...q, value: clipExcerpt(q.value) }))),
    },
    sources: sources.map((s) => ({ id: s.id, title: clean(s.title, 200), url: s.url, accessed_date: date, published_date: clean(s.published_date, 40), entity_match: s.entity_match, position_match: s.position_match, source_type: s.source_type })),
  };
}
