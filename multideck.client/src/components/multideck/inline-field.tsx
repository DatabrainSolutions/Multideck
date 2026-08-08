import { createContext, useContext, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { AlertCircle, Check, Pencil } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useLanguage } from "@/i18n/language-provider"
import { cn } from "@/lib/utils"

export type InlineFieldKind = "text" | "textarea" | "number" | "email" | "tel" | "url" | "date"

/**
 * The glyph swap that marks a save. `better-ui` prescribes these exact values, and
 * the spring never bounces: a confirmation that overshoots reads as celebration
 * for something that should feel routine.
 */
const glyphMotion = {
  initial: { opacity: 0, scale: 0.25, filter: "blur(4px)" },
  animate: { opacity: 1, scale: 1, filter: "blur(0px)" },
  exit: { opacity: 0, scale: 0.25, filter: "blur(4px)" },
  transition: { type: "spring" as const, duration: 0.3, bounce: 0 },
}

type SaveState = "idle" | "saving" | "saved" | "error"

function useSaveState() {
  const [state, setState] = useState<SaveState>("idle")
  const [message, setMessage] = useState<string | null>(null)
  const timer = useRef<number | null>(null)

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current) }, [])

  function markSaved() {
    setState("saved")
    setMessage(null)
    if (timer.current) window.clearTimeout(timer.current)
    // Long enough to be seen, short enough that a row of fields does not stay
    // covered in ticks while an operator works down the page.
    timer.current = window.setTimeout(() => setState("idle"), 1600)
  }

  return { state, message, setState, setMessage, markSaved }
}

/**
 * The status mark at the end of a field. It occupies a fixed box whether or not
 * anything is in it, so a field never changes width as it saves.
 */
function FieldStatus({ state, editing, showEditHint = true }: { state: SaveState; editing: boolean; showEditHint?: boolean }) {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()

  return (
    <span className="grid size-4 shrink-0 place-items-center" aria-hidden={state === "idle" ? true : undefined}>
      <AnimatePresence initial={false} mode="wait">
        {state === "saving" ? (
          <motion.span key="saving" {...(shouldReduceMotion ? {} : glyphMotion)} className="size-1.5 rounded-full bg-[var(--md-accent)]" />
        ) : state === "saved" ? (
          <motion.span key="saved" {...(shouldReduceMotion ? {} : glyphMotion)} className="text-[var(--md-green)]" title={t("Saved")}>
            <Check className="size-3.5" strokeWidth={2} />
          </motion.span>
        ) : state === "error" ? (
          <motion.span key="error" {...(shouldReduceMotion ? {} : glyphMotion)} className="text-[var(--md-red)]">
            <AlertCircle className="size-3.5" strokeWidth={1.8} />
          </motion.span>
        ) : editing || !showEditHint ? null : (
          // The pencil only exists on hover and focus. A detail view covered in
          // edit affordances reads as a form, which is not what it is.
          <motion.span key="hint" {...(shouldReduceMotion ? {} : glyphMotion)} className="text-[var(--md-subtle)] opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
            <Pencil className="size-3" strokeWidth={1.5} />
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  )
}

const labelClass = "text-[11.5px] leading-4 text-[var(--md-text)]"
// Display and control share these metrics exactly, so swapping one for the other
// moves nothing. This is the whole trick to inline editing that does not jump.
const valueClass = "text-[13px] font-medium leading-5 text-[var(--md-ink)]"
const shellClass = "group grid grid-cols-[minmax(96px,0.7fr)_minmax(0,1fr)] items-start gap-3 rounded-[var(--md-radius-md)] px-2 py-1.5 -mx-2 transition-colors duration-150"
const DirectEditContext = createContext(false)

/**
 * A record field that reads as text and edits in place.
 *
 * At rest there is no field chrome at all — a detail view should look like a
 * record, not a form. The control only appears once the operator asks for it, and
 * it is laid out to the same metrics as the text it replaces, so nothing shifts.
 *
 * Enter commits, Escape reverts, and blur commits. Nothing is sent unless the
 * value actually changed, so tabbing through a record is free.
 */
export function InlineField({
  label,
  value,
  onSave,
  kind = "text",
  placeholder,
  hint,
  required = false,
  readOnly = false,
  align = "end",
  directEdit: directEditProp,
}: {
  label: string
  /** The stored value. Empty string renders the placeholder in a quiet tone. */
  value: string
  /** Omit alongside `readOnly` for a fact the record shows but does not own. */
  onSave?: (next: string) => Promise<void> | void
  kind?: InlineFieldKind
  /** Shows the expected format, never the field's name. */
  placeholder?: string
  hint?: string
  required?: boolean
  readOnly?: boolean
  align?: "start" | "end"
  /** Keep the real field visible, matching quote detail. Inherited from InlineFieldCard when omitted. */
  directEdit?: boolean
}) {
  const { t } = useLanguage()
  const fieldId = useId()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const { state, message, setState, setMessage, markSaved } = useSaveState()
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const directEditFromCard = useContext(DirectEditContext)
  const directEdit = directEditProp ?? directEditFromCard

  // A value changed elsewhere — a save on another field, a refetch — replaces the
  // draft only while the operator is not part-way through typing into it.
  useEffect(() => { if (!editing) setDraft(value) }, [value, editing])

  useEffect(() => {
    if (!editing) return
    const node = inputRef.current
    node?.focus()
    if (node instanceof HTMLInputElement) node.select()
  }, [editing])

  async function commit() {
    if (!directEdit) setEditing(false)
    const next = draft.trim()
    if (next === value.trim()) { setEditing(false); setState("idle"); setMessage(null); return }
    if (required && !next) {
      setDraft(value)
      setEditing(false)
      setState("error")
      setMessage(t(`${label} cannot be empty`))
      return
    }

    if (!onSave) return

    setState("saving")
    try {
      await onSave(next)
      setEditing(false)
      markSaved()
    } catch (error) {
      setDraft(value)
      setEditing(false)
      setState("error")
      setMessage(error instanceof Error ? error.message : t("That change could not be saved. Try again."))
    }
  }

  function revert() {
    setDraft(value)
    setEditing(false)
    setState("idle")
    setMessage(null)
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (event.key === "Escape") { event.preventDefault(); revert(); return }
    // A textarea keeps Enter for new lines, so it commits on the modifier instead.
    if (event.key === "Enter" && (kind !== "textarea" || event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      void commit()
    }
  }

  const locked = readOnly || !onSave
  const displayValue = value.trim()
  const isNumeric = kind === "number"
  const isLtr = kind === "email" || kind === "tel" || kind === "url" || kind === "number" || kind === "date"

  return (
    <div className={cn(shellClass, !locked && !directEdit && "hover:bg-[var(--md-hover)]")}>
      <label htmlFor={editing || (directEdit && !locked) ? fieldId : undefined} className={cn(labelClass, directEdit ? "pt-2" : "pt-px")}>{t(label)}</label>

      <div className="grid min-w-0 gap-1">
        <div className={cn("flex min-w-0 items-start gap-2", align === "end" && !editing && !directEdit ? "justify-end" : "justify-between")}>
          {editing || (directEdit && !locked) ? (
            kind === "textarea" ? (
              <Textarea
                id={fieldId}
                ref={inputRef as React.Ref<HTMLTextAreaElement>}
                value={draft}
                dir="auto"
                onChange={(event) => setDraft(event.target.value)}
                onFocus={() => setEditing(true)}
                onBlur={() => void commit()}
                onKeyDown={handleKeyDown}
                placeholder={placeholder ? t(placeholder) : undefined}
                className={cn(valueClass, "min-h-20 w-full rounded-[var(--md-radius-md)] border-0 bg-[var(--md-field-bg)] px-2 py-1.5 text-base shadow-[var(--md-shadow-line)] hover:bg-[var(--md-field-bg-hover)] focus-visible:bg-[var(--md-field-bg-hover)] sm:text-[13px]")}
              />
            ) : (
              <Input
                id={fieldId}
                ref={inputRef as React.Ref<HTMLInputElement>}
                type={kind === "number" ? "number" : kind === "date" ? "date" : kind}
                value={draft}
                dir={isLtr ? "ltr" : "auto"}
                onChange={(event) => setDraft(event.target.value)}
                onFocus={() => setEditing(true)}
                onBlur={() => void commit()}
                onKeyDown={handleKeyDown}
                placeholder={placeholder ? t(placeholder) : undefined}
                // 16px on touch stops iOS zooming the page on focus; the record's
                // own 13px only applies from the pointer breakpoint up.
                className={cn(valueClass, "h-8 w-full rounded-[var(--md-radius-md)] border-0 bg-[var(--md-field-bg)] px-2 text-base shadow-[var(--md-shadow-line)] hover:bg-[var(--md-field-bg-hover)] focus-visible:bg-[var(--md-field-bg-hover)] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)] sm:text-[13px]", isNumeric && "tabular-nums")}
              />
            )
          ) : (
            directEdit ? (
              <span
                data-i18n-skip
                dir={isLtr ? "ltr" : "auto"}
                className={cn(valueClass, "flex min-h-8 w-full min-w-0 items-center rounded-[var(--md-radius-md)] bg-[var(--md-field-bg)] px-2 py-1.5 shadow-[var(--md-shadow-line)]", align === "end" && "justify-end text-end", isNumeric && "tabular-nums")}
              >
                {displayValue || "—"}
              </span>
            ) : <button
              type="button"
              disabled={locked}
              onClick={() => setEditing(true)}
              dir={isLtr ? "ltr" : "auto"}
              className={cn(
                valueClass,
                "min-w-0 rounded-[var(--md-radius-sm)] text-start outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a24)] disabled:cursor-default",
                align === "end" && "text-end",
                isNumeric && "tabular-nums",
                !displayValue && "font-normal text-[var(--md-subtle)]",
                kind === "textarea" ? "whitespace-pre-wrap" : "truncate",
              )}
            >
              {displayValue || (locked ? "—" : t("Add"))}
            </button>
          )}
          <FieldStatus state={state} editing={editing} showEditHint={!directEdit} />
        </div>

        {message ? (
          <p role="alert" className="text-[11.5px] leading-4 text-[var(--md-red)]">{message}</p>
        ) : hint && editing ? (
          <p className="text-[11.5px] leading-4 text-[var(--md-subtle)]">{t(hint)}</p>
        ) : null}
      </div>
    </div>
  )
}

/** The same row, backed by a fixed set of choices. Saves the moment one is picked. */
export function InlineSelectField({
  label,
  value,
  options,
  onSave,
  placeholder,
  readOnly = false,
}: {
  label: string
  value: string
  options: readonly { value: string; label: string }[]
  onSave: (next: string) => Promise<void> | void
  placeholder?: string
  readOnly?: boolean
}) {
  const { t } = useLanguage()
  const { state, message, setState, setMessage, markSaved } = useSaveState()
  const current = options.find((option) => option.value === value)
  const directEdit = useContext(DirectEditContext)

  async function choose(next: string) {
    if (next === value) return
    setState("saving")
    try {
      await onSave(next)
      markSaved()
    } catch (error) {
      setState("error")
      setMessage(error instanceof Error ? error.message : t("That change could not be saved. Try again."))
    }
  }

  return (
    <div className={cn(shellClass, !readOnly && !directEdit && "hover:bg-[var(--md-hover)]")}>
      <span className={cn(labelClass, directEdit ? "pt-2" : "pt-px")}>{t(label)}</span>
      <div className="grid min-w-0 gap-1">
        <div className="flex min-w-0 items-center justify-end gap-2">
          {readOnly ? (
            <span className={cn(valueClass, "truncate")}>{current ? t(current.label) : "—"}</span>
          ) : (
            <Select value={value} onValueChange={(next) => void choose(next)}>
              <SelectTrigger
                aria-label={t(label)}
                className={cn(valueClass, "h-8 min-w-0 justify-end gap-1.5 rounded-[var(--md-radius-md)] border-0 px-2 transition-colors duration-150 focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]", directEdit ? "w-full bg-[var(--md-field-bg)] shadow-[var(--md-shadow-line)] hover:bg-[var(--md-field-bg-hover)] data-[state=open]:bg-[var(--md-field-bg-hover)]" : "w-auto bg-transparent shadow-none hover:bg-[var(--md-surface-soft)] data-[state=open]:bg-[var(--md-surface-soft)]")}
              >
                <SelectValue placeholder={placeholder ? t(placeholder) : t("Choose")} />
              </SelectTrigger>
              <SelectContent align="end">
                {options.map((option) => <SelectItem key={option.value} value={option.value}>{t(option.label)}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <FieldStatus state={state} editing={false} showEditHint={!directEdit} />
        </div>
        {message ? <p role="alert" className="text-[11.5px] leading-4 text-[var(--md-red)]">{message}</p> : null}
      </div>
    </div>
  )
}

/** The same row for a yes/no setting. Labelled for what happens when it is on. */
export function InlineSwitchField({
  label,
  checked,
  onSave,
  hint,
  readOnly = false,
}: {
  label: string
  checked: boolean
  onSave: (next: boolean) => Promise<void> | void
  hint?: string
  readOnly?: boolean
}) {
  const { t } = useLanguage()
  const { state, message, setState, setMessage, markSaved } = useSaveState()
  const directEdit = useContext(DirectEditContext)

  async function toggle(next: boolean) {
    setState("saving")
    try {
      await onSave(next)
      markSaved()
    } catch (error) {
      setState("error")
      setMessage(error instanceof Error ? error.message : t("That change could not be saved. Try again."))
    }
  }

  return (
    <div className={cn(shellClass, "items-center")}>
      <div className="min-w-0">
        <span className={cn(labelClass, "block")}>{t(label)}</span>
        {hint ? <span className="mt-0.5 block text-[11px] leading-4 text-[var(--md-subtle)]">{t(hint)}</span> : null}
      </div>
      <div className="flex items-center justify-end gap-2">
        {message ? <p role="alert" className="text-[11.5px] leading-4 text-[var(--md-red)]">{message}</p> : null}
        <Switch checked={checked} disabled={readOnly} onCheckedChange={(next) => void toggle(next)} aria-label={t(label)} />
        <FieldStatus state={state} editing={false} showEditHint={!directEdit} />
      </div>
    </div>
  )
}

/**
 * A card of inline fields. Hairlines between rows rather than a box around each —
 * a record is one list, not a stack of objects.
 */
export function InlineFieldCard({ title, meta, action, children, directEdit = false }: { title: string; meta?: string; action?: ReactNode; children: ReactNode; directEdit?: boolean }) {
  const { t } = useLanguage()

  return (
    <section className="overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)]">
      <div className="flex items-center justify-between gap-3 px-4 py-3 shadow-[var(--md-stroke-bottom)]">
        <h2 className="text-[13px] font-medium leading-4 text-[var(--md-ink)]">{t(title)}</h2>
        <div className="flex shrink-0 items-center gap-2">
          {meta ? <span className="text-[11.5px] text-[var(--md-text)]">{meta}</span> : null}
          {action}
        </div>
      </div>
      <DirectEditContext.Provider value={directEdit}>
        <div className="grid gap-0.5 p-3">{children}</div>
      </DirectEditContext.Provider>
    </section>
  )
}
