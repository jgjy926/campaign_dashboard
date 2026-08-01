import { describe, it, expect } from 'vitest'
import { generateCycles, expectedForSpend, rollup } from './cycles'

describe('generateCycles', () => {
  it('creates one row per month across a 4-month window', () => {
    const rows = generateCycles('2026-04-01', '2026-07-31')
    expect(rows).toHaveLength(4)
    expect(rows.map((r) => r.label)).toEqual(['Apr 2026', 'May 2026', 'Jun 2026', 'Jul 2026'])
  })

  it('spans a year boundary', () => {
    const rows = generateCycles('2026-11-01', '2027-01-31')
    expect(rows.map((r) => r.label)).toEqual(['Nov 2026', 'Dec 2026', 'Jan 2027'])
  })

  it('preserves existing edited rows by month', () => {
    const first = generateCycles('2026-04-01', '2026-05-31')
    first[0].spend = 450
    const again = generateCycles('2026-04-01', '2026-06-30', first)
    expect(again).toHaveLength(3)
    expect(again[0].spend).toBe(450) // April preserved
  })

  it('returns existing when dates are invalid', () => {
    expect(generateCycles('', '', [{ x: 1 }])).toEqual([{ x: 1 }])
  })
})

describe('expectedForSpend', () => {
  it('caps monthly cashback', () => {
    expect(expectedForSpend(2000, 0.1, 100, 'monthly')).toBe(100)
    expect(expectedForSpend(500, 0.1, 100, 'monthly')).toBe(50)
  })
  it('ignores cap for campaign-period accrual', () => {
    expect(expectedForSpend(2000, 0.1, 100, 'campaign')).toBe(200)
  })
})

describe('rollup', () => {
  it('sums spend, expected, received and outstanding', () => {
    const c = {
      cycles: [
        { spend: 100, expected_cashback: 10, is_received: true, actual_amount_received: 9 },
        { spend: 200, expected_cashback: 20, is_received: false, actual_amount_received: 0 },
      ],
    }
    expect(rollup(c)).toEqual({ totalSpend: 300, totalExpected: 30, totalReceived: 9, outstanding: 20 })
  })

  it('caps totalExpected at a whole-campaign cap', () => {
    const c = {
      cap_period: 'campaign',
      cashback_cap: 25,
      cycles: [
        { spend: 100, expected_cashback: 20, is_received: false },
        { spend: 100, expected_cashback: 20, is_received: false },
      ],
    }
    const r = rollup(c)
    expect(r.totalExpected).toBe(25) // 40 raw, clamped to the 25 cap
    expect(r.outstanding).toBe(25)
  })

  it('reduces campaign-cap outstanding by what was already received', () => {
    const c = {
      cap_period: 'campaign',
      cashback_cap: 25,
      cycles: [
        { spend: 100, expected_cashback: 20, is_received: true, actual_amount_received: 20 },
        { spend: 100, expected_cashback: 20, is_received: false },
      ],
    }
    const r = rollup(c)
    expect(r.totalReceived).toBe(20)
    expect(r.outstanding).toBe(5) // only 5 of the 25 cap remains
  })

  it('does not cap totals for a monthly cap', () => {
    const c = {
      cap_period: 'monthly',
      cashback_cap: 25,
      cycles: [
        { spend: 100, expected_cashback: 20, is_received: false },
        { spend: 100, expected_cashback: 20, is_received: false },
      ],
    }
    // Monthly caps are applied per cycle upstream, so rollup just sums.
    expect(rollup(c).totalExpected).toBe(40)
  })
})
