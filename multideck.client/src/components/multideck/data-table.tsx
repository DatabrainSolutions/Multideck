import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ArrowDown, ArrowUp, ArrowUpDown, Eye, EyeOff, GripVertical, Pin, PinOff, RotateCcw, SlidersHorizontal, type LucideIcon } from "lucide-react"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useLanguage } from "@/i18n/language-provider"
import { cn } from "@/lib/utils"

export type DataTableColumn<Row> = {
  id: string
  label: string
  cell: (row: Row) => ReactNode
  width?: number
  minWidth?: number
  maxWidth?: number
  headerClassName?: string
  cellClassName?: string
  canHide?: boolean
  canPin?: boolean
  defaultPinned?: boolean
  defaultHidden?: boolean
  resizable?: boolean
  sortValue?: (row: Row) => string | number | null | undefined
}

type SavedTableLayout = {
  order: string[]
  hidden: string[]
  pinned: string[]
  widths: Record<string, number>
}

type ColumnContextMenu = {
  columnId: string
  x: number
  y: number
}

type DataTableProps<Row> = {
  columns: DataTableColumn<Row>[]
  rows: Row[]
  getRowKey: (row: Row) => string
  storageKey?: string
  rowClassName?: string | ((row: Row) => string)
  onRowClick?: (row: Row) => void
  selectedRowKey?: string | null
  ariaLabel?: string
  columnsButtonLabel?: string
  toolbarLeading?: ReactNode
  toolbarActions?: ReactNode
  emptyState?: ReactNode
  className?: string
  tableClassName?: string
}

function readLayout(storageKey: string | undefined, columns: DataTableColumn<unknown>[]): SavedTableLayout {
  const fallback = {
    order: columns.map((column) => column.id),
    hidden: columns.filter((column) => column.defaultHidden).map((column) => column.id),
    pinned: columns.filter((column) => column.defaultPinned).map((column) => column.id),
    widths: {},
  }

  if (!storageKey || typeof window === "undefined") return fallback

  try {
    const stored = JSON.parse(window.localStorage.getItem(`multideck.table.${storageKey}`) ?? "null") as Partial<SavedTableLayout> | null
    if (!stored) return fallback
    const available = new Set(fallback.order)
    return {
      order: [...(stored.order ?? []).filter((id) => available.has(id)), ...fallback.order.filter((id) => !stored.order?.includes(id))],
      hidden: (stored.hidden ?? []).filter((id) => available.has(id)),
      pinned: (stored.pinned ?? fallback.pinned).filter((id) => available.has(id)),
      widths: Object.fromEntries(
        Object.entries(stored.widths ?? {}).filter(([id, width]) => available.has(id) && Number.isFinite(width)),
      ),
    }
  } catch {
    return fallback
  }
}

export function DataTable<Row>({
  columns,
  rows,
  getRowKey,
  storageKey,
  rowClassName,
  onRowClick,
  selectedRowKey,
  ariaLabel,
  columnsButtonLabel,
  toolbarLeading,
  toolbarActions,
  emptyState,
  className,
  tableClassName,
}: DataTableProps<Row>) {
  const { direction, t } = useLanguage()
  const reduceMotion = useReducedMotion()
  const columnIds = useMemo(() => columns.map((column) => column.id), [columns])
  const defaultPinned = useMemo(() => columns.filter((column) => column.defaultPinned).map((column) => column.id), [columns])
  const defaultHidden = useMemo(() => columns.filter((column) => column.defaultHidden).map((column) => column.id), [columns])
  const initialLayout = useMemo(() => readLayout(storageKey, columns as DataTableColumn<unknown>[]), [columns, storageKey])
  const [order, setOrder] = useState(initialLayout.order)
  const [hidden, setHidden] = useState(() => new Set(initialLayout.hidden))
  const [pinned, setPinned] = useState(() => new Set(initialLayout.pinned))
  const [widths, setWidths] = useState(initialLayout.widths)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [resizingId, setResizingId] = useState<string | null>(null)
  const [sort, setSort] = useState<{ id: string; direction: "asc" | "desc" } | null>(null)
  const [contextMenu, setContextMenu] = useState<ColumnContextMenu | null>(null)
  const resizeStart = useRef<{ columnId: string; x: number; width: number; min: number; max: number } | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setOrder((current) => [...current.filter((id) => columnIds.includes(id)), ...columnIds.filter((id) => !current.includes(id))])
    setHidden((current) => new Set([...current].filter((id) => columnIds.includes(id))))
    setPinned((current) => new Set([...current].filter((id) => columnIds.includes(id))))
    setWidths((current) => Object.fromEntries(Object.entries(current).filter(([id]) => columnIds.includes(id))))
    setSort((current) => current && columnIds.includes(current.id) ? current : null)
  }, [columnIds])

  useEffect(() => {
    if (!storageKey) return
    window.localStorage.setItem(
      `multideck.table.${storageKey}`,
      JSON.stringify({ order, hidden: [...hidden], pinned: [...pinned], widths } satisfies SavedTableLayout),
    )
  }, [hidden, order, pinned, storageKey, widths])

  useEffect(() => {
    if (!contextMenu) return

    const closeMenu = () => setContextMenu(null)
    const closeFromPointer = (event: globalThis.PointerEvent) => {
      if (contextMenuRef.current?.contains(event.target as Node)) return
      closeMenu()
    }
    const closeFromKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu()
    }

    window.addEventListener("pointerdown", closeFromPointer)
    window.addEventListener("scroll", closeMenu, true)
    window.addEventListener("resize", closeMenu)
    window.addEventListener("keydown", closeFromKeyboard)
    return () => {
      window.removeEventListener("pointerdown", closeFromPointer)
      window.removeEventListener("scroll", closeMenu, true)
      window.removeEventListener("resize", closeMenu)
      window.removeEventListener("keydown", closeFromKeyboard)
    }
  }, [contextMenu])

  useEffect(() => {
    if (!resizingId) return

    const resizeFromPointer = (event: globalThis.PointerEvent) => {
      const session = resizeStart.current
      if (!session || session.columnId !== resizingId) return
      const delta = (event.clientX - session.x) * (direction === "rtl" ? -1 : 1)
      const nextWidth = Math.round(Math.max(session.min, Math.min(session.max, session.width + delta)))
      setWidths((current) => ({ ...current, [session.columnId]: nextWidth }))
    }
    const finishPointerResize = () => {
      resizeStart.current = null
      setResizingId(null)
    }

    window.addEventListener("pointermove", resizeFromPointer)
    window.addEventListener("pointerup", finishPointerResize)
    window.addEventListener("pointercancel", finishPointerResize)
    return () => {
      window.removeEventListener("pointermove", resizeFromPointer)
      window.removeEventListener("pointerup", finishPointerResize)
      window.removeEventListener("pointercancel", finishPointerResize)
    }
  }, [direction, resizingId])

  const orderedColumns = useMemo(() => {
    const lookup = new Map(columns.map((column) => [column.id, column]))
    const resolved = order.map((id) => lookup.get(id)).filter((column): column is DataTableColumn<Row> => Boolean(column))
    return [...resolved.filter((column) => pinned.has(column.id)), ...resolved.filter((column) => !pinned.has(column.id))]
  }, [columns, order, pinned])

  const visibleColumns = orderedColumns.filter((column) => !hidden.has(column.id))
  const columnWidth = (column: DataTableColumn<Row>) => widths[column.id] ?? column.width ?? 160
  const pinnedOffsets = new Map<string, number>()
  let nextOffset = 0
  visibleColumns.forEach((column) => {
    if (!pinned.has(column.id)) return
    pinnedOffsets.set(column.id, nextOffset)
    nextOffset += columnWidth(column)
  })

  const minimumWidth = visibleColumns.reduce((width, column) => width + columnWidth(column), 0)
  const hasCustomLayout = hidden.size !== defaultHidden.length || [...hidden].some((id) => !defaultHidden.includes(id)) || Object.keys(widths).length > 0 || pinned.size !== defaultPinned.length || [...pinned].some((id) => !defaultPinned.includes(id)) || order.some((id, index) => id !== columnIds[index])
  const contextColumn = contextMenu ? columns.find((column) => column.id === contextMenu.columnId) : undefined
  const sortedRows = useMemo(() => {
    if (!sort) return rows
    const column = columns.find((candidate) => candidate.id === sort.id)
    if (!column?.sortValue) return rows
    return [...rows].sort((left, right) => {
      const leftValue = column.sortValue?.(left)
      const rightValue = column.sortValue?.(right)
      if (leftValue === rightValue) return 0
      if (leftValue === null || leftValue === undefined) return 1
      if (rightValue === null || rightValue === undefined) return -1
      const comparison = typeof leftValue === "number" && typeof rightValue === "number"
        ? leftValue - rightValue
        : String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true, sensitivity: "base" })
      return sort.direction === "asc" ? comparison : -comparison
    })
  }, [columns, rows, sort])

  function moveColumn(sourceId: string, targetId: string) {
    if (sourceId === targetId) return
    setOrder((current) => {
      const next = current.filter((id) => id !== sourceId)
      const targetIndex = next.indexOf(targetId)
      next.splice(targetIndex < 0 ? next.length : targetIndex, 0, sourceId)
      return next
    })
  }

  function toggleHidden(column: DataTableColumn<Row>) {
    if (column.canHide === false) return
    setHidden((current) => {
      const next = new Set(current)
      if (next.has(column.id)) next.delete(column.id)
      else next.add(column.id)
      return next
    })
  }

  function togglePinned(column: DataTableColumn<Row>) {
    if (column.canPin === false) return
    setPinned((current) => {
      const next = new Set(current)
      if (next.has(column.id)) next.delete(column.id)
      else {
        next.add(column.id)
        setHidden((hiddenColumns) => {
          const visible = new Set(hiddenColumns)
          visible.delete(column.id)
          return visible
        })
      }
      return next
    })
  }

  function resetLayout() {
    setOrder(columnIds)
    setHidden(new Set(defaultHidden))
    setPinned(new Set(defaultPinned))
    setWidths({})
    setSort(null)
  }

  function toggleSort(column: DataTableColumn<Row>) {
    if (!column.sortValue) return
    setSort((current) => {
      if (!current || current.id !== column.id) return { id: column.id, direction: "asc" }
      if (current.direction === "asc") return { id: column.id, direction: "desc" }
      return null
    })
  }

  function setColumnSort(column: DataTableColumn<Row>, direction: "asc" | "desc" | null) {
    if (!column.sortValue) return
    setSort(direction ? { id: column.id, direction } : null)
  }

  function openColumnContextMenu(column: DataTableColumn<Row>, event: ReactMouseEvent<HTMLTableCellElement>) {
    event.preventDefault()
    const menuWidth = 252
    const menuHeight = sort?.id === column.id ? 304 : 264
    const left = direction === "rtl"
      ? Math.max(8, event.clientX - menuWidth)
      : Math.min(event.clientX, window.innerWidth - menuWidth - 8)
    const top = Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8))
    setContextMenu({ columnId: column.id, x: left, y: top })
  }

  function startResize(column: DataTableColumn<Row>, event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    resizeStart.current = {
      columnId: column.id,
      x: event.clientX,
      width: columnWidth(column),
      min: column.minWidth ?? 84,
      max: column.maxWidth ?? 480,
    }
    setResizingId(column.id)
  }

  function stickyStyle(column: DataTableColumn<Row>): CSSProperties | undefined {
    const offset = pinnedOffsets.get(column.id)
    if (offset === undefined) return undefined
    return direction === "rtl" ? { position: "sticky", right: offset } : { position: "sticky", left: offset }
  }

  return (
    <div className={cn("w-full min-w-0 overflow-hidden rounded-[var(--md-radius-xl)] bg-white shadow-[var(--md-shadow-line)]", className)}>
      <div className={cn("flex min-h-10 flex-wrap items-center gap-2 bg-[color-mix(in_srgb,var(--md-surface)_92%,transparent)] px-2 py-1 shadow-[inset_0_-1px_0_rgba(11,20,19,0.05)] sm:flex-nowrap", toolbarLeading ? "justify-between" : "justify-end")}>
        {toolbarLeading ? <div className="flex min-w-0 shrink-0 items-center gap-1">{toolbarLeading}</div> : null}
        <div className="ms-auto flex min-w-0 flex-1 items-center justify-end gap-1.5">
          {toolbarActions ? <div className="flex min-w-0 flex-1 items-center justify-end">{toolbarActions}</div> : null}
          <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="group inline-flex h-8 items-center gap-2 rounded-[var(--md-radius-md)] px-2.5 text-[12px] font-medium text-[var(--md-text)] transition-[background,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-white hover:text-[var(--md-ink)] hover:shadow-[var(--md-shadow-line)] active:scale-[0.97]"
              aria-label={t(columnsButtonLabel ?? "Manage table columns")}
            >
              <SlidersHorizontal className="size-3.5" strokeWidth={1.45} />
              <span>{t("Columns")}</span>
              {hasCustomLayout ? <span className="size-1.5 rounded-full bg-[var(--md-accent)]" aria-hidden="true" /> : null}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" sideOffset={6} className="w-[310px] gap-0 rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-1 shadow-[var(--md-shadow-popover)]">
            <div className="flex items-start justify-between gap-3 px-3 py-2.5">
              <div>
                <p className="text-[13px] font-medium text-[var(--md-ink)]">{t("Table columns")}</p>
                <p className="mt-0.5 text-[11px] leading-4 text-[var(--md-text)]">{t("Drag to reorder. Right-click a header for quick actions.")}</p>
              </div>
              <button type="button" onClick={resetLayout} className="grid size-7 place-items-center rounded-[var(--md-radius-md)] text-[var(--md-subtle)] transition-[background,color,transform] hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] active:scale-[0.94]" aria-label={t("Reset columns")}>
                <RotateCcw className="size-3.5" strokeWidth={1.4} />
              </button>
            </div>
            <div className="max-h-[360px] overflow-y-auto p-1 md-scrollbar">
              <AnimatePresence initial={false}>
                {orderedColumns.map((column) => {
                  const isHidden = hidden.has(column.id)
                  const isPinned = pinned.has(column.id)
                  return (
                    <motion.div
                      layout={!reduceMotion}
                      key={column.id}
                      draggable
                      onDragStart={() => setDraggingId(column.id)}
                      onDragEnd={() => setDraggingId(null)}
                      onDragOver={(event) => event.preventDefault()}
                      onDragEnter={() => draggingId && moveColumn(draggingId, column.id)}
                      className={cn("group flex h-10 cursor-grab items-center gap-2 rounded-[var(--md-radius-md)] px-2 text-[12px] transition-[background,opacity,transform] hover:bg-[var(--md-hover)] active:cursor-grabbing", draggingId === column.id && "opacity-45")}
                    >
                      <GripVertical className="size-3.5 shrink-0 text-[var(--md-subtle)]" strokeWidth={1.35} aria-hidden="true" />
                      <span className={cn("min-w-0 flex-1 truncate font-medium text-[var(--md-ink)]", isHidden && "text-[var(--md-subtle)]")}>{t(column.label)}</span>
                      <button type="button" disabled={column.canPin === false} onClick={() => togglePinned(column)} className={cn("grid size-7 place-items-center rounded-[var(--md-radius-sm)] transition-[background,color,transform] active:scale-[0.92]", isPinned ? "bg-[rgba(14,125,116,0.1)] text-[var(--md-accent)]" : "text-[var(--md-subtle)] hover:bg-white hover:text-[var(--md-ink)]", column.canPin === false && "cursor-not-allowed opacity-25")} aria-label={t(`${isPinned ? "Unpin" : "Pin"} ${column.label} column`)}>
                        {isPinned ? <PinOff className="size-3.5" strokeWidth={1.4} /> : <Pin className="size-3.5" strokeWidth={1.4} />}
                      </button>
                      <button type="button" disabled={column.canHide === false} onClick={() => toggleHidden(column)} className={cn("grid size-7 place-items-center rounded-[var(--md-radius-sm)] transition-[background,color,transform] active:scale-[0.92]", !isHidden ? "text-[var(--md-ink)]" : "text-[var(--md-subtle)]", column.canHide === false ? "cursor-not-allowed opacity-25" : "hover:bg-white")} aria-label={t(`${isHidden ? "Show" : "Hide"} ${column.label} column`)}>
                        {isHidden ? <EyeOff className="size-3.5" strokeWidth={1.4} /> : <Eye className="size-3.5" strokeWidth={1.4} />}
                      </button>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>
          </PopoverContent>
          </Popover>
        </div>
      </div>

      <Table aria-label={ariaLabel ? t(ariaLabel) : undefined} className={tableClassName} style={{ minWidth: Math.max(minimumWidth, 720) }}>
        <TableHeader>
          <TableRow className="border-[rgba(11,20,19,0.05)] hover:bg-transparent">
            {visibleColumns.map((column) => {
              const isPinned = pinned.has(column.id)
              return (
                <TableHead
                  key={column.id}
                  draggable
                  onDragStart={(event) => {
                    if (resizeStart.current) {
                      event.preventDefault()
                      return
                    }
                    setDraggingId(column.id)
                  }}
                  onDragEnd={() => setDraggingId(null)}
                  onDragOver={(event) => event.preventDefault()}
                  onDragEnter={() => draggingId && moveColumn(draggingId, column.id)}
                  onContextMenu={(event) => openColumnContextMenu(column, event)}
                  aria-sort={sort?.id === column.id ? (sort.direction === "asc" ? "ascending" : "descending") : undefined}
                  style={{ width: columnWidth(column), minWidth: columnWidth(column), ...stickyStyle(column) }}
                  className={cn("group/header relative z-[1] bg-white pe-3 text-[12px] font-medium text-[var(--md-text)] transition-[background,box-shadow,opacity] duration-200", isPinned && "z-[3] bg-[rgba(255,255,255,0.94)] shadow-[2px_0_0_rgba(11,20,19,0.055)] backdrop-blur-xl", draggingId === column.id && "opacity-40", resizingId === column.id && "bg-[var(--md-surface-tint)]", column.headerClassName)}
                >
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <GripVertical className="size-3 -ms-1 text-[var(--md-subtle)] opacity-0 transition-opacity group-hover/header:opacity-70" strokeWidth={1.3} aria-hidden="true" />
                    {column.sortValue ? (
                      <button type="button" onClick={() => toggleSort(column)} className="inline-flex min-w-0 items-center gap-1.5 rounded-[var(--md-radius-xs)] text-start outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--md-accent)_24%,transparent)]" aria-label={t(`Sort by ${column.label}`)}>
                        <span className="truncate">{t(column.label)}</span>
                        {sort?.id === column.id ? (sort.direction === "asc" ? <ArrowUp className="size-3 shrink-0 text-[var(--md-accent)]" strokeWidth={1.4} /> : <ArrowDown className="size-3 shrink-0 text-[var(--md-accent)]" strokeWidth={1.4} />) : <ArrowUpDown className="size-3 shrink-0 text-[var(--md-subtle)] opacity-55" strokeWidth={1.35} />}
                      </button>
                    ) : <span className="truncate">{t(column.label)}</span>}
                    {isPinned ? <Pin className="size-3 text-[var(--md-accent)]" strokeWidth={1.3} aria-label={t("Pinned column")} /> : null}
                  </span>
                  {column.resizable ? (
                    <button
                      type="button"
                      draggable={false}
                      className={cn("absolute inset-y-0 end-0 z-[5] w-2 cursor-col-resize touch-none outline-none after:absolute after:inset-y-0 after:start-1/2 after:w-px after:-translate-x-1/2 after:bg-[var(--md-accent)] after:opacity-0 after:transition-opacity hover:after:opacity-100 focus-visible:after:opacity-100", resizingId === column.id && "after:opacity-100")}
                      aria-label={t(`Resize ${column.label} column`)}
                      onPointerDown={(event) => startResize(column, event)}
                    />
                  ) : null}
                </TableHead>
              )
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedRows.length ? sortedRows.map((row) => {
            const rowKey = getRowKey(row)
            const isSelected = selectedRowKey === rowKey
            return (
              <TableRow
                key={rowKey}
                data-state={isSelected ? "selected" : undefined}
                aria-selected={isSelected || undefined}
                className={cn(typeof rowClassName === "function" ? rowClassName(row) : rowClassName, onRowClick && "cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color-mix(in_srgb,var(--md-accent)_30%,transparent)]")}
                tabIndex={onRowClick ? 0 : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={onRowClick ? (event) => {
                  if (event.key !== "Enter" && event.key !== " ") return
                  event.preventDefault()
                  onRowClick(row)
                } : undefined}
              >
                {visibleColumns.map((column) => {
                  const isPinned = pinned.has(column.id)
                  return (
                    <TableCell
                      key={column.id}
                      style={{ width: columnWidth(column), minWidth: columnWidth(column), ...stickyStyle(column) }}
                      className={cn(
                        "transition-[background,box-shadow,opacity] duration-200",
                        isPinned && "z-[2] shadow-[2px_0_0_rgba(11,20,19,0.055)] backdrop-blur-xl",
                        isPinned && (isSelected ? "bg-[color-mix(in_srgb,var(--md-accent)_8%,rgba(255,255,255,0.94))]" : "bg-[rgba(255,255,255,0.94)]"),
                        column.cellClassName,
                      )}
                    >
                      {column.cell(row)}
                    </TableCell>
                  )
                })}
              </TableRow>
            )
          }) : (
            <TableRow className="h-[180px] border-[rgba(11,20,19,0.04)] hover:bg-transparent">
              <TableCell colSpan={visibleColumns.length} className="text-center">
                {emptyState ?? <p className="text-[13px] text-[var(--md-text)]">{t("No records to show")}</p>}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {typeof document !== "undefined" ? createPortal(
        <AnimatePresence>
          {contextMenu && contextColumn ? (
            <motion.div
              ref={contextMenuRef}
              role="menu"
              aria-label={t(`${contextColumn.label} column actions`)}
              dir={direction}
              initial={reduceMotion ? false : { opacity: 0, scale: 0.96, y: -5, filter: "blur(6px)" }}
              animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: -3, filter: "blur(3px)" }}
              transition={{ duration: reduceMotion ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="fixed z-[120] w-[252px] overflow-hidden rounded-[var(--md-radius-xl)] bg-[color-mix(in_srgb,var(--md-surface)_96%,transparent)] p-1.5 text-start shadow-[var(--md-shadow-popover)] backdrop-blur-xl"
              style={{ left: contextMenu.x, top: contextMenu.y }}
            >
              <div className="mb-1 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-3 py-2.5 shadow-[var(--md-shadow-line)]">
                <div className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-[var(--md-accent)]" aria-hidden="true" />
                  <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-[var(--md-ink)]">{t(contextColumn.label)}</p>
                </div>
                <p className="mt-1 text-[10.5px] leading-4 text-[var(--md-subtle)]">{t("Quick column actions")}</p>
              </div>

              {([
                { label: "Sort ascending", hint: "A–Z", icon: ArrowUp, disabled: !contextColumn.sortValue, active: sort?.id === contextColumn.id && sort.direction === "asc", action: () => setColumnSort(contextColumn, "asc") },
                { label: "Sort descending", hint: "Z–A", icon: ArrowDown, disabled: !contextColumn.sortValue, active: sort?.id === contextColumn.id && sort.direction === "desc", action: () => setColumnSort(contextColumn, "desc") },
                ...(sort?.id === contextColumn.id ? [{ label: "Clear sorting", icon: ArrowUpDown, disabled: false, active: false, action: () => setColumnSort(contextColumn, null) }] : []),
              ] as Array<{ label: string; hint?: string; icon: LucideIcon; disabled: boolean; active: boolean; action: () => void }>).map((item, index) => {
                const Icon = item.icon
                return (
                  <motion.button
                    key={item.label}
                    type="button"
                    role="menuitem"
                    disabled={item.disabled}
                    initial={reduceMotion ? false : { opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: reduceMotion ? 0 : 0.16, delay: reduceMotion ? 0 : 0.025 * (index + 1), ease: [0.22, 1, 0.36, 1] }}
                    onClick={() => {
                      item.action()
                      setContextMenu(null)
                    }}
                    className={cn("group flex h-9 w-full items-center gap-2.5 rounded-[var(--md-radius-md)] px-2 text-[11.5px] font-medium text-[var(--md-text)] outline-none transition-[background,color,opacity] hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] focus-visible:bg-[var(--md-hover)] disabled:cursor-not-allowed disabled:opacity-35", item.active && "bg-[color-mix(in_srgb,var(--md-accent)_9%,transparent)] text-[var(--md-accent)]")}
                  >
                    <span className={cn("grid size-7 shrink-0 place-items-center rounded-[var(--md-radius-sm)] bg-[var(--md-surface-soft)] text-[var(--md-subtle)] shadow-[var(--md-shadow-line)] transition-colors group-hover:text-[var(--md-ink)]", item.active && "bg-[color-mix(in_srgb,var(--md-accent)_12%,white)] text-[var(--md-accent)]")}>
                      <Icon className="size-3.5" strokeWidth={1.4} />
                    </span>
                    <span className="min-w-0 flex-1 text-start">{t(item.label)}</span>
                    {item.hint ? <span data-i18n-skip className="text-[9.5px] font-normal tracking-wide text-[var(--md-subtle)]">{item.hint}</span> : null}
                  </motion.button>
                )
              })}

              <div className="my-1 h-px bg-[var(--md-line)]" />

              {([
                { label: pinned.has(contextColumn.id) ? "Unpin column" : "Pin column", icon: pinned.has(contextColumn.id) ? PinOff : Pin, disabled: contextColumn.canPin === false, active: pinned.has(contextColumn.id), action: () => togglePinned(contextColumn) },
                { label: "Hide column", icon: EyeOff, disabled: contextColumn.canHide === false || visibleColumns.length <= 1, active: false, action: () => toggleHidden(contextColumn) },
                { label: "Reset table layout", icon: RotateCcw, disabled: !hasCustomLayout && !sort, active: false, action: resetLayout },
              ] as Array<{ label: string; icon: LucideIcon; disabled: boolean; active: boolean; action: () => void }>).map((item, index) => {
                const Icon = item.icon
                return (
                  <motion.button
                    key={item.label}
                    type="button"
                    role="menuitem"
                    disabled={item.disabled}
                    initial={reduceMotion ? false : { opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: reduceMotion ? 0 : 0.16, delay: reduceMotion ? 0 : 0.025 * (index + 4), ease: [0.22, 1, 0.36, 1] }}
                    onClick={() => {
                      item.action()
                      setContextMenu(null)
                    }}
                    className={cn("group flex h-9 w-full items-center gap-2.5 rounded-[var(--md-radius-md)] px-2 text-[11.5px] font-medium text-[var(--md-text)] outline-none transition-[background,color,opacity] hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] focus-visible:bg-[var(--md-hover)] disabled:cursor-not-allowed disabled:opacity-35", item.active && "text-[var(--md-accent)]")}
                  >
                    <span className={cn("grid size-7 shrink-0 place-items-center rounded-[var(--md-radius-sm)] bg-[var(--md-surface-soft)] text-[var(--md-subtle)] shadow-[var(--md-shadow-line)] transition-colors group-hover:text-[var(--md-ink)]", item.active && "bg-[color-mix(in_srgb,var(--md-accent)_12%,white)] text-[var(--md-accent)]")}>
                      <Icon className="size-3.5" strokeWidth={1.4} />
                    </span>
                    <span className="min-w-0 flex-1 text-start">{t(item.label)}</span>
                  </motion.button>
                )
              })}
            </motion.div>
          ) : null}
        </AnimatePresence>,
        document.body,
      ) : null}
    </div>
  )
}
