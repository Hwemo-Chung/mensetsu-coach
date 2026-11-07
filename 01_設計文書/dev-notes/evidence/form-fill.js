// 公開用の伏せ字版: 期間中に Claude Code がブラウザ操作で提出フォームに記入したスクリプト（2026-11-07 実行）。
// 伏せた内容: 3 欄の回答本文（FORM_ANSWERS.json として非公開で管理）、提出ページの URL パターン（提出 ID を含むため）。
// 手順: 開いているタブから提出の編集ページを探す → 欄をラベルで選んで記入 → スナップショットの差分を出力し、記入が保存前の画面に反映されたことを人が確認する。
const V = {
  overview: "<FORM_ANSWERS.json の内容: プロジェクト概要>",
  stuck: "<FORM_ANSWERS.json の内容: 一番詰まった場面>",
  feedback: "<FORM_ANSWERS.json の内容: Claude を使った感想>",
};
const tl = await listBrowserTabs(); const p = await attachBrowserTab(tl.find((x) => /<SUBMISSION_EDIT_URL_PATTERN>/.test(x.url)).targetId);
const box = (re) => p.getByRole("textbox", { name: re }).first();
await box(/プロジェクト概要/).fill(V.overview);
await box(/一番詰まった場面/).fill(V.stuck);
await box(/Claude を使った感想/).fill(V.feedback);
const s = await snapshot(p, { interactive: true });
console.log(s.diff);
