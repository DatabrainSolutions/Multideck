import { useId } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { validateContractConversion, type ContractConversionWorksheet } from "../../../supabase/functions/_shared/customs-contract-conversion.mts"

/** Invoice-scoped declaration worksheet, not a reusable gallery primitive. */
export function ContractConversionEditor({ invoice, value, onChange, date, supported, t }: {
  invoice: { id: string; invoiceNumber: string; currency: string; letterOfCreditExchangeRate: string }
  value?: ContractConversionWorksheet
  onChange: (value: ContractConversionWorksheet | undefined) => void
  date: string; supported: boolean; t: (value: string) => string
}) {
  const messageId = useId()
  const control = "h-8 w-full min-w-0 rounded-[var(--md-radius-md)] bg-[var(--md-input-bg)] px-2 text-[12px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] focus-visible:outline-2 focus-visible:outline-[var(--md-accent)]"
  const initial: ContractConversionWorksheet = { invoiceId: invoice.id, basis: invoice.currency === "GBP" ? "gbp-invoice-reconversion" : "foreign-invoice-gbp-payment", foreignCurrency: invoice.currency === "GBP" ? "" : invoice.currency, fixedRate: invoice.letterOfCreditExchangeRate, direction: "currency_units_per_gbp", sellerPaymentCurrency: "", contractReference: "", fixedRateClauseEvidence: "", sellerPaymentEvidence: "", validFrom: "", validTo: "" }
  const patch = (change: Partial<ContractConversionWorksheet>) => onChange({ ...(value ?? initial), ...change })
  let issue = ""
  if (value) {
    try { validateContractConversion(value, invoice, date) }
    catch (error) { issue = error instanceof Error ? error.message : "Review the contract evidence before calculating." }
  }
  return <details className="space-y-3" open={value ? true : undefined}>
    <summary className="cursor-pointer font-medium text-[var(--md-ink)]">{t("Invoice contract exchange rate")}{value ? ` — ${t("Evidence recorded")}` : ""}</summary>
    <p>{t("Applies to every item linked to invoice")} <span className="font-medium text-[var(--md-ink)]">{invoice.invoiceNumber || t("(number not entered)")}</span>. {t("Changes here affect that invoice only. Other costs still use HMRC rates.")}</p>
    {!supported ? <p role="status">{t("This contract-rate calculation currently needs a Great Britain Method 1 case. You can retain the evidence here, but Northern Ireland and other valuation methods need a separate reviewed treatment.")}</p> : null}
    {invoice.letterOfCreditExchangeRate ? <p>{t("Letter-of-credit rate on the invoice")}: {invoice.letterOfCreditExchangeRate}. {t("A rate alone does not establish eligibility. Reconcile it with the contract and rate direction below.")}</p> : null}
    {!value ? <>
      <p>{t("HMRC rates remain the default. Add a worksheet only when the invoice has a fixed contractual conversion arrangement.")}</p>
      <Button type="button" variant="outline" size="sm" onClick={() => onChange(initial)}>{t("Add contract evidence")}</Button>
    </> : <>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2" aria-describedby={messageId}>
        <label className="sm:col-span-2">{t("Conversion treatment")}<select className={control} value={value.basis} onChange={event => patch({ basis: event.target.value as ContractConversionWorksheet["basis"] })}>
          <option value="foreign-invoice-gbp-payment">{t("Foreign-currency invoice — seller paid in GBP at the contract rate")}</option>
          <option value="gbp-invoice-reconversion">{t("GBP invoice — restore the foreign amount, then apply HMRC's rate")}</option>
        </select></label>
        <label>{t("Foreign currency (three-letter code)")}<Input className={control} maxLength={3} value={value.foreignCurrency} onChange={event => patch({ foreignCurrency: event.target.value.toUpperCase() })} /></label>
        <label>{t("Fixed rate — foreign currency units for £1")}<Input className={control} inputMode="decimal" value={value.fixedRate} onChange={event => patch({ fixedRate: event.target.value })} /></label>
        <label>{t("Contract valid from")}<Input className={control} type="date" value={value.validFrom} onChange={event => patch({ validFrom: event.target.value })} /></label>
        <label>{t("Contract valid until")}<Input className={control} type="date" value={value.validTo} onChange={event => patch({ validTo: event.target.value })} /></label>
        <label className="sm:col-span-2">{t("Contract reference")}<Input className={control} value={value.contractReference} onChange={event => patch({ contractReference: event.target.value })} /></label>
        <label className="sm:col-span-2">{t("Fixed-rate clause — document and page reference")}<Input className={control} value={value.fixedRateClauseEvidence} onChange={event => patch({ fixedRateClauseEvidence: event.target.value })} /></label>
        <label className="sm:col-span-2 flex items-center gap-2"><input type="checkbox" checked={value.sellerPaymentCurrency === "GBP"} onChange={event => patch({ sellerPaymentCurrency: event.target.checked ? "GBP" : "" })} />{t("The seller receives payment in GBP")}</label>
        <label className="sm:col-span-2">{t("GBP-payment evidence — document and page reference")}<Input className={control} value={value.sellerPaymentEvidence} onChange={event => patch({ sellerPaymentEvidence: event.target.value })} /></label>
      </div>
      <p id={messageId} role="status" className={issue ? "text-[var(--md-amber)]" : "text-[var(--md-subtle)]"}>{t(issue || "Evidence fields are complete. This is not certification of the contract or customs treatment.")}</p>
      <p>{t("Save the declaration, then recalculate its items. Earlier calculations remain in the audit history.")}</p>
      <Button type="button" variant="ghost" size="sm" className="text-[var(--md-red)]" onClick={() => onChange(undefined)}>{t("Remove contract worksheet")}</Button>
      <p className="text-[var(--md-subtle)]">{t("Removing this worksheet does not clear the letter-of-credit rate on the invoice.")}</p>
    </>}
    <a className="text-[var(--md-accent)] underline underline-offset-2" href="https://www.gov.uk/guidance/converting-foreign-currency-amounts-to-include-in-the-customs-value" target="_blank" rel="noreferrer">{t("HMRC currency-conversion guidance")}</a>
  </details>
}
