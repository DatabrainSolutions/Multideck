import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { MousePointerClick, RotateCcw, Search, TriangleAlert, X } from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ShortcutKeys } from "@/components/multideck/keyboard-shortcut-keys"
import { useLanguage } from "@/i18n/language-provider"
import {
  bindingLabel,
  bindingsEqual,
  bindingTokens,
  isReservedBinding,
  maxShortcutSteps,
  pointerGesture,
  shortcutPlatform,
  stepFromEvent,
  type ShortcutBinding,
  type ShortcutStep,
} from "@/lib/keyboard-shortcut-binding"
import {
  customisedShortcutCount,
  findShortcutConflicts,
  isShortcutCustomised,
  resetAllShortcutBindings,
  resetShortcutBinding,
  suspendShortcuts,
  useShortcutBindings,
  writeShortcutBinding,
} from "@/lib/keyboard-shortcuts"
import {
  getShortcutDefinition,
  shortcutDefinitions,
  shortcutGroups,
  type ShortcutDefinition,
} from "@/data/keyboard-shortcuts-data"
import { mdEaseIn, mdEaseOut, mdMotion, reduceMotion, staggerRamp } from "@/lib/motion"
import { cn } from "@/lib/utils"

/**
 * How long a bare first key waits to see whether a second one follows. Under this
 * window "G" then "B" reads as one sequence; over it, "G" was the whole binding.
 * A first key that already carries a modifier commits immediately — nobody types
 * ⌘K expecting a second step.
 */
const sequenceCaptureWindow = 820

type RecordingState = {
  shortcutId: string
  steps: ShortcutStep[]
}

function stepsToBinding(steps: ShortcutStep[]): ShortcutBinding {
  return { kind: "chord", steps: steps.slice(0, maxShortcutSteps) }
}

function useIsMounted() {
  const mounted = useRef(true)
  useEffect(() => () => {
    mounted.current = false
  }, [])
  return mounted
}

/**
 * The recording well. It owns the keyboard while open: the global dispatcher is
 * suspended, so pressing ⌘\ here records ⌘\ rather than collapsing the sidebar
 * underneath.
 */
function ShortcutRecorder({
  definition,
  recording,
  onStepsChange,
  onCommit,
  onCancel,
}: {
  definition: ShortcutDefinition
  recording: RecordingState
  onStepsChange: (steps: ShortcutStep[]) => void
  onCommit: (binding: ShortcutBinding) => void
  onCancel: () => void
}) {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const wellRef = useRef<HTMLDivElement>(null)
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stepsRef = useRef(recording.steps)
  const mounted = useIsMounted()
  stepsRef.current = recording.steps

  const clearTimer = useCallback(() => {
    if (!commitTimer.current) return
    clearTimeout(commitTimer.current)
    commitTimer.current = null
  }, [])

  useEffect(() => {
    const release = suspendShortcuts()
    wellRef.current?.focus({ preventScroll: true })

    return () => {
      release()
      if (commitTimer.current) clearTimeout(commitTimer.current)
    }
  }, [])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault()
        clearTimer()
        onCancel()
        return
      }

      const platform = shortcutPlatform()
      const step = stepFromEvent(event, platform)
      if (!step) return

      event.preventDefault()
      event.stopPropagation()

      const bare = !step.mod && !step.alt
      const previous = stepsRef.current
      const canExtend = previous.length === 1 && !previous[0].mod && !previous[0].alt && bare

      if (canExtend) {
        clearTimer()
        onCommit(stepsToBinding([previous[0], step]))
        return
      }

      onStepsChange([step])
      clearTimer()

      if (!bare) {
        onCommit(stepsToBinding([step]))
        return
      }

      // A bare key might be the leader of a sequence, so it settles after a beat.
      commitTimer.current = setTimeout(() => {
        commitTimer.current = null
        if (mounted.current) onCommit(stepsToBinding([step]))
      }, sequenceCaptureWindow)
    }

    window.addEventListener("keydown", handleKeyDown, { capture: true })
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true })
  }, [clearTimer, mounted, onCancel, onCommit, onStepsChange])

  function handleDoubleClick(event: React.MouseEvent) {
    const platform = shortcutPlatform()
    const mod = platform === "apple" ? event.metaKey : event.ctrlKey
    if (!mod && !event.altKey && !event.shiftKey) return

    event.preventDefault()
    clearTimer()
    onCommit(pointerGesture({ mod, shift: event.shiftKey, alt: event.altKey }))
  }

  const captured = recording.steps.length > 0

  return (
    <motion.div
      ref={wellRef}
      role="button"
      tabIndex={0}
      aria-label={`${t("Recording a new shortcut for")} ${t(definition.label)}`}
      className="md-shortcut-well absolute inset-0 flex items-center justify-center gap-2 rounded-[var(--md-radius-lg)] px-2.5 outline-none"
      initial={shouldReduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: shouldReduceMotion ? 0 : 0.16, ease: mdEaseOut }}
      onDoubleClick={handleDoubleClick}
      onBlur={() => {
        clearTimer()
        onCancel()
      }}
    >
      <span className="md-shortcut-well__pulse" aria-hidden="true" />
      <span aria-live="polite" className="relative flex items-center gap-2">
        {captured ? (
          <ShortcutKeys binding={stepsToBinding(recording.steps)} keyClassName="bg-[var(--md-surface)]" />
        ) : (
          <span className="text-[12px] font-medium text-[var(--md-accent)]">{t("Press the keys…")}</span>
        )}
      </span>
    </motion.div>
  )
}

function ShortcutRow({
  definition,
  binding,
  customised,
  recording,
  index,
  onStartRecording,
  onStepsChange,
  onCommit,
  onCancel,
  onReset,
  onDisable,
}: {
  definition: ShortcutDefinition
  binding: ShortcutBinding | null
  customised: boolean
  recording: RecordingState | null
  index: number
  onStartRecording: () => void
  onStepsChange: (steps: ShortcutStep[]) => void
  onCommit: (binding: ShortcutBinding) => void
  onCancel: () => void
  onReset: () => void
  onDisable: () => void
}) {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const isRecording = recording?.shortcutId === definition.id
  const reserved = isReservedBinding(binding)
  const conflicts = useMemo(
    () => (binding ? findShortcutConflicts(definition.id, binding) : []),
    [binding, definition.id],
  )
  const warning = conflicts.length > 0
    ? `${t("Also used by")} ${conflicts.map((id) => t(getShortcutDefinition(id)?.label ?? id)).join(", ")}`
    : reserved
      ? t("Your browser may claim this one first.")
      : null

  return (
    <motion.div
      layout={!shouldReduceMotion}
      initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      // Leaving carries no stagger delay. Rows arrive in sequence because reading
      // order matters on the way in; on the way out a delay would just hold a row
      // on screen after the operator has already filtered it away.
      exit={
        shouldReduceMotion
          ? undefined
          : { opacity: 0, y: -4, transition: { duration: 0.14, ease: mdEaseIn, delay: 0 } }
      }
      transition={{
        ...reduceMotion(Boolean(shouldReduceMotion), mdMotion.enter),
        delay: shouldReduceMotion ? 0 : staggerRamp(index, 0.018),
      }}
      className="md-shortcut-row group grid gap-2 px-5 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4"
    >
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-[13px] font-medium text-[var(--md-ink)]">
          {definition.signature ? (
            <MousePointerClick className="size-3.5 shrink-0 text-[var(--md-accent)]" strokeWidth={1.4} aria-hidden="true" />
          ) : null}
          <span className="truncate">{t(definition.label)}</span>
        </p>
        <p className="mt-0.5 max-w-[62ch] text-pretty text-[12px] leading-5 text-[var(--md-text)]">{t(definition.description)}</p>
        <AnimatePresence initial={false}>
          {warning && !isRecording ? (
            <motion.p
              key="warning"
              initial={shouldReduceMotion ? false : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={shouldReduceMotion ? undefined : { opacity: 0, height: 0 }}
              transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.fast)}
              className="flex items-center gap-1.5 overflow-hidden text-[11.5px] text-[var(--md-amber-strong)]"
            >
              <TriangleAlert className="mt-1 size-3 shrink-0" strokeWidth={1.5} aria-hidden="true" />
              <span className="pt-1">{warning}</span>
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-1.5">
        {/* The value and the recorder occupy one fixed well and cross-fade inside
            it. Swapping them in flow would jump the row's width mid-transition. */}
        <div className="relative h-9 w-[168px] shrink-0">
          <AnimatePresence initial={false}>
            {isRecording && recording ? (
              <ShortcutRecorder
                key="recorder"
                definition={definition}
                recording={recording}
                onStepsChange={onStepsChange}
                onCommit={onCommit}
                onCancel={onCancel}
              />
            ) : (
              <motion.button
                key="value"
                type="button"
                onClick={onStartRecording}
                aria-label={`${t("Change the shortcut for")} ${t(definition.label)}${binding ? `. ${t("Currently")} ${bindingLabel(binding)}` : ""}`}
                // Opacity only. The press scale is CSS's, so the two never own the
                // same property and a press mid-crossfade cannot fight the fade.
                initial={shouldReduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: shouldReduceMotion ? 0 : 0.14, ease: mdEaseOut }}
                className="md-shortcut-value absolute inset-0 flex items-center justify-center gap-2 rounded-[var(--md-radius-lg)] px-2.5"
              >
                <ShortcutKeys binding={binding} emptyLabel={t("Off")} />
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        <div className="flex items-center gap-0.5 opacity-100 transition-opacity duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`${t("Reset")} ${t(definition.label)}`}
                disabled={!customised}
                onClick={onReset}
                className="size-8 rounded-[var(--md-radius-md)] text-[var(--md-subtle)] hover:text-[var(--md-ink)] disabled:opacity-25"
              >
                <RotateCcw className="size-3.5" strokeWidth={1.4} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">{t("Reset to default")}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`${t("Turn off")} ${t(definition.label)}`}
                disabled={!binding}
                onClick={onDisable}
                className="size-8 rounded-[var(--md-radius-md)] text-[var(--md-subtle)] hover:text-[var(--md-ink)] disabled:opacity-25"
              >
                <X className="size-3.5" strokeWidth={1.4} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">{t("Turn this shortcut off")}</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </motion.div>
  )
}

/**
 * The whole editable shortcut list. Used on its own in Settings and inside the
 * ⌘/ overlay, so it carries its own search, grouping and reset affordances rather
 * than relying on the surface around it.
 */
export function KeyboardShortcutsPanel({
  className,
  compact = false,
}: {
  className?: string
  compact?: boolean
}) {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const bindings = useShortcutBindings()
  const [query, setQuery] = useState("")
  const [recording, setRecording] = useState<RecordingState | null>(null)
  const [lastChange, setLastChange] = useState<{ id: string; previous: ShortcutBinding | null } | null>(null)
  const customisedCount = customisedShortcutCount()

  const normalizedQuery = query.trim().toLocaleLowerCase()
  const platform = shortcutPlatform()

  const matches = useCallback(
    (definition: ShortcutDefinition) => {
      if (!normalizedQuery) return true

      const binding = bindings[definition.id] ?? null
      const haystack = [
        definition.label,
        t(definition.label),
        definition.description,
        t(definition.description),
        bindingTokens(binding, platform).flat().join(" "),
      ]
        .join(" ")
        .toLocaleLowerCase()

      return haystack.includes(normalizedQuery)
    },
    [bindings, normalizedQuery, platform, t],
  )

  const groups = useMemo(
    () =>
      shortcutGroups
        .map((group) => ({
          group,
          items: shortcutDefinitions.filter((definition) => definition.group === group.id && matches(definition)),
        }))
        .filter((entry) => entry.items.length > 0),
    [matches],
  )

  const commit = useCallback(
    (id: string, binding: ShortcutBinding | null) => {
      const previous = bindings[id] ?? null
      if (bindingsEqual(previous, binding)) {
        setRecording(null)
        return
      }

      writeShortcutBinding(id, binding)
      setLastChange({ id, previous })
      setRecording(null)
    },
    [bindings],
  )

  const undo = useCallback(() => {
    if (!lastChange) return
    const definition = getShortcutDefinition(lastChange.id)
    if (definition && bindingsEqual(lastChange.previous, definition.defaultBinding)) resetShortcutBinding(lastChange.id)
    else writeShortcutBinding(lastChange.id, lastChange.previous)
    setLastChange(null)
  }, [lastChange])

  const changedDefinition = lastChange ? getShortcutDefinition(lastChange.id) : null
  const totalMatches = groups.reduce((total, entry) => total + entry.items.length, 0)

  return (
    <div className={cn("min-w-0", className)}>
      <div
        className={cn(
          "flex flex-wrap items-center gap-2 px-5 py-3",
          compact ? "shadow-[var(--md-stroke-bottom)]" : null,
        )}
      >
        <div className="relative min-w-[180px] flex-1">
          <Search
            className="pointer-events-none absolute inset-y-0 start-3 my-auto size-3.5 text-[var(--md-subtle)]"
            strokeWidth={1.3}
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label={t("Search shortcuts")}
            placeholder={t("Search shortcuts")}
            className="h-9 rounded-[var(--md-radius-lg)] border-0 bg-[var(--md-field-bg)] ps-8 pe-3 text-[16px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] transition-[background-color,box-shadow] hover:bg-[var(--md-field-bg-hover)] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)] sm:text-[13px]"
          />
        </div>
        <p className="text-[12px] text-[var(--md-text)]">
          {customisedCount > 0 ? `${customisedCount} ${t("changed")}` : t("All default")}
        </p>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            resetAllShortcutBindings()
            setLastChange(null)
          }}
          disabled={customisedCount === 0}
          className="h-9 rounded-[var(--md-radius-lg)] px-3 text-[12.5px] font-medium text-[var(--md-text)] hover:text-[var(--md-ink)] disabled:opacity-35"
        >
          <RotateCcw className="size-3.5" strokeWidth={1.4} aria-hidden="true" />
          {t("Reset all")}
        </Button>
      </div>

      <AnimatePresence initial={false}>
        {lastChange && changedDefinition ? (
          <motion.div
            key="undo"
            initial={shouldReduceMotion ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={shouldReduceMotion ? undefined : { opacity: 0, height: 0 }}
            transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.panel)}
            className="overflow-hidden"
          >
            <div className="mx-5 mb-3 flex flex-wrap items-center gap-2 rounded-[var(--md-radius-lg)] bg-[var(--md-accent-a08)] px-3 py-2 text-[12px] text-[var(--md-ink)]">
              <span className="min-w-0 truncate">
                {t(changedDefinition.label)} · {t("saved")}
              </span>
              <Button
                type="button"
                variant="ghost"
                onClick={undo}
                className="ms-auto h-7 rounded-[var(--md-radius-md)] px-2 text-[12px] font-medium text-[var(--md-accent)] hover:bg-[var(--md-accent-a10)]"
              >
                {t("Undo")}
              </Button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="divide-y divide-[var(--md-line)] shadow-[var(--md-stroke-top)]">
        <AnimatePresence initial={false} mode="popLayout">
          {groups.map(({ group, items }) => {
            const GroupIcon = group.icon

            return (
              <motion.section
                key={group.id}
                layout={!shouldReduceMotion}
                initial={shouldReduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={shouldReduceMotion ? undefined : { opacity: 0 }}
                transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.fast)}
              >
                <header className="flex items-start gap-2.5 px-5 pb-1 pt-4">
                  <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-[var(--md-radius-md)] bg-[var(--md-accent-a08)] text-[var(--md-accent)]">
                    <GroupIcon className="size-3.5" strokeWidth={1.4} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-[12px] font-medium uppercase tracking-[0.07em] text-[var(--md-text)]">{t(group.label)}</h3>
                    <p className="mt-0.5 text-[12px] leading-5 text-[var(--md-subtle)]">{t(group.description)}</p>
                  </div>
                </header>
                <div>
                  {items.map((definition, index) => (
                    <ShortcutRow
                      key={definition.id}
                      definition={definition}
                      binding={bindings[definition.id] ?? null}
                      customised={isShortcutCustomised(definition.id)}
                      recording={recording}
                      index={index}
                      onStartRecording={() => setRecording({ shortcutId: definition.id, steps: [] })}
                      onStepsChange={(steps) => setRecording({ shortcutId: definition.id, steps })}
                      onCommit={(binding) => commit(definition.id, binding)}
                      onCancel={() => setRecording(null)}
                      onReset={() => {
                        resetShortcutBinding(definition.id)
                        setLastChange(null)
                      }}
                      onDisable={() => commit(definition.id, null)}
                    />
                  ))}
                </div>
              </motion.section>
            )
          })}
        </AnimatePresence>
      </div>

      {totalMatches === 0 ? (
        <p className="px-5 py-8 text-center text-[13px] text-[var(--md-text)]">{t("No shortcut matches this search.")}</p>
      ) : null}

      <p className="px-5 py-4 text-[11.5px] leading-5 text-[var(--md-subtle)]">
        {t("Sequences are recorded by pressing two plain keys in a row. Hold the modifier and double-click inside the recorder to record a mouse gesture instead.")}
        {" "}
        {t("Every change saves to your Multideck profile straight away, so your shortcuts follow you to any browser you sign in from.")}
      </p>
    </div>
  )
}
