import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { AiBrain, ArrowLeft, ArrowLeftRight, ArrowRight, BriefcaseBusiness, Building2, CalendarDays, Languages, Mail, Phone, Plus, RefreshCw, Trash2, UsersRound } from "@/components/icons/hugeicons"
import { toast } from "sonner"
import { CopyableField } from "@/components/multideck/copyable-field"
import { CrmDetailOverviewShader } from "@/components/multideck/crm-detail-overview-shader"
import { CustomerAvatar } from "@/components/multideck/customer-components"
import { DotGridLoaderPanel } from "@/components/multideck/dot-grid-loader"
import { InlineField, InlineFieldCard, InlineSelectField, InlineSwitchField } from "@/components/multideck/inline-field"
import { MarketingOptInControl } from "@/components/multideck/marketing-opt-in-control"
import { Surface } from "@/components/multideck/surface"
import { StatusPill } from "@/components/multideck/status-pill"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useLanguage } from "@/i18n/language-provider"
import { CustomerApiError, getContact, listAccountsPage, transferContact, updateContact, type ApiContactDetail, type ApiCustomer, type UpdateContactInput } from "@/lib/customer-api"

type CustomField = { id: string; label: string; value: string }
type ContactDraft = UpdateContactInput & { customFields: CustomField[] }
type Translate = (value: string) => string

/**
 * CRM keeps these as stable codes. Presentation translates their meaning while
 * edits continue to use the untouched value supplied by the API.
 */
const contactValueLabels: Record<string, string> = {
  decision_maker: "Decision maker",
  decisionmaker: "Decision maker",
  influencer: "Influencer",
  champion: "Champion",
  gatekeeper: "Gatekeeper",
  finance: "Finance",
  operations: "Operations",
  procurement: "Procurement",
  high: "High",
  medium: "Medium",
  low: "Low",
  email: "Email",
  phone: "Phone",
  sms: "SMS",
  whatsapp: "WhatsApp",
  contact_card: "Contact card",
  manual_override: "Manual override",
  manual_entry: "Manual entry",
  web_form: "Web form",
  public_form: "Public form",
  imported: "Imported",
  import: "Imported",
  legitimate_interest: "Legitimate interest",
  consent: "Consent",
  opted_in: "Opted in",
  opted_out: "Opted out",
  granted: "Granted",
  revoked: "Revoked",
  pending: "Pending",
  unknown: "Unknown",
}

const unsetContactValue = "__not_recorded__"

const contactRoleOptions = [
  { value: unsetContactValue, label: "Not recorded" },
  { value: "decision_maker", label: "Decision maker" },
  { value: "champion", label: "Champion" },
  { value: "influencer", label: "Influencer" },
  { value: "gatekeeper", label: "Gatekeeper" },
  { value: "stakeholder", label: "Stakeholder" },
  { value: "procurement", label: "Procurement" },
  { value: "finance", label: "Finance" },
  { value: "operations", label: "Operations" },
] as const

const contactInfluenceOptions = [
  { value: unsetContactValue, label: "Not recorded" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
] as const

const contactChannelOptions = [
  { value: unsetContactValue, label: "Not recorded" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "sms", label: "SMS" },
  { value: "whatsapp", label: "WhatsApp" },
] as const

const contactLanguageOptions = [
  { value: unsetContactValue, label: "Not recorded" },
  { value: "en-GB", label: "British English" },
  { value: "en-US", label: "American English" },
] as const

function includeCurrentOption(
  options: readonly { value: string; label: string }[],
  value: string | null,
  label: string | null,
) {
  if (!value || options.some((option) => option.value === value)) return options
  return [{ value, label: label ?? value }, ...options]
}

const languageCodeAliases: Record<string, string> = {
  english: "en",
}

export function CrmContactDetailPage({ contactId, navigate }: { contactId: string; navigate: (path: string) => void }) {
  const { language, t } = useLanguage()
  const [contact, setContact] = useState<ApiContactDetail | null>(null)
  const [state, setState] = useState<"loading" | "ready" | "error">("loading")
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [consentOpen, setConsentOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  const contactRef = useRef<ApiContactDetail | null>(null)
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())

  useEffect(() => {
    contactRef.current = contact
  }, [contact])

  useEffect(() => {
    let active = true
    setState("loading")
    setError(null)
    getContact(contactId).then((data) => { if (active) { setContact(data); setState("ready") } }).catch((cause) => {
      if (!active) return
      setError(cause instanceof Error ? cause.message : t("This contact could not be loaded. Check your connection and try again."))
      setState("error")
    })
    return () => { active = false }
  }, [contactId, reloadToken, t])

  /**
   * One field's change, sent as a complete record because the endpoint takes the
   * whole shape. Saves are serialised and rebuilt from the latest confirmed
   * response, so rapid edits cannot finish out of order. It throws on failure:
   * the field that was edited catches it and shows the reason itself.
   */
  const patch = useCallback((change: Partial<ContactDraft>) => {
    const save = saveQueueRef.current.then(async () => {
      const current = contactRef.current
      if (!current) return
      const next = { ...toDraft(current), ...change }
      const metadata = {
        ...next.metadata,
        customFields: Object.fromEntries(next.customFields.filter((field) => field.label.trim()).map((field) => [field.label.trim(), field.value.trim()])),
      }
      try {
        const updated = await updateContact(contactId, { ...next, metadata }, current.editVersion)
        contactRef.current = updated
        setContact(updated)
      } catch (cause) {
        if (!(cause instanceof CustomerApiError) || cause.status !== 409) throw cause
        try {
          const latest = await getContact(contactId, { forceRefresh: true })
          contactRef.current = latest
          setContact(latest)
          throw new CustomerApiError(t("This contact changed elsewhere. Your edit was not saved; the latest version is now shown."), 409)
        } catch (refreshCause) {
          if (refreshCause instanceof CustomerApiError && refreshCause.status === 409) throw refreshCause
          throw new CustomerApiError(t("This contact changed elsewhere. Your edit was not saved. Reload to see the latest version."), 409)
        }
      }
    })
    saveQueueRef.current = save.catch(() => undefined)
    return save
  }, [contactId, t])

  if (state === "loading") return <div className="md-page"><Surface padding="lg" className="grid min-h-[320px] place-items-center rounded-[var(--md-radius-xl)]"><DotGridLoaderPanel label="Loading contact" minHeight={0} /></Surface></div>
  if (state === "error" || !contact) return <div className="md-page md-page-stack"><Button variant="ghost" className="w-fit" onClick={() => navigate("/crm/contacts")}><ArrowLeft className="size-4 rtl:rotate-180" />{t("Back to contacts")}</Button><PageState icon={<RefreshCw className="size-6" />} title={t("Contact unavailable")} detail={error ?? undefined} action={<Button variant="outline" onClick={() => setReloadToken((value) => value + 1)}>{t("Try again")}</Button>} embedded /></div>

  const actionHref = contact.email ? `mailto:${contact.email}` : undefined
  const currentContact = contact
  const customFields = crmCustomFields(currentContact.metadata)
  const roleLabel = localizeContactValue(contact.role, t)
  const influenceLabel = localizeContactValue(contact.influenceLevel, t)
  const channelLabel = localizeContactValue(contact.preferredChannel, t)
  const preferredLanguageLabel = localizeLanguageValue(contact.preferredLanguage, language, t)
  const roleOptions = includeCurrentOption(contactRoleOptions, currentContact.role, roleLabel)
  const influenceOptions = includeCurrentOption(contactInfluenceOptions, currentContact.influenceLevel, influenceLabel)
  const channelOptions = includeCurrentOption(contactChannelOptions, currentContact.preferredChannel, channelLabel)
  const languageOptions = includeCurrentOption(contactLanguageOptions, currentContact.preferredLanguage, preferredLanguageLabel)

  const overviewRows = [
    { key: "account", label: t("Account"), value: contact.accountName, icon: Building2, direction: "auto" as const },
    { key: "email", label: t("Work email"), value: contact.email, icon: Mail, href: contact.email ? `mailto:${contact.email}` : null, direction: "ltr" as const },
    { key: "phone", label: t("Phone"), value: contact.phone, icon: Phone, href: contact.phone ? `tel:${contact.phone}` : null, direction: "ltr" as const },
    { key: "role", label: t("Relationship role"), value: roleLabel, icon: UsersRound, direction: "auto" as const },
    { key: "influence", label: t("Influence"), value: influenceLabel, icon: UsersRound, direction: "auto" as const },
    { key: "job-title", label: t("Job title"), value: contact.jobTitle, icon: BriefcaseBusiness, direction: "auto" as const },
    { key: "preferred-channel", label: t("Preferred channel"), value: channelLabel, icon: Mail, direction: "auto" as const },
    { key: "preferred-language", label: t("Preferred language"), value: preferredLanguageLabel, icon: Languages, direction: "auto" as const },
    { key: "last-contact", label: t("Last contact"), value: contact.lastContactAt ? relativeDate(contact.lastContactAt, language) : null, icon: CalendarDays, direction: "auto" as const },
  ]

  return <div className="md-page">
    <div className="grid items-start gap-[var(--md-page-stack-gap)] xl:grid-cols-[minmax(0,1fr)_400px] 2xl:grid-cols-[minmax(0,1fr)_440px]">
      <Surface padding="none" className="min-w-0 overflow-hidden rounded-[var(--md-radius-xl)]">
        <header className="px-5 py-5 shadow-[var(--md-stroke-bottom)] sm:px-6">
          <Button type="button" variant="ghost" className="-ms-2 mb-4 h-8 w-fit rounded-[var(--md-radius-md)] px-2 text-[12px] font-medium text-[var(--md-text)] hover:bg-[var(--md-surface-tint)]" onClick={() => navigate("/crm/contacts")}><ArrowLeft data-icon="inline-start" className="size-3.5" strokeWidth={1.3} />{t("Back to contacts")}</Button>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3.5"><CustomerAvatar initials={contact.initials} tone="blue" size="lg" className="size-14 rounded-full text-[18px]" /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><CopyableField label={t("Contact")} value={contact.name} className="-my-1"><h1 className="truncate text-[24px] font-medium leading-8 text-[var(--md-ink)]" data-i18n-skip dir="auto">{contact.name}</h1></CopyableField><StatusPill tone={contact.consentMarketing ? "green" : "neutral"}>{t(contact.consentMarketing ? "Marketing opted in" : "Marketing opted out")}</StatusPill>{contact.consentSalesContact ? <StatusPill tone="teal">{t("Sales contact allowed")}</StatusPill> : null}</div><button type="button" onClick={() => navigate(`/crm/accounts/${contact.accountId}`)} className="mt-2 inline-flex items-center gap-1.5 rounded-[var(--md-radius-sm)] text-[13px] font-medium text-[var(--md-accent)] hover:text-[var(--md-ink)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]"><span data-i18n-skip dir="auto">{contact.accountName}</span><ArrowRight data-icon="inline-end" className="size-3.5" strokeWidth={1.4} /></button><p className="mt-2 text-[13px] text-[var(--md-text)]" data-i18n-skip dir="auto">{[contact.jobTitle || roleLabel, contact.department, contact.location].filter(Boolean).join(" · ") || t("No role or location recorded")}</p></div></div>
            <div className="flex flex-wrap gap-2">{actionHref ? <Button asChild variant="outline"><a href={actionHref}><Mail className="size-4" strokeWidth={1.5} />{t("Email")}</a></Button> : null}{contact.phone ? <Button asChild variant="outline"><a href={`tel:${contact.phone}`}><Phone className="size-4" strokeWidth={1.5} />{t("Call")}</a></Button> : null}</div>
          </div>
        </header>

        <Panel title={t("Recent emails")} meta={contact.recentEmails.available ? String(contact.recentEmails.items.length) : t("Permission required")}>
          {!contact.recentEmails.available ? <Empty text={t("You need email access to see conversations with this contact.")} /> : contact.recentEmails.items.length ? contact.recentEmails.items.map((email, index) => <button key={email.id} type="button" onClick={() => navigate(`/inbox?thread=${email.threadId}`)} className={`group flex w-full items-start gap-3 px-5 py-4 text-start hover:bg-[var(--md-surface-soft)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-[var(--md-accent-a14)] ${index ? "border-t border-[var(--md-line)]" : ""}`}><span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-[var(--md-radius-md)] ${email.direction === "inbound" ? "bg-[var(--md-accent-a11)] text-[var(--md-accent)]" : "bg-[var(--md-surface-tint)] text-[var(--md-text)]"}`}><Mail className="size-4" strokeWidth={1.4} /></span><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-4"><span className="truncate text-[14px] font-medium text-[var(--md-ink)]">{email.subject}</span><span className="shrink-0 text-[12px] tabular-nums text-[var(--md-subtle)]">{relativeDate(email.occurredAt, language)}</span></span>{email.preview ? <span className="mt-1 block truncate text-[12px] text-[var(--md-text)]">{email.preview}</span> : null}</span><ArrowRight className="mt-2 size-4 text-[var(--md-subtle)] transition-transform duration-150 group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5 motion-reduce:transition-none" strokeWidth={1.4} /></button>) : <Empty text={t("No recent emails are linked to this contact.")} />}
        </Panel>
        <Panel title={t("Activity")} meta={contact.activities.length ? t("Newest first") : undefined}>{contact.activities.length ? contact.activities.map((activity, index) => <div key={activity.id} className={`grid grid-cols-[10px_minmax(0,1fr)_auto] gap-3 px-5 py-4 ${index ? "border-t border-[var(--md-line)]" : ""}`}><span className="mt-1.5 size-2 rounded-full bg-[var(--md-accent)] shadow-[0_0_0_4px_var(--md-accent-a08)]" /><div><p className="text-[14px] font-medium text-[var(--md-ink)]">{activity.subject}</p>{activity.summary ? <p className="mt-1 text-[13px] leading-5 text-[var(--md-text)]">{activity.summary}</p> : null}</div><p className="shrink-0 text-[12px] tabular-nums text-[var(--md-subtle)]">{relativeDate(activity.occurredAt, language)}</p></div>) : <Empty text={t("No activity has been recorded for this contact yet.")} />}</Panel>
        <div className="grid gap-[var(--md-page-stack-gap)] px-5 py-5 shadow-[var(--md-stroke-top)] sm:px-6">
          <InlineFieldCard title="Who they are" directEdit>
            <InlineField label="First name" value={currentContact.firstName ?? ""} required={!currentContact.lastName} onSave={(firstName) => patch({ firstName: firstName || null })} />
            <InlineField label="Last name" value={currentContact.lastName ?? ""} required={!currentContact.firstName} onSave={(lastName) => patch({ lastName: lastName || null })} />
            <InlineField label="Job title" value={currentContact.jobTitle ?? ""} onSave={(jobTitle) => patch({ jobTitle: jobTitle || null })} />
            <InlineField label="Department" value={currentContact.department ?? ""} onSave={(department) => patch({ department: department || null })} />
            <InlineSelectField label="Role" value={currentContact.role ?? unsetContactValue} options={roleOptions} onSave={(role) => patch({ role: role === unsetContactValue ? null : role })} />
            <InlineSelectField label="Influence" value={currentContact.influenceLevel ?? unsetContactValue} options={influenceOptions} onSave={(influenceLevel) => patch({ influenceLevel: influenceLevel === unsetContactValue ? null : influenceLevel })} />
            <InlineField
              label="Relationship"
              kind="number"
              hint="0 to 100"
              value={currentContact.relationshipStrength == null ? "" : String(currentContact.relationshipStrength)}
              onSave={(value) => patch({ relationshipStrength: value === "" ? null : Math.max(0, Math.min(100, Number(value) || 0)) })}
            />
          </InlineFieldCard>

          <InlineFieldCard title="How to reach them" directEdit>
            <InlineField label="Work email" kind="email" placeholder="name@example.com" value={currentContact.email ?? ""} onSave={(email) => patch({ email: email || null })} />
            <InlineField label="Phone" kind="tel" value={currentContact.phone ?? ""} onSave={(phone) => patch({ phone: phone || null })} />
            <InlineSelectField label="Preferred channel" value={currentContact.preferredChannel ?? unsetContactValue} options={channelOptions} onSave={(preferredChannel) => patch({ preferredChannel: preferredChannel === unsetContactValue ? null : preferredChannel })} />
            <InlineSelectField label="Language" value={currentContact.preferredLanguage ?? unsetContactValue} options={languageOptions} onSave={(preferredLanguage) => patch({ preferredLanguage: preferredLanguage === unsetContactValue ? null : preferredLanguage })} />
            <InlineField label="Last contact" value={currentContact.lastContactAt ? relativeDate(currentContact.lastContactAt, language) : ""} readOnly />
          </InlineFieldCard>

          <InlineFieldCard title="Notes" directEdit>
            <InlineField
              label="Internal notes"
              kind="textarea"
              align="start"
              value={currentContact.notes ?? ""}
              placeholder="What would help whoever speaks to them next?"
              onSave={(notes) => patch({ notes: notes || null })}
            />
          </InlineFieldCard>

          {/* Consent is the one thing that does not save on a toggle. A change is
              recorded against your name, so it asks what it was based on first. */}
          <InlineFieldCard
            title="Consent and privacy"
            directEdit
            action={<Button type="button" variant="ghost" className="h-8 rounded-[var(--md-radius-md)] px-2 text-[12px] active:scale-[0.96] motion-reduce:transform-none" onClick={() => setConsentOpen(true)}>{t("Change marketing")}</Button>}
          >
            <InlineField label="Marketing" value={t(currentContact.consentMarketing ? "Opted in" : "Opted out")} readOnly />
            <InlineField label="Source" value={localizeContactValue(currentContact.marketingConsentSource, t) ?? ""} readOnly />
            <InlineSwitchField label="Allow direct sales contact" checked={currentContact.consentSalesContact} onSave={(consentSalesContact) => patch({ consentSalesContact })} />
            <InlineSwitchField icon={AiBrain} label="Allow AI training on approved data" checked={currentContact.trainingAllowed} onSave={(trainingAllowed) => patch({ trainingAllowed })} />
          </InlineFieldCard>

          <InlineFieldCard title="Additional fields" meta={customFields.length ? String(customFields.length) : undefined} directEdit>
            {customFields.map((field) => (
              <div key={field.id} className="group grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                <InlineField label={field.label} value={field.value} onSave={(value) => patch({ customFields: customFields.map((item) => item.id === field.id ? { ...item, value } : item) })} />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`${t("Remove")} ${field.label}`}
                  className="mt-0.5 size-7 shrink-0 rounded-[var(--md-radius-sm)] text-[var(--md-subtle)] opacity-0 transition-opacity duration-150 hover:text-[var(--md-red)] focus-visible:opacity-100 group-hover:opacity-100"
                  onClick={() => void patch({ customFields: customFields.filter((item) => item.id !== field.id) }).catch((cause) => toast.error(cause instanceof Error ? cause.message : t("That field could not be removed.")))}
                >
                  <Trash2 className="size-3.5" strokeWidth={1.5} />
                </Button>
              </div>
            ))}
            <AddCustomField onAdd={(label, value) => patch({ customFields: [...customFields, { id: label, label, value }] })} />
          </InlineFieldCard>
        </div>


        <Panel
          title={t("Employment history")}
          meta={String(contact.employmentHistory.length)}
          action={<Button type="button" variant="outline" className="h-8 px-2.5 text-[12px]" onClick={() => setTransferOpen(true)}><ArrowLeftRight className="size-3.5" strokeWidth={1.4} />{t("Move to another company")}</Button>}
        >
          {contact.employmentHistory.length ? contact.employmentHistory.map((item, index) => (
            <div key={item.id} className={`grid gap-2 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:px-6 ${index ? "border-t border-[var(--md-line)]" : ""}`}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className="truncate text-start text-[14px] font-medium text-[var(--md-ink)] hover:text-[var(--md-accent)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]" onClick={() => navigate(`/crm/accounts/${item.organisationId}`)} data-i18n-skip dir="auto">{item.organisationName}</button>
                  {item.isCurrent ? <StatusPill tone="green">{t("Current employer")}</StatusPill> : null}
                </div>
                <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]" dir="auto">{[item.jobTitle, item.department, localizeContactValue(item.role, t)].filter(Boolean).join(" · ") || t("No role recorded")}</p>
              </div>
              <p className="text-[12px] tabular-nums text-[var(--md-subtle)]"><span dir="ltr">{formatDate(item.startedAt, language)}</span> – <span dir="ltr">{item.endedAt ? formatDate(item.endedAt, language) : t("Present")}</span></p>
            </div>
          )) : <Empty text={t("No employer history has been recorded yet.")} />}
        </Panel>

        <Panel title={t("Email history")} meta={String(contact.emailHistory.length)}>
          {contact.emailHistory.length ? contact.emailHistory.map((item, index) => (
            <div key={item.id} className={`grid gap-2 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:px-6 ${index ? "border-t border-[var(--md-line)]" : ""}`}>
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <a href={`mailto:${item.email}`} className="min-w-0 break-all text-[14px] font-medium text-[var(--md-accent)] hover:underline" dir="ltr" data-i18n-skip>{item.email}</a>
                <StatusPill tone={item.isActive ? "green" : "neutral"}>{t(item.isActive ? (item.isPrimary ? "Current primary" : "Active") : "Retired")}</StatusPill>
              </div>
              <p className="text-[12px] tabular-nums text-[var(--md-subtle)]"><span dir="ltr">{formatDate(item.validFrom, language)}</span> – <span dir="ltr">{item.validTo ? formatDate(item.validTo, language) : t("Present")}</span></p>
            </div>
          )) : <Empty text={t("No email history has been recorded yet.")} />}
        </Panel>

        {contact.consentHistory.length ? <Panel title={t("Consent history")} meta={String(contact.consentHistory.length)}><div className="px-5 pb-4">{contact.consentHistory.map((item) => <div key={item.id} className="border-t border-[var(--md-line)] py-3 first:border-t-0"><div className="flex items-center justify-between gap-3"><StatusPill tone={normaliseContactCode(item.status) === "opted_in" ? "green" : "neutral"}>{localizeContactValue(item.status, t) ?? t("Unknown")}</StatusPill><span className="text-[12px] tabular-nums text-[var(--md-subtle)]">{formatDate(item.effectiveAt, language)}</span></div><p className="mt-2 text-[12px] leading-5 text-[var(--md-text)]" dir="auto">{[localizeContactValue(item.source, t), item.reason].filter(Boolean).join(" · ")}</p></div>)}</div></Panel> : null}
      </Surface>

      <aside className="order-first relative min-w-0 self-start overflow-hidden rounded-[var(--md-radius-xl)] bg-[#06030a] px-5 py-5 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_0_0_1px_var(--md-accent-veil-ring-a16),0_16px_36px_var(--md-accent-veil-cast-a18)] xl:order-none xl:sticky xl:top-[76px]" aria-labelledby={`contact-overview-${contact.id}`}>
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 scale-[1.04]"><CrmDetailOverviewShader /></span>
        <div className="relative z-10 [text-shadow:0_1px_10px_rgba(0,0,0,0.32)]">
          <h2 id={`contact-overview-${contact.id}`} className="text-[13px] font-medium text-white/72">{t("Contact details")}</h2>
          <div className="mt-4 flex items-center gap-3">
            <CustomerAvatar initials={contact.initials} tone="blue" className="size-12 rounded-full bg-white/13 text-[15px] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.16)]" />
            <div className="min-w-0"><CopyableField label={t("Contact")} value={contact.name} className="-my-2 min-w-0" contentClassName="min-w-0" buttonClassName="size-6 before:-inset-0.5 [@media(hover:none)]:size-10" tone="inverse"><p className="break-words text-[17px] font-medium leading-6 text-white" data-i18n-skip dir="auto">{contact.name}</p></CopyableField><p className="mt-1 text-[11px] text-white/58" data-i18n-skip dir="auto">{[contact.jobTitle || roleLabel, contact.department].filter(Boolean).join(" · ") || t("Not recorded")}</p></div>
          </div>
          <dl className="mt-3.5">
            {overviewRows.map(({ key, label, value, icon: Icon, href, direction }) => <div key={key} className="grid min-w-0 grid-cols-[20px_minmax(0,1fr)] gap-x-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] first:shadow-none"><Icon className="mt-0.5 size-4 text-white/54" strokeWidth={1.25} aria-hidden="true" /><div className="min-w-0"><dt className="text-[10.5px] text-white/58">{label}</dt><dd className="mt-0.5 min-w-0 text-[12px] font-medium leading-[18px] text-white/90">{value ? <CopyableField label={label} value={value} className="-my-2 max-w-full" contentClassName="max-w-full" buttonClassName="size-6 before:-inset-0.5 [@media(hover:none)]:size-10" tone="inverse">{key === "account" ? <button type="button" onClick={() => navigate(`/crm/accounts/${contact.accountId}`)} className="inline-flex max-w-full items-center gap-1 text-[var(--md-accent-lift-strong)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35"><span className="truncate" data-i18n-skip dir="auto">{value}</span><ArrowRight data-icon="inline-end" className="size-3 shrink-0" strokeWidth={1.3} /></button> : href ? <a href={href} className="inline-flex max-w-full text-[var(--md-accent-lift-strong)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35" dir={direction} data-i18n-skip><span className={key === "phone" ? "whitespace-nowrap" : "[overflow-wrap:anywhere]"}>{value}</span></a> : <span data-i18n-skip dir={direction}>{value}</span>}</CopyableField> : <span className="text-white/48">{t("Not recorded")}</span>}</dd></div></div>)}
          </dl>
        </div>
      </aside>
      <ContactConsentDialog
        open={consentOpen}
        onOpenChange={setConsentOpen}
        current={currentContact.consentMarketing}
        source={currentContact.marketingConsentSource}
        updatedAt={currentContact.marketingConsentUpdatedAt}
        onSave={async (marketingOptIn, marketingConsentReason) => {
          await patch({ marketingOptIn, marketingConsentReason })
          toast.success(t(marketingOptIn ? "Marketing consent recorded" : "Marketing opt-out recorded"))
        }}
      />
      <ContactTransferDialog
        open={transferOpen}
        onOpenChange={setTransferOpen}
        contact={currentContact}
        onTransferred={(updated) => {
          contactRef.current = updated
          setContact(updated)
        }}
      />
    </div>
  </div>
}

/**
 * The only change on this record that cannot happen on a toggle. The endpoint
 * requires a reason, and the reason is what makes the consent trail defensible,
 * so the control asks for it before it will save.
 */
function ContactConsentDialog({ open, onOpenChange, current, source, updatedAt, onSave }: { open: boolean; onOpenChange: (open: boolean) => void; current: boolean; source: string | null; updatedAt: string | null; onSave: (optIn: boolean, reason: string) => Promise<void> }) {
  const { t } = useLanguage()
  const [optIn, setOptIn] = useState(current)
  const [reason, setReason] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (open) { setOptIn(current); setReason("") } }, [open, current])

  const changed = optIn !== current

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-0 bg-[var(--md-surface)] text-[var(--md-ink)] shadow-[var(--md-shadow-lift)] sm:max-w-[520px]">
        <DialogHeader className="text-start">
          <DialogTitle>{t("Marketing consent")}</DialogTitle>
          <DialogDescription>{t("This change is recorded against your name and the time you made it.")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] p-4 shadow-[var(--md-shadow-line)]">
            <MarketingOptInControl checked={optIn} source={source} updatedAt={updatedAt} onCheckedChange={setOptIn} />
          </div>
          <label className="grid gap-1.5 text-[13px] font-medium text-[var(--md-ink)]">
            {t("What is this based on?")}
            <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t("Signed agreement, call on 3 June, web form…")} className="h-10 rounded-[var(--md-radius-md)] bg-[var(--md-surface-soft)] text-base shadow-[var(--md-shadow-line)] sm:text-[14px]" />
            {changed && !reason.trim() ? <span className="text-[11.5px] font-normal text-[var(--md-text)]">{t("Needed before a consent change can be saved.")}</span> : null}
          </label>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>{t("Cancel")}</Button>
          <Button
            type="button"
            disabled={saving || !changed || !reason.trim()}
            className="bg-[var(--md-accent)] text-[var(--md-accent-ink)] active:scale-[0.96] motion-reduce:transform-none"
            onClick={async () => {
              setSaving(true)
              try { await onSave(optIn, reason.trim()); onOpenChange(false) }
              catch (error) { toast.error(error instanceof Error ? error.message : t("The consent change could not be saved.")) }
              finally { setSaving(false) }
            }}
          >
            {t(optIn ? "Record opt-in" : "Record opt-out")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ContactTransferDialog({
  open,
  onOpenChange,
  contact,
  onTransferred,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  contact: ApiContactDetail
  onTransferred: (contact: ApiContactDetail) => void
}) {
  const { t } = useLanguage()
  const [companies, setCompanies] = useState<ApiCustomer[]>([])
  const [targetOrganisationId, setTargetOrganisationId] = useState("")
  const [startedAt, setStartedAt] = useState(() => new Date().toISOString().slice(0, 10))
  const [jobTitle, setJobTitle] = useState(contact.jobTitle ?? "")
  const [department, setDepartment] = useState(contact.department ?? "")
  const [role, setRole] = useState(contact.role ?? "")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let active = true
    setTargetOrganisationId("")
    setStartedAt(new Date().toISOString().slice(0, 10))
    setJobTitle(contact.jobTitle ?? "")
    setDepartment(contact.department ?? "")
    setRole(contact.role ?? "")
    setError(null)
    setLoading(true)
    listAccountsPage({ organisationType: "company", limit: 100, offset: 0 })
      .then((page) => { if (active) setCompanies(page.rows.filter((company) => company.id !== contact.accountId)) })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : t("Companies could not be loaded.")) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [contact.accountId, contact.department, contact.jobTitle, contact.role, open, t])

  async function save() {
    if (!targetOrganisationId || !startedAt) return
    setSaving(true)
    setError(null)
    try {
      const updated = await transferContact(contact.id, {
        targetOrganisationId,
        startedAt,
        jobTitle: jobTitle.trim() || null,
        department: department.trim() || null,
        role: role.trim() || null,
      }, contact.editVersion)
      onTransferred(updated)
      onOpenChange(false)
      toast.success(t("Contact moved and employment history preserved"))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("The contact could not be moved."))
    } finally {
      setSaving(false)
    }
  }

  const fieldClass = "h-10 w-full rounded-[var(--md-radius-md)] border-0 bg-[var(--md-field-bg)] px-3 text-[16px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)] sm:text-[14px]"

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next) }}>
      <DialogContent className="border-0 bg-[var(--md-surface)] text-[var(--md-ink)] shadow-[var(--md-shadow-lift)] sm:max-w-[560px]">
        <DialogHeader className="text-start">
          <DialogTitle>{t("Move contact to another company")}</DialogTitle>
          <DialogDescription>{t("The current employment will be closed on the selected date. Previous employers and email addresses remain in the contact history.")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5 text-[13px] font-medium text-[var(--md-ink)] sm:col-span-2">
            {t("New company")}
            <select value={targetOrganisationId} onChange={(event) => setTargetOrganisationId(event.target.value)} disabled={loading} className={fieldClass}>
              <option value="">{loading ? t("Loading companies…") : t("Select a company")}</option>
              {companies.map((company) => <option key={company.id} value={company.id}>{company.name}{company.accountCode ? ` · ${company.accountCode}` : ""}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5 text-[13px] font-medium text-[var(--md-ink)]">
            {t("Start date")}
            <Input type="date" value={startedAt} onChange={(event) => setStartedAt(event.target.value)} className={fieldClass} dir="ltr" />
          </label>
          <label className="grid gap-1.5 text-[13px] font-medium text-[var(--md-ink)]">
            {t("Job title")}
            <Input value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} className={fieldClass} dir="auto" />
          </label>
          <label className="grid gap-1.5 text-[13px] font-medium text-[var(--md-ink)]">
            {t("Department")}
            <Input value={department} onChange={(event) => setDepartment(event.target.value)} className={fieldClass} dir="auto" />
          </label>
          <label className="grid gap-1.5 text-[13px] font-medium text-[var(--md-ink)]">
            {t("Relationship role")}
            <Input value={role} onChange={(event) => setRole(event.target.value)} className={fieldClass} dir="auto" />
          </label>
          {error ? <p role="alert" className="rounded-[var(--md-radius-md)] bg-[color-mix(in_srgb,var(--md-red)_8%,var(--md-surface))] px-3 py-2 text-[12px] leading-5 text-[var(--md-red)] sm:col-span-2">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>{t("Cancel")}</Button>
          <Button type="button" disabled={saving || loading || !targetOrganisationId || !startedAt} className="bg-[var(--md-accent)] text-[var(--md-accent-ink)]" onClick={() => void save()}>{saving ? t("Moving…") : t("Move contact")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Custom fields live in metadata as a flat map. The label is the identity. */
function crmCustomFields(metadata: Record<string, unknown> | null | undefined) {
  const stored = metadata?.customFields
  const record = stored && typeof stored === "object" ? stored as Record<string, unknown> : {}
  return Object.entries(record).map(([label, value]) => ({ id: label, label, value: typeof value === "string" ? value : String(value) }))
}

function AddCustomField({ onAdd }: { onAdd: (label: string, value: string) => Promise<void> }) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState("")
  const [value, setValue] = useState("")
  const [saving, setSaving] = useState(false)

  if (!open) {
    return (
      <Button type="button" variant="ghost" className="mt-1 h-8 w-fit rounded-[var(--md-radius-md)] px-2 text-[12px] active:scale-[0.96] motion-reduce:transform-none" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" strokeWidth={1.5} />
        {t("Add a field")}
      </Button>
    )
  }

  async function save() {
    if (!label.trim()) return
    setSaving(true)
    try {
      await onAdd(label.trim(), value.trim())
      setLabel(""); setValue(""); setOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("That field could not be added."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-1 grid gap-2 rounded-[var(--md-radius-md)] bg-[var(--md-surface-soft)] p-2 shadow-[var(--md-shadow-line)]">
      <Input autoFocus value={label} onChange={(event) => setLabel(event.target.value)} placeholder={t("Field name")} aria-label={t("Field name")} className="h-8 rounded-[var(--md-radius-sm)] border-0 bg-[var(--md-surface)] text-base shadow-[var(--md-shadow-line)] sm:text-[13px]" />
      <Input value={value} onChange={(event) => setValue(event.target.value)} placeholder={t("Value")} aria-label={t("Value")} className="h-8 rounded-[var(--md-radius-sm)] border-0 bg-[var(--md-surface)] text-base shadow-[var(--md-shadow-line)] sm:text-[13px]" />
      <div className="flex justify-end gap-1.5">
        <Button type="button" variant="ghost" className="h-8 rounded-[var(--md-radius-sm)] px-2 text-[12px]" onClick={() => { setOpen(false); setLabel(""); setValue("") }}>{t("Cancel")}</Button>
        <Button type="button" disabled={saving || !label.trim()} className="h-8 rounded-[var(--md-radius-sm)] bg-[var(--md-accent)] px-2.5 text-[12px] text-[var(--md-accent-ink)] active:scale-[0.96] motion-reduce:transform-none" onClick={() => void save()}>{t("Add field")}</Button>
      </div>
    </div>
  )
}

function toDraft(contact: ApiContactDetail): ContactDraft { const metadata = contact.metadata ?? {}; const fields = metadata.customFields && typeof metadata.customFields === "object" ? metadata.customFields as Record<string, unknown> : {}; return { firstName: contact.firstName, lastName: contact.lastName, email: contact.email, phone: contact.phone, jobTitle: contact.jobTitle, department: contact.department, role: contact.role, influenceLevel: contact.influenceLevel, relationshipStrength: contact.relationshipStrength, preferredChannel: contact.preferredChannel, preferredLanguage: contact.preferredLanguage, consentSalesContact: contact.consentSalesContact, marketingOptIn: contact.consentMarketing, marketingConsentReason: "", notes: contact.notes, trainingAllowed: contact.trainingAllowed, metadata, customFields: Object.entries(fields).map(([label, value]) => ({ id: label, label, value: typeof value === "string" ? value : String(value) })) } }
function comparableDraft(draft: ContactDraft) { return { ...draft, marketingConsentReason: null, customFields: draft.customFields.map(({ label, value }) => ({ label, value })) } }
function Panel({ title, meta, action, children }: { title: string; meta?: string; action?: ReactNode; children: ReactNode }) { return <section className="overflow-hidden shadow-[var(--md-stroke-top)]"><div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6"><h2 className="text-[15px] font-medium text-[var(--md-ink)]">{title}</h2><div className="flex items-center gap-2">{meta ? <span className="text-[12px] text-[var(--md-text)]">{meta}</span> : null}{action}</div></div>{children}</section> }
function Empty({ text }: { text: string }) { return <p className="border-t border-[var(--md-line)] px-5 py-6 text-[13px] leading-5 text-[var(--md-text)]">{text}</p> }
function PageState({ icon, title, detail, action, embedded = false }: { icon: ReactNode; title: string; detail?: string; action?: ReactNode; embedded?: boolean }) { return <div className={embedded ? "" : "md-page"}><Surface padding="lg" className="grid min-h-[320px] place-items-center rounded-[var(--md-radius-xl)] text-center"><div className="max-w-md"><span className="mx-auto grid size-11 place-items-center rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] text-[var(--md-accent)]">{icon}</span><p className="mt-4 text-[15px] font-medium text-[var(--md-ink)]">{title}</p>{detail ? <p className="mt-2 text-[13px] leading-5 text-[var(--md-text)]">{detail}</p> : null}{action ? <div className="mt-4">{action}</div> : null}</div></Surface></div> }

function normaliseContactCode(value: string) {
  return value.trim().toLocaleLowerCase("en").replace(/[\s-]+/g, "_")
}

function localizeContactValue(value: string | null | undefined, t: Translate) {
  if (!value?.trim()) return null
  const code = normaliseContactCode(value)
  const readable = contactValueLabels[code] ?? code.replace(/_/g, " ").replace(/^./, (letter) => letter.toUpperCase())
  return t(readable)
}

function localizeLanguageValue(value: string | null | undefined, language: string, t: Translate) {
  if (!value?.trim()) return null
  const stored = value.trim()
  const languageCode = languageCodeAliases[normaliseContactCode(stored)] ?? stored.replace(/_/g, "-")
  try {
    return new Intl.DisplayNames([language], { type: "language" }).of(languageCode) ?? localizeContactValue(stored, t)
  } catch {
    return localizeContactValue(stored, t)
  }
}

function formatDate(value: string, language: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(language, { day: "numeric", month: "short", year: "numeric" }).format(date)
}

function relativeDate(value: string, language: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const days = Math.round((date.getTime() - Date.now()) / 86_400_000)
  if (Math.abs(days) < 30) return new Intl.RelativeTimeFormat(language, { numeric: "auto" }).format(days, "day")
  return formatDate(value, language)
}
