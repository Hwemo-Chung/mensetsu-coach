# デュオトーンアイコン統一案（調査 + PoC、2026-11-03）

結論: **Phosphor Icons duotone**(MIT)を採用します。`public/icons.svg` の単一スプライト + `<svg><use href="/icons.svg#id"/></svg>` が、現在の CSP(`default-src 'self'; style-src 'self'`)の下で違反 0 件でレンダリングされることを確認しました。リポジトリのコードはまだ変更していません。

## 1. 候補の比較（ライセンスは公式リポジトリの原文で確認）

| セット | ライセンス（確認場所） | デュオトーンの標準提供 | 判定 |
|---|---|---|---|
| **Phosphor** | MIT, `phosphor-icons/core/LICENSE` | あり（`assets/duotone/`、6 種類の太さの一つ） | **採用** |
| Tabler | MIT | なし（`icons/outline`、`icons/filled` のみ） | 除外 |
| Iconoir | MIT | なし（`regular`, `solid`） | 除外 |
| Heroicons | MIT | なし（`16/20/24` solid・outline） | 除外 |
| Lucide | ISC | なし（線アイコンの単一スタイル） | 除外 |
| Remix Icon | 独自ライセンス "Remix Icon License v1.0"(2026-01)、表記は任意、アイコン単体の販売禁止 | なし（line/fill） | 除外 |
| Material Icons Two Tone | Apache-2.0, `google/material-design-icons/LICENSE` | あり（`materialiconstwotone`、ティント `opacity=".3"`） | 次善。Material Symbols には two-tone がなく、旧版の Icons にのみあります。空の `<rect fill="none">` など不要な要素が多く、スタイルが当方の UI に比べて硬めです |
| Solar (480 Design) | **[Unknown]** 公式リポジトリ `480-Design/Solar-Icon-Set` に LICENSE ファイルがありません（GitHub license API 404、README にもライセンスの記載なし）。CC BY 4.0 という話は第三者の情報源のみです | あり（Line Duotone, Bold Duotone） | 権利確認不可のため除外 |
| Hugeicons | 無料版 MIT(`hugeicons/hugeicons/LICENSE.md`) | 無料版は "Stroke Rounded" のみ、Duotone/Twotone は Pro 有料ライセンス（README の Free & Pro 表） | 除外 |
| Streamline | 公式 GitHub リポジトリがなく原文を確認不可 | — | 除外 |

## 2. Phosphor デュオトーン SVG の構造

- すべてのファイルが同じ形です: `<svg viewBox="0 0 256 256" fill="currentColor">` の中に**パスが 2 つ**あり、1 番目のパスは `opacity="0.2"`（ティント面）、2 番目のパスは不透明（輪郭線）です。ビルドスクリプトで PoC の 22 個すべてがこの形であることを確認しました。
- そのため `color` を一つ指定するだけで「主色 + 同色 20% のティント」が自動的に得られます。
- 基準グリッドは 256（16px の倍数）で、20px・24px のどちらも鮮明です（スクリーンショット参照）。
- 出典の固定: `phosphor-icons/core` コミット `2b75f3ad12b420c9504ef05df8d2564a28f8500e`(package.json 2.1.1)、パスは `assets/duotone/<name>-duotone.svg` です。

## 3. README の表記文言（そのまま貼り付け）

```
Icons: Phosphor Icons (duotone), Copyright (c) 2023 Phosphor Icons — MIT License, https://github.com/phosphor-icons/core
The SVG paths in public/icons.svg are third-party assets (full licence text: public/icons.LICENSE.txt); only the sprite assembly was done during the contest.
```

MIT は著作権表示と許諾文（permission notice）の**両方**を複製物に含めることを求めています。したがって `phosphor-icons/core/LICENSE` の全文（約 1KB）を `public/icons.LICENSE.txt` として一緒に配布し、`icons.svg` の 1 行目に `<!-- Phosphor Icons (MIT) — see /icons.LICENSE.txt -->` コメントを入れ、README に上記の文言を置きます。著作権者の表記は LICENSE 原文の "Phosphor Icons" です [High]。制作者個人の名前は公式 README で確認できなかったため入れていません。

## 4. アイコン対応表

現在の UI 全体を確認した結果です（index.html, render.js, voice.js, app.js, i18n/*.js, export.js。panel.js・demo.js にはアイコングリフがありません）。

| スプライト id | Phosphor 名 | 置き換え対象（現在） | 場所 |
|---|---|---|---|
| `speaker` | `speaker-high` | 🔊 スクリプトを聞く | voice.js:27 `.listen` |
| `stop` | `stop` | ⏹ 再生・録音の停止 | voice.js:27, 238 |
| `mic` | `microphone` | 🎤 音声で答える | index.html `#mic`, voice.js:238 |
| `record` | `record` | ● 録音中タイマー | voice.js:272 |
| `attach` | `paperclip` | 📎 ファイル添付 | index.html `.attach`（i18n askMail の文中の 📎 も該当） |
| `file` | `file-text` | 📄 添付ファイルのチップ・吹き出し、保存完了 | app.js:172, 258, i18n `export.saved` |
| `close` → `x` 推奨 | `x-circle` | × 添付チップの削除 | index.html `#chipX` |
| `settings` | `gear` | ⚙ オプション | index.html `#opts` |
| `check` | `check-circle` | ✓ 段階を満たす / 質問に答えた | render.js:103, 118, 125 |
| `x` | `x-circle` | ✗ 段階の欠落 | render.js:103, 125 |
| `warning` | `warning` | ⚠ 質問に答えていない、口ぐせの警告 | render.js:118, 153 |
| `question` | `question` | ? 判断不可 | render.js:118 |
| `habits` | `chart-bar` | 📊 今日の口ぐせ | i18n `habits.title` |
| `play` | `play` | ▶ 1 分ツアー、次へ ▶ | i18n `demo.button`, `next` |
| `tip` | `lightbulb` | 💡 逆質問のヒント | i18n `reverse.tip` |
| `notes` | `note-pencil` |（新規）ノートタブ | `#tabNotes` |
| `compare` | `arrows-left-right` |（新規）最初の回答 ↔ 修正後の回答の比較 | render.js compare カードのタイトル |
| `send` | `paper-plane-right` |（新規）送信 | `#send` |
| `panel` | `sidebar-simple` |（新規）添削・ノートパネルを開く | `#panelToggle` |
| `globe` | `globe` |（新規）説明言語 | `#lang` の横 |
| `flag` | `flag` |（新規）目標の国 | `#dest` の横 |
| `download` | `download-simple` |（新規）終了・保存 | `#end` |

- 注意: 素の `check`・`x` のデュオトーンは**ティントが四角い箱**です（PoC の `close` 欄を参照）。「パステルの箱なし」という要件に合わないため、✓/✗/× はすべて円形（`check-circle`, `x-circle`）を使います。
- 変更しないもの:
  - 🇯🇵🇰🇷🇺🇸🇬🇧🌏 は `<option>` のテキスト内にあるため SVG を入れられません。`<select>` の前に `flag` アイコンを置き、オプションの国旗はそのまま残すか削除します。
  - ①②③、↗↘《》/、→、【】はアイコンではなく表記記号です。
  - export.js の Markdown 出力（✓ ✗ ⚠）はテキストファイルなのでそのまま残します。
- i18n の文中の絵文字（📎 askMail、📄 saved、💡 tip、📊 habits.title、▶ demo）は `textContent` で入るため、文字を変えるだけでは SVG になりません。文字列から絵文字を外し、render.js・app.js で `<svg>` ノードを前に付ける必要があります（作業範囲は DOM 生成コード）。
- test/ui/flow.test.js:55 が `✗ 復唱` のテキストで欠落段階を探しています。✗ を SVG に変えると、このテストを `.step.miss` + 段階名の基準に変える必要があります。意図（欠落段階の表示）はそのままで、表現だけが変わります。

## 5. CSS・マークアップの方式

推奨（A 案、最も単純な方法です。実測は Chrome でのみ行いました。同一オリジンの外部 `<use href>` と `currentColor` は最新の Safari・Firefox もサポートしていると認識しています [Medium]。PoC は旧版 Safari で差が出る `xlink:href` ではなく `href` を使いました）:

```html
<button type="button" id="mic" class="ib" data-i18n-label="mic.start"><svg class="i" aria-hidden="true"><use href="/icons.svg#mic"/></svg></button>
```

```css
.i { width: 1em; height: 1em; fill: currentColor; flex: none; vertical-align: -0.15em; }
.ib { display: inline-grid; place-items: center; min-width: 44px; min-height: 44px; border: 0; background: none; color: var(--green-ink); font-size: 24px; }
.ib[aria-pressed="true"] { color: var(--green); }   /* 再生中: 背景の代わりに色とアイコン(stop)で状態を表示 */
.mic.rec { color: #b00020; }                         /* 録音中: 赤 + record/stop アイコン */
.ib:focus-visible { outline: 2px solid var(--green-ink); }
```

- サイズは `font-size`、色は `color` だけで調整します。ティントは同色 20% で自動生成されます。
- **パステルの箱の削除対象**: `.script .listen` の `background: var(--green-soft)`・`[aria-pressed] #cdeedb`、`.mic` の枠線・`.rec #fff3f3`、`.end[aria-expanded="true"]` の `--green-soft`。箱をなくすと状態が見えなくなるため、上記のように `color` + アイコンの切り替え（speaker↔stop、mic↔stop）で代わりに表示します。
- アクセシビリティ: 絵文字がなくなるとボタンのアクセシブルな名前がなくなります。`<svg aria-hidden="true">` とし、アイコンだけのボタンには必ず `aria-label` を付けます。`#mic`・`.listen` は voice.js:25, 236 ですでに設定しており、`#opts`・`.attach`・`#chipX` は既存の `data-i18n-label` 方式をそのまま使います（i18n テストがキーの欠落を検出してくれます）。
- 状態の切り替えは `use.setAttribute("href", "/icons.svg#stop")` の 1 行で済みます（現在の `textContent = on ? "⏹" : "🔊"` の箇所）。

ティント色を個別に決めたい場合（B・C 案、任意）:

| 方式 | 方法 | Chrome の結果 |
|---|---|---|
| B | スプライトのティントパスに `fill="var(--duo, currentColor)" opacity="var(--duo-o, 0.2)"` のプレゼンテーション属性 | 動作する、CSP 違反 0 |
| C | スプライト内の `<style>.duo{fill:var(--duo,currentColor);opacity:var(--duo-o,.2)}</style>` | 動作する、CSP 違反 0（外部 `<use>` のリソース文書には `style-src` が適用されない） |

B・C は Chrome でのみ確認しました。Safari・Firefox でのプレゼンテーション属性内の `var()` サポートは確認していません [Low]。そのため A 案を標準として推奨します。

## 6. PoC と検証結果

- 場所: `/private/tmp/claude-501/-Users-solution-Documents-BuiltWithClaude-2026/4d9cb204-8e55-4dca-ac92-8bb27e2c416f/scratchpad/icons-poc/`
  - `build.mjs`: 固定コミットの SVG 22 個からスプライト 3 種（A/B/C）を作ります。ティントレイヤーがなければ失敗します。
  - `server.mjs`: vercel.json と同じ CSP・nosniff ヘッダを付け、`.svg` は `image/svg+xml` で送ります。
  - `shot.mjs`: Playwright(Chrome headless)で検査し、スクリーンショットを撮ります。
- スクリーンショット: `/private/tmp/claude-501/-Users-solution-Documents-BuiltWithClaude-2026/4d9cb204-8e55-4dca-ac92-8bb27e2c416f/scratchpad/icons-poc/poc.png`（20/24px × primary #047a35 / neutral #222 × A/B/C、および背景の箱のないボタンのモックアップ）
- 測定結果 [High]:
  - すべての応答に CSP ヘッダが付き、`icons*.svg` は 200 `image/svg+xml` で応答しました。
  - `securitypolicyviolation` 0 件、`<use>` 275 個すべてが bbox > 0 でした。
  - 96px の stop アイコン中央ピクセルの測定値:
    - A = rgb(205,228,215): #047a35 20% を白地に合成した計算値と一致します。
    - B = C = rgb(168,235,195): #06c755 35% と一致します。つまり `var()` が実際に適用されました。
  - コンソールエラーは、PoC に favicon がないことによる 404 の 1 件のみです。
- **適用時の必須修正**: リポジトリの `dev.js:40` の `TYPES` に `.svg` がないため、ローカルサーバーが `application/octet-stream` で応答します。この状態では nosniff のために `<use>` が警告なしに空に見える可能性があるため、`".svg": "image/svg+xml"` の 1 行を追加する必要があります。この影響は実測しておらず推論です [Medium]。Vercel の静的配信は拡張子で MIME を決めるため、デプロイ環境では問題ないと見ています [Medium]。
