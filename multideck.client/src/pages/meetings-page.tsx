import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { CalendarDays, ChevronRight, Clock3, Link2, Users } from "@/components/icons/hugeicons"
import { Button } from "@/components/ui/button"
import { SegmentedControl } from "@/components/multideck/workflow-components"
import { DotGridLoader } from "@/components/multideck/dot-grid-loader"
import { MeetingDetailsPopover, type MeetingDetailsAnchor } from "@/components/multideck/meeting-details-popover"
import { MeetingProviderMark, meetingProviderLabels } from "@/components/multideck/meeting-provider-mark"
import { CALENDAR_CHANGED_EVENT } from "@/components/multideck/meeting-dialog"
import { BookingLinksPage } from "@/pages/booking-links-page"
import { getCalendarWorkspace, type CalendarEvent, type CalendarWorkspace } from "@/lib/calendar-api"
import { useLanguage } from "@/i18n/language-provider"
import { cn } from "@/lib/utils"
import "./meetings-page.css"

type MeetingsView = "Appointments" | "Booking links"
type Period = "Upcoming" | "Past"
const WINDOW_DAYS = 90
const DAY = 86_400_000

// Only the stored booking-link relationship establishes a booked appointment.
// Video links, attendees and calendar-provider events are not booking evidence.
function isAppointment(event: CalendarEvent) {
  return !event.private && event.status !== "cancelled" && event.rsvpResponse !== "declined"
    && Boolean(event.bookingLinkId?.trim())
}

export function MeetingsPage({ navigate, view }: { navigate: (path: string) => void; view: MeetingsView }) {
  const { language } = useLanguage()
  const [period, setPeriod] = useState<Period>("Upcoming")
  const [now, setNow] = useState(Date.now)
  const origin = useRef(now)
  const [cache, setCache] = useState<Record<string, CalendarWorkspace>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [selection, setSelection] = useState<MeetingDetailsAnchor | null>(null)
  const cacheKey = period
  const workspace = cache[cacheKey]
  const cached = useRef(cache)
  cached.current = cache
  const pending = useRef(false)
  const refresh = useCallback(() => setReload((value) => value + 1), [])
  const changed = useCallback(() => {
    setCache((current) => current[cacheKey] ? { [cacheKey]: current[cacheKey] } : {})
    refresh()
  }, [cacheKey, refresh])
  const lastReload = useRef(reload)
  const closeDetails = useCallback(() => setSelection(null), [])
  const range = useMemo(() => {
    const start = period === "Upcoming" ? origin.current : origin.current - WINDOW_DAYS * DAY
    return { start: new Date(start).toISOString(), end: new Date(start + WINDOW_DAYS * DAY).toISOString() }
  }, [period])

  useEffect(() => {
    const controller = new AbortController()
    const revalidate = lastReload.current !== reload
    lastReload.current = reload
    setError(null)
    if (cached.current[cacheKey] && !revalidate) { setLoading(false); return }
    setLoading(true)
    pending.current = true
    // Fetch the first past/upcoming windows together so the period switch can
    // reuse the same snapshot immediately, without a second loading screen.
    const requestStart = new Date(origin.current - WINDOW_DAYS * DAY).toISOString()
    const requestEnd = new Date(origin.current + WINDOW_DAYS * DAY).toISOString()
    void getCalendarWorkspace(requestStart, requestEnd, controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) setCache((current) => ({ ...current, Upcoming: next, Past: next }))
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason instanceof TypeError
          ? "Meetings could not be loaded. Check your connection and try again."
          : reason instanceof Error ? reason.message : "Meetings could not be loaded.")
      })
      .finally(() => { if (!controller.signal.aborted) { pending.current = false; setLoading(false) } })
    return () => { controller.abort(); pending.current = false }
  }, [cacheKey, range.start, range.end, reload])
  useEffect(() => {
    const returned = () => { if (!document.hidden) { setNow(Date.now()); if (!pending.current) refresh() } }
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    window.addEventListener(CALENDAR_CHANGED_EVENT, changed)
    document.addEventListener("visibilitychange", returned)
    return () => { window.clearInterval(timer); window.removeEventListener(CALENDAR_CHANGED_EVENT, changed); document.removeEventListener("visibilitychange", returned) }
  }, [changed, refresh])
  const hasPending = workspace?.meetings.some((meeting) => isAppointment(meeting) && (meeting.status === "provisioning" || meeting.status === "sync_pending"))
  useEffect(() => {
    if (!hasPending) return
    const timer = window.setInterval(() => { if (!document.hidden && !pending.current) refresh() }, 5_000)
    return () => window.clearInterval(timer)
  }, [hasPending, refresh])

  const timeZone = workspace?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  const meetings = useMemo(() => [...(workspace?.meetings ?? [])]
    .filter((event) => isAppointment(event) && (period === "Upcoming" ? Date.parse(event.endAt) > now && event.status !== "completed" : Date.parse(event.endAt) <= now))
    .sort((left, right) => period === "Upcoming" ? Date.parse(left.startAt) - Date.parse(right.startAt) : Date.parse(right.startAt) - Date.parse(left.startAt)), [workspace, period, now])
  const dayFormat = useMemo(() => new Intl.DateTimeFormat(language, { weekday: "long", day: "numeric", month: "long", timeZone }), [language, timeZone])
  const timeFormat = useMemo(() => new Intl.DateTimeFormat(language, { hour: "2-digit", minute: "2-digit", timeZone }), [language, timeZone])
  const rangeFormat = useMemo(() => new Intl.DateTimeFormat(language, { day: "numeric", month: "short", year: "numeric", timeZone }), [language, timeZone])
  const dateKey = useMemo(() => new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone }), [timeZone])
  const groups = useMemo(() => {
    const grouped = new Map<string, CalendarEvent[]>()
    for (const meeting of meetings) {
      const key = dateKey.format(new Date(meeting.startAt))
      grouped.set(key, [...(grouped.get(key) ?? []), meeting])
    }
    return [...grouped.entries()]
  }, [meetings, dateKey])
  useEffect(() => {
    if (!selection || !workspace) return
    const fresh = workspace.meetings.find((meeting) => meeting.id === selection.event.id)
    if (fresh && fresh !== selection.event) setSelection({ ...selection, event: fresh })
  }, [workspace, selection])
  function changePeriod(next: Period) { setSelection(null); setPeriod(next); setError(null) }

  return <main className="meetings-workspace grid gap-6">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-[24px] font-medium tracking-[-.025em] text-[var(--md-ink)]">Meetings</h1><p className="mt-1 text-[13px] text-[var(--md-subtle)]">Booked appointments and shared availability.</p></div>
      <Button variant="outline" className="h-8 rounded-[var(--md-radius-lg)] text-[12px]" onClick={() => navigate("/calendar")}><CalendarDays className="size-3.5" />Calendar</Button>
    </header>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--md-line)] pb-4">
      <SegmentedControl options={["Appointments", "Booking links"] as const} value={view} ariaLabel="Meetings view" onChange={(next) => { setSelection(null); navigate(next === "Appointments" ? "/calendar/meetings" : "/calendar/booking-links") }} renderOption={(option) => <>{option === "Appointments" ? <Users className="size-3.5" /> : <Link2 className="size-3.5" />}{option}</>} className="h-9 p-0.5 [&>button]:h-8 [&>button]:text-[12px]" />
      <div className={cn("flex items-center gap-2", view !== "Appointments" && "invisible")} aria-hidden={view !== "Appointments" || undefined} inert={view !== "Appointments" || undefined}>
        <SegmentedControl options={["Upcoming", "Past"] as const} value={period} onChange={changePeriod} ariaLabel="Appointment period" className="h-8 p-0.5 [&>button]:h-7 [&>button]:text-[12px]" />
      </div>
    </div>
    <section hidden={view !== "Appointments"} aria-label={`${period} appointments`} className="meetings-panel min-h-[480px]">
      <div className="mb-5 flex min-h-8 flex-wrap items-center justify-between gap-2">
        <h2 className="text-[18px] font-medium tracking-[-.015em] text-[var(--md-ink)]">{period === "Upcoming" ? "Coming up" : "Past meetings"}{" "}<span className="ms-2 text-[12px] font-normal text-[var(--md-subtle)]">{workspace ? `${meetings.length} ${meetings.length === 1 ? "appointment" : "appointments"}` : ""}</span></h2>
        <div className="flex items-center gap-2 text-[11px] text-[var(--md-subtle)]"><span className="grid size-7 place-items-center">{loading && workspace ? <DotGridLoader size="sm" /> : null}</span><Clock3 className="size-3.5" />{timeZone.replaceAll("_", " ")}</div>
      </div>
      {error ? <div role="alert" className="mb-5 flex flex-wrap items-center gap-3 rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] p-3 text-[12px] text-[var(--md-text)]"><p>{error}</p><Button variant="outline" onClick={refresh}>Try again</Button></div> : null}
      {!workspace ? <div className="grid min-h-[360px] place-items-center">{!error ? <DotGridLoader label="Loading meetings…" /> : null}</div> : meetings.length === 0 ? <div className="flex min-h-[360px] flex-col items-center justify-center px-4 text-center"><div className="relative">
          <svg viewBox="0 0 160 120" width="160" height="120" aria-hidden="true" focusable="false" className="meetings-empty-art">
            <ellipse cx="77" cy="106" rx="43" ry="4" fill="var(--md-accent)" opacity=".06" />
            <rect x="30" y="22" width="94" height="76" rx="12" fill="var(--md-surface)" stroke="var(--md-line-strong)" strokeWidth="1.5" />
            <path d="M30 45h94M51 15v15M103 15v15" fill="none" stroke="var(--md-subtle)" strokeWidth="1.5" strokeLinecap="round" />
            <g fill="var(--md-subtle)" opacity=".22">
              <circle cx="51" cy="60" r="2" /><circle cx="76" cy="60" r="2" /><circle cx="101" cy="60" r="2" />
              <circle cx="51" cy="79" r="2" /><circle cx="76" cy="79" r="2" />
            </g>
            <g className="meetings-empty-link">
              <circle cx="119" cy="83" r="23" fill="var(--md-surface)" />
              <circle cx="119" cy="83" r="21" fill="var(--md-accent-a10)" stroke="var(--md-accent-a20)" />
              <g transform="translate(107 71) rotate(-35 12 12)" fill="none" stroke="var(--md-accent)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 17H7a5 5 0 0 1 0-10h2" />
                <path d="M15 7h2a5 5 0 0 1 0 10h-2" />
                <path d="M8 12h8" />
              </g>
            </g>
          </svg>
        </div><h3 className="mt-4 text-[16px] font-medium text-[var(--md-ink)]">{period === "Upcoming" ? "No upcoming appointments" : "No past meetings"}</h3><p className="mt-2 max-w-sm text-[13px] leading-6 text-[var(--md-subtle)]">{period === "Upcoming" ? "No appointments have been booked through a booking link in this date range." : "No past appointments were booked through a booking link in this date range."}</p>{period === "Upcoming" ? <Button variant="outline" className="mt-5 rounded-[var(--md-radius-lg)]" onClick={() => navigate("/calendar/booking-links")}><Link2 className="size-3.5" />View booking links</Button> : null}</div> : <div className="divide-y divide-[var(--md-line)]">{groups.map(([key, events]) => {
        const first = new Date(events[0].startAt)
        const today = key === dateKey.format(new Date(now))
        return <section key={key} className="grid gap-3 py-5 first:pt-0 sm:grid-cols-[160px_minmax(0,1fr)] lg:grid-cols-[200px_minmax(0,1fr)]" aria-label={dayFormat.format(first)}>
          <div className="pt-3"><p className={cn("text-[12px] font-medium", today ? "text-[var(--md-accent)]" : "text-[var(--md-subtle)]")}>{today ? "Today" : new Intl.DateTimeFormat(language, { weekday: "long", timeZone }).format(first)}</p><p className="mt-1 text-[21px] font-medium tracking-[-.02em] text-[var(--md-ink)]">{new Intl.DateTimeFormat(language, { day: "numeric", month: "short", timeZone }).format(first)}</p></div>
          <div className="min-w-0 divide-y divide-[var(--md-line)]">{events.map((event) => {
            const people = event.participants?.filter((person) => !person.self && person.role !== "organiser") ?? []
            const provider = event.provider === "calendar" ? "multideck" : event.provider
            const providerLabel = event.provider === "calendar" ? event.calendarSource === "microsoft" ? "Microsoft Calendar" : "Google Calendar" : meetingProviderLabels[provider]
            const needsAttention = event.status === "sync_failed"
            const pendingChange = event.status === "sync_pending" || event.status === "provisioning"
            const spansDays = dateKey.format(new Date(event.startAt)) !== dateKey.format(new Date(event.endAt))
            return <button key={event.id} type="button" data-calendar-event="" onClick={(click) => setSelection({ event, anchor: click.currentTarget })} className="meeting-appointment-row group grid w-full min-w-0 grid-cols-[minmax(0,1fr)_20px] items-center gap-x-3 rounded-[var(--md-radius-lg)] px-3 py-4 text-start transition-colors duration-150 hover:bg-[var(--md-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent)] sm:grid-cols-[105px_minmax(0,1fr)_20px]">
              <span className="mb-2 flex items-baseline gap-1.5 text-[13px] tabular-nums text-[var(--md-ink)] sm:mb-0 sm:block sm:self-start"><time dateTime={event.startAt} className="font-medium">{timeFormat.format(new Date(event.startAt))}</time><span className="text-[11px] text-[var(--md-subtle)] sm:mt-1 sm:block">{spansDays ? `Until ${rangeFormat.format(new Date(event.endAt))}, ` : "– "}{timeFormat.format(new Date(event.endAt))}</span></span>
              <span className="col-start-1 min-w-0 sm:col-start-2 sm:row-start-1"><span className="block text-[16px] font-medium leading-6 tracking-[-.015em] text-[var(--md-ink)] [overflow-wrap:anywhere]">{event.title}</span>{people.length ? <span className="mt-1 block truncate text-[12px] text-[var(--md-text)]">{people.slice(0, 3).map((person) => person.name || person.email).join(", ")}{people.length > 3 ? ` +${people.length - 3}` : ""}</span> : null}<span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--md-subtle)]"><span className="inline-flex items-center gap-1.5"><MeetingProviderMark provider={provider} calendarSource={event.calendarSource} className="size-3.5" />{event.location || providerLabel}</span>{event.bookingLinkId ? <span>Booked via link</span> : null}{needsAttention ? <span className="text-[var(--md-red)]">Needs attention</span> : pendingChange ? <span>Updating…</span> : period === "Upcoming" && Date.parse(event.startAt) <= now ? <span className="text-[var(--md-accent)]">In progress</span> : null}</span></span>
              <ChevronRight className="col-start-2 row-start-1 size-4 text-[var(--md-subtle)] sm:col-start-3" aria-hidden="true" />
            </button>
          })}</div>
        </section>
      })}</div>}
    </section>
    <section hidden={view !== "Booking links"} aria-label="Booking links" className="meetings-panel min-h-[480px]"><BookingLinksPage navigate={navigate} embedded /></section>
    <MeetingDetailsPopover selection={selection} onClose={closeDetails} onChanged={changed} navigate={navigate} />
  </main>
}
