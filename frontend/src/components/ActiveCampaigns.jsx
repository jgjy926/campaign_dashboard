// Active campaigns with current-month progress toward qualify / cap.
import { activeCampaigns } from '../lib/selectors'
import { rm, pct } from '../lib/format'

function Bar({ value, max, color }) {
  const w = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="h-2 w-full overflow-hidden rounded bg-slate-200">
      <div className={`h-full ${color}`} style={{ width: `${w}%` }} />
    </div>
  )
}

export default function ActiveCampaigns({ doc }) {
  const rows = activeCampaigns(doc)
  return (
    <section className="rounded-lg bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">Active campaigns</h2>
      {rows.length === 0 && <p className="text-xs text-slate-400">No active campaigns today.</p>}
      <div className="space-y-3">
        {rows.map(({ campaign, card, trackedSpend, qualified, spendToQualify, spendToCap, capReached, projected }) => (
          <div key={campaign.campaign_id} className="rounded border border-slate-100 p-3">
            <div className="flex items-baseline justify-between">
              <div>
                <span className="text-sm font-medium text-slate-800">{campaign.title}</span>
                <span className="ml-2 text-xs text-slate-400">{card} · {campaign.category}</span>
              </div>
              <span className="text-xs text-slate-500">{pct(campaign.earning_rate)} · cap {rm(campaign.cashback_cap)}</span>
            </div>
            <div className="mt-2 space-y-1 text-xs text-slate-600">
              <div className="flex justify-between">
                <span>Spend vs min ({rm(campaign.min_spend_threshold)})</span>
                <span className={qualified ? 'text-green-600' : 'text-amber-600'}>
                  {qualified ? 'Qualified' : `${rm(spendToQualify)} to qualify`}
                </span>
              </div>
              <Bar value={trackedSpend} max={campaign.min_spend_threshold} color={qualified ? 'bg-green-500' : 'bg-amber-500'} />
              <div className="flex justify-between pt-1">
                <span>Projected cashback {rm(projected)}</span>
                <span className={capReached ? 'text-red-600' : 'text-slate-500'}>
                  {capReached ? 'Cap reached' : Number.isFinite(spendToCap) ? `${rm(spendToCap)} to cap` : 'no cap'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
