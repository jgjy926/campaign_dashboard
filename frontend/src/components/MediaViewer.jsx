// Full-screen, PDF-reader-style viewer for stored media (T&C pages, SMS
// screenshots). All pages scroll in one column fitted to the screen width;
// zoom with pinch, ctrl+wheel, double-tap or the +/− buttons. Opening pushes a
// history entry, so the browser / Android Back button closes the viewer
// instead of leaving the app.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { getMediaObjectUrl } from '../lib/storage'

const MIN = 1
const MAX = 5
const STEP = 1.25
const PAGE_MAX_PX = 900 // "fit width" stops here on wide screens, like a desktop PDF viewer
const clamp = (s) => Math.min(MAX, Math.max(MIN, s))

export default function MediaViewer({ paths, index = 0, onClose, title }) {
  const [urls, setUrls] = useState(() => paths.map(() => undefined)) // undefined = loading, null = missing
  const [scale, setScale] = useState(1)
  const [page, setPage] = useState(index)
  const scrollRef = useRef(null)
  const pageRefs = useRef([])
  const anchor = useRef(null) // scroll position to restore after a zoom re-layout
  const scaleRef = useRef(1)
  scaleRef.current = scale
  const jumped = useRef(false)

  // Back button / history.
  useEffect(() => {
    history.pushState({ mediaViewer: true }, '')
    const onPop = () => onClose()
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [onClose])
  const close = () => history.back() // popstate → onClose

  // Load every page's blob.
  useEffect(() => {
    let active = true
    const made = []
    paths.forEach((p, i) => {
      getMediaObjectUrl(p).then((u) => {
        if (!active) {
          if (u) URL.revokeObjectURL(u)
          return
        }
        if (u) made.push(u)
        setUrls((prev) => prev.map((v, j) => (j === i ? u || null : v)))
      })
    })
    return () => {
      active = false
      made.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [paths])

  // Once every page has resolved (so heights are final), jump to the tapped page.
  const allResolved = urls.every((u) => u !== undefined)
  const [imgsLoaded, setImgsLoaded] = useState(0)
  const expectedImgs = urls.filter(Boolean).length
  useEffect(() => {
    if (jumped.current || !allResolved || imgsLoaded < expectedImgs) return
    jumped.current = true
    const el = pageRefs.current[index]
    if (el && scrollRef.current) scrollRef.current.scrollTop = el.offsetTop - 8
  }, [allResolved, imgsLoaded, expectedImgs, index])

  // Zoom so that the content point under (fx, fy) — relative to the scroll
  // viewport — stays put.
  const zoomTo = useCallback((next, fx, fy) => {
    const sc = scrollRef.current
    const prev = scaleRef.current
    next = clamp(next)
    if (!sc || next === prev) return
    if (fx === undefined) {
      fx = sc.clientWidth / 2
      fy = sc.clientHeight / 2
    }
    const k = next / prev
    anchor.current = { left: (sc.scrollLeft + fx) * k - fx, top: (sc.scrollTop + fy) * k - fy }
    scaleRef.current = next
    setScale(next)
  }, [])

  useLayoutEffect(() => {
    const sc = scrollRef.current
    if (sc && anchor.current) {
      sc.scrollLeft = anchor.current.left
      sc.scrollTop = anchor.current.top
      anchor.current = null
    }
  }, [scale])

  // Pinch-to-zoom and ctrl+wheel. Non-passive listeners so we can stop the
  // browser zooming the whole app instead.
  useEffect(() => {
    const sc = scrollRef.current
    if (!sc) return
    let pinch = null
    const rel = (x, y) => {
      const r = sc.getBoundingClientRect()
      return [x - r.left, y - r.top]
    }
    const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
    const onStart = (e) => {
      if (e.touches.length === 2) {
        pinch = { d: dist(e.touches), s: scaleRef.current }
      }
    }
    const onMove = (e) => {
      if (!pinch || e.touches.length !== 2) return
      e.preventDefault()
      const [fx, fy] = rel(
        (e.touches[0].clientX + e.touches[1].clientX) / 2,
        (e.touches[0].clientY + e.touches[1].clientY) / 2,
      )
      zoomTo(pinch.s * (dist(e.touches) / pinch.d), fx, fy)
    }
    const onEnd = (e) => {
      if (e.touches.length < 2) pinch = null
    }
    const onWheel = (e) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      const [fx, fy] = rel(e.clientX, e.clientY)
      zoomTo(scaleRef.current * Math.exp(-e.deltaY / 300), fx, fy)
    }
    sc.addEventListener('touchstart', onStart, { passive: true })
    sc.addEventListener('touchmove', onMove, { passive: false })
    sc.addEventListener('touchend', onEnd)
    sc.addEventListener('touchcancel', onEnd)
    sc.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      sc.removeEventListener('touchstart', onStart)
      sc.removeEventListener('touchmove', onMove)
      sc.removeEventListener('touchend', onEnd)
      sc.removeEventListener('touchcancel', onEnd)
      sc.removeEventListener('wheel', onWheel)
    }
  }, [zoomTo])

  // Double-tap / double-click toggles fit-width ↔ 2.5×, centred on the tap.
  const onDoubleClick = (e) => {
    const r = scrollRef.current.getBoundingClientRect()
    zoomTo(scaleRef.current > 1.05 ? 1 : 2.5, e.clientX - r.left, e.clientY - r.top)
  }

  // Track the current page from the scroll position.
  const onScroll = () => {
    const sc = scrollRef.current
    const mid = sc.scrollTop + sc.clientHeight / 3
    let current = 0
    pageRefs.current.forEach((el, i) => {
      if (el && el.offsetTop <= mid) current = i
    })
    setPage(current)
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') history.back()
      else if (e.key === '+' || e.key === '=') zoomTo(scaleRef.current * STEP)
      else if (e.key === '-') zoomTo(scaleRef.current / STEP)
      else if (e.key === '0') zoomTo(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zoomTo])

  const btn = 'rounded-md bg-white/10 px-3 py-2 text-sm text-white active:bg-white/25 disabled:opacity-30'

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-neutral-800"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="flex items-center gap-2 bg-neutral-900 px-2 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] shadow">
        <button onClick={close} className={btn} aria-label="Close">✕</button>
        <div className="min-w-0 flex-1 text-white">
          <div className="truncate text-sm font-medium">{title}</div>
          <div className="text-[11px] text-white/60">
            Page {page + 1} of {paths.length}
          </div>
        </div>
        <button onClick={() => zoomTo(scale / STEP)} disabled={scale <= MIN} className={btn} aria-label="Zoom out">−</button>
        <button
          onClick={() => zoomTo(1)}
          className="w-14 rounded-md px-1 py-2 text-center text-xs tabular-nums text-white/80 active:bg-white/10"
          aria-label="Fit to width"
          title="Fit to width"
        >
          {Math.round(scale * 100)}%
        </button>
        <button onClick={() => zoomTo(scale * STEP)} disabled={scale >= MAX} className={btn} aria-label="Zoom in">+</button>
      </div>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        onDoubleClick={onDoubleClick}
        className="relative min-h-0 flex-1 overflow-auto overscroll-contain"
        style={{ touchAction: 'pan-x pan-y' }}
      >
        <div
          className="mx-auto space-y-2 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
          style={{ width: `${scale * 100}%`, maxWidth: `${scale * PAGE_MAX_PX}px` }}
        >
          {paths.map((p, i) => (
            <div key={p} ref={(el) => (pageRefs.current[i] = el)} className="bg-white shadow-lg">
              {urls[i] ? (
                <img
                  src={urls[i]}
                  alt={`${title} page ${i + 1}`}
                  draggable={false}
                  onLoad={() => setImgsLoaded((n) => n + 1)}
                  className="block h-auto w-full select-none"
                />
              ) : (
                <div className="flex aspect-[1/1.414] items-center justify-center bg-neutral-100 text-xs text-neutral-400">
                  {urls[i] === undefined ? 'Loading…' : 'No preview available on this device'}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
