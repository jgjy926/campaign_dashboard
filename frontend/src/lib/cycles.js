// Monthly tracker rows ("cycles") + roll-ups.
// A campaign that runs several months gets one row per calendar month.
import { newCycleId } from './schema'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Parse a YYYY-MM-DD string into a UTC Date at midnight (avoids timezone drift).
export function parseDate(s) {
  if (!s) return null
  const [y, m, d] = s.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function ymd(date) {
  return date.toISOString().slice(0, 10)
}

function lastDayOfMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
}

// Default expected payout: end of the month AFTER the cycle period ends.
function defaultPayoutDate(year, monthIndex) {
  const payYear = monthIndex === 11 ? year + 1 : year
  const payMonth = monthIndex === 11 ? 0 : monthIndex + 1
  return ymd(new Date(Date.UTC(payYear, payMonth, lastDayOfMonth(payYear, payMonth))))
}

function emptyCycle(year, monthIndex) {
  return {
    cycle_id: newCycleId(),
    label: `${MONTHS[monthIndex]} ${year}`,
    period_start: ymd(new Date(Date.UTC(year, monthIndex, 1))),
    period_end: ymd(new Date(Date.UTC(year, monthIndex, lastDayOfMonth(year, monthIndex)))),
    spend: 0,
    expected_cashback: 0,
    expected_payout_date: defaultPayoutDate(year, monthIndex),
    is_received: false,
    received_date: null,
    actual_amount_received: 0,
  }
}

// Generate cycle rows for the [start_date, end_date] window, preserving any
// existing rows that match a month (so edits aren't wiped on date changes).
export function generateCycles(startDate, endDate, existing = []) {
  const start = parseDate(startDate)
  const end = parseDate(endDate)
  if (!start || !end || end < start) return existing

  const byKey = new Map(existing.map((c) => [c.period_start.slice(0, 7), c]))
  const rows = []
  let y = start.getUTCFullYear()
  let m = start.getUTCMonth()
  const endY = end.getUTCFullYear()
  const endM = end.getUTCMonth()

  while (y < endY || (y === endY && m <= endM)) {
    const key = `${y}-${String(m + 1).padStart(2, '0')}`
    rows.push(byKey.get(key) || emptyCycle(y, m))
    m += 1
    if (m > 11) {
      m = 0
      y += 1
    }
  }
  return rows
}

// Default expected cashback for a cycle given the campaign's rate/cap.
export function expectedForSpend(spend, earningRate, cashbackCap, capPeriod) {
  const raw = (Number(spend) || 0) * (Number(earningRate) || 0)
  if (capPeriod === 'monthly' && cashbackCap > 0) return Math.min(raw, cashbackCap)
  return raw
}

// Roll-ups across all cycles of a campaign (derived, never stored).
export function rollup(campaign) {
  const cycles = campaign.cycles || []
  const totalSpend = cycles.reduce((s, c) => s + (Number(c.spend) || 0), 0)
  const totalExpected = cycles.reduce((s, c) => s + (Number(c.expected_cashback) || 0), 0)
  const totalReceived = cycles.reduce(
    (s, c) => s + (c.is_received ? Number(c.actual_amount_received) || 0 : 0),
    0,
  )
  const outstanding = cycles
    .filter((c) => !c.is_received)
    .reduce((s, c) => s + (Number(c.expected_cashback) || 0), 0)
  return { totalSpend, totalExpected, totalReceived, outstanding }
}
