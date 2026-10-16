// Shape of campaigns.json and small id/default helpers.
// The whole app state lives in a single document (see plan).

export const SCHEMA_VERSION = '1.3.0'

export const CATEGORIES = [
  'Online',
  'Dining',
  'Groceries',
  'Petrol',
  'Travel',
  'Contactless',
  'Overseas',
  'Utilities',
  'Other',
]

export const POOL_RISK_LEVELS = ['Low', 'Medium', 'High']

// Lifecycle status. 'active' campaigns show on the dashboard; 'archived' ones
// are kept for records but hidden from the live views.
export const CAMPAIGN_STATUSES = ['active', 'archived']

// Suggested reasons when archiving (a completed run vs one that never paid out).
export const ARCHIVE_REASONS = ['completed', 'unfulfilled']

const rid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)).replace(/-/g, '')

export const newCardId = () => `card_${rid()}`
export const newCampaignId = () => `camp_${rid()}`
export const newCycleId = () => `cyc_${rid()}`
export const newAttachmentId = () => `att_${rid()}`

export function defaultDocument() {
  return {
    version: SCHEMA_VERSION,
    last_updated: new Date().toISOString(),
    cards: [],
    campaigns: [],
  }
}

export function emptyCard() {
  return {
    card_id: newCardId(),
    bank: '',
    name: '',
    owner: 'Principal',
    activation_date: '',
    annual_fee_date: '',
  }
}

export function emptyCampaign(cardId = '') {
  return {
    campaign_id: newCampaignId(),
    associated_card_id: cardId,
    title: '',
    // Descriptor the bank prints on the statement/SMS for this cashback, so it
    // can be matched back to the campaign during reconciliation. Free text.
    statement_name: '',
    category: 'Online',
    start_date: '',
    end_date: '',
    min_spend_threshold: 0,
    earning_rate: 0.05,
    cashback_cap: 0,
    cap_period: 'monthly', // 'monthly' | 'campaign'
    is_fcfs: false,
    pool_risk_level: 'Low',
    boundary_days: 7,
    status: 'active', // 'active' | 'archived'
    archived_reason: '', // '' | 'completed' | 'unfulfilled' | free text
    archived_at: null, // ISO timestamp when archived
    // Free text: exclusions, registration steps, when the bank says it pays.
    notes: '',
    // Provenance when the campaign came from a pasted LLM extraction:
    // { imported_at, source_document, confidence, evidence: { field: quote },
    //   derived: { field: working } } — derived lists values computed from other
    //   T&C figures (e.g. a rate from "RM1 per RM20"); absent on older imports.
    // Null for hand-entered campaigns.
    import_meta: null,
    attachments: [],
    cycles: [],
  }
}

// Bring any stored document up to the current shape: fill defaults for fields
// added in later schema versions and strip transient UI flags that should never
// have been persisted. Runs on every load (local + remote) so the rest of the
// app can assume fields exist. Pure: returns a new object, never mutates input.
export function normalizeDoc(doc) {
  const base = defaultDocument()
  if (!doc || typeof doc !== 'object') return base

  const cards = Array.isArray(doc.cards) ? doc.cards.map(normalizeCard) : []
  const campaigns = Array.isArray(doc.campaigns) ? doc.campaigns.map(normalizeCampaign) : []

  return {
    ...base,
    ...doc,
    version: SCHEMA_VERSION,
    last_updated: doc.last_updated || base.last_updated,
    cards,
    campaigns,
  }
}

function normalizeCard(card) {
  return { ...emptyCard(), ...card }
}

function normalizeCampaign(campaign) {
  const defaults = emptyCampaign()
  const merged = { ...defaults, ...campaign }
  // Preserve the campaign's own id/card rather than the freshly generated ones.
  merged.campaign_id = campaign.campaign_id || defaults.campaign_id
  merged.status = CAMPAIGN_STATUSES.includes(campaign.status) ? campaign.status : 'active'
  merged.import_meta =
    campaign.import_meta && typeof campaign.import_meta === 'object' ? campaign.import_meta : null
  merged.cycles = Array.isArray(campaign.cycles) ? campaign.cycles.map(normalizeCycle) : []
  merged.attachments = Array.isArray(campaign.attachments) ? campaign.attachments : []
  return merged
}

function normalizeCycle(cycle) {
  // Drop the transient `_expectedTouched` flag; it is UI-only state that older
  // builds accidentally persisted into the document.
  const { _expectedTouched, ...rest } = cycle
  return { notes: '', ...rest }
}
