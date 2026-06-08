// Pure derived data for the dashboard. No state mutation here.
import { parseDate, rollup } from './cycles'

export const DAY_MS = 86_400_000

// "Today" as a UTC midnight Date so countdowns are stable across timezones.
export function today(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

function cardLabel(cards, id) {
  const c = cards.find((x) => x.card_id === id)
  return c ? `${c.bank} ${c.name}`.trim() : 'Unknown card'
}

// The cycle row covering `date` (defaults to today), or null.
export function currentCycle(campaign, ref = today()) {
  return (
    (campaign.cycles || []).find((c) => {
      const s = parseDate(c.period_start)
      const e = parseDate(c.period_end)
      return s && e && ref >= s && ref <= e
    }) || null
  )
}

// Spend needed to reach the cap for a period: cap / rate (rate > 0).
export function spendForCap(campaign) {
  const rate = Number(campaign.earning_rate) || 0
  const cap = Number(campaign.cashback_cap) || 0
  if (rate <= 0 || cap <= 0) return Infinity
  return cap / rate
}

export function isActive(campaign, ref = today()) {
  const s = parseDate(campaign.start_date)
  const e = parseDate(campaign.end_date)
  return s && e && ref >= s && ref <= e
}

export function isUpcoming(campaign, ref = today()) {
  const s = parseDate(campaign.start_date)
  return s && s > ref
}

// Active campaigns with progress figures for the current month.
export function activeCampaigns(doc, ref = today()) {
  return (doc.campaigns || [])
    .filter((c) => isActive(c, ref))
    .map((c) => {
      const cyc = currentCycle(c, ref)
      const trackedSpend = cyc ? Number(cyc.spend) || 0 : 0
      const threshold = Number(c.min_spend_threshold) || 0
      const capSpend = spendForCap(c)
      const projected = Math.min(trackedSpend * (Number(c.earning_rate) || 0), Number(c.cashback_cap) || Infinity)
      return {
        campaign: c,
        card: cardLabel(doc.cards, c.associated_card_id),
        trackedSpend,
        qualified: trackedSpend >= threshold,
        spendToQualify: Math.max(0, threshold - trackedSpend),
        spendToCap: Number.isFinite(capSpend) ? Math.max(0, capSpend - trackedSpend) : Infinity,
        capReached: trackedSpend >= capSpend,
        projected,
      }
    })
}

// Upcoming campaigns with whole-day countdown.
export function upcomingCampaigns(doc, ref = today()) {
  return (doc.campaigns || [])
    .filter((c) => isUpcoming(c, ref))
    .map((c) => ({
      campaign: c,
      card: cardLabel(doc.cards, c.associated_card_id),
      daysLeft: Math.floor((parseDate(c.start_date) - ref) / DAY_MS),
    }))
    .sort((a, b) => a.daysLeft - b.daysLeft)
}

// "Next Best Card": per category, the active campaign where the next ringgit
// earns most. Drops campaigns that have already hit their cap this period.
export function nextBestByCategory(doc, ref = today()) {
  const groups = {}
  for (const row of activeCampaigns(doc, ref)) {
    if (row.capReached) continue // no further earning this period
    const cat = row.campaign.category || 'Other'
    ;(groups[cat] ||= []).push(row)
  }
  return Object.entries(groups)
    .map(([category, rows]) => ({
      category,
      ranked: rows.sort((a, b) => b.campaign.earning_rate - a.campaign.earning_rate),
    }))
    .sort((a, b) => a.category.localeCompare(b.category))
}

// Reconciliation ledger: every unpaid cycle, flagged overdue if past payout date.
export function reconciliationLedger(doc, ref = today()) {
  const rows = []
  for (const c of doc.campaigns || []) {
    for (const cyc of c.cycles || []) {
      if (cyc.is_received) continue
      const payout = parseDate(cyc.expected_payout_date)
      rows.push({
        campaign: c,
        card: cardLabel(doc.cards, c.associated_card_id),
        cycle: cyc,
        overdue: payout ? ref > payout : false,
      })
    }
  }
  return rows.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1
    return (a.cycle.expected_payout_date || '').localeCompare(b.cycle.expected_payout_date || '')
  })
}

// Cycles starting within `lookahead` days from `ref` (inclusive of today).
export function upcomingCycleStarts(doc, lookahead = 5, ref = today()) {
  const cutoff = new Date(ref.getTime() + lookahead * DAY_MS)
  const rows = []
  for (const c of doc.campaigns || []) {
    for (const cyc of c.cycles || []) {
      const start = parseDate(cyc.period_start)
      if (!start) continue
      if (start >= ref && start <= cutoff) {
        rows.push({
          campaign: c,
          card: cardLabel(doc.cards, c.associated_card_id),
          cycle: cyc,
          daysUntilStart: Math.floor((start - ref) / DAY_MS),
        })
      }
    }
  }
  return rows.sort((a, b) => a.daysUntilStart - b.daysUntilStart)
}

// Portfolio totals for the header summary.
export function portfolioTotals(doc) {
  return (doc.campaigns || []).reduce(
    (acc, c) => {
      const r = rollup(c)
      acc.totalExpected += r.totalExpected
      acc.totalReceived += r.totalReceived
      acc.outstanding += r.outstanding
      return acc
    },
    { totalExpected: 0, totalReceived: 0, outstanding: 0 },
  )
}
