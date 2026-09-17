import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { deductiveCategories, type DeductiveValueWorksheet } from "../../../supabase/functions/_shared/customs-deductive-valuation.mts"

/** Item-specific Method 4 worksheet, not a general-purpose gallery component. */
export function DeductiveValuationEditor({ value, onChange, t, fallback = false }: {
  fallback?: boolean
  value?: DeductiveValueWorksheet; onChange: (value: DeductiveValueWorksheet) => void; t: (value: string) => string
}) {
  const worksheet: DeductiveValueWorksheet = value ?? {
    quantity: "", unit: "", earlierMethodReasons: { "1": "", "2": "", "3": "" }, salesEvidence: "", timingEvidence: "",
    commercialDeduction: "commission", processedGoods: false, sales: [],
    deductions: deductiveCategories.map(category => ({ category, amountPerUnitGbp: "", evidence: "" })),
  }
  const patch = (change: Partial<DeductiveValueWorksheet>) => onChange({ ...worksheet, ...change })
  const control = "h-8 w-full min-w-0 rounded-[var(--md-radius-md)] bg-[var(--md-input-bg)] px-2 text-[12px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)]"
  const labels = { "commission-or-profit": "Commission or usual profit and expenses", "uk-delivery": "UK transport, insurance and associated costs", "uk-duties-and-taxes": "Included UK duties and internal taxes", "uk-processing": "Value added by UK processing" }
  return <details open className="space-y-3">
    <summary className="cursor-pointer font-medium text-[var(--md-ink)]">{t(fallback ? "Method 6 — sales and deductions" : "Method 4 — sales and deductions worksheet")}</summary>
    <p>{t("Record actual eligible sales to unrelated UK buyers. The calculation groups quantities sold at each price and selects the price with the greatest total quantity. Deductions are per unit in GBP and need evidence, including zero amounts. Unsold-goods deposits and account-sales schemes require their separate treatment.")}</p>
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
      {([['quantity', 'Item quantity to value'], ['unit', 'Quantity unit'], ['salesEvidence', 'Sales invoices or agreed evidence'], ['timingEvidence', 'Evidence that sales fall within the applicable period']] as const).map(([key, label]) => <label key={key}>{t(label)}<Input className={control} value={worksheet[key]} onChange={event => patch({ [key]: event.target.value })} /></label>)}
      {(["1", "2", "3"] as const).map(method => <label key={method}>{t(`Why Method ${method} could not be used`)}<Input className={control} value={worksheet.earlierMethodReasons[method]} onChange={event => patch({ earlierMethodReasons: { ...worksheet.earlierMethodReasons, [method]: event.target.value } })} /></label>)}
      <label>{t("Commercial deduction basis")}<select className={control} value={worksheet.commercialDeduction} onChange={event => patch({ commercialDeduction: event.target.value as DeductiveValueWorksheet["commercialDeduction"] })}><option value="commission">{t("Commission")}</option><option value="profit-general-expenses">{t("Usual profit and general expenses")}</option></select></label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={worksheet.processedGoods} onChange={event => patch({ processedGoods: event.target.checked })} />{t("Goods were processed in the UK before sale")}</label>
      {worksheet.processedGoods ? <label>{t("Processing eligibility and identifiable added-value evidence")}<Input className={control} value={worksheet.processingEligibilityEvidence ?? ""} onChange={event => patch({ processingEligibilityEvidence: event.target.value })} /></label> : null}
    </div>
    {worksheet.sales.map((sale, index) => {
      const update = (change: Partial<typeof sale>) => patch({ sales: worksheet.sales.map(current => current.id === sale.id ? { ...current, ...change } : current) })
      return <fieldset key={sale.id} className="grid min-w-0 gap-3 border-t border-[var(--md-line)] pt-2 sm:grid-cols-2">
        <legend className="font-medium">{t(`Sale ${index + 1}`)}</legend>
        {([['quantity', 'Quantity sold'], ['unitPriceGbp', 'Unit selling price (GBP)'], ['evidence', 'Sale evidence']] as const).map(([key, label]) => <label key={key}>{t(label)}<Input aria-label={`${t(`Sale ${index + 1}`)}: ${t(label)}`} className={control} value={sale[key]} onChange={event => update({ [key]: event.target.value })} /></label>)}
        <label className="flex items-center gap-2"><input type="checkbox" checked={sale.unrelatedUkBuyer} onChange={event => update({ unrelatedUkBuyer: event.target.checked })} />{t("Confirmed unrelated UK buyer")}</label>
        <Button type="button" variant="ghost" size="sm" className="justify-self-start" aria-label={t(`Remove sale ${index + 1}`)} onClick={() => patch({ sales: worksheet.sales.filter(current => current.id !== sale.id) })}>{t("Remove sale")}</Button>
      </fieldset>
    })}
    <Button type="button" variant="secondary" size="sm" disabled={worksheet.sales.length >= 1000} onClick={() => patch({ sales: [...worksheet.sales, { id: crypto.randomUUID(), quantity: "", unitPriceGbp: "", unrelatedUkBuyer: false, evidence: "" }] })}>{t("Add sale")}</Button>
    {worksheet.deductions.map((deduction, index) => {
      const update = (change: Partial<typeof deduction>) => patch({ deductions: worksheet.deductions.map((current, position) => position === index ? { ...current, ...change } : current) })
      const label = t(labels[deduction.category])
      return <fieldset key={deduction.category} className="grid min-w-0 gap-3 border-t border-[var(--md-line)] pt-2 sm:grid-cols-2"><legend className="font-medium">{label}</legend>
        <label>{t("Deduction per unit (GBP)")}<Input aria-label={`${label}: ${t("Deduction per unit (GBP)")}`} className={control} inputMode="decimal" value={deduction.amountPerUnitGbp} onChange={event => update({ amountPerUnitGbp: event.target.value })} /></label>
        <label>{t("Deduction evidence")}<Input aria-label={`${label}: ${t("Deduction evidence")}`} className={control} value={deduction.evidence} onChange={event => update({ evidence: event.target.value })} /></label>
      </fieldset>
    })}
  </details>
}
