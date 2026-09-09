import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from "react"

const STEP = 15
const DRAG_THRESHOLD = 4

/** Include the pressed quarter-hour, even when the user draws upwards. */
export function calendarSelectionRange(anchor: number, pointer: number, start: number, end: number) {
  const from = Math.max(start, Math.min(end - STEP, Math.floor(anchor / STEP) * STEP))
  const to = Math.max(start, Math.min(end, Math.round(pointer / STEP) * STEP))
  return { startMinutes: Math.min(from, to), endMinutes: Math.max(from + STEP, to) }
}

function timeLabel(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`
}

type Selection = {
  dateKey: string
  pointerId: number
  originY: number
  gridTop: number
  pixelsPerMinute: number
  anchor: number
  latestY: number
  moved: boolean
  target: HTMLElement
  previousUserSelect: string
}

/** One preview and one frame callback, with no per-pointer React rerenders. */
export function useCalendarCreateDrag({ gridRef, gridStartMinutes, gridEndMinutes, onCreate, contextKey }: {
  gridRef: RefObject<HTMLDivElement | null>
  gridStartMinutes: number
  gridEndMinutes: number
  onCreate: (dateKey: string, startMinutes: number, endMinutes: number) => void
  contextKey: string
}) {
  const previewRef = useRef<HTMLDivElement | null>(null)
  const labelRef = useRef<HTMLSpanElement | null>(null)
  const active = useRef<Selection | null>(null)
  const frame = useRef<number | null>(null)
  const suppressedUntil = useRef(0)
  const latest = useRef({ gridStartMinutes, gridEndMinutes, onCreate })
  latest.current = { gridStartMinutes, gridEndMinutes, onCreate }

  const rangeFor = useCallback((selection: Selection) => {
    const { gridStartMinutes: start, gridEndMinutes: end } = latest.current
    const pointer = start + (selection.latestY - selection.gridTop) / selection.pixelsPerMinute
    return calendarSelectionRange(selection.anchor, pointer, start, end)
  }, [])

  const paint = useCallback(() => {
    frame.current = null
    const selection = active.current
    const preview = previewRef.current
    if (!selection || !preview) return
    const range = rangeFor(selection)
    // Only this absolute overlay changes size; the calendar and its events stay still.
    preview.style.top = `${range.startMinutes - latest.current.gridStartMinutes}px`
    preview.style.height = `${range.endMinutes - range.startMinutes}px`
    preview.style.visibility = "visible"
    if (labelRef.current) labelRef.current.textContent = `${timeLabel(range.startMinutes)}–${timeLabel(range.endMinutes)}`
  }, [rangeFor])

  const clear = useCallback((suppressClick: boolean) => {
    const selection = active.current
    active.current = null
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = null
    if (previewRef.current) previewRef.current.style.visibility = "hidden"
    if (selection) {
      selection.target.style.userSelect = selection.previousUserSelect
      if (selection.target.hasPointerCapture(selection.pointerId)) selection.target.releasePointerCapture(selection.pointerId)
      if (suppressClick) suppressedUntil.current = Date.now() + 350
    }
  }, [])

  const begin = useCallback((event: ReactPointerEvent<HTMLButtonElement>, dateKey: string) => {
    // Touch keeps native scrolling and tap-to-create; mouse and pen can draw.
    if (event.button !== 0 || !event.isPrimary || event.pointerType === "touch" || active.current) return
    const grid = gridRef.current
    const column = event.currentTarget.parentElement
    const preview = previewRef.current
    if (!grid || !column || !preview) return
    // Read geometry once. Scrolling/resizing cancels instead of using stale coordinates.
    const gridRect = grid.getBoundingClientRect()
    const columnRect = column.getBoundingClientRect()
    const pixelsPerMinute = gridRect.height / (latest.current.gridEndMinutes - latest.current.gridStartMinutes)
    if (!pixelsPerMinute) return
    const target = event.currentTarget
    active.current = {
      dateKey, pointerId: event.pointerId, originY: event.clientY, gridTop: gridRect.top, pixelsPerMinute,
      anchor: latest.current.gridStartMinutes + (event.clientY - gridRect.top) / pixelsPerMinute,
      latestY: event.clientY, moved: false, target, previousUserSelect: target.style.userSelect,
    }
    target.setPointerCapture(event.pointerId)
    target.style.userSelect = "none"
    preview.style.left = `${(columnRect.left - gridRect.left) / pixelsPerMinute + 4}px`
    preview.style.width = `${columnRect.width / pixelsPerMinute - 8}px`
    paint()
  }, [gridRef, paint])

  useEffect(() => {
    function move(event: PointerEvent) {
      const selection = active.current
      if (!selection || event.pointerId !== selection.pointerId) return
      selection.latestY = event.clientY
      selection.moved ||= Math.abs(event.clientY - selection.originY) >= DRAG_THRESHOLD
      if (selection.moved) event.preventDefault()
      if (frame.current === null) frame.current = requestAnimationFrame(paint)
    }
    function finish(event: PointerEvent) {
      const selection = active.current
      if (!selection || event.pointerId !== selection.pointerId) return
      selection.latestY = event.clientY
      const range = rangeFor(selection)
      const moved = selection.moved
      clear(moved)
      // Clear first: a repeated pointer-up cannot open a second form.
      if (moved) latest.current.onCreate(selection.dateKey, range.startMinutes, range.endMinutes)
    }
    function cancel() { clear(true) }
    function cancelPointer(event: PointerEvent) {
      if (event.pointerId === active.current?.pointerId) cancel()
    }
    function key(event: KeyboardEvent) {
      if (event.key === "Escape" && active.current) { event.preventDefault(); cancel() }
    }
    window.addEventListener("pointermove", move, { passive: false })
    window.addEventListener("pointerup", finish)
    window.addEventListener("pointercancel", cancelPointer)
    window.addEventListener("keydown", key)
    window.addEventListener("blur", cancel)
    window.addEventListener("resize", cancel)
    window.addEventListener("scroll", cancel, true)
    return () => {
      cancel()
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", finish)
      window.removeEventListener("pointercancel", cancelPointer)
      window.removeEventListener("keydown", key)
      window.removeEventListener("blur", cancel)
      window.removeEventListener("resize", cancel)
      window.removeEventListener("scroll", cancel, true)
    }
  }, [clear, paint, rangeFor])

  useEffect(() => { clear(true) }, [clear, contextKey])
  return { begin, previewRef, labelRef, suppressClick: () => Date.now() < suppressedUntil.current }
}
