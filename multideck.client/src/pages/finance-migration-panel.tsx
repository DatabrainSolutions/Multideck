import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { SettingsPanel } from "@/components/multideck/settings-components"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { useLanguage } from "@/i18n/language-provider"
import { reconcileMigration, type MigrationReconciliation } from "@/lib/finance-ledger-api"
import { openingKinds, openItemsFromUpload, readMigrationUpload, trialBalanceFromUpload, type ImportResult, type ItemField, type ItemMapping, type MigrationUpload, type OpeningItemInput, type OpeningKind, type TrialBalanceInput, type TrialField, type TrialMapping } from "@/lib/accounting-migration-import"

const selectClass = "h-9 w-full min-w-0 rounded-[var(--md-radius-md)] bg-[var(--md-surface-soft)] px-2 text-[13px] text-[var(--md-ink)] focus-visible:outline-2 focus-visible:outline-[var(--md-accent)]"
const trialLabels: Record<TrialField, string> = { accountCode: "Account code", debit: "Closing debit", credit: "Closing credit", balance: "Signed closing balance" }
const itemLabels: Record<ItemField, string> = { sourceId: "Source transaction ID", partyCode: "Customer / supplier code", reference: "Document reference", accountCode: "Control account code", kind: "Transaction type", documentDate: "Document date", dueDate: "Due date (optional)", currency: "Transaction currency", originalAmount: "Original gross amount", outstandingAmount: "Outstanding gross amount", outstandingBaseAmount: "Outstanding base-currency amount" }
const kindLabels: Record<OpeningKind, string> = { customer_invoice: "Customer invoice", customer_credit: "Customer credit", customer_receipt: "Unapplied customer receipt", supplier_invoice: "Supplier invoice", supplier_credit: "Supplier credit", supplier_payment: "Unapplied supplier payment" }
type Source<T> = { upload: MigrationUpload; result: ImportResult<T> }
const blankTrial = (): TrialMapping => ({ headerRow: 0, columns: {}, numberFormat: "decimal-point", balanceMode: "debit-credit" })
const blankItems = (): ItemMapping => ({ headerRow: 0, columns: {}, numberFormat: "decimal-point", dateFormat: "iso", amountConvention: "positive", fixedKind: "customer_invoice", kindValues: {} })

/** Read-only, page-local migration preflight. No opening balances are posted here. */
export function FinanceMigrationPanel({ entityId, baseCurrency, chartDirty }: { entityId: string; baseCurrency: string; chartDirty: boolean }) {
  const { t } = useLanguage()
  const [trial, setTrial] = useState<Source<TrialBalanceInput> | null>(null)
  const [items, setItems] = useState<Source<OpeningItemInput> | null>(null)
  const [noOpenItems, setNoOpenItems] = useState(false)
  const [cutoff, setCutoff] = useState("")
  const [report, setReport] = useState<MigrationReconciliation | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const request = useRef(0)
  const invalidate = useCallback(() => { request.current++; setReport(null); setError(""); setBusy(false) }, [])
  const updateTrial = useCallback((value: Source<TrialBalanceInput> | null) => { invalidate(); setTrial(value) }, [invalidate])
  const updateItems = useCallback((value: Source<OpeningItemInput> | null) => { invalidate(); setItems(value) }, [invalidate])
  useEffect(() => { invalidate(); return () => { request.current++ } }, [entityId, baseCurrency, chartDirty, invalidate])
  const ready = !chartDirty && /^[A-Z]{3}$/.test(baseCurrency) && Boolean(cutoff && trial?.result.rows.length && !trial.result.issues.length && (noOpenItems || items?.result.rows.length && !items.result.issues.length))
  const reconcile = async () => {
    if (!ready || !trial) return
    const version = ++request.current
    setBusy(true); setError(""); setReport(null)
    try {
      const result = await reconcileMigration(entityId, { cutoffDate: cutoff, baseCurrency, trialBalance: trial.result.rows, openItems: noOpenItems ? [] : items!.result.rows })
      if (version === request.current) setReport(result)
    } catch (cause) { if (version === request.current) setError(cause instanceof Error ? cause.message : "The migration check could not be completed.") }
    finally { if (version === request.current) setBusy(false) }
  }
  const issueLocation = (issue: MigrationReconciliation["issues"][number]) => {
    const source = issue.area === "trial_balance" ? trial : issue.area === "open_items" ? items : null
    return source && issue.row ? `${source.upload.name} · ${source.upload.sheetName} · ${t("row")} ${source.result.sourceRows[issue.row - 1] ?? issue.row}` : t(issue.area.replaceAll("_", " "))
  }
  return <SettingsPanel title={t("CargoWise opening balances")} description={t("Upload a closing trial balance and open transactions, review the source columns, then reconcile them to this legal entity's saved chart.")}>
    <details className="px-5 py-4"><summary className="cursor-pointer text-[13px] font-medium text-[var(--md-accent)] focus-visible:outline-2 focus-visible:outline-[var(--md-accent)]">{t("Prepare migration preview")}</summary>
      <div className="mt-4 space-y-5">
        <p className="text-xs text-[var(--md-text)]">{t("Read-only preflight. Files and mappings stay in this browser page until you leave. Nothing is saved or posted. The reconciliation check sends the converted balances and transactions to your tenant's finance service.")}</p>
        {chartDirty && <p role="alert" className="text-sm text-[var(--md-red)]">{t("Save or discard the chart changes before checking a migration.")}</p>}
        {!/^[A-Z]{3}$/.test(baseCurrency) && <p role="alert" className="text-sm text-[var(--md-red)]">{t("Set and save the legal entity's base currency before checking a migration.")}</p>}
        <div className="flex flex-wrap items-end gap-4"><label className="grid gap-1 text-xs">{t("Cutover date")}<Input type="date" value={cutoff} onChange={event => { invalidate(); setCutoff(event.target.value) }} /></label><p className="py-2 text-sm">{t("Trial-balance currency")}: <span data-i18n-skip>{baseCurrency}</span></p></div>
        <MigrationSource kind="trial" onTrial={updateTrial} onItems={updateItems} />
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={noOpenItems} onCheckedChange={checked => { invalidate(); setNoOpenItems(checked === true) }} />{t("There are no open customer or supplier transactions, credits or unapplied cash at cutover")}</label>
        {!noOpenItems && <MigrationSource kind="items" onTrial={updateTrial} onItems={updateItems} />}
        <Button disabled={!ready || busy} onClick={() => void reconcile()}>{t(busy ? "Checking…" : "Check trial balance and open items")}</Button>
        {error && <p role="alert" className="text-sm text-[var(--md-red)]">{t(error)}</p>}
        {report && <div className="space-y-3" aria-live="polite">
          <p className={`text-sm font-medium ${report.reconciled ? "text-[var(--md-green)]" : "text-[var(--md-red)]"}`}>{t(report.reconciled ? "Trial balance and AR/AP controls reconcile. No posting has been authorised." : "Reconciliation needs attention. No transactions have been imported.")}</p>
          {report.totals && <p className="text-sm">{t("Debit")} {report.totals.debit} · {t("Credit")} {report.totals.credit} · {t("Difference")} {report.totals.difference} {report.totals.baseCurrency}</p>}
          {!!report.controls.length && <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm"><thead><tr>{["Control account", "Ledger", "Trial balance", "Open items", "Difference"].map(label => <th key={label} scope="col" className="p-2 text-start font-medium">{t(label)}</th>)}</tr></thead><tbody>{report.controls.map(row => <tr key={row.accountId} className="border-t border-[var(--md-line)]"><td className="p-2" data-i18n-skip>{row.accountCode}</td><td className="p-2">{t(row.ledger === "receivables" ? "Receivables" : "Payables")}</td>{[row.trialBalance, row.openItems, row.difference].map((value, index) => <td key={index} className="p-2 tabular-nums" data-i18n-skip>{value}</td>)}</tr>)}</tbody></table></div>}
          {!!report.issues.length && <ul className="max-h-64 space-y-2 overflow-y-auto text-xs text-[var(--md-red)]">{report.issues.slice(0, 100).map((issue, index) => <li key={index}>{issueLocation(issue)}: {t(issue.message)}</li>)}{report.issues.length > 100 && <li>{t(`${report.issues.length} issues in total. Showing the first 100.`)}</li>}</ul>}
          <p className="text-xs text-[var(--md-text)]">{t("This checks closing balances, not debit/credit turnover. Control figures are debit-positive. Party matching, bank positions, job accrual/WIP detail, approval, opening-balance posting and linked-system reconciliation remain required before migration can complete.")}</p>
        </div>}
      </div>
    </details>
  </SettingsPanel>
}

function MigrationSource({ kind, onTrial, onItems }: { kind: "trial" | "items"; onTrial: (value: Source<TrialBalanceInput> | null) => void; onItems: (value: Source<OpeningItemInput> | null) => void }) {
  const { t } = useLanguage()
  const [upload, setUpload] = useState<MigrationUpload | null>(null)
  const [trial, setTrial] = useState(blankTrial)
  const [items, setItems] = useState(blankItems)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const file = useRef<File | null>(null), request = useRef(0)
  const mapping = kind === "trial" ? trial : items
  const fieldLabels: Record<string, string> = kind === "trial" ? trialLabels : itemLabels
  const notify = kind === "trial" ? onTrial : onItems
  useEffect(() => () => { request.current++; notify(null) }, [notify])
  const converted = useMemo(() => !upload?.sheetName ? null : kind === "trial" ? trialBalanceFromUpload(upload, trial) : openItemsFromUpload(upload, items), [upload, kind, trial, items])
  useEffect(() => {
    if (kind === "trial") onTrial(upload && converted ? { upload, result: converted as ImportResult<TrialBalanceInput> } : null)
    else onItems(upload && converted ? { upload, result: converted as ImportResult<OpeningItemInput> } : null)
  }, [converted, upload, kind, onTrial, onItems])
  const load = async (selected: File, sheetName?: string, delimiter: "," | ";" | "\t" = ",") => {
    const version = ++request.current
    notify(null); setUpload(null); setBusy(true); setError(""); setTrial(blankTrial()); setItems(blankItems())
    try {
      const result = await readMigrationUpload(selected, sheetName, delimiter)
      if (version !== request.current) return
      file.current = selected; setUpload(result)
      const headerRow = result.rows.find(row => row.values.some(value => value.trim()))?.number ?? 0
      setTrial(value => ({ ...value, headerRow })); setItems(value => ({ ...value, headerRow }))
    } catch (cause) { if (version === request.current) setError(cause instanceof Error ? cause.message : "The file could not be read.") }
    finally { if (version === request.current) setBusy(false) }
  }
  const patch = (value: Partial<TrialMapping & ItemMapping>) => { if (kind === "trial") setTrial(current => ({ ...current, ...value })); else setItems(current => ({ ...current, ...value })) }
  const columns: [string, string][] = kind === "trial" ? Object.entries(trialLabels).filter(([field]) => trial.balanceMode === "signed" ? ["accountCode", "balance"].includes(field) : field !== "balance") : Object.entries(itemLabels)
  const header = upload?.rows.find(row => row.number === mapping.headerRow)
  const kindValues = useMemo(() => {
    if (!upload || items.columns.kind === undefined) return []
    return [...new Set(upload.rows.filter(row => row.number > items.headerRow).map(row => (row.values[items.columns.kind!] ?? "").trim()).filter(Boolean))]
  }, [upload, items.headerRow, items.columns.kind])
  return <section className="space-y-3 border-t border-[var(--md-line)] pt-4">
    <h3 className="text-sm font-medium">{t(kind === "trial" ? "Closing trial balance" : "Open transactions")}</h3>
    <label className="grid gap-1 text-xs">{t("Source file (.csv or .xlsx)")}<Input type="file" accept=".csv,.xlsx" disabled={busy} onChange={event => { const selected = event.target.files?.[0]; event.target.value = ""; if (selected) void load(selected) }} /></label>
    {busy && <p role="status" className="text-xs">{t("Reading source file…")}</p>}{error && <p role="alert" className="text-sm text-[var(--md-red)]">{t(error)}</p>}
    {upload && <>
      <p className="break-words text-xs text-[var(--md-text)]" data-i18n-skip>{upload.name} · SHA-256 {upload.sha256.slice(0, 16)}…</p>
      {upload.delimiter !== undefined && <label className="grid max-w-sm gap-1 text-xs">{t("CSV separator")}<select className={selectClass} value={upload.delimiter} onChange={event => { if (file.current) void load(file.current, undefined, event.target.value as "," | ";" | "\t") }}><option value=",">{t("Comma")}</option><option value=";">{t("Semicolon")}</option><option value={"\t"}>{t("Tab")}</option></select></label>}
      {upload.name.toLowerCase().endsWith(".xlsx") && <label className="grid max-w-sm gap-1 text-xs">{t("Worksheet")}<select className={selectClass} value={upload.sheetName} onChange={event => { if (event.target.value && file.current) void load(file.current, event.target.value) }}><option value="">{t("Choose worksheet")}</option>{upload.sheetNames.map(name => <option key={name} value={name}>{name}</option>)}</select></label>}
      {upload.sheetName && <>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="grid gap-1 text-xs">{t("Header row")}<Input type="number" min={1} value={mapping.headerRow || ""} onChange={event => patch({ headerRow: Number(event.target.value), columns: {} })} /></label>
          <label className="grid gap-1 text-xs">{t("Text / CSV number format")}<select className={selectClass} value={mapping.numberFormat} onChange={event => patch({ numberFormat: event.target.value as TrialMapping["numberFormat"] })}><option value="decimal-point">1,234.56</option><option value="decimal-comma">1.234,56</option></select></label>
          {kind === "trial" ? <label className="grid gap-1 text-xs">{t("Closing balance format")}<select className={selectClass} value={trial.balanceMode} onChange={event => patch({ balanceMode: event.target.value as TrialMapping["balanceMode"], columns: {} })}><option value="debit-credit">{t("Separate debit and credit")}</option><option value="signed">{t("Signed balance: debit positive")}</option></select></label> : <>
            <label className="grid gap-1 text-xs">{t("Text / CSV date format")}<select className={selectClass} value={items.dateFormat} onChange={event => patch({ dateFormat: event.target.value as ItemMapping["dateFormat"] })}><option value="iso">YYYY-MM-DD</option><option value="day-first">DD/MM/YYYY</option><option value="month-first">MM/DD/YYYY</option></select></label>
            <label className="grid gap-1 text-xs">{t("Open-item amount convention")}<select className={selectClass} value={items.amountConvention} onChange={event => patch({ amountConvention: event.target.value as ItemMapping["amountConvention"] })}><option value="positive">{t("All amounts positive; type determines sign")}</option><option value="debit-positive">{t("Signed amounts: debit positive")}</option></select></label>
          </>}
        </div>
        <p className="text-xs text-[var(--md-text)]">{t("Choose the source column for each field. Account codes and other identifiers must be text in Excel. Formulas are not imported. Every non-empty row after the header is checked, including totals or notes: remove those from the source export first.")}</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{columns.map(([field, label]) => <label key={field} className="grid min-w-0 gap-1 text-xs">{t(label)}<select className={selectClass} value={(mapping.columns as Record<string, number | undefined>)[field] ?? ""} onChange={event => patch({ columns: { ...mapping.columns, [field]: event.target.value === "" ? undefined : Number(event.target.value) } })}><option value="">{t(field === "kind" ? "Use one type for this file" : field === "dueDate" ? "Not supplied" : "Choose column")}</option>{Array.from({ length: header?.values.length ?? 0 }, (_, index) => <option key={index} value={index}>{index + 1}: {header?.values[index] || t("Unnamed column")}</option>)}</select></label>)}</div>
        {kind === "items" && (items.columns.kind === undefined ? <label className="grid max-w-sm gap-1 text-xs">{t("Transaction type for every row")}<select className={selectClass} value={items.fixedKind} onChange={event => patch({ fixedKind: event.target.value as OpeningKind })}>{openingKinds.map(value => <option key={value} value={value}>{t(kindLabels[value])}</option>)}</select></label> : <div className="grid gap-3 sm:grid-cols-2">{kindValues.slice(0, 50).map(value => <label key={value} className="grid gap-1 text-xs">{t("Source type")}: {value}<select className={selectClass} value={items.kindValues[value] ?? ""} onChange={event => patch({ kindValues: { ...items.kindValues, [value]: event.target.value as OpeningKind } })}><option value="">{t("Choose transaction type")}</option>{openingKinds.map(kind => <option key={kind} value={kind}>{t(kindLabels[kind])}</option>)}</select></label>)}{kindValues.length > 50 && <p role="alert">{t("Too many source transaction types. Review the selected type column.")}</p>}</div>)}
        {converted && <>
          {converted.issues.length ? <ul className="max-h-52 space-y-1 overflow-y-auto text-xs text-[var(--md-red)]" aria-label={t("Source conversion issues")}>{converted.issues.slice(0, 100).map((issue, index) => <li key={index}>{issue.row ? `${t("Row")} ${issue.row}: ` : ""}{issue.field ? `${t(fieldLabels[issue.field] ?? issue.field)}: ` : ""}{t(issue.message)}</li>)}{converted.issues.length > 100 && <li>{t(`${converted.issues.length} issues in total. Showing the first 100.`)}</li>}</ul> : <p className="text-xs">{t(`${converted.rows.length} source rows converted. The server reconciliation check is still required.`)}</p>}
          {!!converted.rows.length && <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-xs"><caption className="pb-2 text-start">{t("Converted preview: first 10 rows. All converted rows are included in reconciliation.")}</caption><thead><tr>{["Source row", ...(kind === "trial" ? ["accountCode", "debit", "credit"] : Object.keys(itemLabels))].map(field => <th key={field} scope="col" className="p-2 text-start font-medium">{t(fieldLabels[field] ?? field)}</th>)}</tr></thead><tbody>{converted.rows.slice(0, 10).map((row, index) => <tr key={index} className="border-t border-[var(--md-line)]"><td className="p-2">{converted.sourceRows[index]}</td>{(kind === "trial" ? ["accountCode", "debit", "credit"] : Object.keys(itemLabels)).map(field => <td key={field} className="whitespace-nowrap p-2" data-i18n-skip>{(row as unknown as Record<string, string>)[field] || "—"}</td>)}</tr>)}</tbody></table></div>}
        </>}
      </>}
    </>}
  </section>
}
