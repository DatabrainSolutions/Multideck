import { useEffect, useRef, useState, type ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { AiEditing, X } from "@/components/icons/hugeicons"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { useLanguage } from "@/i18n/language-provider"
import type { MeetingPersonSuggestion } from "@/lib/calendar-api"
import { dedupeAddresses, formatAddress, isLikelyEmailAddress, parseAddressInput, type MailAddress } from "@/lib/inbox-api"
import { reduceMotion } from "@/lib/motion"
import { cn } from "@/lib/utils"

export type MailRecipientSearch = (query: string, signal?: AbortSignal) => Promise<{ people: MeetingPersonSuggestion[] }>

function addressInitial(address: MailAddress) {
  const source = address.displayName?.trim() || address.address
  return source.slice(0, 1).toUpperCase()
}

/**
 * Splits typed or pasted text into the addresses that parsed and the fragments
 * that did not. The leftovers stay in the input rather than disappearing, so a
 * mistyped address is corrected where it was written.
 */
function splitRecipientInput(value: string): { valid: MailAddress[]; leftover: string[] } {
  const valid: MailAddress[] = []
  const leftover: string[] = []

  for (const entry of value.split(/[,;\n]/).map((part) => part.trim()).filter(Boolean)) {
    const parsed = parseAddressInput(entry)
    if (parsed.length > 0 && parsed.every((address) => isLikelyEmailAddress(address.address))) valid.push(...parsed)
    else leftover.push(entry)
  }

  return { valid, leftover }
}

function RecipientChip({
  address,
  onRemove,
  disabled,
}: {
  address: MailAddress
  onRemove: () => void
  disabled: boolean
}) {
  const { t } = useLanguage()
  const label = address.displayName?.trim() || address.address

  return (
    <span
      className="group inline-flex h-7 max-w-full items-center gap-1.5 rounded-full bg-[var(--md-surface)] ps-1 pe-1 text-[12.5px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)]"
      title={formatAddress(address)}
    >
      <span
        aria-hidden="true"
        className="grid size-5 shrink-0 place-items-center rounded-full bg-[var(--md-accent-a10)] text-[10px] font-semibold text-[var(--md-accent)]"
      >
        {addressInitial(address)}
      </span>
      <bdi data-i18n-skip dir="auto" className="min-w-0 truncate">
        {label}
      </bdi>
      <button
        type="button"
        disabled={disabled}
        aria-label={`${t("Remove")} ${address.address}`}
        className="grid size-5 shrink-0 place-items-center rounded-full text-[var(--md-subtle)] outline-none transition-[background-color,color,scale] duration-150 hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a20)] active:scale-[0.96] disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:scale-100"
        onClick={onRemove}
      >
        <X className="size-3" strokeWidth={1.8} aria-hidden="true" />
      </button>
    </span>
  )
}

/**
 * One address row: a label, the chips already committed, and a bare input that
 * turns text into another chip on Enter, comma, Tab or blur.
 */
export function MailRecipientField({
  inputId,
  label,
  addresses,
  onChange,
  placeholder,
  disabled,
  autoFocus,
  lockedLabel,
  lockedTitle,
  trailing,
  search,
  onInputChange,
  invalid: fieldInvalid,
  describedBy,
  className,
  labelClassName,
}: {
  inputId: string
  label: string
  addresses: MailAddress[]
  onChange: (next: MailAddress[]) => void
  placeholder?: string
  disabled: boolean
  autoFocus?: boolean
  /** A recipient the server resolves. Shown, never edited. */
  lockedLabel?: string | null
  lockedTitle?: string
  trailing?: ReactNode
  /** Optional tenant-scoped lookup, opened by typing @. */
  search?: MailRecipientSearch
  /** Report uncommitted text so validation cannot silently omit an address. */
  onInputChange?: (value: string) => void
  invalid?: boolean
  describedBy?: string
  className?: string
  labelClassName?: string
}) {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const [draft, setDraft] = useState("")
  const [invalid, setInvalid] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const anchorRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [searchError, setSearchError] = useState(false)
  const [people, setPeople] = useState<MeetingPersonSuggestion[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const listId = `${inputId}-people`
  const query = draft.trim().replace(/^@/, "")
  const showSuggestions = Boolean(search && open && draft.trim().startsWith("@") && !disabled)
  const options = people.filter(person => !addresses.some(address => address.address.toLowerCase() === person.email.toLowerCase()))

  useEffect(() => {
    if (!showSuggestions || !search) return
    const controller = new AbortController()
    setLoading(true)
    setSearchError(false)
    setPeople([])
    setActiveIndex(0)
    const timer = window.setTimeout(() => {
      void search(query, controller.signal)
        .then(result => { if (!controller.signal.aborted) setPeople(result.people) })
        .catch(() => { if (!controller.signal.aborted) setSearchError(true) })
        .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    }, query ? 160 : 0)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [showSuggestions, query, search])

  function updateInput(value: string) {
    setDraft(value)
    onInputChange?.(value)
  }

  function choose(person: MeetingPersonSuggestion) {
    onChange(dedupeAddresses([...addresses, { address: person.email, displayName: person.name }]))
    updateInput("")
    setInvalid(false)
    setOpen(false)
    inputRef.current?.focus()
  }

  function commit(value: string, keepLeftover: boolean) {
    const { valid, leftover } = splitRecipientInput(value)
    if (valid.length > 0) onChange(dedupeAddresses([...addresses, ...valid]))
    updateInput(keepLeftover ? leftover.join(", ") : "")
    setInvalid(keepLeftover && leftover.length > 0)
  }

  return (
    <div className={cn("flex min-h-11 items-start gap-2 px-3 py-1.5", className)}>
      <label
        htmlFor={inputId}
        className={cn("mt-[7px] w-[54px] shrink-0 cursor-text text-[12px] font-medium text-[var(--md-subtle)]", labelClassName)}
      >
        {label}
      </label>

      <Popover open={showSuggestions} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
      <div
        ref={anchorRef}
        data-mail-recipient-content
        className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 py-1"
        onMouseDown={(event) => {
          // Clicking the empty part of the row should land in the input, the way
          // it does in a native client, without stealing a click from a chip.
          if (event.target !== event.currentTarget) return
          event.preventDefault()
          inputRef.current?.focus()
        }}
      >
        {lockedLabel ? (
          <span
            title={lockedTitle}
            className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-full bg-[var(--md-surface-tint)] px-2 text-[12.5px] text-[var(--md-text)] shadow-[var(--md-shadow-line)]"
          >
            <AiEditing className="size-3 shrink-0 text-[var(--md-accent)]" strokeWidth={1.6} aria-hidden="true" />
            <span className="min-w-0 truncate">{lockedLabel}</span>
          </span>
        ) : null}

        <AnimatePresence initial={false}>
          {addresses.map((address) => (
            <motion.span
              key={address.address.toLowerCase()}
              layout={!shouldReduceMotion}
              initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={shouldReduceMotion ? undefined : { opacity: 0, scale: 0.96 }}
              transition={reduceMotion(Boolean(shouldReduceMotion), { type: "spring", duration: 0.2, bounce: 0 })}
              className="min-w-0 max-w-full"
            >
              <RecipientChip
                address={address}
                disabled={disabled}
                onRemove={() => onChange(addresses.filter((item) => item.address !== address.address))}
              />
            </motion.span>
          ))}
        </AnimatePresence>

        <input
          id={inputId}
          ref={inputRef}
          type="text"
          inputMode="email"
          autoComplete="off"
          spellCheck={false}
          dir="ltr"
          data-i18n-skip
          disabled={disabled}
          autoFocus={autoFocus}
          role={search ? "combobox" : undefined}
          aria-expanded={search ? showSuggestions : undefined}
          aria-controls={showSuggestions ? listId : undefined}
          aria-autocomplete={search ? "list" : undefined}
          aria-activedescendant={showSuggestions && options[activeIndex] ? `${listId}-${activeIndex}` : undefined}
          aria-invalid={invalid || fieldInvalid || undefined}
          aria-describedby={[invalid ? `${inputId}-hint` : undefined, describedBy].filter(Boolean).join(" ") || undefined}
          placeholder={search ? "@ Add people" : addresses.length === 0 && !lockedLabel ? placeholder : undefined}
          value={draft}
          className={cn(
            "h-7 w-0 min-w-[min(100px,100%)] flex-1 bg-transparent text-[16px] text-[var(--md-ink)] outline-none placeholder:text-[var(--md-subtle)] disabled:opacity-55 sm:text-[13px]",
            invalid && "text-[var(--md-red)]",
          )}
          onChange={(event) => {
            const value = event.target.value
            setInvalid(false)
            setOpen(true)
            // A separator finishes the address the way it does in a native client.
            if (/[,;]/.test(value)) commit(value, true)
            else updateInput(value)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return
            if (showSuggestions && (event.key === "ArrowDown" || event.key === "ArrowUp") && options.length) {
              event.preventDefault()
              setActiveIndex(index => (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length)
              return
            }
            if (showSuggestions && event.key === "Escape") {
              event.preventDefault()
              event.stopPropagation()
              setOpen(false)
              return
            }
            if (event.key === "Enter" || event.key === "Tab") {
              if (!draft.trim()) return
              event.preventDefault()
              event.stopPropagation()
              if (showSuggestions && !loading && options[activeIndex]) { choose(options[activeIndex]); return }
              commit(draft, true)
              return
            }
            if (event.key === "Backspace" && draft === "" && addresses.length > 0) {
              event.preventDefault()
              onChange(addresses.slice(0, -1))
            }
          }}
          onPaste={(event) => {
            const pasted = event.clipboardData.getData("text")
            if (!/[,;\n]/.test(pasted)) return
            event.preventDefault()
            commit(`${draft}${draft ? "," : ""}${pasted}`, true)
          }}
          onBlur={() => {
            setOpen(false)
            if (draft.trim()) commit(draft, true)
          }}
        />
      </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={6}
        onOpenAutoFocus={event => event.preventDefault()}
        onCloseAutoFocus={event => event.preventDefault()}
        onInteractOutside={event => { if (anchorRef.current?.contains(event.target as Node)) event.preventDefault() }}
        className="md-scrollbar z-[500] max-h-[min(280px,var(--radix-popover-content-available-height))] w-[min(340px,calc(100vw-32px))] overflow-y-auto rounded-[var(--md-radius-lg)] border-0 bg-[var(--md-surface)] p-1.5 shadow-[var(--md-shadow-lift)] motion-reduce:animate-none motion-reduce:transition-none"
      >
        {loading || searchError || !options.length ? <p role="status" className="px-2 py-2 text-[12px] text-[var(--md-subtle)]">
          {t(loading ? "Finding people…" : searchError ? "People could not be loaded. Enter an email address instead." : "No matching people. Enter an email address instead.")}
        </p> : null}
        <ul id={listId} role="listbox" aria-label={`${label} ${t("recipient suggestions")}`} className="grid gap-0.5">
          {!loading && options.map((person, index) => <li
            key={person.id}
            id={`${listId}-${index}`}
            role="option"
            aria-selected={index === activeIndex}
            className={cn("min-w-0 cursor-default rounded-[var(--md-radius-md)] px-2 py-2 text-[13px]", index === activeIndex && "bg-[var(--md-accent-a10)]")}
            onMouseDown={event => event.preventDefault()}
            onMouseEnter={() => setActiveIndex(index)}
            onClick={() => choose(person)}
          >
            <span data-i18n-skip className="block truncate text-[var(--md-ink)]">{person.name}</span>
            <span data-i18n-skip dir="ltr" className="block truncate text-[12px] text-[var(--md-subtle)]">{person.email}</span>
          </li>)}
        </ul>
      </PopoverContent>
      </Popover>

      {/* Outside the wrapping chip area, so a long recipient list never pushes
          the Cc and Bcc toggles onto a line of their own. */}
      {trailing ? <span className="ms-auto mt-0.5 flex shrink-0 items-center gap-0.5">{trailing}</span> : null}

      {invalid ? (
        <p id={`${inputId}-hint`} role="alert" className="sr-only">
          {t("Enter a complete email address.")}
        </p>
      ) : null}
    </div>
  )
}
