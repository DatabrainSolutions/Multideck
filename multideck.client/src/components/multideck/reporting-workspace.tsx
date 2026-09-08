import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react"
import { ArrowDown, ArrowLeft, ArrowUp, BarChart3, Copy, FileSpreadsheet, FileText, LoaderCircle, Plus, Save, X } from "@/components/icons/hugeicons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DataTable, type DataTableColumn } from "@/components/multideck/data-table"
import { BarChartCard, LineChartCard, DonutChartCard, type ChartDataPoint } from "@/components/multideck/chart-components"
import { useLanguage } from "@/i18n/language-provider"
import { subscribeTopBarAction, topBarActionEvents } from "@/lib/top-bar-action-events"
import { rememberDexterTaskHandoff } from "@/lib/dexter-navigation"
import { supabaseFunctionsUrl } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { downloadReport, newReportQuery, reportingRequest, reportSchedulePayload, type ReportBlock, type ReportDefinition, type ReportPeriod, type ReportQuery, type ReportResult, type ReportRun, type ReportSchedule, type ReportSnapshot, type ReportSource, type ReportsWorkspace, type SavedReport } from "@/lib/reporting-api"

const box = "rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)]"
const hint = "text-[12px] leading-5 text-[var(--md-text)]"
const textArea = "min-h-24 w-full rounded-[var(--md-radius-lg)] border border-[var(--md-line)] bg-[var(--md-surface)] px-3 py-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent)]"
const kindName = { table: "Table", chart: "Chart", document: "Document" }
const money = (value: number, locale: string, currency?: string) => new Intl.NumberFormat(locale, { maximumFractionDigits: 2, ...(currency ? { style: "currency", currency } : {}) }).format(value)

function Field({ label, children, help }: { label: string; children: ReactNode; help?: string }) {
  return <div className="grid min-w-0 gap-1.5"><span className="text-[12px] font-medium text-[var(--md-ink)]">{label}</span>{children}{help && <p className={hint}>{help}</p>}</div>
}
function Choice({ label, value, onChange, options, help }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; help?: string }) {
  const id = useId()
  return <Field label={label} help={help}><Select value={value || "_none"} onValueChange={v => onChange(v === "_none" ? "" : v)}><SelectTrigger id={id} aria-label={label} className="h-9 w-full"><SelectValue /></SelectTrigger><SelectContent>{options.map(o => <SelectItem key={o.value || "_none"} value={o.value || "_none"}>{o.label}</SelectItem>)}</SelectContent></Select></Field>
}
function ErrorMessage({ message, retry }: { message: string; retry?: () => void }) {
  return <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--md-radius-lg)] bg-[color-mix(in_srgb,var(--md-red)_8%,var(--md-surface))] px-4 py-3 text-[13px] text-[var(--md-ink)]"><p>{message}</p>{retry && <Button variant="outline" size="sm" onClick={retry}>Try again</Button>}</div>
}
function PeriodEditor({ value, onChange }: { value: ReportPeriod; onChange: (value: ReportPeriod) => void }) {
  return <div className="grid gap-3"><Choice label="Period" value={value.preset} onChange={preset => onChange({ ...value, preset: preset as ReportPeriod["preset"] })} options={[
    { value: "last12months", label: "Last 12 months to today" }, { value: "last2months", label: "Last 2 complete months" }, { value: "lastmonth", label: "Last complete month" }, { value: "thismonth", label: "This month to today" }, { value: "custom", label: "Choose dates" },
  ]} />{value.preset === "custom" && <div className="grid grid-cols-2 gap-2"><Field label="From"><Input aria-label="From date" type="date" value={value.start || ""} onChange={e => onChange({ ...value, start: e.target.value })} /></Field><Field label="To (inclusive)"><Input aria-label="To date" type="date" value={value.end || ""} onChange={e => onChange({ ...value, end: e.target.value })} /></Field></div>}</div>
}

function QueryEditor({ query, sources, onChange, periodLocked = false }: { query: ReportQuery; sources: ReportSource[]; onChange: (query: ReportQuery) => void; periodLocked?: boolean }) {
  const [columnSearch, setColumnSearch] = useState("")
  const source = sources.find(s => s.id === query.source)
  if (!source) return <p className={hint}>This data source is no longer available to your account.</p>
  const update = (patch: Partial<ReportQuery>) => onChange({ ...query, ...patch })
  const columns = source.fields.filter(f => f.label.toLowerCase().includes(columnSearch.toLowerCase()))
  const move = (field: string, direction: number) => {
    const next = [...query.columns]; const i = next.indexOf(field); const j = i + direction
    if (i >= 0 && j >= 0 && j < next.length) { [next[i], next[j]] = [next[j], next[i]]; update({ columns: next }) }
  }
  return <div className="grid gap-5">
    <div className="grid gap-3"><Choice label="Data" value={query.source} options={sources.map(s => ({ value: s.id, label: s.label }))} onChange={id => { const s = sources.find(s => s.id === id); if (s) onChange({ ...newReportQuery(s), period: query.period, mode: query.mode }) }} />
      <Choice label="Date to use" value={query.dateField} onChange={dateField => update({ dateField })} options={source.fields.filter(f => f.type === "date").map(f => ({ value: f.id, label: f.label }))} />
      {!periodLocked && <PeriodEditor value={query.period} onChange={period => update({ period })} />}
      <details><summary className="cursor-pointer text-[12px] text-[var(--md-accent)]">What this data includes</summary><p className={cn(hint, "mt-2")}>{source.description}</p></details>
    </div>
    <div className="grid gap-3 border-t border-[var(--md-line)] pt-4"><Choice label="Show" value={query.mode} onChange={mode => update({ mode: mode as ReportQuery["mode"] })} options={[{ value: "rows", label: "Individual records" }, { value: "summary", label: "Summarised results" }]} />
      {query.mode === "summary" && <><Choice label="Measure" value={query.measure} onChange={measure => update({ measure })} options={[{ value: "count", label: "Number of records" }, ...source.fields.filter(f => ["money", "number"].includes(f.type)).map(f => ({ value: f.id, label: f.label }))]} />
        {query.measure !== "count" && <Choice label="Calculate" value={query.aggregation} onChange={aggregation => update({ aggregation: aggregation as ReportQuery["aggregation"] })} options={[{ value: "sum", label: "Total" }, { value: "avg", label: "Average" }, { value: "min", label: "Minimum" }, { value: "max", label: "Maximum" }]} />}
        <Choice label="Group by" value={query.groupBy} onChange={groupBy => update({ groupBy })} options={[{ value: "month", label: "Month" }, { value: "day", label: "Day" }, { value: "total", label: "One total" }, ...source.fields.filter(f => f.type === "text").map(f => ({ value: f.id, label: f.label }))]} />
        <Choice label="Compare with" value={query.compare} onChange={compare => update({ compare: compare as ReportQuery["compare"] })} options={[{ value: "none", label: "No comparison" }, { value: "previous", label: "Previous period of the same length" }]} />
      </>}
      {source.fields.some(f => f.id === "currency") && <Field label={query.mode === "summary" && query.measure !== "count" ? "Currency (required)" : "Currency (optional)"} help="Amounts retain their original currency. No conversion is applied."><Input aria-label="Currency" maxLength={3} placeholder="e.g. GBP" value={query.currency} onChange={e => update({ currency: e.target.value.toUpperCase().replace(/[^A-Z]/g, "") })} /></Field>}
    </div>
    <div className="grid gap-3 border-t border-[var(--md-line)] pt-4"><div className="flex items-center justify-between"><span className="text-[13px] font-medium">Filters</span><Button variant="ghost" size="sm" disabled={query.filters.length >= 20} onClick={() => update({ filters: [...query.filters, { field: "customer", op: "contains", value: "" }] })}><Plus className="size-3.5" />Add filter</Button></div>
      {query.filters.length > 1 && <Choice label="Match" value={query.filterMatch} onChange={filterMatch => update({ filterMatch: filterMatch as "all" | "any" })} options={[{ value: "all", label: "All conditions" }, { value: "any", label: "Any condition" }]} />}
      {query.filters.map((filter, index) => <div key={index} className="grid gap-2 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] p-3">
        <div className="flex items-end gap-2"><div className="min-w-0 flex-1"><Choice label={`Filter ${index + 1} field`} value={filter.field} options={source.fields.map(f => ({ value: f.id, label: f.label }))} onChange={field => update({ filters: query.filters.map((f, i) => i === index ? { field, op: "eq", value: "" } : f) })} /></div><Button variant="ghost" size="icon" aria-label={`Remove filter ${index + 1}`} onClick={() => update({ filters: query.filters.filter((_, i) => i !== index) })}><X className="size-4" /></Button></div>
        <Choice label={`Filter ${index + 1} condition`} value={filter.op} onChange={op => update({ filters: query.filters.map((f, i) => i === index ? { ...f, op: op as typeof f.op } : f) })} options={[{ value: "eq", label: "Is" }, { value: "neq", label: "Is not" }, { value: "contains", label: "Contains" }, { value: "empty", label: "Is empty" }, { value: "notEmpty", label: "Is not empty" }, ...(source.fields.find(f => f.id === filter.field)?.type !== "text" ? [{ value: "gte", label: "On or above" }, { value: "lte", label: "On or below" }] : [])]} />
        {!["empty", "notEmpty"].includes(filter.op) && <Input aria-label={`Filter ${index + 1} value`} placeholder="Enter a value" value={filter.value} onChange={e => update({ filters: query.filters.map((f, i) => i === index ? { ...f, value: e.target.value } : f) })} />}
      </div>)}
      {!query.filters.length && <p className={hint}>All records in the selected period.</p>}
    </div>
    {query.mode === "rows" && <div className="grid gap-3 border-t border-[var(--md-line)] pt-4"><span className="text-[13px] font-medium">Columns · {query.columns.length}</span>
      <div className="grid gap-1">{query.columns.map((id, index) => <div key={id} className="flex items-center gap-1 text-[12px]"><span className="min-w-0 flex-1">{source.fields.find(f => f.id === id)?.label}</span><Button variant="ghost" size="icon" className="size-7" aria-label={`Move ${id} up`} disabled={index === 0} onClick={() => move(id, -1)}><ArrowUp className="size-3" /></Button><Button variant="ghost" size="icon" className="size-7" aria-label={`Move ${id} down`} disabled={index === query.columns.length - 1} onClick={() => move(id, 1)}><ArrowDown className="size-3" /></Button></div>)}</div>
      <Input aria-label="Find a column" placeholder="Find a column…" value={columnSearch} onChange={e => setColumnSearch(e.target.value)} />
      <div className="grid max-h-56 gap-2 overflow-y-auto">{columns.map(field => <label key={field.id} className="flex cursor-pointer items-center gap-2 py-1 text-[12px]"><Checkbox checked={query.columns.includes(field.id)} onCheckedChange={checked => update({ columns: checked ? [...query.columns, field.id] : query.columns.filter(id => id !== field.id) })} />{field.label}</label>)}</div>
      <Choice label="Sort by" value={query.sort.field} onChange={field => update({ sort: { ...query.sort, field } })} options={source.fields.map(f => ({ value: f.id, label: f.label }))} />
      <Choice label="Order" value={query.sort.direction} onChange={direction => update({ sort: { ...query.sort, direction: direction as "asc" | "desc" } })} options={[{ value: "desc", label: "Descending / newest first" }, { value: "asc", label: "Ascending / oldest first" }]} />
    </div>}
  </div>
}

function ResultView({ result, query, kind, title, navigate }: { result: ReportResult; query: ReportQuery; kind: string; title: string; navigate: (path: string) => void }) {
  const { language } = useLanguage()
  const locale = language || "en-GB"
  const [showData, setShowData] = useState(false)
  const chart = kind === "chart" && query.mode === "summary"
  const columns: DataTableColumn<Record<string, string | number | null>>[] = result.columns.map(f => ({ id: f.id, label: f.label, kind: ["money", "number"].includes(f.type) ? "number" : f.id === "reference" ? "identity" : "text",
    cell: row => <span data-i18n-skip>{row[f.id] === null || row[f.id] === undefined ? "Not set" : typeof row[f.id] === "number" ? money(Number(row[f.id]), locale) : String(row[f.id])}</span>, sortValue: row => row[f.id] ?? "" }))
  const data = result.rows.map(row => ({ label: String(row.label ?? ""), value: Number(row.value ?? 0) })) as ChartDataPoint[]
  const series = [{ key: "value", label: query.measure === "count" ? "Records" : "Value", color: "var(--md-accent)" }]
  return <div className="grid min-w-0 gap-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><p className={hint}>{result.start} to {result.end} · {result.recordCount.toLocaleString(locale)} records{query.currency ? ` · ${query.currency}` : ""}</p>{chart && <Button variant="ghost" size="sm" onClick={() => setShowData(!showData)}>{showData ? "Show chart" : "View data table"}</Button>}</div>
    {query.mode === "summary" && result.value !== undefined && <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1"><span className="text-[30px] font-medium tracking-tight" data-i18n-skip>{money(result.value, locale, query.measure !== "count" ? query.currency : undefined)}</span><div className={hint}>{result.comparison ? <><span className={result.comparison.change >= 0 ? "text-[var(--md-green)]" : "text-[var(--md-red)]"}>{result.comparison.change > 0 ? "+" : ""}{money(result.comparison.change, locale, query.measure !== "count" ? query.currency : undefined)}{result.comparison.percent !== null ? ` (${result.comparison.percent > 0 ? "+" : ""}${result.comparison.percent}%)` : " (no percentage: previous value is zero)"}</span><p>Compared with {result.comparison.start} to {result.comparison.end}</p></> : "For the selected period"}</div></div>}
    {result.recordCount === 0 ? <div className="grid min-h-52 place-content-center text-center"><h3 className="text-[15px] font-medium">No matching records</h3><p className={cn(hint, "mt-2")}>Try a wider period or change a filter.</p></div> : chart && !showData ? query.chart === "line" ? <LineChartCard compact className="bg-transparent p-0 [&_.md-chart-header]:hidden" title={title} subtitle="" data={data} xKey="label" series={series} showLegend={false} /> : query.chart === "pie" && data.every(d => Number(d.value) >= 0) ? <DonutChartCard compact className="bg-transparent p-0 [&_.md-chart-header]:hidden" title={title} subtitle="" data={data.map(d => ({ name: String(d.label), value: Number(d.value) }))} centerLabel={query.measure === "count" ? "records" : query.currency} centerValueFormatter={v => money(v, locale)} /> : <BarChartCard compact className="bg-transparent p-0 [&_.md-chart-header]:hidden" title={title} subtitle={query.chart === "pie" ? "Negative values are shown as bars." : ""} data={data} xKey="label" series={series} variant="single" showLegend={false} /> :
      <DataTable columns={columns} rows={result.rows} getRowKey={r => String(r.id ?? r.label)} ariaLabel={`${title} data`} enableSelectionExport={false} showColumnManager={false} showToolbar={false} minimumWidth={Math.max(440, result.columns.length * 135)} onRowClick={query.mode === "rows" ? r => { if (typeof r.sourceUrl === "string") navigate(r.sourceUrl) } : undefined} />}
    {result.truncated && <p role="status" className={hint}>Preview shows the first 200 of {result.total.toLocaleString(locale)} rows. Generate a snapshot to include up to 10,000 rows.</p>}
  </div>
}

function SnapshotView({ snapshot, definition, name, navigate }: { snapshot: ReportSnapshot; definition: ReportDefinition; name: string; navigate: (path: string) => void }) {
  if (snapshot.kind !== "document" && snapshot.query && definition.query) return <ResultView result={snapshot.query} query={definition.query} kind={snapshot.kind} title={name} navigate={navigate} />
  return <div className={cn(box, "mx-auto grid w-full max-w-[920px] gap-8 p-5 sm:p-9")}><div className="border-b border-[var(--md-line)] pb-5"><span className="text-[12px] font-medium text-[var(--md-accent)]">Multideck</span><h2 data-i18n-skip className="mt-4 text-[26px] font-medium tracking-tight">{name || "Untitled document"}</h2>{definition.customer && <p className={cn(hint, "mt-2")} data-i18n-skip>{definition.customer}</p>}</div>
    {snapshot.blocks?.map(block => <section key={block.id} className="grid min-w-0 gap-3"><h3 className="text-[17px] font-medium" data-i18n-skip>{block.title}</h3>{block.kind === "text" ? <p className="whitespace-pre-wrap text-[13px] leading-6" data-i18n-skip>{block.text}</p> : block.result && block.query && <ResultView result={block.result} query={block.query} kind={block.kind} title={block.title} navigate={navigate} />}</section>)}
    <p className="border-t border-[var(--md-line)] pt-4 text-[11px] text-[var(--md-text)]">Generated by Multideck · Each section states its data period and source record count.</p>
  </div>
}

type Draft = { id?: string; version?: number; owner_id?: string; name: string; visibility: "private" | "workspace"; definition: ReportDefinition }
function ReportEditor({ workspace, initial, navigate, onSaved, onRun }: { workspace: ReportsWorkspace; initial: SavedReport | null; navigate: (path: string) => void; onSaved: (saved: SavedReport) => void; onRun: (run: ReportRun) => void }) {
  const draftKey = `multideck:report-draft:${supabaseFunctionsUrl}:${workspace.userId}:${initial?.id || "new"}`
  const base: Draft = initial || { name: "", visibility: "private", definition: { version: 1, kind: "table", query: newReportQuery(workspace.catalogue[0]) } }
  const [draft, setDraft] = useState<Draft>(() => {
    try {
      const cached = JSON.parse(sessionStorage.getItem(draftKey) || "null") as Draft | null
      const validQuery = (q: ReportQuery | undefined) => !!q && Array.isArray(q.columns) && Array.isArray(q.filters) && !!q.sort && !!q.period && workspace.catalogue.some(s => s.id === q.source)
      if (cached && typeof cached.name === "string" && cached.definition?.version === 1 && ["private", "workspace"].includes(cached.visibility) && cached.id === base.id &&
        (cached.definition.kind === "document" ? !!cached.definition.period && Array.isArray(cached.definition.blocks) && cached.definition.blocks.every(b => b.kind === "text" || validQuery(b.query)) : ["table", "chart"].includes(cached.definition.kind) && validQuery(cached.definition.query))) return cached
    } catch { /* A damaged or unavailable browser draft must not prevent opening the report. */ }
    return base
  })
  const [draftStored, setDraftStored] = useState(false)
  const [description, setDescription] = useState("")
  const [mobileEditorTab, setMobileEditorTab] = useState("settings")
  const [started, setStarted] = useState(Boolean(initial || draft.name))
  const [savedJson, setSavedJson] = useState(JSON.stringify(base))
  const [snapshot, setSnapshot] = useState<ReportSnapshot | null>(null)
  const [previewDefinition, setPreviewDefinition] = useState<ReportDefinition>(draft.definition)
  const [previewError, setPreviewError] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState("")
  const [refresh, setRefresh] = useState(0)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [selectedBlock, setSelectedBlock] = useState(draft.definition.blocks?.[0]?.id || "")
  const [addBlock, setAddBlock] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const request = useRef(0)
  const definitionJson = JSON.stringify(draft.definition)
  const dirty = JSON.stringify(draft) !== savedJson
  const readOnly = initial && initial.owner_id !== workspace.userId
  const modify = (patch: Partial<Draft>) => setDraft(d => ({ ...d, ...patch }))
  const setDefinition = (patch: Partial<ReportDefinition>) => modify({ definition: { ...draft.definition, ...patch } })
  useEffect(() => {
    try {
      if (dirty && started) sessionStorage.setItem(draftKey, JSON.stringify(draft))
      else if (!dirty) sessionStorage.removeItem(draftKey)
      setDraftStored(dirty && started)
    } catch { setDraftStored(false) }
  }, [draft, dirty, draftKey, started])
  useEffect(() => {
    const unload = (e: BeforeUnloadEvent) => { if (dirty && started) e.preventDefault() }
    window.addEventListener("beforeunload", unload); return () => window.removeEventListener("beforeunload", unload)
  }, [dirty, started])
  useEffect(() => {
    if (!started) return
    const sequence = ++request.current
    setPreviewBusy(true)
    const timer = setTimeout(() => {
      reportingRequest<ReportSnapshot>("preview", { definition: JSON.parse(definitionJson) }).then(value => { if (sequence === request.current) { setSnapshot(value); setPreviewDefinition(JSON.parse(definitionJson)); setPreviewError("") } }).catch(e => { if (sequence === request.current) setPreviewError(e.message) }).finally(() => { if (sequence === request.current) setPreviewBusy(false) })
    }, 450)
    return () => { clearTimeout(timer); request.current++ }
  }, [definitionJson, refresh, started])
  const save = async (copy = false): Promise<SavedReport | null> => {
    setBusy("save"); setError("")
    try {
      const value = await reportingRequest<SavedReport>("save", { ...draft, ...(copy || readOnly ? { id: undefined, version: undefined, name: `${draft.name} (copy)`, visibility: "private" } : {}) })
      try { sessionStorage.removeItem(draftKey) } catch { /* Saving to Multideck succeeded even if browser storage is unavailable. */ }
      setSavedJson(JSON.stringify(value)); setDraft(value); onSaved(value)
      return value
    } catch (e) { setError((e as Error).message); return null } finally { setBusy("") }
  }
  const run = async () => {
    const saved = dirty || !draft.id ? await save(Boolean(readOnly)) : draft
    if (!saved?.id) return
    setBusy("run"); setError("")
    try { const result = await reportingRequest<ReportRun>("run", { id: saved.id, runId: crypto.randomUUID() }); if (result.status === "failed") setError(result.error || "The report could not run."); onRun(result) } catch (e) { setError((e as Error).message) } finally { setBusy("") }
  }
  const start = (kind: ReportDefinition["kind"], sourceId?: string, sales = false) => {
    const source = workspace.catalogue.find(s => s.id === sourceId) || workspace.catalogue[0]
    const query = newReportQuery(source)
    if (kind === "chart") Object.assign(query, { mode: "summary", period: { preset: "last2months" }, measure: sales ? "net" : "count", currency: sales ? "GBP" : "", compare: "previous" })
    const block: ReportBlock = { id: crypto.randomUUID(), kind: "text", title: "Overview", text: "" }
    setDraft({ name: sales ? "Sales growth" : kind === "document" ? "Monthly business review" : source.id === "jobs" ? "Jobs in the last 12 months" : `${source.label} report`, visibility: "private", definition: kind === "document" ? { version: 1, kind, period: { preset: "lastmonth" }, customer: "", blocks: [block] } : { version: 1, kind, query } })
    setSelectedBlock(block.id); setStarted(true)
  }
  const add = (kind: ReportBlock["kind"], saved?: SavedReport) => {
    const block: ReportBlock = { id: crypto.randomUUID(), kind, title: saved?.name || (kind === "text" ? "Commentary" : "New analysis"), ...(kind === "text" ? { text: "" } : { query: structuredClone(saved?.definition.query || newReportQuery(workspace.catalogue[0])), useDocumentPeriod: true, useDocumentCustomer: true, copiedFrom: saved?.id }) }
    if (block.kind === "chart" && block.query) block.query.mode = "summary"
    setDefinition({ blocks: [...(draft.definition.blocks || []), block] }); setSelectedBlock(block.id); setAddBlock(false)
  }
  const block = draft.definition.blocks?.find(b => b.id === selectedBlock)
  const changeBlock = (patch: Partial<ReportBlock>) => setDefinition({ blocks: draft.definition.blocks?.map(b => b.id === selectedBlock ? { ...b, ...patch } : b) })
  const rearrange = (id: string, delta: number) => { const next = [...(draft.definition.blocks || [])]; const i = next.findIndex(b => b.id === id); if (next[i + delta]) { [next[i], next[i + delta]] = [next[i + delta], next[i]]; setDefinition({ blocks: next }) } }
  const query = draft.definition.query
  if (!started) return <div className="mx-auto grid w-full max-w-4xl gap-8 py-4"><div><Button variant="ghost" className="-ml-3" onClick={() => navigate("/reports")}><ArrowLeft className="size-4" />Reports</Button><h1 className="mt-4 text-[24px] font-medium tracking-tight">What would you like to see?</h1><p className={cn(hint, "mt-2")}>Start with a useful report, then choose your data, columns and layout.</p></div>
    <div className="grid gap-3 md:grid-cols-3">{[{ kind: "table" as const, title: "A table of records", text: "Choose the fields you need. Filter and sort jobs, quotes and more.", icon: FileSpreadsheet }, { kind: "chart" as const, title: "A trend or comparison", text: "Measure totals, changes and patterns across your data.", icon: BarChart3 }, { kind: "document" as const, title: "A document to share", text: "Combine tables, graphs and commentary in a reusable PDF layout.", icon: FileText }].map(item => <button key={item.kind} className={cn(box, "grid gap-4 p-5 text-left outline-none transition-colors hover:bg-[var(--md-surface-soft)] focus-visible:ring-2 focus-visible:ring-[var(--md-accent)]")} onClick={() => start(item.kind)}><item.icon className="size-5 text-[var(--md-accent)]" /><span className="text-[15px] font-medium">{item.title}</span><span className={hint}>{item.text}</span></button>)}</div>
    <div className="grid gap-3"><Field label="Or describe the report you need" help="Dexter will prepare a report for your review. You can edit its data and layout in this builder."><textarea aria-label="Describe your report" className={textArea} placeholder="Show jobs from the last 12 months with customer, route and status…" value={description} onChange={e => setDescription(e.target.value)} maxLength={2000} /></Field><Button variant="outline" className="justify-self-start" disabled={!description.trim()} onClick={() => { rememberDexterTaskHandoff(`Help me create a saved Multideck report: ${description.trim()}\nRead report_sources first, clarify any ambiguous metric, period or currency, and prepare save_report for my approval. Keep it private. Open its Reports editor after saving.`); navigate("/agent-dexter") }}>Continue with Dexter</Button></div>
    <div><h2 className="text-[14px] font-medium">Ready to adapt</h2><div className="mt-3 divide-y divide-[var(--md-line)]">{workspace.catalogue.some(s => s.id === "jobs") && <button className="flex w-full items-center justify-between py-4 text-left text-[13px]" onClick={() => start("table", "jobs")}><span>Jobs in the last 12 months</span><span className={hint}>Choose your columns →</span></button>}{workspace.catalogue.some(s => s.id === "sales") && <button className="flex w-full items-center justify-between py-4 text-left text-[13px]" onClick={() => start("chart", "sales", true)}><span>Sales growth over the last 2 months</span><span className={hint}>Review currency and comparison →</span></button>}</div></div>
  </div>
  return <div className="grid gap-4">
    <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0 flex-1"><Button variant="ghost" className="-ml-3" onClick={() => dirty ? setConfirmLeave(true) : navigate("/reports")}><ArrowLeft className="size-4" />Reports</Button><Input aria-label="Report name" placeholder="Give your report a name" value={draft.name} maxLength={160} className="mt-2 h-11 max-w-xl border-0 bg-transparent px-0 text-[24px] font-medium shadow-none" onChange={e => modify({ name: e.target.value })} /><p role="status" className={hint}>{readOnly ? "Shared report. Save a copy to make it your own." : dirty ? draftStored ? "Unsaved changes · A draft is kept in this browser tab" : "Unsaved changes · Save before leaving this page" : "Saved"}</p></div>
      <div className="flex flex-wrap items-center gap-2 pt-2"><Button variant="outline" disabled={!!busy || !draft.name.trim()} onClick={() => save(true)}><Copy className="size-4" />Save a copy</Button><Button variant="outline" disabled={!!busy || !draft.name.trim()} onClick={() => save(Boolean(readOnly))}><Save className="size-4" />{busy === "save" ? "Saving…" : "Save report"}</Button><Button disabled={!!busy || !draft.name.trim() || !!previewError || previewBusy} onClick={run}>{busy === "run" ? "Generating…" : "Generate snapshot"}</Button></div>
    </div>
    {error && <ErrorMessage message={error} />}
    {initial && draft.version !== initial.version && <ErrorMessage message="Your recovered draft is based on an older report version. Save a copy to keep your changes alongside the latest saved report." />}
    <Tabs className="xl:hidden" value={mobileEditorTab} onValueChange={setMobileEditorTab}><TabsList variant="line"><TabsTrigger value="settings">Report settings</TabsTrigger><TabsTrigger value="preview">Preview</TabsTrigger></TabsList></Tabs>
    <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
      <aside aria-label="Report settings" className={cn(box, "grid gap-5 p-4 xl:max-h-[calc(100vh-245px)] xl:overflow-y-auto", mobileEditorTab !== "settings" && "hidden xl:grid")}>
        <Choice label="Who can view this report?" value={draft.visibility} onChange={visibility => modify({ visibility: visibility as Draft["visibility"] })} options={[{ value: "private", label: "Only me" }, { value: "workspace", label: "Workspace · viewers need data access" }]} />
        {draft.definition.kind !== "document" && query ? <><Choice label="Display" value={draft.definition.kind} onChange={kind => setDefinition({ kind: kind as "table" | "chart", query: { ...query, mode: kind === "chart" ? "summary" : query.mode } })} options={[{ value: "table", label: "Table" }, { value: "chart", label: "Chart" }]} />
          {draft.definition.kind === "chart" && <Choice label="Chart style" value={query.chart} onChange={chart => setDefinition({ query: { ...query, chart: chart as ReportQuery["chart"] } })} options={[{ value: "bar", label: "Bars" }, { value: "line", label: "Line" }, { value: "pie", label: "Donut" }]} />}
          <QueryEditor query={query} sources={workspace.catalogue} onChange={query => setDefinition({ query, kind: draft.definition.kind === "chart" && query.mode === "rows" ? "table" : draft.definition.kind })} />
        </> : <><PeriodEditor value={draft.definition.period!} onChange={period => setDefinition({ period })} /><Field label="Document customer (optional)" help="Exact customer name. Applies to each analysis unless you override it."><Input aria-label="Document customer" value={draft.definition.customer || ""} onChange={e => setDefinition({ customer: e.target.value })} /></Field>
          <div className="grid gap-2 border-t border-[var(--md-line)] pt-4"><div className="flex items-center justify-between"><span className="text-[13px] font-medium">Sections</span><Button variant="ghost" size="sm" disabled={(draft.definition.blocks?.length || 0) >= 24} onClick={() => setAddBlock(true)}><Plus className="size-3.5" />Add</Button></div>
            {draft.definition.blocks?.map((b, i, blocks) => <div key={b.id} className={cn("flex items-center rounded-lg", b.id === selectedBlock && "bg-[var(--md-accent-a06)]")}><button className="min-w-0 flex-1 truncate px-2 py-2 text-left text-[12px] focus-visible:ring-2 focus-visible:ring-[var(--md-accent)]" onClick={() => setSelectedBlock(b.id)} data-i18n-skip>{b.title || "Untitled section"}</button><Button variant="ghost" size="icon" className="size-7" disabled={i === 0} aria-label={`Move section ${i + 1} up`} onClick={() => rearrange(b.id, -1)}><ArrowUp className="size-3" /></Button><Button variant="ghost" size="icon" className="size-7" disabled={i === blocks.length - 1} aria-label={`Move section ${i + 1} down`} onClick={() => rearrange(b.id, 1)}><ArrowDown className="size-3" /></Button></div>)}
          </div>
          {block && <div className="grid gap-4 border-t border-[var(--md-line)] pt-4"><Field label="Section title"><Input aria-label="Section title" value={block.title} onChange={e => changeBlock({ title: e.target.value })} /></Field>{block.kind === "text" ? <Field label="Commentary"><textarea aria-label="Commentary" className={textArea} value={block.text || ""} maxLength={12000} onChange={e => changeBlock({ text: e.target.value })} /></Field> : block.query && <>
            <label className="flex items-center gap-2 text-[12px]"><Checkbox checked={block.useDocumentPeriod !== false} onCheckedChange={checked => changeBlock({ useDocumentPeriod: !!checked })} />Use document period</label><label className="flex items-center gap-2 text-[12px]"><Checkbox checked={block.useDocumentCustomer !== false} onCheckedChange={checked => changeBlock({ useDocumentCustomer: !!checked })} />Use document customer</label>
            <Choice label="Section display" value={block.kind} onChange={kind => changeBlock({ kind: kind as "table" | "chart", query: { ...block.query!, mode: kind === "chart" ? "summary" : block.query!.mode } })} options={[{ value: "table", label: "Table" }, { value: "chart", label: "Chart" }]} />
            {block.kind === "chart" && <Choice label="Section chart style" value={block.query.chart} onChange={chart => changeBlock({ query: { ...block.query!, chart: chart as ReportQuery["chart"] } })} options={[{ value: "bar", label: "Bars" }, { value: "line", label: "Line" }, { value: "pie", label: "Donut" }]} />}
            <QueryEditor query={block.query} sources={workspace.catalogue} periodLocked={block.useDocumentPeriod !== false} onChange={query => changeBlock({ query, kind: query.mode === "rows" ? "table" : block.kind })} />
          </>}{block.copiedFrom && <p className={hint}>This analysis was copied from a saved report. Changes here apply to this document.</p>}<Button variant="ghost" className="justify-start text-[var(--md-red)]" disabled={draft.definition.blocks?.length === 1} onClick={() => { const next = draft.definition.blocks?.filter(b => b.id !== selectedBlock); setDefinition({ blocks: next }); setSelectedBlock(next?.[0]?.id || "") }}>Remove section</Button></div>}
        </>}
      </aside>
      <div className={cn("grid min-w-0 gap-3", mobileEditorTab !== "preview" && "hidden xl:grid")}><div className="flex min-h-9 items-center justify-between"><h2 className="text-[13px] font-medium">Live preview</h2><div className="flex items-center gap-2"><span role="status" className={hint}>{previewBusy ? "Updating preview…" : snapshot && !previewError ? "Current settings" : "Check your settings"}</span><Button variant="ghost" size="sm" onClick={() => setRefresh(n => n + 1)}>Refresh data</Button></div></div>
        {previewError && <ErrorMessage message={previewError} retry={() => setRefresh(n => n + 1)} />}
        {snapshot ? <div aria-busy={previewBusy} className={cn(previewDefinition.kind !== "document" && `${box} p-4 sm:p-5`, (previewBusy || previewError) && "opacity-50")}><SnapshotView snapshot={snapshot} definition={previewDefinition} name={draft.name} navigate={navigate} /></div> : !previewError && <div className={cn(box, "grid min-h-80 place-content-center gap-3 text-center")}><LoaderCircle className="mx-auto size-5 animate-spin text-[var(--md-accent)]" /><p className={hint}>Loading authorised report data…</p></div>}
      </div>
    </div>
    <Dialog open={addBlock} onOpenChange={setAddBlock}><DialogContent><DialogHeader><DialogTitle>Add a section</DialogTitle><DialogDescription>Build an analysis or reuse one from your report library.</DialogDescription></DialogHeader><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => add("table")}>New table</Button><Button variant="outline" onClick={() => add("chart")}>New chart</Button><Button variant="outline" onClick={() => add("text")}>Commentary</Button></div><div className="grid max-h-72 gap-1 overflow-y-auto">{workspace.reports.filter(r => r.definition.kind !== "document").map(r => <Button key={r.id} variant="ghost" className="justify-start" onClick={() => add(r.definition.kind as "table" | "chart", r)}><span data-i18n-skip>{r.name}</span></Button>)}</div></DialogContent></Dialog>
    <Dialog open={confirmLeave} onOpenChange={setConfirmLeave}><DialogContent><DialogHeader><DialogTitle>Keep your report changes?</DialogTitle><DialogDescription>{draftStored ? "Your draft will stay in this browser tab. You can return to it from this report." : "This browser could not keep your draft. Return to editing and save the report to keep these changes."}</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setConfirmLeave(false)}>Keep editing</Button><Button onClick={() => navigate("/reports")}>{draftStored ? "Return to Reports" : "Leave without saving"}</Button></DialogFooter></DialogContent></Dialog>
  </div>
}

export function ReportingWorkspace({ route, navigate }: { route: string; navigate: (path: string) => void }) {
  const [workspace, setWorkspace] = useState<ReportsWorkspace | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState("")
  const [search, setSearch] = useState("")
  const [kindFilter, setKindFilter] = useState("all")
  const [scope, setScope] = useState("all")
  const [showArchived, setShowArchived] = useState(false)
  const [schedule, setSchedule] = useState<Partial<ReportSchedule> | null>(null)
  const [snapshotRun, setSnapshotRun] = useState<ReportRun | null>(null)
  const [archive, setArchive] = useState<SavedReport | null>(null)
  const loadRequest = useRef(0)
  const { language } = useLanguage()
  const date = (value: string) => new Date(value).toLocaleString(language || "en-GB", { dateStyle: "medium", timeStyle: "short" })
  const load = async () => {
    const sequence = ++loadRequest.current
    try { const value = await reportingRequest<ReportsWorkspace>("list"); if (sequence === loadRequest.current) { setWorkspace(value); setError("") } } catch (e) { if (sequence === loadRequest.current) setError((e as Error).message) }
  }
  useEffect(() => { load(); return () => { loadRequest.current++ } }, [route])
  useEffect(() => subscribeTopBarAction(topBarActionEvents.startReportDraft, () => navigate("/reports/new")), [navigate])
  useEffect(() => subscribeTopBarAction(topBarActionEvents.startReportSchedule, () => setSchedule({ report_id: workspace?.reports[0]?.id || "", frequency: "weekly", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, local_time: "09:00", weekday: 1, monthday: 1, paused: false })), [workspace])
  const tab = route === "/reports/scheduled" ? "scheduled" : route === "/reports/history" ? "history" : "library"
  const editing = route === "/reports/new" || route.startsWith("/reports/edit/") || route.startsWith("/reports/rpt-") || route.includes("/reports/templates/")
  const reportId = route.startsWith("/reports/edit/") || route.startsWith("/reports/rpt-") ? route.split("/").at(-1) : null
  const active = workspace?.reports.find(r => r.id === reportId) || null
  const saved = (report: SavedReport) => { setWorkspace(w => w ? { ...w, reports: [report, ...w.reports.filter(r => r.id !== report.id)] } : w); if (reportId !== report.id) navigate(`/reports/edit/${report.id}`) }
  const openRun = async (run: ReportRun) => {
    setBusy(run.id); setError("")
    try { setSnapshotRun(await reportingRequest<ReportRun>("get_run", { id: run.id })) } catch (e) { setError((e as Error).message) } finally { setBusy("") }
  }
  const download = async (format: "pdf" | "xlsx" | "csv") => {
    if (!snapshotRun) return
    setBusy(format); setError("")
    try { await downloadReport(snapshotRun, format) } catch (e) { setError((e as Error).message) } finally { setBusy("") }
  }
  const openSchedule = async (item: ReportSchedule) => {
    setBusy(item.id); setError("")
    try {
      const latest = await reportingRequest<ReportsWorkspace>("list")
      setWorkspace(latest)
      const current = latest.schedules.find(s => s.id === item.id)
      if (!current) throw new Error("This schedule is no longer available. The list has been refreshed.")
      setSchedule(current)
    } catch (e) { setError((e as Error).message) } finally { setBusy("") }
  }
  const saveSchedule = async () => {
    if (!schedule?.report_id) return
    setBusy("schedule"); setError("")
    try { await reportingRequest("schedule", reportSchedulePayload(schedule as ReportSchedule)); setSchedule(null); await load() } catch (e) { setError((e as Error).message) } finally { setBusy("") }
  }
  const reports = useMemo(() => (showArchived ? workspace?.archivedReports : workspace?.reports)?.filter(r => r.name.toLowerCase().includes(search.toLowerCase()) && (kindFilter === "all" || r.definition.kind === kindFilter) && (scope === "all" || (scope === "mine" ? r.owner_id === workspace?.userId : r.owner_id !== workspace?.userId))) || [], [workspace, search, kindFilter, scope, showArchived])
  const restore = async (report: SavedReport) => {
    setBusy(report.id); setError("")
    try { await reportingRequest("restore", { id: report.id }); await load() } catch (e) { setError((e as Error).message) } finally { setBusy("") }
  }
  const libraryColumns: DataTableColumn<SavedReport>[] = [
    { id: "name", label: "Report", kind: "identity", cell: r => <div className="flex items-center gap-3">{r.definition.kind === "document" ? <FileText className="size-4 text-[var(--md-accent)]" /> : r.definition.kind === "chart" ? <BarChart3 className="size-4 text-[var(--md-accent)]" /> : <FileSpreadsheet className="size-4 text-[var(--md-accent)]" />}<span className="font-medium" data-i18n-skip>{r.name}</span></div>, sortValue: r => r.name, width: 350 },
    { id: "kind", label: "Format", cell: r => kindName[r.definition.kind], sortValue: r => r.definition.kind },
    { id: "data", label: "Data", cell: r => r.definition.kind === "document" ? `${r.definition.blocks?.length || 0} sections` : workspace?.catalogue.find(s => s.id === r.definition.query?.source)?.label || "Unavailable" },
    { id: "owner", label: "Access", cell: r => r.owner_id === workspace?.userId ? r.visibility === "private" ? "Only me" : "Owned by me · workspace" : "Shared with me" },
    { id: "updated", label: "Last edited", cell: r => date(r.updated_at), sortValue: r => r.updated_at },
    ...(showArchived ? [{ id: "restore", label: "Restore", cell: (r: SavedReport) => <Button variant="outline" size="sm" disabled={!!busy} onClick={() => restore(r)}>{busy === r.id ? "Restoring…" : "Restore report"}</Button> }] : []),
  ]
  const tabs = <Tabs value={tab} onValueChange={t => navigate(t === "library" ? "/reports" : `/reports/${t === "scheduled" ? "scheduled" : "history"}`)}><TabsList variant="line"><TabsTrigger value="library">Library</TabsTrigger><TabsTrigger value="scheduled">Scheduled</TabsTrigger><TabsTrigger value="history">Run history</TabsTrigger></TabsList></Tabs>
  if (!workspace) return <div className="md-page md-page-stack"><h1 className="text-[24px] font-medium">Reports</h1>{error ? <ErrorMessage message={error} retry={load} /> : <div role="status" className="flex min-h-64 items-center justify-center gap-3"><LoaderCircle className="size-5 animate-spin" />Loading your reports…</div>}</div>
  return <div className="md-page md-page-stack">
    {error && <ErrorMessage message={error} retry={load} />}
    {editing ? workspace.catalogue.length === 0 ? <ErrorMessage message="Your account does not currently have access to a reporting data source. Ask your workspace administrator for the relevant data access." /> : reportId && !active ? <><Button variant="ghost" onClick={() => navigate("/reports")}>Return to Reports</Button><ErrorMessage message="This report is unavailable or you no longer have access. Your saved drafts have not been changed." /></> : <ReportEditor key={reportId || "new"} workspace={workspace} initial={active} navigate={navigate} onSaved={saved} onRun={run => { setSnapshotRun(run); load() }} /> : <>
      <div><h1 className="text-[24px] font-medium tracking-tight">Reports</h1><p className={cn(hint, "mt-1")}>{tab === "library" ? "Your tables, charts and documents, ready to reopen and adapt." : tab === "scheduled" ? "Create dated snapshots automatically. Results appear in your Run history." : "Dated snapshots keep the data and report settings from the moment they ran. Showing the latest 100 runs."}</p></div>
      {tab === "library" ? <DataTable columns={libraryColumns} rows={reports} getRowKey={r => r.id} ariaLabel="Report library" storageKey="report-library" onRowClick={showArchived ? undefined : r => navigate(`/reports/edit/${r.id}`)} enableSelectionExport={false} toolbarTabs={tabs}
        toolbarSearch={<Input aria-label="Search reports" placeholder="Search reports…" value={search} onChange={e => setSearch(e.target.value)} className="h-9 w-52" />}
        toolbarOptions={<Button variant="ghost" size="sm" onClick={() => { setShowArchived(!showArchived); setScope("all") }}>{showArchived ? "Back to library" : "Archived reports"}</Button>}
        toolbarFilters={<div className="flex gap-2"><Choice label="Format" value={kindFilter} onChange={setKindFilter} options={[{ value: "all", label: "All formats" }, ...Object.entries(kindName).map(([value, label]) => ({ value, label }))]} /><Choice label="Owner" value={scope} onChange={setScope} options={[{ value: "all", label: "All reports" }, { value: "mine", label: "My reports" }, { value: "shared", label: "Shared with me" }]} /></div>}
        rowContextActions={r => !showArchived && r.owner_id === workspace.userId ? [{ id: "archive", label: "Archive report", icon: X, tone: "destructive", onSelect: () => setArchive(r) }] : []}
        emptyState={<div className="grid min-h-64 place-content-center gap-3 text-center"><h2 className="text-[16px] font-medium">{showArchived ? "No archived reports match these filters" : workspace.reports.length ? "No reports match these filters" : "Your first report starts here"}</h2><p className={hint}>Choose data you want to see, then make the report your own.</p><Button className="mx-auto" onClick={() => navigate("/reports/new")}>Create report</Button></div>} /> : tab === "scheduled" ?
        <DataTable columns={[
          { id: "name", label: "Report", kind: "identity", cell: (s: ReportSchedule) => <span data-i18n-skip>{s.name}</span> },
          { id: "frequency", label: "Frequency", cell: s => `${s.frequency[0].toUpperCase()}${s.frequency.slice(1)}` },
          { id: "time", label: "Local time", cell: s => `${s.local_time.slice(0, 5)} · ${s.timezone}` },
          { id: "next", label: "Next run", cell: s => s.paused ? "Paused" : date(s.next_run_at) },
          { id: "destination", label: "Destination", cell: () => "My run history" },
          { id: "state", label: "Status", cell: s => s.paused ? "Paused" : "Active" },
        ]} rows={workspace.schedules} getRowKey={s => s.id} ariaLabel="Scheduled reports" toolbarTabs={tabs} enableSelectionExport={false} onRowClick={openSchedule} emptyState={<div className="grid min-h-64 place-content-center gap-2 text-center"><h2 className="text-[16px] font-medium">No scheduled reports</h2><p className={hint}>Save a report, then choose when to capture it automatically.</p></div>} /> :
        <DataTable columns={[
          { id: "name", label: "Report", kind: "identity", cell: (r: ReportRun) => <span data-i18n-skip>{r.name}</span> },
          { id: "created", label: "Generated", cell: r => date(r.created_at), sortValue: r => r.created_at },
          { id: "version", label: "Report version", cell: r => `Version ${r.report_version}` },
          { id: "trigger", label: "Run type", cell: r => r.schedule_id ? "Scheduled" : "On demand" },
          { id: "status", label: "Status", cell: r => busy === r.id ? "Opening…" : r.status === "ready" ? "Ready" : "Failed" },
        ]} rows={workspace.runs} getRowKey={r => r.id} ariaLabel="Report run history" toolbarTabs={tabs} enableSelectionExport={false} onRowClick={openRun} emptyState={<div className="grid min-h-64 place-content-center gap-2 text-center"><h2 className="text-[16px] font-medium">No reports have run yet</h2><p className={hint}>Generate a snapshot from any saved report to keep and download it.</p></div>} />}
    </>}
    <Dialog open={!!schedule} onOpenChange={open => { if (!open) setSchedule(null) }}><DialogContent><DialogHeader><DialogTitle>{schedule?.id ? "Edit schedule" : "Schedule a report"}</DialogTitle><DialogDescription>A dated snapshot will appear in your run history. Data access is checked each time. Times follow the selected timezone, including daylight saving.</DialogDescription></DialogHeader>{schedule && <div className="grid gap-4">
      <Choice label="Saved report" value={schedule.report_id || ""} onChange={report_id => setSchedule({ ...schedule, report_id })} options={[{ value: "", label: "Choose a report" }, ...workspace.reports.map(r => ({ value: r.id, label: r.name }))]} />
      <Choice label="Frequency" value={schedule.frequency || "weekly"} onChange={frequency => setSchedule({ ...schedule, frequency: frequency as ReportSchedule["frequency"] })} options={[{ value: "daily", label: "Daily" }, { value: "weekly", label: "Weekly" }, { value: "monthly", label: "Monthly" }]} />
      {schedule.frequency === "weekly" && <Choice label="Day of week" value={String(schedule.weekday ?? 1)} onChange={day => setSchedule({ ...schedule, weekday: Number(day) })} options={["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((label, value) => ({ label, value: String(value) }))} />}
      {schedule.frequency === "monthly" && <Choice label="Day of month" value={String(schedule.monthday || 1)} onChange={day => setSchedule({ ...schedule, monthday: Number(day) })} options={Array.from({ length: 28 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))} />}
      <div className="grid grid-cols-2 gap-3"><Field label="Time"><Input type="time" aria-label="Schedule time" value={schedule.local_time?.slice(0, 5) || "09:00"} onChange={e => setSchedule({ ...schedule, local_time: e.target.value })} /></Field><Field label="Timezone"><Input aria-label="Schedule timezone" value={schedule.timezone || "Europe/London"} onChange={e => setSchedule({ ...schedule, timezone: e.target.value })} /></Field></div>
      {schedule.id && <label className="flex items-center gap-2 text-[13px]"><Checkbox checked={schedule.paused} onCheckedChange={checked => setSchedule({ ...schedule, paused: !!checked })} />Pause this schedule</label>}
      {error && <ErrorMessage message={error} />}
    </div>}<DialogFooter><Button variant="outline" onClick={() => setSchedule(null)}>Cancel</Button><Button disabled={!!busy || !schedule?.report_id} onClick={saveSchedule}>{busy === "schedule" ? "Saving…" : "Save schedule"}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={!!snapshotRun} onOpenChange={open => { if (!open) { setSnapshotRun(null); setError("") } }}><DialogContent className="flex max-h-[92dvh] flex-col sm:max-w-[1100px]"><DialogHeader><DialogTitle><span data-i18n-skip>{snapshotRun?.name}</span></DialogTitle><DialogDescription>{snapshotRun && `${date(snapshotRun.created_at)} · Version ${snapshotRun.report_version} · Dated snapshot`}</DialogDescription></DialogHeader>
      {error && <ErrorMessage message={error} />}
      <div className="min-h-0 overflow-y-auto pr-1">{snapshotRun?.status === "failed" ? <ErrorMessage message={snapshotRun.error || "The report could not be generated."} /> : snapshotRun?.snapshot && <SnapshotView snapshot={snapshotRun.snapshot} definition={snapshotRun.definition} name={snapshotRun.name} navigate={navigate} />}</div>
      <DialogFooter><Button variant="outline" onClick={() => { setSnapshotRun(null); navigate("/reports/history") }}>Run history</Button>{snapshotRun?.status === "ready" && <><Button variant="outline" disabled={!!busy || snapshotRun.definition.kind === "document"} onClick={() => download("csv")}>{busy === "csv" ? "Preparing…" : "CSV"}</Button><Button variant="outline" disabled={!!busy} onClick={() => download("xlsx")}>{busy === "xlsx" ? "Preparing…" : "Excel"}</Button><Button disabled={!!busy} onClick={() => download("pdf")}>{busy === "pdf" ? "Preparing PDF…" : "Download PDF"}</Button></>}</DialogFooter>
    </DialogContent></Dialog>
    <Dialog open={!!archive} onOpenChange={open => { if (!open) setArchive(null) }}><DialogContent><DialogHeader><DialogTitle>Archive this report?</DialogTitle><DialogDescription>It will leave the library and its schedules will pause. Existing runs are retained. You can restore it from Archived reports; schedules stay paused until you resume them.</DialogDescription></DialogHeader>{error && <ErrorMessage message={error} />}<DialogFooter><Button variant="outline" onClick={() => setArchive(null)}>Cancel</Button><Button disabled={!!busy} onClick={async () => { if (!archive) return; setBusy("archive"); try { await reportingRequest("archive", { id: archive.id }); setArchive(null); await load() } catch (e) { setError((e as Error).message) } finally { setBusy("") } }}>Archive report</Button></DialogFooter></DialogContent></Dialog>
  </div>
}
