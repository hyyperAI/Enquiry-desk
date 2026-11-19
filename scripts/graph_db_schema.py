"""Turn docs/db-schema.md into graphify nodes/edges and cache them, so the graph covers the live database.

Run from the repo root with graphify's interpreter, after regenerating docs/db-schema.md:
    & (Get-Content graphify-out/.graphify_python) scripts/graph_db_schema.py
"""
import re
from pathlib import Path

from graphify.cache import save_semantic_cache

ROOT = Path(__file__).resolve().parent.parent
SCHEMA = ROOT / 'docs' / 'db-schema.md'
API = ROOT / 'src' / 'lib' / 'api.js'
SPEC = Path.home() / '.claude' / 'skills' / 'graphify' / 'references' / 'extraction-spec.md'
SRC = str(SCHEMA)


def nid(name):
    return 'docs_db_schema_' + re.sub(r'\W', '_', name.lower())


def edge(s, t, rel, src=SRC, conf=1.0):
    return {'source': s, 'target': t, 'relation': rel, 'confidence': 'EXTRACTED', 'confidence_score': conf,
            'source_file': src, 'source_location': None, 'weight': 1.0}


def api_functions():
    """Map each line of api.js to the exported function that contains it."""
    spans, current = {}, None
    for i, line in enumerate(API.read_text(encoding='utf-8').splitlines(), 1):
        m = re.match(r'\s*export\s+(?:async\s+)?(?:function\s+(\w+)|const\s+(\w+)\s*=)', line)
        if m:
            current = m.group(1) or m.group(2)
        spans[i] = current
    return spans


def main():
    text = SCHEMA.read_text(encoding='utf-8')
    tables_part, funcs_part = text.split('## Functions', 1)
    nodes, edges = {}, []

    def add(name, label, ftype='concept', loc=None):
        nodes.setdefault(nid(name), {'id': nid(name), 'label': label, 'file_type': ftype, 'source_file': SRC,
                                     'source_location': loc, 'source_url': None, 'captured_at': None,
                                     'author': None, 'contributor': None})

    db = 'supabase_db'
    add(db, 'Supabase database (jetwing)')
    tables = []
    for block in re.split(r'\n### ', tables_part)[1:]:
        name = block.split('\n', 1)[0].strip()
        tables.append(name)
        add(name, f'table {name}')
        edges.append(edge(nid(name), nid(db), 'references'))
        for fk in re.findall(r'-> (\w+)\.\w+', block.split('- fk:', 1)[1].split('\n', 1)[0] if '- fk:' in block else ''):
            if fk != 'auth' and fk in tables_part:
                edges.append(edge(nid(name), nid(fk), 'references'))
        trig = re.search(r'- triggers: (.+)', block)
        if trig:
            for fn in re.findall(r'-> (\w+)', trig.group(1)):
                add(fn, f'db function {fn}()')
                edges.append(edge(nid(name), nid(fn), 'calls'))

    for fn in re.findall(r'^- (\w+)\(', funcs_part, re.M):
        add(fn, f'db function {fn}()')
        edges.append(edge(nid(fn), nid(db), 'references'))

    realtime = re.search(r'Realtime publication: (.+)', text).group(1).split(', ')
    add('realtime', 'Supabase Realtime publication')
    for t in realtime:
        edges.append(edge(nid(t), nid('realtime'), 'references'))

    # Link api.js functions to the tables and RPCs they touch.
    spans = api_functions()
    seen = set()
    for i, line in enumerate(API.read_text(encoding='utf-8').splitlines(), 1):
        fn = spans.get(i)
        if not fn:
            continue
        for kind, target in re.findall(r"\.(from|rpc)\(['\"](\w+)['\"]", line):
            if nid(target) not in nodes:
                continue
            key = (fn, target)
            if key in seen:
                continue
            seen.add(key)
            edges.append(edge('src_lib_api_' + fn.lower(), nid(target),
                              'calls' if kind == 'rpc' else 'shares_data_with', src=SRC))

    saved = save_semantic_cache(list(nodes.values()), edges, [], root=str(ROOT), allowed_source_files=[SRC],
                                prompt_file=str(SPEC))
    print(f'db schema: {len(nodes)} nodes, {len(edges)} edges, {len(seen)} api.js links, cached {saved} file')


if __name__ == '__main__':
    main()
