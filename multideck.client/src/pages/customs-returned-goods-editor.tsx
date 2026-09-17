import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { RETURNED_GOODS_GUIDANCE, type ReturnedGoodsReview } from "../../../supabase/functions/_shared/customs-returned-goods.mts"

/** Item-specific evidence. Calculations use the existing server and audit flow. */
export function ReturnedGoodsEditor({ value, onChange, additionalProcedure, importerEori, t }: {
  value?: ReturnedGoodsReview; onChange: (value: ReturnedGoodsReview | undefined) => void
  additionalProcedure: string; importerEori: string; t: (value: string) => string
}) {
  const initial: ReturnedGoodsReview = { exportDate: "", exportReference: "", exportItemReference: "", exportTerritory: "", exporterEori: "", goodsIdentityEvidence: "", freeCirculationEvidence: "", unchangedGoodsEvidence: "", valuationEvidence: "", repaymentEvidence: "", ordinaryGoodsConfirmed: false, noProcessingConfirmed: false, vatEligibilityEvidence: "" }
  const patch = (change: Partial<ReturnedGoodsReview>) => onChange({ ...(value ?? initial), ...change })
  const control = "mt-1 h-8 w-full min-w-0 rounded-[var(--md-radius-md)] bg-[var(--md-input-bg)] px-2 text-[12px] text-[var(--md-ink)] premium-stroke-soft focus-visible:outline-2 focus-visible:outline-[var(--md-accent)]"
  const fields = [["exportReference", "Export reference"], ["exportItemReference", "Exported item reference"], ["goodsIdentityEvidence", "Returned goods and quantities"], ["freeCirculationEvidence", "Free-circulation status at export"], ["unchangedGoodsEvidence", "Unchanged condition"], ["valuationEvidence", "Reimport value and valuation method"], ["repaymentEvidence", "Export refunds repaid, or none outstanding"], ["timeLimitWaiverEvidence", "HMRC time-limit waiver (if over three years)"]] as const
  return <details className="space-y-3">
    <summary className="cursor-pointer rounded-[var(--md-radius-sm)] font-medium text-[var(--md-ink)] focus-visible:outline-2 focus-visible:outline-[var(--md-accent)]">{t("Returned-goods relief")}</summary>
    <p>{t("F01 relieves duty only; F05 also relieves VAT when the same-entity conditions are met. This review covers GB returns under 6110 or 6123.")}</p>
    {!value ? <Button type="button" variant="outline" size="sm" onClick={() => onChange(initial)}>{t("Add returned-goods review")}</Button> : <>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <label className="min-w-0">{t("Export territory")}<select className={control} value={value.exportTerritory} onChange={event => patch({ exportTerritory: event.target.value as ReturnedGoodsReview["exportTerritory"] })}><option value="">{t("Select territory")}</option><option value="GB">{t("Great Britain")}</option></select></label>
        <label className="min-w-0">{t("Export date")}<Input className={control} type="date" value={value.exportDate} onChange={event => patch({ exportDate: event.target.value })} /></label>
        {fields.map(([key, label]) => <label key={key} className="min-w-0">{t(label)}<Input className={control} value={value[key] ?? ""} onChange={event => patch({ [key]: event.target.value })} /></label>)}
        <label className="flex min-w-0 items-start gap-2 sm:col-span-2"><input className="mt-0.5 size-4 shrink-0 accent-[var(--md-accent)]" type="checkbox" checked={value.ordinaryGoodsConfirmed} onChange={event => patch({ ordinaryGoodsConfirmed: event.target.checked })} /><span>{t("Ordinary goods: no agricultural, excise, authorised-use or processing relief conditions")}</span></label>
        <label className="flex min-w-0 items-start gap-2 sm:col-span-2"><input className="mt-0.5 size-4 shrink-0 accent-[var(--md-accent)]" type="checkbox" checked={value.noProcessingConfirmed} onChange={event => patch({ noProcessingConfirmed: event.target.checked })} /><span>{t("No repair or processing was carried out overseas")}</span></label>
      </div>
      {additionalProcedure === "F05" ? <fieldset className="grid min-w-0 gap-3 sm:grid-cols-2">
        <legend className="mb-2 font-medium text-[var(--md-ink)]">{t("VAT relief")}</legend>
        <label className="min-w-0">{t("Original exporter EORI")}<Input className={control} value={value.exporterEori} onChange={event => patch({ exporterEori: event.target.value })} /></label>
        <label className="min-w-0">{t("Same-entity and VAT eligibility evidence")}<Input className={control} value={value.vatEligibilityEvidence} onChange={event => patch({ vatEligibilityEvidence: event.target.value })} /></label>
        <p className="break-words sm:col-span-2">{t("Current importer EORI")}: {importerEori || t("Not entered")}. {t("Both EORIs must match, including the prefix. Review any overseas sale and export VAT refund.")}</p>
      </fieldset> : null}
      <p>{t("Enter evidence references for each check. Use the evidenced reimport value, not an assumed original invoice value. Save and calculate to see payable and relieved amounts. This is not HMRC approval.")}</p>
      <Button type="button" variant="ghost" size="sm" onClick={() => onChange(undefined)}>{t("Remove returned-goods review")}</Button>
    </>}
    <a className="text-[var(--md-accent)] underline" href={RETURNED_GOODS_GUIDANCE} target="_blank" rel="noreferrer">{t("HMRC returned-goods guidance")}</a>
  </details>
}

