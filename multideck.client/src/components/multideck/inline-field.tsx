import { createContext, useContext, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { AlertCircle, Check, Pencil, X } from "@/components/icons/hugeicons"

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

  // The glyphs are stacked in one cell and swap in sync rather than in turn. With
  // `mode="wait"` an outgoing glyph that never finishes leaving blocks the next one
  // from arriving — which left a refused save showing the saving dot for ever.
  return (
    <span className="relative grid size-4 shrink-0 place-items-center" aria-hidden={state === "idle" ? true : undefined}>
      <AnimatePresence initial={false}>
        {state === "saving" ? (
          <motion.span key="saving" {...(shouldReduceMotion ? {} : glyphMotion)} className="absolute size-1.5 rounded-full bg-[var(--md-accent)]" />
        ) : null}
        {state === "saved" ? (
          <motion.span key="saved" {...(shouldReduceMotion ? {} : glyphMotion)} className="absolute text-[var(--md-green)]" title={t("Saved")}>
            <Check className="size-3.5" strokeWidth={2} />
          </motion.span>
        ) : null}
        {state === "error" ? (
          <motion.span key="error" {...(shouldReduceMotion ? {} : glyphMotion)} className="absolute text-[var(--md-red)]">
            <AlertCircle className="size-3.5" strokeWidth={1.8} />
          </motion.span>
        ) : null}
      </AnimatePresence>
      {/* The pencil only exists on hover and focus. A detail view covered in edit
          affordances reads as a form, which is not what it is. Plain CSS rather than
          a motion value: an animated opacity would win over the hover rule and leave
          the pencil showing on every field at rest. */}
      {state === "idle" && !editing && showEditHint ? (
        <span className="absolute text-[var(--md-subtle)] opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100">
          <Pencil className="size-3" strokeWidth={1.5} />
        </span>
      ) : null}
    </span>
  )
}

const labelClass = "text-[11.5px] leading-4 text-[var(--md-text)]"
// Display and control share these metrics exactly, so swapping one for the other
// moves nothing. This is the whole trick to inline editing that does not jump.
const valueClass = "text-[13px] font-medium leading-5 text-[var(--md-ink)]"
const rowShellClass = "group grid grid-cols-[minmax(96px,0.7fr)_minmax(0,1fr)] items-start gap-3 rounded-[var(--md-radius-md)] px-2 py-1.5 -mx-2 transition-colors duration-150"
// Stacked puts the label over its control so a field survives a narrow grid
// column. No negative margin: in a grid cell it would spill past the gutter.
const stackedShellClass = "group grid content-start gap-1 py-1"

type InlineFieldSettings = { directEdit: boolean; stacked: boolean }
const InlineFieldContext = createContext<InlineFieldSettings>({ directEdit: false, stacked: false })

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
  stacked: stackedProp,
  colSpan,
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
  /** Put the label over the control instead of beside it. Inherited from InlineFieldCard when omitted. */
  stacked?: boolean
  /**
   * How many columns of its grid the field takes. `2` is what an address line
   * wants: the whole row on a two-column grid, half of a four-column one, so a
   * street never stretches the width of the page. `"full"` is for prose.
   */
  colSpan?: 2 | "full"
}) {
  const { t } = useLanguage()
  const fieldId = useId()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const { state, message, setState, setMessage, markSaved } = useSaveState()
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const settings = useContext(InlineFieldContext)
  const directEdit = directEditProp ?? settings.directEdit
  const stacked = stackedProp ?? settings.stacked

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

  // A field in a grid column reads down, never across: there is no room to put a
  // label beside a value and still show the value.
  const alignEnd = align === "end" && !stacked

  return (
    <div
      className={cn(
        stacked ? stackedShellClass : rowShellClass,
        !stacked && !locked && !directEdit && "hover:bg-[var(--md-hover)]",
        colSpan === "full" && "col-span-full",
        colSpan === 2 && "sm:col-span-2",
      )}
    >
      <label htmlFor={editing || (directEdit && !locked) ? fieldId : undefined} className={cn(labelClass, stacked ? "" : directEdit ? "pt-2" : "pt-px")}>{t(label)}</label>

      <div className="grid min-w-0 gap-1">
        <div className={cn("flex min-w-0 items-start gap-2", alignEnd && !editing && !directEdit ? "justify-end" : "justify-between")}>
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
                className={cn(valueClass, "flex min-h-8 w-full min-w-0 items-center rounded-[var(--md-radius-md)] bg-[var(--md-field-bg)] px-2 py-1.5 shadow-[var(--md-shadow-line)]", alignEnd && "justify-end text-end", isNumeric && "tabular-nums")}
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
                alignEnd && "text-end",
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

/**
 * A short fact as an editable chip.
 *
 * A tier, a segment, a trade lane — one or two words each. Given a labelled input
 * box apiece they fill a column and read as a form; as chips they wrap across the
 * width of the page and read as what they are, a handful of tags on a record. The
 * chip and the input it becomes share a height and a radius, so nothing jumps.
 */
export function InlineTagField({
  label,
  value,
  onSave,
  kind = "text",
  placeholder,
  suffix,
  readOnly = false,
  onRemove,
  width = "6.5rem",
}: {
  label: string
  value: string
  onSave?: (next: string) => Promise<void> | void
  kind?: "text" | "number"
  placeholder?: string
  /** A unit shown after the value: %, hours, kg. Hidden while the chip is empty. */
  suffix?: string
  readOnly?: boolean
  /** Offer a cross on hover. For facts the operator added and can take away. */
  onRemove?: () => Promise<void> | void
  /** The narrowest the chip may get. It grows to whatever the value needs. */
  width?: string
}) {
  const { t } = useLanguage()
  const fieldId = useId()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const { state, message, setState, setMessage, markSaved } = useSaveState()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (!editing) setDraft(value) }, [value, editing])
  useEffect(() => {
    if (!editing) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [editing])

  async function commit() {
    setEditing(false)
    const next = draft.trim()
    if (next === value.trim() || !onSave) { setDraft(value); return }
    setState("saving")
    try {
      await onSave(next)
      markSaved()
    } catch (error) {
      setDraft(value)
      setState("error")
      setMessage(error instanceof Error ? error.message : t("That change could not be saved. Try again."))
    }
  }

  const locked = readOnly || !onSave
  const display = value.trim()
  // The same surface, height and radius as every other field on the record. Only
  // the width differs: a tag is as wide as its own value, not as wide as a column.
  // An empty one is the same box with a quiet placeholder, never an outline — two
  // treatments for one kind of field is the thing that reads as a mess.
  const chipClass = "inline-flex h-8 max-w-full items-center gap-1.5 rounded-[var(--md-radius-md)] bg-[var(--md-field-bg)] ps-2 pe-1.5 text-[13px] font-medium leading-none shadow-[var(--md-shadow-line)]"

  return (
    <div className="group grid content-start gap-1.5" style={{ minWidth: width }}>
      <label id={`${fieldId}-label`} htmlFor={editing ? fieldId : undefined} className="ps-1 text-[11px] leading-3 text-[var(--md-subtle)]">{t(label)}</label>

      {editing ? (
        <Input
          id={fieldId}
          ref={inputRef}
          type={kind === "number" ? "number" : "text"}
          dir={kind === "number" ? "ltr" : "auto"}
          // Small enough that the input's own intrinsic width never beats the
          // chip's, so opening a tag for editing does not shove its neighbours
          // along the row.
          size={8}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(event) => {
            if (event.key === "Enter") { event.preventDefault(); void commit() }
            if (event.key === "Escape") { event.preventDefault(); setDraft(value); setEditing(false); setState("idle"); setMessage(null) }
          }}
          placeholder={placeholder ? t(placeholder) : undefined}
          className={cn(chipClass, "w-full border-0 text-base hover:bg-[var(--md-field-bg-hover)] focus-visible:bg-[var(--md-field-bg-hover)] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)] sm:text-[13px]", kind === "number" && "tabular-nums")}
        />
      ) : (
        <div className="relative flex min-w-0">
          <button
            type="button"
            disabled={locked}
            onClick={() => setEditing(true)}
            dir={kind === "number" ? "ltr" : "auto"}
            // Named by its label and its value together, so the chip is announced
            // as "Tier, Gold" rather than a bare "Gold" with no idea what it is.
            aria-labelledby={`${fieldId}-label ${fieldId}-value`}
            className={cn(
              chipClass,
              "w-full text-start outline-none transition-colors duration-150 disabled:cursor-default",
              display ? "text-[var(--md-ink)]" : "font-normal text-[var(--md-subtle)]",
              !locked && "hover:bg-[var(--md-field-bg-hover)] focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a24)]",
              state === "error" && "shadow-[0_0_0_1px_var(--md-red)]",
              kind === "number" && "tabular-nums",
            )}
          >
            <span id={`${fieldId}-value`} className="min-w-0 flex-1 truncate" data-i18n-skip={display ? true : undefined}>
              {display ? `${display}${suffix ? (suffix === "%" ? suffix : ` ${suffix}`) : ""}` : locked ? "—" : t("Add")}
            </span>
            <FieldStatus state={state} editing={false} showEditHint={!locked} />
          </button>
          {onRemove ? (
            <button
              type="button"
              aria-label={`${t("Remove")} ${label}`}
              onClick={() => void onRemove()}
              className="absolute -end-1 -top-1 grid size-[18px] place-items-center rounded-full bg-[var(--md-surface)] text-[var(--md-subtle)] opacity-0 shadow-[var(--md-shadow-line)] transition-opacity duration-150 hover:text-[var(--md-red)] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a24)] group-hover:opacity-100"
            >
              <X className="size-3" strokeWidth={2} />
            </button>
          ) : null}
        </div>
      )}

      {message ? <p role="alert" className="ps-1 text-[11px] leading-4 text-[var(--md-red)]">{message}</p> : null}
    </div>
  )
}

/**
 * A yes/no setting as a pill that is either lit or not.
 *
 * Six switches in a column are six rows of label, rule and control to read before
 * you know what is on. Six chips are one glance: the lit ones are on. The change
 * lands optimistically because a toggle that waits on a round trip feels broken,
 * and puts itself back if the save is refused.
 */
export function InlineToggleChip({
  label,
  checked,
  onSave,
  readOnly = false,
}: {
  label: string
  checked: boolean
  onSave: (next: boolean) => Promise<void> | void
  readOnly?: boolean
}) {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const { state, message, setState, setMessage, markSaved } = useSaveState()
  const [shown, setShown] = useState(checked)

  useEffect(() => setShown(checked), [checked])

  async function toggle() {
    const next = !shown
    setShown(next)
    setState("saving")
    setMessage(null)
    try {
      await onSave(next)
      markSaved()
    } catch (error) {
      setShown(checked)
      setState("error")
      setMessage(error instanceof Error ? error.message : t("That change could not be saved. Try again."))
    }
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={shown}
      disabled={readOnly}
      title={message ?? undefined}
      onClick={() => void toggle()}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full ps-2.5 pe-3 text-[12.5px] font-medium leading-none outline-none transition-colors duration-150 active:scale-[0.97] disabled:cursor-default motion-reduce:transform-none",
        shown ? "bg-[var(--md-accent-a10)] text-[var(--md-accent)] shadow-[0_0_0_1px_var(--md-accent-a24)]" : "bg-[var(--md-surface-soft)] text-[var(--md-text)] shadow-[var(--md-shadow-line)]",
        !readOnly && (shown ? "hover:bg-[var(--md-accent-a14)]" : "hover:bg-[var(--md-surface-tint)]"),
        "focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a24)]",
        state === "error" && "shadow-[0_0_0_1px_var(--md-red)]",
      )}
    >
      {/* The box is there whether or not the tick is, so the label never shifts. */}
      <span className="grid size-3.5 shrink-0 place-items-center">
        <AnimatePresence initial={false} mode="wait">
          {state === "error" ? (
            <motion.span key="error" {...(shouldReduceMotion ? {} : glyphMotion)} className="text-[var(--md-red)]"><AlertCircle className="size-3.5" strokeWidth={1.8} /></motion.span>
          ) : shown ? (
            <motion.span key="on" {...(shouldReduceMotion ? {} : glyphMotion)}><Check className="size-3.5" strokeWidth={2.2} /></motion.span>
          ) : null}
        </AnimatePresence>
      </span>
      {t(label)}
    </button>
  )
}

/**
 * One value out of a known few, shown as all of them.
 *
 * A dropdown hides the range a field can take, which for something like an account's
 * relationship is most of the information. Laid out as chips the whole ladder is
 * visible and changing it is one click rather than three.
 */
export function InlineChoiceField({
  label,
  value,
  options,
  onSave,
  readOnly = false,
}: {
  label: string
  value: string
  options: readonly { value: string; label: string }[]
  onSave: (next: string) => Promise<void> | void
  readOnly?: boolean
}) {
  const { t } = useLanguage()
  const groupId = useId()
  const { state, message, setState, setMessage, markSaved } = useSaveState()

  // A value the reference data has since dropped still has to be visible, or the
  // record would silently show nothing selected.
  const known = options.some((option) => option.value === value)
  const shown = known || !value ? options : [{ value, label: value }, ...options]

  async function choose(next: string) {
    if (next === value) return
    setState("saving")
    setMessage(null)
    try {
      await onSave(next)
      markSaved()
    } catch (error) {
      setState("error")
      setMessage(error instanceof Error ? error.message : t("That change could not be saved. Try again."))
    }
  }

  return (
    <div className="grid content-start gap-1.5">
      <div className="flex items-center gap-1.5 ps-1">
        <span id={`${groupId}-label`} className="text-[11px] leading-3 text-[var(--md-subtle)]">{t(label)}</span>
        <FieldStatus state={state} editing={false} showEditHint={false} />
      </div>
      {/* One of a known few is a radio group, not a row of unrelated toggles. */}
      <div role="radiogroup" aria-labelledby={`${groupId}-label`} className="flex flex-wrap gap-1.5">
        {shown.map((option) => {
          const active = option.value === value
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              disabled={readOnly}
              aria-checked={active}
              onClick={() => void choose(option.value)}
              className={cn(
                "inline-flex h-8 items-center rounded-full px-3 text-[12.5px] font-medium leading-none outline-none transition-colors duration-150 active:scale-[0.97] disabled:cursor-default motion-reduce:transform-none",
                active ? "bg-[var(--md-accent)] text-[var(--md-accent-ink)]" : "bg-[var(--md-surface-soft)] text-[var(--md-text)] shadow-[var(--md-shadow-line)]",
                !readOnly && !active && "hover:bg-[var(--md-surface-tint)] hover:text-[var(--md-ink)]",
                "focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a24)]",
              )}
            >
              {t(option.label)}
            </button>
          )
        })}
      </div>
      {message ? <p role="alert" className="ps-1 text-[11px] leading-4 text-[var(--md-red)]">{message}</p> : null}
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
  const { directEdit, stacked } = useContext(InlineFieldContext)

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
    <div className={cn(stacked ? stackedShellClass : rowShellClass, !stacked && !readOnly && !directEdit && "hover:bg-[var(--md-hover)]")}>
      <span className={cn(labelClass, stacked ? "" : directEdit ? "pt-2" : "pt-px")}>{t(label)}</span>
      <div className="grid min-w-0 gap-1">
        <div className={cn("flex min-w-0 items-center gap-2", stacked ? "justify-between" : "justify-end")}>
          {readOnly ? (
            <span className={cn(valueClass, "truncate")}>{current ? t(current.label) : "—"}</span>
          ) : (
            <Select value={value} onValueChange={(next) => void choose(next)}>
              <SelectTrigger
                aria-label={t(label)}
                className={cn(valueClass, "h-8 min-w-0 gap-1.5 rounded-[var(--md-radius-md)] border-0 px-2 transition-colors duration-150 focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]", stacked ? "justify-between" : "justify-end", directEdit || stacked ? "w-full bg-[var(--md-field-bg)] shadow-[var(--md-shadow-line)] hover:bg-[var(--md-field-bg-hover)] data-[state=open]:bg-[var(--md-field-bg-hover)]" : "w-auto bg-transparent shadow-none hover:bg-[var(--md-surface-soft)] data-[state=open]:bg-[var(--md-surface-soft)]")}
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
  const { directEdit, stacked } = useContext(InlineFieldContext)

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

  // In a grid the switch sits in a box the height of an input, so a row of mixed
  // fields keeps one baseline instead of a switch floating in white space.
  if (stacked) {
    return (
      <div className={stackedShellClass}>
        <span className={labelClass}>{t(label)}</span>
        <div className="grid gap-1">
          <div className="flex min-h-8 items-center justify-between gap-2 rounded-[var(--md-radius-md)] bg-[var(--md-field-bg)] px-2 shadow-[var(--md-shadow-line)]">
            <span className={cn(valueClass, "truncate")}>{t(checked ? "Yes" : "No")}</span>
            <span className="flex shrink-0 items-center gap-2">
              <Switch checked={checked} disabled={readOnly} onCheckedChange={(next) => void toggle(next)} aria-label={t(label)} />
              <FieldStatus state={state} editing={false} showEditHint={false} />
            </span>
          </div>
          {message ? <p role="alert" className="text-[11.5px] leading-4 text-[var(--md-red)]">{message}</p> : hint ? <p className="text-[11.5px] leading-4 text-[var(--md-subtle)]">{t(hint)}</p> : null}
        </div>
      </div>
    )
  }

  return (
    <div className={cn(rowShellClass, "items-center")}>
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
 * Sets the shape for a run of fields rather than repeating it on each one.
 *
 * Renders nothing itself — it only decides whether the fields inside read as rows
 * (label beside value) or stack their labels above always-visible controls, which
 * is what a field needs once it is sharing a page-width grid with others.
 */
export function InlineFieldGroup({ stacked = false, directEdit = false, children }: { stacked?: boolean; directEdit?: boolean; children: ReactNode }) {
  return <InlineFieldContext.Provider value={{ stacked, directEdit: directEdit || stacked }}>{children}</InlineFieldContext.Provider>
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
      <InlineFieldContext.Provider value={{ directEdit, stacked: false }}>
        <div className="grid gap-0.5 p-3">{children}</div>
      </InlineFieldContext.Provider>
    </section>
  )
}
