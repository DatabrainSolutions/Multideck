import { useEffect, useMemo, useState } from "react"
import { ArrowRight, ChevronLeft, ChevronRight, RefreshCw, Search } from "@/components/icons/hugeicons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DotGridLoaderPanel } from "@/components/multideck/dot-grid-loader"
import { InlineNotice } from "@/components/multideck/inline-notice"
import { StatusPill } from "@/components/multideck/status-pill"
import { Surface } from "@/components/multideck/surface"
import { useLanguage } from "@/i18n/language-provider"
import { cn } from "@/lib/utils"
import {
  getWarehouseBillingSettings,
  getWarehouseChargeStatement,
  listWarehouseChargeCustomers,
  saveWarehouseBillingSettings,
  type WarehouseBillingCycle,
  type WarehouseBillingSettings,
  type WarehouseChargeLine,
  type WarehouseChargeStatement,
} from "@/lib/warehouse-billing-api"

const controlClass = "h-10 w-full rounded-[var(--md-radius-lg)] border-0 bg-[var(--md-field-bg,white)] shadow-[var(--md-shadow-line)]"
const weekdays = [
  { value: 1, label: "Monday" }, { value: 2, label: "Tuesday" }, { value: 3, label: "Wednesday" }, { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" }, { value: 6, label: "Saturday" }, { value: 7, label: "Sunday" },
]
const fallbackTimeZones = ["Europe/London", "Europe/Dublin", "Europe/Amsterdam", "Europe/Berlin", "Europe/Paris", "Europe/Madrid", "Europe/Warsaw", "Europe/Vilnius", "UTC", "America/New_York", "America/Chicago", "America/Los_Angeles", "Asia/Dubai", "Asia/Singapore", "Asia/Shanghai", "Australia/Sydney"]

function timeZones(current: string) {
  const supported = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : fallbackTimeZones
  const zones = new Set([...supported, "UTC", current])
  return [...zones].sort((first, second) => first.localeCompare(second))
}

function SettingRow({ label, help, children }: { label: string; help: string; children: React.ReactNode }) {
  const { t } = useLanguage()
  return (
    <div className="grid gap-3 py-5 first:pt-0 last:pb-0 md:grid-cols-[minmax(0,1fr)_280px] md:items-center md:gap-8">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-[var(--md-ink)]">{t(label)}</p>
        <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{t(help)}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/**
 * Admin > Warehouse > Billing settings. The time zone and cut-off decide when
 * stock is counted for storage; the cycle decides the charging periods.
 */
export function WarehouseBillingSettingsWorkspace({ navigate }: { navigate?: (path: string) => void }) {
  const { t, language } = useLanguage()
  const [saved, setSaved] = useState<WarehouseBillingSettings | null>(null)
  const [draft, setDraft] = useState<Pick<WarehouseBillingSettings, "timeZone" | "cutoffTime" | "cycle" | "weekStart" | "monthStart"> | null>(null)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let alive = true
    setError("")
    getWarehouseBillingSettings()
      .then((settings) => { if (alive) { setSaved(settings); setDraft(pick(settings)) } })
      .catch((cause) => { if (alive) setError(cause instanceof Error ? cause.message : String(cause)) })
    return () => { alive = false }
  }, [reload])

  const zones = useMemo(() => timeZones(draft?.timeZone ?? "Europe/London"), [draft?.timeZone])
  const dirty = Boolean(saved && draft && JSON.stringify(pick(saved)) !== JSON.stringify(draft))

  async function save() {
    if (!saved || !draft || busy) return
    setBusy(true); setError(""); setNotice("")
    try {
      const result = await saveWarehouseBillingSettings(draft, saved.version)
      setSaved(result); setDraft(pick(result)); setNotice("Billing settings saved. The next stock count uses the new cut-off.")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  if (!saved || !draft) {
    return (
      <Surface padding="lg" className="rounded-[var(--md-radius-xl)]">
        {error ? <InlineNotice tone="error" title={t("Billing settings are unavailable")} action={<Button variant="outline" onClick={() => setReload((value) => value + 1)}>{t("Try again")}</Button>}>{t(error)}</InlineNotice> : <DotGridLoaderPanel label="Loading billing settings" />}
      </Surface>
    )
  }

  const disabled = !saved.canManage || busy
  const lastCount = saved.lastStockRecord
    ? `${new Intl.DateTimeFormat(language, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${saved.lastStockRecord.stockDate}T12:00:00Z`))} · ${new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(saved.lastStockRecord.capturedAt))} · ${saved.lastStockRecord.balances} ${t(saved.lastStockRecord.balances === 1 ? "stock line" : "stock lines")}`
    : null

  return (
    <div className="grid gap-[var(--md-page-stack-gap)]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl">
          <h1 className="text-[20px] font-medium tracking-tight text-[var(--md-ink)]">{t("Billing settings")}</h1>
          <p className="mt-1 text-[13px] leading-5 text-[var(--md-text)]">{t("When stock is counted for storage charges, and how charges are grouped into billing periods. Prices are set in Default pricing and each customer’s Warehouse tab.")}</p>
        </div>
        {navigate ? <Button variant="outline" onClick={() => navigate("/warehouse/charges")}>{t("View charges")}<ArrowRight className="size-4" /></Button> : null}
      </div>

      {error ? <InlineNotice tone="error" title={t("Billing settings need attention")} action={<Button variant="outline" onClick={() => setReload((value) => value + 1)}>{t("Reload")}</Button>}>{t(error)}</InlineNotice> : null}
      {notice ? <InlineNotice tone="success" title={t("Saved")}>{t(notice)}</InlineNotice> : null}
      {!saved.canManage ? <InlineNotice>{t("You can view billing settings. Warehouse write permission is needed to change them.")}</InlineNotice> : null}
      {saved.isDefault ? <InlineNotice title={t("Using the standard settings")}>{t("Stock is counted at 23:59 UK time and charged in calendar months until you save your own settings.")}</InlineNotice> : null}

      <Surface padding="lg" className="rounded-[var(--md-radius-xl)]">
        <h2 className="text-[14px] font-medium text-[var(--md-ink)]">{t("Daily stock count")}</h2>
        <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{t("Storage only starts once goods are booked in. Expected receipts, orders, invoices and purchase orders never start storage charges.")}</p>
        <div className="mt-5 divide-y divide-[var(--md-line)]">
          <SettingRow label="Time zone" help="The warehouse’s local time. The cut-off follows this time zone, including clock changes.">
            <Select value={draft.timeZone} onValueChange={(timeZone) => setDraft({ ...draft, timeZone })} disabled={disabled}>
              <SelectTrigger aria-label={t("Time zone")} className={controlClass}><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">{zones.map((zone) => <SelectItem key={zone} value={zone}><span dir="ltr">{zone.replaceAll("_", " ")}</span></SelectItem>)}</SelectContent>
            </Select>
          </SettingRow>
          <SettingRow label="Daily cut-off" help="Stock on hand at this time is charged as one day of storage for that day.">
            <Input type="time" step={60} aria-label={t("Daily cut-off")} value={draft.cutoffTime} disabled={disabled} onChange={(event) => setDraft({ ...draft, cutoffTime: event.target.value })} className={controlClass} />
          </SettingRow>
          <SettingRow label="Last stock count" help="Stock is counted automatically after each cut-off. A missed count is never filled in later, so it is never charged.">
            <p className="text-[12.5px] text-[var(--md-ink)]">{lastCount ?? t("No stock has been counted yet. The first count happens at the next cut-off.")}</p>
          </SettingRow>
        </div>
      </Surface>

      <Surface padding="lg" className="rounded-[var(--md-radius-xl)]">
        <h2 className="text-[14px] font-medium text-[var(--md-ink)]">{t("Billing period")}</h2>
        <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{t("Goods-in, goods-out and storage charges are grouped into these periods for review.")}</p>
        <div className="mt-5 divide-y divide-[var(--md-line)]">
          <SettingRow label="Billing cycle" help="Charge customers weekly or monthly.">
            <div role="radiogroup" aria-label={t("Billing cycle")} className="grid grid-cols-2 gap-1 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] p-1 shadow-[var(--md-shadow-line)]">
              {(["weekly", "monthly"] as WarehouseBillingCycle[]).map((cycle) => (
                <button key={cycle} type="button" role="radio" aria-checked={draft.cycle === cycle} disabled={disabled} onClick={() => setDraft({ ...draft, cycle })}
                  className={cn("h-8 rounded-[calc(var(--md-radius-lg)-4px)] text-[12.5px] transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)] disabled:cursor-not-allowed disabled:opacity-60", draft.cycle === cycle ? "bg-[var(--md-surface)] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)]" : "text-[var(--md-text)] hover:text-[var(--md-ink)]")}>
                  {t(cycle === "weekly" ? "Weekly" : "Monthly")}
                </button>
              ))}
            </div>
          </SettingRow>
          {draft.cycle === "weekly" ? (
            <SettingRow label="Week starts on" help="Each weekly period runs for seven days from this day.">
              <Select value={String(draft.weekStart)} onValueChange={(value) => setDraft({ ...draft, weekStart: Number(value) })} disabled={disabled}>
                <SelectTrigger aria-label={t("Week starts on")} className={controlClass}><SelectValue /></SelectTrigger>
                <SelectContent>{weekdays.map((day) => <SelectItem key={day.value} value={String(day.value)}>{t(day.label)}</SelectItem>)}</SelectContent>
              </Select>
            </SettingRow>
          ) : (
            <SettingRow label="Month starts on day" help="Each monthly period runs from this day to the day before it next month. Day 1 gives calendar months.">
              <Select value={String(draft.monthStart)} onValueChange={(value) => setDraft({ ...draft, monthStart: Number(value) })} disabled={disabled}>
                <SelectTrigger aria-label={t("Month starts on day")} className={controlClass}><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72">{Array.from({ length: 28 }, (_, index) => index + 1).map((day) => <SelectItem key={day} value={String(day)}>{day}</SelectItem>)}</SelectContent>
              </Select>
            </SettingRow>
          )}
        </div>
      </Surface>

      {saved.canManage ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="me-auto text-[12px] text-[var(--md-subtle)]">{t(dirty ? "Unsaved changes" : saved.version ? `Saved · version ${saved.version}` : "Not saved yet")}</span>
          {dirty ? <Button variant="ghost" disabled={busy} onClick={() => { setDraft(pick(saved)); setError("") }}>{t("Discard changes")}</Button> : null}
          <Button disabled={busy || (!dirty && !saved.isDefault)} onClick={() => void save()}>{t(busy ? "Saving…" : "Save billing settings")}</Button>
        </div>
      ) : null}
    </div>
  )
}

function pick(settings: WarehouseBillingSettings) {
  return { timeZone: settings.timeZone, cutoffTime: settings.cutoffTime, cycle: settings.cycle, weekStart: settings.weekStart, monthStart: settings.monthStart }
}

const stageSections: { stage: WarehouseChargeLine["stage"]; title: string; empty: string }[] = [
  { stage: "receipt", title: "Goods in", empty: "No goods were booked in during this period." },
  { stage: "dispatch", title: "Goods out", empty: "No goods were sent out during this period." },
  { stage: "storage", title: "Storage", empty: "No storage rates apply to this customer." },
]

const basisLabels: Record<WarehouseChargeLine["basis"], [string, string]> = {
  pallet: ["pallet", "pallets"], unit: ["unit", "units"], kg: ["kg", "kg"], m3: ["m³", "m³"], fixed: ["charge", "charges"],
}

/**
 * Warehouse > Charges. Calculated from real events for one customer and one
 * billing period, for review before invoicing. Nothing is posted.
 */
export function WarehouseChargesWorkspace({ navigate }: { navigate?: (path: string) => void }) {
  const { t, language } = useLanguage()
  const [customers, setCustomers] = useState<{ id: string; name: string }[] | null>(null)
  const [customerSearch, setCustomerSearch] = useState("")
  const [customerError, setCustomerError] = useState("")
  const [customerId, setCustomerId] = useState(() => new URLSearchParams(window.location.search).get("customer") ?? "")
  const [periodStart, setPeriodStart] = useState<string | null>(null)
  const [statement, setStatement] = useState<WarehouseChargeStatement | null>(null)
  const [statementError, setStatementError] = useState("")
  const [loading, setLoading] = useState(false)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let alive = true
    const timer = window.setTimeout(() => {
      listWarehouseChargeCustomers(customerSearch)
        .then((rows) => { if (alive) { setCustomers(rows); setCustomerError("") } })
        .catch((cause) => { if (alive) setCustomerError(cause instanceof Error ? cause.message : String(cause)) })
    }, customerSearch ? 220 : 0)
    return () => { alive = false; window.clearTimeout(timer) }
  }, [customerSearch])

  useEffect(() => {
    if (!customerId) { setStatement(null); return }
    let alive = true
    setLoading(true); setStatementError("")
    getWarehouseChargeStatement(customerId, periodStart)
      .then((result) => { if (alive) setStatement(result) })
      .catch((cause) => { if (alive) { setStatement(null); setStatementError(cause instanceof Error ? cause.message : String(cause)) } })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [customerId, periodStart, reload])

  function chooseCustomer(id: string) {
    setCustomerId(id)
    const url = new URL(window.location.href)
    url.searchParams.set("customer", id)
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`)
  }

  const day = (value: string, withYear = true) => new Intl.DateTimeFormat(language, { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`))
  const money = (value: number, currency: string) => new Intl.NumberFormat(language, { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(value)
  const number = new Intl.NumberFormat(language, { maximumFractionDigits: 3 })

  function measure(line: WarehouseChargeLine) {
    const [one, many] = basisLabels[line.basis]
    const quantity = `${number.format(line.quantity)} ${t(line.quantity === 1 ? one : many)}`
    if (line.stage !== "storage") return quantity
    if (line.period === "week") return `${quantity} · ${t("peak per week")} · ${line.periods} ${t(line.periods === 1 ? "week" : "weeks")}`
    return `${quantity} ${t("in total")} · ${line.periods} ${t(line.periods === 1 ? "day" : "days")} ${t("charged")}`
  }

  function rateLabel(line: WarehouseChargeLine) {
    const [one] = basisLabels[line.basis]
    const per = line.basis === "fixed" ? "" : ` ${t("per")} ${t(one)}`
    const period = line.period === "night" || line.period === "day" ? ` ${t("per day")}` : line.period === "week" ? ` ${t("per week")}` : line.basis === "fixed" ? ` ${t("per booking")}` : ""
    return `${money(line.rate, line.currency)}${per}${period}`
  }

  const selectedName = statement?.customer.name ?? customers?.find((customer) => customer.id === customerId)?.name ?? ""

  return (
    <div className="grid gap-[var(--md-page-stack-gap)]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl">
          <h1 className="text-[20px] font-medium tracking-tight text-[var(--md-ink)]">{t("Charges")}</h1>
          <p className="mt-1 text-[13px] leading-5 text-[var(--md-text)]">{t("Calculated from goods booked in, goods sent out and stock counted at the daily cut-off, using each customer’s rates. Review before invoicing.")}</p>
        </div>
        {navigate ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => navigate("/warehouse/billing")}>{t("Billing settings")}</Button>
            <Button variant="outline" onClick={() => navigate("/warehouse/pricing")}>{t("Default pricing")}</Button>
          </div>
        ) : null}
      </div>

      <div className="grid gap-[var(--md-page-stack-gap)] lg:grid-cols-[280px_minmax(0,1fr)] lg:items-start">
        <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
          <div className="relative p-3 shadow-[var(--md-stroke-bottom)]">
            <Search className="pointer-events-none absolute start-5.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--md-subtle)]" aria-hidden="true" />
            <Input value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} placeholder={t("Search customers…")} aria-label={t("Search customers")} className="h-9 rounded-[var(--md-radius-md)] ps-8 text-[12.5px]" dir="auto" />
          </div>
          <div role="listbox" aria-label={t("Customers")} className="max-h-[420px] overflow-y-auto p-1.5 md-scrollbar">
            {customerError ? <p role="alert" className="px-3 py-6 text-center text-[12px] text-[var(--md-red)]">{t(customerError)}</p>
              : !customers ? <DotGridLoaderPanel label="Loading customers" minHeight={120} />
              : !customers.length ? <p className="px-3 py-6 text-center text-[12px] leading-5 text-[var(--md-subtle)]">{t(customerSearch ? "No matching customers." : "No customers have warehouse orders or stock in your warehouses yet.")}</p>
              : customers.map((customer) => (
                <button key={customer.id} type="button" role="option" aria-selected={customer.id === customerId} onClick={() => chooseCustomer(customer.id)}
                  className={cn("flex w-full items-center rounded-[var(--md-radius-md)] px-3 py-2.5 text-start text-[12.5px] text-[var(--md-ink)] transition-colors hover:bg-[var(--md-hover)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]", customer.id === customerId && "bg-[var(--md-selected-bg)] font-medium")}>
                  <span data-i18n-skip className="min-w-0 truncate">{customer.name}</span>
                </button>
              ))}
          </div>
        </Surface>

        <div className="grid min-w-0 gap-[var(--md-page-stack-gap)]">
          {!customerId ? (
            <Surface padding="lg" className="grid min-h-[240px] place-items-center rounded-[var(--md-radius-xl)] text-center">
              <div className="max-w-sm">
                <p className="text-[14px] font-medium text-[var(--md-ink)]">{t("Choose a customer")}</p>
                <p className="mt-1 text-[12.5px] leading-5 text-[var(--md-text)]">{t("Their goods-in, goods-out and storage charges for the current billing period appear here.")}</p>
              </div>
            </Surface>
          ) : statementError ? (
            <Surface padding="lg" className="rounded-[var(--md-radius-xl)]">
              <InlineNotice tone="error" title={t("Charges could not be calculated")} action={<Button variant="outline" onClick={() => setReload((value) => value + 1)}><RefreshCw className="size-3.5" />{t("Try again")}</Button>}>{t(statementError)}</InlineNotice>
            </Surface>
          ) : !statement ? (
            <Surface padding="lg" className="rounded-[var(--md-radius-xl)]"><DotGridLoaderPanel label="Calculating charges" /></Surface>
          ) : (
            <>
              <Surface padding="lg" className={cn("rounded-[var(--md-radius-xl)] transition-opacity", loading && "opacity-60")} aria-busy={loading}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p data-i18n-skip className="truncate text-[15px] font-medium text-[var(--md-ink)]">{selectedName}</p>
                    <p className="mt-0.5 text-[12px] text-[var(--md-text)]">
                      {day(statement.period.start, false)} – {day(statement.period.end)} · {t(statement.period.cycle === "weekly" ? "Weekly period" : "Monthly period")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill tone={statement.period.isComplete ? "green" : statement.period.isCurrent ? "blue" : "neutral"}>{t(statement.period.isComplete ? "Complete" : statement.period.isCurrent ? "In progress" : "Not started")}</StatusPill>
                    <Button variant="outline" size="icon" aria-label={t("Previous period")} disabled={loading} onClick={() => setPeriodStart(statement.period.previousStart)} className="size-9"><ChevronLeft className="size-4 rtl:rotate-180" /></Button>
                    <Button variant="outline" size="icon" aria-label={t("Next period")} disabled={loading || !statement.period.isComplete} onClick={() => setPeriodStart(statement.period.nextStart)} className="size-9"><ChevronRight className="size-4 rtl:rotate-180" /></Button>
                  </div>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-[repeat(auto-fit,minmax(160px,1fr))]">
                  {(statement.totals.length ? statement.totals : [{ currency: "", amount: 0 }]).map((total) => (
                    <div key={total.currency || "none"} className="rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] p-3 shadow-[var(--md-shadow-line)]">
                      <p className="text-[11.5px] text-[var(--md-text)]">{t("Net charges")}{total.currency ? ` · ${total.currency}` : ""}</p>
                      <p className="mt-1 text-[20px] font-medium tabular-nums text-[var(--md-ink)]">{total.currency ? money(total.amount, total.currency) : "—"}</p>
                    </div>
                  ))}
                  <div className="rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] p-3 shadow-[var(--md-shadow-line)]">
                    <p className="text-[11.5px] text-[var(--md-text)]">{t("Days with a stock count")}</p>
                    <p className="mt-1 text-[20px] font-medium tabular-nums text-[var(--md-ink)]">{statement.nights.recorded} / {statement.nights.expected}</p>
                  </div>
                </div>
                {statement.warnings.length ? (
                  <InlineNotice tone="warning" title={t("Check before invoicing")} className="mt-4">
                    <ul className="grid gap-1">{statement.warnings.map((warning) => <li key={warning}>{t(warning)}</li>)}</ul>
                  </InlineNotice>
                ) : null}
              </Surface>

              {stageSections.map((section) => {
                const lines = statement.lines.filter((line) => line.stage === section.stage)
                return (
                  <Surface key={section.stage} padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
                    <div className="flex items-center justify-between gap-3 px-4 py-3 shadow-[var(--md-stroke-bottom)]">
                      <h2 className="text-[13px] font-medium text-[var(--md-ink)]">{t(section.title)}</h2>
                      <span className="text-[11.5px] text-[var(--md-subtle)]">{lines.length} {t(lines.length === 1 ? "charge" : "charges")}</span>
                    </div>
                    {!lines.length ? <p className="px-4 py-5 text-[12px] text-[var(--md-text)]">{t(section.empty)}</p> : (
                      <div className="divide-y divide-[var(--md-line)]">
                        {lines.map((line, index) => (
                          <div key={`${line.code}-${line.reference ?? index}`} className="grid gap-1 px-4 py-3 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1.4fr)_auto] sm:items-center sm:gap-4">
                            <div className="min-w-0">
                              <p data-i18n-skip className="truncate text-[12.5px] font-medium text-[var(--md-ink)]">{line.name}</p>
                              <p className="text-[11px] text-[var(--md-subtle)]"><span data-i18n-skip dir="ltr">{line.code}</span>{line.source === "customer" ? ` · ${t("Customer rate")}` : ""}{line.reference ? <> · <span data-i18n-skip dir="ltr">{line.reference}</span></> : null}{line.stage !== "storage" ? ` · ${day(line.date)}` : ""}</p>
                            </div>
                            <div className="min-w-0 text-[12px] text-[var(--md-text)]">
                              <p data-i18n-skip className="truncate">{measure(line)}</p>
                              <p data-i18n-skip className="truncate text-[11px] text-[var(--md-subtle)]">{rateLabel(line)}{line.minimum > 0 ? ` · ${t("minimum")} ${money(line.minimum, line.currency)}` : ""}</p>
                            </div>
                            <div className="text-start sm:text-end">
                              <p className="text-[13px] font-medium tabular-nums text-[var(--md-ink)]">{money(line.amount, line.currency)}</p>
                              {line.minimumApplied ? <p className="text-[11px] text-[var(--md-amber)]">{t("Minimum applied")}</p> : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Surface>
                )
              })}
              <p className="text-[11.5px] leading-5 text-[var(--md-subtle)]">{t(`Net amounts before tax, calculated ${new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(statement.generatedAt))}. Stock is counted at ${statement.settings.cutoffTime} (${statement.settings.timeZone.replaceAll("_", " ")}). This is not an invoice and nothing has been posted.`)}</p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
