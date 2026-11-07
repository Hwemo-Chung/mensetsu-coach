# CONSISTENCY-PLAN — 模範スクリプトの一貫性を強制する設計（コード変更案・オフラインテスト・実呼び出し評価仕様）

作成 2026-11-03。依頼: 「模範スクリプトのコーチング根拠データをさらに蓄積すること。一貫性のある回答が何よりも優先。」
入力: `EVIDENCE-V3.md`（§5 強制方式の草案）、`jp-draft-v3.json`（answer_templates・consistency 草案）、`lib/script.js`・`lib/review.js`・`lib/questions.js`・`lib/claude.js`。
この文書は設計のみを扱います。リポジトリのコードと `packs/` は修正しておらず、実呼び出しは0回です。コード片は提案であり、行数はおおよその見積もりです。

> **実装状況（11/03 10時）**: PR-1 = C1（段階の例文注入、パックの「3つ」→「三つ」）・C2（truncated 1回リトライ）・C6（reviewの小文字正規化・回答順ソート）を実装し、オフラインテスト T1・T2・T3・T15 を通過。C4は質問タイプ別の締め（PRD §16-15）として先行導入しました（`lib/pack.js` `closingOf`、テンプレート全体のマージではない）。C3・C5も11/03 12時に実装しました。C3: スキーマの対象言語キー配下に段階別の文字列（必須・順序固定）を置き、コードがパックの順序でつなぎ、結果に `parts` を残します。C5: `scriptIssues`（パック `consistency` + `closings.*.must`）。文の数、文末 です・ます、復唱「ですね。」、締めの形、空欄「［ここに〜］」最大3個、長さ150–330文字を検査し、既存の2回の予算内でソフトリトライします（同点なら最初の結果、違反はエラーではなく `issues` として返す）。設計と異なる点: ① テンプレート（answer_templates）のマージなしで締めのタイプ（closingOf）のみ使用 ② 長さは `estimateSeconds`(public)の代わりに文字数（PRDの単位、lib→publicのimportを回避） ③ 長さの帯域はベースライン実測（172–250文字）に合わせて[150, 330]、プロンプトの目標は200–300文字 ④ 復唱の形は「、ですね。」ではなく「ですね。」で終わるかのみ検査。実呼び出し3件（11/03 13時）: 応答3/3正常、復唱「、ですね。」3/3（ベースライン 0/15）、締めのタイプ3/3。2/3が長さの下限（150文字）に引っかかってリトライしましたが、どちらも短いままでした（短い回答 → 捏造禁止により短いスクリプト） → 長さ単独の違反はリトライしないよう変更。残り: 再測定。ベースライン（`consistency-baseline-2026-11-03.json`）は締めのルール変更前の測定のため、再測定と直接比較できません。

## 0. 結論 — 行あたりの一貫性利得ランキング

| 順位 | id | 何を | どこ | コード行数（見積もり） | 期待される利得 | 信頼度 |
|---|---|---|---|---|---|---|
| 1 | C1 段階の例文注入 | scriptプロンプトの4文型の各行に `例: 「…」` を付けます。現在は質問生成プロンプトにのみ例文があります。| `lib/script.js` 1行 | 1 | 復唱の形（「〜、ですね。」）の準拠 0/3 を引き上げ | [High] 原因（コード） / [Medium] 効果（未測定） |
| 2 | C2 truncated リトライ | `askJson` の `truncated` エラーを2回の予算内の失敗回として扱います。| `lib/script.js` | 3 | 同じ入力がときどき502で終わる現象の除去 | [High] |
| 3 | C4 質問タイプのルーティング + タイプ別例文1つ | コードが質問文からテンプレートを決めます（パックの `match` 正規表現、なければ判断・状況）。そのテンプレートの骨格・例文・NGのみをuserメッセージに入れます。| `lib/script.js` + パックデータ | 10 | 同じ質問には常に同じ締めの形と同じ例文。テンプレート選択の揺れ0 | [Medium] |
| 4 | C3 段階別フィールドのスキーマ | 模範スクリプトの文字列1つを `ja: { fukusho, ketsuron, kijun, sentakushi }` オブジェクトに変え、コードがパックの順序でつなぎます。| `lib/script.js` + fixture | 8 (+fixture) | 段階の欠落・順序の入れ替わりがスキーマ上不可能になる。段階別のゲートが可能になる | [Medium] |
| 5 | C5 決定的ソフトゲート + 2回のうち良い方 | 文末の閉じた語彙、復唱の形、テンプレート別の締め、段階別の文の数、空欄のラベル・個数、長さ（秒）を検査します。違反すれば1回作り直し、両方違反すれば違反の少ない方を `issues` とともに返します（失敗として扱わない）。| `lib/script.js` | 25 | 長さの変動係数、文の数の揺れ、文末の逸脱の減少 | [Medium] / 閾値 [Low] |
| 6 | C6 review enumの正規化・ソート | `rule_id`・`answers_question` を小文字にそろえ、correctionsを回答内の位置順にソートします。| `lib/review.js` | 2 | 表示順が毎回同じになる。大文字小文字の揺れによる脱落を防止 | [High] 根拠 / 発生頻度 未確認 |
| 7 | C7 effort `low` | scriptリクエストのeffortを `medium` から `low` に変えるA/B実験です。| `lib/script.js` 1トークン | 0（評価前は変更なし） | 文書上「決定性が目的なら low + より緻密なプロンプト」 | [Medium] |

行わないこと（理由は§1.1）: temperature・top_p・top_k(400)、assistant prefill(400)、スキーマの `minLength`・`maxLength`・`maxItems`(400)、`points` ちょうど3つ（UIの一貫性にのみ影響、今回の範囲外）、`session_axis`（セッションストレージが必要）、`model_answer_exclusions` プロンプト行（一貫性ではなく公正な採用選考に関わる案件のため別PR）、prompt caching（コスト項目、一貫性とは無関係）。

推奨の組み合わせ: **PR-1 = C1 + C2 + C6**（パック変更なし、6行）。**PR-2 = C3 + C4 + C5**（パックへの `answer_templates`・`consistency` マージの承認が必要）。C7はPR-2の評価B′レッグとしてのみ回します。

## 1. 確認した事実

### 1.1 API制約（Anthropic文書、claude-apiスキルキャッシュ 2026-10-06 + structured-outputs文書を直接確認 2026-11-03）

| 項目 | Sonnet 5.5 (script・questions) | Opus 5.5 (review) | 信頼度 |
|---|---|---|---|
| temperature / top_p / top_k | デフォルト以外の値は400。APIバージョン `2026-10-21` 以降はすべてのモデルで400 | 削除済み、400 | [High] |
| assistant prefill | 400 | 400 | [High] |
| effortの段階 | low / medium / high / xhigh / max。**デフォルト high**（Sonnet 5比で再調整） | 同じ5段階。**デフォルト medium** | [High] |
| 現在のコード | script・questionsともに `effort: "medium"` を明示 | review `medium` を明示（=デフォルト） | [High] コード |
| 決定性の推奨 | 移行ガイド: 「目的が決定性なら `effort: "low"` とより緻密なプロンプト」。Sonnet 5.5の出発点の推奨も「コンテンツ生成はlow」 | — | [Medium]（Opus 4.7の節の一般的な推奨を適用） |
| JSON Schema | `enum`・`const`・`required`・`additionalProperties:false` をサポート。`minItems` は0・1のみ。`minLength`・`maxLength`・その他の配列制約は **400**。単純な `pattern` は動作するが、lookaround・後方参照・`\b` は400のリスク | 同じ | [High] |
| enumの大文字小文字 | 「文字列enumは大文字小文字の維持が保証されない」（Invalid outputsの節） | 同じ | [High] |

まとめると、これらのモデルではサンプリングパラメータで一貫性を得る方法はありません。使える手段は**スキーマ（構造）**、**プロンプト（例文）**、**コードゲート（判定）**、**effort** の4つです。長さ・個数・文末はスキーマで強制できないため、すべてコードで検査します。現在のコードは `client.beta.messages.stream` にスキーマをそのまま送っているため、SDKがサポートしていないキーを自動で取り除いてはくれません。サポートされていないキーを1つでも入れると、即座に400になります [High]。

### 1.2 コードで確認した事実

- `buildScriptRequest` の段階の行は `${label}（${label_native}）: ${rule}` のみで、`example` がありません。`questions.js` のシステムプロンプトには `例: 「…」` があります。録画出力3件のうち、パック例文の復唱の形（「〜、ですね。」）に従ったものが0件だった直接の原因の候補です [High コード / Medium 因果]。
- `generateScript` のループは、`askJson` が投げる `truncated`・`refusal` を捕捉しません。最初の呼び出しが `max_tokens`（4000、適応型思考トークンを含む）に引っかかると、リトライなしで502になります [High]。
- パック例文「止める・縮小する・続けるの**3**つで判断します。」には数字の3があります。例文を注入した後にモデルが「3つ」をまねて書くと `groundedNumbers` が弾いてリトライが増えます。C1とあわせてパックの文言を「三つ」に変える必要があります（パック修正のため人の承認が必要） [Medium]。
- `public/app.js` は `/api/script` に `question`・`answer`・`context`・`lang`・`pack` のみを送り、`category` は送りません。そのためC4は質問文だけでルーティングするよう設計しました。APIとUIは変えません。
- 質問生成のtaxonomyに `逆質問` カテゴリがあるため、逆質問タイプの質問もユーザーが回答すれば `/api/script` に入ってきます。そのため逆質問テンプレートもscriptの範囲に含めます。
- `packs/kr.json` には `answer_templates` と `consistency` がありません。すべての変更は、これらのキーがなければ現在とまったく同じに動作しなければなりません（no-op）。
- 実行時間: `api/script.js` のmaxDurationは120秒で、Anthropicクライアントはtimeout 50秒、maxRetries 1です。2回の呼び出し（約15~25秒×2）は上限内に収まります [Medium, 呼び出しあたりの時間はログに基づく推定]。

### 1.3 EVIDENCE-V3の長さバンドの計算誤り（今回発見）

EVIDENCE-V3 §3.3は「NFKC正規化、空白を除く、［］は中身ごと1文字と数える」というルールで、例文9つが202~237文字だと記載しました。ところがNFKCは `［］` を `[]` に変えます。その後に `［…］` の正規表現を適用すると、空欄が1つも1文字にまとめられません。実際には空欄を**全長で**数えた値です。記載されたルールどおり（空欄=1文字）に数え直すと次のとおりです（スクラッチスクリプト、リポジトリ外）。

| テンプレート | 空欄=全長 | 空欄=1文字 | estimateSeconds | 段階別の文の数（復/結/基/締） |
|---|---|---|---|---|
| 判断・状況 | 213 | 207 | 36.9 | 1/1/4/1 |
| 自己紹介 | 205 | **187** | 37.1 | 1/1/3/2 |
| 転職理由 | 222 | 216 | 41.8 | 1/1/3/1 |
| 志望動機 | 212 | 206 | 41.0 | 1/1/4/1 |
| 強み | 202 | **196** | 36.6 | 1/1/4/1 |
| 弱み | 202 | **196** | 35.1 | 1/1/4/1 |
| 成功体験 | 237 | 225 | 39.9 | 1/1/4/1 |
| 失敗体験 | 208 | 202 | 39.3 | 1/1/4/1 |
| マネジメント | 203 | **197** | 35.1 | 1/1/4/1 |
| 逆質問 | 95 | 89 | 15.4 | 0/1/1/1 |

- 記載されたルールどおりに数えると、**4/9の例文が200文字の下限を下回ります**。このバンドをゲートに使うと、私たちが示す例文をそのまままねて書いた出力もリトライ対象になります [High]。
- 録画の実出力もja・enの2件が31.5秒・29.3秒で35秒の下限を下回ります。下限を35秒にすると、ベースライン出力3件のうち2件がたった1回のリトライを使い切ってしまいます。
- **決定**: 長さのゲートは文字数ではなく `estimateSeconds` 1つとします。UIが表示する「約N秒」と同じ関数なので、ユーザーから見ても一貫します。初期バンドは**30~60秒 [Low]**とし、中央値ではなく外れ値だけを捕まえるようにします。N=5の評価で観測された分布で下限を決め直します。文字数は報告用の指標としてのみ使い、定義は「空白を除く、空欄は全長」（EVIDENCE-V3の表の数字と同じ方式）に改めます。EVIDENCE-V3 §3.3と `jp-draft-v3.json` `consistency.length.count` の文言は、マージ時にあわせて修正する必要があります。
- 文の数: 例文の実測は基準 3~4、締め 1~2、合計 6~7です。草案の範囲（基準 1~4、締め 1~2、合計 4~7）と矛盾はありません。ただし下限が緩いため、実際には上限のみが機能します [Low]。

## 2. 変更案の詳細

### C1. scriptプロンプトに段階の例文を注入（1行）

```js
// lib/script.js buildScriptRequest
const steps = s.steps.map((st, i) => `${i + 1}. ${st.label}（${st.label_native}）: ${st.rule} 例: 「${st.example}」`).join("\n");
```
- あわせて行うべきデータ修正（承認が必要）: `packs/jp.json` のketsuron例文の「3つ」を「三つ」に変えます。krパックの例文に数字があるかも同じ基準で確認します。
- 影響: `test/snapshots/jp-*.json` が変わります。再生成し、コミットメッセージに「scriptプロンプトに例文を追加」と理由を残します。

### C2. truncated リトライ（3行）

```js
let res;
try { res = await askJson(client, buildScriptRequest(pack, input)); }
catch (e) { if (e.message !== "truncated") throw e; why = "truncated"; continue; }
const { [target]: text, ...rest } = res;
```
- `refusal` はリトライしません。server-side fallbackがすでに処理しており、同じリクエストを再送しても結果が同じになる可能性が高いためです。
- `test/fake-claude.js` の `stop` はすべての呼び出しに1つの値しか適用しないため、呼び出しごとの `stops: ["max_tokens", "end_turn"]` オプションを1行追加する必要があります。

### C4. 質問タイプのルーティング（コードが決定、約10行 + パックデータ）

モデルにenumでテンプレートを選ばせる案（EVIDENCE-V3 §5 3番）と比較しました。モデルが選ぶと、同じ質問でも回ごとに選択が変わりえます（M8の揺れ）。コードが質問文で選べば、同じ質問には常に同じテンプレートが付き、オフラインテストで固定できます。そのためコードルーティングを基本とし、モデルのenum選択は代替案として残します。

パックデータ（提案、`answer_templates[*].match`）。評価順はパックのキー順です。そのため、マージ時にパックのキーを下表の順序に**並べ替える**必要があります。現在の草案の順序（強み→弱み、成功→失敗）のままだと、「強みと弱み」は強みへ、「失敗して苦労した」は `苦労` のため成功体験へ行きます。デフォルトは最初のキーではなく、**`match` のないテンプレート**（判断・状況）です。そうすればキー順を変えてもデフォルトは変わりません。
```
逆質問     質問はありますか|お聞きしたいこと|逆質問
自己紹介   自己紹介|これまでの経歴を簡単に
転職理由   転職(を考えた|の)?理由|退職(の)?理由|辞め
志望動機   志望|(当社|弊社)を選|なぜ(当社|弊社)|日本で働
弱み       弱み|短所|苦手
強み       強み|長所|得意
失敗体験   失敗|うまくいかなかった
成功体験   成果|成功|実績|大変だった|苦労|困難
マネジメント マネジメント|部下|育成|チームをまとめ|リーダー
判断・状況 （既定。match なし）
```
```js
// lib/script.js
export const pickTemplate = (pack, question) => {
  const ts = Object.entries(pack.answer_templates ?? {});
  return (ts.find(([, t]) => t.match && new RegExp(t.match).test(question)) ?? ts.find(([, t]) => !t.match))?.[0];
};
// buildScriptRequest: テンプレートはuserメッセージに入れます(システムプロンプトはバイト単位で固定し、キャッシュ可能にするため)。
const tk = pickTemplate(pack, question), t = pack.answer_templates?.[tk];
const keys = s.steps.map((st) => st.key);
const tpl = t ? `\n\n<template name="${tk}">\n${keys.map((k) => `- ${k}: ${t.steps[k]}｜例: ${t.example[k] || "（なし）"}`).join("\n")}${t.ng?.length ? `\nNG: ${t.ng.join(" / ")}` : ""}\n</template>` : "";
```
- 出力に `template: tk` を付けて返します（評価とデバッグ用、UIは無視）。
- 未解決 [Low]: daily_questions[5]「強みと弱み」は両方のテンプレートに引っかかります。上の順序では弱みが先に引っかかりますが、強みもあわせて述べる締めが必要かどうかは人が決める必要があります。[7] 入社後半年と [8] 5年後はデフォルト（判断・状況、options締め）に行きます。この2つにoptions締めが自然かどうかも確認が必要です。
- 例文の注入は質問あたり1つです。EVIDENCE-V3の「3~5個をシステムプロンプトに固定」案よりトークンが少なく（約200文字）、該当タイプと無関係な例文をモデルがまねるリスクもありません。

### C3. 段階別フィールドのスキーマ（約8行 + fixture）

```js
// scriptSchema: 対象言語キー(ja/ko)は維持します。11/03の実測で中立キー "text" を使うと説明フィールドの言語が逸脱しました(3/3)。
const stepObj = { type: "object", additionalProperties: false, required: keys,
  properties: Object.fromEntries(steps.map((st) => [st.key, { type: "string", description: `${st.label}: ${st.rule}` }])) };
const properties = { [key]: stepObj, ...(same ? {} : { reading: …, translation: … }), points: … };
// generateScript
const parts = res[target];
const text = keys.map((k) => (parts[k] ?? "").trim()).filter(Boolean).join(target === "ja" ? "" : " ");
```
- `reading` と `translation` は現在どおり全文1つとします。descriptionのみ「4項目をつないだ文の発音」に変えます。readingとtextが一致するかは現在も検査しておらず、今回の変更でリスクが大きくなることはありません [Medium]。
- 逆質問のfukushoは空文字列を許容します（スキーマはstringのみを要求）。
- 戻り値の形: `text`（つなげた文）はそのままにして `parts` を追加します。UI・export・readcheckは `text` のみを読むため影響はありません。
- 変更が必要な箇所: `test/fake-claude.js` `asModelScript`（textをpartsに分ける処理）、`test/fixtures/script.json`, `test/generate.test.js`, `test/snapshot.test.js` + snapshots, `dev.js` のMOCKパス（同じfixtureを使用）。
- リスク [Medium, 未測定]: フィールドを分けると文と文のつながり（「その結果、」など）が不自然になる可能性があります。評価のM5（本文の類似度）と人による音読確認で判断します。

### C5. 決定的ソフトゲート（約25行）

`consistency` のルールをプロンプトの出力指示に4行で入れ（復唱の形、段階別の文の数、文末 です・ます、空欄のラベル一覧と最大個数、「全体で30〜60秒」）、同じルールをコードで判定します。

```js
import { estimateSeconds } from "../public/tts-timing.js"; // libからpublicをimportする初の事例: Vercelプレビューでバンドルに含まれるか確認すること
const split = (s) => s.split(/(?<=[。？])/).map((x) => x.trim()).filter(Boolean);
const range = (v) => (Array.isArray(v) ? v : [v, v]);
export function scriptIssues(pack, tk, parts) {
  const C = pack.consistency, t = pack.answer_templates?.[tk];
  if (!C || !t) return [];                                   // krパックなど: no-op
  const keys = pack.answer_structure.steps.map((s) => s.key);
  const noFukusho = C.fukusho_form.except?.[tk] === "（なし）";
  const all = keys.map((k) => parts[k] ?? "").join(""), out = [];
  for (const k of keys) { if (k === "fukusho" && noFukusho) continue;
    const n = split(parts[k] ?? "").length, [lo, hi] = range(C.sentences[k]); if (n < lo || n > hi) out.push(`sentences:${k}`); }
  if (!split(all).every((x) => new RegExp(C.ending_regex).test(x))) out.push("ending");
  if (!noFukusho && !new RegExp(C.fukusho_form.must ?? "、ですね。$|と申します。$").test(parts.fukusho ?? "")) out.push("fukusho");
  if (C.closing_forms[t.closing]?.must && !new RegExp(C.closing_forms[t.closing].must).test(parts.sentakushi ?? "")) out.push(`closing:${t.closing}`);
  const b = all.match(/［[^］]*］/g) ?? [];
  if (b.length > C.max_blanks || !b.every((x) => C.blank_labels.includes(x))) out.push("blank");
  const sec = estimateSeconds(all), [smin, smax] = C.length.gate_seconds;
  if (C.length.applies_to_except !== tk && (sec < smin || sec > smax)) out.push("length");
  return out;
}
```
- パックデータの追加（提案）: `closing_forms.*.must`（正規表現文字列）。optionsは `どちらから.*ましょうか。$`、contributionは `(御社|入社後).*ます。$`、improvementは `御社.*ます。$` です。草案の例文10個と照合した結果、10/10通過しました。草案の文言どおり「御社」のみを要求すると、志望動機の例文（「入社後は、…再現します。」）が引っかかって9/10になります。questionは「疑問文が一つだけ」を `^[^？?]*[？?]?[^？?]*$` と `(か。|？)$` を同時に満たす式とします。正規表現をパックに置けば、krパックもコード変更なしに独自のルールを使えます。`gate_seconds` は [30, 60] [Low] とします。
- リトライ方針（既存の質問生成のspecificityゲートと同じ方式）: 言語と数字の根拠は**ハードゲート**で、現在どおり2回失敗すればエラーです。一貫性ゲートは**ソフトゲート**です。最初の呼び出しがハードゲートのみ通過してissuesがあれば、もう1回作ります。2回目がハードゲートで失敗するか、issuesがより多ければ1回目を返します。ソフト違反のためにユーザーが502を見ないようにするためです。
```js
// generateScriptのループ内、ハードゲート通過直後
const issues = scriptIssues(pack, tk, parts);
if (!best || issues.length < best.issues.length) best = { out: { ...out, template: tk, issues }, issues };
if (!issues.length) return best.out;
continue;
// ループの後
if (best) return best.out;
```
- 翻訳のみを取り直すパス（最初の呼び出しで翻訳だけ失敗した場合）はそのままにします。このパスでは一貫性リトライを行わず、最初の結果のissuesをそのまま返します（2回の予算を維持）。
- コストと遅延: 初回通過率が80%なら呼び出し数は平均1.2回、scriptの原価が約$0.037から$0.044になり、一部のリクエストは15~25秒長くなります [Low, 初回通過率 未測定]。

### C6. reviewの正規化とソート（2行）

```js
const ids = new Set(pack.correction_rules.map((r) => r.id));
const corrections = out.corrections.map((c) => ({ ...c, rule_id: c.rule_id.toLowerCase() })).filter((c) => ids.has(c.rule_id) && …既存の条件…)
  .sort((a, b) => answer.indexOf(a.before.normalize("NFKC")) - answer.indexOf(b.before.normalize("NFKC")));
// answers_questionもtoLowerCase()
```
- 文書がenumの大文字小文字の維持を保証しないと明記しているため、根拠は[High]です。実際に起きたことはありません（ログ未確認）。ソートはJaccard値には影響せず、画面の表示順のみを固定します。

### C7. effort `low` （評価レッグとしてのみ）

- 根拠: §1.1の「決定性が目的なら low + 緻密なプロンプト」、Sonnet 5.5の出発点「コンテンツ生成はlow」 [Medium]。lowでは思考をほぼ省くため、`max_tokens` truncationのリスクと遅延も減ります。
- 反対の根拠: 思考が減ると数字の根拠や言語ルールの違反が増える可能性があります。そのため評価 B′ = B + `effort: "low"` で回し、ハードゲートの初回通過率がBより悪くならない場合にのみ採用します。

## 3. オフラインテスト（node:test、トークン0、`npm test` に含む）

| # | 名前 | 準備 | アサーション |
|---|---|---|---|
| T1 | 例文注入（C1） | `buildScriptRequest(pack, {question:"Q", answer:"A"})` | 各 `pack.answer_structure.steps[i].example` について `system.includes(\`例: 「${example}」\`)` |
| T2 | パック例文に数字なし | jp/krパック | `steps.every(st => !/[0-9０-９]/.test(st.example))` （C1とあわせて行う「三つ」修正を固定） |
| T3 | truncated リトライ（C2） | `fakeClient({ responses:[x, good], stops:["max_tokens","end_turn"] })` | 結果がgoodで `calls()===2`。2回ともmax_tokensなら `/truncated/` でreject |
| T4 | 400リスクのキー禁止 | jp・kr × ko・en・ja の script・review・questions リクエスト | `!/"(minLength|maxLength|maxItems|minimum|maximum)"/.test(JSON.stringify(req.output_config))`。`minItems` があるなら0または1 |
| T5 | サンプリング・プリフィル禁止 | すべてのbuild*リクエスト | `!("temperature" in req || "top_p" in req || "top_k" in req)`, `req.messages.at(-1).role === "user"` |
| T6 | 段階フィールドのスキーマ（C3） | `scriptSchema(...)` | `properties.ja.required` がパックのstep keyの順序とdeepEqual、`additionalProperties===false` |
| T7 | 順序どおりの連結（C3） | モデル応答のpartsのキー順をシャッフル | `out.text === fukusho+ketsuron+kijun+sentakushi`（パックの順序）、krは空白でつなぐ |
| T8 | ルーティング（C4） | 草案パック | 各テンプレートの `daily_questions` インデックスの質問がそのテンプレートに行く（[5]は弱みまたは強みのいずれか）。「最後に、何か質問はありますか。」は逆質問、「見積もりがずれたらどうしますか。」は判断・状況、どこにも引っかからない文は `match` のないテンプレート（判断・状況）。「失敗して苦労した経験」は失敗体験 |
| T9 | ルーティングの決定性 | 同じ質問を100回 | `pickTemplate` の結果がすべて同じ（正規表現の `g` フラグで状態が残るバグを防止） |
| T10 | 例文の自己一貫性（C5） | 草案パックのすべてのテンプレート | `scriptIssues(pack, k, t.example)` が `[]`。§1.3のようなバンド・例文の矛盾をCIで検出します |
| T11 | ゲートの陰性事例（C5） | 判断・状況の例文を1か所ずつ壊す | 復唱「〜についてお答えします。」→`fukusho` / 最後の文「〜しました。」を普通体「〜した。」に→`ending` / 空欄4個→`blank` / ラベル「［期限］」→`blank` / 基準6文→`sentences:kijun` / contribution締めから「御社」を削除→`closing:contribution` / 同じ文を繰り返して70秒以上→`length` |
| T12 | ソフトリトライ（C5） | `responses:[issueful, clean]` | cleanを返し、`calls()===2`。`[issueful, worse]` ならissuefulとその `issues` を返しthrowしない。`[issueful, ハード失敗]` ならissuefulを返す |
| T13 | ハードゲートの維持 | 数字根拠の違反2回 | 現在どおり `/number check/` でreject |
| T14 | kr no-op | `packs/kr.json` | `scriptIssues` は `[]`、プロンプトに `<template` なし、既存のkrテストを通過 |
| T15 | review正規化（C6） | `rule_id:"DEL-NANKA"`、逆順のcorrections | `rule_id==="del-nanka"`、beforeの回答内の位置の昇順 |
| T16 | スナップショット | `test/snapshots/jp-*.json` を再生成 | 変わった行がC1・C4・C5の意図した文言のみかをdiffで確認。理由をコミットメッセージに残す |

`test/fixtures/script.json` は現在「はい、」で始まり、ラベル「［期限］」を使っているためC5ゲートを通過しません。C3・C5とあわせて判断・状況の例文の形に修正する必要があり、MOCKデモ画面もそれに応じて変わります。

## 4. 実呼び出しの一貫性評価仕様: `scripts/eval.mjs --only consistency`

- 入力ファイル `test/eval/consistency.json`（架空データ3件、PII検査の対象）:
  - I1 判断・状況: 「見積もりが大きくずれたとき、どう判断しますか。」 / 日本語の回答、数字なし / `expect_template:"判断・状況"`
  - I2 志望動機: 「当社を志望した理由を教えてください。」 / 韓国語の回答、数字1つ（例: 3年）を含む / `"志望動機"`
  - I3 失敗体験: 「これまでの失敗経験と、そこから学んだことを教えてください。」 / 日本語の回答、質問から半ばずれた回答 / `"失敗体験"`
  - 説明言語はすべて `ko` です。言語による交絡を減らすため固定します。
- 実行（入力ごとに5回、poolの同時実行数3）:
  1. `generateScript` ×5 → 出力15個
  2. 各script出力の `text` を `generateReview(question, text)` で1回ずつ採点 → 15個（生成モデルとは別のモデルで構造を判定）
  3. ユーザー回答の原文を `generateReview` ×5 → 15個（採点そのものの一貫性）
- 実際に応答したモデルの記録: libを修正せず、eval内でクライアントをラップします。`const tap = { beta: { messages: { stream: (r) => { const s = client.beta.messages.stream(r); return { finalMessage: async () => { const m = await s.finalMessage(); log.push({ want: r.model, got: m.model, stop: m.stop_reason }); return m; } }; } } } };` fallbackで別のモデルが応答した回は指標から除外し、`fallback_runs` として別に数えます。
- A・Bの実行: 評価コードは `out.parts`・`out.issues`・`out.template` があれば使い、なければ `text` を `split` して近似します。そのためA（現在のコミット）とB（PR-2ブランチ）で同じファイルを使って回せます。git worktree 2つでそれぞれ `ENV_FILE=… node scripts/eval.mjs --only consistency > out-{A,B}.json` を実行します。

| 指標 | 定義 | 通過閾値 [Low] | Aの近似ベースライン |
|---|---|---|---|
| K1 段階の順序・存在の合意 | (2)のreview `steps` 4つのpresentベクトルが入力別の最頻ベクトルと同じで、その最頻ベクトルがすべてtrueである回の数 | 入力別 5/5 | 未測定 |
| K2 長さの変動係数 | 入力別の `estimateSeconds(text)` の標準偏差/平均、およびバンド [30, 60] 内に入った割合 | CV ≤ 0.10、バンド 15/15 | 録画3件 29~41秒（±18%） |
| K3 rule-id Jaccard | (3)で入力別5回のcorrections `rule_id` 集合のペアごとのJaccard平均（両方空なら1） | ≥ 0.8 | 未測定 |
| K3b 採点判定の合意 | (3)の `answers_question` と `steps` presentベクトルが最頻値と同じ回 | 5/5 | 未測定 |
| K4 空欄の使用 | 入力別の空欄ラベル集合のペアごとのJaccard、閉じた集合外のラベル数、個数 ≤ 3 の違反数、`groundedNumbers` の違反数 | ≥ 0.6 / 0 / 0 / 0 | 録画出力に「［期限］」（閉じた集合外） |
| K5 テンプレートの合意 | `out.template === expect_template` | 15/15 | 該当なし（新規） |
| K6 文の数の合意 | 段階別の文の数が入力別の最頻値と同じ回（Bはparts、Aは最初の文=復唱、最後=締め、残りは近似） | ≥ 4/5 | 4~7文で揺れ |
| K7 文末 | `ending_regex` 違反の文の数 | 0 | 0/16 |
| K8 復唱の形 | 復唱が「、ですね。」の形である回（逆質問を除く） | ≥ 14/15 | 0/3 |
| K9 ゲート通過率 | 最初の呼び出しでハード+ソフトとも通過 / 最終issues 0 | ≥ 12/15 / ≥ 14/15 | — |
| K10 本文の類似度（報告のみ） | 段階フィールド別のペアごとの正規化Levenshtein（NFKC後に空欄→□） | 報告のみ（ベースライン +0.15 を目標として参考） | 0.26~0.44 |

- 採用ルール: BはK3系を除くすべての指標でAより悪くなく、K1・K2・K6・K8のうち2つ以上が改善した場合に採用します。B′(effort low)はB比で同じルールに加え、K9の初回通過率がB以上の場合にのみ採用します。閾値は最初のA実行後に決め直し、そのときに長さバンドの下限も決めます。
- コスト（PRD実測単価 Sonnet script 約$0.037、Opus review 約$0.031）: 1レッグで script 15×1.2 + review 30 ≈ $0.67 + $0.93 ≈ **$1.6** です。A/B/B′ 全体で約$4.8、時間はレッグあたり約5~8分です [Medium]。
- 出力は指標のJSONのみです。回答と模範スクリプトの本文はコンソールに残しません（既存のevalの慣例）。`test/live.test.js` と同様にルーティンの点検では回さず、プロンプト・パック・モデルを変えた後に人が手動で1回実行します。

## 5. 人の承認が必要な項目

1. パック例文の「3つ」を「三つ」に修正（C1に付随、`packs/jp.json`）。
2. `answer_templates`・`consistency` のマージ。新しいフィールド `match`, `closing_forms.*.must`, `fukusho_form.must`, `length.gate_seconds`([30, 60]), `length.applies_to_except`("逆質問")を追加します。`answer_templates` のキーをC4の表の順序に並べ替え、マージ時に `consistency.status`(「draft…」)は削除します（C4・C5）。4文型の4段目「選択肢で返す」を質問タイプ別の締め（contribution・improvement・question）が上書きしてしまう問題（EVIDENCE-V3 §3.1）もあわせて決める必要があります。
3. 空欄表記の統一: `lib/lang.js` `TL.blank`（「［ここに実績の数字］」）とパック例文（「［いつ・何を］」「［就労できる範囲］」）が `blank_labels` の閉じた集合の外にあります。統一しないと、C5の `blank` ゲートが私たち自身の指示のせいで引っかかります。
4. EVIDENCE-V3 §3.3と `consistency.length.count` の文言訂正（§1.3）。
5. 「強みと弱み」の質問のルーティング、[7]・[8]の質問のデフォルトの締め（C4の未解決項目）。
6. del-chotto・rep-omoimasuの範囲修正（EVIDENCE-V3 §2.2）。採点の一貫性（K3）に直接影響するため、PR-2の評価前に決めるのが望ましいです。

## 6. 限界と未確認事項

- すべての効果の見積もりは実呼び出しなしで立てたものです。ベースラインは録画 n=3 のみで、質問の文言と説明言語が異なるため交絡があります。
- Anthropicの制約は、claude-apiスキルキャッシュ（2026-10-06）とstructured-outputs文書（2026-11-03閲覧、先頭100k文字のみ読了）を基準にしました。`maxItems` が400になるというのは「minItems 0・1以外の配列制約は不可」からの推論です。日本語の文字と選択（|）を含む `pattern` がコンパイルされるかは確認していないため、文末の検査はコードゲートとします。
- `lib` から `../public/tts-timing.js` をimportするのは初めてです。Vercel関数のバンドルに含まれるか、プレビューデプロイで確認する必要があります。含まれない場合は `vercel.json` `includeFiles` に追加するか、関数をlibに移します。
- `estimateSeconds` はTTSの1文の実測（8 mora/秒）で補正しました。人が話す実際の速度とは異なる可能性があります。
- ルーティングの正規表現はdaily_questionsといくつかの文型だけで設計しました。生成された質問（10個×会社）での誤分類率がどれくらいかは、質問生成出力のサンプルで別途測定する必要があります [Low]。
