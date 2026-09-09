import { TicketAttachmentList, TicketAttachmentPicker } from "./ticket-attachments"
import { useTicketAttachmentDraft } from "@/lib/use-ticket-attachment-draft"
export function TicketAttachmentsPreview() {
  const draft=useTicketAttachmentDraft("component-preview")
  return <div className="grid w-full max-w-xl gap-4">
    <p className="text-sm text-[var(--md-text)]">Add files to inspect their previews. This component example does not upload or send them.</p>
    <TicketAttachmentList items={draft.items} onRemove={draft.remove}/>
    <div className="flex items-center gap-3"><TicketAttachmentPicker onAdd={draft.add}/><span className="text-xs text-[var(--md-text)]">Images and documents · 10 MB per file</span></div>
    {draft.error ? <p role="alert" className="text-sm text-[var(--md-red)]">{draft.error}</p> : null}
  </div>
}
