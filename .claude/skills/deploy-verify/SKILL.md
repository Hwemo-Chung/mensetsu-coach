---
name: deploy-verify
description: Vercel 本番へのデプロイと配信内容の確認手順です。送信されるファイル、関数数、環境変数、復旧を確認します。Vercel 배포와 운영 확인. /deploy-verify で実行します。
disable-model-invocation: true
---

# 本番デプロイと確認

本番 URL は https://mensetsu-coach-ten.vercel.app です。デプロイ成功の表示だけでは完了と判断せず、配信中の内容まで確認します。Git 連携はないので、プッシュしても本番は変わりません。

## 1. 指示と場所を確かめる

デプロイは同じターンに明示の指示がある場合だけ実行します。指示がなければ、確認と計画の報告で止めます。

次のどちらかが失敗したら中止します。リンクのない場所で `--yes` を使うと、環境変数のない別のプロジェクトに配信されるおそれがあります。

```bash
jq -e '.projectName == "mensetsu-coach"' .vercel/project.json
[ "$(git branch --show-current)" = main ]
```

## 2. 方法を選ぶ

| 状況 | 方法 | 理由 |
|---|---|---|
| 作業ツリーが空で、新しいコードを出す | `vercel deploy --prod --yes` | `.vercelignore` を除いた作業フォルダが送られる。`.gitignore` は効かない |
| 作業ツリーに未コミットの変更がある | `vercel deploy` は実行しない | 未コミットの変更が本番に混ざる |
| コードは同じで、環境変数だけ変えた | `vercel redeploy <本番 URL>` | 手元のファイルを送らず、元のデプロイのソースを再構築する |

未コミットの変更がある状態で新しいコードを出す必要があれば、先にコミットするかをユーザーに確認します。`vercel redeploy` では `HEAD` の新しいコミットは出ません。

`vercel:deploy` は未コミットの変更がデプロイに入らないと案内しますが、このプロジェクトでは逆なので使いません。

## 3. デプロイ前の確認

- **送信するファイルを確かめます。** `vercel deploy --dry` の一覧に、想定外のパスがないことを確認します。`git status` に出ない無視ファイルも送られます。特に `public/` の下は公開されます。
- `PII_DENYLIST=../BuiltWithClaude-2026-private/secrets/.pii-denylist.txt npm test` を通し、`skipped` が 0 であることを確かめます。無視ファイルはこのテストの対象外です。
- `api/` の関数は Vercel Hobby の上限である 12 個に達しています。ファイルを増やすとデプロイに失敗するため、新しい処理は `lib/` に置き、`vercel.json` の rewrite で既存の関数へ流します（例: `/api/fit`）。
- `vercel env pull` で取得した機密値はプレースホルダーです。実際の値の確認や、ローカル実行の鍵には使えません。
- 環境変数の変更は再デプロイ後に反映されます。`vercel env ls --environment production` の時刻は作成時刻で、値を更新しても変わりません。値を変えたら、時刻で判断せずに再デプロイします。提出版では `MAIL_PUBLIC` を設定しません。

## 4. デプロイ後の確認

順に実行し、結果を記録します。

```bash
U=https://mensetsu-coach-ten.vercel.app
curl -s -o /dev/null -w "%{http_code}\n" "$U/"             # 200
curl -s -o /dev/null -w "%{http_code}\n" "$U/api/access"   # 405（GET のため。5xx は異常）
curl -sI "$U/" | grep -iE '^(content-security-policy|cross-origin-)'
vercel inspect "$U"                                        # id が今回のデプロイと同じか
# 静的ファイルを変えたとき: 2 つの値が一致するか
curl -sI "$U/<ファイル>" | grep -i etag; md5 -q "public/<ファイル>"
```

- `cross-origin-opener-policy` と `cross-origin-embedder-policy` が欠けると、ブラウザ内の音声認識（スレッド付き WASM）が動きません。
- `?v=$RANDOM` を付けても CDN のキャッシュは避けられません。内容は etag と `vercel inspect` の id で判断します。

上記の確認は、サーバーが動いていることしか示しません。機能フラグ（`RESEARCH_ENABLED`、`PREP_ENABLED`、`STT_ENABLED`、`MAIL_PUBLIC`）の反映は、AI を呼ばない次の応答で確かめます。

```bash
U=https://mensetsu-coach-ten.vercel.app
ACCESS_CODE=$(sed -n 's/^ACCESS_CODE=//p' ../BuiltWithClaude-2026-private/secrets/.env)
curl -s -w '\n%{http_code}\n' -X POST "$U/api/access" -H "x-access-code: $ACCESS_CODE"
# {"ok":true,"stt":…,"research":…,"mail":…,"prep":…}
```

401 と 429 では再試行せず、機能フラグを「未確認」と報告します。誤ったコードが 20 回続くと、その IP はすべてのコードでロックされます。コードの値は出力や報告に書きません。API キーなどの値はこの方法では確かめられないため、報告に「未確認」と書きます。

## 5. 失敗したとき

- `vercel inspect` の id が今回のデプロイと異なる場合は、自動の割り当てが止まっている可能性があります。再デプロイを重ねる前に、最近のロールバックの有無を確かめます。
- 5xx やヘッダーの欠落は `vercel rollback <直前の URL>` で戻します。Hobby では直前の本番デプロイにしか戻せません。
- ロールバックの後は本番ドメインの自動割り当てが止まるので、次の版は `vercel promote <URL>` で戻します。

## 6. 実行しないもの

`vercel crons run /api/cron/daily` は実際にメールを送るため、指示がある場合だけ実行します。同じ JST の日付の運営者向けメールは同じ冪等キーを使うので、再実行しても新しいメールは届きません。

## 報告の形式

```
## デプロイ結果
- 方法: <deploy / redeploy / 未実行>
- コミット: <hash>、デプロイ: <URL>
- 送信ファイル: <--dry の確認結果>
- 確認: / <code>、/api/access <code>、ヘッダー <有無>、inspect の id <一致>、etag <一致>、機能フラグ <POST の結果>
- 未確認: <確認できなかった項目、なければ「なし」>
```
