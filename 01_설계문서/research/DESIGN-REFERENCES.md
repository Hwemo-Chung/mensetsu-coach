# デザインリファレンス 5 選（Refero Styles 基準）

作成 2026-11-03。出典: https://styles.refero.design/ (Refero Styles, Beta)。確定した方向性（レイアウト B: 左にチャットのフラットな行 + 右に文書型の添削パネル、白い上部バー、緑 #047a35 は強調専用、Phosphor duotone、パステルの箱・島 UI 禁止、可読性優先）に合わせて選んだ参考資料です。コードの変更はありません。

## 1. サイトとは何か、どう順位を付けているか

- 各項目は、実在の製品 Web サイト 1 つを測定して作られた「スタイルページ」です。色（hex・役割）、タイプスケール、余白、角丸、影、コンポーネント説明、Do/Don't、DESIGN.md・Tailwind・CSS 変数のエクスポートを提供しています。[High]
- ページ自身が「測定値は正規化、役割・推奨は解釈、HTML 例は再構成」と明記しています。そのため本文書の **hex・px 値は [High]、役割の説明と Do/Don't は [Medium]** とみなします。
- ホームには "2,000+" とありますが、`sitemaps/styles.xml` には **1,342 件**があります。この 1,342 件すべてのタイトル・メタ説明を収集して分類しました。[High]
- 順位のシグナル: ホームの `?sort=popular` 上位 20 は Dala, Mercury, Linear, ORYZO AI, Apple, Steep, Notion など、視覚的に強いランディングページが中心です。閲覧数・保存数のような数値は公開されていません。サイト側のキュレーションのシグナルは `/design-styles/*` コレクションページのみで、今回の 5 選のうち Vercel・Mintlify は devtools コレクションに入っています。[High]
- したがって本文書の「上位 1%」はサイトの順位ではなく、**以下の基準で 1,342 件から 5 件（0.37%）を選んだ結果**です。サイトの人気順位と同じだとは主張しません。[High]

## 2. 選定基準（すべて満たすこと）

1. **単一の強調色が当方の緑と両立**: 無彩色 + 強調色 1 つで、その強調色が緑・青緑系か、そもそもないこと。
2. **箱なしで階層**: 影・パステルの面・浮いた角丸カードの代わりに、1px のヘアライン、太さ・サイズの対比、明度（バリュー）の差で構造を作ること。
3. **本文の太さ ≥ 400**: 300 のような細い太さがアイデンティティのシステムは、日本語 18px のスクリプトで線がかすむため除外。
4. **フォントを当方で使える**: OFL またはシステムフォントで代替可能。CSP が `default-src 'self'` のため外部フォントホストは不可で、セルフホストのみ可能。
5. **文書・エディタの品質**: 長文、校正、文書を読む文脈に近いこと。

## 3. 候補 17 件と落選理由

| 候補 | 結果 | 理由 |
|---|---|---|
| Vercel | **選定** | 下記参照 |
| Mintlify | **選定** | 下記参照 |
| ElevenReader | **選定** | 下記参照 |
| Grammarly | **選定** | 下記参照 |
| Literal | **選定** | 下記参照 |
| Stripe | 落選 | 全テキスト weight 300 がアイデンティティ（基準 3 違反）、強調色がインディゴ |
| Readwise | 落選（技法のみ参考） | 蛍光ペン #fff7ca の面による強調 = パステルの面。キャンバス #f1f5f8 の上にカードを置く構造。Charter は OFL ではない |
| Things | 落選 | 本文 #838b96 on #fff = **3.44:1**（4.5 未満）、傾けたモックアップ・重ねた影 |
| Notion | 落選 | 暖色のキャンバス + 原色のカード背景（sticky note） |
| Medium | 落選 | クリーム色のキャンバス #f7f4ed、エラーにも色を使わない規則（当方は校正の赤が必要）、プロプライエタリフォント |
| Kagi / Capacities / Steep | 落選 | パステルの製品パネル、24px 以上の角丸カード |
| Opennote / Heptabase / Typewolf | 落選 | アイボリー・エッグシェルのキャンバス、セピアの強調、プロプライエタリのセリフ体 |
| Tailwind CSS | 落選 | 96px/700 + シンタックスハイライトの多色 |
| Linear | 落選 | ダークテーマ |

## 4. 5 選

スクリーンショット（第三者のブランド資産を含む）は公開リポジトリには置かず、非公開フォルダにのみ保存しました: `../BuiltWithClaude-2026-private/internal-docs/design-refs/{vercel,mintlify,elevenreader,grammarly,literal}-refero.png`

### ① Vercel — 「紙に組版したターミナル」

- URL: https://styles.refero.design/style/f24daf3a-d43f-4dec-85a9-8ac1d5148a03
- なぜ最上位か: 装飾色 0%、ヘアラインとグレー 4 段階だけで階層を作る、最も厳格な無彩色システムです。唯一の有彩色が成功表示用の Terminal Green **#297a3a** なので、当方の #047a35 を「強調専用」で使う方向性と同じ文法です。[High]
- 取り入れるもの
  - テキストのグレー段階: #171717（本文・見出し） / #4d4d4d（補助本文） / #666666（キャプション） — 純黒 #000 の代わりに #171717。[High]
  - ヘアライン #ebebeb 1px。カードも影なしで 1px のリングだけで区別。[High]
  - 角丸 6px 以下、大きな角丸は禁止。[High]
  - ラベル・メタデータを等幅フォント（Geist Mono）で区別する方式 → 当方では「① 構成チェック」のようなセクションラベルと発音表記に応用。ただし元のデザインは 11–12px の大文字のため、当方の最小 14px の規則に合わせて 14px に上げます。[Medium]
- 余白: 4px ベース、密度 compact、4/6/8/12/14/16/20/24/32/40/44、カードのパディング 16px、セクション間隔 96–128px。[High]
- フォント: Geist Sans / Geist Mono = **SIL OFL 1.1**（github.com/vercel/geist-font LICENSE.txt で確認）、セルフホスト可能。ただしかな・ハングルがないためラテン専用です。[High]
- 真似しないもの: ▲ ロゴ、スペクトルのグラデーション、64px/-0.06em のような極端な字間（当方の画面にはヒーローがない）。

### ② Mintlify — 「単色の修道院に緑の一点」

- URL: https://styles.refero.design/style/80d7ef36-ed7e-48bb-b558-f772eb40106f
- なぜ最上位か: ドキュメント（Docs）製品なので、「読む画面」そのものが商品です。白いキャンバス + ほぼ黒 + 緑 1 色。緑は**アクティブ状態、リンク、アイブロウラベルにのみ**使い、ボタンの塗りや大きな面には使わないという規則が、当方の #047a35 の使用規則と同じです。右側の "On this page" 目次 = 当方の余白ノートの位置。[High]
- 取り入れるもの
  - アクティブ表示を「左側 2px の緑のバー + 太さ 500」で処理（サイドバーのアクティブ行）。背景の塗りなし。[Medium]
  - ボタン・入力の角丸 4px、主ボタンは緑ではなく**黒の塗り**(#08090a)。[High]
  - タイプスケール: 13 / 16 / 20 / 24 / 40px、本文 16px・1.5。当方は 13px を使わないため 14px で代替。[High]
  - ヘアライン #f2f2f2（ごく淡い）+ 入力の枠線 #dddddd。[High]
  - 余白: 4px ベース、comfortable、4/8/12/16/24/32/48/64/72/96、カードのパディング 24px、セクション 80px。[High]
- 注意: 元の Mint Green **#0c8c5e on #fff = 4.26:1** で、小さい文字の基準（4.5）を満たしません。色そのものではなく、「緑をどこにだけ使うか」だけを取り入れます。[High]
- フォント: Inter 単一 = **OFL、セルフホスト可能**。[High]
- 真似しないもの: ヒーローの手描きの雲のイラスト、グラデーション、16–24px のカード（島 UI）。

### ③ ElevenReader — 「新聞紙面のミニマリズム」

- URL: https://styles.refero.design/style/c51c8371-0e42-4bdf-9766-c9eac5eee9a5
- なぜ最上位か: 「読む」アプリであり、積み重なる行を**背景色・余白ではなく 1px #e5e5e5 の上下の線だけで**区切り、行と行の間隔は 0px です。レイアウト B 左側の「吹き出しのないフラットなチャット行」とまったく同じパターンです。本文 16px で行間を 1.40 未満に下げないという規則もあります。[High]
- 取り入れるもの
  - 行のパターン: 全幅、上下 1px の線、左右の線なし、パディング 16px 20px、兄弟要素の間隔 0。[High]
  - テキスト #000 / 補助 #6e6e6e(5.10:1)・#767676(4.54:1)。どちらも 4.5 以上ですが、#767676 は境界値です。[High]
  - 影は `0 1px 2px rgba(16,24,40,.05)` の一つだけ → 当方はこれも使いません。[High]
  - 余白: 4px ベース、8/12/16/20/24/28/32/40/44/60/64、カードのパディング 28px、要素間隔 8px、セクション 64px。[High]
- フォント: WaldenburgHF（プロプライエタリ）→ サイトが提示する代替の Bricolage Grotesque(OFL)も当方には不要。本文は Inter(OFL)。[High]
- 真似しないもの: ヒーローの緑→ラベンダーの放射状グラデーション、すべてのボタンが 9999px のピル型（当方の 4px 原則と衝突）。

### ④ Grammarly — 「思慮深い編集者の机」

- URL: https://styles.refero.design/style/be2af3f3-3886-4d70-973f-f7b5ab8d1a99
- なぜ最上位か: **校正製品**なので、当方と機能が最も近いです。90% 以上が無彩色、濃い青緑 1 色、影禁止、すべてのインタラクティブ要素の角丸が 8px の単一値。「編集作業スペース」をフラット・ヘアラインで作った事例です。[High]
- 取り入れるもの
  - グレーの段階: #545454（補助、7.57:1） / #707070（三次、4.95:1） / #d9d9d9（ヘアライン） / #ebebeb（淡いヘアライン） / #f5f5f5（hover の面）。[High]
  - 角丸を 1 つだけ使う規律（元は 8px → 当方は 4px）。[Medium]
  - ヒーローのサブタイトル最大幅 ~640px のように**段落幅を制限**。当方は CJK 40em。[High]
  - 強調色は主ボタン・リンク・アクティブなナビにのみ。カード・イラストの装飾は禁止。[High]
  - 余白: 8px ベース、8/16/24/32/40/48/64/80/96、カードのパディング 32px、要素間隔 8px。[High]
- フォント: matter, Glyph = **プロプライエタリ、使用不可**。サイトが提示する代替は Inter(OFL)、Manrope(OFL)。[High]
- 真似しないもの: Grammarly Teal #027e6f（ブランド固有色。当方は独自の緑を使用）、ロゴ、濃いエンタープライズ帯。

### ⑤ Literal — 「柔らかな日差しの閲覧室」

- URL: https://styles.refero.design/style/7e698bf6-6b31-40ed-a89a-40f4c37ade38
- なぜ最上位か: 読書製品で、唯一の有彩色が **Forest Green #278458**(4.64:1)の無彩色システムです。緑を主要アクションと星のグリフにのみ使い、装飾禁止、2 つ目の有彩色禁止。当方の「緑 = 強調専用」と同じ規則で、フォントが**すべて OFL** なのでそのまま採用できる唯一の候補です。[High]
- 取り入れるもの
  - 本文 #444340（暖かみのある濃いグレー、9.89:1）+ 見出し #000 の対比、ヘアライン #eeeeee。[High]
  - 角丸の規則「4px（ボタン・画像） / 8px（大きなブロック）のみ、6・12px のような中間値は禁止」。[High]
  - キャプション最小 14px、本文 16px・1.45。当方の「14px 未満禁止」と一致。[High]
  - 余白: 4px ベース、8/16/20/24/28/40/80、カードのパディング 20px、要素間隔 20px。[High]
  - 検索入力を枠線なしでナビに溶け込ませる処理 → 上部バーの入力に応用可能。ただし入力コントロールの境界は WCAG 1.4.11(3:1)を守る必要があるため、本文の入力欄には適用しません。[Medium]
- フォント: Inter + Libre Baskerville = **どちらも OFL**。ただし Libre Baskerville はラテン専用で、当方の見出しは大半が韓・日の文字なので採用しないことを推奨します。[High]
- 真似しないもの: 星のグリフ・ワードマーク、キャンバス #f8f8f8 + 白いカードの構造（島 UI）。

### 補助技法: Readwise の蛍光ペン（選定外）

- URL: https://styles.refero.design/style/34c8dbee-f5d9-4495-a0e0-a25c6ca4b95b
- 2–4 語にだけ #fff7ca の背景を敷き、面・カードには禁止する規則です。当方の「パステルの箱禁止」と緊張関係があるため、**背景の代わりに下線**（下記トークンの before/after 処理）で代替することを推奨します。[Medium]

## 5. 5 選から共通して抽出した原則

1. 有彩色は 1 つ、面ではなく**線・文字・2px のバー**でのみ。[High]
2. 区切りは 1px のヘアラインと明度の差。影は 0 個。[High]
3. 角丸は 1–2 個の値のみ（4px 中心）。[High]
4. 主ボタンの黒塗りは 3/5（Vercel・Mintlify・ElevenReader）の方式です。Literal・Grammarly は強調色で塗ります。当方は緑を強調専用で使うため黒塗りの側に従い、緑は「現在の状態・良くなった部分」の表示にのみ使います。[Medium]
5. 段落幅の制限とゆとりのある行間が、視覚的な装飾より優先。[High]

## 6. 提案トークンセット

コントラストは WCAG 2.x の相対輝度の式で直接計算しました（小数第 2 位）。[High]

```css
:root {
  /* 色: 面 */
  --bg: #ffffff;            /* ページ・パネルともに白。グレーのキャンバス + 白いカードの構造は禁止 */
  --bg-hover: #fafafa;      /* hover・選択行のみ。常時の面の色としては使わない */

  /* 色: 文字 (on #ffffff / on #fafafa) */
  --text: #171717;          /* 17.93:1 / 17.18:1  本文・見出し */
  --text-2: #4d4d4d;        /*  8.45:1            翻訳・補助本文 */
  --muted: #666666;         /*  5.74:1 / 5.50:1   キャプション・発音表記・ラベル */
  --accent: #047a35;        /*  5.47:1 / 5.24:1   強調専用: アクティブ表示、after の下線、通過チェック */
  --accent-strong: #035e28; /*  7.97:1            accent の hover・押下 */
  --on-accent: #ffffff;     /*  5.47:1            accent 上の文字(まれに) */
  --danger: #b42318;        /*  6.57:1 / 6.30:1   before の取り消し線、エラー文言 */

  /* 色: 線(非テキスト) */
  --hairline: #ebebeb;      /* 1.19:1  行・セクションの区切り線。装飾線なので 3:1 の対象外 */
  --control-border: #8f8f8f;/* 3.23:1  入力欄・ボタンの枠線。WCAG 1.4.11(3:1)を満たす */
  --focus: #047a35;         /* 2px outline, offset 2px */

  /* フォント: Web フォントなし(システム)。CSP の変更は不要 */
  --font-en: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --font-ja: "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic UI", "Yu Gothic", Meiryo, "Noto Sans JP", sans-serif;
  --font-ko: "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;

  /* サイズ(14px 未満なし) */
  --fs-caption: 14px;       /* ラベル・余白ノート・メタ */
  --fs-body: 16px;          /* チャット行・説明 */
  --fs-script: 18px;        /* ③ 日本語の模範スクリプト */
  --fs-h2: 20px;            /* セクション見出し ①–④ */
  --fs-h1: 24px;            /* パネル見出し */
  --fw-regular: 400;
  --fw-strong: 600;         /* 300 系の使用禁止 */

  /* 行間 */
  --lh-latin: 1.5;
  --lh-cjk: 1.7;            /* ko・ja 16px 本文 */
  --lh-script: 1.8;         /* ja 18px スクリプト(ルビ・発音行の余裕) */
  --lh-heading: 1.3;

  /* 幅 */
  --measure-cjk: 40em;      /* ja・ko の一行の最大 */
  --measure-latin: 68ch;

  /* 余白: Grammarly の 8px の段階に、4px ベースのシステム(Vercel・Literal など)の 4・12 を追加 */
  --sp-1: 4px; --sp-2: 8px; --sp-3: 12px; --sp-4: 16px;
  --sp-5: 24px; --sp-6: 32px; --sp-7: 48px; --sp-8: 64px;

  /* 形 */
  --radius: 4px;            /* ボタン・入力のみ。パネル・行は 0 */
  --rule: 1px solid var(--hairline);
}

:lang(ja) { font-family: var(--font-ja); line-height: var(--lh-cjk); }
:lang(ko) { font-family: var(--font-ko); line-height: var(--lh-cjk); }
:lang(en) { font-family: var(--font-en); line-height: var(--lh-latin); }
```

適用規則

- **言語ごとの `lang` 属性は必須**: CJK 統合漢字（Han unification）のため、一つのスタックを共有すると日本語の漢字が韓国語の字形で（またはその逆で）レンダリングされます。日本語スクリプトの要素には `lang="ja"`、韓国語の説明には `lang="ko"` を付けることで、上記のスタックが機能します。[High]
- **スクリプトの行間**: `:lang(ja)` が `--lh-cjk`(1.7)を与えるため、③ 模範スクリプトのコンテナには `font-size: var(--fs-script); line-height: var(--lh-script)` を明示して上書きする必要があります。[High]
- **Android**: 標準の日本語フォント名は "Noto Sans CJK JP" で、スタックの "Noto Sans JP" と名前が一致しません。`lang="ja"` + `sans-serif` で結局同じフォントが選ばれるため、動作に問題はありません。[Low]
- **Yu Gothic の注意**: Windows の "Yu Gothic" 400 は線が細く見える既知の問題があるため、"Yu Gothic UI" を前に置きました。それでもかすむ場合は、日本語の本文だけ 500 を検討します。[Medium]
- **Web フォントを使わない理由**: Inter・Geist(OFL)はセルフホスト可能ですが、かな・ハングルがないため効果はラテン文字に限られます。Noto Sans JP/KR(OFL)のフルセットの woff2 は数 MB あり、費用対効果が小さいです。ラテンの品質を上げたい場合は、Inter を `/fonts/` に置き、`unicode-range: U+0000-00FF` でラテンにだけ適用する方法があり、CSP `default-src 'self'` で許可されます。[Medium]
- **階層の表現（箱なし）**
  - セクション ①–④: 上側の `var(--rule)` + 20px/600 の見出し + 14px `--muted` のラベル。背景・枠線の箱なし。（Vercel・ElevenReader）
  - チャット行: 全幅、下側の `var(--rule)`、パディング 16px 20px、間隔 0。話者名は 14px `--muted`。（ElevenReader）
  - ② before→after: before = `--danger` の文字 + `text-decoration: line-through`、after = `--text` の文字 + 2px `--accent` の下線（`text-underline-offset: 3px`）。背景の塗りは禁止。色だけで区別しないよう、「前/後」のようなテキストラベルを併置します（WCAG 1.4.1）。（Readwise の技法の背景なし版）
  - アクティブ・通過の表示: 左側 2px の `--accent` のバー、またはチェックアイコン。（Mintlify）
  - 余白ノート: 右の列に 14px `--muted`、本文とは余白だけで分離。（Mintlify の目次）
- 主ボタン: `--text` の塗り + 白文字、`--radius`。緑塗りのボタンは使いません。（Mintlify・ElevenReader・Vercel 共通）[Medium]

## 7. コピー禁止リスト

- ロゴ・ワードマーク・グリフ: Vercel ▲、Literal の星、Grammarly のロゴ、Mintlify のイラスト。[High]
- プロプライエタリフォント: sohne, matter, Glyph, WaldenburgHF, Signifier, GT Super、Geist 以外の各社カスタムフォント。Charter は Bitstream の無料ライセンスで OFL ではありません（OFL の代替は Charis SIL）。[Medium]
- 他社固有のブランド色を当方の主色として使うこと: #027e6f, #278458, #0c8c5e, #297a3a。本文書では「用法」の参考に過ぎず、当方の主色は #047a35 です。[High]
- Refero ページの DESIGN.md 本文・スクリーンショットをリポジトリにコピーしません（スクリーンショットは非公開フォルダにのみ置く）。[High]

## 8. 確認できていないこと

- `?sort=popular` は最初の 20 件だけを確認し、以降のページでの順位は見ていません。[Low]
- 参照元の各サイト（vercel.com など）を直接開いて Refero の測定値と照合していません。数値は Refero の測定値をそのまま引用しました。[Medium]
- 提案トークンを実際の画面に適用したレンダリング（特に Windows の Yu Gothic・Malgun Gothic）は確認していません。[Unknown]
