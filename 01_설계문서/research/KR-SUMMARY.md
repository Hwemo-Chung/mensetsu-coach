# KR-SUMMARY — kr 팩 1차 초안

작성 2026-11-02. 판정 근거: `KR-VERIFICATION-LOG.md`. 초안: `kr-draft.json`(packs/ 밖, **병합 안 함**). 사람이 승인하고 아래 §3의 코드 작업을 마친 뒤에만 `packs/kr.json`으로 옮깁니다.

## 1. 유닛별 집계 (후보 40건)

| 유닛 | 후보 | keep | drop | 팩 반영 | 비주입 참고 | doc_only | 고친 문안(keep+실패 관점) |
|---|---|---|---|---|---|---|---|
| K1 채용 흐름 | 4 | 1 | 3 | 1 (daily 8문항) | 0 | 0 | 0 |
| K2 언어 전이 | 7 | 3 | 4 | 3 (rules 3) | 0 | 0 | 1 (evidence_fit) |
| K3 체류자격 | 9 | 9 | 0 | 5 (notes 4, daily 1문항) | 3 (상황 질문) | 1 | 5 (evidence_fit) |
| K4 공정채용 | 11 | 2 | 9 | 2 (notes 2) | 0 | 0 | 0 |
| K5 실패 패턴 | 9 | 7 | 2 | 2 (categories 5, daily 1문항) | 5 (failure_pattern) | 0 | 2 (stereotype) |
| 합계 | 40 | 22 | 18 | 13 | 8 | 1 | 8 |

- 기각 18건 중 evidence_fit 16, stereotype 2(`kr-fp-portfolio`, `kr-cn-can-do`). 권리·PII 기각 0건.
- `kr-fp-portfolio`의 검증 사유는 "중립판 첨부"라고 했지만 후보 목록에 중립판이 없었습니다. 지어내지 않았습니다.

## 2. 슬롯별 상태

| 슬롯 | 내용 | 근거 |
|---|---|---|
| id / version / name / language_pair | `kr`, 0, 韓国（日本人求職者向け）, ko←ja | 작업 지시 |
| answer_structure | JP 4문형을 한국어로 옮김(키 유지, label·rule·example 한국어 합쇼체, label_native 일본어) | **리서치 근거 0건.** keep 후보 없음(`kr-star` 기각). 작업 지시에 따라 사용자 본인의 JP 노하우를 이식 |
| correction_rules | 3건: `kr-topic-ga`, `kr-register-mix`(고친 문안), `kr-shi-overuse` | K2 keep 3 |
| model_answer_format | 60초, `["ko","pronunciation_ja","translation_ja"]`, 한국어+가타카나 발음+일본어 번역 | **리서치 근거 0건.** 작업 지시가 정한 형식 |
| question_taxonomy.stages | **빈 배열** | keep 후보 없음(`kr-taxonomy` 기각) |
| question_taxonomy.categories | 5개: 동기(왜 한국/왜 이 회사), 즉시 기여, 의견 표명, 비자·근속, 과제(PPT) | K5 `kr-q-categories` |
| culture_notes | 6개: K3 4(한 문장화), K4 2 | K1 노트는 0개(`kr-culture` 기각), K5 노트 0개(`kr-cn-can-do` 기각) |
| daily_questions | 10개: K1 8, K5 1, K3 1 | 선택 규칙은 로그 상단 |

## 3. 이 팩으로 지금 되는 것과 안 되는 것

**지금은 앱에서 쓸 수 없습니다.** 초안이 파일로 존재할 뿐이고, 로드하면 다음 이유로 깨지거나 틀린 출력을 냅니다.
1. `lib/coach.js`가 일본어 대상으로 고정돼 있습니다. 프롬프트에 「面接の言語は日本語」「日本語添削」「面接で話す文は日本語」, 빈 replacement를 「削除」로 출력, 스크립트 스키마의 `ja` 필드, EXPLAIN_LANGS가 ko 해설 전제. 팩의 `language_pair`와 `model_answer_format.lines`를 읽도록 일반화해야 합니다.
2. `question_taxonomy.stages`가 빈 배열이라 `questionsSchema`의 `stage` enum이 `[]`가 됩니다(70행). 구조화 출력이 실패하거나 stage를 생성할 수 없습니다. stages를 채우거나 비었을 때 필드를 빼는 코드가 필요합니다.
3. K5 failure_pattern 5건을 담을 파일(`failure-patterns-kr.json`)이 없습니다(이번 작업은 3개 파일 제한).

**코드가 일반화되면 되는 것**
- 일본인 지원자의 한국어 면접 답변을 4문형으로 구조 체크.
- 교정은 3가지뿐: 새 정보 주어의 은/는→이/가, 합쇼체 답변의 결론 문장 해요체 마무리, 본인 행위의 -(으)시. "규칙 DB 밖 교정 금지" 원칙상 그 밖의 한국어 오류는 고치지 않습니다. 범위가 매우 좁습니다.
- 체류자격 질문(15일 신고·주체 구분, F계열 제한, H-1 한계, 2026 E-7 임금요건)에 사실만 단정하지 않고 답하게 하는 문화 노트.
- 채용절차법 서면 금지 항목(30명 이상), 나이·종교 질문이 차별 요소라는 노트.
- 한국어 질문 10개 일일 연습, 모범답안 60초(한국어+가타카나+일본어).

## 4. 미확인 칸

1. **질문 생성 금지 필터가 없습니다(가장 중요).** `kr-forbidden-question-filter`와 관련 K4 노트 대부분이 기각돼, jp 팩의 「…は面接質問として生成しない」에 해당하는 문장이 kr 초안에 없습니다. 질문 생성기가 나이·종교·혼인·가족·출신지역 질문을 만들 수 있습니다. 재제출 시 출처에 있는 범주만(K4-03 법정 항목 + K4-12 NCS 면접 범주, '연애'·'주거 형태' 제외) culture_notes 한 문장으로 넣어야 합니다.
2. `answer_structure`(4문형 한국어판)와 `model_answer_format`은 한국 면접 근거 0건. 한국 면접에서 '복창→결론→기준·숫자→선택지'가 통하는지 검증한 자료 없음.
3. `question_taxonomy.stages`: 한국 경력직 전형 단계의 공적 문서 미확인. 민간 칼럼 1건(K1-06/07: 직무면접→임원면접, 과제·3차는 회사별)만 확인.
4. `k3-cn-e7-wage`는 **2026-12-31에 효력 종료**. 2027 공고가 나오면 교체해야 합니다. 유효기간 필드 없음.
5. K3 doc_only 미확인 항목: E-7 학력·경력 요건과 허용 직종 목록, 출입국관리법 제18~21조·시행령 현행 조문 본문, D-10 체류기간 현행값(6개월 vs 1년), H-1에서 다른 체류자격으로의 국내 변경 가능 여부, 법무부·대사관 자료의 공공누리 유형. 출처 kind: law.go.kr 법령 서식은 public(저작권법 제7조 비보호), 공공데이터포털은 '이용허락범위 제한 없음', 나머지 법무부·대사관 자료는 private.
6. K3-02 과태료 금액(2013년 서식 표기), 법령 현행판 대조(채용절차법 2020년 판, 고령자고용법 2016년 판, 근로기준법 2014년 판만 대조).
7. K5 출처는 전부 private 커뮤니티 보고 요약(source_url 'internal-research'), 외부 재현 불가, confidence medium/low.
8. 한국어 교정 규칙 근거는 초록 수준. `kr-shi-overuse`는 근거 1건, 면접 빈도 미확인. K2-08 URL은 404.
9. 남녀고용평등법 제7조, 인권위 진정 경로, 외국인 지원자 고유 질문(국적·비자)의 한국 규범상 취급: 미조사.

## 5. 한국어 원어민 검수자가 확인할 것

- [ ] `answer_structure` 4단계의 label·rule·example이 한국 면접에서 자연스러운가. 특히 복창 예문 "일정이 밀렸을 때의 판단에 대한 질문으로 이해했습니다."가 합쇼체 복창으로 자연스러운가.
- [ ] `correction_rules` 3건의 example_before가 실제로 틀렸고 example_after가 자연스러운가. `kr-register-mix`가 맞는 해요체 답을 과잉 교정하지 않는가.
- [ ] `culture_notes` K3 4건의 한 문장화가 너무 길어 오독되지 않는가, 원안(로그 §6)과 의미가 같은가. 의무 주체(고용주/본인)가 분명한가.
- [ ] `daily_questions`의 높임 등급 혼재: K1 문항은 합쇼체("~해 주십시오", "~입니까?"), K5 문항은 "~하려 하시나요?". 면접관 발화로 섞여도 괜찮은지, 통일할지.
- [ ] Q3 "왜 일본이 아니라 한국에서 일하려 하시나요?"가 실제 면접관 질문으로 자연스럽고 차별적으로 들리지 않는가.
- [ ] `question_taxonomy.categories` 라벨(특히 "즉시 기여", "의견 표명")이 한국 채용 실무 용어로 통하는가.
- [ ] `model_answer_format`의 가타카나 발음 표기가 한국어 발음(받침·연음)을 일본어 화자에게 쓸 만큼 전달하는가. 다른 표기(로마자 병기 등)가 나은가.
- [ ] 재제출 후보 문안(`kr-taxonomy` 축소판, `kr-culture` 2~4번, 금지 필터 노트, `kr-redirect-phrases` '나이' 수정판)을 검수할 때 같은 기준 적용.

## 6. 검증 출력

인라인 node 검사(`validate-draft.mjs`는 jp.json 대비 append-only 검사라 kr 초안에는 설계상 맞지 않아 쓰지 않았습니다):
- JSON 파싱, 최상위 키가 packs/jp.json과 동일(10개), 규칙마다 정확히 7필드·문자열·유효 type·id 중복 없음, answer_structure.steps 키 순서 fukusho/ketsuron/kijun/sentakushi와 step 필드가 jp와 동일, daily_questions 10개·중복 없음, culture_notes 비어 있지 않은 문자열, language_pair `{target:"ko", native:"ja"}`.
- 결과: `OK keys=10 rules=3 notes=6 daily=10 stages=0 categories=5`

이 검사는 형식만 봅니다. 한국어 품질과 사실 정확성은 §5의 사람 검수가 필요합니다.

## 7. 메인 세션 후처리 (2026-11-02)
- 질문 생성 금지 노트 1문장을 culture_notes 맨 앞에 추가했습니다(채용절차법 제4조의3 법정 항목 + 연령·종교 차별 금지. K4-03 근거). 원어민 검수 대상입니다.
- K1 개인 블로그 URL·핸들을 공개본에서 지웠습니다. 404였던 출처는 "검증 불가"로 낮췄습니다. K4-14는 private으로 내렸습니다.
- 이 초안은 앱에서 아직 쓸 수 없습니다(§3). 일본어 고정 코드를 일반화하고 stages를 채운 뒤에만 packs/kr.json으로 옮깁니다.
