import { useEffect, useMemo, useState } from 'react'
import { useStore } from './store/useStore'
import { portfolioTotals, isArchived, archivableCampaigns } from './lib/selectors'
import { rm } from './lib/format'
import SyncStatus from './components/SyncStatus'
import ActiveCampaigns from './components/ActiveCampaigns'
import UpcomingCountdown from './components/UpcomingCountdown'
import NextBestCard from './components/NextBestCard'
import ReconciliationLedger from './components/ReconciliationLedger'
import UpcomingCycleStarts from './components/UpcomingCycleStarts'
import CardManager from './components/CardManager'
import CampaignForm from './components/CampaignForm'
import ImportCampaigns from './components/ImportCampaigns'
import CampaignDetail from './components/CampaignDetail'
import AskPanel from './components/AskPanel'

function Stat({ label, value }) {
  return (
    <div className="min-w-0 rounded-lg bg-white px-2.5 py-2 shadow-sm sm:px-4 sm:py-3">
      <div className="truncate text-[11px] text-slate-400 sm:text-xs">{label}</div>
      <div className="truncate text-sm font-semibold text-slate-800 sm:text-lg">{value}</div>
    </div>
  )
}

export default function App() {
  const init = useStore((s) => s.init)
  const ready = useStore((s) => s.ready)
  const doc = useStore((s) => s.doc)
  const deleteCampaign = useStore((s) => s.deleteCampaign)
  const archiveCampaign = useStore((s) => s.archiveCampaign)
  const unarchiveCampaign = useStore((s) => s.unarchiveCampaign)
  const [tab, setTab] = useState('dashboard')
  const [editing, setEditing] = useState(null) // campaign object, 'new', or 'import'
  const [expanded, setExpanded] = useState(null)
  const [campaignFilter, setCampaignFilter] = useState('active') // 'active' | 'archived'

  useEffect(() => { init() }, [init])

  const totals = portfolioTotals(doc)
  const archivable = useMemo(() => archivableCampaigns(doc), [doc])
  const shownCampaigns = doc.campaigns.filter((c) =>
    campaignFilter === 'archived' ? isArchived(c) : !isArchived(c),
  )
  const archivedCount = doc.campaigns.filter(isArchived).length

  // Reason to record when archiving: completed if every cycle was received,
  // otherwise unfulfilled.
  const inferReason = (c) => {
    const cycles = c.cycles || []
    return cycles.length > 0 && cycles.every((cy) => cy.is_received) ? 'completed' : 'unfulfilled'
  }

  const cleanupFinished = () => {
    archivable.forEach(({ campaign, reason }) => archiveCampaign(campaign.campaign_id, reason))
  }

  if (!ready) return <div className="p-8 text-slate-400">Loading…</div>

  return (
    <div className="mx-auto max-w-7xl px-3 pb-6 pt-[max(0.75rem,env(safe-area-inset-top))] sm:p-4">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 sm:mb-4">
        <h1 className="whitespace-nowrap text-lg font-bold text-slate-800 sm:text-xl">C.B Campaign Tracker</h1>
        <div className="flex items-center gap-2 sm:gap-3">
          <SyncStatus />
          <nav className="flex gap-1 rounded-lg bg-white p-1 text-xs shadow-sm">
            {['dashboard', 'manage'].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded px-3 py-1.5 capitalize ${tab === t ? 'bg-indigo-600 text-white' : 'text-slate-600'}`}
              >
                {t}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-3 gap-2 sm:gap-3">
        <Stat label="Expected cashback" value={rm(totals.totalExpected)} />
        <Stat label="Received" value={rm(totals.totalReceived)} />
        <Stat label="Outstanding" value={rm(totals.outstanding)} />
      </div>

      {tab === 'dashboard' ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="min-w-0 space-y-4 lg:col-span-2">
            <ActiveCampaigns doc={doc} />
            <NextBestCard doc={doc} />
            <ReconciliationLedger doc={doc} />
          </div>
          <div className="min-w-0 space-y-4">
            <UpcomingCycleStarts />
            <UpcomingCountdown doc={doc} />
            <div className="h-[28rem]">
              <AskPanel />
            </div>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="min-w-0 lg:col-span-1">
            <CardManager />
          </div>
          <div className="min-w-0 space-y-3 lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-slate-700">Campaigns</h2>
                <div className="flex gap-1 rounded-lg bg-white p-0.5 shadow-sm text-xs">
                  {['active', 'archived'].map((f) => (
                    <button
                      key={f}
                      onClick={() => { setCampaignFilter(f); setEditing(null); setExpanded(null) }}
                      className={`rounded px-2 py-0.5 capitalize ${campaignFilter === f ? 'bg-indigo-600 text-white' : 'text-slate-600'}`}
                    >
                      {f}{f === 'archived' && archivedCount > 0 ? ` (${archivedCount})` : ''}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {campaignFilter === 'active' && archivable.length > 0 && (
                  <button
                    onClick={cleanupFinished}
                    title="Archive campaigns that have ended (completed or unfulfilled)"
                    className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100"
                  >
                    Clean up {archivable.length} finished
                  </button>
                )}
                <button
                  onClick={() => { setCampaignFilter('active'); setEditing('import') }}
                  title="Paste the JSON an AI extracted from a campaign's T&C"
                  className="rounded border border-indigo-300 bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
                >
                  Import JSON
                </button>
                <button
                  onClick={() => { setCampaignFilter('active'); setEditing('new') }}
                  className="rounded bg-slate-800 px-2 py-1 text-xs font-medium text-white"
                >
                  + Campaign
                </button>
              </div>
            </div>

            {editing === 'import' && campaignFilter === 'active' && (
              <ImportCampaigns onDone={() => setEditing(null)} />
            )}

            {editing === 'new' && campaignFilter === 'active' && <CampaignForm onDone={() => setEditing(null)} />}

            {shownCampaigns.map((c) => (
              <div key={c.campaign_id} className="rounded-lg bg-white p-3 shadow-sm">
                {editing?.campaign_id === c.campaign_id ? (
                  <CampaignForm initial={c} onDone={() => setEditing(null)} />
                ) : (
                  <>
                    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                      <button
                        onClick={() => setExpanded(expanded === c.campaign_id ? null : c.campaign_id)}
                        aria-expanded={expanded === c.campaign_id}
                        className="flex min-w-0 items-start gap-2 text-left"
                      >
                        <svg
                          viewBox="0 0 20 20"
                          aria-hidden="true"
                          className={`mt-0.5 h-4 w-4 shrink-0 fill-slate-400 transition-transform ${expanded === c.campaign_id ? 'rotate-90' : ''}`}
                        >
                          <path d="M7.3 4.3a1 1 0 0 1 1.4 0l5 5a1 1 0 0 1 0 1.4l-5 5a1 1 0 0 1-1.4-1.4L11.6 10 7.3 5.7a1 1 0 0 1 0-1.4z" />
                        </svg>
                        <span className="min-w-0">
                          <span className="block break-words text-sm font-medium text-slate-800">
                            {c.title || '(untitled)'}
                            {isArchived(c) && c.archived_reason && (
                              <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${c.archived_reason === 'completed' ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'}`}>
                                {c.archived_reason}
                              </span>
                            )}
                          </span>
                          <span className="block text-xs text-slate-400">{c.category} · {c.start_date} → {c.end_date}</span>
                        </span>
                      </button>
                      <span className="flex shrink-0 gap-4 pl-5 text-xs sm:gap-2 sm:pl-0">
                        <button onClick={() => setEditing(c)} className="text-indigo-600">edit</button>
                        {isArchived(c) ? (
                          <button onClick={() => unarchiveCampaign(c.campaign_id)} className="text-emerald-600">unarchive</button>
                        ) : (
                          <button onClick={() => archiveCampaign(c.campaign_id, inferReason(c))} className="text-amber-600">archive</button>
                        )}
                        <button onClick={() => deleteCampaign(c.campaign_id)} className="text-red-500">delete</button>
                      </span>
                    </div>
                    {expanded === c.campaign_id && <div className="mt-3"><CampaignDetail campaign={c} /></div>}
                  </>
                )}
              </div>
            ))}
            {shownCampaigns.length === 0 && (
              <p className="text-xs text-slate-400">
                {campaignFilter === 'archived' ? 'No archived campaigns.' : 'No campaigns yet.'}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
