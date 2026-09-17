import { Decimal, zero } from "./customs-calculation-decimal.mts"

export const TEMPORARY_ADMISSION_PARTIAL_SOURCE = "https://www.gov.uk/guidance/temporary-admission-customs-technical-handbook/partial-relief"
export const TEMPORARY_ADMISSION_NI_PARTIAL_SOURCE = "https://taxation-customs.ec.europa.eu/document/download/b5844d5a-0c43-4940-be4b-462dec0a10a3_en"
export const TEMPORARY_ADMISSION_RELEASE_SOURCE = "https://www.gov.uk/government/publications/appendix-1-de-110-requested-and-previous-procedure-codes-of-the-customs-declaration-service-cds/requested-procedure-40-release-to-free-circulation#4053"

/** DE 4/6 for 4053: release liability less revenue already paid, by tax type.
 * This reconciles evidenced assessments; it does not determine the release
 * valuation, tariff, VAT eligibility or turn assessed-but-unpaid tax into credit. */
export type TemporaryAdmissionReleaseWorksheet = {
  jurisdiction: "GB"
  procedure: "4053"
  entryReference: string
  entryItemReference: string
  authorisationEvidence: string
  releaseAssessmentReference: string
  taxes: { taxType: string; releaseLiabilityGbp: string; previouslyPaidGbp: string; paymentEvidence: string }[]
}

/** A full original-item tax balance cannot be reused on two release lines.
 * Partial item releases require an evidenced allocation, not duplicate copies.
 * This is declaration-local; cross-declaration ownership needs a retained ledger. */
export function duplicateTemporaryReleaseClaims(rows: { itemId: string; worksheet: TemporaryAdmissionReleaseWorksheet }[]) {
  const owners = new Map<string, Set<string>>()
  const reference = (value: unknown) => typeof value === "string" ? value.trim().toUpperCase().replace(/\s+/g, " ") : ""
  for (const { itemId, worksheet } of rows) {
    const entry = reference(worksheet.entryReference)
    const rawItem = reference(worksheet.entryItemReference)
    const entryItem = /^\d{1,12}$/.test(rawItem) ? BigInt(rawItem).toString() : rawItem
    if (!entry || !entryItem || !Array.isArray(worksheet.taxes)) continue
    for (const row of worksheet.taxes) {
      if (!row || typeof row !== "object") continue
      const tax = reference(row.taxType)
      if (!tax) continue
      const key = JSON.stringify([worksheet.jurisdiction, entry, entryItem, tax])
      const ids = owners.get(key) ?? new Set<string>()
      ids.add(itemId); owners.set(key, ids)
    }
  }
  return new Set([...owners.values()].filter(ids => ids.size > 1).flatMap(ids => [...ids]))
}

export function temporaryAdmissionReleaseBalance(input: TemporaryAdmissionReleaseWorksheet) {
  if (input.jurisdiction !== "GB" || input.procedure !== "4053") throw new Error("Use the separately validated treatment for this jurisdiction and release procedure.")
  for (const value of [input.entryReference, input.entryItemReference, input.authorisationEvidence, input.releaseAssessmentReference]) {
    if (typeof value !== "string" || !value.trim()) throw new Error("Record the original entry, item, authorisation and release assessment references.")
  }
  if (!Array.isArray(input.taxes) || !input.taxes.length || input.taxes.length > 20) throw new Error("Record each tax from the release assessment, with no more than 20 tax types.")
  const types = input.taxes.map(row => row.taxType)
  if (types.some(code => !/^[A-Z][0-9]{2}$/.test(code)) || new Set(types).size !== types.length) throw new Error("Use distinct tax codes from the release assessment.")
  const amount = (value: Decimal) => ({ displayedGbp: value.fixed(2), exact: value.evidence() })
  const taxes = input.taxes.map(row => {
    if (!row.paymentEvidence?.trim()) throw new Error(`Record payment evidence for ${row.taxType}, including confirmation where nothing was paid.`)
    const liability = Decimal.parse(row.releaseLiabilityGbp), paid = Decimal.parse(row.previouslyPaidGbp)
    if (liability.n < 0n || paid.n < 0n) throw new Error("Release liabilities and previously paid amounts cannot be negative.")
    // These are entered assessment/payment amounts, not intermediate tax
    // calculations. Never silently round evidence before reconciling it.
    if (liability.compare(liability.truncate(2)) !== 0 || paid.compare(paid.truncate(2)) !== 0) throw new Error(`${row.taxType}: enter assessment and payment amounts in whole pounds and pence, without fractions of a penny.`)
    if (paid.compare(liability) > 0) throw new Error(`${row.taxType}: previous payments exceed the release liability. Review the assessments; do not create an automatic refund.`)
    return { taxType: row.taxType, releaseLiability: amount(liability), previouslyPaid: amount(paid), remaining: amount(liability.sub(paid)) }
  })
  return { status: "estimate" as const, autoPopulationAllowed: false as const, source: TEMPORARY_ADMISSION_RELEASE_SOURCE, ruleVersion: "gb-ta-release-balance-v1", input: structuredClone(input), taxes,
    issues: ["The release assessment and payment evidence require review. This worksheet does not calculate the original liability or change declared tax amounts."] }
}

/** Duty ledger only. This does not establish eligibility, count calendar months,
 * calculate VAT, or create a CDS override. The entry duty must come from the
 * retained entry-date assessment, never today's tariff or exchange rate. */
export type TemporaryAdmissionDutyLedger = {
  jurisdiction: "GB" | "NI"
  event: "entry" | "discharge"
  entryAssessmentId: string
  entryItemId: string
  entryDutyGbp: string
  fullAuthorisationEvidence: string
  eligibilityEvidence: string
  periodEvidence: string
  /** Reviewed chargeable periods, including chargeable part-months. */
  chargeableMonths: number
  /** Previously assessed TA duty, not a payment/deferment account balance. */
  previouslyAssessedDutyGbp: string
  previousAssessmentEvidence: string
  /** NI: confirm the retained entry assessment's applicable tariff/risk basis.
   * Destination alone must not select EU liability or an exchange rate. */
  niEntryBasisEvidence?: string
}

export function temporaryAdmissionDutyLedger(input: TemporaryAdmissionDutyLedger) {
  if (input.jurisdiction !== "GB" && input.jurisdiction !== "NI") throw new Error("Confirm the temporary admission jurisdiction.")
  if (input.event !== "entry" && input.event !== "discharge") throw new Error("Select the temporary admission liability event.")
  const northernIreland = input.jurisdiction === "NI"
  if (northernIreland && input.event !== "discharge") throw new Error("Northern Ireland partial-relief duty is calculated for discharge. Do not apply the GB first-month collection rule at entry.")
  if (northernIreland && !input.niEntryBasisEvidence?.trim()) throw new Error("Record the Northern Ireland entry assessment's tariff, risk and currency basis before calculating the discharge duty.")
  for (const [key, label] of [["entryAssessmentId", "the original entry assessment reference"], ["entryItemId", "the original item reference"], ["fullAuthorisationEvidence", "the full authorisation evidence"], ["eligibilityEvidence", "the eligibility review"], ["periodEvidence", "the chargeable-period evidence"], ["previousAssessmentEvidence", "the previous-assessment evidence"]] as const) {
    if (typeof input[key] !== "string" || !input[key].trim()) throw new Error(`Record ${label} before calculating temporary admission duty.`)
  }
  if (!Number.isSafeInteger(input.chargeableMonths) || input.chargeableMonths < 1) throw new Error("Record the reviewed number of chargeable months, including part-months.")
  const original = Decimal.parse(input.entryDutyGbp)
  const previous = Decimal.parse(input.previouslyAssessedDutyGbp)
  if (original.compare(zero()) <= 0 || previous.compare(zero()) < 0) throw new Error("Record positive entry duty and non-negative previously assessed duty; VAT-only goods need a different treatment.")
  if (input.event === "entry" && (input.chargeableMonths !== 1 || previous.compare(zero()) !== 0)) throw new Error("An entry calculation covers the first month with no earlier TA duty assessment.")
  const uncapped = original.mul(Decimal.parse("0.03")).mul(Decimal.parse(String(input.chargeableMonths)))
  const cumulative = uncapped.compare(original) > 0 ? original : uncapped
  if (previous.compare(cumulative) > 0) throw new Error("Previously assessed duty exceeds the calculated liability. Review the assessments; do not create an automatic refund.")
  const balance = cumulative.sub(previous)
  const amount = (value: Decimal) => ({ displayedGbp: value.fixed(2), exact: value.evidence() })
  return {
    status: "estimate" as const,
    autoPopulationAllowed: false as const,
    source: northernIreland ? TEMPORARY_ADMISSION_NI_PARTIAL_SOURCE : TEMPORARY_ADMISSION_PARTIAL_SOURCE,
    ruleVersion: northernIreland ? "ni-ta-partial-discharge-ledger-v1" : "gb-ta-partial-duty-ledger-v1",
    input: { ...input },
    fullEntryDuty: amount(original),
    cumulativeDuty: amount(cumulative),
    previouslyAssessedDuty: amount(previous),
    additionalDuty: amount(balance),
    cappedAtFullDuty: uncapped.compare(original) > 0,
    vat: null,
    issues: ["VAT requires a separate import-time calculation. Calendar-period counting, eligibility and assessment precision require validation before automatic population."],
  }
}
