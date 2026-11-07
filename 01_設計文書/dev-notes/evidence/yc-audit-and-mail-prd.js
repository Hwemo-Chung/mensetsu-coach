// Claude Code Workflow script used during development (multi-agent orchestration, run 2026-11-05). Paths made repo-relative for publication.
// 公開用の伏せ字版: 実行時のプロンプトは韓国語で、公開にあたりビジネス日本語に翻訳しました（構造・役割・出力の指定は変えていません）。
// 置き換え: ローカルの絶対パス → 相対パスと <PRIVATE_DIR>、ローカルのツール名 → <LOCAL_TOOL>、メールアドレス → 一般的な表現。個人の近況に関する規則の文言は一般化しています。
export const meta = {
  name: 'yc-audit-and-mail-prd',
  description: 'YC-level audit of the interview coach, mail benchmark, brainstorm and PRD, then adversarial check (5 agents)',
  phases: [
    { title: 'Audit', detail: 'product attack, code attack, mail benchmark' },
    { title: 'PRD', detail: 'brainstorm and PRD from the evidence' },
    { title: 'Refute', detail: 'adversarial check of the audit and PRD' },
  ],
}

const CONTEXT = `プロジェクト: 面接コーチ。リポジトリはカレントディレクトリ（公開）、非公開資料は <PRIVATE_DIR>（README.md が地図）。
本日 2026-11-05 09:35 JST。Built with Claude: Japan 2026 の提出締め切り 11/8 20:00、審査 11/9、最終 11/10。審査の配点: インパクト 30 / デモ 25 / Claude活用 25 / 深さ・実行力 20。目標は1位。
本番 main=production のコミット ccdd8b9。提出動画 v5 で確定。
共通の規則: 読み取り専用（ファイルの変更、コミット、デプロイ禁止）。有料 API の呼び出しと本番の呼び出しは禁止。秘密の値を出力しない。<LOCAL_TOOL> と X/Twitter の収集経路は実行しない。実在の企業名と個人情報を出力に書かない（05-raw の評価資料を含む）。公開の文言は作者の過去の経験にのみ触れ、個人の近況には触れない。評判サイトの自動収集は、大会の「権利のないデータの禁止」により利用者がすでに却下済み。結果は韓国語で書く。自明でない主張にはすべて [高]/[中]/[低]/[不明] と根拠（file:line または URL）を付け、確認できなかったものはそう書く。称賛と冗長な記述は禁止。`

const MAIL_FACTS = `本日の目標（利用者の指示の要旨）: メール登録をして、個人の弱点を毎日9時に送るメール、日本語のビジネス表現、希望ポジションに関する話題などを含める予定のアイデアについて、ベンチマーク、ブレインストーミング、PRD を作る。
現在のメール実装: api/subscribe.js、api/unsubscribe.js、api/cron/daily.js、lib/mail.js。PRD F13: メール・言語・同意時刻だけを HMAC キーで保存し、pack データのヒントを日付で循環させる。AI 呼び出しなし。Vercel Cron 00:00 UTC。本番の環境変数名を確認した結果、APP_URL、CRON_SECRET、MAIL_SECRET はあり、RESEND_*、MAIL_FROM、KV_*/UPSTASH_* はない（つまり実際の送信は不可）。api/ は Vercel Hobby の12関数の上限に達しており、新しい関数ファイルは禁止。セッション・口ぐせのカウンター・希望プロフィールはブラウザの localStorage にだけあり、サーバーには送られない。個人の弱点メールはこの約束と衝突する。Resend はドメイン認証前は既定の送信元アドレスからアカウント本人にしか送信できない。`

phase('Audit')
const [product, code, bench] = await parallel([
  () => agent(`${CONTEXT}

役割: YC パートナー。このプロジェクトを、保守的な観点（今あるものだけで何を証明したか、何が危険で外すべきか）と攻撃的な観点（1位とその後の事業のために何を覆すべきか）の両方から検証せよ。
読むもの: README.md、01_設計文書/PRD-INTERVIEW-COACH.md の前半、非公開資料の 02-strategy/YC-DEVILS-ADVOCATE-2026-11-03.md、MARKET-ANALYSIS.md、00-current/SUBMISSION-COPY.md、00-current/DEMO-SCRIPT.md、04-video/VIDEO-INDEX.md、03-reviews/attack-product-2026-11-03.md。
出力:
1) 前回の YC レビュー項目の解決/未解決の表。
2) 中核の主張5つと、その主張を崩す最も強い反論、現在の証拠の強さ。
3) 審査4項目ごとの点数の推定（自分の推定の根拠を含む）と1位との差。
4) 需要・継続・収益の観点での致命的な弱点。利用者インタビューや利用データがなければそう書くこと。
5) 11/8 までの改善項目の表: 項目、保守/攻撃の区分、審査への影響、労力（時間）、優先度。10件以内、やってはいけないことも含める。
6) 毎日9時の個人化メールが、この時点で1位に役立つか害になるかの判断。根拠とともに賛否のどちらかを選ぶこと。`, { label: 'yc-product', phase: 'Audit' }),

  () => agent(`${CONTEXT}
${MAIL_FACTS}

役割: 敵対的なスタッフエンジニア。本番で動いているコードから、実際に事故になる欠陥を探せ。問題を再現できる水準までコードの経路をたどり、推測は捨てよ。
まず非公開資料の 03-reviews/attack-security-2026-11-03.md と AUDIT-2026-11-02.md を読み、すでに処理済みのものを繰り返さないこと。
範囲: api/、lib/（特に mail.js、guard.js、research.js、fit-api.js）、public/（入力・保存・表示）、vercel.json、費用の暴走（アクセスコードが漏れた場合の調査呼び出しの費用、レート制限がサーバーレスのインスタンスごとのメモリかどうか）、プライバシーポリシーと実際の動作の不一致、メールの登録・解除・cron のセキュリティ（解除トークン、cron の認証、再送、部分的な失敗、冪等性、受信者が増えたときのタイムアウト）。オフラインのテストの実行は許可（npm test、トークン 0）、本番の呼び出しは禁止。
出力: 修正項目の表（重大度 致命/高/中/低、file:line、失敗のシナリオ、最小の修正案、提出前に必須か）。重大度の順。確認できなかった領域の一覧。メールの実装については、個人化を入れる前に先に直すべきことを別の節に。`, { label: 'code-attack', phase: 'Audit' }),

  () => agent(`${CONTEXT}
${MAIL_FACTS}

役割: リサーチ。公式の文書を優先してベンチマークせよ。Web 検索とページの閲読を使う。
A. 毎日の習慣メール・通知の製品の実例: 語学学習（Duolingo、Speak、ELSA など）、面接準備（Daily Coding Problem、Exponent、Google Interview Warmup など）、間隔反復（Anki、Leitner）、日本語のビジネス表現のメールマガジン。各例の頻度、個人化の方式、何が継続率を上げると公表しているか。公表された数値がなければ、ないと書くこと。
B. 日本の法令・送信の要件: 特定電子メール法（オプトイン、表示義務: 送信者名・住所・解除）、個人情報保護法の外国への移転、Gmail/Yahoo の大量送信者の要件（SPF/DKIM/DMARC、List-Unsubscribe のワンクリック）、少量の送信に適用される範囲。
C. インフラの制約: Vercel Hobby の cron の正確さと上限、Resend の無料枠とドメイン認証、Upstash の無料枠。現在の値で確認する。
D. 「希望ポジションの話題」を権利の問題なく入れられる情報源: 公的統計、公共の RSS、プレスリリースなど。本文を複製せず、リンク・要約ができる範囲。評判サイトとスクレイピングは除外。
出力: 事例の表（製品/頻度/個人化/公表の根拠 URL）、取り入れるパターン5つ、使ってはいけないパターン3つ、法令・送信のチェックリスト、インフラの上限の表、情報源の表。各項目に URL と確認日。`, { label: 'mail-benchmark', phase: 'Audit' }),
])

phase('PRD')
const prd = await agent(`${CONTEXT}
${MAIL_FACTS}

役割: PM 兼テックリード。次の3つの報告と実際のコード（lib/mail.js、api/subscribe.js、api/unsubscribe.js、api/cron/daily.js、public/ の登録ポップアップと口ぐせのカウンター、packs/jp.json、希望プロフィール、public/privacy.html、01_設計文書/PRD-INTERVIEW-COACH.md F13）を読んで作成せよ。

<yc_product>${product ?? '失敗: 報告なし'}</yc_product>
<code_attack>${code ?? '失敗: 報告なし'}</code_attack>
<mail_benchmark>${bench ?? '失敗: 報告なし'}</mail_benchmark>

成果物2つを1つの文書に:
[ブレインストーミング] アイデア15件以内を表で: 個人の弱点（口ぐせのカウンター、抜けた4文型の段階、添削の規則）、ビジネス日本語の表現、希望ポジションの話題、その他の継続の仕組み。各項目に利用者の価値、必要なサーバー保存データ、AI の費用、権利・個人情報のリスク、判定（今回/提出後/却下）。必ず「サーバーに回答の原文を保存しない」案と「保存する」案を比べ、どちらかを推奨すること。例: ブラウザが利用者の同意後に規則 ID の件数だけをサーバーに送る方式。
[PRD] メールコーチ v2: 目標と非目標、対象利用者、ユーザーストーリー、登録・同意の UX と ASCII モックアップ、メール本文の ASCII 例を日本語・韓国語で各1通（架空のデータ、実在の企業名禁止）、サーバーのデータモデルと保存期間、プライバシーポリシーの変更文案、特定電子メール法の表示項目、12関数の上限内でのルーティング、cron・再試行・冪等性・部分的な失敗、費用の見積もり（受信者 10/100/1000 人）、機能フラグとロールバック、測定指標（成功/中止の基準）、失敗するテストから書く TDD の一覧、受け入れ基準、本日（11/5）の日程と提出前の凍結の判断、利用者の作業一覧（キー、ドメインなど）、利用者に尋ねる決定事項 最大4件。既存のコードを再利用し、YAGNI を守ること。現在のコードでは不可能な主張を書かないこと。
最後に [改善・修正項目の統合表]: 3つの報告の重複を除いた優先度順の表（項目、根拠、区分: 修正/改善/メール、提出前に必須か、労力）。`, { label: 'prd-writer', phase: 'PRD' })

phase('Refute')
const critique = await agent(`${CONTEXT}
${MAIL_FACTS}

役割: 反証の担当。次の文書の主張を基本的に誤りとみなし、コードと公式の文書で崩せ。自分でファイルを開いて確かめ、ベンチマークの法令・上限の数値は公式のページと照合せよ。オフラインのテストの実行は許可、本番の呼び出しは禁止。

<doc>${prd ?? '失敗'}</doc>
<code_attack>${code ?? '失敗'}</code_attack>
<yc_product>${product ?? '失敗'}</yc_product>

出力:
1) 誤っている、または根拠のない主張の一覧: 元の主張、反証の根拠（file:line/URL）、直した文。
2) 誇張された重大度・過小評価されたリスク。
3) PRD から抜けているもの（法令、個人情報、運用、テスト）。ないふりをせず、見つけた分だけ。
4) 確かに正しいと確認できた中核の主張5つ。
5) 最終判断: メールコーチ v2 を提出前に本番に入れるか、入れるならどこまでかを1段落で。`, { label: 'refuter', phase: 'Refute' })

return { product, code, bench, prd, critique }
