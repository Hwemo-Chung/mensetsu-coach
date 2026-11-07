#!/usr/bin/env node
// 公開用の伏せ字版: 期間中に Claude Code が作成・実行した本番往復試験（2026-11-07 11:13 JST に本番で実行、結果は prod-summary.md）。
// 公開にあたり、韓国語のコメント・メッセージ・行ラベルをビジネス日本語に翻訳しました。処理の内容は変えていません。
// 本番の往復試験: SCORES.md §1 のサーバー経路を合成データで一巡し、行ごとの pass/fail と元の応答を scores/<label>-<時刻>/ に残す。
// 使い方: BASE_URL=https://… ENV_FILE=…/.env node prod-roundtrip.mjs --access=gated|open [--yes] [--only=access] [--prep=first|none] [--quota=N] [--out=DIR]
//   ENV_FILE の ACCESS_CODE はヘッダーにだけ使い、どこにも書き出さない。--yes がなければ呼び出し計画と予想費用だけを出力する。
//   REPO（既定: このファイルから ../../../../BuiltWithClaude-2026）から packs/jp.json、vercel.json、samples/、lib/ の判定関数を読む（読み取りのみ）。
// アクセスモード（DECISIONS 11/06 17:40）は --access で指定する（必須）。応答から推定しない。
//   gated（OPEN_ACCESS 未設定、11/8 19:00 まで）: コードなし → 401 access_denied が pass。上限の段階はない（--quota 不可）。
//   open（OPEN_ACCESS=1）: コードなし → 1日の上限内で 200、上限超過 → 429 {code:"quota"}、正しいコード → 解除。誤ったコード → 401 access_denied は両モード共通。
//   本番ではコードなしの呼び出しを2回だけ送る（access と review 各1回）。上限超過の再現は localhost の MOCK でのみ行う: サーバーを OPEN_ACCESS=1 DAILY_LIMIT=N で起動し、
//   --access=open --quota=N（review をコードなしで N+1 回送り、「ちょうど N 回 200、N+1 回目が 429 quota」を確かめ、正しいコードで再び 200）。
//   前提 [Medium]: /api/access は上限に数えない（数える場合は 200 が N-1 回になり fail）。--only=access は第1段階だけを実行して終了する。
// 判定: pass | fail | unimplemented（サーバーが未対応）| flag_off（/api/access が無効にした機能）| skipped（前提の失敗）| rate_limited（429）| unmeasured（判定基準なし、呼び出さない）。
//   exit 1 = fail/unimplemented/rate_limited/秘密の漏えい。本番（prod）では flag_off・skipped も失敗として数える。
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const argv = process.argv.slice(2);
const opt = (k, d) => argv.find((a) => a.startsWith(`${k}=`))?.slice(k.length + 1) ?? (argv.includes(k) ? true : d);
const YES = opt("--yes", false), PREP = opt("--prep", "first"), ACCESS = opt("--access"), ONLY = opt("--only"), QUOTA = Number(opt("--quota", 0)), BASE = (opt("--base") || process.env.BASE_URL || "").replace(/\/$/, "");
const REPO = new URL(`${(process.env.REPO || new URL("../../../../BuiltWithClaude-2026", import.meta.url).pathname).replace(/\/$/, "")}/`, "file://");
if (!BASE) { console.error("BASE_URL または --base=URL が必要です"); process.exit(2); }
if (!["gated", "open"].includes(ACCESS)) { console.error("--access=gated|open は必須です（応答からモードを推定しません）"); process.exit(2); }
if (ONLY !== undefined && ONLY !== "access") { console.error("--only=access のみ対応しています"); process.exit(2); }
if (!["first", "all", "none"].includes(PREP)) { console.error("--prep=first|none（残り5段階は否定検査ができるまで unmeasured）"); process.exit(2); }
const label = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(BASE) ? "mock" : "prod";
if (!(Number.isInteger(QUOTA) && QUOTA >= 0)) { console.error("--quota=N（0以上の整数）"); process.exit(2); }
if (QUOTA && label !== "mock") { console.error("--quota は localhost の MOCK でのみ使えます（本番で上限超過を再現しません）"); process.exit(2); }
if (QUOTA && ACCESS !== "open") { console.error("--quota は --access=open でのみ使えます（gated には上限の段階がありません）"); process.exit(2); }

// 秘密: ENV_FILE の値はヘッダーにだけ使う。応答や記録に混ざれば [secret] に置き換えて失敗と数える。キー名で選ぶ（APP_URL のような公開値が BASE と重なると誤検知になるため）。
const ENV_FILE = process.env.ENV_FILE ?? ".env";
process.loadEnvFile(ENV_FILE);
const CODE = process.env.ACCESS_CODE;
if (!CODE) { console.error(`ACCESS_CODE が ${ENV_FILE} にありません`); process.exit(2); }
const envPairs = readFileSync(ENV_FILE, "utf8").split("\n").map((l) => l.replace(/^\s*export\s+/, "")).filter((l) => /^[A-Z0-9_]+=/.test(l)).map((l) => [l.split("=")[0], l.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "")]);
const SECRETS = [...new Set([CODE, ...envPairs.filter(([k, v]) => /KEY|SECRET|TOKEN|CODE|PASS/.test(k) && v.length >= 8).map(([, v]) => v)])];
const KEY_SHAPES = /sk-ant-[A-Za-z0-9_-]{10,}|AIza[0-9A-Za-z_-]{20,}|\bre_[A-Za-z0-9_]{20,}/g;
let leaks = 0;
const scrub = (s) => { let t = String(s); for (const v of SECRETS) { const n = t.split(v).length - 1; if (n) { leaks += n; t = t.split(v).join("[secret]"); } } return t.replace(KEY_SHAPES, () => (leaks++, "[secret]")); };
// 自己検査用のダミー値（実在のキーではありません）
const DUMMY_KEY = ["sk", "ant", "abcdefghijklmnop"].join("-"); // assembled at runtime so the public scan does not flag a key-shaped literal
if (scrub(`a${CODE}b ${DUMMY_KEY}`) !== "a[secret]b [secret]" || leaks !== 2) throw new Error("scrub self-check failed");
leaks = 0;

// リポジトリから読むもの: 規則データとサーバーが使う判定関数（読み取りのみ）。
const repo = (p) => new URL(p, REPO);
const lib = async (p) => import(pathToFileURL(repo(p).pathname).href);
const { loadPack, closingOf } = await lib("lib/pack.js");
const { isJapanese, hasHangul, TARGET_LANGS, EXPLAIN_LANGS } = await lib("lib/lang.js");
const { KINDS } = await lib("lib/verify.js");
const { sectionProblems } = await lib("lib/prep.js");
const { briefFacts } = await lib("public/export.js");
const pack = loadPack("jp"), vercel = JSON.parse(readFileSync(repo("vercel.json"), "utf8"));
const MAIL = readFileSync(repo("samples/agent-mail-sample.txt"), "utf8"), RESUME = readFileSync(repo("samples/resume-sample.txt"), "utf8");
const RULE_IDS = new Set(pack.correction_rules.map((r) => r.id));
const STAGES = ["casual", "first", "second", "executive", "final", "offer"].filter((s) => pack.script_doc?.stages?.[s]); // agent は pack にあるが DECISIONS の6種の外。判定は first のみ
const LIMIT_OF = (route) => vercel.functions[`api/${["fit", "prep", "verify"].includes(route) ? "research" : route}.js`]?.maxDuration ?? null; // rewrite の3経路は research.js の上限

// 合成入力（TEST-CASES.md のケース B・C、samples/）。実在の履歴書・実名なし。
const CASE_B = { question: "前職で最も大変だったことは何ですか？", answer: "はい、前職では新しいシステムの導入を担当しまして、チームのメンバーと協力しながら進めることができました。結果として、業務の効率が上がりまして、評価もいただきました。" };
// ケース C + 新規規則3件を誘発する文（chrome-plan 付録 A-A2 と同じ文）: 弊社・貴社・大丈夫です
const CASE_C = { question: "プロジェクトの進め方を教えてください。", answer: "自分的には、まず現状をちゃんと確認する形で進めまして、なんか問題があれば、その形で対応するという形になります。ちょっと様子を見ながら、ちゃんと進めていく形です。弊社では週次で数字を報告しています。貴社の事業に関心があります。出社は大丈夫です。", expect: ["del-katachi", "del-chanto", "del-nanka", "del-chotto", "rep-jibunteki"], expectNew: ["rep-genshoku", "rep-onsha", "rep-daijoubu"] };
const SCRIPTS = {
  judgment: { closing: "options", category: "マネジメント", question: "見積もりがずれたとき、どのような基準で判断しますか。", answer: "見積もりがずれた場合は、まず影響範囲を確認して、関係者に早めに共有します。前職では遅れの見込みを3か月の時点で報告し、最初のリリースを2機能に絞りました。" },
  self_intro: { closing: "self_intro", category: "経歴・志望動機", question: "自己紹介をお願いします。", answer: "見本と申します。通販サイトの受注・配送システムのバックエンド開発を11年担当し、現在は4名のチームをまとめています。本日はよろしくお願いいたします。" },
  short_fact: { closing: "short_fact", category: "経歴・志望動機", question: "入社可能時期を教えてください。", answer: "現職の引き継ぎがあるため、内定から2か月後に入社できます。時期はご相談できます。" },
};
for (const [k, s] of Object.entries(SCRIPTS)) { const c = closingOf(pack, s); if (c !== s.closing) { console.error(`pack の closing_rules が変わりました: ${k} → ${c}（期待 ${s.closing}）`); process.exit(2); } }

// 予想費用 [Low]: トークン数は 11/03〜06 の実測メモからの概算。prep は CLAUDE.md の「約 $0.3」。Gemini（tts/stt）は無料枠。
const EST = { access: 0, questions: 0.04, research: 0.1, fit: 0.04, review: 0.05, script: 0.03, verify: 0.02, reverse: 0.01, tts: 0, stt: 0, prep: 0.3 };
const NOCODE = ACCESS === "gated" ? [1, "コードなしで1回（401 を期待、モデル呼び出しなし）"] : QUOTA ? [QUOTA + 2, `コードなしで${QUOTA + 1}回 + 解除1回`] : [1, "コードなしで1回"];
const PLAN = (ONLY ? [["access", 3, "コードなし・誤り・正しい"], ["review", ...NOCODE]] : [["access", 3, "コードなし・誤り・正しい"], ["review", 2 + NOCODE[0], NOCODE[1]], ["questions", 5, "ko テキスト・ko 添付・ja・en・kr"], ["research", 1], ["fit", 1], ["script", 3], ["tts", 1], ["stt", 1], ["reverse", 1], ["verify", 5, "Claude 呼び出しは資料ありの2件"], ["prep", PREP === "all" ? 6 : PREP === "first" ? 1 : 0]]);
const usd = PLAN.reduce((a, [r, n]) => a + EST[r] * (r === "verify" ? 2 : r === "review" && ACCESS === "gated" ? n - 1 : n), 0);
console.log(`対象 ${BASE}（${label}）\n呼び出し計画: ${PLAN.map(([r, n, note]) => `${r}×${n}${note ? `(${note})` : ""}`).join(", ")} = ${PLAN.reduce((a, [, n]) => a + n, 0)}回`);
const nPrep = ONLY ? 0 : PLAN.at(-1)[1];
console.log(`アクセスモード ${ACCESS}${ONLY ? ", --only=access" : ""}。予想費用 [Low] 約 $${usd.toFixed(2)}（prep $0.3/件 × ${nPrep}、research は web_search を含む概算）。予想所要時間: 直列で ${ONLY ? 1 : Math.round((60 + 165 + 165 * nPrep) / 60)}分以内（research・prep は各最大165秒）。`);
if (!YES) { console.log("--yes がないため実際の呼び出しは行いません。"); process.exit(0); }

// 記録
const stamp = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "-"); // 秒単位: 同じ分の2回の実行が重ならないように
const OUT = `${(opt("--out") || new URL("../scores", import.meta.url).pathname).replace(/\/$/, "")}/${label}-${stamp}`;
mkdirSync(OUT, { recursive: true });
const rows = [];
let seq = 0;
const save = (name, obj) => { const f = `${OUT}/${String(++seq).padStart(2, "0")}-${name}.json`; writeFileSync(f, scrub(JSON.stringify(obj, null, 1))); return f; };

// 1回の呼び出し: 状態・ヘッダー・本文・所要時間をそのまま記録。x-access-code は記録しない。code:null = ヘッダー自体を送らない（コードを持たない利用者）。
async function call(route, { body, query = "", headers = {}, code = CODE, binary = false } = {}) {
  const url = `${BASE}/api/${route}${query}`, limit = LIMIT_OF(route), t0 = Date.now();
  const init = { method: "POST", headers: { ...(code !== null && { "x-access-code": code }), ...(Buffer.isBuffer(body) ? {} : { "content-type": "application/json" }), ...headers }, body: Buffer.isBuffer(body) ? body : JSON.stringify(body), signal: AbortSignal.timeout(((limit ?? 60) + 15) * 1000) };
  const req = { method: "POST", url, headers: { ...init.headers, ...(code !== null && { "x-access-code": code === CODE ? "[header set from ENV_FILE]" : "[wrong code]" }) }, body: Buffer.isBuffer(body) ? `<${body.length} bytes>` : body };
  try {
    const res = await fetch(url, init), ms = Date.now() - t0;
    const bytes = Buffer.from(await res.arrayBuffer());
    let data = null;
    if (!binary || !res.ok) { try { data = JSON.parse(bytes.toString("utf8")); } catch { data = bytes.toString("utf8").slice(0, 2000); } }
    return { req, status: res.status, headers: Object.fromEntries(res.headers), data, bytes, ms, limit, over_limit: limit != null && ms > limit * 1000 };
  } catch (e) {
    return { req, status: 0, headers: {}, data: { error: e?.name, message: e?.message }, bytes: Buffer.alloc(0), ms: Date.now() - t0, limit, over_limit: false };
  }
}
const brief_ = (r) => r && { status: r.status, headers: r.headers, body: r.data ?? `<${r.bytes.length} bytes>` };

// 1行: checks を集めて verdict を決め、ファイルに残す。hard の失敗が1つでもあれば fail。verdict を渡せばそのまま使う（flag_off など）。extra はファイルにだけ付け加える。
function record(row, name, r, checks = [], { verdict, note, extra } = {}) {
  const failed = checks.filter((c) => !c.ok && c.hard !== false);
  const v = verdict ?? (r?.status === 429 ? "rate_limited" : failed.length ? "fail" : "pass");
  const file = save(name, { row, name, verdict: v, note, request: r?.req, response: brief_(r), elapsed_ms: r?.ms, limit_s: r?.limit, over_limit: r?.over_limit, checks, ...extra });
  const why = note ?? (v === "rate_limited" ? (r?.data?.code === "quota" ? "429 quota: 1日の上限を超過した状態（本番のカウンターを確認）" : "429: 経路ごとの IP 上限（10分の枠）— 同じ IP の先行する呼び出しが残っている") : failed.length ? `✗ ${failed.map((c) => c.name).join(", ")}` : "");
  rows.push({ row, name, verdict: v, status: r?.status, ms: r?.ms, limit: r?.limit, file, note: why });
  console.log(`${v.padEnd(13)} ${name.padEnd(18)} ${r ? `${r.status} ${r.ms}ms${r.limit ? `/${r.limit}s` : ""}` : ""} ${why}`);
  return v === "pass";
}
const ck = (name, ok, hard = true) => ({ name, ok: !!ok, hard });
const base = (r, limit = true) => [ck("http 200", r.status === 200), ...(limit ? [ck("関数の時間上限内", !r.over_limit)] : [])];
const skip = (row, name, note) => record(row, name, null, [], { verdict: "skipped", note });
const off = (row, name, flag) => record(row, name, null, [], { verdict: "flag_off", note: `/api/access が ${flag}=false と応答（本番の環境変数）` });
const LANG = "ko", PACK = "jp";
const F11 = "F11 アクセスコード、誤ったコードの拒否", OPEN_200 = "公開モード: コードなしで 200", OPEN_UNLOCK = "公開モード: コード入力で解除";
const denied = (r) => [ck("http 401", r.status === 401), ck("code access_denied", r.data?.code === "access_denied")];

// 1. アクセス: 誤ったコードは 401、正しいコードは 200 + 機能フラグ。コードなしは gated → 401 access_denied、open → 200（上限内）。
const nc = await call("access", { body: {}, code: null });
if (ACCESS === "gated") record(F11, "access-nocode", nc, denied(nc), { note: nc.status === 401 ? "gated: コードなしを拒否" : undefined });
else record(OPEN_200, "access-nocode", nc, [...base(nc), ck("ok:true", nc.data?.ok === true)]);
const wrong = await call("access", { body: {}, code: `wrong-${Math.random().toString(36).slice(2)}` });
record(F11, "access-wrong", wrong, denied(wrong));
const acc = await call("access", { body: {} });
const flags = acc.data ?? {};
record(F11, "access-right", acc, [...base(acc), ck("ok:true", flags.ok === true), ...["stt", "research", "prep", "mail"].map((k) => ck(`フラグ ${k} は boolean`, typeof flags[k] === "boolean"))]);
if (acc.status !== 200) { console.log("アクセスコードが通らなかったため中断"); finish(); }

// 1b. コードなしの AI 経路。gated: 401 access_denied（モデル呼び出し前に拒否）。open: 本番は1回 200。MOCK --quota=N: ちょうど N 回 200、N+1 回目が 429 quota、その後正しいコードで 200。
const rvChecks = (r) => [...base(r), ck("answers_question enum", ["yes", "no", "unclear"].includes(r.data?.answers_question)), ck("steps 4段階の present が boolean", ["fukusho", "ketsuron", "kijun", "sentakushi"].every((k) => typeof r.data?.steps?.[k]?.present === "boolean")), ck("rule_id はすべて規則 DB 内", (r.data?.corrections ?? []).every((c) => RULE_IDS.has(c.rule_id))), ck("dropped は数値", typeof r.data?.dropped === "number")];
const REVIEW_B = { ...CASE_B, lang: LANG, pack: PACK, category: "経歴・志望動機" };
if (ACCESS === "gated") { const r = await call("review", { body: REVIEW_B, code: null }); record(F11, "review-nocode", r, denied(r)); }
else if (!QUOTA) { const r = await call("review", { body: REVIEW_B, code: null }); record(OPEN_200, "review-nocode", r, rvChecks(r)); }
else {
  const series = [];
  for (let i = 0; i <= QUOTA; i++) { const r = await call("review", { body: REVIEW_B, code: null }); series.push(r); if (i < QUOTA && r.status !== 200) break; }
  const last = series.at(-1), okN = series.slice(0, QUOTA).filter((r) => r.status === 200).length, statuses = series.map((r) => `${r.status}${r.data?.code ? `/${r.data.code}` : ""}`).join(",");
  const checks = [ck(`コードなしの最初の${QUOTA}回がすべて 200（${okN}）`, okN === QUOTA), ck(`${QUOTA + 1}回目が 429`, series.length === QUOTA + 1 && last.status === 429), ck("code quota", series.length === QUOTA + 1 && last.data?.code === "quota")];
  // ここでは 429 が期待する結果のため、record の自動 rate_limited 判定を使わない
  record(OPEN_200, "quota-nocode", last, checks, { verdict: checks.every((c) => c.ok) ? "pass" : "fail", note: `応答の順序: ${statuses}`, extra: { series: series.map((r) => ({ status: r.status, code: r.data?.code ?? null, ms: r.ms })) } });
  const un = await call("review", { body: REVIEW_B });
  record(OPEN_UNLOCK, "quota-unlock", un, [...rvChecks(un), ck("正しいコードは上限の後も 200", un.status === 200)]);
}
if (ONLY === "access") finish();

// 2. 質問10問（テキスト、および TXT 添付）
// 言語判定はサーバーと同じ関数（lib/lang.js）。面接の言語 = pack の target、question_tr = 画面の言語（同じなら付かない、2軸の規則）。
const qChecks = (r, p = pack, lang = LANG) => {
  const qs = r.data?.questions, t = p.question_taxonomy, cats = [...t.categories, ...(t.optional_categories ?? [])], target = p.language_pair.target;
  return [...base(r), ck("questions 10問", qs?.length === 10), ck("id q1..q10", qs?.every((q, i) => q.id === `q${i + 1}`)), ck("stage enum", qs?.every((q) => t.stages.includes(q.stage))), ck("category enum", qs?.every((q) => cats.includes(q.category))), ck(`question ${target}`, qs?.every((q) => TARGET_LANGS[target].is(q.question))),
    target === lang ? ck("question_tr なし（2軸の規則）", qs?.every((q) => q.question_tr == null), false) : ck(`question_tr ${lang}`, qs?.every((q) => EXPLAIN_LANGS[lang].isText(q.question_tr, target))),
    ck("company_context", typeof r.data?.company_context?.company === "string" && Array.isArray(r.data?.company_context?.facts)), ck("specificity.passed", r.data?.specificity?.passed === true, false), ck("pack.steps", Array.isArray(r.data?.pack?.steps))];
};
const q1 = await call("questions", { body: { mail: MAIL, lang: LANG, pack: PACK } });
record("F1 テキスト入力 / F2 質問10問、段階・分類", "questions-text", q1, qChecks(q1));
const q2 = await call("questions", { body: { mail: MAIL, lang: LANG, pack: PACK, attachment: { name: "resume-sample.txt", type: "text/plain", data: Buffer.from(RESUME).toString("base64") } } });
record("F1 添付（TXT のみ。PDF・DOCX・画像は Chrome の欄）", "questions-attach", q2, qChecks(q2));
for (const [pk, lang, row] of [["jp", "ja", "F12 画面の言語 ko, en, ja"], ["jp", "en", "F12 画面の言語 ko, en, ja"], ["kr", "ja", "F14 kr ベータ"]]) {
  const r = await call("questions", { body: { mail: MAIL, lang, pack: pk } });
  record(row, `questions-${pk}-${lang}`, r, qChecks(r, pk === PACK ? pack : loadPack(pk), lang));
}
const Q = q1.status === 200 ? q1.data : q2.status === 200 ? q2.data : null;
const ctx = Q?.company_context ?? { company: "株式会社サンプルロジ（仮）", position: "エンジニアリングマネージャー", facts: [] };

// 3. 調査 → 適合
let brief = null;
if (!flags.research) { off("調査", "research", "research"); off("適合・不一致、希望プロフィール", "fit", "research"); }
else {
  const rs = await call("research", { body: { company: ctx.company, position: ctx.position, lang: LANG, pack: PACK } });
  const ok = rs.data?.research_status === "ok";
  record("調査", "research", rs, [...base(rs), ck("research_status ok", ok), ck("sources は配列", Array.isArray(rs.data?.sources)), ck("company_snapshot", !!rs.data?.company_snapshot)], { note: rs.data?.research_status && !ok ? `research_status=${rs.data.research_status}` : undefined });
  brief = ok ? rs.data : null;
  if (!brief) skip("適合・不一致、希望プロフィール", "fit", "調査が ok でないため呼び出さない");
  else {
    const fit = await call("fit", { body: { brief, mail: MAIL, profile: "通販サイトのバックエンド開発11年、チームリード5年（架空）", lang: LANG, pack: PACK } });
    const fe = fit.data?.fit_evaluation;
    record("適合・不一致、希望プロフィール", "fit", fit, [...base(fit), ck("fit_evaluation.matches/gaps は配列", Array.isArray(fe?.matches) && Array.isArray(fe?.gaps)), ck("mismatch_flags は配列", Array.isArray(fit.data?.mismatch_flags)), ck("company_checkpoints は配列", Array.isArray(fit.data?.company_checkpoints))]);
  }
}

// 4. 確認: F3（ずれた答え）、F4（口ぐせの規則）。MOCK は固定の fixture のため、ケース C の規則は当たらない（本番でのみ意味がある）。
const rb = await call("review", { body: REVIEW_B });
record("F3 構成の判定 / F15 ①②③", "review-offtarget", rb, [...rvChecks(rb), ck("answers_question=no（ケース B）", rb.data?.answers_question === "no")]);
const rc = await call("review", { body: { question: CASE_C.question, answer: CASE_C.answer, lang: LANG, pack: PACK, category: "マネジメント" } });
const hit = new Set((rc.data?.corrections ?? []).map((c) => c.rule_id));
record("F4 添削、新規規則3件", "review-fillers", rc, [...rvChecks(rc), ck("添削1件以上（ケース C）", hit.size >= 1), ck(`ケース C の期待規則5件すべて: ${CASE_C.expect.filter((id) => hit.has(id)).join(",") || "なし"}`, CASE_C.expect.every((id) => hit.has(id)), false), ck(`新規規則3件（弊社・貴社・大丈夫です）: ${CASE_C.expectNew.filter((id) => hit.has(id)).join(",") || "なし"}`, CASE_C.expectNew.every((id) => hit.has(id)), false)], { note: rc.status === 200 ? `規則 ${[...hit].join(",") || "なし"}（新規3件は f4/f4neg の有料評価で確認）` : undefined });

// 5. 模範スクリプト3種: 復唱・締めの規則と照合（復唱は判断の質問にだけ推奨、自己紹介・事実の質問にはないこと）
const S = {};
for (const [k, s] of Object.entries(SCRIPTS)) {
  const r = await call("script", { body: { question: s.question, answer: s.answer, category: s.category, lang: LANG, pack: PACK } });
  const d = r.data ?? {}, parts = d.parts ?? {}, issues = d.issues ?? [], cl = pack.answer_structure.closings[s.closing], skipSteps = cl.skip ?? [];
  const chars = String(d.text ?? "").normalize("NFKC").replace(/\s/g, "").length;
  const checks = [...base(r), ck("text は日本語", isJapanese(d.text)), ck(`closing=${s.closing}`, d.closing === s.closing), ck("parts 4段階", ["fukusho", "ketsuron", "kijun", "sentakushi"].every((x) => typeof parts[x] === "string")),
    ...skipSteps.map((st) => ck(`${st} は空（${s.closing} の規則）`, (parts[st] ?? "") === "")),
    ...(cl.must ? [ck(`締めの must /${cl.must}/`, new RegExp(cl.must).test((parts.sentakushi ?? "").trim())), ck("issues に closing なし", !issues.includes("closing"))] : []),
    ...(s.closing === "options" ? [ck("復唱「…ですね。」（推奨）", /ですね。$/.test((parts.fukusho ?? "").trim()), false)] : []),
    ...(cl.chars ? [ck(`文字数 ${cl.chars.join("–")}（${chars}）`, chars >= cl.chars[0] && chars <= cl.chars[1], false)] : []),
    ck("reading・translation・points", typeof d.reading === "string" && typeof d.translation === "string" && Array.isArray(d.points)), ck("ttsSig 32文字", typeof d.ttsSig === "string" && d.ttsSig.length === 32), ck(`issues（ソフト）: ${issues.join(",") || "なし"}`, true, false)];
  record("F5 模範スクリプト、事実の質問の締め、自己紹介", `script-${k}`, r, checks);
  if (r.status === 200) S[k] = d; // 規則違反があっても TTS・検証の入力には使う
}

// 6. 🔊 読み上げ → 音読の確認（同じ音声を WAV に包んで /api/stt?kana=1 へ）
let pcm = null, rate = 24000;
if (!S.judgment?.ttsSig) skip("🔊 読み上げ", "tts", "スクリプトがないため呼び出さない");
else {
  const r = await call("tts", { body: { text: S.judgment.text, sig: S.judgment.ttsSig, voice: "Kore", pack: PACK }, binary: true });
  rate = Number(r.headers["x-sample-rate"]) || 24000;
  const ok = record("🔊 読み上げ", "tts", r, [...base(r), ck("content-type audio/L16", String(r.headers["content-type"]).startsWith("audio/L16")), ck("x-sample-rate", !!r.headers["x-sample-rate"]), ck("音声のバイト数 > 0", r.bytes.length > 0)], { note: r.status === 200 ? `${r.bytes.length} bytes ≈ ${(r.bytes.length / rate / 2).toFixed(1)}秒 → ${OUT}/tts.wav` : undefined });
  if (ok) { pcm = r.bytes; writeFileSync(`${OUT}/tts.wav`, wav(pcm, rate)); }
}
if (!flags.stt) off("音読の確認", "stt", "stt");
else if (!pcm) skip("音読の確認", "stt", "TTS の音声がないため呼び出さない");
else {
  const cut = pcm.subarray(0, 60 * rate * 2); // 4 MB のリクエスト上限内: 先頭60秒のみ
  const r = await call("stt", { body: wav(cut, rate), query: `?pack=${PACK}&lang=${LANG}&kana=1`, headers: { "content-type": "audio/wav" } });
  record("音読の確認", "stt", r, [...base(r), ck("text は文字列", typeof r.data?.text === "string"), ck("kana は文字列", typeof r.data?.kana === "string"), ck("quality", typeof r.data?.quality === "string")], { note: r.status === 200 ? `quality=${r.data.quality}${r.data.verbatim === false ? " verbatim=false" : ""}` : undefined });
}

// 7. 逆質問（SCORES: 4〜8問を準備）。現在のコードはちょうど3問 → unimplemented として区別
{
  const r = await call("reverse", { body: { context: { company: ctx.company, position: ctx.position, facts: ctx.facts }, lang: LANG, pack: PACK } });
  const qs = r.data?.questions ?? [], n = qs.length;
  record("F10 逆質問（4〜8問を準備、2〜3問を選ぶ案内）", "reverse", r, [...base(r), ck(`数は3（${n}）— /api/reverse は設計上3問、4〜8問は準備資料の節`, n === 3), ck("各質問が日本語・60文字以下", qs.every((q) => isJapanese(q.question) && q.question.length <= 60)), ck("intent は韓国語（画面の言語 ko）", qs.every((q) => hasHangul(q.intent)))]);
}

// 8. 台本を検証 ④⑤: 資料なし・あり、自己紹介90秒、条件の質問は評価なし
const vChecks = (r) => [...base(r), ck("chars は数値", typeof r.data?.chars === "number"), ck("unsupported は配列", Array.isArray(r.data?.unsupported)), ck("blanks は数値", typeof r.data?.blanks === "number")];
const jText = S.judgment?.text ?? SCRIPTS.judgment.answer, jQ = SCRIPTS.judgment;
const v1 = await call("verify", { body: { script: jText, question: jQ.question, category: jQ.category, pack: PACK } });
record("F15 ④ 時間", "verify-nomaterial", v1, [...vChecks(v1), ck("checked=false（資料なし）", v1.data?.checked === false), ck("target_seconds=60", v1.data?.target_seconds === 60), ck("seconds [速い, 遅い]", Array.isArray(v1.data?.seconds))]);
// スクリプトの自動の事実確認: app.js checkScript と同じ本文（material = 判断の質問の回答）。checked=true でなければ画面は「確認できません」
if (!S.judgment) skip("スクリプトの自動の事実確認", "verify-auto", "判断の質問のスクリプトがないため呼び出さない");
else {
  const va = await call("verify", { body: { script: S.judgment.text, question: jQ.question, category: jQ.category, facts: ctx.facts, material: jQ.answer, pack: PACK } });
  record("スクリプトの自動の事実確認", "verify-auto", va, [...vChecks(va), ck("checked=true（material=回答）", va.data?.checked === true), ck("kind enum", (va.data?.unsupported ?? []).every((u) => KINDS.includes(u.kind)))], { note: va.data?.failed ? `failed=${va.data.failed}` : va.status === 200 ? `unsupported ${va.data.unsupported?.length}件` : undefined });
}
const v2 = await call("verify", { body: { script: jText, question: jQ.question, category: jQ.category, material: RESUME, facts: ctx.facts, pack: PACK } });
record("F15 ⑤ 根拠のない文", "verify-material", v2, [...vChecks(v2), ck("checked=true（資料あり）", v2.data?.checked === true), ck("kind enum", (v2.data?.unsupported ?? []).every((u) => KINDS.includes(u.kind))), ck("dropped は数値", typeof v2.data?.dropped === "number")], { note: v2.data?.failed ? `failed=${v2.data.failed}` : v2.status === 200 ? `unsupported ${v2.data.unsupported.length}件` : undefined });
const v3 = await call("verify", { body: { script: S.self_intro?.text ?? SCRIPTS.self_intro.answer, question: SCRIPTS.self_intro.question, category: SCRIPTS.self_intro.category, pack: PACK } });
record("F15 ④ 時間（自己紹介90秒）", "verify-selfintro", v3, [...vChecks(v3), ck("target_seconds=90", v3.data?.target_seconds === 90)]);
const v4 = await call("verify", { body: { script: S.short_fact?.text ?? SCRIPTS.short_fact.answer, question: SCRIPTS.short_fact.question, category: SCRIPTS.short_fact.category, pack: PACK } });
record("F15 ④ 時間（条件の質問は評価なし）", "verify-shortfact", v4, [...vChecks(v4), ck("target_seconds=null", v4.data?.target_seconds === null), ck("over=false", v4.data?.over === false)]);

// 9. 準備資料: first のみ判定。残り5段階は、段階外の節がないこと・casual の drop_categories のような否定検査ができるまで unmeasured（呼び出さない）。
const STAGE_JA = { casual: "カジュアル", first: "1次", second: "2次", executive: "役員", final: "最終", offer: "内定・条件" };
if (PREP === "first" || PREP === "all") {
  const row = `準備資料: ${STAGE_JA.first}`;
  if (!flags.prep) off(row, "prep-first", "prep");
  else if (!Q) skip(row, "prep-first", "質問がないため呼び出さない");
  else {
    const facts = brief ? briefFacts(brief) : [];
    const r = await call("prep", { body: { material: RESUME, questions: Q.questions.map(({ id, question, category, basis_type }) => ({ id, question, category, ...(basis_type === "research" && { basis_type }) })), context: { company: ctx.company, position: ctx.position, facts: ctx.facts }, ...(facts.length && { research_facts: facts, sources: brief.sources }), header: { date: "2026-11-20 10:00", format: "オンライン", counterpart: "開発部長" }, inputs: { axis: "自社の製品を長く育てられる環境", start_date: "内定から2か月後" }, lang: LANG, pack: PACK, stage: "first" } });
    const d = r.data ?? {};
    let problems;
    try { problems = r.status === 200 && Array.isArray(d.sections) ? sectionProblems(d, pack, "first") : ["no sections"]; } catch (e) { problems = [`sectionProblems threw: ${e.message}`]; }
    record(row, "prep-first", r, [...base(r), ck("sections は配列", Array.isArray(d.sections)), ck(`段階の必須の節・順序・空欄の数（sectionProblems: ${problems.join(",") || "なし"}）`, !problems.length), ck("failed なし", Array.isArray(d.failed) && !d.failed.length), ck("blanks は数値", typeof d.blanks === "number"), ck("stage=first が応答に返る", d.stage === "first")]);
  }
  // --prep=all (11/07): each stage once; the negative check is that no section outside the stage's required list comes back.
  for (const st of STAGES.filter((s) => s !== "first")) {
    if (PREP !== "all" || !flags.prep || !Q) { record(`準備資料: ${STAGE_JA[st]}`, `prep-${st}`, null, [], { verdict: "unmeasured", note: "--prep=all のときだけ呼び出す" }); continue; }
    const r = await call("prep", { body: { material: RESUME, questions: Q.questions.map(({ id, question, category }) => ({ id, question, category })), context: { company: ctx.company, position: ctx.position, facts: ctx.facts }, header: { date: "2026-11-20 10:00", format: "オンライン", counterpart: "開発部長" }, inputs: { axis: "自社の製品を長く育てられる環境", start_date: "内定から2か月後" }, stage: st, lang: LANG, pack: PACK } });
    const d = r.data ?? {}, required = pack.script_doc.stages[st].required;
    let problems; try { problems = r.status === 200 && Array.isArray(d.sections) ? sectionProblems(d, pack, st) : ["no sections"]; } catch (e) { problems = [`threw: ${e.message}`]; }
    const outside = Array.isArray(d.sections) ? d.sections.map((x) => x.key).filter((k) => !required.includes(k)) : ["?"];
    record(`準備資料: ${STAGE_JA[st]}`, `prep-${st}`, r, [...base(r), ck(`stage=${st}`, d.stage === st), ck(`必須の節（${problems.join(",") || "なし"}）`, !problems.length), ck(`段階外の節なし（${outside.join(",") || "なし"}）`, !outside.length), ck("failed なし", Array.isArray(d.failed) && !d.failed.length)]);
  }
}
finish();

// WAV: PCM s16le モノラルの前に44バイトのヘッダー
function wav(p, rate) {
  const h = Buffer.alloc(44); h.write("RIFF", 0); h.writeUInt32LE(36 + p.length, 4); h.write("WAVE", 8); h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(p.length, 40);
  return Buffer.concat([h, p]);
}

function finish() {
  const bad = rows.filter((r) => ["fail", "unimplemented", "rate_limited", ...(label === "prod" ? ["flag_off", "skipped"] : [])].includes(r.verdict)), unmeasured = rows.filter((r) => r.verdict === "unmeasured").length;
  const md = [`# 本番の往復試験 ${label} ${stamp} — ${BASE}`, "", `access=${ACCESS}${ONLY ? ", only=access" : ""}, prep=${PREP}, quota=${QUOTA}, lang=${LANG}, pack=${PACK}。判定: pass/fail/unimplemented/flag_off/skipped/rate_limited/unmeasured${label === "prod" ? "（prod: flag_off・skipped も失敗）" : ""}。SCORES.md の欄には \`合格 <ファイル>\` / \`不合格 <ファイル>\` として転記する。`, "", "| SCORES の行 | 呼び出し | 判定 | HTTP | 所要/上限 | 備考 | 元データ |", "|---|---|---|---|---|---|---|",
    ...rows.map((r) => `| ${r.row} | ${r.name} | ${r.verdict} | ${r.status ?? ""} | ${r.ms != null ? `${r.ms}ms${r.limit ? `/${r.limit}s` : ""}` : ""} | ${r.note ?? ""} | ${r.file} |`),
    "", `秘密の値のスキャン: ${leaks ? `漏えい ${leaks}件 → [secret] に置換、失敗` : "なし"}`, `失敗・未実装・429${label === "prod" ? "・flag_off・skipped" : ""}: ${bad.length}件、未測定 ${unmeasured}件`].join("\n");
  writeFileSync(`${OUT}/summary.md`, scrub(md));
  writeFileSync(`${OUT}/summary.json`, scrub(JSON.stringify({ base: BASE, label, stamp, access: ACCESS, only: ONLY ?? null, prep: PREP, quota: QUOTA, flags, rows, leaks }, null, 1)));
  console.log(`\n${bad.length ? `失敗 ${bad.length}件: ${bad.map((r) => `${r.name}(${r.verdict})`).join(", ")}` : `失敗なし${label === "prod" ? "" : "（mock: flag_off・skipped は失敗として数えない）"}`}${unmeasured ? ` / 未測定 ${unmeasured}件` : ""}${leaks ? ` / 秘密の値の漏えい ${leaks}件` : ""}`);
  console.log(`SCORES.md の本番欄のパス: ${OUT}/summary.md`);
  process.exit(bad.length || leaks ? 1 : 0);
}
