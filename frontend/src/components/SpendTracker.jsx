// Per-campaign monthly tracker: spend per month + when cashback landed.
// A table on md+ screens; one card per month on phones, where 11 columns can't fit.
import { useState } from 'react'
import { useStore } from '../store/useStore'
import { rollup, expectedForSpend, emptyCycle } from '../lib/cycles'
import { rm } from '../lib/format'

const today = () => new Date().toISOString().slice(0, 10)
const input = 'rounded border border-slate-300 px-2 py-1'

export default function SpendTracker({ campaign }) {
  const updateCycle = useStore((s) => s.updateCycle)
  const deleteCycle = useStore((s) => s.deleteCycle)
  const addCycle = useStore((s) => s.addCycle)
  const markAllCyclesReceived = useStore((s) => s.markAllCyclesReceived)

  const [newMonth, setNewMonth] = useState('')
  const [bulkDate, setBulkDate] = useState(today)
  // Cycle ids whose expected cashback the user has hand-edited this session; we
  // then stop auto-recomputing it from spend. UI-only — never persisted.
  const [touched, setTouched] = useState(() => new Set())

  const r = rollup(campaign)
  const cycles = campaign.cycles || []
  const hasUnreceived = cycles.some((cy) => !cy.is_received)

  const patch = (cy, fields) => updateCycle(campaign.campaign_id, cy.cycle_id, fields)

  function setSpend(cycle, value) {
    const spend = Number(value) || 0
    const expected = touched.has(cycle.cycle_id)
      ? cycle.expected_cashback
      : expectedForSpend(spend, campaign.earning_rate, campaign.cashback_cap, campaign.cap_period)
    patch(cycle, { spend, expected_cashback: expected })
  }

  function setExpected(cycle, value) {
    setTouched((prev) => new Set(prev).add(cycle.cycle_id))
    patch(cycle, { expected_cashback: Number(value) || 0 })
  }

  function setReceived(cycle, checked) {
    patch(cycle, {
      is_received: checked,
      received_date: checked ? cycle.received_date || today() : null,
      actual_amount_received: checked ? cycle.actual_amount_received || cycle.expected_cashback : 0,
    })
  }

  function handleAddCycle() {
    if (!newMonth) return
    const [year, month] = newMonth.split('-').map(Number)
    addCycle(campaign.campaign_id, emptyCycle(year, month - 1))
    setNewMonth('')
  }

  const removeBtn = (cy) => (
    <button
      title="Remove this cycle"
      aria-label={`Remove ${cy.label}`}
      onClick={() => deleteCycle(campaign.campaign_id, cy.cycle_id)}
      className="rounded px-1.5 py-0.5 text-slate-300 hover:bg-red-50 hover:text-red-500"
    >
      ×
    </button>
  )

  return (
    <div>
      {/* ── Table (tablet / desktop) ── */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <th className="py-1 pr-2">Month</th>
              <th className="py-1 pr-2">Start</th>
              <th className="py-1 pr-2">End</th>
              <th className="py-1 pr-2">Spend</th>
              <th className="py-1 pr-2">Expected cashback</th>
              <th className="py-1 pr-2">Payout by</th>
              <th className="py-1 pr-2">Received?</th>
              <th className="py-1 pr-2">Date received</th>
              <th className="py-1 pr-2">Actual amount</th>
              <th className="py-1 pr-2">Notes</th>
              <th className="py-1" />
            </tr>
          </thead>

          <tbody>
            {cycles.map((cy) => (
              <tr key={cy.cycle_id} className="border-b border-slate-100">
                <td className="whitespace-nowrap py-1 pr-2 font-medium text-slate-700">{cy.label}</td>
                <td className="py-1 pr-2">
                  <input type="date" value={cy.period_start || ''} onChange={(e) => patch(cy, { period_start: e.target.value })} className={`${input} text-xs`} />
                </td>
                <td className="py-1 pr-2">
                  <input type="date" value={cy.period_end || ''} onChange={(e) => patch(cy, { period_end: e.target.value })} className={`${input} text-xs`} />
                </td>
                <td className="py-1 pr-2">
                  <input type="number" step="0.01" value={cy.spend} onChange={(e) => setSpend(cy, e.target.value)} className={`${input} w-24`} />
                </td>
                <td className="py-1 pr-2">
                  <input type="number" step="0.01" value={cy.expected_cashback} onChange={(e) => setExpected(cy, e.target.value)} className={`${input} w-24`} />
                </td>
                <td className="py-1 pr-2">
                  <input type="date" value={cy.expected_payout_date || ''} onChange={(e) => patch(cy, { expected_payout_date: e.target.value })} className={`${input} text-xs`} />
                </td>
                <td className="py-1 pr-2">
                  <input type="checkbox" checked={cy.is_received} onChange={(e) => setReceived(cy, e.target.checked)} className="h-4 w-4" />
                </td>
                <td className="py-1 pr-2">
                  <input type="date" value={cy.received_date || ''} disabled={!cy.is_received} onChange={(e) => patch(cy, { received_date: e.target.value })} className={`${input} disabled:bg-slate-100`} />
                </td>
                <td className="py-1 pr-2">
                  <input type="number" step="0.01" value={cy.actual_amount_received} disabled={!cy.is_received} onChange={(e) => patch(cy, { actual_amount_received: Number(e.target.value) || 0 })} className={`${input} w-24 disabled:bg-slate-100`} />
                </td>
                <td className="py-1 pr-2">
                  <input type="text" placeholder="notes…" value={cy.notes || ''} onChange={(e) => patch(cy, { notes: e.target.value })} className={`${input} w-36`} />
                </td>
                <td className="py-1">{removeBtn(cy)}</td>
              </tr>
            ))}
          </tbody>

          <tfoot className="text-slate-600">
            <tr className="border-t border-slate-200 font-medium">
              <td className="py-1 pr-2">Totals</td>
              <td className="py-1 pr-2" />
              <td className="py-1 pr-2" />
              <td className="py-1 pr-2">{rm(r.totalSpend)}</td>
              <td className="py-1 pr-2">{rm(r.totalExpected)}</td>
              <td className="py-1 pr-2" />
              <td className="py-1 pr-2" />
              <td className="py-1 pr-2 text-right">Received:</td>
              <td className="py-1 pr-2">{rm(r.totalReceived)}</td>
              <td className="py-1 pr-2" />
              <td className="py-1" />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* ── Cards (phone) ── */}
      <div className="space-y-2 md:hidden">
        {cycles.map((cy) => (
          <div
            key={cy.cycle_id}
            className={`rounded-lg border p-2.5 text-xs ${cy.is_received ? 'border-green-200 bg-green-50/40' : 'border-slate-200'}`}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-slate-700">{cy.label}</span>
              <span className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 rounded-full bg-white px-2 py-1 text-slate-600 ring-1 ring-slate-200">
                  <input type="checkbox" checked={cy.is_received} onChange={(e) => setReceived(cy, e.target.checked)} className="h-4 w-4" />
                  Received
                </label>
                {removeBtn(cy)}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Spend">
                <input type="number" inputMode="decimal" step="0.01" value={cy.spend} onChange={(e) => setSpend(cy, e.target.value)} className={`${input} w-full`} />
              </Field>
              <Field label="Expected cashback">
                <input type="number" inputMode="decimal" step="0.01" value={cy.expected_cashback} onChange={(e) => setExpected(cy, e.target.value)} className={`${input} w-full`} />
              </Field>
              <Field label="Start">
                <input type="date" value={cy.period_start || ''} onChange={(e) => patch(cy, { period_start: e.target.value })} className={`${input} w-full`} />
              </Field>
              <Field label="End">
                <input type="date" value={cy.period_end || ''} onChange={(e) => patch(cy, { period_end: e.target.value })} className={`${input} w-full`} />
              </Field>
              <Field label="Payout by">
                <input type="date" value={cy.expected_payout_date || ''} onChange={(e) => patch(cy, { expected_payout_date: e.target.value })} className={`${input} w-full`} />
              </Field>
              {cy.is_received && (
                <Field label="Date received">
                  <input type="date" value={cy.received_date || ''} onChange={(e) => patch(cy, { received_date: e.target.value })} className={`${input} w-full`} />
                </Field>
              )}
              {cy.is_received && (
                <Field label="Actual amount">
                  <input type="number" inputMode="decimal" step="0.01" value={cy.actual_amount_received} onChange={(e) => patch(cy, { actual_amount_received: Number(e.target.value) || 0 })} className={`${input} w-full`} />
                </Field>
              )}
              <Field label="Notes">
                <input type="text" placeholder="notes…" value={cy.notes || ''} onChange={(e) => patch(cy, { notes: e.target.value })} className={`${input} w-full`} />
              </Field>
            </div>
          </div>
        ))}
        {cycles.length > 0 && (
          <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 rounded-lg bg-slate-50 px-2.5 py-2 text-xs font-medium text-slate-600">
            <span>Spend {rm(r.totalSpend)}</span>
            <span>Expected {rm(r.totalExpected)}</span>
            <span>Received {rm(r.totalReceived)}</span>
          </div>
        )}
      </div>

      {cycles.length === 0 && (
        <p className="py-2 text-xs text-slate-400">Set start &amp; end dates to generate monthly rows.</p>
      )}

      {/* ── Controls ── */}
      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3">
        <div className="flex items-center gap-1.5">
          <input
            type="month"
            value={newMonth}
            onChange={(e) => setNewMonth(e.target.value)}
            className={`${input} text-xs`}
          />
          <button
            onClick={handleAddCycle}
            disabled={!newMonth}
            className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-40"
          >
            + Add month
          </button>
        </div>

        {hasUnreceived && (
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={bulkDate}
              onChange={(e) => setBulkDate(e.target.value)}
              className={`${input} text-xs`}
            />
            <button
              onClick={() => markAllCyclesReceived(campaign.campaign_id, bulkDate)}
              className="rounded bg-green-600 px-2 py-1 text-xs font-medium text-white hover:bg-green-700"
            >
              Mark all received
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label className="block min-w-0 text-slate-500">
      <span className="mb-0.5 block text-[11px]">{label}</span>
      {children}
    </label>
  )
}
