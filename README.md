# Grain of Salt

Pick a pollster. See what their 2026 Senate polls say, then see the same numbers with that pollster's
historical miss subtracted. Static site, no backend; a Python pipeline builds one JSON file that a
Vite + React frontend reads.

## Layout

```
pipeline/
  fetch.py               downloads every raw input into data/raw/
  build_results_2024.py  parses 2024 Senate/governor/presidential results from Wikipedia pages
  build.py               grades every historical poll, scores pollsters, assembles 2026 races -> web/src/data/data.json
  wiki_tables.py         tiny HTML-table helper
data/raw/                downloaded inputs (gitignored)
data/processed/          results_2024.json
web/                     the site (Vite + React, plain CSS, inline SVG charts)
```

## Refresh the data

```
python pipeline/fetch.py --2026     # new VoteHub polls + Wikipedia nominees/ratings (seconds)
python pipeline/build.py
```

The full history only needs re-fetching if the 538 archive or the 2024 inputs change:

```
python pipeline/fetch.py
python pipeline/build_results_2024.py
python pipeline/build.py
```

## Run the site

```
cd web
npm install
npm run dev        # http://localhost:5173
npm run build      # static output in web/dist, deploy anywhere
```

## Deploy

The site is published with GitHub Pages at https://ritesh-gogineni.github.io/grain-of-salt/ from the `gh-pages` branch. Vite is configured with `base: '/grain-of-salt/'` for that path (set `VITE_BASE=/` to build for a root domain).

To publish a new build:

```bash
cd web && npm run build && cd ..
git worktree add --detach /tmp/gos-pages
cd /tmp/gos-pages && git checkout --orphan gh-pages && git rm -rfq .
cp -r ../path/to/pollster/web/dist/. . && touch .nojekyll
git add -A && git commit -m "Deploy site build" && git push -f origin gh-pages
```

`.github/workflows/pages.yml` holds an Actions workflow that does the same on every push to `main`. Pushing it needs a token with the `workflow` scope (`gh auth refresh -h github.com -s workflow`), after which Pages can be switched to "GitHub Actions" as its source.

## Method, briefly

- History: FiveThirtyEight's pollster-ratings archive (1998–2022) plus 2024 rebuilt from their archived poll
  files joined to certified results. General-election Senate, governor and presidential polls, final 21 days,
  D-vs-R top two, no partisan sponsors, even years only, 2014 onward.
- Miss = poll margin − actual margin (D minus R). Bias = weighted mean of misses with shrinkage toward 0.
  Three weightings: recency (0.7 per cycle), flat, 2024 only.
- Corrections are state-specific by default: the pollster's graded polls in that state (Senate, governor, presidential),
  blended toward their overall bias with 4 polls' worth of prior weight, so a state with no record falls back to the
  overall number. A toggle switches to one pollster-wide correction.
- 2026 polls from the VoteHub API (CC BY 4.0). A pollster's number per race = mean of up to three polls in the
  last 60 days, else their latest poll flagged stale. Corrected = raw − bias.
- Unpolled races fall back to the all-pollster average (corrected by the pooled bias), then to averaged race ratings.
- Full write-up with live numbers lives on the site's "How it works" page.

## Sources

- https://github.com/fivethirtyeight/data/tree/master/pollster-ratings
- https://votehub.com/polls/api/
- https://en.wikipedia.org/wiki/2026_United_States_Senate_elections
