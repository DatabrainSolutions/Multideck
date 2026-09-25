import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Calculator, Check, LoaderCircle, Pencil, RefreshCw, RotateCcw, Send, ShieldCheck } from "@/components/icons/hugeicons"
import { KpiStrip } from "@/components/multideck/dashboard-kpi-strip"
import { SettingsPageHeader, SettingsPanel } from "@/components/multideck/settings-components"
import { StatusPill } from "@/components/multideck/status-pill"
import { DataTable, type DataTableColumn } from "@/components/multideck/data-table"
import { DotGridLoader } from "@/components/multideck/dot-grid-loader"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useLanguage } from "@/i18n/language-provider"
import { hasPermission, type AuthUserSummary } from "@/lib/auth-user"
import {
  approveAccrualWipRun,
  assignJobManagementPeriod,
  createAccrualWipRun,
  FinanceAccrualsApiError,
  getFinanceAccrualWorkspace,
  getFinanceManagementEntities,
  getFinanceCostReview,
  getCostControls, getChargeCostControls, updateCostControls,
  getAccountingClose, prepareAccountingClose, closeAccountingPeriod, getChargeLifecycleQueue,
  getAccountingVatControl, updateAccountingVatControl,
  recheckChargeLifecycleCase,
  getChargeCaseResolution, updateChargeCaseResolution,
  getRecognitionControls, updateRecognitionControls,
  getChargeCorrection, updateChargeCorrection,
  type AccountingCloseSnapshot, type AccountingCloseReview, type ChargeLifecycleCase,
  type AccountingVatControl,
  type ChargeCaseResolution,
  type RecognitionControls,
  type ChargeCorrectionControls as ChargeCorrectionState,
  type CostControls, type ChargeCostControls,
  type CostReview,
  type CostReviewRow,
  postAccrualWipRun,
  rejectAccrualWipRun,
  requestAccrualWipReview,
  reverseAccrualWipRun,
  updateAccrualWipItem,
  type FinanceAccrualWorkspace,
  type ManagementRun,
  type ManagementRunItem,
} from "@/lib/finance-accruals-api"
import { subscribeTopBarAction, topBarActionEvents } from "@/lib/top-bar-action-events"
import { toast } from "sonner"

type LegalEntity = { LegalEntity_ID: string; LegalEntity_Name: string; LegalEntity_BaseCurrencyCodeSnapshot: string | null }
type DialogState = "review" | "assign" | "item" | "reject" | "reverse" | null

const currentPeriod = () => new Date().toISOString().slice(0, 7).replace("-", "")
const entitySessionKey = "multideck.finance.daily.entity"
const rememberedEntity = () => { try { return window.sessionStorage.getItem(entitySessionKey) } catch { return null } }
const rememberEntity = (id: string) => { try { window.sessionStorage.setItem(entitySessionKey, id) } catch { /* Keep the page selection usable. */ } }
const validPeriod = (value: string) => /^\d{4}(0[1-9]|1[0-2])$/.test(value)
const periodLabel = (value: string, language: string) => {
  if (!validPeriod(value)) return value
  return new Intl.DateTimeFormat(language, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(Number(value.slice(0, 4)), Number(value.slice(4, 6)) - 1, 1)))
}
const tone = (status: string): "teal" | "amber" | "red" | "neutral" => status === "posted" || status === "reversed" || status === "approved" ? "teal" : status === "rejected" ? "red" : status === "draft" ? "neutral" : "amber"

export function FinanceAccrualWipPage({ currentUser }: { currentUser?: AuthUserSummary | null }) {
  const { language, t } = useLanguage()
  const [entities, setEntities] = useState<LegalEntity[]>([])
  const [entityId, setEntityId] = useState("")
  const [period, setPeriod] = useState(currentPeriod())
  const [workspace, setWorkspace] = useState<FinanceAccrualWorkspace | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [dialog, setDialog] = useState<DialogState>(null)
  const [activeItem, setActiveItem] = useState<ManagementRunItem | null>(null)
  const [activeRun, setActiveRun] = useState<ManagementRun | null>(null)
  const [reason, setReason] = useState("")
  const [assignJobId, setAssignJobId] = useState("")
  const [assignJobReference, setAssignJobReference] = useState("")
  const [wip, setWip] = useState("0")
  const [accrual, setAccrual] = useState("0")
  const [reversalPeriod, setReversalPeriod] = useState("")
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const request = useRef(0)
  const canPrepare = hasPermission(currentUser, "Finance.Management.Prepare")
  const canApprove = hasPermission(currentUser, "Finance.Management.Approve")
  const canPost = hasPermission(currentUser, "Finance.Management.Post")

  const loadEntities = useCallback(async () => {
    const result = await getFinanceManagementEntities()
    setEntities(result.legalEntities)
    setEntityId((current) => {
      const saved = rememberedEntity()
      return result.legalEntities.some((entity) => entity.LegalEntity_ID === current) ? current
        : result.legalEntities.some((entity) => entity.LegalEntity_ID === saved) ? saved || ""
        : result.legalEntities[0]?.LegalEntity_ID || ""
    })
  }, [])
  const load = useCallback(async (nextEntity = entityId, nextPeriod = period) => {
    const version = ++request.current
    setError(null); setWorkspace(null); setSelected(new Set()); setActiveRun(null)
    if (!nextEntity || !validPeriod(nextPeriod)) { setLoading(false); return }
    setLoading(true)
    try {
      const result = await getFinanceAccrualWorkspace(nextEntity, nextPeriod)
      if (version !== request.current) return
      if (result.entity.LegalEntity_ID !== nextEntity) throw new Error("The WIP workspace does not match the selected legal entity.")
      setWorkspace(result)
      setSelected(new Set(result.candidates.filter((job) => job.needsReview).map((job) => job.jobId)))
      setActiveRun(result.runs.find((run) => run.FINPeriod?.FINPeriod_Code === nextPeriod) ?? result.runs[0] ?? null)
    } catch (cause) {
      if (version === request.current) setError(cause instanceof Error ? cause.message : t("The management accounting workspace could not be loaded."))
    } finally { if (version === request.current) setLoading(false) }
  }, [entityId, period, t])

  useEffect(() => { void loadEntities().catch((cause) => { setError(cause instanceof Error ? cause.message : t("Legal entities could not be loaded.")); setLoading(false) }) }, [loadEntities, t])
  useEffect(() => { if (entityId) void load(entityId, period) }, [entityId, period, load])
  useEffect(() => subscribeTopBarAction(topBarActionEvents.prepareAccrualWipReview, () => { setReason(""); setDialog("review") }), [])

  const currency = workspace?.entity.LegalEntity_BaseCurrencyCodeSnapshot || "GBP"
  const money = useCallback((value: number) => new Intl.NumberFormat(language, { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value || 0)), [currency, language])
  const totals = useMemo(() => workspace?.candidates.reduce((sum, job) => ({ wip: sum.wip + job.proposedWip, accrual: sum.accrual + job.proposedAccrual, outside: sum.outside + Math.abs(job.outsidePeriodRevenue) + Math.abs(job.outsidePeriodCost), margin: sum.margin + job.adjustedMargin }), { wip: 0, accrual: 0, outside: 0, margin: 0 }) ?? { wip: 0, accrual: 0, outside: 0, margin: 0 }, [workspace])
  const visibleRun = activeRun && workspace?.runs.some((run) => run.FINCloseRun_ID === activeRun.FINCloseRun_ID) ? workspace.runs.find((run) => run.FINCloseRun_ID === activeRun.FINCloseRun_ID) ?? null : null

  const refresh = async () => { await load(entityId, period) }
  const selectEntity = (next: string) => {
    if (!entities.some((entity) => entity.LegalEntity_ID === next)) return
    request.current++; setWorkspace(null); setSelected(new Set()); setActiveRun(null); setDialog(null)
    setEntityId(next); rememberEntity(next)
  }
  const perform = async (task: () => Promise<unknown>, success: string) => {
    setBusy(true)
    try { await task(); toast.success(t(success)); setDialog(null); setReason(""); await refresh() }
    catch (cause) { toast.error(cause instanceof FinanceAccrualsApiError || cause instanceof Error ? cause.message : t("The finance action could not be completed.")) }
    finally { setBusy(false) }
  }
  const openItem = (item: ManagementRunItem) => { setActiveItem(item); setWip(String(item.FINCloseItem_ProposedWIP ?? 0)); setAccrual(String(item.FINCloseItem_ProposedAccrual ?? 0)); setReason(item.FINCloseItem_ReviewerNote ?? ""); setDialog("item") }
  const openAssign = () => { setAssignJobId(""); setAssignJobReference(""); setReason(""); setDialog("assign") }
  const nextPeriodCode = (code: string) => { const date = new Date(Date.UTC(Number(code.slice(0, 4)), Number(code.slice(4, 6)), 1)); return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}` }
  const matchingAssignableJobs = workspace?.assignableJobs.filter((job) =>
    `${job.periodCode}-${job.jobNumber}`.toLowerCase() === assignJobReference.trim().toLowerCase()) ?? []
  const selectedAssignableJob = matchingAssignableJobs.find((job) => job.jobId === assignJobId)

  const selectionAll = workspace?.candidates.length && selected.size === workspace.candidates.length
  return <>
    <SettingsPageHeader
      title={t("Accruals & WIP")}
      description={t("Allocate every job to its management period, approve the correcting journals, then let posted AR and AP invoices progressively reverse the related WIP and accrual with full evidence.")}
      icon={Calculator}
      actions={<Button type="button" variant="outline" disabled={loading} onClick={() => void refresh()}><RefreshCw className={loading ? "animate-spin" : ""} />{t("Refresh")}</Button>}
    />
    <div className="mt-[var(--md-page-stack-gap)] space-y-[var(--md-page-stack-gap)]">
      {error ? <div role="alert" className="rounded-[var(--md-radius-lg)] bg-[color-mix(in_srgb,var(--md-red),transparent_90%)] p-4 text-[13px] text-[var(--md-red)]">{error}</div> : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1fr)_220px_auto] lg:items-end">
        <label className="space-y-1.5 text-[12px] font-medium text-[var(--md-text)]"><span>{t("Legal entity")}</span><Select value={entityId} onValueChange={selectEntity} disabled={busy}><SelectTrigger><SelectValue placeholder={t("Choose legal entity")} /></SelectTrigger><SelectContent>{entities.map((entity) => <SelectItem key={entity.LegalEntity_ID} value={entity.LegalEntity_ID}>{entity.LegalEntity_Name}</SelectItem>)}</SelectContent></Select></label>
        <label className="space-y-1.5 text-[12px] font-medium text-[var(--md-text)]"><span>{t("Management period")}</span><Input value={period} inputMode="numeric" maxLength={6} onChange={(event) => setPeriod(event.target.value.replace(/\D/g, "").slice(0, 6))} data-i18n-skip dir="ltr" /></label>
        <p className="pb-2 text-[12px] text-[var(--md-subtle)]">{periodLabel(period, language)}</p>
      </div>
      <div className="md-kpi-scope"><KpiStrip columns={6} density="compact" spark={false} kpis={[
        { label: t("Jobs in period"), value: String(workspace?.candidates.length ?? 0), detail: t("Assigned operational jobs"), tone: "teal" as const },
        { label: t("Revenue WIP"), value: money(totals.wip), detail: t("Revenue required in this period"), tone: "blue" as const },
        { label: t("Cost accrual"), value: money(totals.accrual), detail: t("Costs required in this period"), tone: "amber" as const },
        { label: t("Outside-period activity"), value: money(totals.outside), detail: t("Documents posted in other periods"), tone: "red" as const },
        { label: t("Adjusted margin"), value: money(totals.margin), detail: t("After proposed corrections"), tone: "teal" as const },
      ]} /></div>
      {entityId ? <CostReviewPanel key={entityId} entityId={entityId} /> : null}
      {entityId && workspace?.periods.find((item) => item.FINPeriod_Code === period) ? <AccountingClosePanel
        entityId={entityId} periodId={workspace.periods.find((item) => item.FINPeriod_Code === period)!.FINPeriod_ID}
        currency={currency} canPrepare={canPrepare} canApprove={canApprove && canPost} onChanged={refresh} /> : null}
      <SettingsPanel title={t("Job period control")} description={t("Only jobs assigned to this legal entity enter its WIP review. The assigned period drives management reporting; reassignment is audited and does not change operational dates or statutory accounting dates.")}>
        <div className="flex flex-wrap items-center justify-between gap-3 py-1"><p className="text-[13px] text-[var(--md-text)]">{t("Jobs assigned to this entity")}: <span className="font-medium text-[var(--md-ink)]" data-i18n-skip dir="ltr">{workspace?.assignableJobs.filter((job) => job.legalEntityId === entityId).length ?? 0}</span></p>{canPrepare ? <Button type="button" size="sm" variant="outline" disabled={!workspace || busy} onClick={openAssign}><Pencil />{t("Assign job period")}</Button> : null}</div>
      </SettingsPanel>
      <SettingsPanel title={t("Period calculation")} description={t("Expected job costing is compared with approved and submitted finance documents. Outside-period postings remain visible as evidence; proposed WIP and accrual bring the assigned period to the expected position.")}>
        {loading ? <div className="grid min-h-44 place-items-center"><LoaderCircle className="size-5 animate-spin text-[var(--md-accent)]" /></div> : !workspace?.candidates.length ? <div className="grid min-h-32 place-items-center text-center text-[13px] text-[var(--md-subtle)]">{t("No jobs are assigned to this management period.")}</div> : <div className="overflow-x-auto"><table className="w-full min-w-[1260px] border-collapse text-[12px]"><thead><tr className="border-b border-[var(--md-line)] bg-[var(--md-surface-soft)] text-[var(--md-subtle)]"><th className="w-11 p-2 text-center"><Checkbox aria-label={t("Select all jobs")} checked={Boolean(selectionAll)} onCheckedChange={(checked) => setSelected(checked ? new Set(workspace.candidates.map((job) => job.jobId)) : new Set())} /></th>{["Job", "Customer", "Expected revenue", "Expected cost", "Period revenue", "Period cost", "Outside revenue", "Outside cost", "Revenue WIP", "Cost accrual", "Adjusted margin"].map((label, index) => <th key={label} className={`p-2 font-medium ${index < 2 ? "text-start" : "text-end"}`}>{t(label)}</th>)}</tr></thead><tbody>{workspace.candidates.map((job) => <tr key={job.jobId} className="border-b border-[var(--md-line)] text-[var(--md-text)] last:border-0"><td className="p-2 text-center"><Checkbox aria-label={t("Select job")} checked={selected.has(job.jobId)} onCheckedChange={(checked) => setSelected((current) => { const next = new Set(current); if (checked) next.add(job.jobId); else next.delete(job.jobId); return next })} /></td><td className="p-2"><p className="font-medium text-[var(--md-ink)]" data-i18n-skip dir="ltr">{job.jobReference}</p><p className="mt-0.5 text-[11px] text-[var(--md-subtle)]">{t(job.status)}</p></td><td className="max-w-48 truncate p-2">{job.customerName || "–"}</td>{[job.expectedRevenue, job.expectedCost, job.actualRevenue, job.actualCost, job.outsidePeriodRevenue, job.outsidePeriodCost, job.proposedWip, job.proposedAccrual, job.adjustedMargin].map((value, index) => <td key={index} className={`p-2 text-end tabular-nums ${index === 8 ? "font-medium text-[var(--md-ink)]" : ""}`} data-i18n-skip dir="ltr">{money(value)}</td>)}</tr>)}</tbody></table></div>}
      </SettingsPanel>
      <SettingsPanel title={t("Charge line gross profit")} description={t("Each job charge carries its own revenue and cost nominal codes. Posted invoice values replace WIP or accrual on that same line, keeping recognised gross profit steady; unmatched actuals are shown separately because they genuinely change the result.")}>
        {!workspace?.candidates.some((job) => job.chargeLines.length) ? <p className="py-5 text-center text-[13px] text-[var(--md-subtle)]">{t("No charge lines are available for this period.")}</p> : <div className="overflow-x-auto"><table className="w-full min-w-[1460px] text-[12px]"><thead><tr className="border-b border-[var(--md-line)] bg-[var(--md-surface-soft)] text-[var(--md-subtle)]">{["Job", "Domain", "Charge", "Revenue nominal", "Cost nominal", "Expected revenue", "Expected cost", "Revenue WIP", "Cost accrual", "Actual revenue", "Actual cost", "Recognised revenue", "Recognised cost", "Gross profit"].map((label, index) => <th key={label} className={`p-2 font-medium ${index < 5 ? "text-start" : "text-end"}`}>{t(label)}</th>)}</tr></thead><tbody>{workspace?.candidates.flatMap((job) => job.chargeLines.map((line) => <tr key={`${job.jobId}-${line.jobCostingLineId || line.lineNo}`} className="border-b border-[var(--md-line)] last:border-0"><td className="p-2 font-medium text-[var(--md-ink)]" data-i18n-skip dir="ltr">{job.jobReference}</td><td className="p-2 capitalize text-[var(--md-subtle)]">{t(line.domainCode)}</td><td className="p-2"><span className="font-medium text-[var(--md-ink)]" data-i18n-skip dir="ltr">{line.lineNo} · {line.chargeCode || line.description}</span>{line.chargeCode ? <span className="mt-0.5 block text-[11px] text-[var(--md-subtle)]">{line.description}</span> : null}{line.sourceTable ? <span className="mt-0.5 block text-[10px] text-[var(--md-subtle)]" data-i18n-skip dir="ltr">{line.sourceTable}</span> : null}</td><td className="p-2" data-i18n-skip dir="ltr">{line.revenueNominalCode || "–"}</td><td className="p-2" data-i18n-skip dir="ltr">{line.costNominalCode || "–"}</td>{[line.expectedRevenue,line.expectedCost,line.proposedWip,line.proposedAccrual,line.actualRevenue,line.actualCost,line.recognisedRevenue,line.recognisedCost,line.grossProfit].map((value,index) => <td key={index} className={`p-2 text-end tabular-nums ${index===8 ? "font-medium text-[var(--md-ink)]" : ""}`} data-i18n-skip dir="ltr">{money(value)}</td>)}</tr>))}</tbody></table></div>}
        {workspace?.candidates.some((job) => job.unmatchedActualRevenue !== 0 || job.unmatchedActualCost !== 0) ? <div className="mt-3 border-t border-[var(--md-line)] pt-3 text-[12px] text-[var(--md-red)]">{workspace.candidates.filter((job) => job.unmatchedActualRevenue !== 0 || job.unmatchedActualCost !== 0).map((job) => <p key={job.jobId}><span className="font-medium" data-i18n-skip dir="ltr">{job.jobReference}</span> · {t("Unmatched actual GP movement")}: <span className="tabular-nums" data-i18n-skip dir="ltr">{money(job.unmatchedActualRevenue - job.unmatchedActualCost)}</span></p>)}</div> : null}
      </SettingsPanel>
      <SettingsPanel title={t("Review history")} description={t("Posted AR and AP invoice lines reclassify only the WIP or accrual on their exact job charge line, using net values excluding VAT. Unmatched actuals change gross profit and remain visible for review; any unreleased balance can still be reversed manually.")}>
        {!workspace?.runs.length ? <p className="py-5 text-center text-[13px] text-[var(--md-subtle)]">{t("No accrual and WIP reviews have been prepared yet.")}</p> : <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]"><div className="space-y-1 border-b border-[var(--md-line)] pb-3 xl:border-b-0 xl:border-e xl:pb-0 xl:pe-3">{workspace.runs.map((run) => <button key={run.FINCloseRun_ID} type="button" className={`flex w-full items-center justify-between gap-2 rounded-[var(--md-radius-md)] px-3 py-2 text-start ${visibleRun?.FINCloseRun_ID === run.FINCloseRun_ID ? "bg-[var(--md-accent-a10)]" : "hover:bg-[var(--md-surface-soft)]"}`} onClick={() => setActiveRun(run)}><span><span className="block text-[13px] font-medium text-[var(--md-ink)]" data-i18n-skip dir="ltr">{run.FINPeriod?.FINPeriod_Code}</span><span className="mt-0.5 block text-[11px] text-[var(--md-subtle)]">{new Intl.DateTimeFormat(language, { dateStyle: "medium" }).format(new Date(run.FINCloseRun_StartedAt))}</span></span><StatusPill tone={tone(run.FINCloseRun_StatusCode)}>{t(run.FINCloseRun_StatusCode.replaceAll("_", " "))}</StatusPill></button>)}</div>{visibleRun ? <div className="min-w-0"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><h3 className="text-[14px] font-medium text-[var(--md-ink)]">{t("Period review")} <span data-i18n-skip dir="ltr">{visibleRun.FINPeriod?.FINPeriod_Code}</span></h3><StatusPill tone={tone(visibleRun.FINCloseRun_StatusCode)}>{t(visibleRun.FINCloseRun_StatusCode.replaceAll("_", " "))}</StatusPill></div><p className="mt-1 max-w-[70ch] text-[12px] leading-5 text-[var(--md-subtle)]">{visibleRun.FINCloseRun_Reason}</p></div><div className="flex flex-wrap gap-2">{visibleRun.FINCloseRun_StatusCode === "draft" && canPrepare ? <Button size="sm" onClick={() => void perform(() => requestAccrualWipReview(visibleRun.FINCloseRun_ID), "Review submitted for approval.")}><Send />{t("Request approval")}</Button> : null}{visibleRun.FINCloseRun_StatusCode === "awaiting_approval" && canApprove ? <><Button size="sm" variant="outline" onClick={() => { setReason(""); setDialog("reject") }}><RotateCcw />{t("Reject")}</Button><Button size="sm" onClick={() => void perform(() => approveAccrualWipRun(visibleRun.FINCloseRun_ID), "Accrual and WIP review approved.")}><ShieldCheck />{t("Approve")}</Button></> : null}{visibleRun.FINCloseRun_StatusCode === "approved" && canPost ? <Button size="sm" onClick={() => void perform(() => postAccrualWipRun(visibleRun.FINCloseRun_ID), "Management journal posted.")}><Check />{t("Post journal")}</Button> : null}{visibleRun.FINCloseRun_StatusCode === "posted" && canPost ? <Button size="sm" variant="outline" onClick={() => { setReversalPeriod(nextPeriodCode(visibleRun.FINPeriod?.FINPeriod_Code || period)); setReason(""); setDialog("reverse") }}><RotateCcw />{t("Reverse remaining")}</Button> : null}</div></div><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[1120px] text-[12px]"><thead><tr className="border-b border-[var(--md-line)] text-[var(--md-subtle)]">{["Job", "Expected revenue", "Expected cost", "Revenue WIP", "Cost accrual", "WIP reversed", "Accrual reversed", "Released by", "Note", ""].map((label) => <th key={label} className="p-2 text-start font-medium">{t(label)}</th>)}</tr></thead><tbody>{visibleRun.items.map((item) => <tr key={item.FINCloseItem_ID} className="border-b border-[var(--md-line)] last:border-0"><td className="p-2 font-medium text-[var(--md-ink)]" data-i18n-skip dir="ltr">{item.FINCloseItem_MetadataJSON?.jobReference}</td>{[item.FINCloseItem_ExpectedRevenue, item.FINCloseItem_ExpectedCost, item.FINCloseItem_ProposedWIP, item.FINCloseItem_ProposedAccrual, item.automaticWipReleased, item.automaticAccrualReleased].map((value, index) => <td key={index} className="p-2 text-end tabular-nums" data-i18n-skip dir="ltr">{money(value)}</td>)}<td className="max-w-52 p-2 text-[var(--md-subtle)]" title={item.automaticReleases.map((release) => release.documentNumber).filter(Boolean).join(", ")} data-i18n-skip dir="ltr">{item.automaticReleases.length ? item.automaticReleases.map((release) => release.documentNumber || release.FINRelease_DocumentID.slice(0, 8)).join(", ") : "–"}</td><td className="max-w-64 truncate p-2 text-[var(--md-subtle)]">{item.FINCloseItem_ReviewerNote || "–"}</td><td className="p-2 text-end">{visibleRun.FINCloseRun_StatusCode === "draft" && canPrepare ? <Button type="button" size="icon" variant="ghost" aria-label={t("Edit proposal")} onClick={() => openItem(item)}><Pencil /></Button> : null}</td></tr>)}</tbody></table></div></div> : null}</div>}
      </SettingsPanel>
    </div>

    <Dialog open={dialog === "review"} onOpenChange={(open) => !open && setDialog(null)}><DialogContent><DialogHeader><DialogTitle>{t("Prepare period review")}</DialogTitle><DialogDescription>{t("Create a controlled draft for the selected jobs. Calculated amounts remain editable until approval is requested.")}</DialogDescription></DialogHeader><p className="text-[13px] text-[var(--md-text)]">{t("Selected jobs")}: <span className="font-medium text-[var(--md-ink)]" data-i18n-skip dir="ltr">{selected.size}</span></p><Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t("Explain the management reporting basis for this review")} /><DialogFooter><Button variant="outline" onClick={() => setDialog(null)}>{t("Cancel")}</Button><Button disabled={busy || !selected.size || !reason.trim()} onClick={() => void perform(() => createAccrualWipRun(entityId, period, [...selected], reason), "Period review prepared.")}>{busy ? <LoaderCircle className="animate-spin" /> : <Calculator />}{t("Prepare review")}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={dialog === "assign"} onOpenChange={(open) => !open && setDialog(null)}><DialogContent><DialogHeader><DialogTitle>{t("Assign job management period")}</DialogTitle><DialogDescription>{t("Enter the exact job reference, then review its current entity before assigning it. The reason and change are retained in the audit history.")}</DialogDescription></DialogHeader><label className="space-y-1.5 text-[12px] font-medium text-[var(--md-text)]"><span>{t("Exact job reference")}</span><Input value={assignJobReference} onChange={(event) => { setAssignJobReference(event.target.value); setAssignJobId("") }} placeholder="202609-123" data-i18n-skip dir="ltr" /></label>{assignJobReference.trim() && !matchingAssignableJobs.length ? <p role="status" className="text-[12px] text-[var(--md-subtle)]">{t("No active job with that exact reference is available for this entity. Check its status and reference.")}</p> : null}{matchingAssignableJobs.length ? <label className="space-y-1.5 text-[12px] font-medium text-[var(--md-text)]"><span>{t("Job")}</span><Select value={assignJobId} onValueChange={setAssignJobId}><SelectTrigger><SelectValue placeholder={t("Choose exact job")} /></SelectTrigger><SelectContent>{matchingAssignableJobs.map((job) => <SelectItem key={job.jobId} value={job.jobId}><span data-i18n-skip dir="ltr">{job.periodCode}-{job.jobNumber}</span> · {t(job.status)} · {t(job.legalEntityId ? "Assigned to this entity" : "Unassigned")} · <span data-i18n-skip dir="ltr">{job.jobId.slice(0, 8)}</span></SelectItem>)}</SelectContent></Select></label> : null}{selectedAssignableJob?.legalEntityId === null ? <p className="text-[12px] text-[var(--md-text)]">{t("This job is unassigned. This action assigns it to the selected legal entity and management period; review its source and amount first.")}</p> : null}<label className="space-y-1.5 text-[12px] font-medium text-[var(--md-text)]"><span>{t("New period")}</span><Input value={period} disabled data-i18n-skip dir="ltr" /></label><Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t("Reason for assignment or reassignment")} /><DialogFooter><Button variant="outline" onClick={() => setDialog(null)}>{t("Cancel")}</Button><Button disabled={busy || !selectedAssignableJob || !reason.trim()} onClick={() => { if (selectedAssignableJob) void perform(() => assignJobManagementPeriod(selectedAssignableJob.jobId, entityId, period, reason), "Job management period assigned.") }}>{busy ? <LoaderCircle className="animate-spin" /> : <Check />}{t("Assign period")}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={dialog === "item"} onOpenChange={(open) => !open && setDialog(null)}><DialogContent><DialogHeader><DialogTitle>{t("Adjust proposal")}</DialogTitle><DialogDescription>{t("Enter the approved management amounts. A note is required whenever either calculated recommendation is changed.")}</DialogDescription></DialogHeader><div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1.5 text-[12px] font-medium text-[var(--md-text)]"><span>{t("Revenue WIP")}</span><Input type="number" min="0" step="0.01" value={wip} onChange={(event) => setWip(event.target.value)} data-i18n-skip dir="ltr" /></label><label className="space-y-1.5 text-[12px] font-medium text-[var(--md-text)]"><span>{t("Cost accrual")}</span><Input type="number" min="0" step="0.01" value={accrual} onChange={(event) => setAccrual(event.target.value)} data-i18n-skip dir="ltr" /></label></div><Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t("Reviewer note for any override")} /><DialogFooter><Button variant="outline" onClick={() => setDialog(null)}>{t("Cancel")}</Button><Button disabled={busy || !activeItem || !visibleRun} onClick={() => activeItem && visibleRun && void perform(() => updateAccrualWipItem(visibleRun.FINCloseRun_ID, activeItem.FINCloseItem_ID, Number(wip), Number(accrual), reason), "Proposal updated.")}>{busy ? <LoaderCircle className="animate-spin" /> : <Check />}{t("Save adjustment")}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={dialog === "reject"} onOpenChange={(open) => !open && setDialog(null)}><DialogContent><DialogHeader><DialogTitle>{t("Reject period review")}</DialogTitle><DialogDescription>{t("Return this review to a rejected state with a clear reason for the preparer.")}</DialogDescription></DialogHeader><Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t("Reason for rejection")} /><DialogFooter><Button variant="outline" onClick={() => setDialog(null)}>{t("Cancel")}</Button><Button disabled={busy || !reason.trim() || !visibleRun} onClick={() => visibleRun && void perform(() => rejectAccrualWipRun(visibleRun.FINCloseRun_ID, reason), "Period review rejected.")}>{t("Reject review")}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={dialog === "reverse"} onOpenChange={(open) => !open && setDialog(null)}><DialogContent><DialogHeader><DialogTitle>{t("Reverse management journal")}</DialogTitle><DialogDescription>{t("Post the exact opposite journal into the chosen open period. The original remains locked and auditable.")}</DialogDescription></DialogHeader><label className="space-y-1.5 text-[12px] font-medium text-[var(--md-text)]"><span>{t("Reversal period")}</span><Input value={reversalPeriod} onChange={(event) => setReversalPeriod(event.target.value.replace(/\D/g, "").slice(0, 6))} data-i18n-skip dir="ltr" /></label><Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t("Reason for reversal")} /><DialogFooter><Button variant="outline" onClick={() => setDialog(null)}>{t("Cancel")}</Button><Button disabled={busy || !validPeriod(reversalPeriod) || !reason.trim() || !visibleRun} onClick={() => visibleRun && void perform(() => reverseAccrualWipRun(visibleRun.FINCloseRun_ID, reversalPeriod, reason), "Management journal reversed.")}>{busy ? <LoaderCircle className="animate-spin" /> : <RotateCcw />}{t("Post reversal")}</Button></DialogFooter></DialogContent></Dialog>
  </>
}

// Page-specific review surface; posting remains in the established approved workflow.
function CostReviewPanel({ entityId }: { entityId: string }) {
  const { t, language } = useLanguage()
  const [expanded, setExpanded] = useState(false)
  const [review, setReview] = useState<CostReview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [offset, setOffset] = useState(0)
  const [search, setSearch] = useState("")
  const [refresh, setRefresh] = useState(0)
  const [selected, setSelected] = useState<CostReviewRow | null>(null)
  useEffect(() => {
    if (!expanded) return
    let current = true
    setLoading(true); setError(null)
    const timer = window.setTimeout(() => {
      void getFinanceCostReview(entityId, offset, search).then((result) => {
        if (current) setReview(result)
      }).catch((cause) => {
        if (current) setError(cause instanceof Error ? cause.message : t("Cost review could not be loaded."))
      }).finally(() => { if (current) setLoading(false) })
    }, 250)
    return () => { current = false; window.clearTimeout(timer) }
  }, [expanded, entityId, offset, search, refresh, t])
  const format = (value: string | null) => value === null ? t("Needs review") : new Intl.NumberFormat(language, { style: "currency", currency: review!.currency }).format(Number(value))
  const columns: DataTableColumn<CostReviewRow>[] = [
    { id: "job", label: t("Job / charge"), width: 210, cell: row => <button type="button" className="text-start text-[var(--md-accent)] hover:underline" onClick={() => setSelected(row)}>{row.jobReference} · {row.lineNo}<span className="block text-[11px] text-[var(--md-text)]">{row.description}</span></button> },
    { id: "nominal", label: t("Cost nominal"), width: 105, cell: row => row.nominalCode || "–" },
    { id: "estimate", label: t("Current estimate"), kind: "number", width: 135, cell: row => format(row.currentEstimate) },
    { id: "actual", label: t("Actual to date"), kind: "number", width: 135, cell: row => format(row.actualCost) },
    { id: "accrual", label: t("Posted open accrual"), kind: "number", width: 145, cell: row => format(row.openAccrual) },
    { id: "remaining", label: t("Estimated remainder"), kind: "number", width: 145, cell: row => format(row.remainingEstimate) },
    { id: "review", label: t("Review required"), width: 240, cell: row => <span className="text-[var(--md-amber)]">{row.reasons.map(reason => t(reason)).join(" · ")}</span> },
  ]
  return <SettingsPanel title={t("Lifetime cost review")} description={t("Charge-level estimates, posted actuals across all periods, final-invoice evidence and controlled residual releases.")}>
    <div className="p-4 sm:p-5">
    <Button type="button" variant="outline" size="sm" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{t(expanded ? "Hide cost review" : "Open cost review")}</Button>
    {expanded ? <div className="mt-3 space-y-3">
      <CostPolicyControls entityId={entityId} />
      <RecognitionMandatePanel entityId={entityId} />
      <p className="text-[12px] text-[var(--md-subtle)]">{t("The estimated remainder is not a posting recommendation. Completed-service evidence and a separate approved recognition mandate are required before an initial accrual or WIP posting. Historical original estimates are not reconstructed.")}</p>
      {error ? <p role="alert" className="text-[13px] text-[var(--md-red)]">{error}{review ? ` ${t("Previously loaded figures may be out of date.")}` : ""}</p> : null}
      {loading && !review ? <DotGridLoader label={t("Loading cost review")} /> : null}
      <DataTable columns={columns} rows={(review?.rows ?? []).filter(row => `${row.jobReference} ${row.description}`.toLowerCase().includes(search.toLowerCase()))} getRowKey={row => row.id} ariaLabel={t("Charge cost review")} minimumWidth={1000}
        toolbarSearch={<Input aria-label={t("Search jobs and charges")} placeholder={t("Search jobs and charges")} maxLength={120} value={search} onChange={event => { setSearch(event.target.value); setOffset(0) }} />}
        toolbarOptions={<Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => setRefresh(value => value + 1)}>{loading ? <DotGridLoader size="sm" /> : <RefreshCw />}{t("Refresh")}</Button>}
        emptyState={<p>{t(loading ? "Loading charge evidence…" : error ? "Charge evidence is unavailable." : "No matching charge lines.")}</p>} />
      {review ? <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-[var(--md-subtle)]">
        <span>{t("Snapshot")}: {new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(review.asOf))} · {t("Charges")}: {review.total}</span>
        <div className="flex items-center gap-2"><Button type="button" size="sm" variant="outline" disabled={loading || offset === 0} onClick={() => setOffset(Math.max(0, offset - review.pageSize))}>{t("Previous")}</Button><span>{review.total ? review.offset + 1 : 0}–{Math.min(review.offset + review.rows.length, review.total)} / {review.total}</span><Button type="button" size="sm" variant="outline" disabled={loading || offset + review.pageSize >= review.total} onClick={() => setOffset(offset + review.pageSize)}>{t("Next")}</Button></div>
      </div> : null}
    </div> : null}
    <Dialog open={Boolean(selected)} onOpenChange={open => { if (!open) setSelected(null) }}><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{selected?.jobReference} · {selected?.description}</DialogTitle><DialogDescription>{t("An invoice arriving does not establish that it is the supplier’s final invoice. Record the evidence before any release is considered.")}</DialogDescription></DialogHeader>{selected ? <>
      <dl className="grid grid-cols-2 gap-3 text-[13px]"><dt>{t("Current estimate")}</dt><dd>{format(selected.currentEstimate)}</dd><dt>{t("Actual to date")}</dt><dd>{format(selected.actualCost)}</dd><dt>{t("Posted open accrual")}</dt><dd>{format(selected.openAccrual)}</dd><dt>{t("Estimate less actual")}</dt><dd>{format(selected.favourableVariance)}</dd></dl>
      <p className="text-[12px] text-[var(--md-subtle)]">{t("Estimate less actual is not realised profit while further supplier invoices remain possible.")}</p>
      <ul className="list-disc space-y-1 ps-5 text-[13px]">{selected.reasons.map(reason => <li key={reason}>{t(reason)}</li>)}</ul>
      <p className="text-[12px]">{t("Matched posted documents")}: {selected.sourceDocumentIds.length} · {t("Accrual records")}: {selected.sourceAccrualIds.length}</p>
      <ChargeEvidenceControls key={selected.id} entityId={entityId} chargeId={selected.id} />
      <RevenueEvidenceControls key={`revenue-${selected.id}`} entityId={entityId} chargeId={selected.id} />
      <ChargeCorrectionPanel key={`cost-correction-${selected.id}`} entityId={entityId} chargeId={selected.id} kind="cost" />
      <ChargeCorrectionPanel key={`revenue-correction-${selected.id}`} entityId={entityId} chargeId={selected.id} kind="revenue" />
    </> : null}<DialogFooter><Button variant="outline" onClick={() => setSelected(null)}>{t("Close")}</Button></DialogFooter></DialogContent></Dialog>
    </div>
  </SettingsPanel>
}

// These are workflow-specific sections, not reusable component-gallery primitives.
function CostPolicyControls({ entityId }: { entityId: string }) {
  const { t, language } = useLanguage()
  const [data, setData] = useState<CostControls | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [edit, setEdit] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [reason, setReason] = useState("")
  const [form, setForm] = useState({ underPercent: "0", underCap: "0", overPercent: "0", overCap: "0", recognitionRule: "", autoFinalise: false })
  useEffect(() => {
    let current = true
    void getCostControls(entityId).then(value => { if (current) { setData(value); setError("") } }).catch(cause => { if (current) setError(cause instanceof Error ? cause.message : t("Cost policy could not be loaded.")) })
    return () => { current = false }
  }, [entityId, refresh, t])
  const latest = data?.policies[0]
  const perform = async (action: "save_policy" | "approve_policy" | "automation" | "retry_finalisation" | "approve_exception", input: Record<string, unknown>) => {
    setBusy(true); setError("")
    try { await updateCostControls(entityId, action, input); setEdit(false); setReason(""); setRefresh(value => value + 1) }
    catch (cause) { setError(cause instanceof Error ? cause.message : t("Cost policy could not be saved.")) }
    finally { setBusy(false) }
  }
  return <section aria-label={t("Cost accrual policy")} className="space-y-3 border-b border-[var(--md-line)] pb-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-[14px] font-medium">{t("Cost accrual policy")}</h3><span className="text-[12px] text-[var(--md-amber)]">{t(data?.postingEnabled ? "Residual finalisation enabled" : "Automatic posting disabled")}</span></div>
    {error ? <p role="alert" className="text-[var(--md-red)]">{error}<Button variant="ghost" size="sm" disabled={busy} onClick={() => setRefresh(value => value + 1)}>{t("Retry")}</Button></p> : null}
    {!data && !error ? <DotGridLoader label={t("Loading policy")} /> : null}
    {data ? <>
      <p className="text-[12px] text-[var(--md-text)]">{latest ? `${t("Revision")} ${latest.revision} · ${t(latest.approved_by ? "Approved" : "Awaiting independent approval")}` : t("No approved tolerance policy. All differences require review.")}</p>
      {latest ? <><p className="text-[13px]">{t("Under estimate")}: {latest.under_percent}% / {latest.under_cap} {latest.currency} · {t("Over estimate")}: {latest.over_percent}% / {latest.over_cap} {latest.currency}</p><p className="text-[12px] whitespace-pre-wrap">{latest.recognition_rule}</p></> : null}
      <p className="text-[12px] text-[var(--md-subtle)]">{t("Both the percentage and amount limit must pass. Approval records the policy; it does not enable the posting worker. Final invoice evidence is always required for releasing a residual.")}</p>
      {data.canPrepare ? <Button variant="outline" size="sm" disabled={busy} onClick={() => setEdit(value => !value)}>{t(edit ? "Cancel policy draft" : "Prepare policy revision")}</Button> : null}
      {edit ? <form className="space-y-3" onSubmit={event => { event.preventDefault(); void perform("save_policy", form) }}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{([['underPercent', 'Under estimate %'], ['underCap', 'Under estimate cap'], ['overPercent', 'Over estimate %'], ['overCap', 'Over estimate cap']] as const).map(([key, label]) => <label key={key} className="space-y-1 text-[12px]"><span>{t(label)} {key.endsWith("Cap") ? `(${data.currency})` : ""}</span><Input required inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,4})?" value={form[key]} onChange={event => setForm(old => ({ ...old, [key]: event.target.value }))} /></label>)}</div>
        <label className="block space-y-1 text-[12px]"><span>{t("Required service-completion evidence")}</span><Textarea required minLength={10} maxLength={2000} value={form.recognitionRule} onChange={event => setForm(old => ({ ...old, recognitionRule: event.target.value }))} /></label>
        <label className="flex items-center gap-2 text-[12px]"><Checkbox checked={form.autoFinalise} onCheckedChange={value => setForm(old => ({ ...old, autoFinalise: value === true }))} />{t("Allow automatic finalisation within these limits once automation is activated")}</label>
        <Button type="submit" disabled={busy}>{busy ? <DotGridLoader size="sm" /> : null}{t("Save for approval")}</Button>
      </form> : null}
      {!edit && latest && !latest.approved_by && data.canApprove && latest.created_by !== data.actorId ? <form className="space-y-2" onSubmit={event => { event.preventDefault(); void perform("approve_policy", { id: latest.id, reason }) }}><label className="block space-y-1 text-[12px]"><span>{t("Approval reason")}</span><Textarea required minLength={5} maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} /></label><Button type="submit" disabled={busy}>{t("Approve this policy revision")}</Button></form> : null}
      {latest && !latest.approved_by && latest.created_by === data.actorId ? <p className="text-[12px] text-[var(--md-subtle)]">{t("Another authorised colleague must approve your policy.")}</p> : null}
      {!edit && latest && data.canApprove && data.canPost && (data.postingEnabled || latest.approved_by && latest.auto_finalise) ? <form className="space-y-2" onSubmit={event => { event.preventDefault(); void perform("automation", { policyId: latest.id, enabled: !data.postingEnabled, reason }) }}>
        <p className="text-[12px] text-[var(--md-text)]">{t("Activation permits balanced residual write-backs on existing accruals after final-invoice confirmation. A separate mandate controls initial recognition. The tenant accounting worker must be running; ERPNext delivery failures remain visible in Journals.")}</p>
        <label className="block space-y-1 text-[12px]"><span>{t("Activation / pause reason")}</span><Textarea required minLength={5} maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} /></label>
        <Button type="submit" disabled={busy}>{t(data.postingEnabled ? "Pause residual finalisation" : "Activate residual finalisation")}</Button>
      </form> : null}
      {data.cases.length ? <details className="text-[12px]"><summary>{t("Finalisation results and exceptions")}</summary><ul className="mt-2 space-y-3">{data.cases.map(item => <li key={item.id} className="space-y-2 border-b border-[var(--md-line)] pb-2"><p>{t(item.status)} · {item.reason}</p><p>{t("Charge")}: {item.charge_id} · {t("Estimate")}: {item.estimate} · {t("Actual")}: {item.actual} · {t("Residual release")}: {item.residual} {data.currency}</p>{item.status === "review" && data.canPost ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void perform("retry_finalisation", { evidenceId: item.evidence_id })}>{t("Recheck after correction")}</Button> : null}{item.status === "review" && item.reason === "Outside approved tolerance; human review required" && data.canApprove ? <form className="space-y-2" onSubmit={event => { event.preventDefault(); const fields = new FormData(event.currentTarget); void perform("approve_exception", { caseId: item.id, reason: fields.get("reason") }) }}><label className="block space-y-1"><span>{t("Reason for approving this exact residual release")}</span><Textarea name="reason" required minLength={5} maxLength={2000} /></label><Button type="submit" disabled={busy}>{t("Approve tolerance exception")}</Button></form> : null}</li>)}</ul></details> : null}
    </> : null}
  </section>
}

function RecognitionMandatePanel({ entityId }: { entityId: string }) {
  const { t } = useLanguage()
  const [data, setData] = useState<RecognitionControls | null>(null)
  const [policies, setPolicies] = useState<CostControls | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [costEnabled, setCostEnabled] = useState(true)
  const [revenueEnabled, setRevenueEnabled] = useState(false)
  const [effectiveDate, setEffectiveDate] = useState("")
  const [revenueRule, setRevenueRule] = useState("")
  const [reason, setReason] = useState("")
  useEffect(() => {
    let current = true
    void Promise.all([getRecognitionControls(entityId), getCostControls(entityId)]).then(([controls, cost]) => {
      if (current) { setData(controls); setPolicies(cost); setError("") }
    }).catch((cause) => { if (current) setError(cause instanceof Error ? cause.message : t("Recognition controls could not be loaded.")) })
    return () => { current = false }
  }, [entityId, refresh, t])
  const active = data?.mandates.find((item) => item.status === "active")
  const proposed = data?.mandates.find((item) => item.status === "proposed")
  const policy = policies?.policies.find((item) => Boolean(item.approved_by))
  const act = async (action: "propose" | "activate" | "pause", input: Record<string, unknown>) => {
    setBusy(true); setError("")
    try { await updateRecognitionControls(entityId, action, input); setReason(""); setRefresh((value) => value + 1); toast.success(t(action === "propose" ? "Recognition mandate prepared for independent approval." : action === "activate" ? "Recognition mandate activated." : "Recognition mandate paused.")) }
    catch (cause) { setError(cause instanceof Error ? cause.message : t("Recognition mandate could not be updated.")) }
    finally { setBusy(false) }
  }
  return <section aria-label={t("Completed-service recognition mandate")} className="space-y-3 border-b border-[var(--md-line)] py-4 text-[12px]">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-[14px] font-medium">{t("Completed-service recognition mandate")}</h3><span className={active ? "text-[var(--md-green)]" : "text-[var(--md-amber)]"}>{t(active ? "Active" : proposed ? "Awaiting independent approval" : "Inactive")}</span></div>
    <p className="text-[var(--md-subtle)]">{t("The mandate permits the tenant worker to post an initial balanced cost accrual or revenue WIP after fresh service evidence, an active dated charge mapping and an open accounting period. Credits, stale evidence and later changes remain review cases.")}</p>
    {error ? <p role="alert" className="text-[var(--md-red)]">{error}<Button type="button" variant="ghost" size="sm" onClick={() => setRefresh((value) => value + 1)}>{t("Retry")}</Button></p> : null}
    {!data && !error ? <DotGridLoader label={t("Loading recognition controls")} /> : null}
    {active ? <p>{t("Effective")}: {active.effective_date} · {t("Cost")}: {t(active.cost_enabled ? "On" : "Off")} · {t("Revenue WIP")}: {t(active.revenue_enabled ? "On" : "Off")}</p> : null}
    {proposed ? <p>{t("Proposed effective date")}: {proposed.effective_date} · {t("Cost")}: {t(proposed.cost_enabled ? "On" : "Off")} · {t("Revenue WIP")}: {t(proposed.revenue_enabled ? "On" : "Off")}</p> : null}
    {!active && !proposed && data?.canPrepare ? <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void act("propose", { costEnabled, revenueEnabled, policyId: costEnabled ? policy?.id : null, revenueServiceRule: revenueRule, effectiveDate, reason }) }}>
      <div className="flex flex-wrap gap-4"><label className="flex items-center gap-2"><Checkbox checked={costEnabled} onCheckedChange={(value) => setCostEnabled(value === true)} />{t("Initial cost accrual")}</label><label className="flex items-center gap-2"><Checkbox checked={revenueEnabled} onCheckedChange={(value) => setRevenueEnabled(value === true)} />{t("Initial revenue WIP")}</label></div>
      {costEnabled ? <p>{policy ? `${t("Approved cost policy revision")} ${policy.revision}` : t("Approve a cost policy above before proposing cost recognition.")}</p> : null}
      {revenueEnabled ? <label className="block space-y-1"><span>{t("Required revenue service evidence")}</span><Textarea required minLength={10} maxLength={2000} value={revenueRule} onChange={(event) => setRevenueRule(event.target.value)} /></label> : null}
      <label className="block space-y-1"><span>{t("Effective date")}</span><Input required type="date" value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} /></label>
      <label className="block space-y-1"><span>{t("Mandate reason")}</span><Textarea required minLength={10} maxLength={2000} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      <Button type="submit" size="sm" disabled={busy || !effectiveDate || !reason.trim() || !costEnabled && !revenueEnabled || costEnabled && !policy}>{t("Prepare recognition mandate")}</Button>
    </form> : null}
    {proposed && data?.canApprove && proposed.prepared_by !== data.actorId ? <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); void act("activate", { id: proposed.id, reason }) }}><label className="block space-y-1"><span>{t("Independent approval reason")}</span><Textarea required minLength={10} maxLength={2000} value={reason} onChange={(event) => setReason(event.target.value)} /></label><Button type="submit" size="sm" disabled={busy}>{t("Approve and activate mandate")}</Button></form> : null}
    {proposed?.prepared_by === data?.actorId ? <p className="text-[var(--md-subtle)]">{t("Another authorised colleague must approve this mandate.")}</p> : null}
    {active && data?.canApprove ? <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); void act("pause", { id: active.id, reason }) }}><label className="block space-y-1"><span>{t("Pause reason")}</span><Textarea required minLength={10} maxLength={2000} value={reason} onChange={(event) => setReason(event.target.value)} /></label><Button type="submit" variant="outline" size="sm" disabled={busy}>{t("Pause recognition")}</Button></form> : null}
  </section>
}

function RevenueEvidenceControls({ entityId, chargeId }: { entityId: string; chargeId: string }) {
  const { t } = useLanguage()
  const [canPrepare, setCanPrepare] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [date, setDate] = useState("")
  const [reason, setReason] = useState("")
  const [disputed, setDisputed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")
  useEffect(() => {
    let current = true
    void getRecognitionControls(entityId).then((controls) => {
      if (current) { setCanPrepare(controls.canPrepare); setEnabled(Boolean(controls.mandates.find((item) => item.status === "active" && item.revenue_enabled))) }
    }).catch((cause) => { if (current) setError(cause instanceof Error ? cause.message : t("Revenue controls could not be loaded.")) })
    return () => { current = false }
  }, [entityId, t])
  if (!enabled) return null
  return <section className="space-y-3 border-t border-[var(--md-line)] pt-3 text-[12px]">
    <h3 className="text-[14px] font-medium">{t("Revenue service evidence")}</h3>
    <p className="text-[var(--md-subtle)]">{t("Confirm completed billable service before the worker considers unbilled revenue WIP. Record a new confirmation if the charge or linked invoice changes.")}</p>
    {error ? <p role="alert" className="text-[var(--md-red)]">{error}</p> : null}
    {saved ? <p role="status" className="text-[var(--md-green)]">{t("Revenue service evidence saved for evaluation.")}</p> : null}
    {canPrepare ? <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); setBusy(true); setSaved(false); setError(""); void updateRecognitionControls(entityId, "record_revenue_evidence", { chargeId, serviceCompletedOn: date, disputed, reason }).then(() => { setSaved(true); setReason("") }).catch((cause) => setError(cause instanceof Error ? cause.message : t("Revenue evidence could not be saved."))).finally(() => setBusy(false)) }}>
      <label className="block space-y-1"><span>{t("Actual billable service completion date")}</span><Input required type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
      <label className="flex items-center gap-2"><Checkbox checked={disputed} onCheckedChange={(value) => setDisputed(value === true)} />{t("Service or amount is disputed — block automatic posting")}</label>
      <label className="block space-y-1"><span>{t("Evidence / reason")}</span><Textarea required minLength={10} maxLength={2000} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      <Button type="submit" size="sm" disabled={busy}>{t("Save revenue service evidence")}</Button>
    </form> : null}
  </section>
}

function ChargeCorrectionPanel({ entityId, chargeId, kind }: { entityId: string; chargeId: string; kind: "cost" | "revenue" }) {
  const { t, language } = useLanguage()
  const [data, setData] = useState<ChargeCorrectionState | null>(null)
  const [permissions, setPermissions] = useState<RecognitionControls | null>(null)
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    let current = true
    void Promise.all([getChargeCorrection(entityId, chargeId, kind), getRecognitionControls(entityId)]).then(([correction, controls]) => {
      if (current) { setData(correction); setPermissions(controls); setError("") }
    }).catch((cause) => { if (current) setError(cause instanceof Error ? cause.message : t("Charge correction could not be loaded.")) })
    return () => { current = false }
  }, [entityId, chargeId, kind, refresh, t])
  const latest = data?.reviews.find((item) => item.status === "prepared")
  const actionable = data && Number(data.snapshot.delta) !== 0 && !data.snapshot.blockers.length
  const format = (value: number | string) => new Intl.NumberFormat(language, { style: "currency", currency: data?.snapshot.currency || "GBP", maximumFractionDigits: 4 }).format(Number(value))
  const act = async (action: "prepare" | "approve", reviewId?: string) => {
    setBusy(true); setError("")
    try { await updateChargeCorrection(entityId, chargeId, kind, action, { reason, reviewId }); setReason(""); setRefresh((value) => value + 1); toast.success(t(action === "prepare" ? "Correction prepared for independent approval." : "Dated charge correction posted.")) }
    catch (cause) { setError(cause instanceof Error ? cause.message : t("Charge correction could not be completed.")) }
    finally { setBusy(false) }
  }
  return <details className="border-t border-[var(--md-line)] pt-3 text-[12px]"><summary className="font-medium">{t(kind === "cost" ? "Cost balance correction" : "Revenue WIP correction")}</summary><div className="mt-3 space-y-3">
    <p className="text-[var(--md-subtle)]">{t("Credits, revised estimates and late evidence require a new dated journal. Preparation records the exact current source and original account pair; another finance operator approves it.")}</p>
    {error ? <p role="alert" className="text-[var(--md-red)]">{error}<Button type="button" variant="ghost" size="sm" onClick={() => setRefresh((value) => value + 1)}>{t("Refresh")}</Button></p> : null}
    {!data && !error ? <DotGridLoader label={t("Loading charge correction")} /> : null}
    {data ? <>
      <p>{t("Posted open balance")}: {format(data.snapshot.current)} · {t("Evidence-based target")}: {format(data.snapshot.target)} · {t("Proposed dated movement")}: {format(data.snapshot.delta)}</p>
      {data.snapshot.blockers.length ? <ul className="list-disc space-y-1 ps-5 text-[var(--md-amber)]">{data.snapshot.blockers.map((blocker) => <li key={blocker}>{t(blocker)}</li>)}</ul> : null}
      {latest ? <p>{t("Prepared review")}: {new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(latest.prepared_at))} · {format(latest.delta)}</p> : null}
      {actionable && (permissions?.canPrepare || permissions?.canApprove && permissions.canPost && latest?.prepared_by !== permissions.actorId) ? <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); void act(latest && permissions?.canApprove && permissions.canPost && latest.prepared_by !== permissions.actorId ? "approve" : "prepare", latest?.id) }}>
        <label className="block space-y-1"><span>{t("Correction reason")}</span><Textarea required minLength={10} maxLength={2000} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
        <div className="flex flex-wrap gap-2">
          {permissions?.canPrepare ? <Button type="button" variant="outline" size="sm" disabled={busy || reason.trim().length < 10} onClick={() => void act("prepare")}>{t("Prepare current correction")}</Button> : null}
          {latest && permissions?.canApprove && permissions.canPost && latest.prepared_by !== permissions.actorId ? <Button type="button" size="sm" disabled={busy || reason.trim().length < 10} onClick={() => void act("approve", latest.id)}>{t("Approve and post correction")}</Button> : null}
        </div>
      </form> : null}
      {data.reviews.some((item) => item.status === "posted") ? <p className="text-[var(--md-subtle)]">{t("Posted corrections")}: {data.reviews.filter((item) => item.status === "posted").length}</p> : null}
    </> : null}
  </div></details>
}

function ChargeEvidenceControls({ entityId, chargeId }: { entityId: string; chargeId: string }) {
  const { t, language } = useLanguage()
  const [data, setData] = useState<ChargeCostControls | null>(null)
  const [canPrepare, setCanPrepare] = useState(false)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [form, setForm] = useState({ serviceCompletedOn: "", invoiceReceivedOn: "", finalDocumentId: "", isFinal: false, disputed: false, reason: "" })
  useEffect(() => {
    let current = true
    setData(null)
    void Promise.all([getChargeCostControls(entityId, chargeId), getCostControls(entityId)]).then(([value, controls]) => {
      if (!current) return
      setData(value); setCanPrepare(controls.canPrepare); setError("")
      setForm({ serviceCompletedOn: value.evidence?.service_completed_on ?? "", invoiceReceivedOn: value.evidence?.invoice_received_on ?? "", finalDocumentId: value.evidence?.final_document_id ?? "", isFinal: value.evidenceCurrent && Boolean(value.evidence?.is_final), disputed: Boolean(value.evidence?.disputed), reason: "" })
    }).catch(cause => { if (current) setError(cause instanceof Error ? cause.message : t("Charge evidence could not be loaded.")) })
    return () => { current = false }
  }, [entityId, chargeId, refresh, t])
  const save = async () => {
    if (!data) return
    setBusy(true); setError(""); setSaved(false)
    try { await updateCostControls(entityId, "record_evidence", { ...form, chargeId, revision: data.revision }); setSaved(true); setRefresh(value => value + 1) }
    catch (cause) { setError(cause instanceof Error ? cause.message : t("Evidence could not be saved.")) }
    finally { setBusy(false) }
  }
  return <section className="space-y-3 border-t border-[var(--md-line)] pt-3">
    <h3 className="text-[14px] font-medium">{t("Service and final-invoice evidence")}</h3>
    {error ? <p role="alert" className="text-[var(--md-red)]">{error}<Button variant="ghost" size="sm" disabled={busy} onClick={() => setRefresh(value => value + 1)}>{t("Refresh evidence")}</Button></p> : null}
    {saved ? <p role="status" className="text-[var(--md-green)]">{t("Evidence saved for controlled evaluation.")}</p> : null}
    {!data && !error ? <DotGridLoader label={t("Loading charge evidence")} /> : null}
    {data ? <>
      {data.finalisation ? <p role="status" className="text-[12px]">{t("Finalisation")}: {t(data.finalisation.status)} · {data.finalisation.reason}{data.finalisation.mirrorStatus ? ` · ${t("Accounts system")}: ${t(data.finalisation.mirrorStatus)}` : ""}{data.finalisation.mirrorError ? ` · ${data.finalisation.mirrorError}` : ""}</p> : null}
      {data.evidence && !data.evidenceCurrent ? <p role="status" className="text-[var(--md-amber)]">{t("The charge or invoice changed. Previous confirmation is stale; review the current evidence.")}</p> : null}
      <p className="text-[12px] text-[var(--md-text)]">{data.prediction.probability === null ? t("Arrival prediction unavailable: insufficient current evidence or comparable history.") : `${t("Final invoice expected within 30 days")}: ${new Intl.NumberFormat(language, { style: "percent", maximumFractionDigits: 0 }).format(data.prediction.probability)}`} · {t("Comparable observations")}: {data.prediction.sampleSize}</p>
      <p className="text-[12px] text-[var(--md-subtle)]">{t("History uses this entity, supplier and charge code, including outstanding charges. A prediction never authorises a write-back.")}</p>
      {canPrepare ? <form className="space-y-3" onSubmit={event => { event.preventDefault(); void save() }}>
        <label className="block space-y-1 text-[12px]"><span>{t("Actual service completion date")}</span><Input required type="date" value={form.serviceCompletedOn} onChange={event => setForm(old => ({ ...old, serviceCompletedOn: event.target.value }))} /></label>
        <label className="flex items-center gap-2 text-[12px]"><Checkbox checked={form.isFinal} onCheckedChange={value => setForm(old => ({ ...old, isFinal: value === true }))} />{t("Supplier has confirmed this is the final invoice for this charge")}</label>
        {form.isFinal ? <>
          <label className="block space-y-1 text-[12px]"><span>{t("Matched final invoice")}</span><select required className="h-9 w-full rounded-md bg-[var(--md-bg)] px-3" value={form.finalDocumentId} onChange={event => setForm(old => ({ ...old, finalDocumentId: event.target.value }))}><option value="">{t("Choose a posted invoice")}</option>{Array.from(new Map(data.documents.map(document => [document.id, document])).values()).map(document => <option key={document.id} value={document.id}>{document.number || document.id}</option>)}</select></label>
          <label className="block space-y-1 text-[12px]"><span>{t("Actual invoice received date")}</span><Input required type="date" value={form.invoiceReceivedOn} onChange={event => setForm(old => ({ ...old, invoiceReceivedOn: event.target.value }))} /></label>
        </> : null}
        <label className="flex items-center gap-2 text-[12px]"><Checkbox checked={form.disputed} onCheckedChange={value => setForm(old => ({ ...old, disputed: value === true }))} />{t("This charge is disputed — block automatic adjustment")}</label>
        <label className="block space-y-1 text-[12px]"><span>{t("Evidence / reason")}</span><Textarea required minLength={5} maxLength={2000} value={form.reason} onChange={event => setForm(old => ({ ...old, reason: event.target.value }))} /></label>
        <Button type="submit" disabled={busy}>{busy ? <DotGridLoader size="sm" /> : null}{t("Save evidence")}</Button>
      </form> : null}
      {data.history.length ? <details className="text-[12px]"><summary>{t("Confirmation history")}</summary><ul className="mt-2 space-y-2">{data.history.map(item => <li key={item.id}><span>{new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.recorded_at))} · {t(item.is_final ? "Final invoice" : "Further invoices possible")}</span><p className="whitespace-pre-wrap">{item.reason}</p></li>)}</ul></details> : null}
    </> : null}
  </section>
}

function AccountingClosePanel({ entityId, periodId, currency, canPrepare, canApprove, onChanged }: {
  entityId: string; periodId: string; currency: string; canPrepare: boolean; canApprove: boolean; onChanged: () => Promise<void>
}) {
  const { language, t } = useLanguage()
  const [snapshot, setSnapshot] = useState<AccountingCloseSnapshot | null>(null)
  const [reviews, setReviews] = useState<AccountingCloseReview[]>([])
  const [closedAt, setClosedAt] = useState<string | null>(null)
  const [cases, setCases] = useState<ChargeLifecycleCase[]>([])
  const [reason, setReason] = useState("")
  const [recheckCharge, setRecheckCharge] = useState<string | null>(null)
  const [recheckReason, setRecheckReason] = useState("")
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [digest, setDigest] = useState("")
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [close, queue] = await Promise.all([getAccountingClose(entityId, periodId), getChargeLifecycleQueue(entityId)])
      setSnapshot(close.snapshot); setReviews(close.reviews); setClosedAt(close.closedPack?.closed_at ?? null)
      setDigest(close.sourceDigest); setCases(queue.rows); setError("")
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("Accounting close evidence could not be loaded.")) }
    finally { setLoading(false) }
  }, [entityId, periodId, t])
  useEffect(() => { void load() }, [load])
  const action = async (kind: "prepare" | "close", reviewId?: string) => {
    setBusy(true); setError("")
    try {
      if (kind === "prepare") await prepareAccountingClose(entityId, periodId, reason)
      else await closeAccountingPeriod(entityId, periodId, reviewId!, reason)
      setReason(""); await load(); await onChanged()
      toast.success(t(kind === "prepare" ? "Close pack prepared for independent review." : "Accounting period locked with a signed close pack."))
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("Accounting close could not be completed.")) }
    finally { setBusy(false) }
  }
  const latest = reviews[0]
  const currentReview = latest?.source_digest === digest
  const format = (value: number) => new Intl.NumberFormat(language, { style: "currency", currency, maximumFractionDigits: 4 }).format(value)
  const recheck = async (chargeId: string) => {
    setBusy(true); setError("")
    try { await recheckChargeLifecycleCase(entityId, chargeId, recheckReason); setRecheckCharge(null); setRecheckReason(""); await load(); toast.success(t("Charge case queued for recheck.")) }
    catch (cause) { setError(cause instanceof Error ? cause.message : t("Charge case could not be rechecked.")) }
    finally { setBusy(false) }
  }
  return <SettingsPanel title={t("Accounting period close")} description={t("Reconcile the native ledger and connected controls, prepare an immutable close pack, then have another authorised colleague lock the period.")}>
    <div className="space-y-3 py-1 text-[12px] text-[var(--md-text)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p role="status" className="font-medium text-[var(--md-ink)]">{closedAt ? `${t("Locked")} · ${new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(closedAt))}` : snapshot?.blockers.length ? `${snapshot.blockers.length} ${t("controls need attention")}` : t("Controls ready for independent close review")}</p>
        <Button type="button" size="sm" variant="outline" disabled={loading || busy} onClick={() => void load()}><RefreshCw className={loading ? "animate-spin" : ""} />{t("Refresh controls")}</Button>
      </div>
      {error ? <p role="alert" className="text-[var(--md-red)]">{error}</p> : null}
      {loading && !snapshot ? <DotGridLoader label={t("Loading accounting controls")} /> : null}
      {snapshot ? <>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <p>{t("Trial balance difference")}: <strong data-i18n-skip dir="ltr">{format(snapshot.trialBalance.difference)}</strong></p>
          <p>{t("Cost accrual control difference")}: <strong data-i18n-skip dir="ltr">{format(snapshot.costAccrual.difference)}</strong></p>
          <p>{t("Revenue WIP control difference")}: <strong data-i18n-skip dir="ltr">{format(snapshot.revenueWip.difference)}</strong></p>
          <p>{t("Customer and supplier controls")}: {t(snapshot.arApStatus.replaceAll("_", " "))}</p>
          <p>{t("VAT control")}: {t(snapshot.vatStatus.replaceAll("_", " "))}</p>
          <p>{t("Provider reconciliation")}: {t(snapshot.mirror.providerStatus.replaceAll("_", " "))}</p>
          <p>{t("Bank controls")}: {snapshot.bankControls.length ? snapshot.bankControls.filter((item) => item.status === "verified").length + "/" + snapshot.bankControls.length : t("No active bank accounts")}</p>
          <p>{t("Charge cases")}: <span data-i18n-skip dir="ltr">{snapshot.pendingChargeCases}</span></p>
        </div>
        {snapshot.blockers.length ? <div role="status" className="border-t border-[var(--md-line)] pt-2"><p className="font-medium text-[var(--md-amber)]">{t("Close blockers")}</p><ul className="mt-1 list-disc space-y-1 ps-5">{snapshot.blockers.map((item) => <li key={item}>{t(item.replaceAll("_", " "))}</li>)}</ul></div> : null}
        {snapshot.vatStatus !== "not_applicable" ? <AccountingVatControlPanel entityId={entityId} periodId={periodId} onChanged={load} /> : null}
        {cases.some((item) => item.status !== "settled") ? <details><summary>{t("Charge lifecycle work queue")} · {cases.filter((item) => item.status !== "settled").length}</summary><ul className="mt-2 space-y-2">{cases.filter((item) => item.status !== "settled").slice(0, 20).map((item) => <li key={item.charge_id} className="space-y-2 border-b border-[var(--md-line)] pb-2"><span data-i18n-skip dir="ltr">{item.charge_id}</span> · {t(item.status)}{item.amount_local != null ? ` · ${format(Number(item.amount_local))}` : ""}{item.reason ? ` · ${item.reason}` : ""}{item.next_action ? <p className="ps-4 text-[var(--md-muted)]">{item.next_action}</p> : null}{item.status === "review" && canPrepare ? recheckCharge === item.charge_id ? <form className="space-y-2 ps-4 pt-2" onSubmit={(event) => { event.preventDefault(); void recheck(item.charge_id) }}><label className="block space-y-1"><span>{t("What changed before recheck?")}</span><Textarea required minLength={10} maxLength={1000} value={recheckReason} onChange={(event) => setRecheckReason(event.target.value)} /></label><div className="flex gap-2"><Button type="submit" size="sm" disabled={busy}>{t("Queue recheck")}</Button><Button type="button" size="sm" variant="ghost" onClick={() => setRecheckCharge(null)}>{t("Cancel")}</Button></div></form> : <Button type="button" size="sm" variant="outline" onClick={() => { setRecheckCharge(item.charge_id); setRecheckReason("") }}>{t("Recheck case")}</Button> : null}{item.status === "review" ? <ChargeCaseResolutionPanel entityId={entityId} chargeId={item.charge_id} currency={currency} canPrepare={canPrepare} canApprove={canApprove} onChanged={load} /> : null}</li>)}</ul></details> : null}
        {latest ? <p>{t("Latest review")}: {new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(latest.prepared_at))} · {currentReview ? t("Current source snapshot") : t("Source changed; prepare again")}</p> : null}
        {!closedAt && (canPrepare || canApprove && currentReview && !snapshot.blockers.length) ? <div className="space-y-2 border-t border-[var(--md-line)] pt-3">
          <label className="block space-y-1"><span>{t("Close review reason")}</span><Textarea required minLength={10} maxLength={2000} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
          <div className="flex flex-wrap gap-2">
            {canPrepare ? <Button type="button" variant="outline" disabled={busy || loading || reason.trim().length < 10} onClick={() => void action("prepare")}>{t("Prepare current close pack")}</Button> : null}
            {canApprove && currentReview && !snapshot.blockers.length ? <Button type="button" disabled={busy || loading || reason.trim().length < 10} onClick={() => void action("close", latest.id)}>{t("Approve and lock period")}</Button> : null}
          </div>
        </div> : null}
      </> : null}
    </div>
  </SettingsPanel>
}

function ChargeCaseResolutionPanel({ entityId, chargeId, currency, canPrepare, canApprove, onChanged }: {
  entityId: string; chargeId: string; currency: string; canPrepare: boolean; canApprove: boolean; onChanged: () => Promise<void>
}) {
  const { t, language } = useLanguage()
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<ChargeCaseResolution | null>(null)
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const load = async () => {
    setBusy(true); setError("")
    try { setData(await getChargeCaseResolution(entityId, chargeId)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : t("No-balance review could not be loaded.")) }
    finally { setBusy(false) }
  }
  const act = async (action: "prepare" | "approve", reviewId?: string) => {
    setBusy(true); setError("")
    try {
      await updateChargeCaseResolution(entityId, chargeId, action, { reviewId, reason })
      setReason(""); setData(await getChargeCaseResolution(entityId, chargeId)); await onChanged()
      toast.success(t(action === "prepare" ? "No-balance review prepared for another finance operator." : "Charge case resolved with signed no-balance evidence."))
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("No-balance resolution could not be saved.")) }
    finally { setBusy(false) }
  }
  const latest = data?.reviews[0]
  const ready = data && !data.snapshot.blockers.length && data.snapshot.queueStatus === "review"
  const approvable = latest?.status === "prepared" && latest.queue_revision === data?.snapshot.queueRevision && latest.prepared_by !== data?.actorId
  const moneyValue = (value: number | string) => new Intl.NumberFormat(language, { style: "currency", currency, maximumFractionDigits: 4 }).format(Number(value))
  return <div className="ps-4">
    <Button type="button" size="sm" variant="ghost" aria-expanded={open} onClick={() => { setOpen(value => !value); if (!open) void load() }}>{t(open ? "Hide no-balance review" : "Review no-balance outcome")}</Button>
    {open ? <div className="mt-2 space-y-2 border-s border-[var(--md-line)] ps-3">
      {error ? <p role="alert" className="text-[var(--md-red)]">{error}</p> : null}
      {busy && !data ? <DotGridLoader size="sm" /> : null}
      {data ? <>
        <p>{t("Source revision")}: <span data-i18n-skip dir="ltr">{data.snapshot.queueRevision}</span></p>
        {(["cost", "revenue"] as const).map(kind => { const item = data.snapshot[kind]; return item ? <p key={kind}>{t(kind === "cost" ? "Cost accrual" : "Revenue WIP")}: {t("current")} <span data-i18n-skip dir="ltr">{moneyValue(item.current)}</span> · {t("target")} <span data-i18n-skip dir="ltr">{moneyValue(item.target)}</span> · {t("difference")} <span data-i18n-skip dir="ltr">{moneyValue(item.delta)}</span></p> : null })}
        {data.snapshot.blockers.length ? <ul className="list-disc ps-5 text-[var(--md-amber)]">{data.snapshot.blockers.map(item => <li key={item}>{t(item)}</li>)}</ul> : <p className="text-[var(--md-subtle)]">{t("Current evidence shows no charge balance change. A second finance operator can approve the recorded outcome.")}</p>}
        {latest ? <p>{t("Latest review")}: {t(latest.status)} · {latest.prepared_reason}</p> : null}
        {ready && (canPrepare || canApprove && approvable) ? <div className="space-y-2">
          <label className="block space-y-1"><span>{t("Review reason")}</span><Textarea required minLength={10} maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} /></label>
          <div className="flex flex-wrap gap-2">
            {canPrepare ? <Button type="button" size="sm" variant="outline" disabled={busy || reason.trim().length < 10} onClick={() => void act("prepare")}>{t("Prepare no-balance outcome")}</Button> : null}
            {canApprove && approvable ? <Button type="button" size="sm" disabled={busy || reason.trim().length < 10} onClick={() => void act("approve", latest.id)}>{t("Approve case resolution")}</Button> : null}
          </div>
        </div> : null}
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void load()}>{t("Refresh evidence")}</Button>
      </> : null}
    </div> : null}
  </div>
}

function AccountingVatControlPanel({ entityId, periodId, onChanged }: {
  entityId: string; periodId: string; onChanged: () => Promise<void>
}) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<AccountingVatControl | null>(null)
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const load = async () => {
    setBusy(true); setError("")
    try { setData(await getAccountingVatControl(entityId, periodId)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : t("Monthly VAT control could not be loaded.")) }
    finally { setBusy(false) }
  }
  const act = async (action: "prepare" | "approve", reviewId?: string) => {
    setBusy(true); setError("")
    try {
      await updateAccountingVatControl(entityId, periodId, action, { reviewId, reason })
      setReason(""); setData(await getAccountingVatControl(entityId, periodId)); await onChanged()
      toast.success(t(action === "prepare" ? "Monthly VAT control prepared for independent review." : "Monthly VAT control approved."))
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("Monthly VAT control could not be saved.")) }
    finally { setBusy(false) }
  }
  const latest = data?.reviews[0]
  const approved = data?.approvals.some(item => item.review_id === latest?.id)
  const ready = data?.inventory.status === "ready_for_review"
  const approvable = ready && latest?.source_digest === data.inventory.sourceDigest && latest?.prepared_by !== data.actorId && !approved
  return <div className="border-t border-[var(--md-line)] pt-2">
    <Button type="button" size="sm" variant="outline" aria-expanded={open} onClick={() => { setOpen(value => !value); if (!open) void load() }}>{t(open ? "Hide monthly VAT control" : "Review monthly VAT control")}</Button>
    {open ? <div className="mt-3 space-y-2">
      {error ? <p role="alert" className="text-[var(--md-red)]">{error}</p> : null}
      {busy && !data ? <DotGridLoader size="sm" /> : null}
      {data ? <>
        <p role="status">{t("Monthly VAT control")}: <strong>{t(data.control.status.replaceAll("_", " "))}</strong> · {t("posted lines")}: <span data-i18n-skip dir="ltr">{data.inventory.lineCount}</span> · {t("historical opening lines excluded")}: <span data-i18n-skip dir="ltr">{data.inventory.openingExcludedLines}</span></p>
        <p>{t("Unclassified lines")}: <span data-i18n-skip dir="ltr">{data.inventory.unclassifiedLines}</span> · {t("cut-off differences")}: <span data-i18n-skip dir="ltr">{data.inventory.unreviewedCutoffDifferences}</span> · {t("orphan evidence")}: <span data-i18n-skip dir="ltr">{data.inventory.orphanEvidence}</span> · {t("missing document sources")}: <span data-i18n-skip dir="ltr">{data.inventory.missingDocumentSources}</span></p>
        {data.inventory.issues.length ? <details><summary>{t("VAT control issues")} · {data.inventory.issues.length}</summary><ul className="mt-1 list-disc ps-5">{data.inventory.issues.slice(0, 20).map(item => <li key={item.lineId}>{t(item.classification.replaceAll("_", " "))} · <span data-i18n-skip dir="ltr">{item.lineId}</span></li>)}</ul></details> : null}
        {latest ? <p>{t("Latest VAT review")}: {latest.reason} · {latest.source_digest === data.inventory.sourceDigest ? t("Current source") : t("Source changed; prepare again")}</p> : null}
        {ready && (data.canPrepare || data.canApprove && approvable) ? <div className="space-y-2">
          <label className="block space-y-1"><span>{t("Monthly VAT control reason")}</span><Textarea required minLength={10} maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} /></label>
          <div className="flex flex-wrap gap-2">
            {data.canPrepare ? <Button type="button" size="sm" variant="outline" disabled={busy || reason.trim().length < 10} onClick={() => void act("prepare")}>{t("Prepare VAT control")}</Button> : null}
            {data.canApprove && approvable ? <Button type="button" size="sm" disabled={busy || reason.trim().length < 10} onClick={() => void act("approve", latest.id)}>{t("Approve VAT control")}</Button> : null}
          </div>
        </div> : null}
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void load()}>{t("Refresh VAT evidence")}</Button>
      </> : null}
    </div> : null}
  </div>
}
