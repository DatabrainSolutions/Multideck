import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { toast } from "sonner"
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Download,
  FileText,
  Plus,
  Save,
  Send,
  TriangleAlert,
} from "@/components/icons/hugeicons"
import {
  UnifiedQuoteChargesWorkspace,
  type QuoteChargeParty,
  type UnifiedQuoteChargeRow,
} from "@/components/multideck/unified-quote-charges-workspace"
import { DexterActionPill } from "@/components/multideck/dexter-action-pill"
import { DexterDockedPage } from "@/components/multideck/dexter-companion-sidebar"
import { StatusPill } from "@/components/multideck/status-pill"
import { Surface } from "@/components/multideck/surface"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { useLanguage } from "@/i18n/language-provider"
import { renderDocument } from "@/lib/document-builder-api"
import {
  convertQuoteWorkflow,
  downloadQuoteDocument,
  getQuoteSources,
  getQuoteWorkflow,
  saveQuoteWorkflow,
  transitionQuoteWorkflow,
  type QuoteSavePayload,
  type QuoteSourceOption,
  type QuoteSupplierOption,
  type QuoteWorkflowCharge,
  type QuoteWorkflowRecord,
  type QuoteWorkflowWorkspace,
} from "@/lib/quote-workflow-api"

type WorkflowTab = "details" | "charges" | "documents" | "audit"

const directionOptions = ["import", "export", "cross trade"] as const
const modeOptions = ["sea", "air", "road"] as const
const shipmentTypes = {
  sea: ["FCL", "LCL", "Breakbulk", "RoRo"],
  air: ["Air freight", "ULD", "Back-to-back", "Express / courier"],
  road: ["FTL", "LTL", "Groupage", "Pallet network", "Dedicated vehicle"],
} as const
function lifecycleTone(lifecycle: string) {
  if (["accepted", "converted"].includes(lifecycle)) return "green" as const
  if (lifecycle === "declined") return "red" as const
  if (lifecycle === "sent") return "teal" as const
  if (lifecycle === "generated") return "blue" as const
  if (lifecycle === "ghosted") return "neutral" as const
  return "amber" as const
}

function emptyRecord(): QuoteWorkflowRecord {
  return {
    id: "",
    reference: "New quote",
    lifecycle: "draft",
    sourceType: "account",
    sourceId: "",
    customerId: "",
    customerName: "",
    direction: "export",
    mode: "sea",
    shipmentType: "FCL",
    serviceLevel: "Standard",
    currency: "GBP",
    collectionAddress: "",
    loadingPoint: "",
    dischargePoint: "",
    deliveryAddress: "",
    incoterm: "DAP",
    validFrom: new Date().toISOString().slice(0, 10),
    validTo: "",
    supplierName: "",
    shipmentFacts: { description: "", pieces: "", weightKg: "", volumeCbm: "", equipment: "" },
    customerNotes: "",
    internalNotes: "",
    terms: "Rates are subject to availability and the stated validity period.",
    rateSourceType: "manual",
    rateSourceLabel: "Manual supplier rate",
    defaultMarkupPct: 15,
    markupOverrideReason: "",
    shipper: null,
    consignee: null,
  }
}

function emptyCharge(currency = "GBP"): QuoteWorkflowCharge {
  return {
    id: crypto.randomUUID(),
    description: "Freight charge",
    costCurrency: currency,
    costAmount: 0,
    costLocal: 0,
    costRoe: 1,
    sellCurrency: currency,
    sellAmount: 0,
    sellLocal: 0,
    sellRoe: 1,
    calculationBasis: "fixed",
    quantity: 1,
    defaultMarkupPct: 15,
    appliedMarkupPct: 15,
    showToCustomer: true,
  }
}

function inputClass() {
  return "h-10 rounded-[var(--md-radius-md)] border-0 bg-[var(--md-field-bg)] text-base shadow-[var(--md-shadow-line)] md:text-[13px]"
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  const { t } = useLanguage()
  return (
    <label className="min-w-0">
      <span className="mb-1.5 block text-[12px] font-medium text-[var(--md-text)]">{t(label)}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-[11px] leading-4 text-[var(--md-subtle)]">{t(hint)}</span> : null}
    </label>
  )
}

function money(value: number, currency: string, language: string) {
  return new Intl.NumberFormat(language, { style: "currency", currency, maximumFractionDigits: 2 }).format(value)
}

export function QuoteWorkflowPage({ quoteReference, navigate }: { quoteReference?: string; navigate: (path: string) => void }) {
  const { language, t } = useLanguage()
  const isNew = !quoteReference || quoteReference === "new"
  const [workspace, setWorkspace] = useState<QuoteWorkflowWorkspace | null>(null)
  const [record, setRecord] = useState<QuoteWorkflowRecord>(emptyRecord)
  const [charges, setCharges] = useState<QuoteWorkflowCharge[]>(() => [emptyCharge()])
  const [sources, setSources] = useState<QuoteSourceOption[]>([])
  const [suppliers, setSuppliers] = useState<QuoteSupplierOption[]>([])
  const [activeTab, setActiveTab] = useState<WorkflowTab>("details")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [runningAction, setRunningAction] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dexterOpen, setDexterOpen] = useState(false)
  const [sendOpen, setSendOpen] = useState(false)
  const [outcomeOpen, setOutcomeOpen] = useState<"accepted" | "declined" | "ghosted" | null>(null)
  const [convertOpen, setConvertOpen] = useState(false)
  const [actionNote, setActionNote] = useState("")
  const [followUpAt, setFollowUpAt] = useState("")
  const [shipperName, setShipperName] = useState("")
  const [consigneeName, setConsigneeName] = useState("")
  const [operationalNotes, setOperationalNotes] = useState("")
  const [savedSignature, setSavedSignature] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [optionData, loadedWorkspace] = await Promise.all([
        getQuoteSources(),
        isNew ? Promise.resolve(null) : getQuoteWorkflow(String(quoteReference).toUpperCase()),
      ])
      setSources(optionData.sources)
      setSuppliers(optionData.suppliers)
      if (isNew) {
        const initial = emptyRecord()
        const firstSource = optionData.sources[0]
        if (firstSource) {
          initial.sourceType = firstSource.type
          initial.sourceId = firstSource.id
          initial.customerName = firstSource.label
          initial.contactName = firstSource.contactName
          initial.contactEmail = firstSource.contactEmail
        }
        setRecord(initial)
        const initialCharges = [emptyCharge(initial.currency ?? "GBP")]
        setCharges(initialCharges)
        setSavedSignature(JSON.stringify({ record: initial, charges: initialCharges }))
        setWorkspace(null)
      } else {
        const result = loadedWorkspace!
        const loadedCharges = result.charges.length ? result.charges : [emptyCharge(result.quote.currency ?? "GBP")]
        setWorkspace(result)
        setRecord(result.quote)
        setCharges(loadedCharges)
        setShipperName(result.quote.shipper?.name ?? "")
        setConsigneeName(result.quote.consignee?.name ?? "")
        setSavedSignature(JSON.stringify({ record: result.quote, charges: loadedCharges }))
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The quote workspace could not be loaded.")
    } finally {
      setLoading(false)
    }
  }, [isNew, quoteReference])

  useEffect(() => { void load() }, [load])

  const currentSignature = useMemo(() => JSON.stringify({ record, charges }), [record, charges])
  const dirty = currentSignature !== savedSignature
  const readOnly = ["accepted", "converted"].includes(record.lifecycle)
  const currentShipmentTypes = shipmentTypes[(record.mode as keyof typeof shipmentTypes) || "sea"] ?? shipmentTypes.sea
  const totals = useMemo(() => charges.reduce((result, charge) => {
    const cost = charge.costRoe > 0 ? charge.costAmount / charge.costRoe : charge.costAmount
    const sell = charge.sellRoe > 0 ? charge.sellAmount / charge.sellRoe : charge.sellAmount
    return { cost: result.cost + cost, sell: result.sell + sell }
  }, { cost: 0, sell: 0 }), [charges])
  const profit = totals.sell - totals.cost
  const margin = totals.sell ? profit / totals.sell * 100 : 0

  const parties = useMemo<QuoteChargeParty[]>(() => [
    ...suppliers.map((supplier) => ({ id: supplier.id, code: supplier.name.slice(0, 6).toUpperCase(), name: supplier.name, roles: ["supplier"] as const })),
    ...(record.customerId ? [{ id: record.customerId, code: record.customerName.slice(0, 6).toUpperCase(), name: record.customerName, roles: ["customer"] as const }] : []),
  ], [record.customerId, record.customerName, suppliers])

  const chargeRows = useMemo<UnifiedQuoteChargeRow[]>(() => charges.map((charge) => ({
    id: charge.id,
    code: charge.description.slice(0, 8).toUpperCase().replace(/[^A-Z0-9]/g, "") || "CHARGE",
    description: charge.description,
    supplierId: charge.supplierId ?? record.supplierId,
    customerId: record.customerId || null,
    cost: charge.costAmount,
    costCurrency: charge.costCurrency,
    sell: charge.sellAmount,
    sellCurrency: charge.sellCurrency,
    costRoe: charge.costRoe,
    sellRoe: charge.sellRoe,
    costRoeSource: "manual",
    sellRoeSource: "manual",
  })), [charges, record.customerId, record.supplierId])

  function updateRecord<K extends keyof QuoteWorkflowRecord>(field: K, value: QuoteWorkflowRecord[K]) {
    setRecord((current) => ({ ...current, [field]: value }))
  }

  function updateShipmentFact(field: string, value: string) {
    setRecord((current) => ({ ...current, shipmentFacts: { ...current.shipmentFacts, [field]: value } }))
  }

  function selectSource(value: string) {
    const [type, id] = value.split(":") as ["lead" | "account", string]
    const source = sources.find((option) => option.type === type && option.id === id)
    if (!source) return
    setRecord((current) => ({ ...current, sourceType: type, sourceId: id, customerName: source.label, contactName: source.contactName ?? "", contactEmail: source.contactEmail ?? "" }))
  }

  function selectSupplier(id: string) {
    const supplier = suppliers.find((option) => option.id === id)
    setRecord((current) => ({ ...current, supplierId: id, supplierName: supplier?.name ?? "" }))
    setCharges((current) => current.map((charge) => ({ ...charge, supplierId: id })))
  }

  function updateChargeRows(rows: UnifiedQuoteChargeRow[]) {
    setCharges((current) => rows.map((row) => {
      const existing = current.find((charge) => charge.id === row.id)
      const costLocal = row.costRoe && row.costRoe > 0 ? row.cost / row.costRoe : row.cost
      const sellLocal = row.sellRoe && row.sellRoe > 0 ? row.sell / row.sellRoe : row.sell
      const appliedMarkup = costLocal > 0 ? (sellLocal - costLocal) / costLocal * 100 : record.defaultMarkupPct
      return {
        ...(existing ?? emptyCharge(record.currency ?? "GBP")), id: row.id, description: row.description,
        supplierId: row.supplierId, costCurrency: row.costCurrency, costAmount: row.cost, costLocal,
        costRoe: row.costRoe ?? 1, sellCurrency: row.sellCurrency, sellAmount: row.sell, sellLocal,
        sellRoe: row.sellRoe ?? 1, appliedMarkupPct: appliedMarkup,
      }
    }))
  }

  function applyDefaultMarkup() {
    const markup = Number(record.defaultMarkupPct) || 0
    setCharges((current) => current.map((charge) => ({
      ...charge,
      sellCurrency: charge.costCurrency,
      sellRoe: charge.costRoe,
      sellAmount: Number((charge.costAmount * (1 + markup / 100)).toFixed(2)),
      appliedMarkupPct: markup,
      defaultMarkupPct: markup,
    })))
    toast.success(t("Default markup applied"), { description: t("Every sell line remains editable.") })
  }

  function payload(): QuoteSavePayload {
    return {
      sourceType: record.sourceType,
      sourceId: record.sourceId,
      contactName: record.contactName,
      contactEmail: record.contactEmail,
      direction: record.direction,
      mode: record.mode,
      shipmentType: record.shipmentType,
      serviceLevel: record.serviceLevel,
      currency: record.currency,
      collectionAddress: record.collectionAddress,
      loadingPoint: record.loadingPoint,
      dischargePoint: record.dischargePoint,
      deliveryAddress: record.deliveryAddress,
      incoterm: record.incoterm,
      validFrom: record.validFrom,
      validTo: record.validTo,
      deadline: record.deadline,
      supplierId: record.supplierId,
      supplierName: record.supplierName,
      shipmentFacts: record.shipmentFacts,
      customerNotes: record.customerNotes,
      internalNotes: record.internalNotes,
      terms: record.terms,
      rateSourceType: record.rateSourceType,
      rateSourceLabel: record.rateSourceLabel,
      defaultMarkupPct: record.defaultMarkupPct,
      markupOverrideReason: record.markupOverrideReason,
      followUpAt: record.followUpAt,
      shipper: record.shipper,
      consignee: record.consignee,
      charges,
    }
  }

  async function save() {
    setSaving(true)
    try {
      const result = await saveQuoteWorkflow(record.id || null, payload())
      toast.success(t(isNew ? "Quote created" : "Quote saved"), { description: result.reference })
      if (isNew) navigate(`/quotes/${result.reference.toLowerCase()}`)
      else await load()
      return result
    } catch (caught) {
      toast.error(t("Quote could not be saved"), { description: caught instanceof Error ? caught.message : undefined })
      return null
    } finally {
      setSaving(false)
    }
  }

  async function transition(action: "calculated" | "sent" | "revised" | "accepted" | "declined" | "ghosted", note = actionNote, nextFollowUp = followUpAt) {
    if (!record.id) return
    setRunningAction(action)
    try {
      await transitionQuoteWorkflow(record.id, action, note, nextFollowUp || undefined)
      toast.success(t(`Quote ${action}`))
      setSendOpen(false)
      setOutcomeOpen(null)
      setActionNote("")
      await load()
    } catch (caught) {
      toast.error(t("Quote action could not be completed"), { description: caught instanceof Error ? caught.message : undefined })
    } finally {
      setRunningAction(null)
    }
  }

  async function generateDocument() {
    if (!record.id || dirty) return
    setRunningAction("generate")
    try {
      const result = await renderDocument({
        templateCode: "CUSTOMER_QUOTE",
        targetType: "CusQuote_Header",
        targetReference: record.reference,
        outputFormat: "pdf",
        contentSections: ["quote", "customer", "movement", "charges", "terms"],
        reason: "Customer quote issue",
      })
      toast.success(t("Quote document generated"), { description: result.fileName })
      window.open(result.signedUrl, "_blank", "noopener,noreferrer")
      await load()
    } catch (caught) {
      toast.error(t("Quote document could not be generated"), { description: caught instanceof Error ? caught.message : undefined })
    } finally {
      setRunningAction(null)
    }
  }

  async function downloadDocument(generatedDocumentId: string) {
    try {
      const result = await downloadQuoteDocument(generatedDocumentId)
      window.open(result.signedUrl, "_blank", "noopener,noreferrer")
    } catch (caught) {
      toast.error(t("Quote document could not be downloaded"), { description: caught instanceof Error ? caught.message : undefined })
    }
  }

  async function convert() {
    if (!record.id) return
    setRunningAction("convert")
    try {
      const result = await convertQuoteWorkflow(record.id, {
        shipperId: record.shipper?.orgId ?? undefined,
        shipperName,
        consigneeId: record.consignee?.orgId ?? undefined,
        consigneeName,
        operationalNotes,
      })
      toast.success(t("Booking created"), { description: result.bookingReference })
      setConvertOpen(false)
      navigate(`/bookings/${result.bookingReference.toLowerCase()}`)
    } catch (caught) {
      toast.error(t("Booking could not be created"), { description: caught instanceof Error ? caught.message : undefined })
    } finally {
      setRunningAction(null)
    }
  }

  if (loading) {
    return <main className="md-page"><Surface className="min-h-48 animate-pulse rounded-[var(--md-radius-xl)]"><span className="sr-only">{t("Loading quote")}</span></Surface></main>
  }

  if (error && !workspace && (!isNew || sources.length === 0)) {
    return (
      <main className="md-page">
        <Surface padding="none" className="rounded-[var(--md-radius-xl)] p-5">
          <TriangleAlert className="size-5 text-[var(--md-red)]" strokeWidth={1.4} />
          <h1 className="mt-3 text-[18px] font-medium text-[var(--md-ink)]">{t("Quote workspace unavailable")}</h1>
          <p className="mt-1 max-w-xl text-[13px] leading-5 text-[var(--md-text)]">{t(error)}</p>
          <div className="mt-4 flex gap-2">
            <Button type="button" variant="ghost" onClick={() => navigate("/quotes")} className="shadow-[var(--md-shadow-line)]">{t("Back to quotes")}</Button>
            <Button type="button" onClick={() => void load()}>{t("Try again")}</Button>
          </div>
        </Surface>
      </main>
    )
  }

  return (
    <DexterDockedPage open={dexterOpen} onClose={() => setDexterOpen(false)} contextLabel={`${t("Quote")} ${record.reference}`}>
      <main className="md-page md-page-stack-compact">
        <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Button type="button" variant="ghost" size="icon" onClick={() => navigate("/quotes")} aria-label={t("Back to quotes")} className="shrink-0 rounded-[var(--md-radius-md)] shadow-[var(--md-shadow-line)]">
              <ArrowLeft className="size-4 rtl:rotate-180" strokeWidth={1.4} />
            </Button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-[24px] font-medium text-[var(--md-ink)]">{isNew ? t("New quote") : record.reference}</h1>
                <StatusPill tone={lifecycleTone(record.lifecycle)}>{t(record.lifecycle.replaceAll("_", " "))}</StatusPill>
              </div>
              <p className="mt-1 text-[12px] text-[var(--md-subtle)]">{t("One commercial record from request through accepted booking.")}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <DexterActionPill onClick={() => setDexterOpen(true)} />
            {!readOnly ? <Button type="button" variant="ghost" disabled={!dirty || saving} onClick={() => void save()} className="shadow-[var(--md-shadow-line)]"><Save data-icon="inline-start" className="size-4" />{t(saving ? "Saving…" : "Save")}</Button> : null}
            {!isNew && record.lifecycle === "draft" ? <Button type="button" disabled={dirty || runningAction !== null} onClick={() => void transition("calculated")}><CheckCircle2 data-icon="inline-start" className="size-4" />{t("Calculate")}</Button> : null}
            {!isNew && ["calculated", "revised"].includes(record.lifecycle) ? <Button type="button" disabled={dirty || runningAction !== null} onClick={() => void generateDocument()}><FileText data-icon="inline-start" className="size-4" />{t(runningAction === "generate" ? "Generating…" : "Generate quote")}</Button> : null}
            {!isNew && ["generated", "revised"].includes(record.lifecycle) ? <Button type="button" disabled={runningAction !== null} onClick={() => setSendOpen(true)}><Send data-icon="inline-start" className="size-4" />{t("Send and follow up")}</Button> : null}
            {!isNew && record.lifecycle === "sent" ? <Button type="button" disabled={runningAction !== null} onClick={() => setOutcomeOpen("accepted")}><CheckCircle2 data-icon="inline-start" className="size-4" />{t("Record outcome")}</Button> : null}
            {!isNew && ["generated", "sent", "declined", "ghosted"].includes(record.lifecycle) ? <Button type="button" variant="ghost" disabled={runningAction !== null} onClick={() => void transition("revised")} className="shadow-[var(--md-shadow-line)]">{t("Revise")}</Button> : null}
            {!isNew && record.lifecycle === "accepted" ? <Button type="button" disabled={runningAction !== null} onClick={() => setConvertOpen(true)}><Plus data-icon="inline-start" className="size-4" />{t("Create booking")}</Button> : null}
          </div>
        </header>

        {error ? <div role="alert" className="rounded-[var(--md-radius-lg)] bg-[color-mix(in_srgb,var(--md-red)_9%,transparent)] px-4 py-3 text-[13px] text-[var(--md-red)] shadow-[var(--md-shadow-line)]">{t(error)}</div> : null}
        {dirty && !isNew && ["calculated", "generated", "sent", "revised"].includes(record.lifecycle) ? (
          <div className="flex items-start gap-2 rounded-[var(--md-radius-lg)] bg-[color-mix(in_srgb,var(--md-amber)_10%,transparent)] px-4 py-3 text-[12px] text-[var(--md-text)] shadow-[var(--md-shadow-line)]">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[var(--md-amber)]" strokeWidth={1.4} />
            <span>{t("Save these changes before progressing the quote. A changed issued quote becomes a new version.")}</span>
          </div>
        ) : null}

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as WorkflowTab)}>
          <TabsList className="h-10 w-full justify-start overflow-x-auto rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] p-1 shadow-[var(--md-shadow-line)] sm:w-auto">
            <TabsTrigger value="details">{t("Details")}</TabsTrigger>
            <TabsTrigger value="charges">{t("Charges")}</TabsTrigger>
            <TabsTrigger value="documents">{t("Documents")}</TabsTrigger>
            <TabsTrigger value="audit">{t("Follow-up and audit")}</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="mt-3 space-y-3">
            <Surface padding="none" className="rounded-[var(--md-radius-xl)] p-4 sm:p-5">
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
                <section>
                  <h2 className="text-[16px] font-medium text-[var(--md-ink)]">{t("Request and movement")}</h2>
                  <p className="mt-1 text-[12px] text-[var(--md-subtle)]">{t("Capture only what is needed to price the movement. Booking-only details can follow after acceptance.")}</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <Field label="Lead or account">
                      <Select value={record.sourceId ? `${record.sourceType}:${record.sourceId}` : undefined} onValueChange={selectSource} disabled={!isNew || readOnly}>
                        <SelectTrigger className={inputClass()}><SelectValue placeholder={t("Choose a lead or account")} /></SelectTrigger>
                        <SelectContent>{sources.map((source) => <SelectItem key={`${source.type}:${source.id}`} value={`${source.type}:${source.id}`}><span className="font-medium">{source.label}</span><span className="ms-2 text-[11px] text-[var(--md-subtle)]">{t(source.type)}</span></SelectItem>)}</SelectContent>
                      </Select>
                    </Field>
                    <Field label="Primary contact"><Input value={record.contactName ?? ""} onChange={(event) => updateRecord("contactName", event.target.value)} disabled={readOnly} className={inputClass()} /></Field>
                    <Field label="Contact email"><Input type="email" dir="ltr" value={record.contactEmail ?? ""} onChange={(event) => updateRecord("contactEmail", event.target.value)} disabled={readOnly} className={inputClass()} /></Field>
                    <Field label="Direction">
                      <Select value={record.direction ?? "export"} onValueChange={(value) => updateRecord("direction", value)} disabled={readOnly}><SelectTrigger className={inputClass()}><SelectValue /></SelectTrigger><SelectContent>{directionOptions.map((value) => <SelectItem key={value} value={value}>{t(value)}</SelectItem>)}</SelectContent></Select>
                    </Field>
                    <Field label="Mode">
                      <Select value={record.mode ?? "sea"} onValueChange={(value) => { updateRecord("mode", value); updateRecord("shipmentType", shipmentTypes[value as keyof typeof shipmentTypes][0]) }} disabled={readOnly}><SelectTrigger className={inputClass()}><SelectValue /></SelectTrigger><SelectContent>{modeOptions.map((value) => <SelectItem key={value} value={value}>{t(value)}</SelectItem>)}</SelectContent></Select>
                    </Field>
                    <Field label="Shipment type">
                      <Select value={record.shipmentType ?? currentShipmentTypes[0]} onValueChange={(value) => updateRecord("shipmentType", value)} disabled={readOnly}><SelectTrigger className={inputClass()}><SelectValue /></SelectTrigger><SelectContent>{currentShipmentTypes.map((value) => <SelectItem key={value} value={value}>{t(value)}</SelectItem>)}</SelectContent></Select>
                    </Field>
                    <Field label="Collection address"><Input dir="auto" value={record.collectionAddress ?? ""} onChange={(event) => updateRecord("collectionAddress", event.target.value)} disabled={readOnly} className={inputClass()} /></Field>
                    {record.mode !== "road" ? <Field label={record.mode === "air" ? "Departure airport" : "Port of loading"}><Input dir="auto" value={record.loadingPoint ?? ""} onChange={(event) => updateRecord("loadingPoint", event.target.value)} disabled={readOnly} className={inputClass()} /></Field> : null}
                    {record.mode !== "road" ? <Field label={record.mode === "air" ? "Arrival airport" : "Port of discharge"}><Input dir="auto" value={record.dischargePoint ?? ""} onChange={(event) => updateRecord("dischargePoint", event.target.value)} disabled={readOnly} className={inputClass()} /></Field> : null}
                    <Field label="Delivery address"><Input dir="auto" value={record.deliveryAddress ?? ""} onChange={(event) => updateRecord("deliveryAddress", event.target.value)} disabled={readOnly} className={inputClass()} /></Field>
                    <Field label="Valid from"><Input type="date" dir="ltr" value={record.validFrom ?? ""} onChange={(event) => updateRecord("validFrom", event.target.value)} disabled={readOnly} className={inputClass()} /></Field>
                    <Field label="Valid to"><Input type="date" dir="ltr" value={record.validTo ?? ""} onChange={(event) => updateRecord("validTo", event.target.value)} disabled={readOnly} className={inputClass()} /></Field>
                    <Field label="Quote due"><Input type="datetime-local" dir="ltr" value={record.deadline?.slice(0, 16) ?? ""} onChange={(event) => updateRecord("deadline", event.target.value)} disabled={readOnly} className={inputClass()} /></Field>
                    <Field label="Incoterm"><Input dir="ltr" value={record.incoterm ?? ""} onChange={(event) => updateRecord("incoterm", event.target.value.toUpperCase())} disabled={readOnly} className={inputClass()} /></Field>
                    <Field label="Service level"><Input value={record.serviceLevel ?? ""} onChange={(event) => updateRecord("serviceLevel", event.target.value)} disabled={readOnly} className={inputClass()} /></Field>
                  </div>
                </section>
                <section className="min-w-0 rounded-[calc(var(--md-radius-xl)-4px)] bg-[var(--md-surface-tint)] p-4 shadow-[var(--md-shadow-line)]">
                  <h2 className="text-[16px] font-medium text-[var(--md-ink)]">{t("Cargo and supplier")}</h2>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                    <Field label="Supplier" hint="Required before calculation">
                      <Select value={record.supplierId ?? undefined} onValueChange={selectSupplier} disabled={readOnly}><SelectTrigger className={inputClass()}><SelectValue placeholder={t("Choose supplier")} /></SelectTrigger><SelectContent>{suppliers.map((supplier) => <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}</SelectItem>)}</SelectContent></Select>
                    </Field>
                    <Field label="Rate source">
                      <Select value={record.rateSourceType ?? "manual"} onValueChange={(value) => updateRecord("rateSourceType", value)} disabled={readOnly}><SelectTrigger className={inputClass()}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="manual">{t("Manual spot rate")}</SelectItem><SelectItem value="uploaded">{t("Uploaded supplier quote")}</SelectItem><SelectItem value="tariff">{t("Stored tariff")}</SelectItem><SelectItem value="provider">{t("Provider result")}</SelectItem></SelectContent></Select>
                    </Field>
                    <Field label="Source reference"><Input value={record.rateSourceLabel ?? ""} onChange={(event) => updateRecord("rateSourceLabel", event.target.value)} disabled={readOnly} className={inputClass()} /></Field>
                    <Field label="Currency"><Select value={record.currency ?? "GBP"} onValueChange={(value) => updateRecord("currency", value)} disabled={readOnly}><SelectTrigger className={inputClass()}><SelectValue /></SelectTrigger><SelectContent>{["GBP", "USD", "EUR", "JPY", "AUD", "CAD"].map((value) => <SelectItem key={value} value={value}><span dir="ltr">{value}</span></SelectItem>)}</SelectContent></Select></Field>
                    <Field label="Cargo description"><Input value={String(record.shipmentFacts.description ?? "")} onChange={(event) => updateShipmentFact("description", event.target.value)} disabled={readOnly} className={inputClass()} /></Field>
                    <Field label="Equipment / load"><Input value={String(record.shipmentFacts.equipment ?? "")} onChange={(event) => updateShipmentFact("equipment", event.target.value)} disabled={readOnly} placeholder={record.shipmentType === "FCL" ? t("1 × 40HC") : undefined} className={inputClass()} /></Field>
                    <Field label="Pieces"><Input type="number" dir="ltr" value={String(record.shipmentFacts.pieces ?? "")} onChange={(event) => updateShipmentFact("pieces", event.target.value)} disabled={readOnly} className={inputClass()} /></Field>
                    <Field label="Weight (kg)"><Input type="number" dir="ltr" value={String(record.shipmentFacts.weightKg ?? "")} onChange={(event) => updateShipmentFact("weightKg", event.target.value)} disabled={readOnly} className={inputClass()} /></Field>
                    <Field label="Cube (CBM)"><Input type="number" dir="ltr" value={String(record.shipmentFacts.volumeCbm ?? "")} onChange={(event) => updateShipmentFact("volumeCbm", event.target.value)} disabled={readOnly} className={inputClass()} /></Field>
                    {record.rateSourceType === "uploaded" ? <div className="sm:col-span-2 xl:col-span-1 2xl:col-span-2"><Button type="button" variant="ghost" onClick={() => navigate("/rates/imports")} className="w-full shadow-[var(--md-shadow-line)]"><FileText data-icon="inline-start" className="size-4" />{t("Open supplier rate imports")}</Button></div> : null}
                  </div>
                </section>
              </div>
            </Surface>

            <Surface padding="none" className="rounded-[var(--md-radius-xl)] p-4 sm:p-5">
              <div className="grid gap-5 lg:grid-cols-2">
                <section>
                  <h2 className="text-[15px] font-medium text-[var(--md-ink)]">{t("Customer copy")}</h2>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Field label="Customer-facing notes"><Textarea value={record.customerNotes ?? ""} onChange={(event) => updateRecord("customerNotes", event.target.value)} disabled={readOnly} className="min-h-24 rounded-[var(--md-radius-md)] bg-[var(--md-field-bg)] shadow-[var(--md-shadow-line)]" /></Field>
                    <Field label="Terms and validity"><Textarea value={record.terms ?? ""} onChange={(event) => updateRecord("terms", event.target.value)} disabled={readOnly} className="min-h-24 rounded-[var(--md-radius-md)] bg-[var(--md-field-bg)] shadow-[var(--md-shadow-line)]" /></Field>
                  </div>
                </section>
                <section>
                  <h2 className="text-[15px] font-medium text-[var(--md-ink)]">{t("Booking hand-off — optional until acceptance")}</h2>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Field label="Shipper"><Input value={record.shipper?.name ?? ""} onChange={(event) => updateRecord("shipper", { ...(record.shipper ?? {}), name: event.target.value })} disabled={readOnly} className={inputClass()} /></Field>
                    <Field label="Consignee"><Input value={record.consignee?.name ?? ""} onChange={(event) => updateRecord("consignee", { ...(record.consignee ?? {}), name: event.target.value })} disabled={readOnly} className={inputClass()} /></Field>
                    <Field label="Internal notes"><Textarea value={record.internalNotes ?? ""} onChange={(event) => updateRecord("internalNotes", event.target.value)} disabled={readOnly} className="min-h-20 rounded-[var(--md-radius-md)] bg-[var(--md-field-bg)] shadow-[var(--md-shadow-line)]" /></Field>
                  </div>
                </section>
              </div>
            </Surface>
          </TabsContent>

          <TabsContent value="charges" className="mt-3 space-y-3">
            <Surface padding="none" className="rounded-[var(--md-radius-xl)] p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h2 className="text-[16px] font-medium text-[var(--md-ink)]">{t("Commercial calculation")}</h2>
                  <p className="mt-1 text-[12px] text-[var(--md-subtle)]">{t("The default markup is a starting point. Every sell line remains editable and overrides are retained.")}</p>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <Field label="Default markup %"><Input type="number" dir="ltr" value={record.defaultMarkupPct} onChange={(event) => updateRecord("defaultMarkupPct", Number(event.target.value))} disabled={readOnly} className="h-9 w-28 rounded-[var(--md-radius-md)] bg-[var(--md-field-bg)] text-end shadow-[var(--md-shadow-line)]" /></Field>
                  <Button type="button" variant="ghost" disabled={readOnly} onClick={applyDefaultMarkup} className="shadow-[var(--md-shadow-line)]">{t("Apply to lines")}</Button>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
                {[{ label: "In total", value: totals.cost }, { label: "Out total", value: totals.sell }, { label: "Profit", value: profit }, { label: "Profit percentage", value: margin, percentage: true }].map((metric) => (
                  <div key={metric.label} className="rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-3 py-3 shadow-[var(--md-shadow-line)]">
                    <span className="text-[11px] text-[var(--md-subtle)]">{t(metric.label)}</span>
                    <strong dir="ltr" className="mt-1 block text-[18px] font-medium tabular-nums text-[var(--md-ink)]">{metric.percentage ? `${metric.value.toFixed(2)}%` : money(metric.value, record.currency ?? "GBP", language)}</strong>
                  </div>
                ))}
              </div>
            </Surface>
            <UnifiedQuoteChargesWorkspace rows={chargeRows} onRowsChange={updateChargeRows} parties={parties} baseCurrency={record.currency ?? "GBP"} readOnly={readOnly} storageKey={`quote-workflow-${record.id || "new"}`} />
            <Surface padding="none" className="rounded-[var(--md-radius-xl)] p-4">
              <Field label="Markup override reason" hint="Required by policy when the overall or line markup differs from the customer default."><Textarea value={record.markupOverrideReason ?? ""} onChange={(event) => updateRecord("markupOverrideReason", event.target.value)} disabled={readOnly} className="min-h-20 rounded-[var(--md-radius-md)] bg-[var(--md-field-bg)] shadow-[var(--md-shadow-line)]" /></Field>
            </Surface>
          </TabsContent>

          <TabsContent value="documents" className="mt-3">
            <Surface padding="none" className="rounded-[var(--md-radius-xl)] p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div><h2 className="text-[16px] font-medium text-[var(--md-ink)]">{t("Issued quote versions")}</h2><p className="mt-1 text-[12px] text-[var(--md-subtle)]">{t("Each generated customer document keeps the exact calculation and route snapshot used at issue.")}</p></div>
                {!isNew && ["calculated", "revised"].includes(record.lifecycle) ? <Button type="button" disabled={dirty || runningAction !== null} onClick={() => void generateDocument()}><FileText data-icon="inline-start" className="size-4" />{t("Generate")}</Button> : null}
              </div>
              <div className="mt-4 divide-y divide-[color-mix(in_srgb,var(--md-ink)_7%,transparent)]">
                {workspace?.versions.length ? workspace.versions.map((version) => (
                  <div key={version.CusQuoteVersion_ID} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0"><div className="flex items-center gap-2"><span className="font-medium text-[13px] text-[var(--md-ink)]">{t("Version")} {version.CusQuoteVersion_Number}</span><StatusPill tone={version.CusQuoteVersion_StatusCode === "generated" ? "green" : version.CusQuoteVersion_StatusCode === "failed" ? "red" : "amber"}>{t(version.CusQuoteVersion_StatusCode)}</StatusPill></div><p className="mt-1 truncate text-[12px] text-[var(--md-subtle)]">{version.DOCB_GeneratedDocuments?.DOCBGD_FileName ?? t("Document render pending")}</p></div>
                    {version.CusQuoteVersion_GeneratedDocumentID ? <Button type="button" variant="ghost" onClick={() => void downloadDocument(version.CusQuoteVersion_GeneratedDocumentID!)} className="shadow-[var(--md-shadow-line)]"><Download data-icon="inline-start" className="size-4" />{t("Download")}</Button> : null}
                  </div>
                )) : <div className="py-10 text-center"><FileText className="mx-auto size-6 text-[var(--md-subtle)]" strokeWidth={1.2} /><p className="mt-2 text-[13px] text-[var(--md-text)]">{t("No quote document has been generated yet.")}</p></div>}
              </div>
            </Surface>
          </TabsContent>

          <TabsContent value="audit" className="mt-3">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
              <Surface padding="none" className="rounded-[var(--md-radius-xl)] p-4 sm:p-5">
                <h2 className="text-[16px] font-medium text-[var(--md-ink)]">{t("Quote history")}</h2>
                <div className="mt-4 space-y-1">{workspace?.events.length ? workspace.events.map((event) => <div key={event.CusQuoteEvent_ID} className="grid grid-cols-[10px_minmax(0,1fr)] gap-3 py-2"><span className="mt-1.5 size-2 rounded-full bg-[var(--md-accent)]" /><div><p className="text-[13px] text-[var(--md-ink)]">{t(event.CusQuoteEvent_Summary)}</p><p className="mt-1 text-[11px] text-[var(--md-subtle)]">{new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.CusQuoteEvent_OccurredAt))}</p></div></div>) : <p className="py-8 text-center text-[13px] text-[var(--md-subtle)]">{t("Save the quote to start its audit history.")}</p>}</div>
              </Surface>
              <Surface padding="none" className="rounded-[var(--md-radius-xl)] p-4">
                <CalendarClock className="size-5 text-[var(--md-accent)]" strokeWidth={1.4} />
                <h2 className="mt-3 text-[15px] font-medium text-[var(--md-ink)]">{t("Follow-up")}</h2>
                <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{record.followUpAt ? new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(record.followUpAt)) : t("A follow-up is scheduled when the quote is sent.")}</p>
                {record.outcomeNotes ? <p className="mt-3 rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] p-3 text-[12px] text-[var(--md-text)] shadow-[var(--md-shadow-line)]">{record.outcomeNotes}</p> : null}
                {record.lifecycle === "sent" ? <Button type="button" onClick={() => setOutcomeOpen("accepted")} className="mt-4 w-full">{t("Record outcome")}</Button> : null}
              </Surface>
            </div>
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent className="rounded-[var(--md-radius-2xl)]"><DialogHeader><DialogTitle>{t("Send and schedule follow-up")}</DialogTitle><DialogDescription>{t("The stored document version remains unchanged after it is issued.")}</DialogDescription></DialogHeader><div className="grid gap-3"><Field label="Follow-up date and time"><Input type="datetime-local" dir="ltr" value={followUpAt} onChange={(event) => setFollowUpAt(event.target.value)} className={inputClass()} /></Field><Field label="Issue note"><Textarea value={actionNote} onChange={(event) => setActionNote(event.target.value)} className="min-h-20 rounded-[var(--md-radius-md)] bg-[var(--md-field-bg)] shadow-[var(--md-shadow-line)]" /></Field></div><DialogFooter><Button type="button" variant="ghost" onClick={() => setSendOpen(false)}>{t("Cancel")}</Button><Button type="button" disabled={!followUpAt || runningAction !== null} onClick={() => void transition("sent")}><Send data-icon="inline-start" className="size-4" />{t("Mark sent")}</Button></DialogFooter></DialogContent>
      </Dialog>

      <Dialog open={outcomeOpen !== null} onOpenChange={(open) => { if (!open) setOutcomeOpen(null) }}>
        <DialogContent className="rounded-[var(--md-radius-2xl)]"><DialogHeader><DialogTitle>{t("Record customer outcome")}</DialogTitle><DialogDescription>{t("Keep the commercial evidence and a short explanation for later conversion analysis.")}</DialogDescription></DialogHeader><div className="grid grid-cols-3 gap-2">{(["accepted", "declined", "ghosted"] as const).map((outcome) => <Button key={outcome} type="button" variant={outcomeOpen === outcome ? "default" : "ghost"} onClick={() => setOutcomeOpen(outcome)} className={outcomeOpen === outcome ? "" : "shadow-[var(--md-shadow-line)]"}>{t(outcome)}</Button>)}</div><Field label="Outcome note"><Textarea value={actionNote} onChange={(event) => setActionNote(event.target.value)} className="min-h-24 rounded-[var(--md-radius-md)] bg-[var(--md-field-bg)] shadow-[var(--md-shadow-line)]" /></Field><DialogFooter><Button type="button" variant="ghost" onClick={() => setOutcomeOpen(null)}>{t("Cancel")}</Button><Button type="button" disabled={!outcomeOpen || runningAction !== null} onClick={() => outcomeOpen && void transition(outcomeOpen)}>{t("Save outcome")}</Button></DialogFooter></DialogContent>
      </Dialog>

      <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
        <DialogContent className="rounded-[var(--md-radius-2xl)]"><DialogHeader><DialogTitle>{t("Booking readiness")}</DialogTitle><DialogDescription>{t("Everything already known will carry forward. Complete the booking-only parties before creating one booking.")}</DialogDescription></DialogHeader><div className="grid gap-3 sm:grid-cols-2"><Field label="Shipper" hint="Required"><Input autoFocus value={shipperName} onChange={(event) => setShipperName(event.target.value)} className={inputClass()} /></Field><Field label="Consignee" hint="Required"><Input value={consigneeName} onChange={(event) => setConsigneeName(event.target.value)} className={inputClass()} /></Field><div className="sm:col-span-2"><Field label="Operational notes"><Textarea value={operationalNotes} onChange={(event) => setOperationalNotes(event.target.value)} className="min-h-24 rounded-[var(--md-radius-md)] bg-[var(--md-field-bg)] shadow-[var(--md-shadow-line)]" /></Field></div></div><DialogFooter><Button type="button" variant="ghost" onClick={() => setConvertOpen(false)}>{t("Cancel")}</Button><Button type="button" disabled={!shipperName.trim() || !consigneeName.trim() || runningAction !== null} onClick={() => void convert()}><Plus data-icon="inline-start" className="size-4" />{t(runningAction === "convert" ? "Creating…" : "Create booking")}</Button></DialogFooter></DialogContent>
      </Dialog>
    </DexterDockedPage>
  )
}
