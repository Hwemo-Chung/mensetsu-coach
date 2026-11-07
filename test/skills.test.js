// Project skills (.claude/skills): frontmatter the CLI can load, side-effect skills stay user-invoked, referenced
// files exist, and the publish scan blocks what it must without ever printing the sensitive value it found.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../.claude/skills/", import.meta.url));
const SKILLS = ["add-pack", "deploy-verify", "prompt-change-check", "publish-check"];
const USER_ONLY = ["deploy-verify", "publish-check"];

function frontmatter(name) {
  const m = readFileSync(join(root, name, "SKILL.md"), "utf8").match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  assert.ok(m, `${name}: frontmatter`);
  return { fields: Object.fromEntries(m[1].split("\n").map((l) => l.match(/^([a-z-]+):\s*(.*)$/)?.slice(1)).filter(Boolean)), body: m[2] };
}

test("each project skill loads: name matches its folder, short description (the listing budget is shared)", () => {
  for (const name of SKILLS) {
    const { fields } = frontmatter(name);
    assert.equal(fields.name, name);
    assert.ok(fields.description?.length > 20 && fields.description.length <= 300, `${name}: description length ${fields.description?.length}`);
  }
});

test("skills with outside effects run only when the user asks", () => {
  for (const name of USER_ONLY) assert.equal(frontmatter(name).fields["disable-model-invocation"], "true", name);
});

test("files a skill points to exist, in the skill folder or the repository", () => {
  const repo = fileURLToPath(new URL("../", import.meta.url));
  for (const name of SKILLS) {
    for (const [, rel] of frontmatter(name).body.matchAll(/`((?:scripts|references|lib|test|packs|public|01_設計文書)\/[^`\s<*]+)`/g)) {
      assert.ok(existsSync(join(root, name, rel)) || existsSync(join(repo, rel)), `${name}: ${rel}`);
    }
  }
});

// A throwaway repository with its own private folder: every value below is fictional.
const scan = fileURLToPath(new URL("../.claude/skills/publish-check/scripts/scan.mjs", import.meta.url));
const FAKE_KEY = "sk-" + "ant-" + "a".repeat(24);

function sandbox({ deny = "架空太郎\n", terms = "架空の注意語\n", env = "ACCESS_CODE=fictional-access-code\nAPP_URL=https://example.test/\n", identity = "tester <tester@example.test>\n" } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "publish-scan-"));
  const repo = join(dir, "repo"), priv = join(dir, "private");
  mkdirSync(repo);
  mkdirSync(priv);
  if (deny !== null) writeFileSync(join(priv, ".pii-denylist.txt"), deny);
  if (terms !== null) writeFileSync(join(priv, ".publish-terms.txt"), terms);
  if (env !== null) writeFileSync(join(priv, ".env"), env);
  if (identity !== null) writeFileSync(join(priv, ".publish-identity.txt"), identity);
  const git = (...a) => execFileSync("git", a, { cwd: repo, stdio: "pipe" });
  git("init", "-q");
  git("config", "user.name", "tester");
  git("config", "user.email", "tester@example.test");
  writeFileSync(join(repo, "a.md"), "clean\n");
  git("add", "a.md");
  git("commit", "-qm", "first");
  const run = (cwd = repo) => spawnSync("node", [scan, "--private", priv], { cwd, encoding: "utf8" });
  return { dir, repo, git, run, done: () => rmSync(dir, { recursive: true, force: true }) };
}

test("scan: a clean repository exits 0", (t) => {
  const s = sandbox();
  t.after(s.done);
  const r = s.run();
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("scan: a denylisted term in an untracked file blocks, and the term is not printed", (t) => {
  const s = sandbox();
  t.after(s.done);
  writeFileSync(join(s.repo, "b.md"), "架空太郎 の記録\n");
  const r = s.run();
  assert.equal(r.status, 1);
  assert.match(r.stdout, /b\.md/);
  assert.doesNotMatch(r.stdout + r.stderr, /架空太郎/);
});

test("scan: a key-shaped string blocks, and the key is not printed", (t) => {
  const s = sandbox();
  t.after(s.done);
  writeFileSync(join(s.repo, "c.js"), `const k = "${FAKE_KEY}";\n`);
  const r = s.run();
  assert.equal(r.status, 1);
  assert.doesNotMatch(r.stdout + r.stderr, new RegExp(FAKE_KEY));
});

test("scan: a real secret value from .env blocks; a plain setting such as a URL does not", (t) => {
  const s = sandbox();
  t.after(s.done);
  writeFileSync(join(s.repo, "d.md"), "https://example.test/ は公開の URL です\n");
  assert.equal(s.run().status, 0);
  writeFileSync(join(s.repo, "d.md"), "fictional-access-code\n");
  const r = s.run();
  assert.equal(r.status, 1);
  assert.doesNotMatch(r.stdout + r.stderr, /fictional-access-code/);
});

test("scan: a publish term asks for a human reading instead of blocking", (t) => {
  const s = sandbox();
  t.after(s.done);
  writeFileSync(join(s.repo, "e.md"), "架空の注意語 を含む文\n");
  const r = s.run();
  assert.equal(r.status, 0);
  assert.match(r.stdout, /REVIEW.*e\.md/);
  assert.doesNotMatch(r.stdout, /架空の注意語/);
});

test("scan: a commit message and a wrong author or committer block", (t) => {
  const s = sandbox();
  t.after(s.done);
  s.git("commit", "-q", "--allow-empty", "-m", "架空太郎 の修正");
  const byMessage = s.run();
  assert.equal(byMessage.status, 1);
  assert.doesNotMatch(byMessage.stdout, /架空太郎/);
  s.git("commit", "-q", "--amend", "--allow-empty", "-m", "ok");
  assert.equal(s.run().status, 0);
  s.git("-c", "user.email=other@example.test", "commit", "-q", "--allow-empty", "-m", "ok2");
  const byIdentity = s.run();
  assert.equal(byIdentity.status, 1);
  assert.match(byIdentity.stdout, /author|committer/i);
});

test("scan: without the private lists it refuses to say the repository is clean (exit 2)", (t) => {
  const s = sandbox({ deny: null });
  t.after(s.done);
  assert.equal(s.run().status, 2);
});

test("scan: without a tracking branch, origin/<branch> still limits it to what is about to leave", (t) => {
  const s = sandbox();
  t.after(s.done);
  writeFileSync(join(s.repo, "old.md"), "架空太郎\n");
  s.git("add", "old.md");
  s.git("commit", "-qm", "already published");
  const branch = s.git("rev-parse", "--abbrev-ref", "HEAD").toString().trim();
  s.git("update-ref", `refs/remotes/origin/${branch}`, "HEAD");
  const clean = s.run();
  assert.equal(clean.status, 0, clean.stdout);
  assert.match(clean.stdout, /scanned 0 files .* 0 commits/);
  writeFileSync(join(s.repo, "new.md"), "架空太郎\n");
  const r = s.run();
  assert.equal(r.status, 1);
  assert.match(r.stdout, /new\.md/);
  assert.doesNotMatch(r.stdout, /old\.md/);
});

// Regressions from the attack review 11/05: each one passed the first version of the scan with exit 0.
test("scan: a term committed and then removed still blocks, because the old commit gets pushed too", (t) => {
  const s = sandbox();
  t.after(s.done);
  writeFileSync(join(s.repo, "x.md"), "架空太郎\n");
  s.git("add", "x.md");
  s.git("commit", "-qm", "add");
  s.git("rm", "-q", "x.md");
  s.git("commit", "-qm", "remove");
  const r = s.run();
  assert.equal(r.status, 1, r.stdout);
  assert.doesNotMatch(r.stdout, /架空太郎/);
});

test("scan: the staged version is read even when the working file was cleaned", (t) => {
  const s = sandbox();
  t.after(s.done);
  writeFileSync(join(s.repo, "x.md"), "架空太郎\n");
  s.git("add", "x.md");
  writeFileSync(join(s.repo, "x.md"), "clean\n");
  assert.equal(s.run().status, 1);
});

test("scan: a stale origin ref cannot hide commits the remote does not have", (t) => {
  const s = sandbox();
  t.after(s.done);
  const bare = join(s.dir, "remote.git");
  execFileSync("git", ["init", "-q", "--bare", bare]);
  s.git("remote", "add", "origin", bare);
  const branch = s.git("rev-parse", "--abbrev-ref", "HEAD").toString().trim();
  s.git("update-ref", `refs/remotes/origin/${branch}`, "HEAD");
  assert.match(s.run().stdout, / 1 commits/);
});

test("scan: an unreachable origin means it could not check (exit 2)", (t) => {
  const s = sandbox();
  t.after(s.done);
  s.git("remote", "add", "origin", join(s.dir, "missing.git"));
  assert.equal(s.run().status, 2);
});

test("scan: identity is compared with the private file, name included", (t) => {
  const byName = sandbox();
  t.after(byName.done);
  byName.git("-c", "user.name=someone", "commit", "-q", "--allow-empty", "-m", "ok");
  assert.equal(byName.run().status, 1);
  const byConfig = sandbox();
  t.after(byConfig.done);
  byConfig.git("config", "user.email", "wrong@example.test");
  byConfig.git("commit", "-q", "--allow-empty", "-m", "ok");
  assert.equal(byConfig.run().status, 1, "the repository config must not vouch for itself");
});

test("scan: unusual file names and a run from a subfolder are not skipped", (t) => {
  const s = sandbox();
  t.after(s.done);
  mkdirSync(join(s.repo, "sub"));
  writeFileSync(join(s.repo, 'quo"te.md'), "架空太郎\n");
  writeFileSync(join(s.repo, "sub/y.md"), "架空太郎\n");
  const r = s.run(join(s.repo, "sub"));
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /quo"te\.md/);
  assert.match(r.stdout, /sub\/y\.md/);
});

test("scan: what it cannot read needs a human instead of passing silently; UTF-16 is read", (t) => {
  const s = sandbox();
  t.after(s.done);
  writeFileSync(join(s.repo, "image.bin"), Buffer.from([1, 0, 2]));
  writeFileSync(join(s.repo, "sjis.txt"), Buffer.from([0x83, 0x41, 0xff]));
  const review = s.run();
  assert.equal(review.status, 0);
  assert.match(review.stdout, /REVIEW image\.bin/);
  assert.match(review.stdout, /REVIEW sjis\.txt/);
  writeFileSync(join(s.repo, "u16.txt"), Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("架空太郎", "utf16le")]));
  assert.equal(s.run().status, 1);
});

test("scan: Unicode forms and percent encoding do not hide a term", (t) => {
  const s = sandbox({ deny: "Taro Kakuu\n" });
  t.after(s.done);
  writeFileSync(join(s.repo, "x.md"), "TARO%20KAKUU\n");
  assert.equal(s.run().status, 1);
});

test("scan: broken or empty private inputs mean it could not check", (t) => {
  for (const opts of [{ deny: "# only a comment\n" }, { env: null }, { env: "APP_URL=https://example.test/\n" }, { identity: null }, { terms: null }]) {
    const s = sandbox(opts);
    t.after(s.done);
    assert.equal(s.run().status, 2, JSON.stringify(opts));
  }
});

test("scan: .env lines written with CRLF, export or spaces are still read", (t) => {
  const s = sandbox({ env: 'export ACCESS_CODE = "fictional-access-code" # note\r\nDB_URL=postgres://u:hidden-pass@db/x\r\n' });
  t.after(s.done);
  writeFileSync(join(s.repo, "x.md"), "fictional-access-code\n");
  assert.equal(s.run().status, 1);
  writeFileSync(join(s.repo, "x.md"), "hidden-pass\n");
  assert.equal(s.run().status, 1);
});

test("scan: a term in a path or a crafted message blocks without being printed", (t) => {
  const s = sandbox();
  t.after(s.done);
  writeFileSync(join(s.repo, "架空太郎.md"), "clean\n");
  const byPath = s.run();
  assert.equal(byPath.status, 1, byPath.stdout);
  assert.doesNotMatch(byPath.stdout, /架空太郎/);
  rmSync(join(s.repo, "架空太郎.md"));
  s.git("commit", "-q", "--allow-empty", "-m", "ok\x01架空太郎");
  const byMessage = s.run();
  assert.equal(byMessage.status, 1);
  assert.doesNotMatch(byMessage.stdout, /架空太郎/);
});

test("scan: more key shapes block, ordinary identifiers do not, risky file names need a reading", (t) => {
  const s = sandbox();
  t.after(s.done);
  writeFileSync(join(s.repo, "ok.js"), "const feature_ExtractorConfigValueLong = 1;\n");
  assert.equal(s.run().status, 0);
  writeFileSync(join(s.repo, "credentials.json"), "{}\n");
  assert.match(s.run().stdout, /REVIEW credentials\.json/);
  writeFileSync(join(s.repo, "k.js"), "github_" + "pat_" + "a".repeat(30) + "\n");
  assert.equal(s.run().status, 1);
});

test("skills folder holds only the listed skills", () => {
  assert.deepEqual(readdirSync(root).filter((n) => !n.startsWith(".")).sort(), SKILLS);
});
