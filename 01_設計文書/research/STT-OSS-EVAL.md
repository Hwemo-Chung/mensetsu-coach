# 回答の音声入力: オープンソース・無料 STT の検討 — 2026-11-03

結論: **Whisper-small(q8)を transformers.js でブラウザ内で動かします。**
- 認識言語はパックの面接言語（ja/ko）の一つに固定します。
- フィラーを含む前文脈プロンプト（`<|startofprev|>`）を付けます。
- 同じ TTS サンプルでのフィラー・誤りの保持は ja 14/15、ko 4/4 でした。Gemini flash-lite は 12/15、3/4 でした。
- 録音は端末の外に出ません。ユーザー確定: モデルは small、音読（V4）は Gemini を維持。

## 1. 候補と除外理由

| 候補 | ライセンス | 判定 |
|---|---|---|
| **Whisper base/small** (`onnx-community/whisper-*`, transformers.js 4.3.2) | モデル MIT、ライブラリ Apache-2.0 | **採用（small）** |
| Moonshine tiny ja/ko | モデルカード `license: other`(Moonshine Community License) | 除外。公開リポジトリ・大会規則（「권리 없는 코드/데이터 금지」＝権利のないコード/データの禁止）に照らして不明確 [Medium] |
| sherpa-onnx + ReazonSpeech k2 v2 | Apache-2.0 | 除外。日本語専用のため、ko には別エンジン・独自の WASM ビルドが必要。パック 2 つにエンジン 2 つ [Medium] |
| Chrome `SpeechRecognition` | — | 除外。標準はサーバー認識で、端末内認識（`processLocally`）の ja/ko 対応は未確認（`TTS-VOICE-EVAL.md` §1-2） |

出典:
- https://huggingface.co/onnx-community/moonshine-tiny-ko-ONNX
- https://huggingface.co/wmoto-ai/moonshine-tiny-ja-ONNX
- https://github.com/k2-fsa/sherpa-onnx
- https://huggingface.co/nihongo-stream/speech
- https://developer.mozilla.org/docs/Web/API/SpeechRecognition/install_static

## 2. 測定（Node CPU、q8、同じサンプル: `internal-docs/session-2026-11-03/stt-exp`、TTS 音声 4 個）

フィラー数は `items.json` の `fillers` を数えました（「できるです」「ございますです」のような誤りを含む）。

| モデル・プロンプト | ja1 | ja2 | ja3 | ja 合計 | ko1 | 内容の誤認識 | 15 秒音声の処理時間 |
|---|---|---|---|---|---|---|---|
| Gemini 3.5 flash-lite（既存） | 3/4 | 6/6 | 3/5 | 12/15 | 3/4 | 御社→弊社 | 2–13 秒 |
| Gemini 3.5 transcribe（既存） | 4/4 | 5/6 | 4/5 | 13/15 | 0/4 | できるです→できます | 1.7 秒 |
| whisper-base、プロンプトなし | 0/4 | 2/6 | 2/5 | 4/15 | 0/4 | 多 | 0.5 秒 |
| whisper-small、プロンプトなし | 0/4 | 3/6 | 5/5 | 8/15 | 0/4 | 英語の前処理文まで文字起こし | 1.0 秒 |
| whisper-base、汎用プロンプト | 4/4 | 6/6 | 5/5 | 15/15 | 1/4 | 前職→全職, 数字→水準, 志望→死亡 | 0.6 秒 |
| **whisper-small、汎用プロンプト** | 3/4 | 6/6 | 5/5 | **14/15** | **4/4** | ツール→通路, 御社を志望→音者を死亡 | 1.2 秒 |

- 汎用プロンプトにはフィラーと面接語彙のみを入れました。サンプル文は入れていません（`public/stt-whisper.js` `PROMPT`）。当初はサンプル文の断片を入れていたところ結果が実際より良く出たため、測り直しました。[High]
- transformers.js には `prompt_ids` オプションがありません。`decoder_input_ids` に `<|startofprev|> プロンプト <|startoftranscript|><|ja|><|transcribe|><|notimestamps|>` を直接入れ、出力からその前の部分を切り取ります。[High]
- `pipeline("automatic-speech-recognition")` にこの接頭辞を渡すと結果にプロンプトが混ざり、`chunk_length_s` 分割の後で 30 秒以降の内容が消えました。そのため 30 秒分割（無音 100ms の箇所で切る）を自前で行います（`chunks`）。[High]
- 無音 5 秒: 「んー、」の一文字だけが出て、`speechQuality` の too_short で除外されます。[High: 1 回]
- 数字は「이십 퍼센트」（二十パーセント）ではなく「20%」と出ます。Gemini も同じでした。[High]

## 3. ブラウザ実測（この Mac の Chrome、Playwright headless、実際の CSP）

| 条件 | 初回リクエスト（モデルのダウンロードを含む） | 以降の 10–16 秒音声 |
|---|---|---|
| シングルスレッド（クロスオリジン分離なし） | 34.5 秒 | 9.3 秒 |
| **COOP `same-origin` + COEP `require-corp`**（マルチスレッド WASM） | 29.5 秒 | **2.8–3.1 秒** |

- 結果の文は Node と同じでした（ja2 6/6、ko1 4/4）。CSP 違反は 0 件です。[High]
- ダウンロード: エンコーダ 97MB、デコーダ 161MB(q8)。進捗を表示し、ダウンロードは録音開始と同時に始めます。取得したファイルはブラウザの Cache Storage に残ります。[High]
- モデルのホストは `huggingface.co` から `us.aws.cdn.hf.co` にリダイレクトされます。地域によって先頭部分が異なる可能性があるため、CSP には `https://*.hf.co` で入れました。[Medium]
- WASM バックエンドは `ort-wasm-simd-threaded.asyncify.*` を使います（jsep ではない）。`public/vendor/` に直接置き、`npm run vendor:stt` で再コピーします。[High]
### 3-1. Android エミュレータ（production、2026-11-03）

| 端末（エミュレータ） | RAM | Chrome | 結果 |
|---|---|---|---|
| Pixel 9a, Android 17 | 8GB | 149 | UI の全フロー通過。初回録音（モデルのインストール）33 秒、以降の 15 秒音声 5.7 秒。ja2 6/6 |
| Pixel 9a (`-memory 4096`) | 4GB | 149 | 通過。ja2 6/6、ko1 4/4。15 秒音声 16.8 秒（キャッシュ）、10 秒音声 9.2 秒 |
| API 33 google_apis | 2GB | 109 | **失敗。モデルの読み込み中にタブが落ちる**（small、base とも）。base をシングルスレッドで動かすと動作したが（15 秒音声 19 秒）採用せず |

- **下限（11/03 決定）: RAM 4GB 以上。** 最近の平均的なスマートフォンは 8GB なので、2GB 端末向けの代替経路は作りません（ユーザー判断）。2GB 端末で 🎤 を使うとタブが再読み込みされる場合があります。[High: エミュレータ実測]
- エミュレータは Mac の CPU で動くため、実機より速い可能性があります。iOS Safari は確認できていません。[Unknown]

### 3-2. 別の声・ノイズ（Node、whisper-small）

| 条件 | ja フィラー | ko フィラー | 備考 |
|---|---|---|---|
| macOS 音声（Kyoko・Yuna）で同じ文 | 12/15 | 4/4 | ja3 で「御社を志望」→「本社を、死亡」 |
| 元のサンプル + ホワイトノイズ SNR 10dB | 11/15 | 3/4 | 「ちょっと」「あの」が抜ける |
| ノイズのみ 5 秒 | 「んー」 | 「어…」（えー…） | どちらも `speechQuality` too_short → 「다시 말해 주세요」（もう一度お話しください） |

- 確認できていないもの: 実際の人の声での精度、iOS Safari、Windows。[Unknown]

## 4. 残る限界
- 内容の誤認識があります（御社→音者 など）。文字起こしは入力欄に入るだけで自動送信されないため、ユーザーが修正してから送信します。案内文も 「잘못 알아들은 단어가 있을 수 있어요」（聞き間違えた単語があるかもしれません）に変更しました。
- 音読（V4）には聞いたとおりのひらがなが必要です。Whisper は正しい表記に直して書くため代替できず、Gemini(`STT_ENABLED=1`)を維持します。
- 再測定: `STT_SAMPLES=… node --test test/stt-local.live.test.js` (ja ≥ 13/15, ko ≥ 3/4).
