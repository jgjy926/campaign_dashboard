// Add / edit / delete credit cards.
import { useState } from 'react'
import { useStore } from '../store/useStore'
import { emptyCard } from '../lib/schema'

export default function CardManager() {
  const { cards } = useStore((s) => s.doc)
  const upsertCard = useStore((s) => s.upsertCard)
  const deleteCard = useStore((s) => s.deleteCard)
  const [draft, setDraft] = useState(null)

  const field = (k) => ({
    value: draft?.[k] ?? '',
    onChange: (e) => setDraft({ ...draft, [k]: e.target.value }),
  })

  return (
    <section className="rounded-lg bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">Cards</h2>
        <button
          onClick={() => setDraft(emptyCard())}
          className="rounded bg-slate-800 px-2 py-1 text-xs font-medium text-white"
        >
          + Card
        </button>
      </div>

      <ul className="space-y-1 text-xs">
        {cards.map((c) => (
          <li key={c.card_id} className="flex items-center justify-between rounded border border-slate-100 px-2 py-1">
            <span>
              <span className="font-medium text-slate-700">{c.bank} {c.name}</span>
              <span className="ml-2 text-slate-400">{c.owner}</span>
            </span>
            <span className="flex gap-2">
              <button onClick={() => setDraft(c)} className="text-indigo-600">edit</button>
              <button onClick={() => deleteCard(c.card_id)} className="text-red-500">delete</button>
            </span>
          </li>
        ))}
        {cards.length === 0 && <li className="text-slate-400">No cards yet.</li>}
      </ul>

      {draft && (
        <div className="mt-3 space-y-2 rounded border border-slate-200 p-3 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <input placeholder="Bank" className="rounded border border-slate-300 px-2 py-1" {...field('bank')} />
            <input placeholder="Card name" className="rounded border border-slate-300 px-2 py-1" {...field('name')} />
            <select className="rounded border border-slate-300 px-2 py-1" {...field('owner')}>
              <option>Principal</option>
              <option>Supplementary</option>
            </select>
            <div />
            <label className="text-slate-500">Activation
              <input type="date" className="mt-0.5 block w-full rounded border border-slate-300 px-2 py-1" {...field('activation_date')} />
            </label>
            <label className="text-slate-500">Annual fee date
              <input type="date" className="mt-0.5 block w-full rounded border border-slate-300 px-2 py-1" {...field('annual_fee_date')} />
            </label>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { upsertCard(draft); setDraft(null) }}
              className="rounded bg-indigo-600 px-3 py-1 font-medium text-white"
            >
              Save
            </button>
            <button onClick={() => setDraft(null)} className="rounded border border-slate-300 px-3 py-1">Cancel</button>
          </div>
        </div>
      )}
    </section>
  )
}
