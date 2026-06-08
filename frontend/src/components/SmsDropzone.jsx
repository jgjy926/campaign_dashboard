// Drag-drop or pick image(s) — screenshots of the bank's SMS confirmation.
// Stored as proof (no parsing). On mobile, tapping opens the gallery/camera.
import { useState } from 'react'
import { saveMediaBlob } from '../lib/storage'
import { uploadSnapshot, cloudEnabled } from '../lib/api'
import { newAttachmentId } from '../lib/schema'
import { useStore } from '../store/useStore'

export default function SmsDropzone({ campaignId }) {
  const addAttachment = useStore((s) => s.addAttachment)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function onFiles(fileList) {
    const files = [...(fileList || [])].filter((f) => f.type.startsWith('image/'))
    if (!files.length) {
      setMsg('Please choose image file(s).')
      return
    }
    setBusy(true)
    try {
      let cloudFails = 0
      for (const file of files) {
        const ext = (file.name.split('.').pop() || 'png').toLowerCase()
        const path = `/media/${campaignId}_sms_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`
        await saveMediaBlob(path, file)
        if (cloudEnabled()) {
          try {
            await uploadSnapshot(path.replace('/media/', ''), file)
          } catch {
            cloudFails += 1
          }
        }
        addAttachment(campaignId, {
          att_id: newAttachmentId(),
          type: 'sms',
          url: path,
          added: new Date().toISOString(),
        })
      }
      setMsg(
        `Saved ${files.length} image(s).` +
          (cloudFails ? ` ${cloudFails} saved locally only (cloud upload failed).` : ''),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        onFiles(e.dataTransfer.files)
      }}
      className="rounded-lg border-2 border-dashed border-slate-300 bg-white p-3 text-sm"
    >
      <div className="font-medium text-slate-700">SMS confirmation</div>
      <p className="mb-2 text-xs text-slate-500">
        Tap to choose screenshot(s) from your gallery (or drop here). Kept as proof.
      </p>
      <input
        type="file"
        accept="image/*"
        multiple
        disabled={busy}
        onChange={(e) => {
          onFiles(e.target.files)
          e.target.value = ''
        }}
        className="block w-full cursor-pointer rounded border border-slate-300 p-2 text-xs file:mr-2 file:rounded file:border-0 file:bg-indigo-600 file:px-3 file:py-1 file:text-white"
      />
      {busy && <p className="mt-2 text-xs text-slate-500">Saving…</p>}
      {msg && !busy && <p className="mt-2 text-xs text-slate-500">{msg}</p>}
    </div>
  )
}
