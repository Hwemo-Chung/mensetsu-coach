# 디자인 레퍼런스 5선 (Refero Styles 기준)

작성 2026-11-03. 출처: https://styles.refero.design/ (Refero Styles, Beta). 확정 방향(레이아웃 B: 왼쪽 채팅 평면 행 + 오른쪽 문서형 첨삭 패널, 흰 상단바, 초록 #047a35 강조 전용, Phosphor duotone, 파스텔 박스·섬 UI 금지, 가독성 우선)에 맞춰 고른 참고 자료입니다. 코드 변경은 없습니다.

## 1. 사이트가 무엇이고, 어떻게 순위를 매기는가

- 각 항목은 실제 제품 웹사이트 1곳을 측정해 만든 "스타일 페이지"입니다. 색(hex·역할), 타입 스케일, 간격, 반경, 그림자, 컴포넌트 설명, Do/Don't, DESIGN.md·Tailwind·CSS 변수 내보내기를 제공합니다. [High]
- 페이지 스스로 "측정값은 정규화, 역할·권장은 해석, HTML 예시는 재구성"이라고 밝힙니다. 그래서 이 문서의 **hex·px 값은 [High], 역할 설명과 Do/Don't는 [Medium]** 으로 봅니다.
- 홈은 "2,000+"라고 쓰지만 `sitemaps/styles.xml`에는 **1,342개**가 있습니다. 이 1,342개 전체의 제목·메타 설명을 수집해 분류했습니다. [High]
- 순위 신호: 홈의 `?sort=popular` 상위 20은 Dala, Mercury, Linear, ORYZO AI, Apple, Steep, Notion 등 시각적으로 강한 랜딩 페이지 위주입니다. 조회수·저장수 같은 수치는 공개되지 않습니다. 사이트 쪽 큐레이션 신호는 `/design-styles/*` 컬렉션 페이지뿐이며, 이번 5선 중 Vercel·Mintlify는 devtools 컬렉션에 들어 있습니다. [High]
- 따라서 이 문서의 "상위 1%"는 사이트 순위가 아니라 **아래 기준으로 1,342개 중 5개(0.37%)를 고른 결과**입니다. 사이트 인기 순위와 같다고 주장하지 않습니다. [High]

## 2. 선정 기준 (모두 통과해야 함)

1. **단일 강조색이 우리 초록과 양립**: 무채색 + 강조색 1개이고, 그 강조색이 초록·청록 계열이거나 아예 없음.
2. **상자 없이 위계**: 그림자·파스텔 면·떠 있는 둥근 카드 대신 1px 헤어라인, 굵기·크기 대비, 값(명도) 차이로 구조를 만듦.
3. **본문 굵기 ≥ 400**: 300 같은 가는 굵기가 정체성인 시스템은 일본어 18px 스크립트에서 획이 흐려지므로 제외.
4. **글꼴을 우리가 쓸 수 있음**: OFL 또는 시스템 글꼴로 대체 가능. CSP가 `default-src 'self'`라 외부 폰트 호스트는 불가, 자체 호스팅만 가능.
5. **문서·편집기 품질**: 긴 글, 교정, 문서 읽기 맥락에 가까움.

## 3. 후보 17개와 탈락 사유

| 후보 | 결과 | 사유 |
|---|---|---|
| Vercel | **선정** | 아래 참조 |
| Mintlify | **선정** | 아래 참조 |
| ElevenReader | **선정** | 아래 참조 |
| Grammarly | **선정** | 아래 참조 |
| Literal | **선정** | 아래 참조 |
| Stripe | 탈락 | 전 텍스트 weight 300이 정체성(기준 3 위반), 강조색 인디고 |
| Readwise | 탈락(기법만 참고) | 형광펜 #fff7ca 면 강조 = 파스텔 면. 캔버스 #f1f5f8 위 카드 구조. Charter는 OFL이 아님 |
| Things | 탈락 | 본문 #838b96 on #fff = **3.44:1**(4.5 미달), 기울인 목업·층층 그림자 |
| Notion | 탈락 | 따뜻한 캔버스 + 원색 카드 배경(sticky note) |
| Medium | 탈락 | 크림 캔버스 #f7f4ed, 오류에도 색을 쓰지 않는 규칙(우리는 교정 빨강 필요), 독점 글꼴 |
| Kagi / Capacities / Steep | 탈락 | 파스텔 제품 패널, 24px 이상 둥근 카드 |
| Opennote / Heptabase / Typewolf | 탈락 | 아이보리·에그셸 캔버스, 세피아 강조, 독점 세리프 |
| Tailwind CSS | 탈락 | 96px/700 + 신택스 하이라이트 다색 |
| Linear | 탈락 | 다크 테마 |

## 4. 5선

스크린샷(제3자 브랜드 자산 포함)은 공개 레포에 두지 않고 비공개 폴더에만 저장했습니다: `../BuiltWithClaude-2026-private/internal-docs/design-refs/{vercel,mintlify,elevenreader,grammarly,literal}-refero.png`

### ① Vercel — "종이에 조판한 터미널"

- URL: https://styles.refero.design/style/f24daf3a-d43f-4dec-85a9-8ac1d5148a03
- 왜 최상위인가: 장식색 0%, 헤어라인과 회색 4단계만으로 위계를 만드는 가장 엄격한 무채색 시스템입니다. 유일한 유채색이 성공 표시용 Terminal Green **#297a3a**라서, 우리 #047a35를 "강조 전용"으로 쓰는 방향과 같은 문법입니다. [High]
- 가져올 것
  - 텍스트 회색 단계: #171717(본문·제목) / #4d4d4d(보조 본문) / #666666(캡션) — 순검정 #000 대신 #171717. [High]
  - 헤어라인 #ebebeb 1px. 카드도 그림자 없이 1px 링으로만 구분. [High]
  - 반경 6px 이하, 큰 반경 금지. [High]
  - 라벨·메타데이터를 고정폭 글꼴(Geist Mono)로 구분하는 방식 → 우리는 "① 구조" 같은 섹션 라벨과 발음 표기에 응용. 단 원본은 11–12px 대문자인데 우리 최소 14px 규칙에 맞춰 14px로 올립니다. [Medium]
- 간격: 4px 기반, 밀도 compact, 4/6/8/12/14/16/20/24/32/40/44, 카드 패딩 16px, 섹션 간격 96–128px. [High]
- 글꼴: Geist Sans / Geist Mono = **SIL OFL 1.1**(github.com/vercel/geist-font LICENSE.txt 확인), 자체 호스팅 가능. 단 가나·한글이 없으므로 라틴 전용입니다. [High]
- 따라 하지 말 것: ▲ 로고, 스펙트럼 그라디언트, 64px/-0.06em 같은 극단 자간(우리 화면에 히어로가 없음).

### ② Mintlify — "단색 수도원 위의 초록 한 점"

- URL: https://styles.refero.design/style/80d7ef36-ed7e-48bb-b558-f772eb40106f
- 왜 최상위인가: 문서(Docs) 제품이라 "읽는 화면" 자체가 상품입니다. 흰 캔버스 + 거의 검정 + 초록 1색. 초록은 **활성 상태, 링크, 아이브로우 라벨에만** 쓰고 버튼 채움·큰 면에는 쓰지 않는다는 규칙이 우리 #047a35 사용 규칙과 같습니다. 오른쪽 "On this page" 목차 = 우리 여백 노트 자리. [High]
- 가져올 것
  - 활성 표시를 "좌측 2px 초록 막대 + 굵기 500"으로 처리(사이드바 활성 행). 배경 칠 없음. [Medium]
  - 버튼·입력 반경 4px, 주 버튼은 초록이 아니라 **검정 채움**(#08090a). [High]
  - 타입 스케일: 13 / 16 / 20 / 24 / 40px, 본문 16px·1.5. 우리는 13px을 쓰지 않으므로 14px로 대체. [High]
  - 헤어라인 #f2f2f2(아주 옅음) + 입력 테두리 #dddddd. [High]
  - 간격: 4px 기반, comfortable, 4/8/12/16/24/32/48/64/72/96, 카드 패딩 24px, 섹션 80px. [High]
- 주의: 원본 Mint Green **#0c8c5e on #fff = 4.26:1**로 작은 글자 기준(4.5) 미달입니다. 색 자체가 아니라 "초록을 어디에만 쓰는가"만 가져옵니다. [High]
- 글꼴: Inter 단일 = **OFL, 자체 호스팅 가능**. [High]
- 따라 하지 말 것: 히어로 손그림 구름 일러스트, 그라디언트, 16–24px 카드(섬 UI).

### ③ ElevenReader — "신문 지면의 미니멀리즘"

- URL: https://styles.refero.design/style/c51c8371-0e42-4bdf-9766-c9eac5eee9a5
- 왜 최상위인가: "읽기" 앱이며, 쌓이는 행을 **배경색·간격이 아니라 1px #e5e5e5 위아래 선으로만** 나누고 행 사이 간격 0px입니다. 레이아웃 B 왼쪽의 "말풍선 없는 평면 채팅 행"과 정확히 같은 패턴입니다. 본문 16px에서 줄간격 1.40 아래로 내리지 않는다는 규칙도 있습니다. [High]
- 가져올 것
  - 행 패턴: 전체 폭, 위아래 1px 선, 좌우 선 없음, 패딩 16px 20px, 형제 간격 0. [High]
  - 텍스트 #000 / 보조 #6e6e6e(5.10:1)·#767676(4.54:1). 둘 다 4.5 이상이지만 #767676은 경계값입니다. [High]
  - 그림자는 `0 1px 2px rgba(16,24,40,.05)` 하나뿐 → 우리는 이것도 쓰지 않습니다. [High]
  - 간격: 4px 기반, 8/12/16/20/24/28/32/40/44/60/64, 카드 패딩 28px, 요소 간격 8px, 섹션 64px. [High]
- 글꼴: WaldenburgHF(독점) → 사이트가 제시한 대체 Bricolage Grotesque(OFL)도 우리에겐 불필요. 본문 Inter(OFL). [High]
- 따라 하지 말 것: 히어로의 초록→라벤더 방사형 그라디언트, 모든 버튼 9999px 알약형(우리 4px 원칙과 충돌).

### ④ Grammarly — "사려 깊은 편집자의 책상"

- URL: https://styles.refero.design/style/be2af3f3-3886-4d70-973f-f7b5ab8d1a99
- 왜 최상위인가: **교정 제품**이라 우리와 기능이 가장 가깝습니다. 90% 이상 무채색, 짙은 청록 1색, 그림자 금지, 모든 상호작용 요소 반경 8px 단일값. "편집 작업 공간"을 평면·헤어라인으로 만든 사례입니다. [High]
- 가져올 것
  - 회색 사다리: #545454(보조, 7.57:1) / #707070(3차, 4.95:1) / #d9d9d9(헤어라인) / #ebebeb(옅은 헤어라인) / #f5f5f5(hover 면). [High]
  - 반경 1개만 쓰는 규율(원본 8px → 우리는 4px). [Medium]
  - 히어로 부제 최대폭 ~640px처럼 **문단 폭을 제한**. 우리는 CJK 40em. [High]
  - 강조색은 주 버튼·링크·활성 내비에만. 카드·일러스트 장식 금지. [High]
  - 간격: 8px 기반, 8/16/24/32/40/48/64/80/96, 카드 패딩 32px, 요소 간격 8px. [High]
- 글꼴: matter, Glyph = **독점, 사용 불가**. 사이트 제시 대체 Inter(OFL), Manrope(OFL). [High]
- 따라 하지 말 것: Grammarly Teal #027e6f(브랜드 고유색. 우리는 자체 초록 사용), 로고, 짙은 엔터프라이즈 띠.

### ⑤ Literal — "부드러운 햇빛의 열람실"

- URL: https://styles.refero.design/style/7e698bf6-6b31-40ed-a89a-40f4c37ade38
- 왜 최상위인가: 독서 제품이고, 유일한 유채색이 **Forest Green #278458**(4.64:1)인 무채색 시스템입니다. 초록을 주 행동과 별 글리프에만 쓰고 장식 금지, 두 번째 유채색 금지. 우리 "초록 = 강조 전용"과 같은 규칙이고, 글꼴이 **전부 OFL**이라 그대로 채택 가능한 유일한 후보입니다. [High]
- 가져올 것
  - 본문 #444340(따뜻한 짙은 회색, 9.89:1) + 제목 #000 대비, 헤어라인 #eeeeee. [High]
  - 반경 규칙 "4px(버튼·이미지) / 8px(큰 블록)만, 6·12px 같은 중간값 금지". [High]
  - 캡션 최소 14px, 본문 16px·1.45. 우리 "14px 미만 금지"와 일치. [High]
  - 간격: 4px 기반, 8/16/20/24/28/40/80, 카드 패딩 20px, 요소 간격 20px. [High]
  - 검색 입력을 테두리 없이 내비에 녹이는 처리 → 상단바 입력에 응용 가능. 단 입력 컨트롤 경계는 WCAG 1.4.11(3:1)을 지켜야 하므로 본문 입력창에는 적용하지 않습니다. [Medium]
- 글꼴: Inter + Libre Baskerville = **둘 다 OFL**. 다만 Libre Baskerville은 라틴 전용이고 우리 제목은 대부분 한·일 문자이므로 채택하지 않는 것을 권합니다. [High]
- 따라 하지 말 것: 별 글리프·워드마크, 캔버스 #f8f8f8 + 흰 카드 구조(섬 UI).

### 보조 기법: Readwise의 형광펜 (선정 외)

- URL: https://styles.refero.design/style/34c8dbee-f5d9-4495-a0e0-a25c6ca4b95b
- 2–4단어에만 #fff7ca 배경을 깔고 면·카드에는 금지하는 규칙입니다. 우리 "파스텔 박스 금지"와 긴장이 있으므로 **배경 대신 밑줄**(아래 토큰의 before/after 처리)로 대체하는 것을 권합니다. [Medium]

## 5. 5선에서 공통으로 뽑은 원칙

1. 유채색은 1개, 면이 아니라 **선·글자·2px 막대**로만. [High]
2. 구분은 1px 헤어라인과 명도 차이. 그림자 0개. [High]
3. 반경은 1–2개 값만(4px 중심). [High]
4. 주 버튼 검정 채움은 3/5(Vercel·Mintlify·ElevenReader)의 방식입니다. Literal·Grammarly는 강조색으로 채웁니다. 우리는 초록을 강조 전용으로 쓰므로 검정 채움 쪽을 따르고, 초록은 "현재 상태·좋아진 부분" 표시에만 씁니다. [Medium]
5. 문단 폭 제한과 넉넉한 줄간격이 시각 장식보다 우선. [High]

## 6. 제안 토큰 세트

대비는 WCAG 2.x 상대휘도 공식으로 직접 계산했습니다(소수 둘째 자리). [High]

```css
:root {
  /* 색: 면 */
  --bg: #ffffff;            /* 페이지·패널 모두 흰색. 회색 캔버스 + 흰 카드 구조 금지 */
  --bg-hover: #fafafa;      /* hover·선택 행만. 상시 면 색으로 쓰지 않음 */

  /* 색: 글자 (on #ffffff / on #fafafa) */
  --text: #171717;          /* 17.93:1 / 17.18:1  본문·제목 */
  --text-2: #4d4d4d;        /*  8.45:1            번역·보조 본문 */
  --muted: #666666;         /*  5.74:1 / 5.50:1   캡션·발음 표기·라벨 */
  --accent: #047a35;        /*  5.47:1 / 5.24:1   강조 전용: 활성 표시, after 밑줄, 통과 체크 */
  --accent-strong: #035e28; /*  7.97:1            accent hover·눌림 */
  --on-accent: #ffffff;     /*  5.47:1            accent 위 글자(드물게) */
  --danger: #b42318;        /*  6.57:1 / 6.30:1   before 취소선, 오류 문구 */

  /* 색: 선 (비텍스트) */
  --hairline: #ebebeb;      /* 1.19:1  행·섹션 구분선. 장식선이라 3:1 대상 아님 */
  --control-border: #8f8f8f;/* 3.23:1  입력창·버튼 테두리. WCAG 1.4.11(3:1) 충족 */
  --focus: #047a35;         /* 2px outline, offset 2px */

  /* 글꼴: 웹폰트 없음(시스템). CSP 변경 불필요 */
  --font-en: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --font-ja: "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic UI", "Yu Gothic", Meiryo, "Noto Sans JP", sans-serif;
  --font-ko: "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;

  /* 크기 (14px 미만 없음) */
  --fs-caption: 14px;       /* 라벨·여백 노트·메타 */
  --fs-body: 16px;          /* 채팅 행·설명 */
  --fs-script: 18px;        /* ③ 일본어 모범 스크립트 */
  --fs-h2: 20px;            /* 섹션 제목 ①–④ */
  --fs-h1: 24px;            /* 패널 제목 */
  --fw-regular: 400;
  --fw-strong: 600;         /* 300 계열 사용 금지 */

  /* 줄간격 */
  --lh-latin: 1.5;
  --lh-cjk: 1.7;            /* ko·ja 16px 본문 */
  --lh-script: 1.8;         /* ja 18px 스크립트(루비·발음 줄 여유) */
  --lh-heading: 1.3;

  /* 폭 */
  --measure-cjk: 40em;      /* ja·ko 한 줄 최대 */
  --measure-latin: 68ch;

  /* 간격: Grammarly의 8px 사다리에 4px 기반 시스템(Vercel·Literal 등)의 4·12를 더함 */
  --sp-1: 4px; --sp-2: 8px; --sp-3: 12px; --sp-4: 16px;
  --sp-5: 24px; --sp-6: 32px; --sp-7: 48px; --sp-8: 64px;

  /* 모양 */
  --radius: 4px;            /* 버튼·입력만. 패널·행은 0 */
  --rule: 1px solid var(--hairline);
}

:lang(ja) { font-family: var(--font-ja); line-height: var(--lh-cjk); }
:lang(ko) { font-family: var(--font-ko); line-height: var(--lh-cjk); }
:lang(en) { font-family: var(--font-en); line-height: var(--lh-latin); }
```

적용 규칙

- **언어별 `lang` 속성 필수**: 한·중·일 통합 한자(Han unification) 때문에 하나의 스택을 공유하면 일본어 한자가 한국어 자형으로(또는 반대로) 렌더링됩니다. 일본어 스크립트 요소는 `lang="ja"`, 한국어 설명은 `lang="ko"`를 붙여야 위 스택이 작동합니다. [High]
- **스크립트 줄간격**: `:lang(ja)`가 `--lh-cjk`(1.7)를 주므로 ③ 모범 스크립트 컨테이너에는 `font-size: var(--fs-script); line-height: var(--lh-script)`를 명시해 덮어써야 합니다. [High]
- **Android**: 기본 일본어 글꼴 이름은 "Noto Sans CJK JP"라 스택의 "Noto Sans JP"와 이름이 맞지 않습니다. `lang="ja"` + `sans-serif`로 결국 같은 글꼴이 잡히므로 동작에는 문제가 없습니다. [Low]
- **Yu Gothic 주의**: Windows의 "Yu Gothic" 400은 획이 가늘게 보이는 알려진 문제가 있어 "Yu Gothic UI"를 앞에 두었습니다. 그래도 흐리면 일본어 본문만 500을 검토합니다. [Medium]
- **웹폰트를 쓰지 않는 이유**: Inter·Geist(OFL)는 자체 호스팅이 가능하지만 가나·한글이 없어 효과는 라틴 문자에 한정됩니다. Noto Sans JP/KR(OFL) 전체 woff2는 수 MB라 비용 대비 이득이 작습니다. 라틴 품질을 올리고 싶다면 Inter를 `/fonts/`에 두고 `unicode-range: U+0000-00FF`로 라틴에만 적용하는 방법이 있으며, CSP `default-src 'self'`로 허용됩니다. [Medium]
- **위계 표현 (상자 없이)**
  - 섹션 ①–④: 위쪽 `var(--rule)` + 20px/600 제목 + 14px `--muted` 라벨. 배경·테두리 상자 없음. (Vercel·ElevenReader)
  - 채팅 행: 전체 폭, 아래쪽 `var(--rule)`, 패딩 16px 20px, 간격 0. 화자 이름은 14px `--muted`. (ElevenReader)
  - ② before→after: before = `--danger` 글자 + `text-decoration: line-through`, after = `--text` 글자 + 2px `--accent` 밑줄(`text-underline-offset: 3px`). 배경 칠 금지. 색만으로 구분하지 않도록 "前/後" 같은 텍스트 라벨을 함께 둡니다(WCAG 1.4.1). (Readwise 기법의 무배경 변형)
  - 활성·통과 표시: 왼쪽 2px `--accent` 막대 또는 체크 아이콘. (Mintlify)
  - 여백 노트: 오른쪽 열에 14px `--muted`, 본문과는 간격만으로 분리. (Mintlify 목차)
- 주 버튼: `--text` 채움 + 흰 글자, `--radius`. 초록 채움 버튼은 쓰지 않습니다. (Mintlify·ElevenReader·Vercel 공통) [Medium]

## 7. 복사 금지 목록

- 로고·워드마크·글리프: Vercel ▲, Literal 별, Grammarly 로고, Mintlify 일러스트. [High]
- 독점 글꼴: sohne, matter, Glyph, WaldenburgHF, Signifier, GT Super, Geist 이외 각사 커스텀 폰트. Charter는 Bitstream 무료 라이선스로 OFL이 아닙니다(OFL 대체는 Charis SIL). [Medium]
- 타사 고유 브랜드색을 우리 주색으로 쓰는 것: #027e6f, #278458, #0c8c5e, #297a3a. 이 문서에서는 "용법" 참고용일 뿐이며 우리 주색은 #047a35입니다. [High]
- Refero 페이지의 DESIGN.md 본문·스크린샷을 레포에 복사하지 않습니다(스크린샷은 비공개 폴더에만 둠). [High]

## 8. 확인하지 못한 것

- `?sort=popular`는 첫 20개만 확인했고, 그 뒤 페이지에서의 순위는 보지 않았습니다. [Low]
- 각 원본 사이트(vercel.com 등)를 직접 열어 Refero 측정값과 대조하지 않았습니다. 수치는 Refero 측정값을 그대로 인용했습니다. [Medium]
- 제안 토큰을 실제 화면에 적용한 렌더링(특히 Windows의 Yu Gothic·Malgun Gothic)은 확인하지 않았습니다. [Unknown]
