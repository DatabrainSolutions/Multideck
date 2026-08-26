import { useEffect, useRef, type ComponentProps, type Ref } from "react"
import { Sparkles } from "@/components/icons/hugeicons"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useLanguage } from "@/i18n/language-provider"
import { cn } from "@/lib/utils"

export type AutoPopulationStateProps = {
  autoPopulated?: boolean
  autoPopulationDescription?: string
}

const MAX_REVEAL_SEGMENTS = 12
const REVEAL_SEGMENT_DURATION_MS = 300
const REVEAL_STAGGER_MS = 24

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") ref(value)
  else if (ref) ref.current = value
}

function groupRevealSegments(segments: string[]) {
  if (segments.length <= MAX_REVEAL_SEGMENTS) return segments

  const groupSize = Math.ceil(segments.length / MAX_REVEAL_SEGMENTS)
  const grouped: string[] = []
  for (let index = 0; index < segments.length; index += groupSize) {
    grouped.push(segments.slice(index, index + groupSize).join(""))
  }
  return grouped
}

function getRevealSegments(value: string) {
  const wordSegments = value.match(/\S+\s*/gu) ?? []
  if (wordSegments.length > 1) return groupRevealSegments(wordSegments)
  return groupRevealSegments(Array.from(value))
}

function createAutoPopulationReveal(element: HTMLElement, value: string) {
  const parent = element.parentElement
  if (!parent) return () => undefined

  const computedStyle = window.getComputedStyle(element)
  const reveal = document.createElement("span")
  reveal.className = "md-auto-populated-reveal"
  reveal.dataset.multiline = element instanceof HTMLTextAreaElement ? "true" : "false"
  reveal.setAttribute("aria-hidden", "true")
  reveal.style.paddingBlockStart = computedStyle.paddingBlockStart
  reveal.style.paddingBlockEnd = computedStyle.paddingBlockEnd
  reveal.style.paddingInlineStart = computedStyle.paddingInlineStart
  reveal.style.paddingInlineEnd = computedStyle.paddingInlineEnd
  reveal.style.font = computedStyle.font
  reveal.style.letterSpacing = computedStyle.letterSpacing
  reveal.style.lineHeight = computedStyle.lineHeight
  reveal.style.textAlign = computedStyle.textAlign
  reveal.style.color = computedStyle.color
  reveal.style.inset = "auto"
  reveal.style.insetInlineStart = `${element.offsetLeft}px`
  reveal.style.top = `${element.offsetTop}px`
  reveal.style.width = `${element.offsetWidth}px`
  reveal.style.height = `${element.offsetHeight}px`

  const fragment = document.createDocumentFragment()
  const segments = getRevealSegments(value)
  segments.forEach((segment, index) => {
    const token = document.createElement("span")
    token.className = "md-auto-populated-reveal__token"
    token.style.setProperty("--md-auto-populated-stagger", `${index * REVEAL_STAGGER_MS}ms`)
    token.textContent = segment
    fragment.append(token)
  })
  reveal.append(fragment)
  parent.append(reveal)
  element.dataset.autoPopulationRevealing = "true"

  const timeout = window.setTimeout(
    cleanup,
    REVEAL_SEGMENT_DURATION_MS + Math.max(0, segments.length - 1) * REVEAL_STAGGER_MS + 40,
  )

  function cleanup() {
    window.clearTimeout(timeout)
    reveal.remove()
    delete element.dataset.autoPopulationRevealing
  }

  return cleanup
}

export function useAutoPopulationMorph<T extends HTMLElement>(active: boolean, value: unknown, forwardedRef?: Ref<T>) {
  const elementRef = useRef<T | null>(null)
  const previousRef = useRef({ active: false, value: "" })
  const cleanupRef = useRef<(() => void) | null>(null)
  const mountedRef = useRef(false)
  const textValue = String(value ?? "")

  useEffect(() => {
    const previous = previousRef.current
    previousRef.current = { active, value: textValue }
    cleanupRef.current?.()
    cleanupRef.current = null
    if (!mountedRef.current) {
      mountedRef.current = true
      return
    }
    if (!active || !textValue || (previous.active && previous.value === textValue)) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    const element = elementRef.current
    if (!element || document.visibilityState !== "visible" || !element.getClientRects().length) return
    cleanupRef.current = createAutoPopulationReveal(element, textValue)

    return () => {
      cleanupRef.current?.()
      cleanupRef.current = null
    }
  }, [active, textValue])

  return (element: T | null) => {
    elementRef.current = element
    assignRef(forwardedRef, element)
  }
}

export function AutoPopulationIndicator({
  active,
  description = "Filled from linked information. You can edit this value manually.",
  inline = false,
  className,
}: {
  active: boolean
  description?: string
  inline?: boolean
  className?: string
}) {
  const { t } = useLanguage()
  if (!active) return null

  return (
    <Tooltip delayDuration={220}>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={t("About this auto-populated value")}
          onPointerDown={(event) => event.preventDefault()}
          className={cn(
            "md-auto-populated-indicator z-10 grid size-5 place-items-center rounded-[var(--md-radius-sm)] text-[var(--md-accent)] outline-none transition-[background-color,color,box-shadow,transform] hover:bg-[var(--md-accent-a12)] focus-visible:bg-[var(--md-accent-a12)] focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a24)]",
            inline ? "relative shrink-0" : "absolute end-1.5 top-1/2 -translate-y-1/2",
            className,
          )}
        >
          <Sparkles className="size-3.5" strokeWidth={1.65} aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={7}
        className="max-w-[18rem] items-start gap-2 rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] px-2.5 py-2 text-start text-[var(--md-ink)] shadow-[var(--md-shadow-lift)]"
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-[var(--md-radius-md)] bg-[var(--md-accent)] text-[var(--md-accent-ink)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)]">
          <Sparkles className="size-3.5" strokeWidth={1.65} aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block text-[11.5px] font-medium leading-4">{t("Auto-populated")}</span>
          <span className="mt-0.5 block text-[10.5px] leading-4 text-[var(--md-text)]">{t(description)}</span>
        </span>
      </TooltipContent>
    </Tooltip>
  )
}

export function AutoPopulatedInput({
  autoPopulated = false,
  autoPopulationDescription,
  className,
  indicatorClassName,
  ref,
  value,
  ...props
}: ComponentProps<typeof Input> & AutoPopulationStateProps & { indicatorClassName?: string }) {
  const mergedRef = useAutoPopulationMorph<HTMLInputElement>(autoPopulated, value, ref)

  return (
    <div className="relative min-w-0">
      <Input
        {...props}
        ref={mergedRef}
        value={value}
        data-auto-populated={autoPopulated || undefined}
        className={cn("md-auto-populated-control", autoPopulated && "pe-8", className)}
      />
      <AutoPopulationIndicator active={autoPopulated} description={autoPopulationDescription} className={indicatorClassName} />
    </div>
  )
}

export function AutoPopulatedTextarea({
  autoPopulated = false,
  autoPopulationDescription,
  className,
  ref,
  value,
  ...props
}: ComponentProps<typeof Textarea> & AutoPopulationStateProps) {
  const mergedRef = useAutoPopulationMorph<HTMLTextAreaElement>(autoPopulated, value, ref)

  return (
    <div className="relative min-w-0">
      <Textarea
        {...props}
        ref={mergedRef}
        value={value}
        data-auto-populated={autoPopulated || undefined}
        className={cn("md-auto-populated-control", autoPopulated && "pe-8", className)}
      />
      <AutoPopulationIndicator active={autoPopulated} description={autoPopulationDescription} className="top-2 translate-y-0" />
    </div>
  )
}

export function matchesAutoPopulation(value: string | null | undefined, sourceValue: string | null | undefined) {
  const normalizedValue = value?.trim() ?? ""
  const normalizedSource = sourceValue?.trim() ?? ""
  return Boolean(normalizedValue && normalizedSource && normalizedValue === normalizedSource)
}
