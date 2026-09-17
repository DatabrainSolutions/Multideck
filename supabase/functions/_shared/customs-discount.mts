/** Evidence-led discount eligibility for draft GB Method 1 estimates.
 * Revalidate at acceptance; never move a prior purchase's discount onto this one. */
export type DiscountEvidence = {
  kind: "" | "earned" | "early-payment"
  agreedOn: string
  contractReference: string
  goodsEntitlementEvidence: string
  commercialBasisEvidence: string
  relatesOnlyToSelectedGoods: boolean
  paymentStatus: "" | "unpaid" | "discounted" | "full"
  paymentEvidence?: string
  availableUntil?: string
  tradePracticeEvidence?: string
}
const present = (value: unknown) => typeof value === "string" && !!value.trim()
const date = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
export function discountIssues(value: DiscountEvidence | undefined, valuationDate: string): string[] {
  if (!value || typeof value !== "object") return ["Record the discount's contractual entitlement at the valuation date."]
  const issues: string[] = []
  if (!date(valuationDate) || !date(value.agreedOn) || value.agreedOn > valuationDate) issues.push("The discount must have been agreed by the valuation date.")
  if (!["earned", "early-payment"].includes(value.kind)) issues.push("Select an earned discount or early-payment discount.")
  if (!present(value.contractReference) || !present(value.goodsEntitlementEvidence) || !present(value.commercialBasisEvidence) || value.relatesOnlyToSelectedGoods !== true) issues.push("Evidence the contract, earned entitlement and commercial basis for these goods only; prior purchases and part-exchange allowances need separate treatment.")
  if (!["unpaid", "discounted", "full"].includes(value.paymentStatus)) issues.push("Confirm the payment status supporting the discount.")
  if (value.paymentStatus === "full") issues.push("The undiscounted amount has been paid. Do not deduct an unclaimed discount from this estimate.")
  if (value.paymentStatus === "discounted" && !present(value.paymentEvidence)) issues.push("Record evidence of payment at the discounted amount.")
  if (value.kind === "early-payment" && value.paymentStatus === "unpaid" && (!date(value.availableUntil) || value.availableUntil < valuationDate || !present(value.tradePracticeEvidence))) issues.push("An unpaid early-payment discount needs an unexpired offer and evidence that it is accepted practice in the trade.")
  return issues
}
