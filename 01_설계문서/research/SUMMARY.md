【검증 출력】node validate-draft.mjs 실행 결과:
+rules 3/3 (rep-sasete-itadaku, str-visa-facts, rep-uchi-keishou)
+notes 5/5, +enums 4 (カジュアル面談, 二次面接, オファー面談, 日本で働く理由・在留)
+chars 874/1000 (rules 481, notes 366, enums 27)
OK, exit=0
- 두 JSON 파일 모두 JSON.parse를 통과했습니다.
- 음성 시험 8종(규칙 4건, 노트 6건, 잘못된 type, 중복 id, 여분 키, 필드 누락, 1,004자, 기존 노트 변조)은 모두 exit 1로 실패를 잡았습니다.

【동시 수정 공개】작업 중 packs/jp.json이 바뀌었습니다. 18:31에 다른 작업이 daily_questions 키를 추가했습니다. 검증기가 키 불일치로 잡았고, 초안에는 그 값을 그대로 복사했습니다. 같은 시간대(18:27~18:34)에 다른 세션이 lib/mail.js, api/, public/, test/, package.json, vercel.json도 수정했습니다. 이 작업은 그 파일들을 하나도 쓰지 않았습니다. git이 아니라서 diff로는 증명할 수 없습니다.

【기타】
- CLAUDE.md에 적힌 02_로컬원본/ 디렉터리가 현재 없습니다. README-SECTION (1)의 "기존 15건 = 본인 노하우"는 DESIGN-KAKAOTALK §5와 대조했습니다. 透過·集中·資産·逆に 등은 있었지만 事実になる·反論·どう思いますか는 없었습니다. 그래서 문구를 "添削メモと、それをもとに設計段階で整理したルール"로 낮췄습니다.
- "コードはすべてコンテスト期間中に書いた"는 사용자 본인의 주장입니다. 제가 검증한 사실이 아닙니다.

=== SUMMARY.md 내용 (메인 세션이 저장) ===
# SUMMARY — R1 리서치 결과와 1차 병합안
작성 2026-11-02. 판정 근거 전부: VERIFICATION-LOG.md. 병합은 하지 않았습니다. jp-draft-v2.json은 packs/ 밖의 초안이며, 사람이 승인한 뒤에만 반영합니다(PRD §4.1).

## 1. 유닛별 집계 (후보 71건)
| 유닛 | 후보 | keep | drop | 이번 병합 | 다음 병합 후보 | doc_only | 비주입 참고 | 고쳐 쓴 후보(evidence_fit) |
| C2 | 10 | 9 | 1 | 2 (rules 2) | 4 | 3 | 0 | 4 (+기각 1) |
| T4 | 11 | 11 | 0 | 4 (rule 1, notes 2, category 1) | 5 | 2 | 0 | 4 |
| T2b | 13 | 13 | 0 | 1 (note 1) | 7 | 5 | 0 | 3 |
| T5 | 10 | 10 | 0 | 2 (notes 2) | 1 | 7 | 0 | 2 |
| T2a | 13 | 13 | 0 | 3 (stages 3) | 7 | 3 | 0 | 0 |
| SNS | 14 | 14 | 0 | 0 | 2 | 3 | 9 (failure_pattern) | 0 |
| 합계 | 71 | 70 | 1 | 12 | 26 | 23 | 9 | 13 |
- 기각 1건: rep-yohi. 학습 약 1개월 학습자 n=2, 예시 1건으로 문서 자체 기준에 미달합니다.
- 스테레오타입 거부권 행사 0건, 권리·PII 기각 0건입니다. 출신 노트는 0건이라 "전부 high" 기준은 해당하지 않습니다.
- SNS의 P1·P2·P4와 sns-note-final-direction은 원 문서의 medium을 low로 내려 기록했습니다. 상업·에이전시 출처가 섞이면 low로 둔다는 문서 자체 규칙을 따랐습니다.

## 2. 이번 병합안과 코치 출력의 변화
- rules: rep-sasete-itadaku(C2, high, 157자), str-visa-facts(T4, high, 150자), rep-uchi-keishou(C2, medium, 174자)
- notes: cn-no-14jikou-questions(T4, high, 61자), cn-zairyu-answer-facts(T4, high, 68자), cn-t2b-05(T2b, high, 67자), cn-t5-three-month-gap(T5, high, 97자), cn-t5-shuro-shomeisho-optional(T5, high, 73자)
- stages: カジュアル面談, 二次面接, オファー面談(T2a, 17자) / categories: 日本で働く理由・在留(T4, 10자)

변화:
1. 첨삭
   - 허락·은혜가 없는 させていただく를 지적합니다.
   - 「ビザは大丈夫です」를 「資格名＋期限＋転職時の手続き」로 고치게 합니다.
   - 면접관 앞에서 현 직장 상사를 「〇〇部長がおっしゃる」로 높이면 「上司の〇〇が申す」로 고칩니다.
   - rule_id enum(coach.js 255행)이 15개에서 18개로 늘어납니다.
2. 질문 생성: culture_notes가 시스템 프롬프트에 들어갑니다(coach.js 38행). 그래서 14事項(本籍·家族·宗教·尊敬する人物·愛読書 등) 질문을 만들지 않게 됩니다.
3. 질문 세트 구성(사람 승인 필요): coach.js 101행 「各カテゴリを最低1つ含める」 때문에 10문항마다 日本で働く理由・在留 질문이 최소 1개 강제됩니다. 검증자 조건에 따라 14jikou·zairyu 노트를 함께 넣었습니다. 그래야 국적 질문이나 선고 단계의 在留カード 요구가 생기지 않습니다.
4. 답변 코칭
   - 입사 가능일은 민법 2주, 취업규칙, 인수인계를 근거로 답하게 합니다.
   - 공백 기간은 사실만 말하게 하고, 취소 여부는 판단하지 않습니다.
   - 就労資格証明書가 없으면 자격명·기한으로 답하고, 요청이 있으면 협력하겠다고 말하게 합니다.
5. stage enum에 3개 값이 추가됩니다.

## 3. 선택 근거
- rules: high 2건 다음 세 번째 자리에는 medium 11건 중 rep-uchi-keishou를 골랐습니다.
  - 공적 규범(敬語の指針【24】)이 있습니다.
  - 한국어 전이 근거(NINJAL, 朝鮮語教育16)를 가진 유일한 R1 규칙입니다.
  - 中途 지원자는 상사를 자주 언급합니다.
- rep-daijoubu-kahi는 str-visa-facts와 「大丈夫です」 대상이 겹쳐 제외했습니다.
- notes: high 6건 중 대상이 가장 좁은 cn-t5-hsp1-change-permit을 보류했습니다. cn-zairyu-answer-facts는 str-visa-facts와 일부 겹치지만, T4 검증이 카테고리 추가의 동반 조건으로 지정했기 때문에 유지했습니다.
- cn-uchi-soto-interview는 rep-uchi-keishou와 중복이라 보류했습니다.
- 예산: 874/1,000자, rules 3/3, notes 5/5입니다.

## 4. 병합 전 반드시 처리할 것
1. test/i18n.test.js 22~23행은 모든 stage·category에 UI 라벨을 요구합니다. 새 enum 4개의 라벨이 public/i18n/{ko,ja,en}.js에 없으므로, 그대로 병합하면 npm test가 실패합니다. 병합 작업에 라벨 추가를 포함해야 합니다.
2. 작업 중 packs/jp.json이 바뀌었습니다(daily_questions 추가). 병합 직전에 node validate-draft.mjs를 다시 실행해야 합니다.
3. version은 1 그대로 두었습니다.

## 5. 미확인 칸
- PRD §5 재현 테스트(example_before를 넣으면 해당 id를 지적하는지)는 3건 모두 미실행입니다. 따라서 채택은 잠정입니다(재현에 실패하면 채택 취소).
- validate-draft.mjs --verbatim은 구현하지 않았습니다. 전재 검사는 유닛 검증자가 20자 창 대조로 했고(일치 0), doda는 WebFetch 요약만 있어 원문 대조를 하지 못했습니다.
- 敬語の指針이 MEXT 제외 별표(1366610.htm)에 들어 있지 않은지 확인하지 못했습니다.
- 전 직장 상사를 ウチ로 다루는지는 미확인입니다(rep-uchi-keishou는 현 직장으로 한정). 한국어 쪽 전이 기제 5종도 미확인입니다.
- 외국인 고유·在留 질문이 中途 면접에서 얼마나 나오는지 모릅니다. 「正当な理由」에 転職活動 기간이 포함되는지도 모릅니다(코치는 판단하지 않음).
- str-visa-facts의 「期限」 슬롯은 永住者 같은 자격에 맞지 않습니다. 또 str-visa-facts(手続き)와 cn-zairyu(就労可否)의 슬롯 표기가 다릅니다.
- cn-t2b-05의 claim_ids에 R1T2b-30/31이 빠져 있습니다(원 문서 미수정).
- 告示276 育成就労 시행일, 告示141 현행판, 「法務大臣」 문언, R1T2a-28 원문은 미확인입니다.
- T1~T4 기존 문서에는 검증 로그가 없습니다(README §3에 표기).
- VERIFICATION-LOG §7의 doc_issues는 R1 원 문서에 반영하지 않았습니다. R1-SNS.md에는 로컬 절대경로가 남아 있어 공개 전에 제거해야 합니다.
- README §0·§4의 일부 서술은 R1 결과와 맞지 않게 되었지만 고치지 않았습니다.

## 6. 다음 병합 후보 26건 (순위)
1. cn-t5-hsp1-change-permit (note, high, 50)
2. str-why-japan-axes (rule, medium, 164)
3. str-tenshoku-reason-forward (rule, 241; T4 t4-leave-reason-positive와 통합 필요)
4. str-japanese-evidence (rule, 159)
5. rep-onsha-spoken (rule, 82)
6. str-salary-range (rule, 229)
7. str-start-date (rule, 201)
8. str-final-career-vision (rule, 234)
9. str-casual-interest (rule, 203)
10. rep-daijoubu-kahi (rule, 130)
11. rep-yakushoku-sama (rule, 107)
12. cn-t2b-02 (note, 54)
13. cn-t2b-03 (note, 54)
14. note-stage-axes (note, 87)
15. note-final-consistency (note, 62)
16. cn-gyakushitsumon-conditions-agent (note, 85)
17. cn-t2b-01 (note, 65)
18. cn-t2b-04 (note, 63)
19. cn-teichaku-normal-question (note, 59)
20. note-casual-mendan (note, 79)
21. note-reference-check-2nd-merge (note, 86)
22. cn-uchi-soto-interview (note, 73; 폐기 후보)
23. str-salary-private-reason (rule, low, 168)
24. cn-redirect-not-refuse (note, low, 69)
25. sns-note-final-direction (note, low, 48)
26. sns-note-credential-judgment (note, low, 44)
예시안: rules 2~4순위(564자) + notes 1·12·13·15순위(220자) = 784자. failure-patterns-r1.json은 어느 병합에도 넣지 않습니다.

## 7. 실측 범위
- 문자 수 정의: 새 규칙의 pattern·replacement·reason·example_before·example_after 코드포인트 수(id·type 제외) + 새 노트 + 새 enum. packs/jp.json과의 차이로 셉니다. 유닛 문서의 자체 집계(816·892·923자)는 정의가 달라 비교할 수 없습니다.
- 쓴 파일은 01_설계문서/research/ 아래 6개뿐입니다. 원 출처는 다시 열지 않았고, 사실 확인은 유닛 검증 결과에 의존합니다.

## 8. 병합 결과 (2026-11-02 메인 세션)
- 병합: rules 3 + notes 5 (`packs/jp.json`). str-visa-facts는 永住者 오교정 방지를 위해 replacement·reason을 고쳐서 병합.
- 보류: question_taxonomy 확장 4건. 「各カテゴリを最低1つ」와 겹쳐 재류 질문이 매번 강제되기 때문.
- 근거: `EVAL-2026-11-02.md` (F4 18/18).
