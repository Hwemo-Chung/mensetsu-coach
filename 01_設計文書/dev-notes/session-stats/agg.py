#!/usr/bin/env python3
"""Aggregate Claude Code transcript usage stats (counts/names only, never content).
Usage: python3 -I agg.py [--json out.json]
"""
import json, glob, os, re, sys, collections
from datetime import datetime, timezone, timedelta

ROOT = os.path.expanduser('~/.claude/projects')
CWD_PREFIX = os.path.expanduser('~/Documents/BuiltWithClaude-2026')  # 非公開フォルダ（-private）と worktree も含む
JST = timezone(timedelta(hours=9))
WINDOWS = {
    'contest': (datetime(2026, 11, 2, 12, 30, tzinfo=JST), datetime(2026, 11, 8, 0, 0, tzinfo=JST)),
    'prep': (datetime(2026, 11, 2, 0, 0, tzinfo=JST), datetime(2026, 11, 2, 12, 30, tzinfo=JST)),
}
EDIT_TOOLS = {'Edit', 'Write', 'MultiEdit', 'NotebookEdit'}
NAME_RE = re.compile(r'^/?[\w:.@-]{1,80}$')


def parse_ts(s):
    try:
        return datetime.fromisoformat(s.replace('Z', '+00:00')).astimezone(JST)
    except Exception:
        return None


def window_of(dt):
    for w, (a, b) in WINDOWS.items():
        if a <= dt < b:
            return w
    return None


def classify_user(r):
    """Return 'human', 'slash', 'bash', or None (tool_result / injection / meta)."""
    if r.get('isMeta') or r.get('isCompactSummary') or r.get('isVisibleInTranscriptOnly'):
        return None
    c = (r.get('message') or {}).get('content')
    if isinstance(c, list):
        types = {b.get('type') for b in c if isinstance(b, dict)}
        if 'tool_result' in types:
            return None
    og = r.get('origin') if isinstance(r.get('origin'), dict) else {}
    if og.get('kind') == 'human' or (not og and r.get('turnOrigin') == 'human'):
        return 'human'
    if og:  # task-notification, auto-continuation, peer, ...
        return None
    if isinstance(c, str):
        s = c.lstrip()
        if s.startswith('<command-name>'):
            return 'slash'
        if s.startswith('<bash-input>'):
            return 'bash'
    return None


def slash_name(c):
    m = re.match(r'\s*<command-name>([^<]*)</command-name>', c or '')
    if m and NAME_RE.match(m.group(1).strip()):
        return m.group(1).strip()
    return '(unparsed)'


def new_bucket():
    return {
        'sessions': set(), 'sub_files': set(), 'human': 0, 'slash': 0, 'bash': 0,
        'assistant_ids': set(), 'tools': collections.Counter(), 'skills': collections.Counter(),
        'agent_types': collections.Counter(), 'slash_names': collections.Counter(),
        'models': collections.defaultdict(lambda: collections.Counter()),
        'files': set(), 'tool_ids': set(), 'prompt_src': collections.Counter(),
    }


def collect_files():
    mains, subs = [], []
    for d in glob.glob(os.path.join(ROOT, '*')):
        name = os.path.basename(d)
        if 'BuiltWithClaude-2026' in name:
            filt = False
        elif name == os.path.expanduser('~').replace('/', '-') and '--exclude-home' not in sys.argv:
            filt = True  # include only records whose cwd is under the project
        else:
            continue
        for f in glob.glob(os.path.join(d, '*.jsonl')):
            mains.append((f, filt))
        for f in glob.glob(os.path.join(d, '*', 'subagents', '**', 'agent-*.jsonl'), recursive=True):
            subs.append((f, filt))
    return mains, subs


def session_matches(path):
    with open(path, errors='replace') as fh:
        for line in fh:
            if CWD_PREFIX in line:
                try:
                    r = json.loads(line)
                except Exception:
                    continue
                if str(r.get('cwd', '')).startswith(CWD_PREFIX):
                    return True
    return False


def run():
    mains, subs = collect_files()
    # key: (kind, window, day or 'TOTAL')
    B = collections.defaultdict(new_bucket)
    seen_uuid = set()
    msg_usage = {}  # (kind, msg_id) -> [model, usage-max dict, window, day]
    meta = collections.Counter()
    wf_runs = {w: set() for w in WINDOWS}

    def handle(path, kind, filt):
        if filt and not session_matches(path):
            meta[f'{kind}_files_skipped_cwd'] += 1
            return
        meta[f'{kind}_files_scanned'] += 1
        last_cwd_ok = not filt
        with open(path, errors='replace') as fh:
            for line in fh:
                try:
                    r = json.loads(line)
                except Exception:
                    meta['bad_lines'] += 1
                    continue
                t = r.get('type')
                if t not in ('user', 'assistant'):
                    continue
                if filt:
                    last_cwd_ok = str(r.get('cwd', '')).startswith(CWD_PREFIX)
                    if not last_cwd_ok:
                        continue
                u = r.get('uuid')
                if u:
                    if u in seen_uuid:
                        meta['dup_uuid_skipped'] += 1
                        continue
                    seen_uuid.add(u)
                dt = parse_ts(r.get('timestamp', ''))
                if not dt:
                    continue
                w = window_of(dt)
                if not w:
                    continue
                day = dt.strftime('%m-%d')
                bs = [B[(kind, w, day)], B[(kind, w, 'TOTAL')]]
                sid = r.get('sessionId')
                for b in bs:
                    if kind == 'sub':
                        b['sub_files'].add(path)
                if t == 'user':
                    c = classify_user(r)
                    if c:
                        for b in bs:
                            b[c] += 1
                            if c in ('human', 'slash', 'bash') and kind == 'main':
                                b['sessions'].add(sid)
                            if c == 'human':
                                b['prompt_src'][str(r.get('promptSource'))] += 1
                            if c == 'slash':
                                b['slash_names'][slash_name(r['message'].get('content'))] += 1
                    continue
                m = r.get('message') or {}
                mid = m.get('id') or u
                model = m.get('model') or '(none)'
                key = (kind, mid)
                us = m.get('usage') or {}
                cur = msg_usage.get(key)
                if cur is None:
                    msg_usage[key] = cur = [model, collections.Counter(), w, day]
                for k in ('input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens'):
                    v = us.get(k) or 0
                    if isinstance(v, int) and v > cur[1][k]:
                        cur[1][k] = v  # streamed chunks repeat usage; take max per field
                for b in bs:
                    b['assistant_ids'].add(mid)
                for blk in m.get('content') or []:
                    if not isinstance(blk, dict) or blk.get('type') != 'tool_use':
                        continue
                    tid = blk.get('id')
                    name = blk.get('name') or '?'
                    inp = blk.get('input') if isinstance(blk.get('input'), dict) else {}
                    for b in bs:
                        if tid in b['tool_ids']:
                            continue
                        b['tool_ids'].add(tid)
                        b['tools'][name] += 1
                        if name == 'Skill':
                            sk = str(inp.get('skill', ''))
                            b['skills'][sk if NAME_RE.match(sk) else '(unparsed)'] += 1
                        if name in ('Agent', 'Task'):
                            st = str(inp.get('subagent_type') or '(default)')
                            b['agent_types'][st if NAME_RE.match(st) else '(other)'] += 1
                        if name in EDIT_TOOLS:
                            fp = inp.get('file_path') or inp.get('notebook_path')
                            if fp:
                                b['files'].add(fp)

    for f, filt in mains:
        handle(f, 'main', filt)
    for f, filt in subs:
        handle(f, 'sub', filt)
        mwf = re.search(r'/workflows/(wf_[^/]+)/', f)
        if mwf:
            meta['workflow_agent_files'] += 1

    # model / token aggregation from deduped messages
    for (kind, mid), (model, us, w, day) in msg_usage.items():
        for d in (day, 'TOTAL'):
            mc = B[(kind, w, d)]['models'][model]
            mc['msgs'] += 1
            for k, v in us.items():
                mc[k] += v

    # workflow runs: distinct wf dirs with any agent file active in window
    return B, meta


def fmt(B, meta):
    out = []
    out.append('META ' + json.dumps(dict(meta)))
    for w in WINDOWS:
        days = sorted({k[2] for k in B if k[1] == w and k[2] != 'TOTAL'}) + ['TOTAL']
        out.append(f'\n===== WINDOW {w} =====')
        out.append('day   | sessions human slash bash | main_asst main_tools tools/human | sub_files sub_asst sub_tools | files_edited(main,sub,union)')
        for d in days:
            m, s = B[('main', w, d)], B[('sub', w, d)]
            mt, st = sum(m['tools'].values()), sum(s['tools'].values())
            ratio = f"{mt / m['human']:.1f}" if m['human'] else '-'
            ratio_all = f"{(mt + st) / m['human']:.1f}" if m['human'] else '-'
            out.append(f"{d:5} | {len(m['sessions']):8} {m['human']:5} {m['slash']:5} {m['bash']:4} | {len(m['assistant_ids']):9} {mt:10} {ratio:>6}(all {ratio_all}) | {len(s['sub_files']):9} {len(s['assistant_ids']):8} {st:9} | {len(m['files'])},{len(s['files'])},{len(m['files'] | s['files'])} in-project:{sum(1 for f in m['files'] | s['files'] if str(f).startswith(CWD_PREFIX))}")
        for kind in ('main', 'sub'):
            b = B[(kind, w, 'TOTAL')]
            out.append(f'\n-- {w} {kind} top tools: ' + json.dumps(b['tools'].most_common(25)))
            out.append(f'-- {w} {kind} skills: ' + json.dumps(b['skills'].most_common()))
            out.append(f'-- {w} {kind} agent subagent_types: ' + json.dumps(b['agent_types'].most_common()))
            if kind == 'main':
                out.append(f'-- {w} main human promptSource: ' + json.dumps(b['prompt_src'].most_common()))
                out.append(f'-- {w} main slash commands: ' + json.dumps(b['slash_names'].most_common()))
            mcp = sum(v for k, v in b['tools'].items() if k.startswith('mcp__'))
            out.append(f'-- {w} {kind} mcp__ total: {mcp}')
            for model, mc in sorted(b['models'].items()):
                out.append(f'-- {w} {kind} model {model}: ' + json.dumps(dict(mc)))
        for d in days[:-1]:
            for kind in ('main', 'sub'):
                for model, mc in sorted(B[(kind, w, d)]['models'].items()):
                    out.append(f'   day {d} {kind} {model}: ' + json.dumps(dict(mc)))
    return '\n'.join(out)


def _selftest():
    assert window_of(datetime(2026, 11, 2, 3, 30, tzinfo=timezone.utc)) == 'contest'
    assert window_of(datetime(2026, 11, 2, 3, 29, tzinfo=timezone.utc)) == 'prep'
    assert window_of(datetime(2026, 11, 7, 14, 59, tzinfo=timezone.utc)) == 'contest'
    assert window_of(datetime(2026, 11, 7, 15, 0, tzinfo=timezone.utc)) is None
    assert parse_ts('2026-11-01T15:00:00.000Z').strftime('%m-%d %H') == '11-02 00'
    assert classify_user({'origin': {'kind': 'human'}, 'message': {'content': 'x'}}) == 'human'
    assert classify_user({'origin': {'kind': 'task-notification'}, 'message': {'content': 'x'}}) is None
    assert classify_user({'message': {'content': [{'type': 'tool_result'}]}}) is None
    assert classify_user({'isMeta': True, 'origin': {'kind': 'human'}, 'message': {'content': 'x'}}) is None
    assert classify_user({'message': {'content': '<command-name>/clear</command-name>'}}) == 'slash'
    assert slash_name('<command-name>/model</command-name>') == '/model'


if __name__ == '__main__':
    _selftest()
    B, meta = run()
    print(fmt(B, meta))
