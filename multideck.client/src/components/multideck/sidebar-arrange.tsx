import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import {
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
import { GripVertical, Pin, RotateCcw, type LucideIcon } from "@/components/icons/hugeicons"
import { cn } from "@/lib/utils"
import { useLanguage } from "@/i18n/language-provider"

export type SidebarArrangeItem = {
  id: string
  label: string
  icon: LucideIcon
}

const ROW_HEIGHT = 38
const ROW_GAP = 6
const ROW_PITCH = ROW_HEIGHT + ROW_GAP

/** Stops a row oscillating between two slots while the pointer sits on a boundary. */
const SLOT_HYSTERESIS = 0.16
const EDGE_RESISTANCE = 15
const MAX_TILT_VELOCITY = 3000

/** Fast attack on pick-up, slower release on drop. The asymmetry is what makes the lift read as weight. */
const liftSpring = { type: "spring" as const, stiffness: 760, damping: 26, mass: 0.5 }
const releaseSpring = { type: "spring" as const, stiffness: 300, damping: 32, mass: 0.8 }
const shiftSpring = { type: "spring" as const, stiffness: 520, damping: 44, mass: 0.85 }
const dropSpring = { type: "spring" as const, stiffness: 360, damping: 36, mass: 0.9 }
const instant = { duration: 0 }

type DragPhase = "idle" | "dragging" | "releasing"

function moveItem(items: string[], from: number, to: number) {
  if (from === to) return items

  const next = [...items]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

/** Logarithmic falloff so dragging past either end resists instead of stopping dead. */
function withEdgeResistance(value: number, min: number, max: number) {
  if (value < min) return min - EDGE_RESISTANCE * Math.log1p((min - value) / EDGE_RESISTANCE)
  if (value > max) return max + EDGE_RESISTANCE * Math.log1p((value - max) / EDGE_RESISTANCE)
  return value
}

function sameOrder(a: string[], b: string[]) {
  return a.length === b.length && a.every((id, index) => id === b[index])
}

function ArrangeRow({
  item,
  position,
  total,
  y,
  rotate,
  held,
  lifted,
  pinned,
  registerNode,
  onTogglePin,
  onKeyboardMove,
}: {
  item: SidebarArrangeItem
  position: number
  total: number
  y: MotionValue<number>
  rotate: MotionValue<number>
  held: boolean
  lifted: boolean
  pinned: boolean
  registerNode: (id: string, node: HTMLLIElement | null) => void
  onTogglePin: () => void
  onKeyboardMove: (direction: -1 | 1) => void
}) {
  const { t } = useLanguage()
  const Icon = item.icon

  return (
    <motion.li
      ref={(node: HTMLLIElement | null) => registerNode(item.id, node)}
      data-arrange-row={item.id}
      className={cn(
        "group/row relative isolate flex touch-none select-none items-center gap-1 rounded-[var(--md-radius-lg)] bg-[var(--md-glass)] ps-1 pe-1.5 shadow-[var(--md-shadow-line)]",
        held ? "z-30 cursor-grabbing" : "cursor-grab",
      )}
      style={{
        height: ROW_HEIGHT,
        y,
        rotate: held ? rotate : 0,
        willChange: held ? "transform" : undefined,
      }}
      animate={{ scale: lifted ? 1.024 : 1 }}
      transition={lifted ? liftSpring : releaseSpring}
    >
      <motion.span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] shadow-[0_14px_30px_rgba(11,20,19,0.16),inset_0_0_0_1px_rgba(255,255,255,0.6)]"
        initial={false}
        animate={{ opacity: lifted ? 1 : 0 }}
        transition={lifted ? liftSpring : releaseSpring}
      />
      <button
        type="button"
        aria-label={`${t("Reorder")}: ${t(item.label)}`}
        title={t("Drag, or use the arrow keys")}
        className="relative z-10 grid size-7 shrink-0 place-items-center rounded-[var(--md-radius-md)] text-[var(--md-subtle)] transition-colors duration-150 hover:text-[var(--md-ink)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]"
        onKeyDown={(event) => {
          if (event.key === "ArrowUp" && position > 0) {
            event.preventDefault()
            onKeyboardMove(-1)
          }
          if (event.key === "ArrowDown" && position < total - 1) {
            event.preventDefault()
            onKeyboardMove(1)
          }
        }}
      >
        <GripVertical className="size-3.5" strokeWidth={1.4} />
      </button>
      <span className="relative z-10 grid size-5 shrink-0 place-items-center text-[var(--md-subtle)]">
        <Icon className="size-4" strokeWidth={1.2} />
      </span>
      <span className="relative z-10 min-w-0 flex-1 truncate text-start text-[13px] font-medium text-[var(--md-ink)]">
        {t(item.label)}
      </span>
      <button
        type="button"
        data-arrange-pin=""
        aria-pressed={pinned}
        aria-label={`${t(pinned ? "Unpin" : "Pin to top")}: ${t(item.label)}`}
        title={t(pinned ? "Unpin" : "Pin to top")}
        className={cn(
          "relative z-10 grid size-7 shrink-0 place-items-center rounded-[var(--md-radius-md)] transition-[color,background,opacity,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[var(--md-hover)] active:scale-90 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]",
          pinned ? "text-[var(--md-accent)]" : "text-[var(--md-subtle)] opacity-0 group-hover/row:opacity-100",
        )}
        onClick={onTogglePin}
      >
        <Pin
          className={cn("size-3.5 transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]", pinned && "-rotate-[32deg]")}
          strokeWidth={1.4}
        />
      </button>
    </motion.li>
  )
}

/**
 * Turns a sidebar list into a draggable canvas. Order and pins are edited as a draft and only
 * written on save, so an abandoned rearrangement never leaks into the persisted layout.
 */
export function SidebarArrangeCanvas({
  items,
  order,
  pinned,
  defaultOrder,
  onSave,
  onCancel,
}: {
  items: SidebarArrangeItem[]
  order: string[]
  pinned: string[]
  defaultOrder: string[]
  onSave: (next: { order: string[]; pinned: string[] }) => void
  onCancel: () => void
}) {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const reduce = Boolean(shouldReduceMotion)

  const [draftOrder, setDraftOrder] = useState(order)
  const [draftPinned, setDraftPinned] = useState(pinned)
  const [heldId, setHeldId] = useState<string | null>(null)
  const [phase, setPhase] = useState<DragPhase>("idle")
  const [announcement, setAnnouncement] = useState("")

  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])

  const dragOffset = useMotionValue(0)
  const dragVelocity = useVelocity(dragOffset)
  const smoothVelocity = useSpring(dragVelocity, { stiffness: 260, damping: 40, mass: 0.4 })
  const rotate = useTransform(smoothVelocity, [-MAX_TILT_VELOCITY, 0, MAX_TILT_VELOCITY], [-1.6, 0, 1.6], { clamp: true })

  const rowValues = useRef(new Map<string, MotionValue<number>>())
  const rowNodes = useRef(new Map<string, HTMLLIElement>())
  const rowAnimations = useRef(new Map<string, AnimationPlaybackControls>())
  const pointerState = useRef<{ id: string; from: number; to: number; startY: number; pointerId: number } | null>(null)
  const dropAnimation = useRef<AnimationPlaybackControls | null>(null)
  const pendingFlip = useRef<Map<string, number> | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      dropAnimation.current?.stop()
      rowAnimations.current.forEach((controls) => controls.stop())
    }
  }, [])

  const rowValue = useCallback((id: string) => {
    const existing = rowValues.current.get(id)
    if (existing) return existing

    const created = motionValue(0)
    rowValues.current.set(id, created)
    return created
  }, [])

  const registerNode = useCallback((id: string, node: HTMLLIElement | null) => {
    if (node) rowNodes.current.set(id, node)
    else rowNodes.current.delete(id)
  }, [])

  const animateRow = useCallback(
    (id: string, target: number, transition: ValueAnimationTransition<number>) => {
      rowAnimations.current.get(id)?.stop()
      rowAnimations.current.set(id, animate(rowValue(id), target, transition))
    },
    [rowValue],
  )

  // React has already moved the rows into their final DOM slots by this point. Motion only flushes
  // transforms on its next frame, so the reset is also written straight to the node to keep the
  // commit invisible, then any pending keyboard move springs from its old slot.
  useLayoutEffect(() => {
    const flip = pendingFlip.current
    pendingFlip.current = null

    rowAnimations.current.forEach((controls) => controls.stop())
    rowAnimations.current.clear()
    dragOffset.jump(0)

    rowValues.current.forEach((value, id) => {
      if (!draftOrder.includes(id)) {
        rowValues.current.delete(id)
        return
      }

      const offset = flip?.get(id) ?? 0
      value.jump(offset)

      const node = rowNodes.current.get(id)
      if (node) node.style.transform = `translateY(${offset}px)`
    })

    flip?.forEach((_, id) => animateRow(id, 0, shiftSpring))
  }, [draftOrder, dragOffset, animateRow])

  const applySlotShift = useCallback(
    (from: number, to: number, ids: string[]) => {
      ids.forEach((id, index) => {
        if (index === from) return

        let target = 0
        if (from < to && index > from && index <= to) target = -ROW_PITCH
        else if (from > to && index >= to && index < from) target = ROW_PITCH

        // Nearer rows lead and further rows trail, so the list parts like a wave.
        const lead = Math.min(Math.abs(index - from) - 1, 4) * 0.012
        animateRow(id, target, reduce ? instant : { ...shiftSpring, delay: lead })
      })
    },
    [animateRow, reduce],
  )

  function announceMove(id: string, position: number) {
    setAnnouncement(`${t(itemsById.get(id)?.label ?? id)} — ${t("position")} ${position + 1}`)
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLUListElement>) {
    const target = event.target as HTMLElement
    if (target.closest("[data-arrange-pin]")) return
    if (event.pointerType === "mouse" && event.button !== 0) return

    const id = (target.closest("[data-arrange-row]") as HTMLElement | null)?.dataset.arrangeRow
    if (!id) return

    const from = draftOrder.indexOf(id)
    if (from === -1) return

    dropAnimation.current?.stop()
    dropAnimation.current = null
    event.currentTarget.setPointerCapture(event.pointerId)
    pointerState.current = { id, from, to: from, startY: event.clientY, pointerId: event.pointerId }
    dragOffset.jump(0)
    setHeldId(id)
    setPhase("dragging")
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLUListElement>) {
    const active = pointerState.current
    if (!active) return

    const travelled = event.clientY - active.startY
    const min = -active.from * ROW_PITCH
    const max = (draftOrder.length - 1 - active.from) * ROW_PITCH
    dragOffset.set(withEdgeResistance(travelled, min, max))

    const slots = clamp(travelled, min, max) / ROW_PITCH
    let slot = active.to - active.from
    while (slots > slot + 0.5 + SLOT_HYSTERESIS) slot += 1
    while (slots < slot - 0.5 - SLOT_HYSTERESIS) slot -= 1

    const next = clamp(active.from + slot, 0, draftOrder.length - 1)
    if (next === active.to) return

    active.to = next
    applySlotShift(active.from, next, draftOrder)
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLUListElement>) {
    const active = pointerState.current
    if (!active) return

    pointerState.current = null
    if (event.currentTarget.hasPointerCapture(active.pointerId)) {
      event.currentTarget.releasePointerCapture(active.pointerId)
    }

    const { from, to, id } = active
    // The lift eases out while the row glides home, so scale is back to rest before the commit.
    setPhase("releasing")

    const settle = animate(dragOffset, (to - from) * ROW_PITCH, reduce ? instant : dropSpring)
    dropAnimation.current = settle

    void settle.then(() => {
      if (!mounted.current) return

      dropAnimation.current = null
      setDraftOrder((current) => moveItem(current, from, to))
      setHeldId(null)
      setPhase("idle")
      if (from !== to) announceMove(id, to)
    })
  }

  function moveByKeyboard(id: string, direction: -1 | 1) {
    const from = draftOrder.indexOf(id)
    const to = clamp(from + direction, 0, draftOrder.length - 1)
    if (from === -1 || from === to) return

    if (!reduce) {
      pendingFlip.current = new Map([
        [id, -direction * ROW_PITCH],
        [draftOrder[to], direction * ROW_PITCH],
      ])
    }

    setDraftOrder(moveItem(draftOrder, from, to))
    announceMove(id, to)
  }

  function togglePin(id: string) {
    setDraftPinned((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]))
  }

  function resetToDefault() {
    setDraftOrder(defaultOrder)
    setDraftPinned([])
    setAnnouncement(t("Sidebar order reset to default"))
  }

  const isDefault = sameOrder(draftOrder, defaultOrder) && draftPinned.length === 0

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel()
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onCancel])

  return (
    <div className="mt-3">
      <ul
        role="list"
        className="flex flex-col"
        style={{ gap: ROW_GAP }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {draftOrder.map((id, index) => {
          const item = itemsById.get(id)
          if (!item) return null

          return (
            <ArrangeRow
              key={id}
              item={item}
              position={index}
              total={draftOrder.length}
              y={heldId === id ? dragOffset : rowValue(id)}
              rotate={rotate}
              held={heldId === id}
              lifted={heldId === id && phase === "dragging"}
              pinned={draftPinned.includes(id)}
              registerNode={registerNode}
              onTogglePin={() => togglePin(id)}
              onKeyboardMove={(direction) => moveByKeyboard(id, direction)}
            />
          )
        })}
      </ul>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          disabled={isDefault}
          className="flex h-8 items-center gap-1.5 rounded-[var(--md-radius-md)] px-2 text-[12px] font-medium text-[var(--md-text)] transition-[background,color,opacity,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]"
          onClick={resetToDefault}
        >
          <RotateCcw data-icon="inline-start" className="size-3.5" strokeWidth={1.4} />
          {t("Reset")}
        </button>
        <span className="flex-1" />
        <button
          type="button"
          className="h-8 rounded-[var(--md-radius-md)] bg-[var(--md-accent)] px-3 text-[12px] font-medium text-[var(--md-accent-ink)] shadow-[var(--md-shadow-line)] transition-[opacity,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:opacity-90 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a28)]"
          onClick={() => onSave({ order: draftOrder, pinned: draftPinned })}
        >
          {t("Save")}
        </button>
      </div>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  )
}
