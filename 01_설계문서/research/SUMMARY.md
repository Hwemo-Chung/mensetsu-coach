【検証出力】node validate-draft.mjs の実行結果：
+rules 3/3 (rep-sasete-itadaku, str-visa-facts, rep-uchi-keishou)
+notes 5/5, +enums 4 (カジュアル面談, 二次面接, オファー面談, 日本で働く理由・在留)
+chars 874/1000 (rules 481, notes 366, enums 27)
OK, exit=0
- 2つの JSON ファイルはいずれも JSON.parse を通過しました。
- ネガティブテスト8種（ルール4件、ノート6件、誤った type、重複 id、余分なキー、フィールド欠落、1,004字、既存ノートの改ざん）は、いずれも exit 1 で失敗を検出しました。

【同時変更の開示】作業中に packs/jp.json が変更されました。18:31 に別の作業が daily_questions キーを追加しました。検証スクリプトがキーの不一致として検出し、草案にはその値をそのままコピーしました。同じ時間帯（18:27~18:34）に別のセッションが lib/mail.js, api/, public/, test/, package.json, vercel.json も変更しました。この作業はそれらのファイルを一切書き込んでいません。git ではないため、diff では証明できません。

【その他】
- CLAUDE.md に記載された 02_로컬원본/ ディレクトリが現在ありません。README-SECTION (1) の「既存15件 = 本人のノウハウ」は DESIGN-KAKAOTALK §5 と照合しました。「透過」「集中」「資産」「逆に」などはありましたが、「事実になる」「反論」「どう思いますか」はありませんでした。そのため文言を「添削メモと、それをもとに設計段階で整理したルール」に弱めました。
- 「コードはすべてコンテスト期間中に書いた」はユーザー本人の主張です。私が検証した事実ではありません。

=== SUMMARY.md の内容（メインセッションが保存） ===
# SUMMARY — R1 リサーチ結果と第1次マージ案
作成 2026-11-02。判定根拠はすべて VERIFICATION-LOG.md。マージは行っていません。jp-draft-v2.json は packs/ 外の草案であり、人が承認した後にのみ反映します（PRD §4.1）。

## 1. ユニット別集計（候補71件）
| ユニット | 候補 | keep | drop | 今回のマージ | 次回マージ候補 | doc_only | 非注入の参考 | 書き直した候補（evidence_fit） |
| C2 | 10 | 9 | 1 | 2 (rules 2) | 4 | 3 | 0 | 4（+棄却 1） |
| T4 | 11 | 11 | 0 | 4 (rule 1, notes 2, category 1) | 5 | 2 | 0 | 4 |
| T2b | 13 | 13 | 0 | 1 (note 1) | 7 | 5 | 0 | 3 |
| T5 | 10 | 10 | 0 | 2 (notes 2) | 1 | 7 | 0 | 2 |
| T2a | 13 | 13 | 0 | 3 (stages 3) | 7 | 3 | 0 | 0 |
| SNS | 14 | 14 | 0 | 0 | 2 | 3 | 9 (failure_pattern) | 0 |
| 合計 | 71 | 70 | 1 | 12 | 26 | 23 | 9 | 13 |
- 棄却1件：rep-yohi。学習期間約1か月の学習者 n=2、例示1件で、文書自体の基準を満たしません。
- ステレオタイプ拒否権の行使は0件、権利・PII による棄却は0件です。出身ノートは0件のため、「すべて high」の基準は該当しません。
- SNS の P1・P2・P4 と sns-note-final-direction は、元文書の medium を low に下げて記録しました。商業・エージェンシーの出典が混ざる場合は low とする、という文書自体のルールに従いました。

## 2. 今回のマージ案とコーチ出力の変化
- rules: rep-sasete-itadaku（C2, high, 157字）, str-visa-facts（T4, high, 150字）, rep-uchi-keishou（C2, medium, 174字）
- notes: cn-no-14jikou-questions（T4, high, 61字）, cn-zairyu-answer-facts（T4, high, 68字）, cn-t2b-05（T2b, high, 67字）, cn-t5-three-month-gap（T5, high, 97字）, cn-t5-shuro-shomeisho-optional（T5, high, 73字）
- stages: カジュアル面談, 二次面接, オファー面談（T2a, 17字） / categories: 日本で働く理由・在留（T4, 10字）

変化：
1. 添削
   - 許可・恩恵のない「させていただく」を指摘します。
   - 「ビザは大丈夫です」を「資格名＋期限＋転職時の手続き」に直させます。
   - 面接官の前で現職の上司を「〇〇部長がおっしゃる」と高めた場合は、「上司の〇〇が申す」に直します。
   - rule_id enum（coach.js 255行目）が15個から18個に増えます。
2. 質問生成：culture_notes がシステムプロンプトに入ります（coach.js 38行目）。そのため、14事項（本籍・家族・宗教・尊敬する人物・愛読書など）の質問を生成しなくなります。
3. 質問セットの構成（人の承認が必要）：coach.js 101行目の「各カテゴリを最低1つ含める」により、10問ごとに日本で働く理由・在留の質問が最低1つ強制されます。検証者の条件に従い、14jikou・zairyu ノートを一緒に入れました。そうすることで、国籍の質問や選考段階での在留カードの要求が生じません。
4. 回答コーチング
   - 入社可能日は、民法の2週間、就業規則、引き継ぎを根拠に答えさせます。
   - 空白期間は事実だけを話させ、取消しの可否は判断しません。
   - 就労資格証明書がなければ資格名・期限で答え、求められれば協力すると言わせます。
5. stage enum に3つの値が追加されます。

## 3. 選択の根拠
- rules：high 2件に続く3つ目の枠には、medium 11件の中から rep-uchi-keishou を選びました。
  - 公的規範（敬語の指針【24】）があります。
  - 韓国語からの転移の根拠（NINJAL, 朝鮮語教育16）を持つ唯一の R1 ルールです。
  - 中途応募者は上司に頻繁に言及します。
- rep-daijoubu-kahi は str-visa-facts と「大丈夫です」の対象が重なるため除外しました。
- notes：high 6件のうち対象が最も狭い cn-t5-hsp1-change-permit を保留しました。cn-zairyu-answer-facts は str-visa-facts と一部重なりますが、T4 の検証がカテゴリ追加の付帯条件に指定したため維持しました。
- cn-uchi-soto-interview は rep-uchi-keishou と重複するため保留しました。
- 予算：874/1,000字、rules 3/3、notes 5/5 です。

## 4. マージ前に必ず処理すること
1. test/i18n.test.js 22~23行目は、すべての stage・category に UI ラベルを要求します。新しい enum 4つのラベルが public/i18n/{ko,ja,en}.js にないため、そのままマージすると npm test が失敗します。マージ作業にラベル追加を含める必要があります。
2. 作業中に packs/jp.json が変更されました（daily_questions の追加）。マージ直前に node validate-draft.mjs を再実行する必要があります。
3. version は1のままにしました。

## 5. 未確認の項目
- PRD §5 の再現テスト（example_before を入れると該当 id を指摘するか）は3件とも未実行です。したがって採用は暫定です（再現に失敗すれば採用取消し）。
- validate-draft.mjs --verbatim は実装していません。転載検査はユニット検証者が20字ウィンドウの照合で行い（一致0）、doda は WebFetch の要約しかないため原文照合ができませんでした。
- 敬語の指針が MEXT の除外別表（1366610.htm）に含まれていないかは確認できませんでした。
- 前職の上司をウチとして扱うかは未確認です（rep-uchi-keishou は現職に限定）。韓国語側の転移メカニズム5種も未確認です。
- 外国人特有・在留の質問が中途面接でどれくらい出るかは分かりません。「正当な理由」に転職活動の期間が含まれるかも分かりません（コーチは判断しない）。
- str-visa-facts の「期限」スロットは永住者のような資格に合いません。また、str-visa-facts（手続き）と cn-zairyu（就労可否）でスロットの表記が異なります。
- cn-t2b-05 の claim_ids に R1T2b-30/31 が抜けています（元文書は未修正）。
- 告示276 育成就労の施行日、告示141 の現行版、「法務大臣」の文言、R1T2a-28 の原文は未確認です。
- T1~T4 の既存文書には検証ログがありません（README §3 に記載）。
- VERIFICATION-LOG §7 の doc_issues は R1 元文書に反映していません。R1-SNS.md にはローカル絶対パスが残っており、公開前に削除する必要があります。
- README §0・§4 の一部の記述は R1 の結果と合わなくなりましたが、修正していません。

## 6. 次回マージ候補26件（順位）
1. cn-t5-hsp1-change-permit (note, high, 50)
2. str-why-japan-axes (rule, medium, 164)
3. str-tenshoku-reason-forward（rule, 241; T4 t4-leave-reason-positive との統合が必要）
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
22. cn-uchi-soto-interview（note, 73; 廃棄候補）
23. str-salary-private-reason (rule, low, 168)
24. cn-redirect-not-refuse (note, low, 69)
25. sns-note-final-direction (note, low, 48)
26. sns-note-credential-judgment (note, low, 44)
例示案：rules 2~4位（564字） + notes 1・12・13・15位（220字） = 784字。failure-patterns-r1.json はどのマージにも入れません。

## 7. 実測の範囲
- 文字数の定義：新ルールの pattern・replacement・reason・example_before・example_after のコードポイント数（id・type を除く） + 新ノート + 新 enum。packs/jp.json との差分で数えます。ユニット文書の独自集計（816・892・923字）は定義が異なるため比較できません。
- 書き込んだファイルは 01_설계문서/research/ 配下の6つだけです。元の出典は再度開いておらず、事実確認はユニット検証の結果に依存しています。

## 8. マージ結果（2026-11-02 メインセッション）
- マージ：rules 3 + notes 5 (`packs/jp.json`)。str-visa-facts は永住者の誤添削を防ぐため、replacement・reason を修正してマージ。
- 保留：question_taxonomy の拡張4件。「各カテゴリを最低1つ」と重なり、在留の質問が毎回強制されるため。
- 根拠：`EVAL-2026-11-02.md` (F4 18/18)。
