import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionToMarkdown, exportFileName, compareAttempts, mask, statusOf, prepToMarkdown, prepView, prepSlots, mergePrep, prepFileName } from "../public/export.js";
import { maskInput } from "../lib/privacy.js";
import { LANGS } from "../public/i18n/index.js";
import { fixture, scriptFixture, reviewFixture } from "./fake-claude.js";

const session = {
  company_context: fixture.company_context,
  questions: fixture.questions.map((q, i) => ({ id: `q${i + 1}`, ...q })),
  attempts: [{ question_id: "q3", answer: "먼저 영향 범위를 확인합니다. 연락처 test@example.com", review: { ...reviewFixture, corrections: reviewFixture.corrections.slice(0, 1), dropped: 1 }, script: scriptFixture }],
};

test("F6 markdown: company, all 10 questions, each attempt with ① review ② corrections ③ script", () => {
  const md = sessionToMarkdown(session, LANGS.ko);
  assert.match(md, /^# /);
  assert.ok(md.includes(fixture.company_context.position));
  for (const q of fixture.questions) assert.ok(md.includes(q.question), q.question);
  assert.ok(md.includes("① 구조 점검") && md.includes("② 첨삭") && md.includes("③ 모범 스크립트"));
  assert.ok(md.includes(scriptFixture.text) && md.includes(scriptFixture.reading) && md.includes(scriptFixture.translation));
  assert.ok(md.includes("【str-ketsuron】"));
  assert.ok(md.includes("1차 면접"), "stage label translated");
});

// m5: public/ cannot import lib/, so export.js carries a copy of lib/privacy.js maskInput; this keeps the two in step.
test("F6 masking: export mask equals the server maskInput on the same samples (postal code in a memo included)", () => {
  const samples = ["〒100-0001 東京都千代田区", "100-0001", "連絡先 03-1234-5678 / +81 90 1234 5678", "mail: a.b+c@example.co.jp", "山田様", "  홍길동 님", "〒100-0001\n090-1234-5678", "株式会社サンプル 様式 3-4", "山田 太郎 様", "taro＠example.co.jp", "TEL：０９０－１２３４－５６７８", "090.1234.5678", "03(1234)5678", "TEL 03（1234）5678 / 2026-11-04 (10:00)", "2019.04 - 2023.03", "2019.04-2023.03", "2019-04-01 - 2023-03-31"];
  for (const s of samples) assert.equal(mask(s), maskInput(s), s);
  const md = sessionToMarkdown({ ...session, notes: { q1: "面接会場 〒100-0001\n担当 山田様" } }, LANGS.ko);
  assert.ok(!md.includes("100-0001"), "postal code in a memo is masked");
});

test("F6 markdown: personal-data patterns are masked in the exported document (PRD F6 gate)", () => {
  const md = sessionToMarkdown(session, LANGS.ko);
  assert.ok(!/[\w.+-]+@[\w-]+\.[\w.-]+/.test(md), "no email");
  assert.ok(!/0\d{1,3}-\d{2,4}-\d{4}/.test(md), "no phone");
  assert.ok(md.includes("[email]"));
});

test("F6 markdown: works with no attempts and with a failed review; labels follow the language", () => {
  const md = sessionToMarkdown({ ...session, attempts: [{ question_id: "q1", answer: "A", review: null, script: scriptFixture }] }, LANGS.en);
  // Intent unchanged: the en label was renamed 11/04 ("A stronger version", US/UK benchmark), so read it from en.js.
  assert.ok(md.includes(LANGS.en.script.title));
  assert.ok(!md.includes(LANGS.en.review.title));
  assert.ok(sessionToMarkdown({ ...session, attempts: [] }, LANGS.ja).includes(fixture.questions[0].question));
});

test("F6 file name: date only, no company name", () => {
  assert.equal(exportFileName(new Date("2026-11-02T10:00:00+09:00")), "mensetsu-2026-11-02.md");
});

test("F9 habitCounts: counts corrections per rule across attempts, flags ≥2 as a habit, uses the short pattern", async () => {
  const { habitCounts } = await import("../public/export.js");
  const mk = (ids) => ({ review: { corrections: ids.map((id) => ({ rule_id: id, pattern: id === "del-chanto" ? "ちゃんと" : "〜の形 / 〜という形で" })) } });
  const counts = habitCounts({ attempts: [mk(["del-chanto", "del-katachi"]), mk(["del-chanto"]), { review: null }, mk(["del-chanto"])] });
  assert.deepEqual(counts, [{ rule_id: "del-chanto", label: "ちゃんと", count: 3, habit: true }, { rule_id: "del-katachi", label: "〜の形", count: 1, habit: false }]);
  assert.deepEqual(habitCounts({ attempts: [] }), []);
});

test("F9 export includes a habit summary when there are corrections", () => {
  const withC = { ...session, attempts: [{ ...session.attempts[0] }] };
  const md = sessionToMarkdown(withC, LANGS.ko);
  assert.ok(md.includes(LANGS.ko.habits.summary));
});

test("notes: each question's memo is exported under that question and masked", () => {
  const md = sessionToMarkdown({ ...session, notes: { q2: "숫자 먼저\n연락 test@example.com" } }, LANGS.ko);
  const at = md.indexOf(fixture.questions[1].question);
  const memo = md.indexOf(`- ${LANGS.ko.export.notes}: 숫자 먼저\n     연락 [email]`);
  assert.ok(at > 0 && memo > at && memo < md.indexOf(fixture.questions[2].question), "memo sits under Q2");
  assert.equal(sessionToMarkdown(session, LANGS.ko).includes(`${LANGS.ko.export.notes}:`), false, "no memo, no line");
});

test("compareAttempts: null below two reviewed attempts; first vs latest per step otherwise", () => {
  const miss = { ...reviewFixture, answers_question: "no" };
  const all = { ...reviewFixture, answers_question: "yes", steps: Object.fromEntries(Object.keys(reviewFixture.steps).map((k) => [k, { present: true, note: "" }])) };
  const s = { ...session, attempts: [{ question_id: "q3", answer: "first", review: miss }, { question_id: "q4", answer: "other", review: all }, { question_id: "q3", answer: "no review", review: null }] };
  assert.equal(compareAttempts(s, "q3"), null, "one reviewed attempt only");
  s.attempts.push({ question_id: "q3", answer: "mid", review: miss }, { question_id: "q3", answer: "last", review: all });
  const c = compareAttempts(s, "q3");
  assert.equal(c.n, "3");
  assert.deepEqual(c.answered, ["no", "yes"]);
  assert.deepEqual(c.answers, ["first", "last"]);
  // Label 選択肢 → 締め 11/03 (PRD §16-15: the last step closes by question type); intent unchanged.
  assert.deepEqual(c.steps.map((x) => x.label), ["復唱", "結論", "基準・数字", "締め"], "JP labels when the session has no pack meta");
  assert.ok(c.steps.every((x) => x.last));
  assert.deepEqual(c.steps.map((x) => x.first), Object.values(miss.steps).map((v) => v.present));
  const kr = compareAttempts({ ...s, pack: { steps: [{ key: "ketsuron", label: "결론" }] } }, "q3");
  assert.deepEqual(kr.steps.map((x) => x.label), ["결론"], "pack step labels win");
});

test("statusOf (rail ○/✗/✓): latest reviewed attempt decides; an optional step (復唱) missing still counts as ✓", () => {
  const step = (present) => ({ present, note: "" });
  const ok = { ...reviewFixture, answers_question: "yes", steps: { fukusho: step(false), ketsuron: step(true), kijun: step(true), sentakushi: step(true) } };
  const offTopic = { ...ok, answers_question: "no" };
  const s = { ...session, attempts: [] };
  assert.equal(statusOf(s, "q1"), "todo", "no attempt");
  s.attempts.push({ question_id: "q1", answer: "a", review: null });
  assert.equal(statusOf(s, "q1"), "todo", "script only, no review");
  s.attempts.push({ question_id: "q1", answer: "b", review: reviewFixture });
  assert.equal(statusOf(s, "q1"), "miss", "required steps missing");
  s.attempts.push({ question_id: "q1", answer: "c", review: ok });
  assert.equal(statusOf(s, "q1"), "ok", "all required steps, 復唱 optional");
  s.attempts.push({ question_id: "q1", answer: "d", review: offTopic });
  assert.equal(statusOf(s, "q1"), "miss", "did not answer the question");
  assert.equal(statusOf(s, "q2"), "todo", "per question");
  assert.equal(statusOf({ ...s, pack: { steps: [{ key: "ketsuron", label: "결론" }] }, attempts: [{ question_id: "q1", answer: "e", review: { ...offTopic, answers_question: "yes" } }] }, "q1"), "ok", "pack steps win");
});

// Stage R brief in the export: same document, one more section. Synthetic data only.
const claim = (value, extra = {}) => ({ value, source_ids: ["s1"], confidence: "medium", source_count: 1, single_source: true, ...extra });
const missing = { value: "not_found", source_ids: [], confidence: "unknown", source_count: 0, single_source: false };
const LONG_ID_URL = "https://example.com/jobs/12345678901234";
const brief = {
  research_status: "ok",
  research_date: "2026-11-04",
  company_snapshot: { business: claim("業務システムの提供（架空）"), business_model: missing, size: claim("連絡先 090-1234-5678"), founded: missing, locations: claim("本社は東京（架空）", { single_source: false, source_count: 2, source_ids: ["s1", "s2"], confidence: "high" }) },
  position_analysis: { position_match: "similar" },
  company_checkpoints: [{ question: "残業の実態はどの程度ですか（架空）", ask: "agent", source_ids: ["s1"] }, { question: "[click](https://example.com/x) の進め方は？", ask: "interview", source_ids: [] }],
  sources: [
    { id: "s1", title: "採用情報（架空）", url: LONG_ID_URL, accessed_date: "2026-11-04", published_date: "" },
    { id: "s2", title: "![pixel](https://example.com/p.png) <img src=x>", url: "https://example.com/b", accessed_date: "2026-11-04", published_date: "" },
    { id: "s3", title: "危険なリンク", url: "javascript:alert(1)", accessed_date: "2026-11-04", published_date: "" },
  ],
};
const withBrief = (b, extra = {}) => ({ ...session, ...extra, company_context: { ...session.company_context, research_brief: b } });

test("research export: summary with confidence, position label, checkpoints and sources", () => {
  const r = LANGS.ja.research;
  const md = sessionToMarkdown(withBrief(brief, { research_names: { company: "株式会社サンプルテック（仮）", position: "PM（仮）" } }), LANGS.ja);
  assert.ok(md.includes(`## ${r.title({ company: "株式会社サンプルテック（仮）", position: "PM（仮）" })}`), "headed with the confirmed names");
  assert.ok(md.includes(r.date({ date: "2026-11-04" })));
  assert.ok(md.includes(`- ${r.fields.business}: 業務システムの提供（架空） (${r.confidence.medium}, ${r.singleSource}, s1)`));
  assert.ok(md.includes(`- ${r.fields.locations}: 本社は東京（架空） (${r.confidence.high}, ${r.sources({ n: 2 })}, s1, s2)`));
  assert.ok(md.includes(`- ${r.fields.business_model}: ${r.notFound}`), "not_found is said in words");
  assert.ok(!md.includes("not_found"));
  assert.ok(md.includes(r.match.similar));
  assert.ok(md.split("\n").includes(`- ${r.ask.agent}: 残業の実態はどの程度ですか（架空） (s1)`), "a checkpoint names its source");
  assert.ok(md.split("\n").some((l) => l.startsWith(`- ${r.ask.interview}: `) && l.endsWith("進め方は？")), "and adds nothing without one");
});

test("research export: a source URL survives the mask; contact data in a claim does not", () => {
  const md = sessionToMarkdown(withBrief(brief), LANGS.ko);
  assert.ok(md.includes(LONG_ID_URL), "a long numeric page id is not a phone number");
  assert.ok(!md.includes("090-1234-5678"));
});

test("research export: web text cannot become a link, image or HTML; only http(s) URLs are written", () => {
  const md = sessionToMarkdown(withBrief(brief), LANGS.ko);
  assert.ok(!md.includes("![pixel]("), "image syntax is escaped");
  assert.ok(!/(^|[^\\])<img/m.test(md), "HTML is escaped");
  assert.ok(!md.includes("[click]("), "link syntax is escaped");
  assert.ok(!md.includes("javascript:"));
  assert.ok(md.includes("危険なリンク"), "the source stays listed, without its link");
  const edited = sessionToMarkdown(withBrief({ ...brief, company_snapshot: { business: claim("架空", { source_ids: ["[x](https://example.com/y)"] }) } }), LANGS.ko);
  assert.ok(!edited.includes("[x]("), "a source id edited in storage is inert too");
});

test("research export: a bare URL in web text stays plain text, whatever stored it; the checked source URL stays", () => {
  const bare = "詳細は https://evil.example/a または HTTP://evil.example/b、ftp://evil.example/c、www.evil.example を参照";
  const md = sessionToMarkdown(withBrief({
    ...brief,
    company_snapshot: { business: claim(bare) },
    company_checkpoints: [{ question: bare, ask: "agent", source_ids: ["s1"] }],
    sources: [{ id: "s1", title: bare, url: LONG_ID_URL, accessed_date: "2026-11-04", published_date: "" }],
  }), LANGS.ko);
  assert.ok(!/https?:\/\/evil|ftp:\/\/evil|www\.evil/i.test(md), md);
  assert.ok(md.includes("を参照"), "the sentence around it stays");
  assert.ok(md.includes(LONG_ID_URL));
});

test("research export: an honest empty brief says so; unavailable or absent adds no section", () => {
  const r = LANGS.ko.research;
  const empty = sessionToMarkdown(withBrief({ research_status: "ok", research_date: "2026-11-04", company_snapshot: {}, sources: [] }), LANGS.ko);
  assert.ok(empty.includes(r.empty));
  assert.ok(empty.includes(`- ${r.fields.business}: ${r.notFound}`));
  const plain = sessionToMarkdown(session, LANGS.ko);
  assert.equal(sessionToMarkdown(withBrief({ research_status: "unavailable", research_date: "2026-11-04" }), LANGS.ko), plain);
  assert.ok(!plain.includes(r.snapshot));
});

test("linkable: only http and https become links", async () => {
  const { linkable } = await import("../public/export.js");
  assert.equal(linkable("https://example.com/a"), "https://example.com/a");
  assert.equal(linkable("http://example.com/"), "http://example.com/");
  for (const bad of ["javascript:alert(1)", "data:text/html,x", "vbscript:x", "file:///etc/passwd", "/relative", "", null, undefined, 1, {}]) assert.equal(linkable(bad), null, String(bad));
});

// Interview prep document (PRD-SCRIPT-DOC). Every name and figure is invented.
const HOSTILE = '![x](https://evil.example/a.png) <img src=x onerror=1> [link](javascript:alert(1)) `code`';
const prepItem = (over = {}) => ({ key: "scale", section: "experience_qa", mode: "frame", question: "チームの規模を教えてください。", asked: "規模", neighbor: "成果の話に流れない", order: ["人数", "役割"], answer: "8名のチームで［ここに役割］を担当しました。", reading: "はちめいの ちーむで ［ここに役割］を たんとうしました。", translation: "8명 팀에서 ［ここに役割］를 담당했습니다.", evidence: [{ quote: "8名", verified: true }, { quote: "在庫", verified: false }], followups: ["次の質問（架空）"], blanks: 1, unverified: true, warnings: ["length"], ...over });
const PREP = {
  company: "サンプルテック", position: "PM", created: "2026-11-05", blanks: 5, to_confirm: 1,
  generated: ["intro", "must", "experience", "domain"],
  failed: [{ key: "top_result", section: "experience_qa", bundle: "experience", reason: ["number"] }],
  omitted_questions: ["q7"],
  unresolved: [
    { kind: "blank", section: "header", key: "date", text: "［ここに日時］" },
    { kind: "blank", section: "win_points", key: "win_points", text: "［ここにどう覚えられたいかの1文］" },
    { kind: "blank", section: "self_intro", key: "self_intro", text: "［ここに直近］" },
    { kind: "blank", section: "experience_qa", key: "scale", text: "［ここに役割］" },
    { kind: "evidence_mismatch", section: "experience_qa", key: "scale", text: "8名のチームで［ここに役割］を担当しました。" },
    { kind: "blank", section: "conditions", key: "conditions", text: "［ここに年収を聞かれたときの答え］" },
  ],
  sections: [
    { key: "header", label: "基本情報", rows: [{ key: "company", label: "会社", value: "サンプルテック" }, { key: "date", label: "日時", value: "［ここに日時］" }] },
    { key: "how_to_use", label: "使い方", lines: ["全文を読まない。"] },
    { key: "first_check", label: "最初に確認", lines: ["本日の位置づけを確認する。"] },
    { key: "company_position", label: "会社・ポジション整理", rows: [{ kind: "company", value: "物流向けSaaS（架空）", status: "confirmed", source_ids: ["s1"] }, { kind: "mail", value: "メールの事実（架空）", status: "unconfirmed", source_ids: [] }] },
    { key: "win_points", label: "今日の勝ち筋", lines: ["［ここにどう覚えられたいかの1文］"], filled_by: "browser" },
    { key: "self_intro", label: "自己紹介（90秒）", bundle: "intro", items: [prepItem({ key: "self_intro", section: "self_intro", question: "自己紹介をお願いします。", answer: "直近は［ここに直近］です。", reading: "ちょっきんわ ［ここに直近］です。", translation: "최근에는 ［ここに直近］입니다.", evidence: [], unverified: false, warnings: [] })] },
    { key: "motivation", label: "志望動機（60秒）", bundle: "intro", items: [] },
    { key: "must_ask_qa", label: "必ず聞かれること", bundle: "must", items: [] },
    { key: "experience_qa", label: "経験の深掘り", bundle: "experience", items: [prepItem()] },
    { key: "domain_qa", label: "職種・領域", bundle: "domain", items: [] },
    { key: "conditions", label: "年収・条件", lines: ["［ここに年収を聞かれたときの答え］"], filled_by: "browser" },
    { key: "reverse_questions", label: "逆質問", bundle: "domain", columns: ["質問", "意図"], items: [{ key: "r1", section: "reverse_questions", mode: "draft", question: "評価の基準を伺えますでしょうか。", intent: "평가 기준 확인", reading: "ひょうかの きじゅんを うかがえますでしょうか。", translation: "평가 기준을 여쭤봐도 될까요?", blanks: 0 }] },
    { key: "cautions", label: "注意", lines: ["聞かれたことに答える。"] },
    { key: "unresolved", label: "要本人確認", items: [] },
    { key: "sources", label: "作成の根拠", rows: [{ key: "created", value: "2026-11-05" }, { key: "inputs", value: "material,questions,research" }], sources: [{ id: "s1", title: "会社概要（架空）", url: "https://example.com/about/1234567890123" }, { id: "s9", title: "悪いリンク", url: "javascript:alert(1)" }] },
  ],
};
const DESIRED = { min_salary_man: "600", salary_target_man: "750", max_overtime_hours: "30", employment_required: "seishain", locations: "東京", remote_min_days: "2", exclude_client_site: "1", excluded_roles: "PMO（架空）", hard_conditions: "夜勤なし（架空）", role_content: "業務の希望（架空）" };
const ko = LANGS.ko;
const slots = () => prepSlots({ attempts: [] }, DESIRED, ko, null);

test("prepToMarkdown: sections in the fixed order, Q format, three lines per set, usage, 要本人確認, 作成の根拠", () => {
  const md = prepToMarkdown(PREP, ko, slots());
  const heads = [...md.matchAll(/^## (.+)$/gm)].map((m) => m[1].split(" (")[0]);
  assert.deepEqual(heads, PREP.sections.map((s) => s.label.split(" (")[0]));
  assert.match(md, /^# /);
  assert.ok(md.includes(`## 使い方 (${ko.prep.sections.how_to_use})`), "the native label sits next to the Japanese one");
  assert.ok(md.indexOf(ko.prep.readNote) < md.indexOf("## 基本情報"), "the how-to-read line comes first");
  assert.ok(md.includes("### Q. チームの規模を教えてください。"));
  assert.ok(md.includes("8名のチームで［ここに役割］を担当しました。  \nはちめいの ちーむで ［ここに役割］を たんとうしました。  \n8명 팀에서 ［ここに役割］를 담당했습니다."), "Japanese / reading / meaning, one set");
  assert.ok(md.includes(`- ${ko.prep.asked}: 規模`) && md.includes(`- ${ko.prep.neighbor}: 成果の話に流れない`) && md.includes(`- ${ko.prep.order}: 人数 → 役割`));
  assert.ok(md.includes(`- ${ko.prep.evidence}: 8名, 在庫 (${ko.prep.notInMaterial})`) && md.includes(`- ${ko.prep.followups}: 次の質問（架空）`));
  assert.ok(md.includes(ko.prep.failed({ n: 1 })), "a failed item is not dropped silently (C12)");
  assert.ok(md.includes(ko.prep.omitted({ ids: "Q7" })));
  assert.ok(md.includes(`${ko.prep.sections.experience_qa} — ${ko.prep.unresolvedKinds.evidence_mismatch}`), "要本人確認 lists what to look at");
  assert.ok(md.includes("- s1: 会社概要（架空） — https://example.com/about/1234567890123"), "a source URL is not masked as a phone number");
  assert.ok(!md.includes("javascript:"), "only http(s) stays a link");
  assert.ok(md.includes("評価の基準を伺えますでしょうか。  \nひょうかの きじゅんを うかがえますでしょうか。  \n평가 기준을 여쭤봐도 될까요?"));
});

test("prepToMarkdown: the check-it notice is the first line under the title, and a cited fact links to its page", () => {
  const md = prepToMarkdown(PREP, ko, slots());
  const lines = md.split("\n");
  assert.equal(lines[2], `> ⚠ ${ko.prep.verifyNotice}`);
  assert.match(md, /\[s1\]\(https:\/\/example\.com[^)]*\)/, "the id on the fact is a link");
  const nasty = { ...PREP, sections: PREP.sections.map((s) => (s.key === "company_position" ? { ...s, rows: [{ kind: "company", value: "x", source_ids: ["s1", "gone"] }] } : s.key === "sources" ? { ...s, sources: [{ id: "s1", title: "t", url: "javascript:alert(1)" }] } : s)) };
  const out = prepToMarkdown(nasty, ko, slots());
  assert.ok(!out.includes("](javascript"), "only http(s) becomes a link");
  assert.ok(out.includes("(s1, gone)"), "an id with no usable page stays plain text");
  const page = { ...PREP, sections: PREP.sections.map((s) => (s.key === "sources" ? { ...s, sources: [{ id: "s1", title: "t", url: "https://example.com/a(b)/123456789012" }] } : s.key === "company_position" ? { ...s, rows: [{ kind: "company", value: "x", source_ids: ["s1"] }] } : s)) };
  assert.ok(prepToMarkdown(page, ko, slots()).includes("[s1](https://example.com/a%28b%29/123456789012)"), "a bracket cannot end the link, and a long page id is not masked as a phone number");
});

test("prepToMarkdown: the top count equals the blanks in the document and the 要本人確認 list (C4)", () => {
  const view = prepView(PREP, slots());
  assert.equal(view.blanks, 5);
  assert.equal(view.to_confirm, 1);
  const md = prepToMarkdown(PREP, ko, slots());
  assert.ok(md.includes(ko.prep.counts({ blanks: 5, to_confirm: 1 })));
  const listed = view.sections.find((s) => s.key === "unresolved").items.filter((u) => u.kind === "blank");
  assert.equal(listed.length, 5);
  const typed = prepView(PREP, prepSlots({ prep: PREP, attempts: [] }, { hard_conditions: "［ここに確認］" }, ko, null));
  assert.equal(typed.blanks, 6, "a blank in a line the browser adds is counted too");
  assert.equal(typed.sections.find((s) => s.key === "unresolved").items.filter((u) => u.kind === "blank").length, 6);
});

test("prepToMarkdown: model and web strings cannot become a link, image, HTML or a new block", () => {
  const nasty = `# ${HOSTILE}\n- second line`;
  const doc = { ...PREP, company: nasty, sections: PREP.sections.map((s) => {
    if (s.key === "experience_qa") return { ...s, items: [prepItem({ question: nasty, asked: nasty, neighbor: nasty, order: [nasty], answer: nasty, reading: nasty, translation: nasty, evidence: [{ quote: nasty, verified: true }], followups: [nasty] })] };
    if (s.key === "reverse_questions") return { ...s, items: [{ ...s.items[0], question: nasty, intent: nasty, reading: nasty, translation: nasty }] };
    if (s.key === "company_position") return { ...s, rows: [{ kind: "company", value: nasty, status: "unconfirmed", source_ids: [nasty] }] };
    if (s.key === "header") return { ...s, rows: [{ key: "date", label: nasty, value: nasty }] };
    if (s.key === "sources") return { ...s, sources: [{ id: nasty, title: nasty, url: "https://example.com/" }] };
    return s;
  }), unresolved: [{ kind: "no_evidence", section: "experience_qa", key: "scale", text: nasty }] };
  const md = prepToMarkdown(doc, ko, {});
  assert.ok(!/!\[x\]\(|<img|\[link\]\(|(^|[^\\])`/m.test(md.replace(/\\[[\]<>`]/g, "")) || !/<img/.test(md.replace(/\\</g, "")), "no raw markup");
  assert.ok(!/<img/.test(md.replace(/\\</g, "")));
  assert.ok(!md.includes("https://evil.example"), "no bare link either");
  assert.ok(!/^# (?!.*\\\[)/m.test(md.split("\n").slice(1).join("\n")) , "a model string never opens a heading of its own");
  for (const line of md.split("\n").slice(1)) if (line.includes("second line")) assert.ok(!line.startsWith("- second"), "a line break in a string stays on its line");
});

test("prepToMarkdown masks a phone or mail address in the text and keeps the blanks", () => {
  const doc = { ...PREP, sections: PREP.sections.map((s) => (s.key === "experience_qa" ? { ...s, items: [prepItem({ answer: "連絡は 03(1234)5678 か a@example.com へ。［ここに結果］" })] } : s)) };
  const md = prepToMarkdown(doc, ko, {});
  assert.ok(!md.includes("1234)5678") && !md.includes("a@example.com"));
  assert.ok(md.includes("［ここに結果］"));
});

test("the desired profile: assembled in the browser for this document only, never into the session file (F6)", () => {
  const withProfile = prepToMarkdown(PREP, ko, slots());
  for (const s of ["600", "750", "夜勤なし（架空）", "PMO（架空）", ko.opts.employment.seishain, "東京"]) assert.ok(withProfile.includes(s), s);
  assert.ok(!withProfile.includes("業務の希望（架空）"), "the wanted work is no condition");
  const f6 = sessionToMarkdown({ ...session, prep: PREP }, ko);
  assert.ok(f6.includes("### Q. チームの規模を教えてください。"), "the paid document is not lost when the session is saved");
  assert.ok(!f6.includes("## 年収・条件") && !f6.includes("## 今日の勝ち筋"), "the sections the browser assembles stay out of the session file");
  assert.ok(f6.includes(ko.prep.counts({ blanks: 3, to_confirm: 1 })), "and its count is the count of what it holds");
  assert.equal(sessionToMarkdown(session, ko), sessionToMarkdown({ ...session, prep: undefined }, ko));
});

test("prepSlots: fit matches and habits fill the win section; research off or no profile leaves the blank alone", () => {
  const brief = { research_status: "ok", fit_evaluation: { matches: [{ point: "要件定義の経験（架空）" }], gaps: [{ point: "業界経験（架空）" }] } };
  const attempts = [1, 2].map(() => ({ review: { corrections: [{ rule_id: "r1", pattern: "〜の形" }] } }));
  const out = prepSlots({ attempts }, null, ko, brief);
  assert.deepEqual(out.wins, [`${ko.research.matches}: 要件定義の経験（架空）`, `${ko.research.gaps}: 業界経験（架空）`, `${ko.habits.summary}: 〜の形`]);
  assert.deepEqual(out.conditions, []);
  assert.deepEqual(prepSlots({ attempts: [] }, null, ko, null), { wins: [], conditions: [] });
  const view = prepView(PREP, {});
  assert.deepEqual(view.sections.find((s) => s.key === "win_points").lines, ["［ここにどう覚えられたいかの1文］"]);
});

test("mergePrep: only the regenerated bundle changes; counts follow; a retry that fails keeps the paid item", () => {
  const fresh = prepItem({ answer: "12名のチームで担当しました。", blanks: 0, unverified: false, evidence: [{ quote: "12名", verified: true }] });
  const part = { ...PREP, generated: ["experience"], failed: [], omitted_questions: [], blanks: 2,
    unresolved: [{ kind: "blank", section: "header", key: "date", text: "［ここに日時］" }],
    sections: PREP.sections.map((s) => (s.bundle && s.bundle !== "experience" ? { ...s, items: [] } : s.key === "experience_qa" ? { ...s, items: [fresh, prepItem({ key: "top_result", answer: "成果は［ここに結果］です。", evidence: [], unverified: false })] } : s.key === "header" ? { ...s, rows: [] } : s)) };
  part.unresolved.push({ kind: "blank", section: "experience_qa", key: "top_result", text: "［ここに結果］" });
  const merged = mergePrep(PREP, part);
  const by = (k) => merged.sections.find((s) => s.key === k);
  assert.equal(by("self_intro").items.length, 1, "the other bundles' items stay");
  assert.equal(by("reverse_questions").items.length, 1);
  assert.equal(by("header").rows.length, 2, "the header stays");
  assert.deepEqual(by("experience_qa").items.map((x) => x.key), ["scale", "top_result"]);
  assert.equal(by("experience_qa").items[0].answer, fresh.answer);
  assert.deepEqual(merged.failed, []);
  assert.deepEqual(merged.omitted_questions, ["q7"]);
  assert.deepEqual(merged.generated, PREP.generated);
  const view = prepView(merged, {});
  assert.equal(view.blanks, merged.blanks, "the stored count is the document's");
  assert.equal(view.blanks, 5);
  assert.equal(view.to_confirm, 0);
  assert.ok(!merged.unresolved.some((u) => u.key === "scale"), "what the old item needed is gone with it");

  const worse = { ...part, failed: [{ key: "scale", section: "experience_qa", bundle: "experience", reason: ["number"] }, { key: "top_result", section: "experience_qa", bundle: "experience", reason: ["number"] }], unresolved: [], sections: part.sections.map((s) => (s.key === "experience_qa" ? { ...s, items: [] } : s)) };
  const kept = mergePrep(PREP, worse);
  assert.deepEqual(kept.sections.find((s) => s.key === "experience_qa").items.map((x) => x.key), ["scale"], "a paid item that failed this time stays");
  assert.deepEqual(kept.failed.map((f) => f.key), ["top_result"], "and only what is still missing counts as failed");
  assert.ok(kept.unresolved.some((u) => u.key === "scale"), "with its own open points");

  const noReverse = { ...part, generated: ["domain"], failed: [{ key: "reverse_questions", section: "reverse_questions", bundle: "domain", reason: ["reverse_count"] }], unresolved: [], sections: PREP.sections.map((s) => (s.bundle ? { ...s, items: [] } : s)) };
  const held = mergePrep(PREP, noReverse);
  assert.equal(held.sections.find((s) => s.key === "reverse_questions").items[0].question, "評価の基準を伺えますでしょうか。");
  assert.ok(!held.failed.some((f) => f.key === "reverse_questions"), "the earlier list was complete, so nothing is missing");
  assert.ok(held.failed.some((f) => f.key === "top_result"), "another bundle's failure stays");
});

test("prepFileName keeps the company out of the file name", () => {
  assert.equal(prepFileName(new Date("2026-11-05T01:00:00Z")), "mensetsu-prep-2026-11-05.md");
});
