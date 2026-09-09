import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react"

export const KANBAN_REFLOW_DURATION = 260
export const KANBAN_REFLOW_EASING = "cubic-bezier(0.16, 1, 0.3, 1)"
const KANBAN_REFLOW_ID = "kanban-reflow"

export type KanbanColumn<T> = {
  id: string
  tasks: T[]
}

export type KanbanDropTarget = {
  columnId: string | null
  targetId: string | null
  placement: "before" | "after"
}

export type KanbanDragFrame = {
  startX: number
  startY: number
  x: number
  y: number
  width: number
  pickupOffsetX: number
  pickupOffsetY: number
  pickupBias: number
  angle: number
}

type ActiveKanbanDrag = KanbanDragFrame & {
  cardId: string
  pointerId: number
  started: boolean
  columnId: string | null
  targetId: string | null
  placement: "before" | "after"
}

export type KanbanCommit<T> = {
  cardId: string
  columnId: string
  targetId: string | null
  placement: "before" | "after"
  columns: KanbanColumn<T>[]
}

export function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function prefersReducedMotion() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

export function createKanbanDragFrame(event: Pick<PointerEvent, "clientX" | "clientY">, element: HTMLElement): KanbanDragFrame {
  const rect = element.getBoundingClientRect()
  const pickupOffsetX = clampNumber(event.clientX - rect.left, 12, Math.max(12, rect.width - 12))
  const pickupOffsetY = clampNumber(event.clientY - rect.top, 10, Math.max(10, rect.height - 10))
  const pickupBias = rect.width ? ((pickupOffsetX / rect.width) - 0.5) * 5 : 0

  return {
    startX: event.clientX,
    startY: event.clientY,
    x: event.clientX,
    y: event.clientY,
    width: rect.width,
    pickupOffsetX,
    pickupOffsetY,
    pickupBias,
    angle: clampNumber(pickupBias, -4.5, 4.5),
  }
}

// The lifted card leans into the direction of travel and eases back upright when
// the pointer settles, so the tilt reads as momentum rather than a fixed skew.
export function getKanbanDragAngle(dragFrame: KanbanDragFrame | null | undefined, clientX: number) {
  const rest = dragFrame?.pickupBias ?? 0
  const current = dragFrame?.angle ?? rest
  const swing = (clientX - (dragFrame?.x ?? clientX)) * 0.42
  return clampNumber(current + ((rest + swing) - current) * 0.35, -6.5, 6.5)
}

// The board re-renders with the dragged card already sitting in its next slot.
// Replaying every other card from where it just was turns that hard re-layout
// into columns visibly opening up to make room.
export function useKanbanReflow(rootRef: RefObject<HTMLElement | null>, signature: string) {
  const framesRef = useRef(new Map<string, { x: number; y: number }>())

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return

    const previous = framesRef.current
    const next = new Map<string, { x: number; y: number }>()
    const animate = !prefersReducedMotion()

    root.querySelectorAll<HTMLElement>("[data-kanban-card]").forEach((node) => {
      const cardId = node.getAttribute("data-kanban-card")
      if (!cardId) return

      // Layout offsets rather than client rects: a card part-way through its own
      // reflow is visually translated, and measuring that would feed the next
      // frame a position the card is not actually settling into.
      const frame = { x: node.offsetLeft, y: node.offsetTop }
      next.set(cardId, frame)

      if (!animate || typeof node.animate !== "function") return
      if (node.hasAttribute("data-kanban-dragging")) return

      const prior = previous.get(cardId)
      if (!prior) return

      const deltaX = prior.x - frame.x
      const deltaY = prior.y - frame.y
      if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) return
      if (Math.abs(deltaX) > 2400 || Math.abs(deltaY) > 2400) return

      node.getAnimations().forEach((animation) => {
        if (animation.id === KANBAN_REFLOW_ID) animation.cancel()
      })

      const reflow = node.animate(
        [
          { transform: `translate3d(${deltaX}px, ${deltaY}px, 0)` },
          { transform: "translate3d(0, 0, 0)" },
        ],
        { duration: KANBAN_REFLOW_DURATION, easing: KANBAN_REFLOW_EASING },
      )
      reflow.id = KANBAN_REFLOW_ID
    })

    framesRef.current = next
  }, [rootRef, signature])
}

// Resolving the slot from stacked layout heights rather than from whatever
// element sits under the pointer keeps the answer stable: moving the gap past a
// card also moves that card past the pointer, so the two never fight, and a card
// still sliding into place cannot report the position it is animating away from.
export function resolveKanbanDropTarget(clientX: number, clientY: number, draggedId: string): KanbanDropTarget {
  if (typeof document === "undefined") return { columnId: null, targetId: null, placement: "before" }

  const columnNode = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>("[data-column-id]")
  if (!columnNode) return { columnId: null, targetId: null, placement: "before" }

  const columnId = columnNode.getAttribute("data-column-id")
  const body = columnNode.querySelector<HTMLElement>(":scope > [data-kanban-list]") ?? columnNode.querySelector<HTMLElement>(":scope > div")
  if (!body) return { columnId, targetId: null, placement: "before" }

  let slotTop = body.getBoundingClientRect().top

  for (const card of body.querySelectorAll<HTMLElement>(":scope > [data-task-id]")) {
    const targetId = card.getAttribute("data-task-id")
    const height = card.offsetHeight
    if (targetId !== draggedId && clientY < slotTop + height / 2) {
      return { columnId, targetId, placement: "before" }
    }
    slotTop += height
  }

  return { columnId, targetId: null, placement: "before" }
}

// Drops the dragged card into the slot it would land in right now, so the rest
// of the board reflows while the pointer moves instead of only on release.
export function applyKanbanDragPreview<T>(
  columns: KanbanColumn<T>[],
  {
    cardId,
    columnId,
    targetId,
    placement = "before",
    getId,
  }: {
    cardId: string | null
    columnId: string | null
    targetId: string | null
    placement?: "before" | "after"
    getId: (task: T) => string
  },
) {
  if (!cardId || !columnId) return columns

  const movingCard = columns.flatMap((column) => column.tasks).find((task) => getId(task) === cardId)
  const targetColumn = columns.find((column) => column.id === columnId)
  if (!movingCard || !targetColumn) return columns

  const withoutMoving = targetColumn.tasks.filter((task) => getId(task) !== cardId)
  let insertIndex = withoutMoving.length

  if (targetId === cardId) {
    // Hovering the card being dragged: hold the slot it already occupies.
    const heldIndex = targetColumn.tasks.findIndex((task) => getId(task) === cardId)
    if (heldIndex >= 0) insertIndex = heldIndex
  } else if (targetId) {
    const targetIndex = withoutMoving.findIndex((task) => getId(task) === targetId)
    if (targetIndex >= 0) insertIndex = placement === "after" ? targetIndex + 1 : targetIndex
  }

  const previewTasks = [...withoutMoving]
  previewTasks.splice(insertIndex, 0, movingCard)

  return columns.map((column) => {
    if (column.id === columnId) return { ...column, tasks: previewTasks }
    if (column.tasks.some((task) => getId(task) === cardId)) {
      return { ...column, tasks: column.tasks.filter((task) => getId(task) !== cardId) }
    }
    return column
  })
}

export function getKanbanLayoutSignature<T>(columns: KanbanColumn<T>[], getId: (task: T) => string) {
  return columns.map((column) => `${column.id}:${column.tasks.map(getId).join(",")}`).join("|")
}

function moveKanbanCardByKeyboard<T>(
  columns: KanbanColumn<T>[],
  cardId: string,
  key: string,
  getId: (task: T) => string,
  rtl: boolean,
) {
  const columnIndex = columns.findIndex((column) => column.tasks.some((task) => getId(task) === cardId))
  if (columnIndex < 0) return null

  const sourceColumn = columns[columnIndex]
  const cardIndex = sourceColumn.tasks.findIndex((task) => getId(task) === cardId)
  const movingCard = sourceColumn.tasks[cardIndex]
  if (!movingCard) return null

  let destinationColumnIndex = columnIndex
  let destinationIndex = cardIndex

  if (key === "ArrowUp") destinationIndex = Math.max(0, cardIndex - 1)
  else if (key === "ArrowDown") destinationIndex = Math.min(sourceColumn.tasks.length - 1, cardIndex + 1)
  else if (key === "ArrowLeft") destinationColumnIndex = columnIndex + (rtl ? 1 : -1)
  else if (key === "ArrowRight") destinationColumnIndex = columnIndex + (rtl ? -1 : 1)
  else return null

  if (destinationColumnIndex < 0 || destinationColumnIndex >= columns.length) return null
  if (destinationColumnIndex === columnIndex && destinationIndex === cardIndex) return null

  const nextColumns = columns.map((column) => ({ ...column, tasks: [...column.tasks] }))
  nextColumns[columnIndex].tasks.splice(cardIndex, 1)
  if (destinationColumnIndex !== columnIndex) {
    destinationIndex = Math.min(cardIndex, nextColumns[destinationColumnIndex].tasks.length)
  }
  nextColumns[destinationColumnIndex].tasks.splice(destinationIndex, 0, movingCard)

  return {
    columns: nextColumns,
    columnId: nextColumns[destinationColumnIndex].id,
    targetId: nextColumns[destinationColumnIndex].tasks[destinationIndex + 1]
      ? getId(nextColumns[destinationColumnIndex].tasks[destinationIndex + 1])
      : null,
  }
}

export function useKanbanPointerDrag<T>({
  columns,
  getId,
  onCommit,
  activationDistance = 8,
  formatKeyboardAnnouncement,
}: {
  columns: KanbanColumn<T>[]
  getId: (task: T) => string
  onCommit: (commit: KanbanCommit<T>) => void
  activationDistance?: number
  formatKeyboardAnnouncement?: (task: T, columnId: string) => string
}) {
  const boardRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<ActiveKanbanDrag | null>(null)
  const [keyboardAnnouncement, setKeyboardAnnouncement] = useState("")
  const dragRef = useRef<ActiveKanbanDrag | null>(null)
  const columnsRef = useRef(columns)
  const getIdRef = useRef(getId)
  const onCommitRef = useRef(onCommit)
  const formatKeyboardAnnouncementRef = useRef(formatKeyboardAnnouncement)
  const suppressClickRef = useRef(false)

  columnsRef.current = columns
  getIdRef.current = getId
  onCommitRef.current = onCommit
  formatKeyboardAnnouncementRef.current = formatKeyboardAnnouncement

  const previewColumns = useMemo(
    () => applyKanbanDragPreview(columns, {
      cardId: drag?.started ? drag.cardId : null,
      columnId: drag?.started ? drag.columnId : null,
      targetId: drag?.started ? drag.targetId : null,
      placement: drag?.placement,
      getId,
    }),
    [columns, drag?.cardId, drag?.columnId, drag?.placement, drag?.started, drag?.targetId, getId],
  )

  useKanbanReflow(boardRef, getKanbanLayoutSignature(previewColumns, getId))

  function clearDrag() {
    dragRef.current = null
    setDrag(null)
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLElement>, cardId: string) {
    if (event.button !== 0) return

    const dragFrame = createKanbanDragFrame(event.nativeEvent, event.currentTarget)
    event.currentTarget.setPointerCapture?.(event.pointerId)
    const nextDrag: ActiveKanbanDrag = {
      cardId,
      pointerId: event.pointerId,
      ...dragFrame,
      started: false,
      columnId: null,
      targetId: null,
      placement: "before",
    }
    dragRef.current = nextDrag
    setDrag(nextDrag)
  }

  useEffect(() => {
    if (!drag) return

    function handlePointerMove(event: PointerEvent) {
      const current = dragRef.current
      if (!current || event.pointerId !== current.pointerId) return

      const distance = Math.hypot(event.clientX - current.startX, event.clientY - current.startY)
      const started = current.started || distance > activationDistance
      const target = resolveKanbanDropTarget(event.clientX, event.clientY, current.cardId)
      const nextDrag: ActiveKanbanDrag = {
        ...current,
        x: event.clientX,
        y: event.clientY,
        angle: getKanbanDragAngle(current, event.clientX),
        started,
        columnId: started ? target.columnId : current.columnId,
        targetId: started ? target.targetId : current.targetId,
        placement: started ? target.placement : current.placement,
      }
      dragRef.current = nextDrag
      setDrag(nextDrag)
    }

    function handlePointerUp(event: PointerEvent) {
      const current = dragRef.current
      if (!current || event.pointerId !== current.pointerId) return

      const distance = Math.hypot(event.clientX - current.startX, event.clientY - current.startY)
      const started = current.started || distance > activationDistance
      const target = resolveKanbanDropTarget(event.clientX, event.clientY, current.cardId)

      if (started && target.columnId) {
        const committedColumns = applyKanbanDragPreview(columnsRef.current, {
          cardId: current.cardId,
          columnId: target.columnId,
          targetId: target.targetId,
          placement: target.placement,
          getId: getIdRef.current,
        })
        onCommitRef.current({
          cardId: current.cardId,
          columnId: target.columnId,
          targetId: target.targetId,
          placement: target.placement,
          columns: committedColumns,
        })
      }

      if (started) {
        suppressClickRef.current = true
        window.setTimeout(() => {
          suppressClickRef.current = false
        }, 160)
      }
      clearDrag()
    }

    window.addEventListener("pointermove", handlePointerMove, { passive: true })
    window.addEventListener("pointerup", handlePointerUp)
    window.addEventListener("pointercancel", handlePointerUp)
    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
      window.removeEventListener("pointercancel", handlePointerUp)
    }
  }, [activationDistance, drag])

  function handleKeyDown(event: ReactKeyboardEvent<HTMLElement>, cardId: string) {
    if (!event.altKey) return false

    const result = moveKanbanCardByKeyboard(
      columnsRef.current,
      cardId,
      event.key,
      getIdRef.current,
      document.documentElement.dir === "rtl",
    )
    if (!result) return false

    event.preventDefault()
    const task = result.columns.flatMap((column) => column.tasks).find((item) => getIdRef.current(item) === cardId)
    onCommitRef.current({
      cardId,
      columnId: result.columnId,
      targetId: result.targetId,
      placement: "before",
      columns: result.columns,
    })
    if (task && formatKeyboardAnnouncementRef.current) {
      setKeyboardAnnouncement(formatKeyboardAnnouncementRef.current(task, result.columnId))
    }
    return true
  }

  const activeTask = drag
    ? columns.flatMap((column) => column.tasks).find((task) => getId(task) === drag.cardId) ?? null
    : null
  const overlayStyle: CSSProperties | undefined = drag?.started
    ? {
        left: drag.x,
        top: drag.y,
        width: drag.width,
        transform: `translate(${-drag.pickupOffsetX}px, ${-drag.pickupOffsetY}px) rotate(${drag.angle}deg)`,
      }
    : undefined

  return {
    boardRef,
    previewColumns,
    activeTask,
    activeCardId: drag?.started ? drag.cardId : null,
    activeColumnId: drag?.started ? drag.columnId : null,
    overlayStyle,
    keyboardAnnouncement,
    handlePointerDown,
    handleKeyDown,
    isClickSuppressed: () => suppressClickRef.current,
    cancelDrag: clearDrag,
  }
}
