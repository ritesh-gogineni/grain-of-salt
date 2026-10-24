import { FEATURED, OTHERS, POOLED, META, statFor, fmtBias, shortName, fmtInt } from '../model.js'
import ReportCard from './ReportCard.jsx'

/** The track-record page: where a pollster's correction comes from, with a simple pollster switcher. */
export default function Record({ pollster, setPollsterId, mode, scope, homeHref }) {
  const s = statFor(pollster, mode)
  const name = shortName(pollster)
  const lean = Math.abs(s.bias) < 0.05 ? 'no lean' : `${Math.abs(s.bias).toFixed(1)} points too ${s.bias > 0 ? 'Democratic' : 'Republican'}`
  return (
    <div className="record">
      <section className="hero compact">
        <p className="kicker reveal">Track record · {META.first_cycle}–{META.latest_cycle}</p>
        <h1 className="reveal">Where the correction comes from</h1>
        <p className="reveal">
          For every past election, we compare what a pollster’s final polls said with what actually happened.
          The average gap is the number the site subtracts.
        </p>
      </section>
      <div className="controls flush record-pick">
        <label htmlFor="rec-pollster">Pollster</label>
        <select id="rec-pollster" className="pselect" value={pollster.id} onChange={(e) => setPollsterId(e.target.value)}>
          <optgroup label="Featured">
            {FEATURED.map((p) => <option key={p.id} value={p.id}>{shortName(p)}</option>)}
          </optgroup>
          <optgroup label="Others">
            <option value={POOLED.id}>{shortName(POOLED)}</option>
            {OTHERS.map((p) => <option key={p.id} value={p.id}>{shortName(p)}</option>)}
          </optgroup>
        </select>
        <span className="hint">
          {name}: {fmtInt(s.n)} polls graded, usual miss <b>{fmtBias(s.bias)}</b> ({lean}).
        </span>
      </div>
      <ReportCard pollster={pollster} mode={mode} scope={scope} />
      <p className="back"><a href={homeHref}>Back to the Senate</a></p>
    </div>
  )
}
