import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { TariffPreferenceReview } from "../../../supabase/functions/_shared/customs-tariff-reference.mts"
import type { CalculationResult } from "../../../supabase/functions/_shared/customs-duty-calculation.mts"

/** Evidence for this item's requested preference, not a declaration-wide switch. */
export function PreferenceEditor({ value, onChange, preferenceCode, origin, dataset, options, stale, t, title = "Preference — proof of origin" }: {
  value?: TariffPreferenceReview; onChange: (value: TariffPreferenceReview | undefined) => void
  preferenceCode: string; origin: string; dataset: "uk" | "xi"
  options?: NonNullable<CalculationResult["preferenceOptions"]>[number]
  stale: boolean; t: (value: string) => string
  title?: string
}) {
  const eligibleCode = preferenceCode === "200" || preferenceCode === "300"
  const control = "h-8 w-full min-w-0 rounded-[var(--md-radius-md)] bg-[var(--md-input-bg)] px-2 text-[12px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] focus-visible:outline-2 focus-visible:outline-[var(--md-accent)]"
  const evidenceControl = `${control} h-auto min-h-20 resize-y py-2 leading-relaxed`
  const patch = (change: Partial<TariffPreferenceReview>) => { if (value) onChange({ ...value, ...change }) }
  const currentOptions = options?.origin === origin && options?.preferenceCode === preferenceCode && options?.dataset === dataset ? options.options : []
  return <details className="space-y-3">
    <summary className="cursor-pointer font-medium text-[var(--md-ink)]">{t(title)}</summary>
    <p>{t("The tariff supplies the rate. Your origin evidence establishes why this item can claim it. This remains an estimate, not automatic approval of a preference.")}</p>
    <p>{t("Item preference")}: {preferenceCode || t("Not selected")} · {t("Preferential origin")}: {origin || t("Not selected")}</p>
    {!eligibleCode ? <p role="status">{t(preferenceCode === "100" ? "Full duty (100): no preferential origin claim is used for this tariff. Remove any earlier origin review before calculating." : "This code needs its quota, suspension or end-use treatment. The unrestricted preference worksheet cannot establish that treatment.")}</p> : null}
    {eligibleCode && !origin ? <p role="status">{t("Select this item’s preferential origin in the expanded item details before adding evidence.")}</p> : null}
    {!value ? <Button type="button" variant="outline" disabled={!eligibleCode || !origin} onClick={() => onChange({ preferenceCode: preferenceCode as "200" | "300", origin, dataset, validFrom: "", validTo: "", proofReference: "", originRulesEvidence: "", transportEvidence: "" })}>{t(dataset === "uk" ? "Add UK origin evidence" : "Add EU origin evidence")}</Button> : <>
      {(value.preferenceCode !== preferenceCode || value.origin !== origin || value.dataset !== dataset) ? <p role="status" className="text-[var(--md-amber)]">{t("The item treatment has changed. Review and replace this worksheet; its evidence still refers to the previous treatment.")}</p> : null}
      <fieldset className="grid min-w-0 gap-x-4 gap-y-3 sm:grid-cols-2">
        <legend className="sr-only">{t(title)}</legend>
        <label className="sm:col-span-2">{t("Proof of origin — document code and reference")}<Input className={control} value={value.proofReference} onChange={event => patch({ proofReference: event.target.value })} /></label>
        <label>{t("Proof valid from")}<Input className={control} type="date" value={value.validFrom} onChange={event => patch({ validFrom: event.target.value })} /></label>
        <label>{t("Proof valid until")}<Input className={control} type="date" value={value.validTo} onChange={event => patch({ validTo: event.target.value })} /></label>
        <label className="sm:col-span-2">{t("Agreement or scheme and origin-rule evidence")}<textarea className={evidenceControl} rows={3} value={value.originRulesEvidence} onChange={event => patch({ originRulesEvidence: event.target.value })} /></label>
        <label className="sm:col-span-2">{t("Transport or non-alteration evidence")}<textarea className={evidenceControl} rows={3} value={value.transportEvidence} onChange={event => patch({ transportEvidence: event.target.value })} /></label>
        <label className="sm:col-span-2">{t("Tariff measure")}<select className={control} value={value.measureId ?? ""} onChange={event => patch({ measureId: event.target.value || undefined })}>
          <option value="">{t("Use the single matching measure")}</option>
          {value.measureId && !currentOptions.some(option => option.id === value.measureId) ? <option value={value.measureId}>{value.measureId} — {t("not in the latest options")}</option> : null}
          {currentOptions.map(option => <option key={option.id} value={option.id}>{option.id} · {option.description}{option.legalBasis ? ` — ${option.legalBasis}` : ""}</option>)}
        </select></label>
      </fieldset>
      <p>{t("Save and calculate to load the current tariff choices. If several measures match, select the one supported by your evidence. Document codes and origin eligibility need operator review.")}</p>
      {options && stale ? <p role="status">{t("Displayed tariff choices are from the previous calculation. They will be rechecked when you calculate.")}</p> : null}
      <Button type="button" variant="ghost" onClick={() => onChange(undefined)}>{t(dataset === "uk" ? "Remove UK origin evidence from draft" : "Remove EU origin evidence from draft")}</Button>
    </>}
  </details>
}
