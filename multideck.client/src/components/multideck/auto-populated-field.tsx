import { useCallback, useLayoutEffect, useRef, type ComponentProps, type Ref } from "react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useLanguage } from "@/i18n/language-provider"
import { cn } from "@/lib/utils"

export type AutoPopulationStateProps = {
  autoPopulated?: boolean
  /** null waits for an explicit autofill action; a new token permits changed values to reveal. */
  autoPopulationEvent?: number | null
  autoPopulationDescription?: string
}

const REVEAL_DURATION_MS = 640

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") ref(value)
  else if (ref) ref.current = value
}

function createAutoPopulationReveal(element: HTMLElement) {
  const parent = element.parentElement
  if (!parent || typeof element.animate !== "function") return () => undefined

  // Mirror the actual control, rather than laying out separate letter spans.
  // Native inputs retain their kerning, ellipsis, padding and scroll position;
  // textareas keep exactly the same line breaks throughout the handover.
  const computedStyle = window.getComputedStyle(element)
  const mirror = element.cloneNode(true) as HTMLElement
  for (const property of computedStyle) {
    mirror.style.setProperty(property, computedStyle.getPropertyValue(property))
  }
  for (const node of [mirror, ...mirror.querySelectorAll<HTMLElement>("*")]) {
    node.removeAttribute("id")
    node.removeAttribute("name")
    node.removeAttribute("form")
    node.removeAttribute("data-auto-population-revealing")
  }
  if (mirror instanceof HTMLInputElement || mirror instanceof HTMLTextAreaElement) {
    mirror.value = (element as HTMLInputElement | HTMLTextAreaElement).value
    mirror.disabled = true
  }
  Object.assign(mirror.style, {
    position: "absolute", inset: "0", margin: "0", width: "100%", height: "100%",
    minWidth: "0", minHeight: "0", maxWidth: "none", maxHeight: "none",
    background: "transparent", borderColor: "transparent", boxShadow: "none", outline: "none",
    opacity: "1", transform: "none", transition: "none", animation: "none",
    pointerEvents: "none", resize: "none", caretColor: "transparent",
    webkitTextFillColor: computedStyle.color,
  })

  const reveal = document.createElement("span")
  reveal.className = "md-auto-populated-reveal"
  reveal.setAttribute("aria-hidden", "true")
  reveal.inert = true
  reveal.append(mirror)
  parent.append(reveal)

  function positionReveal() {
    const bounds = element.getBoundingClientRect()
    const parentBounds = parent!.getBoundingClientRect()
    const currentStyle = window.getComputedStyle(element)
    // A responsive breakpoint may change type and padding as well as width.
    for (const property of ["font", "padding", "border-width", "letter-spacing", "text-align", "text-indent"]) {
      mirror.style.setProperty(property, currentStyle.getPropertyValue(property))
    }
    Object.assign(reveal.style, {
      left: `${bounds.left - parentBounds.left - parent!.clientLeft + parent!.scrollLeft}px`,
      top: `${bounds.top - parentBounds.top - parent!.clientTop + parent!.scrollTop}px`,
      width: `${bounds.width}px`, height: `${bounds.height}px`,
    })
    mirror.scrollLeft = element.scrollLeft
    mirror.scrollTop = element.scrollTop
  }
  positionReveal()
  element.dataset.autoPopulationRevealing = "true"

  const sweep = reveal.animate(
    [{ maskPosition: "100% 0" }, { maskPosition: "0% 0" }],
    { duration: REVEAL_DURATION_MS, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "both" },
  )
  const settle = mirror.animate(
    [{ opacity: 0, transform: "translateY(3px)" }, { opacity: 1, transform: "translateY(0)" }],
    { duration: 400, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "both" },
  )
  let cleaned = false
  const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)")
  const interactionTarget = element.closest("button") ?? element
  const interruptionEvents = ["pointerdown", "keydown", "beforeinput", "input", "focus", "scroll"] as const
  const resizeObserver = new ResizeObserver(positionReveal)
  resizeObserver.observe(element)
  resizeObserver.observe(parent)
  for (const event of interruptionEvents) interactionTarget.addEventListener(event, cleanup)
  document.addEventListener("visibilitychange", onVisibilityChange)
  motionPreference.addEventListener("change", onMotionChange)
  void sweep.finished.then(cleanup, cleanup)

  function onVisibilityChange() {
    if (document.visibilityState !== "visible") cleanup()
  }
  function onMotionChange() {
    if (motionPreference.matches) cleanup()
  }
  function cleanup() {
    if (cleaned) return
    cleaned = true
    resizeObserver.disconnect()
    for (const event of interruptionEvents) interactionTarget.removeEventListener(event, cleanup)
    document.removeEventListener("visibilitychange", onVisibilityChange)
    motionPreference.removeEventListener("change", onMotionChange)
    sweep.cancel()
    settle.cancel()
    reveal.remove()
    delete element.dataset.autoPopulationRevealing
  }

  return cleanup
}

export function useAutoPopulationMorph<T extends HTMLElement>(active: boolean, value: unknown, forwardedRef?: Ref<T>, autoPopulationEvent?: number | null) {
  const elementRef = useRef<T | null>(null)
  const previousValueRef = useRef("")
  const consumedEventRef = useRef(autoPopulationEvent)
  const cleanupRef = useRef<(() => void) | null>(null)
  const mountedRef = useRef(false)
  const textValue = String(value ?? "")

  useLayoutEffect(() => {
    const changed = previousValueRef.current !== textValue
    previousValueRef.current = textValue
    if (!mountedRef.current) {
      mountedRef.current = true
      return
    }
    // Provenance, saves and an unchanged selection must not cut a running reveal
    // short. Keep an explicit event available if its value arrives a render later.
    if (!changed) return
    cleanupRef.current?.()
    cleanupRef.current = null
    if (!active || !textValue) return
    if (autoPopulationEvent !== undefined) {
      if (autoPopulationEvent === null || consumedEventRef.current === autoPopulationEvent) return
      consumedEventRef.current = autoPopulationEvent
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    const element = elementRef.current
    if (!element || document.visibilityState !== "visible" || !element.getClientRects().length) return
    cleanupRef.current = createAutoPopulationReveal(element)
  }, [active, textValue, autoPopulationEvent])

  // Separate unmount cleanup from value reconciliation: effect dependency changes
  // are not an instruction to finish an otherwise valid animation.
  useLayoutEffect(() => () => {
    cleanupRef.current?.()
    cleanupRef.current = null
  }, [])

  return useCallback((element: T | null) => {
    if (elementRef.current !== element) {
      cleanupRef.current?.()
      cleanupRef.current = null
    }
    elementRef.current = element
    assignRef(forwardedRef, element)
  }, [forwardedRef])
}

export function AutoPopulatedInput({
  autoPopulated = false,
  autoPopulationEvent,
  autoPopulationDescription = "Filled from linked information. You can edit this value manually.",
  className,
  ref,
  value,
  ...props
}: ComponentProps<typeof Input> & AutoPopulationStateProps) {
  const { t } = useLanguage()
  const mergedRef = useAutoPopulationMorph<HTMLInputElement>(autoPopulated, value, ref, autoPopulationEvent)

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
  autoPopulationEvent,
  autoPopulationDescription = "Filled from linked information. You can edit this value manually.",
  className,
  ref,
  value,
  ...props
}: ComponentProps<typeof Textarea> & AutoPopulationStateProps) {
  const { t } = useLanguage()
  const mergedRef = useAutoPopulationMorph<HTMLTextAreaElement>(autoPopulated, value, ref, autoPopulationEvent)

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
