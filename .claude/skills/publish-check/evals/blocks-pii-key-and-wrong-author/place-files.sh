#!/usr/bin/env bash
# Builds a throwaway repository and private lists. Every value is fictional; the key is split so scanners stay quiet here.
set -eu
mkdir -p repo private
printf '架空太郎\n' > private/.pii-denylist.txt
printf '架空の注意語\n' > private/.publish-terms.txt
printf 'ACCESS_CODE=fictional-access-code\n' > private/.env
printf 'tester <tester@example.test>\n' > private/.publish-identity.txt
cd repo
git init -q
git config user.name tester
git config user.email tester@example.test
printf '# サンプル\n' > README.md
git add README.md
git commit -qm "初回のコミットです"
printf '担当: 架空太郎\n' > notes.md
printf 'const key = "%s%s";\n' "sk-ant-" "aaaaaaaaaaaaaaaaaaaaaaaa" > config.js
git add notes.md config.js
git -c user.email=other@example.test commit -qm "設定を追加しました"
printf '架空の注意語 についての一般的な説明です\n' > about.md
