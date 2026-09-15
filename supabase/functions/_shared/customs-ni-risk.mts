import { Decimal } from "./customs-calculation-decimal.mts"
import { validCustomsConversionDate } from "./customs-hmrc-exchange-rates.mts"

export const niRiskSource = "https://www.gov.uk/guidance/check-if-you-can-declare-goods-you-bring-into-northern-ireland-not-at-risk-of-moving-to-the-eu"
type DutyEvidence = { date: string; reference: string; allApplicableMeasuresIncluded: boolean } & (
  | { basis: "ad-valorem-only"; percentage: string }
  | { basis: "equivalent-duty"; dutyGbp: { numerator: string; denominator: string }; customsValueGbp: { numerator: string; denominator: string }; valuationReference: string }
)
type Processing =
  | { basis: "unconfirmed" | "not-processed" | "ineligible"; evidence: string }
  | { basis: "turnover"; annualTurnoverGbp: string; financialYearEvidence: string; evidence: string }
  | { basis: "approved-purpose"; purpose: "" | "food" | "construction" | "health-care" | "non-profit" | "animal-feed"; endUse: "" | "NI" | "UK" | "other"; subsequentEntities: number; permanentStructure?: boolean; noSubsequentSale?: boolean; evidence: string }
  | { basis: "uk-meat-quota"; product: "" | "sheepmeat" | "poultry" | "beef"; allocationConfirmed: boolean; quotaReference: string; evidence: string }
export type NiRiskInput = {
  date: string
  movement: "GB-to-NI" | "rest-of-world-to-NI"
  movementEvidence: string
  processing: Processing
  ukDuty?: DutyEvidence
  euDuty: DutyEvidence
  euTradeRemedy?: boolean
  tradeRemedyEvidence?: string
  importerEori: string
  ukims?: { reference: string; eori: string; validFrom: string; validTo?: string; revoked: boolean }
  endUse?: "NI" | "UK" | "other"
  endUseEvidence?: string
}
export type NiRiskResult = { status: "at-risk" | "not-at-risk" | "needs-information"; reasons: string[]; source: string; ruleVersion: "ni-risk-2026-09-14.3"; certified: false }

/** Risk decision only: not an import-VAT decision or a waiver/repayment claim.
 * Rates must cover all applicable measures; callers must obtain them from
 * reviewed dated evidence, not merely copy the headline third-country rate.
 * Equivalent duty uses exact GBP amounts from a shared valuation stage; never
 * rounded displayed amounts or invoice value substituted for customs value.
 */
export function determineNiRisk(input: NiRiskInput): NiRiskResult {
  const result = (status: NiRiskResult["status"], ...reasons: string[]): NiRiskResult => ({ status, reasons, source: niRiskSource, ruleVersion: "ni-risk-2026-09-14.3", certified: false })
  try {
    if (!validCustomsConversionDate(input.date) || !["GB-to-NI", "rest-of-world-to-NI"].includes(input.movement) || !input.movementEvidence?.trim()) throw new Error("Record the NI movement route, date and evidence.")
    if (input.date < "2026-09-14") throw new Error("Historical movements need the NI risk rules verified for that period.")
    const p = input.processing
    if (!p?.evidence?.trim()) throw new Error("Record whether the goods will be processed and the supporting evidence.")
    let processingEligible = false
    if (p.basis === "not-processed") processingEligible = true
    else if (p.basis === "ineligible") return result("at-risk", "The goods do not meet the additional commercial-processing requirements.")
    else if (p.basis === "turnover") {
      if (!p.financialYearEvidence?.trim()) throw new Error("Provide annual-turnover evidence for the processing business.")
      const turnover = Decimal.parse(p.annualTurnoverGbp)
      if (turnover.n < 0n) throw new Error("Annual turnover cannot be negative.")
      processingEligible = turnover.compare(Decimal.parse("2000000")) < 0
    } else if (p.basis === "approved-purpose") {
      if (!["NI", "UK", "other"].includes(p.endUse) || !Number.isInteger(p.subsequentEntities) || p.subsequentEntities < 0) throw new Error("Record the processing end-use location and subsequent entities.")
      if (p.purpose === "food") processingEligible = ["NI", "UK"].includes(p.endUse)
      else if (["construction", "health-care", "non-profit", "animal-feed"].includes(p.purpose)) {
        processingEligible = p.endUse === "NI" && p.subsequentEntities <= 1
        if (p.purpose === "construction") {
          if (typeof p.permanentStructure !== "boolean") throw new Error("Confirm whether the processed goods form a permanent part of the NI structure.")
          processingEligible &&= p.permanentStructure
        }
        if (p.purpose === "non-profit") {
          if (typeof p.noSubsequentSale !== "boolean") throw new Error("Confirm that there is no subsequent sale of the non-profit processed goods.")
          processingEligible &&= p.noSubsequentSale
        }
      } else throw new Error("Select a recognised approved processing purpose.")
    } else if (p.basis === "uk-meat-quota") {
      if (!["sheepmeat", "poultry", "beef"].includes(p.product) || !p.quotaReference?.trim() || p.allocationConfirmed !== true) throw new Error("Verify the applicable UK meat quota and its allocation; a request is not a confirmed allocation.")
      processingEligible = input.movement === "rest-of-world-to-NI"
    } else throw new Error("Select the applicable processing basis.")
    if (!processingEligible) return result("needs-information", "This processing basis does not qualify. Check any other permitted processing basis before deciding the risk status.")
    const exact = (value: { numerator: string; denominator: string }) => {
      if (!value || typeof value.numerator !== "string" || typeof value.denominator !== "string" || !/^\d{1,100}$/.test(value.numerator) || !/^\d{1,100}$/.test(value.denominator) || BigInt(value.denominator) === 0n) throw new Error("Equivalent duties require valid non-negative exact GBP amounts.")
      return new Decimal(BigInt(value.numerator), BigInt(value.denominator))
    }
    const rate = (evidence: DutyEvidence | undefined, name: string) => {
      if (!evidence || evidence.date !== input.date || !evidence.reference?.trim() || evidence.allApplicableMeasuresIncluded !== true) throw new Error(`Provide complete, dated ${name} duty evidence including applicable additional measures and any eligible preferences or reliefs.`)
      if (evidence.basis === "equivalent-duty") {
        if (!evidence.valuationReference?.trim()) throw new Error("Equivalent duty needs the shared customs-valuation reference.")
        const customsValue = exact(evidence.customsValueGbp)
        if (customsValue.n <= 0n) throw new Error("Equivalent duty needs a positive customs value.")
        return exact(evidence.dutyGbp).div(customsValue).mul(Decimal.parse("100"))
      }
      if (evidence.basis !== "ad-valorem-only") throw new Error("Select an evidenced percentage or equivalent-duty comparison.")
      const amount = Decimal.parse(evidence.percentage)
      if (amount.n < 0n) throw new Error(`${name} duty cannot be negative.`)
      return amount
    }
    const eu = rate(input.euDuty, "EU")
    if (input.movement === "GB-to-NI" && eu.n === 0n) return result("not-at-risk", "The complete applicable EU duty is zero and the processing requirements are met.")
    if (input.movement === "rest-of-world-to-NI") {
      if (input.ukDuty?.basis === "equivalent-duty" && input.euDuty.basis === "equivalent-duty" && (input.ukDuty.valuationReference !== input.euDuty.valuationReference || exact(input.ukDuty.customsValueGbp).compare(exact(input.euDuty.customsValueGbp)) !== 0)) throw new Error("UK and EU duties must use the same exact customs value and valuation reference.")
      const uk = rate(input.ukDuty, "UK"), difference = eu.sub(uk)
      if (difference.compare(Decimal.parse("3")) >= 0) return result("at-risk", "The applicable EU duty is at least three percentage points above the UK duty.")
      if (difference.n <= 0n) return result("not-at-risk", "The applicable UK duty is at least the EU duty and the processing requirements are met.")
    }
    if (typeof input.euTradeRemedy !== "boolean" || !input.tradeRemedyEvidence?.trim()) throw new Error("Verify whether an EU trade remedy applies before using UKIMS.")
    if (input.euTradeRemedy) return result("at-risk", "An EU trade remedy prevents use of the UKIMS not-at-risk route.")
    const auth = input.ukims
    if (!/^(GB|XI)/.test(input.importerEori ?? "")) throw new Error("The UKIMS route requires the GB or XI EORI linked to the importer's authorisation.")
    if (!auth || !auth.reference?.trim() || !input.importerEori?.trim() || auth.eori !== input.importerEori || auth.revoked !== false || !validCustomsConversionDate(auth.validFrom) || auth.validFrom > input.date || (auth.validTo !== undefined && (!validCustomsConversionDate(auth.validTo) || auth.validTo < input.date))) throw new Error("Provide an active UKIMS authorisation linked to the importer EORI and valid on the movement date.")
    if (!input.endUseEvidence?.trim() || !["NI", "UK", "other"].includes(input.endUse ?? "")) throw new Error("Provide evidence of sale to or final use by the permitted end consumers.")
    if (!(input.movement === "GB-to-NI" ? ["NI", "UK"].includes(input.endUse!) : input.endUse === "NI")) return result("at-risk", "The evidenced end use is outside the location permitted for this UKIMS movement.")
    return result("not-at-risk", "The evidenced UKIMS authorisation, end use, processing and trade-remedy conditions are met.")
  } catch (error) { return result("needs-information", error instanceof Error ? error.message : "Review the NI risk evidence.") }
}
