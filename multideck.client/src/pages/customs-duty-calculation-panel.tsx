import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { DotGridLoader } from "@/components/multideck/dot-grid-loader"
import { calculateCustomsDeclaration, getCustomsCalculationHistory, getCustomsProviderEvidence, overrideCustomsCalculation, type CustomsCalculationAudit, type CustomsCalculationHistory, type CustomsProviderEvidenceHistory } from "@/lib/icustoms-api"
import { getCustomsAssessmentHistory, recordCustomsAssessmentComparison, type CustomsAssessmentHistory } from "@/lib/icustoms-api"
import { readCalculationHistoryAtRevision } from "@/lib/customs-calculation-history-request"
import { calculationDraftMatches } from "@/lib/customs-calculation-draft-match"
import type { StandaloneExportDraft } from "@/lib/customs-declaration"
import { calculationCostRows, type CalculationSetup } from "../../../supabase/functions/_shared/customs-calculation-draft.mts"
import { importAdjustmentsForDraft } from "../../../supabase/functions/_shared/customs-import-terms.mts"
import { ukCustomsDate } from "../../../supabase/functions/_shared/customs-calculation-date.mts"
import { calculationUsesCurrentRules } from "../../../supabase/functions/_shared/customs-calculation-version.mts"
import { computedValueCategories, type ComputedValueWorksheet } from "../../../supabase/functions/_shared/customs-computed-valuation.mts"
import { ComparableValuationEditor } from "./customs-comparable-valuation-editor"
import { DeductiveValuationEditor } from "./customs-deductive-valuation-editor"
import { FallbackValuationEditor } from "./customs-fallback-valuation-editor"
import { ContractConversionEditor } from "./customs-contract-conversion-editor"
import { NiRiskEditor } from "./customs-ni-risk-editor"
import { WarehouseEntryEditor } from "./customs-warehouse-entry-editor"
import { TemporaryAdmissionEditor, TemporaryAdmissionReleaseEditor, NiTemporaryReleaseEditor } from "./customs-temporary-admission-editor"
import { ProcessingInputEditor, NiProcessingReleaseEditor } from "./customs-processing-input-editor"
import { GbProcessingBasisEditor } from "./customs-gb-processing-basis-editor"
import { AuthorisedUseEditor } from "./customs-authorised-use-editor"
import { ReturnedGoodsEditor } from "./customs-returned-goods-editor"
import { PreferenceEditor } from "./customs-preference-editor"
import { RemedyEditor } from "./customs-remedy-editor"
import { QuotaAllocationEditor } from "./customs-quota-allocation-editor"
import { isQuotaPreference } from "../../../supabase/functions/_shared/customs-quota-claim.mts"
import { niPreferenceCodes } from "../../../supabase/functions/_shared/customs-ni-preference-codes.mts"
import { VatExpenseEditor } from "./customs-vat-expense-editor"
import { monetaryAdditionReview, percentageAdjustmentCode } from "../../../supabase/functions/_shared/customs-cost-review.mts"
import type { LiveCustomsCalculation } from "./use-customs-live-calculation"

/** Declaration-specific editor, not a reusable component/gallery primitive. */
export const DutyCalculationContext = createContext<{ declarationId?: string; draft: StandaloneExportDraft; live?: LiveCustomsCalculation; isSaved: boolean; calculate: () => ReturnType<typeof calculateCustomsDeclaration>; updateSetup: (value: CalculationSetup) => void; applyVatExpenseAmount: (costId: string, amount: string) => void } | null>(null)
const control = "mt-1 block h-8 w-full min-w-0 rounded-[var(--md-radius-md)] bg-[var(--md-input-bg)] px-2 text-[12px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] focus-visible:outline-2 focus-visible:outline-[var(--md-accent)]"
export const calculationSavedEvent = "multideck:customs-calculation-saved"

/** Declaration-specific evidence review; no provider calls or tax mutations. */
/** Audit-only review kept out of the normal item workflow. */
function ProviderEvidenceReview({ declarationId, t }: { declarationId: string; t: (value: string) => string }) {
  const [page, setPage] = useState<CustomsProviderEvidenceHistory | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [comparisons, setComparisons] = useState<CustomsAssessmentHistory | null>(null)
  const [comparisonBusy, setComparisonBusy] = useState(false)
  const [comparisonError, setComparisonError] = useState("")
  const comparisonPending = useRef(false)
  const mounted = useRef(true)
  const pending = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const load = async (before?: string) => {
    if (pending.current) return
    pending.current = true; setBusy(true); setError("")
    try {
      const response = await getCustomsProviderEvidence(declarationId, before)
      if (mounted.current) setPage(response)
    } catch { if (mounted.current) setError("Retained provider evidence is unavailable. Your calculations are unchanged; try again.") }
    finally { pending.current = false; if (mounted.current) setBusy(false) }
  }
  const loadComparisons = async (before?: string) => {
    if (comparisonPending.current) return
    comparisonPending.current = true; setComparisonBusy(true); setComparisonError("")
    try { const value = await getCustomsAssessmentHistory(declarationId, before); if (mounted.current) setComparisons(value) }
    catch { if (mounted.current) setComparisonError("Comparison history is unavailable. Try again.") }
    finally { comparisonPending.current = false; if (mounted.current) setComparisonBusy(false) }
  }
  const recordComparison = async (sourceId: string) => {
    if (comparisonPending.current) return
    comparisonPending.current = true; setComparisonBusy(true); setComparisonError("")
    try {
      await recordCustomsAssessmentComparison(declarationId, sourceId)
      if (mounted.current) toast.success(t("Comparison recorded. Declaration figures are unchanged."))
      const value = await getCustomsAssessmentHistory(declarationId)
      if (mounted.current) setComparisons(value)
    } catch (error) {
      if (mounted.current) setComparisonError(error instanceof Error ? error.message : "The comparison could not be confirmed. Check history before retrying.")
    } finally { comparisonPending.current = false; if (mounted.current) setComparisonBusy(false) }
  }
  return <details className="max-w-3xl" onToggle={event => { if (event.currentTarget.open && !page && !error) void load() }}>
    <summary className="cursor-pointer rounded-[var(--md-radius-sm)] py-1 font-medium text-[var(--md-ink)] focus-visible:outline-2 focus-visible:outline-[var(--md-accent)]">{t("Retained provider evidence")}</summary>
    <div className="mt-2 space-y-3">
      <p>{t("Declaration-wide records, not a final reconciliation. Currency and liability treatment still need verification. Assessed tax and payment amounts are shown separately.")}</p>
      {busy ? <p role="status">{t("Loading retained evidence…")}</p> : null}
      {error ? <p role="alert" className="text-[var(--md-red)]">{t(error)}</p> : null}
      {page?.history.length === 0 ? <p>{t("No retained provider responses for this declaration.")}</p> : null}
      {page?.history.map(row => <details key={row.id} className="border-t border-[var(--md-line)] pt-2">
        <summary className="cursor-pointer">{new Date(row.recordedAt).toLocaleString("en-GB")} · {t(row.captureKind === "existing-snapshot" ? "Existing snapshot" : "Recorded response")}</summary>
        <div className="mt-2 space-y-2 break-words">
          <p>{t("Evidence reference")}: {row.id}</p>
          {row.calculationLink?.calculationId ? <p>{t("Calculation recorded with this submission")}: {row.calculationLink.calculationId}{row.calculationLink.state === "linked-estimate" ? ` · ${t("Estimate only")}` : ""}</p> : <p>{t("No calculation was linked when this submission was prepared. A newer calculation will not be substituted.")}</p>}
          {row.calculationLink?.reasons.map(reason => <p key={reason}>{t(reason)}</p>)}
          {row.calculationLink?.calculationId && row.notices.length ? <Button type="button" size="sm" variant="ghost" disabled={comparisonBusy} onClick={() => void recordComparison(row.id)}>{t("Record assessment comparison")}</Button> : null}
          {row.captureKind === "existing-snapshot" ? <p>{t("This date records when the snapshot was retained, not when HMRC sent it.")}</p> : null}
          {!row.notices.length && !row.issues.length ? <p>{t("No supported item-tax notice in this response. This does not mean no tax is due.")}</p> : null}
          {row.issues.map(issue => <p key={issue}>{t(issue)}</p>)}
          {row.notices.map((notice, index) => <div key={index} className="space-y-2">
            <h4 className="font-medium text-[var(--md-ink)]">{t(notice.classification === "indicative" ? "Indicative customs debt" : notice.classification === "provisional" ? "Provisional customs debt" : notice.classification === "final" ? "Final customs debt — not yet reconciled" : "Tax notice — status unconfirmed")}</h4>
            {notice.issues.map(issue => <p key={issue}>{t(issue)}</p>)}
            {notice.facts.slice(0, 50).map((fact, factIndex) => <dl key={factIndex} className="grid grid-cols-2 gap-x-4 gap-y-1 border-t border-[var(--md-line)] py-2">
              <dt>{t("Submitted item / tax")}</dt><dd className="text-right">{fact.sequence || "—"} / {fact.taxType || "—"}</dd>
              <dt>{t("Assessed amount")}</dt><dd className="break-all text-right tabular-nums">{fact.assessedAmount ?? "—"}</dd>
              <dt>{t("Payment amount")}</dt><dd className="break-all text-right tabular-nums">{fact.paymentAmount ?? "—"}</dd>
              <dt>{t("Tax base")}</dt><dd className="break-all text-right tabular-nums">{fact.baseAmount ?? "—"}</dd>
              <dt>{t("Duty regime")}</dt><dd className="text-right">{fact.dutyRegime ?? "—"}</dd>
              <dt>{t("Reported tax rate")}</dt><dd className="text-right tabular-nums">{fact.rate ?? "—"}</dd>
              <dt>{t("Currency")}</dt><dd className="text-right">{fact.currency ?? t("Unconfirmed")}</dd>
              {!fact.itemId ? <div className="col-span-2">{t("Not linked to a submitted item; review the source snapshot.")}</div> : null}
            </dl>)}
            {notice.facts.length > 50 ? <p>{t("Preview limited to the first 50 tax rows. This is not a complete assessment review.")}</p> : null}
          </div>)}
        </div>
      </details>)}
      <div className="flex flex-wrap gap-2"><Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void load()}>{t(error ? "Retry evidence" : "Refresh latest evidence")}</Button>{page?.nextCursor ? <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void load(page.nextCursor!)}>{t("Older responses")}</Button> : null}</div>
      <section aria-label={t("Assessment comparisons")} className="space-y-2 border-t border-[var(--md-line)] pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-medium text-[var(--md-ink)]">{t("Saved assessment comparisons")}</h4><Button type="button" size="sm" variant="ghost" disabled={comparisonBusy} onClick={() => void loadComparisons()}>{t(comparisons ? "Refresh comparisons" : "Load comparisons")}</Button></div>
        <p>{t("Compared with the calculation saved at submission. A match does not certify an estimate or change declared tax.")}</p>
        {comparisonBusy ? <div role="status" className="flex items-center gap-2"><DotGridLoader className="size-4" />{t("Checking comparison history…")}</div> : null}
        {comparisonError ? <p role="alert" className="text-[var(--md-red)]">{t(comparisonError)}</p> : null}
        {comparisons?.history.length === 0 ? <p>{t("No comparisons recorded yet. Open a retained response with a linked calculation to record one.")}</p> : null}
        {comparisons?.history.map(saved => <details key={saved.id} className="border-t border-[var(--md-line)] pt-2">
          <summary className="cursor-pointer rounded-[var(--md-radius-sm)] py-1 focus-visible:outline-2 focus-visible:outline-[var(--md-accent)]">{new Date(saved.created_at).toLocaleString("en-GB")}</summary>
          <div className="space-y-2 break-words py-2">
            <p>{t("Source response")}: {saved.source_id}</p><p>{t("Submitted calculation")}: {saved.calculation_id}</p>
            {saved.evidence.notices.map((notice, index) => <div key={index} className="space-y-2">
              <p className="font-medium text-[var(--md-ink)]">{t(notice.comparison?.status === "matched" ? "Figures match" : notice.comparison?.status === "cds-difference" ? "CDS difference" : "Needs information")}</p>
              {[...notice.issues, ...(notice.comparison?.issues ?? [])].map((issue, i) => <p key={i}>{t(issue)}</p>)}
              {notice.totalsBasis === "assessed-items" ? <p>{t("Assessment totals are summed from its item rows.")}</p> : null}
              {notice.comparison?.lines.map(line => <details key={line.itemId} className="border-t border-[var(--md-line)] pt-1">
                <summary className="cursor-pointer break-words py-1">{t("Submitted item")} {line.submittedSequence ?? "—"} · {t(line.status === "matched" ? "Matches" : line.status === "cds-difference" ? "Difference" : "Incomplete")}</summary>
                {"dutyDifference" in line ? <dl className="grid grid-cols-2 gap-x-4 gap-y-1 py-2">
                  <dt>{t("Duty difference (GBP)")}</dt><dd className="text-right tabular-nums">{line.dutyDifference}</dd>
                  <dt>{t("VAT difference (GBP)")}</dt><dd className="text-right tabular-nums">{line.vatDifference}</dd>
                  <dt>{t("Customs value difference (GBP)")}</dt><dd className="text-right tabular-nums">{line.customsValueDifference ?? "—"}</dd>
                  <dt>{t("VAT base difference (GBP)")}</dt><dd className="text-right tabular-nums">{line.vatBaseDifference ?? "—"}</dd>
                </dl> : null}
                {"vatTaxDifferences" in line && line.vatTaxDifferences?.length ? <dl className="grid grid-cols-2 gap-x-4 gap-y-1 py-2">{line.vatTaxDifferences.map(tax => <div key={tax.taxType} className="col-span-2 grid grid-cols-2 gap-x-4 gap-y-1">
                  <dt className="min-w-0 break-words">{tax.taxType} · {t("VAT amount difference (GBP)")}</dt><dd className="text-right tabular-nums">{tax.amountDifference ?? "—"}</dd>
                  <dt className="min-w-0 break-words">{tax.taxType} · {t("VAT base difference (GBP)")}</dt><dd className="text-right tabular-nums">{tax.baseDifference ?? "—"}</dd>
                </div>)}</dl> : null}
                {"issues" in line ? line.issues?.map((issue, i) => <p key={i}>{t(issue)}</p>) : null}
              </details>)}
            </div>)}
          </div>
        </details>)}
        {comparisons?.nextCursor ? <Button type="button" size="sm" variant="ghost" disabled={comparisonBusy} onClick={() => void loadComparisons(comparisons.nextCursor!)}>{t("Older comparisons")}</Button> : null}
      </section>
    </div>
  </details>
}

export function DutyCalculationPanel({ itemId, declaredTaxes, onDeclaredTaxesChange, t }: {
  itemId: string
  declaredTaxes: StandaloneExportDraft["items"][number]["dutyCalculations"]
  onDeclaredTaxesChange: (value: StandaloneExportDraft["items"][number]["dutyCalculations"]) => void
  t: (value: string) => string
}) {
  const context = useContext(DutyCalculationContext)
  const [latest, setLatest] = useState<CustomsCalculationAudit | null>(null)
  const [itemOverride, setItemOverride] = useState<CustomsCalculationAudit | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [loaded, setLoaded] = useState(false)
  const [historyNeedsRefresh, setHistoryNeedsRefresh] = useState(false)
  const [today, setToday] = useState(ukCustomsDate)
  useEffect(() => {
    const refreshDate = () => setToday(ukCustomsDate())
    const timer = window.setInterval(refreshDate, 60_000)
    window.addEventListener("focus", refreshDate)
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refreshDate) }
  }, [])
  const [overrideOpen, setOverrideOpen] = useState(false)
  const [overrideCalculationId, setOverrideCalculationId] = useState<string | null>(null)
  const [override, setOverride] = useState({ duty: "", vat: "", reason: "" })
  const generation = useRef(0)
  const historyRevision = useRef(0)
  const declarationId = context?.declarationId
  const readHistory = useCallback((...args: Parameters<typeof getCustomsCalculationHistory>) =>
    readCalculationHistoryAtRevision(() => getCustomsCalculationHistory(...args), () => historyRevision.current), [])
  const applyHistory = useCallback((response: CustomsCalculationHistory | null) => {
    if (!response) return
    setLatest(response.latestCalculation); setItemOverride(response.latestItemOverride); setHistoryNeedsRefresh(false)
  }, [])
  useEffect(() => {
    const invalidate = (event: Event) => {
      const detail = (event as CustomEvent<{ declarationId: string; sourceItemId?: string }>).detail
      if (!declarationId || detail?.declarationId !== declarationId) return
      historyRevision.current++
      setHistoryNeedsRefresh(true)
      // The initiating panel awaits its own refresh below. Other open panels
      // refresh immediately without dropping their displayed figures or inputs.
      if (detail.sourceItemId === itemId) return
      // Keep an open override and its inputs. Its bound calculation ID below
      // prevents saving against a new result until the operator reviews it.
      const current = generation.current
      void readHistory(declarationId, { itemId }).then(response => {
        if (current === generation.current) { applyHistory(response); setLoaded(true) }
      }).catch(() => {
        if (current === generation.current) setError("The calculation was saved, but this item's history could not be refreshed. Reload history to see it; you do not need to calculate again.")
      })
    }
    window.addEventListener(calculationSavedEvent, invalidate)
    return () => window.removeEventListener(calculationSavedEvent, invalidate)
  }, [declarationId, itemId, applyHistory, readHistory])
  useEffect(() => {
    const current = ++generation.current
    setLatest(null); setItemOverride(null); setLoaded(false); setError(""); setOverrideOpen(false); setOverrideCalculationId(null); setHistoryNeedsRefresh(false)
    if (declarationId) void readHistory(declarationId, { itemId }).then(response => {
      if (current === generation.current) { applyHistory(response); setLoaded(true) }
    }).catch(() => {
      if (current === generation.current) { setError("Calculation history could not be loaded. Your draft is unchanged. Reload history to try again."); setLoaded(true) }
    })
    return () => { generation.current++ }
  }, [declarationId, itemId, applyHistory, readHistory])
  if (!context) return null
  const { draft, isSaved, updateSetup, live } = context
  const setup = draft.dutyCalculationSetup ?? {}
  const itemSetup = setup.items?.[itemId] ?? {}
  const selectedItem = draft.items.find(item => item.id === itemId)
  const niCodes = niPreferenceCodes({ ...selectedItem, headerAdditionalInformationCode: draft.headerAdditionalInformationCode, jurisdiction: setup.jurisdiction })
  const selectedVatCodes = [selectedItem?.nationalCode, ...(selectedItem?.additionalNationalCodes ?? []).map(row => row.code)].filter((code): code is string => !!code && code.startsWith("VAT"))
  const selectedInvoice = draft.invoiceHeaders?.find(invoice => invoice.id === selectedItem?.invoiceHeaderId)
  const worksheet: ComputedValueWorksheet = itemSetup.computedValueWorksheet ?? {
    producerAccountsEvidence: "", accountingPrinciplesEvidence: "", usualProfitEvidence: "",
    earlierMethodReasons: { "1": "", "2": "", "3": "" },
    method4Decision: { treatment: "method5-first", evidence: "" },
    components: computedValueCategories.map(category => ({ category, amount: "", currency: draft.invoiceHeaders?.find(invoice => invoice.id === selectedItem?.invoiceHeaderId)?.currency ?? "", evidence: "" })),
  }
  const categoryLabels: Record<typeof computedValueCategories[number], string> = {
    materials: "Materials", processing: "Manufacturing and processing", "buyer-assists": "Buyer-supplied goods and services",
    "containers-packing": "Containers and packing", "profit-general-expenses": "Producer profit and general expenses",
    "border-transport": "Transport to the border", "border-insurance": "Insurance to the border", "border-loading-handling": "Border loading and handling",
  }
  const auditStale = !latest || historyNeedsRefresh || !calculationDraftMatches(latest.draft_snapshot, draft) || latest.evidence.result?.date !== today || !calculationUsesCurrentRules(latest.evidence.result) || !!live && (live.status !== "ready" || JSON.stringify(live.result?.lines) !== JSON.stringify(latest.evidence.result?.lines))
  const stale = live ? false : !!latest && auditStale
  const result = live ? live.result : latest?.evidence.result
  const line = result?.lines.find(row => row.itemId === itemId)
  const itemIssueMessages = new Set(result?.lines.flatMap(row => row.issues) ?? [])
  const visibleIssues = [...new Set([...(result?.issues ?? live?.issues ?? []).filter(issue => !itemIssueMessages.has(issue) || line?.issues.includes(issue)), ...(line?.issues ?? [])])]
  const replacement = !auditStale && itemOverride?.parent_id === latest?.id ? itemOverride : null
  const previousOverride = itemOverride && itemOverride.parent_id !== latest?.id ? itemOverride : null
  const overrideNeedsReview = overrideOpen && overrideCalculationId !== latest?.id
  // Blank VAT adjustments are editable worksheets, not zero-valued calculation
  // inputs. The service continues to use only populated calculationCostRows.
  const editableCosts = [
    ...calculationCostRows(draft).filter(row => !row.itemId || row.itemId === itemId),
    ...importAdjustmentsForDraft(draft)
      .filter(row => !row.amount && ["AV", "AW"].includes(row.code))
      .map(row => ({ ...row, itemId: "", itemNumber: 0 })),
  ]
  const updateItem = (patch: Partial<typeof itemSetup>) => updateSetup({ ...setup, items: { ...setup.items, [itemId]: { ...itemSetup, ...patch } } })
  const updateWorksheet = (patch: Partial<ComputedValueWorksheet>) => updateItem({ computedValueWorksheet: { ...worksheet, ...patch } })
  const calculate = async () => {
    if (!declarationId || busy) return
    const current = generation.current
    setBusy(true); setError("")
    let saved = false
    try {
      const response = await context.calculate()
      saved = true
      // A declaration calculation changes every item's latest history. Retain
      // other open panels' figures, but do not present them as current or allow
      // overrides against them until their history has been refreshed.
      window.dispatchEvent(new CustomEvent(calculationSavedEvent, { detail: { declarationId, sourceItemId: itemId } }))
      if (current !== generation.current) return
      setHistoryNeedsRefresh(true)
      const estimated = response.result.lines.filter(row => row.status !== "needs-information").length
      toast.info(t(estimated === 1 ? "Estimate saved for 1 item. Declared tax is unchanged." : estimated ? `Estimates saved for ${estimated} items. Declared tax is unchanged.` : "Calculation saved. Review the missing information; no tax amounts were populated."))
      const refreshed = await readHistory(declarationId, { itemId })
      if (current === generation.current) applyHistory(refreshed)
    } catch (cause) {
      if (current === generation.current) setError(saved ? "The calculation was saved, but its history could not be refreshed. Reload calculation history to see it; you do not need to calculate again." : cause instanceof Error && cause.message === "Customs service route not found."
        ? "The calculation service has not been deployed to this environment yet. Your draft is unchanged."
        : cause instanceof Error ? cause.message : "Calculation failed. Previous results are retained.")
    }
    finally { if (current === generation.current) setBusy(false) }
  }
  const saveOverride = async () => {
    if (!declarationId || !latest || busy || !isSaved || auditStale || overrideNeedsReview || line?.duty === undefined) return
    const current = generation.current
    setBusy(true); setError("")
    let saved = false
    try {
      await overrideCustomsCalculation(declarationId, { calculationId: overrideCalculationId!, itemId, ...override })
      saved = true
      window.dispatchEvent(new CustomEvent(calculationSavedEvent, { detail: { declarationId, sourceItemId: itemId } }))
      if (current !== generation.current) return
      setHistoryNeedsRefresh(true)
      setOverrideOpen(false); toast.info(t("Override saved. Declared tax is unchanged."))
      const refreshed = await readHistory(declarationId, { itemId })
      if (current !== generation.current) return
      applyHistory(refreshed)
    } catch (cause) { if (current === generation.current) setError(saved ? "The override was saved, but its history could not be refreshed. Reload calculation history to see it; you do not need to save it again." : cause instanceof Error ? cause.message : "The override could not be saved.") }
    finally { if (current === generation.current) setBusy(false) }
  }
  const reloadHistory = async () => {
    if (!declarationId || busy) return
    const current = generation.current
    setBusy(true)
    try {
      const response = await readHistory(declarationId, { itemId })
      if (current === generation.current) { applyHistory(response); setError(""); setLoaded(true) }
    } catch { if (current === generation.current) setError("Calculation history could not be refreshed. Existing records and your draft are unchanged; try reloading history again.") }
    finally { if (current === generation.current) setBusy(false) }
  }
  return <section aria-label={t("Duty and VAT calculations")} className="customs-item-calculations min-w-0 space-y-3 rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] p-4 shadow-[var(--md-shadow-line)] text-[12px] leading-5 text-[var(--md-text)]">
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1"><h3 className="text-[14px] font-medium text-[var(--md-ink)]">{t("Duty and VAT")}</h3><span role="status" className="text-[var(--md-text)]">{t(live ? live.status === "calculating" ? "Calculating…" : live.status === "error" ? "Estimate unavailable" : replacement ? "Overridden" : visibleIssues.length || !line || line.status === "needs-information" ? "Needs information" : "Estimate" : busy ? "Updating…" : error ? "Needs attention" : !loaded && declarationId ? "Loading…" : stale ? "Out of date" : replacement ? "Overridden" : line?.status === "needs-information" || visibleIssues.length ? "Needs information" : previousOverride ? "Override needs review" : line ? "Estimate" : "Not calculated")}</span></div>
      <dl aria-label={t(stale ? "Previous item estimate" : "Item estimate")} className="flex flex-wrap gap-x-5 gap-y-1">
        <div className="flex items-baseline gap-2"><dt>{t("Customs value")}</dt><dd className="font-medium tabular-nums text-[var(--md-ink)]">{line?.customsValue !== undefined ? `£${line.customsValue}` : "—"}</dd></div>
        <div className="flex items-baseline gap-2"><dt>{t("Estimated duty")}</dt><dd className="font-medium tabular-nums text-[var(--md-ink)]">{line?.duty !== undefined ? `£${replacement?.evidence.replacement?.duty ?? line.duty}` : "—"}</dd></div>
        <div className="flex items-baseline gap-2"><dt>{t("Estimated VAT")}</dt><dd className="font-medium tabular-nums text-[var(--md-ink)]">{line?.vat !== undefined ? `£${replacement?.evidence.replacement?.vat ?? line.vat}` : "—"}</dd></div>
      </dl>
      <div className="sm:ml-auto">
      {live ? live.status === "error" ? <Button type="button" variant="outline" size="sm" onClick={live.retry}>{t("Retry estimate")}</Button> : null : <Button type="button" variant="outline" size="sm" disabled={busy || !loaded || !declarationId} onClick={() => void calculate()}>{busy ? <DotGridLoader className="size-3.5" /> : null}{t(!isSaved ? "Save and calculate" : latest ? "Recalculate" : "Calculate")}</Button>}
      </div>
    </div>
    {live?.error ? <p role="alert" className="text-[var(--md-red)]">{t(live.error)}</p> : !live && error ? <p role="alert" className="text-[var(--md-red)]">{t(error)}</p> : !stale && visibleIssues.length ? <p role="status" className="text-[var(--md-amber)]">{t(visibleIssues[0])}</p> : null}
    <details className="space-y-3">
      <summary className="cursor-pointer rounded-[var(--md-radius-sm)] font-medium text-[var(--md-ink)] focus-visible:outline-2 focus-visible:outline-[var(--md-accent)]">{t("Review calculation")}</summary>
      <div className="space-y-3">
    <p>{t("Estimates only: CDS rounding is not yet verified. Declared tax is unchanged.")}</p>
    {live ? <div className="flex flex-wrap items-center gap-2"><p>{t("Live estimate. Save draft to retain the calculation in history.")}</p>{auditStale && line?.duty !== undefined ? <Button type="button" variant="ghost" size="sm" disabled={busy || live.status === "calculating" || !loaded} onClick={() => void calculate()}>{t("Save estimate for override")}</Button> : null}</div> : !isSaved ? <p role="status">{t("Calculating saves your changes in Multideck first. Nothing is submitted to customs.")}</p> : null}
    {result?.date ? <p>{t("Calculated on")}: {result.date}</p> : null}
    <div className="space-y-4 [&_label]:min-w-0 [&_input[inputmode=decimal]]:text-right [&_input[inputmode=decimal]]:tabular-nums">
    <details><summary className="cursor-pointer font-medium text-[var(--md-ink)]">{t("Declared tax lines")}{declaredTaxes.length ? ` (${declaredTaxes.length})` : ""}</summary><fieldset className="mt-3 space-y-3 border-b border-[var(--md-line)] pb-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <legend className="font-medium text-[var(--md-ink)]">{t("Declared tax lines")}</legend>
        <Button type="button" variant="outline" size="sm" onClick={() => onDeclaredTaxesChange([...declaredTaxes, { id: `duty-${crypto.randomUUID()}`, taxType: "", paymentMethod: "", baseQuantity: "", unitCode: "", declaredTax: "" }])}>{t("Add tax line")}</Button>
      </div>
      {declaredTaxes.length ? <div className="space-y-3">{declaredTaxes.map((entry, index) => <div key={entry.id} className="customs-calculation-fields grid min-w-0 items-end gap-3 rounded-[var(--md-radius-md)] bg-[var(--md-surface-soft)] p-3">
        <label>{t("Tax type")}<Input className={control} value={entry.taxType} onChange={event => onDeclaredTaxesChange(declaredTaxes.map(row => row.id === entry.id ? { ...row, taxType: event.target.value } : row))} /></label>
        <label>{t("Method of payment")}<Input className={control} value={entry.paymentMethod} onChange={event => onDeclaredTaxesChange(declaredTaxes.map(row => row.id === entry.id ? { ...row, paymentMethod: event.target.value } : row))} /></label>
        <label>{t("Tax base quantity")}<Input className={control} inputMode="decimal" value={entry.baseQuantity} onChange={event => onDeclaredTaxesChange(declaredTaxes.map(row => row.id === entry.id ? { ...row, baseQuantity: event.target.value } : row))} /></label>
        <label>{t("Unit code")}<Input className={control} value={entry.unitCode} onChange={event => onDeclaredTaxesChange(declaredTaxes.map(row => row.id === entry.id ? { ...row, unitCode: event.target.value } : row))} /></label>
        <label>{t("Declared tax")}<Input className={control} inputMode="decimal" value={entry.declaredTax} onChange={event => onDeclaredTaxesChange(declaredTaxes.map(row => row.id === entry.id ? { ...row, declaredTax: event.target.value } : row))} /></label>
        <Button type="button" variant="ghost" size="sm" className="justify-self-start text-[var(--md-red)]" aria-label={`${t("Remove tax line")} ${index + 1}`} onClick={() => onDeclaredTaxesChange(declaredTaxes.filter(row => row.id !== entry.id))}>{t("Remove")}</Button>
      </div>)}</div> : <p className="text-[var(--md-subtle)]">{t("No declared tax lines added.")}</p>}
    </fieldset></details>
    {(setup.jurisdiction === "GB" && selectedItem?.procedureCode === "4051") || setup.gbProcessingBasis?.[itemId] ? <GbProcessingBasisEditor value={setup.gbProcessingBasis?.[itemId]} saved={result?.gbProcessingBasisReviews?.find(row => row.itemId === itemId)} stale={stale} onChange={value => {
      const gbProcessingBasis = { ...setup.gbProcessingBasis }
      if (value) gbProcessingBasis[itemId] = value
      else delete gbProcessingBasis[itemId]
      updateSetup({ ...setup, gbProcessingBasis })
    }} t={t} /> : null}
    {(setup.jurisdiction === "NI" && selectedItem?.procedureCode === "4051") || setup.niProcessingRelease?.[itemId] ? <NiProcessingReleaseEditor value={setup.niProcessingRelease?.[itemId]} onChange={value => {
      const niProcessingRelease = { ...setup.niProcessingRelease }
      if (value) niProcessingRelease[itemId] = value
      else delete niProcessingRelease[itemId]
      updateSetup({ ...setup, niProcessingRelease })
    }} t={t} /> : null}
    {setup.processingInputs || ["4051", "4054"].includes(selectedItem?.procedureCode ?? "") ? <ProcessingInputEditor value={setup.processingInputs} jurisdiction={setup.jurisdiction} outputs={draft.items.flatMap((item, index) => ["4051", "4054"].includes(item.procedureCode) ? [{ id: item.id, label: `${t("Item")} ${index + 1}` }] : [])} onChange={processingInputs => updateSetup({ ...setup, processingInputs })} saved={result?.processingInputAllocation} stale={stale} t={t} /> : null}
    <div className="customs-calculation-fields grid min-w-0 items-end gap-x-4 gap-y-3">
      <label>{t("Rate source")}<select className={control} value={setup.rateSource ?? "official"} onChange={event => updateSetup({ ...setup, rateSource: event.target.value as CalculationSetup["rateSource"] })}><option value="official">{t("Official tariff")}</option><option value="operator">{t("Manually entered rates")}</option></select></label>
      <label>{t("Customs territory")}<select className={control} value={setup.jurisdiction ?? ""} onChange={event => updateSetup({ ...setup, jurisdiction: event.target.value as CalculationSetup["jurisdiction"] })}><option value="">{t("Select territory")}</option><option value="GB">{t("Great Britain")}</option><option value="NI">{t("Northern Ireland")}</option></select></label>
      <div className="sm:col-span-2">{t("Rate date (UK today)")}: {today}</div>
      {setup.rateSource === "operator" ? <><label>{t("Duty rate (%)")}<Input className={control} inputMode="decimal" value={itemSetup.dutyRate ?? ""} onChange={event => updateItem({ dutyRate: event.target.value })} /></label>
      <label>{t("VAT rate (%)")}<Input className={control} inputMode="decimal" value={itemSetup.vatRate ?? ""} onChange={event => updateItem({ vatRate: event.target.value })} /></label>
      <label className="sm:col-span-2">{t("Rate source and eligibility evidence")}<Input className={control} value={itemSetup.evidence ?? ""} onChange={event => updateItem({ evidence: event.target.value })} placeholder={t("Tariff measure, date and supporting document reference")} /></label></> : null}
    </div>
    {selectedInvoice && (selectedInvoice.letterOfCreditExchangeRate || setup.invoices?.[selectedInvoice.id]?.contractConversion) ? <ContractConversionEditor key={selectedInvoice.id} invoice={selectedInvoice} value={setup.invoices?.[selectedInvoice.id]?.contractConversion} date={today} supported={setup.jurisdiction === "GB" && selectedItem?.customsValuationMethod === "1"} onChange={contractConversion => updateSetup({ ...setup, invoices: { ...setup.invoices, [selectedInvoice.id]: { ...setup.invoices?.[selectedInvoice.id], contractConversion } } })} t={t} /> : null}
    {itemSetup.remedyReview || result?.remedyOptions?.some(row => row.itemId === itemId) ? <RemedyEditor value={itemSetup.remedyReview} onChange={remedyReview => updateItem({ remedyReview })} commodity={selectedItem?.commodityCode ?? ""} origin={selectedItem?.nonPreferentialOrigin ?? ""} options={result?.remedyOptions?.find(row => row.itemId === itemId)} supported={setup.jurisdiction === "GB" && selectedItem?.procedureCode === "4000"} t={t} /> : null}
    {selectedVatCodes.length || setup.vatReviews?.[itemId] ? <div className="space-y-2">
      <label className="block">{t("Zero or reduced VAT — eligibility evidence")}<Input className={control} value={setup.vatReviews?.[itemId]?.evidence ?? ""} onChange={event => updateSetup({ ...setup, vatReviews: { ...setup.vatReviews, [itemId]: { code: selectedVatCodes.length === 1 ? selectedVatCodes[0] : "", evidence: event.target.value } } })} /></label>
      <p>{t("National VAT code on this item")}: {selectedVatCodes.join(", ") || t("None")}. {t("Record why the goods qualify. The rate comes from the matching official VAT measure, not from this note.")}</p>
      {setup.vatReviews?.[itemId] && setup.vatReviews[itemId].code !== selectedVatCodes[0] ? <p role="status">{t("The VAT code changed. Review and update the evidence before calculating.")}</p> : null}
    </div> : null}
    {isQuotaPreference(selectedItem?.preferenceCode) || setup.quotaAllocations?.[itemId] ? <QuotaAllocationEditor itemId={itemId} commodity={selectedItem?.commodityCode ?? ""} origin={selectedItem?.nonPreferentialOrigin ?? ""} orderNumber={selectedItem?.quotaOrderNumber ?? ""} preferenceCode={selectedItem?.preferenceCode ?? ""} dataset={setup.jurisdiction === "NI" && setup.niTariff === "EU" ? "xi" : "uk"} value={setup.quotaAllocations?.[itemId]} ledger={result?.quotaAllocationLedger} options={result?.quotaOptions?.find(row => row.itemId === itemId)} stale={stale} t={t} onChange={value => {
      const quotaAllocations = { ...setup.quotaAllocations }
      if (value) quotaAllocations[itemId] = value
      else delete quotaAllocations[itemId]
      updateSetup({ ...setup, quotaAllocations })
    }} /> : null}
    {setup.jurisdiction === "NI" && ([niCodes.uk, niCodes.xi].some(code => code && code !== "100" && !isQuotaPreference(code)) || setup.niPreferences?.[itemId]) ? <div className="space-y-4">
      <p>{t("Review origin evidence for both tariffs. A UK agreement does not establish eligibility under the EU agreement. Complete the NI risk review below before calculating.")}</p>
      <p>{t("If the codes differ, keep the UK code in Preference code and enter the EU code as EUPRF statement text under Additional information. NIIMP must also be present.")}</p>
      {niCodes.issues.map(issue => <p key={issue} role="status">{t(issue)}</p>)}
      {(["uk", "xi"] as const).map(dataset => <PreferenceEditor key={dataset} title={dataset === "uk" ? "UK preference — proof of origin" : "EU preference — proof of origin"} value={setup.niPreferences?.[itemId]?.[dataset]} preferenceCode={niCodes[dataset]} origin={selectedItem?.preferentialOrigin ?? ""} dataset={dataset} options={result?.preferenceOptions?.find(row => row.itemId === itemId && row.dataset === dataset)} stale={stale} onChange={value => {
        const niPreferences = { ...setup.niPreferences }
        const paired = { ...niPreferences[itemId] }
        if (value) paired[dataset] = value
        else delete paired[dataset]
        if (Object.keys(paired).length) niPreferences[itemId] = paired
        else delete niPreferences[itemId]
        updateSetup({ ...setup, niPreferences })
      }} t={t} />)}
      {setup.preferences?.[itemId] ? <p>{t("Your earlier single-tariff worksheet is retained in the draft. It is not used as proof for both tariffs; review each agreement separately above.")}</p> : null}
    </div> : null}
    {(setup.jurisdiction === "GB" && selectedItem?.procedureCode === "4400" && ["140", "115"].includes(selectedItem.preferenceCode)) || setup.authorisedUses?.[itemId] ? <AuthorisedUseEditor value={setup.authorisedUses?.[itemId]} commodity={selectedItem?.commodityCode ?? ""} origin={selectedItem?.nonPreferentialOrigin ?? ""} preferenceCode={selectedItem?.preferenceCode ?? ""} options={result?.authorisedUseOptions?.find(row => row.itemId === itemId)} stale={stale} t={t} onChange={value => {
      const authorisedUses = { ...setup.authorisedUses }
      if (value) authorisedUses[itemId] = value
      else delete authorisedUses[itemId]
      updateSetup({ ...setup, authorisedUses })
    }} /> : null}
    {setup.jurisdiction !== "NI" && ((selectedItem?.preferenceCode && !["100", "140", "115"].includes(selectedItem.preferenceCode) && !isQuotaPreference(selectedItem.preferenceCode)) || setup.preferences?.[itemId]) ? <PreferenceEditor value={setup.preferences?.[itemId]} preferenceCode={selectedItem?.preferenceCode ?? ""} origin={selectedItem?.preferentialOrigin ?? ""} dataset="uk" options={result?.preferenceOptions?.find(row => row.itemId === itemId && row.dataset === "uk")} stale={stale} onChange={value => {
      const preferences = { ...setup.preferences }
      if (value) preferences[itemId] = value
      else delete preferences[itemId]
      updateSetup({ ...setup, preferences })
    }} t={t} /> : null}
    {selectedItem?.procedureCode === "7100" || setup.warehouseEntry ? <WarehouseEntryEditor value={setup.warehouseEntry} onChange={warehouseEntry => updateSetup({ ...setup, warehouseEntry })} warehouseIdentifier={draft.warehouseIdentifier ?? ""} supported={draft.direction === "import" && setup.jurisdiction === "GB" && draft.declarationCategory === "H2" && draft.declarationType === "A" && selectedItem?.procedureCode === "7100"} t={t} /> : null}
    {(selectedItem?.procedureCode.startsWith("53") || (selectedItem?.procedureCode.slice(2) === "53" && selectedItem.procedureCode !== "4053")) || setup.temporaryAdmission?.[itemId] || result?.temporaryAdmissionLedgers?.some(row => row.itemId === itemId) ? <TemporaryAdmissionEditor value={setup.temporaryAdmission?.[itemId]} onChange={value => {
      const temporaryAdmission = { ...setup.temporaryAdmission }
      if (value) temporaryAdmission[itemId] = value
      else delete temporaryAdmission[itemId]
      updateSetup({ ...setup, temporaryAdmission })
    }} saved={result?.temporaryAdmissionLedgers?.find(row => row.itemId === itemId)} stale={stale} procedure={selectedItem?.procedureCode ?? ""} jurisdiction={setup.jurisdiction} t={t} /> : null}
    {(selectedItem?.procedureCode === "4053" && setup.jurisdiction === "NI") || setup.niTemporaryRelease?.[itemId] ? <NiTemporaryReleaseEditor value={setup.niTemporaryRelease?.[itemId]} t={t} onChange={value => {
      const niTemporaryRelease = { ...setup.niTemporaryRelease }
      if (value) niTemporaryRelease[itemId] = value
      else delete niTemporaryRelease[itemId]
      updateSetup({ ...setup, niTemporaryRelease })
    }} /> : null}
    {selectedItem?.procedureCode.startsWith("61") || setup.returnedGoods?.[itemId] ? <ReturnedGoodsEditor value={setup.returnedGoods?.[itemId]} additionalProcedure={selectedItem?.additionalProcedureCode ?? ""} importerEori={draft.importerEori ?? ""} t={t} onChange={value => {
      const returnedGoods = { ...setup.returnedGoods }
      if (value) returnedGoods[itemId] = value
      else delete returnedGoods[itemId]
      updateSetup({ ...setup, returnedGoods })
    }} /> : null}
    {selectedItem?.procedureCode === "4053" || setup.temporaryAdmissionRelease?.[itemId] || result?.temporaryAdmissionReleases?.some(row => row.itemId === itemId) ? <TemporaryAdmissionReleaseEditor value={setup.temporaryAdmissionRelease?.[itemId]} onChange={value => {
      const temporaryAdmissionRelease = { ...setup.temporaryAdmissionRelease }
      if (value) temporaryAdmissionRelease[itemId] = value
      else delete temporaryAdmissionRelease[itemId]
      updateSetup({ ...setup, temporaryAdmissionRelease })
    }} saved={result?.temporaryAdmissionReleases?.find(row => row.itemId === itemId)} stale={stale} t={t} /> : null}
    {setup.rateSource !== "operator" && (itemSetup.tariffQuantities?.length || visibleIssues.some(issue => /quantity|quantities|qualifier|pure alcohol/i.test(issue))) ? <details className="space-y-3">
      <summary className="cursor-pointer font-medium text-[var(--md-ink)]">{t("Quantities for tariff duties")}{itemSetup.tariffQuantities?.length ? ` (${itemSetup.tariffQuantities.length})` : ""}</summary>
      <p>{t("Only needed when the tariff asks for a quantity. Use the unit and qualifier shown in the calculation message. Do not substitute gross weight for net or drained weight, or litres for litres of pure alcohol.")}</p>
      {(itemSetup.tariffQuantities ?? []).map((quantity, index) => <fieldset key={index} className="grid min-w-0 gap-3 border-t border-[var(--md-line)] pt-3 sm:grid-cols-3">
        <legend className="px-1 font-medium text-[var(--md-ink)]">{t("Quantity")} {index + 1}</legend>
        <label>{t("Amount")}<Input className={control} inputMode="decimal" value={quantity.quantity} onChange={event => updateItem({ tariffQuantities: itemSetup.tariffQuantities!.map((row, rowIndex) => rowIndex === index ? { ...row, quantity: event.target.value } : row) })} /></label>
        <label>{t("Unit code")}<Input className={control} value={quantity.unit} placeholder={t("For example, KGM or LTR")} onChange={event => updateItem({ tariffQuantities: itemSetup.tariffQuantities!.map((row, rowIndex) => rowIndex === index ? { ...row, unit: event.target.value.trim().toUpperCase() } : row) })} /></label>
        <label>{t("Qualifier code (if required)")}<Input className={control} value={quantity.qualifier ?? ""} placeholder={t("Match the tariff qualifier")} onChange={event => updateItem({ tariffQuantities: itemSetup.tariffQuantities!.map((row, rowIndex) => rowIndex === index ? { ...row, qualifier: event.target.value.trim().toUpperCase() } : row) })} /></label>
        <label className="sm:col-span-2">{t("Supporting document reference")}<Input className={control} value={quantity.evidence} placeholder={t("Packing list, weight certificate or other source")} onChange={event => updateItem({ tariffQuantities: itemSetup.tariffQuantities!.map((row, rowIndex) => rowIndex === index ? { ...row, evidence: event.target.value } : row) })} /></label>
        {["LTR", "HLT"].includes(quantity.unit) ? <>
          <label>{t("Alcohol strength (% ABV, if applicable)")}<Input className={control} inputMode="decimal" value={quantity.alcoholByVolume ?? ""} onChange={event => updateItem({ tariffQuantities: itemSetup.tariffQuantities!.map((row, rowIndex) => rowIndex === index ? { ...row, alcoholByVolume: event.target.value } : row) })} /></label>
          <label className="sm:col-span-2">{t("Alcohol-strength evidence (for pure-alcohol conversion)")}<Input className={control} value={quantity.strengthEvidence ?? ""} placeholder={t("Product strength certificate or other accepted evidence")} onChange={event => updateItem({ tariffQuantities: itemSetup.tariffQuantities!.map((row, rowIndex) => rowIndex === index ? { ...row, strengthEvidence: event.target.value } : row) })} /></label>
        </> : null}
        <Button type="button" variant="ghost" className="self-end justify-self-start text-[var(--md-red)]" aria-label={t(`Remove tariff quantity ${index + 1}`)} onClick={() => updateItem({ tariffQuantities: itemSetup.tariffQuantities!.filter((_row, rowIndex) => rowIndex !== index) })}>{t("Remove quantity")}</Button>
      </fieldset>)}
      <Button type="button" variant="outline" disabled={(itemSetup.tariffQuantities?.length ?? 0) >= 20} onClick={() => updateItem({ tariffQuantities: [...(itemSetup.tariffQuantities ?? []), { quantity: "", unit: "", qualifier: "", evidence: "" }] })}>{t("Add tariff quantity")}</Button>
      <p className="text-[var(--md-subtle)]">{t("Save the declaration before calculating. Quantities apply only to this item; provide one source quantity for each required unit and qualifier.")}</p>
    </details> : null}
    {selectedItem?.customsValuationMethod === "2" || selectedItem?.customsValuationMethod === "3" ? <ComparableValuationEditor method={selectedItem.customsValuationMethod} value={itemSetup.comparableValueWorksheet} onChange={value => updateItem({ comparableValueWorksheet: value })} t={t} /> : null}
    {selectedItem?.customsValuationMethod === "4" ? <DeductiveValuationEditor value={itemSetup.deductiveValueWorksheet} onChange={value => updateItem({ deductiveValueWorksheet: value })} t={t} /> : null}
    {selectedItem?.customsValuationMethod === "6" ? <FallbackValuationEditor value={itemSetup.fallbackValueWorksheet} onChange={value => updateItem({ fallbackValueWorksheet: value })} t={t} /> : null}
    {selectedItem?.customsValuationMethod === "5" ? <details open className="space-y-3">
      <summary className="cursor-pointer font-medium text-[var(--md-ink)]">{t("Method 5 — producer-cost worksheet")}</summary>
      <p>{t("Enter costs for this item only. Record evidence for every category, including zero amounts. Border costs included here must not be added again in adjustments. This remains an estimate pending validation.")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {([['producerAccountsEvidence', 'Producer accounts reference'], ['accountingPrinciplesEvidence', 'Accounting principles evidence'], ['usualProfitEvidence', 'Usual profit and expenses evidence']] as const).map(([key, label]) => <label key={key}>{t(label)}<Input className={control} value={worksheet[key]} onChange={event => updateWorksheet({ [key]: event.target.value })} /></label>)}
        {(["1", "2", "3"] as const).map(method => <label key={method}>{t(`Why Method ${method} could not be used`)}<Input className={control} value={worksheet.earlierMethodReasons[method]} onChange={event => updateWorksheet({ earlierMethodReasons: { ...worksheet.earlierMethodReasons, [method]: event.target.value } })} /></label>)}
        <label>{t("Method order")}<select className={control} value={worksheet.method4Decision.treatment} onChange={event => updateWorksheet({ method4Decision: { ...worksheet.method4Decision, treatment: event.target.value as "unsuccessful" | "method5-first" } })}><option value="method5-first">{t("Importer chose Method 5 before Method 4")}</option><option value="unsuccessful">{t("Method 4 was unsuccessful")}</option></select></label>
        <label>{t("Method-order decision evidence")}<Input className={control} value={worksheet.method4Decision.evidence} onChange={event => updateWorksheet({ method4Decision: { ...worksheet.method4Decision, evidence: event.target.value } })} /></label>
      </div>
      <div className="space-y-3">{worksheet.components.map((component, index) => {
        const patch = (value: Partial<typeof component>) => updateWorksheet({ components: worksheet.components.map((current, position) => position === index ? { ...current, ...value } : current) })
        const label = t(categoryLabels[component.category])
        return <fieldset key={component.category} className="grid min-w-0 gap-2 border-t border-[var(--md-line)] pt-2 sm:grid-cols-2">
          <legend className="font-medium">{label}</legend>
          <label>{t("Amount")}<Input aria-label={`${label}: ${t("Amount")}`} className={control} inputMode="decimal" value={component.amount} readOnly={!!component.includedIn} onChange={event => patch({ amount: event.target.value })} /></label>
          <label>{t("Currency")}<Input aria-label={`${label}: ${t("Currency")}`} className={control} value={component.currency} maxLength={3} readOnly={!!component.includedIn} onChange={event => patch({ currency: event.target.value.toUpperCase() })} /></label>
          <label>{t("Already included in")}<select aria-label={`${label}: ${t("Already included in")}`} className={control} value={component.includedIn ?? ""} onChange={event => patch({ includedIn: event.target.value as typeof component.includedIn || undefined, amount: event.target.value ? "0" : "" })}><option value="">{t("Separate cost")}</option>{computedValueCategories.filter(category => category !== component.category).map(category => <option key={category} value={category}>{t(categoryLabels[category])}</option>)}</select></label>
          <label>{t("Supporting evidence")}<Input aria-label={`${label}: ${t("Supporting evidence")}`} className={control} value={component.evidence} onChange={event => patch({ evidence: event.target.value })} /></label>
        </fieldset>
      })}</div>
    </details> : null}
    {setup.jurisdiction === "NI" ? <fieldset className="grid min-w-0 gap-3 sm:grid-cols-2">
      <legend className="mb-2 font-medium text-[var(--md-ink)]">{t("Northern Ireland treatment evidence")}</legend>
      <p className="sm:col-span-2">{t("Record the reviewed treatment for this estimate. These selections do not establish eligibility or authorise a relief. NI eligibility certification is still required before automatic declaration figures can be enabled.")}</p>
      <label>{t("Movement route")}<select className={control} value={setup.movement ?? ""} onChange={event => updateSetup({ ...setup, movement: event.target.value })}>
        <option value="">{t("Select route")}</option><option value="GB-to-NI">{t("Great Britain to Northern Ireland")}</option><option value="rest-of-world-to-NI">{t("Outside the UK and EU to Northern Ireland")}</option><option value="EU-to-NI">{t("EU to Northern Ireland")}</option>
      </select></label>
      {!itemSetup.niRiskFacts ? <><label>{t("Reviewed risk status")}<select className={control} value={setup.riskStatus ?? ""} onChange={event => updateSetup({ ...setup, riskStatus: event.target.value as CalculationSetup["riskStatus"] })}>
        <option value="">{t("Select risk status")}</option><option value="at-risk">{t("At risk")}</option><option value="not-at-risk">{t("Not at risk — evidence required")}</option>
      </select></label>
      <label>{t("Duty tariff for this estimate")}<select className={control} value={setup.niTariff ?? ""} onChange={event => updateSetup({ ...setup, niTariff: event.target.value as CalculationSetup["niTariff"] })}>
        <option value="">{t("Select reviewed tariff")}</option><option value="UK">{t("UK tariff")}</option><option value="EU">{t("EU tariff — XI duty source")}</option>
      </select></label>
      <label className="sm:col-span-2">{t("Treatment decision and authorisation evidence")}<Input className={control} value={setup.niTreatmentEvidence ?? ""} onChange={event => updateSetup({ ...setup, niTreatmentEvidence: event.target.value })} placeholder={t("Decision reference, authorisations and eligibility evidence")} /></label></> : null}
      <div className="sm:col-span-2"><NiRiskEditor value={itemSetup.niRiskFacts} onChange={niRiskFacts => updateItem({ niRiskFacts })} importerEori={draft.importerEori ?? ""} official={setup.rateSource !== "operator"} movement={setup.movement ?? ""} decision={line?.niRiskDecision} stale={stale} t={t} /></div>
      <details className="space-y-3 sm:col-span-2">
        <summary className="cursor-pointer font-medium text-[var(--md-ink)]">{t("EU low-value duty — distance-sale review")}</summary>
        <p>{t("Complete this only when evidence confirms the consignment is not a distance sale. The invoice amount alone does not establish an exclusion. This review is used in the paired UK/EU risk calculation.")}</p>
        <label className="flex items-start gap-2"><input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-[var(--md-accent)]" checked={!!itemSetup.niLowValueExclusion} onChange={event => updateItem({ niLowValueExclusion: event.target.checked ? { basis: "not-distance-sale", reviewDate: "", consignmentReference: "", evidence: "" } : undefined })} /><span>{t("Evidence confirms this consignment is not a distance sale")}</span></label>
        {itemSetup.niLowValueExclusion ? <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <label>{t("Distance-sale review date")}<Input type="date" className={control} value={itemSetup.niLowValueExclusion.reviewDate} onChange={event => updateItem({ niLowValueExclusion: { ...itemSetup.niLowValueExclusion!, reviewDate: event.target.value } })} /></label>
          <label>{t("Reviewed consignment reference")}<Input className={control} value={itemSetup.niLowValueExclusion.consignmentReference} onChange={event => updateItem({ niLowValueExclusion: { ...itemSetup.niLowValueExclusion!, consignmentReference: event.target.value } })} /></label>
          <label className="sm:col-span-2">{t("Evidence that this is not a distance sale")}<textarea className={`${control} h-auto min-h-20 resize-y py-2 leading-relaxed`} value={itemSetup.niLowValueExclusion.evidence} onChange={event => updateItem({ niLowValueExclusion: { ...itemSetup.niLowValueExclusion!, evidence: event.target.value } })} /></label>
        </div> : null}
      </details>
    </fieldset> : null}
    {editableCosts.length ? <details><summary className="cursor-pointer font-medium text-[var(--md-ink)]">{t("Cost evidence and included charges")}</summary><div className="mt-3 space-y-3">{editableCosts.map(cost => {
      const metadata = setup.costs?.[cost.id] ?? {}
      const isDiscount = ["BH", "BI"].includes(cost.code)
      const discount = metadata.discount ?? { kind: "" as const, agreedOn: "", contractReference: "", goodsEntitlementEvidence: "", commercialBasisEvidence: "", relatesOnlyToSelectedGoods: false, paymentStatus: "" as const }
      const isPercentage = Object.hasOwn(percentageAdjustmentCode, cost.code)
      const reviewCode = isPercentage ? percentageAdjustmentCode[cost.code] : cost.code
      const patch = (value: Partial<typeof metadata>) => updateSetup({ ...setup, costs: { ...setup.costs, [cost.id]: { ...metadata, ...value } } })
      const patchDiscount = (value: Partial<NonNullable<typeof metadata.discount>>) => patch({ discount: { ...discount, ...value } })
      const scope = metadata.scope ?? { type: "declaration" as const }
      const scopeEditor = cost.itemId ? <p className="sm:col-span-2">{t("Applies to item")} {cost.itemNumber}</p> : <>
        <label>{t("Allocate this cost to")}<select className={control} value={scope.type} onChange={event => patch({ scope: event.target.value === "invoice" ? { type: "invoice", invoiceId: "" } : event.target.value === "items" ? { type: "items", itemIds: [] } : { type: "declaration" } })}><option value="declaration">{t("All declaration items")}</option><option value="invoice">{t("One invoice")}</option><option value="items">{t("Selected items")}</option></select></label>
        {scope.type === "invoice" ? <label>{t("Invoice for this cost")}<select className={control} value={scope.invoiceId} onChange={event => patch({ scope: { type: "invoice", invoiceId: event.target.value } })}><option value="">{t("Select invoice")}</option>{draft.invoiceHeaders?.map(invoice => <option key={invoice.id} value={invoice.id}>{invoice.invoiceNumber || t("Unnamed invoice")}</option>)}</select></label> : null}
        {scope.type === "items" ? <fieldset className="sm:col-span-2"><legend>{t("Eligible items")}</legend><div className="max-h-40 space-y-1 overflow-y-auto">{draft.items.map((item, index) => <label key={item.id} className="flex items-start gap-2"><input type="checkbox" className="mt-1 accent-[var(--md-accent)]" checked={scope.itemIds.includes(item.id)} onChange={event => patch({ scope: { type: "items", itemIds: event.target.checked ? [...scope.itemIds, item.id] : scope.itemIds.filter(id => id !== item.id) } })} /><span>{index + 1} · {item.description || item.commodityCode || t("Goods line")}</span></label>)}</div></fieldset> : null}
      </>
      return <div key={cost.id} className="grid gap-2 sm:grid-cols-2"><p className="sm:col-span-2">{cost.code} · {!cost.amount ? t("No amount entered — not included in calculations") : isPercentage ? `${cost.amount}%` : `${cost.currency} ${cost.amount}`}</p>{scopeEditor}
        {Object.hasOwn(monetaryAdditionReview, reviewCode) ? <label className="sm:col-span-2">{t("Valuation basis and document reference")}<span className="mb-1 block">{t(monetaryAdditionReview[reviewCode])}</span><Input className={control} value={metadata.valuationBasisEvidence ?? ""} onChange={event => patch({ valuationBasisEvidence: event.target.value })} /></label> : null}
        {isPercentage ? <label className="flex items-start gap-2 sm:col-span-2"><input type="checkbox" className="mt-1 accent-[var(--md-accent)]" checked={metadata.fullItemPriceBasisConfirmed === true} onChange={event => patch({ fullItemPriceBasisConfirmed: event.target.checked })} /><span>{t("This percentage applies to the full goods price of every selected item, excluding freight and other adjustments. For another basis, use the monetary code and retain its calculation worksheet.")}</span></label> : null}
        <label>{t("Supporting cost evidence")}<Input className={control} value={metadata.evidence ?? ""} onChange={event => patch({ evidence: event.target.value })} /></label><label>{t(isDiscount ? "Goods price treatment" : "Already included in goods price?")}<select className={control} value={metadata.includedInPrice === undefined ? "" : String(metadata.includedInPrice)} onChange={event => patch({ includedInPrice: event.target.value === "" ? undefined : event.target.value === "true" })}><option value="">{t("Confirm treatment")}</option><option value="true">{t(isDiscount ? "Before discount — deduct it once" : "Yes")}</option><option value="false">{t(isDiscount ? "Already discounted — do not deduct again" : "No")}</option></select></label>{["AR", "AS", "BR", "BS"].includes(cost.code) ? <label>{t("Evidenced airfreight percentage")}<Input className={control} inputMode="decimal" value={metadata.airfreightPercentage ?? ""} onChange={event => patch({ airfreightPercentage: event.target.value })} /></label> : null}
        {!cost.itemId && ["AV", "AW"].includes(cost.code) ? <div className="sm:col-span-2"><VatExpenseEditor value={metadata.vatExpense} date={today} control={control} onChange={vatExpense => patch({ vatExpense })} onApply={amount => context.applyVatExpenseAmount(cost.id, amount)} t={t} /></div> : null}
        {isDiscount ? <fieldset className="grid min-w-0 gap-3 sm:col-span-2 sm:grid-cols-2">
          <legend className="mb-2 font-medium text-[var(--md-ink)]">{t("Discount entitlement")}</legend>
          <p className="sm:col-span-2">{t("Record the agreed terms for these goods. Missing or expired entitlement prevents a calculation; entering evidence does not certify the treatment.")}</p>
          <label>{t("Discount type")}<select className={control} value={discount.kind} onChange={event => patchDiscount({ kind: event.target.value as typeof discount.kind })}><option value="">{t("Select type")}</option><option value="earned">{t("Earned discount")}</option><option value="early-payment">{t("Early-payment discount")}</option></select></label>
          <label>{t("Payment status")}<select className={control} value={discount.paymentStatus} onChange={event => patchDiscount({ paymentStatus: event.target.value as typeof discount.paymentStatus })}><option value="">{t("Select payment status")}</option><option value="unpaid">{t("Not yet paid")}</option><option value="discounted">{t("Paid at the discounted amount")}</option><option value="full">{t("Paid in full without discount")}</option></select></label>
          <label>{t("Discount agreed on")}<Input type="date" className={control} value={discount.agreedOn} onChange={event => patchDiscount({ agreedOn: event.target.value })} /></label>
          {([
            ["contractReference", "Contract or agreed terms reference"],
            ["goodsEntitlementEvidence", "Evidence of entitlement for these goods"],
            ["commercialBasisEvidence", "Commercial basis for the discount"],
          ] as const).map(([key, label]) => <label key={key}>{t(label)}<Input className={control} value={discount[key]} onChange={event => patchDiscount({ [key]: event.target.value })} /></label>)}
          <label className="flex items-start gap-2 sm:col-span-2"><input type="checkbox" className="mt-1 accent-[var(--md-accent)]" checked={discount.relatesOnlyToSelectedGoods === true} onChange={event => patchDiscount({ relatesOnlyToSelectedGoods: event.target.checked })} /><span>{t("This discount relates only to the selected goods, not previous purchases or a part-exchange allowance.")}</span></label>
          {discount.paymentStatus === "discounted" ? <label className="sm:col-span-2">{t("Discounted payment evidence")}<Input className={control} value={discount.paymentEvidence ?? ""} onChange={event => patchDiscount({ paymentEvidence: event.target.value })} /></label> : null}
          {discount.kind === "early-payment" && discount.paymentStatus === "unpaid" ? <><label>{t("Discount available until")}<Input type="date" className={control} value={discount.availableUntil ?? ""} onChange={event => patchDiscount({ availableUntil: event.target.value })} /></label><label>{t("Accepted trade practice evidence")}<Input className={control} value={discount.tradePracticeEvidence ?? ""} onChange={event => patchDiscount({ tradePracticeEvidence: event.target.value })} /></label></> : null}
          {discount.paymentStatus === "full" ? <p role="status" className="sm:col-span-2">{t("The full amount has been paid. This discount cannot be deducted from the estimate.")}</p> : null}
        </fieldset> : null}</div>
    })}</div></details> : null}
    </div>
    {error ? <div className="space-y-2"><p role="alert" className="text-[var(--md-red)]">{t(error)}</p>{declarationId ? <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void reloadHistory()}>{t("Reload calculation history")}</Button> : null}</div> : !loaded && declarationId ? <p role="status">{t("Loading calculation history…")}</p> : null}
    {stale ? <p role="status" className="text-[var(--md-amber)]">{t(historyNeedsRefresh ? "A newer record is available. Reload history to review it." : "Inputs, date or rules have changed. Recalculate before using these figures; previous overrides stay in history.")}</p> : null}
    {historyNeedsRefresh && !error ? <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void reloadHistory()}>{t("Reload calculation history")}</Button> : null}
    {visibleIssues.length ? <ul className="list-disc space-y-1 pl-4 text-[var(--md-amber)]">{visibleIssues.map(issue => <li key={issue}>{t(issue)}</li>)}</ul> : null}
    {line?.duty !== undefined && !result?.totals ? <p>{t("Other items need information. This item estimate is available, but declaration totals are not complete.")}</p> : null}
    {result?.referenceNotices?.map((notice, index) => <p key={`${notice.source}-${index}`} className="break-words">{t(notice.message)} {/^https:\/\//.test(notice.source) ? <a className="underline underline-offset-2" href={notice.source} target="_blank" rel="noreferrer">{t("View source")}</a> : null}</p>)}
    {line?.workings.length ? <details className="max-w-3xl"><summary className="cursor-pointer rounded-[var(--md-radius-sm)] py-1 font-medium text-[var(--md-ink)] focus-visible:outline-2 focus-visible:outline-[var(--md-accent)]">{t("How this was calculated")}</summary><dl className="mt-2 divide-y divide-[var(--md-line)]">{line.workings.map((step, index) => <div key={`${step.label}-${index}`} className="flex items-start justify-between gap-4 py-2"><dt className="min-w-0 break-words">{t(step.label)}</dt><dd className="shrink-0 tabular-nums text-[var(--md-ink)]">£{step.amount}</dd></div>)}</dl><p className="mt-2">{t("Shown with estimate rounding. Full-precision workings are retained.")}</p></details> : null}
    {line?.niComparisonWorkings ? <details>
      <summary className="cursor-pointer rounded-[var(--md-radius-sm)] font-medium text-[var(--md-ink)] focus-visible:outline-2 focus-visible:outline-[var(--md-accent)]">{t("Why this Northern Ireland tariff was selected")}</summary>
      <div className="mt-2 space-y-3">
        <p>{t(stale ? "Historical comparison — recalculate before relying on this decision." : "Both tariffs use this item's customs value after eligible costs have been allocated.")}</p>
        {line.niRiskDecision?.reasons.map(reason => <p key={reason}>{t(reason)}</p>)}
        {(["uk", "eu"] as const).map(side => <section key={side} aria-label={t(side === "uk" ? "UK duty comparison" : "EU duty comparison")}>
          <h4 className="font-medium text-[var(--md-ink)]">{t(side === "uk" ? "UK duty" : "EU duty")}</h4>
          <dl className="mt-1 divide-y divide-[var(--md-line)]">
            {line.niComparisonWorkings![side].map((step, index) => <div key={`${side}-${index}`} className="flex items-start justify-between gap-3 py-1">
              <dt className="min-w-0 break-words">{t(step.label)}</dt><dd className="shrink-0 tabular-nums text-[var(--md-ink)]">£{step.amount}</dd>
            </div>)}
          </dl>
        </section>)}
        <p>{t("The comparison uses full precision. Displayed amounts are estimates, not a confirmed CDS assessment.")}</p>
      </div>
    </details> : null}
    {result?.totals && result.liabilityTotals ? <details>
      <summary className="cursor-pointer font-medium text-[var(--md-ink)]">{t("Declaration liability totals")}</summary>
      <div className="mt-2 space-y-2">
        <p>{t(stale ? "Historical calculation — inputs or rules have changed." : "Calculated amounts across all items in this declaration.")} {t("These totals exclude operator overrides and are not a CDS assessment. Payment postponement and deferment do not reduce the liability.")}</p>
        <dl className="divide-y divide-[var(--md-line)]">
          {result.liabilityTotals.taxes.map(tax => <div key={`${tax.taxType}-${tax.disposition}`} className="flex justify-between gap-3 py-1"><dt>{tax.taxType} · {t(tax.disposition === "payable" ? "Payable" : tax.disposition === "suspended" ? "Suspended" : tax.disposition === "relieved" ? "Relieved" : "Secured")}</dt><dd className="shrink-0 tabular-nums text-[var(--md-ink)]">£{tax.amount}</dd></div>)}
          {(result.liabilityTotals.vatByTaxType ?? result.liabilityTotals.vat.map(tax => ({ ...tax, taxType: "" }))).map(tax => <div key={`vat-${tax.taxType}-${tax.disposition}`} className="flex justify-between gap-3 py-1"><dt className="min-w-0 break-words">{tax.taxType ? `${tax.taxType} · ` : ""}{t(tax.taxType === "B05" ? "VAT on EU duties" : "VAT")} · {t(tax.disposition === "payable" ? "Payable" : tax.disposition === "suspended" ? "Suspended" : tax.disposition === "relieved" ? "Relieved" : "Secured")}</dt><dd className="shrink-0 tabular-nums text-[var(--md-ink)]">£{tax.amount}</dd></div>)}
          <div className="flex justify-between gap-3 py-1"><dt>{t("Payable duty and other taxes — item total")}</dt><dd className="shrink-0 tabular-nums text-[var(--md-ink)]">£{result.totals.duty}</dd></div>
          <div className="flex justify-between gap-3 py-1"><dt>{t("Payable VAT — item total")}</dt><dd className="shrink-0 tabular-nums text-[var(--md-ink)]">£{result.totals.vat}</dd></div>
        </dl>
        {result.liabilityTotals.payableTaxRoundingDifference !== "0.00" ? <p role="status" className="text-[var(--md-amber)]">{t("Rounding difference between the payable item total and rounded tax rows")}: £{result.liabilityTotals.payableTaxRoundingDifference}. {t("This difference has not been distributed. CDS precision must be verified before automatic population.")}</p> : null}
        {result.liabilityTotals.payableVatRoundingDifference && result.liabilityTotals.payableVatRoundingDifference !== "0.00" ? <p role="status" className="text-[var(--md-amber)]">{t("Rounding difference between the VAT total and B00/B05 rows")}: £{result.liabilityTotals.payableVatRoundingDifference}. {t("This difference has not been distributed. CDS precision must be verified before automatic population.")}</p> : null}
      </div>
    </details> : null}
    {declarationId ? <ProviderEvidenceReview declarationId={declarationId} t={t} /> : null}
    {replacement ? <p className="break-words">{t("Override reason")}: {replacement.evidence.reason}</p> : null}
    {previousOverride ? <div role="status" className="space-y-1 text-[var(--md-amber)]"><p>{t("Previous override needs reconfirmation against this calculation.")}</p><p>{t("Duty")} £{previousOverride.evidence.replacement?.duty} · {t("VAT")} £{previousOverride.evidence.replacement?.vat} · {previousOverride.evidence.reason}</p><Button type="button" size="sm" variant="ghost" disabled={busy || auditStale || !isSaved || overrideOpen || line?.duty === undefined} onClick={() => { setOverrideOpen(true); setOverrideCalculationId(latest!.id); setOverride({ duty: previousOverride.evidence.replacement?.duty ?? "", vat: previousOverride.evidence.replacement?.vat ?? "", reason: "" }) }}>{t("Review previous override")}</Button></div> : null}
    {line?.duty !== undefined && !auditStale && !overrideOpen ? <Button type="button" size="sm" variant="ghost" disabled={busy || !isSaved} onClick={() => { setOverrideOpen(true); setOverrideCalculationId(latest!.id); setOverride({ duty: replacement?.evidence.replacement?.duty ?? line.duty!, vat: replacement?.evidence.replacement?.vat ?? line.vat!, reason: "" }) }}>{t("Override estimate")}</Button> : null}
    {overrideOpen ? <div className="grid max-w-3xl items-end gap-x-4 gap-y-3 border-t border-[var(--md-line)] pt-3 sm:grid-cols-2">
      <p className="sm:col-span-2">{t("Changes this estimate only. The original figures and your reason are kept in history.")}</p>
      {overrideNeedsReview ? <div role="status" className="space-y-2 text-[var(--md-amber)] sm:col-span-2"><p>{t("The calculation has changed. Your replacement amounts and reason are retained. Review the latest workings before saving.")}</p><Button type="button" size="sm" variant="outline" disabled={busy || auditStale || !isSaved || line?.duty === undefined} onClick={() => setOverrideCalculationId(latest!.id)}>{t("I have reviewed the latest workings")}</Button></div> : null}
      <label className="min-w-0">{t("Replacement duty (GBP)")}<Input className={`${control} max-w-56 text-right tabular-nums`} inputMode="decimal" value={override.duty} onChange={e => setOverride(v => ({ ...v, duty: e.target.value }))} /></label>
      <label className="min-w-0">{t("Replacement VAT (GBP)")}<Input className={`${control} max-w-56 text-right tabular-nums`} inputMode="decimal" value={override.vat} onChange={e => setOverride(v => ({ ...v, vat: e.target.value }))} /></label>
      <label className="min-w-0 sm:col-span-2">{t("Reason for override (at least 10 characters)")}<Textarea className="mt-1 min-h-20 resize-y text-[12px] leading-5 md:text-[12px]" maxLength={2000} value={override.reason} onChange={e => setOverride(v => ({ ...v, reason: e.target.value }))} /></label>
      <div className="flex flex-wrap gap-2 sm:col-span-2"><Button type="button" size="sm" disabled={busy || auditStale || !isSaved || overrideNeedsReview || line?.duty === undefined || override.reason.trim().length < 10} onClick={() => void saveOverride()}>{t("Save override")}</Button><Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setOverrideOpen(false)}>{t("Cancel")}</Button></div>
    </div> : null}
      </div>
    </details>
  </section>
}
