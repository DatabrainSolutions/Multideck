import { useEffect, useMemo, useState, type ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import {
  ArrowLeft,
  ExternalLink,
  IdCard,
  LockKeyhole,
  Plus,
  QrCode,
  ScanText,
  Trash2,
  TriangleAlert,
  UsersRound,
} from "@/components/icons/hugeicons"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { DataTable, type DataTableColumn } from "@/components/multideck/data-table"
import { DotGridLoader } from "@/components/multideck/dot-grid-loader"
import { RegisterFacetSelect, RegisterSearchField } from "@/components/multideck/register-toolbar"
import { SectionHeader, Surface } from "@/components/multideck/surface"
import { StatusPill } from "@/components/multideck/status-pill"
import { WizardDialog, type WizardStep } from "@/components/multideck/wizard-dialog"
import { TabsRail } from "@/components/multideck/workflow-components"
import { CopyableField } from "@/components/multideck/copyable-field"
import {
  AutomationHealthChip,
  CardCodePanel,
  CardMetricTile,
  CardPersonBadge,
  CardStatusPill,
  PanelError,
  PanelMessage,
  PanelSkeleton,
  SaveIndicator,
} from "@/components/multideck/contact-card-components"
import { AutomationEnableRow, CardAutomationPanel } from "@/components/multideck/contact-card-automation"
import { CardAnalyticsPanel } from "@/components/multideck/contact-card-analytics"
import { CardDesignPanel, CardQrPanel, ContactCardSocialLinksEditor } from "@/components/multideck/contact-card-design"
import { useLanguage } from "@/i18n/language-provider"
import { getApiTeamUsersByIds, type ApiTeamUser } from "@/lib/api"
import { mdMotion, reduceMotion } from "@/lib/motion"
import { createProfilePhotoSignedUrl, createProfilePhotoSignedUrls } from "@/lib/profile-photo"
import { getSupabaseSession } from "@/lib/supabase"
import { subscribeTopBarAction, topBarActionEvents } from "@/lib/top-bar-action-events"
import {
  cardPublicPath,
  cardTotals,
  createCard,
  deleteCard,
  loadContactCardsPage,
  reloadContactCard,
  reloadContactCards,
  pauseAutomation,
  resumeAutomation,
  setCardStatus,
  updateCard,
  useContactCard,
  useContactCardStore,
} from "@/lib/contact-card-store"
import type { CardExchange, ContactCard } from "@/data/contact-card-data"
import { hasPermission, type AuthUserSummary } from "@/lib/auth-user"

type ContactCardSortState = { id: string; direction: "asc" | "desc" } | null

function formatPercent(value: number | null) {
  return value === null ? "-" : `${(value * 100).toFixed(1)}%`
}

function relativeDay(iso: string | null) {
  if (!iso) return "-"
  const date = new Date(iso)
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000)
  if (days <= 0) return "Today"
  if (days === 1) return "Yesterday"
  if (days < 30) return `${days} days ago`
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" })
}

/* -------------------------------------------------------------------------- */
/* Create                                                                      */
/* -------------------------------------------------------------------------- */

function Field({ label, hint, optional, children }: { label: string; hint?: string; optional?: boolean; children: ReactNode }) {
  const { t } = useLanguage()

  return (
    <label className="block">
      <span className="flex items-baseline gap-2">
        <span className="text-[12.5px] font-medium text-[var(--md-text)]">{label}</span>
        {optional ? <span className="text-[11.5px] text-[var(--md-subtle)]">{t("Optional")}</span> : null}
      </span>
      <span className="mt-1.5 block">{children}</span>
      {hint ? <span className="mt-1.5 block text-[12px] leading-5 text-[var(--md-subtle)]">{hint}</span> : null}
    </label>
  )
}

type CreateCardStep = "person" | "contact" | "source"

const contactCardInputClass = "h-10 rounded-[var(--md-radius-md)] bg-[var(--md-field-bg)] text-[16px] shadow-[var(--md-shadow-line)] sm:text-[14px]"

function CreateCardWizard({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (card: ContactCard) => void
}) {
  const { t } = useLanguage()
  const [form, setForm] = useState({ fullName: "", role: "", company: "Multideck", email: "", phone: "", context: "", leadSource: "" })
  const [touched, setTouched] = useState(false)
  const [activeStep, setActiveStep] = useState<CreateCardStep>("person")
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setForm({ fullName: "", role: "", company: "Multideck", email: "", phone: "", context: "", leadSource: "" })
      setTouched(false)
      setActiveStep("person")
      setCreating(false)
      setCreateError(null)
    }
  }, [open])

  const emailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())
  const nameError = touched && !form.fullName.trim() ? t("Add the name shown on the card.") : null
  const emailError = touched && !emailIsValid ? t("Add a valid email address.") : null
  const steps: WizardStep[] = [
    { id: "person", label: "Person", hint: "Add the details shown on the card.", complete: Boolean(form.fullName.trim()) },
    { id: "contact", label: "Contact details", hint: "Add the channels people can use after scanning.", complete: emailIsValid },
    { id: "source", label: "Lead context", hint: "Help operators recognise the card and trace the leads it creates." },
  ]

  async function submit() {
    setTouched(true)
    setCreateError(null)
    if (!form.fullName.trim()) {
      setActiveStep("person")
      return
    }
    if (!emailIsValid) {
      setActiveStep("contact")
      return
    }

    setCreating(true)
    try {
      const card = await createCard({
        label: form.fullName.trim(),
        context: form.context.trim() || t("Not shared yet"),
        fullName: form.fullName.trim(),
        role: form.role.trim(),
        company: form.company.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        leadSource: form.leadSource.trim(),
      })
      onCreated(card)
    } catch (error) {
      setCreateError(error instanceof Error ? t(error.message) : t("The card could not be created. Your details are still here; check your connection and try again."))
    } finally {
      setCreating(false)
    }
  }

  return (
    <WizardDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose()
      }}
      title="Create a QR contact card"
      description="A card represents one person. The public page, lead source and any automation can be set up afterwards."
      steps={steps}
      activeStepId={activeStep}
      onStepChange={(stepId) => setActiveStep(stepId as CreateCardStep)}
      submitLabel="Create card"
      onSubmit={() => void submit()}
      saving={creating}
      bodyMinHeight={300}
    >
      {activeStep === "person" ? (
        <div className="grid gap-4">
          <Field label={t("Name on the card")}>
            <Input
              className={contactCardInputClass}
              value={form.fullName}
              aria-invalid={Boolean(nameError)}
              autoComplete="name"
              autoFocus
              onChange={(event) => setForm({ ...form, fullName: event.target.value })}
            />
            {nameError ? <span role="alert" className="mt-1.5 block text-[12px] text-[var(--md-red)]">{nameError}</span> : null}
          </Field>
          <Field label={t("Job title")} optional>
            <Input className={contactCardInputClass} value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} />
          </Field>
          <Field label={t("Company")}>
            <Input className={contactCardInputClass} value={form.company} onChange={(event) => setForm({ ...form, company: event.target.value })} />
          </Field>
        </div>
      ) : null}

      {activeStep === "contact" ? (
        <div className="grid gap-4">
          <Field label={t("Email")}>
            <Input
              className={contactCardInputClass}
              type="email"
              dir="ltr"
              value={form.email}
              aria-invalid={Boolean(emailError)}
              autoComplete="email"
              autoFocus
              onChange={(event) => setForm({ ...form, email: event.target.value })}
            />
            {emailError ? <span role="alert" className="mt-1.5 block text-[12px] text-[var(--md-red)]">{emailError}</span> : null}
          </Field>
          <Field label={t("Phone")} optional>
            <Input className={contactCardInputClass} type="tel" dir="ltr" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
          </Field>
        </div>
      ) : null}

      {activeStep === "source" ? (
        <div className="grid gap-4">
          <Field label={t("Where it will be used")} optional hint={t("Shown in the register so you can tell similar cards apart.")}>
            <Input className={contactCardInputClass} placeholder={t("UCN Sri Lanka")} value={form.context} onChange={(event) => setForm({ ...form, context: event.target.value })} />
          </Field>
          <Field label={t("Lead source")} optional hint={t("Stamped on every lead this card creates. You can set this later.")}>
            <Input
              className={contactCardInputClass}
              placeholder={t("Event – UCN Sri Lanka")}
              value={form.leadSource}
              onChange={(event) => setForm({ ...form, leadSource: event.target.value })}
            />
          </Field>
        </div>
      ) : null}
      {createError ? <p role="alert" className="text-[13px] leading-5 text-[var(--md-red)]">{createError}</p> : null}
    </WizardDialog>
  )
}

/* -------------------------------------------------------------------------- */
/* Register                                                                    */
/* -------------------------------------------------------------------------- */

export function ContactCardsPage({ navigate, currentUser }: { navigate: (path: string) => void; currentUser: AuthUserSummary | null }) {
  const { t } = useLanguage()
  const canWrite = hasPermission(currentUser, "CRM.Write")
  const { cards, status, error, summary, page } = useContactCardStore()
  const [createOpen, setCreateOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [automationFilter, setAutomationFilter] = useState("")
  const [offset, setOffset] = useState(0)
  const [sort, setSort] = useState<ContactCardSortState>({ id: "activity", direction: "desc" })
  const [ownerProfilePhotoUrls, setOwnerProfilePhotoUrls] = useState<Map<string, string>>(new Map())
  const ownerIds = useMemo(() => [...new Set(cards.map((card) => card.ownerUserId).filter(Boolean))], [cards])
  const ownerIdsKey = ownerIds.join("|")

  useEffect(() => {
    if (!canWrite) return
    return subscribeTopBarAction(topBarActionEvents.createCrmContactCard, () => setCreateOpen(true))
  }, [canWrite])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    setOffset(0)
  }, [automationFilter, debouncedQuery, statusFilter])

  useEffect(() => {
    void loadContactCardsPage({
      limit: 25,
      offset,
      search: debouncedQuery,
      status: statusFilter,
      automationState: automationFilter,
      sortField: (sort?.id ?? "activity") as "card" | "status" | "source" | "automation" | "activity",
      sortDirection: sort?.direction ?? "desc",
    })
  }, [automationFilter, debouncedQuery, offset, sort, statusFilter])

  useEffect(() => {
    if (ownerIds.length === 0) {
      setOwnerProfilePhotoUrls(new Map())
      return
    }

    let active = true
    void getSupabaseSession()
      .then(async (session) => {
        if (!session) return new Map<string, string>()
        const owners = await getApiTeamUsersByIds(session.access_token, ownerIds)
        const relevantOwners = owners.filter((user) => user.profilePhoto)
        const signedUrls = await createProfilePhotoSignedUrls(relevantOwners.flatMap((user) => user.profilePhoto ? [user.profilePhoto] : []))
        return new Map(relevantOwners.flatMap((user) => {
          const url = user.profilePhoto ? signedUrls.get(user.profilePhoto.path) : null
          return url ? [[user.id, url] as const] : []
        }))
      })
      .then((urls) => { if (active) setOwnerProfilePhotoUrls(urls) })
      .catch((photoError) => console.warn("Contact card owner profile photos could not be loaded.", photoError))

    return () => { active = false }
  }, [ownerIdsKey])

  const filtersActive = Boolean(debouncedQuery || statusFilter || automationFilter)

  const columns: DataTableColumn<ContactCard>[] = [
    {
      id: "card",
      label: t("Card"),
      minWidth: 240,
      sortValue: (card) => card.label,
      cell: (card) => (
        <div className="flex min-w-0 items-center gap-3">
          <CardPersonBadge card={card} size="sm" profilePhotoUrl={ownerProfilePhotoUrls.get(card.ownerUserId)} />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-[var(--md-ink)]" data-i18n-skip dir="auto">
              {card.label}
            </p>
            <p className="mt-0.5 truncate text-[11.5px] text-[var(--md-subtle)]">{card.context}</p>
          </div>
        </div>
      ),
    },
    {
      id: "status",
      label: t("Status"),
      kind: "status",
      width: 104,
      sortValue: (card) => card.status,
      cell: (card) => <CardStatusPill status={card.status} />,
    },
    {
      id: "source",
      label: t("Lead source"),
      kind: "attribute",
      minWidth: 170,
      sortValue: (card) => card.leadSource,
      cell: (card) =>
        card.leadSource ? (
          <span className="truncate text-[13px] text-[var(--md-ink)]" data-i18n-skip dir="auto">
            {card.leadSource}
          </span>
        ) : (
          <span className="text-[13px] text-[var(--md-subtle)]">{t("Not set")}</span>
        ),
    },
    {
      id: "scans",
      label: t("Scans"),
      width: 88,
      headerClassName: "text-right",
      cellClassName: "text-right",
      cell: (card) => <span className="text-[13px] text-[var(--md-ink)] tabular-nums">{cardTotals(card).scans.toLocaleString()}</span>,
    },
    {
      id: "exchanges",
      label: t("Shared"),
      width: 88,
      headerClassName: "text-right",
      cellClassName: "text-right",
      cell: (card) => <span className="text-[13px] text-[var(--md-ink)] tabular-nums">{cardTotals(card).exchanges.toLocaleString()}</span>,
    },
    {
      id: "conversion",
      label: t("Conversion"),
      width: 106,
      headerClassName: "text-right",
      cellClassName: "text-right",
      cell: (card) => <span className="text-[13px] text-[var(--md-ink)] tabular-nums">{formatPercent(cardTotals(card).conversion)}</span>,
    },
    {
      id: "automation",
      label: t("Automation"),
      width: 128,
      sortValue: (card) => card.automation.state,
      cell: (card) => <AutomationHealthChip automation={card.automation} />,
    },
    {
      id: "activity",
      label: t("Last activity"),
      width: 128,
      sortValue: (card) => card.exchanges.at(-1)?.at ?? card.createdAt,
      cell: (card) => <span className="text-[13px] text-[var(--md-subtle)]">{t(relativeDay(card.exchanges.at(-1)?.at ?? null))}</span>,
    },
  ]

  return (
    <div className="md-page md-page-stack">
      <header className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(320px,560px)] lg:items-start">
        <div className="min-w-0">
          <p className="text-[12px] font-medium uppercase tracking-normal text-[var(--md-subtle)]">{t("CRM")}</p>
          <h1 className="mt-2 text-[24px] font-medium leading-tight tracking-normal text-[var(--md-ink)]">{t("Contact cards")}</h1>
        </div>
        <p className="max-w-[68ch] text-[13px] leading-5 text-[var(--md-text)] lg:justify-self-end lg:pt-5 lg:text-end">
          {t("A shareable QR card for each person. Someone scans it, shares their details, and gets your contact details back. The lead lands in the CRM with the card's source.")}
        </p>
      </header>

      {status !== "error" && summary.total > 0 ? (
        <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
          <CardMetricTile icon={IdCard} label={t("Live cards")} value={summary.live.toLocaleString()} detail={`${summary.total.toLocaleString()} ${t("total")}`} />
          <CardMetricTile icon={ScanText} label={t("Scans")} value={summary.scans.toLocaleString()} detail={t("Across all cards")} />
          <CardMetricTile icon={UsersRound} label={t("Contacts shared")} value={summary.exchanges.toLocaleString()} detail={`${summary.leads.toLocaleString()} ${t("new leads")}`} tone="teal" />
          <CardMetricTile
            icon={TriangleAlert}
            label={t("Needs attention")}
            value={summary.needsAttention.toLocaleString()}
            detail={summary.needsAttention > 0 ? t("Automations with failures") : t("All automations healthy")}
            tone={summary.needsAttention > 0 ? "amber" : "neutral"}
          />
        </div>
      ) : null}

      <div className="min-w-0">
        {status === "loading" && cards.length === 0 ? (
          <Surface padding="md">
            <SectionHeader title={t("Your cards")} />
            <PanelSkeleton className="mt-4" rows={5} />
          </Surface>
        ) : status === "error" && cards.length === 0 ? (
          <Surface padding="md"><PanelError message={error ?? t("Unable to load contact cards. Check your connection and try again.")} onRetry={reloadContactCards} /></Surface>
        ) : summary.total === 0 && !filtersActive ? (
          <Surface padding="md"><PanelMessage
            icon={IdCard}
            title={t("No contact cards yet")}
            body={t("Create a card for a person, print or display the code, and every scan becomes a contact exchange and a CRM lead.")}
            action={canWrite ? (
              <Button
                className="h-9 rounded-[var(--md-radius-md)] bg-[var(--md-accent)] text-[13px] text-[var(--md-accent-ink)] hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)]"
                onClick={() => setCreateOpen(true)}
              >
                <Plus data-icon="inline-start" strokeWidth={1.2} />
                {t("New card")}
              </Button>
            ) : undefined}
          /></Surface>
        ) : (
          <DataTable
            columns={columns}
            rows={cards}
            getRowKey={(card) => card.id}
            storageKey="contact-cards"
            ariaLabel={t("Contact cards")}
            onRowClick={(card) => navigate(`/crm/contact-cards/${card.id}`)}
            serverSorting={{ value: sort, onChange: (next) => { setSort(next ?? { id: "activity", direction: "desc" }); setOffset(0) } }}
            pagination={{ offset, limit: 25, total: page.total, loading: status === "loading", onOffsetChange: setOffset }}
            compactToolbar
            toolbarSearch={<RegisterSearchField value={query} onChange={setQuery} onClear={() => setQuery("")} label="Search contact cards" placeholder="Search contact cards…" className="sm:w-[190px]" />}
            toolbarFilters={<>
              <RegisterFacetSelect label="Card status" allLabel="All statuses" value={statusFilter} options={[{ value: "published", label: "Live" }, { value: "draft", label: "Draft" }, { value: "paused", label: "Paused" }]} onChange={(value) => { setStatusFilter(value); setOffset(0) }} className="w-[116px]" />
              <RegisterFacetSelect label="Automation" allLabel="All automations" value={automationFilter} options={[{ value: "active", label: "Active" }, { value: "attention", label: "Needs attention" }, { value: "paused", label: "Paused" }, { value: "off", label: "Off" }]} onChange={(value) => { setAutomationFilter(value); setOffset(0) }} className="w-[132px]" />
            </>}
            contentBeforeTable={status === "error" && cards.length > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--md-radius-lg)] bg-[color-mix(in_srgb,var(--md-danger)_8%,var(--md-surface))] px-3 py-2" role="alert">
                <p className="text-[12px] text-[var(--md-danger)]" dir="auto">{error ? t(error) : t("Contact cards could not be refreshed.")}</p>
                <Button type="button" variant="outline" className="h-8" onClick={() => void reloadContactCards()}>{t("Try again")}</Button>
              </div>
            ) : undefined}
            emptyState={status === "loading"
              ? <div className="grid min-h-[180px] place-items-center"><DotGridLoader label="Loading contact cards…" /></div>
              : <div className="grid min-h-[180px] place-items-center p-6 text-center"><div><p className="text-[13px] font-medium text-[var(--md-ink)]">{t("No contact cards match these filters.")}</p><p className="mt-1 text-[12px] text-[var(--md-text)]">{t("Clear a filter or try another person, company or source.")}</p><Button type="button" variant="outline" className="mt-3" onClick={() => { setQuery(""); setStatusFilter(""); setAutomationFilter(""); setOffset(0) }}>{t("Clear filters")}</Button></div></div>}
          />
        )}
      </div>

      {canWrite ? <CreateCardWizard
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(card) => {
          setCreateOpen(false)
          toast.success(t("Card created as a draft"))
          navigate(`/crm/contact-cards/${card.id}`)
        }}
      /> : null}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Detail                                                                      */
/* -------------------------------------------------------------------------- */

const TABS = ["Overview", "Design", "QR code", "Automation", "Analytics", "Settings"] as const
type CardTab = (typeof TABS)[number]

/** Tab labels carry spaces; the query string should not. */
function tabSlug(tab: CardTab) {
  return tab.toLowerCase().replace(/\s+/g, "-")
}

function readTab(): CardTab {
  const value = new URLSearchParams(window.location.search).get("tab")
  const match = TABS.find((tab) => tabSlug(tab) === value)
  return match ?? "Overview"
}

export function ContactCardDetailPage({ cardId, navigate, currentUser }: { cardId: string; navigate: (path: string) => void; currentUser: AuthUserSummary | null }) {
  const { t, language } = useLanguage()
  const canWrite = hasPermission(currentUser, "CRM.Write")
  const shouldReduceMotion = useReducedMotion()
  const { card, status, error } = useContactCard(cardId)
  const [tab, setTab] = useState<CardTab>(readTab)
  const [ownerProfile, setOwnerProfile] = useState<ApiTeamUser | null>(null)
  const [ownerProfilePhotoUrl, setOwnerProfilePhotoUrl] = useState<string | null>(null)
  const [ownerProfileContact, setOwnerProfileContact] = useState({ fullName: "", phone: "", website: "" })
  const [statusSaving, setStatusSaving] = useState(false)
  const [automationSaving, setAutomationSaving] = useState(false)
  const visibleTabs = canWrite ? TABS : (["Overview", "Analytics"] as const)
  const exchangeDateTime = useMemo(
    () => new Intl.DateTimeFormat(language, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
    [language],
  )

  useEffect(() => {
    if (!canWrite && tab !== "Overview" && tab !== "Analytics") selectTab("Overview")
  }, [canWrite, tab])

  useEffect(() => {
    if (!card?.ownerUserId) {
      setOwnerProfile(null)
      setOwnerProfilePhotoUrl(null)
      setOwnerProfileContact({ fullName: "", phone: "", website: "" })
      return
    }

    let active = true
    void getSupabaseSession()
      .then(async (session) => {
        if (!session) return null
        const owner = (await getApiTeamUsersByIds(session.access_token, [card.ownerUserId]))[0]
        const ownsSession = owner?.authUserId === session.user.id
        const metadata = ownsSession ? session.user.user_metadata : null
        const fullName = typeof metadata?.full_name === "string" ? metadata.full_name.trim() : ""
        const phone = typeof metadata?.phone === "string" ? metadata.phone.trim() : session.user.phone?.trim() ?? ""
        const website = typeof metadata?.website === "string" ? metadata.website.trim() : ""
        const photoUrl = owner?.profilePhoto ? await createProfilePhotoSignedUrl(owner.profilePhoto) : null
        return { owner: owner ?? null, fullName, phone, website, photoUrl }
      })
      .then((result) => {
        if (!active || !result) return
        setOwnerProfile(result.owner)
        setOwnerProfileContact({ fullName: result.fullName, phone: result.phone, website: result.website })
        setOwnerProfilePhotoUrl(result.photoUrl)
      })
      .catch((photoError) => console.warn("The contact card owner's profile photo could not be loaded.", photoError))

    return () => { active = false }
  }, [card?.ownerUserId])

  function selectTab(next: CardTab) {
    setTab(next)
    const url = new URL(window.location.href)
    if (next === "Overview") url.searchParams.delete("tab")
    else url.searchParams.set("tab", tabSlug(next))
    window.history.replaceState({}, "", url)
  }

  async function changeCardStatus(nextStatus: ContactCard["status"]) {
    setStatusSaving(true)
    try {
      await setCardStatus(cardId, nextStatus)
      toast.success(t(nextStatus === "published" ? "Card is live" : "Card paused"))
    } catch (cause) {
      toast.error(cause instanceof Error ? t(cause.message) : t("The card status could not be saved. Check your connection and try again."))
    } finally {
      setStatusSaving(false)
    }
  }

  async function changeAutomationState(active: boolean) {
    if (automationSaving) return
    setAutomationSaving(true)
    try {
      await (active ? resumeAutomation(cardId) : pauseAutomation(cardId))
      toast.success(t(active ? "Automation resumed" : "Automation paused"))
    } catch (cause) {
      const reason = cause instanceof Error ? t(cause.message) : t("The automation state could not be saved.")
      toast.error(`${reason} ${t("The previous confirmed setting has been restored. Check your connection and try again.")}`)
    } finally {
      setAutomationSaving(false)
    }
  }

  if (status === "loading") {
    return (
      <div className="md-page md-page-stack">
        <PanelSkeleton rows={2} className="max-w-[420px]" />
        <Surface padding="md">
          <PanelSkeleton rows={6} />
        </Surface>
      </div>
    )
  }

  if (status === "error") {
    return (
      <div className="md-page md-page-stack">
        <Surface padding="md">
          <PanelError message={error ?? t("Unable to load this contact card. Check your connection and try again.")} onRetry={() => reloadContactCard(cardId)} />
        </Surface>
      </div>
    )
  }

  if (!card) {
    return (
      <div className="md-page md-page-stack">
        <Surface padding="md">
          <PanelMessage
            icon={TriangleAlert}
            tone="warning"
            title={t("This card no longer exists")}
            body={t("It may have been deleted from another session.")}
            action={
              <Button variant="outline" className="h-9 rounded-[var(--md-radius-md)] text-[13px]" onClick={() => navigate("/crm/contact-cards")}>
                <ArrowLeft data-icon="inline-start" strokeWidth={1.4} />
                {t("Back to contact cards")}
              </Button>
            }
          />
        </Surface>
      </div>
    )
  }

  const totals = cardTotals(card)
  const recentExchanges = [...card.exchanges].reverse().slice(0, 8)
  const exchangeColumns: DataTableColumn<CardExchange>[] = [
    {
      id: "contact",
      label: t("Contact"),
      kind: "identity",
      minWidth: 220,
      canHide: false,
      sortValue: (exchange) => `${exchange.firstName} ${exchange.lastName}`,
      cell: (exchange) => (
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-[var(--md-ink)]" data-i18n-skip dir="auto">
            {exchange.firstName} {exchange.lastName}
          </p>
          <p className="mt-0.5 truncate text-[12px] text-[var(--md-subtle)]" data-i18n-skip dir="ltr">
            {exchange.email}
          </p>
        </div>
      ),
    },
    {
      id: "company",
      label: t("Company"),
      kind: "text",
      minWidth: 180,
      sortValue: (exchange) => exchange.company,
      cell: (exchange) => (
        <span className="block truncate text-[12.5px] text-[var(--md-text)]" data-i18n-skip dir="auto">
          {exchange.company || "—"}
        </span>
      ),
    },
    {
      id: "shared",
      label: t("Shared"),
      kind: "date",
      minWidth: 160,
      sortValue: (exchange) => new Date(exchange.at).getTime(),
      cell: (exchange) => <bdi className="text-[12px] text-[var(--md-subtle)] tabular-nums">{exchangeDateTime.format(new Date(exchange.at))}</bdi>,
    },
    {
      id: "status",
      label: t("Status"),
      kind: "status",
      minWidth: 150,
      sortValue: (exchange) => exchange.outcome,
      cell: (exchange) => (
        <StatusPill kind="status" tone={exchange.outcome === "created" ? "teal" : "neutral"} indicator={false}>
          {t(exchange.outcome === "created" ? "New lead" : "Matched existing")}
        </StatusPill>
      ),
    },
  ]

  return (
    <div className="md-page md-page-stack">
      {/* Record header: identity, not content. Everything editable opens Settings. */}
      <div className="grid gap-[var(--md-gap-lg)]">
        <button
          type="button"
          className="inline-flex w-fit items-center gap-1.5 rounded-[var(--md-radius-sm)] text-[12px] text-[var(--md-subtle)] transition-colors duration-[160ms] hover:text-[var(--md-ink)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)] motion-reduce:transition-none"
          onClick={() => navigate("/crm/contact-cards")}
        >
          <ArrowLeft className="size-3.5" strokeWidth={1.5} />
          {t("Contact cards")}
        </button>

        <div className="flex flex-col gap-[var(--md-gap-lg)] xl:flex-row xl:items-start xl:justify-between">
          <div className="flex min-w-0 items-start gap-3.5">
            <CardPersonBadge card={card} profilePhotoUrl={ownerProfilePhotoUrl} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-[24px] font-medium leading-tight tracking-normal text-[var(--md-ink)]" data-i18n-skip dir="auto">
                  {card.label}
                </h1>
                <CardStatusPill status={card.status} />
                {canWrite ? <SaveIndicator cardId={card.id} /> : null}
              </div>
              <p className="mt-1.5 text-[13px] text-[var(--md-text)]">
                {card.person.role ? `${card.person.role} · ` : ""}
                {card.person.company} · {card.context}
              </p>
              {card.leadSource ? (
                <div className="mt-2">
                  <CopyableField label={t("Lead source")} value={card.leadSource} className="-my-1">
                    <span className="text-[12.5px] text-[var(--md-subtle)]">
                      {t("Lead source")}:{" "}
                      <bdi className="text-[var(--md-text)]" data-i18n-skip dir="auto">
                        {card.leadSource}
                      </bdi>
                    </span>
                  </CopyableField>
                </div>
              ) : (
                <p className="mt-2 text-[12.5px] text-[var(--md-subtle)]">{t("No lead source set. Leads will be created without one.")}</p>
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {canWrite ? <label className="inline-flex h-10 items-center gap-2 rounded-[var(--md-radius-lg)] bg-white/35 px-3 text-[13px] font-medium text-[var(--md-text)] shadow-[var(--md-shadow-line)]">
              <span>{automationSaving ? t("Saving…") : t(card.automation.state === "active" ? "Active" : "Not active")}</span>
              <Switch
                checked={card.automation.state === "active"}
                aria-label={t("Automation active")}
                disabled={automationSaving}
                onCheckedChange={(active) => { void changeAutomationState(active) }}
              />
            </label> : null}
            <Button
              variant="ghost"
              className="h-10 rounded-[var(--md-radius-lg)] bg-white/35 px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/65"
              onClick={() => window.open(`${cardPublicPath(card)}?preview=1`, "_blank", "noopener")}
            >
              <ExternalLink data-icon="inline-start" strokeWidth={1.2} />
              {t("Preview")}
            </Button>
            {canWrite && card.status === "published" ? (
              <Button
                variant="ghost"
                className="h-10 rounded-[var(--md-radius-lg)] bg-white/35 px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/65"
                disabled={statusSaving}
                onClick={() => void changeCardStatus("paused")}
              >
                {t(statusSaving ? "Saving…" : "Pause card")}
              </Button>
            ) : canWrite ? (
              <Button
                className="h-10 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-[var(--md-accent-ink)] hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)]"
                disabled={statusSaving}
                onClick={() => void changeCardStatus("published")}
              >
                <QrCode data-icon="inline-start" strokeWidth={1.2} />
                {statusSaving ? t("Saving…") : card.status === "draft" ? t("Publish card") : t("Resume card")}
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <TabsRail tabs={visibleTabs.map((label) => ({ label: t(label) }))} activeTab={t(tab)} onChange={(label) => selectTab(visibleTabs.find((item) => t(item) === label) ?? "Overview")} />

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.smooth)}
        >
          {tab === "Overview" ? (
            <div className="grid items-start gap-[var(--md-page-stack-gap)] xl:grid-cols-[minmax(0,1fr)_360px] xl:gap-[var(--md-page-section-gap)]">
              <div className="grid content-start gap-[var(--md-page-stack-gap)] xl:order-1">
                <div className="grid content-start gap-2 sm:grid-cols-2 2xl:grid-cols-4">
                  <CardMetricTile label={t("Scans")} value={totals.scans.toLocaleString()} detail={`${totals.uniqueScans.toLocaleString()} ${t("unique")}`} />
                  <CardMetricTile label={t("Contacts shared")} value={totals.exchanges.toLocaleString()} tone="teal" detail={t("Completed exchanges")} />
                  <CardMetricTile label={t("Conversion")} value={formatPercent(totals.conversion)} detail={t("Of unique visits")} />
                  <CardMetricTile
                    label={t("New leads")}
                    value={totals.leadsCreated.toLocaleString()}
                    detail={`${totals.leadsMatched.toLocaleString()} ${t("matched existing")}`}
                  />
                </div>

                <section className="grid gap-3">
                  <SectionHeader title={t("Recent exchanges")} meta={t("The most recent people who shared their details.")} />
                  <DataTable
                    ariaLabel={t("Recent exchanges")}
                    columns={exchangeColumns}
                    rows={recentExchanges}
                    getRowKey={(exchange) => exchange.id}
                    storageKey={`contact-card-exchanges-${card.id}`}
                    minimumWidth={720}
                    showToolbar={false}
                    showColumnManager={false}
                    enableSelectionExport={false}
                    rowClassName="h-[58px]"
                    emptyState={(
                      <div className="mx-auto max-w-md px-5 py-6 text-center">
                        <QrCode className="mx-auto size-5 text-[var(--md-accent)]" strokeWidth={1.4} />
                        <p className="mt-2 text-[13px] font-medium text-[var(--md-ink)]">{t("No exchanges yet")}</p>
                        <p className="mt-1 text-[12px] leading-5 text-[var(--md-subtle)]">{t("Share the code and the first contacts will appear here.")}</p>
                      </div>
                    )}
                  />
                </section>
              </div>

              <div className="grid content-start gap-[var(--md-page-stack-gap)] xl:order-2 xl:sticky xl:top-[var(--md-page-stack-gap)]">
                <CardCodePanel card={card} />
              </div>
            </div>
          ) : null}

          {canWrite && tab === "Design" ? <CardDesignPanel card={card} profilePhotoUrl={ownerProfilePhotoUrl} /> : null}

          {canWrite && tab === "QR code" ? <CardQrPanel card={card} /> : null}

          {tab === "Analytics" ? <CardAnalyticsPanel card={card} status={status} /> : null}

          {canWrite && tab === "Automation" ? <CardAutomationPanel card={card} /> : null}

          {canWrite && tab === "Settings" ? (
            <CardSettingsPanel
              card={card}
              navigate={navigate}
              ownerProfile={ownerProfile}
              ownerProfilePhotoUrl={ownerProfilePhotoUrl}
              ownerFullName={ownerProfileContact.fullName}
              ownerPhone={ownerProfileContact.phone}
              ownerWebsite={ownerProfileContact.website}
            />
          ) : null}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Settings                                                                    */
/* -------------------------------------------------------------------------- */

function SettingRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid gap-2 py-3.5 sm:grid-cols-[minmax(0,240px)_minmax(0,1fr)] sm:items-start sm:gap-8">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-[var(--md-ink)]">{label}</p>
        {hint ? <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{hint}</p> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

function LockedProfileValue({ value, dir }: { value: string; dir?: "ltr" | "rtl" | "auto" }) {
  const { t } = useLanguage()

  return (
    <div
      className="flex h-9 max-w-[360px] items-center gap-2 rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] px-3 text-[13px] text-[var(--md-text)] shadow-[var(--md-shadow-line)]"
      role="textbox"
      aria-readonly="true"
      aria-label={value || t("Not added")}
      title={t("Managed in profile settings")}
    >
      <bdi className={value ? "min-w-0 flex-1 truncate" : "min-w-0 flex-1 truncate text-[var(--md-subtle)]"} dir={dir ?? "auto"} data-i18n-skip={Boolean(value)}>
        {value || t("Not added")}
      </bdi>
      <LockKeyhole className="size-3.5 shrink-0 text-[var(--md-subtle)]" strokeWidth={1.4} aria-hidden="true" />
    </div>
  )
}

function CardSettingsPanel({
  card,
  navigate,
  ownerProfile,
  ownerProfilePhotoUrl,
  ownerFullName,
  ownerPhone,
  ownerWebsite,
}: {
  card: ContactCard
  navigate: (path: string) => void
  ownerProfile: ApiTeamUser | null
  ownerProfilePhotoUrl: string | null
  ownerFullName: string
  ownerPhone: string
  ownerWebsite: string
}) {
  const { t } = useLanguage()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const set = (update: Partial<ContactCard>) => updateCard(card.id, (current) => ({ ...current, ...update }))
  const profileValues = {
    fullName: ownerFullName || ownerProfile?.displayName.trim() || card.person.fullName,
    role: ownerProfile?.jobTitle?.trim() || "",
    company: ownerProfile?.company?.name.trim() || card.tenantName,
    email: ownerProfile?.email.trim() || card.person.email,
    phone: ownerProfile ? ownerPhone : card.person.phone,
    website: ownerProfile ? ownerWebsite : card.person.website,
  }
  const profilePhoto = ownerProfilePhotoUrl || card.person.profileImageDataUrl
  const missingProfileDetails = !profilePhoto || !profileValues.role || !profileValues.phone || !profileValues.website

  useEffect(() => {
    if (!ownerProfile) return
    const changed = (Object.keys(profileValues) as Array<keyof typeof profileValues>)
      .some((key) => card.person[key] !== profileValues[key])
    if (!changed) return
    updateCard(card.id, (current) => ({
      ...current,
      person: { ...current.person, ...profileValues },
    }))
  }, [card.id, ownerFullName, ownerPhone, ownerProfile, ownerWebsite])

  return (
    <div className="grid gap-[var(--md-page-stack-gap)]">
      <Surface padding="md" className="p-5">
        <SectionHeader title={t("Your details")} meta={t("Keep these details up to date wherever you share your card.")} />
        {missingProfileDetails ? (
          <div className="mt-4 flex flex-col gap-3 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-[var(--md-ink)]">{t("Finish your card")}</p>
              <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{t("Add the missing details in your profile, then return here to preview the card.")}</p>
            </div>
            <Button type="button" variant="outline" className="h-9 shrink-0 rounded-[var(--md-radius-md)] text-[13px]" onClick={() => navigate("/settings")}>
              {t("Update profile")}
            </Button>
          </div>
        ) : null}
        <div className="mt-2 divide-y divide-[rgba(11,20,19,0.06)]">
          <SettingRow label={t("Profile photo")}>
            <div className="flex max-w-[360px] items-center gap-3 rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] p-2.5 shadow-[var(--md-shadow-line)]" title={t("Managed in profile settings")}>
              <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--md-surface)] text-[12px] font-medium text-[var(--md-text)]">
                {profilePhoto ? <img src={profilePhoto} alt="" className="size-full object-cover" /> : card.person.fullName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("")}
              </span>
              <span className={profilePhoto ? "min-w-0 flex-1 text-[13px] text-[var(--md-text)]" : "min-w-0 flex-1 text-[13px] text-[var(--md-subtle)]"}>
                {t(profilePhoto ? "Profile photo" : "Not added")}
              </span>
              <LockKeyhole className="size-3.5 shrink-0 text-[var(--md-subtle)]" strokeWidth={1.4} aria-hidden="true" />
            </div>
          </SettingRow>
          <SettingRow label={t("Full name")}>
            <LockedProfileValue value={profileValues.fullName} />
          </SettingRow>
          <SettingRow label={t("Job title")}>
            <LockedProfileValue value={profileValues.role} />
          </SettingRow>
          <SettingRow label={t("Company")}>
            <LockedProfileValue value={profileValues.company} />
          </SettingRow>
          <SettingRow label={t("Email")}>
            <LockedProfileValue value={profileValues.email} dir="ltr" />
          </SettingRow>
          <SettingRow label={t("Phone")} hint={t("Shown on the exchange screen and included in the contact download.")}>
            <div className="grid gap-2.5">
              <LockedProfileValue value={profileValues.phone} dir="ltr" />
              <label className="flex items-center gap-2.5 text-[13px] text-[var(--md-text)]">
                <Checkbox checked={card.showPhone} onCheckedChange={(checked) => set({ showPhone: checked === true })} />
                {t("Show phone number")}
              </label>
            </div>
          </SettingRow>
          <SettingRow label={t("Website")}>
            <div className="grid gap-2.5">
              <LockedProfileValue value={profileValues.website} dir="ltr" />
              <label className="flex items-center gap-2.5 text-[13px] text-[var(--md-text)]">
                <Checkbox checked={card.showWebsite} onCheckedChange={(checked) => set({ showWebsite: checked === true })} />
                {t("Show website")}
              </label>
            </div>
          </SettingRow>
        </div>
      </Surface>

      <Surface padding="md" className="p-5">
        <SectionHeader title={t("Social links")} meta={t("Add the ways people can reach or follow you after they scan the card.")} />
        <div className="mt-4">
          <ContactCardSocialLinksEditor
            links={card.person.socialLinks}
            onChange={(socialLinks) => updateCard(card.id, (current) => ({ ...current, person: { ...current.person, socialLinks } }))}
          />
        </div>
      </Surface>

      <Surface padding="md" className="p-5">
        <SectionHeader title={t("The public page")} meta={t("What a visitor reads before and after they share their details.")} />
        <div className="mt-2 divide-y divide-[rgba(11,20,19,0.06)]">
          <SettingRow label={t("Heading")}>
            <Input className="h-9 max-w-[420px] text-[13px]" value={card.publicHeading} onChange={(event) => set({ publicHeading: event.target.value })} />
          </SettingRow>
          <SettingRow label={t("Sub-heading")}>
            <Input className="h-9 max-w-[420px] text-[13px]" value={card.publicSubheading} onChange={(event) => set({ publicSubheading: event.target.value })} />
          </SettingRow>
          <SettingRow label={t("Button label")}>
            <Input className="h-9 max-w-[280px] text-[13px]" value={card.submitLabel} onChange={(event) => set({ submitLabel: event.target.value })} />
          </SettingRow>
          <SettingRow label={t("Thank-you heading")}>
            <Input className="h-9 max-w-[420px] text-[13px]" value={card.thanksHeading} onChange={(event) => set({ thanksHeading: event.target.value })} />
          </SettingRow>
          <SettingRow label={t("Thank-you message")}>
            <Input className="h-9 max-w-[420px] text-[13px]" value={card.thanksBody} onChange={(event) => set({ thanksBody: event.target.value })} />
          </SettingRow>
          <SettingRow label={t("Phone field")} hint={t("First name, last name, email and company are always required.")}>
            <Select value={card.phoneField} onValueChange={(value) => set({ phoneField: value as ContactCard["phoneField"] })}>
              <SelectTrigger className="h-9 max-w-[240px] text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="optional">{t("Optional")}</SelectItem>
                <SelectItem value="required">{t("Required")}</SelectItem>
                <SelectItem value="hidden">{t("Hidden")}</SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>
        </div>
      </Surface>

      <Surface padding="md" className="p-5">
        <SectionHeader title={t("Privacy and consent")} />
        <div className="mt-2 divide-y divide-[rgba(11,20,19,0.06)]">
          <SettingRow label={t("Show tenant name")} hint={t("Shows who receives submitted details. On by default.")}>
            <div className="flex items-center gap-3">
              <Switch
                checked={card.showTenantName}
                aria-label={t("Show tenant name")}
                onCheckedChange={(checked) => set({ showTenantName: checked })}
              />
              <span className="text-[13px] text-[var(--md-text)]">
                {card.showTenantName ? card.tenantName : t("Hidden")}
              </span>
            </div>
          </SettingRow>
          <SettingRow label={t("Privacy policy link")} hint={t("Always shown above the button on the public page.")}>
            <Input className="h-9 max-w-[420px] text-[13px]" dir="ltr" value={card.privacyUrl} onChange={(event) => set({ privacyUrl: event.target.value })} />
          </SettingRow>
          <SettingRow label={t("Marketing consent")} hint={t("An optional, unticked checkbox. Submitting is always consent for the follow-up they came for.")}>
            <div className="grid gap-2.5">
              <div className="flex items-center gap-3">
                <Switch
                  checked={card.consentEnabled}
                  aria-label={t("Marketing consent")}
                  onCheckedChange={(checked) => set({ consentEnabled: checked })}
                />
                <span className="text-[13px] text-[var(--md-text)]">{card.consentEnabled ? t("Shown") : t("Hidden")}</span>
              </div>
              {card.consentEnabled ? (
                <Input
                  className="h-9 max-w-[420px] text-[13px]"
                  placeholder={t("Send me occasional updates.")}
                  value={card.consentCopy}
                  onChange={(event) => set({ consentCopy: event.target.value })}
                />
              ) : null}
            </div>
          </SettingRow>
        </div>
      </Surface>

      <Surface padding="md" className="p-5">
        <SectionHeader title={t("Lead handling")} meta={t("Optional setup. A card works without any of this.")} />
        <div className="mt-2 divide-y divide-[rgba(11,20,19,0.06)]">
          <SettingRow label={t("Lead source")} hint={t("Stamped on every lead this card creates. Changing it does not rewrite leads that already exist.")}>
            <Input
              className="h-9 max-w-[360px] text-[13px]"
              placeholder={t("Event – UCN Sri Lanka")}
              value={card.leadSource}
              onChange={(event) => set({ leadSource: event.target.value })}
            />
          </SettingRow>
          <SettingRow label={t("Automation")}>
            <AutomationEnableRow card={card} />
          </SettingRow>
        </div>
      </Surface>

      <Surface padding="md" className="p-5">
        <SectionHeader title={t("Delete this card")} meta={t("The public link stops working immediately. Leads already created are kept.")} />
        <div className="mt-3">
          {confirmDelete ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="destructive"
                className="h-9 rounded-[var(--md-radius-md)] text-[13px]"
                disabled={deleting}
                onClick={() => {
                  setDeleting(true)
                  setDeleteError(null)
                  void deleteCard(card.id).then(() => {
                    toast.success(t("Card deleted"))
                    navigate("/crm/contact-cards")
                  }).catch((error) => {
                    setDeleteError(error instanceof Error ? t(error.message) : t("This card could not be deleted. Check your connection and try again."))
                  }).finally(() => setDeleting(false))
                }}
              >
                <Trash2 data-icon="inline-start" strokeWidth={1.4} />
                {t(deleting ? "Deleting…" : "Yes, delete this card")}
              </Button>
              <Button variant="ghost" disabled={deleting} className="h-9 rounded-[var(--md-radius-md)] text-[13px]" onClick={() => { setConfirmDelete(false); setDeleteError(null) }}>
                {t("Cancel")}
              </Button>
            </div>
          ) : (
            <Button variant="outline" className="h-9 rounded-[var(--md-radius-md)] text-[13px]" onClick={() => setConfirmDelete(true)}>
              <Trash2 data-icon="inline-start" strokeWidth={1.4} />
              {t("Delete card")}
            </Button>
          )}
          {deleteError ? <p role="alert" className="mt-3 text-[13px] leading-5 text-[var(--md-red)]">{deleteError}</p> : null}
        </div>
      </Surface>
    </div>
  )
}
