import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react"
import {
  AnimatePresence,
  animate,
  motion,
  motionValue,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  useVelocity,
  type AnimationPlaybackControls,
  type MotionValue,
  type ValueAnimationTransition,
} from "motion/react"
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  FileCheck2,
  GripVertical,
  Handshake,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCcw,
  Save,
  Ship,
  Trash2,
  UserRoundCheck,
  Zap,
  type LucideIcon,
} from "@/components/icons/hugeicons"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { useLanguage } from "@/i18n/language-provider"
import { mdMotion, reduceMotion } from "@/lib/motion"
import { cn } from "@/lib/utils"
import { crmPipelineBoards, type StatusTone } from "@/data/multideck-data"
import { Surface } from "./surface"
import { toneToVar } from "./status-pill"

/**
 * Pipelines saved on the server carry an id; the gallery previews pass plain objects without one.
 * A missing id means the row has never been persisted, so the editor treats it as a local draft.
 */
export type CrmPipelineEditorSource = {
  id?: string
  name: string
  owner: string
  defaultStage: string
  conversionStage: string
  automation: string
  stages: readonly {
    id?: string
    name: string
    tone: StatusTone
    rule: string
    probability?: number
  }[]
}

export type CrmPipelineEditorSave = {
  id: string | null
  name: string
  owner: string
  automation: string
  stages: {
    id: string | null
    name: string
    tone: StatusTone
    rule: string
    probability: number
    isDefaultEntry: boolean
    isConversion: boolean
  }[]
}

type EditableStage = {
  id: string
  /** The persisted row this stage maps to, or null while it only exists in the browser. */
  serverId: string | null
  name: string
  tone: StatusTone
  rule: string
  probability: number
  dealCount: number
  isDefaultEntry: boolean
  isConversion: boolean
}

type EditablePipeline = {
  id: string
  serverId: string | null
  name: string
  owner: string
  automation: string
  stages: EditableStage[]
}

type PipelineTemplate = {
  id: string
  name: string
  description: string
  icon: LucideIcon
  stages: readonly {
    name: string
    tone: StatusTone
    rule: string
    probability: number
    isDefaultEntry?: boolean
    isConversion?: boolean
  }[]
}

const pipelineTemplates: readonly PipelineTemplate[] = [
  {
    id: "freight-opportunity",
    name: "Freight opportunity",
    description: "Move a new shipping enquiry from qualification and pricing through to a confirmed customer.",
    icon: Ship,
    stages: [
      { name: "New enquiry", tone: "blue", rule: "A new freight enquiry has been received.", probability: 10, isDefaultEntry: true },
      { name: "Qualified", tone: "teal", rule: "Route, volume, timing, and decision-maker are understood.", probability: 25 },
      { name: "Rates secured", tone: "amber", rule: "Carrier and supplier costs are ready for pricing.", probability: 50 },
      { name: "Quote sent", tone: "blue", rule: "The customer has received a complete freight quote.", probability: 75 },
      { name: "Negotiation", tone: "amber", rule: "Commercial terms or service details are being agreed.", probability: 90 },
      { name: "Won", tone: "green", rule: "The customer has accepted and the opportunity can convert.", probability: 100, isConversion: true },
    ],
  },
  {
    id: "rfq-tender",
    name: "RFQ and tender",
    description: "Coordinate a structured bid where pricing, compliance, and internal approval happen in parallel.",
    icon: FileCheck2,
    stages: [
      { name: "RFQ received", tone: "blue", rule: "A formal request for quotation or tender has arrived.", probability: 10, isDefaultEntry: true },
      { name: "Bid decision", tone: "teal", rule: "The opportunity has passed the bid or no-bid review.", probability: 25 },
      { name: "Solution design", tone: "blue", rule: "The operating model, routing, and service scope are defined.", probability: 50 },
      { name: "Pricing review", tone: "amber", rule: "Rates, margin, and commercial risk are approved.", probability: 75 },
      { name: "Submitted", tone: "teal", rule: "The complete response has been submitted to the customer.", probability: 90 },
      { name: "Awarded", tone: "green", rule: "The customer has awarded the freight business.", probability: 100, isConversion: true },
    ],
  },
  {
    id: "customer-onboarding",
    name: "Customer onboarding",
    description: "Turn a signed customer into an operationally ready account before the first live shipment.",
    icon: UserRoundCheck,
    stages: [
      { name: "Commercial handover", tone: "blue", rule: "The signed scope and customer commitments have been handed to operations.", probability: 10, isDefaultEntry: true },
      { name: "Credit and compliance", tone: "amber", rule: "Credit, KYC, customs, and compliance checks are complete.", probability: 25 },
      { name: "Operating profile", tone: "teal", rule: "Contacts, lanes, commodities, and handling requirements are captured.", probability: 50 },
      { name: "SOP agreed", tone: "blue", rule: "The customer and delivery team have approved the operating procedure.", probability: 75 },
      { name: "First shipment", tone: "amber", rule: "The first shipment is being monitored through delivery.", probability: 90 },
      { name: "Account live", tone: "green", rule: "The onboarding is complete and the account is in normal operation.", probability: 100, isConversion: true },
    ],
  },
  {
    id: "account-renewal",
    name: "Account renewal",
    description: "Review service, protect margin, and secure the next commercial period for an existing account.",
    icon: Handshake,
    stages: [
      { name: "Renewal due", tone: "blue", rule: "The account has entered its renewal review window.", probability: 10, isDefaultEntry: true },
      { name: "Performance review", tone: "teal", rule: "Service, volume, exceptions, and account health have been reviewed.", probability: 25 },
      { name: "Commercial review", tone: "amber", rule: "Rates, margin, and revised terms are being prepared.", probability: 50 },
      { name: "Proposal sent", tone: "blue", rule: "The renewal proposal has been issued to the customer.", probability: 75 },
      { name: "Terms agreed", tone: "teal", rule: "The customer has agreed the renewed commercial terms.", probability: 90 },
      { name: "Renewed", tone: "green", rule: "The new commercial period is confirmed and active.", probability: 100, isConversion: true },
    ],
  },
  {
    id: "customer-reactivation",
    name: "Customer reactivation",
    description: "Bring a lapsed freight customer back through a focused relationship and opportunity journey.",
    icon: RefreshCcw,
    stages: [
      { name: "Lapsed account", tone: "neutral", rule: "An inactive customer has been selected for reactivation.", probability: 10, isDefaultEntry: true },
      { name: "Reconnected", tone: "blue", rule: "A current contact has re-engaged with the team.", probability: 25 },
      { name: "Needs reviewed", tone: "teal", rule: "Current lanes, service needs, and previous issues are understood.", probability: 50 },
      { name: "New opportunity", tone: "amber", rule: "A credible new freight requirement has been identified.", probability: 75 },
      { name: "Quote sent", tone: "blue", rule: "A new commercial proposal has been sent.", probability: 90 },
      { name: "Reactivated", tone: "green", rule: "The customer has placed new business and returned to active status.", probability: 100, isConversion: true },
    ],
  },
]

/** Slots are uniform, so a stage's resting position is always an exact multiple of the pitch. */
const CARD_WIDTH = 248
const CARD_GAP = 26
const CARD_PITCH = CARD_WIDTH + CARD_GAP
const CARD_HEIGHT = 142
const RAIL_PAD_Y = 26

/** Stops a card oscillating between two slots while the pointer sits on a boundary. */
const SLOT_HYSTERESIS = 0.16
const EDGE_RESISTANCE = 26
const MAX_TILT_VELOCITY = 2600
const ACTIVATION_DISTANCE = 6
const AUTOSCROLL_EDGE = 96
const AUTOSCROLL_PEAK = 20
const AUTOSCROLL_RAMP_MS = 220

/** Fast attack on pick-up, slower release on drop. The asymmetry is what makes the lift read as weight. */
const liftSpring = { type: "spring" as const, stiffness: 760, damping: 26, mass: 0.5 }
const releaseSpring = { type: "spring" as const, stiffness: 300, damping: 32, mass: 0.8 }
const shiftSpring = { type: "spring" as const, stiffness: 520, damping: 44, mass: 0.85 }
const dropSpring = { type: "spring" as const, stiffness: 360, damping: 36, mass: 0.9 }
const tetherSpring = { type: "spring" as const, stiffness: 420, damping: 38, mass: 0.7 }
const enterSpring = { type: "spring" as const, stiffness: 440, damping: 38, mass: 0.8 }
const exitTween = { duration: 0.22, ease: [0.4, 0, 1, 1] as const }
const instant = { duration: 0 }

const probabilitySteps = [0, 10, 25, 50, 75, 90, 100]
const toneOptions: StatusTone[] = ["blue", "teal", "amber", "green", "red", "neutral"]

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

/** Logarithmic falloff so dragging past either end resists instead of stopping dead. */
function withEdgeResistance(value: number, min: number, max: number) {
  if (value < min) return min - EDGE_RESISTANCE * Math.log1p((min - value) / EDGE_RESISTANCE)
  if (value > max) return max + EDGE_RESISTANCE * Math.log1p((value - max) / EDGE_RESISTANCE)
  return value
}

function moveItem<T>(items: T[], from: number, to: number) {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items
  const next = [...items]
  const [moving] = next.splice(from, 1)
  next.splice(to, 0, moving)
  return next
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "pipeline"
}

function stageProbability(index: number, total: number) {
  if (total <= 1) return 50
  const probabilityIndex = Math.round((index / (total - 1)) * (probabilitySteps.length - 1))
  return probabilitySteps[probabilityIndex]
}

function pipelineDraft(source: CrmPipelineEditorSource, pipelineIndex: number): EditablePipeline {
  const board = crmPipelineBoards.find((candidate) => candidate.name === source.name)

  return {
    id: source.id ?? `${slug(source.name)}-${pipelineIndex}`,
    serverId: source.id ?? null,
    name: source.name,
    owner: source.owner,
    automation: source.automation,
    stages: source.stages.map((stage, stageIndex) => ({
      id: stage.id ?? `${slug(source.name)}-${slug(stage.name)}-${stageIndex}`,
      serverId: stage.id ?? null,
      name: stage.name,
      tone: stage.tone,
      rule: stage.rule,
      probability: stage.probability ?? stageProbability(stageIndex, source.stages.length),
      dealCount: board?.stages.find((candidate) => candidate.title === stage.name)?.deals.length ?? 0,
      // Kept per stage rather than looked up by name, so renaming the entry point or the
      // conversion trigger does not silently detach it.
      isDefaultEntry: stage.name === source.defaultStage,
      isConversion: stage.name === source.conversionStage,
    })),
  }
}

function sourceSignature(pipelines: readonly CrmPipelineEditorSource[]) {
  return pipelines
    .map((pipeline) => `${pipeline.id ?? pipeline.name}:${pipeline.stages.map((stage) => stage.id ?? stage.name).join(",")}`)
    .join("|")
}

function StageCard({
  stage,
  index,
  total,
  selected,
  held,
  lifted,
  renaming,
  dragging,
  x,
  rotate,
  presence,
  onRename,
  onStartRename,
  onEndRename,
  onKeyboardMove,
  onInsertBefore,
}: {
  stage: EditableStage
  index: number
  total: number
  selected: boolean
  held: boolean
  lifted: boolean
  renaming: boolean
  dragging: boolean
  x: MotionValue<number>
  rotate: MotionValue<number>
  presence: MotionValue<number>
  onRename: (name: string) => void
  onStartRename: () => void
  onEndRename: () => void
  onKeyboardMove: (direction: -1 | 1) => void
  onInsertBefore: () => void
}) {
  const { t } = useLanguage()
  const inputRef = useRef<HTMLInputElement>(null)
  const tone = toneToVar(stage.tone)

  const width = useTransform(presence, (value) => value * CARD_WIDTH)
  const marginEnd = useTransform(presence, (value) => value * CARD_GAP)
  const opacity = useTransform(presence, [0, 0.45, 1], [0, 0, 1])
  const scale = useTransform(presence, [0, 1], [0.92, 1])

  useEffect(() => {
    if (!renaming) return
    const input = inputRef.current
    if (!input) return
    input.focus()
    input.select()
  }, [renaming])

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.altKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      event.preventDefault()
      const forward = event.key === (document.documentElement.dir === "rtl" ? "ArrowLeft" : "ArrowRight")
      onKeyboardMove(forward ? 1 : -1)
      return
    }
    if (event.key === "F2" || (event.key === "Enter" && selected)) {
      event.preventDefault()
      onStartRename()
    }
  }

  return (
    <motion.li
      data-stage-slot={stage.id}
      className="relative shrink-0"
      style={{ width, marginInlineEnd: marginEnd, height: CARD_HEIGHT }}
    >
      <button
        type="button"
        data-no-drag=""
        tabIndex={-1}
        aria-label={t("Insert stage here")}
        title={t("Insert stage here")}
        onClick={onInsertBefore}
        className={cn(
          "group/insert absolute inset-y-0 z-20 grid w-[26px] place-items-center focus-visible:outline-none",
          "start-[-26px]",
          dragging && "pointer-events-none opacity-0",
        )}
      >
        <span className="h-[84px] w-px origin-center scale-y-0 rounded-full bg-[var(--md-accent)] opacity-0 transition-[transform,opacity] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/insert:scale-y-100 group-hover/insert:opacity-60 group-focus-visible/insert:scale-y-100 group-focus-visible/insert:opacity-60" />
        <span className="absolute grid size-[26px] scale-[0.55] place-items-center rounded-full bg-[var(--md-surface)] text-[var(--md-accent)] opacity-0 shadow-[var(--md-shadow-soft),inset_0_0_0_1px_color-mix(in_srgb,var(--md-accent)_28%,transparent)] transition-[transform,opacity] duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover/insert:scale-100 group-hover/insert:opacity-100 group-focus-visible/insert:scale-100 group-focus-visible/insert:opacity-100">
          <Plus className="size-4" strokeWidth={1.8} />
        </span>
      </button>

      <motion.div
        data-stage-card={stage.id}
        className="absolute inset-y-0 start-0"
        style={{ width: CARD_WIDTH, x, rotate: held ? rotate : 0, opacity, scale, zIndex: held ? 30 : 1 }}
      >
        <motion.div
          className="size-full"
          animate={{ scale: lifted ? 1.028 : 1 }}
          transition={lifted ? liftSpring : releaseSpring}
          style={{ willChange: held ? "transform" : undefined }}
        >
          <div
            role="button"
            tabIndex={0}
            aria-pressed={selected}
            aria-label={`${t("Stage")} ${index + 1} ${t("of")} ${total}: ${t(stage.name)}`}
            onKeyDown={handleKeyDown}
            className={cn(
              "group/card relative flex size-full touch-pan-y select-none flex-col overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-3.5 text-start",
              "shadow-[var(--md-shadow-line)] transition-[box-shadow,transform] duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
              "focus-visible:outline-none focus-visible:shadow-[var(--md-shadow-line),0_0_0_3px_color-mix(in_srgb,var(--md-accent)_22%,transparent)]",
              held ? "cursor-grabbing shadow-[var(--md-shadow-lift)]" : "cursor-grab hover:-translate-y-[3px] hover:shadow-[var(--md-shadow-soft)]",
            )}
            style={{ "--md-stage-tone": tone } as CSSProperties}
          >
            <motion.span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-[var(--md-radius-xl)] shadow-[inset_0_0_0_1.5px_var(--md-accent)]"
              initial={false}
              animate={{ opacity: selected ? 1 : 0, scale: selected ? 1 : 1.015 }}
              transition={selected ? liftSpring : releaseSpring}
            />

            <span className="relative flex items-center gap-2">
              <span
                className="grid size-6 place-items-center rounded-[var(--md-radius-md)] text-[11px] font-medium text-[var(--md-ink)]"
                style={{ background: "color-mix(in srgb, var(--md-stage-tone) 16%, var(--md-surface))" }}
                data-i18n-skip
                dir="ltr"
              >
                {index + 1}
              </span>
              <span className="flex-1" />
              <button
                type="button"
                data-no-drag=""
                tabIndex={-1}
                aria-label={`${t("Rename stage")}: ${t(stage.name)}`}
                title={t("Rename stage")}
                onClick={onStartRename}
                className="grid size-6 place-items-center rounded-[var(--md-radius-md)] text-[var(--md-subtle)] opacity-0 transition-[opacity,background,color] duration-150 hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] focus-visible:opacity-100 focus-visible:outline-none group-hover/card:opacity-100"
              >
                <Pencil className="size-3.5" strokeWidth={1.4} />
              </button>
              <span
                aria-hidden="true"
                className={cn(
                  "grid size-6 place-items-center rounded-[var(--md-radius-md)] text-[var(--md-subtle)] transition-opacity duration-150",
                  held ? "opacity-100" : "opacity-0 group-hover/card:opacity-100",
                )}
              >
                <GripVertical className="size-3.5" strokeWidth={1.4} />
              </span>
            </span>

            <span className="relative mt-3 block min-h-[40px]">
              {renaming ? (
                <input
                  ref={inputRef}
                  data-no-drag=""
                  dir="auto"
                  value={stage.name}
                  aria-label={t("Stage name")}
                  onChange={(event) => onRename(event.target.value)}
                  onBlur={onEndRename}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === "Escape") {
                      event.preventDefault()
                      onEndRename()
                    }
                  }}
                  className="w-full rounded-[var(--md-radius-md)] bg-[var(--md-field-bg)] px-1.5 py-0.5 text-[15px] font-medium text-[var(--md-ink)] outline-none ring-2 ring-[color-mix(in_srgb,var(--md-accent)_45%,transparent)]"
                />
              ) : (
                <span className="line-clamp-2 text-[15px] font-medium leading-5 text-[var(--md-ink)]">{t(stage.name)}</span>
              )}
            </span>

            <span className="relative mt-auto flex items-end justify-between gap-2">
              <span className="text-[12px] text-[var(--md-text)]">
                <span data-i18n-skip dir="ltr">{stage.dealCount}</span> {t(stage.dealCount === 1 ? "deal" : "deals")}
              </span>
              <span
                className="rounded-[var(--md-radius-md)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--md-ink)]"
                style={{ background: "color-mix(in srgb, var(--md-stage-tone) 13%, transparent)" }}
                data-i18n-skip
                dir="ltr"
              >
                {stage.probability}%
              </span>
            </span>

            <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[2px] bg-[var(--md-line)]">
              <motion.span
                className="absolute inset-y-0 start-0 rounded-full"
                style={{ background: tone }}
                initial={false}
                animate={{ width: `${Math.max(stage.probability, 2)}%` }}
                transition={shiftSpring}
              />
            </span>
          </div>
        </motion.div>
      </motion.div>
    </motion.li>
  )
}

function TonePicker({ value, onChange }: { value: StatusTone; onChange: (tone: StatusTone) => void }) {
  const { t } = useLanguage()

  return (
    <div role="radiogroup" aria-label={t("Stage colour")} className="mt-2 flex flex-wrap gap-1.5">
      {toneOptions.map((tone) => {
        const active = tone === value
        return (
          <button
            key={tone}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={t(`${tone} stage colour`)}
            onClick={() => onChange(tone)}
            className={cn(
              "grid size-8 place-items-center rounded-[var(--md-radius-md)] transition-[transform,box-shadow] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.08] active:scale-95 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_srgb,var(--md-accent)_20%,transparent)]",
              active ? "shadow-[inset_0_0_0_1.5px_var(--md-accent)]" : "shadow-[var(--md-shadow-line)]",
            )}
            style={{ background: `color-mix(in srgb, ${toneToVar(tone)} 24%, var(--md-surface))` }}
          >
            <AnimatePresence initial={false}>
              {active ? (
                <motion.span
                  key="check"
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.6, opacity: 0, transition: { duration: 0.1 } }}
                  transition={liftSpring}
                >
                  <Check className="size-3.5 text-[var(--md-ink)]" strokeWidth={2} />
                </motion.span>
              ) : null}
            </AnimatePresence>
          </button>
        )
      })}
    </div>
  )
}

function ProbabilityTrack({ value, onChange }: { value: number; onChange: (probability: number) => void }) {
  const { t, direction } = useLanguage()
  const trackRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const activeIndex = Math.max(0, probabilitySteps.indexOf(value))

  const stepFromPointer = useCallback(
    (clientX: number) => {
      const rect = trackRef.current?.getBoundingClientRect()
      if (!rect || rect.width === 0) return null
      const raw = (clientX - rect.left) / rect.width
      const ratio = direction === "rtl" ? 1 - raw : raw
      return probabilitySteps[clamp(Math.round(ratio * (probabilitySteps.length - 1)), 0, probabilitySteps.length - 1)]
    },
    [direction],
  )

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    draggingRef.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    const next = stepFromPointer(event.clientX)
    if (next !== null && next !== value) onChange(next)
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return
    const next = stepFromPointer(event.clientX)
    if (next !== null && next !== value) onChange(next)
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    draggingRef.current = false
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  return (
    <div
      ref={trackRef}
      role="radiogroup"
      aria-label={t("Win probability")}
      className="mt-2 grid touch-none grid-flow-col grid-rows-1 gap-0 rounded-[var(--md-radius-lg)] bg-[var(--md-field-bg)] p-[3px]"
      style={{ gridTemplateColumns: `repeat(${probabilitySteps.length}, minmax(0, 1fr))` }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <motion.span
        layout
        aria-hidden="true"
        transition={tetherSpring}
        className="z-0 h-7 rounded-[var(--md-radius-md)] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)]"
        style={{ gridRow: 1, gridColumn: activeIndex + 1 }}
      />
      {probabilitySteps.map((step, index) => (
        <button
          key={step}
          type="button"
          role="radio"
          aria-checked={step === value}
          onClick={() => onChange(step)}
          onKeyDown={(event) => {
            const forward = event.key === (direction === "rtl" ? "ArrowLeft" : "ArrowRight")
            const back = event.key === (direction === "rtl" ? "ArrowRight" : "ArrowLeft")
            if (!forward && !back) return
            event.preventDefault()
            onChange(probabilitySteps[clamp(index + (forward ? 1 : -1), 0, probabilitySteps.length - 1)])
          }}
          className={cn(
            "relative z-10 h-7 rounded-[var(--md-radius-md)] text-[11px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_srgb,var(--md-accent)_20%,transparent)]",
            step === value ? "text-[var(--md-ink)]" : index < activeIndex ? "text-[var(--md-text)]" : "text-[var(--md-subtle)]",
          )}
          style={{ gridRow: 1, gridColumn: index + 1 }}
          data-i18n-skip
          dir="ltr"
        >
          {step}
        </button>
      ))}
    </div>
  )
}

/**
 * The panel every editor state is delivered in. It leans up and unblurs on arrival, which matters
 * most when the editor is opened inside the pipeline settings drawer: the panel reads as coming in
 * with the drawer rather than appearing fully formed behind it.
 *
 * Keyed remounts rather than an AnimatePresence pair, because the skeleton is usually still easing
 * in when the load resolves. Handing over to an exit animation there can leave the interrupted panel
 * parked at zero opacity, and the state waiting behind it would never be mounted at all.
 */
function EditorPanel({ reduce, children }: { reduce: boolean; children: ReactNode }) {
  return (
    <motion.div
      className="min-w-0 max-w-full"
      initial={{ opacity: 0, y: 12, filter: "blur(7px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={reduceMotion(reduce, mdMotion.panel)}
    >
      {children}
    </motion.div>
  )
}

function PipelineTemplatesDialog({
  open,
  onOpenChange,
  onSelect,
  onCreateBlank,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (template: PipelineTemplate) => void
  onCreateBlank: () => void
}) {
  const { direction, t } = useLanguage()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir={direction}
        className="max-h-[calc(100dvh-32px)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden rounded-[var(--md-radius-xl)] border-0 bg-[var(--md-surface)] p-0 text-[var(--md-ink)] shadow-[var(--md-shadow-lift)] sm:max-w-[920px]"
      >
        <DialogHeader className="border-b border-[color-mix(in_srgb,var(--md-ink)_7%,transparent)] px-5 pb-4 pt-5 text-start sm:px-6 sm:pb-5 sm:pt-6">
          <div className="flex items-start gap-3 pe-10">
            <span className="grid size-10 shrink-0 place-items-center rounded-[var(--md-radius-lg)] bg-[color-mix(in_srgb,var(--md-accent)_12%,var(--md-surface))] text-[var(--md-accent)]">
              <Zap className="size-5" strokeWidth={1.4} />
            </span>
            <span>
              <DialogTitle className="text-[18px] font-medium leading-6">{t("Pipeline templates")}</DialogTitle>
              <DialogDescription className="mt-1 max-w-[620px] text-[13px] leading-5 text-[var(--md-text)]">
                {t("Start with a freight-forwarding workflow, then tailor the stages, rules, and probabilities to your team.")}
              </DialogDescription>
            </span>
          </div>
        </DialogHeader>

        <div className="md-scrollbar min-h-0 overflow-y-auto p-4 sm:p-5">
          <div className="grid gap-3 md:grid-cols-2">
            {pipelineTemplates.map((template) => {
              const Icon = template.icon
              return (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => onSelect(template)}
                  className="group/template min-w-0 rounded-[var(--md-radius-xl)] bg-[var(--md-surface-soft)] p-4 text-start shadow-[var(--md-shadow-line)] transition-[background-color,box-shadow,transform] duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:bg-[var(--md-surface-tint)] hover:shadow-[var(--md-shadow-soft)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_srgb,var(--md-accent)_22%,transparent)]"
                >
                  <span className="flex items-start gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] text-[var(--md-accent)] shadow-[var(--md-shadow-line)]">
                      <Icon className="size-[18px]" strokeWidth={1.35} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[14px] font-medium text-[var(--md-ink)]">{t(template.name)}</span>
                      <span className="mt-1 block text-[12px] leading-[18px] text-[var(--md-text)]">{t(template.description)}</span>
                    </span>
                  </span>
                  <span className="mt-4 flex min-w-0 items-center gap-1.5 overflow-hidden" aria-hidden="true">
                    {template.stages.map((stage, index) => (
                      <span key={`${template.id}-${stage.name}`} className="contents">
                        {index > 0 ? <span className="h-px min-w-1 flex-1 bg-[var(--md-line)]" /> : null}
                        <span
                          className="size-2.5 shrink-0 rounded-full shadow-[0_0_0_3px_var(--md-surface)]"
                          style={{ background: toneToVar(stage.tone) }}
                        />
                      </span>
                    ))}
                  </span>
                  <span className="mt-3 flex items-center justify-between gap-3 text-[11px] text-[var(--md-subtle)]">
                    <span><span data-i18n-skip dir="ltr">{template.stages.length}</span> {t("stages")}</span>
                    <span className="font-medium text-[var(--md-accent)] transition-transform duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/template:-translate-x-0.5 rtl:group-hover/template:translate-x-0.5">
                      {t("Use template")}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-[color-mix(in_srgb,var(--md-ink)_7%,transparent)] bg-[var(--md-surface-soft)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-[12px] leading-[18px] text-[var(--md-text)]">{t("Prefer to build your own stages? Start with a blank pipeline.")}</p>
          <Button variant="ghost" className="h-9 justify-center rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] px-3 text-[13px] font-medium shadow-[var(--md-shadow-line)]" onClick={onCreateBlank}>
            <Plus data-icon="inline-start" strokeWidth={1.2} />
            {t("Create blank pipeline")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function CrmPipelineEditor({
  pipelines,
  loading = false,
  error,
  onRetry,
  onSave,
  onDeletePipeline,
  onReorderPipelines,
  canEdit = true,
  addStageRequestKey = 0,
  stacked = false,
}: {
  pipelines: readonly CrmPipelineEditorSource[]
  loading?: boolean
  error?: string
  onRetry?: () => void
  /**
   * Persists the active pipeline and resolves with the id it was saved under, so a draft created in
   * the browser can adopt the identifier the workspace assigned it. Without this the editor keeps
   * changes in the browser only.
   */
  onSave?: (pipeline: CrmPipelineEditorSave) => Promise<string | void>
  /** Retires a saved pipeline for the whole company. Drafts are dropped without calling this. */
  onDeletePipeline?: (pipelineId: string) => Promise<void>
  /** Persists the order every operator sees the pipelines in, first to last. */
  onReorderPipelines?: (pipelineIds: string[]) => Promise<void>
  canEdit?: boolean
  /** A changed non-zero key inserts and focuses a new final stage once the editor is ready. */
  addStageRequestKey?: number
  /** Keeps inspector controls in one vertical flow when the editor sits inside a drawer. */
  stacked?: boolean
}) {
  const { direction, t } = useLanguage()
  const reduce = Boolean(useReducedMotion())

  const [drafts, setDrafts] = useState<EditablePipeline[]>(() => pipelines.map(pipelineDraft))
  const [activePipelineId, setActivePipelineId] = useState(() => drafts[0]?.id ?? "")
  const [selectedStageId, setSelectedStageId] = useState(() => drafts[0]?.stages[0]?.id ?? "")
  const [renamingStageId, setRenamingStageId] = useState<string | null>(null)
  const [renamingPipeline, setRenamingPipeline] = useState(false)
  const [heldId, setHeldId] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  /** Set while a delete or reorder is in flight, so the pipeline menu cannot fire twice. */
  const [pipelineBusy, setPipelineBusy] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [announcement, setAnnouncement] = useState("")

  const activePipeline = drafts.find((pipeline) => pipeline.id === activePipelineId) ?? drafts[0]
  const stages = useMemo(() => activePipeline?.stages ?? [], [activePipeline])
  const selectedStage = stages.find((stage) => stage.id === selectedStageId) ?? stages[0]
  const selectedIndex = stages.findIndex((stage) => stage.id === selectedStage?.id)
  const stageSignature = `${activePipeline?.id ?? ""}:${stages.map((stage) => stage.id).join(",")}`

  const dealTotal = stages.reduce((total, stage) => total + stage.dealCount, 0)
  const averageProbability = stages.length
    ? Math.round(stages.reduce((total, stage) => total + stage.probability, 0) / stages.length)
    : 0

  const railRef = useRef<HTMLDivElement>(null)
  const rowRef = useRef<HTMLOListElement>(null)
  const stagesRef = useRef(stages)
  const dirSignRef = useRef(1)
  const seededRef = useRef(sourceSignature(pipelines))
  const mountedRef = useRef(true)
  const handledAddStageRequestRef = useRef(0)
  // Read by the re-seed effect, which must not re-run when the operator switches pipeline. Holds the
  // id that was asked for rather than the one currently resolvable, so a draft that has just been
  // saved under a workspace id can still be matched in the list that arrives next.
  const activeIdRef = useRef(activePipelineId)

  stagesRef.current = stages
  dirSignRef.current = direction === "rtl" ? -1 : 1
  activeIdRef.current = activePipelineId

  const dragOffset = useMotionValue(0)
  const dragVelocity = useVelocity(dragOffset)
  const smoothVelocity = useSpring(dragVelocity, { stiffness: 260, damping: 40, mass: 0.4 })
  const rotate = useTransform(smoothVelocity, [-MAX_TILT_VELOCITY, 0, MAX_TILT_VELOCITY], [-2, 0, 2], { clamp: true })

  const cardValues = useRef(new Map<string, MotionValue<number>>())
  const presenceValues = useRef(new Map<string, MotionValue<number>>())
  const cardAnimations = useRef(new Map<string, AnimationPlaybackControls>())
  const dropAnimation = useRef<AnimationPlaybackControls | null>(null)
  const pendingFlip = useRef<Map<string, number> | null>(null)
  const pendingEnter = useRef(new Set<string>())
  const exitingIds = useRef(new Set<string>())
  const pointerState = useRef<{
    id: string
    from: number
    to: number
    startX: number
    pointerId: number
    pointerX: number
    started: boolean
  } | null>(null)
  const autoScroll = useRef<{ raf: number; last: number; ramp: number } | null>(null)

  const slotLeft = useMotionValue(0)
  const slotLeftSpring = useSpring(slotLeft, tetherSpring)
  const scrollX = useMotionValue(0)
  const tetherX = useTransform(() => slotLeftSpring.get() - scrollX.get())
  const tetherReady = useRef(false)
  const dropInFlight = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      dropAnimation.current?.stop()
      cardAnimations.current.forEach((controls) => controls.stop())
      if (autoScroll.current) cancelAnimationFrame(autoScroll.current.raf)
    }
  }, [])

  // Re-seed from the source while the operator has no unsaved work, so a late data
  // load does not leave the canvas showing an empty first render. A save also lands here,
  // because the server hands new stages their real ids, so hold the current selection
  // rather than snapping the operator back to the first pipeline.
  //
  // Depends on `dirty` as well as the source: a save updates the caller's pipelines before it
  // clears dirty, so this has to run again once the flag drops or the ids the workspace assigned
  // would never be picked up.
  useEffect(() => {
    const signature = sourceSignature(pipelines)
    if (signature === seededRef.current || dirty) return
    seededRef.current = signature
    const next = pipelines.map(pipelineDraft)
    setDrafts(next)

    // Resolve the pipeline first, then the stage within it. Falling back to the first pipeline's
    // first stage would leave the inspector describing a stage the canvas is not showing.
    const active = next.find((pipeline) => pipeline.id === activeIdRef.current) ?? next[0]
    setActivePipelineId(active?.id ?? "")
    setSelectedStageId((current) =>
      active?.stages.some((stage) => stage.id === current) ? current : active?.stages[0]?.id ?? "",
    )
  }, [pipelines, dirty])

  const cardValue = useCallback((id: string) => {
    const existing = cardValues.current.get(id)
    if (existing) return existing
    const created = motionValue(0)
    cardValues.current.set(id, created)
    return created
  }, [])

  const presenceValue = useCallback((id: string) => {
    const existing = presenceValues.current.get(id)
    if (existing) return existing
    const created = motionValue(pendingEnter.current.has(id) ? 0 : 1)
    presenceValues.current.set(id, created)
    return created
  }, [])

  const animateCard = useCallback(
    (id: string, target: number, transition: ValueAnimationTransition<number>) => {
      cardAnimations.current.get(id)?.stop()
      cardAnimations.current.set(id, animate(cardValue(id), target, transition))
    },
    [cardValue],
  )

  // React has already moved the cards into their final DOM slots by this point. Motion only
  // flushes transforms on its next frame, so the reset is also written straight to the node to
  // keep the commit invisible, then any pending keyboard move springs from its old slot.
  useLayoutEffect(() => {
    const flip = pendingFlip.current
    pendingFlip.current = null

    cardAnimations.current.forEach((controls) => controls.stop())
    cardAnimations.current.clear()
    dragOffset.jump(0)

    const live = new Set(stagesRef.current.map((stage) => stage.id))

    cardValues.current.forEach((value, id) => {
      if (!live.has(id)) {
        cardValues.current.delete(id)
        return
      }

      const offset = flip?.get(id) ?? 0
      value.jump(offset)

      const node = rowRef.current?.querySelector<HTMLElement>(`[data-stage-card="${id}"]`)
      if (node) node.style.transform = `translateX(${offset}px)`
    })

    presenceValues.current.forEach((value, id) => {
      if (!live.has(id)) {
        presenceValues.current.delete(id)
        return
      }
      if (!pendingEnter.current.has(id)) return
      pendingEnter.current.delete(id)
      value.jump(0)
      animate(value, 1, reduce ? instant : enterSpring)
    })

    flip?.forEach((_, id) => animateCard(id, 0, reduce ? instant : shiftSpring))
  }, [stageSignature, dragOffset, animateCard, reduce])

  // The tether tracks the selected slot with a spring, but follows scrolling one to one so it
  // never lags behind the card it belongs to.
  useLayoutEffect(() => {
    // A drop already aimed the tether at the slot the card is flying into, so recomputing from
    // the pre-commit DOM would drag it back to the slot the card is leaving.
    if (dropInFlight.current) return

    const node = rowRef.current?.querySelector<HTMLElement>(`[data-stage-slot="${selectedStage?.id}"]`)
    if (!node) return
    if (tetherReady.current && !reduce) slotLeft.set(node.offsetLeft)
    else {
      slotLeft.jump(node.offsetLeft)
      slotLeftSpring.jump(node.offsetLeft)
      tetherReady.current = true
    }
  }, [selectedStage?.id, stageSignature, direction, slotLeft, slotLeftSpring, reduce])

  function updatePipeline(updater: (pipeline: EditablePipeline) => EditablePipeline) {
    setDrafts((current) => current.map((pipeline) => (pipeline.id === activePipelineId ? updater(pipeline) : pipeline)))
    setDirty(true)
  }

  function updateStage(id: string, updater: (stage: EditableStage) => EditableStage) {
    updatePipeline((pipeline) => ({
      ...pipeline,
      stages: pipeline.stages.map((stage) => (stage.id === id ? updater(stage) : stage)),
    }))
  }

  const applySlotShift = useCallback(
    (from: number, to: number, ids: string[]) => {
      ids.forEach((id, index) => {
        if (index === from) return

        let target = 0
        if (from < to && index > from && index <= to) target = -CARD_PITCH
        else if (from > to && index >= to && index < from) target = CARD_PITCH

        // Nearer cards lead and further cards trail, so the row parts like a wave.
        const lead = Math.min(Math.abs(index - from) - 1, 4) * 0.012
        animateCard(id, target * dirSignRef.current, reduce ? instant : { ...shiftSpring, delay: lead })
      })
    },
    [animateCard, reduce],
  )

  const syncDrag = useCallback(() => {
    const active = pointerState.current
    if (!active || !active.started) return

    const current = stagesRef.current
    const sign = dirSignRef.current
    const travelled = (active.pointerX - active.startX) * sign
    const min = -active.from * CARD_PITCH
    const max = (current.length - 1 - active.from) * CARD_PITCH

    dragOffset.set(withEdgeResistance(travelled, min, max) * sign)

    const slots = clamp(travelled, min, max) / CARD_PITCH
    let slot = active.to - active.from
    while (slots > slot + 0.5 + SLOT_HYSTERESIS) slot += 1
    while (slots < slot - 0.5 - SLOT_HYSTERESIS) slot -= 1

    const next = clamp(active.from + slot, 0, current.length - 1)
    if (next === active.to) return

    active.to = next
    applySlotShift(active.from, next, current.map((stage) => stage.id))
  }, [applySlotShift, dragOffset])

  const stopAutoScroll = useCallback(() => {
    if (!autoScroll.current) return
    cancelAnimationFrame(autoScroll.current.raf)
    autoScroll.current = null
  }, [])

  // Edge scrolling ramps in over a beat and accelerates quadratically towards the edge, so
  // reaching past the viewport glides instead of jumping.
  const startAutoScroll = useCallback(() => {
    if (autoScroll.current) return

    const state = { raf: 0, last: performance.now(), ramp: 0 }
    autoScroll.current = state

    const step = (now: number) => {
      const active = pointerState.current
      const rail = railRef.current
      if (!active || !active.started || !rail) {
        stopAutoScroll()
        return
      }

      const elapsed = Math.min(48, now - state.last)
      state.last = now

      const rect = rail.getBoundingClientRect()
      const leadGap = active.pointerX - rect.left
      const trailGap = rect.right - active.pointerX

      let intensity = 0
      if (leadGap < AUTOSCROLL_EDGE) intensity = -(1 - Math.max(0, leadGap) / AUTOSCROLL_EDGE)
      else if (trailGap < AUTOSCROLL_EDGE) intensity = 1 - Math.max(0, trailGap) / AUTOSCROLL_EDGE

      state.ramp = intensity === 0 ? 0 : Math.min(1, state.ramp + elapsed / AUTOSCROLL_RAMP_MS)

      const eased = Math.sign(intensity) * intensity * intensity
      const delta = eased * AUTOSCROLL_PEAK * state.ramp * (elapsed / 16.667)

      if (delta !== 0) {
        const before = rail.scrollLeft
        rail.scrollLeft = before + delta
        const moved = rail.scrollLeft - before
        if (moved !== 0) {
          active.startX -= moved
          syncDrag()
        }
      }

      state.raf = requestAnimationFrame(step)
    }

    state.raf = requestAnimationFrame(step)
  }, [stopAutoScroll, syncDrag])

  function handleRowPointerDown(event: ReactPointerEvent<HTMLOListElement>) {
    const target = event.target as HTMLElement
    if (target.closest("[data-no-drag]")) return
    if (event.pointerType === "mouse" && event.button !== 0) return

    const id = (target.closest("[data-stage-slot]") as HTMLElement | null)?.dataset.stageSlot
    if (!id || exitingIds.current.has(id)) return

    const from = stagesRef.current.findIndex((stage) => stage.id === id)
    if (from === -1) return

    dropAnimation.current?.stop()
    dropAnimation.current = null
    event.currentTarget.setPointerCapture(event.pointerId)
    pointerState.current = {
      id,
      from,
      to: from,
      startX: event.clientX,
      pointerId: event.pointerId,
      pointerX: event.clientX,
      started: false,
    }
  }

  function handleRowPointerMove(event: ReactPointerEvent<HTMLOListElement>) {
    const active = pointerState.current
    if (!active || event.pointerId !== active.pointerId) return

    active.pointerX = event.clientX

    if (!active.started) {
      if (Math.abs(event.clientX - active.startX) < ACTIVATION_DISTANCE) return
      // Re-baseline at the activation point so the card never jumps by the threshold distance.
      active.startX = event.clientX
      active.started = true
      dragOffset.jump(0)
      setRenamingStageId(null)
      setHeldId(active.id)
      setDragging(true)
      startAutoScroll()
      return
    }

    syncDrag()
  }

  function handleRowPointerUp(event: ReactPointerEvent<HTMLOListElement>) {
    const active = pointerState.current
    if (!active || event.pointerId !== active.pointerId) return

    pointerState.current = null
    stopAutoScroll()
    if (event.currentTarget.hasPointerCapture(active.pointerId)) {
      event.currentTarget.releasePointerCapture(active.pointerId)
    }

    if (!active.started) {
      setSelectedStageId(active.id)
      return
    }

    const { from, to, id } = active
    // The lift eases out while the card glides home, so scale is back to rest before the commit.
    setDragging(false)
    setSelectedStageId(id)

    // Aim the tether at the slot the card is flying into so both settle together, rather than
    // making it wait for the reorder commit and then chase.
    const destination = rowRef.current?.querySelectorAll<HTMLElement>("[data-stage-slot]")[to]
    if (destination) {
      dropInFlight.current = true
      slotLeft.set(destination.offsetLeft)
    }

    const settle = animate(dragOffset, (to - from) * CARD_PITCH * dirSignRef.current, reduce ? instant : dropSpring)
    dropAnimation.current = settle

    void settle.then(() => {
      if (!mountedRef.current) return

      dropAnimation.current = null
      dropInFlight.current = false
      setHeldId(null)
      if (from === to) return

      updatePipeline((pipeline) => ({ ...pipeline, stages: moveItem(pipeline.stages, from, to) }))
      setAnnouncement(`${t(stagesRef.current[from]?.name ?? "")} — ${t("position")} ${to + 1}`)
    })
  }

  function moveStage(id: string, offset: -1 | 1) {
    const from = stagesRef.current.findIndex((stage) => stage.id === id)
    const to = clamp(from + offset, 0, stagesRef.current.length - 1)
    if (from === -1 || from === to) return

    if (!reduce) {
      pendingFlip.current = new Map([
        [id, -offset * CARD_PITCH * dirSignRef.current],
        [stagesRef.current[to].id, offset * CARD_PITCH * dirSignRef.current],
      ])
    }

    updatePipeline((pipeline) => ({ ...pipeline, stages: moveItem(pipeline.stages, from, to) }))
    setSelectedStageId(id)
    setAnnouncement(`${t(stagesRef.current[from].name)} — ${t("position")} ${to + 1}`)
  }

  function insertStage(index: number) {
    if (!activePipeline) return

    const id = `${activePipeline.id}-stage-${Date.now()}`
    const stage: EditableStage = {
      id,
      serverId: null,
      name: t("New stage"),
      tone: "neutral",
      rule: t("Describe when a deal belongs in this stage."),
      probability: 50,
      dealCount: 0,
      isDefaultEntry: false,
      isConversion: false,
    }

    pendingEnter.current.add(id)
    updatePipeline((pipeline) => {
      const next = [...pipeline.stages]
      next.splice(index, 0, stage)
      return { ...pipeline, stages: next }
    })
    setSelectedStageId(id)
    setRenamingStageId(id)
    setAnnouncement(`${t("Stage added")} — ${t("position")} ${index + 1}`)
  }

  useEffect(() => {
    if (
      !addStageRequestKey
      || addStageRequestKey === handledAddStageRequestRef.current
      || loading
      || !activePipeline
      || !canEdit
    ) {
      return
    }

    handledAddStageRequestRef.current = addStageRequestKey
    insertStage(stagesRef.current.length)
  }, [activePipeline, addStageRequestKey, canEdit, loading])

  function duplicateStage(id: string) {
    if (!activePipeline) return

    const index = stagesRef.current.findIndex((stage) => stage.id === id)
    const source = stagesRef.current[index]
    if (!source) return

    const copyId = `${activePipeline.id}-stage-${Date.now()}`
    pendingEnter.current.add(copyId)
    updatePipeline((pipeline) => {
      const next = [...pipeline.stages]
      // A copy is a brand new row, and the entry point and conversion trigger stay with the original.
      next.splice(index + 1, 0, {
        ...source,
        id: copyId,
        serverId: null,
        dealCount: 0,
        isDefaultEntry: false,
        isConversion: false,
      })
      return { ...pipeline, stages: next }
    })
    setSelectedStageId(copyId)
    toast.success(t("Stage duplicated"))
  }

  function removeStage(id: string) {
    const index = stagesRef.current.findIndex((stage) => stage.id === id)
    const stage = stagesRef.current[index]
    if (!stage || stage.dealCount > 0 || stagesRef.current.length <= 1) return

    exitingIds.current.add(id)
    setSelectedStageId(stagesRef.current[Math.max(0, index - 1)]?.id ?? "")

    const collapse = animate(presenceValue(id), 0, reduce ? instant : exitTween)
    void collapse.then(() => {
      if (!mountedRef.current) return
      exitingIds.current.delete(id)
      updatePipeline((pipeline) => ({ ...pipeline, stages: pipeline.stages.filter((entry) => entry.id !== id) }))
      toast.success(t("Stage removed"))
    })
  }

  function selectPipeline(pipeline: EditablePipeline) {
    tetherReady.current = false
    setActivePipelineId(pipeline.id)
    setSelectedStageId(pipeline.stages[0]?.id ?? "")
  }

  /** Pipeline names are unique per workspace, so a second draft has to arrive already numbered. */
  function uniquePipelineName(base: string) {
    const taken = new Set(drafts.map((pipeline) => pipeline.name.trim().toLowerCase()))
    if (!taken.has(base.toLowerCase())) return base

    let suffix = 2
    while (taken.has(`${base} ${suffix}`.toLowerCase())) suffix += 1
    return `${base} ${suffix}`
  }

  function createPipeline(template?: PipelineTemplate) {
    const id = `pipeline-${template?.id ?? "blank"}-${Date.now()}`
    const templateStages = template?.stages ?? [
      {
        name: "Qualifying",
        tone: "blue" as const,
        rule: "Describe when a deal belongs in this stage.",
        probability: 10,
        isDefaultEntry: true,
        isConversion: false,
      },
    ]
    const stages = templateStages.map((stage, index) => ({
      id: `${id}-${slug(stage.name)}-${index}`,
      serverId: null,
      name: t(stage.name),
      tone: stage.tone,
      rule: t(stage.rule),
      probability: stage.probability,
      dealCount: 0,
      isDefaultEntry: Boolean(stage.isDefaultEntry),
      isConversion: Boolean(stage.isConversion),
    }))
    const pipeline: EditablePipeline = {
      id,
      serverId: null,
      name: uniquePipelineName(t(template?.name ?? "Untitled pipeline")),
      owner: "",
      automation: "",
      stages,
    }

    tetherReady.current = false
    setDrafts((current) => [...current, pipeline])
    setActivePipelineId(id)
    setSelectedStageId(stages[0]?.id ?? "")
    setRenamingPipeline(!template)
    setDirty(true)
    setTemplatesOpen(false)
    toast.success(t(template ? "Pipeline template applied" : "Pipeline draft created"))
  }

  async function saveChanges() {
    if (!activePipeline || saving) return

    if (!onSave) {
      setDirty(false)
      toast.success(t("Pipeline changes saved"))
      return
    }

    setSaving(true)
    try {
      const savedId = await onSave({
        id: activePipeline.serverId,
        name: activePipeline.name,
        owner: activePipeline.owner,
        automation: activePipeline.automation,
        stages: activePipeline.stages.map((stage) => ({
          id: stage.serverId,
          name: stage.name,
          tone: stage.tone,
          rule: stage.rule,
          probability: stage.probability,
          isDefaultEntry: stage.isDefaultEntry,
          isConversion: stage.isConversion,
        })),
      })
      if (!mountedRef.current) return

      // A draft is keyed on a browser-generated id, so point the selection at the id the workspace
      // assigned before clearing dirty: the re-seed that follows keys drafts on the saved ids.
      if (typeof savedId === "string") setActivePipelineId(savedId)
      // Clearing dirty lets the re-seed effect adopt the ids the server just assigned.
      setDirty(false)
      toast.success(t("Pipeline changes saved"))
    } catch (saveError: unknown) {
      if (!mountedRef.current) return
      toast.error(saveError instanceof Error ? t(saveError.message) : t("We could not save this pipeline."))
    } finally {
      if (mountedRef.current) setSaving(false)
    }
  }

  async function deletePipeline(target: EditablePipeline) {
    if (pipelineBusy) return

    const remaining = drafts.filter((pipeline) => pipeline.id !== target.id)

    function dropLocally() {
      tetherReady.current = false
      setDrafts(remaining)
      if (target.id === activePipelineId) {
        setActivePipelineId(remaining[0]?.id ?? "")
        setSelectedStageId(remaining[0]?.stages[0]?.id ?? "")
      }
    }

    // A draft only exists in this browser, so there is nothing for the workspace to retire.
    if (!target.serverId || !onDeletePipeline) {
      dropLocally()
      toast.success(t("Pipeline removed"))
      return
    }

    setPipelineBusy(true)
    try {
      await onDeletePipeline(target.serverId)
      if (!mountedRef.current) return
      dropLocally()
      // The delete already landed, so the surviving drafts match the workspace again.
      if (target.id === activePipelineId) setDirty(false)
      toast.success(t("Pipeline removed"))
    } catch (deleteError: unknown) {
      if (!mountedRef.current) return
      toast.error(deleteError instanceof Error ? t(deleteError.message) : t("We could not delete this pipeline."))
    } finally {
      if (mountedRef.current) setPipelineBusy(false)
    }
  }

  async function movePipeline(id: string, offset: -1 | 1) {
    if (pipelineBusy) return

    const from = drafts.findIndex((pipeline) => pipeline.id === id)
    const to = clamp(from + offset, 0, drafts.length - 1)
    if (from === -1 || from === to) return

    const next = moveItem(drafts, from, to)
    setDrafts(next)
    setAnnouncement(`${t(drafts[from].name)} — ${t("position")} ${to + 1}`)

    const serverIds = next.map((pipeline) => pipeline.serverId)
    // The workspace order has to name every saved pipeline, so it can only be written once the
    // drafts in the list have been saved. Until then the new order is a local preview.
    if (!onReorderPipelines || serverIds.some((serverId) => serverId === null)) return

    setPipelineBusy(true)
    try {
      await onReorderPipelines(serverIds as string[])
    } catch (reorderError: unknown) {
      if (!mountedRef.current) return
      setDrafts(drafts)
      toast.error(reorderError instanceof Error ? t(reorderError.message) : t("We could not save the pipeline order."))
    } finally {
      if (mountedRef.current) setPipelineBusy(false)
    }
  }

  const removalNote = (selectedStage?.dealCount ?? 0) > 0
    ? t("Deals in this stage must be moved before removal.")
    : stages.length <= 1
      ? t("A pipeline must keep at least one stage.")
      : t("This stage is empty and can be removed.")

  // Every state of the editor is delivered through the same keyed panel, so whichever one the
  // operator lands on eases in rather than appearing fully formed.
  return (
    <>
      <PipelineTemplatesDialog
        open={templatesOpen}
        onOpenChange={setTemplatesOpen}
        onSelect={createPipeline}
        onCreateBlank={() => createPipeline()}
      />
      {loading ? (
        <EditorPanel key="loading" reduce={reduce}>
          <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]" aria-label={t("Loading pipeline editor")}>
            <div className="grid gap-4 p-5">
              <Skeleton className="h-11 w-[280px] rounded-[var(--md-radius-lg)]" />
              <Skeleton className="h-[210px] rounded-[var(--md-radius-lg)]" />
              <Skeleton className="h-[180px] rounded-[var(--md-radius-lg)]" />
            </div>
          </Surface>
        </EditorPanel>
      ) : error ? (
        <EditorPanel key="error" reduce={reduce}>
          <Surface padding="lg" className="rounded-[var(--md-radius-xl)]">
            <h2 className="text-[16px] font-medium text-[var(--md-ink)]">{t("Pipeline editor unavailable")}</h2>
            <p className="mt-2 max-w-[560px] text-[13px] leading-5 text-[var(--md-text)]">{error}</p>
            {onRetry ? <Button className="mt-4" onClick={onRetry}>{t("Try again")}</Button> : null}
          </Surface>
        </EditorPanel>
      ) : !activePipeline || !selectedStage ? (
        <EditorPanel key="empty" reduce={reduce}>
          <Surface padding="lg" className="rounded-[var(--md-radius-xl)]">
            <h2 className="text-[16px] font-medium text-[var(--md-ink)]">{t("No pipelines yet")}</h2>
            <p className="mt-2 text-[13px] text-[var(--md-text)]">{t("Create a pipeline to define how deals move through your sales process.")}</p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button onClick={() => createPipeline()}><Plus data-icon="inline-start" />{t("Create pipeline")}</Button>
              <Button variant="ghost" className="bg-[var(--md-surface-tint)] shadow-[var(--md-shadow-line)]" onClick={() => setTemplatesOpen(true)}>
                <Zap data-icon="inline-start" strokeWidth={1.2} />
                {t("Templates")}
              </Button>
            </div>
          </Surface>
        </EditorPanel>
      ) : (
        <EditorPanel key="ready" reduce={reduce}>
            <Surface padding="none" className="min-w-0 max-w-full overflow-hidden rounded-[var(--md-radius-xl)]">
              <div className="flex flex-col gap-3 px-5 py-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {renamingPipeline ? (
                      <input
                        autoFocus
                        dir="auto"
                        value={activePipeline.name}
                        aria-label={t("Pipeline name")}
                        onChange={(event) => updatePipeline((pipeline) => ({ ...pipeline, name: event.target.value }))}
                        onBlur={() => setRenamingPipeline(false)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === "Escape") {
                            event.preventDefault()
                            setRenamingPipeline(false)
                          }
                        }}
                        className="w-[280px] max-w-full rounded-[var(--md-radius-md)] bg-[var(--md-field-bg)] px-1.5 py-0.5 text-[18px] font-medium text-[var(--md-ink)] outline-none ring-2 ring-[color-mix(in_srgb,var(--md-accent)_45%,transparent)]"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setRenamingPipeline(true)}
                        title={t("Edit pipeline name")}
                        className="group/title flex min-w-0 items-center gap-1.5 rounded-[var(--md-radius-md)] px-1.5 py-0.5 text-[18px] font-medium text-[var(--md-ink)] transition-colors duration-150 hover:bg-[var(--md-hover)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_srgb,var(--md-accent)_20%,transparent)]"
                      >
                        <span className="truncate">{t(activePipeline.name)}</span>
                        <Pencil className="size-3.5 shrink-0 text-[var(--md-subtle)] opacity-0 transition-opacity duration-150 group-hover/title:opacity-100" strokeWidth={1.4} />
                      </button>
                    )}
                    <AnimatePresence initial={false}>
                      {dirty ? (
                        <motion.span
                          key="dirty"
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0, opacity: 0, transition: { duration: 0.12 } }}
                          transition={liftSpring}
                          title={t("Unsaved changes")}
                          className="size-1.5 shrink-0 rounded-full bg-[var(--md-amber)]"
                        />
                      ) : null}
                    </AnimatePresence>
                  </div>
                  <p className="mt-1 ps-1.5 text-[12px] text-[var(--md-text)]">
                    <span data-i18n-skip dir="ltr">{stages.length}</span> {t("stages")} · <span data-i18n-skip dir="ltr">{dealTotal}</span>{" "}
                    {t("deals")} · <span data-i18n-skip dir="ltr">{averageProbability}%</span> {t("average win rate")}
                  </p>
                </div>

                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-9 min-w-[170px] justify-between rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-3 text-[13px] font-medium shadow-[var(--md-shadow-line)]">
                        <span className="truncate">{t("Switch pipeline")}</span>
                        <ChevronDown data-icon="inline-end" className="size-4" strokeWidth={1.2} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-[300px] rounded-[var(--md-radius-lg)]">
                      <DropdownMenuLabel>{t("Switch pipeline")}</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {drafts.map((pipeline, index) => (
                        <div key={pipeline.id} className="flex items-center gap-0.5">
                          <DropdownMenuItem className="min-w-0 flex-1" onSelect={() => selectPipeline(pipeline)}>
                            <span className="truncate">{t(pipeline.name)}</span>
                            {pipeline.serverId ? null : (
                              <span className="ms-auto shrink-0 text-[11px] text-[var(--md-subtle)]">{t("Draft")}</span>
                            )}
                          </DropdownMenuItem>
                          {canEdit ? (
                            <>
                              <button
                                type="button"
                                aria-label={`${t("Move pipeline earlier")}: ${t(pipeline.name)}`}
                                title={t("Move pipeline earlier")}
                                disabled={index === 0 || pipelineBusy}
                                // Reordering usually happens a step at a time, so hold the menu open.
                                onClick={(event) => {
                                  event.preventDefault()
                                  void movePipeline(pipeline.id, -1)
                                }}
                                className="grid size-7 shrink-0 place-items-center rounded-[var(--md-radius-md)] text-[var(--md-subtle)] transition-colors duration-150 hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_srgb,var(--md-accent)_20%,transparent)] disabled:pointer-events-none disabled:opacity-30"
                              >
                                <ChevronUp className="size-3.5" strokeWidth={1.6} />
                              </button>
                              <button
                                type="button"
                                aria-label={`${t("Move pipeline later")}: ${t(pipeline.name)}`}
                                title={t("Move pipeline later")}
                                disabled={index === drafts.length - 1 || pipelineBusy}
                                onClick={(event) => {
                                  event.preventDefault()
                                  void movePipeline(pipeline.id, 1)
                                }}
                                className="grid size-7 shrink-0 place-items-center rounded-[var(--md-radius-md)] text-[var(--md-subtle)] transition-colors duration-150 hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_srgb,var(--md-accent)_20%,transparent)] disabled:pointer-events-none disabled:opacity-30"
                              >
                                <ChevronDown className="size-3.5" strokeWidth={1.6} />
                              </button>
                              <button
                                type="button"
                                aria-label={`${t("Delete pipeline")}: ${t(pipeline.name)}`}
                                title={t("Delete pipeline")}
                                disabled={pipelineBusy}
                                onClick={(event) => {
                                  event.preventDefault()
                                  void deletePipeline(pipeline)
                                }}
                                className="me-1 grid size-7 shrink-0 place-items-center rounded-[var(--md-radius-md)] text-[var(--md-subtle)] transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--md-red)_9%,transparent)] hover:text-[var(--md-red)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_srgb,var(--md-red)_20%,transparent)] disabled:pointer-events-none disabled:opacity-30"
                              >
                                <Trash2 className="size-3.5" strokeWidth={1.6} />
                              </button>
                            </>
                          ) : null}
                        </div>
                      ))}
                      {canEdit && drafts.some((pipeline) => !pipeline.serverId) ? (
                        <>
                          <DropdownMenuSeparator />
                          <p className="px-2 pb-1 text-[11px] leading-4 text-[var(--md-subtle)]">
                            {t("Save the draft pipeline to share its order with the rest of the company.")}
                          </p>
                        </>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="ghost"
                      className="h-9 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-3 text-[13px] font-medium shadow-[var(--md-shadow-line)]"
                      onClick={() => createPipeline()}
                    >
                      <Plus data-icon="inline-start" strokeWidth={1.2} />
                      {t("Create pipeline")}
                    </Button>
                    <Button
                      variant="ghost"
                      className="h-9 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-3 text-[13px] font-medium shadow-[var(--md-shadow-line)]"
                      onClick={() => setTemplatesOpen(true)}
                    >
                      <Zap data-icon="inline-start" strokeWidth={1.2} />
                      {t("Templates")}
                    </Button>
                  </div>
                  <Button
                    className="h-9 rounded-[var(--md-radius-lg)] px-4 text-[13px] font-medium"
                    disabled={!dirty || saving || !canEdit}
                    title={canEdit ? undefined : t("Only workspace administrators can change pipelines.")}
                    onClick={() => void saveChanges()}
                  >
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.span
                        key={saving ? "saving" : dirty ? "save" : "saved"}
                        className="flex items-center gap-1.5"
                        initial={{ opacity: 0, scale: 0.86 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.86, transition: { duration: 0.09 } }}
                        transition={liftSpring}
                      >
                        {saving ? (
                          <LoaderCircle className="size-4 animate-spin" strokeWidth={1.2} />
                        ) : dirty ? (
                          <Save className="size-4" strokeWidth={1.2} />
                        ) : (
                          <Check className="size-4" strokeWidth={1.2} />
                        )}
                        {saving ? t("Saving…") : dirty ? t("Save changes") : t("Saved")}
                      </motion.span>
                    </AnimatePresence>
                  </Button>
                </div>
              </div>

              <div className="relative border-t border-[color-mix(in_srgb,var(--md-ink)_6%,transparent)]">
                <div
                  ref={railRef}
                  dir={direction}
                  className="md-scrollbar overflow-x-auto overflow-y-hidden bg-[var(--md-surface-soft)]"
                  onScroll={() => scrollX.set(railRef.current?.scrollLeft ?? 0)}
                >
                  <ol
                    ref={rowRef}
                    role="list"
                    aria-label={t("Pipeline canvas")}
                    className="relative flex min-w-full items-start"
                    style={{ paddingInline: CARD_GAP, paddingBlock: RAIL_PAD_Y }}
                    onPointerDown={handleRowPointerDown}
                    onPointerMove={handleRowPointerMove}
                    onPointerUp={handleRowPointerUp}
                    onPointerCancel={handleRowPointerUp}
                  >
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 transition-opacity duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
                      style={{
                        opacity: dragging ? 1 : 0.5,
                        backgroundImage:
                          "radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--md-ink) 11%, transparent) 1px, transparent 0)",
                        backgroundSize: "24px 24px",
                      }}
                    />
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-0 h-px bg-[color-mix(in_srgb,var(--md-ink)_9%,transparent)]"
                      style={{ top: RAIL_PAD_Y + CARD_HEIGHT / 2 }}
                    />

                    {stages.map((stage, index) => (
                      <StageCard
                        key={stage.id}
                        stage={stage}
                        index={index}
                        total={stages.length}
                        selected={stage.id === selectedStage.id}
                        held={stage.id === heldId}
                        lifted={stage.id === heldId && dragging}
                        renaming={stage.id === renamingStageId}
                        dragging={dragging}
                        x={stage.id === heldId ? dragOffset : cardValue(stage.id)}
                        rotate={rotate}
                        presence={presenceValue(stage.id)}
                        onRename={(name) => updateStage(stage.id, (entry) => ({ ...entry, name }))}
                        onStartRename={() => {
                          setSelectedStageId(stage.id)
                          setRenamingStageId(stage.id)
                        }}
                        onEndRename={() => setRenamingStageId(null)}
                        onKeyboardMove={(offset) => moveStage(stage.id, offset)}
                        onInsertBefore={() => insertStage(index)}
                      />
                    ))}

                    <li className="relative shrink-0" style={{ width: CARD_WIDTH, height: CARD_HEIGHT }}>
                      <button
                        type="button"
                        data-no-drag=""
                        onClick={() => insertStage(stages.length)}
                        className="group/add flex size-full flex-col items-center justify-center gap-2 rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] text-[13px] font-medium text-[var(--md-text)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--md-ink)_12%,transparent)] transition-[background,box-shadow,color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[color-mix(in_srgb,var(--md-accent)_5%,var(--md-surface))] hover:text-[var(--md-ink)] hover:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--md-accent)_38%,transparent)] focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--md-accent),0_0_0_3px_color-mix(in_srgb,var(--md-accent)_18%,transparent)]"
                      >
                        <span className="grid size-9 place-items-center rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)] transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover/add:scale-[1.08]">
                          <Plus className="size-4" strokeWidth={1.2} />
                        </span>
                        {t("Add stage")}
                      </button>
                    </li>
                  </ol>
                </div>

                <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] overflow-hidden">
                  <motion.span
                    data-pipeline-tether=""
                    className="absolute inset-y-0 left-0 rounded-full bg-[var(--md-accent)]"
                    style={{ x: tetherX, width: CARD_WIDTH }}
                    initial={false}
                    animate={{ opacity: dragging ? 0 : 1 }}
                    transition={{ duration: dragging ? 0.12 : 0.24, ease: [0.22, 1, 0.36, 1] }}
                  />
                </div>
              </div>

              {/* The inspector trails the canvas by a beat, so the panel resolves top down. */}
              <motion.div
                className="border-t border-[color-mix(in_srgb,var(--md-ink)_6%,transparent)] px-5 py-4"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={reduceMotion(reduce, { ...mdMotion.enter, delay: 0.08 })}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="size-2 shrink-0 rounded-full" style={{ background: toneToVar(selectedStage.tone) }} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.h3
                        key={selectedStage.id}
                        className="truncate text-[15px] font-medium text-[var(--md-ink)]"
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4, transition: { duration: 0.1 } }}
                        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                      >
                        {t(selectedStage.name)}
                      </motion.h3>
                    </AnimatePresence>
                    <p className="mt-0.5 text-[12px] text-[var(--md-text)]">
                      {t("Stage")} <span data-i18n-skip dir="ltr">{selectedIndex + 1}</span> {t("of")}{" "}
                      <span data-i18n-skip dir="ltr">{stages.length}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-9 rounded-[var(--md-radius-md)]"
                      aria-label={t("Move stage earlier")}
                      title={t("Move stage earlier")}
                      disabled={selectedIndex <= 0}
                      onClick={() => moveStage(selectedStage.id, -1)}
                    >
                      <ArrowLeft className="size-4 rtl:rotate-180" strokeWidth={1.2} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-9 rounded-[var(--md-radius-md)]"
                      aria-label={t("Move stage later")}
                      title={t("Move stage later")}
                      disabled={selectedIndex >= stages.length - 1}
                      onClick={() => moveStage(selectedStage.id, 1)}
                    >
                      <ArrowRight className="size-4 rtl:rotate-180" strokeWidth={1.2} />
                    </Button>
                  </div>
                </div>

                <div className={cn("mt-4 gap-5", stacked ? "grid" : "flex flex-wrap items-start gap-x-8")}>
                  <div className={cn(stacked ? "w-full" : "min-w-[212px] max-w-[240px] flex-1")}>
                    <span className="text-[12px] font-medium text-[var(--md-subtle)]">{t("Stage colour")}</span>
                    <TonePicker value={selectedStage.tone} onChange={(tone) => updateStage(selectedStage.id, (stage) => ({ ...stage, tone }))} />
                  </div>

                  <div className={cn(stacked ? "w-full" : "min-w-[268px] max-w-[360px] flex-[1.3]")}>
                    <span className="text-[12px] font-medium text-[var(--md-subtle)]">{t("Win probability")}</span>
                    <ProbabilityTrack
                      value={selectedStage.probability}
                      onChange={(probability) => updateStage(selectedStage.id, (stage) => ({ ...stage, probability }))}
                    />
                  </div>

                  <label className={cn(stacked ? "w-full" : "min-w-[268px] max-w-[520px] flex-[1.6]")}>
                    <span className="text-[12px] font-medium text-[var(--md-subtle)]">{t("Entry rule")}</span>
                    <Textarea
                      dir="auto"
                      value={selectedStage.rule}
                      onChange={(event) => updateStage(selectedStage.id, (stage) => ({ ...stage, rule: event.target.value }))}
                      className="mt-2 min-h-[68px] rounded-[var(--md-radius-lg)] text-[13px] leading-5"
                    />
                  </label>

                  <div className={cn(stacked ? "w-full" : "min-w-[188px] max-w-[300px] flex-1")}>
                    <span className="text-[12px] font-medium text-[var(--md-subtle)]">{t("Stage actions")}</span>
                    <div className="mt-2 grid gap-1.5">
                      <Button
                        variant="ghost"
                        className="h-9 justify-start rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] text-[13px] shadow-[var(--md-shadow-line)]"
                        onClick={() => duplicateStage(selectedStage.id)}
                      >
                        <Copy data-icon="inline-start" className="size-4" strokeWidth={1.2} />
                        {t("Duplicate stage")}
                      </Button>
                      <Button
                        variant="ghost"
                        className="h-9 justify-start rounded-[var(--md-radius-lg)] text-[13px] text-[var(--md-red)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--md-red)_32%,transparent)] hover:bg-[color-mix(in_srgb,var(--md-red)_7%,transparent)] hover:text-[var(--md-red)]"
                        disabled={selectedStage.dealCount > 0 || stages.length <= 1}
                        onClick={() => removeStage(selectedStage.id)}
                      >
                        <Trash2 data-icon="inline-start" className="size-4" strokeWidth={1.2} />
                        {t("Remove stage")}
                      </Button>
                      <p className="text-[11px] leading-4 text-[var(--md-subtle)]">{removalNote}</p>
                    </div>
                  </div>
                </div>

                <p className="mt-4 text-[11px] text-[var(--md-subtle)]">
                  {t("Drag a stage to reorder it, hover a gap to insert, or hold Alt with the arrow keys.")}
                </p>
              </motion.div>

              <p aria-live="polite" className="sr-only">
                {announcement}
              </p>
            </Surface>
        </EditorPanel>
      )}
    </>
  )
}
