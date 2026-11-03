# CONSISTENCY-PLAN — 모범답안 일관성 강제 설계 (코드 변경안·오프라인 테스트·실호출 평가 스펙)

작성 2026-11-03. 요청: 「모범답안 코칭 근거 데이터를 더 쌓을 것. 일관성 있는 대답이 무엇보다 우선.」
입력: `EVIDENCE-V3.md`(§5 강제 방식 초안), `jp-draft-v3.json`(answer_templates·consistency 초안), `lib/script.js`·`lib/review.js`·`lib/questions.js`·`lib/claude.js`.
이 문서는 설계만 담습니다. 레포 코드와 `packs/`는 고치지 않았고, 실호출은 0회입니다. 코드 조각은 제안이며 줄 수는 대략적인 추정입니다.

> **구현 상태 (11/03 10시)**: PR-1 = C1(단계 예문 주입, 팩 「3つ」→「三つ」)·C2(truncated 1회 재시도)·C6(review 소문자 정규화·답변 순 정렬) 구현, 오프라인 테스트 T1·T2·T3·T15 통과. C4는 질문 유형별 맺음(PRD §16-15)으로 먼저 들어갔습니다(`lib/pack.js` `closingOf`, 템플릿 전체 병합은 아님). C3·C5와 재측정은 남았습니다. 기준선(`consistency-baseline-2026-11-03.json`)은 맺음 규칙 변경 전 측정이라, 재측정과 직접 비교할 수 없습니다.

## 0. 결론 — 줄당 일관성 이득 순위

| 순위 | id | 무엇을 | 어디 | 코드 줄 수(추정) | 기대 이득 | 신뢰도 |
|---|---|---|---|---|---|---|
| 1 | C1 단계 예문 주입 | script 프롬프트의 4文型 각 줄에 `例: 「…」`를 붙입니다. 지금은 질문 생성 프롬프트에만 예문이 있습니다. | `lib/script.js` 1줄 | 1 | 復唱 형태(「〜、ですね。」) 준수 0/3을 끌어올림 | [High] 원인(코드) / [Medium] 효과(미측정) |
| 2 | C2 truncated 재시도 | `askJson`의 `truncated` 오류를 2회 예산 안의 실패 회차로 처리합니다. | `lib/script.js` | 3 | 같은 입력이 가끔 502로 끝나는 현상 제거 | [High] |
| 3 | C4 질문 유형 라우팅 + 유형별 예문 1개 | 코드가 질문 문장으로 템플릿을 정합니다(팩의 `match` 정규식, 없으면 判断・状況). 그 템플릿의 골격·예문·NG만 user 메시지에 넣습니다. | `lib/script.js` + 팩 데이터 | 10 | 같은 질문에는 언제나 같은 맺음 형태와 같은 예문. 템플릿 선택의 흔들림 0 | [Medium] |
| 4 | C3 단계별 필드 스키마 | 모범답안 문자열 1개를 `ja: { fukusho, ketsuron, kijun, sentakushi }` 객체로 바꾸고, 코드가 팩 순서대로 잇습니다. | `lib/script.js` + fixture | 8 (+fixture) | 단계 누락·순서 뒤바뀜이 스키마상 불가능해짐. 단계별 게이트가 가능해짐 | [Medium] |
| 5 | C5 결정적 소프트 게이트 + 2회 중 나은 쪽 | 문말 닫힌 어휘, 復唱 형태, 템플릿별 맺음, 단계별 문장 수, 빈칸 라벨·개수, 길이(초)를 검사합니다. 위반하면 1회 다시 만들고, 둘 다 위반하면 위반이 적은 쪽을 `issues`와 함께 반환합니다(실패로 처리하지 않음). | `lib/script.js` | 25 | 길이 변동계수, 문장 수 흔들림, 문말 이탈 감소 | [Medium] / 임계 수치 [Low] |
| 6 | C6 review enum 정규화·정렬 | `rule_id`·`answers_question`을 소문자로 맞추고, corrections를 답변 속 위치 순으로 정렬합니다. | `lib/review.js` | 2 | 표시 순서가 매번 같아짐. 대소문자 흔들림에 따른 탈락 방지 | [High] 근거 / 발생 빈도 미확인 |
| 7 | C7 effort `low` | script 요청의 effort를 `medium`에서 `low`로 바꾸는 A/B 실험입니다. | `lib/script.js` 1토큰 | 0 (평가 전에는 변경 없음) | 문서상 「결정성이 목적이면 low + 더 촘촘한 프롬프트」 | [Medium] |

하지 않는 것(이유는 §1.1): temperature·top_p·top_k(400), assistant prefill(400), 스키마 `minLength`·`maxLength`·`maxItems`(400), `points` 정확히 3개(UI 일관성에만 영향, 이번 범위 밖), `session_axis`(세션 저장소가 필요), `model_answer_exclusions` 프롬프트 줄(일관성이 아니라 공정 채용 사안이므로 별도 PR), prompt caching(비용 항목, 일관성과 무관).

권장 묶음: **PR-1 = C1 + C2 + C6**(팩 변경 없음, 6줄). **PR-2 = C3 + C4 + C5**(팩에 `answer_templates`·`consistency` 병합 승인 필요). C7은 PR-2의 평가 B′ 레그로만 돌립니다.

## 1. 확인한 사실

### 1.1 API 제약 (Anthropic 문서, claude-api 스킬 캐시 2026-10-06 + structured-outputs 문서 직접 확인 2026-11-03)

| 항목 | Sonnet 5.5 (script·questions) | Opus 5.5 (review) | 신뢰도 |
|---|---|---|---|
| temperature / top_p / top_k | 기본값이 아닌 값은 400. API 버전 `2026-10-21`부터는 모든 모델에서 400 | 제거됨, 400 | [High] |
| assistant prefill | 400 | 400 | [High] |
| effort 단계 | low / medium / high / xhigh / max. **기본 high**(Sonnet 5 대비 재보정) | 같은 5단계. **기본 medium** | [High] |
| 현재 코드 | script·questions 모두 `effort: "medium"` 명시 | review `medium` 명시(=기본) | [High] 코드 |
| 결정성 권고 | 마이그레이션 가이드: 「목적이 결정성이면 `effort: "low"`와 더 촘촘한 프롬프트」. Sonnet 5.5 시작점 권고도 「콘텐츠 생성은 low」 | — | [Medium] (Opus 4.7 절의 일반 권고를 적용) |
| JSON Schema | `enum`·`const`·`required`·`additionalProperties:false` 지원. `minItems`는 0·1만. `minLength`·`maxLength`·그 밖의 배열 제약은 **400**. 단순 `pattern`은 동작하지만 lookaround·역참조·`\b`는 400 위험 | 같음 | [High] |
| enum 대소문자 | 「문자열 enum은 대소문자 유지가 보장되지 않는다」(Invalid outputs 절) | 같음 | [High] |

정리하면, 이 모델들에서 샘플링 파라미터로 일관성을 얻는 방법은 없습니다. 쓸 수 있는 손잡이는 **스키마(구조)**, **프롬프트(예문)**, **코드 게이트(판정)**, **effort** 네 가지입니다. 길이·개수·문말은 스키마로 강제할 수 없으므로 전부 코드에서 검사합니다. 지금 코드는 `client.beta.messages.stream`에 스키마를 그대로 보내므로, SDK가 지원하지 않는 키를 자동으로 걷어내 주지 않습니다. 지원하지 않는 키를 하나라도 넣으면 곧바로 400이 납니다 [High].

### 1.2 코드에서 확인한 사실

- `buildScriptRequest`의 단계 줄은 `${label}（${label_native}）: ${rule}`뿐이고 `example`이 없습니다. `questions.js`의 시스템 프롬프트에는 `例: 「…」`가 있습니다. 녹화 출력 3건 중 팩 예문의 復唱 형태(「〜、ですね。」)를 따른 것이 0건이었던 직접 원인 후보입니다 [High 코드 / Medium 인과].
- `generateScript`의 루프는 `askJson`이 던지는 `truncated`·`refusal`을 잡지 않습니다. 첫 호출이 `max_tokens`(4000, 적응형 사고 토큰 포함)에 걸리면 재시도 없이 502가 납니다 [High].
- 팩 예문 「止める・縮小する・続けるの**3**つで判断します。」에는 숫자 3이 있습니다. 예문을 주입한 뒤 모델이 「3つ」를 따라 쓰면 `groundedNumbers`가 막아서 재시도가 늘어납니다. C1과 함께 팩 문구를 「三つ」로 바꿔야 합니다(팩 수정이므로 사람 승인 필요) [Medium].
- `public/app.js`는 `/api/script`에 `question`·`answer`·`context`·`lang`·`pack`만 보내고 `category`는 보내지 않습니다. 그래서 C4는 질문 문장만으로 라우팅하도록 설계했습니다. API와 UI는 바꾸지 않습니다.
- 질문 생성 taxonomy에 `逆質問` 카테고리가 있으므로, 역질문 유형의 질문도 사용자가 답하면 `/api/script`로 들어옵니다. 그래서 逆質問 템플릿도 script 범위에 포함됩니다.
- `packs/kr.json`에는 `answer_templates`와 `consistency`가 없습니다. 모든 변경은 이 키가 없으면 지금과 똑같이 동작해야 합니다(no-op).
- 실행 시간: `api/script.js`의 maxDuration은 120초이고, Anthropic 클라이언트는 timeout 50초에 maxRetries 1입니다. 2회 호출(약 15~25초×2)은 한도 안에 들어갑니다 [Medium, 호출당 시간은 로그 기준 추정].

### 1.3 EVIDENCE-V3 길이 밴드의 계산 오류 (이번에 발견)

EVIDENCE-V3 §3.3은 「NFKC 정규화, 공백 제외, ［］는 내용째 1자로 셈」이라는 규칙으로 예문 9개가 202~237자라고 적었습니다. 그런데 NFKC는 `［］`를 `[]`로 바꿉니다. 그 뒤에 `［…］` 정규식을 적용하면 빈칸이 하나도 접히지 않습니다. 실제로는 빈칸을 **전체 길이로** 센 값입니다. 적힌 규칙대로(빈칸=1자) 다시 세면 다음과 같습니다(스크래치 스크립트, 레포 밖).

| 템플릿 | 빈칸 전체 길이 | 빈칸=1자 | estimateSeconds | 단계별 문장 수 (復/結/基/締) |
|---|---|---|---|---|
| 判断・状況 | 213 | 207 | 36.9 | 1/1/4/1 |
| 自己紹介 | 205 | **187** | 37.1 | 1/1/3/2 |
| 転職理由 | 222 | 216 | 41.8 | 1/1/3/1 |
| 志望動機 | 212 | 206 | 41.0 | 1/1/4/1 |
| 強み | 202 | **196** | 36.6 | 1/1/4/1 |
| 弱み | 202 | **196** | 35.1 | 1/1/4/1 |
| 成功体験 | 237 | 225 | 39.9 | 1/1/4/1 |
| 失敗体験 | 208 | 202 | 39.3 | 1/1/4/1 |
| マネジメント | 203 | **197** | 35.1 | 1/1/4/1 |
| 逆質問 | 95 | 89 | 15.4 | 0/1/1/1 |

- 적힌 규칙대로 세면 **4/9 예문이 200자 하한을 밑돕니다**. 이 밴드를 게이트로 쓰면, 우리가 보여 주는 예문을 그대로 따라 쓴 출력도 재시도 대상이 됩니다 [High].
- 녹화 실출력도 ja·en 2건이 31.5초·29.3초로 35초 하한 아래입니다. 하한을 35초로 두면 기준선 출력 3건 중 2건이 하나뿐인 재시도를 써 버립니다.
- **결정**: 길이 게이트는 글자 수가 아니라 `estimateSeconds` 하나로 둡니다. UI가 보여 주는 「약 N초」와 같은 함수이므로 사용자 눈에도 일관됩니다. 초기 밴드는 **30~60초 [Low]**로 해서 중앙값이 아니라 이상치만 잡게 합니다. N=5 평가에서 관측된 분포로 하한을 다시 정합니다. 글자 수는 보고용 지표로만 쓰고, 정의는 「공백 제외, 빈칸은 전체 길이」(EVIDENCE-V3 표의 숫자와 같은 방식)로 고칩니다. EVIDENCE-V3 §3.3과 `jp-draft-v3.json` `consistency.length.count`의 문구는 병합할 때 함께 고쳐야 합니다.
- 문장 수: 예문 실측은 基準 3~4, 締め 1~2, 합계 6~7입니다. 초안 범위(基準 1~4, 締め 1~2, 합계 4~7)와 모순은 없습니다. 다만 하한이 느슨해서 실제로는 상한만 작동합니다 [Low].

## 2. 변경안 상세

### C1. script 프롬프트에 단계 예문 주입 (1줄)

```js
// lib/script.js buildScriptRequest
const steps = s.steps.map((st, i) => `${i + 1}. ${st.label}（${st.label_native}）: ${st.rule} 例: 「${st.example}」`).join("\n");
```
- 같이 해야 할 데이터 수정(승인 필요): `packs/jp.json` ketsuron 예문의 「3つ」를 「三つ」로 바꿉니다. kr 팩 예문에 숫자가 있는지도 같은 기준으로 확인합니다.
- 영향: `test/snapshots/jp-*.json`이 바뀝니다. 재생성하고, 커밋 메시지에 「script 프롬프트에 예문 추가」라고 이유를 남깁니다.

### C2. truncated 재시도 (3줄)

```js
let res;
try { res = await askJson(client, buildScriptRequest(pack, input)); }
catch (e) { if (e.message !== "truncated") throw e; why = "truncated"; continue; }
const { [target]: text, ...rest } = res;
```
- `refusal`은 재시도하지 않습니다. server-side fallback이 이미 처리하고, 같은 요청을 다시 보내도 결과가 같을 가능성이 큽니다.
- `test/fake-claude.js`의 `stop`이 모든 호출에 한 값만 적용되므로, 호출별 `stops: ["max_tokens", "end_turn"]` 옵션을 1줄 추가해야 합니다.

### C4. 질문 유형 라우팅 (코드가 결정, 약 10줄 + 팩 데이터)

모델이 enum으로 템플릿을 고르게 하는 안(EVIDENCE-V3 §5 3번)과 비교했습니다. 모델이 고르면 같은 질문에서도 회차마다 선택이 달라질 수 있습니다(M8 흔들림). 코드가 질문 문장으로 고르면 같은 질문에는 항상 같은 템플릿이 붙고, 오프라인 테스트로 고정할 수 있습니다. 그래서 코드 라우팅을 기본으로 삼고, 모델 enum 선택은 대안으로 남깁니다.

팩 데이터(제안, `answer_templates[*].match`). 평가 순서는 팩의 키 순서입니다. 그래서 병합할 때 팩 키를 아래 표 순서로 **재배열**해야 합니다. 지금 초안 순서(強み→弱み, 成功→失敗)대로면 「強みと弱み」는 強み로, 「失敗して苦労した」는 `苦労` 때문에 成功体験으로 갑니다. 기본값은 첫 키가 아니라 **`match`가 없는 템플릿**(判断・状況)입니다. 그러면 키 순서를 바꿔도 기본값이 바뀌지 않습니다.
```
逆質問     質問はありますか|お聞きしたいこと|逆質問
自己紹介   自己紹介|これまでの経歴を簡単に
転職理由   転職(を考えた|の)?理由|退職(の)?理由|辞め
志望動機   志望|(当社|弊社)を選|なぜ(当社|弊社)|日本で働
弱み       弱み|短所|苦手
強み       強み|長所|得意
失敗体験   失敗|うまくいかなかった
成功体験   成果|成功|実績|大変だった|苦労|困難
マネジメント マネジメント|部下|育成|チームをまとめ|リーダー
判断・状況 （既定。match なし）
```
```js
// lib/script.js
export const pickTemplate = (pack, question) => {
  const ts = Object.entries(pack.answer_templates ?? {});
  return (ts.find(([, t]) => t.match && new RegExp(t.match).test(question)) ?? ts.find(([, t]) => !t.match))?.[0];
};
// buildScriptRequest: 템플릿은 user 메시지에 넣습니다(시스템 프롬프트는 바이트 단위로 고정해 캐시가 가능하도록).
const tk = pickTemplate(pack, question), t = pack.answer_templates?.[tk];
const keys = s.steps.map((st) => st.key);
const tpl = t ? `\n\n<template name="${tk}">\n${keys.map((k) => `- ${k}: ${t.steps[k]}｜例: ${t.example[k] || "（なし）"}`).join("\n")}${t.ng?.length ? `\nNG: ${t.ng.join(" / ")}` : ""}\n</template>` : "";
```
- 출력에 `template: tk`를 붙여 반환합니다(평가와 디버그용, UI는 무시).
- 미해결 [Low]: daily_questions[5] 「強みと弱み」는 두 템플릿에 모두 걸립니다. 위 순서에서는 弱み가 먼저 걸리는데, 강점을 함께 말하는 맺음이 필요한지는 사람이 결정해야 합니다. [7] 입사 후 반년과 [8] 5년 후는 기본값(判断・状況, options 맺음)으로 갑니다. 이 둘에 options 맺음이 자연스러운지도 확인이 필요합니다.
- 예문 주입은 질문당 1개입니다. EVIDENCE-V3의 「3~5개를 시스템 프롬프트에 고정」 안보다 토큰이 적고(약 200자), 해당 유형과 무관한 예문을 모델이 흉내 낼 위험도 없습니다.

### C3. 단계별 필드 스키마 (약 8줄 + fixture)

```js
// scriptSchema: 대상 언어 키(ja/ko)는 유지합니다. 11/03 실측에서 중립 키 "text"를 쓰자 설명 필드의 언어가 이탈했습니다(3/3).
const stepObj = { type: "object", additionalProperties: false, required: keys,
  properties: Object.fromEntries(steps.map((st) => [st.key, { type: "string", description: `${st.label}: ${st.rule}` }])) };
const properties = { [key]: stepObj, ...(same ? {} : { reading: …, translation: … }), points: … };
// generateScript
const parts = res[target];
const text = keys.map((k) => (parts[k] ?? "").trim()).filter(Boolean).join(target === "ja" ? "" : " ");
```
- `reading`과 `translation`은 지금처럼 전체 문장 1개로 둡니다. description만 「4項目をつないだ文の発音」으로 바꿉니다. reading과 text가 맞는지는 지금도 검사하지 않으며, 이번 변경으로 위험이 더 커지지는 않습니다 [Medium].
- 逆質問의 fukusho는 빈 문자열을 허용합니다(스키마는 string만 요구).
- 반환 형태: `text`(이어 붙인 문장)는 그대로 두고 `parts`를 추가합니다. UI·export·readcheck는 `text`만 읽으므로 영향이 없습니다.
- 바꿔야 할 곳: `test/fake-claude.js` `asModelScript`(text를 parts로 나누는 처리), `test/fixtures/script.json`, `test/generate.test.js`, `test/snapshot.test.js` + snapshots, `dev.js`의 MOCK 경로(같은 fixture 사용).
- 위험 [Medium, 미측정]: 필드를 나누면 문장 사이 연결(「その結果、」 등)이 어색해질 수 있습니다. 평가의 M5(본문 유사도)와 사람의 낭독 확인으로 판단합니다.

### C5. 결정적 소프트 게이트 (약 25줄)

`consistency`의 규칙을 프롬프트 출력 지시에 4줄로 넣고(復唱 형태, 단계별 문장 수, 문말 です・ます, 빈칸 라벨 목록과 최대 개수, 「全体で30〜60秒」), 같은 규칙을 코드로 판정합니다.

```js
import { estimateSeconds } from "../public/tts-timing.js"; // lib에서 public을 import하는 첫 사례: Vercel 프리뷰에서 번들 포함 여부를 확인할 것
const split = (s) => s.split(/(?<=[。？])/).map((x) => x.trim()).filter(Boolean);
const range = (v) => (Array.isArray(v) ? v : [v, v]);
export function scriptIssues(pack, tk, parts) {
  const C = pack.consistency, t = pack.answer_templates?.[tk];
  if (!C || !t) return [];                                   // kr 팩 등: no-op
  const keys = pack.answer_structure.steps.map((s) => s.key);
  const noFukusho = C.fukusho_form.except?.[tk] === "（なし）";
  const all = keys.map((k) => parts[k] ?? "").join(""), out = [];
  for (const k of keys) { if (k === "fukusho" && noFukusho) continue;
    const n = split(parts[k] ?? "").length, [lo, hi] = range(C.sentences[k]); if (n < lo || n > hi) out.push(`sentences:${k}`); }
  if (!split(all).every((x) => new RegExp(C.ending_regex).test(x))) out.push("ending");
  if (!noFukusho && !new RegExp(C.fukusho_form.must ?? "、ですね。$|と申します。$").test(parts.fukusho ?? "")) out.push("fukusho");
  if (C.closing_forms[t.closing]?.must && !new RegExp(C.closing_forms[t.closing].must).test(parts.sentakushi ?? "")) out.push(`closing:${t.closing}`);
  const b = all.match(/［[^］]*］/g) ?? [];
  if (b.length > C.max_blanks || !b.every((x) => C.blank_labels.includes(x))) out.push("blank");
  const sec = estimateSeconds(all), [smin, smax] = C.length.gate_seconds;
  if (C.length.applies_to_except !== tk && (sec < smin || sec > smax)) out.push("length");
  return out;
}
```
- 팩 데이터 추가(제안): `closing_forms.*.must`(정규식 문자열). options는 `どちらから.*ましょうか。$`, contribution은 `(御社|入社後).*ます。$`, improvement는 `御社.*ます。$`입니다. 초안 예문 10개에 대조한 결과 10/10 통과했습니다. 초안 문구대로 「御社」만 요구하면 志望動機 예문(「入社後は、…再現します。」)이 걸려서 9/10이 됩니다. question은 「疑問文が一つだけ」를 `^[^？?]*[？?]?[^？?]*$`와 `(か。|？)$`를 함께 만족하는 식으로 둡니다. 정규식을 팩에 두면 kr 팩도 코드 변경 없이 자기 규칙을 쓸 수 있습니다. `gate_seconds`는 [30, 60] [Low]로 정합니다.
- 재시도 정책(기존 질문 생성의 specificity 게이트와 같은 방식): 언어와 숫자 근거는 **하드 게이트**로, 지금처럼 2회 실패하면 오류입니다. 일관성 게이트는 **소프트 게이트**입니다. 첫 호출이 하드 게이트만 통과하고 issues가 있으면 1회 더 만듭니다. 두 번째가 하드 게이트에서 실패하거나 issues가 더 많으면 첫 번째를 반환합니다. 소프트 위반 때문에 사용자가 502를 보지 않게 하기 위해서입니다.
```js
// generateScript 루프 안, 하드 게이트 통과 직후
const issues = scriptIssues(pack, tk, parts);
if (!best || issues.length < best.issues.length) best = { out: { ...out, template: tk, issues }, issues };
if (!issues.length) return best.out;
continue;
// 루프 뒤
if (best) return best.out;
```
- 번역만 다시 받는 경로(첫 호출에서 번역만 실패한 경우)는 그대로 둡니다. 이 경로에서는 일관성 재시도를 하지 않고 첫 결과의 issues를 그대로 반환합니다(2회 예산 유지).
- 비용과 지연: 첫 통과율이 80%면 호출 수가 평균 1.2회, script 원가가 약 $0.037에서 $0.044가 되고, 일부 요청은 15~25초 늘어납니다 [Low, 첫 통과율 미측정].

### C6. review 정규화와 정렬 (2줄)

```js
const ids = new Set(pack.correction_rules.map((r) => r.id));
const corrections = out.corrections.map((c) => ({ ...c, rule_id: c.rule_id.toLowerCase() })).filter((c) => ids.has(c.rule_id) && …기존 조건…)
  .sort((a, b) => answer.indexOf(a.before.normalize("NFKC")) - answer.indexOf(b.before.normalize("NFKC")));
// answers_question도 toLowerCase()
```
- 문서가 enum 대소문자 유지를 보장하지 않는다고 명시하므로 근거는 [High]입니다. 실제로 일어난 적은 없습니다(로그 미확인). 정렬은 Jaccard 값에는 영향이 없고 화면 표시 순서만 고정합니다.

### C7. effort `low` (평가 레그로만)

- 근거: §1.1의 「결정성이 목적이면 low + 촘촘한 프롬프트」, Sonnet 5.5 시작점 「콘텐츠 생성은 low」 [Medium]. low에서는 사고를 거의 건너뛰므로 `max_tokens` truncation 위험과 지연도 줄어듭니다.
- 반대 근거: 사고가 줄면 숫자 근거나 언어 규칙 위반이 늘 수 있습니다. 그래서 평가 B′ = B + `effort: "low"`로 돌리고, 하드 게이트 첫 통과율이 B보다 나빠지지 않을 때만 채택합니다.

## 3. 오프라인 테스트 (node:test, 토큰 0, `npm test`에 포함)

| # | 이름 | 준비 | 단언 |
|---|---|---|---|
| T1 | 예문 주입(C1) | `buildScriptRequest(pack, {question:"Q", answer:"A"})` | 각 `pack.answer_structure.steps[i].example`에 대해 `system.includes(\`例: 「${example}」\`)` |
| T2 | 팩 예문에 숫자 없음 | jp/kr 팩 | `steps.every(st => !/[0-9０-９]/.test(st.example))` (C1과 함께 쓰는 「三つ」 수정을 고정) |
| T3 | truncated 재시도(C2) | `fakeClient({ responses:[x, good], stops:["max_tokens","end_turn"] })` | 결과가 good이고 `calls()===2`. 두 번 다 max_tokens면 `/truncated/`로 reject |
| T4 | 400 위험 키 금지 | jp·kr × ko·en·ja의 script·review·questions 요청 | `!/"(minLength|maxLength|maxItems|minimum|maximum)"/.test(JSON.stringify(req.output_config))`. `minItems`가 있다면 0 또는 1 |
| T5 | 샘플링·프리필 금지 | 모든 build* 요청 | `!("temperature" in req || "top_p" in req || "top_k" in req)`, `req.messages.at(-1).role === "user"` |
| T6 | 단계 필드 스키마(C3) | `scriptSchema(...)` | `properties.ja.required` deepEqual 팩 step key 순서, `additionalProperties===false` |
| T7 | 순서대로 잇기(C3) | 모델 응답의 parts 키 순서를 뒤섞음 | `out.text === fukusho+ketsuron+kijun+sentakushi`(팩 순서), kr은 공백으로 이음 |
| T8 | 라우팅(C4) | 초안 팩 | 각 템플릿의 `daily_questions` 인덱스 질문이 그 템플릿으로 감([5]는 弱み 또는 強み 중 하나). 「最後に、何か質問はありますか。」는 逆質問, 「見積もりがずれたらどうしますか。」는 判断・状況, 아무 데도 안 걸리는 문장은 `match` 없는 템플릿(判断・状況). 「失敗して苦労した経験」은 失敗体験 |
| T9 | 라우팅 결정성 | 같은 질문 100회 | `pickTemplate` 결과가 모두 같음(정규식 `g` 플래그로 상태가 남는 버그 방지) |
| T10 | 예문 자기 일관성(C5) | 초안 팩의 모든 템플릿 | `scriptIssues(pack, k, t.example)`가 `[]`. §1.3 같은 밴드·예문 모순을 CI에서 잡습니다 |
| T11 | 게이트 음성 사례(C5) | 判断・状況 예문에서 한 곳씩 깨뜨림 | 復唱 「〜についてお答えします。」→`fukusho` / 끝 문장 「〜しました。」을 보통체 「〜した。」로→`ending` / 빈칸 4개→`blank` / 라벨 「［期限］」→`blank` / 基準 6문장→`sentences:kijun` / contribution 맺음에서 「御社」 삭제→`closing:contribution` / 같은 문장을 반복해 70초 이상→`length` |
| T12 | 소프트 재시도(C5) | `responses:[issueful, clean]` | clean 반환, `calls()===2`. `[issueful, worse]`이면 issueful과 그 `issues`를 반환하고 throw하지 않음. `[issueful, 하드 실패]`이면 issueful 반환 |
| T13 | 하드 게이트 유지 | 숫자 근거 위반 2회 | 지금처럼 `/number check/`로 reject |
| T14 | kr no-op | `packs/kr.json` | `scriptIssues`는 `[]`, 프롬프트에 `<template` 없음, 기존 kr 테스트 통과 |
| T15 | review 정규화(C6) | `rule_id:"DEL-NANKA"`, 역순 corrections | `rule_id==="del-nanka"`, before의 답변 속 위치 오름차순 |
| T16 | 스냅샷 | `test/snapshots/jp-*.json` 재생성 | 바뀐 줄이 C1·C4·C5의 의도된 문구뿐인지 diff로 확인. 이유를 커밋 메시지에 남김 |

`test/fixtures/script.json`은 지금 「はい、」로 시작하고 라벨 「［期限］」을 써서 C5 게이트를 통과하지 못합니다. C3·C5와 함께 판단・状況 예문 형태로 고쳐야 하며, MOCK 데모 화면도 그에 따라 바뀝니다.

## 4. 실호출 일관성 평가 스펙: `scripts/eval.mjs --only consistency`

- 입력 파일 `test/eval/consistency.json`(가상 데이터 3건, PII 검사 대상):
  - I1 判断・状況: 「見積もりが大きくずれたとき、どう判断しますか。」 / 일본어 답, 숫자 없음 / `expect_template:"判断・状況"`
  - I2 志望動機: 「当社を志望した理由を教えてください。」 / 한국어 답, 숫자 1개(예: 3년) 포함 / `"志望動機"`
  - I3 失敗体験: 「これまでの失敗経験と、そこから学んだことを教えてください。」 / 일본어 답, 질문에서 반쯤 벗어난 답 / `"失敗体験"`
  - 설명 언어는 모두 `ko`입니다. 언어 교란을 줄이려고 고정합니다.
- 실행(입력마다 5회, pool 동시성 3):
  1. `generateScript` ×5 → 출력 15개
  2. 각 script 출력의 `text`를 `generateReview(question, text)`로 1회씩 채점 → 15개(생성 모델과 다른 모델로 구조 판정)
  3. 사용자 답 원문을 `generateReview` ×5 → 15개(채점 자체의 일관성)
- 서빙 모델 기록: lib를 고치지 않고 eval 안에서 클라이언트를 감쌉니다. `const tap = { beta: { messages: { stream: (r) => { const s = client.beta.messages.stream(r); return { finalMessage: async () => { const m = await s.finalMessage(); log.push({ want: r.model, got: m.model, stop: m.stop_reason }); return m; } }; } } } };` fallback으로 다른 모델이 답한 회차는 지표에서 빼고 `fallback_runs`로 따로 셉니다.
- A·B 실행: 평가 코드는 `out.parts`·`out.issues`·`out.template`가 있으면 쓰고, 없으면 `text`를 `split`해서 근사합니다. 그래서 A(현재 커밋)와 B(PR-2 브랜치)에서 같은 파일로 돌릴 수 있습니다. git worktree 2개에서 각각 `ENV_FILE=… node scripts/eval.mjs --only consistency > out-{A,B}.json`을 실행합니다.

| 지표 | 정의 | 통과 임계 [Low] | A 근사 기준선 |
|---|---|---|---|
| K1 단계 순서·존재 합의 | (2)의 review `steps` 4개 present 벡터가 입력별 최빈 벡터와 같고, 그 최빈 벡터가 전부 true인 회차 수 | 입력별 5/5 | 미측정 |
| K2 길이 변동계수 | 입력별 `estimateSeconds(text)`의 표준편차/평균, 그리고 밴드 [30, 60] 안에 든 비율 | CV ≤ 0.10, 밴드 15/15 | 녹화 3건 29~41초(±18%) |
| K3 rule-id Jaccard | (3)에서 입력별 5회 corrections `rule_id` 집합의 쌍별 Jaccard 평균(둘 다 비면 1) | ≥ 0.8 | 미측정 |
| K3b 채점 판정 합의 | (3)의 `answers_question`과 `steps` present 벡터가 최빈값과 같은 회차 | 5/5 | 미측정 |
| K4 빈칸 사용 | 입력별 빈칸 라벨 집합의 쌍별 Jaccard, 닫힌 집합 밖 라벨 수, 개수 ≤ 3 위반 수, `groundedNumbers` 위반 수 | ≥ 0.6 / 0 / 0 / 0 | 녹화 출력에 「［期限］」(닫힌 집합 밖) |
| K5 템플릿 합의 | `out.template === expect_template` | 15/15 | 해당 없음(신규) |
| K6 문장 수 합의 | 단계별 문장 수가 입력별 최빈값과 같은 회차(B는 parts, A는 첫 문장=復唱, 마지막=締め, 나머지는 근사) | ≥ 4/5 | 4~7문장으로 흔들림 |
| K7 문말 | `ending_regex` 위반 문장 수 | 0 | 0/16 |
| K8 復唱 형태 | 復唱이 「、ですね。」 형태인 회차(逆質問 제외) | ≥ 14/15 | 0/3 |
| K9 게이트 통과율 | 첫 호출에서 하드+소프트 모두 통과 / 최종 issues 0 | ≥ 12/15 / ≥ 14/15 | — |
| K10 본문 유사도(보고만) | 단계 필드별 쌍별 정규화 Levenshtein(NFKC 후 빈칸→□) | 보고만(기준선 +0.15를 목표로 참고) | 0.26~0.44 |

- 채택 규칙: B는 K3 계열을 제외한 모든 지표에서 A보다 나쁘지 않고, K1·K2·K6·K8 중 둘 이상이 좋아질 때 채택합니다. B′(effort low)는 B 대비 같은 규칙에 더해 K9 첫 통과율이 B 이상일 때만 채택합니다. 임계값은 첫 A 실행 뒤 다시 정하고, 그때 길이 밴드 하한도 정합니다.
- 비용(PRD 실측 단가 Sonnet script 약 $0.037, Opus review 약 $0.031): 한 레그에 script 15×1.2 + review 30 ≈ $0.67 + $0.93 ≈ **$1.6**입니다. A/B/B′ 전체는 약 $4.8, 시간은 레그당 약 5~8분입니다 [Medium].
- 출력은 지표 JSON뿐입니다. 답변과 모범답안 본문은 콘솔에 남기지 않습니다(기존 eval 관례). `test/live.test.js`처럼 루틴 점검에서는 돌리지 않고, 프롬프트·팩·모델을 바꾼 뒤 사람이 손으로 1회 실행합니다.

## 5. 사람 승인이 필요한 항목

1. 팩 예문 「3つ」를 「三つ」로 수정(C1 동반, `packs/jp.json`).
2. `answer_templates`·`consistency` 병합. 새 필드 `match`, `closing_forms.*.must`, `fukusho_form.must`, `length.gate_seconds`([30, 60]), `length.applies_to_except`("逆質問")를 추가합니다. `answer_templates` 키를 C4 표 순서로 재배열하고, 병합할 때 `consistency.status`(「draft…」)는 삭제합니다(C4·C5). 4文型 4단째 「選択肢で返す」를 질문 유형별 맺음(contribution·improvement·question)이 덮어쓰게 되는 문제(EVIDENCE-V3 §3.1)도 같이 결정해야 합니다.
3. 빈칸 표기 통일: `lib/lang.js` `TL.blank`(「［ここに実績の数字］」)와 팩 예문(「［いつ・何を］」「［就労できる範囲］」)이 `blank_labels` 닫힌 집합 밖에 있습니다. 통일하지 않으면 C5의 `blank` 게이트가 우리 자신의 지시 때문에 걸립니다.
4. EVIDENCE-V3 §3.3과 `consistency.length.count` 문구 정정(§1.3).
5. 「強みと弱み」 질문의 라우팅, [7]·[8] 질문의 기본 맺음(C4 미해결 항목).
6. del-chotto·rep-omoimasu 범위 수정(EVIDENCE-V3 §2.2). 채점 일관성(K3)에 직접 영향을 주므로 PR-2 평가 전에 결정하는 것이 좋습니다.

## 6. 한계와 미확인

- 모든 효과 추정은 실호출 없이 세운 것입니다. 기준선은 녹화 n=3뿐이고, 질문 문구와 설명 언어가 달라 교란이 있습니다.
- Anthropic 제약은 claude-api 스킬 캐시(2026-10-06)와 structured-outputs 문서(2026-11-03 조회, 앞 100k자만 읽음)를 기준으로 했습니다. `maxItems`가 400이 된다는 것은 「minItems 0·1 외의 배열 제약 불가」에서 추론한 것입니다. 일본어 문자와 교대(|)를 포함한 `pattern`이 컴파일되는지는 확인하지 않았으므로 문말 검사는 코드 게이트로 둡니다.
- `lib`에서 `../public/tts-timing.js`를 import하는 것은 처음입니다. Vercel 함수 번들에 포함되는지 프리뷰 배포에서 확인해야 합니다. 안 되면 `vercel.json` `includeFiles`에 추가하거나 함수를 lib으로 옮깁니다.
- `estimateSeconds`는 TTS 1문장 실측(8 mora/초)으로 보정했습니다. 사람이 말하는 실제 속도와는 다를 수 있습니다.
- 라우팅 정규식은 daily_questions와 몇 가지 문형으로만 설계했습니다. 생성 질문(10개×회사)에서 오분류율이 얼마인지는 질문 생성 출력 샘플로 따로 측정해야 합니다 [Low].
