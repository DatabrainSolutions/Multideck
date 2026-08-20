import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react"
import { AlertCircle, Clock, FileSpreadsheet, History, Pencil, Plus, Search, Send, Upload } from "@/components/icons/hugeicons"
import { DataTable, type DataTableColumn } from "@/components/multideck/data-table"
import { RateChargeLineEditor } from "@/components/multideck/rate-charge-line-editor"
import { RatePricingRuleControl } from "@/components/multideck/rate-pricing-rule-control"
import { StatusPill } from "@/components/multideck/status-pill"
import { SegmentedControl } from "@/components/multideck/workflow-components"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { useLanguage } from "@/i18n/language-provider"
import { parseRateImport, type RateImportPreview } from "@/lib/rate-import-parser"
import {
  applyRateToQuote,
  approveRatePack,
  expireRate,
  generateRatePackDocument,
  getRateDetails,
  getRateOptions,
  getRatesPage,
  getRatesWorkspace,
  removeRatePackItem,
  saveRate,
  saveRatePackItem,
  searchRateCustomers,
  sendRatePackDocument,
  stageRateImport,
  type RateCustomer,
  type RateDetails,
  type RateExpiryCounts,
  type RateMode,
  type RateOption,
  type RatePackItem,
  type RateRecord,
  type RateRecordInput,
  type RateRecordType,
  type RatesWorkspace,
} from "@/lib/rates-api"
import { subscribeTopBarAction, topBarActionEvents } from "@/lib/top-bar-action-events"
import { cn } from "@/lib/utils"

type RatesRoute = "/rates" | "/rates/tariffs" | "/rates/imports" | "/rates/results"
type ModeFilter = "all" | RateMode
type RateImportPreviewRow = { id: string; values: string[] }

const modes: ModeFilter[] = ["all", "lcl", "fcl", "air", "road"]
const fieldClass = "h-10 rounded-[var(--md-radius-md)] text-base sm:text-[13px]"
const emptyWorkspace: RatesWorkspace = {
  summary: { total: 0, attention: 0, active: 0, drafts: 0, costTariffs: 0, salesTariffs: 0, customerPacks: 0, pendingApproval: 0, customerSpecific: 0, expiringTariffs: 0, sourcesInReview: 0 },
  attention: [], recent: [], imports: [], quotes: [], permissions: { canManage: false },
  integrations: { seaRates: { connected: false, reason: "SeaRates is not connected." } },
}
const emptyExpiryCounts: RateExpiryCounts = { expired: 0, sevenDays: 0, thirtyDays: 0, activeCurrent: 0, pendingApproval: 0 }

function Alert({ children, variant = "default", className }: { children: ReactNode; variant?: "default" | "destructive"; className?: string }) {
  return <div role={variant === "destructive" ? "alert" : "status"} className={cn("grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] p-4 text-[13px] shadow-[var(--md-shadow-line)] [&>svg]:mt-0.5 [&>svg]:size-4", variant === "destructive" && "text-[var(--md-red)]", className)}>{children}</div>
}
function AlertTitle({ children }: { children: ReactNode }) { return <strong className="font-medium text-[var(--md-ink)]">{children}</strong> }
function AlertDescription({ children }: { children: ReactNode }) { return <div className="col-start-2 leading-5 text-[var(--md-subtle)]">{children}</div> }

const blankRate: RateRecordInput = {
  code: "",
  name: "",
  type: "cost_tariff",
  status: "active",
  mode: "fcl",
  carrier: "",
  supplier: "",
  customer: "",
  customerOrgId: "",
  origin: "",
  destination: "",
  cargo: "General cargo",
  service: "Standard",
  validFrom: new Date().toISOString().slice(0, 10),
  validTo: "",
  currency: "GBP",
  buyTotal: 0,
  sellTotal: 0,
  sourceType: "manual",
  sourceReference: "",
  schedule: "ad_hoc",
  sendAfterApproval: false,
  modeDetails: {},
  charges: [],
}

function money(value: number, currency: string) {
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(value) }
  catch { return `${currency} ${value.toFixed(2)}` }
}

function daysUntil(date: string) {
  if (!date) return Number.POSITIVE_INFINITY
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.ceil((new Date(`${date}T00:00:00`).getTime() - today.getTime()) / 86_400_000)
}

function statusTone(rate: RateRecord) {
  if (rate.status === "pending_approval") return "amber" as const
  if (rate.status === "expired" || daysUntil(rate.validTo) < 0) return "red" as const
  if (daysUntil(rate.validTo) <= 30) return "amber" as const
  return rate.status === "active" ? "green" as const : "neutral" as const
}

function typeLabel(type: RateRecordType) {
  return type === "sales_tariff" ? "Customer tariff" : "Cost tariff"
}

function statusLabel(rate: RateRecord, t: (value: string) => string) {
  if (rate.status === "pending_approval") return t("Needs approval")
  if (daysUntil(rate.validTo) < 0) return t("Expired")
  if (daysUntil(rate.validTo) <= 30) return t("Expiring")
  return t(rate.status[0].toUpperCase() + rate.status.slice(1))
}

function modeLabel(mode: ModeFilter) {
  return mode === "all" ? "All modes" : mode.toUpperCase()
}

function Field({ label, children, hint, className }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return <label className={cn("grid content-start gap-1.5", className)}><span className="text-[12px] font-medium">{label}</span>{children}{hint ? <span className="text-[11.5px] leading-4 text-[var(--md-subtle)]">{hint}</span> : null}</label>
}

function ExpiryRail({ counts, includePending, onFilter }: { counts: RateExpiryCounts; includePending?: boolean; onFilter: (filter: string) => void }) {
  const { t } = useLanguage()
  const items = [
    ...(includePending ? [{ key: "pending_approval", label: t("Needs approval"), count: counts.pendingApproval ?? 0, tone: "amber" as const }] : []),
    { key: "expired", label: t("Expired"), count: counts.expired, tone: "red" as const },
    { key: "7", label: t("Expires in 7 days"), count: counts.sevenDays, tone: "amber" as const },
    { key: "30", label: t("Expires in 30 days"), count: counts.thirtyDays, tone: "amber" as const },
    { key: "active", label: t("Active and current"), count: counts.activeCurrent, tone: "green" as const },
  ]
  return <div className={cn("grid overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)] sm:grid-cols-2", includePending ? "xl:grid-cols-5" : "xl:grid-cols-4")}>
    {items.map((item, index) => <button key={item.key} type="button" onClick={() => onFilter(item.key)} className={cn("flex min-h-20 items-center justify-between gap-4 px-5 text-start outline-none transition-[background,color,transform] duration-200 hover:bg-[var(--md-surface-tint)] active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--md-accent-a24)]", index > 0 && "border-t border-[var(--md-line)] sm:border-s xl:border-t-0")}>
      <span><span className="block text-[12px] text-[var(--md-subtle)]">{item.label}</span><strong className="mt-1 block text-[22px] font-medium tabular-nums text-[var(--md-ink)]">{item.count}</strong></span>
      <StatusPill tone={item.tone}>{item.count ? t("Review") : t("Clear")}</StatusPill>
    </button>)}
  </div>
}

function CustomerPicker({ value: _value, displayName, label, onChange, optional }: { value: string; displayName?: string; label: string; onChange: (customer: RateCustomer | { id: ""; name: "" }) => void; optional?: boolean }) {
  const { t } = useLanguage()
  const [query, setQuery] = useState(displayName ?? "")
  const [customers, setCustomers] = useState<RateCustomer[]>([])
  useEffect(() => { if (displayName && !query) setQuery(displayName) }, [displayName, query])
  useEffect(() => {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => {
      void searchRateCustomers(query, controller.signal).then((result) => setCustomers(result.customers)).catch(() => undefined)
    }, 200)
    return () => { window.clearTimeout(timeout); controller.abort() }
  }, [query])
  return <Field label={label} hint={optional ? t("Leave blank unless this buy rate is for one account.") : undefined}>
    <Input className={fieldClass} value={query} onChange={(event) => { setQuery(event.target.value); if (!event.target.value) onChange({ id: "", name: "" }) }} placeholder={t("Search customers…")} />
    {customers.length ? <div className="max-h-40 overflow-auto rounded-[calc(var(--md-radius-lg)-4px)] bg-[var(--md-surface-tint)] p-1">
      {optional ? <button type="button" className="block w-full rounded-[var(--md-radius-sm)] px-3 py-2 text-start text-[13px] hover:bg-[var(--md-selected-bg)]" onClick={() => { onChange({ id: "", name: "" }); setQuery("") }}>{t("No specific customer")}</button> : null}
      {customers.map((customer) => <button key={customer.id} type="button" className="block w-full rounded-[var(--md-radius-sm)] px-3 py-2 text-start text-[13px] hover:bg-[var(--md-selected-bg)]" onClick={() => { onChange(customer); setQuery(customer.name) }}>{customer.name}</button>)}
    </div> : null}
  </Field>
}

function ModeFields({ draft, updateDetails }: { draft: RateRecordInput; updateDetails: (key: string, value: string | number | boolean) => void }) {
  const { t } = useLanguage()
  const detail = (key: string) => String(draft.modeDetails[key] ?? "")
  if (draft.mode === "lcl") return <>
    <Field label={t("W/M rate")}><Input className={fieldClass} inputMode="decimal" value={detail("wmRate")} onChange={(event) => updateDetails("wmRate", Number(event.target.value))} /></Field>
    <Field label={t("Minimum charge")}><Input className={fieldClass} inputMode="decimal" value={detail("minimumCharge")} onChange={(event) => updateDetails("minimumCharge", Number(event.target.value))} /></Field>
    <Field label={t("Weight / volume rule")}><Select value={detail("calculation") || "greater"} onValueChange={(value) => updateDetails("calculation", value)}><SelectTrigger className={fieldClass}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="greater">{t("Greater of weight or volume")}</SelectItem><SelectItem value="weight">{t("Weight only")}</SelectItem><SelectItem value="volume">{t("Volume only")}</SelectItem></SelectContent></Select></Field>
  </>
  if (draft.mode === "fcl") return <>
    <Field label={t("Container type")}><Select value={detail("equipment") || "40HC"} onValueChange={(value) => updateDetails("equipment", value)}><SelectTrigger className={fieldClass}><SelectValue /></SelectTrigger><SelectContent>{["20GP", "40GP", "40HC", "45HC", "REEFER"].map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></Field>
    <Field label={t("Container quantity")}><Input className={fieldClass} inputMode="numeric" value={detail("quantity") || "1"} onChange={(event) => updateDetails("quantity", Number(event.target.value))} /></Field>
    <Field label={t("Free time days")}><Input className={fieldClass} inputMode="numeric" value={detail("freeTimeDays")} onChange={(event) => updateDetails("freeTimeDays", Number(event.target.value))} /></Field>
  </>
  if (draft.mode === "air") return <>
    <Field label={t("Weight break")}><Select value={detail("weightBreak") || "100"} onValueChange={(value) => updateDetails("weightBreak", Number(value))}><SelectTrigger className={fieldClass}><SelectValue /></SelectTrigger><SelectContent>{[45, 100, 300, 500, 1000].map((item) => <SelectItem key={item} value={String(item)}>+{item} kg</SelectItem>)}</SelectContent></Select></Field>
    <Field label={t("Rate per chargeable kg")}><Input className={fieldClass} inputMode="decimal" value={detail("ratePerKg")} onChange={(event) => updateDetails("ratePerKg", Number(event.target.value))} /></Field>
    <Field label={t("Minimum charge")}><Input className={fieldClass} inputMode="decimal" value={detail("minimumCharge")} onChange={(event) => updateDetails("minimumCharge", Number(event.target.value))} /></Field>
  </>
  return <>
    <Field label={t("Origin postcode / zone")}><Input className={fieldClass} value={detail("originZone")} onChange={(event) => updateDetails("originZone", event.target.value)} /></Field>
    <Field label={t("Destination postcode / zone")}><Input className={fieldClass} value={detail("destinationZone")} onChange={(event) => updateDetails("destinationZone", event.target.value)} /></Field>
    <Field label={t("Vehicle or service")}><Select value={detail("vehicle") || "curtain_sider"} onValueChange={(value) => updateDetails("vehicle", value)}><SelectTrigger className={fieldClass}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="curtain_sider">{t("Curtain sider")}</SelectItem><SelectItem value="rigid">{t("Rigid")}</SelectItem><SelectItem value="sprinter">{t("Sprinter")}</SelectItem><SelectItem value="groupage">{t("Groupage")}</SelectItem></SelectContent></Select></Field>
    <Field label={t("Pallet quantity")}><Input className={fieldClass} inputMode="numeric" value={detail("pallets")} onChange={(event) => updateDetails("pallets", Number(event.target.value))} /></Field>
    <Field label={t("Weight kg")}><Input className={fieldClass} inputMode="decimal" value={detail("weightKg")} onChange={(event) => updateDetails("weightKg", Number(event.target.value))} /></Field>
    <Field label={t("Fuel surcharge %")}><Input className={fieldClass} inputMode="decimal" value={detail("fuelSurchargePercent")} onChange={(event) => updateDetails("fuelSurchargePercent", Number(event.target.value))} /></Field>
  </>
}

function RateEditor({ open, onOpenChange, initial, importId, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; initial?: RateRecord | Partial<RateRecordInput> | null; importId?: string; onSaved: (rate: RateRecord) => void }) {
  const { t } = useLanguage()
  const [draft, setDraft] = useState<RateRecordInput>(blankRate)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const isPack = draft.type === "sales_tariff"
  useEffect(() => {
    if (!open) return
    const type = initial?.type === "sales_tariff" ? "sales_tariff" : "cost_tariff"
    setDraft({
      ...blankRate,
      ...initial,
      type,
      status: type === "sales_tariff" ? (initial && "status" in initial && initial.status ? initial.status : "draft") : (initial && "status" in initial && initial.status ? initial.status : "active"),
      id: initial && "id" in initial ? initial.id : undefined,
      importId,
      changeReason: initial && "id" in initial ? "Commercial rate updated" : "Initial version",
      customerOrgId: initial && "customerOrgId" in initial ? initial.customerOrgId ?? "" : "",
      sendAfterApproval: initial && "sendAfterApproval" in initial ? Boolean(initial.sendAfterApproval) : false,
      modeDetails: { ...(initial?.modeDetails ?? {}) },
      charges: initial?.charges ?? [],
    })
    setError("")
  }, [importId, initial, open])
  const update = <Key extends keyof RateRecordInput>(key: Key, value: RateRecordInput[Key]) => setDraft((current) => ({ ...current, [key]: value }))
  async function submit() {
    if (!draft.name.trim() || !draft.validTo) { setError("Add a name and end date before saving."); return }
    if (!isPack && (!draft.origin.trim() || !draft.destination.trim())) { setError("Add a name, route and end date before saving."); return }
    if (isPack && !draft.customerOrgId) { setError("Choose the customer for this tariff pack."); return }
    if (draft.validTo < draft.validFrom) { setError("The end date must be on or after the start date."); return }
    setSaving(true); setError("")
    try {
      const charges = draft.charges
      const buyTotal = charges.length ? charges.reduce((sum, charge) => sum + charge.buyAmount, 0) : draft.buyTotal
      const response = await saveRate({ ...draft, buyTotal, code: draft.code.trim() || `RATE-${Date.now().toString().slice(-6)}` })
      onSaved(response.rate); onOpenChange(false); toast.success(draft.id ? t("New rate version saved") : t("Rate saved"))
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The rate could not be saved.") }
    finally { setSaving(false) }
  }
  return <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}><DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-[760px]">
    <DialogHeader>
      <DialogTitle>{draft.id ? t("Create a new rate version") : isPack ? t("New customer tariff") : t("New cost tariff")}</DialogTitle>
      <DialogDescription>{isPack ? t("One pack belongs to one customer and can include many incoming cost tariffs.") : t("Incoming carrier and supplier tariffs stay in one format, with a contract reference when needed.")}</DialogDescription>
    </DialogHeader>
    {error ? <Alert variant="destructive"><AlertCircle /><AlertTitle>{t("Check the rate")}</AlertTitle><AlertDescription>{t(error)}</AlertDescription></Alert> : null}
    <div className="grid gap-4 sm:grid-cols-2">
      {isPack ? null : <Field label={t("Transport mode")}><Select value={draft.mode} onValueChange={(value: RateMode) => update("mode", value)}><SelectTrigger className={fieldClass}><SelectValue /></SelectTrigger><SelectContent>{(["lcl", "fcl", "air", "road"] as RateMode[]).map((mode) => <SelectItem value={mode} key={mode}>{mode.toUpperCase()}</SelectItem>)}</SelectContent></Select></Field>}
      <Field label={isPack ? t("Pack name") : t("Rate name")} className={isPack ? "sm:col-span-2" : undefined}><Input className={fieldClass} value={draft.name} onChange={(event) => update("name", event.target.value)} placeholder={isPack ? t("e.g. Northwind 2026 tariff") : t("e.g. UK–Japan FCL contract")} /></Field>
      {isPack ? <CustomerPicker value={draft.customerOrgId} displayName={draft.customer} label={t("Customer")} onChange={(customer) => { update("customerOrgId", customer.id); update("customer", customer.name) }} /> : <>
        <Field label={t("Carrier")}><Input className={fieldClass} value={draft.carrier} onChange={(event) => update("carrier", event.target.value)} /></Field>
        <Field label={t("Supplier")}><Input className={fieldClass} value={draft.supplier} onChange={(event) => update("supplier", event.target.value)} /></Field>
        <CustomerPicker value={draft.customerOrgId} displayName={draft.customer} label={t("Customer-specific buy rate")} optional onChange={(customer) => { update("customerOrgId", customer.id); update("customer", customer.name) }} />
        <Field label={t("Origin")}><Input dir="auto" className={fieldClass} value={draft.origin} onChange={(event) => update("origin", event.target.value)} placeholder="GBSOU · Southampton" /></Field>
        <Field label={t("Destination")}><Input dir="auto" className={fieldClass} value={draft.destination} onChange={(event) => update("destination", event.target.value)} placeholder="JPUKB · Kobe" /></Field>
        <Field label={t("Cargo eligibility")}><Input className={fieldClass} value={draft.cargo} onChange={(event) => update("cargo", event.target.value)} /></Field>
        <Field label={t("Service")}><Input className={fieldClass} value={draft.service} onChange={(event) => update("service", event.target.value)} /></Field>
        <ModeFields draft={draft} updateDetails={(key, value) => update("modeDetails", { ...draft.modeDetails, [key]: value })} />
      </>}
      <Field label={t("Valid from")}><Input type="date" dir="ltr" className={fieldClass} value={draft.validFrom} onChange={(event) => update("validFrom", event.target.value)} /></Field>
      <Field label={t("Valid to")}><Input type="date" dir="ltr" className={fieldClass} value={draft.validTo} onChange={(event) => update("validTo", event.target.value)} /></Field>
      <Field label={t("Tariff cycle")}><Select value={draft.schedule} onValueChange={(value: RateRecordInput["schedule"]) => update("schedule", value)}><SelectTrigger className={fieldClass}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="weekly">{t("Weekly")}</SelectItem><SelectItem value="monthly">{t("Monthly")}</SelectItem><SelectItem value="ad_hoc">{t("Ad hoc")}</SelectItem></SelectContent></Select></Field>
      <Field label={t("Currency")}><Input dir="ltr" maxLength={3} className={fieldClass} value={draft.currency} onChange={(event) => update("currency", event.target.value.toUpperCase())} /></Field>
      {isPack ? <Field label={t("Send after approval")} className="sm:col-span-2"><Select value={draft.sendAfterApproval ? "yes" : "no"} onValueChange={(value) => update("sendAfterApproval", value === "yes")}><SelectTrigger className={fieldClass}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="no">{t("Leave ready to send")}</SelectItem><SelectItem value="yes">{t("Send after approval")}</SelectItem></SelectContent></Select></Field> : null}
      {!isPack ? <>
        <Field label={t("Cost total")} hint={t("Filled from charge lines when they are present.")}><Input inputMode="decimal" className={fieldClass} value={draft.buyTotal} onChange={(event) => update("buyTotal", Number(event.target.value))} /></Field>
        <Field label={t("Contract reference")} className="sm:col-span-2"><Input className={fieldClass} value={draft.sourceReference} onChange={(event) => update("sourceReference", event.target.value)} placeholder={t("Agreement number or file name")} /></Field>
        <div className="sm:col-span-2"><RateChargeLineEditor charges={draft.charges} onChange={(charges) => update("charges", charges)} /></div>
      </> : <Field label={t("Source reference")} className="sm:col-span-2"><Input className={fieldClass} value={draft.sourceReference} onChange={(event) => update("sourceReference", event.target.value)} /></Field>}
      {draft.id ? <Field label={t("Change reason")} className="sm:col-span-2"><Textarea value={draft.changeReason} onChange={(event) => update("changeReason", event.target.value)} /></Field> : null}
    </div>
    <DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>{t("Cancel")}</Button><Button onClick={() => void submit()} disabled={saving}>{saving ? t("Saving rate…") : draft.id ? t("Save new version") : t("Save rate")}</Button></DialogFooter>
  </DialogContent></Dialog>
}

function ImportWorkspace({ workspace, refresh, openEditor }: { workspace: RatesWorkspace; refresh: () => Promise<void>; openEditor: (suggested: Partial<RateRecordInput>, importId: string) => void }) {
  const { t } = useLanguage(); const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null); const [preview, setPreview] = useState<RateImportPreview | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState("")
  const previewRows = useMemo<RateImportPreviewRow[]>(() => (preview?.rows.slice(0, 8) ?? []).map((values, index) => ({ id: `preview-row-${index + 1}`, values })), [preview])
  const previewColumns = useMemo<DataTableColumn<RateImportPreviewRow>[]>(() => {
    const columnCount = Math.min(8, Math.max(0, ...previewRows.map((row) => row.values.length)))
    return Array.from({ length: columnCount }, (_, index) => ({
      id: `column-${index + 1}`,
      label: `${t("Column")} ${index + 1}`,
      kind: "text" as const,
      width: 140,
      minWidth: 112,
      exportValue: (row: RateImportPreviewRow) => row.values[index] ?? "",
      cell: (row: RateImportPreviewRow) => <span dir="auto">{row.values[index] || "—"}</span>,
    }))
  }, [previewRows, t])
  async function choose(event: ChangeEvent<HTMLInputElement>) { const selected = event.target.files?.[0]; if (!selected) return; setBusy(true); setError(""); setFile(selected); try { setPreview(await parseRateImport(selected)) } catch (caught) { setError(caught instanceof Error ? caught.message : "This file could not be read.") } finally { setBusy(false); event.target.value = "" } }
  async function archiveAndReview() { if (!file || !preview) return; setBusy(true); try { const response = await stageRateImport(file, preview); openEditor({ ...preview.suggested, type: "cost_tariff" }, response.importBatch.id); await refresh() } catch (caught) { setError(caught instanceof Error ? caught.message : "The source file could not be archived.") } finally { setBusy(false) } }
  return <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
    <section className="rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-5 shadow-[var(--md-shadow-line)]">
      <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)]"><Upload className="size-5" /></span><div><h2 className="text-[18px] font-medium text-[var(--md-ink)]">{t("Import and review")}</h2><p className="mt-1 max-w-2xl text-[13px] leading-5 text-[var(--md-subtle)]">{t("Read CSV, spreadsheet, PDF, email or text rate sources. Nothing becomes an active rate until you review and save it.")}</p></div></div>
      <button type="button" onClick={() => inputRef.current?.click()} className="mt-5 flex min-h-44 w-full flex-col items-center justify-center rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-6 text-center shadow-[inset_0_0_0_1px_var(--md-line)] outline-none transition-[background,box-shadow,transform] duration-200 hover:bg-[var(--md-selected-bg)] active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a24)]"><FileSpreadsheet className="size-6" /><span className="mt-3 text-[13px] font-medium text-[var(--md-ink)]">{busy ? t("Reading source…") : t("Choose a rate source")}</span><span className="mt-1 text-[12px] text-[var(--md-subtle)]">CSV, XLSX, PDF, EML, TXT · {t("up to 15 MB")}</span></button>
      <input ref={inputRef} type="file" className="sr-only" accept=".csv,.tsv,.xlsx,.pdf,.eml,.txt,text/csv,application/pdf" onChange={(event) => void choose(event)} />
      {error ? <Alert variant="destructive" className="mt-4"><AlertCircle /><AlertTitle>{t("Import needs attention")}</AlertTitle><AlertDescription>{t(error)}</AlertDescription></Alert> : null}
      {preview ? <div className="mt-5 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-raised)] p-4 shadow-[var(--md-shadow-line)]"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[13px] font-medium text-[var(--md-ink)]" dir="auto">{preview.fileName}</p><p className="mt-1 text-[12px] text-[var(--md-subtle)]">{preview.rows.length} {t("rows ready to check")}</p></div><Button onClick={() => void archiveAndReview()} disabled={busy}>{t("Review as rate")}</Button></div><div className="mt-4 max-h-64 overflow-auto rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] p-3"><DataTable ariaLabel="Rate source preview" columns={previewColumns} rows={previewRows} getRowKey={(row) => row.id} showToolbar={false} showColumnManager={false} minimumWidth={Math.max(560, previewColumns.length * 140)} exportConfig={{ fileName: `${preview.fileName}-preview`, recordCategory: "Source row" }} className="[&_[data-table-surface]]:rounded-[var(--md-radius-sm)] [&_[data-table-surface]]:shadow-none" tableClassName="text-[12px]" /></div></div> : null}
    </section>
    <section className="rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-5 shadow-[var(--md-shadow-line)]"><h2 className="text-[15px] font-medium text-[var(--md-ink)]">{t("Source history")}</h2><div className="mt-4 grid gap-3">{workspace.imports.length ? workspace.imports.map((item) => <div key={item.id} className="rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] p-3"><div className="flex items-center justify-between gap-2"><p className="truncate text-[12.5px] font-medium" dir="auto">{item.fileName}</p><StatusPill tone={item.errorCount ? "red" : item.status === "review" ? "amber" : "green"}>{item.status}</StatusPill></div><p className="mt-2 text-[11.5px] text-[var(--md-subtle)]">{item.rowCount} rows · {new Date(item.createdAt).toLocaleDateString()}</p></div>) : <p className="text-[13px] leading-5 text-[var(--md-subtle)]">{t("No source files have been archived yet.")}</p>}</div></section>
  </div>
}

function QuoteMatching({ workspace, navigate }: { workspace: RatesWorkspace; navigate: (path: string) => void }) {
  const { t } = useLanguage(); const [quoteId, setQuoteId] = useState(workspace.quotes[0]?.id ?? ""); const [options, setOptions] = useState<RateOption[]>([]); const [loading, setLoading] = useState(false); const [applying, setApplying] = useState<string | null>(null); const [error, setError] = useState("")
  useEffect(() => { if (!quoteId && workspace.quotes[0]) setQuoteId(workspace.quotes[0].id) }, [quoteId, workspace.quotes])
  const find = useCallback(async () => { if (!quoteId) return; setLoading(true); setError(""); try { setOptions((await getRateOptions(quoteId)).options) } catch (caught) { setError(caught instanceof Error ? caught.message : "Rates could not be matched.") } finally { setLoading(false) } }, [quoteId])
  useEffect(() => { void find() }, [find])
  async function apply(option: RateOption) { setApplying(option.id); try { await applyRateToQuote(quoteId, option.id); toast.success(t("Rate applied to quote"), { description: t("An immutable pricing snapshot has been saved with the quote.") }); navigate(`/quotes/${quoteId}`) } catch (caught) { setError(caught instanceof Error ? caught.message : "The rate could not be applied.") } finally { setApplying(null) } }
  return <div className="grid gap-5"><section className="flex flex-wrap items-end justify-between gap-4 rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-5 shadow-[var(--md-shadow-line)]"><Field label={t("Quote needing a rate")} className="min-w-[280px]"><Select value={quoteId} onValueChange={setQuoteId}><SelectTrigger className={fieldClass}><SelectValue placeholder={t("Choose a quote")} /></SelectTrigger><SelectContent>{workspace.quotes.map((quote) => <SelectItem key={quote.id} value={quote.id}>{quote.reference} · {quote.customer}</SelectItem>)}</SelectContent></Select></Field><Button variant="ghost" onClick={() => void find()} disabled={!quoteId || loading}><Search />{loading ? t("Checking rates…") : t("Check again")}</Button></section>
    <Alert><AlertCircle /><AlertTitle>{t("SeaRates is not connected")}</AlertTitle><AlertDescription>{t("Contract and tariff matches are available now. SeaRates service options will be added only after its real API response can be validated.")}</AlertDescription></Alert>
    {error ? <Alert variant="destructive"><AlertCircle /><AlertTitle>{t("Matching needs attention")}</AlertTitle><AlertDescription>{t(error)}</AlertDescription></Alert> : null}
    <div className="grid gap-3">{!loading && !options.length ? <div className="rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] px-6 py-12 text-center shadow-[var(--md-shadow-line)]"><p className="text-[14px] font-medium text-[var(--md-ink)]">{t("No eligible rates found")}</p><p className="mx-auto mt-2 max-w-lg text-[13px] leading-5 text-[var(--md-subtle)]">{t("Check the quote route, mode and validity, or add a contract or tariff for this lane.")}</p></div> : options.map((option) => <article key={option.id} className="grid gap-4 rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-5 shadow-[var(--md-shadow-line)] lg:grid-cols-[minmax(0,1fr)_auto_auto_auto]"><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-[14px] font-medium text-[var(--md-ink)]">{option.name}</h3><StatusPill tone={option.matchScore >= 80 ? "green" : "amber"}>{option.matchScore}% match</StatusPill><StatusPill kind="attribute" tone="blue">{t(typeLabel(option.type))}</StatusPill></div><p className="mt-2 text-[12px] text-[var(--md-subtle)]">{option.origin} → {option.destination} · {option.matchReasons.join(" · ")}</p></div><div className="lg:text-end"><p className="text-[11.5px] text-[var(--md-subtle)]">{t("Cost")}</p><p className="mt-1 text-[14px] tabular-nums">{option.type === "sales_tariff" ? "—" : money(option.buyTotal, option.currency)}</p></div><div className="lg:text-end"><p className="text-[11.5px] text-[var(--md-subtle)]">{t("Sell")}</p><p className="mt-1 text-[14px] tabular-nums">{money(option.sellTotal, option.currency)}</p></div><Button onClick={() => void apply(option)} disabled={applying !== null}>{applying === option.id ? t("Applying…") : t("Use in quote")}</Button></article>)}</div>
  </div>
}

function PackItems({ details, canManage, onChanged }: { details: RateDetails; canManage: boolean; onChanged: (details: RateDetails) => void }) {
  const { t } = useLanguage()
  const [costs, setCosts] = useState<RateRecord[]>([])
  const [sourceCostId, setSourceCostId] = useState("")
  const [busy, setBusy] = useState(false)
  const [rule, setRule] = useState({ pricingMode: "markup_percent" as const, markupPercent: 10, markupAmount: 0, sellTotal: 0 })
  useEffect(() => {
    void getRatesPage({ scope: "costs", limit: 50, offset: 0, sort: { id: "name", direction: "asc" } }).then((page) => setCosts(page.rows)).catch(() => undefined)
  }, [])
  async function includeCost() {
    if (!sourceCostId) return
    setBusy(true)
    try { onChanged(await saveRatePackItem(details.rate.id, { sourceCostId, ...rule })) }
    catch (caught) { toast.error(t("The pack item could not be saved"), { description: caught instanceof Error ? caught.message : undefined }) }
    finally { setBusy(false) }
  }
  async function updateItem(item: RatePackItem, next = rule) {
    setBusy(true)
    try { onChanged(await saveRatePackItem(details.rate.id, { sourceCostId: item.sourceCostId, pricingMode: next.pricingMode, markupPercent: next.markupPercent, markupAmount: next.markupAmount, sellTotal: next.sellTotal }, item.id)) }
    catch (caught) { toast.error(t("The pack item could not be saved"), { description: caught instanceof Error ? caught.message : undefined }) }
    finally { setBusy(false) }
  }
  async function remove(item: RatePackItem) {
    setBusy(true)
    try { onChanged(await removeRatePackItem(details.rate.id, item.id)) }
    catch (caught) { toast.error(t("The pack item could not be removed"), { description: caught instanceof Error ? caught.message : undefined }) }
    finally { setBusy(false) }
  }
  return <div className="grid gap-4">
    <h3 className="text-[13px] font-medium">{t("Included cost tariffs")}</h3>
    <div className="grid gap-3">
      {details.items.length ? details.items.map((item) => (
        <article key={item.id} className="grid gap-3 rounded-[calc(var(--md-radius-xl)-4px)] bg-[var(--md-surface-tint)] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[13px] font-medium text-[var(--md-ink)]">{item.sourceName}</p>
              <p className="mt-1 text-[12px] text-[var(--md-subtle)]" dir="auto">{item.origin} → {item.destination} · {item.sourceCarrier || t("Carrier")}</p>
            </div>
            <StatusPill kind="attribute" tone="teal">{item.sourceMode.toUpperCase()}</StatusPill>
          </div>
          <div className="grid grid-cols-2 gap-3 text-[13px]">
            <div><p className="text-[11.5px] text-[var(--md-subtle)]">{t("Cost")}</p><p className="mt-1 tabular-nums">{money(item.sourceBuyTotal, item.currency)}</p></div>
            <div><p className="text-[11.5px] text-[var(--md-subtle)]">{t("Sell")}</p><p className="mt-1 tabular-nums">{money(item.sellTotal, item.currency)}</p></div>
          </div>
          {item.charges.length ? <RateChargeLineEditor charges={item.charges} amountKind="sell" onChange={() => undefined} disabled /> : null}
          {canManage ? <>
            <RatePricingRuleControl value={{ pricingMode: item.pricingMode, markupPercent: item.markupPercent, markupAmount: item.markupAmount, sellTotal: item.sellTotal }} onChange={(value) => void updateItem(item, value)} disabled={busy} />
            <div className="flex justify-end"><Button variant="ghost" disabled={busy} onClick={() => void remove(item)}>{t("Remove")}</Button></div>
          </> : null}
        </article>
      )) : <p className="text-[12px] text-[var(--md-subtle)]">{t("No cost tariffs included yet.")}</p>}
    </div>
    {canManage ? <div className="grid gap-3 rounded-[calc(var(--md-radius-xl)-4px)] bg-[var(--md-surface-tint)] p-4">
      <Field label={t("Include a cost tariff")}>
        <Select value={sourceCostId} onValueChange={setSourceCostId}><SelectTrigger className={fieldClass}><SelectValue placeholder={t("Choose a cost tariff")} /></SelectTrigger><SelectContent>{costs.map((cost) => <SelectItem key={cost.id} value={cost.id}>{cost.name}</SelectItem>)}</SelectContent></Select>
      </Field>
      <RatePricingRuleControl value={rule} onChange={setRule} disabled={busy} />
      <Button onClick={() => void includeCost()} disabled={busy || !sourceCostId}>{busy ? t("Saving rate…") : t("Add to pack")}</Button>
    </div> : null}
  </div>
}

export function RatesPage({ route, navigate }: { route: RatesRoute; navigate: (path: string) => void }) {
  const { t } = useLanguage()
  const [workspace, setWorkspace] = useState(emptyWorkspace)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [tableRows, setTableRows] = useState<RateRecord[]>([])
  const [tableTotal, setTableTotal] = useState(0)
  const [expiryCounts, setExpiryCounts] = useState(emptyExpiryCounts)
  const [tableLoading, setTableLoading] = useState(false)
  const [tableError, setTableError] = useState("")
  const [offset, setOffset] = useState(0)
  const [serverSort, setServerSort] = useState<{ id: string; direction: "asc" | "desc" } | null>({ id: "name", direction: "asc" })
  const [dataRevision, setDataRevision] = useState(0)
  const [mode, setMode] = useState<ModeFilter>("all")
  const [query, setQuery] = useState(() => new URLSearchParams(window.location.search).get("search") ?? "")
  const [debouncedQuery, setDebouncedQuery] = useState(query)
  const [expiryFilter, setExpiryFilter] = useState("")
  const [selected, setSelected] = useState<RateRecord | null>(null)
  const [selectedDetails, setSelectedDetails] = useState<RateDetails | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorInitial, setEditorInitial] = useState<RateRecord | Partial<RateRecordInput> | null>(null)
  const [editorImportId, setEditorImportId] = useState<string | undefined>()
  const [expiring, setExpiring] = useState(false)
  const [acting, setActing] = useState(false)
  const refresh = useCallback(async () => { setLoading(true); setError(""); try { setWorkspace(await getRatesWorkspace()) } catch (caught) { setError(caught instanceof Error ? caught.message : "Rates could not be loaded.") } finally { setLoading(false) } }, [])
  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(query), 250)
    return () => window.clearTimeout(timeout)
  }, [query])
  const openNew = useCallback(() => {
    setEditorInitial(route === "/rates/tariffs" ? { type: "sales_tariff", origin: "Multiple lanes", destination: "Multiple lanes" } : { type: "cost_tariff" })
    setEditorImportId(undefined)
    setEditorOpen(true)
  }, [route])
  const openImport = useCallback(() => navigate("/rates/imports"), [navigate])
  useEffect(() => { const unsubscribeNew = subscribeTopBarAction(topBarActionEvents.createRate, openNew); const unsubscribeImport = subscribeTopBarAction(topBarActionEvents.importRates, openImport); return () => { unsubscribeNew(); unsubscribeImport() } }, [openImport, openNew])
  useEffect(() => {
    setMode("all")
    setExpiryFilter("")
    setSelected(null)
    setSelectedDetails(null)
    setOffset(0)
  }, [route])
  useEffect(() => setOffset(0), [debouncedQuery, expiryFilter, mode, serverSort])
  useEffect(() => {
    if (route !== "/rates" && route !== "/rates/tariffs") return undefined
    const controller = new AbortController()
    setTableLoading(true)
    setTableError("")
    void getRatesPage({
      scope: route === "/rates" ? "costs" : "packs",
      search: debouncedQuery,
      mode: mode === "all" ? undefined : mode,
      expiry: expiryFilter ? expiryFilter as "expired" | "7" | "30" | "active" | "pending_approval" : undefined,
      sort: serverSort,
      limit: 20,
      offset,
    }, controller.signal).then((page) => {
      setTableRows(page.rows)
      setTableTotal(page.total)
      setExpiryCounts(page.expiryCounts)
    }).catch((caught) => {
      if (caught instanceof Error && caught.name === "AbortError") return
      setTableError(caught instanceof Error ? caught.message : "Rates could not be loaded.")
    }).finally(() => {
      if (!controller.signal.aborted) setTableLoading(false)
    })
    return () => controller.abort()
  }, [dataRevision, debouncedQuery, expiryFilter, mode, offset, route, serverSort])
  useEffect(() => {
    if (!selected) { setSelectedDetails(null); return undefined }
    const controller = new AbortController()
    setDetailsLoading(true)
    void getRateDetails(selected.id, controller.signal).then((details) => {
      setSelected(details.rate)
      setSelectedDetails(details)
    }).catch((caught) => {
      if (!(caught instanceof Error && caught.name === "AbortError")) toast.error(t("Rate details could not be loaded"), { description: caught instanceof Error ? caught.message : undefined })
    }).finally(() => {
      if (!controller.signal.aborted) setDetailsLoading(false)
    })
    return () => controller.abort()
  }, [selected?.id, t])

  const costColumns = useMemo<DataTableColumn<RateRecord>[]>(() => [
    { id: "name", label: t("Cost tariff"), kind: "identity", width: 250, canHide: false, sortValue: (rate) => rate.name, cell: (rate) => <div><p className="font-medium text-[var(--md-ink)]">{rate.name}</p><p className="mt-0.5 text-[11.5px] text-[var(--md-subtle)]" dir="ltr">{rate.code} · {rate.sourceReference || t("No contract reference")}</p></div> },
    { id: "mode", label: t("Mode"), kind: "attribute", width: 90, sortValue: (rate) => rate.mode, cell: (rate) => <StatusPill kind="attribute" tone="teal">{rate.mode.toUpperCase()}</StatusPill> },
    { id: "route", label: t("Lane"), kind: "long-text", width: 230, sortValue: (rate) => `${rate.origin}${rate.destination}`, cell: (rate) => <span dir="auto">{rate.origin} → {rate.destination}</span> },
    { id: "carrier", label: t("Carrier / supplier"), kind: "long-text", width: 180, defaultHidden: true, sortValue: (rate) => rate.carrier || rate.supplier, cell: (rate) => rate.carrier || rate.supplier || "—" },
    { id: "customer", label: t("Customer"), kind: "long-text", width: 160, defaultHidden: true, sortValue: (rate) => rate.customer, cell: (rate) => rate.customer || t("Any customer") },
    { id: "validity", label: t("Validity"), kind: "date", width: 155, sortValue: (rate) => rate.validTo, cell: (rate) => <span dir="ltr">{rate.validFrom} → {rate.validTo}</span> },
    { id: "buy", label: t("Cost"), kind: "number", width: 125, sortValue: (rate) => rate.buyTotal, cell: (rate) => money(rate.buyTotal, rate.currency) },
    { id: "status", label: t("Status"), kind: "status", width: 120, sortValue: (rate) => rate.status, cell: (rate) => <StatusPill tone={statusTone(rate)}>{statusLabel(rate, t)}</StatusPill> },
  ], [t])

  const packColumns = useMemo<DataTableColumn<RateRecord>[]>(() => [
    { id: "name", label: t("Customer tariff"), kind: "identity", width: 240, canHide: false, sortValue: (rate) => rate.name, cell: (rate) => <div><p className="font-medium text-[var(--md-ink)]">{rate.name}</p><p className="mt-0.5 text-[11.5px] text-[var(--md-subtle)]" dir="ltr">{rate.code} · v{rate.versionNo}</p></div> },
    { id: "customer", label: t("Customer"), kind: "long-text", width: 180, sortValue: (rate) => rate.customer, cell: (rate) => rate.customer || "—" },
    { id: "items", label: t("Included tariffs"), kind: "number", width: 130, sortValue: (rate) => rate.itemCount, cell: (rate) => rate.itemCount },
    { id: "schedule", label: t("Cycle"), kind: "attribute", width: 105, sortValue: (rate) => rate.schedule, cell: (rate) => t(rate.schedule === "ad_hoc" ? "Ad hoc" : rate.schedule === "weekly" ? "Weekly" : "Monthly") },
    { id: "sell", label: t("Sell"), kind: "number", width: 125, sortValue: (rate) => rate.sellTotal, cell: (rate) => money(rate.sellTotal, rate.currency) },
    { id: "validity", label: t("Validity"), kind: "date", width: 155, sortValue: (rate) => rate.validTo, cell: (rate) => <span dir="ltr">{rate.validFrom} → {rate.validTo}</span> },
    { id: "status", label: t("Status"), kind: "status", width: 140, sortValue: (rate) => rate.status, cell: (rate) => <StatusPill tone={statusTone(rate)}>{statusLabel(rate, t)}</StatusPill> },
  ], [t])

  async function doExpire() { if (!selected) return; setExpiring(true); try { const response = await expireRate(selected.id); setSelected(response.rate); setSelectedDetails((current) => current ? { ...current, rate: response.rate } : current); await refresh(); setDataRevision((current) => current + 1); toast.success(t("Rate expired")) } catch (caught) { toast.error(t("The rate could not be expired"), { description: caught instanceof Error ? caught.message : undefined }) } finally { setExpiring(false) } }
  async function runPackAction(action: "approve" | "generate" | "send") {
    if (!selected) return
    setActing(true)
    try {
      const details = action === "approve" ? await approveRatePack(selected.id) : action === "generate" ? await generateRatePackDocument(selected.id) : await sendRatePackDocument(selected.id, selectedDetails?.publications[0]?.id)
      setSelected(details.rate)
      setSelectedDetails(details)
      setDataRevision((current) => current + 1)
      toast.success(action === "approve" ? t("Customer tariff approved") : action === "generate" ? t("Tariff document generated") : t("Tariff document sent"))
    } catch (caught) {
      toast.error(t("The customer tariff could not be updated"), { description: caught instanceof Error ? caught.message : undefined })
    } finally { setActing(false) }
  }

  const workspaceError = error ? <Alert variant="destructive"><AlertCircle /><AlertTitle>{t("Rates could not be loaded")}</AlertTitle><AlertDescription>{t(error)} <button className="font-medium underline" onClick={() => void refresh()}>{t("Try again")}</button></AlertDescription></Alert> : null
  const workspaceOverlays = <>
    <Sheet open={Boolean(selected)} onOpenChange={(open) => { if (!open) { setSelected(null); setSelectedDetails(null) } }}><SheetContent side="right" className="w-full overflow-y-auto sm:max-w-[560px]"><SheetHeader><SheetTitle>{selected?.name}</SheetTitle><SheetDescription>{selected ? `${selected.code} · ${t(typeLabel(selected.type))} · v${selected.versionNo}` : ""}</SheetDescription></SheetHeader>{selected ? <div className="grid gap-5 px-4 pb-6"><div className="flex flex-wrap gap-2"><StatusPill tone={statusTone(selected)}>{statusLabel(selected, t)}</StatusPill>{selected.type === "cost_tariff" ? <StatusPill kind="attribute" tone="teal">{selected.mode.toUpperCase()}</StatusPill> : null}<StatusPill kind="attribute" tone="blue">{t(selected.schedule === "ad_hoc" ? "Ad hoc" : selected.schedule === "weekly" ? "Weekly" : "Monthly")}</StatusPill></div><div className="grid grid-cols-2 gap-3 rounded-[var(--md-radius-xl)] bg-[var(--md-surface-tint)] p-4">{selected.type === "cost_tariff" ? <div><p className="text-[11.5px] text-[var(--md-subtle)]">{t("Cost")}</p><p className="mt-1 text-[15px] tabular-nums">{money(selected.buyTotal, selected.currency)}</p></div> : <div><p className="text-[11.5px] text-[var(--md-subtle)]">{t("Included tariffs")}</p><p className="mt-1 text-[15px] tabular-nums">{selected.itemCount}</p></div>}<div><p className="text-[11.5px] text-[var(--md-subtle)]">{selected.type === "sales_tariff" ? t("Sell") : t("Contract reference")}</p><p className="mt-1 text-[15px] tabular-nums">{selected.type === "sales_tariff" ? money(selected.sellTotal, selected.currency) : selected.sourceReference || "—"}</p></div></div><dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-3 text-[13px]"><dt className="text-[var(--md-subtle)]">{t("Route")}</dt><dd dir="auto">{selected.origin} → {selected.destination}</dd><dt className="text-[var(--md-subtle)]">{t("Carrier")}</dt><dd>{selected.carrier || "—"}</dd><dt className="text-[var(--md-subtle)]">{t("Customer")}</dt><dd>{selected.customer || t("Any customer")}</dd><dt className="text-[var(--md-subtle)]">{t("Validity")}</dt><dd dir="ltr">{selected.validFrom} → {selected.validTo}</dd></dl>{selected.type === "sales_tariff" && selectedDetails ? <PackItems details={selectedDetails} canManage={workspace.permissions.canManage} onChanged={(details) => { setSelected(details.rate); setSelectedDetails(details); setDataRevision((current) => current + 1) }} /> : null}{selected.type === "sales_tariff" && selectedDetails?.publications.length ? <div><h3 className="text-[13px] font-medium">{t("Published documents")}</h3><div className="mt-3 grid gap-2">{selectedDetails.publications.map((publication) => <div key={publication.id} className="rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] p-3 text-[12px]"><div className="flex justify-between gap-3"><span>{publication.fileName}</span><StatusPill tone={publication.status === "sent" ? "green" : publication.status === "failed" ? "red" : "amber"}>{publication.status.replaceAll("_", " ")}</StatusPill></div>{publication.errorMessage ? <p className="mt-1 text-[var(--md-subtle)]">{publication.errorMessage}</p> : null}</div>)}</div></div> : null}<div><h3 className="flex items-center gap-2 text-[13px] font-medium"><History className="size-4" />{t("Version and audit history")}</h3><div className="mt-3 grid gap-2">{detailsLoading ? <p className="text-[12px] text-[var(--md-subtle)]">{t("Loading history…")}</p> : selectedDetails?.versions.length ? selectedDetails.versions.map((version) => <div key={version.id} className="rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] p-3 text-[12px]"><div className="flex justify-between gap-3"><span className="font-medium">v{version.versionNo} · {version.status}</span><span className="text-[var(--md-subtle)]">{new Date(version.createdAt).toLocaleDateString()}</span></div><p className="mt-1 text-[var(--md-subtle)]">{version.changeReason || t("Version saved")}</p></div>) : <p className="text-[12px] text-[var(--md-subtle)]">{t("No earlier versions")}</p>}</div></div>{workspace.permissions.canManage ? <div className="flex flex-wrap gap-2"><Button onClick={() => { setEditorInitial(selected); setEditorImportId(undefined); setEditorOpen(true) }}><Pencil />{t("Create new version")}</Button>{selected.type === "sales_tariff" ? <><Button onClick={() => void runPackAction("approve")} disabled={acting || selected.status === "expired"}>{acting ? t("Saving rate…") : t("Approve pack")}</Button><Button variant="ghost" onClick={() => void runPackAction("generate")} disabled={acting}><FileSpreadsheet />{t("Generate document")}</Button><Button variant="ghost" onClick={() => void runPackAction("send")} disabled={acting}><Send />{t("Send to customer")}</Button></> : <Button variant="ghost" onClick={() => void doExpire()} disabled={expiring || selected.status === "expired"}><Clock />{expiring ? t("Expiring…") : t("Expire rate")}</Button>}</div> : null}</div> : null}</SheetContent></Sheet>
    <RateEditor open={editorOpen} onOpenChange={setEditorOpen} initial={editorInitial} importId={editorImportId} onSaved={(rate) => { setSelected(rate); setDataRevision((current) => current + 1); void refresh() }} />
  </>

  if (route === "/rates/imports") return <main className="grid gap-5"><div><h1 className="text-[24px] font-medium tracking-[-0.02em] text-[var(--md-ink)]">{t("Rate imports")}</h1><p className="mt-1 text-[13px] text-[var(--md-subtle)]">{t("Extract, check and archive the original commercial source before publishing a rate.")}</p></div><ImportWorkspace workspace={workspace} refresh={refresh} openEditor={(suggested, importId) => { setEditorInitial(suggested); setEditorImportId(importId); setEditorOpen(true) }} /><RateEditor open={editorOpen} onOpenChange={setEditorOpen} initial={editorInitial} importId={editorImportId} onSaved={() => { setDataRevision((current) => current + 1); void refresh() }} /></main>
  if (route === "/rates/results") return <main className="grid gap-5"><div><h1 className="text-[24px] font-medium tracking-[-0.02em] text-[var(--md-ink)]">{t("Quote rate matching")}</h1><p className="mt-1 text-[13px] text-[var(--md-subtle)]">{t("Compare eligible contract and tariff rates, then apply a fixed snapshot to the quote.")}</p></div>{loading ? <p className="text-[13px] text-[var(--md-subtle)]">{t("Loading quote requirements…")}</p> : <QuoteMatching workspace={workspace} navigate={navigate} />}</main>

  if (route === "/rates") return <main className="grid gap-5">
    <div><h1 className="text-[24px] font-medium tracking-[-0.02em] text-[var(--md-ink)]">{t("Rate management")}</h1><p className="mt-1 max-w-3xl text-[13px] leading-5 text-[var(--md-subtle)]">{t("Incoming carrier and supplier cost tariffs, including contract references and customer-specific buy rates.")}</p></div>
    <section aria-label={t("Rate management summary")} className="grid overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)] sm:grid-cols-3">
      {[[t("Expiring or expired"), workspace.summary.attention], [t("Drafts"), workspace.summary.drafts], [t("Sources in review"), workspace.summary.sourcesInReview]].map(([label, value], index) => <div key={String(label)} className={cn("min-h-20 px-5 py-4", index > 0 && "border-t border-[var(--md-line)] sm:border-s sm:border-t-0")}><p className="text-[12px] text-[var(--md-subtle)]">{label}</p><p className="mt-2 text-[24px] font-medium tabular-nums text-[var(--md-ink)]">{value}</p></div>)}
    </section>
    <ExpiryRail counts={expiryCounts} onFilter={(filter) => setExpiryFilter((current) => current === filter ? "" : filter)} />
    {workspaceError}
    {tableError ? <Alert variant="destructive"><AlertCircle /><AlertTitle>{t("Cost tariffs could not be loaded")}</AlertTitle><AlertDescription>{t(tableError)}</AlertDescription></Alert> : null}
    <DataTable columns={costColumns} rows={tableLoading ? [] : tableRows} getRowKey={(rate) => rate.id} storageKey="rates-costs-register" ariaLabel={t("Cost tariff register")} selectedRowKey={selected?.id} onRowClick={setSelected} serverSorting={{ value: serverSort, onChange: setServerSort }} pagination={{ offset, limit: 20, total: tableTotal, loading: tableLoading, onOffsetChange: setOffset }} toolbarTabs={<SegmentedControl options={modes} value={mode} onChange={setMode} ariaLabel={t("Filter cost tariffs by transport mode")} renderOption={(item) => t(modeLabel(item))} />} toolbarSearch={<div className="relative min-w-[220px]"><Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[var(--md-subtle)]" /><Input className={cn(fieldClass, "ps-9")} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Tariff, carrier, route…")} aria-label={t("Search cost tariffs")} /></div>} toolbarFilters={expiryFilter ? <Button variant="ghost" onClick={() => setExpiryFilter("")}>{t("Clear expiry filter")}</Button> : null} emptyState={<div className="px-6 py-12 text-center"><p className="text-[14px] font-medium text-[var(--md-ink)]">{tableLoading ? t("Loading cost tariffs…") : t("No cost tariffs yet")}</p><p className="mx-auto mt-2 max-w-lg text-[13px] leading-5 text-[var(--md-subtle)]">{tableLoading ? t("Checking incoming carrier and supplier tariffs.") : t("Add a carrier or supplier cost tariff to start the incoming rate library.")}</p>{!tableLoading && workspace.permissions.canManage ? <Button className="mt-4" onClick={openNew}><Plus />{t("New cost tariff")}</Button> : null}</div>} />
    {workspaceOverlays}
  </main>

  return <main className="grid gap-5">
    <div><h1 className="text-[24px] font-medium tracking-[-0.02em] text-[var(--md-ink)]">{t("Tariffs and charges")}</h1><p className="mt-1 max-w-3xl text-[13px] leading-5 text-[var(--md-subtle)]">{t("Outgoing customer tariff packs. Include cost tariffs, apply markup or override, then approve the sell document.")}</p></div>
    <section aria-label={t("Customer tariff summary")} className="grid overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)] sm:grid-cols-2 xl:grid-cols-4">
      {[[t("Customer packs"), workspace.summary.customerPacks || workspace.summary.salesTariffs], [t("Needs approval"), workspace.summary.pendingApproval], [t("Customer-specific"), workspace.summary.customerSpecific], [t("Expiring within 30 days"), workspace.summary.expiringTariffs]].map(([label, value], index) => <div key={String(label)} className={cn("min-h-24 px-5 py-4", index > 0 && "border-t border-[var(--md-line)] sm:border-s xl:border-t-0")}><p className="text-[12px] text-[var(--md-subtle)]">{label}</p><p className="mt-2 text-[24px] font-medium tabular-nums text-[var(--md-ink)]">{value}</p></div>)}
    </section>
    <ExpiryRail counts={expiryCounts} includePending onFilter={(filter) => setExpiryFilter((current) => current === filter ? "" : filter)} />
    {workspaceError}
    {tableError ? <Alert variant="destructive"><AlertCircle /><AlertTitle>{t("Customer tariffs could not be loaded")}</AlertTitle><AlertDescription>{t(tableError)}</AlertDescription></Alert> : null}
    <DataTable columns={packColumns} rows={tableLoading ? [] : tableRows} getRowKey={(rate) => rate.id} storageKey="rates-packs-register" ariaLabel={t("Customer tariff register")} selectedRowKey={selected?.id} onRowClick={setSelected} serverSorting={{ value: serverSort, onChange: setServerSort }} pagination={{ offset, limit: 20, total: tableTotal, loading: tableLoading, onOffsetChange: setOffset }} toolbarSearch={<div className="relative min-w-[220px]"><Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[var(--md-subtle)]" /><Input className={cn(fieldClass, "ps-9")} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Customer, pack, route…")} aria-label={t("Search customer tariffs")} /></div>} toolbarFilters={expiryFilter ? <Button variant="ghost" onClick={() => setExpiryFilter("")}>{t("Clear expiry filter")}</Button> : null} emptyState={<div className="px-6 py-12 text-center"><p className="text-[14px] font-medium text-[var(--md-ink)]">{tableLoading ? t("Loading customer tariffs…") : t("No customer tariffs yet")}</p><p className="mx-auto mt-2 max-w-lg text-[13px] leading-5 text-[var(--md-subtle)]">{tableLoading ? t("Checking customer packs and approval status.") : t("Create a customer pack, include incoming cost tariffs, then approve the sell document.")}</p>{!tableLoading && workspace.permissions.canManage ? <Button className="mt-4" onClick={openNew}><Plus />{t("New customer tariff")}</Button> : null}</div>} />
    {workspaceOverlays}
  </main>
}
