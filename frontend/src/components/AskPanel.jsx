// NotebookLM-style Q&A. Builds a compact, grounded context (campaign facts +
// extracted T&C text) and sends it to the Worker's /api/ask endpoint, which
// runs the LLM with tool access. Numbers come from the deterministic engine.
import { useState } from 'react'
import { useStore } from '../store/useStore'
import { askQuestion, cloudEnabled } from '../lib/api'
import { activeCampaigns, currentCycle } from '../lib/selectors'

// Compact, model-friendly snapshot of state used to ground answers.
function buildContext(doc) {
  const active = new Set(activeCampaigns(doc).map((r) => r.campaign.campaign_id))
  return {
    today: new Date().toISOString().slice(0, 10),
    cards: doc.cards.map((c) => ({ id: c.card_id, name: `${c.bank} ${c.name}`, owner: c.owner })),
    campaigns: doc.campaigns.map((c) => {
      const cyc = currentCycle(c)
      return {
        id: c.campaign_id,
        title: c.title,
        card_id: c.associated_card_id,
        category: c.category,
        active: active.has(c.campaign_id),
        start: c.start_date,
        end: c.end_date,
        min_spend: c.min_spend_threshold,
        rate: c.earning_rate,
        cap: c.cashback_cap,
        cap_period: c.cap_period,
        current_month_spend: cyc ? cyc.spend : 0,
        cycles: (c.cycles || []).map((cy) => ({
          month: cy.label,
          spend: cy.spend,
          expected: cy.expected_cashback,
          received: cy.is_received,
          received_on: cy.received_date,
        })),
        tnc_text: (c.attachments || [])
          .filter((a) => a.type === 'tnc' && a.tc_text)
          .map((a) => `(p${a.page}) ${a.tc_text}`)
          .join('\n')
          .slice(0, 4000),
      }
    }),
  }
}

export default function AskPanel() {
  const doc = useStore((s) => s.doc)
  const [q, setQ] = useState('')
  const [log, setLog] = useState([])
  const [busy, setBusy] = useState(false)

  async function send() {
    const question = q.trim()
    if (!question) return
    setLog((l) => [...l, { role: 'user', text: question }])
    setQ('')
    setBusy(true)
    try {
      const { answer, citations } = await askQuestion(question, buildContext(doc))
      setLog((l) => [...l, { role: 'ai', text: answer, citations }])
    } catch (e) {
      setLog((l) => [...l, { role: 'ai', text: `Couldn't reach the AI endpoint: ${e.message}` }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex h-full flex-col rounded-lg bg-white p-4 shadow-sm">
      <h2 className="mb-2 text-sm font-semibold text-slate-700">Ask about your campaigns</h2>
      {!cloudEnabled() && (
        <p className="mb-2 rounded bg-amber-50 p-2 text-xs text-amber-700">
          AI answers need the Worker configured (VITE_WORKER_URL + VITE_APP_API_KEY).
        </p>
      )}
      <div className="mb-2 flex-1 space-y-2 overflow-y-auto text-xs">
        {log.length === 0 && (
          <p className="text-slate-400">
            Try: “Which promos am I about to miss?”, “Where should I spend my next RM200?”,
            “What does the Maybank online T&amp;C require?”
          </p>
        )}
        {log.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'text-right' : ''}>
            <div className={`inline-block max-w-[90%] rounded px-2 py-1 ${m.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
              {m.text}
              {m.citations?.length > 0 && (
                <div className="mt-1 text-[10px] opacity-70">Sources: {m.citations.join(', ')}</div>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Ask a question…"
          className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs"
        />
        <button onClick={send} disabled={busy} className="rounded bg-indigo-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50">
          {busy ? '…' : 'Ask'}
        </button>
      </div>
    </section>
  )
}
