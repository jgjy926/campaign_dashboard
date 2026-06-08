// Shape of campaigns.json and small id/default helpers.
// The whole app state lives in a single document (see plan).

export const SCHEMA_VERSION = '1.1.0'

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
    category: 'Online',
    start_date: '',
    end_date: '',
    min_spend_threshold: 0,
    earning_rate: 0.05,
    cashback_cap: 0,
    cap_period: 'monthly', // 'monthly' | 'campaign'
    is_fcfs: false,
    pool_risk_level: 'Low',
    attachments: [],
    cycles: [],
  }
}
