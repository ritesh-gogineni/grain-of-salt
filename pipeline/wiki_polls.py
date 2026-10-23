"""Parse the polling tables on a Wikipedia '2026 United States Senate election in <State>' page.

Returns VoteHub-shaped records so build.py can treat both sources alike:
  {pollster, partisan ('DEM'|'REP'|None), internal, start_date, end_date, sample_size, population,
   url, sponsors, answers: [{choice, pct}], src: 'wiki'}
"""
import re, html as H, datetime

MONTHS = {m: i + 1 for i, m in enumerate(['january', 'february', 'march', 'april', 'may', 'june', 'july',
                                            'august', 'september', 'october', 'november', 'december'])}
MONTH_RE = r'(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?'
DASH = r'\s*[–—‒-]\s*'
PCT_RE = re.compile(r'^\s*(\d+(?:\.\d+)?)\s*%')
SKIP_HEAD = ('other', 'undecided', 'margin', 'sample', 'date', 'poll source', 'pollster', 'lead', 'someone else', 'none')
# Lettered notes on the pollster cell say who paid: "Poll sponsored by Hunt's campaign", "Poll conducted for Fox News".
SPONSOR_RE = re.compile(r'sponsor|commission|on behalf|conducted for|internal poll|paid for', re.I)
# A campaign, party committee, PAC or aligned group: partisan, whatever else the note says.
PARTISAN_RE = re.compile(r"campaign|\bPAC\b|supports?\b|aligned|committee|\bDSCC\b|\bNRSC\b|Association|Party\b|Democrat|Republican|"
                         r"conservative|progressive|liberal|Club for Growth|Majority|Leadership Fund|\bAction\b|Advocacy|Alliance|"
                         r"\bFund\b|Institute\b|Foundation|Chamber|Union\b|Teamsters|Local \d+|Workers|Policies|Policy\b|think tank|"
                         r"endorsed|lobbyist|candidate for", re.I)
# Media outlets, universities and non-partisan non-profits are not partisan sponsors.
MEDIA_RE = re.compile(r'\b(News|Tribune|Journal|Constitution|Times|Post|Gazette|Herald|Press|Media|Nexstar|Gray|Telemundo|'
                      r'Univision|TV|Radio|Broadcast|AARP|University|College|Cook Political|Economist|YouGov|Daily|Chronicle|'
                      r'Observer|Dispatch|Sun|Star|Globe|Magazine|Bulletin|CNN|CBS|NBC|ABC|USA Today|Today|Business|Capitol|'
                      r'Agenda|MIRS|Zeteo|Drop Site|Politics\.com|Florida Politics|Weekly|Review|Center for)\b|\b[WK][A-Z]{2,3}(?:-TV)?\b|NHJournal|FloridaPolitics')


def _clean(c):
    c = re.sub(r"data-mw='[^']*'", '', c)
    c = re.sub(r'data-mw="[^"]*"', '', c)
    c = re.sub(r'<style.*?</style>', '', c, flags=re.S)
    c = re.sub(r'<sup[^>]*class="[^"]*reference[^"]*"[^>]*>.*?</sup>', ' ', c, flags=re.S)
    c = re.sub(r'<[^>]+>', ' ', c)
    c = H.unescape(c)
    c = re.sub(r'\[\s*[a-zA-Z0-9]{1,4}\s*\]', ' ', c)      # stray footnote markers
    return re.sub(r'\s+', ' ', c).strip()


def _mon(s):
    s = s.lower().rstrip('.')
    for name, i in MONTHS.items():
        if name.startswith(s[:3]):
            return i
    return None


def parse_dates(txt):
    """'October 17–21, 2026' | 'February 26 – March 2, 2026' | 'July 28, 2025 – March 2, 2026' | 'May 19, 2026'."""
    t = txt.replace('\xa0', ' ').strip()
    m = re.match(rf'^({MONTH_RE})\s+(\d{{1,2}}),?\s*(\d{{4}})?{DASH}({MONTH_RE})?\s*(\d{{1,2}}),?\s*(\d{{4}})$', t)
    if m:
        m1, d1, y1, m2, d2, y2 = m.groups()
        mo1, mo2 = _mon(m1), _mon(m2) if m2 else _mon(m1)
        y2 = int(y2); y1 = int(y1) if y1 else y2
        try:
            return datetime.date(y1, mo1, int(d1)).isoformat(), datetime.date(y2, mo2, int(d2)).isoformat()
        except (ValueError, TypeError):
            return None
    m = re.match(rf'^({MONTH_RE})\s+(\d{{1,2}}),?\s*(\d{{4}})$', t)
    if m:
        try:
            d = datetime.date(int(m.group(3)), _mon(m.group(1)), int(m.group(2))).isoformat()
            return d, d
        except (ValueError, TypeError):
            return None
    return None


def parse_sample(txt):
    m = re.search(r'([\d,]{2,})', txt)
    n = int(m.group(1).replace(',', '')) if m else None
    p = re.search(r'\(\s*([A-Za-z]{1,2})\s*\)', txt)
    pop = p.group(1).lower() if p else None
    return n, pop


def _refs(h):
    """cite_note id -> first external URL in that reference, and cite_note id -> plain text."""
    urls, notes = {}, {}
    for m in re.finditer(r'<li[^>]*id="(cite_note-[^"]+)"([^>]*)>(.*?)</li>', h, flags=re.S):
        u = re.search(r'href="(https?://[^"]+)"', m.group(3))
        if u:
            urls[m.group(1)] = H.unescape(u.group(1))
        # only lettered notes ([A], [b]) are editorial notes; numbered ones are ordinary citations
        if re.search(r'data-mw-footnote-number="[A-Za-z]+"', m.group(2)):
            t = H.unescape(re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', m.group(3)))).strip()
            notes[m.group(1)] = re.sub(r'^[\s\d↑^]*', '', t)
    return urls, notes


def _tables(h):
    for m in re.finditer(r'<table[^>]*class="[^"]*wikitable[^"]*"[^>]*>', h):
        start = m.start()
        end = h.find('</table>', start)
        seg = h[start:end]
        seg = re.sub(r"data-mw='[^']*'", '', seg)      # JSON attrs can contain '>' and break the cell split
        seg = re.sub(r'data-mw="[^"]*"', '', seg)
        seg = re.sub(r'<style.*?</style>', '', seg, flags=re.S)
        rows = []
        for r in re.split(r'<tr[^>]*>', seg)[1:]:
            cells = re.split(r'<t[dh][^>]*>', r)[1:]
            rows.append(cells)
        yield rows


def parse_state_polls(h, subject):
    refs, notes = _refs(h)
    polls = []
    seen = set()
    for raw_rows in _tables(h):
        if not raw_rows:
            continue
        head = [_clean(c) for c in raw_rows[0]]
        if not head or 'aggregation' in head[0].lower() or not head[0].lower().startswith(('poll source', 'pollster', 'poll')):
            continue
        hl = [c.lower() for c in head]
        try:
            i_date = next(i for i, c in enumerate(hl) if c.startswith('date'))
        except StopIteration:
            continue
        i_sample = next((i for i, c in enumerate(hl) if c.startswith('sample')), None)
        cand_cols = [(i, re.sub(r'\s*\([^)]*\)\s*$', '', head[i]).strip()) for i in range(len(head))
                     if i > i_date and head[i] and not hl[i].startswith(SKIP_HEAD)]
        if len(cand_cols) < 2:
            continue
        for raw in raw_rows[1:]:
            if len(raw) != len(head):
                continue                      # sub-rows (alternate wordings), event rows, averages
            src_html = raw[0]
            src = _clean(src_html)
            if not src or PCT_RE.match(src):
                continue
            dates = parse_dates(_clean(raw[i_date]))
            if not dates:
                continue
            # "(R)" / "(D)" after the name is the firm's affiliation, not a sponsor. Sponsorship is an
            # upper-case lettered note on the pollster cell ("Poll sponsored by ...").
            aff = None
            m = re.search(r'\((D|R|I|DEM|REP)\)', src)
            if m:
                aff = m.group(1)[0]
            partisan, note_txt = None, ''
            cell_ids = re.findall(r'href="[^"]*#(cite_note-[^"]+)"', src_html)
            sponsor_notes = [notes.get(i, '') for i in cell_ids if SPONSOR_RE.search(notes.get(i, ''))]
            if sponsor_notes:
                note_txt = ' '.join(sponsor_notes)
                if PARTISAN_RE.search(note_txt) or not MEDIA_RE.search(note_txt):
                    # a campaign, PAC or aligned group paid for it; which side is settled in build.py if unclear
                    side = re.search(r'\b(Democrat|progressive|liberal|Republican|conservative)', note_txt, re.I)
                    partisan = ('DEM' if side.group(1).lower()[0] in 'dpl' else 'REP') if side else \
                        ({'D': 'DEM', 'R': 'REP'}.get(aff) or 'UNK')
            name = re.sub(r'\((?:D|R|I|DEM|REP)\)', '', src).strip()
            name = re.sub(r'\s*\[.*?\]', '', name).strip()
            sponsors = []
            if '/' in name:
                parts = [x.strip() for x in name.split('/') if x.strip()]
                if all(len(x) > 3 for x in parts):           # "co/efficient" is one firm
                    name, sponsors = parts[0], parts[1:]
            n, pop = parse_sample(_clean(raw[i_sample])) if i_sample is not None else (None, None)
            answers = []
            for i, cname in cand_cols:
                pm = PCT_RE.match(_clean(raw[i]))
                if pm:
                    answers.append({'choice': cname, 'pct': float(pm.group(1))})
            if len(answers) < 2:
                continue
            ref = re.search(r'href="[^"]*#(cite_note-[^"]+)"', src_html)
            url = refs.get(ref.group(1)) if ref else None
            key = (name.lower(), dates[1], tuple(sorted((a['choice'].split()[-1], round(a['pct'])) for a in answers)))
            if key in seen:
                continue
            seen.add(key)
            polls.append({'pollster': name, 'partisan': partisan, 'aff': aff, 'internal': False, 'sponsors': sponsors,
                          'sponsor_note': note_txt or None,
                          'start_date': dates[0], 'end_date': dates[1], 'sample_size': n, 'population': pop,
                          'url': url, 'answers': answers, 'subject': subject, 'src': 'wiki'})
    return polls


if __name__ == '__main__':
    import sys, os, json, collections
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
    d = json.load(open(os.path.join(root, 'web', 'src', 'data', 'data.json'), encoding='utf-8'))
    total = 0
    for race in d['races']:
        f = race['key'].replace(' (special)', '_special').replace(' ', '_') + '.html'
        path = os.path.join(root, 'data', 'raw', 'wiki2026', f)
        if not os.path.exists(path):
            print('missing', f); continue
        polls = parse_state_polls(open(path, encoding='utf-8').read(), '2026 ' + race['state'])
        n1 = race['cand1']['name'].split()[-1] if race['cand1'] else None
        n2 = race['cand2']['name'].split()[-1] if race['cand2'] else None
        both = [p for p in polls if n1 and n2 and {n1, n2} <= {a['choice'].split()[-1] for a in p['answers']}]
        part = sum(1 for p in both if p['partisan'])
        total += len(both)
        print(f"{race['key']:20s} tables->polls {len(polls):4d}  nominee matchup {len(both):4d} (partisan {part:3d}, with url {sum(1 for p in both if p['url'])})  site {len(race['polls'])}")
    print('total nominee-matchup polls', total)
