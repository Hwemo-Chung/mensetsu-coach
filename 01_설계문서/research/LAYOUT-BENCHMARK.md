# 데스크톱 레이아웃 벤치마크와 개편안 3종 (2026-11-03)

> 범위: 조사·제안만. 코드 변경 없음. 근거 태그 [High]=공식 문서 직접 확인, [Medium]=검색 요약·간접 근거, [Low]=추정.
> 관련: `UIUX-SPEC.md` §2·§3(현행 하이브리드), `public/style.css`, `public/panel.js`, `test/ui/layout.test.js`.

## 0. 결론 먼저

- **권고: 안 B(채팅 + 문서형 첨삭 창, 여백 주석)** 입니다. 지금의 `.app` 2열 그리드·`panel.js`·단계 상태(code → mail → pick ⇄ answer)·키 처리(Enter 줄바꿈, Ctrl/Cmd+Enter 전송)를 그대로 두고, **스타일시트 재작성 + 패널 기본 열림** 정도로 사용자가 요구한 네 가지(아이콘 배경 제거, 듀오톤 단일 스타일, 섬 UI 제거, 전폭 사용)를 모두 충족합니다. [High: 코드 직접 확인]
- 안 A(3단 작업공간)는 B의 **≥1200px 확장 단계**(왼쪽 질문 목록 추가)로 나중에 붙이는 것이 맞습니다. 별도 안으로 처음부터 가면 렌더 대상·선택 방식(JS)까지 바뀝니다. [Medium]
- 안 C(후리가나 리더)는 가독성은 최고지만, 한자별 읽기를 정렬한 **새 응답 스키마·프롬프트 변경**이 필요해 마감(11/8) 안에는 위험합니다. [High: `lib/script.js`는 문장 단위 `kana`/`reading`만 생성]

## 1. 핵심 긴장: "전폭 사용" ≠ "긴 줄"

요구 두 개가 문자 그대로는 충돌합니다. 1440px 폭에 본문 한 줄을 펼치면 일본어 한 줄이 80자를 넘고, 아래 모든 기준을 어깁니다.

**해법: 화면은 전폭 그리드로 채우고, 각 글 기둥은 줄 길이를 상한으로 묶는다.** 남는 폭은 줄을 늘리는 데 쓰지 않고 옆 창(첨삭·여백 주석·질문 목록)에 씁니다. GOV.UK의 2/3+1/3 열, Material의 supporting pane 70/30이 정확히 이 방식입니다. [High]

- 일본어·한국어 글 기둥: `max-width: 40em`(CJK 1em ≈ 전각 1자 → 약 40자). [High: 원리]
- 라틴 문자(영어 UI·로마자): `max-width: 70ch`. [High: 원리]

## 2. 가독성 기준 (출처 있는 수치만)

| 항목 | 기준 | 출처 | 태그 |
|---|---|---|---|
| 줄 길이(일반) | 한 줄 80자 이하, **CJK는 40자 이하** | W3C WCAG 1.4.8 (AAA) | [High] |
| 줄 길이(일본어 횡조) | 횡조 최대 **40자** | W3C JLREQ, 기본 판면 설계 주석 | [High] |
| 줄 길이(라틴) | 50–75자 | Baymard | [Medium] (검색 요약) |
| 줄 길이(정부 서비스) | 2/3 열, 보통 **75자 이하**, 페이지 최대 1020px | GOV.UK Design System Layout | [High] |
| 행간(일반) | 문단 안 행간 **1.5 이상**, 문단 간격은 행간의 1.5배 이상 | WCAG 1.4.8 | [High] |
| 행간(일본어) | 줄 사이 여백 0.5–1em, **35자 넘는 줄은 1em 가까이** (= line-height 약 1.75–2.0) | JLREQ | [High] |
| 행간·크기(일본 정부) | 본문·UI **16px 이상**, 14px 미만 원칙상 금지, 본문 line-height **1.5 / 1.6 / 1.7 / 1.75**, 16–26px 자간 0.02em | 디지털청 디자인 시스템(DADS) Typography | [High] |
| 행간(일본 SaaS) | 문단 1.5배(16px 기준) | SmartHR Design System | [High] |
| 한국어 본문 | KRDS 17px 본문 언급은 제3자 갤러리 정리뿐, 공식 수치 미확인 | — | [Low] |
| 대비 | 일반 글자 **4.5:1**, 큰 글자 3:1 (AA) / 아이콘·UI 경계 **3:1** | WCAG 1.4.3 / 1.4.11 | [High] |

**현재 코드에 적용하면** [High: `public/style.css` 직접 확인]
- `.legend`·`.tag`·`.script .label` 11px, `.tr`·`.points`·`.cmp` 13px → DADS 하한(14px) 미달. 본문 16px, 보조 14px로 올려야 합니다.
- `.msg` line-height 1.5는 한국어·영어엔 충분하지만, 모범 스크립트 일본어는 1.75–1.9가 맞습니다(JLREQ: 35자 넘는 줄은 1em 여백).
- 회색 대비: `#666` 5.74:1, `#555` 7.46:1 통과. 대기 점 `#8a939c`(약 3.1:1)는 글자에 쓰면 미달. [High: 계산]
- 듀오톤 아이콘은 보조 레이어(옅은 면)만으로는 3:1을 못 넘습니다. **의미는 진한 선 레이어가 지고, 옅은 면은 장식**이어야 1.4.11을 지킵니다. [Medium]

## 3. 벤치마크 11종

| # | 제품 / 문서 | 넓은 화면에서 읽기 쉬운 이유 (레이아웃 패턴) | 우리 앱 대응 부분 | 태그 |
|---|---|---|---|---|
| 1 | Material 3 **Supporting pane** — developer.android.com/guide/topics/large-screens/large-screen-canonical-layouts | 주 영역 약 2/3(expanded에서 70%)+보조 영역 30%. 보조 영역은 주 내용과 함께일 때만 의미. 예시로 "문서 + 검토자 코멘트". 좁으면 아래·바텀시트로 이동 | 채팅(주) + 첨삭/노트(보조) = 안 B | [High] |
| 2 | Material 3 **List-detail** + window size class — 같은 문서, .../use-window-size-classes | 840dp 이상에서 동시 표시, 좁아지면 상세만 남김. 폭 구간 600 / 840 / 1200 / 1600 | 질문 10개 목록 + 선택한 질문 상세 = 안 A, 브레이크포인트 근거 | [High] (목록 고정폭·상세 가변폭 관례는 [Medium]: SAP Fiori 미러) |
| 3 | **GOV.UK Design System** Layout — design-system.service.gov.uk/styles/layout/ | 최대 1020px, 본문은 항상 2/3 열, 줄 75자 이하. "넓은 화면에서 줄이 길어지는 것을 막는다" | 글 기둥 상한 원칙 전체 | [High] |
| 4 | **Claude Artifacts** — support.claude.com/en/articles/9487310 | 산출물이 대화 옆 자체 창에 열림. 대화(과정)와 결과(문서)를 분리 | 대화 = 채팅 흐름, 결과 = 모범 스크립트·첨삭 문서 | [High] |
| 5 | **ChatGPT Canvas** — openai.com/index/introducing-canvas | 별도 창에서 문서를 두고 "편집자·코드 리뷰어처럼" 인라인 피드백, 구간 하이라이트, 버전 되돌리기 | 답변 위 인라인 첨삭, 1차↔2차 비교 | [High] 창 분리 / [Medium] 좌우 배치 |
| 6 | **Grammarly Editor** — support.grammarly.com/hc/en-us/articles/360003474732 | 문서 본문 왼쪽, 제안 카드 오른쪽, 위에서부터 순서대로 안내 | 첨삭 창: 본문 ↔ 수정 이유 | [Medium] |
| 7 | **DeepL Write** — support.deepl.com/hc/en-us/articles/11673757647388 | 왼쪽 원문 / 오른쪽 개선문, 변경은 초록, "Show changes" 토글, "Corrections only" 모드 | before → after, 규칙 밖 수정 금지 원칙과 같은 결 | [Medium] (공식 페이지 403, 검색 요약) |
| 8 | **Google Docs 제안 모드** — support.google.com/docs/answer/6033474 | 제안은 새 색, 삭제는 취소선. 제안에 댓글로 이유 첨부 | 첨삭 표기: 삭제 취소선 + 삽입 강조 + 한 줄 이유 | [High] 표기 / [Low] 여백 댓글 위치 |
| 9 | **GitHub PR diff** — docs.github.com/.../reviewing-proposed-changes-in-a-pull-request | unified / split 선택(선택 유지), 파일 트리로 이동, 줄 단위 코멘트 | 1차 vs 2차 답 split 비교(`.cmp-answers`), 질문 목록 = 파일 트리 | [High] |
| 10 | **Microsoft Reading Coach** — support.microsoft.com/en-us/education/use-reading-coach-in-immersive-reader | 소리 내 읽기 뒤 속도·정확도 보고, 틀린 단어 목록을 골라 듣고 연습 | 🎤 따라 읽기 결과: 어긋난 단어 강조 + 다시 듣기 | [Medium] |
| 11 | **Satori Reader** — satorireader.com | 한자 / 가나 / 한자+후리가나 표시 전환, 오디오·번역·문법 설명 동반 | 모범 스크립트 읽기 표시 전환 = 안 C | [High] 표시 모드 / [Low] 레이아웃 세부 |
| 참고 | MDN `<ruby>` — developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/ruby | 동아시아 글자 발음 주석 표준 요소, 2015-07부터 Baseline | 안 C 구현 수단 | [High] |

공통 패턴 요약 [Medium: 위 11종의 귀납]
1. **배경색 대신 선**: 영역은 1px 구분선과 여백으로 나누고, 카드 그림자·떠 있는 섬을 쓰지 않습니다.
2. **글 기둥 상한 + 옆 창**: 줄은 짧게, 폭은 창 수로 씁니다.
3. **여백 주석(margin note)**: 이유·규칙 번호를 본문 옆에 붙여 본문 흐름을 끊지 않습니다(Docs·Grammarly·GitHub).
4. **변경 표기의 관례**: 삭제 = 취소선, 삽입 = 강조색, 이유 = 한 줄.
5. **고정 머리·입력줄**: 상단 바와 입력줄만 고정, 나머지는 각 창이 따로 스크롤.

## 4. 현재 UI 진단 → 바꿀 곳

| 사용자 요구 | 원인 (현재 CSS) | 바꿀 방향 |
|---|---|---|
| 섬 UI 제거 | `.msg` 18px 둥근 말풍선·82% 폭, `--chat:#8cabd8` 파란 배경, `.cmp-answer` 회색 상자, `.tour` 그림자, `.app` 560px 중앙 고정 | 흰 배경, 말풍선 없는 **평평한 행**(화자 라벨 + 위쪽 1px 구분선). 이미 `.q`가 이 방식(`border-top:1px solid #eee`) |
| 아이콘 뒤 파스텔 상자 제거 | `.script .listen` 원형 `--green-soft`, `.tag` 연녹 배경, `.mic` 테두리 상자, `.note.msg` 노란 배경 | 배경 없는 아이콘 + 글자 라벨. 상태는 색 글자·선으로 표시 |
| 듀오톤 아이콘 한 종 | 이모지 🔊 🎤 📎 ⚙ ✓ ✗ 혼용(OS마다 모양·색이 다름) | **Phosphor Icons Duotone** 한 종으로 통일 (아래) |
| 데스크톱 전폭 | `--chat-w:560px`, `--panel-w:400px` 고정, `.bar`의 `margin-inline: calc(...)` 중앙 정렬 꼼수 | `minmax()` 가변 열, 최대 1600px, `.bar` 꼼수 삭제 |

**아이콘 선택: Phosphor Duotone** [High: README]
- 6가지 굵기(Thin·Light·Regular·Bold·Fill·**Duotone**), MIT 라이선스, 1,248개.
- CSP가 `script-src 'self'; style-src 'self'`이므로 CDN 웹폰트 대신 **필요한 SVG 10여 개만 레포에 복사**(인라인 `<svg>` 또는 동일 출처 스프라이트). README에 MIT 표기. [High: `vercel.json` 확인 / Medium: 대회 "권리 있는 코드만" 규칙에 MIT 자산이 해당한다는 해석]
- 색은 `currentColor` 한 가지(본문 `#1f1f1f` 또는 `--green-ink`). 옅은 면 레이어는 장식.
- Font Awesome Duotone은 유료(Pro)라 제외. [Medium]

**시각 토큰 제안** [Medium: 위 기준에서 도출]
- 배경 `#fff`, 본문 `#1f1f1f`, 보조 `#5c5c5c`(6.69:1), 구분선 `#e5e5e5`, 강조 `--green-ink #047a35`(기존, 흰 바탕 5.47:1), 오류 `#b00020`. 그림자 0, 모서리는 입력칸·버튼만 6px.
- 크기: UI·한국어 본문 16px / lh 1.6, 보조 14px / lh 1.5, **일본어 스크립트 18px / lh 1.85**, 읽기(발음) 15px.

## 5. 개편안 3종

공통 전제 [High: `public/app.js` 확인]
- 단계 상태는 `stage` 문자열(code → mail → pick ⇄ answer, profile)과 `#composer` 제출 하나로 돌아갑니다. 키 처리는 `#input` keydown(Ctrl/Cmd+Enter → `requestSubmit`)이고, Enter는 기본 줄바꿈입니다. **세 안 모두 이 두 가지는 건드리지 않습니다.**
- 모바일 390px는 지금처럼 단일 열 + 전체 화면 패널(`panel.js` inert 처리)을 기준으로 합니다.

### 안 A — 3단 작업공간 (질문 목록 | 답변·스크립트 | 첨삭)

벤치마크: Material list-detail, GitHub 파일 트리 + diff.

1440px
```
+------------------------+----------------------------------------------+--------------------------+
| (o) Mensetsu Coach   ACME Corp / Backend Eng.      [JP v] [KO v] [gear] [End]                    |
+------------------------+----------------------------------------------+--------------------------+
| QUESTIONS 10           | Q3  Tenshoku riyuu (why change jobs)         | Review | Notes           |
|                        |                                              | ------------------------ |
|   1 Self-intro    [ok] | YOUR ANSWER (1st)                            | STRUCTURE 3/4            |
|   2 Motivation    [ok] | JA answer text ............ (<=40em)         | [ok] Restate             |
| > 3 Why change    [..] | ..................................           | [ok] Conclusion          |
|   4 Strength      [  ] | -------------------------------------------- | [x]  Basis/number        |
|   5 Weakness      [  ] | MODEL SCRIPT                    [spk]        |      > hint line         |
|   6 ...                | JA script 18px / lh 1.9 ............         | [ok] Options             |
|                        | reading (hangul/romaji) 15px .......         | ------------------------ |
|                        | translation 15px muted ..............        | CORRECTIONS 2            |
|                        | points: - ... - ...                          | - sasete itadaku         |
|                        | [mic] Read aloud  -> 12/14 matched           | + itashimasu             |
|                        |                                              |   why: over-humble       |
| [Paste new mail]       | -------------------------------------------- | BEFORE | AFTER  (split)  |
|                        | Enter=newline  Cmd/Ctrl+Enter=send           |                          |
|                        | [clip] [ textarea .............. ] [mic]     |                          |
|                        |                               [Send]         |                          |
+------------------------+----------------------------------------------+--------------------------+
|   280px fixed          |   1fr  (text capped 40em ~ 640px)            |   440px                  |
```

390px — list-detail 규칙대로 목록 → 상세 화면 전환(뒤로 가기)
```
+--------------------------------------+
|  (o) Coach             [KO v] [gear] |
+--------------------------------------+
|  QUESTIONS 10                        |
|  1 Self-intro                 [ok]   |
|  2 Motivation                 [ok]   |
|  3 Why change                 [..]   |
|  ...                                 |
+--------------------------------------+
|  tap a row -> detail screen:         |
+--------------------------------------+
|  < Back      Q3 Why change           |
| ------------------------------------ |
|  YOUR ANSWER ....................    |
|  STRUCTURE 3/4  [x] Basis            |
|  CORRECTIONS 2 (before/after)        |
|  MODEL SCRIPT              [spk]     |
|  ...............................     |
+--------------------------------------+
|  [clip] [ textarea ....... ] [mic]   |
|  Cmd/Ctrl+Enter=send     [Send]      |
+--------------------------------------+
```

- code·mail 단계는 질문이 없으므로 가운데 창만 보이는 상태(왼·오른쪽 빈 창)를 따로 둬야 합니다.

| | 장점 | 단점 |
|---|---|---|
| 가독성 | 질문 맥락이 늘 보임. 가운데 글 기둥 40em 상한 지키기 쉬움 | 3열이라 1024–1199px에서는 2열로 접어야 함 |
| 코드 | 진도 표시([ok]/[..]) 가 자연스러움 | 질문 고르기가 지금은 **번호 입력**(`onPick(text)`가 `Number(text)`로 파싱) → 목록 클릭 연결 JS 필요. 채팅 로그 대신 질문별 상세에 렌더하도록 `render.js` 대상 변경. 채팅 흐름이 사라져 "채팅 코치" 정체성이 약해짐 |

### 안 B — 채팅 흐름 + 문서형 첨삭 창 (여백 주석) ★권고

벤치마크: Material supporting pane, Claude Artifacts, Grammarly, Google Docs 제안 모드, GitHub split diff.

1440px
```
+----------------------------------------+---------------------------------------------------------+
| (o) Mensetsu Coach   ACME Corp / Backend Eng.      [JP v] [KO v] [gear] [End]                    |
+----------------------------------------+---------------------------------------------------------+
| CHAT (flat rows, no bubbles)           | REVIEW  |  NOTES                      Q3 Why change     |
| -------------------------------------- | ------------------------------------------------------- |
| COACH                                  | 1  STRUCTURE 3/4                  | MARGIN NOTE         |
| Q3. Tenshoku riyuu o oshiete ...       |    [ok] Restate [ok] Conclusion   |                     |
| -------------------------------------- |    [x] Basis/number [ok] Options  | add 1 number        |
| YOU                                    | ----------------------------------+-------------------- |
| JA answer text, max 40em ...           | 2  CORRECTIONS 2                  |                     |
| ..............................         |    - sasete itadaku               | over-humble,        |
| -------------------------------------- |    + itashimasu                   | rule #12            |
| COACH                                  | ----------------------------------+-------------------- |
| Review ready -> right pane  [open]     | 3  MODEL SCRIPT          [spk]    | point 1             |
|                                        |    JA 18px / lh 1.9 ......        | point 2             |
|                                        |    reading 15px ..........        |                     |
|                                        |    translation 15px muted         |                     |
|                                        |    [mic] Read aloud -> 12/14      |                     |
|                                        | ----------------------------------+-------------------- |
|                                        | 4  BEFORE (1st)          | AFTER (2nd)                  |
| -------------------------------------- |    [x][x][-][x]          | [ok][ok][ok][ok]             |
| Enter=newline Cmd/Ctrl+Enter=send      |                                                         |
| [clip][ textarea ......... ][mic]      |                                                         |
|                          [Send]        |                                                         |
+----------------------------------------+---------------------------------------------------------+
|   minmax(420px, 2fr) ~ 520px           |   minmax(560px, 3fr) ~ 920px = 640 body + 260 notes     |
```

390px — 지금 구조 그대로(평평한 행 + 전체 화면 첨삭 시트)
```
+--------------------------------------+
|  (o) Coach   [Review] [KO v] [gear]  |
+--------------------------------------+
|  COACH                               |
|  Q3. Tenshoku riyuu o ...            |
| ------------------------------------ |
|  YOU                                 |
|  JA answer text ................     |
| ------------------------------------ |
|  COACH  structure 3/4, 2 fixes       |
|  [Open review]                       |
+--------------------------------------+
|  [clip] [ textarea ....... ] [mic]   |
|  Cmd/Ctrl+Enter=send     [Send]      |
+--------------------------------------+
|  [Open review] -> full-screen sheet: |
+--------------------------------------+
|  Review | Notes            [Close]   |
| ------------------------------------ |
|  1 STRUCTURE ...                     |
|  2 CORRECTIONS                       |
|    - before / + after                |
|    > why: margin note goes below     |
|  3 MODEL SCRIPT        [spk] [mic]   |
+--------------------------------------+
```

- 첨삭 창 안은 2열 그리드: 본문 기둥 `minmax(0, 40em)` + 여백 주석 260px(수정 이유·규칙 번호·포인트). 1280px 미만에서는 주석이 본문 아래로 내려갑니다.
- ≥1024px에서는 패널을 **기본으로 열어 두고**, 첨삭 전에는 "답하면 여기에 첨삭이 나옵니다" 빈 상태 문구를 둡니다(지금은 첫 첨삭 때 자동 열림).

| | 장점 | 단점 |
|---|---|---|
| 가독성 | 대화(짧은 글)와 결과(긴 글)를 분리. 결과 쪽이 넓어 여백 주석으로 이유를 본문 밖에 둠. before/after split 그대로 활용 | 채팅 쪽 질문 원문과 첨삭 창이 떨어져 있어 시선 이동이 생김 → 첨삭 창 머리에 "Q3 …" 고정 표시로 보완 |
| 코드 | `.app` 2열 그리드, `#panel` 2열 배치, `panel.js` `wide` 미디어 쿼리·모바일 inert 로직, 단계 상태 **전부 유지**. 주 작업은 `style.css` 재작성 + `index.html` 아이콘 교체 + 패널 기본 열림(`panel.js` 몇 줄) | `test/ui/layout.test.js`가 채팅 열 **560px**와 "첫 첨삭에 자동 열림"을 단언(40·60행) → 의도 변경(고정폭 → 가변폭, 자동 열림 → 기본 열림)을 밝히고 테스트 수정 필요 |

### 안 C — 2단 리더 (후리가나 스크립트 | 코칭)

벤치마크: Satori Reader, MDN `<ruby>`, Microsoft Reading Coach.

1440px
```
+----------------------------------------------------------+---------------------------------------+
| (o) Mensetsu Coach   ACME Corp / Backend Eng.      [JP v] [KO v] [gear] [End]                    |
+----------------------------------------------------------+---------------------------------------+
| < Q2   Q3 / 10  Why change   Q4 >      [ruby on/off]     | COACHING                              |
| -------------------------------------------------------- | ------------------------------------- |
|   kana    kana        kana                               | STRUCTURE 3/4                         |
|   KANJI wa KANJI-KANJI o ...   (20px, lh 2.2)            | [ok][ok][x][ok]  Basis/number         |
|   kana        kana                                       | ------------------------------------- |
|   KANJI KANJI-KANJI ............                         | CORRECTIONS 2                         |
|   (reader column capped 36-40 zenkaku)                   | - sasete itadaku  + itashimasu        |
|                                                          |   why: over-humble                    |
|   translation (toggle) ..............                    | ------------------------------------- |
|   [spk] Listen 0.8x/1x  [mic] Read aloud                 | BEFORE / AFTER                        |
|   -> mismatched words underlined in red                  | ------------------------------------- |
|                                                          | NOTES (this question)                 |
| -------------------------------------------------------- | [ textarea .......................]   |
| History (chat, collapsed) [v]                            | ------------------------------------- |
| [clip][ answer textarea ................ ][mic] [Send]   |                                       |
+----------------------------------------------------------+---------------------------------------+
|   1fr (reader, max 40em at 20px ~ 800px)                 |   420px                               |
```

390px — 리더 위, 코칭은 접이식 목록, 입력줄 고정
```
+--------------------------------------+
|  (o) Coach   Q3/10 < >   [gear]      |
+--------------------------------------+
|   kana  kana                         |
|   KANJI wa KANJI o ... (18px)        |
|   translation ........               |
|  [spk] Listen     [mic] Read aloud   |
+--------------------------------------+
|  COACHING (accordion)                |
|  > Structure 3/4                     |
|  > Corrections 2                     |
|  > Before/After                      |
|  > Notes                             |
+--------------------------------------+
|  [clip] [ textarea ....... ] [mic]   |
|  Cmd/Ctrl+Enter=send     [Send]      |
+--------------------------------------+
```

| | 장점 | 단점 |
|---|---|---|
| 가독성 | 읽기 대상(스크립트)이 주인공. 20px / lh 2.2(루비 줄 포함)로 소리 내 읽기 연습에 최적. 어긋난 단어를 본문 위에 직접 표시 | 채팅 이력이 접혀 "무엇을 물었고 답했는지" 흐름이 약해짐 |
| 코드 | `<ruby>`는 모든 브라우저 지원 | 지금 응답은 문장 단위 `kana`(히라가나 전체)와 `reading`(한글/로마자 변환, `lib/kana.js`)뿐이라 **한자별 정렬 읽기가 없음** → `lib/script.js` 스키마·프롬프트 변경, `npm run test:live` 재실행(크레딧), 스냅샷(`test/snapshots/*`) 갱신. 단계 UI도 리더 중심으로 재배치 |

## 6. 비교와 권고

| 기준 | A 3단 | **B 채팅+문서** | C 리더 |
|---|---|---|---|
| 1440px 폭 활용 | 높음 | 높음 | 중간 |
| 일본어 본문 가독성 | 높음 | 높음 | 매우 높음 |
| 단계·키 처리 보존 | JS 변경 필요 | **그대로** | 재배치 필요 |
| 백엔드·프롬프트 변경 | 없음 | **없음** | 있음 |
| 바뀌는 파일 | css, html, app.js, render.js, panel.js, 테스트 | **css, html(아이콘), panel.js 일부, layout 테스트** | css, html, app.js, render.js, lib/script.js, 스냅샷 |
| 11/8 마감 위험 | 중 | **낮음** | 높음 |

**권고: B.** [Medium: 일정·코드 범위에서 도출]
1. 1차(B 본체): 흰 배경·평평한 행·구분선, Phosphor Duotone 아이콘, 가변 2열(`minmax(420px,2fr) minmax(560px,3fr)`, 최대 1600px), 첨삭 창 본문 40em + 여백 주석, 글자 크기 하한 14px, 일본어 18px / lh 1.85.
2. 2차(선택, ≥1200px): A의 질문 목록을 접이식 좁은 띠로 왼쪽에 추가. 클릭은 기존 `onPick`에 번호 문자열을 넘기는 방식이면 단계 로직 수정 없이 붙습니다. [Medium]
3. 3차(마감 후): C의 루비 표시를 첨삭 창 "모범 스크립트" 섹션의 표시 전환으로 흡수(스키마 확장 필요).

착수 전 결정이 필요한 것
- LINE풍 정체성(초록 바·말풍선)을 버리는 것에 동의하는지. 상단 바 초록 배경도 "파스텔 상자"와 같은 장식으로 볼지(제안: 흰 바 + 초록은 강조 글자·버튼에만).
- 레이아웃 테스트 560px 단언을 가변폭 단언(예: 채팅 열 ≥420px, 패널이 채팅 오른쪽, 각 글 기둥 ≤40em)으로 바꾸는 것.

## 7. 한계·미확인

- NHK NEWS WEB EASY(후리가나·음성 뉴스)는 이용 동의 게이트 때문에 본문 확인 실패 → 벤치마크에서 제외. [Unknown]
- DeepL Write 공식 도움말은 403(Cloudflare)으로 직접 확인 못 함, 검색 요약만 사용. [Medium]
- Google Docs 댓글이 "본문 오른쪽 여백"에 붙는다는 점은 공식 문서에서 확인 못 함("오른쪽 위 모든 댓글 보기"만 확인). [Low]
- 한국어 본문 크기·행간의 공식 수치(KRDS)는 미확인. WCAG 1.5 이상과 DADS 16px 하한을 한국어에도 적용하는 것으로 갈음. [Medium]
- ChatGPT·Claude 웹의 채팅 열 실제 px 값은 공식 문서가 없어 인용하지 않았습니다.
- 와이어프레임은 정렬을 위해 ASCII(영문 라벨)로 그렸습니다. 실제 화면 문구는 i18n 키를 따릅니다.

## 출처

- W3C WCAG 2.2 Understanding SC 1.4.8 Visual Presentation — https://www.w3.org/WAI/WCAG22/Understanding/visual-presentation
- W3C JLREQ (Requirements for Japanese Text Layout) — https://www.w3.org/TR/jlreq/
- 디지털청 디자인 시스템 Typography — https://design.digital.go.jp/dads/foundations/typography/
- SmartHR Design System Typography — https://smarthr.design/products/design-tokens/typography/
- Baymard, Line Length Readability — https://baymard.com/blog/line-length-readability
- GOV.UK Design System Layout — https://design-system.service.gov.uk/styles/layout/
- Android canonical layouts — https://developer.android.com/guide/topics/large-screens/large-screen-canonical-layouts
- Android window size classes — https://developer.android.com/develop/ui/compose/layouts/adaptive/use-window-size-classes
- Claude Artifacts 도움말 — https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them
- OpenAI, Introducing canvas — https://openai.com/index/introducing-canvas/
- Grammarly Editor 도움말 — https://support.grammarly.com/hc/en-us/articles/360003474732
- DeepL Write 도움말 — https://support.deepl.com/hc/en-us/articles/11673757647388-Use-DeepL-Write
- Google Docs 제안 모드 — https://support.google.com/docs/answer/6033474
- GitHub, Reviewing proposed changes in a pull request — https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/reviewing-proposed-changes-in-a-pull-request
- Microsoft Reading Coach — https://support.microsoft.com/en-us/education/use-reading-coach-in-immersive-reader
- Satori Reader — https://www.satorireader.com/
- MDN `<ruby>` — https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/ruby
- Phosphor Icons README — https://github.com/phosphor-icons/homepage
