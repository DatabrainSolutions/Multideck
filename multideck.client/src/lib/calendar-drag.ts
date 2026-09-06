import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react"

/** Bookings land on the quarter hour, the same grain a dock slot is booked in. */
export const CALENDAR_SNAP_MINUTES = 15
/** A slot cannot be dragged shorter than this. */
export const CALENDAR_MIN_DURATION_MINUTES = 15
/** Pointer travel before a press becomes a drag, so a click still opens the event. */
const DRAG_THRESHOLD_PX = 4

export type CalendarDragMode = "move" | "resize-start" | "resize-end"

export type CalendarDragPreview = {
  eventId: string
  mode: CalendarDragMode
  /** Day column the block is currently over. Unchanged by a resize. */
  dateKey: string
  startMinutes: number
  endMinutes: number
}

type ActiveDrag = {
  eventId: string
  mode: CalendarDragMode
  pointerId: number
  originX: number
  originY: number
  originDateKey: string
  originStart: number
  originEnd: number
  started: boolean
}

function snap(minutes: number) {
  return Math.round(minutes / CALENDAR_SNAP_MINUTES) * CALENDAR_SNAP_MINUTES
}

/**
 * Direct manipulation for a week grid: pick a booking up and drop it on another
 * time or day, or drag either edge to change how long it runs.
 *
 * The preview is held here and applied by the caller to the one event being
 * dragged, so the grid re-renders a single block per frame rather than the whole
 * week. Nothing is written until the pointer is released, and Escape puts the
 * block back where it started.
 *
 * Pointer events rather than HTML drag-and-drop: the same choice the Kanban board
 * made, and for the same reasons — it works under touch, it gives exact
 * coordinates, and it cannot start a ghost-image drag of the page.
 */
export function useCalendarEventDrag({
  gridRef,
  dayKeys,
  hourHeight,
  gridStartMinutes,
  gridEndMinutes,
  direction,
  columnsInset = 0,
  onCommit,
}: {
  /** The element whose width covers every day column, used to measure one column. */
  gridRef: RefObject<HTMLElement | null>
  /** Day keys in visual order, so a horizontal drag can name the day it lands on. */
  dayKeys: string[]
  hourHeight: number
  gridStartMinutes: number
  gridEndMinutes: number
  direction: "ltr" | "rtl"
  /** Width of anything before the first day column, such as the hour gutter. */
  columnsInset?: number
  onCommit: (change: { eventId: string; dateKey: string; startMinutes: number; endMinutes: number }) => void
}) {
  const [preview, setPreview] = useState<CalendarDragPreview | null>(null)
  // React Strict Mode may invoke state updater callbacks twice in development.
  // Keep the live preview in a ref so pointer-up can commit outside an updater;
  // one release must always produce exactly one persisted reschedule.
  const previewRef = useRef<CalendarDragPreview | null>(null)
  const active = useRef<ActiveDrag | null>(null)
  // Read in the pointermove handler, which is bound once. A ref keeps the handler
  // stable while still seeing the current values.
  const latest = useRef({ dayKeys, hourHeight, gridStartMinutes, gridEndMinutes, direction, columnsInset, onCommit })
  latest.current = { dayKeys, hourHeight, gridStartMinutes, gridEndMinutes, direction, columnsInset, onCommit }

  const begin = useCallback((
    event: ReactPointerEvent,
    seed: { eventId: string; mode: CalendarDragMode; dateKey: string; startMinutes: number; endMinutes: number },
  ) => {
    if (event.button !== 0 && event.pointerType === "mouse") return
    active.current = {
      eventId: seed.eventId,
      mode: seed.mode,
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      originDateKey: seed.dateKey,
      originStart: seed.startMinutes,
      originEnd: seed.endMinutes,
      started: false,
    }
  }, [])

  useEffect(() => {
    function move(nativeEvent: PointerEvent) {
      const drag = active.current
      if (!drag || nativeEvent.pointerId !== drag.pointerId) return

      const deltaX = nativeEvent.clientX - drag.originX
      const deltaY = nativeEvent.clientY - drag.originY
      if (!drag.started) {
        if (Math.abs(deltaX) < DRAG_THRESHOLD_PX && Math.abs(deltaY) < DRAG_THRESHOLD_PX) return
        drag.started = true
      }
      // Once it is a drag, the browser must stop trying to select text or scroll.
      nativeEvent.preventDefault()

      const { dayKeys: keys, hourHeight: rowHeight, gridStartMinutes: dayStart, gridEndMinutes: dayEnd, direction: dir, columnsInset: inset } = latest.current
      const minutesMoved = snap((deltaY / rowHeight) * 60)
      const duration = drag.originEnd - drag.originStart

      let startMinutes = drag.originStart
      let endMinutes = drag.originEnd
      let dateKey = drag.originDateKey

      if (drag.mode === "move") {
        startMinutes = drag.originStart + minutesMoved
        endMinutes = startMinutes + duration
        // Clamp as a pair so a booking pushed past either edge keeps its length
        // instead of being silently squashed against the boundary.
        if (startMinutes < dayStart) { startMinutes = dayStart; endMinutes = dayStart + duration }
        if (endMinutes > dayEnd) { endMinutes = dayEnd; startMinutes = dayEnd - duration }

        const columnsWidth = Math.max(0, (gridRef.current?.getBoundingClientRect().width ?? 0) - inset)
        const columnWidth = columnsWidth / Math.max(1, keys.length)
        if (columnWidth > 0) {
          const columnsMoved = Math.round((deltaX * (dir === "rtl" ? -1 : 1)) / columnWidth)
          const originIndex = keys.indexOf(drag.originDateKey)
          if (originIndex >= 0) {
            const nextIndex = Math.max(0, Math.min(keys.length - 1, originIndex + columnsMoved))
            dateKey = keys[nextIndex]
          }
        }
      } else if (drag.mode === "resize-start") {
        startMinutes = Math.min(drag.originEnd - CALENDAR_MIN_DURATION_MINUTES, Math.max(dayStart, drag.originStart + minutesMoved))
      } else {
        endMinutes = Math.max(drag.originStart + CALENDAR_MIN_DURATION_MINUTES, Math.min(dayEnd, drag.originEnd + minutesMoved))
      }

      const current = previewRef.current
      if (
        current
        && current.dateKey === dateKey
        && current.startMinutes === startMinutes
        && current.endMinutes === endMinutes
      ) return

      const next = { eventId: drag.eventId, mode: drag.mode, dateKey, startMinutes, endMinutes }
      previewRef.current = next
      setPreview(next)
    }

    function finish(nativeEvent: PointerEvent) {
      const drag = active.current
      if (!drag || nativeEvent.pointerId !== drag.pointerId) return
      active.current = null
      const current = previewRef.current
      previewRef.current = null
      setPreview(null)

      // A press that never crossed the threshold is a click, not a drag: leave it
      // to the event's own button so the details popover still opens.
      if (!current || !drag.started) return
      const moved = current.dateKey !== drag.originDateKey
        || current.startMinutes !== drag.originStart
        || current.endMinutes !== drag.originEnd
      if (moved) {
        latest.current.onCommit({
          eventId: current.eventId,
          dateKey: current.dateKey,
          startMinutes: current.startMinutes,
          endMinutes: current.endMinutes,
        })
      }
    }

    function cancel(nativeEvent: KeyboardEvent) {
      if (nativeEvent.key !== "Escape" || !active.current) return
      active.current = null
      previewRef.current = null
      setPreview(null)
    }

    window.addEventListener("pointermove", move, { passive: false })
    window.addEventListener("pointerup", finish)
    window.addEventListener("pointercancel", finish)
    window.addEventListener("keydown", cancel)
    return () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", finish)
      window.removeEventListener("pointercancel", finish)
      window.removeEventListener("keydown", cancel)
    }
  }, [gridRef])

  // While a block is being dragged the whole grid takes a grab cursor and stops
  // selecting text, so the pointer never picks up a paragraph on the way past.
  useEffect(() => {
    if (!preview) return
    const previousCursor = document.body.style.cursor
    const previousSelect = document.body.style.userSelect
    document.body.style.cursor = preview.mode === "move" ? "grabbing" : "ns-resize"
    document.body.style.userSelect = "none"
    return () => {
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousSelect
    }
  }, [preview])

  return { preview, begin, dragging: preview !== null }
}

export type CalendarDayDragPreview = {
  eventId: string
  /** Day cell currently under the pointer, or null while over nothing droppable. */
  dateKey: string | null
  originDateKey: string
  x: number
  y: number
  width: number
}

type ActiveDayDrag = {
  eventId: string
  pointerId: number
  originX: number
  originY: number
  originDateKey: string
  width: number
  started: boolean
}

/**
 * Pick an event up from one day cell and drop it on another, for month grids
 * where blocks are not positioned by time. Day cells announce themselves with a
 * `data-calendar-day="YYYY-MM-DD"` attribute; the pointer decides the target so
 * the caller can lift a ghost of the card and tint the cell it will land on,
 * the same feel as the Kanban board. Time of day is preserved on commit.
 */
export function useCalendarDayDrag({ onCommit }: { onCommit: (change: { eventId: string; dateKey: string }) => void }) {
  const [preview, setPreview] = useState<CalendarDayDragPreview | null>(null)
  const previewRef = useRef<CalendarDayDragPreview | null>(null)
  const active = useRef<ActiveDayDrag | null>(null)
  const latest = useRef(onCommit)
  latest.current = onCommit

  const begin = useCallback((event: ReactPointerEvent, seed: { eventId: string; dateKey: string }) => {
    if (event.button !== 0 && event.pointerType === "mouse") return
    const width = event.currentTarget instanceof HTMLElement ? event.currentTarget.getBoundingClientRect().width : 160
    active.current = { eventId: seed.eventId, pointerId: event.pointerId, originX: event.clientX, originY: event.clientY, originDateKey: seed.dateKey, width, started: false }
  }, [])

  useEffect(() => {
    function dayUnderPointer(x: number, y: number) {
      const element = document.elementFromPoint(x, y)
      const cell = element instanceof Element ? element.closest<HTMLElement>("[data-calendar-day]") : null
      return cell?.dataset.calendarDay ?? null
    }
    function move(nativeEvent: PointerEvent) {
      const drag = active.current
      if (!drag || nativeEvent.pointerId !== drag.pointerId) return
      if (!drag.started) {
        if (Math.abs(nativeEvent.clientX - drag.originX) < DRAG_THRESHOLD_PX && Math.abs(nativeEvent.clientY - drag.originY) < DRAG_THRESHOLD_PX) return
        drag.started = true
      }
      nativeEvent.preventDefault()
      const next = { eventId: drag.eventId, dateKey: dayUnderPointer(nativeEvent.clientX, nativeEvent.clientY), originDateKey: drag.originDateKey, x: nativeEvent.clientX, y: nativeEvent.clientY, width: drag.width }
      previewRef.current = next
      setPreview(next)
    }
    function finish(nativeEvent: PointerEvent) {
      const drag = active.current
      if (!drag || nativeEvent.pointerId !== drag.pointerId) return
      active.current = null
      const current = previewRef.current
      previewRef.current = null
      setPreview(null)
      if (!current || !drag.started || !current.dateKey || current.dateKey === drag.originDateKey) return
      latest.current({ eventId: current.eventId, dateKey: current.dateKey })
    }
    function cancel(nativeEvent: KeyboardEvent) {
      if (nativeEvent.key !== "Escape" || !active.current) return
      active.current = null
      previewRef.current = null
      setPreview(null)
    }
    window.addEventListener("pointermove", move, { passive: false })
    window.addEventListener("pointerup", finish)
    window.addEventListener("pointercancel", finish)
    window.addEventListener("keydown", cancel)
    return () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", finish)
      window.removeEventListener("pointercancel", finish)
      window.removeEventListener("keydown", cancel)
    }
  }, [])

  useEffect(() => {
    if (!preview) return
    const previousCursor = document.body.style.cursor
    const previousSelect = document.body.style.userSelect
    document.body.style.cursor = "grabbing"
    document.body.style.userSelect = "none"
    return () => {
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousSelect
    }
  }, [preview])

  return { preview, begin, dragging: preview !== null }
}

/** `07:30` from minutes past midnight. */
export function minutesToTimeKey(minutes: number) {
  const whole = Math.max(0, Math.round(minutes))
  return `${String(Math.floor(whole / 60) % 24).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`
}
