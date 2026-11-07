---
name: add-pack
description: 新しい国別パックを追加する手順です。packs/ のデータ、言語の登録、画面の選択肢、JP 専用機能の確認を扱います。新しい国や言語の面接に対応するときに使います。
---

# 国別パックの追加

国ごとのルール、プロンプト用データ、質問分類は `packs/` に置きます。ただし現在のコードでは、**JSON の追加だけでは新しいパックを使えません**。読み込み時の形式検査もないため、欠けた項目があっても `npm test` は通り、本番で生成が失敗するか、品質だけが落ちます。

## 手順

### 1. 根拠と権利を確かめる

ルールは根拠のあるものだけを入れ、推測で埋めません。根拠のない項目は `note` に前提として明記します。出典の利用権を確かめ、本文をそのまま転載しません。調査の記録は `01_設計文書/research/` に置きます（例: `KR-SUMMARY.md`、`kr-draft.json`）。評判サイトは収集しません。

### 2. パックを作る

`packs/<2文字のid>.json` を作ります。`packs/kr.json` がベータ版の最小例です。`test/tts.test.js` は `us` を未対応の例に使っているので、この id を選ぶならテストも直します。

| フィールド | 内容 |
|---|---|
| `id`, `name`, `country`, `version` | 識別情報。`id` は英小文字2文字（`lib/pack.js` の検査） |
| `language_pair.target` | 面接の言語。`native` は画面の言語で決まるため持ちません |
| `correction_rules[]` | `id`（英小文字。大文字はレビューで無視されます）, `pattern`, `type`, `replacement`, `reason`, `example_before`, `example_after` |
| `answer_structure` | `name`, `core_principle`, `steps[]`（`key`, `label`, `label_native`, `rule`, `example`。欠けるとプロンプトに `undefined` が出ます） |
| `model_answer_format` | 模範回答の形式。`duration_seconds` を含みます |
| `question_taxonomy` | `stages`（2つ以上）, `categories`, `generic_terms`（どの企業にも当てはまる語） |
| `culture_notes`, `daily_questions` | 文化の注意点、毎日の質問 |
| `beta`, `note` | 検証前は `beta: true` とし、`note` に出典と前提を書きます。`beta` を読むコードはないので、画面の表示は手順 3 で別に直します |

`script_doc`、`research`、`consistency` は JP 専用です。入れないでください。

### 3. コードに登録する

| ファイル | 変更 | 理由 |
|---|---|---|
| `lib/pack.js` | `PACKS` に id を追加 | API の許可リストで、ないと `pack_unsupported` になります |
| `public/app.js` | `DESTS` と `OPEN_DESTS` に追加し、`d === "kr"` のベータ表示を一般化 | 一般化しないと「準備中」と表示されます |
| `public/i18n/` | `dest.<id>`、段階とカテゴリの名前を全言語に追加 | `dest` の欠落はテストで検出されず、メニューに `undefined` と出ます |
| `test/i18n.test.js` | `dest` の一覧に id を追加 | 欠落を検出するためです |
| `test/lang.test.js` | 登録一覧の期待値、反復するパックの一覧、新しい id の形式テストを追加 | 既存の形式テストは `kr` 専用です |
| `public/calendar.js`、`public/i18n/` の `calendar.at` | 日時を日本時間（UTC+9、`Asia/Tokyo`）として読む処理と表示 | 時差のある国では、予定が別の時刻に入ります |

新しい言語、または既存の言語を初めて面接の言語にする場合は、次も必要です。`en` のように登録済みの言語でも、初めて面接に使うなら確認します。

| ファイル | 変更 |
|---|---|
| `lib/lang.js` | `TARGET_LANGS`、`READINGS`（全画面言語。欠けると生成で例外）、`EXPLAIN_LANGS` の `isText` にある面接言語ごとの分岐 |
| `public/stt-whisper.js` | `PROMPT`、`MIN_CHARS_PER_SEC`。語の間に空白を入れない言語なら連結の処理も |
| `lib/script.js` | `joinParts`（空白の扱い） |
| `lib/verify.js` | 話す時間の計算。パックに `consistency.chars_target` がなければ `ROUND_CHARS` を使うので、測った値に置き換え、理由をコメントに書く |
| `public/voice.js` | `DEVICE_VOICES`。ないと端末の音声で読み上げられません |
| `public/i18n/` | `script.text`、`script.reading`、`chat.askAnswer`、`chat.waitReview`、`steps` の面接言語別キー |
| `test/lang.test.js` | `EXPECTED_READING` |

最後に、固定された箇所を検索します。`"kr"` だけでは言語の分岐を見つけられません。

```bash
grep -rnE '"(jp|kr|ja|ko)"|\b(ja|ko): ' lib api public test dev.js
```

`anglo` を置き換えるパックでは、`api/demand.js` の `TARGETS` と関連テストも直します。

### 4. JP 専用の機能を確かめる

次の機能は `jp` パックだけを前提にしています。新しいパックで有効にしないでください。

- 逆質問: `public/app.js` の `packOf() === "jp"` で制御し、API 側も拒否します。
- 面接準備ドキュメント: `script_doc` が必要です。
- 企業調査: `research` が必要です（`RESEARCH_ENABLED`）。

### 5. 個人情報のマスキングを確かめる

その国の電話番号、郵便番号、宛名で `lib/privacy.js` の `maskInput` を確かめます。`public/privacy.html` は郵便番号と宛名を隠すと説明しています。隠せない形式は、直すか、README の `実運用前に修正が必要な点` に書きます。

### 6. 検証する

`MOCK_CLAUDE` の固定応答は日本語なので、新しいパックの質問生成は通りません。`test/ui/features.test.js` の `page.route` の例にならって新しい id のテストを追加してから実行します。追加しないと、`test:ui` が通っても新しいパックは一度も動いていません。

```bash
PII_DENYLIST=../BuiltWithClaude-2026-private/secrets/.pii-denylist.txt npm test
npm run test:ui
```

- 出力の `skipped` が 0 であることを確かめます。
- `test/snapshot.test.js` に差分が出たら、日本向けの動作を変えています。スナップショットを更新せず、原因を直します。
- `npm run test:live` は `jp` パック固定で、新しいパックの確認には使えません。ユーザーの承認を得てから、次のコマンドと画面からの生成で確かめます。`f4` の画面言語は `ko` 固定なので、日本語の画面でも添削を 1 回試します。

  ```bash
  ENV_FILE=../BuiltWithClaude-2026-private/secrets/.env node scripts/eval.mjs --pack packs/<id>.json --only f4
  ```

### 7. 文書を更新する

README（実装範囲、ロードマップ、リポジトリ構成、外部データの出典）と `01_設計文書/PRD-INTERVIEW-COACH.md` を更新します。公開文書はビジネス日本語で書きます。

## 報告の形式

```
## パックの追加結果
- パック: <id>（beta の有無）、ルール <N> 件、根拠と利用権: <ファイル>
- 変更したコード: <ファイル一覧>
- 無効にした機能: <一覧>
- マスキング: <確認した形式と漏れ>
- npm test / test:ui: <結果>、新しい id のテスト: <追加の有無>
- スナップショットの差分: <なし / 内容>
- 実呼び出しの確認: <結果 / 未実行と理由>
- 根拠のない前提: <一覧>
```
