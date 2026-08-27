import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import {
  Archive,
  ArrowLeft,
  CalendarClock,
  ChevronDown,
  CornerUpLeft,
  CornerUpRight,
  Download,
  Loader2,
  Mail,
  MailOpen,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Star,
  Trash2,
  X,
} from "@/components/icons/hugeicons"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { DexterActionPill } from "@/components/multideck/dexter-action-pill"
import { EmailMessageRenderer } from "@/components/multideck/email-message-renderer"
import { EmailDeliveryStatus } from "@/components/multideck/email-delivery-status"
import { InboxThreadRow, formatThreadTimestamp, threadParticipantLabel } from "@/components/multideck/inbox-thread-row"
import { PageSettingsMenu } from "@/components/multideck/page-settings-menu"
import { SegmentedControl } from "@/components/multideck/workflow-components"
import { MultideckDateRangePicker, type MultideckDateRange } from "@/components/multideck/date-picker"
import {
  MailProviderMark,
  mailProviderLabels,
  mailboxKindLabel,
} from "@/components/multideck/mailbox-provider-switch"
import {
  MailComposer,
  composerEdits,
  composerModeLabels,
  composerNeedsRecipient,
  emptyComposerState,
  formatBytes,
  type ComposerState,
  type ComposerStatus,
  type ReplyAudience,
} from "@/components/multideck/mail-composer"
import { ThreadSummary, type ThreadSummarySource } from "@/components/multideck/thread-summary"
import { useLanguage } from "@/i18n/language-provider"
import { InboxSuggestedUpdatesWorkspace } from "@/components/multideck/inbox-suggested-updates-workspace"
import { mdMotion, reduceMotion } from "@/lib/motion"
import {
  InboxApiError,
  applyThreadPatch,
  buildReplyRequest,
  createIdempotencyKey,
  getAttachmentBlobUrl,
  isInboxNotFound,
  latestReplySource,
  listInboxProviders,
  readEmailConnectionResult,
  readInboxThreadDeepLink,
  resolveSelectionForMailbox,
  threadCacheKey,
  type InboxMessage,
  type InboxThreadDetail,
  type InboxThreadListItem,
  type AutomaticReplySettings,
  type AutomaticReplyStatus,
  type MailAddress,
  type MailAttachment,
  type Mailbox,
  type MailProvider,
  type SendMode,
  type ThreadCacheEntry,
  type ThreadSummaryState,
} from "@/lib/inbox-api"
import {
  discardDraft,
  fetchAutomaticReply,
  generateThreadSummary,
  patchThreadState,
  requestMailboxSync,
  saveDraft,
  saveAutomaticReply,
  startProviderAuthorization,
  submitSend,
  trashThread,
} from "@/lib/inbox-source"
import { useInboxWorkspace } from "@/lib/inbox-workspace"
import {
  clearLocalDraft,
  isEmptyEdits,
  localDraftKey,
  readLocalDraft,
  saveLocalDraft,
} from "@/lib/inbox-drafts"
import { prepareInboxDexterDraft } from "@/lib/dexter-api"
import { cn } from "@/lib/utils"

/**
 * The Inbox workspace: one operational mail surface for the Gmail and Microsoft
 * accounts a freight desk actually runs on.
 *
 * Everything about a message comes from the tenant Inbox Edge Function. The
 * browser never touches Gmail, Microsoft Graph, a service-role key or the communications
 * tables, never renders provider HTML outside the sandboxed renderer, and never
 * decides who a Reply all goes to.
 *
 * Motion brief. The anchor is the selected thread row and the Dexter summary; a
 * single shared highlight travels between rows so selection reads as one object
 * moving rather than two rows repainting. Attention goes to the sender and
 * subject first, the summary second, the actions third. Identity is preserved by
 * keying every row and message on its id, so a list that reorders or paginates
 * never remounts a row the operator is looking at. Rapid thread, provider and
 * composer switching retargets on well-damped springs instead of snapping, and
 * reduced motion keeps every state, count and label while dropping the travel.
 * Most of the surface stays still on purpose.
 */

const pageSize = 25
const threadSelectionLayoutId = "inbox-thread-selection"
const liveMailboxSyncIntervalMs = 20_000
const trackingStatusRefreshIntervalMs = 15_000
const indexContinuationDelayMs = 300

type MobileStage = "threads" | "message"
type LoadState = "idle" | "loading" | "loadingMore" | "ready" | "error"

/**
 * The two panes exist once, in one layout at a time. Rendering both the desktop
 * grid and the staged mobile track would put two visible owners on the shared
 * selection `layoutId` and mount every message iframe twice, so the breakpoint is
 * resolved here instead of with `hidden lg:block`. The first value is read
 * synchronously, so there is no wrong first frame.
 *
 * The threshold is 1280px rather than the usual 1024: the Multideck sidebar
 * already owns the account and folder controls, and below this the message pane
 * to read a real subject line and its actions. Tablets get the staged flow, which
 * gives each stage the full width.
 */
function useIsDesktopLayout() {
  const query = "(min-width: 1280px)"
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches,
  )

  useEffect(() => {
    const list = window.matchMedia(query)
    const onChange = (event: MediaQueryListEvent) => setIsDesktop(event.matches)
    setIsDesktop(list.matches)
    list.addEventListener("change", onChange)
    return () => list.removeEventListener("change", onChange)
  }, [])

  return isDesktop
}


function addressLabel(address: MailAddress) {
  return address.displayName?.trim() || address.address
}

function messageTimestamp(message: InboxMessage) {
  return message.sentAt ?? message.receivedAt ?? null
}

function errorMessageFor(error: unknown, fallback: string) {
  if (error instanceof InboxApiError) return error.message
  if (error instanceof Error && error.message) return error.message
  return fallback
}

function localDateTimeValue(value: string | null) {
  if (!value) return ""
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ""
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function isoFromLocalDateTime(value: string) {
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null
}

function AutomaticReplyDialog({
  open,
  onOpenChange,
  mailbox,
  settings,
  onSettingsChange,
  onReconnect,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mailbox: Mailbox | null
  settings: AutomaticReplySettings | null
  onSettingsChange: (settings: AutomaticReplySettings) => void
  onReconnect: (provider: MailProvider) => void
}) {
  const { language, t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadRevision, setLoadRevision] = useState(0)
  const [status, setStatus] = useState<AutomaticReplyStatus>("scheduled")
  const [enabled, setEnabled] = useState(false)
  const [startAt, setStartAt] = useState("")
  const [endAt, setEndAt] = useState("")
  const [subject, setSubject] = useState("")
  const [message, setMessage] = useState("")
  const [audience, setAudience] = useState<"everyone" | "internal_only">("everyone")
  const onSettingsChangeRef = useRef(onSettingsChange)
  const translateRef = useRef(t)

  useEffect(() => {
    onSettingsChangeRef.current = onSettingsChange
  }, [onSettingsChange])

  useEffect(() => {
    translateRef.current = t
  }, [t])

  const applyLocal = useCallback((next: AutomaticReplySettings) => {
    setEnabled(next.status !== "disabled")
    setStatus(next.status === "disabled" ? "scheduled" : next.status)
    setStartAt(localDateTimeValue(next.startAt))
    setEndAt(localDateTimeValue(next.endAt))
    setSubject(next.subject)
    setMessage(next.message)
    setAudience(next.audience)
  }, [])

  const apply = useCallback((next: AutomaticReplySettings) => {
    onSettingsChangeRef.current(next)
    applyLocal(next)
  }, [applyLocal])

  useEffect(() => {
    if (open && settings) applyLocal(settings)
  }, [applyLocal, open, settings])

  useEffect(() => {
    if (!open || !mailbox) return
    let cancelled = false
    setError(null)
    setLoading(true)
    void fetchAutomaticReply(mailbox.id)
      .then((next) => {
        if (!cancelled) apply(next)
      })
      .catch((failure) => {
        if (!cancelled) setError(errorMessageFor(failure, translateRef.current("Unable to load automatic replies.")))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [apply, loadRevision, mailbox?.id, open])

  async function save() {
    if (!mailbox || saving) return
    const nextStatus: AutomaticReplyStatus = enabled ? status : "disabled"
    setSaving(true)
    setError(null)
    try {
      const next = await saveAutomaticReply(mailbox.id, {
        status: nextStatus,
        startAt: nextStatus === "scheduled" ? isoFromLocalDateTime(startAt) : null,
        endAt: nextStatus === "scheduled" ? isoFromLocalDateTime(endAt) : null,
        subject,
        message,
        audience,
      })
      apply(next)
      toast.success(t(nextStatus === "disabled" ? "Automatic reply turned off" : "Automatic reply saved"))
      onOpenChange(false)
    } catch (failure) {
      setError(errorMessageFor(failure, t("Unable to save automatic replies.")))
    } finally {
      setSaving(false)
    }
  }

  const needsSchedule = enabled && status === "scheduled"
  const scheduleValid = !needsSchedule || Boolean(
    isoFromLocalDateTime(startAt)
    && isoFromLocalDateTime(endAt)
    && Date.parse(endAt) > Date.parse(startAt)
    && Date.parse(endAt) > Date.now(),
  )
  const canSave = Boolean(settings?.supported && settings.canUpdate && (!enabled || message.trim() && scheduleValid) && !loading && !saving)
  const validationMessage = !enabled
    ? null
    : !message.trim()
    ? t("Write a reply message to continue.")
    : !scheduleValid
      ? t("Choose a future end time after the start time.")
      : null
  const scheduleLabel = useMemo(() => {
    if (status === "always_on") return t("No end date")
    const start = isoFromLocalDateTime(startAt)
    const end = isoFromLocalDateTime(endAt)
    if (!start || !end) return t("Choose dates")
    const formatter = new Intl.DateTimeFormat(language, { day: "numeric", month: "short" })
    return `${formatter.format(new Date(start))} – ${formatter.format(new Date(end))}`
  }, [endAt, language, startAt, status, t])
  const scheduleRange: MultideckDateRange = {
    start: startAt ? startAt.slice(0, 10) : null,
    end: endAt ? endAt.slice(0, 10) : null,
  }

  function updateScheduleRange(range: MultideckDateRange) {
    if (!range.start && !range.end) {
      setStatus("always_on")
      setStartAt("")
      setEndAt("")
      return
    }
    setStatus("scheduled")
    if (range.start) setStartAt(`${range.start}T${startAt.slice(11, 16) || "09:00"}`)
    else setStartAt("")
    if (range.end) setEndAt(`${range.end}T${endAt.slice(11, 16) || "17:00"}`)
    else setEndAt("")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90dvh,760px)] w-[min(780px,calc(100vw-1.5rem))] max-w-none overflow-y-auto rounded-[var(--md-radius-2xl)] bg-[var(--md-bg)] p-0 sm:max-w-none">
        <DialogHeader className="grid gap-3 px-5 pb-0 pt-5 pe-14 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="min-w-0 text-start">
            <DialogTitle className="text-[18px] font-medium text-[var(--md-ink)]">{t("Out of office")}</DialogTitle>
            <DialogDescription className="sr-only">
              {t("Set the automatic reply on the selected mailbox. Gmail or Outlook remains the source of truth.")}
            </DialogDescription>
            {mailbox ? (
              <bdi data-i18n-skip dir="ltr" className="mt-1 block truncate text-[11.5px] text-[var(--md-subtle)]">{mailbox.address}</bdi>
            ) : null}
          </div>

          {settings?.supported && settings.canUpdate ? (
            <motion.div layout className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end" transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.spring)}>
              <SegmentedControl
                options={["internal_only", "everyone"] as const}
                value={audience}
                onChange={setAudience}
                ariaLabel={t("Automatic reply audience")}
                className="min-w-[176px] flex-1 !rounded-full sm:flex-none [&>button]:!rounded-full [&>button]:flex-1 [&>button]:px-3 [&>button>span]:!rounded-full"
                renderOption={(option) => t(option === "everyone" ? "Everyone" : "Internal")}
              />

              <MultideckDateRangePicker
                value={scheduleRange}
                onChange={updateScheduleRange}
                triggerLabel={scheduleLabel}
                placeholder="Choose dates"
                title="Out-of-office dates"
                description="Choose the first and last day for this automatic reply. Clear the dates to leave it on until you turn it off."
                footerLabel="Out-of-office dates"
                align="end"
                active={enabled}
                disabled={!enabled}
                allowClear
                triggerClassName="h-10 w-[154px] !rounded-full px-3 text-[12px]"
                popoverClassName="w-[min(94vw,590px)]"
              />

              <motion.label
                layout
                className={cn(
                  "flex h-10 shrink-0 items-center gap-2 overflow-hidden rounded-full px-3 text-[12px] font-medium shadow-[var(--md-shadow-line)] transition-[background-color,color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
                  enabled ? "bg-[var(--md-accent-a10)] text-[var(--md-ink)]" : "bg-[var(--md-field-bg)] text-[var(--md-text)]",
                )}
                transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.spring)}
              >
                <span aria-live="polite" className="relative inline-grid min-w-[22px] overflow-hidden text-end">
                  <AnimatePresence initial={false} mode="popLayout">
                    <motion.span
                      key={enabled ? "on" : "off"}
                      initial={shouldReduceMotion ? false : { opacity: 0, x: enabled ? -5 : 5, filter: "blur(3px)" }}
                      animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                      exit={shouldReduceMotion ? undefined : { opacity: 0, x: enabled ? 5 : -5, filter: "blur(2px)" }}
                      transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.fast)}
                    >
                      {t(enabled ? "On" : "Off")}
                    </motion.span>
                  </AnimatePresence>
                </span>
                <Switch
                  checked={enabled}
                  aria-label={t("Automatic reply on or off")}
                  className="duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] [&_[data-slot=switch-thumb]]:duration-200 [&_[data-slot=switch-thumb]]:ease-[cubic-bezier(0.22,1,0.36,1)]"
                  onCheckedChange={(checked) => {
                    setEnabled(checked)
                  }}
                />
              </motion.label>
            </motion.div>
          ) : null}
        </DialogHeader>

        <div className="grid gap-4 px-5 pb-5">
          {loading && !settings ? (
            <div className="flex min-h-[240px] items-center justify-center gap-2 text-[13px] text-[var(--md-text)]" aria-live="polite">
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" strokeWidth={1.5} aria-hidden="true" />
              {t("Checking automatic replies...")}
            </div>
          ) : error && !settings ? (
            <div className="grid min-h-[240px] place-items-center text-center">
              <div className="max-w-[38ch]">
                <p role="alert" className="text-[13px] leading-[1.5] text-[var(--md-red)]">{error}</p>
                <Button type="button" variant="ghost" className="mt-4 h-10 rounded-[var(--md-radius-md)] bg-[var(--md-surface)] px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)]" onClick={() => setLoadRevision((revision) => revision + 1)}>
                  {t("Try again")}
                </Button>
              </div>
            </div>
          ) : settings && (!settings.supported || !settings.canUpdate) ? (
            <div className="grid min-h-[240px] place-items-center px-1 py-8 sm:min-h-[260px] sm:py-10">
              <div className="w-full max-w-[420px] text-center">
                {mailbox ? (
                  <div className="flex items-center justify-center gap-2.5">
                    <span className="grid size-11 shrink-0 place-items-center rounded-[var(--md-radius-md)] bg-white shadow-[var(--md-shadow-line)]">
                      <MailProviderMark provider={mailbox.provider} className="size-6" />
                    </span>
                    <span data-i18n-skip className="text-[13px] font-medium text-[var(--md-text)]">
                      {mailProviderLabels[mailbox.provider]}
                    </span>
                  </div>
                ) : null}
                <p className="mt-5 text-[15px] font-medium text-[var(--md-ink)]">
                  {t(settings.requiresReconnect ? "Reconnect to manage out of office" : "Manage this mailbox with your provider")}
                </p>
                <p className="mx-auto mt-1.5 max-w-[44ch] text-pretty text-[12.5px] leading-[1.55] text-[var(--md-text)]">
                  {t(settings.reason ?? "Automatic replies are unavailable for this mailbox.")}
                </p>
                {settings.requiresReconnect && mailbox ? (
                  <div className="mt-5 flex justify-center">
                    <Button
                      type="button"
                      className="h-10 rounded-[var(--md-radius-md)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-[var(--md-accent-ink)] shadow-[var(--md-shadow-line)] transition-[background-color,box-shadow,scale] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[var(--md-accent-deep)] motion-reduce:transition-none"
                      onClick={() => onReconnect(mailbox.provider)}
                    >
                      {t(`Reconnect ${mailProviderLabels[mailbox.provider]}`)}
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          ) : settings ? (
            <>
              {mailbox?.provider === "gmail" ? (
                <label className="grid gap-1.5 text-[12px] font-medium text-[var(--md-ink)]">
                  {t("Subject")}
                  <input value={subject} maxLength={200} onChange={(event) => setSubject(event.target.value)} placeholder={t("Out of office")} className="h-11 rounded-[var(--md-radius-md)] bg-[var(--md-field-bg)] px-3 text-[16px] font-normal text-[var(--md-ink)] outline-none placeholder:text-[var(--md-subtle)] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a20)] sm:text-[13px]" />
                </label>
              ) : null}

              <label className="grid gap-1.5 text-[12px] font-medium text-[var(--md-ink)]">
                {t("Reply message")}
                <textarea value={message} maxLength={10_000} rows={10} onChange={(event) => setMessage(event.target.value)} placeholder={t("Thanks for your email. I am currently out of office and will reply when I return.")} className="min-h-[260px] resize-y rounded-[var(--md-radius-xl)] bg-[var(--md-field-bg)] px-4 py-3 text-[16px] font-normal leading-[1.55] text-[var(--md-ink)] outline-none placeholder:text-[var(--md-subtle)] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a20)] sm:text-[13px]" />
              </label>
            </>
          ) : null}

          {error && settings ? <p role="alert" className="text-[12px] leading-[1.45] text-[var(--md-red)]">{error}</p> : null}
        </div>

        {settings?.supported && settings.canUpdate ? (
          <DialogFooter className="m-0 rounded-b-[var(--md-radius-2xl)] px-5 py-4">
            {validationMessage ? <p className="me-auto text-[11.5px] text-[var(--md-subtle)]">{validationMessage}</p> : null}
            <Button type="button" disabled={!canSave} className="h-10 rounded-[var(--md-radius-md)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-[var(--md-accent-ink)]" onClick={() => void save()}>
              {saving ? <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" strokeWidth={1.5} aria-hidden="true" /> : null}
              {t(saving ? "Saving" : enabled ? "Save automatic reply" : "Turn off automatic reply")}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------------------- */

function WorkspaceMessage({
  icon: Icon,
  title,
  description,
  action,
  tone = "neutral",
}: {
  icon: typeof Mail
  title: string
  description: string
  action?: ReactNode
  tone?: "neutral" | "warning" | "error"
}) {
  return (
    <div className="grid h-full min-h-[220px] place-items-center px-6 py-10">
      <div className="max-w-[46ch] text-center">
        <span
          className={cn(
            "mx-auto grid size-10 place-items-center rounded-[var(--md-radius-lg)] shadow-[var(--md-shadow-line)]",
            tone === "error"
              ? "bg-[rgba(209,78,78,0.1)] text-[var(--md-red)]"
              : tone === "warning"
                ? "bg-[rgba(221,138,43,0.12)] text-[var(--md-amber)]"
                : "bg-[var(--md-surface-tint)] text-[var(--md-subtle)]",
          )}
        >
          <Icon className="size-[18px]" strokeWidth={1.4} aria-hidden="true" />
        </span>
        <p className="mt-3 text-[14px] font-medium text-[var(--md-ink)]">{title}</p>
        <p className="mt-1.5 text-pretty text-[12.5px] leading-[1.55] text-[var(--md-text)]">{description}</p>
        {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
      </div>
    </div>
  )
}

function InboxConnectionPicker({
  connectingProvider,
  onConnect,
}: {
  connectingProvider: MailProvider | null
  onConnect: (provider: MailProvider) => void
}) {
  const { t } = useLanguage()

  return (
    <div className="grid h-full min-h-[320px] place-items-center px-4 py-10 sm:px-6">
      <section aria-labelledby="connect-inbox-title" className="w-full max-w-[520px]">
        <div className="text-center">
          <h1 id="connect-inbox-title" className="text-[20px] font-medium tracking-[-0.015em] text-[var(--md-ink)]">
            {t("Connect an inbox")}
          </h1>
          <p className="mx-auto mt-2 max-w-[42ch] text-pretty text-[13px] leading-5 text-[var(--md-text)]">
            {t("Choose Gmail or Outlook to bring your email into Multideck.")}
          </p>
        </div>

        <div className="mt-6 grid gap-2.5" role="list">
          {(["gmail", "outlook"] as MailProvider[]).map((candidate) => {
            const connecting = connectingProvider === candidate
            const disabled = connectingProvider !== null

            return (
              <div
                key={candidate}
                role="listitem"
                className="flex min-h-[64px] items-center justify-between gap-4 rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] px-3.5 py-2.5 shadow-[var(--md-shadow-line)]"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-[var(--md-radius-md)] bg-white shadow-[var(--md-shadow-line)]">
                    <MailProviderMark provider={candidate} className="size-5" />
                  </span>
                  <span className="truncate text-[14px] font-medium text-[var(--md-ink)]">
                    {mailProviderLabels[candidate]}
                  </span>
                </div>

                <button
                  type="button"
                  aria-label={`${t("Connect")} ${mailProviderLabels[candidate]}`}
                  disabled={disabled}
                  className="md-composer-chip inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium text-[var(--md-ink)] active:!scale-[0.96] disabled:cursor-default disabled:opacity-50 disabled:active:!scale-100 motion-reduce:active:!scale-100"
                  onClick={() => onConnect(candidate)}
                >
                  {connecting ? (
                    <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" strokeWidth={1.5} aria-hidden="true" />
                  ) : null}
                  {t(connecting ? "Connecting..." : "Connect")}
                </button>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function ThreadListSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-1 px-3 py-2">
      {[0, 1, 2, 3, 4, 5].map((row) => (
        <div key={row} className="rounded-[var(--md-radius-lg)] px-3 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <span className="h-[10px] w-[38%] rounded-full bg-[var(--md-surface-tint)]" />
            <span className="h-[9px] w-[36px] rounded-full bg-[var(--md-surface-tint)]" />
          </div>
          <span className="mt-2 block h-[10px] w-[72%] rounded-full bg-[var(--md-surface-tint)]" />
          <span className="mt-1.5 block h-[9px] w-[56%] rounded-full bg-[var(--md-surface-tint)]" />
        </div>
      ))}
    </div>
  )
}

function AttachmentRow({ attachment }: { attachment: MailAttachment }) {
  const { language, t } = useLanguage()
  const [busy, setBusy] = useState(false)
  const blocked = attachment.scanStatus === "blocked"

  async function open() {
    if (busy || blocked) return
    setBusy(true)
    let opened: { url: string; revoke: () => void } | null = null
    try {
      opened = await getAttachmentBlobUrl(attachment.id)
      const download = document.createElement("a")
      download.href = opened.url
      download.download = attachment.fileName || "attachment"
      download.rel = "noopener noreferrer"
      download.hidden = true
      document.body.append(download)
      download.click()
      download.remove()
    } catch (error) {
      toast.error(errorMessageFor(error, t("This attachment could not be downloaded.")))
    } finally {
      // Give the browser time to claim the blob before releasing its object URL.
      if (opened) window.setTimeout(opened.revoke, 60_000)
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      disabled={blocked}
      aria-label={`${t("Download")} ${attachment.fileName}`}
      className="group grid min-h-[44px] w-full max-w-[300px] grid-cols-[28px_minmax(0,1fr)_20px] items-center gap-2 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-2 py-1.5 text-start shadow-[var(--md-shadow-line)] outline-none transition-[background-color,box-shadow,scale] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[var(--md-hover)] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a20)] active:scale-[0.98] disabled:opacity-55 disabled:active:scale-100 motion-reduce:transition-none motion-reduce:active:scale-100"
      onClick={() => void open()}
    >
      <span className="grid size-7 place-items-center rounded-[var(--md-radius-md)] bg-[var(--md-surface)] text-[var(--md-subtle)] shadow-[var(--md-shadow-line)]">
        {blocked ? (
          <ShieldAlert className="size-3.5 text-[var(--md-red)]" strokeWidth={1.5} aria-hidden="true" />
        ) : (
          <Paperclip className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
        )}
      </span>
      <span className="min-w-0">
        <bdi data-i18n-skip dir="auto" title={attachment.fileName} className="block truncate text-[12.5px] font-medium text-[var(--md-ink)]">
          {attachment.fileName}
        </bdi>
        <span className="mt-px block truncate text-[11px] text-[var(--md-subtle)]">
          {blocked ? (
            t("Blocked by the security scan")
          ) : attachment.scanStatus === "pending" ? (
            t("Scanning")
          ) : (
            <span data-i18n-skip dir="ltr" className="tabular-nums">{formatBytes(attachment.sizeBytes, language)}</span>
          )}
        </span>
      </span>
      <span className="grid size-5 place-items-center text-[var(--md-subtle)]">
        {busy ? (
          <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" strokeWidth={1.6} aria-hidden="true" />
        ) : (
          <Download
            className="size-3.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none"
            strokeWidth={1.5}
            aria-hidden="true"
          />
        )}
      </span>
    </button>
  )
}

function MessageCard({
  message,
  expanded,
  onToggle,
  registerRef,
  highlighted,
}: {
  message: InboxMessage
  expanded: boolean
  onToggle: () => void
  registerRef: (element: HTMLElement | null) => void
  highlighted: boolean
}) {
  const { language, t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const sender = message.from[0] ?? null
  const timestamp = messageTimestamp(message)
  const recipients = [...message.to, ...message.cc]

  return (
    <article
      ref={registerRef}
      data-message-id={message.id}
      data-highlighted={highlighted ? "true" : undefined}
      className={cn(
        "rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)] transition-[box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
        highlighted && "shadow-[inset_0_0_0_1px_var(--md-accent-a24),0_0_0_3px_var(--md-accent-a12)]",
      )}
    >
      <div className="relative grid w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-3 px-3.5 py-3 text-start">
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={t(expanded ? "Collapse message" : "Expand message")}
          className="absolute inset-0 rounded-[var(--md-radius-xl)] outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a20)]"
          onClick={onToggle}
        />
        <span className="pointer-events-none relative min-w-0">
          <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
            <span data-i18n-skip dir="auto" className="min-w-0 truncate text-[13px] font-medium text-[var(--md-ink)]">
              {sender ? addressLabel(sender) : t("Unknown sender")}
            </span>
            {sender?.displayName ? (
              <bdi data-i18n-skip dir="ltr" className="min-w-0 truncate text-[11.5px] text-[var(--md-subtle)]">
                {sender.address}
              </bdi>
            ) : null}
            {message.direction === "outbound" && message.delivery ? (
              <EmailDeliveryStatus delivery={message.delivery} className="pointer-events-auto" />
            ) : null}
          </span>
          {recipients.length > 0 ? (
            <span className="mt-0.5 block truncate text-[11.5px] text-[var(--md-subtle)]">
              {t("To")}{" "}
              <bdi data-i18n-skip dir="ltr">
                {recipients.map(addressLabel).join(", ")}
              </bdi>
            </span>
          ) : null}
        </span>
        <span className="pointer-events-none relative flex shrink-0 items-center gap-1.5 pt-px">
          {message.attachments.length > 0 ? (
            <Paperclip className="size-3 text-[var(--md-subtle)]" strokeWidth={1.4} aria-hidden="true" />
          ) : null}
          <span data-i18n-skip dir="ltr" className="text-[11px] tabular-nums text-[var(--md-subtle)]">
            {formatThreadTimestamp(timestamp, language)}
          </span>
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "size-3.5 text-[var(--md-subtle)] transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
              expanded && "rotate-180",
            )}
            strokeWidth={1.5}
          />
        </span>
      </div>

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            key="body"
            // A grid track from 0fr to 1fr, so the disclosure never interpolates
            // toward `auto` and can reverse mid-flight without a jump.
            initial={shouldReduceMotion ? false : { gridTemplateRows: "0fr", opacity: 0 }}
            animate={{ gridTemplateRows: "1fr", opacity: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { gridTemplateRows: "0fr", opacity: 0 }}
            transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.panel)}
            className="grid overflow-hidden"
          >
            <div className="min-h-0 px-3.5 pb-3.5">
              <EmailMessageRenderer
                sanitizedHtml={message.sanitizedHtml}
                bodyText={message.bodyText}
                inlineAttachments={message.attachments}
              />
              {message.attachments.filter((attachment) => !attachment.isInline).length > 0 ? (
                <div className="mt-3">
                  <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.07em] text-[var(--md-subtle)]">
                    <span data-i18n-skip dir="ltr" className="tabular-nums">
                      {message.attachments.filter((attachment) => !attachment.isInline).length}
                    </span>{" "}
                    {t("attachments")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {message.attachments
                      .filter((attachment) => !attachment.isInline)
                      .map((attachment) => (
                        <AttachmentRow key={attachment.id} attachment={attachment} />
                      ))}
                  </div>
                </div>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </article>
  )
}

/* ------------------------------------------------------------------------- */

export function InboxPage({ navigate: _navigate }: { navigate: (path: string) => void }) {
  const { direction, language, t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const isDesktop = useIsDesktopLayout()
  const {
    mailboxes,
    accountState,
    accountError,
    provider,
    mailboxId,
    folder,
    folderId,
    view,
    selectedFolder,
    refreshAccounts,
    adjustMailboxUnread,
    threadCache,
    setThreadCache,
    fetchThreadPage,
    readThreadDetail,
    fetchThreadDetail,
    fetchOlderThreadMessages,
    prefetchThreadDetail,
    rememberThreadDetail,
  } = useInboxWorkspace()
  const [initialThreadDeepLink] = useState(() => (
    typeof window === "undefined" ? null : readInboxThreadDeepLink(window.location.search)
  ))
  const [searchInput, setSearchInput] = useState("")
  const [query, setQuery] = useState("")

  const [listState, setListState] = useState<LoadState>("idle")
  const [listError, setListError] = useState<string | null>(null)

  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(initialThreadDeepLink?.threadId ?? null)
  // Recorded when the row is picked, so a provider switch can decide whether the
  // selection still belongs in the new mailbox even while the detail is loading.
  const [selectedThreadMailboxId, setSelectedThreadMailboxId] = useState<string | null>(initialThreadDeepLink?.mailboxId ?? null)
  const [thread, setThread] = useState<InboxThreadDetail | null>(null)
  const [threadState, setThreadState] = useState<LoadState>("idle")
  const [threadError, setThreadError] = useState<string | null>(null)
  const [olderMessagesLoading, setOlderMessagesLoading] = useState(false)
  const [olderMessagesError, setOlderMessagesError] = useState<string | null>(null)
  const [expandedMessageIds, setExpandedMessageIds] = useState<Set<string>>(new Set())
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null)
  const [summaryVisibleThreadId, setSummaryVisibleThreadId] = useState<string | null>(null)

  const [composer, setComposer] = useState<ComposerState>(() => emptyComposerState())
  const [composerStatus, setComposerStatus] = useState<ComposerStatus>("idle")
  const [composerError, setComposerError] = useState<string | null>(null)
  const [remoteDraftId, setRemoteDraftId] = useState<string | null>(null)
  const [draftRestored, setDraftRestored] = useState(false)
  const [dexterComposerStatus, setDexterComposerStatus] = useState<"idle" | "drafting">("idle")
  const [dexterComposerError, setDexterComposerError] = useState<string | null>(null)
  // Files a recovered draft used to carry. The bytes are never kept on the
  // device, so the composer asks for them by name instead of pretending.
  const [restoredAttachmentNames, setRestoredAttachmentNames] = useState<string[]>([])

  const [stage, setStage] = useState<MobileStage>(initialThreadDeepLink ? "message" : "threads")
  const [syncingMailboxId, setSyncingMailboxId] = useState<string | null>(null)
  const [connectingProvider, setConnectingProvider] = useState<MailProvider | null>(null)
  const [automaticReplyOpen, setAutomaticReplyOpen] = useState(false)
  const [automaticReplies, setAutomaticReplies] = useState<Record<string, AutomaticReplySettings>>({})
  const [connectionResult] = useState(() => (
    typeof window === "undefined" ? null : readEmailConnectionResult(window.location.search)
  ))
  const [outlookAdminConsentUrl, setOutlookAdminConsentUrl] = useState<string | null>(null)

  const listRequestRef = useRef(0)
  const threadRequestRef = useRef(0)
  const summaryRequestRef = useRef(0)
  const dexterComposerIdentityRef = useRef("")
  const discardingDraftRef = useRef(false)
  const messageRefs = useRef(new Map<string, HTMLElement>())
  const summaryRef = useRef<HTMLDivElement | null>(null)
  const threadListRef = useRef<HTMLDivElement | null>(null)
  const highlightTimerRef = useRef<number | null>(null)
  const connectionResultHandledRef = useRef(false)
  const mailboxSyncInFlightRef = useRef<string | null>(null)
  const trackingRefreshInFlightRef = useRef<string | null>(null)
  dexterComposerIdentityRef.current = [
    selectedThreadId ?? "none",
    composer.mode,
    composer.threadId ?? "new",
    composer.sourceMessageId ?? "none",
    composer.presentation,
  ].join(":")

  const activeMailbox = useMemo(
    () => mailboxes.find((candidate) => candidate.id === mailboxId) ?? null,
    [mailboxes, mailboxId],
  )
  const ownAddresses = useMemo(() => mailboxes.map((mailbox) => mailbox.address), [mailboxes])
  const cacheKey = mailboxId ? threadCacheKey(mailboxId, folder, query, folderId) : null
  const listEntry = cacheKey ? threadCache[cacheKey] : undefined
  const threads = listEntry?.items ?? []
  const selectedThreadPreview = selectedThreadId
    ? threads.find((item) => item.id === selectedThreadId) ?? null
    : null
  // The badge sits beside the active mailbox address, so its count must belong
  // to that mailbox too. A provider-wide sum made a Google Group or Outlook
  // shared address look as if it owned unread mail from the personal inbox.
  const unreadTotal = activeMailbox?.unreadCount ?? 0
  const canSendFromMailbox = Boolean(activeMailbox?.outboundEnabled) && !thread?.readOnly
  const activeAutomaticReply = activeMailbox ? automaticReplies[activeMailbox.id] ?? null : null
  const rememberAutomaticReply = useCallback((settings: AutomaticReplySettings) => {
    if (!activeMailbox) return
    setAutomaticReplies((current) => ({ ...current, [activeMailbox.id]: settings }))
  }, [activeMailbox])

  useEffect(() => {
    if (!connectionResult || connectionResultHandledRef.current) return
    connectionResultHandledRef.current = true

    const cleanUrl = new URL(window.location.href)
    cleanUrl.searchParams.delete("email_connection")
    cleanUrl.searchParams.delete("status")
    cleanUrl.searchParams.delete("code")
    window.history.replaceState(window.history.state, "", `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`)

    if (connectionResult.status === "connected") {
      toast.success(t(`${mailProviderLabels[connectionResult.provider]} connected`))
      // OAuth creates the connection and personal mailbox, but provider mail is
      // imported through the authenticated Inbox Edge boundary. Start that
      // first import here so a successful consent never lands on an empty
      // workspace that only fills after the operator discovers Refresh.
      void (async () => {
        const connectedMailboxes = await refreshAccounts()
        if (!connectedMailboxes) return
        const targets = connectedMailboxes.filter((mailbox) =>
          mailbox.provider === connectionResult.provider
          && mailbox.inboundEnabled
          && mailbox.status === "connected")
        if (!targets.length) return

        let hasMore = false
        try {
          for (const mailbox of targets) {
            if (mailboxSyncInFlightRef.current) continue
            mailboxSyncInFlightRef.current = mailbox.id
            setSyncingMailboxId(mailbox.id)
            try {
              const sync = await requestMailboxSync(mailbox.id)
              hasMore ||= sync.hasMore
            } finally {
              mailboxSyncInFlightRef.current = null
            }
          }
          await refreshAccounts()
          // The empty page may have loaded while the first provider import was
          // still running. Drop every cached folder for the newly connected
          // mailbox so the normal list effect immediately renders real mail
          // instead of waiting for the operator to discover Refresh.
          const importedMailboxIds = new Set(targets.map((mailbox) => mailbox.id))
          setThreadCache((current) => Object.fromEntries(
            Object.entries(current).filter(([key]) => !importedMailboxIds.has(key.split("::", 1)[0])),
          ))
          toast.success(t(hasMore
            ? "Your mailbox is connected. Email from the last 12 months will keep indexing in the background."
            : "Your mailbox is ready"))
        } catch (error) {
          toast.error(errorMessageFor(error, t("The account connected, but its first mail import could not finish. Try Refresh.")))
        } finally {
          setSyncingMailboxId(null)
        }
      })()
      return
    }
    if (connectionResult.code === "provider_token_exchange_failed") {
      toast.error(t("The provider approved access, but Multideck could not complete the secure connection. Try again."))
      return
    }
    if (connectionResult.code !== "provider_admin_consent_required") {
      toast.error(t("The email provider did not approve the connection."))
      return
    }

    toast.error(t("Your Microsoft 365 organisation requires an administrator to approve Multideck."))
    let cancelled = false
    void listInboxProviders()
      .then((providers) => {
        if (cancelled) return
        setOutlookAdminConsentUrl(
          providers.find((candidate) => candidate.provider === "outlook")?.adminConsentUrl ?? null,
        )
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [connectionResult, refreshAccounts, t])

  /* ------------------------------------------------------------------ search */

  useEffect(() => {
    const handle = window.setTimeout(() => setQuery(searchInput), 260)
    return () => window.clearTimeout(handle)
  }, [searchInput])

  /* ------------------------------------------------------------- thread list */

  /**
   * The cursor is passed in rather than read out of the cache, so appending a
   * page always uses the cursor the caller can see on screen and never a stale
   * one captured when this callback was created.
   */
  const loadThreads = useCallback(
    async (cursor: string | null, force = false) => {
      if (!mailboxId) return
      const append = cursor !== null

      const requestId = ++listRequestRef.current
      setListState(append ? "loadingMore" : "loading")
      setListError(null)

      try {
        await fetchThreadPage({ mailboxId, folder, folderId, query, cursor, limit: pageSize }, append, force)
        // A newer request for a different mailbox, folder or query has taken over.
        if (requestId !== listRequestRef.current) return
        setListState("ready")
      } catch (error) {
        if (requestId !== listRequestRef.current) return
        setListError(errorMessageFor(error, t("Unable to load this mailbox.")))
        setListState("error")
      }
    },
    [fetchThreadPage, folder, folderId, mailboxId, query, t],
  )

  useEffect(() => {
    if (!mailboxId) return
    const key = threadCacheKey(mailboxId, folder, query, folderId)
    // A list already in the cache stays on screen, so switching mailbox or
    // provider and coming back is instant and keeps the scroll and selection.
    // `threadCache` is read from this render rather than watched, because the
    // effect only needs to fire when the mailbox, folder or query changes.
    if (threadCache[key]) {
      setListState("ready")
      return
    }
    void loadThreads(null)
  }, [folder, folderId, loadThreads, mailboxId, query, threadCache])

  const refreshSelectedThread = useCallback(async () => {
    if (!selectedThreadId || trackingRefreshInFlightRef.current) return null
    const targetThreadId = selectedThreadId
    trackingRefreshInFlightRef.current = targetThreadId
    try {
      const refreshed = await fetchThreadDetail(targetThreadId, true)
      setThread((current) => current?.id === targetThreadId ? refreshed : current)
      return refreshed
    } catch {
      // Keep the last confirmed detail visible. Provider and account failures
      // are surfaced by the mailbox sync without making a status poll disruptive.
      return null
    } finally {
      if (trackingRefreshInFlightRef.current === targetThreadId) trackingRefreshInFlightRef.current = null
    }
  }, [fetchThreadDetail, selectedThreadId])

  const runMailboxSync = useCallback(async (targetMailboxId: string) => {
    if (mailboxSyncInFlightRef.current) return null
    mailboxSyncInFlightRef.current = targetMailboxId
    setSyncingMailboxId(targetMailboxId)
    try {
      const sync = await requestMailboxSync(targetMailboxId)
      await refreshAccounts()
      // Keep the current rows mounted while the first page is replaced. New
      // provider mail therefore appears without a full-page loading flash.
      if (sync.synced > 0 && mailboxId === targetMailboxId) await loadThreads(null, true)
      if (selectedThreadMailboxId === targetMailboxId) await refreshSelectedThread()
      return sync
    } finally {
      mailboxSyncInFlightRef.current = null
      setSyncingMailboxId((current) => current === targetMailboxId ? null : current)
    }
  }, [loadThreads, mailboxId, refreshAccounts, refreshSelectedThread, selectedThreadMailboxId])

  // Historical mail continues in bounded batches while the operator is in the
  // Inbox. Once indexed, the same provider cursor becomes a lightweight delta
  // check so new mail appears automatically without a manual Refresh.
  useEffect(() => {
    if (!activeMailbox) return
    const targetMailboxId = activeMailbox.id
    if (
      !activeMailbox.inboundEnabled
      || activeMailbox.status !== "connected"
    ) return

    let cancelled = false
    let timerId: number | null = null
    const schedule = (delay: number) => {
      if (cancelled) return
      if (timerId !== null) window.clearTimeout(timerId)
      timerId = window.setTimeout(() => void run(), delay)
    }
    const run = async () => {
      if (document.visibilityState === "hidden") {
        schedule(liveMailboxSyncIntervalMs)
        return
      }
      try {
        const sync = await runMailboxSync(targetMailboxId)
        if (cancelled) return
        schedule(sync?.hasMore ? indexContinuationDelayMs : liveMailboxSyncIntervalMs)
      } catch (error) {
        if (!cancelled) {
          const providerCooldownMs = error instanceof InboxApiError && error.code === "rate_limited"
            ? Math.max(60_000, (error.retryAfterSeconds ?? 0) * 1_000)
            : liveMailboxSyncIntervalMs
          schedule(providerCooldownMs)
        }
      }
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") schedule(250)
    }

    document.addEventListener("visibilitychange", onVisibilityChange)
    // A transient provider failure shows the paused state but is retried with
    // the calm live-sync cadence. This prevents a temporary Gmail/Graph error
    // from leaving a connected mailbox permanently stale.
    schedule(
      activeMailbox.indexStatus === "ready" || activeMailbox.indexStatus === "error"
        ? liveMailboxSyncIntervalMs
        : 150,
    )
    return () => {
      cancelled = true
      if (timerId !== null) window.clearTimeout(timerId)
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [activeMailbox?.id, activeMailbox?.inboundEnabled, activeMailbox?.indexStatus, activeMailbox?.status, runMailboxSync])

  /* ----------------------------------------------------------- thread detail */

  useEffect(() => {
    setOlderMessagesLoading(false)
    setOlderMessagesError(null)
    if (!selectedThreadId) {
      setThread(null)
      setThreadState("idle")
      setThreadError(null)
      setExpandedMessageIds(new Set())
      return
    }

    const requestId = ++threadRequestRef.current
    setThreadError(null)

    const cached = readThreadDetail(selectedThreadId)
    if (cached) {
      setThread(cached)
      setSelectedThreadMailboxId(cached.mailboxId)
      setThreadState("ready")
      const last = cached.messages.at(-1)
      setExpandedMessageIds(new Set(last ? [last.id] : []))
      return
    }

    setThreadState("loading")

    fetchThreadDetail(selectedThreadId)
      .then((detail) => {
        if (requestId !== threadRequestRef.current) return
        setThread(detail)
        setSelectedThreadMailboxId(detail.mailboxId)
        setThreadState("ready")
        // The newest message is what the operator came to read.
        const last = detail.messages.at(-1)
        setExpandedMessageIds(new Set(last ? [last.id] : []))
      })
      .catch((error) => {
        if (requestId !== threadRequestRef.current) return
        setThreadError(errorMessageFor(error, t("Unable to open this conversation.")))
        setThreadState("error")
      })
  }, [fetchThreadDetail, readThreadDetail, selectedThreadId, t])

  const loadOlderMessages = useCallback(async () => {
    if (!thread || !thread.hasOlderMessages || olderMessagesLoading) return
    const targetThreadId = thread.id
    setOlderMessagesLoading(true)
    setOlderMessagesError(null)
    try {
      const detail = await fetchOlderThreadMessages(targetThreadId, thread.messages.length)
      setThread((current) => current?.id === targetThreadId ? detail : current)
    } catch (error) {
      setOlderMessagesError(errorMessageFor(error, t("Unable to load older messages.")))
    } finally {
      setOlderMessagesLoading(false)
    }
  }, [fetchOlderThreadMessages, olderMessagesLoading, t, thread])

  // Open pixels update Multideck directly rather than the mailbox provider, so
  // provider delta sync alone cannot refresh a visible status. Poll only the
  // selected conversation, pause in the background, and preserve the current
  // content if a refresh fails.
  useEffect(() => {
    if (!selectedThreadId) return
    let cancelled = false
    let timerId: number | null = null
    const schedule = (delay: number) => {
      if (cancelled) return
      if (timerId !== null) window.clearTimeout(timerId)
      timerId = window.setTimeout(() => void run(), delay)
    }
    const run = async () => {
      if (document.visibilityState === "hidden") {
        schedule(trackingStatusRefreshIntervalMs)
        return
      }
      await refreshSelectedThread()
      schedule(trackingStatusRefreshIntervalMs)
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") schedule(250)
    }
    document.addEventListener("visibilitychange", onVisibilityChange)
    schedule(trackingStatusRefreshIntervalMs)
    return () => {
      cancelled = true
      if (timerId !== null) window.clearTimeout(timerId)
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [refreshSelectedThread, selectedThreadId])

  useEffect(() => {
    if (typeof window === "undefined" || window.location.pathname !== "/inbox") return
    const url = new URL(window.location.href)
    if (selectedThreadId && selectedThreadMailboxId) {
      if (provider) url.searchParams.set("provider", provider)
      url.searchParams.set("mailbox", selectedThreadMailboxId)
      url.searchParams.set("thread", selectedThreadId)
    } else {
      url.searchParams.delete("thread")
    }
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`)
  }, [provider, selectedThreadId, selectedThreadMailboxId])

  /* -------------------------------------------------------- read-state sync */

  const patchListItem = useCallback(
    (threadId: string, patch: Partial<InboxThreadListItem>) => {
      setThreadCache((current) => {
        let changed = false
        const next: Record<string, ThreadCacheEntry> = {}
        for (const [key, entry] of Object.entries(current)) {
          const updated = applyThreadPatch(entry, threadId, patch)
          next[key] = updated ?? entry
          if (updated !== entry) changed = true
        }
        return changed ? next : current
      })
    },
    [],
  )

  const setReadState = useCallback(
    async (target: InboxThreadListItem | InboxThreadDetail, isRead: boolean) => {
      // Marking read only changes something when the thread is currently unread,
      // and marking unread only when it is currently read.
      const wasUnread = target.unreadCount > 0
      const changes = wasUnread === isRead
      if (!changes) return

      patchListItem(target.id, { unreadCount: isRead ? 0 : 1 })
      setThread((current) => (current?.id === target.id ? { ...current, unreadCount: isRead ? 0 : 1 } : current))
      adjustMailboxUnread(target.mailboxId, isRead ? -Math.max(1, target.unreadCount) : 1)

      try {
        await patchThreadState(target.id, { isRead })
      } catch (error) {
        // Put the row back the way the server still sees it.
        patchListItem(target.id, { unreadCount: target.unreadCount })
        setThread((current) => (current?.id === target.id ? { ...current, unreadCount: target.unreadCount } : current))
        adjustMailboxUnread(target.mailboxId, isRead ? Math.max(1, target.unreadCount) : -1)
        toast.error(errorMessageFor(error, t("Unable to change the read state.")))
      }
    },
    [adjustMailboxUnread, patchListItem, t],
  )

  // Opening a thread marks it read, once the detail has genuinely loaded. Keyed on
  // the thread id so re-reading the same thread does not fire the call again.
  const markedReadRef = useRef<string | null>(null)
  useEffect(() => {
    if (threadState !== "ready" || !thread || thread.unreadCount === 0) return
    if (markedReadRef.current === thread.id) return
    markedReadRef.current = thread.id
    void setReadState(thread, true)
  }, [setReadState, thread, threadState])

  /* ------------------------------------------------------------ Dexter summary */

  const applySummary = useCallback((threadId: string, summary: ThreadSummaryState) => {
    setThread((current) => (current?.id === threadId ? { ...current, summary } : current))
    setThreadCache((current) => {
      const next: Record<string, ThreadCacheEntry> = {}
      for (const [key, entry] of Object.entries(current)) {
        next[key] = applyThreadPatch(entry, threadId, { summary }) ?? entry
      }
      return next
    })
  }, [])

  const requestSummary = useCallback(
    async (threadId: string) => {
      const requestId = ++summaryRequestRef.current
      applySummary(threadId, {
        status: "pending",
        text: null,
        keyPoints: [],
        sourceMessageIds: [],
        model: null,
        updatedAt: null,
        error: null,
      })

      try {
        const summary = await generateThreadSummary(threadId)
        if (requestId !== summaryRequestRef.current) return
        applySummary(threadId, summary)
      } catch (error) {
        if (requestId !== summaryRequestRef.current) return
        applySummary(threadId, {
          status: "failed",
          text: null,
          keyPoints: [],
          sourceMessageIds: [],
          model: null,
          updatedAt: null,
          error: errorMessageFor(error, t("Unable to summarise this thread.")),
        })
      }
    },
    [applySummary, t],
  )

  // A summary is deliberately opt-in. Selecting a conversation never spends a
  // model call or mounts the summary surface; the Dexter action is the only
  // entry point. Switching conversations also hides the previous result and
  // invalidates an in-flight response before it can update the new thread.
  useEffect(() => {
    setSummaryVisibleThreadId(null)
    summaryRequestRef.current += 1
  }, [selectedThreadId])

  const activeThreadId = thread?.id

  useEffect(() => {
    if (!activeThreadId || summaryVisibleThreadId !== activeThreadId) return

    const frameId = window.requestAnimationFrame(() => {
      summaryRef.current?.scrollIntoView({
        behavior: shouldReduceMotion ? "auto" : "smooth",
        block: "start",
      })
    })

    return () => window.cancelAnimationFrame(frameId)
  }, [activeThreadId, shouldReduceMotion, summaryVisibleThreadId])

  const summariseThread = useCallback((target: InboxThreadDetail) => {
    setSummaryVisibleThreadId(target.id)
    if (["none", "stale", "failed"].includes(target.summary.status)) void requestSummary(target.id)
  }, [requestSummary])

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current)
    }
  }, [])

  /* -------------------------------------------------------------- selection */

  function selectThread(threadItem: InboxThreadListItem) {
    const cached = readThreadDetail(threadItem.id)
    if (cached) {
      setThread(cached)
      setThreadState("ready")
      setThreadError(null)
      const last = cached.messages.at(-1)
      setExpandedMessageIds(new Set(last ? [last.id] : []))
    } else {
      // Replace the previous conversation in the same event as selection. The
      // list row already carries enough real data for an immediate preview, so
      // a cold detail request never leaves stale mail or a blank spinner behind.
      setThread(null)
      setThreadState("loading")
      setThreadError(null)
    }
    setSelectedThreadId(threadItem.id)
    setSelectedThreadMailboxId(threadItem.mailboxId)
    setComposer(emptyComposerState())
    setRemoteDraftId(null)
    setDraftRestored(false)
    setRestoredAttachmentNames([])
    setComposerStatus("idle")
    setComposerError(null)
    setHighlightedMessageId(null)
    setStage("message")
  }

  // The desktop sidebar and the mobile mailbox switch share this selection. If
  // either changes it, keep a thread only when it belongs to the new mailbox.
  const previousScopeRef = useRef({ mailboxId, folder, folderId })
  useEffect(() => {
    const previous = previousScopeRef.current
    if (previous.mailboxId === mailboxId && previous.folder === folder && previous.folderId === folderId) return
    previousScopeRef.current = { mailboxId, folder, folderId }
    const keptThreadId = previous.folder === folder && previous.folderId === folderId
      ? resolveSelectionForMailbox(selectedThreadId, selectedThreadMailboxId, mailboxId ?? "")
      : null
    setSelectedThreadId(keptThreadId)
    if (!keptThreadId) {
      setSelectedThreadMailboxId(null)
      setThread(null)
      setStage("threads")
    }
  }, [folder, folderId, mailboxId, selectedThreadId, selectedThreadMailboxId])

  function focusMessage(messageId: string) {
    setExpandedMessageIds((current) => new Set(current).add(messageId))
    setHighlightedMessageId(messageId)
    if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current)
    highlightTimerRef.current = window.setTimeout(() => setHighlightedMessageId(null), 1_600)
    window.requestAnimationFrame(() => {
      messageRefs.current.get(messageId)?.scrollIntoView({
        behavior: shouldReduceMotion ? "auto" : "smooth",
        block: "center",
      })
    })
  }

  function moveSelection(offset: number) {
    if (threads.length === 0) return
    const index = threads.findIndex((item) => item.id === selectedThreadId)
    const nextIndex = index === -1 ? 0 : Math.min(threads.length - 1, Math.max(0, index + offset))
    const next = threads[nextIndex]
    if (!next || next.id === selectedThreadId) return
    selectThread(next)
    // Keep DOM focus travelling with the selection so keyboard-only use works.
    window.requestAnimationFrame(() => {
      threadListRef.current
        ?.querySelector<HTMLButtonElement>(`[data-thread-id="${next.id}"] button`)
        ?.focus()
    })
  }

  /* ------------------------------------------------------------------ actions */

  async function toggleStar(target: InboxThreadListItem | InboxThreadDetail) {
    const next = !target.starred
    patchListItem(target.id, { starred: next })
    setThread((current) => (current?.id === target.id ? { ...current, starred: next } : current))
    try {
      await patchThreadState(target.id, { isStarred: next })
    } catch (error) {
      patchListItem(target.id, { starred: target.starred })
      setThread((current) => (current?.id === target.id ? { ...current, starred: target.starred } : current))
      toast.error(errorMessageFor(error, t("Unable to change the star.")))
    }
  }

  async function archiveThread(target: InboxThreadDetail) {
    try {
      await patchThreadState(target.id, { isArchived: true })
      patchListItem(target.id, { archived: true })
      if (folder === "inbox" && cacheKey) {
        setThreadCache((current) => {
          const entry = current[cacheKey]
          if (!entry) return current
          return { ...current, [cacheKey]: { ...entry, items: entry.items.filter((item) => item.id !== target.id) } }
        })
      }
      setSelectedThreadId(null)
      setSelectedThreadMailboxId(null)
      setStage("threads")
      toast.success(t("Conversation archived"))
    } catch (error) {
      toast.error(errorMessageFor(error, t("Unable to archive this conversation.")))
    }
  }

  async function moveThreadToTrash(target: InboxThreadDetail) {
    try {
      await trashThread(target.id)
      setThreadCache((current) => Object.fromEntries(
        Object.entries(current).map(([key, entry]) => [
          key,
          key.includes("::trash::")
            ? entry
            : { ...entry, items: entry.items.filter((item) => item.id !== target.id) },
        ]),
      ))
      setSelectedThreadId(null)
      setSelectedThreadMailboxId(null)
      setStage("threads")
      toast.success(t("Conversation moved to trash"))
    } catch (error) {
      toast.error(errorMessageFor(error, t("Unable to move this conversation to trash.")))
    }
  }

  async function reconnect(targetProvider: MailProvider) {
    if (connectingProvider) return
    setConnectingProvider(targetProvider)
    try {
      const url = await startProviderAuthorization(targetProvider)
      window.location.assign(url)
    } catch (error) {
      setConnectingProvider(null)
      toast.error(errorMessageFor(error, t("Unable to start the provider sign-in.")))
    }
  }

  async function syncActiveMailbox() {
    if (!activeMailbox || mailboxSyncInFlightRef.current) return
    try {
      const sync = await runMailboxSync(activeMailbox.id)
      if (!sync) return
      toast.success(t(sync.hasMore
        ? "Mailbox refreshed. Email from the last 12 months is still indexing in the background."
        : "Mailbox refreshed"))
    } catch (error) {
      toast.error(errorMessageFor(error, t("Unable to refresh this mailbox.")))
    }
  }

  /* ----------------------------------------------------------------- composer */

  function openComposer(mode: SendMode) {
    const sourceMessage = mode === "new" ? null : latestReplySource(thread?.messages ?? [])
    const draftKey = localDraftKey(mailboxId ?? "", mode === "new" ? null : thread?.id ?? null, mode)
    const stored = readLocalDraft(draftKey)

    setRemoteDraftId(stored?.remoteDraftId ?? null)
    setDraftRestored(Boolean(stored))
    setRestoredAttachmentNames(stored?.attachmentNames ?? [])
    setComposerStatus("idle")
    setComposerError(null)
    setDexterComposerStatus("idle")
    setDexterComposerError(null)
    setComposer({
      ...emptyComposerState(mode, "open"),
      threadId: mode === "new" ? null : thread?.id ?? null,
      sourceMessageId: sourceMessage?.id ?? null,
      subject:
        stored?.subject
        ?? (mode === "forward" && thread ? `Fwd: ${thread.subject}` : ""),
      bodyText: stored?.bodyText ?? "",
      trackOpens: stored?.trackOpens ?? true,
      to: stored?.addedTo ?? [],
      cc: stored?.addedCc ?? [],
      bcc: stored?.addedBcc ?? [],
      // A recovered draft opens on the rows it actually used.
      showCc: (stored?.addedCc.length ?? 0) > 0,
      showBcc: (stored?.addedBcc.length ?? 0) > 0,
    })
  }

  const persistLocalDraft = useCallback((pendingSync: boolean) => {
    if (!mailboxId) return
    const edits = composerEdits(composer)
    const key = localDraftKey(mailboxId, composer.threadId, composer.mode)
    if (isEmptyEdits(edits)) {
      clearLocalDraft(key)
      return
    }
    saveLocalDraft({
      key,
      mailboxId,
      threadId: composer.threadId,
      mode: composer.mode,
      sourceMessageId: composer.sourceMessageId,
      remoteDraftId,
      subject: edits.subject,
      bodyText: edits.bodyText,
      trackOpens: edits.trackOpens,
      addedTo: edits.addedTo,
      addedCc: edits.addedCc,
      addedBcc: edits.addedBcc,
      removedAddresses: edits.removedAddresses,
      attachmentNames: edits.attachments.map((attachment) => attachment.fileName),
      pendingSync,
    })
  }, [composer, mailboxId, remoteDraftId])

  // Every keystroke is kept locally, so a lost connection, a closed composer or a
  // reload never costs the operator the words they already typed.
  useEffect(() => {
    if (composer.presentation === "docked" || !mailboxId) return
    const handle = window.setTimeout(() => persistLocalDraft(true), 700)
    return () => window.clearTimeout(handle)
  }, [composer.presentation, mailboxId, persistLocalDraft])

  async function saveComposerDraft() {
    if (!mailboxId) return
    setComposerStatus("saving")
    setComposerError(null)
    try {
      const request = buildReplyRequest({
        mode: composer.mode,
        mailboxId,
        threadId: composer.threadId,
        sourceMessageId: composer.sourceMessageId,
        draftId: remoteDraftId,
        edits: composerEdits(composer),
        idempotencyKey: createIdempotencyKey(),
      })
      const draft = await saveDraft(request, remoteDraftId)
      setRemoteDraftId(draft.id)
      setDraftRestored(false)
      setRestoredAttachmentNames([])
      persistLocalDraft(false)
      setComposerStatus("idle")
      toast.success(composer.attachments.length > 0
        ? t("Draft saved. Attached files stay in this composer until you send.")
        : t("Draft saved"))
    } catch (error) {
      persistLocalDraft(true)
      setComposerStatus("failed")
      setComposerError(errorMessageFor(error, t("Unable to save this draft. It is kept on this device.")))
    }
  }

  async function sendComposer() {
    if (!mailboxId || composerStatus === "sending") return
    setComposerStatus("sending")
    setComposerError(null)

    // One key per attempt, so a retry after a timeout cannot send twice.
    const idempotencyKey = createIdempotencyKey()

    try {
      const request = buildReplyRequest({
        mode: composer.mode,
        mailboxId,
        threadId: composer.threadId,
        sourceMessageId: composer.sourceMessageId,
        draftId: remoteDraftId,
        edits: composerEdits(composer),
        idempotencyKey,
      })
      const receipt = await submitSend(request)
      clearLocalDraft(localDraftKey(mailboxId, composer.threadId, composer.mode))
      setRemoteDraftId(null)
      setDraftRestored(false)
      setRestoredAttachmentNames([])

      if (receipt.status === "failed") {
        setComposerStatus("failed")
        setComposerError(t("The provider rejected this message. Check the recipients and try again."))
        return
      }

      setComposerStatus(receipt.status === "queued" ? "queued" : "idle")
      setDexterComposerError(null)
      toast.success(receipt.status === "queued" ? t("Message queued to send") : t("Message sent"))
      setComposer(emptyComposerState(composer.mode))
      if (composer.threadId) {
        const refreshed = await fetchThreadDetail(composer.threadId, true).catch(() => null)
        if (refreshed) {
          rememberThreadDetail(refreshed)
          setThread(refreshed)
        }
      }
    } catch (error) {
      persistLocalDraft(true)
      setComposerStatus("failed")
      setComposerError(errorMessageFor(error, t("Unable to send this message. It is kept as a draft on this device.")))
    }
  }

  async function composeWithDexter() {
    if (dexterComposerStatus === "drafting") return
    const requestIdentity = dexterComposerIdentityRef.current
    setDexterComposerStatus("drafting")
    setDexterComposerError(null)
    try {
      const result = await prepareInboxDexterDraft({
        mode: composer.mode,
        sourceMessageId: composer.sourceMessageId,
        to: composer.to,
        cc: composer.cc,
        bcc: composer.bcc,
        subject: composer.mode === "new" || composer.mode === "forward" ? composer.subject : thread?.subject ?? "",
        bodyText: composer.bodyText,
        locale: language,
      })
      if (dexterComposerIdentityRef.current !== requestIdentity) return
      setComposer((current) => ({
        ...current,
        subject: current.mode === "new" || current.mode === "forward" ? result.draft.subject : current.subject,
        bodyText: result.draft.bodyText,
      }))
      toast.success(result.personalised ? t("Dexter drafted this in your email style") : t("Dexter prepared an email draft"))
    } catch (error) {
      if (dexterComposerIdentityRef.current !== requestIdentity) return
      setDexterComposerError(errorMessageFor(error, t("Dexter could not draft this email. Your current wording is unchanged.")))
    } finally {
      if (dexterComposerIdentityRef.current === requestIdentity) setDexterComposerStatus("idle")
    }
  }

  async function discardComposer(): Promise<boolean> {
    if (discardingDraftRef.current || composerStatus === "saving" || composerStatus === "sending" || composerStatus === "discarding") return false
    discardingDraftRef.current = true

    try {
      const hadDraftContent = remoteDraftId !== null || !isEmptyEdits(composerEdits(composer))

      if (remoteDraftId) {
        setComposerStatus("discarding")
        setComposerError(null)
        try {
          await discardDraft(remoteDraftId)
        } catch (error) {
          // A second tab or the provider may have removed it already. That leaves
          // the operator in the requested state, so only genuine failures retain
          // the composer and its session recovery copy.
          if (!isInboxNotFound(error)) {
            setComposerStatus("failed")
            setComposerError(errorMessageFor(error, t("Unable to discard this draft. Your message has been kept.")))
            return false
          }
        }
      }

      if (mailboxId) clearLocalDraft(localDraftKey(mailboxId, composer.threadId, composer.mode))
      setComposer(emptyComposerState())
      setRemoteDraftId(null)
      setDraftRestored(false)
      setRestoredAttachmentNames([])
      setComposerStatus("idle")
      setComposerError(null)
      setDexterComposerStatus("idle")
      setDexterComposerError(null)
      if (hadDraftContent) toast.success(t("Draft discarded"))
      return true
    } finally {
      discardingDraftRef.current = false
    }
  }

  /* ------------------------------------------------------------------ render */

  const summarySources = useMemo<ThreadSummarySource[]>(() => {
    if (!thread) return []
    return thread.summary.sourceMessageIds
      .map((messageId) => thread.messages.find((message) => message.id === messageId))
      .filter((message): message is InboxMessage => Boolean(message))
      .map((message) => ({
        messageId: message.id,
        label: message.from[0] ? addressLabel(message.from[0]) : t("Message"),
      }))
  }, [t, thread])

  if (accountState === "idle" || accountState === "loading") {
    return (
      <div className="grid h-full place-items-center">
        <p className="flex items-center gap-2 text-[13px] text-[var(--md-text)]">
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" strokeWidth={1.5} aria-hidden="true" />
          {t("Opening your inbox...")}
        </p>
      </div>
    )
  }

  if (accountState === "error") {
    return (
      <WorkspaceMessage
        icon={ShieldAlert}
        tone="error"
        title={t("Unable to load your mail connections")}
        description={accountError ?? t("Check your connection and try again.")}
        action={
          <Button
            type="button"
            className="h-10 rounded-[var(--md-radius-md)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-[var(--md-accent-ink)]"
            onClick={() => void refreshAccounts()}
          >
            {t("Try again")}
          </Button>
        }
      />
    )
  }

  if (mailboxes.length === 0) {
    if (connectionResult?.provider === "outlook" && connectionResult.code === "provider_admin_consent_required") {
      return (
        <WorkspaceMessage
          icon={ShieldAlert}
          tone="warning"
          title={t("Microsoft 365 approval is required")}
          description={t("Your organisation controls which apps can access email. Ask a Microsoft 365 administrator to approve Multideck once, then reconnect your Outlook account.")}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {outlookAdminConsentUrl ? (
                <Button
                  type="button"
                  className="h-10 rounded-[var(--md-radius-md)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-[var(--md-accent-ink)]"
                  onClick={() => window.location.assign(outlookAdminConsentUrl)}
                >
                  {t("Open admin approval")}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                className="h-10 rounded-[var(--md-radius-md)] bg-[var(--md-surface)] px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)]"
                onClick={() => void reconnect("outlook")}
              >
                {t("Try another account")}
              </Button>
            </div>
          }
        />
      )
    }
    return (
      <InboxConnectionPicker
        connectingProvider={connectingProvider}
        onConnect={(candidate) => void reconnect(candidate)}
      />
    )
  }

  const stageIndex = stage === "threads" ? 0 : 1
  const stageOffset = (direction === "rtl" ? 1 : -1) * stageIndex * 100
  const composingNew = composer.mode === "new" && composer.presentation !== "docked"
  const pendingEdits = composerEdits(composer)
  const canSendComposer =
    canSendFromMailbox
    && composer.bodyText.trim().length > 0
    // A new message or a forward needs somebody to send to. A reply already has
    // one, resolved on the server from the message being replied to.
    && (!composerNeedsRecipient(composer.mode)
      || pendingEdits.addedTo.length + pendingEdits.addedCc.length + pendingEdits.addedBcc.length > 0)

  // Who a reply reaches. The server resolves the real list from the source
  // message when it sends; this only names it, so the composer can show the
  // audience as a locked chip instead of an address list it cannot guarantee.
  const composerSourceMessage = composer.sourceMessageId
    ? thread?.messages.find((message) => message.id === composer.sourceMessageId) ?? null
    : null
  const composerReplyAudience: ReplyAudience | null =
    composer.mode === "reply"
      ? {
          label: composerSourceMessage?.from[0]
            ? addressLabel(composerSourceMessage.from[0])
            : t("The sender"),
          detail: t("Multideck resolves this from the message you are replying to when it sends."),
        }
      : composer.mode === "reply_all"
        ? {
            label: t("Everyone on this message"),
            detail: t("Multideck resolves the full list from the message you are replying to when it sends."),
          }
        : null
  if (view === "suggested") return <InboxSuggestedUpdatesWorkspace mailboxes={mailboxes} />

  const emptyFolderTitle = selectedFolder
    ? t("No messages in this folder")
    : folder === "archive"
    ? t("Nothing archived yet")
    : folder === "sent"
      ? t("No sent messages")
      : folder === "drafts"
        ? t("No drafts")
        : folder === "spam"
          ? t("No spam")
          : folder === "trash"
            ? t("Trash is empty")
        : t("This folder is empty")
  const emptyFolderDescription = selectedFolder
    ? t("Messages with this folder or label will appear here.")
    : folder === "archive"
    ? t("Conversations you archive from the inbox are kept here.")
    : folder === "sent"
      ? t("Messages you send from this mailbox will appear here.")
      : folder === "drafts"
        ? t("Drafts saved from this mailbox will appear here.")
        : folder === "spam"
          ? t("Messages Gmail or Outlook marks as spam will appear here.")
          : folder === "trash"
            ? t("Deleted messages from this mailbox will appear here.")
        : t("New mail for this mailbox will appear here.")

  const threadPane = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-3 pt-3">
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--md-subtle)]"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              aria-label={t("Search this mailbox")}
              placeholder={t("Search this mailbox")}
              className="h-11 w-full rounded-[var(--md-radius-md)] bg-[var(--md-field-bg)] ps-8 pe-8 text-[16px] text-[var(--md-ink)] outline-none placeholder:text-[var(--md-subtle)] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a20)] sm:text-[13px]"
            />
            {searchInput ? (
              <button
                type="button"
                aria-label={t("Clear search")}
                title={t("Clear search")}
                className="absolute end-1 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-[var(--md-subtle)] transition-[background-color,color] duration-150 hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)]"
                onClick={() => setSearchInput("")}
              >
                <X className="size-3.5" strokeWidth={1.5} />
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-2.5 flex items-center justify-between gap-2 px-1">
          <p className="truncate text-[12px] font-medium uppercase tracking-[0.07em] text-[var(--md-subtle)]">
            {selectedFolder ? (
              <bdi data-i18n-skip dir="auto" title={selectedFolder.displayName}>{selectedFolder.displayName}</bdi>
            ) : t(folder === "sent"
              ? "Sent items"
              : folder === "drafts"
                ? "Drafts"
                : folder === "archive"
                  ? "Archive"
                  : folder === "spam"
                    ? "Spam"
                    : folder === "trash"
                      ? activeMailbox?.provider === "gmail" ? "Trash" : "Deleted items"
                      : "All inboxes")}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("Refresh this mailbox")}
            title={t("Refresh this mailbox")}
            disabled={Boolean(syncingMailboxId)}
            className="size-9 shrink-0 rounded-full text-[var(--md-subtle)] transition-[background-color,color,scale] duration-150 hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] active:scale-[0.94] disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:scale-100"
            onClick={() => void syncActiveMailbox()}
          >
            <RefreshCw
              className={cn("size-3.5", syncingMailboxId && "animate-spin motion-reduce:animate-none")}
              strokeWidth={1.5}
            />
          </Button>
        </div>

        {activeMailbox && activeMailbox.indexStatus !== "ready" ? (
          <div className="mt-1.5 px-1 pb-0.5" role="status" aria-live="polite">
            <div className="mb-1.5 flex items-center justify-between gap-3 text-[11.5px] text-[var(--md-subtle)]">
              <span>{t(activeMailbox.indexStatus === "error" ? "Indexing paused" : "Indexing the last 12 months")}</span>
              <span data-i18n-skip dir="ltr" className="shrink-0 tabular-nums">
                {activeMailbox.indexPercent}%
              </span>
            </div>
            <Progress
              value={activeMailbox.indexPercent}
              aria-label={t("Inbox indexing progress")}
              aria-valuetext={`${activeMailbox.indexPercent}%`}
              className="h-1 bg-[var(--md-field-bg)] [&>div]:bg-[var(--md-accent)]"
            />
          </div>
        ) : null}
      </div>

      <div
        ref={threadListRef}
        className="mt-2 min-h-0 flex-1 overflow-y-auto md-scrollbar pb-3"
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return
          event.preventDefault()
          moveSelection(event.key === "ArrowDown" ? 1 : -1)
        }}
      >
        {listState === "loading" && threads.length === 0 ? (
          <ThreadListSkeleton />
        ) : listState === "error" && threads.length === 0 ? (
          <WorkspaceMessage
            icon={ShieldAlert}
            tone="error"
            title={t("Unable to load this mailbox")}
            description={listError ?? t("Check your connection and try again.")}
            action={
              <Button
                type="button"
                variant="ghost"
                className="h-10 rounded-[var(--md-radius-md)] bg-[var(--md-surface)] px-3.5 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)]"
                onClick={() => void loadThreads(null, true)}
              >
                {t("Try again")}
              </Button>
            }
          />
        ) : threads.length === 0 ? (
          query ? (
            <WorkspaceMessage
              icon={Search}
              title={t("No matches in this mailbox")}
              description={t("Nothing here matches your search. Clear it to see the whole mailbox again.")}
              action={
                <Button
                  type="button"
                  variant="ghost"
                  className="h-10 rounded-[var(--md-radius-md)] bg-[var(--md-surface)] px-3.5 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)]"
                  onClick={() => setSearchInput("")}
                >
                  {t("Clear search")}
                </Button>
              }
            />
          ) : activeMailbox?.status === "syncing" ? (
            <WorkspaceMessage
              icon={RefreshCw}
              title={t("First sync is running")}
              description={t("Multideck is pulling this mailbox in for the first time. Messages appear here as they arrive.")}
            />
          ) : activeMailbox?.status === "reauthorization_required" ? (
            <WorkspaceMessage
              icon={ShieldAlert}
              tone="warning"
              title={t("This connection expired")}
              description={t("New mail stopped arriving. Sign in again to resume syncing.")}
              action={
                <Button
                  type="button"
                  variant="ghost"
                  className="h-10 rounded-[var(--md-radius-md)] bg-[var(--md-surface)] px-3.5 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)]"
                  onClick={() => provider && void reconnect(provider)}
                >
                  {t("Reconnect")}
                </Button>
              }
            />
          ) : (
            <WorkspaceMessage
              icon={folder === "archive" ? Archive : MailOpen}
              title={emptyFolderTitle}
              description={emptyFolderDescription}
            />
          )
        ) : (
          <div className="flex flex-col gap-0.5 px-2">
            {threads.map((item) => (
              <div key={item.id} data-thread-id={item.id}>
                <InboxThreadRow
                  thread={item}
                  selected={item.id === selectedThreadId}
                  ownAddresses={ownAddresses}
                  selectionLayoutId={threadSelectionLayoutId}
                  onSelect={() => selectThread(item)}
                  onPrefetch={() => prefetchThreadDetail(item.id)}
                  onToggleStar={() => void toggleStar(item)}
                />
              </div>
            ))}

            {listEntry?.hasMore ? (
              <Button
                type="button"
                variant="ghost"
                disabled={listState === "loadingMore"}
                className="mx-1 mt-2 h-10 rounded-[var(--md-radius-md)] text-[12.5px] font-medium text-[var(--md-text)] transition-[background-color,color] duration-150 hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] disabled:opacity-60"
                onClick={() => void loadThreads(listEntry?.nextCursor ?? null)}
              >
                {listState === "loadingMore" ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" strokeWidth={1.6} aria-hidden="true" />
                    {t("Loading older conversations")}
                  </>
                ) : (
                  t("Load older conversations")
                )}
              </Button>
            ) : null}

            {listError && threads.length > 0 ? (
              <p role="alert" className="px-3 py-2 text-[11.5px] leading-[1.45] text-[var(--md-red)]">
                {listError}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )

  const composerElement = (fill: boolean) => (
    <MailComposer
      state={composer}
      onStateChange={setComposer}
      mailbox={activeMailbox}
      status={composerStatus}
      error={composerError}
      offlineDraftRestored={draftRestored}
      restoredAttachmentNames={restoredAttachmentNames}
      replyAudience={composerReplyAudience}
      threadSubject={thread?.subject ?? null}
      fill={fill}
      canSend={canSendComposer}
      onSend={() => void sendComposer()}
      onSaveDraft={() => void saveComposerDraft()}
      onDiscard={() => void discardComposer()}
      onComposeWithDexter={() => void composeWithDexter()}
      dexterAction={composer.mode === "reply" || composer.mode === "reply_all"
        ? "reply"
        : remoteDraftId || composer.bodyText.trim() || composer.subject.trim()
          ? "draft"
          : "compose"}
      dexterStatus={dexterComposerStatus}
      dexterError={dexterComposerError}
      onOpen={() => {
        if (
          composer.mode !== "new"
          && composer.threadId === thread?.id
          && Boolean(composer.sourceMessageId)
        ) {
          setComposer({ ...composer, presentation: "open" })
          return
        }
        openComposer("reply")
      }}
    />
  )

  const messagePane = (
    <div className="flex h-full min-h-0 flex-col bg-[var(--md-bg)]">
      {composingNew ? (
        // A new message is not a reply to anything, so it gets the pane to itself
        // rather than being docked under a thread the operator is not answering.
        <>
          <header className="flex shrink-0 items-center gap-2 px-[var(--md-gap-lg)] pt-3">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("Back to conversations")}
              title={t("Back to conversations")}
              className="size-11 shrink-0 rounded-[var(--md-radius-md)] text-[var(--md-text)] hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] lg:hidden"
              onClick={() => {
                void discardComposer().then((discarded) => {
                  if (discarded) setStage("threads")
                })
              }}
            >
              <ArrowLeft className="size-4 rtl:rotate-180" strokeWidth={1.4} />
            </Button>
            <h1 className="min-w-0 flex-1 text-[17px] font-medium leading-[1.25] tracking-[-0.01em] text-[var(--md-ink)]">
              {t("New message")}
            </h1>
          </header>
          {/* A new message fills the pane the way a native client's compose
              window does, rather than sitting in a dock under empty space. */}
          <div className="min-h-0 flex-1 p-3">{composerElement(true)}</div>
        </>
      ) : !selectedThreadId ? (
        <WorkspaceMessage
          icon={MailOpen}
          title={t("Choose a conversation")}
          description={t("Open a conversation to read its messages, ask Dexter for a summary, and reply.")}
        />
      ) : threadState === "loading" && selectedThreadPreview ? (
        <div className="flex h-full min-h-0 flex-col" aria-busy="true">
          <header className="shrink-0 px-[var(--md-gap-lg)] pt-3">
            <h1
              data-i18n-skip
              dir="auto"
              className="text-balance text-[17px] font-medium leading-[1.25] tracking-[-0.01em] text-[var(--md-ink)]"
            >
              {selectedThreadPreview.subject || t("No subject")}
            </h1>
            <div className="mt-2 flex min-w-0 items-center gap-2 text-[12px] text-[var(--md-subtle)]">
              <span data-i18n-skip dir="auto" className="min-w-0 truncate">
                {threadParticipantLabel(selectedThreadPreview, ownAddresses)}
              </span>
              <span aria-hidden="true">·</span>
              <span data-i18n-skip dir="ltr" className="shrink-0 tabular-nums">
                {formatThreadTimestamp(selectedThreadPreview.lastMessageAt, language)}
              </span>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-hidden px-[var(--md-gap-lg)] py-3">
            <div className="rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] p-3 shadow-[var(--md-shadow-line)]">
              <p data-i18n-skip dir="auto" className="text-[13px] leading-[1.55] text-[var(--md-text)]">
                {selectedThreadPreview.preview}
              </p>
              <div className="mt-4 space-y-2" aria-hidden="true">
                <Skeleton className="h-2.5 w-full rounded-[var(--md-radius-xs)] bg-[var(--md-surface-tint)]" />
                <Skeleton className="h-2.5 w-[88%] rounded-[var(--md-radius-xs)] bg-[var(--md-surface-tint)]" />
                <Skeleton className="h-2.5 w-[64%] rounded-[var(--md-radius-xs)] bg-[var(--md-surface-tint)]" />
              </div>
            </div>
            <p className="mt-2 text-[11.5px] text-[var(--md-subtle)]" aria-live="polite">
              {t("Loading the full conversation...")}
            </p>
          </div>

          <div className="shrink-0 p-3 pt-0" aria-hidden="true">
            <Skeleton className="h-11 w-full rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)]" />
          </div>
        </div>
      ) : threadState === "loading" ? (
        <div className="grid h-full place-items-center">
          <p className="flex items-center gap-2 text-[13px] text-[var(--md-text)]">
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" strokeWidth={1.5} aria-hidden="true" />
            {t("Loading the full conversation...")}
          </p>
        </div>
      ) : threadState === "error" || !thread ? (
        <WorkspaceMessage
          icon={ShieldAlert}
          tone="error"
          title={t("Unable to open this conversation")}
          description={threadError ?? t("Check your connection and try again.")}
          action={
            <Button
              type="button"
              variant="ghost"
              className="h-10 rounded-[var(--md-radius-md)] bg-[var(--md-surface)] px-3.5 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)]"
              onClick={() => {
                const current = selectedThreadId
                setSelectedThreadId(null)
                window.requestAnimationFrame(() => setSelectedThreadId(current))
              }}
            >
              {t("Try again")}
            </Button>
          }
        />
      ) : (
        <>
          <header className="shrink-0 px-[var(--md-gap-lg)] pt-3">
            <div className="flex items-start gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("Back to conversations")}
                title={t("Back to conversations")}
                className="size-11 shrink-0 rounded-[var(--md-radius-md)] text-[var(--md-text)] hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] lg:hidden"
                onClick={() => setStage("threads")}
              >
                <ArrowLeft className="size-4 rtl:rotate-180" strokeWidth={1.4} />
              </Button>
              <h1
                data-i18n-skip
                dir="auto"
                className="min-w-0 flex-1 text-balance pt-1.5 text-[17px] font-medium leading-[1.25] tracking-[-0.01em] text-[var(--md-ink)] lg:pt-0"
              >
                {thread.subject || t("No subject")}
              </h1>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-0.5">
              <Button
                type="button"
                variant="ghost"
                aria-pressed={thread.starred}
                aria-label={thread.starred ? t("Remove star") : t("Star thread")}
                title={thread.starred ? t("Remove star") : t("Star thread")}
                className={cn(
                  "size-11 shrink-0 rounded-[var(--md-radius-md)] transition-[background-color,color,scale] duration-150 hover:bg-[var(--md-hover)] active:scale-[0.94] motion-reduce:transition-none motion-reduce:active:scale-100",
                  thread.starred ? "text-[var(--md-amber)]" : "text-[var(--md-subtle)] hover:text-[var(--md-ink)]",
                )}
                onClick={() => void toggleStar(thread)}
              >
                <Star className={cn("size-4", thread.starred && "fill-current")} strokeWidth={1.4} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                aria-label={thread.unreadCount > 0 ? t("Mark as read") : t("Mark as unread")}
                title={thread.unreadCount > 0 ? t("Mark as read") : t("Mark as unread")}
                className="size-11 shrink-0 rounded-[var(--md-radius-md)] text-[var(--md-subtle)] transition-[background-color,color,scale] duration-150 hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] active:scale-[0.94] motion-reduce:transition-none motion-reduce:active:scale-100"
                onClick={() => void setReadState(thread, thread.unreadCount === 0 ? false : true)}
              >
                {thread.unreadCount > 0 ? <MailOpen className="size-4" strokeWidth={1.4} /> : <Mail className="size-4" strokeWidth={1.4} />}
              </Button>
              <Button
                type="button"
                variant="ghost"
                aria-label={t("Archive")}
                title={t("Archive")}
                className="size-11 shrink-0 rounded-[var(--md-radius-md)] text-[var(--md-subtle)] transition-[background-color,color,scale] duration-150 hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] active:scale-[0.94] motion-reduce:transition-none motion-reduce:active:scale-100"
                onClick={() => void archiveThread(thread)}
              >
                <Archive className="size-4" strokeWidth={1.4} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                aria-label={t("Move to trash")}
                title={t("Move to trash")}
                className="size-11 shrink-0 rounded-[var(--md-radius-md)] text-[var(--md-subtle)] transition-[background-color,color,scale] duration-150 hover:bg-[var(--md-hover)] hover:text-[var(--md-red)] active:scale-[0.94] motion-reduce:transition-none motion-reduce:active:scale-100"
                onClick={() => void moveThreadToTrash(thread)}
              >
                <Trash2 className="size-4" strokeWidth={1.4} />
              </Button>

              <span aria-hidden="true" className="mx-1.5 h-6 w-px bg-[var(--md-line-strong)]" />

              <DexterActionPill
                label={t("Summarise")}
                aria-label={t("Summarise this thread")}
                aria-controls={`thread-summary-${thread.id}`}
                aria-expanded={summaryVisibleThreadId === thread.id}
                disabled={summaryVisibleThreadId === thread.id && thread.summary.status === "pending"}
                className="md-inbox-summarise h-9 min-w-[108px] rounded-full px-3 text-[12.5px]"
                onClick={() => summariseThread(thread)}
              />

              <span aria-hidden="true" className="mx-1.5 h-6 w-px bg-[var(--md-line-strong)]" />

              {(["reply", "reply_all", "forward"] as SendMode[]).map((mode) => (
                <Button
                  key={mode}
                  type="button"
                  variant="ghost"
                  disabled={!canSendFromMailbox}
                  className="h-11 gap-1.5 rounded-[var(--md-radius-md)] px-2 text-[12.5px] font-medium text-[var(--md-text)] transition-[background-color,color,scale] duration-150 hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100 motion-reduce:transition-none motion-reduce:active:scale-100"
                  onClick={() => openComposer(mode)}
                >
                  {mode === "forward" ? (
                    <CornerUpRight className="size-3.5 rtl:-scale-x-100" strokeWidth={1.5} aria-hidden="true" />
                  ) : (
                    <CornerUpLeft className="size-3.5 rtl:-scale-x-100" strokeWidth={1.5} aria-hidden="true" />
                  )}
                  <span className="hidden sm:inline">{t(composerModeLabels[mode])}</span>
                </Button>
              ))}

              {thread.readOnly || !activeMailbox?.outboundEnabled ? (
                <span className="ms-1 rounded-[var(--md-radius-sm)] bg-[var(--md-surface-tint)] px-2 py-1 text-[11px] font-medium text-[var(--md-subtle)]">
                  {t("Read-only mailbox")}
                </span>
              ) : null}
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto md-scrollbar px-[var(--md-gap-lg)] py-3">
            {summaryVisibleThreadId === thread.id ? (
              <div ref={summaryRef} id={`thread-summary-${thread.id}`} className="scroll-mt-3">
                <ThreadSummary
                  summary={thread.summary}
                  sources={summarySources}
                  onRegenerate={() => void requestSummary(thread.id)}
                  onOpenSource={focusMessage}
                />
              </div>
            ) : null}

            <div className={cn("flex flex-col gap-2", summaryVisibleThreadId === thread.id ? "mt-3" : "mt-0")}>
              {thread.hasOlderMessages ? (
                <div className="flex flex-col items-center gap-1.5 py-1">
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-8 rounded-full px-3 text-[12px] font-medium text-[var(--md-text)] hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)]"
                    disabled={olderMessagesLoading}
                    onClick={() => void loadOlderMessages()}
                  >
                    {olderMessagesLoading ? t("Loading older messages…") : t("Load older messages")}
                  </Button>
                  {olderMessagesError ? (
                    <p role="alert" className="text-[11.5px] text-[var(--md-red)]">{olderMessagesError}</p>
                  ) : null}
                </div>
              ) : null}
              {thread.messages.map((message) => (
                <MessageCard
                  key={message.id}
                  message={message}
                  expanded={expandedMessageIds.has(message.id)}
                  highlighted={highlightedMessageId === message.id}
                  registerRef={(element) => {
                    if (element) messageRefs.current.set(message.id, element)
                    else messageRefs.current.delete(message.id)
                  }}
                  onToggle={() =>
                    setExpandedMessageIds((current) => {
                      const next = new Set(current)
                      if (next.has(message.id)) next.delete(message.id)
                      else next.add(message.id)
                      return next
                    })
                  }
                />
              ))}
            </div>
          </div>

          <div className="shrink-0">{composerElement(false)}</div>
        </>
      )}
    </div>
  )

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 px-[var(--md-page-pad)] py-2.5 ps-14 lg:ps-[var(--md-page-pad)]">
        <Mail className="size-4 shrink-0 text-[var(--md-accent)]" strokeWidth={1.4} aria-hidden="true" />
        <h2 className="shrink-0 text-[14px] font-medium text-[var(--md-ink)]">{t("Inbox")}</h2>
        {activeMailbox ? (
          <>
            <span aria-hidden="true" className="text-[var(--md-subtle)]">·</span>
            <bdi
              data-i18n-skip
              dir="ltr"
              title={activeMailbox.address}
              className="min-w-0 truncate text-[12.5px] text-[var(--md-text)]"
            >
              {activeMailbox.address}
            </bdi>
            {mailboxKindLabel(activeMailbox) ? (
              <span className="shrink-0 rounded-[var(--md-radius-sm)] bg-[var(--md-surface-tint)] px-1.5 py-px text-[10px] font-medium uppercase tracking-[0.05em] text-[var(--md-subtle)]">
                {t(mailboxKindLabel(activeMailbox))}
              </span>
            ) : null}
          </>
        ) : null}
        {unreadTotal > 0 ? (
          <span className="ms-auto shrink-0 rounded-full bg-[var(--md-accent-a10)] px-2 py-0.5 text-[11.5px] font-medium text-[var(--md-accent)]">
            <span data-i18n-skip dir="ltr" className="tabular-nums">{unreadTotal}</span> {t("unread")}
          </span>
        ) : null}
        {activeAutomaticReply && activeAutomaticReply.status !== "disabled" ? (
          <button
            type="button"
            className="hidden h-8 shrink-0 items-center gap-1.5 rounded-full bg-[rgba(47,133,90,0.09)] px-2.5 text-[11.5px] font-medium text-[var(--md-green)] shadow-[inset_0_0_0_1px_rgba(47,133,90,0.14)] transition-[background-color,scale] duration-150 hover:bg-[rgba(47,133,90,0.14)] active:scale-[0.97] sm:inline-flex"
            onClick={() => setAutomaticReplyOpen(true)}
          >
            <CalendarClock className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
            {t("Out of office on")}
          </button>
        ) : null}
        <PageSettingsMenu
          title={t("Inbox settings")}
          actions={[{
            id: "automatic-reply",
            label: activeAutomaticReply && activeAutomaticReply.status !== "disabled" ? t("Edit out of office") : t("Set out of office"),
            icon: CalendarClock,
            onSelect: () => setAutomaticReplyOpen(true),
          }]}
          className="shrink-0"
        />
        <Button
          type="button"
          variant="ghost"
          disabled={!activeMailbox?.outboundEnabled}
          className={cn(
            "h-10 shrink-0 gap-1.5 rounded-[var(--md-radius-md)] bg-[var(--md-accent)] px-3 text-[12.5px] font-medium text-[var(--md-accent-ink)] shadow-[var(--md-shadow-line)] transition-[background-color,box-shadow,scale] duration-150 hover:bg-[var(--md-accent-deep)] active:scale-[0.96] disabled:opacity-50 disabled:active:scale-100 motion-reduce:transition-none motion-reduce:active:scale-100",
            unreadTotal > 0 ? "" : "ms-auto",
          )}
          onClick={() => {
            setStage("message")
            openComposer("new")
          }}
        >
          <Plus className="size-3.5" strokeWidth={1.6} aria-hidden="true" />
          {t("Compose")}
        </Button>
      </div>

      <AutomaticReplyDialog
        open={automaticReplyOpen}
        onOpenChange={setAutomaticReplyOpen}
        mailbox={activeMailbox}
        settings={activeAutomaticReply}
        onSettingsChange={rememberAutomaticReply}
        onReconnect={(candidate) => void reconnect(candidate)}
      />

      {/* Desktop keeps the conversation list and message side by side while the
          main sidebar owns accounts and folders. Mobile and tablet become one
          track that slides between the thread and message stages, with
          every pane staying mounted so scroll position, search text and the open
          thread all survive going back and coming forward again. */}
      {isDesktop ? (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(300px,360px)_minmax(0,1fr)] overflow-hidden 2xl:grid-cols-[minmax(340px,400px)_minmax(0,1fr)]">
          <div className="h-full min-h-0 border-e border-[var(--md-line)]">{threadPane}</div>
          <div className="h-full min-h-0">{messagePane}</div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-hidden">
          <motion.div
            className="flex h-full min-h-0 w-full"
            initial={false}
            animate={{ x: `${stageOffset}%` }}
            transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.panel)}
          >
            {/* `inert` keeps the offscreen stages mounted but out of the tab order
                and the accessibility tree, so Tab never lands on a pane the
                operator cannot see. */}
            <div inert={stage !== "threads"} className="h-full min-h-0 w-full shrink-0">{threadPane}</div>
            <div inert={stage !== "message"} className="h-full min-h-0 w-full shrink-0">{messagePane}</div>
          </motion.div>
        </div>
      )}
    </div>
  )
}
