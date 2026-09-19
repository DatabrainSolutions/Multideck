import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { CalculationSetup } from "../../../supabase/functions/_shared/customs-calculation-draft.mts"
import type { CalculationResult } from "../../../supabase/functions/_shared/customs-duty-calculation.mts"
import { Decimal } from "../../../supabase/functions/_shared/customs-calculation-decimal.mts"
import { NI_PROCESSING_RELEASE_SOURCE, type NiProcessingReleaseReview } from "../../../supabase/functions/_shared/customs-ni-processing-release.mts"
type Worksheet = NonNullable<CalculationSetup["processingInputs"]>

export function NiProcessingReleaseEditor({ value, onChange, t }: { value?: NiProcessingReleaseReview; onChange: (value: NiProcessingReleaseReview | undefined) => void; t: (value: string) => string }) {
  const initial: NiProcessingReleaseReview = { basis: "processed-products", entryDate: "", entryReference: "", authorisationEvidence: "", dischargeEvidence: "", processedValuationEvidence: "", originalBasisExclusionEvidence: "", releaseRiskEvidence: "", noPriorTaxPaymentConfirmed: false, noEquivalenceOrCombinedReliefConfirmed: false }
  const patch = (change: Partial<NiProcessingReleaseReview>) => onChange({ ...(value ?? initial), ...change })
  const control = "mt-1 min-h-8 w-full min-w-0 rounded-[var(--md-radius-md)] bg-[var(--md-input-bg)] px-2 text-[12px] text-[var(--md-ink)] premium-stroke-soft focus-visible:outline-2 focus-visible:outline-[var(--md-accent)]"
  return <details className="min-w-0 space-y-3">
    <summary className="cursor-pointer rounded-[var(--md-radius-sm)] font-medium text-[var(--md-ink)] focus-visible:outline-2 focus-visible:outline-[var(--md-accent)]">{t("Northern Ireland — processing release")}</summary>
    <p>{t("For 4051 releases with EU at-risk treatment. Choose the calculation basis supported by the authorisation and applicable rules.")}</p>
    {!value ? <Button type="button" size="sm" variant="outline" onClick={() => onChange(initial)}>{t("Add processing release review")}</Button> : <>
      <label className="block max-w-sm">{t("Duty calculation basis")}<select className={control} value={value.basis} onChange={event => patch({ basis: event.target.value as NiProcessingReleaseReview["basis"], allOriginalInputsConfirmed: false })}><option value="processed-products">{t("Processed products")}</option><option value="original-inputs">{t("Original inputs — F44")}</option></select></label>
      <p>{t(value.basis === "original-inputs" ? "Duty uses the original inputs’ retained values and consumed quantities, with release-date rates. VAT uses the processed goods’ value plus applicable duty. Complete the shared original-goods worksheet below and select F44 on this item." : "Duty and VAT use the processed goods’ value and release-date rates. Confirm that an original-input calculation is not required.")}</p>
      <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-3">
        {([["entryDate", "Original processing entry date"], ["entryReference", "Original processing entry reference"], ["authorisationEvidence", "Authorisation and permitted calculation basis"], ["dischargeEvidence", "Product identity, quantity and discharge evidence"], ["processedValuationEvidence", "Processed-product valuation evidence"], ["originalBasisExclusionEvidence", "Why original-goods calculation does not apply"], ["releaseRiskEvidence", "EU at-risk decision at release — evidence"]] as const).filter(([key]) => value.basis !== "original-inputs" || !["entryDate", "entryReference", "originalBasisExclusionEvidence"].includes(key)).map(([key, label]) => <label key={key} className="min-w-0">{t(label)}{key === "entryDate" ? <Input className={control} type="date" value={value[key]} onChange={event => patch({ [key]: event.target.value })} /> : <textarea className={`${control} min-h-20 py-2`} value={value[key]} onChange={event => patch({ [key]: event.target.value })} />}</label>)}
      </div>
      {value.basis === "original-inputs" ? <label className="flex items-start gap-2"><input type="checkbox" className="mt-1 size-4 shrink-0 accent-[var(--md-accent)]" checked={value.allOriginalInputsConfirmed === true} onChange={event => patch({ allOriginalInputsConfirmed: event.target.checked })} /><span>{t("The worksheet includes every original input used by this released item")}</span></label> : <p>{t("The original-goods review must cover both the authorised basis and any compulsory treatment arising from the original goods’ trade-policy measures.")}</p>}
      {([["noPriorTaxPaymentConfirmed", "No duty or VAT was previously paid for these goods"], ["noEquivalenceOrCombinedReliefConfirmed", "No equivalence or combined relief changes this release"]] as const).map(([key, label]) => <label key={key} className="flex items-start gap-2"><input type="checkbox" className="mt-1 size-4 shrink-0 accent-[var(--md-accent)]" checked={value[key]} onChange={event => patch({ [key]: event.target.checked })} /><span>{t(label)}</span></label>)}
      <fieldset className="min-w-0 space-y-2"><legend className="font-medium">{t("Low-value duty review — optional")}</legend>
        <p>{t("A business customer or a high invoice total alone does not prove the consignment is outside distance-sale duty rules.")}</p>
        <label className="flex items-start gap-2"><input type="checkbox" className="mt-1 size-4 shrink-0 accent-[var(--md-accent)]" checked={!!value.lowValueExclusion} onChange={event => patch({ lowValueExclusion: event.target.checked ? { basis: "not-distance-sale", reviewDate: "", consignmentReference: "", evidence: "" } : undefined })} /><span>{t("Evidence confirms this is not a distance sale")}</span></label>
        {value.lowValueExclusion ? <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-3">{([["reviewDate", "Review date"], ["consignmentReference", "Consignment reference"], ["evidence", "Contract or transaction evidence"]] as const).map(([key, label]) => <label key={key}>{t(label)}<Input className={control} type={key === "reviewDate" ? "date" : "text"} value={value.lowValueExclusion![key]} onChange={event => patch({ lowValueExclusion: { ...value.lowValueExclusion!, [key]: event.target.value } })} /></label>)}</div> : null}
      </fieldset>
      <p>{t("Save, then recalculate. This review supports an estimate, not Customs approval; original evidence is retained with the calculation.")}</p>
      <Button type="button" size="sm" variant="ghost" onClick={() => onChange(undefined)}>{t("Remove processing release review")}</Button>
    </>}
    <a href={NI_PROCESSING_RELEASE_SOURCE} target="_blank" rel="noreferrer" className="text-[var(--md-accent)] underline">{t("EU inward-processing guidance")}</a>
  </details>
}

/** Declaration-specific worksheet; all allocation arithmetic remains server-side. */
export function ProcessingInputEditor({ value, jurisdiction, outputs, onChange, saved, stale, t }: {
  value?: Worksheet; jurisdiction?: "GB" | "NI"; outputs: { id: string; label: string }[]
  onChange: (value: Worksheet | undefined) => void; saved?: CalculationResult["processingInputAllocation"]
  stale: boolean; t: (value: string) => string
}) {
  const control = "mt-1 min-h-8 w-full min-w-0 rounded-[var(--md-radius-md)] bg-[var(--md-input-bg)] px-2 text-[12px] text-[var(--md-ink)] premium-stroke-soft focus-visible:outline-2 focus-visible:outline-[var(--md-accent)]"
  const grid = "grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-3"
  const display = (exact: { numerator: string; denominator: string }, places: number) => {
    try {
      const number = new Decimal(BigInt(exact.numerator), BigInt(exact.denominator))
      const rendered = number.fixed(places)
      return `${number.compare(Decimal.parse(rendered)) === 0 ? "" : "≈ "}${rendered}`
    } catch { return t("Value unavailable") }
  }
  return <details className="min-w-0 space-y-3">
    <summary className="cursor-pointer rounded-[var(--md-radius-sm)] font-medium text-[var(--md-ink)] focus-visible:outline-2 focus-visible:outline-[var(--md-accent)]">{t("Inward processing — original goods and consumption")}</summary>
    <p>{t("Shared across this declaration. Original goods and consumed quantities stay separate from invoice prices. For an NI original-input release, complete each lot’s entry date, commodity and origin, then review the release basis on the item.")}</p>
    {!value ? <Button type="button" size="sm" variant="outline" disabled={!jurisdiction} onClick={() => jurisdiction && onChange({ jurisdiction, lots: [], consumption: [] })}>{t("Add processing worksheet")}</Button> : <>
      <label className="block max-w-xs">{t("Worksheet territory")}<select className={control} value={value.jurisdiction} onChange={event => onChange({ ...value, jurisdiction: event.target.value as Worksheet["jurisdiction"] })}><option value="GB">{t("Great Britain")}</option><option value="NI">{t("Northern Ireland")}</option></select></label>
      {value.jurisdiction !== jurisdiction ? <p role="alert">{t("Review the original entry: the worksheet territory differs from the declaration.")}</p> : null}
      <div className="space-y-6">{value.lots.map((lot, index) => <fieldset key={lot.id} className="min-w-0 space-y-3">
        <legend className="font-medium">{t("Original lot")} {index + 1}</legend>
        <div className={grid}>{([["entryDate", "Original entry date"], ["commodityCode", "Original commodity code"], ["origin", "Original country of origin"]] as const).map(([key, label]) => <label key={key} className="min-w-0">{t(label)}<Input className={control} type={key === "entryDate" ? "date" : "text"} inputMode={key === "commodityCode" ? "numeric" : "text"} maxLength={key === "commodityCode" ? 10 : key === "origin" ? 2 : undefined} placeholder={key === "origin" ? "CO" : undefined} value={lot[key] ?? ""} onChange={event => onChange({ ...value, lots: value.lots.map(row => row.id === lot.id ? { ...row, [key]: key === "origin" ? event.target.value.toUpperCase() : event.target.value } : row) })} /></label>)}</div>
        <div className={grid}>{([["entryReference", "Original entry reference"], ["entryItemReference", "Original item number"], ["quantity", "Original quantity"], ["unit", "Quantity unit code"], ["originalCustomsValueGbp", "Original customs value (GBP)"], ["previouslyDischargedQuantity", "Previously discharged quantity"], ["evidence", "Entry and previous-discharge evidence"]] as const).map(([key, label]) => <label key={key} className="min-w-0">{t(label)}<Input className={control} inputMode={["quantity", "originalCustomsValueGbp", "previouslyDischargedQuantity"].includes(key) ? "decimal" : "text"} value={lot[key]} onChange={event => onChange({ ...value, lots: value.lots.map(row => row.id === lot.id ? { ...row, [key]: event.target.value } : row) })} /></label>)}</div>
        {value.jurisdiction === "NI" ? <label className="block min-w-0">{t("Original F44 declaration — evidence")}<textarea className={`${control} min-h-20 py-2`} value={lot.originalF44Evidence ?? ""} onChange={event => onChange({ ...value, lots: value.lots.map(row => row.id === lot.id ? { ...row, originalF44Evidence: event.target.value } : row) })} /><span className="mt-1 block text-[var(--md-text)]">{t("For original-input duty, reference the entry showing F44 for this lot. Selecting F44 on the release alone is not enough.")}</span></label> : null}
        <Button type="button" size="sm" variant="ghost" disabled={value.consumption.some(row => row.inputLotId === lot.id)} onClick={() => onChange({ ...value, lots: value.lots.filter(row => row.id !== lot.id) })}>{t("Remove original lot")} {index + 1}</Button>
        {value.consumption.some(row => row.inputLotId === lot.id) ? <p>{t("Remove or reassign linked consumption before removing this lot.")}</p> : null}
      </fieldset>)}</div>
      <Button type="button" size="sm" variant="outline" onClick={() => onChange({ ...value, lots: [...value.lots, { id: crypto.randomUUID(), entryReference: "", entryItemReference: "", quantity: "", unit: "", originalCustomsValueGbp: "", previouslyDischargedQuantity: "", evidence: "" }] })}>{t("Add original lot")}</Button>
      <div className="space-y-6">{value.consumption.map((row, index) => {
        const patch = (change: Partial<typeof row>) => onChange({ ...value, consumption: value.consumption.map((entry, i) => i === index ? { ...entry, ...change } : entry) })
        return <fieldset key={index} className="min-w-0 space-y-3"><legend className="font-medium">{t("Consumption")} {index + 1}</legend><div className={grid}>
          <label>{t("Original lot")}<select className={control} value={row.inputLotId} onChange={event => patch({ inputLotId: event.target.value, unit: value.lots.find(lot => lot.id === event.target.value)?.unit ?? "" })}><option value="">{t("Select original lot")}</option>{value.lots.map((lot, i) => <option key={lot.id} value={lot.id}>{i + 1} · {lot.entryReference} · {lot.entryItemReference}</option>)}</select></label>
          <label>{t("Released invoice item")}<select className={control} value={row.outputItemId} onChange={event => patch({ outputItemId: event.target.value })}><option value="">{t("Select released item")}</option>{row.outputItemId && !outputs.some(item => item.id === row.outputItemId) ? <option value={row.outputItemId}>{t("Item unavailable — choose another")}</option> : null}{outputs.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          <label>{t("Consumed input quantity")}<Input className={control} inputMode="decimal" value={row.quantity} onChange={event => patch({ quantity: event.target.value })} /></label>
          <label>{t("Quantity unit code")}<Input className={control} value={row.unit} onChange={event => patch({ unit: event.target.value })} /></label>
          <label>{t("Consumption and yield evidence")}<Input className={control} value={row.yieldEvidence} onChange={event => patch({ yieldEvidence: event.target.value })} /></label>
        </div><Button type="button" size="sm" variant="ghost" onClick={() => onChange({ ...value, consumption: value.consumption.filter((_, i) => i !== index) })}>{t("Remove consumption")} {index + 1}</Button></fieldset>
      })}</div>
      <Button type="button" size="sm" variant="outline" disabled={!value.lots.length || !outputs.length} onClick={() => onChange({ ...value, consumption: [...value.consumption, { inputLotId: "", outputItemId: "", quantity: "", unit: "", yieldEvidence: "" }] })}>{t("Add consumption")}</Button>
      {!outputs.length ? <p>{t("Add an invoice item using procedure 4051 or 4054 to link consumption.")}</p> : null}
      <p>{t("Save, then recalculate to retain allocations. Enter earlier discharges separately so those quantities cannot be used twice.")}</p>
      <Button type="button" size="sm" variant="ghost" onClick={() => onChange(undefined)}>{t("Remove processing worksheet from draft")}</Button>
    </>}
    {saved ? <div className="space-y-4">
      <p role="status" className="font-medium">{t(stale ? "Previous allocation — recalculate after saving" : "Saved processing allocation")}</p>
      {saved.issues.map(issue => <p key={issue} role="alert">{t(issue)}</p>)}
      {saved.result ? <>
        <p>{t("Original value × consumed quantity ÷ original quantity. Earlier discharges reduce the available quantity. Approximate displays are marked ≈; exact values are retained. These are not duty or VAT amounts.")}</p>
        {saved.result.allocations.map(allocation => {
          const lot = saved.result!.input.lots.find(row => row.id === allocation.inputLotId)
          return <section key={allocation.inputLotId} className="min-w-0 space-y-2" aria-label={`${t("Saved original lot")} ${lot?.entryReference ?? allocation.inputLotId}`}>
            <h5 className="break-words font-medium text-[var(--md-ink)]">{lot?.entryReference} · {t("Original item")} {lot?.entryItemReference}</h5>
            <dl className="space-y-1">
              {[["Original quantity", lot?.quantity ?? "—"], ["Previously discharged", display(allocation.previous, 6)], ["Consumed in this worksheet", display(allocation.used, 6)], ["Quantity remaining", display(allocation.remaining, 6)]].map(([label, amount]) => <div key={label} className="flex flex-wrap justify-between gap-x-4 gap-y-1"><dt>{t(label)}</dt><dd className="tabular-nums text-[var(--md-ink)]">{amount} {lot?.unit}</dd></div>)}
            </dl>
            {allocation.allocations.map(row => <div key={row.outputItemId} className="space-y-1 pt-2">
              <p className="font-medium">{outputs.find(item => item.id === row.outputItemId)?.label ?? `${t("Saved item")} ${row.outputItemId}`}</p>
              <dl className="space-y-1">
                <div className="flex flex-wrap justify-between gap-x-4 gap-y-1"><dt>{t("Consumed original quantity")}</dt><dd className="tabular-nums">{display(row.quantity, 6)} {lot?.unit}</dd></div>
                <div className="flex flex-wrap justify-between gap-x-4 gap-y-1"><dt>{t("Allocated original value (GBP)")}</dt><dd className="tabular-nums text-[var(--md-ink)]">{display(row.originalCustomsValueGbp, 2)}</dd></div>
              </dl>
              <p className="break-words">{t("Evidence")}: {row.yieldEvidence}</p>
            </div>)}
          </section>
        })}
      </> : null}
    </div> : null}
  </details>
}
