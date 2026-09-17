import { useCallback, useContext, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { DotGridLoader } from "@/components/multideck/dot-grid-loader"
import { getCustomsCalculationHistory, type CustomsCalculationAudit } from "@/lib/icustoms-api"
import { calculationDraftMatches } from "@/lib/customs-calculation-draft-match"
import { calculationUsesCurrentRules } from "../../../supabase/functions/_shared/customs-calculation-version.mts"
import { ukCustomsDate } from "../../../supabase/functions/_shared/customs-calculation-date.mts"
import { DutyCalculationContext, calculationSavedEvent } from "./customs-duty-calculation-panel"

/** Declaration-specific overview. Individual workings and audited overrides
 * remain in the expanded item; these totals are the original calculation. */
export function DutyCalculationOverview({ t, onOpenItem }: { t: (text: string) => string; onOpenItem: (id: string) => void }) {
  const context = useContext(DutyCalculationContext)
  const id = context?.declarationId
  const activeId = useRef(id)
  activeId.current = id
  const [latest, setLatest] = useState<CustomsCalculationAudit | null>(null)
  const [loading, setLoading] = useState(false)
  const [calculating, setCalculating] = useState(false)
  const [error, setError] = useState("")
  const [historyError, setHistoryError] = useState(false)
  const [invalidated, setInvalidated] = useState(false)
  const [today, setToday] = useState(ukCustomsDate)
  const request = useRef(0)
  const mounted = useRef(true)
  const reload = useCallback(async () => {
    if (!id) return
    const revision = ++request.current
    setLoading(true)
    try {
      const response = await getCustomsCalculationHistory(id)
      if (mounted.current && revision === request.current) { setLatest(response.latestCalculation); setInvalidated(false); setError(""); setHistoryError(false) }
    } catch {
      if (mounted.current && revision === request.current) { setError("Calculation history could not be loaded. Retry to see the saved figures."); setHistoryError(true) }
    } finally { if (mounted.current && revision === request.current) setLoading(false) }
  }, [id])
  useEffect(() => {
    mounted.current = true
    setLatest(null); setError(""); setHistoryError(false); setInvalidated(false); setCalculating(false)
    void reload()
    const saved = (event: Event) => {
      if ((event as CustomEvent<{ declarationId: string }>).detail?.declarationId === id) { setInvalidated(true); void reload() }
    }
    const refreshDate = () => setToday(ukCustomsDate())
    const timer = window.setInterval(refreshDate, 60_000)
    window.addEventListener(calculationSavedEvent, saved)
    window.addEventListener("focus", refreshDate)
    return () => { mounted.current = false; request.current++; window.clearInterval(timer); window.removeEventListener(calculationSavedEvent, saved); window.removeEventListener("focus", refreshDate) }
  }, [id, reload])
  if (!context) return null
  const { draft, isSaved, updateSetup, live } = context
  const result = live ? live.result : latest?.evidence.result
  const stale = !live && (invalidated || !!(latest && (!calculationDraftMatches(latest.draft_snapshot, draft) || result?.date !== today || !calculationUsesCurrentRules(result))))
  const lines = new Map(result?.lines.map(line => [line.itemId, line]))
  const ready = draft.items.filter(item => { const line = lines.get(item.id); return line && line.status !== "needs-information" && line.duty !== undefined && line.vat !== undefined }).length
  const needed = result ? draft.items.length - ready : 0
  const readableIssue = (issue: string) => draft.items.reduce((message, item, index) => message.replaceAll(`Item ${item.id}:`, `Item ${index + 1}:`), issue)
  const calculate = async () => {
    if (!id || calculating) return
    setCalculating(true); setError(""); setHistoryError(false)
    let saved = false
    try {
      const response = await context.calculate()
      saved = true
      window.dispatchEvent(new CustomEvent(calculationSavedEvent, { detail: { declarationId: id } }))
      if (!mounted.current || activeId.current !== id) return
      const count = response.result.lines.filter(line => line.status !== "needs-information").length
      toast.info(t(count === 1 ? "Estimate saved for 1 item. Declared tax is unchanged." : count ? `Estimates saved for ${count} items. Declared tax is unchanged.` : "Calculation saved. Review the missing information below."))
    } catch (cause) {
      if (mounted.current && activeId.current === id) setError(saved ? "The calculation was saved. Refresh history to see its result; do not calculate again." : cause instanceof Error ? cause.message : "Calculation failed. Your previous results are retained; try again.")
    } finally { if (mounted.current && activeId.current === id) setCalculating(false) }
  }
  return <section aria-label={t("Declaration duty and VAT")} className="min-w-0 space-y-3 rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-4 premium-stroke text-[12px] leading-5 text-[var(--md-text)]">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><h2 className="text-[14px] font-medium text-[var(--md-ink)]">{t("Duty and VAT")}</h2><p>{t(live ? "Estimates update as you edit." : "Calculate every invoice item together, then review each line’s workings.")}</p></div>
      {live ? live.status === "error" ? <Button type="button" size="sm" variant="outline" onClick={live.retry}>{t("Retry estimate")}</Button> : null : <Button type="button" size="sm" variant="outline" disabled={!id || calculating || loading} onClick={() => void calculate()}>{calculating ? <DotGridLoader className="size-3.5" /> : null}{t(calculating ? "Calculating…" : !isSaved ? "Save and calculate" : result ? "Recalculate all items" : "Calculate all items")}</Button>}
    </div>
    <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
      <label className="flex min-w-0 flex-col gap-1">{t("Customs territory")}<select className="h-8 w-48 max-w-full rounded-[var(--md-radius-md)] bg-[var(--md-input-bg)] px-2 text-[var(--md-ink)] premium-stroke-soft focus-visible:outline-2 focus-visible:outline-[var(--md-accent)]" value={draft.dutyCalculationSetup?.jurisdiction ?? ""} onChange={event => updateSetup({ ...draft.dutyCalculationSetup, jurisdiction: event.target.value as "GB" | "NI" })}><option value="">{t("Select territory")}</option><option value="GB">{t("Great Britain")}</option><option value="NI">{t("Northern Ireland")}</option></select></label>
      <p role="status">{live?.status === "calculating" ? t("Calculating…") : live?.status === "error" ? t("Estimate unavailable") : live && !result ? t("Needs information") : !live && loading ? t("Loading saved figures…") : stale ? t("Out of date — recalculate after your changes") : result ? t(`${ready} of ${draft.items.length} items estimated`) : t("No calculation yet")}{!loading && needed > 0 ? ` · ${t(`${needed} need information`)}` : ""}</p>
    </div>
    {result?.totals ? <dl aria-label={t("Original calculated declaration totals")} className="flex flex-wrap gap-x-8 gap-y-3 border-t border-[var(--md-line)] pt-3">
      <div><dt>{t("Payable duty and other taxes")}</dt><dd className="text-[18px] font-medium tabular-nums text-[var(--md-ink)]">£{result.totals.duty}</dd></div>
      <div><dt>{t("Payable import VAT")}</dt><dd className="text-[18px] font-medium tabular-nums text-[var(--md-ink)]">£{result.totals.vat}</dd></div>
      <div><dt>{t("Calculated on")}</dt><dd>{result.date}</dd></div>
    </dl> : null}
    <p className="max-w-3xl">{t("Estimates only until CDS rounding is verified. Declared tax is unchanged. Totals exclude operator overrides; review those on the item.")}</p>
    {live?.error ? <p role="alert" className="text-[var(--md-red)]">{t(live.error)}</p> : live && !result && live.issues[0] ? <p role="status">{t(live.issues[0])}</p> : null}
    {error ? <div role="alert" className="flex flex-wrap items-center gap-2 text-[var(--md-red)]"><p>{t(error)}</p>{historyError ? <Button type="button" variant="ghost" size="sm" disabled={loading || calculating} onClick={() => void reload()}>{t("Reload history")}</Button> : null}</div> : null}
    {!!result?.issues.length && <div className="space-y-1 border-t border-[var(--md-line)] pt-3"><h3 className="font-medium text-[var(--md-ink)]">{t("Before these figures can be used")}</h3><ul className="list-disc space-y-1 ps-4">{result.issues.map((issue, index) => <li key={index}>{t(readableIssue(issue))}</li>)}</ul></div>}
    <details><summary className="cursor-pointer rounded-[var(--md-radius-sm)] font-medium text-[var(--md-ink)] focus-visible:outline-2 focus-visible:outline-[var(--md-accent)]">{t(result ? "Review item results" : "Set up item calculations")}</summary><ul className="mt-2 max-h-72 divide-y divide-[var(--md-line)] overflow-y-auto">{draft.items.map((item, index) => {
      const line = lines.get(item.id)
      return <li key={item.id} className="py-2"><button type="button" className="flex w-full flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-[var(--md-radius-sm)] text-start hover:text-[var(--md-accent)] focus-visible:outline-2 focus-visible:outline-[var(--md-accent)]" onClick={() => onOpenItem(item.id)}><span className="min-w-0 flex-1 basis-48 break-words">{index + 1} · {item.description || item.commodityCode || t("Goods line")}</span><span className="tabular-nums">{stale ? t("Out of date") : !line ? t("Set up calculation") : line.status === "needs-information" ? t("Needs information") : `${t("Duty")} £${line.duty} · ${t("VAT")} £${line.vat}`}</span></button>{line?.issues.length ? <p className="mt-1 max-w-3xl">{t(readableIssue(line.issues[0]))}</p> : null}</li>
    })}</ul></details>
  </section>
}
