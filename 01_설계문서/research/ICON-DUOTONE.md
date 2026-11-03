# 듀오톤 아이콘 통일안 (조사 + PoC, 2026-11-03)

결론: **Phosphor Icons duotone**(MIT)을 채택합니다. `public/icons.svg` 단일 스프라이트 + `<svg><use href="/icons.svg#id"/></svg>`가 현재 CSP(`default-src 'self'; style-src 'self'`) 아래에서 위반 0건으로 렌더링되는 것을 확인했습니다. 레포 코드는 아직 바꾸지 않았습니다.

## 1. 후보 비교 (라이선스는 공식 레포 원문으로 확인)

| 세트 | 라이선스 (확인 위치) | 듀오톤 기본 제공 | 판정 |
|---|---|---|---|
| **Phosphor** | MIT, `phosphor-icons/core/LICENSE` | 있음 (`assets/duotone/`, 6가지 굵기 중 하나) | **채택** |
| Tabler | MIT | 없음 (`icons/outline`, `icons/filled`만) | 제외 |
| Iconoir | MIT | 없음 (`regular`, `solid`) | 제외 |
| Heroicons | MIT | 없음 (`16/20/24` solid·outline) | 제외 |
| Lucide | ISC | 없음 (선 아이콘 단일 스타일) | 제외 |
| Remix Icon | 자체 라이선스 "Remix Icon License v1.0"(2026-01), 표기 선택, 아이콘 단독 판매 금지 | 없음 (line/fill) | 제외 |
| Material Icons Two Tone | Apache-2.0, `google/material-design-icons/LICENSE` | 있음 (`materialiconstwotone`, 틴트 `opacity=".3"`) | 차선. Material Symbols에는 two-tone이 없고, 구버전 Icons에만 있습니다. 빈 `<rect fill="none">` 등 불필요한 요소가 많고 스타일이 우리 UI에 비해 딱딱합니다 |
| Solar (480 Design) | **[알 수 없음]** 공식 레포 `480-Design/Solar-Icon-Set`에 LICENSE 파일이 없습니다(GitHub license API 404, README에도 라이선스 문구 없음). CC BY 4.0이라는 말은 제3자 출처뿐입니다 | 있음 (Line Duotone, Bold Duotone) | 권리 확인 불가로 제외 |
| Hugeicons | 무료판 MIT (`hugeicons/hugeicons/LICENSE.md`) | 무료판은 "Stroke Rounded"만, Duotone/Twotone은 Pro 유료 라이선스 (README Free & Pro 표) | 제외 |
| Streamline | 공식 GitHub 레포가 없어 원문 확인 불가 | — | 제외 |

## 2. Phosphor 듀오톤 SVG 구조

- 모든 파일이 같은 형태입니다: `<svg viewBox="0 0 256 256" fill="currentColor">` 안에 **경로 2개**가 있고, 1번 경로는 `opacity="0.2"`(틴트 면), 2번 경로는 불투명(윤곽선)입니다. 빌드 스크립트로 PoC 22개 모두 이 형태임을 확인했습니다.
- 그래서 `color` 하나만 지정하면 "주색 + 같은 색 20% 틴트"가 자동으로 나옵니다.
- 기준 그리드는 256(16px 배수)이고 20px·24px 모두 선명합니다(스크린샷 참고).
- 출처 고정: `phosphor-icons/core` 커밋 `2b75f3ad12b420c9504ef05df8d2564a28f8500e` (package.json 2.1.1), 경로는 `assets/duotone/<name>-duotone.svg`입니다.

## 3. README 표기 문구 (그대로 붙여 넣기)

```
Icons: Phosphor Icons (duotone), Copyright (c) 2023 Phosphor Icons — MIT License, https://github.com/phosphor-icons/core
The SVG paths in public/icons.svg are third-party assets (full licence text: public/icons.LICENSE.txt); only the sprite assembly was done during the contest.
```

MIT는 저작권 고지와 허락 문구(permission notice) **둘 다** 사본에 포함하도록 요구합니다. 따라서 `phosphor-icons/core/LICENSE` 전문(약 1KB)을 `public/icons.LICENSE.txt`로 함께 배포하고, `icons.svg` 첫 줄에 `<!-- Phosphor Icons (MIT) — see /icons.LICENSE.txt -->` 주석을 넣고, README에 위 문구를 둡니다. 저작권자 표기는 LICENSE 원문의 "Phosphor Icons"입니다 [높음]. 제작자 개인 이름은 공식 README에서 확인되지 않아 넣지 않았습니다.

## 4. 아이콘 대응표

현재 UI 전체를 확인한 결과입니다(index.html, render.js, voice.js, app.js, i18n/*.js, export.js; panel.js·demo.js에는 아이콘 글리프가 없습니다).

| 스프라이트 id | Phosphor 이름 | 대체 대상 (현재) | 위치 |
|---|---|---|---|
| `speaker` | `speaker-high` | 🔊 모범 스크립트 듣기 | voice.js:27 `.listen` |
| `stop` | `stop` | ⏹ 재생·녹음 멈춤 | voice.js:27, 238 |
| `mic` | `microphone` | 🎤 음성으로 답하기 | index.html `#mic`, voice.js:238 |
| `record` | `record` | ● 녹음 중 타이머 | voice.js:272 |
| `attach` | `paperclip` | 📎 파일 첨부 | index.html `.attach` (i18n askMail 문장 안의 📎도 해당) |
| `file` | `file-text` | 📄 첨부 파일 칩·말풍선, 저장 완료 | app.js:172, 258, i18n `export.saved` |
| `close` → `x` 권장 | `x-circle` | × 첨부 칩 제거 | index.html `#chipX` |
| `settings` | `gear` | ⚙ 옵션 | index.html `#opts` |
| `check` | `check-circle` | ✓ 단계 충족 / 질문에 답함 | render.js:103, 118, 125 |
| `x` | `x-circle` | ✗ 단계 누락 | render.js:103, 125 |
| `warning` | `warning` | ⚠ 질문에 답하지 않음, 말버릇 경고 | render.js:118, 153 |
| `question` | `question` | ? 판단 불가 | render.js:118 |
| `habits` | `chart-bar` | 📊 오늘의 말버릇 | i18n `habits.title` |
| `play` | `play` | ▶ 1분 둘러보기, 다음 ▶ | i18n `demo.button`, `next` |
| `tip` | `lightbulb` | 💡 역질문 팁 | i18n `reverse.tip` |
| `notes` | `note-pencil` | (신규) 노트 탭 | `#tabNotes` |
| `compare` | `arrows-left-right` | (신규) 처음 답 ↔ 고친 답 비교 | render.js compare 카드 제목 |
| `send` | `paper-plane-right` | (신규) 보내기 | `#send` |
| `panel` | `sidebar-simple` | (신규) 첨삭·노트 패널 열기 | `#panelToggle` |
| `globe` | `globe` | (신규) 설명 언어 | `#lang` 옆 |
| `flag` | `flag` | (신규) 목표 국가 | `#dest` 옆 |
| `download` | `download-simple` | (신규) 끝내기·저장 | `#end` |

- 주의: 맨 `check`·`x` 듀오톤은 **틴트가 사각형 상자**입니다(PoC의 `close` 칸 참고). "파스텔 상자 없음" 요구와 맞지 않으므로 ✓/✗/× 모두 원형(`check-circle`, `x-circle`)을 씁니다.
- 바꾸지 않을 것:
  - 🇯🇵🇰🇷🇺🇸🇬🇧🌏는 `<option>` 텍스트 안에 있어 SVG를 넣을 수 없습니다. `<select>` 앞에 `flag` 아이콘을 두고 옵션 국기는 그대로 두거나 지웁니다.
  - ①②③, ↗↘《》/, →, 【】는 아이콘이 아니라 표기 기호입니다.
  - export.js의 Markdown 출력(✓ ✗ ⚠)은 텍스트 파일이므로 그대로 둡니다.
- i18n 문장 안의 이모지(📎 askMail, 📄 saved, 💡 tip, 📊 habits.title, ▶ demo)는 `textContent`로 들어가므로, 글자만 바꿔서는 SVG가 되지 않습니다. 문자열에서 이모지를 빼고 render.js·app.js에서 `<svg>` 노드를 앞에 붙여야 합니다(작업 범위는 DOM 생성 코드).
- test/ui/flow.test.js:55가 `✗ 復唱` 텍스트로 누락 단계를 찾습니다. ✗를 SVG로 바꾸면 이 테스트를 `.step.miss` + 단계명 기준으로 바꿔야 합니다. 의도(누락 단계 표시)는 그대로이고 표현만 바뀝니다.

## 5. CSS·마크업 방식

권장(A안, 가장 단순한 방법입니다. 실측은 Chrome에서만 했습니다. 같은 출처의 외부 `<use href>`와 `currentColor`는 최신 Safari·Firefox도 지원하는 것으로 알고 있습니다 [중간]. PoC는 구형 Safari에서 차이가 나는 `xlink:href`가 아니라 `href`를 썼습니다):

```html
<button type="button" id="mic" class="ib" data-i18n-label="mic.start"><svg class="i" aria-hidden="true"><use href="/icons.svg#mic"/></svg></button>
```

```css
.i { width: 1em; height: 1em; fill: currentColor; flex: none; vertical-align: -0.15em; }
.ib { display: inline-grid; place-items: center; min-width: 44px; min-height: 44px; border: 0; background: none; color: var(--green-ink); font-size: 24px; }
.ib[aria-pressed="true"] { color: var(--green); }   /* 재생 중: 배경 대신 색과 아이콘(stop)으로 상태 표시 */
.mic.rec { color: #b00020; }                         /* 녹음 중: 빨강 + record/stop 아이콘 */
.ib:focus-visible { outline: 2px solid var(--green-ink); }
```

- 크기는 `font-size`, 색은 `color`로만 조절합니다. 틴트는 같은 색 20%로 자동 생성됩니다.
- **파스텔 상자 제거 대상**: `.script .listen`의 `background: var(--green-soft)`·`[aria-pressed] #cdeedb`, `.mic`의 테두리·`.rec #fff3f3`, `.end[aria-expanded="true"]`의 `--green-soft`. 상자를 없애면 상태가 안 보이게 되므로 위처럼 `color` + 아이콘 교체(speaker↔stop, mic↔stop)로 대신 표시합니다.
- 접근성: 이모지가 사라지면 버튼의 접근 가능한 이름이 없어집니다. `<svg aria-hidden="true">`로 두고 아이콘만 있는 버튼은 반드시 `aria-label`을 둡니다. `#mic`·`.listen`은 voice.js:25, 236에서 이미 설정하고, `#opts`·`.attach`·`#chipX`는 기존 `data-i18n-label` 방식을 그대로 씁니다(i18n 테스트가 키 누락을 잡아 줍니다).
- 상태 전환은 `use.setAttribute("href", "/icons.svg#stop")` 한 줄이면 됩니다(지금의 `textContent = on ? "⏹" : "🔊"` 자리).

틴트 색을 따로 정하고 싶을 때(B·C안, 선택):

| 방식 | 방법 | Chrome 결과 |
|---|---|---|
| B | 스프라이트 틴트 경로에 `fill="var(--duo, currentColor)" opacity="var(--duo-o, 0.2)"` 표현 속성 | 동작함, CSP 위반 0 |
| C | 스프라이트 안 `<style>.duo{fill:var(--duo,currentColor);opacity:var(--duo-o,.2)}</style>` | 동작함, CSP 위반 0 (외부 `<use>` 리소스 문서에는 `style-src`가 적용되지 않음) |

B·C는 Chrome에서만 확인했습니다. Safari·Firefox에서 표현 속성 안의 `var()` 지원은 확인하지 않았습니다 [낮음]. 그래서 A안을 기본으로 권장합니다.

## 6. PoC와 검증 결과

- 위치: `/private/tmp/claude-501/-Users-solution-Documents-BuiltWithClaude-2026/4d9cb204-8e55-4dca-ac92-8bb27e2c416f/scratchpad/icons-poc/`
  - `build.mjs`: 고정 커밋의 SVG 22개로 스프라이트 3종(A/B/C)을 만듭니다. 틴트 레이어가 없으면 실패합니다.
  - `server.mjs`: vercel.json과 같은 CSP·nosniff 헤더를 붙이고, `.svg`는 `image/svg+xml`로 보냅니다.
  - `shot.mjs`: Playwright(Chrome headless)로 검사하고 스크린샷을 찍습니다.
- 스크린샷: `/private/tmp/claude-501/-Users-solution-Documents-BuiltWithClaude-2026/4d9cb204-8e55-4dca-ac92-8bb27e2c416f/scratchpad/icons-poc/poc.png` (20/24px × primary #047a35 / neutral #222 × A/B/C, 그리고 배경 상자 없는 버튼 모형)
- 측정 결과 [높음]:
  - 모든 응답에 CSP 헤더가 붙었고, `icons*.svg`는 200 `image/svg+xml`로 응답했습니다.
  - `securitypolicyviolation` 0건, `<use>` 275개 모두 bbox > 0이었습니다.
  - 96px stop 아이콘 중앙 픽셀 측정값:
    - A = rgb(205,228,215): #047a35 20%를 흰 바탕에 합성한 계산값과 일치합니다.
    - B = C = rgb(168,235,195): #06c755 35%와 일치합니다. 즉 `var()`가 실제로 적용되었습니다.
  - 콘솔 오류는 PoC에 favicon이 없어서 생긴 404 1건뿐입니다.
- **적용 시 필수 수정**: 레포 `dev.js:40`의 `TYPES`에 `.svg`가 없어서 로컬 서버가 `application/octet-stream`으로 응답합니다. 이 상태에서는 nosniff 때문에 `<use>`가 경고 없이 비어 보일 수 있으므로 `".svg": "image/svg+xml"` 한 줄을 추가해야 합니다. 이 영향은 실측하지 않았고 추론입니다 [중간]. Vercel 정적 서빙은 확장자로 MIME을 정하므로 배포 환경에서는 문제가 없을 것으로 봅니다 [중간].
