// Read-through / write-behind sync helpers used by the store.
//  - hydrateFromRemote: pull remote, win if its last_updated is newer.
//  - scheduleSave: debounced (3s) push of the full state to the Worker.
import { cloudEnabled, fetchRemoteState, pushRemoteState } from './api'

const DEBOUNCE_MS = 3000

// Returns the document that should win, or null if local is already current.
export async function hydrateFromRemote(localDoc) {
  if (!cloudEnabled()) return null
  const remote = await fetchRemoteState()
  if (!remote) return null
  if (!localDoc) return remote
  const remoteTs = Date.parse(remote.last_updated || 0)
  const localTs = Date.parse(localDoc.last_updated || 0)
  return remoteTs > localTs ? remote : null
}

let timer = null
let pending = null

// Debounced write-behind. `onStatus` reports 'saving' | 'saved' | 'error' | 'idle'.
export function scheduleSave(doc, onStatus) {
  if (!cloudEnabled()) return
  pending = doc
  if (timer) clearTimeout(timer)
  timer = setTimeout(async () => {
    const toSave = pending
    pending = null
    timer = null
    try {
      onStatus?.('saving')
      await pushRemoteState(toSave)
      onStatus?.('saved')
    } catch (e) {
      console.error(e)
      onStatus?.('error')
    }
  }, DEBOUNCE_MS)
}
