// Tiny badge reflecting the write-behind sync state. Clicking it enters or
// changes this device's access token.
import { useState } from 'react'
import { useStore } from '../store/useStore'
import { canConnect, cloudEnabled, setToken, testToken } from '../lib/api'

const LABELS = {
  idle: ['Cloud connected', 'bg-green-100 text-green-700'],
  saving: ['Saving…', 'bg-amber-100 text-amber-700'],
  saved: ['Synced', 'bg-green-100 text-green-700'],
  error: ['Sync error', 'bg-red-100 text-red-700'],
}

function TokenForm({ onClose }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [testing, setTesting] = useState(false)

  const save = async (e) => {
    e.preventDefault()
    const token = value.trim()
    if (!token) return
    setTesting(true)
    setError('')
    try {
      if (await testToken(token)) {
        setToken(token)
        window.location.reload() // re-run init so this device picks up the cloud copy
        return
      }
      setError('The Worker refused that token.')
    } catch {
      setError("Couldn't reach the Worker. Check your connection and try again.")
    }
    setTesting(false)
  }

  return (
    <form onSubmit={save} className="absolute right-0 top-full z-20 mt-1 w-72 max-w-[85vw] space-y-2 rounded-lg bg-white p-3 text-xs shadow-lg ring-1 ring-slate-200">
      <label htmlFor="access-token" className="block font-medium text-slate-700">Access token</label>
      <input
        id="access-token"
        type="password"
        autoComplete="off"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-full rounded border border-slate-300 px-2 py-1.5"
      />
      <p className="text-slate-500">Stays on this device. Until it's set, changes here don't sync.</p>
      {error && <p role="alert" className="text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded px-2 py-1 text-slate-600">Cancel</button>
        <button type="submit" disabled={testing} className="rounded bg-indigo-600 px-2 py-1 font-medium text-white disabled:opacity-50">
          {testing ? 'Testing…' : 'Save and test'}
        </button>
      </div>
    </form>
  )
}

export default function SyncStatus() {
  const status = useStore((s) => s.syncStatus)
  const [open, setOpen] = useState(false)
  const connected = cloudEnabled()
  const [label, cls] = connected
    ? LABELS[status] || LABELS.idle
    : [canConnect() ? 'Offline: enter token' : 'Offline (local only)', 'bg-slate-100 text-slate-500']
  if (!canConnect()) return <span className={`rounded px-2 py-1 text-xs ${cls}`}>{label}</span>
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className={`rounded px-2 py-1 text-xs ${cls}`}>
        {label}
      </button>
      {open && <TokenForm onClose={() => setOpen(false)} />}
    </div>
  )
}
