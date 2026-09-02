import { useEffect, useMemo, useState, type ComponentType, type DragEvent as ReactDragEvent } from "react"
import { CalendarClock, CalendarDays, ChevronLeft, ChevronRight, Clock3, Link2 } from "@/components/icons/hugeicons"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { SegmentedControl } from "@/components/multideck/workflow-components"
import { MultiSelectMenu } from "@/components/multideck/multi-select-menu"
import { meetingColourStyle } from "@/components/multideck/meeting-colour-picker"
import { MeetingProviderMark } from "@/components/multideck/meeting-provider-mark"
import { MeetingResponseSummary } from "@/components/multideck/meeting-attendee-status"
import { addCalendarDays, calendarDateKey, calendarPeriodDates, formatCalendarPeriodLabel, moveCalendarPeriod, type CalendarPeriodView } from "@/components/multideck/calendar-period-core"
import { zonedToIso } from "@/components/multideck/meeting-time-picker"
import type { CalendarEvent, CalendarRibbon } from "@/lib/calendar-api"
import { cn } from "@/lib/utils"

type CalendarViewMode = CalendarPeriodView
const viewModes: CalendarViewMode[] = ["Week", "Month"]

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

type CalendarEventOverlap = "none" | "contained" | "continuing"

/**
 * Keep overlapping meetings full-width so their titles remain useful. A later
 * event that ends inside an earlier one is inset; one that continues beyond the
 * earlier finish keeps the full column and receives a white separation edge.
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

function EventBlock({ event, compact = false, overlapBoundary = false, timeZone, onOpen, onDragStart, onDragEnd }: { event: CalendarEvent; compact?: boolean; overlapBoundary?: boolean; timeZone: string; onOpen: (event: CalendarEvent, anchor: HTMLElement) => void; onDragStart?: (event: CalendarEvent, drag: ReactDragEvent<HTMLButtonElement>) => void; onDragEnd?: () => void }) {
  const start = timeParts(event.startAt, timeZone)
  const end = timeParts(event.endAt, timeZone)
  const colour = event.colour ?? (event.provider === "calendar" ? "neutral" : "teal")
  return <button type="button" draggable={Boolean(onDragStart)} onDragStart={(drag) => onDragStart?.(event, drag)} onDragEnd={onDragEnd} onClick={(click) => { click.stopPropagation(); onOpen(event, click.currentTarget) }} style={meetingColourStyle(colour)} className={cn("group relative h-full w-full overflow-hidden rounded-[var(--md-radius-md)] bg-[var(--md-event-colour)] p-2 text-start align-top text-[var(--md-event-foreground)] shadow-[var(--md-shadow-line)] transition-[box-shadow,transform,filter] hover:-translate-y-px hover:brightness-[.97] hover:shadow-[var(--md-shadow-soft)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]", compact && "p-1.5", overlapBoundary && "border-2 border-[var(--md-surface)]", onDragStart && "cursor-grab active:cursor-grabbing")}>
    <span className="flex min-w-0 items-center gap-1.5"><MeetingProviderMark provider={event.provider === "calendar" ? "multideck" : event.provider} appearance="event" className={compact ? "size-3.5" : "size-4"} /><span className={cn("truncate font-medium text-[var(--md-event-foreground)]", compact ? "text-[10.5px]" : "text-[11.5px]")}>{event.private ? "Busy" : event.title}</span></span>
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
  const [view, setView] = useState<CalendarViewMode>("Week")
  const [anchor, setAnchor] = useState(() => new Date())
  const [showOperational, setShowOperational] = useState(true)
  const [showPersonal, setShowPersonal] = useState(true)
  const [draggingEventId, setDraggingEventId] = useState<string | null>(null)
  const days = useMemo(() => calendarPeriodDates(view, anchor, true), [anchor, view])
  const range = useMemo(() => ({ start: days[0], end: addCalendarDays(days.at(-1) ?? days[0], 1) }), [days])

  useEffect(() => onRangeChange({ start: range.start.toISOString(), end: range.end.toISOString() }), [onRangeChange, range.end, range.start])

  const groupedEvents = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const event of events.filter((item) => showPersonal || item.provider !== "calendar")) {
      const key = dateKeyForZone(event.startAt, timeZone)
      map.set(key, [...(map.get(key) ?? []), event])
    }
    for (const rows of map.values()) rows.sort((left, right) => Date.parse(left.startAt) - Date.parse(right.startAt))
    return map
  }, [events, showPersonal, timeZone])
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

  function move(direction: -1 | 1) {
    setAnchor((current) => moveCalendarPeriod(current, view, direction))
  }

  function createAt(day: Date, hour = 9, minute = 0) {
    const startAt = zonedToIso(calendarDateKey(day), `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`, timeZone)
    onCreateAt(startAt, new Date(Date.parse(startAt) + 30 * 60_000).toISOString())
  }

  function startDragging(event: CalendarEvent, drag: ReactDragEvent<HTMLButtonElement>) {
    if (!event.canEdit || event.status !== "confirmed" || !onReviewMove) return
    drag.dataTransfer.effectAllowed = "move"
    drag.dataTransfer.setData("text/plain", event.id)
    setDraggingEventId(event.id)
  }

  function reviewDrop(day: Date, hour: number, minute: number) {
    const event = events.find((candidate) => candidate.id === draggingEventId)
    setDraggingEventId(null)
    if (!event || !event.canEdit || event.status !== "confirmed" || !onReviewMove) return
    const startAt = zonedToIso(calendarDateKey(day), `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`, timeZone)
    const duration = Math.max(15 * 60_000, Date.parse(event.endAt) - Date.parse(event.startAt))
    onReviewMove(event, startAt, new Date(Date.parse(startAt) + duration).toISOString())
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
          label="Show on calendar"
          options={["Operational dates", "Personal events"]}
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
      <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b border-[var(--md-line)]"><div /><>{days.map((day) => { const key = calendarDateKey(day); return <div key={key} className={cn("min-w-0 border-s border-[var(--md-line)] px-2 py-3 text-center", key === todayKey && "bg-[var(--md-accent-a06)]")}><p className="text-[10px] uppercase tracking-[.06em] text-[var(--md-subtle)]">{new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(day)}</p><p className={cn("mt-1 text-[17px] font-medium text-[var(--md-ink)]", key === todayKey && "text-[var(--md-accent)]")}>{day.getDate()}</p></div> })}</></div>
      <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b border-[var(--md-line)] bg-[var(--md-surface-tint)]"><div className="px-2 py-2 text-[9px] uppercase tracking-[.06em] text-[var(--md-subtle)]">Dates</div>{days.map((day) => <div key={calendarDateKey(day)} className="grid min-h-10 gap-1 border-s border-[var(--md-line)] p-1.5">{(groupedRibbons.get(calendarDateKey(day)) ?? []).slice(0, 3).map((ribbon) => <CalendarDayRibbon key={ribbon.id} ribbon={ribbon} navigate={navigate} />)}</div>)}</div>
      <div className="max-h-[calc(100dvh-300px)] min-h-[520px] overflow-y-auto"><div className="relative grid grid-cols-[56px_repeat(7,minmax(0,1fr))]" style={{ height: 780 }}><div className="relative">{Array.from({ length: 14 }, (_, index) => index + 7).map((hour) => <span key={hour} className="absolute end-2 -translate-y-1/2 text-[9.5px] tabular-nums text-[var(--md-subtle)]" style={{ top: (hour - 7) * 60 }}>{String(hour).padStart(2, "0")}:00</span>)}</div>{days.map((day) => { const key = calendarDateKey(day); return <div key={key} className="relative border-s border-[var(--md-line)] bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_59px,var(--md-line)_60px)]">{Array.from({ length: 13 }, (_, index) => { const hour = index + 7; const label = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(day); return <button key={hour} type="button" aria-label={`Add meeting on ${label} at ${String(hour).padStart(2, "0")}:00`} className={cn("absolute inset-x-0 z-0 border-0 bg-transparent transition-colors hover:bg-[var(--md-accent-a06)] focus-visible:z-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--md-accent-a20)]", draggingEventId && "bg-[var(--md-accent-a04)] hover:bg-[var(--md-accent-a10)]")} style={{ top: index * 60, height: 60 }} onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); const minute = event.detail === 0 ? 0 : Math.min(45, Math.max(0, Math.floor((event.clientY - rect.top) / 15) * 15)); createAt(day, hour, minute) }} onDragOver={(event) => { if (!draggingEventId) return; event.preventDefault(); event.dataTransfer.dropEffect = "move" }} onDrop={(event) => { event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); const minute = Math.min(45, Math.max(0, Math.floor((event.clientY - rect.top) / 15) * 15)); reviewDrop(day, hour, minute) }} /> })}{layoutCalendarEvents(groupedEvents.get(key) ?? []).map(({ event: calendarEvent, overlap, zIndex }) => { const start = timeParts(calendarEvent.startAt, timeZone); const end = timeParts(calendarEvent.endAt, timeZone); const top = Math.max(0, (start.hour - 7) * 60 + start.minute); const height = Math.max(28, Math.min(780 - top, (end.hour - start.hour) * 60 + end.minute - start.minute)); const visualHeight = overlap === "contained" ? Math.max(23, height - 5) : height; const canDrag = calendarEvent.canEdit && calendarEvent.status === "confirmed" && Boolean(onReviewMove); return <div key={calendarEvent.id} className={cn("absolute", draggingEventId === calendarEvent.id && "opacity-55")} style={{ top, height: visualHeight, left: overlap === "contained" ? 9 : 4, right: overlap === "contained" ? 9 : 4, zIndex }}><EventBlock event={calendarEvent} compact={visualHeight < 50} overlapBoundary={overlap === "continuing"} timeZone={timeZone} onOpen={onOpenEvent} onDragStart={canDrag ? startDragging : undefined} onDragEnd={() => setDraggingEventId(null)} /></div> })}</div> })}</div></div>
    </div> : <div className="hidden grid-cols-7 overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)] md:grid">{days.map((day) => { const key = calendarDateKey(day); const outside = day.getMonth() !== anchor.getMonth(); const dayEvents = groupedEvents.get(key) ?? []; const dayRibbons = groupedRibbons.get(key) ?? []; return <section key={key} className={cn("min-h-32 border-b border-s border-[var(--md-line)] p-2", outside && "bg-[var(--md-surface-tint)] opacity-60", key === todayKey && "bg-[var(--md-accent-a06)]")}><button type="button" onClick={() => createAt(day)} className="mb-2 grid size-7 place-items-center rounded-full text-[11px] font-medium text-[var(--md-text)] hover:bg-[var(--md-hover)]">{day.getDate()}</button><div className="grid gap-1">{dayRibbons.slice(0, 2).map((ribbon) => <CalendarDayRibbon key={ribbon.id} ribbon={ribbon} navigate={navigate} />)}{dayEvents.slice(0, 3).map((event) => <EventBlock key={event.id} event={event} compact timeZone={timeZone} onOpen={onOpenEvent} />)}{dayEvents.length + dayRibbons.length > 5 ? <p className="px-1 text-[9.5px] text-[var(--md-subtle)]">+{dayEvents.length + dayRibbons.length - 5} more</p> : null}</div></section> })}</div>}
  </div>
}
