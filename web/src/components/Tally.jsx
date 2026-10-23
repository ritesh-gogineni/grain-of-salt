import { META, shortName, statFor, fmtBias } from '../model.js'

function Strip({ rows, which }) {
  const base = META.seats_not_up
  const d = rows.filter((r) => r.e[which === 'raw' ? 'rawSide' : 'side'] === 'D')
  const r = rows.filter((r) => r.e[which === 'raw' ? 'rawSide' : 'side'] === 'R')
  const callKey = which === 'raw' ? 'rawCall' : 'call'
  const sortByMargin = (a, b) => Math.abs(b.e[which]) - Math.abs(a.e[which])
  d.sort(sortByMargin); r.sort(sortByMargin)
  const cells = []
  for (let i = 0; i < base.D; i++) cells.push(<i key={`bd${i}`} className="D dim" />)
  d.forEach((x) => cells.push(<i key={x.race.key} className={`D ${x.e[callKey] === 'Toss-up' ? 'toss' : ''}`} />))
  r.slice().reverse().forEach((x) => cells.push(<i key={x.race.key} className={`R ${x.e[callKey] === 'Toss-up' ? 'toss' : ''}`} />))
  for (let i = 0; i < base.R; i++) cells.push(<i key={`br${i}`} className="R dim" />)
  return <div className="strip majority" aria-hidden="true">{cells}</div>
}

function Card({ label, tag, D, R, toss, rows, which, foot }) {
  const dLead = D > R
  return (
    <div className={`tcard ${which}`}>
      <div className="label"><span>{label}</span>{tag && <span className="tag">{tag}</span>}</div>
      <div className="seats">
        <div className="seat D"><span className="num">{D}</span><small>D&nbsp;+&nbsp;I</small></div>
        <div className="seat R"><small>R</small><span className="num">{R}</span></div>
      </div>
      <Strip rows={rows} which={which} />
      <div className="strip-legend" aria-hidden="true">
        <span><i className="D" />D wins</span>
        <span><i className="R" />R wins</span>
        <span><i className="dim" />Not up in 2026</span>
        <span><i className="toss" />Toss-up (within 3)</span>
      </div>
      <div className="foot">
        {dLead ? <><b>Democrats and independents {D}</b>, Republicans {R}.</> : D === R ? <><b>50–50</b>; the vice president breaks ties for Republicans.</> : <><b>Republicans {R}</b>, Democrats and independents {D}.</>}
        {' '}{toss} {toss === 1 ? 'race' : 'races'} inside three points. {foot}
      </div>
    </div>
  )
}

export default function Tally({ t, pollster, mode, scope, rows }) {
  const s = statFor(pollster, mode)
  const name = shortName(pollster)
  const withState = rows.filter((r) => r.e.source === 'pollster' && r.e.biasInfo && r.e.biasInfo.n > 0).length
  return (
    <div className="tally">
      <p className="sr-only" aria-live="polite">
        {name}, {scope === 'state' ? 'corrected by state' : 'corrected pollster-wide'}: as polled {t.raw.D} Democrats and independents to {t.raw.R} Republicans;
        corrected {t.corrected.D} to {t.corrected.R}.
      </p>
      <Card label={`As polled by ${name}`} D={t.raw.D} R={t.raw.R} toss={t.raw.toss} rows={rows} which="raw"
        foot={<>{t.polled} of {rows.length} races have a {name} poll; the rest use the all-pollster average or race ratings.</>} />
      <Card label={scope === 'state' ? 'Corrected for their record in each state' : 'Corrected for their overall record'}
        tag={scope === 'state' ? `${withState} of ${t.polled} races use a state record` : fmtBias(s.bias) + ' removed'}
        D={t.corrected.D} R={t.corrected.R} toss={t.corrected.toss} rows={rows} which="corrected"
        foot={<>{t.changed === 0 ? 'No race changes hands after the correction.' : `${t.changed} ${t.changed === 1 ? 'race changes' : 'races change'} hands after the correction.`} {t.flips} would flip from the party holding the seat.</>} />
    </div>
  )
}
