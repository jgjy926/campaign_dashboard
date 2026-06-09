// Per-campaign monthly tracker table: spend per month + when cashback landed.
import { useStore } from '../store/useStore'
import { rollup, expectedForSpend } from '../lib/cycles'
import { rm } from '../lib/format'

export default function SpendTracker({ campaign }) {
  const updateCycle = useStore((s) => s.updateCycle)
  const deleteCycle = useStore((s) => s.deleteCycle)
  const r = rollup(campaign)

  function setSpend(cycle, value) {
    const spend = Number(value) || 0
    // Re-derive expected cashback unless the user has manually overridden it.
    const expected = cycle._expectedTouched
      ? cycle.expected_cashback
      : expectedForSpend(spend, campaign.earning_rate, campaign.cashback_cap, campaign.cap_period)
    updateCycle(campaign.campaign_id, cycle.cycle_id, { spend, expected_cashback: expected })
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="border-b border-slate-200 text-slate-500">
          <tr>
            <th className="py-1 pr-2">Month</th>
            <th className="py-1 pr-2">Start</th>
            <th className="py-1 pr-2">End</th>
            <th className="py-1 pr-2">Spend</th>
            <th className="py-1 pr-2">Expected cashback</th>
            <th className="py-1 pr-2">Received?</th>
            <th className="py-1 pr-2">Date received</th>
            <th className="py-1 pr-2">Actual amount</th>
            <th className="py-1" />
          </tr>
        </thead>
        <tbody>
          {(campaign.cycles || []).map((cy) => (
            <tr key={cy.cycle_id} className="border-b border-slate-100">
              <td className="py-1 pr-2 font-medium text-slate-700">{cy.label}</td>
              <td className="py-1 pr-2">
                <input
                  type="date"
                  value={cy.period_start || ''}
                  onChange={(e) =>
                    updateCycle(campaign.campaign_id, cy.cycle_id, { period_start: e.target.value })
                  }
                  className="rounded border border-slate-300 px-2 py-1 text-xs"
                />
              </td>
              <td className="py-1 pr-2">
                <input
                  type="date"
                  value={cy.period_end || ''}
                  onChange={(e) =>
                    updateCycle(campaign.campaign_id, cy.cycle_id, { period_end: e.target.value })
                  }
                  className="rounded border border-slate-300 px-2 py-1 text-xs"
                />
              </td>
              <td className="py-1 pr-2">
                <input
                  type="number"
                  step="0.01"
                  value={cy.spend}
                  onChange={(e) => setSpend(cy, e.target.value)}
                  className="w-24 rounded border border-slate-300 px-2 py-1"
                />
              </td>
              <td className="py-1 pr-2">
                <input
                  type="number"
                  step="0.01"
                  value={cy.expected_cashback}
                  onChange={(e) =>
                    updateCycle(campaign.campaign_id, cy.cycle_id, {
                      expected_cashback: Number(e.target.value) || 0,
                      _expectedTouched: true,
                    })
                  }
                  className="w-24 rounded border border-slate-300 px-2 py-1"
                />
              </td>
              <td className="py-1 pr-2">
                <input
                  type="checkbox"
                  checked={cy.is_received}
                  onChange={(e) =>
                    updateCycle(campaign.campaign_id, cy.cycle_id, {
                      is_received: e.target.checked,
                      received_date: e.target.checked ? cy.received_date || new Date().toISOString().slice(0, 10) : null,
                      actual_amount_received: e.target.checked
                        ? cy.actual_amount_received || cy.expected_cashback
                        : 0,
                    })
                  }
                  className="h-4 w-4"
                />
              </td>
              <td className="py-1 pr-2">
                <input
                  type="date"
                  value={cy.received_date || ''}
                  disabled={!cy.is_received}
                  onChange={(e) =>
                    updateCycle(campaign.campaign_id, cy.cycle_id, { received_date: e.target.value })
                  }
                  className="rounded border border-slate-300 px-2 py-1 disabled:bg-slate-100"
                />
              </td>
              <td className="py-1 pr-2">
                <input
                  type="number"
                  step="0.01"
                  value={cy.actual_amount_received}
                  disabled={!cy.is_received}
                  onChange={(e) =>
                    updateCycle(campaign.campaign_id, cy.cycle_id, {
                      actual_amount_received: Number(e.target.value) || 0,
                    })
                  }
                  className="w-24 rounded border border-slate-300 px-2 py-1 disabled:bg-slate-100"
                />
              </td>
              <td className="py-1">
                <button
                  title="Remove this cycle"
                  onClick={() => deleteCycle(campaign.campaign_id, cy.cycle_id)}
                  className="rounded px-1.5 py-0.5 text-slate-300 hover:bg-red-50 hover:text-red-500"
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="text-slate-600">
          <tr className="border-t border-slate-200 font-medium">
            <td className="py-1 pr-2">Totals</td>
            <td className="py-1 pr-2">{rm(r.totalSpend)}</td>
            <td className="py-1 pr-2">{rm(r.totalExpected)}</td>
            <td className="py-1 pr-2" />
            <td className="py-1 pr-2 text-right">Received:</td>
            <td className="py-1 pr-2">{rm(r.totalReceived)}</td>
          </tr>
        </tfoot>
      </table>
      {(campaign.cycles || []).length === 0 && (
        <p className="py-2 text-xs text-slate-400">Set start &amp; end dates to generate monthly rows.</p>
      )}
    </div>
  )
}
