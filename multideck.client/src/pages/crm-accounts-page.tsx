import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react"
import { ArrowRight, Building2, RefreshCw } from "@/components/icons/hugeicons"
import { toast } from "sonner"
import { DataTable, type DataTableColumn } from "@/components/multideck/data-table"
import { DexterActionPill } from "@/components/multideck/dexter-action-pill"
import { DexterDockedPage } from "@/components/multideck/dexter-companion-sidebar"
import { DotGridLoader } from "@/components/multideck/dot-grid-loader"
import { RegisterFacetSelect, RegisterRevalidatingMark, RegisterSearchField, RegisterViewSwitch } from "@/components/multideck/register-toolbar"
import { Surface } from "@/components/multideck/surface"
import { StatusPill } from "@/components/multideck/status-pill"
import { WizardDialog, type WizardStep } from "@/components/multideck/wizard-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useLanguage } from "@/i18n/language-provider"
import type { AuthUserSummary } from "@/lib/auth-user"
import { createCustomer, getCustomer, getCustomerReference, listAccountsPage, type AccountRegisterPage, type ApiCustomer, type CreateCustomerInput, type CustomerReference, type RegisterSort } from "@/lib/customer-api"
import { engagementTemperatureTone, fallbackEngagementSignal } from "@/lib/crm-engagement"
import { subscribeTopBarAction, topBarActionEvents } from "@/lib/top-bar-action-events"

const emptyAccount = (orgTypeId = ""): CreateCustomerInput => ({
  name: "", orgTypeId, addressLine1: null, townCity: null, postZipCode: null, countryCode: null,
  contactFirstName: null, contactLastName: null, contactEmail: null,
})

const accountScopes = ["All", "Mine"] as const
type AccountScope = typeof accountScopes[number]
const accountPageSize = 50
const emptyAccountSummary: AccountRegisterPage["summary"] = { accounts: 0, contacts: 0, needsAttention: 0, marketingOptedIn: 0, unassigned: 0, healthy: 0 }
const emptyAccountFacets: AccountRegisterPage["facets"] = { relationships: [], owners: [], hasUnassigned: false }

export function CrmAccountsPage({ navigate, currentUser }: { navigate: (path: string) => void; currentUser?: AuthUserSummary | null }) {
  const { language, t } = useLanguage()
  const [accounts, setAccounts] = useState<ApiCustomer[]>([])
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [accountScope, setAccountScope] = useState<AccountScope>("All")
  const [relationshipFilter, setRelationshipFilter] = useState("")
  const [ownerFilter, setOwnerFilter] = useState("")
  const [state, setState] = useState<"loading" | "ready" | "error">("loading")
  const [reloadToken, setReloadToken] = useState(0)
  const lastConsumedReloadToken = useRef(0)
  const [dexterOpen, setDexterOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [createSection, setCreateSection] = useState("account")
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [reference, setReference] = useState<CustomerReference | null>(null)
  const [referenceState, setReferenceState] = useState<"idle" | "loading" | "ready" | "error">("idle")
  const [referenceReloadToken, setReferenceReloadToken] = useState(0)
  const [draft, setDraft] = useState<CreateCustomerInput>(emptyAccount())
  const [offset, setOffset] = useState(0)
  const [total, setTotal] = useState(0)
  const [summary, setSummary] = useState(emptyAccountSummary)
  const [facets, setFacets] = useState(emptyAccountFacets)
  const [sort, setSort] = useState<RegisterSort | null>({ id: "account", direction: "asc" })
  const currentOwnerId = currentUser?.internalUserId ?? null

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => setOffset(0), [query, accountScope, relationshipFilter, ownerFilter])

  useEffect(() => {
    let active = true
    const forceRefresh = reloadToken !== lastConsumedReloadToken.current
    lastConsumedReloadToken.current = reloadToken
    setState("loading")
    listAccountsPage({
      search: debouncedQuery,
      marketingScope: "all",
      relationship: relationshipFilter,
      owner: accountScope === "Mine" ? currentOwnerId ?? "__no_current_user__" : ownerFilter,
      sort,
      limit: accountPageSize,
      offset,
    }, { forceRefresh })
      .then((data) => {
        if (!active) return
        setAccounts(data.rows)
        setTotal(data.total)
        setSummary(data.summary)
        setFacets(data.facets)
        setState("ready")
      })
      .catch((error) => { console.error("Accounts could not be loaded.", error); if (active) setState("error") })
    return () => { active = false }
  }, [accountScope, currentOwnerId, debouncedQuery, offset, ownerFilter, relationshipFilter, reloadToken, sort])

  useEffect(() => {
    if (!createOpen || reference) return
    let active = true
    setReferenceState("loading")
    getCustomerReference().then((data) => {
      if (!active) return
      setReference(data)
      setDraft((current) => current.orgTypeId ? current : { ...current, orgTypeId: data.organisationTypes[0]?.id ?? "" })
      setReferenceState("ready")
    }).catch((error) => {
      console.error("Account reference data could not be loaded.", error)
      if (active) setReferenceState("error")
    })
    return () => { active = false }
  }, [createOpen, reference, referenceReloadToken])

  useEffect(() => subscribeTopBarAction(topBarActionEvents.createCrmAccount, openCreate), [])

  const needsAttention = summary.needsAttention
  const contactTotal = summary.contacts
  const marketingOptIns = summary.marketingOptedIn
  const unassignedAccounts = summary.unassigned
  const healthyAccounts = summary.healthy
  const accountFiltersActive = Boolean(query || relationshipFilter || ownerFilter || accountScope !== "All")
  const relationshipOptions = useMemo(() => facets.relationships.map((value) => ({ value, label: humanize(value) })), [facets.relationships])
  const ownerOptions = useMemo(() => {
    const assigned = facets.owners.map((owner) => ({ value: owner.id, label: owner.name }))
    return facets.hasUnassigned ? [...assigned, { value: "__unassigned__", label: "Unassigned" }] : assigned
  }, [facets])

  const accountColumns = useMemo<DataTableColumn<ApiCustomer>[]>(() => [
    {
      id: "account", label: "Account", width: 300, minWidth: 230, maxWidth: 430, canHide: false, resizable: true,
      sortValue: (account) => account.name,
      cell: (account) => <div className="grid min-h-11 min-w-0 content-center"><span className="block truncate text-[14px] font-medium text-[var(--md-ink)]">{account.name}</span><span className="mt-0.5 block truncate text-[12px] text-[var(--md-text)]">{[account.industry, account.location].filter(Boolean).join(" · ") || t("No location recorded")}</span></div>,
    },
    {
      id: "temperature", label: "Temperature", kind: "status", width: 128, minWidth: 112, maxWidth: 160, resizable: true,
      cellTitle: (account) => {
        const signal = account.engagementSignal ?? fallbackEngagementSignal(account.id, account.lastContactAt)
        return signal.calculatedFromSources
          ? `${signal.temperature} · ${signal.activityCount30d} ${t("activities")} · ${signal.emailCount30d} ${t("emails in 30 days")}`
          : `${signal.temperature} · ${t("Based on the last recorded engagement")}`
      },
      cell: (account) => {
        const signal = account.engagementSignal ?? fallbackEngagementSignal(account.id, account.lastContactAt)
        return <StatusPill tone={engagementTemperatureTone(signal.temperature)}>{t(signal.temperature)}</StatusPill>
      },
    },
    { id: "relationship", label: "Relationship", kind: "status", width: 160, minWidth: 130, resizable: true, sortValue: (account) => account.relationshipStatus || account.status, cell: (account) => <StatusPill tone={account.healthScore != null && account.healthScore < 50 ? "amber" : "neutral"}>{humanize(account.relationshipStatus || account.status)}</StatusPill> },
    { id: "owner", label: "Owner", width: 160, minWidth: 130, resizable: true, sortValue: (account) => account.ownerName, cellClassName: "text-[13px] text-[var(--md-text)]", cell: (account) => account.ownerName || t("Unassigned") },
    { id: "last-contact", label: "Last contact", width: 130, minWidth: 110, resizable: true, sortValue: (account) => account.lastContactAt ? new Date(account.lastContactAt).getTime() : null, cellClassName: "text-[13px] tabular-nums text-[var(--md-text)]", cell: (account) => relativeDate(account.lastContactAt, t) },
    { id: "contacts", label: "Contacts", width: 100, minWidth: 88, sortValue: (account) => account.contactCount, cellClassName: "text-[13px] tabular-nums text-[var(--md-ink)]", cell: (account) => account.contactCount },
    { id: "marketing", label: "Marketing", kind: "status", width: 120, minWidth: 110, sortValue: (account) => account.marketingOptIn ? 1 : 0, cell: (account) => <StatusPill tone={account.marketingOptIn ? "green" : "red"}>{t(account.marketingOptIn ? "Opted in" : "Opted out")}</StatusPill> },
    { id: "open", label: "Open", headerContent: <span className="sr-only">{t("Open")}</span>, width: 52, minWidth: 52, maxWidth: 52, canHide: false, canPin: false, cell: () => <ArrowRight className="size-4 text-[var(--md-subtle)] transition-transform duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5 motion-reduce:transition-none" strokeWidth={1.4} /> },
  ], [t])

  function clearAccountFilters() {
    setQuery("")
    setAccountScope("All")
    setRelationshipFilter("")
    setOwnerFilter("")
  }

  function openCreate() {
    setCreateError(null)
    setCreateSection("account")
    setCreateOpen(true)
  }

  function changeCreateOpen(nextOpen: boolean) {
    setCreateOpen(nextOpen)
    if (nextOpen) {
      setCreateError(null)
      setCreateSection("account")
    }
  }

  async function create() {
    setCreating(true)
    setCreateError(null)
    try {
      const account = await createCustomer(draft)
      toast.success(t("Account created"))
      setCreateOpen(false)
      setDraft(emptyAccount(reference?.organisationTypes[0]?.id))
      setReloadToken((value) => value + 1)
      navigate(`/crm/accounts/${account.id}`)
    } catch (error) {
      setCreateError(error instanceof Error ? t(error.message) : t("The account could not be created. Check the details and try again."))
    } finally {
      setCreating(false)
    }
  }

  function update<K extends keyof CreateCustomerInput>(key: K, value: CreateCustomerInput[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  const accountSteps: WizardStep[] = [
    { id: "account", label: "Account details", hint: "Name the organisation and choose how it is represented in CRM.", complete: Boolean(draft.name.trim() && draft.orgTypeId) },
    { id: "address", label: "Address", hint: "Record the address operators will use for customer work.", complete: Boolean(draft.addressLine1 || draft.townCity || draft.postZipCode || draft.countryCode) },
    { id: "contact", label: "Primary contact", hint: "Add one useful person now, or leave this step blank.", complete: Boolean(draft.contactFirstName || draft.contactLastName || draft.contactEmail) },
  ]
  const countryCodeIsValid = !draft.countryCode || /^[A-Z]{2}$/.test(draft.countryCode)

  return (
    <DexterDockedPage open={dexterOpen} onClose={() => setDexterOpen(false)} contextLabel={t("Accounts")} className="md-page md-page-stack-compact">
      <header className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0"><div className="flex flex-wrap items-baseline gap-x-3 gap-y-1"><h1 className="text-[22px] font-medium leading-tight text-[var(--md-ink)]">{t("Accounts")}</h1><p className="text-[11px] font-medium text-[var(--md-subtle)]">{t("Customer management")}</p></div><p className="mt-1 max-w-[900px] text-[12px] leading-5 text-[var(--md-text)]">{t("Customer organisations, relationship health, contacts and the next work that matters.")}</p></div>
        <div className="flex flex-wrap gap-2">
          <DexterActionPill onClick={() => setDexterOpen(true)} label={t("Ask Dexter")} />
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {[
          [t("Total accounts"), summary.accounts, t("all customer organisations")],
          [t("Contacts"), contactTotal, t("recorded contacts")],
          [t("Needs attention"), needsAttention, t("need attention now")],
          [t("Marketing opted in"), marketingOptIns, t("with marketing consent")],
          [t("Unassigned"), unassignedAccounts, t("without an assigned owner")],
          [t("Healthy accounts"), healthyAccounts, t("health score 70 or above")],
        ].map(([label, value, detail]) => (
          <Surface key={String(label)} padding="none" className="h-[44px] min-w-0 rounded-[var(--md-radius-lg)] px-3 py-1.5">
            <div className="flex h-full min-w-0 items-center gap-2.5">
              <p className="shrink-0 text-[19px] font-medium leading-none tabular-nums text-[var(--md-ink)]" data-i18n-skip dir="ltr">
                {new Intl.NumberFormat(language).format(Number(value))}
              </p>
              <div className="min-w-0">
                <p className="truncate text-[10.5px] font-medium leading-[13px] text-[var(--md-text)]">{label}</p>
                <p className="truncate text-[9px] leading-[11px] text-[var(--md-subtle)]">{detail}</p>
              </div>
            </div>
          </Surface>
        ))}
      </div>

      <DataTable
        key="crm-accounts-v4"
        ariaLabel="Account directory"
        columnsButtonLabel="Manage account columns"
        storageKey="crm-accounts-v4"
        columns={accountColumns}
        rows={accounts}
        getRowKey={(account) => account.id}
        exportConfig={{
          fileName: "crm-accounts",
          recordCategory: "Account details",
          loadRecords: (selectedAccounts) => Promise.all(selectedAccounts.map((account) => getCustomer(account.id))),
        }}
        onRowClick={(account) => navigate(`/crm/accounts/${account.id}`)}
        rowClassName="group hover:bg-[var(--md-hover)]"
        serverSorting={{ value: sort, onChange: (next) => { setSort(next ?? { id: "account", direction: "asc" }); setOffset(0) } }}
        pagination={{ offset, limit: accountPageSize, total, loading: state === "loading", onOffsetChange: setOffset }}
        compactToolbar
        toolbarTabs={<RegisterViewSwitch options={accountScopes} value={accountScope} onChange={setAccountScope} counts={{ All: accountScope === "All" ? summary.accounts : undefined, Mine: accountScope === "Mine" ? summary.accounts : undefined }} ariaLabel="Account ownership filter" compact />}
        toolbarSearch={<RegisterSearchField value={query} onChange={setQuery} onClear={() => setQuery("")} label="Search accounts" placeholder="Search accounts…" className="sm:w-[180px]" />}
        toolbarFilters={<>
          <RegisterFacetSelect label="Relationship status" allLabel="All relationships" value={relationshipFilter} options={relationshipOptions} onChange={setRelationshipFilter} className="w-[132px]" />
          <RegisterFacetSelect label="Owner" allLabel="All owners" value={ownerFilter} options={ownerOptions} onChange={setOwnerFilter} className="w-[126px]" />
        </>}
        toolbarOptions={<RegisterRevalidatingMark active={state === "loading" && accounts.length > 0} />}
        emptyState={state === "loading"
          ? <RecordState icon={<DotGridLoader size="sm" decorative />} title={t("Loading accounts…")} />
          : state === "error"
            ? <RecordState icon={<RefreshCw className="size-5" />} title={t("Accounts could not be loaded.")} detail={t("Check your connection and try again.")} action={<Button variant="outline" onClick={() => setReloadToken((value) => value + 1)}>{t("Try again")}</Button>} />
            : <RecordState icon={<Building2 className="size-5" />} title={accountFiltersActive ? t("No accounts match these filters.") : t("No accounts yet.")} detail={accountFiltersActive ? t("Clear a filter or try another name, location, owner or relationship status.") : t("Create the first account to keep contacts and customer work together.")} action={accountFiltersActive ? <Button variant="outline" onClick={clearAccountFilters}>{t("Clear filters")}</Button> : <Button onClick={openCreate}>{t("New account")}</Button>} />}
      />

      <WizardDialog
        open={createOpen}
        onOpenChange={changeCreateOpen}
        title="New account"
        description="Start with the organisation and one useful contact. You can add commercial detail after saving."
        steps={accountSteps}
        activeStepId={createSection}
        onStepChange={setCreateSection}
        submitLabel="Create account"
        onSubmit={() => void create()}
        saving={creating}
        submitDisabled={!draft.name.trim() || !draft.orgTypeId || !countryCodeIsValid}
        bodyMinHeight={300}
        className="sm:max-w-[760px]"
      >
        {createSection === "account" ? (
          <div className="grid gap-4">
            <Field label={t("Account name")} required value={draft.name} onChange={(value) => update("name", value)} />
            <div className="grid gap-1.5 text-start text-[13px] font-medium text-[var(--md-ink)]">
              <span>{t("Organisation type")} *</span>
              <Select value={draft.orgTypeId} onValueChange={(value) => update("orgTypeId", value)} disabled={!reference?.organisationTypes.length}>
                <SelectTrigger aria-label={t("Organisation type")} className="!h-10 w-full rounded-[var(--md-radius-md)] border-0 bg-[var(--md-field-bg)] px-3 text-[16px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] sm:text-[14px]">
                  <SelectValue placeholder={t(reference ? "Choose organisation type" : "Loading organisation types")} />
                </SelectTrigger>
                <SelectContent>
                  {reference?.organisationTypes.map((type) => <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {referenceState === "error" ? (
                <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--md-radius-md)] bg-[color-mix(in_srgb,var(--md-red)_7%,var(--md-surface))] px-3 py-2.5 text-[12px] font-normal text-[var(--md-text)]">
                  <span>{t("Organisation types could not be loaded. Try again before creating this account.")}</span>
                  <Button type="button" variant="outline" className="h-8" onClick={() => setReferenceReloadToken((value) => value + 1)}>{t("Try again")}</Button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
        {createSection === "address" ? (
          <div className="grid gap-4">
            <Field label={t("Address line 1")} value={draft.addressLine1 ?? ""} onChange={(value) => update("addressLine1", value || null)} />
            <div className="grid gap-4 sm:grid-cols-3"><Field label={t("Town or city")} value={draft.townCity ?? ""} onChange={(value) => update("townCity", value || null)} /><Field label={t("Postcode")} value={draft.postZipCode ?? ""} onChange={(value) => update("postZipCode", value || null)} /><Field label={t("Country code")} value={draft.countryCode ?? ""} onChange={(value) => update("countryCode", value.toUpperCase() || null)} hint={t("Two-letter ISO code, e.g. GB")} error={draft.countryCode && !countryCodeIsValid ? t("Enter a two-letter ISO country code, such as GB.") : undefined} maxLength={2} dir="ltr" /></div>
          </div>
        ) : null}
        {createSection === "contact" ? (
          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2"><Field label={t("First name")} value={draft.contactFirstName ?? ""} onChange={(value) => update("contactFirstName", value || null)} /><Field label={t("Last name")} value={draft.contactLastName ?? ""} onChange={(value) => update("contactLastName", value || null)} /></div>
            <Field label={t("Email")} type="email" value={draft.contactEmail ?? ""} onChange={(value) => update("contactEmail", value || null)} />
          </div>
        ) : null}
        {createError ? <p role="alert" className="text-[13px] text-[var(--md-red)]">{createError}</p> : null}
      </WizardDialog>
    </DexterDockedPage>
  )
}

function RecordState({ icon, title, detail, action }: { icon: ReactNode; title: string; detail?: string; action?: ReactNode }) {
  return <div className="grid min-h-[260px] place-items-center border-t border-[var(--md-line)] px-6 py-10 text-center"><div className="max-w-sm"><span className="mx-auto grid size-10 place-items-center rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] text-[var(--md-accent)]">{icon}</span><p className="mt-4 text-[14px] font-medium text-[var(--md-ink)]">{title}</p>{detail ? <p className="mt-2 text-[13px] leading-5 text-[var(--md-text)]">{detail}</p> : null}{action ? <div className="mt-4">{action}</div> : null}</div></div>
}

function Field({ label, value, onChange, required, type = "text", hint, error, maxLength, dir }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; type?: string; hint?: string; error?: string; maxLength?: number; dir?: "ltr" | "rtl" | "auto" }) {
  const descriptionId = useId()
  return <label className="grid gap-1.5 text-start text-[13px] font-medium text-[var(--md-ink)]"><span>{label}{required ? " *" : ""}</span><Input aria-describedby={hint || error ? descriptionId : undefined} aria-invalid={Boolean(error)} dir={dir ?? (type === "email" ? "ltr" : "auto")} type={type} required={required} maxLength={maxLength} value={value} onChange={(event) => onChange(event.target.value)} className="h-10 rounded-[var(--md-radius-md)] bg-white/68 text-[16px] shadow-[var(--md-shadow-line)] sm:text-[14px]" />{error ? <span id={descriptionId} className="text-[12px] font-normal text-[var(--md-red)]">{error}</span> : hint ? <span id={descriptionId} className="text-[12px] font-normal text-[var(--md-text)]">{hint}</span> : null}</label>
}

function humanize(value: string | null | undefined) { return value ? value.replace(/[_-]+/g, " ").replace(/^./, (letter) => letter.toUpperCase()) : "—" }
function relativeDate(value: string | null, t: (value: string) => string) {
  if (!value) return t("Never")
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000)
  if (days <= 0) return t("Today")
  if (days === 1) return t("Yesterday")
  if (days < 30) return `${days} ${t("days ago")}`
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(new Date(value))
}
