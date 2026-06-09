// LocalForage wrapper: the local-first cache. Holds the full state document
// plus media blobs (T&C snapshots and SMS screenshots) keyed by their /media path.
import localforage from 'localforage'
import { cloudEnabled, fetchMediaBlob } from './api'

const stateStore = localforage.createInstance({
  name: 'cashback-optimizer',
  storeName: 'state',
})

const mediaStore = localforage.createInstance({
  name: 'cashback-optimizer',
  storeName: 'media',
})

const STATE_KEY = 'campaigns'

export async function loadState() {
  return (await stateStore.getItem(STATE_KEY)) || null
}

export async function saveState(doc) {
  await stateStore.setItem(STATE_KEY, doc)
}

// Media blobs are stored locally for instant, offline display; the same blob is
// also uploaded to Koofr for backup. Key is the /media/... path.
export async function saveMediaBlob(path, blob) {
  await mediaStore.setItem(path, blob)
}

export async function getMediaBlob(path) {
  return await mediaStore.getItem(path)
}

export async function getMediaObjectUrl(path) {
  let blob = await getMediaBlob(path)

  // Not in local IndexedDB — try fetching from Koofr via the Worker proxy,
  // then cache it locally so subsequent loads are instant.
  if (!blob && cloudEnabled()) {
    try {
      const name = path.replace(/^\/media\//, '')
      blob = await fetchMediaBlob(name)
      if (blob) await saveMediaBlob(path, blob)
    } catch {
      // Cloud unreachable or file not there yet — show nothing gracefully.
    }
  }

  return blob ? URL.createObjectURL(blob) : null
}

export async function removeMediaBlob(path) {
  await mediaStore.removeItem(path)
}
