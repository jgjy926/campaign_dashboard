// Upcoming campaigns with a days-remaining countdown.
import { upcomingCampaigns } from '../lib/selectors'
import { pct } from '../lib/format'

export default function UpcomingCountdown({ doc }) {
  const rows = upcomingCampaigns(doc)
  return (
    <section className="rounded-lg bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">Upcoming</h2>
      {rows.length === 0 && <p className="text-xs text-slate-400">Nothing scheduled ahead.</p>}
      <ul className="space-y-2">
        {rows.map(({ campaign, card, daysLeft }) => (
          <li key={campaign.campaign_id} className="flex items-center justify-between text-xs">
            <div>
              <span className="font-medium text-slate-700">{campaign.title}</span>
              <span className="ml-2 text-slate-400">{card} · {pct(campaign.earning_rate)}</span>
            </div>
            <span className="rounded bg-indigo-50 px-2 py-1 font-semibold text-indigo-700">
              {daysLeft}d
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
