import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react"
import { Globe } from "@/components/icons/hugeicons"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MultideckDatePicker, getDateKey } from "@/components/multideck/date-picker"
import { useLanguage } from "@/i18n/language-provider"
import { cn } from "@/lib/utils"

const STEP_MINUTES = 15
const DURATION_CHOICES = [15, 30, 45, 60] as const

export function safeTimeZone(timeZone: string | null | undefined) {
  try {
    if (timeZone) { new Intl.DateTimeFormat("en-GB", { timeZone }); return timeZone }
  } catch { /* An unknown zone falls back to the browser below. */ }
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/London"
}

function zoneOffsetMs(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(date)
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day), Number(map.hour) % 24, Number(map.minute), Number(map.second)) - date.getTime()
}

/** Splits an instant into the wall-clock date key and HH:MM in the given zone. */
export function zonedParts(iso: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(iso))
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return { dateKey: `${map.year}-${map.month}-${map.day}`, time: `${String(Number(map.hour) % 24).padStart(2, "0")}:${map.minute}` }
}

/** Turns a wall-clock date and HH:MM in a zone back into an ISO instant, DST-safe. */
export function zonedToIso(dateKey: string, time: string, timeZone: string) {
  const [year, month, day] = dateKey.split("-").map(Number)
  const [hour, minute] = time.split(":").map(Number)
  const guess = Date.UTC(year, month - 1, day, hour, minute)
  const first = zoneOffsetMs(new Date(guess), timeZone)
  let result = guess - first
  const second = zoneOffsetMs(new Date(result), timeZone)
  if (second !== first) result = guess - second
  return new Date(result).toISOString()
}

/** Accepts "9", "930", "9:30", "9.30", "9am", "2pm", "14:00" and returns HH:MM or null. */
export function parseTimeInput(value: string) {
  const match = value.trim().toLowerCase().replace(/\s+/g, "").match(/^(\d{1,2})(?:[:.h]?(\d{2}))?(am|pm|a|p)?$/)
  if (!match) return null
  let hour = Number(match[1])
  const minute = Number(match[2] ?? "0")
  const meridiem = match[3]
  if (meridiem) {
    if (hour < 1 || hour > 12) return null
    if (meridiem.startsWith("p") && hour !== 12) hour += 12
    if (meridiem.startsWith("a") && hour === 12) hour = 0
  }
  if (hour > 23 || minute > 59) return null
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}

export function formatDurationLabel(minutes: number) {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return `${hours} hr${hours > 1 ? "s" : ""}${rest ? ` ${rest} min` : ""}`
}

function minutesOf(time: string) {
  const [hour, minute] = time.split(":").map(Number)
  return hour * 60 + minute
}

function timeOf(minutes: number) {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, minutes))
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`
}

function useTimeFormatter(locale: string) {
  return useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" })
    return (time: string) => {
      const [hour, minute] = time.split(":").map(Number)
      return formatter.format(new Date(2026, 0, 1, hour, minute))
    }
  }, [locale])
}

function TimeField({ label, value, options, onChange, formatTime, className }: {
  label: string
  value: string
  options: Array<{ time: string; hint?: string }>
  onChange: (time: string) => void
  formatTime: (time: string) => string
  className?: string
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(() => formatTime(value))
  const [editing, setEditing] = useState(false)
  const anchorRef = useRef<HTMLDivElement | null>(null)
  const listRef = useRef<HTMLUListElement | null>(null)
  const [activeIndex, setActiveIndex] = useState(() => Math.max(0, options.findIndex((option) => option.time === value)))

  useEffect(() => { if (!editing) setDraft(formatTime(value)) }, [editing, formatTime, value])
  useEffect(() => {
    if (!open) return
    const index = Math.max(0, options.findIndex((option) => option.time >= value))
    setActiveIndex(index)
    const frame = window.requestAnimationFrame(() => listRef.current?.children[index]?.scrollIntoView({ block: "center" }))
    return () => window.cancelAnimationFrame(frame)
  }, [open, options, value])

  function commit(next: string) {
    const parsed = parseTimeInput(next)
    if (parsed) onChange(parsed)
    setDraft(formatTime(parsed ?? value))
    setEditing(false)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={(next) => { if (!next) setOpen(false) }}>
      <PopoverAnchor asChild>
        <div ref={anchorRef} className={cn("relative", className)}>
          <input
            id={id}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            role="combobox"
            aria-label={label}
            aria-expanded={open}
            aria-controls={`${id}-list`}
            aria-activedescendant={open ? `${id}-option-${activeIndex}` : undefined}
            dir="ltr"
            value={draft}
            className="premium-stroke-soft h-9 w-[92px] rounded-[var(--md-radius-lg)] bg-[var(--md-field-bg)] px-2.5 text-center text-[13px] font-medium tabular-nums text-[var(--md-ink)] outline-none transition-[background-color,box-shadow] duration-160 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[var(--md-field-bg-hover)] focus-visible:bg-[var(--md-field-bg-hover)] focus-visible:ring-3 focus-visible:ring-ring/50"
            onFocus={(event) => { setOpen(true); setEditing(true); event.currentTarget.select() }}
            onBlur={() => commit(draft)}
            onChange={(event) => { setDraft(event.target.value); setOpen(true) }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActiveIndex((index) => Math.min(options.length - 1, index + 1)); listRef.current?.children[Math.min(options.length - 1, activeIndex + 1)]?.scrollIntoView({ block: "nearest" }); return }
              if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((index) => Math.max(0, index - 1)); listRef.current?.children[Math.max(0, activeIndex - 1)]?.scrollIntoView({ block: "nearest" }); return }
              if (event.key === "Enter") { event.preventDefault(); if (open && parseTimeInput(draft) === null && options[activeIndex]) { onChange(options[activeIndex].time); setEditing(false); setOpen(false) } else commit(draft); return }
              if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); setOpen(false) }
            }}
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={6}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => { if (anchorRef.current?.contains(event.target as Node)) event.preventDefault() }}
        className="md-scrollbar z-[500] max-h-[min(264px,var(--radix-popover-content-available-height))] w-auto min-w-[160px] overflow-y-auto rounded-[var(--md-radius-xl)] border-0 bg-[color-mix(in_srgb,var(--md-surface)_96%,transparent)] p-1.5 shadow-[var(--md-shadow-lift)] backdrop-blur-xl"
      >
        <ul id={`${id}-list`} ref={listRef} role="listbox" aria-label={`${label} options`} className="grid gap-0.5">
          {options.map((option, index) => (
            <li
              key={option.time}
              id={`${id}-option-${index}`}
              role="option"
              aria-selected={option.time === value}
              className={cn("flex cursor-default items-center justify-between gap-3 rounded-[var(--md-radius-lg)] px-2.5 py-1.5 text-[12.5px] tabular-nums text-[var(--md-text)] transition-colors", index === activeIndex && "bg-[var(--md-accent-a10)] text-[var(--md-ink)]", option.time === value && "font-medium text-[var(--md-selected-text)]")}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => { onChange(option.time); setEditing(false); setOpen(false) }}
            >
              <span dir="ltr">{formatTime(option.time)}</span>
              {option.hint ? <span className="text-[11px] text-[var(--md-subtle)]">{option.hint}</span> : null}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

const ALL_DAY_OPTIONS = Array.from({ length: (24 * 60) / STEP_MINUTES }, (_, index) => ({ time: timeOf(index * STEP_MINUTES) }))

/**
 * A single on-brand time field ("09:00" in, "09:00" out) for forms that set
 * hours rather than a meeting instant, such as working hours and exceptions.
 * Accepts typed shorthand (9, 930, 2pm) and offers a 15-minute list; when a
 * `notBefore` time is given the list starts after it and hints the length.
 */
export function MeetingTimeField({ label, value, onChange, notBefore, className }: {
  label: string
  value: string
  onChange: (time: string) => void
  notBefore?: string
  className?: string
}) {
  const { language } = useLanguage()
  const formatTime = useTimeFormatter(language)
  const options = useMemo(() => {
    if (!notBefore) return ALL_DAY_OPTIONS
    const from = minutesOf(notBefore) + STEP_MINUTES
    const list: Array<{ time: string; hint: string }> = []
    for (let minutes = from; minutes < 24 * 60; minutes += STEP_MINUTES) list.push({ time: timeOf(minutes), hint: formatDurationLabel(minutes - minutesOf(notBefore)) })
    return list
  }, [notBefore])
  return <TimeField label={label} value={value} options={options} onChange={(time) => onChange(notBefore && minutesOf(time) <= minutesOf(notBefore) ? timeOf(minutesOf(notBefore) + STEP_MINUTES) : time)} formatTime={formatTime} className={className} />
}

/** The IANA zone picker shared by the meeting composer and availability settings. */
export function TimeZoneSelect({ value, onChange, variant = "chip", className, brandTheme }: {
  value: string
  onChange: (timeZone: string) => void
  variant?: "chip" | "field"
  className?: string
  brandTheme?: CSSProperties
}) {
  const zone = safeTimeZone(value)
  const zoneOptions = useMemo(() => {
    const supported = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : []
    return supported.includes(zone) ? supported : [zone, ...supported]
  }, [zone])
  return (
    <Select value={zone} onValueChange={onChange}>
      <SelectTrigger
        size={variant === "chip" ? "sm" : "default"}
        aria-label="Timezone"
        className={cn(
          variant === "chip"
            ? "h-6 gap-1 rounded-full border-0 bg-transparent px-2 text-[11px] text-[var(--md-subtle)] shadow-none hover:bg-[var(--md-surface-tint)] hover:text-[var(--md-ink)] data-[state=open]:shadow-none [&_svg]:size-3"
            : "h-10 w-full gap-2 rounded-[var(--md-radius-lg)] border-0 bg-[var(--md-field-bg)] px-3 text-[13px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-[var(--md-field-bg-hover)] sm:max-w-[320px]",
          brandTheme && "rounded-[var(--brand-control-radius)] text-[var(--brand-text)] hover:bg-[var(--brand-hover)] hover:text-[var(--brand-ink)] [&_[data-slot=select-trigger-icon]]:text-[var(--brand-accent)]!",
          className,
        )}
      >
        <Globe className={cn("shrink-0", variant === "chip" ? "size-3" : "size-3.5 text-[var(--md-subtle)]")} strokeWidth={1.5} aria-hidden="true" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent style={brandTheme} className={cn("z-[500] max-h-72 w-[280px]", brandTheme && "rounded-[var(--brand-control-radius)] bg-[var(--brand-surface)] text-[var(--brand-ink)]")}>
        {/* The dropdown's shared state styles are unlayered; explicit public
            overrides keep selection and focus inside this brand contract. */}
        {zoneOptions.map((option) => <SelectItem key={option} value={option} className={brandTheme ? "rounded-[max(0px,calc(var(--brand-control-radius)-4px))] text-[var(--brand-ink)]! data-[state=checked]:bg-[var(--brand-a14)]! data-highlighted:bg-[var(--brand-a20)]! data-[state=checked]:shadow-[inset_0_0_0_1px_var(--brand-line)]! data-highlighted:shadow-[inset_0_0_0_1px_var(--brand-line)]! [&_[data-slot=select-item-indicator]]:bg-[var(--brand-a14)]! [&_[data-slot=select-item-indicator]]:text-[var(--brand-ink)]!" : undefined}>{option.replace(/_/g, " ")}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

/**
 * One calm row for when a meeting happens: an on-brand date popover, typed or
 * picked start and finish times, quick duration chips and the timezone the times
 * are read in. Values stay ISO instants; the zone only changes how they display.
 */
export function MeetingTimePicker({ startAt, endAt, timeZone, onChange, onTimeZoneChange, minDate, className }: {
  startAt: string
  endAt: string
  timeZone: string
  onChange: (next: { startAt: string; endAt: string }) => void
  onTimeZoneChange?: (timeZone: string) => void
  minDate?: string
  className?: string
}) {
  const { language } = useLanguage()
  const zone = safeTimeZone(timeZone)
  const formatTime = useTimeFormatter(language)
  const start = zonedParts(startAt, zone)
  const end = zonedParts(endAt, zone)
  const durationMinutes = Math.max(STEP_MINUTES, Math.round((Date.parse(endAt) - Date.parse(startAt)) / 60_000))
  const sameDay = start.dateKey === end.dateKey

  const endOptions = useMemo(() => {
    const from = minutesOf(start.time) + STEP_MINUTES
    const list: Array<{ time: string; hint: string }> = []
    for (let minutes = from; minutes < 24 * 60; minutes += STEP_MINUTES) list.push({ time: timeOf(minutes), hint: formatDurationLabel(minutes - minutesOf(start.time)) })
    return list
  }, [start.time])

  function setStart(dateKey: string, time: string) {
    const nextStart = zonedToIso(dateKey, time, zone)
    onChange({ startAt: nextStart, endAt: new Date(Date.parse(nextStart) + durationMinutes * 60_000).toISOString() })
  }

  function setEnd(time: string) {
    let nextEnd = zonedToIso(start.dateKey, time, zone)
    if (Date.parse(nextEnd) <= Date.parse(startAt)) nextEnd = new Date(Date.parse(startAt) + STEP_MINUTES * 60_000).toISOString()
    onChange({ startAt, endAt: nextEnd })
  }

  return (
    <div className={cn("grid gap-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <MultideckDatePicker
          value={start.dateKey}
          onChange={(dateKey) => { if (dateKey) setStart(dateKey, start.time) }}
          title="Meeting date"
          minDate={minDate ?? getDateKey(new Date())}
          compact
          closeOnSelect
          triggerClassName="h-9 w-auto min-w-[168px] rounded-[var(--md-radius-lg)] px-2.5 text-[13px]"
          popoverClassName="w-[min(92vw,320px)]"
        />
        <TimeField label="Starts" value={start.time} options={ALL_DAY_OPTIONS} onChange={(time) => setStart(start.dateKey, time)} formatTime={formatTime} />
        <span className="text-[12px] text-[var(--md-subtle)]" aria-hidden="true">–</span>
        <TimeField label="Finishes" value={end.time} options={endOptions} onChange={setEnd} formatTime={formatTime} />
        <span className="text-[11.5px] tabular-nums text-[var(--md-subtle)]">{sameDay ? formatDurationLabel(durationMinutes) : `Ends ${new Intl.DateTimeFormat(language, { day: "numeric", month: "short", timeZone: zone }).format(new Date(endAt))}`}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <div className="flex items-center gap-1" role="group" aria-label="Meeting length">
          {DURATION_CHOICES.map((minutes) => (
            <button
              key={minutes}
              type="button"
              aria-pressed={durationMinutes === minutes}
              onClick={() => onChange({ startAt, endAt: new Date(Date.parse(startAt) + minutes * 60_000).toISOString() })}
              className={cn("h-6 rounded-full px-2 text-[11px] font-medium text-[var(--md-subtle)] transition-[background-color,color,scale] duration-150 hover:bg-[var(--md-surface-tint)] hover:text-[var(--md-ink)] active:scale-[0.96]", durationMinutes === minutes && "bg-[var(--md-accent-a10)] text-[var(--md-selected-text)]")}
            >
              {formatDurationLabel(minutes)}
            </button>
          ))}
        </div>
        {onTimeZoneChange ? (
          <TimeZoneSelect value={zone} onChange={onTimeZoneChange} />
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] text-[var(--md-subtle)]"><Globe className="size-3" strokeWidth={1.5} aria-hidden="true" />{zone.replace(/_/g, " ")}</span>
        )}
      </div>
    </div>
  )
}
