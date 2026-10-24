import { META, shortName, statFor, fmtInt } from '../model.js'

/** One row of the summary: the two seat counts and a proportional bar with the 50-seat line. */
function Row({ label, D, R, strong }) {
  const total = D + R
  return (
    <div className={`sum-row ${strong ? 'strong' : ''}`}>
      <span className="sum-label">{label}</span>
      <span className="sum-num D">{D}</span>
      <span className="sum-bar" aria-hidden="true">
        <i className="D" style={{ width: `${(D / total) * 100}%` }} />
        <i className="R" style={{ width: `${(R / total) * 100}%` }} />
      </span>
      <span className="sum-num R">{R}</span>
    </div>
  )
}

export default function Tally({ t, pollster, mode, scope, rows, recordHref }) {
  const s = statFor(pollster, mode)
  const name = shortName(pollster)
  const c = t.corrected
  const lean = Math.abs(s.bias) < 0.05 ? null : s.bias > 0 ? 'Democratic' : 'Republican'
  const verdict = c.D > c.R ? `Democrats ${c.D}, Republicans ${c.R}`
    : c.D === c.R ? '50–50, with the vice president breaking ties for Republicans'
      : `Republicans ${c.R}, Democrats ${c.D}`
  const changed = t.changed === 0 ? 'No race changes hands.' : `${t.changed} ${t.changed === 1 ? 'race changes' : 'races change'} hands.`
  return (
    <div className="summary">
      <p className="sr-only" aria-live="polite">
        {name}: as polled {t.raw.D} Democrats to {t.raw.R} Republicans; corrected {c.D} to {c.R}.
      </p>
      <p className="sum-kicker">{name} · Senate 2026</p>
      <Row label="Polls say" D={t.raw.D} R={t.raw.R} />
      <Row label="Corrected" D={c.D} R={c.R} strong />
      <p className="sum-text">
        {lean
          ? <>{name}’s past polls have run about <b>{Math.abs(s.bias).toFixed(1)} points too {lean}</b>{scope === 'state' ? ', more in some states than others' : ''}. Take that out and the Senate is <b>{verdict}</b>. {changed}</>
          : <>{name}’s past polls have shown <b>no lean</b> on average, so the corrected Senate is the same: <b>{verdict}</b>.</>}
      </p>
      <p className="sum-foot">
        Democrats include the independents who caucus with them. {META.seats_not_up.D + META.seats_not_up.R} seats are not up this year.{' '}
        {name} has polled {t.polled} of the {rows.length} races; the rest use the average of other pollsters.{' '}
        Based on {fmtInt(s.n)} {name} polls since {META.first_cycle}. <a href={recordHref}>See the full track record</a>
      </p>
    </div>
  )
}
