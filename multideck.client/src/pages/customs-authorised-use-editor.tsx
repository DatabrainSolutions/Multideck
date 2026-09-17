import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AUTHORISED_USE_SOURCE, type AuthorisedUseReview } from "../../../supabase/functions/_shared/customs-authorised-use.mts"
import type { CalculationResult } from "../../../supabase/functions/_shared/customs-duty-calculation.mts"

export function AuthorisedUseEditor({ value, commodity, origin, preferenceCode, options, stale, onChange, t }: {
  value?: AuthorisedUseReview; commodity: string; origin: string; preferenceCode: string
  options?: NonNullable<CalculationResult["authorisedUseOptions"]>[number]; stale: boolean
  onChange: (value: AuthorisedUseReview | undefined) => void; t: (value: string) => string
}) {
  const control = "mt-1 h-9 w-full min-w-0 rounded-[var(--md-radius-md)] border-0 bg-[var(--md-input-bg)] px-2 text-[12px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] focus-visible:outline-2 focus-visible:outline-[var(--md-accent)]"
  const choices = options?.code === commodity && options.origin === origin && options.preferenceCode === preferenceCode ? options.options : []
  const patch = (change: Partial<AuthorisedUseReview>) => value && onChange({ ...value, ...change })
  return <details className="min-w-0 space-y-3">
    <summary className="cursor-pointer font-medium text-[var(--md-ink)]">{t("Authorised use — duty relief evidence")}</summary>
    <p>{t("For a GB 4400 entry with preference 140 or 115. The official tariff supplies the duty rate; VAT is calculated separately. This review does not confirm that the required use has been completed.")}</p>
    {!value ? <Button type="button" variant="outline" disabled={!commodity || !origin} onClick={() => onChange({ commodity, origin, dataset: "uk", measureId: "", validFrom: "", validTo: "", completionDueDate: "", authorisationReference: "", authorisationEvidence: "", prescribedUseEvidence: "", supervisionEvidence: "" })}>{t("Add authorised-use evidence")}</Button> : <>
      {value.commodity !== commodity || value.origin !== origin ? <p role="status" className="text-[var(--md-amber)]">{t("This evidence belongs to the previous commodity or origin. Remove it and add a new review for this item.")}</p> : null}
      <fieldset className="grid min-w-0 gap-x-4 gap-y-3 sm:grid-cols-2">
        <legend className="sr-only">{t("Authorised-use evidence")}</legend>
        <label className="min-w-0 sm:col-span-2">{t("N990 authorisation reference")}<Input className={control} value={value.authorisationReference} onChange={event => patch({ authorisationReference: event.target.value })} /></label>
        <p className="sm:col-span-2">{t("Use the GB EUS decision reference. Declare the same N990 reference in this item’s additional documents; this worksheet does not add it for you.")}</p>
        <label>{t("Authorisation valid from")}<Input className={control} type="date" value={value.validFrom} onChange={event => patch({ validFrom: event.target.value })} /></label>
        <label>{t("Authorisation valid until")}<Input className={control} type="date" value={value.validTo} onChange={event => patch({ validTo: event.target.value })} /></label>
        <label>{t("Required use — completion due")}<Input className={control} type="date" value={value.completionDueDate} onChange={event => patch({ completionDueDate: event.target.value })} /></label>
        {([["authorisationEvidence", "Authorisation scope and supporting record"], ["prescribedUseEvidence", "How these goods qualify for the prescribed use"], ["supervisionEvidence", "Stock records and customs supervision arrangements"]] as const).map(([key, label]) => <label key={key} className="min-w-0 sm:col-span-2">{t(label)}<textarea className={`${control} h-auto min-h-20 resize-y py-2 leading-relaxed`} rows={3} value={value[key]} onChange={event => patch({ [key]: event.target.value })} /></label>)}
        <label className="min-w-0 sm:col-span-2">{t("Official authorised-use measure")}<select className={control} value={value.measureId} onChange={event => patch({ measureId: event.target.value })}>
          <option value="">{t("Select a measure after calculating")}</option>
          {value.measureId && !choices.some(choice => choice.id === value.measureId) ? <option value={value.measureId}>{value.measureId} — {t("not in the latest options")}</option> : null}
          {choices.map(choice => <option key={choice.id} value={choice.id}>{choice.id} · {choice.description}</option>)}
        </select></label>
      </fieldset>
      <p>{t("Calculate to load the tariff choices, then select the measure supported by your authorisation. Missing evidence leaves the estimate incomplete.")}</p>
      {options && stale ? <p role="status">{t("These choices are from the previous calculation and will be checked again.")}</p> : null}
      {choices.find(choice => choice.id === value.measureId)?.legalBasis ? <p className="break-words">{choices.find(choice => choice.id === value.measureId)!.legalBasis}</p> : null}
      <Button type="button" variant="ghost" onClick={() => onChange(undefined)}>{t("Remove authorised-use review from draft")}</Button>
    </>}
    <a href={AUTHORISED_USE_SOURCE} target="_blank" rel="noreferrer" className="text-[var(--md-accent)] underline">{t("Read HMRC authorised-use guidance")}</a>
  </details>
}
