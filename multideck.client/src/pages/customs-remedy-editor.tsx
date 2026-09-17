import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { RemedyReview } from "../../../supabase/functions/_shared/customs-trade-remedies.mts"
import type { CalculationResult } from "../../../supabase/functions/_shared/customs-duty-calculation.mts"

export function RemedyEditor({ value, onChange, commodity, origin, options, supported, t }: {
  value?: RemedyReview; onChange: (value: RemedyReview | undefined) => void; commodity: string; origin: string; supported: boolean
  options?: NonNullable<CalculationResult["remedyOptions"]>[number]; t: (value: string) => string
}) {
  const control = "h-9 w-full min-w-0 rounded-[var(--md-radius-md)] bg-[var(--md-input-bg)] px-2 text-[12px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] focus-visible:outline-2 focus-visible:outline-[var(--md-accent)]"
  const choices = options?.code === commodity && options.origin === origin && options.dataset === "uk" ? options.options : []
  const patch = (change: Partial<RemedyReview>) => { if (value) onChange({ ...value, ...change }) }
  return <details className="min-w-0 space-y-3"><summary className="cursor-pointer font-medium text-[var(--md-ink)]">{t("Trade remedies — exporter evidence")}</summary>
    <p>{t("Review the exporter and legal measure. Provisional duties remain separate security amounts. Save and calculate to refresh tariff choices.")}</p>
    {!supported ? <p role="status">{t("This treatment needs its Northern Ireland or special-procedure review.")}</p> : null}
    {!value ? <Button type="button" variant="outline" disabled={!supported || !commodity || !origin} onClick={() => onChange({ commodity, origin, dataset: "uk", validFrom: "", validTo: "", originEvidence: "", exporterEvidence: "", legalEvidence: "", selections: [] })}>{t("Add remedy evidence")}</Button> : <>
      {value.commodity !== commodity || value.origin !== origin ? <p role="status">{t("The item changed. Replace this review before calculating.")}</p> : null}
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">{([ ["validFrom", "Evidence valid from"], ["validTo", "Evidence valid until"], ["originEvidence", "Non-preferential origin evidence"], ["exporterEvidence", "Exporter or producer evidence"], ["legalEvidence", "Legal measure and evidence"] ] as const).map(([key, label]) => <label key={key} className={key.endsWith("Evidence") ? "min-w-0 sm:col-span-2" : "min-w-0"}>{t(label)}<Input type={key.startsWith("valid") ? "date" : "text"} className={control} value={value[key]} onChange={e => patch({ [key]: e.target.value })} /></label>)}</div>
      {value.selections.map((row, index) => <div key={index} className="min-w-0 space-y-2"><div className="flex min-w-0 items-end gap-2"><label className="min-w-0 flex-1">{t(`Remedy measure ${index + 1}`)}<select className={control} value={row.measureId} onChange={e => patch({ selections: value.selections.map((entry, i) => i === index ? { measureId: e.target.value, additionalCode: choices.find(o => o.id === e.target.value)?.additionalCode ?? "" } : entry) })}>
        <option value="">{t("Select a tariff measure")}</option>{row.measureId && !choices.some(o => o.id === row.measureId) ? <option value={row.measureId}>{row.measureId} — {t("not in current options")}</option> : null}{choices.map(o => <option key={o.id} value={o.id}>{o.additionalCode || o.id} · {o.description} — {o.legalBasis}</option>)}
      </select></label><Button type="button" variant="ghost" aria-label={t(`Remove remedy measure ${index + 1}`)} onClick={() => patch({ selections: value.selections.filter((_, i) => i !== index) })}>{t("Remove")}</Button></div>
      {row.signedInvoice || choices.find(o => o.id === row.measureId)?.signedInvoiceRequired ? <div className="grid min-w-0 gap-2 sm:grid-cols-2">
        <p className="sm:col-span-2">{t("This exporter rate requires a signed invoice. Add the same reference as a D008 document on this item, then record your review here.")}</p>
        {([ ["reference", "Signed invoice reference"], ["evidence", "Signed declaration review"] ] as const).map(([key, label]) => <label key={key} className="min-w-0">{t(label)}<Input className={control} value={row.signedInvoice?.[key] ?? ""} onChange={e => patch({ selections: value.selections.map((entry, i) => i === index ? { ...entry, signedInvoice: { reference: row.signedInvoice?.reference ?? "", evidence: row.signedInvoice?.evidence ?? "", [key]: e.target.value } } : entry) })} /></label>)}
      </div> : null}</div>)}
      <Button type="button" variant="outline" disabled={!supported || value.selections.length >= 4} onClick={() => patch({ selections: [...value.selections, { measureId: "", additionalCode: "" }] })}>{t("Add remedy measure")}</Button>
      <p>{t("The exporter code must also appear in this item’s TARIC additional codes. Selecting a measure does not confirm eligibility; all evidence is rechecked when you calculate.")}</p>
      <Button type="button" variant="ghost" onClick={() => onChange(undefined)}>{t("Remove remedy review")}</Button>
    </>}
  </details>
}
