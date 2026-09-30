import { useEffect, useMemo, useRef, useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import { ArrowRight, Search, X } from "@/components/icons/hugeicons"
import { EmptyStateIllustration } from "@/components/multideck/empty-state-illustration"
import { AdminSettingsExplorer, type ExplorerTarget } from "@/components/multideck/admin-settings-explorer"
import { adminExplorerAreas as explorerAreas, readRecentAdminSettings as readRecentSettings, rememberAdminSetting as rememberSetting, noteAdminSettingOpened, resetAdminExplorer, selectAdminSection, setAdminSettingsQuery, useAdminExplorerState, useDockedAdminSections, type RecentAdminSetting as RecentSetting } from "@/lib/admin-explorer-state"
import { KpiStrip } from "@/components/multideck/dashboard-kpi-strip"
import { DotGridLoaderPanel } from "@/components/multideck/dot-grid-loader"
import { InlineNotice } from "@/components/multideck/inline-notice"
import { SettingsPageHeader } from "@/components/multideck/settings-components"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { adminHubs, homeNavItem, inboxNavItem, sidebarAreas, type AdminHub } from "@/data/navigation-data"
import { useLanguage } from "@/i18n/language-provider"
import { getAdminAudit, type AdminAuditResponse } from "@/lib/admin-audit-api"
import type { DashboardKpi } from "@/lib/dashboard-live-data"
import { getDexterUsage, type DexterUsage } from "@/lib/dexter-api"
import { mdMotion } from "@/lib/motion"

type Navigate = (path: string) => void

/** The search field every Admin screen shares. Escape clears, then leaves. */
function AdminSettingsSearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useLanguage()
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <label className="relative block w-full sm:w-[300px]">
      <span className="sr-only">{t("Find a setting")}</span>
      <Search aria-hidden="true" className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-[var(--md-subtle)]" strokeWidth={1.5} />
      <Input
        ref={inputRef}
        type="search"
        value={value}
        placeholder={t("Find a setting")}
        className="h-9 ps-9 pe-9 [&::-webkit-search-cancel-button]:hidden"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Escape" || !value) return
          event.preventDefault()
          onChange("")
        }}
      />
      {value ? (
        <button
          type="button"
          aria-label={t("Clear search")}
          className="absolute inset-y-0 end-1.5 my-auto grid size-6 place-items-center rounded-full text-[var(--md-subtle)] transition-[background-color,color,scale] duration-150 hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] active:scale-90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)] motion-reduce:transition-none"
          onClick={() => { onChange(""); inputRef.current?.focus() }}
        >
          <X className="size-3.5" strokeWidth={1.6} />
        </button>
      ) : null}
    </label>
  )
}

/** The last few settings this person opened, so returning to one is a single click. */
function RecentSettings({ onOpen }: { onOpen: (item: RecentSetting) => void }) {
  const { t } = useLanguage()
  const reduceMotion = useReducedMotion()
  const [items] = useState(readRecentSettings)
  if (!items.length) return null
  return (
    <motion.nav
      aria-label={t("Recently opened")}
      initial={{ opacity: 0, y: reduceMotion ? 0 : 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={mdMotion.enter}
      className="-mt-1 flex flex-wrap items-center gap-2"
    >
      <span className="me-1 text-[12px] text-[var(--md-subtle)]">{t("Recently opened")}</span>
      {items.map((item) => (
        <a
          key={`${item.label}|${item.route}`}
          href={item.route}
          className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-full bg-[var(--md-surface)] px-3 text-[12px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] outline-none transition-[background-color,scale] duration-150 hover:bg-[var(--md-hover)] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)] active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100"
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
            event.preventDefault()
            onOpen(item)
          }}
        >
          <span className="truncate">{t(item.label)}</span>
          <span className="shrink-0 text-[11px] text-[var(--md-subtle)]">{t(item.area)}</span>
        </a>
      ))}
    </motion.nav>
  )
}

function NoMatches({ query, onClear }: { query: string; onClear: () => void }) {
  const { t } = useLanguage()
  return (
    <div className="grid min-h-48 place-items-center rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-6 text-center shadow-[var(--md-shadow-soft)]" role="status">
      <div>
        <p className="text-[14px] font-medium text-[var(--md-ink)]">{t("No settings match")} “{query.trim()}”</p>
        <p className="mt-1 text-[12px] text-[var(--md-text)]">{t("Try a shorter word, such as tax, users or logo.")}</p>
        <Button type="button" variant="outline" size="sm" className="mt-4" onClick={onClear}>{t("Clear search")}</Button>
      </div>
    </div>
  )
}

function useWorkspaceUsage() {
  const [usage, setUsage] = useState<DexterUsage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const load = async () => {
    setLoading(true)
    setError(null)
    try { setUsage(await getDexterUsage()) }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Usage could not be loaded.") }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])
  return { usage, error, loading, retry: load }
}

const money = (value: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(value)

function usageKpis(usage: DexterUsage | null): Record<"seats" | "dexter" | "plan", DashboardKpi> {
  const subscription = usage?.subscription
  const seatLimit = subscription?.paidSeats ?? subscription?.seatLimit ?? null
  return {
    seats: {
      label: "Seats in use",
      value: subscription ? (seatLimit ? `${subscription.occupiedSeats} / ${seatLimit}` : String(subscription.occupiedSeats)) : "–",
      detail: subscription ? (seatLimit ? `${subscription.remainingSeats} left · includes pending invitations` : "Includes pending invitations") : "Awaiting subscription details",
      tone: subscription && seatLimit && subscription.remainingSeats <= 0 ? "amber" : "neutral",
    },
    dexter: {
      label: "Dexter allowance",
      value: usage ? `${Math.round(usage.includedUsagePercent)}%` : "–",
      detail: usage ? `Used this period · ${usage.conversationCount} conversations` : "Usage unavailable",
      tone: usage && usage.includedUsagePercent >= 90 ? "amber" : "teal",
    },
    plan: {
      label: "Plan",
      value: subscription?.planName ?? "–",
      detail: subscription?.monthlyGbp != null ? `${money(subscription.monthlyGbp)} a month, excluding VAT` : "Price confirmed in your agreement",
      tone: "neutral",
    },
  }
}

export function AdminHubPage({ hub, navigate }: { hub: AdminHub; navigate: Navigate }) {
  const { t } = useLanguage()
  const docked = useDockedAdminSections()
  const { sectionId, query } = useAdminExplorerState()
  const open = ({ setting, area }: ExplorerTarget) => {
    noteAdminSettingOpened(area.id, setting)
    rememberSetting({ label: setting.label, route: setting.route, area: area.label })
    navigate(setting.route)
  }

  useEffect(() => { resetAdminExplorer(hub.id) }, [hub.id])

  // Beside the second sidebar the area's map is already on screen, so the page
  // waits for a setting to be chosen there.
  if (docked) {
    return (
      <div className="md-page grid min-h-[min(560px,70vh)] place-items-center">
        <div className="flex max-w-[38ch] flex-col items-center text-center">
          <EmptyStateIllustration variant="settings" />
          <h2 className="mt-4 text-[16px] font-medium text-[var(--md-ink)]">{t("Choose a setting")}</h2>
          <p className="mt-1.5 text-pretty text-[13px] leading-5 text-[var(--md-text)]">{t("Open a section in the sidebar, then pick the setting you want to change.")}</p>
        </div>
      </div>
    )
  }

  const explorer = (
    <AdminSettingsExplorer
      areas={explorerAreas}
      areaId={hub.id}
      query={query}
      sectionId={sectionId}
      onSectionChange={selectAdminSection}
      onOpen={open}
      empty={<NoMatches query={query} onClear={() => setAdminSettingsQuery("")} />}
    />
  )

  return (
    <div className="md-page md-page-stack">
      <SettingsPageHeader
        title={t(hub.label)}
        description={t(hub.description)}
        icon={hub.icon}
        descriptionPlacement="under-title"
        actions={<AdminSettingsSearch value={query} onChange={setAdminSettingsQuery} />}
      />
      {!query ? <RecentSettings key={`recent-${hub.id}`} onOpen={(item) => { rememberSetting(item); navigate(item.route) }} /> : null}
      {explorer}
    </div>
  )
}

const pageLabels = new Map<string, string>([
  [homeNavItem.route ?? "/", homeNavItem.label],
  [inboxNavItem.route ?? "/inbox", inboxNavItem.label],
  ["/agent-dexter", "Dexter"],
  ["/settings", "Settings"],
  ...sidebarAreas.flatMap((area) => area.destinations.flatMap((destination) => [destination, ...(destination.children ?? [])]))
    .filter((item) => item.route)
    .map((item) => [item.route!, item.label] as [string, string]),
])

function pageLabel(route: string | null) {
  if (!route) return null
  const path = route.split(/[?#]/)[0]
  if (pageLabels.has(path)) return pageLabels.get(path)!
  const parent = [...pageLabels.keys()].filter((key) => key !== "/" && path.startsWith(`${key}/`)).sort((a, b) => b.length - a.length)[0]
  return parent ? pageLabels.get(parent)! : path
}

function relativeTime(value: string, locale: string) {
  const seconds = Math.round((new Date(value).valueOf() - Date.now()) / 1000)
  if (!Number.isFinite(seconds)) return value
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" })
  const abs = Math.abs(seconds)
  if (abs < 60) return format.format(seconds, "second")
  if (abs < 3600) return format.format(Math.round(seconds / 60), "minute")
  if (abs < 86_400) return format.format(Math.round(seconds / 3600), "hour")
  return format.format(Math.round(seconds / 86_400), "day")
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?"
}

function DashboardPanel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-4 shadow-[var(--md-shadow-soft)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[14px] font-medium text-[var(--md-ink)]">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

export function AdminDashboard({ navigate }: { navigate: Navigate }) {
  const { t, language } = useLanguage()
  const reduceMotion = useReducedMotion()
  const [query, setQuery] = useState("")
  const { usage, loading: usageLoading } = useWorkspaceUsage()
  const [audit, setAudit] = useState<AdminAuditResponse | null>(null)
  const [auditError, setAuditError] = useState<string | null>(null)
  const [auditLoading, setAuditLoading] = useState(true)

  const loadAudit = async (signal?: AbortSignal) => {
    setAuditLoading(true)
    setAuditError(null)
    try { setAudit(await getAdminAudit("activity", { limit: 6, offset: 0 }, signal)) }
    catch (cause) { if (!signal?.aborted) setAuditError(cause instanceof Error ? cause.message : "Activity could not be loaded.") }
    finally { if (!signal?.aborted) setAuditLoading(false) }
  }
  useEffect(() => {
    const controller = new AbortController()
    void loadAudit(controller.signal)
    return () => controller.abort()
  }, [])

  const kpis = useMemo(() => {
    const fromUsage = usageKpis(usage)
    const active: DashboardKpi = {
      label: "Active now",
      value: audit ? String(audit.activeUsers.length) : "–",
      detail: audit ? (audit.activeUsers.length === 1 ? "Colleague working in Multideck" : "Colleagues working in Multideck") : "Presence unavailable",
      tone: "green",
    }
    return [active, fromUsage.seats, fromUsage.dexter, fromUsage.plan].map((kpi) => ({ ...kpi, label: t(kpi.label), detail: t(kpi.detail) }))
  }, [audit, usage, t])


  return (
    <div className="md-page md-page-stack">
      <SettingsPageHeader
        title={t("Admin")}
        description={t("How the workspace is running today, and every company setting in one place.")}
        descriptionPlacement="under-title"
        actions={<AdminSettingsSearch value={query} onChange={setQuery} />}
      />
      {query ? (
        <AdminSettingsExplorer areas={explorerAreas} areaId={null} query={query} onOpen={({ setting, area }) => { noteAdminSettingOpened(area.id, setting); rememberSetting({ label: setting.label, route: setting.route, area: area.label }); navigate(setting.route) }} empty={<NoMatches query={query} onClear={() => setQuery("")} />} />
      ) : (
        <>
          <RecentSettings onOpen={(item) => { rememberSetting(item); navigate(item.route) }} />
          {usageLoading && auditLoading ? <DotGridLoaderPanel label={t("Loading workspace…")} minHeight={96} /> : <div className="md-kpi-scope"><KpiStrip kpis={kpis} spark={false} /></div>}
          <div className="grid items-start gap-[var(--md-page-stack-gap)] lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <DashboardPanel
              title={t("Recent activity")}
              action={<Button type="button" size="xs" variant="ghost" onClick={() => navigate("/admin/detailed-log")}>{t("Detailed log")}<ArrowRight data-icon="inline-end" className="rtl:-scale-x-100" /></Button>}
            >
              {auditLoading ? <DotGridLoaderPanel label={t("Loading activity…")} minHeight={180} /> : auditError ? (
                <InlineNotice tone="error" title={t("Activity could not be loaded.")} action={<Button type="button" size="sm" variant="outline" onClick={() => void loadAudit()}>{t("Retry")}</Button>}>{auditError}</InlineNotice>
              ) : audit && audit.rows.length ? (
                <ul className="divide-y divide-[var(--md-hairline)]">
                  {audit.rows.map((row) => (
                    <li key={row.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] text-[var(--md-ink)]" data-i18n-skip>{row.title}</span>
                        <span className="block truncate text-[11px] text-[var(--md-subtle)]" data-i18n-skip>{row.actorName ?? row.actorEmail ?? t("System")}</span>
                      </span>
                      <time dateTime={row.occurredAt} className="shrink-0 text-[11px] tabular-nums text-[var(--md-subtle)]">{relativeTime(row.occurredAt, language)}</time>
                    </li>
                  ))}
                </ul>
              ) : <p className="py-6 text-center text-[12px] text-[var(--md-text)]">{t("Nothing has happened in this workspace yet.")}</p>}
            </DashboardPanel>
            <DashboardPanel
              title={t("Active now")}
              action={<Button type="button" size="xs" variant="ghost" onClick={() => navigate("/admin/activity")}>{t("Active log")}<ArrowRight data-icon="inline-end" className="rtl:-scale-x-100" /></Button>}
            >
              {auditLoading ? <DotGridLoaderPanel label={t("Loading presence…")} minHeight={180} /> : audit && audit.activeUsers.length ? (
                <ul className="space-y-2.5">
                  {audit.activeUsers.slice(0, 6).map((user) => (
                    <li key={user.id} className="flex items-center gap-3">
                      <Avatar className="size-8">
                        <AvatarFallback className="rounded-full bg-[var(--md-surface-tint)] text-[11px] font-medium text-[var(--md-ink)]">{initials(user.name)}</AvatarFallback>
                      </Avatar>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] text-[var(--md-ink)]" data-i18n-skip>{user.name}</span>
                        <span className="block truncate text-[11px] text-[var(--md-subtle)]">{pageLabel(user.route) ? t(pageLabel(user.route)!) : t("In Multideck")}</span>
                      </span>
                      <time dateTime={user.lastSeenAt} className="shrink-0 text-[11px] tabular-nums text-[var(--md-subtle)]">{relativeTime(user.lastSeenAt, language)}</time>
                    </li>
                  ))}
                </ul>
              ) : <p className="py-6 text-center text-[12px] text-[var(--md-text)]">{auditError ? t("Presence is unavailable right now.") : t("No one else is working right now.")}</p>}
            </DashboardPanel>
          </div>
          <section aria-labelledby="admin-areas-heading">
            <h2 id="admin-areas-heading" className="mb-2 px-1 text-[13px] font-medium text-[var(--md-ink)]">{t("Areas")}</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {adminHubs.map((hub, index) => {
                const Icon = hub.icon
                const count = hub.blocks.reduce((total, block) => total + block.links.length, 0)
                const summary = hub.display === "page" ? t("Opens directly") : hub.display === "menu" ? `${count} ${t("pages")}` : count === 1 ? t("1 setting") : `${count} ${t("settings")}`
                return (
                  <motion.a
                    key={hub.id}
                    href={hub.route}
                    initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...mdMotion.enter, delay: Math.min(index * 0.03, 0.24) }}
                    className="group/area flex min-w-0 items-start gap-3 rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-4 shadow-[var(--md-shadow-soft)] outline-none transition-[box-shadow,scale] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:shadow-[var(--md-shadow-lift)] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)] active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100"
                    onClick={(event) => {
                      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
                      event.preventDefault()
                      navigate(hub.route)
                    }}
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] text-[var(--md-accent)] shadow-[var(--md-shadow-line)]">
                      <Icon className="size-4" strokeWidth={1.4} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-[14px] font-medium text-[var(--md-ink)]">
                        <span className="truncate">{t(hub.label)}</span>
                        <ArrowRight aria-hidden="true" className="size-3.5 shrink-0 -translate-x-1 text-[var(--md-subtle)] opacity-0 transition-[opacity,translate] duration-150 group-hover/area:translate-x-0 group-hover/area:opacity-100 group-focus-visible/area:translate-x-0 group-focus-visible/area:opacity-100 motion-reduce:transition-none rtl:-scale-x-100" strokeWidth={1.6} />
                      </span>
                      <span className="mt-1 line-clamp-2 block text-[12px] leading-5 text-[var(--md-text)]">{t(hub.description)}</span>
                      <span className="mt-2 block text-[11px] text-[var(--md-subtle)]">{summary}</span>
                    </span>
                  </motion.a>
                )
              })}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
