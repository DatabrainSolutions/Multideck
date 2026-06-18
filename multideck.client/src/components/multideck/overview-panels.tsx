import { lazy, Suspense, useEffect, useRef, useState, type CSSProperties } from "react"
import { AnimatePresence, LayoutGroup, motion } from "motion/react"
import { ArrowLeft, ArrowRight, CalendarDays, ChevronDown, Mail, Plus, ReceiptText, Save, Ship, Sparkles, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Progress } from "@/components/ui/progress"
import { TableCell } from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useLanguage } from "@/i18n/language-provider"
import type { LanguageCode } from "@/i18n/languages"
import { cn } from "@/lib/utils"
import {
  activityItems,
  cityQueues,
  customsQueue,
  dashboardRangeOptions,
  dashboardSnapshots,
  liveBookings,
  operatorJobs,
  savedDashboardViews,
  bookingModes,
  timezoneWorkQueues,
  type DashboardCustomRange,
  type DashboardRange,
  type StatusTone,
  type TimezoneWorkItem,
} from "@/data/multideck-data"
import { useClockDisplayMode, type ClockDisplayMode } from "@/lib/user-preferences"
import { AnimatedList } from "./animated-list"
import { MetricCard } from "./metric-card"
import { SectionHeader, Surface } from "./surface"
import { StatusPill, toneToVar } from "./status-pill"

const InteractiveBookingMap = lazy(() =>
  import("./interactive-booking-map").then((module) => ({
    default: module.InteractiveBookingMap,
  })),
)

export function useLiveNow() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(intervalId)
  }, [])

  return now
}

function getTimeZoneOffsetMinutes(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date)

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  const zonedTime = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute), Number(values.second))

  return Math.round((zonedTime - date.getTime()) / 60_000)
}

function getLocalTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/London"
}

function getLocalZoneLabel(date: Date, timeZone: string) {
  if (timeZone === "Europe/London") {
    return getTimeZoneOffsetMinutes(date, timeZone) === 60 ? "BST" : "GMT"
  }

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    timeZoneName: "short",
  }).formatToParts(date)

  return parts.find((part) => part.type === "timeZoneName")?.value ?? "Local"
}

function formatHourDelta(minutes: number) {
  if (minutes === 0) return ""

  const sign = minutes > 0 ? "+" : "-"
  const absoluteMinutes = Math.abs(minutes)
  const hours = Math.floor(absoluteMinutes / 60)
  const remainingMinutes = absoluteMinutes % 60

  if (remainingMinutes === 0) return `${sign}${hours}h`
  return `${sign}${hours}h ${remainingMinutes}m`
}

function getWorkTone(date: Date, timeZone: string): StatusTone {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "numeric",
      hourCycle: "h23",
    }).format(date),
  )

  if (hour >= 16 && hour < 17) return "amber"
  if (hour >= 8 && hour < 16) return "green"
  return "neutral"
}

function getWorkStatusLabel(tone: StatusTone) {
  if (tone === "amber") return "Closing soon"
  if (tone === "green") return "Working"
  return "OOH"
}

function getClockCellToneClass(tone: StatusTone) {
  if (tone === "amber") return "bg-[rgba(221,138,43,0.1)] hover:bg-[rgba(221,138,43,0.16)]"
  if (tone === "green") return "hover:bg-[rgba(255,255,255,0.45)]"
  return "bg-[rgba(11,20,19,0.045)] shadow-[inset_-1px_0_0_rgba(11,20,19,0.08),inset_0_0_0_1px_rgba(11,20,19,0.045)] hover:bg-[rgba(11,20,19,0.07)]"
}

function getClockStatusLine(tone: StatusTone) {
  if (tone === "amber") return "Clock-off 17:00"
  if (tone === "neutral") return "Clocked off"
  return null
}

function getCityClock(city: (typeof cityQueues)[number], now: Date) {
  const localTimeZone = getLocalTimeZone()
  const localOffset = getTimeZoneOffsetMinutes(now, localTimeZone)
  const cityOffset = getTimeZoneOffsetMinutes(now, city.timeZone)
  const localLabel = getLocalZoneLabel(now, localTimeZone)
  const delta = formatHourDelta(cityOffset - localOffset)

  return {
    comparison: delta ? `${localLabel} ${delta}` : localLabel,
    time: new Intl.DateTimeFormat("en-GB", {
      timeZone: city.timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(now),
    tone: getWorkTone(now, city.timeZone),
  }
}

function getSnapshot(range: DashboardRange) {
  return dashboardSnapshots[range] ?? dashboardSnapshots.today
}

function getLanguageLocale(language: LanguageCode) {
  if (language === "de") return "de-DE"
  if (language === "fr") return "fr-FR"
  if (language === "ar") return "ar-GB-u-ca-gregory"
  return "en-GB"
}

function getDateKey(date: Date) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, "0")
  const day = `${date.getDate()}`.padStart(2, "0")
  return `${year}-${month}-${day}`
}

function parseDateKey(dateKey: string | null) {
  if (!dateKey) return null
  const [year, month, day] = dateKey.split("-").map(Number)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1)
}

function getDefaultCustomRange(): DashboardCustomRange {
  const end = new Date()
  const start = new Date(end)
  start.setDate(end.getDate() - 6)
  return { start: getDateKey(start), end: getDateKey(end) }
}

function normalizeCustomRange(start: string, end: string): DashboardCustomRange {
  return start <= end ? { start, end } : { start: end, end: start }
}

function getCustomRangeLabel(range: DashboardCustomRange, locale: string) {
  const start = parseDateKey(range.start)
  const end = parseDateKey(range.end)
  if (!start || !end) return "Custom"

  const formatter = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" })
  const yearFormatter = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" })
  const sameYear = start.getFullYear() === end.getFullYear()
  return `${sameYear ? formatter.format(start) : yearFormatter.format(start)} - ${yearFormatter.format(end)}`
}

function getPreviewRange(start: string | null, end: string | null, hover: string | null) {
  if (!start) return null
  if (end) return normalizeCustomRange(start, end)
  if (hover) return normalizeCustomRange(start, hover)
  return { start, end: start }
}

function isDateInsideRange(dateKey: string, range: DashboardCustomRange | null) {
  return Boolean(range?.start && range.end && dateKey >= range.start && dateKey <= range.end)
}

function CalendarMonth({
  month,
  customRange,
  previewRange,
  locale,
  onSelectDate,
  onPreviewDate,
}: {
  month: Date
  customRange: DashboardCustomRange
  previewRange: DashboardCustomRange | null
  locale: string
  onSelectDate: (dateKey: string) => void
  onPreviewDate: (dateKey: string | null) => void
}) {
  const monthStart = startOfMonth(month)
  const monthLabel = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(monthStart)
  const firstWeekday = (monthStart.getDay() + 6) % 7
  const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate()
  const todayKey = getDateKey(new Date())
  const weekdayLabels = Array.from({ length: 7 }, (_, index) => new Intl.DateTimeFormat(locale, { weekday: "short" }).format(new Date(2026, 5, 8 + index)))
  const cells = Array.from({ length: firstWeekday + daysInMonth }, (_, index) => {
    if (index < firstWeekday) return null
    return new Date(monthStart.getFullYear(), monthStart.getMonth(), index - firstWeekday + 1)
  })

  return (
    <div className="min-w-0">
      <p className="text-[13px] font-medium text-[var(--md-ink)]">{monthLabel}</p>
      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-[var(--md-subtle)]">
        {weekdayLabels.map((label) => (
          <span key={label} className="grid h-7 place-items-center">
            {label}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1" onMouseLeave={() => onPreviewDate(null)}>
        {cells.map((date, index) => {
          if (!date) return <span key={`empty-${index}`} className="size-9" aria-hidden="true" />

          const dateKey = getDateKey(date)
          const isStart = customRange.start === dateKey
          const isEnd = customRange.end === dateKey
          const isInPreview = isDateInsideRange(dateKey, previewRange)
          const isToday = todayKey === dateKey

          return (
            <button
              key={dateKey}
              type="button"
              dir="ltr"
              aria-pressed={isStart || isEnd || isInPreview}
              aria-label={new Intl.DateTimeFormat(locale, { dateStyle: "full" }).format(date)}
              className={cn(
                "grid size-9 place-items-center rounded-[10px] text-[13px] font-medium text-[var(--md-text)] transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-white/78 hover:text-[var(--md-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(14,125,116,0.18)]",
                isToday && "shadow-[inset_0_0_0_1px_rgba(14,125,116,0.22)]",
                isInPreview && "bg-[rgba(14,125,116,0.1)] text-[var(--md-ink)]",
                (isStart || isEnd) && "bg-[var(--md-accent)] text-white shadow-[var(--md-shadow-line)] hover:bg-[var(--md-accent)] hover:text-white",
              )}
              onMouseEnter={() => onPreviewDate(dateKey)}
              onFocus={() => onPreviewDate(dateKey)}
              onClick={() => onSelectDate(dateKey)}
            >
              {date.getDate()}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function CustomDashboardRangePicker({
  active,
  customRange,
  onRangeChange,
  onCustomRangeChange,
}: {
  active: boolean
  customRange?: DashboardCustomRange
  onRangeChange: (range: DashboardRange) => void
  onCustomRangeChange?: (range: DashboardCustomRange) => void
}) {
  const { language, t } = useLanguage()
  const locale = getLanguageLocale(language)
  const resolvedRange = customRange ?? getDefaultCustomRange()
  const [open, setOpen] = useState(false)
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(parseDateKey(resolvedRange.start) ?? new Date()))
  const [hoveredDate, setHoveredDate] = useState<string | null>(null)
  const previewRange = getPreviewRange(resolvedRange.start, resolvedRange.end, hoveredDate)
  const hasCompleteRange = Boolean(parseDateKey(resolvedRange.start) && parseDateKey(resolvedRange.end))
  const rawRangeLabel = getCustomRangeLabel(resolvedRange, locale)
  const rangeLabel = rawRangeLabel === "Custom" ? t("Custom") : rawRangeLabel
  const waitingForEndDate = Boolean(resolvedRange.start && !resolvedRange.end)

  function updateOpen(nextOpen: boolean) {
    setOpen(nextOpen)
    if (nextOpen) onRangeChange("custom")
  }

  function selectDate(dateKey: string) {
    onRangeChange("custom")
    if (!resolvedRange.start || resolvedRange.end) {
      onCustomRangeChange?.({ start: dateKey, end: null })
      return
    }

    onCustomRangeChange?.(normalizeCustomRange(resolvedRange.start, dateKey))
    setHoveredDate(null)
  }

  function resetRange() {
    const nextRange = getDefaultCustomRange()
    onRangeChange("custom")
    onCustomRangeChange?.(nextRange)
    setVisibleMonth(startOfMonth(parseDateKey(nextRange.start) ?? new Date()))
  }

  return (
    <Popover open={open} onOpenChange={updateOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className={cn(
            "h-10 rounded-[var(--md-radius-lg)] bg-white/35 px-3 text-[13px] font-medium text-[var(--md-text)] shadow-[var(--md-shadow-line)] hover:bg-white/70",
            active && "bg-[var(--md-glass-strong)] text-[var(--md-ink)]",
          )}
        >
          <CalendarDays data-icon="inline-start" className="size-3.5" strokeWidth={1.2} />
          <span className="max-w-[150px] truncate" dir={hasCompleteRange ? "ltr" : undefined}>
            {active ? rangeLabel : t("Custom")}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,560px)] rounded-[var(--md-radius-xl)] border-0 bg-[rgba(251,253,253,0.98)] p-3 text-[var(--md-ink)] shadow-[var(--md-shadow-lift)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[14px] font-medium text-[var(--md-ink)]">{t("Custom range")}</p>
            <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{t("Pick a start date, then an end date.")}</p>
          </div>
          <div className="flex shrink-0 gap-1">
            <Button type="button" variant="ghost" size="icon-sm" className="rounded-[10px] bg-white/45 shadow-[var(--md-shadow-line)] hover:bg-white/70" aria-label={t("Previous month")} onClick={() => setVisibleMonth((current) => addMonths(current, -1))}>
              <ArrowLeft className="size-3.5" strokeWidth={1.2} />
            </Button>
            <Button type="button" variant="ghost" size="icon-sm" className="rounded-[10px] bg-white/45 shadow-[var(--md-shadow-line)] hover:bg-white/70" aria-label={t("Next month")} onClick={() => setVisibleMonth((current) => addMonths(current, 1))}>
              <ArrowRight className="size-3.5" strokeWidth={1.2} />
            </Button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {[visibleMonth, addMonths(visibleMonth, 1)].map((month) => (
            <CalendarMonth
              key={getDateKey(month)}
              month={month}
              customRange={resolvedRange}
              previewRange={previewRange}
              locale={locale}
              onSelectDate={selectDate}
              onPreviewDate={(dateKey) => setHoveredDate(waitingForEndDate ? dateKey : null)}
            />
          ))}
        </div>
        <div className="mt-4 flex flex-col gap-3 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] p-3 shadow-[var(--md-shadow-line)] sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 text-[12px] leading-5 text-[var(--md-text)]">
            <span className="font-medium text-[var(--md-ink)]">{t("Selected custom range")}</span>
            <span className="ms-2 inline-block" dir={hasCompleteRange ? "ltr" : undefined}>
              {rangeLabel}
            </span>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button type="button" variant="ghost" className="h-8 rounded-[var(--md-radius-md)] bg-white/45 px-3 text-[12px] font-medium text-[var(--md-text)] shadow-[var(--md-shadow-line)] hover:bg-white/70" onClick={resetRange}>
              {t("Reset")}
            </Button>
            <Button type="button" className="h-8 rounded-[var(--md-radius-md)] bg-[var(--md-accent)] px-3 text-[12px] font-medium text-white hover:bg-[var(--md-accent)]/88" disabled={!resolvedRange.start || !resolvedRange.end} onClick={() => setOpen(false)}>
              {t("Apply range")}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export type DashboardDrilldownId = string

export function makeDashboardDrilldownId(kind: string, value: string) {
  return `${kind}:${value}`
}

export function getDashboardDrilldownLayoutId(id: DashboardDrilldownId) {
  return `dashboard-drilldown-${id.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`
}

function parseClockTime(time: string) {
  const [hours = "0", minutes = "0"] = time.split(":")
  return {
    hours: Number(hours),
    minutes: Number(minutes),
  }
}

function AnalogueClockFace({
  time,
  tone,
  size = "sm",
}: {
  time: string
  tone: StatusTone
  size?: "sm" | "md" | "lg"
}) {
  const { hours, minutes } = parseClockTime(time)
  const hourDegrees = ((hours % 12) + minutes / 60) * 30
  const minuteDegrees = minutes * 6

  return (
    <span
      className={cn(
        "relative shrink-0 rounded-full bg-white/76 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.82),0_0_0_1px_rgba(11,20,19,0.05)]",
        tone === "neutral" && "bg-[rgba(11,20,19,0.075)] shadow-[inset_0_0_0_1px_rgba(11,20,19,0.13),0_0_0_3px_rgba(11,20,19,0.035)]",
        size === "lg" ? "size-[74px]" : size === "md" ? "size-[62px]" : "size-11",
      )}
      aria-label={`Analogue time ${time}`}
      role="img"
    >
      {[0, 1, 2, 3].map((tick) => (
        <span
          key={tick}
          className={cn(
            "absolute left-1/2 top-1/2 block -translate-x-1/2 -translate-y-1/2 rounded-full bg-[rgba(90,103,100,0.28)]",
            tone === "neutral" && "bg-[rgba(11,20,19,0.42)]",
            size === "lg" ? "h-1 w-[5px]" : size === "md" ? "h-[3px] w-[4px]" : "h-0.5 w-1",
          )}
          style={{ transform: `translate(-50%, -50%) rotate(${tick * 90}deg) translateY(${size === "lg" ? "-28px" : size === "md" ? "-23px" : "-17px"})` }}
        />
      ))}
      <span
        className={cn("absolute left-1/2 top-1/2 block origin-bottom rounded-full bg-[var(--md-ink)]", tone === "neutral" && "bg-[var(--md-ink-soft)]", size === "lg" ? "h-[22px] w-[3px]" : size === "md" ? "h-[18px] w-[2.5px]" : "h-[13px] w-[2px]")}
        style={{ transform: `translate(-50%, -100%) rotate(${hourDegrees}deg)` }}
      />
      <span
        className={cn("absolute left-1/2 top-1/2 block origin-bottom rounded-full", size === "lg" ? "h-[30px] w-[2px]" : size === "md" ? "h-[25px] w-[1.5px]" : "h-[18px] w-[1.5px]")}
        style={{ background: tone === "neutral" ? "var(--md-ink)" : toneToVar(tone), transform: `translate(-50%, -100%) rotate(${minuteDegrees}deg)` }}
      />
      <span className={cn("absolute left-1/2 top-1/2 block -translate-x-1/2 -translate-y-1/2 rounded-full", size === "lg" ? "size-2" : size === "md" ? "size-[7px]" : "size-1.5")} style={{ background: tone === "neutral" ? "var(--md-ink)" : toneToVar(tone) }} />
    </span>
  )
}

export function OverviewHero({
  range,
  onRangeChange,
  dashboardViews = savedDashboardViews,
  selectedDashboard,
  onSelectDashboard,
  onCreateDashboard,
  onSaveDashboard,
  onOpenCustomise,
  compact,
  customRange,
  onCustomRangeChange,
}: {
  range: DashboardRange
  onRangeChange: (range: DashboardRange) => void
  dashboardViews?: string[]
  selectedDashboard?: string
  onSelectDashboard?: (dashboard: string) => void
  onCreateDashboard?: (dashboard: string) => void
  onSaveDashboard?: () => void
  onOpenCustomise?: () => void
  compact?: boolean
  customRange?: DashboardCustomRange
  onCustomRangeChange?: (range: DashboardCustomRange) => void
}) {
  const [createOpen, setCreateOpen] = useState(false)
  const [newDashboardName, setNewDashboardName] = useState("")
  const activeDashboard = selectedDashboard ?? dashboardViews[0] ?? "Dashboard"

  function createDashboard() {
    const name = newDashboardName.trim()
    if (!name) return
    onCreateDashboard?.(name)
    setNewDashboardName("")
    setCreateOpen(false)
  }

  return (
    <div className={cn("mb-4 flex flex-col gap-3", !compact && "xl:flex-row xl:items-center xl:justify-between")}>
      <div className="min-w-0">
        <h1 className="text-[32px] font-medium leading-tight tracking-normal text-[var(--md-ink)]">Good morning, Elena.</h1>
      </div>
      <div className={cn("flex flex-wrap items-center gap-2", !compact && "shrink-0")}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className="h-10 min-w-[190px] justify-between gap-3 rounded-[var(--md-radius-lg)] bg-white/45 px-3 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/70"
            >
              <span className="truncate">{activeDashboard}</span>
              <ChevronDown data-icon="inline-end" className="size-4 text-[var(--md-subtle)]" strokeWidth={1.2} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[240px] rounded-[var(--md-radius-lg)] border-0 bg-[var(--md-surface)] p-1 shadow-[var(--md-shadow-lift)]">
            <DropdownMenuLabel className="text-[12px] font-medium text-[var(--md-subtle)]">Dashboards</DropdownMenuLabel>
            {dashboardViews.map((dashboard) => (
              <DropdownMenuItem key={dashboard} className="text-[13px]" onSelect={() => onSelectDashboard?.(dashboard)}>
                {dashboard}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-[13px]" onSelect={() => onSaveDashboard?.()}>
              <Save data-icon="inline-start" className="size-3.5" strokeWidth={1.2} />
              Save current view
            </DropdownMenuItem>
            <DropdownMenuItem className="text-[13px]" onSelect={() => setCreateOpen(true)}>
              <Plus data-icon="inline-start" className="size-3.5" strokeWidth={1.2} />
              Create new dashboard
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <ToggleGroup type="single" value={range} onValueChange={(value) => value && onRangeChange(value as DashboardRange)} className="rounded-[var(--md-radius-lg)] bg-transparent p-0">
          {dashboardRangeOptions.map((value) => (
            <ToggleGroupItem key={value} value={value} className="h-10 rounded-[var(--md-radius-lg)] px-4 text-[13px] font-medium capitalize text-[var(--md-text)] data-[state=on]:bg-[var(--md-glass-strong)] data-[state=on]:text-[var(--md-ink)] data-[state=on]:shadow-[var(--md-shadow-line)]">
              {dashboardSnapshots[value].label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <CustomDashboardRangePicker active={range === "custom"} customRange={customRange} onRangeChange={onRangeChange} onCustomRangeChange={onCustomRangeChange} />
        <Button
          type="button"
          variant="ghost"
          className="h-10 rounded-[var(--md-radius-lg)] bg-white/35 px-4 text-[13px] font-medium text-[var(--md-text)] shadow-[var(--md-shadow-line)]"
          onClick={onOpenCustomise}
        >
          Customise
        </Button>
      </div>
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-[360px] rounded-[var(--md-radius-xl)] border-0 bg-[rgba(251,253,253,0.96)] p-0 text-[var(--md-ink)] shadow-[var(--md-shadow-lift)]">
          <DialogHeader className="px-5 pb-1 pt-5">
            <DialogTitle className="text-[16px] font-medium">New dashboard</DialogTitle>
            <DialogDescription className="text-[13px] leading-5 text-[var(--md-text)]">Name this layout so you can switch back to it later.</DialogDescription>
          </DialogHeader>
          <div className="px-5 py-3">
            <Input
              aria-label="Dashboard name"
              value={newDashboardName}
              onChange={(event) => setNewDashboardName(event.target.value)}
              placeholder="e.g. Customs morning view"
              className="h-10 rounded-[var(--md-radius-md)] border-0 bg-[var(--md-surface-tint)] text-[13px] shadow-[inset_0_0_0_1px_rgba(11,20,19,0.08)]"
              onKeyDown={(event) => {
                if (event.key === "Enter") createDashboard()
              }}
            />
          </div>
          <DialogFooter className="m-0 flex-row justify-end rounded-b-[var(--md-radius-xl)] border-0 bg-[var(--md-surface-soft)] px-5 py-4 shadow-[inset_0_1px_0_rgba(11,20,19,0.06)]">
            <DialogClose asChild>
              <Button type="button" variant="ghost" className="h-9 rounded-[var(--md-radius-md)] px-3 text-[13px] font-medium text-[var(--md-text)] hover:bg-white/70">
                Cancel
              </Button>
            </DialogClose>
            <Button type="button" className="h-9 rounded-[var(--md-radius-md)] bg-[var(--md-accent)] px-3 text-[13px] font-medium text-white hover:bg-[var(--md-accent)]/88" disabled={!newDashboardName.trim()} onClick={createDashboard}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function MetricsGrid({
  range,
  compact = false,
  onOpenDrilldown,
}: {
  range: DashboardRange
  compact?: boolean
  onOpenDrilldown?: (id: DashboardDrilldownId) => void
}) {
  const snapshot = getSnapshot(range)

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={range}
        className={cn("md-dashboard-metrics-grid grid gap-3 sm:grid-cols-2", !compact && "xl:grid-cols-4")}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      >
        {snapshot.kpis.map((metric) => {
          const drilldownId = makeDashboardDrilldownId("metric", metric.label)

          return (
            <motion.button
              key={metric.label}
              layoutId={getDashboardDrilldownLayoutId(drilldownId)}
              layout
              type="button"
              className="min-w-0 rounded-[var(--md-radius-xl)] text-left outline-none transition-transform duration-200 hover:scale-[1.01] focus-visible:ring-2 focus-visible:ring-[rgba(14,125,116,0.18)]"
              onClick={() => onOpenDrilldown?.(drilldownId)}
              transition={{ layout: { duration: 0.3, ease: [0.16, 1, 0.3, 1] } }}
            >
              <MetricCard {...metric} compact={compact} slim />
            </motion.button>
          )
        })}
      </motion.div>
    </AnimatePresence>
  )
}

export function WorldClockCell({
  city,
  selected,
  onSelect,
  now,
  enableLayoutMorph = true,
  compact = false,
  displayMode = "digital",
}: {
  city: (typeof cityQueues)[number]
  selected: boolean
  onSelect: () => void
  now?: Date
  enableLayoutMorph?: boolean
  compact?: boolean
  displayMode?: ClockDisplayMode
}) {
  const clock = getCityClock(city, now ?? new Date())
  const statusLine = getClockStatusLine(clock.tone)

  return (
    <motion.button
      layoutId={enableLayoutMorph ? `timezone-${city.code}` : undefined}
      layout
      type="button"
      data-md-clock-display={displayMode}
      className={cn(
        "md-world-clock-cell flex min-h-[96px] min-w-[145px] flex-col justify-between bg-transparent px-4 py-3 text-left shadow-[inset_-1px_0_0_rgba(11,20,19,0.08)] transition-[background,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
        displayMode === "analogue" && (compact ? "min-h-[138px] gap-2.5 px-3 py-3.5 text-center" : "min-h-[154px] min-w-[192px] gap-3 px-4 py-4 text-center"),
        compact && "min-w-0 px-3",
        getClockCellToneClass(clock.tone),
        selected && (clock.tone === "amber" ? "bg-[rgba(221,138,43,0.16)] shadow-[inset_0_0_0_1px_rgba(221,138,43,0.22),inset_-1px_0_0_var(--md-line)]" : clock.tone === "neutral" ? "bg-[rgba(11,20,19,0.075)] shadow-[inset_0_0_0_1px_rgba(11,20,19,0.12),inset_-1px_0_0_var(--md-line)]" : "bg-[var(--md-clock-selected-bg)]"),
      )}
      onClick={onSelect}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className={cn("flex items-center gap-1.5", displayMode === "analogue" && "justify-between gap-2")}>
        <span className="inline-flex items-center gap-1.5" dir="ltr">
          <span className="size-2 rounded-full" style={{ background: toneToVar(clock.tone) }} />
          <span className="text-[12px] font-medium text-[var(--md-text)]">{city.code}</span>
          {clock.tone === "neutral" ? <span className="rounded-full bg-[rgba(11,20,19,0.08)] px-1.5 py-0.5 text-[10px] font-medium leading-none text-[var(--md-ink)]">OOH</span> : null}
        </span>
        {displayMode === "analogue" ? <span className={cn("max-w-[92px] truncate text-end text-[11px] font-medium leading-snug text-[var(--md-text)]", clock.tone === "neutral" && "text-[var(--md-subtle)]")} dir="ltr">{clock.comparison}</span> : null}
      </div>
      {displayMode === "analogue" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2.5">
          <AnalogueClockFace time={clock.time} tone={clock.tone} size="md" />
          <div className="flex w-full min-w-0 flex-col items-center">
            <p className="line-clamp-2 max-w-full whitespace-normal break-words text-center text-[13px] font-medium leading-tight text-[var(--md-ink)]" title={city.city}>{city.city}</p>
            <p className={cn("mt-1 text-[13px] font-medium leading-tight text-[var(--md-text)]", clock.tone === "neutral" && "text-[var(--md-ink)]")} dir="ltr">{clock.time}</p>
            {statusLine ? <p className={cn("mt-1 text-[11px] font-medium", clock.tone === "amber" ? "text-[var(--md-amber-strong)]" : "text-[var(--md-ink-soft)]")}>{statusLine}</p> : null}
          </div>
        </div>
      ) : (
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="line-clamp-2 max-w-[88px] whitespace-normal break-words text-[13px] font-medium leading-tight text-[var(--md-ink)] sm:max-w-[104px]" title={city.city}>{city.city}</p>
            <p className={cn("font-medium leading-tight text-[var(--md-ink)] text-[18px]", compact && "text-[17px]")}>{clock.time}</p>
            {statusLine ? <p className={cn("mt-1 text-[11px] font-medium", clock.tone === "amber" ? "text-[var(--md-amber-strong)]" : "text-[var(--md-ink-soft)]")}>{statusLine}</p> : null}
          </div>
          <span className={cn("max-w-[70px] shrink-0 text-right text-[12px] font-medium leading-snug text-[var(--md-text)]", compact && "max-w-[58px] text-[11px]", clock.tone === "neutral" && "text-[var(--md-subtle)]")}>{clock.comparison}</span>
        </div>
      )}
    </motion.button>
  )
}

function TimezoneLeadCard({
  city,
  now,
  enableLayoutMorph = true,
  displayMode = "digital",
}: {
  city: (typeof cityQueues)[number]
  now: Date
  enableLayoutMorph?: boolean
  displayMode?: ClockDisplayMode
}) {
  const clock = getCityClock(city, now)
  const queue = timezoneWorkQueues[city.code]

  return (
    <motion.div
      layoutId={enableLayoutMorph ? `timezone-${city.code}` : undefined}
      layout
      animate={{ opacity: 1 }}
      className={cn(
        "grid min-h-[138px] gap-[var(--md-page-stack-gap)] rounded-[var(--md-radius-xl)] bg-white/72 p-[var(--md-page-stack-gap)] shadow-[var(--md-shadow-line)]",
        displayMode === "analogue" ? "md:grid-cols-[minmax(260px,300px)_1fr]" : "md:grid-cols-[220px_1fr]",
      )}
      transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
    >
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="size-2.5 rounded-full" style={{ background: toneToVar(clock.tone) }} />
          <span className="text-[12px] font-medium uppercase text-[var(--md-accent)]">{city.code}</span>
          <span className="rounded-full bg-[rgba(14,125,116,0.1)] px-2 py-1 text-[12px] font-medium text-[var(--md-accent)]">{clock.comparison}</span>
        </div>
        <div className={cn("mt-2 flex items-end gap-4", displayMode === "analogue" && "items-center")}>
          {displayMode === "analogue" ? <AnalogueClockFace time={clock.time} tone={clock.tone} size="lg" /> : null}
          <p className={cn("font-medium leading-none tracking-normal text-[var(--md-ink)]", displayMode === "analogue" ? "text-[28px]" : "text-[44px]")}>{clock.time}</p>
        </div>
        <p className="mt-2 text-[16px] font-medium text-[var(--md-ink)]">{city.city}</p>
        <p className={cn("mt-2 text-[13px] font-medium", clock.tone === "amber" ? "text-[var(--md-amber)]" : clock.tone === "green" ? "text-[var(--md-green)]" : "text-[var(--md-subtle)]")}>
          {getWorkStatusLabel(clock.tone)} · clock-off 17:00 · pickup cutoff {queue.cutoff.replace(" local", "")}
        </p>
      </div>
      <div className="flex min-w-0 flex-col justify-between gap-[var(--md-page-stack-gap)] md:border-l md:border-[rgba(11,20,19,0.06)] md:pl-[var(--md-page-stack-gap)]">
        <p className="max-w-[760px] text-[14px] leading-6 text-[var(--md-text)]">{queue.summary}</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {[
            ["Open RFQs", queue.openRfqs, "for this office", "neutral"],
            ["Need action", queue.needAction, "before cutoff", "amber"],
            ["Ready to quote", queue.readyToQuote, "send today", "green"],
          ].map(([label, value, detail, tone]) => (
            <div key={label} className="rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] px-4 py-3 shadow-[var(--md-shadow-line)]">
              <p className="text-[12px] font-medium text-[var(--md-text)]">{label}</p>
              <p className="mt-2 text-[24px] font-medium leading-none" style={{ color: tone === "neutral" ? "var(--md-ink)" : toneToVar(tone as StatusTone) }}>
                {value}
              </p>
              <p className="mt-2 text-[12px] text-[var(--md-text)]">{detail}</p>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  )
}

export function WorldClockPanel({
  selectedCode,
  onSelectTimezone,
  compact = false,
}: {
  selectedCode?: string | null
  onSelectTimezone?: (code: string | null) => void
  compact?: boolean
}) {
  const [internalSelected, setInternalSelected] = useState("LDN")
  const now = useLiveNow()
  const displayMode = useClockDisplayMode()
  const londonClock = getCityClock(cityQueues[0], now)
  const focusedCity = selectedCode ? cityQueues.find((city) => city.code === selectedCode) : null
  const previousSelectedCodeRef = useRef<string | null>(null)
  const shouldMorphFocusedLead = Boolean(focusedCity && previousSelectedCodeRef.current === null)

  useEffect(() => {
    previousSelectedCodeRef.current = selectedCode ?? null
  }, [selectedCode])

  function handleSelect(code: string) {
    if (onSelectTimezone) {
      onSelectTimezone(code)
      return
    }

    setInternalSelected(code)
  }

  return (
    <LayoutGroup>
      <Surface className="md-world-clock-panel flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--md-radius-xl)]" padding="none">
        <div className="md-world-clock-header flex shrink-0 flex-col gap-3 px-5 py-4 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {focusedCity ? (
              <Button
                type="button"
                variant="ghost"
                className="h-9 w-fit rounded-[var(--md-radius-lg)] bg-white/45 px-3 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/70"
                onClick={() => onSelectTimezone?.(null)}
              >
                <ArrowLeft data-icon="inline-start" strokeWidth={1.2} />
                All timezones
              </Button>
            ) : null}
            <SectionHeader title={focusedCity ? `Viewing ${focusedCity.city} outbound` : "World clock"} meta={focusedCity ? "Prioritised by local cutoff and outbound office availability" : `Reference - London ${londonClock.time} - click a city for local context`} />
          </div>
          <div className="flex flex-wrap items-center gap-4 text-[12px] font-medium text-[var(--md-text)]">
            {[
              ["Working", "green"],
              ["Closing soon", "amber"],
              ["OOH", "neutral"],
            ].map(([label, tone]) => (
              <span key={label} className="inline-flex items-center gap-2">
                <span className="size-2 rounded-full" style={{ background: toneToVar(tone as StatusTone) }} />
                {label}
              </span>
            ))}
          </div>
        </div>

        <AnimatePresence mode="popLayout" initial={false}>
          {focusedCity ? (
            <motion.div key="focused-clock" className="px-5 pb-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}>
              <TimezoneLeadCard city={focusedCity} now={now} enableLayoutMorph={shouldMorphFocusedLead} displayMode={displayMode} />
              <div className={cn("md-world-clock-strip mt-3 min-h-0 overflow-x-auto rounded-[var(--md-radius-lg)] bg-white/35 shadow-[var(--md-shadow-line)] md-scrollbar", compact && "overflow-visible")}>
                <div data-md-clock-display={displayMode} className={cn("md-world-clock-grid grid min-w-[980px] grid-cols-7", displayMode === "analogue" && "min-w-[1344px]", compact && "min-w-0 grid-cols-2 sm:grid-cols-3 2xl:grid-cols-7")}>
                  {cityQueues
                    .filter((city) => city.code !== focusedCity.code)
                    .map((city) => (
                      <WorldClockCell key={city.code} city={city} selected={false} onSelect={() => handleSelect(city.code)} now={now} enableLayoutMorph={false} compact={compact} displayMode={displayMode} />
                    ))}
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div key="clock-grid" className={cn("md-world-clock-strip min-h-0 flex-1 overflow-x-auto shadow-[inset_0_1px_0_rgba(11,20,19,0.08)] md-scrollbar", compact && "overflow-visible")} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              <div data-md-clock-display={displayMode} className={cn("md-world-clock-grid grid min-h-full min-w-[1120px] grid-cols-8", displayMode === "analogue" && "min-w-[1536px]", compact && "min-w-0 grid-cols-2 sm:grid-cols-4")}>
                {cityQueues.map((city) => (
                  <WorldClockCell key={city.code} city={city} selected={internalSelected === city.code} onSelect={() => handleSelect(city.code)} now={now} compact={compact} displayMode={displayMode} />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Surface>
    </LayoutGroup>
  )
}

export function TimezoneWorkRow({ item }: { item: TimezoneWorkItem }) {
  return (
    <div className="grid min-w-[1120px] grid-cols-[22px_120px_270px_260px_190px_100px_180px_150px] items-center gap-3 px-5 py-4 shadow-[inset_0_-1px_0_rgba(11,20,19,0.06)]">
      <span className="size-2.5 rounded-full shadow-[0_0_0_4px_rgba(90,103,100,0.08)]" style={{ background: toneToVar(item.priority) }} />
      <p className="text-[13px] font-medium text-[var(--md-text)]">{item.id}</p>
      <p className="min-w-0 truncate text-[14px] font-medium text-[var(--md-ink)]">{item.lane}</p>
      <p className="min-w-0 truncate text-[13px] text-[var(--md-text)]">{item.cargo}</p>
      <p className="min-w-0 truncate text-[13px] font-medium text-[var(--md-ink)]">{item.customer}</p>
      <p className="text-[13px] text-[var(--md-text)]">{item.ready}</p>
      <StatusPill tone={item.tone} className="w-fit">{item.status}</StatusPill>
      <Button
        type="button"
        variant={item.tone === "green" ? "default" : "ghost"}
        className={cn(
          "h-9 justify-between rounded-[var(--md-radius-lg)] px-3 text-[13px] font-medium",
          item.tone === "green"
            ? "bg-[var(--md-accent)] text-white hover:bg-[var(--md-accent)]/90"
            : "bg-white/58 text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/78",
        )}
      >
        {item.action}
        <ArrowRight data-icon="inline-end" strokeWidth={1.2} />
      </Button>
    </div>
  )
}

type DashboardActionItem = {
  title: string
  meta: string
  detail: string
  tone: StatusTone
  action: string
  secondaryAction?: string
}

type DashboardDrilldownDetail = {
  title: string
  meta: string
  tone: StatusTone
  rows: Array<[string, string]>
  actionItems?: DashboardActionItem[]
  primaryAction?: string
}

const dashboardEmailThreads: DashboardActionItem[] = [
  {
    title: "Sandra Hale - Marlow Apparel",
    meta: "Re: MD-22481 Felixstowe handover",
    detail: "Customer wants a clean ETA confirmation and cleared-docs note. A draft is ready from the booking timeline.",
    tone: "amber",
    action: "Reply",
    secondaryAction: "Draft",
  },
  {
    title: "Yong Hua Logistics",
    meta: "CN export licence for MD-22455",
    detail: "Ask for the missing licence PDF and packing-list confirmation so customs can resubmit the entry.",
    tone: "red",
    action: "Reply",
    secondaryAction: "Open booking",
  },
  {
    title: "Pacific Goods Co",
    meta: "DXB to Heathrow pickup options",
    detail: "Send the confirmed air quote with available pickup windows and the approved margin note.",
    tone: "green",
    action: "Send reply",
    secondaryAction: "Preview",
  },
  {
    title: "Bauhaus Importe GmbH",
    meta: "MD-22479 ETA slip",
    detail: "Use the customer-safe delay note and attach the updated ETA from the route model.",
    tone: "teal",
    action: "Reply",
    secondaryAction: "Attach ETA",
  },
]

const dashboardQuoteActions: DashboardActionItem[] = [
  {
    title: "Pacific Goods Co",
    meta: "DXB to Heathrow air",
    detail: "Rate is confirmed and inside margin rules. Send the customer options while the rate is still valid.",
    tone: "green",
    action: "Send quote",
    secondaryAction: "Review",
  },
  {
    title: "Northwind GmbH",
    meta: "Hamburg to Milan road",
    detail: "One carrier option needs a fuel surcharge check before the quote is sent.",
    tone: "amber",
    action: "Check margin",
    secondaryAction: "Open RFQ",
  },
  {
    title: "Marlow Apparel Ltd",
    meta: "Qingdao to Felixstowe ocean",
    detail: "Draft is ready, but use the customs note from MD-22414 before sending.",
    tone: "teal",
    action: "Preview quote",
    secondaryAction: "Edit",
  },
]

const dashboardWatchedBookingActions: DashboardActionItem[] = [
  {
    title: "MD-22455 - Northwind GmbH",
    meta: "Customs hold",
    detail: "Missing export licence is still the blocker. Open the booking and send the shipper chase.",
    tone: "red",
    action: "Open booking",
    secondaryAction: "Draft chase",
  },
  {
    title: "MD-22479 - Bauhaus Importe GmbH",
    meta: "ETA moved +36h",
    detail: "Customer-safe update is ready. Send it after reviewing the latest route note.",
    tone: "amber",
    action: "Notify customer",
    secondaryAction: "View ETA",
  },
  {
    title: "MD-22481 - Marlow Apparel Ltd",
    meta: "Docs cleared",
    detail: "No exception open. Send the arrival note and keep it pinned until handover.",
    tone: "green",
    action: "Send note",
    secondaryAction: "Unwatch",
  },
]

function getMetricActionItems(metricLabel: string): DashboardActionItem[] {
  if (metricLabel === "Emails waiting") return dashboardEmailThreads
  if (metricLabel === "Quotes due" || metricLabel === "Quotes sent") return dashboardQuoteActions
  if (metricLabel === "Watched bookings") return dashboardWatchedBookingActions
  if (metricLabel === "Your jobs") {
    return operatorJobs.slice(0, 4).map((job) => ({
      title: `${job.bookingId} - ${job.customer}`,
      meta: job.task,
      detail: job.detail,
      tone: job.tone,
      action: "Open job",
      secondaryAction: "Star",
    }))
  }
  return []
}

export function TimezoneFocusPanel({ selectedCode }: { selectedCode: string }) {
  const city = cityQueues.find((item) => item.code === selectedCode) ?? cityQueues[0]
  const queue = timezoneWorkQueues[city.code]
  const criticalCount = queue.items.filter((item) => item.priority === "red").length
  const highCount = queue.items.filter((item) => item.priority === "amber").length

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="mt-3"
    >
      <Surface className="overflow-hidden rounded-[var(--md-radius-xl)]" padding="none">
        <div className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-start md:justify-between">
          <SectionHeader title={`Outbound queue for ${city.city}`} meta={`Sorted by urgency - ${queue.items.length} active requests in this timezone`} />
          <div className="flex flex-wrap gap-2">
            {criticalCount > 0 ? <StatusPill tone="red">{criticalCount} critical</StatusPill> : null}
            {highCount > 0 ? <StatusPill tone="amber">{highCount} high</StatusPill> : null}
          </div>
        </div>
        <div className="overflow-x-auto shadow-[inset_0_1px_0_rgba(11,20,19,0.06)] md-scrollbar">
          <div className="grid min-w-[1120px] grid-cols-[22px_120px_270px_260px_190px_100px_180px_150px] gap-3 px-5 py-3 text-[12px] font-medium text-[var(--md-text)] shadow-[inset_0_-1px_0_rgba(11,20,19,0.06)]">
            <span />
            <span>Ref</span>
            <span>Lane</span>
            <span>Cargo</span>
            <span>Customer</span>
            <span>Ready</span>
            <span>Status</span>
            <span>Action</span>
          </div>
          {queue.items.map((item) => (
            <TimezoneWorkRow key={item.id} item={item} />
          ))}
        </div>
        <div className="flex flex-col gap-3 bg-[var(--md-surface-tint)] px-5 py-4 md:flex-row md:items-center md:justify-between">
          <p className="text-[13px] leading-5 text-[var(--md-text)]">
            <Sparkles className="mr-2 inline size-3.5 text-[var(--md-accent)]" strokeWidth={1.2} />
            Dexter can quote the <span className="font-medium text-[var(--md-ink)]">{queue.readyToQuote} ready RFQs</span> and chase the <span className="font-medium text-[var(--md-ink)]">{queue.needAction} blockers</span> before the {city.city} cutoff.
          </p>
          <Button variant="ghost" className="h-9 rounded-[var(--md-radius-lg)] bg-white/56 px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/78">
            Let Dexter handle it
          </Button>
        </div>
      </Surface>
    </motion.div>
  )
}

function getDashboardDrilldownDetail(id: DashboardDrilldownId, range: DashboardRange): DashboardDrilldownDetail {
  const [kind, ...rest] = id.split(":")
  const key = rest.join(":")
  const snapshot = getSnapshot(range)

  if (kind === "metric") {
    const metric = snapshot.kpis.find((item) => item.label === key) ?? snapshot.kpis[0]
    const actionItems = getMetricActionItems(metric.label)
    return {
      title: metric.label,
      meta: metric.label === "Emails waiting" ? "Customer threads from Outlook, ready to triage and reply." : `${metric.value} - ${metric.detail}`,
      tone: metric.tone,
      actionItems,
      primaryAction: metric.label === "Emails waiting" ? "Draft replies with Dexter" : actionItems.length ? "Work selected items" : undefined,
      rows: [
        ["Current", metric.value],
        ["Status", metric.change],
        ["Next step", metric.label === "Emails waiting" ? "Open the customer replies first" : metric.label === "Quotes due" ? "Send ready quotes before local cutoff" : metric.label === "Your jobs" ? "Work the due-soon tasks in order" : "Keep these starred bookings visible"],
      ],
    }
  }

  if (kind === "brief") {
    const item = snapshot.briefItems.find((entry) => entry.label === key) ?? snapshot.briefItems[0]
    return {
      title: item.label,
      meta: `${item.source} - ${item.value}`,
      tone: item.tone,
      actionItems: [
        {
          title: item.label,
          meta: item.source,
          detail: item.detail,
          tone: item.tone,
          action: item.value,
          secondaryAction: "Preview",
        },
      ],
      rows: [
        ["Action", item.detail],
        ["Next", item.value],
        ["Suggested owner", "Elena Moreno"],
      ],
    }
  }

  if (kind === "job") {
    const job = operatorJobs.find((item) => item.id === key) ?? operatorJobs[0]
    return {
      title: job.task,
      meta: `${job.bookingId} - ${job.customer}`,
      tone: job.tone,
      rows: [
        ["Route", job.route],
        ["Due", job.due],
        ["Why it matters", job.detail],
      ],
    }
  }

  if (kind === "activity") {
    const item = activityItems.find((entry) => entry.title === key) ?? activityItems[0]
    return {
      title: item.title,
      meta: `${item.source} - ${item.time}`,
      tone: item.tone,
      rows: [
        ["Source", item.source],
        ["Seen", item.time],
        ["Follow-up", item.tone === "red" ? "Open the linked booking and resolve the blocker" : "Keep in digest unless the customer asks"],
      ],
    }
  }

  if (kind === "customs") {
    const item = customsQueue.find((entry) => entry.id === key) ?? customsQueue[0]
    return {
      title: `${item.id} customs detail`,
      meta: item.entry,
      tone: item.tone,
      rows: [
        ["Entry", item.entry],
        ["Status", item.status],
        ["Progress", `${item.progress}% complete`],
      ],
    }
  }

  return {
    title: "Dashboard detail",
    meta: "Focused operational view",
    tone: "teal" as StatusTone,
    rows: [["Next step", "Return to the dashboard and choose a work item"]],
  }
}

export function DashboardDrilldownPanel({
  drilldownId,
  range,
  onBack,
}: {
  drilldownId: DashboardDrilldownId
  range: DashboardRange
  onBack: () => void
}) {
  const detail = getDashboardDrilldownDetail(drilldownId, range)

  return (
    <motion.div
      key={drilldownId}
      className="mt-3"
      initial={{ opacity: 0, y: 8, scale: 0.995 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.998 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
    >
      <motion.div
        layoutId={getDashboardDrilldownLayoutId(drilldownId)}
        layout
        transition={{ layout: { duration: 0.3, ease: [0.16, 1, 0.3, 1] } }}
      >
        <Surface className="overflow-hidden rounded-[var(--md-radius-xl)]" padding="none">
          <div className="flex flex-col gap-4 px-5 py-4 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <Button
                type="button"
                variant="ghost"
                className="mb-4 h-9 w-fit rounded-[var(--md-radius-lg)] bg-white/45 px-3 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/70"
                onClick={onBack}
              >
                <ArrowLeft data-icon="inline-start" strokeWidth={1.2} />
                Back to overview
              </Button>
              <div className="flex flex-wrap items-center gap-3">
                <span className="size-2.5 rounded-full" style={{ background: toneToVar(detail.tone) }} />
                <p className="text-[12px] font-medium uppercase text-[var(--md-accent)]">{getSnapshot(range).label} drill-down</p>
              </div>
              <h2 className="mt-2 text-[26px] font-medium leading-tight text-[var(--md-ink)]">{detail.title}</h2>
              <p className="mt-2 text-[14px] leading-6 text-[var(--md-text)]">{detail.meta}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {detail.primaryAction ? (
                <Button type="button" className="h-9 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-3 text-[13px] font-medium text-white hover:bg-[var(--md-accent)]/90">
                  {detail.primaryAction}
                </Button>
              ) : null}
              <StatusPill tone={detail.tone}>{detail.tone === "red" ? "Action needed" : detail.tone === "amber" ? "Watch today" : "Ready"}</StatusPill>
            </div>
          </div>
          <div className="bg-[var(--md-surface-tint)] p-4">
            {detail.actionItems?.length ? (
              <div className="flex flex-col gap-2">
                {detail.actionItems.map((item) => (
                  <div key={`${item.title}-${item.meta}`} className="grid gap-3 rounded-[var(--md-radius-lg)] bg-white/64 px-4 py-3 shadow-[var(--md-shadow-line)] md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="size-2 rounded-full" style={{ background: toneToVar(item.tone) }} />
                        <p className="truncate text-[14px] font-medium text-[var(--md-ink)]">{item.title}</p>
                        <span className="text-[12px] font-medium text-[var(--md-subtle)]">{item.meta}</span>
                      </div>
                      <p className="mt-1 text-[13px] leading-5 text-[var(--md-text)]">{item.detail}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {item.secondaryAction ? (
                        <Button type="button" variant="ghost" className="h-8 rounded-[var(--md-radius-md)] bg-white/52 px-3 text-[12px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/78">
                          {item.secondaryAction}
                        </Button>
                      ) : null}
                      <Button type="button" className="h-8 rounded-[var(--md-radius-md)] bg-[var(--md-accent)] px-3 text-[12px] font-medium text-white hover:bg-[var(--md-accent)]/90">
                        {item.action}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            {detail.rows.length ? (
              <div className={cn("grid gap-2", detail.actionItems?.length ? "mt-3 md:grid-cols-3" : "md:grid-cols-3")}>
                {detail.rows.map(([label, value]) => (
                  <div key={label} className="rounded-[var(--md-radius-md)] bg-white/42 px-3 py-2 shadow-[var(--md-shadow-line)]">
                    <p className="text-[11px] font-medium text-[var(--md-text)]">{label}</p>
                    <p className="mt-1 text-[13px] font-medium leading-5 text-[var(--md-ink)]">{value}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </Surface>
      </motion.div>
    </motion.div>
  )
}

export function BookingRow({
  booking,
  compact,
}: {
  booking: (typeof liveBookings)[number]
  compact?: boolean
}) {
  return (
    <div className={cn("grid grid-cols-[minmax(76px,110px)_1fr_auto] items-center gap-3 py-2", compact && "py-1.5")}>
      <div className="min-w-0">
        <p className="truncate text-[12px] font-medium text-[var(--md-ink)]">{booking.id}</p>
        <p className="truncate text-[11px] text-[var(--md-subtle)]">{booking.mode}</p>
      </div>
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2 text-[13px] text-[var(--md-ink)]">
          <span className="truncate">{booking.from}</span>
          <ArrowRight className="size-3 shrink-0 text-[var(--md-subtle)]" strokeWidth={1.2} />
          <span className="truncate">{booking.to}</span>
        </div>
        <Progress
          value={booking.progress}
          className="mt-2 h-1.5 rounded-full bg-[rgba(90,103,100,0.08)] [&>div]:bg-[var(--progress-color)]"
          style={{ "--progress-color": toneToVar(booking.tone) } as CSSProperties}
        />
      </div>
      <div className="text-right">
        <p className="text-[11px] text-[var(--md-subtle)]">ETA</p>
        <p className="text-[12px] font-medium text-[var(--md-ink)]">{booking.eta}</p>
        <p className="text-[11px] text-[var(--md-text)]">{booking.time}</p>
      </div>
    </div>
  )
}

export function LiveBookingsPanel() {
  return (
    <Surface className="md-live-bookings-panel flex min-h-[420px] flex-col overflow-hidden rounded-[var(--md-radius-xl)]" padding="none">
      <div className="md-live-bookings-header flex shrink-0 flex-col gap-3 px-5 py-4 md:flex-row md:items-start md:justify-between">
        <SectionHeader title="Live bookings" meta="23 in transit - 4 modes - updated 41s ago" />
        <div className="flex flex-wrap gap-2">
          {bookingModes.map((mode) => {
            const Icon = mode.icon
            return (
              <StatusPill key={mode.label} tone={mode.tone}>
                <span className="inline-flex items-center gap-1">
                  <Icon className="size-3" strokeWidth={1.2} />
                  {mode.label} {mode.count}
                </span>
              </StatusPill>
            )
          })}
        </div>
      </div>
      <Suspense fallback={<LiveBookingsMapFallback />}>
        <InteractiveBookingMap className="md-live-bookings-map min-h-[310px] flex-1" />
      </Suspense>
    </Surface>
  )
}

function LiveBookingsMapFallback() {
  return (
    <div className="relative min-h-[310px] flex-1 overflow-hidden bg-[var(--md-bg-strong)]">
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.22),rgba(255,255,255,0)_48%,rgba(14,125,116,0.12))]" />
      <div className="absolute left-5 top-5 flex items-center gap-2 rounded-[var(--md-radius-lg)] bg-white/58 px-3 py-2 text-[12px] font-medium text-[var(--md-text)] shadow-[var(--md-shadow-line)]">
        <span className="size-2 rounded-full bg-[var(--md-accent)]" />
        Loading live routes
      </div>
      <div className="absolute inset-x-[8%] top-[46%] h-px rotate-[-7deg] bg-[rgba(14,125,116,0.18)]" />
      <div className="absolute inset-x-[18%] top-[58%] h-px rotate-[9deg] bg-[rgba(14,125,116,0.12)]" />
      {[
        { left: "20%", top: "42%", width: "7rem" },
        { left: "46%", top: "34%", width: "8rem" },
        { right: "16%", top: "52%", width: "6rem" },
      ].map((pin) => (
        <div key={`${pin.left ?? pin.right}-${pin.top}`} className="absolute rounded-[var(--md-radius-lg)] bg-white/56 p-3 shadow-[var(--md-shadow-line)]" style={pin}>
          <div className="h-2 animate-pulse rounded-full bg-white/70" style={{ width: pin.width }} />
          <div className="mt-2 h-2 w-16 animate-pulse rounded-full bg-white/50" />
        </div>
      ))}
    </div>
  )
}

function getBriefIcon(label: string) {
  if (label.toLowerCase().includes("email") || label.toLowerCase().includes("repl")) return Mail
  if (label.toLowerCase().includes("quote")) return ReceiptText
  if (label.toLowerCase().includes("risk") || label.toLowerCase().includes("action")) return TriangleAlert
  return Ship
}

export function MorningDigestPanel({
  range,
  onOpenDrilldown,
}: {
  range: DashboardRange
  onOpenDrilldown?: (id: DashboardDrilldownId) => void
}) {
  const snapshot = getSnapshot(range)

  return (
    <Surface className="md-morning-digest-panel flex min-h-[320px] flex-col rounded-[var(--md-radius-xl)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-full bg-[var(--md-accent)] text-white">
            <Sparkles className="size-4" strokeWidth={1.2} />
          </span>
          <h2 className="text-[15px] font-medium text-[var(--md-ink)]">Today's action list</h2>
        </div>
        <span className="text-[12px] font-medium text-[var(--md-text)]">Outlook + jobs</span>
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          className="md-morning-digest-body min-h-0"
          key={range}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="mt-4 text-[14px] font-medium leading-5 text-[var(--md-ink)]">{snapshot.briefLead}</p>
          <AnimatedList
            items={snapshot.briefItems}
            maxHeight="none"
            displayScrollbar={false}
            fadeColor="rgba(255,255,255,0.96)"
            className="md-morning-digest-items mt-3 min-h-0 flex-1 rounded-[var(--md-radius-lg)]"
            listClassName="gap-2 p-1 pr-1"
            itemClassName="grid grid-cols-[30px_1fr_auto] items-start gap-3 bg-white/42 px-3 py-2.5 shadow-[var(--md-shadow-line)] hover:scale-[1.01] hover:bg-white/62 hover:shadow-[var(--md-shadow-soft)] focus-visible:bg-white/68 aria-selected:bg-white/68 aria-selected:shadow-[var(--md-shadow-soft)]"
            itemElement="button"
            selectionBehavior="click"
            ariaLabel="Today's action list"
            getItemKey={(item) => item.label}
            onItemSelect={(item) => onOpenDrilldown?.(makeDashboardDrilldownId("brief", item.label))}
            renderItem={(item) => {
              const Icon = getBriefIcon(item.label)

              return (
                <>
                  <span className="grid size-7 place-items-center rounded-[var(--md-radius-md)] bg-white/72 shadow-[var(--md-shadow-line)]">
                    <Icon className="size-3.5" strokeWidth={1.2} style={{ color: toneToVar(item.tone) }} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-[var(--md-ink)]">{item.label}</p>
                    <p className="mt-0.5 line-clamp-1 text-[12px] leading-5 text-[var(--md-text)]">{item.detail}</p>
                    <p className="mt-0.5 text-[11px] font-medium text-[var(--md-subtle)]">{item.source}</p>
                  </div>
                  <span className="rounded-[var(--md-radius-sm)] bg-white/58 px-2 py-1 text-[11px] font-medium shadow-[var(--md-shadow-line)]" style={{ color: toneToVar(item.tone) }}>{item.value}</span>
                </>
              )
            }}
          />
        </motion.div>
      </AnimatePresence>
      <Button variant="ghost" className="mt-3 h-9 justify-between rounded-[var(--md-radius-lg)] bg-white/45 px-3 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/70">
        Open daily briefing
        <ArrowRight data-icon="inline-end" strokeWidth={1.2} />
      </Button>
    </Surface>
  )
}

export function ActivityPanel({ onOpenDrilldown }: { onOpenDrilldown?: (id: DashboardDrilldownId) => void }) {
  return (
    <Surface className="md-activity-panel flex min-h-[320px] flex-col">
      <SectionHeader
        title="Activity"
        action={
          <ToggleGroup type="single" defaultValue="all" className="rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] p-0.5">
            {["all", "ai"].map((value) => (
              <ToggleGroupItem key={value} value={value} className="h-6 rounded-[var(--md-radius-sm)] px-2 text-[11px] uppercase data-[state=on]:bg-[var(--md-glass-strong)] data-[state=on]:shadow-[var(--md-shadow-line)]">
                {value}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        }
      />
      <AnimatedList
        items={activityItems}
        maxHeight="none"
        displayScrollbar={false}
        fadeColor="var(--md-surface)"
        className="md-activity-scroll mt-3 min-h-0 flex-1 rounded-[var(--md-radius-lg)]"
        listClassName="gap-2 p-1 pr-1"
        itemClassName="grid grid-cols-[28px_1fr_auto] gap-3 px-2 py-2 hover:scale-[1.01] hover:bg-white/52 hover:shadow-[var(--md-shadow-line)] focus-visible:bg-white/60 aria-selected:bg-white/60 aria-selected:shadow-[var(--md-shadow-line)]"
        itemElement="button"
        selectionBehavior="click"
        ariaLabel="Dashboard activity"
        getItemKey={(item) => item.title}
        onItemSelect={(item) => onOpenDrilldown?.(makeDashboardDrilldownId("activity", item.title))}
        renderItem={(item) => {
            const Icon = item.icon
            return (
              <>
                <div className="grid size-7 place-items-center rounded-[var(--md-radius-md)] bg-white shadow-[var(--md-shadow-line)]">
                  <Icon className="size-3.5" strokeWidth={1.2} style={{ color: toneToVar(item.tone) }} />
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] leading-5 text-[var(--md-ink)]">{item.title}</p>
                  <p className="text-[11px] text-[var(--md-subtle)]">{item.source}</p>
                </div>
                <span className="pt-1 text-[11px] text-[var(--md-subtle)]">{item.time}</span>
              </>
            )
        }}
      />
    </Surface>
  )
}

export function QueueRow({
  item,
  onSelect,
  layoutId,
}: {
  item: (typeof customsQueue)[number]
  onSelect?: () => void
  layoutId?: string
}) {
  return (
    <motion.tr layoutId={layoutId} layout="position" transition={{ layout: { duration: 0.24, ease: [0.22, 1, 0.36, 1] } }} className={cn("border-b border-[rgba(11,20,19,0.05)] transition-colors hover:bg-white/30", onSelect && "cursor-pointer")} onClick={onSelect}>
      <TableCell className="w-[110px] py-3 pl-0 text-[12px] font-medium text-[var(--md-ink)]">{item.id}</TableCell>
      <TableCell className="py-3 text-[13px] text-[var(--md-ink)]">{item.entry}</TableCell>
      <TableCell className="py-3 text-right">
        <StatusPill tone={item.tone}>{item.status}</StatusPill>
      </TableCell>
    </motion.tr>
  )
}

export function CustomsQueuePanel({ onOpenDrilldown }: { onOpenDrilldown?: (id: DashboardDrilldownId) => void }) {
  return (
    <Surface className="md-customs-queue-panel flex min-h-[260px] flex-col">
      <SectionHeader title="Customs queue" meta="11 in flight - 18 cleared in 24h" />
      <AnimatedList
        items={customsQueue}
        maxHeight="none"
        displayScrollbar={false}
        fadeColor="var(--md-surface)"
        className="md-customs-table mt-3 min-h-0 flex-1 rounded-[var(--md-radius-lg)]"
        listClassName="gap-2 p-1 pr-1"
        itemClassName="grid grid-cols-[86px_1fr_auto] items-center gap-3 bg-white/38 px-3 py-2.5 shadow-[var(--md-shadow-line)] hover:bg-white/58"
        itemElement="button"
        selectionBehavior="click"
        ariaLabel="Customs queue"
        getItemKey={(item) => item.id}
        onItemSelect={(item) => onOpenDrilldown?.(makeDashboardDrilldownId("customs", item.id))}
        renderItem={(item) => (
          <>
            <span className="text-[12px] font-medium text-[var(--md-ink)]">{item.id}</span>
            <span className="min-w-0 truncate text-[13px] text-[var(--md-ink)]">{item.entry}</span>
            <StatusPill tone={item.tone}>{item.status}</StatusPill>
          </>
        )}
      />
    </Surface>
  )
}
