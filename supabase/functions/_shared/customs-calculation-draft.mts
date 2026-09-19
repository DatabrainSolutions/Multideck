import { calculateDuty, type CalculationInput, type CalculationItem, type CalculationCost, type Rate, type Reference, type RuleFamily } from "./customs-duty-calculation.mts"
import { importAdjustmentsForDraft, isPercentageAdjustment } from "./customs-import-terms.mts"
import { standardTariffSelection, type TariffSnapshot, type TariffPreferenceReview, type LowValueExclusionReview } from "./customs-tariff-reference.mts"
import type { RemedyReview } from "./customs-trade-remedies.mts"
import type { TariffExchangeRate } from "./customs-tariff-exchange-rate.mts"
import type { ComputedValueWorksheet } from "./customs-computed-valuation.mts"
import type { ComparableValueWorksheet } from "./customs-comparable-valuation.mts"
import type { DeductiveValueWorksheet } from "./customs-deductive-valuation.mts"
import type { FallbackValueWorksheet } from "./customs-fallback-valuation.mts"
import type { TariffQuantity } from "./customs-tariff-components.mts"
import type { ContractConversionWorksheet } from "./customs-contract-conversion.mts"
import { Decimal } from "./customs-calculation-decimal.mts"
import { selectNiImportTariff, prepareNiDutyComparison, type NiRiskFacts, type NiPairedPreferenceReview } from "./customs-ni-tariff.mts"
import { niPreferenceCodes } from "./customs-ni-preference-codes.mts"
import type { AuthorisedUseReview } from "./customs-authorised-use.mts"
import { warehouseEntryEstimate, type WarehouseEntryWorksheet } from "./customs-warehousing.mts"
import { returnedGoodsEstimate, type ReturnedGoodsReview } from "./customs-returned-goods.mts"
import { niTemporaryReleaseEstimate, type NiTemporaryReleaseReview } from "./customs-ni-temporary-release.mts"
import { monetaryAdditionReview, percentageAdjustmentCode } from "./customs-cost-review.mts"
import { discountIssues, type DiscountEvidence } from "./customs-discount.mts"
import { vatIncidentalExpenses, type VatExpenseWorksheet } from "./customs-vat-expenses.mts"
import { temporaryAdmissionDutyLedger, temporaryAdmissionReleaseBalance, duplicateTemporaryReleaseClaims, type TemporaryAdmissionDutyLedger, type TemporaryAdmissionReleaseWorksheet } from "./customs-temporary-admission.mts"
import { isQuotaPreference, quotaClaimIssues } from "./customs-quota-claim.mts"
import { quotaItemQuantity, reconcileQuotaAllocations, type QuotaAllocationReview } from "./customs-quota-allocation.mts"
import { validCustomsConversionDate } from "./customs-hmrc-exchange-rates.mts"
import { allocateProcessingInputs, type ProcessingInputLot, type ProcessingConsumption } from "./customs-processing-allocation.mts"
import { niProcessingReleaseEstimate, niOriginalInputReleaseEstimate, type NiProcessingReleaseReview, type ProcessingTariffEvidence } from "./customs-ni-processing-release.mts"
import { reviewGbProcessingBasis, gbProcessedReleaseEstimate, type GbProcessingBasisReview } from "./customs-gb-processing-basis.mts"

export type CalculationSetup = {
  authorisedUses?: Record<string, AuthorisedUseReview>
  gbProcessingBasis?: Record<string, GbProcessingBasisReview>
  processingInputs?: { jurisdiction: "GB" | "NI"; lots: ProcessingInputLot[]; consumption: ProcessingConsumption[] }
  niProcessingRelease?: Record<string, NiProcessingReleaseReview>
  rateSource?: "official" | "operator"
  warehouseEntry?: WarehouseEntryWorksheet
  returnedGoods?: Record<string, ReturnedGoodsReview>
  temporaryAdmission?: Record<string, TemporaryAdmissionDutyLedger>
  temporaryAdmissionRelease?: Record<string, TemporaryAdmissionReleaseWorksheet>
  niTemporaryRelease?: Record<string, NiTemporaryReleaseReview>
  preferences?: Record<string, TariffPreferenceReview>
  niPreferences?: Record<string, Partial<NiPairedPreferenceReview>>
  quotaAllocations?: Record<string, QuotaAllocationReview>
  vatReviews?: Record<string, { code: string; evidence: string }>
  invoices?: Record<string, { contractConversion?: ContractConversionWorksheet }>
  jurisdiction?: "GB" | "NI"; movement?: string; riskStatus?: "at-risk" | "not-at-risk"; niTariff?: "UK" | "EU"; niTreatmentEvidence?: string
  items?: Record<string, { dutyRate?: string; vatRate?: string; evidence?: string; remedyReview?: RemedyReview; niRiskFacts?: NiRiskFacts; niLowValueExclusion?: LowValueExclusionReview; tariffQuantities?: TariffQuantity[]; computedValueWorksheet?: ComputedValueWorksheet; comparableValueWorksheet?: ComparableValueWorksheet; deductiveValueWorksheet?: DeductiveValueWorksheet; fallbackValueWorksheet?: FallbackValueWorksheet }>
  costs?: Record<string, { evidence?: string; valuationBasisEvidence?: string; discount?: DiscountEvidence; vatExpense?: VatExpenseWorksheet; fullItemPriceBasisConfirmed?: boolean; includedInPrice?: boolean; airfreightPercentage?: string; scope?: CalculationCost["scope"] }>
}
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
const text = (value: unknown) => typeof value === "string" ? value.trim() : ""

/** Cheap structural checks before any rate/provider work. Detailed fiscal
 * validation still runs in the engine and is retained with its result. */
export function calculationPreflight(value: unknown): string[] {
  const draft = record(value), setup = record(draft.dutyCalculationSetup)
  const issues: string[] = []
  if (draft.direction !== "import") issues.push("This calculation workspace applies to import liabilities only.")
  if (!["GB", "NI"].includes(text(setup.jurisdiction))) issues.push("Confirm Great Britain or Northern Ireland before calculating.")
  if (!Array.isArray(draft.items) || draft.items.length < 1 || draft.items.length > 1000) return [...issues, "Use between 1 and 1,000 invoice items before calculating."]
  const items = draft.items.map(record), headers = (Array.isArray(draft.invoiceHeaders) ? draft.invoiceHeaders : []).map(record)
  const itemIds = items.map(item => text(item.id)), invoiceIds = headers.map(header => text(header.id))
  if (itemIds.some(id => !id) || new Set(itemIds).size !== itemIds.length) issues.push("Every invoice item needs a unique reference before calculating.")
  if (!invoiceIds.length || invoiceIds.some(id => !id) || new Set(invoiceIds).size !== invoiceIds.length) issues.push("Complete unique invoice headers before calculating.")
  const invoices = new Set(invoiceIds)
  if (items.some(item => !invoices.has(text(item.invoiceHeaderId)))) issues.push("Link every item to an existing invoice header before calculating.")
  if (calculationCostRows(draft).length > 99) issues.push("Use no more than 99 populated valuation adjustments per calculation.")
  return issues
}

/** Include currencies used only by an active valuation worksheet. Never reuse
 * invoice currency for producer costs denominated in another currency. */
export function calculationCurrencies(value: unknown): string[] {
  const draft = record(value), setup = record(draft.dutyCalculationSetup)
  const headers = (Array.isArray(draft.invoiceHeaders) ? draft.invoiceHeaders : []).map(record)
  const components = (Array.isArray(draft.items) ? draft.items : []).map(record).filter(item => text(item.customsValuationMethod) === "5").flatMap(item => {
    const worksheet = record(record(record(setup.items)[text(item.id)]).computedValueWorksheet)
    return (Array.isArray(worksheet.components) ? worksheet.components : []).map(record).filter(component => !component.includedIn)
  })
  const fallbackCurrencies = (Array.isArray(draft.items) ? draft.items : []).map(record).filter(item => text(item.customsValuationMethod) === "6").map(item => record(record(record(setup.items)[text(item.id)]).fallbackValueWorksheet)).filter(worksheet => worksheet.basis === "supplier-uk-export-price").map(worksheet => text(worksheet.currency))
  const reconversionCurrencies = headers.map(header => record(record(record(setup.invoices)[text(header.id)]).contractConversion)).filter(worksheet => worksheet.basis === "gbp-invoice-reconversion").map(worksheet => text(worksheet.foreignCurrency))
  return [...new Set([...headers.map(h => text(h.currency)), ...calculationCostRows(draft).filter(cost => !isPercentageAdjustment(cost.code)).map(cost => cost.currency), ...components.map(component => text(component.currency)), ...fallbackCurrencies, ...reconversionCurrencies].filter(currency => currency && currency !== "GBP"))]
}

/** One source inventory for the service and editor. Item cost identities are
 * namespaced so identical row IDs on different goods lines cannot share evidence. */
export function calculationCostRows(value: unknown) {
  const draft = record(value)
  return [
    ...importAdjustmentsForDraft(draft).filter(row => row.amount).map(row => ({ ...row, itemId: "", itemNumber: 0 })),
    ...(Array.isArray(draft.items) ? draft.items : []).flatMap((value, index) => {
      const item = record(value)
      return (Array.isArray(item.valuationAdjustments) ? item.valuationAdjustments : []).map(record).filter(row => text(row.amount)).map(row => ({ id: JSON.stringify(["item", text(item.id), text(row.id)]), code: text(row.code), amount: text(row.amount), currency: text(row.currency), itemId: text(item.id), itemNumber: index + 1 }))
    }),
  ]
}

/** Persisted invoice links are authoritative. An item-level currency must never
 * silently override its selected commercial invoice. Operator-entered rate
 * evidence stays an estimate; it is NOT a verified tariff eligibility decision. */
export function calculationFromDraft(value: unknown, rates: Rate[], retrievedAt: string, tariffs?: Record<string, TariffSnapshot | { error: string }>, vatTariffs?: Record<string, TariffSnapshot | { error: string }>, tariffConversion?: TariffExchangeRate, processingTariffs?: ProcessingTariffEvidence) {
  const draft = record(value), setup = record(draft.dutyCalculationSetup)
  const headers = (Array.isArray(draft.invoiceHeaders) ? draft.invoiceHeaders : []).map(record)
  const date = text(draft.customsConversionDate)
  const issues: string[] = []
  if (draft.direction !== "import") issues.push("This calculation workspace applies to import liabilities only.")
  if (!setup.jurisdiction) issues.push("Confirm whether the calculation is for Great Britain or Northern Ireland.")
  if (!headers.length || new Set(headers.map(h => text(h.id))).size !== headers.length) issues.push("Complete unique invoice headers before calculating.")
  const ref = (evidence: string): Reference => ({ source: "https://www.trade-tariff.service.gov.uk/", provenance: "operator", validFrom: date, validTo: date, retrievedAt, reference: `Operator estimate: ${evidence}` })
  const itemRows = (Array.isArray(draft.items) ? draft.items : []).map(record)
  if (itemRows.some(item => text(item.procedureCode) === "7100") && itemRows.some(item => text(item.procedureCode) !== "7100")) issues.push("The warehouse-entry treatment requires procedure 7100 on every item; mixed entry and release procedures need separate declarations or a validated combined treatment.")
  const itemValidationIssues = new Map<string, string[]>()
  const items: CalculationItem[] = itemRows.map(item => {
    const id = text(item.id), invoiceId = text(item.invoiceHeaderId)
    // Eligibility is item-scoped. Keep all goods in shared-cost allocation,
    // but withhold only this line's tax result when its treatment is incomplete.
    // Structural, cost and quota-ledger failures remain declaration-wide below.
    const issues: string[] = []
    itemValidationIssues.set(id, issues)
    issues.push(...quotaClaimIssues(item.quotaOrderNumber, item.preferenceCode, setup).map(message => `Item ${id}: ${message}`))
    const invoice = headers.find(h => h.id === invoiceId)
    const evidence = record(record(setup.items)[id])
    const contractConversion = record(record(setup.invoices)[invoiceId]).contractConversion as ContractConversionWorksheet | undefined
    const deriveNiRisk = setup.jurisdiction === "NI" && !!evidence.niRiskFacts
    const source = text(evidence.evidence)
    const nationalCodes = [text(item.nationalCode), ...(Array.isArray(item.additionalNationalCodes) ? item.additionalNationalCodes.map(code => text(record(code).code)) : [])].filter(Boolean)
    const vatReview = record(record(setup.vatReviews)[id])
    const vatEvidence = nationalCodes.includes(text(vatReview.code)) ? text(vatReview.evidence) : ""
    const families: RuleFamily[] = []
    const preferenceCodes = niPreferenceCodes({ ...item, headerAdditionalInformationCode: draft.headerAdditionalInformationCode, jurisdiction: setup.jurisdiction })
    issues.push(...preferenceCodes.issues.map(message => `Item ${id}: ${message}`))
    const claimingQuota = isQuotaPreference(item.preferenceCode)
    const claimingAuthorisedUse = setup.jurisdiction === "GB" && text(item.procedureCode) === "4400" && ["140", "115"].includes(text(item.preferenceCode))
    const claimingPreference = !claimingAuthorisedUse && [preferenceCodes.uk, ...(setup.jurisdiction === "NI" ? [preferenceCodes.xi] : [])].some(code => !!code && code !== "100" && !(claimingQuota && code.startsWith("1")))
    if (claimingAuthorisedUse) {
      if (!tariffs) issues.push(`Item ${id}: authorised use requires official tariff and VAT measures, not manually entered rates.`)
      if (text(draft.declarationCategory) !== "H1" || text(draft.declarationType) !== "A" || date < "2026-09-15" || text(item.customsValuationMethod) !== "1" || contractConversion) issues.push(`Item ${id}: this authorised-use estimate requires a current H1 standard entry and transaction value without a contractual conversion.`)
      const apcs = [text(item.additionalProcedureCode), ...(Array.isArray(item.additionalProcedureCodes) ? item.additionalProcedureCodes.map(row => text(record(row).code)) : [])].filter(Boolean)
      if (apcs.some(code => code !== "000")) issues.push(`Item ${id}: additional relief, ship-work or other combined authorised-use treatment requires its separate rule.`)
    }
    if (claimingQuota) {
      families.push("quota")
      if (!tariffs) issues.push(`Item ${id}: quota estimates require official tariff measures and allocation evidence, not manually entered rates.`)
    }
    const preferenceReview = record(setup.preferences)[id] as TariffPreferenceReview | undefined
    if (claimingPreference) {
      families.push("preference")
      if (!tariffs) issues.push(`Item ${id}: preference estimates require official tariff measures, not manually entered rates.`)
      const euGroupClaim = text(item.preferentialOrigin) === "EU" && setup.jurisdiction === "GB" && text(item.preferenceCode) === "300" && !claimingQuota
      if (!text(item.preferentialOrigin) || (text(item.preferentialOrigin) !== text(item.nonPreferentialOrigin) && !euGroupClaim)) issues.push(`Item ${id}: complete preferential origin. Different preferential and non-preferential origins require separate measure lookups before calculation.`)
      if (setup.jurisdiction === "NI" && (!deriveNiRisk || claimingQuota)) issues.push(`Item ${id}: the claimed preference must be included in the complete UK/EU duty and risk comparison before an NI estimate can be produced.`)
    }
    if (text(item.procedureCode) !== "4000" || (text(item.additionalProcedureCode) && text(item.additionalProcedureCode) !== "000") || (Array.isArray(item.additionalProcedureCodes) && item.additionalProcedureCodes.some(c => text(record(c).code) && text(record(c).code) !== "000"))) {
      families.push("special-procedure")
      if (!["7100", "6110", "6123", "4051"].includes(text(item.procedureCode)) && !claimingAuthorisedUse && !(text(item.procedureCode) === "4053" && setup.jurisdiction === "NI")) issues.push(`Item ${id}: the procedure needs a validated specialist treatment before calculation.`)
    }
    if (invoice && text(invoice.letterOfCreditExchangeRate)) {
      if (!contractConversion) issues.push(`Invoice ${text(invoice.invoiceNumber)}: review the contractual rate worksheet before calculating.`)
      else {
        try {
          if (Decimal.parse(text(invoice.letterOfCreditExchangeRate)).compare(Decimal.parse(contractConversion.fixedRate)) !== 0) throw new Error("mismatch")
        } catch { issues.push(`Invoice ${text(invoice.invoiceNumber)}: the letter-of-credit rate differs from the evidenced contract rate. Reconcile the two before calculation.`) }
      }
    }
    if (invoice && text(invoice.tradeTerms) === "DDP") issues.push(`Invoice ${text(invoice.invoiceNumber)}: identify and evidence included duties and taxes before calculating DDP values.`)
    if (!invoice) issues.push(`Item ${id}: select an invoice belonging to this declaration.`)
    if (!source && !tariffs) issues.push(`Item ${id}: record the source and eligibility evidence for the estimate rates.`)
    if (deriveNiRisk && !tariffs) issues.push(`Item ${id}: NI risk comparison requires official paired UK and XI tariff evidence, not operator-entered rates.`)
    const calculatedItem: CalculationItem = {
      id, invoiceId, goodsValue: text(item.itemPrice), currency: text(invoice?.currency), grossMass: text(item.grossMass),
      contractConversion,
      valuationMethod: text(item.customsValuationMethod), families,
      computedValueWorksheet: text(item.customsValuationMethod) === "5" ? evidence.computedValueWorksheet as ComputedValueWorksheet | undefined : undefined,
      comparableValueWorksheet: ["2", "3"].includes(text(item.customsValuationMethod)) ? evidence.comparableValueWorksheet as ComparableValueWorksheet | undefined : undefined,
      deductiveValueWorksheet: text(item.customsValuationMethod) === "4" ? evidence.deductiveValueWorksheet as DeductiveValueWorksheet | undefined : undefined,
      fallbackValueWorksheet: text(item.customsValuationMethod) === "6" ? evidence.fallbackValueWorksheet as FallbackValueWorksheet | undefined : undefined,
      measures: text(evidence.dutyRate) && source ? [{ ...ref(source), taxType: "A00", family: "gb-standard", jurisdiction: setup.jurisdiction === "NI" ? text(setup.niTariff) as "UK" | "EU" : "UK", evidence: [source], components: [{ type: "percent", rate: text(evidence.dutyRate) }], includedInVatBase: true, disposition: "payable" }] : [],
      vatRate: text(evidence.vatRate), vatReference: source ? ref(source) : undefined,
    }
    if (tariffs) {
      calculatedItem.measures = []; calculatedItem.vatRate = undefined; calculatedItem.vatReference = undefined
      const tariff = tariffs[id]
      if (!tariff || "error" in tariff) issues.push(`Item ${id}: ${tariff && "error" in tariff ? tariff.error : "Official tariff evidence is missing."}`)
      else if (tariff.request.code !== text(item.commodityCode) || tariff.request.origin !== text(item.nonPreferentialOrigin) || tariff.request.date !== date || tariff.request.dataset !== (setup.jurisdiction === "NI" && (setup.niTariff === "EU" || deriveNiRisk) ? "xi" : "uk")) issues.push(`Item ${id}: tariff evidence does not match the commodity, origin, date or jurisdiction.`)
      else {
        const vatTariff = tariff.request.dataset === "uk" ? tariff : vatTariffs?.[id]
        if (!vatTariff || "error" in vatTariff) {
          issues.push(`Item ${id}: ${vatTariff && "error" in vatTariff ? vatTariff.error : "Separate UK VAT evidence is missing."}`)
          return calculatedItem
        }
        if (deriveNiRisk && (claimingPreference || record(setup.niPreferences)[id] || [tariff, vatTariff].some(snapshot => snapshot.measures.some(measure => measure.typeCode === "103" && measure.percentage === null)))) {
          try {
            if (text(item.procedureCode) !== "4000") throw new Error("Paired specific-duty comparison needs its separate special-procedure treatment for this item.")
            const prepared = prepareNiDutyComparison(vatTariff, tariff, evidence.niRiskFacts as NiRiskFacts, { date, movement: text(setup.movement), importerEori: text(draft.importerEori), preferenceCode: preferenceCodes.uk, euPreferenceCode: preferenceCodes.xi, nationalCodes, vatEvidence, pairedPreferences: record(setup.niPreferences)[id] as Partial<NiPairedPreferenceReview> | undefined, lowValueExclusion: evidence.niLowValueExclusion as LowValueExclusionReview | undefined }, Array.isArray(evidence.tariffQuantities) ? evidence.tariffQuantities as TariffQuantity[] : [], tariffConversion)
            calculatedItem.niDutyComparison = prepared.comparison
            calculatedItem.vatRate = prepared.vatRate; calculatedItem.vatReference = prepared.vatReference
            if (claimingPreference) calculatedItem.preferenceEvidence = [...prepared.comparison.uk.evidence, ...prepared.comparison.eu.evidence].join("\n")
          } catch (error) { issues.push(`Item ${id}: ${error instanceof Error ? error.message : "Review the paired specific-duty evidence."}`) }
          return calculatedItem
        }
        const ni = deriveNiRisk ? selectNiImportTariff(vatTariff, tariff, evidence.niRiskFacts as NiRiskFacts, { date, movement: text(setup.movement), importerEori: text(draft.importerEori), preferenceCode: preferenceCodes.uk, euPreferenceCode: preferenceCodes.xi, nationalCodes, vatEvidence, lowValueExclusion: evidence.niLowValueExclusion as LowValueExclusionReview | undefined }) : undefined
        if (ni) {
          calculatedItem.niRiskInput = ni.riskInput
          if (ni.issues.length || !ni.selection || !ni.selectedSnapshot) {
            issues.push(...ni.issues.map(issue => `Item ${id}: ${issue}`))
            return calculatedItem
          }
        }
        if (evidence.remedyReview) {
          if (setup.jurisdiction !== "GB" || text(item.procedureCode) !== "4000") {
            issues.push(`Item ${id}: remedy selection needs its separate Northern Ireland or special-procedure treatment.`)
            return calculatedItem
          }
          const activeCodes = [text(item.taricCode), ...(Array.isArray(item.additionalTaricCodes) ? item.additionalTaricCodes.map(row => text(record(row).code)) : [])].map(code => code.trim().toUpperCase()).filter(Boolean)
          const reviewed = record(evidence.remedyReview).selections
          if (Array.isArray(reviewed) && reviewed.some(row => { const code = text(record(row).additionalCode); return code && activeCodes.filter(active => active === code).length !== 1 })) {
            issues.push(`Item ${id}: the reviewed exporter code must match one current TARIC additional code. Update the item or review its remedy evidence.`)
            return calculatedItem
          }
          if (Array.isArray(reviewed)) {
            const selectedIds = new Set(reviewed.map(row => text(record(row).measureId)))
            const conflicting = tariff.measures.some(measure => ["551", "552", "553", "554"].includes(measure.typeCode) && !selectedIds.has(measure.id) && activeCodes.includes(text(measure.additionalCode?.attributes.code)))
            if (conflicting) {
              issues.push(`Item ${id}: another declared exporter code matches an unselected remedy. Reconcile the TARIC codes and remedy review.`)
              return calculatedItem
            }
          }
        }
        const remedyDocuments = [{ category: item.additionalDocumentCategory, type: item.additionalDocumentType, reference: item.additionalDocumentId }, ...(Array.isArray(item.additionalDocuments) ? item.additionalDocuments.map(record) : [])].map(document => ({ code: `${text(document.category)}${text(document.type)}`, reference: text(document.reference) }))
        const quotaReview = record(setup.quotaAllocations)[id] as QuotaAllocationReview | undefined
        let quotaClaim
        if (claimingQuota && quotaReview) {
          try {
            quotaClaim = { review: quotaReview, declared: { orderNumber: text(item.quotaOrderNumber), preferenceCode: text(item.preferenceCode), ...quotaItemQuantity(text(item.netMass), quotaReview.unit, Array.isArray(evidence.tariffQuantities) ? evidence.tariffQuantities as TariffQuantity[] : []) } }
          } catch (error) {
            issues.push(`Item ${id}: ${error instanceof Error ? error.message : "Review the quota item quantity."}`)
          }
        }
        const lowValueExclusion = text(item.procedureCode) === "4053" ? (record(setup.niTemporaryRelease)[id] as NiTemporaryReleaseReview | undefined)?.lowValueExclusion : text(item.procedureCode) === "4051" ? (record(setup.niProcessingRelease)[id] as NiProcessingReleaseReview | undefined)?.lowValueExclusion : undefined
        const selected = ni?.selection ?? standardTariffSelection(tariff, vatTariff, Array.isArray(evidence.tariffQuantities) ? evidence.tariffQuantities as TariffQuantity[] : [], { authorisedUseReview: claimingAuthorisedUse ? record(setup.authorisedUses)[id] as AuthorisedUseReview | undefined : undefined, authorisedUseDocuments: [{ category: item.additionalDocumentCategory, type: item.additionalDocumentType, reference: item.additionalDocumentId, lpcoExemptionCode: item.lpcoExemptionCode }, ...(Array.isArray(item.additionalDocuments) ? item.additionalDocuments.map(record) : [])].map(document => ({ code: `${text(document.category)}${text(document.type)}`, reference: text(document.reference), status: text(document.lpcoExemptionCode) })), lowValueExclusion, jurisdiction: text(setup.jurisdiction), preferentialOrigin: text(item.preferentialOrigin), preferenceCode: text(item.preferenceCode), preferenceReview, nationalCodes, vatEvidence, remedyReview: evidence.remedyReview as RemedyReview | undefined, remedyDocuments, quotaClaim }, tariffConversion)
        const selectedSnapshot = ni?.selectedSnapshot ?? tariff
        issues.push(...selected.issues.map(issue => `Item ${id}: ${issue}`))
        if (selected.duty && selected.vat) {
          const reference = (m: typeof selected.duty, source: TariffSnapshot = selectedSnapshot): Reference => ({ source: source.sourceUrl, provenance: "official-snapshot", reference: m!.id, retrievedAt: source.retrievedAt, validFrom: m!.start, validTo: m!.end ?? date })
          calculatedItem.measures = [{ ...reference(selected.duty), taxType: "A00", family: selected.bounds?.length || selected.components.some(component => component.type === "specific") ? "specific-compound" : setup.jurisdiction === "NI" ? "ni" : "gb-standard", jurisdiction: setup.jurisdiction === "NI" ? ni?.decision ? ni.decision.status === "at-risk" ? "EU" : "UK" : setup.niTariff as "UK" | "EU" : "UK", evidence: [`Official measure for ${tariff.request.origin} on ${date}`, ...(ni?.decision?.reasons ?? [])], components: selected.components, bounds: selected.bounds, includedInVatBase: true, disposition: "payable" }]
          calculatedItem.vatRate = selected.vat.percentage!; calculatedItem.vatReference = reference(selected.vat, vatTariff)
          if (claimingAuthorisedUse && selected.authorisedUseEvidence) {
            calculatedItem.procedureEvidence = selected.authorisedUseEvidence
            calculatedItem.measures[0].evidence.push(selected.authorisedUseEvidence)
          }
          if (selected.quotaEvidence) {
            calculatedItem.quotaAllocationEvidence = selected.quotaEvidence
            calculatedItem.measures[0].evidence.push(selected.quotaEvidence)
            if (claimingPreference && quotaReview?.originEvidence) calculatedItem.preferenceEvidence = quotaReview.originEvidence
          }
          if (selected.remedies?.length) {
            calculatedItem.measures.push(...selected.remedies)
            calculatedItem.families.push("trade-remedy")
          }
          if (vatEvidence) calculatedItem.measures[0].evidence.push(`VAT treatment ${text(vatReview.code)}: operator eligibility review ${vatEvidence}; official VAT measure ${selected.vat.id}.`)
          calculatedItem.measures[0].evidence.push(...selected.notClaimed.map(measure => `${measure.id}: ${measure.reason}`))
          if (claimingPreference && preferenceReview) {
            calculatedItem.preferenceEvidence = `Operator-reviewed preference ${preferenceReview.preferenceCode}; origin ${preferenceReview.origin}; proof ${preferenceReview.proofReference}; valid ${preferenceReview.validFrom} to ${preferenceReview.validTo}. Origin rules: ${preferenceReview.originRulesEvidence}. Transport/non-alteration: ${preferenceReview.transportEvidence}. Official measure ${selected.duty.id}; legal acts ${(selected.duty.legalActs ?? []).map(act => act.id).join(", ")}; footnotes ${selected.duty.footnotes.map(note => note.id).join(", ") || "none"}. Eligibility is not automatically certified.`
            calculatedItem.measures[0].evidence.push(calculatedItem.preferenceEvidence)
          }
        }
      }
    }
    if (text(item.procedureCode) === "4051" && setup.jurisdiction === "GB") {
      const released = gbProcessedReleaseEstimate(calculatedItem, {
        direction: text(draft.direction), jurisdiction: text(setup.jurisdiction), date,
        procedure: text(item.procedureCode), category: text(draft.declarationCategory), declarationType: text(draft.declarationType), preference: text(item.preferenceCode),
        additionalProcedures: [text(item.additionalProcedureCode), ...(Array.isArray(item.additionalProcedureCodes) ? item.additionalProcedureCodes.map(code => text(record(code).code)) : [])],
      }, record(setup.gbProcessingBasis)[id] as GbProcessingBasisReview | undefined)
      issues.push(...released.issues.map(issue => `Item ${id}: ${issue}`))
      if (released.item) return released.item
    }
    if (text(item.procedureCode) === "4051" && setup.jurisdiction === "NI") {
      const context = {
        outputItemIds: itemRows.filter(row => ["4051", "4054"].includes(text(row.procedureCode))).map(row => text(row.id)),
        direction: text(draft.direction), jurisdiction: text(setup.jurisdiction), date,
        procedure: text(item.procedureCode), category: text(draft.declarationCategory), declarationType: text(draft.declarationType),
        preference: text(item.preferenceCode), niTariff: text(setup.niTariff), riskStatus: text(setup.riskStatus),
        additionalProcedures: [text(item.additionalProcedureCode), ...(Array.isArray(item.additionalProcedureCodes) ? item.additionalProcedureCodes.map(code => text(record(code).code)) : [])],
      }
      const review = record(setup.niProcessingRelease)[id] as NiProcessingReleaseReview | undefined
      const released = review?.basis === "original-inputs"
        ? niOriginalInputReleaseEstimate(calculatedItem, context, review, setup.processingInputs as CalculationSetup["processingInputs"], processingTariffs, tariffConversion)
        : niProcessingReleaseEstimate(calculatedItem, context, review)
      issues.push(...released.issues.map(issue => `Item ${id}: ${issue}`))
      if (released.item) return released.item
    }
    if (text(item.procedureCode) === "4053" && setup.jurisdiction === "NI") {
      const released = niTemporaryReleaseEstimate(calculatedItem, {
        direction: text(draft.direction), jurisdiction: text(setup.jurisdiction), date,
        procedure: text(item.procedureCode), category: text(draft.declarationCategory), declarationType: text(draft.declarationType),
        preference: text(item.preferenceCode), niTariff: text(setup.niTariff), riskStatus: text(setup.riskStatus),
        additionalProcedures: [text(item.additionalProcedureCode), ...(Array.isArray(item.additionalProcedureCodes) ? item.additionalProcedureCodes.map(code => text(record(code).code)) : [])],
      }, record(setup.niTemporaryRelease)[id] as NiTemporaryReleaseReview | undefined)
      issues.push(...released.issues.map(issue => `Item ${id}: ${issue}`))
      if (released.item) return released.item
    }
    if (["6110", "6123"].includes(text(item.procedureCode))) {
      const returned = returnedGoodsEstimate(calculatedItem, {
        direction: text(draft.direction), jurisdiction: text(setup.jurisdiction), date, retrievedAt,
        procedure: text(item.procedureCode), preference: text(item.preferenceCode), importerEori: text(draft.importerEori),
        additionalProcedures: [text(item.additionalProcedureCode), ...(Array.isArray(item.additionalProcedureCodes) ? item.additionalProcedureCodes.map(code => text(record(code).code)) : [])],
      }, record(setup.returnedGoods)[id] as ReturnedGoodsReview | undefined)
      issues.push(...returned.issues.map(issue => `Item ${id}: ${issue}`))
      if (returned.item) return returned.item
    }
    if (text(item.procedureCode) === "7100") {
      const warehouse = warehouseEntryEstimate(calculatedItem, {
        direction: text(draft.direction), jurisdiction: text(setup.jurisdiction), date, retrievedAt,
        category: text(draft.declarationCategory), declarationType: text(draft.declarationType),
        warehouseType: text(draft.warehouseType), warehouseIdentifier: text(draft.warehouseIdentifier),
        preference: text(item.preferenceCode), procedures: itemRows.map(row => text(row.procedureCode)),
        additionalProcedures: itemRows.flatMap(row => [text(row.additionalProcedureCode), ...(Array.isArray(row.additionalProcedureCodes) ? row.additionalProcedureCodes.map(code => text(record(code).code)) : [])]).filter(Boolean),
        holders: [{ category: text(draft.authorisationCategory), identifier: text(draft.authorisationIdentifier) }, ...(Array.isArray(draft.additionalAuthorisationHolders) ? draft.additionalAuthorisationHolders.map(value => ({ category: text(record(value).category), identifier: text(record(value).identifier) })) : [])],
      }, setup.warehouseEntry as WarehouseEntryWorksheet | undefined)
      issues.push(...warehouse.issues.map(issue => `Item ${id}: ${issue}`))
      if (warehouse.item) return warehouse.item
    }
    return calculatedItem
  })
  const costs: CalculationCost[] = []
  const expenseConsignments = new Set<string>()
  const costRows = calculationCostRows(draft)
  const headerCodes = new Set(costRows.filter(c => !c.itemId).map(c => c.code))
  for (const cost of costRows) {
    const metadata = record(record(setup.costs)[cost.id])
    if (cost.itemId && headerCodes.has(cost.code)) issues.push(`Adjustment ${cost.code} is present at both header and item level. Reconcile it before calculation.`)
    const percentageCost = Object.hasOwn(percentageAdjustmentCode, cost.code)
    if (isPercentageAdjustment(cost.code) && !percentageCost) { issues.push(`Adjustment ${cost.code}: its percentage basis requires a verified code-specific rule.`); continue }
    if (percentageCost && metadata.fullItemPriceBasisConfirmed !== true) issues.push(`Adjustment ${cost.code}: confirm the percentage applies to the full item price only. For another basis, use the monetary code with a retained worksheet instead.`)
    // Only explicit, reviewed code mappings. Other codes must not silently
    // become a generic customs-value addition.
    const reviewCode = percentageCost ? percentageAdjustmentCode[cost.code] : cost.code
    const review = Object.hasOwn(monetaryAdditionReview, reviewCode) ? monetaryAdditionReview[reviewCode] : undefined
    if (!review && !["AP", "AQ", "AK", "AV", "AW", "AR", "AS", "BA", "BU", "BR", "BS", "BH", "BI"].includes(cost.code)) { issues.push(`Adjustment ${cost.code}: verify its customs/VAT treatment before calculation.`); continue }
    let scope: CalculationCost["scope"] = cost.itemId ? { type: "items", itemIds: [cost.itemId] } : { type: "declaration" }
    if (metadata.scope !== undefined && !cost.itemId) {
      const selected = record(metadata.scope)
      if (selected.type === "invoice" && headers.some(h => h.id === selected.invoiceId)) scope = { type: "invoice", invoiceId: text(selected.invoiceId) }
      else if (selected.type === "items" && Array.isArray(selected.itemIds) && selected.itemIds.length && selected.itemIds.every(id => typeof id === "string" && items.some(i => i.id === id))) scope = { type: "items", itemIds: selected.itemIds as string[] }
      else if (selected.type !== "declaration") issues.push(`Adjustment ${cost.code}: select an existing invoice or eligible items. The original scope is no longer valid.`)
    }
    // DE 4/9: included post-border freight is removed for customs duty,
    // not VAT. Airfreight uses the same distinction with its split in the core.
    const effect: CalculationCost["effect"] = ["AV", "AW"].includes(cost.code) ? "vat" : ["BA", "BU", "BR", "BS", "AI", "AM"].includes(cost.code) ? "customs" : "both"
    if (["BH", "BI"].includes(cost.code)) {
      const eligible = items.filter(item => scope.type === "declaration" || (scope.type === "invoice" ? item.invoiceId === scope.invoiceId : scope.itemIds.includes(item.id)))
      if (setup.jurisdiction !== "GB" || eligible.some(item => item.valuationMethod !== "1" || item.families.includes("special-procedure"))) issues.push(`Discount ${cost.code} needs GB Method 1 free-circulation treatment; special procedures require separate validation.`)
      issues.push(...discountIssues(metadata.discount as DiscountEvidence | undefined, date).map(issue => `Adjustment ${cost.code}: ${issue}`))
    }
    if (review) {
      const eligible = items.filter(item => scope.type === "declaration" || (scope.type === "invoice" ? item.invoiceId === scope.invoiceId : scope.itemIds.includes(item.id)))
      if (setup.jurisdiction !== "GB" || eligible.some(item => item.valuationMethod !== "1")) issues.push(`Adjustment ${cost.code}: this monetary addition requires GB transaction valuation; other valuation and NI rules need separate review.`)
      if (!text(metadata.valuationBasisEvidence)) issues.push(`Adjustment ${cost.code}: ${review}`)
    }
    let evidence = text(metadata.evidence)
    if (metadata.vatExpense !== undefined && record(metadata.vatExpense).method !== "actual") {
      try {
        const worksheet = metadata.vatExpense as VatExpenseWorksheet
        const eligible = items.filter(item => scope.type === "declaration" || (scope.type === "invoice" ? item.invoiceId === scope.invoiceId : scope.itemIds.includes(item.id)))
        if (!["AV", "AW"].includes(cost.code) || cost.currency !== "GBP" || metadata.includedInPrice !== false || setup.jurisdiction !== "GB" || eligible.some(item => item.families.includes("special-procedure"))) throw new Error("Agreed incidental expenses need a separate GBP VAT-only addition for a GB free-circulation consignment.")
        const calculated = vatIncidentalExpenses(worksheet, date)
        const consignment = text(worksheet.consignmentReference).toUpperCase()
        if (expenseConsignments.has(consignment)) throw new Error("This consignment already has an agreed incidental-expense adjustment; do not repeat its minimum across invoices.")
        expenseConsignments.add(consignment)
        if (Decimal.parse(cost.amount).compare(Decimal.parse(calculated.amount.fixed(2))) !== 0) throw new Error(`The agreed expense worksheet gives £${calculated.amount.fixed(2)}. Review the VAT adjustment amount.`)
        for (const item of eligible) item.families.push("vat-expenses")
        evidence = evidence ? `${evidence}\n${calculated.explanation}\n${calculated.source}\nExact GBP amount: ${calculated.amount.n}/${calculated.amount.d}; estimate cost rounded to two decimal places.` : ""
      } catch (error) { issues.push(`Adjustment ${cost.code}: ${(error as Error).message}`) }
    }
    costs.push({ ...cost, currency: percentageCost ? "" : cost.currency, percentageOfItemPrice: percentageCost || undefined, evidence: evidence && review ? `${evidence}\nValuation basis: ${text(metadata.valuationBasisEvidence)}` : evidence, scope, basis: ["AQ", "AW", "AS", "BU", "BS"].includes(cost.code) ? "gross_mass" : "value", effect, operation: cost.code.startsWith("B") ? "deduct" : "add", includedInPrice: metadata.includedInPrice as boolean, airfreightPercentage: text(metadata.airfreightPercentage) || undefined })
  }
  const input: CalculationInput = { date, jurisdiction: setup.jurisdiction as "GB" | "NI", movement: text(setup.movement), riskStatus: setup.riskStatus as CalculationInput["riskStatus"], niTariff: setup.niTariff as CalculationInput["niTariff"], niTreatmentEvidence: text(setup.niTreatmentEvidence), rates, items, costs }
  const result = calculateDuty(input)
  // Quantity reconciliation is retained even while quota-rate eligibility is
  // incomplete. It does not grant a quota, choose a rate or populate tax rows.
  if (Object.keys(record(setup.quotaAllocations)).length) {
    result.quotaAllocationLedger = { allocations: [], issues: [] }
    try {
      const reviews = record(setup.quotaAllocations)
      const currentIds = new Set(itemRows.map(item => text(item.id)))
      if (Object.keys(reviews).some(id => !currentIds.has(id))) throw new Error("Remove allocation reviews for items that are no longer on this declaration.")
      if (itemRows.some(item => isQuotaPreference(item.preferenceCode) && reviews[text(item.id)] === undefined)) throw new Error("Complete allocation reviews for every quota item before reconciling the declaration.")
      const rows = itemRows.filter(item => reviews[text(item.id)] !== undefined).map(item => {
        const id = text(item.id), review = reviews[id] as QuotaAllocationReview
        if (!review || !isQuotaPreference(item.preferenceCode) || review.preferenceCode !== text(item.preferenceCode) || review.orderNumber !== text(item.quotaOrderNumber) || review.commodity !== text(item.commodityCode) || review.origin !== text(item.nonPreferentialOrigin)) throw new Error(`Item ${id}: the allocation review must match the current commodity, origin, preference and quota order.`)
        if (typeof review.evidence !== "string" || !review.evidence.trim() || !validCustomsConversionDate(review.validFrom) || !validCustomsConversionDate(review.validTo) || review.validFrom > date || review.validTo < date) throw new Error(`Item ${id}: record allocation evidence covering the calculation date.`)
        if (setup.jurisdiction === "GB" && review.dataset !== "uk") throw new Error(`Item ${id}: a Great Britain allocation review must use the UK quota.`)
        const quantityRows = record(record(setup.items)[id]).tariffQuantities
        return { itemId: id, review, ...quotaItemQuantity(text(item.netMass), review.unit, Array.isArray(quantityRows) ? quantityRows as TariffQuantity[] : []) }
      })
      result.quotaAllocationLedger.allocations = reconcileQuotaAllocations(rows)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Review the quota allocation quantities."
      result.quotaAllocationLedger.issues.push(message)
      issues.push(message)
    }
  }
  for (const item of itemRows) {
    const snapshot = tariffs?.[text(item.id)]
    if (!snapshot || "error" in snapshot) continue
    if (setup.jurisdiction === "GB" && text(item.procedureCode) === "4400" && snapshot.request.dataset === "uk" && ["140", "115"].includes(text(item.preferenceCode))) {
      result.authorisedUseOptions ??= []
      result.authorisedUseOptions.push({ itemId: text(item.id), code: snapshot.request.code, origin: snapshot.request.origin, date: snapshot.request.date, dataset: "uk", preferenceCode: text(item.preferenceCode), options: snapshot.measures.filter(m => m.typeCode === (text(item.preferenceCode) === "140" ? "105" : "115") && m.preferenceCode === text(item.preferenceCode)).map(m => ({ id: m.id, description: m.description, legalBasis: (m.legalActs ?? []).map(act => text(act.attributes.description) || act.id).join("; ") })) })
    }
    if (isQuotaPreference(item.preferenceCode)) {
      result.quotaOptions ??= []
      result.quotaOptions.push({ itemId: text(item.id), commodity: snapshot.request.code, origin: snapshot.request.origin, orderNumber: text(item.quotaOrderNumber), preferenceCode: text(item.preferenceCode), dataset: snapshot.request.dataset, date: snapshot.request.date, options: snapshot.measures.filter(m => ["122", "143"].includes(m.typeCode) && m.preferenceCode === text(item.preferenceCode) && (m.orderNumber?.attributes.number ?? m.orderNumber?.id) === text(item.quotaOrderNumber)).map(m => ({ id: m.id, description: m.description, legalBasis: (m.legalActs ?? []).map(act => text(act.attributes.description) || act.id).join("; ") })) })
    }
    const options = snapshot.measures.filter(m => ["551", "552", "553", "554"].includes(m.typeCode)).map(m => ({ id: m.id, description: m.description, additionalCode: text(m.additionalCode?.attributes.code), legalBasis: (m.legalActs ?? []).map(act => text(act.attributes.description) || act.id).join("; "), ...(m.conditions.some(c => c.attributes.document_code === "D008") ? { signedInvoiceRequired: true } : {}) }))
    if (options.length) (result.remedyOptions ??= []).push({ itemId: text(item.id), code: snapshot.request.code, origin: snapshot.request.origin, date: snapshot.request.date, dataset: snapshot.request.dataset, options })
  }
  for (const item of itemRows) {
    const codes = niPreferenceCodes({ ...item, headerAdditionalInformationCode: draft.headerAdditionalInformationCode, jurisdiction: setup.jurisdiction })
    const snapshots = [tariffs?.[text(item.id)], ...(setup.jurisdiction === "NI" ? [vatTariffs?.[text(item.id)]] : [])]
    const seen = new Set<string>()
    for (const snapshot of snapshots) {
      if (!snapshot || "error" in snapshot || seen.has(snapshot.request.dataset)) continue
      seen.add(snapshot.request.dataset)
      const preferenceCode = setup.jurisdiction === "NI" ? codes[snapshot.request.dataset] : codes.uk
      if (!preferenceCode || preferenceCode === "100") continue
      result.preferenceOptions ??= []
      result.preferenceOptions.push({ itemId: text(item.id), code: snapshot.request.code, origin: text(item.preferentialOrigin) || snapshot.request.origin, date: snapshot.request.date, dataset: snapshot.request.dataset, preferenceCode, options: snapshot.measures.filter(m => ["142", "144"].includes(m.typeCode) && m.preferenceCode === preferenceCode && (text(item.preferentialOrigin) !== "EU" || m.area === "1013")).map(m => ({ id: m.id, description: m.description, legalBasis: (m.legalActs ?? []).map(act => text(act.attributes.description) || act.id).join("; ") })) })
    }
  }
  for (const [itemId, review] of Object.entries(record(setup.gbProcessingBasis))) {
    result.gbProcessingBasisReviews ??= []
    const item = itemRows.find(row => text(row.id) === itemId)
    const mismatch = draft.direction !== "import" || setup.jurisdiction !== "GB" || !item || text(item.procedureCode) !== "4051" || record(review).date !== date
    result.gbProcessingBasisReviews.push({ itemId, result: mismatch ? null : reviewGbProcessingBasis(review as GbProcessingBasisReview), issues: mismatch ? ["Review the current GB 4051 item and calculation date before using this processing-basis evidence."] : [] })
  }
  if (setup.processingInputs !== undefined) {
    try {
      const worksheet = record(setup.processingInputs)
      if (draft.direction !== "import" || !["GB", "NI"].includes(text(setup.jurisdiction)) || worksheet.jurisdiction !== setup.jurisdiction) throw new Error("Confirm the matching import jurisdiction for the processing worksheet.")
      if (!Array.isArray(worksheet.lots) || !Array.isArray(worksheet.consumption)) throw new Error("Record original input lots and reviewed output consumption.")
      if (worksheet.lots.length > 1000 || worksheet.consumption.length > 10000) throw new Error("Limit a processing worksheet to 1,000 original lots and 10,000 consumption links.")
      const outputs = new Map(itemRows.map(item => [text(item.id), text(item.procedureCode)]))
      if (worksheet.consumption.some(row => !["4051", "4054"].includes(outputs.get(text(record(row).outputItemId)) ?? ""))) throw new Error("Link every consumption row to an existing inward-processing release item. Review deleted items or changed procedures.")
      result.processingInputAllocation = { result: allocateProcessingInputs(worksheet.lots as ProcessingInputLot[], worksheet.consumption as ProcessingConsumption[]), issues: [] }
    } catch (error) {
      result.processingInputAllocation = { result: null, issues: [error instanceof Error ? error.message : "Review the processing input allocation."] }
    }
  }
  // A retained duty-only worksheet is not a complete tax assessment. Keep it
  // outside line liabilities and declaration totals, including on blocked lines.
  for (const item of itemRows) {
    const id = text(item.id), ledger = record(setup.temporaryAdmission)[id]
    if (ledger === undefined) continue
    result.temporaryAdmissionLedgers ??= []
    try {
      if (draft.direction !== "import" || !["GB", "NI"].includes(text(setup.jurisdiction))) throw new Error("Confirm the import jurisdiction before using the duty worksheet.")
      if (!text(item.procedureCode).startsWith("53") && text(item.procedureCode).slice(2) !== "53") throw new Error("Review the temporary admission procedure before using this worksheet.")
      const reviewed = record(ledger)
      if (reviewed.jurisdiction !== setup.jurisdiction) throw new Error("The duty worksheet jurisdiction differs from the declaration. Review the original entry basis; do not reuse a worksheet from another jurisdiction.")
      if (reviewed.event === "entry" && !text(item.procedureCode).startsWith("53")) throw new Error("An entry worksheet requires a temporary admission entry procedure.")
      if (reviewed.event === "discharge" && text(item.procedureCode).slice(2) !== "53") throw new Error("A discharge worksheet requires temporary admission as the previous procedure.")
      if (reviewed.event === "discharge" && ["40", "42", "44"].includes(text(item.procedureCode).slice(0, 2))) throw new Error("Release to free circulation needs the release liability less revenue already paid, by tax type. The monthly partial-relief balance is not the release amount.")
      result.temporaryAdmissionLedgers.push({ itemId: id, result: temporaryAdmissionDutyLedger(ledger as TemporaryAdmissionDutyLedger), issues: [] })
    } catch (error) {
      result.temporaryAdmissionLedgers.push({ itemId: id, result: null, issues: [error instanceof Error ? error.message : "Review the temporary admission evidence."] })
    }
  }
  const duplicateReleaseClaims = duplicateTemporaryReleaseClaims(itemRows.flatMap(item => {
    const worksheet = record(setup.temporaryAdmissionRelease)[text(item.id)]
    return worksheet && typeof worksheet === "object" ? [{ itemId: text(item.id), worksheet: worksheet as TemporaryAdmissionReleaseWorksheet }] : []
  }))
  for (const item of itemRows) {
    const id = text(item.id), worksheet = record(setup.temporaryAdmissionRelease)[id]
    if (worksheet === undefined) continue
    result.temporaryAdmissionReleases ??= []
    try {
      if (draft.direction !== "import" || setup.jurisdiction !== "GB" || text(item.procedureCode) !== "4053") throw new Error("This release balance requires a Great Britain import with procedure 4053.")
      if (duplicateReleaseClaims.has(id)) throw new Error("This original entry, item and tax balance is also used on another release line. Remove the duplicate or provide a separately evidenced partial-release allocation; do not deduct the same payment twice.")
      result.temporaryAdmissionReleases.push({ itemId: id, result: temporaryAdmissionReleaseBalance(worksheet as TemporaryAdmissionReleaseWorksheet), issues: [] })
    } catch (error) {
      result.temporaryAdmissionReleases.push({ itemId: id, result: null, issues: [error instanceof Error ? error.message : "Review the release assessment and payments."] })
    }
  }
  if (issues.length) {
    result.issues.push(...issues); result.autoPopulationAllowed = false; result.totals = null
    delete result.liabilityTotals
    for (const line of result.lines) { line.status = "needs-information"; delete line.duty; delete line.vat; delete line.customsValue; delete line.vatBase; delete line.vatLiability; delete line.vatTaxes; delete line.vatTaxRoundingDifference; line.taxes = []; line.workings = [] }
  }
  for (const line of result.lines) {
    const validation = itemValidationIssues.get(line.itemId) ?? []
    if (!validation.length) continue
    result.issues.push(...validation)
    line.issues.push(...validation)
    line.status = "needs-information"
    delete line.duty; delete line.vat; delete line.customsValue; delete line.vatBase
    delete line.vatLiability; delete line.vatTaxes; delete line.vatTaxRoundingDifference
    line.taxes = []; line.workings = []
    result.autoPopulationAllowed = false; result.totals = null
    delete result.liabilityTotals
  }
  return { input, result }
}
