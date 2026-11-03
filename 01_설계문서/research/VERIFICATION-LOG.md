# VERIFICATION-LOG — R1 候補の検証記録

作成 2026-11-02。対象：`R1-C2.md`, `R1-T4.md`, `R1-T2b.md`, `R1-T5.md`, `R1-T2a.md`, `R1-SNS.md` のパック候補すべて（71件）。上位文書：`../RESEARCH-PRD.md` §3・§4.1・§5。
既存の `T1`~`T4` 文書（`T1-shinsotsu.md` など）の主張は、このログの対象では**ありません**。それらの文書の検証ログはありません（`README.md` §3 参照）。

## 読み方

- **判定**：検証エージェントによる keep/drop。71件中 keep 70、drop 1(`rep-yohi`)。
- **失敗観点**：検証で引っかかった観点。`none` = 通過。`evidence_fit` = 根拠と文が合っていなかった。keep かつ `evidence_fit` の13件は**根拠の範囲に合わせて書き直した文案**として維持し、`jp-draft-v2.json`・`failure-patterns-r1.json` には書き直した文案だけが入ります。ステレオタイプ・権利・PII の観点で引っかかった候補は0件です。
- **処理**：今回のマージ（`jp-draft-v2.json` に入る） / 次回マージ候補（予算超過のため保留） / doc_only（注入しない） / 非注入の参考（`failure-patterns-r1.json`） / 棄却。
- **理由**：検証エージェントによる判定理由の要旨。原文照合の結果（確認した文言・規約）をそのまま残しました。
- マージの選択順序：信頼度（high → medium → low）、同じ信頼度の中では PRD §2.0 の価値基準（① コーチの発話が変わるか ② 中途・エージェント経由のペルソナの実際の悩み）と、すでに採用した項目との重複の有無。同順位の処理：rules の3つ目の枠は、medium のうち公的規範と韓国語からの転移の根拠を併せ持つ唯一のルール `rep-uchi-keishou`。`rep-daijoubu-kahi` は `str-visa-facts` と「大丈夫です」の対象が重なるため除外。notes は high 6件のうち対象が最も狭い `cn-t5-hsp1-change-permit` を保留。`cn-zairyu-answer-facts` は T4 の検証がカテゴリ追加の付帯条件に指定したため維持。結果：rules 3/3、notes 5/5、enum +4、874/1,000字（`node validate-draft.mjs`）。

## 1. C2 — 韓国語話者の日本語面接での発話（10件）

| id | スロット | 信頼度 | 判定 | 失敗観点 | 処理 | 理由 |
|---|---|---|---|---|---|---|
| rep-sasete-itadaku | correction_rules | high | keep | none | **今回のマージ** | `keigo_tosin.pdf`【18】で許可/恩恵の条件と「○○高校を卒業させていただきました」の例を確認。規約の連鎖 bunka.go.jp → 文部科学省ウェブサイト利用規約 → 公共データ利用規約（第1.0版, CC BY 4.0 互換）を確認。除外コンテンツの別表（1366610.htm）は未確認。20字連続一致0。「担当させていただきました」は境界事例だが使用可能。 |
| rep-uchi-keishou | correction_rules | medium | keep | evidence_fit | **今回のマージ** | 指針【24】（「部長の田中」はウチ、「田中部長」は不適切）・【25】で規範を確認。転移の根拠：NINJAL Q&A（韓国語では外部の人に対しても「社長様が到着なさる」）、朝鮮語教育16（絶対敬語/相対敬語）。原案の example_after が意味を変えていた（…の方針で）ため「上司の鈴木がいつも申しているとおり」に修正。範囲は現職（勤務先）のみ。前職への拡張は未確認。 |
| rep-onsha-spoken | correction_rules | medium | keep | none | 次回マージ候補 | マイナビ転職（面接は御社、メールは貴社）・キャリタス就活（「御社様」の二重敬語禁止）の2件が独立に一致。転載・出身への言及なし。rules 3件の上限のため保留。 |
| rep-yakushoku-sama | correction_rules | medium | keep | none | 次回マージ候補 | マイナビニュース（「社長様」は二重敬語, 「○○社長」「社長の○○様」）・Forbes JAPAN（書面の指針）。例文は面接官の会社（ソト）の人物であり、出典と合う。検証者も第2次候補と判定。 |
| rep-daijoubu-kahi | correction_rules | medium | keep | evidence_fit | 次回マージ候補 | 大辞泉が「はい、大丈夫です」を可能/承諾として記録しているため、原案の例文（転勤は可能ですか → 大丈夫です）は承諾と読まれ、多義性の主張が弱い。要否を問う質問の例文に修正。C2 の転移ルールではなく共通ルール。今回のマージの `str-visa-facts` と「大丈夫です」の対象が重なるため今回は除外。 |
| rep-yohi | correction_rules | low | **drop** | evidence_fit | 棄却 | 唯一の出典である金・赤堀・清水 1997 は学習期間約1か月の学習者2名、例示「成功与否」1件。文書自体の基準（出典2つ）を満たさない。「話し言葉では自然」は著者の推論。中途 N1・N2 との関連性が低い。 |
| cn-uchi-soto-interview | culture_notes | medium | keep | evidence_fit | 次回マージ候補（重複時は廃棄可） | 原案「名前に役職…を付けずに」は指針が許容する「部長の〇〇」まで禁止と読め、「同僚」は出典の範囲外のため、許容される形を明記して修正。`rep-uchi-keishou` を今回採用したため内容の大部分が重複。予算節約のため保留。 |
| doc-ganbarimasu | doc_only | low | keep | none | doc_only | type就活 1件（新卒の学生言葉の文脈）。中途との関連性はさらに弱い。保留扱いが妥当。 |
| doc-particle-transfer | doc_only | low | keep | evidence_fit | doc_only | 1997年の論文の助詞の例は「自転車に乗る」1件のみ。「〜を会う」「〜がなる」は出典のない形のため文案から外した。 |
| doc-heisha-candidate | doc_only | low | keep | none | doc_only | マイナビ転職の単一出典（面接は「あなた個人として」、「現職」「前職」を推奨）。指針【24】（弊社の部長、取引先の場面）とは場面が異なるため、人による確認が必要。 |

## 2. T4 — 外国人特有の質問群・逆質問・不適切質問（11件）

| id | スロット | 信頼度 | 判定 | 失敗観点 | 処理 | 理由 |
|---|---|---|---|---|---|---|
| str-visa-facts | correction_rules | high | keep | none | **今回のマージ** | 告示276号 PDF で「在留資格上、従事することが認められる者であることを確認」と令和八年五月二九日改正の表記、moj.go.jp で 14日以内・第19条の16第2号・中長期在留者本人、question.html で選考段階は口頭または書面 / 在留カードは採用内定後に確認、を確認。最長一致12字。メモ：C2「大丈夫です」と重複、永住者などは「期限」スロットが合わない可能性あり（軽微）。 |
| str-japanese-evidence | correction_rules | medium | keep | none | 次回マージ候補 | JLPT FAQ（会話・作文の試験なし）、levelsummary（【読む】【聞く】）、JASSO ガイド（面接で聞く力・話す力を確認）を確認。キャリタスの数値の分母は未確認（文書にも明記）。「頑張ります」（C2）とのマージ時に照合が必要。 |
| str-why-japan-axes | correction_rules | medium | keep | none | 次回マージ候補 | JASSO ガイドの「なぜ日本（日本企業）で働きたいのか」という質問と「過去と将来の2つの軸」を確認。③御社である理由は既存の T4-6 に基づく設計。新卒向け資料を中途に外挿（medium が妥当）。SNS-P1 が現場の事例で補強。 |
| cn-no-14jikou-questions | culture_notes | high | keep | none | **今回のマージ** | consider.html で 14事項・本人に責任のない事項・本来自由であるべき事項・「これらに限られるわけではありません」を確認。列挙項目はすべて 14事項の範囲内。question.html の AI 選考における遵守の Q&A(R1T4-06)を確認。規約 mhlw.go.jp/chosakuken(PDL1.0)。packs/lib の grep 0件 → 重複なし。国籍はリストに入れない。 |
| cn-redirect-not-refuse | culture_notes | low | keep | evidence_fit | 次回マージ候補 | 原案「拒否や指摘をさせず」は出典が裏付けておらず、厚労省がハローワークへの相談を案内していること（R1T4-05）・文書の設計表の「回答するかどうかは本人の選択」と矛盾。選択権を保つ文に修正。職務に話を戻す手法の効果は根拠なし（low）。 |
| cn-zairyu-answer-facts | culture_notes | high | keep | none | **今回のマージ** | question.html の原文（採用選考時は口頭または書面…採用内定後に「在留カード」により確認）と完全に一致。告示276号で就労可否の確認義務を確認。`str-visa-facts` と一部重なるが、在留カードの確認時期を加える。メモ：ルールは「手続き」、ノートは「就労可否」とスロットの表記が異なる → 次回マージ時に統一を推奨。 |
| cn-teichaku-normal-question | culture_notes | medium | keep | evidence_fit | 次回マージ候補 | JASSO の想定質問に「日本でどれぐらいの期間、就労したいと考えていますか」があることを確認。しかし「定着性を確かめる」という意図の帰属と「通常の質問」という判定には根拠なし（配慮事項の一覧に見つからなかったのは不在にすぎない）。出典が述べる範囲まで弱めて修正。 |
| cn-gyakushitsumon-conditions-agent | culture_notes | medium | keep | evidence_fit | 次回マージ候補 | doda は条件に関する質問を NG に挙げつつ「業務の質問の後に理由を述べて尋ねる」ことを条件付きで許容、Recruit はエージェントへの確認を選択肢（も考えられます）としてのみ提示、「業務・組織・評価」は Recruit の二次段階の項目。断定を条件付きに修正。doda の原文は WebFetch の要約しか閲覧しておらず、ローカルでの転載照合はできていない。 |
| qt-cat-japan-zairyu | question_taxonomy | medium | keep | none | **今回のマージ** | enum 文字列の契約を満たす。JASSO(R1T4-20/21)・告示276号（R1T4-14）が根拠。**製品の動作変更**：`lib/coach.js` 101行目「各カテゴリを最低1つ含める」により、10問のセットごとにこのカテゴリの質問が1つ以上強制される。検証者の条件どおり `cn-no-14jikou-questions`・`cn-zairyu-answer-facts` と一緒に入れた。 |
| doc-gyakushitsumon-stages | doc_only | medium | keep | evidence_fit | doc_only | Recruit のコラム（2023-09-29 公開、2024-05-31 更新）の一次/二次/最終の区分とは合うが、doda は一次の面接官を人事または現場の社員とし、二次の面接官を表（部門長）と本文（中堅）で異なって記載。「民間の出典2つが一致」ではない。出典の帰属を明記して修正。 |
| doc-shuro-shikaku-shomeisho-optional | doc_only | high | keep | none | doc_only | e-Gov 法令 API の原文で入管法 19条の2 第1項（申請があつたときは…交付することができる）・第2項（不利益な取扱いをしてはならない）を確認。T5 と重複のため doc_only。 |

## 3. T2b — オファー・退職段階（13件）

| id | スロット | 信頼度 | 判定 | 失敗観点 | 処理 | 理由 |
|---|---|---|---|---|---|---|
| str-salary-range | correction_rules | medium | keep | evidence_fit | 次回マージ候補 | リクルート article11673 は「御社の規定に従います。」を単独の回答例として掲載し、JAC も推奨回答の1つとして提示 → 原案（この一言 = 欠陥）は overclaim。「希望額があるとき」にパターンを絞り、example_before にそのシグナルを入れて修正。転載0。 |
| str-start-date | correction_rules | medium | keep | none | 次回マージ候補 | r-agent 12715（最短入社可能日・希望入社日, 1～2カ月, 引き継ぎ）、directscout 4232（1～3カ月, 2週間）、茨城労働局（1ケ月前申出の推奨）を確認。例文の日付は架空の値。 |
| str-salary-private-reason | correction_rules | low | keep | evidence_fit | 次回マージ候補（最下位） | JAC は個人的な事情（結婚・住宅ローン）を NG とするが、リクルートは「住宅ローンがあるので現職の年収…は維持したい」を根拠の例に挙げる → 矛盾。「増額の根拠を個人的な事情だけで述べること」に絞って修正。NG 側の出典が1か所のため low。 |
| cn-t2b-01 | culture_notes | medium | keep | evidence_fit | 次回マージ候補 | `str-salary-range` と同じ overclaim。「希望額があるなら」の条件を入れて修正。エージェント経由は mynavi 71 と合う。 |
| cn-t2b-02 | culture_notes | medium | keep | none | 次回マージ候補 | mynavi 71（内定前は自分の希望を伝えるにとどめ、内定後処遇面談/オファー面談で交渉）・MyVision（条件提示・内定承諾前）を確認。 |
| cn-t2b-03 | culture_notes | medium | keep | none | 次回マージ候補 | mynavi FAQ 1713（直接応募先企業に連絡するのは避け…早めに転職エージェントの担当者に相談）、r-agent 12635 の例文を確認。 |
| cn-t2b-04 | culture_notes | medium | keep | none | 次回マージ候補 | mynavi 1555（保留理由と回答期限を明確に、「第一志望」発言との矛盾）を確認。保留の日数は入れない。 |
| cn-t2b-05 | culture_notes | high | keep | none | **今回のマージ** | e-Gov 民法627条1項の原文（解約の申入れの日から二週間を経過することによって終了する）、茨城労働局の就業規則 1ケ月の推奨を確認。期間の定めのない雇用に範囲を限定。残課題：「引き継ぎ」の根拠 R1T2b-30/31 を claim_ids に追加（このログで記録、元文書は未修正）。 |
| doc-t2b-offer-stage | doc_only | medium | keep | none | doc_only | mynavi 71 の「処遇面談」「オファー面談」の表記を確認。T2a に引き継ぎ（T2a `stage-offer-mendan` として今回のマージに反映）。 |
| doc-t2b-fee | doc_only | high | keep | none | doc_only | e-Gov XML で職安法32条の3第2項（求職者からは手数料を徴収してはならない）・施行規則20条2項の例外を確認。 |
| doc-t2b-no-poaching | doc_only | high | keep | none | doc_only | 厚労省のリーフレット PDF(001603370)の2年間の転職勧奨の禁止・返戻金制度・お祝い金の禁止を確認。規約 PDL1.0。 |
| doc-t2b-terms-mismatch | doc_only | high | keep | none | doc_only | 労基法15条2項・職安法5条の3第3項の原文を確認。義務の主体が求人者である点が文から抜けているが、誤った内容ではない。 |
| doc-t2b-taishoku-cert | doc_only | high | keep | none | doc_only | 労基法22条（使用期間・業務の種類・地位・賃金・退職の事由, 遅滞なく交付）を確認。 |

## 4. T5 — 在留資格・就労許可（10件）

| id | スロット | 信頼度 | 判定 | 失敗観点 | 処理 | 理由 |
|---|---|---|---|---|---|---|
| cn-t5-shuro-shomeisho-optional | culture_notes | high | keep | evidence_fit | **今回のマージ** | 入管法19条の2 1・2項、ISA Q&A Q3・16-9 ページと一致。事実は正しいが、原案（「法律で禁止」+「必須であるかのように答えるな」）はコーチを面接官との法律論争へ押しやり、前向きな回答行動がない。「任意」という事実 + 回答行動（資格名・期限で答え、求められれば協力）に修正。 |
| cn-t5-three-month-gap | culture_notes | high | keep | evidence_fit | **今回のマージ** | 入管法22条の4 第6号（継続して三月…正当な理由がある場合を除く）、裁量（取り消すことができる）を確認。原案は高度専門職2号の6か月の例外が欠落 + コーチがユーザーの取消しの可能性を判断すること（法律相談）を防いでいない → 6か月の例外と「判断しない」の文言を入れて修正。 |
| cn-t5-hsp1-change-permit | culture_notes | high | keep | none | 次回マージ候補 | ISA 高度専門職ページの注記（所属機関の変更を含む…在留資格変更許可申請が必要）を確認。「許可後に入社」は合理的な推論。notes 5件の上限の中で対象が最も狭い（高度専門職1号の保有者のみ）ため保留。 |
| doc-t5-gijinkoku-requirements | doc_only | high | keep | none | doc_only | PDF 001366995（十年以上の実務経験など）・001413639（従来より柔軟に判断, 相当程度の関連性など）を確認。許可の可能性の判定は法律相談になるため注入しない。 |
| doc-t5-cefr-b2-2026 | doc_only | high | keep | none | doc_only | gijinkoku.html（令和８年４月１５日, ＣＥＦＲ・Ｂ２相当, ＪＬＰＴ・Ｎ２以上, 在留期間更新許可申請時）を確認。新設の規定のため、注入前に再確認。 |
| doc-t5-notification-procedure | doc_only | high | keep | none | doc_only | 19条の16（十四日以内）、71条の5・71条の2（20万円以下の罰金）、電子届出・証明書類不要、Q&A の変更不要（※1 更新に注意）、事業主の努力義務、更新の3か月前からの受付、すべて一致。 |
| doc-t5-hsp-points | doc_only | high | keep | none | doc_only | 2012-05-07 開始・70点、5年・80点、2号は無期限、年収300万円・N1・N2 の加点10点を確認。 |
| doc-t5-unrestricted-statuses | doc_only | high | keep | none | doc_only | 入管法19条（別表第一のみ制限）、qaq5（居住資格, 無期限）を確認。R1T4-15 と一致。 |
| doc-t5-interview-question-table | doc_only | medium | keep | none | doc_only | 質問・例文は自作、頻度未確認と明記。民間2件（R1T5-29, R1T5-31）は実在・20字一致0。R1T5-31 と厚労省 Q&A の矛盾は §3 のとおり公的規範を優先。enum の追加なし。 |
| doc-t5-terms-egov-subdomain | doc_only | high | keep | none | doc_only | e-gov.go.jp/terms で「e-gov.go.jp及びそのサブドメインのWebサイト」・PDL1.0 を確認 → laws.e-gov.go.jp を出典とするものの規約未確認の件を解消。下記 §7 に反映。 |

## 5. T2a — 中途選考フロー・段階別の評価軸（13件）

| id | スロット | 信頼度 | 判定 | 失敗観点 | 処理 | 理由 |
|---|---|---|---|---|---|---|
| stage-casual-mendan | question_taxonomy | medium | keep | none | **今回のマージ** | マイナビ（選考ではない・内容の共有）・type（合否判定ではない、初回面接に近い事例）のトークンを確認。既存の stages と重複なし。 |
| stage-niji-mensetsu | question_taxonomy | medium | keep | none | **今回のマージ** | ビズリーチの2次面接コラム（回答数210, 50.95%, 35.24%, 「2次が最終の場合もある」）・リクルートの補助的根拠。2次特有の評価軸の根拠は弱いが、enum の追加には問題なし。 |
| stage-offer-mendan | question_taxonomy | medium | keep | none | **今回のマージ** | doda（オファー面談・処遇面談・労働条件通知書）・マイナビ（条件面談・承諾前）を確認。T2b ルールの使用場面。 |
| str-tenshoku-reason-forward | correction_rules | medium | keep | none | 次回マージ候補 | 2割/8割の構造（R1T2a-21）、JAC（同様の理由で退職に至る可能性, 長く勤めてくれる人材か）を確認。20字照合の一致0。T4 草案 `t4-leave-reason-positive` と重なるため、マージ時にどちらか1つに決める必要がある。 |
| str-casual-interest | correction_rules | medium | keep | none | 次回マージ候補 | マイナビの原文（カジュアル面談を受けようと思った理由などについて聞かれることがあります、内容が採用担当者に共有）を確認。例文の表現は 02_로컬원본 にない。 |
| str-final-career-vision | correction_rules | medium | keep | none | 次回マージ候補 | ビズリーチのアンケートで最終面接の1位（今後のキャリア）、リクルート、doda（入社意欲や長期的な活躍への期待）を確認。「1〜3年」は出典のない設計値。C2「頑張ります」とは対象が異なるため重複ではない。 |
| note-stage-axes | culture_notes | medium | keep | none | 次回マージ候補 | R1T2a-10/12/13/14 の原文を確認。md は「2次が最終の場合はノート1で補完」としていたが、ノートにその内容がない（失敗ではない）。補完版（+22字）は人が選択。 |
| note-casual-mendan | culture_notes | medium | keep | none | 次回マージ候補 | マイナビ・type（「実施企業によって位置づけには差があります」）を確認。`str-casual-interest` と一部重なるが、質問生成の文脈用。 |
| note-final-consistency | culture_notes | medium | keep | none | 次回マージ候補 | doda「一貫性」、ビズリーチの最終面接5位「キャリアの一貫性」を確認。既存のパックのノート（面接官側の情報）とは対象が異なるため重複ではない。 |
| note-reference-check-2nd-merge | culture_notes | medium | keep | none | 次回マージ候補 | doda（最終面接の前後から内定を出す前）、マイナビ（必ず求職者の同意を得たうえで, 前職や取引先）を確認。同意は慣行であり、法的義務と読んではならない（5条の5 の同意は例外条項、告示141号旧版の対象に求人者なし）。脚注は R1T2a-19/20 のみ残すこと。もともと第2次マージの対象。 |
| doc-scout-reply-structure | doc_only | medium | keep | none | doc_only | R1T2a-23/24/25 を確認（感謝・関心・次のステップ・候補日時, Re: を維持, 24時間以内）。書くメールなので correction_rules の対象ではない。「候補日2〜3件」は設計値（出典は「複数」）。 |
| doc-probation-legal | doc_only | high | keep | none | doc_only | 労基法21条ただし書き（十四日を超えて）、施行規則5条に「試」0回、中労委 PDF（三菱樹脂・客観的に合理的）、JILPT（65.7%, 3ヵ月程度）を確認。R1T2a-28（新潟）は開いていないが、payload では使っていない。 |
| doc-aptitude-test | doc_only | medium | keep | none | doc_only | doda（Jina 経由）・マイナビで能力検査・性格検査・書類選考の後、一次の前、というトークンを確認。面接質問がないため stages から除外。 |

## 6. SNS — 外国人の面接失敗事例の反復パターン（14件、内部リサーチ）

| id | スロット | 信頼度 | 判定 | 失敗観点 | 処理 | 理由 |
|---|---|---|---|---|---|---|
| sns-note-final-direction | culture_notes | low（元の表記 medium） | keep | none | 次回マージ候補 | 日本語1文48字、国籍・識別情報なし、既存ノートとの重複なし。根拠3件にエージェンシー隣接の出典があるため、文書自体のルールにより low に下げた。 |
| sns-note-credential-judgment | culture_notes | low | keep | none | 次回マージ候補 | 44字、R1SNS-06（3件中1件が商業ブログ） low。ステレオタイプ・PII・重複なし。 |
| SNS-P1 | failure_pattern | low（元の表記 medium） | keep | none | 非注入の参考 | 4件を一般化、20字一致0。§4.1 のスロットではないため注入禁止。商業出典を含む → low。 |
| SNS-P2 | failure_pattern | low（元の表記 medium） | keep | none | 非注入の参考 | S-forum-a・S-forum-b・S-blog-b。コーチの発話が既存の `str-ketsuron`/`str-answer-first` と同じため、注入する価値なし。商業出典 → low。 |
| SNS-P3 | failure_pattern | low | keep | none | 非注入の参考 | 2件。「この求人の幅」→「この求人の年収レンジ」に修正。 |
| SNS-P4 | failure_pattern | low（元の表記 medium） | keep | none | 非注入の参考 | R1SNS-04。S-blog-a の事例は正しく除外。エージェンシー隣接の出典 → low。 |
| SNS-P5 | failure_pattern | medium | keep | none | 非注入の参考 | 非商業3件のため medium を維持。「大部分」を絶対的な表現に変えていたコーチの発話を「多いです」に緩和。 |
| SNS-P6 | failure_pattern | low | keep | none | 非注入の参考 | R1SNS-06 low。4文型の構造を再利用。 |
| SNS-P7 | failure_pattern | low | keep | none | 非注入の参考 | 2件。テキストのコーチでは伝え方の要素を測定できないため doc_only。 |
| SNS-P8 | failure_pattern | low | keep | none | 非注入の参考 | 出典の出身フレーム（「西洋式の考え方」（報告者の表現を言い換え））を行動基準に置き換え、ステレオタイプ観点を通過。双方向の報告（主張しすぎ / 慎重すぎ）なのに、コーチの発話が順応側だけを推していたため、バランスを取って修正。置換テストの「pass」は根拠のない断定のため、「設計判断、未検証」に変更。 |
| SNS-P9 | failure_pattern | low | keep | none | 非注入の参考 | 3件。「6か月」の数値は単一出典のため除外。14日の届出は公的な R1T5-11 と相互参照。 |
| sns-doc-salary-overpaid | doc_only | low | keep | none | doc_only | T2b 担当者向けのマージメモ（R1SNS-03）。 |
| sns-doc-corroborate-t4 | doc_only | medium | keep | none | doc_only | 有効な補強メモだが、R1SNS-09(low)・R1SNS-02（商業）より高く表記されている。脚注を low/逸話と表示し、T4 候補の信頼度を上げないこと。 |
| sns-doc-debrief-feature | doc_only | medium | keep | none | doc_only | 製品の提案（F6 の拡張）。非商業3件が根拠。この作業の範囲外、コード変更なし。 |

## 7. ユニット別の文書課題（doc_issues、元文書は修正しない）

この節の指摘は、R1 の元文書（`R1-*.md`, `*.claims.json`）にはまだ反映されていません。修正は各ユニットの担当者または次回パスが行います。

### C2
1. c2-06 の key_tokens にある「身内」は NINJAL のページにない（原文は「よその人に対しても…『社長様が到着なさる』」）。内容は正確、トークンのみ修正。
2. 未確認の節の「부장님（韓国語の「部長」の敬称）→部長様の韓国語側メカニズム未確認」に対して、c2-06(NINJAL)が部分的な根拠を与える。ただし二重敬語そのものではなく「外部の人に対して自分側を高める」という内容なので、引用に注意。
3. マイナビニュース（S8）の「社外の人と話すときは、身内である社長に『様』は付けません」はウチのルール（§2）の2つ目の民間出典だが、引用されていない。
4. c2-11 の日付が 2025-12-10/2026-09-16 で混在。ページの表記は公開日 2026.09.16（基準日 2026-11-02 より前）。
5. c2-18 の規約の連鎖（bunka.go.jp → 文部科学省ウェブサイト利用規約 → 公共データ利用規約第1.0版, CC BY 4.0 互換）は確認。敬語の指針が除外別表（/b_menu/1366610.htm）にないという点は**未確認**。
6. `rep-yohi` の md における信頼度「low~medium」は過大（学習期間約1か月、n=2、「成功与否」1件）。
7. doc_only の助詞転移ノートの「〜を会う」「〜がなる」は出典なし。
8. md と原文11件の20字機械照合の一致0。PII なし（鈴木・田中は一般的な例示名）。12個の URL すべての応答を確認。

### T4
1. 要約 #8「『尊敬する人物』『愛読書』は日本の面接でよくある質問」は脚注のない事実の主張。14事項に含まれる部分だけが R1T4-02 で確認されている。
2. 要約 #6・§E「逆質問の段階別の違い・NG リストは民間の出典2つが一致」は誇張（doda の面接官の記述が Recruit と異なり、ページ内でも不一致）。NG リストだけがおおむね重なる。
3. 要約 #4「どの公的資料でも配慮事項として見つからなかった」は検索範囲のない不在の主張であり、「定着性」という意図の帰属は JASSO の原文にない。
4. §A の訂正メモにある「他の労働局資料の検索スニペットには『約半分』」は URL のない言及。特設サイトの原文は「多くを占めています」（比率なし）で、本文は原文に従っている。
5. §C 末尾の「告示276号の採用条項は旧版 HTML(sisin01.html)と文言が同じ」は照合の根拠なし。旧版 HTML は今回も開いていない。
6. e-Gov の法令条文（R1T4-09/12/13/19）は API で文言を確認。terms_url がポータルの規約（e-gov.go.jp/terms）のため厳密には未充足だったが、T5(`doc-t5-terms-egov-subdomain`, R1T5-27)が「サブドメインを含めて PDL1.0」を確認し、**解消**。
7. R1T4-24 の key_token「会話や作文の試験」は原文のふりがなのため文字どおりには不一致（内容は確認済み）。機械的なトークン検査で偽の失敗になる可能性あり。
8. JLPT・Recruit・doda の terms_url「未確認」は「private（要約のみ、規約未確認）」と明記するのが正確。新潟労働局 jsite は private として正しく分類。
9. R1T4-22 キャリタスの数値（約７割/約９割）は JASSO PDF で確認したが、調査2件が混在し分母は未確認（文書が明記しているため誤りではない）。
10. PII なし。Recruit・JASSO・厚労省の原文と20字ウィンドウで照合し最大12字（転載0）。doda は WebFetch の要約しか得られず、原文照合ができなかった。
11. URL はすべて実在・閲覧済み。816字の予算を再現（id を除く、categories を含む）。

### T2b
1. 要約4・§D・R1T2b-20 の「『御社の規定に従う』は補助的な文としてのみ」は overclaim（リクルート・JAC ともに単独の回答を認めている）。「柔軟」はリクルートの原文にない。
2. §D・R1T2b-21/22：リクルートの住宅ローンを根拠とする例が JAC の「個人的な事情は NG」と正面から矛盾するのに、文書は同じ構造を勧めるとだけ記載。矛盾のメモが必要。
3. R1T2b-22・23 は2つの出典を根拠に挙げながら、source_url はリクルート1つ。JAC の URL を分ける必要あり。
4. key_tokens の不一致：R1T2b-20（現年収・最低希望額 → 原文は現在の年収/最低希望年収）、R1T2b-27（他社選考中 → 他社の選考）、R1T2b-29（担当エージェント → 転職エージェントの担当者）、R1T2b-14（1か月 → 1ケ月）、R1T2b-15（後任 → 新しい人が見つかるまで）。内容は裏付けられているが、機械的な検査では失敗。
5. culture_notes 5(`cn-t2b-05`)の「引き継ぎ」の根拠の脚注が欠落 → R1T2b-30 または 31 を追加。
6. 「注入文字の合計892字」は、書き直した文案の基準では901字。予算内だが数値の更新が必要。
7. e-Gov 規約のただし書きは文書で開示されている（T5 で解消）。URL の偽造・PII なし。日本語20字以上の区間14個を民間の原文10件と照合し、一致0。

### T5
1. R1T5-01 のトークン「別表第一の二」が gijinkoku.html にない。「入管法別表第一」に変えるか、法令 XML で確認。
2. R1T5-07 のトークン「活動全体として捉えて判断」は原文（在留期間中の活動を全体として捉えて判断）と文字が不一致。トークンを修正。
3. R1T5-15 のトークンに原文のかぎ括弧「」が抜けている（「在留資格変更許可申請」は不要（※１））。トークンを修正。
4. R1T5-18 のトークン「１，6００円」は全角・半角が混在。NFKC 後にのみ一致。
5. 要約6「韓国人候補者の通訳・翻訳職務への転換に直接かかわる」は出典のない文。「誰であれ言語業務に移れば適用」と中立化が必要。
6. 要約2・§2 と元のノート2が 22条の4 の高度専門職2号の6か月の例外を落としている → 書き直した文案に反映。
7. §6 の表の HSP1 届出：19条の16 1号（HSP1 ハ）・2号（HSP1 イ・ロ）の区分が R1T5-11 にはあるが §4 に反映されていない（軽微）。
8. R1T5-14 の取消しの主体「法務大臣」の文言は法令 XML と照合できていない（候補には影響なし）。
9. 権利・PII・URL の問題なし。公的な14個の URL は200応答、terms_url(ISA index2, e-gov terms)は PDL1.0。民間2件は private・規約未確認と表記（事実の要約用として許容）、20字一致0。例文は架空の日付のみ。

### T2a
1. md 37行目の表「二次が最終の企業も多い」、16行目の要約2「よくあります」、101行目「ノート1で補完」は過剰な主張 + 途切れた相互参照。ビズリーチの原文は「2次面接が最終面接の場合もある」だけで、ノート1の本文に補完の内容がない。
2. 16行目の要約2の「コーチは段階の名前よりも面接官の層によって回答の重心を変えるべき」は設計判断だが、「解釈」の表示がない。
3. key_tokens の不一致：R1T2a-19「内定前」（原文は内定を出す前）、R1T2a-20「推薦者」（原文は推薦する/リファレンス先, 2名～3名）。
4. 128行目のノート4が [R1T2a-07][R1T2a-08] を脚注に使っているが、B節（58行目）はこの2つが求人者の同意義務の根拠ではないと自ら記している。脚注は19・20のみ残すか、「公的根拠は目的の制限まで」を本文に明記。
5. 146行目「転載検査の範囲：ビズリーチのコラムのみ」は現在では事実と異なる。検証者が md の日本語区間20個 + 候補の文字列を、民間16ページ（doda 4か所は Jina 経由）・JILPT・中労委・告示141 のテキストと照合し、一致0。更新を推奨。
6. R1T2a-28(niigata-elcc.mhlw.go.jp)は検証者が開いていない。private・規約未確認のラベルは正しいが、「1年を超える試用期間を無効とした裁判例」は原文未確認のまま。
7. PII・個人の事例・創作 URL なし。例文の表現は 02_로컬원본 にない。公的な terms_url は有効（kouseisaiyou のフッター → mhlw.go.jp/chosakuken）。21個の URL の応答を確認。

### SNS
1. 信頼度ルールの適用の不一致：「出典の一方が商業コーチング・エージェンシーなら low」なのに、P6 だけを下げ、P1・P2（S-blog-b 商業）・P4（S-blog-a エージェンシー隣接）は medium のまま。原資料索引の基準で medium の資格があるのは P5 のみ。→ `failure-patterns-r1.json` とこのログは low に修正して記録。md の要約6と culture_notes #1 のタグは未修正。
2. SNS-P8 の置換テスト「日本人候補者が同じ回答をしても同じ懸念を招く」は出典のない事実型の主張 → 「設計判断、未検証」と表示。
3. SNS-P4 の状況にある「本人は雰囲気が良かったと感じている」は R1SNS-04 にない細部。削除するか claim に追加。
4. SNS-P6 の教訓にある「『模範解答を練習せよ』と『暗記した回答は崩れる』の両方が報告されている」は R1SNS-06 にない。claim に追加するか、解釈と表示。
5. SNS-P1 の状況にある「使い回した場合が多い」は claim（「繰り返し報告」）より強い。「繰り返し報告されている」に。
6. md と出典の表に**リポジトリ外のセッション用スクラッチパッドの絶対パス**（ローカルのユーザー名を含む、揮発性の場所）が入っている。公開リポジトリに上げる前に「リポジトリ外の内部パス」のようなプレースホルダーに置き換える必要がある。（このログにはパスを書き写していない。）
7. 転載なし（原資料との20字連続一致はパス文字列のみ）。md・claims.json に PII・ハンドル・URL なし。kind=private の terms_url=null は正しい。
8. 契約：failure_pattern(P1~P9)は §4.1 のスロットではない。文書は「注入対象ではない」と正しく表示しており、マージ版の `jp-draft-v2.json` からも除外している（別ファイル `failure-patterns-r1.json`）。
