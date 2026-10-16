import { describe, it, expect } from 'vitest'
import {
  parseImport,
  extractJsonText,
  coerceDate,
  coerceRate,
  coerceMoney,
  coerceCategory,
  coerceCapPeriod,
  matchCard,
  findDuplicate,
  draftErrors,
  cardFromHint,
  resolveRate,
  activeDerivations,
} from './importCampaigns'

const CARD = { card_id: 'card_1', bank: 'Maybank', name: 'Ikhwan Visa Gold' }

const one = (overrides = {}) => ({
  title: '5% Online Cashback',
  card: { bank: 'Maybank', name: 'Ikhwan Visa Gold' },
  category: 'Online',
  start_date: '2026-01-01',
  end_date: '2026-03-31',
  min_spend_threshold: 1000,
  earning_rate: 0.05,
  cashback_cap: 50,
  cap_period: 'monthly',
  ...overrides,
})

describe('extractJsonText', () => {
  it('unwraps a fenced code block with commentary around it', () => {
    const text = 'Sure, here you go:\n```json\n{"a":1}\n```\nLet me know!'
    expect(extractJsonText(text)).toBe('{"a":1}')
  })

  it('trims prose from an unfenced object', () => {
    expect(extractJsonText('Here: {"a":1} — hope that helps')).toBe('{"a":1}')
  })
})

describe('coercion', () => {
  it('accepts ISO, DD/MM/YYYY and written dates', () => {
    expect(coerceDate('2026-1-5').value).toBe('2026-01-05')
    expect(coerceDate('05/01/2026').value).toBe('2026-01-05')
    expect(coerceDate('5 Jan 2026').value).toBe('2026-01-05')
    expect(coerceDate('Jan 5, 2026').value).toBe('2026-01-05')
    expect(coerceDate('sometime in Q1').error).toBeTruthy()
    expect(coerceDate(null).value).toBe('')
  })

  it('reads a rate as a decimal fraction however it arrives', () => {
    expect(coerceRate(0.05).value).toBe(0.05)
    expect(coerceRate('5%').value).toBe(0.05)
    expect(coerceRate(5).value).toBe(0.05) // bare percent, not a 500% rate
    expect(coerceRate('0.5%').value).toBe(0.005)
    expect(coerceRate(null).value).toBeNull()
  })

  it('strips currency noise from amounts', () => {
    expect(coerceMoney('RM 1,000.50').value).toBe(1000.5)
    expect(coerceMoney(null).value).toBeNull()
  })

  it('maps category synonyms and falls back to Other', () => {
    expect(coerceCategory('e-commerce').value).toBe('Online')
    expect(coerceCategory('F&B').value).toBe('Dining')
    expect(coerceCategory('supermarket spend').value).toBe('Groceries')
    expect(coerceCategory('mattress purchases').value).toBe('Other')
  })

  it('leaves an ambiguous cap period unset rather than guessing', () => {
    expect(coerceCapPeriod('per calendar month').value).toBe('monthly')
    expect(coerceCapPeriod('for the entire campaign').value).toBe('campaign')
    expect(coerceCapPeriod('as determined by the Bank').value).toBeNull()
  })
})

describe('parseImport', () => {
  it('accepts the documented envelope', () => {
    const r = parseImport(JSON.stringify({ source_document: 'MBB T&C', campaigns: [one()] }))
    expect(r.ok).toBe(true)
    expect(r.sourceDocument).toBe('MBB T&C')
    expect(r.items).toHaveLength(1)
    const { draft } = r.items[0]
    expect(draft.title).toBe('5% Online Cashback')
    expect(draft.earning_rate).toBe(0.05)
    expect(draft.cashback_cap).toBe(50)
    expect(draft.start_date).toBe('2026-01-01')
    expect(draft.status).toBe('active')
  })

  it('accepts a bare array and a bare single object too', () => {
    expect(parseImport(JSON.stringify([one(), one({ title: 'Second' })])).items).toHaveLength(2)
    expect(parseImport(JSON.stringify(one())).items).toHaveLength(1)
  })

  it('reports bad JSON instead of throwing', () => {
    const r = parseImport('{"title": }')
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/not valid json/i)
    expect(r.items).toEqual([])
  })

  it('warns — and does not invent — when fields are null', () => {
    const r = parseImport(
      JSON.stringify({ campaigns: [one({ cashback_cap: null, cap_period: null, min_spend_threshold: null })] }),
    )
    const item = r.items[0]
    expect(item.missing).toEqual(
      expect.arrayContaining(['cashback_cap', 'cap_period', 'min_spend_threshold']),
    )
    expect(item.issues.filter((i) => i.level === 'warn').length).toBeGreaterThanOrEqual(3)
    expect(item.issues.some((i) => i.level === 'error')).toBe(false) // nulls never block
    expect(item.draft.cashback_cap).toBe(0)
    expect(item.draft.cap_period).toBe('monthly')
  })

  it('blocks on a missing or reversed date window', () => {
    const missing = parseImport(JSON.stringify(one({ end_date: null }))).items[0]
    expect(missing.issues.some((i) => i.level === 'error' && i.field === 'end_date')).toBe(true)

    const reversed = parseImport(JSON.stringify(one({ end_date: '2025-12-01' }))).items[0]
    expect(reversed.issues.some((i) => i.level === 'error')).toBe(true)
  })

  it('keeps the evidence quotes and confidence', () => {
    const r = parseImport(
      JSON.stringify(one({ confidence: 'high', _source: { earning_rate: 'You will earn 5% cashback.' } })),
    )
    expect(r.items[0].confidence).toBe('high')
    expect(r.items[0].evidence.earning_rate).toBe('You will earn 5% cashback.')
  })

  it('folds payout wording and exclusions into the campaign notes', () => {
    const r = parseImport(JSON.stringify(one({ payout_note: 'Credited within 60 days.', notes: 'Excludes petrol.' })))
    expect(r.items[0].draft.notes).toBe('Credited within 60 days. — Excludes petrol.')
  })
})

describe('earning rate from the reward', () => {
  const v2 = (reward, overrides = {}) =>
    one({ earning_rate: null, cashback_cap: null, min_spend_threshold: null, reward, ...overrides })

  it('takes a percentage reward even when earning_rate was left null', () => {
    const item = parseImport(JSON.stringify(v2({ type: 'percentage', rate: 0.05 }))).items[0]
    expect(item.draft.earning_rate).toBe(0.05)
    expect(item.missing).not.toContain('earning_rate')
    expect(item.derived.earning_rate).toBeUndefined() // stated, not worked out
  })

  it('works out a per-spend reward', () => {
    const item = parseImport(
      JSON.stringify(v2({ type: 'per_spend', cashback_amount: 1, spend_amount: 20 })),
    ).items[0]
    expect(item.draft.earning_rate).toBe(0.05)
    expect(item.derived.earning_rate.working).toMatch(/RM1 per RM20 spent = 5%/)
    expect(item.draft.cashback_cap).toBe(0) // per-spend says nothing about a cap
  })

  it('turns a flat reward into an effective rate, cap and min spend', () => {
    const item = parseImport(
      JSON.stringify(v2({ type: 'flat', cashback_amount: 30, spend_amount: 500 })),
    ).items[0]
    expect(item.draft.earning_rate).toBe(0.06)
    expect(item.draft.cashback_cap).toBe(30)
    expect(item.draft.min_spend_threshold).toBe(500)
    expect(item.missing).not.toEqual(expect.arrayContaining(['cashback_cap', 'min_spend_threshold']))
    expect(item.issues.some((i) => i.field === 'earning_rate' && /Flat RM30/.test(i.message))).toBe(true)
  })

  it('never overrides a cap or min spend the T&C states', () => {
    const item = parseImport(
      JSON.stringify(
        v2({ type: 'flat', cashback_amount: 30, spend_amount: 500 }, { cashback_cap: 90, min_spend_threshold: 300 }),
      ),
    ).items[0]
    expect(item.draft.cashback_cap).toBe(90)
    expect(item.draft.min_spend_threshold).toBe(300)
    expect(item.draft.earning_rate).toBe(0.06) // rate still from the reward's own spend figure
  })

  it('falls back to the stated min spend for a flat reward with no spend figure', () => {
    const r = resolveRate({ reward: { type: 'flat', cashback_amount: 50 } }, 1000)
    expect(r.value).toBe(0.05)
    expect(r.flatSpend).toBeNull() // min spend came from the T&C, nothing to fill
  })

  it('leaves the rate unset when a flat reward has no spend to relate it to', () => {
    const r = resolveRate({ reward: { type: 'flat', cashback_amount: 50 } }, null)
    expect(r.value).toBeNull()
    expect(r.issues).toHaveLength(1) // one explanation, not a second "no figure" warning
  })

  it('prefers the arithmetic over a model slip, and says so', () => {
    const r = resolveRate({ earning_rate: 0.5, reward: { type: 'per_spend', cashback_amount: 1, spend_amount: 20 } })
    expect(r.value).toBe(0.05)
    expect(r.issues.some((i) => /using 5%/.test(i.message))).toBe(true)
  })

  it('still reads a v1 paste that only has earning_rate', () => {
    const r = resolveRate({ earning_rate: '8%' })
    expect(r.value).toBe(0.08)
    expect(r.working).toBeNull()
  })

  it('drops the working once the preview edit changes the value', () => {
    const derived = { earning_rate: { value: 0.05, working: 'RM1 per RM20 spent = 5%' } }
    expect(activeDerivations({ earning_rate: 0.05 }, derived)).toEqual({ earning_rate: 'RM1 per RM20 spent = 5%' })
    expect(activeDerivations({ earning_rate: 0.08 }, derived)).toEqual({})
  })
})

describe('matchCard', () => {
  it('matches bank + name regardless of case and punctuation', () => {
    expect(matchCard([CARD], { bank: 'maybank', name: 'ikhwan visa-gold' })).toBe(CARD)
  })

  it('matches on an unambiguous bank alone', () => {
    expect(matchCard([CARD], { bank: 'Maybank', name: '' })).toBe(CARD)
  })

  it('refuses to guess when a bank has two cards', () => {
    const cards = [CARD, { card_id: 'card_2', bank: 'Maybank', name: 'Shoppers Platinum' }]
    expect(matchCard(cards, { bank: 'Maybank', name: '' })).toBeNull()
  })

  it('returns null for an unknown bank', () => {
    expect(matchCard([CARD], { bank: 'CIMB', name: 'Cash Rebate' })).toBeNull()
  })

  it('reads a single-string card hint', () => {
    const r = parseImport(JSON.stringify(one({ card: 'Maybank Ikhwan Visa Gold' })))
    expect(matchCard([CARD], r.items[0].cardHint)).toBe(CARD)
  })
})

describe('findDuplicate', () => {
  const existing = {
    campaign_id: 'camp_1',
    associated_card_id: 'card_1',
    title: '5% Online Cashback',
    category: 'Online',
    start_date: '2026-01-01',
    end_date: '2026-03-31',
  }

  it('flags the same title on the same card', () => {
    const draft = { title: '5% online cashback', category: 'Dining', start_date: '', end_date: '' }
    expect(findDuplicate([existing], draft, 'card_1')).toBe(existing)
  })

  it('flags the same window and category even under a different title', () => {
    const draft = { title: 'Online promo', category: 'Online', start_date: '2026-01-01', end_date: '2026-03-31' }
    expect(findDuplicate([existing], draft, 'card_1')).toBe(existing)
  })

  it('does not flag the same campaign on a different card', () => {
    const draft = { title: '5% Online Cashback', category: 'Online', start_date: '2026-01-01', end_date: '2026-03-31' }
    expect(findDuplicate([existing], draft, 'card_2')).toBeNull()
  })
})

describe('cardFromHint', () => {
  it('builds a card record the store can accept for an unmatched hint', () => {
    const r = parseImport(JSON.stringify(one({ card: { bank: 'CIMB', name: 'Cash Rebate Platinum' } })))
    const card = cardFromHint(r.items[0].cardHint)
    expect(card.card_id).toMatch(/^card_/)
    expect(card.bank).toBe('CIMB')
    expect(card.name).toBe('Cash Rebate Platinum')
    expect(card.owner).toBe('Principal')
  })
})

describe('draftErrors', () => {
  it('clears once the preview edit fills the gap', () => {
    const broken = { title: '', start_date: '', end_date: '2026-03-31' }
    expect(draftErrors(broken)).toHaveLength(2)
    expect(draftErrors({ ...broken, title: 'Fixed', start_date: '2026-01-01' })).toHaveLength(0)
  })
})
