// Parse an LLM-produced T&C extraction into registerable campaigns.
//
// The paste is deliberately forgiving: markdown fences, prose around the JSON,
// a bare array, or a single bare campaign object all work. Everything is
// coerced towards the schema in ./schema and every coercion, gap or guess is
// reported as an issue so the preview can show it before anything is saved.
import { CATEGORIES, POOL_RISK_LEVELS, emptyCampaign, newCardId } from './schema'

// v2 adds `reward` (the reward as the T&C phrases it). v1 pastes still parse.
export const IMPORT_SCHEMA = 'cb-campaign-import/v2'

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

const round6 = (n) => Math.round(n * 1e6) / 1e6
const asPct = (r) => `${+(r * 100).toFixed(2)}%`
const money = (n) => `RM${Number(n).toLocaleString('en-MY', { maximumFractionDigits: 2 })}`

function coerceRewardType(value) {
  const s = String(value || '').toLowerCase()
  if (/percent|%/.test(s)) return 'percentage'
  if (/flat|fixed|lump/.test(s)) return 'flat'
  if (/per|every|block/.test(s)) return 'per_spend'
  return null
}

// Turn a v2 `reward` block into a rate. Only a "percentage" states the rate
// outright; "per_spend" and "flat" are worked out here from the T&C's own
// figures, so a slip in the model's arithmetic cannot reach the tracker.
function deriveReward(reward, minSpend) {
  const none = { rate: null, working: null, flatCap: null, flatSpend: null, issues: [] }
  if (!reward || typeof reward !== 'object') return none

  const rate = coerceRate(reward.rate ?? reward.percentage)
  const cash = coerceMoney(reward.cashback_amount ?? reward.cashback ?? reward.amount).value
  const spend = coerceMoney(reward.spend_amount ?? reward.spend).value
  // Cash + spend with no type is read as per_spend: same rate, but no cap is
  // inferred from it.
  const type =
    coerceRewardType(reward.type) ??
    (rate.value !== null ? 'percentage' : cash !== null && spend !== null ? 'per_spend' : null)

  if (type === 'percentage') {
    if (rate.value === null) return none
    return { ...none, rate: rate.value, issues: rate.note ? [issue('warn', 'earning_rate', rate.note)] : [] }
  }

  if (type === 'per_spend') {
    if (!(cash > 0 && spend > 0)) return none
    const value = round6(cash / spend)
    return { ...none, rate: value, working: `${money(cash)} per ${money(spend)} spent = ${asPct(value)}` }
  }

  if (type === 'flat') {
    if (!(cash > 0)) return none
    const base = spend > 0 ? spend : minSpend > 0 ? minSpend : null
    if (!base) {
      return {
        ...none,
        flatCap: cash,
        issues: [issue('warn', 'earning_rate', `Flat ${money(cash)} reward with no qualifying spend stated — no rate to estimate from.`)],
      }
    }
    const value = round6(cash / base)
    return {
      rate: value,
      working: `flat ${money(cash)} on ${money(base)} spend = ${asPct(value)} effective`,
      flatCap: cash,
      flatSpend: spend > 0 ? spend : null,
      issues: [
        issue(
          'warn',
          'earning_rate',
          `Flat ${money(cash)} reward: estimated as ${asPct(value)} of spend up to ${money(cash)}, which matches the T&C once spend reaches ${money(base)}.`,
        ),
      ],
    }
  }

  return none
}

// The rate the tracker multiplies spend by. A rate derived from `reward` wins
// over the model's own earning_rate; a v1 paste has only earning_rate.
// -> { value, working, flatCap, flatSpend, issues }
export function resolveRate(raw, minSpend = null) {
  const stated = coerceRate(raw.earning_rate ?? raw.cashback_rate ?? raw.rate)
  const reward = deriveReward(raw.reward, minSpend)
  const issues = [...reward.issues]
  const extras = { flatCap: reward.flatCap, flatSpend: reward.flatSpend }

  if (reward.rate === null) {
    if (stated.error) issues.push(issue('error', 'earning_rate', stated.error))
    if (stated.note) issues.push(issue('warn', 'earning_rate', stated.note))
    if (stated.value === null && !stated.error && reward.issues.length === 0) {
      issues.push(issue('warn', 'earning_rate', 'No reward figure in the T&C — rate left at 0%, so estimated cashback stays RM0 until you set it.'))
    }
    return { value: stated.value, working: null, ...extras, issues }
  }

  if (stated.value !== null && Math.abs(stated.value - reward.rate) > 0.0005) {
    issues.push(
      issue(
        'warn',
        'earning_rate',
        `The AI wrote earning_rate ${asPct(stated.value)}, but the T&C figures give ${reward.working || asPct(reward.rate)} — using ${asPct(reward.rate)}.`,
      ),
    )
  }
  return { value: reward.rate, working: reward.working, ...extras, issues }
}

// Derived values the draft still holds, as { field: working }. A value the user
// changed in the preview is no longer derived, so its working is dropped.
export function activeDerivations(draft, derived = {}) {
  return Object.fromEntries(
    Object.entries(derived)
      .filter(([field, d]) => Number(draft[field]) === d.value)
      .map(([field, d]) => [field, d.working]),
  )
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

  // Values worked out from other T&C figures rather than read directly:
  // { field: { value, working } }. Shown in the preview, kept in import_meta.
  const derived = {}

  const min = coerceMoney(raw.min_spend_threshold ?? raw.min_spend ?? raw.minimum_spend)
  const rate = resolveRate(raw, min.value)
  issues.push(...rate.issues)
  draft.earning_rate = rate.value ?? 0
  if (rate.working) derived.earning_rate = { value: rate.value, working: rate.working }

  // A flat reward fixes the cap (it is the most the campaign pays) and the
  // spend it needs — unless the T&C states either one outright.
  const cap = coerceMoney(raw.cashback_cap ?? raw.cap)
  if (cap.error) issues.push(issue('error', 'cashback_cap', cap.error))
  if (cap.value === null && !cap.error && rate.flatCap) {
    draft.cashback_cap = rate.flatCap
    derived.cashback_cap = { value: rate.flatCap, working: `the flat ${money(rate.flatCap)} reward is the most it pays` }
  } else {
    if (cap.value === null && !cap.error) {
      issues.push(issue('warn', 'cashback_cap', 'Cap not stated — treated as uncapped (0).'))
    }
    draft.cashback_cap = cap.value ?? 0
  }

  if (min.error) issues.push(issue('error', 'min_spend_threshold', min.error))
  if (min.value === null && !min.error && rate.flatSpend) {
    draft.min_spend_threshold = rate.flatSpend
    derived.min_spend_threshold = {
      value: rate.flatSpend,
      working: `spend needed for the flat ${money(rate.flatCap)} reward`,
    }
  } else {
    if (min.value === null && !min.error) {
      issues.push(issue('warn', 'min_spend_threshold', 'Minimum spend not stated — treated as 0.'))
    }
    draft.min_spend_threshold = min.value ?? 0
  }

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
    derived,
    // The rate counts as found when `reward` produced one, even if the model
    // left earning_rate itself blank.
    missing: NOTABLE.filter((f) =>
      f === 'earning_rate'
        ? rate.value === null
        : (raw[f] === null || raw[f] === undefined || raw[f] === '') && !derived[f],
    ),
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
