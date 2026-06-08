// Expanded campaign view: monthly tracker, uploads, and stored attachments.
import { useStore } from '../store/useStore'
import SpendTracker from './SpendTracker'
import TncDropzone from './TncDropzone'
import SmsDropzone from './SmsDropzone'
import MediaThumb from './MediaThumb'

export default function CampaignDetail({ campaign }) {
  const removeAttachment = useStore((s) => s.removeAttachment)
  const tnc = (campaign.attachments || []).filter((a) => a.type === 'tnc')
  const sms = (campaign.attachments || []).filter((a) => a.type === 'sms')

  return (
    <div className="space-y-4 border-t border-slate-100 pt-3">
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
  if (items.length === 0) return null
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h4>
      <div className="flex flex-wrap gap-2">
        {items.map((a) => (
          <div key={a.att_id} className="text-center">
            <MediaThumb path={a.url} alt={title} />
            <button onClick={() => onRemove(campaignId, a.att_id)} className="mt-1 text-[10px] text-red-500">
              remove
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
