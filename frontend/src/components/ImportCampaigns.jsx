// Paste the JSON an LLM produced from a campaign's T&C, review what it found,
// then register everything in one click. Nothing touches the document until
// "Register" — the preview is where hallucinated numbers get caught.
import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore'
import { rm, pct } from '../lib/format'
import { newCampaignId } from '../lib/schema'
import { generateCycles } from '../lib/cycles'
import {
  parseImport,
  matchCard,
  findDuplicate,
  draftErrors,
  cardFromHint,
  activeDerivations,
} from '../lib/importCampaigns'
import { TNC_EXTRACTION_PROMPT } from '../lib/importPrompt'
import CampaignForm from './CampaignForm'

const CREATE = '__create__'
const UNLINKED = '__unlinked__'

const cardLabel = (c) => `${c.bank} ${c.name}`.trim() || '(unnamed card)'
const hintLabel = (h) => (h ? `${h.bank} ${h.name}`.trim() : '')

export default function ImportCampaigns({ onDone }) {
  const doc = useStore((s) => s.doc)
  const upsertCard = useStore((s) => s.upsertCard)
  const upsertCampaign = useStore((s) => s.upsertCampaign)

  const [text, setText] = useState('')
  const [copied, setCopied] = useState(false)
  const [edits, setEdits] = useState({}) // key -> campaign draft edited in the form
  const [cardPick, setCardPick] = useState({}) // key -> card_id | CREATE | UNLINKED
  const [skipped, setSkipped] = useState({}) // key -> true when unticked
  const [editingKey, setEditingKey] = useState(null)
  const [done, setDone] = useState(null)

  const parsed = useMemo(() => (text.trim() ? parseImport(text) : null), [text])

  // Each parsed item, merged with any inline edit and resolved against cards.
  const items = useMemo(() => {
    if (!parsed?.ok) return []
    return parsed.items.map((item) => {
      const draft = edits[item.key] || item.draft
      const auto = matchCard(doc.cards, item.cardHint)
      const choice = cardPick[item.key] ?? (auto ? auto.card_id : '')
      const cardId = choice === CREATE || choice === UNLINKED ? '' : choice
      const errors = draftErrors(draft)
      return {
        ...item,
        draft,
        auto,
        choice,
        errors,
        // Warnings describe what the model found, so they survive an edit;
        // errors are recomputed above and clear as soon as the draft is fixed.
        warnings: item.issues.filter((i) => i.level === 'warn'),
        duplicate: findDuplicate(doc.campaigns, draft, cardId),
        blocked: errors.length > 0 || !choice,
      }
    })
  }, [parsed, edits, cardPick, doc.cards, doc.campaigns])

  const included = items.filter((i) => !skipped[i.key] && !i.blocked)

  function register() {
    const created = []
    included.forEach((item) => {
      let cardId = item.choice
      if (cardId === CREATE) {
        const card = cardFromHint(item.cardHint)
        upsertCard(card)
        cardId = card.card_id
      } else if (cardId === UNLINKED) {
        cardId = ''
      }
      upsertCampaign({
        ...item.draft,
        campaign_id: newCampaignId(), // fresh id, so re-registering never overwrites
        associated_card_id: cardId,
        cycles: [],
        import_meta: {
          imported_at: new Date().toISOString(),
          source_document: parsed.sourceDocument || '',
          confidence: item.confidence,
          evidence: item.evidence,
          derived: activeDerivations(item.draft, item.derived),
        },
      })
      created.push(item.draft.title || '(untitled)')
    })
    replaceText('')
    setDone(created)
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(TNC_EXTRACTION_PROMPT)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  // Item keys are positional, so a new paste must drop the per-item state that
  // was pointing at the old list.
  function replaceText(next) {
    setText(next)
    setDone(null)
    setEdits({})
    setCardPick({})
    setSkipped({})
    setEditingKey(null)
  }

  function readFile(file) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => replaceText(String(reader.result || ''))
    reader.readAsText(file)
  }

  return (
    <section className="space-y-3 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Import from T&amp;C JSON</h3>
          <p className="text-xs text-slate-500">
            Run the prompt on the T&amp;C in any AI, paste the JSON it returns, check the preview, register.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={copyPrompt}
            className="rounded border border-indigo-300 bg-white px-2 py-1 text-xs font-medium text-indigo-700"
          >
            {copied ? 'Prompt copied ✓' : '1. Copy prompt'}
          </button>
          <button onClick={onDone} className="rounded border border-slate-300 bg-white px-2 py-1 text-xs">
            Close
          </button>
        </div>
      </div>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          readFile(e.dataTransfer.files?.[0])
        }}
      >
        <textarea
          rows={text ? 4 : 6}
          value={text}
          onChange={(e) => replaceText(e.target.value)}
          placeholder='2. Paste the JSON here — e.g. {"campaigns":[{"title":"5% Online", …}]}  (or drop a .json file)'
          className="w-full rounded border border-slate-300 bg-white px-2 py-2 font-mono text-[11px] text-slate-700"
        />
      </div>

      {done && (
        <p className="rounded border border-green-200 bg-green-50 px-2 py-1.5 text-xs text-green-800">
          Registered {done.length} campaign{done.length === 1 ? '' : 's'}: {done.join(', ')}. Monthly
          rows were generated from each date window.
        </p>
      )}

      {parsed && !parsed.ok && (
        <p className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">{parsed.error}</p>
      )}

      {items.length > 0 && (
        <>
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              Found {items.length} campaign{items.length === 1 ? '' : 's'}
              {parsed.sourceDocument && <> in <span className="italic">{parsed.sourceDocument}</span></>}
            </span>
            <span>{included.length} ready to register</span>
          </div>

          <div className="space-y-2">
            {items.map((item) => (
              <Preview
                key={item.key}
                item={item}
                cards={doc.cards}
                editing={editingKey === item.key}
                skipped={!!skipped[item.key]}
                onToggle={() => setSkipped((s) => ({ ...s, [item.key]: !s[item.key] }))}
                onPickCard={(v) => setCardPick((s) => ({ ...s, [item.key]: v }))}
                onEdit={() => setEditingKey(editingKey === item.key ? null : item.key)}
                onSaveEdit={(campaign) => {
                  setEdits((s) => ({ ...s, [item.key]: campaign }))
                  setEditingKey(null)
                }}
              />
            ))}
          </div>

          <button
            onClick={register}
            disabled={included.length === 0}
            className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white disabled:bg-slate-300"
          >
            3. Register {included.length} campaign{included.length === 1 ? '' : 's'}
          </button>
        </>
      )}
    </section>
  )
}

// One parsed campaign: what will be created, what the model could not find,
// and the T&C sentence behind each number.
function Preview({ item, cards, editing, skipped, onToggle, onPickCard, onEdit, onSaveEdit }) {
  const [showEvidence, setShowEvidence] = useState(false)
  const c = item.draft
  const errors = item.errors
  const warns = item.warnings
  const months = generateCycles(c.start_date, c.end_date, [], c.boundary_days ?? 0).length
  const hint = hintLabel(item.cardHint)
  const evidenceKeys = Object.keys(item.evidence || {})
  const working = activeDerivations(c, item.derived)

  if (editing) {
    return (
      <div className="rounded border border-indigo-300 bg-white p-2">
        <p className="mb-2 text-[11px] font-medium text-slate-500">
          Editing the imported values — this changes the preview only.
        </p>
        <CampaignForm initial={c} onSave={onSaveEdit} onDone={onEdit} submitLabel="Apply" />
      </div>
    )
  }

  return (
    <div className={`rounded border bg-white p-2 text-xs ${skipped ? 'border-slate-200 opacity-50' : 'border-slate-300'}`}>
      <div className="flex items-start justify-between gap-2">
        <label className="flex min-w-0 items-start gap-2">
          <input
            type="checkbox"
            checked={!skipped && !item.blocked}
            onChange={onToggle}
            disabled={item.blocked}
            className="mt-0.5"
          />
          <span className="min-w-0">
            <span className="font-medium text-slate-800">{c.title || '(no title)'}</span>
            <ConfidenceTag level={item.confidence} />
            <span className="ml-2 text-slate-400">
              {c.category} · {c.start_date || '??'} → {c.end_date || '??'}
              {months > 0 && ` · ${months} month row${months === 1 ? '' : 's'}`}
            </span>
          </span>
        </label>
        <button onClick={onEdit} className="shrink-0 text-indigo-600">edit</button>
      </div>

      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-4">
        <Field
          label="Rate"
          value={pct(c.earning_rate)}
          dim={item.missing.includes('earning_rate')}
          note={working.earning_rate}
        />
        <Field
          label="Min spend"
          value={rm(c.min_spend_threshold)}
          dim={item.missing.includes('min_spend_threshold')}
          note={working.min_spend_threshold}
        />
        <Field
          label="Cap"
          value={c.cashback_cap > 0 ? `${rm(c.cashback_cap)} / ${c.cap_period}` : 'uncapped'}
          dim={item.missing.includes('cashback_cap')}
          note={working.cashback_cap}
        />
        <Field label="FCFS" value={c.is_fcfs ? `yes · ${c.pool_risk_level} risk` : 'no'} />
      </dl>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-slate-500">Card:</span>
        <select
          value={item.choice}
          onChange={(e) => onPickCard(e.target.value)}
          className={`rounded border px-1.5 py-0.5 ${item.choice ? 'border-slate-300' : 'border-amber-400 bg-amber-50'}`}
        >
          <option value="">— pick a card —</option>
          {cards.map((cd) => (
            <option key={cd.card_id} value={cd.card_id}>{cardLabel(cd)}</option>
          ))}
          {hint && <option value={CREATE}>+ Create "{hint}"</option>}
          <option value={UNLINKED}>Leave unlinked</option>
        </select>
        {item.auto && item.choice === item.auto.card_id && (
          <span className="text-green-700">matched "{hint}"</span>
        )}
        {!item.choice && hint && <span className="text-amber-700">T&amp;C says "{hint}" — no match in your cards</span>}
      </div>

      {item.duplicate && (
        <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-amber-800">
          Looks like a duplicate of "{item.duplicate.title}" already in your list. Registering adds a
          second copy.
        </p>
      )}

      {errors.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-red-700">
          {errors.map((e, i) => <li key={i}>• {e.message}</li>)}
        </ul>
      )}
      {warns.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-amber-700">
          {warns.map((w, i) => <li key={i}>• {w.message}</li>)}
        </ul>
      )}
      {item.blocked && !errors.length && !item.choice && (
        <p className="mt-1 text-amber-700">• Pick a card before registering this one.</p>
      )}

      {c.notes && <p className="mt-2 text-slate-500">{c.notes}</p>}

      {evidenceKeys.length > 0 && (
        <div className="mt-2">
          <button onClick={() => setShowEvidence(!showEvidence)} className="text-slate-500 underline">
            {showEvidence ? 'Hide' : 'Show'} T&amp;C evidence ({evidenceKeys.length})
          </button>
          {showEvidence && (
            <ul className="mt-1 space-y-1 border-l-2 border-slate-200 pl-2 text-slate-500">
              {evidenceKeys.map((k) => (
                <li key={k}>
                  <span className="font-medium text-slate-600">{k}:</span> “{String(item.evidence[k])}”
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

// `note` is the working for a value derived from other T&C figures.
function Field({ label, value, dim, note }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className={dim ? 'text-amber-700' : 'text-slate-700'}>
        {value}{dim && <span className="text-[10px]"> (not stated)</span>}
        {note && <span className="block text-[10px] text-indigo-600" title="Worked out from the T&C figures">= {note}</span>}
      </dd>
    </div>
  )
}

function ConfidenceTag({ level }) {
  if (level === 'unrated') return null
  const tone =
    level === 'high' ? 'bg-green-100 text-green-700'
      : level === 'medium' ? 'bg-amber-100 text-amber-700'
        : 'bg-red-100 text-red-700'
  return <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${tone}`}>{level}</span>
}
