import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode, type RefObject } from "react"
import { AnimatePresence, motion, useReducedMotion, type Variants } from "motion/react"
import { Briefcase, Building2, CalendarDays, Check, Clock3, Copy, ExternalLink, MapPin, Palette, Pen01, Phone, TextQuote, Trash2, TriangleAlert, Users, Video, X } from "@/components/icons/hugeicons"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { MeetingAttendeeList, MeetingResponseSummary } from "@/components/multideck/meeting-attendee-status"
import { MeetingColourPicker } from "@/components/multideck/meeting-colour-picker"
import { MeetingProviderMark, meetingProviderLabels } from "@/components/multideck/meeting-provider-mark"
import { MeetingTimePicker } from "@/components/multideck/meeting-time-picker"
import { decideMeetingChangeRequest, updateExternalEvent, updateMeeting, type CalendarEvent, type MeetingChangeRequest, type MeetingColour, type MeetingDraft } from "@/lib/calendar-api"
import { useLanguage } from "@/i18n/language-provider"
import { mdEaseIn, mdEaseOut, reduceMotion } from "@/lib/motion"
import { cn } from "@/lib/utils"

export type MeetingDetailsAnchor = { event: CalendarEvent; anchor: HTMLElement }

const surface: Variants = {
  hidden: { opacity: 0, scale: 0.94, filter: "blur(8px)" },
  visible: { opacity: 1, scale: 1, filter: "blur(0px)", transition: { duration: 0.24, ease: mdEaseOut, when: "beforeChildren", staggerChildren: 0.028 } },
  exit: { opacity: 0, scale: 0.97, filter: "blur(4px)", transition: { duration: 0.14, ease: mdEaseIn } },
}
const row: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.22, ease: mdEaseOut } },
  exit: { opacity: 0, transition: { duration: 0.1 } },
}
const still: Variants = { hidden: {}, visible: {}, exit: {} }

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours} hr ${rest} min` : `${hours} ${hours === 1 ? "hr" : "hrs"}`
}

function joinHost(url: string) {
  try { const parsed = new URL(url); return `${parsed.host}${parsed.pathname === "/" ? "" : parsed.pathname}` } catch { return url }
}

function IconAction({ label, icon: Icon, onClick, tone = "default", disabled }: { label: string; icon: ComponentType<{ className?: string; strokeWidth?: number }>; onClick: () => void; tone?: "default" | "danger"; disabled?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label={label} disabled={disabled} onClick={onClick} className={cn("size-10 rounded-[calc(var(--md-radius-2xl)-4px)] text-[var(--md-subtle)] hover:text-[var(--md-ink)]", tone === "danger" && "hover:bg-[color-mix(in_srgb,var(--md-red)_8%,transparent)] hover:text-[var(--md-red)]")}>
          <Icon className="size-4" strokeWidth={1.5} />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}

function DetailRow({ icon: Icon, children, className, animate = true }: { icon: ComponentType<{ className?: string; strokeWidth?: number }>; children: ReactNode; className?: string; animate?: boolean }) {
  return (
    <motion.div variants={animate ? row : still} className={cn("grid grid-cols-[20px_minmax(0,1fr)] gap-x-3 px-5", className)}>
      <Icon className="mt-[3px] size-4 text-[var(--md-subtle)]" strokeWidth={1.5} aria-hidden="true" />
      <div className="min-w-0">{children}</div>
    </motion.div>
  )
}

function ChangeRequestRow({ meetingId, request, timeZone, onDecided }: { meetingId: string; request: MeetingChangeRequest; timeZone: string; onDecided: () => void }) {
  const { language } = useLanguage()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function decide(action: "accept" | "decline", startAt?: string) {
    setBusy(true); setError(null)
    try {
      const result = await decideMeetingChangeRequest(meetingId, request.id, { action, startAt })
      toast.success(action === "decline" ? "Alternatives declined" : result.finalising ? "Provider update requested" : "New time approved", { description: result.finalising ? "The original meeting remains confirmed until the provider accepts the change." : undefined })
      onDecided()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The reschedule request could not be decided.")
    } finally { setBusy(false) }
  }
  return (
    <motion.div variants={row} className="mx-4 rounded-[var(--md-radius-xl)] bg-[var(--md-amber-a08)] p-3">
      <p className="text-[12px] font-medium text-[var(--md-ink)]">{request.participantName} asked to reschedule</p>
      <div className="mt-2 grid gap-1">
        {request.proposedTimes.map((time) => (
          <button key={time.startAt} type="button" disabled={busy} onClick={() => void decide("accept", time.startAt)} className="flex h-9 items-center justify-between gap-3 rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] px-3 text-start text-[12px] text-[var(--md-text)] shadow-[var(--md-shadow-line)] transition-colors hover:bg-[var(--md-hover)] disabled:opacity-60">
            <span>{new Intl.DateTimeFormat(language, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone }).format(new Date(time.startAt))}</span>
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--md-accent)]"><Check className="size-3.5" strokeWidth={2} />Approve</span>
          </button>
        ))}
      </div>
      {error ? <p role="alert" className="mt-2 text-[11px] text-[var(--md-red)]">{error}</p> : null}
      <button type="button" disabled={busy} onClick={() => void decide("decline")} className="mt-2 h-7 rounded-full px-2 text-[11px] font-medium text-[var(--md-subtle)] transition-colors hover:bg-[var(--md-surface)] hover:text-[var(--md-red)]">Keep the original time</button>
    </motion.div>
  )
}

function MeetingDetailsCard({ event, onClose, onChanged, navigate }: { event: CalendarEvent; onClose: () => void; onChanged: () => void; navigate: (path: string) => void }) {
  const { language } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const zone = event.timeZone || "Europe/London"
  const [mode, setMode] = useState<"view" | "reschedule" | "cancel">("view")
  const [times, setTimes] = useState({ startAt: event.startAt, endAt: event.endAt })
  const [saving, setSaving] = useState(false)
  const [colour, setColour] = useState<MeetingColour>(event.colour ?? "teal")
  const [details, setDetails] = useState({ title: event.title, agenda: event.agenda ?? "", location: event.location ?? "" })
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => { setTimes({ startAt: event.startAt, endAt: event.endAt }); setColour(event.colour ?? "teal"); setMode("view"); setError(null) }, [event])

  const pending = event.status === "sync_pending" || event.status === "provisioning"
  // Mirrored Google/Microsoft events: the provider owns them, so edits are
  // written there first and only the title and time can change from here.
  const external = event.provider === "calendar"
  const externalSource = event.calendarSource === "microsoft" ? "Microsoft Calendar" : "Google Calendar"
  const provider = event.provider === "calendar" ? "multideck" : event.provider
  const durationMinutes = Math.round((Date.parse(event.endAt) - Date.parse(event.startAt)) / 60_000)
  const dateLine = useMemo(() => {
    const day = new Intl.DateTimeFormat(language, { weekday: "long", day: "numeric", month: "long", timeZone: zone }).format(new Date(event.startAt))
    const time = new Intl.DateTimeFormat(language, { hour: "2-digit", minute: "2-digit", timeZone: zone })
    return { day, range: `${time.format(new Date(event.startAt))} – ${time.format(new Date(event.endAt))}` }
  }, [event.endAt, event.startAt, language, zone])
  const participants = event.participants ?? []
  const linked = event.linkedRecord
  const linkedRoute = linked ? (linked.type === "lead" ? `/crm/leads/${linked.id}` : linked.type === "account" ? `/crm/accounts/${linked.id}` : `/bookings/${linked.id}`) : null
  const LinkedIcon = linked?.type === "job" ? Briefcase : Building2

  async function copyJoinLink() {
    if (!event.joinUrl) return
    try { await navigator.clipboard.writeText(event.joinUrl); setCopied(true); window.setTimeout(() => setCopied(false), 1600) } catch { toast.error("The link could not be copied.") }
  }

  async function reschedule() {
    if (saving) return
    if (!external && !details.title.trim()) { setError("Give the meeting a title."); return }
    if (Date.parse(times.endAt) <= Date.parse(times.startAt)) { setError("The meeting must finish after it starts."); return }
    if (external) {
      const patch: Parameters<typeof updateExternalEvent>[1] = {}
      if (!event.private && details.title.trim() && details.title.trim() !== event.title) patch.title = details.title.trim()
      if (times.startAt !== event.startAt || times.endAt !== event.endAt) Object.assign(patch, times, { timeZone: zone })
      if (!Object.keys(patch).length) { setMode("view"); return }
      setSaving(true); setError(null)
      try {
        await updateExternalEvent(event.id, patch)
        toast.success("Event updated", { description: `${externalSource} has the change and its guests are told.` })
        onChanged(); onClose()
      } catch (reason) { setError(reason instanceof Error ? reason.message : "The event could not be changed.") } finally { setSaving(false) }
      return
    }
    // Send only changed fields: a colour-only edit must not notify attendees.
    const patch: Partial<MeetingDraft> = {}
    if (details.title.trim() !== event.title) patch.title = details.title.trim()
    if (details.agenda !== (event.agenda ?? "")) patch.agenda = details.agenda
    if (details.location !== (event.location ?? "")) patch.location = details.location
    if (colour !== (event.colour ?? "teal")) patch.colour = colour
    if (times.startAt !== event.startAt || times.endAt !== event.endAt) Object.assign(patch, times, { timeZone: zone })
    if (!Object.keys(patch).length) { setMode("view"); return }
    setSaving(true); setError(null)
    try {
      const result = await updateMeeting(event.id, patch)
      toast.success(result.status === "sync_pending" ? "Provider update requested" : "Meeting updated", { description: Object.keys(patch).every((key) => key === "colour") ? "Calendar appearance saved. Attendees were not notified." : result.status === "sync_pending" ? "The previous confirmed details stay in place until the provider accepts the change." : "Attendees will receive the updated details." })
      onChanged(); onClose()
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The meeting could not be rescheduled.") } finally { setSaving(false) }
  }

  async function cancel() {
    setSaving(true); setError(null)
    if (external) {
      try {
        await updateExternalEvent(event.id, { action: "cancel" })
        toast.success("Event deleted", { description: `It was removed from ${externalSource}.` })
        onChanged(); onClose()
      } catch (reason) { setError(reason instanceof Error ? reason.message : "The event could not be deleted.") } finally { setSaving(false) }
      return
    }
    try {
      const result = await updateMeeting(event.id, { action: "cancel" })
      toast.success(result.status === "sync_pending" ? "Cancellation sent to the provider" : "Meeting cancelled", { description: result.status === "sync_pending" ? "The meeting remains confirmed until the provider accepts the cancellation." : "Attendees will receive the cancellation." })
      onChanged(); onClose()
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The meeting could not be cancelled.") } finally { setSaving(false) }
  }

  return (
    <>
      <div data-slot="meeting-details-surface" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[var(--md-radius-2xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-popover)] max-h-[min(80dvh,640px,var(--radix-popover-content-available-height))]">
      <motion.div variants={row} className="flex shrink-0 items-start gap-3 px-5 pb-4 pt-5">
        <MeetingProviderMark provider={provider} className="mt-0.5 size-6 shrink-0" />
        <div className="min-w-0">
          {mode === "reschedule" && !event.private ? <Input aria-label="Meeting title" value={details.title} disabled={saving} onChange={(e) => setDetails((value) => ({ ...value, title: e.target.value }))} /> : <h2 className="text-[17px] font-medium leading-6 tracking-[-.01em] text-[var(--md-ink)]">{event.private ? "Busy" : event.title}</h2>}
          {mode !== "reschedule" ? (
            <p className="mt-0.5 text-[12.5px] text-[var(--md-text)]">
              {dateLine.day}<span className="mx-1.5 text-[var(--md-subtle)]">·</span>{dateLine.range}<span className="mx-1.5 text-[var(--md-subtle)]">·</span><span className="text-[var(--md-subtle)]">{formatDuration(durationMinutes)}</span>
            </p>
          ) : null}
        </div>
      </motion.div>

      {mode === "reschedule" ? (
        <motion.div variants={row} className="shrink-0 px-3 pb-4 sm:px-5">
          <MeetingTimePicker startAt={times.startAt} endAt={times.endAt} timeZone={zone} onChange={(next) => { setTimes(next); setError(null) }} />
        </motion.div>
      ) : null}

      <div className="grid min-h-0 flex-1 content-start gap-3 overflow-y-auto pb-4">
        {event.canEdit && mode === "reschedule" && !external ? (
          <>
          <DetailRow icon={Palette}>
            <MeetingColourPicker value={colour} onChange={setColour} disabled={saving} compact />
          </DetailRow>
          <DetailRow icon={TextQuote}><Textarea aria-label="Agenda" placeholder="Add an agenda" value={details.agenda} disabled={saving} onChange={(e) => setDetails((value) => ({ ...value, agenda: e.target.value }))} /></DetailRow>
          <DetailRow icon={MapPin}><Input aria-label="Location" placeholder="Add a location" value={details.location} disabled={saving} onChange={(e) => setDetails((value) => ({ ...value, location: e.target.value }))} /></DetailRow>
          </>
        ) : null}

        {external ? (
          <DetailRow icon={CalendarDays}>
            <p className="text-[12.5px] text-[var(--md-text)]">Synced from {externalSource}</p>
            <p className="mt-0.5 text-[11.5px] text-[var(--md-subtle)]">{event.private ? "Details are private. You can still move or delete it." : "Changes made here are written back to the provider."}</p>
          </DetailRow>
        ) : null}

        {event.joinUrl ? (
          <DetailRow icon={Video}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <a href={event.joinUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--md-accent)] hover:underline">Join with {meetingProviderLabels[provider]}<ExternalLink className="size-3" strokeWidth={1.6} aria-hidden="true" /></a>
                <p className="mt-0.5 truncate text-[11.5px] text-[var(--md-subtle)]" dir="ltr">{joinHost(event.joinUrl)}</p>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" aria-label={copied ? "Link copied" : "Copy join link"} onClick={() => void copyJoinLink()} className="-mt-1 size-8 shrink-0 rounded-[var(--md-radius-md)] text-[var(--md-subtle)] hover:text-[var(--md-ink)]">
                    {copied ? <Check className="size-4 text-[var(--md-accent)]" strokeWidth={2} /> : <Copy className="size-4" strokeWidth={1.5} />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{copied ? "Copied" : "Copy link"}</TooltipContent>
              </Tooltip>
            </div>
          </DetailRow>
        ) : null}

        {event.location && (event.provider === "phone" || event.provider === "in_person") ? (
          <DetailRow icon={event.provider === "phone" ? Phone : MapPin}>
            <p className="text-[13px] text-[var(--md-ink)]" dir={event.provider === "phone" ? "ltr" : undefined}>{event.location}</p>
            <p className="mt-0.5 text-[11.5px] text-[var(--md-subtle)]">{event.provider === "phone" ? "Phone call" : "In person"}</p>
          </DetailRow>
        ) : null}

        {participants.length ? (
          <DetailRow icon={Users}>
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[13px] text-[var(--md-ink)]">{participants.length} {participants.length === 1 ? "attendee" : "attendees"}</p>
              <MeetingResponseSummary participants={participants} />
            </div>
            <MeetingAttendeeList participants={participants} maxVisible={4} filterable={participants.length > 6} className="-mx-2 mt-1.5" />
          </DetailRow>
        ) : null}

        {event.agenda && mode !== "reschedule" ? (
          <DetailRow icon={TextQuote}>
            <p className="line-clamp-4 whitespace-pre-line text-[12.5px] leading-5 text-[var(--md-text)]">{event.agenda}</p>
          </DetailRow>
        ) : null}

        {linked && linkedRoute ? (
          <DetailRow icon={LinkedIcon}>
            <button type="button" onClick={() => { onClose(); navigate(linkedRoute) }} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--md-accent)] hover:underline">
              Open {linked.type === "job" ? "booking" : linked.type}<ExternalLink className="size-3" strokeWidth={1.6} aria-hidden="true" />
            </button>
          </DetailRow>
        ) : null}

        {pending || event.status === "sync_failed" ? (
          <DetailRow icon={pending ? Clock3 : TriangleAlert} className={pending ? "text-[var(--md-amber-strong)]" : "text-[var(--md-red)]"}>
            <p className="text-[12px] leading-5">
              {event.status === "provisioning" ? "The provider is creating the join link and invitations." : event.status === "sync_pending" ? "A provider change is in progress. The last confirmed details stay in place until it succeeds." : event.syncError || "The provider could not complete the last change. The previous confirmed details were kept."}
            </p>
          </DetailRow>
        ) : null}

        {event.changeRequests?.map((request) => <ChangeRequestRow key={request.id} meetingId={event.id} request={request} timeZone={zone} onDecided={() => { onChanged(); onClose() }} />)}
      </div>

      <AnimatePresence initial={false}>
        {mode !== "view" || error ? (
          <motion.div key={mode} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.1 } }} transition={reduceMotion(Boolean(shouldReduceMotion), { duration: 0.2, ease: mdEaseOut })} className="shrink-0 shadow-[var(--md-stroke-top)]">
            <div className={cn("flex flex-wrap items-center gap-2 px-4 py-3", mode === "cancel" && "justify-between")}>
              {error ? <p role="alert" className="flex w-full items-center gap-2 text-[11.5px] text-[var(--md-red)]"><TriangleAlert className="size-3.5 shrink-0" />{error}</p> : null}
              {mode === "cancel" ? (
                <>
                  <p className="text-[12px] text-[var(--md-text)]">{external ? `Delete this event from ${externalSource}? Its guests will be told.` : "Cancel this meeting? Attendees will be told."}</p>
                  <div className="flex gap-1.5">
                    <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => setMode("view")} className="h-8 rounded-[var(--md-radius-md)]">Keep</Button>
                    <Button type="button" size="sm" disabled={saving} onClick={() => void cancel()} className="h-8 rounded-[var(--md-radius-md)] bg-[var(--md-red)] text-white hover:bg-[color-mix(in_srgb,var(--md-red),black_10%)]">{saving ? (external ? "Deleting…" : "Cancelling…") : external ? "Delete event" : "Cancel meeting"}</Button>
                  </div>
                </>
              ) : mode === "reschedule" ? (
                <div className="flex w-full justify-end gap-1.5">
                  <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => { setMode("view"); setError(null) }} className="h-8 rounded-[var(--md-radius-md)]">Discard changes</Button>
                  <Button type="button" size="sm" disabled={saving} onClick={() => void reschedule()} className="h-8 rounded-[var(--md-radius-md)]">{saving ? "Updating…" : "Save changes"}</Button>
                </div>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      </div>

      <motion.div variants={row} role="group" aria-label="Event actions" className="flex shrink-0 flex-col gap-0.5 self-start rounded-[var(--md-radius-2xl)] bg-[var(--md-surface)] p-1 shadow-[var(--md-shadow-popover)]">
        {event.canEdit && !pending && mode === "view" ? (
          <>
            <IconAction label="Edit event" icon={Pen01} onClick={() => { setDetails({ title: event.title, agenda: event.agenda ?? "", location: event.location ?? "" }); setColour(event.colour ?? "teal"); setTimes({ startAt: event.startAt, endAt: event.endAt }); setError(null); setMode("reschedule") }} />
            <IconAction label={external ? "Delete event" : "Cancel meeting"} icon={Trash2} tone="danger" onClick={() => setMode("cancel")} />
          </>
        ) : null}
        <IconAction label="Close" icon={X} disabled={saving} onClick={onClose} />
      </motion.div>
    </>
  )
}

/**
 * Meeting details anchored beside the event that was clicked, in the manner of
 * Google Calendar's event card: a soft surface that blooms out of the event,
 * one calm row per fact, and reschedule or cancel handled in place without a
 * second screen. The anchor is the clicked event element so the card follows
 * it while the week scrolls and flips sides when it runs out of room. A hairline
 * stroke and a soft shadow lift it off busy grids without it feeling heavy.
 */
export function MeetingDetailsPopover({ selection, onClose, onChanged, navigate }: {
  selection: MeetingDetailsAnchor | null
  onClose: () => void
  onChanged: () => void
  navigate: (path: string) => void
}) {
  const shouldReduceMotion = useReducedMotion()
  const cardRef = useRef<HTMLDivElement | null>(null)
  const virtualRef = useMemo(() => ({ current: selection?.anchor ?? null }), [selection?.anchor])
  return (
    <AnimatePresence>
      {selection ? (
        <Popover key={selection.event.id} open onOpenChange={(open) => { if (!open) onClose() }}>
          <PopoverAnchor virtualRef={virtualRef as RefObject<HTMLElement>} />
          <PopoverContent
            asChild
            side="right"
            align="start"
            sideOffset={10}
            collisionPadding={16}
            onOpenAutoFocus={(event) => { event.preventDefault(); cardRef.current?.focus({ preventScroll: true }) }}
            onCloseAutoFocus={(event) => { event.preventDefault(); if (selection.anchor.isConnected) selection.anchor.focus({ preventScroll: true }) }}
            className="z-[120] w-[min(calc(100vw_-_32px),456px)] flex-row items-start gap-2 rounded-none border-0 bg-transparent p-0 text-[var(--md-ink)] shadow-none! data-open:animate-none data-closed:animate-none"
          >
            <motion.div
              ref={cardRef}
              role="dialog"
              tabIndex={-1}
              aria-label={`${selection.event.private ? "Busy" : selection.event.title} details`}
              variants={shouldReduceMotion ? still : surface}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="flex outline-none"
            >
              <MeetingDetailsCard event={selection.event} onClose={onClose} onChanged={onChanged} navigate={navigate} />
            </motion.div>
          </PopoverContent>
        </Popover>
      ) : null}
    </AnimatePresence>
  )
}
