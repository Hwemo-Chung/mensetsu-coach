# デスクトップレイアウトのベンチマークと改修案 3 種（2026-11-03）

> 範囲: 調査・提案のみ。コード変更なし。根拠タグ [High]=公式文書で直接確認、[Medium]=検索要約・間接的な根拠、[Low]=推定。
> 関連: `UIUX-SPEC.md` §2・§3（現行のハイブリッド）、`public/style.css`、`public/panel.js`、`test/ui/layout.test.js`。

## 0. 結論から

- **推奨: 案 B（チャット + 文書型の添削ウィンドウ、余白注釈）** です。現在の `.app` 2 列グリッド・`panel.js`・段階の状態（code → mail → pick ⇄ answer）・キー処理（Enter で改行、Ctrl/Cmd+Enter で送信）をそのまま残し、**スタイルシートの書き直し + パネルの既定オープン**程度で、ユーザーが求めた 4 点（アイコン背景の除去、デュオトーンの単一スタイル、島 UI の除去、全幅の活用）をすべて満たします。[High: コードを直接確認]
- 案 A（3 カラムの作業スペース）は、B の **≥1200px 拡張段階**（左に質問リストを追加）として後から付けるのが妥当です。最初から別案として進めると、レンダリング対象・選択方式（JS）まで変わります。[Medium]
- 案 C（ふりがなリーダー）は可読性は最高ですが、漢字ごとに読みを対応付けた**新しい応答スキーマ・プロンプト変更**が必要で、締め切り（11/8）内ではリスクがあります。[High: `lib/script.js` は文単位の `kana`/`reading` のみを生成]

## 1. 核心の緊張関係: 「全幅の活用」≠「長い行」

二つの要求は文字どおりには衝突します。1440px 幅に本文の一行を広げると、日本語の一行が 80 字を超え、以下のすべての基準に反します。

**解決策: 画面は全幅のグリッドで埋め、各テキスト列は行長を上限で縛る。** 余った幅は行を伸ばすことには使わず、横のウィンドウ（添削・余白注釈・質問リスト）に使います。GOV.UK の 2/3+1/3 列、Material の supporting pane 70/30 がまさにこの方式です。[High]

- 日本語・韓国語のテキスト列: `max-width: 40em`（CJK 1em ≈ 全角 1 字 → 約 40 字）。[High: 原理]
- ラテン文字（英語 UI・ローマ字）: `max-width: 70ch`。[High: 原理]

## 2. 可読性の基準（出典のある数値のみ）

| 項目 | 基準 | 出典 | タグ |
|---|---|---|---|
| 行長（一般） | 一行 80 字以下、**CJK は 40 字以下** | W3C WCAG 1.4.8 (AAA) | [High] |
| 行長（日本語横組） | 横組の最大 **40 字** | W3C JLREQ、基本版面設計の注記 | [High] |
| 行長（ラテン） | 50–75 字 | Baymard | [Medium]（検索要約） |
| 行長（政府サービス） | 2/3 列、通常 **75 字以下**、ページ最大 1020px | GOV.UK Design System Layout | [High] |
| 行間（一般） | 段落内の行間 **1.5 以上**、段落間隔は行間の 1.5 倍以上 | WCAG 1.4.8 | [High] |
| 行間（日本語） | 行間の余白 0.5–1em、**35 字を超える行は 1em 近く**（= line-height 約 1.75–2.0） | JLREQ | [High] |
| 行間・サイズ（日本政府） | 本文・UI **16px 以上**、14px 未満は原則禁止、本文の line-height **1.5 / 1.6 / 1.7 / 1.75**、16–26px で字間 0.02em | デジタル庁デザインシステム（DADS）Typography | [High] |
| 行間（日本の SaaS） | 段落 1.5 倍（16px 基準） | SmartHR Design System | [High] |
| 韓国語本文 | KRDS の本文 17px への言及は第三者のギャラリーのまとめのみで、公式の数値は未確認 | — | [Low] |
| コントラスト | 通常の文字 **4.5:1**、大きな文字 3:1 (AA) / アイコン・UI の境界 **3:1** | WCAG 1.4.3 / 1.4.11 | [High] |

**現在のコードに当てはめると** [High: `public/style.css` を直接確認]
- `.legend`・`.tag`・`.script .label` が 11px、`.tr`・`.points`・`.cmp` が 13px → DADS の下限（14px）未満。本文 16px、補助 14px に上げる必要があります。
- `.msg` の line-height 1.5 は韓国語・英語には十分ですが、模範スクリプトの日本語は 1.75–1.9 が適切です（JLREQ: 35 字を超える行は 1em の余白）。
- グレーのコントラスト: `#666` 5.74:1、`#555` 7.46:1 は合格。待機中のドット `#8a939c`（約 3.1:1）は文字に使うと不合格。[High: 計算]
- デュオトーンアイコンは補助レイヤー（淡い面）だけでは 3:1 を超えられません。**意味は濃い線のレイヤーが担い、淡い面は装飾**でなければ 1.4.11 を守れません。[Medium]

## 3. ベンチマーク 11 種

| # | 製品 / 文書 | 広い画面で読みやすい理由（レイアウトパターン） | 当アプリの対応部分 | タグ |
|---|---|---|---|---|
| 1 | Material 3 **Supporting pane** — developer.android.com/guide/topics/large-screens/large-screen-canonical-layouts | 主領域 約 2/3（expanded で 70%）+ 補助領域 30%。補助領域は主コンテンツと一緒のときだけ意味を持つ。例として「文書 + レビュアーのコメント」。狭いときは下・ボトムシートへ移動 | チャット（主）+ 添削/ノート（補助）= 案 B | [High] |
| 2 | Material 3 **List-detail** + window size class — 同文書、.../use-window-size-classes | 840dp 以上で同時表示、狭くなると詳細だけを残す。幅の区間 600 / 840 / 1200 / 1600 | 質問 10 個のリスト + 選択した質問の詳細 = 案 A、ブレークポイントの根拠 | [High]（リスト固定幅・詳細可変幅の慣例は [Medium]: SAP Fiori のミラー） |
| 3 | **GOV.UK Design System** Layout — design-system.service.gov.uk/styles/layout/ | 最大 1020px、本文は常に 2/3 列、行 75 字以下。「広い画面で行が長くなるのを防ぐ」 | テキスト列の上限原則全体 | [High] |
| 4 | **Claude Artifacts** — support.claude.com/en/articles/9487310 | 成果物が会話の横の専用ウィンドウに開く。会話（過程）と結果（文書）を分離 | 会話 = チャットの流れ、結果 = 模範スクリプト・添削文書 | [High] |
| 5 | **ChatGPT Canvas** — openai.com/index/introducing-canvas | 別ウィンドウに文書を置き、「編集者・コードレビュアーのように」インラインでフィードバック、区間のハイライト、バージョンの巻き戻し | 回答上のインライン添削、1 回目↔2 回目の比較 | [High] ウィンドウ分離 / [Medium] 左右配置 |
| 6 | **Grammarly Editor** — support.grammarly.com/hc/en-us/articles/360003474732 | 文書本文が左、提案カードが右、上から順に案内 | 添削ウィンドウ: 本文 ↔ 修正理由 | [Medium] |
| 7 | **DeepL Write** — support.deepl.com/hc/en-us/articles/11673757647388 | 左に原文 / 右に改善文、変更は緑、"Show changes" トグル、"Corrections only" モード | before → after、ルール外の修正禁止の原則と同じ方向性 | [Medium]（公式ページ 403、検索要約） |
| 8 | **Google Docs 提案モード** — support.google.com/docs/answer/6033474 | 提案は新しい色、削除は取り消し線。提案にコメントで理由を添付 | 添削表記: 削除の取り消し線 + 挿入の強調 + 一行の理由 | [High] 表記 / [Low] 余白コメントの位置 |
| 9 | **GitHub PR diff** — docs.github.com/.../reviewing-proposed-changes-in-a-pull-request | unified / split の選択（選択を保持）、ファイルツリーで移動、行単位のコメント | 1 回目 vs 2 回目の回答の split 比較（`.cmp-answers`）、質問リスト = ファイルツリー | [High] |
| 10 | **Microsoft Reading Coach** — support.microsoft.com/en-us/education/use-reading-coach-in-immersive-reader | 音読の後に速度・正確さを報告、間違えた単語のリストを選んで聞いて練習 | 🎤 音読の結果: ずれた単語の強調 + もう一度聞く | [Medium] |
| 11 | **Satori Reader** — satorireader.com | 漢字 / かな / 漢字+ふりがな の表示切り替え、音声・翻訳・文法解説付き | 模範スクリプトの読み表示切り替え = 案 C | [High] 表示モード / [Low] レイアウトの詳細 |
| 参考 | MDN `<ruby>` — developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/ruby | 東アジアの文字の発音注釈の標準要素、2015-07 から Baseline | 案 C の実装手段 | [High] |

共通パターンのまとめ [Medium: 上記 11 種からの帰納]
1. **背景色の代わりに線**: 領域は 1px の区切り線と余白で分け、カードの影・浮いた島は使いません。
2. **テキスト列の上限 + 横のウィンドウ**: 行は短く、幅はウィンドウの数で活かします。
3. **余白注釈（margin note）**: 理由・ルール番号を本文の横に付け、本文の流れを途切れさせません（Docs・Grammarly・GitHub）。
4. **変更表記の慣例**: 削除 = 取り消し線、挿入 = 強調色、理由 = 一行。
5. **固定ヘッダ・入力行**: 上部バーと入力行だけを固定し、残りは各ウィンドウが個別にスクロール。

## 4. 現在の UI の診断 → 変更箇所

| ユーザーの要求 | 原因（現在の CSS） | 変更の方向 |
|---|---|---|
| 島 UI の除去 | `.msg` の 18px 角丸吹き出し・82% 幅、`--chat:#8cabd8` の青い背景、`.cmp-answer` のグレーの箱、`.tour` の影、`.app` の 560px 中央固定 | 白背景、吹き出しのない**フラットな行**（話者ラベル + 上側 1px の区切り線）。すでに `.q` がこの方式（`border-top:1px solid #eee`） |
| アイコン背後のパステルの箱の除去 | `.script .listen` の円形 `--green-soft`、`.tag` の薄緑の背景、`.mic` の枠線の箱、`.note.msg` の黄色い背景 | 背景のないアイコン + 文字ラベル。状態は色付きの文字・線で表示 |
| デュオトーンアイコン 1 種 | 絵文字 🔊 🎤 📎 ⚙ ✓ ✗ の混在（OS ごとに形・色が異なる） | **Phosphor Icons Duotone** 1 種に統一（下記） |
| デスクトップの全幅 | `--chat-w:560px`、`--panel-w:400px` の固定、`.bar` の `margin-inline: calc(...)` による中央寄せの回避策 | `minmax()` の可変列、最大 1600px、`.bar` の回避策を削除 |

**アイコンの選択: Phosphor Duotone** [High: README]
- 6 種類の太さ（Thin・Light・Regular・Bold・Fill・**Duotone**）、MIT ライセンス、1,248 個。
- CSP が `script-src 'self'; style-src 'self'` のため、CDN の Web フォントの代わりに**必要な SVG 10 個ほどだけをリポジトリにコピー**（インライン `<svg>` または同一オリジンのスプライト）。README に MIT を表記。[High: `vercel.json` で確認 / Medium: 大会の「権利のあるコードのみ」規則に MIT の資産が該当するという解釈]
- 色は `currentColor` の 1 色（本文 `#1f1f1f` または `--green-ink`）。淡い面のレイヤーは装飾。
- Font Awesome Duotone は有料（Pro）のため除外。[Medium]

**ビジュアルトークンの提案** [Medium: 上記の基準から導出]
- 背景 `#fff`、本文 `#1f1f1f`、補助 `#5c5c5c`(6.69:1)、区切り線 `#e5e5e5`、強調 `--green-ink #047a35`（既存、白地で 5.47:1）、エラー `#b00020`。影 0、角丸は入力欄・ボタンのみ 6px。
- サイズ: UI・韓国語本文 16px / lh 1.6、補助 14px / lh 1.5、**日本語スクリプト 18px / lh 1.85**、読み（発音）15px。

## 5. 改修案 3 種

共通の前提 [High: `public/app.js` で確認]
- 段階の状態は `stage` 文字列（code → mail → pick ⇄ answer, profile）と `#composer` の送信一つで回っています。キー処理は `#input` の keydown(Ctrl/Cmd+Enter → `requestSubmit`)で、Enter は既定の改行です。**3 案ともこの二点には手を付けません。**
- モバイル 390px は、現在と同じく単一列 + 全画面パネル（`panel.js` の inert 処理）を基準とします。

### 案 A — 3 カラムの作業スペース（質問リスト | 回答・スクリプト | 添削）

ベンチマーク: Material list-detail、GitHub のファイルツリー + diff。

1440px
```
+------------------------+----------------------------------------------+--------------------------+
| (o) Mensetsu Coach   ACME Corp / Backend Eng.      [JP v] [KO v] [gear] [End]                    |
+------------------------+----------------------------------------------+--------------------------+
| QUESTIONS 10           | Q3  Tenshoku riyuu (why change jobs)         | Review | Notes           |
|                        |                                              | ------------------------ |
|   1 Self-intro    [ok] | YOUR ANSWER (1st)                            | STRUCTURE 3/4            |
|   2 Motivation    [ok] | JA answer text ............ (<=40em)         | [ok] Restate             |
| > 3 Why change    [..] | ..................................           | [ok] Conclusion          |
|   4 Strength      [  ] | -------------------------------------------- | [x]  Basis/number        |
|   5 Weakness      [  ] | MODEL SCRIPT                    [spk]        |      > hint line         |
|   6 ...                | JA script 18px / lh 1.9 ............         | [ok] Options             |
|                        | reading (hangul/romaji) 15px .......         | ------------------------ |
|                        | translation 15px muted ..............        | CORRECTIONS 2            |
|                        | points: - ... - ...                          | - sasete itadaku         |
|                        | [mic] Read aloud  -> 12/14 matched           | + itashimasu             |
|                        |                                              |   why: over-humble       |
| [Paste new mail]       | -------------------------------------------- | BEFORE | AFTER  (split)  |
|                        | Enter=newline  Cmd/Ctrl+Enter=send           |                          |
|                        | [clip] [ textarea .............. ] [mic]     |                          |
|                        |                               [Send]         |                          |
+------------------------+----------------------------------------------+--------------------------+
|   280px fixed          |   1fr  (text capped 40em ~ 640px)            |   440px                  |
```

390px — list-detail の規則どおり、リスト → 詳細画面の切り替え（戻る）
```
+--------------------------------------+
|  (o) Coach             [KO v] [gear] |
+--------------------------------------+
|  QUESTIONS 10                        |
|  1 Self-intro                 [ok]   |
|  2 Motivation                 [ok]   |
|  3 Why change                 [..]   |
|  ...                                 |
+--------------------------------------+
|  tap a row -> detail screen:         |
+--------------------------------------+
|  < Back      Q3 Why change           |
| ------------------------------------ |
|  YOUR ANSWER ....................    |
|  STRUCTURE 3/4  [x] Basis            |
|  CORRECTIONS 2 (before/after)        |
|  MODEL SCRIPT              [spk]     |
|  ...............................     |
+--------------------------------------+
|  [clip] [ textarea ....... ] [mic]   |
|  Cmd/Ctrl+Enter=send     [Send]      |
+--------------------------------------+
```

- code・mail の段階には質問がないため、中央のウィンドウだけが見える状態（左右は空のウィンドウ）を別途用意する必要があります。

| | 長所 | 短所 |
|---|---|---|
| 可読性 | 質問の文脈が常に見える。中央のテキスト列の 40em 上限を守りやすい | 3 列のため、1024–1199px では 2 列に畳む必要がある |
| コード | 進捗表示（[ok]/[..]）が自然 | 質問の選択が現在は**番号入力**（`onPick(text)` が `Number(text)` でパース）→ リストのクリックをつなぐ JS が必要。チャットログの代わりに質問ごとの詳細にレンダリングするよう `render.js` の対象を変更。チャットの流れがなくなり「チャットコーチ」としてのアイデンティティが弱まる |

### 案 B — チャットの流れ + 文書型の添削ウィンドウ（余白注釈）★推奨

ベンチマーク: Material supporting pane、Claude Artifacts、Grammarly、Google Docs 提案モード、GitHub split diff。

1440px
```
+----------------------------------------+---------------------------------------------------------+
| (o) Mensetsu Coach   ACME Corp / Backend Eng.      [JP v] [KO v] [gear] [End]                    |
+----------------------------------------+---------------------------------------------------------+
| CHAT (flat rows, no bubbles)           | REVIEW  |  NOTES                      Q3 Why change     |
| -------------------------------------- | ------------------------------------------------------- |
| COACH                                  | 1  STRUCTURE 3/4                  | MARGIN NOTE         |
| Q3. Tenshoku riyuu o oshiete ...       |    [ok] Restate [ok] Conclusion   |                     |
| -------------------------------------- |    [x] Basis/number [ok] Options  | add 1 number        |
| YOU                                    | ----------------------------------+-------------------- |
| JA answer text, max 40em ...           | 2  CORRECTIONS 2                  |                     |
| ..............................         |    - sasete itadaku               | over-humble,        |
| -------------------------------------- |    + itashimasu                   | rule #12            |
| COACH                                  | ----------------------------------+-------------------- |
| Review ready -> right pane  [open]     | 3  MODEL SCRIPT          [spk]    | point 1             |
|                                        |    JA 18px / lh 1.9 ......        | point 2             |
|                                        |    reading 15px ..........        |                     |
|                                        |    translation 15px muted         |                     |
|                                        |    [mic] Read aloud -> 12/14      |                     |
|                                        | ----------------------------------+-------------------- |
|                                        | 4  BEFORE (1st)          | AFTER (2nd)                  |
| -------------------------------------- |    [x][x][-][x]          | [ok][ok][ok][ok]             |
| Enter=newline Cmd/Ctrl+Enter=send      |                                                         |
| [clip][ textarea ......... ][mic]      |                                                         |
|                          [Send]        |                                                         |
+----------------------------------------+---------------------------------------------------------+
|   minmax(420px, 2fr) ~ 520px           |   minmax(560px, 3fr) ~ 920px = 640 body + 260 notes     |
```

390px — 現在の構造のまま（フラットな行 + 全画面の添削シート）
```
+--------------------------------------+
|  (o) Coach   [Review] [KO v] [gear]  |
+--------------------------------------+
|  COACH                               |
|  Q3. Tenshoku riyuu o ...            |
| ------------------------------------ |
|  YOU                                 |
|  JA answer text ................     |
| ------------------------------------ |
|  COACH  structure 3/4, 2 fixes       |
|  [Open review]                       |
+--------------------------------------+
|  [clip] [ textarea ....... ] [mic]   |
|  Cmd/Ctrl+Enter=send     [Send]      |
+--------------------------------------+
|  [Open review] -> full-screen sheet: |
+--------------------------------------+
|  Review | Notes            [Close]   |
| ------------------------------------ |
|  1 STRUCTURE ...                     |
|  2 CORRECTIONS                       |
|    - before / + after                |
|    > why: margin note goes below     |
|  3 MODEL SCRIPT        [spk] [mic]   |
+--------------------------------------+
```

- 添削ウィンドウ内は 2 列グリッド: 本文の列 `minmax(0, 40em)` + 余白注釈 260px（修正理由・ルール番号・ポイント）。1280px 未満では注釈が本文の下に移ります。
- ≥1024px ではパネルを**既定で開いておき**、添削前は「回答するとここに添削が表示されます」という空状態の文言を置きます（現在は最初の添削時に自動で開く）。

| | 長所 | 短所 |
|---|---|---|
| 可読性 | 会話（短い文）と結果（長い文）を分離。結果側が広く、余白注釈で理由を本文の外に置ける。before/after の split をそのまま活用 | チャット側の質問原文と添削ウィンドウが離れているため視線移動が生じる → 添削ウィンドウの先頭に「Q3 …」を固定表示して補う |
| コード | `.app` の 2 列グリッド、`#panel` の 2 列配置、`panel.js` の `wide` メディアクエリ・モバイルの inert ロジック、段階の状態を**すべて維持**。主な作業は `style.css` の書き直し + `index.html` のアイコン置き換え + パネルの既定オープン（`panel.js` 数行） | `test/ui/layout.test.js` がチャット列の **560px** と「最初の添削で自動オープン」をアサート（40・60 行目）→ 意図の変更（固定幅 → 可変幅、自動オープン → 既定オープン）を明示してテストの修正が必要 |

### 案 C — 2 カラムのリーダー（ふりがなスクリプト | コーチング）

ベンチマーク: Satori Reader、MDN `<ruby>`、Microsoft Reading Coach。

1440px
```
+----------------------------------------------------------+---------------------------------------+
| (o) Mensetsu Coach   ACME Corp / Backend Eng.      [JP v] [KO v] [gear] [End]                    |
+----------------------------------------------------------+---------------------------------------+
| < Q2   Q3 / 10  Why change   Q4 >      [ruby on/off]     | COACHING                              |
| -------------------------------------------------------- | ------------------------------------- |
|   kana    kana        kana                               | STRUCTURE 3/4                         |
|   KANJI wa KANJI-KANJI o ...   (20px, lh 2.2)            | [ok][ok][x][ok]  Basis/number         |
|   kana        kana                                       | ------------------------------------- |
|   KANJI KANJI-KANJI ............                         | CORRECTIONS 2                         |
|   (reader column capped 36-40 zenkaku)                   | - sasete itadaku  + itashimasu        |
|                                                          |   why: over-humble                    |
|   translation (toggle) ..............                    | ------------------------------------- |
|   [spk] Listen 0.8x/1x  [mic] Read aloud                 | BEFORE / AFTER                        |
|   -> mismatched words underlined in red                  | ------------------------------------- |
|                                                          | NOTES (this question)                 |
| -------------------------------------------------------- | [ textarea .......................]   |
| History (chat, collapsed) [v]                            | ------------------------------------- |
| [clip][ answer textarea ................ ][mic] [Send]   |                                       |
+----------------------------------------------------------+---------------------------------------+
|   1fr (reader, max 40em at 20px ~ 800px)                 |   420px                               |
```

390px — リーダーが上、コーチングは折りたたみリスト、入力行は固定
```
+--------------------------------------+
|  (o) Coach   Q3/10 < >   [gear]      |
+--------------------------------------+
|   kana  kana                         |
|   KANJI wa KANJI o ... (18px)        |
|   translation ........               |
|  [spk] Listen     [mic] Read aloud   |
+--------------------------------------+
|  COACHING (accordion)                |
|  > Structure 3/4                     |
|  > Corrections 2                     |
|  > Before/After                      |
|  > Notes                             |
+--------------------------------------+
|  [clip] [ textarea ....... ] [mic]   |
|  Cmd/Ctrl+Enter=send     [Send]      |
+--------------------------------------+
```

| | 長所 | 短所 |
|---|---|---|
| 可読性 | 読む対象（スクリプト）が主役。20px / lh 2.2（ルビ行を含む）で音読練習に最適。ずれた単語を本文の上に直接表示 | チャット履歴が畳まれ、「何を聞かれ何と答えたか」の流れが弱まる |
| コード | `<ruby>` はすべてのブラウザが対応 | 現在の応答は文単位の `kana`（ひらがな全体）と `reading`（ハングル/ローマ字変換、`lib/kana.js`）のみで、**漢字ごとに対応付けた読みがない** → `lib/script.js` のスキーマ・プロンプト変更、`npm run test:live` の再実行（クレジット）、スナップショット（`test/snapshots/*`）の更新。段階の UI もリーダー中心に再配置 |

## 6. 比較と推奨

| 基準 | A 3 カラム | **B チャット+文書** | C リーダー |
|---|---|---|---|
| 1440px 幅の活用 | 高い | 高い | 中程度 |
| 日本語本文の可読性 | 高い | 高い | 非常に高い |
| 段階・キー処理の保持 | JS の変更が必要 | **そのまま** | 再配置が必要 |
| バックエンド・プロンプトの変更 | なし | **なし** | あり |
| 変更されるファイル | css, html, app.js, render.js, panel.js, テスト | **css, html（アイコン）, panel.js の一部, layout テスト** | css, html, app.js, render.js, lib/script.js, スナップショット |
| 11/8 締め切りのリスク | 中 | **低い** | 高い |

**推奨: B。** [Medium: 日程・コード範囲から導出]
1. 第 1 段階（B 本体）: 白背景・フラットな行・区切り線、Phosphor Duotone アイコン、可変 2 列（`minmax(420px,2fr) minmax(560px,3fr)`、最大 1600px）、添削ウィンドウの本文 40em + 余白注釈、文字サイズの下限 14px、日本語 18px / lh 1.85。
2. 第 2 段階（任意、≥1200px）: A の質問リストを折りたたみ式の細い帯として左に追加。クリックは既存の `onPick` に番号文字列を渡す方式にすれば、段階のロジックを修正せずに付けられます。[Medium]
3. 第 3 段階（締め切り後）: C のルビ表示を、添削ウィンドウの「模範スクリプト」セクションの表示切り替えとして取り込む（スキーマの拡張が必要）。

着手前に決定が必要なこと
- LINE 風のアイデンティティ（緑のバー・吹き出し）を捨てることに同意するか。上部バーの緑の背景も「パステルの箱」と同じ装飾とみなすか（提案: 白いバー + 緑は強調の文字・ボタンにのみ）。
- レイアウトテストの 560px のアサートを、可変幅のアサート（例: チャット列 ≥420px、パネルがチャットの右、各テキスト列 ≤40em）に変えること。

## 7. 限界・未確認

- NHK NEWS WEB EASY（ふりがな・音声ニュース）は利用同意のゲートのため本文の確認に失敗 → ベンチマークから除外。[Unknown]
- DeepL Write の公式ヘルプは 403(Cloudflare)で直接確認できず、検索要約のみを使用。[Medium]
- Google Docs のコメントが「本文の右余白」に付く点は公式文書で確認できず（「右上のすべてのコメントを表示」のみ確認）。[Low]
- 韓国語本文のサイズ・行間の公式数値（KRDS）は未確認。WCAG の 1.5 以上と DADS の 16px 下限を韓国語にも適用することで代替。[Medium]
- ChatGPT・Claude Web のチャット列の実際の px 値は公式文書がないため引用していません。
- ワイヤーフレームは位置合わせのため ASCII（英語ラベル）で描きました。実際の画面の文言は i18n キーに従います。

## 出典

- W3C WCAG 2.2 Understanding SC 1.4.8 Visual Presentation — https://www.w3.org/WAI/WCAG22/Understanding/visual-presentation
- W3C JLREQ (Requirements for Japanese Text Layout) — https://www.w3.org/TR/jlreq/
- デジタル庁デザインシステム Typography — https://design.digital.go.jp/dads/foundations/typography/
- SmartHR Design System Typography — https://smarthr.design/products/design-tokens/typography/
- Baymard, Line Length Readability — https://baymard.com/blog/line-length-readability
- GOV.UK Design System Layout — https://design-system.service.gov.uk/styles/layout/
- Android canonical layouts — https://developer.android.com/guide/topics/large-screens/large-screen-canonical-layouts
- Android window size classes — https://developer.android.com/develop/ui/compose/layouts/adaptive/use-window-size-classes
- Claude Artifacts ヘルプ — https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them
- OpenAI, Introducing canvas — https://openai.com/index/introducing-canvas/
- Grammarly Editor ヘルプ — https://support.grammarly.com/hc/en-us/articles/360003474732
- DeepL Write ヘルプ — https://support.deepl.com/hc/en-us/articles/11673757647388-Use-DeepL-Write
- Google Docs 提案モード — https://support.google.com/docs/answer/6033474
- GitHub, Reviewing proposed changes in a pull request — https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/reviewing-proposed-changes-in-a-pull-request
- Microsoft Reading Coach — https://support.microsoft.com/en-us/education/use-reading-coach-in-immersive-reader
- Satori Reader — https://www.satorireader.com/
- MDN `<ruby>` — https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/ruby
- Phosphor Icons README — https://github.com/phosphor-icons/homepage
