// Drop or pick a campaign Terms PDF. EVERY page is snapshotted to PNG and its
// text extracted; each page becomes an attachment (grounds the Ask feature).
// On mobile, tapping the file input opens the native file picker (Downloads).
import { useState } from 'react'
import { loadPdf, renderPageToPng, extractPageText } from '../lib/pdf'
import { saveMediaBlob } from '../lib/storage'
import { uploadSnapshot, cloudEnabled } from '../lib/api'
import { newAttachmentId } from '../lib/schema'
import { useStore } from '../store/useStore'

export default function TncDropzone({ campaignId }) {
  const addAttachment = useStore((s) => s.addAttachment)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function processFile(file) {
    if (!file || file.type !== 'application/pdf') {
      setMsg('Please choose a PDF file.')
      return
    }
    setBusy(true)
    try {
      const pdf = await loadPdf(file)
      const total = pdf.numPages
      let cloudFails = 0
      for (let p = 1; p <= total; p++) {
        setMsg(`Processing page ${p} of ${total}…`)
        const [blob, text] = await Promise.all([renderPageToPng(pdf, p), extractPageText(pdf, p)])
        const path = `/media/${campaignId}_tnc_p${p}_${Date.now()}.png`
        await saveMediaBlob(path, blob)
        if (cloudEnabled()) {
          try {
            await uploadSnapshot(path.replace('/media/', ''), blob)
          } catch {
            cloudFails += 1
          }
        }
        addAttachment(campaignId, {
          att_id: newAttachmentId(),
          type: 'tnc',
          url: path,
          page: p,
          tc_text: text,
          added: new Date().toISOString(),
        })
      }
      setMsg(
        `Captured all ${total} page(s).` +
          (cloudFails ? ` ${cloudFails} page(s) saved locally only (cloud upload failed).` : ''),
      )
    } catch (e) {
      setMsg(`Failed: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        processFile(e.dataTransfer.files?.[0])
      }}
      className="rounded-lg border-2 border-dashed border-slate-300 bg-white p-3 text-sm"
    >
      <div className="font-medium text-slate-700">T&C PDF — all pages</div>
      <p className="mb-2 text-xs text-slate-500">
        Tap to choose a downloaded PDF (or drop one here). Every page is snapshotted and read.
      </p>
      <input
        type="file"
        accept="application/pdf,.pdf"
        disabled={busy}
        onChange={(e) => {
          processFile(e.target.files?.[0])
          e.target.value = '' // allow re-selecting the same file
        }}
        className="block w-full cursor-pointer rounded border border-slate-300 p-2 text-xs file:mr-2 file:rounded file:border-0 file:bg-indigo-600 file:px-3 file:py-1 file:text-white"
      />
      {msg && <p className="mt-2 text-xs text-slate-500">{msg}</p>}
    </div>
  )
}
