import { DATA, POOLED, META, statFor, biasFor, fmtBias, shortName } from '../model.js'

export function CycleChart({ cycles, pooled, height = 200 }) {
  const years = []
  for (let y = META.first_cycle; y <= META.latest_cycle; y += 2) years.push(y)
  const W = 520, H = height, padL = 34, padR = 10, padT = 16, padB = 26
  const iw = W - padL - padR, ih = H - padT - padB
  const vals = [...cycles.map((c) => c.bias), ...pooled.map((c) => c.all.bias)]
  const lim = Math.max(4, Math.ceil(Math.max(...vals.map(Math.abs)) + 0.5))
  const y = (v) => padT + ih / 2 - (v / lim) * (ih / 2)
  const bw = iw / years.length
  const byYear = Object.fromEntries(cycles.map((c) => [c.cycle, c]))
  const pooledBy = Object.fromEntries(pooled.map((c) => [c.cycle, c]))
  const ticks = []
  for (let v = -lim; v <= lim; v += lim >= 8 ? 4 : 2) ticks.push(v)
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Average signed polling miss by election cycle">
      {ticks.map((v) => (
        <g key={v}>
          <line className="axis" x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} strokeWidth="1" />
          <text x={padL - 6} y={y(v) + 3.5} textAnchor="end">{v === 0 ? '0' : `${v > 0 ? 'D' : 'R'}+${Math.abs(v)}`}</text>
        </g>
      ))}
      <line className="zero" x1={padL} x2={W - padR} y1={y(0)} y2={y(0)} strokeWidth="1.2" />
      {years.map((yr, i) => {
        const c = byYear[yr]
        const x0 = padL + i * bw
        const barW = Math.min(40, bw * 0.42)
        const xb = x0 + bw * 0.1
        return (
          <g key={yr}>
            {c ? (
              <>
                <rect className={`bar ${c.n < 5 ? 'ghost' : c.bias >= 0 ? 'D' : 'R'}`} x={xb} y={Math.min(y(0), y(c.bias))} width={barW} height={Math.max(1, Math.abs(y(c.bias) - y(0)))} rx="3">
                  {c.n < 5 && <title>Only {c.n} graded poll{c.n > 1 ? 's' : ''} this cycle; shown faded.</title>}
                </rect>
                <text className="lab" x={xb + barW / 2} y={c.bias >= 0 ? y(c.bias) - 5 : y(c.bias) + 12} textAnchor="middle">{c.bias > 0 ? '+' : ''}{c.bias.toFixed(1)}</text>
                <text x={xb + barW / 2} y={H - 3} textAnchor="middle" style={{ fontSize: 9.5 }}>n={c.n}</text>
              </>
            ) : (
              <text x={x0 + bw / 2} y={y(0) - 5} textAnchor="middle" style={{ fontSize: 10 }}>no polls</text>
            )}
            <text x={x0 + bw / 2} y={H - 14} textAnchor="middle">{yr}</text>
            {i === years.length - 1 && pooledBy[yr] && (
              <text x={x0 + bw * 0.74} y={y(pooledBy[yr].all.bias) - 8} textAnchor="middle" style={{ fontSize: 9.5 }}>all</text>
            )}
          </g>
        )
      })}
      <polyline className="pooled" points={years.filter((yr) => pooledBy[yr]).map((yr) => {
        const idx = years.indexOf(yr); return `${padL + idx * bw + bw * 0.74},${y(pooledBy[yr].all.bias)}`
      }).join(' ')} />
      {years.filter((yr) => pooledBy[yr]).map((yr) => (
        <circle key={yr} className="pdot" cx={padL + years.indexOf(yr) * bw + bw * 0.74} cy={y(pooledBy[yr].all.bias)} r="3.5">
          <title>All pollsters {yr}: {pooledBy[yr].all.bias > 0 ? 'D' : 'R'}+{Math.abs(pooledBy[yr].all.bias).toFixed(1)} across {pooledBy[yr].all.n} polls</title>
        </circle>
      ))}
    </svg>
  )
}

const TYPE_WORD = { 'Sen-G': 'Senate', 'Gov-G': 'governor', 'Pres-G': 'president' }
const LOC = { M1: 'ME-1', M2: 'ME-2', N1: 'NE-1', N2: 'NE-2', N3: 'NE-3', US: 'national' }
const signed = (m) => (Math.abs(m) < 0.05 ? 'Even' : `${m > 0 ? 'D' : 'R'}+${Math.abs(m).toFixed(1)}`)

/** Year-by-year: what the polls said, what happened, and the gap. */
export function YearTable({ cycles, name, compact = false }) {
  const rows = cycles.filter((c) => c.cycle % 2 === 0)
  return (
    <div className="yearwrap">
      <table className="polls yeartable">
        <thead>
          <tr>
            <th scope="col">Year</th>
            <th scope="col" className="n">Polls graded</th>
            <th scope="col" className="n">Polls said</th>
            <th scope="col" className="n">Result was</th>
            <th scope="col" className="n">Gap</th>
            {!compact && <th scope="col" className="n">Called the winner</th>}
            {!compact && <th scope="col">Biggest miss that year</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const w = c.worst
            const thin = c.n < 5
            return (
              <tr key={c.cycle} className={thin ? 'thin' : ''}>
                <td className="n"><b>{c.cycle}</b></td>
                <td className="n">{c.n}</td>
                <td className="n">{signed(c.poll_avg)}</td>
                <td className="n">{signed(c.actual_avg)}</td>
                <td className={`n gap ${Math.abs(c.bias) < 0.5 ? '' : c.bias > 0 ? 'D' : 'R'}`}>
                  <b>{fmtBias(c.bias)}</b>
                  <span className="sub">{Math.abs(c.bias) < 0.5 ? 'about even' : c.bias > 0 ? 'too Democratic' : 'too Republican'}</span>
                </td>
                {!compact && <td className="n">{c.right_side} of {c.n}</td>}
                {!compact && w && (
                  <td className="worst">
                    {LOC[w.state] || w.state} {TYPE_WORD[w.type]}: poll {signed(w.poll)}, result {signed(w.actual)}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="yearnote">
        “Polls said” and “Result was” are the average Democrat-minus-Republican margin across every race {name} polled in the final three weeks that year.
        The gap between them is the number this site subtracts. Years with fewer than five graded polls are faded.
      </p>
    </div>
  )
}

function StateTable({ pollster, mode }) {
  const races = DATA.races.filter((r) => pollster.id === 'ALL' ? r.consensus : r.by_pollster[pollster.id])
  const rows = races.map((r) => ({ r, b: biasFor(pollster, r.abbr, mode, 'state') })).sort((a, b) => b.b.n - a.b.n)
  return (
    <table className="polls mt">
      <thead><tr><th scope="col">2026 race</th><th scope="col" className="n">Graded polls there</th><th scope="col" className="n">Miss there</th><th scope="col" className="n">Correction used</th></tr></thead>
      <tbody>
        {rows.map(({ r, b }) => (
          <tr key={r.key}>
            <td>{r.state}{r.special ? ' (sp.)' : ''}</td>
            <td className="n">{b.n || <span className="muted">none</span>}</td>
            <td className="n">{b.n ? fmtBias(b.raw) : <span className="muted">uses overall</span>}</td>
            <td className="n"><b>{fmtBias(b.bias)}</b></td>
          </tr>
        ))}
        {rows.length === 0 && <tr><td colSpan="4" className="muted">No 2026 races polled.</td></tr>}
      </tbody>
    </table>
  )
}

export default function ReportCard({ pollster, mode, scope }) {
  const s = statFor(pollster, mode)
  const rec = pollster.stats.recency, flat = pollster.stats.flat, latest = pollster.stats.latest
  const name = shortName(pollster)
  const byType = {}
  for (const c of pollster.cycles) for (const [t, v] of Object.entries(c.by_type)) { byType[t] = byType[t] || { n: 0, sum: 0 }; byType[t].n += v.n; byType[t].sum += v.bias * v.n }
  const typeLabel = { 'Sen-G': 'Senate', 'Gov-G': 'Governor', 'Pres-G': 'President' }
  const dir = (b) => Math.abs(b) < 0.5 ? 'close to even' : b > 0 ? 'too Democratic' : 'too Republican'
  const latestCycle = pollster.cycles.filter((c) => c.cycle % 2 === 0).slice(-1)[0]
  return (
    <div className="report">
      <div>
        <h3>{name}: what the polls said vs. what happened, year by year</h3>
        <p className="lede">
          {latestCycle && (
            <>In {latestCycle.cycle}, {name}’s {latestCycle.n} final-three-week polls averaged <b>{signed(latestCycle.poll_avg)}</b> across the races they covered.
              The results in those same races averaged <b>{signed(latestCycle.actual_avg)}</b>. The gap, <b>{fmtBias(latestCycle.bias)}</b>, is how far their polls leaned that year.{' '}</>
          )}
          Each row below repeats that comparison for one election year.
        </p>
        <YearTable cycles={pollster.cycles} name={name} />
        <p className="lede gap">
          The same gaps as a chart. Bars above the line mean polls ran too Democratic; the dashed line is every pollster pooled.
          Notice how the sign moves together across the industry; that is why no single number is the whole story.
        </p>
        <CycleChart cycles={pollster.cycles} pooled={DATA.industry} />
        <div className="legend">
          <span><i className="D" />Ran too Democratic</span>
          <span><i className="R" />Ran too Republican</span>
          <span><i className="P" />All pollsters pooled</span>
        </div>
      </div>
      <div>
        <div className="stats">
          <div className="stat"><div className="k">Overall miss</div><div className={`v ${s.bias > 0.5 ? 'D' : s.bias < -0.5 ? 'R' : ''}`}>{fmtBias(s.bias)}</div><div className="d">{dir(s.bias)} · {mode === 'recency' ? 'recency-weighted' : mode === 'flat' ? 'flat average' : '2024 only'}{scope === 'state' ? ' · fallback when a state has no record' : ' · applied to every race'}</div></div>
          <div className="stat"><div className="k">Typical scatter</div><div className="v">±{s.sigma}</div><div className="d">one standard deviation</div></div>
          <div className="stat"><div className="k">Polls graded</div><div className="v">{s.n}</div><div className="d">{pollster.id === 'ALL' ? 'all pollsters' : `effective weight ${s.n_eff}`}</div></div>
          <div className="stat"><div className="k">Absolute error</div><div className="v">{s.mae}</div><div className="d">average, ignoring direction</div></div>
        </div>
        <table className="polls mt-lg">
          <thead><tr><th scope="col">Weighting</th><th scope="col" className="n">Miss</th><th scope="col" className="n">Scatter</th><th scope="col" className="n">Polls</th></tr></thead>
          <tbody>
            <tr className={mode === 'recency' ? 'used' : ''}><td>Recency-Weighted</td><td className="n">{fmtBias(rec.bias)}</td><td className="n">±{rec.sigma}</td><td className="n">{rec.n}</td></tr>
            <tr className={mode === 'flat' ? 'used' : ''}><td>Flat Average</td><td className="n">{fmtBias(flat.bias)}</td><td className="n">±{flat.sigma}</td><td className="n">{flat.n}</td></tr>
            <tr className={mode === 'latest' ? 'used' : ''}><td>2024 Only</td><td className="n">{latest ? fmtBias(latest.bias) : '—'}</td><td className="n">{latest ? `±${latest.sigma}` : '—'}</td><td className="n">{latest ? latest.n : 0}</td></tr>
          </tbody>
        </table>
        <table className="polls mt">
          <thead><tr><th scope="col">By race type</th><th scope="col" className="n">Miss</th><th scope="col" className="n">Polls</th></tr></thead>
          <tbody>
            {Object.entries(byType).map(([t, v]) => (
              <tr key={t}><td>{typeLabel[t]}</td><td className="n">{fmtBias(v.sum / v.n)}</td><td className="n">{v.n}</td></tr>
            ))}
          </tbody>
        </table>
        {scope === 'state' && (
          <>
            <h4 className="subhead">
              State by state, for the races {shortName(pollster)} polled
            </h4>
            <StateTable pollster={pollster} mode={mode} />
            <p className="small">
              “Correction used” blends the state record with the overall miss, giving the overall number {META.state_k} polls' worth of weight.
              A state with no graded polls gets the overall miss unchanged. Open any race above to see every past poll behind its state record.
            </p>
          </>
        )}
        {pollster.id !== 'ALL' && (
          <p className="compare">
            Industry-wide, the same measure is {fmtBias(statFor(POOLED, mode).bias)}. {name}’s correction is {Math.abs(s.bias - statFor(POOLED, mode).bias) < 0.5 ? 'about the same as' : Math.abs(s.bias) > Math.abs(statFor(POOLED, mode).bias) ? 'larger than' : 'smaller than'} the field's.
          </p>
        )}
      </div>
    </div>
  )
}
