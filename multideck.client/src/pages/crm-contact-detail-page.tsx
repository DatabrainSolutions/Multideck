import { lazy, Suspense, useEffect, useState, type FormEvent, type ReactNode } from "react"
import { ArrowLeft, ArrowRight, BriefcaseBusiness, Building2, CalendarDays, Languages, LoaderCircle, Mail, Phone, Plus, RefreshCw, Save, UsersRound } from "lucide-react"
import { toast } from "sonner"
import { CopyableField } from "@/components/multideck/copyable-field"
import { CustomerAvatar } from "@/components/multideck/customer-components"
import { MarketingOptInControl } from "@/components/multideck/marketing-opt-in-control"
import { Surface } from "@/components/multideck/surface"
import { StatusPill } from "@/components/multideck/status-pill"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useLanguage } from "@/i18n/language-provider"
import { getContact, updateContact, type ApiContactDetail, type UpdateContactInput } from "@/lib/customer-api"

type CustomField = { id: string; label: string; value: string }
type ContactDraft = UpdateContactInput & { customFields: CustomField[] }

const CrmDetailOverviewShaderCanvas = lazy(() => import("@/components/multideck/lead-company-overview-shader"))

function CrmDetailOverviewShader() {
  return (
    <Suspense
      fallback={<span className="block size-full bg-[radial-gradient(circle_at_50%_100%,#5366e5_0%,#06030a_68%)]" />}
    >
      <CrmDetailOverviewShaderCanvas />
    </Suspense>
  )
}

export function CrmContactDetailPage({ contactId, navigate }: { contactId: string; navigate: (path: string) => void }) {
  const { t } = useLanguage()
  const [contact, setContact] = useState<ApiContactDetail | null>(null)
  const [draft, setDraft] = useState<ContactDraft | null>(null)
  const [state, setState] = useState<"loading" | "ready" | "error">("loading")
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    setState("loading")
    setError(null)
    getContact(contactId).then((data) => { if (active) { setContact(data); setDraft(toDraft(data)); setState("ready") } }).catch((cause) => {
      if (!active) return
      setError(cause instanceof Error ? cause.message : t("This contact could not be loaded. Check your connection and try again."))
      setState("error")
    })
    return () => { active = false }
  }, [contactId, reloadToken, t])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft) return
    setSaving(true)
    try {
      const metadata = { ...draft.metadata, customFields: Object.fromEntries(draft.customFields.filter((field) => field.label.trim()).map((field) => [field.label.trim(), field.value.trim()])) }
      const updated = await updateContact(contactId, { ...draft, metadata })
      setContact(updated)
      setDraft(toDraft(updated))
      toast.success(t("Contact updated"))
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : t("The contact could not be updated. Your changes are still in the form."))
    } finally {
      setSaving(false)
    }
  }

  if (state === "loading") return <PageState icon={<LoaderCircle className="size-6 animate-spin" />} title={t("Loading contact…")} />
  if (state === "error" || !contact) return <div className="md-page md-page-stack"><Button variant="ghost" className="w-fit" onClick={() => navigate("/crm/contacts")}><ArrowLeft className="size-4 rtl:rotate-180" />{t("Back to contacts")}</Button><PageState icon={<RefreshCw className="size-6" />} title={t("Contact unavailable")} detail={error ?? undefined} action={<Button variant="outline" onClick={() => setReloadToken((value) => value + 1)}>{t("Try again")}</Button>} embedded /></div>

  const actionHref = contact.email ? `mailto:${contact.email}` : undefined
  const updateDraft = (next: ContactDraft) => setDraft(next)
  const dirty = Boolean(draft && JSON.stringify(comparableDraft(draft)) !== JSON.stringify(comparableDraft(toDraft(contact))))
  const consentReasonMissing = Boolean(draft && draft.marketingOptIn !== contact.consentMarketing && !draft.marketingConsentReason?.trim())

  const overviewRows = [
    { key: "account", label: t("Account"), value: contact.accountName, icon: Building2, direction: "auto" as const },
    { key: "email", label: t("Work email"), value: contact.email, icon: Mail, href: contact.email ? `mailto:${contact.email}` : null, direction: "ltr" as const },
    { key: "phone", label: t("Phone"), value: contact.phone, icon: Phone, href: contact.phone ? `tel:${contact.phone}` : null, direction: "ltr" as const },
    { key: "role", label: t("Relationship role"), value: contact.role, icon: UsersRound, direction: "auto" as const },
    { key: "job-title", label: t("Job title"), value: contact.jobTitle, icon: BriefcaseBusiness, direction: "auto" as const },
    { key: "preferred-channel", label: t("Preferred channel"), value: contact.preferredChannel, icon: Mail, direction: "auto" as const },
    { key: "preferred-language", label: t("Preferred language"), value: contact.preferredLanguage, icon: Languages, direction: "auto" as const },
    { key: "last-contact", label: t("Last contact"), value: contact.lastContactAt ? relativeDate(contact.lastContactAt, t) : null, icon: CalendarDays, direction: "auto" as const },
  ]

  return <div className="md-page">
    <form id="contact-detail-form" className="grid items-start gap-[var(--md-page-stack-gap)] xl:grid-cols-[minmax(0,1fr)_400px] 2xl:grid-cols-[minmax(0,1fr)_440px]" onSubmit={save}>
      <Surface padding="none" className="min-w-0 overflow-hidden rounded-[var(--md-radius-xl)]">
        <header className="px-5 py-5 shadow-[var(--md-stroke-bottom)] sm:px-6">
          <Button type="button" variant="ghost" className="-ms-2 mb-4 h-8 w-fit rounded-[var(--md-radius-md)] px-2 text-[12px] font-medium text-[var(--md-text)] hover:bg-[var(--md-surface-tint)]" onClick={() => navigate("/crm/contacts")}><ArrowLeft data-icon="inline-start" className="size-3.5" strokeWidth={1.3} />{t("Back to contacts")}</Button>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3.5"><CustomerAvatar initials={contact.initials} tone="blue" size="lg" className="size-14 rounded-full text-[18px]" /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h1 className="truncate text-[24px] font-medium leading-8 text-[var(--md-ink)]" data-i18n-skip dir="auto">{contact.name}</h1><StatusPill tone={contact.consentMarketing ? "green" : "neutral"}>{t(contact.consentMarketing ? "Marketing opted in" : "Marketing opted out")}</StatusPill>{contact.consentSalesContact ? <StatusPill tone="teal">{t("Sales contact allowed")}</StatusPill> : null}</div><button type="button" onClick={() => navigate(`/crm/accounts/${contact.accountId}`)} className="mt-2 inline-flex items-center gap-1.5 rounded-[var(--md-radius-sm)] text-[13px] font-medium text-[var(--md-accent)] hover:text-[var(--md-ink)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]"><span data-i18n-skip dir="auto">{contact.accountName}</span><ArrowRight data-icon="inline-end" className="size-3.5" strokeWidth={1.4} /></button><p className="mt-2 text-[13px] text-[var(--md-text)]" data-i18n-skip dir="auto">{[contact.jobTitle || contact.role, contact.department, contact.location].filter(Boolean).join(" · ") || t("No role or location recorded")}</p></div></div>
            <div className="flex flex-wrap gap-2">{actionHref ? <Button asChild variant="outline"><a href={actionHref}><Mail className="size-4" />{t("Email")}</a></Button> : null}{contact.phone ? <Button asChild variant="outline"><a href={`tel:${contact.phone}`}><Phone className="size-4" />{t("Call")}</a></Button> : null}<Button type="submit" disabled={!dirty || saving || !draft || (!draft.firstName && !draft.lastName) || consentReasonMissing} className="bg-[var(--md-accent)] text-[var(--md-accent-ink)] active:scale-[0.96] motion-reduce:transform-none">{saving ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}{t(saving ? "Saving…" : dirty ? "Save changes" : "Saved")}</Button></div>
          </div>
        </header>

        <Panel title={t("Recent emails")} meta={contact.recentEmails.available ? String(contact.recentEmails.items.length) : t("Permission required")}>
          {!contact.recentEmails.available ? <Empty text={t("You need email access to see conversations with this contact.")} /> : contact.recentEmails.items.length ? contact.recentEmails.items.map((email, index) => <button key={email.id} type="button" onClick={() => navigate(`/inbox?thread=${email.threadId}`)} className={`group flex w-full items-start gap-3 px-5 py-4 text-start hover:bg-[var(--md-surface-soft)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-[var(--md-accent-a14)] ${index ? "border-t border-[var(--md-line)]" : ""}`}><span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-[var(--md-radius-md)] ${email.direction === "inbound" ? "bg-[var(--md-accent-a11)] text-[var(--md-accent)]" : "bg-[var(--md-surface-tint)] text-[var(--md-text)]"}`}><Mail className="size-4" strokeWidth={1.4} /></span><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-4"><span className="truncate text-[14px] font-medium text-[var(--md-ink)]">{email.subject}</span><span className="shrink-0 text-[12px] tabular-nums text-[var(--md-subtle)]">{relativeDate(email.occurredAt, t)}</span></span>{email.preview ? <span className="mt-1 block truncate text-[12px] text-[var(--md-text)]">{email.preview}</span> : null}</span><ArrowRight className="mt-2 size-4 text-[var(--md-subtle)] transition-transform duration-150 group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5 motion-reduce:transition-none" strokeWidth={1.4} /></button>) : <Empty text={t("No recent emails are linked to this contact.")} />}
        </Panel>
        <Panel title={t("Activity")} meta={contact.activities.length ? t("Newest first") : undefined}>{contact.activities.length ? contact.activities.map((activity, index) => <div key={activity.id} className={`grid grid-cols-[10px_minmax(0,1fr)_auto] gap-3 px-5 py-4 ${index ? "border-t border-[var(--md-line)]" : ""}`}><span className="mt-1.5 size-2 rounded-full bg-[var(--md-accent)] shadow-[0_0_0_4px_var(--md-accent-a08)]" /><div><p className="text-[14px] font-medium text-[var(--md-ink)]">{activity.subject}</p>{activity.summary ? <p className="mt-1 text-[13px] leading-5 text-[var(--md-text)]">{activity.summary}</p> : null}</div><p className="shrink-0 text-[12px] tabular-nums text-[var(--md-subtle)]">{relativeDate(activity.occurredAt, t)}</p></div>) : <Empty text={t("No activity has been recorded for this contact yet.")} />}</Panel>
        <Panel title={t("Internal notes")}><div className="px-5 pb-5 pt-1"><Textarea aria-label={t("Internal notes")} value={draft?.notes ?? ""} onChange={(event) => draft && updateDraft({ ...draft, notes: event.target.value || null })} placeholder={t("Add context that helps the next conversation.")} className="min-h-[120px] rounded-[var(--md-radius-md)] bg-white/68 text-[16px] shadow-[var(--md-shadow-line)] sm:text-[14px]" /></div></Panel>
        {draft ? <Panel title={t("Contact details")}><div className="grid gap-4 px-5 pb-5"><div className="grid grid-cols-2 gap-4"><Field label={t("First name")} required={!draft.lastName} value={draft.firstName ?? ""} onChange={(value) => updateDraft({ ...draft, firstName: value || null })} /><Field label={t("Last name")} required={!draft.firstName} value={draft.lastName ?? ""} onChange={(value) => updateDraft({ ...draft, lastName: value || null })} /></div><Field label={t("Work email")} type="email" value={draft.email ?? ""} onChange={(value) => updateDraft({ ...draft, email: value || null })} /><Field label={t("Phone")} type="tel" value={draft.phone ?? ""} onChange={(value) => updateDraft({ ...draft, phone: value || null })} /><Field label={t("Job title")} value={draft.jobTitle ?? ""} onChange={(value) => updateDraft({ ...draft, jobTitle: value || null })} /><Field label={t("Department")} value={draft.department ?? ""} onChange={(value) => updateDraft({ ...draft, department: value || null })} /><Field label={t("Relationship role")} value={draft.role ?? ""} onChange={(value) => updateDraft({ ...draft, role: value || null })} /><Field label={t("Influence level")} value={draft.influenceLevel ?? ""} onChange={(value) => updateDraft({ ...draft, influenceLevel: value || null })} /><Field label={t("Relationship strength")} type="number" value={draft.relationshipStrength == null ? "" : String(draft.relationshipStrength)} onChange={(value) => updateDraft({ ...draft, relationshipStrength: value === "" ? null : Math.max(0, Math.min(100, Number(value))) })} /><Field label={t("Preferred channel")} value={draft.preferredChannel ?? ""} onChange={(value) => updateDraft({ ...draft, preferredChannel: value || null })} /><Field label={t("Preferred language")} value={draft.preferredLanguage ?? ""} onChange={(value) => updateDraft({ ...draft, preferredLanguage: value || null })} />{contact.lastContactAt ? <p className="text-[12px] text-[var(--md-text)]">{t("Last contact")}: <span className="font-medium text-[var(--md-ink)]">{relativeDate(contact.lastContactAt, t)}</span></p> : null}</div></Panel> : null}
        {draft ? <Panel title={t("Consent and privacy")}><div className="grid gap-3 px-5 pb-5"><CheckRow label={t("Direct sales contact allowed")} checked={draft.consentSalesContact} onChange={(checked) => updateDraft({ ...draft, consentSalesContact: checked })} /><CheckRow label={t("Allow AI training with approved contact data")} checked={draft.trainingAllowed} onChange={(checked) => updateDraft({ ...draft, trainingAllowed: checked })} /><div className="rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] p-4 shadow-[var(--md-shadow-line)]"><MarketingOptInControl checked={draft.marketingOptIn} source={contact.marketingConsentSource} updatedAt={contact.marketingConsentUpdatedAt} onCheckedChange={(checked) => updateDraft({ ...draft, marketingOptIn: checked })} /></div>{draft.marketingOptIn !== contact.consentMarketing ? <Field label={t("Reason or evidence")} required value={draft.marketingConsentReason ?? ""} onChange={(value) => updateDraft({ ...draft, marketingConsentReason: value || null })} /> : null}</div></Panel> : null}
        {contact.consentHistory.length ? <Panel title={t("Consent history")} meta={String(contact.consentHistory.length)}><div className="px-5 pb-4">{contact.consentHistory.map((item) => <div key={item.id} className="border-t border-[var(--md-line)] py-3 first:border-t-0"><div className="flex items-center justify-between gap-3"><StatusPill tone={item.status === "opted_in" ? "green" : "neutral"}>{t(item.status === "opted_in" ? "Opted in" : "Opted out")}</StatusPill><span className="text-[12px] tabular-nums text-[var(--md-subtle)]">{formatDate(item.effectiveAt)}</span></div><p className="mt-2 text-[12px] leading-5 text-[var(--md-text)]">{[humanize(item.source), item.reason].filter(Boolean).join(" · ")}</p></div>)}</div></Panel> : null}
        {draft ? <Panel title={t("Additional fields")}><div className="grid gap-3 px-5 pb-5">{draft.customFields.map((field) => <div key={field.id} className="grid gap-2"><Input aria-label={t("Field name")} value={field.label} onChange={(event) => updateDraft({ ...draft, customFields: draft.customFields.map((item) => item.id === field.id ? { ...item, label: event.target.value } : item) })} placeholder={t("Field name")} className="h-10 bg-white/68 text-[16px] sm:text-[14px]" /><div className="flex gap-2"><Input aria-label={t("Field value")} value={field.value} onChange={(event) => updateDraft({ ...draft, customFields: draft.customFields.map((item) => item.id === field.id ? { ...item, value: event.target.value } : item) })} placeholder={t("Value")} className="h-10 min-w-0 bg-white/68 text-[16px] sm:text-[14px]" /><Button type="button" variant="ghost" onClick={() => updateDraft({ ...draft, customFields: draft.customFields.filter((item) => item.id !== field.id) })}>{t("Remove")}</Button></div></div>)}<Button type="button" variant="outline" className="w-fit" onClick={() => updateDraft({ ...draft, customFields: [...draft.customFields, { id: crypto.randomUUID(), label: "", value: "" }] })}><Plus className="size-4" />{t("Add field")}</Button></div></Panel> : null}
      </Surface>

      <aside className="relative min-w-0 self-start overflow-hidden rounded-[var(--md-radius-xl)] bg-[#06030a] px-5 py-5 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_0_0_1px_var(--md-accent-veil-ring-a16),0_16px_36px_var(--md-accent-veil-cast-a18)] xl:sticky xl:top-[76px]" aria-labelledby={`contact-overview-${contact.id}`}>
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 scale-[1.04]"><CrmDetailOverviewShader /></span>
        <div className="relative z-10 [text-shadow:0_1px_10px_rgba(0,0,0,0.32)]">
          <h2 id={`contact-overview-${contact.id}`} className="text-[13px] font-medium text-white/72">{t("Contact details")}</h2>
          <div className="mt-4 flex items-center gap-3">
            <CustomerAvatar initials={contact.initials} tone="blue" className="size-12 rounded-full bg-white/13 text-[15px] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.16)]" />
            <div className="min-w-0"><CopyableField label={t("Contact")} value={contact.name} className="-my-2 min-w-0" contentClassName="min-w-0" buttonClassName="size-6 before:-inset-0.5 [@media(hover:none)]:size-10" tone="inverse"><p className="break-words text-[17px] font-medium leading-6 text-white" data-i18n-skip dir="auto">{contact.name}</p></CopyableField><p className="mt-1 text-[11px] text-white/58" data-i18n-skip dir="auto">{[contact.jobTitle || contact.role, contact.department].filter(Boolean).join(" · ") || t("Not recorded")}</p></div>
          </div>
          <dl className="mt-3.5">
            {overviewRows.map(({ key, label, value, icon: Icon, href, direction }) => <div key={key} className="grid min-w-0 grid-cols-[20px_minmax(0,1fr)] gap-x-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] first:shadow-none"><Icon className="mt-0.5 size-4 text-white/54" strokeWidth={1.25} aria-hidden="true" /><div className="min-w-0"><dt className="text-[10.5px] text-white/58">{label}</dt><dd className="mt-0.5 min-w-0 text-[12px] font-medium leading-[18px] text-white/90">{value ? <CopyableField label={label} value={value} className="-my-2 max-w-full" contentClassName="max-w-full" buttonClassName="size-6 before:-inset-0.5 [@media(hover:none)]:size-10" tone="inverse">{key === "account" ? <button type="button" onClick={() => navigate(`/crm/accounts/${contact.accountId}`)} className="inline-flex max-w-full items-center gap-1 text-[var(--md-accent-lift-strong)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35"><span className="truncate" data-i18n-skip dir="auto">{value}</span><ArrowRight data-icon="inline-end" className="size-3 shrink-0" strokeWidth={1.3} /></button> : href ? <a href={href} className="inline-flex max-w-full text-[var(--md-accent-lift-strong)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35" dir={direction} data-i18n-skip><span className={key === "phone" ? "whitespace-nowrap" : "[overflow-wrap:anywhere]"}>{value}</span></a> : <span data-i18n-skip dir={direction}>{value}</span>}</CopyableField> : <span className="text-white/48">{t("Not recorded")}</span>}</dd></div></div>)}
          </dl>
        </div>
      </aside>
    </form>
  </div>
}

function toDraft(contact: ApiContactDetail): ContactDraft { const metadata = contact.metadata ?? {}; const fields = metadata.customFields && typeof metadata.customFields === "object" ? metadata.customFields as Record<string, unknown> : {}; return { firstName: contact.firstName, lastName: contact.lastName, email: contact.email, phone: contact.phone, jobTitle: contact.jobTitle, department: contact.department, role: contact.role, influenceLevel: contact.influenceLevel, relationshipStrength: contact.relationshipStrength, preferredChannel: contact.preferredChannel, preferredLanguage: contact.preferredLanguage, consentSalesContact: contact.consentSalesContact, marketingOptIn: contact.consentMarketing, marketingConsentReason: "", notes: contact.notes, trainingAllowed: contact.trainingAllowed, metadata, customFields: Object.entries(fields).map(([label, value]) => ({ id: crypto.randomUUID(), label, value: typeof value === "string" ? value : String(value) })) } }
function comparableDraft(draft: ContactDraft) { return { ...draft, marketingConsentReason: null, customFields: draft.customFields.map(({ label, value }) => ({ label, value })) } }
function Panel({ title, meta, children }: { title: string; meta?: string; children: ReactNode }) { return <section className="overflow-hidden shadow-[var(--md-stroke-top)]"><div className="flex items-center justify-between gap-3 px-5 py-4 sm:px-6"><h2 className="text-[15px] font-medium text-[var(--md-ink)]">{title}</h2>{meta ? <span className="text-[12px] text-[var(--md-text)]">{meta}</span> : null}</div>{children}</section> }
function Field({ label, value, onChange, required, type = "text" }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; type?: string }) { return <label className="grid gap-1.5 text-[13px] font-medium text-[var(--md-ink)]"><span>{label}{required ? " *" : ""}</span><Input dir={["email","tel","number"].includes(type) ? "ltr" : "auto"} type={type} required={required} value={value} onChange={(event) => onChange(event.target.value)} className="h-10 rounded-[var(--md-radius-md)] bg-white/68 text-[16px] shadow-[var(--md-shadow-line)] sm:text-[14px]" /></label> }
function CheckRow({ label, checked, onChange, detail }: { label: string; checked: boolean; onChange: (checked: boolean) => void; detail?: string }) { return <label className="flex min-h-11 items-start gap-3 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] p-3 shadow-[var(--md-shadow-line)]"><Checkbox checked={checked} onCheckedChange={(value) => onChange(value === true)} className="mt-0.5" /><span><span className="block text-[13px] font-medium text-[var(--md-ink)]">{label}</span>{detail ? <span className="mt-1 block text-[12px] leading-5 text-[var(--md-text)]">{detail}</span> : null}</span></label> }
function Empty({ text }: { text: string }) { return <p className="border-t border-[var(--md-line)] px-5 py-6 text-[13px] leading-5 text-[var(--md-text)]">{text}</p> }
function PageState({ icon, title, detail, action, embedded = false }: { icon: ReactNode; title: string; detail?: string; action?: ReactNode; embedded?: boolean }) { return <div className={embedded ? "" : "md-page"}><Surface padding="lg" className="grid min-h-[320px] place-items-center rounded-[var(--md-radius-xl)] text-center"><div className="max-w-md"><span className="mx-auto grid size-11 place-items-center rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] text-[var(--md-accent)]">{icon}</span><p className="mt-4 text-[15px] font-medium text-[var(--md-ink)]">{title}</p>{detail ? <p className="mt-2 text-[13px] leading-5 text-[var(--md-text)]">{detail}</p> : null}{action ? <div className="mt-4">{action}</div> : null}</div></Surface></div> }
function humanize(value: string | null | undefined) { return value ? value.replace(/[_-]+/g, " ").replace(/^./, (letter) => letter.toUpperCase()) : null }
function formatDate(value: string) { return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(new Date(value)) }
function relativeDate(value: string, t: (value: string) => string) { const days = Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000); if (days <= 0) return t("Today"); if (days === 1) return t("Yesterday"); if (days < 30) return `${days} ${t("days ago")}`; return formatDate(value) }
