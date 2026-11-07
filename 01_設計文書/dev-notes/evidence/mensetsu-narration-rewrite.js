// Claude Code Workflow script used during development (multi-agent orchestration, run 2026-11-06). Paths made repo-relative for publication.
// 公開用の伏せ字版: ローカルの絶対パスを相対パスと <PRIVATE_DIR> に置き換え、作者の指示の韓国語原文を削除して日本語訳だけを残しました。個人の近況に関する規則の文言は一般化しています。
export const meta = {
  name: 'mensetsu-narration-rewrite',
  description: '動画のナレーション全文を事実と発音の両面で書き直し、音声を生成して聞き取りで検証する（コミットしない）',
  phases: [
    { title: 'Rewrite', detail: '全行を抽出し、事実を確かめ、読みを正して書き直す' },
    { title: 'Verify', detail: '発音と書き起こし、事実を独立に反証' },
    { title: 'Fix', detail: '確認された指摘を直して音声を作り直す' },
  ],
}

const ROOT = '.'
const OUT = '<PRIVATE_DIR>/04-video/v8-2026-11-06/narration'
const PII_DENYLIST = '<PRIVATE_DIR>/secrets/.pii-denylist.txt'

const COMMON = `作者の指示（韓国語からの訳）: 動画のナレーション台本を正確に書き直し、検証して、音声を作る。きっかけは、VOICEVOX が「調査はHaiku」を「エイチ アイク」と誤読したことです。

対象: ${ROOT} の scripts/build-video.mjs（scene の第3引数の台詞）、scripts/record-video.mjs（SAY の台詞）。音声エンジン: http://127.0.0.1:50021 （VOICEVOX 0.26.0 が起動済み。止めない）。話者は青山龍星 ノーマル（speaker id 13）、speedScale は scripts/narration.mjs の TEMPO。音声の保存先: ${OUT}（非公開）。

規則:
- 変えてよいのは読み上げる台詞です。画面の文字、シナリオ、シーンの順序、演出は変えません。画面の文字に事実の誤りを見つけたら、変えずに報告します。
- 動画は 3 分以内が条件です。現在 164.7 秒です。台詞の長さを大きく変えません。
- 公開の規則: 作者の経験は過去のものとして述べ（以前の）、個人の近況には触れない。実名、実在の企業名を入れない。精度の数値を新たに入れない。
- git add、commit、push、アップロード、デプロイ、有料 API の呼び出しをしない。record-video.mjs と build-video.mjs の実行もしない（動画の組み立ては別に行います）。既存の dev.js を止めない。
- 自分の作業ファイルは ${OUT} に置く。文章は韓国語で書く。`

const LINES_NOTE = `ファイル ${OUT}/lines.json に全台詞を [{ "id", "file", "line", "text", "expected_reading": "ひらがなかカタカナの正しい読み", "engine_kana", "wav", "sec" }] の形で置きます。`

phase('Rewrite')
const rewrite = await agent(`${COMMON}

あなたは台本の担当です。
1. 読み上げられる全台詞を抽出します（build-video.mjs の scene の台詞、record-video.mjs の SAY、関数の引数で渡される say、テンプレートで組み立てる台詞も含む）。抜けがないように、NARRATE の経路をコードでたどって確かめてください。
2. 各行の内容を事実で確かめます。モデルの役割は lib/claude.js の MODELS、ゲートと捨てる処理は lib/ のコード、機能は README と public/demo/demo-ja.json、画面の表示内容は record-video.mjs の CAPTIONS と録画データに照らします。実際と異なる、または強すぎる主張を直します。
3. 読みを正します。エンジンの /audio_query（text と speaker=13、POST）の kana を全行で確かめ、誤読する語は台詞の表記を変えて直します。英字の製品名はカタカナで書きます（ハイク、ソネット、オーパス、クロード コードなど。公式の日本語の読みに合わせる）。数字、助詞、固有の言い回し、区切りの不自然さも確かめます。読点で間を調整できます。
4. scripts のファイルを編集します。台詞だけを変えます。
5. 全行の音声を生成します（/audio_query → /synthesis。scripts/narration.mjs と同じ speedScale）。${OUT}/<id>.wav に保存し、全行を順に連結した ${OUT}/narration-all.m4a を ffmpeg で作ります。${LINES_NOTE}
6. npm test を PII_DENYLIST=${PII_DENYLIST} 付きで実行します。

返答: 変更した行の前後の対比（file:line）、変更しなかった行の数、合計の秒数と v7 の台詞の合計の差、画面の文字で気づいた誤り、テスト結果。`, { label: 'rewrite:script', phase: 'Rewrite' })
if (!rewrite) { log('台本の担当が結果を返しませんでした'); return { rewrite: null } }

phase('Verify')
const VERDICT = {
  type: 'object',
  properties: {
    checked_lines: { type: 'integer' },
    issues: { type: 'array', items: { type: 'object', properties: {
      severity: { type: 'string', enum: ['high', 'medium', 'low'] },
      id: { type: 'string' }, text: { type: 'string' }, problem: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' },
    }, required: ['severity', 'id', 'text', 'problem', 'evidence', 'fix'] } },
    verified_ok: { type: 'string' },
    not_checked: { type: 'string' },
  },
  required: ['checked_lines', 'issues', 'verified_ok', 'not_checked'],
}
const LENSES = [
  { key: 'reading', prompt: `観点: 発音です。台本の担当の報告を信じず、次を自分で行います。
(a) ${OUT}/lines.json の各行について、scripts の実際の台詞と一致するかを確かめ、抜けている台詞がないかコードをたどって確かめる。
(b) エンジンの /audio_query の kana を読み、誤読、不自然なアクセント句の区切り、数字の読みを確かめる。
(c) 聞き取りの往復検査: 各 wav を文字に起こして台詞と比べる。ローカルのモデル ~/.cache/huggingface/hub/models--mlx-community--whisper-large-v3-turbo を使う。例: uv run --with mlx-whisper python で mlx_whisper.transcribe(path, path_or_hf_repo="mlx-community/whisper-large-v3-turbo", language="ja")。ネットワークに新しく何かを取りに行くのは uv のパッケージだけにする。実行できなければ理由を not_checked に書く。
書き起こしと台詞が異なる行は、音声の誤りか書き起こしの誤りかを kana と照らして判断する。特にカタカナの製品名と「エイチ」のような文字読みを確かめる。結果を ${OUT}/roundtrip.json に保存する。` },
  { key: 'facts', prompt: `観点: 事実です。各台詞の主張を、台本の担当の説明を読まずに、コード（lib/claude.js、lib/review.js、lib/research.js、lib/prep.js、public/）、README、public/demo/demo-ja.json と、その台詞が流れる画面（record-video.mjs の CAPTIONS と HOLD、build-video.mjs のシーン）に照らします。実際より強い主張（「すべて」「必ず」「捨てます」など）、フォールバックで別のモデルが動く場合の言い方、画面と台詞の不一致、話者の経験が過去の話になっているかを確かめます。公開の規則に反する語がないかも確かめます。` },
]
const verdicts = (await parallel(LENSES.map(l => () =>
  agent(`${COMMON}\n\nあなたは反証役です。ファイルを変更しないでください（${OUT} の検査結果を除く）。\n\n${l.prompt}\n\n自分で確かめた問題だけを issues に入れます。`, { label: `verify:${l.key}`, phase: 'Verify', schema: VERDICT }).then(v => v && ({ lens: l.key, ...v }))
))).filter(Boolean)
const missing = LENSES.filter(l => !verdicts.some(v => v.lens === l.key)).map(l => l.key)
if (missing.length) log(`結果のない観点: ${missing.join(', ')}`)

phase('Fix')
const toFix = verdicts.flatMap(v => v.issues.filter(i => i.severity !== 'low').map(i => ({ lens: v.lens, ...i })))
log(`Verify: ${toFix.length} issues to fix`)
const fix = await agent(`${COMMON}

反証役の指摘を処理し、音声を最終版にします。
1. 次の指摘を確かめ、正しければ最小の変更で直します。同意できない指摘は実物で確かめて理由を書きます。low の指摘も、台詞の修正で直せるなら直します。
2. 変更した行の kana を確かめ、wav を作り直し、${OUT}/lines.json と ${OUT}/narration-all.m4a を更新します。変更した行は mlx-whisper の往復検査もやり直します。
3. npm test を PII_DENYLIST=${PII_DENYLIST} 付きで実行します。
4. git status --short で、変更が scripts の 2 ファイルだけであることを確かめます。

返答: 直したもの、直さなかったものと理由、最終の全台詞（id、台詞、秒数）、合計秒数、テスト結果、残る不確かな点。

指摘: ${JSON.stringify(verdicts.flatMap(v => v.issues.map(i => ({ lens: v.lens, ...i }))), null, 1)}`, { label: 'fix:final-audio', phase: 'Fix' })

return { rewrite, verdicts, fix, missing }
