"""Build web/src/data/data.json.

Steps
 1. Historical polls (2014-2022) from FiveThirtyEight's pollster-ratings archive.
 2. 2024 polls from the archived 538 poll files, joined to 2024 results.
 3. Per-pollster bias statistics (three weighting modes) + per-cycle breakdown.
 4. 2026 Senate matchups: nominees from Wikipedia, polls from VoteHub.
 5. Pollster selection (featured 5 + more) and final JSON.
"""
import csv, json, os, re, sys, math, datetime, collections, unicodedata
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from wiki_tables import table_rows, find_tables, parse_candidates

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
RAW = os.path.join(ROOT, 'data', 'raw')
PROC = os.path.join(ROOT, 'data', 'processed')
OUT = os.path.join(ROOT, 'web', 'src', 'data', 'data.json')
TODAY = datetime.date.today()

TYPES = {'Sen-G': 'Senate', 'Gov-G': 'Governor', 'Pres-G': 'President'}
MAX_DAYS_OUT = 21          # only polls in the final three weeks count (538 convention)
DECAY = 0.7                # per-cycle (2-year) weight decay for recency mode
SHRINK_K = 5               # prior weight (in polls) pulling small samples toward 0 bias
STATE_K = 4                # prior weight (in polls) pulling a state record toward the pollster's overall bias
RECENT_DAYS = 60           # window for a pollster's "current" 2026 estimate
MIN_HIST = 20              # polls needed to compute a usable bias
FIRST_CYCLE = 2014
LATEST = 2024

STATE_ABBR = {'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR', 'California': 'CA', 'Colorado': 'CO',
              'Connecticut': 'CT', 'Delaware': 'DE', 'D.C.': 'DC', 'District of Columbia': 'DC', 'Florida': 'FL',
              'Georgia': 'GA', 'Hawaii': 'HI', 'Idaho': 'ID', 'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA',
              'Kansas': 'KS', 'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
              'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS', 'Missouri': 'MO',
              'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ',
              'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH',
              'Oklahoma': 'OK', 'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
              'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT', 'Vermont': 'VT', 'Virginia': 'VA',
              'Washington': 'WA', 'West Virginia': 'WV', 'Wisconsin': 'WI', 'Wyoming': 'WY', 'US': 'US'}


def norm(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', ' ', s.lower()).strip()


def last(n):
    t = norm(n).split()
    t = [x for x in t if x not in ('jr', 'sr', 'ii', 'iii')]
    return t[-1] if t else ''


# ---------------------------------------------------------------------------
# 1. Historical polls from the 538 archive
# ---------------------------------------------------------------------------
hist = []            # dicts: pid, cycle, type, state, poll, actual
names = {}           # rating_id -> display name
for r in csv.DictReader(open(os.path.join(RAW, 'raw_polls.csv'), encoding='utf-8')):
    cyc = int(r['cycle'])
    if cyc < FIRST_CYCLE or cyc % 2 or r['type_simple'] not in TYPES:
        continue
    if r['cand1_party'] != 'DEM' or r['cand2_party'] != 'REP':
        continue
    if r['partisan'] != 'NA' or int(r['time_to_election']) > MAX_DAYS_OUT:
        continue
    pid = r['pollster_rating_id']
    names[pid] = r['pollster']
    hist.append({'pid': pid, 'cycle': cyc, 'type': r['type_simple'], 'state': r['location'],
                 'poll': float(r['margin_poll']), 'actual': float(r['margin_actual'])})
print('archive polls kept:', len(hist))

# ---------------------------------------------------------------------------
# 2. 2024 polls joined to 2024 results
# ---------------------------------------------------------------------------
results24 = json.load(open(os.path.join(PROC, 'results_2024.json'), encoding='utf-8'))
res_index = collections.defaultdict(list)   # (type, state) -> [race]
for race in results24:
    res_index[(race['type'], race['state'])].append(race)

ELECTION24 = datetime.date(2024, 11, 5)


def pdate(s):
    m, d, y = s.split('/')
    return datetime.date(2000 + int(y), int(m), int(d))


POP_RANK = {'lv': 0, 'rv': 1, 'v': 2, 'a': 3, '': 4}
kept24 = 0
for fname, typ in [('senate_polls.2024.csv', 'Sen-G'), ('governor_polls.2024.csv', 'Gov-G'),
                   ('president_polls.2024.csv', 'Pres-G')]:
    rows = [r for r in csv.DictReader(open(os.path.join(RAW, fname), encoding='utf-8'))
            if r['cycle'] == '2024' and r['stage'] == 'general' and not r['partisan']
            and r['internal'] != 'true' and r['hypothetical'] != 'true']
    byq = collections.defaultdict(list)
    for r in rows:
        byq[r['question_id']].append(r)
    bypoll = collections.defaultdict(list)
    for qid, ans in byq.items():
        bypoll[ans[0]['poll_id']].append(ans)
    for pollid, qs in bypoll.items():
        qs.sort(key=lambda a: POP_RANK.get(a[0]['population'], 5))   # prefer likely voters
        for ans in qs:
            r0 = ans[0]
            days = (ELECTION24 - pdate(r0['end_date'])).days
            if days < 0 or days > MAX_DAYS_OUT:
                break
            state = r0['state'] or 'US'
            if 'CD-' in state:
                break
            dem = [a for a in ans if a['party'] == 'DEM']
            rep = [a for a in ans if a['party'] == 'REP']
            if len(dem) != 1 or len(rep) != 1:
                continue
            match = None
            for race in res_index.get((typ, state), []):
                rd = [c for c in race['cands'] if c['party'] == 'DEM']
                rr = [c for c in race['cands'] if c['party'] == 'REP']
                if not rd or not rr:
                    continue
                if last(rd[0]['name']) == last(dem[0]['candidate_name']) and \
                   last(rr[0]['name']) == last(rep[0]['candidate_name']):
                    match = (rd[0], rr[0])
                    break
            if not match:
                continue
            pid = r0['pollster_rating_id']
            names.setdefault(pid, r0['pollster_rating_name'])
            hist.append({'pid': pid, 'cycle': 2024, 'type': typ, 'state': STATE_ABBR.get(state, state),
                         'poll': float(dem[0]['pct']) - float(rep[0]['pct']),
                         'actual': match[0]['pct'] - match[1]['pct']})
            kept24 += 1
            break
print('2024 polls joined:', kept24)
for h in hist:
    h['bias'] = h['poll'] - h['actual']     # positive = poll overstated the Democrat


# ---------------------------------------------------------------------------
# 3. Bias statistics
# ---------------------------------------------------------------------------
def weight(cycle, mode):
    if mode == 'recency':
        return DECAY ** ((LATEST - cycle) / 2)
    if mode == 'flat':
        return 1.0
    return 1.0 if cycle == LATEST else 0.0


def stats(polls, list_polls=True):
    out = {}
    for mode in ('recency', 'flat', 'latest'):
        w = [weight(p['cycle'], mode) for p in polls]
        sw = sum(w)
        if sw == 0:
            out[mode] = None
            continue
        swb = sum(wi * p['bias'] for wi, p in zip(w, polls))
        raw = swb / sw
        shrunk = swb / (sw + SHRINK_K)
        var = sum(wi * (p['bias'] - shrunk) ** 2 for wi, p in zip(w, polls)) / sw
        mae = sum(wi * abs(p['bias']) for wi, p in zip(w, polls)) / sw
        out[mode] = {'bias': round(shrunk, 2), 'raw_bias': round(raw, 2), 'sigma': round(math.sqrt(var), 2),
                     'mae': round(mae, 2), 'n': sum(1 for x in w if x > 0), 'n_eff': round(sw, 1)}
    # per-state record: weighted sums only; the site blends them with the overall bias
    by_state = {}
    for st in sorted({p['state'] for p in polls}):
        ps = [p for p in polls if p['state'] == st]
        entry = {}
        for mode in ('recency', 'flat', 'latest'):
            w = [weight(p['cycle'], mode) for p in ps]
            sw = sum(w)
            if sw == 0:
                continue
            entry[mode] = {'n': sum(1 for x in w if x > 0), 'n_eff': round(sw, 2),
                           'sum_wb': round(sum(wi * p['bias'] for wi, p in zip(w, ps)), 3),
                           'raw_bias': round(sum(wi * p['bias'] for wi, p in zip(w, ps)) / sw, 2),
                           'cycles': sorted({p['cycle'] for p in ps})}
        if entry:
            # year-by-year rows for this state, plus every individual poll when the list is short
            years = []
            for cyc in sorted({p['cycle'] for p in ps}):
                q = [p for p in ps if p['cycle'] == cyc]
                years.append({'cycle': cyc, 'n': len(q),
                              'poll_avg': round(sum(p['poll'] for p in q) / len(q), 2),
                              'actual_avg': round(sum(p['actual'] for p in q) / len(q), 2),
                              'bias': round(sum(p['bias'] for p in q) / len(q), 2)})
            entry['years'] = years
            if list_polls:
                entry['polls'] = [{'cycle': p['cycle'], 'type': p['type'], 'poll': round(p['poll'], 1),
                                   'actual': round(p['actual'], 1), 'bias': round(p['bias'], 1)}
                                  for p in sorted(ps, key=lambda p: (-p['cycle'], p['type']))]
            by_state[st] = entry
    out['by_state'] = by_state
    cycles = []
    for cyc in sorted({p['cycle'] for p in polls}):
        ps = [p for p in polls if p['cycle'] == cyc]
        by_type = {}
        for t in TYPES:
            q = [p for p in ps if p['type'] == t]
            if q:
                by_type[t] = {'n': len(q), 'bias': round(sum(p['bias'] for p in q) / len(q), 2)}
        worst = max(ps, key=lambda p: abs(p['bias']))
        cycles.append({'cycle': cyc, 'n': len(ps),
                       'bias': round(sum(p['bias'] for p in ps) / len(ps), 2),
                       'mae': round(sum(abs(p['bias']) for p in ps) / len(ps), 2),
                       'poll_avg': round(sum(p['poll'] for p in ps) / len(ps), 2),
                       'actual_avg': round(sum(p['actual'] for p in ps) / len(ps), 2),
                       'right_side': sum(1 for p in ps if (p['poll'] > 0) == (p['actual'] > 0)),
                       'too_dem': sum(1 for p in ps if p['bias'] > 0),
                       'worst': {'state': worst['state'], 'type': worst['type'], 'poll': round(worst['poll'], 1),
                                 'actual': round(worst['actual'], 1), 'bias': round(worst['bias'], 1)},
                       'by_type': by_type})
    return out, cycles


by_pid = collections.defaultdict(list)
for h in hist:
    by_pid[h['pid']].append(h)
pooled_stats, pooled_cycles = stats(hist, list_polls=False)

# ---------------------------------------------------------------------------
# 4. 2026 Senate races
# ---------------------------------------------------------------------------
PARTY = {'democratic': 'DEM', 'dfl': 'DEM', 'republican': 'REP', 'independent': 'IND',
         'libertarian': 'LIB', 'green': 'GRN'}


def party_of(p):
    return PARTY.get(p.strip().lower(), 'OTH')


h = open(os.path.join(RAW, 'wiki_2026_senate.html'), encoding='utf-8').read()
nominees = {}        # state key -> [{name, party}]
ratings = {}         # state key -> {outlet: rating}
CAND2026 = re.compile(r'▌\s*([^▌(]+?)\s*\(\s*([^)]+?)\s*\)')
for start in find_tables(h):
    rows = table_rows(h, start)
    if not rows:
        continue
    head = ' | '.join(rows[0])
    if 'Candidates' in head and len(rows) > 3:
        for r in rows[2:]:
            if len(r) < 2 or not r[0]:
                continue
            st = re.sub(r'\(.*?\)', '', r[0]).strip()
            key = st + (' (special)' if 'special' in r[0].lower() or '(Class 3)' in r[0] else '')
            cands = [{'name': n.strip(), 'party': party_of(p)} for n, p in CAND2026.findall(r[-1])]
            if cands:
                nominees.setdefault(key, []).extend(cands)
    if 'Ratings' in head and len(rows) > 10:
        outlets = [re.sub(r'\[.*?\]', '', c).strip() for c in rows[1][1:]]
        for r in rows[2:]:
            if len(r) < 3 or 'Overall' in r[0]:
                continue
            ratings[r[0].strip()] = dict(zip(outlets, [c.strip() for c in r[1:]]))
print('nominee tables:', len(nominees), 'states; ratings:', len(ratings),
      list(next(iter(ratings.values())).keys()) if ratings else None)

# VoteHub pollster -> 538 rating id
norm_names = {norm(v): k for k, v in names.items()}
ALIASES = {
    'university of new hampshire': '357', 'university of new hampshire survey center': '357',
    'beacon research shaw co research': '103', 'the new york times siena university': '448',
    'marist university': '183', 'glengariff group inc': '117', 'mitchell research communications': '213',
    'cyngal': '67',
}
for fname in ('senate_polls.2024.csv', 'president_polls.2024.csv', 'governor_polls.2024.csv'):
    for r in csv.DictReader(open(os.path.join(RAW, fname), encoding='utf-8')):
        norm_names.setdefault(norm(r['pollster_rating_name']), r['pollster_rating_id'])
        norm_names.setdefault(norm(r['pollster']), r['pollster_rating_id'])
        names.setdefault(r['pollster_rating_id'], r['pollster_rating_name'])


def resolve(vh_name):
    n = norm(vh_name)
    if n in ALIASES:
        return ALIASES[n]
    if n in norm_names:
        return norm_names[n]
    return 'VH:' + n


vh = json.load(open(os.path.join(RAW, 'votehub_senate.json'), encoding='utf-8'))
polls26 = [p for p in vh if p['subject'] and p['subject'].startswith('2026 ')
           and not any(k in p['subject'] for k in ('Democratic', 'Republican', '-'))
           and not p['internal'] and not p['partisan']]
print('2026 general non-partisan polls:', len(polls26))

STATE_ORDER = ['Alabama', 'Alaska', 'Arkansas', 'Colorado', 'Delaware', 'Florida (special)', 'Georgia', 'Idaho',
               'Illinois', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Massachusetts', 'Michigan',
               'Minnesota', 'Mississippi', 'Montana', 'Nebraska', 'New Hampshire', 'New Jersey', 'New Mexico',
               'North Carolina', 'Ohio (special)', 'Oklahoma', 'Oregon', 'Rhode Island', 'South Carolina',
               'South Dakota', 'Tennessee', 'Texas', 'Virginia', 'West Virginia', 'Wyoming']
ABBR = {'Alabama': 'AL', 'Alaska': 'AK', 'Arkansas': 'AR', 'Colorado': 'CO', 'Delaware': 'DE', 'Florida': 'FL',
        'Georgia': 'GA', 'Idaho': 'ID', 'Illinois': 'IL', 'Iowa': 'IA', 'Kansas': 'KS', 'Kentucky': 'KY',
        'Louisiana': 'LA', 'Maine': 'ME', 'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN',
        'Mississippi': 'MS', 'Montana': 'MT', 'Nebraska': 'NE', 'New Hampshire': 'NH', 'New Jersey': 'NJ',
        'New Mexico': 'NM', 'North Carolina': 'NC', 'Ohio': 'OH', 'Oklahoma': 'OK', 'Oregon': 'OR',
        'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX',
        'Virginia': 'VA', 'West Virginia': 'WV', 'Wyoming': 'WY'}
HELD = {'Alabama': 'R', 'Alaska': 'R', 'Arkansas': 'R', 'Colorado': 'D', 'Delaware': 'D', 'Florida (special)': 'R',
        'Georgia': 'D', 'Idaho': 'R', 'Illinois': 'D', 'Iowa': 'R', 'Kansas': 'R', 'Kentucky': 'R', 'Louisiana': 'R',
        'Maine': 'R', 'Massachusetts': 'D', 'Michigan': 'D', 'Minnesota': 'D', 'Mississippi': 'R', 'Montana': 'R',
        'Nebraska': 'R', 'New Hampshire': 'D', 'New Jersey': 'D', 'New Mexico': 'D', 'North Carolina': 'R',
        'Ohio (special)': 'R', 'Oklahoma': 'R', 'Oregon': 'D', 'Rhode Island': 'D', 'South Carolina': 'R',
        'South Dakota': 'R', 'Tennessee': 'R', 'Texas': 'R', 'Virginia': 'D', 'West Virginia': 'R', 'Wyoming': 'R'}
INCUMBENT = {'Alabama': 'open', 'Alaska': 'Dan Sullivan', 'Arkansas': 'Tom Cotton', 'Colorado': 'John Hickenlooper',
             'Delaware': 'Chris Coons', 'Florida (special)': 'Ashley Moody', 'Georgia': 'Jon Ossoff',
             'Idaho': 'Jim Risch', 'Illinois': 'open', 'Iowa': 'open', 'Kansas': 'Roger Marshall', 'Kentucky': 'open',
             'Louisiana': 'open', 'Maine': 'Susan Collins', 'Massachusetts': 'Ed Markey', 'Michigan': 'open',
             'Minnesota': 'open', 'Mississippi': 'Cindy Hyde-Smith', 'Montana': 'open', 'Nebraska': 'Pete Ricketts',
             'New Hampshire': 'open', 'New Jersey': 'Cory Booker', 'New Mexico': 'Ben Ray Luján',
             'North Carolina': 'open', 'Ohio (special)': 'Jon Husted', 'Oklahoma': 'open', 'Oregon': 'Jeff Merkley',
             'Rhode Island': 'Jack Reed', 'South Carolina': 'open', 'South Dakota': 'Mike Rounds',
             'Tennessee': 'Bill Hagerty', 'Texas': 'open', 'Virginia': 'Mark Warner',
             'West Virginia': 'Shelley Moore Capito', 'Wyoming': 'open'}


def tokens(n):
    return set(norm(n).split()) - {'jr', 'sr', 'ii', 'iii'}


def match_choice(choice, cands):
    ct = tokens(choice)
    best = None
    for c in cands:
        nt = tokens(c['name'])
        if ct & nt and last(choice) == last(c['name']):
            score = len(ct & nt)
            if not best or score > best[0]:
                best = (score, c)
    return best[1] if best else None


races = []
unmatched = collections.Counter()
cut120 = (TODAY - datetime.timedelta(days=120)).isoformat()
for key in STATE_ORDER:
    state = key.replace(' (special)', '')
    cands = nominees.get(key, [])
    if state == 'Alaska':   # Wikipedia lists two Sullivans; keep the incumbent under his common name
        cands = [c for c in cands if 'Dan J' not in c['name']]
        for c in cands:
            if 'Sullivan' in c['name']:
                c['name'] = 'Dan Sullivan'
    sp = [p for p in polls26 if p['subject'] == '2026 ' + state]
    parsed = []
    for p in sp:
        pairs = []
        for a in p['answers']:
            c = match_choice(a['choice'], cands)
            if c:
                pairs.append((c, a['pct']))
            else:
                unmatched[(state, a['choice'])] += 1
        parsed.append((p, pairs))
    rep = [c for c in cands if c['party'] == 'REP']
    nonrep = [c for c in cands if c['party'] != 'REP']
    # matchup: the Republican nominee vs the strongest non-Republican in polls from the last 120 days
    perf = collections.defaultdict(list)
    for p, pairs in parsed:
        if p['end_date'] < cut120:
            continue
        for c, pct in pairs:
            if c['party'] != 'REP':
                perf[c['name']].append(pct)
    if perf:
        top = max(perf, key=lambda n: (sum(perf[n]) / len(perf[n]), len(perf[n])))
        cand1 = next(c for c in cands if c['name'] == top)
    else:
        dems = [c for c in nonrep if c['party'] == 'DEM']
        cand1 = dems[0] if dems else (nonrep[0] if nonrep else None)
    # Republican: the nominee who actually appears in polls (Wikipedia lists minor R candidates too)
    rep_seen = collections.Counter(c['name'] for p, pairs in parsed for c, pct in pairs if c['party'] == 'REP')
    cand2 = (next(c for c in rep if c['name'] == rep_seen.most_common(1)[0][0]) if rep_seen
             else (rep[0] if rep else None))
    plist = []
    for p, pairs in parsed:
        d = {c['name']: pct for c, pct in pairs}
        n1 = cand1['name'] if cand1 else None
        n2 = cand2['name'] if cand2 else None
        if n1 in d and n2 in d:
            plist.append({'pollster_vh': p['pollster'], 'pid': resolve(p['pollster']), 'start': p['start_date'],
                          'end': p['end_date'], 'n': p['sample_size'], 'pop': p['population'],
                          'pct1': d[n1], 'pct2': d[n2], 'margin': round(d[n1] - d[n2], 1),
                          'url': p['url'], 'sponsors': p['sponsors']})
    plist.sort(key=lambda x: x['end'], reverse=True)
    races.append({'key': key, 'state': state, 'abbr': ABBR[state], 'special': '(special)' in key,
                  'held': HELD[key], 'incumbent': INCUMBENT[key], 'cand1': cand1, 'cand2': cand2,
                  'ratings': ratings.get(key, {}), 'polls': plist})
print('unmatched choices (top):', unmatched.most_common(12))

recent_cut = (TODAY - datetime.timedelta(days=RECENT_DAYS)).isoformat()


def estimate(polls):
    """Average of up to 3 most-recent polls inside the window; else the latest poll, flagged stale."""
    if not polls:
        return None
    recent = [p for p in polls if p['end'] >= recent_cut][:3]
    use = recent if recent else polls[:1]
    m = sum(p['margin'] for p in use) / len(use)
    return {'margin': round(m, 1), 'n_polls': len(use), 'latest': use[0]['end'], 'stale': not recent,
            'total_polls': len(polls)}


for race in races:
    byp = collections.defaultdict(list)
    for p in race['polls']:
        byp[p['pid']].append(p)
    race['by_pollster'] = {pid: estimate(ps) for pid, ps in byp.items()}
    latest = [ps[0]['margin'] for ps in byp.values() if ps[0]['end'] >= recent_cut]
    race['consensus'] = ({'margin': round(sum(latest) / len(latest), 1), 'n_pollsters': len(latest)}
                         if latest else None)

# ---------------------------------------------------------------------------
# 5. Pollster selection
# ---------------------------------------------------------------------------
coverage = collections.defaultdict(set)
volume = collections.Counter()
vh_names = collections.defaultdict(collections.Counter)
for race in races:
    for p in race['polls']:
        coverage[p['pid']].add(race['key'])
        volume[p['pid']] += 1
        vh_names[p['pid']][p['pollster_vh']] += 1
cands_p = []
for pid in coverage:
    if len(by_pid.get(pid, [])) < MIN_HIST or len(coverage[pid]) < 2:
        continue
    cands_p.append((len(coverage[pid]), len(by_pid[pid]), volume[pid], pid))
cands_p.sort(reverse=True)   # races polled in 2026, then depth of track record
cands_p = [(a, c, d) for a, b, c, d in cands_p]
print('eligible pollsters:')
for cov, vol, pid in cands_p:
    st = stats(by_pid[pid])[0]
    print(f'  {pid:>5} {names.get(pid, pid):45s} states={cov:2d} polls={vol:3d} hist={len(by_pid[pid]):4d} '
          f'bias rec={st["recency"]["bias"]:+.1f} flat={st["flat"]["bias"]:+.1f} '
          f'2024={(st["latest"] or {}).get("bias", float("nan")):+.1f} sigma={st["recency"]["sigma"]:.1f}')
skipped = sorted(((len(coverage[p]), volume[p], p, next(iter(vh_names[p]))) for p in coverage
                  if len(coverage[p]) >= 2 and len(by_pid.get(p, [])) < MIN_HIST), reverse=True)
print('skipped for thin history:', skipped[:12])
excluded = [{'name': nm, 'states_2026': cov, 'polls_2026': vol, 'hist_n': len(by_pid.get(p, []))}
            for cov, vol, p, nm in skipped]

pollsters = []
for i, (cov, vol, pid) in enumerate(cands_p):
    st, cyc = stats(by_pid[pid])
    pollsters.append({'id': pid, 'name': names.get(pid, pid), 'vh_name': next(iter(vh_names[pid])),
                      'featured': i < 5, 'states_2026': sorted(coverage[pid]), 'polls_2026': vol,
                      'stats': st, 'cycles': cyc, 'hist_n': len(by_pid[pid])})
pollsters.insert(0, {'id': 'ALL', 'name': 'All pollsters (pooled)', 'vh_name': None, 'featured': False,
                     'states_2026': sorted({r['key'] for r in races if r['consensus']}),
                     'polls_2026': sum(len(r['polls']) for r in races),
                     'stats': pooled_stats, 'cycles': pooled_cycles, 'hist_n': len(hist)})

industry = []
for cyc in sorted({x['cycle'] for x in hist}):
    row = {'cycle': cyc}
    for t in TYPES:
        q = [x['bias'] for x in hist if x['cycle'] == cyc and x['type'] == t]
        row[t] = {'n': len(q), 'bias': round(sum(q) / len(q), 2)} if q else None
    allq = [x['bias'] for x in hist if x['cycle'] == cyc]
    row['all'] = {'n': len(allq), 'bias': round(sum(allq) / len(allq), 2),
                  'mae': round(sum(abs(x) for x in allq) / len(allq), 2)}
    industry.append(row)
# the pooled per-cycle table (poll avg, result avg, worst miss) lives on the ALL pollster's cycles

out = {
    'meta': {'built': TODAY.isoformat(), 'election_date': '2026-11-03', 'first_cycle': FIRST_CYCLE,
             'latest_cycle': LATEST, 'decay': DECAY, 'shrink_k': SHRINK_K, 'max_days_out': MAX_DAYS_OUT,
             'recent_days': RECENT_DAYS, 'min_hist': MIN_HIST, 'state_k': STATE_K,
             'hist_polls': len(hist), 'polls_2026': len(polls26),
             'seats_not_up': {'D': 34, 'R': 31},
             'sources': {'history': 'https://github.com/fivethirtyeight/data/tree/master/pollster-ratings',
                         'polls_2024': 'https://web.archive.org/web/20241106id_/https://projects.fivethirtyeight.com/polls/data/',
                         'polls_2026': 'https://votehub.com/polls/api/',
                         'nominees': 'https://en.wikipedia.org/wiki/2026_United_States_Senate_elections'}},
    'pollsters': pollsters,
    'excluded': excluded,
    'races': races,
    'industry': industry,
}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('wrote', OUT, os.path.getsize(OUT) // 1024, 'KB')
