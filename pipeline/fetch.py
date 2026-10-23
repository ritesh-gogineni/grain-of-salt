"""Download every raw input into data/raw/. Safe to re-run; it overwrites.

  python pipeline/fetch.py            # everything
  python pipeline/fetch.py --2026     # only the fast-changing 2026 inputs (VoteHub + Wikipedia overview)
"""
import os, sys, time, urllib.request

RAW = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'raw')
UA = 'GrainOfSalt/0.1 (personal project; https://github.com/)'
WB = 'https://web.archive.org/web/20241106id_/https://projects.fivethirtyeight.com/polls/data/'
F38 = 'https://raw.githubusercontent.com/fivethirtyeight/data/master/pollster-ratings/'
WIKI = 'https://en.wikipedia.org/w/index.php?action=render&title='

HISTORY = {
    'raw_polls.csv': F38 + 'raw_polls.csv',
    'pollster-ratings-combined.csv': F38 + 'pollster-ratings-combined.csv',
    'senate_polls.2024.csv': WB + 'senate_polls.csv',
    'president_polls.2024.csv': WB + 'president_polls.csv',
    'governor_polls.2024.csv': WB + 'governor_polls.csv',
    'wiki_2024_senate.html': WIKI + '2024_United_States_Senate_elections',
    'wiki_2024_gov.html': WIKI + '2024_United_States_gubernatorial_elections',
    'wiki_2024_pres.html': WIKI + '2024_United_States_presidential_election',
}
CURRENT = {
    'votehub_senate.json': 'https://api.votehub.com/polls?poll_type=us-senator',
    'wiki_2026_senate.html': WIKI + '2026_United_States_Senate_elections',
}


def get(url, dest):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=120) as r, open(dest, 'wb') as f:
        f.write(r.read())
    print(f'{os.path.basename(dest):32s} {os.path.getsize(dest) // 1024:7d} KB')


if __name__ == '__main__':
    os.makedirs(RAW, exist_ok=True)
    todo = CURRENT if '--2026' in sys.argv else {**HISTORY, **CURRENT}
    for name, url in todo.items():
        get(url, os.path.join(RAW, name))
        if 'wikipedia' in url:
            time.sleep(3)   # be polite; Wikipedia rate-limits bursts
    print('done. now run: python pipeline/build_results_2024.py && python pipeline/build.py')
