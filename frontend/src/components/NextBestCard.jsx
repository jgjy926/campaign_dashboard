// "Next Best Card": per category, where the next ringgit earns most right now.
import { nextBestByCategory } from '../lib/selectors'
import { rm, pct } from '../lib/format'

export default function NextBestCard({ doc }) {
  const groups = nextBestByCategory(doc)
  return (
    <section className="rounded-lg bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">Next best card — how to spend</h2>
      {groups.length === 0 && (
        <p className="text-xs text-slate-400">No campaigns with earning headroom right now.</p>
      )}
      <div className="space-y-3">
        {groups.map(({ category, ranked }) => (
          <div key={category}>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{category}</div>
            <table className="w-full text-left text-xs">
              <tbody>
                {ranked.map((row, i) => (
                  <tr key={row.campaign.campaign_id} className={i === 0 ? 'font-medium text-slate-800' : 'text-slate-500'}>
                    <td className="py-0.5 pr-2">{i === 0 ? '★' : ''} {row.card}</td>
                    <td className="py-0.5 pr-2">{row.campaign.title}</td>
                    <td className="py-0.5 pr-2">{pct(row.campaign.earning_rate)}</td>
                    <td className="py-0.5 text-right">
                      {Number.isFinite(row.spendToCap) ? `${rm(row.spendToCap)} headroom` : 'no cap'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </section>
  )
}
