import { defaultPaginationPageSize } from "@/lib/pagination"
import { collectExportPages } from "@/lib/table-export"
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import { AlertCircle, ArrowDownToLine, ArrowLeft, Check, ChevronDown, FileText as FileSearch, History, Link2, Loader2, Plus, ReceiptText, RefreshCw, Search, Send, Trash2, Upload, XCircle } from "@/components/icons/hugeicons"
import { motion, useReducedMotion } from "motion/react"
import { toast } from "sonner"
import { DataTable, type DataTableColumn } from "@/components/multideck/data-table"
import { DocumentExtractionProgress } from "@/components/multideck/document-extraction-progress"
import { DotGridLoaderPanel } from "@/components/multideck/dot-grid-loader"
import { RegisterFacetSelect, RegisterRevalidatingMark, RegisterSearchField, RegisterViewSwitch } from "@/components/multideck/register-toolbar"
import { StatusPill } from "@/components/multideck/status-pill"
import { Surface } from "@/components/multideck/surface"
import { WarehouseFormField } from "@/components/multideck/warehouse-management-components"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useLanguage } from "@/i18n/language-provider"
import { extractPurchaseOrder, type PurchaseOrderExtractionStage } from "@/lib/purchase-order-import-api"
import { mdMotion, staggerRamp } from "@/lib/motion"
import { cn } from "@/lib/utils"
import {
  WarehouseApiError,
  cancelWarehousePurchaseOrder,
  createInboundOrderFromPurchaseOrder,
  createWarehousePurchaseOrder,
  getNextWarehousePurchaseOrderNumber,
  getWarehousePurchaseOrder,
  getWarehousePurchaseOrderReference,
  issueWarehousePurchaseOrder,
  listWarehouseFacilitiesPage,
  listWarehousePurchaseOrderItemsPage,
  listWarehousePurchaseOrderOrganisationsPage,
  listWarehousePurchaseOrdersPage,
  updateWarehousePurchaseOrder,
  type WarehouseFacility,
  type WarehousePurchaseOrder,
  type WarehousePurchaseOrderInput,
  type WarehousePurchaseOrderLine,
  type WarehousePurchaseOrderReference,
  type WarehouseRegisterSort,
} from "@/lib/warehouse"

const controlClass = "!h-9 !w-full rounded-[var(--md-radius-md)] border-0 bg-white/68 !px-3 !text-[12.5px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] placeholder:text-[var(--md-subtle)] active:!scale-100 focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]"
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

function purchaseOrderStatusLabel(status: string) {
  if (status === "issued") return "Confirmed"
  if (status === "part_received") return "Part received"
  return status.charAt(0).toUpperCase() + status.slice(1)
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

type PurchaseOrderOrganisationOption = WarehousePurchaseOrderReference["organisations"][number]
type PurchaseOrderItemOption = WarehousePurchaseOrderReference["items"][number]

function usePurchaseOrderReferenceSelectors(facilityId: string, customerOrgId: string) {
  const [reference, setReference] = useState<WarehousePurchaseOrderReference | null>(null)
  const [organisationRows, setOrganisationRows] = useState<PurchaseOrderOrganisationOption[]>([])
  const [rememberedOrganisations, setRememberedOrganisations] = useState<PurchaseOrderOrganisationOption[]>([])
  const [organisationSearch, setOrganisationSearch] = useState("")
  const [organisationLoading, setOrganisationLoading] = useState(false)
  const [organisationsHaveMore, setOrganisationsHaveMore] = useState(false)
  const [itemRows, setItemRows] = useState<PurchaseOrderItemOption[]>([])
  const [rememberedItems, setRememberedItems] = useState<PurchaseOrderItemOption[]>([])
  const [itemSearch, setItemSearch] = useState("")
  const [itemLoading, setItemLoading] = useState(false)
  const [itemsHaveMore, setItemsHaveMore] = useState(false)
  const [selectorError, setSelectorError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    getWarehousePurchaseOrderReference()
      .then((value) => {
        if (live) setReference({ ...value, organisations: [], items: [] })
      })
      .catch((cause) => { if (live) setSelectorError(errorMessage(cause)) })
    return () => { live = false }
  }, [])

  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(() => {
      setOrganisationLoading(true)
      listWarehousePurchaseOrderOrganisationsPage({ search: organisationSearch.trim() || undefined, limit: 25 })
        .then((page) => {
          if (cancelled) return
          setOrganisationRows(page.rows)
          setOrganisationsHaveMore(page.hasMore)
          setSelectorError(null)
        })
        .catch((cause) => {
          if (!cancelled) {
            setOrganisationRows([])
            setOrganisationsHaveMore(false)
            setSelectorError(errorMessage(cause))
          }
        })
        .finally(() => { if (!cancelled) setOrganisationLoading(false) })
    }, 220)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [organisationSearch])

  useEffect(() => {
    if (!facilityId || !customerOrgId) {
      setItemRows([])
      setItemsHaveMore(false)
      return
    }
    let cancelled = false
    const timer = window.setTimeout(() => {
      setItemLoading(true)
      listWarehousePurchaseOrderItemsPage({ facilityId, customerOrgId, search: itemSearch.trim() || undefined, limit: 25 })
        .then((page) => {
          if (cancelled) return
          setItemRows(page.rows)
          setItemsHaveMore(page.hasMore)
          setSelectorError(null)
        })
        .catch((cause) => {
          if (!cancelled) {
            setItemRows([])
            setItemsHaveMore(false)
            setSelectorError(errorMessage(cause))
          }
        })
        .finally(() => { if (!cancelled) setItemLoading(false) })
    }, 220)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [customerOrgId, facilityId, itemSearch])

  const rememberOrganisation = useCallback((organisation: PurchaseOrderOrganisationOption | null) => {
    if (!organisation) return
    setRememberedOrganisations((current) => current.some((candidate) => candidate.id === organisation.id) ? current : [...current, organisation])
  }, [])
  const rememberItems = useCallback((items: PurchaseOrderItemOption[]) => {
    if (!items.length) return
    setRememberedItems((current) => [...current, ...items].filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index))
  }, [])
  const organisations = useMemo(() => [...rememberedOrganisations, ...organisationRows]
    .filter((row, index, all) => all.findIndex((candidate) => candidate.id === row.id) === index), [organisationRows, rememberedOrganisations])
  const items = useMemo(() => [...rememberedItems, ...itemRows]
    .filter((item) => item.facilityId === facilityId && item.customerOrgId === customerOrgId)
    .filter((row, index, all) => all.findIndex((candidate) => candidate.id === row.id) === index), [customerOrgId, facilityId, itemRows, rememberedItems])

  return {
    reference,
    organisations,
    organisationSearch,
    setOrganisationSearch,
    organisationLoading,
    organisationsHaveMore,
    items,
    itemSearch,
    setItemSearch,
    itemLoading,
    itemsHaveMore,
    selectorError,
    rememberOrganisation,
    rememberItems,
  }
}

function SearchablePurchaseOrderSelect({ value, options, placeholder, searchPlaceholder, emptyLabel, disabled, remoteSearch = false, loading = false, hasMore = false, onSearchChange, onChange }: { value: string; options: Array<{ id: string; name: string; code?: string }>; placeholder: string; searchPlaceholder: string; emptyLabel: string; disabled?: boolean; remoteSearch?: boolean; loading?: boolean; hasMore?: boolean; onSearchChange?: (value: string) => void; onChange: (value: string) => void }) {
  const { direction, t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const listId = useId()
  const listRef = useRef<HTMLDivElement>(null)
  const selected = options.find((option)=>option.id === value)
  const matches = remoteSearch ? options : options.filter((option)=>`${option.code ?? ""} ${option.name}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  useEffect(() => {
    if (highlightedIndex < 0) return
    listRef.current?.querySelector<HTMLElement>(`[data-option-index="${highlightedIndex}"]`)?.scrollIntoView({ block: "nearest" })
  }, [highlightedIndex])
  const choose = (option: { id: string }) => { onChange(option.id); setOpen(false) }
  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setHighlightedIndex((current)=>matches.length ? Math.min(current + 1, matches.length - 1) : -1)
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setHighlightedIndex((current)=>matches.length ? (current <= 0 ? matches.length - 1 : current - 1) : -1)
    } else if (event.key === "Enter" && highlightedIndex >= 0 && matches[highlightedIndex]) {
      event.preventDefault(); choose(matches[highlightedIndex])
    } else if (event.key === "Escape") {
      event.preventDefault(); setOpen(false)
    }
  }
  return <Popover open={open} onOpenChange={(nextOpen)=>{ setOpen(nextOpen); setHighlightedIndex(-1); if(!nextOpen){ setQuery(""); onSearchChange?.("") } }}>
    <PopoverTrigger asChild><button type="button" role="combobox" aria-expanded={open} aria-controls={listId} disabled={disabled} onKeyDown={(event)=>{ if(event.key === "ArrowDown" || event.key === "ArrowUp"){ event.preventDefault(); setOpen(true) } }} className={cn(controlClass,"flex items-center justify-between gap-2 text-start disabled:cursor-not-allowed disabled:opacity-50")}><span className={cn("min-w-0 truncate",!selected&&"text-[var(--md-subtle)]")}>{selected ? <>{selected.code ? <><bdi dir="ltr">{selected.code}</bdi><span className="text-[var(--md-subtle)]"> · </span></> : null}{selected.name}</> : t(placeholder)}</span><ChevronDown className="size-3.5 shrink-0 text-[var(--md-subtle)]" /></button></PopoverTrigger>
    <PopoverContent align="start" sideOffset={5} dir={direction} className="w-[var(--radix-popover-trigger-width)] min-w-[260px] gap-1 rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] p-1 shadow-[var(--md-shadow-lift)]">
      <div className="relative m-1"><Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--md-subtle)]" /><Input autoFocus role="combobox" aria-expanded="true" aria-controls={listId} aria-activedescendant={highlightedIndex >= 0 ? `${listId}-option-${highlightedIndex}` : undefined} value={query} onChange={(event)=>{ setQuery(event.target.value); onSearchChange?.(event.target.value); setHighlightedIndex(-1) }} onKeyDown={handleSearchKeyDown} placeholder={t(searchPlaceholder)} className="h-8 rounded-[var(--md-radius-md)] ps-8 text-[12px]" />{loading ? <Loader2 className="pointer-events-none absolute end-2.5 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-[var(--md-subtle)]" /> : null}</div>
      <div ref={listRef} id={listId} role="listbox" className="max-h-56 overflow-y-auto p-1 md-scrollbar">{matches.map((option,index)=><button id={`${listId}-option-${index}`} data-option-index={index} key={option.id} type="button" role="option" aria-selected={option.id===value} onMouseMove={()=>setHighlightedIndex(index)} onClick={()=>choose(option)} className={cn("flex w-full items-center gap-2 rounded-[var(--md-radius-md)] px-2.5 py-2 text-start text-[12px] hover:bg-[var(--md-hover)]",option.id===value&&"bg-[var(--md-selected-bg)]",index===highlightedIndex&&"bg-[var(--md-hover)] ring-1 ring-inset ring-[var(--md-accent-a18)]")}>{option.code ? <bdi dir="ltr" className="shrink-0 font-medium text-[var(--md-accent)]">{option.code}</bdi> : null}<span className="min-w-0 truncate">{option.name}</span>{option.id===value?<Check className="ms-auto size-3.5 shrink-0 text-[var(--md-accent)]"/>:null}</button>)}{!loading && !matches.length?<p className="px-3 py-5 text-center text-[12px] text-[var(--md-subtle)]">{t(emptyLabel)}</p>:null}{hasMore ? <p className="px-3 py-2 text-center text-[11px] text-[var(--md-subtle)]">{t("Search to narrow the list.")}</p> : null}</div>
    </PopoverContent>
  </Popover>
}

function PurchaseOrderDetailsFields({ form, reference, organisations, organisationLoading, organisationsHaveMore, onOrganisationSearch, onOrganisationSelected, editable, generatingNumber, onGenerateNumber, patch }: { form: WarehousePurchaseOrderInput; reference: WarehousePurchaseOrderReference | null; organisations: PurchaseOrderOrganisationOption[]; organisationLoading: boolean; organisationsHaveMore: boolean; onOrganisationSearch: (value: string) => void; onOrganisationSelected: (value: PurchaseOrderOrganisationOption | null) => void; editable: boolean; generatingNumber: boolean; onGenerateNumber: () => void; patch: <K extends keyof WarehousePurchaseOrderInput>(key: K, value: WarehousePurchaseOrderInput[K]) => void }) {
  const { t } = useLanguage()
  return <div className="grid gap-x-2.5 gap-y-2 md:grid-cols-16">
    <WarehouseFormField label={t("Customer PO number")} required className="md:col-span-4"><div className="flex gap-1.5"><Input disabled={!editable} value={form.number} onChange={(event)=>patch("number",event.target.value)} className={controlClass} dir="ltr" /><Button type="button" variant="outline" disabled={!editable || !form.facilityId || generatingNumber} onClick={onGenerateNumber} className="h-9 shrink-0 rounded-[var(--md-radius-md)] px-2.5 text-[11.5px]">{generatingNumber ? <Loader2 className="size-3.5 animate-spin" /> : null}{t("Auto-generate")}</Button></div></WarehouseFormField>
    <WarehouseFormField label={t("Warehouse")} required className="md:col-span-4"><SearchablePurchaseOrderSelect disabled={!editable} value={form.facilityId} options={(reference?.facilities ?? []).map((facility)=>({ id:facility.id,name:facility.name,code:facility.code }))} placeholder="Choose warehouse" searchPlaceholder="Search warehouses…" emptyLabel="No matching warehouses" onChange={(value)=>{ patch("facilityId",value); patch("lines",form.lines.map((line)=>({ ...line,itemId:null }))) }} /></WarehouseFormField>
    <WarehouseFormField label={t("Stock owner")} required className="md:col-span-4"><SearchablePurchaseOrderSelect disabled={!editable} value={form.customerOrgId} options={organisations} placeholder="Choose organisation" searchPlaceholder="Search stock owners…" emptyLabel="No matching stock owners" remoteSearch loading={organisationLoading} hasMore={organisationsHaveMore} onSearchChange={onOrganisationSearch} onChange={(value)=>{ onOrganisationSelected(organisations.find((organisation)=>organisation.id===value) ?? null); patch("customerOrgId",value); patch("lines",form.lines.map((line)=>({ ...line,itemId:null }))) }} /></WarehouseFormField>
    <WarehouseFormField label={t("Goods from / supplier")} className="md:col-span-4"><Input disabled={!editable} value={form.supplierName} onChange={(event)=>patch("supplierName",event.target.value)} className={controlClass} dir="auto" /></WarehouseFormField>

    <WarehouseFormField label={t("Customer buyer reference")} className="md:col-span-4"><Input disabled={!editable} value={form.buyerReference ?? ""} onChange={(event)=>patch("buyerReference",event.target.value||null)} className={controlClass} dir="ltr" /></WarehouseFormField>
    <WarehouseFormField label={t("Source supplier reference")} className="md:col-span-4"><Input disabled={!editable} value={form.supplierReference ?? ""} onChange={(event)=>patch("supplierReference",event.target.value||null)} className={controlClass} dir="ltr" /></WarehouseFormField>
    <WarehouseFormField label={t("Currency")} required className="md:col-span-2"><Select disabled={!editable} value={form.currencyCode} onValueChange={(value)=>patch("currencyCode",value)}><SelectTrigger className={controlClass}><SelectValue /></SelectTrigger><SelectContent>{reference?.currencies.map((currency)=><SelectItem key={currency} value={currency}>{currency}</SelectItem>)}</SelectContent></Select></WarehouseFormField>
    <WarehouseFormField label={t("Issue date")} className="md:col-span-2"><Input disabled={!editable} type="date" value={form.issueDate ?? ""} onChange={(event)=>patch("issueDate",event.target.value||null)} className={controlClass} dir="ltr" /></WarehouseFormField>
    <WarehouseFormField label={t("Expected delivery")} className="md:col-span-4"><Input disabled={!editable} type="date" value={form.expectedDeliveryDate ?? ""} onChange={(event)=>patch("expectedDeliveryDate",event.target.value||null)} className={controlClass} dir="ltr" /></WarehouseFormField>

    <WarehouseFormField label={t("Delivery terms")} className="md:col-span-4"><Input disabled={!editable} value={form.deliveryTerms ?? ""} onChange={(event)=>patch("deliveryTerms",event.target.value||null)} className={controlClass} /></WarehouseFormField>
    <WarehouseFormField label={t("Payment terms (reference only)")} className="md:col-span-4"><Input disabled={!editable} value={form.paymentTerms ?? ""} onChange={(event)=>patch("paymentTerms",event.target.value||null)} className={controlClass} /></WarehouseFormField>
    <WarehouseFormField label={t("Notes")} className="md:col-span-8"><Input disabled={!editable} value={form.notes ?? ""} onChange={(event)=>patch("notes",event.target.value||null)} className={controlClass} dir="auto" /></WarehouseFormField>
  </div>
}

/** Reusable line editor for purchase-order entry and document-extraction review. */
export function PurchaseOrderLineEditor({
  lines,
  items,
  facilityId,
  customerOrgId,
  itemLoading,
  itemsHaveMore,
  onItemSearch,
  onItemSelected,
  disabled,
  onChange,
}: {
  lines: WarehousePurchaseOrderLine[]
  items: PurchaseOrderItemOption[]
  facilityId: string
  customerOrgId: string
  itemLoading: boolean
  itemsHaveMore: boolean
  onItemSearch: (value: string) => void
  onItemSelected: (item: PurchaseOrderItemOption | null) => void
  disabled?: boolean
  onChange: (lines: WarehousePurchaseOrderLine[]) => void
}) {
  const { t } = useLanguage()
  const patch = (index: number, changes: Partial<WarehousePurchaseOrderLine>) => onChange(lines.map((line, lineIndex)=>lineIndex === index ? { ...line, ...changes } : line))
  const rows = useMemo(() => lines.map((line, index) => ({ line, index })), [lines])
  const lineControlClass = "!h-8 w-full rounded-[var(--md-radius-sm)] border-0 bg-white/72 !px-2 !text-[12px] shadow-[var(--md-shadow-line)] active:!scale-100"
  const columns = useMemo<DataTableColumn<{ line: WarehousePurchaseOrderLine; index: number }>[]>(() => [
    { id:"item",label:"Warehouse item",width:190,minWidth:150,canHide:false,resizable:true,cell:({line,index})=><SearchablePurchaseOrderSelect disabled={disabled || !facilityId || !customerOrgId} value={line.itemId ?? ""} options={items.map((item)=>({ id:item.id,code:item.sku,name:item.description }))} placeholder="Match item" searchPlaceholder="Search warehouse items…" emptyLabel="No matching warehouse items" remoteSearch loading={itemLoading} hasMore={itemsHaveMore} onSearchChange={onItemSearch} onChange={(value)=>{ const item=items.find((candidate)=>candidate.id===value); if(item){ onItemSelected(item); patch(index,{itemId:item.id,sku:item.sku,description:line.description || item.description,uomCode:item.uomCode}) } }} /> },
    { id:"sku",label:"SKU",width:105,minWidth:80,resizable:true,cell:({line,index})=><Input disabled={disabled} value={line.sku} onChange={(event)=>patch(index,{sku:event.target.value})} className={lineControlClass} dir="ltr" /> },
    { id:"description",label:"Description",width:240,minWidth:160,canHide:false,resizable:true,cell:({line,index})=><Input disabled={disabled} value={line.description} onChange={(event)=>patch(index,{description:event.target.value})} className={lineControlClass} dir="auto" /> },
    { id:"quantity",label:"Qty",kind:"number",width:76,minWidth:64,resizable:true,cell:({line,index})=>{ const item=items.find((candidate)=>candidate.id===line.itemId); return <Input disabled={disabled} type="number" min="0.000001" step={item?.allowsFractionalQuantity?"0.001":"1"} value={line.quantity} onChange={(event)=>patch(index,{quantity:Number(event.target.value)})} className={lineControlClass} dir="ltr" /> } },
    { id:"uom",label:"UOM",width:68,minWidth:58,resizable:true,cell:({line,index})=><Input disabled={disabled} value={line.uomCode} onChange={(event)=>patch(index,{uomCode:event.target.value.toUpperCase()})} className={lineControlClass} dir="ltr" /> },
    { id:"unitPrice",label:"Goods unit value",kind:"number",width:110,minWidth:84,resizable:true,cell:({line,index})=><Input disabled={disabled} type="number" min="0" step="0.01" value={line.unitPrice} onChange={(event)=>patch(index,{unitPrice:Number(event.target.value)})} className={lineControlClass} dir="ltr" /> },
    { id:"tax",label:"Source tax %",kind:"number",width:86,minWidth:68,resizable:true,cell:({line,index})=><Input disabled={disabled} type="number" min="0" step="0.01" value={line.taxRate} onChange={(event)=>patch(index,{taxRate:Number(event.target.value)})} className={lineControlClass} dir="ltr" /> },
    { id:"supplierCode",label:"Source item code",width:120,minWidth:92,resizable:true,defaultHidden:true,cell:({line,index})=><Input disabled={disabled} value={line.supplierItemCode ?? ""} onChange={(event)=>patch(index,{supplierItemCode:event.target.value||null})} className={lineControlClass} dir="ltr" /> },
    { id:"delivery",label:"Delivery",kind:"date",width:126,minWidth:110,resizable:true,defaultHidden:true,cell:({line,index})=><Input disabled={disabled} type="date" value={line.requestedDeliveryDate ?? ""} onChange={(event)=>patch(index,{requestedDeliveryDate:event.target.value||null})} className={lineControlClass} dir="ltr" /> },
    { id:"net",label:"Net",kind:"number",width:86,minWidth:72,resizable:true,cell:({line})=><span dir="ltr" className="tabular-nums text-[12px] font-medium">{(Math.max(0,Number(line.quantity)||0)*Math.max(0,Number(line.unitPrice)||0)).toFixed(2)}</span> },
    { id:"actions",label:"",kind:"actions",width:44,minWidth:44,canHide:false,canPin:false,cell:({index})=><Button disabled={disabled || lines.length===1} type="button" variant="ghost" size="icon" aria-label={t("Remove line")} onClick={()=>onChange(lines.filter((_,lineIndex)=>lineIndex!==index))} className="size-8 rounded-[var(--md-radius-sm)] text-[var(--md-red)]"><Trash2 className="size-3.5" /></Button> },
  ], [customerOrgId, disabled, facilityId, itemLoading, items, itemsHaveMore, lines, onChange, onItemSearch, onItemSelected, t])
  return <DataTable ariaLabel="Expected receipt lines" columnsButtonLabel="Manage expected receipt line columns" storageKey="purchase-order-line-editor" columns={columns} rows={rows} getRowKey={({line,index})=>line.id ?? `line-${index}`} minimumWidth={1120} compactToolbar emptyState={null} toolbarOptions={!disabled?<Button type="button" variant="ghost" onClick={()=>onChange([...lines,emptyLine()])} className="h-8 rounded-[var(--md-radius-md)] px-2.5 text-[12px]"><Plus className="size-3.5" />{t("Add line")}</Button>:null} rowClassName="h-[48px]" tableClassName="text-[12px]" />
}

export function WarehousePurchaseOrderCreateView({ navigate }: { navigate?: (path: string) => void }) {
  const { t } = useLanguage()
  const [form, setForm] = useState<WarehousePurchaseOrderInput>(emptyInput)
  const selectors = usePurchaseOrderReferenceSelectors(form.facilityId, form.customerOrgId)
  const [saving, setSaving] = useState(false)
  const [generatingNumber, setGeneratingNumber] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [stage, setStage] = useState<PurchaseOrderExtractionStage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const editable = true
  const extractionStages = useMemo(() => [
    { id: "reading", label: t("Reading the document"), detail: t("Checking the PDF and its embedded text."), ceiling: 28, expectedMs: 2_000 },
    { id: "extracting", label: t("Finding header and lines"), detail: t("Identifying the stock owner, source supplier, dates, references and expected goods."), ceiling: 88, expectedMs: 10_000 },
    { id: "organising", label: t("Preparing the review"), detail: t("Matching extracted SKUs to warehouse items."), ceiling: 98, expectedMs: 2_000 },
  ], [t])
  const patch = <K extends keyof WarehousePurchaseOrderInput>(key: K, value: WarehousePurchaseOrderInput[K]) => setForm((current)=>({ ...current, [key]: value }))
  const total = form.lines.reduce((sum,line)=>sum+Math.max(0,line.quantity)*Math.max(0,line.unitPrice)*(1+Math.max(0,line.taxRate)/100),0)

  async function generateNumber() {
    if (!form.facilityId) return
    setGeneratingNumber(true); setError(null)
    try { patch("number", (await getNextWarehousePurchaseOrderNumber(form.facilityId)).number) }
    catch (cause) { setError(errorMessage(cause)) }
    finally { setGeneratingNumber(false) }
  }

  async function importDocument(file: File) {
    abortRef.current?.abort(); abortRef.current = new AbortController(); setExtracting(true); setError(null); setStage("reading")
    try {
      const result = await extractPurchaseOrder(file,{ signal:abortRef.current.signal,onStage:setStage })
      const matchedPages = form.facilityId && form.customerOrgId ? await Promise.all(result.lines.map((line) => (
        line.sku.trim() ? listWarehousePurchaseOrderItemsPage({ facilityId: form.facilityId, customerOrgId: form.customerOrgId, search: line.sku.trim(), limit: 25 }) : Promise.resolve({ rows: [] as PurchaseOrderItemOption[], limit: 25, offset: 0, hasMore: false })
      ))) : []
      const matchedItems = matchedPages.flatMap((page) => page.rows)
      selectors.rememberItems(matchedItems)
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
          const item = matchedItems.find((candidate)=>candidate.sku.toLowerCase() === line.sku.toLowerCase())
          return { itemId:item?.id ?? null,sku:line.sku,supplierItemCode:line.supplierItemCode || null,description:line.description,quantity:line.quantity,uomCode:item?.uomCode ?? line.uomCode,unitPrice:line.unitPrice,taxRate:line.taxRate,requestedDeliveryDate:line.requestedDeliveryDate || null,metadata:{ sourcePage:line.page,extractedCurrency:line.currencyCode } }
        }),
      }))
      toast.success(t("Customer PO extracted. Review every field before saving the expected receipt."))
    } catch (cause) {
      if (!abortRef.current?.signal.aborted) setError(errorMessage(cause))
    } finally { setExtracting(false); setStage(null) }
  }

  async function save() {
    setError(null)
    if (!form.facilityId || !form.customerOrgId || !form.number.trim() || form.lines.some((line)=>!line.description.trim() || line.quantity<=0 || !line.uomCode.trim())) { setError(t("Complete the expected receipt header and every required line field.")); return }
    setSaving(true)
    try {
      const payload = { ...form, extractionMetadata:{ ...(form.extractionMetadata ?? {}),reviewedAt:new Date().toISOString() } }
      const created = await createWarehousePurchaseOrder(payload)
      toast.success(t("Expected receipt created.")); navigate?.(purchaseOrderDetailPath(created))
    } catch (cause) { setError(errorMessage(cause)) } finally { setSaving(false) }
  }

  return <div className="grid gap-[var(--md-gap-md)]">
    <motion.header initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={mdMotion.enter} className="grid gap-3">
      <button type="button" onClick={() => navigate?.("/warehouse/purchase-orders")} className="group inline-flex h-8 w-fit items-center gap-1.5 rounded-[var(--md-radius-md)] px-2 -ms-2 text-[12.5px] font-medium text-[var(--md-text)] outline-none transition-[background,color] hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)]"><ArrowLeft className="size-3.5 rtl:rotate-180" strokeWidth={1.5} />{t("Back to expected receipts")}</button>
      <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-[24px] font-medium leading-none tracking-[-0.015em] text-[var(--md-ink)]">{t("New expected receipt")}</h1><p className="mt-1.5 text-[13px] text-[var(--md-text)]">{t("Record what the customer expects to arrive, or import their purchase order PDF. Values are reference-only and never enter the purchase subledger.")}</p></div><Button disabled={saving || extracting} onClick={() => void save()} className="h-9 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] text-[var(--md-accent-ink)]">{saving ? <Loader2 className="size-4 animate-spin" /> : null}{t("Create expected receipt")}</Button></div>
    </motion.header>
    <PurchaseOrderSection index={0} title="Expected receipt details" meta="Stock owner, expected delivery and source-document references for warehouse operations." action={<label className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-[var(--md-radius-md)] bg-white/58 px-2.5 text-[12px] font-medium shadow-[var(--md-shadow-line)]"><Upload className="size-3.5" />{t("Extract customer PO") }<input className="sr-only" type="file" accept="application/pdf,.pdf" onChange={(event)=>{ const file=event.target.files?.[0]; if(file){ patch("sourceFileName",file.name); void importDocument(file) } event.currentTarget.value="" }} /></label>}>
      {extracting ? <DocumentExtractionProgress title={t("Reading customer PO")} detail={t("Extracted values are never saved until you review and confirm them.")} fileName={form.sourceFileName ?? undefined} stages={extractionStages} activeStageId={stage} onCancel={()=>abortRef.current?.abort()} /> : <PurchaseOrderDetailsFields form={form} reference={selectors.reference} organisations={selectors.organisations} organisationLoading={selectors.organisationLoading} organisationsHaveMore={selectors.organisationsHaveMore} onOrganisationSearch={selectors.setOrganisationSearch} onOrganisationSelected={selectors.rememberOrganisation} editable onGenerateNumber={() => void generateNumber()} generatingNumber={generatingNumber} patch={patch} />}
      {error || selectors.selectorError ? <div className="mt-4 flex items-start gap-2 rounded-[var(--md-radius-lg)] bg-[var(--md-red-a08)] px-3 py-2.5 text-[12px] text-[var(--md-red)]" role="alert"><AlertCircle className="mt-0.5 size-4 shrink-0" />{t(error ?? selectors.selectorError ?? "")}</div>:null}
    </PurchaseOrderSection>
    {!extracting ? <PurchaseOrderSection index={1} title="Expected goods" meta="Match every line to a warehouse item before confirming it for goods in. Document values remain operational reference data." action={<span className="text-[12px] text-[var(--md-subtle)]">{t("Reference total")} <strong dir="ltr" className="ms-1 font-medium tabular-nums text-[var(--md-ink)]">{form.currencyCode} {total.toFixed(2)}</strong></span>}><PurchaseOrderLineEditor lines={form.lines} items={selectors.items} facilityId={form.facilityId} customerOrgId={form.customerOrgId} itemLoading={selectors.itemLoading} itemsHaveMore={selectors.itemsHaveMore} onItemSearch={selectors.setItemSearch} onItemSelected={(item)=>selectors.rememberItems(item ? [item] : [])} onChange={(lines)=>patch("lines",lines)} /></PurchaseOrderSection> : null}
  </div>
}

const purchaseOrderScopes = ["Open", "All"] as const
type PurchaseOrderScope = (typeof purchaseOrderScopes)[number]

const purchaseOrderStatuses = ["draft", "issued", "part_received", "received", "cancelled"] as const

export function purchaseOrderDetailPath(order: { id: string }) {
  return `/warehouse/purchase-orders/${encodeURIComponent(order.id)}`
}

export function warehousePurchaseOrderDetailId(route: string) {
  const match = /^\/warehouse\/purchase-orders\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.exec(route)
  return match ? decodeURIComponent(match[1]) : null
}

export function WarehousePurchaseOrdersWorkspace({ navigate }: { navigate?: (path: string) => void }) {
  const { language, t } = useLanguage()
  const [facilities, setFacilities] = useState<WarehouseFacility[]>([])
  const [orders, setOrders] = useState<WarehousePurchaseOrder[] | null>(null)
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [purchaseOrderPageSize, setPurchaseOrderPageSize] = useState(defaultPaginationPageSize)
  const [sort, setSort] = useState<WarehouseRegisterSort | null>(null)
  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get("search") ?? "")
  const [committedSearch, setCommittedSearch] = useState(search)
  const [facilityId, setFacilityId] = useState("")
  const [statusCode, setStatusCode] = useState("")
  const [scope, setScope] = useState<PurchaseOrderScope>("Open")
  const [pending, setPending] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const requestedRecordIdRef = useRef(new URLSearchParams(window.location.search).get("record"))
  const requestId = useRef(0)
  const dateOnly = useMemo(() => new Intl.DateTimeFormat(language, { dateStyle: "medium" }), [language])

  const refresh = useCallback(async function refresh() {
    const ticket = ++requestId.current
    setPending(true)
    try {
      const page = await listWarehousePurchaseOrdersPage({
        facilityId: facilityId || undefined,
        status: statusCode || undefined,
        openOnly: scope === "Open",
        search: committedSearch.trim() || undefined,
        sort,
        limit: purchaseOrderPageSize,
        offset,
      })
      if (ticket !== requestId.current) return
      setOrders(page.rows)
      setTotal(page.total)
      setError(null)
      const requested = requestedRecordIdRef.current
      if (requested) {
        requestedRecordIdRef.current = null
        navigate?.(purchaseOrderDetailPath({ id: requested }))
      }
    } catch (cause) {
      if (ticket !== requestId.current) return
      setError(errorMessage(cause))
      setOrders([])
      setTotal(0)
    } finally {
      if (ticket === requestId.current) setPending(false)
    }
  }, [facilityId, statusCode, scope, committedSearch, sort, offset, purchaseOrderPageSize, navigate])

  useEffect(() => { void refresh() }, [refresh])

  useEffect(() => {
    let live = true
    listWarehouseFacilitiesPage({ sort: { id: "name", direction: "asc" }, limit: 50, offset: 0 })
      .then((page) => { if (live) setFacilities(page.rows) })
      .catch(() => undefined)
    return () => { live = false }
  }, [])

  useEffect(() => {
    if (search === committedSearch) return
    const timer = window.setTimeout(() => { setCommittedSearch(search); setOffset(0) }, 320)
    return () => window.clearTimeout(timer)
  }, [search, committedSearch])

  const visible = orders ?? []

  const columns = useMemo<DataTableColumn<WarehousePurchaseOrder>[]>(() => [
    {
      id: "number",
      label: "Customer PO",
      width: 192,
      minWidth: 160,
      resizable: true,
      canHide: false,
      sortValue: (order) => order.number,
      cell: (order) => <div className="min-w-0"><span data-i18n-skip dir="ltr" className="text-[12px] font-medium tabular-nums text-[var(--md-ink)]">{order.number}</span><p className="truncate text-[11px] text-[var(--md-subtle)]">{order.buyerReference ?? t("No customer reference")}</p></div>,
    },
    { id: "supplier", label: "Stock owner / source", width: 210, resizable: true, sortValue: (order) => order.customerName, cell: (order) => <div className="min-w-0"><p className="truncate text-[12.5px] font-medium text-[var(--md-ink)]">{order.customerName}</p><p className="truncate text-[11px] text-[var(--md-subtle)]">{order.supplierName || t("Source not recorded")}</p></div> },
    { id: "warehouse", label: "Warehouse", width: 176, resizable: true, sortValue: (order) => order.facilityName, cell: (order) => <span className="truncate text-[12.5px] text-[var(--md-text)]">{order.facilityName}</span> },
    { id: "delivery", label: "Expected", width: 152, resizable: true, sortValue: (order) => order.expectedDeliveryDate, cell: (order) => <span className="whitespace-nowrap text-[12px] text-[var(--md-text)]">{order.expectedDeliveryDate ? dateOnly.format(new Date(`${order.expectedDeliveryDate}T00:00:00`)) : "—"}</span> },
    { id: "lines", label: "Lines", width: 88, resizable: true, headerClassName: "text-end", cellClassName: "text-end", sortValue: (order) => order.lineCount ?? order.lines.length, cell: (order) => <span dir="ltr" className="tabular-nums">{order.lineCount ?? order.lines.length}</span> },
    { id: "total", label: "Reference value", width: 140, resizable: true, headerClassName: "text-end", cellClassName: "text-end", sortValue: (order) => order.totalAmount, cell: (order) => <span dir="ltr" className="whitespace-nowrap font-medium tabular-nums text-[var(--md-ink)]">{order.currencyCode} {order.totalAmount.toFixed(2)}</span> },
    { id: "status", label: "Status", kind: "status", width: 144, resizable: true, headerClassName: "text-end", cellClassName: "text-end", sortValue: (order) => order.statusCode, cell: (order) => <StatusPill tone={statusTone(order.statusCode)}>{t(purchaseOrderStatusLabel(order.statusCode))}</StatusPill> },
  ], [dateOnly, t])

  const loaded = orders !== null
  const hasFilters = Boolean(search.trim() || facilityId || statusCode)
  const clearFilters = () => { setSearch(""); setCommittedSearch(""); setFacilityId(""); setStatusCode(""); setOffset(0) }
  const emptyState = error ? (
    <div className="mx-auto max-w-[380px]" role="alert">
      <p className="text-[13px] font-medium text-[var(--md-ink)]">{t("Expected receipts could not be loaded")}</p>
      <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{error}</p>
      <Button type="button" variant="outline" className="mt-3 h-8 rounded-[var(--md-radius-md)] text-[12px]" onClick={() => void refresh()}><RefreshCw data-icon="inline-start" className="size-3.5" strokeWidth={1.4} />{t("Try again")}</Button>
    </div>
  ) : !loaded ? (
    <DotGridLoaderPanel label="Loading expected receipts" minHeight={0} />
  ) : hasFilters ? (
    <div className="mx-auto max-w-[380px]">
      <p className="text-[13px] font-medium text-[var(--md-ink)]">{t("No expected receipts match these filters")}</p>
      <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{t("Widen the search or switch warehouse to see more.")}</p>
      <Button type="button" variant="outline" className="mt-3 h-8 rounded-[var(--md-radius-md)] text-[12px]" onClick={clearFilters}>{t("Clear filters")}</Button>
    </div>
  ) : (
    <div className="mx-auto max-w-[380px]">
      <FileSearch className="mx-auto size-5 text-[var(--md-accent)]" strokeWidth={1.35} />
      <p className="mt-2 text-[13px] font-medium text-[var(--md-ink)]">{t(scope === "Open" ? "No open expected receipts" : "No expected receipts yet")}</p>
      <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{t("Expected receipts appear here before inbound stock is booked into the warehouse.")}</p>
    </div>
  )

  return <div className="grid gap-[var(--md-page-stack-gap)]">
    <DataTable
      ariaLabel="Expected receipts"
      exportConfig={{ fileName: "warehouse-purchase-orders", register: {
        dateLabel: "Purchase order created date", dateValue: (row) => row.createdAt,
        busy: search.trim() !== committedSearch.trim(),
        loadAllRows: (signal) => collectExportPages((page) => listWarehousePurchaseOrdersPage({
          facilityId: facilityId || undefined, status: statusCode || undefined, openOnly: scope === "Open",
          search: committedSearch.trim() || undefined, sort, ...page,
        }), (row) => row.id, signal),
      } }}
      columnsButtonLabel="Manage expected receipt columns"
      storageKey="warehouse-purchase-orders"
      columns={columns}
      rows={visible}
      getRowKey={(order) => order.id}
      onRowClick={(order) => navigate?.(purchaseOrderDetailPath(order))}
      rowClassName="hover:bg-[var(--md-hover)]"
      compactToolbar
      emptyState={emptyState}
      toolbarTabs={<RegisterViewSwitch options={purchaseOrderScopes} value={scope} onChange={(value) => { setScope(value); setOffset(0) }} counts={{ [scope]: total } as Partial<Record<PurchaseOrderScope, number>>} ariaLabel="Expected receipt scope" compact />}
      toolbarSearch={<RegisterSearchField value={search} onChange={setSearch} onClear={() => { setSearch(""); setCommittedSearch(""); setOffset(0) }} label="Search expected receipts" placeholder="PO, stock owner, source" className="sm:min-w-[156px] sm:w-[156px]" />}
      toolbarFilters={<>
        <RegisterFacetSelect label="Status" allLabel="All statuses" value={statusCode} options={purchaseOrderStatuses.map((status) => ({ value: status, label: purchaseOrderStatusLabel(status) }))} onChange={(value) => { setStatusCode(value); setOffset(0) }} className="w-[120px] sm:w-[120px]" />
        <RegisterFacetSelect label="Warehouse" allLabel="All warehouses" value={facilityId} options={facilities.map((facility) => ({ value: facility.id, label: facility.name }))} onChange={(value) => { setFacilityId(value); setOffset(0) }} className="w-[132px] sm:w-[132px]" />
      </>}
      toolbarOptions={<RegisterRevalidatingMark active={pending && loaded} />}
      serverSorting={{ value: sort, onChange: (value) => { setSort(value); setOffset(0) } }}
      pagination={{ offset, limit: purchaseOrderPageSize, total, loading: pending, onOffsetChange: setOffset, onLimitChange: setPurchaseOrderPageSize, error: Boolean(error) }}
    />
  </div>
}

function PurchaseOrderSection({ index, title, meta, action, children }: { index: number; title: string; meta?: string; action?: ReactNode; children: ReactNode }) {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  return <motion.section initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={shouldReduceMotion ? { duration: 0 } : { ...mdMotion.enter, delay: staggerRamp(index, 0.05) }} className="overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)]">
    <div className="flex flex-wrap items-start justify-between gap-2 px-3.5 py-2.5 shadow-[var(--md-stroke-bottom)]"><div className="min-w-0"><h2 className="text-[13px] font-medium leading-4 text-[var(--md-ink)]">{t(title)}</h2>{meta ? <p className="mt-0.5 text-[11px] leading-4 text-[var(--md-text)]">{t(meta)}</p> : null}</div>{action ? <div className="shrink-0">{action}</div> : null}</div>
    <div className="p-3.5">{children}</div>
  </motion.section>
}

export function WarehousePurchaseOrderDetailView({ purchaseOrderId, navigate }: { purchaseOrderId: string; navigate?: (path: string) => void }) {
  const { language, t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const [order, setOrder] = useState<WarehousePurchaseOrder | null>(null)
  const [form, setForm] = useState<WarehousePurchaseOrderInput | null>(null)
  const [savedForm, setSavedForm] = useState("")
  const selectors = usePurchaseOrderReferenceSelectors(form?.facilityId ?? "", form?.customerOrgId ?? "")
  const [loadError, setLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [generatingNumber, setGeneratingNumber] = useState(false)
  const dateTime = useMemo(() => new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }), [language])

  const load = useCallback(async () => {
    try {
      const found = await getWarehousePurchaseOrder(purchaseOrderId)
      const nextForm = normaliseInput(found)
      selectors.rememberOrganisation({ id: found.customerOrgId, name: found.customerName })
      selectors.rememberItems(found.lines.flatMap((line) => line.itemId ? [{
        id: line.itemId,
        customerOrgId: found.customerOrgId,
        facilityId: found.facilityId,
        sku: line.sku,
        description: line.description,
        uomCode: line.uomCode,
        quantityBasisCode: "count" as const,
        allowsFractionalQuantity: !Number.isInteger(line.quantity),
      }] : []))
      setOrder(found); setForm(nextForm); setSavedForm(JSON.stringify(nextForm)); setLoadError(null)
    } catch (cause) { setLoadError(errorMessage(cause)) }
  }, [purchaseOrderId, selectors.rememberItems, selectors.rememberOrganisation])

  useEffect(() => { void load() }, [load])

  async function runAction(kind: "issue" | "cancel" | "inbound") {
    if (!order) return
    setSaving(true); setError(null)
    try {
      if (kind === "issue") await issueWarehousePurchaseOrder(order.id)
      else if (kind === "cancel") await cancelWarehousePurchaseOrder(order.id)
      else await createInboundOrderFromPurchaseOrder(order.id)
      toast.success(t(kind === "issue" ? "Expected receipt confirmed for goods in." : kind === "cancel" ? "Expected receipt cancelled." : "Inbound order created."))
      await load()
    } catch (cause) { setError(errorMessage(cause)) } finally { setSaving(false) }
  }

  function patch<K extends keyof WarehousePurchaseOrderInput>(key: K, value: WarehousePurchaseOrderInput[K]) {
    setForm((current) => current ? { ...current, [key]: value } : current)
  }

  async function generateNumber() {
    if (!form?.facilityId) return
    setGeneratingNumber(true); setError(null)
    try { patch("number", (await getNextWarehousePurchaseOrderNumber(form.facilityId)).number) }
    catch (cause) { setError(errorMessage(cause)) }
    finally { setGeneratingNumber(false) }
  }

  async function save() {
    if (!order || !form) return
    setError(null)
    if (!form.facilityId || !form.customerOrgId || !form.number.trim() || form.lines.some((line) => !line.description.trim() || line.quantity <= 0 || !line.uomCode.trim())) {
      setError(t("Complete the expected receipt header and every required line field.")); return
    }
    setSaving(true)
    try {
      await updateWarehousePurchaseOrder(order.id, { ...form, extractionMetadata: { ...(form.extractionMetadata ?? {}), reviewedAt: new Date().toISOString() } })
      toast.success(t("Expected receipt updated."))
      await load()
    } catch (cause) { setError(errorMessage(cause)) } finally { setSaving(false) }
  }

  const backButton = <button type="button" onClick={() => navigate?.("/warehouse/purchase-orders")} className="group inline-flex h-8 items-center gap-1.5 rounded-[var(--md-radius-md)] px-2 -ms-2 text-[12.5px] font-medium text-[var(--md-text)] outline-none transition-[background,color] duration-200 hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a24)]"><ArrowLeft className="size-3.5 transition-transform duration-200 group-hover:-translate-x-0.5 rtl:rotate-180 rtl:group-hover:translate-x-0.5" strokeWidth={1.5} />{t("Back to expected receipts")}</button>

  if (loadError) return <div className="grid gap-4">{backButton}<Surface padding="lg" className="grid min-h-[240px] place-items-center rounded-[var(--md-radius-xl)] text-center" role="alert"><div><p className="text-[15px] font-medium text-[var(--md-ink)]">{t("Expected receipt not found")}</p><p className="mt-2 text-[13px] text-[var(--md-text)]">{loadError}</p></div></Surface></div>
  if (!order || !form) return <div className="grid gap-4">{backButton}<Surface padding="lg" className="grid min-h-[240px] place-items-center rounded-[var(--md-radius-xl)]"><DotGridLoaderPanel label="Loading expected receipt" minHeight={0} /></Surface></div>

  const editable = ["draft", "issued"].includes(order.statusCode) && !order.warehouseOrderId
  const dirty = JSON.stringify(form) !== savedForm
  const canCancel = !["received", "cancelled"].includes(order.statusCode) && !order.warehouseOrderId
  const canIssue = order.statusCode === "draft" && form.lines.every((line) => line.itemId)
  const canCreateInbound = order.statusCode === "issued" && !order.warehouseOrderId
  const linkedWarehouseOrderNumber = order.events.flatMap((event) => {
    const value = event.metadata?.warehouseOrderNumber
    return typeof value === "string" && value.trim() ? [value] : []
  })[0] ?? null

  return <div className="grid gap-[var(--md-gap-md)]">
    <motion.header initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={shouldReduceMotion ? { duration: 0 } : mdMotion.enter} className="grid gap-3">
      {backButton}
      <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2.5"><h1 data-i18n-skip dir="ltr" className="text-[24px] font-medium leading-none tracking-[-0.015em] tabular-nums text-[var(--md-ink)]">{form.number}</h1><StatusPill tone={statusTone(order.statusCode)}>{t(purchaseOrderStatusLabel(order.statusCode))}</StatusPill></div><p className="mt-1.5 text-[13px] leading-5 text-[var(--md-text)]"><span dir="auto">{order.customerName}</span>{form.supplierName ? <><span className="text-[var(--md-subtle)]"> · </span><span dir="auto">{form.supplierName}</span></> : null}<span className="text-[var(--md-subtle)]"> · </span><span dir="auto">{order.facilityName}</span></p></div>
        <div className="flex flex-wrap items-center gap-2">{canCancel ? <Button variant="ghost" disabled={saving || dirty} onClick={() => void runAction("cancel")} className="h-9 rounded-[var(--md-radius-lg)] text-[13px] text-[var(--md-red)]"><XCircle className="size-4" />{t("Cancel expected receipt")}</Button> : null}{canIssue ? <Button variant="outline" disabled={saving || dirty} onClick={() => void runAction("issue")} className="h-9 rounded-[var(--md-radius-lg)]"><Send className="size-4" />{t("Confirm for goods in")}</Button> : null}{canCreateInbound ? <Button variant="outline" disabled={saving || dirty} onClick={() => void runAction("inbound")} className="h-9 rounded-[var(--md-radius-lg)]"><ArrowDownToLine className="size-4" />{t("Create inbound order")}</Button> : null}{editable ? <Button disabled={saving || !dirty} onClick={() => void save()} className="h-9 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] text-[var(--md-accent-ink)]">{saving ? <Loader2 className="size-4 animate-spin" /> : null}{t("Save changes")}</Button> : null}</div>
      </div>
    </motion.header>

    {error || selectors.selectorError ? <div className="flex items-start gap-2 rounded-[var(--md-radius-lg)] bg-[var(--md-red-a08)] px-3 py-2.5 text-[12px] text-[var(--md-red)]" role="alert"><AlertCircle className="mt-0.5 size-4 shrink-0" />{t(error ?? selectors.selectorError ?? "")}</div> : null}

    <Tabs defaultValue="details" className="gap-[var(--md-gap-md)]">
      <TabsList variant="line" className="h-auto w-full max-w-full justify-start gap-1 overflow-x-auto bg-transparent p-0">
        <TabsTrigger value="details" className="h-8 rounded-[var(--md-radius-md)] px-2.5 text-[12px]">{t("Details")}</TabsTrigger>
        <TabsTrigger value="activity" className="h-8 rounded-[var(--md-radius-md)] px-2.5 text-[12px]"><History className="size-3.5" />{t("Activity")}</TabsTrigger>
        {order.warehouseOrderId ? <TabsTrigger value="goods-in" className="h-8 rounded-[var(--md-radius-md)] px-2.5 text-[12px]"><Link2 className="size-3.5" />{t("Linked goods-in")}</TabsTrigger> : null}
      </TabsList>
      <TabsContent value="details" className="mt-0 grid content-start gap-[var(--md-gap-md)]">
        <PurchaseOrderSection index={0} title="Expected receipt details" meta="Expected inbound details from the stock owner. Customer PO values are reference-only and are not posted to accounts.">
          <PurchaseOrderDetailsFields form={form} reference={selectors.reference} organisations={selectors.organisations} organisationLoading={selectors.organisationLoading} organisationsHaveMore={selectors.organisationsHaveMore} onOrganisationSearch={selectors.setOrganisationSearch} onOrganisationSelected={selectors.rememberOrganisation} editable={editable} onGenerateNumber={() => void generateNumber()} generatingNumber={generatingNumber} patch={patch} />
        </PurchaseOrderSection>
        <PurchaseOrderSection index={1} title="Expected goods" meta="The warehouse items and quantities expected for goods in, with source-document values kept only as operational reference.">
          <PurchaseOrderLineEditor lines={form.lines} items={selectors.items} facilityId={form.facilityId} customerOrgId={form.customerOrgId} itemLoading={selectors.itemLoading} itemsHaveMore={selectors.itemsHaveMore} onItemSearch={selectors.setItemSearch} onItemSelected={(item)=>selectors.rememberItems(item ? [item] : [])} disabled={!editable} onChange={(lines) => patch("lines", lines)} />
        </PurchaseOrderSection>
        {order.sourceFileName ? <PurchaseOrderSection index={2} title="Source document"><div className="flex items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-[var(--md-radius-md)] bg-[var(--md-surface-soft)] text-[var(--md-accent)] shadow-[var(--md-shadow-line)]"><ReceiptText className="size-4" /></span><div className="min-w-0"><p dir="auto" className="truncate text-[12.5px] font-medium text-[var(--md-ink)]">{order.sourceFileName}</p><p className="mt-0.5 text-[11px] text-[var(--md-subtle)]">{t("Reviewed extraction source")}</p></div></div></PurchaseOrderSection> : null}
      </TabsContent>
      <TabsContent value="activity" className="mt-0">
        <PurchaseOrderSection index={0} title="Activity" meta="Every recorded change to this expected receipt."><ol>{order.events.length ? order.events.map((event) => <li key={event.id} className="flex gap-3 py-2.5 first:pt-0 last:pb-0"><span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-[var(--md-radius-sm)] bg-[var(--md-surface-soft)] text-[var(--md-accent)] shadow-[var(--md-shadow-line)]"><History className="size-3.5" /></span><div className="min-w-0"><p className="text-[12.5px] font-medium text-[var(--md-ink)]">{t(event.typeCode === "issued" ? "confirmed for goods in" : event.typeCode.replaceAll("_", " "))}</p><p className="mt-0.5 text-[11px] text-[var(--md-subtle)]">{dateTime.format(new Date(event.at))}{event.notes ? ` · ${event.notes}` : ""}</p></div></li>) : <p className="py-3 text-center text-[12px] text-[var(--md-text)]">{t("No activity recorded yet.")}</p>}</ol></PurchaseOrderSection>
      </TabsContent>
      {order.warehouseOrderId ? <TabsContent value="goods-in" className="mt-0">
        <PurchaseOrderSection index={0} title="Linked goods-in"><button type="button" disabled={!linkedWarehouseOrderNumber} onClick={() => linkedWarehouseOrderNumber && navigate?.(`/warehouse/orders/${encodeURIComponent(linkedWarehouseOrderNumber.toLowerCase())}?from=${encodeURIComponent(purchaseOrderDetailPath(order))}`)} className="flex w-full items-center gap-3 rounded-[var(--md-radius-md)] p-2 text-start transition-colors hover:bg-[var(--md-hover)] disabled:cursor-default disabled:opacity-60"><Link2 className="size-4 text-[var(--md-accent)]" /><span className="text-[12.5px] font-medium text-[var(--md-ink)]">{linkedWarehouseOrderNumber ?? t("Linked warehouse order")}</span></button></PurchaseOrderSection>
      </TabsContent> : null}
    </Tabs>
  </div>
}
