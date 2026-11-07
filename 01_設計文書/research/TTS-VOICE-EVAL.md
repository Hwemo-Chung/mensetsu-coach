# 音声機能の調査 — TTS（スクリプトの読み上げ）・STT（音声回答） (2026-11-03)

範囲：調査のみ。アプリのコードは変更していません。ベンダーのアカウント・キーは作成も使用もしておらず、Claude API も呼び出していません。
信頼度表記：[High] 公式ドキュメント・直接の実測 / [Medium] 不完全な根拠からの推論 / [Low] 根拠のある推測 / [Unknown] 確認できず。
価格は 2026-11-03 に公式の価格ページで読み取った値です。一部は要約ツールを経由して読み取ったため、決済前に原文の表を再確認する必要があります。

比較単位（固定）：**スクリプト1つ = 日本語 約250字、約60秒の音声 / 回答1つ = 約90秒の録音。**

---

## 0. 結論

| 機能 | 推奨 | 1回あたりの原価 | 根拠の水準 |
|---|---|---|---|
| TTS 本命 | クラウド TTS をサーバー関数 `/api/tts` で中継します。候補は **ElevenLabs v3/v4, Google（Chirp 3 HD または Gemini 3.8 Flash TTS）, Azure Neural/HD** の3つです。3つとも日本語の品質を独立に測定した資料がないため、**11/4 に同じ敬語スクリプトで30分間聴き比べて1つを選びます。** | $0.004–0.02 | 日本語の品質 [Unknown]、価格 [High] |
| TTS フォールバック | ブラウザの `speechSynthesis` を使い、`localService=true` の音声（OS の音声）を優先します。コスト0、依存関係0です。 | $0 | [High] |
| STT 本命 | **OpenAI `gpt-transcribe`** を使います。webm・mp4 をそのまま受け付け、`prompt` でフィラーの保持を促せます。ZDR の対象で、学習には使われません。文字起こしの結果は**入力欄に入れ、ユーザーが確認してから送信するように**します。 | 90秒 ≈ $0.0068 | [High]。日本語のフィラー保持は [Unknown] のため実測が必要です。 |
| STT 次善 | ElevenLabs Scribe v2 を使います。ベンダーの主張では日本語 WER ≤5% の等級で、フィラーは `no_verbatim=true` のときだけ削除します。ただし、学習への利用がデフォルトです。 | 90秒 ≈ $0.0055 | [Medium] |
| 接続経路 | **Vercel AI Gateway に当チームのアクセス権があれば、Gateway 1つに統一します。** モデル ID を変えるだけでベンダーの A/B が済み、Vercel のデプロイでは OIDC で認証するため新しいキーは不要です。ただし音声機能はベータで「順次公開」のため、アクセスの可否をまず確認する必要があります。 | ベンダー原価そのまま（zero markup） | [High]。当チームのアクセス可否は [Unknown] |

**最大のリスク3つ**
1. **STT がフィラーを削除すると、F4 のルールが動作しません。** `packs/jp.json` の `del-nanka`（なんか）, `del-chotto`, `del-chanto`, `del-gyakuni` は、回答に該当する語がそのまま残っていないと検出されません。**日本語でフィラーを原文どおり残すとドキュメントに明記したベンダーは1つもありません** [High]。そのため、文字起こしの結果を入力欄に入れてユーザーが直せるようにし、「口ぐせが抜けている可能性があります」という案内を表示します。
2. **STT が選んだ漢字表記が採点に混ざります。** 例えば `rep-touka`（透過）は同音異義語の問題ですが、この表記をユーザーではなく認識器が決めてしまいます。デモではこのルールを音声経路で見せません。[Medium]
3. **CSP の設定のせいでクラウド音声が再生されない可能性があります。** 現在のポリシーは `default-src 'self'` で、`media-src` が別途ありません。そのため `<audio src="blob:…">` がブロックされます。`vercel.json` に `media-src 'self' blob:` を追加する必要があります。[High]

---

## 1. ブラウザ内蔵の Web Speech API — コスト0の基準線とフォールバック

### 1-1. speechSynthesis (TTS)
- **対応範囲：** Chrome 33+, Edge, Safari 7+, iOS Safari 7+, Firefox 49+, Android Chrome, Samsung Internet で動作します。MDN 基準で Baseline "Widely available"（2018-09 以降）です。[High]
  - https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis
  - https://caniuse.com/speech-synthesis
- **速度・高さ：** `rate` は 0.1~10（デフォルト 1）、`pitch` は 0~2（デフォルト 1）です。エンジンによっては範囲がさらに狭いことがあります。文ごとに `SpeechSynthesisUtterance` を作ってキューに入れると、文単位で再生されます。PoC で確認しました。[High]
  - https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisUtterance/rate
  - https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisUtterance/pitch
- **voiceschanged の問題：** 最初の `getVoices()` が空の配列になることがあります。`voiceschanged` イベントを待ち、イベントが来ない場合に備えてタイムアウトのフォールバックも置きます。[High]
- **CSP：** 外部スクリプトもネットワーク要求もないため、現在の CSP のまま動作します。PoC を同じ CSP(`default-src 'self'; script-src 'self'`)で起動して確認しました。[High]
- **個人情報：** `localService === false` の音声はリモートの合成サービスです（MDN）。Chrome の `Google 日本語`・`Google 한국의`（Google の韓国語音声）・`Google US English` がこれに当たり、テキストが Google のサーバーに送られます。[Medium]
  - 根拠：https://developer.mozilla.org/docs/Web/API/SpeechSynthesisVoice/localService
  - 根拠：Chromium network_speech_synthesis manifest(https://chromium.googlesource.com/chromium/src/+/4ebc60dd1a01c87b6bb0d7fb525ec6969c9d5adf/chrome/browser/resources/network_speech_synthesis/manifest.json)
  - 対応：`localService === true` の音声を先に選びます。
- **既知のバグ：** Chrome の Google リモート音声は、長い発話を約15秒後に止めてしまいます（Chromium issue 679437）。文単位に区切って入れれば回避できます。[Medium]
  - https://www.caktusgroup.com/blog/2025/11/03/the-halting-problem/
  - https://github.com/phetsims/utterance-queue/issues/60
- **品質：** OS の音声は、ユーザーがすでに「物足りない」と判断しています。そのためフォールバックとしてのみ置きます。

### 1-2. SpeechRecognition (STT)
- **対応範囲：** caniuse 基準では、Chrome, Safari 14.1+, iOS Safari 14.5+, Samsung Internet は「部分対応」です。Firefox はデフォルトで無効、Edge・Opera は未対応と表示されます。MDN は "Limited availability（Baseline ではない）" に分類しています。[High]
  - https://caniuse.com/speech-recognition
  - https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition
- **Chrome はサーバーで認識します。** MDN: "your audio is sent to a web service for recognition processing, so it won't work offline." [High]
- **デバイス内での認識：** `processLocally`・`available()`・`install()`（Chrome 139+ とされる）で可能とされています。ただし、ja/ko の言語パックがあるかどうかとインストールの UX は確認できていません。[Low]
  - https://developer.mozilla.org/docs/Web/API/SpeechRecognition/install_static
- **Safari：** Apple の音声認識を使い、Siri の有効化が必要だという二次資料しかありません。WebKit の原文は確認できていません。[Low]
- **結論：** フィラーを保持するかどうかを制御できず、ドキュメントもありません [Unknown]。対応ブラウザもまちまちです。**音声入力の主経路には使いません。**

### 1-3. PoC の結果 — この Mac の Chrome 156 (Playwright, `channel: 'chrome'`)
コードは公開リポジトリ外のスクラッチパッドにあります（index.html, poc.js, run.mjs, run-google.mjs）。
**再生は最後まで進みましたが、耳で音質を聴いてはいません。**

| 条件 | 音声の総数 | ja-JP | ko-KR | en-US |
|---|---|---|---|---|
| headless / headful（Playwright のデフォルトフラグ） | 181 / 181（同じ） | 9個、すべて `localService=true`: Kyoko, Eddy, Flo, Grandma, Grandpa, Reed, Rocko, Sandy, Shelley | 10個: 유나（ユナ。プレミアム、**デフォルト音声**）, 유나, Eddy, Flo, Grandma, Grandpa, Reed, Rocko, Sandy, Shelley | 28個（Samantha など OS の音声） |
| Playwright の拡張機能無効化フラグを外した場合 | 200 | 上記9個 + **`Google 日本語`(`localService=false`)** | 上記10個 + **`Google 한국의`(`localService=false`)** | + `Google US English`(`localService=false`) |

- 文単位の再生（2文, ja-JP, rate 1）は、headless と headful のどちらも `onend` まで正常に終了しました。[High]
- この Mac では headless と headful の一覧が同じでした。他の OS や他の Chrome バージョンでは異なる可能性があります。[High]
- **一般ユーザーの Chrome には Google のリモート音声が表示されます。** Playwright がデフォルトでコンポーネント拡張を無効にするため、初回実行の一覧からだけ抜けていました。したがって「最初の ja-JP 音声」を無条件に選ぶと、リモート音声が選ばれる可能性があります。[High]
- PoC で確認した落とし穴：スクリプトの `［빈칸］`（空欄）を単に消すと、「を志望した理由は…」のように文頭が欠けた状態で読まれます。空欄は「まるまる」に置き換えて読むか、短いポーズとして処理する必要があります。[High]
- コンソールの 404 1件は favicon の要求です。CSP 違反は0件です。

### 1-4. 内蔵音声の試聴結果（2026-11-03、ユーザー判定、この Mac の Chrome）
同じ敬語スクリプト1つを rate 1.0 で聴きました。
- **合格：`Kyoko`（デバイス、`localService=true`）、`Google 日本語`（リモート、`localService=false`）。** [High]
- **不合格：** Eddy, Flo, Grandma, Grandpa, Reed, Rocko, Sandy, Shelley. [High]
- フォールバックのルールを変更します。「最初の ja-JP 音声」や「`localService=true` のどれか」ではなく、**名前の許可リスト**で選びます：`Kyoko` → `Google 日本語` の順です。どちらもなければ不合格の音声で読み上げず、ボタンを隠すか「この端末には使える日本語音声がありません」と表示します。[Medium]
- 懸念点1：`Google 日本語` はリモート音声のため、スクリプトのテキストが Google のサーバーに送られます（§1-1 個人情報）。この音声を使う場合は `privacy.html` で告知する必要があり、長い発話が約15秒で途切れるバグのため、文単位の再生が必須です。[Medium]
- 懸念点2：`Kyoko` は macOS・iOS の音声で、`Google 日本語` はデスクトップの Chrome にしかありません。Windows の Edge・Firefox、Android でどの音声が選ばれるかは聴いていません。[Unknown]
- クラウド音声（§2）はまだ聴けていません。AI Gateway の残高が $0 のため、サンプルを生成できませんでした（`/v1/credits` の応答 `balance: "0"`、11/03 確認）。[High]

---

## 2. クラウド TTS の比較（品質優先、Vercel の Node 関数から呼び出し）

**共通の事実：** 日本語 TTS の品質を独立に比較したベンチマークはありません。Artificial Analysis TTS Arena（<https://artificialanalysis.ai/text-to-speech/leaderboard>）は第三者のブラインド投票ですが、英語だけを扱っています。[High]

| ベンダー・モデル | ja / ko / en | 日本語の読み・アクセント制御 | ストリーミング・遅延 | 250字の原価 | 無料 | 保存・学習 | 法人・地域 | 呼び出し方式 |
|---|---|---|---|---|---|---|---|---|
| **ElevenLabs** v4・v3・Multilingual v2 / Flash v2.5・v4 Turbo | ○ / ○ / ○（Flash v2 は英語専用） | **事実上なし。** 音素タグは英語専用モデルのみ対応し、日本語は alias 辞書と `apply_language_text_normalization`（遅延が大きく増えることがある）だけ | 対応。Flash/Turbo 約100ms（ベンダーの主張） | v3/v4 $0.08/1K字 → **$0.02** / Flash $0.04 → $0.01。Gateway の表記では v3 $40/1M | 無料プランあり（文字数 [Unknown]） | **入出力を学習に使うのがデフォルト。** アカウント設定でオフにできる。無保存は Enterprise 専用 | Eleven Labs Inc.（米国）。データは米国に保存 | fetch, `xi-api-key` |
| **Google Cloud TTS** Chirp 3 HD（ja-JP 30種） | ○ / ○ / ○ | API に `PHONETIC_ENCODING_JAPANESE_YOMIGANA` がある（`^`, `!` でピッチアクセント、東京方言のみ）。Chirp 3 HD で使えるかは [Unknown] | 双方向ストリーミング。遅延 [Unknown] | $30/1M → **$0.0075** | 月100万字 | "does not log any customer Cloud TTS text or audio data" | Google。`asia-northeast1`（東京） | REST。API キーを使えるかは [Unknown]。使えなければサービスアカウントの JWT 署名が必要（`node:crypto` で依存関係なしに可能） |
| **Google Gemini 3.8 Flash TTS**（Gateway では `google/gemini-3.8-flash-tts`） | ○ / ○ / ○ | 自然言語の `instructions`（速度・トーン）。読みの指定は [Unknown] | Gateway 経由ではストリーミングなし | 25 audio tokens/秒 × 60秒 × $9/1M → **約 $0.0135**（2027-01 から2倍） | Gemini API の無料枠は**製品改善に使われる** | Gateway デフォルトで ZDR | Google | Gateway REST(base64 JSON) |
| **Azure AI Speech** Nanami・Keita など Neural, Nanami/Masaru DragonHD | ○ / ○ / ○ | SSML `phoneme`（ja-JP はかなベースの sapi）, `sub alias`, PLS 辞書。ドキュメントに "pitch accent" という語はない。DragonHD で使えるかは [Unknown] | REST ストリーミング形式。遅延 [Unknown] | Neural $15/1M → **$0.00375**。DragonHD の価格は表で "N/A" のため [Unknown] | 月50万字（F0） | リアルタイム合成のテキスト・音声を保存しない | Microsoft。**Japan East/West, Korea Central** | fetch, `Ocp-Apim-Subscription-Key` + SSML。接続が最も単純 |
| **Amazon Polly** Neural (Takumi, Kazuha, Tomoko) | ○ / ○ / ○（**日本語の generative 音声なし**） | `x-amazon-pron-kana` で `'` によりアクセントを指定（ドキュメント化済み） | 準リアルタイムのストリーミング | $16/1M → **$0.004** | Neural 月100万字（12か月） | 入力テキストを保存・利用することがある（Organizations のポリシーで拒否可能） | AWS。東京リージョン | SigV4 署名が必要。SDK なしで使うには自前で実装する必要があり、ハッカソンには非推奨 [Medium] |
| **OpenAI** gpt-4o-mini-tts | ○ / ○ / ○ | `instructions` のみ。"Voices are currently optimized for English" | chunked ストリーミング | トークン課金（$12/1M audio out） | — | 学習なし、30日間の abuse ログ、ZDR 対象 | OpenAI（米国） | fetch |
| → **除外理由** | | | | | | | | **tts-1, tts-1-hd, gpt-4o-mini-tts はいずれも 2027-01-06 に終了予定**（公式ガイド）。代替モデルは Realtime API 専用です。 |
| **Fish Audio** s2.1-pro | ja の対応リスト [Unknown]（S1 は ja・ko を明記、2026-12-31 終了） | [Unknown] | TTFA 100ms（ベンダーの主張） | **UTF-8 バイト課金**のため日本語は3倍。$15/1Mバイト → 約 $0.011 | 無料モデルあり（DPA の保証なし） | 学習利用の有無 [Unknown] | 米国 Dover, DE | 認証ヘッダー [Unknown] |
| **Cartesia** sonic-3.6 | ○ / ○ / ○ | 発音辞書（日本語に適用できるか [Unknown]） | [Unknown] | 1字 = 1クレジット。料金プランで換算すると約 $0.0125 | 月2万クレジット | **学習利用がデフォルト** | プライバシーポリシーに "**米国ユーザー専用**" と明記 → 日本の利用者向けには不適 | fetch, Bearer |
| **Aivis Cloud API**（日本語特化） | ja 専用 | [Unknown] | 再生開始まで最短0.3秒 | 440円/1万字 → **11円** | 登録時に500円のクレジット | "AIモデルの学習に利用しません" | Walkers Inc.（日本と推定 [Medium]）。日本の事業者であれば国外移転の告知が不要な可能性がある | 認証方式 [Unknown] |
| **VOICEVOX** | ja 専用 | `'` でアクセント位置を指定、ユーザー辞書の `accent_type`。**唯一アクセントを明示的に編集可能** | 自前サーバー | 無料（クレジット表記が必須。ずんだもん などをクレジットなしで使うにはキャラクターごとに40万円+税） | — | 自前運用のため外部送信なし | — | **Vercel 関数の中では実行不可。** Docker サーバーを別途運用する必要がある。5日間の日程には合わない [Medium] |

出典：ElevenLabs https://elevenlabs.io/docs/overview/models , https://elevenlabs.io/pricing/api , https://elevenlabs.io/docs/best-practices/prompting/controls , https://elevenlabs.io/privacy-policy / Google https://docs.cloud.google.com/text-to-speech/docs/chirp3-hd , https://cloud.google.com/text-to-speech/pricing , https://docs.cloud.google.com/text-to-speech/docs/data-logging , https://ai.google.dev/gemini-api/docs/speech-generation , https://ai.google.dev/gemini-api/docs/pricing / Azure https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-ssml-phonetic-sets , https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-text-to-speech , https://learn.microsoft.com/en-us/azure/ai-foundry/responsible-ai/speech-service/text-to-speech/data-privacy-security / Polly https://docs.aws.amazon.com/polly/latest/dg/available-voices.html , https://docs.aws.amazon.com/polly/latest/dg/phoneme-tag.html / OpenAI https://developers.openai.com/api/docs/guides/text-to-speech , https://developers.openai.com/api/docs/pricing / Fish https://docs.fish.audio/developer-guide/models-pricing/pricing-and-rate-limits / Cartesia https://cartesia.ai/legal/privacy / Aivis https://aivis-project.com/cloud-api/ / VOICEVOX https://voicevox.hiroshiba.jp/term/ , https://github.com/VOICEVOX/voicevox_engine

**Anthropic(Claude API)には TTS も STT もありません。** 公式 API 概要に載っているエンドポイントは Messages, Batches, Token Counting, Models, Files, Skills と Managed Agents 系だけです。音声生成・文字起こしのエンドポイントはありません（<https://platform.claude.com/docs/en/api/overview>）。[High]
Claude アプリにある音声モードは一般消費者向けアプリの機能であり、API ではありません。[Medium]

### TTS の順位（品質優先、スクリプト1つあたり $0.01–0.05）
聴き比べの前に立てた順位です。日本語の品質の根拠がないため、実測で覆る可能性があります。
1. **ElevenLabs v3 / v4 — 自然さへの期待値が最も高いです。**
   - 根拠：英語アリーナで1位圏です。日本語の根拠は [Unknown] です。
   - 弱点1：漢字の読みを直す手段が事実上ありません。
   - 弱点2：学習利用がデフォルトのため、アカウント設定で必ずオフにする必要があります。
2. **Google Chirp 3 HD または Gemini 3.8 Flash TTS — バランス型です。**
   - 長所：ログを残さず、無料枠があり、東京リージョンがあります。
   - Gemini は Gateway にそのまま接続できます。
3. **Azure Neural / DragonHD — 制御型です。**
   - 長所：かなの音素で読みを直せ、Japan East リージョンがあり、接続が最も単純です。
   - DragonHD の価格は [Unknown] です。
- **選定ルール：** 11/4 に敬語スクリプト3つ（空欄・数字・「させていただきます」を含む）を3候補で合成します。「読み間違いの数」と「イントネーションの自然さ」を5段階で聴いて決めます。同点なら、個人情報の条件が良い Google または Azure を選びます。

---

## 3. クラウド STT の比較（フィラーの原文保持が必須）

**共通の事実：** 日本語でフィラー（えーと・あの・なんか）を原文どおり残すとドキュメントに書いたベンダーは**ありません。** [High]
日本語の WER/CER の数値はすべてベンダー自身が測定した値で、第三者による測定値は見つかりませんでした。[High]

| ベンダー・モデル | ja / ko / en | 日本語の精度の根拠 | フィラーの原文保持 | 受け付ける形式・サイズ | 同期処理・ストリーミング | 90秒の原価 | 無料 | 保存・学習 | 法人・地域 | 呼び出し方式 |
|---|---|---|---|---|---|---|---|---|---|---|
| **OpenAI `gpt-transcribe`**（推奨モデル） | 言語リストの記載なし。多言語ヒントに対応 [Medium] | [Unknown]（FLEURS で優位という主張はベンダーのブログ） | prompt の活用例に "Preserving … filler words" がある。日本語への言及なし → 実測が必要 [Medium] | mp3, mp4, m4a, wav, **webm** / 25MB。この一覧は STT ガイド全体についての説明で、`gpt-transcribe` のモデルページには形式・最大入力が書かれていません → このモデルにも適用されるかは [Medium] | 同期応答、`stream=true` 可能 | $0.0045/分 → **$0.0068** | [Unknown] | **学習なし、文字起こしの abuse 保存なし、ZDR 対象** | OpenAI（米国）。JP リージョンは保存のみ域内、処理は域外 | fetch multipart(Node `FormData`) |
| OpenAI gpt-4o-transcribe / mini / whisper-1 | 同じ | 同じ | 同じ | 同じ | 同じ | $0.009 / $0.0045 / $0.009 | | 同じ | 同じ | **2027-02-26 に終了予定** → 新たに接続しない |
| **ElevenLabs Scribe v2** | ○(ja "Excellent", ko "Good") / ○ | ja ≤5% WER の等級（ベンダーの主張、データセットの記載なし） | `no_verbatim=true` のときだけフィラーを削除。デフォルト値の記載なし、日本語への言及なし [Medium] | webm, opus, aac, m4a, mp4 / 3–5GB | 同期。リアルタイムモデルは別にある | $0.22/時間 → **$0.0055** [Medium] | 無料プランで STT 4.5時間 [Medium] | **学習ライセンスがデフォルト**（設定でオフにできる）。無保存は Enterprise 専用 | Eleven Labs Inc.（米国） | fetch multipart, `xi-api-key` |
| Azure fast transcription | ○ / ○ / ○ | [Unknown] | **display form だけを返し、display form は disfluency removal の対象** → フィラーが削除されるリスクが最も大きい | webm・ogg・aac / 500MB | 同期 | 価格表 "N/A" [Unknown] | リアルタイム 月5時間 | リソースのリージョン内で処理 | **Japan East** | fetch multipart |
| Azure MAI-Transcribe-2 | ja の可否 [Unknown]（60言語） | [Unknown] | **`transcribeStyle` のデフォルト値が `verbatim`("keeps fillers and false starts")** — ドキュメント上は最も有利 | **WebM・MP4 不可**(WAV, MP3, FLAC, Ogg/Opus) | 同期。プレビュー（SLA なし） | Gateway の価格表示なし [Unknown] | | | 日本リージョンなし | ブラウザの録音を変換する必要があるため除外 |
| Deepgram Nova-3 | ○ / ○ / ○ | [Unknown] | `filler_words` は**英語専用** | webm, mp4 など | | $0.0043/分 → $0.0065 | $200 クレジット | **学習（MIP）がデフォルト**。`mip_opt_out=true` でオフ | 米国。EU・AU・IN リージョン | — |
| AssemblyAI U3.5 Pro / U2 | ja ○, ko は U2 のみ | U2 ja "≤10% WER" の等級（ベンダーの主張） | `disfluencies` は日本語**対象外**（英語または6言語） | | 非同期 polling | $0.21/時間 → $0.0053 | $50 クレジット | 条件付きで学習に利用。transcript を30日間保存 | 米国。EU リージョン | — |
| Google STT V2 Chirp 3 | ○ / ○ / ○ | [Unknown] | [Unknown] | 10MB | **同期処理は約1分までのため、90秒の回答は不可。** GCS を経由する batch が必要 | $0.016/分 → $0.024 | | ログを残さない | `us`, `eu` | 除外 |
| Web Speech `SpeechRecognition` | ○ | — | 制御不可 | ブラウザ内蔵 | リアルタイム | $0 | — | Chrome は Google のサーバー | — | 補助手段としてのみ |

出典：https://developers.openai.com/api/docs/guides/speech-to-text , https://developers.openai.com/api/docs/models/gpt-transcribe , https://developers.openai.com/api/docs/guides/your-data / https://elevenlabs.io/docs/capabilities/speech-to-text , https://elevenlabs.io/docs/api-reference/speech-to-text/convert / https://learn.microsoft.com/en-us/azure/ai-services/speech-service/fast-transcription-create , https://learn.microsoft.com/en-us/azure/ai-services/speech-service/display-text-format , https://ai-sdk.dev/providers/ai-sdk-providers/azure / https://developers.deepgram.com/docs/filler-words , https://developers.deepgram.com/trust-security/your-data / https://www.assemblyai.com/docs/pre-recorded-audio/include-filler-words.md , https://www.assemblyai.com/docs/data-retention-and-model-training.md / https://docs.cloud.google.com/speech-to-text/quotas , https://cloud.google.com/speech-to-text/pricing

### STT の順位
1. **OpenAI `gpt-transcribe`**
   - ブラウザの録音形式（webm, mp4）を変換なしで受け付けます。ただし、この根拠は STT ガイドの共通形式一覧です [Medium]。webm が拒否されると1位に置いた根拠（「変換なし」）が弱まるため、11/4 の実測で最初に確認します。
   - 個人情報の条件が最もクリーンです（学習なし、文字起こしの保存なし）。
   - `prompt` に「えーと、あの、なんか、そのー」のようにフィラーの入った例文を入れて、原文の保持を促せます。この方法は [Medium] です。
2. **ElevenLabs Scribe v2**
   - ドキュメントの構成上、フィラーを残す側がデフォルトに見えます（削除するにはフラグが必要）。
   - 日本語の精度も、ベンダーの主張では最も良好です。
   - その代わり学習利用がデフォルトのため、アカウント設定で必ずオフにする必要があります。
- **決定ルール：** 11/4 にフィラーを含む日本語の録音5つ（架空の文、各30–60秒）を2ベンダーに入れます。コストは $0.05 未満です。
  - フィラーの保持率が高い方を選びます。
  - どちらも50%未満なら、UI の案内（直接入力）に頼ります。

---

## 4. 統合設計（最小案、新しい npm 依存関係0）

### 4-1. TTS: `POST /api/tts`
- **流れ：** アクセスコード → 既存の `lib/guard.js` によるレート制限 → 検証 → ベンダー呼び出し → 応答（`audio/mpeg`）。
  - 検証：`text` は文字列で、長さの上限を設けます（例：300字）。`lang` は `EXPLAIN_LANGS` ではなく**目標言語**（現在は `ja`）です。
  - Gateway を使う場合は base64 JSON を受け取ってデコードし、バイトとして返します。
- **サイズ：** 60秒の mp3 は約0.5MB以下のため、応答の上限 4.5MB に余裕があります。[High: https://vercel.com/docs/functions/limitations]
- **文単位の再生：**
  - クライアントが `s.ja` を「。！？」で区切り、**文ごとにリクエスト**します。
  - 課金は文字数基準のため、文ごとに分けてリクエストしても総コストは同じです。
  - 結果は `Map(文+音声 → Blob)` にキャッシュし、聴き直しや繰り返し再生のときに再リクエストしません。
  - サーバーや CDN のキャッシュは作りません（POST であり、デモの規模では不要）。
- **速度調整：** クライアントで `audio.playbackRate`(0.75 / 1 / 1.25)で切り替えます。ブラウザのデフォルト値 `preservesPitch=true` のおかげで音の高さはそのままです。再合成の必要はありません。[High: https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/preservesPitch, デフォルト値 true, 2023-12 から Baseline]
- **空欄の処理：** `［…］` は「まるまる」に置き換えて読みます。単に削除すると文が崩れます（PoC で確認）。
- **CSP：** `vercel.json` の CSP に `media-src 'self' blob:` を追加します。`default-src 'self'` は `blob:` を許可しません。[High]
  - 代替案として `AudioContext.decodeAudioData` を使えば CSP を変更せずに済みます。ただし、この方式では再生速度を変えると音の高さも一緒に変わります。
- **フォールバック：** 応答がエラーの場合やキーがない場合は、`speechSynthesis`（`localService=true` 優先）で同じ文を読み上げます。画面には「端末の音声で読み上げます」と表示します。
- **AI 音声の告知：** OpenAI のポリシーは AI 音声であることを知らせるよう求めており、他のベンダーも同様の慣行です。再生ボタンの横に「AI 音声」と表記します。

### 4-2. STT: `POST /api/stt`
- **録音：** クライアントで `getUserMedia({audio:true})` → `MediaRecorder` で録音します。
  - mimeType は `MediaRecorder.isTypeSupported` で選びます。Chrome・Firefox は `audio/webm;codecs=opus`、Safari は `audio/mp4` です。
  - `audioBitsPerSecond: 32000` を指定し、録音は**120秒で自動停止**します。
- **送信：** リクエスト本文は**録音 Blob をそのまま**送り、`content-type` に形式を記載します。base64 はサイズが33%増えるため使いません。
  - 32kbps × 120秒 ≈ 0.5MB で、リクエストの上限 4.5MB に十分収まります。[High]
  - **クライアントのコードは経路に関係なく同じです。** Gateway 経路（§5-1）を選んだ場合は、サーバーが受け取った Blob を base64 JSON に変換して Gateway に送ります（Gateway REST は multipart を受け付けない）。0.5MB が約0.67MB に増えても問題ありません。
- **サーバー：** アクセスコード → レート制限 → サイズ・形式の検証 → OpenAI `/v1/audio/transcriptions`（multipart: `model=gpt-transcribe`, `language` ヒント, フィラーの例文を入れた `prompt`） → `{ text }`。
- **画面：** 文字起こしの結果を**入力欄（`#input`）に入れ、自動では送信しません。** ユーザーが確認してから Ctrl/Cmd+Enter で送信します（既存の流れを再利用）。
  - こうすることで `/api/review` と `/api/script`、そして `maskInput` をそのまま通ります。
- **言語：** 目標言語（ja）と母語（ko）のどちらで話すかの切り替えは置かず、2つの言語を一緒にヒントとして渡します。母語で答える場合 [Medium] も、現在の `/api/script` の流れと同じです。
- **個人情報：** 音声はマスキングなしで元の録音のまま STT ベンダーに送られます（PDF・画像の添付と同じ扱い）。プライバシーポリシーに記載する必要があります。
- **非対応環境：** `navigator.mediaDevices?.getUserMedia` や `MediaRecorder` がなければマイクボタンを隠し、タイピングだけにします。権限が拒否された場合は、エラーコード `mic_denied` を i18n の文で表示します。

### 4-3. 変更が必要なファイル（実装時）
| ファイル | 変更 |
|---|---|
| `vercel.json` | CSP に `media-src 'self' blob:` を追加します。`Permissions-Policy` に `microphone=(self)` を明記します。現在 microphone がリストにないため、デフォルト値 `self` ですでに許可されていますが、意図を明確にするために記載します（MDN: "The default allowlist for `microphone` is `self`"）。`functions` に `api/tts.js`・`api/stt.js` の `maxDuration` を追加します。 |
| `dev.js` | ルートを2つ追加します。`MOCK_CLAUDE=1` のときに使う固定応答（短い無音の mp3、固定の文字起こし文）を追加し、テストのトークンを0に保ちます。 |
| `public/privacy.html` | §2 に「音声録音：文字起こしにのみ使用、サーバーに保存しない、自動マスキング不可」を追加します。§3 の委託先に STT ベンダー（OpenAI、米国）と TTS ベンダーを追加します。TTS に Google・Azure・ElevenLabs のどれを使っても米国の事業者なので、"米国の事業者" の文はそのまま維持できます。Gateway を使う場合は、Vercel を経由する事実と実際の処理ベンダーを併記します。OpenAI の JP エンドポイント（`jp.api.openai.com`）は保存だけを日本国内で行い、処理は日本国外で行うため、**使っても国外移転の告知はそのまま必要です。** |
| `public/i18n/{ko,en,ja}.js` | `tts.play`, `tts.stop`, `tts.speed`, `tts.sentence`, `tts.aiVoice`, `tts.deviceVoice`, `mic.start`, `mic.stop`, `mic.recording`, `mic.transcribing`, `mic.checkBeforeSend`（口ぐせが抜けている可能性があるという案内を含む）, `mic.unsupported` とエラーコード `tts_failed`, `stt_failed`, `mic_denied`, `audio_too_long`。`test/i18n.test.js` が欠けているキーを検出します。 |
| `README` | 音声ベンダーとその役割を記載し、「Claude は採点・生成のみを担当する」ことを明記します。 |

---

## 5. ユーザーが行う作業

1. **（5分）Gateway の音声機能へのアクセス確認：** Vercel ダッシュボード → AI Gateway → Models で、`audio:speech` と `audio:transcription` のモデルが当チームに表示されるか確認します。
   - 表示されれば、`AI_GATEWAY_API_KEY`（ローカル専用、Vercel のデプロイは OIDC）1つですべてのベンダーを使えます。
   - 表示されなければ、以下のようにベンダーに直接登録します。
2. **ベンダーに直接登録する場合に必要な環境変数**（非公開の `secrets/.env` にのみ置きます）:
   - STT: `OPENAI_API_KEY`
   - TTS（聴き比べの後に1つだけ）: `ELEVENLABS_API_KEY`、`AZURE_SPEECH_KEY` と `AZURE_SPEECH_REGION=japaneast`、Google（API キーが使えれば `GOOGLE_TTS_API_KEY`、使えなければサービスアカウントの JSON） のうち1つ
3. **ElevenLabs を選んだ場合は**、アカウント設定で学習利用を必ずオフにします。
4. **11/4 の実測2つ：** TTS の聴き比べ30分（§2 選定ルール）と STT のフィラー保持テスト（§3 決定ルール）。どちらも架空の文だけを使います。
5. **決済手段の登録と利用上限の設定：** ベンダーのコンソールや Gateway の予算で、月 $10 程度の上限をかけます。

## 6. 確認できなかったこと
- すべてのベンダーの日本語 TTS の品質と、日本語のフィラー保持：実測が必要です。
- `gpt-transcribe` が受け付ける形式（webm・mp4）と最大入力：モデルページに書かれていません。
- Google Cloud TTS で API キー認証が許可されるかどうかと、Chirp 3 HD でよみがなのピッチアクセントを使えるかどうか。
- Azure DragonHD の価格、MAI-Voice・MAI-Transcribe の日本語対応の可否。MAI-Voice-2 は発表告知に日本語がなく、カタログにはあるため食い違っています。
- Safari `SpeechRecognition` の Siri への依存（WebKit の原文未確認）、Chrome のデバイス内認識の ja/ko 言語パック。
- 当チームが Vercel AI Gateway の音声ベータにアクセスできるかどうか。

## §1-5 試聴判定（11/03、ユーザー）

- Gemini API（無料キー）で同じ敬語スクリプト（約230字）を生成して試聴しました。**g1~g4 すべて合格**です。
  - g1 `gemini-3.8-flash-tts` Kore 12.0秒 / g2 Charon 11.0秒 / g3 Aoede 12.3秒 / g4 `gemini-3.8-flash-lite-tts` Kore 6.8秒
  - `gemini-2.5-pro-preview-tts` は無料キーで 429（上限）となり、生成できませんでした。
- 決定（提案）：デフォルトは `gemini-3.8-flash-lite-tts` + Kore（最速、品質合格）。オプションで男性音声 Charon を選択。失敗時はブラウザ内蔵の Kyoko → Google 日本語 の順。
- 設計条件：文単位の生成と最初の文の優先再生、同じスクリプトはキャッシュ、`vercel.json` に `media-src 'self' blob:`、プライバシーポリシーに Google(Gemini API)への委託を告知。無料枠の1日の上限とデータ利用条件は原文の確認が必要 [Medium]。
- **決定（11/03、ユーザー）**: 音声処理（TTS・STT）は当面 Gemini の無料枠で運用し、提出後に有料・上位モデル（有料枠のデータ処理、高い上限、原文どおりの文字起こし）に切り替えます。根拠・補完策：PRD §15.6 決定、§15.5-5。
