// Parse an LLM-produced T&C extraction into registerable campaigns.
//
// The paste is deliberately forgiving: markdown fences, prose around the JSON,
// a bare array, or a single bare campaign object all work. Everything is
// coerced towards the schema in ./schema and every coercion, gap or guess is
// reported as an issue so the preview can show it before anything is saved.
import { CATEGORIES, POOL_RISK_LEVELS, emptyCampaign, newCardId } from './schema'

export const IMPORT_SCHEMA = 'cb-campaign-import/v1'

// Fields the preview should flag when the LLM could not find them.
const NOTABLE = [
  'start_date',
  'end_date',
  'earning_rate',
  'cashback_cap',
  'cap_period',
  'min_spend_threshold',
]

const CATEGORY_SYNONYMS = {
  online: 'Online', ecommerce: 'Online', 'e-commerce': 'Online', web: 'Online', internet: 'Online',
  dining: 'Dining', 'f&b': 'Dining', fnb: 'Dining', restaurant: 'Dining', restaurants: 'Dining',
  food: 'Dining', cafe: 'Dining',
  groceries: 'Groceries', grocery: 'Groceries', supermarket: 'Groceries', supermarkets: 'Groceries',
  petrol: 'Petrol', fuel: 'Petrol', gas: 'Petrol', 'petrol station': 'Petrol',
  travel: 'Travel', airline: 'Travel', airlines: 'Travel', hotel: 'Travel', hotels: 'Travel',
  contactless: 'Contactless', paywave: 'Contactless', tap: 'Contactless', nfc: 'Contactless',
  ewallet: 'Contactless', 'e-wallet': 'Contactless',
  overseas: 'Overseas', foreign: 'Overseas', international: 'Overseas', fcy: 'Overseas',
  utilities: 'Utilities', utility: 'Utilities', bill: 'Utilities', bills: 'Utilities',
  autobilling: 'Utilities', 'auto-billing': 'Utilities',
}

const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
}

// ---------- text to JSON ----------

// Pull the JSON out of whatever the model wrapped it in: fenced code blocks,
// a "Here you go:" preamble, trailing commentary.
export function extractJsonText(text) {
  if (typeof text !== 'string') return ''
  let t = text.trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) t = fence[1].trim()
  const firstObj = t.indexOf('{')
  const firstArr = t.indexOf('[')
  const start =
    firstObj === -1 ? firstArr : firstArr === -1 ? firstObj : Math.min(firstObj, firstArr)
  if (start === -1) return t
  const open = t[start]
  const close = open === '{' ? '}' : ']'
  const end = t.lastIndexOf(close)
  return end > start ? t.slice(start, end + 1) : t.slice(start)
}

// ---------- coercion helpers ----------

const pad = (n) => String(n).padStart(2, '0')

// Accept ISO, DD/MM/YYYY (Malaysian order), and "1 Jan 2026" / "Jan 1, 2026".
export function coerceDate(value) {
  if (value === null || value === undefined || value === '') return { value: '' }
  const s = String(value).trim()

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m) {
    const [, y, mo, d] = m
    if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31) return { value: '', error: `unusable date "${s}"` }
    return { value: `${y}-${pad(mo)}-${pad(d)}` }
  }

  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (m) {
    const [, d, mo, y] = m
    if (+mo > 12) return { value: '', error: `unusable date "${s}"` }
    return { value: `${y}-${pad(mo)}-${pad(d)}`, note: `read "${s}" as DD/MM/YYYY` }
  }

  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,})\.?,?\s+(\d{4})$/)
  if (m && MONTHS[m[2].slice(0, 3).toLowerCase()] !== undefined) {
    return { value: `${m[3]}-${pad(MONTHS[m[2].slice(0, 3).toLowerCase()] + 1)}-${pad(m[1])}` }
  }

  m = s.match(/^([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})$/)
  if (m && MONTHS[m[1].slice(0, 3).toLowerCase()] !== undefined) {
    return { value: `${m[3]}-${pad(MONTHS[m[1].slice(0, 3).toLowerCase()] + 1)}-${pad(m[2])}` }
  }

  return { value: '', error: `unusable date "${s}"` }
}

// The rate may arrive as 0.05, "5%", or a bare 5. Anything above 1 is read as
// a percentage — a cashback rate over 100% does not exist in the wild.
export function coerceRate(value) {
  if (value === null || value === undefined || value === '') return { value: null }
  const s = String(value).trim()
  const num = Number(s.replace(/[%\s]/g, ''))
  if (!Number.isFinite(num) || num < 0) return { value: null, error: `unusable rate "${s}"` }
  if (s.includes('%') || num > 1) {
    return { value: num / 100, note: `read "${s}" as ${num}% = ${num / 100}` }
  }
  return { value: num }
}

// Strip currency noise: "RM 1,000", "1000.00", 1000.
export function coerceMoney(value) {
  if (value === null || value === undefined || value === '') return { value: null }
  const s = String(value).trim()
  const num = Number(s.replace(/[^0-9.-]/g, ''))
  if (!Number.isFinite(num) || num < 0) return { value: null, error: `unusable amount "${s}"` }
  return { value: num }
}

export function coerceCategory(value) {
  if (!value) return { value: null }
  const s = String(value).trim()
  const exact = CATEGORIES.find((c) => c.toLowerCase() === s.toLowerCase())
  if (exact) return { value: exact }
  const key = s.toLowerCase().replace(/\s+/g, ' ')
  if (CATEGORY_SYNONYMS[key]) {
    return { value: CATEGORY_SYNONYMS[key], note: `mapped "${s}" to ${CATEGORY_SYNONYMS[key]}` }
  }
  const partial = Object.keys(CATEGORY_SYNONYMS).find((k) => key.includes(k))
  if (partial) {
    return { value: CATEGORY_SYNONYMS[partial], note: `mapped "${s}" to ${CATEGORY_SYNONYMS[partial]}` }
  }
  return { value: 'Other', note: `unknown category "${s}" mapped to Other` }
}

export function coerceCapPeriod(value) {
  if (!value) return { value: null }
  const s = String(value).toLowerCase()
  if (/month/.test(s)) return { value: 'monthly' }
  if (/campaign|total|entire|whole|overall|programme|program/.test(s)) return { value: 'campaign' }
  return { value: null, note: `unclear cap period "${value}"` }
}

export function coerceBool(value) {
  if (value === null || value === undefined || value === '') return { value: null }
  if (typeof value === 'boolean') return { value }
  const s = String(value).trim().toLowerCase()
  if (['true', 'yes', 'y', '1'].includes(s)) return { value: true }
  if (['false', 'no', 'n', '0'].includes(s)) return { value: false }
  return { value: null, note: `unclear yes/no "${value}"` }
}

function coerceRisk(value) {
  if (!value) return 'Low'
  const s = String(value).trim().toLowerCase()
  return POOL_RISK_LEVELS.find((p) => p.toLowerCase() === s) || 'Low'
}

// ---------- card hint ----------

// The LLM may send { bank, name } or a single "Maybank Ikhwan Visa Gold".
export function readCardHint(raw) {
  const c = raw.card ?? raw.card_name ?? raw.bank_card ?? null
  if (!c) {
    const bank = raw.bank || raw.issuer || ''
    return bank ? { bank: String(bank).trim(), name: '' } : null
  }
  if (typeof c === 'string') {
    const parts = c.trim().split(/\s+/)
    return parts.length > 1
      ? { bank: parts[0], name: parts.slice(1).join(' ') }
      : { bank: c.trim(), name: '' }
  }
  return {
    bank: String(c.bank || c.issuer || raw.bank || '').trim(),
    name: String(c.name || c.card_name || c.product || '').trim(),
  }
}

const squash = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')

// Match a hint against existing cards, ignoring case, spacing and punctuation.
// Bank + name is preferred; a bank-only hint matches only when unambiguous.
export function matchCard(cards = [], hint) {
  if (!hint) return null
  const hb = squash(hint.bank)
  const hn = squash(hint.name)
  if (!hb && !hn) return null

  const full = hb + hn
  const exact = cards.find((c) => squash(c.bank) + squash(c.name) === full)
  if (exact) return exact

  if (hn) {
    const loose = cards.filter((c) => {
      const cb = squash(c.bank)
      const cn = squash(c.name)
      const bankOk = !hb || !cb || cb.includes(hb) || hb.includes(cb)
      const nameOk = cn && (cn.includes(hn) || hn.includes(cn))
      return bankOk && nameOk
    })
    if (loose.length === 1) return loose[0]
  }

  const byBank = cards.filter((c) => {
    const cb = squash(c.bank)
    return cb && hb && (cb === hb || cb.includes(hb) || hb.includes(cb))
  })
  return byBank.length === 1 ? byBank[0] : null
}

// ---------- one campaign ----------

const issue = (level, field, message) => ({ level, field, message })

function normalizeItem(raw, index) {
  const issues = []
  const draft = emptyCampaign('')

  const title = String(raw.title || raw.name || raw.campaign_title || '').trim()
  if (!title) issues.push(issue('error', 'title', 'No campaign title in the JSON.'))
  draft.title = title

  draft.statement_name = String(raw.statement_name || raw.statement_descriptor || '').trim()

  const cat = coerceCategory(raw.category)
  if (cat.note) issues.push(issue('warn', 'category', cat.note))
  if (!raw.category) {
    issues.push(issue('warn', 'category', 'Category not stated — defaulted to Online.'))
  }
  draft.category = cat.value || 'Online'

  for (const [key, label] of [['start_date', 'Start date'], ['end_date', 'End date']]) {
    const got = coerceDate(raw[key])
    if (got.error) issues.push(issue('error', key, `${label}: ${got.error}`))
    else if (!got.value) {
      issues.push(issue('error', key, `${label} is missing — a campaign needs a window to build month rows.`))
    }
    if (got.note) issues.push(issue('warn', key, got.note))
    draft[key] = got.value
  }
  if (draft.start_date && draft.end_date && draft.end_date < draft.start_date) {
    issues.push(issue('error', 'end_date', 'End date is before the start date.'))
  }

  const rate = coerceRate(raw.earning_rate ?? raw.cashback_rate ?? raw.rate)
  if (rate.error) issues.push(issue('error', 'earning_rate', rate.error))
  if (rate.note) issues.push(issue('warn', 'earning_rate', rate.note))
  if (rate.value === null && !rate.error) {
    issues.push(issue('warn', 'earning_rate', 'Rate not stated in the T&C.'))
  }
  draft.earning_rate = rate.value ?? 0

  const cap = coerceMoney(raw.cashback_cap ?? raw.cap)
  if (cap.error) issues.push(issue('error', 'cashback_cap', cap.error))
  if (cap.value === null && !cap.error) {
    issues.push(issue('warn', 'cashback_cap', 'Cap not stated — treated as uncapped (0).'))
  }
  draft.cashback_cap = cap.value ?? 0

  const min = coerceMoney(raw.min_spend_threshold ?? raw.min_spend ?? raw.minimum_spend)
  if (min.error) issues.push(issue('error', 'min_spend_threshold', min.error))
  if (min.value === null && !min.error) {
    issues.push(issue('warn', 'min_spend_threshold', 'Minimum spend not stated — treated as 0.'))
  }
  draft.min_spend_threshold = min.value ?? 0

  const period = coerceCapPeriod(raw.cap_period)
  if (period.note) issues.push(issue('warn', 'cap_period', period.note))
  if (!period.value) issues.push(issue('warn', 'cap_period', 'Cap period not stated — assumed monthly.'))
  draft.cap_period = period.value || 'monthly'

  const fcfs = coerceBool(raw.is_fcfs ?? raw.fcfs ?? raw.first_come_first_served)
  if (fcfs.note) issues.push(issue('warn', 'is_fcfs', fcfs.note))
  draft.is_fcfs = fcfs.value ?? false

  draft.pool_risk_level = coerceRisk(raw.pool_risk_level ?? raw.risk)
  draft.boundary_days = Number(raw.boundary_days) >= 0 ? Number(raw.boundary_days) : 7

  // Payout wording and exclusions both land in the campaign's notes field so
  // they survive registration and reach the Ask context.
  const payoutNote = String(raw.payout_note || raw.payout || '').trim()
  const extraNotes = String(raw.notes || '').trim()
  draft.notes = [payoutNote, extraNotes].filter(Boolean).join(' — ')

  const confidence = String(raw.confidence || '').toLowerCase()
  if (confidence === 'low') {
    issues.push(issue('warn', 'confidence', 'Model rated its own extraction low-confidence — check every number.'))
  }

  return {
    key: `imp_${index}`,
    draft,
    cardHint: readCardHint(raw),
    evidence: raw._source && typeof raw._source === 'object' ? raw._source : {},
    confidence: confidence || 'unrated',
    issues,
    missing: NOTABLE.filter((f) => raw[f] === null || raw[f] === undefined || raw[f] === ''),
  }
}

// ---------- entry point ----------

// text -> { ok, error, items }. Never throws: a bad paste comes back as `error`.
export function parseImport(text) {
  const jsonText = extractJsonText(text)
  if (!jsonText.trim()) {
    return { ok: false, error: 'Nothing to parse — paste the JSON first.', items: [] }
  }

  let data
  try {
    data = JSON.parse(jsonText)
  } catch (e) {
    return { ok: false, error: `Not valid JSON: ${e.message}`, items: [] }
  }

  let list
  if (Array.isArray(data)) list = data
  else if (Array.isArray(data?.campaigns)) list = data.campaigns
  else if (data?.campaign && typeof data.campaign === 'object') list = [data.campaign]
  else if (data && typeof data === 'object') list = [data]
  else list = []

  list = list.filter((x) => x && typeof x === 'object')
  if (list.length === 0) {
    return { ok: false, error: 'No campaign objects found in that JSON.', items: [] }
  }

  return {
    ok: true,
    error: null,
    sourceDocument: String(data?.source_document || '').trim(),
    items: list.map(normalizeItem),
  }
}

// A likely re-import: same card and title, or the same window in the same
// category on the same card. Reported in the preview, never auto-skipped.
export function findDuplicate(campaigns = [], draft, cardId) {
  const t = squash(draft.title)
  return (
    campaigns.find((c) => {
      if (cardId && c.associated_card_id && c.associated_card_id !== cardId) return false
      if (t && squash(c.title) === t) return true
      return (
        !!draft.start_date &&
        c.category === draft.category &&
        c.start_date === draft.start_date &&
        c.end_date === draft.end_date
      )
    }) || null
  )
}

// Errors recomputed from the current draft, so a value fixed in the preview
// clears the block. The parse-time `issues` list keeps the warnings, which are
// about what the model did or did not find and stay true after an edit.
export function draftErrors(draft) {
  const out = []
  if (!String(draft.title || '').trim()) out.push(issue('error', 'title', 'Needs a title.'))
  if (!draft.start_date) out.push(issue('error', 'start_date', 'Needs a start date to build month rows.'))
  if (!draft.end_date) out.push(issue('error', 'end_date', 'Needs an end date to build month rows.'))
  if (draft.start_date && draft.end_date && draft.end_date < draft.start_date) {
    out.push(issue('error', 'end_date', 'End date is before the start date.'))
  }
  return out
}

// Build a card record from a hint the user chose to create.
export function cardFromHint(hint) {
  return {
    card_id: newCardId(),
    bank: hint?.bank || '',
    name: hint?.name || '',
    owner: 'Principal',
    activation_date: '',
    annual_fee_date: '',
  }
}
