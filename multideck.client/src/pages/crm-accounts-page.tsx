import { defaultPaginationPageSize } from "@/lib/pagination"
import { collectExportPages } from "@/lib/table-export"
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react"
import { ArrowRight, Building2, RefreshCw } from "@/components/icons/hugeicons"
import { toast } from "sonner"
import { DataTable, type DataTableColumn } from "@/components/multideck/data-table"
import { AdvancedFilterPopover } from "@/components/multideck/advanced-filter-popover"
import { DexterActionPill } from "@/components/multideck/dexter-action-pill"
import { DexterDockedPage } from "@/components/multideck/dexter-companion-sidebar"
import { DotGridLoader } from "@/components/multideck/dot-grid-loader"
import { MultiSelectMenu } from "@/components/multideck/multi-select-menu"
import { RegisterFacetSelect, RegisterRevalidatingMark, RegisterSearchField, RegisterViewSwitch } from "@/components/multideck/register-toolbar"
import { Surface } from "@/components/multideck/surface"
import { StatusPill } from "@/components/multideck/status-pill"
import { WizardDialog, type WizardStep } from "@/components/multideck/wizard-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useLanguage } from "@/i18n/language-provider"
import type { AuthUserSummary } from "@/lib/auth-user"
import { createCustomer, getCustomer, getCustomerReference, listAccountsPage, type AccountRegisterPage, type ApiCustomer, type CreateCustomerInput, type CustomerReference, type RegisterSort } from "@/lib/customer-api"
import { engagementTemperatureTone, fallbackEngagementSignal } from "@/lib/crm-engagement"
import { countActiveFilterConditions, createEmptyFilterQuery, filterQueryIsEmpty, type FilterFieldOption, type FilterQuery } from "@/lib/advanced-filters"
import { subscribeTopBarAction, topBarActionEvents } from "@/lib/top-bar-action-events"

const emptyAccount = (): CreateCustomerInput => ({
  name: "", orgTypeIds: [], addressLine1: null, townCity: null, postZipCode: null, countryCode: null,
  contactFirstName: null, contactLastName: null, contactEmail: null,
})

const accountScopes = ["All", "Mine"] as const
type AccountScope = typeof accountScopes[number]
const emptyAccountSummary: AccountRegisterPage["summary"] = { accounts: 0, contacts: 0, needsAttention: 0, marketingOptedIn: 0, unassigned: 0, healthy: 0 }
const emptyAccountFacets: AccountRegisterPage["facets"] = { relationships: [], owners: [], hasUnassigned: false }

export function CrmAccountsPage({ navigate, currentUser }: { navigate: (path: string) => void; currentUser?: AuthUserSummary | null }) {
  const { language, t } = useLanguage()
  const title = "Companies"
  const routeBase = "/crm/accounts"
  const [accounts, setAccounts] = useState<ApiCustomer[]>([])
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [accountScope, setAccountScope] = useState<AccountScope>("All")
  const [relationshipFilter, setRelationshipFilter] = useState("")
  const [ownerFilter, setOwnerFilter] = useState("")
  const [advancedFilter, setAdvancedFilter] = useState<FilterQuery>(() => createEmptyFilterQuery("any"))
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
  const [accountPageSize, setAccountPageSize] = useState(defaultPaginationPageSize)
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
      organisationType: "company",
      search: debouncedQuery,
      marketingScope: "all",
      relationship: relationshipFilter,
      owner: accountScope === "Mine" ? currentOwnerId ?? "__no_current_user__" : ownerFilter,
      filterQuery: filterQueryIsEmpty(advancedFilter) ? null : advancedFilter,
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
  }, [accountPageSize, accountScope, advancedFilter, currentOwnerId, debouncedQuery, offset, ownerFilter, relationshipFilter, reloadToken, sort])

  useEffect(() => {
    if (reference) return
    let active = true
    setReferenceState("loading")
    getCustomerReference().then((data) => {
      if (!active) return
      setReference(data)
      setReferenceState("ready")
    }).catch((error) => {
      console.error("Account reference data could not be loaded.", error)
      if (active) setReferenceState("error")
    })
    return () => { active = false }
  }, [reference, referenceReloadToken])

  useEffect(() => subscribeTopBarAction(topBarActionEvents.createCrmAccount, openCreate), [])

  const needsAttention = summary.needsAttention
  const contactTotal = summary.contacts
  const marketingOptIns = summary.marketingOptedIn
  const unassignedAccounts = summary.unassigned
  const healthyAccounts = summary.healthy
  const accountFiltersActive = Boolean(query || relationshipFilter || ownerFilter || accountScope !== "All" || countActiveFilterConditions(advancedFilter))
  const relationshipOptions = useMemo(() => facets.relationships.map((value) => ({ value, label: humanize(value) })), [facets.relationships])
  const ownerOptions = useMemo(() => {
    const assigned = facets.owners.map((owner) => ({ value: owner.id, label: owner.name }))
    return facets.hasUnassigned ? [...assigned, { value: "__unassigned__", label: "Unassigned" }] : assigned
  }, [facets])
  const advancedFilterFields = useMemo<FilterFieldOption[]>(() => [
    { value: "any", label: "Any organisation field", placeholder: "Enter a value" },
    { value: "name", label: "Organisation name", placeholder: "Enter a name" },
    { value: "accountCode", label: "Organisation code", placeholder: "Enter a code" },
    { value: "organisationTypes", label: "Organisation type", kind: "select", placeholder: "Choose a type", options: (reference?.organisationTypes ?? []).map((type) => ({ value: type.name, label: type.name })) },
    { value: "address", label: "Address", placeholder: "Enter an address" },
    { value: "country", label: "Country code", placeholder: "Enter a country code" },
    { value: "contact", label: "Contact name", placeholder: "Enter a contact name" },
    { value: "contactEmail", label: "Contact email", placeholder: "Enter an email" },
    { value: "owner", label: "Owner", kind: "select", placeholder: "Choose an owner", options: ownerOptions.filter((option) => option.value !== "__unassigned__") },
    { value: "relationship", label: "Relationship", kind: "select", placeholder: "Choose a relationship", options: relationshipOptions },
    { value: "lastContactAt", label: "Last contact", kind: "date" },
  ], [ownerOptions, reference?.organisationTypes, relationshipOptions])
  const countAdvancedMatches = useCallback((filterQuery: FilterQuery) => listAccountsPage({
    organisationType: "company",
    search: debouncedQuery,
    marketingScope: "all",
    relationship: relationshipFilter,
    owner: accountScope === "Mine" ? currentOwnerId ?? "__no_current_user__" : ownerFilter,
    filterQuery: filterQueryIsEmpty(filterQuery) ? null : filterQuery,
    sort,
    limit: 1,
    offset: 0,
  }, { forceRefresh: true }).then((page) => page.total), [accountScope, currentOwnerId, debouncedQuery, ownerFilter, relationshipFilter, sort])

  const accountColumns = useMemo<DataTableColumn<ApiCustomer>[]>(() => [
    {
      id: "account", label: "Company", width: 280, minWidth: 220, maxWidth: 410, canHide: false, resizable: true,
      sortValue: (account) => account.name,
      cell: (account) => <div className="grid min-h-11 min-w-0 content-center"><span className="block truncate text-[14px] font-medium text-[var(--md-ink)]">{account.name}</span><span className="mt-0.5 block truncate text-[12px] text-[var(--md-text)]">{[account.industry, account.location].filter(Boolean).join(" · ") || t("No location recorded")}</span></div>,
    },
    {
      id: "company-types", label: "Company types", kind: "status", width: 210, minWidth: 160, maxWidth: 280, resizable: true,
      cellTitle: (account) => account.types.join(", "),
      cell: (account) => account.types.length ? (
        <div className="flex min-w-0 flex-wrap gap-1">
          {account.types.slice(0, 2).map((type) => <StatusPill key={type} tone="neutral">{t(type)}</StatusPill>)}
          {account.types.length > 2 ? <StatusPill tone="neutral">+{account.types.length - 2}</StatusPill> : null}
        </div>
      ) : <span className="text-[12px] text-[var(--md-subtle)]">{t("Not recorded")}</span>,
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
    setAdvancedFilter(createEmptyFilterQuery("any"))
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
      toast.success(t("Company created"))
      setCreateOpen(false)
      setDraft(emptyAccount())
      setReloadToken((value) => value + 1)
      navigate(`${routeBase}/${account.id}`)
    } catch (error) {
      setCreateError(error instanceof Error ? t(error.message) : t("The company could not be created. Check the details and try again."))
    } finally {
      setCreating(false)
    }
  }

  function update<K extends keyof CreateCustomerInput>(key: K, value: CreateCustomerInput[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  const accountSteps: WizardStep[] = [
    { id: "account", label: "Company details", hint: "Name the company and choose every role it has.", complete: Boolean(draft.name.trim() && draft.orgTypeIds.length) },
    { id: "address", label: "Address", hint: "Record the address operators will use for this company.", complete: Boolean(draft.addressLine1 || draft.townCity || draft.postZipCode || draft.countryCode) },
    { id: "contact", label: "Primary contact", hint: "Add one useful person now, or leave this step blank.", complete: Boolean(draft.contactFirstName || draft.contactLastName || draft.contactEmail) },
  ]
  const countryCodeIsValid = !draft.countryCode || /^[A-Z]{2}$/.test(draft.countryCode)

  return (
    <DexterDockedPage open={dexterOpen} onClose={() => setDexterOpen(false)} contextLabel={t(title)} className="md-page md-page-stack-compact">
      <header className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0"><div className="flex flex-wrap items-baseline gap-x-3 gap-y-1"><h1 className="text-[22px] font-medium leading-tight text-[var(--md-ink)]">{t(title)}</h1><p className="text-[11px] font-medium text-[var(--md-subtle)]">{t("Organisations")}</p></div><p className="mt-1 max-w-[900px] text-[12px] leading-5 text-[var(--md-text)]">{t("Every company, its contacts and all operational roles kept in one place.")}</p></div>
        <div className="flex flex-wrap gap-2">
          <DexterActionPill onClick={() => setDexterOpen(true)} label={t("Ask Dexter")} />
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {[
          [t("Total companies"), summary.accounts, t("all company records")],
          [t("Contacts"), contactTotal, t("recorded contacts")],
          [t("Needs attention"), needsAttention, t("need attention now")],
          [t("Marketing opted in"), marketingOptIns, t("with marketing consent")],
          [t("Unassigned"), unassignedAccounts, t("without an assigned owner")],
          [t("Healthy companies"), healthyAccounts, t("health score 70 or above")],
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
        key="crm-company-organisations-v1"
        ariaLabel="Company directory"
        columnsButtonLabel="Manage company columns"
        storageKey="crm-company-organisations-v1"
        columns={accountColumns}
        rows={accounts}
        getRowKey={(account) => account.id}
        exportConfig={{
          fileName: "crm-companies",
          recordCategory: "Company details",
          register: {
            dateLabel: "Last contact date",
            dateValue: (account) => account.lastContactAt,
            busy: query.trim() !== debouncedQuery,
            loadAllRows: (signal) => collectExportPages((page) => listAccountsPage({
              organisationType: "company", search: debouncedQuery, marketingScope: "all",
              relationship: relationshipFilter,
              owner: accountScope === "Mine" ? currentOwnerId ?? "__no_current_user__" : ownerFilter,
              filterQuery: filterQueryIsEmpty(advancedFilter) ? null : advancedFilter, sort, ...page,
            }, { forceRefresh: true }), (account) => account.id, signal),
          },
          loadRecords: (selectedAccounts) => Promise.all(selectedAccounts.map((account) => getCustomer(account.id))),
        }}
        onRowClick={(account) => navigate(`${routeBase}/${account.id}`)}
        rowClassName="group hover:bg-[var(--md-hover)]"
        serverSorting={{ value: sort, onChange: (next) => { setSort(next ?? { id: "account", direction: "asc" }); setOffset(0) } }}
        pagination={{ offset, limit: accountPageSize, total, loading: state === "loading", onOffsetChange: setOffset, onLimitChange: setAccountPageSize, error: state === "error" }}
        compactToolbar
        toolbarTabs={<RegisterViewSwitch options={accountScopes} value={accountScope} onChange={setAccountScope} counts={{ All: accountScope === "All" ? summary.accounts : undefined, Mine: accountScope === "Mine" ? summary.accounts : undefined }} ariaLabel="Company ownership filter" compact />}
        toolbarSearch={<RegisterSearchField value={query} onChange={setQuery} onClear={() => setQuery("")} label="Search companies" placeholder="Search companies…" className="sm:w-[180px]" />}
        toolbarFilters={<>
          <RegisterFacetSelect label="Relationship status" allLabel="All relationships" value={relationshipFilter} options={relationshipOptions} onChange={setRelationshipFilter} className="w-[132px]" />
          <RegisterFacetSelect label="Owner" allLabel="All owners" value={ownerFilter} options={ownerOptions} onChange={setOwnerFilter} className="w-[126px]" />
          <AdvancedFilterPopover
            fields={advancedFilterFields}
            value={advancedFilter}
            onChange={(value) => { setAdvancedFilter(value); setOffset(0) }}
            storageKey="crm-company-organisation-register"
            itemLabel="companies"
            totalCount={total}
            countMatches={countAdvancedMatches}
          />
        </>}
        toolbarOptions={<RegisterRevalidatingMark active={state === "loading" && accounts.length > 0} />}
        emptyState={state === "loading"
          ? <RecordState icon={<DotGridLoader size="sm" decorative />} title={t("Loading companies…")} />
          : state === "error"
            ? <RecordState icon={<RefreshCw className="size-5" />} title={t("Companies could not be loaded.")} detail={t("Check your connection and try again.")} action={<Button variant="outline" onClick={() => setReloadToken((value) => value + 1)}>{t("Try again")}</Button>} />
            : <RecordState icon={<Building2 className="size-5" />} title={accountFiltersActive ? t("No companies match these filters.") : t("No companies yet.")} detail={accountFiltersActive ? t("Clear a filter or try another name, location, owner or relationship status.") : t("Create the first company to keep its contacts and operational roles together.")} action={accountFiltersActive ? <Button variant="outline" onClick={clearAccountFilters}>{t("Clear filters")}</Button> : <Button onClick={openCreate}>{t("New company")}</Button>} />}
      />

      <WizardDialog
        open={createOpen}
        onOpenChange={changeCreateOpen}
        title="New company"
        description="Start with the company, all of its roles and one useful contact. You can add commercial detail after saving."
        steps={accountSteps}
        activeStepId={createSection}
        onStepChange={setCreateSection}
        submitLabel="Create company"
        onSubmit={() => void create()}
        saving={creating}
        submitDisabled={!draft.name.trim() || !draft.orgTypeIds.length || !countryCodeIsValid}
        bodyMinHeight={300}
        className="sm:max-w-[760px]"
      >
        {createSection === "account" ? (
          <div className="grid gap-4">
            <Field label={t("Company name")} required value={draft.name} onChange={(value) => update("name", value)} />
            <div className="grid gap-1.5 text-start text-[13px] font-medium text-[var(--md-ink)]">
              <span>{t("Company types")} *</span>
              <MultiSelectMenu
                value={draft.orgTypeIds}
                options={(reference?.organisationTypes ?? []).map((type) => ({ value: type.id, label: t(type.name) }))}
                onValueChange={(value) => update("orgTypeIds", value)}
                placeholder={reference ? "Choose company types" : "Loading company types"}
                label="Company types"
                required={!draft.orgTypeIds.length}
                disabled={referenceState === "loading" || referenceState === "error"}
                className="h-10 rounded-[var(--md-radius-md)] bg-[var(--md-field-bg)] px-3 text-[16px] sm:text-[14px]"
              />
              <span className="text-[12px] font-normal leading-5 text-[var(--md-text)]">{t("Choose every role this company has. A company can be a customer, supplier, agent or any combination.")}</span>
              {referenceState === "error" ? (
                <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--md-radius-md)] bg-[color-mix(in_srgb,var(--md-red)_7%,var(--md-surface))] px-3 py-2.5 text-[12px] font-normal text-[var(--md-text)]">
                  <span>{t("Organisation types could not be loaded. Try again before creating this company.")}</span>
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
