// Thin fetch client to the Cloudflare Worker. Adds the X-App-Auth header.
// All cloud access is optional: if VITE_WORKER_URL is unset the app runs
// fully local (offline-first) and these calls are skipped by the sync layer.

const BASE = (import.meta.env.VITE_WORKER_URL || '').replace(/\/$/, '')
const KEY = import.meta.env.VITE_APP_API_KEY || ''

export const cloudEnabled = () => Boolean(BASE && KEY)

function headers(extra = {}) {
  return { 'X-App-Auth': KEY, ...extra }
}

export async function fetchRemoteState() {
  const res = await fetch(`${BASE}/api/sync`, { headers: headers() })
  if (!res.ok) throw new Error(`sync failed: ${res.status}`)
  return res.json()
}

export async function pushRemoteState(doc) {
  const res = await fetch(`${BASE}/api/save`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(doc),
  })
  if (!res.ok) throw new Error(`save failed: ${res.status}`)
  return res.json().catch(() => ({}))
}

// Uploads a blob (T&C PNG or SMS image) to Koofr /media via the Worker.
// `name` is the filename; returns the stored /media/<name> path.
export async function uploadSnapshot(name, blob) {
  const form = new FormData()
  form.append('name', name)
  form.append('file', blob, name)
  const res = await fetch(`${BASE}/api/upload-snapshot`, {
    method: 'POST',
    headers: headers(),
    body: form,
  })
  if (!res.ok) throw new Error(`upload failed: ${res.status}`)
  return res.json()
}

// Ask the NotebookLM-style endpoint a question, grounded server-side in the
// provided context (relevant campaigns + extracted T&C text).
export async function askQuestion(question, context) {
  const res = await fetch(`${BASE}/api/ask`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ question, context }),
  })
  if (!res.ok) throw new Error(`ask failed: ${res.status}`)
  return res.json()
}
