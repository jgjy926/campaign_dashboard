// Expanded campaign view: monthly tracker, uploads, and stored attachments.
import { useCallback, useMemo, useState } from 'react'
import { useStore } from '../store/useStore'
import SpendTracker from './SpendTracker'
import TncDropzone from './TncDropzone'
import SmsDropzone from './SmsDropzone'
import MediaThumb from './MediaThumb'
import MediaViewer from './MediaViewer'

export default function CampaignDetail({ campaign }) {
  const removeAttachment = useStore((s) => s.removeAttachment)
  const tnc = (campaign.attachments || []).filter((a) => a.type === 'tnc')
  const sms = (campaign.attachments || []).filter((a) => a.type === 'sms')

  const meta = campaign.import_meta
  const evidence = meta?.evidence && typeof meta.evidence === 'object' ? meta.evidence : {}
  const derived = meta?.derived && typeof meta.derived === 'object' ? meta.derived : {}

  return (
    <div className="space-y-4 border-t border-slate-100 pt-3">
      {campaign.notes && (
        <p className="rounded bg-slate-50 px-2 py-1.5 text-xs text-slate-600">{campaign.notes}</p>
      )}

      {meta && (
        <details className="rounded border border-slate-200 px-2 py-1.5 text-xs">
          <summary className="cursor-pointer text-slate-500">
            Imported from T&amp;C{meta.source_document ? ` — ${meta.source_document}` : ''}
            {meta.confidence && meta.confidence !== 'unrated' && ` · ${meta.confidence} confidence`}
          </summary>
          {Object.keys(evidence).length > 0 ? (
            <ul className="mt-1.5 space-y-1 border-l-2 border-slate-200 pl-2 text-slate-500">
              {Object.entries(evidence).map(([field, quote]) => (
                <li key={field}>
                  <span className="font-medium text-slate-600">{field}:</span> “{String(quote)}”
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1.5 text-slate-400">No source quotes were supplied with this import.</p>
          )}
          {Object.keys(derived).length > 0 && (
            <ul className="mt-1.5 space-y-1 border-l-2 border-indigo-200 pl-2 text-slate-500">
              {Object.entries(derived).map(([field, working]) => (
                <li key={field}>
                  <span className="font-medium text-slate-600">{field}</span> worked out as {String(working)}
                </li>
              ))}
            </ul>
          )}
        </details>
      )}

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Monthly tracker</h4>
        <SpendTracker campaign={campaign} />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <TncDropzone campaignId={campaign.campaign_id} />
        <SmsDropzone campaignId={campaign.campaign_id} />
      </div>

      {(tnc.length > 0 || sms.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          <Attachments title="T&C snapshots" items={tnc} campaignId={campaign.campaign_id} onRemove={removeAttachment} />
          <Attachments title="SMS confirmations" items={sms} campaignId={campaign.campaign_id} onRemove={removeAttachment} />
        </div>
      )}
    </div>
  )
}

function Attachments({ title, items, campaignId, onRemove }) {
  const [viewing, setViewing] = useState(null) // index into items, or null
  const closeViewer = useCallback(() => setViewing(null), [])
  const pathKey = items.map((a) => a.url).join('|')
  const paths = useMemo(() => (pathKey ? pathKey.split('|') : []), [pathKey])
  if (items.length === 0) return null
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h4>
      {viewing !== null && viewing < items.length && (
        <MediaViewer
          paths={paths}
          index={viewing}
          onClose={closeViewer}
          title={title}
        />
      )}
      <div className="flex flex-wrap gap-2">
        {items.map((a, i) => (
          <div key={a.att_id} className="text-center">
            <MediaThumb path={a.url} alt={title} onOpen={() => setViewing(i)} />
            <button onClick={() => onRemove(campaignId, a.att_id)} className="mt-1 text-[10px] text-red-500">
              remove
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
