import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { AiEditing, Check, FileCheck2, LoaderCircle, RefreshCw, Settings, Sparkles, Trash2, TriangleAlert } from "@/components/icons/hugeicons"
import { SuggestedUpdateReview } from "@/components/multideck/suggested-update-review"
import { StatusPill } from "@/components/multideck/status-pill"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
import { useLanguage } from "@/i18n/language-provider"
import {
  applyInboxSuggestedUpdate,
  attachInboxSuggestedDocument,
  dismissInboxSuggestedUpdate,
  listInboxSuggestedUpdates,
  loadInboxSuggestionSettings,
  updateInboxSuggestionSettings,
  type InboxSuggestedUpdate,
  type InboxSuggestionMailboxSetting,
  type Mailbox,
} from "@/lib/inbox-api"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

type ReviewFilter = "review" | "history"

function errorText(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

function statusLabel(suggestion: InboxSuggestedUpdate) {
  if (suggestion.status === "ready") return "Review"
  if (suggestion.status === "needs_match") {
    const matching = suggestion.evidence.matching
    return matching && typeof matching === "object" && !Array.isArray(matching) && (matching as Record<string, unknown>).matchState === "ambiguous"
      ? "Ambiguous match"
      : "No safe match"
  }
  if (suggestion.status === "no_changes") return "Up to date"
  if (suggestion.status === "applied") return "Applied"
  if (suggestion.status === "dismissed") return "Dismissed"
  return "Unavailable"
}

function statusTone(suggestion: InboxSuggestedUpdate) {
  if (suggestion.status === "ready") return "teal" as const
  if (suggestion.status === "needs_match") return "amber" as const
  if (suggestion.status === "no_changes") return "blue" as const
  if (suggestion.status === "applied") return "green" as const
  return "neutral" as const
}

export function InboxSuggestedUpdatesWorkspace({ mailboxes }: { mailboxes: Mailbox[] }) {
  const { language, t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const [suggestions, setSuggestions] = useState<InboxSuggestedUpdate[]>([])
  const [settings, setSettings] = useState<InboxSuggestionMailboxSetting[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedFieldIds, setSelectedFieldIds] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<ReviewFilter>("review")
  const [state, setState] = useState<"loading" | "ready" | "error">("loading")
  const [error, setError] = useState<string | null>(null)
  const [busySuggestionId, setBusySuggestionId] = useState<string | null>(null)
  const [busyMailboxId, setBusyMailboxId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const loadVersion = useRef(0)
  const dismissInFlight = useRef(false)
  const reviewTabRef = useRef<HTMLButtonElement>(null)

  const load = useCallback(async (quiet = false) => {
    const version = ++loadVersion.current
    if (!quiet) setState("loading")
    setError(null)
    try {
      const [nextSuggestions, nextSettings] = await Promise.all([
        listInboxSuggestedUpdates(),
        loadInboxSuggestionSettings(),
      ])
      if (version !== loadVersion.current) return
      setSuggestions(nextSuggestions)
      setSettings(nextSettings)
      setSelectedId((current) => current && nextSuggestions.some((item) => item.id === current)
        ? current
        : nextSuggestions.find((item) => item.status === "ready" || item.status === "needs_match")?.id ?? nextSuggestions[0]?.id ?? null)
      setState("ready")
    } catch (failure) {
      if (version !== loadVersion.current) return
      setError(errorText(failure, t("Suggested updates could not be loaded.")))
      setState("error")
    }
  }, [t])

  useEffect(() => {
    void load()
    const refreshOnFocus = () => void load(true)
    window.addEventListener("focus", refreshOnFocus)
    return () => window.removeEventListener("focus", refreshOnFocus)
  }, [load])

  const visibleSuggestions = useMemo(() => suggestions.filter((suggestion) => filter === "review"
    ? suggestion.status === "ready" || suggestion.status === "needs_match"
    : suggestion.status !== "ready" && suggestion.status !== "needs_match"), [filter, suggestions])
  const selected = suggestions.find((suggestion) => suggestion.id === selectedId) ?? null
  const reviewCount = suggestions.filter((suggestion) => suggestion.status === "ready" || suggestion.status === "needs_match").length

  useEffect(() => {
    setActionError(null)
    if (!selected) {
      setSelectedFieldIds(new Set())
      return
    }
    setSelectedFieldIds(new Set(selected.fields.filter((field) => field.selectedByDefault && !field.appliedAt).map((field) => field.id)))
  }, [selected?.id, selected?.status])

  useEffect(() => {
    if (selected && visibleSuggestions.some((suggestion) => suggestion.id === selected.id)) return
    setSelectedId(visibleSuggestions[0]?.id ?? null)
  }, [filter, selected, visibleSuggestions])

  async function toggleMailbox(setting: InboxSuggestionMailboxSetting, enabled: boolean) {
    setBusyMailboxId(setting.mailboxId)
    try {
      const result = await updateInboxSuggestionSettings(setting.mailboxId, enabled)
      setSettings((current) => current.map((item) => item.mailboxId === setting.mailboxId ? { ...item, enabled: result.enabled } : item))
      toast.success(t(result.enabled ? "Suggested updates turned on" : "Suggested updates turned off"))
      if (result.queued > 0) toast.success(t(`${result.queued} recent ${result.queued === 1 ? "document is" : "documents are"} ready to check`))
      if (result.queued > 0) await load(true)
    } catch (failure) {
      toast.error(errorText(failure, t("That mailbox setting could not be changed.")))
    } finally {
      setBusyMailboxId(null)
    }
  }

  async function applySelected() {
    if (!selected || selectedFieldIds.size === 0) return
    setActionError(null)
    setBusySuggestionId(selected.id)
    try {
      await applyInboxSuggestedUpdate(selected.id, [...selectedFieldIds])
      toast.success(t("Selected booking changes applied"))
      await load(true)
      setFilter("history")
      setSelectedId(selected.id)
    } catch (failure) {
      const message = errorText(failure, t("The selected changes could not be applied."))
      setActionError(message)
      toast.error(message)
    } finally {
      setBusySuggestionId(null)
    }
  }

  async function dismissSuggestion(suggestion: InboxSuggestedUpdate) {
    if (busySuggestionId || dismissInFlight.current || !["ready", "needs_match", "no_changes"].includes(suggestion.status)) return
    dismissInFlight.current = true
    setBusySuggestionId(suggestion.id)
    try {
      await dismissInboxSuggestedUpdate(suggestion.id)
      // Confirm on the server first. Invalidate earlier list requests so a
      // slow refresh cannot put a removed suggestion back into Needs review.
      loadVersion.current++
      setSuggestions((current) => current.map((item) => item.id === suggestion.id ? { ...item, status: "dismissed" } : item))
      toast.success(t("Suggestion removed"), { description: t("Kept in History. The source email and attachment are unchanged.") })
      reviewTabRef.current?.focus()
      await load(true)
    } catch (failure) {
      toast.error(errorText(failure, t("This suggestion could not be removed. Nothing has been deleted.")))
    } finally {
      dismissInFlight.current = false
      setBusySuggestionId(null)
    }
  }

  async function attachSelected(bookingId: string) {
    if (!selected) return
    setActionError(null)
    setBusySuggestionId(selected.id)
    try {
      await attachInboxSuggestedDocument(selected.id, bookingId)
      toast.success(t("Document added to booking"))
      await load(true)
      setFilter("history")
      setSelectedId(selected.id)
    } catch (failure) {
      const message = errorText(failure, t("The document could not be added to that booking."))
      setActionError(message)
      toast.error(message)
    } finally {
      setBusySuggestionId(null)
    }
  }

  function openSource() {
    if (!selected?.sourceThreadId) return
    const mailbox = mailboxes.find((item) => item.id === selected.sourceMailboxId)
    const url = new URL(window.location.origin + "/inbox")
    if (mailbox) {
      url.searchParams.set("provider", mailbox.provider)
      url.searchParams.set("mailbox", mailbox.id)
    }
    url.searchParams.set("thread", selected.sourceThreadId)
    window.location.assign(url.toString())
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--md-bg)]">
      <header className="flex shrink-0 flex-wrap items-center gap-2 px-[var(--md-page-pad)] py-2.5 ps-14 shadow-[var(--md-stroke-bottom)] lg:ps-[var(--md-page-pad)]">
        <AiEditing className="size-4 shrink-0 text-[var(--md-accent)]" strokeWidth={1.35} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-[14px] font-medium text-[var(--md-ink)]">{t("Suggested updates")}</h1>
            {reviewCount > 0 ? <span className="rounded-full bg-[var(--md-accent-a10)] px-2 py-0.5 text-[11px] font-medium tabular-nums text-[var(--md-accent)]">{reviewCount}</span> : null}
          </div>
          <p className="mt-0.5 hidden text-[11.5px] text-[var(--md-subtle)] sm:block">{t("Inbox documents checked against live Multideck records")}</p>
        </div>
        <Button type="button" variant="ghost" size="icon" aria-label={t("Refresh suggested updates")} title={t("Refresh suggested updates")} className="size-10 rounded-[var(--md-radius-md)] text-[var(--md-subtle)] hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] active:scale-[0.96] motion-reduce:active:scale-100" onClick={() => void load()}>
          <RefreshCw className={cn("size-3.5", state === "loading" && "animate-spin motion-reduce:animate-none")} strokeWidth={1.4} />
        </Button>
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="icon" aria-label={t("Suggested update settings")} title={t("Suggested update settings")} className="size-10 rounded-[var(--md-radius-md)] text-[var(--md-subtle)] hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] active:scale-[0.96] motion-reduce:active:scale-100">
              <Settings className="size-3.5" strokeWidth={1.4} />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[min(360px,calc(100vw-24px))] rounded-[var(--md-radius-xl)] border-0 bg-[var(--md-surface)] p-0 shadow-[var(--md-shadow-lift)]">
            <div className="px-4 py-3 shadow-[var(--md-stroke-bottom)]">
              <h2 className="text-[13px] font-medium text-[var(--md-ink)]">{t("Check incoming documents")}</h2>
              <p className="mt-1 text-[11.5px] leading-[1.45] text-[var(--md-text)]">{t("Only likely booking confirmations and commercial invoices are opened. Nothing changes without review.")}</p>
            </div>
            <div className="p-2">
              {settings.map((setting) => (
                <label key={setting.mailboxId} className="flex min-h-12 items-center gap-3 rounded-[var(--md-radius-lg)] px-2.5 py-2 hover:bg-[var(--md-hover)]">
                  <div className="min-w-0 flex-1">
                    <p data-i18n-skip dir="auto" className="truncate text-[12px] font-medium text-[var(--md-ink)]">{setting.displayName || setting.address}</p>
                    <p data-i18n-skip dir="ltr" className="mt-0.5 truncate text-[10.5px] text-[var(--md-subtle)]">{setting.address}</p>
                  </div>
                  {busyMailboxId === setting.mailboxId ? <LoaderCircle className="size-4 animate-spin text-[var(--md-accent)] motion-reduce:animate-none" aria-hidden="true" /> : (
                    <Switch checked={setting.enabled} onCheckedChange={(enabled) => void toggleMailbox(setting, enabled)} aria-label={`${t("Check incoming documents for")} ${setting.address}`} />
                  )}
                </label>
              ))}
              {settings.length === 0 ? <p className="px-3 py-4 text-[11.5px] text-[var(--md-subtle)]">{t("No manageable mailbox is available.")}</p> : null}
            </div>
          </PopoverContent>
        </Popover>
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col border-b border-[var(--md-line)] lg:border-b-0 lg:border-e">
          <div className="flex shrink-0 items-center gap-1.5 px-3 py-3">
            {(["review", "history"] as ReviewFilter[]).map((item) => (
              <button key={item} ref={item === "review" ? reviewTabRef : undefined} type="button" aria-pressed={filter === item} className={cn("relative h-9 rounded-[var(--md-radius-md)] px-3 text-[12px] font-medium outline-none transition-[color,background-color,scale] duration-150 active:scale-[0.96] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)] motion-reduce:transition-none motion-reduce:active:scale-100", filter === item ? "text-[var(--md-ink)]" : "text-[var(--md-subtle)] hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)]")} onClick={() => setFilter(item)}>
                {filter === item ? <motion.span layoutId="suggested-update-filter" className="absolute inset-0 -z-10 rounded-[var(--md-radius-md)] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)]" transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.18, ease: [0.22, 1, 0.36, 1] }} /> : null}
                {t(item === "review" ? "Needs review" : "History")}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto md-scrollbar px-2 pb-3">
            {state === "loading" && suggestions.length === 0 ? (
              <p className="flex items-center gap-2 px-3 py-8 text-[12px] text-[var(--md-text)]"><LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />{t("Checking suggested updates")}</p>
            ) : state === "error" && suggestions.length === 0 ? (
              <div className="px-3 py-8"><TriangleAlert className="size-5 text-[var(--md-red)]" /><p className="mt-3 text-[13px] font-medium text-[var(--md-ink)]">{t("Suggested updates are unavailable")}</p><p className="mt-1 text-[11.5px] text-[var(--md-text)]">{error}</p></div>
            ) : visibleSuggestions.length === 0 ? (
              <div className="px-3 py-8"><Check className="size-5 text-[var(--md-green)]" /><p className="mt-3 text-[13px] font-medium text-[var(--md-ink)]">{t(filter === "review" ? "Nothing needs re-keying" : "No reviewed updates yet")}</p><p className="mt-1 text-[11.5px] leading-[1.5] text-[var(--md-text)]">{t(filter === "review" ? "Likely documents appear here only when there is something useful to review." : "Applied and dismissed suggestions will stay here as an audit trail.")}</p></div>
            ) : (
              <AnimatePresence initial={false}>
                {visibleSuggestions.map((suggestion) => (
                  <motion.div key={suggestion.id} layout={!shouldReduceMotion} initial={false} exit={shouldReduceMotion ? undefined : { opacity: 0, height: 0 }} className={cn("mb-1 flex w-full items-center rounded-[var(--md-radius-lg)] transition-colors", selectedId === suggestion.id ? "bg-[var(--md-surface)] shadow-[var(--md-shadow-line)]" : "hover:bg-[var(--md-hover)]")}>
                    <button type="button" aria-pressed={selectedId === suggestion.id} className="min-w-0 flex-1 rounded-[var(--md-radius-lg)] px-3 py-3 text-start outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]" onClick={() => setSelectedId(suggestion.id)}>
                      <div className="flex items-start gap-2.5">
                        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-[var(--md-radius-md)] bg-[var(--md-accent-a09)] text-[var(--md-accent)]"><FileCheck2 className="size-3.5" strokeWidth={1.4} /></span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2"><p className="truncate text-[12px] font-medium text-[var(--md-ink)]">{suggestion.targetLabel || t("Unmatched document")}</p><StatusPill tone={statusTone(suggestion)}>{t(statusLabel(suggestion))}</StatusPill></div>
                          <p data-i18n-skip dir="auto" className="mt-1 truncate text-[11px] text-[var(--md-text)]">{suggestion.sourceFileName}</p>
                          <p className="mt-1 text-[10.5px] text-[var(--md-subtle)]">{new Intl.DateTimeFormat(language, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(suggestion.createdAt))}</p>
                        </div>
                      </div>
                    </button>
                    {suggestion.status === "ready" || suggestion.status === "needs_match" ? (
                      <Button type="button" variant="ghost" size="icon" className="me-1 size-10 rounded-[var(--md-radius-md)] text-[var(--md-subtle)] hover:bg-destructive/10 hover:text-[var(--md-red)]" aria-label={`${t("Delete suggestion for")} ${suggestion.sourceFileName}`} title={t("Remove suggestion · keep the source email")} disabled={busySuggestionId !== null} aria-busy={busySuggestionId === suggestion.id} onClick={() => void dismissSuggestion(suggestion)}>
                        {busySuggestionId === suggestion.id ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Trash2 className="size-4" strokeWidth={1.4} aria-hidden="true" />}
                      </Button>
                    ) : null}
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>
        </aside>

        <main className="min-h-0">
          {selected ? (
            <SuggestedUpdateReview suggestion={selected} selectedFieldIds={selectedFieldIds} busy={busySuggestionId !== null} actionError={actionError} onToggleField={(fieldId, checked) => setSelectedFieldIds((current) => { const next = new Set(current); if (checked) next.add(fieldId); else next.delete(fieldId); return next })} onApply={() => void applySelected()} onAttachToBooking={(bookingId) => void attachSelected(bookingId)} onDismiss={() => void dismissSuggestion(selected)} onOpenSource={openSource} />
          ) : (
            <div className="grid h-full min-h-[280px] place-items-center px-6 text-center"><div><Sparkles className="mx-auto size-6 text-[var(--md-accent)]" strokeWidth={1.35} /><h2 className="mt-3 text-[14px] font-medium text-[var(--md-ink)]">{t("Inbox work, without the re-keying")}</h2><p className="mx-auto mt-1 max-w-[420px] text-[12px] leading-[1.55] text-[var(--md-text)]">{t("When a useful document arrives, Multideck compares it with the live record and brings only the differences here.")}</p></div></div>
          )}
        </main>
      </div>
    </div>
  )
}
