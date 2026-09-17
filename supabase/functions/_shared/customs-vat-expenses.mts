import { Decimal } from "./customs-calculation-decimal.mts"

export const VAT_EXPENSE_SOURCE = "https://www.gov.uk/guidance/working-out-the-vat-value-using-the-customs-value-of-the-imported-goods#incidental-expenses--simplified-arrangements"
export type VatExpenseWorksheet = {
  method: "actual" | "national" | "individual"
  consignmentReference: string
  scopeEvidence: string
  noDuplicateCostsConfirmed: boolean
  internationalMovement?: boolean
  terminatesInUk?: boolean
  borderFreightSeparatedEvidence?: string
  group?: "air" | "groupage" | "full-load"
  weightKg?: string
  weightEvidence?: string
  agreement?: { reference: string; validFrom: string; validTo: string; importerEvidence: string; applicabilityEvidence: string; amountGbp: string; workingsEvidence: string }
}
const present = (v: unknown): v is string => typeof v === "string" && !!v.trim()
const date = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v

/** One evidenced consignment, never one minimum per invoice or goods line.
 * National figures verified against the published guidance on 14 September 2026.
 * This remains an uncertified estimate adapter, not a historical rate resolver. */
export function vatIncidentalExpenses(value: VatExpenseWorksheet, valuationDate: string) {
  if (!value || !date(valuationDate) || !present(value.consignmentReference) || !present(value.scopeEvidence) || value.noDuplicateCostsConfirmed !== true) throw new Error("Identify the consignment and covered items, and confirm these incidental expenses are not already included elsewhere.")
  if (value.method === "individual") {
    const agreement = value.agreement
    if (!agreement || !present(agreement.reference) || !date(agreement.validFrom) || !date(agreement.validTo) || agreement.validFrom > valuationDate || agreement.validTo < valuationDate || !present(agreement.importerEvidence) || !present(agreement.applicabilityEvidence) || !present(agreement.workingsEvidence)) throw new Error("Record an applicable, dated individual HMRC agreement and its retained calculation worksheet.")
    const amount = Decimal.parse(agreement.amountGbp)
    if (amount.n < 0n) throw new Error("Agreed incidental expenses cannot be negative.")
    return { amount, source: VAT_EXPENSE_SOURCE, explanation: `Individual agreement ${agreement.reference}: ${agreement.workingsEvidence}` }
  }
  if (value.method !== "national" || valuationDate < "2026-09-14") throw new Error("The national incidental-expense schedule needs dated validation for this calculation.")
  if (value.internationalMovement !== true || value.terminatesInUk !== true || !present(value.borderFreightSeparatedEvidence)) throw new Error("National rates require an international movement ending in the UK and separately identified freight to the UK border.")
  if (value.group === "full-load") return { amount: Decimal.parse("550"), source: VAT_EXPENSE_SOURCE, explanation: "National group C: £550 for one full-load consignment" }
  if (!["air", "groupage"].includes(value.group ?? "") || !present(value.weightEvidence)) throw new Error("Choose an eligible air, groupage or full-load consignment and evidence the applicable weight. Courier rates need separate rules.")
  const weight = Decimal.parse(value.weightKg ?? "")
  if (weight.n <= 0n) throw new Error("Enter the evidenced positive chargeable air weight or gross groupage weight in kilograms.")
  const raw = value.group === "air" ? weight.mul(Decimal.parse("0.40")) : weight.div(Decimal.parse("1000")).mul(Decimal.parse("90")).add(Decimal.parse("80"))
  const minimum = Decimal.parse(value.group === "air" ? "100" : "170")
  return { amount: raw.compare(minimum) < 0 ? minimum : raw, source: VAT_EXPENSE_SOURCE, explanation: value.group === "air" ? `National group A: ${value.weightKg} chargeable kg × £0.40; minimum £100 per consignment` : `National group B: ${value.weightKg} gross kg ÷ 1,000 × £90 + £80; minimum £170 per consignment` }
}
