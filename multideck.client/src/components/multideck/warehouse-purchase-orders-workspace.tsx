import { useEffect, useMemo, useRef, useState } from "react"
import { AlertCircle, ArrowDownToLine, FileText as FileSearch, Loader2, Plus, RefreshCw, Send, Trash2, Upload } from "@/components/icons/hugeicons"
import { toast } from "sonner"
import { DocumentExtractionProgress } from "@/components/multideck/document-extraction-progress"
import { StatusPill } from "@/components/multideck/status-pill"
import { Surface } from "@/components/multideck/surface"
import { WarehouseInventoryTable } from "@/components/multideck/warehouse-components"
import { WarehouseFormField, warehouseDialogFooterClass, warehouseDialogHeaderClass } from "@/components/multideck/warehouse-management-components"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useLanguage } from "@/i18n/language-provider"
import { extractPurchaseOrder, type PurchaseOrderExtractionStage } from "@/lib/purchase-order-import-api"
import {
  WarehouseApiError,
  cancelWarehousePurchaseOrder,
  createInboundOrderFromPurchaseOrder,
  createWarehousePurchaseOrder,
  getWarehousePurchaseOrderReference,
  issueWarehousePurchaseOrder,
  listWarehousePurchaseOrders,
  updateWarehousePurchaseOrder,
  type WarehousePurchaseOrder,
  type WarehousePurchaseOrderInput,
  type WarehousePurchaseOrderLine,
  type WarehousePurchaseOrderReference,
} from "@/lib/warehouse"

const controlClass = "!h-10 !w-full rounded-[var(--md-radius-lg)] border-0 bg-white/68 !px-3 !text-[13px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] placeholder:text-[var(--md-subtle)] active:!scale-100 focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]"
const emptyLine = (): WarehousePurchaseOrderLine => ({ itemId: null, sku: "", supplierItemCode: null, description: "", quantity: 1, uomCode: "EA", unitPrice: 0, taxRate: 0, requestedDeliveryDate: null })
const emptyInput = (): WarehousePurchaseOrderInput => ({ facilityId: "", customerOrgId: "", supplierOrgId: null, number: "", supplierName: "", buyerReference: null, supplierReference: null, issueDate: null, expectedDeliveryDate: null, currencyCode: "GBP", deliveryTerms: null, paymentTerms: null, deliveryAddress: null, notes: null, lines: [emptyLine()] })
function errorMessage(error: unknown) {
  return error instanceof WarehouseApiError || error instanceof Error ? error.message : String(error)
}

function statusTone(status: string): "green" | "amber" | "red" | "blue" | "neutral" {
  if (status === "received") return "green"
  if (status === "cancelled") return "red"
  if (status === "part_received") return "amber"
  if (status === "issued") return "blue"
  return "neutral"
}

function normaliseInput(order: WarehousePurchaseOrder): WarehousePurchaseOrderInput {
  return {
    facilityId: order.facilityId,
    customerOrgId: order.customerOrgId,
    supplierOrgId: order.supplierOrgId,
    number: order.number,
    supplierName: order.supplierName,
    buyerReference: order.buyerReference,
    supplierReference: order.supplierReference,
    issueDate: order.issueDate,
    expectedDeliveryDate: order.expectedDeliveryDate,
    currencyCode: order.currencyCode,
    deliveryTerms: order.deliveryTerms,
    paymentTerms: order.paymentTerms,
    deliveryAddress: order.deliveryAddress,
    notes: order.notes,
    sourceFileName: order.sourceFileName,
    extractionMode: order.extractionMode,
    extractionModel: order.extractionModel,
    extractionMetadata: order.extractionMetadata,
    lines: order.lines.map((line)=>({ ...line })),
  }
}

/** Reusable line editor for purchase-order entry and document-extraction review. */
export function PurchaseOrderLineEditor({
  lines,
  reference,
  facilityId,
  customerOrgId,
  disabled,
  onChange,
}: {
  lines: WarehousePurchaseOrderLine[]
  reference: WarehousePurchaseOrderReference | null
  facilityId: string
  customerOrgId: string
  disabled?: boolean
  onChange: (lines: WarehousePurchaseOrderLine[]) => void
}) {
  const { t } = useLanguage()
  const items = reference?.items.filter((item)=>item.facilityId === facilityId && item.customerOrgId === customerOrgId) ?? []
  const patch = (index: number, changes: Partial<WarehousePurchaseOrderLine>) => onChange(lines.map((line, lineIndex)=>lineIndex === index ? { ...line, ...changes } : line))
  return <div className="grid gap-2">
    {lines.map((line, index) => {
      const selectedItem = items.find((item)=>item.id === line.itemId)
      const amount = Math.max(0, Number(line.quantity) || 0) * Math.max(0, Number(line.unitPrice) || 0)
      return <div key={line.id ?? index} className="grid gap-2 rounded-[var(--md-radius-lg)] bg-white/44 p-3 shadow-[var(--md-shadow-line)] lg:grid-cols-12">
        <WarehouseFormField label={t("Warehouse item")} required className="lg:col-span-3">
          <Select disabled={disabled || !facilityId || !customerOrgId} value={line.itemId ?? "__unmatched__"} onValueChange={(value) => {
            const item = items.find((candidate)=>candidate.id === value)
            patch(index, { itemId: item?.id ?? null, sku: item?.sku ?? line.sku, description: line.description || item?.description || "", uomCode: item?.uomCode ?? line.uomCode })
          }}><SelectTrigger className={controlClass}><SelectValue placeholder={t("Match item")} /></SelectTrigger><SelectContent><SelectItem value="__unmatched__">{t("Unmatched")}</SelectItem>{items.map((item)=><SelectItem key={item.id} value={item.id}>{item.sku} · {item.description}</SelectItem>)}</SelectContent></Select>
        </WarehouseFormField>
        <WarehouseFormField label={t("SKU")} className="lg:col-span-2"><Input disabled={disabled} value={line.sku} onChange={(event)=>patch(index,{ sku:event.target.value })} className={controlClass} dir="ltr" /></WarehouseFormField>
        <WarehouseFormField label={t("Description")} required className="lg:col-span-4"><Input disabled={disabled} value={line.description} onChange={(event)=>patch(index,{ description:event.target.value })} className={controlClass} dir="auto" /></WarehouseFormField>
        <WarehouseFormField label={t("Quantity")} required className="lg:col-span-1"><Input disabled={disabled} type="number" min="0.000001" step={selectedItem?.allowsFractionalQuantity ? "0.001" : "1"} value={line.quantity} onChange={(event)=>patch(index,{ quantity:Number(event.target.value) })} className={controlClass} dir="ltr" /></WarehouseFormField>
        <WarehouseFormField label={t("UOM")} className="lg:col-span-1"><Input disabled={disabled} value={line.uomCode} onChange={(event)=>patch(index,{ uomCode:event.target.value.toUpperCase() })} className={controlClass} dir="ltr" /></WarehouseFormField>
        <Button disabled={disabled || lines.length === 1} type="button" variant="ghost" size="icon" aria-label={t("Remove line")} onClick={()=>onChange(lines.filter((_,lineIndex)=>lineIndex!==index))} className="mt-6 size-10 rounded-[var(--md-radius-lg)] text-[var(--md-red)] lg:col-span-1"><Trash2 className="size-4" /></Button>
        <WarehouseFormField label={t("Supplier item code")} className="lg:col-span-3"><Input disabled={disabled} value={line.supplierItemCode ?? ""} onChange={(event)=>patch(index,{ supplierItemCode:event.target.value || null })} className={controlClass} dir="ltr" /></WarehouseFormField>
        <WarehouseFormField label={t("Unit price")} className="lg:col-span-2"><Input disabled={disabled} type="number" min="0" step="0.01" value={line.unitPrice} onChange={(event)=>patch(index,{ unitPrice:Number(event.target.value) })} className={controlClass} dir="ltr" /></WarehouseFormField>
        <WarehouseFormField label={t("Tax %")} className="lg:col-span-2"><Input disabled={disabled} type="number" min="0" step="0.01" value={line.taxRate} onChange={(event)=>patch(index,{ taxRate:Number(event.target.value) })} className={controlClass} dir="ltr" /></WarehouseFormField>
        <WarehouseFormField label={t("Line delivery date")} className="lg:col-span-3"><Input disabled={disabled} type="date" value={line.requestedDeliveryDate ?? ""} onChange={(event)=>patch(index,{ requestedDeliveryDate:event.target.value || null })} className={controlClass} dir="ltr" /></WarehouseFormField>
        <div className="flex items-end justify-end pb-2 lg:col-span-2"><span className="text-[12px] text-[var(--md-subtle)]">{t("Net")} <strong dir="ltr" className="ms-1 font-medium tabular-nums text-[var(--md-ink)]">{amount.toFixed(2)}</strong></span></div>
      </div>
    })}
    {!disabled ? <Button type="button" variant="ghost" onClick={()=>onChange([...lines,emptyLine()])} className="h-9 justify-self-start rounded-[var(--md-radius-lg)]"><Plus className="size-4" />{t("Add line")}</Button> : null}
  </div>
}

function PurchaseOrderDialog({ open, order, reference, onOpenChange, onChanged }: { open: boolean; order: WarehousePurchaseOrder | null; reference: WarehousePurchaseOrderReference | null; onOpenChange: (open: boolean)=>void; onChanged: ()=>void }) {
  const { t } = useLanguage()
  const [form, setForm] = useState<WarehousePurchaseOrderInput>(emptyInput)
  const [saving, setSaving] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [stage, setStage] = useState<PurchaseOrderExtractionStage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const editable = !order || (["draft","issued"].includes(order.statusCode) && !order.warehouseOrderId)
  const extractionStages = useMemo(() => [
    { id: "reading", label: t("Reading the document"), detail: t("Checking the PDF and its embedded text."), ceiling: 28, expectedMs: 2_000 },
    { id: "extracting", label: t("Finding header and lines"), detail: t("Identifying supplier, dates, references and ordered goods."), ceiling: 88, expectedMs: 10_000 },
    { id: "organising", label: t("Preparing the review"), detail: t("Matching extracted SKUs to warehouse items."), ceiling: 98, expectedMs: 2_000 },
  ], [t])
  useEffect(() => { if (open) { setForm(order ? normaliseInput(order) : emptyInput()); setError(null); setStage(null) } }, [open, order])
  const patch = <K extends keyof WarehousePurchaseOrderInput>(key: K, value: WarehousePurchaseOrderInput[K]) => setForm((current)=>({ ...current, [key]: value }))
  const supplierOptions = reference?.organisations ?? []
  const total = form.lines.reduce((sum,line)=>sum+Math.max(0,line.quantity)*Math.max(0,line.unitPrice)*(1+Math.max(0,line.taxRate)/100),0)

  async function importDocument(file: File) {
    abortRef.current?.abort(); abortRef.current = new AbortController(); setExtracting(true); setError(null); setStage("reading")
    try {
      const result = await extractPurchaseOrder(file,{ signal:abortRef.current.signal,onStage:setStage })
      const items = reference?.items.filter((item)=>item.facilityId === form.facilityId && item.customerOrgId === form.customerOrgId) ?? []
      setForm((current)=>({
        ...current,
        number: result.number || current.number,
        supplierName: result.supplierName || current.supplierName,
        supplierReference: result.supplierReference || current.supplierReference,
        buyerReference: result.buyerReference || current.buyerReference,
        issueDate: result.issueDate || current.issueDate,
        expectedDeliveryDate: result.expectedDeliveryDate || current.expectedDeliveryDate,
        currencyCode: result.currencyCode || current.currencyCode,
        deliveryTerms: result.deliveryTerms || current.deliveryTerms,
        paymentTerms: result.paymentTerms || current.paymentTerms,
        deliveryAddress: result.deliveryAddress || current.deliveryAddress,
        notes: result.notes || current.notes,
        sourceFileName: file.name,
        extractionMode: result.extractionMode,
        extractionModel: result.model,
        extractionMetadata: { pageCount:result.pageCount,timings:result.timings,reviewedAt:null },
        lines: result.lines.map((line)=>{
          const item = items.find((candidate)=>candidate.sku.toLowerCase() === line.sku.toLowerCase())
          return { itemId:item?.id ?? null,sku:line.sku,supplierItemCode:line.supplierItemCode || null,description:line.description,quantity:line.quantity,uomCode:item?.uomCode ?? line.uomCode,unitPrice:line.unitPrice,taxRate:line.taxRate,requestedDeliveryDate:line.requestedDeliveryDate || null,metadata:{ sourcePage:line.page,extractedCurrency:line.currencyCode } }
        }),
      }))
      toast.success(t("Purchase order document extracted. Review every field before saving."))
    } catch (cause) {
      if (!abortRef.current?.signal.aborted) setError(errorMessage(cause))
    } finally { setExtracting(false); setStage(null) }
  }

  async function save() {
    setError(null)
    if (!form.facilityId || !form.customerOrgId || !form.number.trim() || !form.supplierName.trim() || form.lines.some((line)=>!line.description.trim() || line.quantity<=0 || !line.uomCode.trim())) { setError(t("Complete the purchase order header and every required line field.")); return }
    setSaving(true)
    try {
      const payload = { ...form, extractionMetadata:{ ...(form.extractionMetadata ?? {}),reviewedAt:new Date().toISOString() } }
      await (order ? updateWarehousePurchaseOrder(order.id,payload) : createWarehousePurchaseOrder(payload))
      toast.success(t(order ? "Purchase order updated." : "Purchase order created.")); onChanged(); onOpenChange(false)
    } catch (cause) { setError(errorMessage(cause)) } finally { setSaving(false) }
  }

  async function action(kind: "issue"|"cancel"|"inbound") {
    if (!order) return
    setSaving(true); setError(null)
    try {
      if (kind==="issue") await issueWarehousePurchaseOrder(order.id)
      else if (kind==="cancel") await cancelWarehousePurchaseOrder(order.id)
      else await createInboundOrderFromPurchaseOrder(order.id)
      toast.success(t(kind==="issue" ? "Purchase order issued." : kind==="cancel" ? "Purchase order cancelled." : "Goods-in order created.")); onChanged(); onOpenChange(false)
    } catch (cause) { setError(errorMessage(cause)) } finally { setSaving(false) }
  }

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[92vh] overflow-hidden border-0 bg-[var(--md-surface)] p-0 sm:max-w-[1120px]">
    <DialogHeader className={warehouseDialogHeaderClass}><DialogTitle>{order ? `${t("Purchase order")} ${order.number}` : t("New purchase order")}</DialogTitle><DialogDescription>{t("Enter the header and lines, or import a supplier PDF and review the extracted values before saving.")}</DialogDescription></DialogHeader>
    <div className="min-h-0 overflow-y-auto px-6 py-5">
      {extracting ? <DocumentExtractionProgress title={t("Reading purchase order")} detail={t("Extracted values are never saved until you review and confirm them.")} fileName={form.sourceFileName ?? undefined} stages={extractionStages} activeStageId={stage} onCancel={()=>abortRef.current?.abort()} /> : <div className="grid gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[13px] font-medium text-[var(--md-ink)]">{t("Header")}</p><p className="mt-1 text-[11.5px] text-[var(--md-subtle)]">{form.sourceFileName ? <>{t("Extracted from")} <span dir="auto">{form.sourceFileName}</span> · {t("review required")}</> : t("Supplier, dates, ownership and commercial references.")}</p></div>{editable ? <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-[var(--md-radius-lg)] bg-white/58 px-3 text-[12px] font-medium shadow-[var(--md-shadow-line)]"><Upload className="size-4" />{t("Extract from PDF")}<input className="sr-only" type="file" accept="application/pdf,.pdf" onChange={(event)=>{ const file=event.target.files?.[0]; if(file){ patch("sourceFileName",file.name); void importDocument(file) } event.currentTarget.value="" }} /></label>:null}</div>
        <div className="grid gap-3 md:grid-cols-12">
          <WarehouseFormField label={t("Warehouse")} required className="md:col-span-4"><Select disabled={!editable} value={form.facilityId} onValueChange={(value)=>{ patch("facilityId",value); patch("lines",form.lines.map((line)=>({ ...line,itemId:null }))) }}><SelectTrigger className={controlClass}><SelectValue placeholder={t("Choose warehouse")} /></SelectTrigger><SelectContent>{reference?.facilities.map((facility)=><SelectItem key={facility.id} value={facility.id}>{facility.name}</SelectItem>)}</SelectContent></Select></WarehouseFormField>
          <WarehouseFormField label={t("Stock owner")} required className="md:col-span-4"><Select disabled={!editable} value={form.customerOrgId} onValueChange={(value)=>{ patch("customerOrgId",value); patch("lines",form.lines.map((line)=>({ ...line,itemId:null }))) }}><SelectTrigger className={controlClass}><SelectValue placeholder={t("Choose organisation")} /></SelectTrigger><SelectContent>{supplierOptions.map((organisation)=><SelectItem key={organisation.id} value={organisation.id}>{organisation.name}</SelectItem>)}</SelectContent></Select></WarehouseFormField>
          <WarehouseFormField label={t("Purchase order number")} required className="md:col-span-4"><Input disabled={!editable} value={form.number} onChange={(event)=>patch("number",event.target.value)} className={controlClass} dir="ltr" /></WarehouseFormField>
          <WarehouseFormField label={t("Supplier")} required className="md:col-span-4"><Input disabled={!editable} value={form.supplierName} onChange={(event)=>patch("supplierName",event.target.value)} className={controlClass} dir="auto" /></WarehouseFormField>
          <WarehouseFormField label={t("Link supplier record")} className="md:col-span-4"><Select disabled={!editable} value={form.supplierOrgId ?? "__none__"} onValueChange={(value)=>{ const supplier=supplierOptions.find((item)=>item.id===value); patch("supplierOrgId",supplier?.id ?? null); if(supplier) patch("supplierName",supplier.name) }}><SelectTrigger className={controlClass}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__none__">{t("No linked record")}</SelectItem>{supplierOptions.map((organisation)=><SelectItem key={organisation.id} value={organisation.id}>{organisation.name}</SelectItem>)}</SelectContent></Select></WarehouseFormField>
          <WarehouseFormField label={t("Currency")} required className="md:col-span-2"><Select disabled={!editable} value={form.currencyCode} onValueChange={(value)=>patch("currencyCode",value)}><SelectTrigger className={controlClass}><SelectValue /></SelectTrigger><SelectContent>{reference?.currencies.map((currency)=><SelectItem key={currency} value={currency}>{currency}</SelectItem>)}</SelectContent></Select></WarehouseFormField>
          <WarehouseFormField label={t("Issue date")} className="md:col-span-2"><Input disabled={!editable} type="date" value={form.issueDate ?? ""} onChange={(event)=>patch("issueDate",event.target.value||null)} className={controlClass} dir="ltr" /></WarehouseFormField>
          <WarehouseFormField label={t("Expected delivery")} className="md:col-span-3"><Input disabled={!editable} type="date" value={form.expectedDeliveryDate ?? ""} onChange={(event)=>patch("expectedDeliveryDate",event.target.value||null)} className={controlClass} dir="ltr" /></WarehouseFormField>
          <WarehouseFormField label={t("Buyer reference")} className="md:col-span-3"><Input disabled={!editable} value={form.buyerReference ?? ""} onChange={(event)=>patch("buyerReference",event.target.value||null)} className={controlClass} dir="ltr" /></WarehouseFormField>
          <WarehouseFormField label={t("Supplier reference")} className="md:col-span-3"><Input disabled={!editable} value={form.supplierReference ?? ""} onChange={(event)=>patch("supplierReference",event.target.value||null)} className={controlClass} dir="ltr" /></WarehouseFormField>
          <WarehouseFormField label={t("Delivery terms")} className="md:col-span-3"><Input disabled={!editable} value={form.deliveryTerms ?? ""} onChange={(event)=>patch("deliveryTerms",event.target.value||null)} className={controlClass} /></WarehouseFormField>
          <WarehouseFormField label={t("Payment terms")} className="md:col-span-3"><Input disabled={!editable} value={form.paymentTerms ?? ""} onChange={(event)=>patch("paymentTerms",event.target.value||null)} className={controlClass} /></WarehouseFormField>
          <WarehouseFormField label={t("Delivery address")} className="md:col-span-6"><Textarea disabled={!editable} value={form.deliveryAddress ?? ""} onChange={(event)=>patch("deliveryAddress",event.target.value||null)} className="min-h-20 rounded-[var(--md-radius-lg)] border-0 bg-white/68 shadow-[var(--md-shadow-line)]" dir="auto" /></WarehouseFormField>
          <WarehouseFormField label={t("Notes")} className="md:col-span-6"><Textarea disabled={!editable} value={form.notes ?? ""} onChange={(event)=>patch("notes",event.target.value||null)} className="min-h-20 rounded-[var(--md-radius-lg)] border-0 bg-white/68 shadow-[var(--md-shadow-line)]" dir="auto" /></WarehouseFormField>
        </div>
        <div><div className="mb-3 flex items-end justify-between"><div><p className="text-[13px] font-medium text-[var(--md-ink)]">{t("Lines")}</p><p className="mt-1 text-[11.5px] text-[var(--md-subtle)]">{t("Match each extracted line to the correct warehouse item before issuing.")}</p></div><p className="text-[12px] text-[var(--md-subtle)]">{t("Total")} <strong dir="ltr" className="ms-1 font-medium tabular-nums text-[var(--md-ink)]">{form.currencyCode} {total.toFixed(2)}</strong></p></div><PurchaseOrderLineEditor lines={form.lines} reference={reference} facilityId={form.facilityId} customerOrgId={form.customerOrgId} disabled={!editable} onChange={(lines)=>patch("lines",lines)} /></div>
      </div>}
      {error ? <div className="mt-4 flex items-start gap-2 rounded-[var(--md-radius-lg)] bg-[var(--md-red-a08)] px-3 py-2.5 text-[12px] text-[var(--md-red)]" role="alert"><AlertCircle className="mt-0.5 size-4 shrink-0" />{t(error)}</div>:null}
    </div>
    <DialogFooter className={`${warehouseDialogFooterClass} flex-row items-center justify-between`}><div>{order && !order.warehouseOrderId && !["received","cancelled"].includes(order.statusCode)?<Button variant="ghost" disabled={saving} onClick={()=>void action("cancel")} className="text-[var(--md-red)]">{t("Cancel PO")}</Button>:null}</div><div className="flex flex-wrap justify-end gap-2"><Button variant="ghost" onClick={()=>onOpenChange(false)}>{t("Close")}</Button>{order?.statusCode==="issued" && !order.warehouseOrderId?<Button variant="outline" disabled={saving} onClick={()=>void action("inbound")}><ArrowDownToLine className="size-4" />{t("Create goods-in order")}</Button>:null}{order?.statusCode==="draft"?<Button variant="outline" disabled={saving || order.lines.some((line)=>!line.itemId)} onClick={()=>void action("issue")}><Send className="size-4" />{t("Issue PO")}</Button>:null}{editable?<Button disabled={saving||extracting} onClick={()=>void save()} className="bg-[var(--md-accent)] text-[var(--md-accent-ink)]">{saving?<Loader2 className="size-4 animate-spin" />:null}{t(order?"Save changes":"Create purchase order")}</Button>:null}</div></DialogFooter>
  </DialogContent></Dialog>
}

export function WarehousePurchaseOrdersWorkspace() {
  const { language, t } = useLanguage()
  const [reference,setReference]=useState<WarehousePurchaseOrderReference|null>(null)
  const [orders,setOrders]=useState<WarehousePurchaseOrder[]|null>(null)
  const [search,setSearch]=useState("")
  const [facilityId,setFacilityId]=useState("")
  const [statusCode,setStatusCode]=useState("__all__")
  const [selected,setSelected]=useState<WarehousePurchaseOrder|null>(null)
  const [createOpen,setCreateOpen]=useState(false)
  const [error,setError]=useState<string|null>(null)
  const requestedRecordIdRef=useRef(new URLSearchParams(window.location.search).get("record"))
  async function refresh(){setError(null);try{const [nextReference,nextOrders]=await Promise.all([reference??getWarehousePurchaseOrderReference(),listWarehousePurchaseOrders({facilityId:facilityId||undefined,statusCode:statusCode==="__all__"?undefined:statusCode,search:search.trim()||undefined})]);setReference(nextReference);setOrders(nextOrders);const requested=requestedRecordIdRef.current;if(requested){requestedRecordIdRef.current=null;setSelected(nextOrders.find((order)=>order.id===requested)??null)}else if(selected)setSelected(nextOrders.find((order)=>order.id===selected.id)??null)}catch(cause){setError(errorMessage(cause));setOrders([])}}
  useEffect(()=>{const timer=window.setTimeout(()=>{void refresh()},250);return()=>window.clearTimeout(timer)},[facilityId,statusCode,search]) // eslint-disable-line react-hooks/exhaustive-deps
  const money=useMemo(()=>new Intl.NumberFormat(language,{style:"currency",currency:"GBP",maximumFractionDigits:2}),[language])
  const columns=[
    {key:"number",label:"Purchase order",className:"min-w-[180px]",render:(order:WarehousePurchaseOrder)=><div><span dir="ltr" className="text-[13px] font-medium text-[var(--md-ink)]">{order.number}</span><p className="mt-1 text-[11px] text-[var(--md-subtle)]">{order.buyerReference??t("No buyer reference")}</p></div>},
    {key:"supplier",label:"Supplier",className:"min-w-[190px]",render:(order:WarehousePurchaseOrder)=><div><p className="text-[13px] font-medium text-[var(--md-ink)]">{order.supplierName}</p><p className="mt-1 text-[11px] text-[var(--md-subtle)]">{order.customerName}</p></div>},
    {key:"warehouse",label:"Warehouse",render:(order:WarehousePurchaseOrder)=><span className="text-[12px] text-[var(--md-text)]">{order.facilityName}</span>},
    {key:"delivery",label:"Expected",render:(order:WarehousePurchaseOrder)=><span className="text-[12px] text-[var(--md-text)]">{order.expectedDeliveryDate?new Intl.DateTimeFormat(language,{dateStyle:"medium"}).format(new Date(`${order.expectedDeliveryDate}T00:00:00`)):"—"}</span>},
    {key:"lines",label:"Lines",align:"center" as const,render:(order:WarehousePurchaseOrder)=><span className="tabular-nums">{order.lines.length}</span>},
    {key:"total",label:"Total",align:"right" as const,render:(order:WarehousePurchaseOrder)=><span dir="ltr" className="font-medium tabular-nums">{order.currencyCode==="GBP"?money.format(order.totalAmount):`${order.currencyCode} ${order.totalAmount.toFixed(2)}`}</span>},
    {key:"status",label:"Status",align:"right" as const,render:(order:WarehousePurchaseOrder)=><StatusPill tone={statusTone(order.statusCode)}>{t(order.statusCode.replace("_"," "))}</StatusPill>},
  ]
  return <div className="grid gap-[var(--md-page-stack-gap)]"><div className="flex flex-col gap-3 xl:flex-row xl:items-center"><div className="xl:me-auto"><h2 className="text-[15px] font-medium text-[var(--md-ink)]">{t("Purchase orders")}</h2><p className="mt-1 text-[13px] text-[var(--md-text)]">{t("Enter supplier orders manually or extract a PDF, review every value, and turn an issued PO into goods-in work.")}</p></div><div className="flex flex-wrap gap-2"><Select value={facilityId||"__all__"} onValueChange={(value)=>setFacilityId(value==="__all__"?"":value)}><SelectTrigger className="h-10 min-w-[190px] rounded-[var(--md-radius-lg)] border-0 bg-white/68 shadow-[var(--md-shadow-line)]"><SelectValue placeholder={t("All warehouses")} /></SelectTrigger><SelectContent><SelectItem value="__all__">{t("All warehouses")}</SelectItem>{reference?.facilities.map((facility)=><SelectItem key={facility.id} value={facility.id}>{facility.name}</SelectItem>)}</SelectContent></Select><Select value={statusCode} onValueChange={setStatusCode}><SelectTrigger className="h-10 min-w-[150px] rounded-[var(--md-radius-lg)] border-0 bg-white/68 shadow-[var(--md-shadow-line)]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__all__">{t("All statuses")}</SelectItem>{["draft","issued","part_received","received","cancelled"].map((status)=><SelectItem key={status} value={status}>{t(status.replace("_"," "))}</SelectItem>)}</SelectContent></Select><Input value={search} onChange={(event)=>setSearch(event.target.value)} placeholder={t("Search PO or supplier…")} className={`${controlClass} sm:!w-64`} /><Button variant="ghost" size="icon" aria-label={t("Refresh purchase orders")} onClick={()=>void refresh()} className="size-10 rounded-[var(--md-radius-lg)] bg-white/48 shadow-[var(--md-shadow-line)]"><RefreshCw className="size-4" /></Button><Button onClick={()=>setCreateOpen(true)} className="h-10 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] text-[var(--md-accent-ink)]"><Plus className="size-4" />{t("New purchase order")}</Button></div></div>
    {error||orders===null||orders.length===0?<Surface padding="lg" className="grid min-h-[220px] place-items-center text-center"><div><span className="mx-auto grid size-11 place-items-center rounded-[var(--md-radius-lg)] bg-white/58 text-[var(--md-accent)] shadow-[var(--md-shadow-line)]">{orders===null&&!error?<Loader2 className="size-5 animate-spin" />:error?<AlertCircle className="size-5" />:<FileSearch className="size-5" />}</span><p className="mt-3 text-[14px] font-medium">{t(error?"Purchase orders could not be loaded":orders===null?"Loading purchase orders":"No purchase orders match these filters")}</p>{error?<p className="mt-1 text-[12px] text-[var(--md-text)]">{t(error)}</p>:null}</div></Surface>:<WarehouseInventoryTable rows={orders} columns={columns} minWidth={980} onRowClick={setSelected} rowDetailLabel={(order)=>`${t("Open purchase order")} ${order.number}`} />}
    <PurchaseOrderDialog open={createOpen} order={null} reference={reference} onOpenChange={setCreateOpen} onChanged={()=>void refresh()} />
    <PurchaseOrderDialog open={Boolean(selected)} order={selected} reference={reference} onOpenChange={(next)=>{if(!next)setSelected(null)}} onChanged={()=>void refresh()} />
  </div>
}
