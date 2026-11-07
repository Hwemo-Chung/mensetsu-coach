#!/usr/bin/env node
// Claude Code PreToolUse hook (.claude/settings.json): before Claude Code runs `git push` or a Vercel deploy, run the
// publish-check scan. Exit 2 makes Claude Code refuse the command and shows stderr to the model; exit 0 lets it run.
// The scan prints file names and list line numbers only, so this message cannot leak a value.
// shortcut: the scan runs on the session's repository, so `git -C <other repo> push` is checked against this one;
// the git pre-push hook (README) still scans the repository that actually pushes.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

let input = "";
for await (const chunk of process.stdin) input += chunk;
let command = "";
try { command = JSON.parse(input)?.tool_input?.command ?? ""; } catch { process.exit(0); }

const PUBLISH = /\bgit\b[^;&|]*\bpush\b|\bvercel\b[^;&|]*(?:\bdeploy\b|--prod\b)/;
if (!PUBLISH.test(command)) process.exit(0);

const scan = fileURLToPath(new URL("../skills/publish-check/scripts/scan.mjs", import.meta.url));
const args = process.env.PUBLISH_PRIVATE ? [scan, "--private", process.env.PUBLISH_PRIVATE] : [scan];
const r = spawnSync("node", args, { cwd: process.cwd(), encoding: "utf8" });
if (r.status === 0) process.exit(0);

const lines = (r.stdout ?? "").split("\n").filter((l) => /^(BLOCK|CANNOT CHECK|REVIEW|scanned)/.test(l)).join("\n");
const why = r.status === 1 ? "公開してはいけない内容を検出しました" : "確認できませんでした（非公開のリストが見つからない、または git の状態を読めない）";
process.stderr.write(`publish-check の公開前スキャンが${why}（exit ${r.status}）。このコマンドは実行しません。/publish-check の手順で直してから、もう一度実行してください。\n${lines}\n`);
process.exit(2);
