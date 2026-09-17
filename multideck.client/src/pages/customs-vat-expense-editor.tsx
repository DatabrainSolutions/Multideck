import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { vatIncidentalExpenses, type VatExpenseWorksheet } from "../../../supabase/functions/_shared/customs-vat-expenses.mts"

/** Import-adjustment worksheet, not a reusable gallery primitive. */
export function VatExpenseEditor({ value, date, control, onChange, onApply, t }: {
  value?: VatExpenseWorksheet; date: string; control: string
  onChange: (value: VatExpenseWorksheet) => void; onApply: (amount: string) => void; t: (value: string) => string
}) {
  const worksheet: VatExpenseWorksheet = value ?? { method: "actual", consignmentReference: "", scopeEvidence: "", noDuplicateCostsConfirmed: false }
  const patch = (value: Partial<VatExpenseWorksheet>) => onChange({ ...worksheet, ...value })
  const agreement = worksheet.agreement ?? { reference: "", validFrom: "", validTo: "", importerEvidence: "", applicabilityEvidence: "", amountGbp: "", workingsEvidence: "" }
  let calculated: ReturnType<typeof vatIncidentalExpenses> | undefined, issue = ""
  if (worksheet.method !== "actual") {
    try { calculated = vatIncidentalExpenses(worksheet, date) }
    catch (error) { issue = (error as Error).message }
  }
  return <fieldset className="grid min-w-0 gap-3 sm:grid-cols-2">
    <legend className="mb-2 font-medium text-[var(--md-ink)]">{t("VAT incidental expenses")}</legend>
    <label>{t("Expense method")}<select className={control} value={worksheet.method} onChange={event => patch({ method: event.target.value as VatExpenseWorksheet["method"] })}><option value="actual">{t("Actual costs")}</option><option value="national">{t("Nationally agreed rates")}</option><option value="individual">{t("Individual HMRC agreement")}</option></select></label>
    {worksheet.method !== "actual" ? <>
      <p className="sm:col-span-2">{t("One worksheet per consignment, which may cover several invoices. Use the cost scope above to select its goods. This is a draft estimate, not approval of eligibility.")}</p>
      {([ ["consignmentReference", "Consignment reference"], ["scopeEvidence", "Evidence identifying the covered goods"] ] as const).map(([key, label]) => <label key={key}>{t(label)}<Input className={control} value={worksheet[key]} onChange={event => patch({ [key]: event.target.value })} /></label>)}
      <label className="flex items-start gap-2 sm:col-span-2"><input type="checkbox" className="mt-1 accent-[var(--md-accent)]" checked={worksheet.noDuplicateCostsConfirmed === true} onChange={event => patch({ noDuplicateCostsConfirmed: event.target.checked })} /><span>{t("These expenses are not already included in the goods price or another adjustment.")}</span></label>
      {worksheet.method === "national" ? <>
        <label>{t("Consignment type")}<select className={control} value={worksheet.group ?? ""} onChange={event => patch({ group: event.target.value as VatExpenseWorksheet["group"] })}><option value="">{t("Select type")}</option><option value="air">{t("Airfreight")}</option><option value="groupage">{t("Surface groupage or consolidation")}</option><option value="full-load">{t("Surface full load")}</option></select></label>
        {worksheet.group === "air" || worksheet.group === "groupage" ? <><label>{t(worksheet.group === "air" ? "Chargeable weight (kg)" : "Gross weight (kg)")}<Input className={control} inputMode="decimal" value={worksheet.weightKg ?? ""} onChange={event => patch({ weightKg: event.target.value })} /></label><label>{t("Weight evidence")}<Input className={control} value={worksheet.weightEvidence ?? ""} onChange={event => patch({ weightEvidence: event.target.value })} /></label></> : null}
        <label>{t("Separately identified border freight evidence")}<Input className={control} value={worksheet.borderFreightSeparatedEvidence ?? ""} onChange={event => patch({ borderFreightSeparatedEvidence: event.target.value })} /></label>
        {([ ["internationalMovement", "This is an international movement"], ["terminatesInUk", "The movement ends in the UK"] ] as const).map(([key, label]) => <label key={key} className="flex items-start gap-2"><input type="checkbox" className="mt-1 accent-[var(--md-accent)]" checked={worksheet[key] === true} onChange={event => patch({ [key]: event.target.checked })} /><span>{t(label)}</span></label>)}
      </> : <>
        {([ ["reference", "HMRC agreement reference"], ["validFrom", "Agreement valid from"], ["validTo", "Agreement valid until"], ["importerEvidence", "Importer covered by the agreement"], ["applicabilityEvidence", "Evidence this consignment is covered"], ["amountGbp", "Agreed worksheet amount (GBP)"], ["workingsEvidence", "Calculation workings and evidence"] ] as const).map(([key, label]) => <label key={key}>{t(label)}<Input className={control} type={key === "validFrom" || key === "validTo" ? "date" : "text"} value={agreement[key]} onChange={event => patch({ agreement: { ...agreement, [key]: event.target.value } })} /></label>)}
      </>}
      {issue ? <p className="sm:col-span-2">{t(issue)}</p> : null}
      {calculated ? <div className="space-y-2 sm:col-span-2"><p>{t(calculated.explanation)}</p><Button type="button" size="sm" variant="ghost" onClick={() => onApply(calculated.amount.fixed(2))}>{t("Use worksheet amount")} · £{calculated.amount.fixed(2)} GBP</Button><p>{t("Updates this adjustment to GBP and marks it as not included in the goods price. Save the draft before calculating; the server rechecks the worksheet and national publication.")}</p></div> : null}
    </> : null}
  </fieldset>
}
