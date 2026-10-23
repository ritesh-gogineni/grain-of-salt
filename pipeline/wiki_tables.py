"""Tiny helper to pull text rows out of a Wikipedia 'action=render' HTML table."""
import re, html as H

def table_rows(h, start):
    end = h.find('</table>', start)
    seg = h[start:end]
    seg = re.sub(r"data-mw='[^']*'", '', seg)
    seg = re.sub(r'data-mw="[^"]*"', '', seg)
    seg = re.sub(r'<style.*?</style>', '', seg, flags=re.S)
    rows = re.split(r'<tr[^>]*>', seg)
    out = []
    for r in rows[1:]:
        cells = re.split(r'<t[dh][^>]*>', r)[1:]
        cells = [H.unescape(re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', c))).strip() for c in cells]
        out.append(cells)
    return out

def find_tables(h):
    return [m.start() for m in re.finditer(r'<table[^>]*class="[^"]*wikitable[^"]*"[^>]*>', h)]

CAND_RE = re.compile(r'(?:▌\s*)?(?:Y\s+)?([A-Z][^▌(%]+?)\s*\(\s*([^)]+?)\s*\)\s*(\d+(?:\.\d+)?)%')

def parse_candidates(cell):
    """'▌ Y Ruben Gallego (Democratic) 50.1% ▌ Kari Lake (Republican) 47.7%' -> list of (name, party, pct)."""
    out = []
    for name, party, pct in CAND_RE.findall(cell):
        name = name.replace('Y ', '').strip()
        out.append((name, party.strip(), float(pct)))
    return out
