import { useId, useState } from "react"
import { X } from "@/components/icons/hugeicons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { DotGridLoaderPanel } from "@/components/multideck/dot-grid-loader"
import { getContact, updateContact, type ApiContactDetail, type UpdateContactInput } from "@/lib/customer-api"
import { useLanguage } from "@/i18n/language-provider"

/** Fetch the person's authoritative record on demand, never company consent. */
export function ContactPreferencesPopover({ contactId, name, onSaved, previewContact }: {
  contactId: string; name: string; onSaved?: (contact: ApiContactDetail) => void; previewContact?: ApiContactDetail
}) {
  const { t } = useLanguage()
  const id = useId()
  const [open, setOpen] = useState(false)
  const [contact, setContact] = useState<ApiContactDetail | null>(null)
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [channel, setChannel] = useState("")
  const [marketing, setMarketing] = useState(false)
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  async function load() {
    setError(null)
    try {
      const next = previewContact ?? await getContact(contactId, { forceRefresh: true })
      setContact(next); setEmail(next.email || ""); setPhone(next.phone || ""); setChannel(next.preferredChannel || ""); setMarketing(next.consentMarketing); setReason(""); setSaved(false)
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("Contact details could not be loaded.")) }
  }
  const consentChanged = Boolean(contact && marketing !== contact.consentMarketing)
  return <Popover open={open} onOpenChange={next => { if (saving) return; setOpen(next); if (next && !contact) void load() }}>
    <PopoverTrigger asChild><Button type="button" variant="ghost" size="sm" onClick={event => event.stopPropagation()} className="h-8 px-2 text-[12px] active:scale-[0.98] motion-reduce:transform-none" aria-label={`${t("Contact preferences")}: ${name}`}>{t("Contact preferences")}</Button></PopoverTrigger>
    <PopoverContent align="start" sideOffset={8} collisionPadding={12} aria-labelledby={`${id}-title`} onClick={event => event.stopPropagation()} onInteractOutside={event => event.preventDefault()} onEscapeKeyDown={event => { if (saving) event.preventDefault() }} className="contact-compose-popover max-h-[min(82dvh,var(--radix-popover-content-available-height))] w-[min(360px,calc(100vw-24px))] overflow-y-auto bg-[var(--md-surface)] p-4">
      <div className="flex items-center justify-between gap-2"><h2 id={`${id}-title`} className="truncate font-medium" data-i18n-skip>{name}</h2><Button variant="ghost" size="icon" className="size-8" disabled={saving} aria-label={t("Close contact preferences")} onClick={() => setOpen(false)}><X className="size-4" /></Button></div>
      {!contact && !error ? <DotGridLoaderPanel label="Loading contact preferences" minHeight={180} /> : null}
      {error ? <p role="alert" className="text-[12px] text-[var(--md-red)]">{error}<Button variant="ghost" disabled={saving} onClick={() => void load()}>{t(contact ? "Reload contact" : "Retry")}</Button></p> : null}
      {contact ? <form className="grid gap-3" onChange={() => setSaved(false)} onSubmit={async event => {
        event.preventDefault(); if (saving || previewContact) return
        setSaving(true); setError(null); setSaved(false)
        try {
          const input: UpdateContactInput = { firstName: contact.firstName, lastName: contact.lastName, email: email.trim() || null, phone: phone.trim() || null, jobTitle: contact.jobTitle, department: contact.department, role: contact.role, influenceLevel: contact.influenceLevel, relationshipStrength: contact.relationshipStrength, preferredChannel: channel || null, preferredLanguage: contact.preferredLanguage, consentSalesContact: contact.consentSalesContact, marketingOptIn: marketing, marketingConsentReason: consentChanged ? reason.trim() : null, notes: contact.notes, trainingAllowed: contact.trainingAllowed, metadata: contact.metadata }
          const next = await updateContact(contactId, input, contact.editVersion)
          setContact(next); setReason(""); setSaved(true); onSaved?.(next)
        } catch (cause) { setError(cause instanceof Error ? cause.message : t("Your changes could not be saved. Try again.")) }
        finally { setSaving(false) }
      }}>
        <label className="grid gap-1.5 text-[12px]" htmlFor={`${id}-email`}>{t("Work email")}<Input id={`${id}-email`} type="email" value={email} onChange={event => setEmail(event.target.value)} disabled={saving} /></label>
        <label className="grid gap-1.5 text-[12px]" htmlFor={`${id}-phone`}>{t("Phone")}<Input id={`${id}-phone`} type="tel" value={phone} onChange={event => setPhone(event.target.value)} disabled={saving} /></label>
        <label className="grid gap-1.5 text-[12px]" htmlFor={`${id}-channel`}>{t("Preferred channel")}<select id={`${id}-channel`} value={channel} onChange={event => setChannel(event.target.value)} disabled={saving} className="h-9 rounded-[var(--md-radius-md)] bg-[var(--md-surface-soft)] px-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-ring)]">
          <option value="">{t("Not recorded")}</option>{[["email", "Email"], ["phone", "Phone"], ["sms", "SMS"], ["whatsapp", "WhatsApp"]].map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}
          {channel && !["email", "phone", "sms", "whatsapp"].includes(channel) ? <option value={channel}>{channel}</option> : null}
        </select></label>
        <div className="flex items-center justify-between gap-3 border-t border-[var(--md-line)] pt-3"><label htmlFor={`${id}-marketing`} className="text-[12px]">{t("Marketing consent")}<span className="mt-1 block text-[11px] text-[var(--md-subtle)]">{t(marketing ? "Opted in" : "Opted out")}</span></label><Switch id={`${id}-marketing`} checked={marketing} onCheckedChange={value => { setMarketing(value); setSaved(false) }} disabled={saving} /></div>
        {contact.marketingConsentSource ? <p className="text-[11px] text-[var(--md-subtle)]">{t("Consent source")}: <span data-i18n-skip>{contact.marketingConsentSource}</span></p> : null}
        {consentChanged ? <label className="grid gap-1.5 text-[12px]" htmlFor={`${id}-reason`}>{t("Consent source or reason")}<Input id={`${id}-reason`} value={reason} onChange={event => setReason(event.target.value)} required disabled={saving} /><span className="text-[11px] text-[var(--md-subtle)]">{t("Record the person's permission or opt-out request.")}</span></label> : null}
        <div className="flex items-center justify-between gap-2 pt-1"><p role="status" className="text-[11px] text-[var(--md-subtle)]">{saved ? t("Contact details saved") : previewContact ? t("Component preview") : ""}</p><Button type="submit" size="sm" disabled={saving || Boolean(previewContact) || (consentChanged && !reason.trim())}>{t(saving ? "Saving…" : "Save changes")}</Button></div>
      </form> : null}
    </PopoverContent>
  </Popover>
}
