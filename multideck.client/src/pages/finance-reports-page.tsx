import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertCircle, ChartNoAxesCombined, LoaderCircle, RefreshCw } from "@/components/icons/hugeicons"
import { SettingsPageHeader, SettingsPanel } from "@/components/multideck/settings-components"
import { StatusPill } from "@/components/multideck/status-pill"
import { TabsRail } from "@/components/multideck/workflow-components"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useLanguage } from "@/i18n/language-provider"
import { getFinanceReportOptions, getFinanceReports, type FinanceReportOptions, type FinanceReportingSnapshot } from "@/lib/finance-subledger-api"

type ReportTab = "profit-loss" | "balance-sheet" | "trial-balance"

const today = () => new Date().toISOString().slice(0, 10)
const yearStart = () => `${new Date().getFullYear()}-01-01`

function ReportNotice({ danger = false, children }: { danger?: boolean; children: React.ReactNode }) {
  return <div role={danger ? "alert" : "status"} className={`grid grid-cols-[auto_1fr] gap-3 rounded-[var(--md-radius-lg)] p-4 text-[13px] leading-5 shadow-[var(--md-shadow-line)] ${danger ? "bg-[color-mix(in_srgb,var(--md-red),transparent_90%)] text-[var(--md-red)]" : "bg-[var(--md-surface-soft)] text-[var(--md-text)]"}`}><AlertCircle className="mt-0.5 size-4" strokeWidth={1.4} />{children}</div>
}

export function FinanceReportsPage({ navigate }: { navigate: (path: string) => void }) {
  const { t } = useLanguage()
  const [options, setOptions] = useState<FinanceReportOptions | null>(null)
  const [legalEntityId, setLegalEntityId] = useState("")
  const [fromDate, setFromDate] = useState(yearStart())
  const [toDate, setToDate] = useState(today())
  const [snapshot, setSnapshot] = useState<FinanceReportingSnapshot | null>(null)
  const [activeTab, setActiveTab] = useState<ReportTab>("profit-loss")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadReport = useCallback(async (entityId: string, from: string, to: string) => {
    if (!entityId) return
    if (from > to) { setError(t("The report start date must be on or before the end date.")); return }
    setLoading(true); setError(null)
    try { setSnapshot(await getFinanceReports(entityId, from, to)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : t("The financial report could not be prepared.")) }
    finally { setLoading(false) }
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
    return () => { active = false }
  }, [loadReport, t])

  const amount = useMemo(() => new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: snapshot?.currency && /^[A-Z]{3}$/.test(snapshot.currency) ? snapshot.currency : "GBP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }), [snapshot?.currency])
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
          <div className="space-y-2"><label htmlFor="report-entity" className="text-[12px] font-medium text-[var(--md-text)]">{t("Legal entity")}</label><Select value={legalEntityId} onValueChange={setLegalEntityId}><SelectTrigger id="report-entity"><SelectValue placeholder={t("Choose legal entity")} /></SelectTrigger><SelectContent>{(options?.legalEntities ?? []).map((entity) => <SelectItem key={entity.LegalEntity_ID} value={entity.LegalEntity_ID}>{entity.LegalEntity_Name}</SelectItem>)}</SelectContent></Select></div>
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
        {activeTab === "profit-loss" ? <StatementTable title={t("Profit & loss")} description={t("Income less direct costs, operating expenses and finance items for the selected period.")} rows={snapshot.profitAndLoss.map((row) => ({ id: row.accountId, code: row.accountCode, name: row.accountName, category: row.category, amount: row.amount }))} totalLabel={t("Profit or loss")} total={snapshot.totals.profitOrLoss} formatAmount={formatAmount} t={t} /> : null}
        {activeTab === "balance-sheet" ? <StatementTable title={t("Balance sheet")} description={t("Assets, liabilities and equity at the reporting date, including cumulative current earnings.")} rows={[...snapshot.balanceSheet.map((row) => ({ id: row.accountId, code: row.accountCode, name: row.accountName, category: row.category, amount: row.amount })), { id: "current-earnings", code: "", name: t("Current earnings"), category: "equity", amount: snapshot.totals.currentEarnings }]} totalLabel={t("Balance difference")} total={snapshot.totals.balanceDifference} formatAmount={formatAmount} t={t} /> : null}
        {activeTab === "trial-balance" ? <TrialBalanceTable snapshot={snapshot} formatAmount={formatAmount} t={t} /> : null}
      </> : loading ? <div className="grid min-h-64 place-items-center"><LoaderCircle className="size-5 animate-spin text-[var(--md-accent)]" /></div> : null}
    </div>
  </>
}

function ReportMetric({ label, value }: { label: string; value: string }) {
  return <div className="px-5 py-4"><p className="text-[11px] text-[var(--md-subtle)]">{label}</p><p className="mt-1 text-[17px] font-medium text-[var(--md-ink)]" data-i18n-skip dir="ltr">{value}</p></div>
}

function StatementTable({ title, description, rows, totalLabel, total, formatAmount, t }: { title: string; description: string; rows: Array<{ id: string; code: string; name: string; category: string; amount: number }>; totalLabel: string; total: number; formatAmount: (value: number) => string; t: (value: string) => string }) {
  return <SettingsPanel title={title} description={description}><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-[13px]"><thead><tr className="text-[11px] text-[var(--md-subtle)]"><th className="px-5 py-3 text-start font-medium">{t("Account")}</th><th className="px-5 py-3 text-start font-medium">{t("Category")}</th><th className="px-5 py-3 text-end font-medium">{t("Amount")}</th></tr></thead><tbody className="divide-y divide-[var(--md-line)]">{rows.length ? rows.map((row) => <tr key={row.id}><td className="px-5 py-3 text-[var(--md-ink)]"><span data-i18n-skip dir="ltr">{row.code}</span>{row.code ? " · " : ""}{row.name}</td><td className="px-5 py-3 text-[var(--md-text)]">{t(row.category.replaceAll("_", " "))}</td><td className="px-5 py-3 text-end text-[var(--md-ink)]" data-i18n-skip dir="ltr">{formatAmount(row.amount)}</td></tr>) : <tr><td colSpan={3} className="px-5 py-10 text-center text-[var(--md-subtle)]">{t("No posted ledger activity in this period.")}</td></tr>}</tbody><tfoot><tr className="font-medium text-[var(--md-ink)]"><td colSpan={2} className="px-5 py-4">{totalLabel}</td><td className="px-5 py-4 text-end" data-i18n-skip dir="ltr">{formatAmount(total)}</td></tr></tfoot></table></div></SettingsPanel>
}

function TrialBalanceTable({ snapshot, formatAmount, t }: { snapshot: FinanceReportingSnapshot; formatAmount: (value: number) => string; t: (value: string) => string }) {
  const debitTotal = snapshot.trialBalance.reduce((sum, row) => sum + Number(row.debit), 0)
  const creditTotal = snapshot.trialBalance.reduce((sum, row) => sum + Number(row.credit), 0)
  return <SettingsPanel title={t("Trial balance")} description={t("Opening and period movements for every active nominal account with activity.")}><div className="overflow-x-auto"><table className="w-full min-w-[940px] text-[13px]"><thead><tr className="text-[11px] text-[var(--md-subtle)]"><th className="px-5 py-3 text-start font-medium">{t("Account")}</th><th className="px-5 py-3 text-start font-medium">{t("Category")}</th><th className="px-5 py-3 text-end font-medium">{t("Opening")}</th><th className="px-5 py-3 text-end font-medium">{t("Debit")}</th><th className="px-5 py-3 text-end font-medium">{t("Credit")}</th><th className="px-5 py-3 text-end font-medium">{t("Closing")}</th></tr></thead><tbody className="divide-y divide-[var(--md-line)]">{snapshot.trialBalance.length ? snapshot.trialBalance.map((row) => <tr key={row.accountId}><td className="px-5 py-3 text-[var(--md-ink)]"><span data-i18n-skip dir="ltr">{row.accountCode}</span> · {row.accountName}</td><td className="px-5 py-3 text-[var(--md-text)]">{t(row.category.replaceAll("_", " "))}</td>{[row.openingBalance, row.debit, row.credit, row.closingBalance].map((value, index) => <td key={index} className="px-5 py-3 text-end text-[var(--md-ink)]" data-i18n-skip dir="ltr">{formatAmount(value)}</td>)}</tr>) : <tr><td colSpan={6} className="px-5 py-10 text-center text-[var(--md-subtle)]">{t("No posted ledger activity in this period.")}</td></tr>}</tbody><tfoot><tr className="font-medium text-[var(--md-ink)]"><td colSpan={3} className="px-5 py-4">{t("Period totals")}</td><td className="px-5 py-4 text-end" data-i18n-skip dir="ltr">{formatAmount(debitTotal)}</td><td className="px-5 py-4 text-end" data-i18n-skip dir="ltr">{formatAmount(creditTotal)}</td><td className="px-5 py-4" /></tr></tfoot></table></div></SettingsPanel>
}
