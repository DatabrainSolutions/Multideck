import { useEffect, useMemo, useState } from "react"
import { Check, GripVertical, Plus, Search, Trash2, TriangleAlert, UserRound, Users, UsersRound, X } from "@/components/icons/hugeicons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { AttendeeAvatar } from "@/components/multideck/meeting-attendee-status"
import { meetingProviderLabels } from "@/components/multideck/meeting-provider-mark"
import { TagEntryField } from "@/components/multideck/tag-entry-field"
import {
  bookingLinkKindLabels,
  bookingQuestionTypeLabels,
  listBookingHostCandidates,
  type BookingHostCandidate,
  type BookingLinkKind,
  type BookingQuestion,
  type BookingQuestionType,
  type CalendarProvider,
} from "@/lib/calendar-api"
import { cn } from "@/lib/utils"

const kindOrder: BookingLinkKind[] = ["one_on_one", "round_robin", "collective"]
const kindIcons = { one_on_one: UserRound, round_robin: Users, collective: UsersRound } as const

/**
 * Three quiet radio cards for how a booking link shares work: one person, a
 * team taking turns, or everyone together. The copy does the explaining so the
 * builder never needs a help panel.
 */
export function BookingLinkKindPicker({ value, onChange, disabled = false, className }: {
  value: BookingLinkKind
  onChange: (kind: BookingLinkKind) => void
  disabled?: boolean
  className?: string
}) {
  return (
    <div role="radiogroup" aria-label="Booking link type" className={cn("grid gap-1.5 sm:grid-cols-3", className)}>
      {kindOrder.map((kind) => {
        const Icon = kindIcons[kind]
        const active = value === kind
        return (
          <button
            key={kind}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(kind)}
            className={cn(
              "grid min-h-[72px] content-start gap-1 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] p-3 text-start transition-[background-color,box-shadow] duration-150 hover:bg-[var(--md-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a24)] disabled:cursor-not-allowed disabled:opacity-60",
              active && "bg-[var(--md-accent-a10)] shadow-[inset_0_0_0_1px_var(--md-accent-a28)] hover:bg-[var(--md-accent-a10)]",
            )}
          >
            <span className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--md-ink)]">
              <Icon className={cn("size-3.5", active ? "text-[var(--md-accent)]" : "text-[var(--md-subtle)]")} strokeWidth={1.7} aria-hidden="true" />
              {bookingLinkKindLabels[kind].label}
            </span>
            <span className="text-[10.5px] leading-4 text-[var(--md-subtle)]">{bookingLinkKindLabels[kind].description}</span>
          </button>
        )
      })}
    </div>
  )
}

function providerConnectionCode(provider: CalendarProvider): BookingHostCandidate["connectedProviders"][number] | null {
  return provider === "google_meet" ? "google" : provider === "microsoft_teams" ? "microsoft" : provider === "zoom" ? "zoom" : null
}

/**
 * Pick colleagues to share a booking link. You are always a host. A host who
 * has not connected the chosen meeting provider is still selectable but marked,
 * because round robin quietly skips them and collective links cannot book at all.
 */
export function BookingHostPicker({ value, onChange, kind, provider, load = listBookingHostCandidates, disabled = false, className }: {
  /** Selected host user IDs, excluding the signed-in owner (who is implicit). */
  value: string[]
  onChange: (hostUserIds: string[]) => void
  kind: BookingLinkKind
  provider: CalendarProvider
  /** Injectable for previews; defaults to the tenant host list. */
  load?: (signal?: AbortSignal) => Promise<{ hosts: BookingHostCandidate[] }>
  disabled?: boolean
  className?: string
}) {
  const [hosts, setHosts] = useState<BookingHostCandidate[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  useEffect(() => {
    const controller = new AbortController()
    setError(null)
    load(controller.signal).then((result) => setHosts(result.hosts)).catch((reason) => {
      if (controller.signal.aborted) return
      setError(reason instanceof Error ? reason.message : "Hosts could not be loaded.")
    })
    return () => controller.abort()
  }, [load])
  const needed = providerConnectionCode(provider)
  const self = hosts?.find((host) => host.self) ?? null
  // Saved links list the owner among their hosts; the owner is implicit here, so drop them from the editable value once we know who they are.
  useEffect(() => {
    if (self && value.includes(self.userId)) onChange(value.filter((id) => id !== self.userId))
  }, [self, value, onChange])
  const others = useMemo(() => {
    const term = query.trim().toLowerCase()
    return (hosts ?? []).filter((host) => !host.self && (!term || [host.name, host.email, host.detail ?? ""].some((field) => field.toLowerCase().includes(term))))
  }, [hosts, query])
  const selected = (hosts ?? []).filter((host) => !host.self && value.includes(host.userId))
  const unready = [...(self ? [self] : []), ...selected].filter((host) => needed && !host.connectedProviders.includes(needed))
  const othersSelected = self ? value.filter((id) => id !== self.userId) : value

  function toggle(userId: string) {
    onChange(othersSelected.includes(userId) ? othersSelected.filter((id) => id !== userId) : [...othersSelected, userId])
  }

  return (
    <div className={cn("grid gap-2", className)}>
      <div className="flex flex-wrap items-center gap-1.5">
        {self ? <HostChip host={self} pinned /> : null}
        {selected.map((host) => <HostChip key={host.userId} host={host} onRemove={disabled ? undefined : () => toggle(host.userId)} />)}
        {!selected.length ? <span className="text-[11px] text-[var(--md-subtle)]">{kind === "collective" ? "Add the colleagues who must all attend." : "Add the colleagues who share this link."}</span> : null}
      </div>
      {unready.length && needed ? (
        <p role="status" className="flex items-start gap-1.5 rounded-[var(--md-radius-md)] bg-[color-mix(in_srgb,var(--md-amber)_10%,var(--md-surface))] px-2.5 py-2 text-[10.5px] leading-4 text-[var(--md-ink)]">
          <TriangleAlert className="mt-px size-3 shrink-0 text-[var(--md-amber)]" aria-hidden="true" />
          <span>
            {unready.map((host) => host.self ? "You" : host.name).join(", ")} {unready.length === 1 && !unready[0].self ? "has" : "have"} not connected {meetingProviderLabels[provider]}.{" "}
            {kind === "round_robin" ? "They will not be offered until they connect it." : "Nobody can book until everyone connects it."}
          </span>
        </p>
      ) : null}
      <div className="overflow-hidden rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)]">
        <label className="flex items-center gap-2 px-3 py-2 text-[var(--md-subtle)]">
          <Search className="size-3.5 shrink-0" aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} disabled={disabled || !hosts} placeholder="Find a colleague" aria-label="Find a colleague" className="h-6 w-full min-w-0 bg-transparent text-[12px] text-[var(--md-ink)] outline-none placeholder:text-[var(--md-subtle)]" />
        </label>
        <ul role="listbox" aria-multiselectable="true" aria-label="Hosts" className="max-h-56 divide-y divide-[var(--md-line)] overflow-y-auto">
          {error ? <li className="px-3 py-3 text-[11px] text-[var(--md-red)]">{error}</li> : null}
          {!error && !hosts ? <li className="px-3 py-3 text-[11px] text-[var(--md-subtle)]">Loading colleagues…</li> : null}
          {hosts && !others.length ? <li className="px-3 py-3 text-[11px] text-[var(--md-subtle)]">{query ? "No colleague matches that." : "No other active colleagues yet."}</li> : null}
          {others.map((host) => {
            const active = value.includes(host.userId)
            const ready = !needed || host.connectedProviders.includes(needed)
            return (
              <li key={host.userId} role="option" aria-selected={active}>
                <button type="button" disabled={disabled} onClick={() => toggle(host.userId)} className={cn("grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 px-3 py-2 text-start transition-colors hover:bg-[var(--md-hover)] focus-visible:outline-none focus-visible:bg-[var(--md-hover)]", active && "bg-[var(--md-accent-a10)] hover:bg-[var(--md-accent-a10)]")}>
                  <AttendeeAvatar name={host.name} email={host.email} internal size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate text-[12px] text-[var(--md-ink)]">{host.name}</span>
                    <span className="block truncate text-[10.5px] text-[var(--md-subtle)]">{[host.detail, ready ? null : `${meetingProviderLabels[provider]} not connected`].filter(Boolean).join(" · ") || host.email}</span>
                  </span>
                  <span className={cn("grid size-4 place-items-center rounded-full transition-colors", active ? "bg-[var(--md-accent)] text-[var(--md-on-accent,white)]" : "shadow-[inset_0_0_0_1px_var(--md-line-strong,var(--md-line))]")} aria-hidden="true">
                    {active ? <Check className="size-2.5" strokeWidth={3} /> : null}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

function HostChip({ host, pinned = false, onRemove }: { host: BookingHostCandidate; pinned?: boolean; onRemove?: () => void }) {
  return (
    <span className={cn("inline-flex h-7 items-center gap-1.5 rounded-full ps-1 pe-2 text-[11px] text-[var(--md-ink)]", pinned ? "bg-[var(--md-accent-a10)]" : "bg-[var(--md-surface-tint)]")}>
      <AttendeeAvatar name={host.name} email={host.email} internal size="sm" />
      <span className="max-w-[140px] truncate">{pinned ? "You" : host.name}</span>
      {onRemove ? <button type="button" onClick={onRemove} aria-label={`Remove ${host.name}`} className="-me-1 grid size-5 place-items-center rounded-full text-[var(--md-subtle)] transition-colors hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)]"><X className="size-3" /></button> : null}
    </span>
  )
}

const builtInQuestions: BookingQuestion[] = [
  { id: "company", label: "Company", type: "short_text", builtIn: true },
  { id: "phone", label: "Phone", type: "phone", builtIn: true },
  { id: "notes", label: "What would you like to discuss?", type: "long_text", builtIn: true },
]
const questionTypeOrder: BookingQuestionType[] = ["short_text", "long_text", "email", "phone", "number", "select", "checkbox"]

export const defaultBookingQuestions = builtInQuestions

/**
 * Builds the public booking form. Name and email are fixed; three common
 * questions toggle on and off; custom questions pick an answer type and can be
 * required. Choice questions edit their options inline so nothing opens a
 * second panel.
 */
export function BookingQuestionBuilder({ value, onChange, maxQuestions = 12, disabled = false, className }: {
  value: BookingQuestion[]
  onChange: (questions: BookingQuestion[]) => void
  maxQuestions?: number
  disabled?: boolean
  className?: string
}) {
  function patch(id: string, changes: Partial<BookingQuestion>) {
    onChange(value.map((question) => question.id === id ? { ...question, ...changes } : question))
  }
  function toggleBuiltIn(question: BookingQuestion, enabled: boolean) {
    onChange(enabled ? [...value.filter((item) => item.id !== question.id), { ...question, required: false }] : value.filter((item) => item.id !== question.id))
  }
  function add() {
    onChange([...value, { id: `question-${crypto.randomUUID().slice(0, 8)}`, label: "", type: "short_text", required: false }])
  }
  const custom = value.filter((question) => !question.builtIn)
  return (
    <div className={cn("@container grid gap-3", className)}>
      <ul className="grid gap-1">
        <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 text-[11px] text-[var(--md-subtle)]">
          <span>Name and email</span>
          <span className="text-[10.5px]">Always asked</span>
        </li>
        {builtInQuestions.map((question) => {
          const selected = value.find((item) => item.id === question.id)
          return (
            <li key={question.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] px-3 py-2">
              <span className={cn("truncate text-[11.5px]", selected ? "text-[var(--md-ink)]" : "text-[var(--md-subtle)]")}>{question.label}</span>
              <label className={cn("flex items-center gap-1.5 text-[10.5px] text-[var(--md-subtle)] transition-opacity", !selected && "opacity-0 pointer-events-none")}>
                <Switch size="sm" aria-label={`Require ${question.label}`} checked={Boolean(selected?.required)} disabled={disabled || !selected} onCheckedChange={(required) => selected && patch(question.id, { required })} />Required
              </label>
              <Switch size="sm" checked={Boolean(selected)} disabled={disabled} onCheckedChange={(enabled) => toggleBuiltIn(question, enabled)} aria-label={`Ask for ${question.label}`} />
            </li>
          )
        })}
      </ul>
      {custom.length ? (
        <ul className="grid gap-1.5">
          {custom.map((question) => (
            <li key={question.id} className="grid gap-2 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] p-2">
              <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 @min-[540px]:grid-cols-[auto_minmax(0,1fr)_128px_auto_auto]">
                <GripVertical className="size-3.5 text-[var(--md-subtle)]" aria-hidden="true" />
                <Input aria-label="Question" value={question.label} disabled={disabled} onChange={(event) => patch(question.id, { label: event.target.value })} placeholder="Ask a question" className="h-8 rounded-[var(--md-radius-sm)] bg-[var(--md-surface)] text-[12px]" />
                <Select value={question.type ?? "short_text"} disabled={disabled} onValueChange={(type) => patch(question.id, { type: type as BookingQuestionType, options: type === "select" ? question.options ?? [] : undefined })}>
                  <SelectTrigger aria-label={`${question.label || "Question"} answer type`} className="col-start-2 h-8 rounded-[var(--md-radius-sm)] bg-[var(--md-surface)] text-[11.5px] @min-[540px]:col-start-auto"><SelectValue /></SelectTrigger>
                  <SelectContent className="z-[500]">{questionTypeOrder.map((type) => <SelectItem key={type} value={type}>{bookingQuestionTypeLabels[type]}</SelectItem>)}</SelectContent>
                </Select>
                <label className="col-start-2 flex items-center gap-1.5 text-[10.5px] text-[var(--md-subtle)] @min-[540px]:col-start-auto">
                  <Switch size="sm" aria-label={`Require ${question.label || "this question"}`} checked={Boolean(question.required)} disabled={disabled} onCheckedChange={(required) => patch(question.id, { required })} />Required
                </label>
                <Button type="button" variant="ghost" size="icon" disabled={disabled} aria-label={`Remove ${question.label || "question"}`} className="col-start-3 row-start-1 size-8 rounded-[var(--md-radius-sm)] @min-[540px]:col-start-auto @min-[540px]:row-start-auto" onClick={() => onChange(value.filter((item) => item.id !== question.id))}><Trash2 className="size-3.5" /></Button>
              </div>
              {question.type === "select" ? (
                <TagEntryField
                  id={`${question.id}-options`}
                  terms={question.options ?? []}
                  onTermsChange={(options) => patch(question.id, { options })}
                  maxTerms={20}
                  maxTermLength={120}
                  disabled={disabled}
                  placeholder="Add a choice and press Enter"
                  inputLabel={`Choices for ${question.label || "this question"}`}
                  addLabel="Add choice"
                  removeLabel={(choice) => `Remove ${choice}`}
                  duplicateMessage="That choice is already listed."
                  limitMessage="Up to twenty choices."
                  className="ps-6"
                />
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <Button type="button" variant="ghost" size="sm" onClick={add} disabled={disabled || value.length >= maxQuestions} className="h-8 w-fit rounded-[var(--md-radius-md)]"><Plus className="size-3.5" />Add question</Button>
    </div>
  )
}
