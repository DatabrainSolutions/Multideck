import { ContactEmailAction } from "@/components/multideck/contact-email-action"
import { ContactPreferencesPopover } from "@/components/multideck/contact-preferences-popover"
import { useEffect, useId, useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import { ArrowLeft, ArrowUpRight, Building2, Mail, Phone } from "@/components/icons/hugeicons"
import { Button } from "@/components/ui/button"
import { CompactSectionShell } from "./quote-details/quote-detail-fields"
import { useLanguage } from "@/i18n/language-provider"
import { CustomerApiError, getCustomer, type ApiCustomerDetail } from "@/lib/customer-api"
import { mdMotion } from "@/lib/motion"

export type BookingCustomer = Pick<ApiCustomerDetail, "id" | "name" | "accountCode" | "address" | "engagement" | "metadata" | "contacts">
type CustomerLoader = (id: string, options?: { forceRefresh?: boolean }) => Promise<BookingCustomer>
type CustomerState = { id: string; data?: BookingCustomer; error?: string }
const channelLabels: Record<string, string> = { email: "Email", phone: "Phone", sms: "SMS", whatsapp: "WhatsApp" }
const actionClass = "inline-flex min-h-8 items-center gap-1.5 rounded-[var(--md-radius-md)] text-[12px] text-[var(--md-accent)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--md-accent)]"

// Encode the address as data, so saved text cannot inject mail headers or another URL scheme.
export function customerContactHref(kind: "email" | "phone", value: string | null | undefined) {
  const text = value?.trim()
  if (!text || /[\r\n]/.test(text)) return null
  if (kind === "email") return /^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(text) ? `mailto:${encodeURIComponent(text).replace(/%40/g, "@")}` : null
  return /^\+?[\d\s().-]+$/.test(text) && /\d/.test(text) ? `tel:${text.replace(/[\s().-]/g, "")}` : null
}

export function BookingCustomerPanel({ customerId, customerName, contactId, onAssignCustomer, loadCustomer = getCustomer, reducedMotion = false }: {
  customerId?: string | null
  customerName?: string | null
  contactId?: string | null
  onAssignCustomer?: () => void
  loadCustomer?: CustomerLoader
  reducedMotion?: boolean
}) {
  const { t } = useLanguage()
  const prefersReducedMotion = useReducedMotion()
  const [state, setState] = useState<CustomerState | null>(null)
  const [retry, setRetry] = useState(0)
  const panelId = useId()
  const [selection, setSelection] = useState<{ customerId: string; contactId: string } | null>(null)
  useEffect(() => {
    if (!customerId) return
    setSelection(null)
    let current = true
    setState({ id: customerId })
    loadCustomer(customerId, { forceRefresh: retry > 0 }).then(data => {
      if (data.id !== customerId) throw new Error("Customer identity mismatch")
      if (current) setState({ id: customerId, data })
    }).catch(error => {
      if (current) setState({ id: customerId, error: error instanceof CustomerApiError && error.status === 403 ? "You don’t have access to this customer." : "Customer details unavailable." })
    })
    return () => { current = false }
  }, [customerId, loadCustomer, retry])
  // Check during render as well as in the effect: a changed ID must never reveal the old account.
  const active = state?.id === customerId ? state : null
  const customer = active?.data
  const engagement = customer?.engagement
  const contacts = customer?.contacts.filter(contact => contact.accountId === customer.id) ?? []
  const selectedContact = selection?.customerId === customerId ? contacts.find(contact => contact.id === selection?.contactId) : undefined
  useEffect(() => {
    if (selectedContact) document.getElementById(`${panelId}-back`)?.focus()
  }, [selectedContact?.id, panelId])
  function backToCustomer() {
    const id = selectedContact?.id
    setSelection(null)
    requestAnimationFrame(() => document.getElementById(`${panelId}-${id}`)?.focus())
  }
  const orderedContacts = [...contacts].sort((a, b) => Number(b.id === contactId) - Number(a.id === contactId))
  function contactAction(kind: "email" | "phone", value: string | null | undefined, name: string) {
    const href = customerContactHref(kind, value)
    if (!href) return null
    if (kind === "email") return <ContactEmailAction email={value!.trim()} name={name} className={`${actionClass}${selectedContact ? " size-8 justify-center bg-[var(--md-accent-a10)]" : ""}`}><Mail className="size-3.5 shrink-0" />{!selectedContact ? <span data-i18n-skip>{value}</span> : null}</ContactEmailAction>
    const Icon = Phone
    return <a className={`${actionClass}${selectedContact ? " size-8 justify-center bg-[var(--md-accent-a10)]" : ""}`} href={href} title={value ?? undefined} aria-label={`${t("Call")} ${name}${selectedContact ? `: ${value}` : ""}`}><Icon aria-hidden="true" className="size-3.5 shrink-0" />{!selectedContact ? <span className="break-all" data-i18n-skip>{value}</span> : null}</a>
  }
  return <CompactSectionShell title="Customer" className="h-full" contentClassName="min-h-52" action={customer ? <div className="flex items-center gap-3">{selectedContact ? <button id={`${panelId}-back`} type="button" className={actionClass} onClick={backToCustomer} aria-label={t("Back to customer")}><ArrowLeft className="size-3.5" aria-hidden="true" />{t("Back")}</button> : null}<a className={actionClass} href={selectedContact ? `/crm/contacts/${encodeURIComponent(selectedContact.id)}` : `/crm/accounts/${encodeURIComponent(customer.id)}`} target="_blank" rel="noopener noreferrer" aria-label={t(selectedContact ? "Contact profile" : "Open customer account in a new tab")}><span>{t(selectedContact ? "Profile" : "Account")}</span><ArrowUpRight aria-hidden="true" className="size-3.5" /></a></div> : undefined}>
    {!customerId ? <div className="flex min-h-48 flex-col items-center justify-center gap-2 text-center">
      <div data-customer-empty-visual aria-hidden="true" className="h-12" />
      <p className="text-[13px] font-medium">{t(customerName ? "Customer not linked" : "No customer assigned")}</p>
      {customerName ? <p className="text-[12px] text-[var(--md-subtle)]" data-i18n-skip>{customerName}</p> : null}
      {onAssignCustomer ? <Button variant="outline" size="sm" onClick={onAssignCustomer}>{t(customerName ? "Link customer" : "Assign customer")}</Button> : null}
    </div> : active?.error ? <div className="flex min-h-48 flex-col items-start justify-center gap-2"><p role="alert" className="text-[12px] text-[var(--md-subtle)]">{t(active.error)}</p><Button variant="outline" size="sm" onClick={() => setRetry(value => value + 1)}>{t("Try again")}</Button></div> : !customer ? <div className="min-h-48 py-3" role="status" aria-busy="true"><p className="text-[12px] text-[var(--md-subtle)]">{t("Loading customer…")}</p></div> : <motion.div key={`${customer.id}-${selectedContact?.id ?? "customer"}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={prefersReducedMotion || reducedMotion ? { duration: 0 } : mdMotion.micro} className="grid gap-3">
      <div className="flex min-w-0 items-start gap-2.5">
        <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-[var(--md-radius-lg)] bg-[var(--md-accent-a10)] text-[var(--md-accent)]">{selectedContact ? <span className="text-[12px] font-medium" data-i18n-skip>{selectedContact.name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("")}</span> : <Building2 className="size-4" />}</span>
        <div className="min-w-0 flex-1">
          <p className="break-words text-[14px] font-medium" data-i18n-skip>{selectedContact?.name ?? customer.name}</p>
          {selectedContact ? (selectedContact.jobTitle || selectedContact.role ? <p className="mt-0.5 text-[11px] text-[var(--md-subtle)]" data-i18n-skip>{selectedContact.jobTitle || selectedContact.role}</p> : null) : customer.accountCode ? <p className="mt-0.5 text-[11px] text-[var(--md-subtle)]" data-i18n-skip>{customer.accountCode}</p> : null}
          {!selectedContact ? <><div className="flex flex-wrap gap-x-4">{contactAction("email", customer.address?.mainEmail, customer.name)}{contactAction("phone", customer.address?.mainPhone, customer.name)}</div>{!customer.address?.mainEmail ? <p className="mt-1 text-[12px] text-[var(--md-subtle)]">{t("No account email saved")}</p> : null}</> : !selectedContact.email && !selectedContact.phone ? <p className="mt-1 text-[12px] text-[var(--md-subtle)]">{t("No contact details saved")}</p> : null}
        </div>
        {selectedContact ? <div className="flex shrink-0 gap-1.5">{contactAction("email", selectedContact.email, selectedContact.name)}{contactAction("phone", selectedContact.phone, selectedContact.name)}</div> : null}
      </div>
      {selectedContact ? <div className="grid gap-1.5">
        <p className="text-[12px]">{t("Preferred channel")}: {selectedContact.preferredChannel ? t(channelLabels[selectedContact.preferredChannel] || selectedContact.preferredChannel) : t("Not recorded")}</p>
        <p className="text-[12px] text-[var(--md-subtle)]">{t(selectedContact.consentMarketing ? "Marketing opted in" : "Marketing opted out")}</p>
        <ContactPreferencesPopover contactId={selectedContact.id} name={selectedContact.name} onSaved={() => setRetry(value => value + 1)} />
      </div> : null}
      {engagement?.doNotOverContact || engagement?.notes?.trim() ? <div className="grid gap-1.5"><h4 className="text-[11px] font-medium text-[var(--md-subtle)]">{t("Company message rules")}</h4>
        {engagement.doNotOverContact ? <p className="text-[12px]">{t("Allow time between non-urgent messages")}: {engagement.minHoursBetweenNonUrgentMessages} {t("hours")}</p> : null}
        {engagement.notes?.trim() ? <p className="text-[12px]" data-i18n-skip>{engagement.notes}</p> : null}
      </div> : null}
      {!selectedContact ? <div><h4 className="mb-2 text-[11px] font-medium text-[var(--md-subtle)]">{t("Contacts")}</h4>{orderedContacts.length ? <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto p-0.5">{orderedContacts.map(contact => <button key={contact.id} id={`${panelId}-${contact.id}`} type="button" onClick={() => setSelection({ customerId: customer.id, contactId: contact.id })} className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-[var(--md-surface-tint)] px-3 text-[12px] shadow-[var(--md-shadow-line)] transition-colors hover:bg-[var(--md-accent-a10)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--md-accent)]" aria-label={`${t("View contact")}: ${contact.name}`}><span data-i18n-skip>{contact.name}</span>{contact.id === contactId ? <span className="size-1.5 rounded-full bg-[var(--md-accent)]" role="img" aria-label={t("Booking contact")} /> : null}</button>)}</div> : <p className="text-[12px] text-[var(--md-subtle)]">{t("No contacts linked")}</p>}</div> : null}
    </motion.div>}
  </CompactSectionShell>
}
