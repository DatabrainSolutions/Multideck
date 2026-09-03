import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType, type PointerEvent as ReactPointerEvent } from "react"
import { CalendarClock, CalendarDays, ChevronLeft, ChevronRight, Clock3, Link2 } from "@/components/icons/hugeicons"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { SegmentedControl } from "@/components/multideck/workflow-components"
import { MultiSelectMenu } from "@/components/multideck/multi-select-menu"
import { meetingColourStyle } from "@/components/multideck/meeting-colour-picker"
import { MeetingProviderMark } from "@/components/multideck/meeting-provider-mark"
import { MeetingResponseSummary } from "@/components/multideck/meeting-attendee-status"
import { addCalendarDays, calendarDateKey, calendarPeriodDates, calendarTimePartsAtMinutes, formatCalendarPeriodLabel, moveCalendarPeriod, type CalendarPeriodView } from "@/components/multideck/calendar-period-core"
import { zonedToIso } from "@/components/multideck/meeting-time-picker"
import { useCalendarDayDrag, useCalendarEventDrag, type CalendarDragMode } from "@/lib/calendar-drag"
import { useCalendarCreateDrag } from "@/lib/calendar-create-drag"
import type { CalendarEvent, CalendarRibbon } from "@/lib/calendar-api"
import { useLanguage } from "@/i18n/language-provider"
import { cn } from "@/lib/utils"

type CalendarViewMode = CalendarPeriodView
const viewModes: CalendarViewMode[] = ["Week", "Month"]

/** The full day is reachable; open at working hours without hiding earlier events. */
const GRID_START_HOUR = 0
const GRID_END_HOUR = 24
const INITIAL_VIEW_HOUR = 7
const HOUR_HEIGHT = 60
const GRID_HEIGHT = (GRID_END_HOUR - GRID_START_HOUR) * HOUR_HEIGHT
const HOUR_GUTTER = 56

function instantAtGridMinutes(dateKey: string, minutes: number, timeZone: string) {
  const parts = calendarTimePartsAtMinutes(dateKey, minutes)
  return zonedToIso(parts.dateKey, parts.time, timeZone)
}

function CalendarUtilityAction({ label, icon: Icon, onClick }: { label: string; icon: ComponentType<{ className?: string; strokeWidth?: number; "aria-hidden"?: boolean | "true" | "false" }>; onClick: () => void }) {
  return <Tooltip>
    <TooltipTrigger asChild>
      <Button type="button" variant="ghost" size="icon" aria-label={label} onClick={onClick} className="size-8 rounded-full text-[var(--md-text)] transition-[background-color,box-shadow,color,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[var(--md-surface)] hover:text-[var(--md-ink)] hover:shadow-[var(--md-shadow-line)] active:scale-[0.96] motion-reduce:transform-none">
        <Icon className="size-4" strokeWidth={1.4} aria-hidden="true" />
      </Button>
    </TooltipTrigger>
    <TooltipContent side="bottom" sideOffset={8}>{label}</TooltipContent>
  </Tooltip>
}

function dateKeyForZone(value: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value))
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${map.year}-${map.month}-${map.day}`
}

function timeParts(value: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value))
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return { hour: Number(map.hour), minute: Number(map.minute), label: `${map.hour}:${map.minute}` }
}

function minutesInZone(value: string, timeZone: string) {
  const parts = timeParts(value, timeZone)
  return parts.hour * 60 + parts.minute
}

type CalendarEventOverlap = "none" | "contained" | "continuing"

/**
 * Keep overlapping meetings full-width so their titles remain useful. A later
 * event that ends inside an earlier one is inset; one that continues beyond the
 * earlier finish keeps the full column. Both receive a theme-aware separation edge.
 */
function layoutCalendarEvents(events: CalendarEvent[]) {
  const ordered = [...events].sort((left, right) => {
    const startDifference = Date.parse(left.startAt) - Date.parse(right.startAt)
    return startDifference || Date.parse(right.endAt) - Date.parse(left.endAt)
  })

  return ordered.map((event, index) => {
    const startAt = Date.parse(event.startAt)
    const endAt = Date.parse(event.endAt)
    const earlierOverlaps = ordered.slice(0, index).filter((earlier) => startAt < Date.parse(earlier.endAt) && endAt > Date.parse(earlier.startAt))
    const contained = earlierOverlaps.some((earlier) => startAt > Date.parse(earlier.startAt) && endAt <= Date.parse(earlier.endAt))
    const overlap: CalendarEventOverlap = contained ? "contained" : earlierOverlaps.length ? "continuing" : "none"
    return { event, overlap, zIndex: 10 + index }
  })
}

const ribbonTones: Record<CalendarRibbon["tone"], string> = {
  neutral: "bg-[var(--md-surface-tint)] text-[var(--md-ink)]",
  amber: "bg-[var(--md-status-amber-bg)] text-[var(--md-status-amber-ink)]",
  violet: "bg-[var(--md-status-purple-bg)] text-[var(--md-status-purple-ink)]",
  sky: "bg-[var(--md-calendar-ribbon-sky-bg)] text-[var(--md-calendar-ribbon-sky-ink)]",
  green: "bg-[var(--md-status-green-bg)] text-[var(--md-status-green-ink)]",
  teal: "bg-[var(--md-status-teal-bg)] text-[var(--md-status-teal-ink)]",
  orange: "bg-[var(--md-status-orange-bg)] text-[var(--md-status-orange-ink)]",
}

function canMoveEvent(event: CalendarEvent) {
  return event.canEdit && event.status === "confirmed"
}

/**
 * One meeting on the grid. Hover only deepens the colour a touch: the block must
 * not slide, because a moving target makes the grab-to-drag feel unreliable.
 * When it can be moved, pressing anywhere on it starts a pointer drag and the
 * six-pixel top and bottom edges change the start or end time instead.
 */
function EventBlock({ event, compact = false, overlapBoundary = false, contained = false, dragging = false, timeZone, onOpen, onGrip }: {
  event: CalendarEvent
  compact?: boolean
  overlapBoundary?: boolean
  contained?: boolean
  dragging?: boolean
  timeZone: string
  onOpen: (event: CalendarEvent, anchor: HTMLElement) => void
  onGrip?: (mode: CalendarDragMode, pointerEvent: ReactPointerEvent<HTMLElement>) => void
}) {
  const { t } = useLanguage()
  const start = timeParts(event.startAt, timeZone)
  const end = timeParts(event.endAt, timeZone)
  const colour = event.colour ?? (event.provider === "calendar" ? "neutral" : "teal")
  const title = event.private ? "Busy" : event.title
  return <button
    type="button"
    onPointerDown={onGrip ? (pointerEvent) => onGrip("move", pointerEvent) : undefined}
    onClick={(click) => { click.stopPropagation(); onOpen(event, click.currentTarget) }}
    style={meetingColourStyle(colour)}
    className={cn(
      "group relative h-full w-full flex flex-col items-stretch justify-start overflow-hidden rounded-[var(--md-radius-md)] bg-[var(--md-event-colour)] p-2 text-start text-[var(--md-event-foreground)] shadow-[var(--md-shadow-line)] transition-[box-shadow,scale,filter] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:brightness-[.97] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)] motion-reduce:transition-none",
      compact && "justify-center px-1.5 py-0.5",
      contained && "rounded-[max(0px,calc(var(--md-radius-md)-4px))]",
      overlapBoundary && "after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:border-2 after:border-[var(--md-surface)]",
      onGrip && "cursor-grab touch-none active:cursor-grabbing",
      dragging && "scale-[1.02] shadow-[0_0_0_1px_color-mix(in_srgb,var(--md-ink)_12%,transparent),0_4px_10px_rgba(12,20,28,0.12),0_24px_48px_rgba(12,20,28,0.2)] brightness-100",
    )}
    title={`${title} ${start.label}–${end.label}`}
  >
    {onGrip && !compact ? (
      <>
        <span role="separator" aria-orientation="horizontal" aria-label={`${t("Change start time")}: ${title}`} onPointerDown={(pointerEvent) => { pointerEvent.stopPropagation(); onGrip("resize-start", pointerEvent) }} className="absolute inset-x-0 top-0 z-10 h-1.5 cursor-ns-resize touch-none after:absolute after:inset-x-3 after:top-[2px] after:h-[2px] after:rounded-full after:bg-[var(--md-event-foreground)] after:opacity-0 after:transition-opacity after:duration-200 hover:after:opacity-50" />
        <span role="separator" aria-orientation="horizontal" aria-label={`${t("Change end time")}: ${title}`} onPointerDown={(pointerEvent) => { pointerEvent.stopPropagation(); onGrip("resize-end", pointerEvent) }} className="absolute inset-x-0 bottom-0 z-10 h-1.5 cursor-ns-resize touch-none after:absolute after:inset-x-3 after:bottom-[2px] after:h-[2px] after:rounded-full after:bg-[var(--md-event-foreground)] after:opacity-0 after:transition-opacity after:duration-200 hover:after:opacity-50" />
      </>
    ) : null}
    <span className="flex min-w-0 items-center gap-1.5"><MeetingProviderMark provider={event.provider === "calendar" ? "multideck" : event.provider} appearance="event" className={compact ? "size-3.5" : "size-4"} /><span className={cn("truncate font-medium text-[var(--md-event-foreground)]", compact ? "text-[10.5px]" : "text-[11.5px]")}>{title}</span></span>
    {!compact ? <span className="mt-1 flex items-center justify-between gap-2 text-[10.5px] tabular-nums text-[var(--md-event-foreground)] opacity-80"><span>{start.label}–{end.label}</span>{event.participants?.length ? <MeetingResponseSummary participants={event.participants} compact /> : null}</span> : null}
    {event.status === "provisioning" ? <span className="mt-1 block text-[10px] text-[var(--md-event-foreground)] opacity-85">Creating join link…</span> : null}
    {event.status === "sync_failed" ? <span className="mt-1 block text-[10px] font-medium text-[var(--md-event-foreground)]">Needs attention</span> : null}
  </button>
}

export function CalendarDayRibbon({ ribbon, navigate }: { ribbon: CalendarRibbon; navigate: (path: string) => void }) {
  return (
    <a
      href={ribbon.route}
      onClick={(event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
        event.preventDefault()
        navigate(ribbon.route)
      }}
      className={cn("md-calendar-day-ribbon flex min-h-8 w-full min-w-0 items-center rounded-[var(--md-radius-lg)] px-2.5 py-1.5 text-start text-[12px] font-medium leading-5 whitespace-normal [overflow-wrap:anywhere] hover:underline underline-offset-2", ribbonTones[ribbon.tone])}
    >
      {ribbon.title}
    </a>
  )
}

export function CalendarView({
  events,
  ribbons,
  timeZone,
  onRangeChange,
  onOpenEvent,
  onCreateAt,
  onReviewMove,
  navigate,
}: {
  events: CalendarEvent[]
  ribbons: CalendarRibbon[]
  timeZone: string
  onRangeChange: (range: { start: string; end: string }) => void
  onOpenEvent: (event: CalendarEvent, anchor: HTMLElement) => void
  onCreateAt: (startAt: string, endAt: string) => void
  onReviewMove?: (event: CalendarEvent, startAt: string, endAt: string) => void
  navigate: (path: string) => void
}) {
  const { direction } = useLanguage()
  const [view, setView] = useState<CalendarViewMode>("Week")
  const [anchor, setAnchor] = useState(() => new Date())
  const [showOperational, setShowOperational] = useState(true)
  const [showPersonal, setShowPersonal] = useState(true)
  const gridRef = useRef<HTMLDivElement | null>(null)
  const timeScrollRef = useRef<HTMLDivElement | null>(null)
  // A drop fires a click on the same button. Ignore clicks for a beat after any
  // drag ends so releasing a moved block does not also open its details.
  const suppressOpenUntil = useRef(0)
  const days = useMemo(() => calendarPeriodDates(view, anchor, true), [anchor, view])
  const dayKeys = useMemo(() => days.map(calendarDateKey), [days])
  const range = useMemo(() => ({ start: days[0], end: addCalendarDays(days.at(-1) ?? days[0], 1) }), [days])
  const eventsById = useMemo(() => new Map(events.map((event) => [event.id, event])), [events])
  // Read the unfiltered source so hiding a layer does not erase its colour key.
  const operationalTones = [...new Set(ribbons.map((ribbon) => ribbon.tone))].sort()
  const personalColours = [...new Set(events.filter((event) => event.provider === "calendar").map((event) => event.colour ?? "neutral"))].sort()

  useEffect(() => onRangeChange({ start: range.start.toISOString(), end: range.end.toISOString() }), [onRangeChange, range.end, range.start])
  useLayoutEffect(() => {
    if (view === "Week" && timeScrollRef.current) {
      timeScrollRef.current.scrollTop = (INITIAL_VIEW_HOUR - GRID_START_HOUR) * HOUR_HEIGHT
    }
  }, [view])

  function proposeMove(eventId: string, dateKey: string, startMinutes: number, endMinutes: number) {
    const event = eventsById.get(eventId)
    if (!event || !canMoveEvent(event) || !onReviewMove) return
    const startAt = instantAtGridMinutes(dateKey, startMinutes, timeZone)
    const endAt = instantAtGridMinutes(dateKey, endMinutes, timeZone)
    onReviewMove(event, startAt, endAt)
  }

  const weekDrag = useCalendarEventDrag({
    gridRef,
    dayKeys,
    hourHeight: HOUR_HEIGHT,
    gridStartMinutes: GRID_START_HOUR * 60,
    gridEndMinutes: GRID_END_HOUR * 60,
    direction,
    columnsInset: HOUR_GUTTER,
    onCommit: ({ eventId, dateKey, startMinutes, endMinutes }) => proposeMove(eventId, dateKey, startMinutes, endMinutes),
  })
  const monthDrag = useCalendarDayDrag({
    onCommit: ({ eventId, dateKey }) => {
      const event = eventsById.get(eventId)
      if (!event) return
      proposeMove(eventId, dateKey, minutesInZone(event.startAt, timeZone), minutesInZone(event.startAt, timeZone) + Math.max(15, Math.round((Date.parse(event.endAt) - Date.parse(event.startAt)) / 60_000)))
    },
  })
  const dragging = weekDrag.dragging || monthDrag.dragging
  const createDrag = useCalendarCreateDrag({
    gridRef,
    gridStartMinutes: GRID_START_HOUR * 60,
    gridEndMinutes: GRID_END_HOUR * 60,
    contextKey: `${view}:${dayKeys[0]}:${timeZone}`,
    onCreate: (dateKey, startMinutes, endMinutes) => {
      suppressOpenUntil.current = Date.now() + 350
      onCreateAt(instantAtGridMinutes(dateKey, startMinutes, timeZone), instantAtGridMinutes(dateKey, endMinutes, timeZone))
    },
  })
  const wasDragging = useRef(false)
  useEffect(() => {
    if (wasDragging.current && !dragging) suppressOpenUntil.current = Date.now() + 250
    wasDragging.current = dragging
  }, [dragging])

  function openEvent(event: CalendarEvent, element: HTMLElement) {
    if (Date.now() < suppressOpenUntil.current) return
    onOpenEvent(event, element)
  }

  const visibleEvents = useMemo(() => {
    const filtered = events.filter((item) => showPersonal || item.provider !== "calendar")
    const preview = weekDrag.preview
    if (!preview) return filtered
    // The block being dragged is shown where it would land, so the grid reflows
    // around the proposed time rather than the old one.
    return filtered.map((event) => event.id === preview.eventId
      ? { ...event, startAt: instantAtGridMinutes(preview.dateKey, preview.startMinutes, timeZone), endAt: instantAtGridMinutes(preview.dateKey, preview.endMinutes, timeZone) }
      : event)
  }, [events, showPersonal, timeZone, weekDrag.preview])

  const groupedEvents = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const event of visibleEvents) {
      const key = dateKeyForZone(event.startAt, timeZone)
      map.set(key, [...(map.get(key) ?? []), event])
    }
    for (const rows of map.values()) rows.sort((left, right) => Date.parse(left.startAt) - Date.parse(right.startAt))
    return map
  }, [visibleEvents, timeZone])
  const groupedRibbons = useMemo(() => {
    const map = new Map<string, CalendarRibbon[]>()
    if (!showOperational) return map
    for (const ribbon of ribbons) {
      const key = dateKeyForZone(ribbon.at, timeZone)
      map.set(key, [...(map.get(key) ?? []), ribbon])
    }
    return map
  }, [ribbons, showOperational, timeZone])
  const todayKey = calendarDateKey(new Date())
  const periodLabel = formatCalendarPeriodLabel(view, "en-GB", anchor)
  const monthGhost = monthDrag.preview ? eventsById.get(monthDrag.preview.eventId) ?? null : null

  function move(direction: -1 | 1) {
    setAnchor((current) => moveCalendarPeriod(current, view, direction))
  }

  function createAt(day: Date, hour = 9, minute = 0) {
    const startAt = zonedToIso(calendarDateKey(day), `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`, timeZone)
    onCreateAt(startAt, new Date(Date.parse(startAt) + 30 * 60_000).toISOString())
  }

  function weekGrip(event: CalendarEvent) {
    if (!onReviewMove || !canMoveEvent(event)) return undefined
    return (mode: CalendarDragMode, pointerEvent: ReactPointerEvent<HTMLElement>) => {
      const startMinutes = minutesInZone(event.startAt, timeZone)
      const duration = Math.max(15, Math.round((Date.parse(event.endAt) - Date.parse(event.startAt)) / 60_000))
      weekDrag.begin(pointerEvent, { eventId: event.id, mode, dateKey: dateKeyForZone(event.startAt, timeZone), startMinutes, endMinutes: startMinutes + duration })
    }
  }

  function monthGrip(event: CalendarEvent) {
    if (!onReviewMove || !canMoveEvent(event)) return undefined
    return (_mode: CalendarDragMode, pointerEvent: ReactPointerEvent<HTMLElement>) => {
      monthDrag.begin(pointerEvent, { eventId: event.id, dateKey: dateKeyForZone(event.startAt, timeZone) })
    }
  }

  return <div className="grid gap-3">
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-0.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon" aria-label={view === "Week" ? "Previous week" : "Previous month"} onClick={() => move(-1)} className="size-8 rounded-full"><ChevronLeft className="size-4" /></Button>
          <Button type="button" variant="ghost" onClick={() => setAnchor(new Date())} className="h-8 rounded-[var(--md-radius-md)] px-2.5 text-[12px]">Today</Button>
          <Button type="button" variant="ghost" size="icon" aria-label={view === "Week" ? "Next week" : "Next month"} onClick={() => move(1)} className="size-8 rounded-full"><ChevronRight className="size-4" /></Button>
        </div>
        <div className="flex h-8 items-center gap-2 rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] px-2.5 text-[12px] font-medium text-[var(--md-ink)]"><CalendarDays className="size-3.5 text-[var(--md-accent)]" />{periodLabel}</div>
      </div>
      <div className="ms-auto flex min-w-0 flex-wrap items-center justify-end gap-x-4 gap-y-2">
        <MultiSelectMenu
          variant="toolbar"
          label="Show on calendar"
          options={[
            {
              value: "Operational dates",
              label: "Operational dates",
              leading: <span data-calendar-palette="operational" className="flex h-3 w-8 overflow-hidden rounded-full bg-[var(--md-surface-tint)] ring-1 ring-[var(--md-line-strong)]">
                {operationalTones.map((tone) => <span key={tone} data-calendar-tone={tone} className={cn("h-full min-w-0 flex-1", ribbonTones[tone])} />)}
              </span>,
            },
            {
              value: "Personal events",
              label: "Personal events",
              leading: <span data-calendar-palette="personal" className="flex h-3 w-8 overflow-hidden rounded-full bg-[var(--md-surface-tint)] ring-1 ring-[var(--md-line-strong)]">
                {personalColours.map((colour) => <span key={colour} data-calendar-colour={colour} style={meetingColourStyle(colour)} className="h-full min-w-0 flex-1 bg-[var(--md-event-colour)]" />)}
              </span>,
            },
          ]}
          value={[
            ...(showOperational ? ["Operational dates"] : []),
            ...(showPersonal ? ["Personal events"] : []),
          ]}
          onValueChange={(selected) => {
            setShowOperational(selected.includes("Operational dates"))
            setShowPersonal(selected.includes("Personal events"))
          }}
          placeholder="Show on calendar"
          className="w-auto max-w-full text-[12px]"
        />
        <SegmentedControl options={viewModes} value={view} onChange={setView} ariaLabel="Calendar view" className="h-8 p-0.5 [&>button]:h-7 [&>button]:rounded-[calc(var(--md-radius-lg)-2px)] [&>button]:px-2.5 [&>button]:text-[12px]" />
        <div className="flex items-center gap-1">
          <CalendarUtilityAction label="Availability settings" icon={CalendarClock} onClick={() => navigate("/settings?tab=availability")} />
          <CalendarUtilityAction label="Booking links" icon={Link2} onClick={() => navigate("/calendar/booking-links")} />
        </div>
      </div>
    </div>

    <div className="flex items-center gap-2 px-1 text-[11px] text-[var(--md-subtle)]"><Clock3 className="size-3.5" />Times shown in <span className="font-medium text-[var(--md-text)]">{timeZone}</span></div>

    <div className="md:hidden">
      <div className="grid gap-3">{days.slice(0, view === "Week" ? 7 : 14).map((day) => {
        const key = calendarDateKey(day)
        const dayEvents = groupedEvents.get(key) ?? []
        const dayRibbons = groupedRibbons.get(key) ?? []
        if (!dayEvents.length && !dayRibbons.length && key !== todayKey) return null
        return <section key={key} className="rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-3 shadow-[var(--md-shadow-line)]"><div className="mb-3 flex items-center justify-between"><div><p className="text-[12px] font-medium text-[var(--md-ink)]">{new Intl.DateTimeFormat("en-GB", { weekday: "long" }).format(day)}</p><p className="mt-0.5 text-[11px] text-[var(--md-subtle)]">{new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long" }).format(day)}</p></div><Button type="button" variant="ghost" size="sm" onClick={() => createAt(day)} className="h-8 rounded-[var(--md-radius-md)]">Add meeting</Button></div><div className="grid gap-1.5">{dayRibbons.map((ribbon) => <CalendarDayRibbon key={ribbon.id} ribbon={ribbon} navigate={navigate} />)}{dayEvents.map((event) => <EventBlock key={event.id} event={event} timeZone={timeZone} onOpen={onOpenEvent} />)}{!dayEvents.length && !dayRibbons.length ? <p className="py-3 text-center text-[11px] text-[var(--md-subtle)]">Nothing planned</p> : null}</div></section>
      })}</div>
    </div>

    {view === "Week" ? <div className="hidden overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)] md:block">
      <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b border-[var(--md-line)]"><div /><>{days.map((day) => { const key = calendarDateKey(day); return <div key={key} className={cn("min-w-0 border-s border-[var(--md-line)] px-2 py-3 text-center transition-colors duration-200", key === todayKey && "bg-[var(--md-accent-a06)]", weekDrag.preview?.dateKey === key && "bg-[var(--md-accent-a10)]")}><p className="text-[10px] uppercase tracking-[.06em] text-[var(--md-subtle)]">{new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(day)}</p><p className={cn("mt-1 text-[17px] font-medium text-[var(--md-ink)]", key === todayKey && "text-[var(--md-accent)]")}>{day.getDate()}</p></div> })}</></div>
      <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b border-[var(--md-line)] bg-[var(--md-surface-tint)]"><div className="px-2 py-2 text-[9px] uppercase tracking-[.06em] text-[var(--md-subtle)]">Dates</div>{days.map((day) => <div key={calendarDateKey(day)} className="grid min-h-10 gap-1 border-s border-[var(--md-line)] p-1.5">{(groupedRibbons.get(calendarDateKey(day)) ?? []).slice(0, 3).map((ribbon) => <CalendarDayRibbon key={ribbon.id} ribbon={ribbon} navigate={navigate} />)}</div>)}</div>
      <div ref={timeScrollRef} role="region" aria-label="Calendar time slots" tabIndex={0} className="max-h-[780px] h-[max(240px,calc(100dvh_-_300px))] overflow-y-auto overscroll-contain py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--md-accent)]"><div ref={gridRef} className="relative grid grid-cols-[56px_repeat(7,minmax(0,1fr))]" style={{ height: GRID_HEIGHT }}><div className="relative">{Array.from({ length: GRID_END_HOUR - GRID_START_HOUR + 1 }, (_, index) => index + GRID_START_HOUR).map((hour) => <span key={hour} className="absolute end-2 -translate-y-1/2 text-[9.5px] tabular-nums text-[var(--md-subtle)]" style={{ top: (hour - GRID_START_HOUR) * HOUR_HEIGHT }}>{String(hour).padStart(2, "0")}:00</span>)}</div>{days.map((day) => { const key = calendarDateKey(day); const dropTarget = weekDrag.preview?.dateKey === key; return <div key={key} className={cn("relative border-s border-[var(--md-line)] bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_59px,var(--md-line)_60px)] transition-colors duration-200", dropTarget && "bg-[var(--md-accent-a04)]")}>{Array.from({ length: GRID_END_HOUR - GRID_START_HOUR }, (_, index) => { const hour = index + GRID_START_HOUR; const label = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(day); return <button key={hour} type="button" tabIndex={dragging ? -1 : undefined} aria-label={`Add meeting on ${label} at ${String(hour).padStart(2, "0")}:00`} className={cn("absolute inset-x-0 z-0 border-0 bg-transparent transition-colors focus-visible:z-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--md-accent-a20)]", !dragging && "hover:bg-[var(--md-accent-a06)]")} style={{ top: index * HOUR_HEIGHT, height: HOUR_HEIGHT }} onPointerDown={(event) => { if (!dragging) createDrag.begin(event, key) }} onClick={(event) => { if (createDrag.suppressClick() || Date.now() < suppressOpenUntil.current) return; const rect = event.currentTarget.getBoundingClientRect(); const minute = event.detail === 0 ? 0 : Math.min(45, Math.max(0, Math.floor((event.clientY - rect.top) / 15) * 15)); createAt(day, hour, minute) }} /> })}{layoutCalendarEvents(groupedEvents.get(key) ?? []).map(({ event: calendarEvent, overlap, zIndex }) => { const start = timeParts(calendarEvent.startAt, timeZone); const end = timeParts(calendarEvent.endAt, timeZone); const top = Math.max(0, (start.hour - GRID_START_HOUR) * HOUR_HEIGHT + start.minute); const endMinutes = dateKeyForZone(calendarEvent.endAt, timeZone) === key ? end.hour * 60 + end.minute : GRID_END_HOUR * 60; const height = Math.max(28, Math.min(GRID_HEIGHT - top, endMinutes - start.hour * 60 - start.minute)); const visualHeight = overlap === "contained" ? Math.max(24, height - 4) : height; const isDragging = weekDrag.preview?.eventId === calendarEvent.id; return <div key={calendarEvent.id} className="absolute pb-1" style={{ top, height: visualHeight, left: overlap === "contained" ? 8 : 4, right: overlap === "contained" ? 8 : 4, zIndex: isDragging ? 40 : zIndex }}><EventBlock event={calendarEvent} compact={visualHeight < 50} overlapBoundary={overlap !== "none"} contained={overlap === "contained"} dragging={isDragging} timeZone={timeZone} onOpen={openEvent} onGrip={weekGrip(calendarEvent)} /></div> })}</div> })}
        <div ref={createDrag.previewRef} aria-hidden="true" data-calendar-create-preview="" className="pointer-events-none invisible absolute z-50 overflow-hidden rounded-[var(--md-radius-md)] bg-[var(--md-selected-bg)] px-2 text-[11px] font-medium tabular-nums text-[var(--md-selected-text)] ring-1 ring-inset ring-[var(--md-accent)]">
          <span ref={createDrag.labelRef} className="block truncate leading-[15px]" />
        </div>
      </div></div>
    </div> : <div className="hidden grid-cols-7 overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)] md:grid">{days.map((day) => { const key = calendarDateKey(day); const outside = day.getMonth() !== anchor.getMonth(); const dayEvents = groupedEvents.get(key) ?? []; const dayRibbons = groupedRibbons.get(key) ?? []; const dropTarget = monthDrag.preview?.dateKey === key && monthDrag.preview.originDateKey !== key; return <section key={key} data-calendar-day={key} className={cn("min-h-32 min-w-0 border-b border-s border-[var(--md-line)] p-2 transition-[background-color,box-shadow] duration-200", outside && "bg-[var(--md-surface-tint)] opacity-60", key === todayKey && "bg-[var(--md-accent-a06)]", dropTarget && "bg-[var(--md-accent-a10)] opacity-100 shadow-[inset_0_0_0_1.5px_var(--md-accent-a28)]")}><button type="button" onClick={() => createAt(day)} className="mb-2 grid size-7 place-items-center rounded-full text-[11px] font-medium text-[var(--md-text)] hover:bg-[var(--md-hover)]">{day.getDate()}</button><div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1">{dayRibbons.slice(0, 2).map((ribbon) => <CalendarDayRibbon key={ribbon.id} ribbon={ribbon} navigate={navigate} />)}{dayEvents.slice(0, 3).map((event) => <div key={event.id} className={cn("min-w-0 transition-opacity duration-150", monthDrag.preview?.eventId === event.id && "opacity-35")}><EventBlock event={event} compact timeZone={timeZone} onOpen={openEvent} onGrip={monthGrip(event)} /></div>)}{dayEvents.length + dayRibbons.length > 5 ? <p className="px-1 text-[9.5px] text-[var(--md-subtle)]">+{dayEvents.length + dayRibbons.length - 5} more</p> : null}</div></section> })}</div>}

    {monthDrag.preview && monthGhost ? (
      <div aria-hidden="true" className="md-kanban-drag-preview" style={{ left: monthDrag.preview.x - monthDrag.preview.width / 2, top: monthDrag.preview.y - 14, width: monthDrag.preview.width }}>
        <div className="md-kanban-drag-preview-card !p-0 !gap-0 !bg-transparent">
          <EventBlock event={monthGhost} compact timeZone={timeZone} onOpen={() => undefined} />
        </div>
      </div>
    ) : null}
  </div>
}
