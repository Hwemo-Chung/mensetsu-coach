# 메일 기반 기능에 cloud-mail 도입 검토 (2026-11-03)

대상: https://github.com/maillab/cloud-mail (MIT, 스타 약 1.5만, 마지막 push 2026-10-25, `gh api` 확인)
용도 후보: (A) F13 매일 아침 9시 팁 메일, (B) 메일로 답변을 보내면 첨삭·스크립트를 메일로 회신

## 결론

| 용도 | 판정 | 한 줄 이유 |
|---|---|---|
| (A) 팁 메일 | **도입하지 않음** | cloud-mail도 결국 Resend 또는 Cloudflare 발송을 씁니다. 지금 막혀 있는 원인(발송 도메인과 키 3개)은 그대로이고, Cloudflare DNS 이전·KV·D1·10단계 배포가 더 붙습니다. [High] |
| (B) 메일 코칭 | **11/8 제출 전에는 하지 않음.** 제출 후에도 cloud-mail 없이 최소 구성으로 진행 | 웹메일 클라이언트는 필요 없고, 수신 1건을 `/api/review`로 넘기는 30줄 정도의 중계만 있으면 됩니다. 대신 개인정보 원칙(기록은 브라우저에만 저장)이 깨지고, 접근 코드 없이 Claude 크레딧이 소모되는 경로가 생깁니다. [High] |

## 1. 대회 규칙

- 규칙 원문: 참가자 가이드 전문은 주최 측 이벤트 페이지(로그인 필요)에 있습니다. 레포 밖 킥오프 메모에는 요약만 남아 있습니다. 그 요약은 다음과 같습니다. 「성과물은 기간 중 신규 제작만 (기존 프로젝트 재사용 금지, 본인 기여가 구분 안 되면 실격) … 권리 없는 코드·데이터 사용 금지」. 원문을 대조하지 못했으므로 아래 해석은 [Medium]입니다.
- 레포 규칙(`CLAUDE.md:36`): "Only code written during the contest period (from 11/2 12:30). No copying code from existing projects".
- 해석
  - 외부 서비스나 npm 의존성으로 쓰는 것 자체는 금지 대상이 아닙니다. 이미 `@anthropic-ai/sdk`, `mammoth`(`package.json:16-19`)를 쓰고 있고, Vercel·Upstash·Resend도 외부 서비스입니다. MIT 라이선스이므로 권리 문제도 없습니다. [Medium]
  - 문제는 배포 방식입니다. 공식 배포 문서의 1단계가 "Fork or clone the cloud-mail repository to your own GitHub account"입니다(https://docs.skymail.ink/en/deployment/dashboard.html). 제출 계정 아래에 남이 만든 대형 프로젝트 포크가 생기고, 메일 기능의 대부분이 우리 코드가 아니게 됩니다. 이는 "본인 기여가 구분 안 되면 실격" 조항에 정면으로 걸릴 수 있는 형태입니다. [Medium]
  - 운영 측은 "심사 대상은 Claude로 한 개발로 한정한다"고 답했습니다(같은 메모). 다른 AI 도구 병용에 대한 질문에 나온 답변이지만, 같은 논리를 적용하면 cloud-mail 부분도 심사 대상이 아니라고 봅니다. 점수는 되지 않고 위험만 남습니다. [Medium]

## 2. 공식 문서로 확인한 전제 조건

| 항목 | 내용 | 출처 | 신뢰도 |
|---|---|---|---|
| Cloudflare Email Routing(수신) | "You must be using Cloudflare DNS". MX·SPF·DKIM 레코드가 자동으로 추가됩니다. 즉 **본인 소유 도메인의 DNS를 Cloudflare로 옮겨야** 합니다. | https://developers.cloudflare.com/email-routing/get-started/enable-email-routing/ | [High] |
| Email Workers | `email(message, env, ctx)` 핸들러를 씁니다. `message.reply()`는 이벤트당 1회이며, 발신 도메인이 수신 도메인과 같아야 합니다. DMARC 결과가 `Authentication-Results` 헤더로 붙는데, 첫 헤더이면서 `mx.cloudflare.net`에서 온 것만 신뢰해야 합니다. 예제 코드 주석 기준 수신 크기 상한은 25 MiB입니다. | https://developers.cloudflare.com/email-routing/email-workers/ | [High] |
| Email Worker 실행 시간 | 리뷰 응답(약 35초)을 기다리는 동안 `email()` 핸들러의 CPU·경과 시간 상한이 어떻게 적용되는지는 확인하지 못했습니다. | 미확인 | [Unknown] |
| Cloudflare Email Service(발송) | **Beta** 상태입니다. 아무 수신자에게나 보내려면 Workers Paid가 필요합니다. 월 3,000통까지 포함되고, 넘으면 1,000통당 $0.35입니다. 신규 계정은 일일 할당량이 보수적으로 시작합니다. 수신(Routing)은 무료 플랜에서도 무제한입니다. | https://developers.cloudflare.com/email-service/ , https://developers.cloudflare.com/email-service/platform/pricing/ , https://developers.cloudflare.com/email-service/platform/limits/ | [High] |
| Resend 발송 | `onboarding@resend.dev`는 계정 본인 주소로만 보낼 수 있습니다. 다른 주소로 보내면 403이 납니다. **실사용하려면 도메인 인증이 필요합니다.** | https://resend.com/docs/knowledge-base/403-error-resend-dev-domain | [High] |
| Resend 수신 | 수신 기능이 있습니다. `<id>.resend.app` 하위 도메인은 DNS 설정 없이 바로 받을 수 있고, 커스텀 도메인은 MX 레코드를 추가하면 됩니다. `email.received` 웹훅에는 "do not include the email body, headers, or attachments"이므로 본문은 Received emails API로 따로 가져와야 합니다. | https://resend.com/docs/dashboard/receiving/introduction , https://resend.com/docs/webhooks/emails/received.md | [High] |
| Resend 웹훅 서명 | Svix 헤더(`svix-id`/`svix-timestamp`/`svix-signature`)와 엔드포인트별 secret으로 검증합니다. `email.received`에도 적용된다고 명시된 문장은 없지만, 일반 규칙으로 서술되어 있습니다. | https://resend.com/docs/dashboard/webhooks/verify-webhooks-requests | [Medium] |
| Resend 무료 플랜 | 월 3,000통, **하루 100통**, 도메인 3개, 데이터 보존 30일입니다. 수신도 포함됩니다. | https://resend.com/pricing | [High] (수신이 같은 월 할당량에서 차감된다는 점은 [Medium]) |

## 3. cloud-mail 구성과 웹훅

- 필요 리소스: Worker 1개, KV, D1(바인딩 이름 `kv`/`db` 고정), 선택으로 R2(첨부)가 필요합니다. 변수는 `domain`/`admin`/`jwt_secret`이고, 배포 후 `/api/init/<secret>`로 DB를 초기화하고 관리자 계정을 가입합니다. 대시보드 기준 10단계입니다(위 dashboard.html, `mail-worker/wrangler.toml:9-20,41-47`). 메일 수신에는 위의 Cloudflare DNS 조건이 그대로 적용됩니다. [High]
- 발송: Cloudflare Email(`send_email` 바인딩, `wrangler.toml:22-23`) 또는 Resend를 씁니다(README-en.md:62, 94). (A)에 필요한 발송 수단은 지금과 같습니다. [High]
- 웹훅은 외부 URL로 POST할 수 있습니다. 다만 다음 제약이 있습니다(`mail-worker/src/service/webhook-service.js`, `mail-worker/src/email/email.js`). [High]
  - secret은 `Authorization` 헤더에 원문 문자열로 실립니다(`webhook-service.js:22-24`). HMAC이나 타임스탬프가 없어 재전송 공격을 막지 못합니다.
  - 재시도는 지연 없이 바로 반복합니다(`webhook-service.js:41-57`).
  - **본문은 D1에 먼저 저장되고 나서 웹훅이 호출됩니다**(`email.js:145` 저장 → `:197-198` 웹훅). 즉 웹훅만 쓰고 싶어도 메일 본문이 남습니다.
  - 웹훅 URL·secret은 관리자 설정 화면(DB)에서 지정합니다(`email.js:20-39`).

## 4. (B) 최소 대안과 비교

현재 `/api/review`는 `x-access-code`(`api/review.js:16`)와 `question`·`answer`(`:26-31`)를 요구합니다. 메일 본문 하나만으로는 질문과 답변이 구분되지 않습니다. 어떤 방식을 택하든 "제목=질문, 본문=답변" 같은 파싱 규칙과 서버 쪽 중계 secret이 새로 필요합니다. [High]

| 방식 | 추가 구성 | 메일 본문 저장 위치 | 회신 발송 | 비고 |
|---|---|---|---|---|
| cloud-mail 웹훅 | 10단계 배포, CF DNS 이전, KV·D1(·R2), 관리자 UI | **D1에 무기한 저장**(삭제 운영 필요) | CF Email(Beta, Paid) 또는 Resend | 웹메일 UI·다중 계정 등 필요 없는 기능이 대부분입니다 |
| Cloudflare Email Worker 약 30줄 | CF DNS 이전, Worker 1개 | 저장하지 않게 만들 수 있음(무상태) | `message.reply()` 1회(같은 도메인) | DMARC 헤더 검사 필수, 실행 시간 상한 [Unknown] |
| Resend 수신 | MX 추가 또는 `resend.app` 하위 도메인, `/api/inbound` 1개 | **Resend에 저장**(무료 플랜 보존 30일) | Resend(인증 도메인) | 웹훅에 본문이 없어 API를 한 번 더 호출해야 합니다. Svix 서명으로 검증합니다. 이미 F13에서 쓰는 업체라 위탁처가 늘지 않습니다 |

개인정보 영향(세 방식 공통): `public/privacy.html:20`의 "お使いのブラウザ（localStorage）にだけ残ります"가 깨집니다. §3 위탁처 목록(`privacy.html:28-31`)에 "답변 본문"이 추가됩니다. Cloudflare 방식은 위탁처 1곳(Cloudflare, Inc.)이 새로 늘어납니다. `maskInput`은 Claude 호출 직전에만 적용되므로, 메일 업체를 지나는 본문은 마스킹되지 않은 원문입니다. [High]

보안: 메일에는 접근 코드가 없습니다. 누구든 메일을 보내 Claude 크레딧을 쓸 수 있습니다. 가장 싼 차단책은 F13 구독자 저장소(`lib/mail.js:42-49` `makeStore`)를 발신자 허용 목록으로 재사용하는 것입니다. 거기에 DMARC 통과 확인을 더합니다. [Medium]

## 5. (A) 관련 부수 확인

- (A)는 코드가 완성되어 있습니다(`lib/mail.js:66-79` Resend REST, `api/cron/daily.js`, `vercel.json` cron `0 0 * * *` = 09:00 JST). 남은 일은 사용자가 할 설정뿐입니다. Resend 도메인 인증 → `RESEND_API_KEY`·`MAIL_FROM`·`KV_REST_API_URL`·`KV_REST_API_TOKEN`·`CRON_SECRET`·`APP_URL`을 Vercel에 등록합니다. [High]
- 무료 플랜은 하루 100통입니다. `api/cron/daily.js:16-25`는 모든 구독자에게 한 번에 보내므로, 구독자가 100명을 넘으면 초과분이 `failed`로만 집계되고 실패가 드러나지 않습니다. 데모 규모에서는 문제없습니다. [High]

## 6. 제출 후에도 (B)를 원할 때 순서

1. 도메인을 1개 확보합니다. (A)의 Resend 인증과 같은 도메인을 쓸 수 있습니다.
2. 수신 경로를 고릅니다. DNS를 옮기지 않으려면 Resend 수신(MX만 추가, 또는 `resend.app` 하위 도메인)을 씁니다. 업체에 본문을 남기지 않으려면 DNS를 Cloudflare로 옮기고 Email Worker를 무상태로 운영합니다. **cloud-mail은 쓰지 않습니다.**
3. `/api/inbound`를 하나 추가합니다. 서명 또는 중계 secret을 검증하고, 발신자 허용 목록(구독자 저장소)과 DMARC를 확인합니다. 제목/본문을 question/answer로 파싱한 뒤 `generateReview`를 호출하고 결과를 메일로 회신합니다. 본문은 로그와 저장소에 남기지 않습니다.
4. `privacy.html` §2·§3·§4를 개정합니다. 답변 본문이 메일 업체를 거친다는 점과 보존 기간을 적습니다.
5. 테스트: 위조 발신자, 서명 없음, 허용 목록 밖 발신자가 모두 401로 막히는지 오프라인 테스트로 고정합니다.
