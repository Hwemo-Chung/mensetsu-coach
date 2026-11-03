# 음성 기능 조사 — TTS(스크립트 읽어 주기)·STT(음성 답변) (2026-11-03)

범위: 조사 전용. 앱 코드는 바꾸지 않았습니다. 업체 계정·키는 만들거나 쓰지 않았고 Claude API도 호출하지 않았습니다.
신뢰 표기: [High] 공식 문서·직접 실측 / [Medium] 불완전한 근거의 추론 / [Low] 근거 있는 추측 / [Unknown] 확인 못 함.
가격은 2026-11-03에 공식 가격 페이지에서 읽은 값입니다. 일부는 요약 도구를 거쳐 읽었으므로, 결제 전에 원문 표를 다시 확인해야 합니다.

비교 단위(고정): **스크립트 1개 = 일본어 약 250자, 약 60초 음성 / 답변 1개 = 약 90초 녹음.**

---

## 0. 결론

| 기능 | 권장 | 1회 원가 | 근거 수준 |
|---|---|---|---|
| TTS 본선 | 클라우드 TTS를 서버 함수 `/api/tts`로 중계합니다. 후보는 **ElevenLabs v3/v4, Google(Chirp 3 HD 또는 Gemini 3.8 Flash TTS), Azure Neural/HD** 셋입니다. 셋 다 일본어 품질을 독립적으로 측정한 자료가 없으므로, **11/4에 같은 경어 스크립트로 30분 동안 들어 보고 하나를 고릅니다.** | $0.004–0.02 | 일본어 품질 [Unknown], 가격 [High] |
| TTS 폴백 | 브라우저 `speechSynthesis`를 쓰고 `localService=true` 음성(OS 음성)을 우선합니다. 비용 0, 의존성 0입니다. | $0 | [High] |
| STT 본선 | **OpenAI `gpt-transcribe`**를 씁니다. webm·mp4를 그대로 받고, `prompt`로 필러 유지를 유도할 수 있습니다. ZDR 대상이고 학습에 쓰이지 않습니다. 전사 결과는 **입력창에 채워 사용자가 확인한 뒤 보내게** 합니다. | 90초 ≈ $0.0068 | [High]. 일본어 필러 유지는 [Unknown]이라 실측이 필요합니다. |
| STT 차선 | ElevenLabs Scribe v2를 씁니다. 업체 주장으로는 일본어 WER ≤5% 등급이고, 필러는 `no_verbatim=true`일 때만 지웁니다. 단, 학습 사용이 기본값입니다. | 90초 ≈ $0.0055 | [Medium] |
| 연결 경로 | **Vercel AI Gateway에 우리 팀 접근 권한이 있으면 Gateway 하나로 통일합니다.** 모델 ID만 바꾸면 업체 A/B가 끝나고, Vercel 배포에서는 OIDC로 인증하므로 새 키가 필요 없습니다. 다만 음성 기능은 베타이고 "순차 공개"라 접근 여부를 먼저 확인해야 합니다. | 업체 원가 그대로(zero markup) | [High]. 우리 팀 접근 여부는 [Unknown] |

**가장 큰 위험 3가지**
1. **STT가 필러를 지우면 F4 규칙이 동작하지 않습니다.** `packs/jp.json`의 `del-nanka`(なんか), `del-chotto`, `del-chanto`, `del-gyakuni`는 답변에 해당 단어가 그대로 있어야 걸립니다. **일본어에서 필러를 원문대로 남긴다고 문서에 명시한 업체는 하나도 없습니다** [High]. 그래서 전사 결과를 입력창에 넣어 사용자가 고칠 수 있게 하고, "말버릇이 빠졌을 수 있습니다" 안내를 띄웁니다.
2. **STT가 고른 한자 표기가 채점에 섞입니다.** 예를 들어 `rep-touka`(透過)는 동음이의어 문제인데, 이 표기를 사용자가 아니라 인식기가 정합니다. 데모에서 이 규칙을 음성 경로로 보여 주지 않습니다. [Medium]
3. **CSP 설정 때문에 클라우드 음성이 재생되지 않을 수 있습니다.** 현재 정책은 `default-src 'self'`이고 `media-src`가 따로 없습니다. 그래서 `<audio src="blob:…">`가 차단됩니다. `vercel.json`에 `media-src 'self' blob:`을 추가해야 합니다. [High]

---

## 1. 브라우저 내장 Web Speech API — 비용 0 기준선과 폴백

### 1-1. speechSynthesis (TTS)
- **지원 범위:** Chrome 33+, Edge, Safari 7+, iOS Safari 7+, Firefox 49+, Android Chrome, Samsung Internet에서 동작합니다. MDN 기준 Baseline "Widely available"(2018-09부터)입니다. [High]
  - https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis
  - https://caniuse.com/speech-synthesis
- **속도·높이:** `rate`는 0.1~10(기본 1), `pitch`는 0~2(기본 1)입니다. 엔진에 따라 범위가 더 좁을 수 있습니다. 문장마다 `SpeechSynthesisUtterance`를 만들어 큐에 넣으면 문장 단위로 재생됩니다. PoC에서 확인했습니다. [High]
  - https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisUtterance/rate
  - https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisUtterance/pitch
- **voiceschanged 문제:** 첫 `getVoices()`가 빈 배열일 수 있습니다. `voiceschanged` 이벤트를 기다리고, 이벤트가 오지 않는 경우를 위해 타임아웃 폴백도 둡니다. [High]
- **CSP:** 외부 스크립트도 네트워크 요청도 없어 현재 CSP 그대로 동작합니다. PoC를 같은 CSP(`default-src 'self'; script-src 'self'`)로 띄워 확인했습니다. [High]
- **개인정보:** `localService === false`인 음성은 원격 합성 서비스입니다(MDN). Chrome의 `Google 日本語`·`Google 한국의`·`Google US English`가 여기에 해당하며, 텍스트가 Google 서버로 갑니다. [Medium]
  - 근거: https://developer.mozilla.org/docs/Web/API/SpeechSynthesisVoice/localService
  - 근거: Chromium network_speech_synthesis manifest(https://chromium.googlesource.com/chromium/src/+/4ebc60dd1a01c87b6bb0d7fb525ec6969c9d5adf/chrome/browser/resources/network_speech_synthesis/manifest.json)
  - 대응: `localService === true` 음성을 먼저 고릅니다.
- **알려진 버그:** Chrome의 Google 원격 음성은 긴 발화를 약 15초 뒤에 멈춥니다(Chromium issue 679437). 문장 단위로 끊어 넣으면 피할 수 있습니다. [Medium]
  - https://www.caktusgroup.com/blog/2025/11/03/the-halting-problem/
  - https://github.com/phetsims/utterance-queue/issues/60
- **품질:** OS 음성은 사용자가 이미 "부족하다"고 판단했습니다. 그래서 폴백으로만 둡니다.

### 1-2. SpeechRecognition (STT)
- **지원 범위:** caniuse 기준으로 Chrome, Safari 14.1+, iOS Safari 14.5+, Samsung Internet은 "부분 지원"입니다. Firefox는 기본 비활성이고 Edge·Opera는 미지원으로 표시됩니다. MDN은 "Limited availability(Baseline 아님)"로 분류합니다. [High]
  - https://caniuse.com/speech-recognition
  - https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition
- **Chrome은 서버에서 인식합니다.** MDN: "your audio is sent to a web service for recognition processing, so it won't work offline." [High]
- **기기 내 인식:** `processLocally`·`available()`·`install()`(Chrome 139+로 알려짐)로 가능하다고 합니다. 다만 ja/ko 언어 팩이 있는지와 설치 UX는 확인하지 못했습니다. [Low]
  - https://developer.mozilla.org/docs/Web/API/SpeechRecognition/install_static
- **Safari:** Apple 음성 인식을 쓰고 Siri 활성화가 필요하다는 2차 자료만 있습니다. WebKit 원문은 확인하지 못했습니다. [Low]
- **결론:** 필러 유지 여부를 제어할 수 없고 문서도 없습니다 [Unknown]. 지원 브라우저도 들쭉날쭉합니다. **음성 입력 본선에는 쓰지 않습니다.**

### 1-3. PoC 결과 — 이 Mac의 Chrome 156 (Playwright, `channel: 'chrome'`)
코드는 공개 레포 밖 스크래치패드에 있습니다(index.html, poc.js, run.mjs, run-google.mjs).
**재생은 끝까지 갔지만, 귀로 음질을 듣지는 않았습니다.**

| 조건 | 전체 음성 수 | ja-JP | ko-KR | en-US |
|---|---|---|---|---|
| headless / headful (Playwright 기본 플래그) | 181 / 181 (같음) | 9개, 모두 `localService=true`: Kyoko, Eddy, Flo, Grandma, Grandpa, Reed, Rocko, Sandy, Shelley | 10개: 유나(프리미엄, **기본 음성**), 유나, Eddy, Flo, Grandma, Grandpa, Reed, Rocko, Sandy, Shelley | 28개(Samantha 등 OS 음성) |
| Playwright의 확장 비활성 플래그를 끈 경우 | 200 | 위 9개 + **`Google 日本語`(`localService=false`)** | 위 10개 + **`Google 한국의`(`localService=false`)** | + `Google US English`(`localService=false`) |

- 문장 단위 재생(2문장, ja-JP, rate 1)은 headless와 headful 모두 `onend`까지 정상 종료했습니다. [High]
- 이 Mac에서는 headless와 headful의 목록이 같았습니다. 다른 OS나 다른 Chrome 버전에서는 다를 수 있습니다. [High]
- **일반 사용자의 Chrome에는 Google 원격 음성이 보입니다.** Playwright가 기본으로 컴포넌트 확장을 끄기 때문에 첫 실행 목록에서만 빠졌습니다. 그러니 "첫 번째 ja-JP 음성"을 무조건 고르면 원격 음성이 선택될 수 있습니다. [High]
- PoC에서 확인한 함정: 스크립트의 `［빈칸］`을 그냥 지우면 「を志望した理由は…」처럼 문장 앞이 잘린 채로 읽힙니다. 빈칸은 「まるまる」로 바꿔 읽거나 짧은 쉼으로 처리해야 합니다. [High]
- 콘솔의 404 1건은 favicon 요청입니다. CSP 위반은 0건입니다.

### 1-4. 내장 음성 청취 결과 (2026-11-03, 사용자 판정, 이 Mac의 Chrome)
같은 경어 스크립트 1개를 rate 1.0으로 들었습니다.
- **합격: `Kyoko`(기기, `localService=true`), `Google 日本語`(원격, `localService=false`).** [High]
- **탈락:** Eddy, Flo, Grandma, Grandpa, Reed, Rocko, Sandy, Shelley. [High]
- 폴백 규칙을 바꿉니다. "첫 번째 ja-JP 음성"이나 "`localService=true` 아무거나"가 아니라 **이름 허용 목록**으로 고릅니다: `Kyoko` → `Google 日本語` 순서입니다. 둘 다 없으면 탈락 음성으로 읽지 않고 버튼을 숨기거나 "이 기기에는 쓸 만한 일본어 음성이 없습니다"라고 표시합니다. [Medium]
- 걸리는 점 1: `Google 日本語`는 원격 음성이라 스크립트 텍스트가 Google 서버로 갑니다(§1-1 개인정보). 이 음성을 쓰면 `privacy.html`에 고지해야 하고, 긴 발화가 약 15초에서 끊기는 버그 때문에 문장 단위 재생이 필수입니다. [Medium]
- 걸리는 점 2: `Kyoko`는 macOS·iOS 음성이고, `Google 日本語`는 데스크톱 Chrome에만 있습니다. Windows의 Edge·Firefox, Android에서 어떤 음성이 잡히는지는 듣지 않았습니다. [Unknown]
- 클라우드 음성(§2)은 아직 듣지 못했습니다. AI Gateway 잔액이 $0이라 샘플을 생성하지 못했습니다(`/v1/credits` 응답 `balance: "0"`, 11/03 확인). [High]

---

## 2. 클라우드 TTS 비교 (품질 우선, Vercel Node 함수에서 호출)

**공통 사실:** 일본어 TTS 품질을 독립적으로 비교한 벤치마크는 없습니다. Artificial Analysis TTS Arena(https://artificialanalysis.ai/text-to-speech/leaderboard)는 제3자 블라인드 투표지만 영어만 다룹니다. [High]

| 업체·모델 | ja / ko / en | 일본어 읽기·악센트 제어 | 스트리밍·지연 | 250자 원가 | 무료 | 보존·학습 | 법인·지역 | 호출 방식 |
|---|---|---|---|---|---|---|---|---|
| **ElevenLabs** v4·v3·Multilingual v2 / Flash v2.5·v4 Turbo | ○ / ○ / ○ (Flash v2는 영어 전용) | **사실상 없음.** 음소 태그는 영어 전용 모델만 지원하고, 일본어는 alias 사전과 `apply_language_text_normalization`(지연이 크게 늘 수 있음)만 있음 | 지원. Flash/Turbo 약 100ms(업체 주장) | v3/v4 $0.08/1K자 → **$0.02** / Flash $0.04 → $0.01. Gateway 표기로는 v3 $40/1M | 무료 플랜 있음(문자 수 [Unknown]) | **입출력을 학습에 사용하는 것이 기본값.** 계정 설정에서 끌 수 있음. 무보존은 Enterprise 전용 | Eleven Labs Inc.(미국). 데이터는 미국 저장 | fetch, `xi-api-key` |
| **Google Cloud TTS** Chirp 3 HD (ja-JP 30종) | ○ / ○ / ○ | API에 `PHONETIC_ENCODING_JAPANESE_YOMIGANA`가 있음(`^`, `!`로 피치 악센트, 도쿄 방언만). Chirp 3 HD에서 쓸 수 있는지는 [Unknown] | 양방향 스트리밍. 지연 [Unknown] | $30/1M → **$0.0075** | 월 100만 자 | "does not log any customer Cloud TTS text or audio data" | Google. `asia-northeast1`(도쿄) | REST. API 키를 쓸 수 있는지 [Unknown]. 안 되면 서비스 계정 JWT 서명이 필요(`node:crypto`로 의존성 없이 가능) |
| **Google Gemini 3.8 Flash TTS** (Gateway에서 `google/gemini-3.8-flash-tts`) | ○ / ○ / ○ | 자연어 `instructions`(속도·톤). 읽기 지정은 [Unknown] | Gateway 경유 시 스트리밍 없음 | 25 audio tokens/초 × 60초 × $9/1M → **약 $0.0135**(2027-01부터 2배) | Gemini API 무료 티어는 **제품 개선에 사용됨** | Gateway 기본 ZDR | Google | Gateway REST(base64 JSON) |
| **Azure AI Speech** Nanami·Keita 등 Neural, Nanami/Masaru DragonHD | ○ / ○ / ○ | SSML `phoneme`(ja-JP는 가나 기반 sapi), `sub alias`, PLS 사전. 문서에 "pitch accent"라는 말은 없음. DragonHD에서 되는지는 [Unknown] | REST 스트리밍 포맷. 지연 [Unknown] | Neural $15/1M → **$0.00375**. DragonHD 가격은 표에 "N/A"라 [Unknown] | 월 50만 자(F0) | 실시간 합성의 텍스트·음성을 저장하지 않음 | Microsoft. **Japan East/West, Korea Central** | fetch, `Ocp-Apim-Subscription-Key` + SSML. 연결이 가장 단순 |
| **Amazon Polly** Neural (Takumi, Kazuha, Tomoko) | ○ / ○ / ○ (**일본어 generative 음성 없음**) | `x-amazon-pron-kana`에서 `'`로 악센트 지정(문서화됨) | 준실시간 스트리밍 | $16/1M → **$0.004** | Neural 월 100만 자(12개월) | 입력 텍스트를 저장·사용할 수 있음(Organizations 정책으로 거부 가능) | AWS. 도쿄 리전 | SigV4 서명 필요. SDK 없이 쓰려면 직접 구현해야 해서 해커톤에는 비추천 [Medium] |
| **OpenAI** gpt-4o-mini-tts | ○ / ○ / ○ | `instructions`만 있음. "Voices are currently optimized for English" | chunked 스트리밍 | 토큰 과금($12/1M audio out) | — | 학습 없음, 30일 abuse 로그, ZDR 대상 | OpenAI(미국) | fetch |
| → **제외 이유** | | | | | | | | **tts-1, tts-1-hd, gpt-4o-mini-tts 모두 2027-01-06 종료 예정**(공식 가이드). 대체 모델은 Realtime API 전용입니다. |
| **Fish Audio** s2.1-pro | ja 지원 목록 [Unknown] (S1은 ja·ko 명시, 2026-12-31 종료) | [Unknown] | TTFA 100ms(업체 주장) | **UTF-8 바이트 과금**이라 일본어는 3배. $15/1M바이트 → 약 $0.011 | 무료 모델 있음(DPA 보장 없음) | 학습 사용 여부 [Unknown] | 미국 Dover, DE | 인증 헤더 [Unknown] |
| **Cartesia** sonic-3.6 | ○ / ○ / ○ | 발음 사전(일본어 적용 여부 [Unknown]) | [Unknown] | 1자 = 1크레딧. 요금제로 환산하면 약 $0.0125 | 월 2만 크레딧 | **학습 사용이 기본값** | 개인정보처리방침에 "**미국 사용자 전용**" 명시 → 일본 이용자 대상으로는 부적합 | fetch, Bearer |
| **Aivis Cloud API** (일본어 특화) | ja 전용 | [Unknown] | 재생 시작 최소 0.3초 | 440엔/1만 자 → **11엔** | 가입 시 500엔 크레딧 | "AIモデルの学習に利用しません" | Walkers Inc.(일본으로 추정 [Medium]). 일본 사업자라면 국외 이전 고지가 불필요할 수 있음 | 인증 방식 [Unknown] |
| **VOICEVOX** | ja 전용 | `'`로 악센트 위치 지정, 사용자 사전 `accent_type`. **유일하게 악센트를 명시적으로 편집 가능** | 자체 서버 | 무료(크레딧 표기 필수. ずんだもん 등을 크레딧 없이 쓰려면 캐릭터당 40만 엔+세금) | — | 자체 운영이라 외부 전송 없음 | — | **Vercel 함수 안에서는 실행 불가.** Docker 서버를 따로 운영해야 함. 5일 일정에는 맞지 않음 [Medium] |

출처: ElevenLabs https://elevenlabs.io/docs/overview/models , https://elevenlabs.io/pricing/api , https://elevenlabs.io/docs/best-practices/prompting/controls , https://elevenlabs.io/privacy-policy / Google https://docs.cloud.google.com/text-to-speech/docs/chirp3-hd , https://cloud.google.com/text-to-speech/pricing , https://docs.cloud.google.com/text-to-speech/docs/data-logging , https://ai.google.dev/gemini-api/docs/speech-generation , https://ai.google.dev/gemini-api/docs/pricing / Azure https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-ssml-phonetic-sets , https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-text-to-speech , https://learn.microsoft.com/en-us/azure/ai-foundry/responsible-ai/speech-service/text-to-speech/data-privacy-security / Polly https://docs.aws.amazon.com/polly/latest/dg/available-voices.html , https://docs.aws.amazon.com/polly/latest/dg/phoneme-tag.html / OpenAI https://developers.openai.com/api/docs/guides/text-to-speech , https://developers.openai.com/api/docs/pricing / Fish https://docs.fish.audio/developer-guide/models-pricing/pricing-and-rate-limits / Cartesia https://cartesia.ai/legal/privacy / Aivis https://aivis-project.com/cloud-api/ / VOICEVOX https://voicevox.hiroshiba.jp/term/ , https://github.com/VOICEVOX/voicevox_engine

**Anthropic(Claude API)에는 TTS도 STT도 없습니다.** 공식 API 개요에 나오는 엔드포인트는 Messages, Batches, Token Counting, Models, Files, Skills와 Managed Agents 계열뿐입니다. 음성 생성·전사 엔드포인트는 없습니다(https://platform.claude.com/docs/en/api/overview). [High]
Claude 앱에 있는 음성 모드는 소비자용 앱 기능이며 API가 아닙니다. [Medium]

### TTS 순위 (품질 우선, 스크립트 1개당 $0.01–0.05)
청취 비교 전에 세운 순위입니다. 일본어 품질 근거가 없으므로 실측으로 뒤집힐 수 있습니다.
1. **ElevenLabs v3 / v4 — 자연스러움에 대한 기대치가 가장 높습니다.**
   - 근거: 영어 아레나 1위권입니다. 일본어 근거는 [Unknown]입니다.
   - 약점 1: 한자 읽기를 고칠 수단이 사실상 없습니다.
   - 약점 2: 학습 사용이 기본값이라 계정 설정에서 반드시 꺼야 합니다.
2. **Google Chirp 3 HD 또는 Gemini 3.8 Flash TTS — 균형형입니다.**
   - 장점: 로그를 남기지 않고, 무료 티어가 있으며, 도쿄 리전이 있습니다.
   - Gemini는 Gateway로 바로 연결됩니다.
3. **Azure Neural / DragonHD — 통제형입니다.**
   - 장점: 가나 음소로 읽기를 고칠 수 있고, Japan East 리전이 있으며, 연결이 가장 단순합니다.
   - DragonHD 가격은 [Unknown]입니다.
- **선택 규칙:** 11/4에 경어 스크립트 3개(빈칸·숫자·「させていただきます」 포함)를 세 후보로 합성합니다. 「読み間違い 수」와 「억양 자연스러움」을 5점 척도로 듣고 정합니다. 동점이면 개인정보 조건이 좋은 Google 또는 Azure를 고릅니다.

---

## 3. 클라우드 STT 비교 (필러 원문 유지가 필수)

**공통 사실:** 일본어에서 필러(えーと·あの·なんか)를 원문대로 남긴다고 문서에 쓴 업체는 **없습니다.** [High]
일본어 WER/CER 수치는 모두 업체가 직접 측정한 값이고, 제3자 측정치는 찾지 못했습니다. [High]

| 업체·모델 | ja / ko / en | 일본어 정확도 근거 | 필러 원문 유지 | 받는 포맷·크기 | 동기 처리·스트리밍 | 90초 원가 | 무료 | 보존·학습 | 법인·지역 | 호출 방식 |
|---|---|---|---|---|---|---|---|---|---|---|
| **OpenAI `gpt-transcribe`** (권장 모델) | 언어 목록 미기재. 다국어 힌트 지원 [Medium] | [Unknown] (FLEURS 우위 주장은 업체 블로그) | prompt 활용 사례에 "Preserving … filler words"가 있음. 일본어 언급 없음 → 실측 필요 [Medium] | mp3, mp4, m4a, wav, **webm** / 25MB. 이 목록은 STT 가이드 전체에 대한 설명이고, `gpt-transcribe` 모델 페이지에는 포맷·최대 입력이 적혀 있지 않습니다 → 이 모델에도 적용되는지는 [Medium] | 동기 응답, `stream=true` 가능 | $0.0045/분 → **$0.0068** | [Unknown] | **학습 없음, 전사 abuse 보존 없음, ZDR 대상** | OpenAI(미국). JP 리전은 저장만 지역 내, 처리는 지역 밖 | fetch multipart(Node `FormData`) |
| OpenAI gpt-4o-transcribe / mini / whisper-1 | 같음 | 같음 | 같음 | 같음 | 같음 | $0.009 / $0.0045 / $0.009 | | 같음 | 같음 | **2027-02-26 종료 예정** → 새로 붙이지 않음 |
| **ElevenLabs Scribe v2** | ○(ja "Excellent", ko "Good") / ○ | ja ≤5% WER 등급(업체 주장, 데이터셋 미기재) | `no_verbatim=true`일 때만 필러를 지움. 기본값 미기재, 일본어 언급 없음 [Medium] | webm, opus, aac, m4a, mp4 / 3–5GB | 동기. 실시간 모델 따로 있음 | $0.22/시간 → **$0.0055** [Medium] | 무료 플랜 STT 4.5시간 [Medium] | **학습 라이선스가 기본값**(설정에서 끌 수 있음). 무보존은 Enterprise 전용 | Eleven Labs Inc.(미국) | fetch multipart, `xi-api-key` |
| Azure fast transcription | ○ / ○ / ○ | [Unknown] | **display form만 반환하고, display form은 disfluency removal 대상** → 필러가 지워질 위험이 가장 큼 | webm·ogg·aac / 500MB | 동기 | 가격표 "N/A" [Unknown] | 실시간 월 5시간 | 리소스 리전 안에서 처리 | **Japan East** | fetch multipart |
| Azure MAI-Transcribe-2 | ja 여부 [Unknown](60개 언어) | [Unknown] | **`transcribeStyle` 기본값이 `verbatim`("keeps fillers and false starts")** — 문서상 가장 유리 | **WebM·MP4 불가**(WAV, MP3, FLAC, Ogg/Opus) | 동기. 프리뷰(SLA 없음) | Gateway 가격 미표시 [Unknown] | | | 일본 리전 없음 | 브라우저 녹음을 변환해야 하므로 제외 |
| Deepgram Nova-3 | ○ / ○ / ○ | [Unknown] | `filler_words`는 **영어 전용** | webm, mp4 등 | | $0.0043/분 → $0.0065 | $200 크레딧 | **학습(MIP)이 기본값**. `mip_opt_out=true`로 끔 | 미국. EU·AU·IN 리전 | — |
| AssemblyAI U3.5 Pro / U2 | ja ○, ko는 U2만 | U2 ja "≤10% WER" 등급(업체 주장) | `disfluencies`는 일본어 **제외**(영어 또는 6개 언어) | | 비동기 polling | $0.21/시간 → $0.0053 | $50 크레딧 | 조건부 학습 사용. transcript 30일 보존 | 미국. EU 리전 | — |
| Google STT V2 Chirp 3 | ○ / ○ / ○ | [Unknown] | [Unknown] | 10MB | **동기 처리는 약 1분까지라 90초 답변 불가.** GCS를 거치는 batch 필요 | $0.016/분 → $0.024 | | 로깅 안 함 | `us`, `eu` | 제외 |
| Web Speech `SpeechRecognition` | ○ | — | 제어 불가 | 브라우저 내장 | 실시간 | $0 | — | Chrome은 Google 서버 | — | 보조 수단으로만 |

출처: https://developers.openai.com/api/docs/guides/speech-to-text , https://developers.openai.com/api/docs/models/gpt-transcribe , https://developers.openai.com/api/docs/guides/your-data / https://elevenlabs.io/docs/capabilities/speech-to-text , https://elevenlabs.io/docs/api-reference/speech-to-text/convert / https://learn.microsoft.com/en-us/azure/ai-services/speech-service/fast-transcription-create , https://learn.microsoft.com/en-us/azure/ai-services/speech-service/display-text-format , https://ai-sdk.dev/providers/ai-sdk-providers/azure / https://developers.deepgram.com/docs/filler-words , https://developers.deepgram.com/trust-security/your-data / https://www.assemblyai.com/docs/pre-recorded-audio/include-filler-words.md , https://www.assemblyai.com/docs/data-retention-and-model-training.md / https://docs.cloud.google.com/speech-to-text/quotas , https://cloud.google.com/speech-to-text/pricing

### STT 순위
1. **OpenAI `gpt-transcribe`**
   - 브라우저 녹음 포맷(webm, mp4)을 변환 없이 받습니다. 단 이 근거는 STT 가이드의 공통 포맷 목록입니다 [Medium]. webm이 거부되면 1위로 둔 근거("변환 없음")가 약해지므로, 11/4 실측에서 가장 먼저 확인합니다.
   - 개인정보 조건이 가장 깔끔합니다(학습 없음, 전사 보존 없음).
   - `prompt`에 「えーと、あの、なんか、そのー」처럼 필러가 들어간 예문을 넣어 원문 유지를 유도할 수 있습니다. 이 방법은 [Medium]입니다.
2. **ElevenLabs Scribe v2**
   - 문서 구조상 필러를 남기는 쪽이 기본값으로 보입니다(지우려면 플래그가 필요).
   - 일본어 정확도도 업체 주장으로는 가장 좋습니다.
   - 대신 학습 사용이 기본값이라 계정 설정에서 반드시 꺼야 합니다.
- **결정 규칙:** 11/4에 필러가 든 일본어 녹음 5개(가상 문장, 각 30–60초)를 두 업체에 넣습니다. 비용은 $0.05 미만입니다.
  - 필러 보존율이 높은 쪽을 고릅니다.
  - 둘 다 50% 미만이면 UI 안내(직접 입력)에 의존합니다.

---

## 4. 통합 설계 (최소안, 새 npm 의존성 0)

### 4-1. TTS: `POST /api/tts`
- **흐름:** 접근 코드 → 기존 `lib/guard.js` 속도 제한 → 검증 → 업체 호출 → 응답(`audio/mpeg`).
  - 검증: `text`는 문자열이고 길이 상한을 둡니다(예: 300자). `lang`은 `EXPLAIN_LANGS`가 아니라 **목표 언어**(현재 `ja`)입니다.
  - Gateway를 쓰면 base64 JSON을 받아 디코드한 뒤 바이트로 돌려줍니다.
- **크기:** 60초 mp3는 약 0.5MB 이하라 응답 한도 4.5MB에 여유가 있습니다. [High: https://vercel.com/docs/functions/limitations]
- **문장 단위 재생:**
  - 클라이언트가 `s.ja`를 「。！？」 기준으로 나누고 **문장마다 요청**합니다.
  - 과금은 글자 수 기준이라 문장마다 나눠 요청해도 총비용이 같습니다.
  - 결과는 `Map(문장+음성 → Blob)`에 캐시해서 다시 듣기와 반복 재생 때 재요청하지 않습니다.
  - 서버나 CDN 캐시는 만들지 않습니다(POST이고, 데모 규모에서는 필요 없음).
- **속도 조절:** 클라이언트에서 `audio.playbackRate`(0.75 / 1 / 1.25)로 바꿉니다. 브라우저 기본값인 `preservesPitch=true` 덕분에 음높이는 그대로입니다. 다시 합성할 필요가 없습니다. [High: https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/preservesPitch, 기본값 true, 2023-12부터 Baseline]
- **빈칸 처리:** `［…］`는 「まるまる」로 바꿔 읽습니다. 그냥 삭제하면 문장이 깨집니다(PoC에서 확인).
- **CSP:** `vercel.json`의 CSP에 `media-src 'self' blob:`을 추가합니다. `default-src 'self'`는 `blob:`을 허용하지 않습니다. [High]
  - 대안으로 `AudioContext.decodeAudioData`를 쓰면 CSP를 바꾸지 않아도 됩니다. 하지만 이 방식에서는 재생 속도를 바꾸면 음높이도 같이 변합니다.
- **폴백:** 응답이 오류이거나 키가 없으면 `speechSynthesis`(`localService=true` 우선)로 같은 문장을 읽습니다. 화면에는 "기기 음성으로 읽습니다"라고 표시합니다.
- **AI 음성 고지:** OpenAI 정책은 AI 음성임을 알리라고 요구하고, 다른 업체도 같은 관행입니다. 재생 버튼 옆에 "AI 음성"을 표기합니다.

### 4-2. STT: `POST /api/stt`
- **녹음:** 클라이언트에서 `getUserMedia({audio:true})` → `MediaRecorder`로 녹음합니다.
  - mimeType은 `MediaRecorder.isTypeSupported`로 고릅니다. Chrome·Firefox는 `audio/webm;codecs=opus`, Safari는 `audio/mp4`입니다.
  - `audioBitsPerSecond: 32000`으로 지정하고, 녹음은 **120초에서 자동 정지**합니다.
- **전송:** 요청 본문은 **녹음 Blob 그대로** 보내고 `content-type`에 형식을 적습니다. base64는 크기가 33% 늘어나므로 쓰지 않습니다.
  - 32kbps × 120초 ≈ 0.5MB로, 요청 한도 4.5MB에 충분히 들어갑니다. [High]
  - **클라이언트 코드는 경로와 관계없이 같습니다.** Gateway 경로(§5-1)를 고르면 서버가 받은 Blob을 base64 JSON으로 바꿔 Gateway에 보냅니다(Gateway REST는 multipart를 받지 않음). 0.5MB가 약 0.67MB로 늘어나도 문제없습니다.
- **서버:** 접근 코드 → 속도 제한 → 크기·형식 검증 → OpenAI `/v1/audio/transcriptions`(multipart: `model=gpt-transcribe`, `language` 힌트, 필러 예문을 넣은 `prompt`) → `{ text }`.
- **화면:** 전사 결과를 **입력창(`#input`)에 채우고 자동으로 보내지 않습니다.** 사용자가 확인한 뒤 Ctrl/Cmd+Enter로 보냅니다(기존 흐름 재사용).
  - 이렇게 하면 `/api/review`와 `/api/script`, 그리고 `maskInput`을 그대로 탑니다.
- **언어:** 목표 언어(ja)와 모국어(ko) 중 무엇으로 말할지 토글을 두지 않고, 두 언어를 함께 힌트로 줍니다. 모국어로 답하는 경우 [Medium]도 지금 `/api/script` 흐름과 같습니다.
- **개인정보:** 음성은 마스킹 없이 원본 그대로 STT 업체로 갑니다(PDF·이미지 첨부와 같은 처지). 처리방침에 적어야 합니다.
- **미지원 환경:** `navigator.mediaDevices?.getUserMedia`나 `MediaRecorder`가 없으면 마이크 버튼을 숨기고 타이핑만 둡니다. 권한을 거부하면 오류 코드 `mic_denied`를 i18n 문장으로 보여 줍니다.

### 4-3. 바꿔야 할 파일 (구현 시)
| 파일 | 변경 |
|---|---|
| `vercel.json` | CSP에 `media-src 'self' blob:`을 추가합니다. `Permissions-Policy`에 `microphone=(self)`를 명시합니다. 지금 microphone이 목록에 없어서 기본값 `self`로 이미 허용되지만, 의도를 분명히 하려고 적습니다(MDN: "The default allowlist for `microphone` is `self`"). `functions`에 `api/tts.js`·`api/stt.js`의 `maxDuration`을 추가합니다. |
| `dev.js` | 라우트 2개를 추가합니다. `MOCK_CLAUDE=1`일 때 쓸 고정 응답(짧은 무음 mp3, 고정 전사문)을 추가해 테스트 토큰을 0으로 유지합니다. |
| `public/privacy.html` | §2에 "음성 녹음: 전사에만 사용, 서버 미저장, 자동 마스킹 불가"를 추가합니다. §3 위탁처에 STT 업체(OpenAI, 미국)와 TTS 업체를 추가합니다. TTS에 Google·Azure·ElevenLabs 중 무엇을 쓰든 미국 사업자이므로 "米国の事業者" 문장은 그대로 유지할 수 있습니다. Gateway를 쓰는 경우에는 Vercel 경유 사실과 실제 처리 업체를 함께 적습니다. OpenAI JP 엔드포인트(`jp.api.openai.com`)는 저장만 일본 안에서 하고 처리는 일본 밖에서 하므로, **써도 국외 이전 고지는 그대로 필요합니다.** |
| `public/i18n/{ko,en,ja}.js` | `tts.play`, `tts.stop`, `tts.speed`, `tts.sentence`, `tts.aiVoice`, `tts.deviceVoice`, `mic.start`, `mic.stop`, `mic.recording`, `mic.transcribing`, `mic.checkBeforeSend`(말버릇이 빠졌을 수 있다는 안내 포함), `mic.unsupported`와 오류 코드 `tts_failed`, `stt_failed`, `mic_denied`, `audio_too_long`. `test/i18n.test.js`가 누락된 키를 잡아냅니다. |
| `README` | 음성 업체와 그 역할을 적고, "Claude는 채점·생성만 담당한다"는 점을 밝힙니다. |

---

## 5. 사용자 할 일

1. **(5분) Gateway 음성 기능 접근 확인:** Vercel 대시보드 → AI Gateway → Models에서 `audio:speech`와 `audio:transcription` 모델이 우리 팀에 보이는지 확인합니다.
   - 보이면 `AI_GATEWAY_API_KEY`(로컬 전용, Vercel 배포는 OIDC) 하나로 모든 업체를 쓸 수 있습니다.
   - 안 보이면 아래처럼 업체에 직접 가입합니다.
2. **업체에 직접 가입하는 경우 필요한 환경 변수** (비공개 `secrets/.env`에만 둡니다):
   - STT: `OPENAI_API_KEY`
   - TTS(청취 비교 후 하나만): `ELEVENLABS_API_KEY`, `AZURE_SPEECH_KEY`와 `AZURE_SPEECH_REGION=japaneast`, Google(API 키가 되면 `GOOGLE_TTS_API_KEY`, 안 되면 서비스 계정 JSON) 중 하나
3. **ElevenLabs를 고르면** 계정 설정에서 학습 사용을 반드시 끕니다.
4. **11/4 실측 두 가지:** TTS 청취 비교 30분(§2 선택 규칙)과 STT 필러 보존 테스트(§3 결정 규칙). 둘 다 가상 문장만 씁니다.
5. **결제 수단 등록과 사용 한도 설정:** 업체 콘솔이나 Gateway 예산에서 월 $10 정도로 상한을 겁니다.

## 6. 확인하지 못한 것
- 모든 업체의 일본어 TTS 품질과 일본어 필러 보존: 실측이 필요합니다.
- `gpt-transcribe`가 받는 포맷(webm·mp4)과 최대 입력: 모델 페이지에 적혀 있지 않습니다.
- Google Cloud TTS의 API 키 인증 허용 여부와, Chirp 3 HD에서 요미가나 피치 악센트를 쓸 수 있는지.
- Azure DragonHD 가격, MAI-Voice·MAI-Transcribe의 일본어 지원 여부. MAI-Voice-2는 출시 공지에 일본어가 없고 카탈로그에는 있어 서로 다릅니다.
- Safari `SpeechRecognition`의 Siri 의존성(WebKit 원문 미확인), Chrome 기기 내 인식의 ja/ko 언어 팩.
- 우리 팀이 Vercel AI Gateway 음성 베타에 접근할 수 있는지.

## §1-5 청취 판정 (11/03, 사용자)

- Gemini API(무료 키)로 같은 경어 스크립트(약 230자)를 생성해 청취했습니다. **g1~g4 모두 합격**입니다.
  - g1 `gemini-3.8-flash-tts` Kore 12.0초 / g2 Charon 11.0초 / g3 Aoede 12.3초 / g4 `gemini-3.8-flash-lite-tts` Kore 6.8초
  - `gemini-2.5-pro-preview-tts`는 무료 키에서 429(한도)로 생성하지 못했습니다.
- 결정(제안): 기본 `gemini-3.8-flash-lite-tts` + Kore(가장 빠름, 품질 합격). 옵션에서 남성 음성 Charon 선택. 실패 시 브라우저 내장 Kyoko → Google 日本語 순서.
- 설계 조건: 문장 단위 생성과 첫 문장 우선 재생, 같은 스크립트는 캐시, `vercel.json`에 `media-src 'self' blob:`, 처리방침에 Google(Gemini API) 위탁 고지. 무료 등급의 일일 한도와 데이터 이용 조건은 원문 확인 필요 [Medium].
- **결정 (11/03, 사용자)**: 음성 처리(TTS·STT)는 당분간 Gemini 무료 등급으로 운영하고, 제출 후 유료·고급 모델(유료 등급 데이터 처리, 높은 한도, 원문 그대로 받아쓰기)로 올립니다. 근거·보완책: PRD §15.6 결정, §15.5-5.
