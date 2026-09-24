import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AlertCircle, ChartNoAxesCombined, LoaderCircle, RefreshCw } from "@/components/icons/hugeicons"
import { SettingsPageHeader, SettingsPanel } from "@/components/multideck/settings-components"
import { StatusPill } from "@/components/multideck/status-pill"
import { TabsRail } from "@/components/multideck/workflow-components"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useLanguage } from "@/i18n/language-provider"
import { getFinanceReportOptions, getFinanceReports, type FinanceReportOptions, type FinanceReportingSnapshot } from "@/lib/finance-subledger-api"
import { getNominalStructure, type NominalStructure } from "@/lib/finance-ledger-api"
import { groupProfitLoss, type GroupedProfitLoss } from "@/lib/nominal-report-groups"

type ReportTab = "profit-loss" | "balance-sheet" | "trial-balance"

const today = () => new Date().toISOString().slice(0, 10)
const yearStart = () => `${new Date().getFullYear()}-01-01`

function ReportNotice({ danger = false, children }: { danger?: boolean; children: React.ReactNode }) {
  return <div role={danger ? "alert" : "status"} className={`grid grid-cols-[auto_1fr] gap-3 rounded-[var(--md-radius-lg)] p-4 text-[13px] leading-5 shadow-[var(--md-shadow-line)] ${danger ? "bg-[color-mix(in_srgb,var(--md-red),transparent_90%)] text-[var(--md-red)]" : "bg-[var(--md-surface-soft)] text-[var(--md-text)]"}`}><AlertCircle className="mt-0.5 size-4" strokeWidth={1.4} />{children}</div>
}

export function FinanceReportsPage({ navigate }: { navigate: (path: string) => void }) {
  const { t, language } = useLanguage()
  const [options, setOptions] = useState<FinanceReportOptions | null>(null)
  const [legalEntityId, setLegalEntityId] = useState("")
  const [fromDate, setFromDate] = useState(yearStart())
  const [toDate, setToDate] = useState(today())
  const [snapshot, setSnapshot] = useState<FinanceReportingSnapshot | null>(null)
  const [activeTab, setActiveTab] = useState<ReportTab>("profit-loss")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [structure, setStructure] = useState<NominalStructure | null>(null)
  const [structureError, setStructureError] = useState("")
  const request = useRef(0)
  const clearReport = () => {
    request.current++; setSnapshot(null); setStructure(null); setStructureError(""); setError(null); setLoading(false)
  }

  const loadReport = useCallback(async (entityId: string, from: string, to: string) => {
    if (!entityId) return
    if (!from || !to || from > to) { setError(t("Choose a valid report date range.")); return }
    const version = ++request.current
    setLoading(true); setError(null)
    try {
      const [report, nominal] = await Promise.allSettled([getFinanceReports(entityId, from, to), getNominalStructure(entityId)])
      if (version !== request.current) return
      if (report.status === "rejected") throw report.reason
      if (report.value.legalEntityId !== entityId) throw new Error("The report does not match the selected legal entity.")
      setSnapshot(report.value)
      setStructure(nominal.status === "fulfilled" ? nominal.value : null)
      setStructureError(nominal.status === "rejected" ? (nominal.reason instanceof Error ? nominal.reason.message : "Nominal groups could not be loaded.") : "")
    }
    catch (cause) { if (version === request.current) { setSnapshot(null); setStructure(null); setError(cause instanceof Error ? cause.message : t("The financial report could not be prepared.")) } }
    finally { if (version === request.current) setLoading(false) }
  }, [t])

  useEffect(() => {
    let active = true
    void getFinanceReportOptions().then((result) => {
      if (!active) return
      setOptions(result)
      const firstEntityId = result.legalEntities[0]?.LegalEntity_ID ?? ""
      setLegalEntityId(firstEntityId)
      if (firstEntityId) void loadReport(firstEntityId, yearStart(), today())
      else setLoading(false)
    }).catch((cause) => {
      if (!active) return
      setError(cause instanceof Error ? cause.message : t("Finance report options could not be loaded."))
      setLoading(false)
    })
    return () => { active = false; request.current++ }
  }, [loadReport, t])

  const grouped = useMemo(() => {
    if (!snapshot || !structure) return { data: null, error: structureError }
    try { return { data: groupProfitLoss(snapshot.legalEntityId, snapshot.profitAndLoss, structure.groups, structure.members, snapshot.totals.profitOrLoss), error: "" } }
    catch (cause) { return { data: null, error: cause instanceof Error ? cause.message : "Nominal groups could not be reconciled." } }
  }, [snapshot, structure, structureError])
  const amount = useMemo(() => new Intl.NumberFormat(language, {
    style: "currency",
    currency: snapshot?.currency && /^[A-Z]{3}$/.test(snapshot.currency) ? snapshot.currency : "GBP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }), [snapshot?.currency, language])
  const formatAmount = (value: number) => amount.format(Number(value || 0))
  const pendingMigrations = Number(snapshot?.coverage.pendingDocumentMigrations ?? 0) + Number(snapshot?.coverage.pendingCashMigrations ?? 0)
  const balanced = Math.abs(Number(snapshot?.totals.balanceDifference ?? 0)) <= 0.01

  return <>
    <SettingsPageHeader
      title={t("Financial reports")}
      description={t("Profit and loss, balance sheet and trial balance from Multideck’s canonical double-entry ledger. Any external accounting mirror must reconcile to these figures.")}
      descriptionPlacement="under-title"
      icon={ChartNoAxesCombined}
      actions={<Button type="button" variant="outline" onClick={() => navigate("/finance/administration")}>{t("Finance administration")}</Button>}
    />
    <div className="mt-[var(--md-page-stack-gap)] space-y-[var(--md-page-stack-gap)]">
      {error ? <ReportNotice danger>{t(error)}</ReportNotice> : null}
      <SettingsPanel title={t("Reporting period")} description={t("Reports use complete accounting months and the legal entity’s base currency.")}>
        <div className="grid gap-4 px-5 py-4 md:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_180px_180px_auto] xl:items-end">
          <div className="space-y-2"><label htmlFor="report-entity" className="text-[12px] font-medium text-[var(--md-text)]">{t("Legal entity")}</label><Select value={legalEntityId} onValueChange={value => { clearReport(); setLegalEntityId(value) }}><SelectTrigger id="report-entity"><SelectValue placeholder={t("Choose legal entity")} /></SelectTrigger><SelectContent>{(options?.legalEntities ?? []).map((entity) => <SelectItem key={entity.LegalEntity_ID} value={entity.LegalEntity_ID}>{entity.LegalEntity_Name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><label htmlFor="report-from" className="text-[12px] font-medium text-[var(--md-text)]">{t("From")}</label><Input id="report-from" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} data-i18n-skip dir="ltr" /></div>
          <div className="space-y-2"><label htmlFor="report-to" className="text-[12px] font-medium text-[var(--md-text)]">{t("To")}</label><Input id="report-to" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} data-i18n-skip dir="ltr" /></div>
          <Button type="button" disabled={loading || !legalEntityId} onClick={() => void loadReport(legalEntityId, fromDate, toDate)}>{loading ? <LoaderCircle className="animate-spin" /> : <RefreshCw className="size-4" />}{t("Run report")}</Button>
        </div>
      </SettingsPanel>

      {snapshot ? <>
        <SettingsPanel title={snapshot.legalEntity} description={`${snapshot.fromDate} – ${snapshot.toDate} · ${snapshot.currency}`}>
          <div className="grid divide-y divide-[var(--md-line)] sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4 rtl:sm:divide-x-reverse">
            <ReportMetric label={t("Profit or loss")} value={formatAmount(snapshot.totals.profitOrLoss)} />
            <ReportMetric label={t("Assets")} value={formatAmount(snapshot.totals.assets)} />
            <ReportMetric label={t("Liabilities & equity")} value={formatAmount(snapshot.totals.liabilities + snapshot.totals.equity + snapshot.totals.currentEarnings)} />
            <div className="px-5 py-4"><p className="text-[11px] text-[var(--md-subtle)]">{t("External mirror")}</p><div className="mt-2"><StatusPill tone={snapshot.externalMirrorConnected ? "teal" : snapshot.externalMirrorModeCode === "required" ? "red" : "neutral"}>{t(snapshot.externalMirrorConnected ? "Connected" : snapshot.externalMirrorModeCode)}</StatusPill></div></div>
          </div>
        </SettingsPanel>
        {pendingMigrations > 0 ? <ReportNotice><div><p className="font-medium">{t("Historical migration is incomplete")}</p><p className="mt-1">{t(`${pendingMigrations} approved historical records are preserved but not yet represented in this native-ledger report. Complete a controlled opening-balance migration before relying on comparative totals.`)}</p></div></ReportNotice> : null}
        {!balanced ? <ReportNotice danger><div><p className="font-medium">{t("Balance sheet does not balance")}</p><p className="mt-1">{t("The difference is")} <span data-i18n-skip dir="ltr">{formatAmount(snapshot.totals.balanceDifference)}</span>. {t("Review nominal categories and opening balances before using this report.")}</p></div></ReportNotice> : null}
        <TabsRail tabs={[{ id: "profit-loss", label: t("Profit & loss") }, { id: "balance-sheet", label: t("Balance sheet") }, { id: "trial-balance", label: t("Trial balance") }]} activeTab={activeTab} onChange={(value) => setActiveTab(value as ReportTab)} />
        {activeTab === "profit-loss" ? <>
          {grouped.error && <ReportNotice danger><div><p>{t("Grouped breakdown unavailable. The account-level ledger report remains below.")}</p><p className="mt-1">{t(grouped.error)}</p></div></ReportNotice>}
          {grouped.data && structure?.groups.length ? <GroupedProfitLossTable data={grouped.data} formatAmount={formatAmount} t={t} /> : <StatementTable title={t("Profit & loss")} description={t("Income less direct costs, operating expenses and finance items for the selected period.")} rows={snapshot.profitAndLoss.map((row) => ({ id: row.accountId, code: row.accountCode, name: row.accountName, category: row.category, amount: row.amount }))} totalLabel={t("Profit or loss")} total={snapshot.totals.profitOrLoss} formatAmount={formatAmount} t={t} />}
        </> : null}
        {activeTab === "balance-sheet" ? <StatementTable title={t("Balance sheet")} description={t("Assets, liabilities and equity at the reporting date, including cumulative current earnings.")} rows={[...snapshot.balanceSheet.map((row) => ({ id: row.accountId, code: row.accountCode, name: row.accountName, category: row.category, amount: row.amount })), { id: "current-earnings", code: "", name: t("Current earnings"), category: "equity", amount: snapshot.totals.currentEarnings }]} totalLabel={t("Balance difference")} total={snapshot.totals.balanceDifference} formatAmount={formatAmount} t={t} /> : null}
        {activeTab === "trial-balance" ? <TrialBalanceTable snapshot={snapshot} formatAmount={formatAmount} t={t} /> : null}
      </> : loading ? <div className="grid min-h-64 place-items-center"><LoaderCircle className="size-5 animate-spin text-[var(--md-accent)]" /></div> : null}
    </div>
  </>
}

function ReportMetric({ label, value }: { label: string; value: string }) {
  return <div className="px-5 py-4"><p className="text-[11px] text-[var(--md-subtle)]">{label}</p><p className="mt-1 text-[17px] font-medium text-[var(--md-ink)]" data-i18n-skip dir="ltr">{value}</p></div>
}

function GroupedProfitLossTable({ data, formatAmount, t }: { data: GroupedProfitLoss; formatAmount: (value: number) => string; t: (value: string) => string }) {
  const cell = "px-5 py-3 text-end tabular-nums align-top"
  return <SettingsPanel title={t("Profit & loss by nominal group")} description={t("Actual and accrued account movements for the selected period. Income contributes positively; costs contribute negatively. Group headers are subtotals, not additional postings.")}>
    <p className="px-5 py-3 text-xs text-[var(--md-text)]">{t("Accrued movement is not the outstanding accrual at the reporting date. Use job costing for actual plus outstanding accrued equals expected. Accounts outside a group remain separately visible and are included once in profit or loss.")}</p>
    <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-[13px]">
      <thead><tr className="text-[11px] text-[var(--md-subtle)]">{["Group / account", "Actual", "Accrued movement", "Period total"].map((label, index) => <th key={label} scope="col" className={`px-5 py-3 font-medium ${index ? "text-end" : "text-start"}`}>{t(label)}</th>)}</tr></thead>
      <tbody className="divide-y divide-[var(--md-line)]">
        {data.groups.map(group => <tr key={group.id}>
          <th scope="row" className="px-5 py-3 text-start font-medium align-top"><details><summary className="cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-[var(--md-accent)]"><span data-i18n-skip>{group.code} · {group.name}</span></summary>
            <ul className="mt-3 space-y-2 text-xs font-normal text-[var(--md-text)]">{group.accounts.map(account => <li key={account.accountId}><span data-i18n-skip>{account.accountCode} · {account.accountName}</span><span className="block">{t(account.role === "actual" ? "Actual" : "Accrued movement")} · <span data-i18n-skip>{formatAmount(account.amount)}</span></span></li>)}</ul>
          </details></th>
          <td className={cell} data-i18n-skip>{formatAmount(group.actual)}</td><td className={cell} data-i18n-skip>{formatAmount(group.accrued)}</td><td className={`${cell} font-medium`} data-i18n-skip>{formatAmount(group.total)}</td>
        </tr>)}
        {data.ungrouped.length > 0 && <tr><th colSpan={4} scope="colgroup" className="bg-[var(--md-surface-soft)] px-5 py-2 text-start text-xs font-medium">{t("Other / ungrouped accounts")}</th></tr>}
        {data.ungrouped.map(account => <tr key={account.accountId}><th scope="row" className="px-5 py-3 text-start font-normal"><span data-i18n-skip>{account.accountCode} · {account.accountName}</span><span className="block text-xs text-[var(--md-subtle)]">{t(account.category.replaceAll("_", " "))}</span></th><td className={cell}>—</td><td className={cell}>—</td><td className={cell} data-i18n-skip>{formatAmount(account.amount)}</td></tr>)}
        {!data.groups.length && !data.ungrouped.length && <tr><td colSpan={4} className="px-5 py-10 text-center text-[var(--md-subtle)]">{t("No posted ledger activity in this period.")}</td></tr>}
      </tbody><tfoot><tr className="font-medium"><th scope="row" colSpan={3} className="px-5 py-4 text-start">{t("Profit or loss")}</th><td className={cell} data-i18n-skip>{formatAmount(data.total)}</td></tr></tfoot>
    </table></div>
  </SettingsPanel>
}

function StatementTable({ title, description, rows, totalLabel, total, formatAmount, t }: { title: string; description: string; rows: Array<{ id: string; code: string; name: string; category: string; amount: number }>; totalLabel: string; total: number; formatAmount: (value: number) => string; t: (value: string) => string }) {
  return <SettingsPanel title={title} description={description}><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-[13px]"><thead><tr className="text-[11px] text-[var(--md-subtle)]"><th className="px-5 py-3 text-start font-medium">{t("Account")}</th><th className="px-5 py-3 text-start font-medium">{t("Category")}</th><th className="px-5 py-3 text-end font-medium">{t("Amount")}</th></tr></thead><tbody className="divide-y divide-[var(--md-line)]">{rows.length ? rows.map((row) => <tr key={row.id}><td className="px-5 py-3 text-[var(--md-ink)]"><span data-i18n-skip dir="ltr">{row.code}</span>{row.code ? " · " : ""}{row.name}</td><td className="px-5 py-3 text-[var(--md-text)]">{t(row.category.replaceAll("_", " "))}</td><td className="px-5 py-3 text-end text-[var(--md-ink)]" data-i18n-skip dir="ltr">{formatAmount(row.amount)}</td></tr>) : <tr><td colSpan={3} className="px-5 py-10 text-center text-[var(--md-subtle)]">{t("No posted ledger activity in this period.")}</td></tr>}</tbody><tfoot><tr className="font-medium text-[var(--md-ink)]"><td colSpan={2} className="px-5 py-4">{totalLabel}</td><td className="px-5 py-4 text-end" data-i18n-skip dir="ltr">{formatAmount(total)}</td></tr></tfoot></table></div></SettingsPanel>
}

function TrialBalanceTable({ snapshot, formatAmount, t }: { snapshot: FinanceReportingSnapshot; formatAmount: (value: number) => string; t: (value: string) => string }) {
  const debitTotal = snapshot.trialBalance.reduce((sum, row) => sum + Number(row.debit), 0)
  const creditTotal = snapshot.trialBalance.reduce((sum, row) => sum + Number(row.credit), 0)
  return <SettingsPanel title={t("Trial balance")} description={t("Opening and period movements for every active nominal account with activity.")}><div className="overflow-x-auto"><table className="w-full min-w-[940px] text-[13px]"><thead><tr className="text-[11px] text-[var(--md-subtle)]"><th className="px-5 py-3 text-start font-medium">{t("Account")}</th><th className="px-5 py-3 text-start font-medium">{t("Category")}</th><th className="px-5 py-3 text-end font-medium">{t("Opening")}</th><th className="px-5 py-3 text-end font-medium">{t("Debit")}</th><th className="px-5 py-3 text-end font-medium">{t("Credit")}</th><th className="px-5 py-3 text-end font-medium">{t("Closing")}</th></tr></thead><tbody className="divide-y divide-[var(--md-line)]">{snapshot.trialBalance.length ? snapshot.trialBalance.map((row) => <tr key={row.accountId}><td className="px-5 py-3 text-[var(--md-ink)]"><span data-i18n-skip dir="ltr">{row.accountCode}</span> · {row.accountName}</td><td className="px-5 py-3 text-[var(--md-text)]">{t(row.category.replaceAll("_", " "))}</td>{[row.openingBalance, row.debit, row.credit, row.closingBalance].map((value, index) => <td key={index} className="px-5 py-3 text-end text-[var(--md-ink)]" data-i18n-skip dir="ltr">{formatAmount(value)}</td>)}</tr>) : <tr><td colSpan={6} className="px-5 py-10 text-center text-[var(--md-subtle)]">{t("No posted ledger activity in this period.")}</td></tr>}</tbody><tfoot><tr className="font-medium text-[var(--md-ink)]"><td colSpan={3} className="px-5 py-4">{t("Period totals")}</td><td className="px-5 py-4 text-end" data-i18n-skip dir="ltr">{formatAmount(debitTotal)}</td><td className="px-5 py-4 text-end" data-i18n-skip dir="ltr">{formatAmount(creditTotal)}</td><td className="px-5 py-4" /></tr></tfoot></table></div></SettingsPanel>
}
