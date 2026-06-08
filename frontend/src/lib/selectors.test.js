import { describe, it, expect } from 'vitest'
import {
  activeCampaigns,
  upcomingCampaigns,
  nextBestByCategory,
  reconciliationLedger,
  spendForCap,
} from './selectors'

const REF = new Date(Date.UTC(2026, 4, 15)) // 2026-05-15

function campaign(over = {}) {
  return {
    campaign_id: over.campaign_id || 'c1',
    associated_card_id: 'card1',
    title: over.title || 'Promo',
    category: over.category || 'Online',
    start_date: over.start_date || '2026-04-01',
    end_date: over.end_date || '2026-07-31',
    min_spend_threshold: over.min_spend_threshold ?? 1000,
    earning_rate: over.earning_rate ?? 0.1,
    cashback_cap: over.cashback_cap ?? 100,
    cap_period: 'monthly',
    cycles: over.cycles || [
      { cycle_id: 'cy1', label: 'May 2026', period_start: '2026-05-01', period_end: '2026-05-31', spend: over.spend ?? 0, expected_cashback: 0, is_received: false, expected_payout_date: '2026-06-30' },
    ],
    attachments: [],
    ...over,
  }
}

const docOf = (...campaigns) => ({ cards: [{ card_id: 'card1', bank: 'MBB', name: 'VS' }], campaigns })

describe('spendForCap', () => {
  it('is cap / rate', () => expect(spendForCap(campaign())).toBe(1000))
  it('is Infinity with no cap', () => expect(spendForCap(campaign({ cashback_cap: 0 }))).toBe(Infinity))
})

describe('activeCampaigns', () => {
  it('includes in-window campaigns and computes progress', () => {
    const rows = activeCampaigns(docOf(campaign({ spend: 400 })), REF)
    expect(rows).toHaveLength(1)
    expect(rows[0].trackedSpend).toBe(400)
    expect(rows[0].spendToQualify).toBe(600)
    expect(rows[0].spendToCap).toBe(600) // 1000 cap-spend - 400
    expect(rows[0].capReached).toBe(false)
  })
  it('excludes out-of-window campaigns', () => {
    expect(activeCampaigns(docOf(campaign({ start_date: '2026-08-01', end_date: '2026-09-30' })), REF)).toHaveLength(0)
  })
})

describe('upcomingCampaigns', () => {
  it('counts whole days until start', () => {
    const rows = upcomingCampaigns(docOf(campaign({ start_date: '2026-05-25', end_date: '2026-06-30' })), REF)
    expect(rows[0].daysLeft).toBe(10)
  })
})

describe('nextBestByCategory', () => {
  it('drops capped campaigns and ranks by rate desc', () => {
    const a = campaign({ campaign_id: 'a', earning_rate: 0.05, spend: 0 })
    const b = campaign({ campaign_id: 'b', earning_rate: 0.1, spend: 0 })
    const maxed = campaign({ campaign_id: 'm', earning_rate: 0.2, spend: 1000 }) // hit cap-spend
    const groups = nextBestByCategory(docOf(a, b, maxed), REF)
    const online = groups.find((g) => g.category === 'Online')
    expect(online.ranked.map((r) => r.campaign.campaign_id)).toEqual(['b', 'a'])
  })
})

describe('reconciliationLedger', () => {
  it('flags overdue unpaid cycles', () => {
    const overdue = campaign({
      campaign_id: 'od',
      cycles: [{ cycle_id: 'x', label: 'Mar 2026', period_start: '2026-03-01', period_end: '2026-03-31', spend: 100, expected_cashback: 10, is_received: false, expected_payout_date: '2026-04-30' }],
    })
    const rows = reconciliationLedger(docOf(overdue), REF)
    expect(rows[0].overdue).toBe(true)
  })
  it('omits received cycles', () => {
    const paid = campaign({ cycles: [{ cycle_id: 'p', label: 'May 2026', period_start: '2026-05-01', period_end: '2026-05-31', is_received: true, expected_payout_date: '2026-06-30' }] })
    expect(reconciliationLedger(docOf(paid), REF)).toHaveLength(0)
  })
})
