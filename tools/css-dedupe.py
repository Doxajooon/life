#!/usr/bin/env python3
"""One-off cleanup: merge all <style> blocks of index.html into one and drop
declarations that are provably dead (overridden later by the *same selector*
in the *same @media context*). Safe by construction:
  - a later declaration with the same selector has equal specificity and later
    source order, so the earlier one can never win (unless it is !important and
    the later one is not — those are kept);
  - same-block duplicates (intentional fallbacks like 100vh/100dvh) are kept;
  - an earlier value is kept if the later one uses newer CSS (dvh, env(), …),
    so older WebViews still get a fallback;
  - earlier @keyframes with a name redefined later are dropped (later wins).
"""
import re, sys, tinycss2

NEWER = ('dvh', 'svh', 'lvh', 'env(', 'color-mix', 'clamp(', 'min(', 'max(')

def decls(block_tokens):
    out = []  # (name, important, raw_text)
    for d in tinycss2.parse_blocks_contents(block_tokens, skip_whitespace=True, skip_comments=True):
        if d.type == 'declaration':
            out.append((d.lower_name, d.important, tinycss2.serialize([d]).strip(), tinycss2.serialize(d.value).strip()))
        elif d.type == 'qualified-rule' or d.type == 'at-rule':
            out.append((None, False, tinycss2.serialize([d]).strip(), ''))  # nested rule: keep verbatim
    return out

def flatten(rules, ctx, acc):
    for r in rules:
        if r.type == 'qualified-rule':
            sel = re.sub(r'\s+', ' ', tinycss2.serialize(r.prelude)).strip()
            acc.append({'kind': 'rule', 'ctx': ctx, 'sel': sel, 'decls': decls(r.content)})
        elif r.type == 'at-rule' and r.lower_at_keyword in ('media', 'supports', 'container', 'layer') and r.content is not None:
            head = '@' + r.at_keyword + ' ' + re.sub(r'\s+', ' ', tinycss2.serialize(r.prelude)).strip()
            acc.append({'kind': 'open', 'ctx': ctx, 'head': head})
            flatten(tinycss2.parse_rule_list(r.content, skip_whitespace=True, skip_comments=True), ctx + (head,), acc)
            acc.append({'kind': 'close', 'ctx': ctx})
        elif r.type == 'at-rule' and r.lower_at_keyword in ('keyframes', '-webkit-keyframes'):
            name = tinycss2.serialize(r.prelude).strip()
            acc.append({'kind': 'keyframes', 'ctx': ctx, 'name': (r.lower_at_keyword, name), 'text': tinycss2.serialize([r]).strip()})
        elif r.type in ('at-rule',):
            acc.append({'kind': 'raw', 'ctx': ctx, 'text': tinycss2.serialize([r]).strip()})
    return acc

def main(path):
    src = open(path, encoding='utf8').read()
    blocks = list(re.finditer(r'<style[^>]*>([\s\S]*?)</style>', src))
    css = '\n'.join(m.group(1) for m in blocks)
    items = flatten(tinycss2.parse_stylesheet(css, skip_whitespace=True, skip_comments=True), (), [])
    before = sum(len(i['decls']) for i in items if i['kind'] == 'rule')
    # walk backwards remembering what later rules set
    seen = {}       # (ctx, sel, prop) -> (important, newer)
    seen_kf = set()
    for it in reversed(items):
        if it['kind'] == 'keyframes':
            key = (it['ctx'], it['name'])
            if key in seen_kf: it['drop'] = True
            seen_kf.add(key)
        if it['kind'] != 'rule': continue
        keep = []
        local = {}
        for name, imp, raw, val in it['decls']:
            if name is None: keep.append(raw); continue
            local.setdefault(name, []).append((imp, raw, val))
        later_this_block = {}
        for name, imp, raw, val in it['decls']:
            if name is None: continue
            key = (it['ctx'], it['sel'], name)
            prev = seen.get(key)
            dead = prev is not None and (prev[0] or not imp) and not prev[1]
            if not dead: keep.append(raw)
        for name, vals in local.items():
            key = (it['ctx'], it['sel'], name)
            imp = any(v[0] for v in vals); newer = any(any(t in v[2] for t in NEWER) for v in vals)
            if key in seen:
                p = seen[key]; seen[key] = (p[0] or imp, p[1] and newer)
            else:
                seen[key] = (imp, newer)
        it['keep'] = keep
    # rebuild
    out, depth = [], 0
    for it in items:
        k = it['kind']
        if k == 'rule':
            if it['keep']: out.append('  ' * depth + it['sel'] + '{' + ';'.join(it['keep']) + '}')
        elif k == 'open': out.append('  ' * depth + it['head'] + '{'); depth += 1
        elif k == 'close': depth -= 1; out.append('  ' * depth + '}')
        elif k == 'keyframes':
            if not it.get('drop'): out.append('  ' * depth + it['text'])
        else: out.append('  ' * depth + it['text'])
    text = '\n'.join(out)
    text = re.sub(r'@media[^{]*\{\s*\}', '', text)  # empty media blocks
    after = sum(len(i['keep']) for i in items if i['kind'] == 'rule')
    first, last = blocks[0], blocks[-1]
    new = src[:first.start()] + '<style>\n' + text + '\n</style>'
    # keep any markup that sat between style blocks (outside the CSS)
    rest = src[first.end():last.end()]
    between = re.sub(r'<style[^>]*>[\s\S]*?</style>', '', rest)
    new += between + src[last.end():]
    open(path, 'w', encoding='utf8').write(new)
    print(f'declarations {before} -> {after}; css bytes {len(css)} -> {len(text)}; style blocks {len(blocks)} -> 1')

if __name__ == '__main__':
    main(sys.argv[1])
