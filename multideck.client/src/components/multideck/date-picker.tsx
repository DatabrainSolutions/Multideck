import { useEffect, useState } from "react"
import { ArrowLeft, ArrowRight, CalendarDays, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useLanguage } from "@/i18n/language-provider"
import type { LanguageCode } from "@/i18n/languages"
import { cn } from "@/lib/utils"

export type MultideckDateRange = {
  start: string | null
  end: string | null
}

function getLanguageLocale(language: LanguageCode) {
  if (language === "de") return "de-DE"
  if (language === "fr") return "fr-FR"
  if (language === "ar") return "ar-GB-u-ca-gregory"
  return language
}

export function getDateKey(date: Date) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, "0")
  const day = `${date.getDate()}`.padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function parseDateKey(dateKey?: string | null) {
  if (!dateKey) return null
  const [year, month, day] = dateKey.split("-").map(Number)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
}

export function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

export function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1)
}

export function getDefaultDateRange(daySpan = 6): MultideckDateRange {
  const end = new Date()
  const start = new Date(end)
  start.setDate(end.getDate() - daySpan)
  return { start: getDateKey(start), end: getDateKey(end) }
}

export function normalizeDateRange(start: string, end: string): MultideckDateRange {
  return start <= end ? { start, end } : { start: end, end: start }
}

function getPreviewRange(start: string | null, end: string | null, hover: string | null) {
  if (!start) return null
  if (end) return normalizeDateRange(start, end)
  if (hover) return normalizeDateRange(start, hover)
  return { start, end: start }
}

function isDateInsideRange(dateKey: string, range: MultideckDateRange | null) {
  return Boolean(range?.start && range.end && dateKey >= range.start && dateKey <= range.end)
}

export function formatDateLabel(dateKey: string | null | undefined, locale: string, includeYear = true) {
  const date = parseDateKey(dateKey)
  if (!date) return ""

  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    ...(includeYear ? { year: "numeric" } : {}),
  }).format(date)
}

export function formatDateRangeLabel(range: MultideckDateRange, locale: string, fallback = "Select dates", selectStartLabel = "Select start", selectEndLabel = "Select end") {
  const start = parseDateKey(range.start)
  const end = parseDateKey(range.end)
  if (!start && !end) return fallback
  if (start && !end) return `${formatDateLabel(range.start, locale)} - ${selectEndLabel}`
  if (!start && end) return `${selectStartLabel} - ${formatDateLabel(range.end, locale)}`

  if (range.start === range.end) return formatDateLabel(range.start, locale)

  if (start && end && start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
    const dayFormatter = new Intl.DateTimeFormat(locale, { day: "numeric" })
    const monthYearFormatter = new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" })
    return `${dayFormatter.format(start)}-${dayFormatter.format(end)} ${monthYearFormatter.format(end)}`
  }

  const sameYear = start?.getFullYear() === end?.getFullYear()
  return `${formatDateLabel(range.start, locale, !sameYear)} - ${formatDateLabel(range.end, locale)}`
}

function CalendarMonth({
  month,
  range,
  previewRange,
  locale,
  onSelectDate,
  onPreviewDate,
}: {
  month: Date
  range: MultideckDateRange
  previewRange: MultideckDateRange | null
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
          const isStart = range.start === dateKey
          const isEnd = range.end === dateKey
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
                "grid size-9 place-items-center rounded-[10px] text-[13px] font-medium text-[var(--md-text)] transition-[background-color,box-shadow,color,opacity,scale,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.96] hover:bg-white/78 hover:text-[var(--md-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(14,125,116,0.18)]",
                isToday && "shadow-[inset_0_0_0_1px_rgba(14,125,116,0.22)]",
                isInPreview && "bg-[rgba(14,125,116,0.1)] text-[var(--md-ink)]",
                (isStart || isEnd) && "scale-[1.03] bg-[var(--md-accent)] text-white shadow-[0_0_0_3px_rgba(14,125,116,0.14),var(--md-shadow-line)] hover:bg-[var(--md-accent)] hover:text-white",
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

export function MultideckDateRangePicker({
  value,
  onChange,
  placeholder = "Select dates",
  triggerLabel,
  title = "Date range",
  description = "Pick a start date, then an end date.",
  startLabel = "Start",
  endLabel = "End",
  footerLabel = "Selected dates",
  align = "start",
  active,
  disabled,
  missing,
  allowClear = false,
  className,
  triggerClassName,
  popoverClassName,
  onOpenChange,
}: {
  value: MultideckDateRange
  onChange: (range: MultideckDateRange) => void
  placeholder?: string
  triggerLabel?: string
  title?: string
  description?: string
  startLabel?: string
  endLabel?: string
  footerLabel?: string
  align?: "start" | "center" | "end"
  active?: boolean
  disabled?: boolean
  missing?: boolean
  allowClear?: boolean
  className?: string
  triggerClassName?: string
  popoverClassName?: string
  onOpenChange?: (open: boolean) => void
}) {
  const { language, t } = useLanguage()
  const locale = getLanguageLocale(language)
  const [open, setOpen] = useState(false)
  const resolvedRange = { start: value.start || null, end: value.end || null }
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(parseDateKey(resolvedRange.start) ?? new Date()))
  const [hoveredDate, setHoveredDate] = useState<string | null>(null)
  const previewRange = getPreviewRange(resolvedRange.start, resolvedRange.end, hoveredDate)
  const hasAnyDate = Boolean(resolvedRange.start || resolvedRange.end)
  const hasCompleteRange = Boolean(parseDateKey(resolvedRange.start) && parseDateKey(resolvedRange.end))
  const waitingForEndDate = Boolean(resolvedRange.start && !resolvedRange.end)
  const rangeLabel = formatDateRangeLabel(resolvedRange, locale, t(placeholder), t("Select start"), t("Select end"))
  const triggerText = triggerLabel ?? rangeLabel

  useEffect(() => {
    if (!open) return
    setVisibleMonth(startOfMonth(parseDateKey(resolvedRange.start) ?? new Date()))
  }, [open, resolvedRange.start])

  function updateOpen(nextOpen: boolean) {
    setOpen(nextOpen)
    onOpenChange?.(nextOpen)
  }

  function selectDate(dateKey: string) {
    if (!resolvedRange.start || resolvedRange.end) {
      onChange({ start: dateKey, end: null })
      return
    }

    onChange(normalizeDateRange(resolvedRange.start, dateKey))
    setHoveredDate(null)
  }

  function resetRange() {
    const nextRange = getDefaultDateRange()
    onChange(nextRange)
    setVisibleMonth(startOfMonth(parseDateKey(nextRange.start) ?? new Date()))
  }

  function clearRange() {
    onChange({ start: null, end: null })
    setHoveredDate(null)
  }

  return (
    <Popover open={open} onOpenChange={updateOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          disabled={disabled}
          aria-invalid={missing || undefined}
          className={cn(
            "h-11 w-full min-w-0 justify-between gap-3 rounded-[var(--md-radius-lg)] bg-[#F4F9F7] px-3 text-[13px] font-medium text-[var(--md-ink)] shadow-[inset_0_0_0_1px_rgba(14,125,116,0.15),0_1px_1px_rgba(14,125,116,0.04)] transition-[background-color,box-shadow,color,opacity,scale,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-white/78 hover:shadow-[inset_0_0_0_1px_rgba(14,125,116,0.24),0_2px_8px_rgba(14,125,116,0.06)] focus-visible:ring-[rgba(14,125,116,0.18)]",
            active && "bg-[var(--md-glass-strong)]",
            missing && "ring-1 ring-[rgba(192,57,43,0.78)] shadow-[var(--md-shadow-line),0_0_0_4px_rgba(192,57,43,0.12),0_0_18px_rgba(192,57,43,0.16)]",
            triggerClassName,
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            <CalendarDays data-icon="inline-start" className="size-4 shrink-0 text-[var(--md-accent)]" strokeWidth={1.25} />
            <span className={cn("truncate", !hasAnyDate && "text-[var(--md-subtle)]")} dir={hasAnyDate && !triggerLabel ? "ltr" : undefined}>
              {triggerText}
            </span>
          </span>
          {allowClear && hasAnyDate ? (
            <span
              role="button"
              tabIndex={-1}
              aria-label={t("Clear dates")}
              className="grid size-6 shrink-0 place-items-center rounded-[var(--md-radius-sm)] text-[var(--md-subtle)] transition-colors hover:bg-white/70 hover:text-[var(--md-red)]"
              onPointerDown={(event) => {
                event.preventDefault()
                event.stopPropagation()
                clearRange()
              }}
            >
              <X className="size-3.5" strokeWidth={1.5} />
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        className={cn(
          "z-[500] w-[min(92vw,590px)] rounded-[var(--md-radius-xl)] border-0 bg-[rgba(251,253,253,0.98)] p-3 text-[var(--md-ink)] shadow-[var(--md-shadow-lift)]",
          className,
          popoverClassName,
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[14px] font-medium text-[var(--md-ink)]">{t(title)}</p>
            <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{t(description)}</p>
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
              range={resolvedRange}
              previewRange={previewRange}
              locale={locale}
              onSelectDate={selectDate}
              onPreviewDate={(dateKey) => setHoveredDate(waitingForEndDate ? dateKey : null)}
            />
          ))}
        </div>
        <div className="mt-4 flex flex-col gap-3 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] p-3 shadow-[var(--md-shadow-line)] sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 text-[12px] leading-5 text-[var(--md-text)]">
            <span className="font-medium text-[var(--md-ink)]">{t(footerLabel)}</span>
            <span className="ms-2 inline-block" dir={hasAnyDate ? "ltr" : undefined}>
              {rangeLabel}
            </span>
            <span className="mt-1 block text-[11px] text-[var(--md-subtle)]" dir="ltr">
              {t(startLabel)}: {formatDateLabel(resolvedRange.start, locale) || "-"} · {t(endLabel)}: {formatDateLabel(resolvedRange.end, locale) || "-"}
            </span>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button type="button" variant="ghost" className="h-8 rounded-[var(--md-radius-md)] bg-white/45 px-3 text-[12px] font-medium text-[var(--md-text)] shadow-[var(--md-shadow-line)] hover:bg-white/70" onClick={resetRange}>
              {t("Reset")}
            </Button>
            <Button type="button" className="h-8 rounded-[var(--md-radius-md)] bg-[var(--md-accent)] px-3 text-[12px] font-medium text-white hover:bg-[var(--md-accent)]/88" disabled={!resolvedRange.start} onClick={() => setOpen(false)}>
              {t(hasCompleteRange ? "Apply dates" : "Apply start")}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function MultideckDatePicker({
  value,
  onChange,
  placeholder = "Select date",
  title = "Select date",
  description = "Pick a date.",
  align = "start",
  disabled,
  missing,
  className,
}: {
  value: string | null
  onChange: (date: string | null) => void
  placeholder?: string
  title?: string
  description?: string
  align?: "start" | "center" | "end"
  disabled?: boolean
  missing?: boolean
  className?: string
}) {
  return (
    <MultideckDateRangePicker
      value={{ start: value, end: value }}
      onChange={(range) => onChange(range.start)}
      placeholder={placeholder}
      title={title}
      description={description}
      startLabel="Date"
      endLabel="Date"
      footerLabel="Selected date"
      align={align}
      disabled={disabled}
      missing={missing}
      className={className}
    />
  )
}
