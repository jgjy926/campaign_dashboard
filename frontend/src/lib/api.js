// Thin fetch client to the Cloudflare Worker. Adds the X-App-Auth header.
// All cloud access is optional: with no Worker URL or access token the app runs
// fully local (offline-first) and these calls are skipped by the sync layer.
// The web page is public, so the token is never built in: each device enters its
// own once, and it stays in that device's storage.

const BASE = (import.meta.env.VITE_WORKER_URL || '').replace(/\/$/, '')
const TOKEN_KEY = 'campaign-dashboard.token'

export const canConnect = () => Boolean(BASE)

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || ''
  } catch {
    return ''
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Private mode: the app keeps working, just local-only.
  }
}

export const cloudEnabled = () => Boolean(BASE && getToken())

function headers(extra = {}) {
  return { 'X-App-Auth': getToken(), ...extra }
}

// True if the Worker accepts this token, false if it refuses it. Throws if unreachable.
export async function testToken(token) {
  const res = await fetch(`${BASE}/api/sync`, { headers: { 'X-App-Auth': token } })
  if (res.status === 401) return false
  if (!res.ok) throw new Error(`sync failed: ${res.status}`)
  return true
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

// Fetches a media blob from Koofr via the Worker proxy.
// Returns a Blob, or throws on failure.
export async function fetchMediaBlob(name) {
  const res = await fetch(`${BASE}/api/media/${encodeURIComponent(name)}`, {
    headers: headers(),
  })
  if (!res.ok) throw new Error(`media fetch failed: ${res.status}`)
  return res.blob()
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
