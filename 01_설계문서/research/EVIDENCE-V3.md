# EVIDENCE-V3 — 모범답안 코칭 근거 3차 수집과 일관성 설계

작성 2026-11-03. 요청: 「모범답안으로 뽑아 주는 코칭 근거 데이터를 더 조사해 규칙과 근거를 쌓을 것. 일관성 있는 대답이 최우선.」
산출물: 이 문서와 `jp-draft-v3.json`(초안 팩). `packs/jp.json`과 코드는 수정하지 않았습니다. 병합은 사람이 승인한 뒤에만 합니다(PRD §4.1).
원 노트(출처 URL 전체, 의역 원문)는 레포 밖 `BuiltWithClaude-2026-private/internal-docs/evidence-v3-raw/{official,jobsites,foreigner,consistency}.md`에 있습니다.

## 0. 결론 먼저

1. 규칙만 늘려서는 일관성이 오르지 않습니다 [High]. 지금 script 프롬프트에 들어가는 팩 데이터는 `answer_structure`, `correction_rules`, `model_answer_format.duration_seconds` 세 가지뿐입니다(`lib/script.js`). `culture_notes`는 질문 생성(`lib/questions.js`)에만 들어갑니다. 녹화된 실제 출력 3건은 같은 사용자 답변에서 나왔는데도 문장 수가 7·4·5개로 달랐습니다. 復唱 첫 문장도 2가지 형태로 나왔습니다. 팩 예문(「〜、ですね。」)을 따른 출력은 0/3이었습니다.
2. 그래서 이번 초안의 중심은 새 규칙 18개가 아닙니다. 중심은 **`answer_templates`(질문 유형별 4단 골격과 예문) + `consistency`(길이 밴드, 단계별 문장 수, 문말 어휘, 빈칸 라벨)**입니다. 이 둘은 코드가 읽어서 프롬프트에 넣고 게이트로 검사해야 효과가 있습니다. 데이터만 병합하면 출력은 바뀌지 않습니다.
3. 「1분 ≈ 300자」는 상업 출처 3곳(doda, マイナビ転職エージェント, リクルートエージェント)이 각각 따로 제시합니다. 하지만 4文型으로 짧은 문장을 쓰면 7문장으로도 200~240자(35~42초)에 그칩니다. 제가 손으로 쓴 예문 9개로 측정한 결과입니다. 그래서 길이 밴드는 **200~300자(추정 35~60초)**로 정했습니다. 팩의 「約60秒」는 상한으로 읽습니다 [Medium].

## 1. 방법

- 레인 4개를 병렬로 돌렸습니다. 각 레인은 실제로 연 페이지만 출처로 쓰고, 주장마다 ≤1문장 의역을 남겼습니다. 원문 전재는 없고, 예문은 전부 직접 썼습니다.
  - **official**: 文化審議会「敬語の指針」(2007), 厚生労働省 공정채용 사이트·告示614号·均等法Q&A, 出入国在留管理庁 資格外活動.
  - **jobsites**: doda, リクルートエージェント, マイナビ(転職·エージェント), JAC, エン転職, ビズリーチ. 같은 그룹은 발행처 1곳으로 셉니다.
  - **foreigner**: 학습자 연구(北大·阪大 박사논문, 日本語教育, 韓国日本言語文化学会), JASSO 취업 가이드, 문화청 여론조사, ハローワーク 자료, 상업 기사.
  - **consistency**: Anthropic 문서(structured outputs, effort, Sonnet 5.5 프롬프팅, 일관성·환각·평가 가이드), 논문 3편(초록만), 레포 녹화 출력 자체 측정.
- 신뢰도 기준은 R1과 같습니다. 공적·학술 1차 출처는 High, 독립 상업 출처 2곳 이상 일치나 학술 출처의 외삽은 Medium, 상업 출처 1곳은 Low입니다.
- 출처 라이선스 구분(kind)은 R1 기준을 따랐습니다. 문화청·후생노동성 자료는 public(PDL1.0 호환, c2-18), 출입국재류관리청은 public이지만 라이선스 종류는 미확인입니다. JASSO는 private(R1T4-23), 상업 기사·논문·API 문서도 private입니다. private 출처는 사실만 쓰고 표현은 직접 고쳐 썼습니다.
- 중복 판정은 두 단계로 했습니다. 먼저 후보끼리 비교하고, 다음으로 `packs/jp.json`의 규칙 18개·노트 8개, R1 후보(SUMMARY §6), D2와 비교했습니다. 기존 id와 겹치면 기존 것을 유지하고 근거만 더했습니다(`evidence_map`).
- 실호출(크레딧)은 0회입니다. 측정은 `public/demo/demo-{ko,ja,en}.json`과 `public/tts-timing.js`의 `estimateSeconds`로 했습니다.

## 2. 집계

| 레인 | 수집 | 후보끼리 통합(흡수됨) | 기존 id에 근거 보강 | 탈락 | 유지(신규) |
|---|---|---|---|---|---|
| official | 17 | 3 | 1 | 0 | 13 |
| jobsites | 18 | 1 | 1 | 1 | 15 |
| foreigner | 16 | 3 | 4 | 0 | 9 |
| consistency | 14 | 2 | 0 | 0 | 12 |
| **합계** | **65** | **9** | **6** | **1** | **49** |

유지 49건은 초안에서 이렇게 배치했습니다. 신규 correction_rules 18개, 신규 culture_notes 3개, answer_templates 10종(후보 14건 흡수), consistency 데이터 6건, 코드·평가 전용 8건(`consistency.enforcement`에 id와 출처만 기록)입니다. 출처는 55개를 `sources`에 등록했고, 모두 한 번 이상 참조되는지 확인했습니다.

### 2.1 후보끼리 통합한 9건

| 흡수된 후보 | 흡수한 항목 | 이유 |
|---|---|---|
| rep-boku-jibun (foreigner) | **rep-ichininsho** (← rep-boku) | 같은 교정입니다. 범위는 foreigner 쪽을 썼습니다(재귀 용법 「自分で」와 rep-jibunteki 제외). 출처는 4개를 합쳤습니다. |
| rep-otsukare (foreigner, Low) | **rep-gokurou-otsukare** (← rep-gokurousama) | ご苦労様 부분은 指針 근거라 High, お疲れさま 부분은 상업 1곳이라 Low입니다. 신뢰도를 나눠 표기했습니다. |
| cc-keigo-no-false-niju | rep-niju-keigo의 pattern 괄호 | 허용형(お伺いする・て연결)을 규칙 안의 제외 조건으로 넣었습니다. 팩 관례(「ちょっと（〜以外）」)와 같은 방식입니다. |
| cc-o-go-own-action | rep-o-suru-for-other의 pattern 괄호 | 자기 행위의 「ご説明いたします」를 제외 조건으로 넣었습니다. 「私のお考え」형 지적은 면접 빈도가 낮아 규칙으로 만들지 않았습니다. |
| cc-ukagau-mairu | rep-kenjou1-for-other의 pattern 괄호 | 「御社に伺います」 오탐 방지만 반영했습니다. 자기 측에 「伺う」를 쓰는 오용은 면접 빈도가 낮아 뺐습니다. |
| cn-fukusho-short | cc-fukusho-template + cn-kikikaeshi | 「짧게 1구」는 復唱 고정형에, 「모르면 확인」(JAC)은 되묻기 노트에 넣었습니다. |
| cc-length-band | consistency.length | 길이 후보 3건(300자, 자체 추정기, JASSO 1분)을 하나의 밴드로 합쳤습니다(§3.3). |
| cc-60sec-one-point | consistency.length + str-number 근거 | JASSO의 「1분, 어필 포인트 하나」를 두 곳에 나눠 썼습니다. |
| cc-sentakushi-template | consistency.closing_forms.options | 충돌 해결 결과, 判断·状況 유형의 마무리 형태로만 씁니다(§3.1). |

### 2.2 기존 id에 근거·범위만 보강한 6건 (팩 본문은 그대로)

| 후보 | 기존 id | 내용 | 신뢰도 |
|---|---|---|---|
| cc-one-evidence | str-number | 근거와 강점은 하나로 좁힌다(JAC·マイナビ·リクルート·JASSO) | High |
| cc-ketsuron-evidence | str-ketsuron | 서론이 길면 무엇을 말하려는지 모르겠다는 모어화자 평가(1999, 의뢰 롤플레이) | Low |
| cc-nanka-evidence | del-nanka | 필러 「なんか」만 대상입니다. 「何か(なにか)」와 예시의 「〜なんか」는 제외(범위 제안) | Medium |
| cc-chotto-sukoshi | del-chotto | 양·정도의 「ちょっと」는 삭제하지 않고 「少し」로 바꿉니다. 현 pattern 「形容詞として使う場合以外」로는 부사 「ちょっと時間がかかりました」가 삭제돼 뜻이 바뀝니다. | Medium |
| cc-omoimasu-form | rep-omoimasu | 2회 이상 연속, 또는 과거 사실에 붙은 경우만 지적합니다. 학습자와 모어화자의 사용 빈도는 차이가 없습니다(영문 초록만 확인). | Medium |
| cc-sasete-itadaku-permission | rep-sasete-itadaku | 허가를 실제로 구하는 「〜させていただけますか」는 제외합니다(指針【18】, c2-01·c2-02). | High |

이 6건은 `jp-draft-v3.json`의 `evidence_map`에 `scope_proposal`/`evidence`로 적었습니다. 기존 규칙 문구를 바꾸는 일은 사람이 승인한 뒤에 합니다. del-chotto와 rep-omoimasu의 범위 수정은 채점이 회차마다 흔들리는 원인을 줄이므로 우선순위가 높습니다.

### 2.3 탈락 1건

| 후보 | 이유 |
|---|---|
| cn-zairyu-proactive (jobsites, Medium) | 대부분 이미 있는 데이터와 겹칩니다. 재류 사실은 str-visa-facts와 노트 5·8, 「長く働きたい」만으로는 부족하다는 점은 cc-shibou-ng, 왜 일본인지는 R1 후보 str-why-japan-axes에 있습니다. 남는 고유 부분(「국적을 숨기지 않는다」)은 상업 출처 1곳(エン転職)뿐이고, JAC 근거는 귀국자 대상이라 외국인 지원자에게 그대로 옮길 수 없습니다. |

공식 출처와 모순되는 후보, 출처가 없는 후보는 0건이었습니다. 다만 레인끼리 판단이 엇갈린 곳은 아래 §3에서 정리했습니다.

## 3. 충돌과 해결

### 3.1 4단째 「選択肢」: 모든 질문에 같은 형태로 적용할지
- jobsites(cc-step4-by-category, 4개 발행처): 자기소개·전직 이유·지망 동기·강점·약점·성공·실패·매니지먼트 질문은 모두 **입사 후 공헌·활용 방안**으로 맺습니다. 선택지를 되돌려 주며 끝내라는 출처는 하나도 없었습니다 [High].
- consistency(cc-sentakushi-template): 실제 출력 3/3이 이미 「AとBのどちらから…ましょうか。」였으므로, 이 형태 하나로 고정하자는 제안입니다 [Medium].
- **해결**: `answer_structure`는 손대지 않습니다. 대신 `answer_templates`의 유형마다 `closing`을 정해 둡니다(options / contribution / improvement / question). 判断·状況(팩 예문 「見積もりがずれたときの判断」 유형)만 options를 쓰고, 나머지는 contribution을 씁니다. 약점은 improvement, 역질문은 question입니다. 같은 유형에서는 항상 같은 형태로 맺으므로 일관성 목표에도 맞습니다.
- **사람 승인 필요**: 이 해결은 사용자 노하우인 4文型의 4단째 「相手が判断できる選択肢で返す」를 질문 유형에 따라 덮어씁니다. D3의 결론도 4文型은 공적으로 검증된 형식이 아니라 이 도구의 설계 가설이라는 것이었습니다.

### 3.2 復唱
- 復唱을 표준 서두로 권하는 전직 사이트는 없었습니다. JAC 1곳이 「의도를 모를 때 확인한다」는 조건부로만 언급했습니다 [Medium].
- 자기소개는 의뢰형 질문이라 復唱 대신 이름을 밝히는 것으로 시작합니다(5개 발행처 골격 모두 이름으로 시작) [High].
- **해결**: 復唱은 사용자 노하우이므로 유지합니다. 형태는 「〈질문 요지 ≤20자〉、ですね。」 하나로 고정합니다. 자기소개는 「［ここに名前］と申します。」, 역질문은 復唱 없음으로 둡니다(`consistency.fukusho_form.except`).

### 3.3 길이
- consistency 레인은 「1분 300자」가 검색 요약에만 있다며 채택하지 않았습니다. jobsites 레인은 doda·マイナビ·リクルート 원문을 직접 열어 확인했습니다. 그래서 채택하되, 상업 출처이므로 [Medium]으로 둡니다. NHK 등 1차 발화 속도 자료는 여전히 확보하지 못했습니다.
- 자체 측정(제 계산 방식: NFKC, 공백 제외, ［］는 내용째 1자):
  - 녹화 출력 ko/ja/en은 220/163/138자, 7/4/5문장, 추정 40.6/31.5/29.3초였습니다. 문말 닫힌 어휘 정규식은 16/16 문장이 통과했습니다. 復唱은 「〜についてお答えします。」1건, 「〜についてですね。」2건으로 갈렸습니다.
  - 초안 예문 9개(역질문 제외)는 4文型 6~7문장으로 썼을 때 202~237자, 35~42초였습니다. 처음 4문장으로 썼을 때는 84~123자, 15~23초였습니다.
- **해결**: 목표 250자, 밴드 200~300자, 게이트 35~60초로 정했습니다. 상한은 출처의 1분과 팩의 約60秒입니다. 하한은 리크루트의 「30초에 끝나는 지망 동기는 요소가 부족할 수 있다」를 피하는 선입니다. 문장 수는 復唱 1, 結論 1, 基準 1~4, 締め 1~2, 합계 4~7입니다. 근거는 하나지만 그 하나를 상황→행동→결과로 설명하려면 여러 문장이 필요하기 때문입니다. 수치는 모두 [Low]이며 N=5 평가 후 다시 정합니다.

### 3.4 기타
- 역질문이 없을 때: doda는 「반드시 질문한다」, JAC는 「감사와 입사 의욕이면 된다」고 합니다. 질문은 1개를 반드시 준비하고, 정말 없을 때만 감사+의욕+면접에서 해소된 점을 1문장으로 말하는 자작 절충안으로 고정했습니다 [Medium].
- rep-ryokai: 레인은 High로 냈지만 Medium으로 낮췄습니다. 근거가 JASSO와 상업 매체뿐이고 「敬語の指針」 같은 규범 근거가 없습니다. 「わかりました」는 출처 2곳이 있지만, 일상 응답에서 자연스러운 경우가 많아 오탐 위험이 있으므로 pattern에서 뺐습니다(제 판단).
- rep-go-sareru: 指針이 다른 해석(「御利用＋される」)도 함께 적고 있습니다. 규칙이 정답인지 자체가 흔들리면 채점 일관성을 해치므로 초안에는 넣되 **보류**로 표시했습니다.
- str-yesno-plus1과 str-number: 합치지 않았습니다. str-number는 근거가 여러 개이거나 숫자가 없는 경우(근거의 수·질), str-yesno-plus1은 근거가 0개인 단답이 대상입니다.
- str-desumasu-mix(review 규칙)와 cc-polite-endings(script 게이트): 같은 기준(문말 です·ます)을 사용자 답과 모범답안 양쪽에 적용합니다. 모순이 아닙니다.
- 팩 기존 예문 「止める・縮小する・続けるの3つで判断します。」에 숫자 3이 들어 있습니다. 모범답안이 이 「3つ」를 따라 쓰면 사용자 입력에 3이 없을 때 `groundedNumbers`에서 걸려 재시도가 납니다 [Medium, 미측정]. 초안 예문은 모두 숫자 대신 ［빈칸］이나 한자 수사를 썼습니다.

## 4. 유지 항목

### 4.1 신규 correction_rules 18개 (`jp-draft-v3.json`, `source_ids`·`confidence` 필드 추가)

| id | 요지 | 출처(발행처) | 신뢰도 | 1차 병합 |
|---|---|---|---|---|
| rep-ichininsho | 僕/俺/自分 → 私 | 敬語の指針【19】, JASSO, マイナビ転職, インターンシップガイド | High | **○** |
| rep-niju-keigo | 二重敬語 → 존경어 하나(정착형·て연결 제외) | 敬語の指針 p.30 (c2-03) | High | **○** |
| rep-ryokai | 了解しました → 承知しました | JASSO, マイナビ転職, タウンワーク | Medium | **○** |
| rep-o-suru-for-other | 상대 행위에 お(ご)〜する → お(ご)〜になる | 敬語の指針 p.25·【11】【12】 | High | 2순위 |
| rep-kenjou1-for-other | 상대 행위에 謙譲語 → 존경어 | 敬語の指針 p.30-31·【10】 | High | 2순위 |
| str-desumasu-mix | 문말 보통체 혼입 → です·ます | 上仲 2007, マイナビ転職, インターンシップガイド, 指針 p.20 | Medium | 2순위 |
| rep-gokurou-otsukare | ご苦労様/お疲れさま → よろしくお願いいたします/ありがとうございました | 指針【27】, マイナビ転職 | High/Low | 2순위 |
| rep-anata | 면접관에게 あなた → 주어 생략+존경어 | 指針【20】 | High | 3순위 |
| str-ask-fact-not-ability | 역질문에서 능력·의사를 직접 묻기 → 사실을 묻기 | 指針【30】 | High | 3순위 |
| rep-family-uchi | お父さん/お母さん → 父/母 | 指針 p.22·【22】 | High | 3순위 |
| rep-watashi-repeat | 반복되는 私は 삭제 | 鄭 2002 | Medium | 3순위 |
| str-filler-start | 첫머리 필러 → 復唱으로 시작 | 冷 2025, インターンシップガイド | Medium | 3순위 |
| str-yesno-plus1 | はい만 → はい+사실 하나 | 埼玉労働局 ハローワーク | Medium | 3순위 |
| rep-naruhodo | なるほど/確かに → おっしゃるとおりです | マイナビ転職, タウンワーク, インターンシップガイド | Medium | 보류 |
| rep-baito-keigo | 〜のほう/〜になります(접객어) | 文化庁 世論調査 H14, 上仲 2007 | Medium | 보류 |
| rep-moratte-ii | 〜てもらってもいいですか → 〜ていただけますか | 指針【33】 | Medium | 보류 |
| rep-go-sareru | ご〜される → ご〜いただく | 指針 p.25·【7】 | Medium | 보류(§3.4) |
| rep-mitaina | 〜みたいな/って感じ → 단정 | タウンワーク | Low | 보류 |

### 4.2 신규 culture_notes 3개

| 후보 id | 요지 | 출처 | 신뢰도 |
|---|---|---|---|
| cn-improper-question | 출생지·부모 직업, 또는 여성에게만 결혼·출산을 묻는 질문을 받으면 업무 이야기로 돌려 짧게 마치고, 필요하면 ハローワーク·雇用環境・均等部(室)에 상담 | 厚労省 公正採用 FAQ, 告示614号, 均等法Q&A | High |
| cn-side-job-permission | 부업 질문에는 자격별 사실(資格外活動許可 필요 여부)만 답하고 가부는 판단하지 않음 | 出入国在留管理庁 | High |
| cn-kikikaeshi | 못 알아들었으면 추측하지 말고 「〜というご質問でしょうか」로 확인 | 東京都教育委員会 評価表, JASSO, マイナビ転職, JAC | Medium |

### 4.3 answer_templates 10종 (팩 category와 대응, taxonomy는 변경 없음)

| 유형 | 팩 category | daily_questions | 맺음 | 출처 발행처 수 | 신뢰도 |
|---|---|---|---|---|---|
| 判断・状況(기본값) | 技術, マネジメント | [6] | options | 팩 원형 + Anthropic | Medium |
| 自己紹介 | 経歴・志望動機 | [0] | contribution | 5 (doda, エン, マイナビ, ビズリーチ, JAC) | High / 이름 시작 변형은 Medium |
| 転職理由 | 経歴・志望動機 | [1] | contribution | 4 | High |
| 志望動機 | 経歴・志望動機, 日本で働く理由・在留 | [2] | contribution | 5 | High |
| 強み | 経歴・志望動機 | [5] | contribution | 4 | High |
| 弱み | 経歴・志望動機 | [5] | improvement | 4 | High |
| 成功体験 | 経歴・志望動機, 技術 | [3, 4] | contribution | 3 | High |
| 失敗体験 | 経歴・志望動機 | — | contribution | 4 | High |
| マネジメント | マネジメント | — | contribution | 2 | Medium |
| 逆質問 | 逆質問 | [9] | question | 3 (+D2) | Medium |

- 유형마다 단계별 슬롯 설명(`steps`), 4필드 예문(`example`), NG 목록(`ng`), `source_ids`가 있습니다. 전직 이유의 NG는 cc-tenshoku-no-negative, 지망 동기의 NG는 cc-shibou-ng, 자기소개의 NG는 cc-jiko-no-prespend를 흡수한 것입니다. 전직 이유는 R1 후보 str-tenshoku-reason-forward(SUMMARY §6 #3)와 방향이 같아서, 규칙을 추가하지 않고 템플릿에만 넣었습니다.
- daily_questions 중 [7] 입사 후 반년, [8] 5년 후는 이번 출처로 만든 템플릿이 없습니다. 이 두 질문은 기본값인 判断・状況 유형으로 처리되며, 이 부분은 빈칸으로 남아 있습니다(R1 후보 str-final-career-vision이 관련).
- 예문은 전부 직접 쓴 가상 데이터입니다. 숫자는 쓰지 않았고, 문말은 모두 닫힌 어휘를 통과합니다. 빈칸은 3개 이하, 길이는 밴드 안에 들어오며, 기존 규칙(del-katachi 등)을 위반하지 않습니다. 검사 결과는 §7에 있습니다.

### 4.4 consistency 데이터 (후보 6건, 표 7행: 復唱·맺음 형태는 템플릿 후보에서 옴)

| 키 | 내용 | 신뢰도 |
|---|---|---|
| length | 목표 250자, 밴드 200~300자, 35~60초(estimateSeconds), 역질문 제외 | Medium(출처) / Low(수치) |
| sentences / points_count | 復唱1·結論1·基準1~4·締め1~2(합계 4~7), points 정확히 3개 | Low |
| ending_regex | `(です\|ます\|ました\|ません\|でした\|ですね\|ですか\|ますか\|ましょうか\|でしょうか)[。？]$` | Medium(녹화 16/16, 예문 65/65 통과) |
| fukusho_form / closing_forms | 復唱 고정형, 맺음 4종과 각각의 게이트 조건 | Medium |
| blank_labels / max_blanks | ［ここに数字/期間/相手/結果/名前/在留資格名/年月/就労できる範囲］, 최대 3개 | Medium |
| model_answer_exclusions | 본적·출생지·가족·주거·종교·지지 정당·사상·존경하는 인물·애독서는 사용자 답에 있어도 모범답안의 근거로 쓰지 않음(culture_note[3]의 답변 쪽 짝) | High |
| session_axis | 세션 안에서 「실현하고 싶은 것」 하나와 「강점」 하나를 고정하고 모든 유형의 모범답안을 거기서 만듦(cc-cross-answer, 6개 기사·4개 발행처). SUMMARY §6 #15 note-final-consistency와 같은 방향 | High(출처) / Medium(유지 방식) |

blank_labels는 기존 표기와 충돌합니다. `lib/lang.js`의 `TL.blank`는 「［ここに実績の数字］」이고, 팩 예문에는 「［いつ・何を］」「［就労できる範囲］」가 있습니다. 병합할 때 한쪽으로 맞춰야 합니다.

## 5. 일관성 우선: 무엇을 코드로, 무엇을 프롬프트로

원칙: 모델의 해석에 맡기는 부분을 줄이고, 판정은 코드가 합니다. Sonnet 5.5는 temperature·top_p·top_k를 보내면 400을 반환하고, prefill도 거부합니다. 그래서 「온도를 낮춰 일관성 확보」는 선택지가 아닙니다 [High, Anthropic 문서].

| 순서 | id | 어디서 | 무엇을 | 근거 | 신뢰도 |
|---|---|---|---|---|---|
| 1 | cc-retry-truncated | 코드(lib/script.js) | `askJson`의 `truncated`를 2회 예산 안의 실패 회차로 처리. 지금은 루프가 이 오류를 잡지 않아 재시도 없이 실패합니다(코드 확인). | Sonnet 5.5 프롬프팅 가이드 | High |
| 2 | cc-step-fields | 코드(스키마) | 모범답안 문자열 1개 → 팩 step key별 필수 필드 4개. 코드가 순서대로 결합합니다. 단계 누락이 문법상 불가능해집니다. | structured outputs | Medium |
| 3 | 템플릿 선택 | 코드(스키마)+프롬프트 | 스키마에 `template` enum(answer_templates의 키)을 추가해 모델이 고른 유형을 명시하게 하고, 코드가 그 유형의 closing 게이트를 적용합니다. 질문 category를 script 입력에 넘기면(cc-category-skeleton) 후보를 좁힐 수 있습니다. | increase-consistency | Medium(설계) |
| 4 | cc-fewshot-exemplars | 프롬프트 | answer_templates의 예문 중 3~5개를 `<examples>`로 시스템 프롬프트 앞부분에 고정합니다(캐시 대상, 약 2k 토큰). | prompting best practices | Medium |
| 5 | 게이트 묶음 | 코드 | 문말 정규식, 復唱 「、ですね。」, closing 조건, 문장 수, 길이 밴드, 빈칸 라벨·개수, points=3. 위반하면 기존 2회 예산 안에서 1회 재시도합니다. | structured outputs(길이·개수는 스키마로 강제 불가) | Medium |
| 6 | cc-enum-case | 코드(lib/review.js) | answers_question과 rule_id를 대소문자 정규화합니다. | structured outputs | High(근거) / 빈도 미확인 |
| 7 | model_answer_exclusions, session_axis | 프롬프트 | script 시스템 프롬프트에 두 줄을 추가합니다. session_axis는 세션 JSON에 축 하나를 저장해야 합니다. | 厚労省, 전직 사이트 4곳 | High / Medium |
| 8 | cc-effort-think-line | 평가 후 결정 | effort medium vs high, 「Think the problem through before you answer.」 한 줄. 결과가 나오기 전에는 바꾸지 않습니다. | Sonnet 5.5 가이드, effort | Medium |
| — | cc-no-sampling-params | 코드(회귀 방지) | sampling 파라미터와 prefill을 금지합니다. 현재 코드는 이미 쓰지 않습니다. | Sonnet 5.5 overview, Opus 5.5 migration | High |

`correction_rules`는 `formatRules`를 거쳐 질문·script·review 세 프롬프트에 모두 들어가고, review 스키마 enum도 됩니다. 그래서 코드·평가 제약은 규칙 표에 넣지 않고 `consistency`에 따로 두었습니다.

### 5.1 평가 설계 (cc-eval-n5)

- 입력: 가상 데이터 10건. 템플릿 유형 3종(判断・状況, 志望動機, 失敗体験)×3건, 한국어 답변 1건입니다. 숫자가 있는 답, 없는 답, 질문에서 벗어난 답을 섞습니다.
- 실행: 입력마다 script를 5회 돌리고, 각 출력을 Opus review로 구조 채점합니다(생성 모델과 다른 모델로 채점). 회차마다 `msg.model`, `stop_reason`, 재시도 여부를 기록합니다. fallback으로 다른 모델이 답한 회차는 제외하고 그 개수를 따로 적습니다.
- 지표와 임계값(임계값은 전부 [Low]이며, 첫 A 실행 후 다시 정합니다):

| 지표 | 정의 | 제안 임계 | 근사 기준선(녹화 3건) |
|---|---|---|---|
| M1 1차 통과 | 게이트 전체를 첫 호출에서 통과 | ≥ 45/50 | — |
| M2 구조 합의 | review steps 4개 모두 present인 회차 | 5/5 | — |
| M3 문장 수 합의 | step별 문장 수가 최빈값과 같은 회차 | ≥ 4/5 | 4~7문장으로 흔들림 |
| M4 길이 | 밴드 안 5/5, 변동계수 | ≤ 10% | 29~41초(±18%) |
| M5 본문 유사도 | 쌍별 정규화 Levenshtein(NFKC, ［］→□), step 필드별 | 기준선 +0.15 | 0.26~0.44 |
| M6 빈칸 | 라벨 Jaccard / 숫자 근거 위반 | ≥ 0.6 / 0 | — |
| M7 문말 | 닫힌 어휘 위반 | 0 | 0/16 |
| M8 템플릿 합의 | `template` enum 최빈값 일치 | 5/5 | — (신규) |

- 채택 규칙: 현 코드(A)와 후보(B)를 같은 입력으로 돌려, B가 어느 지표에서도 A보다 나쁘지 않을 때만 채택합니다.
- 비용(PRD 실측 단가 Sonnet script ≈ $0.037/회, Opus review ≈ $0.031/회): A 또는 B 한쪽은 10×5×0.068 ≈ $3.40, A/B 둘 다 ≈ $6.80(세션 원가 $0.26의 약 26회분)입니다. Batch API(50% 할인)에서 structured outputs와 fallback이 어떻게 동작하는지는 확인하지 않았습니다.

## 6. 1차 병합안 (PRD §4.1 예산: 규칙 3·노트 5·1000자)

- 규칙 3개: rep-ichininsho(153자), rep-niju-keigo(198자), rep-ryokai(123자)
- 노트 3개: cn-improper-question(95자), cn-side-job-permission(84자), cn-kikikaeshi(61자)
- 합계 714/1000자. 고른 기준은 공적·다출처, 한국어 화자에게 잦은 오류, 오탐 범위가 명시된 것입니다.
- 주의: 지금 코드에서 `culture_notes`는 질문 생성 프롬프트에만 들어갑니다. 그래서 노트 3개를 병합해도 모범답안·채점의 일관성은 바뀌지 않습니다. 1차 병합에서 효과가 있는 것은 규칙 3개뿐입니다. 노트는 script가 노트를 읽게 되거나 내용이 consistency·템플릿으로 옮겨진 뒤에야 모범답안에 반영됩니다. 또 질문 생성기가 cn-side-job-permission을 보고 부업 질문을 만들 가능성이 있으므로, 병합 후 질문 생성 결과를 한 번 확인해야 합니다 [Medium, 미측정].
- 예산 밖에서 별도로 승인이 필요한 것: `answer_templates`와 `consistency`는 새 키라서 §4.1 예산 규칙이 상정하지 않은 대상입니다. 둘 다 코드 변경(§5)과 함께 들어가야 효과가 있으므로, 「1차 병합」이 아니라 「코드 작업 PR」 단위로 승인받는 것을 권합니다. §2.2의 범위 수정 6건(특히 del-chotto, rep-omoimasu)도 기존 규칙 문구를 바꾸므로 따로 승인이 필요합니다.

## 7. 검증 결과

- 자체 검사(스크래치 스크립트, 레포 밖)는 OK입니다. 확인한 항목은 다음과 같습니다.
  - base의 `correction_rules`·`culture_notes`가 바이트 단위로 같은 prefix로 남아 있고, 나머지 base 키도 변경이 없습니다.
  - 규칙 id에 중복이 없고, 모든 `source_ids`가 `sources`에서 해석되며, 등록한 출처 55개는 모두 한 번 이상 참조됩니다.
  - 신규 규칙의 type이 유효하고, 예문에 숫자가 없습니다.
  - 템플릿 예문의 문말 정규식 통과율은 65/65문장입니다. 빈칸 라벨은 닫힌 집합 안에 있고 개수는 3개 이하입니다. 역질문을 뺀 9종의 길이는 202~237자(밴드 200~300), 문장 수는 6~7개입니다.
  - 템플릿 예문 10종을 기존·신규 규칙 패턴(ちょっと, なんか, の形, させていただ, 了解, のほう, になります, 僕, あなた 등 26개)과 대조한 결과 위반은 0건이고, 「と思います」도 0회입니다. 弱み 예문의 「ようになりました」는 변화의 뜻이라 정상이지만, rep-baito-keigo(「〜になります」)와 비슷해 보이는 경계 사례로 기록합니다.
  - 1차 병합 규칙의 예문 2개(rep-ryokai, rep-gokurou-otsukare)는 replacement와 정확히 같은 최소 변경이 되도록 고쳤습니다. 예문이 패턴 밖까지 고치면 모델이 불필요한 수정을 따라 할 수 있기 때문입니다.
  - 새 파일 2개를 PII denylist로 대조한 결과 0건입니다(`npm test`의 PII 검사는 추적 파일만 보므로 따로 대조했습니다).
- 기존 `validate-draft.mjs`는 **예상대로 FAIL**합니다. 이 검사기는 고치지 않았습니다. 실패 항목은 세 가지입니다.
  1. 최상위 키가 다릅니다(answer_templates, consistency, evidence_map, sources 추가).
  2. 신규 규칙 18개가 7필드가 아닙니다(source_ids, confidence 추가).
  3. 예산을 넘습니다(+18 규칙, +2867자).
  
  병합할 때는 1차 병합분만 7필드로 줄여 v2 방식으로 검증해야 합니다.

## 8. 한계·미확인

- 문화청 敬語の指針 쪽번호는 pdftotext 기준이고 인쇄 쪽과 1~2쪽 차이가 날 수 있습니다. 小松 2022, arXiv 3편은 초록만 읽었습니다.
- 학습자 연구 중 冷 2025, 上仲 2007은 중국어 화자 데이터입니다. 이것을 한국어 화자(필러 음·어)에 적용한 것은 추론입니다.
- 「1분 300자」의 1차 발화 속도 출처(NHK 등)는 확보하지 못했습니다. 초 단위 환산은 자체 추정기(MORA_PER_SEC=8)에 의존합니다.
- 필드 분할(cc-step-fields)이 문장 사이 연결을 어색하게 만드는지, 스키마 `pattern`에 일본어 교대 정규식이 컴파일되는지는 실호출로 확인하지 않았습니다. 그래서 문말 검사는 코드 게이트를 기본으로 둡니다.
- 녹화 기준선은 n=3이고, 질문 문구와 설명 언어가 달라 교란이 있습니다.

## 정정 — 반박 검증 결과 (11/03, 같은 워크플로의 검증 단계)

- 본문의 「공식 출처와 모순되는 후보 0건」은 **틀렸습니다**. 「敬語の指針」 원문 대조에서 모순 5건이 나왔습니다: 【27】お疲れ様は誰にでも使える(rep-gokurou-otsukare 분할 필요), 【7】ご〜される 존경어 해석 병기(rep-go-sareru 근거 약화), 【20】あなた는 면접에서 비교적 많이 쓰임(rep-anata High→Medium), 【19】1인칭에 반드시 지킬 규칙 없음, 침묵도 부자연스러움(str-filler-start 범위 축소).
- 상업 출처 1건이 「拝見いたしました」를 二重敬語로 잘못 분류 → 경어 **형태** 규칙은 指針 밖으로 넓히지 않고, 상업 출처는 면접 화용 근거로만 씁니다.
- 신규 첨삭 규칙 18개 중 **그대로 통과 6개(33%)**, 수정 11개 반영 시 17개, 1개 제외. 1차 병합 3개는 수정 후 병합: rep-ichininsho(「自分の〜」 포함 여부를 pattern에 명시), rep-niju-keigo(유지), rep-ryokai(사유를 「面接では承知しましたが無難」으로 완화, Medium).
- 규칙별 오탐 금지 문장 2개씩이 검증 결과에 있으며, 병합 시 eval f4neg에 추가합니다.
