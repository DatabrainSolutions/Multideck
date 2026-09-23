import { useCallback, useEffect, useRef, useState } from "react"
import { Calculator } from "@/components/icons/hugeicons"
import { DataTable, type DataTableColumn } from "@/components/multideck/data-table"
import { DotGridLoader } from "@/components/multideck/dot-grid-loader"
import { SettingsPageHeader, SettingsPanel } from "@/components/multideck/settings-components"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useLanguage } from "@/i18n/language-provider"
import { hasPermission, type AuthUserSummary } from "@/lib/auth-user"
import { getGlEntities, getGlTransaction, getGlWorkspace, journalAction, journalTotal, type GlEntity, type GlEntry, type GlWorkspace, type GlTransaction, type Journal, type JournalLine } from "@/lib/finance-ledger-api"
import { subscribeTopBarAction, topBarActionEvents } from "@/lib/top-bar-action-events"
import { prepareJournalReversal } from "@/lib/journal-reversal"
import { importJournalFile } from "@/lib/journal-import"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const blankLine = (): JournalLine => ({ accountId: "", description: "", debit: "0", credit: "0" })
const selectClass = "h-9 w-full min-w-0 rounded-[var(--md-radius-md)] bg-[var(--md-surface-soft)] px-2 text-[13px] text-[var(--md-ink)] focus-visible:outline-2 focus-visible:outline-[var(--md-accent)]"

export function FinanceGeneralLedgerPage({ route, navigate, currentUser }: { route: string; navigate: (path: string) => void; currentUser?: AuthUserSummary | null }) {
  const { t, language } = useLanguage()
  const [entities, setEntities] = useState<GlEntity[]>([]), [entity, setEntity] = useState("")
  const [from, setFrom] = useState(`${new Date().getFullYear()}-01`), [to, setTo] = useState(new Date().toISOString().slice(0, 7))
  const [account, setAccount] = useState(""), [offset, setOffset] = useState(0), [journalOffset, setJournalOffset] = useState(0)
  const [workspace, setWorkspace] = useState<GlWorkspace | null>(null), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false)
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [journal, setJournal] = useState<Journal | null>(null), [dirty, setDirty] = useState(false), [confirmPost, setConfirmPost] = useState(false)
  const generation = useRef(0)
  const importInput = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [transaction, setTransaction] = useState<GlTransaction | null>(null), [transactionLoading, setTransactionLoading] = useState(false)
  const isJournals = route.endsWith("/journals"), isEnquiry = route.endsWith("/accounts")
  const canPrepare = hasPermission(currentUser, "Finance.Management.Prepare"), canPost = hasPermission(currentUser, "Finance.Management.Post")
  const currency = entities.find(row => row.LegalEntity_ID === entity)?.LegalEntity_BaseCurrencyCodeSnapshot || "GBP"
  const format = (value: number) => new Intl.NumberFormat(language, { style: "currency", currency, maximumFractionDigits: 4 }).format(value)
  useEffect(() => { let active = true; void getGlEntities().then(result => { if (active) { setEntities(result.entities); setEntity(result.entities[0]?.LegalEntity_ID ?? ""); if (!result.entities.length) setLoading(false) } }).catch(cause => { if (active) { setError(cause.message); setLoading(false) } }); return () => { active = false } }, [])
  const load = useCallback(async () => {
    if (!entity) return
    const request = ++generation.current
    setLoading(true); setError("")
    try {
      if (!from || !to || from > to) throw new Error("Choose a valid accounting period range.")
      const result = await getGlWorkspace({ legalEntityId: entity, from: from.replace("-", ""), to: to.replace("-", ""), accountId: isEnquiry ? account : "", offset: String(offset), journalOffset: String(journalOffset) })
      if (request === generation.current) setWorkspace(result)
    } catch (cause) { if (request === generation.current) { setError(cause instanceof Error ? cause.message : "Could not load general ledger."); setWorkspace(null) } }
    finally { if (request === generation.current) setLoading(false) }
  }, [entity, from, to, account, offset, journalOffset, isEnquiry])
  useEffect(() => { void load(); return () => { generation.current++ } }, [load])
  useEffect(() => subscribeTopBarAction(topBarActionEvents.createJournal, () => {
    if (!entity || !canPrepare || journal || busy) return
    setJournal({ id: crypto.randomUUID(), accounting_date: new Date().toISOString().slice(0, 10), reference: "", description: "", currency, lines: [blankLine(), blankLine()], status: "draft", mirror_status: "not_required" }); setDirty(true); setError(""); setNotice("")
  }), [entity, canPrepare, currency, journal, busy])
  const change = (patch: Partial<Journal>) => { setJournal(value => value ? { ...value, ...patch } : value); setDirty(true); setConfirmPost(false) }
  const editLine = (index: number, patch: Partial<JournalLine>) => change({ lines: journal!.lines.map((line, at) => at === index ? { ...line, ...patch } : line) })
  const prepareReversal = () => {
    if (!journal || !canPrepare || busy) return
    try {
      setJournal(prepareJournalReversal(journal, crypto.randomUUID()))
      setDirty(true); setConfirmPost(false); setError("")
      setNotice("Reversal draft prepared. Check the accounting date, then save and post. The original journal is unchanged.")
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not prepare the reversal.") }
  }
  const action = async (kind: "save" | "post" | "retry") => {
    if (!journal) return
    setBusy(true); setError(""); setNotice("")
    try { const saved = await journalAction(kind, entity, kind === "save" ? { ...journal, lines: journal.lines.map(line => ({ ...line, description: workspace?.accounts.find(account => account.FINNom_ID === line.accountId)?.FINNom_Name ?? line.description })) } : journal); setJournal(saved); setDirty(false); setConfirmPost(false); setNotice(saved.deliveryNotice || (saved.mirror_status === "failed" ? saved.mirror_error || "Journal posted; delivery needs attention." : kind === "save" ? "Draft saved." : kind === "post" ? "Journal posted to the general ledger." : "Accounts system delivery updated.")); await load() }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Journal action failed.") }
    finally { setBusy(false) }
  }
  const debit = journal ? journalTotal(journal.lines, "debit") : 0n, credit = journal ? journalTotal(journal.lines, "credit") : 0n
  const balanced = debit !== null && credit !== null && debit > 0n && debit === credit
  const readonly = journal?.status === "posted" || !canPrepare || importing
  const importLines = async (file: File) => {
    if (!journal || journal.status !== "draft" || !canPrepare || busy || importing || !workspace) return
    setImporting(true); setBusy(true); setError(""); setNotice("")
    try {
      const lines = await importJournalFile(file, workspace.accounts)
      if (journal.lines.some(line => line.accountId || Number(line.debit) || Number(line.credit)) && !window.confirm(t("Replace the current journal lines with the imported lines?"))) return
      change({ lines })
      setNotice("Journal lines imported. Review the date, reference and totals before saving. Nothing has been posted.")
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not import journal lines.") }
    finally { setImporting(false); setBusy(false) }
  }
  const openTransaction = async (id: string) => {
    setTransactionLoading(true); setError("")
    try { setTransaction(await getGlTransaction(entity, id)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Transaction could not be loaded.") }
    finally { setTransactionLoading(false) }
  }
  const columns: DataTableColumn<GlEntry>[] = [
    { id: "period", label: t("Period"), width: 100, cell: row => `${row.period.slice(0, 4)}-${row.period.slice(4)}`, kind: "date" },
    { id: "number", label: t("Transaction"), width: 140, cell: row => <button disabled={transactionLoading} className="text-[var(--md-accent)] hover:underline" onClick={() => void openTransaction(row.batchId)}>{row.number}</button> },
    { id: "accountCode", label: t("Account"), width: 100, cellTitle: row => row.accountName, cell: row => <button aria-label={`${row.accountCode} · ${row.accountName}`} className="text-[var(--md-accent)] hover:underline" onClick={() => { setAccount(row.accountId); setOffset(0); navigate("/finance/general-ledger/accounts") }}>{row.accountCode}</button> },
    { id: "description", label: t("Description"), width: 260, cell: row => row.description, kind: "long-text" },
    { id: "debit", label: t("Debit"), width: 120, cell: row => format(row.debit), kind: "number" },
    { id: "credit", label: t("Credit"), width: 120, cell: row => format(row.credit), kind: "number" },
  ]
  const journalColumns: DataTableColumn<Journal>[] = [
    { id: "number", label: t("Journal"), cell: row => <Button variant="ghost" size="sm" onClick={() => { setJournal(row); setDirty(false); setConfirmPost(false); setError(""); setNotice("") }}>JN-{row.number}</Button> },
    { id: "accounting_date", label: t("Accounting date"), cell: row => row.accounting_date, kind: "date" },
    { id: "reference", label: t("Reference"), cell: row => row.reference },
    { id: "description", label: t("Description"), cell: row => row.description, kind: "long-text" },
    { id: "status", label: t("Status"), cell: row => t(row.status === "posted" ? "Posted" : "Draft") },
    { id: "mirror_status", label: t("Accounts System"), cell: row => t(({ not_required: "Not required", queued: "Queued", sending: "Sending", failed: "Needs attention", synced: "Confirmed" } as Record<string, string>)[row.mirror_status] || row.mirror_status) },
  ]
  return <>
    <SettingsPageHeader title={t("General ledger")} description={t("Posted transactions, account enquiries and balanced journals in the legal entity’s base currency.")} icon={Calculator} descriptionPlacement="under-title" actions={<Button variant="outline" onClick={() => navigate("/finance/reports")}>{t("Financial reports")}</Button>} />
    <div className="mt-[var(--md-page-stack-gap)] space-y-[var(--md-page-stack-gap)]">
      {!journal && error ? <p role="alert" className="text-[var(--md-red)]">{t(error)}</p> : null}
      <nav aria-label={t("General ledger views")} className="flex flex-wrap gap-2">{[["/finance/general-ledger", "Transactions"], ["/finance/general-ledger/accounts", "Account enquiries"], ["/finance/general-ledger/journals", "Journals"]].map(([path, label]) => <Button key={path} variant={route === path ? "default" : "outline"} onClick={() => { setOffset(0); navigate(path) }}>{t(label)}</Button>)}</nav>
      <SettingsPanel title={t("Ledger selection")}><div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <label className="grid gap-1 text-xs">{t("Legal entity")}<select className={selectClass} value={entity} onChange={event => { setWorkspace(null); setEntity(event.target.value); setAccount(""); setOffset(0); setJournalOffset(0) }}>{entities.map(row => <option key={row.LegalEntity_ID} value={row.LegalEntity_ID}>{row.LegalEntity_Name}</option>)}</select></label>
        {!isJournals && <><label className="grid gap-1 text-xs">{t("From period")}<Input type="month" value={from} onChange={event => { setFrom(event.target.value); setOffset(0) }} /></label><label className="grid gap-1 text-xs">{t("To period")}<Input type="month" value={to} onChange={event => { setTo(event.target.value); setOffset(0) }} /></label></>}
        {isEnquiry && <label className="grid gap-1 text-xs">{t("Account")}<select className={selectClass} value={account} onChange={event => { setAccount(event.target.value); setOffset(0) }}><option value="">{t("Choose account")}</option>{workspace?.accounts.map(row => <option key={row.FINNom_ID} value={row.FINNom_ID}>{row.FINNom_Code} · {row.FINNom_Name}</option>)}</select></label>}
        <Button variant="outline" disabled={loading || !entity} onClick={() => void load()}>{t("Refresh")}</Button>
      </div></SettingsPanel>
      {loading ? <div className="grid min-h-48 place-items-center"><DotGridLoader label="Loading general ledger" /></div> : !entity ? <p>{t("No legal entities are available.")}</p> : workspace ? <>
        {isEnquiry && account && <div className="flex flex-wrap gap-6 text-[13px]" aria-live="polite">{([["Opening balance", workspace.enquiry.opening], ["Debits", workspace.enquiry.debit], ["Credits", workspace.enquiry.credit], ["Closing balance", workspace.enquiry.closing]] as const).map(([label, value]) => <p key={label}>{t(label)} <span className="font-medium">{format(value)}</span></p>)}</div>}
        {isJournals ? <DataTable columns={journalColumns} rows={workspace.journals} getRowKey={row => row.id} ariaLabel={t("Journal register")} minimumWidth={780} emptyState={<p>{t("No journals yet. Use New journal to prepare a balanced entry.")}</p>} /> : isEnquiry && !account ? <p>{t("Choose a nominal account to view its movements and balances.")}</p> : <DataTable columns={columns} rows={workspace.enquiry.rows} getRowKey={row => row.id} ariaLabel={t("General ledger transactions")} minimumWidth={850} emptyState={<p>{t("No posted transactions in this period.")}</p>} />}
        <div className="flex items-center justify-end gap-3 text-xs"><Button variant="outline" disabled={(isJournals ? journalOffset : offset) === 0} onClick={() => isJournals ? setJournalOffset(value => Math.max(0, value - 100)) : setOffset(value => Math.max(0, value - 100))}>{t("Previous")}</Button><span>{isJournals ? `${journalOffset + 1}–${journalOffset + workspace.journals.length}` : `${offset + (workspace.enquiry.count ? 1 : 0)}–${offset + workspace.enquiry.rows.length} / ${workspace.enquiry.count}`}</span><Button variant="outline" disabled={isJournals ? workspace.journals.length < 100 : offset + 100 >= workspace.enquiry.count} onClick={() => isJournals ? setJournalOffset(value => value + 100) : setOffset(value => value + 100)}>{t("Next")}</Button></div>
      </> : null}
    </div>
    <Dialog open={Boolean(transaction) || transactionLoading} onOpenChange={open => { if (!open && !transactionLoading) setTransaction(null) }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl"><DialogHeader><DialogTitle>{transaction?.number || t("Transaction")}</DialogTitle><DialogDescription>{t("All debit and credit lines for this posted transaction. This entry is read-only.")}</DialogDescription></DialogHeader>{transactionLoading ? <DotGridLoader label="Loading transaction" /> : transaction ? <><p className="text-xs">{t("Posted")} {new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(transaction.postedAt))} · {transaction.currency}</p><DataTable rows={transaction.lines} getRowKey={row => row.id} ariaLabel={t("Transaction lines")} minimumWidth={600} columns={[{ id: "account", label: t("Account"), cell: row => row.account }, { id: "description", label: t("Description"), cell: row => row.description }, { id: "debit", label: t("Debit"), kind: "number", cell: row => format(row.debit) }, { id: "credit", label: t("Credit"), kind: "number", cell: row => format(row.credit) }]} /></> : null}</DialogContent></Dialog>
    <Dialog open={Boolean(journal)} onOpenChange={open => { if (!open && !busy && (!dirty || window.confirm(t("Discard unsaved journal changes?")))) { setJournal(null); setConfirmPost(false); setError("") } }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl"><DialogHeader><DialogTitle>{journal?.number ? `JN-${journal.number}` : t("New journal")}</DialogTitle><DialogDescription>{t("Use non-control accounts. Save a draft, review the balanced entry, then post. Posted journals cannot be edited. Correct them with a new balancing journal.")}</DialogDescription></DialogHeader>
      {error && <p role="alert" className="text-[var(--md-red)]">{t(error)}</p>}{notice && <p role="status">{t(notice)}</p>}
      {journal && <><fieldset disabled={readonly || busy} className="space-y-4"><div className="grid gap-3 sm:grid-cols-3"><label className="grid gap-1 text-xs">{t("Accounting date")}<Input type="date" value={journal.accounting_date} onChange={event => change({ accounting_date: event.target.value })} /></label><label className="grid gap-1 text-xs">{t("Reference")}<Input maxLength={180} value={journal.reference} onChange={event => change({ reference: event.target.value })} /></label><label className="grid gap-1 text-xs">{t("Description")}<Input maxLength={500} value={journal.description} onChange={event => change({ description: event.target.value })} /></label></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-[13px]"><caption className="pb-2 text-left">{t("Journal lines")} · {journal.currency}</caption><thead><tr>{["Account", "Description", "Debit", "Credit", ""].map((label, index) => <th key={index} scope="col" className="p-1 text-left font-medium">{t(label)}</th>)}</tr></thead><tbody>{journal.lines.map((line, index) => <tr key={index}><td className="w-[30%] p-1"><Select value={line.accountId} disabled={readonly || busy} onValueChange={value => editLine(index, { accountId: value, description: workspace?.accounts.find(row => row.FINNom_ID === value)?.FINNom_Name ?? "" })}><SelectTrigger aria-label={`${t("Account")} ${index + 1}`} className="w-full"><SelectValue placeholder={t("Choose account")}>{workspace?.accounts.find(row => row.FINNom_ID === line.accountId)?.FINNom_Code || (line.accountId ? t("Account unavailable") : undefined)}</SelectValue></SelectTrigger><SelectContent>{workspace?.accounts.filter(row => row.FINNom_ID === line.accountId || row.FINNom_IsActive && row.FINNom_AllowManualPosting && !row.FINNom_IsControlAccount).map(row => <SelectItem key={row.FINNom_ID} value={row.FINNom_ID}>{row.FINNom_Code} · {row.FINNom_Name}</SelectItem>)}</SelectContent></Select></td><td className="p-1"><Input aria-label={`${t("Description")} ${index + 1}`} readOnly value={workspace?.accounts.find(row => row.FINNom_ID === line.accountId)?.FINNom_Name ?? line.description} /></td>{(["debit", "credit"] as const).map(side => <td key={side} className="w-[16%] p-1"><Input aria-label={`${t(side === "debit" ? "Debit" : "Credit")} ${index + 1}`} inputMode="decimal" value={line[side]} onChange={event => editLine(index, { [side]: event.target.value })} /></td>)}<td><Button variant="ghost" aria-label={`${t("Remove line")} ${index + 1}`} disabled={journal.lines.length <= 2} onClick={() => change({ lines: journal.lines.filter((_, at) => at !== index) })}>×</Button></td></tr>)}</tbody><tfoot aria-live="polite"><tr className="font-medium"><th scope="row" colSpan={2} className="p-1 pt-3 text-left">{t("Totals")}</th><td className="p-1 pt-3"><span className="block px-3 tabular-nums">{debit === null ? "—" : format(Number(debit) / 10000)}</span></td><td className="p-1 pt-3"><span className="block px-3 tabular-nums">{credit === null ? "—" : format(Number(credit) / 10000)}</span></td><td /></tr></tfoot></table></div>
        {journal.status === "draft" && canPrepare && <div className="space-y-2"><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={journal.lines.length >= 200 || importing} onClick={() => change({ lines: [...journal.lines, blankLine()] })}>{t("Add line")}</Button><Button variant="outline" disabled={importing} onClick={() => importInput.current?.click()}>{t(importing ? "Importing…" : "Import spreadsheet / CSV")}</Button><input ref={importInput} type="file" accept=".xlsx,.csv" className="hidden" aria-label={t("Import journal lines")} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void importLines(file) }} /></div><p className="text-xs text-[var(--md-text)]">{t("One journal per file. Use Account code, Debit and Credit headers; Excel imports the first worksheet. Up to 200 lines. Keep account codes as text. Descriptions come from the chart of accounts.")}</p></div>}
      </fieldset><p role="status" className="flex justify-end text-[13px]"><span className={balanced ? "rounded-[var(--md-radius-md)] bg-[var(--md-status-green-bg)] px-2 py-1 font-medium text-[var(--md-status-green-ink)]" : "rounded-[var(--md-radius-md)] bg-[var(--md-status-red-bg)] px-2 py-1 font-medium text-[var(--md-status-red-ink)]"}>{t(balanced ? "Balanced" : "Not balanced")}</span></p>
      {journal.status === "posted" && <p>{t("Accounts System")}: {t(journal.mirror_status.replaceAll("_", " "))}{journal.external_id ? ` · ${journal.external_id}` : ""}{journal.mirror_error ? ` · ${journal.mirror_error}` : ""}</p>}
      {journal.status === "posted" && canPrepare && <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-[var(--md-text)]">{t("Prepare an opposite entry dated the first day of the following month. Review the date before posting.")}</p><Button variant="outline" disabled={busy} onClick={prepareReversal}>{t("Create reversal")}</Button></div>}
      {confirmPost && <p role="alert">{t("Post this saved journal? It will affect the general ledger and will be sent to the linked accounts system when mirroring is enabled.")}</p>}
      <DialogFooter>{busy ? <DotGridLoader size="sm" label="Saving journal" /> : journal.status === "draft" ? <>{canPrepare && <Button variant="outline" disabled={!dirty || !journal.description.trim() || journal.lines.some(line => !line.accountId)} onClick={() => void action("save")}>{t("Save draft")}</Button>}{canPost && <Button disabled={dirty || !journal.version || !balanced} onClick={() => confirmPost ? void action("post") : setConfirmPost(true)}>{t(confirmPost ? "Confirm posting" : "Post journal")}</Button>}</> : canPost && journal.mirror_status !== "not_required" && journal.mirror_status !== "synced" ? <Button onClick={() => void action("retry")}>{t("Retry delivery")}</Button> : null}</DialogFooter></>}
    </DialogContent></Dialog>
  </>
}
