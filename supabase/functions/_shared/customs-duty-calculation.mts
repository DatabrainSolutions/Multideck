import { Decimal, allocate, sum, zero } from "./customs-calculation-decimal.mts"
import { computedCustomsValue, type ComputedValueWorksheet } from "./customs-computed-valuation.mts"
import { comparableCustomsValue, type ComparableValueWorksheet } from "./customs-comparable-valuation.mts"
import { deductiveCustomsValue, type DeductiveValueWorksheet } from "./customs-deductive-valuation.mts"
import { fallbackCustomsValue, type FallbackValueWorksheet } from "./customs-fallback-valuation.mts"
import { customsAdjustmentCodes, isPercentageAdjustment } from "./customs-import-terms.mts"
import { percentageAdjustmentCode } from "./customs-cost-review.mts"
import { evaluateTariffMeasure } from "./customs-tariff-evaluator.mts"
import { contractGoodsValue, type ContractConversionWorksheet } from "./customs-contract-conversion.mts"
import { determineNiRisk, type NiRiskInput, type NiRiskResult } from "./customs-ni-risk.mts"
import { compareNiDutyMeasures, type NiComparisonFacts } from "./customs-ni-duty-comparison.mts"
import type { TariffExchangeRate } from "./customs-tariff-exchange-rate.mts"

import { CALCULATION_VERSION, PRECISION_POLICY } from "./customs-calculation-version.mts"
export { CALCULATION_VERSION, PRECISION_POLICY } from "./customs-calculation-version.mts"
export type RuleFamily = "gb-standard" | "ni" | "preference" | "quota" | "specific-compound" | "trade-remedy" | "excise" | "special-procedure" | "alternative-valuation" | "contract-conversion" | "vat-expenses"
/** Empty deliberately: photographed workings do not certify a CDS rule family.
 * Enable only in a reviewed code release with source/assessment fixtures. */
export const certifiedRuleFamilies: readonly RuleFamily[] = []
export type Reference = { source: string; validFrom: string; validTo: string; retrievedAt: string; reference: string; provenance?: "operator" | "official-snapshot" }
/** Only server-selected measures from retained responses qualify. An official
 * website URL on an operator's estimate is not retrieved tariff evidence. */
export function hasOfficialTaxEvidence(item: Pick<CalculationItem, "measures" | "vatReference">): boolean {
  return item.measures.length > 0 && [...item.measures, item.vatReference].every(reference => reference?.provenance === "official-snapshot")
}
export type Rate = Reference & { currency: string; rate: string; direction: "currency_units_per_gbp" }
export type TaxComponent = { type: "percent"; rate: string } | { type: "specific"; rate: string; currency: "GBP" | "EUR"; tariffConversion?: TariffExchangeRate; quantity: string; unit: string; per: string; quantityUnit?: string; quantityQualifier?: string; unitQualifier?: string; quantityEvidence?: string; alcoholByVolume?: string; strengthEvidence?: string }
export type TaxMeasure = Reference & {
  processingInputLotId?: string
  taxType: string; family: RuleFamily; jurisdiction: "UK" | "EU"; evidence: string[]
  components: TaxComponent[]
  bounds?: { type: "minimum" | "maximum"; components: TaxComponent[] }[]
  minimum?: string; maximum?: string; includedInVatBase: boolean
  calculationBasis?: "alcohol-duty"
  disposition: "payable" | "suspended" | "relieved" | "secured"
}
export type CalculationCost = {
  id: string; code: string; amount: string; currency: string; evidence: string
  percentageOfItemPrice?: boolean
  scope: { type: "declaration" } | { type: "invoice"; invoiceId: string } | { type: "items"; itemIds: string[] }
  basis: "value" | "gross_mass"; includedInPrice: boolean
  effect: "both" | "customs" | "vat" | "neither"; operation: "add" | "deduct"
  airfreightPercentage?: string
}
export type CalculationItem = {
  id: string; invoiceId: string; goodsValue: string; currency: string; grossMass: string
  contractConversion?: ContractConversionWorksheet
  niRiskInput?: NiRiskInput
  niDutyComparison?: { uk: TaxMeasure; eu: TaxMeasure; facts: NiComparisonFacts }
  valuationMethod: string; alternativeCustomsValue?: string; valuationEvidence?: string
  computedValueWorksheet?: ComputedValueWorksheet
  comparableValueWorksheet?: ComparableValueWorksheet
  deductiveValueWorksheet?: DeductiveValueWorksheet
  fallbackValueWorksheet?: FallbackValueWorksheet
  families: RuleFamily[]; measures: TaxMeasure[]; vatRate?: string; vatReference?: Reference
  vatTreatment?: { disposition: "suspended" | "relieved" | "secured"; evidence: string; reference: Reference; includedTaxReferences: { source: string; reference: string }[] }
  preferenceEvidence?: string; quotaAllocationEvidence?: string; procedureEvidence?: string
  /** Server-assembled original-input bases. Never replace the processed invoice
   * price: that remains the starting point for discharge VAT. Each selected
   * measure belongs to exactly one retained input lot. */
  originalInputDutyBases?: { measureSource: string; measureReference: string; inputLotId: string; originalValueGbp: string; consumedQuantity: string; originalQuantity: string; rateDate: string; evidence: string }[]
}
export type CalculationInput = {
  date: string; jurisdiction: "GB" | "NI"; movement: string; riskStatus?: "at-risk" | "not-at-risk"
  niTreatmentEvidence?: string; niTariff?: "UK" | "EU"; rates: Rate[]
  items: CalculationItem[]; costs: CalculationCost[]
}
export type CalculationLine = {
  itemId: string; status: "needs-information" | "estimate" | "calculated"
  issues: string[]; goodsValue?: string; customsValue?: string; vatBase?: string; duty?: string; vat?: string
  goodsConversion?: { explanation: string; foreignAmount: { numerator: string; denominator: string }; foreignCurrency: string }
  niRiskDecision?: NiRiskResult
  niComparisonWorkings?: { uk: CalculationLine["workings"]; eu: CalculationLine["workings"]; riskInput: NiRiskInput }
  vatLiability?: { amount: string; disposition: TaxMeasure["disposition"]; treatmentReference: string }
  /** NI at-risk VAT is split between goods (B00) and EU duties (B05).
   * Rounded rows may differ from the aggregate estimate; retain that difference. */
  vatTaxes?: { taxType: "B00" | "B05"; base: string; amount: string; exact: { numerator: string; denominator: string } }[]
  vatTaxRoundingDifference?: string
  taxes: { taxType: string; amount: string; disposition: TaxMeasure["disposition"]; reference: string }[]
  allocations: { costId: string; code: string; amount: string; exact: { numerator: string; denominator: string }; basis: string; effect: string; operation: string;
    allocationEvidence?: { originalAmount: string; originalCurrency: string; totalGbp: string; totalExact: { numerator: string; denominator: string }; percentage: string; share: { numerator: string; denominator: string }; eligibleItemIds: string[]; itemPricePercentage?: string; airfreight?: { customsPercentage: string; portion: string } }
  }[]
  workings: { label: string; amount: string; exact: { numerator: string; denominator: string } }[]
}
export type CalculationResult = {
  gbProcessingBasisReviews?: { itemId: string; result: ReturnType<typeof import("./customs-gb-processing-basis.mts").reviewGbProcessingBasis> | null; issues: string[] }[]
  processingInputAllocation?: { result: ReturnType<typeof import("./customs-processing-allocation.mts").allocateProcessingInputs> | null; issues: string[] }
  quotaOptions?: { itemId: string; commodity: string; origin: string; orderNumber: string; preferenceCode: string; dataset: "uk" | "xi"; date: string; options: { id: string; description: string; legalBasis: string }[] }[]
  quotaAllocationLedger?: { allocations: ReturnType<typeof import("./customs-quota-allocation.mts").reconcileQuotaAllocations>; issues: string[] }
  preferenceOptions?: { itemId: string; code: string; origin: string; date: string; dataset: "uk" | "xi"; preferenceCode: string; options: { id: string; description: string; legalBasis: string }[] }[]
  authorisedUseOptions?: { itemId: string; code: string; origin: string; date: string; dataset: "uk"; preferenceCode: string; options: { id: string; description: string; legalBasis: string }[] }[]
  remedyOptions?: { itemId: string; code: string; origin: string; date: string; dataset: "uk" | "xi"; options: { id: string; description: string; additionalCode: string; legalBasis: string; signedInvoiceRequired?: boolean }[] }[]
  temporaryAdmissionLedgers?: { itemId: string; result: ReturnType<typeof import("./customs-temporary-admission.mts").temporaryAdmissionDutyLedger> | null; issues: string[] }[]
  temporaryAdmissionReleases?: { itemId: string; result: ReturnType<typeof import("./customs-temporary-admission.mts").temporaryAdmissionReleaseBalance> | null; issues: string[] }[]
  version: string; precisionPolicy: string; date: string; autoPopulationAllowed: boolean
  referenceNotices?: { source: string; message: string }[]
  issues: string[]; lines: CalculationLine[]; totals: { duty: string; vat: string } | null
  liabilityTotals?: {
    taxes: { taxType: string; disposition: TaxMeasure["disposition"]; amount: string }[]
    vat: { disposition: TaxMeasure["disposition"]; amount: string }[]
    vatByTaxType?: { taxType: "B00" | "B05"; disposition: TaxMeasure["disposition"]; amount: string }[]
    payableVatRoundingDifference?: string
    /** Explicit difference between rounded measure rows and payable line totals.
     * Never distribute or conceal this while CDS precision remains uncertified. */
    payableTaxRoundingDifference: string
  }
}
const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s
function assertReference(ref: Reference | undefined, date: string) {
  if (!ref || !ref.reference || !/^https:\/\//.test(ref.source) || !Number.isFinite(Date.parse(ref.retrievedAt)) || !validDate(ref.validFrom) || !validDate(ref.validTo) || date < ref.validFrom || date > ref.validTo) throw new Error("A dated source covering the calculation date is required.")
}
function nonNegative(value: string) { const n = Decimal.parse(value); if (n.n < 0n) throw new Error("Amounts and rates cannot be negative."); return n }
function percentage(value: string) { return nonNegative(value).div(Decimal.parse("100")) }

export function calculateDuty(input: CalculationInput): CalculationResult {
  const result: CalculationResult = { version: CALCULATION_VERSION, precisionPolicy: PRECISION_POLICY, date: input.date, autoPopulationAllowed: false, issues: [], lines: [], totals: null }
  if (!validDate(input.date)) result.issues.push("Select a valid calculation date.")
  if (!["GB", "NI"].includes(input.jurisdiction)) result.issues.push("Select Great Britain or Northern Ireland.")
  if (!input.items.length || input.items.length > 1000 || input.costs.length > 99) result.issues.push("Use between 1 and 1,000 items and no more than 99 adjustments.")
  if (new Set(input.items.map(i => i.id)).size !== input.items.length || input.items.some(i => !i.id || !i.invoiceId)) result.issues.push("Each item needs a unique reference and an invoice link.")
  const itemRiskEvidence = input.items.length > 0 && input.items.every(item => !!item.niRiskInput || !!item.niDutyComparison)
  if (input.jurisdiction === "NI" && !itemRiskEvidence && (!input.movement || !input.riskStatus || !input.niTreatmentEvidence || !input.niTariff)) result.issues.push("Northern Ireland needs the movement route, risk decision, applicable tariff and supporting authorisation/treatment evidence.")
  if (input.jurisdiction === "NI") {
    if (input.movement && input.movement !== "rest-of-world-to-NI") result.issues.push("This movement needs its NI route-specific liability and VAT treatment. An ordinary overseas-import estimate cannot be used for it.")
    if (input.riskStatus && !["at-risk", "not-at-risk"].includes(input.riskStatus)) result.issues.push("Select a recognised NI risk status.")
    if (input.niTariff && !["UK", "EU"].includes(input.niTariff)) result.issues.push("Select a recognised duty tariff.")
    if (!itemRiskEvidence && ((input.riskStatus === "at-risk" && input.niTariff === "UK") || (input.riskStatus === "not-at-risk" && input.niTariff === "EU"))) result.issues.push("The selected NI risk status and duty tariff conflict. Review the treatment decision.")
  }
  const convert = (amount: string, currency: string) => {
    const value = nonNegative(amount)
    if (currency === "GBP") return value
    const rates = input.rates.filter(r => r.currency === currency)
    if (rates.length !== 1) throw new Error(`One unambiguous ${currency || "currency"} exchange rate is required.`)
    const rate = rates[0]; assertReference(rate, input.date)
    if (rate.direction !== "currency_units_per_gbp") throw new Error("The exchange-rate direction is invalid.")
    return value.div(nonNegative(rate.rate))
  }
  const values = new Map<string, Decimal>()
  for (const item of input.items) {
    const line: CalculationLine = { itemId: item.id, status: "needs-information", issues: [], allocations: [], taxes: [], workings: [] }
    result.lines.push(line)
    try {
      // No sale price is not a zero value. Alternative methods may establish
      // customs value independently; shared value allocation still needs a basis.
      if (item.niRiskInput) {
        if (input.jurisdiction !== "NI" || item.niRiskInput.date !== input.date || item.niRiskInput.movement !== input.movement) throw new Error("The item risk evidence does not match this NI movement and date.")
      }
      if (item.contractConversion && (input.jurisdiction !== "GB" || item.valuationMethod !== "1")) throw new Error("This contractual conversion path requires a GB transaction-value case; verify the separate NI or alternative-valuation treatment.")
      if (item.goodsValue.trim() || item.valuationMethod === "1") {
        if (item.contractConversion) {
          const converted = contractGoodsValue(item.contractConversion, { id: item.invoiceId, currency: item.currency, amount: item.goodsValue }, input.date, convert)
          values.set(item.id, converted.value)
          line.goodsConversion = { explanation: converted.explanation, foreignAmount: converted.foreignAmount, foreignCurrency: item.contractConversion.foreignCurrency }
        } else values.set(item.id, convert(item.goodsValue, item.currency))
        line.goodsValue = values.get(item.id)!.fixed(2)
      }
    }
    catch (error) { line.issues.push((error as Error).message) }
  }
  const allIds = new Set(input.items.map(i => i.id)), costIds = new Set<string>()
  const appliedCodes = new Map<string, Set<string>>()
  const bases = new Set<string>()
  const airCodes = new Set(input.costs.filter(cost => ["AR", "AS", "BR", "BS"].includes(cost.code)).map(cost => cost.code))
  if (airCodes.size > 1) result.issues.push("Use only one airfreight adjustment code (AR, AS, BR or BS) on a declaration.")
  for (const cost of input.costs) {
    try {
      if (!cost.id || costIds.has(cost.id)) throw new Error("Each cost needs a unique reference.")
      costIds.add(cost.id)
      if (!cost.evidence) throw new Error(`Add supporting evidence for ${cost.code || "this cost"}.`)
      if (!["both", "customs", "vat", "neither"].includes(cost.effect) || !["add", "deduct"].includes(cost.operation) || typeof cost.includedInPrice !== "boolean") throw new Error("Confirm how each cost affects customs and VAT value and whether it is already included.")
      if (!["value", "gross_mass"].includes(cost.basis)) throw new Error("Choose value or gross mass allocation.")
      if (cost.scope.type === "items" && (!cost.scope.itemIds.length || cost.scope.itemIds.some(id => !allIds.has(id)) || new Set(cost.scope.itemIds).size !== cost.scope.itemIds.length)) throw new Error("The cost refers to missing or duplicate items.")
      const eligible = input.items.filter(item => cost.scope.type === "declaration" || (cost.scope.type === "invoice" ? item.invoiceId === cost.scope.invoiceId : cost.scope.itemIds.includes(item.id)))
      if (!eligible.length) throw new Error("The cost has no eligible items.")
      const percentageCost = cost.percentageOfItemPrice === true
      const royalty = ["AI", "AM"].includes(cost.code)
      if (royalty && (cost.effect !== "customs" || cost.operation !== "add" || input.jurisdiction !== "GB" || eligible.some(item => item.valuationMethod !== "1"))) throw new Error("Royalties require the GB Method 1 customs addition with separate import VAT exclusion.")
      if (isPercentageAdjustment(cost.code) !== percentageCost) throw new Error("Percentage adjustment codes must use an explicit item-price percentage basis, never a monetary amount.")
      if (percentageCost && (!Object.hasOwn(percentageAdjustmentCode, cost.code) || cost.currency !== "" || cost.basis !== "value" || cost.effect !== (royalty ? "customs" : "both") || cost.operation !== (cost.code === "BI" ? "deduct" : "add") || !/^\d{1,14}(?:\.\d{1,2})?$/.test(cost.amount) || eligible.some(item => item.valuationMethod !== "1") || input.jurisdiction !== "GB")) throw new Error("This percentage adjustment needs GB Method 1 item prices, at most two decimal places, no currency and its code's addition or deduction treatment.")
      for (const item of eligible) {
        const codes = appliedCodes.get(item.id) ?? new Set<string>()
        if (codes.has(cost.code)) throw new Error(`Adjustment ${cost.code} overlaps another adjustment on item ${item.id}.`)
        codes.add(cost.code); appliedCodes.set(item.id, codes)
      }
      const airfreight = ["AR", "AS", "BR", "BS"].includes(cost.code)
      if (airfreight && (cost.operation !== (cost.code.startsWith("B") ? "deduct" : "add") || cost.includedInPrice !== cost.code.startsWith("B"))) throw new Error("Use AR/AS for airfreight not included in the invoice, or BR/BS for included airfreight.")
      if (airfreight && (cost.effect === "neither" || cost.effect === "vat" || cost.basis !== (["AS", "BS"].includes(cost.code) ? "gross_mass" : "value"))) throw new Error("Airfreight must use its code's value or gross-mass allocation and separate customs/VAT treatment.")
      if (cost.effect === "neither" || (cost.operation === "add" && cost.includedInPrice && !royalty) || (cost.operation === "deduct" && !cost.includedInPrice)) continue
      // DE 4/9 prohibits mixing the named freight apportionment codes, not
      // value-based packing/assists with gross-mass freight. Other additions
      // must not accidentally force every freight charge onto a value basis.
      if (["AP", "AR", "AV", "BA", "BR", "AQ", "AS", "AW", "BS", "BU"].includes(cost.code)) {
        const requiredBasis = ["AQ", "AS", "AW", "BS", "BU"].includes(cost.code) ? "gross_mass" : "value"
        if (cost.basis !== requiredBasis) throw new Error(`Adjustment ${cost.code} requires ${requiredBasis === "value" ? "value" : "gross mass"} allocation.`)
        bases.add(cost.basis)
      }
      const fullAmount = percentageCost
        ? sum(eligible.map(item => values.get(item.id) ?? (() => { throw new Error("The percentage basis needs an evidenced item price for every selected item.") })())).mul(percentage(cost.amount))
        : convert(cost.amount, cost.currency)
      // Included royalties need no customs addition, but still leave the VAT
      // base. Additional royalties increase customs value, not import VAT value.
      const allocationOperation = royalty && cost.includedInPrice ? "deduct" : cost.operation
      let portions = [{ amount: fullAmount, effect: royalty && cost.includedInPrice ? "vat" as const : cost.effect, description: "" }]
      if (airfreight) {
        if (!cost.airfreightPercentage || nonNegative(cost.airfreightPercentage).compare(Decimal.parse("100")) > 0) throw new Error("Airfreight requires an evidenced applicable route percentage between 0 and 100.")
        // The percentage is the share INCLUDED in customs value, not the
        // allowance to deduct. VAT retains the full freight charge. See HMRC
        // Group 4 DE 4/9 and Appendix 10: declare full airport-to-airport costs.
        const border = fullAmount.mul(percentage(cost.airfreightPercentage)), remainder = fullAmount.sub(border)
        portions = cost.operation === "add"
          ? [{ amount: border, effect: "both", description: "airfreight included in customs value" }, { amount: remainder, effect: "vat", description: "remaining airfreight retained for VAT" }]
          : [{ amount: remainder, effect: "customs", description: "included airfreight excluded from customs value, retained for VAT" }]
      }
      const directlyAttributed = cost.scope.type === "items" && cost.scope.itemIds.length === 1
      const weights = eligible.map(i => ({ id: i.id, value: directlyAttributed ? Decimal.parse("1") : cost.basis === "gross_mass" ? nonNegative(i.grossMass) : values.get(i.id) ?? (() => { throw new Error("Shared value-based costs need evidenced goods values for every eligible item. Use direct item attribution or the applicable mass-based code where supported.") })() }))
      const totalWeight = sum(weights.map(weight => weight.value))
      for (const { amount, effect, description } of portions) {
        const shares = allocate(amount, weights)
        for (const share of shares) {
          const fraction = weights.find(weight => weight.id === share.id)!.value.div(totalWeight)
          result.lines.find(l => l.itemId === share.id)!.allocations.push({ costId: cost.id, code: cost.code, amount: share.displayed, exact: share.exact.evidence(), basis: directlyAttributed ? "direct" : cost.basis, effect, operation: allocationOperation,
            allocationEvidence: { originalAmount: cost.amount, originalCurrency: cost.currency, totalGbp: amount.fixed(2), totalExact: amount.evidence(), percentage: fraction.mul(Decimal.parse("100")).fixed(2), share: fraction.evidence(), eligibleItemIds: eligible.map(item => item.id).sort(), ...(percentageCost ? { itemPricePercentage: cost.amount } : {}), ...(airfreight ? { airfreight: { customsPercentage: cost.airfreightPercentage!, portion: description } } : {}) } })
        }
      }
    } catch (error) { result.issues.push((error as Error).message) }
  }
  if (bases.size > 1) result.issues.push("Value and gross-mass adjustment methods cannot be mixed in this calculation.")
  for (const [index, originalItem] of input.items.entries()) {
    let item = originalItem
    const line = result.lines[index]
    try {
      if (line.issues.length || result.issues.length) continue
      const goods = values.get(item.id)
      const adjustments = (predicate: (a: CalculationLine["allocations"][number]) => boolean) => sum(line.allocations.filter(predicate).map(a => {
        const value = new Decimal(BigInt(a.exact.numerator), BigInt(a.exact.denominator))
        return a.operation === "deduct" ? zero().sub(value) : value
      }))
      let customs: Decimal
      let valuationWorkings: CalculationLine["workings"] = []
      if (item.valuationMethod === "1") {
        if (!goods) throw new Error("Method 1 requires the goods transaction value.")
        if (goods.add(adjustments(a => ["BH", "BI"].includes(a.code) && a.operation === "deduct")).n < 0n) throw new Error("Discounts exceed this item's goods price. Freight and other additions cannot cover an excessive goods discount.")
        customs = goods.add(adjustments(a => a.effect === "both" || a.effect === "customs"))
      }
      else if (item.valuationMethod === "2" || item.valuationMethod === "3") {
        if (!item.comparableValueWorksheet || item.comparableValueWorksheet.method !== item.valuationMethod) throw new Error("Complete a comparable-import worksheet matching the selected valuation method.")
        if (line.allocations.some(allocation => allocation.effect === "both" || allocation.effect === "customs")) throw new Error("Include delivery differences in the comparable worksheet, not again as customs-value adjustments.")
        const comparison = comparableCustomsValue(item.comparableValueWorksheet)
        customs = comparison.value
        valuationWorkings = comparison.candidates.map(candidate => ({ label: `Comparable ${candidate.id}${candidate.id === comparison.selectedId ? " — selected" : candidate.eligible ? " — eligible" : " — lower priority"}`, amount: candidate.value.fixed(2), exact: candidate.value.evidence() }))
      }
      else if (item.valuationMethod === "4") {
        if (!item.deductiveValueWorksheet) throw new Error("Complete the Method 4 sales and deductions worksheet.")
        if (line.allocations.some(allocation => allocation.effect === "both" || allocation.effect === "customs")) throw new Error("Reconcile customs-value adjustments within the Method 4 worksheet rather than adding them twice.")
        const deduction = deductiveCustomsValue(item.deductiveValueWorksheet)
        customs = deduction.value
        valuationWorkings = [{ label: "Method 4: selected unit selling price", amount: deduction.unitPrice.fixed(2), exact: deduction.unitPrice.evidence() },
          ...deduction.deductions.map(component => ({ label: `Method 4: ${component.category} deduction per unit`, amount: component.amount.fixed(2), exact: component.amount.evidence() })),
          { label: "Method 4: net customs value per unit", amount: deduction.netUnit.fixed(2), exact: deduction.netUnit.evidence() }]
      }
      else if (item.valuationMethod === "5") {
        if (!item.computedValueWorksheet) throw new Error("Complete the Method 5 producer-cost worksheet; a manually entered total is not sufficient.")
        if (line.allocations.some(allocation => allocation.effect === "both" || allocation.effect === "customs")) throw new Error("Record all Method 5 border and production costs in its worksheet, not again as customs-value adjustments.")
        const computed = computedCustomsValue(item.computedValueWorksheet, convert)
        customs = computed.value
        valuationWorkings = computed.workings.map(component => ({ label: `Method 5: ${component.category}${component.includedIn ? ` (included in ${component.includedIn})` : ""}`, amount: component.amount.fixed(2), exact: component.amount.evidence() }))
      }
      else if (item.valuationMethod === "6") {
        if (!item.fallbackValueWorksheet) throw new Error("Complete the Method 6 fallback worksheet; a manually entered total is not sufficient.")
        const fallback = fallbackCustomsValue(item.fallbackValueWorksheet, convert)
        if (fallback.includesCustomsAdjustments && line.allocations.some(allocation => allocation.effect === "both" || allocation.effect === "customs")) throw new Error("Reconcile customs-value adjustments in the flexible valuation worksheet, not again as separate costs.")
        customs = fallback.value.add(adjustments(a => a.effect === "both" || a.effect === "customs"))
        valuationWorkings = fallback.workings.map(step => ({ label: step.label, amount: step.value.fixed(2), exact: step.value.evidence() }))
      }
      else throw new Error("Select a supported customs valuation method.")
      if (customs.n <= 0n) throw new Error("Customs value must be greater than zero.")
      if (item.niDutyComparison) {
        if (item.measures.length || item.niRiskInput) throw new Error("Use either paired NI comparison or a preselected duty treatment, not both.")
        const comparison = item.niDutyComparison
        if (input.jurisdiction !== "NI" || comparison.facts.date !== input.date || comparison.facts.movement !== input.movement) throw new Error("The paired duty evidence does not match this NI movement and date.")
        const evaluated = compareNiDutyMeasures(comparison.uk, comparison.eu, customs, `${input.date}:item:${item.id}:allocated-customs-value`, comparison.facts)
        line.niRiskDecision = evaluated.decision
        line.niComparisonWorkings = { ...evaluated.workings, riskInput: evaluated.riskInput }
        if (!evaluated.selectedMeasure) throw new Error(evaluated.decision.reasons.join(" "))
        // Derived selection is local to this run; never rewrite saved input.
        item = { ...item, niRiskInput: evaluated.riskInput, measures: [evaluated.selectedMeasure] }
      }
      if (item.niRiskInput) {
        // Allocation and valuation must finish before comparing equivalent
        // duties. Invoice value or a rounded display value is not this base.
        line.niRiskDecision = determineNiRisk(item.niRiskInput)
        if (line.niRiskDecision.status === "needs-information") throw new Error(line.niRiskDecision.reasons.join(" "))
        for (const evidence of [item.niRiskInput.ukDuty, item.niRiskInput.euDuty]) {
          if (evidence?.basis === "equivalent-duty" && customs.compare(new Decimal(BigInt(evidence.customsValueGbp.numerator), BigInt(evidence.customsValueGbp.denominator))) !== 0) throw new Error("NI equivalent-duty evidence does not use this item's fully allocated customs value.")
        }
      }
      if (!item.measures.length) throw new Error("Select and verify the applicable duty measures, including an explicit zero rate where appropriate.")
      const treatmentFamilies = new Set([...item.families, ...item.measures.map(measure => measure.family)])
      if (treatmentFamilies.has("preference") && !item.preferenceEvidence) throw new Error("Preference requires supporting origin evidence.")
      if (treatmentFamilies.has("quota") && !item.quotaAllocationEvidence) throw new Error("Complete the quota allocation and tariff eligibility checks before calculating a reduced rate. A quantity check alone does not establish eligibility.")
      if (treatmentFamilies.has("special-procedure") && !item.procedureEvidence) throw new Error("Record the procedure authorisation and liability event.")
      const amounts: { measure: TaxMeasure; amount: Decimal }[] = []
      const taxWorkings: CalculationLine["workings"] = []
      const measureReferences = new Set<string>()
      const originalBases = item.originalInputDutyBases
      if (originalBases !== undefined) {
        if (!Array.isArray(originalBases) || !originalBases.length || !treatmentFamilies.has("special-procedure") || !item.procedureEvidence?.trim()) throw new Error("Original-input duty needs an evidenced processing treatment and retained input bases.")
        if (item.niRiskInput || item.niDutyComparison) throw new Error("Original-input duty requires a separate reviewed NI risk comparison.")
        const keys = originalBases.map(base => JSON.stringify([base.measureSource, base.measureReference, base.inputLotId]))
        if (new Set(keys).size !== keys.length || keys.length !== item.measures.length || keys.some(key => !item.measures.some(measure => JSON.stringify([measure.source, measure.reference, measure.processingInputLotId]) === key))) throw new Error("Match every original-input duty measure to exactly one retained input basis.")
      }
      for (const measure of item.measures) {
        const originalBase = originalBases?.find(base => base.measureSource === measure.source && base.measureReference === measure.reference && base.inputLotId === measure.processingInputLotId)
        if (measure.processingInputLotId && !originalBase) throw new Error("An original-lot measure needs its retained allocation basis.")
        let dutyValue = customs, quantityShare = Decimal.parse("1"), rateDate = input.date
        if (originalBase) {
          if (!originalBase.inputLotId?.trim() || !originalBase.evidence?.trim() || !validDate(originalBase.rateDate) || originalBase.rateDate > input.date) throw new Error("Retain the original input, allocation evidence and applicable duty rate date.")
          if (measure.family === "excise") throw new Error("Original-input excise requires its own product and liability-event calculation.")
          const originalQuantity = nonNegative(originalBase.originalQuantity), consumed = nonNegative(originalBase.consumedQuantity)
          if (originalQuantity.n === 0n || consumed.n === 0n || consumed.compare(originalQuantity) > 0) throw new Error("Original-input consumption must be positive and cannot exceed its original quantity.")
          quantityShare = consumed.div(originalQuantity)
          dutyValue = nonNegative(originalBase.originalValueGbp).mul(quantityShare)
          rateDate = originalBase.rateDate
          taxWorkings.push({ label: `Original input ${originalBase.inputLotId}: £${originalBase.originalValueGbp} × ${originalBase.consumedQuantity}/${originalBase.originalQuantity}; duty rate date ${rateDate}`, amount: dutyValue.fixed(2), exact: dutyValue.evidence() })
        }
        assertReference(measure, rateDate)
        const identity = JSON.stringify([measure.source, measure.reference, measure.processingInputLotId])
        if (measureReferences.has(identity)) throw new Error("The same tariff measure is present more than once. Reconcile it before calculating.")
        measureReferences.add(identity)
        if (typeof measure.includedInVatBase !== "boolean") throw new Error("Confirm whether each import tax belongs in the VAT base.")
        // NI duty may use XI/EU measures, but VAT and excise are UK measures.
        // Keep source selection per tax, not a declaration-wide dataset assumption.
        const expectedJurisdiction = measure.family === "excise" ? "UK" : input.jurisdiction === "NI" ? line.niRiskDecision ? line.niRiskDecision.status === "at-risk" ? "EU" : "UK" : input.niTariff : "UK"
        if (!measure.evidence.length || measure.jurisdiction !== expectedJurisdiction) throw new Error(measure.family === "excise" ? "Excise requires evidenced UK tariff measures, including for Northern Ireland." : "The measure needs eligibility evidence and must match the applicable tariff.")
        if (!/^[A-Z0-9]{3}$/.test(measure.taxType) || ["B00", "B05"].includes(measure.taxType) || !measure.components.length || !["payable", "suspended", "relieved", "secured"].includes(measure.disposition)) throw new Error("Select a valid non-VAT tax measure and liability treatment.")
        // Provisional remedies are security, not assessed payable duty. Do not
        // accidentally include them in payable duty or its ordinary VAT base.
        // HMRC: check-when-you-need-to-pay-anti-dumping-countervailing-and-safeguard-duties.
        if (["A35", "A45", "A85", "A95"].includes(measure.taxType)) {
          if (measure.family !== "trade-remedy") throw new Error("Provisional anti-dumping and countervailing duties need the trade-remedy treatment.")
          if (measure.disposition === "payable") throw new Error("Provisional anti-dumping and countervailing duties must be secured, not recorded as payable. Use the definitive assessment when one is issued.")
          if (measure.disposition !== "secured" && !item.procedureEvidence?.trim()) throw new Error("Suspending or relieving a provisional duty requires the procedure and supporting evidence.")
        }
        // Official NI reporting codes differ from the UK-equivalent codes used
        // by the common arithmetic and paired risk comparison.
        // HMRC NI completion guidance, Part 2, DE 4/3 (Appendix 8).
        const niCodes: Record<string, string> = { A00: "A50", A20: "A70", A30: "A80", A35: "A85", A40: "A90", A45: "A95" }
        let reportedMeasure = measure
        if (input.jurisdiction === "NI" && measure.jurisdiction === "EU") {
          const taxType = niCodes[measure.taxType] ?? (Object.values(niCodes).includes(measure.taxType) ? measure.taxType : undefined)
          if (!taxType) throw new Error("The EU duty needs its Northern Ireland reporting tax code before calculation.")
          reportedMeasure = { ...measure, taxType }
        }
        const evaluated = evaluateTariffMeasure(reportedMeasure, dutyValue, rateDate, quantityShare)
        const amount = evaluated.amount
        taxWorkings.push(...evaluated.workings)
        amounts.push({ measure: reportedMeasure, amount })
      }
      if (item.niRiskInput && line.niRiskDecision) {
        const compared = line.niRiskDecision.status === "at-risk" ? item.niRiskInput.euDuty : item.niRiskInput.ukDuty
        if (compared?.basis === "equivalent-duty") {
          const expected = new Decimal(BigInt(compared.dutyGbp.numerator), BigInt(compared.dutyGbp.denominator))
          const actual = sum(amounts.filter(entry => entry.measure.family !== "excise").map(entry => entry.amount))
          if (actual.compare(expected) !== 0) throw new Error("The selected NI duty does not match the complete exact duty used for the risk comparison. Recalculate both tariff treatments.")
        }
      }
      assertReference(item.vatReference, input.date)
      if (item.vatRate === undefined || item.vatRate === "") throw new Error("Verify the applicable VAT rate; missing is not zero.")
      const duty = sum(amounts.filter(a => a.measure.disposition === "payable").map(a => a.amount))
      let vatTaxes = amounts.filter(a => a.measure.includedInVatBase && a.measure.disposition === "payable")
      if (item.vatTreatment) {
        const treatment = item.vatTreatment
        if (!["suspended", "relieved", "secured"].includes(treatment.disposition) || !treatment.evidence?.trim() || !item.procedureEvidence?.trim()) throw new Error("Non-payable VAT requires evidenced procedure, liability event and VAT treatment; payment postponement is not suspension.")
        assertReference(treatment.reference, input.date)
        if (!Array.isArray(treatment.includedTaxReferences)) throw new Error("Specify the evidenced import taxes included in the specialist VAT base.")
        const references = treatment.includedTaxReferences.map(ref => JSON.stringify([ref.source, ref.reference]))
        if (new Set(references).size !== references.length || references.some(ref => !amounts.some(a => JSON.stringify([a.measure.source, a.measure.reference]) === ref))) throw new Error("The specialist VAT base refers to missing or duplicate tax measures.")
        vatTaxes = amounts.filter(a => references.includes(JSON.stringify([a.measure.source, a.measure.reference])))
      }
      const vatBase = customs.add(sum(vatTaxes.map(a => a.amount))).add(adjustments(a => a.effect === "vat")).sub(adjustments(a => a.effect === "customs"))
      if (vatBase.n < 0n) throw new Error("VAT value cannot be negative.")
      const vat = vatBase.mul(percentage(item.vatRate))
      const payableVat = item.vatTreatment ? zero() : vat
      const niEuTreatment = input.jurisdiction === "NI" && (line.niRiskDecision ? line.niRiskDecision.status === "at-risk" : input.niTariff === "EU")
      if (niEuTreatment) {
        if (item.vatTreatment) throw new Error("NI special-procedure VAT needs its evidenced B00/B05 liability allocation before calculation.")
        const euDutyBase = sum(vatTaxes.filter(entry => entry.measure.jurisdiction === "EU").map(entry => entry.amount))
        const goodsVatBase = vatBase.sub(euDutyBase)
        if (goodsVatBase.n < 0n) throw new Error("NI goods VAT value cannot be negative after separating EU duties.")
        line.vatTaxes = ([{ taxType: "B00" as const, base: goodsVatBase }, { taxType: "B05" as const, base: euDutyBase }]).map(row => {
          const amount = row.base.mul(percentage(item.vatRate!))
          return { taxType: row.taxType, base: row.base.fixed(2), amount: amount.fixed(2), exact: amount.evidence() }
        })
        line.vatTaxRoundingDifference = Decimal.parse(payableVat.fixed(2)).sub(sum(line.vatTaxes.map(row => Decimal.parse(row.amount)))).fixed(2)
      }
      const adjustmentSteps = (effect: "customs" | "vat") => line.allocations.filter(allocation => effect === "customs" ? allocation.effect === "both" || allocation.effect === "customs" : allocation.effect === "vat" || allocation.effect === "customs").map(allocation => {
        let value = new Decimal(BigInt(allocation.exact.numerator), BigInt(allocation.exact.denominator))
        if (allocation.operation === "deduct") value = zero().sub(value)
        if (effect === "vat" && allocation.effect === "customs") value = zero().sub(value)
        const name = customsAdjustmentCodes.find(([code]) => code === allocation.code)?.[1] ?? allocation.code
        const treatment = effect === "vat" && allocation.effect === "customs" ? (allocation.operation === "deduct" ? "retained in VAT base" : "excluded from VAT base") : allocation.effect === "vat" ? "VAT-only" : "customs value"
        const shareDescription = allocation.allocationEvidence?.itemPricePercentage ? `; ${allocation.allocationEvidence.itemPricePercentage}% of this item's goods price, excluding other adjustments` : allocation.allocationEvidence ? `; ${allocation.allocationEvidence.percentage}% of £${allocation.allocationEvidence.totalGbp}` : ""
        const air = allocation.allocationEvidence?.airfreight
        const airDescription = air ? `; ${air.customsPercentage}% customs inclusion — ${air.portion}` : ""
        return { label: `${allocation.code} ${name} — ${treatment} (${allocation.basis === "direct" ? "directly attributed" : allocation.basis === "gross_mass" ? "allocated by gross weight" : "allocated by goods value"}${shareDescription}${airDescription})`, amount: value.fixed(2), exact: value.evidence() }
      })
      line.customsValue = customs.fixed(2); line.vatBase = vatBase.fixed(2); line.duty = duty.fixed(2); line.vat = payableVat.fixed(2)
      if (item.vatTreatment) line.vatLiability = { amount: vat.fixed(2), disposition: item.vatTreatment.disposition, treatmentReference: item.vatTreatment.reference.reference }
      line.taxes = amounts.map(({ measure, amount }) => ({ taxType: measure.taxType, amount: amount.fixed(2), disposition: measure.disposition, reference: measure.reference }))
      line.workings = [...(goods ? [{ label: "Goods value", amount: goods.fixed(2), exact: goods.evidence() }] : []), ...valuationWorkings, ...adjustmentSteps("customs"), { label: "Customs value", amount: customs.fixed(2), exact: customs.evidence() }, ...taxWorkings, { label: "Payable duty and other import taxes", amount: duty.fixed(2), exact: duty.evidence() }, ...adjustmentSteps("vat"), ...[["VAT base", vatBase], [`Import VAT: VAT base × ${item.vatRate}%`, vat]].map(([label, value]) => ({ label: label as string, amount: (value as Decimal).fixed(2), exact: (value as Decimal).evidence() }))]
      if (goods && line.goodsConversion) line.workings[0].label = `Goods value: ${line.goodsConversion.explanation}`
      if (line.vatTaxes) {
        line.workings.push(...line.vatTaxes.map(row => ({ label: `${row.taxType}: ${row.taxType === "B05" ? "VAT on EU import duties" : "VAT on goods and other eligible costs"} — £${row.base} × ${item.vatRate}%`, amount: row.amount, exact: row.exact })))
      }
      if (item.vatTreatment) {
        line.workings.push({ label: `VAT amount ${item.vatTreatment.disposition} — ${item.vatTreatment.reference.reference}`, amount: vat.fixed(2), exact: vat.evidence() }, { label: "Payable VAT for this evidenced liability event", amount: payableVat.fixed(2), exact: payableVat.evidence() })
      }
      const families = new Set<RuleFamily>([...(item.families), ...item.measures.map(m => m.family), input.jurisdiction === "NI" ? "ni" : "gb-standard", ...(item.valuationMethod !== "1" ? ["alternative-valuation" as const] : []), ...(item.contractConversion ? ["contract-conversion" as const] : []), ...(item.vatTreatment ? ["special-procedure" as const] : [])])
      line.status = hasOfficialTaxEvidence(item) && [...families].every(f => certifiedRuleFamilies.includes(f)) ? "calculated" : "estimate"
    } catch (error) { line.issues.push((error as Error).message) }
  }
  if (!result.issues.length && result.lines.length && result.lines.every(l => !l.issues.length && l.duty !== undefined && l.vat !== undefined)) {
    result.totals = { duty: sum(result.lines.map(l => Decimal.parse(l.duty!))).fixed(2), vat: sum(result.lines.map(l => Decimal.parse(l.vat!))).fixed(2) }
    const taxes = new Map<string, { taxType: string; disposition: TaxMeasure["disposition"]; amount: Decimal }>()
    const vat = new Map<TaxMeasure["disposition"], Decimal>()
    for (const line of result.lines) {
      for (const tax of line.taxes) {
        const key = JSON.stringify([tax.taxType, tax.disposition])
        taxes.set(key, { taxType: tax.taxType, disposition: tax.disposition, amount: (taxes.get(key)?.amount ?? zero()).add(Decimal.parse(tax.amount)) })
      }
      const disposition = line.vatLiability?.disposition ?? "payable"
      vat.set(disposition, (vat.get(disposition) ?? zero()).add(Decimal.parse(line.vatLiability?.amount ?? line.vat!)))
    }
    const orderedTaxes = [...taxes.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, tax]) => tax)
    result.liabilityTotals = {
      taxes: orderedTaxes.map(tax => ({ ...tax, amount: tax.amount.fixed(2) })),
      vat: [...vat.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([disposition, amount]) => ({ disposition, amount: amount.fixed(2) })),
      payableTaxRoundingDifference: Decimal.parse(result.totals.duty).sub(sum(orderedTaxes.filter(tax => tax.disposition === "payable").map(tax => tax.amount))).fixed(2),
    }
    if (result.lines.some(line => line.vatTaxes)) {
      const byType = new Map<string, { taxType: "B00" | "B05"; disposition: TaxMeasure["disposition"]; amount: Decimal }>()
      for (const line of result.lines) {
        const disposition = line.vatLiability?.disposition ?? "payable"
        for (const row of line.vatTaxes ?? [{ taxType: "B00" as const, amount: line.vatLiability?.amount ?? line.vat! }]) {
          const key = JSON.stringify([row.taxType, disposition])
          byType.set(key, { taxType: row.taxType, disposition, amount: (byType.get(key)?.amount ?? zero()).add(Decimal.parse(row.amount)) })
        }
      }
      result.liabilityTotals.vatByTaxType = [...byType.values()].sort((a, b) => a.taxType.localeCompare(b.taxType) || a.disposition.localeCompare(b.disposition)).map(row => ({ ...row, amount: row.amount.fixed(2) }))
      result.liabilityTotals.payableVatRoundingDifference = Decimal.parse(result.totals.vat).sub(sum([...byType.values()].filter(row => row.disposition === "payable").map(row => row.amount))).fixed(2)
    }
  }
  result.autoPopulationAllowed = !!result.totals && result.liabilityTotals?.payableTaxRoundingDifference === "0.00" && (result.liabilityTotals?.payableVatRoundingDifference ?? "0.00") === "0.00" && result.lines.every(l => l.status === "calculated")
  return result
}

export type AssessmentLine = {
  itemId: string; duty: string; vat: string; customsValue?: string; vatBase?: string;
  currency?: "GBP";
  vatLiability?: { amount: string; disposition: TaxMeasure["disposition"] };
  vatTaxes?: { taxType: "B00" | "B05"; amount: string; base: string }[];
  /** Non-VAT import taxes, grouped by tax type and liability disposition. */
  taxes?: { taxType: string; amount: string; disposition: TaxMeasure["disposition"] }[];
}

export type AssessmentTotals = { currency: "GBP"; duty: string; vat: string }

/** Declaration-level reconciliation supplements, never replaces, each line's
 * bases and tax-type comparison. Provider mapping must supply confirmed GBP
 * liability totals, not payment/deferment balances. No partial totals are shown
 * as a complete assessment when an item is missing. */
export function compareDeclarationAssessment(result: CalculationResult, assessed: AssessmentLine[], totals?: AssessmentTotals) {
  const lines = compareAssessment(result, assessed)
  if (totals && (totals.currency !== "GBP" || [totals.duty, totals.vat].some(amount => typeof amount !== "string" || !/^\d{1,24}(?:\.\d{1,2})?$/.test(amount)))) {
    throw new Error("Assessment totals require exact non-negative GBP amounts with no more than two decimal places.")
  }
  const missingItemIds = result.lines.filter(line => !assessed.some(row => row.itemId === line.itemId)).map(line => line.itemId)
  const issues: string[] = []
  if (!result.lines.length || !result.totals || result.issues.length) issues.push("A complete calculated declaration is required for reconciliation.")
  if (missingItemIds.length) issues.push("The assessment is missing invoice items.")
  if (!totals) issues.push("The assessed declaration totals have not been supplied.")
  if (assessed.some(row => row.currency !== "GBP")) issues.push("Confirm the GBP currency of every assessed item.")
  const assessedItemTotals = !missingItemIds.length && assessed.length > 0
    ? { duty: sum(assessed.map(row => Decimal.parse(row.duty))).fixed(2), vat: sum(assessed.map(row => Decimal.parse(row.vat))).fixed(2) }
    : null
  const differences = totals && assessedItemTotals && result.totals ? {
    duty: Decimal.parse(totals.duty).sub(Decimal.parse(result.totals.duty)).fixed(2),
    vat: Decimal.parse(totals.vat).sub(Decimal.parse(result.totals.vat)).fixed(2),
    assessedDutyToItems: Decimal.parse(totals.duty).sub(Decimal.parse(assessedItemTotals.duty)).fixed(2),
    assessedVatToItems: Decimal.parse(totals.vat).sub(Decimal.parse(assessedItemTotals.vat)).fixed(2),
  } : null
  const different = lines.some(line => line.status === "cds-difference") || (differences && Object.values(differences).some(amount => amount !== "0.00"))
  // A known difference does not prove that all assessment evidence was supplied.
  // Keep this independent of status so callers can show both conditions.
  const complete = issues.length === 0 && lines.every(line => line.status !== "incomplete" && !("missingFields" in line && line.missingFields?.length))
  return {
    status: different ? "cds-difference" : !complete ? "incomplete" : "matched",
    complete,
    lines, missingItemIds, assessedItemTotals, differences, issues,
  }
}

/** Compare displayed assessments exactly. Missing bases are incomplete evidence,
 * not proof of reconciliation. Never round an incoming sub-penny difference away. */
export function compareAssessment(result: CalculationResult, assessed: AssessmentLine[]) {
  if (new Set(result.lines.map(line => line.itemId)).size !== result.lines.length) throw new Error("Duplicate calculated item references. Recalculate before reconciling the assessment.")
  if (new Set(assessed.map(a => a.itemId)).size !== assessed.length) throw new Error("Duplicate assessment item references.")
  if (assessed.some(a => !result.lines.some(l => l.itemId === a.itemId))) throw new Error("Assessment contains an unknown item.")
  for (const row of assessed) {
    if (row.currency !== undefined && row.currency !== "GBP") throw new Error("CDS assessment amounts must be in GBP.")
    if (row.vatLiability && (!["payable", "suspended", "relieved", "secured"].includes(row.vatLiability.disposition) || typeof row.vatLiability.amount !== "string" || !/^\d{1,24}(?:\.\d{1,2})?$/.test(row.vatLiability.amount))) throw new Error("Assessment VAT liability needs an explicit disposition and exact GBP amount.")
    for (const field of ["duty", "vat", "customsValue", "vatBase"] as const) {
      if (row[field] === undefined && (field === "customsValue" || field === "vatBase")) continue
      if (typeof row[field] !== "string" || !/^\d{1,24}(?:\.\d{1,2})?$/.test(row[field]!)) throw new Error(`Assessment ${field} must be a non-negative GBP amount with no more than two decimal places.`)
    }
    if (row.taxes !== undefined) {
      if (!Array.isArray(row.taxes) || row.taxes.length > 500) throw new Error("Assessment tax breakdown is invalid.")
      const keys = new Set<string>()
      for (const tax of row.taxes) {
        if (!tax || typeof tax.taxType !== "string" || !/^[A-Z0-9]{3}$/.test(tax.taxType) || ["B00", "B05"].includes(tax.taxType) ||
          !["payable", "suspended", "relieved", "secured"].includes(tax.disposition) ||
          typeof tax.amount !== "string" || !/^\d{1,24}(?:\.\d{1,2})?$/.test(tax.amount)) throw new Error("Assessment tax breakdown needs a non-VAT tax type, disposition and exact GBP amount.")
        const key = JSON.stringify([tax.taxType, tax.disposition])
        if (keys.has(key)) throw new Error("Duplicate assessment tax type and disposition.")
        keys.add(key)
      }
    }
    if (row.vatTaxes !== undefined && (!Array.isArray(row.vatTaxes) || row.vatTaxes.length !== 2 || new Set(row.vatTaxes.map(tax => tax.taxType)).size !== 2 || row.vatTaxes.some(tax => !["B00", "B05"].includes(tax.taxType) || [tax.base, tax.amount].some(value => typeof value !== "string" || !/^\d{1,24}(?:\.\d{1,2})?$/.test(value))))) throw new Error("Assessment VAT breakdown needs one B00 and one B05 row with exact GBP bases and amounts.")
  }
  return result.lines.map(line => {
    const row = assessed.find(a => a.itemId === line.itemId)
    if (!row || line.duty === undefined || line.vat === undefined) return { itemId: line.itemId, status: "incomplete" }
    const dutyDifference = nonNegative(row.duty).sub(Decimal.parse(line.duty)).fixed(2)
    const vatDifference = nonNegative(row.vat).sub(Decimal.parse(line.vat)).fixed(2)
    const customsValueDifference = row.customsValue !== undefined && line.customsValue !== undefined ? nonNegative(row.customsValue).sub(Decimal.parse(line.customsValue)).fixed(2) : undefined
    const vatBaseDifference = row.vatBase !== undefined && line.vatBase !== undefined ? nonNegative(row.vatBase).sub(Decimal.parse(line.vatBase)).fixed(2) : undefined
    const missingFields = [customsValueDifference === undefined ? "customsValue" : null, vatBaseDifference === undefined ? "vatBase" : null, row.taxes === undefined ? "taxes" : null, row.currency !== "GBP" ? "currency" : null].filter((field): field is string => field !== null)
    const taxDifferences: { taxType: string; disposition: TaxMeasure["disposition"]; calculated: string | null; assessed: string | null; difference: string | null }[] = []
    if (row.taxes !== undefined) {
      const expected = new Map<string, Decimal>()
      for (const tax of line.taxes) {
        const key = JSON.stringify([tax.taxType, tax.disposition])
        expected.set(key, (expected.get(key) ?? Decimal.parse("0")).add(Decimal.parse(tax.amount)))
      }
      const received = new Map(row.taxes.map(tax => [JSON.stringify([tax.taxType, tax.disposition]), Decimal.parse(tax.amount)]))
      for (const key of [...new Set([...expected.keys(), ...received.keys()])].sort()) {
        const [taxType, disposition] = JSON.parse(key)
        const calculated = expected.get(key), assessed = received.get(key)
        taxDifferences.push({ taxType, disposition, calculated: calculated?.fixed(2) ?? null, assessed: assessed?.fixed(2) ?? null,
          difference: calculated && assessed ? assessed.sub(calculated).fixed(2) : null })
      }
    }
    const issues: string[] = []
    const vatTaxDifferences: { taxType: string; baseDifference: string | null; amountDifference: string | null }[] = []
    if (line.vatTaxes && !row.vatTaxes) missingFields.push("vatTaxes")
    if (row.vatTaxes && !line.vatTaxes) missingFields.push("calculatedVatTaxes")
    if (row.vatTaxes && line.vatTaxes) {
      for (const expected of line.vatTaxes) {
        const received = row.vatTaxes.find(tax => tax.taxType === expected.taxType)
        vatTaxDifferences.push({ taxType: expected.taxType, baseDifference: received ? Decimal.parse(received.base).sub(Decimal.parse(expected.base)).fixed(2) : null, amountDifference: received ? Decimal.parse(received.amount).sub(Decimal.parse(expected.amount)).fixed(2) : null })
      }
      if (sum(row.vatTaxes.map(tax => Decimal.parse(tax.amount))).compare(Decimal.parse(row.vat)) !== 0) issues.push("Assessed B00/B05 amounts do not reconcile to the assessed VAT total.")
      if (row.vatBase !== undefined && sum(row.vatTaxes.map(tax => Decimal.parse(tax.base))).compare(Decimal.parse(row.vatBase)) !== 0) issues.push("Assessed B00/B05 bases do not reconcile to the assessed VAT base.")
    }
    // Retained amounts alone do not prove a valid calculation. Keep numerical
    // differences visible, but never certify a match against an unresolved result.
    if (result.issues.length || line.issues.length || line.status === "needs-information") {
      missingFields.push("validatedCalculation")
    }
    if (line.vatLiability && !row.vatLiability) missingFields.push("vatLiability")
    if (row.vatLiability) {
      const expected = line.vatLiability ?? { amount: line.vat, disposition: "payable" }
      if (row.vatLiability.disposition !== expected.disposition || Decimal.parse(row.vatLiability.amount).compare(Decimal.parse(expected.amount)) !== 0) issues.push("Assessed VAT liability or disposition differs from the calculated treatment.")
      const expectedPayable = row.vatLiability.disposition === "payable" ? Decimal.parse(row.vatLiability.amount) : zero()
      if (expectedPayable.compare(Decimal.parse(row.vat)) !== 0) issues.push("Assessed VAT liability does not reconcile to payable VAT.")
    }
    if (row.taxes !== undefined && sum(row.taxes.filter(tax => tax.disposition === "payable").map(tax => Decimal.parse(tax.amount))).compare(Decimal.parse(row.duty)) !== 0) issues.push("Assessed payable tax breakdown does not reconcile to the assessed non-VAT total.")
    const different = issues.length > 0 || vatTaxDifferences.some(tax => tax.baseDifference !== "0.00" || tax.amountDifference !== "0.00") || taxDifferences.some(tax => tax.difference !== "0.00") || [dutyDifference, vatDifference, customsValueDifference, vatBaseDifference].some(difference => difference !== undefined && difference !== "0.00")
    return { itemId: line.itemId, status: different ? "cds-difference" : missingFields.length ? "incomplete" : "matched", dutyDifference, vatDifference, customsValueDifference, vatBaseDifference, taxDifferences, vatTaxDifferences, issues, missingFields }
  })
}
