import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { TEMPORARY_ADMISSION_PARTIAL_SOURCE, TEMPORARY_ADMISSION_NI_PARTIAL_SOURCE, TEMPORARY_ADMISSION_RELEASE_SOURCE, type TemporaryAdmissionDutyLedger, type TemporaryAdmissionReleaseWorksheet } from "../../../supabase/functions/_shared/customs-temporary-admission.mts"
import type { CalculationResult } from "../../../supabase/functions/_shared/customs-duty-calculation.mts"
import { NI_TEMPORARY_RELEASE_SOURCE, type NiTemporaryReleaseReview } from "../../../supabase/functions/_shared/customs-ni-temporary-release.mts"

/** Item-specific release evidence; saved server calculations own all arithmetic. */
export function NiTemporaryReleaseEditor({ value, onChange, t }: {
  value?: NiTemporaryReleaseReview; onChange: (value: NiTemporaryReleaseReview | undefined) => void; t: (value: string) => string
}) {
  const initial: NiTemporaryReleaseReview = { event: "normal-release", priorRelief: "total", entryDate: "", entryReference: "", entryItemReference: "", authorisationEvidence: "", goodsIdentityEvidence: "", releaseValuationEvidence: "", releaseRiskEvidence: "", noPreviousTaxPaidConfirmed: false, noProcessingConfirmed: false }
  const patch = (change: Partial<NiTemporaryReleaseReview>) => onChange({ ...(value ?? initial), ...change })
  const control = "mt-1 h-8 w-full min-w-0 rounded-[var(--md-radius-md)] bg-[var(--md-input-bg)] px-2 text-[12px] text-[var(--md-ink)] premium-stroke-soft focus-visible:outline-2 focus-visible:outline-[var(--md-accent)]"
  return <details className="space-y-3">
    <summary className="cursor-pointer rounded-[var(--md-radius-sm)] font-medium text-[var(--md-ink)] focus-visible:outline-2 focus-visible:outline-[var(--md-accent)]">{t("Northern Ireland — release after total TA relief")}</summary>
    <p>{t("For normal release under 4053 with EU at-risk treatment. Use the release transaction value and release-date rates. Prior payments, partial relief and breaches need a different calculation.")}</p>
    {!value ? <Button type="button" variant="outline" size="sm" onClick={() => onChange(initial)}>{t("Add release review")}</Button> : <>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        {([["entryDate", "Original entry date"], ["entryReference", "Original entry reference"], ["entryItemReference", "Original item reference"], ["authorisationEvidence", "Authorisation and compliant discharge — evidence"], ["goodsIdentityEvidence", "Goods identity and quantity — evidence"], ["releaseValuationEvidence", "Release value and included costs — evidence"], ["releaseRiskEvidence", "EU at-risk treatment at release — evidence"]] as const).map(([key, label]) => <label key={key} className="min-w-0">{t(label)}<Input className={control} type={key === "entryDate" ? "date" : "text"} value={value[key]} onChange={event => patch({ [key]: event.target.value })} /></label>)}
      </div>
      <label className="flex items-start gap-2"><input type="checkbox" checked={value.noPreviousTaxPaidConfirmed} onChange={event => patch({ noPreviousTaxPaidConfirmed: event.target.checked })} className="mt-1 size-4 shrink-0 accent-[var(--md-accent)]" /><span>{t("No duty or VAT was previously paid for these goods")}</span></label>
      <label className="flex items-start gap-2"><input type="checkbox" checked={value.noProcessingConfirmed} onChange={event => patch({ noProcessingConfirmed: event.target.checked })} className="mt-1 size-4 shrink-0 accent-[var(--md-accent)]" /><span>{t("No processing, destruction, waste or additional relief changes this release")}</span></label>
      <fieldset className="min-w-0 space-y-2">
        <legend className="font-medium text-[var(--md-ink)]">{t("Low-value duty review — optional")}</legend>
        <p>{t("Only select this if the consignment is not a distance sale of imported goods. A business customer or a high invoice total is not enough on its own.")}</p>
        <label className="flex items-start gap-2"><input type="checkbox" checked={!!value.lowValueExclusion} onChange={event => patch({ lowValueExclusion: event.target.checked ? { basis: "not-distance-sale", reviewDate: "", consignmentReference: "", evidence: "" } : undefined })} className="mt-1 size-4 shrink-0 accent-[var(--md-accent)]" /><span>{t("Evidence confirms this is not a distance sale")}</span></label>
        {value.lowValueExclusion ? <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          {([["reviewDate", "Review date"], ["consignmentReference", "Consignment reference"], ["evidence", "Contract or transaction evidence"]] as const).map(([key, label]) => <label className={key === "evidence" ? "min-w-0 sm:col-span-2" : "min-w-0"} key={key}>{t(label)}<Input className={control} type={key === "reviewDate" ? "date" : "text"} value={value.lowValueExclusion![key]} onChange={event => patch({ lowValueExclusion: { ...value.lowValueExclusion!, [key]: event.target.value } })} /></label>)}
          <p className="sm:col-span-2">{t("Review must cover the calculation date. The saved workings retain this evidence; it is not automatically verified.")}</p>
        </div> : null}
      </fieldset>
      <p>{t("This review supports an estimate, not an approval or a customs submission. Calculation workings retain the evidence and original entry reference.")}</p>
      <Button type="button" variant="ghost" size="sm" onClick={() => onChange(undefined)}>{t("Remove release review")}</Button>
    </>}
    <a className="text-[var(--md-accent)] underline" href={NI_TEMPORARY_RELEASE_SOURCE} target="_blank" rel="noreferrer">{t("EU customs-debt guidance for Northern Ireland")}</a>
  </details>
}

/** Item-specific worksheet. All arithmetic is performed by the saved server run. */
export function TemporaryAdmissionEditor({ value, onChange, saved, stale, procedure, jurisdiction, t }: {
  value?: TemporaryAdmissionDutyLedger
  onChange: (value: TemporaryAdmissionDutyLedger | undefined) => void
  saved?: NonNullable<CalculationResult["temporaryAdmissionLedgers"]>[number]
  stale: boolean; procedure: string; jurisdiction?: "GB" | "NI"; t: (value: string) => string
}) {
  const initial: TemporaryAdmissionDutyLedger = { jurisdiction: jurisdiction ?? "GB", event: jurisdiction === "NI" || !procedure.startsWith("53") ? "discharge" : "entry", entryAssessmentId: "", entryItemId: "", entryDutyGbp: "", fullAuthorisationEvidence: "", eligibilityEvidence: "", periodEvidence: "", chargeableMonths: 1, previouslyAssessedDutyGbp: "", previousAssessmentEvidence: "" }
  const patch = (change: Partial<TemporaryAdmissionDutyLedger>) => onChange({ ...(value ?? initial), ...change })
  const control = "h-8 w-full min-w-0 rounded-[var(--md-radius-md)] bg-[var(--md-input-bg)] px-2 text-[12px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] focus-visible:outline-2 focus-visible:outline-[var(--md-accent)]"
  const fields = [["entryAssessmentId", "Original entry assessment reference"], ["entryItemId", "Original item reference"], ["entryDutyGbp", "Full duty at original entry (£)"], ["previouslyAssessedDutyGbp", "TA duty already assessed (£)"], ["fullAuthorisationEvidence", "Full authorisation — evidence reference"], ["eligibilityEvidence", "Eligibility review — evidence reference"], ["periodEvidence", "Chargeable periods — evidence reference"], ["previousAssessmentEvidence", "Previous assessments — evidence reference"]] as const
  return <details className="space-y-3">
    <summary className="cursor-pointer font-medium text-[var(--md-ink)]">{t("Temporary admission — partial duty relief")}</summary>
    <p>{t("Duty estimate only. Use the original entry assessment in GBP, not today's tariff. VAT is separate and this worksheet does not change declared tax amounts.")}</p>
    {jurisdiction === "NI" ? <p>{t("Northern Ireland partial-relief duty is calculated on discharge, not collected using the GB first-month rule. Confirm the original tariff and risk treatment; this worksheet does not decide eligibility.")}</p> : null}
    {value && value.jurisdiction !== jurisdiction ? <p role="alert">{t("This worksheet belongs to a different jurisdiction. Remove it from the draft and add a new worksheet with the correct entry evidence. Saved history is retained.")}</p> : null}
    {!value ? <Button type="button" variant="outline" onClick={() => onChange(initial)}>{t("Add duty worksheet")}</Button> : <>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <label className="min-w-0">{t("Liability event")}<select className={control} value={value.event} onChange={event => patch({ event: event.target.value as TemporaryAdmissionDutyLedger["event"] })}><option value="entry">{t("Entry — first month")}</option><option value="discharge">{t("Discharge — remaining balance")}</option></select></label>
        <label className="min-w-0">{t("Reviewed chargeable months")}<Input className={control} type="number" min={1} step={1} value={value.chargeableMonths || ""} onChange={event => patch({ chargeableMonths: Number(event.target.value) })} /></label>
        {fields.map(([key, label]) => <label className="min-w-0" key={key}>{t(label)}<Input className={control} inputMode={key.endsWith("Gbp") ? "decimal" : "text"} value={value[key]} onChange={event => patch({ [key]: event.target.value })} /></label>)}
        {value.jurisdiction === "NI" ? <label className="min-w-0 sm:col-span-2">{t("NI entry tariff, risk and GBP conversion — evidence reference")}<Input className={control} value={value.niEntryBasisEvidence ?? ""} onChange={event => patch({ niEntryBasisEvidence: event.target.value })} /></label> : null}
      </div>
      <p>{t("References and amounts are operator-entered evidence, not automatically verified assessments. Review eligibility, chargeable part-months and earlier assessments. Save, then calculate to retain the workings.")}</p>
      <Button type="button" variant="ghost" onClick={() => onChange(undefined)}>{t("Remove worksheet from draft")}</Button>
    </>}
    {saved ? <div className="space-y-2" role="status">
      <p className="font-medium text-[var(--md-ink)]">{t(stale ? "Previous worksheet result — recalculate after saving" : "Saved duty worksheet — estimate")}</p>
      {saved.issues.map(issue => <p key={issue}>{t(issue)}</p>)}
      {saved.result ? <>
        <dl className="space-y-1">
          {[["Full duty at entry", saved.result.fullEntryDuty.displayedGbp], ["Cumulative duty", saved.result.cumulativeDuty.displayedGbp], ["Previously assessed", saved.result.previouslyAssessedDuty.displayedGbp], ["Additional duty estimate", saved.result.additionalDuty.displayedGbp]].map(([label, amount]) => <div key={label} className="flex justify-between gap-3"><dt>{t(label)}</dt><dd className="shrink-0 tabular-nums text-[var(--md-ink)]">£{amount}</dd></div>)}
        </dl>
        <p>{t("Calculation")}: £{saved.result.input.entryDutyGbp} × 3% × {saved.result.input.chargeableMonths} {t("months, capped at full entry duty, less previously assessed duty.")}</p>
        <p>{t("Import VAT has not been calculated by this worksheet. These amounts are excluded from declaration totals.")}</p>
      </> : null}
    </div> : null}
    <a className="text-[var(--md-accent)] underline" href={(value?.jurisdiction ?? jurisdiction) === "NI" ? TEMPORARY_ADMISSION_NI_PARTIAL_SOURCE : TEMPORARY_ADMISSION_PARTIAL_SOURCE} target="_blank" rel="noreferrer">{t((value?.jurisdiction ?? jurisdiction) === "NI" ? "EU partial-relief guidance for Northern Ireland" : "HMRC partial-relief guidance")}</a>
  </details>
}

/** Declaration-specific reconciliation of operator-supplied assessment evidence. */
export function TemporaryAdmissionReleaseEditor({ value, onChange, saved, stale, t }: {
  value?: TemporaryAdmissionReleaseWorksheet; onChange: (value: TemporaryAdmissionReleaseWorksheet | undefined) => void
  saved?: NonNullable<CalculationResult["temporaryAdmissionReleases"]>[number]; stale: boolean; t: (value: string) => string
}) {
  const blankTax = () => ({ taxType: "", releaseLiabilityGbp: "", previouslyPaidGbp: "", paymentEvidence: "" })
  const initial: TemporaryAdmissionReleaseWorksheet = { jurisdiction: "GB", procedure: "4053", entryReference: "", entryItemReference: "", authorisationEvidence: "", releaseAssessmentReference: "", taxes: [blankTax()] }
  const control = "mt-1 h-8 w-full min-w-0 rounded-[var(--md-radius-md)] bg-[var(--md-input-bg)] px-2 text-[12px] text-[var(--md-ink)] premium-stroke-soft focus-visible:outline-2 focus-visible:outline-[var(--md-accent)]"
  const patch = (change: Partial<TemporaryAdmissionReleaseWorksheet>) => onChange({ ...(value ?? initial), ...change })
  return <details className="space-y-3">
    <summary className="cursor-pointer rounded-[var(--md-radius-sm)] font-medium text-[var(--md-ink)] focus-visible:outline-2 focus-visible:outline-[var(--md-accent)]">{t("Temporary admission — release balance")}</summary>
    <p>{t("For GB procedure 4053, reconcile each tax in the release assessment with the amount already paid. This is not the 3%-per-month calculation and does not calculate the release liability itself.")}</p>
    {!value ? <Button type="button" variant="outline" size="sm" onClick={() => onChange(initial)}>{t("Add release assessment")}</Button> : <>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        {([["entryReference", "Original entry reference"], ["entryItemReference", "Original item reference"], ["authorisationEvidence", "Authorisation evidence"], ["releaseAssessmentReference", "Release assessment reference"]] as const).map(([key, label]) => <label key={key} className="min-w-0">{t(label)}<Input className={control} value={value[key]} onChange={event => patch({ [key]: event.target.value })} /></label>)}
      </div>
      <div className="divide-y divide-[var(--md-line)]">
        {value.taxes.map((row, index) => <fieldset key={index} className="grid min-w-0 gap-3 py-3 sm:grid-cols-[6rem_1fr_1fr]">
          <legend className="pt-2 font-medium text-[var(--md-ink)]">{t("Tax")} {index + 1}</legend>
          {([["taxType", "Tax code"], ["releaseLiabilityGbp", "Release liability (£)"], ["previouslyPaidGbp", "Already paid (£)"], ["paymentEvidence", "Payment evidence (or confirmation of no payment)"]] as const).map(([key, label]) => <label key={key} className={key === "paymentEvidence" ? "min-w-0 sm:col-span-3" : "min-w-0"}>{t(label)}<Input className={control} inputMode={key.endsWith("Gbp") ? "decimal" : "text"} maxLength={key === "taxType" ? 3 : undefined} value={row[key]} onChange={event => patch({ taxes: value.taxes.map((tax, i) => i === index ? { ...tax, [key]: key === "taxType" ? event.target.value.toUpperCase() : event.target.value } : tax) })} /></label>)}
          <Button type="button" variant="ghost" size="sm" className="justify-self-start" aria-label={t(`Remove tax ${index + 1}`)} onClick={() => patch({ taxes: value.taxes.filter((_, i) => i !== index) })}>{t("Remove tax")}</Button>
        </fieldset>)}
      </div>
      <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" disabled={value.taxes.length >= 20} onClick={() => patch({ taxes: [...value.taxes, blankTax()] })}>{t("Add tax")}</Button><Button type="button" variant="ghost" size="sm" onClick={() => onChange(undefined)}>{t("Remove release worksheet")}</Button></div>
      <p>{t("Use payment evidence, not an unpaid assessment or a deferment balance. Save and calculate to retain the separate tax balances.")}</p>
    </>}
    {saved ? <div className="space-y-2" role="status"><p className="font-medium text-[var(--md-ink)]">{t(stale ? "Previous release balance — recalculate after saving" : "Saved release balance — evidence review required")}</p>
      {saved.issues.map(issue => <p key={issue}>{t(issue)}</p>)}
      {saved.result?.taxes.map(row => <p key={row.taxType} className="tabular-nums break-words">{row.taxType}: £{row.releaseLiability.displayedGbp} − £{row.previouslyPaid.displayedGbp} = £{row.remaining.displayedGbp} {t("remaining")}</p>)}
      <p>{t("These balances are excluded from declaration totals and do not change declared tax.")}</p>
    </div> : null}
    <a className="text-[var(--md-accent)] underline" href={TEMPORARY_ADMISSION_RELEASE_SOURCE} target="_blank" rel="noreferrer">{t("HMRC release instructions")}</a>
  </details>
}
