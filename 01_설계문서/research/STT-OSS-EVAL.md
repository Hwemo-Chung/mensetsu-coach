# 답변 음성 입력: 오픈소스·무료 STT 검토 — 2026-11-03

결론: **Whisper-small(q8)을 transformers.js로 브라우저 안에서 돌립니다.**
- 인식 언어는 팩의 면접 언어(ja/ko) 하나로 고정합니다.
- 필러를 담은 이전 문맥 프롬프트(`<|startofprev|>`)를 붙입니다.
- 같은 TTS 샘플에서 필러·오류 유지가 ja 14/15, ko 4/4였습니다. Gemini flash-lite는 12/15, 3/4였습니다.
- 녹음은 기기 밖으로 나가지 않습니다. 사용자 확정: 모델 small, 따라 읽기(V4)는 Gemini 유지.

## 1. 후보와 제외 이유

| 후보 | 라이선스 | 판정 |
|---|---|---|
| **Whisper base/small** (`onnx-community/whisper-*`, transformers.js 4.3.2) | 모델 MIT, 라이브러리 Apache-2.0 | **채택(small)** |
| Moonshine tiny ja/ko | 모델 카드 `license: other`(Moonshine Community License) | 제외. 공개 레포·대회 규칙("권리 없는 코드/데이터 금지")에 불명확 [Medium] |
| sherpa-onnx + ReazonSpeech k2 v2 | Apache-2.0 | 제외. 일본어 전용이라 ko는 다른 엔진·직접 WASM 빌드 필요. 팩 2개에 엔진 2개 [Medium] |
| Chrome `SpeechRecognition` | — | 제외. 기본은 서버 인식이고, 기기 내 인식(`processLocally`)의 ja/ko 지원은 확인 안 됨(`TTS-VOICE-EVAL.md` §1-2) |

출처:
- https://huggingface.co/onnx-community/moonshine-tiny-ko-ONNX
- https://huggingface.co/wmoto-ai/moonshine-tiny-ja-ONNX
- https://github.com/k2-fsa/sherpa-onnx
- https://huggingface.co/nihongo-stream/speech
- https://developer.mozilla.org/docs/Web/API/SpeechRecognition/install_static

## 2. 측정 (Node CPU, q8, 같은 샘플: `internal-docs/session-2026-11-03/stt-exp`, TTS 음성 4개)

필러 수는 `items.json`의 `fillers`를 셌습니다(できるです·ございますです 같은 오류 포함).

| 모델 · 프롬프트 | ja1 | ja2 | ja3 | ja 합 | ko1 | 내용 오인식 | 15초 처리 |
|---|---|---|---|---|---|---|---|
| Gemini 3.5 flash-lite (기존) | 3/4 | 6/6 | 3/5 | 12/15 | 3/4 | 御社→弊社 | 2–13초 |
| Gemini 3.5 transcribe (기존) | 4/4 | 5/6 | 4/5 | 13/15 | 0/4 | できるです→できます | 1.7초 |
| whisper-base, 프롬프트 없음 | 0/4 | 2/6 | 2/5 | 4/15 | 0/4 | 多 | 0.5초 |
| whisper-small, 프롬프트 없음 | 0/4 | 3/6 | 5/5 | 8/15 | 0/4 | 영어 전처리 문장을 받아씀 | 1.0초 |
| whisper-base, 범용 프롬프트 | 4/4 | 6/6 | 5/5 | 15/15 | 1/4 | 前職→全職, 数字→水準, 志望→死亡 | 0.6초 |
| **whisper-small, 범용 프롬프트** | 3/4 | 6/6 | 5/5 | **14/15** | **4/4** | ツール→通路, 御社を志望→音者を死亡 | 1.2초 |

- 범용 프롬프트에는 필러와 면접 어휘만 넣었습니다. 샘플 문장은 넣지 않았습니다(`public/stt-whisper.js` `PROMPT`). 처음에는 샘플 문장 조각을 넣었다가 결과가 부풀어서 다시 쟀습니다. [High]
- transformers.js에는 `prompt_ids` 옵션이 없습니다. `decoder_input_ids`에 `<|startofprev|> 프롬프트 <|startoftranscript|><|ja|><|transcribe|><|notimestamps|>`를 직접 넣고, 출력에서 그 앞부분을 잘라 냅니다. [High]
- `pipeline("automatic-speech-recognition")`에 이 접두어를 넘기면 결과에 프롬프트가 섞이고, `chunk_length_s` 분할 뒤 30초 이후 내용이 사라졌습니다. 그래서 30초 분할(조용한 100ms에서 자름)을 직접 합니다(`chunks`). [High]
- 무음 5초: 「んー、」 한 글자만 나와 `speechQuality`의 too_short로 걸러집니다. [High: 1회]
- 숫자는 「이십 퍼센트」가 아니라 「20%」로 나옵니다. Gemini도 같았습니다. [High]

## 3. 브라우저 실측 (이 Mac의 Chrome, Playwright headless, 실제 CSP)

| 조건 | 첫 요청(모델 다운로드 포함) | 이후 10–16초 음성 |
|---|---|---|
| 단일 스레드 (교차 출처 격리 없음) | 34.5초 | 9.3초 |
| **COOP `same-origin` + COEP `require-corp`** (멀티스레드 WASM) | 29.5초 | **2.8–3.1초** |

- 결과 문장은 Node와 같았습니다(ja2 6/6, ko1 4/4). CSP 위반 0건입니다. [High]
- 다운로드: 인코더 97MB, 디코더 161MB(q8). 진행률을 표시하고, 다운로드는 녹음 시작과 동시에 시작합니다. 받은 파일은 브라우저 Cache Storage에 남습니다. [High]
- 모델 호스트는 `huggingface.co`에서 `us.aws.cdn.hf.co`로 리다이렉트됩니다. 지역에 따라 앞부분이 다를 수 있어 CSP에는 `https://*.hf.co`로 넣었습니다. [Medium]
- WASM 백엔드는 `ort-wasm-simd-threaded.asyncify.*`를 씁니다(jsep 아님). `public/vendor/`에 직접 넣고 `npm run vendor:stt`로 다시 복사합니다. [High]
### 3-1. Android 에뮬레이터 (production, 2026-11-03)

| 기기 (에뮬레이터) | RAM | Chrome | 결과 |
|---|---|---|---|
| Pixel 9a, Android 17 | 8GB | 149 | UI 전체 흐름 통과. 첫 녹음(모델 설치) 33초, 이후 15초 음성 5.7초. ja2 6/6 |
| Pixel 9a (`-memory 4096`) | 4GB | 149 | 통과. ja2 6/6, ko1 4/4. 15초 음성 16.8초(캐시), 10초 음성 9.2초 |
| API 33 google_apis | 2GB | 109 | **실패. 모델을 읽는 중 탭이 꺼짐**(small, base 모두). base를 단일 스레드로 돌리면 동작했지만(15초 음성 19초) 넣지 않음 |

- **하한선 (결정 11/03): RAM 4GB 이상.** 요즘 평균 스마트폰은 8GB라 2GB 기기용 대체 경로는 만들지 않습니다(사용자 결정). 2GB 기기에서 🎤를 쓰면 탭이 다시 로드될 수 있습니다. [High: 에뮬레이터 실측]
- 에뮬레이터는 Mac의 CPU로 돌기 때문에 실제 폰보다 빠를 수 있습니다. iOS Safari는 확인하지 못했습니다. [Unknown]

### 3-2. 다른 목소리·잡음 (Node, whisper-small)

| 조건 | ja 필러 | ko 필러 | 비고 |
|---|---|---|---|
| macOS 음성(Kyoko·Yuna)으로 같은 문장 | 12/15 | 4/4 | ja3에서 「御社を志望」→「本社を、死亡」 |
| 원래 샘플 + 백색 잡음 SNR 10dB | 11/15 | 3/4 | 「ちょっと」「あの」가 빠짐 |
| 잡음만 5초 | 「んー」 | 「어…」 | 둘 다 `speechQuality` too_short → "다시 말해 주세요" |

- 확인하지 못한 것: 실제 사람 목소리의 정확도, iOS Safari, Windows. [Unknown]

## 4. 남은 한계
- 내용 오인식이 있습니다(御社→音者 등). 전사는 입력창에만 들어가고 자동 전송되지 않으므로, 사용자가 고친 뒤 보냅니다. 안내 문구도 "잘못 알아들은 단어가 있을 수 있어요"로 바꿨습니다.
- 따라 읽기(V4)는 들은 그대로의 히라가나가 필요합니다. Whisper는 맞는 표기로 고쳐 쓰기 때문에 대체할 수 없어서 Gemini(`STT_ENABLED=1`)를 유지합니다.
- 재측정: `STT_SAMPLES=… node --test test/stt-local.live.test.js` (ja ≥ 13/15, ko ≥ 3/4).
