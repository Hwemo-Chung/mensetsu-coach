#!/usr/bin/env node
// Pre-publish scan of everything about to leave this machine: the blobs and messages of unpushed commits, the staged
// versions, changed and untracked files. Output is file names and list line numbers only, so it cannot leak a value.
// Exit 0 = no block (REVIEW lines need a human reading), 1 = blocked, 2 = could not check (treat as not clean).
// Usage: node scan.mjs [--private <dir with .pii-denylist.txt, .publish-terms.txt, .publish-identity.txt, .env>]
// shortcut: only HEAD's history is scanned, so `git push --all` or --tags needs a scan of each ref. Plain matching
// also misses a term split by spaces or base64; upgrade if such a case appears.
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readlinkSync } from "node:fs";
import { join, resolve } from "node:path";

const cannot = (why) => { console.log(`CANNOT CHECK: ${why}`); process.exit(2); };
process.on("uncaughtException", (e) => cannot(`unexpected ${e.code ?? e.name}`)); // git and fs errors carry no list value

const gitBuf = (...a) => execFileSync("git", ["--no-replace-objects", ...a], { cwd: top ?? undefined, stdio: ["ignore", "pipe", "ignore"], maxBuffer: 1 << 29 });
const git = (...a) => gitBuf(...a).toString("utf8");
const zlist = (...a) => git(...a).split("\0").filter(Boolean);
let top = null;
top = git("rev-parse", "--show-toplevel").trim();

// One form for comparing: full-width and decomposed characters, case and percent encoding must not hide a value.
const fold = (s) => s.normalize("NFKC").toLowerCase();
const foldedForms = (s) => {
  const plain = fold(s);
  try { const decoded = fold(decodeURIComponent(s.replace(/%(?![0-9a-f]{2})/gi, "%25"))); return decoded === plain ? [plain] : [plain, decoded]; } catch { return [plain]; }
};

function decode(buf) {
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder("utf-16le").decode(buf);
  if (buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder("utf-16be").decode(buf);
  if (buf.includes(0)) return null;
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); } catch { return null; }
}

const at = process.argv.indexOf("--private");
if (at > 0 && !process.argv[at + 1]) cannot("--private needs a folder");
const priv = at > 0 ? resolve(process.argv[at + 1]) : resolve(top, "../BuiltWithClaude-2026-private/secrets");
const readPrivate = (name) => {
  const file = join(priv, name);
  if (!existsSync(file)) cannot(`${name} not found in the private folder`);
  const text = decode(readFileSync(file));
  if (text === null) cannot(`${name} cannot be read as text`);
  return text.replace(/^﻿/, "");
};
const list = (name) => {
  const entries = readPrivate(name).split(/\r?\n/).map((text, i) => ({ text: text.trim(), n: i + 1 })).filter((t) => t.text && !t.text.startsWith("#")).map((t) => ({ ...t, text: fold(t.text) }));
  if (!entries.length) cannot(`${name} has no entries`);
  return entries;
};
const deny = list(".pii-denylist.txt");
const terms = list(".publish-terms.txt");
const [identity] = readPrivate(".publish-identity.txt").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
if (!identity) cannot(".publish-identity.txt has no entry");

// Only values whose name says secret, plus credentials inside a URL: an APP_URL or MAIL_FROM is meant to be public.
const envValues = [".env", ".env.local"].filter((n) => existsSync(join(priv, n))).flatMap((n) => readPrivate(n).split(/\r?\n/)).flatMap((line) => {
  const m = line.match(/^\s*(?:export\s+)?([\w.-]+)\s*=\s*(.*)$/);
  if (!m) return [];
  const raw = m[2].trim();
  const value = /^["']/.test(raw) ? raw.slice(1, raw.indexOf(raw[0], 1) > 0 ? raw.indexOf(raw[0], 1) : undefined) : raw.replace(/\s+#.*$/, "");
  const inUrl = value.match(/:\/\/[^/\s:@]+:([^/\s@]+)@/)?.[1];
  const named = /KEY|TOKEN|SECRET|PASS|CODE|AUTH/i.test(m[1]) && value.length >= 6 ? value : null;
  return [named, inUrl].filter(Boolean);
});
if (!envValues.length) cannot("no secret values read from the private .env");
const secretValues = [...new Set(envValues)].map(fold);

// \b keeps ordinary words such as feature_ExtractorConfig out of the re_ shape.
const KEY_SHAPES = /sk-ant-[A-Za-z0-9_-]{10,}|\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{30,}|\bre_[A-Za-z0-9_]{20,}|\bgh[pousr]_[A-Za-z0-9]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}|\bAKIA[0-9A-Z]{16}\b|\bxox[abprs]-[A-Za-z0-9-]{10,}|\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.|-----BEGIN [A-Z ]*PRIVATE KEY/;
const RISKY_NAME = /(^|\/)(\.env(?!\.example$)[^/]*|credentials[^/]*|id_(rsa|ed25519|ecdsa)|\.npmrc|\.netrc|[^/]*\.(pem|p12|pfx|key))$/;

// A remote that cannot be reached must not pass as "nothing to push": stale local refs hide commits (attack review 11/05).
const hasOrigin = (() => { try { return Boolean(git("remote", "get-url", "origin").trim()); } catch { return false; } })();
if (hasOrigin) { try { git("fetch", "--prune", "--quiet", "origin"); } catch { cannot("git fetch origin failed"); } }
const range = ["HEAD", "--not", "--remotes=origin"];

const blocks = [], reviews = [];
function inspect(label, text) {
  const forms = foldedForms(text);
  const has = (needle) => forms.some((f) => f.includes(needle));
  for (const t of deny) if (has(t.text)) blocks.push(`${label}: denylist line ${t.n}`);
  if (KEY_SHAPES.test(text)) blocks.push(`${label}: key-shaped string`);
  if (secretValues.some(has)) blocks.push(`${label}: secret value from the private .env`);
  for (const t of terms) if (has(t.text)) reviews.push(`${label}: publish term line ${t.n}`);
}

// A path is data too: when it holds a listed value, it is reported by position so the report stays clean.
let pathIndex = 0;
function labelOf(path) {
  pathIndex++;
  const forms = foldedForms(path);
  const hit = [...deny, ...terms].find((t) => forms.some((f) => f.includes(t.text)));
  const safe = hit || KEY_SHAPES.test(path) || secretValues.some((v) => forms.some((f) => f.includes(v))) || /[\r\n]/.test(path) ? `path #${pathIndex}` : path;
  inspect(safe === path ? `${path} (path)` : safe, path);
  if (RISKY_NAME.test(path)) reviews.push(`${safe}: file name often holds secrets`);
  return safe;
}

let scanned = 0, unreadable = 0;
function scanContent(path, buf, stage) {
  const label = labelOf(path);
  scanned++;
  const text = decode(buf);
  if (text === null) { unreadable++; reviews.push(`${label}${stage}: binary or unknown encoding, not scanned`); }
  else inspect(`${label}${stage}`, text);
}

// 1. Every blob the push would carry, including ones later commits removed.
for (const line of lines(git("rev-list", "--objects", ...range))) {
  const [sha, ...rest] = line.split(" ");
  const path = rest.join(" ");
  if (!path) continue;
  if (git("cat-file", "-t", sha).trim() === "blob") scanContent(path, gitBuf("cat-file", "blob", sha), " (commit)");
}
function lines(s) { return s.split("\n").filter(Boolean); }

// 2. What the next commit would carry.
for (const path of zlist("diff", "--cached", "--name-only", "-z", "--diff-filter=d")) scanContent(path, gitBuf("show", `:${path}`), " (staged)");

// 3. Working files, which may be staged next.
for (const path of new Set([...zlist("diff", "--name-only", "-z", "HEAD"), ...zlist("ls-files", "-z", "--others", "--exclude-standard", "--full-name")])) {
  const full = join(top, path);
  let stat;
  try { stat = lstatSync(full); } catch { continue; } // a deletion publishes nothing new
  if (stat.isSymbolicLink()) scanContent(path, Buffer.from(readlinkSync(full)), "");
  else if (stat.isFile()) scanContent(path, readFileSync(full), "");
  else reviews.push(`${labelOf(path)}: not a regular file, not scanned`);
}

// 4. Messages and identities of the commits. NUL fields, because a message can hold any other separator.
const fields = git("log", "--format=%h%x00%an%x00%ae%x00%cn%x00%ce%x00%B%x00", ...range).split("\0");
let commits = 0;
for (let i = 0; i + 5 < fields.length; i += 6) {
  commits++;
  const hash = fields[i].trim();
  const [an, ae, cn, ce, message] = fields.slice(i + 1, i + 6);
  if (`${an} <${ae}>` !== identity) blocks.push(`commit ${hash}: author differs from the private identity file`);
  if (`${cn} <${ce}>` !== identity) blocks.push(`commit ${hash}: committer differs from the private identity file`);
  inspect(`commit ${hash} message`, message);
}

for (const b of new Set(blocks)) console.log(`BLOCK ${b}`);
for (const r of new Set(reviews)) console.log(`REVIEW ${r}`);
console.log(`scanned ${scanned} files (${unreadable} unreadable), ${commits} commits:${new Set(blocks).size} blocks, ${new Set(reviews).size} reviews`);
process.exit(blocks.length ? 1 : 0);
