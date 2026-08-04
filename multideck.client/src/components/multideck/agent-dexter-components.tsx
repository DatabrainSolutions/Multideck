import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ClipboardEvent, type FormEvent, type KeyboardEvent, type ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import {
  ArrowRight,
  ArrowLeft,
  ArrowUp,
  BarChart3,
  Boxes,
  Check,
  ChevronDown,
  FileText,
  Hand,
  Handshake,
  LoaderCircle,
  MessageCircle,
  PackageCheck,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Upload,
  Users,
  X,
  Zap,
} from "lucide-react"
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react"
import { createPortal } from "react-dom"
import { Button } from "@/components/ui/button"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import {
  Context,
  ContextContent,
  ContextContentHeader,
  ContextTrigger,
} from "@/components/ai-elements/context"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { DexterActionPill, SpectralBloomShader } from "@/components/multideck/dexter-action-pill"
import { DexterEmailAttachmentCard } from "@/components/multideck/dexter-email-attachment-card"
import { ModelProviderGlyph, ModelStrengthMeter } from "@/components/multideck/model-glyphs"
import { ProgressiveBlur } from "@/components/multideck/progressive-blur"
import { cn } from "@/lib/utils"
import { findDexterMentionMatches } from "@/lib/dexter-mention-matcher"
import type { StatusTone } from "@/data/multideck-data"
import { dexterModels, type DexterModel, type DexterModelId } from "@/data/dexter-models"
import {
  defaultDexterMentionItems,
  type DexterMentionItem,
  type DexterMentionType,
} from "@/data/dexter-mentions"
import { StatusPill, toneToVar } from "@/components/multideck/status-pill"
import { Surface } from "@/components/multideck/surface"
import { useLanguage } from "@/i18n/language-provider"
import type { DexterEmailAttachment, DexterPendingAction, DexterWatchEvent } from "@/lib/dexter-api"
import { mdEaseOut, mdMotion, reduceMotion, staggerRamp } from "@/lib/motion"

export type DexterSpecialistId = "auto" | "customs" | "customer" | "sales" | "ops" | "analytics"
export type DexterAccessMode = "approve" | "full"
export type DexterSlashCommand = {
  id: string
  command: string
  label: string
  description: string
  group: "mode"
  icon: LucideIcon
  selected?: boolean
  disabled?: boolean
}

function useSendShortcutModifier() {
  const [modifier, setModifier] = useState<"⌘" | "Ctrl">("Ctrl")

  useEffect(() => {
    const navigatorWithPlatform = navigator as Navigator & {
      userAgentData?: { platform?: string }
    }
    const platform = navigatorWithPlatform.userAgentData?.platform
      ?? navigator.platform
      ?? navigator.userAgent
    setModifier(/Mac|iPhone|iPad|iPod/i.test(platform) ? "⌘" : "Ctrl")
  }, [])

  return modifier
}

export type DexterSpecialist = {
  id: DexterSpecialistId
  name: string
  label?: string
  description: string
  icon: LucideIcon
}

export type DexterAttachment = {
  id: string
  type: "customer" | "booking" | "document" | "uploaded_document" | "email_attachment" | "email_update"
  title: string
  meta: string
  tone: StatusTone
  icon: LucideIcon
}

export type DexterHistoryItem = {
  id: string
  title: string
  summary: string
  time: string
}

export type DexterMonitor = {
  id?: string
  title: string
  body: string
  meta: string
  detail: string
  tone: StatusTone
  status?: "active" | "paused"
  capability?: string
  targetLabel?: string | null
  ruleLabel?: string
  triggerCount?: number
  lastTriggeredAt?: string | null
  healthStatus?: "starting" | "healthy" | "degraded" | "error"
  lastSourceCheckAt?: string | null
  lastSuccessfulCheckAt?: string | null
  healthMessage?: string | null
  latestEvent?: DexterWatchEvent | null
  action?: DexterPendingAction | null
}

export type { DexterMentionItem, DexterMentionType } from "@/data/dexter-mentions"

const specialistTone: Record<DexterSpecialistId, string> = {
  auto: "bg-[var(--md-accent-a10)] text-[var(--md-accent)]",
  customs: "bg-[var(--md-accent-a10)] text-[var(--md-accent)]",
  customer: "bg-[rgba(74,125,156,0.1)] text-[var(--md-blue)]",
  sales: "bg-[rgba(221,138,43,0.12)] text-[var(--md-amber)]",
  ops: "bg-[rgba(90,103,100,0.1)] text-[var(--md-text)]",
  analytics: "bg-[var(--md-accent-a10)] text-[var(--md-green)]",
}

function AttachmentIcon({ attachment }: { attachment: DexterAttachment }) {
  const Icon = attachment.icon

  return (
    <span className="grid size-7 shrink-0 place-items-center rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] text-[var(--md-accent)] shadow-[var(--md-shadow-line)]">
      <Icon className="size-3.5" strokeWidth={1.2} />
    </span>
  )
}

export function DexterSpecialistChip({
  specialist,
  onClick,
}: {
  specialist: DexterSpecialist
  onClick?: () => void
}) {
  const Icon = specialist.icon

  return (
    <button
      type="button"
      className="inline-flex h-8 items-center gap-2 rounded-full bg-[var(--md-accent-a08)] px-3 text-[13px] font-medium text-[var(--md-accent)] shadow-[0_0_0_1px_var(--md-accent-a18)] transition-[background,color,box-shadow,opacity,transform] duration-200 hover:bg-[var(--md-accent-a12)]"
      onClick={onClick}
    >
      <Icon className="size-3.5" strokeWidth={1.2} />
      {specialist.name}
    </button>
  )
}

/**
 * A label that swaps in place. One spring on the whole word — a per-character
 * stagger reads as a machine dealing out letters, which is the wrong register
 * for confirming a choice the operator just made.
 */
function SwapLabel({ value, className }: { value: string; className?: string }) {
  const shouldReduceMotion = useReducedMotion()

  return (
    <span className={cn("relative inline-grid min-w-0 text-start", className)}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          className="min-w-0 truncate"
          initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.84, filter: "blur(3px)" }}
          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
          exit={shouldReduceMotion ? undefined : { opacity: 0, scale: 0.9, filter: "blur(3px)" }}
          transition={
            shouldReduceMotion
              ? { duration: 0 }
              : { type: "spring", stiffness: 540, damping: 26, mass: 0.58 }
          }
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}

/** Pill widths follow their label on a spring, so a longer name never snaps. */
function PillFrame({ children }: { children: ReactNode }) {
  const shouldReduceMotion = useReducedMotion()

  return (
    <motion.div
      className="inline-flex min-w-0 shrink-0"
      layout={shouldReduceMotion ? false : true}
      transition={{ layout: reduceMotion(Boolean(shouldReduceMotion), mdMotion.spring) }}
    >
      {children}
    </motion.div>
  )
}

/**
 * The role picker, sitting on the composer's shader header. A role changes
 * which lane every following reply is answered in, so the trigger states the
 * current one plainly and the menu explains what each lane covers.
 */
export function DexterRoleMenu({
  specialists = defaultDexterSpecialists,
  selectedId,
  onSelect,
  className,
}: {
  specialists?: DexterSpecialist[]
  selectedId: DexterSpecialistId
  onSelect: (id: DexterSpecialistId) => void
  className?: string
}) {
  const { direction, t } = useLanguage()
  const shouldReduceMotion = Boolean(useReducedMotion())
  const [isOpen, setIsOpen] = useState(false)
  const pickerId = useId()
  const pickerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const focusRestoreTimeoutRef = useRef<number | null>(null)
  const selected = specialists.find((specialist) => specialist.id === selectedId) ?? specialists[0]
  const availableSpecialists = specialists.filter((specialist) => specialist.id !== selectedId)

  useEffect(() => {
    if (!isOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setIsOpen(false)
    }

    document.addEventListener("pointerdown", handlePointerDown)
    return () => document.removeEventListener("pointerdown", handlePointerDown)
  }, [isOpen])

  useEffect(() => () => {
    if (focusRestoreTimeoutRef.current !== null) {
      window.clearTimeout(focusRestoreTimeoutRef.current)
    }
  }, [])

  function closePicker({ restoreFocus = false } = {}) {
    setIsOpen(false)
    if (restoreFocus) {
      if (focusRestoreTimeoutRef.current !== null) {
        window.clearTimeout(focusRestoreTimeoutRef.current)
      }
      focusRestoreTimeoutRef.current = window.setTimeout(() => {
        triggerRef.current?.focus()
        focusRestoreTimeoutRef.current = null
      }, 0)
    }
  }

  function selectSpecialist(id: DexterSpecialistId) {
    onSelect(id)
    closePicker({ restoreFocus: true })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={t("Change role")}
            className={cn(
              "md-composer-lead md-dexter-role-menu--compact group/role h-8 max-w-full items-center gap-1.5 rounded-full ps-2.5 pe-2 text-[13px] font-medium text-[var(--md-ink)]",
              className,
            )}
          >
            <SwapLabel value={t(selected.name)} className="max-w-[190px] font-medium text-white dark:text-[var(--md-ink)]" />
            <ChevronDown className="md-composer-chip__caret size-3.5 shrink-0 text-[var(--md-subtle)]" strokeWidth={1.4} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={8} className="w-[min(280px,calc(100vw-32px))] p-1.5">
          <DropdownMenuLabel className="px-2 pb-1.5 pt-1 text-[11px] font-normal text-[var(--md-subtle)]">
            {t("Choose a role")}
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup value={selectedId} onValueChange={(next) => onSelect(next as DexterSpecialistId)}>
            {specialists.map((specialist) => (
              <DropdownMenuRadioItem
                key={specialist.id}
                value={specialist.id}
                className="rounded-[var(--md-radius-md)] px-2.5 py-2 text-[13px]"
              >
                <span className="truncate">{t(specialist.name)}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <div
        ref={pickerRef}
        className={cn("md-dexter-role-menu--wide min-w-0 flex-1 items-center gap-1.5", className)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && isOpen) {
            event.preventDefault()
            closePicker({ restoreFocus: true })
          }
        }}
      >
        <PillFrame>
          <button
            ref={triggerRef}
            type="button"
            aria-label={t("Change role")}
            aria-expanded={isOpen}
            aria-controls={pickerId}
            data-state={isOpen ? "open" : "closed"}
            className="md-composer-lead group/role inline-flex h-8 max-w-full items-center gap-1.5 rounded-full ps-2.5 pe-2 text-[13px] font-medium text-[var(--md-ink)]"
            onClick={() => setIsOpen((current) => !current)}
          >
            <SwapLabel value={t(selected.name)} className="max-w-[190px] font-medium text-white dark:text-[var(--md-ink)]" />
            <ChevronDown className="md-composer-chip__caret size-3.5 shrink-0 text-[var(--md-subtle)] opacity-0 transition-opacity duration-200 group-hover/role:opacity-100 group-focus-visible/role:opacity-100" strokeWidth={1.4} />
          </button>
        </PillFrame>

        <div
          id={pickerId}
          role="listbox"
          aria-label={t("Choose a role")}
          aria-hidden={!isOpen}
          className="md-dexter-role-strip min-w-0 flex-1 overflow-x-auto py-1"
        >
          <AnimatePresence initial={false}>
            {isOpen ? (
              <motion.div
                key="dexter-inline-roles"
                className="flex min-w-max items-center gap-1.5"
                initial={false}
              >
                {availableSpecialists.map((specialist, index) => {
                  const Icon = specialist.icon
                  const visualIndex = direction === "rtl"
                    ? availableSpecialists.length - 1 - index
                    : index

                  return (
                    <motion.button
                      key={specialist.id}
                      type="button"
                      role="option"
                      aria-selected={false}
                      title={t(specialist.description)}
                      custom={visualIndex}
                      variants={{
                        hidden: (itemIndex: number) => ({
                          opacity: 0,
                          y: 6,
                          scale: 0.97,
                          filter: "blur(5px)",
                          transition: {
                            duration: 0.14,
                            delay: (availableSpecialists.length - 1 - itemIndex) * 0.022,
                            ease: mdEaseOut,
                          },
                        }),
                        visible: (itemIndex: number) => ({
                          opacity: 1,
                          y: 0,
                          scale: 1,
                          filter: "blur(0px)",
                          transition: {
                            duration: 0.22,
                            delay: itemIndex * 0.038,
                            ease: mdEaseOut,
                          },
                        }),
                      }}
                      initial={shouldReduceMotion ? false : "hidden"}
                      animate="visible"
                      exit={shouldReduceMotion ? undefined : "hidden"}
                      transition={shouldReduceMotion ? { duration: 0 } : undefined}
                      className="md-dexter-role-option inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-medium text-white outline-none dark:text-[var(--md-ink)]"
                      onClick={() => selectSpecialist(specialist.id)}
                    >
                      <Icon className="size-3.5 shrink-0" strokeWidth={1.3} aria-hidden="true" />
                      <span>{t(specialist.name)}</span>
                    </motion.button>
                  )
                })}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </>
  )
}

/**
 * The engine picker. Vendor model names stay behind a job description — Fast,
 * Smart, Worker — with the provider mark and a capability meter carrying the
 * detail, so the choice is about the work rather than a version string.
 */
export function DexterModelMenu({
  models = dexterModels,
  selectedId,
  onSelect,
  className,
}: {
  models?: DexterModel[]
  selectedId: DexterModelId
  onSelect: (id: DexterModelId) => void
  className?: string
}) {
  const { t } = useLanguage()
  const selected = models.find((model) => model.id === selectedId) ?? models[0]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("Change model")}
          className={cn(
            "md-composer-chip group/model inline-flex h-9 max-w-full items-center gap-2 rounded-full px-2.5 text-[13px] font-medium text-[var(--md-ink)]",
            className,
          )}
        >
          <ModelProviderGlyph
            provider={selected.provider}
            className="size-[15px] text-[var(--md-ink)] transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/model:scale-[1.08] motion-reduce:transition-none motion-reduce:group-hover/model:scale-100"
          />
          <SwapLabel value={t(selected.name)} className="max-w-[120px]" />
          <SwapLabel value={t(selected.tag)} className="hidden max-w-[86px] font-normal text-[var(--md-subtle)] sm:inline-grid" />
          {/* The same meter as the menu rows, so the reading the operator chose
              stays on screen after the menu closes and the two agree. */}
          <ModelStrengthMeter strength={selected.strength} size="sm" className="hidden md:inline-flex" />
          <ChevronDown className="md-composer-chip__caret size-3.5 shrink-0 text-[var(--md-subtle)]" strokeWidth={1.4} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" sideOffset={10} className="w-[318px] p-1.5">
        <DropdownMenuLabel className="pb-2 pt-1 text-[12px] font-medium text-[var(--md-ink)]">{t("Models")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={selectedId} onValueChange={(next) => onSelect(next as DexterModelId)}>
          {models.map((model) => (
            <DropdownMenuRadioItem
              key={model.id}
              value={model.id}
              className="gap-3 rounded-[var(--md-radius-lg)] py-2 ps-2"
            >
              <ModelProviderGlyph provider={model.provider} className="mt-0.5 size-[17px] text-[var(--md-ink)]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-[var(--md-ink)]">{t(model.name)}</span>
                <span className="mt-0.5 block text-[11.5px] leading-4 text-[var(--md-text)]">{t(model.description)}</span>
              </span>
              <ModelStrengthMeter strength={model.strength} className="mt-0.5 shrink-0" />
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function DexterAccessModeToggle({
  mode,
  onChange,
  className,
}: {
  mode: DexterAccessMode
  onChange: (mode: DexterAccessMode) => void
  className?: string
}) {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const isFullAccess = mode === "full"
  const approveLabel = t("Approve")
  const fullAccessLabel = t("Full access")
  const label = isFullAccess ? fullAccessLabel : approveLabel
  const description = isFullAccess
    ? t("Dexter can run allowlisted changes without asking again")
    : t("Dexter asks before every workspace change")
  const approveLabelRef = useRef<HTMLSpanElement>(null)
  const fullAccessLabelRef = useRef<HTMLSpanElement>(null)
  const [labelWidths, setLabelWidths] = useState<Record<DexterAccessMode, number> | null>(null)
  const transition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.18, ease: [0.22, 1, 0.36, 1] as const }
  const labelTransition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.12, ease: [0.22, 1, 0.36, 1] as const }

  useLayoutEffect(() => {
    const measureLabels = () => {
      const measuredApproveWidth = approveLabelRef.current?.getBoundingClientRect().width
      const measuredFullAccessWidth = fullAccessLabelRef.current?.getBoundingClientRect().width
      if (!measuredApproveWidth || !measuredFullAccessWidth) return

      // Fractional glyph bounds can be rounded down when Motion animates the
      // width. A small optical allowance keeps the final character and its
      // antialiasing inside the mask in every locale.
      const approveWidth = Math.ceil(measuredApproveWidth) + 3
      const fullAccessWidth = Math.ceil(measuredFullAccessWidth) + 3

      setLabelWidths((current) => (
        current?.approve === approveWidth && current.full === fullAccessWidth
          ? current
          : { approve: approveWidth, full: fullAccessWidth }
      ))
    }

    measureLabels()
    if (typeof ResizeObserver === "undefined") return

    const observer = new ResizeObserver(measureLabels)
    if (approveLabelRef.current) observer.observe(approveLabelRef.current)
    if (fullAccessLabelRef.current) observer.observe(fullAccessLabelRef.current)
    return () => observer.disconnect()
  }, [approveLabel, fullAccessLabel])

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isFullAccess}
      aria-label={`${label}. ${description}`}
      title={description}
      className={cn(
        "md-composer-chip inline-flex h-9 shrink-0 items-center gap-2 rounded-full px-2.5 text-[12.5px] font-medium transition-[background-color,color,box-shadow] duration-200",
        isFullAccess
          ? "bg-[rgba(209,78,78,0.11)] text-[var(--md-red)] shadow-[inset_0_0_0_1px_rgba(209,78,78,0.22)]"
          : "text-[var(--md-ink)]",
        className,
      )}
      onClick={() => onChange(isFullAccess ? "approve" : "full")}
    >
      <span className="relative grid size-[18px] shrink-0 place-items-center overflow-visible" aria-hidden="true">
        <motion.span
          className="absolute inset-0 grid place-items-center"
          initial={false}
          animate={isFullAccess
            ? { opacity: 0, scale: 0.82, rotate: -14 }
            : { opacity: 1, scale: 1, rotate: 0 }}
          transition={transition}
        >
          <Hand className="size-4" strokeWidth={1.35} />
        </motion.span>
        <motion.span
          className="absolute inset-0 grid place-items-center"
          initial={false}
          animate={isFullAccess
            ? { opacity: 1, scale: 1, rotate: 0 }
            : { opacity: 0, scale: 0.82, rotate: 14 }}
          transition={transition}
        >
          <TriangleAlert className="size-4" strokeWidth={1.45} />
        </motion.span>
      </span>
      <span
        className="relative inline-grid h-5 min-w-0 shrink-0 overflow-visible text-start leading-5 transition-[width] duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
        aria-hidden="true"
        style={labelWidths ? { width: labelWidths[mode] } : undefined}
      >
        <span
          className={cn(
            "invisible whitespace-nowrap",
            labelWidths ? "absolute inset-y-0 start-0" : "col-start-1 row-start-1",
          )}
        >
          {label}
        </span>
        <motion.span
          className="absolute inset-y-0 start-0 inline-flex items-center whitespace-nowrap"
          initial={false}
          animate={{ opacity: isFullAccess ? 0 : 1 }}
          transition={labelTransition}
        >
          <span ref={approveLabelRef}>{approveLabel}</span>
        </motion.span>
        <motion.span
          className="absolute inset-y-0 start-0 inline-flex items-center whitespace-nowrap"
          initial={false}
          animate={{ opacity: isFullAccess ? 1 : 0 }}
          transition={labelTransition}
        >
          <span ref={fullAccessLabelRef}>{fullAccessLabel}</span>
        </motion.span>
      </span>
    </button>
  )
}

const mentionTypeLabels: Record<DexterMentionType, string> = {
  email: "Email",
  booking: "Booking",
  customer: "Customer",
  lead: "Lead",
  deal: "Deal",
  page: "Page",
  quote: "Quote",
  document: "Document",
}

export function DexterMentionText({
  text,
  items = defaultDexterMentionItems,
}: {
  text: string
  items?: DexterMentionItem[]
}) {
  const { t } = useLanguage()
  const parts = useMemo(() => {
    if (!text.includes("@")) return [text]

    const byTitle = new Map(items.map((item) => [item.title.toLocaleLowerCase(), item]))
    const titles = [...byTitle.keys()]
    if (titles.length === 0) return [text]

    const nextParts: Array<string | DexterMentionItem> = []
    let cursor = 0

    for (const match of findDexterMentionMatches(text, titles)) {
      const item = byTitle.get(match.title.toLocaleLowerCase())
      if (!item) continue
      if (match.start > cursor) nextParts.push(text.slice(cursor, match.start))
      nextParts.push(item)
      cursor = match.end
    }

    if (cursor < text.length) nextParts.push(text.slice(cursor))
    return nextParts.length > 0 ? nextParts : [text]
  }, [items, text])

  return parts.map((part, index) => typeof part === "string"
    ? part
    : (
      <span
        key={`${part.type}:${part.id}:${index}`}
        className="md-dexter-mention md-dexter-mention--static"
        aria-label={`${t(mentionTypeLabels[part.type])}: ${part.title}`}
      >
        {part.logo ? <img src={part.logo} alt="" aria-hidden="true" /> : null}
        @{part.title}
      </span>
    ))
}

function readMentionEditorValue(node: HTMLElement) {
  return node.innerText.replaceAll("\u00a0", " ").replace(/\n$/, "")
}

function insertPlainTextAtSelection(text: string) {
  const selection = window.getSelection()
  if (!selection?.rangeCount) return

  const range = selection.getRangeAt(0)
  range.deleteContents()
  const textNode = document.createTextNode(text)
  range.insertNode(textNode)
  range.setStartAfter(textNode)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
}

export function DexterMentionInput({
  value,
  items = defaultDexterMentionItems,
  commands = [],
  selectedMentions,
  placeholder,
  minHeight,
  maxHeight,
  className,
  canSend,
  onChange,
  onMentionsChange,
  onUnavailableMention,
  onCommand,
  onSend,
}: {
  value: string
  items?: DexterMentionItem[]
  commands?: DexterSlashCommand[]
  selectedMentions: DexterMentionItem[]
  placeholder: string
  minHeight: number
  maxHeight: number
  className?: string
  canSend: boolean
  onChange: (value: string) => void
  onMentionsChange: (mentions: DexterMentionItem[]) => void
  onUnavailableMention?: (mention: DexterMentionItem) => void
  onCommand?: (command: DexterSlashCommand) => void
  onSend: (value: string) => void
}) {
  const { direction, t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const editorRef = useRef<HTMLDivElement>(null)
  const triggerRangeRef = useRef<Range | null>(null)
  const lastEmittedValueRef = useRef("")
  const listId = useId().replaceAll(":", "")
  const [query, setQuery] = useState<string | null>(null)
  const [menuKind, setMenuKind] = useState<"mention" | "command">("mention")
  const [activeIndex, setActiveIndex] = useState(0)
  const [announcement, setAnnouncement] = useState("")
  const [menuPosition, setMenuPosition] = useState<{
    left: number
    width: number
    top?: number
    bottom?: number
    placement: "top" | "bottom"
  } | null>(null)

  const results = useMemo(() => {
    const normalizedQuery = query?.trim().toLocaleLowerCase() ?? ""
    if (!normalizedQuery) {
      const typeOrder: DexterMentionType[] = ["email", "booking", "customer", "lead", "deal", "page", "quote", "document"]
      const firstFromEachType = typeOrder.flatMap((type) => items.filter((item) => item.type === type).slice(0, 1))
      const additionalItems = typeOrder.flatMap((type) => items.filter((item) => item.type === type).slice(1, 2))
      return [...firstFromEachType, ...additionalItems].slice(0, 8)
    }

    return items
      .map((item) => {
        const title = item.title.toLocaleLowerCase()
        const haystack = `${title} ${item.meta} ${item.keywords ?? ""} ${mentionTypeLabels[item.type]}`.toLocaleLowerCase()
        const score = title === normalizedQuery
          ? 0
          : title.startsWith(normalizedQuery)
            ? 1
            : title.includes(normalizedQuery)
              ? 2
              : haystack.includes(normalizedQuery)
                ? 3
                : 4
        return { item, score }
      })
      .filter(({ score }) => score < 4)
      .sort((a, b) => a.score - b.score || a.item.title.localeCompare(b.item.title))
      .slice(0, 8)
      .map(({ item }) => item)
  }, [items, query])

  const commandResults = useMemo(() => {
    if (menuKind !== "command") return []
    const normalizedQuery = query?.trim().toLocaleLowerCase() ?? ""
    return commands.filter((item) => {
      if (!normalizedQuery) return true
      return `${item.command} ${item.label} ${item.description}`.toLocaleLowerCase().includes(normalizedQuery)
    }).slice(0, 12)
  }, [commands, menuKind, query])

  const menuResultCount = menuKind === "command" ? commandResults.length : results.length

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  useLayoutEffect(() => {
    if (query === null) {
      setMenuPosition(null)
      return
    }

    function positionMenu() {
      const editor = editorRef.current
      if (!editor) return
      const rect = editor.getBoundingClientRect()
      const width = Math.min(rect.width, 620)
      const left = direction === "rtl" ? rect.right - width : rect.left
      const shouldOpenAbove = rect.top >= 320 || rect.top > window.innerHeight - rect.bottom
      setMenuPosition(shouldOpenAbove
        ? {
            left,
            width,
            bottom: window.innerHeight - rect.top + 10,
            placement: "top",
          }
        : {
            left,
            width,
            top: rect.bottom + 10,
            placement: "bottom",
          })
    }

    positionMenu()
    window.addEventListener("resize", positionMenu)
    window.addEventListener("scroll", positionMenu, true)
    return () => {
      window.removeEventListener("resize", positionMenu)
      window.removeEventListener("scroll", positionMenu, true)
    }
  }, [direction, query])

  useLayoutEffect(() => {
    const editor = editorRef.current
    if (!editor || value === lastEmittedValueRef.current) return

    if (readMentionEditorValue(editor) !== value) {
      editor.replaceChildren(document.createTextNode(value))
    }
    lastEmittedValueRef.current = value
    setQuery(null)
    triggerRangeRef.current = null
  }, [value])

  function syncSelectedMentions() {
    const editor = editorRef.current
    if (!editor) return

    const presentIds = new Set(
      [...editor.querySelectorAll<HTMLElement>("[data-md-dexter-mention]")]
        .map((node) => node.dataset.mentionId)
        .filter((id): id is string => Boolean(id)),
    )
    const nextMentions = selectedMentions.filter((mention) => presentIds.has(mention.id))
    if (nextMentions.length !== selectedMentions.length) onMentionsChange(nextMentions)
  }

  function updateMentionTrigger() {
    const editor = editorRef.current
    const selection = window.getSelection()
    if (!editor || !selection?.rangeCount || !selection.isCollapsed) {
      setQuery(null)
      triggerRangeRef.current = null
      return
    }

    const range = selection.getRangeAt(0)
    let textNode: Node | null = range.startContainer
    let caretOffset = range.startOffset

    // Chromium can report a collapsed contenteditable caret on the editor
    // element between text nodes rather than inside the preceding text node.
    // Resolve that boundary so @ search behaves the same for typing, dictation,
    // and browser automation.
    if (textNode.nodeType === Node.ELEMENT_NODE) {
      const previousNode = textNode.childNodes[caretOffset - 1]
      textNode = previousNode?.nodeType === Node.TEXT_NODE ? previousNode : null
      caretOffset = textNode?.textContent?.length ?? 0
    }

    if (!textNode || textNode.nodeType !== Node.TEXT_NODE || !editor.contains(textNode)) {
      setQuery(null)
      triggerRangeRef.current = null
      return
    }

    const textBeforeCaret = textNode.textContent?.slice(0, caretOffset) ?? ""
    const commandTrigger = commands.length > 0 ? textBeforeCaret.match(/^\/([^\s/]*)$/u) : null
    const mentionTrigger = textBeforeCaret.match(/(?:^|[\s([{])@([^\s@]*)$/u)
    const trigger = commandTrigger ?? mentionTrigger
    if (!trigger) {
      setQuery(null)
      triggerRangeRef.current = null
      return
    }

    const mentionRange = document.createRange()
    mentionRange.setStart(textNode, caretOffset - trigger[1].length - 1)
    mentionRange.setEnd(textNode, caretOffset)
    triggerRangeRef.current = mentionRange
    setMenuKind(commandTrigger ? "command" : "mention")
    setQuery(trigger[1])
  }

  function emitValue() {
    const editor = editorRef.current
    if (!editor) return
    const nextValue = readMentionEditorValue(editor)
    lastEmittedValueRef.current = nextValue
    if (["/watch", "/chat"].includes(nextValue.trim().toLowerCase())) {
      // These are mode switches, not prompt content. Clear the contenteditable
      // synchronously so the command cannot linger while React changes modes.
      editor.replaceChildren()
      lastEmittedValueRef.current = ""
    }
    onChange(nextValue)
  }

  function selectMention(item: DexterMentionItem) {
    if (item.disabled) {
      setAnnouncement(t(item.meta))
      setQuery(null)
      onUnavailableMention?.(item)
      return
    }
    const editor = editorRef.current
    const selection = window.getSelection()
    const triggerRange = triggerRangeRef.current
    if (!editor || !selection || !triggerRange) return

    triggerRange.deleteContents()
    const mention = document.createElement("span")
    mention.className = "md-dexter-mention"
    mention.dataset.mdDexterMention = "true"
    mention.dataset.mentionId = item.id
    mention.dataset.mentionType = item.type
    mention.dataset.mentionTitle = item.title
    mention.contentEditable = "false"
    mention.setAttribute("aria-label", `${t(mentionTypeLabels[item.type])}: ${item.title}`)
    if (item.logo) {
      const logo = document.createElement("img")
      logo.src = item.logo
      logo.alt = ""
      logo.setAttribute("aria-hidden", "true")
      mention.append(logo)
    }
    mention.append(document.createTextNode(`@${item.title}`))

    const spacer = document.createTextNode("\u00a0")
    triggerRange.insertNode(spacer)
    triggerRange.insertNode(mention)
    triggerRange.setStartAfter(spacer)
    triggerRange.collapse(true)
    selection.removeAllRanges()
    selection.addRange(triggerRange)

    const nextMentions = selectedMentions.some((selected) => selected.id === item.id)
      ? selectedMentions
      : [...selectedMentions, item]
    onMentionsChange(nextMentions)
    setQuery(null)
    triggerRangeRef.current = null
    setAnnouncement(`${t("Mentioned")} ${t(mentionTypeLabels[item.type])} ${item.title}`)
    emitValue()
    editor.focus()
  }

  function selectCommand(item: DexterSlashCommand) {
    if (item.disabled) return
    const editor = editorRef.current
    if (!editor) return
    editor.replaceChildren()
    lastEmittedValueRef.current = ""
    setQuery(null)
    triggerRangeRef.current = null
    onChange("")
    onCommand?.(item)
    setAnnouncement(`${t("Command selected")}: ${item.command}`)
    editor.focus()
  }

  function handleInput(_event: FormEvent<HTMLDivElement>) {
    emitValue()
    syncSelectedMentions()
    updateMentionTrigger()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const menuOpen = query !== null
    if (menuOpen && menuResultCount > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault()
        setActiveIndex((index) => (index + 1) % menuResultCount)
        return
      }
      if (event.key === "ArrowUp") {
        event.preventDefault()
        setActiveIndex((index) => (index - 1 + menuResultCount) % menuResultCount)
        return
      }
      if (event.key === "Tab" || (event.key === "Enter" && !event.shiftKey)) {
        event.preventDefault()
        if (menuKind === "command") selectCommand(commandResults[activeIndex] ?? commandResults[0])
        else selectMention(results[activeIndex] ?? results[0])
        return
      }
    }

    if (menuOpen && event.key === "Escape") {
      event.preventDefault()
      setQuery(null)
      triggerRangeRef.current = null
      return
    }

    if (event.key !== "Enter" || event.shiftKey || event.altKey) return
    event.preventDefault()
    const liveValue = editorRef.current ? readMentionEditorValue(editorRef.current) : value
    if (liveValue.trim()) onSend(liveValue)
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    event.preventDefault()
    insertPlainTextAtSelection(event.clipboardData.getData("text/plain"))
    emitValue()
    updateMentionTrigger()
  }

  const activeResult = menuKind === "command" ? commandResults[activeIndex] : results[activeIndex]

  const mentionMenu = typeof document !== "undefined"
    ? createPortal(
      <AnimatePresence initial={false}>
        {query !== null && menuPosition ? (
          <motion.div
            id={listId}
            role="listbox"
            aria-label={t(menuKind === "command" ? "Dexter commands" : "Mention workspace context")}
            className={cn(
              "md-dexter-mention-menu fixed z-[100] overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-lift)]",
              menuKind === "command" ? "p-1" : "p-1.5",
            )}
            initial={shouldReduceMotion ? false : { opacity: 0, y: menuPosition.placement === "top" ? 7 : -7, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={shouldReduceMotion ? undefined : { opacity: 0, y: menuPosition.placement === "top" ? 4 : -4, scale: 0.99 }}
            transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.panel)}
            style={{
              left: menuPosition.left,
              width: menuPosition.width,
              top: menuPosition.top,
              bottom: menuPosition.bottom,
              transformOrigin: menuPosition.placement === "top" ? "bottom center" : "top center",
            }}
          >
            {menuKind === "mention" ? (
              <div className="flex items-center justify-between gap-3 px-2.5 pb-1.5 pt-1">
                <p className="text-[11.5px] font-medium text-[var(--md-subtle)]">{t("Mention workspace context")}</p>
                <p className="hidden text-[11px] text-[var(--md-subtle)] sm:block">{t("Use arrows to choose · Enter to add")}</p>
              </div>
            ) : null}
            <div className="md-scrollbar max-h-[276px] overflow-y-auto">
              <LayoutGroup id={`dexter-mention-${listId}`}>
                {menuKind === "command" ? commandResults.map((item, index) => {
                  const Icon = item.icon
                  const active = index === activeIndex
                  const startsGroup = index === 0 || commandResults[index - 1]?.group !== item.group

                  return (
                    <div key={item.id}>
                      {startsGroup ? <p className={cn("px-2 pb-0.5 text-[10px] font-medium leading-4 text-[var(--md-subtle)]", index === 0 ? "pt-0.5" : "pt-1")}>{t("Modes")}</p> : null}
                      <button
                        id={`${listId}-option-${index}`}
                        type="button"
                        role="option"
                        aria-selected={!item.disabled && active}
                        aria-disabled={item.disabled || undefined}
                        aria-label={`${item.command} — ${t(item.label)}. ${t(item.description)}`}
                        className={cn(
                          "relative grid min-h-8 w-full grid-cols-[24px_minmax(0,1fr)] items-center gap-2 rounded-[var(--md-radius-md)] px-2 py-1 text-start outline-none",
                          item.disabled && "opacity-55",
                        )}
                        onMouseDown={(event) => event.preventDefault()}
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => selectCommand(item)}
                      >
                        {active && !item.disabled ? (
                          <motion.span
                            layoutId="active-command-result"
                            aria-hidden="true"
                            className="absolute inset-0 rounded-[var(--md-radius-md)] bg-[var(--md-accent-a10)] shadow-[inset_0_0_0_1px_var(--md-accent-a18)]"
                            transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.spring)}
                          />
                        ) : null}
                        <span className="relative grid size-6 place-items-center text-[var(--md-accent)]">
                          <Icon className="size-[15px]" strokeWidth={1.5} aria-hidden="true" />
                        </span>
                        <span className="relative flex min-w-0 items-baseline gap-2">
                          <span className="shrink-0 text-[12.5px] font-medium text-[var(--md-ink)]" dir="ltr" data-i18n-skip>{item.command}</span>
                          <span className="min-w-0 truncate text-[11.5px] text-[var(--md-subtle)]">{t(item.description)}</span>
                          {item.selected ? <span className="sr-only">{t("Current")}</span> : null}
                        </span>
                      </button>
                    </div>
                  )
                }) : results.map((item, index) => {
                  const Icon = item.icon
                  const active = index === activeIndex

                  return (
                    <button
                      key={item.id}
                      id={`${listId}-option-${index}`}
                      type="button"
                      role="option"
                      aria-selected={!item.disabled && active}
                      aria-disabled={item.disabled || undefined}
                      className={cn(
                        "relative grid min-h-12 w-full grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-[var(--md-radius-lg)] px-2.5 py-2 text-start outline-none",
                        item.disabled && "text-[var(--md-subtle)]",
                      )}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => selectMention(item)}
                    >
                      {active && !item.disabled ? (
                        <motion.span
                          layoutId="active-mention-result"
                          aria-hidden="true"
                          className="absolute inset-0 rounded-[var(--md-radius-lg)] bg-[var(--md-accent-a10)] shadow-[inset_0_0_0_1px_var(--md-accent-a18)]"
                          transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.spring)}
                        />
                      ) : null}
                      <span className="relative grid size-8 place-items-center rounded-[var(--md-radius-md)] bg-[var(--md-icon-well)] text-[var(--md-accent)]">
                        {item.logo ? (
                          <img src={item.logo} alt="" aria-hidden="true" className="size-[18px] object-contain" />
                        ) : (
                          <Icon className="size-4" strokeWidth={1.3} />
                        )}
                      </span>
                      <span className="relative min-w-0">
                        <span className="block truncate text-[13px] font-medium text-[var(--md-ink)]">{item.title}</span>
                        <span className="mt-0.5 block truncate text-[11.5px] text-[var(--md-subtle)]">{t(item.meta)}</span>
                      </span>
                      <span className="relative rounded-[var(--md-radius-sm)] bg-[var(--md-surface-tint)] px-2 py-1 text-[10.5px] font-medium text-[var(--md-text)]">
                        {t(item.disabled && item.unavailableRoute ? "Settings" : mentionTypeLabels[item.type])}
                      </span>
                    </button>
                  )
                })}
              </LayoutGroup>
              {menuResultCount === 0 ? (
                <div className="px-3 py-5 text-center">
                  <p className="text-[13px] font-medium text-[var(--md-ink)]">{t(menuKind === "command" ? "No matching commands" : "No matching workspace items")}</p>
                  <p className="mt-1 text-[11.5px] text-[var(--md-subtle)]">{t(menuKind === "command" ? "Try chat or watch." : "Try Gmail, Outlook, a booking reference, customer, lead, quote or page name.")}</p>
                </div>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>,
      document.body,
    )
    : null

  return (
    <div className="relative">
      {mentionMenu}

      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        role="combobox"
        aria-label={t("Message Dexter")}
        aria-autocomplete="list"
        aria-expanded={query !== null}
        aria-controls={query !== null ? listId : undefined}
        aria-activedescendant={query !== null && activeResult ? `${listId}-option-${activeIndex}` : undefined}
        aria-haspopup="listbox"
        data-placeholder={t(placeholder)}
        dir="auto"
        className={cn(
          "md-dexter-mention-editor w-full overflow-y-auto border-0 bg-transparent text-[15px] leading-6 text-[var(--md-ink)] outline-none",
          className,
        )}
        style={{ minHeight, maxHeight }}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onKeyUp={(event) => {
          if (["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(event.key)) return
          updateMentionTrigger()
        }}
        onClick={updateMentionTrigger}
        onPaste={handlePaste}
      />
      <span className="sr-only" aria-live="polite">{announcement}</span>
    </div>
  )
}

export function DexterPromptComposer({
  value,
  specialists = defaultDexterSpecialists,
  selectedSpecialistId,
  models = dexterModels,
  selectedModelId,
  accessMode,
  contextUsedTokens = 0,
  contextMaxTokens = 128_000,
  attachments = [],
  commands = [],
  mentionItems = defaultDexterMentionItems,
  selectedMentions,
  placeholder = "Ask anything, @ a record, or / for a command",
  onChange,
  onMentionsChange,
  onUnavailableMention,
  onOpenAttachments,
  onSelectSpecialist,
  onSelectModel,
  onAccessModeChange,
  onCommand,
  onRemoveAttachment,
  onSend,
  isSending = false,
  mode = "chat",
  compact = false,
  className,
}: {
  value: string
  specialists?: DexterSpecialist[]
  selectedSpecialistId: DexterSpecialistId
  models?: DexterModel[]
  selectedModelId: DexterModelId
  accessMode: DexterAccessMode
  contextUsedTokens?: number
  contextMaxTokens?: number
  attachments?: DexterAttachment[]
  commands?: DexterSlashCommand[]
  mentionItems?: DexterMentionItem[]
  selectedMentions?: DexterMentionItem[]
  placeholder?: string
  onChange: (value: string) => void
  onMentionsChange?: (mentions: DexterMentionItem[]) => void
  onUnavailableMention?: (mention: DexterMentionItem) => void
  onOpenAttachments: () => void
  onSelectSpecialist: (id: DexterSpecialistId) => void
  onSelectModel: (id: DexterModelId) => void
  onAccessModeChange: (mode: DexterAccessMode) => void
  onCommand?: (command: DexterSlashCommand) => void
  onRemoveAttachment?: (id: string) => void
  onSend: (value?: string) => void
  isSending?: boolean
  /** Watch mode has one deterministic job, so it does not expose role routing. */
  mode?: "chat" | "watch"
  compact?: boolean
  className?: string
}) {
  const { language, t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const sendShortcutModifier = useSendShortcutModifier()
  const [internalMentions, setInternalMentions] = useState<DexterMentionItem[]>([])
  const canSend = value.trim().length > 0
  const minRows = compact ? 52 : 76
  const maxRows = compact ? 168 : 232
  const activeMentions = selectedMentions ?? internalMentions
  const handleMentionsChange = onMentionsChange ?? setInternalMentions

  return (
    <div
      className={cn(
        // `overflow-hidden` keeps the shared Dexter shader inside the shell's
        // rounded top corners.
        "md-composer md-composer-bloom relative overflow-hidden rounded-[26px]",
        className,
      )}
    >
      <span aria-hidden="true" className="md-composer-bloom__shader">
        <SpectralBloomShader shape="composer" />
      </span>
      <span aria-hidden="true" className="md-composer-bloom__contrast" />

      <div className="md-dexter-role-container relative z-[2] flex h-[44px] min-w-0 items-center px-3 sm:px-3.5">
        {mode === "watch" ? (
          <span className="md-composer-lead inline-flex h-8 items-center rounded-full px-2.5 text-[13px] font-medium text-white dark:text-[var(--md-ink)]">
            {t("Watcher")}
          </span>
        ) : (
          <DexterRoleMenu specialists={specialists} selectedId={selectedSpecialistId} onSelect={onSelectSpecialist} />
        )}
      </div>

      <div className="relative z-[2] mx-1.5 mb-1.5 rounded-[21px] bg-[var(--md-composer-panel-bg)] shadow-[inset_0_0_0_1px_var(--md-composer-panel-line)]">
        <div className="flex flex-col px-4 pb-3 pt-3.5 sm:px-5 sm:pb-3.5">
          <AnimatePresence initial={false}>
            {attachments.length > 0 ? (
              <motion.div
                key="composer-attachments"
                className="flex flex-wrap gap-2 overflow-hidden"
                initial={shouldReduceMotion ? false : { height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1, marginBottom: 12 }}
                exit={shouldReduceMotion ? undefined : { height: 0, opacity: 0, marginBottom: 0 }}
                transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.panel)}
              >
                <AnimatePresence initial={false} mode="popLayout">
                  {attachments.map((attachment) => {
                    const Icon = attachment.icon

                    return (
                      <motion.span
                        key={attachment.id}
                        layout={!shouldReduceMotion}
                        initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.86 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={shouldReduceMotion ? undefined : { opacity: 0, scale: 0.86 }}
                        transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.spring)}
                        className="inline-flex h-8 max-w-full items-center gap-2 rounded-full bg-[var(--md-accent-a08)] px-3 text-[13px] font-medium text-[var(--md-ink)] shadow-[0_0_0_1px_var(--md-accent-a20)]"
                      >
                        <Icon className="size-3.5 shrink-0 text-[var(--md-accent)]" strokeWidth={1.2} />
                        <span className="truncate">{attachment.title}</span>
                        <span className="hidden text-[var(--md-subtle)] sm:inline">
                          {t(attachment.type === "uploaded_document" ? "Computer file" : attachment.type)}
                        </span>
                        {onRemoveAttachment ? (
                          <button
                            type="button"
                            className="-me-1 grid size-5 shrink-0 place-items-center rounded-full text-[var(--md-subtle)] transition-[background-color,color,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] active:scale-90 motion-reduce:transition-none motion-reduce:active:scale-100"
                            onClick={() => onRemoveAttachment(attachment.id)}
                            aria-label={`${t("Remove")} ${attachment.title}`}
                          >
                            <X className="size-3" strokeWidth={1.4} />
                          </button>
                        ) : null}
                      </motion.span>
                    )
                  })}
                </AnimatePresence>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <DexterMentionInput
            value={value}
            items={mentionItems}
            commands={commands}
            selectedMentions={activeMentions}
            placeholder={t(placeholder)}
            minHeight={minRows}
            maxHeight={maxRows}
            canSend={canSend}
            onChange={onChange}
            onMentionsChange={handleMentionsChange}
            onUnavailableMention={onUnavailableMention}
            onCommand={onCommand}
            onSend={(liveValue) => onSend(liveValue)}
          />

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("Attach context")}
              title={t("Attach context")}
              className="md-composer-chip size-9 shrink-0 rounded-full text-[var(--md-text)] hover:text-[var(--md-ink)]"
              onClick={onOpenAttachments}
            >
              <Plus className="size-4" strokeWidth={1.4} />
            </Button>
            <PillFrame>
              <DexterModelMenu models={models} selectedId={selectedModelId} onSelect={onSelectModel} />
            </PillFrame>
            <Context
              usedTokens={contextUsedTokens}
              maxTokens={contextMaxTokens}
              label={t("Conversation context")}
              description={t("How much of this chat Dexter can keep in mind.")}
              locale={language}
            >
              <ContextTrigger className="md-composer-chip h-9 shrink-0 rounded-full px-2.5 text-[12.5px] text-[var(--md-text)] hover:text-[var(--md-ink)]" />
              <ContextContent align="center" side="top" sideOffset={10}>
                <ContextContentHeader />
              </ContextContent>
            </Context>
            <DexterAccessModeToggle mode={accessMode} onChange={onAccessModeChange} />
            <motion.div
              className="ms-auto flex shrink-0 items-center gap-2"
              animate={{ scale: canSend ? 1 : 0.94, opacity: canSend ? 1 : 0.55 }}
              transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.spring)}
            >
              <span
                aria-hidden="true"
                title={`${sendShortcutModifier} + Enter`}
                className="hidden h-10 items-center rounded-[var(--md-radius-lg)] px-1.5 sm:inline-flex"
              >
                <KbdGroup dir="ltr" data-i18n-skip>
                  <Kbd>{sendShortcutModifier}</Kbd>
                  <Kbd>↵</Kbd>
                </KbdGroup>
              </span>
              <DexterActionPill
                type="button"
                icon={ArrowUp}
                iconOnly
                label={`${t("Send prompt")} (${sendShortcutModifier} + Enter)`}
                aria-keyshortcuts="Meta+Enter Control+Enter"
                className="size-10 min-w-0 rounded-full p-0"
                onClick={() => onSend()}
                disabled={!canSend || isSending}
              />
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function DexterSpecialistPicker({
  specialists,
  selectedId,
  onSelect,
  className,
}: {
  specialists: DexterSpecialist[]
  selectedId: DexterSpecialistId
  onSelect: (id: DexterSpecialistId) => void
  className?: string
}) {
  return (
    <Surface padding="md" className={cn("rounded-[var(--md-radius-xl)]", className)}>
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-[14px] font-medium text-[var(--md-ink)]">Specialists</h2>
        <p className="text-[13px] text-[var(--md-text)]">On Auto, Dexter picks the right one for each request.</p>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {specialists.map((specialist) => {
          const Icon = specialist.icon
          const selected = specialist.id === selectedId

          return (
            <button
              key={specialist.id}
              type="button"
              className={cn(
                "grid grid-cols-[38px_1fr_18px] items-center gap-3 rounded-[var(--md-radius-lg)] p-3 text-left transition-[background,color,box-shadow,opacity,transform] duration-200",
                selected ? "bg-[var(--md-bg-strong)] shadow-[var(--md-shadow-line)]" : "hover:bg-[var(--md-hover)]",
              )}
              onClick={() => onSelect(specialist.id)}
            >
              <span className={cn("grid size-8 place-items-center rounded-[var(--md-radius-md)]", specialistTone[specialist.id])}>
                <Icon className="size-4" strokeWidth={1.2} />
              </span>
              <span className="min-w-0">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-[14px] font-medium text-[var(--md-ink)]">{specialist.name}</span>
                  {specialist.label ? (
                    <span className="rounded-full bg-[var(--md-accent-a10)] px-2 py-0.5 text-[10.5px] font-medium text-[var(--md-accent)]">
                      {specialist.label}
                    </span>
                  ) : null}
                </span>
                <span className="mt-0.5 block truncate text-[12px] text-[var(--md-text)]">{specialist.description}</span>
              </span>
              {selected ? <Check className="size-4 text-[var(--md-accent)]" strokeWidth={1.4} /> : null}
            </button>
          )
        })}
      </div>
    </Surface>
  )
}

export function DexterAttachmentPalette({
  query,
  items,
  selectedIds,
  recommendedIds = [],
  onQueryChange,
  onToggle,
  onUploadFiles,
  isUploading = false,
  uploadError,
  onClose,
  className,
}: {
  query: string
  items: DexterAttachment[]
  selectedIds: Set<string>
  recommendedIds?: string[]
  onQueryChange: (value: string) => void
  onToggle: (id: string) => void
  onUploadFiles?: (files: File[]) => void
  isUploading?: boolean
  uploadError?: string | null
  onClose?: () => void
  className?: string
}) {
  const { t } = useLanguage()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const filtered = items.filter((item) => `${item.title} ${item.meta} ${item.type}`.toLowerCase().includes(query.toLowerCase()))
  const recommended = recommendedIds
    .map((id) => items.find((item) => item.id === id))
    .filter((item): item is DexterAttachment => Boolean(item))
    .filter((item) => `${item.title} ${item.meta} ${item.type}`.toLowerCase().includes(query.toLowerCase()))

  function selectItem(id: string) {
    onToggle(id)
    onClose?.()
  }

  return (
    <Surface padding="none" className={cn("flex max-h-[min(620px,calc(100vh-220px))] flex-col overflow-hidden rounded-[var(--md-radius-2xl)]", className)}>
      <div className="flex items-center gap-3 border-b border-[rgba(11,20,19,0.06)] px-5 py-4">
        <Search className="size-4 text-[var(--md-text)]" strokeWidth={1.2} />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={t("Search bookings, customers, documents...")}
          className="min-w-0 flex-1 border-0 bg-transparent text-[16px] text-[var(--md-ink)] outline-none placeholder:text-[var(--md-subtle)]"
        />
        {onClose ? (
          <Button type="button" variant="ghost" size="icon-sm" className="rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)]" onClick={onClose}>
            <X className="size-4" strokeWidth={1.2} />
            <span className="sr-only">{t("Close")}</span>
          </Button>
        ) : (
          <span className="rounded-[var(--md-radius-sm)] bg-[var(--md-surface-tint)] px-2 py-1 text-[11px] font-medium text-[var(--md-text)]">esc</span>
        )}
      </div>

      {onUploadFiles ? (
        <div className="px-5 pt-4">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.txt,.csv,.docx,.xlsx,.pptx,.png,.jpg,.jpeg,.webp"
            className="sr-only"
            onChange={(event) => {
              const files = Array.from(event.currentTarget.files ?? [])
              event.currentTarget.value = ""
              if (files.length) onUploadFiles(files)
            }}
          />
          <button
            type="button"
            className="flex min-h-14 w-full items-center gap-3 rounded-[var(--md-radius-xl)] bg-[var(--md-accent-a08)] px-4 py-3 text-start shadow-[inset_0_0_0_1px_var(--md-accent-a16)] transition-[background-color,transform] duration-200 hover:bg-[var(--md-accent-a12)] active:scale-[0.995] disabled:cursor-wait disabled:opacity-70 motion-reduce:transition-none motion-reduce:active:scale-100"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] text-[var(--md-accent)] shadow-[var(--md-shadow-line)]">
              {isUploading
                ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" strokeWidth={1.5} />
                : <Upload className="size-4" strokeWidth={1.5} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium text-[var(--md-ink)]">
                {t(isUploading ? "Uploading document..." : "Upload from computer")}
              </span>
              <span className="mt-0.5 block text-[11.5px] text-[var(--md-text)]">
                {t("PDF, Office, text, spreadsheet or image · up to 25 MB each")}
              </span>
            </span>
          </button>
          {uploadError ? <p role="alert" className="mt-2 text-[12px] text-[var(--md-red)]">{t(uploadError)}</p> : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 px-5 py-3">
        {["All 12", "Bookings 6", "Customers 2", "Documents 4"].map((filter, index) => (
          <span
            key={filter}
            className={cn(
              "rounded-full px-3 py-1.5 text-[12px] font-medium shadow-[var(--md-shadow-line)]",
              index === 0 ? "bg-[var(--md-ink)] text-white" : "bg-white/64 text-[var(--md-text)]",
            )}
          >
            {filter}
          </span>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 md-scrollbar">
        {recommended.length > 0 ? (
          <div className="mb-3 rounded-[var(--md-radius-xl)] bg-[rgba(233,242,240,0.72)] p-2 shadow-[var(--md-shadow-line)]">
            <div className="px-2 py-2">
              <p className="text-[12px] font-medium text-[var(--md-ink)]">Recommended from this thread</p>
              <p className="mt-1 text-[11px] text-[var(--md-text)]">Based on the customer, booking IDs, and documents already mentioned.</p>
            </div>
            <div className="grid gap-1">
              {recommended.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="grid min-h-12 grid-cols-[32px_1fr_auto] items-center gap-3 rounded-[var(--md-radius-lg)] px-3 py-2 text-left text-[13px] transition-[background,color,box-shadow,opacity,transform] duration-200 hover:bg-white/64"
                  onClick={() => selectItem(item.id)}
                >
                  <AttachmentIcon attachment={item} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-[var(--md-ink)]">{item.title}</span>
                    <span className="block truncate text-[12px] text-[var(--md-text)]">{item.meta}</span>
                  </span>
                  <span className="text-[12px] font-medium text-[var(--md-accent)]">{selectedIds.has(item.id) ? "Attached" : "Attach"}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {["booking", "customer", "document"].map((type) => {
          const group = filtered.filter((item) => item.type === type && !recommendedIds.includes(item.id))
          if (group.length === 0) return null

          return (
            <div key={type} className="mt-2">
              <p className="px-2 py-2 text-[12px] font-medium capitalize text-[var(--md-subtle)]">{type}s</p>
              <div className="grid gap-1">
                {group.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={cn(
                      "grid min-h-12 grid-cols-[32px_minmax(96px,150px)_1fr_auto] items-center gap-3 rounded-[var(--md-radius-lg)] px-3 py-2 text-left text-[13px] transition-[background,color,box-shadow,opacity,transform] duration-200",
                      selectedIds.has(item.id) ? "bg-[var(--md-bg-strong)]" : "hover:bg-[var(--md-hover)]",
                    )}
                    onClick={() => selectItem(item.id)}
                  >
                    <span className="size-2.5 rounded-full" style={{ background: toneToVar(item.tone) }} />
                    <span className="font-medium text-[var(--md-ink)]">{item.title}</span>
                    <span className="truncate text-[var(--md-text)]">{item.meta}</span>
                    <span className="text-[12px] font-medium text-[var(--md-accent)]">{selectedIds.has(item.id) ? "Attached" : "Attach"}</span>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-4 bg-[var(--md-surface-tint)] px-5 py-3 text-[12px] text-[var(--md-text)]">
        <span className="font-medium text-[var(--md-accent)]">Attached items become live context</span>
        <span>Dexter sees their full timeline, docs, and customer state.</span>
      </div>
    </Surface>
  )
}

/**
 * The recent-conversation rail. One line per thread, because the titles are the
 * prompts the operator typed and a two-line preview of their own words earns
 * nothing — so the column can be narrow and the whole day fits without scrolling.
 */
export function DexterHistoryList({
  items,
  activeId,
  onSelect,
  onNew,
}: {
  items: DexterHistoryItem[]
  activeId: string
  onSelect: (id: string) => void
  onNew: () => void
}) {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()

  return (
    <aside className="relative flex h-screen min-h-0 flex-col overflow-hidden bg-[var(--md-sidebar-bg)] shadow-[inset_-1px_0_0_rgba(11,20,19,0.055)]">
      <div className="flex h-[60px] shrink-0 items-center justify-between gap-2 px-3.5">
        <h2 className="truncate text-[14px] font-medium text-[var(--md-ink)]">{t("History")}</h2>
        <button
          type="button"
          className="md-dexter-header-action -me-1 text-[12.5px] font-medium"
          onClick={onNew}
          title={t("New conversation")}
          aria-label={t("New conversation")}
        >
          <Plus className="size-4 shrink-0" strokeWidth={1.5} />
          <span className="md-dexter-header-action__label" aria-hidden="true">{t("New")}</span>
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-4 md-scrollbar">
        <p className="px-2 pb-1.5 pt-1 text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--md-subtle)]">{t("Today")}</p>
        <div className="grid min-w-0 gap-0.5">
          {items.map((item, index) => (
            <motion.button
              key={item.id}
              type="button"
              className={cn(
                "md-history-row grid h-8 min-w-0 grid-cols-[3px_minmax(0,1fr)_auto] items-center gap-1.5 rounded-[var(--md-radius-lg)] pe-2 ps-1.5 text-start",
                activeId === item.id
                  ? "bg-[var(--md-surface)] text-[var(--md-ink)] shadow-[var(--md-shadow-line)]"
                  : "text-[var(--md-text)] hover:text-[var(--md-ink)]",
              )}
              data-active={activeId === item.id ? "true" : undefined}
              title={item.title}
              initial={shouldReduceMotion ? false : { opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={
                shouldReduceMotion
                  ? { duration: 0 }
                  : { ...mdMotion.enter, delay: 0.08 + staggerRamp(index, 0.03) }
              }
              onClick={() => onSelect(item.id)}
            >
              <span className="md-history-row__rail block h-3.5 w-[3px] rounded-full" aria-hidden="true" />
              <span className="truncate text-[13px] font-medium">{item.title}</span>
              <span className="md-history-row__time shrink-0 text-[11px] tabular-nums text-[var(--md-subtle)]">{item.time}</span>
            </motion.button>
          ))}
        </div>
      </div>
    </aside>
  )
}

/**
 * One monitor, floating on the rail's wash rather than sitting in a panel. The
 * tone dot carries both the severity and the liveness — a halo breathes out of
 * it on a long cycle, offset per card so the stack never pulses in unison.
 */
export function DexterMonitorCard({
  monitor,
  index = 0,
  active = false,
  onClick,
}: {
  monitor: DexterMonitor
  index?: number
  /** Its detail pane is open, so the row holds a selected state. */
  active?: boolean
  onClick?: () => void
}) {
  const { t } = useLanguage()

  return (
    <button
      type="button"
      data-active={active ? "true" : undefined}
      aria-expanded={onClick ? active : undefined}
      className="md-watch-card block w-full rounded-[16px] p-3.5 text-start"
      onClick={onClick}
    >
      <span className="flex items-start gap-2.5">
        <span
          className="md-watch-dot mt-[5px] shrink-0"
          style={{ color: toneToVar(monitor.tone), "--md-watch-delay": `${index * 0.9}s` } as CSSProperties}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 block break-words text-[13px] font-medium leading-[1.4] text-[var(--md-ink)]">{monitor.title}</span>
          <span className="mt-1.5 line-clamp-2 block break-words text-[12px] leading-[1.55] text-[var(--md-text)]">{monitor.body}</span>
        </span>
      </span>
      <span className="md-watch-card__meta mt-3 grid min-w-0 gap-1.5 pt-2.5 text-[11px] text-[var(--md-subtle)]">
        <span className="font-medium">{t(monitor.meta)}</span>
        <span className="flex min-w-0 items-start gap-1">
          <span className="line-clamp-2 min-w-0 flex-1 break-words">{monitor.detail}</span>
          <ArrowRight className="md-watch-card__go size-3 shrink-0 text-[var(--md-accent)]" strokeWidth={1.4} />
        </span>
      </span>
    </button>
  )
}

/**
 * The watch rail. No panel colour and no dividing border: a wash that thickens
 * toward the outer edge marks the zone, the header floats on a progressive blur
 * so cards dissolve as they scroll under it, and the whole thing fades up on
 * mount instead of appearing as a block.
 */
export function DexterMonitorStack({
  monitors,
  activeId = null,
  onCollapse,
  onAsk,
  onSelectMonitor,
}: {
  monitors: DexterMonitor[]
  /** The open watcher, so the list shows which card the detail belongs to. */
  activeId?: string | null
  onCollapse?: () => void
  onAsk?: () => void
  onSelectMonitor?: (monitor: DexterMonitor) => void
}) {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()

  return (
    <aside className="relative flex h-full min-h-0 flex-col">
      <motion.span
        aria-hidden="true"
        className="md-watch-rail__wash"
        initial={shouldReduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.5, ease: mdEaseOut }}
      />

      <div className="md-scrollbar relative min-h-0 flex-1 overflow-y-auto px-4 pb-[76px] pt-[86px]">
        <div className="grid gap-2.5">
          {monitors.length === 0 ? (
            <div className="rounded-[16px] bg-[var(--md-surface-tint)] px-4 py-5 text-[13px] leading-5 text-[var(--md-text)] shadow-[var(--md-shadow-line)]">
              <p className="font-medium text-[var(--md-ink)]">{t("Nothing is being watched yet")}</p>
              <p className="mt-1.5">{t("Type /watch in Dexter, then describe the change that matters.")}</p>
            </div>
          ) : null}
          {monitors.map((monitor, index) => (
            <motion.div
              key={monitor.id ?? `${monitor.title}-${index}`}
              initial={shouldReduceMotion ? false : { opacity: 0, y: 10, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={
                shouldReduceMotion
                  ? { duration: 0 }
                  : { ...mdMotion.page, delay: 0.12 + staggerRamp(index, 0.055) }
              }
            >
              <DexterMonitorCard
                monitor={monitor}
                index={index}
                active={Boolean(monitor.id && activeId === monitor.id)}
                onClick={() => onSelectMonitor?.(monitor)}
              />
            </motion.div>
          ))}
        </div>
      </div>

      <ProgressiveBlur className="md-watch-rail__edge-blur" edge="top" tone="rail" height={88} tint="var(--md-bg-strong)" />
      <ProgressiveBlur className="md-watch-rail__edge-blur" edge="bottom" tone="rail" height={72} offset={52} tint="var(--md-bg-strong)" />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-[2] flex items-center gap-2 px-4 pt-[22px] max-sm:ps-[72px]">
        <h2 className="flex min-w-0 items-center gap-2 text-[14px] font-medium text-[var(--md-ink)]">
          <span className="md-dexter-live-dot shrink-0" aria-hidden="true" />
          <span className="truncate">{t("Watching for you")}</span>
        </h2>
        <span className="shrink-0 text-[12px] text-[var(--md-subtle)]">{monitors.length}</span>
        {onCollapse ? (
          <button
            type="button"
            className="md-dexter-header-action pointer-events-auto ms-auto max-sm:!hidden text-[12px] font-medium"
            onClick={onCollapse}
            title={t("Hide watchers")}
            aria-label={t("Hide watchers")}
          >
            <span className="md-dexter-header-action__label" aria-hidden="true">{t("Hide")}</span>
            <ArrowRight className="size-3.5 shrink-0" strokeWidth={1.5} />
          </button>
        ) : null}
      </div>

      <div className="absolute inset-x-0 bottom-0 z-[2] px-4 pb-4">
        <DexterActionPill
          label={t("Watch something else")}
          className="h-11 w-full rounded-[var(--md-radius-lg)] text-[12.5px]"
          onClick={onAsk}
        />
      </div>
    </aside>
  )
}

/** One viewport-contained surface. The fade is painted outside this width. */
const watchRailWidth = 336
const watchRailMinWidth = 288
const watchShellMaxWidth = 840
const watchDetailMinWidth = 360
const watchMinThreadWidth = 420

function useWatchRailWidths(detailOpen: boolean, collapsed: boolean) {
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === "undefined" ? 1440 : window.innerWidth,
  )

  useEffect(() => {
    const onResize = () => setViewportWidth(document.documentElement.clientWidth || window.innerWidth)
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(onResize)
    window.addEventListener("resize", onResize, { passive: true })
    window.visualViewport?.addEventListener("resize", onResize, { passive: true })
    observer?.observe(document.documentElement)
    onResize()
    return () => {
      window.removeEventListener("resize", onResize)
      window.visualViewport?.removeEventListener("resize", onResize)
      observer?.disconnect()
    }
  }, [])

  useLayoutEffect(() => {
    setViewportWidth(document.documentElement.clientWidth || window.innerWidth)
  }, [collapsed, detailOpen])

  const isCompact = viewportWidth < 768
  const availableBesideThread = Math.max(viewportWidth - watchMinThreadWidth, watchRailMinWidth)
  const canShowBoth = !isCompact && availableBesideThread >= watchRailMinWidth + watchDetailMinWidth
  const singlePaneWidth = isCompact ? viewportWidth : Math.min(560, availableBesideThread)
  const expandedWidth = Math.min(watchShellMaxWidth, availableBesideThread)
  const railWidth = Math.min(watchRailWidth, canShowBoth ? expandedWidth - watchDetailMinWidth : singlePaneWidth)
  const detailWidth = canShowBoth ? expandedWidth - railWidth : singlePaneWidth
  const resolvedRailWidth = isCompact ? viewportWidth : railWidth

  return {
    railWidth: resolvedRailWidth,
    detailWidth: isCompact ? viewportWidth : detailWidth,
    singlePane: !canShowBoth,
    width: collapsed ? 0 : detailOpen && canShowBoth ? expandedWidth : detailOpen ? detailWidth : resolvedRailWidth,
  }
}

/**
 * The watcher rail: one glass surface floating over the thread, which widens
 * leftwards to uncover a detail pane rather than pushing a second panel in.
 *
 * Width is the only thing that animates. The list is pinned to the surface's
 * right edge and the detail sits immediately to its left, both absolutely
 * positioned, so the reveal is the container's own clip travelling left — the
 * cards never move, nothing reflows behind it, and there is no edge between the
 * two halves to give the join away.
 *
 * Deliberately not a transform: the rail's veils use `backdrop-filter`, and an
 * animated transform on an ancestor would start a new backdrop root and leave
 * them sampling nothing.
 */
export function DexterWatchRail({
  monitors,
  activeMonitor,
  collapsed = false,
  onCollapse,
  onSelectMonitor,
  onCloseDetail,
  onAsk,
  onSetStatus,
  onDelete,
  onAskEvent,
  onAskAttachment,
}: {
  monitors: DexterMonitor[]
  activeMonitor: DexterMonitor | null
  collapsed?: boolean
  onCollapse?: () => void
  /** Called with the picked monitor; the caller decides toggle vs. replace. */
  onSelectMonitor?: (monitor: DexterMonitor) => void
  onCloseDetail?: () => void
  onAsk?: () => void
  onSetStatus?: (monitor: DexterMonitor, status: "active" | "paused") => void
  onDelete?: (monitor: DexterMonitor) => void
  onAskEvent?: (monitor: DexterMonitor) => void
  onAskAttachment?: (attachment: DexterEmailAttachment) => void
}) {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const detailOpen = activeMonitor !== null
  const { railWidth, detailWidth, singlePane, width } = useWatchRailWidths(detailOpen, collapsed)

  // The shell includes a transparent fade strip outside the real panel. Keeping
  // it click-through lets the conversation remain usable in that strip; only
  // the pinned content surface below accepts input.
  return (
    <motion.aside
      className="md-watch-rail-shell fixed inset-y-0 end-0 z-50 lg:z-30"
      data-detail={detailOpen ? "true" : undefined}
      initial={false}
      animate={{ width }}
      transition={
        shouldReduceMotion
          ? { duration: 0 }
          : // Slightly over-damped: a wide panel that overshoots reads as loose,
            // and this one carries a chart the eye starts reading immediately.
            { type: "spring", stiffness: 260, damping: 34, mass: 0.9 }
      }
      style={{ pointerEvents: "none" }}
      aria-hidden={collapsed || undefined}
    >
      {/* The fade extends outside the rail width, so it must leave the render
          tree when the rail closes. A zero-width shell alone would still leave
          the 176px backdrop-filter strip visible over the conversation. */}
      {!collapsed ? (
        <span
          aria-hidden="true"
          className="md-watch-rail-surface pointer-events-none absolute inset-y-0 end-0"
          style={{ insetInlineStart: -176 }}
        />
      ) : null}

      {!collapsed && onCollapse ? (
        <button
          type="button"
          className="md-dexter-header-action pointer-events-auto absolute start-4 top-4 z-[5] !grid size-11 place-items-center rounded-full text-[var(--md-ink)] sm:hidden"
          onClick={onCollapse}
          title={t("Hide watchers")}
          aria-label={t("Hide watchers")}
        >
          <X className="size-4" strokeWidth={1.5} />
        </button>
      ) : null}

      {!collapsed ? (
        <div className="pointer-events-auto absolute inset-0 overflow-hidden">
          <div className={cn("md-watch-rail-detail absolute inset-y-0 start-0", singlePane && activeMonitor && "z-[3]", !activeMonitor && "pointer-events-none")} style={{ width: detailWidth }}>
            <AnimatePresence mode="popLayout" initial={false}>
              {activeMonitor ? (
                <motion.div
                  key={activeMonitor.id ?? activeMonitor.title}
                  className="h-full w-full"
                  initial={shouldReduceMotion ? false : { opacity: 0, x: -14, filter: "blur(5px)" }}
                  animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                  exit={shouldReduceMotion ? undefined : { opacity: 0, x: -10, filter: "blur(4px)" }}
                  transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.enter)}
                >
                  <DexterMonitorDetailSheet
                    monitor={activeMonitor}
                    floating={false}
                    compactBack={singlePane}
                    onClose={() => onCloseDetail?.()}
                    onSetStatus={(status) => onSetStatus?.(activeMonitor, status)}
                    onDelete={() => onDelete?.(activeMonitor)}
                    onAskEvent={() => onAskEvent?.(activeMonitor)}
                    onAskAttachment={onAskAttachment}
                  />
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          <div className={cn("md-watch-rail-list absolute inset-y-0 end-0", singlePane && activeMonitor && "invisible")} style={{ width: railWidth }}>
            <DexterMonitorStack
              monitors={monitors}
              activeId={activeMonitor?.id ?? null}
              onCollapse={onCollapse}
              onSelectMonitor={onSelectMonitor}
              onAsk={onAsk}
            />
          </div>
        </div>
      ) : null}
    </motion.aside>
  )
}

export function DexterMonitorDetailSheet({
  monitor,
  onClose,
  onSetStatus,
  onDelete,
  onAskEvent,
  onAskAttachment,
  compactBack = false,
  floating = true,
}: {
  monitor: DexterMonitor
  onClose: () => void
  onSetStatus?: (status: "active" | "paused") => void
  onDelete?: () => void
  onAskEvent?: () => void
  onAskAttachment?: (attachment: DexterEmailAttachment) => void
  compactBack?: boolean
  /**
   * `false` embeds the sheet in a surface a caller already owns: no shadow, no
   * edge, no background of its own. That is what keeps it from drawing a seam
   * against the watcher list it expands out of.
   */
  floating?: boolean
}) {
  const { t } = useLanguage()
  const status = monitor.status ?? "active"
  const healthStatus = monitor.healthStatus ?? "starting"
  const healthTone = healthStatus === "healthy"
    ? "green"
    : healthStatus === "starting" ? "neutral" : "amber"
  const healthLabel = healthStatus === "healthy"
    ? t("Email connection healthy")
    : healthStatus === "starting"
      ? t("Starting live checks")
      : t("Email connection delayed")
  const emailContext = monitor.latestEvent?.context?.kind === "email"
    ? monitor.latestEvent.context
    : null

  return (
    <aside
      className={cn(
        "flex flex-col",
        floating
          ? "fixed inset-y-0 right-0 z-50 w-[min(580px,calc(100vw-24px))] bg-[var(--md-surface)] shadow-[-18px_0_40px_rgba(11,20,19,0.12),inset_1px_0_0_rgba(255,255,255,0.84)]"
          : "h-full w-full bg-transparent",
      )}
    >
      <header className="border-b border-[rgba(11,20,19,0.07)] px-[var(--md-gap-xl)] py-[var(--md-page-stack-gap)] max-sm:ps-[72px]">
        <div className="flex items-start justify-between gap-[var(--md-gap-lg)]">
          <div className="min-w-0">
            <h2 className="flex items-start gap-2 break-words text-[18px] font-medium leading-6 text-[var(--md-ink)]">
              <span className="size-2.5 rounded-full" style={{ background: toneToVar(monitor.tone) }} />
              {monitor.title}
            </h2>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-[var(--md-text)]">
              <StatusPill tone={status === "active" ? "green" : "neutral"}>{t(status === "active" ? "Active" : "Paused")}</StatusPill>
              {monitor.capability === "email" && status === "active" ? <StatusPill tone={healthTone}>{healthLabel}</StatusPill> : null}
              {monitor.triggerCount ? <StatusPill tone="amber">{monitor.triggerCount} {t("alerts")}</StatusPill> : null}
              <span>{monitor.capability === "email" ? t("Inbox checked automatically") : t("Checks when your connected data changes")}</span>
            </div>
          </div>
          <button type="button" className="grid size-9 shrink-0 place-items-center rounded-full text-[var(--md-subtle)] hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)]" onClick={onClose} aria-label={t(compactBack ? "Back to watches" : "Close monitor detail")}>
            {compactBack ? <ArrowLeft className="size-4 rtl:rotate-180" strokeWidth={1.3} /> : <X className="size-4" strokeWidth={1.3} />}
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-[var(--md-gap-xl)] py-[var(--md-page-stack-gap)] md-scrollbar">
        {monitor.capability === "email" && status === "active" && healthStatus !== "healthy" ? (
          <div role="status" className="mt-4 rounded-[var(--md-radius-lg)] bg-[rgba(221,138,43,0.10)] px-4 py-3 text-[13px] leading-5 text-[var(--md-ink)] shadow-[var(--md-shadow-line)]">
            <p className="font-medium">{healthLabel}</p>
            <p className="mt-1 text-[var(--md-text)]">{t(monitor.healthMessage ?? "Dexter is retrying automatically. You do not need to recreate this watch.")}</p>
          </div>
        ) : null}

        <section aria-labelledby={`watch-update-${monitor.id ?? "selected"}`}>
          <h3 id={`watch-update-${monitor.id ?? "selected"}`} className="text-[14px] font-medium text-[var(--md-text)]">{t("Latest update")}</h3>
          {emailContext?.availability === "available" ? (
            <div className="mt-3 min-w-0 rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-4 shadow-[var(--md-shadow-line)]">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-words text-[14px] font-medium leading-5 text-[var(--md-ink)]">{emailContext.subject || t("No subject")}</p>
                  <p className="mt-1 break-words text-[12px] text-[var(--md-text)]">
                    <bdi dir="auto" data-i18n-skip>{emailContext.senderName || emailContext.senderEmail}</bdi>
                    {emailContext.senderName && emailContext.senderEmail ? <span data-i18n-skip dir="ltr"> &lt;{emailContext.senderEmail}&gt;</span> : null}
                  </p>
                </div>
                <time className="shrink-0 text-[11px] tabular-nums text-[var(--md-subtle)]" dateTime={emailContext.receivedAt}>
                  {new Date(emailContext.receivedAt).toLocaleString()}
                </time>
              </div>
              {emailContext.preview ? (
                <p data-i18n-skip dir="auto" className="mt-3 line-clamp-6 whitespace-pre-wrap break-words text-[13px] leading-5 text-[var(--md-text)]">{emailContext.preview}</p>
              ) : <p className="mt-3 text-[13px] text-[var(--md-subtle)]">{t("No email preview is available.")}</p>}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" className="h-9 rounded-[var(--md-radius-md)] px-3 text-[12px]" onClick={onAskEvent}>
                  <MessageCircle className="size-3.5" strokeWidth={1.4} />
                  {t("Ask Dexter about this update")}
                </Button>
                {emailContext.sourceUrl ? (
                  <Button asChild type="button" variant="ghost" size="sm" className="h-9 rounded-[var(--md-radius-md)] px-3 text-[12px]">
                    <a href={emailContext.sourceUrl} target="_blank" rel="noreferrer">{t("Open email")}</a>
                  </Button>
                ) : null}
              </div>
              <div className="mt-5">
                <h4 className="text-[12px] font-medium text-[var(--md-text)]">{t("Attachments")}</h4>
                {emailContext.attachments.length ? (
                  <div className="mt-2 grid min-w-0 gap-2">
                    {emailContext.attachments.map((attachment) => (
                      <DexterEmailAttachmentCard key={attachment.id} attachment={attachment} variant="watch" onAskDexter={onAskAttachment} />
                    ))}
                  </div>
                ) : <p className="mt-2 text-[12px] leading-5 text-[var(--md-subtle)]">{t("This email has no eligible attachments.")}</p>}
              </div>
            </div>
          ) : monitor.latestEvent ? (
            <div role="status" className="mt-3 rounded-[var(--md-radius-lg)] bg-[rgba(221,138,43,0.10)] px-4 py-3 text-[13px] leading-5 text-[var(--md-ink)] shadow-[var(--md-shadow-line)]">
              <p className="font-medium">{t(emailContext?.availability === "reconnect_required" ? "Reconnect email to open this update" : "This email is no longer available")}</p>
              <p className="mt-1 text-[var(--md-text)]">{emailContext?.availability === "reconnect_required" ? t(emailContext.unavailableReason ?? monitor.latestEvent.body) : t("The email may have been deleted, moved to Spam or Bin, or you may no longer have access to it.")}</p>
            </div>
          ) : (
            <p className="mt-3 text-[13px] leading-5 text-[var(--md-text)]">{t("Nothing has matched yet. I’ll let you know when it does.")}</p>
          )}
        </section>

        <details className="mt-[var(--md-page-section-gap)] rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] p-4">
          <summary className="cursor-pointer text-[13px] font-medium text-[var(--md-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a42)]">{t("About this watch")}</summary>
          <Surface padding="none" className="mt-4 rounded-[var(--md-radius-lg)] bg-transparent shadow-none">
            <p className="text-[13px] leading-6 text-[var(--md-ink)]">{monitor.body}</p>
          </Surface>
          <div className="mt-3 divide-y divide-[rgba(11,20,19,0.07)] text-[13px]">
            <div className="flex justify-between gap-4 py-3">
              <span className="text-[var(--md-text)]">{t("Looking for")}</span>
              <span className="font-medium text-[var(--md-ink)]">{monitor.ruleLabel ?? t("The change you asked Dexter to watch")}</span>
            </div>
            <div className="flex justify-between gap-4 py-3">
              <span className="text-[var(--md-text)]">{t("How it checks")}</span>
              <span className="text-end font-medium text-[var(--md-ink)]">{t(monitor.capability === "email" ? "Your inbox is checked automatically" : "It checks whenever your connected data changes")}</span>
            </div>
            {monitor.capability === "email" && monitor.lastSourceCheckAt ? (
              <div className="flex justify-between gap-4 py-3">
                <span className="text-[var(--md-text)]">{t("Last checked")}</span>
                <span className="font-medium text-[var(--md-ink)]">{new Date(monitor.lastSourceCheckAt).toLocaleString()}</span>
              </div>
            ) : null}
          </div>
        </details>

        {monitor.action ? (
          <section className="mt-[var(--md-page-section-gap)] rounded-[var(--md-radius-xl)] bg-[var(--md-surface-tint)] p-4 shadow-[var(--md-shadow-line)]">
            <p className="text-[12px] font-medium text-[var(--md-subtle)]">{t("Prepared action - approval required")}</p>
            <h3 className="mt-2 text-[14px] font-medium text-[var(--md-ink)]">{monitor.action.title}</h3>
            <p className="mt-1 text-[13px] leading-5 text-[var(--md-text)]">{monitor.action.description}</p>
            <p className="mt-3 text-[12px] leading-5 text-[var(--md-subtle)]">{t("Dexter has not run this action. Open a chat and ask Dexter to review it before you approve anything.")}</p>
          </section>
        ) : null}
      </div>

      <footer className="grid grid-cols-[1fr_auto] gap-[var(--md-gap-md)] border-t border-[var(--md-line)] px-[var(--md-gap-xl)] py-[var(--md-gap-lg)]">
        <Button variant="ghost" className="h-10 rounded-[var(--md-radius-md)] bg-white/60 text-[13px] shadow-[var(--md-shadow-line)]" onClick={() => onSetStatus?.(status === "active" ? "paused" : "active")}>{t(status === "active" ? "Pause" : "Resume")}</Button>
        <Button variant="ghost" className="h-10 rounded-[var(--md-radius-md)] bg-[rgba(209,78,78,0.08)] px-4 text-[13px] text-[var(--md-red)] shadow-[0_0_0_1px_rgba(209,78,78,0.16)]" onClick={onDelete}>{t("Delete")}</Button>
      </footer>
    </aside>
  )
}

export function DexterCustomerSnapshot() {
  return (
    <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-glass-strong)]">
      <div className="flex flex-wrap items-center gap-4 px-5 py-4">
        <span className="grid size-9 place-items-center rounded-[var(--md-radius-md)] bg-[var(--md-accent-a10)] text-[12px] font-medium text-[var(--md-accent)]">MA</span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-medium text-[var(--md-ink)]">Marlow Apparel Ltd</p>
          <p className="mt-1 text-[12px] text-[var(--md-text)]">Customer since 2023 - contact Sandra Hale - next QBR Thu 14:00</p>
        </div>
        <button type="button" className="text-[12px] font-medium text-[var(--md-accent)]">
          Open customer <ArrowRight className="inline size-3" strokeWidth={1.2} />
        </button>
      </div>
      <div className="grid divide-y divide-[var(--md-line)] border-t border-[var(--md-line)] sm:grid-cols-4 sm:divide-x sm:divide-y-0">
        {[
          ["Bookings YTD", "38"],
          ["On-time", "94.2%"],
          ["Spend YTD", "EUR 412k"],
          ["Open exceptions", "1"],
        ].map(([label, value]) => (
          <div key={label} className="px-5 py-4">
            <p className="text-[12px] text-[var(--md-text)]">{label}</p>
            <p className="mt-2 text-[18px] font-medium text-[var(--md-ink)]">{value}</p>
          </div>
        ))}
      </div>
    </Surface>
  )
}

export function DexterChecklistCard({
  items,
}: {
  items: { label: string; done?: boolean }[]
}) {
  return (
    <Surface padding="md" className="rounded-[var(--md-radius-xl)] bg-[var(--md-glass-strong)]">
      <div className="grid gap-4">
        {items.map((item) => (
          <div key={item.label} className="flex items-start gap-3">
            <span
              className={cn(
                "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-white",
                item.done ? "bg-[var(--md-green)]" : "bg-[var(--md-accent)]",
              )}
            >
              {item.done ? <Check className="size-3" strokeWidth={1.6} /> : <span className="size-2 rounded-full bg-white" />}
            </span>
            <p className="text-[14px] leading-5 text-[var(--md-text)]">{item.label}</p>
          </div>
        ))}
      </div>
    </Surface>
  )
}

export function DexterRiskTable() {
  const rows = [
    ["MD-22455", "Shanghai", "Long Beach", "Export licence missing - on hold", "Northwind GmbH", "red" as StatusTone],
    ["MD-22479", "Ningbo", "Rotterdam", "Berth queue +36h - ETA slipping", "Northwind GmbH", "amber" as StatusTone],
    ["MD-22414", "Qingdao", "Felixstowe", "CI value 12% over packing list", "Aldridge & Sons", "amber" as StatusTone],
    ["MD-22442", "Shenzhen", "Oakland", "HS 8542 - USTR list-3 risk", "Pacific Goods Co", "blue" as StatusTone],
  ]

  return (
    <Surface padding="none" className="min-w-0 overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-glass-strong)]">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 px-5 py-3">
        <p className="text-[13px] font-medium text-[var(--md-text)]">4 bookings - customs risk</p>
        <button type="button" className="text-[12px] font-medium text-[var(--md-accent)]">
          Open in board <ArrowRight className="inline size-3" strokeWidth={1.2} />
        </button>
      </div>
      <div className="divide-y divide-[var(--md-line)] border-t border-[var(--md-line)]">
        {rows.map(([id, from, to, issue, customer, tone]) => (
          <div
            key={id}
            className="grid min-w-0 grid-cols-[18px_minmax(72px,0.7fr)_minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,0.9fr)] items-center gap-x-3 gap-y-2 px-5 py-4 text-[13px] max-xl:grid-cols-[18px_84px_minmax(0,1fr)]"
          >
            <span className="size-2.5 rounded-full" style={{ background: toneToVar(tone as StatusTone) }} />
            <span className="min-w-0 font-medium text-[var(--md-ink)]">{id}</span>
            <span className="min-w-0 break-words font-medium text-[var(--md-ink)]">
              {from} <ArrowRight className="inline size-3" strokeWidth={1.2} /> {to}
            </span>
            <span className="min-w-0 break-words text-[var(--md-text)] max-xl:col-span-2 max-xl:col-start-2">{issue}</span>
            <span className="min-w-0 break-words text-[var(--md-text)] max-xl:col-span-2 max-xl:col-start-2">{customer}</span>
          </div>
        ))}
      </div>
    </Surface>
  )
}

export function DexterSuggestionGrid({
  onPick,
  dealName,
  bookingId,
}: {
  onPick: (prompt: string, specialistId: DexterSpecialistId) => void
  dealName?: string | null
  bookingId?: string | null
}) {
  const { t } = useLanguage()
  const personalised = [
    dealName ? {
      title: `${t("How can I close")} ${dealName}?`,
      prompt: `${t("Review this deal and tell me the strongest next steps to close it")}: ${dealName}.`,
      icon: Handshake,
      specialistId: "sales" as DexterSpecialistId,
    } : null,
    bookingId ? {
      title: `${t("Chase up information on")} ${bookingId}`,
      prompt: `${t("Check what information is still missing and help me chase it up for booking")} ${bookingId}.`,
      icon: MessageCircle,
      specialistId: "ops" as DexterSpecialistId,
    } : null,
  ].filter((suggestion): suggestion is NonNullable<typeof suggestion> => Boolean(suggestion))
  const standard = [
    { title: t("Triage my morning"), prompt: t("Which bookings need me first today?"), icon: Zap, specialistId: "ops" as DexterSpecialistId },
    { title: t("Draft a quote"), prompt: t("Draft a quote for my next priority opportunity."), icon: PackageCheck, specialistId: "sales" as DexterSpecialistId },
    { title: t("Review at-risk bookings"), prompt: t("Show me the bookings most at risk and what I should do next."), icon: BarChart3, specialistId: "analytics" as DexterSpecialistId },
    { title: t("Prepare a customer update"), prompt: t("Draft an update for the customer who most needs one today."), icon: MessageCircle, specialistId: "customer" as DexterSpecialistId },
  ]
  const suggestions = [...personalised, ...standard].slice(0, 4)

  return (
    <div className="flex flex-wrap justify-center gap-2" aria-label={t("Recommended actions")}>
      {suggestions.map((suggestion) => {
        const Icon = suggestion.icon

        return (
          <button
            key={suggestion.title}
            type="button"
            className="group inline-flex min-h-9 max-w-full items-center gap-2 rounded-full bg-[var(--md-surface)] px-3.5 py-2 text-start text-[13px] font-medium text-[var(--md-text)] shadow-[var(--md-shadow-line)] transition-[background,color,box-shadow,opacity,transform] duration-200 hover:-translate-y-px hover:bg-[var(--md-surface-raised)] hover:text-[var(--md-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a22)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--md-bg)] active:translate-y-0 motion-reduce:transform-none"
            onClick={() => onPick(suggestion.prompt, suggestion.specialistId)}
          >
            <Icon className="size-3.5 shrink-0 text-[var(--md-accent)]" strokeWidth={1.35} aria-hidden />
            <span className="min-w-0 break-words" dir="auto">{suggestion.title}</span>
          </button>
        )
      })}
    </div>
  )
}

export const defaultDexterSpecialists: DexterSpecialist[] = [
  { id: "auto", name: "Auto", label: "Default", description: "Dexter reads the request and routes it to the right specialist.", icon: Sparkles },
  { id: "sales", name: "Sales", description: "Rates, quotes, margins, win-back drafts", icon: PackageCheck },
  { id: "customs", name: "Customs", description: "HS codes, holds, licences, document checks", icon: ShieldCheck },
  { id: "ops", name: "Ops & exceptions", description: "Delays, reroutes, terminals, carrier escalations", icon: Zap },
  { id: "customer", name: "Customer comms", description: "Updates and replies, in each customer's tone", icon: MessageCircle },
  { id: "analytics", name: "Analytics & reporting", description: "Trends, carrier scorecards, spend deep-dives", icon: BarChart3 },
]

export const defaultDexterAttachments: DexterAttachment[] = [
  { id: "md-22455", type: "booking", title: "MD-22455", meta: "Shanghai to Long Beach - Northwind GmbH - on hold", tone: "red", icon: Boxes },
  { id: "md-22479", type: "booking", title: "MD-22479", meta: "Ningbo to Rotterdam - Northwind GmbH - delayed", tone: "amber", icon: Boxes },
  { id: "md-22414", type: "booking", title: "MD-22414", meta: "Qingdao to Felixstowe - Aldridge & Sons - at risk", tone: "amber", icon: Boxes },
  { id: "marlow", type: "customer", title: "Marlow Apparel Ltd", meta: "38 bookings YTD - contact Sandra Hale", tone: "teal", icon: Users },
  { id: "northwind", type: "customer", title: "Northwind GmbH", meta: "12 active bookings - contact Jonas Weber", tone: "teal", icon: Users },
  { id: "co-cn", type: "document", title: "CO-CN-44128.pdf", meta: "Certificate of origin - parsed 98% - MD-22455", tone: "blue", icon: FileText },
  { id: "ci-rev2", type: "document", title: "CI-22455-rev2.pdf", meta: "Commercial invoice - parsed 99% - MD-22455", tone: "blue", icon: FileText },
]
