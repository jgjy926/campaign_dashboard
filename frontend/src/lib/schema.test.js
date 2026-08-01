import { describe, it, expect } from 'vitest'
import { normalizeDoc, SCHEMA_VERSION } from './schema'

describe('normalizeDoc', () => {
  it('returns a valid default document for empty/invalid input', () => {
    const doc = normalizeDoc(null)
    expect(doc.version).toBe(SCHEMA_VERSION)
    expect(doc.cards).toEqual([])
    expect(doc.campaigns).toEqual([])
  })

  it('backfills fields added in later schema versions', () => {
    const doc = normalizeDoc({
      campaigns: [{ campaign_id: 'c1', title: 'Old promo' }],
    })
    const c = doc.campaigns[0]
    expect(c.campaign_id).toBe('c1') // id preserved, not regenerated
    expect(c.statement_name).toBe('')
    expect(c.status).toBe('active')
    expect(c.archived_reason).toBe('')
    expect(c.archived_at).toBeNull()
    expect(c.cap_period).toBe('monthly')
    expect(Array.isArray(c.cycles)).toBe(true)
  })

  it('keeps an existing archived status and reason', () => {
    const doc = normalizeDoc({
      campaigns: [{ campaign_id: 'c1', status: 'archived', archived_reason: 'completed' }],
    })
    expect(doc.campaigns[0].status).toBe('archived')
    expect(doc.campaigns[0].archived_reason).toBe('completed')
  })

  it('coerces an unknown status back to active', () => {
    const doc = normalizeDoc({ campaigns: [{ campaign_id: 'c1', status: 'weird' }] })
    expect(doc.campaigns[0].status).toBe('active')
  })

  it('strips the transient _expectedTouched flag off cycles', () => {
    const doc = normalizeDoc({
      campaigns: [
        { campaign_id: 'c1', cycles: [{ cycle_id: 'y1', spend: 100, _expectedTouched: true }] },
      ],
    })
    const cy = doc.campaigns[0].cycles[0]
    expect(cy).not.toHaveProperty('_expectedTouched')
    expect(cy.spend).toBe(100)
    expect(cy.notes).toBe('')
  })
})
