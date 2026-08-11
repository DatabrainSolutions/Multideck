import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { motion, useReducedMotion } from "motion/react"
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpFromLine,
  CheckCircle2,
  Download,
  FileArchive,
  FileImage,
  FileText,
  Loader2,
  Mail,
  Upload,
  XCircle,
} from "@/components/icons/hugeicons"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { DotGridLoaderPanel } from "@/components/multideck/dot-grid-loader"
import { MultideckDatePicker } from "@/components/multideck/date-picker"
import { StatusPill } from "@/components/multideck/status-pill"
import { Surface } from "@/components/multideck/surface"
import { WarehouseFormField } from "@/components/multideck/warehouse-management-components"
import { useLanguage } from "@/i18n/language-provider"
import { mdMotion, staggerRamp } from "@/lib/motion"
import { cn } from "@/lib/utils"
import {
  WarehouseApiError,
  cancelOperationalWarehouseOrder,
  dispatchOperationalWarehouseOrder,
  downloadWarehouseOrderDocument,
  getWarehouseOrderReference,
  listOperationalWarehouseOrders,
  listWarehouseInventory,
  listWarehouseOrderDocuments,
  receiveOperationalWarehouseOrder,
  reviewWarehouseOrderDocument,
  uploadWarehouseOrderDocument,
  type DispatchWarehouseOrderInput,
  type ReceiveWarehouseOrderInput,
  type WarehouseInventoryBalance,
  type WarehouseOperationalOrder,
  type WarehouseOrderDocument,
  type WarehouseOrderLine,
  type WarehouseOrderReference,
} from "@/lib/warehouse"

const controlClass = "!h-9 !w-full rounded-[var(--md-radius-md)] border-0 bg-[var(--md-surface-soft)] !px-2.5 !text-[12.5px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] active:!scale-100 focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]"
const automaticValue = "__auto__"
const maxOrderDocumentBytes = 25 * 1024 * 1024

type PostingRow = {
  orderLineId: string
  quantity: string
  damagedQuantity: string
  missingQuantity: string
  locationId: string
  lotId: string
  lotNumber: string
  batchNumber: string
  manufactureDate: string
  expiryDate: string
}

/**
 * The milestones an order passes, named for its direction. Which one is lit comes
 * from how much of the order has actually been posted, not from a status string:
 * the quantity is the fact, and the stage is what that quantity has crossed.
 */
const orderStages = {
  inbound: ["Booked in", "Receiving", "Received"],
  outbound: ["Placed", "Picking", "Dispatched"],
} as const

/**
 * The order's own address. Lower-cased because it is typed and shared by people:
 * `/warehouse/orders/in-dem-260810` reads better in a message than the raw code,
 * and the page matches the number case-insensitively when it loads.
 */
export function orderDetailPath(order: { orderNumber: string }) {
  return `/warehouse/orders/${encodeURIComponent(order.orderNumber.toLowerCase())}`
}

/** Matches `/warehouse/orders/<number>` and hands back the number. */
export function warehouseOrderDetailNumber(route: string) {
  const match = /^\/warehouse\/orders\/([^/]+)$/.exec(route)
  return match ? decodeURIComponent(match[1]) : null
}

function message(error: unknown) {
  return error instanceof WarehouseApiError ? error.message : error instanceof Error ? error.message : String(error)
}

function statusTone(status: string): "green" | "amber" | "red" | "blue" | "teal" | "neutral" {
  if (["complete", "received", "dispatched", "available"].includes(status)) return "green"
  if (["cancelled", "blocked", "damaged"].includes(status)) return "red"
  if (["booked", "planned", "part_complete"].includes(status)) return "amber"
  if (["in_progress", "picked", "packed"].includes(status)) return "blue"
  return "neutral"
}

function documentKind(orderDocument: WarehouseOrderDocument) {
  const name = (orderDocument.fileName ?? orderDocument.title).toLowerCase()
  const mimeType = orderDocument.mimeType?.toLowerCase() ?? ""
  if (mimeType === "message/rfc822" || mimeType === "application/vnd.ms-outlook" || /\.(eml|msg)$/.test(name)) return "email"
  if (mimeType.startsWith("image/")) return "image"
  if (/\.(zip|rar|7z|tar|gz)$/.test(name)) return "archive"
  return "file"
}

function documentSize(bytes: number | null) {
  if (bytes === null) return null
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function Code({ children }: { children: ReactNode }) {
  return <span data-i18n-skip dir="ltr" className="font-medium tabular-nums text-[var(--md-ink)]">{children}</span>
}

/** A page section. One shell for every block, so the page scans at one rhythm. */
function OrderSection({ index, title, meta, action, children }: { index: number; title: string; meta?: string; action?: ReactNode; children: ReactNode }) {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()

  return (
    <motion.section
      initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={shouldReduceMotion ? { duration: 0 } : { ...mdMotion.enter, delay: staggerRamp(index, 0.05) }}
      className="overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 shadow-[var(--md-stroke-bottom)]">
        <div className="min-w-0">
          <h2 className="text-[13px] font-medium leading-4 text-[var(--md-ink)]">{t(title)}</h2>
          {meta ? <p className="mt-0.5 text-[11.5px] leading-4 text-[var(--md-text)]">{t(meta)}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="p-4">{children}</div>
    </motion.section>
  )
}

/**
 * The order's journey and its one governing figure, side by side. The fill is the
 * quantity actually posted and the nodes are the milestones it has crossed, so a
 * part-received order reads as part-received rather than as a status word.
 *
 * The fill scales rather than resizing, so a long bar redrawing costs one
 * composited frame instead of a layout pass.
 */
function OrderProgressRail({ order, progress }: { order: WarehouseOperationalOrder; progress: number }) {
  const { direction, t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const stages = orderStages[order.typeCode]
  const cancelled = order.statusCode === "cancelled"
  const reached = cancelled ? -1 : progress >= 1 ? 2 : progress > 0 ? 1 : 0

  return (
    <div className="grid gap-4 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6">
      <div className="min-w-0">
        <div className="relative h-1.5 rounded-full bg-[var(--md-surface-tint)] shadow-[inset_0_0_0_1px_rgba(11,20,19,0.05)]">
          <motion.span
            aria-hidden="true"
            className={cn("absolute inset-y-0 start-0 w-full rounded-full", cancelled ? "bg-[var(--md-red)]" : "bg-[var(--md-accent)]")}
            style={{ transformOrigin: direction === "rtl" ? "right center" : "left center" }}
            initial={shouldReduceMotion ? { scaleX: cancelled ? 1 : progress } : { scaleX: 0 }}
            animate={{ scaleX: cancelled ? 1 : Math.max(progress, 0.015) }}
            transition={shouldReduceMotion ? { duration: 0 } : mdMotion.morph}
          />
        </div>
        <ol className="mt-2.5 flex items-center justify-between gap-2">
          {stages.map((stage, index) => (
            <li
              key={stage}
              className={cn(
                "flex min-w-0 items-center gap-1.5 text-[11.5px] leading-4",
                index === 0 ? "justify-start" : index === stages.length - 1 ? "justify-end" : "justify-center",
                index <= reached ? "font-medium text-[var(--md-ink)]" : "text-[var(--md-subtle)]",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "size-1.5 shrink-0 rounded-full transition-colors duration-300",
                  cancelled ? "bg-[var(--md-red)]" : index <= reached ? "bg-[var(--md-accent)]" : "bg-[var(--md-line)]",
                )}
              />
              <span className="truncate">{t(cancelled && index === 0 ? "Cancelled" : stage)}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="sm:text-end">
        <p dir="ltr" className="text-[24px] font-medium leading-none tracking-[-0.02em] tabular-nums text-[var(--md-ink)]">
          {order.lines.reduce((total, line) => total + (order.typeCode === "inbound" ? line.receivedQuantity : line.dispatchedQuantity), 0)}
          <span className="text-[var(--md-subtle)]"> / </span>
          {order.lines.reduce((total, line) => total + line.orderedQuantity, 0)}
        </p>
        <p className="mt-1 text-[11.5px] leading-4 text-[var(--md-text)]">
          {t(order.typeCode === "inbound" ? "received" : "dispatched")}
          {order.lines[0]?.uomCode ? <span data-i18n-skip dir="ltr"> · {order.lines[0].uomCode}</span> : null}
        </p>
      </div>
    </div>
  )
}

/**
 * One ordered item. The bar makes "how much is left" readable without doing the
 * arithmetic, and the figures stay tabular so a list of lines lines up.
 */
function OrderLineRow({ line, order, index }: { line: WarehouseOrderLine; order: WarehouseOperationalOrder; index: number }) {
  const { language, t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const number = useMemo(() => new Intl.NumberFormat(language, { maximumFractionDigits: 3 }), [language])
  const done = order.typeCode === "inbound" ? line.receivedQuantity : line.dispatchedQuantity
  const fill = line.orderedQuantity > 0 ? Math.max(0, Math.min(1, done / line.orderedQuantity)) : 0

  return (
    <motion.div
      initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={shouldReduceMotion ? { duration: 0 } : { ...mdMotion.enter, delay: staggerRamp(index, 0.03) }}
      className="grid gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4"
    >
      <div className="min-w-0">
        <p className="text-[12.5px]"><Code>{line.sku}</Code></p>
        <p className="mt-0.5 truncate text-[11.5px] leading-4 text-[var(--md-text)]" dir="auto">{line.description}</p>
        <div className="mt-2 h-1 max-w-[280px] rounded-full bg-[var(--md-surface-tint)]">
          <motion.span
            aria-hidden="true"
            className={cn("block h-full origin-left rounded-full", fill >= 1 ? "bg-[var(--md-green)]" : "bg-[var(--md-accent)]")}
            initial={shouldReduceMotion ? { scaleX: fill } : { scaleX: 0 }}
            animate={{ scaleX: fill }}
            transition={shouldReduceMotion ? { duration: 0 } : { ...mdMotion.morph, delay: staggerRamp(index, 0.03) }}
            style={{ width: "100%" }}
          />
        </div>
      </div>
      <div className="sm:text-end">
        <p dir="ltr" className="text-[12.5px] font-medium tabular-nums text-[var(--md-ink)]">
          {number.format(done)}<span className="text-[var(--md-subtle)]"> / </span>{number.format(line.orderedQuantity)} <span className="font-normal text-[var(--md-text)]">{line.uomCode}</span>
        </p>
        <p className="mt-1 text-[11px] leading-4 text-[var(--md-subtle)]">
          {line.remainingQuantity > 0
            ? `${number.format(line.remainingQuantity)} ${t(order.typeCode === "inbound" ? "still to receive" : "still to pick")}`
            : t("Line complete")}
        </p>
      </div>
    </motion.div>
  )
}

/** Label beside value, hairline separated. Used for the order's fixed facts. */
function OrderFact({ label, value, code }: { label: string; value: string | null; code?: boolean }) {
  const { t } = useLanguage()
  if (!value) return null

  return (
    <div className="grid grid-cols-[84px_minmax(0,1fr)] items-baseline gap-3 py-[7px] first:pt-0 last:pb-0">
      <dt className="text-[11.5px] leading-4 text-[var(--md-text)]">{t(label)}</dt>
      <dd title={value} data-i18n-skip={code ? true : undefined} dir={code ? "ltr" : "auto"} className={cn("min-w-0 truncate text-[12.5px] font-medium leading-4 text-[var(--md-ink)]", code && "tabular-nums")}>{value}</dd>
    </div>
  )
}

/**
 * A warehouse order on its own screen rather than inside a dialog. An operator
 * receiving a delivery is reading a paper docket, counting pallets and typing
 * quantities at the same time — that work needs the whole window, a URL a
 * supervisor can be sent, and a back button to the queue it came from.
 */
export function WarehouseOrderDetailView({
  orderNumber,
  backTo,
  backLabel,
  navigate,
  canOperate = true,
  canCancel = true,
  canUpload = true,
}: {
  orderNumber: string
  backTo: string
  backLabel: string
  navigate?: (path: string) => void
  canOperate?: boolean
  canCancel?: boolean
  canUpload?: boolean
}) {
  const { language, t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const dateOnly = useMemo(() => new Intl.DateTimeFormat(language, { dateStyle: "medium" }), [language])
  const dateTime = useMemo(() => new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }), [language])
  const [order, setOrder] = useState<WarehouseOperationalOrder | null>(null)
  const [reference, setReference] = useState<WarehouseOrderReference | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [rows, setRows] = useState<PostingRow[]>([])
  const [stock, setStock] = useState<WarehouseInventoryBalance[]>([])
  const [notes, setNotes] = useState("")
  const [vehicleReg, setVehicleReg] = useState("")
  const [containerNumber, setContainerNumber] = useState("")
  const [sealNumber, setSealNumber] = useState("")
  const [receivingObjectType, setReceivingObjectType] = useState("loose")
  const [receivingObjectCode, setReceivingObjectCode] = useState("")
  const [documents, setDocuments] = useState<WarehouseOrderDocument[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The posting form is seeded from the order once. Reseeding on every refresh
  // would wipe quantities an operator had already typed.
  const seededOrderRef = useRef<string | null>(null)

  const load = useCallback(async function load() {
    try {
      const matches = await listOperationalWarehouseOrders({ search: orderNumber })
      const found = matches.find((candidate) => candidate.orderNumber.toLowerCase() === orderNumber.toLowerCase()) ?? null
      if (!found) {
        setLoadError(t("This order number does not match any warehouse order."))
        return
      }
      setOrder(found)
      setLoadError(null)
    } catch (cause) {
      setLoadError(message(cause))
    }
  }, [orderNumber, t])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    let live = true
    getWarehouseOrderReference().then((value) => { if (live) setReference(value) }).catch(() => undefined)
    return () => { live = false }
  }, [])

  useEffect(() => {
    if (!order || seededOrderRef.current === order.id) return
    seededOrderRef.current = order.id
    setRows(order.lines.filter((line) => line.remainingQuantity > 0).map((line) => ({
      orderLineId: line.id,
      quantity: String(line.remainingQuantity),
      damagedQuantity: "0",
      missingQuantity: "0",
      locationId: (order.typeCode === "inbound" ? line.targetLocationId : line.sourceLocationId) ?? "",
      lotId: "",
      lotNumber: line.lotNumber ?? "",
      batchNumber: line.lotNumber ?? "",
      manufactureDate: "",
      expiryDate: line.expiryDate ?? "",
    })))
    setVehicleReg(order.vehicleReg ?? "")
    setContainerNumber(order.containerNumber ?? "")
    setSealNumber(order.sealNumber ?? "")
    setNotes("")
    setError(null)
  }, [order])

  const orderId = order?.id
  const facilityId = order?.facilityId
  const isOutbound = order?.typeCode === "outbound"

  useEffect(() => {
    if (!orderId) return
    let live = true
    listWarehouseOrderDocuments(orderId).then((value) => { if (live) setDocuments(value) }).catch(() => { if (live) setDocuments([]) })
    return () => { live = false }
  }, [orderId])

  useEffect(() => {
    if (!isOutbound || !facilityId) return
    let live = true
    listWarehouseInventory({ facilityId }).then((value) => { if (live) setStock(value) }).catch(() => { if (live) setStock([]) })
    return () => { live = false }
  }, [isOutbound, facilityId])

  function goBack() {
    navigate?.(backTo)
  }

  function patchRow(lineId: string, patch: Partial<PostingRow>) {
    setRows((current) => current.map((row) => row.orderLineId === lineId ? { ...row, ...patch } : row))
  }

  async function post() {
    if (!order) return
    setSaving(true); setError(null)
    try {
      if (order.typeCode === "inbound") {
        const input: ReceiveWarehouseOrderInput = {
          requestId: crypto.randomUUID(),
          receivingLocationId: null,
          handlingUnitId: null,
          newHandlingUnit: receivingObjectType === "loose" ? null : { typeCode: receivingObjectType, code: receivingObjectCode.trim() || null, sscc: null, externalReference: null },
          notes: notes.trim() || null,
          lines: rows.map((row) => ({
            orderLineId: row.orderLineId,
            quantity: Number(row.quantity),
            damagedQuantity: Number(row.damagedQuantity),
            missingQuantity: Number(row.missingQuantity),
            targetLocationId: row.locationId || null,
            lotNumber: row.lotNumber.trim() || null,
            batchNumber: row.batchNumber.trim() || null,
            manufactureDate: row.manufactureDate || null,
            expiryDate: row.expiryDate || null,
          })),
        }
        await receiveOperationalWarehouseOrder(order.id, input)
        toast.success(t("Goods received and stock updated"))
      } else {
        const input: DispatchWarehouseOrderInput = {
          vehicleReg: vehicleReg.trim() || null,
          containerNumber: containerNumber.trim() || null,
          sealNumber: sealNumber.trim() || null,
          notes: notes.trim() || null,
          lines: rows.map((row) => ({ orderLineId: row.orderLineId, quantity: Number(row.quantity), sourceLocationId: row.locationId || null, lotId: row.lotId || null })),
        }
        await dispatchOperationalWarehouseOrder(order.id, input)
        toast.success(t("Goods dispatched and stock updated"))
      }
      seededOrderRef.current = null
      await load()
    } catch (cause) {
      setError(message(cause))
    } finally {
      setSaving(false)
    }
  }

  async function cancelOrder() {
    if (!order) return
    setSaving(true); setError(null)
    try {
      await cancelOperationalWarehouseOrder(order.id)
      toast.success(t("Warehouse order cancelled"))
      seededOrderRef.current = null
      await load()
    } catch (cause) {
      setError(message(cause))
    } finally {
      setSaving(false)
    }
  }

  async function upload(fileList: FileList | null) {
    const files = Array.from(fileList ?? [])
    if (!files.length || !order) return
    setUploading(true); setError(null)
    try {
      const oversized = files.filter((file) => file.size > maxOrderDocumentBytes)
      let uploaded = 0
      let failed = oversized.length
      for (const file of files.filter((candidate) => candidate.size <= maxOrderDocumentBytes)) {
        try { await uploadWarehouseOrderDocument(order.id, file); uploaded += 1 } catch { failed += 1 }
      }
      setDocuments(await listWarehouseOrderDocuments(order.id))
      if (uploaded) toast.success(t(uploaded === 1 ? "File added to this order" : "Files added to this order"))
      if (failed) setError(t("Some files could not be added. Keep each file under 25 MB."))
    } catch (cause) {
      setError(message(cause))
    } finally {
      setUploading(false)
    }
  }

  async function review(documentId: string, statusCode: "accepted" | "rejected") {
    if (!order) return
    setSaving(true); setError(null)
    try {
      await reviewWarehouseOrderDocument(order.id, documentId, statusCode)
      setDocuments(await listWarehouseOrderDocuments(order.id))
      toast.success(t(statusCode === "accepted" ? "Document accepted" : "Document rejected"))
    } catch (cause) {
      setError(message(cause))
    } finally {
      setSaving(false)
    }
  }

  const backButton = (
    <button
      type="button"
      onClick={goBack}
      className="group inline-flex h-8 items-center gap-1.5 rounded-[var(--md-radius-md)] px-2 -ms-2 text-[12.5px] font-medium text-[var(--md-text)] outline-none transition-[background,color] duration-200 hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] focus-visible:bg-[var(--md-hover)] focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a24)]"
    >
      {/* The arrow leads the way back by 2px on hover, so the control reads as a
          direction rather than as a decorated word. */}
      <ArrowLeft className="size-3.5 transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-translate-x-0.5 rtl:rotate-180 rtl:group-hover:translate-x-0.5 motion-reduce:transform-none" strokeWidth={1.5} />
      {t(backLabel)}
    </button>
  )

  if (loadError) {
    return (
      <div className="grid gap-4">
        {backButton}
        <Surface padding="lg" className="grid min-h-[240px] place-items-center rounded-[var(--md-radius-xl)] text-center" role="alert">
          <div className="max-w-md">
            <p className="text-[15px] font-medium text-[var(--md-ink)]">{t("Order not found")}</p>
            <p className="mt-2 text-[13px] leading-5 text-[var(--md-text)]">{loadError}</p>
            <Button type="button" variant="outline" className="mt-4 rounded-[var(--md-radius-lg)]" onClick={goBack}>{t(backLabel)}</Button>
          </div>
        </Surface>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="grid gap-4">
        {backButton}
        <Surface padding="lg" className="grid min-h-[240px] place-items-center rounded-[var(--md-radius-xl)]">
          <DotGridLoaderPanel label="Loading order" minHeight={0} />
        </Surface>
      </div>
    )
  }

  const ordered = order.lines.reduce((total, line) => total + line.orderedQuantity, 0)
  const done = order.lines.reduce((total, line) => total + (order.typeCode === "inbound" ? line.receivedQuantity : line.dispatchedQuantity), 0)
  const progress = ordered > 0 ? Math.max(0, Math.min(1, done / ordered)) : 0
  const final = ["complete", "cancelled"].includes(order.statusCode)
  const locations = reference?.locations.filter((location) => location.facilityId === order.facilityId) ?? []
  const canPost = canOperate && !final && rows.length > 0
  const postBlocked = rows.some((row) => order.typeCode === "inbound"
    ? Number(row.quantity) + Number(row.missingQuantity) <= 0 || (Number(row.quantity) > 0 && !row.locationId)
    : Number(row.quantity) <= 0)
  const canCancelNow = canCancel && !final && !order.lines.some((line) => line.receivedQuantity > 0 || line.dispatchedQuantity > 0)

  return (
    <div className="grid gap-[var(--md-gap-lg)]">
      <motion.header
        initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={shouldReduceMotion ? { duration: 0 } : mdMotion.enter}
        className="grid gap-3"
      >
        {backButton}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 data-i18n-skip dir="ltr" className="text-[24px] font-medium leading-none tracking-[-0.015em] tabular-nums text-[var(--md-ink)]">{order.orderNumber}</h1>
              <StatusPill tone={statusTone(order.statusCode)}>{t(order.statusName ?? order.statusCode)}</StatusPill>
            </div>
            <p className="mt-1.5 text-[13px] leading-5 text-[var(--md-text)]">
              <span dir="auto">{order.customerName}</span>
              <span className="text-[var(--md-subtle)]"> · </span>
              <span dir="auto">{order.facilityName}</span>
              <span className="text-[var(--md-subtle)]"> · </span>
              {t(order.typeName ?? order.typeCode)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canCancelNow ? (
              <Button type="button" variant="ghost" disabled={saving} onClick={() => void cancelOrder()} className="h-9 rounded-[var(--md-radius-lg)] text-[13px] text-[var(--md-red)] hover:bg-[rgba(209,78,78,0.08)]">
                <XCircle data-icon="inline-start" className="size-4" strokeWidth={1.4} />
                {t("Cancel order")}
              </Button>
            ) : null}
            {canPost ? (
              <Button
                type="button"
                disabled={saving || postBlocked}
                onClick={() => void post()}
                className="h-9 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-3.5 text-[13px] font-medium text-[var(--md-accent-ink)] shadow-[0_10px_22px_var(--md-accent-a14)] transition-[background-color,box-shadow,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)] active:scale-[0.97] motion-reduce:transform-none"
              >
                {saving ? <Loader2 data-icon="inline-start" className="size-4 animate-spin" strokeWidth={1.6} /> : order.typeCode === "inbound" ? <ArrowDownToLine data-icon="inline-start" className="size-4" strokeWidth={1.4} /> : <ArrowUpFromLine data-icon="inline-start" className="size-4" strokeWidth={1.4} />}
                {t(order.typeCode === "inbound" ? "Receive goods" : "Dispatch goods")}
              </Button>
            ) : null}
          </div>
        </div>
      </motion.header>

      {error ? (
        <motion.div
          role="alert"
          initial={shouldReduceMotion ? false : { opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={shouldReduceMotion ? { duration: 0 } : mdMotion.fast}
          className="rounded-[var(--md-radius-lg)] bg-[rgba(209,78,78,0.08)] px-4 py-3 text-[12.5px] leading-5 text-[var(--md-red)]"
        >
          {error}
        </motion.div>
      ) : null}

      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={shouldReduceMotion ? { duration: 0 } : { ...mdMotion.enter, delay: 0.04 }}
        className="overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)]"
      >
        <OrderProgressRail order={order} progress={progress} />
      </motion.div>

      <div className="grid gap-[var(--md-gap-lg)] xl:grid-cols-[minmax(0,1.7fr)_minmax(300px,1fr)] xl:items-start">
        <div className="grid gap-[var(--md-gap-lg)]">
          <OrderSection index={0} title="Items" meta={order.lines.length === 1 ? "One line on this order." : `${order.lines.length} lines on this order.`}>
            <div className="divide-y divide-[var(--md-line)]">
              {order.lines.map((line, index) => <OrderLineRow key={line.id} line={line} order={order} index={index} />)}
            </div>
          </OrderSection>

          {canPost ? (
            <OrderSection
              index={1}
              title={order.typeCode === "inbound" ? "Post the receipt" : "Post the dispatch"}
              meta="Quantities post straight to the inventory ledger and to current balances."
            >
              <div className="grid gap-4">
                {order.typeCode === "inbound" ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <WarehouseFormField label={t("Receive stock as")}>
                      <Select value={receivingObjectType} onValueChange={setReceivingObjectType}>
                        <SelectTrigger className={controlClass}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="loose">{t("Loose stock")}</SelectItem>
                          <SelectItem value="pallet">{t("New pallet")}</SelectItem>
                          <SelectItem value="ibc">{t("New IBC")}</SelectItem>
                          <SelectItem value="carton">{t("New carton")}</SelectItem>
                          <SelectItem value="drum">{t("New drum")}</SelectItem>
                          <SelectItem value="tote">{t("New tote")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </WarehouseFormField>
                    {receivingObjectType === "loose" ? (
                      <p className="self-end rounded-[var(--md-radius-md)] bg-[var(--md-surface-soft)] px-3 py-2 text-[11.5px] leading-4 text-[var(--md-text)] shadow-[var(--md-shadow-line)]">
                        {t("Stock is received without a pallet or container.")}
                      </p>
                    ) : (
                      <WarehouseFormField label={t("Label code")} hint={t("Leave empty to generate a traceable label.")}>
                        <Input dir="ltr" value={receivingObjectCode} onChange={(event) => setReceivingObjectCode(event.target.value)} className={controlClass} />
                      </WarehouseFormField>
                    )}
                  </div>
                ) : null}

                {/* Every line is on screen at once. The dialog paged through them one
                    at a time, which hid how much of the delivery was still untouched. */}
                {rows.map((row) => {
                  const line = order.lines.find((candidate) => candidate.id === row.orderLineId)
                  if (!line) return null
                  const lots = stock.filter((balance) => balance.itemId === line.itemId && balance.availableQuantity > 0)

                  return (
                    <div key={row.orderLineId} className="grid gap-3 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] p-3 shadow-[var(--md-shadow-line)]">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-[12.5px]"><Code>{line.sku}</Code></p>
                        <p dir="ltr" className="text-[11.5px] tabular-nums text-[var(--md-text)]">{line.remainingQuantity} {line.uomCode} {t("outstanding")}</p>
                      </div>
                      {order.typeCode === "inbound" ? (
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                          <WarehouseFormField label={t("Received")} required><Input type="number" min="0" max={line.remainingQuantity} step="0.001" value={row.quantity} onChange={(event) => patchRow(row.orderLineId, { quantity: event.target.value })} className={controlClass} dir="ltr" /></WarehouseFormField>
                          <WarehouseFormField label={t("Damaged")} hint={t("On hand but unavailable.")}><Input type="number" min="0" max={row.quantity} step="0.001" value={row.damagedQuantity} onChange={(event) => patchRow(row.orderLineId, { damagedQuantity: event.target.value })} className={controlClass} dir="ltr" /></WarehouseFormField>
                          <WarehouseFormField label={t("Missing")} hint={t("Never added to stock.")}><Input type="number" min="0" max={line.remainingQuantity} step="0.001" value={row.missingQuantity} onChange={(event) => patchRow(row.orderLineId, { missingQuantity: event.target.value })} className={controlClass} dir="ltr" /></WarehouseFormField>
                          <WarehouseFormField label={t("Put away to")} required>
                            <Select value={row.locationId} onValueChange={(value) => patchRow(row.orderLineId, { locationId: value })}>
                              <SelectTrigger className={controlClass}><SelectValue placeholder={t("Choose a location")} /></SelectTrigger>
                              <SelectContent>{locations.map((location) => <SelectItem key={location.id} value={location.id}>{location.code}</SelectItem>)}</SelectContent>
                            </Select>
                          </WarehouseFormField>
                          <WarehouseFormField label={t("Lot number")}><Input value={row.lotNumber} onChange={(event) => patchRow(row.orderLineId, { lotNumber: event.target.value })} className={controlClass} dir="ltr" /></WarehouseFormField>
                          <WarehouseFormField label={t("Batch number")}><Input value={row.batchNumber} onChange={(event) => patchRow(row.orderLineId, { batchNumber: event.target.value })} className={controlClass} dir="ltr" /></WarehouseFormField>
                          <WarehouseFormField label={t("Manufactured")}><MultideckDatePicker value={row.manufactureDate || null} onChange={(date) => patchRow(row.orderLineId, { manufactureDate: date ?? "" })} placeholder="Select date" title="Manufactured date" description="Pick the date this stock was manufactured." triggerClassName={controlClass} /></WarehouseFormField>
                          <WarehouseFormField label={t("Expiry")}><MultideckDatePicker value={row.expiryDate || null} onChange={(date) => patchRow(row.orderLineId, { expiryDate: date ?? "" })} placeholder="Select date" title="Expiry date" description="Pick the date this stock expires." triggerClassName={controlClass} minDate={row.manufactureDate || undefined} /></WarehouseFormField>
                        </div>
                      ) : (
                        <div className="grid gap-3 sm:grid-cols-3">
                          <WarehouseFormField label={t("Dispatched")} required><Input type="number" min="0" max={line.remainingQuantity} step="0.001" value={row.quantity} onChange={(event) => patchRow(row.orderLineId, { quantity: event.target.value })} className={controlClass} dir="ltr" /></WarehouseFormField>
                          <WarehouseFormField label={t("Pick from")}>
                            <Select value={row.locationId || automaticValue} onValueChange={(value) => patchRow(row.orderLineId, { locationId: value === automaticValue ? "" : value, lotId: "" })}>
                              <SelectTrigger className={controlClass}><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value={automaticValue}>{t("Oldest stock first")}</SelectItem>
                                {locations.map((location) => <SelectItem key={location.id} value={location.id}>{location.code}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </WarehouseFormField>
                          <WarehouseFormField label={t("Batch / lot")}>
                            <Select value={row.lotId || automaticValue} onValueChange={(value) => { const selected = lots.find((lot) => lot.lotId === value); patchRow(row.orderLineId, { lotId: value === automaticValue ? "" : value, locationId: selected?.locationId ?? row.locationId }) }}>
                              <SelectTrigger className={controlClass}><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value={automaticValue}>{t("Oldest stock first")}</SelectItem>
                                {lots.filter((lot, index) => lot.lotId && lots.findIndex((candidate) => candidate.lotId === lot.lotId) === index).map((lot) => (
                                  <SelectItem key={lot.lotId!} value={lot.lotId!}>{lot.batchNumber ?? lot.lotNumber} · {lot.availableQuantity} {lot.uomCode}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </WarehouseFormField>
                        </div>
                      )}
                    </div>
                  )
                })}

                {order.typeCode === "outbound" ? (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <WarehouseFormField label={t("Vehicle")}><Input value={vehicleReg} onChange={(event) => setVehicleReg(event.target.value)} className={controlClass} dir="ltr" /></WarehouseFormField>
                    <WarehouseFormField label={t("Container")}><Input value={containerNumber} onChange={(event) => setContainerNumber(event.target.value)} className={controlClass} dir="ltr" /></WarehouseFormField>
                    <WarehouseFormField label={t("Seal")}><Input value={sealNumber} onChange={(event) => setSealNumber(event.target.value)} className={controlClass} dir="ltr" /></WarehouseFormField>
                  </div>
                ) : null}

                <WarehouseFormField label={t("Notes for the audit trail")}>
                  <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-20 rounded-[var(--md-radius-md)] border-0 bg-[var(--md-surface-soft)] text-[12.5px] shadow-[var(--md-shadow-line)]" />
                </WarehouseFormField>
              </div>
            </OrderSection>
          ) : null}
        </div>

        <div className="grid gap-[var(--md-gap-lg)]">
          <OrderSection index={2} title="Order details">
            <dl>
              <OrderFact label="Customer reference" value={order.customerReference} code />
              <OrderFact label="Requested" value={order.requestedDate ? dateOnly.format(new Date(`${order.requestedDate}T00:00:00`)) : null} />
              <OrderFact label="Slot" value={order.appointmentStartAt ? dateTime.format(new Date(order.appointmentStartAt)) : null} />
              <OrderFact label="Priority" value={order.priorityCode ? t(order.priorityCode) : null} />
              <OrderFact label="Vehicle" value={order.vehicleReg} code />
              <OrderFact label="Container" value={order.containerNumber} code />
              <OrderFact label="Seal" value={order.sealNumber} code />
              <OrderFact label="Created" value={dateTime.format(new Date(order.createdAt))} />
            </dl>
            {order.instructions ? (
              <p className="mt-3 rounded-[var(--md-radius-md)] bg-[var(--md-surface-soft)] px-3 py-2.5 text-[12px] leading-5 text-[var(--md-text)] shadow-[var(--md-shadow-line)]" dir="auto">
                {order.instructions}
              </p>
            ) : null}
          </OrderSection>

          <OrderSection
            index={3}
            title="Files"
            meta="Emails, PDFs, photos and archives, up to 25 MB each."
            action={canUpload ? (
              <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-[var(--md-radius-md)] bg-[var(--md-surface-soft)] px-2.5 text-[12px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] transition-shadow duration-200 hover:shadow-[var(--md-shadow-soft)]">
                {uploading ? <Loader2 className="size-3.5 animate-spin" strokeWidth={1.6} /> : <Upload className="size-3.5" strokeWidth={1.4} />}
                {t(uploading ? "Adding…" : "Add files")}
                <input type="file" className="sr-only" multiple disabled={uploading} onChange={(event) => { void upload(event.target.files); event.currentTarget.value = "" }} />
              </label>
            ) : undefined}
          >
            {documents === null ? (
              <DotGridLoaderPanel label="Loading files" minHeight={96} />
            ) : documents.length ? (
              <div className="grid gap-1.5">
                {documents.map((item) => {
                  const kind = documentKind(item)
                  const size = documentSize(item.fileSizeBytes)
                  return (
                    <div key={item.id} className="flex items-center gap-2.5 rounded-[var(--md-radius-md)] bg-[var(--md-surface-soft)] px-2.5 py-2 shadow-[var(--md-shadow-line)]">
                      <span className="grid size-8 shrink-0 place-items-center rounded-[var(--md-radius-sm)] bg-[var(--md-surface)] text-[var(--md-accent)] shadow-[var(--md-shadow-line)]">
                        {kind === "email" ? <Mail className="size-3.5" strokeWidth={1.4} /> : kind === "image" ? <FileImage className="size-3.5" strokeWidth={1.4} /> : kind === "archive" ? <FileArchive className="size-3.5" strokeWidth={1.4} /> : <FileText className="size-3.5" strokeWidth={1.4} />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p dir="auto" title={item.fileName ?? item.title} className="truncate text-[12.5px] font-medium leading-4 text-[var(--md-ink)]">{item.fileName ?? item.title}</p>
                        <div className="mt-1 flex items-center gap-2">
                          <StatusPill tone={item.statusCode === "accepted" ? "green" : item.statusCode === "rejected" ? "red" : "amber"}>
                            {t(item.statusCode === "pending_review" ? "Waiting for review" : item.statusCode)}
                          </StatusPill>
                          {size ? <span dir="ltr" className="text-[11px] tabular-nums text-[var(--md-subtle)]">{size}</span> : null}
                        </div>
                      </div>
                      {canOperate && item.statusCode === "pending_review" ? (
                        <>
                          <Button type="button" variant="ghost" size="icon" disabled={saving} aria-label={t("Accept file")} onClick={() => void review(item.id, "accepted")} className="size-8 shrink-0 rounded-[var(--md-radius-sm)] text-[var(--md-accent)]"><CheckCircle2 className="size-3.5" strokeWidth={1.5} /></Button>
                          <Button type="button" variant="ghost" size="icon" disabled={saving} aria-label={t("Reject file")} onClick={() => void review(item.id, "rejected")} className="size-8 shrink-0 rounded-[var(--md-radius-sm)] text-[var(--md-red)]"><XCircle className="size-3.5" strokeWidth={1.5} /></Button>
                        </>
                      ) : null}
                      <Button type="button" variant="ghost" size="icon" aria-label={t("Download file")} onClick={() => void downloadWarehouseOrderDocument(order.id, item).catch((cause) => setError(message(cause)))} className="size-8 shrink-0 rounded-[var(--md-radius-sm)]"><Download className="size-3.5" strokeWidth={1.5} /></Button>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="py-4 text-center text-[12px] text-[var(--md-text)]">{t("Add the delivery note, photos or emails that belong with this order.")}</p>
            )}
          </OrderSection>

          <OrderSection index={4} title="Activity" meta="Every receipt and dispatch posted against this order.">
            {order.receipts.length || order.dispatches.length ? (
              <ol className="grid gap-0">
                {[
                  ...order.receipts.map((receipt) => ({ id: receipt.id, code: receipt.receiptNumber, at: receipt.receivedAt, status: receipt.statusCode, kind: "receipt" as const })),
                  ...order.dispatches.map((dispatch) => ({ id: dispatch.id, code: dispatch.dispatchNumber, at: dispatch.dispatchedAt, status: dispatch.statusCode, kind: "dispatch" as const })),
                ]
                  .sort((first, second) => (second.at ?? "").localeCompare(first.at ?? ""))
                  .map((entry) => (
                    <li key={entry.id} className="flex items-center gap-2.5 py-2 first:pt-0 last:pb-0">
                      <span className={cn("grid size-7 shrink-0 place-items-center rounded-[var(--md-radius-sm)] shadow-[var(--md-shadow-line)]", entry.kind === "receipt" ? "bg-[var(--md-accent-a10)] text-[var(--md-accent)]" : "bg-[rgba(74,125,156,0.1)] text-[var(--md-blue)]")}>
                        {entry.kind === "receipt" ? <ArrowDownToLine className="size-3.5" strokeWidth={1.4} /> : <ArrowUpFromLine className="size-3.5" strokeWidth={1.4} />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px]"><Code>{entry.code}</Code></p>
                        <p className="text-[11px] leading-4 text-[var(--md-subtle)]">{entry.at ? dateTime.format(new Date(entry.at)) : t(entry.status)}</p>
                      </div>
                    </li>
                  ))}
              </ol>
            ) : (
              <p className="py-4 text-center text-[12px] text-[var(--md-text)]">{t(order.typeCode === "inbound" ? "Nothing has been received yet." : "Nothing has been dispatched yet.")}</p>
            )}
          </OrderSection>
        </div>
      </div>
    </div>
  )
}
