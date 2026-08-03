import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react"
import {
  ChevronDown,
  CornerUpLeft,
  CornerUpRight,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  Loader2,
  Maximize2,
  Minimize2,
  Paperclip,
  PenLine,
  Plus,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { useLanguage } from "@/i18n/language-provider"
import { mdMotion, reduceMotion } from "@/lib/motion"
import {
  attachmentLimits,
  attachmentRejection,
  attachmentTotalBytes,
  composerModeLabels,
  composerNeedsRecipient,
  dedupeAddresses,
  formatAddress,
  isLikelyEmailAddress,
  parseAddressInput,
  readFileAsAttachment,
  type ComposerState,
  type ComposerStatus,
  type MailAddress,
  type Mailbox,
  type OutboundAttachment,
  type SendMode,
} from "@/lib/inbox-api"
import { cn } from "@/lib/utils"

// What the composer may send is a contract rule, not a UI detail, so it lives in
// `inbox-contract.ts` and is re-exported here for the surfaces that render it.
export {
  attachmentLimits,
  composerEdits,
  composerModeLabels,
  composerNeedsRecipient,
  emptyComposerState,
  parseAddressInput,
  type ComposerState,
  type ComposerStatus,
} from "@/lib/inbox-api"

/**
 * The composer for a new message, a reply, a reply all or a forward.
 *
 * It is built to feel like the mail client the operator already knows:
 * recipients become chips, Cc and Bcc stay folded away until asked for, files
 * attach by button, drop or paste, and ⌘↵ sends. Underneath, the browser still
 * reports only what the operator typed or changed by hand. It never computes the
 * final recipient list: the server reads the source message and resolves who
 * receives a Reply all, so a thread that moved on in another tab cannot cause
 * somebody to be quietly dropped. Anyone the server will add is shown as a
 * locked chip rather than an editable address the composer cannot guarantee.
 */

export function formatBytes(bytes: number | null, language: string) {
  if (bytes === null) return ""
  const units = ["B", "KB", "MB", "GB"]
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${new Intl.NumberFormat(language, { maximumFractionDigits: value < 10 && unit > 0 ? 1 : 0 }).format(value)} ${units[unit]}`
}

function attachmentIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return FileImage
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType === "text/csv") return FileSpreadsheet
  if (mimeType.includes("zip") || mimeType.includes("compressed") || mimeType.includes("gzip")) return FileArchive
  return FileText
}

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
        className="grid size-5 shrink-0 place-items-center rounded-full text-[var(--md-subtle)] outline-none transition-[background-color,color,scale] duration-150 hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a20)] active:scale-[0.9] disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:scale-100"
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
function RecipientField({
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
  trailing?: React.ReactNode
}) {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const [draft, setDraft] = useState("")
  const [invalid, setInvalid] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  function commit(value: string, keepLeftover: boolean) {
    const { valid, leftover } = splitRecipientInput(value)
    if (valid.length > 0) onChange(dedupeAddresses([...addresses, ...valid]))
    setDraft(keepLeftover ? leftover.join(", ") : "")
    setInvalid(keepLeftover && leftover.length > 0)
  }

  return (
    <div className="flex min-h-11 items-start gap-2 px-3 py-1.5">
      <label
        htmlFor={inputId}
        className="mt-[7px] w-[54px] shrink-0 cursor-text text-[12px] font-medium text-[var(--md-subtle)]"
      >
        {label}
      </label>

      <div
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
            <Sparkles className="size-3 shrink-0 text-[var(--md-accent)]" strokeWidth={1.6} aria-hidden="true" />
            <span className="min-w-0 truncate">{lockedLabel}</span>
          </span>
        ) : null}

        <AnimatePresence initial={false}>
          {addresses.map((address) => (
            <motion.span
              key={address.address.toLowerCase()}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={reduceMotion(Boolean(shouldReduceMotion), { type: "spring", duration: 0.3, bounce: 0 })}
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
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `${inputId}-hint` : undefined}
          placeholder={addresses.length === 0 && !lockedLabel ? placeholder : undefined}
          value={draft}
          className={cn(
            "h-7 min-w-[140px] flex-1 bg-transparent text-[16px] text-[var(--md-ink)] outline-none placeholder:text-[var(--md-subtle)] disabled:opacity-55 sm:text-[13px]",
            invalid && "text-[var(--md-red)]",
          )}
          onChange={(event) => {
            const value = event.target.value
            setInvalid(false)
            // A separator finishes the address the way it does in a native client.
            if (/[,;]/.test(value)) commit(value, true)
            else setDraft(value)
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === "Tab") {
              if (!draft.trim()) return
              event.preventDefault()
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
            if (draft.trim()) commit(draft, true)
          }}
        />
      </div>

      {/* Outside the wrapping chip area, so a long recipient list never pushes
          the Cc and Bcc toggles onto a line of their own. */}
      {trailing ? <span className="mt-0.5 flex shrink-0 items-center gap-0.5">{trailing}</span> : null}

      {invalid ? (
        <p id={`${inputId}-hint`} role="alert" className="sr-only">
          {t("Enter a complete email address.")}
        </p>
      ) : null}
    </div>
  )
}

function AttachmentCard({
  attachment,
  onRemove,
  disabled,
}: {
  attachment: OutboundAttachment
  onRemove: () => void
  disabled: boolean
}) {
  const { language, t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const Icon = attachmentIcon(attachment.mimeType)

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={reduceMotion(Boolean(shouldReduceMotion), { type: "spring", duration: 0.3, bounce: 0 })}
      className="grid min-h-[44px] w-full max-w-[240px] grid-cols-[28px_minmax(0,1fr)_28px] items-center gap-2 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] p-1.5 shadow-[var(--md-shadow-line)]"
    >
      <span className="grid size-7 place-items-center rounded-[var(--md-radius-sm)] bg-[var(--md-surface)] text-[var(--md-subtle)] shadow-[var(--md-shadow-line)]">
        <Icon className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <bdi data-i18n-skip dir="auto" title={attachment.fileName} className="block truncate text-[12.5px] font-medium text-[var(--md-ink)]">
          {attachment.fileName}
        </bdi>
        <span data-i18n-skip dir="ltr" className="mt-px block truncate text-[11px] tabular-nums text-[var(--md-subtle)]">
          {formatBytes(attachment.sizeBytes, language)}
        </span>
      </span>
      <button
        type="button"
        disabled={disabled}
        aria-label={`${t("Remove")} ${attachment.fileName}`}
        title={t("Remove attachment")}
        className="grid size-7 place-items-center rounded-full text-[var(--md-subtle)] outline-none transition-[background-color,color,scale] duration-150 hover:bg-[var(--md-hover)] hover:text-[var(--md-red)] focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a20)] active:scale-[0.9] disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:scale-100"
        onClick={onRemove}
      >
        <X className="size-3.5" strokeWidth={1.6} aria-hidden="true" />
      </button>
    </motion.div>
  )
}

function ModeIcon({ mode }: { mode: SendMode }) {
  if (mode === "new") return <PenLine className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
  if (mode === "forward") return <CornerUpRight className="size-3.5 rtl:-scale-x-100" strokeWidth={1.5} aria-hidden="true" />
  return <CornerUpLeft className="size-3.5 rtl:-scale-x-100" strokeWidth={1.5} aria-hidden="true" />
}

export type ReplyAudience = {
  /** Who the server will resolve, said in one short phrase. */
  label: string
  /** The longer explanation, shown on hover and to assistive technology. */
  detail: string
}

export function MailComposer({
  state,
  onStateChange,
  mailbox,
  status,
  error,
  offlineDraftRestored = false,
  restoredAttachmentNames = [],
  replyAudience = null,
  threadSubject = null,
  fill = false,
  canSend,
  onSend,
  onSaveDraft,
  onDiscard,
  onOpen,
  className,
}: {
  state: ComposerState
  /**
   * Takes an updater as well as a value. Reading a large file is slow enough
   * that the operator keeps typing through it, so the attachment tray merges
   * into whatever the state is when it lands rather than the state it started from.
   */
  onStateChange: React.Dispatch<React.SetStateAction<ComposerState>>
  /** The mailbox the message is sent from. A read-only mailbox disables sending. */
  mailbox: Mailbox | null
  status: ComposerStatus
  error: string | null
  offlineDraftRestored?: boolean
  /** Files a recovered draft used to carry but could not bring back. */
  restoredAttachmentNames?: string[]
  /** Who a reply reaches, resolved by the server and shown as a locked chip. */
  replyAudience?: ReplyAudience | null
  /** The thread's subject, shown read-only while replying. */
  threadSubject?: string | null
  /** Fills its container instead of animating between docked heights. */
  fill?: boolean
  canSend: boolean
  onSend: () => void
  onSaveDraft: () => void
  onDiscard: () => void
  /** Initialises the selected source message before a docked reply opens. */
  onOpen?: () => void
  className?: string
}) {
  const { language, t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const fieldId = useId()
  const bodyRef = useRef<HTMLTextAreaElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const dragDepth = useRef(0)
  const [autofocusedFor, setAutofocusedFor] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [attaching, setAttaching] = useState(0)
  const [attachError, setAttachError] = useState<string | null>(null)

  const busy = status === "sending" || status === "saving" || status === "discarding"
  const readOnly = mailbox ? !mailbox.outboundEnabled : true
  const expanded = state.presentation === "expanded"
  const open = state.presentation !== "docked"
  const needsRecipient = composerNeedsRecipient(state.mode)
  const attachedBytes = attachmentTotalBytes(state.attachments)

  const update = useCallback(
    (patch: Partial<ComposerState>) => onStateChange((current) => ({ ...current, ...patch })),
    [onStateChange],
  )

  // Focus the first field that still needs an answer, once per opened composer,
  // never on every rerender, so typing is not interrupted by a parent update.
  useEffect(() => {
    if (!open || readOnly) return
    const key = `${state.mode}:${state.threadId ?? "new"}:${state.sourceMessageId ?? ""}`
    if (autofocusedFor === key) return
    setAutofocusedFor(key)
    if (needsRecipient && state.to.length === 0) document.getElementById(`${fieldId}-to`)?.focus()
    else bodyRef.current?.focus()
  }, [autofocusedFor, fieldId, needsRecipient, open, readOnly, state.mode, state.sourceMessageId, state.threadId, state.to.length])

  const attachFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0 || readOnly) return
      setAttachError(null)
      setAttaching((count) => count + files.length)

      let accepted = [...state.attachments]
      const added: OutboundAttachment[] = []
      const rejected: string[] = []
      let reason: ReturnType<typeof attachmentRejection> = null

      try {
        for (const file of files) {
          const rejection = attachmentRejection(file, accepted)
          if (rejection) {
            reason = rejection
            if (rejection !== "duplicate") rejected.push(file.name)
            continue
          }
          const attachment = await readFileAsAttachment(file)
          accepted = [...accepted, attachment]
          added.push(attachment)
        }
      } catch {
        setAttachError(t("That file could not be read. Try attaching it again."))
      } finally {
        setAttaching((count) => Math.max(0, count - files.length))
      }

      if (added.length > 0) {
        // Appended to whatever the tray holds when the read finishes, not to the
        // copy it started from, so a second drop mid-encode keeps both sets and
        // the limits are re-checked against what is actually there.
        onStateChange((current) => ({
          ...current,
          attachments: added.reduce(
            (kept, attachment) => attachmentRejection({ name: attachment.fileName, size: attachment.sizeBytes }, kept)
              ? kept
              : [...kept, attachment],
            current.attachments,
          ),
        }))
      }

      if (reason === "count") {
        setAttachError(t("A message can carry ten files. Send the rest separately."))
      } else if (reason === "file_too_large" || reason === "total_too_large") {
        setAttachError(
          `${rejected.join(", ")} — ${t("too large to attach. The limit is")} ${formatBytes(attachmentLimits.maxFileBytes, language)} ${t("per file and")} ${formatBytes(attachmentLimits.maxTotalBytes, language)} ${t("in total.")}`,
        )
      }
    },
    [language, onStateChange, readOnly, state.attachments, t],
  )

  const statusLine = useMemo(() => {
    if (status === "failed" && error) return { text: error, tone: "error" as const }
    if (status === "queued") return { text: t("Queued to send. It will leave as soon as the provider accepts it."), tone: "muted" as const }
    if (readOnly) return { text: t("This mailbox receives mail only."), tone: "muted" as const }
    if (attachError) return { text: attachError, tone: "error" as const }
    if (state.attachments.length > 0) {
      return {
        text: `${state.attachments.length} ${t(state.attachments.length === 1 ? "file" : "files")} · ${formatBytes(attachedBytes, language)}`,
        tone: "muted" as const,
      }
    }
    return null
  }, [attachError, attachedBytes, error, language, readOnly, state.attachments.length, status, t])

  if (!open) {
    return (
      <div className={cn("px-3 pb-3", className)}>
        <Button
          type="button"
          variant="ghost"
          disabled={readOnly}
          className="h-11 w-full justify-start gap-2 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-3 text-[13px] font-normal text-[var(--md-subtle)] shadow-[var(--md-shadow-line)] transition-[background-color,box-shadow,scale] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] active:scale-[0.995] disabled:opacity-55 motion-reduce:transition-none motion-reduce:active:scale-100"
          onClick={() => {
            if (onOpen) {
              onOpen()
              return
            }
            update({ presentation: "open" })
          }}
        >
          <PenLine className="size-4 shrink-0" strokeWidth={1.4} aria-hidden="true" />
          <span className="truncate">
            {readOnly ? t("This mailbox is read-only") : t("Write a reply")}
          </span>
        </Button>
      </div>
    )
  }

  const composerPanel = (
    <motion.section
      aria-label={t(composerModeLabels[state.mode])}
      // Height is animated between two explicit values rather than an auto
      // measurement, so reopening mid-close retargets without a jump. A filled
      // composer owns its whole pane instead and needs no animation at all.
      animate={fill || expanded ? undefined : { height: "min(52vh, 420px)" }}
      initial={false}
      transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.panel)}
      className={cn(
        "relative flex min-h-0 flex-col overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-soft)]",
        fill || expanded ? "h-full w-full" : "mx-3 mb-3",
        expanded && "rounded-none shadow-none",
        className,
      )}
      onDragEnter={(event) => {
        if (readOnly || !event.dataTransfer.types.includes("Files")) return
        dragDepth.current += 1
        setDragging(true)
      }}
      onDragOver={(event) => {
        if (readOnly || !event.dataTransfer.types.includes("Files")) return
        event.preventDefault()
        event.dataTransfer.dropEffect = "copy"
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1)
        if (dragDepth.current === 0) setDragging(false)
      }}
      onDrop={(event) => {
        if (readOnly) return
        event.preventDefault()
        dragDepth.current = 0
        setDragging(false)
        void attachFiles([...event.dataTransfer.files])
      }}
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          event.preventDefault()
          if (canSend && !busy && !readOnly) onSend()
          return
        }
        if (event.key === "Escape") {
          event.preventDefault()
          update({ presentation: "docked" })
        }
      }}
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-[var(--md-line)] px-3 py-2.5">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[var(--md-accent-a10)] text-[var(--md-accent)]">
          <ModeIcon mode={state.mode} />
        </span>
        <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--md-ink)]">
          {t(composerModeLabels[state.mode])}
          {mailbox ? (
            <>
              <span className="text-[var(--md-subtle)]"> · </span>
              <bdi data-i18n-skip dir="ltr" className="text-[12px] font-normal text-[var(--md-subtle)]">
                {mailbox.address}
              </bdi>
            </>
          ) : null}
        </p>
        {fill ? null : (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t(expanded ? "Shrink composer" : "Expand composer")}
            title={t(expanded ? "Shrink composer" : "Expand composer")}
            className="size-8 shrink-0 rounded-full text-[var(--md-subtle)] transition-[background-color,color,scale] duration-150 hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] active:scale-[0.94] motion-reduce:transition-none motion-reduce:active:scale-100"
            onClick={() => update({ presentation: expanded ? "open" : "expanded" })}
          >
            {expanded ? <Minimize2 className="size-3.5" strokeWidth={1.5} /> : <Maximize2 className="size-3.5" strokeWidth={1.5} />}
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("Close composer")}
          title={t("Close composer")}
          className="size-8 shrink-0 rounded-full text-[var(--md-subtle)] transition-[background-color,color,scale] duration-150 hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] active:scale-[0.94] motion-reduce:transition-none motion-reduce:active:scale-100"
          onClick={() => update({ presentation: "docked" })}
        >
          <ChevronDown className="size-4" strokeWidth={1.5} />
        </Button>
      </header>

      <div className="shrink-0 divide-y divide-[var(--md-line)] border-b border-[var(--md-line)]">
        <RecipientField
          inputId={`${fieldId}-to`}
          label={t("To")}
          addresses={state.to}
          onChange={(next) => update({ to: next })}
          placeholder="name@example.com"
          disabled={readOnly || busy}
          lockedLabel={needsRecipient ? null : replyAudience?.label ?? null}
          lockedTitle={replyAudience?.detail}
          trailing={
            state.showCc && state.showBcc ? null : (
              <>
                {state.showCc ? null : (
                  <button
                    type="button"
                    className="h-7 rounded-full px-2 text-[11.5px] font-medium text-[var(--md-subtle)] outline-none transition-[background-color,color] duration-150 hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a20)]"
                    onClick={() => update({ showCc: true })}
                  >
                    {t("Cc")}
                  </button>
                )}
                {state.showBcc ? null : (
                  <button
                    type="button"
                    className="h-7 rounded-full px-2 text-[11.5px] font-medium text-[var(--md-subtle)] outline-none transition-[background-color,color] duration-150 hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a20)]"
                    onClick={() => update({ showBcc: true })}
                  >
                    {t("Bcc")}
                  </button>
                )}
              </>
            )
          }
        />

        {state.showCc ? (
          <RecipientField
            inputId={`${fieldId}-cc`}
            label={t("Cc")}
            addresses={state.cc}
            onChange={(next) => update({ cc: next })}
            disabled={readOnly || busy}
            autoFocus
          />
        ) : null}

        {state.showBcc ? (
          <RecipientField
            inputId={`${fieldId}-bcc`}
            label={t("Bcc")}
            addresses={state.bcc}
            onChange={(next) => update({ bcc: next })}
            disabled={readOnly || busy}
            autoFocus
          />
        ) : null}

        <div className="flex min-h-11 items-center gap-2 px-3 py-1.5">
          <label
            htmlFor={`${fieldId}-subject`}
            className="w-[54px] shrink-0 cursor-text text-[12px] font-medium text-[var(--md-subtle)]"
          >
            {t("Subject")}
          </label>
          {needsRecipient ? (
            <input
              id={`${fieldId}-subject`}
              type="text"
              dir="auto"
              data-i18n-skip
              disabled={readOnly || busy}
              placeholder={t("Subject")}
              value={state.subject}
              onChange={(event) => update({ subject: event.target.value })}
              className="h-8 min-w-0 flex-1 bg-transparent text-[16px] text-[var(--md-ink)] outline-none placeholder:text-[var(--md-subtle)] disabled:opacity-55 sm:text-[13.5px]"
            />
          ) : (
            // A reply keeps the thread's subject, and the server writes the Re:
            // prefix, so it is reported here rather than offered as an edit.
            <bdi
              data-i18n-skip
              dir="auto"
              id={`${fieldId}-subject`}
              title={threadSubject ?? undefined}
              className="min-w-0 flex-1 truncate text-[13.5px] text-[var(--md-text)]"
            >
              {threadSubject?.trim() || t("No subject")}
            </bdi>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto md-scrollbar px-3 py-2">
        {offlineDraftRestored ? (
          <p className="mb-2 rounded-[var(--md-radius-md)] bg-[rgba(74,125,156,0.1)] px-2.5 py-1.5 text-[11.5px] leading-[1.45] text-[var(--md-blue)]">
            {restoredAttachmentNames.length > 0
              ? `${t("Restored from an unsaved draft on this device. Attach these again:")} ${restoredAttachmentNames.join(", ")}`
              : t("Restored from an unsaved draft on this device.")}
          </p>
        ) : null}

        <label htmlFor={`${fieldId}-body`} className="sr-only">
          {t("Message")}
        </label>
        <textarea
          id={`${fieldId}-body`}
          ref={bodyRef}
          dir="auto"
          data-i18n-skip
          value={state.bodyText}
          disabled={readOnly}
          placeholder={t("Write your message")}
          onChange={(event) => update({ bodyText: event.target.value })}
          onPaste={(event) => {
            const files = [...event.clipboardData.files]
            if (files.length === 0) return
            event.preventDefault()
            void attachFiles(files)
          }}
          className="h-full min-h-[120px] w-full resize-none bg-transparent text-[16px] leading-[1.6] text-[var(--md-ink)] outline-none placeholder:text-[var(--md-subtle)] disabled:opacity-55 sm:text-[13.5px]"
        />
      </div>

      {state.attachments.length > 0 || attaching > 0 ? (
        <div className="max-h-[132px] shrink-0 overflow-y-auto md-scrollbar border-t border-[var(--md-line)] px-3 py-2">
          <div className="flex flex-wrap gap-2">
            <AnimatePresence initial={false}>
              {state.attachments.map((attachment) => (
                <AttachmentCard
                  key={attachment.id}
                  attachment={attachment}
                  disabled={busy}
                  onRemove={() => update({ attachments: state.attachments.filter((item) => item.id !== attachment.id) })}
                />
              ))}
            </AnimatePresence>
            {attaching > 0 ? (
              <span className="inline-flex min-h-[44px] items-center gap-2 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-3 text-[12px] text-[var(--md-subtle)] shadow-[var(--md-shadow-line)]">
                <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" strokeWidth={1.6} aria-hidden="true" />
                {t("Attaching")}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      <footer className="flex shrink-0 items-center gap-1.5 border-t border-[var(--md-line)] px-3 py-2.5">
        <Button
          type="button"
          disabled={!canSend || busy || readOnly}
          title={`${t("Send")} · ⌘↵`}
          className="h-10 min-w-[96px] gap-1.5 rounded-[var(--md-radius-md)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-[var(--md-accent-ink)] shadow-[var(--md-shadow-line)] transition-[background-color,box-shadow,scale] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[var(--md-accent-deep)] active:scale-[0.96] disabled:opacity-50 disabled:active:scale-100 motion-reduce:transition-none motion-reduce:active:scale-100"
          onClick={onSend}
        >
          {status === "sending" ? (
            <>
              <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" strokeWidth={1.6} aria-hidden="true" />
              {t("Sending")}
            </>
          ) : (
            <>
              <Send className="size-3.5 rtl:-scale-x-100" strokeWidth={1.6} aria-hidden="true" />
              {t("Send")}
            </>
          )}
        </Button>

        <label className="ms-1 flex min-h-10 cursor-pointer items-center gap-2 rounded-[var(--md-radius-md)] px-2 text-[11.5px] text-[var(--md-text)] hover:bg-[var(--md-surface-tint)]">
          <input
            type="checkbox"
            checked={state.trackOpens}
            disabled={busy || readOnly}
            onChange={(event) => update({ trackOpens: event.target.checked })}
            className="size-4 accent-[var(--md-accent)]"
          />
          <span>{t("Track opens")}</span>
          <span className="hidden text-[var(--md-subtle)] lg:inline">{t("Estimated — images may be blocked or proxied")}</span>
        </label>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => {
            void attachFiles([...(event.target.files ?? [])])
            // Reset, so picking the same file twice in a row still fires.
            event.target.value = ""
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={busy || readOnly}
          aria-label={t("Attach files")}
          title={t("Attach files")}
          className="size-10 shrink-0 rounded-[var(--md-radius-md)] text-[var(--md-subtle)] transition-[background-color,color,scale] duration-150 hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] active:scale-[0.94] disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:scale-100"
          onClick={() => fileInputRef.current?.click()}
        >
          <Paperclip className="size-4" strokeWidth={1.5} />
        </Button>

        <Button
          type="button"
          variant="ghost"
          disabled={busy || readOnly}
          className="h-10 rounded-[var(--md-radius-md)] px-2.5 text-[12.5px] font-medium text-[var(--md-text)] transition-[background-color,color,scale] duration-150 hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] active:scale-[0.97] disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:scale-100"
          onClick={onSaveDraft}
        >
          {status === "saving" ? t("Saving") : t("Save draft")}
        </Button>

        {statusLine ? (
          <p
            role={statusLine.tone === "error" ? "alert" : "status"}
            className={cn(
              "mx-1 min-w-0 flex-1 truncate text-[11.5px] leading-[1.45]",
              statusLine.tone === "error" ? "text-[var(--md-red)]" : "text-[var(--md-subtle)]",
            )}
            title={statusLine.text}
          >
            {statusLine.text}
          </p>
        ) : (
          <span className="min-w-0 flex-1" />
        )}

        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={busy}
          aria-label={t(status === "discarding" ? "Discarding" : "Discard")}
          title={t("Discard")}
          className="size-10 shrink-0 rounded-[var(--md-radius-md)] text-[var(--md-subtle)] transition-[background-color,color,scale] duration-150 hover:bg-[var(--md-hover)] hover:text-[var(--md-red)] active:scale-[0.94] disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:scale-100"
          onClick={onDiscard}
        >
          {status === "discarding" ? (
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" strokeWidth={1.5} aria-hidden="true" />
          ) : (
            <Trash2 className="size-4" strokeWidth={1.5} aria-hidden="true" />
          )}
        </Button>
      </footer>

      <AnimatePresence initial={false}>
        {dragging ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.fast)}
            className="pointer-events-none absolute inset-1 grid place-items-center rounded-[var(--md-radius-lg)] bg-[color-mix(in_srgb,var(--md-surface)_92%,transparent)] outline-2 outline-dashed -outline-offset-2 outline-[var(--md-accent-a20)] backdrop-blur-[2px]"
          >
            <p className="flex items-center gap-2 text-[13px] font-medium text-[var(--md-ink)]">
              <Plus className="size-4 text-[var(--md-accent)]" strokeWidth={1.6} aria-hidden="true" />
              {t("Drop files to attach them")}
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.section>
  )

  if (!expanded || fill) return composerPanel

  return (
    <Dialog
      open
      onOpenChange={(nextOpen) => {
        if (!nextOpen) update({ presentation: "open" })
      }}
    >
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        className="flex h-[min(86dvh,760px)] w-[min(1100px,calc(100vw-2rem))] max-w-none gap-0 overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-0 shadow-[var(--md-shadow-soft)] sm:max-w-none"
      >
        <DialogTitle className="sr-only">{t(composerModeLabels[state.mode])}</DialogTitle>
        {composerPanel}
      </DialogContent>
    </Dialog>
  )
}
