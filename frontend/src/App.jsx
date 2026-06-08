import { useEffect, useState } from 'react'
import { useStore } from './store/useStore'
import { portfolioTotals } from './lib/selectors'
import { rm } from './lib/format'
import SyncStatus from './components/SyncStatus'
import ActiveCampaigns from './components/ActiveCampaigns'
import UpcomingCountdown from './components/UpcomingCountdown'
import NextBestCard from './components/NextBestCard'
import ReconciliationLedger from './components/ReconciliationLedger'
import CardManager from './components/CardManager'
import CampaignForm from './components/CampaignForm'
import CampaignDetail from './components/CampaignDetail'
import AskPanel from './components/AskPanel'

function Stat({ label, value }) {
  return (
    <div className="rounded-lg bg-white px-4 py-3 shadow-sm">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-lg font-semibold text-slate-800">{value}</div>
    </div>
  )
}

export default function App() {
  const init = useStore((s) => s.init)
  const ready = useStore((s) => s.ready)
  const doc = useStore((s) => s.doc)
  const deleteCampaign = useStore((s) => s.deleteCampaign)
  const [tab, setTab] = useState('dashboard')
  const [editing, setEditing] = useState(null) // campaign object or 'new'
  const [expanded, setExpanded] = useState(null)

  useEffect(() => { init() }, [init])

  const totals = portfolioTotals(doc)

  if (!ready) return <div className="p-8 text-slate-400">Loading…</div>

  return (
    <div className="mx-auto max-w-7xl p-4">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">Cashback Optimizer</h1>
        <div className="flex items-center gap-3">
          <SyncStatus />
          <nav className="flex gap-1 rounded-lg bg-white p-1 shadow-sm text-xs">
            {['dashboard', 'manage'].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded px-3 py-1 capitalize ${tab === t ? 'bg-indigo-600 text-white' : 'text-slate-600'}`}
              >
                {t}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-3 gap-3">
        <Stat label="Expected cashback" value={rm(totals.totalExpected)} />
        <Stat label="Received" value={rm(totals.totalReceived)} />
        <Stat label="Outstanding" value={rm(totals.outstanding)} />
      </div>

      {tab === 'dashboard' ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <ActiveCampaigns doc={doc} />
            <NextBestCard doc={doc} />
            <ReconciliationLedger doc={doc} />
          </div>
          <div className="space-y-4">
            <UpcomingCountdown doc={doc} />
            <div className="h-[28rem]">
              <AskPanel />
            </div>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <CardManager />
          </div>
          <div className="space-y-3 lg:col-span-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">Campaigns</h2>
              <button onClick={() => setEditing('new')} className="rounded bg-slate-800 px-2 py-1 text-xs font-medium text-white">
                + Campaign
              </button>
            </div>

            {editing === 'new' && <CampaignForm onDone={() => setEditing(null)} />}

            {doc.campaigns.map((c) => (
              <div key={c.campaign_id} className="rounded-lg bg-white p-3 shadow-sm">
                {editing?.campaign_id === c.campaign_id ? (
                  <CampaignForm initial={c} onDone={() => setEditing(null)} />
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => setExpanded(expanded === c.campaign_id ? null : c.campaign_id)}
                        className="text-left text-sm font-medium text-slate-800"
                      >
                        {c.title || '(untitled)'}
                        <span className="ml-2 text-xs text-slate-400">{c.category} · {c.start_date} → {c.end_date}</span>
                      </button>
                      <span className="flex gap-2 text-xs">
                        <button onClick={() => setEditing(c)} className="text-indigo-600">edit</button>
                        <button onClick={() => deleteCampaign(c.campaign_id)} className="text-red-500">delete</button>
                      </span>
                    </div>
                    {expanded === c.campaign_id && <div className="mt-3"><CampaignDetail campaign={c} /></div>}
                  </>
                )}
              </div>
            ))}
            {doc.campaigns.length === 0 && <p className="text-xs text-slate-400">No campaigns yet.</p>}
          </div>
        </div>
      )}
    </div>
  )
}
