import {
  Children,
  Fragment,
  cloneElement,
  isValidElement,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react"
import { motion, useReducedMotion } from "motion/react"
import { Check, Copy } from "@/components/icons/hugeicons"
import { toast } from "sonner"
import { useLanguage } from "@/i18n/language-provider"
import { cn } from "@/lib/utils"

const SLOT_CHARACTER_DELAY_MS = 32
const SLOT_STAGGER_BUDGET_MS = 460
const SLOT_TRANSITION_MS = 340
/** Opacity and blur lead the movement, so the swap reads as a blur rather than a slide. */
const SLOT_TRANSITION_TIMING = `190ms, 260ms, ${SLOT_TRANSITION_MS}ms`
/** Hold the compositor layer a little past the swap so it is never dropped on the closing frame. */
const PROMOTION_TAIL_MS = 120
const WIPE_TRANSITION_MS = 300
const EXPAND_TRANSITION_MS = 220
/** Let the box finish growing before the copied word arrives, so it is never clipped mid-swap. */
const EXPAND_LEAD_MS = 110
/** The leaving value gets out of the way quickly — the pop belongs to whatever is arriving. */
const POP_OUT_MS = 120
/** Scale carries the overshoot, so it runs longer than the fade that lands the word. */
const POP_SCALE_MS = 250
const POP_FADE_MS = 150
/** A short overlap so the swap reads as one pop rather than an exit followed by an entrance. */
const POP_IN_DELAY_MS = 40
/** Short enough that the box is already at full width by the time the copied word starts arriving. */
const POP_EXPAND_TRANSITION_MS = 120
const POP_EXPAND_LEAD_MS = 50
/** Overshoots past 1 — that bounce at the end of the curve is what makes the word feel alive. */
const POP_OVERSHOOT = "cubic-bezier(0.34, 1.56, 0.64, 1)"
/** Past this length a value reads as a block, so it wipes in one piece instead of per character. */
const SLOT_CHARACTER_LIMIT = 48
const COPY_BUTTON_SIZE_PX = 20
const FALLBACK_LINE_HEIGHT_RATIO = 1.45

/**
 * `pop` is the default: the whole value swaps in one springy scale, so the feedback lands at once.
 * `slot` is the per-character blur slot used by the quote reference in the Quotes header.
 * `wipe` is the single fade-and-wipe used by values that are long, wrapped, or right-to-left.
 */
export type CopyFeedbackEffect = "auto" | "pop" | "slot" | "wipe"

type SlotContext = {
  active: boolean
  direction: "in" | "out"
  reduceMotion: boolean
  startDelay: number
  characterDelay: number
  promote: boolean
  counter: { current: number }
}

function getCharacterDelay(characterCount: number) {
  return characterCount <= 24
    ? SLOT_CHARACTER_DELAY_MS
    : Math.max(8, Math.floor(SLOT_STAGGER_BUDGET_MS / Math.max(characterCount - 1, 1)))
}

function getSlotDuration(...values: string[]) {
  return Math.max(...values.map((value) => {
    const characterCount = Array.from(value).length
    return Math.max(characterCount - 1, 0) * getCharacterDelay(characterCount) + SLOT_TRANSITION_MS
  }))
}

/** Descend to the element that renders the first line, so we read that line's box and not a wrapper's. */
function findFirstLineElement(root: Element) {
  let element = root
  for (let depth = 0; depth < 6; depth += 1) {
    const firstChild = element.firstElementChild
    // Stop above the slotted characters: they translate during the swap, so their boxes lie.
    if (!firstChild || firstChild.hasAttribute("data-slot-char")) break

    const rendersTextDirectly = Array.from(element.childNodes)
      .some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())
    if (rendersTextDirectly) break

    element = firstChild
  }
  return element
}

function readLineRects(element: Element) {
  const range = document.createRange()
  range.selectNodeContents(element)
  const rects = Array.from(range.getClientRects()).filter((rect) => rect.height > 0)
  range.detach()
  return rects
}

/**
 * Centre of the first rendered line, relative to its own layer. Scoped to the original layer so the
 * absolutely positioned copied layer, whose box spans the whole value, cannot be mistaken for a
 * line — that mistake is what made an earlier version of this oscillate.
 */
function readFirstLineOffset(layer: Element) {
  // Descend first: a value built from stacked blocks reports only its wrapper, whose centre sits
  // between the lines rather than on the first one.
  const lineElement = findFirstLineElement(layer)
  // Measured in the layer's own space, so a layer-level transform cancels out of the difference.
  const layerTop = layer.getBoundingClientRect().top

  // A line of slotted characters is read from its untouched parent, since transforms on the
  // characters do not move the box that contains them.
  const rects = lineElement.querySelector("[data-slot-char]")
    ? [lineElement.getBoundingClientRect()]
    : readLineRects(lineElement)

  if (!rects.length) {
    const box = lineElement.getBoundingClientRect()
    return box.height > 0 ? box.top + box.height / 2 - layerTop : null
  }

  const topEdge = Math.min(...rects.map((rect) => rect.top))
  const firstLine = rects
    .filter((rect) => rect.top <= topEdge + 1)
    .reduce((shortest, rect) => (rect.height < shortest.height ? rect : shortest))

  return firstLine.top + firstLine.height / 2 - layerTop
}

/** Read the line box the copy control should sit on, without depending on the control's own layout. */
function readFirstLineHeight(element: Element) {
  const styles = window.getComputedStyle(element)
  const lineHeight = Number.parseFloat(styles.lineHeight)
  if (Number.isFinite(lineHeight)) return lineHeight

  const fontSize = Number.parseFloat(styles.fontSize)
  return Number.isFinite(fontSize) ? fontSize * FALLBACK_LINE_HEIGHT_RATIO : null
}

/**
 * Font size of the value's own first text, which is the size "Copied" stands in for — the layer only
 * inherits whatever the surrounding block sets, and values routinely size their own text. Read from
 * the text node's parent rather than by descending elements, so an icon or wrapper in front of the
 * text cannot answer for it.
 */
function readValueFontSize(layer: Element) {
  const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent?.trim() || !node.parentElement) continue

    const fontSize = Number.parseFloat(window.getComputedStyle(node.parentElement).fontSize)
    return Number.isFinite(fontSize) && fontSize > 0 ? fontSize : null
  }
  return null
}

/**
 * Layout width, which is what the box has to hold open — `getBoundingClientRect` reports the *painted*
 * box, so a layer mid-pop measures at its scaled-down size and the box grows too little to fit
 * "Copied". `offsetWidth` ignores transforms; it rounds, so pad the sub-pixel back on.
 */
function readLayoutWidth(element: HTMLElement) {
  const layoutWidth = element.offsetWidth
  return layoutWidth > 0 ? layoutWidth + 1 : Math.ceil(element.getBoundingClientRect().width)
}

/** Split into words and the whitespace between them so slotted text still wraps on word boundaries. */
function splitIntoTokens(value: string) {
  return value.split(/(\s+)/).filter((token) => token.length > 0)
}

function renderSlotNode(node: ReactNode, context: SlotContext): ReactNode {
  if (typeof node === "string" || typeof node === "number") {
    return splitIntoTokens(String(node)).map((token, tokenIndex) => (
      <span
        key={`token-${tokenIndex}`}
        className={cn("inline-block", /^\s+$/.test(token) ? "whitespace-pre" : "whitespace-nowrap")}
      >
        {Array.from(token).map((character) => {
          const characterIndex = context.counter.current++
          return (
            <span
              key={`character-${characterIndex}`}
              data-slot-char=""
              className={cn(
                "inline-block motion-reduce:transition-none",
                // Short travel keeps this a blur slot rather than a slide.
                context.direction === "out"
                  ? context.active
                    ? "-translate-y-[55%] opacity-0 blur-[3px]"
                    : "translate-y-0 opacity-100 blur-0"
                  : context.active
                    ? "translate-y-0 opacity-100 blur-0"
                    : "translate-y-[55%] opacity-0 blur-[3px]",
              )}
              style={{
                transitionDelay: context.reduceMotion
                  ? "0ms"
                  : `${context.startDelay + characterIndex * context.characterDelay}ms`,
                transitionDuration: context.reduceMotion ? "0ms" : SLOT_TRANSITION_TIMING,
                // Tailwind moves elements with the `translate` property, so transitioning
                // `transform` here would leave the characters snapping into place instead of sliding.
                transitionProperty: "opacity, filter, translate",
                transitionTimingFunction: "ease, ease, cubic-bezier(0.22, 1, 0.36, 1)",
                // Only promote while a swap is in flight: a page of these is ~1000 spans.
                willChange: context.promote ? "opacity, filter, translate" : undefined,
              }}
            >
              {character === " " ? "\u00a0" : character}
            </span>
          )
        })}
      </span>
    ))
  }

  return Children.map(node, (child) => {
    // Mixed children such as `{count}/4` arrive as separate text nodes, so each one still has to be
    // split into characters. Without this they render as plain text and never slot out.
    if (typeof child === "string" || typeof child === "number") return renderSlotNode(child, context)
    if (!isValidElement(child)) return child

    const element = child as ReactElement<{ children?: ReactNode }>
    if (element.props.children === undefined) return child

    return cloneElement(element, { children: renderSlotNode(element.props.children, context) })
  })
}

function SlotText({
  children,
  active,
  direction,
  reduceMotion,
  startDelay,
  characterDelay,
  promote,
}: {
  children: ReactNode
  active: boolean
  direction: "in" | "out"
  reduceMotion: boolean
  startDelay: number
  characterDelay: number
  promote: boolean
}) {
  return (
    <Fragment>
      {renderSlotNode(children, {
        active,
        direction,
        reduceMotion,
        startDelay,
        characterDelay,
        promote,
        counter: { current: 0 },
      })}
    </Fragment>
  )
}

export function CopyFeedbackTransition({
  value,
  copiedValue,
  active,
  children,
  effect = "auto",
  inline = false,
  ariaHidden = false,
  className,
  copiedClassName,
  originalDirection,
  copiedDirection,
}: {
  value: string
  copiedValue: string
  active: boolean
  children?: ReactNode
  effect?: CopyFeedbackEffect
  inline?: boolean
  ariaHidden?: boolean
  className?: string
  copiedClassName?: string
  originalDirection?: "ltr" | "rtl" | "auto"
  copiedDirection?: "ltr" | "rtl" | "auto"
}) {
  const shouldReduceMotion = useReducedMotion()
  const rootRef = useRef<HTMLElement | null>(null)
  const originalLayerRef = useRef<HTMLElement | null>(null)
  const copiedLayerRef = useRef<HTMLElement | null>(null)
  const naturalWidthRef = useRef<number | null>(null)
  const expandedWidthRef = useRef<number | null>(null)
  const releaseTimerRef = useRef<number | null>(null)
  const [expandedWidth, setExpandedWidth] = useState<number | null>(null)
  const [isSwapping, setIsSwapping] = useState(false)
  const [wrapsOntoMultipleLines, setWrapsOntoMultipleLines] = useState(false)
  const [valueFontSize, setValueFontSize] = useState<number | null>(null)

  const isRightToLeft = originalDirection === "rtl" || copiedDirection === "rtl"
  // Length is what decides this, not wrapping: a short value reads well slotted even over two
  // lines, while a long one would stagger for too long whether it wraps or not.
  const isBlockOfText = value.includes("\n") || Array.from(value).length > SLOT_CHARACTER_LIMIT
  // A block of text still wipes: only the per-character slot is length-sensitive, and `pop` moves the
  // whole layer, so asking for it explicitly is honoured whatever the value looks like.
  const resolvedEffect: Exclude<CopyFeedbackEffect, "auto"> =
    effect === "pop" ? "pop"
      : effect === "wipe" || isRightToLeft || isBlockOfText ? "wipe"
        : effect === "slot" ? "slot"
          : "pop"
  const useSlot = resolvedEffect === "slot"
  const usePop = resolvedEffect === "pop"

  const characterDelay = getCharacterDelay(Math.max(Array.from(value).length, Array.from(copiedValue).length))
  const swapDuration = useSlot
    ? getSlotDuration(value, copiedValue)
    : usePop
      ? POP_IN_DELAY_MS + POP_SCALE_MS
      : WIPE_TRANSITION_MS
  const expandDuration = usePop ? POP_EXPAND_TRANSITION_MS : EXPAND_TRANSITION_MS
  const isExpanded = expandedWidth !== null
  const startDelay = active && isExpanded && !shouldReduceMotion
    ? (usePop ? POP_EXPAND_LEAD_MS : EXPAND_LEAD_MS)
    : 0
  // Scaling a value anchors it where it is read from: its start edge, and its first line when the
  // value wraps, so the pop never drags the text away from the line the copy control sits on.
  const popOrigin = `${isRightToLeft ? "right" : "left"} ${wrapsOntoMultipleLines ? "top" : "center"}`
  const popTransition = (entering: boolean) => ({
    transitionProperty: "opacity, filter, scale",
    transformOrigin: popOrigin,
    transitionDuration: shouldReduceMotion
      ? "0ms"
      : entering
        ? `${POP_FADE_MS}ms, ${POP_FADE_MS}ms, ${POP_SCALE_MS}ms`
        : `${POP_OUT_MS}ms`,
    transitionTimingFunction: entering ? `ease-out, ease-out, ${POP_OVERSHOOT}` : "ease-in",
    transitionDelay: shouldReduceMotion || !entering ? "0ms" : `${startDelay + POP_IN_DELAY_MS}ms`,
  })
  // `active` covers the opening frame, which `isSwapping` cannot because it is set after paint.
  const shouldPromote = (active || isSwapping) && !shouldReduceMotion
  const Root = inline ? "span" : "div"
  const Layer = inline ? "span" : "div"

  // Track the resting size while the value is at rest, so an expansion always compares against the
  // real natural width rather than a box that is already holding open for "Copied".
  useLayoutEffect(() => {
    const root = rootRef.current
    const originalLayer = originalLayerRef.current
    if (!root || !originalLayer || active || isExpanded) return

    const measure = () => {
      naturalWidthRef.current = readLayoutWidth(root)
      setValueFontSize(readValueFontSize(originalLayer))

      // Only decides where "Copied" sits vertically: on a wrapped value it belongs on the first line.
      const lineHeight = readFirstLineHeight(findFirstLineElement(originalLayer))
      if (lineHeight === null || lineHeight <= 0) return
      setWrapsOntoMultipleLines(originalLayer.scrollHeight > lineHeight * 1.6)
    }

    measure()

    const observer = new ResizeObserver(measure)
    observer.observe(root)
    observer.observe(originalLayer)
    return () => observer.disconnect()
  }, [active, isExpanded, value])

  // Compositor promotion is only worth its cost while a swap is actually running. `active` carries
  // the opening frame so the layer exists before the characters move, and this keeps it alive until
  // they have settled back rather than dropping it on the last frame of the transition.
  useEffect(() => {
    if (active) {
      setIsSwapping(true)
      return
    }

    const timer = window.setTimeout(
      () => setIsSwapping(false),
      shouldReduceMotion ? 0 : swapDuration + PROMOTION_TAIL_MS,
    )
    return () => window.clearTimeout(timer)
  }, [active, shouldReduceMotion, swapDuration])

  // Grow the box before the copied word lands, then hold that size until the value has slotted back.
  useLayoutEffect(() => {
    const root = rootRef.current
    const copiedLayer = copiedLayerRef.current
    if (!root || !copiedLayer) return

    if (releaseTimerRef.current !== null) {
      window.clearTimeout(releaseTimerRef.current)
      releaseTimerRef.current = null
    }

    const applyExpandedWidth = (width: number | null) => {
      expandedWidthRef.current = width
      setExpandedWidth(width)
    }

    if (active) {
      const copiedWidth = readLayoutWidth(copiedLayer)
      const naturalWidth = naturalWidthRef.current ?? readLayoutWidth(root)
      applyExpandedWidth(copiedWidth > naturalWidth ? copiedWidth : null)
      return
    }

    if (expandedWidthRef.current === null) return

    releaseTimerRef.current = window.setTimeout(() => {
      applyExpandedWidth(null)
      releaseTimerRef.current = null
    }, shouldReduceMotion ? 0 : swapDuration)
  }, [active, shouldReduceMotion, swapDuration])

  useEffect(() => () => {
    if (releaseTimerRef.current !== null) window.clearTimeout(releaseTimerRef.current)
  }, [])

  return (
    <Root
      ref={rootRef as never}
      aria-hidden={ariaHidden || undefined}
      data-slot="copy-feedback-transition"
      data-effect={resolvedEffect}
      data-active={active || undefined}
      className={cn(
        "relative min-w-0 max-w-full overflow-hidden transition-[min-width] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
        inline ? "inline-block" : "block",
        className,
      )}
      style={{
        minWidth: expandedWidth === null ? undefined : `${expandedWidth}px`,
        transitionDuration: shouldReduceMotion ? "0ms" : `${expandDuration}ms`,
      }}
    >
      <Layer
        ref={originalLayerRef as never}
        data-copy-layer="original"
        dir={originalDirection}
        className={cn(
          "min-w-0",
          // Scale is ignored on a non-replaced inline box, so an inline value has to become one.
          usePop && "transition-[opacity,filter,scale] motion-reduce:transition-none",
          usePop && inline && "inline-block",
          usePop && (active
            ? "scale-[0.88] opacity-0 blur-[2px] motion-reduce:scale-100 motion-reduce:blur-none"
            : "scale-100 opacity-100 blur-0"),
          !useSlot && !usePop && "transition-[clip-path,opacity,transform,filter] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
          !useSlot && !usePop && (active
            ? "-translate-y-[10%] opacity-0 blur-[3px] [clip-path:inset(0_0_100%_0)] motion-reduce:translate-y-0 motion-reduce:blur-none"
            : "translate-y-0 opacity-100 blur-0 [clip-path:inset(0_0_0_0)]"),
        )}
        style={useSlot ? undefined : usePop ? popTransition(!active) : {
          transitionDelay: active && !shouldReduceMotion ? `${startDelay}ms` : "0ms",
          transitionDuration: shouldReduceMotion ? "0ms" : `${WIPE_TRANSITION_MS}ms`,
        }}
      >
        {useSlot ? (
          <SlotText
            active={active}
            direction="out"
            reduceMotion={Boolean(shouldReduceMotion)}
            startDelay={startDelay}
            characterDelay={characterDelay}
            promote={shouldPromote}
          >
            {children ?? value}
          </SlotText>
        ) : children ?? value}
      </Layer>
      {/*
        Content-width and never wrapped, so its natural size stays measurable no matter how narrow
        the box currently is. An `inset-0` layer would only ever report the container width back.
      */}
      <Layer
        ref={copiedLayerRef as never}
        data-copy-layer="copied"
        aria-hidden="true"
        dir={copiedDirection}
        className={cn(
          "pointer-events-none absolute inset-y-0 start-0 flex w-max whitespace-nowrap font-medium",
          wrapsOntoMultipleLines ? "items-start" : "items-center",
          copiedClassName,
          usePop && "transition-[opacity,filter,scale] motion-reduce:transition-none",
          usePop && (active
            ? "scale-100 opacity-100 blur-0"
            : "scale-[0.72] opacity-0 blur-[3px] motion-reduce:scale-100 motion-reduce:blur-none"),
          !useSlot && !usePop && "transition-[clip-path,opacity,transform,filter] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
          !useSlot && !usePop && (active
            ? "translate-y-0 opacity-100 blur-0 [clip-path:inset(0_0_0_0)]"
            : "translate-y-[10%] opacity-0 blur-[3px] [clip-path:inset(100%_0_0_0)] motion-reduce:translate-y-0 motion-reduce:blur-none"),
        )}
        style={{
          // Matches the value it replaces rather than the block around it, so the swap keeps one size.
          fontSize: valueFontSize === null ? undefined : `${valueFontSize}px`,
          ...(useSlot ? null : usePop ? popTransition(active) : {
            transitionDelay: active && !shouldReduceMotion ? `${startDelay}ms` : "0ms",
            transitionDuration: shouldReduceMotion ? "0ms" : `${WIPE_TRANSITION_MS}ms`,
          }),
        }}
      >
        {useSlot ? (
          <SlotText
            active={active}
            direction="in"
            reduceMotion={Boolean(shouldReduceMotion)}
            startDelay={startDelay}
            characterDelay={characterDelay}
            promote={shouldPromote}
          >
            {copiedValue}
          </SlotText>
        ) : copiedValue}
      </Layer>
    </Root>
  )
}

export function CopyStatusIcon({
  copied,
  className,
  iconClassName = "size-3.5",
}: {
  copied: boolean
  className?: string
  iconClassName?: string
}) {
  const shouldReduceMotion = useReducedMotion()
  const hiddenState = {
    opacity: 0,
    scale: shouldReduceMotion ? 1 : 0.25,
    filter: shouldReduceMotion ? "blur(0px)" : "blur(4px)",
  }
  const visibleState = { opacity: 1, scale: 1, filter: "blur(0px)" }
  const transition = shouldReduceMotion ? { duration: 0 } : { type: "spring" as const, duration: 0.3, bounce: 0 }

  return (
    <span className={cn("relative block", iconClassName, className)} aria-hidden="true">
      <motion.span
        initial={false}
        animate={copied ? hiddenState : visibleState}
        transition={transition}
        className="absolute inset-0 grid place-items-center"
      >
        <Copy className={iconClassName} strokeWidth={1.35} />
      </motion.span>
      <motion.span
        initial={false}
        animate={copied ? visibleState : hiddenState}
        transition={transition}
        className="absolute inset-0 grid place-items-center"
      >
        <Check className={iconClassName} strokeWidth={1.7} />
      </motion.span>
    </span>
  )
}

export function CopyableField({
  label,
  value,
  copyValue = value,
  children,
  className,
  contentClassName,
  buttonClassName,
  iconClassName,
  tone = "default",
  effect = "auto",
}: {
  label: string
  value: string
  copyValue?: string
  children?: ReactNode
  className?: string
  contentClassName?: string
  buttonClassName?: string
  iconClassName?: string
  tone?: "default" | "inverse"
  effect?: CopyFeedbackEffect
}) {
  const [copied, setCopied] = useState(false)
  const [buttonOffset, setButtonOffset] = useState(0)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const resetTimerRef = useRef<number | null>(null)
  const { direction, t } = useLanguage()

  // Sit the control on the first line of the value so it reads as part of the text rather than
  // floating beside a wrapped block. Derived from the line box and the control's own box, never
  // from the rendered text: measuring that would feed the offset back into what it measures.
  useLayoutEffect(() => {
    const content = contentRef.current
    if (!content) return

    const alignToFirstLine = () => {
      const layer = content.querySelector('[data-copy-layer="original"]') ?? content
      // A control taller than the line rides up so its icon still lands on that line.
      const controlHeight = buttonRef.current?.offsetHeight || COPY_BUTTON_SIZE_PX

      const lineCentre = readFirstLineOffset(layer)
      if (lineCentre !== null) {
        setButtonOffset(Math.round(lineCentre - controlHeight / 2))
        return
      }

      const lineHeight = readFirstLineHeight(findFirstLineElement(layer))
      if (lineHeight === null || lineHeight <= 0) return
      setButtonOffset(Math.round((lineHeight - controlHeight) / 2))
    }

    alignToFirstLine()

    const observer = new ResizeObserver(alignToFirstLine)
    observer.observe(content)
    return () => observer.disconnect()
  }, [value])

  useEffect(() => () => {
    if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current)
  }, [])

  async function copyField() {
    try {
      await navigator.clipboard.writeText(copyValue)
      if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current)
      setCopied(true)
      resetTimerRef.current = window.setTimeout(() => {
        setCopied(false)
        resetTimerRef.current = null
      }, 1600)
    } catch {
      setCopied(false)
      toast.error(t("Could not copy this field."))
    }
  }

  return (
    <div
      data-slot="copyable-field"
      data-copied={copied || undefined}
      dir={direction}
      className={cn("group/copy inline-flex max-w-full min-w-0 items-start gap-3", className)}
    >
      <div ref={contentRef} className={cn("min-w-0 flex-[0_1_auto]", contentClassName)}>
        <CopyFeedbackTransition
          value={copyValue}
          copiedValue={t("Copied")}
          active={copied}
          effect={effect}
          copiedClassName={tone === "inverse" ? "text-[var(--md-accent-lift-strong)]" : "text-[var(--md-accent)]"}
          originalDirection={direction}
          copiedDirection={direction}
        >
          {children ?? value}
        </CopyFeedbackTransition>
      </div>

      <button
        ref={buttonRef}
        type="button"
        aria-label={copied ? `${label}: ${t("Copied")}` : `${t("Copy")} ${label}`}
        title={copied ? t("Copied") : `${t("Copy")} ${label}`}
        style={{ marginBlockStart: `${buttonOffset}px` }}
        className={cn(
          "group/copy-button relative grid size-5 shrink-0 place-items-center rounded-full text-[var(--md-subtle)] opacity-0",
          "transition-[color,opacity,transform] duration-[160ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:text-[var(--md-accent)] active:scale-[0.94] motion-reduce:transition-none motion-reduce:active:scale-100",
          "before:absolute before:-inset-1.5 before:rounded-full before:transition-colors before:duration-[160ms] before:content-[''] hover:before:bg-[var(--md-surface-tint)]",
          "after:absolute after:-inset-2.5 after:content-['']",
          "focus-visible:opacity-100 focus-visible:outline-none focus-visible:before:bg-[var(--md-surface-tint)] focus-visible:before:ring-[3px] focus-visible:before:ring-[var(--md-accent-a14)]",
          "group-hover/copy:opacity-100 group-focus-within/copy:opacity-100 [@media(hover:none)]:opacity-100",
          tone === "inverse" && "text-white/55 hover:text-white hover:before:bg-white/10 focus-visible:before:bg-white/10 focus-visible:before:ring-white/24",
          copied && (tone === "inverse"
            ? "text-white opacity-100 before:bg-white/12"
            : "text-[var(--md-accent)] opacity-100 before:bg-[var(--md-accent-a10)]"),
          buttonClassName,
        )}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          void copyField()
        }}
      >
        <CopyStatusIcon copied={copied} iconClassName={cn("size-3.5", iconClassName)} className="relative" />
      </button>

      <span className="sr-only" role="status" aria-live="polite">
        {copied ? `${label}: ${t("Copied")}` : ""}
      </span>
    </div>
  )
}
