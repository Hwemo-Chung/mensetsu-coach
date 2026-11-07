# メールベース機能への cloud-mail 導入の検討（2026-11-03）

対象: <https://github.com/maillab/cloud-mail>（MIT、スター約 1.5 万、最終 push 2026-10-25、`gh api` で確認）
用途候補: (A) F13 毎朝 9 時のヒントメール、(B) メールで回答を送ると添削・スクリプトをメールで返信

## 結論

| 用途 | 判定 | 一行の理由 |
|---|---|---|
| (A) ヒントメール | **導入しない** | cloud-mail も結局 Resend または Cloudflare の送信を使います。現在詰まっている原因（送信ドメインとキー 3 つ）はそのままで、Cloudflare DNS 移行・KV・D1・10 ステップのデプロイがさらに加わります。[High] |
| (B) メールコーチング | **11/8 の提出前には行わない。** 提出後も cloud-mail なしの最小構成で進める | Web メールクライアントは不要で、受信 1 件を `/api/review` に渡す 30 行程度の中継があれば十分です。その代わり個人情報の原則（記録はブラウザにのみ保存）が崩れ、アクセスコードなしで Claude クレジットが消費される経路が生まれます。[High] |

## 1. 大会規則

- 規則原文: 参加者ガイドの全文は主催者のイベントページ（ログインが必要）にあります。リポジトリ外のキックオフメモには要約のみが残っています。その要約は次のとおりです。「성과물은 기간 중 신규 제작만 (기존 프로젝트 재사용 금지, 본인 기여가 구분 안 되면 실격) … 권리 없는 코드·데이터 사용 금지」（成果物は期間中の新規制作のみ（既存プロジェクトの再利用禁止、本人の貢献が区別できなければ失格）… 権利のないコード・データの使用禁止）。原文と照合できていないため、以下の解釈は [Medium] です。
- リポジトリ規則（`CLAUDE.md:36`）: "Only code written during the contest period (from 11/2 12:30). No copying code from existing projects".
- 解釈
  - 外部サービスや npm 依存として使うこと自体は禁止対象ではありません。すでに `@anthropic-ai/sdk`、`mammoth`(`package.json:16-19`)を使っており、Vercel・Upstash・Resend も外部サービスです。MIT ライセンスなので権利の問題もありません。[Medium]
  - 問題はデプロイ方式です。公式デプロイ文書のステップ 1 が "Fork or clone the cloud-mail repository to your own GitHub account" です（<https://docs.skymail.ink/en/deployment/dashboard.html>）。提出アカウントの下に他人が作った大規模プロジェクトのフォークができ、メール機能の大部分が自分たちのコードではなくなります。これは「본인 기여가 구분 안 되면 실격」（本人の貢献が区別できなければ失格）条項に正面から抵触しうる形です。[Medium]
  - 運営側は「심사 대상은 Claude로 한 개발로 한정한다」（審査対象は Claude で行った開発に限定する）と回答しました（同じメモ）。他の AI ツール併用に関する質問への回答ですが、同じ論理を当てはめると cloud-mail の部分も審査対象ではないと考えます。得点にはならず、リスクだけが残ります。[Medium]

## 2. 公式文書で確認した前提条件

| 項目 | 内容 | 出典 | 信頼度 |
|---|---|---|---|
| Cloudflare Email Routing（受信） | "You must be using Cloudflare DNS"。MX・SPF・DKIM レコードが自動で追加されます。つまり**自分が所有するドメインの DNS を Cloudflare に移す必要が**あります。 | https://developers.cloudflare.com/email-routing/get-started/enable-email-routing/ | [High] |
| Email Workers | `email(message, env, ctx)` ハンドラを使います。`message.reply()` はイベントごとに 1 回で、送信ドメインが受信ドメインと同じである必要があります。DMARC の結果が `Authentication-Results` ヘッダで付きますが、先頭のヘッダかつ `mx.cloudflare.net` から来たものだけを信頼すべきです。サンプルコードのコメント基準で、受信サイズの上限は 25 MiB です。 | https://developers.cloudflare.com/email-routing/email-workers/ | [High] |
| Email Worker の実行時間 | レビュー応答（約 35 秒）を待つ間、`email()` ハンドラの CPU・経過時間の上限がどう適用されるかは確認できていません。 | 未確認 | [Unknown] |
| Cloudflare Email Service（送信） | **Beta** 状態です。任意の受信者に送るには Workers Paid が必要です。月 3,000 通まで含まれ、超えると 1,000 通あたり $0.35 です。新規アカウントは 1 日の割り当てが控えめに始まります。受信（Routing）は無料プランでも無制限です。 | https://developers.cloudflare.com/email-service/ , https://developers.cloudflare.com/email-service/platform/pricing/ , https://developers.cloudflare.com/email-service/platform/limits/ | [High] |
| Resend 送信 | `onboarding@resend.dev` はアカウント本人のアドレスにしか送れません。他のアドレスに送ると 403 になります。**実運用にはドメイン認証が必要です。** | https://resend.com/docs/knowledge-base/403-error-resend-dev-domain | [High] |
| Resend 受信 | 受信機能があります。`<id>.resend.app` サブドメインは DNS 設定なしですぐ受信でき、カスタムドメインは MX レコードを追加すれば使えます。`email.received` Webhook は "do not include the email body, headers, or attachments" なので、本文は Received emails API で別途取得する必要があります。 | https://resend.com/docs/dashboard/receiving/introduction , https://resend.com/docs/webhooks/emails/received.md | [High] |
| Resend Webhook 署名 | Svix ヘッダ（`svix-id`/`svix-timestamp`/`svix-signature`）とエンドポイントごとの secret で検証します。`email.received` にも適用されると明記された文はありませんが、一般規則として記述されています。 | https://resend.com/docs/dashboard/webhooks/verify-webhooks-requests | [Medium] |
| Resend 無料プラン | 月 3,000 通、**1 日 100 通**、ドメイン 3 つ、データ保持 30 日です。受信も含まれます。 | https://resend.com/pricing | [High]（受信が同じ月間割り当てから差し引かれる点は [Medium]） |

## 3. cloud-mail の構成と Webhook

- 必要なリソース: Worker 1 つ、KV、D1（バインディング名 `kv`/`db` 固定）、任意で R2（添付）が必要です。変数は `domain`/`admin`/`jwt_secret` で、デプロイ後に `/api/init/<secret>` で DB を初期化し管理者アカウントを登録します。ダッシュボード基準で 10 ステップです（上記 dashboard.html、`mail-worker/wrangler.toml:9-20,41-47`）。メール受信には上記の Cloudflare DNS 条件がそのまま適用されます。[High]
- 送信: Cloudflare Email（`send_email` バインディング、`wrangler.toml:22-23`）または Resend を使います（README-en.md:62, 94）。(A) に必要な送信手段は現在と同じです。[High]
- Webhook は外部 URL に POST できます。ただし次の制約があります（`mail-worker/src/service/webhook-service.js`、`mail-worker/src/email/email.js`）。[High]
  - secret は `Authorization` ヘッダに生の文字列で載ります（`webhook-service.js:22-24`）。HMAC やタイムスタンプがなく、リプレイ攻撃を防げません。
  - 再試行は遅延なしで即座に繰り返します（`webhook-service.js:41-57`）。
  - **本文が先に D1 に保存されてから Webhook が呼ばれます**（`email.js:145` 保存 → `:197-198` Webhook）。つまり Webhook だけを使いたくても、メール本文が残ります。
  - Webhook URL・secret は管理者設定画面（DB）で指定します（`email.js:20-39`）。

## 4. (B) 最小代替案との比較

現在の `/api/review` は `x-access-code`(`api/review.js:16`)と `question`・`answer`(`:26-31`)を要求します。メール本文だけでは質問と回答が区別できません。どの方式を選んでも、「件名=質問、本文=回答」のようなパース規則とサーバー側の中継 secret が新たに必要です。[High]

| 方式 | 追加構成 | メール本文の保存場所 | 返信送信 | 備考 |
|---|---|---|---|---|
| cloud-mail Webhook | 10 ステップのデプロイ、CF DNS 移行、KV・D1（・R2）、管理者 UI | **D1 に無期限保存**（削除運用が必要） | CF Email（Beta、Paid）または Resend | Web メール UI・複数アカウントなど不要な機能が大半です |
| Cloudflare Email Worker 約 30 行 | CF DNS 移行、Worker 1 つ | 保存しない作りにできる（ステートレス） | `message.reply()` 1 回（同一ドメイン） | DMARC ヘッダの検査必須、実行時間上限 [Unknown] |
| Resend 受信 | MX 追加または `resend.app` サブドメイン、`/api/inbound` 1 つ | **Resend に保存**（無料プランは保持 30 日） | Resend（認証ドメイン） | Webhook に本文がないため API をもう一度呼ぶ必要があります。Svix 署名で検証します。すでに F13 で使っている事業者なので委託先は増えません |

個人情報への影響（3 方式共通）: `public/privacy.html:20` の 「お使いのブラウザ（localStorage）にだけ残ります」が崩れます。§3 の委託先一覧（`privacy.html:28-31`）に「回答本文」が追加されます。Cloudflare 方式では委託先が 1 社（Cloudflare, Inc.）新たに増えます。`maskInput` は Claude 呼び出しの直前にのみ適用されるため、メール事業者を通る本文はマスキングされていない原文です。[High]

セキュリティ: メールにはアクセスコードがありません。誰でもメールを送って Claude クレジットを使えてしまいます。最も安価な遮断策は、F13 の購読者ストア（`lib/mail.js:42-49` `makeStore`）を送信者の許可リストとして再利用することです。そこに DMARC 通過の確認を加えます。[Medium]

## 5. (A) 関連の付随確認

- (A) はコードが完成しています（`lib/mail.js:66-79` Resend REST、`api/cron/daily.js`、`vercel.json` cron `0 0 * * *` = 09:00 JST）。残りはユーザーが行う設定だけです。Resend のドメイン認証 → `RESEND_API_KEY`・`MAIL_FROM`・`KV_REST_API_URL`・`KV_REST_API_TOKEN`・`CRON_SECRET`・`APP_URL` を Vercel に登録します。[High]
- 無料プランは 1 日 100 通です。`api/cron/daily.js:16-25` はすべての購読者に一度に送るため、購読者が 100 人を超えると超過分が `failed` として集計されるだけで、失敗が表に出ません。デモ規模では問題ありません。[High]

## 6. 提出後も (B) を望む場合の手順

1. ドメインを 1 つ確保します。(A) の Resend 認証と同じドメインを使えます。
2. 受信経路を選びます。DNS を移さないなら Resend 受信（MX のみ追加、または `resend.app` サブドメイン）を使います。事業者に本文を残さないなら DNS を Cloudflare に移し、Email Worker をステートレスで運用します。**cloud-mail は使いません。**
3. `/api/inbound` を 1 つ追加します。署名または中継 secret を検証し、送信者の許可リスト（購読者ストア）と DMARC を確認します。件名/本文を question/answer にパースした後 `generateReview` を呼び、結果をメールで返信します。本文はログやストアに残しません。
4. `privacy.html` の §2・§3・§4 を改訂します。回答本文がメール事業者を経由する点と保持期間を記載します。
5. テスト: 偽装送信者、署名なし、許可リスト外の送信者がすべて 401 で弾かれることをオフラインテストで固定します。
