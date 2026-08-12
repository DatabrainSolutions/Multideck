import { useEffect, useMemo, useState, type ReactNode } from "react"
import { AiBrain, ArrowRight, LoaderCircle, Mail, RefreshCw, UserRoundCheck, UsersRound } from "@/components/icons/hugeicons"
import { ContactCreateDialog } from "@/components/multideck/contact-create-dialog"
import { DataTable, type DataTableColumn } from "@/components/multideck/data-table"
import { DexterDockedPage } from "@/components/multideck/dexter-companion-sidebar"
import { CustomerAvatar } from "@/components/multideck/customer-components"
import { RegisterFacetSelect, RegisterRevalidatingMark, RegisterSearchField, RegisterViewSwitch } from "@/components/multideck/register-toolbar"
import { Surface } from "@/components/multideck/surface"
import { StatusPill } from "@/components/multideck/status-pill"
import { Button } from "@/components/ui/button"
import { useLanguage } from "@/i18n/language-provider"
import { listContacts, listCustomers, type ApiContact, type ApiCustomer } from "@/lib/customer-api"
import { subscribeTopBarAction, topBarActionEvents } from "@/lib/top-bar-action-events"

const consentScopes = ["All", "Opted in", "Opted out"] as const
type ConsentScope = typeof consentScopes[number]

export function CrmContactsPage({ navigate }: { navigate: (path: string) => void }) {
  const { t } = useLanguage()
  const [contacts, setContacts] = useState<ApiContact[]>([])
  const [accounts, setAccounts] = useState<ApiCustomer[]>([])
  const [query, setQuery] = useState("")
  const [consentFilter, setConsentFilter] = useState<ConsentScope>("All")
  const [accountFilter, setAccountFilter] = useState("")
  const [channelFilter, setChannelFilter] = useState("")
  const [state, setState] = useState<"loading" | "ready" | "error">("loading")
  const [reloadToken, setReloadToken] = useState(0)
  const [dexterOpen, setDexterOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)

  useEffect(() => {
    let active = true
    setState("loading")
    Promise.all([
      listContacts(undefined, { forceRefresh: reloadToken > 0 }),
      listCustomers(undefined, { forceRefresh: reloadToken > 0 }),
    ])
      .then(([nextContacts, nextAccounts]) => {
        if (!active) return
        setContacts(nextContacts)
        setAccounts(nextAccounts)
        setState("ready")
      })
      .catch((error) => { console.error("Contacts could not be loaded.", error); if (active) setState("error") })
    return () => { active = false }
  }, [reloadToken])

  useEffect(() => subscribeTopBarAction(topBarActionEvents.createCrmContact, () => setCreateOpen(true)), [])

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    return contacts.filter((contact) => {
      if (consentFilter === "Opted in" && !contact.consentMarketing) return false
      if (consentFilter === "Opted out" && contact.consentMarketing) return false
      if (accountFilter && contact.accountId !== accountFilter) return false
      if (channelFilter && contact.preferredChannel !== channelFilter) return false
      return !term || [contact.name, contact.email, contact.phone, contact.accountName, contact.role, contact.jobTitle, contact.department].some((value) => value?.toLowerCase().includes(term))
    })
  }, [accountFilter, channelFilter, consentFilter, contacts, query])

  const optedIn = contacts.filter((contact) => contact.consentMarketing).length
  const optedOut = contacts.length - optedIn
  const recentlyContacted = contacts.filter((contact) => contact.lastContactAt && Date.now() - new Date(contact.lastContactAt).getTime() < 30 * 86_400_000).length
  const contactFiltersActive = Boolean(query || accountFilter || channelFilter || consentFilter !== "All")
  const channelOptions = useMemo(() => [...new Set(contacts.map((contact) => contact.preferredChannel).filter((value): value is string => Boolean(value)))].sort().map((value) => ({ value, label: humanize(value) })), [contacts])
  const accountOptions = useMemo(() => accounts.map((account) => ({ value: account.id, label: account.name })).sort((left, right) => left.label.localeCompare(right.label)), [accounts])
  const contactColumns = useMemo<DataTableColumn<ApiContact>[]>(() => [
    {
      id: "contact", label: "Contact", width: 330, minWidth: 250, maxWidth: 460, canHide: false, resizable: true,
      sortValue: (contact) => contact.name,
      cell: (contact) => <div className="flex min-h-11 items-center gap-3"><CustomerAvatar initials={contact.initials} tone="blue" /><span className="min-w-0"><span className="block truncate text-[14px] font-medium text-[var(--md-ink)]">{contact.name}</span><span dir="ltr" className="mt-0.5 block truncate text-start text-[12px] text-[var(--md-text)]">{contact.email || t("No email recorded")}</span></span></div>,
    },
    { id: "account", label: "Account", width: 190, minWidth: 150, resizable: true, sortValue: (contact) => contact.accountName, cellClassName: "text-[13px] font-medium text-[var(--md-ink)]", cell: (contact) => contact.accountName },
    { id: "role", label: "Role", width: 170, minWidth: 130, resizable: true, sortValue: (contact) => contact.jobTitle || contact.role, cellClassName: "text-[13px] text-[var(--md-text)]", cell: (contact) => contact.jobTitle || contact.role || t("Not recorded") },
    { id: "preference", label: "Preference", width: 130, minWidth: 110, resizable: true, sortValue: (contact) => contact.preferredChannel, cellClassName: "text-[13px] text-[var(--md-text)]", cell: (contact) => humanize(contact.preferredChannel) || t("Not recorded") },
    { id: "last-contact", label: "Last contact", width: 130, minWidth: 110, resizable: true, sortValue: (contact) => contact.lastContactAt ? new Date(contact.lastContactAt).getTime() : null, cellClassName: "text-[13px] tabular-nums text-[var(--md-text)]", cell: (contact) => relativeDate(contact.lastContactAt, t) },
    { id: "marketing", label: "Marketing", kind: "status", width: 120, minWidth: 110, sortValue: (contact) => contact.consentMarketing ? 1 : 0, cell: (contact) => <StatusPill tone={contact.consentMarketing ? "green" : "neutral"}>{t(contact.consentMarketing ? "Opted in" : "Opted out")}</StatusPill> },
    { id: "open", label: "Open", headerContent: <span className="sr-only">{t("Open")}</span>, width: 52, minWidth: 52, maxWidth: 52, canHide: false, canPin: false, cell: () => <ArrowRight className="size-4 text-[var(--md-subtle)] transition-transform duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5 motion-reduce:transition-none" strokeWidth={1.4} /> },
  ], [t])

  function clearContactFilters() {
    setQuery("")
    setConsentFilter("All")
    setAccountFilter("")
    setChannelFilter("")
  }

  return (
    <DexterDockedPage open={dexterOpen} onClose={() => setDexterOpen(false)} contextLabel={t("Contacts")} className="md-page md-page-stack-compact">
      <header className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
        <div className="min-w-0"><div className="flex flex-wrap items-baseline gap-x-3 gap-y-1"><h1 className="text-[22px] font-medium leading-tight text-[var(--md-ink)]">{t("Contacts")}</h1><p className="text-[11px] font-medium text-[var(--md-subtle)]">{t("Customer management")}</p></div><p className="mt-1 max-w-[900px] text-[12px] leading-5 text-[var(--md-text)]">{t("The people behind each account, with communication preferences, consent and recent relationship context.")}</p></div>
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setDexterOpen(true)} className="h-10 rounded-[var(--md-radius-lg)]"><AiBrain className="size-4" strokeWidth={1.4} />{t("Ask Dexter")}</Button></div>
      </header>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <ContactStat icon={UsersRound} label={t("Contacts")} value={contacts.length} />
        <ContactStat icon={UserRoundCheck} label={t("Contacted in 30 days")} value={recentlyContacted} />
        <ContactStat icon={Mail} label={t("Marketing opted in")} value={optedIn} />
        <ContactStat icon={Mail} label={t("Marketing opted out")} value={optedOut} />
      </div>

      <DataTable
        ariaLabel="Contact directory"
        columnsButtonLabel="Manage contact columns"
        storageKey="crm-contacts"
        columns={contactColumns}
        rows={state === "ready" ? filtered : []}
        getRowKey={(contact) => contact.id}
        onRowClick={(contact) => navigate(`/crm/contacts/${contact.id}`)}
        rowClassName="group hover:bg-[var(--md-hover)]"
        compactToolbar
        toolbarTabs={<RegisterViewSwitch options={consentScopes} value={consentFilter} onChange={setConsentFilter} counts={{ All: contacts.length, "Opted in": optedIn, "Opted out": optedOut }} ariaLabel="Marketing consent filter" compact />}
        toolbarSearch={<RegisterSearchField value={query} onChange={setQuery} onClear={() => setQuery("")} label="Search contacts" placeholder="Search contacts…" className="sm:w-[180px]" />}
        toolbarFilters={<>
          <RegisterFacetSelect label="Account" allLabel="All accounts" value={accountFilter} options={accountOptions} onChange={setAccountFilter} className="w-[140px]" />
          <RegisterFacetSelect label="Preference" allLabel="All channels" value={channelFilter} options={channelOptions} onChange={setChannelFilter} className="w-[122px]" />
        </>}
        toolbarOptions={<RegisterRevalidatingMark active={state === "loading" && contacts.length > 0} />}
        emptyState={state === "loading"
          ? <ContactState icon={<LoaderCircle className="size-5 animate-spin" />} title={t("Loading contacts…")} />
          : state === "error"
            ? <ContactState icon={<RefreshCw className="size-5" />} title={t("Contacts could not be loaded.")} detail={t("Check your connection and try again.")} action={<Button variant="outline" onClick={() => setReloadToken((value) => value + 1)}>{t("Try again")}</Button>} />
            : <ContactState icon={<UsersRound className="size-5" />} title={contactFiltersActive ? t("No contacts match these filters.") : t("No contacts yet.")} detail={contactFiltersActive ? t("Clear a filter or try another name, account or email.") : t("Add the first contact to start a relationship history.")} action={contactFiltersActive ? <Button variant="outline" onClick={clearContactFilters}>{t("Clear filters")}</Button> : <Button onClick={() => setCreateOpen(true)}>{t("New contact")}</Button>} />}
      />

      <ContactCreateDialog open={createOpen} onOpenChange={setCreateOpen} accounts={accounts} onCreated={(contact) => { setReloadToken((value) => value + 1); navigate(`/crm/contacts/${contact.id}`) }} />
    </DexterDockedPage>
  )
}

function ContactStat({ icon: Icon, label, value }: { icon: typeof UsersRound; label: string; value: number }) {
  const { language } = useLanguage()

  return <Surface padding="none" className="h-[44px] min-w-0 rounded-[var(--md-radius-lg)] px-3 py-1.5"><div className="flex h-full min-w-0 items-center gap-2.5"><p className="shrink-0 text-[19px] font-medium leading-none tabular-nums text-[var(--md-ink)]" data-i18n-skip dir="ltr">{new Intl.NumberFormat(language).format(value)}</p><div className="min-w-0"><p className="truncate text-[10.5px] font-medium leading-[13px] text-[var(--md-text)]">{label}</p></div><span className="ms-auto grid size-7 shrink-0 place-items-center rounded-[calc(var(--md-radius-lg)-4px)] bg-[var(--md-surface-tint)] text-[var(--md-accent)]"><Icon className="size-3.5" strokeWidth={1.4} /></span></div></Surface>
}
function ContactState({ icon, title, detail, action }: { icon: ReactNode; title: string; detail?: string; action?: ReactNode }) { return <div className="grid min-h-[260px] place-items-center border-t border-[var(--md-line)] px-6 py-10 text-center"><div className="max-w-sm"><span className="mx-auto grid size-10 place-items-center rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] text-[var(--md-accent)]">{icon}</span><p className="mt-4 text-[14px] font-medium text-[var(--md-ink)]">{title}</p>{detail ? <p className="mt-2 text-[13px] leading-5 text-[var(--md-text)]">{detail}</p> : null}{action ? <div className="mt-4">{action}</div> : null}</div></div> }
function humanize(value: string | null) { return value ? value.replace(/[_-]+/g, " ").replace(/^./, (letter) => letter.toUpperCase()) : "" }
function relativeDate(value: string | null, t: (value: string) => string) { if (!value) return t("Never"); const days = Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000); if (days <= 0) return t("Today"); if (days === 1) return t("Yesterday"); if (days < 30) return `${days} ${t("days ago")}`; return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(new Date(value)) }
