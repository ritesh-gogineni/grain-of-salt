import { shortName, statFor, fmtBias } from '../model.js'

/** Compact live summary beside the headline: the selected pollster's Senate, as polled and corrected. */
function Row({ label, D, R, total, strong }) {
  return (
    <div className={`hc-row ${strong ? 'strong' : ''}`}>
      <span className="hc-label">{label}</span>
      <span className="hc-num D">{D}</span>
      <span className="hc-bar" aria-hidden="true">
        <i className="D" style={{ width: `${(D / total) * 100}%` }} />
        <i className="R" style={{ width: `${(R / total) * 100}%` }} />
      </span>
      <span className="hc-num R">{R}</span>
    </div>
  )
}

export default function HeroCard({ t, pollster, mode, scope, rows }) {
  const name = shortName(pollster)
  const s = statFor(pollster, mode)
  const total = t.raw.D + t.raw.R
  const c = t.corrected
  const verdict = c.D > c.R ? `Democrats and independents ${c.D}–${c.R}` : c.D === c.R ? '50–50, Republicans hold the tiebreak' : `Republicans ${c.R}–${c.D}`
  return (
    <aside className="hero-card reveal" aria-label={`${name} at a glance`}>
      <p className="hc-kicker">Right now · {name}</p>
      <Row label="As polled" D={t.raw.D} R={t.raw.R} total={total} />
      <Row label="Corrected" D={c.D} R={c.R} total={total} strong />
      <p className="hc-foot">
        <b>{verdict}</b> after removing {name}’s {fmtBias(s.bias)} miss{scope === 'state' ? ', state by state' : ''}.
        {' '}{t.changed === 0 ? 'No race changes hands.' : `${t.changed} ${t.changed === 1 ? 'race changes' : 'races change'} hands.`}
        {' '}<a href="#tally">See the full count</a>
      </p>
      <p className="hc-legend" aria-hidden="true"><i className="D" />D + I <i className="R" />R · {rows.length} seats on the ballot, {total - rows.length} not up</p>
    </aside>
  )
}
