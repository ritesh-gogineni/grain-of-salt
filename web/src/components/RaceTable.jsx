import { pollsterById, shortName, fmtMargin, fmtBias, fmtDate, fmtInt, META, raceSlug } from '../model.js'

const TYPE_WORD = { 'Sen-G': 'Senate', 'Gov-G': 'Governor', 'Pres-G': 'President' }
const signed = (m) => (Math.abs(m) < 0.05 ? 'Even' : `${m > 0 ? 'D' : 'R'}+${Math.abs(m).toFixed(1)}`)
const gapClass = (b) => (b > 0.5 ? 'D' : b < -0.5 ? 'R' : '')
const leader = (race, e) => (e.side === 'R' ? 'R' : race.cand1 && race.cand1.party === 'IND' ? 'I' : 'D')

/** The pollster's past polls in this state, folded away by default. */
function StateHistory({ race, pollster }) {
  const rec = (pollster.stats.by_state || {})[race.abbr]
  if (!rec) return null
  const name = shortName(pollster)
  const rows = rec.polls || rec.years
  const perPoll = !!rec.polls
  return (
    <details className="fold">
      <summary>Past {name} polls of {race.state} ({rows.length})</summary>
      <div className="tablewrap">
        <table className="polls">
          <thead>
            <tr><th scope="col">Year</th><th scope="col">Race</th>{!perPoll && <th scope="col" className="n">Polls</th>}<th scope="col" className="n">Poll said</th><th scope="col" className="n">Result was</th><th scope="col" className="n">Gap</th></tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="n">{r.cycle}</td>
                <td>{perPoll ? TYPE_WORD[r.type] : 'All races'}</td>
                {!perPoll && <td className="n">{r.n}</td>}
                <td className="n">{signed(perPoll ? r.poll : r.poll_avg)}</td>
                <td className="n">{signed(perPoll ? r.actual : r.actual_avg)}</td>
                <td className={`n ${gapClass(r.bias)}`}><b>{fmtBias(r.bias)}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

/** Plain-English explanation of one corrected number. */
function Explain({ race, e, pollster }) {
  const who = e.source === 'consensus' ? pollsterById.ALL : pollster
  const says = e.source === 'consensus' ? `The average of ${e.est.n_polls} other pollsters` : shortName(pollster)
  const poss = e.source === 'consensus' ? 'Those pollsters’' : `${shortName(pollster)}’s`
  const b = e.biasInfo
  const dir = (x) => (x > 0 ? 'Democratic' : 'Republican')
  if (e.source === 'rating') {
    return (
      <ol className="steps">
        <li>Nobody has polled this race, so there is nothing to correct.</li>
        <li>Race raters call it <b>{e.rating ? e.rating.label : 'unknown'}</b>, which the seat count treats as {fmtMargin(e.corrected, race)}.</li>
      </ol>
    )
  }
  let why
  if (b.scope !== 'state') {
    why = <>{poss} past polls have run <b>{Math.abs(b.overall).toFixed(1)} points too {dir(b.overall)}</b> overall.</>
  } else if (b.n === 0) {
    why = <>{poss} record has no graded polls of {race.state}, so their overall miss is used: <b>{Math.abs(b.overall).toFixed(1)} points too {dir(b.overall)}</b>.</>
  } else {
    why = <>{poss} {b.n} past poll{b.n > 1 ? 's' : ''} of {race.state} ran <b>{Math.abs(b.raw).toFixed(1)} points too {dir(b.raw)}</b>. Blended with their overall record ({fmtBias(b.overall)}), the correction here is <b>{fmtBias(b.bias)}</b>.</>
  }
  return (
    <>
      <ol className="steps">
        <li>{says} says <b>{fmtMargin(e.raw, race)}</b>.</li>
        <li>{why}</li>
        <li>Subtract it: <b>{fmtMargin(e.corrected, race)}</b>, which we call <b>{e.call}{e.call === 'Toss-up' ? '' : ' ' + leader(race, e)}</b>. Their polls typically scatter ±{Math.round(e.sigma * 10) / 10} points around that.</li>
      </ol>
      <StateHistory race={race} pollster={who} />
    </>
  )
}

function Detail({ race, e, pollster, id, labelledBy }) {
  const mine = race.polls.filter((p) => p.pid === pollster.id)
  const list = pollster.id === 'ALL' ? race.polls : mine
  const others = race.polls.length - list.length
  const usedN = e.est && e.source === 'pollster' && pollster.id !== 'ALL' ? e.est.n_polls : 0
  const c1 = race.cand1 ? race.cand1.name.split(' ').slice(-1)[0] : '—'
  const c2 = race.cand2 ? race.cand2.name.split(' ').slice(-1)[0] : '—'
  const recentCut = new Date(META.built + 'T00:00:00'); recentCut.setDate(recentCut.getDate() - META.recent_days)
  const builtYear = META.built.slice(0, 4)
  const raters = Object.entries(race.ratings || {}).filter(([k]) => !['PVI', 'Senator', 'Last election'].includes(k))
  return (
    <div className="rdetail" id={id} role="region" aria-labelledby={labelledBy}>
      <div>
        <h3>How we got this number</h3>
        <Explain race={race} e={e} pollster={pollster} />
        {raters.length > 0 && (
          <p className="note">
            Race raters: {raters.map(([k, v]) => `${k.split(' ')[0]} ${v.replace(/\s*\(flip\)/, '')}`).join(' · ')}
          </p>
        )}
      </div>
      <div>
        <h3>{pollster.id === 'ALL' ? 'Polls of this race' : `${shortName(pollster)} polls of this race`} ({list.length})</h3>
        {list.length === 0 ? (
          <p className="empty">
            {shortName(pollster)} has not polled {c1} vs. {c2}.
            {others > 0 ? ` ${others} other ${others === 1 ? 'poll exists' : 'polls exist'}; pick “All pollsters” to see them.` : ''}
          </p>
        ) : (
          <div className="tablewrap">
            <table className="polls">
              <thead>
                <tr>
                  <th scope="col">Dates</th>{pollster.id === 'ALL' && <th scope="col">Pollster</th>}<th scope="col" className="n">Sample</th>
                  <th scope="col" className="n">{c1}</th><th scope="col" className="n">{c2}</th><th scope="col" className="n">Margin</th><th scope="col"><span className="sr-only">Source</span></th>
                </tr>
              </thead>
              <tbody>
                {list.slice(0, 15).map((p, i) => {
                  const npIndex = list.slice(0, i + 1).filter((q) => !q.partisan).length - 1
                  const used = !p.partisan && (pollster.id === 'ALL' ? new Date(p.end + 'T00:00:00') >= recentCut : npIndex < usedN)
                  const who = pollsterById[p.pid] ? shortName(pollsterById[p.pid]) : p.pollster_vh
                  return (
                    <tr key={i} className={used ? 'used' : ''}>
                      <td>
                        {fmtDate(p.start)}–{fmtDate(p.end)}{p.end.slice(0, 4) !== builtYear ? ` ’${p.end.slice(2, 4)}` : ''}
                        {p.partisan && <span className="flag" title="Sponsored by a campaign or an aligned group; listed but not counted">{p.partisan === 'D' ? 'D sponsor' : p.partisan === 'R' ? 'R sponsor' : 'sponsored'}</span>}
                      </td>
                      {pollster.id === 'ALL' && <td>{who}{p.aff && <span className="pty"> ({p.aff})</span>}</td>}
                      <td className="n">{p.n ? `${fmtInt(p.n)} ${p.pop || ''}` : '—'}</td>
                      <td className="n">{p.pct1}</td><td className="n">{p.pct2}</td>
                      <td className="n">{fmtMargin(p.margin, race)}</td>
                      <td>{p.url && <a className="src" href={p.url} target="_blank" rel="noreferrer" aria-label={`Source for the ${who} poll ending ${fmtDate(p.end)} (opens in a new tab)`}>↗</a>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {list.length > 0 && (
          <p className="note">
            Highlighted polls are the ones counted{pollster.id === 'ALL' ? ` (finished in the last ${META.recent_days} days)` : ` (the latest, up to three, within ${META.recent_days} days)`}.
            {list.some((p) => p.partisan) && ' Sponsored polls are listed but never counted.'}
            {others > 0 && pollster.id !== 'ALL' && ` ${others} other ${others === 1 ? 'poll' : 'polls'} of this race not shown.`}
          </p>
        )}
      </div>
    </div>
  )
}

export default function RaceTable({ rows, pollster, openRace, setOpenRace, onlyPolled, setOnlyPolled }) {
  const sorted = rows.slice().sort((a, b) => Math.abs(a.e.corrected) - Math.abs(b.e.corrected))
  const shown = onlyPolled ? sorted.filter((r) => r.e.source === 'pollster') : sorted
  const name = shortName(pollster)
  return (
    <div>
      <div className="controls flush">
        <div className="seg" role="group" aria-label="Which races to show">
          <button type="button" aria-pressed={!onlyPolled} onClick={() => setOnlyPolled(false)}>All {rows.length} races</button>
          <button type="button" aria-pressed={onlyPolled} onClick={() => setOnlyPolled(true)}>Only races {name} polled</button>
        </div>
        <span className="hint">Tap a race to see the polls behind it.</span>
      </div>
      <div className="rhead" aria-hidden="true">
        <span>Race</span><span>Matchup</span><span className="right">Polls say</span><span className="right">Corrected</span><span>Result</span>
      </div>
      <ul className="rtable" aria-label="Senate races, closest first">
        {shown.map(({ race, e }) => {
          const isOpen = openRace === race.key
          const slug = raceSlug(race)
          const c1 = race.cand1 ? race.cand1.name : 'TBD'
          const c2 = race.cand2 ? race.cand2.name : 'TBD'
          const srcLabel = e.source === 'pollster' ? (e.est.stale ? `old poll · ${fmtDate(e.est.latest)}` : pollster.id === 'ALL' ? `${e.est.n_polls} pollsters` : `${e.est.n_polls} poll${e.est.n_polls > 1 ? 's' : ''} · ${fmtDate(e.est.latest)}`)
            : e.source === 'consensus' ? `no ${name} poll · ${e.est.n_polls} others` : 'no polls · raters'
          const winner = e.call !== 'Toss-up' ? ' ' + leader(race, e) : ''
          return (
            <li key={race.key} id={`race-${slug}`}>
              <button type="button" className="rrow" id={`race-${slug}-btn`} aria-expanded={isOpen} aria-controls={`race-${slug}-panel`}
                onClick={() => setOpenRace(isOpen ? null : race.key)}>
                <span className="c-state">
                  <span className="state">{race.state}{race.special && <span className="sp">special</span>}</span>
                  <span className="held">{race.held}-held · {race.incumbent === 'open' ? 'open seat' : race.incumbent}</span>
                </span>
                <span className="match c-match">
                  <b className="D">{c1}</b> <span className="pty">({race.cand1 ? race.cand1.party[0] : '?'})</span> vs.{' '}
                  <b className="R">{c2}</b> <span className="pty">(R)</span>
                </span>
                <span className={`val right c-raw ${e.rawSide}`} data-label="Polls say">
                  <span className="sr-only">Polls say: </span>
                  {e.source === 'rating' ? <span className="none">—</span> : fmtMargin(e.raw, race)}
                  <span className="sub">{srcLabel}</span>
                </span>
                <span className={`val right corr c-corr ${e.side}`} data-label="Corrected">
                  <span className="sr-only">Corrected: </span>
                  {fmtMargin(e.corrected, race)}
                  <span className="sub">{e.source === 'rating' ? 'from ratings' : `${fmtBias(e.bias)} removed`}</span>
                </span>
                <span className="call c-call">
                  <span className="sr-only">Result: </span>
                  <span>{e.call}{winner}</span>
                  {e.flip && <span className="flag flip">flip</span>}
                  {e.changed && <span className="flag">changed</span>}
                  <span className="chev" aria-hidden="true">{isOpen ? '▴' : '▾'}</span>
                </span>
              </button>
              {isOpen && <Detail race={race} e={e} pollster={pollster} id={`race-${slug}-panel`} labelledBy={`race-${slug}-btn`} />}
            </li>
          )
        })}
        {shown.length === 0 && <li className="rdetail"><p className="empty">{name} has not polled any 2026 Senate race yet.</p></li>}
      </ul>
      <p className="note legend-note">
        <b>Flip</b>: the leader is not the party that holds the seat today. <b>Changed</b>: the correction moved the lead to the other side.
      </p>
    </div>
  )
}
