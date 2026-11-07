# 本番の往復試験 prod 20261107-111345 — https://mensetsu-coach-ten.vercel.app

> 公開用の伏せ字版: prod-roundtrip.mjs が 2026-11-07 11:13 JST に本番で出力した summary.md。韓国語の見出し・行ラベルを日本語に翻訳し、元データの列はローカルの絶対パスをファイル名だけに置き換えました。元データの JSON（応答本文）と音声ファイルは公開していません。

access=gated, prep=all, quota=0, lang=ko, pack=jp。判定: pass/fail/unimplemented/flag_off/skipped/rate_limited/unmeasured（prod: flag_off・skipped も失敗）。SCORES.md の欄には `合格 <ファイル>` / `不合格 <ファイル>` として転記する。

| SCORES の行 | 呼び出し | 判定 | HTTP | 所要/上限 | 備考 | 元データ |
|---|---|---|---|---|---|---|
| F11 アクセスコード、誤ったコードの拒否 | access-nocode | pass | 401 | 338ms | gated: コードなしを拒否 | 01-access-nocode.json |
| F11 アクセスコード、誤ったコードの拒否 | access-wrong | pass | 401 | 210ms |  | 02-access-wrong.json |
| F11 アクセスコード、誤ったコードの拒否 | access-right | pass | 200 | 189ms |  | 03-access-right.json |
| F11 アクセスコード、誤ったコードの拒否 | review-nocode | pass | 401 | 212ms/120s |  | 04-review-nocode.json |
| F1 テキスト入力 / F2 質問10問、段階・分類 | questions-text | pass | 200 | 17394ms/120s |  | 05-questions-text.json |
| F1 添付（TXT のみ。PDF・DOCX・画像は Chrome の欄） | questions-attach | pass | 200 | 16332ms/120s |  | 06-questions-attach.json |
| F12 画面の言語 ko, en, ja | questions-jp-ja | pass | 200 | 11802ms/120s |  | 07-questions-jp-ja.json |
| F12 画面の言語 ko, en, ja | questions-jp-en | pass | 200 | 14093ms/120s |  | 08-questions-jp-en.json |
| F14 kr ベータ | questions-kr-ja | pass | 200 | 33715ms/120s |  | 09-questions-kr-ja.json |
| 調査 | research | pass | 200 | 11541ms/180s |  | 10-research.json |
| 適合・不一致、希望プロフィール | fit | pass | 200 | 15338ms/180s |  | 11-fit.json |
| F3 構成の判定 / F15 ①②③ | review-offtarget | pass | 200 | 12184ms/120s |  | 12-review-offtarget.json |
| F4 添削、新規規則3件 | review-fillers | pass | 200 | 19875ms/120s | 規則 rep-jibunteki,del-chanto,del-katachi,del-nanka,del-chotto,rep-genshoku,rep-onsha,rep-daijoubu（新規3件は f4/f4neg の有料評価で確認） | 13-review-fillers.json |
| F5 模範スクリプト、事実の質問の締め、自己紹介 | script-judgment | pass | 200 | 7872ms/120s |  | 14-script-judgment.json |
| F5 模範スクリプト、事実の質問の締め、自己紹介 | script-self_intro | pass | 200 | 7132ms/120s |  | 15-script-self_intro.json |
| F5 模範スクリプト、事実の質問の締め、自己紹介 | script-short_fact | pass | 200 | 4441ms/120s |  | 16-script-short_fact.json |
| 🔊 読み上げ | tts | pass | 200 | 814ms/60s | 1365120 bytes ≈ 28.4秒 → tts.wav | 17-tts.json |
| 音読の確認 | stt | pass | 200 | 3748ms/60s | quality=ok | 18-stt.json |
| F10 逆質問（4〜8問を準備、2〜3問を選ぶ案内） | reverse | pass | 200 | 3863ms/60s |  | 19-reverse.json |
| F15 ④ 時間 | verify-nomaterial | pass | 200 | 207ms/180s |  | 20-verify-nomaterial.json |
| スクリプトの自動の事実確認 | verify-auto | pass | 200 | 3522ms/180s | unsupported 0件 | 21-verify-auto.json |
| F15 ⑤ 根拠のない文 | verify-material | pass | 200 | 5971ms/180s | unsupported 1件 | 22-verify-material.json |
| F15 ④ 時間（自己紹介90秒） | verify-selfintro | pass | 200 | 416ms/180s |  | 23-verify-selfintro.json |
| F15 ④ 時間（条件の質問は評価なし） | verify-shortfact | pass | 200 | 188ms/180s |  | 24-verify-shortfact.json |
| 準備資料: 1次 | prep-first | pass | 200 | 60548ms/180s |  | 25-prep-first.json |
| 準備資料: カジュアル | prep-casual | pass | 200 | 23601ms/180s |  | 26-prep-casual.json |
| 準備資料: 2次 | prep-second | pass | 200 | 50578ms/180s |  | 27-prep-second.json |
| 準備資料: 役員 | prep-executive | pass | 200 | 19645ms/180s |  | 28-prep-executive.json |
| 準備資料: 最終 | prep-final | pass | 200 | 12891ms/180s |  | 29-prep-final.json |
| 準備資料: 内定・条件 | prep-offer | pass | 200 | 416ms/180s |  | 30-prep-offer.json |

秘密の値のスキャン: なし
失敗・未実装・429・flag_off・skipped: 0件、未測定 0件
