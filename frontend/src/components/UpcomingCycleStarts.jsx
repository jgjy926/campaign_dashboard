// Reminder card: cycles starting within a user-configurable number of days.
import { useState } from 'react'
import { useStore } from '../store/useStore'
import { upcomingCycleStarts } from '../lib/selectors'
import { rm } from '../lib/format'

export default function UpcomingCycleStarts() {
  const doc = useStore((s) => s.doc)
  const [lookahead, setLookahead] = useState(5)
  const upcoming = upcomingCycleStarts(doc, lookahead)

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">Cycle Reminders</h2>
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <span>Next</span>
          <input
            type="number"
            min="1"
            max="90"
            value={lookahead}
            onChange={(e) => setLookahead(Math.max(1, Number(e.target.value) || 1))}
            className="w-12 rounded border border-slate-300 px-1 py-0.5 text-center text-xs"
          />
          <span>days</span>
        </div>
      </div>

      {upcoming.length === 0 ? (
        <p className="text-xs text-slate-400">No cycles starting in the next {lookahead} day{lookahead !== 1 ? 's' : ''}.</p>
      ) : (
        <ul className="space-y-2">
          {upcoming.map(({ campaign, card, cycle, daysUntilStart }) => (
            <li
              key={cycle.cycle_id}
              className="flex items-start justify-between rounded-lg bg-amber-50 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-slate-800">{campaign.title || '(untitled)'}</p>
                <p className="text-xs text-slate-500">{card} · {cycle.label}</p>
                <p className="text-xs text-slate-400">Starts {cycle.period_start}</p>
                {Number(campaign.min_spend_threshold) > 0 && (
                  <p className="text-xs text-amber-700">
                    Min spend: {rm(campaign.min_spend_threshold)}
                  </p>
                )}
              </div>
              <span
                className={`ml-3 shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                  daysUntilStart === 0
                    ? 'bg-green-100 text-green-700'
                    : daysUntilStart <= 2
                    ? 'bg-red-100 text-red-700'
                    : 'bg-amber-100 text-amber-700'
                }`}
              >
                {daysUntilStart === 0 ? 'Today' : `${daysUntilStart}d`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
