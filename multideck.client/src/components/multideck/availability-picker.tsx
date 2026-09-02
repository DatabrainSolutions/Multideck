import { useEffect, useMemo, useRef, useState } from "react"
import { CalendarDays, ChevronLeft, ChevronRight } from "@/components/icons/hugeicons"
import { addMonths, getDateKey, startOfMonth } from "@/components/multideck/date-picker"
import { DotGridLoader } from "@/components/multideck/dot-grid-loader"
import { TimeZoneSelect, safeTimeZone } from "@/components/multideck/meeting-time-picker"
import { useLanguage } from "@/i18n/language-provider"
import { cn } from "@/lib/utils"

/** Times split into the three parts of a day people actually plan around. */
const dayParts = [
  { id: "morning", label: "Morning", untilHour: 12 },
  { id: "afternoon", label: "Afternoon", untilHour: 17 },
  { id: "evening", label: "Evening", untilHour: 24 },
] as const

function monthOfKey(dateKey: string) {
  const [year, month] = dateKey.split("-").map(Number)
  return new Date(year, month - 1, 1)
}

function shiftKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number)
  return getDateKey(new Date(year, month - 1, day + days))
}

/**
 * The one availability surface: a month of days that actually have free time,
 * beside the times inside the chosen day.
 *
 * It never calculates availability. Pass only starts the server has already
 * confirmed are free; the picker owns the month, the day, the parts of the day,
 * the timezone the times are read in, and the loading, empty and selected
 * states. Days with nothing free are visible but unselectable, so a person can
 * see the shape of the week rather than guessing which dates exist.
 */
export function AvailabilityPicker({
  slots,
  selected,
  onSelect,
  timeZone,
  onTimeZoneChange,
  loading = false,
  busy = false,
  monthsAhead = 12,
  onVisibleMonthChange,
  emptyTitle = "No available times",
  emptyHint = "Existing meetings, active holds and connected-calendar busy time are already accounted for. Try again later or contact the organiser.",
  className,
}: {
  /** Server-checked free starts, as ISO instants. */
  slots: string[]
  selected: string | null
  onSelect: (slot: string) => void
  /** The zone the times are read in. Slots stay instants; this only formats. */
  timeZone: string
  onTimeZoneChange?: (timeZone: string) => void
  loading?: boolean
  /** A refresh behind an already-drawn month, so the times dim instead of clearing. */
  busy?: boolean
  monthsAhead?: number
  /** Fired when the visitor walks to a month, so the page can widen its fetch. */
  onVisibleMonthChange?: (month: Date) => void
  emptyTitle?: string
  emptyHint?: string
  className?: string
}) {
  const { language } = useLanguage()
  const zone = safeTimeZone(timeZone)
  const [visibleMonth, setVisibleMonth] = useState<Date | null>(null)
  const [activeDay, setActiveDay] = useState<string | null>(null)
  const [pendingFocus, setPendingFocus] = useState<string | null>(null)
  const dayRefs = useRef(new Map<string, HTMLButtonElement | null>())
  const slotRefs = useRef<Array<HTMLButtonElement | null>>([])
  const timesScroller = useRef<HTMLDivElement | null>(null)
  const [moreBelow, setMoreBelow] = useState(false)

  const dayKeyFormatter = useMemo(() => new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }), [zone])
  const timeFormatter = useMemo(() => new Intl.DateTimeFormat(language, { timeZone: zone, hour: "2-digit", minute: "2-digit" }), [language, zone])
  const hourFormatter = useMemo(() => new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", hourCycle: "h23" }), [zone])

  const byDay = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const slot of [...slots].sort()) {
      const key = dayKeyFormatter.format(new Date(slot))
      const existing = map.get(key)
      if (existing) existing.push(slot)
      else map.set(key, [slot])
    }
    return map
  }, [dayKeyFormatter, slots])

  const availableDays = useMemo(() => [...byDay.keys()].sort(), [byDay])
  const todayKey = dayKeyFormatter.format(new Date())
  const selectedDay = selected ? dayKeyFormatter.format(new Date(selected)) : null

  const firstMonth = startOfMonth(monthOfKey(todayKey))
  const lastMonth = addMonths(firstMonth, monthsAhead)
  const month = visibleMonth ?? startOfMonth(monthOfKey(selectedDay ?? availableDays[0] ?? todayKey))
  const monthPrefix = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`
  const inMonth = (dateKey: string) => dateKey.startsWith(monthPrefix)

  const openDay = [selectedDay, activeDay].find((key) => key && inMonth(key) && byDay.has(key))
    ?? availableDays.find(inMonth)
    ?? null
  const daySlots = openDay ? byDay.get(openDay) ?? [] : []
  const groupedSlots = useMemo(() => dayParts.map((part, index) => ({
    id: part.id,
    label: part.label,
    slots: daySlots.filter((slot) => {
      const hour = Number(hourFormatter.format(new Date(slot)))
      return hour < part.untilHour && (index === 0 || hour >= dayParts[index - 1].untilHour)
    }),
  })).filter((group) => group.slots.length), [daySlots, hourFormatter])
  const nextAvailable = availableDays.find((key) => key > `${monthPrefix}-31`) ?? [...availableDays].reverse().find((key) => key < monthPrefix)

  useEffect(() => {
    if (!pendingFocus) return
    dayRefs.current.get(pendingFocus)?.focus()
    setPendingFocus(null)
  }, [pendingFocus])

  // The times list scrolls, so the last visible row is usually cut. The fade
  // says there is more below and disappears once the list is read to the end.
  useEffect(() => {
    const node = timesScroller.current
    if (!node) return
    const update = () => setMoreBelow(node.scrollHeight - node.clientHeight - node.scrollTop > 8)
    update()
    node.addEventListener("scroll", update, { passive: true })
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => { node.removeEventListener("scroll", update); observer.disconnect() }
  }, [groupedSlots, openDay])

  function goToMonth(next: Date, focusKey?: string) {
    if (next < firstMonth || next > lastMonth) return
    setVisibleMonth(next)
    setActiveDay(null)
    if (focusKey) setPendingFocus(focusKey)
    onVisibleMonthChange?.(next)
  }

  function moveDayFocus(fromKey: string, days: number) {
    const target = shiftKey(fromKey, days)
    if (target < todayKey) return
    if (!target.startsWith(monthPrefix)) { goToMonth(startOfMonth(monthOfKey(target)), target); return }
    dayRefs.current.get(target)?.focus()
  }

  function moveSlotFocus(index: number, step: number) {
    slotRefs.current[Math.max(0, Math.min(index + step, daySlots.length - 1))]?.focus()
  }

  const monthLabel = new Intl.DateTimeFormat(language, { month: "long", year: "numeric" }).format(month)
  const weekdayLabels = Array.from({ length: 7 }, (_, index) => new Intl.DateTimeFormat(language, { weekday: "short" }).format(new Date(2026, 5, 8 + index)))
  const monthStartWeekday = (new Date(month.getFullYear(), month.getMonth(), 1).getDay() + 6) % 7
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const cells = Array.from({ length: monthStartWeekday + daysInMonth }, (_, index) => (index < monthStartWeekday ? null : getDateKey(new Date(month.getFullYear(), month.getMonth(), index - monthStartWeekday + 1))))

  // One cell in the grid is always reachable by Tab, even in a month with
  // nothing free, so the keyboard can still walk out of it.
  const tabbableDay = openDay ?? (inMonth(todayKey) ? todayKey : cells.find(Boolean) ?? null)

  if (loading) return <div className={cn("grid min-h-[300px] place-items-center rounded-[var(--md-radius-xl)] bg-[var(--brand-tint,var(--md-surface-tint))]", className)}><DotGridLoader label="Finding genuinely free times…" /></div>

  if (!availableDays.length) {
    return <div className={cn("grid min-h-[300px] place-items-center rounded-[var(--md-radius-xl)] bg-[var(--brand-tint,var(--md-surface-tint))] px-6 text-center", className)}>
      <div className="max-w-[320px]">
        <CalendarDays className="mx-auto size-5 text-[var(--brand-subtle,var(--md-subtle))]" strokeWidth={1.3} />
        <p className="mt-3 text-[13px] font-medium text-[var(--brand-ink,var(--md-ink))]">{emptyTitle}</p>
        <p className="mt-1.5 text-[11.5px] leading-5 text-[var(--brand-subtle,var(--md-subtle))]">{emptyHint}</p>
      </div>
    </div>
  }

  return <div className={cn("grid gap-5 sm:grid-cols-[minmax(0,272px)_minmax(0,1fr)] sm:gap-6", className)}>
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-[var(--brand-ink,var(--md-ink))]">{monthLabel}</p>
        <div className="flex items-center gap-0.5">
          <button type="button" aria-label="Previous month" disabled={month <= firstMonth} onClick={() => goToMonth(addMonths(month, -1))} className="grid size-7 place-items-center rounded-[8px] text-[var(--brand-text,var(--md-text))] transition-[background-color,color,opacity] hover:bg-[var(--brand-hover,var(--md-hover))] hover:text-[var(--brand-ink,var(--md-ink))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-a28,var(--md-accent-a28))] disabled:pointer-events-none disabled:opacity-30"><ChevronLeft className="size-4" strokeWidth={1.5} /></button>
          <button type="button" aria-label="Next month" disabled={month >= lastMonth} onClick={() => goToMonth(addMonths(month, 1))} className="grid size-7 place-items-center rounded-[8px] text-[var(--brand-text,var(--md-text))] transition-[background-color,color,opacity] hover:bg-[var(--brand-hover,var(--md-hover))] hover:text-[var(--brand-ink,var(--md-ink))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-a28,var(--md-accent-a28))] disabled:pointer-events-none disabled:opacity-30"><ChevronRight className="size-4" strokeWidth={1.5} /></button>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[10.5px] font-medium text-[var(--brand-subtle,var(--md-subtle))]">
        {weekdayLabels.map((label) => <span key={label} className="grid h-6 place-items-center">{label}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((dateKey, index) => {
          if (!dateKey) return <span key={`lead-${index}`} className="size-9" aria-hidden="true" />
          const free = byDay.has(dateKey)
          const isOpen = openDay === dateKey
          const isSelectedDay = selectedDay === dateKey
          return <button
            key={dateKey}
            ref={(element) => { dayRefs.current.set(dateKey, element) }}
            type="button"
            dir="ltr"
            aria-disabled={!free || undefined}
            aria-pressed={isOpen}
            aria-label={`${new Intl.DateTimeFormat(language, { dateStyle: "full" }).format(new Date(`${dateKey}T12:00:00`))}${free ? `, ${byDay.get(dateKey)?.length} times available` : ", no times available"}`}
            tabIndex={dateKey === tabbableDay ? 0 : -1}
            onClick={() => { if (free) setActiveDay(dateKey) }}
            onKeyDown={(event) => {
              const step = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" ? -7 : event.key === "ArrowDown" ? 7 : 0
              if (!step) return
              event.preventDefault()
              moveDayFocus(dateKey, step)
            }}
            className={cn(
              "relative grid size-9 place-items-center rounded-[10px] text-[12.5px] font-medium transition-[background-color,box-shadow,color,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-a28,var(--md-accent-a28))]",
              free
                ? "bg-[var(--brand-a08,var(--md-accent-a08))] text-[var(--brand-ink,var(--md-ink))] hover:bg-[var(--brand-a16,var(--md-accent-a16))] active:scale-[0.96] motion-reduce:active:scale-100"
                : "cursor-default text-[var(--brand-subtle,var(--md-subtle))] opacity-45",
              dateKey === todayKey && !isSelectedDay && "shadow-[inset_0_0_0_1px_var(--brand-a28,var(--md-accent-a28))]",
              isOpen && !isSelectedDay && "bg-[var(--brand-a20,var(--md-accent-a20))] shadow-[inset_0_0_0_1px_var(--brand-a38,var(--md-accent-a38))]",
              isSelectedDay && "bg-[var(--brand-accent,var(--md-accent))] text-[var(--brand-accent-ink,var(--md-accent-ink))] shadow-[0_0_0_3px_var(--brand-a14,var(--md-accent-a14))] hover:bg-[var(--brand-accent,var(--md-accent))]",
            )}
          >{Number(dateKey.slice(-2))}</button>
        })}
      </div>
    </div>

    <div className="flex min-w-0 flex-col">
      {openDay ? <>
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[13px] font-medium text-[var(--brand-ink,var(--md-ink))]">{new Intl.DateTimeFormat(language, { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${openDay}T12:00:00`))}</p>
          <span className="text-[11px] tabular-nums text-[var(--brand-subtle,var(--md-subtle))]">{daySlots.length} {daySlots.length === 1 ? "time" : "times"}</span>
        </div>
        <div className="relative mt-3">
        <div ref={timesScroller} className={cn("md-scrollbar grid grid-cols-3 gap-1.5 transition-opacity sm:max-h-[268px] sm:grid-cols-2 sm:overflow-y-auto sm:pe-1", busy && "pointer-events-none opacity-45")} role="radiogroup" aria-label="Available times" aria-busy={busy || undefined}>
          {groupedSlots.map((group, groupIndex) => <div key={group.id} className="contents">
            {groupedSlots.length > 1 ? <p className={cn("col-span-full text-[10px] font-medium uppercase tracking-[.07em] text-[var(--brand-subtle,var(--md-subtle))]", groupIndex && "pt-2")}>{group.label}</p> : null}
            {group.slots.map((slot) => {
              const index = daySlots.indexOf(slot)
              const isSelected = selected === slot
              return <button
                key={slot}
                ref={(element) => { slotRefs.current[index] = element }}
                type="button"
                role="radio"
                aria-checked={isSelected}
                tabIndex={isSelected || (!selected && index === 0) ? 0 : -1}
                onClick={() => onSelect(slot)}
                onKeyDown={(event) => {
                  const step = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 0
                  if (!step) return
                  event.preventDefault()
                  moveSlotFocus(index, step)
                }}
                className={cn(
                  "inline-flex h-9 items-center justify-center rounded-[10px] bg-[var(--brand-surface,var(--md-surface))] text-[12.5px] font-medium tabular-nums text-[var(--brand-ink,var(--md-ink))] shadow-[inset_0_0_0_1px_var(--brand-line,var(--md-line))] transition-[background-color,box-shadow,color,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[var(--brand-a08,var(--md-accent-a08))] hover:shadow-[inset_0_0_0_1px_var(--brand-a38,var(--md-accent-a38))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-a28,var(--md-accent-a28))] active:scale-[0.97] motion-reduce:active:scale-100",
                  isSelected && "bg-[var(--brand-accent,var(--md-accent))] text-[var(--brand-accent-ink,var(--md-accent-ink))] shadow-[0_0_0_3px_var(--brand-a14,var(--md-accent-a14))] hover:bg-[var(--brand-accent,var(--md-accent))]",
                )}
              >{timeFormatter.format(new Date(slot))}</button>
            })}
          </div>)}
        </div>
        {moreBelow ? <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-9 bg-gradient-to-t from-[var(--brand-surface,var(--md-surface))] to-transparent" /> : null}
        </div>
      </> : <div className="grid flex-1 place-items-center rounded-[var(--md-radius-lg)] bg-[var(--brand-tint,var(--md-surface-tint))] px-4 py-8 text-center">
        <div>
          <p className="text-[12.5px] font-medium text-[var(--brand-ink,var(--md-ink))]">Nothing free in {new Intl.DateTimeFormat(language, { month: "long" }).format(month)}</p>
          {nextAvailable ? <button type="button" onClick={() => goToMonth(startOfMonth(monthOfKey(nextAvailable)))} className="mt-2 text-[11.5px] font-medium text-[var(--brand-accent,var(--md-accent))] underline-offset-2 hover:underline">Nearest free day is {new Intl.DateTimeFormat(language, { weekday: "short", day: "numeric", month: "long" }).format(new Date(`${nextAvailable}T12:00:00`))}</button> : null}
        </div>
      </div>}
      <div className="mt-3 flex items-center gap-1 border-t border-[var(--brand-line,var(--md-line))] pt-2.5 text-[11px] text-[var(--brand-subtle,var(--md-subtle))]">
        {onTimeZoneChange
          ? <TimeZoneSelect value={zone} onChange={onTimeZoneChange} />
          : <span className="px-1">{zone.replace(/_/g, " ")}</span>}
      </div>
    </div>
  </div>
}
