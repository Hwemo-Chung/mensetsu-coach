---
name: prompt-change-check
description: プロンプト、モデル、スキーマ、添削ルールの変更を、費用を抑えて検証する手順です。lib/ の生成処理や packs/ のルールを変えたら使います。
---

# プロンプト・モデル・スキーマ変更の検証

無料の確認で落とせるものを先に落とし、実呼び出しは変更に関係する範囲だけ実行します。実呼び出しはクレジットを消費するため、実行前に対象、呼び出し数、理由を報告します。`npm test` が通っても、生成物の品質は確かめられていません。

worktree など別の場所で実行するときは、以下の `../BuiltWithClaude-2026-private` を絶対パスに置き換えます。相対パスが解決できないと、個人情報のスキャンや実呼び出しが飛ばされたまま成功に見えます。

## 手順

### 1. 無料の確認

```bash
PII_DENYLIST=../BuiltWithClaude-2026-private/secrets/.pii-denylist.txt npm test
```

出力の `skipped` が 0 であることを確かめます。

`test/snapshot.test.js` が守るのは、日本向けの質問（調査結果なし）、スクリプト、レビュー、逆質問のリクエストだけです。適合度、準備文書、翻訳、調査、`packs/kr.json` の変更では失敗しません。

- 意図しない差分は不具合です。スナップショットを更新せず、原因を直します。
- 意図した差分だけ `UPDATE_SNAPSHOTS=1 npm test` で更新し、`git diff --word-diff test/snapshots` で変更箇所を読みます。

スキーマや生成物の形を変えたら、次も確かめます。

- `test/fixtures/` を直し、`npm run test:ui` を実行します。`npm test` には含まれません。
- `public/demo/*.json` は実際の出力の録画で、公開デモと動画で再生されます。自動では更新されません。`scripts/record-demo.mjs` で録り直す（1 言語 5 呼び出し、ユーザーに確認）か、報告に「デモ未更新」と書きます。

### 2. 実呼び出しのテスト（質問生成か調査を変えたときだけ）

`test/live.test.js` は `jp` パックの質問生成と企業調査だけを呼び出します。

```bash
# 両方（約 35 秒）
ENV_FILE=../BuiltWithClaude-2026-private/secrets/.env npm run test:live
# 調査だけ
ENV_FILE=../BuiltWithClaude-2026-private/secrets/.env node --test --test-name-pattern="a real search" test/live.test.js
```

鍵を読めないとテストは飛ばされるので、`skipped` が 0 であることを確かめます。架空の企業で呼び出すため、確かめられるのはスキーマが受理されることまでです。値が埋まるかどうかは確かめられません。

### 3. 変更箇所に関係する評価だけ実行

```bash
ENV_FILE=../BuiltWithClaude-2026-private/secrets/.env node scripts/eval.mjs --only <対象>
```

`--only` は必ず指定します。省略すると `f4,f3,f2` がすべて実行されます。呼び出し数は再試行を含まない最小値です。

| 変更箇所 | 確認方法 | 最小の呼び出し数 |
|---|---|---|
| 質問生成 `lib/questions.js` | `f2` | 15（Sonnet） |
| 構成チェック `lib/review.js` | `f3`、回帰が疑わしければ `f3adv` | 42、29（Opus） |
| 添削 `lib/review.js` | `f4`、続けて `f4neg` | 18、35（Opus） |
| `correction_rules` | `f4,f4neg`、スクリプトを画面から 1 回 | 53 + 1（ルールはスクリプトのプロンプトにも入ります） |
| `answer_structure`、`closing_rules` | `f3`、締めの種類ごとに画面から確認 | 42 + α（スナップショットと `consistency` は貢献型の締めしか通りません） |
| 模範スクリプト `lib/script.js` | `consistency --n 2`、最終確認だけ既定の 5 回 | 12、30（レビューの Opus を含みます） |
| 外部入力の扱い、質問とレビューのシステムプロンプト | `f5` | 2（質問とレビューのみ） |
| `packs/kr.json` | `f4 --pack packs/kr.json` | 3（評価データは日本語なので再現の確認のみ） |
| 逆質問 `lib/reverse.js`、適合度 `buildFitRequest`、翻訳 `buildTranslationRequest` | 評価なし。`dev.js` で実際に 1 回呼ぶ | 1 |
| 準備文書 `lib/prep.js`、調査結果を使う質問 | `eval-real --only prep --dry` で送信内容を読み、ユーザーに確認して実行 | 高額 |
| `lib/claude.js` の `MODELS` | そのモデルを使う機能の行 | 同上 |

1 行ずつ実行し、回帰が見えたら原因を調べるまで次を実行しません。

結果を読む前に、出力の `errors` と `error` を確かめます。鍵を読めないと評価は止まらず、`f4neg` は誤検出が 0 件に見えます。`eval.mjs` は常に正常終了するので、合否は数値を読んで判断します。`f3adv` と `f2` は外れた項目を出力しません。

## 実データの評価 `scripts/eval-real.mjs`

費用が高いため、公開データの評価で判断できないときに、ユーザーに確認してから実行します。

キャッシュは `$REAL_EVAL_DIR/raw/` にあります。調査、レビュー、質問（`<sha1>.json`、`research-*`、`review-*`、`questions-*`）のキーにはプロンプトが含まれません。`prep-*` のキーも `script_doc` と `lib/prep.js` だけです。それ以外を変えたら、該当するキャッシュを消してから実行します。消さないと古い結果が返り、400 の失敗もそのまま再利用されます。

## 落とし穴

- **調査スキーマ**: `lib/research.js` の抽出スキーマは API の文法サイズ上限に近く、フィールドを足すと全呼び出しが 400 になります。オフラインのテストでは検出できないため、スキーマを変えたら手順 2 が必須です。先に、既存のフィールドから計算で求められないか、既存のフィールドを削れないかを検討します。
- **`gateBrief`**: 調査結果は `gateBrief` が名前を指定して保存します。新しいフィールドをここに足さないと、エラーもテストの失敗もなく値が失われます。
- **検索ツール**: Haiku の調査では基本の `web_search_20250305` を使います。新しいツールでは実際の検索が 0 回になりました。
- **モデル ID**: アプリの呼び出しは `lib/claude.js` の `MODELS` で管理します。`scripts/eval.mjs` の基準線と `scripts/record-demo.mjs`、`lib/consistency-metrics.js` の価格表には別に書かれているので、モデルを替えるときは確かめます。
- **ルールの範囲**: `packs/` のルールにない添削を増やしません。判断できない場合は、推測せず確認の質問に回します。

## 結果が悪いとき

- 同じ呼び出しを再実行する前に、原因を確かめます。再試行で通っても原因は残ります。
- 評価の正解データが誤っている場合もあります。モデルの誤りと断定する前に、公式の原文と照合します。
- 件数の変化だけで判断せず、出力される項目は外れたものを読みます。

## 結果の扱い

評価の生データは非公開フォルダに保存します（`consistency` 以外は標準出力に出るだけなので、必要なら保存します）。精度の数値を、公開文書やコミットメッセージに書きません。

## 報告の形式

```
## 検証結果
- 変更: <ファイルと内容>
- npm test: pass <N> / fail <N> / skipped <N>、スナップショット: <差分なし / 意図した更新（内容）>
- test:ui、固定データ、デモ: <結果 / 未更新と理由>
- test:live: <結果 / 未実行と理由>
- eval: <--only の値、errors、結果 / 未実行と理由>
- 実呼び出しの回数: <回数>
- 未確認: <評価のない経路など、なければ「なし」>
```
