import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { NiRiskFacts } from "../../../supabase/functions/_shared/customs-ni-tariff.mts"
import { niRiskSource, type NiRiskResult } from "../../../supabase/functions/_shared/customs-ni-risk.mts"

type Processing = NiRiskFacts["processing"]
/** Item-specific NI evidence, saved through the declaration's existing draft. */
export function NiRiskEditor({ value, onChange, importerEori, official, movement, decision, stale, t }: {
  value?: NiRiskFacts; onChange: (value: NiRiskFacts | undefined) => void
  importerEori: string; official: boolean; movement: string
  decision?: NiRiskResult; stale: boolean; t: (value: string) => string
}) {
  const control = "h-8 w-full min-w-0 rounded-[var(--md-radius-md)] bg-[var(--md-input-bg)] px-2 text-[12px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] focus-visible:outline-2 focus-visible:outline-[var(--md-accent)]"
  const initial: NiRiskFacts = { movementEvidence: "", processing: { basis: "unconfirmed", evidence: "" } }
  const patch = (change: Partial<NiRiskFacts>) => onChange({ ...(value ?? initial), ...change })
  const processing = value?.processing ?? initial.processing
  const patchProcessing = (change: Partial<Processing>) => patch({ processing: { ...processing, ...change } as Processing })
  const changeBasis = (basis: Processing["basis"]) => {
    const defaults = { annualTurnoverGbp: "", financialYearEvidence: "", purpose: "", endUse: "", subsequentEntities: -1, permanentStructure: false, noSubsequentSale: false, product: "", allocationConfirmed: false, quotaReference: "" }
    // Preserve entered evidence when switching branches; only the active basis
    // is evaluated by the server. No eligibility confirmation is preselected.
    patch({ processing: { ...defaults, ...processing, basis } as Processing })
  }
  const auth = value?.ukims ?? { reference: "", eori: importerEori, validFrom: "", revoked: true }
  const patchAuth = (change: Partial<typeof auth>) => patch({ ukims: { ...auth, ...change } })
  const textField = (label: string, current: string, update: (value: string) => void, type = "text") => <label>{t(label)}<Input className={control} type={type} value={current} onChange={event => update(event.target.value)} /></label>
  const endUseOptions = <><option value="">{t("Select location")}</option><option value="NI">{t("Northern Ireland")}</option><option value="UK">{t("Elsewhere in the UK")}</option><option value="other">{t("Outside the UK")}</option></>
  return <details open={value ? true : undefined} className="space-y-3">
    <summary className="cursor-pointer font-medium text-[var(--md-ink)]">{t("NI risk evidence — this item")}</summary>
    <p>{t("The movement route above applies to the declaration. These facts apply only to this item. Save and calculate to compare the complete UK and EU duty evidence; no risk decision is assumed while you type.")}</p>
    {!official ? <p role="status">{t("Choose Official tariff as the rate source to use the evidence-based comparison. Manually entered rates cannot establish NI risk status.")}</p> : null}
    {movement !== "rest-of-world-to-NI" ? <p role="status">{t("The connected calculation currently covers arrivals from outside both the UK and EU. Other NI routes still require their separate liability and VAT treatment to be verified.")}</p> : null}
    {!value ? <Button type="button" variant="outline" size="sm" onClick={() => onChange(initial)}>{t("Use evidence-based NI comparison")}</Button> : <>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        {textField("Movement evidence — document reference", value.movementEvidence, movementEvidence => patch({ movementEvidence }))}
        <label>{t("Processing basis")}<select className={control} value={processing.basis} onChange={event => changeBasis(event.target.value as Processing["basis"])}>
          <option value="unconfirmed">{t("Select processing basis")}</option><option value="not-processed">{t("Goods will not be commercially processed")}</option><option value="turnover">{t("Processing business turnover below £2 million")}</option><option value="approved-purpose">{t("Approved processing purpose")}</option><option value="uk-meat-quota">{t("Eligible UK meat tariff quota")}</option><option value="ineligible">{t("No permitted processing basis applies")}</option>
        </select></label>
        {textField("Processing evidence — document reference", processing.evidence, evidence => patchProcessing({ evidence }))}
        {processing.basis === "turnover" ? <>
          <label>{t("Processing business annual turnover (GBP)")}<Input className={control} inputMode="decimal" value={processing.annualTurnoverGbp} onChange={event => patchProcessing({ annualTurnoverGbp: event.target.value })} /></label>
          {textField("Financial year and accounts reference", processing.financialYearEvidence, financialYearEvidence => patchProcessing({ financialYearEvidence }))}
        </> : null}
        {processing.basis === "approved-purpose" ? <>
          <label>{t("Approved purpose")}<select className={control} value={processing.purpose} onChange={event => patchProcessing({ purpose: event.target.value as Extract<Processing, { basis: "approved-purpose" }>["purpose"] })}><option value="">{t("Select purpose")}</option>{([['food', 'Food for UK end consumers'], ['construction', 'Permanent construction in NI'], ['health-care', 'Health or care services in NI'], ['non-profit', 'Non-profit use in NI'], ['animal-feed', 'Animal feed used on NI premises']] as const).map(([id, label]) => <option key={id} value={id}>{t(label)}</option>)}</select></label>
          <label>{t("Processed goods' final-use location")}<select className={control} value={processing.endUse} onChange={event => patchProcessing({ endUse: event.target.value as Extract<Processing, { basis: "approved-purpose" }>["endUse"] })}>{endUseOptions}</select></label>
          <label>{t("Subsequent processing or final-use entities")}<Input className={control} type="number" min={0} step={1} value={processing.subsequentEntities < 0 ? "" : processing.subsequentEntities} onChange={event => patchProcessing({ subsequentEntities: event.target.value === "" ? -1 : Number(event.target.value) })} /></label>
          {processing.purpose === "construction" ? <label className="flex items-center gap-2"><input type="checkbox" checked={processing.permanentStructure === true} onChange={event => patchProcessing({ permanentStructure: event.target.checked })} />{t("Forms a permanent part of the NI structure")}</label> : null}
          {processing.purpose === "non-profit" ? <label className="flex items-center gap-2"><input type="checkbox" checked={processing.noSubsequentSale === true} onChange={event => patchProcessing({ noSubsequentSale: event.target.checked })} />{t("No subsequent sale of the processed goods")}</label> : null}
        </> : null}
        {processing.basis === "uk-meat-quota" ? <>
          <label>{t("Meat product")}<select className={control} value={processing.product} onChange={event => patchProcessing({ product: event.target.value as Extract<Processing, { basis: "uk-meat-quota" }>["product"] })}><option value="">{t("Select product")}</option><option value="sheepmeat">{t("Sheepmeat")}</option><option value="poultry">{t("Poultry")}</option><option value="beef">{t("Beef")}</option></select></label>
          {textField("UK quota and allocation evidence", processing.quotaReference, quotaReference => patchProcessing({ quotaReference }))}
          <label className="flex items-center gap-2"><input type="checkbox" checked={processing.allocationConfirmed === true} onChange={event => patchProcessing({ allocationConfirmed: event.target.checked })} />{t("Allocation confirmed — not merely requested")}</label>
        </> : null}
      </div>
      <details className="space-y-3">
        <summary className="cursor-pointer font-medium text-[var(--md-ink)]">{t("UKIMS authorisation and end use, if needed")}</summary>
        <p>{t("Needed when the complete duty comparison does not itself qualify the goods as not at risk. The authorisation EORI must match the declaration's importer.")}</p>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          {textField("UKIMS authorisation reference", auth.reference, reference => patchAuth({ reference }))}
          {textField("EORI on the authorisation", auth.eori, eori => patchAuth({ eori }))}
          {textField("Authorisation valid from", auth.validFrom, validFrom => patchAuth({ validFrom }), "date")}
          {textField("Authorisation valid until (if specified)", auth.validTo ?? "", validTo => patchAuth({ validTo: validTo || undefined }), "date")}
          <label className="flex items-center gap-2"><input type="checkbox" checked={auth.revoked === false} onChange={event => patchAuth({ revoked: !event.target.checked })} />{t("Authorisation is active and has not been revoked")}</label>
          <label>{t("End-consumer location")}<select className={control} value={value.endUse ?? ""} onChange={event => patch({ endUse: event.target.value as NiRiskFacts["endUse"] || undefined })}>{endUseOptions}</select></label>
          {textField("End-consumer sale or final-use evidence", value.endUseEvidence ?? "", endUseEvidence => patch({ endUseEvidence }))}
        </div>
      </details>
      <p>{t("The server checks EU trade remedies from the tariff evidence. These fields do not override a remedy, establish a quota allocation or certify a relief.")}</p>
      <Button type="button" variant="ghost" size="sm" className="text-[var(--md-red)]" onClick={() => onChange(undefined)}>{t("Remove item risk worksheet")}</Button>
    </>}
    {decision ? <div role="status" className="space-y-1">
      <p className="font-medium text-[var(--md-ink)]">{t(stale ? "Previous saved risk decision — out of date" : "Saved risk decision — estimate only")}: {t(decision.status === "not-at-risk" ? "Not at risk" : decision.status === "at-risk" ? "At risk" : "Needs information")}</p>
      {decision.reasons.map(reason => <p key={reason}>{t(reason)}</p>)}
    </div> : null}
    <a href={niRiskSource} target="_blank" rel="noreferrer" className="text-[var(--md-accent)] underline underline-offset-2">{t("HMRC not-at-risk guidance")}</a>
  </details>
}
