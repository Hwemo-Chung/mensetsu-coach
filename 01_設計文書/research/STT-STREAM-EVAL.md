# 回答の音声入力ストリーミング（話している間に文字を表示）の実現可能性検証 — 2026-11-03

結論から申し上げます。**ストリーミングは技術的に可能です**（Node PoC で確認、ブラウザは未検証）。ただし **Live モデルでも「そのままの文字起こし」にはなりません。** `mode: "VERBATIM"` を明示しても、できるです→できます（文法の修正）、なんか→何か、韓国語の間投詞（음・어・그니까。「うーん」「えー」「だから」に相当）4/4 の削除がそのまま起きました。そのためストリーミングは体感速度を改善するだけで、発音・文法添削の精度の問題は解決しません。

## 1. 公式文書の確認（出典）

`ai.google.dev/...` のリンクは 2026-11 現在、`aistudio.google.com/docs/...` へ 301 リダイレクトされます。

- Live 文字起こしガイド: https://aistudio.google.com/docs/live-api/live-transcribe
- Live API リファレンス: https://aistudio.google.com/api-reference/live
- WebSocket 入門: https://aistudio.google.com/docs/live-api/get-started-websocket
- 一時トークン（ephemeral token）: https://aistudio.google.com/docs/live-api/ephemeral-tokens
- 料金: https://aistudio.google.com/docs/pricing#gemini-3.5-transcribe-live
- 非ストリーミング文字起こし（モード説明）: https://aistudio.google.com/docs/transcribe#transcription-modes

### 1-1. エンドポイントとメッセージ形式 [High]
- API キーで接続: `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=…`
- 一時トークンで接続: `…GenerativeService.BidiGenerateContentConstrained?access_token={token}`。ブラウザの WebSocket はヘッダを付けられないため、クエリパラメータ方式しか使えません。
- setup メッセージ: `{ setup: { model: "models/gemini-3.5-transcribe-live", generationConfig: { responseModalities: ["TEXT"] }, inputAudioTranscription: { languageCodes: ["ja-JP"], mode: "VERBATIM" } } }` → サーバーが `{ setupComplete }` で応答します。
- 音声送信: `{ realtimeInput: { audio: { data: <base64 PCM16 LE mono>, mimeType: "audio/pcm;rate=16000" } } }`。文書の推奨チャンクサイズは 100 ms で、PoC は 40 ms で送りました。
- 受信メッセージ:
  - `serverContent.interimInputTranscription.text`: 話している間に更新される暫定結果です。**現在の発話区間（VAD 区間）内で累積された文**が毎回送り直されます。その区間の最終結果が出ると、次の暫定結果は最初からやり直しになります（実測: ja1 で英語の最終結果が出た後、次の暫定結果が「えっと、」から始まった）。UI では暫定結果で現在区間のプレビューを置き換え、最終結果は後ろに連結すれば足ります。
  - `serverContent.inputTranscription.text`: 発話が終わったとき（VAD）に確定する最終結果です。
  - `voiceActivity { type: ACTIVITY_START|ACTIVITY_END, audioOffset }`: 発話の開始・終了の信号です（実測）。
  - `serverContent.generationComplete`
- 終了:
  - 自動 VAD（既定）の場合: `{ realtimeInput: { audioStreamEnd: true } }`。文書上は「ハイブリッド VAD」で、サーバーの沈黙待ちなしに即座に確定します。
  - 手動 VAD の場合: `automaticActivityDetection.disabled: true` を設定した上で `activityStart`/`activityEnd` を送ります。
  - セッションの最大長は 10 分です。
- `mode` は `VERBATIM`（既定）と `SMART` の 2 種類です。文書は VERBATIM が「フィラー・繰り返し・言いよどみを保持する」と説明しています。**実測はこの説明と異なります**(§3)。
- 文字起こしメッセージのフィールドは `text, languageCode, startOffset, endOffset` のみで、**信頼度（confidence）フィールドはありません。** PoC では `text` 以外のフィールドは何も入って来ませんでした。
- [Medium, 未呼び出し] capabilities 文書は、ネイティブ音声モデルが応答モダリティとして `AUDIO` のみをサポートすると説明しており、対象モデルの一覧に 3.8 Live が含まれています。ただし `gemini-3.8-live` がネイティブ音声モデルかどうかは直接確認していません。もしそうであれば、文字起こしだけが必要なのに音声出力の費用まで払うことになるため、代替案として適しません。

### 1-2. 一時トークン [High: 実測]
- `POST https://generativelanguage.googleapis.com/v1beta/auth_tokens`、ヘッダ `x-goog-api-key`。この無料枠のキーで**発行に成功**しました（353–411 ms）。応答フィールドは `name`(`auth_tokens/…`)の一つだけです。
- **文書例の REST フィールド名 `liveConnectConstraints` は 400 エラーになります**("Unknown name")。REST では API リファレンスに記載の `bidiGenerateContentSetup: { model, generationConfig, inputAudioTranscription }` を使うと動作します。SDK は内部で変換しているものと思われます [Medium]。
- 既定値: `uses` 1（1 回のセッション）、`newSessionExpireTime` 60 秒（この時間内に接続する必要あり）、`expireTime` 30 分（最大 20 時間未満）。PoC はそれぞれ 1 回・60 秒・5 分に設定しました。
- トークンをモデルと設定に固定できます。ただし、クライアントが別の setup を送った場合に拒否されるのか、サーバー側の設定で上書きされるのかは確認できていません [Unknown]。
- 無料枠で使えるかどうかは文書に書かれていませんが、実測では発行もセッションも可能です。無料枠の RPM 上限は確認できていません [Unknown]。
- 料金: 無料枠は無料です。有料は入力 $0.005/分、出力 $0.004/分です。**無料枠は "Used to improve our products: Yes" です。** 面接回答の音声が Google の学習に使われる可能性があるため、`privacy.html` での告知が必要です [High: 料金ページ]。

## 2. PoC 実測（Node 24 内蔵 WebSocket、一時トークン → Constrained WS）

- スクリプト: `scratchpad/stt-live/poc.mjs`（リポジトリ外）
- 実際の API 呼び出し 9 回: トークン発行 5 回（うち 1 回はフィールド名エラー）+ セッション 4 回
- 入力: `stt-exp/*.wav`（TTS で生成、24 kHz）をコードで 16 kHz に線形リサンプルした後、40 ms のチャンクを実時間の速度で送り、末尾に無音 1.2 秒を付けました。

| 項目 | ja1 | ja2 | ja3 | ko1 |
|---|---|---|---|---|
| 音声の長さ | 14.0 s | 16.0 s | 9.3 s | 10.8 s |
| WS open → setupComplete | 0.83 s | 1.25 s | 1.46 s | 0.84 s |
| 最初の暫定結果（音の開始基準） | 0.98 s | 0.90 s | 0.92 s | 1.45 s |
| 暫定結果の更新間隔（中央値） | 488 ms | 480 ms | 486 ms | 479 ms |
| 最終結果（音声終了基準） | +0.82 s | +0.93 s | +0.94 s | +0.97 s |
| フィラーの保持 | 3/4 | 5/6 | 4/5 | **0/4** |

- ボタンを押してから文字起こしの準備ができるまで約 1.3–1.9 秒かかります（トークン発行 0.4 s + 接続 0.06 s + setup 0.8–1.5 s）。その間に録音した音はクライアントのバッファに貯めておき、後から送れば済みます [High: 実測]。
- 最終結果が遅れて届く理由は、サーバー VAD の沈黙待ち（約 0.8 s）です。ハイブリッド VAD（送信時に `audioStreamEnd`）を使えば速くなると文書にありますが、測定はしていません [Medium]。

### 原文の保持有無（核心）
| | 原文 | Live 最終 (VERBATIM) | 性質 |
|---|---|---|---|
| ja2 | まとめることが、**できるです** | まとめることが**できます** | **文法の修正 → 添削対象の誤りが消える** |
| ja3 | 逆に、**なんか**、 | 逆に**何か** | 表記の正規化。「何か」は通常「なにか」と読むため、発音情報も消える |
| ja3 | ございますです | ございますです | 保持 |
| ja1 | えーと | えっと | フィラーの種類が変わる（音声が曖昧だった可能性あり） |
| ko1 | 음, 저는 어, … 그니까, … 어, | 저는 전 회사에서 …. 매출을 20% 올렸습니다.（私は前の会社で…。売上を20%上げました。） | **間投詞をすべて削除**、数字の正規化（이십 퍼센트（二十パーセント）→20%） |

- TTS が最初から「できます」と読んだわけではありません。同じ ja2.wav をバッチの `gemini-3.5-flash-lite` で文字起こしすると「できるです」が出ました（6/6 保持、`stt-exp/results-final.json`）。つまり音声には誤りが実際に含まれており、修正は transcribe 系モデルが行ったものです [High]。ko1 でも暫定結果に「어」が見えたため、音声に間投詞が含まれていた証拠になります。
- この問題は暫定結果でも一貫していません。
  - ko1 の暫定結果には "어"、"그러니까"（だから） がありましたが、最終結果で消されました。
  - ja2 は逆に、暫定結果で「えー」「なんか」が一時的に抜けた後、最終結果で戻りました。
  - ja2 の「できます」は暫定結果の段階からすでに修正されていました。
- 先に測定したバッチの `gemini-3.5-transcribe` と同じ傾向です。同じモデル系統なので、バッチを文書上モードパラメータがある `/v1beta/interactions` API に切り替えても、結果は変わらない可能性が高いです [Medium]。現在の `lib/stt.js` はモードパラメータのない `generateContent` を使っています。
- 実験の汚染: ja1 と ja2 の WAV 冒頭約 5.6 秒に、TTS が指示文（"Read aloud exactly as written…"）を英語で読み上げた音が入っています。
  - ja1 ではこの英語が別の最終結果として出ました。
  - ja2 では ja-JP ヒントを与えた状態で、英語区間が暫定結果にだけ現れ、**最終結果では何の表示もなく抜け落ちました。** 最終結果が発話内容の一部を黙って捨てうるという証拠です [Medium]。
- 限界: すべての入力が TTS 音声です。実際の人の声、イントネーション、ノイズ、非ネイティブの発音では、正規化がさらに強くなる可能性が高いです [Medium]。

## 3. ブラウザでの実装可能性（実行せずに判断）

- マイクキャプチャ
  - `getUserMedia` → `AudioWorklet` で Float32 サンプルを受け取り、16 kHz の Int16 に変換します。
  - ワークレットを同一オリジンの別ファイル（`public/pcm-worklet.js`）にすれば、CSP `script-src 'self'` をそのまま守れます [High]。
  - 既存の `Permissions-Policy: microphone=(self)` 設定はそのまま使えます [High: vercel.json]。
  - Safari は `AudioContext({ sampleRate: 16000 })` の要求に確実には従わないため、ワークレット内で自前でダウンサンプルする必要があります。Safari 14.1 から AudioWorklet をサポートしています [Medium: MDN 未確認]。
- CSP: `connect-src 'self' wss://generativelanguage.googleapis.com` の追加が必要です [High]。
- サーバー（新規）: `POST /api/stt-token` エンドポイントが必要です。
  - 処理順は既存ハンドラと同じです: アクセスコード確認 → rate limit → `auth_tokens` 発行。
  - トークンには `uses: 1`、`newSessionExpireTime` 60 秒、`expireTime` 2–5 分、そしてモデル・`mode: VERBATIM`・言語の固定をかけます。
  - 応答は `{ token }` のみを返します。キーは決して外に出しません。キーなしや発行失敗は、既存の方式どおり `{ code }` で返します [High: 設計]。
- クライアントの流れ
  1. マイクボタンを押すとトークンを受け取って WS を開き、その間に録音された音はバッファに貯めます。
  2. 暫定結果は入力欄の上に薄い文字で表示します。
  3. Ctrl/Cmd+Enter または停止ボタンを押すと `audioStreamEnd` を送り、最終結果を入力欄に入れてから接続を閉じます。
- マスキング: 音声はブラウザから Google に直接送られるため、サーバーの `maskInput`/`redact` を通りません。バッチ方式の `/api/stt` も「音声はマスキングなしで Gemini に送信」なので、リスクの水準は同じです。ただし、文字起こししたテキストを Claude に送る段階は既存 API を通るため、そのままマスキングされます [High]。

## 4. 推奨

**1) 精度: 文字起こし結果を「ユーザーが実際に話した言葉」として扱ってはいけません** [High: 実測]
- バッチでも Live でも同じ正規化が起きます。そのため音声回答では「できるです のような文法の誤りの添削」を約束できません。
- 画面の案内文: 「音声は文字起こしの過程で自動的に整えられることがあります。文法の添削を受けるには、書き直すか直接入力してください。」
- 構成（4文型）と内容のフィードバックには問題ありません。

**2) ストリーミング vs バッチ** [Medium]
- **バッチの `/api/stt` を標準としてまず完成させてください。** すでに開発中で、精度は Live と同じです。
- Live ストリーミングは、締め切り（11/8）前に時間が余った場合にのみ追加する任意機能としてください。利点は二つです。
  - 体感の反応: 0.9 秒以内に最初の文字、約 0.5 秒間隔で更新
  - 聞き間違えた部分を話している途中ですぐに把握できる
- Live を入れる場合に追加で必要な作業とリスクは次のとおりです。
  - 追加作業: トークンエンドポイント、ワークレット、WS の状態管理、CSP の変更
  - リスク: Safari ブラウザ未検証、一時トークン機能が v1beta プレビュー、REST 文書例の誤り
  - 想定分量: サーバー約 30 行 + クライアント約 150 行

**3) 「ゆっくりもう一度話してみてください」を表示する基準**（優先順）
1. **最終結果が空、または短すぎるとき** [Medium]
   - 発話の長さは `voiceActivity` の START→END `audioOffset`（バッチはクライアントの録音時間）で測ります。
   - 実測の文字速度: 日本語 約 5.2–5.3 字/秒（ja1, ja3）、韓国語 約 3.3 字/秒（間投詞が消された状態）。
   - 基準値の提案: 日本語 1.5 字/秒未満、韓国語 1 字/秒未満、または発話 1.5 秒以上なのに結果が空の場合。
2. **期待した言語の文字でないとき** [Medium]
   - 日本語の回答なのにかな・漢字の比率が 50% 未満、または韓国語の回答なのにハングルの比率が 50% 未満の場合です。
   - `languageCode` フィールドは実測では届かなかったため、文字の種類で判定する必要があります。
3. **スクリプトの音読**: 期待スクリプトの日本語原文と最終結果を文字 bigram の Dice 類似度で比較し、0.6 未満なら読み直しを求めます [Medium]。
   - ユーザーがスクリプトをそのまま読めば同じ漢字で文字起こしされることが多いため、新しいライブラリなしで判定できます。
   - かな単位の比較は、文字起こしした漢字を読みに変換する必要があるため、kuromoji レベルの辞書（数 MB）が必要です。既存の `lib/kana.js` はかなのみを処理するため使えません。
   - 何か/なんか のような表記の違いは誤検出を引き起こす可能性があります [Low: 閾値未検証]。
4. **使ってはいけない方法**
   - 信頼度スコア: API に該当フィールドがありません [High]。
   - 期待スクリプトを `customVocabulary` に入れる: 認識が正解側に引き寄せられ、実際の発音ミスが隠れます。社名程度にとどめてください [Medium]。
   - 暫定結果と最終結果の差: 正常時でも差が大きく出るため（ko1 のフィラー）、基準になりません [Low]。

## 5. 未確認事項
- ブラウザ（特に Safari・iOS）での実際の動作
- ハイブリッド VAD 使用時の最終結果の遅延
- トークンに固定した設定と異なる setup を送ったときの動作
- 無料枠の RPM 上限
- `/v1beta/interactions` のバッチで `mode: verbatim` を明示したときの結果
- 実際の人の声での正規化の程度
