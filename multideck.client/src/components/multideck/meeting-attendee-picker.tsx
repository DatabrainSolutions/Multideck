import { useEffect, useId, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Building2, Mail, UserRoundPlus, Users, X } from "@/components/icons/hugeicons"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { AttendeeAvatar } from "@/components/multideck/meeting-attendee-status"
import { searchMeetingPeople, type MeetingParticipant, type MeetingPersonSuggestion } from "@/lib/calendar-api"
import { cn } from "@/lib/utils"

const emailPattern = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/

export function isLikelyAttendeeEmail(value: string) {
  return emailPattern.test(value.trim())
}

type Option =
  | { type: "person"; key: string; person: MeetingPersonSuggestion }
  | { type: "email"; key: string; email: string }

const kindLabels: Record<MeetingPersonSuggestion["kind"], string> = { team: "Your team", contact: "Contacts", lead: "Leads" }
const kindOrder: MeetingPersonSuggestion["kind"][] = ["team", "contact", "lead"]

function extractEmails(value: string) {
  return value.split(/[,;\s]+/).map((part) => part.replace(/^<|>$/g, "").trim()).filter((part) => isLikelyAttendeeEmail(part))
}

/**
 * Attendees are added the way a mail client does it: start typing a name or address
 * and Multideck suggests colleagues in this workspace, CRM contacts and leads. Any
 * complete email address can be added too. Chosen people become compact chips;
 * long lists fold to the first few with a count so the composer stays calm.
 */
export function MeetingAttendeePicker({
  value,
  onChange,
  search = searchMeetingPeople,
  disabled = false,
  autoFocus = false,
  placeholder = "Add attendees",
  maxVisible = 6,
  className,
}: {
  value: MeetingParticipant[]
  onChange: (next: MeetingParticipant[]) => void
  /** Injectable for previews; defaults to the tenant people search. */
  search?: (query: string, signal?: AbortSignal) => Promise<{ people: MeetingPersonSuggestion[] }>
  disabled?: boolean
  autoFocus?: boolean
  placeholder?: string
  maxVisible?: number
  className?: string
}) {
  const inputId = useId()
  const listId = `${inputId}-listbox`
  const shouldReduceMotion = useReducedMotion()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const anchorRef = useRef<HTMLDivElement | null>(null)
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [people, setPeople] = useState<MeetingPersonSuggestion[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [invalid, setInvalid] = useState(false)

  const chosen = useMemo(() => new Set(value.map((attendee) => attendee.email.toLowerCase())), [value])

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    // Mark the search as pending straight away so the debounce window never
    // shows "no one matches" before the lookup has actually run.
    setLoading(true)
    const timer = window.setTimeout(() => {
      search(query.trim(), controller.signal)
        .then((result) => { if (!controller.signal.aborted) setPeople(result.people) })
        .catch(() => { if (!controller.signal.aborted) setPeople([]) })
        .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    }, query ? 160 : 0)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [open, query, search])

  const options = useMemo<Option[]>(() => {
    const trimmed = query.trim()
    const list: Option[] = people
      .filter((person) => !chosen.has(person.email.toLowerCase()))
      .map((person) => ({ type: "person", key: person.id, person }))
    if (isLikelyAttendeeEmail(trimmed) && !chosen.has(trimmed.toLowerCase()) && !people.some((person) => person.email.toLowerCase() === trimmed.toLowerCase())) {
      list.unshift({ type: "email", key: `email:${trimmed.toLowerCase()}`, email: trimmed })
    }
    return list
  }, [chosen, people, query])

  useEffect(() => setActiveIndex(0), [options.length, query])

  function add(attendees: MeetingParticipant[]) {
    const next = [...value]
    for (const attendee of attendees) {
      const email = attendee.email.trim().toLowerCase()
      if (!email || next.some((existing) => existing.email.toLowerCase() === email)) continue
      next.push({ ...attendee, email })
    }
    onChange(next)
    setQuery("")
    setInvalid(false)
  }

  function choose(option: Option) {
    if (option.type === "person") add([{ name: option.person.name, email: option.person.email, external: option.person.external }])
    else add([{ name: option.email.split("@")[0], email: option.email, external: true }])
    inputRef.current?.focus()
  }

  function commitTyped() {
    const emails = extractEmails(query)
    if (emails.length) { add(emails.map((email) => ({ name: email.split("@")[0], email, external: true }))); return true }
    if (query.trim()) setInvalid(true)
    return false
  }

  function remove(email: string) {
    onChange(value.filter((attendee) => attendee.email !== email))
  }

  const hidden = !expanded && value.length > maxVisible ? value.length - maxVisible : 0
  const visible = hidden ? value.slice(0, maxVisible) : value
  const showList = open && !disabled && (options.length > 0 || loading || query.trim().length > 0)

  return (
    <div className={cn("grid gap-1.5", className)}>
      <Popover open={showList} onOpenChange={(next) => { if (!next) setOpen(false) }}>
        <PopoverAnchor asChild>
          <div
            ref={anchorRef}
            className={cn(
              "premium-stroke-soft flex min-h-10 flex-wrap items-center gap-1.5 rounded-[var(--md-radius-lg)] bg-[var(--md-field-bg)] px-2 py-1.5 transition-[background-color,box-shadow] duration-160 ease-[cubic-bezier(0.22,1,0.36,1)] focus-within:bg-[var(--md-field-bg-hover)] focus-within:ring-3 focus-within:ring-ring/50 hover:bg-[var(--md-field-bg-hover)]",
              disabled && "opacity-60",
              invalid && "ring-3 ring-[color-mix(in_srgb,var(--md-red)_24%,transparent)]",
            )}
            onMouseDown={(event) => {
              if (event.target !== event.currentTarget) return
              event.preventDefault()
              inputRef.current?.focus()
            }}
          >
            <AnimatePresence initial={false}>
              {visible.map((attendee) => (
                <motion.span
                  key={attendee.email.toLowerCase()}
                  layout={!shouldReduceMotion}
                  initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={shouldReduceMotion ? undefined : { opacity: 0, scale: 0.92 }}
                  transition={{ type: "spring", duration: 0.28, bounce: 0 }}
                  className="min-w-0 max-w-full"
                >
                  <span className="group inline-flex h-7 max-w-full items-center gap-1.5 rounded-full bg-[var(--md-surface)] ps-0.5 pe-0.5 text-[12px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)]" title={attendee.email}>
                    <AttendeeAvatar name={attendee.name} email={attendee.email} internal={attendee.external === false} size="sm" className="size-6 text-[9.5px]" />
                    <bdi dir="auto" className="min-w-0 truncate">{attendee.name?.trim() || attendee.email}</bdi>
                    <button
                      type="button"
                      disabled={disabled}
                      aria-label={`Remove ${attendee.name || attendee.email}`}
                      className="grid size-5 shrink-0 place-items-center rounded-full text-[var(--md-subtle)] outline-none transition-[background-color,color,scale] duration-150 hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a20)] active:scale-[0.9] disabled:opacity-50"
                      onClick={() => remove(attendee.email)}
                    >
                      <X className="size-3" strokeWidth={1.8} aria-hidden="true" />
                    </button>
                  </span>
                </motion.span>
              ))}
            </AnimatePresence>
            {hidden ? (
              <button type="button" onClick={() => setExpanded(true)} className="inline-flex h-7 items-center rounded-full bg-[var(--md-surface-tint)] px-2.5 text-[11.5px] font-medium text-[var(--md-text)] shadow-[var(--md-shadow-line)] transition-colors hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)]">
                +{hidden} more
              </button>
            ) : null}
            <input
              id={inputId}
              ref={inputRef}
              type="text"
              role="combobox"
              autoComplete="off"
              spellCheck={false}
              disabled={disabled}
              autoFocus={autoFocus}
              aria-expanded={showList}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={showList && options[activeIndex] ? `${listId}-${activeIndex}` : undefined}
              aria-invalid={invalid || undefined}
              aria-label="Attendees"
              placeholder={value.length ? "Add more" : placeholder}
              value={query}
              className={cn("h-7 min-w-[120px] flex-1 bg-transparent text-[16px] text-[var(--md-ink)] outline-none placeholder:text-[var(--md-subtle)] sm:text-[13px]", invalid && "text-[var(--md-red)]")}
              onFocus={() => setOpen(true)}
              onBlur={() => { setOpen(false); if (extractEmails(query).length) commitTyped() }}
              onChange={(event) => {
                const next = event.target.value
                setInvalid(false)
                setOpen(true)
                if (/[,;]$/.test(next) && extractEmails(next).length) { setQuery(next); add(extractEmails(next).map((email) => ({ name: email.split("@")[0], email, external: true }))); return }
                setQuery(next)
              }}
              onPaste={(event) => {
                const pasted = event.clipboardData.getData("text")
                const emails = extractEmails(pasted)
                if (emails.length < 1 || !/[,;\s]/.test(pasted.trim())) return
                event.preventDefault()
                add(emails.map((email) => ({ name: email.split("@")[0], email, external: true })))
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" && options.length) { event.preventDefault(); setOpen(true); setActiveIndex((index) => (index + 1) % options.length); return }
                if (event.key === "ArrowUp" && options.length) { event.preventDefault(); setActiveIndex((index) => (index - 1 + options.length) % options.length); return }
                if (event.key === "Enter" || (event.key === "Tab" && query.trim())) {
                  if (!query.trim() && !(showList && options[activeIndex])) return
                  event.preventDefault()
                  if (showList && options[activeIndex]) choose(options[activeIndex])
                  else commitTyped()
                  return
                }
                if (event.key === "Escape" && showList) { event.preventDefault(); event.stopPropagation(); setOpen(false); return }
                if (event.key === "Backspace" && query === "" && value.length) { event.preventDefault(); remove(value[value.length - 1].email) }
              }}
            />
          </div>
        </PopoverAnchor>
        <PopoverContent
          align="start"
          sideOffset={6}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onInteractOutside={(event) => { if (anchorRef.current?.contains(event.target as Node)) event.preventDefault() }}
          className="md-scrollbar z-[500] max-h-[min(320px,var(--radix-popover-content-available-height))] w-[var(--radix-popover-trigger-width)] min-w-[280px] overflow-y-auto rounded-[var(--md-radius-xl)] border-0 bg-[color-mix(in_srgb,var(--md-surface)_96%,transparent)] p-1.5 shadow-[var(--md-shadow-lift)] backdrop-blur-xl"
        >
          <ul id={listId} role="listbox" aria-label="Attendee suggestions" className="grid gap-0.5">
            {options.flatMap((option, index) => {
              const active = index === activeIndex
              const previous = options[index - 1]
              const groupStart = option.type === "person" && (index === 0 || previous?.type !== "person" || previous.person.kind !== option.person.kind)
              const heading = groupStart && option.type === "person"
                ? <li key={`${option.key}-group`} role="presentation" className="px-2 pt-1.5 pb-1 text-[10.5px] font-medium uppercase tracking-[.06em] text-[var(--md-subtle)]">{kindLabels[option.person.kind]}</li>
                : null
              const item = (
                <li
                  key={option.key}
                  role="option"
                  id={`${listId}-${index}`}
                  aria-selected={active}
                  className={cn("flex w-full cursor-default items-center gap-2.5 rounded-[var(--md-radius-lg)] px-2 py-1.5 text-start transition-colors", active && "bg-[var(--md-accent-a10)]")}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => choose(option)}
                >
                  {option.type === "person" ? (
                    <>
                      <AttendeeAvatar name={option.person.name} email={option.person.email} internal={!option.person.external} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-medium text-[var(--md-ink)]">{option.person.name}</span>
                        <span className="block truncate text-[11px] text-[var(--md-subtle)]" dir="ltr">{option.person.email}{option.person.detail ? ` · ${option.person.detail}` : ""}</span>
                      </span>
                      {option.person.kind === "team" ? <Users className="size-3.5 shrink-0 text-[var(--md-subtle)]" strokeWidth={1.4} aria-hidden="true" /> : <Building2 className="size-3.5 shrink-0 text-[var(--md-subtle)]" strokeWidth={1.4} aria-hidden="true" />}
                    </>
                  ) : (
                    <>
                      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--md-surface-tint)] text-[var(--md-text)]"><UserRoundPlus className="size-3.5" strokeWidth={1.5} aria-hidden="true" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-medium text-[var(--md-ink)]">Invite {option.email}</span>
                        <span className="block text-[11px] text-[var(--md-subtle)]">They receive an invitation with their own management link.</span>
                      </span>
                    </>
                  )}
                </li>
              )
              return heading ? [heading, item] : [item]
            })}
            {!options.length ? (
              <li className="flex items-center gap-2.5 px-2 py-2.5 text-[11.5px] text-[var(--md-subtle)]">
                <Mail className="size-3.5 shrink-0" strokeWidth={1.4} aria-hidden="true" />
                {loading ? "Searching…" : query.trim() ? "No one matches yet. Type a full email address to invite someone new." : "Start typing a name or email address."}
              </li>
            ) : null}
          </ul>
        </PopoverContent>
      </Popover>
      {invalid ? <p role="alert" className="text-[11px] text-[var(--md-red)]">Enter a complete email address to invite someone.</p> : null}
      {value.length >= 4 ? (
        <p className="text-[11px] text-[var(--md-subtle)]">
          {value.length} attendees
          {value.some((attendee) => attendee.external === false) ? ` · ${value.filter((attendee) => attendee.external === false).length} from your team` : ""}
          {expanded && value.length > maxVisible ? <button type="button" onClick={() => setExpanded(false)} className="ms-2 font-medium text-[var(--md-accent)] hover:underline">Show fewer</button> : null}
        </p>
      ) : null}
    </div>
  )
}
