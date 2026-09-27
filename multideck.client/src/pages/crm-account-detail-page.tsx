import { AddressSearch } from "@/components/multideck/address-search"
import { addressFieldLabel } from "@/lib/country-address-format"
import { WarehousePricingWorkspace } from "@/components/multideck/warehouse-pricing-workspace"
import { mileageRequest, type MileageVisit } from "@/lib/mileage-api"
import { ContactEmailAction } from "@/components/multideck/contact-email-action"
import { ContactPreferencesPopover } from "@/components/multideck/contact-preferences-popover"
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { ArrowRight, Briefcase, CalendarDays, Check, Globe2, Handshake, Image, LinkedinBrand, LoaderCircle, Mail, MapPin, Phone, Plus, RefreshCw, Route, ShieldCheck, Tag, Trash2, Trophy, UserRound, Users, X } from "@/components/icons/hugeicons"
import { toast } from "sonner"
import { ContactCreateDialog } from "@/components/multideck/contact-create-dialog"
import { LifecycleNotes } from "@/components/multideck/lifecycle-notes"
import { MeetingDetailsPopover, type MeetingDetailsAnchor } from "@/components/multideck/meeting-details-popover"
import { MeetingProviderMark, meetingProviderLabels } from "@/components/multideck/meeting-provider-mark"
import { getCalendarWorkspace, type CalendarEvent } from "@/lib/calendar-api"
import { CALENDAR_CHANGED_EVENT } from "@/components/multideck/meeting-dialog"
import "./crm-account-detail-page.css"
import { AccountDetailTabs, AccountOperationsPanel, accountHasFinancialRole, accountRoleOptions, type AccountDetailTab } from "@/components/multideck/account-operations-workspace"
import { CustomerAvatar } from "@/components/multideck/customer-components"
import { ProgressRing } from "@/components/multideck/dashboard-radials"
import { DotGridLoaderPanel } from "@/components/multideck/dot-grid-loader"
import { InlineField, InlineFieldGroup, InlineSelectField, InlineToggleChip } from "@/components/multideck/inline-field"
import { OrganisationFoundationPanel } from "@/components/multideck/organisation-foundation-panel"
import { PhoneCallLinkedRecordSection } from "@/components/multideck/phone-call-components"
import { RecordProfileHeader, RecordProfileStat } from "@/components/multideck/record-profile-header"
import { ScoreExplanationPopover } from "@/components/multideck/score-explanation-popover"
import { ScreeningMatchList, ScreeningOutcomePill, ScreeningResultSummary } from "@/components/multideck/screening-components"
import { Surface } from "@/components/multideck/surface"
import { StatusPill } from "@/components/multideck/status-pill"
import { ChoiceControl } from "@/components/multideck/workflow-components"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { useLanguage } from "@/i18n/language-provider"
import { clearCustomerClassification, isCustomerClassification, isLegacyKeyCustomerRole, normaliseOrganisationRole, organisationIsCustomer, selectCustomerClassification } from "@/lib/organisation-roles"
import { cn } from "@/lib/utils"
import { companyCovers, selectedCompanyCover } from "@/lib/company-covers"
import { CustomerApiError, getCustomer, getCustomerReference, listAccountsPage, updateAccount, updateAccountCompanyTypes, type AccountScoreExplanation, type ApiCustomerDetail, type CustomerAccountFinancial, type CustomerReference, type UpdateAccountInput } from "@/lib/customer-api"
import { hasPermission, type AuthUserSummary } from "@/lib/auth-user"
import { getScreeningCheck, getScreeningWorkspace, runScreeningCheck, type ScreeningCheck } from "@/lib/screening-api"
import { CustomerLiveGrantWorkspace } from "@/pages/customer-live-grants-page"
import { companyProfile, updateCompanyProfile, updateQuoteDefaults, updateCompanyCustomFields, type CompanyProfileKey } from "@/lib/company-profile"

type CustomField = { id: string; label: string; value: string }
type AccountDraft = UpdateAccountInput & { customFields: CustomField[] }
/** Activities and emails are the same thing to an operator: what happened, and when. */
type Moment = {
  id: string
  at: string
  subject: string
  detail: string | null
  email: { threadId: string; direction: "inbound" | "outbound" } | null
}

/** Email, call and add contact are one family of quiet actions; Book meeting stays the page's primary action in the top bar. */
const headerActionClass = "h-8 min-h-8 gap-1.5 rounded-[var(--md-radius-md)] bg-[var(--md-surface)] px-3 text-[12.5px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-[var(--md-surface-tint)] hover:text-[var(--md-ink)]"

/** Enough to see what is moving without pushing the history below the fold. */
const shipmentPreviewCount = 5

const accountTabs = ["overview", "details", "contacts", "addresses", "roles", "financial", "documents", "notes", "warehouse", "customs", "instructions", "privacy", "live"] as const satisfies readonly AccountDetailTab[]

function sameIds(left: string[] | null, right: string[]) {
  return left !== null && left.length === right.length && left.every((id) => right.includes(id))
}

/** The open section is part of the address, so a colleague can be sent straight to a company's Financial tab. */
function readAccountTab(): AccountDetailTab {
  const requested = new URLSearchParams(window.location.search).get("tab")
  return accountTabs.find((tab) => tab === requested) ?? "overview"
}

function writeAccountTab(tab: AccountDetailTab) {
  const url = new URL(window.location.href)
  if (tab === "overview") url.searchParams.delete("tab")
  else url.searchParams.set("tab", tab)
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`)
}

/**
 * A company, edited where it is read. Customers and suppliers are companies
 * with that role, so this is the only record any of them opens.
 *
 * The frame follows a CRM record: a shallow banner with the company's mark
 * overlapping it, identity and reach beside the mark, and one hairline strip of
 * figures that each answer a different question — what is moving, what is owed,
 * how healthy the relationship is and when anyone last spoke to them.
 *
 * Beneath it the page splits in two. The profile column holds what an operator
 * glances at before picking up the phone: who owns the account, how to reach
 * it, the people there, its roles and its screening. The working column holds
 * the record's sections, with Overview as the operating surface.
 *
 * Scores stay calculated, never edited. Everything else writes on its own;
 * nothing here opens a form.
 */
export function CrmAccountDetailPage({ accountId, navigate, currentUser }: { accountId: string; navigate: (path: string) => void; currentUser: AuthUserSummary | null }) {
  const { language, t } = useLanguage()
  const [account, setAccount] = useState<ApiCustomerDetail | null>(null)
  const [state, setState] = useState<"loading" | "ready" | "error">("loading")
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [addContactOpen, setAddContactOpen] = useState(false)
  const [coverDialogOpen, setCoverDialogOpen] = useState(false)
  const [coverSavingId, setCoverSavingId] = useState<string | null>(null)
  const [coverError, setCoverError] = useState<string | null>(null)
  const coverTriggerRef = useRef<HTMLButtonElement>(null)
  const [reference, setReference] = useState<CustomerReference | null>(null)
  const [companyTypesSaving, setCompanyTypesSaving] = useState(false)
  const [companyTypeIdsDraft, setCompanyTypeIdsDraft] = useState<string[] | null>(null)
  const [visits, setVisits] = useState<MileageVisit[]>([])
  const [visitsError, setVisitsError] = useState("")
  const [visitsLoading, setVisitsLoading] = useState(true)
  const [visitsReload, setVisitsReload] = useState(0)
  const [receivables, setReceivables] = useState<{ state: "loading" | "ready" | "unavailable"; financial: CustomerAccountFinancial | null }>({ state: "loading", financial: null })
  useEffect(() => {
    let active = true
    setVisits([]); setVisitsError(""); setVisitsLoading(true)
    mileageRequest<MileageVisit[]>("visits", { account_id: accountId }).then(data => { if (active) setVisits(data) }).catch(error => { if (active) setVisitsError(error instanceof Error ? error.message : "Visits could not be loaded.") }).finally(() => { if (active) setVisitsLoading(false) })
    return () => { active = false }
  }, [accountId, visitsReload])
  const [activeTab, setActiveTab] = useState<AccountDetailTab>(readAccountTab)
  const [warehouseVisited, setWarehouseVisited] = useState(() => readAccountTab() === "warehouse")
  const [activeRole, setActiveRole] = useState<string | null>(null)
  const [allShipmentsShown, setAllShipmentsShown] = useState(false)
  const accountRef = useRef<ApiCustomerDetail | null>(null)
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const confirmedCompanyTypeIdsRef = useRef<string[]>([])
  const companyTypeIdsDraftRef = useRef<string[] | null>(null)
  const companyTypesSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const companyTypesSaveInFlightRef = useRef(false)

  useEffect(() => {
    accountRef.current = account
  }, [account])

  useEffect(() => {
    if (!account || !reference || companyTypeIdsDraftRef.current) return
    confirmedCompanyTypeIdsRef.current = organisationTypeIds(account.types, reference)
  }, [account, reference])

  useEffect(
    () => () => {
      if (companyTypesSaveTimerRef.current) clearTimeout(companyTypesSaveTimerRef.current)
    },
    [],
  )

  useEffect(() => {
    if (companyTypesSaveTimerRef.current) clearTimeout(companyTypesSaveTimerRef.current)
    companyTypesSaveTimerRef.current = null
    companyTypeIdsDraftRef.current = null
    confirmedCompanyTypeIdsRef.current = []
    setCompanyTypeIdsDraft(null)
    setAllShipmentsShown(false)
  }, [accountId])

  useEffect(() => {
    let active = true
    setState("loading")
    setError(null)
    Promise.all([getCustomer(accountId), getCustomerReference()])
      .then(([data, nextReference]) => {
        if (!active) return
        setAccount(data)
        setReference(nextReference)
        setState("ready")
      })
      .catch((cause) => {
        if (!active) return
        setError(cause instanceof Error ? cause.message : t("This company could not be loaded. Check your connection and try again."))
        setState("error")
      })
    return () => {
      active = false
    }
  }, [accountId, reloadToken, t])

  const roleOptions = useMemo(() => (account ? accountRoleOptions(account, t) : []), [account, t])
  const financialVisible = account ? accountHasFinancialRole(account) : false
  const isCustomer = account ? organisationIsCustomer(account.types) : false
  // Known before the request, so the strip reserves the finance figures instead of growing when they land.
  const showReceivables = isCustomer && hasPermission(currentUser, "Finance.Receivables.View")
  const accountName = account?.name ?? null

  useEffect(() => {
    if (!account) return
    if ((activeTab === "roles" && !roleOptions.length) || (activeTab === "financial" && !financialVisible)) changeTab("overview")
    if (roleOptions.length && !roleOptions.some((role) => role.id === activeRole)) setActiveRole(roleOptions[0].id)
  }, [account, activeRole, activeTab, financialVisible, roleOptions]) // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * What the customer owes, from the same receivables register Finance reads,
   * so the figure and its permission check are the register's own. Only a
   * customer has one, and only someone allowed to see receivables gets it.
   */
  useEffect(() => {
    setReceivables({ state: "loading", financial: null })
    if (!accountName || !showReceivables) return
    let active = true
    listAccountsPage({ organisationType: "customer", search: accountName, limit: 10, offset: 0 }, { forceRefresh: true })
      .then((page) => {
        if (!active) return
        const financial = page.financialAccess ? page.rows.find((row) => row.id === accountId)?.financial ?? null : null
        setReceivables(financial?.financeReady ? { state: "ready", financial } : { state: "unavailable", financial: null })
      })
      .catch(() => { if (active) setReceivables({ state: "unavailable", financial: null }) })
    return () => { active = false }
  }, [accountId, accountName, showReceivables])

  function changeTab(tab: AccountDetailTab) {
    setActiveTab(tab)
    if (tab === "warehouse") setWarehouseVisited(true)
    writeAccountTab(tab)
  }

  /**
   * One field's change, sent as a complete record because the endpoint takes the
   * whole shape. Saves are serialised and each draft is rebuilt from the latest
   * confirmed response, so rapid edits cannot finish out of order and overwrite
   * a neighbouring field.
   *
   * It throws on failure on purpose: the control that was changed catches it, puts
   * its own value back and shows the reason next to itself.
   */
  const patch = useCallback(
    (change: Partial<AccountDraft> | ((current: AccountDraft) => Partial<AccountDraft>)) => {
      const save = saveQueueRef.current.then(async () => {
        const current = accountRef.current
        if (!current) return
        const currentDraft = toDraft(current, reference)
        const changed = typeof change === "function" ? change(currentDraft) : change
        const next = { ...currentDraft, ...changed }
        const metadata = changed.customFields ? updateCompanyCustomFields(next.metadata, changed.customFields) : next.metadata
        try {
          const updated = await updateAccount(accountId, { ...next, metadata }, current.editVersion)
          accountRef.current = updated
          setAccount(updated)
        } catch (cause) {
          if (!(cause instanceof CustomerApiError) || cause.status !== 409) throw cause
          try {
            const latest = await getCustomer(accountId, { forceRefresh: true })
            accountRef.current = latest
            setAccount(latest)
            throw new CustomerApiError(t("This company changed elsewhere. Your edit was not saved; the latest version is now shown."), 409)
          } catch (refreshCause) {
            if (refreshCause instanceof CustomerApiError && refreshCause.status === 409) throw refreshCause
            throw new CustomerApiError(t("This company changed elsewhere. Your edit was not saved. Reload to see the latest version."), 409)
          }
        }
      })
      saveQueueRef.current = save.catch(() => undefined)
      return save
    },
    [accountId, reference, t],
  )

  const patchCompanyTypes = useCallback(
    (orgTypeIds: string[]) => {
      const save = saveQueueRef.current.then(async () => {
        const current = accountRef.current
        if (!current) return
        try {
          const result = await updateAccountCompanyTypes(accountId, { name: current.name, orgTypeIds }, current.editVersion)
          const updated = {
            ...current,
            editVersion: result.editVersion,
            types: (reference?.organisationTypes ?? []).filter((type) => orgTypeIds.includes(type.id)).map((type) => type.name),
          }
          accountRef.current = updated
          setAccount(updated)
        } catch (cause) {
          if (!(cause instanceof CustomerApiError) || cause.status !== 409) throw cause
          try {
            const latest = await getCustomer(accountId, { forceRefresh: true })
            accountRef.current = latest
            setAccount(latest)
            throw new CustomerApiError(t("This company changed elsewhere. Your edit was not saved; the latest version is now shown."), 409)
          } catch (refreshCause) {
            if (refreshCause instanceof CustomerApiError && refreshCause.status === 409) throw refreshCause
            throw new CustomerApiError(t("This company changed elsewhere. Your edit was not saved. Reload to see the latest version."), 409)
          }
        }
      })
      saveQueueRef.current = save.catch(() => undefined)
      return save
    },
    [accountId, reference, t],
  )

  const customFields = useMemo(() => {
    const stored = account?.metadata.customFields
    const record = stored && typeof stored === "object" ? (stored as Record<string, unknown>) : {}
    return Object.entries(record).map(([label, value]) => ({
      id: label,
      label,
      value: typeof value === "string" ? value : String(value),
    }))
  }, [account])

  const quoteTerms = useMemo(() => {
    const stored = account?.metadata.quoteTerms
    const record = stored && typeof stored === "object" ? stored as Record<string, unknown> : {}
    return {
      terms: typeof record.terms === "string" ? record.terms : "",
      subjectTo: typeof record.subjectTo === "string" ? record.subjectTo : "",
      notes: typeof record.notes === "string" ? record.notes : "",
      deadline: typeof record.deadline === "string" ? record.deadline : "",
      followUpDays: Number.isInteger(Number(record.followUpDays)) && Number(record.followUpDays) >= 1 && Number(record.followUpDays) <= 30
        ? Number(record.followUpDays)
        : null,
    }
  }, [account])

  const moments = useMemo<Moment[]>(() => {
    if (!account) return []
    const activities = account.activities.map((activity) => ({
      id: `activity-${activity.id}`,
      at: activity.occurredAt,
      subject: activity.subject,
      detail: activity.summary,
      email: null,
    }))
    const emails = account.recentEmails.available
      ? account.recentEmails.items.map((item) => ({
          id: `email-${item.id}`,
          at: item.occurredAt,
          subject: item.subject,
          detail: [item.contactName || item.contactEmail, item.preview].filter(Boolean).join(" · ") || null,
          email: { threadId: item.threadId, direction: item.direction },
        }))
      : []
    return [...activities, ...emails].sort((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime())
  }, [account])

  const back = { label: t("Companies"), onClick: () => navigate("/crm/accounts") }

  if (state === "loading") {
    return (
      <div className="md-page md-page-stack-compact">
        <RecordProfileSkeleton />
      </div>
    )
  }

  if (state === "error" || !account) {
    return (
      <div className="md-page md-page-stack-compact">
        <Button type="button" variant="ghost" className="-ms-2 h-8 w-fit rounded-[var(--md-radius-md)] px-2 text-[12px] font-medium text-[var(--md-text)]" onClick={back.onClick}>{t("Back to companies")}</Button>
        <Surface padding="lg" className="grid min-h-[320px] place-items-center rounded-[var(--md-radius-xl)] text-center" role="alert">
          <div className="max-w-md">
            <p className="text-[15px] font-medium text-[var(--md-ink)]">{t("Company unavailable")}</p>
            {error ? <p className="mt-2 text-[13px] leading-5 text-[var(--md-text)]">{error}</p> : null}
            <Button variant="outline" className="mt-4" onClick={() => setReloadToken((value) => value + 1)}>
              <RefreshCw className="size-4" strokeWidth={1.5} />
              {t("Try again")}
            </Button>
          </div>
        </Surface>
      </div>
    )
  }

  const openExceptions = account.activeShipments.reduce((total, shipment) => total + shipment.openExceptionCount, 0)
  const currentAccount = account
  const storedCompanyTypeIds = organisationTypeIds(currentAccount.types, reference)
  const currentTypeIds = companyTypeIdsDraft ?? storedCompanyTypeIds
  const currentCompanyTypes = reference ? reference.organisationTypes.filter((type) => currentTypeIds.includes(type.id)) : currentAccount.types.map((name) => ({ id: name, name }))
  const customerClassificationTypes = reference?.organisationTypes.filter((type) => isCustomerClassification(type.name)) ?? []
  const operationalRoleTypes = reference?.organisationTypes.filter((type) => !isCustomerClassification(type.name) && !isLegacyKeyCustomerRole(type.name)) ?? []
  const address = currentAccount.address
  const businessProfile = companyProfile(currentAccount.metadata)
  const companyCover = selectedCompanyCover(currentAccount.id, currentAccount.metadata)
  const savedCoverId = companyCovers.find((cover) => cover.id === currentAccount.metadata.companyCoverId)?.id ?? null
  const canChangeCover = hasPermission(currentUser, "Customers.Write")

  async function saveCompanyCover(coverId: string | null) {
    if (coverSavingId || !canChangeCover) return
    if (coverId === savedCoverId || (coverId === null && savedCoverId === null)) {
      setCoverDialogOpen(false)
      return
    }
    setCoverSavingId(coverId ?? "default")
    setCoverError(null)
    try {
      await patch((current) => {
        const metadata = { ...current.metadata }
        if (coverId) metadata.companyCoverId = coverId
        else delete metadata.companyCoverId
        return { metadata }
      })
      setCoverDialogOpen(false)
      toast.success(t("Company cover updated"))
    } catch (cause) {
      setCoverError(cause instanceof CustomerApiError ? cause.message : t("The cover could not be saved. Check your connection and try again."))
    } finally {
      setCoverSavingId(null)
    }
  }
  const saveBusinessProfile = (key: CompanyProfileKey, value: string) => patch(current => ({ metadata: updateCompanyProfile(current.metadata, key, value) }))
  const saveAddressField = (key: keyof AccountDraft["address"], value: string) => patch(current => {
    if (key === "countryCode" && value && !/^[a-z]{2}$/i.test(value)) throw new Error("Use a two-letter country code, for example GB.")
    if (key === "mainEmail" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error("Enter a valid company email address.")
    return { address: { ...current.address, [key]: (key === "countryCode" ? value.toUpperCase() : value) || null } }
  })
  const relationshipName = reference?.relationshipStatuses.find(status => status.code === currentAccount.relationshipStatus)?.name || humanize(currentAccount.relationshipStatus)
  // Without a recorded vertical the service falls back to a role name ("Supplier"), which the roles already say.
  const industry = currentAccount.vertical || null
  // Customer classification leads, then the operational roles in the order they were given.
  const orderedTypeNames = [...currentCompanyTypes].sort((left, right) => Number(isCustomerClassification(right.name)) - Number(isCustomerClassification(left.name))).map((type) => t(type.name))
  const tradeLane = [humanize(currentAccount.primaryMode), currentAccount.primaryTradeLane].filter(Boolean).join(" · ")
  const addressLine = address ? [address.line1, address.townCity, address.postZipCode, address.countryCode].filter(Boolean).join(", ") : ""
  const financial = receivables.financial
  // The record carries a short sample of people; the count is the register's own total.
  const peopleCount = Math.max(currentAccount.contactCount ?? 0, currentAccount.contacts.length)
  const overdue = Number(financial?.overdueAmount ?? 0)
  const money = (value: number | null | undefined, currency: string | null | undefined) =>
    value == null || !currency || !/^[A-Z]{3}$/.test(currency) ? "—" : new Intl.NumberFormat(language, { style: "currency", currency, maximumFractionDigits: 0 }).format(value)

  async function flushCompanyTypes() {
    if (companyTypesSaveTimerRef.current) {
      clearTimeout(companyTypesSaveTimerRef.current)
      companyTypesSaveTimerRef.current = null
    }
    if (companyTypesSaveInFlightRef.current || !companyTypeIdsDraftRef.current) return

    companyTypesSaveInFlightRef.current = true
    setCompanyTypesSaving(true)
    try {
      while (companyTypeIdsDraftRef.current) {
        const requestedTypeIds = [...companyTypeIdsDraftRef.current]
        await patchCompanyTypes(requestedTypeIds)
        confirmedCompanyTypeIdsRef.current = requestedTypeIds

        if (sameIds(companyTypeIdsDraftRef.current, requestedTypeIds)) {
          companyTypeIdsDraftRef.current = null
          setCompanyTypeIdsDraft(null)
        }
      }
    } catch (cause) {
      companyTypeIdsDraftRef.current = null
      setCompanyTypeIdsDraft(null)
      toast.error(cause instanceof Error ? cause.message : t("Company types could not be saved. Check your connection and try again."))
    } finally {
      companyTypesSaveInFlightRef.current = false
      setCompanyTypesSaving(false)
    }
  }

  function discardCompanyTypeDraft() {
    if (companyTypesSaveTimerRef.current) clearTimeout(companyTypesSaveTimerRef.current)
    companyTypesSaveTimerRef.current = null
    companyTypeIdsDraftRef.current = null
    setCompanyTypeIdsDraft(null)
  }

  function validateAndFlushCompanyTypes() {
    if (!companyTypeIdsDraftRef.current) return
    if (!companyTypeIdsDraftRef.current.length) {
      discardCompanyTypeDraft()
      toast.error(t("Choose at least one company type."))
      return
    }
    void flushCompanyTypes()
  }

  function selectCompanyTypes(orgTypeIds: string[], saveDelayMs: number | null = null) {
    const nextTypeIds = [...new Set(orgTypeIds)]

    if (!companyTypesSaveInFlightRef.current && sameIds(nextTypeIds, confirmedCompanyTypeIdsRef.current)) {
      if (companyTypesSaveTimerRef.current) clearTimeout(companyTypesSaveTimerRef.current)
      companyTypesSaveTimerRef.current = null
      companyTypeIdsDraftRef.current = null
      setCompanyTypeIdsDraft(null)
      return
    }

    companyTypeIdsDraftRef.current = nextTypeIds
    setCompanyTypeIdsDraft(nextTypeIds)
    if (companyTypesSaveTimerRef.current) clearTimeout(companyTypesSaveTimerRef.current)
    if (saveDelayMs !== null) {
      companyTypesSaveTimerRef.current = setTimeout(validateAndFlushCompanyTypes, saveDelayMs)
    }
  }

  const operationsPanelProps = {
    account: currentAccount,
    canManageFinancial: hasPermission(currentUser, "Finance.Configuration.Manage"),
    canManageBankDetails: hasPermission(currentUser, "Finance.Configuration.Manage") && hasPermission(currentUser, "Finance.Banks.Manage"),
    currencyOptions: reference?.currencies ?? [],
    financeReference: {
      legalEntities: reference?.legalEntities ?? [],
      paymentTerms: reference?.paymentTerms ?? [],
      taxTreatments: reference?.taxTreatments ?? [],
    },
    onOpenContact: (contactId: string) => navigate(`/crm/contacts/${contactId}`),
    onChange: (updated: ApiCustomerDetail) => { accountRef.current = updated; setAccount(updated) },
  }

  return (
    <div className="md-page md-page-stack-compact company-record">
      <RecordProfileHeader
        back={back}
        avatar={<CustomerAvatar initials={currentAccount.initials} tone="teal" className="size-full text-[22px] tracking-[-0.01em] sm:text-[26px]" />}
        title={<HeadingField value={currentAccount.name} onSave={(name) => patch({ name })} />}
        badges={currentAccount.strategic ? <StatusPill kind="status" indicator={false} tone="blue">{t("Key Account")}</StatusPill> : null}
        meta={
          <>
            {orderedTypeNames.length ? (
              <button type="button" onClick={() => document.getElementById("company-roles")?.scrollIntoView({ behavior: "smooth", block: "center" })} className="rounded-[var(--md-radius-sm)] font-medium text-[var(--md-ink)] outline-none hover:text-[var(--md-accent)] focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a24)]" data-i18n-skip>
                {orderedTypeNames.slice(0, 3).join(", ")}
                {orderedTypeNames.length > 3 ? <span className="text-[var(--md-subtle)]"> +{orderedTypeNames.length - 3}</span> : null}
              </button>
            ) : null}
            {[industry, currentAccount.location].filter(Boolean).map((value) => (
              <span key={value} className="flex items-center gap-2" dir="auto" data-i18n-skip>
                <span aria-hidden="true" className="text-[var(--md-subtle)]">·</span>
                {value}
              </span>
            ))}
          </>
        }
        actions={
          <>
            {address?.mainEmail ? (
              <ContactEmailAction email={address.mainEmail} name={currentAccount.name} className={headerActionClass}>
                <Mail className="size-3.5 text-[var(--md-text)]" strokeWidth={1.5} aria-hidden="true" />
                {t("Email")}
              </ContactEmailAction>
            ) : null}
            {address?.mainPhone ? (
              <Button asChild variant="ghost" className={headerActionClass}>
                <a href={`tel:${address.mainPhone}`}>
                  <Phone className="size-3.5 text-[var(--md-text)]" strokeWidth={1.5} aria-hidden="true" />
                  {t("Call")}
                </a>
              </Button>
            ) : null}
            <Button type="button" variant="ghost" className={headerActionClass} onClick={() => setAddContactOpen(true)}>
              <Plus className="size-3.5 text-[var(--md-text)]" strokeWidth={1.5} aria-hidden="true" />
              {t("Add contact")}
            </Button>
          </>
        }
        bannerLabel={tradeLane ? <span className="flex items-center gap-1.5" dir="auto" data-i18n-skip><Route className="size-3 shrink-0 text-[var(--md-accent)]" strokeWidth={1.6} aria-hidden="true" />{tradeLane}</span> : null}
        bannerImageUrl={companyCover.url}
        bannerAction={canChangeCover ? <button ref={coverTriggerRef} type="button" aria-haspopup="dialog" onClick={() => { setCoverError(null); setCoverDialogOpen(true) }} className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--md-surface)_88%,transparent)] px-3 text-[12px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] backdrop-blur-md transition-[background-color,scale] hover:bg-[var(--md-surface)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a24)] active:scale-[0.96] motion-reduce:transition-none"><Image className="size-3.5" aria-hidden="true" />{t("Change cover")}</button> : null}
        stats={
          <>
            <RecordProfileStat
              label={t("Active shipments")}
              value={currentAccount.activeShipments.length}
              detail={openExceptions ? <span className="text-[var(--md-amber)]">{openExceptions} {t(openExceptions === 1 ? "open exception" : "open exceptions")}</span> : t(currentAccount.activeShipments.length ? "None need attention" : "Nothing moving")}
            />
            {showReceivables ? (
              <RecordProfileStat
                label={t("Balance due")}
                tone={financial ? "default" : "muted"}
                value={financial ? <span dir="ltr" data-i18n-skip>{money(financial.balanceDue, financial.baseCurrencyCode)}</span> : "—"}
                detail={receivables.state === "loading" ? t("Checking the sales ledger…") : !financial ? t("Not available yet") : overdue > 0 ? <span className="text-[var(--md-red)]" dir="ltr" data-i18n-skip>{money(overdue, financial.baseCurrencyCode)} {t("overdue")}</span> : t("Nothing overdue")}
              />
            ) : null}
            {showReceivables ? (
              <RecordProfileStat
                label={t("Credit available")}
                tone={!financial || financial.creditLimit == null ? "muted" : financial.availableCredit != null && financial.availableCredit < 0 ? "danger" : "default"}
                value={financial?.creditLimit != null && financial.creditCurrencyCode ? <span dir="ltr" data-i18n-skip>{money(financial.availableCredit, financial.creditCurrencyCode)}</span> : "—"}
                detail={financial?.creditLimit != null && financial.creditCurrencyCode ? <span dir="ltr" data-i18n-skip>{t("of")} {money(financial.creditLimit, financial.creditCurrencyCode)} {t("limit")}</span> : financial ? t("No credit limit set") : undefined}
              />
            ) : null}
            <RecordProfileStat label={t("Health")}>
              <ScoreFigure score={currentAccount.healthScore} tone="health" explanation={currentAccount.scoreExplanations?.health ?? null} />
            </RecordProfileStat>
            <RecordProfileStat label={t("Churn risk")}>
              <ScoreFigure score={currentAccount.churnRiskScore} tone="risk" explanation={currentAccount.scoreExplanations?.churnRisk ?? null} />
            </RecordProfileStat>
            <RecordProfileStat
              label={t("Last contact")}
              tone={currentAccount.lastContactAt ? "default" : "muted"}
              value={currentAccount.lastContactAt ? relativeDate(currentAccount.lastContactAt, language, t) : t("Never")}
              detail={currentAccount.nextActionDueAt ? `${t("Next action")} ${formatDate(currentAccount.nextActionDueAt, language)}` : undefined}
            />
          </>
        }
      />

      <div className="grid items-start gap-[var(--md-page-stack-gap-compact)] xl:grid-cols-[312px_minmax(0,1fr)]">
        <aside aria-label={t("Company profile")} className="grid min-w-0 content-start items-start gap-[var(--md-page-stack-gap-compact)] md:grid-cols-2 xl:grid-cols-1">
          <ProfileCard title={t("About")} action={<Button variant="ghost" className="h-7 px-2 text-[12px]" onClick={() => changeTab("details")}>{t("Edit")}<ArrowRight className="size-3.5 rtl:rotate-180" /></Button>}>
            {currentAccount.summary ? (
              <p className="line-clamp-4 whitespace-pre-wrap text-pretty text-[12.5px] leading-5 text-[var(--md-text)]" dir="auto" data-i18n-skip title={currentAccount.summary}>{currentAccount.summary}</p>
            ) : null}
            <dl className={cn("grid gap-0.5", currentAccount.summary && "mt-3")}>
              <Fact icon={UserRound} label={t("Owner")} value={currentAccount.ownerName || <span className="text-[var(--md-subtle)]">{t("Unassigned")}</span>} />
              <Fact icon={Handshake} label={t("Relationship")} value={relationshipName} />
              <Fact icon={Briefcase} label={t("Industry")} value={industry} />
              <Fact icon={Trophy} label={t("Tier")} value={[currentAccount.tier, currentAccount.segment].filter(Boolean).join(" · ")} />
              <Fact icon={Tag} label={t("Company code")} value={currentAccount.accountCode ? <span dir="ltr" data-i18n-skip>{currentAccount.accountCode}</span> : null} />
              <Fact icon={Users} label={t("Employees")} value={businessProfile.employeeCount} />
              {isCustomer ? <Fact icon={CalendarDays} label={t("Customer since")} value={formatDate(currentAccount.customerSince, language)} /> : null}
            </dl>
            {address?.mainEmail || address?.mainPhone || businessProfile.website || businessProfile.linkedInUrl || addressLine ? (
              <div className="mt-3 grid gap-0.5 border-t border-[var(--md-line)] pt-3">
                {address?.mainEmail ? <Reach icon={Mail} label={t("Email")}><ContactEmailAction email={address.mainEmail} name={currentAccount.name} className="min-h-0 max-w-full text-[12.5px] leading-5"><span className="truncate" dir="ltr" data-i18n-skip>{address.mainEmail}</span></ContactEmailAction></Reach> : null}
                {address?.mainPhone ? <Reach icon={Phone} label={t("Phone")}><a href={`tel:${address.mainPhone}`} dir="ltr" className="truncate text-[12.5px] text-[var(--md-ink)] underline-offset-2 hover:text-[var(--md-accent)] hover:underline">{address.mainPhone}</a></Reach> : null}
                {businessProfile.website ? <Reach icon={Globe2} label={t("Website")}><ExternalLink href={businessProfile.website} /></Reach> : null}
                {businessProfile.linkedInUrl ? <Reach icon={LinkedinBrand} label="LinkedIn"><ExternalLink href={businessProfile.linkedInUrl} /></Reach> : null}
                {addressLine ? <Reach icon={MapPin} label={t("Address")}><button type="button" onClick={() => changeTab("addresses")} className="min-w-0 text-start text-[12.5px] leading-5 text-[var(--md-ink)] outline-none hover:text-[var(--md-accent)] focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a24)]" dir="auto" data-i18n-skip>{addressLine}</button></Reach> : null}
              </div>
            ) : null}
          </ProfileCard>

          <div className="grid min-w-0 content-start gap-[var(--md-page-stack-gap-compact)]">
            <ProfileCard
              title={t("People")}
              meta={peopleCount ? String(peopleCount) : undefined}
              action={<Button type="button" variant="ghost" className="h-7 px-2 text-[12px]" onClick={() => setAddContactOpen(true)}><Plus className="size-3.5" strokeWidth={1.5} />{t("Add")}</Button>}
              flush
            >
              {currentAccount.contacts.length ? (
                <ul className="grid">
                  {currentAccount.contacts.slice(0, 5).map((contact) => (
                    <li key={contact.id} className="flex min-w-0 items-center gap-0.5 border-t border-[var(--md-line)] py-1 pe-2 ps-2 first:border-t-0">
                      <button type="button" onClick={() => navigate(`/crm/contacts/${contact.id}`)} className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-[var(--md-radius-md)] px-2 py-1 text-start outline-none transition-[background-color,scale] duration-150 ease-out hover:bg-[var(--md-surface-tint)] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)] active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100">
                        <CustomerAvatar initials={contact.initials} tone="blue" size="sm" className="rounded-full" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium text-[var(--md-ink)]" dir="auto" data-i18n-skip>{contact.name}</span>
                          <span className="mt-0.5 block truncate text-[11.5px] text-[var(--md-text)]" dir="auto">{contact.jobTitle || contact.role || contact.email || t("No details recorded yet")}</span>
                        </span>
                      </button>
                      {contact.email ? (
                        <ContactEmailAction email={contact.email} name={contact.name} className="grid size-8 min-h-8 shrink-0 place-items-center rounded-[var(--md-radius-md)] text-[var(--md-text)] hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)]">
                          <Mail className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
                        </ContactEmailAction>
                      ) : null}
                      <ContactPreferencesPopover compact contactId={contact.id} name={contact.name} onSaved={next => setAccount(current => current ? { ...current, contacts: current.contacts.map(item => item.id === next.id ? next : item) } : current)} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-4 pb-4 text-[12.5px] leading-5 text-[var(--md-text)]">{t("Add the people you deal with at this company.")}</p>
              )}
              {peopleCount > 5 ? (
                <button type="button" onClick={() => changeTab("contacts")} className="flex h-10 w-full items-center justify-center gap-1.5 border-t border-[var(--md-line)] text-[12px] font-medium text-[var(--md-text)] outline-none transition-colors duration-150 hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--md-accent-a24)]">
                  {t("All")} {peopleCount} {t("people")}
                  <ArrowRight className="size-3.5 rtl:rotate-180" strokeWidth={1.5} />
                </button>
              ) : null}
            </ProfileCard>

            <ProfileCard title={t("Roles")} id="company-roles" meta={companyTypesSaving ? t("Saving…") : undefined}>
              <div className="flex flex-wrap items-center gap-1.5" aria-label={t("Company types")} aria-busy={companyTypesSaving}>
                {currentCompanyTypes.map((type) => {
                  const canRemove = Boolean(reference && type.id)
                  return (
                    <StatusPill key={type.id} kind="status" indicator={false} tone={isCustomerClassification(type.name) ? "teal" : "neutral"} className="group/type isolate gap-0">
                      <span className="whitespace-nowrap">{t(type.name)}</span>
                      {canRemove ? (
                        <span className="md-company-type-remove-slot ms-0 inline-grid w-0 shrink-0 translate-x-1 scale-75 place-items-center overflow-hidden opacity-0 rtl:-translate-x-1 group-hover/type:ms-1 group-hover/type:w-5 group-hover/type:translate-x-0 group-hover/type:scale-100 group-hover/type:overflow-visible group-hover/type:opacity-100 group-focus-within/type:ms-1 group-focus-within/type:w-5 group-focus-within/type:translate-x-0 group-focus-within/type:scale-100 group-focus-within/type:overflow-visible group-focus-within/type:opacity-100 [@media(hover:none)]:ms-1 [@media(hover:none)]:w-5 [@media(hover:none)]:translate-x-0 [@media(hover:none)]:scale-100 [@media(hover:none)]:overflow-visible [@media(hover:none)]:opacity-100 motion-reduce:translate-x-0 motion-reduce:scale-100">
                          <button
                            type="button"
                            aria-label={`${t("Remove company type")}: ${t(type.name)}`}
                            className="md-company-type-remove grid size-5 place-items-center rounded-[calc(var(--md-radius-md)-2px)] text-current outline-none hover:bg-[color-mix(in_srgb,currentColor_12%,transparent)] focus-visible:ring-1 focus-visible:ring-current active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-35"
                            onClick={() => selectCompanyTypes(currentTypeIds.filter((id) => id !== type.id), 0)}
                          >
                            <X className="size-3" strokeWidth={1.7} aria-hidden="true" />
                          </button>
                        </span>
                      ) : null}
                    </StatusPill>
                  )
                })}
                {reference?.organisationTypes.length ? (
                  <DropdownMenu
                    onOpenChange={(open) => {
                      if (!open) validateAndFlushCompanyTypes()
                    }}
                  >
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="ghost" size="icon" aria-label={t("Edit company types")} disabled={!reference} className="size-6 shrink-0 rounded-full bg-[var(--md-surface)] text-[var(--md-text)] shadow-[0_0_0_1px_var(--md-line)] transition-[background-color,color,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[var(--md-surface-tint)] hover:text-[var(--md-ink)] active:scale-[0.96] motion-reduce:transform-none motion-reduce:transition-none">
                        <Plus className="size-3.5" strokeWidth={1.6} aria-hidden="true" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-[min(260px,calc(100vw-32px))] rounded-[var(--md-radius-lg)]">
                      <DropdownMenuLabel>{t("Customer classification")}</DropdownMenuLabel>
                      {customerClassificationTypes.map((type) => (
                        <DropdownMenuCheckboxItem
                          key={type.id}
                          checked={currentTypeIds.includes(type.id)}
                          onSelect={(event) => event.preventDefault()}
                          onCheckedChange={(checked) => selectCompanyTypes(
                            checked === true
                              ? selectCustomerClassification(currentTypeIds, type.id, reference.organisationTypes)
                              : clearCustomerClassification(currentTypeIds, reference.organisationTypes),
                          )}
                        >
                          <StatusPill kind="status" indicator={false} tone="neutral">{t(type.name)}</StatusPill>
                        </DropdownMenuCheckboxItem>
                      ))}
                      {operationalRoleTypes.length ? <DropdownMenuSeparator /> : null}
                      {operationalRoleTypes.length ? <DropdownMenuLabel>{t("Other roles")}</DropdownMenuLabel> : null}
                      {operationalRoleTypes.map((type) => (
                        <DropdownMenuCheckboxItem key={type.id} checked={currentTypeIds.includes(type.id)} onSelect={(event) => event.preventDefault()} onCheckedChange={(checked) => selectCompanyTypes(checked === true ? [...currentTypeIds, type.id] : currentTypeIds.filter((id) => id !== type.id))}>
                          <StatusPill kind="status" indicator={false} tone="neutral">{t(type.name)}</StatusPill>
                        </DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </div>
              {roleOptions.length ? (
                <button type="button" onClick={() => changeTab("roles")} className="mt-2.5 inline-flex items-center gap-1 text-[11.5px] font-medium text-[var(--md-text)] outline-none hover:text-[var(--md-accent)] focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a24)]">
                  {t("Role settings")}
                  <ArrowRight className="size-3 rtl:rotate-180" strokeWidth={1.5} />
                </button>
              ) : null}
            </ProfileCard>

            <CompanyScreening key={currentAccount.id} companyId={currentAccount.id} companyName={currentAccount.name} subjectRole={isCustomer ? "customer" : currentAccount.types.some((type) => normaliseOrganisationRole(type) === "supplier") ? "supplier" : "party"} />
          </div>
        </aside>

        <div className="grid min-w-0 content-start gap-[var(--md-page-stack-gap-compact)]">
          <AccountDetailTabs account={currentAccount} activeTab={activeTab} onChange={changeTab} />

          <div hidden={activeTab !== "notes"}>
            <LifecycleNotes subjectType="company" subjectId={currentAccount.id} title="Company notes" />
          </div>

          {/* Keep editable fields mounted: tab changes must not discard drafts or save feedback. */}
          <div hidden={activeTab !== "details"}>
            <div className="grid gap-[var(--md-page-stack-gap-compact)]">
              <Zone title={t("Company information")}>
                <InlineFieldGroup compact>
                  <div className="grid items-start gap-x-6 gap-y-1 lg:grid-cols-2 2xl:grid-cols-3">
                    <InlineField label="Company name" value={currentAccount.name} required onSave={name => patch({ name })} />
                    <InlineField label="Registered name" value={businessProfile.registeredName ?? ""} placeholder="If different from company name" onSave={value => saveBusinessProfile("registeredName", value)} />
                    <InlineField label="Company code" width="medium" value={currentAccount.accountCode ?? ""} readOnly align="start" />
                    <InlineField label="Registration no." width="medium" value={businessProfile.registrationNumber ?? ""} onSave={value => saveBusinessProfile("registrationNumber", value)} />
                    <InlineField label="Website" kind="url" value={businessProfile.website ?? ""} placeholder="https://example.com" onSave={value => saveBusinessProfile("website", value)} />
                    <InlineField label="LinkedIn" kind="url" value={businessProfile.linkedInUrl ?? ""} placeholder="Company page URL" onSave={value => saveBusinessProfile("linkedInUrl", value)} />
                    <InlineField label="Employees" kind="number" width="short" value={businessProfile.employeeCount ?? ""} onSave={value => saveBusinessProfile("employeeCount", value)} />
                    <InlineField label="Source" width="medium" value={businessProfile.source ?? ""} placeholder="Referral, event, website…" onSave={value => saveBusinessProfile("source", value)} />
                    <InlineField label="Account owner" value={currentAccount.ownerName ?? ""} readOnly align="start" />
                  </div>
                </InlineFieldGroup>
              </Zone>

              <Zone title={t("Main contact & address")}>
                <InlineFieldGroup compact>
                  <div className="grid items-start gap-x-6 gap-y-1 lg:grid-cols-2 2xl:grid-cols-3">
                    <InlineField label="Company email" kind="email" value={address?.mainEmail ?? ""} onSave={value => saveAddressField("mainEmail", value)} />
                    <InlineField label="Phone" kind="tel" width="medium" value={address?.mainPhone ?? ""} onSave={value => saveAddressField("mainPhone", value)} />
                    <InlineField label="Country" width="short" value={address?.countryCode ?? ""} placeholder="GB" onSave={value => saveAddressField("countryCode", value)} />
                    <AddressSearch key={currentAccount.id} confirm label={addressFieldLabel(address?.countryCode, "line1")} value={address?.line1 ?? ""} onSaveText={value => saveAddressField("line1", value)} onSelect={selected => patch(current => ({ address: { ...current.address, ...selected } }))} />
                    <InlineField label="Address line 2" value={address?.line2 ?? ""} onSave={value => saveAddressField("line2", value)} />
                    <InlineField label={addressFieldLabel(address?.countryCode, "townCity")} value={address?.townCity ?? ""} onSave={value => saveAddressField("townCity", value)} />
                    <InlineField label={addressFieldLabel(address?.countryCode, "countyState")} value={address?.countyState ?? ""} onSave={value => saveAddressField("countyState", value)} />
                    <AddressSearch confirm field="postZipCode" label={addressFieldLabel(address?.countryCode, "postZipCode")} value={address?.postZipCode ?? ""} onSaveText={value => saveAddressField("postZipCode", value)} onSelect={selected => patch(current => ({ address: { ...current.address, ...selected } }))} />
                  </div>
                </InlineFieldGroup>
              </Zone>

              <Zone title={t("Relationship & service")} action={<div className="flex flex-wrap items-center gap-2"><InlineToggleChip label="Strategic account" checked={currentAccount.strategic} onSave={(strategic) => patch({ strategic })} /><AddCustomField onAdd={(label, value) => patch(current => {
                if (current.customFields.some(field => field.label.toLowerCase() === label.toLowerCase())) throw new Error("A field with this name already exists. Choose another name.")
                return { customFields: [...current.customFields, { id: label, label, value }] }
              })} /></div>}>
                <InlineFieldGroup compact>
                  <div className="grid items-start gap-x-6 gap-y-1 lg:grid-cols-2 2xl:grid-cols-3">
                    <div className="min-w-0 lg:col-span-2"><InlineField label="Summary" kind="textarea" align="start" value={currentAccount.summary ?? ""} placeholder="What this account buys, and what matters to them" onSave={(summary) => patch({ summary: summary || null })} /></div>
                    <InlineSelectField
                      label="Relationship"
                      width="medium"
                      value={currentAccount.relationshipStatus}
                      options={(reference?.relationshipStatuses ?? []).map((status) => ({
                        value: status.code,
                        label: status.name,
                      }))}
                      onSave={(relationshipStatus) => patch({ relationshipStatus })}
                    />
                    <InlineField label="Tier" width="short" value={currentAccount.tier ?? ""} onSave={(tier) => patch({ tier: tier || null })} />
                    <InlineField label="Segment" value={currentAccount.segment ?? ""} onSave={(segment) => patch({ segment: segment || null })} />
                    <InlineField label="Industry" value={currentAccount.vertical ?? ""} onSave={(vertical) => patch({ vertical: vertical || null })} />
                    <InlineField label="Primary mode" width="short" value={currentAccount.primaryMode ?? ""} onSave={(primaryMode) => patch({ primaryMode: primaryMode || null })} />
                    <InlineField label="Trade lane" value={currentAccount.primaryTradeLane ?? ""} onSave={(primaryTradeLane) => patch({ primaryTradeLane: primaryTradeLane || null })} />
                    <InlineField label="Growth state" width="medium" value={currentAccount.growthState ?? ""} onSave={(growthState) => patch({ growthState: growthState || null })} />
                    {customFields.map((field) => (
                      <div key={field.id} className="group/custom-field relative min-w-0">
                        <InlineField
                          label={field.label}
                          value={field.value}
                          onSave={(value) =>
                            patch(current => ({
                              customFields: current.customFields.map((item) => (item.id === field.id ? { ...item, value } : item)),
                            }))
                          }
                        />
                        <button
                          type="button"
                          aria-label={`${t("Remove field")}: ${field.label}`}
                          className="absolute -end-3 top-2 grid size-6 place-items-center rounded-[var(--md-radius-sm)] text-[var(--md-subtle)] opacity-0 outline-none transition-[color,opacity] duration-150 hover:bg-[var(--md-surface-tint)] hover:text-[var(--md-red)] focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a24)] group-hover/custom-field:opacity-100"
                          onClick={async () => {
                            try {
                              await patch(current => ({
                                customFields: current.customFields.filter((item) => item.id !== field.id),
                              }))
                            } catch (cause) {
                              toast.error(cause instanceof Error ? cause.message : t("That field could not be removed."))
                            }
                          }}
                        >
                          <Trash2 className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>
                </InlineFieldGroup>
              </Zone>

              <Zone title={t("Quote defaults")}>
                <p className="mb-3 max-w-3xl text-[12px] leading-5 text-[var(--md-text)]">
                  {t("Applied to new quotes. Existing quotes are unchanged. Leave the follow-up delay blank to use company policy.")}
                </p>
                <InlineFieldGroup compact>
                  <div className="grid items-start gap-x-6 gap-y-1 lg:grid-cols-2 [--md-inline-label-width:128px]">
                    <InlineField
                      label="Terms and conditions"
                      kind="textarea"
                      align="start"
                      value={quoteTerms.terms}
                      placeholder="Agreed trading terms for this customer"
                      onSave={(terms) => patch(current => ({ metadata: updateQuoteDefaults(current.metadata, { terms }) }))}
                    />
                    <InlineField
                      label="Subject to rate / space"
                      kind="textarea"
                      align="start"
                      value={quoteTerms.subjectTo}
                      placeholder="Default rate, space and equipment caveats"
                      onSave={(subjectTo) => patch(current => ({ metadata: updateQuoteDefaults(current.metadata, { subjectTo }) }))}
                    />
                    <InlineField
                      label="Customer quote notes"
                      kind="textarea"
                      align="start"
                      value={quoteTerms.notes}
                      placeholder="Instructions or notes to carry into each new quote"
                      onSave={(notes) => patch(current => ({ metadata: updateQuoteDefaults(current.metadata, { notes }) }))}
                    />
                    <div className="grid min-w-0 gap-y-1">
                    <InlineField
                      label="Default response deadline"
                      width="medium"
                      kind="date"
                      align="start"
                      value={quoteTerms.deadline}
                      placeholder="Select date"
                      onSave={(deadline) => patch(current => ({ metadata: updateQuoteDefaults(current.metadata, { deadline }) }))}
                    />
                    <InlineField
                      label="Quote follow-up delay"
                      width="medium"
                      kind="number"
                      align="start"
                      value={quoteTerms.followUpDays === null ? "" : String(quoteTerms.followUpDays)}
                      placeholder="Use company policy"
                      hint="1–30 days after sending. Leave blank to use the company policy."
                      onSave={(followUpDays) => {
                        const parsed = followUpDays ? Number(followUpDays) : null
                        if (parsed !== null && (!Number.isInteger(parsed) || parsed < 1 || parsed > 30)) throw new Error("Use a whole number between 1 and 30 days.")
                        return patch(current => ({ metadata: updateQuoteDefaults(current.metadata, { followUpDays: parsed }) }))
                      }}
                    />
                    </div>
                  </div>
                </InlineFieldGroup>
              </Zone>

              {reference ? <OrganisationFoundationPanel
                account={currentAccount}
                reference={reference}
                onChange={(updated) => { accountRef.current = updated; setAccount(updated) }}
              /> : null}
            </div>
          </div>

          <div hidden={activeTab !== "overview"} className="@container">
            <div className="grid gap-[var(--md-page-stack-gap-compact)]">
              <Panel title={t("Active shipments")} meta={String(currentAccount.activeShipments.length)} action={openExceptions ? <StatusPill tone="amber">{openExceptions} {t(openExceptions === 1 ? "open exception" : "open exceptions")}</StatusPill> : undefined}>
                {currentAccount.activeShipments.length ? (
                  (allShipmentsShown ? currentAccount.activeShipments : currentAccount.activeShipments.slice(0, shipmentPreviewCount)).map((shipment) => {
                    const presentation = shipmentPresentation(shipment.status, shipment.openExceptionCount, t)
                    return (
                      <div key={shipment.id} className="grid gap-x-4 gap-y-1 border-t border-[var(--md-line)] px-4 py-3 @lg:grid-cols-[120px_minmax(0,1fr)_auto] @lg:items-center">
                        <p className="text-[12.5px] font-medium tabular-nums text-[var(--md-ink)]" dir="ltr" data-i18n-skip>
                          {shipment.reference}
                        </p>
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium text-[var(--md-ink)]" dir="auto">
                            {shipment.route || t("Route not recorded")}
                          </p>
                          <p className="mt-0.5 text-[11.5px] text-[var(--md-text)]">{[shipment.mode, shipment.status ? humanize(shipment.status) : null, shipment.eta ? `${t("ETA")} ${formatDate(shipment.eta, language)}` : null].filter(Boolean).join(" · ")}</p>
                        </div>
                        <StatusPill tone={presentation.tone} className="w-fit">{presentation.label}</StatusPill>
                      </div>
                    )
                  })
                ) : (
                  <Empty text={t("Nothing is moving for this company right now.")} />
                )}
                {currentAccount.activeShipments.length > shipmentPreviewCount ? (
                  <button type="button" aria-expanded={allShipmentsShown} onClick={() => setAllShipmentsShown((shown) => !shown)} className="flex h-10 w-full items-center justify-center border-t border-[var(--md-line)] text-[12px] font-medium text-[var(--md-text)] outline-none transition-colors duration-150 hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--md-accent-a24)]">
                    {allShipmentsShown ? t("Show fewer") : `${t("Show all")} ${currentAccount.activeShipments.length}`}
                  </button>
                ) : null}
              </Panel>

              <div className="grid items-start gap-[var(--md-page-stack-gap-compact)] @3xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
                {/* One history. Calls, notes and emails interleaved in the order they
                    happened, because that is the order they happened in. */}
                <div className="min-w-0 @3xl:relative @3xl:self-stretch">
                  <Panel title={t("History")} meta={moments.length ? t("Newest first") : undefined} className="@3xl:absolute @3xl:inset-0 @3xl:flex @3xl:flex-col">
                    {moments.length ? (
                      <ol tabIndex={0} aria-label={t("Company history")} className="md-scrollbar grid max-h-[320px] content-start overflow-y-auto border-t border-[var(--md-line)] px-2.5 pb-3 pt-1.5 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--md-accent)] sm:px-3.5 @3xl:min-h-0 @3xl:max-h-none @3xl:flex-1">
                        {moments.map((moment, index) => (
                          <MomentRow key={moment.id} moment={moment} last={index === moments.length - 1} onOpen={moment.email ? () => navigate(`/inbox?thread=${moment.email?.threadId}`) : undefined} />
                        ))}
                      </ol>
                    ) : (
                      <Empty text={t("No activity has been recorded and no recent emails are linked to this company or its people.")} />
                    )}
                    {!currentAccount.recentEmails.available ? <p className="border-t border-[var(--md-line)] px-4 py-2.5 text-[11.5px] leading-4 text-[var(--md-subtle)] sm:px-5">{t("Conversations are missing from this history – you need email access to include them.")}</p> : currentAccount.recentEmails.items.length === 0 && moments.length ? <p className="border-t border-[var(--md-line)] px-4 py-2.5 text-[11.5px] leading-4 text-[var(--md-subtle)] sm:px-5">{t("No recent emails are linked to this company or its people.")}</p> : null}
                  </Panel>
                </div>

                <div className="grid min-w-0 content-start gap-[var(--md-page-stack-gap-compact)]">
                  <CompanyMeetings key={currentAccount.id} accountId={currentAccount.crmAccountId ?? null} navigate={navigate} />
                  <Panel title={t("Recent visits")} action={<Button variant="ghost" size="sm" className="h-7 px-2 text-[12px]" onClick={() => navigate("/crm/trips")}>{t("Trips & mileage")}<ArrowRight data-icon="inline-end" className="rtl:rotate-180" /></Button>}>
                    {visitsLoading ? <p role="status" className="border-t border-[var(--md-line)] px-4 py-4 text-[12.5px] text-[var(--md-text)]">{t("Loading visits…")}</p> : visitsError ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--md-line)] px-4 py-3 text-[12.5px]"><p>{visitsError}</p><Button variant="outline" size="sm" onClick={() => setVisitsReload(value => value + 1)}>{t("Try again")}</Button></div> : !visits.length ? <Empty text={t("No visits recorded yet.")} /> : <ul className="grid">{visits.slice(0, 3).map(visit => <li key={visit.id} className="flex flex-wrap items-start justify-between gap-3 border-t border-[var(--md-line)] px-4 py-2.5"><div className="min-w-0"><p data-i18n-skip className="break-words text-[13px] text-[var(--md-ink)]">{visit.purpose}</p><p data-i18n-skip className="mt-0.5 text-[11.5px] text-[var(--md-text)]">{visit.employee_name} · {new Date(`${visit.trip_date}T12:00:00`).toLocaleDateString(language)}</p></div>{visit.can_open && <Button variant="ghost" size="sm" className="h-7 px-2 text-[12px]" onClick={() => navigate(`/crm/trips/${visit.id}`)}>{t("View trip")}<ArrowRight data-icon="inline-end" className="rtl:rotate-180" /></Button>}</li>)}</ul>}
                  </Panel>
                </div>
              </div>
              <PhoneCallLinkedRecordSection recordType="company" recordId={currentAccount.id} navigate={navigate} />
            </div>
          </div>

          <div hidden={activeTab !== "warehouse"}>{warehouseVisited && <WarehousePricingWorkspace key={accountId} customerOrgId={accountId} customerName={currentAccount.name} navigate={navigate} />}</div>

          {activeTab === "roles" && activeRole ? (
            <div className="grid gap-[var(--md-page-stack-gap-compact)]">
              {roleOptions.length > 1 ? (
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                  <p className="text-[12px] text-[var(--md-text)]">{t("How this company is handled in each of its roles.")}</p>
                  <ChoiceControl ariaLabel={t("Company role")} options={roleOptions.map((role) => ({ value: role.id, label: role.label }))} value={activeRole} onChange={setActiveRole} className="max-w-full" />
                </div>
              ) : null}
              <AccountOperationsPanel key={activeRole} {...operationsPanelProps} activeTab={`role:${activeRole}`} />
            </div>
          ) : activeTab === "live" ? (
            <CustomerLiveGrantWorkspace key={`live-${currentAccount.id}`} customerId={currentAccount.id} />
          ) : activeTab === "addresses" ? (
            <div className="grid gap-[var(--md-page-stack-gap-compact)]">
              {reference ? <OrganisationFoundationPanel
                account={currentAccount}
                reference={reference}
                view="addresses"
                onChange={(updated) => { accountRef.current = updated; setAccount(updated) }}
              /> : null}
              <AccountOperationsPanel {...operationsPanelProps} activeTab="addresses" />
            </div>
          ) : activeTab === "contacts" || activeTab === "financial" || activeTab === "customs" || activeTab === "documents" || activeTab === "instructions" || activeTab === "privacy" ? (
            <AccountOperationsPanel {...operationsPanelProps} activeTab={activeTab} />
          ) : null}
        </div>
      </div>

      <ContactCreateDialog
        accounts={[currentAccount]}
        fixedAccountId={currentAccount.id}
        open={addContactOpen}
        onOpenChange={setAddContactOpen}
        onCreated={(contact) => {
          setReloadToken((value) => value + 1)
          navigate(`/crm/contacts/${contact.id}`)
        }}
      />
      <Dialog open={coverDialogOpen} onOpenChange={(open) => { if (!coverSavingId) setCoverDialogOpen(open) }}>
        <DialogContent onCloseAutoFocus={(event) => { event.preventDefault(); coverTriggerRef.current?.focus() }} className="max-h-[min(88vh,760px)] overflow-y-auto border-0 bg-[var(--md-surface)] sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle>{t("Company cover")}</DialogTitle>
            <DialogDescription>{t("Choose a Multideck background for this company.")}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {companyCovers.map((cover, index) => (
              <button key={cover.id} type="button" aria-label={`${t("Background")} ${index + 1}`} aria-pressed={companyCover.id === cover.id} disabled={Boolean(coverSavingId)} onClick={() => void saveCompanyCover(cover.id)} className={cn("group relative aspect-[2.1/1] overflow-hidden rounded-[var(--md-radius-lg)] outline-none ring-inset transition-[scale,box-shadow] focus-visible:ring-2 focus-visible:ring-[var(--md-accent)] active:scale-[0.98] motion-reduce:transition-none", companyCover.id === cover.id ? "ring-2 ring-[var(--md-accent)]" : "hover:ring-2 hover:ring-[var(--md-line-strong)]")}>
                <img src={cover.url} alt="" loading="lazy" className="size-full object-cover" />
                {companyCover.id === cover.id ? <span className="absolute end-2 top-2 grid size-6 place-items-center rounded-full bg-[var(--md-surface)] text-[var(--md-accent)]"><Check className="size-3.5" aria-hidden="true" /></span> : null}
                {coverSavingId === cover.id ? <span className="absolute inset-0 grid place-items-center bg-black/25 text-white"><LoaderCircle className="size-5 animate-spin motion-reduce:animate-none" aria-hidden="true" /></span> : null}
              </button>
            ))}
          </div>
          {coverError || savedCoverId ? <div className="flex flex-wrap items-center justify-between gap-3">
            {coverError ? <p role="alert" className="text-[12px] text-[var(--md-red)]">{coverError}</p> : null}
            {savedCoverId ? <Button type="button" variant="ghost" disabled={Boolean(coverSavingId)} onClick={() => void saveCompanyCover(null)} className="ms-auto">{coverSavingId === "default" ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}{t("Use default cover")}</Button> : null}
          </div> : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** The page's own shape while the record loads, so nothing jumps when it lands. */
function RecordProfileSkeleton() {
  const { t } = useLanguage()
  return (
    <div className="grid gap-[var(--md-page-stack-gap-compact)]" role="status" aria-label={t("Loading company")}>
      <div className="overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)]">
        <div className="h-[72px] bg-[linear-gradient(120deg,var(--md-surface-tint),var(--md-surface-soft))] sm:h-[96px]" />
        <div className="flex gap-4 px-4 pb-5 sm:px-5">
          <div className="-mt-[30px] size-[68px] shrink-0 rounded-[var(--md-radius-2xl)] bg-[var(--md-surface)] p-1 sm:-mt-[38px] sm:size-[84px]"><div className="size-full rounded-[var(--md-radius-xl)] bg-[var(--md-surface-tint)]" /></div>
          <div className="grid flex-1 content-start gap-2 pt-3">
            <div className="h-6 w-[min(280px,70%)] rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)]" />
            <div className="h-3.5 w-[min(360px,90%)] rounded-[var(--md-radius-sm)] bg-[var(--md-surface-tint)]" />
          </div>
        </div>
        <div className="h-[68px] border-t border-[var(--md-line)]" />
      </div>
      <div className="grid items-start gap-[var(--md-page-stack-gap-compact)] xl:grid-cols-[312px_minmax(0,1fr)]">
        <div className="h-[320px] rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)]" />
        <div className="grid min-h-[320px] place-items-center rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)]">
          <DotGridLoaderPanel label="Loading company" minHeight={0} />
        </div>
      </div>
    </div>
  )
}

/** A section of the profile column. `flush` lets a list run edge to edge under the heading. */
function ProfileCard({ title, meta, action, id, flush = false, children }: { title: string; meta?: string; action?: ReactNode; id?: string; flush?: boolean; children: ReactNode }) {
  return (
    <section id={id} className="min-w-0 scroll-mt-24 overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)]">
      <div className="flex min-h-11 items-center justify-between gap-3 px-4 py-2">
        <h2 className="flex items-baseline gap-2 text-[13px] font-medium text-[var(--md-ink)]">
          {title}
          {meta ? <span className="text-[11.5px] font-normal tabular-nums text-[var(--md-subtle)]">{meta}</span> : null}
        </h2>
        {action}
      </div>
      <div className={flush ? "" : "px-4 pb-4"}>{children}</div>
    </section>
  )
}

/** One profile fact. Empty facts are left out rather than printed as a dash. */
function Fact({ icon: Icon, label, value }: { icon: typeof UserRound; label: string; value: ReactNode }) {
  if (value == null || value === "") return null
  return (
    <div className="grid min-h-8 grid-cols-[16px_96px_minmax(0,1fr)] items-baseline gap-2 py-1">
      <Icon className="size-3.5 translate-y-0.5 text-[var(--md-subtle)]" strokeWidth={1.4} aria-hidden="true" />
      <dt className="truncate text-[12px] text-[var(--md-subtle)]">{label}</dt>
      <dd className="min-w-0 break-words text-[12.5px] font-medium leading-5 text-[var(--md-ink)]" dir="auto">{value}</dd>
    </div>
  )
}

/** A way to reach the company. The value is the action. */
function Reach({ icon: Icon, label, children }: { icon: typeof UserRound; label: string; children: ReactNode }) {
  return (
    <div className="grid min-h-8 grid-cols-[16px_minmax(0,1fr)] items-baseline gap-2 py-1">
      <Icon className="size-3.5 translate-y-0.5 text-[var(--md-subtle)]" strokeWidth={1.4} aria-label={label} />
      <div className="flex min-w-0">{children}</div>
    </div>
  )
}

function ExternalLink({ href }: { href: string }) {
  const url = /^https?:\/\//i.test(href) ? href : `https://${href}`
  const label = url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "")
  return <a href={url} target="_blank" rel="noopener noreferrer" dir="ltr" className="truncate text-[12.5px] text-[var(--md-ink)] underline-offset-2 hover:text-[var(--md-accent)] hover:underline" data-i18n-skip>{label}</a>
}

/**
 * Party screening in the profile column. The latest result is enough to glance
 * at; the listed names behind a possible match open on request, because they
 * need the full width to be compared properly.
 */
function CompanyScreening({ companyId, companyName, subjectRole }: { companyId: string; companyName: string; subjectRole: "customer" | "supplier" | "party" }) {
  const { language, t } = useLanguage()
  const [check, setCheck] = useState<ScreeningCheck | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true)
    getScreeningWorkspace(companyId)
      .then(async (workspace) => {
        if (!active) return
        const latest = workspace.checks[0]
        if (!latest) {
          setCheck(null)
          setError(null)
          return
        }
        const detailed = latest.matches ? latest : await getScreeningCheck(latest.id)
        if (!active) return
        setCheck(detailed)
        setError(null)
      })
      .catch((cause) => active && setError(cause instanceof Error ? cause.message : t("Party screening could not be loaded.")))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [companyId, t])

  async function screen() {
    setRunning(true)
    setError(null)
    try {
      setCheck(await runScreeningCheck({
        subjectName: companyName,
        orgId: companyId,
        sourceArea: "crm",
        sourceRecordId: companyId,
        sourceLabel: companyName,
        subjectRole,
      }))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("The name could not be screened."))
    } finally {
      setRunning(false)
    }
  }

  const matchCount = check?.matches?.length ?? check?.matchCount ?? 0

  return (
    <ProfileCard title={t("Party screening")} action={check ? <ScreeningOutcomePill outcome={check.outcome} stale={check.listStale} /> : undefined}>
      {loading ? (
        <div className="flex items-center gap-2 text-[12px] text-[var(--md-subtle)]"><LoaderCircle className="size-3.5 animate-spin text-[var(--md-accent)]" aria-hidden="true" />{t("Loading screening…")}</div>
      ) : (
        <p className="text-[12px] leading-5 text-[var(--md-text)]">
          {check
            ? <>{t("Checked")} {relativeDate(check.createdAt, language, t).toLocaleLowerCase(language)} {t("against the UK OFSI list.")}{matchCount ? <> {matchCount} {t(matchCount === 1 ? "listed name needs review." : "listed names need review.")}</> : null}</>
            : t("Not screened in the last 3 months. Screen the company against the UK OFSI list stored in this workspace.")}
        </p>
      )}
      {error ? <p role="alert" className="mt-2 text-[12px] leading-5 text-[var(--md-red)]">{error}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" className="h-8 rounded-[var(--md-radius-md)] text-[12px]" onClick={() => void screen()} disabled={running || loading}>
          {running ? <LoaderCircle className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" strokeWidth={1.5} />}
          {t(check ? "Screen again" : "Screen this company")}
        </Button>
        {check && matchCount ? (
          <Button type="button" variant="ghost" size="sm" className="h-8 rounded-[var(--md-radius-md)] text-[12px]" onClick={() => setReviewOpen(true)}>
            {t("Review matches")}
          </Button>
        ) : null}
      </div>
      {check ? (
        <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
          <DialogContent className="max-h-[88vh] overflow-y-auto border-0 bg-[var(--md-surface)] sm:max-w-[760px]">
            <DialogHeader className="text-start">
              <DialogTitle>{t("Screening matches")}</DialogTitle>
              <DialogDescription>{t("Compare each listed name with this company before continuing.")}</DialogDescription>
            </DialogHeader>
            <div className="-mx-4 grid gap-3">
              <ScreeningResultSummary subjectName={check.subjectName} country={check.country} outcome={check.outcome} />
              {check.matches?.length ? <ScreeningMatchList matches={check.matches} /> : null}
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </ProfileCard>
  )
}

/**
 * A calculated score in the strip. The ring and number are intentionally static:
 * health and churn are derived signals rather than operator-authored facts.
 *
 * Eighty-two out of a hundred is not something anyone judges quickly as a number.
 * The ring says whether it is a good eighty-two – which for churn risk is the
 * opposite of what it means for health.
 */
function ScoreFigure({ score, tone, explanation }: { score: number | null; tone: "health" | "risk"; explanation: AccountScoreExplanation | null }) {
  const colour = score == null ? "var(--md-subtle)" : tone === "health" ? (score >= 70 ? "var(--md-green)" : score >= 40 ? "var(--md-amber)" : "var(--md-red)") : score >= 60 ? "var(--md-red)" : score >= 30 ? "var(--md-amber)" : "var(--md-green)"

  return (
    <ScoreExplanationPopover kind={tone === "health" ? "health" : "churnRisk"} score={score} explanation={explanation} className="-ms-1.5 mt-0.5 gap-2 rounded-[var(--md-radius-md)] px-1.5 py-0.5">
      <ProgressRing ratio={(score ?? 0) / 100} size={22} thickness={2.5} color={colour} trackOpacity={0.16} />
      <span className="text-[17px] font-medium leading-6 tabular-nums text-[var(--md-ink)]">{score == null ? "–" : `${Math.round(score)}%`}</span>
    </ScoreExplanationPopover>
  )
}

/** A company-scoped view of meetings the signed-in operator can already see. */
function CompanyMeetings({ accountId, navigate }: { accountId: string | null; navigate: (path: string) => void }) {
  const { language, t } = useLanguage()
  const [meetings, setMeetings] = useState<CalendarEvent[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selection, setSelection] = useState<MeetingDetailsAnchor | null>(null)
  const [allMeetingsShown, setAllMeetingsShown] = useState(false)
  const [reload, setReload] = useState(0)
  const [now, setNow] = useState(Date.now)
  const [timeZone, setTimeZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone)
  const refresh = useCallback(() => setReload(value => value + 1), [])
  useEffect(() => {
    const controller = new AbortController()
    const start = Date.now()
    setError(null)
    void getCalendarWorkspace(new Date(start).toISOString(), new Date(start + 365 * 86_400_000).toISOString(), controller.signal, { requireDatabase: true })
      .then(workspace => {
        if (controller.signal.aborted) return
        setMeetings(workspace.meetings.filter(event => event.linkedRecord?.type === "account" && event.linkedRecord.id === accountId && !event.private))
        setTimeZone(workspace.timeZone)
        setNow(Date.now())
      })
      .catch(() => { if (!controller.signal.aborted) setError("Meetings could not be loaded. Try again.") })
    return () => controller.abort()
  }, [accountId, reload])
  useEffect(() => {
    const returned = () => { if (!document.hidden) refresh() }
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    window.addEventListener(CALENDAR_CHANGED_EVENT, refresh)
    document.addEventListener("visibilitychange", returned)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener(CALENDAR_CHANGED_EVENT, refresh)
      document.removeEventListener("visibilitychange", returned)
    }
  }, [refresh])
  const upcoming = (meetings ?? []).filter(event => !["cancelled", "completed"].includes(event.status) && event.rsvpResponse !== "declined" && Date.parse(event.endAt) > now)
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))
  const dateFormat = new Intl.DateTimeFormat(language, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone })
  return <>
    <Panel title={t("Upcoming meetings")} meta={t("Next 12 months")}>
      <div className="min-h-[156px]">
        {error ? <div role="alert" className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-[12px] text-[var(--md-text)]"><span>{t(error)}</span><Button variant="outline" size="sm" onClick={refresh}>{t("Try again")}</Button></div> : null}
        {meetings === null && !error ? <DotGridLoaderPanel label={t("Loading meetings…")} /> : upcoming.length ? <div className="max-h-[420px] overflow-y-auto md-scrollbar">
          {(allMeetingsShown ? upcoming : upcoming.slice(0, 3)).map(event => {
            const provider = event.provider === "calendar" ? "multideck" : event.provider
            const providerLabel = event.provider === "calendar" ? event.calendarSource === "microsoft" ? "Microsoft Calendar" : "Google Calendar" : meetingProviderLabels[provider]
            return <button key={event.id} type="button" onClick={click => setSelection({ event, anchor: click.currentTarget })} className="flex min-h-14 w-full min-w-0 items-center gap-2.5 border-t border-[var(--md-line)] px-4 py-2.5 text-start transition-colors duration-150 hover:bg-[var(--md-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--md-accent)] motion-reduce:transition-none">
              <MeetingProviderMark provider={provider} calendarSource={event.calendarSource} className="size-5" />
              <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium leading-5 text-[var(--md-ink)]" data-i18n-skip>{event.title}</span><span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] leading-4 text-[var(--md-subtle)]"><time dateTime={event.startAt} title={timeZone}>{dateFormat.format(new Date(event.startAt))}</time><span aria-hidden="true">·</span><span>{providerLabel}</span>{event.status === "provisioning" || event.status === "sync_pending" ? <span>{t("Updating…")}</span> : null}</span></span>
              <ArrowRight aria-hidden="true" className="size-3.5 shrink-0 text-[var(--md-subtle)]" />
            </button>
          })}
        </div> : meetings !== null && !error ? <div className="grid min-h-[156px] place-content-center justify-items-center px-4 py-3 text-center">
          <svg viewBox="0 0 150 110" width="90" height="66" aria-hidden="true" focusable="false">
            <rect x="28" y="24" width="84" height="66" rx="12" fill="var(--md-surface)" stroke="var(--md-line)" strokeWidth="1.5" />
            <path d="M28 44h84M48 17v15M92 17v15" fill="none" stroke="var(--md-subtle)" strokeWidth="1.5" strokeLinecap="round" />
            <g fill="var(--md-line)"><circle cx="48" cy="59" r="2" /><circle cx="68" cy="59" r="2" /><circle cx="88" cy="59" r="2" /><circle cx="48" cy="75" r="2" /><circle cx="68" cy="75" r="2" /></g>
            <g className="company-meetings-orbit"><circle cx="112" cy="75" r="19" fill="var(--md-surface)" stroke="var(--md-line)" /><circle cx="112" cy="75" r="17" fill="var(--md-accent-a08)" /><path d="M112 64v11l7 4" fill="none" stroke="var(--md-accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></g>
          </svg>
          <p className="mt-2 text-[13px] font-medium text-[var(--md-ink)]">{t("No upcoming meetings")}</p>
          <p className="mt-1 max-w-sm text-[12px] leading-5 text-[var(--md-subtle)]">{t("Meetings linked to this company will appear here.")}</p>
        </div> : null}
      </div>
      {upcoming.length > 3 ? <button type="button" aria-expanded={allMeetingsShown} onClick={() => setAllMeetingsShown(shown => !shown)} className="flex h-10 w-full items-center justify-center border-t border-[var(--md-line)] text-[12px] font-medium text-[var(--md-text)] outline-none transition-colors hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--md-accent-a24)]">{allMeetingsShown ? t("Show fewer") : `${t("Show all")} ${upcoming.length}`}</button> : null}
    </Panel>
    <MeetingDetailsPopover selection={selection} onClose={() => setSelection(null)} onChanged={refresh} navigate={navigate} />
  </>
}


/** A compact, independent section on the page background. */
function Zone({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] px-4 py-3 shadow-[var(--md-shadow-line)]">
      <div className="mb-3 flex min-h-7 flex-wrap items-center justify-between gap-3">
        <h2 className="text-[13px] font-medium leading-4 text-[var(--md-ink)]">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

/** One thing that happened, whichever system it happened in. */
function MomentRow({ moment, last, onOpen }: { moment: Moment; last: boolean; onOpen?: () => void }) {
  const { language, t } = useLanguage()
  const inbound = moment.email?.direction === "inbound"

  const body = (
    <>
      <span className="relative z-10 grid size-6 shrink-0 place-items-center rounded-full bg-[var(--md-surface)] shadow-[0_0_0_1px_var(--md-line)]">{moment.email ? <Mail className={inbound ? "size-3 text-[var(--md-accent)]" : "size-3 text-[var(--md-subtle)]"} strokeWidth={1.6} /> : <span className="size-1.5 rounded-full bg-[var(--md-accent)]" />}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 truncate text-[13px] font-medium text-[var(--md-ink)]" dir="auto" title={moment.subject}>
            {moment.subject}
          </span>
          <span className="shrink-0 text-[11px] tabular-nums text-[var(--md-subtle)]">{relativeDate(moment.at, language, t)}</span>
        </span>
        {moment.detail ? (
          <span className="mt-0.5 block whitespace-pre-wrap break-words text-[12px] leading-relaxed text-[var(--md-text)]" dir="auto">
            {moment.detail}
          </span>
        ) : null}
      </span>
    </>
  )

  return (
    <li id={`activity-${moment.id}`} className="relative scroll-mt-24">
      {/* The thread that makes a run of rows read as one run of time. It starts
          below the disc and reaches the next one, so the column never breaks. */}
      {last ? null : <span aria-hidden="true" className="absolute bottom-0 start-[19px] top-8 w-px bg-[var(--md-line)]" />}
      {onOpen ? (
        <button type="button" onClick={onOpen} aria-label={`${t(inbound ? "Received" : "Sent")}: ${moment.subject}`} className="group flex w-full items-start gap-2.5 rounded-[var(--md-radius-lg)] px-2 py-2 text-start outline-none transition-colors duration-150 hover:bg-[var(--md-surface-soft)] focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a24)]">
          {body}
          <ArrowRight className="mt-1 size-3.5 shrink-0 text-[var(--md-subtle)] opacity-0 transition-[opacity,transform] duration-150 ease-[cubic-bezier(0.2,0,0,1)] group-hover:translate-x-0.5 group-hover:opacity-100 rtl:rotate-180 rtl:group-hover:-translate-x-0.5 motion-reduce:transform-none" strokeWidth={1.5} />
        </button>
      ) : (
        <div className="flex items-start gap-2.5 px-2 py-2">{body}</div>
      )}
    </li>
  )
}

/** The account name, edited in place at heading size. */
function HeadingField({ value, onSave }: { value: string; onSave: (next: string) => Promise<void> }) {
  const { t } = useLanguage()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])

  async function commit() {
    setEditing(false)
    const next = draft.trim()
    if (!next || next === value.trim()) {
      setDraft(value)
      return
    }
    setSaving(true)
    try {
      await onSave(next)
    } catch (error) {
      setDraft(value)
      toast.error(error instanceof Error ? error.message : t("The account name could not be saved."))
    } finally {
      setSaving(false)
    }
  }

  const headingClass = "text-[22px] font-medium leading-7 tracking-[-0.015em] text-[var(--md-ink)]"

  if (editing) {
    return (
      <Input
        autoFocus
        dir="auto"
        value={draft}
        aria-label={t("Account name")}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            void commit()
          }
          if (event.key === "Escape") {
            event.preventDefault()
            setDraft(value)
            setEditing(false)
          }
        }}
        className={`${headingClass} h-auto w-full rounded-[var(--md-radius-md)] border-0 bg-[var(--md-surface-soft)] px-2 py-0.5 shadow-[var(--md-shadow-line)] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]`}
      />
    )
  }

  return (
    <button type="button" onClick={() => setEditing(true)} dir="auto" className={`${headingClass} -mx-2 rounded-[var(--md-radius-md)] px-2 py-0.5 text-start outline-none transition-colors duration-150 hover:bg-[var(--md-hover)] focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a24)] ${saving ? "opacity-60" : ""}`}>
      <h1 className="truncate" title={value}>{value}</h1>
    </button>
  )
}

function AddCustomField({ onAdd }: { onAdd: (label: string, value: string) => Promise<void> }) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState("")
  const [value, setValue] = useState("")
  const [saving, setSaving] = useState(false)

  if (!open) {
    return (
      <Button type="button" variant="ghost" className="h-8 w-fit rounded-[var(--md-radius-md)] px-2.5 text-[12px] text-[var(--md-text)] shadow-[var(--md-shadow-line)] active:scale-[0.96] motion-reduce:transform-none" onClick={() => setOpen(true)}>
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
      setLabel("")
      setValue("")
      setOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("That field could not be added."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid w-full max-w-[280px] gap-2 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] p-2 shadow-[var(--md-shadow-line)]">
      <Input autoFocus value={label} onChange={(event) => setLabel(event.target.value)} placeholder={t("Field name")} aria-label={t("Field name")} className="h-8 rounded-[var(--md-radius-md)] border-0 bg-[var(--md-surface)] text-base shadow-[var(--md-shadow-line)] sm:text-[13px]" />
      <Input value={value} onChange={(event) => setValue(event.target.value)} placeholder={t("Value")} aria-label={t("Value")} className="h-8 rounded-[var(--md-radius-md)] border-0 bg-[var(--md-surface)] text-base shadow-[var(--md-shadow-line)] sm:text-[13px]" />
      <div className="flex justify-end gap-1.5">
        <Button
          type="button"
          variant="ghost"
          className="h-8 rounded-[var(--md-radius-md)] px-2 text-[12px]"
          onClick={() => {
            setOpen(false)
            setLabel("")
            setValue("")
          }}
        >
          {t("Cancel")}
        </Button>
        <Button type="button" disabled={saving || !label.trim()} className="h-8 rounded-[var(--md-radius-md)] bg-[var(--md-accent)] px-2.5 text-[12px] text-[var(--md-accent-ink)] active:scale-[0.96] motion-reduce:transform-none" onClick={() => void save()}>
          {t("Add field")}
        </Button>
      </div>
    </div>
  )
}

const emptyAddress = { line1: null, line2: null, townCity: null, countyState: null, postZipCode: null, countryCode: null, mainEmail: null, mainPhone: null }
const defaultEngagement = {
  preferredChannel: null,
  allowThankYouMessages: true,
  allowFollowupMessages: true,
  allowWhatsApp: false,
  doNotOverContact: false,
  minHoursBetweenNonUrgentMessages: 24,
  notes: null,
}

function organisationTypeIds(typeNames: string[], reference: CustomerReference | null) {
  const names = new Set(typeNames.map((name) => name.trim().toLowerCase()))
  return (reference?.organisationTypes ?? []).filter((type) => names.has(type.name.trim().toLowerCase())).map((type) => type.id)
}

function toDraft(account: ApiCustomerDetail, reference: CustomerReference | null): AccountDraft {
  const metadata = account.metadata ?? {}
  const fields = metadata.customFields && typeof metadata.customFields === "object" ? (metadata.customFields as Record<string, unknown>) : {}
  return {
    orgTypeIds: organisationTypeIds(account.types, reference),
    name: account.name,
    relationshipStatus: account.relationshipStatus,
    tier: account.tier,
    segment: account.segment,
    vertical: account.vertical,
    primaryMode: account.primaryMode,
    primaryTradeLane: account.primaryTradeLane,
    growthState: account.growthState,
    healthScore: account.healthScore,
    churnRiskScore: account.churnRiskScore,
    summary: account.summary,
    strategic: account.strategic,
    trainingAllowed: account.trainingAllowed,
    // Blank unless a consent change is being made, which is the only time the
    // endpoint requires one.
    metadata,
    address: account.address ? { ...emptyAddress, ...account.address } : { ...emptyAddress },
    engagement: account.engagement ?? { ...defaultEngagement },
    customFields: Object.entries(fields).map(([label, value]) => ({
      id: label,
      label,
      value: typeof value === "string" ? value : String(value),
    })),
  }
}

function Panel({ title, meta, action, className, children }: { title: string; meta?: string; action?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={cn("min-w-0 overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)]", className)}>
      <div className="flex min-h-11 items-center justify-between gap-3 px-4 py-2">
        <h2 className="text-[13px] font-medium text-[var(--md-ink)]">{title}</h2>
        {meta || action ? (
          <div className="flex shrink-0 items-center gap-2">
            {meta ? <span className="text-[11.5px] text-[var(--md-text)]">{meta}</span> : null}
            {action}
          </div>
        ) : null}
      </div>
      {children}
    </section>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="border-t border-[var(--md-line)] px-4 py-5 text-[12.5px] leading-5 text-[var(--md-text)] sm:px-5">{text}</p>
}

function humanize(value: string | null | undefined) {
  return value ? value.replace(/[_-]+/g, " ").replace(/^./, (letter) => letter.toUpperCase()) : null
}

function shipmentPresentation(status: string | null, openExceptionCount: number, t: (value: string) => string) {
  const normalized =
    status
      ?.trim()
      .toLocaleLowerCase()
      .replace(/[\s_-]+/g, "") ?? ""
  const statusLabel = t(humanize(status) ?? "Status not recorded")

  if (openExceptionCount > 0) {
    return {
      tone: normalized.includes("blocked") || normalized.includes("failed") || normalized.includes("exception") ? ("red" as const) : ("amber" as const),
      label: `${statusLabel} · ${openExceptionCount} ${t(openExceptionCount === 1 ? "open exception" : "open exceptions")}`,
    }
  }
  if (normalized.includes("delayed") || normalized.includes("late") || normalized.includes("risk")) return { tone: "amber" as const, label: statusLabel }
  if (normalized.includes("blocked") || normalized.includes("failed") || normalized.includes("exception") || normalized.includes("cancel")) return { tone: "red" as const, label: statusLabel }
  if (normalized.includes("ontrack") || normalized.includes("transit") || normalized.includes("complete") || normalized.includes("deliver")) return { tone: "green" as const, label: statusLabel }
  return { tone: "neutral" as const, label: statusLabel }
}


function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value))
}

function relativeDate(value: string, locale: string, t: (value: string) => string) {
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000)
  if (days <= 0) return t("Today")
  if (days === 1) return t("Yesterday")
  if (days < 30) return `${days} ${t("days ago")}`
  return formatDate(value, locale)
}
