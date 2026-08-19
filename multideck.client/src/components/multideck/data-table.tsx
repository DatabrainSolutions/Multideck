import { Fragment, isValidElement, useEffect, useMemo, useRef, useState, type CSSProperties, type HTMLAttributes, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactElement, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Csv02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Columns3, Eye, EyeOff, GripVertical, LoaderCircle, MoreHorizontal, MorphingIcon, Pin, PinOff, RotateCcw, SquareCheck, Trash2, X, type LucideIcon } from "@/components/icons/hugeicons"

import { TableCsvExportDialog } from "@/components/multideck/table-csv-export-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useLanguage } from "@/i18n/language-provider"
import { discoverCsvRecordFields, type CsvExportField, type CsvExportSource, type DiscoverCsvFieldsOptions } from "@/lib/csv-export"
import { useTablePinnedColumns } from "@/lib/table-preferences"
import { cn, isInsideFloatingLayer } from "@/lib/utils"
import { TablePillKindContext } from "@/components/multideck/status-pill"

export type DataTableColumn<Row> = {
  id: string
  label: string
  headerContent?: ReactNode
  cell: (row: Row) => ReactNode
  /** Describes the data, allowing the shared table to apply consistent alignment. */
  kind?: "text" | "long-text" | "identity" | "number" | "date" | "status" | "attribute" | "actions" | "custom"
  align?: "start" | "center" | "end"
  cellTitle?: (row: Row) => string | undefined
  width?: number
  minWidth?: number
  maxWidth?: number
  headerClassName?: string
  cellClassName?: string
  canHide?: boolean
  canPin?: boolean
  defaultHidden?: boolean
  resizable?: boolean
  sortValue?: (row: Row) => string | number | null | undefined
  /** Exact CSV value for a displayed column. Falls back to the row value, sort value, then rendered text. */
  exportValue?: (row: Row) => unknown
  /** Excludes navigation or control-only columns from CSV field selection. */
  exportable?: boolean
}

export type DataTableRowContextAction<Row> = {
  id: string
  label: string
  hint?: string
  icon: LucideIcon
  tone?: "default" | "destructive"
  disabled?: boolean
  onSelect: (row: Row) => void
}

export type DataTableExportConfig<Row> = DiscoverCsvFieldsOptions & {
  fileName?: string | ((rows: readonly Row[]) => string)
  /** Loads full records only after export is requested, preserving lean register queries. */
  loadRecords?: (rows: readonly Row[]) => Promise<readonly unknown[]>
  fields?: readonly CsvExportField<Row>[]
}

export type DataTableBulkDeleteConfig<Row> = {
  canDelete?: (row: Row) => boolean
  disabledReason?: string
  title?: string
  description?: (rows: readonly Row[]) => string
  confirmLabel?: string
  onConfirm: (rows: readonly Row[]) => Promise<void>
}

type SavedTableLayout = {
  order: string[]
  hidden: string[]
  widths: Record<string, number>
  sort: { id: string; direction: "asc" | "desc" } | null
}

type ColumnContextMenu = {
  columnId: string
  x: number
  y: number
}

type RowContextMenu<Row> = {
  row: Row
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
  selectedRowKeys?: ReadonlySet<string>
  ariaLabel?: string
  columnsButtonLabel?: string
  /** View tabs or equivalent view toggles only. Search, filters, and actions belong in trailing slots. */
  toolbarTabs?: ReactNode
  /** Trailing controls are rendered in this fixed order: search, filters, options, columns. */
  toolbarSearch?: ReactNode
  toolbarFilters?: ReactNode
  toolbarOptions?: ReactNode
  /** Contextual feedback or setup UI shown between the toolbar and table surface. */
  contentBeforeTable?: ReactNode
  /** Lets an intentionally compact register keep its controls on one desktop row. */
  compactToolbar?: boolean
  emptyState?: ReactNode
  minimumWidth?: number
  showToolbar?: boolean
  showColumnManager?: boolean
  rowAriaLabel?: (row: Row) => string
  rowState?: (row: Row) => "default" | "muted"
  isRowInteractive?: (row: Row) => boolean
  onRowDoubleClick?: (row: Row) => void
  rowProps?: (row: Row) => HTMLAttributes<HTMLTableRowElement>
  wrapRow?: (row: Row, rowElement: ReactElement) => ReactNode
  renderAfterRow?: (row: Row, visibleColumnCount: number) => ReactNode
  /** Enabled by default so every canonical record table shares one selection/export workflow. */
  enableSelectionExport?: boolean
  exportConfig?: DataTableExportConfig<Row>
  /** Adds a confirmed destructive action to the shared selected-row toolbar. */
  bulkDelete?: DataTableBulkDeleteConfig<Row>
  rowContextActions?: (row: Row) => readonly DataTableRowContextAction<Row>[]
  className?: string
  tableClassName?: string
  /** Server-owned paging keeps large registers bounded without changing the table interaction model. */
  pagination?: {
    offset: number
    limit: number
    total: number
    loading?: boolean
    onOffsetChange: (offset: number) => void
  }
  /** When supplied, sorting is executed by the server instead of the current page only. */
  serverSorting?: {
    value: { id: string; direction: "asc" | "desc" } | null
    onChange: (value: { id: string; direction: "asc" | "desc" } | null) => void
  }
}

function readLayout(storageKey: string | undefined, columns: DataTableColumn<unknown>[]): SavedTableLayout {
  const fallback = {
    order: columns.map((column) => column.id),
    hidden: columns.filter((column) => column.defaultHidden).map((column) => column.id),
    widths: {},
    sort: null,
  }

  if (!storageKey || typeof window === "undefined") return fallback

  try {
    const stored = JSON.parse(window.localStorage.getItem(`multideck.table.${storageKey}`) ?? "null") as Partial<SavedTableLayout> | null
    if (!stored) return fallback
    const available = new Set(fallback.order)
    return {
      order: [...(stored.order ?? []).filter((id) => available.has(id)), ...fallback.order.filter((id) => !stored.order?.includes(id))],
      hidden: (stored.hidden ?? []).filter((id) => available.has(id)),
      widths: Object.fromEntries(
        Object.entries(stored.widths ?? {}).filter(([id, width]) => available.has(id) && Number.isFinite(width)),
      ),
      sort: stored.sort && available.has(stored.sort.id) && (stored.sort.direction === "asc" || stored.sort.direction === "desc")
        ? stored.sort
        : null,
    }
  } catch {
    return fallback
  }
}

function reactNodeToPlainText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return ""
  if (typeof node === "string" || typeof node === "number" || typeof node === "bigint") return String(node)
  if (Array.isArray(node)) return node.map(reactNodeToPlainText).filter(Boolean).join(" ")
  if (!isValidElement(node)) return ""
  const props = node.props as { children?: ReactNode; value?: unknown; "aria-label"?: string }
  const children = reactNodeToPlainText(props.children)
  if (children) return children.replace(/\s+/g, " ").trim()
  if (typeof props["aria-label"] === "string") return props["aria-label"]
  return typeof props.value === "string" || typeof props.value === "number" ? String(props.value) : ""
}

function directRecordValue(record: unknown, key: string) {
  if (record === null || record === undefined || typeof record !== "object") return undefined
  return (record as Record<string, unknown>)[key]
}

function rowMenuItemDelay(index: number) {
  if (index === 0) return 0.034
  if (index === 1) return 0.074
  return 0.108
}

export function DataTable<Row>({
  columns,
  rows,
  getRowKey,
  storageKey,
  rowClassName,
  onRowClick,
  selectedRowKey,
  selectedRowKeys,
  ariaLabel,
  columnsButtonLabel,
  toolbarTabs,
  toolbarSearch,
  toolbarFilters,
  toolbarOptions,
  contentBeforeTable,
  compactToolbar = false,
  emptyState,
  minimumWidth: minimumWidthOverride,
  showToolbar = true,
  showColumnManager = true,
  rowAriaLabel,
  rowState,
  isRowInteractive,
  onRowDoubleClick,
  rowProps,
  wrapRow,
  renderAfterRow,
  enableSelectionExport = true,
  exportConfig,
  bulkDelete,
  rowContextActions,
  className,
  tableClassName,
  pagination,
  serverSorting,
}: DataTableProps<Row>) {
  const { direction, t } = useLanguage()
  const reduceMotion = useReducedMotion()
  const columnIds = useMemo(() => columns.map((column) => column.id), [columns])
  const defaultHidden = useMemo(() => columns.filter((column) => column.defaultHidden).map((column) => column.id), [columns])
  const initialLayout = useMemo(() => readLayout(storageKey, columns as DataTableColumn<unknown>[]), [columns, storageKey])
  const [order, setOrder] = useState(initialLayout.order)
  const [hidden, setHidden] = useState(() => new Set(initialLayout.hidden))
  const [pinned, setPinned] = useTablePinnedColumns(storageKey, columnIds)
  const [widths, setWidths] = useState(initialLayout.widths)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [resizingId, setResizingId] = useState<string | null>(null)
  const [sort, setSort] = useState<{ id: string; direction: "asc" | "desc" } | null>(initialLayout.sort)
  const [contextMenu, setContextMenu] = useState<ColumnContextMenu | null>(null)
  const [rowContextMenu, setRowContextMenu] = useState<RowContextMenu<Row> | null>(null)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectionKeys, setSelectionKeys] = useState<Set<string>>(new Set())
  const [exportOpen, setExportOpen] = useState(false)
  const [exportSources, setExportSources] = useState<CsvExportSource<Row>[]>([])
  const [exportLoading, setExportLoading] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null)
  const [stickyColumnsEnabled, setStickyColumnsEnabled] = useState(() => (
    typeof window === "undefined" || window.matchMedia("(min-width: 768px)").matches
  ))
  const [mobileToolbarControls, setMobileToolbarControls] = useState(() => (
    typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches
  ))
  const resizeStart = useRef<{ columnId: string; x: number; width: number; min: number; max: number } | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const rowContextMenuRef = useRef<HTMLDivElement>(null)
  const rowContextTriggerRef = useRef<HTMLTableRowElement | null>(null)
  const exportRequestId = useRef(0)

  useEffect(() => {
    setOrder((current) => [...current.filter((id) => columnIds.includes(id)), ...columnIds.filter((id) => !current.includes(id))])
    setHidden((current) => new Set([...current].filter((id) => columnIds.includes(id))))
    setWidths((current) => Object.fromEntries(Object.entries(current).filter(([id]) => columnIds.includes(id))))
    setSort((current) => current && columnIds.includes(current.id) ? current : null)
  }, [columnIds])

  useEffect(() => {
    if (serverSorting) setSort(serverSorting.value)
  }, [serverSorting?.value?.direction, serverSorting?.value?.id])

  useEffect(() => {
    if (!storageKey) return
    window.localStorage.setItem(
      `multideck.table.${storageKey}`,
      JSON.stringify({ order, hidden: [...hidden], widths, sort } satisfies SavedTableLayout),
    )
  }, [hidden, order, sort, storageKey, widths])

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)")
    const syncStickyColumns = () => setStickyColumnsEnabled(media.matches)
    media.addEventListener("change", syncStickyColumns)
    syncStickyColumns()
    return () => media.removeEventListener("change", syncStickyColumns)
  }, [])

  useEffect(() => {
    const media = window.matchMedia("(max-width: 639px)")
    const syncMobileToolbar = () => setMobileToolbarControls(media.matches)
    media.addEventListener("change", syncMobileToolbar)
    syncMobileToolbar()
    return () => media.removeEventListener("change", syncMobileToolbar)
  }, [])

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
    if (!rowContextMenu) return

    const closeMenu = () => setRowContextMenu(null)
    const closeFromPointer = (event: globalThis.PointerEvent) => {
      if (rowContextMenuRef.current?.contains(event.target as Node)) return
      closeMenu()
    }
    const closeFromKeyboard = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      closeMenu()
      window.requestAnimationFrame(() => rowContextTriggerRef.current?.focus())
    }

    const focusFrame = window.requestAnimationFrame(() => {
      rowContextMenuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
    })

    window.addEventListener("pointerdown", closeFromPointer)
    window.addEventListener("scroll", closeMenu, true)
    window.addEventListener("resize", closeMenu)
    window.addEventListener("keydown", closeFromKeyboard)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      window.removeEventListener("pointerdown", closeFromPointer)
      window.removeEventListener("scroll", closeMenu, true)
      window.removeEventListener("resize", closeMenu)
      window.removeEventListener("keydown", closeFromKeyboard)
    }
  }, [rowContextMenu])

  useEffect(() => {
    const available = new Set(rows.map(getRowKey))
    setSelectionKeys((current) => {
      const next = new Set([...current].filter((key) => available.has(key)))
      return next.size === current.size ? current : next
    })
  }, [getRowKey, rows])

  useEffect(() => {
    if (!selectionMode || exportOpen || rowContextMenu) return
    const exitSelectionFromKeyboard = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      setSelectionMode(false)
      setSelectionKeys(new Set())
    }
    window.addEventListener("keydown", exitSelectionFromKeyboard)
    return () => window.removeEventListener("keydown", exitSelectionFromKeyboard)
  }, [exportOpen, rowContextMenu, selectionMode])

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
  const selectionColumnWidth = selectionMode ? 44 : 0
  const columnWidth = (column: DataTableColumn<Row>) => widths[column.id] ?? column.width ?? 160
  const pinnedOffsets = new Map<string, number>()
  let nextOffset = selectionColumnWidth
  visibleColumns.forEach((column) => {
    if (!pinned.has(column.id)) return
    pinnedOffsets.set(column.id, nextOffset)
    nextOffset += columnWidth(column)
  })

  const minimumWidth = (minimumWidthOverride ?? Math.max(visibleColumns.reduce((width, column) => width + columnWidth(column), 0), 720)) + selectionColumnWidth
  const hasCustomLayout = Boolean(sort) || hidden.size !== defaultHidden.length || [...hidden].some((id) => !defaultHidden.includes(id)) || Object.keys(widths).length > 0 || pinned.size > 0 || order.some((id, index) => id !== columnIds[index])
  const contextColumn = contextMenu ? columns.find((column) => column.id === contextMenu.columnId) : undefined
  const sortedRows = useMemo(() => {
    if (serverSorting) return rows
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
  }, [columns, rows, serverSorting, sort])

  const selectedRows = useMemo(
    () => sortedRows.filter((row) => selectionKeys.has(getRowKey(row))),
    [getRowKey, selectionKeys, sortedRows],
  )
  const selectedRowsCanDelete = Boolean(selectedRows.length && bulkDelete && selectedRows.every((row) => bulkDelete.canDelete?.(row) ?? true))
  const allRowsSelected = sortedRows.length > 0 && selectedRows.length === sortedRows.length
  const exportFields = useMemo<CsvExportField<Row>[]>(() => {
    const columnFields = columns
      .filter((column) => column.exportable !== false && column.kind !== "actions" && column.id !== "open")
      .map<CsvExportField<Row>>((column) => ({
        id: `column:${column.id}`,
        label: column.label,
        category: "Columns",
        defaultSelected: true,
        getValue: (source) => {
          if (column.exportValue) return column.exportValue(source.row)
          const directValue = directRecordValue(source.record, column.id)
          if (directValue !== undefined) return directValue
          const renderedValue = reactNodeToPlainText(column.cell(source.row))
          if (renderedValue) return renderedValue
          return column.sortValue?.(source.row)
        },
      }))
    const discoveredFields = discoverCsvRecordFields(exportSources, {
      recordCategory: exportConfig?.recordCategory,
      categoryForPath: exportConfig?.categoryForPath,
      labelForPath: exportConfig?.labelForPath,
      excludePaths: exportConfig?.excludePaths,
      maxDepth: exportConfig?.maxDepth,
    })
    return [...columnFields, ...discoveredFields, ...(exportConfig?.fields ?? [])]
  }, [columns, exportConfig, exportSources])

  function toggleSelection(row: Row) {
    const key = getRowKey(row)
    setSelectionKeys((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function selectFromContextMenu(row: Row) {
    setSelectionMode(true)
    const key = getRowKey(row)
    setSelectionKeys((current) => {
      const next = new Set(current)
      if (selectionMode && next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function exitSelectionMode() {
    setSelectionMode(false)
    setSelectionKeys(new Set())
  }

  function toggleAllRows() {
    setSelectionKeys(allRowsSelected ? new Set() : new Set(sortedRows.map(getRowKey)))
  }

  async function loadExportSources(rowsToExport: readonly Row[]) {
    const requestId = ++exportRequestId.current
    setExportSources(rowsToExport.map((row) => ({ row, record: row })))
    setExportError(null)
    if (!exportConfig?.loadRecords) {
      setExportLoading(false)
      return
    }

    setExportLoading(true)
    try {
      const records = await exportConfig.loadRecords(rowsToExport)
      if (records.length !== rowsToExport.length) throw new Error("The full record response was incomplete.")
      if (requestId !== exportRequestId.current) return
      setExportSources(rowsToExport.map((row, index) => ({ row, record: records[index] ?? row })))
    } catch (reason) {
      if (requestId !== exportRequestId.current) return
      console.error("Full table export records could not be loaded.", reason)
      setExportError("Check your connection and try loading the selected records again.")
    } finally {
      if (requestId === exportRequestId.current) setExportLoading(false)
    }
  }

  function openExportDialog() {
    if (!selectedRows.length) return
    setExportOpen(true)
    void loadExportSources(selectedRows)
  }

  async function confirmBulkDelete() {
    if (!bulkDelete || !selectedRowsCanDelete || bulkDeleting) return
    setBulkDeleting(true)
    setBulkDeleteError(null)
    try {
      await bulkDelete.onConfirm(selectedRows)
      setBulkDeleteOpen(false)
      exitSelectionMode()
    } catch (reason) {
      console.error("Selected table rows could not be deleted.", reason)
      setBulkDeleteError(reason instanceof Error ? reason.message : "The selected rows could not be deleted. Try again.")
    } finally {
      setBulkDeleting(false)
    }
  }

  function openRowContextMenuAt(row: Row, clientX: number, clientY: number, trigger?: HTMLTableRowElement) {
    const menuWidth = 252
    const customActions = rowContextActions?.(row) ?? []
    const actionCount = customActions.length + (enableSelectionExport ? 1 : 0)
    const menuHeight = 8 + actionCount * 36 + (enableSelectionExport && customActions.length ? 8 : 0)
    const left = direction === "rtl"
      ? Math.max(8, clientX - menuWidth)
      : Math.min(clientX, window.innerWidth - menuWidth - 8)
    const top = Math.max(8, Math.min(clientY, window.innerHeight - menuHeight - 8))
    setContextMenu(null)
    rowContextTriggerRef.current = trigger ?? null
    setRowContextMenu({ row, x: left, y: top })
  }

  function moveColumn(sourceId: string, targetId: string) {
    if (sourceId === targetId) return
    setOrder((current) => {
      const next = current.filter((id) => id !== sourceId)
      const targetIndex = next.indexOf(targetId)
      next.splice(targetIndex < 0 ? next.length : targetIndex, 0, sourceId)
      return next
    })
  }

  function moveColumnByStep(columnId: string, step: -1 | 1) {
    const columnIsPinned = pinned.has(columnId)
    const groupOrder = orderedColumns
      .filter((column) => pinned.has(column.id) === columnIsPinned)
      .map((column) => column.id)
    const currentIndex = groupOrder.indexOf(columnId)
    const targetIndex = currentIndex + step
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= groupOrder.length) return

    const nextGroupOrder = [...groupOrder]
    const [movedColumn] = nextGroupOrder.splice(currentIndex, 1)
    nextGroupOrder.splice(targetIndex, 0, movedColumn)
    const groupIds = new Set(groupOrder)

    setOrder((current) => {
      let nextGroupIndex = 0
      return current.map((id) => groupIds.has(id) ? nextGroupOrder[nextGroupIndex++] : id)
    })
  }

  function toggleHidden(column: DataTableColumn<Row>) {
    if (column.canHide === false) return
    if (!hidden.has(column.id) && visibleColumns.length <= 1) return
    setHidden((current) => {
      const next = new Set(current)
      if (next.has(column.id)) next.delete(column.id)
      else next.add(column.id)
      return next
    })
  }

  function togglePinned(column: DataTableColumn<Row>) {
    if (column.canPin === false) return
    const next = new Set(pinned)
    if (next.has(column.id)) next.delete(column.id)
    else {
      next.add(column.id)
      setHidden((hiddenColumns) => {
        const visible = new Set(hiddenColumns)
        visible.delete(column.id)
        return visible
      })
    }
    setPinned(next)
  }

  function resetLayout() {
    setOrder(columnIds)
    setHidden(new Set(defaultHidden))
    setPinned([])
    setWidths({})
    setSort(null)
    serverSorting?.onChange(null)
  }

  function toggleSort(column: DataTableColumn<Row>) {
    if (!column.sortValue) return
    const next = (() => {
      const current = serverSorting?.value ?? sort
      if (!current || current.id !== column.id) return { id: column.id, direction: "asc" }
      if (current.direction === "asc") return { id: column.id, direction: "desc" }
      return null
    })() as { id: string; direction: "asc" | "desc" } | null
    setSort(next)
    serverSorting?.onChange(next)
  }

  function setColumnSort(column: DataTableColumn<Row>, direction: "asc" | "desc" | null) {
    if (!column.sortValue) return
    const next = direction ? { id: column.id, direction } : null
    setSort(next)
    serverSorting?.onChange(next)
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

  function startResize(column: DataTableColumn<Row>, event: ReactPointerEvent<HTMLElement>) {
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

  function resizeColumnFromKeyboard(column: DataTableColumn<Row>, event: React.KeyboardEvent<HTMLElement>) {
    const min = column.minWidth ?? 84
    const max = column.maxWidth ?? 480
    const currentWidth = columnWidth(column)
    const step = event.shiftKey ? 24 : 8
    let nextWidth = currentWidth

    if (event.key === "ArrowLeft") nextWidth = currentWidth - step
    else if (event.key === "ArrowRight") nextWidth = currentWidth + step
    else if (event.key === "Home") nextWidth = min
    else if (event.key === "End") nextWidth = max
    else return

    event.preventDefault()
    event.stopPropagation()
    setWidths((current) => ({ ...current, [column.id]: Math.max(min, Math.min(max, nextWidth)) }))
  }

  function stickyStyle(column: DataTableColumn<Row>): CSSProperties | undefined {
    if (!stickyColumnsEnabled) return undefined
    const offset = pinnedOffsets.get(column.id)
    if (offset === undefined) return undefined
    return direction === "rtl" ? { position: "sticky", right: offset } : { position: "sticky", left: offset }
  }

  function columnAlignment(column: DataTableColumn<Row>) {
    const alignment = column.align ?? (column.kind === "number" || column.kind === "actions" ? "end" : "start")
    return alignment === "end" ? "text-end" : alignment === "center" ? "text-center" : "text-start"
  }

  function columnDataClass(column: DataTableColumn<Row>) {
    return column.kind === "number" ? "tabular-nums" : undefined
  }

  const hasTrailingToolbar = Boolean(selectionMode || toolbarSearch || toolbarFilters || toolbarOptions || showColumnManager)
  const hasLeadingToolbar = Boolean(toolbarTabs)
  const contextRowActions = rowContextMenu ? rowContextActions?.(rowContextMenu.row) ?? [] : []
  const contextRowKey = rowContextMenu ? getRowKey(rowContextMenu.row) : null
  const contextRowSelected = contextRowKey ? selectionKeys.has(contextRowKey) : false
  const contextRowLabel = rowContextMenu
    ? rowAriaLabel?.(rowContextMenu.row) ?? contextRowKey ?? "Row"
    : "Row"
  const resolvedExportFileName = typeof exportConfig?.fileName === "function"
    ? exportConfig.fileName(exportSources.map((source) => source.row))
    : exportConfig?.fileName ?? `${ariaLabel ?? storageKey ?? "multideck-table"}-${new Date().toISOString().slice(0, 10)}`
  const selectionControls = selectionMode ? (
    <motion.div
      data-table-selection-controls
      initial={reduceMotion ? false : { opacity: 0, x: direction === "rtl" ? 8 : -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: direction === "rtl" ? 6 : -6 }}
      transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
      className="order-0 flex h-8 items-center gap-1 rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] ps-2.5 pe-1 shadow-[var(--md-shadow-line)]"
      role="group"
      aria-label={t("Selected row actions")}
    >
      <span className="me-1 whitespace-nowrap text-[11px] font-medium text-[var(--md-ink)]">
        <span data-i18n-skip dir="ltr">{selectedRows.length}</span> {t(selectedRows.length === 1 ? "selected row" : "selected rows")}
      </span>
      <button
        type="button"
        disabled={!selectedRows.length}
        onClick={openExportDialog}
        className="grid size-7 place-items-center rounded-[var(--md-radius-md)] bg-[var(--md-accent-a10)] text-[var(--md-accent)] outline-none transition-[background,color,opacity,transform] hover:bg-[color-mix(in_srgb,var(--md-accent)_16%,transparent)] focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a20)] active:scale-[0.94] disabled:cursor-not-allowed disabled:opacity-35 motion-reduce:transform-none"
        aria-label={t("Export selected rows")}
        title={t("Export selected rows")}
      >
        <HugeiconsIcon icon={Csv02Icon} size={15} strokeWidth={1.4} aria-hidden="true" />
      </button>
      {bulkDelete ? <button
        type="button"
        disabled={!selectedRowsCanDelete || bulkDeleting}
        onClick={() => { setBulkDeleteError(null); setBulkDeleteOpen(true) }}
        className="grid size-7 place-items-center rounded-[var(--md-radius-md)] text-[var(--md-red)] outline-none transition-[background,color,opacity,transform] hover:bg-[color-mix(in_srgb,var(--md-red)_10%,transparent)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--md-red)_24%,transparent)] active:scale-[0.94] disabled:cursor-not-allowed disabled:opacity-35 motion-reduce:transform-none"
        aria-label={t(selectedRowsCanDelete ? "Delete selected rows" : bulkDelete.disabledReason ?? "Selected rows cannot be deleted")}
        title={t(selectedRowsCanDelete ? "Delete selected rows" : bulkDelete.disabledReason ?? "Selected rows cannot be deleted")}
      >
        <Trash2 className="size-3.5" strokeWidth={1.4} aria-hidden="true" />
      </button> : null}
      <button
        type="button"
        onClick={exitSelectionMode}
        className="grid size-8 place-items-center rounded-[var(--md-radius-md)] text-[var(--md-subtle)] outline-none transition-[background,color,transform] hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a20)] active:scale-[0.94] motion-reduce:transform-none"
        aria-label={t("Exit selection mode")}
        title={t("Exit selection mode")}
      >
        <X className="size-3.5" strokeWidth={1.4} />
      </button>
    </motion.div>
  ) : null

  return (
    <div className={cn("w-full min-w-0", className)}>
      {/* The toolbar wraps by group, never by control. A register with a view
          switch, three filters and a search will not fit one line on a laptop, and
          two clean rows read far better than a leading group floating in the
          middle of a ragged three-row block. */}
      {showToolbar ? <div data-table-toolbar className={cn("mb-2 flex min-h-9 flex-nowrap items-center gap-x-2 gap-y-1.5 bg-transparent px-0 py-0.5 sm:flex-wrap", hasLeadingToolbar ? "justify-between" : "justify-end")}>
        {toolbarTabs ? <div data-table-tabs className="flex min-w-0 items-center gap-1 overflow-x-auto sm:shrink-0 sm:overflow-visible">{toolbarTabs}</div> : null}
        {/* The minimum width is what makes the trailing controls drop to their own
            line as one block. Without it they wrap control by control around the
            leading group and the row loses its reading order. */}
        {hasTrailingToolbar ? <div data-table-trailing-controls className={cn("ms-auto flex flex-none flex-nowrap items-center justify-end gap-1.5 sm:flex-wrap", compactToolbar ? "sm:min-w-[min(100%,520px)]" : "sm:min-w-[min(100%,560px)]")}>
          <AnimatePresence initial={false}>{selectionControls}</AnimatePresence>
          {mobileToolbarControls && (toolbarSearch || toolbarFilters || toolbarOptions) ? <Popover>
            <PopoverTrigger asChild>
              <button type="button" className="inline-flex h-8 items-center gap-1.5 rounded-[var(--md-radius-md)] px-2.5 text-[12px] font-medium text-[var(--md-text)] transition-[background,color,box-shadow,transform] hover:bg-[var(--md-surface)] hover:text-[var(--md-ink)] hover:shadow-[var(--md-shadow-line)] active:scale-[0.96]" aria-label={t("Table controls")}>
                <MoreHorizontal className="size-3.5" strokeWidth={1.45} />
                <span>{t("Controls")}</span>
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              sideOffset={6}
              onInteractOutside={(event) => { if (isInsideFloatingLayer(event.target)) event.preventDefault() }}
              className="w-[min(340px,calc(100vw-24px))] rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-2 shadow-[var(--md-shadow-popover)]"
            >
              <div className="grid gap-2">
                {toolbarSearch ? <div className="min-w-0 [&>*]:w-full [&_input]:!rounded-[var(--md-radius-lg)]">{toolbarSearch}</div> : null}
                {toolbarFilters ? <div className="flex min-w-0 flex-wrap items-center gap-1.5 [&_button]:!rounded-[var(--md-radius-lg)]">{toolbarFilters}</div> : null}
                {toolbarOptions ? <div className="flex min-w-0 flex-wrap items-center gap-1.5">{toolbarOptions}</div> : null}
              </div>
            </PopoverContent>
          </Popover> : (
            <>
              {toolbarSearch ? <div className="order-1 flex min-w-0 items-center [&_input]:!rounded-[var(--md-radius-lg)]">{toolbarSearch}</div> : null}
              {toolbarFilters ? <div className="order-2 flex min-w-0 flex-wrap items-center justify-end gap-1.5 [&_button]:!rounded-[var(--md-radius-lg)]">{toolbarFilters}</div> : null}
              {toolbarOptions ? <div className="order-4 flex min-w-0 flex-wrap items-center justify-end gap-1.5">{toolbarOptions}</div> : null}
            </>
          )}
          {showColumnManager ? <div data-table-columns-control className="order-5 flex shrink-0">
          <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="group relative grid size-8 shrink-0 place-items-center rounded-[var(--md-radius-lg)] text-[var(--md-text)] transition-[background,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[var(--md-surface)] hover:text-[var(--md-ink)] hover:shadow-[var(--md-shadow-line)] active:scale-[0.96] motion-reduce:transform-none"
              aria-label={t(columnsButtonLabel ?? "Manage table columns")}
            >
              <Columns3 className="size-4" strokeWidth={1.4} aria-hidden="true" />
              {hasCustomLayout ? <span className="absolute end-0.5 top-0.5 size-1.5 rounded-full bg-[var(--md-accent)] shadow-[0_0_0_1px_var(--md-surface)]" aria-hidden="true" /> : null}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" sideOffset={6} className="w-[310px] gap-0 rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-1 shadow-[var(--md-shadow-popover)]">
            <div className="flex items-start justify-between gap-3 px-3 py-2.5">
              <div>
                <p className="text-[13px] font-medium text-[var(--md-ink)]">{t("Table columns")}</p>
                <p className="mt-0.5 text-[11px] leading-4 text-[var(--md-text)]">{t("Drag or use the arrow controls to reorder. Right-click a header for quick actions.")}</p>
              </div>
              <button type="button" onClick={resetLayout} className="grid size-7 place-items-center rounded-[var(--md-radius-md)] text-[var(--md-subtle)] transition-[background,color,transform] hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] active:scale-[0.96] motion-reduce:transform-none" aria-label={t("Reset columns")}>
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
                      <button type="button" disabled={orderedColumns.filter((candidate) => pinned.has(candidate.id) === isPinned)[0]?.id === column.id} onClick={() => moveColumnByStep(column.id, -1)} className="grid size-7 place-items-center rounded-[var(--md-radius-sm)] text-[var(--md-subtle)] opacity-0 transition-[background,color,opacity,transform] hover:bg-[var(--md-surface)] hover:text-[var(--md-ink)] focus-visible:opacity-100 group-hover:opacity-100 active:scale-[0.96] disabled:pointer-events-none disabled:opacity-20 motion-reduce:transform-none" aria-label={`${t("Move column earlier")}: ${t(column.label)}`}>
                        <ChevronUp className="size-3.5" strokeWidth={1.4} />
                      </button>
                      <button type="button" disabled={orderedColumns.filter((candidate) => pinned.has(candidate.id) === isPinned).at(-1)?.id === column.id} onClick={() => moveColumnByStep(column.id, 1)} className="grid size-7 place-items-center rounded-[var(--md-radius-sm)] text-[var(--md-subtle)] opacity-0 transition-[background,color,opacity,transform] hover:bg-[var(--md-surface)] hover:text-[var(--md-ink)] focus-visible:opacity-100 group-hover:opacity-100 active:scale-[0.96] disabled:pointer-events-none disabled:opacity-20 motion-reduce:transform-none" aria-label={`${t("Move column later")}: ${t(column.label)}`}>
                        <ChevronDown className="size-3.5" strokeWidth={1.4} />
                      </button>
                      <button type="button" disabled={column.canPin === false} onClick={() => togglePinned(column)} className={cn("grid size-7 place-items-center rounded-[var(--md-radius-sm)] transition-[background,color,transform] active:scale-[0.96] motion-reduce:transform-none", isPinned ? "bg-[var(--md-accent-a10)] text-[var(--md-accent)]" : "text-[var(--md-subtle)] hover:bg-[var(--md-surface)] hover:text-[var(--md-ink)]", column.canPin === false && "cursor-not-allowed opacity-25")} aria-label={`${t(isPinned ? "Unpin column" : "Pin column")}: ${t(column.label)}`}>
                        <MorphingIcon from={Pin} to={PinOff} active={isPinned} className="size-3.5" strokeWidth={1.4} />
                      </button>
                      <button type="button" disabled={column.canHide === false || (!isHidden && visibleColumns.length <= 1)} onClick={() => toggleHidden(column)} className={cn("grid size-7 place-items-center rounded-[var(--md-radius-sm)] transition-[background,color,transform] active:scale-[0.96] motion-reduce:transform-none", !isHidden ? "text-[var(--md-ink)]" : "text-[var(--md-subtle)]", (column.canHide === false || (!isHidden && visibleColumns.length <= 1)) ? "cursor-not-allowed opacity-25" : "hover:bg-[var(--md-surface)]")} aria-label={`${t(isHidden ? "Show column" : "Hide column")}: ${t(column.label)}`}>
                        <MorphingIcon from={Eye} to={EyeOff} active={isHidden} className="size-3.5" strokeWidth={1.4} />
                      </button>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>
          </PopoverContent>
          </Popover>
          </div> : null}
        </div> : null}
      </div> : null}
      {contentBeforeTable ? <div data-table-content-before className="mb-3">{contentBeforeTable}</div> : null}
      {!showToolbar && selectionMode ? <div className="mb-2 flex justify-end"><AnimatePresence initial={false}>{selectionControls}</AnimatePresence></div> : null}

      <div data-table-surface className={cn("overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)]", !showToolbar && "h-full")}>
      <Table aria-label={ariaLabel ? t(ariaLabel) : undefined} className={tableClassName} style={{ minWidth: minimumWidth }}>
        <TableHeader>
          <TableRow className="border-[var(--md-line)] bg-[var(--md-surface-soft)] hover:bg-[var(--md-surface-soft)]">
            {selectionMode ? (
              <TableHead
                data-table-selection-column
                style={{
                  width: selectionColumnWidth,
                  minWidth: selectionColumnWidth,
                  position: "sticky",
                  ...(direction === "rtl" ? { right: 0 } : { left: 0 }),
                }}
                className={cn("z-[5] bg-[var(--md-surface-soft)] p-0 text-center", direction === "rtl" ? "shadow-[-2px_0_0_var(--md-line)]" : "shadow-[2px_0_0_var(--md-line)]")}
              >
                <motion.div
                  initial={reduceMotion ? false : { opacity: 0, x: direction === "rtl" ? 8 : -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: reduceMotion ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }}
                  className="grid h-full min-h-10 place-items-center"
                >
                  <Checkbox
                    checked={allRowsSelected ? true : selectedRows.length ? "indeterminate" : false}
                    onCheckedChange={toggleAllRows}
                    aria-label={t(allRowsSelected ? "Deselect all rows" : "Select all rows")}
                    className="size-[18px] rounded-[var(--md-radius-xs)]"
                  />
                </motion.div>
              </TableHead>
            ) : null}
            {visibleColumns.map((column) => {
              const isPinned = stickyColumnsEnabled && pinned.has(column.id)
              return (
                <TableHead
                  key={`${column.id}:${isPinned ? "pinned" : "unpinned"}`}
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
                  className={cn("group/header relative z-[1] bg-[var(--md-surface-soft)] pe-3 text-[12px] font-medium text-[var(--md-text)] transition-[background,box-shadow,opacity] duration-200", columnAlignment(column), isPinned && "z-[3] bg-[var(--md-table-pinned-bg)]", isPinned && (direction === "rtl" ? "shadow-[-2px_0_0_var(--md-line)]" : "shadow-[2px_0_0_var(--md-line)]"), draggingId === column.id && "opacity-40", resizingId === column.id && "bg-[var(--md-surface-tint)]", column.headerClassName)}
                >
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <GripVertical className="size-3 -ms-1 text-[var(--md-subtle)] opacity-0 transition-opacity group-hover/header:opacity-70" strokeWidth={1.3} aria-hidden="true" />
                    {column.sortValue ? (
                      <button type="button" onClick={() => toggleSort(column)} className="inline-flex min-w-0 items-center gap-1.5 rounded-[var(--md-radius-xs)] text-start outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--md-accent)_24%,transparent)]" aria-label={`${t("Sort column")}: ${t(column.label)}`}>
                        <span className="truncate">{column.headerContent ?? t(column.label)}</span>
                        {sort?.id === column.id ? (sort.direction === "asc" ? <ArrowUp className="size-3 shrink-0 text-[var(--md-accent)]" strokeWidth={1.4} /> : <ArrowDown className="size-3 shrink-0 text-[var(--md-accent)]" strokeWidth={1.4} />) : <ArrowUpDown className="size-3 shrink-0 text-[var(--md-subtle)] opacity-55" strokeWidth={1.35} />}
                      </button>
                    ) : <span className="truncate">{column.headerContent ?? t(column.label)}</span>}
                    {isPinned ? <Pin className="size-3 text-[var(--md-accent)]" strokeWidth={1.3} aria-label={t("Pinned column")} /> : null}
                  </span>
                  {column.resizable ? (
                    <span
                      role="separator"
                      tabIndex={0}
                      aria-orientation="vertical"
                      aria-valuemin={column.minWidth ?? 84}
                      aria-valuemax={column.maxWidth ?? 480}
                      aria-valuenow={columnWidth(column)}
                      draggable={false}
                      className={cn("absolute inset-y-0 end-0 z-[5] w-2 cursor-col-resize touch-none outline-none after:absolute after:inset-y-0 after:start-1/2 after:w-px after:-translate-x-1/2 after:bg-[var(--md-accent)] after:opacity-0 after:transition-opacity hover:after:opacity-100 focus-visible:after:opacity-100", resizingId === column.id && "after:opacity-100")}
                      aria-label={`${t("Resize column")}: ${t(column.label)}`}
                      onPointerDown={(event) => startResize(column, event)}
                      onKeyDown={(event) => resizeColumnFromKeyboard(column, event)}
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
            const internallySelected = selectionKeys.has(rowKey)
            const isSelected = internallySelected || selectedRowKey === rowKey || selectedRowKeys?.has(rowKey) === true
            const isMuted = rowState?.(row) === "muted"
            const rowInteractionAllowed = isRowInteractive?.(row) ?? true
            const interactive = Boolean((onRowClick || onRowDoubleClick) && rowInteractionAllowed)
            const hasRowMenu = enableSelectionExport || Boolean(rowContextActions?.(row).length)
            const additionalRowProps = rowProps?.(row)
            const rowElement = (
              <TableRow
                key={rowKey}
                {...additionalRowProps}
                data-state={isSelected ? "selected" : undefined}
                data-row-state={isMuted ? "muted" : undefined}
                aria-selected={isSelected || undefined}
                aria-label={rowAriaLabel ? t(rowAriaLabel(row)) : additionalRowProps?.["aria-label"]}
                aria-haspopup={hasRowMenu ? "menu" : additionalRowProps?.["aria-haspopup"]}
                className={cn("border-[var(--md-line)] bg-[var(--md-surface)] hover:bg-[var(--md-hover)]", isMuted && "bg-[var(--md-surface-soft)] opacity-65", additionalRowProps?.className, typeof rowClassName === "function" ? rowClassName(row) : rowClassName, (interactive || hasRowMenu) && "outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color-mix(in_srgb,var(--md-accent)_30%,transparent)]", interactive && !selectionMode && "cursor-pointer", selectionMode && "cursor-default")}
                tabIndex={additionalRowProps?.tabIndex ?? (interactive || hasRowMenu ? 0 : undefined)}
                onClick={(event) => {
                  if (selectionMode && !(event.target as HTMLElement).closest("button, input, a, [role='button'], [role='checkbox'], [role='combobox']")) {
                    toggleSelection(row)
                    return
                  }
                  additionalRowProps?.onClick?.(event)
                  if (event.defaultPrevented) return
                  if (interactive && onRowClick) onRowClick(row)
                }}
                onDoubleClick={(event) => {
                  additionalRowProps?.onDoubleClick?.(event)
                  if (!event.defaultPrevented && !selectionMode && interactive && onRowDoubleClick) onRowDoubleClick(row)
                }}
                onContextMenu={(event) => {
                  additionalRowProps?.onContextMenu?.(event)
                  if (event.defaultPrevented || !hasRowMenu) return
                  event.preventDefault()
                  event.stopPropagation()
                  openRowContextMenuAt(row, event.clientX, event.clientY, event.currentTarget)
                }}
                onKeyDown={(event) => {
                  additionalRowProps?.onKeyDown?.(event)
                  if (event.defaultPrevented) return
                  if (hasRowMenu && (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10"))) {
                    event.preventDefault()
                    const rect = event.currentTarget.getBoundingClientRect()
                    openRowContextMenuAt(row, direction === "rtl" ? rect.right : rect.left + 24, rect.top + 28, event.currentTarget)
                    return
                  }
                  if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return
                  if (selectionMode) {
                    event.preventDefault()
                    toggleSelection(row)
                    return
                  }
                  if (interactive && onRowClick) {
                    event.preventDefault()
                    onRowClick(row)
                  }
                }}
              >
                {selectionMode ? (
                  <TableCell
                    data-table-selection-column
                    style={{
                      width: selectionColumnWidth,
                      minWidth: selectionColumnWidth,
                      position: "sticky",
                      ...(direction === "rtl" ? { right: 0 } : { left: 0 }),
                    }}
                    className={cn("z-[4] p-0 text-center", isSelected ? "bg-[var(--md-table-pinned-selected-bg)]" : "bg-[var(--md-table-pinned-bg)]", direction === "rtl" ? "shadow-[-2px_0_0_var(--md-line)]" : "shadow-[2px_0_0_var(--md-line)]")}
                  >
                    <motion.div
                      initial={reduceMotion ? false : { opacity: 0, x: direction === "rtl" ? 8 : -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: reduceMotion ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }}
                      className="grid min-h-11 place-items-center"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Checkbox
                        checked={internallySelected}
                        onCheckedChange={() => toggleSelection(row)}
                        aria-label={`${t(internallySelected ? "Deselect row" : "Select row")}: ${rowAriaLabel ? t(rowAriaLabel(row)) : rowKey}`}
                        className="size-[18px] rounded-[var(--md-radius-xs)]"
                      />
                    </motion.div>
                  </TableCell>
                ) : null}
                {visibleColumns.map((column) => {
                  const isPinned = stickyColumnsEnabled && pinned.has(column.id)
                  return (
                    <TableCell
                      // Recreate the cell when it crosses the sticky boundary. Chromium
                      // can otherwise keep the former sticky layer painted until hover.
                      key={`${column.id}:${isPinned ? "pinned" : "unpinned"}`}
                      style={{ width: columnWidth(column), minWidth: columnWidth(column), ...stickyStyle(column) }}
                      title={column.cellTitle?.(row)}
                      data-column-kind={column.kind}
                      className={cn(
                        "transition-[background,box-shadow,opacity] duration-200",
                        columnAlignment(column),
                        columnDataClass(column),
                        // The pinned colour is opaque. A backdrop filter here creates a
                        // separate Chromium compositor layer that can retain stale pixels
                        // after unpinning until every cell is hovered and repainted.
                        isPinned && "z-[2]",
                        isPinned && (direction === "rtl" ? "shadow-[-2px_0_0_var(--md-line)]" : "shadow-[2px_0_0_var(--md-line)]"),
                        isPinned && (isSelected ? "bg-[var(--md-table-pinned-selected-bg)]" : "bg-[var(--md-table-pinned-bg)]"),
                        column.cellClassName,
                      )}
                    >
                      {/* Every StatusPill rendered in a DataTable cell inherits the
                          filled table treatment, even if the column was classified
                          as text/custom by an older screen. */}
                      <TablePillKindContext.Provider value={column.kind === "attribute" ? "attribute" : "status"}>
                        {column.cell(row)}
                      </TablePillKindContext.Provider>
                    </TableCell>
                  )
                })}
              </TableRow>
            )
            return (
              <Fragment key={rowKey}>
                {wrapRow ? wrapRow(row, rowElement) : rowElement}
                {renderAfterRow?.(row, visibleColumns.length + (selectionMode ? 1 : 0))}
              </Fragment>
            )
          }) : (
            <TableRow className="h-[180px] border-[var(--md-line)] bg-[var(--md-surface)] hover:bg-transparent">
              <TableCell colSpan={visibleColumns.length + (selectionMode ? 1 : 0)} className="text-center">
                {emptyState ?? <p className="text-[13px] text-[var(--md-text)]">{t("No records to show")}</p>}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {pagination ? (
        <div className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-t border-[var(--md-line)] bg-[var(--md-surface-soft)] px-3 py-1.5">
          <p className="text-[11.5px] text-[var(--md-text)]" aria-live="polite">
            {t("Showing")} <span data-i18n-skip dir="ltr" className="font-medium tabular-nums text-[var(--md-ink)]">{pagination.total ? pagination.offset + 1 : 0}–{Math.min(pagination.offset + rows.length, pagination.total)}</span> {t("of")} <span data-i18n-skip dir="ltr" className="font-medium tabular-nums text-[var(--md-ink)]">{pagination.total}</span>
          </p>
          <div className="flex items-center gap-1" role="group" aria-label={t("Table pages")}>
            <button
              type="button"
              disabled={pagination.loading || pagination.offset <= 0}
              onClick={() => pagination.onOffsetChange(Math.max(0, pagination.offset - pagination.limit))}
              className="grid size-8 place-items-center rounded-[var(--md-radius-md)] text-[var(--md-text)] outline-none transition-[background,color,opacity,transform] hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a20)] active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-30 motion-reduce:transform-none"
              aria-label={t("Previous page")}
              title={t("Previous page")}
            >
              <ChevronLeft className="size-3.5 rtl:rotate-180" strokeWidth={1.5} aria-hidden="true" />
            </button>
            <button
              type="button"
              disabled={pagination.loading || pagination.offset + rows.length >= pagination.total}
              onClick={() => pagination.onOffsetChange(pagination.offset + pagination.limit)}
              className="grid size-8 place-items-center rounded-[var(--md-radius-md)] text-[var(--md-text)] outline-none transition-[background,color,opacity,transform] hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a20)] active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-30 motion-reduce:transform-none"
              aria-label={t("Next page")}
              title={t("Next page")}
            >
              <ChevronRight className="size-3.5 rtl:rotate-180" strokeWidth={1.5} aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}
      </div>
      {typeof document !== "undefined" ? createPortal(
        <AnimatePresence>
          {contextMenu && contextColumn ? (
            <motion.div
              ref={contextMenuRef}
              role="menu"
              aria-label={`${t("Column actions")}: ${t(contextColumn.label)}`}
              dir={direction}
              initial={reduceMotion ? false : { opacity: 0, scale: 0.96, y: -5, filter: "blur(6px)" }}
              animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: -3, filter: "blur(3px)" }}
              transition={{ duration: reduceMotion ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="premium-stroke fixed z-[120] w-[252px] overflow-hidden rounded-[var(--md-radius-xl)] bg-[color-mix(in_srgb,var(--md-surface)_96%,transparent)] p-1.5 text-start shadow-[var(--md-shadow-popover)] backdrop-blur-xl"
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
                    <span className={cn("grid size-7 shrink-0 place-items-center rounded-[var(--md-radius-sm)] bg-[var(--md-surface-soft)] text-[var(--md-subtle)] shadow-[var(--md-shadow-line)] transition-colors group-hover:text-[var(--md-ink)]", item.active && "bg-[color-mix(in_srgb,var(--md-accent)_12%,var(--md-surface))] text-[var(--md-accent)]")}>
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
                    <span className={cn("grid size-7 shrink-0 place-items-center rounded-[var(--md-radius-sm)] bg-[var(--md-surface-soft)] text-[var(--md-subtle)] shadow-[var(--md-shadow-line)] transition-colors group-hover:text-[var(--md-ink)]", item.active && "bg-[color-mix(in_srgb,var(--md-accent)_12%,var(--md-surface))] text-[var(--md-accent)]")}>
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
      {typeof document !== "undefined" ? createPortal(
        <AnimatePresence>
          {rowContextMenu ? (
            <motion.div
              ref={rowContextMenuRef}
              role="menu"
              aria-label={`${t("Row actions")}: ${t(contextRowLabel)}`}
              dir={direction}
              initial={reduceMotion ? false : { opacity: 0, scale: 0.9, filter: "blur(5px)" }}
              animate={reduceMotion ? { opacity: 1 } : {
                opacity: [0, 1, 1],
                scale: [0.9, 1.014, 1],
                filter: ["blur(5px)", "blur(0px)", "blur(0px)"],
              }}
              exit={reduceMotion ? { opacity: 0 } : {
                opacity: 0,
                scale: 0.972,
                transition: { duration: 0.11, ease: [0.55, 0, 1, 0.45] },
              }}
              transition={{ duration: reduceMotion ? 0 : 0.28, times: [0, 0.52, 1], ease: [0.19, 1, 0.22, 1] }}
              className="premium-stroke fixed z-[120] w-[252px] overflow-hidden rounded-[var(--md-radius-xl)] bg-[color-mix(in_srgb,var(--md-surface)_96%,transparent)] p-1 text-start shadow-[var(--md-shadow-lift)] backdrop-blur-xl"
              style={{
                left: rowContextMenu.x,
                top: rowContextMenu.y,
                transformOrigin: direction === "rtl" ? "top right" : "top left",
              }}
              onKeyDown={(event) => {
                if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return
                const buttons = [...(rowContextMenuRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
                if (!buttons.length) return
                event.preventDefault()
                const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement)
                const nextIndex = event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? buttons.length - 1
                    : event.key === "ArrowDown"
                      ? (currentIndex + 1 + buttons.length) % buttons.length
                      : (currentIndex - 1 + buttons.length) % buttons.length
                buttons[nextIndex]?.focus()
              }}
            >
              {enableSelectionExport ? (
                <motion.button
                  type="button"
                  role="menuitem"
                  initial={reduceMotion ? false : { opacity: 0, y: -5, scale: 0.988 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: reduceMotion ? 0 : 0.26, delay: reduceMotion ? 0 : rowMenuItemDelay(0), ease: [0.16, 1, 0.3, 1] }}
                  onClick={() => {
                    selectFromContextMenu(rowContextMenu.row)
                    setRowContextMenu(null)
                  }}
                  className={cn("group flex h-9 w-full items-center gap-2.5 rounded-[var(--md-radius-lg)] px-2 text-[13px] font-medium outline-none transition-[background,color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[var(--md-hover)] focus-visible:bg-[var(--md-hover)]", contextRowSelected ? "text-[var(--md-accent)]" : "text-[var(--md-text)]")}
                >
                  <span className={cn("grid size-5 shrink-0 place-items-center text-[var(--md-subtle)] transition-[color,transform] duration-150 group-hover:text-[var(--md-accent)]", contextRowSelected && "text-[var(--md-accent)]")}>
                    <SquareCheck className="size-4" strokeWidth={1.3} />
                  </span>
                  <span className="min-w-0 flex-1 text-start">{t(selectionMode && contextRowSelected ? "Deselect row" : "Select")}</span>
                  <span className="shrink-0 text-[11px] font-normal text-[var(--md-subtle)]">{t(selectionMode ? (contextRowSelected ? "Remove" : "Add") : "Multiple rows")}</span>
                </motion.button>
              ) : null}

              {enableSelectionExport && contextRowActions.length ? <div className="my-1 h-px bg-[var(--md-line)]" /> : null}

              {contextRowActions.map((item, index) => {
                const Icon = item.icon
                const destructive = item.tone === "destructive"
                return (
                  <motion.button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    disabled={item.disabled}
                    initial={reduceMotion ? false : { opacity: 0, y: -5, scale: 0.988 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: reduceMotion ? 0 : 0.26, delay: reduceMotion ? 0 : rowMenuItemDelay(index + (enableSelectionExport ? 1 : 0)), ease: [0.16, 1, 0.3, 1] }}
                    onClick={() => {
                      item.onSelect(rowContextMenu.row)
                      setRowContextMenu(null)
                    }}
                    className={cn("group flex h-9 w-full items-center gap-2.5 rounded-[var(--md-radius-lg)] px-2 text-[13px] font-medium text-[var(--md-text)] outline-none transition-[background,color,opacity] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] focus-visible:bg-[var(--md-hover)] disabled:cursor-not-allowed disabled:opacity-35", destructive && "hover:bg-[color-mix(in_srgb,var(--md-red)_9%,transparent)] hover:text-[var(--md-red)] focus-visible:bg-[color-mix(in_srgb,var(--md-red)_9%,transparent)] focus-visible:text-[var(--md-red)]")}
                  >
                    <span className={cn("grid size-5 shrink-0 place-items-center text-[var(--md-subtle)] transition-[color,transform] duration-150 group-hover:text-[var(--md-accent)]", destructive && "group-hover:text-[var(--md-red)]")}>
                      <Icon className="size-4" strokeWidth={1.3} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-start">{t(item.label)}</span>
                    {item.hint ? <span className="shrink-0 text-[11px] font-normal text-[var(--md-subtle)]">{t(item.hint)}</span> : null}
                  </motion.button>
                )
              })}
            </motion.div>
          ) : null}
        </AnimatePresence>,
        document.body,
      ) : null}
      <TableCsvExportDialog
        open={exportOpen}
        onOpenChange={(open) => {
          setExportOpen(open)
          if (!open) {
            exportRequestId.current += 1
            setExportLoading(false)
          }
        }}
        sources={exportSources}
        fields={exportFields}
        fileName={resolvedExportFileName}
        loading={exportLoading}
        error={exportError}
        onRetry={() => void loadExportSources(exportSources.map((source) => source.row))}
        onDownloaded={exitSelectionMode}
      />
      <Dialog open={bulkDeleteOpen} onOpenChange={(open) => { if (!bulkDeleting) { setBulkDeleteOpen(open); if (!open) setBulkDeleteError(null) } }}>
        <DialogContent className="border-0 bg-[var(--md-surface)] text-[var(--md-ink)] shadow-[var(--md-shadow-lift)] sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>{t(bulkDelete?.title ?? "Delete selected rows?")}</DialogTitle>
            <DialogDescription>
              {bulkDelete?.description?.(selectedRows) ?? t("This permanently deletes every selected row. This action cannot be undone.")}
            </DialogDescription>
          </DialogHeader>
          {bulkDeleteError ? <p role="alert" className="rounded-[var(--md-radius-lg)] bg-[color-mix(in_srgb,var(--md-red)_9%,transparent)] px-3 py-2.5 text-[12px] leading-5 text-[var(--md-red)]">{t(bulkDeleteError)}</p> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={bulkDeleting} onClick={() => setBulkDeleteOpen(false)}>{t("Cancel")}</Button>
            <Button type="button" disabled={!selectedRowsCanDelete || bulkDeleting} className="bg-[var(--md-red)] text-white hover:opacity-90" onClick={() => void confirmBulkDelete()}>
              {bulkDeleting ? <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Trash2 className="size-3.5" strokeWidth={1.4} aria-hidden="true" />}
              {t(bulkDeleting ? "Deleting selected rows" : bulkDelete?.confirmLabel ?? "Delete selected rows")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
