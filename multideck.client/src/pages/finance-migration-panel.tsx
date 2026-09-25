import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { SettingsPanel } from "@/components/multideck/settings-components"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useLanguage } from "@/i18n/language-provider"
import { getOpeningBalancePackage, getOpeningBalances, getOpeningSourceItems, openingBalanceAction, reconcileMigration, type MigrationReconciliation, type OpeningBalanceRecord, type OpeningSourceItem } from "@/lib/finance-ledger-api"
import { deliverOpeningMirror, openingMirrorStatus, type OpeningMirrorStatus } from "@/lib/finance-reconciliation-api"
import { getFinanceDraftOptions } from "@/lib/finance-subledger-api"
import { openingKinds, openItemsFromUpload, readMigrationUpload, trialBalanceFromUpload, type ImportResult, type ItemField, type ItemMapping, type MigrationUpload, type OpeningItemInput, type OpeningKind, type TrialBalanceInput, type TrialField, type TrialMapping } from "@/lib/accounting-migration-import"

const selectClass = "h-9 w-full min-w-0 rounded-[var(--md-radius-md)] bg-[var(--md-surface-soft)] px-2 text-[13px] text-[var(--md-ink)] focus-visible:outline-2 focus-visible:outline-[var(--md-accent)]"
const trialLabels: Record<TrialField, string> = { accountCode: "Account code", debit: "Closing debit", credit: "Closing credit", balance: "Signed closing balance" }
const itemLabels: Record<ItemField, string> = { sourceId: "Source transaction ID", partyCode: "Customer / supplier code", reference: "Document reference", accountCode: "Control account code", kind: "Transaction type", documentDate: "Document date", dueDate: "Due date (optional)", currency: "Transaction currency", originalAmount: "Original gross amount", originalBaseAmount: "Original base-currency amount", outstandingAmount: "Outstanding gross amount", outstandingBaseAmount: "Outstanding base-currency amount", historicalVatEvidenceRef: "Prior VAT filing reference (UK)" }
const kindLabels: Record<OpeningKind, string> = { customer_invoice: "Customer invoice", customer_credit: "Customer credit", customer_receipt: "Unapplied customer receipt", supplier_invoice: "Supplier invoice", supplier_credit: "Supplier credit", supplier_payment: "Unapplied supplier payment" }
type Source<T> = { upload: MigrationUpload; result: ImportResult<T> }
const blankTrial = (): TrialMapping => ({ headerRow: 0, columns: {}, numberFormat: "decimal-point", balanceMode: "debit-credit" })
const blankItems = (): ItemMapping => ({ headerRow: 0, columns: {}, numberFormat: "decimal-point", dateFormat: "iso", amountConvention: "positive", fixedKind: "customer_invoice", kindValues: {} })

/** Page-local CargoWise preflight and controlled, clean-ledger opening cutover. */
export function FinanceMigrationPanel({ entityId, baseCurrency, chartDirty, canDeliverOpeningMirror = false }: { entityId: string; baseCurrency: string; chartDirty: boolean; canDeliverOpeningMirror?: boolean }) {
  const { t } = useLanguage()
  const [trial, setTrial] = useState<Source<TrialBalanceInput> | null>(null)
  const [items, setItems] = useState<Source<OpeningItemInput> | null>(null)
  const [noOpenItems, setNoOpenItems] = useState(false)
  const [cutoff, setCutoff] = useState("")
  const [report, setReport] = useState<MigrationReconciliation | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [openingPackages, setOpeningPackages] = useState<OpeningBalanceRecord[]>([])
  const [mirrorStatuses, setMirrorStatuses] = useState<Record<string, OpeningMirrorStatus>>({})
  const [mirrorError, setMirrorError] = useState("")
  const [packageError, setPackageError] = useState("")
  const [packageNotice, setPackageNotice] = useState("")
  const [evidence, setEvidence] = useState({ bank: "", tax: "", accrualWip: "", sourceReconciliation: "", partyMapping: "", openItems: "", fx: "" })
  const [partyOptions, setPartyOptions] = useState<Array<{ Org_id: string; Org_Name: string; Org_AccCode: string; role: "customer" | "supplier" }>>([])
  const [partyMap, setPartyMap] = useState<Record<string, string>>({})
  const [partyError, setPartyError] = useState("")
  const [review, setReview] = useState<{ action: "approve" | "post"; record: OpeningBalanceRecord } | null>(null)
  const [sourcePage, setSourcePage] = useState<{ rows: OpeningSourceItem[]; total: number; offset: number } | null>(null)
  const [sourceError, setSourceError] = useState("")
  const request = useRef(0)
  const packageRequest = useRef(0)
  const loadPackages = useCallback(async () => {
    const version = ++packageRequest.current
    try {
      const rows = await getOpeningBalances(entityId)
      if (version === packageRequest.current) { setOpeningPackages(rows); setPackageError("") }
      const posted = rows.filter(record => record.package.status === "posted")
      const results = await Promise.allSettled(posted.map(record => openingMirrorStatus(entityId, record.package.id)))
      if (version === packageRequest.current) {
        setMirrorStatuses(Object.fromEntries(results.flatMap((result, index) => result.status === "fulfilled" ? [[posted[index].package.id, result.value]] : [])))
        setMirrorError(results.some(result => result.status === "rejected") ? "Accounts system delivery status could not be loaded. Refresh to retry." : "")
      }
    } catch (cause) { if (version === packageRequest.current) setPackageError(cause instanceof Error ? cause.message : "Opening balance packages could not be loaded.") }
  }, [entityId])
  useEffect(() => { void loadPackages(); return () => { packageRequest.current++ } }, [loadPackages])
  useEffect(() => {
    let active = true
    setPartyOptions([]); setPartyMap({}); setPartyError("")
    void Promise.all([getFinanceDraftOptions("receivables"), getFinanceDraftOptions("payables")])
      .then(([customer, supplier]) => {
        if (!active) return
        setPartyOptions([...customer.parties.map(party => ({ ...party, role: "customer" as const })),
          ...supplier.parties.map(party => ({ ...party, role: "supplier" as const }))])
      })
      .catch(cause => { if (active) setPartyError(cause instanceof Error ? cause.message : "Customer and supplier choices could not be loaded.") })
    return () => { active = false }
  }, [entityId])
  const invalidate = useCallback(() => { request.current++; setReport(null); setError(""); setBusy(false) }, [])
  const updateTrial = useCallback((value: Source<TrialBalanceInput> | null) => { invalidate(); setTrial(value) }, [invalidate])
  const updateItems = useCallback((value: Source<OpeningItemInput> | null) => { invalidate(); setItems(value) }, [invalidate])
  useEffect(() => { invalidate(); return () => { request.current++ } }, [entityId, baseCurrency, chartDirty, invalidate])
  const ready = !chartDirty && /^[A-Z]{3}$/.test(baseCurrency) && Boolean(cutoff && trial?.result.rows.length && !trial.result.issues.length && (noOpenItems || items?.result.rows.length && !items.result.issues.length))
  const sourceParties = useMemo(() => [...new Map((items?.result.rows ?? []).map(item => [
    `${item.kind.startsWith("customer_") ? "customer" : "supplier"}:${item.partyCode}`,
    { code: item.partyCode, role: item.kind.startsWith("customer_") ? "customer" as const : "supplier" as const },
  ])).values()], [items])
  const partyFor = (role: "customer" | "supplier", code: string) => {
    const explicit = partyMap[`${role}:${code}`]
    if (explicit) return explicit
    const exact = partyOptions.filter(party => party.role === role && party.Org_AccCode === code)
    return exact.length === 1 ? exact[0].Org_id : ""
  }
  const partiesMapped = sourceParties.every(party => Boolean(partyFor(party.role, party.code)))
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
  const stageOpening = async () => {
    if (!report?.reconciled || !trial || busy || (!noOpenItems && (!items || !partiesMapped))) return
    setBusy(true); setPackageError(""); setPackageNotice("")
    try {
      await openingBalanceAction(entityId, "stage", { packageKind: noOpenItems ? "gl_only" : "full_open_items",
        sourceSystem: "CargoWise", sourceFileName: trial.upload.name, sourceSha256: trial.upload.sha256,
        ...(items && !noOpenItems ? { sourceItemsFileName: items.upload.name, sourceItemsSha256: items.upload.sha256,
          sourceItemsSheetName: items.upload.sheetName } : {}),
        cutoffDate: cutoff, baseCurrency, evidence: noOpenItems ? {
          bank: evidence.bank, tax: evidence.tax, accrualWip: evidence.accrualWip,
          sourceReconciliation: evidence.sourceReconciliation,
        } : evidence,
        trialBalance: trial.result.rows.map((row, index) => ({ ...row, sourceRow: trial.result.sourceRows[index] })),
        openItems: noOpenItems ? [] : items!.result.rows.map((row, index) => ({ ...row,
          sourceRow: items!.result.sourceRows[index], partyOrgId: partyFor(row.kind.startsWith("customer_") ? "customer" : "supplier", row.partyCode) })) })
      setPackageNotice(t("Opening balances staged. A second finance operator must review and approve them before posting."))
      await loadPackages()
    } catch (cause) { setPackageError(cause instanceof Error ? cause.message : "Opening balances could not be staged.") }
    finally { setBusy(false) }
  }
  const openReview = async (record: OpeningBalanceRecord, action: "approve" | "post") => {
    setPackageError(""); setSourceError(""); setSourcePage(null); setBusy(true)
    try {
      const detail = await getOpeningBalancePackage(entityId, record.package.id)
      if (!detail[0]) throw new Error("Opening balance package was not found.")
      if (detail[0].package.package_kind === "full_open_items")
        setSourcePage(await getOpeningSourceItems(entityId, record.package.id))
      setReview({ action, record: detail[0] })
    } catch (cause) { setPackageError(cause instanceof Error ? cause.message : "Opening balance detail could not be loaded.") }
    finally { setBusy(false) }
  }
  const loadSourcePage = async (offset: number) => {
    if (!review || busy) return
    setBusy(true); setSourceError("")
    try { setSourcePage(await getOpeningSourceItems(entityId, review.record.package.id, offset)) }
    catch (cause) { setSourceError(cause instanceof Error ? cause.message : "Source items could not be loaded.") }
    finally { setBusy(false) }
  }
  const confirmReview = async () => {
    if (!review || busy) return
    setBusy(true); setPackageError(""); setPackageNotice("")
    try {
      await openingBalanceAction(entityId, review.action, { id: review.record.package.id })
      setPackageNotice(t(review.action === "approve" ? "Opening balances approved. Posting is still required." : "Opening balances posted to the native general ledger."))
      setReview(null); await loadPackages()
    } catch (cause) { setPackageError(cause instanceof Error ? cause.message : "Opening balance action could not be completed.") }
    finally { setBusy(false) }
  }
  const deliverMirror = async (packageId: string) => {
    if (!canDeliverOpeningMirror || busy) return
    setBusy(true); setPackageError(""); setPackageNotice("")
    try {
      const result = await deliverOpeningMirror(entityId, packageId)
      setPackageNotice(t(result.status === "matched" ? "Opening journal matched to the accounts system." : "Accounts system delivery is still in progress."))
    } catch (cause) { setPackageError(cause instanceof Error ? cause.message : "Opening journal delivery failed. Check the saved status before retrying.") }
    finally { await loadPackages(); setBusy(false) }
  }
  const issueLocation = (issue: MigrationReconciliation["issues"][number]) => {
    const source = issue.area === "trial_balance" ? trial : issue.area === "open_items" ? items : null
    return source && issue.row ? `${source.upload.name} · ${source.upload.sheetName} · ${t("row")} ${source.result.sourceRows[issue.row - 1] ?? issue.row}` : t(issue.area.replaceAll("_", " "))
  }
  return <SettingsPanel title={t("CargoWise opening balances")} description={t("Upload a closing trial balance and open transactions, review the source columns, then reconcile them to this legal entity's saved chart.")}>
    <details className="px-5 py-4"><summary className="cursor-pointer text-[13px] font-medium text-[var(--md-accent)] focus-visible:outline-2 focus-visible:outline-[var(--md-accent)]">{t("Prepare migration preview")}</summary>
      <div className="mt-4 space-y-5">
        <p className="text-xs text-[var(--md-text)]">{t("The preview does not save files. It sends converted balances and transactions to your tenant's finance service. Reconciled source rows can be staged, independently approved and posted to an empty native ledger.")}</p>
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
          <p className="text-xs text-[var(--md-text)]">{t("This checks closing balances, not debit/credit turnover. Control figures are debit-positive. A linked accounts system still needs separate opening-journal and subledger agreement before cutover.")}</p>
          {report.reconciled ? <div className="space-y-3 border-t border-[var(--md-line)] pt-3">
            <p className="text-[12px] text-[var(--md-text)]">{t("Record reviewed source evidence. The service rechecks the source rows, party links and controls at approval and posting. The source workbook must be retained in your controlled records.")}</p>
            {!noOpenItems && <div className="space-y-2">
              <h4 className="text-[13px] font-medium">{t("Map CargoWise customer and supplier codes")}</h4>
              {partyError ? <p role="alert" className="text-xs text-[var(--md-red)]">{t(partyError)}</p> : null}
              <p className="text-xs text-[var(--md-text)]">{t("Exact, unique account-code matches are preselected. Check every mapping before staging.")}</p>
              <div className="grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">{sourceParties.map(party => <label key={`${party.role}:${party.code}`} className="grid gap-1 text-xs">
                <span data-i18n-skip>{party.code} · {party.role}</span>
                <select className={selectClass} value={partyFor(party.role, party.code)} onChange={event => setPartyMap(current => ({ ...current, [`${party.role}:${party.code}`]: event.target.value }))}>
                  <option value="">{t("Choose account")}</option>
                  {partyOptions.filter(option => option.role === party.role).map(option => <option key={option.Org_id} value={option.Org_id}>{option.Org_AccCode} · {option.Org_Name}</option>)}
                </select>
              </label>)}</div>
            </div>}
            <div className="grid gap-3 sm:grid-cols-2">{([
              ["bank", "Bank position evidence"], ["tax", "Tax balance evidence"], ["accrualWip", "Accrual and WIP evidence"], ["sourceReconciliation", "CargoWise reconciliation reference"],
              ...(!noOpenItems ? [["partyMapping", "Party mapping review"], ["openItems", "Open-item source reconciliation"], ["fx", "Source FX carrying-value review"]] as const : []),
            ] as const).map(([key, label]) => <label key={key} className="grid gap-1 text-[12px]">{t(label)}<Input value={evidence[key]} onChange={event => setEvidence(current => ({ ...current, [key]: event.target.value }))} maxLength={240} /></label>)}</div>
            <Button disabled={busy || chartDirty || !partiesMapped || (noOpenItems ? [evidence.bank,evidence.tax,evidence.accrualWip,evidence.sourceReconciliation] : Object.values(evidence)).some(value => value.trim().length < 3)} onClick={() => void stageOpening()}>{t("Stage opening balances")}</Button>
          </div> : null}
        </div>}
      </div>
    </details>
    <div className="space-y-3 border-t border-[var(--md-line)] px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-[14px] font-medium">{t("Opening balance packages")}</h3><Button variant="outline" size="sm" disabled={busy} onClick={() => void loadPackages()}>{t("Refresh")}</Button></div>
      {packageError ? <p role="alert" className="text-[13px] text-[var(--md-red)]">{t(packageError)}</p> : null}
      {packageNotice ? <p role="status" className="text-[13px] text-[var(--md-green)]">{packageNotice}</p> : null}
      {mirrorError ? <p role="alert" className="text-[12px] text-[var(--md-red)]">{t(mirrorError)}</p> : null}
      {!openingPackages.length ? <p className="text-[12px] text-[var(--md-subtle)]">{t("No opening balance packages staged.")}</p> : <div className="overflow-x-auto"><table className="w-full min-w-[780px] text-[13px]"><thead><tr>{["Source", "Closing date", "Rows", "Debit / credit", "Status", "Accounts system", "Action"].map(label => <th key={label} scope="col" className="p-2 text-start font-medium">{t(label)}</th>)}</tr></thead><tbody>{openingPackages.map(record => { const mirror = mirrorStatuses[record.package.id]; return <tr key={record.package.id} className="border-t border-[var(--md-line)]"><td className="p-2" data-i18n-skip>{record.package.source_file_name}</td><td className="p-2" data-i18n-skip>{record.package.closing_date}</td><td className="p-2 tabular-nums">{record.rowCount}</td><td className="p-2 tabular-nums" data-i18n-skip>{record.package.debit_total} / {record.package.credit_total} {record.package.base_currency}</td><td className="p-2">{t(record.package.status)}</td><td className="p-2">{mirror && mirror.status !== "not_queued" ? <div className="space-y-1"><p>{t(mirror.status === "matched" ? "Matched" : mirror.status === "failed" ? "Delivery failed" : mirror.status === "leased" ? "Delivery in progress" : "Queued for delivery")}</p>{mirror.external_id ? <p className="break-all text-[11px] text-[var(--md-subtle)]" data-i18n-skip>{mirror.external_id}</p> : null}{mirror.readback_hash ? <p className="break-all text-[11px] text-[var(--md-subtle)]" data-i18n-skip>SHA-256 {mirror.readback_hash}</p> : null}{mirror.last_error ? <p role="alert" className="text-[11px] text-[var(--md-red)]">{t(mirror.last_error)}</p> : null}</div> : <span className="text-[var(--md-subtle)]">—</span>}</td><td className="p-2">{record.package.status !== "posted" ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void openReview(record, record.package.status === "staged" ? "approve" : "post")}>{t(record.package.status === "staged" ? "Review and approve" : "Review and post")}</Button> : mirror && ["queued", "failed"].includes(mirror.status) && canDeliverOpeningMirror ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void deliverMirror(record.package.id)}>{t(mirror.status === "failed" ? "Retry delivery" : "Deliver opening")}</Button> : null}</td></tr> })}</tbody></table></div>}
    </div>
    <Dialog open={review !== null} onOpenChange={open => { if (!open && !busy) setReview(null) }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[760px]"><DialogHeader><DialogTitle>{t(review?.action === "post" ? "Post opening balances" : "Approve opening balances")}</DialogTitle><DialogDescription>{t("Compare the source hash, account rows and evidence with the CargoWise closing records. The service requires a second finance operator and checks the ledger again.")}</DialogDescription></DialogHeader>
      {review ? <div className="space-y-3 text-[12px]">{packageError ? <p role="alert" className="text-[var(--md-red)]">{t(packageError)}</p> : null}<p>{t("Source")}: <span data-i18n-skip>{review.record.package.source_file_name}</span> · SHA-256 <span className="break-all" data-i18n-skip>{review.record.package.source_sha256}</span></p>
        {review.record.package.package_kind === "full_open_items" && <p>{t("Open-item source")}: <span data-i18n-skip>{review.record.package.source_items_file_name}</span> · SHA-256 <span className="break-all" data-i18n-skip>{review.record.package.source_items_sha256}</span> · {review.record.package.source_items_count} {t("rows")}</p>}
        <p>{t("Closing date")}: <span data-i18n-skip>{review.record.package.closing_date}</span> · {t("Opening date")}: <span data-i18n-skip>{review.record.package.opening_date}</span></p><p>{t("Debit")}: {review.record.package.debit_total} · {t("Credit")}: {review.record.package.credit_total} {review.record.package.base_currency}</p><div className="grid gap-1 sm:grid-cols-2">{Object.entries(review.record.package.evidence).map(([key, value]) => <p key={key}>{t(key)}: <span data-i18n-skip>{value}</span></p>)}</div><div className="max-h-56 overflow-auto"><table className="w-full text-[12px]"><thead><tr>{["Source row", "Account", "Debit", "Credit"].map(label => <th key={label} className="p-1 text-start font-medium">{t(label)}</th>)}</tr></thead><tbody>{review.record.rows.map(row => <tr key={row.source_row_number} className="border-t border-[var(--md-line)]"><td className="p-1">{row.source_row_number}</td><td className="p-1" data-i18n-skip>{row.nominal_code_snapshot} · {row.nominal_name_snapshot}</td><td className="p-1 tabular-nums">{row.debit}</td><td className="p-1 tabular-nums">{row.credit}</td></tr>)}</tbody></table></div>
        {sourcePage && <div className="space-y-2"><p>{t("Open-item source rows")}: {sourcePage.offset + 1}–{Math.min(sourcePage.offset + sourcePage.rows.length, sourcePage.total)} / {sourcePage.total}</p>
          {sourceError && <p role="alert" className="text-[var(--md-red)]">{t(sourceError)}</p>}
          <div className="max-h-56 overflow-auto"><table className="min-w-[900px] w-full text-[12px]"><thead><tr>{["Row", "Source ID", "Party code", "Mapped party", "Type", "Reference", "Currency", "Outstanding", "Base carrying", "Prior VAT reference"].map(label => <th key={label} scope="col" className="p-1 text-start font-medium">{t(label)}</th>)}</tr></thead><tbody>{sourcePage.rows.map(row => <tr key={row.source_row_number} className="border-t border-[var(--md-line)]"><td className="p-1">{row.source_row_number}</td><td className="p-1" data-i18n-skip>{row.source_id}</td><td className="p-1" data-i18n-skip>{row.source_party_code}</td><td className="p-1" data-i18n-skip>{row.party_org_id}</td><td className="p-1">{t(kindLabels[row.kind as OpeningKind] ?? row.kind)}</td><td className="p-1" data-i18n-skip>{row.source_reference}</td><td className="p-1" data-i18n-skip>{row.currency_code}</td><td className="p-1 tabular-nums">{row.outstanding_amount}</td><td className="p-1 tabular-nums">{row.outstanding_base_amount}</td><td className="p-1" data-i18n-skip>{row.historical_vat_evidence_ref ?? "—"}</td></tr>)}</tbody></table></div>
          <div className="flex gap-2"><Button size="sm" variant="outline" disabled={busy || sourcePage.offset === 0} onClick={() => void loadSourcePage(Math.max(0, sourcePage.offset - 100))}>{t("Previous")}</Button><Button size="sm" variant="outline" disabled={busy || sourcePage.offset + 100 >= sourcePage.total} onClick={() => void loadSourcePage(sourcePage.offset + 100)}>{t("Next")}</Button></div>
        </div>}
      </div> : null}
      <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setReview(null)}>{t("Cancel")}</Button><Button disabled={busy || !review} onClick={() => void confirmReview()}>{t(review?.action === "post" ? "Post to native ledger" : "Approve package")}</Button></DialogFooter>
    </DialogContent></Dialog>
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
