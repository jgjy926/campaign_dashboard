// Unpaid cashback cycles. Overdue rows (past expected payout) flash red.
import { reconciliationLedger } from '../lib/selectors'
import { rm } from '../lib/format'

export default function ReconciliationLedger({ doc }) {
  const rows = reconciliationLedger(doc)
  return (
    <section className="rounded-lg bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">Reconciliation — awaiting payout</h2>
      {rows.length === 0 && <p className="text-xs text-slate-400">All cashback accounted for.</p>}
      <table className="w-full text-left text-xs">
        <thead className="text-slate-400">
          <tr>
            <th className="py-1 pr-2">Campaign</th>
            <th className="py-1 pr-2">Month</th>
            <th className="py-1 pr-2">Expected</th>
            <th className="py-1 pr-2">Payout by</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ campaign, card, cycle, overdue }) => (
            <tr
              key={`${campaign.campaign_id}_${cycle.cycle_id}`}
              className={overdue ? 'animate-pulse bg-red-100' : ''}
            >
              <td className="py-1 pr-2">
                <span className="font-medium text-slate-700">{campaign.title}</span>
                <span className="ml-1 text-slate-400">{card}</span>
              </td>
              <td className="py-1 pr-2">{cycle.label}</td>
              <td className="py-1 pr-2">{rm(cycle.expected_cashback)}</td>
              <td className={`py-1 pr-2 ${overdue ? 'font-semibold text-red-700' : 'text-slate-500'}`}>
                {cycle.expected_payout_date}{overdue ? ' · overdue' : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
