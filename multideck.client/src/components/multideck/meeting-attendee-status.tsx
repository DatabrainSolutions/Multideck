import { useState } from "react"
import { Check, CircleHelp, X } from "@/components/icons/hugeicons"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import type { MeetingParticipant } from "@/lib/calendar-api"
import { cn } from "@/lib/utils"

type AttendeeResponse = NonNullable<MeetingParticipant["response"]>

export const attendeeResponseMeta: Record<AttendeeResponse, { label: string; dot: string; text: string }> = {
  accepted: { label: "Accepted", dot: "bg-[var(--md-accent)] text-[var(--md-accent-ink)]", text: "text-[var(--md-accent)]" },
  tentative: { label: "Maybe", dot: "bg-[var(--md-amber)] text-white", text: "text-[var(--md-amber-strong)]" },
  declined: { label: "Declined", dot: "bg-[var(--md-red)] text-white", text: "text-[var(--md-red)]" },
  needs_action: { label: "Awaiting reply", dot: "bg-[var(--md-surface)] text-[var(--md-subtle)] shadow-[inset_0_0_0_1px_var(--md-line-strong)]", text: "text-[var(--md-subtle)]" },
}

const responseOrder: AttendeeResponse[] = ["accepted", "tentative", "needs_action", "declined"]

export function attendeeInitials(name: string, email: string) {
  const source = name.trim() || email.split("@")[0] || "?"
  const parts = source.split(/[\s._-]+/).filter(Boolean)
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts.at(-1)?.[0] ?? "" : "")).toUpperCase() || source.slice(0, 1).toUpperCase()
}

export function summariseResponses(participants: MeetingParticipant[]) {
  const counts: Record<AttendeeResponse, number> = { accepted: 0, tentative: 0, declined: 0, needs_action: 0 }
  for (const participant of participants) counts[participant.response ?? "needs_action"] += 1
  return counts
}

/**
 * A small attendee identity. Workspace profile photos are used when available;
 * initials remain the dependable fallback for external guests and colleagues
 * without a photo. A response mark sits on the bottom edge for quick scanning.
 */
export function AttendeeAvatar({ name, email, photoUrl, response, internal = false, size = "md", className }: {
  name: string
  email: string
  photoUrl?: string | null
  response?: MeetingParticipant["response"]
  internal?: boolean
  size?: "sm" | "md" | "lg"
  className?: string
}) {
  const meta = response ? attendeeResponseMeta[response] : null
  const dimension = size === "sm" ? "size-5 text-[9px]" : size === "lg" ? "size-9 text-[12px]" : "size-7 text-[10.5px]"
  return (
    <Avatar size={size === "sm" ? "sm" : size === "lg" ? "lg" : "default"} className={cn("overflow-visible font-semibold", dimension, className)} aria-hidden="true">
      {photoUrl ? <AvatarImage src={photoUrl} alt="" loading="lazy" /> : null}
      <AvatarFallback className={cn("text-[inherit] font-semibold", internal ? "bg-[var(--md-accent-a10)] text-[var(--md-accent)]" : "bg-[var(--md-surface-tint)] text-[var(--md-text)]")}>
        {attendeeInitials(name, email)}
      </AvatarFallback>
      {meta && response !== "needs_action" ? (
        <span className={cn("absolute -end-0.5 -bottom-0.5 grid place-items-center rounded-full shadow-[0_0_0_1.5px_var(--md-surface)]", size === "sm" ? "size-2.5" : "size-3", meta.dot)}>
          {response === "accepted" ? <Check className={size === "sm" ? "size-1.5" : "size-2"} strokeWidth={3} /> : response === "declined" ? <X className={size === "sm" ? "size-1.5" : "size-2"} strokeWidth={3} /> : <CircleHelp className={size === "sm" ? "size-1.5" : "size-2"} strokeWidth={3} />}
        </span>
      ) : null}
    </Avatar>
  )
}

/**
 * Counts replies in one calm line: "2 accepted · 1 declined · 3 awaiting". Compact mode
 * shows only the numbers with response marks, for calendar blocks and dense rows.
 */
export function MeetingResponseSummary({ participants, compact = false, className }: { participants: MeetingParticipant[]; compact?: boolean; className?: string }) {
  const invitees = participants.filter((participant) => participant.role !== "organiser")
  if (!invitees.length) return null
  const counts = summariseResponses(invitees)
  const parts = responseOrder.filter((response) => counts[response] > 0)
  if (compact) {
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-[10px] tabular-nums", className)} aria-label={parts.map((response) => `${counts[response]} ${attendeeResponseMeta[response].label.toLowerCase()}`).join(", ")}>
        {parts.map((response) => (
          <span key={response} className={cn("inline-flex items-center gap-0.5", attendeeResponseMeta[response].text)}>
            {response === "accepted" ? <Check className="size-2.5" strokeWidth={2.4} /> : response === "declined" ? <X className="size-2.5" strokeWidth={2.4} /> : response === "tentative" ? <CircleHelp className="size-2.5" strokeWidth={2.2} /> : <span className="size-1.5 rounded-full shadow-[inset_0_0_0_1px_currentColor]" />}
            {counts[response]}
          </span>
        ))}
      </span>
    )
  }
  return (
    <p className={cn("text-[11px] text-[var(--md-subtle)]", className)}>
      {parts.map((response, index) => (
        <span key={response}>
          {index > 0 ? " · " : ""}
          <span className={attendeeResponseMeta[response].text}>{counts[response]} {attendeeResponseMeta[response].label.toLowerCase()}</span>
        </span>
      ))}
    </p>
  )
}

/**
 * The attendee roster for a scheduled meeting: organiser first, then replies from
 * accepted to declined, each with an avatar, contact details and response label.
 */
/**
 * Attendees ordered organiser first, then by response. Long lists collapse to
 * `maxVisible` rows with a "Show all" toggle so a 40-person briefing does not
 * push the meeting's actions off screen.
 */
export function MeetingAttendeeList({ participants, maxVisible, filterable = false, className }: {
  participants: MeetingParticipant[]
  maxVisible?: number
  /** Show reply filter chips, for large meetings where "who declined?" matters more than the full roster. */
  filterable?: boolean
  className?: string
}) {
  const [expanded, setExpanded] = useState(false)
  const [filter, setFilter] = useState<AttendeeResponse | "all">("all")
  const counts = summariseResponses(participants)
  const ordered = [...participants]
    .filter((participant) => filter === "all" || (participant.response ?? "needs_action") === filter)
    .sort((left, right) => {
      if ((left.role === "organiser") !== (right.role === "organiser")) return left.role === "organiser" ? -1 : 1
      return responseOrder.indexOf(left.response ?? "needs_action") - responseOrder.indexOf(right.response ?? "needs_action")
    })
  const collapsed = maxVisible !== undefined && !expanded && ordered.length > maxVisible + 1
  const visible = collapsed ? ordered.slice(0, maxVisible) : ordered
  const chips: Array<{ value: AttendeeResponse | "all"; label: string; count: number }> = [
    { value: "all", label: "All", count: participants.length },
    ...responseOrder.filter((response) => counts[response] > 0).map((response) => ({ value: response, label: attendeeResponseMeta[response].label, count: counts[response] })),
  ]
  return (
    <ul className={cn("grid gap-1", className)}>
      {filterable ? (
        <li role="group" aria-label="Filter attendees by reply" className="flex flex-wrap gap-1 px-2 pb-1">
          {chips.map((chip) => (
            <button key={chip.value} type="button" aria-pressed={filter === chip.value} onClick={() => { setFilter(chip.value); setExpanded(false) }} className={cn("inline-flex h-6 items-center gap-1 rounded-full px-2 text-[10.5px] font-medium tabular-nums transition-colors", filter === chip.value ? "bg-[var(--md-accent-a10)] text-[var(--md-accent)]" : "bg-[var(--md-surface-tint)] text-[var(--md-subtle)] hover:text-[var(--md-ink)]")}>
              {chip.label}<span className={cn("opacity-70", filter === chip.value && "opacity-100")}>{chip.count}</span>
            </button>
          ))}
        </li>
      ) : null}
      {filterable && !ordered.length ? <li className="px-2 py-1.5 text-[11.5px] text-[var(--md-subtle)]">No one with that reply yet.</li> : null}
      {visible.map((participant) => {
        const response = participant.response ?? "needs_action"
        return (
          <li key={participant.id || participant.email} className="flex items-center gap-3 rounded-[var(--md-radius-lg)] px-2 py-1.5 transition-colors hover:bg-[var(--md-surface-tint)]">
            <AttendeeAvatar name={participant.name} email={participant.email} photoUrl={participant.photoUrl} response={response} internal={participant.external === false} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-[var(--md-ink)]">
                <span className="truncate">{participant.name || participant.email}</span>
                {participant.role === "organiser" ? <span className="shrink-0 rounded-full bg-[var(--md-surface-tint)] px-1.5 py-px text-[9.5px] font-medium text-[var(--md-subtle)]">Organiser</span> : null}
                {participant.role === "optional" ? <span className="shrink-0 text-[10px] font-normal text-[var(--md-subtle)]">Optional</span> : null}
              </span>
              <span className="block truncate text-[11px] text-[var(--md-subtle)]" dir="ltr">{participant.email}</span>
            </span>
            <span className={cn("shrink-0 text-[11px] font-medium", attendeeResponseMeta[response].text)}>{attendeeResponseMeta[response].label}</span>
          </li>
        )
      })}
      {collapsed || (maxVisible !== undefined && expanded && ordered.length > maxVisible + 1) ? (
        <li>
          <button type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)} className="flex h-8 w-full items-center gap-3 rounded-[var(--md-radius-lg)] px-2 text-start text-[11.5px] font-medium text-[var(--md-accent)] transition-colors hover:bg-[var(--md-surface-tint)]">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--md-surface-tint)] text-[10px] font-semibold text-[var(--md-text)]" aria-hidden="true">{collapsed ? `+${ordered.length - visible.length}` : "–"}</span>
            {collapsed ? `Show all ${ordered.length} attendees` : "Show fewer"}
          </button>
        </li>
      ) : null}
    </ul>
  )
}
