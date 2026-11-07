// 公開用の伏せ字版: 期間中に Claude Code がブラウザ操作でデモ動画を限定公開でアップロードしたスクリプト（2026-11-07 実行）。
// 伏せた内容: 動画ファイルのローカルパス、Studio のアップロード URL（チャンネル ID を含む）、説明欄のリポジトリ URL、取得した動画リンク。
// 本番アプリの URL は README に記載済みの公開ドメインのため残しています。
const FILE = "<PRIVATE_DIR>/04-video/v8-2026-11-06/demo-full-ja-v8.mp4";
const TITLE = "面接コーチ｜Built with Claude: Japan 2026 デモ";
const DESC = "日本で転職する外国人のための面接コーチのデモです。\n本番: https://mensetsu-coach-ten.vercel.app\nソースコード: <REPO_URL>\nナレーション: VOICEVOX:青山龍星\n画面の求人メールと会社は架空です。";
const yt = await openTab("<YOUTUBE_STUDIO_UPLOAD_URL>");
await sleep(4000);
if (!(await yt.locator("input[type=file]").count())) {
  // ボタン名は Studio の表示言語に従います（実行時は別言語の表示。公開版では日本語表示の名前に置き換え）
  await yt.getByRole("button", { name: "作成" }).click();
  await sleep(800);
  await yt.getByRole("menuitem", { name: /動画をアップロード/ }).first().click();
  await sleep(1500);
}
// FILE を 127.0.0.1:8765 のローカルサーバーで配信し、ブラウザ側の作業ディレクトリに取り込む
const got = await fetch("http://127.0.0.1:8765/demo-full-ja-v8.mp4");
if (!got.ok) throw new Error(`local file ${got.status}`);
await fs.mkdir("./artifacts", { recursive: true });
await fs.writeFile("./artifacts/demo-full-ja-v8.mp4", Buffer.from(await got.arrayBuffer()));
await yt.locator("input[type=file]").first().setInputFiles("./artifacts/demo-full-ja-v8.mp4");
console.log("file set");
await yt.locator("#title-textarea #textbox").first().waitFor({ timeout: 30000 });
await sleep(1500);
const title = yt.locator("#title-textarea #textbox").first();
await title.click(); await yt.keyboard.press("Meta+A"); await yt.keyboard.type(TITLE);
const desc = yt.locator("#description-textarea #textbox").first();
await desc.click(); await yt.keyboard.type(DESC);
await yt.locator("tp-yt-paper-radio-button[name=VIDEO_MADE_FOR_KIDS_NOT_MFK]").first().click();
console.log("details filled");
for (let i = 0; i < 3; i++) { await yt.locator("#next-button").first().click(); await sleep(1500); }
await yt.locator("tp-yt-paper-radio-button[name=UNLISTED]").first().click();
await sleep(800);
// 動画リンクを画面から読み取る（正規表現は検出用のパターンで、ID ではありません）
const link = await yt.evaluate(() => { const a = [...document.querySelectorAll("a")].find((x) => /youtu\.be\/|youtube\.com\/(watch|shorts)/.test(x.href)); return a?.href ?? null; });
console.log("link:", link ? "<VIDEO_URL>" : null); // 公開版: 実行時はリンクをそのまま出力していました
for (let i = 0; i < 40; i++) { const st = await yt.evaluate(() => document.querySelector("#done-button")?.getAttribute("aria-disabled")); if (st !== "true") break; await sleep(2000); }
await yt.locator("#done-button").first().click();
await sleep(4000);
const after = await snapshot(yt, { interactive: true });
console.log(after.diff.slice(0, 1500));
