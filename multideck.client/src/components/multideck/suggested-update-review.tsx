import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { AiEditing, ArrowRight, Check, CheckCircle2, CircleHelp, FileCheck2, Link2, LoaderCircle, MailOpen, Search, Target, TriangleAlert, XCircle } from "@/components/icons/hugeicons"
import { DexterActionPill } from "@/components/multideck/dexter-action-pill"
import { StatusPill } from "@/components/multideck/status-pill"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { useLanguage } from "@/i18n/language-provider"
import { searchInboxSuggestedUpdateBookings, type InboxSuggestedBookingOption, type InboxSuggestedUpdate, type InboxSuggestedUpdateField } from "@/lib/inbox-api"
import { cn } from "@/lib/utils"

type MatchState = "matched" | "ambiguous" | "no_match"

function valueLabel(field: InboxSuggestedUpdateField, value: unknown, language: string) {
  if (value === null || value === undefined || value === "") return "—"
  if (field.code === "planned_arrival_at" && typeof value === "string") {
    const date = new Date(value)
    if (Number.isFinite(date.getTime())) return new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(date)
  }
  if (field.code === "gross_weight_kg" && typeof value === "number") {
    return `${new Intl.NumberFormat(language, { maximumFractionDigits: 2 }).format(value)} kg`
  }
  return String(value)
}

function documentTypeLabel(type: InboxSuggestedUpdate["documentType"]) {
  return type === "booking_confirmation" ? "Booking confirmation" : "Commercial invoice"
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function matchEvidence(suggestion: InboxSuggestedUpdate) {
  const matching = record(suggestion.evidence.matching)
  const sender = record(matching.sender)
  const candidates = Array.isArray(matching.candidates) ? matching.candidates.map(record) : []
  const storedState = matching.matchState
  const state: MatchState = suggestion.targetId
    ? "matched"
    : storedState === "ambiguous" ? "ambiguous" : "no_match"
  return {
    state,
    senderAddress: typeof sender.address === "string" ? sender.address : null,
    candidateCount: candidates.length,
  }
}

function matchMethodLabel(suggestion: InboxSuggestedUpdate) {
  if (suggestion.matchMethod === "manual_selection") return "Selected by you"
  if (suggestion.matchMethod === "booking_reference") return "Exact booking reference"
  if (suggestion.matchMethod === "carrier_reference") return "Exact carrier reference"
  if (suggestion.matchMethod === "normalised_reference_sender") return "Booking reference and sender"
  if (suggestion.matchMethod?.startsWith("sender_context_")) return "Sender and shipment details"
  return "Verified booking evidence"
}

function statusPresentation(suggestion: InboxSuggestedUpdate, matchState: MatchState) {
  if (suggestion.status === "applied") return { label: suggestion.matchMethod === "manual_selection" && suggestion.fields.length === 0 ? "Added to booking" : "Applied", tone: "green" as const }
  if (suggestion.status === "dismissed") return { label: "Dismissed", tone: "red" as const }
  if (suggestion.status === "ready") return { label: "Ready to review", tone: "teal" as const }
  if (suggestion.status === "no_changes") return { label: "Already up to date", tone: "blue" as const }
  if (matchState === "ambiguous") return { label: "Ambiguous match", tone: "amber" as const }
  if (suggestion.status === "failed") return { label: "Review unavailable", tone: "red" as const }
  return { label: "No safe match", tone: "amber" as const }
}

function ManualBookingAttachment({ busy, onAttach }: { busy: boolean; onAttach: (bookingId: string) => void }) {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [bookings, setBookings] = useState<InboxSuggestedBookingOption[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle")

  useEffect(() => {
    if (!open) return
    let active = true
    const timer = window.setTimeout(() => {
      setState("loading")
      void searchInboxSuggestedUpdateBookings(query).then((items) => {
        if (!active) return
        setBookings(items)
        setActiveIndex(0)
        setState("ready")
      }).catch(() => {
        if (!active) return
        setBookings([])
        setState("error")
      })
    }, query.trim() ? 180 : 0)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [open, query])

  useEffect(() => {
    if (open) window.requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  const selectedBooking = useMemo(() => bookings.find((booking) => booking.id === selectedId) ?? null, [bookings, selectedId])

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault()
      setOpen(false)
      return
    }
    if (!bookings.length) return
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      const movement = event.key === "ArrowDown" ? 1 : -1
      setActiveIndex((current) => (current + movement + bookings.length) % bookings.length)
      return
    }
    if (event.key === "Enter") {
      event.preventDefault()
      const booking = bookings[activeIndex]
      if (booking) setSelectedId(booking.id)
    }
  }

  return (
    <div className="min-w-0">
      <DexterActionPill
        type="button"
        aria-expanded={open}
        disabled={busy}
        icon={Link2}
        label={t("Add to booking")}
        className="h-10 min-w-[132px] px-3.5 text-[12.5px]"
        onClick={() => setOpen((current) => !current)}
      />
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={shouldReduceMotion ? false : { opacity: 0, y: -4, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -3, scale: 0.99 }}
            transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="mt-3 w-[min(460px,calc(100vw-2rem))] overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-1.5 text-start shadow-[var(--md-shadow-lift)]"
          >
            <div className="px-2 pb-2 pt-1.5">
              <p className="text-[12.5px] font-medium text-[var(--md-ink)]">{t("Choose a booking")}</p>
              <p className="mt-0.5 text-[11px] leading-[1.4] text-[var(--md-subtle)]">{t("The document will be attached only. Extracted booking fields will not change.")}</p>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--md-subtle)]" strokeWidth={1.4} aria-hidden="true" />
              <Input
                ref={inputRef}
                role="combobox"
                aria-expanded="true"
                aria-controls={listId}
                aria-activedescendant={bookings[activeIndex] ? `${listId}-option-${activeIndex}` : undefined}
                value={query}
                onChange={(event) => { setQuery(event.target.value); setSelectedId(null) }}
                onKeyDown={handleKeyDown}
                placeholder={t("Booking, customer or route")}
                className="h-9 rounded-[var(--md-radius-lg)] ps-8 pe-9 text-[12px]"
              />
              {state === "loading" ? <LoaderCircle className="pointer-events-none absolute end-2.5 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-[var(--md-accent)] motion-reduce:animate-none" aria-hidden="true" /> : null}
            </div>
            <div id={listId} role="listbox" aria-label={t("Bookings")} className="mt-1 max-h-56 overflow-y-auto p-0.5 md-scrollbar">
              {bookings.map((booking, index) => (
                <button
                  id={`${listId}-option-${index}`}
                  key={booking.id}
                  type="button"
                  role="option"
                  aria-selected={selectedId === booking.id}
                  onPointerMove={() => setActiveIndex(index)}
                  onClick={() => setSelectedId(booking.id)}
                  className={cn(
                    "grid min-h-12 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[var(--md-radius-lg)] px-2.5 py-2 text-start outline-none transition-[background-color,box-shadow] duration-150 hover:bg-[var(--md-hover)] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]",
                    index === activeIndex && "bg-[var(--md-hover)]",
                    selectedId === booking.id && "bg-[var(--md-selected-bg)] shadow-[inset_0_0_0_1px_var(--md-accent-a20)]",
                  )}
                >
                  <span className="min-w-0">
                    <span data-i18n-skip dir="ltr" className="block truncate text-[12px] font-medium text-[var(--md-ink)]">{booking.reference}</span>
                    <span data-i18n-skip dir="auto" className="mt-0.5 block truncate text-[11px] text-[var(--md-text)]">{[booking.customer, booking.route].filter(Boolean).join(" · ")}</span>
                  </span>
                  {selectedId === booking.id ? <Check className="size-4 text-[var(--md-accent)]" strokeWidth={1.7} aria-hidden="true" /> : <span className="text-[10.5px] text-[var(--md-subtle)]">{t(booking.status)}</span>}
                </button>
              ))}
              {state === "ready" && bookings.length === 0 ? <p className="px-3 py-5 text-center text-[11.5px] text-[var(--md-subtle)]">{t("No matching bookings")}</p> : null}
              {state === "error" ? <p role="alert" className="px-3 py-5 text-center text-[11.5px] text-[var(--md-status-red-ink)]">{t("Bookings could not be loaded. Try again.")}</p> : null}
            </div>
            <div className="mt-1 flex items-center justify-between gap-3 px-1 py-1 shadow-[var(--md-stroke-top)]">
              <Button type="button" variant="ghost" disabled={busy} className="h-9 px-2.5 text-[12px] text-[var(--md-subtle)]" onClick={() => setOpen(false)}>{t("Cancel")}</Button>
              <Button type="button" disabled={!selectedBooking || busy} className="h-9 rounded-[var(--md-radius-md)] bg-[var(--md-accent)] px-3 text-[12px] text-[var(--md-accent-ink)] hover:bg-[var(--md-accent-hover)]" onClick={() => selectedBooking && onAttach(selectedBooking.id)}>
                {busy ? <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Link2 className="size-3.5" strokeWidth={1.5} aria-hidden="true" />}
                {t("Add document")}
              </Button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

export function SuggestedUpdateReview({
  suggestion,
  selectedFieldIds,
  busy = false,
  actionError = null,
  onToggleField,
  onApply,
  onAttachToBooking,
  onDismiss,
  onOpenSource,
  className,
}: {
  suggestion: InboxSuggestedUpdate
  selectedFieldIds: Set<string>
  busy?: boolean
  actionError?: string | null
  onToggleField: (fieldId: string, selected: boolean) => void
  onApply: () => void
  onAttachToBooking: (bookingId: string) => void
  onDismiss: () => void
  onOpenSource: () => void
  className?: string
}) {
  const { language, t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const actionable = suggestion.status === "ready"
  const resolved = suggestion.status === "applied" || suggestion.status === "dismissed"
  const selectedCount = suggestion.fields.filter((field) => selectedFieldIds.has(field.id)).length
  const appliedCount = suggestion.fields.filter((field) => Boolean(field.appliedAt)).length
  const matching = matchEvidence(suggestion)
  const status = statusPresentation(suggestion, matching.state)
  const canDismiss = !resolved && ["ready", "needs_match", "no_changes"].includes(suggestion.status)
  const needsBooking = suggestion.status === "needs_match"
  const manuallyAttached = suggestion.status === "applied" && suggestion.matchMethod === "manual_selection" && suggestion.fields.length === 0
  const MatchIcon = matching.state === "matched" ? Target : matching.state === "ambiguous" ? CircleHelp : TriangleAlert
  const matchTone = matching.state === "matched" ? "green" : matching.state === "ambiguous" ? "amber" : "red"

  const actions = canDismiss || actionable ? (
    <div className="mt-3 flex flex-wrap items-start justify-between gap-3 px-1">
      {canDismiss ? (
        <Button type="button" variant="ghost" disabled={busy} className="h-10 rounded-[var(--md-radius-md)] px-3 text-[12.5px] text-[var(--md-subtle)] hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] active:scale-[0.96] motion-reduce:active:scale-100" onClick={onDismiss}>
          {t(needsBooking ? "No, don't add" : "Dismiss")}
        </Button>
      ) : <span />}
      {needsBooking ? <ManualBookingAttachment busy={busy} onAttach={onAttachToBooking} /> : actionable ? (
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-3">
          <AnimatePresence initial={false}>
            {selectedCount === 0 ? (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-[11.5px] text-[var(--md-amber)]" role="status">
                {t("Select at least one change")}
              </motion.p>
            ) : null}
          </AnimatePresence>
          <DexterActionPill
            icon={CheckCircle2}
            disabled={selectedCount === 0 || busy}
            label={busy ? t("Applying selected changes") : `${t("Apply")} ${selectedCount} ${t(selectedCount === 1 ? "change" : "changes")}`}
            className="min-w-[168px]"
            onClick={onApply}
          />
        </div>
      ) : null}
    </div>
  ) : null

  return (
    <section className={cn("h-full min-h-0 bg-[var(--md-bg)]", className)} aria-labelledby={`suggestion-title-${suggestion.id}`}>
      <div className="h-full min-h-0 overflow-y-auto md-scrollbar">
        <div className="mx-auto max-w-[980px] px-4 py-5 sm:px-6 sm:py-7">
          <header className="mx-auto flex max-w-[720px] flex-col items-center text-center">
            <StatusPill tone={status.tone}>{t(status.label)}</StatusPill>
            <h1 id={`suggestion-title-${suggestion.id}`} className="mt-3 text-[21px] font-medium tracking-[-0.025em] text-[var(--md-ink)]">
              {suggestion.targetLabel ? <bdi data-i18n-skip dir="auto">{suggestion.targetLabel}</bdi> : t(matching.state === "ambiguous" ? "Review the possible booking matches" : "This document is not attached to a booking")}
            </h1>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11.5px] text-[var(--md-subtle)]">
              {suggestion.matchConfidence !== null ? <span>{Math.round(suggestion.matchConfidence * 100)}% {t("match confidence")}</span> : null}
              {suggestion.targetId ? <span>{t(matchMethodLabel(suggestion))}</span> : null}
              {matching.senderAddress ? <span data-i18n-skip dir="ltr">{matching.senderAddress}</span> : null}
            </div>
            <Button type="button" variant="ghost" disabled={!suggestion.sourceThreadId} className="mt-2 h-9 rounded-[var(--md-radius-md)] px-3 text-[12px] text-[var(--md-text)] hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] active:scale-[0.96] disabled:opacity-50 motion-reduce:active:scale-100" onClick={onOpenSource}>
              <MailOpen className="size-3.5" strokeWidth={1.4} aria-hidden="true" />
              {t("Open source email")}
            </Button>
          </header>

          <div className="mt-6 grid items-stretch gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
            <div className="flex min-w-0 items-center gap-3 rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] px-4 py-3 shadow-[var(--md-shadow-line)]">
              <span className="grid size-9 shrink-0 place-items-center rounded-[var(--md-radius-md)] bg-[var(--md-accent-a09)] text-[var(--md-accent)]">
                <FileCheck2 className="size-4" strokeWidth={1.4} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-[10.5px] font-medium uppercase tracking-[0.07em] text-[var(--md-subtle)]">{t(documentTypeLabel(suggestion.documentType))}</p>
                <p data-i18n-skip dir="auto" title={suggestion.sourceFileName} className="mt-0.5 truncate text-[12.5px] font-medium text-[var(--md-ink)]">{suggestion.sourceFileName}</p>
                {suggestion.sourceSubject ? <p data-i18n-skip dir="auto" className="mt-0.5 truncate text-[11.5px] text-[var(--md-text)]">{suggestion.sourceSubject}</p> : null}
              </div>
            </div>

            <div className="flex items-center justify-center gap-1.5 text-[var(--md-accent)]" aria-hidden="true">
              <span className="h-px w-5 bg-[var(--md-accent-a20)] sm:w-8" />
              <AiEditing className="size-4" strokeWidth={1.35} />
              <ArrowRight className="size-4 rtl:rotate-180" strokeWidth={1.35} />
              <span className="h-px w-5 bg-[var(--md-accent-a20)] sm:w-8" />
            </div>

            <div className={cn(
              "flex min-w-0 items-center gap-3 rounded-[var(--md-radius-lg)] px-4 py-3 shadow-[var(--md-shadow-line)]",
              matchTone === "green" && "bg-[var(--md-status-green-bg)]",
              matchTone === "amber" && "bg-[var(--md-status-amber-bg)]",
              matchTone === "red" && "bg-[var(--md-status-red-bg)]",
            )}>
              <span className={cn(
                "grid size-9 shrink-0 place-items-center rounded-[var(--md-radius-md)] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)]",
                matchTone === "green" && "text-[var(--md-status-green-ink)]",
                matchTone === "amber" && "text-[var(--md-status-amber-ink)]",
                matchTone === "red" && "text-[var(--md-status-red-ink)]",
              )}>
                <MatchIcon className="size-4" strokeWidth={1.5} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-[10.5px] font-medium uppercase tracking-[0.07em] text-[var(--md-subtle)]">{t("Booking match")}</p>
                <p className="mt-0.5 text-[12.5px] font-medium text-[var(--md-ink)]">{t(matching.state === "matched" ? matchMethodLabel(suggestion) : matching.state === "ambiguous" ? "Several plausible bookings" : "No booking attached")}</p>
                <p className="mt-0.5 text-[11.5px] leading-[1.45] text-[var(--md-text)]">{t(matching.state === "matched"
                  ? suggestion.matchMethod === "manual_selection" ? "You selected this booking for the source document" : "Only selected differences will change"
                  : matching.state === "ambiguous"
                    ? matching.candidateCount > 0 ? `${matching.candidateCount} ${t("candidates were too close to choose safely")}` : t("Several candidates were too close to choose safely")
                    : "Choose the booking yourself, or leave the document unattached")}</p>
              </div>
            </div>
          </div>

          {suggestion.fields.length ? (
            <div className="mt-7">
              <div className="flex items-end justify-between gap-3 px-1">
                <div>
                  <h2 className="text-[14px] font-medium text-[var(--md-ink)]">{t(resolved ? "Reviewed changes" : "Proposed changes")}</h2>
                  <p className="mt-1 text-[11.5px] text-[var(--md-subtle)]">{t(resolved ? "Each row records whether that field was applied." : "Untick anything you do not want to update.")}</p>
                </div>
                <span className="shrink-0 text-[11.5px] tabular-nums text-[var(--md-subtle)]">{resolved ? appliedCount : selectedCount} {t(resolved ? "applied" : "selected")}</span>
              </div>

              <div className="mt-3 overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)]">
                {suggestion.fields.map((field, index) => {
                  const fieldApplied = Boolean(field.appliedAt)
                  const selected = resolved ? fieldApplied : selectedFieldIds.has(field.id)
                  const OutcomeIcon = fieldApplied ? CheckCircle2 : XCircle
                  return (
                    <motion.div
                      layout={!shouldReduceMotion}
                      key={field.id}
                      className={cn(
                        "grid grid-cols-[auto_minmax(0,1fr)] gap-3 px-4 py-3.5 transition-[background-color] duration-150 sm:grid-cols-[auto_minmax(170px,0.65fr)_minmax(0,1fr)] sm:items-center",
                        index > 0 && "border-t border-[var(--md-line)]",
                        resolved && fieldApplied && "bg-[var(--md-status-green-bg)]",
                        resolved && !fieldApplied && "bg-[var(--md-status-red-bg)]",
                        !resolved && selected && "cursor-pointer bg-[var(--md-surface)]",
                        !resolved && !selected && "cursor-pointer bg-[var(--md-surface-soft)] opacity-70",
                        !actionable && !resolved && "cursor-default",
                      )}
                    >
                      {resolved ? (
                        <OutcomeIcon className={cn("size-4", fieldApplied ? "text-[var(--md-status-green-ink)]" : "text-[var(--md-status-red-ink)]")} strokeWidth={1.5} aria-hidden="true" />
                      ) : (
                        <Checkbox checked={selected} disabled={!actionable || busy} onCheckedChange={(checked) => onToggleField(field.id, checked === true)} aria-label={`${selected ? t("Exclude") : t("Include")} ${t(field.label)}`} />
                      )}
                      <span className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="text-[12px] font-medium text-[var(--md-ink)]">{t(field.label)}</span>
                        {resolved ? <StatusPill tone={fieldApplied ? "green" : "red"}>{t(fieldApplied ? "Applied" : "Not applied")}</StatusPill> : null}
                      </span>
                      <span className="col-start-2 grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:col-start-3">
                        <span data-i18n-skip dir="auto" className={cn("truncate rounded-[var(--md-radius-sm)] px-2.5 py-2 text-[12px]", fieldApplied ? "bg-[var(--md-surface)] text-[var(--md-text)] line-through decoration-[var(--md-subtle)] decoration-1" : "bg-[var(--md-surface)] font-medium text-[var(--md-ink)]")}>{valueLabel(field, field.currentValue, language)}</span>
                        <ArrowRight className="size-3.5 shrink-0 text-[var(--md-subtle)] rtl:rotate-180" strokeWidth={1.35} aria-hidden="true" />
                        <span data-i18n-skip dir="auto" className={cn("truncate rounded-[var(--md-radius-sm)] px-2.5 py-2 text-[12px]", fieldApplied ? "bg-[var(--md-surface)] font-medium text-[var(--md-status-green-ink)]" : resolved ? "bg-[var(--md-surface)] text-[var(--md-status-red-ink)] line-through" : "bg-[var(--md-status-green-bg)] font-medium text-[var(--md-ink)]")}>{valueLabel(field, field.proposedValue, language)}</span>
                      </span>
                    </motion.div>
                  )
                })}
              </div>
              {actions}
            </div>
          ) : (
            <div className="mt-7">
              <div className="flex items-start gap-3 rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] px-4 py-4 shadow-[var(--md-shadow-line)]">
                {suggestion.status === "no_changes" || manuallyAttached ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--md-green)]" strokeWidth={1.5} /> : <MatchIcon className="mt-0.5 size-4 shrink-0 text-[var(--md-amber)]" strokeWidth={1.5} />}
                <div>
                  <h2 className="text-[13px] font-medium text-[var(--md-ink)]">{t(manuallyAttached ? "Document added to booking" : suggestion.status === "no_changes" ? "This booking already matches" : matching.state === "ambiguous" ? "No booking was selected" : "A safe booking match was not found")}</h2>
                  <p className="mt-1 text-[11.5px] leading-[1.5] text-[var(--md-text)]">{t(manuallyAttached
                    ? "The source document was attached after you selected this booking. No extracted booking fields were changed."
                    : suggestion.status === "no_changes"
                    ? "The document has been checked and there is nothing to re-key."
                    : matching.state === "ambiguous"
                      ? "Choose the correct booking yourself, or leave the document unattached. Multideck will not guess when the evidence is too close."
                      : "Choose the correct booking yourself, or leave the document unattached. Nothing changes until you decide.")}</p>
                </div>
              </div>
              {actions}
            </div>
          )}

          {actionError ? (
            <div role="alert" className="mt-4 rounded-[var(--md-radius-lg)] bg-[var(--md-status-red-bg)] px-4 py-3 text-[12px] leading-[1.5] text-[var(--md-status-red-ink)]">
              <span className="font-medium">{t("Changes were not applied.")}</span> {actionError} {t("Your selections were kept. Refresh the suggestion and try again.")}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}
