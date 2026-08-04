import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import {
  ArrowLeft,
  ExternalLink,
  IdCard,
  ImageUp,
  Plus,
  QrCode,
  Trash2,
  TriangleAlert,
  UserRoundPlus,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { DataTable, type DataTableColumn } from "@/components/multideck/data-table"
import { SideDrawer } from "@/components/multideck/side-drawer"
import { SectionHeader, Surface } from "@/components/multideck/surface"
import { StatusPill } from "@/components/multideck/status-pill"
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
import { AutomationEnableRow, AutomationSummaryBand, CardAutomationPanel } from "@/components/multideck/contact-card-automation"
import { CardAnalyticsPanel } from "@/components/multideck/contact-card-analytics"
import { CardDesignPanel, ContactCardSocialLinksEditor } from "@/components/multideck/contact-card-design"
import { useLanguage } from "@/i18n/language-provider"
import { mdMotion, reduceMotion } from "@/lib/motion"
import {
  cardPublicPath,
  cardTotals,
  createCard,
  deleteCard,
  reloadContactCards,
  readLogoFile,
  setCardStatus,
  updateCard,
  useContactCard,
  useSortedCards,
} from "@/lib/contact-card-store"
import type { ContactCard } from "@/data/contact-card-data"

function formatPercent(value: number | null) {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`
}

function relativeDay(iso: string | null) {
  if (!iso) return "—"
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

function CreateCardDrawer({
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

  useEffect(() => {
    if (!open) {
      setForm({ fullName: "", role: "", company: "Multideck", email: "", phone: "", context: "", leadSource: "" })
      setTouched(false)
    }
  }, [open])

  const nameError = touched && !form.fullName.trim() ? t("Add the name shown on the card.") : null
  const emailError = touched && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) ? t("Add a valid email address.") : null
  const valid = !nameError && !emailError && form.fullName.trim() && form.email.trim()

  function submit() {
    setTouched(true)
    if (!form.fullName.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return

    const card = createCard({
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
  }

  return (
    <SideDrawer open={open} onClose={onClose} eyebrow={t("New card")} title={t("Create a QR contact card")} icon={UserRoundPlus} width={480}>
      <form
        className="space-y-[var(--md-gap-lg)] p-1"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <p className="text-[13px] leading-5 text-[var(--md-text)]">
          {t("A card represents one person. Everything else — the public page, the lead source and any automation — can be set up afterwards.")}
        </p>

        <Field label={t("Name on the card")}>
          <Input
            className="h-9 text-[13px]"
            value={form.fullName}
            aria-invalid={Boolean(nameError)}
            autoComplete="name"
            onChange={(event) => setForm({ ...form, fullName: event.target.value })}
          />
          {nameError ? <span className="mt-1.5 block text-[12px] text-[var(--md-red)]">{nameError}</span> : null}
        </Field>

        <Field label={t("Job title")} optional>
          <Input className="h-9 text-[13px]" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} />
        </Field>

        <Field label={t("Company")}>
          <Input className="h-9 text-[13px]" value={form.company} onChange={(event) => setForm({ ...form, company: event.target.value })} />
        </Field>

        <Field label={t("Email")}>
          <Input
            className="h-9 text-[13px]"
            type="email"
            dir="ltr"
            value={form.email}
            aria-invalid={Boolean(emailError)}
            autoComplete="email"
            onChange={(event) => setForm({ ...form, email: event.target.value })}
          />
          {emailError ? <span className="mt-1.5 block text-[12px] text-[var(--md-red)]">{emailError}</span> : null}
        </Field>

        <Field label={t("Phone")} optional>
          <Input className="h-9 text-[13px]" type="tel" dir="ltr" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
        </Field>

        <div className="h-px bg-[rgba(11,20,19,0.08)]" />

        <Field label={t("Where it will be used")} optional hint={t("Shown in the register so you can tell similar cards apart.")}>
          <Input className="h-9 text-[13px]" placeholder={t("UCN Sri Lanka")} value={form.context} onChange={(event) => setForm({ ...form, context: event.target.value })} />
        </Field>

        <Field label={t("Lead source")} optional hint={t("Stamped on every lead this card creates. You can set this later.")}>
          <Input
            className="h-9 text-[13px]"
            placeholder={t("Event – UCN Sri Lanka")}
            value={form.leadSource}
            onChange={(event) => setForm({ ...form, leadSource: event.target.value })}
          />
        </Field>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" className="h-9 rounded-[var(--md-radius-md)] text-[13px]" onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button
            type="submit"
            className="h-9 rounded-[var(--md-radius-md)] bg-[var(--md-accent)] text-[13px] text-[var(--md-accent-ink)] hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)]"
            aria-disabled={!valid}
          >
            {t("Create card")}
          </Button>
        </div>
      </form>
    </SideDrawer>
  )
}

/* -------------------------------------------------------------------------- */
/* Register                                                                    */
/* -------------------------------------------------------------------------- */

export function ContactCardsPage({ navigate }: { navigate: (path: string) => void }) {
  const { t } = useLanguage()
  const { cards, status, error } = useSortedCards()
  const [createOpen, setCreateOpen] = useState(false)

  const summary = useMemo(() => {
    const totals = cards.map(cardTotals)
    const scans = totals.reduce((sum, item) => sum + item.scans, 0)
    const uniqueScans = totals.reduce((sum, item) => sum + item.uniqueScans, 0)
    const exchanges = totals.reduce((sum, item) => sum + item.exchanges, 0)
    const leads = totals.reduce((sum, item) => sum + item.leadsCreated, 0)

    return {
      scans,
      exchanges,
      leads,
      live: cards.filter((card) => card.status === "published").length,
      conversion: uniqueScans > 0 ? exchanges / uniqueScans : null,
      needsAttention: cards.filter((card) => card.automation.autoPausedReason || card.automation.failures > 0).length,
    }
  }, [cards])

  const columns: DataTableColumn<ContactCard>[] = [
    {
      id: "card",
      label: t("Card"),
      minWidth: 240,
      defaultPinned: true,
      sortValue: (card) => card.label,
      cell: (card) => (
        <div className="flex min-w-0 items-center gap-3">
          <CardPersonBadge card={card} size="sm" />
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
      width: 104,
      sortValue: (card) => card.status,
      cell: (card) => <CardStatusPill status={card.status} />,
    },
    {
      id: "source",
      label: t("Lead source"),
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
      sortValue: (card) => cardTotals(card).scans,
      cell: (card) => <span className="text-[13px] text-[var(--md-ink)] tabular-nums">{cardTotals(card).scans.toLocaleString()}</span>,
    },
    {
      id: "exchanges",
      label: t("Shared"),
      width: 88,
      headerClassName: "text-right",
      cellClassName: "text-right",
      sortValue: (card) => cardTotals(card).exchanges,
      cell: (card) => <span className="text-[13px] text-[var(--md-ink)] tabular-nums">{cardTotals(card).exchanges.toLocaleString()}</span>,
    },
    {
      id: "conversion",
      label: t("Conversion"),
      width: 106,
      headerClassName: "text-right",
      cellClassName: "text-right",
      sortValue: (card) => cardTotals(card).conversion ?? -1,
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
      <div className="flex flex-col gap-[var(--md-gap-lg)] xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <p className="text-[12px] font-medium uppercase tracking-normal text-[var(--md-subtle)]">{t("CRM")}</p>
          <h1 className="mt-2 text-[24px] font-medium leading-tight tracking-normal text-[var(--md-ink)]">{t("Contact cards")}</h1>
          <p className="mt-2 max-w-[68ch] text-[13px] leading-5 text-[var(--md-text)]">
            {t("A shareable QR card for each person. Someone scans it, shares their details, and gets your contact details back — the lead lands in the CRM with the card's source.")}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            className="h-10 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-[var(--md-accent-ink)] hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)]"
            onClick={() => setCreateOpen(true)}
          >
            <Plus data-icon="inline-start" strokeWidth={1.2} />
            {t("New card")}
          </Button>
        </div>
      </div>

      {status === "ready" && cards.length > 0 ? (
        <div className="grid gap-[var(--md-gap-lg)] sm:grid-cols-2 xl:grid-cols-4">
          <CardMetricTile label={t("Live cards")} value={summary.live.toLocaleString()} detail={`${cards.length} ${t("total")}`} />
          <CardMetricTile label={t("Scans")} value={summary.scans.toLocaleString()} detail={t("Across all cards")} />
          <CardMetricTile label={t("Contacts shared")} value={summary.exchanges.toLocaleString()} detail={`${summary.leads.toLocaleString()} ${t("new leads")}`} tone="teal" />
          <CardMetricTile
            label={t("Needs attention")}
            value={summary.needsAttention.toLocaleString()}
            detail={summary.needsAttention > 0 ? t("Automations with failures") : t("All automations healthy")}
            tone={summary.needsAttention > 0 ? "amber" : "neutral"}
          />
        </div>
      ) : null}

      <Surface padding="md" className="p-5">
        {status === "loading" ? (
          <>
            <SectionHeader title={t("Your cards")} />
            <PanelSkeleton className="mt-4" rows={5} />
          </>
        ) : status === "error" ? (
          <PanelError message={error ?? t("Unable to load contact cards. Check your connection and try again.")} onRetry={reloadContactCards} />
        ) : cards.length === 0 ? (
          <PanelMessage
            icon={IdCard}
            title={t("No contact cards yet")}
            body={t("Create a card for a person, print or display the code, and every scan becomes a contact exchange and a CRM lead.")}
            action={
              <Button
                className="h-9 rounded-[var(--md-radius-md)] bg-[var(--md-accent)] text-[13px] text-[var(--md-accent-ink)] hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)]"
                onClick={() => setCreateOpen(true)}
              >
                <Plus data-icon="inline-start" strokeWidth={1.2} />
                {t("New card")}
              </Button>
            }
          />
        ) : (
          <DataTable
            columns={columns}
            rows={cards}
            getRowKey={(card) => card.id}
            storageKey="contact-cards"
            ariaLabel={t("Contact cards")}
            onRowClick={(card) => navigate(`/crm/contact-cards/${card.id}`)}
          />
        )}
      </Surface>

      <CreateCardDrawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(card) => {
          setCreateOpen(false)
          toast.success(t("Card created as a draft"))
          navigate(`/crm/contact-cards/${card.id}`)
        }}
      />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Detail                                                                      */
/* -------------------------------------------------------------------------- */

const TABS = ["Overview", "Design", "Automation", "Analytics", "Settings"] as const
type CardTab = (typeof TABS)[number]

function readTab(): CardTab {
  const value = new URLSearchParams(window.location.search).get("tab")
  const match = TABS.find((tab) => tab.toLowerCase() === value)
  return match ?? "Overview"
}

export function ContactCardDetailPage({ cardId, navigate }: { cardId: string; navigate: (path: string) => void }) {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const { card, status, error } = useContactCard(cardId)
  const [tab, setTab] = useState<CardTab>(readTab)

  function selectTab(next: CardTab) {
    setTab(next)
    const url = new URL(window.location.href)
    if (next === "Overview") url.searchParams.delete("tab")
    else url.searchParams.set("tab", next.toLowerCase())
    window.history.replaceState({}, "", url)
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
          <PanelError message={error ?? t("Unable to load this contact card. Check your connection and try again.")} onRetry={reloadContactCards} />
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
            <CardPersonBadge card={card} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-[24px] font-medium leading-tight tracking-normal text-[var(--md-ink)]" data-i18n-skip dir="auto">
                  {card.label}
                </h1>
                <CardStatusPill status={card.status} />
                <SaveIndicator cardId={card.id} />
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
            <Button
              variant="ghost"
              className="h-10 rounded-[var(--md-radius-lg)] bg-white/35 px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/65"
              onClick={() => window.open(`${cardPublicPath(card)}?preview=1`, "_blank", "noopener")}
            >
              <ExternalLink data-icon="inline-start" strokeWidth={1.2} />
              {t("Preview")}
            </Button>
            {card.status === "published" ? (
              <Button
                variant="ghost"
                className="h-10 rounded-[var(--md-radius-lg)] bg-white/35 px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/65"
                onClick={() => setCardStatus(card.id, "paused")}
              >
                {t("Pause card")}
              </Button>
            ) : (
              <Button
                className="h-10 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-[var(--md-accent-ink)] hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)]"
                onClick={() => {
                  setCardStatus(card.id, "published")
                  toast.success(t("Card is live"))
                }}
              >
                <QrCode data-icon="inline-start" strokeWidth={1.2} />
                {card.status === "draft" ? t("Publish card") : t("Resume card")}
              </Button>
            )}
          </div>
        </div>
      </div>

      <TabsRail tabs={TABS.map((label) => ({ label: t(label) }))} activeTab={t(tab)} onChange={(label) => selectTab(TABS.find((item) => t(item) === label) ?? "Overview")} />

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.smooth)}
        >
          {tab === "Overview" ? (
            <div className="grid gap-[var(--md-page-stack-gap)] xl:grid-cols-[minmax(0,1fr)_360px] xl:gap-[var(--md-page-section-gap)]">
              <div className="grid gap-[var(--md-page-stack-gap)] xl:order-1">
                <div className="grid gap-[var(--md-gap-lg)] sm:grid-cols-2 2xl:grid-cols-4">
                  <CardMetricTile label={t("Scans")} value={totals.scans.toLocaleString()} detail={`${totals.uniqueScans.toLocaleString()} ${t("unique")}`} />
                  <CardMetricTile label={t("Contacts shared")} value={totals.exchanges.toLocaleString()} tone="teal" detail={t("Completed exchanges")} />
                  <CardMetricTile label={t("Conversion")} value={formatPercent(totals.conversion)} detail={t("Of unique visits")} />
                  <CardMetricTile
                    label={t("New leads")}
                    value={totals.leadsCreated.toLocaleString()}
                    detail={`${totals.leadsMatched.toLocaleString()} ${t("matched existing")}`}
                  />
                </div>

                <AutomationSummaryBand card={card} onOpen={() => selectTab("Automation")} />

                <Surface padding="md" className="p-5">
                  <SectionHeader title={t("Recent exchanges")} meta={t("The most recent people who shared their details.")} />
                  <div className="mt-3">
                    {card.exchanges.length === 0 ? (
                      <PanelMessage
                        icon={QrCode}
                        title={t("No exchanges yet")}
                        body={t("Share the code and the first contacts will appear here.")}
                      />
                    ) : (
                      <ul className="divide-y divide-[rgba(11,20,19,0.06)]">
                        {[...card.exchanges].reverse().slice(0, 8).map((exchange) => (
                          <li key={exchange.id} className="flex items-start justify-between gap-4 py-2.5">
                            <div className="min-w-0">
                              <p className="truncate text-[13px] text-[var(--md-ink)]" data-i18n-skip dir="auto">
                                {exchange.firstName} {exchange.lastName}
                              </p>
                              <p className="mt-0.5 truncate text-[12px] text-[var(--md-subtle)]" data-i18n-skip dir="auto">
                                {exchange.company}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-3">
                              <span className="text-[12px] text-[var(--md-subtle)] tabular-nums">
                                {new Date(exchange.at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                              </span>
                              <StatusPill tone={exchange.outcome === "created" ? "teal" : "neutral"}>
                                {t(exchange.outcome === "created" ? "New lead" : "Matched existing")}
                              </StatusPill>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </Surface>
              </div>

              <div className="grid content-start gap-[var(--md-page-stack-gap)] xl:order-2 xl:sticky xl:top-[var(--md-page-stack-gap)]">
                <CardCodePanel card={card} />
              </div>
            </div>
          ) : null}

          {tab === "Design" ? <CardDesignPanel card={card} /> : null}

          {tab === "Analytics" ? <CardAnalyticsPanel card={card} status={status} /> : null}

          {tab === "Automation" ? <CardAutomationPanel card={card} /> : null}

          {tab === "Settings" ? <CardSettingsPanel card={card} navigate={navigate} /> : null}
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

function ProfileImageControl({ card }: { card: ContactCard }) {
  const { t } = useLanguage()
  const inputRef = useRef<HTMLInputElement>(null)

  async function accept(file: File | undefined) {
    if (!file) return
    try {
      const profileImageDataUrl = await readLogoFile(file)
      updateCard(card.id, (current) => ({ ...current, person: { ...current.person, profileImageDataUrl } }))
      toast.success(t("Profile photo updated"))
    } catch {
      toast.error(t("Choose a PNG, JPG or WebP image under 512KB."))
    }
  }

  return (
    <div className="flex max-w-[420px] items-center gap-3 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] p-3">
      <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--md-surface)] shadow-[var(--md-shadow-line)]">
        {card.person.profileImageDataUrl ? <img src={card.person.profileImageDataUrl} alt={t("Current profile photo")} className="size-full object-cover" /> : <ImageUp className="size-5 text-[var(--md-subtle)]" strokeWidth={1.4} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-[var(--md-ink)]">{card.person.profileImageDataUrl ? t("Profile photo added") : t("Add a profile photo")}</p>
        <p className="mt-0.5 text-[12px] text-[var(--md-subtle)]">{t("Shown above your contact details. Up to 512KB.")}</p>
      </div>
      <Button variant="outline" className="h-9 rounded-[var(--md-radius-md)] text-[13px]" onClick={() => inputRef.current?.click()}>
        {card.person.profileImageDataUrl ? t("Replace") : t("Choose")}
      </Button>
      {card.person.profileImageDataUrl ? (
        <Button variant="ghost" size="icon" className="size-9 rounded-[var(--md-radius-md)] text-[var(--md-subtle)] hover:text-[var(--md-red)]" aria-label={t("Remove profile photo")} onClick={() => updateCard(card.id, (current) => ({ ...current, person: { ...current.person, profileImageDataUrl: null } }))}>
          <Trash2 className="size-4" strokeWidth={1.4} />
        </Button>
      ) : null}
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => { void accept(event.target.files?.[0]); event.target.value = "" }} />
    </div>
  )
}

function CardSettingsPanel({ card, navigate }: { card: ContactCard; navigate: (path: string) => void }) {
  const { t } = useLanguage()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const set = (update: Partial<ContactCard>) => updateCard(card.id, (current) => ({ ...current, ...update }))
  const setPerson = (update: Partial<ContactCard["person"]>) =>
    updateCard(card.id, (current) => ({ ...current, person: { ...current.person, ...update } }))

  return (
    <div className="grid gap-[var(--md-page-stack-gap)]">
      <Surface padding="md" className="p-5">
        <SectionHeader title={t("The person on this card")} meta={t("These are the details a visitor receives after they share theirs.")} />
        <div className="mt-2 divide-y divide-[rgba(11,20,19,0.06)]">
          <SettingRow label={t("Profile photo")} hint={t("Optional. If no photo is added, the card uses your company logo or initials.")}>
            <ProfileImageControl card={card} />
          </SettingRow>
          <SettingRow label={t("Full name")}>
            <Input className="h-9 max-w-[360px] text-[13px]" value={card.person.fullName} onChange={(event) => setPerson({ fullName: event.target.value })} />
          </SettingRow>
          <SettingRow label={t("Job title")}>
            <Input className="h-9 max-w-[360px] text-[13px]" value={card.person.role} onChange={(event) => setPerson({ role: event.target.value })} />
          </SettingRow>
          <SettingRow label={t("Company")}>
            <Input className="h-9 max-w-[360px] text-[13px]" value={card.person.company} onChange={(event) => setPerson({ company: event.target.value })} />
          </SettingRow>
          <SettingRow label={t("Email")}>
            <Input className="h-9 max-w-[360px] text-[13px]" type="email" dir="ltr" value={card.person.email} onChange={(event) => setPerson({ email: event.target.value })} />
          </SettingRow>
          <SettingRow label={t("Phone")} hint={t("Shown on the exchange screen and included in the contact download.")}>
            <div className="grid gap-2.5">
              <Input className="h-9 max-w-[360px] text-[13px]" type="tel" dir="ltr" value={card.person.phone} onChange={(event) => setPerson({ phone: event.target.value })} />
              <label className="flex items-center gap-2.5 text-[13px] text-[var(--md-text)]">
                <Checkbox checked={card.showPhone} onCheckedChange={(checked) => set({ showPhone: checked === true })} />
                {t("Show the phone number publicly")}
              </label>
            </div>
          </SettingRow>
          <SettingRow label={t("Website")}>
            <div className="grid gap-2.5">
              <Input className="h-9 max-w-[360px] text-[13px]" dir="ltr" value={card.person.website} onChange={(event) => setPerson({ website: event.target.value })} />
              <label className="flex items-center gap-2.5 text-[13px] text-[var(--md-text)]">
                <Checkbox checked={card.showWebsite} onCheckedChange={(checked) => set({ showWebsite: checked === true })} />
                {t("Show the website publicly")}
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
                onClick={() => {
                  deleteCard(card.id)
                  toast.success(t("Card deleted"))
                  navigate("/crm/contact-cards")
                }}
              >
                <Trash2 data-icon="inline-start" strokeWidth={1.4} />
                {t("Yes, delete this card")}
              </Button>
              <Button variant="ghost" className="h-9 rounded-[var(--md-radius-md)] text-[13px]" onClick={() => setConfirmDelete(false)}>
                {t("Cancel")}
              </Button>
            </div>
          ) : (
            <Button variant="outline" className="h-9 rounded-[var(--md-radius-md)] text-[13px]" onClick={() => setConfirmDelete(true)}>
              <Trash2 data-icon="inline-start" strokeWidth={1.4} />
              {t("Delete card")}
            </Button>
          )}
        </div>
      </Surface>
    </div>
  )
}
