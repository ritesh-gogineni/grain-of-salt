import { useEffect, useMemo, useRef, useState } from 'react'
import { DATA, META, MODES, SCOPES, FEATURED, pollsterById, allEstimates, tally, fmtInt, fmtLongDate, raceSlug } from './model.js'
import Picker from './components/Picker.jsx'
import Tally from './components/Tally.jsx'
import RaceTable from './components/RaceTable.jsx'
import ReportCard from './components/ReportCard.jsx'
import Method from './components/Method.jsx'
import HeroCard from './components/HeroCard.jsx'

const DARK_BG = '#0b1326', LIGHT_BG = '#ffffff'
const raceKeys = new Set(DATA.races.map((r) => r.key))

/* URL shape: #/[method[/section]]?p=<pollster>&m=<mode>&s=<scope>&r=<open race>&f=polled */
function readHash() {
  const h = window.location.hash.replace(/^#\/?/, '')
  const [path, qs] = h.split('?')
  const q = new URLSearchParams(qs || '')
  const [root, section] = path.split('/')
  return {
    page: root === 'method' ? 'method' : 'home',
    section: root === 'method' && section ? section : null,
    p: q.get('p'), m: q.get('m'), s: q.get('s'), r: q.get('r'), f: q.get('f'),
  }
}

function buildHash({ page, section, p, m, s, r, f }) {
  const qs = new URLSearchParams()
  if (p) qs.set('p', p)
  if (m && m !== 'recency') qs.set('m', m)
  if (s && s !== 'state') qs.set('s', s)
  if (page === 'home' && r) qs.set('r', r)
  if (page === 'home' && f) qs.set('f', 'polled')
  const q = qs.toString()
  const path = page === 'method' ? `method${section ? '/' + section : ''}` : ''
  return `#/${path}${q ? '?' + q : ''}`
}

function useSystemDark() {
  const [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const on = (e) => setDark(e.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return dark
}

export default function App() {
  const [init] = useState(readHash)
  const [page, setPage] = useState(init.page)
  const [jump, setJump] = useState(init.section ? { id: init.section, n: 0 } : null)
  const [pollsterId, setPollsterId] = useState(pollsterById[init.p] ? init.p : FEATURED[0].id)
  const [mode, setMode] = useState(MODES.some((x) => x.id === init.m) ? init.m : 'recency')
  const [scope, setScope] = useState(SCOPES.some((x) => x.id === init.s) ? init.s : 'state')
  const [openRace, setOpenRace] = useState(raceKeys.has(init.r) ? init.r : null)
  const [onlyPolled, setOnlyPolled] = useState(init.f === 'polled')
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('gos-theme') || '' } catch { return '' }
  })
  const sysDark = useSystemDark()
  const isDark = theme ? theme === 'dark' : sysDark
  const mainRef = useRef(null)

  /* Hash -> state. Anchors navigate natively, so Cmd/Ctrl-click and middle-click keep working. */
  useEffect(() => {
    const onHash = () => {
      const h = readHash()
      setPage((prev) => {
        if (prev !== h.page) window.scrollTo({ top: 0, behavior: 'instant' })
        return h.page
      })
      if (h.section) setJump((j) => ({ id: h.section, n: (j ? j.n : 0) + 1 }))
      if (h.p && pollsterById[h.p]) setPollsterId(h.p)
      if (h.m && MODES.some((x) => x.id === h.m)) setMode(h.m)
      if (h.s && SCOPES.some((x) => x.id === h.s)) setScope(h.s)
      if (h.page === 'home') {
        setOpenRace(raceKeys.has(h.r) ? h.r : null)
        setOnlyPolled(h.f === 'polled')
      }
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  /* State -> hash, so every view is a link. */
  useEffect(() => {
    const next = buildHash({ page, section: jump && page === 'method' ? jump.id : null, p: pollsterId, m: mode, s: scope, r: openRace, f: onlyPolled })
    if (window.location.hash !== next) window.history.replaceState(null, '', next)
  }, [page, jump, pollsterId, mode, scope, openRace, onlyPolled])

  /* Scroll to a Method section when the hash names one. */
  useEffect(() => {
    if (!jump || page !== 'method') return
    const el = document.getElementById(jump.id)
    if (el) requestAnimationFrame(() => el.scrollIntoView({ block: 'start' }))
  }, [jump, page])

  /* On first load with ?r=, bring the open race into view. */
  useEffect(() => {
    if (init.page === 'home' && init.r && raceKeys.has(init.r)) {
      const race = DATA.races.find((x) => x.key === init.r)
      const el = document.getElementById(`race-${raceSlug(race)}`)
      if (el) requestAnimationFrame(() => el.scrollIntoView({ block: 'start' }))
    }
  }, [init])

  useEffect(() => {
    if (theme) document.documentElement.setAttribute('data-theme', theme)
    else document.documentElement.removeAttribute('data-theme')
    try {
      if (theme) localStorage.setItem('gos-theme', theme)
      else localStorage.removeItem('gos-theme')
    } catch { /* private mode */ }
  }, [theme])

  /* Keep the browser chrome the same colour as the page. */
  useEffect(() => {
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => { m.setAttribute('content', isDark ? DARK_BG : LIGHT_BG) })
  }, [isDark])

  const pollster = pollsterById[pollsterId]
  const rows = useMemo(() => allEstimates(pollster, mode, scope), [pollster, mode, scope])
  const t = useMemo(() => tally(rows), [rows])

  const common = { p: pollsterId, m: mode, s: scope, r: openRace, f: onlyPolled }
  const homeHref = buildHash({ page: 'home', ...common })
  const methodHref = buildHash({ page: 'method', ...common })
  const skipToMain = (e) => {
    e.preventDefault()
    const el = mainRef.current
    if (el) { el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'start' }) }
  }

  return (
    <div className="wrap">
      <a className="skip" href="#main" onClick={skipToMain}>Skip to Content</a>
      <header className="masthead">
        <a className="brand" href={homeHref} translate="no"><span className="grain" aria-hidden="true" />Grain&nbsp;of&nbsp;Salt</a>
        <nav className="nav" aria-label="Site">
          <a href={homeHref} aria-current={page === 'home' ? 'page' : undefined}>Senate&nbsp;2026</a>
          <a href={methodHref} aria-current={page === 'method' ? 'page' : undefined}>How It Works</a>
          <button type="button" className="theme" onClick={() => setTheme(isDark ? 'light' : 'dark')} aria-pressed={isDark} aria-label="Dark mode">
            <span aria-hidden="true">◐</span>
          </button>
        </nav>
      </header>

      {page === 'method' ? (
        <div id="main" ref={mainRef} tabIndex={-1} className="main">
          <Method pollster={pollster} mode={mode} scope={scope} />
        </div>
      ) : (
        <main id="main" ref={mainRef} tabIndex={-1} className="main">
          <section className="hero">
            <div className="hero-text">
              <p className="kicker reveal">Senate 2026 · {DATA.races.length} races · polls through {fmtLongDate(META.built)}</p>
              <h1 className="reveal">Every pollster misses. <em>Subtract the miss.</em></h1>
              <p className="reveal">
                Pick a pollster. See what their 2026 Senate polls say, then see the same numbers with that pollster’s
                historical error taken out, measured against {fmtInt(META.hist_polls)} of their past polls and
                the results that followed. <a href={methodHref}>How it works</a>.
              </p>
            </div>
            <HeroCard t={t} pollster={pollster} mode={mode} scope={scope} rows={rows} />
          </section>

          <section className="section" id="pick" aria-labelledby="h-pick">
            <div className="section-head">
              <h2 id="h-pick"><span className="step" aria-hidden="true">01</span>Choose a pollster</h2>
              <span className="sub">Ranked by how many 2026 Senate races they have polled</span>
            </div>
            <Picker pollsterId={pollsterId} setPollsterId={setPollsterId} mode={mode} />
            <div className="controls">
              <span id="lbl-mode">Measure the miss as</span>
              <div className="seg" role="group" aria-labelledby="lbl-mode">
                {MODES.map((m) => (
                  <button key={m.id} type="button" aria-pressed={mode === m.id} onClick={() => setMode(m.id)}>{m.label}</button>
                ))}
              </div>
              <span className="hint">{MODES.find((m) => m.id === mode).hint}</span>
            </div>
            <div className="controls tight">
              <span id="lbl-scope">Apply the correction</span>
              <div className="seg" role="group" aria-labelledby="lbl-scope">
                {SCOPES.map((s) => (
                  <button key={s.id} type="button" aria-pressed={scope === s.id} onClick={() => setScope(s.id)}>{s.label}</button>
                ))}
              </div>
              <span className="hint">{SCOPES.find((s) => s.id === scope).hint}</span>
            </div>
          </section>

          <section className="section" id="tally" aria-labelledby="h-tally">
            <div className="section-head">
              <h2 id="h-tally"><span className="step" aria-hidden="true">02</span>The Senate, before and after</h2>
              <span className="sub">{META.seats_not_up.D} D-held and {META.seats_not_up.R} R-held seats are not on the ballot</span>
            </div>
            <Tally t={t} pollster={pollster} mode={mode} scope={scope} rows={rows} />
          </section>

          <section className="section" id="races" aria-labelledby="h-races">
            <div className="section-head">
              <h2 id="h-races"><span className="step" aria-hidden="true">03</span>Race by race</h2>
              <span className="sub">Most competitive first · open a row for the polls behind it</span>
            </div>
            <RaceTable rows={rows} pollster={pollster} mode={mode} scope={scope}
              openRace={openRace} setOpenRace={setOpenRace} onlyPolled={onlyPolled} setOnlyPolled={setOnlyPolled} />
          </section>

          <section className="section" id="report" aria-labelledby="h-report">
            <div className="section-head">
              <h2 id="h-report"><span className="step" aria-hidden="true">04</span>Where the correction comes from</h2>
              <span className="sub">Final-three-week polls vs. certified results, {META.first_cycle}–{META.latest_cycle}</span>
            </div>
            <ReportCard pollster={pollster} mode={mode} scope={scope} />
          </section>
        </main>
      )}

      <footer>
        <span><span translate="no">Grain&nbsp;of&nbsp;Salt</span> · built {fmtLongDate(META.built)}. Not a forecast. A mirror held up to one pollster at a time.</span>
        <span>
          History: <a href={META.sources.history}>FiveThirtyEight archive</a> · 2026 polls: <a href={META.sources.polls_2026}>VoteHub</a> (CC&nbsp;BY&nbsp;4.0) ·
          Nominees &amp; ratings: <a href={META.sources.nominees}>Wikipedia</a>
        </span>
      </footer>
    </div>
  )
}
