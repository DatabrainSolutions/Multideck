import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import {
  Bell,
  CirclePause,
  CirclePlay,
  Filter,
  GripVertical,
  ListPlus,
  Mail,
  Maximize2,
  Minimize2,
  Minus,
  Pencil,
  Plus,
  SquareCheck,
  Trash2,
  TriangleAlert,
  UserRoundCheck,
  Workflow,
  Zap,
  type LucideIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { DexterActionPill } from "@/components/multideck/dexter-action-pill"
import { useLanguage } from "@/i18n/language-provider"
import { mdMotion } from "@/lib/motion"
import {
  AUTOMATION_ACTION_LABELS,
  AUTOMATION_CONDITION_LABELS,
  isExternalAction,
  type AutomationAction,
  type AutomationActionKind,
  type AutomationCondition,
  type ContactCard,
} from "@/data/contact-card-data"
import { cn } from "@/lib/utils"

const MIN_ZOOM = 0.5
const MAX_ZOOM = 1.4
/** Node box plus the connector beneath it. Reorder maths counts in these. */
const STEP_HEIGHT = 116

export const ACTION_ICONS: Record<AutomationActionKind, LucideIcon> = {
  "assign-owner": UserRoundCheck,
  "pipeline-stage": Workflow,
  "add-to-list": ListPlus,
  "create-task": SquareCheck,
  "notify-user": Bell,
  "send-email": Mail,
}

export type StepGroup = "trigger" | "condition" | "action"

export type FlowStep = {
  id: string
  group: StepGroup
  title: string
  eyebrow: string
  icon: LucideIcon
  enabled: boolean
  external: boolean
}

export function buildSteps(card: ContactCard): FlowStep[] {
  return [
    {
      id: "trigger",
      group: "trigger",
      title: "Someone shares their details on this card",
      eyebrow: "When",
      icon: Zap,
      enabled: true,
      external: false,
    },
    ...card.automation.conditions.map<FlowStep>((condition) => ({
      id: condition.id,
      group: "condition",
      title: AUTOMATION_CONDITION_LABELS[condition.kind].describe(condition),
      eyebrow: "Only if",
      icon: Filter,
      enabled: condition.enabled,
      external: false,
    })),
    ...card.automation.actions.map<FlowStep>((action) => ({
      id: action.id,
      group: "action",
      title: AUTOMATION_ACTION_LABELS[action.kind].describe(action),
      eyebrow: AUTOMATION_ACTION_LABELS[action.kind].label,
      icon: ACTION_ICONS[action.kind],
      enabled: action.enabled,
      external: isExternalAction(action),
    })),
  ]
}

/* -------------------------------------------------------------------------- */
/* Insert menu                                                                 */
/* -------------------------------------------------------------------------- */

const ACTION_MENU: { kind: AutomationActionKind; label: string; hint: string }[] = [
  { kind: "assign-owner", label: "Assign an owner", hint: "Give the lead to someone" },
  { kind: "pipeline-stage", label: "Add to a pipeline", hint: "Put it in a stage" },
]

/**
 * The insertion point between two steps.
 *
 * This is the main way steps get added: the person building the automation
 * points at the place they want something to happen, rather than dropping a box
 * on a canvas and hoping it connects.
 */
function InsertPoint({
  onAddCondition,
  onAddAction,
  active,
  compact = false,
}: {
  onAddCondition?: () => void
  onAddAction: (kind: AutomationActionKind) => void
  active: boolean
  compact?: boolean
}) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)

  return (
    <div className={cn("relative flex flex-col items-center", compact ? "h-5" : "h-10")}>
      <span aria-hidden="true" className="absolute inset-y-0 w-px bg-[rgba(11,20,19,0.14)]" />

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={t("Add a step here")}
            className={cn(
              "relative grid size-6 place-items-center rounded-full bg-[var(--md-surface)] text-[var(--md-subtle)] shadow-[var(--md-shadow-line)]",
              "transition-[opacity,transform,color,box-shadow] duration-[200ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
              "hover:scale-110 hover:text-[var(--md-accent)] hover:shadow-[var(--md-shadow-soft)]",
              "focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a22)]",
              "motion-reduce:transition-none motion-reduce:hover:scale-100",
              compact ? "mt-[-2px]" : "mt-2",
              open || active ? "scale-110 text-[var(--md-accent)] opacity-100" : "opacity-0 group-hover/flow:opacity-100",
            )}
          >
            <Plus className="size-3.5" strokeWidth={2} />
          </button>
        </PopoverTrigger>

        <PopoverContent align="center" className="w-[268px] p-1.5">
          <p className="px-2 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--md-subtle)]">{t("Add a step")}</p>

          {onAddCondition ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  onAddCondition()
                }}
                className="flex w-full items-start gap-2.5 rounded-[var(--md-radius-md)] px-2 py-2 text-start transition-colors duration-[140ms] hover:bg-[var(--md-surface-tint)] focus-visible:bg-[var(--md-surface-tint)] focus-visible:outline-none motion-reduce:transition-none"
              >
                <Filter className="mt-0.5 size-4 shrink-0 text-[var(--md-subtle)]" strokeWidth={1.5} />
                <span className="min-w-0">
                  <span className="block text-[13px] text-[var(--md-ink)]">{t("Only continue if…")}</span>
                  <span className="block text-[11.5px] text-[var(--md-subtle)]">{t("Skip the rest unless something is true")}</span>
                </span>
              </button>
              <div aria-hidden="true" className="my-1 h-px bg-[rgba(11,20,19,0.07)]" />
            </>
          ) : null}

          {ACTION_MENU.map((item) => {
            const Icon = ACTION_ICONS[item.kind]
            return (
              <button
                key={item.kind}
                type="button"
                onClick={() => {
                  setOpen(false)
                  onAddAction(item.kind)
                }}
                className="flex w-full items-start gap-2.5 rounded-[var(--md-radius-md)] px-2 py-2 text-start transition-colors duration-[140ms] hover:bg-[var(--md-surface-tint)] focus-visible:bg-[var(--md-surface-tint)] focus-visible:outline-none motion-reduce:transition-none"
              >
                <Icon className="mt-0.5 size-4 shrink-0 text-[var(--md-subtle)]" strokeWidth={1.5} />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-[13px] text-[var(--md-ink)]">
                    {t(item.label)}
                    {item.kind === "send-email" ? <TriangleAlert className="size-3 text-[var(--md-amber)]" strokeWidth={1.8} /> : null}
                  </span>
                  <span className="block text-[11.5px] text-[var(--md-subtle)]">{t(item.hint)}</span>
                </span>
              </button>
            )
          })}
        </PopoverContent>
      </Popover>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Step card                                                                   */
/* -------------------------------------------------------------------------- */

function StepCard({
  step,
  index,
  dragging,
  offset,
  onDragStart,
  onEdit,
  onToggle,
  onRemove,
}: {
  step: FlowStep
  index: number | null
  dragging: boolean
  offset: number
  onDragStart: (event: React.PointerEvent) => void
  onEdit: () => void
  onToggle: () => void
  onRemove: () => void
}) {
  const { t } = useLanguage()
  const Icon = step.icon
  const isTrigger = step.group === "trigger"

  return (
    <motion.div
      layout={!dragging}
      transition={mdMotion.spring}
      style={dragging ? { y: offset, zIndex: 30 } : undefined}
      className={cn("relative w-full", dragging && "pointer-events-none")}
    >
      <motion.div
        animate={dragging ? { scale: 1.025 } : { scale: 1 }}
        transition={mdMotion.spring}
        className={cn(
          "group/step flex min-h-[76px] items-center gap-3 rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] px-3.5 py-3",
          "transition-[box-shadow,opacity] duration-[200ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
          dragging ? "shadow-[var(--md-shadow-lift)]" : "shadow-[var(--md-shadow-soft)] hover:shadow-[var(--md-shadow-lift)]",
          !step.enabled && "opacity-60",
        )}
      >
        {isTrigger ? (
          <span className="grid size-8 shrink-0 place-items-center rounded-[var(--md-radius-md)] bg-[var(--md-accent-a12)] text-[var(--md-accent)]">
            <Icon className="size-4" strokeWidth={1.5} />
          </span>
        ) : (
          <button
            type="button"
            aria-label={`${t("Reorder")}: ${step.title}`}
            onPointerDown={onDragStart}
            className={cn(
              "grid size-8 shrink-0 cursor-grab touch-none place-items-center rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] text-[var(--md-subtle)]",
              "transition-colors duration-[160ms] hover:text-[var(--md-ink)] active:cursor-grabbing",
              "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a22)] motion-reduce:transition-none",
            )}
          >
            <GripVertical className="size-4" strokeWidth={1.5} />
          </button>
        )}

        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--md-subtle)]">
            {index !== null ? <span className="tabular-nums">{index}</span> : null}
            <span className="truncate">{step.eyebrow}</span>
            {step.external ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-[var(--md-radius-sm)] bg-[rgba(221,138,43,0.14)] px-1.5 py-0.5 text-[10px] normal-case tracking-normal text-[var(--md-amber)]">
                <TriangleAlert className="size-3" strokeWidth={1.8} />
                {t("Reaches the lead")}
              </span>
            ) : null}
            {!step.enabled ? (
              <span className="shrink-0 rounded-[var(--md-radius-sm)] bg-[rgba(90,103,100,0.1)] px-1.5 py-0.5 text-[10px] normal-case tracking-normal text-[var(--md-text)]">
                {t("Paused")}
              </span>
            ) : null}
          </p>
          <p className="mt-1 text-[14px] leading-[1.35] text-[var(--md-ink)]">{step.title}</p>
        </div>

        {!isTrigger ? (
          // Revealed on hover and whenever anything inside has focus, so the
          // controls are reachable without a pointer.
          <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-[160ms] group-hover/step:opacity-100 group-focus-within/step:opacity-100 [@media(hover:none)]:opacity-100 motion-reduce:transition-none">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8 rounded-[var(--md-radius-md)] text-[var(--md-subtle)] hover:text-[var(--md-ink)]" aria-label={`${t("Edit")}: ${step.title}`} onClick={onEdit}>
                  <Pencil className="size-3.5" strokeWidth={1.5} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("Edit")}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8 rounded-[var(--md-radius-md)] text-[var(--md-subtle)] hover:text-[var(--md-ink)]" aria-label={step.enabled ? t("Pause this step") : t("Resume this step")} onClick={onToggle}>
                  {step.enabled ? <CirclePause className="size-3.5" strokeWidth={1.5} /> : <CirclePlay className="size-3.5" strokeWidth={1.5} />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{step.enabled ? t("Pause this step") : t("Resume this step")}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8 rounded-[var(--md-radius-md)] text-[var(--md-subtle)] hover:bg-[rgba(209,78,78,0.1)] hover:text-[var(--md-red)]" aria-label={`${t("Remove")}: ${step.title}`} onClick={onRemove}>
                  <Trash2 className="size-3.5" strokeWidth={1.5} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("Remove")}</TooltipContent>
            </Tooltip>
          </div>
        ) : null}
      </motion.div>
    </motion.div>
  )
}

/* -------------------------------------------------------------------------- */
/* Canvas                                                                      */
/* -------------------------------------------------------------------------- */

export function AutomationCanvas({
  card,
  onEditCondition,
  onEditAction,
  onAddCondition,
  onAddAction,
  onToggleStep,
  onRemoveStep,
  onReorder,
  onAskDexter,
  className,
}: {
  card: ContactCard
  onEditCondition: (condition: AutomationCondition) => void
  onEditAction: (action: AutomationAction) => void
  onAddCondition?: (index: number) => void
  onAddAction: (kind: AutomationActionKind, index: number) => void
  onToggleStep: (id: string) => void
  onRemoveStep: (id: string) => void
  onReorder: (group: "condition" | "action", from: number, to: number) => void
  onAskDexter?: () => void
  className?: string
}) {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()

  const steps = useMemo(() => buildSteps(card), [card])
  const viewportRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  const viewRef = useRef({ x: 0, y: 0, zoom: 1 })
  const [zoomLabel, setZoomLabel] = useState(100)
  const [expanded, setExpanded] = useState(false)
  const [panning, setPanning] = useState(false)

  /** Live drag state; the preview order is what the list renders while dragging. */
  const [drag, setDrag] = useState<{ id: string; group: "condition" | "action"; from: number; to: number; offset: number } | null>(null)

  const conditions = card.automation.conditions
  const actions = card.automation.actions

  const applyView = useCallback(() => {
    const view = viewRef.current
    if (contentRef.current) contentRef.current.style.transform = `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.zoom})`
  }, [])

  const setView = useCallback(
    (next: { x: number; y: number; zoom: number }) => {
      viewRef.current = { ...next, zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next.zoom)) }
      applyView()
    },
    [applyView],
  )

  const animateZoom = useCallback(
    (targetZoom: number) => {
      const start = viewRef.current.zoom
      const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, targetZoom))
      if (shouldReduceMotion) {
        setView({ ...viewRef.current, zoom: clamped })
        setZoomLabel(Math.round(clamped * 100))
        return
      }

      const startedAt = performance.now()
      const tick = (now: number) => {
        const progress = Math.min(1, (now - startedAt) / 280)
        // Decelerating ramp: quick to leave, soft to land.
        const eased = 1 - (1 - progress) ** 3
        setView({ ...viewRef.current, zoom: start + (clamped - start) * eased })
        if (progress < 1) requestAnimationFrame(tick)
        else setZoomLabel(Math.round(clamped * 100))
      }
      requestAnimationFrame(tick)
    },
    [setView, shouldReduceMotion],
  )

  /** Pinch to zoom; a plain wheel is left alone so the page keeps scrolling. */
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return undefined

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      const view = viewRef.current
      const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom * (1 - event.deltaY * 0.0022)))
      setView({ ...view, zoom: nextZoom })
      setZoomLabel(Math.round(nextZoom * 100))
    }

    viewport.addEventListener("wheel", onWheel, { passive: false })
    return () => viewport.removeEventListener("wheel", onWheel)
  }, [setView])

  useEffect(() => {
    if (!expanded) return undefined
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [expanded])

  function beginPan(event: React.PointerEvent) {
    if (event.button !== 0 || drag) return
    const start = { x: event.clientX, y: event.clientY }
    const origin = { ...viewRef.current }
    setPanning(true)

    let frame: number | null = null
    let latest = start

    const move = (moveEvent: PointerEvent) => {
      latest = { x: moveEvent.clientX, y: moveEvent.clientY }
      if (frame !== null) return
      frame = requestAnimationFrame(() => {
        frame = null
        setView({ ...viewRef.current, x: origin.x + (latest.x - start.x), y: origin.y + (latest.y - start.y) })
      })
    }

    const end = () => {
      if (frame !== null) cancelAnimationFrame(frame)
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", end)
      setPanning(false)
    }

    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", end)
  }

  /**
   * Reordering is constrained to the step's own group: an action cannot be
   * dragged above the conditions that gate it, so an invalid automation is not
   * something the interface will let you build in the first place.
   */
  function beginDrag(event: React.PointerEvent, id: string, group: "condition" | "action", from: number, count: number) {
    event.preventDefault()
    event.stopPropagation()
    const startY = event.clientY
    const zoom = viewRef.current.zoom
    setDrag({ id, group, from, to: from, offset: 0 })

    let frame: number | null = null
    let latestTo = from
    let latestOffset = 0

    const move = (moveEvent: PointerEvent) => {
      const delta = (moveEvent.clientY - startY) / zoom
      const slots = Math.round(delta / STEP_HEIGHT)
      latestTo = Math.min(count - 1, Math.max(0, from + slots))
      latestOffset = delta - (latestTo - from) * STEP_HEIGHT

      if (frame !== null) return
      frame = requestAnimationFrame(() => {
        frame = null
        setDrag((current) => (current ? { ...current, to: latestTo, offset: latestOffset } : current))
      })
    }

    const end = () => {
      if (frame !== null) cancelAnimationFrame(frame)
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", end)
      window.removeEventListener("pointercancel", end)
      setDrag(null)
      if (latestTo !== from) onReorder(group, from, latestTo)
    }

    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", end)
    window.addEventListener("pointercancel", end)
  }

  /** Apply the in-flight drag so neighbours shift while the pointer is down. */
  function previewOrder<T extends { id: string }>(items: T[], group: "condition" | "action") {
    if (!drag || drag.group !== group || drag.from === drag.to) return items
    const next = [...items]
    const [moved] = next.splice(drag.from, 1)
    next.splice(drag.to, 0, moved)
    return next
  }

  const orderedConditions = previewOrder(conditions, "condition")
  const orderedActions = previewOrder(actions, "action")

  const stepById = useMemo(() => new Map(steps.map((step) => [step.id, step])), [steps])
  const trigger = steps[0]

  const canvasBody = (
    <div
      ref={viewportRef}
      onPointerDown={beginPan}
      className={cn(
        "md-automation-canvas relative w-full touch-none overflow-hidden bg-[var(--md-surface-soft)]",
        expanded ? "h-full rounded-none" : "h-[clamp(560px,72vh,900px)] rounded-[var(--md-radius-xl)] shadow-[var(--md-shadow-line)]",
        panning ? "cursor-grabbing" : "cursor-grab",
      )}
    >
      <div
        ref={contentRef}
        className="absolute left-1/2 top-0 w-[420px] -translate-x-1/2 origin-top will-change-transform"
        style={{ transform: "translate3d(0px, 0px, 0) scale(1)" }}
      >
        <div className="group/flow px-2 pb-32 pt-9" onPointerDown={(event) => event.stopPropagation()}>
          <StepCard
            step={trigger}
            index={null}
            dragging={false}
            offset={0}
            onDragStart={() => undefined}
            onEdit={() => undefined}
            onToggle={() => undefined}
            onRemove={() => undefined}
          />

          <InsertPoint active={false} onAddCondition={onAddCondition ? () => onAddCondition(0) : undefined} onAddAction={(kind) => onAddAction(kind, 0)} />

          {orderedConditions.length > 0 ? (
            <p className="pb-1.5 text-center text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--md-subtle)]">
              {t("Only carry on if")}
              {orderedConditions.length > 1 ? ` · ${t("all must match")}` : ""}
            </p>
          ) : null}

          <AnimatePresence initial={false} mode="popLayout">
            {orderedConditions.map((condition, index) => {
              const step = stepById.get(condition.id)
              if (!step) return null
              const isDragging = drag?.id === condition.id

              return (
                <motion.div
                  key={condition.id}
                  layout
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={mdMotion.spring}
                >
                  <StepCard
                    step={step}
                    index={null}
                    dragging={isDragging}
                    offset={isDragging ? drag.offset : 0}
                    onDragStart={(event) => beginDrag(event, condition.id, "condition", index, orderedConditions.length)}
                    onEdit={() => onEditCondition(condition)}
                    onToggle={() => onToggleStep(condition.id)}
                    onRemove={() => onRemoveStep(condition.id)}
                  />
                  <InsertPoint
                    active={false}
                    onAddCondition={onAddCondition ? () => onAddCondition(index + 1) : undefined}
                    onAddAction={(kind) => onAddAction(kind, 0)}
                  />
                </motion.div>
              )
            })}
          </AnimatePresence>

          <p className="pb-1.5 text-center text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--md-subtle)]">{t("Then, in order")}</p>

          <AnimatePresence initial={false} mode="popLayout">
            {orderedActions.map((action, index) => {
              const step = stepById.get(action.id)
              if (!step) return null
              const isDragging = drag?.id === action.id

              return (
                <motion.div
                  key={action.id}
                  layout
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={mdMotion.spring}
                >
                  <StepCard
                    step={step}
                    index={index + 1}
                    dragging={isDragging}
                    offset={isDragging ? drag.offset : 0}
                    onDragStart={(event) => beginDrag(event, action.id, "action", index, orderedActions.length)}
                    onEdit={() => onEditAction(action)}
                    onToggle={() => onToggleStep(action.id)}
                    onRemove={() => onRemoveStep(action.id)}
                  />
                  <InsertPoint
                    active={index === orderedActions.length - 1}
                    onAddCondition={onAddCondition ? () => onAddCondition(conditions.length) : undefined}
                    onAddAction={(kind) => onAddAction(kind, index + 1)}
                  />
                </motion.div>
              )
            })}
          </AnimatePresence>

          {orderedActions.length === 0 ? (
            <div className="rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-5 text-center shadow-[var(--md-shadow-line)]">
              <p className="text-[13.5px] text-[var(--md-ink)]">{t("Nothing happens yet")}</p>
              <p className="mx-auto mt-1 max-w-[30ch] text-[12.5px] leading-5 text-[var(--md-subtle)]">
                {t("Use the + between steps to say what should happen, or ask Dexter to draft it for you.")}
              </p>
            </div>
          ) : null}
        </div>
      </div>

      {/* Controls float above the flow and never scroll with it. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3">
        <div className="pointer-events-auto">
          {onAskDexter ? <DexterActionPill onClick={onAskDexter} label={t("Ask Dexter to build this")} className="min-w-0" /> : null}
        </div>

        <div className="pointer-events-auto flex items-center gap-1 rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] p-1 shadow-[var(--md-shadow-soft)]">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8 rounded-[var(--md-radius-md)]" aria-label={t("Zoom out")} onClick={() => animateZoom(viewRef.current.zoom / 1.2)}>
                <Minus className="size-4" strokeWidth={1.5} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("Zoom out")}</TooltipContent>
          </Tooltip>

          <span className="min-w-[46px] text-center text-[12px] text-[var(--md-text)] tabular-nums">{zoomLabel}%</span>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8 rounded-[var(--md-radius-md)]" aria-label={t("Zoom in")} onClick={() => animateZoom(viewRef.current.zoom * 1.2)}>
                <Plus className="size-4" strokeWidth={1.5} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("Zoom in")}</TooltipContent>
          </Tooltip>

          <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-[rgba(11,20,19,0.08)]" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 rounded-[var(--md-radius-md)]"
                aria-label={expanded ? t("Exit full screen") : t("Full screen")}
                onClick={() => {
                  setExpanded((value) => !value)
                  setView({ x: 0, y: 0, zoom: 1 })
                  setZoomLabel(100)
                }}
              >
                {expanded ? <Minimize2 className="size-4" strokeWidth={1.5} /> : <Maximize2 className="size-4" strokeWidth={1.5} />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{expanded ? t("Exit full screen") : t("Full screen")}</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  )

  return (
    <div className={className}>
      {expanded ? (
        <>
          <div className="h-[clamp(560px,72vh,900px)] rounded-[var(--md-radius-xl)] bg-[var(--md-surface-soft)] shadow-[var(--md-shadow-line)]" aria-hidden="true" />
          <motion.div
            initial={shouldReduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2, ease: mdMotion.enter.ease }}
            className="fixed inset-0 z-50 bg-[var(--md-bg)] p-3"
            role="dialog"
            aria-modal="true"
            aria-label={t("Automation builder")}
          >
            <div className="h-full overflow-hidden rounded-[var(--md-radius-2xl)] shadow-[var(--md-shadow-lift)]">{canvasBody}</div>
          </motion.div>
        </>
      ) : (
        canvasBody
      )}

      <p className="mt-2 text-[12px] leading-5 text-[var(--md-subtle)]">
        {t("Hover between steps and press + to add one. Drag a step by its handle to reorder it. Pinch to zoom, drag the background to pan.")}
      </p>
    </div>
  )
}
