import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { AnimatePresence, MotionConfig, Reorder, motion, useDragControls, useReducedMotion } from "motion/react"
import { ArrowDown, ArrowRight, ArrowUp, Building2, CalendarDays, Check, CircleCheck, CircleHelp, GripVertical, Mail, MapPin, Plus, Ticket, Trash2, UserRound, Users, X, XCircle, type LucideIcon } from "@/components/icons/hugeicons"
import { SegmentedControl } from "@/components/multideck/workflow-components"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { staggerRamp } from "@/lib/motion"
import TearTicket from "@/components/multideck/tear-ticket"
import { RefineFrame, type RefineFrameStatus } from "@/components/multideck/refine-frame"
import { InlineNotice } from "@/components/multideck/inline-notice"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useLanguage } from "@/i18n/language-provider"
import { newFieldId, rsvpFieldTypes, rsvpFormMaxFields, type RsvpAnswers, type RsvpAnswerValue, audienceReach, type EventAttendee, type EventAudience, type EventsDirectory, type RsvpField, type RsvpFieldType, type RsvpStatus } from "@/lib/company-events-api"
import { cn } from "@/lib/utils"
import "./company-event-components.css"

type Translate = (text: string) => string

/** Date and time in the event's own timezone, with the zone named when it differs from the viewer's. */
export function formatEventWhen(startsAt: string, endsAt: string | null, timeZone: string, language: string) {
  const start = new Date(startsAt)
  if (Number.isNaN(start.getTime())) return ""
  const date = new Intl.DateTimeFormat(language, { weekday: "short", day: "numeric", month: "short", year: start.getFullYear() === new Date().getFullYear() ? undefined : "numeric", timeZone }).format(start)
  const time = new Intl.DateTimeFormat(language, { hour: "numeric", minute: "2-digit", timeZone })
  const end = endsAt ? new Date(endsAt) : null
  const sameDay = end && new Intl.DateTimeFormat("en-CA", { timeZone }).format(end) === new Intl.DateTimeFormat("en-CA", { timeZone }).format(start)
  const range = end ? (sameDay ? `${time.format(start)}–${time.format(end)}` : `${time.format(start)} – ${new Intl.DateTimeFormat(language, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone }).format(end)}`) : time.format(start)
  const viewerZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const zone = viewerZone === timeZone ? "" : ` (${timeZone.replace(/_/g, " ")})`
  return `${date} · ${range}${zone}`
}

function dateParts(startsAt: string, timeZone: string, language: string) {
  const date = new Date(startsAt)
  return {
    day: new Intl.DateTimeFormat(language, { day: "numeric", timeZone }).format(date),
    month: new Intl.DateTimeFormat(language, { month: "short", timeZone }).format(date),
    weekday: new Intl.DateTimeFormat(language, { weekday: "short", timeZone }).format(date),
  }
}

export const rsvpOrder: RsvpStatus[] = ["going", "maybe", "not_going"]
export const rsvpLabels: Record<RsvpStatus, { choice: string; short: string; icon: LucideIcon }> = {
  going: { choice: "Yes", short: "Going", icon: CircleCheck },
  maybe: { choice: "Maybe", short: "Maybe", icon: CircleHelp },
  not_going: { choice: "No", short: "Not going", icon: XCircle },
}

/**
 * Yes / Maybe / No for "Are you going?". One pill slides to the saved answer;
 * the answer being saved shows its own progress so a click is never ambiguous.
 * Arrow keys move between options, as in any radio group.
 */
export function RsvpChoice({ value, pending, disabled = false, onChange }: {
  value: RsvpStatus | null
  pending?: RsvpStatus | null
  disabled?: boolean
  onChange: (status: RsvpStatus) => void
}) {
  const { t } = useLanguage()
  const reduce = useReducedMotion()
  const id = useId()
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const shown = pending ?? value
  const focusIndex = Math.max(0, rsvpOrder.indexOf(shown ?? "going"))
  return (
    <div role="radiogroup" aria-label={t("Are you going?")} className="md-rsvp-choice-group" data-disabled={disabled || undefined}>
      {rsvpOrder.map((status, index) => {
        const selected = shown === status
        return (
          <button
            key={status}
            ref={(element) => { refs.current[index] = element }}
            type="button"
            role="radio"
            aria-checked={value === status}
            aria-busy={pending === status || undefined}
            tabIndex={index === focusIndex ? 0 : -1}
            disabled={disabled}
            data-status={status}
            data-selected={selected || undefined}
            className="md-rsvp-choice-group__option"
            onClick={() => { if (status !== value) onChange(status) }}
            onKeyDown={(event) => {
              const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0
              if (!step) return
              event.preventDefault()
              refs.current[(index + step + rsvpOrder.length) % rsvpOrder.length]?.focus()
            }}
          >
            {selected ? (
              <motion.span layoutId={`${id}-pill`} className="md-rsvp-choice-group__pill" aria-hidden="true"
                transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 34 }} />
            ) : null}
            <span className="relative inline-flex items-center gap-1.5">
              {(() => { const Icon = rsvpLabels[status].icon; return <Icon className="size-4" strokeWidth={1.5} aria-hidden="true" /> })()}
              {pending === status ? t("Saving…") : t(rsvpLabels[status].choice)}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export type EventTicketRsvp = "none" | "saving" | RsvpStatus

export type EventTicketProps = {
  title: string
  startsAt: string
  endsAt: string | null
  timezone: string
  location: string
  imageUrl: string | null
  imagePriority?: boolean
  imageFrameStatus?: RefineFrameStatus | null
  onRetryImage?: () => void
  rsvp: EventTicketRsvp
  /** Draft, cancelled or finished: the RSVP button is replaced by this label. */
  closedLabel?: string | null
  goingCount?: number
  onOpen: () => void
  /** Explicit RSVP from the stub menu: Yes, Maybe or No. */
  onRsvp?: (status: RsvpStatus) => void
  /** Past events: drawn quieter and greyed out. */
  muted?: boolean
  className?: string
}

/**
 * A company event rendered by the adapted React Bits TearTicket in its
 * display-only mode: image band, perforated date stub and notches, with no tear
 * gesture. The body opens the event; attendance is only ever the explicit RSVP
 * button in the stub.
 */
export function EventTicket({ title, startsAt, endsAt, timezone, location, imageUrl, imagePriority = false, imageFrameStatus = null, onRetryImage, rsvp, closedLabel, goingCount = 0, onOpen, onRsvp, muted = false, className }: EventTicketProps) {
  const { language, t } = useLanguage()
  const rootRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const element = rootRef.current
    if (!element) return
    const measure = () => setWidth(Math.round(element.clientWidth))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const parts = dateParts(startsAt, timezone, language)
  const when = formatEventWhen(startsAt, endsAt, timezone, language)
  const going = rsvp === "going"
  const answered = rsvp === "going" || rsvp === "maybe" || rsvp === "not_going"
  const roomy = width >= 560
  // Grow the whole ticket as one composition on wider surfaces. The image,
  // content area and date stub retain their proportions instead of stretching
  // a 252px-high mobile card across the desktop column.
  const height = Math.round(Math.max(252, Math.min(332, width * 0.5)))
  return (
    <div ref={rootRef} className={cn("md-event-ticket min-w-0", className)} data-rsvp={rsvp} data-closed={closedLabel ? true : undefined} data-muted={muted || undefined}>
      {width > 0 ? (
        <TearTicket
          interactive={false}
          width={width}
          height={height}
          stubSize={width < 300 ? 84 : width < 380 ? 96 : width < 720 ? 116 : 148}
          radius={roomy ? 16 : 14}
          holes={roomy ? 14 : 12}
          holeSize={6}
          notch={roomy ? 10 : 9}
          imageSpan={roomy ? 0.64 : 0.62}
          imageRadius={roomy ? 10 : 8}
          image={imageFrameStatus ? "" : imageUrl ?? ""}
          imageAlt=""
          imageLoading={imagePriority ? "eager" : "lazy"}
          imagePriority={imagePriority ? "high" : "auto"}
          scrim={false}
          parallax={0}
          background="var(--md-surface)"
          stubBackground="color-mix(in srgb, var(--md-accent) 8%, var(--md-surface))"
          color="var(--md-ink)"
          borderColor="var(--md-line-strong)"
          stub={
            <div className={cn("flex h-full flex-col items-center justify-between text-center", roomy ? "px-3 py-7" : "px-2 py-5")}>
              <div className="grid gap-0.5" aria-hidden="true">
                <span className={cn("font-medium text-[var(--md-text)]", roomy ? "text-[12px]" : "text-[11px]")}>{parts.month}</span>
                <span className={cn("font-medium leading-none tracking-[-0.02em] text-[var(--md-ink)] [font-variant-numeric:tabular-nums]", roomy ? "text-[30px]" : "text-[26px]")}>{parts.day}</span>
                <span className={cn("text-[var(--md-subtle)]", roomy ? "text-[12px]" : "text-[11px]")}>{parts.weekday}</span>
              </div>
              {closedLabel ? <span className="text-[11px] text-[var(--md-subtle)]">{closedLabel}</span> : (
<DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" size="sm" variant={rsvp === "none" ? "default" : "outline"} disabled={rsvp === "saving"} className={cn("w-full", roomy ? "max-w-[110px]" : "max-w-[92px]")}
                      aria-label={rsvp === "none" || rsvp === "saving" ? `${t("RSVP to")} ${title}` : `${t("Your RSVP")}: ${t(rsvpLabels[rsvp].short)}. ${t("Change")}`}>
                      {rsvp === "saving" ? t("Saving…") : rsvp === "none" ? t("RSVP") : t(rsvpLabels[rsvp].short)}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-[168px]">
                    <DropdownMenuRadioGroup value={rsvp === "none" || rsvp === "saving" ? "" : rsvp} onValueChange={(value) => onRsvp?.(value as RsvpStatus)}>
                      {rsvpOrder.map((status) => { const Icon = rsvpLabels[status].icon; return <DropdownMenuRadioItem key={status} value={status} data-rsvp-status={status}><Icon className="size-4 md-rsvp-icon" data-status={status} strokeWidth={1.5} aria-hidden="true" />{t(rsvpLabels[status].choice)}</DropdownMenuRadioItem> })}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          }
        >
          {imageFrameStatus ? <RefineFrame status={imageFrameStatus} src={imageUrl} alt="" onRetry={onRetryImage} className="md-event-ticket__frame" /> : null}
          {!imageUrl && !imageFrameStatus ? (
            <span aria-hidden="true" className="md-event-ticket__art absolute">
              <Ticket className="size-6 text-[var(--md-accent)]" strokeWidth={1.3} />
            </span>
          ) : null}
          <button type="button" onClick={onOpen} className={cn("md-event-ticket__open absolute inset-0 flex flex-col justify-end text-start", roomy ? "px-5 pb-5" : "px-4 pb-4")}>
            <span className={cn("grid min-w-0", roomy ? "gap-1.5" : "gap-1")}>
              <span className={cn("truncate font-medium text-[var(--md-ink)]", roomy ? "text-[17px] leading-6" : "text-[15px] leading-5")} dir="auto" data-i18n-skip>{title}</span>
              <span className={cn("flex min-w-0 items-center gap-1.5 text-[var(--md-text)]", roomy ? "text-[13px]" : "text-[12px]")}>
                <CalendarDays className={cn("shrink-0 text-[var(--md-subtle)]", roomy ? "size-4" : "size-3.5")} strokeWidth={1.4} aria-hidden="true" />
                <span className="truncate">{when}</span>
              </span>
              <span className={cn("flex min-w-0 items-center gap-1.5 text-[var(--md-text)]", roomy ? "text-[13px]" : "text-[12px]")}>
                <MapPin className={cn("shrink-0 text-[var(--md-subtle)]", roomy ? "size-4" : "size-3.5")} strokeWidth={1.4} aria-hidden="true" />
                <span className="truncate" dir="auto" data-i18n-skip>{location}</span>
                {goingCount > 0 ? <span className={cn("ms-auto shrink-0 text-[var(--md-subtle)] [font-variant-numeric:tabular-nums]", roomy ? "text-[12px]" : "text-[11px]")}>{goingCount} {t("going")}</span> : null}
              </span>
            </span>
          </button>
          {/* A closed event says so once, in the stub. */}
          {!closedLabel && answered && rsvp !== "not_going" ? <span className="md-event-ticket__badge" data-tone={rsvp}>{going ? <Check className="size-3" strokeWidth={2} aria-hidden="true" /> : null}{t(rsvpLabels[rsvp].short)}</span> : null}
        </TearTicket>
      ) : <div style={{ height }} aria-hidden="true" />}
    </div>
  )
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?"
}

function PersonAvatar({ person, photoUrl, className }: { person: { name: string }; photoUrl?: string; className?: string }) {
  return (
    <Avatar className={cn("size-8 shrink-0", className)}>
      {photoUrl ? <AvatarImage src={photoUrl} alt="" /> : null}
      <AvatarFallback className="bg-[var(--md-avatar-bg)] text-[11px] font-medium text-[var(--md-ink)]" data-i18n-skip>{initials(person.name)}</AvatarFallback>
    </Avatar>
  )
}

/**
 * One fixed-height row that opens the guest list: a few faces of the people
 * going and the three counts. It never grows with the number of replies.
 */
export function EventAttendeeStrip({ attendees, invitedCount, photoUrls, maxFaces = 4, onOpen }: {
  attendees: EventAttendee[]
  /** People the invitation reaches. Omit to leave the metric off. */
  invitedCount?: number
  photoUrls?: Map<string, string>
  maxFaces?: number
  onOpen?: () => void
}) {
  const { t } = useLanguage()
  const reduce = useReducedMotion()
  const going = attendees.filter((person) => person.status === "going")
  const faces = going.slice(0, maxFaces)
  const count = (status: RsvpStatus) => attendees.filter((person) => person.status === status).length
  return (
    <button type="button" className="md-event-strip group/strip" onClick={onOpen} disabled={!onOpen || (!attendees.length && invitedCount === undefined)}>
      <span className="grid gap-0.5 text-start">
        <span className="text-[13px] font-medium text-[var(--md-ink)]">{t("Who's coming")}</span>
        {attendees.length || invitedCount !== undefined ? (
          <span className="flex items-center gap-3 text-[12px] text-[var(--md-text)] [font-variant-numeric:tabular-nums]">
            <span className="sr-only">{`${invitedCount !== undefined ? `${invitedCount} ${t("invited")}, ` : ""}${count("going")} ${t("going")}, ${count("maybe")} ${t("maybe")}, ${count("not_going")} ${t("not going")}`}</span>
            {invitedCount !== undefined ? <span className="inline-flex items-center gap-1" aria-hidden="true" title={t("Invited")}><Mail className="size-3.5 text-[var(--md-subtle)]" strokeWidth={1.6} />{invitedCount}</span> : null}
            {rsvpOrder.map((status) => {
              const Icon = rsvpLabels[status].icon
              return <span key={status} className="inline-flex items-center gap-1" aria-hidden="true"><Icon className="size-3.5 md-rsvp-icon" data-status={status} strokeWidth={1.6} />{count(status)}</span>
            })}
          </span>
        ) : <span className="text-[12px] text-[var(--md-text)]">{t("No replies yet")}</span>}
      </span>
      {faces.length ? (
        <span className="ms-auto flex items-center" aria-hidden="true">
          {faces.map((person, index) => (
            <motion.span key={person.userId} className="-ms-2 first:ms-0" style={{ zIndex: faces.length - index }}
              initial={reduce ? false : { opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }}
              transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 460, damping: 30, delay: 0.14 + staggerRamp(index, 0.035) }}>
              <PersonAvatar person={person} photoUrl={person.photoPath ? photoUrls?.get(person.photoPath) : undefined} className="size-7 ring-2 ring-[var(--md-surface-tint)]" />
            </motion.span>
          ))}
        </span>
      ) : null}
      {attendees.length ? <ArrowRight className={cn("size-4 shrink-0 text-[var(--md-subtle)] transition-transform duration-200 group-hover/strip:translate-x-0.5 motion-reduce:transition-none rtl:rotate-180", !faces.length && "ms-auto")} strokeWidth={1.4} aria-hidden="true" /> : null}
    </button>
  )
}

const guestListRenderLimit = 150
export type EventGuestStatus = RsvpStatus | "invited"
type InvitedPerson = Pick<EventAttendee, "userId" | "name" | "photoPath">

/**
 * Invited people and everyone who replied, one group at a time. Counts are tabs;
 * search appears once there are enough names to need it; the list has its own
 * height so the view stays still however many people reply. Very long lists
 * render the first 150 matches and ask for a narrower search.
 */
export function EventGuestList({ attendees, invitedCount, invitedPeople, invitationMessage, onRetryInvitations, photoUrls, status, onStatusChange, onSelect, listHeight = 320 }: {
  attendees: EventAttendee[]
  invitedCount?: number
  invitedPeople?: InvitedPerson[]
  invitationMessage?: string
  onRetryInvitations?: () => void
  photoUrls?: Map<string, string>
  status: EventGuestStatus
  onStatusChange: (status: EventGuestStatus) => void
  /** Organisers can open one colleague's RSVP answers. */
  onSelect?: (person: EventAttendee) => void
  /** A fixed height, or "fill" to take the rest of a flex column. */
  listHeight?: number | "fill"
}) {
  const { t } = useLanguage()
  const [query, setQuery] = useState("")
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const options: EventGuestStatus[] = invitedCount === undefined ? rsvpOrder : ["invited", ...rsvpOrder]
  const labels = { ...rsvpLabels, invited: { short: "Invited", icon: Mail } }
  const counts = { ...Object.fromEntries(rsvpOrder.map((item) => [item, attendees.filter((person) => person.status === item).length])), invited: invitedCount } as Record<EventGuestStatus, number>
  const needle = query.trim().toLocaleLowerCase()
  const people = status === "invited" ? invitedPeople ?? [] : attendees.filter((person) => person.status === status)
  const matches = people.filter((person) => !needle || person.name.toLocaleLowerCase().includes(needle))
  const shown = matches.slice(0, guestListRenderLimit)
  return (
    <div className={cn("gap-4", listHeight === "fill" ? "flex min-h-0 flex-1 flex-col" : "grid")}>
      <div role="tablist" aria-label={t("Guests")} className={cn("grid gap-2", invitedCount === undefined ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-4")}>
        {options.map((option, index) => {
          const Icon = labels[option].icon
          return (
            <button key={option} ref={(element) => { refs.current[index] = element }} type="button" role="tab" aria-selected={status === option} tabIndex={status === option ? 0 : -1}
              className="md-event-count" data-selected={status === option || undefined} onClick={() => onStatusChange(option)}
              onKeyDown={(event) => {
                const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0
                if (!step) return
                event.preventDefault()
                const next = (index + step + options.length) % options.length
                onStatusChange(options[next]); refs.current[next]?.focus()
              }}>
              <span className="flex items-center gap-1.5">
                <Icon className="size-4 md-rsvp-icon" data-status={option} strokeWidth={1.6} aria-hidden="true" />
                <span className="text-[18px] font-medium leading-none text-[var(--md-ink)] [font-variant-numeric:tabular-nums]">{counts[option]}</span>
              </span>
              <span className="whitespace-nowrap text-[12px] leading-4 text-[var(--md-text)]">{t(labels[option].short)}</span>
            </button>
          )
        })}
      </div>
      {Math.max(attendees.length, invitedPeople?.length ?? 0) > 8 ? (
        <Input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Search names")} aria-label={t("Search names")} className="h-9 text-base sm:text-[13px]" />
      ) : null}
      <div className={cn("md-guest-list", listHeight === "fill" && "min-h-[220px] flex-1")} role="tabpanel" aria-label={`${t(labels[status].short)}: ${matches.length}`} tabIndex={shown.length > 8 ? 0 : undefined} style={listHeight === "fill" ? undefined : { height: listHeight }}>
        {shown.length ? (
          <ul className="grid gap-0.5 sm:grid-cols-2">
            {shown.map((person) => {
              const content = <><PersonAvatar person={person} photoUrl={person.photoPath ? photoUrls?.get(person.photoPath) : undefined} /><span className="min-w-0 truncate text-[13px] text-[var(--md-ink)]" data-i18n-skip title={person.name}>{person.name}</span></>
              const response = attendees.find((attendee) => attendee.userId === person.userId)
              return <li key={person.userId}>{onSelect && response ? <button type="button" className="md-event-attendee" onClick={() => onSelect(response)}>{content}</button> : <span className="md-event-attendee">{content}</span>}</li>
            })}
          </ul>
        ) : (
          <div className="grid h-full place-content-center justify-items-center gap-2 text-[13px] text-[var(--md-text)]"><p>{status === "invited" && !invitedPeople ? invitationMessage : needle ? t("No names match.") : t("No one yet.")}</p>{status === "invited" && onRetryInvitations ? <Button variant="ghost" size="sm" onClick={onRetryInvitations}>{t("Try again")}</Button> : null}</div>
        )}
        {matches.length > shown.length ? <p className="px-1.5 pt-2 text-[11px] text-[var(--md-subtle)]">{t("Showing the first 150. Search to find someone.")}</p> : null}
      </div>
    </div>
  )
}

const audienceOptions = ["everyone", "people", "departments"] as const
const audienceLabels: Record<EventAudience, { label: string; icon: LucideIcon }> = {
  everyone: { label: "Everyone", icon: Users },
  people: { label: "Specific people", icon: UserRound },
  departments: { label: "Departments", icon: Building2 },
}

/**
 * Who an event is for. Everyone is the default; specific people and departments
 * are chosen from searchable lists. The invited count updates as choices change
 * and uses the same rule the server uses to decide who can see the event.
 */
export function EventAudiencePicker({ audience, invitees, directory, photoUrls, loading = false, error, onChange }: {
  audience: EventAudience
  invitees: string[]
  directory: EventsDirectory | null
  photoUrls?: Map<string, string>
  loading?: boolean
  error?: string | null
  onChange: (next: { audience: EventAudience; invitees: string[] }) => void
}) {
  const { t } = useLanguage()
  const reduce = useReducedMotion()
  const [query, setQuery] = useState("")
  // Each mode keeps its own selection, so trying Departments does not lose the people picked.
  const memory = useRef<Record<EventAudience, string[]>>({ everyone: [], people: audience === "people" ? invitees : [], departments: audience === "departments" ? invitees : [] })
  const reach = directory ? audienceReach(directory, audience, invitees) : null
  const selected = new Set(invitees)
  const needle = query.trim().toLocaleLowerCase()
  const switchTo = (next: EventAudience) => {
    memory.current[audience] = invitees
    setQuery("")
    onChange({ audience: next, invitees: next === "everyone" ? [] : memory.current[next] })
  }
  const toggle = (id: string) => onChange({ audience, invitees: selected.has(id) ? invitees.filter((item) => item !== id) : [...invitees, id] })
  const people = (directory?.people ?? []).filter((person) => !needle || person.name.toLocaleLowerCase().includes(needle) || person.jobTitle?.toLocaleLowerCase().includes(needle))
  const departments = (directory?.departments ?? []).filter((department) => !needle || department.name.toLocaleLowerCase().includes(needle))

  return (
    <div className="grid gap-4">
      <SegmentedControl ariaLabel={t("Who's invited")} options={audienceOptions} value={audience} onChange={switchTo} className="grid w-full grid-cols-3"
        renderOption={(option) => { const Icon = audienceLabels[option].icon; return <><Icon className="size-4" strokeWidth={1.5} aria-hidden="true" /><span className="truncate">{t(audienceLabels[option].label)}</span></> }} />

      <div className="md-audience-reach" aria-live="polite">
        <Mail className="size-4 text-[var(--md-accent)]" strokeWidth={1.5} aria-hidden="true" />
        {reach === null ? <span className="text-[13px] text-[var(--md-text)]">{loading ? t("Loading colleagues…") : t("Invited count unavailable")}</span> : (
          <span className="text-[13px] text-[var(--md-ink)]">
            <span className="font-medium [font-variant-numeric:tabular-nums]">{reach}</span> {t(reach === 1 ? "person invited" : "people invited")}
            {audience === "everyone" ? <span className="text-[var(--md-text)]"> · {t("new colleagues are included automatically")}</span> : null}
          </span>
        )}
      </div>

      {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}

      <AnimatePresence initial={false} mode="popLayout">
        {audience !== "everyone" ? (
          <motion.div key={audience} className="grid gap-2.5"
            initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4, transition: { duration: 0.12 } }}
            transition={reduce ? { duration: 0 } : { duration: 0.24, ease: [0.16, 1, 0.3, 1] }}>
            <div className="flex items-center gap-2">
              <Input type="search" value={query} onChange={(event) => setQuery(event.target.value)} className="h-9 text-base sm:text-[13px]"
                placeholder={t(audience === "people" ? "Search colleagues" : "Search departments")} aria-label={t(audience === "people" ? "Search colleagues" : "Search departments")} />
              {invitees.length ? <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ audience, invitees: [] })}>{t("Clear")} <span className="text-[var(--md-subtle)] [font-variant-numeric:tabular-nums]">{invitees.length}</span></Button> : null}
            </div>
            <ul className="md-audience-list" aria-label={t(audience === "people" ? "Colleagues" : "Departments")}>
              {audience === "people" ? people.map((person) => (
                <li key={person.userId}>
                  <label className="md-audience-row">
                    <Checkbox checked={selected.has(person.userId)} onCheckedChange={() => toggle(person.userId)} />
                    <PersonAvatar person={person} photoUrl={person.photoPath ? photoUrls?.get(person.photoPath) : undefined} className="size-7" />
                    <span className="grid min-w-0">
                      <span className="truncate text-[13px] text-[var(--md-ink)]" data-i18n-skip>{person.name}</span>
                      {person.jobTitle ? <span className="truncate text-[11px] text-[var(--md-subtle)]" data-i18n-skip>{person.jobTitle}</span> : null}
                    </span>
                  </label>
                </li>
              )) : departments.map((department) => (
                <li key={department.id}>
                  <label className="md-audience-row">
                    <Checkbox checked={selected.has(department.id)} onCheckedChange={() => toggle(department.id)} />
                    <span className="grid size-7 shrink-0 place-items-center rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] text-[var(--md-text)]"><Building2 className="size-4" strokeWidth={1.4} aria-hidden="true" /></span>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--md-ink)]" data-i18n-skip>{department.name}</span>
                    <span className="shrink-0 text-[11px] text-[var(--md-subtle)] [font-variant-numeric:tabular-nums]">{department.memberCount} {t(department.memberCount === 1 ? "person" : "people")}</span>
                  </label>
                </li>
              ))}
              {(audience === "people" ? people.length : departments.length) === 0 ? (
                <li className="px-2 py-6 text-center text-[12px] text-[var(--md-text)]">
                  {loading ? t("Loading…") : needle ? t("Nothing matches.") : audience === "departments" ? t("No departments yet. An administrator can add them in Admin → Users.") : t("No colleagues found.")}
                </li>
              ) : null}
            </ul>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

/** Decorative looping ticket for an empty Events page. Reduced motion shows the resting frame. */
export function EventsEmptyArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 128" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className={cn("md-events-empty-art", className)}>
      <g className="md-events-empty-art__back">
        <rect x="46" y="30" width="116" height="62" rx="10" transform="rotate(-7 104 61)" />
      </g>
      <g className="md-events-empty-art__ticket">
        <path className="md-events-empty-art__body" d="M40 34a10 10 0 0 1 10-10h78v76H50a10 10 0 0 1-10-10z" />
        <path className="md-events-empty-art__lines" d="M54 72h44M54 84h28" />
        <rect className="md-events-empty-art__wash" x="50" y="32" width="70" height="30" rx="6" />
        <circle className="md-events-empty-art__sun" cx="104" cy="42" r="5" />
        <path className="md-events-empty-art__accent" d="M58 56l10-10 8 7 7-5 11 8" />
        <g className="md-events-empty-art__stub">
          <path className="md-events-empty-art__body" d="M128 24h22a10 10 0 0 1 10 10v56a10 10 0 0 1-10 10h-22z" />
          <path className="md-events-empty-art__lines" d="M138 46h12M136 58h16M138 70h12" />
        </g>
        <path className="md-events-empty-art__perforation" d="M128 28v68" strokeDasharray="3 5" />
      </g>
      <circle className="md-events-empty-art__spark md-events-empty-art__spark--a" cx="170" cy="22" r="2.5" />
      <circle className="md-events-empty-art__spark md-events-empty-art__spark--b" cx="30" cy="100" r="2" />
      <path className="md-events-empty-art__spark md-events-empty-art__spark--c" d="M176 96l4 4m0-4l-4 4" />
    </svg>
  )
}

export function EventsEmptyState({ canCreate, onCreate, title, message }: { canCreate: boolean; onCreate?: () => void; title: string; message: string }) {
  const { t } = useLanguage()
  return (
    <div className="grid justify-items-center gap-4 px-4 py-14 text-center">
      <EventsEmptyArt />
      <div className="grid max-w-[40ch] gap-1">
        <h2 className="text-[14px] font-medium text-[var(--md-ink)]">{title}</h2>
        <p className="text-pretty text-[12px] leading-5 text-[var(--md-text)]">{message}</p>
      </div>
      {canCreate && onCreate ? <Button type="button" onClick={onCreate}><Plus data-icon="inline-start" strokeWidth={1.4} />{t("New event")}</Button> : null}
    </div>
  )
}

function FieldLabel({ htmlFor, id, children, required, t }: { htmlFor?: string; id?: string; children: ReactNode; required: boolean; t: Translate }) {
  return (
    <label htmlFor={htmlFor} id={id} className="flex items-baseline gap-1.5 text-[12px] font-medium text-[var(--md-ink)]">
      <span dir="auto" data-i18n-skip>{children}</span>
      {!required ? <span className="text-[11px] font-normal text-[var(--md-subtle)]">{t("Optional")}</span> : null}
    </label>
  )
}

/** Renders an RSVP form for answering. Labels stay visible; errors sit under each question. */
export function RsvpFormFields({ form, answers, errors = {}, disabled = false, onChange }: {
  form: RsvpField[]
  answers: RsvpAnswers
  errors?: Record<string, string>
  disabled?: boolean
  onChange: (answers: RsvpAnswers) => void
}) {
  const { t } = useLanguage()
  const baseId = useId()
  const set = (id: string, value: RsvpAnswerValue | undefined) => {
    const next = { ...answers }
    if (value === undefined) delete next[id]
    else next[id] = value
    onChange(next)
  }
  return (
    <div className="grid gap-4">
      {form.map((field) => {
        const id = `${baseId}-${field.id}`
        const errorId = `${id}-error`
        const error = errors[field.id]
        const value = answers[field.id]
        const described = error ? errorId : undefined
        return (
          <div key={field.id} className="grid gap-1.5" data-field-id={field.id}>
            {field.type === "single_choice" || field.type === "multi_choice" || field.type === "yes_no" ? (
              <fieldset className="grid gap-1.5" aria-describedby={described} aria-invalid={error ? true : undefined} disabled={disabled}>
                <legend className="mb-1.5 flex items-baseline gap-1.5 text-[12px] font-medium text-[var(--md-ink)]">
                  <span dir="auto" data-i18n-skip>{field.label}</span>
                  {!field.required ? <span className="text-[11px] font-normal text-[var(--md-subtle)]">{t("Optional")}</span> : null}
                </legend>
                {field.type === "yes_no" ? (
                  <div role="radiogroup" aria-label={field.label} className="flex gap-2">
                    {[true, false].map((option) => (
                      <button key={String(option)} type="button" role="radio" aria-checked={value === option} disabled={disabled}
                        onClick={() => set(field.id, value === option && !field.required ? undefined : option)}
                        className="md-rsvp-choice" data-selected={value === option || undefined}>
                        {t(option ? "Yes" : "No")}
                      </button>
                    ))}
                  </div>
                ) : field.type === "single_choice" ? (
                  <div role="radiogroup" aria-label={field.label} className="grid gap-1.5 sm:grid-cols-2">
                    {(field.options ?? []).map((option) => (
                      <button key={option.id} type="button" role="radio" aria-checked={value === option.id} disabled={disabled}
                        onClick={() => set(field.id, value === option.id && !field.required ? undefined : option.id)}
                        className="md-rsvp-choice justify-start" data-selected={value === option.id || undefined}>
                        <span className="md-rsvp-choice__dot" aria-hidden="true" />
                        <span dir="auto" data-i18n-skip className="min-w-0 truncate">{option.label}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(field.options ?? []).map((option) => {
                      const selected = Array.isArray(value) && value.includes(option.id)
                      return (
                        <label key={option.id} className="flex min-h-9 items-center gap-2.5 rounded-[var(--md-radius-lg)] px-2.5 text-[13px] text-[var(--md-ink)] hover:bg-[var(--md-hover)]">
                          <Checkbox checked={selected} disabled={disabled} onCheckedChange={(checked) => {
                            const current = Array.isArray(value) ? value : []
                            const next = checked ? [...current, option.id] : current.filter((item) => item !== option.id)
                            set(field.id, next.length ? next : undefined)
                          }} />
                          <span dir="auto" data-i18n-skip className="min-w-0 truncate">{option.label}</span>
                        </label>
                      )
                    })}
                  </div>
                )}
              </fieldset>
            ) : (
              <>
                <FieldLabel htmlFor={id} required={field.required} t={t}>{field.label}</FieldLabel>
                {field.type === "long_text" ? (
                  <Textarea id={id} value={typeof value === "string" ? value : ""} disabled={disabled} maxLength={4000} rows={3} aria-invalid={error ? true : undefined} aria-describedby={described} onChange={(event) => set(field.id, event.target.value || undefined)} />
                ) : (
                  <Input id={id} type={field.type === "date" ? "date" : "text"} inputMode={field.type === "number" ? "decimal" : undefined}
                    value={value === undefined ? "" : String(value)} disabled={disabled} maxLength={field.type === "short_text" ? 240 : undefined}
                    aria-invalid={error ? true : undefined} aria-describedby={described}
                    onChange={(event) => set(field.id, event.target.value === "" ? undefined : event.target.value)} />
                )}
              </>
            )}
            {error ? <p id={errorId} className="text-[11px] text-[var(--md-red)]">{t(error)}</p> : null}
          </div>
        )
      })}
    </div>
  )
}

const choiceTypes: RsvpFieldType[] = ["single_choice", "multi_choice"]

function defaultOptions(t: Translate) {
  return [{ id: newFieldId(), label: t("Option 1") }, { id: newFieldId(), label: t("Option 2") }]
}

function BuilderItem({ field, index, count, error, lockedType, onChange, onMove, onRemove, onKeyboardMove }: {
  field: RsvpField
  index: number
  count: number
  error?: string
  lockedType: boolean
  onChange: (field: RsvpField) => void
  onMove: (to: number) => void
  onRemove: () => void
  onKeyboardMove: (to: number) => void
}) {
  const { t } = useLanguage()
  const controls = useDragControls()
  const labelId = useId()
  const isChoice = choiceTypes.includes(field.type)
  return (
    <Reorder.Item
      value={field}
      dragListener={false}
      dragControls={controls}
      className="md-rsvp-builder__item"
      data-invalid={error ? true : undefined}
      whileDrag={{ scale: 1.01, boxShadow: "var(--md-shadow-lift)" }}
    >
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className="md-rsvp-builder__handle"
          aria-label={`${t("Reorder")} ${field.label || t("question")}, ${index + 1} ${t("of")} ${count}. ${t("Use arrow keys to move.")}`}
          onPointerDown={(event) => controls.start(event)}
          onKeyDown={(event) => {
            if (event.key === "ArrowUp" && index > 0) { event.preventDefault(); onKeyboardMove(index - 1) }
            if (event.key === "ArrowDown" && index < count - 1) { event.preventDefault(); onKeyboardMove(index + 1) }
          }}
        >
          <GripVertical className="size-4" strokeWidth={1.4} aria-hidden="true" />
        </button>
        <Select value={field.type} disabled={lockedType} onValueChange={(type) => {
          const next = type as RsvpFieldType
          onChange({ ...field, type: next, options: choiceTypes.includes(next) ? (field.options?.length ? field.options : defaultOptions(t)) : undefined })
        }}>
          <SelectTrigger size="sm" className="h-8 w-auto min-w-[148px] text-[12px]" aria-label={t("Question type")}><SelectValue /></SelectTrigger>
          <SelectContent>{rsvpFieldTypes.map((item) => <SelectItem key={item.type} value={item.type}>{t(item.label)}</SelectItem>)}</SelectContent>
        </Select>
        <div className="ms-auto flex items-center">
          <Button type="button" variant="ghost" size="icon-sm" aria-label={t("Move up")} disabled={index === 0} onClick={() => onMove(index - 1)}><ArrowUp className="size-3.5" strokeWidth={1.4} /></Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={t("Move down")} disabled={index === count - 1} onClick={() => onMove(index + 1)}><ArrowDown className="size-3.5" strokeWidth={1.4} /></Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`${t("Remove")} ${field.label || t("question")}`} onClick={onRemove}><Trash2 className="size-3.5" strokeWidth={1.4} /></Button>
        </div>
      </div>
      <div className="mt-2.5 grid gap-1.5">
        <label id={labelId} htmlFor={`${labelId}-input`} className="text-[11px] font-medium text-[var(--md-text)]">{t("Question")}</label>
        <Input id={`${labelId}-input`} value={field.label} maxLength={160} placeholder={t("e.g. Dietary requirements")} aria-invalid={error && !field.label.trim() ? true : undefined} onChange={(event) => onChange({ ...field, label: event.target.value })} />
      </div>
      {isChoice ? (
        <div className="mt-3 grid gap-1.5">
          <span className="text-[11px] font-medium text-[var(--md-text)]">{t("Options")}</span>
          {(field.options ?? []).map((option, optionIndex) => (
            <div key={option.id} className="flex items-center gap-1.5">
              <Input value={option.label} maxLength={80} aria-label={`${t("Option")} ${optionIndex + 1}`} onChange={(event) => onChange({ ...field, options: (field.options ?? []).map((item) => item.id === option.id ? { ...item, label: event.target.value } : item) })} />
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`${t("Remove option")} ${optionIndex + 1}`} disabled={(field.options ?? []).length <= 2} onClick={() => onChange({ ...field, options: (field.options ?? []).filter((item) => item.id !== option.id) })}><X className="size-3.5" strokeWidth={1.4} /></Button>
            </div>
          ))}
          {(field.options ?? []).length < 20 ? (
            <Button type="button" variant="ghost" size="sm" className="justify-self-start" onClick={() => onChange({ ...field, options: [...(field.options ?? []), { id: newFieldId(), label: `${t("Option")} ${(field.options ?? []).length + 1}` }] })}>
              <Plus data-icon="inline-start" strokeWidth={1.4} />{t("Add option")}
            </Button>
          ) : null}
        </div>
      ) : null}
      <label className="mt-3 flex items-center gap-2 text-[12px] text-[var(--md-ink)]">
        <Switch checked={field.required} onCheckedChange={(required) => onChange({ ...field, required })} />
        {t("Required")}
      </label>
      {lockedType ? <p className="mt-2 text-[11px] text-[var(--md-subtle)]">{t("Answered already, so the type is locked.")}</p> : null}
      {error ? <p className="mt-2 text-[11px] text-[var(--md-red)]" role="alert">{t(error)}</p> : null}
    </Reorder.Item>
  )
}

/**
 * Builds an RSVP form. Drag by the handle, use the arrow buttons, or focus the
 * handle and press the arrow keys. `answeredIds` locks the type of questions
 * that already have answers, matching the server rule.
 */
export function RsvpFormBuilder({ fields, onChange, errors = {}, answeredIds = [] }: {
  fields: RsvpField[]
  onChange: (fields: RsvpField[]) => void
  errors?: Record<string, string>
  answeredIds?: string[]
}) {
  const { t } = useLanguage()
  const [announcement, setAnnouncement] = useState("")
  const [focusId, setFocusId] = useState<string | null>(null)
  const listRef = useRef<HTMLOListElement>(null)
  useEffect(() => {
    if (!focusId) return
    listRef.current?.querySelector<HTMLElement>(`[data-builder-id="${focusId}"] .md-rsvp-builder__handle`)?.focus()
    setFocusId(null)
  }, [focusId, fields])
  const move = (from: number, to: number, keepFocus = false) => {
    if (to < 0 || to >= fields.length || from === to) return
    const next = [...fields]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    onChange(next)
    setAnnouncement(`${item.label || t("Question")} ${t("moved to position")} ${to + 1} ${t("of")} ${fields.length}.`)
    if (keepFocus) setFocusId(item.id)
  }
  const add = (type: RsvpFieldType) => {
    const field: RsvpField = { id: newFieldId(), type, label: "", required: false, ...(choiceTypes.includes(type) ? { options: defaultOptions(t) } : {}) }
    onChange([...fields, field])
    window.requestAnimationFrame(() => listRef.current?.querySelector<HTMLInputElement>(`[data-builder-id="${field.id}"] input`)?.focus())
  }
  return (
    <MotionConfig reducedMotion="user">
      <div className="grid gap-3">
        {fields.length ? (
          <Reorder.Group ref={listRef} as="ol" axis="y" values={fields} onReorder={onChange} className="grid gap-2.5">
            {fields.map((field, index) => (
              <div key={field.id} data-builder-id={field.id} className="contents">
                <BuilderItem
                  field={field}
                  index={index}
                  count={fields.length}
                  error={errors[field.id]}
                  lockedType={answeredIds.includes(field.id)}
                  onChange={(next) => onChange(fields.map((item) => item.id === field.id ? next : item))}
                  onMove={(to) => move(index, to)}
                  onKeyboardMove={(to) => move(index, to, true)}
                  onRemove={() => { onChange(fields.filter((item) => item.id !== field.id)); setAnnouncement(`${field.label || t("Question")} ${t("removed")}.`) }}
                />
              </div>
            ))}
          </Reorder.Group>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" className="justify-self-start" disabled={fields.length >= rsvpFormMaxFields}>
              <Plus data-icon="inline-start" strokeWidth={1.4} />{t("Add question")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[200px]">
            {rsvpFieldTypes.map((item) => <DropdownMenuItem key={item.type} onSelect={() => add(item.type)}>{t(item.label)}</DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>
        {fields.length >= rsvpFormMaxFields ? <p className="text-[11px] text-[var(--md-subtle)]">{t("Forms can have up to 20 questions.")}</p> : null}
        <p className="sr-only" aria-live="polite">{announcement}</p>
      </div>
    </MotionConfig>
  )
}
