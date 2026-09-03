import { useEffect, useRef, useState, type ComponentType } from "react"
import { Bell, CalendarDays, Check, ChevronDown, Clock3, MapPin, Palette, Phone, TextQuote, TriangleAlert, Users, Video } from "@/components/icons/hugeicons"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { DotGridLoader } from "@/components/multideck/dot-grid-loader"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { MeetingAttendeePicker } from "@/components/multideck/meeting-attendee-picker"
import { MeetingColourPicker } from "@/components/multideck/meeting-colour-picker"
import { meetingProviderLabels } from "@/components/multideck/meeting-provider-mark"
import { MeetingProviderSelect, isMeetingProviderReady, isVideoMeetingProvider } from "@/components/multideck/meeting-provider-select"
import { MeetingTimePicker } from "@/components/multideck/meeting-time-picker"
import {
  createMeeting,
  defaultMeetingProviderForInbox,
  getCalendarConnections,
  getMeetingCrmContext,
  isLocalCalendarPreview,
  type CalendarConnection,
  type CalendarProvider,
  type MeetingDraft,
} from "@/lib/calendar-api"
import { listMailboxes } from "@/lib/inbox-api"
import { resolveDefaultInboxProvider, type Mailbox } from "@/lib/inbox-contract"
import { inboxProviderPreferenceChangedEvent, loadDefaultInboxProvider } from "@/lib/inbox-provider-preference"
import { subscribeMeetingComposer, type MeetingComposerContext } from "@/lib/meeting-composer-events"
import { getSupabaseSession } from "@/lib/supabase"
import { invalidateCachedCrmResources, readCachedCrmResource } from "@/lib/crm-read-cache"
import { cn } from "@/lib/utils"

export const CALENDAR_CHANGED_EVENT = "multideck:calendar:changed"

const FALLBACK_PROVIDER: CalendarProvider = "multideck"

function nextHalfHour() {
  const date = new Date()
  date.setSeconds(0, 0)
  date.setMinutes(date.getMinutes() < 30 ? 30 : 60)
  return date
}

function defaultDraft(context: MeetingComposerContext, provider: CalendarProvider): MeetingDraft {
  const start = context.startAt ? new Date(context.startAt) : nextHalfHour()
  const end = context.endAt ? new Date(context.endAt) : new Date(start.getTime() + 30 * 60_000)
  return {
    title: context.title || (context.linkedRecord?.name ? `Meeting with ${context.linkedRecord.name}` : ""),
    agenda: "",
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/London",
    provider,
    colour: "teal",
    location: "",
    leadId: context.linkedRecord?.type === "lead" ? context.linkedRecord.id : null,
    accountId: context.linkedRecord?.type === "account" ? context.linkedRecord.id : null,
    jobId: context.linkedRecord?.type === "job" ? context.linkedRecord.id : null,
    allowAttendeeReschedule: true,
    reminders: [1440, 60],
    attendees: (context.attendees ?? []).map((attendee) => ({ ...attendee, external: true })),
  }
}

/**
 * The join-link platform a fresh meeting starts on follows the operator's default
 * inbox: Gmail → Google Meet, Outlook → Microsoft Teams, nothing chosen → Teams.
 * Shared briefly for this account and refreshed when the inbox preference changes.
 */
async function resolveDefaultProvider(): Promise<CalendarProvider> {
  if (isLocalCalendarPreview()) return "multideck"
  const session = await getSupabaseSession()
  if (!session?.user) return FALLBACK_PROVIDER
  return readCachedCrmResource(session.user.id, "calendar-default-provider", () =>
    Promise.all([loadDefaultInboxProvider().catch(() => null), listMailboxes().catch((): Mailbox[] => [])])
      .then(([preferred, mailboxes]) => defaultMeetingProviderForInbox(resolveDefaultInboxProvider(mailboxes, preferred))),
  )
}

function Row({ icon: Icon, label, children, align = "center" }: { icon: ComponentType<{ className?: string; strokeWidth?: number }>; label: string; children: React.ReactNode; align?: "center" | "start" }) {
  return (
    <div className="grid grid-cols-[20px_minmax(0,1fr)] gap-x-3 py-2">
      <span className={cn("grid h-9 place-items-center text-[var(--md-subtle)]", align === "start" && "h-auto pt-2.5")} title={label} aria-hidden="true"><Icon className="size-4" strokeWidth={1.5} /></span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

export function MeetingDialogHost({ navigate }: { navigate: (path: string) => void }) {
  const [context, setContext] = useState<MeetingComposerContext | null>(null)
  const [draft, setDraft] = useState<MeetingDraft>(() => defaultDraft({}, FALLBACK_PROVIDER))
  const [connections, setConnections] = useState<CalendarConnection[]>([])
  const [loadingContext, setLoadingContext] = useState(false)
  const [moreOptions, setMoreOptions] = useState(false)
  const [saving, setSaving] = useState(false)
  const [stage, setStage] = useState("Schedule meeting")
  const [error, setError] = useState<string | null>(null)
  const providerTouched = useRef(false)
  const titleRef = useRef<HTMLInputElement | null>(null)
  const session = useRef(0)

  useEffect(() => {
    const reset = () => invalidateCachedCrmResources(null, ["calendar-default-provider"])
    window.addEventListener(inboxProviderPreferenceChangedEvent, reset)
    return () => window.removeEventListener(inboxProviderPreferenceChangedEvent, reset)
  }, [])

  useEffect(() => subscribeMeetingComposer((next) => {
    const current = session.current + 1
    session.current = current
    providerTouched.current = false
    setContext(next)
    setDraft(defaultDraft(next, isLocalCalendarPreview() ? "multideck" : FALLBACK_PROVIDER))
    setError(null)
    setMoreOptions(false)
    setStage("Schedule meeting")
  }), [])

  useEffect(() => {
    if (!context) return
    const controller = new AbortController()
    const current = session.current
    void Promise.all([
      getCalendarConnections(controller.signal),
      resolveDefaultProvider(),
    ])
      .then(([providerConnections, preferredProvider]) => {
        if (controller.signal.aborted || session.current !== current) return
        setConnections(providerConnections)
        if (providerTouched.current) return
        setDraft((value): MeetingDraft => ({
          ...value,
          provider: isMeetingProviderReady(preferredProvider, providerConnections) ? preferredProvider : "multideck",
        }))
      })
      .catch(() => {
        if (controller.signal.aborted || session.current !== current) return
        setConnections([])
        if (!providerTouched.current) setDraft((value): MeetingDraft => ({ ...value, provider: "multideck" }))
      })
    return () => controller.abort()
  }, [context])

  useEffect(() => {
    if (!context?.linkedRecord || !["lead", "account"].includes(context.linkedRecord.type)) return
    let cancelled = false
    setLoadingContext(true)
    void getMeetingCrmContext(context.linkedRecord.type as "lead" | "account", context.linkedRecord.id)
      .then((crm) => {
        if (cancelled) return
        setDraft((current) => ({ ...current, title: current.title || `Meeting with ${crm.name}`, attendees: current.attendees.length ? current.attendees : crm.attendees.map((attendee) => ({ ...attendee, external: true })) }))
      })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "CRM details could not be loaded.") })
      .finally(() => { if (!cancelled) setLoadingContext(false) })
    return () => { cancelled = true }
  }, [context?.linkedRecord])

  function close() {
    if (saving) return
    setContext(null)
  }

  function update(patch: Partial<MeetingDraft>) {
    setDraft((current) => ({ ...current, ...patch }))
    // A validation message describes the draft as it was; once the operator
    // changes anything it no longer applies.
    setError(null)
  }

  async function submit() {
    if (saving) return
    setError(null)
    if (!draft.title.trim()) { setError("Give the meeting a title."); titleRef.current?.focus(); return }
    if (Date.parse(draft.endAt) <= Date.parse(draft.startAt)) { setError("The meeting must finish after it starts."); return }
    if (Date.parse(draft.startAt) < Date.now() - 60_000) { setError("Choose a time that has not passed yet."); return }
    if (!isMeetingProviderReady(draft.provider, connections)) { setError(`${meetingProviderLabels[draft.provider]} needs to be connected before it can create a join link. Choose another way to meet or connect it in Settings.`); return }
    setSaving(true)
    setStage(isVideoMeetingProvider(draft.provider) ? `Creating ${meetingProviderLabels[draft.provider]} link…` : "Scheduling…")
    try {
      const result = await createMeeting(draft, context?.source === "crm" ? "crm" : "calendar")
      setStage(result.status === "provisioning" ? "Sending invitations…" : "Sending confirmations…")
      window.dispatchEvent(new Event(CALENDAR_CHANGED_EVENT))
      toast.success(result.status === "provisioning" ? "Meeting is being finalised" : "Meeting scheduled", {
        description: result.status === "provisioning" ? "The provider is creating the join link. Calendar will update when it is confirmed." : draft.attendees.length ? `${draft.attendees.length === 1 ? "Your attendee has" : `${draft.attendees.length} attendees have`} been invited.` : "It now appears in Calendar.",
      })
      setContext(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The meeting could not be scheduled.")
      setStage("Schedule meeting")
    } finally {
      setSaving(false)
    }
  }

  const needsLocation = draft.provider === "phone" || draft.provider === "in_person"

  return (
    <Dialog open={Boolean(context)} onOpenChange={(open) => { if (!open) close() }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-[var(--md-radius-2xl)] bg-[var(--md-surface)] p-0 sm:max-w-[620px]" onEscapeKeyDown={(event) => { if (saving) event.preventDefault() }}>
        <DialogTitle className="sr-only">New meeting</DialogTitle>
        <DialogDescription className="sr-only">Choose the meeting details, attendees and how to join.</DialogDescription>
        <form className="flex min-h-0 flex-col" aria-label="Schedule meeting" onSubmit={(event) => { event.preventDefault(); void submit() }}>
          <div className="flex flex-1 flex-col">
          <div className="px-5 pt-5 pb-1">
            <div className="flex items-center gap-2 pe-10 text-[11px] font-medium uppercase tracking-[.08em] text-[var(--md-subtle)]">
              <CalendarDays className="size-3.5 text-[var(--md-accent)]" strokeWidth={1.5} aria-hidden="true" />
              {context?.source === "crm" ? "CRM meeting" : "New meeting"}
              {context?.linkedRecord ? <span className="inline-flex items-center gap-1 rounded-full bg-[var(--md-accent-a10)] px-2 py-0.5 text-[10.5px] normal-case tracking-normal text-[var(--md-selected-text)]"><Check className="size-3" strokeWidth={2} aria-hidden="true" />Linked to {context.linkedRecord.name || context.linkedRecord.type}</span> : null}
            </div>
            <input
              ref={titleRef}
              value={draft.title}
              autoFocus
              aria-label="Meeting title"
              placeholder="Add a title"
              onChange={(event) => update({ title: event.target.value })}
              className="mt-2 w-full bg-transparent py-1.5 text-[22px] font-medium tracking-[-.015em] text-[var(--md-ink)] outline-none transition-[box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] placeholder:text-[var(--md-subtle)] shadow-[inset_0_-1px_0_var(--md-line-strong)] focus:shadow-[inset_0_-1.5px_0_var(--md-accent)]"
            />
          </div>

          <div className="grid flex-1 content-start px-5 pt-3 pb-3">
            <Row icon={Clock3} label="When" align="start">
              <MeetingTimePicker startAt={draft.startAt} endAt={draft.endAt} timeZone={draft.timeZone} onChange={update} onTimeZoneChange={(timeZone) => update({ timeZone })} />
            </Row>
            <Row icon={Video} label="How attendees join">
              <MeetingProviderSelect
                value={draft.provider}
                connections={connections}
                disabled={saving}
                onChange={(provider) => { providerTouched.current = true; update({ provider, location: "" }) }}
                onConnect={() => { setContext(null); navigate("/settings?tab=integrations") }}
              />
            </Row>
            <Row icon={Palette} label="Event colour">
              <MeetingColourPicker value={draft.colour} onChange={(colour) => update({ colour })} disabled={saving} compact />
            </Row>
            {needsLocation ? (
              <Row icon={draft.provider === "phone" ? Phone : MapPin} label={draft.provider === "phone" ? "Phone number" : "Location"}>
                <Input value={draft.location ?? ""} inputMode={draft.provider === "phone" ? "tel" : undefined} aria-label={draft.provider === "phone" ? "Phone number" : "Location"} placeholder={draft.provider === "phone" ? "Number attendees should call" : "Address or meeting room"} onChange={(event) => update({ location: event.target.value })} className="h-9 rounded-[var(--md-radius-lg)] text-[13px]" />
              </Row>
            ) : null}
            <Row icon={Users} label="Attendees" align="start">
              {loadingContext ? <div className="grid h-9 place-items-center"><DotGridLoader label="Loading CRM contacts…" /></div> : (
                <MeetingAttendeePicker value={draft.attendees} onChange={(attendees) => update({ attendees })} disabled={saving} />
              )}
            </Row>
            <Row icon={TextQuote} label="Agenda" align="start">
              <Textarea value={draft.agenda ?? ""} aria-label="Agenda" placeholder="Add an agenda or what to prepare" onChange={(event) => update({ agenda: event.target.value })} className="min-h-9 rounded-[var(--md-radius-lg)] py-2 text-[13px] leading-5" rows={1} />
            </Row>
            <Row icon={Bell} label="Reminders and options" align="start">
              <button type="button" aria-expanded={moreOptions} onClick={() => setMoreOptions((value) => !value)} className="inline-flex h-9 items-center gap-1 text-[12.5px] font-medium text-[var(--md-text)] transition-colors hover:text-[var(--md-ink)]">
                {moreOptions ? "Fewer options" : "Reminders and options"}
                <ChevronDown className={cn("size-3.5 transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]", moreOptions && "rotate-180")} strokeWidth={1.6} aria-hidden="true" />
              </button>
              {moreOptions ? (
                <div className="grid gap-3 pb-1 pt-1">
                  <label className="grid gap-1.5 text-[12px] text-[var(--md-text)]">
                    Remind attendees
                    <Select value={draft.reminders?.join(",") || "none"} onValueChange={(value) => update({ reminders: value === "none" ? [] : value.split(",").map(Number) })}>
                      <SelectTrigger className="h-9 w-full rounded-[var(--md-radius-lg)] text-[13px] text-[var(--md-ink)] sm:w-[260px]"><SelectValue /></SelectTrigger>
                      <SelectContent className="z-[500]">
                        <SelectItem value="1440,60">1 day and 1 hour before</SelectItem>
                        <SelectItem value="60">1 hour before</SelectItem>
                        <SelectItem value="15">15 minutes before</SelectItem>
                        <SelectItem value="none">No reminders</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="flex items-start justify-between gap-4 text-[12px] text-[var(--md-text)]">
                    <span><span className="block font-medium text-[var(--md-ink)]">Attendees can reschedule</span><span className="mt-0.5 block text-[11px] leading-4 text-[var(--md-subtle)]">One-to-one meetings move to a free time. Groups propose alternatives for your approval.</span></span>
                    <Switch checked={draft.allowAttendeeReschedule !== false} onCheckedChange={(checked) => update({ allowAttendeeReschedule: checked })} className="mt-0.5" />
                  </label>
                </div>
              ) : null}
            </Row>
          </div>
          </div>

          <div className="sticky bottom-0 flex flex-col gap-3 bg-[var(--md-surface)] px-5 py-4 shadow-[var(--md-stroke-top)] sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1 text-[11.5px] leading-5 text-[var(--md-subtle)]">
              {error ? <p role="alert" className="flex items-start gap-1.5 text-[var(--md-red)]"><TriangleAlert className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />{error}</p>
                : draft.attendees.length ? `Each attendee receives an invitation with their own management link.` : "Only you will see this meeting until attendees are added."}
            </div>
            <div className="flex shrink-0 items-center justify-end gap-2">
              <Button type="button" variant="ghost" disabled={saving} onClick={close} className="h-9 rounded-[var(--md-radius-lg)]">Cancel</Button>
              <Button type="submit" disabled={saving} className="h-9 min-w-[124px] rounded-[var(--md-radius-lg)]">
                {saving ? <><span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />{stage}</> : "Schedule meeting"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
