import data from './data/data.json'

export const DATA = data
export const META = data.meta

export const MODES = [
  { id: 'recency', label: 'Recency-Weighted', hint: `Each cycle counts ${META.decay}× the one after it` },
  { id: 'flat', label: 'Flat Average', hint: `Every poll since ${META.first_cycle} counts equally` },
  { id: 'latest', label: '2024 Only', hint: 'Only the most recent cycle' },
]

export const pollsterById = Object.fromEntries(data.pollsters.map((p) => [p.id, p]))
export const POOLED = pollsterById.ALL
export const FEATURED = data.pollsters.filter((p) => p.featured)
export const OTHERS = data.pollsters.filter((p) => !p.featured && p.id !== 'ALL')

export const round1 = (x) => Math.round(x * 10) / 10

export function statFor(p, mode) {
  return p.stats[mode] || p.stats.recency
}

export const SCOPES = [
  { id: 'state', label: 'By State', hint: `That pollster's record in this state, blended toward their overall number (${META.state_k} polls' weight)` },
  { id: 'overall', label: 'Pollster-Wide', hint: 'One correction for every race' },
]

/**
 * The correction for one pollster in one state.
 * State record is pulled toward the pollster's overall bias with STATE_K polls' worth of prior weight,
 * so a state with no polls returns the overall number and a state with many polls is mostly its own.
 */
export function biasFor(p, abbr, mode, scope) {
  const overall = statFor(p, mode)
  const base = { overall: overall.bias, sigma: overall.sigma, bias: overall.bias, state: abbr, n: 0, n_eff: 0, raw: null, share: 0, scope }
  if (scope !== 'state') return base
  const rec = (p.stats.by_state || {})[abbr]
  const r = rec && (rec[mode] || rec.recency)
  if (!r) return base
  const k = META.state_k
  const blended = (r.sum_wb + k * overall.bias) / (r.n_eff + k)
  return { ...base, bias: round1(blended * 10) / 10, n: r.n, n_eff: r.n_eff, raw: r.raw_bias, share: r.n_eff / (r.n_eff + k), cycles: r.cycles }
}

/** Which caucus a positive/negative margin favours. Independents (Osborn, Bodnar, Bengs) count with D as "D+I". */
export function sideOf(race, margin) {
  if (margin === 0 || margin == null) return null
  const c = margin > 0 ? race.cand1 : race.cand2
  if (!c) return null
  return c.party === 'REP' ? 'R' : 'D'
}

export function callFor(margin) {
  const a = Math.abs(margin)
  if (a < 3) return 'Toss-up'
  if (a < 6) return 'Lean'
  if (a < 10) return 'Likely'
  return 'Safe'
}

const RATING_SCORE = {
  'safe d': 3, 'solid d': 3, 'likely d': 2, 'lean d': 1, 'tilt d': 0.5,
  'tossup': 0, 'toss-up': 0, 'toss up': 0,
  'tilt r': -0.5, 'lean r': -1, 'likely r': -2, 'safe r': -3, 'solid r': -3,
}
const SCORE_MARGIN = { 0: 0, 1: 4, 2: 8, 3: 15 }
const SKIP_COLS = new Set(['PVI', 'Senator', 'Last election'])

/** Average the race-rating outlets (Cook, Sabato, etc.) into one label and a stand-in margin. */
export function ratingConsensus(race) {
  const vals = []
  for (const [k, v] of Object.entries(race.ratings || {})) {
    if (SKIP_COLS.has(k)) continue
    const s = v.toLowerCase().replace(/\(.*?\)/g, '').trim()
    if (s in RATING_SCORE) vals.push(RATING_SCORE[s])
  }
  if (!vals.length) return null
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length
  const score = Math.round(avg)
  const abs = Math.abs(score)
  const label = abs === 0 ? 'Toss-up' : `${['', 'Lean', 'Likely', 'Safe'][abs]} ${score > 0 ? 'D' : 'R'}`
  return { score, label, margin: SCORE_MARGIN[abs] * Math.sign(score), n: vals.length }
}

/**
 * The number this page is about. For one race and one pollster:
 *   raw        what the pollster's recent polls say (cand1 − cand2, points)
 *   bias       how much that pollster has historically overstated cand1's side
 *   corrected  raw − bias
 * Falls back to the all-pollster average (corrected by the pooled bias) and then to race ratings.
 */
export function estimate(race, pollster, mode, scope = 'state') {
  const b = biasFor(pollster, race.abbr, mode, scope)
  const pb = biasFor(POOLED, race.abbr, mode, scope)
  let out
  let est = race.by_pollster[pollster.id]
  if (pollster.id === 'ALL' && race.consensus) {
    est = { margin: race.consensus.margin, n_polls: race.consensus.n_pollsters, latest: null, stale: false }
  }
  if (est) {
    out = { source: 'pollster', raw: est.margin, bias: b.bias, biasInfo: b, corrected: round1(est.margin - b.bias), sigma: b.sigma, est }
  } else if (race.consensus) {
    out = { source: 'consensus', raw: race.consensus.margin, bias: pb.bias, biasInfo: pb, corrected: round1(race.consensus.margin - pb.bias),
      sigma: pb.sigma, est: { margin: race.consensus.margin, n_polls: race.consensus.n_pollsters, stale: false } }
  } else {
    const rc = ratingConsensus(race)
    const m = rc ? rc.margin : 0
    out = { source: 'rating', raw: m, bias: 0, corrected: m, sigma: null, rating: rc }
  }
  out.rawSide = sideOf(race, out.raw) || race.held
  out.side = sideOf(race, out.corrected) || race.held
  out.call = callFor(out.corrected)
  out.rawCall = callFor(out.raw)
  out.flip = out.side !== race.held
  out.changed = out.rawSide !== out.side
  return out
}

export function allEstimates(pollster, mode, scope = 'state') {
  return data.races.map((race) => ({ race, e: estimate(race, pollster, mode, scope) }))
}

export function tally(rows) {
  const base = META.seats_not_up
  const t = { raw: { D: base.D, R: base.R, toss: 0 }, corrected: { D: base.D, R: base.R, toss: 0 }, polled: 0, flips: 0, changed: 0 }
  for (const { e } of rows) {
    t.raw[e.rawSide] += 1
    t.corrected[e.side] += 1
    if (e.rawCall === 'Toss-up') t.raw.toss += 1
    if (e.call === 'Toss-up') t.corrected.toss += 1
    if (e.source === 'pollster') t.polled += 1
    if (e.flip) t.flips += 1
    if (e.changed) t.changed += 1
  }
  return t
}

export function fmtMargin(m, race) {
  if (m == null) return '—'
  if (Math.abs(m) < 0.05) return 'Even'
  const side = sideOf(race, m)
  const who = side === 'R' ? 'R' : race.cand1 && race.cand1.party === 'IND' ? 'I' : 'D'
  return `${who}+${Math.abs(m).toFixed(1)}`
}

export function fmtBias(b) {
  if (Math.abs(b) < 0.05) return '±0.0'
  return `${b > 0 ? 'D' : 'R'}+${Math.abs(b).toFixed(1)}`
}

export function shortName(p) {
  const map = {
    'Emerson College': 'Emerson',
    'The New York Times/Siena College': 'NYT / Siena',
    'Beacon Research/Shaw & Co. Research': 'Fox News (Beacon/Shaw)',
    'University of New Hampshire Survey Center': 'UNH Survey Center',
    'Marist College': 'Marist',
    'Suffolk University': 'Suffolk',
    'Targoz Market Research': 'Targoz',
    'All pollsters (pooled)': 'All pollsters',
  }
  return map[p.name] || p.name
}

const SHORT_DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
const LONG_DATE = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
const INT = new Intl.NumberFormat('en-US')

export function fmtDate(iso) {
  if (!iso) return ''
  return SHORT_DATE.format(new Date(iso + 'T00:00:00'))
}

export function fmtLongDate(iso) {
  if (!iso) return ''
  return LONG_DATE.format(new Date(iso + 'T00:00:00'))
}

export const fmtInt = (n) => INT.format(n)

/** URL-safe id for a race, used for deep links and aria-controls. */
export const raceSlug = (race) => race.key.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
