import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { motion, useReducedMotion } from "motion/react"
import { AiBrain, ArrowLeft, ArrowRight, Check, Clock, Health, Mail, Phone, Plus, RefreshCw, Trash2, X, type LucideIcon } from "@/components/icons/hugeicons"
import { toast } from "sonner"
import { ContactCreateDialog } from "@/components/multideck/contact-create-dialog"
import { AccountDetailTabs, AccountOperationsPanel, type AccountDetailTab } from "@/components/multideck/account-operations-workspace"
import { CustomerAvatar } from "@/components/multideck/customer-components"
import { ProgressRing } from "@/components/multideck/dashboard-radials"
import { DotGridLoaderPanel } from "@/components/multideck/dot-grid-loader"
import { InlineField, InlineFieldGroup, InlineSelectField, InlineToggleChip } from "@/components/multideck/inline-field"
import { MarketingOptInControl } from "@/components/multideck/marketing-opt-in-control"
import { OrganisationFoundationPanel } from "@/components/multideck/organisation-foundation-panel"
import { PhoneCallLinkedRecordSection } from "@/components/multideck/phone-call-components"
import { Surface } from "@/components/multideck/surface"
import { StatusPill } from "@/components/multideck/status-pill"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { useLanguage } from "@/i18n/language-provider"
import { mdMotion, staggerRamp } from "@/lib/motion"
import { cn } from "@/lib/utils"
import { CustomerApiError, getCustomer, getCustomerReference, updateAccount, updateAccountCompanyTypes, type ApiCustomerDetail, type CustomerReference, type UpdateAccountInput } from "@/lib/customer-api"
import { CustomerWarehouseAccess } from "@/pages/customer-detail-page"

type CustomField = { id: string; label: string; value: string }
type AccountDraft = UpdateAccountInput & { customFields: CustomField[] }
type CommunicationPreferenceKey = "follow_up" | "thank_you" | "whatsapp" | "limited_contact"

/** Activities and emails are the same thing to an operator: what happened, and when. */
type Moment = {
  id: string
  at: string
  subject: string
  detail: string | null
  email: { threadId: string; direction: "inbound" | "outbound" } | null
}

/** The gaps people actually mean when they say "leave it a bit". */
const gapPresets = [4, 12, 24, 48, 168]
const companyTypesBatchDelayMs = 450

function sameIds(left: string[] | null, right: string[]) {
  return left !== null && left.length === right.length && left.every((id) => right.includes(id))
}

/**
 * An account, edited where it is read.
 *
 * Built to the same frame as lead and contact detail: one wide operational
 * workspace with a compact identity header and contextual tabs. The header stays
 * a header rather than a hero, so the first actionable account facts remain above
 * the fold.
 *
 * Within that frame each fact is drawn as the shape it actually is. Scores carry
 * their arc and remain calculated, not manually editable. Profile fields align in
 * a stable grid, while communication preferences and consent live together because
 * they answer the same operator question: how may we contact this account? The
 * activity log and mailbox remain one stream because nobody wants two histories of
 * the same relationship.
 *
 * Everything writes on its own. Nothing here opens a form.
 */
export function CrmAccountDetailPage({ accountId, navigate }: { accountId: string; navigate: (path: string) => void }) {
  const { language, t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const [account, setAccount] = useState<ApiCustomerDetail | null>(null)
  const [state, setState] = useState<"loading" | "ready" | "error">("loading")
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [addContactOpen, setAddContactOpen] = useState(false)
  const [consentOpen, setConsentOpen] = useState(false)
  const [reference, setReference] = useState<CustomerReference | null>(null)
  const [companyTypesSaving, setCompanyTypesSaving] = useState(false)
  const [companyTypeIdsDraft, setCompanyTypeIdsDraft] = useState<string[] | null>(null)
  const [preferredPreferenceDraft, setPreferredPreferenceDraft] = useState<CommunicationPreferenceKey | null>(null)
  const [preferredPreferenceSaving, setPreferredPreferenceSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<AccountDetailTab>("overview")
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
        setError(cause instanceof Error ? cause.message : t("This account could not be loaded. Check your connection and try again."))
        setState("error")
      })
    return () => {
      active = false
    }
  }, [accountId, reloadToken, t])

  useEffect(() => {
    setPreferredPreferenceDraft(null)
  }, [account?.metadata.preferredCommunicationPreference])

  useEffect(() => {
    if (!account) return
    const roles = account.types.map((type) => type.trim().toLowerCase().replace(/[_-]+/g, " "))
    const financialVisible = roles.some((role) => ["customer", "potential customer", "key account", "key customer account", "supplier"].includes(role))
    const selectedRole = activeTab.startsWith("role:") ? activeTab.slice(5) : null
    if ((selectedRole && !roles.includes(selectedRole)) || (activeTab === "financial" && !financialVisible)) {
      setActiveTab("overview")
    }
  }, [account, activeTab])

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
    (change: Partial<AccountDraft>) => {
      const save = saveQueueRef.current.then(async () => {
        const current = accountRef.current
        if (!current) return
        const next = { ...toDraft(current, reference), ...change }
        const metadata = {
          ...next.metadata,
          customFields: Object.fromEntries(next.customFields.filter((field) => field.label.trim()).map((field) => [field.label.trim(), field.value.trim()])),
        }
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
            throw new CustomerApiError(t("This account changed elsewhere. Your edit was not saved; the latest version is now shown."), 409)
          } catch (refreshCause) {
            if (refreshCause instanceof CustomerApiError && refreshCause.status === 409) throw refreshCause
            throw new CustomerApiError(t("This account changed elsewhere. Your edit was not saved. Reload to see the latest version."), 409)
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
            throw new CustomerApiError(t("This account changed elsewhere. Your edit was not saved; the latest version is now shown."), 409)
          } catch (refreshCause) {
            if (refreshCause instanceof CustomerApiError && refreshCause.status === 409) throw refreshCause
            throw new CustomerApiError(t("This account changed elsewhere. Your edit was not saved. Reload to see the latest version."), 409)
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

  const backButton = (
    <Button type="button" variant="ghost" className="-ms-2 mb-4 h-8 rounded-[var(--md-radius-md)] px-2 text-[12px] font-medium text-[var(--md-text)] hover:bg-[var(--md-surface-tint)]" onClick={() => navigate("/crm/accounts")}>
      <ArrowLeft data-icon="inline-start" className="size-3.5" strokeWidth={1.3} aria-hidden="true" />
      {t("Back to companies")}
    </Button>
  )

  if (state === "loading") {
    return (
      <div className="md-page md-page-stack">
        {backButton}
        <Surface padding="lg" className="grid min-h-[320px] place-items-center rounded-[var(--md-radius-xl)]">
          <DotGridLoaderPanel label="Loading account" minHeight={0} />
        </Surface>
      </div>
    )
  }

  if (state === "error" || !account) {
    return (
      <div className="md-page md-page-stack">
        {backButton}
        <Surface padding="lg" className="grid min-h-[320px] place-items-center rounded-[var(--md-radius-xl)] text-center" role="alert">
          <div className="max-w-md">
            <p className="text-[15px] font-medium text-[var(--md-ink)]">{t("Account unavailable")}</p>
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
  const address = currentAccount.address
  const engagement = currentAccount.engagement
  const currentGap = engagement?.minHoursBetweenNonUrgentMessages ?? 24
  const preferredCommunication = preferredPreferenceDraft ?? preferredCommunicationKey(currentAccount.metadata.preferredCommunicationPreference) ?? "follow_up"
  const gapOptions = (gapPresets.includes(currentGap) ? gapPresets : [...gapPresets, currentGap].sort((a, b) => a - b)).map((hours) => ({ value: String(hours), label: formatGap(hours, t) }))
  const enter = (index: number) => (shouldReduceMotion ? { duration: 0 } : { ...mdMotion.enter, delay: staggerRamp(index, 0.04) })

  async function selectPreferredCommunication(next: CommunicationPreferenceKey) {
    if (next === preferredCommunication || preferredPreferenceSaving) return
    setPreferredPreferenceDraft(next)
    setPreferredPreferenceSaving(true)
    const enablePreferred = next === "follow_up" ? { allowFollowupMessages: true } : next === "thank_you" ? { allowThankYouMessages: true } : next === "whatsapp" ? { allowWhatsApp: true } : { doNotOverContact: true }
    try {
      await patch({
        metadata: {
          ...currentAccount.metadata,
          preferredCommunicationPreference: next,
        },
        engagement: {
          ...defaultEngagement,
          ...engagement,
          ...enablePreferred,
        },
      })
    } catch (cause) {
      setPreferredPreferenceDraft(null)
      toast.error(cause instanceof Error ? cause.message : t("That preference could not be saved."))
    } finally {
      setPreferredPreferenceSaving(false)
    }
  }

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

  function selectCompanyTypes(orgTypeIds: string[], saveDelayMs = companyTypesBatchDelayMs) {
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
    companyTypesSaveTimerRef.current = setTimeout(() => void flushCompanyTypes(), saveDelayMs)
  }

  return (
    <div className="md-page">
      <div className="grid items-start gap-[var(--md-page-stack-gap)]">
        <div className="grid min-w-0 content-start gap-[var(--md-page-stack-gap)]">
          <Surface padding="none" className="min-w-0 overflow-hidden rounded-[var(--md-radius-xl)]">
            <header className="px-4 py-3 shadow-[var(--md-stroke-bottom)] sm:px-5">
              {backButton}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-start gap-3.5">
                  <CustomerAvatar initials={currentAccount.initials} tone="teal" size="lg" className="size-12 rounded-full text-[16px]" />
                  <div className="min-w-0">
                    {/* The name is the page title and is edited in place like
                        everything else. It carries the heading's own metrics so
                        nothing shifts. */}
                    <HeadingField value={currentAccount.name} onSave={(name) => patch({ name })} />
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5" aria-label={t("Company types")} aria-busy={companyTypesSaving}>
                      {currentCompanyTypes.map((type) => {
                        const canRemove = Boolean(reference && type.id)
                        return (
                          <StatusPill key={type.id} kind="status" indicator={false} tone="neutral" className="group/type isolate gap-0">
                            <span className="whitespace-nowrap">{t(type.name)}</span>
                            {canRemove ? (
                              <span className="md-company-type-remove-slot ms-0 inline-grid w-0 shrink-0 translate-x-1 scale-75 place-items-center overflow-hidden opacity-0 rtl:-translate-x-1 group-hover/type:ms-1 group-hover/type:w-5 group-hover/type:translate-x-0 group-hover/type:scale-100 group-hover/type:overflow-visible group-hover/type:opacity-100 group-focus-within/type:ms-1 group-focus-within/type:w-5 group-focus-within/type:translate-x-0 group-focus-within/type:scale-100 group-focus-within/type:overflow-visible group-focus-within/type:opacity-100 [@media(hover:none)]:ms-1 [@media(hover:none)]:w-5 [@media(hover:none)]:translate-x-0 [@media(hover:none)]:scale-100 [@media(hover:none)]:overflow-visible [@media(hover:none)]:opacity-100 motion-reduce:translate-x-0 motion-reduce:scale-100">
                                <button
                                  type="button"
                                  aria-label={`${t("Remove company type")}: ${t(type.name)}`}
                                  className="md-company-type-remove grid size-5 place-items-center rounded-[calc(var(--md-radius-md)-2px)] text-current outline-none hover:bg-[color-mix(in_srgb,currentColor_12%,transparent)] focus-visible:ring-1 focus-visible:ring-current active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-35"
                                  onClick={() =>
                                    selectCompanyTypes(
                                      currentTypeIds.filter((id) => id !== type.id),
                                      0,
                                    )
                                  }
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
                            if (!open) void flushCompanyTypes()
                          }}
                        >
                          <DropdownMenuTrigger asChild>
                            <Button type="button" variant="ghost" size="icon" aria-label={t("Edit company types")} disabled={!reference} className="size-6 shrink-0 rounded-full bg-[var(--md-surface)] text-[var(--md-text)] shadow-[0_0_0_1px_var(--md-line)] transition-[background-color,color,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[var(--md-surface-tint)] hover:text-[var(--md-ink)] active:scale-[0.96] motion-reduce:transform-none motion-reduce:transition-none">
                              <Plus className="size-3.5" strokeWidth={1.6} aria-hidden="true" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="w-[min(260px,calc(100vw-32px))] rounded-[var(--md-radius-lg)]">
                            <DropdownMenuLabel>{t("Company types")}</DropdownMenuLabel>
                            {reference.organisationTypes.map((type) => (
                              <DropdownMenuCheckboxItem key={type.id} checked={currentTypeIds.includes(type.id)} onSelect={(event) => event.preventDefault()} onCheckedChange={(checked) => selectCompanyTypes(checked === true ? [...currentTypeIds, type.id] : currentTypeIds.filter((id) => id !== type.id))}>
                                <StatusPill kind="status" indicator={false} tone="neutral">
                                  {t(type.name)}
                                </StatusPill>
                              </DropdownMenuCheckboxItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </div>
                    {[currentAccount.vertical || currentAccount.industry, currentAccount.location].filter(Boolean).length ? (
                      <p className="mt-1.5 text-[12px] leading-4 text-[var(--md-text)]" dir="auto" data-i18n-skip>
                        {[currentAccount.vertical || currentAccount.industry, currentAccount.location].filter(Boolean).join(" · ")}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {address?.mainEmail ? (
                    <Button asChild variant="outline" className="h-9 rounded-[var(--md-radius-lg)] text-[12.5px]">
                      <a href={`mailto:${address.mainEmail}`}>
                        <Mail className="size-3.5" strokeWidth={1.5} />
                        {t("Email")}
                      </a>
                    </Button>
                  ) : null}
                  {address?.mainPhone ? (
                    <Button asChild variant="outline" className="h-9 rounded-[var(--md-radius-lg)] text-[12.5px]">
                      <a href={`tel:${address.mainPhone}`}>
                        <Phone className="size-3.5" strokeWidth={1.5} />
                        {t("Call")}
                      </a>
                    </Button>
                  ) : null}
                </div>
              </div>
            </header>

            {/* The figures live in the strip rather than a hero band. Health and
                churn are calculated signals: operators can read them here but
                cannot silently override the underlying percentage. */}
            <div className="grid grid-cols-2 bg-[var(--md-surface-soft)] shadow-[var(--md-stroke-bottom)] lg:grid-cols-4">
              <ScoreCell label={t("Health")} score={currentAccount.healthScore} tone="health" />
              <ScoreCell label={t("Churn risk")} score={currentAccount.churnRiskScore} tone="risk" />
              <StatCell label={t("Contacts")} value={String(currentAccount.contacts.length)} />
              <StatCell label={t("Active shipments")} value={String(currentAccount.activeShipments.length)} note={openExceptions ? `${openExceptions} ${t(openExceptions === 1 ? "open exception" : "open exceptions")}` : undefined} noteTone="amber" />
            </div>
          </Surface>

          <AccountDetailTabs account={currentAccount} activeTab={activeTab} onChange={setActiveTab} />

          {activeTab === "overview" ? (
            <>
              <Zone title={t("Profile")}>
                <InlineFieldGroup stacked directEdit>
                  <div className="grid gap-x-3 gap-y-3 sm:grid-cols-2 2xl:grid-cols-3">
                    <InlineField label="Summary" kind="textarea" align="start" colSpan="full" value={currentAccount.summary ?? ""} placeholder="What this account buys, and what matters to them" onSave={(summary) => patch({ summary: summary || null })} />
                    <InlineSelectField
                      label="Relationship"
                      value={currentAccount.relationshipStatus}
                      options={(reference?.relationshipStatuses ?? []).map((status) => ({
                        value: status.code,
                        label: status.name,
                      }))}
                      onSave={(relationshipStatus) => patch({ relationshipStatus })}
                    />
                    <InlineField label="Tier" value={currentAccount.tier ?? ""} onSave={(tier) => patch({ tier: tier || null })} />
                    <InlineField label="Segment" value={currentAccount.segment ?? ""} onSave={(segment) => patch({ segment: segment || null })} />
                    <InlineField label="Vertical" value={currentAccount.vertical ?? ""} onSave={(vertical) => patch({ vertical: vertical || null })} />
                    <InlineField label="Primary mode" value={currentAccount.primaryMode ?? ""} onSave={(primaryMode) => patch({ primaryMode: primaryMode || null })} />
                    <InlineField label="Trade lane" value={currentAccount.primaryTradeLane ?? ""} onSave={(primaryTradeLane) => patch({ primaryTradeLane: primaryTradeLane || null })} />
                    <InlineField label="Growth state" value={currentAccount.growthState ?? ""} onSave={(growthState) => patch({ growthState: growthState || null })} />
                    {customFields.map((field) => (
                      <div key={field.id} className="group/custom-field relative min-w-0">
                        <InlineField
                          label={field.label}
                          value={field.value}
                          onSave={(value) =>
                            patch({
                              customFields: customFields.map((item) => (item.id === field.id ? { ...item, value } : item)),
                            })
                          }
                        />
                        <button
                          type="button"
                          aria-label={`${t("Remove field")}: ${field.label}`}
                          className="absolute end-0 top-0 grid size-6 place-items-center rounded-[var(--md-radius-sm)] text-[var(--md-subtle)] opacity-0 outline-none transition-[color,opacity] duration-150 hover:bg-[var(--md-surface-tint)] hover:text-[var(--md-red)] focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a24)] group-hover/custom-field:opacity-100"
                          onClick={async () => {
                            try {
                              await patch({
                                customFields: customFields.filter((item) => item.id !== field.id),
                              })
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
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <AddCustomField onAdd={(label, value) => patch({ customFields: [...customFields, { id: label, label, value }] })} />
                  <div className="ms-auto">
                    <InlineToggleChip label="Strategic account" checked={currentAccount.strategic} onSave={(strategic) => patch({ strategic })} />
                  </div>
                </div>
              </Zone>

              {reference ? (
                <OrganisationFoundationPanel
                  account={currentAccount}
                  reference={reference}
                  onChange={(updated) => {
                    accountRef.current = updated
                    setAccount(updated)
                  }}
                />
              ) : null}

              <Zone title={t("Quote defaults")}>
                <p className="mb-3 max-w-3xl text-[12px] leading-5 text-[var(--md-text)]">
                  {t("These terms, notes and the default response deadline are copied into quotes and managed on this company record.")}
                </p>
                <InlineFieldGroup stacked directEdit>
                  <div className="grid gap-x-3 gap-y-3 lg:grid-cols-2">
                    <InlineField
                      label="Terms and conditions"
                      kind="textarea"
                      align="start"
                      value={quoteTerms.terms}
                      placeholder="Agreed trading terms for this customer"
                      onSave={(terms) => patch({ metadata: { ...currentAccount.metadata, quoteTerms: { ...quoteTerms, terms } } })}
                    />
                    <InlineField
                      label="Subject to rate / space"
                      kind="textarea"
                      align="start"
                      value={quoteTerms.subjectTo}
                      placeholder="Default rate, space and equipment caveats"
                      onSave={(subjectTo) => patch({ metadata: { ...currentAccount.metadata, quoteTerms: { ...quoteTerms, subjectTo } } })}
                    />
                    <InlineField
                      label="Customer quote notes"
                      kind="textarea"
                      align="start"
                      value={quoteTerms.notes}
                      placeholder="Instructions or notes to carry into each new quote"
                      onSave={(notes) => patch({ metadata: { ...currentAccount.metadata, quoteTerms: { ...quoteTerms, notes } } })}
                    />
                    <InlineField
                      label="Default response deadline"
                      kind="date"
                      align="start"
                      value={quoteTerms.deadline}
                      placeholder="Select date"
                      onSave={(deadline) => patch({ metadata: { ...currentAccount.metadata, quoteTerms: { ...quoteTerms, deadline } } })}
                    />
                  </div>
                </InlineFieldGroup>
              </Zone>

              <Zone title={t("How we contact them")}>
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.8fr)]">
                  <div className="min-w-0">
                    <h3 className="mb-3 text-[11.5px] font-medium text-[var(--md-text)]">{t("Communication preferences")}</h3>
                    <div className="overflow-hidden rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] shadow-[var(--md-shadow-line)]" role="radiogroup" aria-label={t("Preferred communication preference")}>
                      <div className="grid grid-cols-[minmax(0,1fr)_52px_42px] items-center gap-2 px-3 pb-1.5 pt-2.5 text-[10.5px] text-[var(--md-subtle)]">
                        <span>{t("Preference")}</span>
                        <span className="text-center">{t("Preferred")}</span>
                        <span className="text-center">{t("Allowed")}</span>
                      </div>
                      <PreferenceToggleRow
                        label="Send follow-up messages"
                        checked={engagement?.allowFollowupMessages !== false}
                        preferred={preferredCommunication === "follow_up"}
                        preferenceDisabled={preferredPreferenceSaving}
                        onPrefer={() => selectPreferredCommunication("follow_up")}
                        onSave={(allowFollowupMessages) =>
                          patch({
                            engagement: {
                              ...defaultEngagement,
                              ...engagement,
                              allowFollowupMessages,
                            },
                          })
                        }
                      />
                      <PreferenceToggleRow
                        label="Send thank-you messages"
                        checked={engagement?.allowThankYouMessages !== false}
                        preferred={preferredCommunication === "thank_you"}
                        preferenceDisabled={preferredPreferenceSaving}
                        onPrefer={() => selectPreferredCommunication("thank_you")}
                        onSave={(allowThankYouMessages) =>
                          patch({
                            engagement: {
                              ...defaultEngagement,
                              ...engagement,
                              allowThankYouMessages,
                            },
                          })
                        }
                      />
                      <PreferenceToggleRow
                        label="Use WhatsApp"
                        checked={engagement?.allowWhatsApp === true}
                        preferred={preferredCommunication === "whatsapp"}
                        preferenceDisabled={preferredPreferenceSaving}
                        onPrefer={() => selectPreferredCommunication("whatsapp")}
                        onSave={(allowWhatsApp) =>
                          patch({
                            engagement: {
                              ...defaultEngagement,
                              ...engagement,
                              allowWhatsApp,
                            },
                          })
                        }
                      />
                      <PreferenceToggleRow
                        label="Limit total contact"
                        checked={engagement?.doNotOverContact === true}
                        preferred={preferredCommunication === "limited_contact"}
                        preferenceDisabled={preferredPreferenceSaving}
                        onPrefer={() => selectPreferredCommunication("limited_contact")}
                        onSave={(doNotOverContact) =>
                          patch({
                            engagement: {
                              ...defaultEngagement,
                              ...engagement,
                              doNotOverContact,
                            },
                          })
                        }
                      />
                    </div>
                    <InlineFieldGroup stacked directEdit>
                      <div className="mt-4 grid gap-x-3 gap-y-3">
                        <InlineSelectField
                          label="Minimum gap between non-urgent messages"
                          value={String(currentGap)}
                          options={gapOptions}
                          onSave={(value) =>
                            patch({
                              engagement: {
                                ...defaultEngagement,
                                ...engagement,
                                minHoursBetweenNonUrgentMessages: Number(value) || 0,
                              },
                            })
                          }
                        />
                        <InlineField
                          label="Notes"
                          kind="textarea"
                          align="start"
                          colSpan="full"
                          placeholder="Anything a colleague should know before they get in touch"
                          value={engagement?.notes ?? ""}
                          onSave={(notes) =>
                            patch({
                              engagement: {
                                ...defaultEngagement,
                                ...engagement,
                                notes: notes || null,
                              },
                            })
                          }
                        />
                      </div>
                    </InlineFieldGroup>
                  </div>
                  {/* Consent belongs beside the contact rules it governs. A change
                  still asks for evidence and records who made it. */}
                  <div className="min-w-0 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] p-4 shadow-[var(--md-shadow-line)]">
                    <h3 className="text-[11.5px] font-medium text-[var(--md-text)]">{t("Consent and data")}</h3>
                    <div className="mt-3 overflow-hidden rounded-[var(--md-radius-md)] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)]">
                      <div className="grid min-h-11 grid-cols-[minmax(0,1fr)_32px] items-center gap-3 px-3 py-2.5">
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium text-[var(--md-ink)]">{t("Marketing")}</p>
                          {currentAccount.marketingConsentSource ? (
                            <p className="mt-0.5 truncate text-[10.5px] text-[var(--md-subtle)]">
                              {t("Based on")} {humanize(currentAccount.marketingConsentSource)}
                            </p>
                          ) : null}
                        </div>
                        <StateCircle checked={currentAccount.marketingOptIn} role="checkbox" label={t("Change marketing consent")} onClick={() => setConsentOpen(true)} />
                      </div>
                      <PreferenceToggleRow icon={AiBrain} label="AI training" checked={currentAccount.trainingAllowed} onSave={(trainingAllowed) => patch({ trainingAllowed })} />
                    </div>
                    <p className="mt-3 text-[11.5px] leading-4 text-[var(--md-subtle)]">{t("A contact's own opt-out always wins, whatever this says.")}</p>
                  </div>
                </div>
              </Zone>

              <Panel
                title={t("Contacts")}
                meta={String(currentAccount.contacts.length)}
                action={
                  <Button type="button" variant="ghost" className="h-8 rounded-[var(--md-radius-md)] px-2 text-[12px] active:scale-[0.96] motion-reduce:transform-none" onClick={() => setAddContactOpen(true)}>
                    <Plus className="size-3.5" strokeWidth={1.5} />
                    {t("Add contact")}
                  </Button>
                }
              >
                {currentAccount.contacts.length ? (
                  <div className="grid gap-2 px-4 pb-4 sm:grid-cols-2 sm:px-5 sm:pb-5">
                    {currentAccount.contacts.map((contact, index) => (
                      <motion.button key={contact.id} type="button" initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={enter(index)} onClick={() => navigate(`/crm/contacts/${contact.id}`)} className="group flex min-w-0 items-center gap-2.5 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] px-2.5 py-2 text-start shadow-[var(--md-shadow-line)] outline-none transition-colors duration-150 hover:bg-[var(--md-surface-tint)] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]">
                        <CustomerAvatar initials={contact.initials} tone="blue" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium text-[var(--md-ink)]" dir="auto" data-i18n-skip>
                            {contact.name}
                          </span>
                          <span className="mt-0.5 block truncate text-[11.5px] text-[var(--md-text)]" dir="auto">
                            {contact.jobTitle || contact.role || contact.email || t("No details recorded yet")}
                          </span>
                        </span>
                        <ArrowRight className="size-4 shrink-0 text-[var(--md-subtle)] transition-transform duration-150 ease-[cubic-bezier(0.2,0,0,1)] group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5 motion-reduce:transform-none" strokeWidth={1.5} />
                      </motion.button>
                    ))}
                  </div>
                ) : (
                  <Empty text={t("Add the people you deal with at this account.")} />
                )}
              </Panel>

              <PhoneCallLinkedRecordSection recordType="company" recordId={currentAccount.id} navigate={navigate} />

              <Panel title={t("Active shipments")} meta={String(currentAccount.activeShipments.length)}>
                {currentAccount.activeShipments.length ? (
                  currentAccount.activeShipments.map((shipment) => {
                    const presentation = shipmentPresentation(shipment.status, shipment.openExceptionCount, t)
                    return (
                      <div key={shipment.id} className="grid gap-x-4 gap-y-1 border-t border-[var(--md-line)] px-4 py-3 sm:grid-cols-[120px_minmax(0,1fr)_auto] sm:items-center sm:px-5">
                        <p className="text-[12.5px] font-medium tabular-nums text-[var(--md-ink)]" dir="ltr" data-i18n-skip>
                          {shipment.reference}
                        </p>
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium text-[var(--md-ink)]" dir="auto">
                            {shipment.route || t("Route not recorded")}
                          </p>
                          <p className="mt-0.5 text-[11.5px] text-[var(--md-text)]">{[shipment.mode, shipment.status ? humanize(shipment.status) : null, shipment.eta ? `${t("ETA")} ${formatDate(shipment.eta, language)}` : null].filter(Boolean).join(" · ")}</p>
                        </div>
                        <StatusPill tone={presentation.tone}>{presentation.label}</StatusPill>
                      </div>
                    )
                  })
                ) : (
                  <Empty text={t("Nothing is moving for this account right now.")} />
                )}
              </Panel>

              {/* One history. Calls, notes and emails interleaved in the order they
                happened, because that is the order they happened in. */}
              <Panel title={t("History")} meta={moments.length ? t("Newest first") : undefined}>
                {moments.length ? (
                  <ol className="grid border-t border-[var(--md-line)] px-2.5 pb-3 pt-1.5 sm:px-3.5">
                    {moments.map((moment, index) => (
                      <MomentRow key={moment.id} moment={moment} last={index === moments.length - 1} onOpen={moment.email ? () => navigate(`/inbox?thread=${moment.email?.threadId}`) : undefined} />
                    ))}
                  </ol>
                ) : (
                  <Empty text={t("No activity has been recorded and no recent emails are linked to this account or its contacts.")} />
                )}
                {!currentAccount.recentEmails.available ? <p className="border-t border-[var(--md-line)] px-4 py-2.5 text-[11.5px] leading-4 text-[var(--md-subtle)] sm:px-5">{t("Conversations are missing from this history — you need email access to include them.")}</p> : currentAccount.recentEmails.items.length === 0 && moments.length ? <p className="border-t border-[var(--md-line)] px-4 py-2.5 text-[11.5px] leading-4 text-[var(--md-subtle)] sm:px-5">{t("No recent emails are linked to this account or its contacts.")}</p> : null}
              </Panel>

              <CustomerWarehouseAccess customerId={currentAccount.id} />
            </>
          ) : (
            <AccountOperationsPanel account={currentAccount} activeTab={activeTab} onChange={(updated) => { accountRef.current = updated; setAccount(updated) }} />
          )}
        </div>
      </div>

      <MarketingConsentDialog
        open={consentOpen}
        onOpenChange={setConsentOpen}
        current={currentAccount.marketingOptIn}
        source={currentAccount.marketingConsentSource}
        updatedAt={currentAccount.marketingConsentUpdatedAt}
        onSave={async (marketingOptIn, marketingConsentReason) => {
          await patch({ marketingOptIn, marketingConsentReason })
          toast.success(t(marketingOptIn ? "Marketing consent recorded" : "Marketing opt-out recorded"))
        }}
      />

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
    </div>
  )
}

/** A figure in the strip under the header. */
function StatCell({ label, value, note, noteTone }: { label: string; value: string; note?: string; noteTone?: "amber" }) {
  return (
    <div className="min-w-0 border-[var(--md-line)] px-4 py-3 sm:px-5 lg:border-e lg:last:border-e-0">
      <p className="text-[11px] leading-3 text-[var(--md-subtle)]">{label}</p>
      <p className="mt-1 text-[18px] font-medium leading-6 tabular-nums text-[var(--md-ink)]">{value}</p>
      {note ? <p className={cn("mt-0.5 truncate text-[11px]", noteTone === "amber" ? "text-[var(--md-amber)]" : "text-[var(--md-text)]")}>{note}</p> : null}
    </div>
  )
}

/**
 * A calculated score in the strip. The arc and number are intentionally static:
 * health and churn are derived signals rather than operator-authored facts.
 *
 * Eighty-two out of a hundred is not something anyone judges quickly as a number.
 * The ring says whether it is a good eighty-two — which for churn risk is the
 * opposite of what it means for health.
 */
function ScoreCell({ label, score, tone }: { label: string; score: number | null; tone: "health" | "risk" }) {
  const colour = score == null ? "var(--md-subtle)" : tone === "health" ? (score >= 70 ? "var(--md-green)" : score >= 40 ? "var(--md-amber)" : "var(--md-red)") : score >= 60 ? "var(--md-red)" : score >= 30 ? "var(--md-amber)" : "var(--md-green)"

  return (
    <div className="flex min-w-0 items-center gap-2.5 border-[var(--md-line)] px-4 py-3 sm:px-5 lg:border-e">
      <ProgressRing ratio={(score ?? 0) / 100} size={34} thickness={3.5} color={colour} trackOpacity={0.16} />
      <div className="min-w-0">
        <p className="flex items-center gap-1 text-[11px] leading-3 text-[var(--md-subtle)]">
          {tone === "health" ? <Health className="size-3" strokeWidth={1.4} aria-hidden="true" /> : null}
          {label}
        </p>
        <p className="mt-1 text-[18px] font-medium leading-6 tabular-nums text-[var(--md-ink)]">{score == null ? "—" : `${Math.round(score)}%`}</p>
      </div>
    </div>
  )
}

function StateCircle({ checked, label, onClick, disabled = false, role = "radio" }: { checked: boolean; label: string; onClick: () => void; disabled?: boolean; role?: "radio" | "checkbox" }) {
  const shouldReduceMotion = useReducedMotion()
  const transition = shouldReduceMotion ? { duration: 0 } : { type: "spring" as const, duration: 0.3, bounce: 0 }

  return (
    <button type="button" role={role} aria-checked={checked} aria-label={label} disabled={disabled} onClick={onClick} className="relative grid size-[18px] shrink-0 place-items-center justify-self-center rounded-full bg-[var(--md-field-bg)] shadow-[inset_0_0_0_1px_var(--md-line)] outline-none transition-transform duration-150 before:absolute before:-inset-3 active:scale-[0.96] focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a24)] disabled:cursor-wait disabled:opacity-60 motion-reduce:transform-none">
      <motion.span aria-hidden="true" initial={false} animate={checked ? { opacity: 1, scale: 1, filter: "blur(0px)" } : { opacity: 0, scale: 0.25, filter: "blur(4px)" }} transition={transition} className="absolute inset-0 rounded-full bg-[color-mix(in_srgb,var(--md-comparison-positive)_72%,black)]" />
      <motion.span aria-hidden="true" initial={false} animate={checked ? { opacity: 1, scale: 1, filter: "blur(0px)" } : { opacity: 0, scale: 0.25, filter: "blur(4px)" }} transition={transition} className="relative z-10 text-white">
        <Check className="size-3" strokeWidth={2.4} />
      </motion.span>
    </button>
  )
}

function PreferenceToggleRow({ label, checked, onSave, preferred, onPrefer, preferenceDisabled = false, icon: Icon }: { label: string; checked: boolean; onSave: (next: boolean) => Promise<void> | void; preferred?: boolean; onPrefer?: () => void; preferenceDisabled?: boolean; icon?: LucideIcon }) {
  const { t } = useLanguage()
  const [shown, setShown] = useState(checked)
  const [saving, setSaving] = useState(false)
  const hasPreference = preferred !== undefined && onPrefer !== undefined

  useEffect(() => setShown(checked), [checked])

  async function toggle(next: boolean) {
    if (saving) return
    setShown(next)
    setSaving(true)
    try {
      await onSave(next)
    } catch (cause) {
      setShown(checked)
      toast.error(cause instanceof Error ? cause.message : t("That preference could not be saved."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={cn("grid min-h-11 items-center gap-2 border-t border-[var(--md-line)] px-3 py-2.5 first:border-t-0", hasPreference ? "grid-cols-[minmax(0,1fr)_52px_42px]" : "grid-cols-[minmax(0,1fr)_32px]")}>
      <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium leading-5 text-[var(--md-ink)]">
        {Icon ? <Icon className="size-3.5 shrink-0 text-[var(--md-accent)]" strokeWidth={1.4} aria-hidden="true" /> : null}
        <span>{t(label)}</span>
      </span>
      {hasPreference ? <StateCircle checked={Boolean(preferred)} disabled={preferenceDisabled} label={`${t("Set as preferred")}: ${t(label)}`} onClick={onPrefer} /> : null}
      <Switch checked={shown} disabled={saving} onCheckedChange={(next) => void toggle(next)} aria-label={t(label)} className="justify-self-center" />
    </div>
  )
}

/** A compact, independent section on the page background. */
function Zone({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] px-4 py-4 shadow-[var(--md-shadow-soft)] sm:px-5 sm:py-5">
      <div className="mb-4 flex items-center justify-between gap-3">
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
          <span className="min-w-0 truncate text-[13px] font-medium text-[var(--md-ink)]" dir="auto">
            {moment.subject}
          </span>
          <span className="shrink-0 text-[11px] tabular-nums text-[var(--md-subtle)]">{relativeDate(moment.at, language, t)}</span>
        </span>
        {moment.detail ? (
          <span className="mt-0.5 block truncate text-[11.5px] leading-4 text-[var(--md-text)]" dir="auto">
            {moment.detail}
          </span>
        ) : null}
      </span>
    </>
  )

  return (
    <li className="relative">
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
      <h1 className="truncate">{value}</h1>
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

function MarketingConsentDialog({ open, onOpenChange, current, source, updatedAt, onSave }: { open: boolean; onOpenChange: (open: boolean) => void; current: boolean; source: string | null; updatedAt: string | null; onSave: (optIn: boolean, reason: string) => Promise<void> }) {
  const { t } = useLanguage()
  const [optIn, setOptIn] = useState(current)
  const [reason, setReason] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setOptIn(current)
      setReason("")
    }
  }, [open, current])

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
          <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
            {t("Cancel")}
          </Button>
          <Button
            type="button"
            disabled={saving || !changed || !reason.trim()}
            className="bg-[var(--md-accent)] text-[var(--md-accent-ink)] active:scale-[0.96] motion-reduce:transform-none"
            onClick={async () => {
              setSaving(true)
              try {
                await onSave(optIn, reason.trim())
                onOpenChange(false)
              } catch (error) {
                toast.error(error instanceof Error ? error.message : t("The consent change could not be saved."))
              } finally {
                setSaving(false)
              }
            }}
          >
            {t(optIn ? "Record opt-in" : "Record opt-out")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const emptyAddress = {
  line1: null,
  line2: null,
  townCity: null,
  countyState: null,
  postZipCode: null,
  countryCode: null,
  mainEmail: null,
  mainPhone: null,
}
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
    marketingOptIn: account.marketingOptIn,
    // Blank unless a consent change is being made, which is the only time the
    // endpoint requires one.
    marketingConsentReason: "",
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

function Panel({ title, meta, action, children }: { title: string; meta?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-soft)]">
      <div className="flex min-h-[48px] items-center justify-between gap-3 px-4 py-2.5 sm:px-5">
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

/** Hours said the way a person would say them. */
function formatGap(hours: number, t: (value: string) => string) {
  if (hours % 168 === 0) {
    const weeks = hours / 168
    return `${weeks} ${t(weeks === 1 ? "week" : "weeks")}`
  }
  if (hours % 24 === 0) {
    const days = hours / 24
    return `${days} ${t(days === 1 ? "day" : "days")}`
  }
  return `${hours} ${t(hours === 1 ? "hour" : "hours")}`
}

function preferredCommunicationKey(value: unknown): CommunicationPreferenceKey | null {
  return value === "follow_up" || value === "thank_you" || value === "whatsapp" || value === "limited_contact" ? value : null
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
