"""Build data/processed/results_2024.json from the saved Wikipedia 2024 pages.

Output: list of {cycle, type, state, cands:[{name, party, pct}]} sorted by pct desc.
"""
import json, re, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from wiki_tables import table_rows, find_tables, parse_candidates

RAW = os.path.join(os.path.dirname(__file__), '..', 'data', 'raw')
OUT = os.path.join(os.path.dirname(__file__), '..', 'data', 'processed', 'results_2024.json')

PARTY = {'Democratic': 'DEM', 'Republican': 'REP', 'Independent': 'IND', 'Green': 'GRN', 'Libertarian': 'LIB'}

def norm_party(p):
    for k, v in PARTY.items():
        if k.lower() in p.lower():
            return v
    return 'OTH'

def clean_state(s):
    s = re.sub(r'\[.*?\]', '', s)
    s = re.sub(r'\(.*?\)', '', s)
    return s.strip()

def summary_table(h, header_keys):
    for start in find_tables(h):
        rows = table_rows(h, start)
        head = ' | '.join(rows[0]) if rows else ''
        if all(k in head for k in header_keys):
            return rows
    raise SystemExit(f'table with {header_keys} not found')

results = []

# --- Senate -------------------------------------------------------------
h = open(os.path.join(RAW, 'wiki_2024_senate.html'), encoding='utf-8').read()
seen = set()
for start in find_tables(h):
    rows = table_rows(h, start)
    if not rows or 'Candidates' not in ' | '.join(rows[0]):
        continue
    for r in rows:
        if len(r) < 3:
            continue
        cands = parse_candidates(r[-1])
        if len(cands) < 2:
            continue
        state = clean_state(r[0])
        key = ('Sen', state, cands[0][0])
        if key in seen:
            continue
        seen.add(key)
        special = ('special' in r[0].lower()) or ('to finish' in ' '.join(r).lower() and 'see above' not in ' '.join(r).lower()) or (len(results) < 2 and state in ('California', 'Nebraska'))
        results.append({'cycle': 2024, 'type': 'Sen-G', 'state': state,
                        'special': special,
                        'cands': [{'name': n, 'party': norm_party(p), 'pct': pct} for n, p, pct in cands]})

# --- Governor -----------------------------------------------------------
g = open(os.path.join(RAW, 'wiki_2024_gov.html'), encoding='utf-8').read()
rows = summary_table(g, ['State', 'Governor', 'Candidates'])
for r in rows[1:]:
    cands = parse_candidates(r[-1])
    if len(cands) < 2:
        continue
    results.append({'cycle': 2024, 'type': 'Gov-G', 'state': clean_state(r[0]), 'special': False,
                    'cands': [{'name': n, 'party': norm_party(p), 'pct': pct} for n, p, pct in cands]})

# --- President (by state + national) -------------------------------------
p = open(os.path.join(RAW, 'wiki_2024_pres.html'), encoding='utf-8').read()
rows = summary_table(p, ['State or district', 'Trump', 'Harris'])
for r in rows[2:]:
    if len(r) < 8:
        continue
    state = clean_state(r[0]).replace('†', '').strip()
    if re.match(r'^[A-Z]{2}-\d', state):
        continue  # skip congressional-district electoral votes
    try:
        rep = float(r[2].rstrip('%')); dem = float(r[5].rstrip('%'))
    except ValueError:
        continue
    if state.lower().startswith('total') or state.lower().startswith('u.s.'):
        state = 'US'
    results.append({'cycle': 2024, 'type': 'Pres-G', 'state': state, 'special': False,
                    'cands': [{'name': 'Kamala Harris', 'party': 'DEM', 'pct': dem},
                              {'name': 'Donald Trump', 'party': 'REP', 'pct': rep}]})

json.dump(results, open(OUT, 'w', encoding='utf-8'), indent=1)
print(len(results), 'races')
for t in ('Sen-G', 'Gov-G', 'Pres-G'):
    rs = [x for x in results if x['type'] == t]
    print(t, len(rs), [x['state'] for x in rs][:60])
