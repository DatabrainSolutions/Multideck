import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { QuotaAllocationReview } from "../../../supabase/functions/_shared/customs-quota-allocation.mts"
import type { CalculationResult } from "../../../supabase/functions/_shared/customs-duty-calculation.mts"

export function QuotaAllocationEditor({ itemId, commodity, origin, orderNumber, preferenceCode, dataset, value, onChange, ledger, options, stale, t }: {
  itemId: string; commodity: string; origin: string; orderNumber: string; preferenceCode: string; dataset: "uk" | "xi"
  value?: QuotaAllocationReview; onChange: (value: QuotaAllocationReview | undefined) => void
  ledger?: CalculationResult["quotaAllocationLedger"]; stale: boolean; t: (value: string) => string
  options?: NonNullable<CalculationResult["quotaOptions"]>[number]
}) {
  const control = "h-8 w-full min-w-0 rounded-[var(--md-radius-md)] bg-[var(--md-input-bg)] px-2 text-[12px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] focus-visible:outline-2 focus-visible:outline-[var(--md-accent)]"
  const patch = (change: Partial<QuotaAllocationReview>) => { if (value) onChange({ ...value, ...change }) }
  const changed = value && (value.commodity !== commodity || value.origin !== origin || value.orderNumber !== orderNumber || value.preferenceCode !== preferenceCode || value.dataset !== dataset)
  const allocation = ledger?.allocations.find(row => row.itemIds.includes(itemId))
  const measures = options?.commodity === commodity && options.origin === origin && options.orderNumber === orderNumber && options.preferenceCode === preferenceCode && options.dataset === dataset ? options.options : []
  const amount = (fraction: { numerator: string; denominator: string }) => fraction.denominator === "1" ? fraction.numerator : `${fraction.numerator} / ${fraction.denominator}`
  return <details className="space-y-3">
    <summary className="cursor-pointer rounded-[var(--md-radius-sm)] font-medium text-[var(--md-ink)] focus-visible:outline-2 focus-visible:outline-[var(--md-accent)]">{t("Quota allocation evidence")}</summary>
    <p>{t("Record the allocation received from customs. A request or available quota balance is not an allocation. The calculation checks the quota rate and quantities against this evidence; declared tax is unchanged.")}</p>
    <p>{t("Quota")}: {orderNumber || t("Not entered")} · {t("Origin")}: {origin || t("Not selected")}</p>
    {!value ? <>
      {(!commodity || !origin || !orderNumber) ? <p>{t("Complete the item’s commodity, origin and quota order number first.")}</p> : null}
      <Button type="button" variant="outline" size="sm" disabled={!commodity || !origin || !orderNumber} onClick={() => onChange({ commodity, origin, orderNumber, preferenceCode, dataset, measureId: "", status: "requested", allocatedQuantity: "", unit: "KGM", allocationReference: "", validFrom: "", validTo: "", evidence: "" })}>{t("Add allocation evidence")}</Button>
    </> : <>
      {changed ? <p role="status" className="text-[var(--md-amber)]">{t("This evidence refers to previous item details. Remove it and record the allocation for the current item.")}</p> : null}
      <div className="grid min-w-0 gap-x-4 gap-y-3 sm:grid-cols-2">
        <label>{t("Allocation status")}<select className={control} value={value.status} onChange={event => patch({ status: event.target.value as QuotaAllocationReview["status"] })}><option value="requested">{t("Requested — not allocated")}</option><option value="allocated">{t("Allocation confirmed")}</option><option value="rejected">{t("Rejected")}</option></select></label>
        <label>{t("Allocation reference")}<Input className={control} value={value.allocationReference} onChange={event => patch({ allocationReference: event.target.value })} /></label>
        <label>{t("Total allocated quantity")}<Input className={control} inputMode="decimal" value={value.allocatedQuantity} onChange={event => patch({ allocatedQuantity: event.target.value })} /></label>
        <label>{t("Quota unit code")}<Input className={control} maxLength={3} value={value.unit} onChange={event => patch({ unit: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} /></label>
        <label>{t("Valid from")}<Input className={control} type="date" value={value.validFrom} onChange={event => patch({ validFrom: event.target.value })} /></label>
        <label>{t("Valid until")}<Input className={control} type="date" value={value.validTo} onChange={event => patch({ validTo: event.target.value })} /></label>
        <label className="sm:col-span-2">{t("Allocation evidence or document reference")}<Input className={control} value={value.evidence} onChange={event => patch({ evidence: event.target.value })} /></label>
        <label className="sm:col-span-2">{t("Quota tariff measure")}<select className={control} value={value.measureId} onChange={event => patch({ measureId: event.target.value })}>
          <option value="">{t("Use the single matching measure")}</option>
          {value.measureId && !measures.some(row => row.id === value.measureId) ? <option value={value.measureId}>{value.measureId} — {t("not in the latest options")}</option> : null}
          {measures.map(row => <option key={row.id} value={row.id}>{row.id} · {row.description}{row.legalBasis ? ` — ${row.legalBasis}` : ""}</option>)}
        </select></label>
        {!preferenceCode.startsWith("1") ? <label className="sm:col-span-2">{t("Preferential-origin evidence")}<Input className={control} value={value.originEvidence ?? ""} onChange={event => patch({ originEvidence: event.target.value })} /></label> : null}
      </div>
      <p>{t("For KGM, each item uses its saved net mass. Other units need an evidenced tariff quantity. If items share one allocation, use the same reference and total allocated quantity on each row.")}</p>
      <p>{t("Calculate with official rates to load matching measures. Several matches need an explicit choice supported by your evidence. Previous choices are rechecked after changes.")}</p>
      <Button type="button" variant="ghost" size="sm" onClick={() => onChange(undefined)}>{t("Remove allocation evidence from draft")}</Button>
    </>}
    {ledger ? <div aria-label={t("Quota quantity check")} className="space-y-1">
      {stale ? <p role="status">{t("Previous quantity check — recalculate after your changes.")}</p> : null}
      {ledger.issues.map((issue, index) => <p key={index} className="text-[var(--md-amber)]">{t(issue)}</p>)}
      {allocation ? <p>{t("Across this declaration")}: {amount(allocation.used)} {allocation.unit} {t("used from")} {amount(allocation.allocated)} {allocation.unit}; {amount(allocation.remaining)} {allocation.unit} {t("remaining")}. {t("This is not a balance across other declarations.")}</p> : null}
    </div> : null}
  </details>
}
