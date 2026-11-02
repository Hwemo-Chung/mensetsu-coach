# VERIFICATION-LOG — R1 후보 검증 기록

작성 2026-11-02. 대상: `R1-C2.md`, `R1-T4.md`, `R1-T2b.md`, `R1-T5.md`, `R1-T2a.md`, `R1-SNS.md`의 팩 후보 전부(71건). 상위 문서: `../RESEARCH-PRD.md` §3·§4.1·§5.
기존 `T1`~`T4` 문서(`T1-shinsotsu.md` 등)의 주장은 이 로그의 대상이 **아닙니다**. 그 문서들의 검증 로그는 없습니다(`README.md` §3 참고).

## 읽는 법

- **판정**: 검증 에이전트의 keep/drop. 71건 중 keep 70, drop 1(`rep-yohi`).
- **실패 관점**: 검증에서 걸린 관점. `none` = 통과. `evidence_fit` = 근거와 문장이 맞지 않았음. keep이면서 `evidence_fit`인 13건은 **근거 범위에 맞게 고쳐 쓴 문안**으로 유지했고, `jp-draft-v2.json`·`failure-patterns-r1.json`에는 고친 문안만 들어갑니다. 스테레오타입·권리·PII 관점으로 걸린 후보는 0건입니다.
- **처리**: 이번 병합(`jp-draft-v2.json`에 들어감) / 다음 병합 후보(예산 초과로 보류) / doc_only(주입 안 함) / 비주입 참고(`failure-patterns-r1.json`) / 기각.
- **사유**: 검증 에이전트 판정 사유의 요지. 원문 대조 결과(확인한 문언·약관)를 그대로 남겼습니다.
- 병합 선택 순서: 신뢰도(high → medium → low), 같은 신뢰도 안에서는 PRD §2.0의 가치 기준(① 코치 발화가 바뀌는가 ② 中途·에이전트 경유 페르소나의 실제 고충)과 이미 채택한 항목과의 중복 여부. 동률 처리: rules 세 번째 자리는 medium 중 공적 규범과 한국어 전이 근거를 함께 가진 유일한 규칙 `rep-uchi-keishou`. `rep-daijoubu-kahi`는 `str-visa-facts`와 「大丈夫です」 대상이 겹쳐 제외. notes는 high 6건 중 대상이 가장 좁은 `cn-t5-hsp1-change-permit`을 보류. `cn-zairyu-answer-facts`는 T4 검증이 카테고리 추가의 동반 조건으로 지정해 유지. 결과: rules 3/3, notes 5/5, enum +4, 874/1,000자(`node validate-draft.mjs`).

## 1. C2 — 한국어 화자의 일본어 면접 발화 (10건)

| id | 슬롯 | 신뢰도 | 판정 | 실패 관점 | 처리 | 사유 |
|---|---|---|---|---|---|---|
| rep-sasete-itadaku | correction_rules | high | keep | none | **이번 병합** | `keigo_tosin.pdf` 【18】에서 許可/恩恵 조건과 「○○高校を卒業させていただきました」 예를 확인. 약관 사슬 bunka.go.jp → 文部科学省ウェブサイト利用規約 → 公共データ利用規約(第1.0版, CC BY 4.0 호환) 확인. 제외 콘텐츠 별표(1366610.htm)는 미확인. 20자 연속 일치 0. 「担当させていただきました」는 경계 사례지만 사용 가능. |
| rep-uchi-keishou | correction_rules | medium | keep | evidence_fit | **이번 병합** | 指針 【24】(「部長の田中」은 ウチ, 「田中部長」은 부적절)·【25】로 규범 확인. 전이 근거: NINJAL Q&A(한국어는 외부인에게도 「社長様が到着なさる」), 朝鮮語教育16(絶対敬語/相対敬語). 원안 example_after가 의미를 바꿔서(…の方針で) 「上司の鈴木がいつも申しているとおり」로 고침. 범위는 현 직장(勤務先)만. 전 직장 확장은 미확인. |
| rep-onsha-spoken | correction_rules | medium | keep | none | 다음 병합 후보 | マイナビ転職(면접은 御社, 메일은 貴社)·キャリタス就活(「御社様」 이중경어 금지) 2건 독립 일치. 전재·출신 언급 없음. rules 3건 한도로 보류. |
| rep-yakushoku-sama | correction_rules | medium | keep | none | 다음 병합 후보 | マイナビニュース(「社長様」は二重敬語, 「○○社長」「社長の○○様」)·Forbes JAPAN(서면 지침). 예문은 면접관 회사(ソト) 인물이라 출처와 맞음. 검증자도 2차 후보로 판정. |
| rep-daijoubu-kahi | correction_rules | medium | keep | evidence_fit | 다음 병합 후보 | 大辞泉이 「はい、大丈夫です」를 可能/承諾로 기록하므로 원안 예문(転勤は可能ですか → 大丈夫です)은 승낙으로 읽혀 다의성 주장이 약함. 요부(要否) 질문 예문으로 고침. C2 전이 규칙이 아니라 공통 규칙. 이번 병합의 `str-visa-facts`와 「大丈夫です」 대상이 겹쳐 이번에는 제외. |
| rep-yohi | correction_rules | low | **drop** | evidence_fit | 기각 | 유일한 출처 金・赤堀・清水 1997은 학습 약 1개월 학습자 2명, 예시 「成功与否」 1건. 문서 자체 기준(2개 출처)에 미달. 「話し言葉では自然」은 저자 추론. 中途 N1·N2와 관련성 낮음. |
| cn-uchi-soto-interview | culture_notes | medium | keep | evidence_fit | 다음 병합 후보(중복 시 폐기 가능) | 원안 「名前に役職…を付けずに」는 指針이 허용하는 「部長の〇〇」까지 금지로 읽히고 「同僚」는 출처 범위 밖이라 허용 형태를 명시해 고침. `rep-uchi-keishou`를 이번에 채택했으므로 내용이 대부분 중복. 예산 절약을 위해 보류. |
| doc-ganbarimasu | doc_only | low | keep | none | doc_only | type就活 1건(新卒 学生言葉 맥락). 中途 관련성 더 약함. 보류 처리가 맞음. |
| doc-particle-transfer | doc_only | low | keep | evidence_fit | doc_only | 1997 논문의 조사 예는 「自転車に乗る」 1건뿐. 「〜を会う」「〜がなる」는 출처 없는 형태라 문안에서 뺌. |
| doc-heisha-candidate | doc_only | low | keep | none | doc_only | マイナビ転職 단일 출처(면접은 「あなた個人として」, 「現職」「前職」 권장). 指針 【24】(弊社の部長, 거래처 장면)과 장면이 달라 사람 검토 필요. |

## 2. T4 — 외국인 고유 질문군 · 逆質問 · 不適切質問 (11건)

| id | 슬롯 | 신뢰도 | 판정 | 실패 관점 | 처리 | 사유 |
|---|---|---|---|---|---|---|
| str-visa-facts | correction_rules | high | keep | none | **이번 병합** | 告示276号 PDF에서 「在留資格上、従事することが認められる者であることを確認」과 令和八年五月二九日 개정 표기, moj.go.jp에서 14日以内·第19条の16第2号·中長期在留者本人, question.html에서 선고 단계 口頭または書面 / 在留カード는 採用内定後 확인. 최장 일치 12자. 메모: C2 「大丈夫です」와 겹침, 永住者 등은 「期限」 슬롯이 안 맞을 수 있음(경미). |
| str-japanese-evidence | correction_rules | medium | keep | none | 다음 병합 후보 | JLPT FAQ(会話・作文 시험 없음), levelsummary(【読む】【聞く】), JASSO 가이드(면접에서 聞く力·話す力 확인) 확인. キャリタス 수치 분모 미확인(문서도 명시). 「頑張ります」(C2)와 병합 시 대조 필요. |
| str-why-japan-axes | correction_rules | medium | keep | none | 다음 병합 후보 | JASSO 가이드의 「なぜ日本（日本企業）で働きたいのか」 질문과 「過去と将来の2つの軸」 확인. ③御社である理由는 기존 T4-6 기반 설계. 新卒 자료를 中途에 외삽(medium 적절). SNS-P1이 현장 사례로 보강. |
| cn-no-14jikou-questions | culture_notes | high | keep | none | **이번 병합** | consider.html에서 14事項·本人に責任のない事項·本来自由であるべき事項·「これらに限られるわけではありません」 확인. 열거 항목은 모두 14事項 안. question.html의 AI 선고 준수 Q&A(R1T4-06) 확인. 약관 mhlw.go.jp/chosakuken(PDL1.0). packs/lib grep 0건 → 중복 없음. 국적은 목록에 넣지 않음. |
| cn-redirect-not-refuse | culture_notes | low | keep | evidence_fit | 다음 병합 후보 | 원안 「拒否や指摘をさせず」는 출처가 뒷받침하지 않고, 厚労省가 ハローワーク 상담을 안내하는 것(R1T4-05)·문서 설계표의 「응답 여부는 본인 선택」과 충돌. 선택권을 보존하는 문장으로 고침. 직무로 되돌리는 기법의 효과는 근거 없음(low). |
| cn-zairyu-answer-facts | culture_notes | high | keep | none | **이번 병합** | question.html 원문(採用選考時は口頭または書面…採用内定後に「在留カード」により確認)과 정확히 일치. 告示276号로 就労可否 확인 의무 확인. `str-visa-facts`와 일부 겹치나 在留カード 확인 시점을 더함. 메모: 규칙은 「手続き」, 노트는 「就労可否」로 슬롯 표기가 다름 → 다음 병합 때 통일 권장. |
| cn-teichaku-normal-question | culture_notes | medium | keep | evidence_fit | 다음 병합 후보 | JASSO 예상 질문에 「日本でどれぐらいの期間、就労したいと考えていますか」 있음 확인. 그러나 「定着性を確かめる」 의도 귀속과 「通常の質問」 판정은 근거 없음(配慮事項 목록에서 못 찾은 것은 부재일 뿐). 출처가 말하는 범위로 낮춰 고침. |
| cn-gyakushitsumon-conditions-agent | culture_notes | medium | keep | evidence_fit | 다음 병합 후보 | doda는 조건 질문을 NG로 들되 「업무 질문 뒤 이유를 밝히고 묻기」를 조건부 허용, Recruit은 에이전트 확인을 선택지(も考えられます)로만 제시, 「業務・組織・評価」는 Recruit 二次 단계 항목. 단정을 조건부로 고침. doda 원문은 WebFetch 요약만 열람해 로컬 전재 대조 못 함. |
| qt-cat-japan-zairyu | question_taxonomy | medium | keep | none | **이번 병합** | enum 문자열 계약 충족. JASSO(R1T4-20/21)·告示276号(R1T4-14) 근거. **제품 동작 변경**: `lib/coach.js` 101행 「各カテゴリを最低1つ含める」 때문에 10문항 세트마다 이 카테고리 질문이 1개 이상 강제됨. 검증자 조건대로 `cn-no-14jikou-questions`·`cn-zairyu-answer-facts`와 함께 넣음. |
| doc-gyakushitsumon-stages | doc_only | medium | keep | evidence_fit | doc_only | Recruit 칼럼(2023-09-29 공개, 2024-05-31 갱신)의 一次/二次/最終 구분과는 맞으나 doda는 一次 면접관을 人事 또는 현장 사원으로, 二次 면접관을 표(部門長)와 본문(中堅)에서 다르게 적음. 「민간 2개 출처 일치」가 아님. 출처 귀속을 명시해 고침. |
| doc-shuro-shikaku-shomeisho-optional | doc_only | high | keep | none | doc_only | e-Gov 법령 API 원문으로 入管法 19条の2 제1항(申請があつたときは…交付することができる)·제2항(不利益な取扱いをしてはならない) 확인. T5와 중복이라 doc_only. |

## 3. T2b — 오퍼·퇴직 단계 (13건)

| id | 슬롯 | 신뢰도 | 판정 | 실패 관점 | 처리 | 사유 |
|---|---|---|---|---|---|---|
| str-salary-range | correction_rules | medium | keep | evidence_fit | 다음 병합 후보 | 리쿠르트 article11673은 「御社の規定に従います。」를 단독 답변 예문으로 싣고 JAC도 권장 답 중 하나로 제시 → 원안(이 한마디 = 결함)은 overclaim. 「희망액이 있을 때」로 패턴을 좁히고 example_before에 그 신호를 넣어 고침. 전재 0. |
| str-start-date | correction_rules | medium | keep | none | 다음 병합 후보 | r-agent 12715(最短入社可能日·希望入社日, 1～2カ月, 引き継ぎ), directscout 4232(1～3カ月, 2週間), 茨城労働局(1ケ月前 申出 권고) 확인. 예문 날짜는 가상 값. |
| str-salary-private-reason | correction_rules | low | keep | evidence_fit | 다음 병합 후보(최하위) | JAC는 개인 사정(結婚·住宅ローン)을 NG로 보나 리쿠르트는 「住宅ローンがあるので現職の年収…は維持したい」를 근거 예로 듦 → 충돌. 「증액 근거를 개인 사정만으로 대는 것」으로 좁혀 고침. NG 쪽 출처 1곳이라 low. |
| cn-t2b-01 | culture_notes | medium | keep | evidence_fit | 다음 병합 후보 | `str-salary-range`와 같은 overclaim. 「希望額があるなら」 조건을 넣어 고침. エージェント経由는 mynavi 71과 맞음. |
| cn-t2b-02 | culture_notes | medium | keep | none | 다음 병합 후보 | mynavi 71(内定前は自分の希望を伝えるにとどめ, 内定後 処遇面談/オファー面談에서 교섭)·MyVision(条件提示・内定承諾前) 확인. |
| cn-t2b-03 | culture_notes | medium | keep | none | 다음 병합 후보 | mynavi FAQ 1713(直接応募先企業に連絡するのは避け…早めに転職エージェントの担当者に相談), r-agent 12635 예문 확인. |
| cn-t2b-04 | culture_notes | medium | keep | none | 다음 병합 후보 | mynavi 1555(保留理由と回答期限を明確に, 「第一志望」 발언과의 모순) 확인. 보류 일수는 넣지 않음. |
| cn-t2b-05 | culture_notes | high | keep | none | **이번 병합** | e-Gov 民法627条1項 원문(解約の申入れの日から二週間を経過することによって終了する), 茨城労働局 就業規則 1ケ月 권고 확인. 期間の定めのない雇用으로 범위 한정. 남은 과제: 「引き継ぎ」 근거 R1T2b-30/31을 claim_ids에 추가(이 로그에서 기록, 원 문서는 미수정). |
| doc-t2b-offer-stage | doc_only | medium | keep | none | doc_only | mynavi 71의 「処遇面談」「オファー面談」 표기 확인. T2a로 넘김(T2a `stage-offer-mendan`으로 이번 병합에 반영). |
| doc-t2b-fee | doc_only | high | keep | none | doc_only | e-Gov XML로 職安法32条の3第2項(求職者からは手数料を徴収してはならない)·施行規則20条2項 예외 확인. |
| doc-t2b-no-poaching | doc_only | high | keep | none | doc_only | 厚労省 리플릿 PDF(001603370)의 2년 전직 권유 금지·返戻金制度·お祝い金 금지 확인. 약관 PDL1.0. |
| doc-t2b-terms-mismatch | doc_only | high | keep | none | doc_only | 労基法15条2項·職安法5条の3第3項 원문 확인. 의무 주체가 求人者라는 점이 문장에서 빠졌지만 틀린 내용은 아님. |
| doc-t2b-taishoku-cert | doc_only | high | keep | none | doc_only | 労基法22条(使用期間·業務の種類·地位·賃金·退職の事由, 遅滞なく交付) 확인. |

## 4. T5 — 在留資格·就労許可 (10건)

| id | 슬롯 | 신뢰도 | 판정 | 실패 관점 | 처리 | 사유 |
|---|---|---|---|---|---|---|
| cn-t5-shuro-shomeisho-optional | culture_notes | high | keep | evidence_fit | **이번 병합** | 入管法19条の2 1·2항, ISA Q&A Q3·16-9 페이지 일치. 사실은 맞으나 원안(「법률로 금지」 + 「필수처럼 답하지 말라」)은 코치를 면접관과의 법률 논쟁으로 밀고 긍정적 답 행동이 없음. 「임의」 사실 + 답 행동(자격명·기한으로 답하고 요청 시 협력)으로 고침. |
| cn-t5-three-month-gap | culture_notes | high | keep | evidence_fit | **이번 병합** | 入管法22条の4 第6号(継続して三月…正当な理由がある場合を除く), 재량(取り消すことができる) 확인. 원안은 高度専門職2号 6개월 예외 누락 + 코치가 사용자의 취소 가능성을 판단하는 것(법률 자문)을 막지 않음 → 6개월 예외와 「판단하지 않는다」 문구를 넣어 고침. |
| cn-t5-hsp1-change-permit | culture_notes | high | keep | none | 다음 병합 후보 | ISA 高度専門職 페이지 주석(所属機関の変更を含む…在留資格変更許可申請が必要) 확인. 「허가 후 입사」는 합리적 추론. notes 5건 한도에서 대상이 가장 좁아(高度専門職1号 보유자만) 보류. |
| doc-t5-gijinkoku-requirements | doc_only | high | keep | none | doc_only | PDF 001366995(十年以上の実務経験 등)·001413639(従来より柔軟に判断, 相当程度の関連性 등) 확인. 허가 가능성 판정은 법률 자문이라 주입 안 함. |
| doc-t5-cefr-b2-2026 | doc_only | high | keep | none | doc_only | gijinkoku.html(令和８年４月１５日, ＣＥＦＲ・Ｂ２相当, ＪＬＰＴ・Ｎ２以上, 在留期間更新許可申請時) 확인. 신설 규정이라 주입 전 재확인. |
| doc-t5-notification-procedure | doc_only | high | keep | none | doc_only | 19条の16(十四日以内), 71条の5·71条の2(20만엔 이하 벌금), 전자 届出·증빙 불요, Q&A의 変更 불요(※1 갱신 주의), 사업주 노력의무, 갱신 3개월 전 접수 모두 일치. |
| doc-t5-hsp-points | doc_only | high | keep | none | doc_only | 2012-05-07 시작·70점, 5년·80점, 2호 무기한, 연수 300만엔·N1·N2 가점 10점 확인. |
| doc-t5-unrestricted-statuses | doc_only | high | keep | none | doc_only | 入管法19条(別表第一만 제한), qaq5(居住資格, 無期限) 확인. R1T4-15와 일치. |
| doc-t5-interview-question-table | doc_only | medium | keep | none | doc_only | 질문·예문은 자작, 빈도 미확인 명시. 민간 2건(R1T5-29, R1T5-31) 실재·20자 일치 0. R1T5-31과 厚労省 Q&A 충돌은 §3대로 공적 규범 우선. enum 추가 없음. |
| doc-t5-terms-egov-subdomain | doc_only | high | keep | none | doc_only | e-gov.go.jp/terms에서 「e-gov.go.jp及びそのサブドメインのWebサイト」·PDL1.0 확인 → laws.e-gov.go.jp 출처의 약관 미확인 건 해소. 아래 §7에 반영. |

## 5. T2a — 中途 선고 플로우·단계별 평가축 (13건)

| id | 슬롯 | 신뢰도 | 판정 | 실패 관점 | 처리 | 사유 |
|---|---|---|---|---|---|---|
| stage-casual-mendan | question_taxonomy | medium | keep | none | **이번 병합** | マイナビ(選考ではない·내용 공유)·type(合否判定 아님, 初回面接に近い 사례) 토큰 확인. 기존 stages와 중복 없음. |
| stage-niji-mensetsu | question_taxonomy | medium | keep | none | **이번 병합** | ビズリーチ 2차 칼럼(回答数210, 50.95%, 35.24%, 「2次が最終の場合もある」)·リクルート 보조 근거. 2차 고유 평가축 근거는 약하나 enum 추가에는 문제 없음. |
| stage-offer-mendan | question_taxonomy | medium | keep | none | **이번 병합** | doda(オファー面談·処遇面談·労働条件通知書)·マイナビ(条件面談·承諾前) 확인. T2b 규칙의 사용 장면. |
| str-tenshoku-reason-forward | correction_rules | medium | keep | none | 다음 병합 후보 | 2割/8割 구조(R1T2a-21), JAC(同様の理由で退職に至る可能性, 長く勤めてくれる人材か) 확인. 20자 대조 일치 0. T4 초안 `t4-leave-reason-positive`와 겹쳐 병합 때 하나로 정해야 함. |
| str-casual-interest | correction_rules | medium | keep | none | 다음 병합 후보 | マイナビ 원문(カジュアル面談を受けようと思った理由などについて聞かれることがあります, 내용이 채용 담당자에게 공유) 확인. 예문 표현은 02_로컬원본에 없음. |
| str-final-career-vision | correction_rules | medium | keep | none | 다음 병합 후보 | ビズリーチ 설문 최종 1위(향후 커리어), リクルート, doda(入社意欲や長期的な活躍への期待) 확인. 「1〜3年」은 출처 없는 설계값. C2 「頑張ります」와 대상이 달라 중복 아님. |
| note-stage-axes | culture_notes | medium | keep | none | 다음 병합 후보 | R1T2a-10/12/13/14 원문 확인. md가 「2차가 최종인 경우는 노트 1로 보완」이라 했지만 노트에 그 내용이 없음(실패 아님). 보완판(+22자)은 사람이 선택. |
| note-casual-mendan | culture_notes | medium | keep | none | 다음 병합 후보 | マイナビ·type(「実施企業によって位置づけには差があります」) 확인. `str-casual-interest`와 일부 겹치나 질문 생성 맥락용. |
| note-final-consistency | culture_notes | medium | keep | none | 다음 병합 후보 | doda 「一貫性」, ビズリーチ 최종 5위 「キャリアの一貫性」 확인. 기존 팩 노트(면접관 측 정보)와 대상이 달라 중복 아님. |
| note-reference-check-2nd-merge | culture_notes | medium | keep | none | 다음 병합 후보 | doda(最終面接の前後から内定を出す前), マイナビ(必ず求職者の同意を得たうえで, 前職や取引先) 확인. 동의는 관행이며 법적 의무로 읽으면 안 됨(5条の5 동의는 예외 조항, 告示141号 구판 대상에 求人者 없음). 각주는 R1T2a-19/20만 남길 것. 원래부터 2차 병합 대상. |
| doc-scout-reply-structure | doc_only | medium | keep | none | doc_only | R1T2a-23/24/25 확인(감사·관심·다음 단계·후보 일시, Re: 유지, 24時間以内). 쓰는 메일이라 correction_rules 대상 아님. 「候補日2〜3件」은 설계값(출처는 「복수」). |
| doc-probation-legal | doc_only | high | keep | none | doc_only | 労基法21조 단서(十四日を超えて), 施行規則5条에 「試」 0회, 中労委 PDF(三菱樹脂·客観的に合理的), JILPT(65.7%, 3ヵ月程度) 확인. R1T2a-28(新潟)은 열지 않았으나 payload가 쓰지 않음. |
| doc-aptitude-test | doc_only | medium | keep | none | doc_only | doda(Jina 경유)·マイナビ에서 能力検査·性格検査·書類選考 후 一次 전 토큰 확인. 면접 질문이 없어 stages 제외. |

## 6. SNS — 외국인 면접 실패 사례 반복 패턴 (14건, 내부 리서치)

| id | 슬롯 | 신뢰도 | 판정 | 실패 관점 | 처리 | 사유 |
|---|---|---|---|---|---|---|
| sns-note-final-direction | culture_notes | low (원 표기 medium) | keep | none | 다음 병합 후보 | 일본어 1문장 48자, 국적·식별정보 없음, 기존 노트와 중복 없음. 근거 3건에 에이전시 인접 출처가 있어 문서 자체 규칙상 low로 내림. |
| sns-note-credential-judgment | culture_notes | low | keep | none | 다음 병합 후보 | 44자, R1SNS-06(3건 중 1건 상업 블로그) low. 스테레오타입·PII·중복 없음. |
| SNS-P1 | failure_pattern | low (원 표기 medium) | keep | none | 비주입 참고 | 4건 일반화, 20자 일치 0. §4.1 슬롯이 아니라 주입 금지. 상업 출처 포함 → low. |
| SNS-P2 | failure_pattern | low (원 표기 medium) | keep | none | 비주입 참고 | S-forum-a·S-forum-b·S-blog-b. 코치 발화가 기존 `str-ketsuron`/`str-answer-first`와 같아 주입 가치 없음. 상업 출처 → low. |
| SNS-P3 | failure_pattern | low | keep | none | 비주입 참고 | 2건. 「この求人の幅」 → 「この求人の年収レンジ」로 고침. |
| SNS-P4 | failure_pattern | low (원 표기 medium) | keep | none | 비주입 참고 | R1SNS-04. S-blog-a 사례는 바르게 제외. 에이전시 인접 출처 → low. |
| SNS-P5 | failure_pattern | medium | keep | none | 비주입 참고 | 비상업 3건이라 medium 유지. 「대부분」을 절대 표현으로 바꾼 코치 발화를 「多いです」로 완화. |
| SNS-P6 | failure_pattern | low | keep | none | 비주입 참고 | R1SNS-06 low. 4문형 구조 재사용. |
| SNS-P7 | failure_pattern | low | keep | none | 비주입 참고 | 2건. 텍스트 코치는 전달 요소를 측정할 수 없어 doc_only. |
| SNS-P8 | failure_pattern | low | keep | none | 비주입 참고 | 출처의 출신 프레임(「서구식 사고방식」(보고자 표현을 우리말로 바꿈))을 행동 기준으로 바꿔 스테레오타입 관점 통과. 양방향 보고(과한 주장 / 과한 신중)인데 코치 발화가 순응 쪽만 밀어 균형 있게 고침. 치환 테스트 「pass」는 근거 없는 단정이라 「설계 판단, 미검증」으로 바꿈. |
| SNS-P9 | failure_pattern | low | keep | none | 비주입 참고 | 3건. 「6개월」 수치는 단일 출처라 제외. 14일 届出는 공적 R1T5-11로 교차 참조. |
| sns-doc-salary-overpaid | doc_only | low | keep | none | doc_only | T2b 담당자용 병합 메모(R1SNS-03). |
| sns-doc-corroborate-t4 | doc_only | medium | keep | none | doc_only | 유효한 보강 메모이나 R1SNS-09(low)·R1SNS-02(상업)보다 높게 표기됨. 각주를 low/일화로 표시해 T4 후보의 신뢰도를 올리지 않을 것. |
| sns-doc-debrief-feature | doc_only | medium | keep | none | doc_only | 제품 제안(F6 확장). 비상업 3건 근거. 이 작업 범위 밖, 코드 변경 없음. |

## 7. 유닛별 문서 이슈 (doc_issues, 원 문서는 수정하지 않음)

이 절의 지적은 R1 원 문서(`R1-*.md`, `*.claims.json`)에 아직 반영되지 않았습니다. 수정은 각 유닛 담당 또는 다음 패스의 몫입니다.

### C2
1. c2-06 key_tokens의 「身内」는 NINJAL 페이지에 없음(원문은 「よその人に対しても…『社長様が到着なさる』」). 내용은 정확, 토큰만 수정.
2. 미확인 절의 「부장님→部長様 한국어 기제 미확인」에 대해 c2-06(NINJAL)이 부분 근거를 줌. 다만 이중경어 자체가 아니라 「외부인에게 자기 측을 높이는」 내용이라 인용에 주의.
3. マイナビニュース(S8)의 「社外の人と話すときは、身内である社長に『様』は付けません」은 ウチ 규칙(§2)의 두 번째 민간 출처인데 인용되지 않음.
4. c2-11 날짜가 2025-12-10/2026-09-16으로 섞임. 페이지 표기는 公開日 2026.09.16(기준일 2026-11-02 이전).
5. c2-18 약관 사슬(bunka.go.jp → 文部科学省ウェブサイト利用規約 → 公共データ利用規約 第1.0版, CC BY 4.0 호환)은 확인. 敬語の指針이 제외 별표(/b_menu/1366610.htm)에 없다는 점은 **미확인**.
6. `rep-yohi`의 md 신뢰도 「low~medium」은 과대(학습 약 1개월, n=2, 「成功与否」 1건).
7. doc_only 조사 전이 노트의 「〜を会う」「〜がなる」는 출처 없음.
8. md와 11개 원문의 20자 기계 대조 일치 0. PII 없음(鈴木·田中는 일반 예시명). 12개 URL 모두 응답 확인.

### T4
1. 요약 #8 「"尊敬する人物", "愛読書"는 일본 면접의 흔한 질문」은 각주 없는 사실 주장. 14事項 포함 부분만 R1T4-02로 확인됨.
2. 요약 #6·§E 「逆質問 단계별 차이·NG 목록은 민간 2개 출처 일치」는 과장(doda의 면접관 기술이 Recruit과 다르고 페이지 안에서도 불일치). NG 목록만 대체로 겹침.
3. 요약 #4 「어떤 공적 자료에서도 配慮事項으로 찾지 못했다」는 검색 범위가 없는 부재 주장이고, 「定着性」 의도 귀속은 JASSO 원문에 없음.
4. §A 정정 메모의 「다른 노동국 자료의 검색 스니펫에는 '약 절반'」은 URL 없는 언급. 특설 사이트 원문은 「多くを占めています」(비율 없음)이고 본문은 원문을 따름.
5. §C 말미 「告示276号 採用 조항은 구판 HTML(sisin01.html)과 문언이 같다」는 대조 근거 없음. 구판 HTML은 이번에도 열지 않음.
6. e-Gov 법령 조문(R1T4-09/12/13/19)은 API로 문언 확인. terms_url이 포털 약관(e-gov.go.jp/terms)이라 엄밀히는 미충족이었으나, T5(`doc-t5-terms-egov-subdomain`, R1T5-27)가 「서브도메인 포함 PDL1.0」을 확인해 **해소**됨.
7. R1T4-24 key_token 「会話や作文の試験」은 원문 후리가나 때문에 문자 그대로는 불일치(내용은 확인). 기계 토큰 검사에서 거짓 실패 가능.
8. JLPT·Recruit·doda의 terms_url 「미확인」은 「private(요약만, 약관 미확인)」으로 명시하는 것이 정확. 新潟労働局 jsite는 private로 바르게 분류.
9. R1T4-22 キャリタス 수치(約７割/約９割)는 JASSO PDF에서 확인했으나 조사 2건이 섞이고 분모 미확인(문서가 명시하므로 오류 아님).
10. PII 없음. Recruit·JASSO·厚労省 원문과 20자 창 대조 최대 12자(전재 0). doda는 WebFetch 요약만 받아 원문 대조 못 함.
11. URL 전부 실재·열람. 816자 예산 재현됨(id 제외, categories 포함).

### T2b
1. 요약 4·§D·R1T2b-20의 「'귀사 규정에 따르겠다'는 보조 문장으로만」은 overclaim(리쿠르트·JAC 모두 단독 답을 인정). 「柔軟」은 리쿠르트 원문에 없음.
2. §D·R1T2b-21/22: 리쿠르트의 住宅ローン 근거 예시가 JAC의 「개인 사정 NG」와 정면 충돌하는데 문서는 같은 구조를 권한다고만 적음. 충돌 메모 필요.
3. R1T2b-22·23은 두 출처를 근거로 들면서 source_url은 리쿠르트 1개. JAC URL 분리 필요.
4. key_tokens 불일치: R1T2b-20(現年収·最低希望額 → 원문 現在の年収/最低希望年収), R1T2b-27(他社選考中 → 他社の選考), R1T2b-29(担当エージェント → 転職エージェントの担当者), R1T2b-14(1か月 → 1ケ月), R1T2b-15(後任 → 新しい人が見つかるまで). 내용은 뒷받침되나 기계 검사 실패.
5. culture_notes 5(`cn-t2b-05`)의 「引き継ぎ」 근거 각주 누락 → R1T2b-30 또는 31 추가.
6. 「주입 문자 합계 892자」는 고친 문안 기준 901자. 예산 안이지만 숫자 갱신 필요.
7. e-Gov 약관 단서는 문서에 공개되어 있음(T5로 해소). URL 위조·PII 없음. 일본어 20자 이상 구간 14개를 민간 원문 10건과 대조해 일치 0.

### T5
1. R1T5-01 토큰 「別表第一の二」가 gijinkoku.html에 없음. 「入管法別表第一」로 바꾸거나 법령 XML로 확인.
2. R1T5-07 토큰 「活動全体として捉えて判断」은 원문(在留期間中の活動を全体として捉えて判断)과 문자 불일치. 토큰 수정.
3. R1T5-15 토큰에 원문의 괄호 「」가 빠짐(「在留資格変更許可申請」は不要（※１）). 토큰 수정.
4. R1T5-18 토큰 「１，6００円」 전각·반각 혼용. NFKC 후에만 일치.
5. 요약 6 「한국인 후보자의 通訳·翻訳 직무 전환에 직접 걸린다」는 출처 없는 문장. 「누구든 언어 업무로 옮기면 적용」으로 중립화 필요.
6. 요약 2·§2와 원 노트 2가 22条の4의 高度専門職2号 6개월 예외를 빠뜨림 → 고친 문안에 반영.
7. §6 표의 HSP1 届出: 19条の16 1호(HSP1 ハ)·2호(HSP1 イ·ロ) 구분이 R1T5-11에는 있으나 §4에 반영 안 됨(경미).
8. R1T5-14의 취소 주체 「法務大臣」 문언은 법령 XML과 대조하지 못함(후보에 영향 없음).
9. 권리·PII·URL 문제 없음. 공적 14개 URL 200 응답, terms_url(ISA index2, e-gov terms) PDL1.0. 민간 2건은 private·약관 미확인 표기(사실 요약용으로 허용), 20자 일치 0. 예문은 가상 날짜뿐.

### T2a
1. md 37행 표 「二次가 최종인 기업도 많음」, 16행 요약 2 「흔합니다」, 101행 「노트 1로 보완」은 과잉 주장 + 끊긴 상호참조. ビズリーチ 원문은 「2次面接が最終面接の場合もある」뿐이고 노트 1 본문에 보완 내용이 없음.
2. 16행 요약 2의 「코치는 단계 이름보다 면접관의 층으로 답의 중심을 바꿔야 한다」는 설계 판단인데 「해석」 표시가 없음.
3. key_tokens 불일치: R1T2a-19 「内定前」(원문 内定を出す前), R1T2a-20 「推薦者」(원문 推薦する/リファレンス先, 2名～3名).
4. 128행 노트 4가 [R1T2a-07][R1T2a-08]을 각주로 쓰지만 B절(58행)은 이 둘이 求人者 동의 의무 근거가 아니라고 스스로 적음. 각주는 19·20만 남기거나 「공적 근거는 목적 제한까지」를 본문에 명시.
5. 146행 「전재 검사 범위: ビズリーチ 칼럼만」은 이제 사실과 다름. 검증자가 md 일본어 구간 20개 + 후보 문자열을 민간 16페이지(doda 4곳 Jina 경유)·JILPT·中労委·告示141 텍스트와 대조해 일치 0. 갱신 권장.
6. R1T2a-28(niigata-elcc.mhlw.go.jp)은 검증자가 열지 않음. private·약관 미확인 라벨은 맞으나 「1년 초과 시용기간 무효 재판례」는 원문 미확인 그대로.
7. PII·개인 사례·창작 URL 없음. 예문 표현은 02_로컬원본에 없음. 공적 terms_url 유효(kouseisaiyou 푸터 → mhlw.go.jp/chosakuken). 21개 URL 응답 확인.

### SNS
1. 신뢰도 규칙 적용 불일치: 「출처 한쪽이 상업 코칭·에이전시면 low」인데 P6만 내리고 P1·P2(S-blog-b 상업)·P4(S-blog-a 에이전시 인접)는 medium 유지. 원자료 색인 기준으로 medium 자격은 P5뿐. → `failure-patterns-r1.json`과 이 로그는 low로 고쳐 기록. md 요약 6과 culture_notes #1 태그는 미수정.
2. SNS-P8 치환 테스트 「일본인 후보자가 같은 답을 해도 같은 우려를 산다」는 출처 없는 사실형 주장 → 「설계 판단, 미검증」으로 표시.
3. SNS-P4 상황의 「본인은 분위기가 좋았다고 느낀다」는 R1SNS-04에 없는 세부. 삭제하거나 claim에 추가.
4. SNS-P6 교훈의 「'모범답안을 연습하라'와 '외운 답은 무너진다'가 둘 다 보고됨」은 R1SNS-06에 없음. claim에 추가하거나 해석 표시.
5. SNS-P1 상황의 「돌려 쓴 경우가 많다」는 claim(「반복 보고」)보다 강함. 「반복 보고된다」로.
6. md와 출처 표에 **레포 밖 세션 스크래치패드의 절대경로**(로컬 사용자명 포함, 휘발성 위치)가 들어 있음. 공개 레포에 올리기 전에 「레포 밖 내부 경로」 같은 자리표시로 바꿔야 함. (이 로그에는 경로를 옮겨 적지 않음.)
7. 전재 없음(원자료와 20자 연속 일치는 경로 문자열뿐). md·claims.json에 PII·핸들·URL 없음. kind=private의 terms_url=null은 맞음.
8. 계약: failure_pattern(P1~P9)은 §4.1 슬롯이 아님. 문서는 「주입 대상 아님」으로 바르게 표시했고, 병합본 `jp-draft-v2.json`에서도 제외함(별도 `failure-patterns-r1.json`).
