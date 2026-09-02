import { useCallback, useEffect, useMemo, useState } from "react"
import { TriangleAlert } from "@/components/icons/hugeicons"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { CalendarView } from "@/components/multideck/calendar-view"
import { DotGridLoader } from "@/components/multideck/dot-grid-loader"
import { MeetingDetailsPopover, type MeetingDetailsAnchor } from "@/components/multideck/meeting-details-popover"
import { CALENDAR_CHANGED_EVENT } from "@/components/multideck/meeting-dialog"
import { getCalendarWorkspace, updateCalendarEvent, type CalendarEvent, type CalendarWorkspace } from "@/lib/calendar-api"
import { openMeetingComposer } from "@/lib/meeting-composer-events"
import { subscribeTopBarAction, topBarActionEvents } from "@/lib/top-bar-action-events"
import { toast } from "sonner"

const initialRange = () => ({ start: new Date(Date.now() - 7 * 86_400_000).toISOString(), end: new Date(Date.now() + 35 * 86_400_000).toISOString() })
type PendingCalendarMove = { event: CalendarEvent; startAt: string; endAt: string }

function externalSourceLabel(event: CalendarEvent) {
  return event.calendarSource === "microsoft" ? "Microsoft Calendar" : "Google Calendar"
}

export function CalendarPage({ navigate }: { navigate: (path: string) => void }) {
  const [range, setRange] = useState(initialRange)
  const [workspace, setWorkspace] = useState<CalendarWorkspace | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [selected, setSelected] = useState<MeetingDetailsAnchor | null>(null)
  const [pendingMove, setPendingMove] = useState<PendingCalendarMove | null>(null)
  const [moving, setMoving] = useState(false)
  const [moveError, setMoveError] = useState<string | null>(null)
  const load = useCallback(() => setReload((value) => value + 1), [])
  const closeDetails = useCallback(() => setSelected(null), [])
  useEffect(() => subscribeTopBarAction(topBarActionEvents.createCalendarMeeting, () => openMeetingComposer({ source: "calendar" })), [])
  useEffect(() => { const listener = () => load(); window.addEventListener(CALENDAR_CHANGED_EVENT, listener); return () => window.removeEventListener(CALENDAR_CHANGED_EVENT, listener) }, [load])
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(null)
    void getCalendarWorkspace(range.start, range.end, controller.signal).then(setWorkspace).catch((reason) => { if (reason instanceof DOMException && reason.name === "AbortError") return; setError(reason instanceof Error ? reason.message : "Calendar could not be loaded.") }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [range.end, range.start, reload])
  const events = useMemo(() => [...(workspace?.meetings ?? []), ...(workspace?.externalEvents ?? [])], [workspace])
  const hasPendingMeetings = workspace?.meetings.some((meeting) => meeting.status === "provisioning" || meeting.status === "sync_pending") ?? false
  useEffect(() => {
    if (!hasPendingMeetings) return
    // Refresh only while an operator-visible provider action is in flight.
    const timer = window.setInterval(load, 5_000)
    return () => window.clearInterval(timer)
  }, [hasPendingMeetings, load])
  // Keep the open card in step with the freshest copy of its meeting after a reload.
  useEffect(() => {
    if (!selected) return
    const fresh = events.find((event) => event.id === selected.event.id)
    if (fresh && fresh !== selected.event) setSelected({ event: fresh, anchor: selected.anchor })
  }, [events, selected])
  async function confirmMove() {
    if (!pendingMove || moving) return
    setMoving(true); setMoveError(null)
    try {
      const result = await updateCalendarEvent(pendingMove.event, { startAt: pendingMove.startAt, endAt: pendingMove.endAt, timeZone: pendingMove.event.timeZone })
      const external = pendingMove.event.provider === "calendar"
      toast.success(external ? "Event moved" : result.status === "sync_pending" ? "Provider update requested" : "Meeting rescheduled", { description: external ? `${externalSourceLabel(pendingMove.event)} has the new time.` : result.status === "sync_pending" ? "The current time remains confirmed until the provider accepts the change." : "Attendees will receive the updated time." })
      setPendingMove(null); load()
    } catch (reason) {
      setMoveError(reason instanceof Error ? reason.message : "The meeting could not be rescheduled.")
    } finally { setMoving(false) }
  }
  const moveZone = pendingMove?.event.timeZone || workspace?.timeZone || "Europe/London"
  const moveTime = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: moveZone })
  const moveDate = pendingMove ? `${new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: moveZone }).format(new Date(pendingMove.startAt))}, ${moveTime.format(new Date(pendingMove.startAt))}–${moveTime.format(new Date(pendingMove.endAt))}` : ""
  const moveExternal = pendingMove?.event.provider === "calendar"
  return <main className="grid gap-[var(--md-page-stack-gap)]">
    <h1 className="sr-only">Calendar</h1>
    {loading && !workspace ? <div className="grid min-h-[520px] place-items-center rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)]"><DotGridLoader label="Loading Calendar…" /></div> : error && !workspace ? <div role="alert" className="grid min-h-72 place-items-center rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-8 text-center shadow-[var(--md-shadow-line)]"><div><TriangleAlert className="mx-auto size-5 text-[var(--md-red)]" /><p className="mt-3 text-[13px] font-medium text-[var(--md-ink)]">Calendar could not be loaded</p><p className="mt-1 text-[12px] text-[var(--md-subtle)]">{error}</p><Button onClick={load} className="mt-4">Try again</Button></div></div> : workspace ? <CalendarView events={events} ribbons={workspace.ribbons} timeZone={workspace.timeZone} onRangeChange={(next) => setRange((current) => current.start === next.start && current.end === next.end ? current : next)} onOpenEvent={(event, anchor) => setSelected({ event, anchor })} onCreateAt={(startAt, endAt) => openMeetingComposer({ startAt, endAt, source: "calendar" })} onReviewMove={(event, startAt, endAt) => { setSelected(null); setMoveError(null); setPendingMove({ event, startAt, endAt }) }} navigate={navigate} /> : null}
    <MeetingDetailsPopover selection={selected} onClose={closeDetails} onChanged={load} navigate={navigate} />
    <Dialog open={Boolean(pendingMove)} onOpenChange={(open) => { if (!open && !moving) { setPendingMove(null); setMoveError(null) } }}><DialogContent className="rounded-[var(--md-radius-xl)] sm:max-w-[430px]"><DialogHeader><DialogTitle>{moveExternal ? "Move this event?" : "Review new meeting time"}</DialogTitle><DialogDescription>{moveExternal && pendingMove ? `The change is written straight to ${externalSourceLabel(pendingMove.event)} and its guests are told. Nothing changes until you confirm.` : "Moving a meeting affects attendees. Nothing changes until you confirm."}</DialogDescription></DialogHeader>{pendingMove ? <div className="rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-4 py-3"><p className="text-[12px] font-medium text-[var(--md-ink)]">{pendingMove.event.private ? "Busy" : pendingMove.event.title}</p><p className="mt-1 text-[12px] text-[var(--md-text)]">Move to {moveDate}</p><p className="mt-1 text-[11px] text-[var(--md-subtle)]">{moveZone}</p></div> : null}{moveError ? <p role="alert" className="text-[12px] text-[var(--md-red)]">{moveError}</p> : null}<DialogFooter><Button type="button" variant="ghost" disabled={moving} onClick={() => { setPendingMove(null); setMoveError(null) }}>Keep current time</Button><Button type="button" disabled={moving} onClick={() => void confirmMove()}>{moving ? "Updating…" : moveExternal ? "Move event" : "Confirm new time"}</Button></DialogFooter></DialogContent></Dialog>
  </main>
}
