import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion, useReducedMotion, useSpring, type MotionValue } from "motion/react"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { SpectralBloomShader } from "@/components/multideck/dexter-action-pill"
import { DexterSummonPrompt, type SummonPromptStatus } from "@/components/multideck/dexter-summon-prompt"
import { useLanguage } from "@/i18n/language-provider"
import {
  buildSummonBrief,
  describeSummonTarget,
  readSummonPageContext,
  readSummonRadius,
  readSummonRect,
  rectsEqual,
  resolveFocusedSummonTarget,
  resolveSummonRegion,
  resolveSummonTarget,
  summonIgnoreAttribute,
  type SummonRect,
  type SummonTarget,
} from "@/lib/dexter-summon-context"
import { DexterApiError, streamDexterMessage } from "@/lib/dexter-api"
import { rememberDexterConversationHandoff } from "@/lib/dexter-navigation"
import { matchesPointerBinding } from "@/lib/keyboard-shortcut-binding"
import { useShortcutActions, useShortcutBinding, useShortcutSuspension } from "@/lib/keyboard-shortcuts"
import { mdEaseIn, mdEaseOut, mdMotion, reduceMotion } from "@/lib/motion"
import { useAiAgentName } from "@/lib/user-preferences"

type SummonPhase = "idle" | "picking" | "anchored"

/**
 * The ring travels on a spring while the operator is choosing an area, so it
 * feels magnetic rather than teleported. It is deliberately a touch over-damped:
 * a highlight that overshoots its target reads as imprecise.
 */
const travelSpring = { stiffness: 520, damping: 38, mass: 0.55, restDelta: 0.35 }
/** Ring padding, which is what makes a field's stroke read as thicker. */
const ringPadding = 3
const promptWidth = 384
const promptMargin = 12
const promptGap = 10

type Placement = "above" | "below"

/** Kept out of the component so the suspension key is a stable reference. */
const summonExemptions = ["dexter.summon"]

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

/**
 * One set of motion values, shared by the ring, its halo and the dimming
 * spotlight. Driving three elements from the same springs keeps them welded
 * together and costs one animation instead of three.
 */
function useRectMotion() {
  const x = useSpring(0, travelSpring)
  const y = useSpring(0, travelSpring)
  const width = useSpring(0, travelSpring)
  const height = useSpring(0, travelSpring)

  const apply = useCallback(
    (rect: SummonRect, immediate = false) => {
      const values: [MotionValue<number>, number][] = [
        [x, rect.left],
        [y, rect.top],
        [width, rect.width],
        [height, rect.height],
      ]

      for (const [value, next] of values) {
        if (immediate) value.jump(next)
        else value.set(next)
      }
    },
    [height, width, x, y],
  )

  return { x, y, width, height, apply }
}

/**
 * A sensible first candidate when nothing is under the pointer: whatever sits in
 * the middle of the working area. Better than an empty box floating over the page.
 */
function firstWorkingAreaRegion() {
  const main = document.querySelector("main")
  if (!main) return null

  const rect = main.getBoundingClientRect()
  const x = rect.left + rect.width / 2
  const y = rect.top + Math.min(rect.height / 2, 260)
  return resolveSummonRegion(document.elementFromPoint(x, y)) ?? resolveSummonRegion(main.firstElementChild)
}

function SummonHud({ label, visible }: { label: string; visible: boolean }) {
  const shouldReduceMotion = useReducedMotion()

  return (
    <motion.div
      className="md-summon-hud"
      aria-hidden={!visible}
      initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, filter: "blur(6px)" }}
      animate={
        shouldReduceMotion
          ? { opacity: visible ? 1 : 0 }
          : { opacity: visible ? 1 : 0, y: visible ? 0 : 10, filter: visible ? "blur(0px)" : "blur(5px)" }
      }
      transition={{
        default: reduceMotion(Boolean(shouldReduceMotion), mdMotion.spring),
        opacity: { duration: shouldReduceMotion ? 0 : visible ? 0.2 : 0.14, ease: visible ? mdEaseOut : mdEaseIn },
        filter: { duration: shouldReduceMotion ? 0 : 0.26, ease: mdEaseOut },
      }}
    >
      <span className="text-[12.5px] font-medium text-[var(--md-ink)]">{label}</span>
      <span className="flex items-center gap-1.5">
        <KbdGroup dir="ltr" data-i18n-skip>
          <Kbd className="h-5 min-w-5 bg-[var(--md-field-bg)] text-[11px] text-[var(--md-ink)]">↵</Kbd>
        </KbdGroup>
        <span className="text-[11.5px] text-[var(--md-subtle)]">to ask</span>
        <span className="h-3 w-px bg-[var(--md-line-strong)]" aria-hidden="true" />
        <KbdGroup dir="ltr" data-i18n-skip>
          <Kbd className="h-5 min-w-5 bg-[var(--md-field-bg)] text-[11px] text-[var(--md-ink)]">Esc</Kbd>
        </KbdGroup>
        <span className="text-[11.5px] text-[var(--md-subtle)]">to leave</span>
      </span>
    </motion.div>
  )
}

/**
 * Summons Dexter onto whatever the operator is pointing at.
 *
 * Two ways in, one experience: a modified double-click resolves the thing under
 * the pointer, and the keyboard route resolves what is focused. When neither
 * names something, the screen dims and the same ring becomes an area picker.
 *
 * Everything that moves per frame — the ring, the dimming cut-out, the prompt's
 * position — is driven by motion values rather than React state, so following a
 * scroll costs no renders.
 */
export function DexterSummon({ navigate }: { navigate: (path: string) => void }) {
  const { language, t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const agentName = useAiAgentName()

  const [phase, setPhase] = useState<SummonPhase>("idle")
  const [target, setTarget] = useState<SummonTarget | null>(null)
  const [radius, setRadius] = useState("10px")
  const [placement, setPlacement] = useState<Placement>("below")
  const [question, setQuestion] = useState("")
  const [answer, setAnswer] = useState("")
  const [status, setStatus] = useState<SummonPromptStatus>("ready")
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const rect = useRectMotion()
  const promptX = useSpring(0, travelSpring)
  const promptY = useSpring(0, travelSpring)

  const promptRef = useRef<HTMLDivElement>(null)
  const rectRef = useRef<SummonRect | null>(null)
  const targetRef = useRef<HTMLElement | null>(null)
  const pointerRef = useRef<{ x: number; y: number } | null>(null)
  const pickedRef = useRef<HTMLElement | null>(null)
  const frameRef = useRef(0)
  const conversationRef = useRef<string | null>(null)
  const clientSessionRef = useRef(crypto.randomUUID())
  const requestRef = useRef(0)
  const openedRef = useRef(false)

  const isOpen = phase !== "idle"
  const summonBinding = useShortcutBinding("dexter.summon")
  // App shortcuts stand down while the prompt has the keyboard, but the summon
  // gesture itself stays live: an operator who spots a better target should be
  // able to point at it without dismissing the box first.
  useShortcutSuspension(isOpen, summonExemptions)

  // ── Geometry ───────────────────────────────────────────────────────────────

  /** Positions the prompt against the ring, flipping and clamping to the viewport. */
  const placePrompt = useCallback(
    (next: SummonRect, immediate: boolean) => {
      const node = promptRef.current
      const size = node
        ? { width: node.offsetWidth || promptWidth, height: node.offsetHeight || 132 }
        : { width: promptWidth, height: 132 }

      const spaceBelow = window.innerHeight - (next.top + next.height) - promptGap - promptMargin
      const spaceAbove = next.top - promptGap - promptMargin
      const below = spaceBelow >= size.height || spaceBelow >= spaceAbove
      const top = below ? next.top + next.height + promptGap : next.top - size.height - promptGap

      const rtl = document.documentElement.dir === "rtl"
      const preferredLeft = rtl ? next.left + next.width - size.width : next.left
      const left = clamp(preferredLeft, promptMargin, Math.max(promptMargin, window.innerWidth - size.width - promptMargin))
      const clampedTop = clamp(top, promptMargin, Math.max(promptMargin, window.innerHeight - size.height - promptMargin))

      setPlacement(below ? "below" : "above")

      if (immediate) {
        promptX.jump(left)
        promptY.jump(clampedTop)
      } else {
        promptX.set(left)
        promptY.set(clampedTop)
      }
    },
    [promptX, promptY],
  )

  /**
   * `prompt` is separate from the ring's own `immediate` on purpose. The ring may
   * travel between candidates, but the prompt is mounted fresh at each anchor, so
   * springing its position would send it flying in from wherever it last sat —
   * usually the corner of the screen. It jumps into place and animates its own
   * scale and blur instead.
   */
  const applyRect = useCallback(
    (next: SummonRect, immediate: boolean, prompt: "skip" | "jump" | "ease") => {
      rectRef.current = next
      rect.apply(next, immediate)
      if (prompt !== "skip") placePrompt(next, prompt === "jump")
    },
    [placePrompt, rect],
  )

  /** Re-measures the anchored element. Called from scroll, resize and mutations. */
  const trackTarget = useCallback(() => {
    const element = targetRef.current
    if (!element) return

    if (!element.isConnected) {
      setPhase("idle")
      return
    }

    const next = readSummonRect(element, ringPadding)
    if (rectsEqual(next, rectRef.current)) return
    // Following a scroll must be exact, not springy: a lagging ring would read as
    // a highlight that has come unstuck from the thing it marks.
    applyRect(next, true, "jump")
  }, [applyRect])

  const scheduleTrack = useCallback(() => {
    if (frameRef.current) return
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0
      trackTarget()
    })
  }, [trackTarget])

  // ── Opening and closing ────────────────────────────────────────────────────

  const anchorTo = useCallback(
    (element: HTMLElement, options: { immediate?: boolean } = {}) => {
      const described = describeSummonTarget(element)
      const wasAnchored = phase === "anchored"
      targetRef.current = element
      pickedRef.current = element
      setTarget(described)
      setRadius(readSummonRadius(element, described.kind === "field" ? 6 : 8))
      setPhase("anchored")

      const next = readSummonRect(element, ringPadding)
      // The first anchor arrives under the pointer, so it jumps. A hand-off from
      // the picker, or a re-aim while the box is already open, travels — the
      // operator's eye is on the ring and the movement is the explanation.
      applyRect(next, options.immediate ?? !openedRef.current, wasAnchored ? "ease" : "jump")
      openedRef.current = true
    },
    [applyRect, phase],
  )

  const enterPicking = useCallback(
    (point: { x: number; y: number } | null) => {
      const start = point ?? {
        x: window.innerWidth / 2,
        y: Math.min(window.innerHeight / 2, 320),
      }
      pointerRef.current = start

      // Opening with the cut-out already over something is what stops the dim from
      // flashing as one full sheet. The pointer is tried first, then the middle of
      // the working area, so the keyboard route lands on real content too.
      const candidate =
        resolveSummonRegion(document.elementFromPoint(start.x, start.y)) ?? firstWorkingAreaRegion()

      pickedRef.current = candidate
      setTarget(candidate ? describeSummonTarget(candidate) : null)
      setRadius(candidate ? readSummonRadius(candidate) : "12px")
      setPhase("picking")

      const next = candidate
        ? readSummonRect(candidate, ringPadding)
        : { top: start.y - 40, left: start.x - 120, width: 240, height: 80 }
      applyRect(next, true, "skip")
      openedRef.current = true
    },
    [applyRect],
  )

  /**
   * Dismisses the overlay. The target and the answer are deliberately left in
   * place: the layer is still fading out, and blanking its contents first would
   * show an empty box on the way out. Opening clears them instead.
   */
  const close = useCallback(() => {
    requestRef.current += 1
    setPhase("idle")
    conversationRef.current = null
    clientSessionRef.current = crypto.randomUUID()
    targetRef.current = null
    pickedRef.current = null
    openedRef.current = false
  }, [])

  const resetSession = useCallback(() => {
    requestRef.current += 1
    conversationRef.current = null
    clientSessionRef.current = crypto.randomUUID()
    setQuestion("")
    setAnswer("")
    setError(null)
    setStatus("ready")
    setCopied(false)
  }, [])

  const summonFromPointer = useCallback(
    (event: MouseEvent) => {
      resetSession()
      pointerRef.current = { x: event.clientX, y: event.clientY }
      const resolved = resolveSummonTarget(document.elementFromPoint(event.clientX, event.clientY) ?? (event.target as Element | null))

      if (resolved) {
        // A modified double-click inside a field leaves a word selected; clearing
        // it stops the ring from framing a flash of blue.
        window.getSelection()?.removeAllRanges()
        anchorTo(resolved)
        return
      }

      enterPicking({ x: event.clientX, y: event.clientY })
    },
    [anchorTo, enterPicking, resetSession],
  )

  const summonFromKeyboard = useCallback(() => {
    resetSession()
    const focused = resolveFocusedSummonTarget()
    if (focused) {
      anchorTo(focused, { immediate: true })
      return
    }

    enterPicking(pointerRef.current)
  }, [anchorTo, enterPicking, resetSession])

  // Remember where the operator is pointing before the keyboard shortcut is
  // pressed. A keyboard event has no coordinates of its own; without this, Cmd/D
  // or Ctrl/D opens over a generic point in the page instead of the thing under
  // the pointer.
  useEffect(() => {
    if (phase !== "idle") return

    const rememberPointer = (event: PointerEvent) => {
      const source = event.target
      if (source instanceof Element && source.closest(`[${summonIgnoreAttribute}]`)) return
      pointerRef.current = { x: event.clientX, y: event.clientY }
    }

    window.addEventListener("pointermove", rememberPointer, { passive: true })
    return () => window.removeEventListener("pointermove", rememberPointer)
  }, [phase])

  useShortcutActions(
    useMemo(
      () => ({
        "dexter.summon": (trigger: { event: KeyboardEvent | MouseEvent }) => {
          if (trigger.event instanceof MouseEvent) summonFromPointer(trigger.event)
          else summonFromKeyboard()
        },
        "dexter.summonKeyboard": () => summonFromKeyboard(),
      }),
      [summonFromKeyboard, summonFromPointer],
    ),
  )

  // ── Picking ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== "picking") return

    document.documentElement.classList.add("md-summon-picking")
    let frame = 0

    const evaluate = (x: number, y: number) => {
      pointerRef.current = { x, y }
      const candidate = resolveSummonTarget(document.elementFromPoint(x, y))
      if (!candidate || candidate === pickedRef.current) return

      pickedRef.current = candidate
      setTarget(describeSummonTarget(candidate))
      setRadius(readSummonRadius(candidate))
      applyRect(readSummonRect(candidate, ringPadding), false, "skip")
    }

    const handleMove = (event: PointerEvent) => {
      if (frame) return
      const { clientX, clientY } = event
      frame = requestAnimationFrame(() => {
        frame = 0
        evaluate(clientX, clientY)
      })
    }

    const step = (element: HTMLElement | null) => {
      if (!element) return
      pickedRef.current = element
      setTarget(describeSummonTarget(element))
      setRadius(readSummonRadius(element))
      applyRect(readSummonRect(element, ringPadding), false, "skip")
      element.scrollIntoView({ block: "nearest", inline: "nearest", behavior: shouldReduceMotion ? "auto" : "smooth" })
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const current = pickedRef.current

      if (event.key === "Escape") {
        event.preventDefault()
        close()
        return
      }

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault()
        if (current) anchorTo(current)
        return
      }

      if (!current) return

      if (event.key === "ArrowUp") {
        event.preventDefault()
        step(resolveSummonRegion(current.parentElement))
        return
      }

      if (event.key === "ArrowDown") {
        event.preventDefault()
        const child = [...current.children].find(
          (node): node is HTMLElement => node instanceof HTMLElement && Boolean(resolveSummonTarget(node)),
        )
        step(child ? resolveSummonTarget(child) : null)
        return
      }

      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault()
        const forward = event.key === (document.documentElement.dir === "rtl" ? "ArrowLeft" : "ArrowRight")
        const sibling = forward ? current.nextElementSibling : current.previousElementSibling
        step(sibling instanceof HTMLElement ? resolveSummonTarget(sibling) : null)
      }
    }

    const handleClick = (event: MouseEvent) => {
      event.preventDefault()
      event.stopPropagation()
      const candidate = resolveSummonTarget(document.elementFromPoint(event.clientX, event.clientY))
      if (candidate) anchorTo(candidate)
      else close()
    }

    window.addEventListener("pointermove", handleMove, { passive: true })
    window.addEventListener("keydown", handleKeyDown, { capture: true })
    window.addEventListener("mousedown", handleClick, { capture: true })

    return () => {
      document.documentElement.classList.remove("md-summon-picking")
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener("pointermove", handleMove)
      window.removeEventListener("keydown", handleKeyDown, { capture: true })
      window.removeEventListener("mousedown", handleClick, { capture: true })
    }
  }, [anchorTo, applyRect, close, phase, shouldReduceMotion])

  // ── Anchored lifecycle ─────────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== "anchored") return

    const element = targetRef.current
    window.addEventListener("scroll", scheduleTrack, { capture: true, passive: true })
    window.addEventListener("resize", scheduleTrack)

    const observer = new ResizeObserver(scheduleTrack)
    if (element) observer.observe(element)

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.preventDefault()
      event.stopPropagation()
      close()
    }

    /** An outside press dismisses, and that press is swallowed rather than acted on. */
    const handleOutside = (event: MouseEvent) => {
      if (promptRef.current?.contains(event.target as Node)) return
      // A press that carries the summon modifier is a re-aim, not a dismissal.
      // Closing here first would flash the box shut and straight back open.
      if (summonBinding && matchesPointerBinding(summonBinding, event)) return

      event.preventDefault()
      event.stopPropagation()
      const swallow = (click: MouseEvent) => {
        click.preventDefault()
        click.stopPropagation()
      }
      window.addEventListener("click", swallow, { capture: true, once: true })
      window.setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 400)
      close()
    }

    window.addEventListener("keydown", handleKeyDown, { capture: true })
    window.addEventListener("mousedown", handleOutside, { capture: true })

    return () => {
      window.removeEventListener("scroll", scheduleTrack, { capture: true })
      window.removeEventListener("resize", scheduleTrack)
      window.removeEventListener("keydown", handleKeyDown, { capture: true })
      window.removeEventListener("mousedown", handleOutside, { capture: true })
      observer.disconnect()
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
      frameRef.current = 0
    }
  }, [close, phase, scheduleTrack, summonBinding])

  // The prompt grows as an answer streams in, so it re-places itself against the
  // ring instead of drifting off the bottom of the window.
  useLayoutEffect(() => {
    if (phase !== "anchored") return

    const node = promptRef.current
    const current = rectRef.current
    if (!node || !current) return

    const observer = new ResizeObserver(() => {
      const latest = rectRef.current
      if (latest) placePrompt(latest, false)
    })
    observer.observe(node)

    placePrompt(current, true)
    return () => observer.disconnect()
  }, [phase, placePrompt])

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1600)
    return () => window.clearTimeout(timer)
  }, [copied])

  // ── Asking ─────────────────────────────────────────────────────────────────

  const submit = useCallback(() => {
    const prompt = question.trim()
    const current = target
    if (!prompt || !current || status === "thinking" || status === "streaming") return

    const requestId = ++requestRef.current
    const isFollowUp = Boolean(conversationRef.current)
    const message = isFollowUp
      ? prompt
      : `${buildSummonBrief(current, readSummonPageContext())}\n\n---\n\nQuestion: ${prompt}`

    setQuestion("")
    setAnswer("")
    setError(null)
    setStatus("thinking")

    void streamDexterMessage(
      {
        conversationId: conversationRef.current,
        clientSessionId: clientSessionRef.current,
        message,
        specialist: "auto",
        // The summon is an interruption, so it always takes the quickest engine.
        model: "fast",
        locale: language,
        attachments: [],
      },
      {
        onAnswerDelta: (delta) => {
          if (requestId !== requestRef.current) return
          setStatus("streaming")
          setAnswer((current) => current + delta)
        },
      },
    )
      .then((conversation) => {
        if (requestId !== requestRef.current) return
        conversationRef.current = conversation.id
        const last = [...conversation.messages].reverse().find((item) => item.role === "assistant")
        if (last?.content) setAnswer(last.content)
        setStatus("done")
      })
      .catch((cause: unknown) => {
        if (requestId !== requestRef.current) return
        setStatus("error")
        setError(
          cause instanceof DexterApiError
            ? cause.message
            : t("Dexter could not answer that. Try again in a moment."),
        )
      })
  }, [language, question, status, t, target])

  const continueInDexter = useCallback(() => {
    if (conversationRef.current) rememberDexterConversationHandoff(conversationRef.current)
    close()
    navigate("/agent-dexter")
  }, [close, navigate])

  const copyAnswer = useCallback(() => {
    if (!answer.trim()) return
    void navigator.clipboard?.writeText(answer).then(() => setCopied(true)).catch(() => setCopied(false))
  }, [answer])

  // ── Render ─────────────────────────────────────────────────────────────────

  if (typeof document === "undefined") return null

  const ringStyle = { x: rect.x, y: rect.y, width: rect.width, height: rect.height, borderRadius: radius }

  return createPortal(
    <AnimatePresence>
      {isOpen ? (
        // The layer is the only element whose presence is animated. Everything
        // inside it cross-fades between phases instead of mounting and
        // unmounting, which is what keeps a hand-off from the picker to the
        // anchored prompt free of hard cuts.
        <motion.div
          key="summon-layer"
          className="md-summon-layer"
          {...{ [summonIgnoreAttribute]: "" }}
          data-phase={phase}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          // Leaving is shorter and accelerates, so dismissing feels like the
          // overlay gets out of the way rather than dissolving slowly.
          exit={{ opacity: 0, transition: { duration: shouldReduceMotion ? 0 : 0.15, ease: mdEaseIn } }}
          transition={{ duration: shouldReduceMotion ? 0 : 0.2, ease: mdEaseOut }}
        >
          <motion.div
            className="md-summon-spotlight"
            style={{ x: rect.x, y: rect.y, width: rect.width, height: rect.height, borderRadius: radius }}
          />

          <motion.div
            className="md-summon-halo"
            style={ringStyle}
            initial={shouldReduceMotion ? false : { opacity: 0, scale: 1.05 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.34, ease: mdEaseOut }}
          />

          <motion.div
            className="md-summon-ring"
            style={ringStyle}
            initial={shouldReduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.26, ease: mdEaseOut }}
          >
            <span aria-hidden="true" className="md-summon-ring__shader">
              <SpectralBloomShader shape="composer" />
            </span>
          </motion.div>

          <SummonHud
            visible={phase === "picking"}
            label={target ? `${t("Ask")} ${agentName} ${t("about")} ${target.label}` : t("Pick anything on the screen")}
          />

          {/* Never mounted while picking: an offscreen prompt would still take the
              focus its composer asks for, and the picker owns the keyboard. It
              stays mounted through the closing fade so the box leaves with the
              layer instead of vanishing a frame early. */}
          {target && phase !== "picking" ? (
            <motion.div
              ref={promptRef}
              className="md-summon-prompt-anchor"
              style={{
                x: promptX,
                y: promptY,
                width: `min(${promptWidth}px, calc(100vw - ${promptMargin * 2}px))`,
                // Scale out of the edge nearest the ring, so the box reads as
                // having come from the thing it is pinned to.
                transformOrigin: placement === "below" ? "top center" : "bottom center",
              }}
              initial={
                shouldReduceMotion
                  ? { opacity: 0 }
                  : { opacity: 0, scale: 0.965, translateY: placement === "below" ? -10 : 10, filter: "blur(7px)" }
              }
              animate={{ opacity: 1, scale: 1, translateY: 0, filter: "blur(0px)" }}
              transition={{
                default: reduceMotion(Boolean(shouldReduceMotion), mdMotion.spring),
                // Opacity and blur ramp faster than the spring settles, so the box
                // is readable while it is still easing into place.
                opacity: { duration: shouldReduceMotion ? 0 : 0.2, ease: mdEaseOut },
                filter: { duration: shouldReduceMotion ? 0 : 0.28, ease: mdEaseOut },
              }}
            >
              <DexterSummonPrompt
                target={target}
                status={status}
                question={question}
                answer={answer}
                error={error}
                copied={copied}
                onQuestionChange={setQuestion}
                onSubmit={submit}
                onClose={close}
                onCopy={copyAnswer}
                onAskAnother={() => {
                  setAnswer("")
                  setError(null)
                  setStatus("ready")
                }}
                onContinueInDexter={continueInDexter}
              />
            </motion.div>
          ) : null}
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}
