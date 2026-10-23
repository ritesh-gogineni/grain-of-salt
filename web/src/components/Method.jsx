import { DATA, META, POOLED, FEATURED, OTHERS, pollsterById, statFor, biasFor, estimate, fmtBias, fmtMargin, fmtInt, fmtLongDate, shortName } from '../model.js'
import { CycleChart, YearTable } from './ReportCard.jsx'

const pct = (x) => `${x.toFixed(1)}`
const signed = (m) => (Math.abs(m) < 0.05 ? 'Even' : `${m > 0 ? 'D' : 'R'}+${Math.abs(m).toFixed(1)}`)
const TOC = [['m-idea', 'The idea'], ['m-data', 'Where the data comes from'], ['m-bias', 'Bias is not error'], ['m-weights', 'Weighting the past'],
  ['m-state', 'State by state'], ['m-example', 'A worked example'], ['m-2026', 'Reading the 2026 polls'], ['m-gaps', 'Races nobody polled'], ['m-seats', 'Counting seats'],
  ['m-pollsters', 'Which pollsters, and why'], ['m-limits', 'What this cannot tell you'], ['m-glossary', 'Glossary']]

export default function Method({ pollster }) {
  const pooled = statFor(POOLED, 'recency')
  const em = pollsterById['88'] || FEATURED[0]
  const tx = DATA.races.find((r) => r.key === 'Texas')
  const exRace = tx && tx.by_pollster[em.id] ? tx : DATA.races.find((r) => r.by_pollster[em.id])
  const ex = estimate(exRace, em, 'recency', 'state')
  const emStat = statFor(em, 'recency')
  const exB = ex.biasInfo
  const ga = biasFor(em, 'GA', 'recency', 'state')
  const txB = biasFor(em, 'TX', 'recency', 'state')
  const iaAll = biasFor(POOLED, 'IA', 'recency', 'state')
  const gaAll = biasFor(POOLED, 'GA', 'recency', 'state')
  const years = []
  for (let y = META.first_cycle; y <= META.latest_cycle; y += 2) years.push(y)
  const weights = years.map((y) => ({ y, w: Math.pow(META.decay, (META.latest_cycle - y) / 2) }))
  const ind = Object.fromEntries(DATA.industry.map((r) => [r.cycle, r]))
  const unpolled = DATA.races.filter((r) => !r.consensus)
  const sel = pollster.id === 'ALL' ? FEATURED[0] : pollster

  return (
    <article className="prose">
      <p className="kicker">How it works</p>
      <h1>A poll is a measurement. Measurements have a known error.</h1>
      <p className="lede">
        Grain of Salt does one thing: it takes a pollster’s current Senate numbers and subtracts the amount that same
        pollster has, on average, been wrong by in the past. This page explains every step, with the real numbers behind the site.
      </p>
      <ul className="toc">
        {TOC.map(([id, label]) => <li key={id}><a href={`#/method/${id}`}>{label}</a></li>)}
      </ul>

      <h2 id="m-idea">The idea</h2>
      <p>
        Every pollster has a house style: who they call, how they weight by education or past vote, how they model
        turnout. Those choices leave a fingerprint. When you line up a pollster’s final polls against the certified
        results across many races, the misses do not scatter evenly around zero. They lean. In {META.latest_cycle},
        polls across the industry ran about {pct(Math.abs(ind[2024].all.bias))} points too Democratic on the margin.
        In 2020 it was {pct(Math.abs(ind[2020].all.bias))}. In 2022 the lean all but vanished ({fmtBias(ind[2022].all.bias)}).
      </p>
      <p>
        A forecaster would build a model around all of this. We do something smaller and more legible. For the pollster
        you pick, we compute one number, their average signed miss, and subtract it from their current margin in each race.
        What you get is not a prediction. It is the same poll, read by someone who remembers how that pollster’s last
        few hundred polls turned out.
      </p>

      <h2 id="m-data">Where the data comes from</h2>
      <h3>History, {META.first_cycle}–2022</h3>
      <p>
        FiveThirtyEight graded pollsters for a decade and published the underlying file: every poll they rated, next to
        the actual result of the race it polled. ABC News shut the site down in March 2025, but the archive remains on{' '}
        <a href={META.sources.history}>GitHub</a>. We use its general-election polls for Senate, governor and president
        (statewide and national), from {META.first_cycle} on.
      </p>
      <h3>History, 2024</h3>
      <p>
        The archive stops before 2024. We rebuilt that cycle ourselves from FiveThirtyEight’s own 2024 poll files
        (captured by the <a href={META.sources.polls_2024}>Wayback Machine</a> the day after the election) and joined each poll to the
        certified result of its race. For 2024 we kept the likely-voter version of a poll when several were published.
      </p>
      <h3>Filters applied to every historical poll</h3>
      <ul>
        <li>Fielded within the final <b>{META.max_days_out} days</b> before the election. Earlier polls measure a different moment, not pollster skill.</li>
        <li>Two-party races only: a Democrat and a Republican as the top two finishers. Independents and same-party runoffs are excluded from grading, because “overstated the Democrat” has no meaning there.</li>
        <li>No internal or partisan-sponsored polls in the history. In 2026, sponsored polls are listed with a tag for completeness but never feed an estimate.</li>
        <li>Odd-year special elections dropped; they are rare and noisy.</li>
      </ul>
      <p>That leaves <b>{fmtInt(META.hist_polls)}</b> graded polls across {years.length} cycles.</p>
      <h3>2026</h3>
      <p>
        Current Senate polls are read from the polling tables on <a href={META.sources.polls_2026}>Wikipedia’s per-state election pages</a>,
        the most complete public list, then topped up with anything the <a href={META.sources.polls_2026_vh}>VoteHub polling API</a> (CC&nbsp;BY&nbsp;4.0)
        has that Wikipedia lacks. As of {fmtLongDate(META.built)} that is {fmtInt(META.polls_2026)} polls of the 35 nominee matchups,
        {fmtInt(META.polls_2026_np)} of them non-partisan. A poll counts only if it tested the two actual nominees; primaries and hypothetical
        matchups are ignored. Nominees and the consensus race ratings come from <a href={META.sources.nominees}>Wikipedia</a> too. Nothing here is
        edited by hand; a script rebuilds the whole site from these sources.
      </p>

      <h2 id="m-bias">Bias is not error</h2>
      <p>
        Two different questions get mixed up in conversations about polls. <b>How far off are they?</b> is error. It
        ignores direction: a poll that is 4 points too Democratic and one that is 4 points too Republican have the same
        error. <b>Which way do they lean?</b> is bias. It keeps the sign, so those two polls average out to zero bias.
      </p>
      <p>
        Only bias can be subtracted. If a pollster's polls have been, on average, 3 points too Democratic, then shaving
        3 points off their Democratic margins is a reasonable adjustment. Knowing they are “usually off by 4” tells you to
        be humble, but not which way to lean. So:
      </p>
      <div className="formula">
        miss  =  poll margin − actual margin        (Democrat minus Republican, in points)<br />
        bias  =  average of the misses              (sign kept)<br />
        error =  average of |miss|                  (sign dropped; shown but never subtracted)
      </div>
      <p>
        A positive bias means the pollster overstated Democrats. We write it as “D+2.5” on the site, meaning their
        margins ran 2.5 points too Democratic. Throughout the site we also show the <b>scatter</b> (standard deviation of the
        misses around the bias) as a shaded band. A corrected lead that sits inside that band is a toss-up in all but name.
      </p>
      <h3>The gap, year by year, for every pollster pooled</h3>
      <p>
        Here is the whole record in one table. For each election year: how many final-three-week polls were graded, what
        those polls said on average, what the results in those same races were, and the gap. The last column is the single
        worst miss that year, to make the numbers concrete.
      </p>
      <YearTable cycles={POOLED.cycles} name="all pollsters" />
      <p>
        Read 2020 as: across {POOLED.cycles.find((c) => c.cycle === 2020).n} polls, pollsters said the Democrat led by about {Math.abs(POOLED.cycles.find((c) => c.cycle === 2020).poll_avg).toFixed(1)} points on average,
        and the results came in at roughly {signed(POOLED.cycles.find((c) => c.cycle === 2020).actual_avg)}. Polls were {Math.abs(POOLED.cycles.find((c) => c.cycle === 2020).bias).toFixed(1)} points too
        Democratic. The same table for any single pollster is on the main page, under “Where the correction comes from”.
      </p>

      <h2 id="m-weights">Weighting the past</h2>
      <p>
        Pollsters change methods, and the political environment changes what goes wrong. Education weighting became
        standard after 2016; recalled-vote weighting spread after 2020. Treating a 2014 poll as equal evidence to a 2024
        poll is a choice, so we expose three options and default to the middle one.
      </p>
      <table>
        <thead><tr><th scope="col">Mode</th><th scope="col">What it does</th><th scope="col" className="n">{shortName(sel)}</th><th scope="col" className="n">All pollsters</th></tr></thead>
        <tbody>
          <tr><td><b>Recency-Weighted</b> (default)</td><td>Each cycle’s polls count {META.decay}× as much as the cycle after it. {META.latest_cycle} counts fully; {years[0]} counts {pct(weights[0].w * 100)}%.</td><td className="n">{fmtBias(sel.stats.recency.bias)}</td><td className="n">{fmtBias(POOLED.stats.recency.bias)}</td></tr>
          <tr><td><b>Flat Average</b></td><td>Every poll since {META.first_cycle} counts equally.</td><td className="n">{fmtBias(sel.stats.flat.bias)}</td><td className="n">{fmtBias(POOLED.stats.flat.bias)}</td></tr>
          <tr><td><b>2024 Only</b></td><td>Only the most recent cycle. Freshest, and most exposed to one cycle’s quirks.</td><td className="n">{sel.stats.latest ? fmtBias(sel.stats.latest.bias) : '—'}</td><td className="n">{fmtBias(POOLED.stats.latest.bias)}</td></tr>
        </tbody>
      </table>
      <p>The cycle weights in recency mode, for reference:</p>
      <div className="formula">
        {weights.map((w) => `${w.y} → ${w.w.toFixed(2)}`).join('  ·  ')}
      </div>
      <h3>Shrinkage, so thin records do not shout</h3>
      <p>
        A pollster with twelve graded polls should not get a bolder correction than one with three hundred. We pull every
        estimate toward zero by adding a fixed <b>{META.shrink_k} polls’ worth</b> of imaginary perfect polls to the denominator:
      </p>
      <div className="formula">
        bias  =  Σ (weight × miss)  ÷  ( Σ weight + {META.shrink_k} )
      </div>
      <p>
        For a pollster with hundreds of polls this changes nothing visible. For one with twenty, it trims the correction
        by about a fifth. Pollsters with fewer than {META.min_hist} graded polls are not offered at all (see below).
      </p>
      <figure>
        <CycleChart cycles={POOLED.cycles} pooled={[]} height={190} />
        <figcaption>
          Average signed miss of all graded polls, by cycle. The industry leaned Democratic in {years.filter((y) => ind[y] && ind[y].all.bias > 1).join(', ')} and was close to even in {years.filter((y) => ind[y] && Math.abs(ind[y].all.bias) <= 1).join(' and ')}.
          This is the central caveat of the whole exercise: the sign is not stable, and the average you subtract is an average of unlike years.
        </figcaption>
      </figure>

      <h2 id="m-state">State by state</h2>
      <p>
        A pollster’s miss is not the same everywhere. Turnout models that work in Georgia can fail in Iowa; a firm that
        polls Texas every cycle has a different track record there than a firm visiting for the first time. So the default
        correction is <b>state-specific</b>: for each race we grade only that pollster's past polls in that state (Senate,
        governor and presidential), using the same filters and the same cycle weights.
      </p>
      <p>
        Two numbers from the data make the case. {shortName(em)} has {ga.n} graded polls in Georgia with an average miss of {fmtBias(ga.raw)},
        close to perfect, but {txB.n} in Texas that ran {fmtBias(txB.raw)}. One pollster-wide number ({fmtBias(emStat.bias)}) would
        under-correct Texas and over-correct Georgia. The same is true of the industry as a whole: all pollsters pooled miss by {fmtBias(iaAll.raw)} in
        Iowa ({iaAll.n} polls) but only {fmtBias(gaAll.raw)} in Georgia ({gaAll.n} polls).
      </p>
      <h3>Thin state records are blended, not trusted</h3>
      <p>
        A state record of two polls is not evidence enough to override hundreds of polls elsewhere. So the state number is
        pulled toward the pollster’s overall miss, with the overall miss carrying a fixed <b>{META.state_k} polls’ worth</b> of weight:
      </p>
      <div className="formula">
        state correction  =  ( Σ weight × miss in that state  +  {META.state_k} × overall miss )  ÷  ( Σ weight in that state  +  {META.state_k} )
      </div>
      <p>
        With no polls in the state this collapses to the overall miss exactly, which is the fallback. With four polls’ worth
        of weight the state record counts for half; with twelve, three quarters. Each race's detail panel shows the state count,
        the raw state miss, and the blend. The “Pollster-Wide” toggle switches the whole site back to one correction per
        pollster, and the report card lists every state the pollster has polled in 2026 with both numbers side by side.
      </p>
      <p className="note">
        State records include a pollster's presidential polls of that state, not only Senate polls. A pollster’s Senate-only
        record in one state is usually a handful of polls, which is too few to learn from on its own.
      </p>

      <h2 id="m-example">A worked example</h2>
      <p>
        Take {shortName(em)} in {exRace.state}, {exRace.cand1.name} ({exRace.cand1.party[0]}) against {exRace.cand2.name} (R), with the default recency weighting and the state-specific correction.
      </p>
      <div className="walk">
        <div className="row"><span>{shortName(em)}’s recent polls of the race (up to three, within {META.recent_days} days)</span><span>{ex.est.n_polls} poll{ex.est.n_polls > 1 ? 's' : ''}, latest {ex.est.latest}</span></div>
        <div className="row"><span>Average margin in those polls</span><span>{fmtMargin(ex.raw, exRace)} ({ex.raw > 0 ? '+' : ''}{ex.raw.toFixed(1)})</span></div>
        <div className="row"><span>{shortName(em)}’s recency-weighted miss over {emStat.n} graded polls everywhere</span><span>{fmtBias(emStat.bias)} ({emStat.bias > 0 ? '+' : ''}{emStat.bias.toFixed(1)})</span></div>
        <div className="row"><span>{shortName(em)}’s graded polls in {exRace.abbr} ({exB.cycles ? exB.cycles.join(', ') : '—'})</span><span>{exB.n} polls, average miss {fmtBias(exB.raw)}</span></div>
        <div className="row"><span>Blend: {Math.round(exB.share * 100)}% {exRace.abbr} record, {Math.round((1 - exB.share) * 100)}% overall</span><span>{fmtBias(exB.bias)} ({exB.bias > 0 ? '+' : ''}{exB.bias.toFixed(1)})</span></div>
        <div className="row"><span>Subtract</span><span>{ex.raw > 0 ? '+' : ''}{ex.raw.toFixed(1)} − ({exB.bias > 0 ? '+' : ''}{exB.bias.toFixed(1)}) = {ex.corrected > 0 ? '+' : ''}{ex.corrected.toFixed(1)}</span></div>
        <div className="row"><span>Scatter of their misses</span><span>±{emStat.sigma}</span></div>
        <div className="row"><span>Corrected reading</span><span>{fmtMargin(ex.corrected, exRace)} · {ex.call}{ex.call !== 'Toss-up' ? ' ' + ex.side : ''}</span></div>
      </div>
      <p>
        Every row on the main page can be opened to show this same arithmetic, along with the individual polls that fed it and a link to each one.
      </p>

      <h2 id="m-2026">Reading the 2026 polls</h2>
      <ul>
        <li><b>The matchup</b> is the Republican nominee against the strongest non-Republican in polls from the last 120 days. In Nebraska, South Dakota, Idaho and Montana that is an independent, and the site counts independents with Democrats (“D&nbsp;+&nbsp;I”), as the Senate’s own tallies do. That is a convenience, not a prediction about whom they would caucus with.</li>
        <li><b>A pollster’s number</b> for a race is the average of their most recent polls of that matchup, up to three, that finished within the last {META.recent_days} days. If they have none that fresh, we use their single latest poll and flag it <i>stale</i> with its date.</li>
        <li><b>Polls that only tested a primary</b>, a hypothetical opponent, or were paid for by a campaign or party are excluded.</li>
        <li><b>Head-to-head and multi-candidate versions</b> of the same poll are both acceptable; we read the two nominees' numbers from whichever the pollster published.</li>
      </ul>

      <h2 id="m-gaps">Races nobody polled</h2>
      <p>
        No pollster covers all 35 races. Emerson, the most prolific, has polled {em.states_2026.length}. When your pollster has not
        touched a race, the row says so plainly and falls back in two steps:
      </p>
      <ol>
        <li><b>The all-pollster average</b>: the latest poll from each non-partisan pollster in the last {META.recent_days} days, averaged, then corrected with the industry’s record in that state (blended toward the industry-wide {fmtBias(pooled.bias)} the same way) instead of your pollster’s.</li>
        <li><b>Race ratings</b>: {unpolled.length} races ({unpolled.map((r) => r.abbr).join(', ')}) have no usable public poll at all. For those we average the ratings of {Object.keys(DATA.races[0].ratings).length - 3} outlets (Cook, Sabato, Inside Elections and others) and assign a nominal margin: Safe = 15, Likely = 8, Lean = 4. Ratings are not polls, so no correction is applied.</li>
      </ol>
      <p className="note">
        The “Only Races X Polled” toggle on the main page hides both fallbacks, so you can look at a pollster’s own work in isolation.
      </p>

      <h2 id="m-seats">Counting seats</h2>
      <p>
        {META.seats_not_up.D} seats held by Democrats and independents and {META.seats_not_up.R} held by Republicans are not on the 2026 ballot.
        Each of the 35 contested races is awarded to whichever side leads the (raw or corrected) margin, with ties going to the
        party that holds the seat. A race inside three points is also counted as a toss-up and striped in the seat strip, so you can see
        how much of a majority rests on coin flips. Republicans control a 50–50 Senate through the vice president, so Democrats need 51.
      </p>

      <h2 id="m-pollsters">Which pollsters, and why</h2>
      <p>
        “Most popular” is slippery, so we used something countable. A pollster is eligible if it has polled at least two 2026
        Senate general-election matchups and has at least {META.min_hist} graded polls in the historical record. Eligible pollsters are
        ranked by how many 2026 Senate races they have polled, with ties broken by the depth of their track record. The top five are
        featured; the rest sit behind “More Pollsters”.
      </p>
      <table>
        <thead><tr><th scope="col">Pollster</th><th scope="col" className="n">2026 races</th><th scope="col" className="n">Graded polls</th><th scope="col" className="n">Recency miss</th><th scope="col" className="n">Scatter</th></tr></thead>
        <tbody>
          {[...FEATURED, ...OTHERS].map((p) => (
            <tr key={p.id}><td>{shortName(p)}{p.featured ? '' : <span className="muted"> (more)</span>}</td><td className="n">{p.states_2026.length}</td><td className="n">{p.hist_n}</td><td className="n">{fmtBias(p.stats.recency.bias)}</td><td className="n">±{p.stats.recency.sigma}</td></tr>
          ))}
        </tbody>
      </table>
      <p>
        Some active 2026 pollsters are missing because they have no graded history to correct against. The biggest absence
        is {DATA.excluded[0].name} ({DATA.excluded[0].states_2026} races polled, {DATA.excluded[0].hist_n} graded polls).
        {DATA.excluded.length > 1 && ` Also skipped: ${DATA.excluded.slice(1, 6).map((x) => x.name).join(', ')}.`}{' '}
        A correction built on a handful of polls would be noise dressed up as insight.
      </p>

      <h2 id="m-limits">What this cannot tell you</h2>
      <ul>
        <li><b>Past bias is a weak predictor of future bias.</b> The industry leaned Democratic in 2016, 2020 and 2024 and did not in 2018 or 2022. Nothing here knows which kind of year 2026 will be. If the polls lean the other way this time, the correction makes them worse, not better.</li>
        <li><b>Averages hide variation.</b> A pollster’s Senate polls may miss differently from their presidential polls. We pool race types for sample size and show the breakdown on each report card.</li>
        <li><b>The 2026 numbers are thin.</b> Many pollster-race cells rest on a single poll. The scatter band is the honest width of that estimate.</li>
        <li><b>This is not a forecast.</b> There is no fundamentals model, no simulation, no probability of winning. It is arithmetic on public numbers, shown with its working.</li>
        <li><b>Corrections do not compound.</b> If you look at the all-pollster average, we apply the pooled correction once. We never correct a pollster's number and then average it with others.</li>
      </ul>

      <h2 id="m-glossary">Glossary</h2>
      <dl className="glossary">
        <dt>Margin</dt><dd>Democrat (or independent) percentage minus Republican percentage. “D+3” means the Democrat leads by three points.</dd>
        <dt>Miss</dt><dd>Poll margin minus actual margin for one historical poll. Positive means the poll overstated the Democrat.</dd>
        <dt>Bias (or “the miss” on the site)</dt><dd>The weighted, shrunk average of a pollster’s misses. This is what gets subtracted.</dd>
        <dt>State correction</dt><dd>The pollster's miss in one state, blended toward their overall miss with {META.state_k} polls’ weight. The default.</dd>
        <dt>Scatter</dt><dd>Standard deviation of the misses around the bias. Shown as ± on report cards and as the shaded band on each race.</dd>
        <dt>Corrected</dt><dd>Raw margin minus bias.</dd>
        <dt>Stale</dt><dd>A pollster's only poll of a race is older than {META.recent_days} days.</dd>
        <dt>Toss-up / Lean / Likely / Safe</dt><dd>Corrected margin under 3 / 3 to 6 / 6 to 10 / 10 or more points. Labels, not probabilities.</dd>
        <dt>Flip</dt><dd>The corrected leader is not the party that holds the seat today.</dd>
        <dt>Changed</dt><dd>The correction moved the lead from one side to the other.</dd>
      </dl>
      <p className="back"><a href="#/">Back to the Senate map</a></p>
    </article>
  )
}
