import { Input } from "@/components/ui/input"
import type { FallbackValueWorksheet } from "../../../supabase/functions/_shared/customs-fallback-valuation.mts"
import { ComparableValuationEditor } from "./customs-comparable-valuation-editor"
import { DeductiveValuationEditor } from "./customs-deductive-valuation-editor"

/** Item-specific Method 6 worksheet, not a general-purpose gallery component. */
export function FallbackValuationEditor({ value, onChange, t }: {
  value?: FallbackValueWorksheet; onChange: (value: FallbackValueWorksheet) => void; t: (value: string) => string
}) {
  const worksheet: FallbackValueWorksheet = value ?? {
    basis: "supplier-uk-export-price", earlierMethodReasons: { "1": "", "2": "", "3": "", "4": "", "5": "" },
    supplierEvidence: "", priceListEvidence: "", applicabilityEvidence: "", adjustmentReviewEvidence: "",
    quantity: "", unit: "", unitPrice: "", currency: "",
  }
  const patch = (change: Partial<FallbackValueWorksheet>) => onChange({ ...worksheet, ...change })
  const control = "h-8 w-full min-w-0 rounded-[var(--md-radius-md)] bg-[var(--md-input-bg)] px-2 text-[12px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)]"
  return <details open className="space-y-3">
    <summary className="cursor-pointer font-medium text-[var(--md-ink)]">{t("Method 6 — fallback valuation worksheet")}</summary>
    <p>{t("Explain why Methods 1–5 could not be used, then document the basis and its calculation. These evidence-led estimates do not certify eligibility.")}</p>
    <label>{t("Fallback valuation basis")}<select className={control} value={worksheet.basis} onChange={event => patch({ basis: event.target.value as FallbackValueWorksheet["basis"] })}>
      <option value="supplier-uk-export-price">{t("Supplier UK export price")}</option>
      <option value="flexible-comparable">{t("Comparable imports — flexible production country")}</option>
      <option value="flexible-deductive">{t("UK sales — extended sales period")}</option>
    </select></label>
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
      {worksheet.basis === "supplier-uk-export-price" ? ([['quantity', 'Item quantity to value'], ['unit', 'Quantity unit'], ['unitPrice', 'Supplier export price per unit'], ['currency', 'Export price currency'], ['supplierEvidence', 'Supplier identity and evidence'], ['priceListEvidence', 'Current UK export price list evidence'], ['applicabilityEvidence', 'Why this price applies to these goods'], ['adjustmentReviewEvidence', 'Included costs and required adjustments review']] as const).map(([key, label]) => <label key={key}>{t(label)}<Input className={control} inputMode={key === 'quantity' || key === 'unitPrice' ? 'decimal' : undefined} maxLength={key === 'currency' ? 3 : undefined} value={worksheet[key]} onChange={event => patch({ [key]: key === 'currency' ? event.target.value.toUpperCase() : event.target.value })} /></label>) : <label>{t("Evidence and justification for the flexibility")}<Input className={control} value={worksheet.flexibilityEvidence ?? ""} onChange={event => patch({ flexibilityEvidence: event.target.value })} /></label>}
      {(["1", "2", "3", "4", "5"] as const).map(method => <label key={method}>{t(`Why Method ${method} could not be used`)}<Input className={control} value={worksheet.earlierMethodReasons[method]} onChange={event => patch({ earlierMethodReasons: { ...worksheet.earlierMethodReasons, [method]: event.target.value } })} /></label>)}
    </div>
    {worksheet.basis === "flexible-comparable" ? <>
      <label>{t("Comparable goods basis")}<select className={control} value={worksheet.comparableWorksheet?.method ?? "2"} onChange={event => patch({ comparableWorksheet: { productionCountry: "", quantity: "", unit: "", method1Unavailable: "", comparables: [], ...worksheet.comparableWorksheet, method: event.target.value as "2" | "3" } })}><option value="2">{t("Identical goods")}</option><option value="3">{t("Similar goods")}</option></select></label>
      <ComparableValuationEditor method={worksheet.comparableWorksheet?.method ?? "2"} value={worksheet.comparableWorksheet} onChange={value => patch({ comparableWorksheet: value })} t={t} fallback />
    </> : null}
    {worksheet.basis === "flexible-deductive" ? <DeductiveValuationEditor value={worksheet.deductiveWorksheet} onChange={value => patch({ deductiveWorksheet: value })} t={t} fallback /> : null}
  </details>
}
