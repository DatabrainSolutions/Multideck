import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode, useLayoutEffect, useSyncExternalStore } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { mdEase, mdMotion, staggerRamp } from "@/lib/motion"
import { ArrowLeft, Ban, CalendarDays, ImagePlus, MapPin, Pencil, Ticket, Trash2 } from "@/components/icons/hugeicons"
import { EventAttendeeStrip, EventAudiencePicker, EventGuestList, EventTicket, EventsEmptyState, RsvpChoice, RsvpFormBuilder, RsvpFormFields, formatEventWhen, rsvpLabels, type EventGuestStatus } from "@/components/multideck/company-event-components"
import { DotGridLoaderPanel } from "@/components/multideck/dot-grid-loader"
import { InlineNotice } from "@/components/multideck/inline-notice"
import { MeetingTimePicker, TimeZoneSelect } from "@/components/multideck/meeting-time-picker"
import { WizardDialog, WizardSaveNowButton } from "@/components/multideck/wizard-dialog"
import { SegmentedControl } from "@/components/multideck/workflow-components"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useLanguage } from "@/i18n/language-provider"
import {
  EventsApiError, audienceReach, startEventImage, getEventsDirectory, useProfilePhotoUrls, getEvent, isEventOver, listEvents, saveEvent, saveRsvp, setEventStatus, uploadEventImage, useEventImage, useEventsSettings,
  validateRsvpAnswers, validateRsvpForm, type CompanyEvent, type EventDraft, type EventResponse, type EventsDirectory, type RsvpAnswers, type RsvpStatus,
} from "@/lib/company-events-api"
import { cn } from "@/lib/utils"
import { subscribeTopBarAction, topBarActionEvents } from "@/lib/top-bar-action-events"
import { RefineFrame, type RefineFrameStatus } from "@/components/multideck/refine-frame"
import { LocationAutocomplete } from "@/components/multideck/location-autocomplete"

export const eventDetailRoutePattern = /^\/events\/([0-9a-f-]{36})$/

function message(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Try again."
}

function closedLabel(event: CompanyEvent, t: (text: string) => string) {
  if (event.status === "draft") return t("Draft")
  if (event.status === "cancelled") return t("Cancelled")
  if (isEventOver(event)) return t("Ended")
  return null
}

function TicketCard({ event, priority, saving, imageFrameStatus, onRetryImage, onOpen, onRsvp }: { event: CompanyEvent; priority: boolean; saving: boolean; imageFrameStatus: RefineFrameStatus | null; onRetryImage: () => void; onOpen: () => void; onRsvp: (status: RsvpStatus) => void }) {
  const { t } = useLanguage()
  const imageUrl = useEventImage(event.imagePath)
  return (
    <EventTicket
      title={event.title} startsAt={event.startsAt} endsAt={event.endsAt} timezone={event.timezone} location={event.location}
      imageUrl={imageUrl} imagePriority={priority} imageFrameStatus={imageFrameStatus} onRetryImage={onRetryImage} goingCount={event.goingCount} closedLabel={closedLabel(event, t)} cancelled={event.status === "cancelled"} muted={event.status !== "draft" && isEventOver(event)}
      rsvp={saving ? "saving" : event.myRsvp?.status ?? "none"}
      onOpen={onOpen} onRsvp={onRsvp}
    />
  )
}

export function EventsPage({ route, navigate }: { route: string; navigate: (path: string) => void }) {
  const { t } = useLanguage()
  const { settings, resolved } = useEventsSettings()
  const [events, setEvents] = useState<CompanyEvent[] | null>(null)
  const [loadError, setLoadError] = useState<EventsApiError | null>(null)
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set())
  const [cardError, setCardError] = useState<{ id: string; status: RsvpStatus; text: string } | null>(null)
  const [imageErrors, setImageErrors] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState<CompanyEvent | "new" | null>(null)
  const [revealForm, setRevealForm] = useState(false)
  const [view, setView] = useState<"upcoming" | "past">("upcoming")
  const reduce = useReducedMotion()
  const selectedId = route.match(eventDetailRoutePattern)?.[1] ?? null
  const canManage = settings?.canManage === true

  useEffect(() => { document.title = "Events · Multideck" }, [])

  const load = useCallback(async () => {
    setLoadError(null)
    try { setEvents(await listEvents()) } catch (error) { setLoadError(error instanceof EventsApiError ? error : new EventsApiError(message(error), "network")) }
  }, [])
  useEffect(() => { if (settings?.enabled) void load() }, [load, settings?.enabled])
  useEffect(() => subscribeTopBarAction(topBarActionEvents.createCompanyEvent, () => setEditing("new")), [])
  useEffect(() => {
    if (!events?.some((event) => event.imageGenerationStatus === "queued" || event.imageGenerationStatus === "generating")) return
    const timer = window.setInterval(() => void load(), 2500)
    return () => window.clearInterval(timer)
  }, [events, load])
  const replace = useCallback((next: CompanyEvent) => {
    setEvents((current) => current ? (current.some((item) => item.id === next.id) ? current.map((item) => item.id === next.id ? next : item) : [...current, next]) : [next])
  }, [])

  const requestImage = useCallback(async (eventId: string) => {
    setImageErrors((current) => { const next = { ...current }; delete next[eventId]; return next })
    try { await startEventImage(eventId) }
    catch (error) { setImageErrors((current) => ({ ...current, [eventId]: message(error) })) }
    finally { void load() }
  }, [load])

  const imageFrameStatus = (event: CompanyEvent): RefineFrameStatus | null => {
    if (event.imagePath) return null
    if (imageErrors[event.id] || event.imageGenerationStatus === "failed") return "error"
    if ((event.imageGenerationStatus === "queued" || event.imageGenerationStatus === "generating") && event.imageGenerationStartedAt
      && Date.now() - Date.parse(event.imageGenerationStartedAt) > 130_000) return "error"
    if (event.imageGenerationStatus === "queued" || event.imageGenerationStatus === "generating") return event.imageGenerationStatus
    return null
  }

  // Explicit RSVP from the ticket menu. Yes to an event with an RSVP form opens
  // the form; every other answer saves straight away.
  const rsvpFromTicket = async (event: CompanyEvent, status: RsvpStatus) => {
    setCardError(null)
    if (status === "going" && event.form.length) { setRevealForm(true); navigate(`/events/${event.id}`); return }
    setSavingIds((current) => new Set(current).add(event.id))
    try { replace(await saveRsvp(event.id, status, null, crypto.randomUUID())) }
    catch (error) { setCardError({ id: event.id, status, text: message(error) }); if (error instanceof EventsApiError && error.code === "cancelled") void load() }
    finally { setSavingIds((current) => { const next = new Set(current); next.delete(event.id); return next }) }
  }

  const groups = useMemo(() => {
    const list = events ?? []
    const now = Date.now()
    const cancelledLast = (items: CompanyEvent[]) => [
      ...items.filter((event) => event.status !== "cancelled"),
      ...items.filter((event) => event.status === "cancelled"),
    ]
    return {
      upcoming: cancelledLast(list.filter((event) => event.status !== "draft" && !isEventOver(event, now))),
      drafts: list.filter((event) => event.status === "draft"),
      past: cancelledLast(list.filter((event) => event.status !== "draft" && isEventOver(event, now)).reverse()),
    }
  }, [events])

  if (!resolved || (settings?.enabled && events === null && !loadError)) return <DotGridLoaderPanel label={t("Loading events")} minHeight={360} />
  if (!settings?.enabled) {
    return (
      <div className="md-page md-page-stack">
        <InlineNotice tone="info" title={settings ? t("Events are turned off") : t("Events are not available yet")} action={<Button variant="outline" size="sm" onClick={() => navigate("/")}>{t("Go to Home")}</Button>}>
          {settings ? t("An administrator can turn them on in Admin → System Preferences.") : t("This workspace has not been updated for Events. Try again later.")}
        </InlineNotice>
      </div>
    )
  }

  const ticketList = (list: CompanyEvent[], prioritise = true) => (
    <ol className="mx-auto grid w-full max-w-[760px] gap-6 sm:w-[92%] lg:w-[82%]">
      {list.map((event, index) => (
        <motion.li key={event.id} className="grid gap-2"
          initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          transition={reduce ? { duration: 0 } : { ...mdMotion.enter, delay: staggerRamp(index, 0.05) }}>
          <TicketCard event={event} priority={prioritise && index < 2} saving={savingIds.has(event.id)} imageFrameStatus={imageFrameStatus(event)} onRetryImage={() => void requestImage(event.id)} onOpen={() => { setRevealForm(false); navigate(`/events/${event.id}`) }} onRsvp={(status) => void rsvpFromTicket(event, status)} />
          {imageErrors[event.id] ? <InlineNotice tone="error" action={<Button size="sm" variant="outline" onClick={() => void requestImage(event.id)}>{t("Try again")}</Button>}>{imageErrors[event.id]}</InlineNotice> : null}
          {cardError?.id === event.id ? (
            <InlineNotice tone="error" action={<Button size="sm" variant="outline" onClick={() => void rsvpFromTicket(event, cardError.status)}>{t("Try again")}</Button>}>{cardError.text}</InlineNotice>
          ) : null}
        </motion.li>
      ))}
    </ol>
  )

  const empty = events !== null && events.length === 0
  const shown = view === "upcoming" ? groups.upcoming : groups.past
  const drafts = view === "upcoming" && canManage ? groups.drafts : []
  return (
    <div className="md-page md-page-sections pb-[var(--md-page-bottom-pad)]">
      {loadError ? <InlineNotice tone="error" action={<Button size="sm" variant="outline" onClick={() => void load()}>{t("Try again")}</Button>}>{loadError.message}</InlineNotice> : null}
      {empty ? (
        <EventsEmptyState canCreate={canManage} onCreate={() => setEditing("new")} title={t("No events yet")}
          message={canManage ? t("Create an event and publish it when it is ready for everyone.") : t("Company events will appear here when an organiser publishes them.")} />
      ) : (
        <>
          <header className="grid justify-items-center gap-4 pt-2 text-center">
            <h1 className="text-[24px] font-medium leading-[1.15] tracking-[-0.015em] text-balance text-[var(--md-ink)]">
              {view === "upcoming" ? t("Upcoming events") : t("Past events")}
            </h1>
            <SegmentedControl
              ariaLabel={t("Show")}
              options={["upcoming", "past"] as const}
              value={view}
              onChange={setView}
              renderOption={(option) => <>{t(option === "upcoming" ? "Upcoming" : "Past")}<span className="text-[11px] font-normal text-[var(--md-subtle)] [font-variant-numeric:tabular-nums]">{option === "upcoming" ? groups.upcoming.length : groups.past.length}</span></>}
            />
          </header>
          {/* Upcoming slides in from the left and Past from the right, matching the toggle. */}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={view} className="grid gap-10"
              initial={reduce ? false : { opacity: 0, x: view === "upcoming" ? -18 : 18 }} animate={{ opacity: 1, x: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, x: view === "upcoming" ? 18 : -18, transition: mdMotion.exit }}
              transition={reduce ? { duration: 0 } : mdMotion.enter}>
              {shown.length ? ticketList(shown) : (
                <p className="text-center text-[13px] text-[var(--md-text)]">{view === "upcoming" ? t("No upcoming events.") : t("No past events yet.")}</p>
              )}
              {drafts.length ? (
                <section className="grid gap-4" aria-labelledby="events-drafts-heading">
                  <h2 id="events-drafts-heading" className="text-center text-[14px] font-medium text-[var(--md-text)]">{t("Drafts")} <span className="font-normal text-[var(--md-subtle)] [font-variant-numeric:tabular-nums]">{drafts.length}</span></h2>
                  {ticketList(drafts, shown.length === 0)}
                </section>
              ) : null}
            </motion.div>
          </AnimatePresence>
        </>
      )}
      <EventDetailDialog
        key={selectedId ?? "closed"}
        eventId={selectedId}
        initialEvent={events?.find((event) => event.id === selectedId) ?? null}
        initialRevealForm={revealForm}
        onClose={() => navigate("/events")}
        onChanged={replace}
        onEdit={(event) => setEditing(event)}
        onRemoved={(id) => { setEvents((current) => current?.filter((item) => item.id !== id) ?? null); navigate("/events") }}
      />
      <EventWizard
        target={editing}
        onClose={() => setEditing(null)}
        onSaved={(event, needsImage) => { replace(event); setEditing(null); navigate(needsImage ? "/events" : `/events/${event.id}`); if (needsImage) void requestImage(event.id) }}
      />
    </div>
  )
}

// The detail view assembles in reading order: date, title, facts, description,
// then RSVP. Short, front-loaded delays keep it feeling immediate.
function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (notify) => { const list = window.matchMedia(query); list.addEventListener("change", notify); return () => list.removeEventListener("change", notify) },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

function DetailReveal({ index, className, children, ...rest }: { index: number; className?: string; children: ReactNode } & Omit<ComponentProps<typeof motion.div>, "children">) {
  const reduce = useReducedMotion()
  return (
    <motion.div className={className} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0 } : { ...mdMotion.enter, delay: 0.06 + staggerRamp(index, 0.05) }} {...rest}>
      {children}
    </motion.div>
  )
}

function EventDetailDialog({ eventId, initialEvent, initialRevealForm, onClose, onChanged, onEdit, onRemoved }: {
  eventId: string | null
  initialEvent: CompanyEvent | null
  initialRevealForm: boolean
  onClose: () => void
  onChanged: (event: CompanyEvent) => void
  onEdit: (event: CompanyEvent) => void
  onRemoved: (id: string) => void
}) {
  const { language, t } = useLanguage()
  const [event, setEvent] = useState<CompanyEvent | null>(initialEvent)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [answers, setAnswers] = useState<RsvpAnswers>(initialEvent?.myRsvp?.answers ?? {})
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<RsvpStatus | "publish" | "cancel" | "delete" | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [viewing, setViewing] = useState<EventResponse | null>(null)
  const [view, setView] = useState<"details" | "guests" | "form">("details")
  const [guestStatus, setGuestStatus] = useState<EventGuestStatus>("going")
  const [guestDirectory, setGuestDirectory] = useState<EventsDirectory | null>(null)
  const [guestDirectoryError, setGuestDirectoryError] = useState<string | null>(null)
  const [guestDirectoryAttempt, setGuestDirectoryAttempt] = useState(0)
  const [detailsHeight, setDetailsHeight] = useState(0)
  const detailsRef = useRef<HTMLDivElement>(null)
  const wide = useMediaQuery("(min-width: 1180px)")
  const [imageRetryError, setImageRetryError] = useState<string | null>(null)
  const reduce = useReducedMotion()
  const requestId = useRef<string | null>(null)
  const lastStatus = useRef<RsvpStatus>("going")
  const imageUrl = useEventImage(event?.imagePath ?? null)
  useEffect(() => {
    if (view !== "guests" || !event?.canManage) return
    let active = true
    setGuestDirectory(null)
    setGuestDirectoryError(null)
    getEventsDirectory().then((directory) => { if (active) setGuestDirectory(directory) }, (error) => { if (active) setGuestDirectoryError(message(error)) })
    return () => { active = false }
  }, [view, event?.id, event?.canManage, guestDirectoryAttempt])
  const invitedPeople = useMemo(() => {
    if (!guestDirectory || !event?.canManage || (event.audience !== "everyone" && !event.invitees)) return undefined
    const selected = new Set(event.invitees?.map((invitee) => invitee.id))
    return guestDirectory.people.filter((person) => event.audience === "everyone" || (event.audience === "people" ? selected.has(person.userId) : person.departmentIds.some((id) => selected.has(id))))
  }, [guestDirectory, event])
  const photoUrls = useProfilePhotoUrls([...(event?.attendees ?? []), ...(invitedPeople ?? [])].map((person) => person.photoPath))

  const apply = useCallback((next: CompanyEvent) => { setEvent(next); onChanged(next) }, [onChanged])
  const load = useCallback(async (id: string) => {
    setLoadError(null)
    try {
      const next = await getEvent(id)
      setEvent(next)
      setAnswers(next.myRsvp?.answers ?? {})
      const reveal = initialRevealForm && next.form.length > 0 && next.status === "published" && !isEventOver(next)
      setFormOpen(reveal)
      if (reveal && !window.matchMedia("(min-width: 1180px)").matches) setView("form")
    } catch (error) { setEvent(null); setLoadError(message(error)) }
  }, [initialRevealForm])

  useEffect(() => {
    setActionError(null); setSaved(null); setFieldErrors({}); setDetailsOpen(false); setViewing(null); setView("details"); requestId.current = null
    if (eventId) void load(eventId)
  }, [eventId, load])
  useEffect(() => {
    if (!eventId || (event?.imageGenerationStatus !== "queued" && event?.imageGenerationStatus !== "generating")) return
    const timer = window.setInterval(() => { getEvent(eventId).then(apply, () => undefined) }, 2500)
    return () => window.clearInterval(timer)
  }, [eventId, event?.imageGenerationStatus, apply])

  const retryImage = async () => {
    if (!event) return
    setImageRetryError(null)
    try { await startEventImage(event.id); apply(await getEvent(event.id)) }
    catch (error) { setImageRetryError(message(error)) }
  }

  const submitRsvp = async (status: RsvpStatus) => {
    if (!event || saving) return
    setActionError(null); setSaved(null)
    if (status === "going" && event.form.length) {
      const errors = validateRsvpAnswers(event.form, answers)
      setFieldErrors(errors)
      if (Object.keys(errors).length) { setActionError(t("Check the highlighted answers.")); return }
    }
    // One id per attempt set: a retry after a lost response is saved only once.
    if (lastStatus.current !== status) requestId.current = null
    lastStatus.current = status
    requestId.current ??= crypto.randomUUID()
    setSaving(status)
    try {
      const next = await saveRsvp(event.id, status, status === "going" && event.form.length ? answers : null, requestId.current)
      requestId.current = null
      apply(next)
      setFormOpen(false)
      setView("details")
      setSaved(status === "going" ? t("You're going. Your RSVP is saved.") : status === "maybe" ? t("Saved as maybe.") : t("Saved as not going."))
    } catch (error) {
      setActionError(message(error))
      if (error instanceof EventsApiError && error.code !== "network") { requestId.current = null; void load(event.id) }
    } finally { setSaving(null) }
  }

  const changeStatus = async (status: "published" | "cancelled" | "archived") => {
    if (!event) return
    setActionError(null)
    setSaving(status === "published" ? "publish" : status === "cancelled" ? "cancel" : "delete")
    try {
      const next = await setEventStatus(event.id, status, event.editVersion)
      if (status === "archived") { onRemoved(event.id); return }
      apply(next); setConfirmCancel(false)
      setSaved(status === "published" ? t("Published. Everyone can now see this event.") : t("Event cancelled."))
    } catch (error) { setActionError(message(error)); void load(event.id) } finally { setSaving(null) }
  }

  const over = event ? isEventOver(event) : false
  const open = event?.status === "published" && !over
  const mine = event?.myRsvp ?? null
  const sidePanel = Boolean(formOpen && open && wide && view === "details")

  // The other views hold the details' height, so switching never resizes the dialog.
  useLayoutEffect(() => {
    const element = detailsRef.current
    if (!element) return
    setDetailsHeight(element.offsetHeight)
    const observer = new ResizeObserver(() => setDetailsHeight(element.offsetHeight))
    observer.observe(element)
    return () => observer.disconnect()
  }, [event?.id, view])

  const openForm = () => { setAnswers(mine?.answers ?? {}); setFieldErrors({}); setActionError(null); setFormOpen(true); if (!wide) setView("form") }
  const closeForm = () => { setFormOpen(false); setFieldErrors({}); setActionError(null); setView("details") }

  const rsvpForm = event ? (
    <form className="grid gap-5" noValidate onSubmit={(submit) => { submit.preventDefault(); void submitRsvp("going") }}>
      <RsvpFormFields form={event.form} answers={answers} errors={fieldErrors} disabled={Boolean(saving)} onChange={(next) => { setAnswers(next); requestId.current = null }} />
      {actionError ? <InlineNotice tone="error">{actionError}</InlineNotice> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" disabled={Boolean(saving)} onClick={closeForm}>{t("Cancel")}</Button>
        <Button type="submit" disabled={Boolean(saving)}>{saving === "going" ? t("Saving…") : mine?.status === "going" ? t("Save answers") : t("Confirm RSVP")}</Button>
      </div>
    </form>
  ) : null

  return (
    <Dialog open={Boolean(eventId)} onOpenChange={(next) => { if (!next && !saving) onClose() }}>
      {/* Sized to fit a laptop screen without scrolling. The RSVP form opens as
          its own panel beside the details (the dialog widens to make room), and
          the guest list is its own view, so neither squeezes the details. Narrow
          phones may still scroll vertically; nothing ever scrolls sideways. */}
      <DialogContent
        className={cn(
          "gap-0 overflow-x-hidden rounded-[var(--md-radius-2xl)] p-0 transition-[max-width] duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
          sidePanel ? "sm:max-w-[min(1240px,calc(100vw-2rem))]" : "sm:max-w-[min(880px,calc(100vw-2rem))]",
        )}
        closeLabel={t("Close")}
      >
        {!event ? (
          <div className="p-6">
            <DialogTitle className="sr-only">{t("Event")}</DialogTitle>
            {loadError ? <InlineNotice tone="error" action={<Button size="sm" variant="outline" onClick={() => eventId && void load(eventId)}>{t("Try again")}</Button>}>{loadError}</InlineNotice> : <DotGridLoaderPanel label={t("Loading event")} minHeight={260} />}
          </div>
        ) : (
          <div className="flex min-w-0">
            <div className="grid min-w-0 flex-1 content-start">
              <AnimatePresence mode="popLayout" initial={false}>
                {view === "guests" && event.status !== "draft" ? (
                  <motion.section key="guests" aria-label={t("Who's coming")} className="flex flex-col gap-5 p-5 sm:p-8" style={{ height: detailsHeight || undefined }}
                    initial={reduce ? false : { opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} exit={reduce ? { opacity: 0 } : { opacity: 0, x: 28 }} transition={reduce ? { duration: 0 } : mdMotion.enter}>
                    <div className="flex items-center gap-2 pe-8">
                      <Button type="button" variant="ghost" size="icon-sm" onClick={() => setView("details")} aria-label={t("Back to event")}><ArrowLeft className="size-4 rtl:rotate-180" strokeWidth={1.4} /></Button>
                      <div className="grid min-w-0 gap-0.5">
                        <DialogTitle className="text-[18px] font-medium leading-[1.2] tracking-[-0.01em]">{t("Who's coming")}</DialogTitle>
                        <DialogDescription className="truncate text-[12px] text-[var(--md-text)]"><span data-i18n-skip>{event.title}</span>{event.invitedCount !== null ? <> · <span className="[font-variant-numeric:tabular-nums]">{event.invitedCount}</span> {t("invited")}</> : null}</DialogDescription>
                      </div>
                    </div>
                    <EventGuestList attendees={event.attendees ?? []} invitedCount={event.invitedCount ?? undefined} invitedPeople={invitedPeople}
                      invitationMessage={!event.canManage ? t("Only event organisers can view the invitation list.") : guestDirectoryError ?? t("Loading invited people…")}
                      onRetryInvitations={guestDirectoryError ? () => setGuestDirectoryAttempt((attempt) => attempt + 1) : undefined}
                      photoUrls={photoUrls} status={guestStatus} onStatusChange={setGuestStatus}
                      listHeight={detailsHeight ? "fill" : 320}
                      onSelect={event.canManage && event.responses ? (person) => setViewing(event.responses?.find((response) => response.userId === person.userId) ?? null) : undefined} />
                  </motion.section>
                ) : view === "form" && formOpen && open ? (
                  <motion.section key="form-view" aria-label={t("Your RSVP")} className="grid content-start gap-5 p-5 sm:p-8" style={{ minHeight: detailsHeight || undefined }}
                    initial={reduce ? false : { opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} exit={reduce ? { opacity: 0 } : { opacity: 0, x: 28 }} transition={reduce ? { duration: 0 } : mdMotion.enter}>
                    <div className="flex items-center gap-2 pe-8">
                      <Button type="button" variant="ghost" size="icon-sm" onClick={closeForm} aria-label={t("Back to event")}><ArrowLeft className="size-4 rtl:rotate-180" strokeWidth={1.4} /></Button>
                      <div className="grid min-w-0 gap-0.5">
                        <DialogTitle className="text-[18px] font-medium leading-[1.2] tracking-[-0.01em]">{t("Your RSVP")}</DialogTitle>
                        <DialogDescription className="truncate text-[12px] text-[var(--md-text)]" data-i18n-skip>{event.title}</DialogDescription>
                      </div>
                    </div>
                    {rsvpForm}
                  </motion.section>
                ) : (
                  <motion.div key="details" initial={reduce ? false : { opacity: 0, x: -28 }} animate={{ opacity: 1, x: 0 }} exit={reduce ? { opacity: 0 } : { opacity: 0, x: -28 }} transition={reduce ? { duration: 0 } : mdMotion.enter}>
                    <div ref={detailsRef}>
                    <div className="relative p-2 pb-0">
                      {/* 3:1 keeps a photo recognisable; the height cap keeps the rest on screen. */}
                      <div className={cn("relative grid w-full place-items-center overflow-hidden rounded-[calc(var(--md-radius-2xl)-8px)] bg-[color-mix(in_srgb,var(--md-accent)_9%,var(--md-surface-tint))]", event.imagePath || event.imageGenerationStatus !== "none" ? "aspect-[3/1] max-h-[34vh]" : "h-[112px]")}>
                        {event.imageGenerationStatus === "queued" || event.imageGenerationStatus === "generating" || event.imageGenerationStatus === "failed" ? (
                          <RefineFrame status={imageRetryError || event.imageGenerationStatus === "failed" || (event.imageGenerationStartedAt && Date.now() - Date.parse(event.imageGenerationStartedAt) > 130_000) ? "error" : event.imageGenerationStatus} src={null} aspectRatio="3 / 1" onRetry={event.canManage ? () => void retryImage() : undefined} />
                        ) : imageUrl ? (
                          <img src={imageUrl} alt="" className={cn("absolute inset-0 size-full object-cover", event.status === "cancelled" && "grayscale opacity-70")} fetchPriority="high" />
                        ) : <Ticket className="size-8 text-[var(--md-accent)]" strokeWidth={1.2} aria-hidden="true" />}
                      </div>
                      {imageRetryError ? <InlineNotice tone="error" action={<Button size="sm" variant="outline" onClick={() => void retryImage()}>{t("Try again")}</Button>}>{imageRetryError}</InlineNotice> : null}
                      <DetailReveal index={0} className="md-event-date-card absolute bottom-0 start-8 translate-y-1/2" aria-hidden="true">
                        <span className="text-[12px] font-medium uppercase tracking-[0.06em] text-[var(--md-accent)]">{new Intl.DateTimeFormat(language, { month: "short", timeZone: event.timezone }).format(new Date(event.startsAt))}</span>
                        <span className="text-[32px] font-medium leading-none tracking-[-0.03em] text-[var(--md-ink)] [font-variant-numeric:tabular-nums]">{new Intl.DateTimeFormat(language, { day: "numeric", timeZone: event.timezone }).format(new Date(event.startsAt))}</span>
                        <span className="text-[11px] text-[var(--md-text)]">{new Intl.DateTimeFormat(language, { weekday: "short", timeZone: event.timezone }).format(new Date(event.startsAt))}</span>
                      </DetailReveal>
                    </div>

                    <div className="grid min-w-0 gap-6 px-5 pb-6 pt-14 sm:px-8 md:grid-cols-[minmax(0,1fr)_320px] md:gap-8">
                      <div className="grid min-w-0 content-start gap-5">
                        <DetailReveal index={1}>
                          <DialogHeader className="gap-2 text-start">
                            {event.status !== "published" || over ? (
                              <span className="justify-self-start rounded-full bg-[var(--md-surface-tint)] px-2 py-0.5 text-[11px] font-medium text-[var(--md-text)]">{event.status === "draft" ? t("Draft") : event.status === "cancelled" ? t("Cancelled") : t("Ended")}</span>
                            ) : null}
                            <DialogTitle className="pe-6 text-[22px] font-medium leading-[1.15] tracking-[-0.015em] text-balance [overflow-wrap:anywhere]" dir="auto" data-i18n-skip>{event.title}</DialogTitle>
                          </DialogHeader>
                        </DetailReveal>
                        <DetailReveal index={2}>
                          <DialogDescription asChild>
                            <dl className="grid gap-3">
                              <div className="md-event-fact">
                                <dt className="md-event-fact__icon"><CalendarDays className="size-4" strokeWidth={1.4} aria-hidden="true" /><span className="sr-only">{t("When")}</span></dt>
                                <dd className="grid min-w-0 gap-0.5">
                                  <span className="text-[13px] font-medium leading-5 text-[var(--md-ink)]">{new Intl.DateTimeFormat(language, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: event.timezone }).format(new Date(event.startsAt))}</span>
                                  <span className="text-[12px] leading-5 text-[var(--md-text)]">{formatEventWhen(event.startsAt, event.endsAt, event.timezone, language).split(" · ").slice(1).join(" · ")}</span>
                                </dd>
                              </div>
                              <div className="md-event-fact">
                                <dt className="md-event-fact__icon"><MapPin className="size-4" strokeWidth={1.4} aria-hidden="true" /><span className="sr-only">{t("Where")}</span></dt>
                                <dd className="min-w-0 self-center text-[13px] font-medium leading-5 text-[var(--md-ink)] [overflow-wrap:anywhere]" dir="auto" data-i18n-skip>{event.location}</dd>
                              </div>
                            </dl>
                          </DialogDescription>
                        </DetailReveal>
                        {event.status === "cancelled" ? <InlineNotice tone="warning" title={t("This event has been cancelled")}>{event.cancellationNote || t("RSVPs are closed.")}</InlineNotice> : null}
                        {event.details ? (
                          <DetailReveal index={3} className="grid gap-1.5">
                            <p className={cn("max-w-[62ch] whitespace-pre-wrap text-pretty text-[14px] leading-[1.6] text-[var(--md-ink)] [overflow-wrap:anywhere]", !detailsOpen && "line-clamp-5")} dir="auto" data-i18n-skip>{event.details}</p>
                            {event.details.length > 300 || event.details.split("\n").length > 5 ? (
                              <button type="button" className="justify-self-start text-[12px] font-medium text-[var(--md-accent)] underline-offset-[3px] hover:underline" aria-expanded={detailsOpen} onClick={() => setDetailsOpen((current) => !current)}>{detailsOpen ? t("Show less") : t("Show more")}</button>
                            ) : null}
                          </DetailReveal>
                        ) : null}
                      </div>

                      <DetailReveal index={2} className="grid min-w-0 content-start gap-3">
                        {event.status === "published" ? (
                          <section className="grid gap-3 rounded-[var(--md-radius-xl)] bg-[var(--md-surface-tint)] p-4" aria-label={t("RSVP")}>
                            <div className="flex items-baseline justify-between gap-2">
                              <h3 className="text-[13px] font-medium text-[var(--md-ink)]">{t("Are you going?")}</h3>
                              {over ? <span className="text-[12px] text-[var(--md-text)]">{t("Ended")}</span> : event.form.length && !formOpen ? <span className="text-[11px] text-[var(--md-subtle)]">{t("Yes opens a short form")}</span> : null}
                            </div>
                            {open ? (
                              <RsvpChoice value={mine?.status ?? null} pending={saving === "going" || saving === "maybe" || saving === "not_going" ? saving : null} disabled={Boolean(saving)}
                                onChange={(status) => { if (status === "going" && event.form.length) openForm() ; else { closeForm(); void submitRsvp(status) } }} />
                            ) : mine ? <span className="text-[12px] text-[var(--md-text)]">{t(rsvpLabels[mine.status].short)}</span> : null}
                            {formOpen && open && sidePanel ? <p className="text-[12px] text-[var(--md-text)]">{t("Answer the questions on the right to confirm.")}</p> : null}
                            {open && !formOpen && mine?.status === "going" && event.form.length ? <Button variant="ghost" size="sm" className="justify-self-start" onClick={openForm}>{t("Edit answers")}</Button> : null}
                            {mine?.needsUpdate && open && !formOpen ? <InlineNotice tone="warning" action={<Button size="sm" variant="outline" onClick={openForm}>{t("Update answers")}</Button>}>{t("The organiser added questions. You're still going.")}</InlineNotice> : null}
                            {actionError && !formOpen ? <InlineNotice tone="error" action={requestId.current ? <Button size="sm" variant="outline" onClick={() => void submitRsvp(lastStatus.current)}>{t("Try again")}</Button> : undefined}>{actionError}</InlineNotice> : null}
                            {saved ? <p role="status" className="text-[12px] text-[var(--md-green)]">{saved}</p> : null}
                          </section>
                        ) : actionError ? <InlineNotice tone="error">{actionError}</InlineNotice> : saved ? <p role="status" className="text-[12px] text-[var(--md-green)]">{saved}</p> : null}
                        {event.status !== "draft" ? <EventAttendeeStrip attendees={event.attendees ?? []} invitedCount={event.invitedCount ?? undefined} photoUrls={photoUrls} onOpen={() => { setGuestStatus("going"); setView("guests") }} /> : null}
                      </DetailReveal>
                    </div>
                    {event.canManage && event.status !== "cancelled" ? (
                      <DialogFooter className="m-0 flex-row flex-wrap justify-end gap-2 rounded-b-[var(--md-radius-2xl)] px-5 py-3 sm:px-8">
                        {event.status === "draft" ? <Button variant="ghost" disabled={Boolean(saving)} onClick={() => void changeStatus("archived")}><Trash2 data-icon="inline-start" strokeWidth={1.4} />{saving === "delete" ? t("Deleting…") : t("Delete draft")}</Button> : null}
                        {event.status === "published" && !over ? <Button variant="ghost" disabled={Boolean(saving)} onClick={() => setConfirmCancel(true)}><Ban data-icon="inline-start" strokeWidth={1.4} />{t("Cancel event")}</Button> : null}
                        <Button variant="outline" disabled={Boolean(saving)} onClick={() => onEdit(event)}><Pencil data-icon="inline-start" strokeWidth={1.4} />{t("Edit")}</Button>
                        {event.status === "draft" ? <Button disabled={Boolean(saving)} onClick={() => void changeStatus("published")}>{saving === "publish" ? t("Publishing…") : t("Publish")}</Button> : null}
                      </DialogFooter>
                    ) : null}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* The RSVP form's own panel. It sits beside the details at the same
                height and scrolls inside itself if the form is long. */}
            <AnimatePresence initial={false}>
              {sidePanel && event ? (
                <motion.aside key="rsvp-panel" aria-label={t("Your RSVP")} className="relative shrink-0 overflow-hidden bg-[var(--md-surface-soft)] shadow-[var(--md-stroke-left)]"
                  initial={reduce ? false : { width: 0, opacity: 0 }} animate={{ width: 360, opacity: 1 }} exit={reduce ? { opacity: 0 } : { width: 0, opacity: 0 }}
                  transition={reduce ? { duration: 0 } : { duration: 0.32, ease: mdEase }}>
                  <div className="absolute inset-y-0 start-0 flex w-[360px] flex-col">
                    <div className="grid gap-0.5 px-6 pb-4 pt-6">
                      <h3 className="text-[16px] font-medium leading-[1.2] text-[var(--md-ink)]">{t("Your RSVP")}</h3>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6">{rsvpForm}</div>
                  </div>
                </motion.aside>
              ) : null}
            </AnimatePresence>
          </div>
        )}
      </DialogContent>
      <ResponseDialog response={viewing} onClose={() => setViewing(null)} />
      <Dialog open={confirmCancel} onOpenChange={(next) => { if (!saving) setConfirmCancel(next) }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>{t("Cancel this event?")}</DialogTitle>
            <DialogDescription>{t("It stays visible as cancelled and RSVPs close. This cannot be undone.")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" disabled={Boolean(saving)} onClick={() => setConfirmCancel(false)}>{t("Keep event")}</Button>
            <Button variant="destructive" disabled={Boolean(saving)} onClick={() => void changeStatus("cancelled")}>{saving === "cancel" ? t("Cancelling…") : t("Cancel event")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}

function answerText(value: unknown, field: CompanyEvent["form"][number] | undefined, t: (text: string) => string) {
  if (value === undefined || value === null || value === "") return "—"
  if (typeof value === "boolean") return t(value ? "Yes" : "No")
  const label = (id: unknown) => field?.options?.find((option) => option.id === id)?.label ?? String(id)
  if (Array.isArray(value)) return value.map(label).join(", ")
  return field?.options ? label(value) : String(value)
}

function ResponseDialog({ response, onClose }: { response: EventResponse | null; onClose: () => void }) {
  const { t } = useLanguage()
  const answered = response?.form.filter((field) => response.answers[field.id] !== undefined) ?? []
  return (
    <Dialog open={Boolean(response)} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle data-i18n-skip>{response?.name}</DialogTitle>
          <DialogDescription>{response ? t(rsvpLabels[response.status].short) : null}{response?.needsUpdate ? ` · ${t("Missing new answers")}` : null}</DialogDescription>
        </DialogHeader>
        {/* Each answer is read against the form the colleague actually answered. */}
        {answered.length ? (
          <dl className="grid gap-2.5">
            {answered.map((field) => (
              <div key={field.id} className="grid gap-0.5">
                <dt className="text-[11px] text-[var(--md-subtle)]" data-i18n-skip>{field.label}</dt>
                <dd className="text-[13px] text-[var(--md-ink)] [overflow-wrap:anywhere]" data-i18n-skip>{answerText(response?.answers[field.id], field, t)}</dd>
              </div>
            ))}
          </dl>
        ) : <p className="text-[12px] text-[var(--md-text)]">{t("No answers to RSVP questions.")}</p>}
      </DialogContent>
    </Dialog>
  )
}

function defaultStart() {
  const date = new Date(Date.now() + 7 * 86_400_000)
  date.setHours(18, 0, 0, 0)
  return date.toISOString()
}

function draftFrom(event: CompanyEvent | null): EventDraft {
  const startsAt = event?.startsAt ?? defaultStart()
  return {
    title: event?.title ?? "", startsAt, endsAt: event?.endsAt ?? new Date(Date.parse(startsAt) + 2 * 3_600_000).toISOString(),
    timezone: event?.timezone ?? (Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/London"),
    location: event?.location ?? "", details: event?.details ?? "", imagePath: event?.imagePath ?? null, form: event?.form ?? [],
    audience: event?.audience ?? "everyone", invitees: (event?.invitees ?? []).map((item) => item.id),
  }
}

type WizardStepId = "basics" | "when" | "invite" | "details" | "rsvp" | "review"

// Fields arrive a beat after their step, top to bottom, so each screen reads in
// the order it should be filled. Reduced motion shows them at once.
function StepField({ index, children, className }: { index: number; children: ReactNode; className?: string }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0 } : { ...mdMotion.enter, delay: 0.05 + index * 0.045 }}
    >
      {children}
    </motion.div>
  )
}

function EventWizard({ target, onClose, onSaved }: { target: CompanyEvent | "new" | null; onClose: () => void; onSaved: (event: CompanyEvent, needsImage: boolean) => void }) {
  const { language, t } = useLanguage()
  const reduce = useReducedMotion()
  const existing = target && target !== "new" ? target : null
  const [step, setStep] = useState<WizardStepId>("basics")
  const [draft, setDraft] = useState<EventDraft>(() => draftFrom(existing))
  const [useForm, setUseForm] = useState(false)
  const [publishNow, setPublishNow] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const imageUrl = useEventImage(draft.imagePath)
  const answeredIds = useMemo(() => [...new Set((existing?.responses ?? []).flatMap((response) => Object.keys(response.answers)))], [existing])
  const [directory, setDirectory] = useState<EventsDirectory | null>(null)
  const [directoryError, setDirectoryError] = useState<string | null>(null)
  const directoryPhotos = useProfilePhotoUrls(step === "invite" ? (directory?.people ?? []).map((person) => person.photoPath) : [])
  useEffect(() => {
    if (!target || directory) return
    getEventsDirectory().then(setDirectory, (loadError) => setDirectoryError(message(loadError)))
  }, [target, directory])
  const canPublish = !existing || existing.status === "draft"

  useEffect(() => {
    if (!target) return
    const next = draftFrom(target === "new" ? null : target)
    setDraft(next); setUseForm(next.form.length > 0); setPublishNow(false); setStep("basics")
    setErrors({}); setFormErrors({}); setError(null)
  }, [target])

  const update = (patch: Partial<EventDraft>) => setDraft((current) => ({ ...current, ...patch }))

  const upload = async (file: File | null) => {
    if (!file) return
    setUploading(true); setError(null)
    try { update({ imagePath: await uploadEventImage(file) }) }
    catch (uploadError) { setError(message(uploadError)) }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = "" }
  }

  const form = useForm ? draft.form : []
  const liveFormErrors = validateRsvpForm(form)
  const steps: Array<{ id: WizardStepId; label: string; hint: string; complete?: boolean }> = [
    { id: "basics", label: "Basics", hint: "Name the event and add a picture people will recognise.", complete: Boolean(draft.title.trim()) },
    { id: "when", label: "When and where", hint: "Times are shown in the timezone you choose.", complete: Boolean(draft.location.trim()) },
    { id: "invite", label: "Invite", hint: "Only invited colleagues can see and RSVP. Organisers can always see it.", complete: draft.audience === "everyone" || draft.invitees.length > 0 },
    { id: "details", label: "Details", hint: "What to expect, what to bring, who it's for." },
    { id: "rsvp", label: "RSVP", hint: "Ask questions when colleagues say they're going.", complete: useForm ? form.length > 0 && !Object.keys(liveFormErrors).length : undefined },
    { id: "review", label: "Review", hint: "This is how colleagues will see it." },
  ]
  const stepIndex = steps.findIndex((item) => item.id === step)

  const save = async () => {
    const nextErrors: Record<string, string> = {}
    if (!draft.title.trim()) nextErrors.title = t("Add a title.")
    if (!draft.location.trim()) nextErrors.location = t("Add a location.")
    if (useForm && !form.length) nextErrors.form = t("Add a question or turn off the RSVP form.")
    if (draft.audience !== "everyone" && !draft.invitees.length) nextErrors.invitees = t(draft.audience === "people" ? "Choose at least one person, or invite everyone." : "Choose at least one department, or invite everyone.")
    setErrors(nextErrors); setFormErrors(liveFormErrors)
    // Send the organiser straight to the first step that needs attention.
    const failing: WizardStepId | null = nextErrors.title ? "basics" : nextErrors.location ? "when" : nextErrors.invitees ? "invite" : nextErrors.form || Object.keys(liveFormErrors).length ? "rsvp" : null
    if (failing) { setStep(failing); setError(null); return }
    setSaving(true); setError(null)
    try {
      if (draft.audience !== "everyone" && !directory) { setError(t("Invitations are not available in this workspace yet. Invite everyone, or try again later.")); return }
      const needsImage = !existing && !draft.imagePath
      let saved = await saveEvent(existing?.id ?? null, existing?.editVersion ?? 0, { ...draft, title: draft.title.trim(), location: draft.location.trim(), form })
      // Never publish an event more widely than chosen: a server without
      // invitations would have saved it for everyone.
      if (saved.audience !== draft.audience) { onSaved(saved, needsImage); return }
      if (publishNow && canPublish) {
        // The draft is safe either way; a failed publish lands on the draft, which carries its own Publish action.
        try { saved = await setEventStatus(saved.id, "published", saved.editVersion) } catch { /* shown as Draft in the detail view */ }
      }
      onSaved(saved, needsImage)
    } catch (saveError) { setError(message(saveError)) }
    finally { setSaving(false) }
  }

  const fieldError = (text?: string) => (
    <AnimatePresence initial={false}>
      {text ? <motion.span key={text} initial={reduce ? false : { opacity: 0, y: -2 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-[11px] font-normal text-[var(--md-red)]">{text}</motion.span> : null}
    </AnimatePresence>
  )

  const labelClass = "grid gap-1.5 text-[12px] font-medium text-[var(--md-ink)]"
  const responseCount = existing?.responses?.length ?? 0

  return (
    <WizardDialog
      open={Boolean(target)}
      onOpenChange={(next) => { if (!next && !saving) onClose() }}
      title={existing ? "Edit event" : "New event"}
      steps={steps}
      activeStepId={step}
      onStepChange={(id) => setStep(id as WizardStepId)}
      submitLabel={saving ? "Saving…" : publishNow && canPublish ? "Save and publish" : existing ? "Save changes" : "Save draft"}
      onSubmit={() => void save()}
      saving={saving}
      submitDisabled={uploading}
      bodyMinHeight={430}
      className="sm:max-w-[680px]"
      secondaryAction={existing && step !== "review" ? <WizardSaveNowButton label="Save changes" saving={saving} disabled={uploading} onSubmit={() => void save()} /> : undefined}
    >
      {/* Enter in a single-line field moves on, so the wizard can be typed straight through. */}
      <div
        className="grid content-start gap-4"
        onKeyDown={(event) => {
          const element = event.target as HTMLElement
          if (event.key !== "Enter" || event.shiftKey || element.tagName !== "INPUT" || (element as HTMLInputElement).type === "file") return
          if (element.closest("[data-rsvp-builder]")) return
          event.preventDefault()
          if (stepIndex < steps.length - 1) setStep(steps[stepIndex + 1].id)
        }}
      >
        {step === "basics" ? (
          <>
            <StepField index={0}>
              <label className={labelClass}>
                {t("Title")}
                <Input autoFocus value={draft.title} maxLength={160} placeholder={t("e.g. Summer social")} aria-invalid={errors.title ? true : undefined}
                  onChange={(change) => { update({ title: change.target.value }); if (errors.title) setErrors((current) => ({ ...current, title: "" })) }} />
                {fieldError(errors.title)}
              </label>
            </StepField>
            <StepField index={1} className="grid gap-1.5">
              <span className="text-[12px] font-medium text-[var(--md-ink)]">{t("Image")} <span className="font-normal text-[var(--md-subtle)]">{t("Optional")}</span></span>
              <button
                type="button"
                disabled={uploading || saving}
                onClick={() => fileRef.current?.click()}
                onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => { event.preventDefault(); setDragging(false); void upload(event.dataTransfer.files?.[0] ?? null) }}
                data-dragging={dragging || undefined}
                className="md-event-wizard__drop group relative grid aspect-[21/9] w-full place-items-center overflow-hidden rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] text-[var(--md-text)] shadow-[var(--md-shadow-line)] outline-none transition-[box-shadow,background-color] duration-200 focus-visible:shadow-[0_0_0_3px_var(--md-accent-a18)] data-[dragging]:bg-[var(--md-accent-a09)] data-[dragging]:shadow-[inset_0_0_0_1.5px_var(--md-accent)]"
                aria-label={draft.imagePath ? t("Replace image") : t("Upload image")}
              >
                <AnimatePresence initial={false} mode="popLayout">
                  {imageUrl ? (
                    <motion.img key={imageUrl} src={imageUrl} alt={t("Event image preview")} className="absolute inset-0 size-full object-cover"
                      initial={reduce ? false : { opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={reduce ? { duration: 0 } : { duration: 0.45, ease: mdEase }} />
                  ) : (
                    <motion.span key="empty" className="grid justify-items-center gap-1.5 text-center" initial={false} exit={{ opacity: 0 }}>
                      <ImagePlus className="size-6 text-[var(--md-subtle)] transition-transform duration-200 group-hover:-translate-y-0.5 motion-reduce:transition-none" strokeWidth={1.3} aria-hidden="true" />
                      <span className="text-[12px]">{uploading ? t("Uploading…") : t("Drop an image or click to choose")}</span>
                      <span className="text-[11px] text-[var(--md-subtle)]">{t("JPEG, PNG or WebP · Up to 5 MB")}</span>
                    </motion.span>
                  )}
                </AnimatePresence>
                {imageUrl && uploading ? <span className="absolute inset-0 grid place-items-center bg-black/30 text-[12px] text-white">{t("Uploading…")}</span> : null}
              </button>
              {draft.imagePath ? (
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" disabled={uploading || saving} onClick={() => fileRef.current?.click()}>{t("Replace image")}</Button>
                  <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => update({ imagePath: null })}>{t("Remove")}</Button>
                </div>
              ) : null}
              {!draft.imagePath ? <p className="text-[11px] leading-4 text-[var(--md-subtle)]">{t("No image? Dexter will make one from the event details when you save.")}</p> : null}
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(change) => void upload(change.target.files?.[0] ?? null)} />
            </StepField>
          </>
        ) : null}

        {step === "when" ? (
          <>
            <StepField index={0} className="grid gap-1.5">
              <span className="text-[12px] font-medium text-[var(--md-ink)]">{t("Date and time")}</span>
              <MeetingTimePicker showLabels startAt={draft.startsAt} endAt={draft.endsAt ?? draft.startsAt} timeZone={draft.timezone}
                onChange={({ startAt, endAt }) => update({ startsAt: startAt, endsAt: endAt })} />
            </StepField>
            <StepField index={1} className="grid gap-1.5">
              <span className="text-[12px] font-medium text-[var(--md-ink)]">{t("Timezone")}</span>
              <TimeZoneSelect variant="field" value={draft.timezone} onChange={(timezone) => update({ timezone })} />
            </StepField>
            <StepField index={2}>
              <LocationAutocomplete autoFocus maxLength={240} value={draft.location} error={errors.location}
                onChange={location => { update({ location }); if (errors.location) setErrors(current => ({ ...current, location: "" })) }} />
            </StepField>
          </>
        ) : null}

        {step === "invite" ? (
          <StepField index={0} className="grid gap-2">
            <EventAudiencePicker audience={draft.audience} invitees={draft.invitees} directory={directory} photoUrls={directoryPhotos}
              loading={!directory && !directoryError} error={directoryError}
              onChange={({ audience, invitees }) => { update({ audience, invitees }); if (errors.invitees) setErrors((current) => ({ ...current, invitees: "" })) }} />
            {fieldError(errors.invitees)}
          </StepField>
        ) : null}

        {step === "details" ? (
          <StepField index={0}>
            <label className={labelClass}>
              <span>{t("Details")} <span className="font-normal text-[var(--md-subtle)]">{t("Optional")}</span></span>
              <Textarea autoFocus value={draft.details} maxLength={8000} rows={9} placeholder={t("Food, dress code, who to ask…")} onChange={(change) => update({ details: change.target.value })} />
              {draft.details.length > 7000 ? <span className="text-[11px] font-normal text-[var(--md-subtle)] [font-variant-numeric:tabular-nums]">{draft.details.length.toLocaleString(language)} / 8,000</span> : null}
            </label>
          </StepField>
        ) : null}

        {step === "rsvp" ? (
          <>
            <StepField index={0}>
              <label className="flex items-center justify-between gap-3 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-3.5 py-3 text-[13px] font-medium text-[var(--md-ink)]">
                <span className="grid gap-0.5">{t("RSVP form")}<span className="text-[12px] font-normal text-[var(--md-text)]">{useForm ? t("Colleagues answer these before they're marked as going.") : t("Off: RSVP is one click.")}</span></span>
                <Switch checked={useForm} onCheckedChange={(next) => { setUseForm(next); if (next && !draft.form.length) setErrors((current) => ({ ...current, form: "" })) }} />
              </label>
            </StepField>
            <AnimatePresence initial={false}>
              {useForm ? (
                <motion.div key="builder" data-rsvp-builder
                  initial={reduce ? false : { opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
                  transition={reduce ? { duration: 0 } : mdMotion.enter} className="grid gap-2 overflow-visible">
                  <RsvpFormBuilder fields={draft.form} errors={formErrors} answeredIds={answeredIds} onChange={(next) => { update({ form: next }); if (Object.keys(formErrors).length) setFormErrors(validateRsvpForm(next)) }} />
                  {responseCount ? <p className="text-[11px] text-[var(--md-subtle)]">{t("Saved responses keep their original answers when you change the form.")}</p> : null}
                </motion.div>
              ) : null}
            </AnimatePresence>
            {fieldError(errors.form)}
          </>
        ) : null}

        {step === "review" ? (
          <>
            <motion.div
              // Decorative preview: the real ticket, inert, so its buttons are not tab stops here.
              inert
              aria-hidden="true"
              initial={reduce ? false : { opacity: 0, y: 10, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 26, delay: 0.06 }}
              className="mx-auto w-full max-w-[520px]"
            >
              <EventTicket title={draft.title.trim() || t("Untitled event")} startsAt={draft.startsAt} endsAt={draft.endsAt} timezone={draft.timezone}
                location={draft.location.trim() || t("No location yet")} imageUrl={imageUrl} rsvp="none" onOpen={() => undefined} onRsvp={() => undefined} />
            </motion.div>
            <StepField index={2}>
              <dl className="grid gap-2 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-4 py-3 text-[12px]">
                {[
                  { label: "Title", value: draft.title.trim(), step: "basics" as const },
                  { label: "When", value: formatEventWhen(draft.startsAt, draft.endsAt, draft.timezone, language), step: "when" as const },
                  { label: "Location", value: draft.location.trim(), step: "when" as const },
                  { label: "Invited", value: draft.audience === "everyone" ? t("Everyone") : directory ? `${audienceReach(directory, draft.audience, draft.invitees)} ${t("people")}${draft.audience === "departments" ? ` · ${draft.invitees.length} ${t(draft.invitees.length === 1 ? "department" : "departments")}` : ""}` : `${draft.invitees.length}`, step: "invite" as const },
                  { label: "RSVP", value: useForm ? `${form.length} ${t(form.length === 1 ? "question" : "questions")}` : t("One click"), step: "rsvp" as const },
                ].map((row) => (
                  <div key={row.label} className="flex items-baseline gap-3">
                    <dt className="w-20 shrink-0 text-[var(--md-subtle)]">{t(row.label)}</dt>
                    <dd className="min-w-0 flex-1 truncate text-[var(--md-ink)]" data-i18n-skip>{row.value || <span className="text-[var(--md-red)]">{t("Missing")}</span>}</dd>
                    <button type="button" className="shrink-0 text-[11px] text-[var(--md-accent)] hover:underline" onClick={() => setStep(row.step)}>{t("Change")}</button>
                  </div>
                ))}
              </dl>
            </StepField>
            {canPublish ? (
              <StepField index={3}>
                <label className="flex items-center justify-between gap-3 px-1 text-[13px] text-[var(--md-ink)]">
                  <span className="grid gap-0.5 font-medium">{t("Publish now")}<span className="text-[12px] font-normal text-[var(--md-text)]">{publishNow ? t("Everyone can see it and RSVP straight away.") : t("Saved as a draft only organisers can see.")}</span></span>
                  <Switch checked={publishNow} onCheckedChange={setPublishNow} />
                </label>
              </StepField>
            ) : null}
          </>
        ) : null}

        {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
      </div>
    </WizardDialog>
  )
}
