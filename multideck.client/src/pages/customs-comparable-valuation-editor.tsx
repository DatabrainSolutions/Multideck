import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { ComparableValueWorksheet } from "../../../supabase/functions/_shared/customs-comparable-valuation.mts"

type Candidate = ComparableValueWorksheet["comparables"][number]
/** Declaration-specific worksheet section, not a reusable gallery primitive. */
export function ComparableValuationEditor({ method, value, onChange, t, fallback = false }: {
  fallback?: boolean
  method: "2" | "3"; value?: ComparableValueWorksheet; onChange: (value: ComparableValueWorksheet) => void; t: (value: string) => string
}) {
  const worksheet = value ?? { method, productionCountry: "", quantity: "", unit: "", method1Unavailable: "", method2Unavailable: "", comparables: [] }
  const patch = (change: Partial<ComparableValueWorksheet>) => onChange({ ...worksheet, ...change, method })
  const control = "h-8 w-full min-w-0 rounded-[var(--md-radius-md)] bg-[var(--md-input-bg)] px-2 text-[12px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)]"
  const fields = [
    ["acceptedMethod1Entry", "Accepted Method 1 entry reference"], ["productionCountry", "Production country (two-letter code)"],
    ["quantity", "Comparable shipment quantity"], ["unit", "Quantity unit"], ["acceptedUnitValueGbp", "Accepted customs value per unit (GBP)"],
    ["comparabilityEvidence", "Identical or similar goods evidence"], ["reasonableTimeEvidence", "Comparable timing and stable-price evidence"],
    ["producerSelectionEvidence", "Producer selection evidence"], ["commercialUnitAdjustmentGbp", "Commercial adjustment per unit (GBP)"],
    ["commercialAdjustmentEvidence", "Commercial adjustment evidence"], ["deliveryAdjustmentGbp", "Delivery difference for this item (GBP)"], ["deliveryAdjustmentEvidence", "Delivery difference evidence"],
  ] as const
  const add = () => patch({ comparables: [...worksheet.comparables, {
    id: crypto.randomUUID(), productionCountry: "", sameProducer: false, sameCommercialLevel: false,
    quantity: "", unit: "", acceptedMethod1Entry: "", comparabilityEvidence: "", reasonableTimeEvidence: "", producerSelectionEvidence: "",
    acceptedUnitValueGbp: "", commercialUnitAdjustmentGbp: "", commercialAdjustmentEvidence: "", deliveryAdjustmentGbp: "", deliveryAdjustmentEvidence: "",
  }] })
  return <details open className="space-y-3">
    <summary className="cursor-pointer font-medium text-[var(--md-ink)]">{t(fallback ? "Method 6 — comparable imports" : method === "2" ? "Method 2 — identical goods worksheet" : "Method 3 — similar goods worksheet")}</summary>
    <p>{t("Use accepted GBP customs values, not invoice prices. Record every relevant comparable and evidence for commercial and delivery differences, including zero adjustments. Enter deductions as negative amounts. Do not add the same delivery costs again in adjustments.")}</p>
    {value && value.method !== method ? <p role="status">{t("The valuation method changed. Review and update this worksheet before calculating.")}</p> : null}
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
      {([['productionCountry', 'Goods production country (two-letter code)'], ['quantity', 'Item quantity to value'], ['unit', 'Item quantity unit'], ['method1Unavailable', 'Why Method 1 could not be used']] as const).map(([key, label]) => <label key={key}>{t(label)}<Input className={control} value={worksheet[key]} onChange={event => patch({ [key]: event.target.value })} /></label>)}
      {method === "3" ? <label>{t("Why Method 2 could not be used")}<Input className={control} value={worksheet.method2Unavailable ?? ""} onChange={event => patch({ method2Unavailable: event.target.value })} /></label> : null}
    </div>
    {worksheet.comparables.map((candidate, index) => {
      const update = (change: Partial<Candidate>) => patch({ comparables: worksheet.comparables.map(current => current.id === candidate.id ? { ...current, ...change } : current) })
      return <fieldset key={candidate.id} className="grid min-w-0 gap-3 border-t border-[var(--md-line)] pt-2 sm:grid-cols-2">
        <legend className="font-medium">{t(`Comparable import ${index + 1}`)}</legend>
        {fields.map(([key, label]) => <label key={key}>{t(label)}<Input aria-label={`${t(`Comparable import ${index + 1}`)}: ${t(label)}`} className={control} value={candidate[key]} onChange={event => update({ [key]: event.target.value })} /></label>)}
        <label className="flex items-center gap-2"><input type="checkbox" checked={candidate.sameProducer} onChange={event => update({ sameProducer: event.target.checked })} />{t("Same producer as the goods being valued")}</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={candidate.sameCommercialLevel} onChange={event => update({ sameCommercialLevel: event.target.checked })} />{t("Same commercial level")}</label>
        <Button type="button" variant="ghost" size="sm" className="justify-self-start" aria-label={t(`Remove comparable import ${index + 1}`)} onClick={() => patch({ comparables: worksheet.comparables.filter(current => current.id !== candidate.id) })}>{t("Remove comparable")}</Button>
      </fieldset>
    })}
    <Button type="button" variant="secondary" size="sm" disabled={worksheet.comparables.length >= 100} onClick={add}>{t("Add comparable import")}</Button>
  </details>
}
