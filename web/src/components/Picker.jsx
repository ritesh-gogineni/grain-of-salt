import { useState } from 'react'
import { DATA, FEATURED, OTHERS, POOLED, statFor, fmtBias, shortName } from '../model.js'

function BiasBadge({ p, mode }) {
  const s = statFor(p, mode)
  const cls = Math.abs(s.bias) < 0.5 ? 'N' : s.bias > 0 ? 'D' : 'R'
  const word = cls === 'N' ? 'about even' : cls === 'D' ? 'too Democratic' : 'too Republican'
  return (
    <span className={`badge ${cls}`}>
      <span className="sr-only">Usual miss over {s.n} polls: </span>{fmtBias(s.bias)} <span className="w">{word}</span>
    </span>
  )
}

export default function Picker({ pollsterId, setPollsterId, mode }) {
  const [more, setMore] = useState(!FEATURED.some((p) => p.id === pollsterId))
  return (
    <div>
      <div className="picker" role="group" aria-label="Featured pollsters">
        {FEATURED.map((p, i) => (
          <button key={p.id} type="button" className="pcard reveal" style={{ animationDelay: `${0.05 * i}s` }}
            aria-pressed={pollsterId === p.id} onClick={() => setPollsterId(p.id)}>
            <span className="name">{shortName(p)}</span>
            <BiasBadge p={p} mode={mode} />
            <span className="meta">{p.states_2026.length} of {DATA.races.length} races polled</span>
          </button>
        ))}
      </div>
      <div className="more">
        <button type="button" className="more-toggle" onClick={() => setMore((m) => !m)} aria-expanded={more} aria-controls="more-pollsters">
          {more ? 'Hide other pollsters' : `More pollsters (${OTHERS.length + 1})`}
        </button>
        {more && (
          <div id="more-pollsters" className="more" role="group" aria-label="Other pollsters" style={{ marginTop: 0 }}>
            <button type="button" className="chip" aria-pressed={pollsterId === POOLED.id} onClick={() => setPollsterId(POOLED.id)}>
              {shortName(POOLED)} <span className="b">{fmtBias(statFor(POOLED, mode).bias)}</span>
            </button>
            {OTHERS.map((p) => (
              <button key={p.id} type="button" className="chip" aria-pressed={pollsterId === p.id} onClick={() => setPollsterId(p.id)}>
                {shortName(p)} <span className="b">{fmtBias(statFor(p, mode).bias)}</span>
                <span className="sr-only">, {p.states_2026.length} races polled in 2026</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
