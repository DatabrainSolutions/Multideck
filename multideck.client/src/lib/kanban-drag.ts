import { useLayoutEffect, useRef, type RefObject } from "react"

export const KANBAN_REFLOW_DURATION = 260
export const KANBAN_REFLOW_EASING = "cubic-bezier(0.16, 1, 0.3, 1)"

export function useKanbanReflow(rootRef: RefObject<HTMLElement | null>, signature: string) {
  const framesRef = useRef(new Map<string, { x: number; y: number }>())
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    const next = new Map<string, { x: number; y: number }>()
    root.querySelectorAll<HTMLElement>("[data-kanban-card]").forEach((node) => {
      const id = node.dataset.kanbanCard
      if (!id) return
      const frame = { x: node.offsetLeft, y: node.offsetTop }
      next.set(id, frame)
      if (node.hasAttribute("data-kanban-dragging")) return
      const previous = framesRef.current.get(id)
      if (!previous) return
      const x = previous.x - frame.x
      const y = previous.y - frame.y
      if (Math.abs(x) < .5 && Math.abs(y) < .5) return
      node.getAnimations().forEach((animation) => animation.cancel())
      node.animate([{ transform: `translate3d(${x}px, ${y}px, 0)` }, { transform: "translate3d(0,0,0)" }], { duration: KANBAN_REFLOW_DURATION, easing: KANBAN_REFLOW_EASING })
    })
    framesRef.current = next
  }, [rootRef, signature])
}
