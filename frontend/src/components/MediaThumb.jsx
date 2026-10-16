// Renders a stored media attachment from the local IndexedDB blob (instant,
// offline). Falls back to nothing if the blob isn't cached locally. Tapping it
// calls onOpen (the parent shows MediaViewer) rather than navigating away, which
// would strand the Android app on a bare image with no way back.
import { useEffect, useState } from 'react'
import { getMediaObjectUrl } from '../lib/storage'

export default function MediaThumb({ path, alt, onOpen }) {
  const [url, setUrl] = useState(null)

  useEffect(() => {
    let active = true
    let objUrl = null
    getMediaObjectUrl(path).then((u) => {
      if (active) {
        objUrl = u
        setUrl(u)
      }
    })
    return () => {
      active = false
      if (objUrl) URL.revokeObjectURL(objUrl)
    }
  }, [path])

  if (!url) {
    return (
      <div className="flex h-24 w-20 items-center justify-center rounded border border-slate-200 bg-slate-50 text-[10px] text-slate-400">
        no preview
      </div>
    )
  }
  return (
    <button type="button" onClick={onOpen} className="block" aria-label={`View ${alt}`}>
      <img
        src={url}
        alt={alt}
        className="h-24 w-20 rounded border border-slate-200 object-cover hover:ring-2 hover:ring-indigo-400"
      />
    </button>
  )
}
