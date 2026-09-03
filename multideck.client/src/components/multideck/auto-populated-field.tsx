import { useLayoutEffect, useRef, type ComponentProps, type Ref } from "react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useLanguage } from "@/i18n/language-provider"
import { cn } from "@/lib/utils"

export type AutoPopulationStateProps = {
  autoPopulated?: boolean
  autoPopulationDescription?: string
}

const MAX_REVEAL_SEGMENTS = 64
const REVEAL_SEGMENT_DURATION_MS = 300
const REVEAL_STAGGER_MS = 38
const MAX_REVEAL_SPREAD_MS = 780
const revealSegmenter = new Intl.Segmenter("en", { granularity: "grapheme" })

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
  return groupRevealSegments(Array.from(revealSegmenter.segment(value), ({ segment }) => segment))
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
  reveal.style.borderWidth = computedStyle.borderWidth
  reveal.style.borderStyle = "solid"
  reveal.style.borderColor = "transparent"
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
  // Keep a distinct leading edge without making a long address take seconds.
  const staggerMs = Math.min(REVEAL_STAGGER_MS, MAX_REVEAL_SPREAD_MS / Math.max(1, segments.length - 1))
  segments.forEach((segment, index) => {
    // A newline inside an inline-block token cannot break the surrounding line.
    // Keep line separators in the text flow so multiline values never snap back.
    for (const part of segment.split(/(\r\n|\r|\n)/)) {
      if (!part) continue
      if (/^[\r\n]+$/.test(part)) {
        fragment.append(document.createTextNode(part))
        continue
      }
      const token = document.createElement("span")
      token.className = "md-auto-populated-reveal__token"
      token.style.setProperty("--md-auto-populated-stagger", `${index * staggerMs}ms`)
      token.textContent = part
      fragment.append(token)
    }
  })
  reveal.append(fragment)
  parent.append(reveal)
  element.dataset.autoPopulationRevealing = "true"

  const timeout = window.setTimeout(
    cleanup,
    REVEAL_SEGMENT_DURATION_MS + Math.max(0, segments.length - 1) * staggerMs + 40,
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

  // Hide the native text and install its reveal in the same paint as the new value.
  useLayoutEffect(() => {
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

export function AutoPopulatedInput({
  autoPopulated = false,
  autoPopulationDescription = "Filled from linked information. You can edit this value manually.",
  className,
  ref,
  value,
  ...props
}: ComponentProps<typeof Input> & AutoPopulationStateProps) {
  const { t } = useLanguage()
  const mergedRef = useAutoPopulationMorph<HTMLInputElement>(autoPopulated, value, ref)

  return (
    <div className="relative min-w-0">
      <Input
        {...props}
        ref={mergedRef}
        value={value}
        data-auto-populated={autoPopulated || undefined}
        aria-description={props["aria-description"] ?? (autoPopulated ? t(autoPopulationDescription) : undefined)}
        className={cn("md-auto-populated-control", className)}
      />
    </div>
  )
}

export function AutoPopulatedTextarea({
  autoPopulated = false,
  autoPopulationDescription = "Filled from linked information. You can edit this value manually.",
  className,
  ref,
  value,
  ...props
}: ComponentProps<typeof Textarea> & AutoPopulationStateProps) {
  const { t } = useLanguage()
  const mergedRef = useAutoPopulationMorph<HTMLTextAreaElement>(autoPopulated, value, ref)

  return (
    <div className="relative min-w-0">
      <Textarea
        {...props}
        ref={mergedRef}
        value={value}
        data-auto-populated={autoPopulated || undefined}
        aria-description={props["aria-description"] ?? (autoPopulated ? t(autoPopulationDescription) : undefined)}
        className={cn("md-auto-populated-control", className)}
      />
    </div>
  )
}

export function matchesAutoPopulation(value: string | null | undefined, sourceValue: string | null | undefined) {
  const normalizedValue = value?.trim() ?? ""
  const normalizedSource = sourceValue?.trim() ?? ""
  return Boolean(normalizedValue && normalizedSource && normalizedValue === normalizedSource)
}
