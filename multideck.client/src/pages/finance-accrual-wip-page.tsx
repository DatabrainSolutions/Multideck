import { useCallback, useEffect, useMemo, useState } from "react"
import { Calculator, Check, LoaderCircle, Pencil, RefreshCw, RotateCcw, Send, ShieldCheck } from "@/components/icons/hugeicons"
import { KpiStrip } from "@/components/multideck/dashboard-kpi-strip"
import { SettingsPageHeader, SettingsPanel } from "@/components/multideck/settings-components"
import { StatusPill } from "@/components/multideck/status-pill"
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
  const [wip, setWip] = useState("0")
  const [accrual, setAccrual] = useState("0")
  const [reversalPeriod, setReversalPeriod] = useState("")
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canPrepare = hasPermission(currentUser, "Finance.Management.Prepare")
  const canApprove = hasPermission(currentUser, "Finance.Management.Approve")
  const canPost = hasPermission(currentUser, "Finance.Management.Post")

  const loadEntities = useCallback(async () => {
    const result = await getFinanceManagementEntities()
    setEntities(result.legalEntities)
    setEntityId((current) => current || result.legalEntities[0]?.LegalEntity_ID || "")
  }, [])
  const load = useCallback(async (nextEntity = entityId, nextPeriod = period) => {
    if (!nextEntity || !validPeriod(nextPeriod)) return
    setLoading(true); setError(null)
    try {
      const result = await getFinanceAccrualWorkspace(nextEntity, nextPeriod)
      setWorkspace(result)
      setSelected(new Set(result.candidates.filter((job) => job.needsReview).map((job) => job.jobId)))
      setActiveRun(result.runs.find((run) => run.FINPeriod?.FINPeriod_Code === nextPeriod) ?? result.runs[0] ?? null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("The management accounting workspace could not be loaded."))
    } finally { setLoading(false) }
  }, [entityId, period, t])

  useEffect(() => { void loadEntities().catch((cause) => { setError(cause instanceof Error ? cause.message : t("Legal entities could not be loaded.")); setLoading(false) }) }, [loadEntities, t])
  useEffect(() => { if (entityId) void load(entityId, period) }, [entityId, period, load])
  useEffect(() => subscribeTopBarAction(topBarActionEvents.prepareAccrualWipReview, () => { setReason(""); setDialog("review") }), [])

  const currency = workspace?.entity.LegalEntity_BaseCurrencyCodeSnapshot || "GBP"
  const money = useCallback((value: number) => new Intl.NumberFormat(language, { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value || 0)), [currency, language])
  const totals = useMemo(() => workspace?.candidates.reduce((sum, job) => ({ wip: sum.wip + job.proposedWip, accrual: sum.accrual + job.proposedAccrual, outside: sum.outside + Math.abs(job.outsidePeriodRevenue) + Math.abs(job.outsidePeriodCost), margin: sum.margin + job.adjustedMargin }), { wip: 0, accrual: 0, outside: 0, margin: 0 }) ?? { wip: 0, accrual: 0, outside: 0, margin: 0 }, [workspace])
  const visibleRun = activeRun && workspace?.runs.some((run) => run.FINCloseRun_ID === activeRun.FINCloseRun_ID) ? workspace.runs.find((run) => run.FINCloseRun_ID === activeRun.FINCloseRun_ID) ?? null : null

  const refresh = async () => { await load(entityId, period) }
  const perform = async (task: () => Promise<unknown>, success: string) => {
    setBusy(true)
    try { await task(); toast.success(t(success)); setDialog(null); setReason(""); await refresh() }
    catch (cause) { toast.error(cause instanceof FinanceAccrualsApiError || cause instanceof Error ? cause.message : t("The finance action could not be completed.")) }
    finally { setBusy(false) }
  }
  const openItem = (item: ManagementRunItem) => { setActiveItem(item); setWip(String(item.FINCloseItem_ProposedWIP ?? 0)); setAccrual(String(item.FINCloseItem_ProposedAccrual ?? 0)); setReason(item.FINCloseItem_ReviewerNote ?? ""); setDialog("item") }
  const openAssign = () => { setAssignJobId(workspace?.assignableJobs.find((job) => job.periodCode !== period)?.jobId ?? workspace?.assignableJobs[0]?.jobId ?? ""); setReason(""); setDialog("assign") }
  const nextPeriodCode = (code: string) => { const date = new Date(Date.UTC(Number(code.slice(0, 4)), Number(code.slice(4, 6)), 1)); return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}` }

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
        <label className="space-y-1.5 text-[12px] font-medium text-[var(--md-text)]"><span>{t("Legal entity")}</span><Select value={entityId} onValueChange={setEntityId}><SelectTrigger><SelectValue placeholder={t("Choose legal entity")} /></SelectTrigger><SelectContent>{entities.map((entity) => <SelectItem key={entity.LegalEntity_ID} value={entity.LegalEntity_ID}>{entity.LegalEntity_Name}</SelectItem>)}</SelectContent></Select></label>
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
      <SettingsPanel title={t("Job period control")} description={t("The assigned period drives management reporting. Reassignment is audited and does not change operational dates or statutory accounting dates.")}>
        <div className="flex flex-wrap items-center justify-between gap-3 py-1"><p className="text-[13px] text-[var(--md-text)]">{t("Jobs assigned to this entity")}: <span className="font-medium text-[var(--md-ink)]" data-i18n-skip dir="ltr">{workspace?.assignableJobs.length ?? 0}</span></p>{canPrepare ? <Button type="button" size="sm" variant="outline" onClick={openAssign}><Pencil />{t("Assign job period")}</Button> : null}</div>
      </SettingsPanel>
      <SettingsPanel title={t("Period calculation")} description={t("Expected job costing is compared with approved and submitted finance documents. Outside-period postings remain visible as evidence; proposed WIP and accrual bring the assigned period to the expected position.")}>
        {loading ? <div className="grid min-h-44 place-items-center"><LoaderCircle className="size-5 animate-spin text-[var(--md-accent)]" /></div> : !workspace?.candidates.length ? <div className="grid min-h-32 place-items-center text-center text-[13px] text-[var(--md-subtle)]">{t("No jobs are assigned to this management period.")}</div> : <div className="overflow-x-auto"><table className="w-full min-w-[1260px] border-collapse text-[12px]"><thead><tr className="border-b border-[var(--md-line)] bg-[var(--md-surface-soft)] text-[var(--md-subtle)]"><th className="w-11 p-2 text-center"><Checkbox aria-label={t("Select all jobs")} checked={Boolean(selectionAll)} onCheckedChange={(checked) => setSelected(checked ? new Set(workspace.candidates.map((job) => job.jobId)) : new Set())} /></th>{["Job", "Customer", "Expected revenue", "Expected cost", "Period revenue", "Period cost", "Outside revenue", "Outside cost", "Revenue WIP", "Cost accrual", "Adjusted margin"].map((label, index) => <th key={label} className={`p-2 font-medium ${index < 2 ? "text-start" : "text-end"}`}>{t(label)}</th>)}</tr></thead><tbody>{workspace.candidates.map((job) => <tr key={job.jobId} className="border-b border-[var(--md-line)] text-[var(--md-text)] last:border-0"><td className="p-2 text-center"><Checkbox aria-label={t("Select job")} checked={selected.has(job.jobId)} onCheckedChange={(checked) => setSelected((current) => { const next = new Set(current); if (checked) next.add(job.jobId); else next.delete(job.jobId); return next })} /></td><td className="p-2"><p className="font-medium text-[var(--md-ink)]" data-i18n-skip dir="ltr">{job.jobReference}</p><p className="mt-0.5 text-[11px] text-[var(--md-subtle)]">{t(job.status)}</p></td><td className="max-w-48 truncate p-2">{job.customerName || "—"}</td>{[job.expectedRevenue, job.expectedCost, job.actualRevenue, job.actualCost, job.outsidePeriodRevenue, job.outsidePeriodCost, job.proposedWip, job.proposedAccrual, job.adjustedMargin].map((value, index) => <td key={index} className={`p-2 text-end tabular-nums ${index === 8 ? "font-medium text-[var(--md-ink)]" : ""}`} data-i18n-skip dir="ltr">{money(value)}</td>)}</tr>)}</tbody></table></div>}
      </SettingsPanel>
      <SettingsPanel title={t("Charge line gross profit")} description={t("Each job charge carries its own revenue and cost nominal codes. Posted invoice values replace WIP or accrual on that same line, keeping recognised gross profit steady; unmatched actuals are shown separately because they genuinely change the result.")}>
        {!workspace?.candidates.some((job) => job.chargeLines.length) ? <p className="py-5 text-center text-[13px] text-[var(--md-subtle)]">{t("No charge lines are available for this period.")}</p> : <div className="overflow-x-auto"><table className="w-full min-w-[1460px] text-[12px]"><thead><tr className="border-b border-[var(--md-line)] bg-[var(--md-surface-soft)] text-[var(--md-subtle)]">{["Job", "Domain", "Charge", "Revenue nominal", "Cost nominal", "Expected revenue", "Expected cost", "Revenue WIP", "Cost accrual", "Actual revenue", "Actual cost", "Recognised revenue", "Recognised cost", "Gross profit"].map((label, index) => <th key={label} className={`p-2 font-medium ${index < 5 ? "text-start" : "text-end"}`}>{t(label)}</th>)}</tr></thead><tbody>{workspace?.candidates.flatMap((job) => job.chargeLines.map((line) => <tr key={`${job.jobId}-${line.jobCostingLineId || line.lineNo}`} className="border-b border-[var(--md-line)] last:border-0"><td className="p-2 font-medium text-[var(--md-ink)]" data-i18n-skip dir="ltr">{job.jobReference}</td><td className="p-2 capitalize text-[var(--md-subtle)]">{t(line.domainCode)}</td><td className="p-2"><span className="font-medium text-[var(--md-ink)]" data-i18n-skip dir="ltr">{line.lineNo} · {line.chargeCode || line.description}</span>{line.chargeCode ? <span className="mt-0.5 block text-[11px] text-[var(--md-subtle)]">{line.description}</span> : null}{line.sourceTable ? <span className="mt-0.5 block text-[10px] text-[var(--md-subtle)]" data-i18n-skip dir="ltr">{line.sourceTable}</span> : null}</td><td className="p-2" data-i18n-skip dir="ltr">{line.revenueNominalCode || "—"}</td><td className="p-2" data-i18n-skip dir="ltr">{line.costNominalCode || "—"}</td>{[line.expectedRevenue,line.expectedCost,line.proposedWip,line.proposedAccrual,line.actualRevenue,line.actualCost,line.recognisedRevenue,line.recognisedCost,line.grossProfit].map((value,index) => <td key={index} className={`p-2 text-end tabular-nums ${index===8 ? "font-medium text-[var(--md-ink)]" : ""}`} data-i18n-skip dir="ltr">{money(value)}</td>)}</tr>))}</tbody></table></div>}
        {workspace?.candidates.some((job) => job.unmatchedActualRevenue !== 0 || job.unmatchedActualCost !== 0) ? <div className="mt-3 border-t border-[var(--md-line)] pt-3 text-[12px] text-[var(--md-red)]">{workspace.candidates.filter((job) => job.unmatchedActualRevenue !== 0 || job.unmatchedActualCost !== 0).map((job) => <p key={job.jobId}><span className="font-medium" data-i18n-skip dir="ltr">{job.jobReference}</span> · {t("Unmatched actual GP movement")}: <span className="tabular-nums" data-i18n-skip dir="ltr">{money(job.unmatchedActualRevenue - job.unmatchedActualCost)}</span></p>)}</div> : null}
      </SettingsPanel>
      <SettingsPanel title={t("Review history")} description={t("Posted AR and AP invoice lines reclassify only the WIP or accrual on their exact job charge line, using net values excluding VAT. Unmatched actuals change gross profit and remain visible for review; any unreleased balance can still be reversed manually.")}>
        {!workspace?.runs.length ? <p className="py-5 text-center text-[13px] text-[var(--md-subtle)]">{t("No accrual and WIP reviews have been prepared yet.")}</p> : <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]"><div className="space-y-1 border-b border-[var(--md-line)] pb-3 xl:border-b-0 xl:border-e xl:pb-0 xl:pe-3">{workspace.runs.map((run) => <button key={run.FINCloseRun_ID} type="button" className={`flex w-full items-center justify-between gap-2 rounded-[var(--md-radius-md)] px-3 py-2 text-start ${visibleRun?.FINCloseRun_ID === run.FINCloseRun_ID ? "bg-[var(--md-accent-a10)]" : "hover:bg-[var(--md-surface-soft)]"}`} onClick={() => setActiveRun(run)}><span><span className="block text-[13px] font-medium text-[var(--md-ink)]" data-i18n-skip dir="ltr">{run.FINPeriod?.FINPeriod_Code}</span><span className="mt-0.5 block text-[11px] text-[var(--md-subtle)]">{new Intl.DateTimeFormat(language, { dateStyle: "medium" }).format(new Date(run.FINCloseRun_StartedAt))}</span></span><StatusPill tone={tone(run.FINCloseRun_StatusCode)}>{t(run.FINCloseRun_StatusCode.replaceAll("_", " "))}</StatusPill></button>)}</div>{visibleRun ? <div className="min-w-0"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><h3 className="text-[14px] font-medium text-[var(--md-ink)]">{t("Period review")} <span data-i18n-skip dir="ltr">{visibleRun.FINPeriod?.FINPeriod_Code}</span></h3><StatusPill tone={tone(visibleRun.FINCloseRun_StatusCode)}>{t(visibleRun.FINCloseRun_StatusCode.replaceAll("_", " "))}</StatusPill></div><p className="mt-1 max-w-[70ch] text-[12px] leading-5 text-[var(--md-subtle)]">{visibleRun.FINCloseRun_Reason}</p></div><div className="flex flex-wrap gap-2">{visibleRun.FINCloseRun_StatusCode === "draft" && canPrepare ? <Button size="sm" onClick={() => void perform(() => requestAccrualWipReview(visibleRun.FINCloseRun_ID), "Review submitted for approval.")}><Send />{t("Request approval")}</Button> : null}{visibleRun.FINCloseRun_StatusCode === "awaiting_approval" && canApprove ? <><Button size="sm" variant="outline" onClick={() => { setReason(""); setDialog("reject") }}><RotateCcw />{t("Reject")}</Button><Button size="sm" onClick={() => void perform(() => approveAccrualWipRun(visibleRun.FINCloseRun_ID), "Accrual and WIP review approved.")}><ShieldCheck />{t("Approve")}</Button></> : null}{visibleRun.FINCloseRun_StatusCode === "approved" && canPost ? <Button size="sm" onClick={() => void perform(() => postAccrualWipRun(visibleRun.FINCloseRun_ID), "Management journal posted.")}><Check />{t("Post journal")}</Button> : null}{visibleRun.FINCloseRun_StatusCode === "posted" && canPost ? <Button size="sm" variant="outline" onClick={() => { setReversalPeriod(nextPeriodCode(visibleRun.FINPeriod?.FINPeriod_Code || period)); setReason(""); setDialog("reverse") }}><RotateCcw />{t("Reverse remaining")}</Button> : null}</div></div><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[1120px] text-[12px]"><thead><tr className="border-b border-[var(--md-line)] text-[var(--md-subtle)]">{["Job", "Expected revenue", "Expected cost", "Revenue WIP", "Cost accrual", "WIP reversed", "Accrual reversed", "Released by", "Note", ""].map((label) => <th key={label} className="p-2 text-start font-medium">{t(label)}</th>)}</tr></thead><tbody>{visibleRun.items.map((item) => <tr key={item.FINCloseItem_ID} className="border-b border-[var(--md-line)] last:border-0"><td className="p-2 font-medium text-[var(--md-ink)]" data-i18n-skip dir="ltr">{item.FINCloseItem_MetadataJSON?.jobReference}</td>{[item.FINCloseItem_ExpectedRevenue, item.FINCloseItem_ExpectedCost, item.FINCloseItem_ProposedWIP, item.FINCloseItem_ProposedAccrual, item.automaticWipReleased, item.automaticAccrualReleased].map((value, index) => <td key={index} className="p-2 text-end tabular-nums" data-i18n-skip dir="ltr">{money(value)}</td>)}<td className="max-w-52 p-2 text-[var(--md-subtle)]" title={item.automaticReleases.map((release) => release.documentNumber).filter(Boolean).join(", ")} data-i18n-skip dir="ltr">{item.automaticReleases.length ? item.automaticReleases.map((release) => release.documentNumber || release.FINRelease_DocumentID.slice(0, 8)).join(", ") : "—"}</td><td className="max-w-64 truncate p-2 text-[var(--md-subtle)]">{item.FINCloseItem_ReviewerNote || "—"}</td><td className="p-2 text-end">{visibleRun.FINCloseRun_StatusCode === "draft" && canPrepare ? <Button type="button" size="icon" variant="ghost" aria-label={t("Edit proposal")} onClick={() => openItem(item)}><Pencil /></Button> : null}</td></tr>)}</tbody></table></div></div> : null}</div>}
      </SettingsPanel>
    </div>

    <Dialog open={dialog === "review"} onOpenChange={(open) => !open && setDialog(null)}><DialogContent><DialogHeader><DialogTitle>{t("Prepare period review")}</DialogTitle><DialogDescription>{t("Create a controlled draft for the selected jobs. Calculated amounts remain editable until approval is requested.")}</DialogDescription></DialogHeader><p className="text-[13px] text-[var(--md-text)]">{t("Selected jobs")}: <span className="font-medium text-[var(--md-ink)]" data-i18n-skip dir="ltr">{selected.size}</span></p><Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t("Explain the management reporting basis for this review")} /><DialogFooter><Button variant="outline" onClick={() => setDialog(null)}>{t("Cancel")}</Button><Button disabled={busy || !selected.size || !reason.trim()} onClick={() => void perform(() => createAccrualWipRun(entityId, period, [...selected], reason), "Period review prepared.")}>{busy ? <LoaderCircle className="animate-spin" /> : <Calculator />}{t("Prepare review")}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={dialog === "assign"} onOpenChange={(open) => !open && setDialog(null)}><DialogContent><DialogHeader><DialogTitle>{t("Assign job management period")}</DialogTitle><DialogDescription>{t("This controls management reporting only. The change is retained in the audit history.")}</DialogDescription></DialogHeader><label className="space-y-1.5 text-[12px] font-medium text-[var(--md-text)]"><span>{t("Job")}</span><Select value={assignJobId} onValueChange={setAssignJobId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{workspace?.assignableJobs.map((job) => <SelectItem key={job.jobId} value={job.jobId}><span data-i18n-skip dir="ltr">{job.periodCode}-{job.jobNumber}</span> · {t(job.status)}</SelectItem>)}</SelectContent></Select></label><label className="space-y-1.5 text-[12px] font-medium text-[var(--md-text)]"><span>{t("New period")}</span><Input value={period} disabled data-i18n-skip dir="ltr" /></label><Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t("Reason for assignment or reassignment")} /><DialogFooter><Button variant="outline" onClick={() => setDialog(null)}>{t("Cancel")}</Button><Button disabled={busy || !assignJobId || !reason.trim()} onClick={() => void perform(() => assignJobManagementPeriod(assignJobId, entityId, period, reason), "Job management period assigned.")}>{busy ? <LoaderCircle className="animate-spin" /> : <Check />}{t("Assign period")}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={dialog === "item"} onOpenChange={(open) => !open && setDialog(null)}><DialogContent><DialogHeader><DialogTitle>{t("Adjust proposal")}</DialogTitle><DialogDescription>{t("Enter the approved management amounts. A note is required whenever either calculated recommendation is changed.")}</DialogDescription></DialogHeader><div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1.5 text-[12px] font-medium text-[var(--md-text)]"><span>{t("Revenue WIP")}</span><Input type="number" min="0" step="0.01" value={wip} onChange={(event) => setWip(event.target.value)} data-i18n-skip dir="ltr" /></label><label className="space-y-1.5 text-[12px] font-medium text-[var(--md-text)]"><span>{t("Cost accrual")}</span><Input type="number" min="0" step="0.01" value={accrual} onChange={(event) => setAccrual(event.target.value)} data-i18n-skip dir="ltr" /></label></div><Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t("Reviewer note for any override")} /><DialogFooter><Button variant="outline" onClick={() => setDialog(null)}>{t("Cancel")}</Button><Button disabled={busy || !activeItem || !visibleRun} onClick={() => activeItem && visibleRun && void perform(() => updateAccrualWipItem(visibleRun.FINCloseRun_ID, activeItem.FINCloseItem_ID, Number(wip), Number(accrual), reason), "Proposal updated.")}>{busy ? <LoaderCircle className="animate-spin" /> : <Check />}{t("Save adjustment")}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={dialog === "reject"} onOpenChange={(open) => !open && setDialog(null)}><DialogContent><DialogHeader><DialogTitle>{t("Reject period review")}</DialogTitle><DialogDescription>{t("Return this review to a rejected state with a clear reason for the preparer.")}</DialogDescription></DialogHeader><Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t("Reason for rejection")} /><DialogFooter><Button variant="outline" onClick={() => setDialog(null)}>{t("Cancel")}</Button><Button disabled={busy || !reason.trim() || !visibleRun} onClick={() => visibleRun && void perform(() => rejectAccrualWipRun(visibleRun.FINCloseRun_ID, reason), "Period review rejected.")}>{t("Reject review")}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={dialog === "reverse"} onOpenChange={(open) => !open && setDialog(null)}><DialogContent><DialogHeader><DialogTitle>{t("Reverse management journal")}</DialogTitle><DialogDescription>{t("Post the exact opposite journal into the chosen open period. The original remains locked and auditable.")}</DialogDescription></DialogHeader><label className="space-y-1.5 text-[12px] font-medium text-[var(--md-text)]"><span>{t("Reversal period")}</span><Input value={reversalPeriod} onChange={(event) => setReversalPeriod(event.target.value.replace(/\D/g, "").slice(0, 6))} data-i18n-skip dir="ltr" /></label><Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t("Reason for reversal")} /><DialogFooter><Button variant="outline" onClick={() => setDialog(null)}>{t("Cancel")}</Button><Button disabled={busy || !validPeriod(reversalPeriod) || !reason.trim() || !visibleRun} onClick={() => visibleRun && void perform(() => reverseAccrualWipRun(visibleRun.FINCloseRun_ID, reversalPeriod, reason), "Management journal reversed.")}>{busy ? <LoaderCircle className="animate-spin" /> : <RotateCcw />}{t("Post reversal")}</Button></DialogFooter></DialogContent></Dialog>
  </>
}
