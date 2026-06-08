// Tiny badge reflecting the write-behind sync state.
import { useStore } from '../store/useStore'
import { cloudEnabled } from '../lib/api'

const LABELS = {
  idle: ['Cloud connected', 'bg-green-100 text-green-700'],
  saving: ['Saving…', 'bg-amber-100 text-amber-700'],
  saved: ['Synced', 'bg-green-100 text-green-700'],
  error: ['Sync error', 'bg-red-100 text-red-700'],
}

export default function SyncStatus() {
  const status = useStore((s) => s.syncStatus)
  if (!cloudEnabled()) {
    return <span className="rounded px-2 py-1 text-xs bg-slate-100 text-slate-500">Offline (local only)</span>
  }
  const [label, cls] = LABELS[status] || LABELS.idle
  return <span className={`rounded px-2 py-1 text-xs ${cls}`}>{label}</span>
}
