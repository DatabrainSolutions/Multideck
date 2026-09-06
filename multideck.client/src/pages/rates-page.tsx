import { defaultPaginationPageSize } from "@/lib/pagination"
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react"
import { AlertCircle, Clock, FileSpreadsheet, History, Pencil, Plus, Search, Upload } from "@/components/icons/hugeicons"
import { DataTable, type DataTableColumn } from "@/components/multideck/data-table"
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
  expireRate,
  getRateDetails,
  getRateOptions,
  getRatesPage,
  getRatesWorkspace,
  saveRate,
  stageRateImport,
  type RateMode,
  type RateOption,
  type RateRecord,
  type RateRecordInput,
  type RateRecordType,
  type RateDetails,
  type RateExpiryCounts,
  type RatesWorkspace,
} from "@/lib/rates-api"
import { subscribeTopBarAction, topBarActionEvents } from "@/lib/top-bar-action-events"
import { cn } from "@/lib/utils"

import { collectExportPages } from "@/lib/table-export"
type RatesRoute = "/rates" | "/rates/contracts" | "/rates/tariffs" | "/rates/imports" | "/rates/results"
type ModeFilter = "all" | RateMode
type TariffFilter = "all" | "cost_tariff" | "sales_tariff"
type RateImportPreviewRow = { id: string; values: string[] }

const modes: ModeFilter[] = ["all", "lcl", "fcl", "air", "road"]
const fieldClass = "h-10 rounded-[var(--md-radius-md)] text-base sm:text-[13px]"
const emptyWorkspace: RatesWorkspace = {
  summary: { total: 0, attention: 0, active: 0, drafts: 0, costTariffs: 0, salesTariffs: 0, customerSpecific: 0, expiringTariffs: 0, sourcesInReview: 0 },
  attention: [], recent: [], imports: [], quotes: [], permissions: { canManage: false },
  integrations: { seaRates: { connected: false, reason: "SeaRates is not connected." } },
}
const emptyExpiryCounts: RateExpiryCounts = { expired: 0, sevenDays: 0, thirtyDays: 0, activeCurrent: 0 }

function Alert({ children, variant = "default", className }: { children: ReactNode; variant?: "default" | "destructive"; className?: string }) {
  return <div role={variant === "destructive" ? "alert" : "status"} className={cn("grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] p-4 text-[13px] shadow-[var(--md-shadow-line)] [&>svg]:mt-0.5 [&>svg]:size-4", variant === "destructive" && "text-[var(--md-red)]", className)}>{children}</div>
}
function AlertTitle({ children }: { children: ReactNode }) { return <strong className="font-medium text-[var(--md-ink)]">{children}</strong> }
function AlertDescription({ children }: { children: ReactNode }) { return <div className="col-start-2 leading-5 text-[var(--md-subtle)]">{children}</div> }

const blankRate: RateRecordInput = {
  code: "",
  name: "",
  type: "contract",
  status: "active",
  mode: "fcl",
  carrier: "",
  supplier: "",
  customer: "",
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
  if (rate.status === "expired" || daysUntil(rate.validTo) < 0) return "red" as const
  if (daysUntil(rate.validTo) <= 30) return "amber" as const
  return rate.status === "active" ? "green" as const : "neutral" as const
}

function typeLabel(type: RateRecordType) {
  return type === "cost_tariff" ? "Cost tariff" : type === "sales_tariff" ? "Sales tariff" : "Contract"
}

function modeLabel(mode: ModeFilter) {
  return mode === "all" ? "All modes" : mode.toUpperCase()
}

function tariffFilterLabel(filter: TariffFilter) {
  return filter === "all" ? "All tariffs" : filter === "cost_tariff" ? "Cost tariffs" : "Sales tariffs"
}

function Field({ label, children, hint, className }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return <label className={cn("grid content-start gap-1.5", className)}><span className="text-[12px] font-medium">{label}</span>{children}{hint ? <span className="text-[11.5px] leading-4 text-[var(--md-subtle)]">{hint}</span> : null}</label>
}

function ExpiryRail({ counts, onFilter }: { counts: RateExpiryCounts; onFilter: (filter: string) => void }) {
  const { t } = useLanguage()
  const items = [
    { key: "expired", label: t("Expired"), count: counts.expired, tone: "red" as const },
    { key: "7", label: t("Expires in 7 days"), count: counts.sevenDays, tone: "amber" as const },
    { key: "30", label: t("Expires in 30 days"), count: counts.thirtyDays, tone: "amber" as const },
    { key: "active", label: t("Active and current"), count: counts.activeCurrent, tone: "green" as const },
  ]
  return <div className="grid overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)] sm:grid-cols-2 xl:grid-cols-4">
    {items.map((item, index) => <button key={item.key} type="button" onClick={() => onFilter(item.key)} className={cn("flex min-h-20 items-center justify-between gap-4 px-5 text-start outline-none transition-[background,color,transform] duration-200 hover:bg-[var(--md-surface-tint)] active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--md-accent-a24)]", index > 0 && "border-t border-[var(--md-line)] sm:border-s xl:border-t-0")}>
      <span><span className="block text-[12px] text-[var(--md-subtle)]">{item.label}</span><strong className="mt-1 block text-[22px] font-medium tabular-nums text-[var(--md-ink)]">{item.count}</strong></span>
      <StatusPill tone={item.tone}>{item.count ? t("Review") : t("Clear")}</StatusPill>
    </button>)}
  </div>
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
  useEffect(() => {
    if (!open) return
    setDraft({ ...blankRate, ...initial, id: initial && "id" in initial ? initial.id : undefined, importId, changeReason: initial && "id" in initial ? "Commercial rate updated" : "Initial version", modeDetails: { ...(initial?.modeDetails ?? {}) }, charges: initial?.charges ?? [] })
    setError("")
  }, [importId, initial, open])
  const update = <Key extends keyof RateRecordInput>(key: Key, value: RateRecordInput[Key]) => setDraft((current) => ({ ...current, [key]: value }))
  const updateSalesRule = (key: "markupPercent" | "minimumSell" | "additionalFee", value: number) => setDraft((current) => {
    const modeDetails = { ...current.modeDetails, [key]: value }
    const markup = Number(modeDetails.markupPercent ?? 0)
    const minimum = Number(modeDetails.minimumSell ?? 0)
    const additional = Number(modeDetails.additionalFee ?? 0)
    return { ...current, modeDetails, sellTotal: Math.max(minimum, current.buyTotal * (1 + markup / 100) + additional) }
  })
  const updateBuyTotal = (value: number) => setDraft((current) => {
    if (current.type !== "sales_tariff") return { ...current, buyTotal: value }
    const markup = Number(current.modeDetails.markupPercent ?? 0)
    const minimum = Number(current.modeDetails.minimumSell ?? 0)
    const additional = Number(current.modeDetails.additionalFee ?? 0)
    return { ...current, buyTotal: value, sellTotal: Math.max(minimum, value * (1 + markup / 100) + additional) }
  })
  async function submit() {
    if (!draft.name.trim() || !draft.origin.trim() || !draft.destination.trim() || !draft.validTo) { setError("Add a name, route and end date before saving."); return }
    if (draft.validTo < draft.validFrom) { setError("The end date must be on or after the start date."); return }
    if (draft.type === "sales_tariff" && draft.sellTotal < draft.buyTotal) { setError("The sales tariff is below cost. Increase sell or record it as a cost tariff."); return }
    setSaving(true); setError("")
    try { const response = await saveRate({ ...draft, code: draft.code.trim() || `RATE-${Date.now().toString().slice(-6)}` }); onSaved(response.rate); onOpenChange(false); toast.success(draft.id ? t("New rate version saved") : t("Rate saved")) }
    catch (caught) { setError(caught instanceof Error ? caught.message : "The rate could not be saved.") }
    finally { setSaving(false) }
  }
  return <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}><DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-[760px]">
    <DialogHeader><DialogTitle>{draft.id ? t("Create a new rate version") : t("Add a rate")}</DialogTitle><DialogDescription>{t("Contract, tariff and mode details stay together so quote matching can use one reliable record.")}</DialogDescription></DialogHeader>
    {error ? <Alert variant="destructive"><AlertCircle /><AlertTitle>{t("Check the rate")}</AlertTitle><AlertDescription>{t(error)}</AlertDescription></Alert> : null}
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={t("Rate type")}><Select value={draft.type} onValueChange={(value: RateRecordType) => update("type", value)}><SelectTrigger className={fieldClass}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="contract">{t("Contract")}</SelectItem><SelectItem value="cost_tariff">{t("Cost tariff")}</SelectItem><SelectItem value="sales_tariff">{t("Sales tariff")}</SelectItem></SelectContent></Select></Field>
      <Field label={t("Transport mode")}><Select value={draft.mode} onValueChange={(value: RateMode) => update("mode", value)}><SelectTrigger className={fieldClass}><SelectValue /></SelectTrigger><SelectContent>{(["lcl", "fcl", "air", "road"] as RateMode[]).map((mode) => <SelectItem value={mode} key={mode}>{mode.toUpperCase()}</SelectItem>)}</SelectContent></Select></Field>
      <Field label={t("Rate name")} className="sm:col-span-2"><Input className={fieldClass} value={draft.name} onChange={(event) => update("name", event.target.value)} placeholder={t("e.g. UK–Japan FCL contract")} /></Field>
      <Field label={t("Carrier")}><Input className={fieldClass} value={draft.carrier} onChange={(event) => update("carrier", event.target.value)} /></Field>
      <Field label={t("Supplier")}><Input className={fieldClass} value={draft.supplier} onChange={(event) => update("supplier", event.target.value)} /></Field>
      {draft.type === "sales_tariff" ? <Field label={t("Customer eligibility")} className="sm:col-span-2" hint={t("Leave blank for every eligible customer.")}><Input className={fieldClass} value={draft.customer} onChange={(event) => update("customer", event.target.value)} /></Field> : null}
      <Field label={t("Origin")}><Input dir="auto" className={fieldClass} value={draft.origin} onChange={(event) => update("origin", event.target.value)} placeholder="GBSOU · Southampton" /></Field>
      <Field label={t("Destination")}><Input dir="auto" className={fieldClass} value={draft.destination} onChange={(event) => update("destination", event.target.value)} placeholder="JPUKB · Kobe" /></Field>
      <Field label={t("Cargo eligibility")}><Input className={fieldClass} value={draft.cargo} onChange={(event) => update("cargo", event.target.value)} /></Field>
      <Field label={t("Service")}><Input className={fieldClass} value={draft.service} onChange={(event) => update("service", event.target.value)} /></Field>
      <ModeFields draft={draft} updateDetails={(key, value) => update("modeDetails", { ...draft.modeDetails, [key]: value })} />
      <Field label={t("Valid from")}><Input type="date" dir="ltr" className={fieldClass} value={draft.validFrom} onChange={(event) => update("validFrom", event.target.value)} /></Field>
      <Field label={t("Valid to")}><Input type="date" dir="ltr" className={fieldClass} value={draft.validTo} onChange={(event) => update("validTo", event.target.value)} /></Field>
      <Field label={t("Tariff cycle")}><Select value={draft.schedule} onValueChange={(value: RateRecordInput["schedule"]) => update("schedule", value)}><SelectTrigger className={fieldClass}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="weekly">{t("Weekly")}</SelectItem><SelectItem value="monthly">{t("Monthly")}</SelectItem><SelectItem value="ad_hoc">{t("Ad hoc")}</SelectItem></SelectContent></Select></Field>
      <Field label={t("Currency")}><Input dir="ltr" maxLength={3} className={fieldClass} value={draft.currency} onChange={(event) => update("currency", event.target.value.toUpperCase())} /></Field>
      <Field label={t("Cost total")}><Input inputMode="decimal" className={fieldClass} value={draft.buyTotal} onChange={(event) => updateBuyTotal(Number(event.target.value))} /></Field>
      <Field label={t("Sell total")} hint={draft.type === "sales_tariff" ? t("Customer documents receive sell values only.") : undefined}><Input inputMode="decimal" className={fieldClass} value={draft.sellTotal} onChange={(event) => update("sellTotal", Number(event.target.value))} /></Field>
      {draft.type === "sales_tariff" ? <>
        <Field label={t("Markup %")}><Input inputMode="decimal" className={fieldClass} value={String(draft.modeDetails.markupPercent ?? "")} onChange={(event) => updateSalesRule("markupPercent", Number(event.target.value))} /></Field>
        <Field label={t("Minimum sell")}><Input inputMode="decimal" className={fieldClass} value={String(draft.modeDetails.minimumSell ?? "")} onChange={(event) => updateSalesRule("minimumSell", Number(event.target.value))} /></Field>
        <Field label={t("Additional fee")} className="sm:col-span-2" hint={t("Added after markup and retained in the immutable version.")}><Input inputMode="decimal" className={fieldClass} value={String(draft.modeDetails.additionalFee ?? "")} onChange={(event) => updateSalesRule("additionalFee", Number(event.target.value))} /></Field>
      </> : null}
      <Field label={t("Source reference")} className="sm:col-span-2"><Input className={fieldClass} value={draft.sourceReference} onChange={(event) => update("sourceReference", event.target.value)} placeholder={t("Email subject, file name or agreement reference")} /></Field>
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
  async function archiveAndReview() { if (!file || !preview) return; setBusy(true); try { const response = await stageRateImport(file, preview); openEditor(preview.suggested, response.importBatch.id); await refresh() } catch (caught) { setError(caught instanceof Error ? caught.message : "The source file could not be archived.") } finally { setBusy(false) } }
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
    <div className="grid gap-3">{!loading && !options.length ? <div className="rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] px-6 py-12 text-center shadow-[var(--md-shadow-line)]"><p className="text-[14px] font-medium text-[var(--md-ink)]">{t("No eligible rates found")}</p><p className="mx-auto mt-2 max-w-lg text-[13px] leading-5 text-[var(--md-subtle)]">{t("Check the quote route, mode and validity, or add a contract or tariff for this lane.")}</p></div> : options.map((option) => <article key={option.id} className="grid gap-4 rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-5 shadow-[var(--md-shadow-line)] lg:grid-cols-[minmax(0,1fr)_auto_auto_auto]"><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-[14px] font-medium text-[var(--md-ink)]">{option.name}</h3><StatusPill tone={option.matchScore >= 80 ? "green" : "amber"}>{option.matchScore}% match</StatusPill><StatusPill kind="attribute" tone="blue">{typeLabel(option.type)}</StatusPill></div><p className="mt-2 text-[12px] text-[var(--md-subtle)]">{option.origin} → {option.destination} · {option.matchReasons.join(" · ")}</p></div><div className="lg:text-end"><p className="text-[11.5px] text-[var(--md-subtle)]">{t("Cost")}</p><p className="mt-1 text-[14px] tabular-nums">{money(option.buyTotal, option.currency)}</p></div><div className="lg:text-end"><p className="text-[11.5px] text-[var(--md-subtle)]">{t("Sell / margin")}</p><p className="mt-1 text-[14px] tabular-nums">{money(option.sellTotal, option.currency)} · {option.marginPercent?.toFixed(1) ?? "—"}%</p></div><Button onClick={() => void apply(option)} disabled={applying !== null}>{applying === option.id ? t("Applying…") : t("Use in quote")}</Button></article>)}</div>
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
  const [pageSize, setPageSize] = useState(defaultPaginationPageSize)
  const [serverSort, setServerSort] = useState<{ id: string; direction: "asc" | "desc" } | null>({ id: "name", direction: "asc" })
  const [dataRevision, setDataRevision] = useState(0)
  const [mode, setMode] = useState<ModeFilter>("all")
  const [tariffFilter, setTariffFilter] = useState<TariffFilter>("all")
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
  const refresh = useCallback(async () => { setLoading(true); setError(""); try { setWorkspace(await getRatesWorkspace()) } catch (caught) { setError(caught instanceof Error ? caught.message : "Rates could not be loaded.") } finally { setLoading(false) } }, [])
  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(query), 250)
    return () => window.clearTimeout(timeout)
  }, [query])
  const openNew = useCallback(() => {
    setEditorInitial(route === "/rates/contracts" ? { type: "contract" } : route === "/rates/tariffs" ? { type: "cost_tariff" } : null)
    setEditorImportId(undefined)
    setEditorOpen(true)
  }, [route])
  const openImport = useCallback(() => navigate("/rates/imports"), [navigate])
  useEffect(() => { const unsubscribeNew = subscribeTopBarAction(topBarActionEvents.createRate, openNew); const unsubscribeImport = subscribeTopBarAction(topBarActionEvents.importRates, openImport); return () => { unsubscribeNew(); unsubscribeImport() } }, [openImport, openNew])
  useEffect(() => {
    setMode("all")
    setTariffFilter("all")
    setExpiryFilter("")
    setSelected(null)
    setSelectedDetails(null)
    setOffset(0)
  }, [route])
  useEffect(() => setOffset(0), [debouncedQuery, expiryFilter, mode, serverSort, tariffFilter])
  useEffect(() => {
    if (route !== "/rates/contracts" && route !== "/rates/tariffs") return undefined
    const controller = new AbortController()
    setTableLoading(true)
    setTableError("")
    void getRatesPage({
      scope: route === "/rates/contracts" ? "contracts" : "tariffs",
      search: debouncedQuery,
      mode: mode === "all" ? undefined : mode,
      tariffType: route === "/rates/tariffs" && tariffFilter !== "all" ? tariffFilter : undefined,
      expiry: expiryFilter ? expiryFilter as "expired" | "7" | "30" | "active" : undefined,
      sort: serverSort,
      limit: pageSize,
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
  }, [dataRevision, debouncedQuery, expiryFilter, mode, offset, pageSize, route, serverSort, tariffFilter])
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

  const contractColumns = useMemo<DataTableColumn<RateRecord>[]>(() => [
    { id: "name", label: t("Agreement"), kind: "identity", width: 250, canHide: false, sortValue: (rate) => rate.name, cell: (rate) => <div><p className="font-medium text-[var(--md-ink)]">{rate.name}</p><p className="mt-0.5 text-[11.5px] text-[var(--md-subtle)]" dir="ltr">{rate.code}</p></div> },
    { id: "mode", label: t("Mode"), kind: "attribute", width: 90, sortValue: (rate) => rate.mode, cell: (rate) => <StatusPill kind="attribute" tone="teal">{rate.mode.toUpperCase()}</StatusPill> },
    { id: "route", label: t("Lane"), kind: "long-text", width: 230, sortValue: (rate) => `${rate.origin}${rate.destination}`, cell: (rate) => <span dir="auto">{rate.origin} → {rate.destination}</span> },
    { id: "carrier", label: t("Carrier / supplier"), kind: "long-text", width: 180, defaultHidden: true, sortValue: (rate) => rate.carrier || rate.supplier, cell: (rate) => rate.carrier || rate.supplier || "—" },
    { id: "validity", label: t("Renewal"), kind: "date", width: 155, sortValue: (rate) => rate.validTo, cell: (rate) => <span dir="ltr">{rate.validFrom} → {rate.validTo}</span> },
    { id: "buy", label: t("Cost basis"), kind: "number", width: 125, sortValue: (rate) => rate.buyTotal, cell: (rate) => money(rate.buyTotal, rate.currency) },
    { id: "version", label: t("Version"), kind: "number", width: 90, defaultHidden: true, sortValue: (rate) => rate.versionNo, cell: (rate) => `v${rate.versionNo}` },
    { id: "status", label: t("Status"), kind: "status", width: 120, sortValue: (rate) => rate.status, cell: (rate) => <StatusPill tone={statusTone(rate)}>{daysUntil(rate.validTo) < 0 ? t("Expired") : daysUntil(rate.validTo) <= 30 ? t("Expiring") : t(rate.status[0].toUpperCase() + rate.status.slice(1))}</StatusPill> },
  ], [t])

  const tariffColumns = useMemo<DataTableColumn<RateRecord>[]>(() => [
    { id: "name", label: t("Tariff"), kind: "identity", width: 240, canHide: false, sortValue: (rate) => rate.name, cell: (rate) => <div><p className="font-medium text-[var(--md-ink)]">{rate.name}</p><p className="mt-0.5 text-[11.5px] text-[var(--md-subtle)]" dir="ltr">{rate.code} · v{rate.versionNo}</p></div> },
    { id: "type", label: t("Kind"), kind: "attribute", width: 130, defaultHidden: true, sortValue: (rate) => rate.type, cell: (rate) => <StatusPill kind="attribute" tone={rate.type === "sales_tariff" ? "green" : "blue"}>{t(typeLabel(rate.type))}</StatusPill> },
    { id: "mode", label: t("Mode"), kind: "attribute", width: 90, sortValue: (rate) => rate.mode, cell: (rate) => <StatusPill kind="attribute" tone="teal">{rate.mode.toUpperCase()}</StatusPill> },
    { id: "route", label: t("Lane"), kind: "long-text", width: 210, sortValue: (rate) => `${rate.origin}${rate.destination}`, cell: (rate) => <span dir="auto">{rate.origin} → {rate.destination}</span> },
    { id: "schedule", label: t("Cycle"), kind: "attribute", width: 105, defaultHidden: true, sortValue: (rate) => rate.schedule, cell: (rate) => t(rate.schedule === "ad_hoc" ? "Ad hoc" : rate.schedule === "weekly" ? "Weekly" : "Monthly") },
    { id: "eligibility", label: t("Eligibility"), kind: "long-text", width: 170, defaultHidden: true, sortValue: (rate) => rate.customer || rate.cargo, cell: (rate) => rate.customer || t("All eligible customers") },
    { id: "buy", label: t("Cost"), kind: "number", width: 115, sortValue: (rate) => rate.buyTotal, cell: (rate) => money(rate.buyTotal, rate.currency) },
    { id: "sell", label: t("Sell / margin"), kind: "number", width: 145, defaultHidden: true, sortValue: (rate) => rate.sellTotal, cell: (rate) => <span>{money(rate.sellTotal, rate.currency)} · {rate.marginPercent?.toFixed(1) ?? "—"}%</span> },
    { id: "validity", label: t("Validity"), kind: "date", width: 155, sortValue: (rate) => rate.validTo, cell: (rate) => <span dir="ltr">{rate.validFrom} → {rate.validTo}</span> },
    { id: "status", label: t("Status"), kind: "status", width: 120, sortValue: (rate) => rate.status, cell: (rate) => <StatusPill tone={statusTone(rate)}>{daysUntil(rate.validTo) < 0 ? t("Expired") : daysUntil(rate.validTo) <= 30 ? t("Expiring") : t(rate.status[0].toUpperCase() + rate.status.slice(1))}</StatusPill> },
  ], [t])

  const attentionRates = workspace.attention
  const recentRates = workspace.recent
  async function doExpire() { if (!selected) return; setExpiring(true); try { const response = await expireRate(selected.id); setSelected(response.rate); setSelectedDetails((current) => current ? { ...current, rate: response.rate } : current); await refresh(); setDataRevision((current) => current + 1); toast.success(t("Rate expired")) } catch (caught) { toast.error(t("The rate could not be expired"), { description: caught instanceof Error ? caught.message : undefined }) } finally { setExpiring(false) } }

  const workspaceError = error ? <Alert variant="destructive"><AlertCircle /><AlertTitle>{t("Rates could not be loaded")}</AlertTitle><AlertDescription>{t(error)} <button className="font-medium underline" onClick={() => void refresh()}>{t("Try again")}</button></AlertDescription></Alert> : null
  const workspaceOverlays = <>
    <Sheet open={Boolean(selected)} onOpenChange={(open) => { if (!open) { setSelected(null); setSelectedDetails(null) } }}><SheetContent side="right" className="w-full overflow-y-auto sm:max-w-[520px]"><SheetHeader><SheetTitle>{selected?.name}</SheetTitle><SheetDescription>{selected ? `${selected.code} · ${t(typeLabel(selected.type))} · v${selected.versionNo}` : ""}</SheetDescription></SheetHeader>{selected ? <div className="grid gap-5 px-4 pb-6"><div className="flex flex-wrap gap-2"><StatusPill tone={statusTone(selected)}>{t(selected.status)}</StatusPill><StatusPill kind="attribute" tone="teal">{selected.mode.toUpperCase()}</StatusPill><StatusPill kind="attribute" tone="blue">{t(selected.schedule === "ad_hoc" ? "Ad hoc" : selected.schedule === "weekly" ? "Weekly" : "Monthly")}</StatusPill></div><div className="grid grid-cols-2 gap-3 rounded-[var(--md-radius-xl)] bg-[var(--md-surface-tint)] p-4"><div><p className="text-[11.5px] text-[var(--md-subtle)]">{t("Cost")}</p><p className="mt-1 text-[15px] tabular-nums">{money(selected.buyTotal, selected.currency)}</p></div><div><p className="text-[11.5px] text-[var(--md-subtle)]">{t("Sell / margin")}</p><p className="mt-1 text-[15px] tabular-nums">{money(selected.sellTotal, selected.currency)} · {selected.marginPercent?.toFixed(1) ?? "—"}%</p></div></div><dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-3 text-[13px]"><dt className="text-[var(--md-subtle)]">{t("Route")}</dt><dd dir="auto">{selected.origin} → {selected.destination}</dd><dt className="text-[var(--md-subtle)]">{t("Carrier")}</dt><dd>{selected.carrier || "—"}</dd><dt className="text-[var(--md-subtle)]">{t("Supplier")}</dt><dd>{selected.supplier || "—"}</dd><dt className="text-[var(--md-subtle)]">{t("Eligibility")}</dt><dd>{selected.customer || t("All eligible customers")} · {selected.cargo}</dd><dt className="text-[var(--md-subtle)]">{t("Validity")}</dt><dd dir="ltr">{selected.validFrom} → {selected.validTo}</dd><dt className="text-[var(--md-subtle)]">{t("Source")}</dt><dd>{selected.sourceReference || selected.sourceType}</dd></dl><div><h3 className="flex items-center gap-2 text-[13px] font-medium"><History className="size-4" />{t("Version and audit history")}</h3><div className="mt-3 grid gap-2">{detailsLoading ? <p className="text-[12px] text-[var(--md-subtle)]">{t("Loading history…")}</p> : selectedDetails?.versions.length ? selectedDetails.versions.map((version) => <div key={version.id} className="rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] p-3 text-[12px]"><div className="flex justify-between gap-3"><span className="font-medium">v{version.versionNo} · {version.status}</span><span className="text-[var(--md-subtle)]">{new Date(version.createdAt).toLocaleDateString()}</span></div><p className="mt-1 text-[var(--md-subtle)]">{version.changeReason || t("Version saved")}</p></div>) : <p className="text-[12px] text-[var(--md-subtle)]">{t("No earlier versions")}</p>}</div></div>{workspace.permissions.canManage ? <div className="flex flex-wrap gap-2"><Button onClick={() => { setEditorInitial(selected); setEditorImportId(undefined); setEditorOpen(true) }}><Pencil />{t("Create new version")}</Button><Button variant="ghost" onClick={() => void doExpire()} disabled={expiring || selected.status === "expired"}><Clock />{expiring ? t("Expiring…") : t("Expire rate")}</Button></div> : null}</div> : null}</SheetContent></Sheet>
    <RateEditor open={editorOpen} onOpenChange={setEditorOpen} initial={editorInitial} importId={editorImportId} onSaved={(rate) => { setSelected(rate); setDataRevision((current) => current + 1); void refresh() }} />
  </>

  if (route === "/rates/imports") return <main className="grid gap-5"><div><h1 className="text-[24px] font-medium tracking-[-0.02em] text-[var(--md-ink)]">{t("Rate imports")}</h1><p className="mt-1 text-[13px] text-[var(--md-subtle)]">{t("Extract, check and archive the original commercial source before publishing a rate.")}</p></div><ImportWorkspace workspace={workspace} refresh={refresh} openEditor={(suggested, importId) => { setEditorInitial(suggested); setEditorImportId(importId); setEditorOpen(true) }} /><RateEditor open={editorOpen} onOpenChange={setEditorOpen} initial={editorInitial} importId={editorImportId} onSaved={() => { setDataRevision((current) => current + 1); void refresh() }} /></main>
  if (route === "/rates/results") return <main className="grid gap-5"><div><h1 className="text-[24px] font-medium tracking-[-0.02em] text-[var(--md-ink)]">{t("Quote rate matching")}</h1><p className="mt-1 text-[13px] text-[var(--md-subtle)]">{t("Compare eligible contract and tariff rates, then apply a fixed snapshot to the quote.")}</p></div>{loading ? <p className="text-[13px] text-[var(--md-subtle)]">{t("Loading quote requirements…")}</p> : <QuoteMatching workspace={workspace} navigate={navigate} />}</main>

  if (route === "/rates") return <main className="grid gap-5">
    <div><h1 className="text-[24px] font-medium tracking-[-0.02em] text-[var(--md-ink)]">{t("Rate management")}</h1><p className="mt-1 max-w-3xl text-[13px] leading-5 text-[var(--md-subtle)]">{t("See what needs review, keep commercial sources current and move approved rates into quote matching.")}</p></div>
    {workspaceError}
    <section aria-label={t("Rate management summary")} className="grid overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)] sm:grid-cols-2 xl:grid-cols-4">
      {[
        [t("Needs review"), workspace.summary.attention],
        [t("Active rates"), workspace.summary.active],
        [t("Drafts"), workspace.summary.drafts],
        [t("Sources in review"), workspace.summary.sourcesInReview],
      ].map(([label, value], index) => <div key={String(label)} className={cn("min-h-24 px-5 py-4", index > 0 && "border-t border-[var(--md-line)] sm:border-s xl:border-t-0")}><p className="text-[12px] text-[var(--md-subtle)]">{label}</p><p className="mt-2 text-[24px] font-medium tabular-nums text-[var(--md-ink)]">{value}</p></div>)}
    </section>
    {!loading && !workspace.summary.total ? <section className="overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)] lg:grid lg:grid-cols-[minmax(260px,0.72fr)_minmax(0,1.28fr)]">
      <div className="border-b border-[var(--md-line)] p-6 lg:border-b-0 lg:border-e"><span className="grid size-10 place-items-center rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)]"><FileSpreadsheet className="size-5" /></span><h2 className="mt-4 text-[18px] font-medium text-[var(--md-ink)]">{t("Build your rate library")}</h2><p className="mt-2 max-w-md text-[13px] leading-5 text-[var(--md-subtle)]">{t("Import or add commercial rates, review the evidence, then make approved pricing available to quotes.")}</p></div>
      <ol className="divide-y divide-[var(--md-line)]">
        <li className="grid gap-3 p-5 sm:grid-cols-[32px_minmax(0,1fr)_auto] sm:items-center"><span className="grid size-8 place-items-center rounded-full bg-[var(--md-surface-tint)] text-[12px] font-medium">1</span><div><h3 className="text-[13px] font-medium text-[var(--md-ink)]">{t("Bring in the source")}</h3><p className="mt-1 text-[12px] leading-5 text-[var(--md-subtle)]">{t("Import a spreadsheet, PDF, email or text file and keep the original evidence.")}</p></div><Button variant="ghost" onClick={() => navigate("/rates/imports")}><Upload />{t("Import source")}</Button></li>
        <li className="grid gap-3 p-5 sm:grid-cols-[32px_minmax(0,1fr)_auto] sm:items-center"><span className="grid size-8 place-items-center rounded-full bg-[var(--md-surface-tint)] text-[12px] font-medium">2</span><div><h3 className="text-[13px] font-medium text-[var(--md-ink)]">{t("Review and publish")}</h3><p className="mt-1 text-[12px] leading-5 text-[var(--md-subtle)]">{t("Check validity, route, mode and commercial values before the rate becomes active.")}</p></div>{workspace.permissions.canManage ? <Button variant="ghost" onClick={openNew}><Plus />{t("Add first rate")}</Button> : null}</li>
        <li className="grid gap-3 p-5 sm:grid-cols-[32px_minmax(0,1fr)_auto] sm:items-center"><span className="grid size-8 place-items-center rounded-full bg-[var(--md-surface-tint)] text-[12px] font-medium">3</span><div><h3 className="text-[13px] font-medium text-[var(--md-ink)]">{t("Match to a quote")}</h3><p className="mt-1 text-[12px] leading-5 text-[var(--md-subtle)]">{t("Compare eligible pricing and save the selected rate as an immutable quote snapshot.")}</p></div><Button variant="ghost" onClick={() => navigate("/rates/results")}>{t("Open quote matching")}</Button></li>
      </ol>
    </section> : <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(300px,0.9fr)]">
      <section className="rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-5 shadow-[var(--md-shadow-line)]"><div className="flex items-center justify-between gap-3"><div><h2 className="text-[15px] font-medium text-[var(--md-ink)]">{t("Attention queue")}</h2><p className="mt-1 text-[12px] text-[var(--md-subtle)]">{t("Expired, expiring and draft pricing that needs a decision.")}</p></div><StatusPill tone={attentionRates.length ? "amber" : "green"}>{attentionRates.length ? t("Review") : t("Clear")}</StatusPill></div><div className="mt-4 divide-y divide-[var(--md-line)]">{attentionRates.length ? attentionRates.slice(0, 6).map((rate) => <button key={rate.id} type="button" onClick={() => setSelected(rate)} className="flex w-full items-center justify-between gap-4 py-3 text-start outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a24)]"><span><span className="block text-[13px] font-medium text-[var(--md-ink)]">{rate.name}</span><span className="mt-1 block text-[12px] text-[var(--md-subtle)]" dir="auto">{rate.origin} → {rate.destination}</span></span><StatusPill tone={statusTone(rate)}>{daysUntil(rate.validTo) < 0 ? t("Expired") : rate.status === "draft" ? t("Draft") : t("Expiring")}</StatusPill></button>) : <p className="py-8 text-center text-[13px] text-[var(--md-subtle)]">{t("Everything is current. No rate decisions are waiting.")}</p>}</div></section>
      <section className="rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-5 shadow-[var(--md-shadow-line)]"><h2 className="text-[15px] font-medium text-[var(--md-ink)]">{t("Recently updated")}</h2><p className="mt-1 text-[12px] text-[var(--md-subtle)]">{t("The latest commercial records across contracts and tariffs.")}</p><div className="mt-4 divide-y divide-[var(--md-line)]">{recentRates.map((rate) => <button key={rate.id} type="button" onClick={() => setSelected(rate)} className="flex w-full items-center justify-between gap-3 py-3 text-start outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a24)]"><span className="min-w-0"><span className="block truncate text-[13px] font-medium text-[var(--md-ink)]">{rate.name}</span><span className="mt-1 block text-[12px] text-[var(--md-subtle)]">{t(typeLabel(rate.type))} · {new Date(rate.updatedAt).toLocaleDateString()}</span></span><StatusPill kind="attribute" tone="teal">{rate.mode.toUpperCase()}</StatusPill></button>)}</div></section>
    </div>}
    {workspaceOverlays}
  </main>

  if (route === "/rates/contracts") return <main className="grid gap-5">
    <div><h1 className="text-[24px] font-medium tracking-[-0.02em] text-[var(--md-ink)]">{t("Rate contracts")}</h1><p className="mt-1 max-w-3xl text-[13px] leading-5 text-[var(--md-subtle)]">{t("Manage negotiated carrier and supplier agreements, versions and renewal dates.")}</p></div>
    <ExpiryRail counts={expiryCounts} onFilter={(filter) => setExpiryFilter((current) => current === filter ? "" : filter)} />
    {workspaceError}
    {tableError ? <Alert variant="destructive"><AlertCircle /><AlertTitle>{t("Rate contracts could not be loaded")}</AlertTitle><AlertDescription>{t(tableError)}</AlertDescription></Alert> : null}
    <DataTable exportConfig={{ fileName: route === "/rates/contracts" ? "rate-contracts" : "tariffs", register: {
      dateLabel: "Valid from date", dateValue: (rate) => rate.validFrom, busy: query.trim() !== debouncedQuery.trim(),
      loadAllRows: (signal) => collectExportPages((page) => getRatesPage({
        scope: "contracts", search: debouncedQuery,
        mode: mode === "all" ? undefined : mode,
        expiry: expiryFilter ? expiryFilter as "expired" | "7" | "30" | "active" : undefined, sort: serverSort, ...page,
      }, signal), (rate) => rate.id, signal),
    } }} columns={contractColumns} rows={tableLoading ? [] : tableRows} getRowKey={(rate) => rate.id} storageKey="rates-contracts-register" ariaLabel={t("Rate contracts register")} selectedRowKey={selected?.id} onRowClick={setSelected} serverSorting={{ value: serverSort, onChange: setServerSort }} pagination={{ offset, limit: pageSize, total: tableTotal, loading: tableLoading, onOffsetChange: setOffset, onLimitChange: setPageSize, error: Boolean(tableError) }} toolbarTabs={<SegmentedControl options={modes} value={mode} onChange={setMode} ariaLabel={t("Filter contracts by transport mode")} renderOption={(item) => t(modeLabel(item))} />} toolbarSearch={<div className="relative min-w-[220px]"><Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[var(--md-subtle)]" /><Input className={cn(fieldClass, "ps-9")} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Agreement, carrier, route…")} aria-label={t("Search rate contracts")} /></div>} toolbarFilters={expiryFilter ? <Button variant="ghost" onClick={() => setExpiryFilter("")}>{t("Clear expiry filter")}</Button> : null} emptyState={<div className="px-6 py-12 text-center"><p className="text-[14px] font-medium text-[var(--md-ink)]">{tableLoading ? t("Loading contracts…") : t("No rate contracts yet")}</p><p className="mx-auto mt-2 max-w-lg text-[13px] leading-5 text-[var(--md-subtle)]">{tableLoading ? t("Checking agreement versions and renewal dates.") : t("Add a negotiated carrier or supplier agreement to control cost pricing for its lanes.")}</p>{!tableLoading && workspace.permissions.canManage ? <Button className="mt-4" onClick={openNew}><Plus />{t("Add contract")}</Button> : null}</div>} />
    {workspaceOverlays}
  </main>

  return <main className="grid gap-5">
    <div><h1 className="text-[24px] font-medium tracking-[-0.02em] text-[var(--md-ink)]">{t("Tariffs and charges")}</h1><p className="mt-1 max-w-3xl text-[13px] leading-5 text-[var(--md-subtle)]">{t("Control cost and sales tariffs, customer eligibility, charge cycles and margin.")}</p></div>
    <section aria-label={t("Tariff summary")} className="grid overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)] sm:grid-cols-2 xl:grid-cols-4">
      {[
        [t("Cost tariffs"), workspace.summary.costTariffs],
        [t("Sales tariffs"), workspace.summary.salesTariffs],
        [t("Customer-specific"), workspace.summary.customerSpecific],
        [t("Expiring within 30 days"), workspace.summary.expiringTariffs],
      ].map(([label, value], index) => <div key={String(label)} className={cn("min-h-24 px-5 py-4", index > 0 && "border-t border-[var(--md-line)] sm:border-s xl:border-t-0")}><p className="text-[12px] text-[var(--md-subtle)]">{label}</p><p className="mt-2 text-[24px] font-medium tabular-nums text-[var(--md-ink)]">{value}</p></div>)}
    </section>
    {workspaceError}
    {tableError ? <Alert variant="destructive"><AlertCircle /><AlertTitle>{t("Tariffs could not be loaded")}</AlertTitle><AlertDescription>{t(tableError)}</AlertDescription></Alert> : null}
    <DataTable exportConfig={{ fileName: "tariffs", register: {
      dateLabel: "Valid from date", dateValue: (rate) => rate.validFrom, busy: query.trim() !== debouncedQuery.trim(),
      loadAllRows: (signal) => collectExportPages((page) => getRatesPage({
        scope: "tariffs", search: debouncedQuery,
        mode: mode === "all" ? undefined : mode, tariffType: route === "/rates/tariffs" && tariffFilter !== "all" ? tariffFilter : undefined,
        expiry: expiryFilter ? expiryFilter as "expired" | "7" | "30" | "active" : undefined, sort: serverSort, ...page,
      }, signal), (rate) => rate.id, signal),
    } }} columns={tariffColumns} rows={tableLoading ? [] : tableRows} getRowKey={(rate) => rate.id} storageKey="rates-tariffs-register" ariaLabel={t("Tariffs and charges register")} selectedRowKey={selected?.id} onRowClick={setSelected} serverSorting={{ value: serverSort, onChange: setServerSort }} pagination={{ offset, limit: pageSize, total: tableTotal, loading: tableLoading, onOffsetChange: setOffset, onLimitChange: setPageSize, error: Boolean(tableError) }} toolbarTabs={<SegmentedControl options={["all", "cost_tariff", "sales_tariff"] as TariffFilter[]} value={tariffFilter} onChange={setTariffFilter} ariaLabel={t("Filter by tariff kind")} renderOption={(item) => t(tariffFilterLabel(item))} />} toolbarSearch={<div className="relative min-w-[220px]"><Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[var(--md-subtle)]" /><Input className={cn(fieldClass, "ps-9")} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Tariff, customer, route…")} aria-label={t("Search tariffs and charges")} /></div>} toolbarFilters={<div className="flex items-center gap-2"><Select value={mode} onValueChange={(value: ModeFilter) => setMode(value)}><SelectTrigger className="h-9 w-[130px]" aria-label={t("Filter tariffs by transport mode")}><SelectValue /></SelectTrigger><SelectContent>{modes.map((item) => <SelectItem key={item} value={item}>{t(modeLabel(item))}</SelectItem>)}</SelectContent></Select>{expiryFilter ? <Button variant="ghost" onClick={() => setExpiryFilter("")}>{t("Clear expiry filter")}</Button> : null}</div>} emptyState={<div className="px-6 py-12 text-center"><p className="text-[14px] font-medium text-[var(--md-ink)]">{tableLoading ? t("Loading tariffs…") : t("No tariffs or charges yet")}</p><p className="mx-auto mt-2 max-w-lg text-[13px] leading-5 text-[var(--md-subtle)]">{tableLoading ? t("Checking cost, sell and customer eligibility rules.") : t("Add cost pricing or a customer sales tariff to make this lane eligible for quote matching.")}</p>{!tableLoading && workspace.permissions.canManage ? <Button className="mt-4" onClick={openNew}><Plus />{t("Add tariff")}</Button> : null}</div>} />
    {workspaceOverlays}
  </main>
}
