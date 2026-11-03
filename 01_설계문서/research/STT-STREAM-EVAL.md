# 답변 음성 입력 스트리밍(말하는 동안 글자 표시) 가능성 검증 — 2026-11-03

결론부터 말씀드립니다. **스트리밍은 기술적으로 가능합니다**(Node PoC로 확인, 브라우저는 미검증). 다만 **Live 모델도 "그대로 받아쓰기"가 되지 않습니다.** `mode: "VERBATIM"`을 명시해도 できるです→できます(문법 교정), なんか→何か, 한국어 간투사(음·어·그니까) 4/4 삭제가 그대로 일어났습니다. 그래서 스트리밍은 체감 속도만 개선하고, 발음·문법 첨삭의 정확도 문제는 해결하지 못합니다.

## 1. 공식 문서 확인 (출처)

`ai.google.dev/...` 링크는 2026-11 현재 `aistudio.google.com/docs/...`로 301 리다이렉트됩니다.

- Live 전사 가이드: https://aistudio.google.com/docs/live-api/live-transcribe
- Live API 레퍼런스: https://aistudio.google.com/api-reference/live
- WebSocket 시작하기: https://aistudio.google.com/docs/live-api/get-started-websocket
- 임시 토큰(ephemeral token): https://aistudio.google.com/docs/live-api/ephemeral-tokens
- 요금: https://aistudio.google.com/docs/pricing#gemini-3.5-transcribe-live
- 비스트리밍 전사(모드 설명): https://aistudio.google.com/docs/transcribe#transcription-modes

### 1-1. 엔드포인트와 메시지 형식 [High]
- API 키로 접속: `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=…`
- 임시 토큰으로 접속: `…GenerativeService.BidiGenerateContentConstrained?access_token={token}`. 브라우저 WebSocket은 헤더를 붙일 수 없으므로 쿼리 파라미터 방식만 쓸 수 있습니다.
- setup 메시지: `{ setup: { model: "models/gemini-3.5-transcribe-live", generationConfig: { responseModalities: ["TEXT"] }, inputAudioTranscription: { languageCodes: ["ja-JP"], mode: "VERBATIM" } } }` → 서버가 `{ setupComplete }`로 응답합니다.
- 오디오 전송: `{ realtimeInput: { audio: { data: <base64 PCM16 LE mono>, mimeType: "audio/pcm;rate=16000" } } }`. 문서 권장 청크 크기는 100 ms이며, PoC는 40 ms로 보냈습니다.
- 수신 메시지:
  - `serverContent.interimInputTranscription.text`: 말하는 동안 갱신되는 잠정 결과입니다. **현재 발화 구간(VAD 구간) 안에서 누적된 문장**이 매번 다시 옵니다. 그 구간의 최종 결과가 나오면 다음 잠정 결과는 처음부터 다시 시작합니다(실측: ja1에서 영어 최종 결과가 나온 뒤 다음 잠정 결과가 「えっと、」부터 시작). UI에서는 잠정 결과로 현재 구간의 미리보기를 교체하고, 최종 결과는 이어 붙이면 됩니다.
  - `serverContent.inputTranscription.text`: 발화가 끝났을 때(VAD) 확정되는 최종 결과입니다.
  - `voiceActivity { type: ACTIVITY_START|ACTIVITY_END, audioOffset }`: 발화 시작·끝 신호입니다(실측).
  - `serverContent.generationComplete`
- 종료:
  - 자동 VAD(기본)일 때: `{ realtimeInput: { audioStreamEnd: true } }`. 문서상 "하이브리드 VAD"로, 서버의 침묵 대기 없이 즉시 확정합니다.
  - 수동 VAD일 때: `automaticActivityDetection.disabled: true` 설정 후 `activityStart`/`activityEnd`를 보냅니다.
  - 세션 최대 길이는 10분입니다.
- `mode`는 `VERBATIM`(기본)과 `SMART` 두 가지입니다. 문서는 VERBATIM이 "필러·반복·말 더듬기를 보존한다"고 설명합니다. **실측은 이 설명과 다릅니다**(§3).
- 전사 메시지 필드는 `text, languageCode, startOffset, endOffset`뿐이고, **신뢰도(confidence) 필드는 없습니다.** PoC에서는 `text` 말고는 어떤 필드도 채워져 오지 않았습니다.
- [Medium, 미호출] capabilities 문서는 네이티브 오디오 모델이 응답 모달리티로 `AUDIO`만 지원한다고 설명하며, 다루는 모델 목록에 3.8 Live가 들어 있습니다. 다만 `gemini-3.8-live`가 네이티브 오디오 모델인지 직접 확인하지는 않았습니다. 그렇다면 받아쓰기만 필요한데 오디오 출력 비용까지 내야 하므로 대안으로 적합하지 않습니다.

### 1-2. 임시 토큰 [High: 실측]
- `POST https://generativelanguage.googleapis.com/v1beta/auth_tokens`, 헤더 `x-goog-api-key`. 이 무료 티어 키로 **발급에 성공**했습니다(353–411 ms). 응답 필드는 `name`(`auth_tokens/…`) 하나뿐입니다.
- **문서 예시의 REST 필드명 `liveConnectConstraints`는 400 오류가 납니다**("Unknown name"). REST에서는 API 레퍼런스에 나온 `bidiGenerateContentSetup: { model, generationConfig, inputAudioTranscription }`를 써야 동작합니다. SDK는 내부에서 변환하는 것으로 보입니다 [Medium].
- 기본값: `uses` 1(1회 세션), `newSessionExpireTime` 60초(이 시간 안에 접속해야 함), `expireTime` 30분(최대 20시간 미만). PoC는 각각 1회·60초·5분으로 설정했습니다.
- 토큰을 모델과 설정에 고정할 수 있습니다. 다만 클라이언트가 다른 setup을 보냈을 때 거부되는지, 서버 설정으로 덮어써지는지는 확인하지 못했습니다 [Unknown].
- 무료 티어 사용 가능 여부는 문서에 적혀 있지 않지만, 실측상 발급과 세션 모두 됩니다. 무료 티어 RPM 한도는 확인하지 못했습니다 [Unknown].
- 요금: 무료 티어는 무료입니다. 유료는 입력 $0.005/분, 출력 $0.004/분입니다. **무료 티어는 "Used to improve our products: Yes"입니다.** 면접 답변 음성이 Google 학습에 쓰일 수 있으므로 `privacy.html`에 고지가 필요합니다 [High: 요금 페이지].

## 2. PoC 실측 (Node 24 내장 WebSocket, 임시 토큰 → Constrained WS)

- 스크립트: `scratchpad/stt-live/poc.mjs`(레포 밖)
- 실제 API 호출 9회: 토큰 발급 5회(그중 1회는 필드명 오류) + 세션 4회
- 입력: `stt-exp/*.wav`(TTS로 생성, 24 kHz)를 코드에서 16 kHz로 선형 리샘플한 뒤 40 ms 청크를 실시간 속도로 보냈고, 끝에 무음 1.2초를 붙였습니다.

| 항목 | ja1 | ja2 | ja3 | ko1 |
|---|---|---|---|---|
| 음성 길이 | 14.0 s | 16.0 s | 9.3 s | 10.8 s |
| WS open → setupComplete | 0.83 s | 1.25 s | 1.46 s | 0.84 s |
| 첫 잠정 결과(소리 시작 기준) | 0.98 s | 0.90 s | 0.92 s | 1.45 s |
| 잠정 결과 갱신 간격(중앙값) | 488 ms | 480 ms | 486 ms | 479 ms |
| 최종 결과(음성 끝 기준) | +0.82 s | +0.93 s | +0.94 s | +0.97 s |
| 필러 보존 | 3/4 | 5/6 | 4/5 | **0/4** |

- 버튼을 누른 뒤 받아쓰기 준비까지 약 1.3–1.9초가 걸립니다(토큰 발급 0.4 s + 접속 0.06 s + setup 0.8–1.5 s). 그 사이 녹음한 소리는 클라이언트 버퍼에 담아 두었다가 보내면 됩니다 [High: 실측].
- 최종 결과가 늦게 오는 이유는 서버 VAD의 침묵 대기(약 0.8 s)입니다. 하이브리드 VAD(보내기 시 `audioStreamEnd`)를 쓰면 더 빨라진다고 문서에 나와 있지만 측정하지는 않았습니다 [Medium].

### 원문 보존 여부 (핵심)
| | 원문 | Live 최종 (VERBATIM) | 성격 |
|---|---|---|---|
| ja2 | まとめることが、**できるです** | まとめることが**できます** | **문법 교정 → 첨삭 대상 오류가 사라짐** |
| ja3 | 逆に、**なんか**、 | 逆に**何か** | 표기 정규화. 何か는 보통 なにか로 읽으므로 발음 정보도 사라짐 |
| ja3 | ございますです | ございますです | 보존 |
| ja1 | えーと | えっと | 필러 종류가 바뀜(음성이 애매했을 가능성 있음) |
| ko1 | 음, 저는 어, … 그니까, … 어, | 저는 전 회사에서 …. 매출을 20% 올렸습니다. | **간투사 전부 삭제**, 숫자 정규화(이십 퍼센트→20%) |

- TTS가 처음부터 できます로 읽은 것이 아닙니다. 같은 ja2.wav를 배치 `gemini-3.5-flash-lite`로 받아쓰면 「できるです」가 나왔습니다(6/6 보존, `stt-exp/results-final.json`). 즉 음성에는 오류가 실제로 들어 있고, 교정은 transcribe 계열 모델이 한 것입니다 [High]. ko1도 잠정 결과에 「어」가 보였으므로, 음성에 간투사가 들어 있었다는 증거가 됩니다.
- 이 문제는 잠정 결과에서도 일관되지 않습니다.
  - ko1의 잠정 결과에는 "어", "그러니까"가 있었는데, 최종 결과에서 지워졌습니다.
  - ja2는 반대로, 잠정 결과에서 えー・なんか가 잠시 빠졌다가 최종 결과에 돌아왔습니다.
  - ja2의 できます는 잠정 결과 단계부터 이미 교정되어 있었습니다.
- 앞서 측정한 배치 `gemini-3.5-transcribe`와 같은 경향입니다. 같은 모델 계열이므로, 배치를 문서상 모드 파라미터가 있는 `/v1beta/interactions` API로 바꿔도 결과가 달라지지 않을 가능성이 높습니다 [Medium]. 현재 `lib/stt.js`는 모드 파라미터가 없는 `generateContent`를 씁니다.
- 실험 오염: ja1과 ja2의 WAV 앞부분 약 5.6초에 TTS가 지시문("Read aloud exactly as written…")을 영어로 읽은 소리가 들어 있습니다.
  - ja1에서는 이 영어가 별도의 최종 결과로 나왔습니다.
  - ja2에서는 ja-JP 힌트를 준 상태에서, 영어 구간이 잠정 결과에만 보이고 **최종 결과에서 아무 표시 없이 빠졌습니다.** 최종 결과가 말한 내용 일부를 조용히 버릴 수 있다는 증거입니다 [Medium].
- 한계: 모든 입력이 TTS 음성입니다. 실제 사람 목소리, 억양, 잡음, 비원어민 발음에서는 정규화가 더 심할 가능성이 큽니다 [Medium].

## 3. 브라우저 구현 가능성 (실행하지 않고 판단)

- 마이크 캡처
  - `getUserMedia` → `AudioWorklet`으로 Float32 샘플을 받아 16 kHz Int16으로 변환합니다.
  - 워클릿은 같은 출처의 별도 파일(`public/pcm-worklet.js`)로 두면 CSP `script-src 'self'`를 그대로 지킬 수 있습니다 [High].
  - 기존 `Permissions-Policy: microphone=(self)` 설정은 그대로 써도 됩니다 [High: vercel.json].
  - Safari는 `AudioContext({ sampleRate: 16000 })` 요청을 확실히 따르지 않으므로, 워클릿 안에서 직접 다운샘플해야 합니다. Safari 14.1부터 AudioWorklet을 지원합니다 [Medium: MDN 미확인].
- CSP: `connect-src 'self' wss://generativelanguage.googleapis.com`를 추가해야 합니다 [High].
- 서버(신규): `POST /api/stt-token` 엔드포인트가 필요합니다.
  - 처리 순서는 기존 핸들러와 같습니다: 접근 코드 확인 → rate limit → `auth_tokens` 발급.
  - 토큰에는 `uses: 1`, `newSessionExpireTime` 60초, `expireTime` 2–5분, 그리고 모델·`mode: VERBATIM`·언어 고정을 겁니다.
  - 응답은 `{ token }`만 보냅니다. 키는 절대 내보내지 않습니다. 키 없음이나 발급 실패는 기존 방식대로 `{ code }`로 반환합니다 [High: 설계].
- 클라이언트 흐름
  1. 마이크 버튼을 누르면 토큰을 받아 WS를 열고, 그동안 녹음된 소리는 버퍼에 쌓습니다.
  2. 잠정 결과는 입력창 위에 흐린 글씨로 보여 줍니다.
  3. Ctrl/Cmd+Enter 또는 정지 버튼을 누르면 `audioStreamEnd`를 보내고, 최종 결과를 입력창에 넣은 뒤 연결을 닫습니다.
- 마스킹: 오디오가 브라우저에서 Google로 직접 가므로, 서버의 `maskInput`/`redact`를 거치지 않습니다. 배치 방식 `/api/stt`도 "오디오는 마스킹 없이 Gemini로 전송"이므로 위험 수준은 같습니다. 다만 받아쓴 텍스트를 Claude에 보내는 단계는 기존 API를 거치므로 그대로 마스킹됩니다 [High].

## 4. 권고

**1) 정확도: 받아쓰기 결과를 "사용자가 실제로 한 말"로 취급하면 안 됩니다** [High: 실측]
- 배치든 Live든 같은 정규화가 일어납니다. 그래서 음성 답변에서는 "できるです 같은 문법 오류 첨삭"을 약속할 수 없습니다.
- 화면 안내 문구: "음성은 받아쓰기 과정에서 자동으로 다듬어질 수 있어요. 문법 첨삭을 받으려면 고쳐 쓰거나 직접 입력해 주세요."
- 구조(4문형)와 내용 피드백에는 문제가 없습니다.

**2) 스트리밍 vs 배치** [Medium]
- **배치 `/api/stt`를 기본으로 먼저 완성하십시오.** 이미 개발 중이고, 정확도는 Live와 같습니다.
- Live 스트리밍은 마감(11/8) 전에 시간이 남을 때만 추가하는 선택 기능으로 두십시오. 장점은 두 가지입니다.
  - 체감 반응: 0.9초 안에 첫 글자, 약 0.5초 간격 갱신
  - 잘못 들은 부분을 말하는 도중에 바로 알 수 있음
- Live를 넣으면 추가로 필요한 작업과 위험은 다음과 같습니다.
  - 추가 작업: 토큰 엔드포인트, 워클릿, WS 상태 관리, CSP 변경
  - 위험: Safari 브라우저 미검증, 임시 토큰 기능이 v1beta 프리뷰, REST 문서 예시 오류
  - 예상 분량: 서버 약 30줄 + 클라이언트 약 150줄

**3) "천천히 다시 말해 보세요"를 띄울 기준** (우선순위 순)
1. **최종 결과가 비었거나 너무 짧을 때** [Medium]
   - 발화 길이는 `voiceActivity`의 START→END `audioOffset`(배치는 클라이언트 녹음 시간)으로 잽니다.
   - 실측 글자 속도: 일본어 약 5.2–5.3자/초(ja1, ja3), 한국어 약 3.3자/초(간투사가 지워진 상태).
   - 기준값 제안: 일본어 1.5자/초 미만, 한국어 1자/초 미만, 또는 발화 1.5초 이상인데 결과가 빈 경우.
2. **기대한 언어의 문자가 아닐 때** [Medium]
   - 일본어 답변인데 가나·한자 비율이 50% 미만이거나, 한국어 답변인데 한글 비율이 50% 미만인 경우입니다.
   - `languageCode` 필드는 실측에서 오지 않았으므로 문자 종류로 판정해야 합니다.
3. **스크립트 소리 내어 읽기**: 기대 스크립트의 일본어 원문과 최종 결과를 문자 bigram Dice 유사도로 비교해, 0.6 미만이면 다시 읽기를 요청합니다 [Medium].
   - 사용자가 스크립트를 그대로 읽으면 같은 한자로 받아써지는 경우가 많아서, 새 라이브러리 없이 판정할 수 있습니다.
   - 가나 단위 비교는 받아쓴 한자를 읽기로 바꿔야 해서 kuromoji 수준의 사전(수 MB)이 필요합니다. 기존 `lib/kana.js`는 가나만 처리하므로 쓸 수 없습니다.
   - 何か/なんか 같은 표기 차이는 오탐을 일으킬 수 있습니다 [Low: 임계값 미검증].
4. **쓰면 안 되는 방법**
   - 신뢰도 점수: API에 해당 필드가 없습니다 [High].
   - 기대 스크립트를 `customVocabulary`에 넣기: 인식이 정답 쪽으로 끌려가 실제 발음 실수가 가려집니다. 회사명 정도만 넣으십시오 [Medium].
   - 잠정 결과와 최종 결과의 차이: 차이가 정상적으로도 크게 나므로(ko1의 필러) 기준이 되지 못합니다 [Low].

## 5. 미확인 항목
- 브라우저(특히 Safari·iOS) 실제 동작
- 하이브리드 VAD를 쓸 때 최종 결과 지연
- 토큰에 고정한 설정과 다른 setup을 보냈을 때의 동작
- 무료 티어 RPM 한도
- `/v1beta/interactions` 배치에서 `mode: verbatim`을 명시했을 때의 결과
- 실제 사람 목소리에서의 정규화 정도
