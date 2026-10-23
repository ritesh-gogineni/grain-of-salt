import { pollsterById, shortName, fmtMargin, fmtBias, fmtDate, fmtInt, META, sideOf, raceSlug } from '../model.js'

const LIM = 20

function Dumbbell({ race, e }) {
  const W = 220, H = 34, mid = W / 2, pad = 6
  const x = (m) => mid + Math.max(-LIM, Math.min(LIM, m)) * ((mid - pad) / LIM)
  const cx1 = x(e.raw), cx2 = x(e.corrected)
  const side = sideOf(race, e.corrected) || race.held
  const col = side === 'R' ? 'var(--rep)' : 'var(--dem)'
  const band = e.sigma ? Math.min(e.sigma, LIM) * ((mid - pad) / LIM) : 0
  return (
    <svg className="dumbbell" viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false">
      <line x1={pad} x2={W - pad} y1={H / 2} y2={H / 2} stroke="var(--rule)" strokeWidth="1" />
      <line x1={mid} x2={mid} y1={6} y2={H - 6} stroke="var(--ink)" strokeOpacity="0.5" strokeWidth="1" />
      {band > 0 && <rect x={cx2 - band} y={H / 2 - 7} width={band * 2} height={14} rx="3" fill={col} fillOpacity="0.12" />}
      {e.source !== 'rating' && <line x1={cx1} x2={cx2} y1={H / 2} y2={H / 2} stroke={col} strokeWidth="2" />}
      {e.source !== 'rating' && <circle cx={cx1} cy={H / 2} r="4.5" fill="var(--card)" stroke={col} strokeWidth="1.5" />}
      <circle cx={cx2} cy={H / 2} r="5.5" fill={col} stroke="var(--card)" strokeWidth="1.5" />
      <text x={pad} y={H - 1} fontSize="8" fill="var(--ink-3)" fontFamily="var(--mono)">R+{LIM}</text>
      <text x={W - pad} y={H - 1} fontSize="8" fill="var(--ink-3)" fontFamily="var(--mono)" textAnchor="end">D+{LIM}</text>
    </svg>
  )
}

function StateLine({ race, e, who }) {
  const b = e.biasInfo
  if (!b) return null
  if (b.scope !== 'state') return <>{who} overall miss: <b>{fmtBias(b.overall)}</b><br /></>
  if (b.n === 0) return <>no graded {who} polls in {race.abbr}, so {who} overall miss is used: <b>{fmtBias(b.overall)}</b><br /></>
  return (
    <>
      {who} record in {race.abbr}: <b>{b.n} graded poll{b.n > 1 ? 's' : ''}</b> ({b.cycles.join(', ')}), missed by <b>{fmtBias(b.raw)}</b> on average<br />
      blended {Math.round(b.share * 100)}% {race.abbr} record + {Math.round((1 - b.share) * 100)}% overall ({fmtBias(b.overall)}) = <b>{fmtBias(b.bias)}</b><br />
    </>
  )
}

const TYPE_WORD = { 'Sen-G': 'Senate', 'Gov-G': 'Governor', 'Pres-G': 'President' }
const signed = (m) => (Math.abs(m) < 0.05 ? 'Even' : `${m > 0 ? 'D' : 'R'}+${Math.abs(m).toFixed(1)}`)
const gapClass = (b) => (b > 0.5 ? 'D' : b < -0.5 ? 'R' : '')

/** The pollster's past polls in this state: what each said, what happened, the gap. */
function StateHistory({ race, e, pollster }) {
  const who = e.source === 'consensus' ? pollsterById.ALL : pollster
  const rec = (who.stats.by_state || {})[race.abbr]
  const name = shortName(who)
  if (!rec) {
    return (
      <>
        <h3>{name} in {race.state}, past elections</h3>
        <p className="empty">
          No graded {name} polls of {race.state} since {META.first_cycle}, so the correction falls back to {name}’s overall miss ({fmtBias(e.biasInfo ? e.biasInfo.overall : 0)}).
        </p>
      </>
    )
  }
  const b = e.biasInfo
  const rows = rec.polls || rec.years
  const perPoll = !!rec.polls
  return (
    <>
      <h3>{name} in {race.state}, past elections ({rows.length} {perPoll ? 'graded polls' : 'years'})</h3>
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
      {b && b.scope === 'state' && b.n > 0 && (
        <p className="note">
          Average gap here (recent years weighted more): {fmtBias(b.raw)}. Blended {Math.round(b.share * 100)}% with {name}’s overall {fmtBias(b.overall)} gives a correction of {fmtBias(b.bias)}.
        </p>
      )}
      {b && b.scope !== 'state' && (
        <p className="note">
          Shown for reference; the “Pollster-Wide” setting applies {name}’s overall {fmtBias(b.overall)} to every race.
        </p>
      )}
    </>
  )
}

function Detail({ race, e, pollster, mode, id, labelledBy }) {
  const mine = race.polls.filter((p) => p.pid === pollster.id)
  const others = race.polls.filter((p) => p.pid !== pollster.id)
  const list = pollster.id === 'ALL' ? race.polls : mine
  const usedN = e.est && e.source === 'pollster' && pollster.id !== 'ALL' ? e.est.n_polls : 0
  const c1 = race.cand1 ? race.cand1.name.split(' ').slice(-1)[0] : '—'
  const c2 = race.cand2 ? race.cand2.name.split(' ').slice(-1)[0] : '—'
  const recentCut = new Date(META.built + 'T00:00:00'); recentCut.setDate(recentCut.getDate() - META.recent_days)
  const builtYear = META.built.slice(0, 4)
  return (
    <div className="rdetail" id={id} role="region" aria-labelledby={labelledBy}>
      <div>
        <h3>{pollster.id === 'ALL' ? 'All polls of this matchup' : `${shortName(pollster)} polls of this matchup`} ({list.length})</h3>
        {list.length === 0 ? (
          <p className="empty">
            {shortName(pollster)} has not published a general-election poll of {c1} vs. {c2}.
            {race.consensus ? ` Shown instead: the average of ${race.consensus.n_pollsters} other pollsters’ latest polls, corrected with the industry-wide miss.`
              : ' No non-partisan pollster has, either, so the row uses the consensus of race raters.'}
          </p>
        ) : (
          <div className="tablewrap">
            <table className="polls">
              <thead>
                <tr>
                  <th scope="col">Field dates</th>{pollster.id === 'ALL' && <th scope="col">Pollster</th>}<th scope="col" className="n">Sample</th>
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
                        {p.partisan && <span className="flag" title="Sponsored by a campaign or an aligned group; listed but not used in estimates">{p.partisan === 'D' ? 'D sponsor' : p.partisan === 'R' ? 'R sponsor' : 'sponsored'}</span>}
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
        {list.length > 0 && pollster.id !== 'ALL' && (
          <p className="note">
            Highlighted rows feed the estimate: up to three non-partisan polls finishing in the last {META.recent_days} days{e.est && e.est.stale ? ', or the latest poll when none is that fresh (flagged stale)' : ''}.
            {list.some((p) => p.partisan) && ' Polls with a sponsor tag are listed but never counted.'}
            {others.length > 0 && ` ${others.length} other ${others.length === 1 ? 'poll' : 'polls'} of this race not shown.`}
          </p>
        )}
      </div>
      <div>
        <h3>The arithmetic</h3>
        {e.source === 'rating' ? (
          <div className="math">
            No polls to correct. Race raters say <b>{e.rating ? e.rating.label : '—'}</b>, which the seat count treats as {fmtMargin(e.corrected, race)}.
          </div>
        ) : (
          <div className="math">
            {e.source === 'consensus' ? 'all-pollster average' : shortName(pollster)} says <b>{fmtMargin(e.raw, race)}</b><br />
            <StateLine race={race} e={e} who={e.source === 'consensus' ? 'industry' : 'their'} />
            correction ({mode === 'latest' ? '2024 only' : mode === 'flat' ? 'flat average' : 'recency-weighted'}): <b>{fmtBias(e.bias)}</b> (polls ran {Math.abs(e.bias).toFixed(1)} too {e.bias > 0 ? 'Democratic' : 'Republican'})<br />
            {e.raw > 0 ? '+' : ''}{e.raw.toFixed(1)} − ({e.bias > 0 ? '+' : ''}{e.bias.toFixed(1)}) = <b>{fmtMargin(e.corrected, race)}</b><br />
            typical scatter around that: ±{e.sigma} points, so <b>{e.call}{e.call === 'Toss-up' ? '' : ' ' + (e.side === 'R' ? 'R' : race.cand1.party === 'IND' ? 'I' : 'D')}</b>
          </div>
        )}
        {e.source !== 'rating' && <StateHistory race={race} e={e} pollster={pollster} />}
        {Object.keys(race.ratings || {}).length > 0 && (
          <>
            <h3>Race raters</h3>
            <ul className="ratings" aria-label="Race ratings">
              {Object.entries(race.ratings).filter(([k]) => !['PVI', 'Senator', 'Last election'].includes(k)).map(([k, v]) => (
                <li key={k}><span><span className="sr-only">{k}: </span><span aria-hidden="true">{k.split(' ')[0]}: </span>{v.replace(/\s*\(flip\)/, '')}</span></li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}

export default function RaceTable({ rows, pollster, mode, openRace, setOpenRace, onlyPolled, setOnlyPolled }) {
  const sorted = rows.slice().sort((a, b) => Math.abs(a.e.corrected) - Math.abs(b.e.corrected))
  const shown = onlyPolled ? sorted.filter((r) => r.e.source === 'pollster') : sorted
  const name = shortName(pollster)
  return (
    <div>
      <div className="controls flush">
        <div className="seg" role="group" aria-label="Which races to show">
          <button type="button" aria-pressed={!onlyPolled} onClick={() => setOnlyPolled(false)}>All {rows.length} Races</button>
          <button type="button" aria-pressed={onlyPolled} onClick={() => setOnlyPolled(true)}>Only Races {name} Polled</button>
        </div>
        <span className="hint">Hollow dot = as polled · solid dot = corrected · shaded band = that pollster’s typical scatter</span>
      </div>
      <div className="rhead" aria-hidden="true">
        <span>Race</span><span>Matchup</span><span className="right">As polled</span><span className="right">Corrected</span><span>Shift</span><span>Call</span>
      </div>
      <ul className="rtable" aria-label="Senate races, most competitive first">
        {shown.map(({ race, e }) => {
          const isOpen = openRace === race.key
          const slug = raceSlug(race)
          const c1 = race.cand1 ? race.cand1.name : 'TBD'
          const c2 = race.cand2 ? race.cand2.name : 'TBD'
          const srcLabel = e.source === 'pollster' ? (e.est.stale ? `stale · ${fmtDate(e.est.latest)}` : pollster.id === 'ALL' ? `${e.est.n_polls} pollsters` : `${e.est.n_polls} poll${e.est.n_polls > 1 ? 's' : ''} · ${fmtDate(e.est.latest)}`)
            : e.source === 'consensus' ? `no ${name} poll · avg of ${e.est.n_polls}` : 'no polls · raters'
          const winner = e.call !== 'Toss-up' ? ' ' + (e.side === 'R' ? 'R' : race.cand1 && race.cand1.party === 'IND' ? 'I' : 'D') : ''
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
                <span className={`val right c-raw ${e.rawSide}`} data-label="As polled">
                  <span className="sr-only">As polled: </span>
                  {e.source === 'rating' ? <span className="none">—</span> : fmtMargin(e.raw, race)}
                  <span className="sub">{srcLabel}</span>
                </span>
                <span className={`val right corr c-corr ${e.side}`} data-label="Corrected">
                  <span className="sr-only">Corrected: </span>
                  {fmtMargin(e.corrected, race)}
                  <span className="sub">{e.source === 'rating' ? 'from ratings' : `${fmtBias(e.bias)} removed${e.biasInfo && e.biasInfo.scope === 'state' ? (e.biasInfo.n > 0 ? ` · ${race.abbr} ×${e.biasInfo.n}` : ' · overall') : ''}`}</span>
                </span>
                <span className="c-db"><Dumbbell race={race} e={e} /></span>
                <span className="call c-call">
                  <span className="sr-only">Call: </span>
                  {e.changed && e.rawCall !== e.call && <span className="was">{e.rawCall}{e.rawCall !== 'Toss-up' ? ' ' + e.rawSide : ''}</span>}
                  {e.call}{winner}
                  {e.flip && <span className="flag flip">flip</span>}
                  {e.changed && <span className="flag">changed</span>}
                </span>
              </button>
              {isOpen && <Detail race={race} e={e} pollster={pollster} mode={mode} id={`race-${slug}-panel`} labelledBy={`race-${slug}-btn`} />}
            </li>
          )
        })}
        {shown.length === 0 && <li className="rdetail"><p className="empty">{name} has not polled any 2026 Senate race yet.</p></li>}
      </ul>
    </div>
  )
}
