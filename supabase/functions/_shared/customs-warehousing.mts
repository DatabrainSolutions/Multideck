import type { CalculationItem, Reference } from "./customs-duty-calculation.mts"

export const WAREHOUSE_ENTRY_SOURCE = "https://www.gov.uk/government/publications/appendix-1-de-110-requested-and-previous-procedure-codes-of-the-customs-declaration-service-cds/requested-procedure-71-entry-to-a-customs-warehouse-cw"

/** Operator evidence supports a draft estimate, not an authorisation decision.
 * A later release must select its own dated rules and values. */
export type WarehouseEntryWorksheet = {
  event: "entry"
  warehouseCountry: "GB"
  warehouseIdentifier: string
  authorisationNumber: string
  holderEori: string
  validFrom: string
  validTo: string
  activeAuthorisationEvidence: string
  goodsCoveredEvidence: string
  entryConditionsEvidence: string
  securityReviewEvidence: string
  representation: "" | "holder" | "agent"
  agentApprovalEvidence?: string
  declarationCopyEvidence?: string
}

type Context = {
  direction: string; jurisdiction: string; date: string; retrievedAt: string
  category: string; declarationType: string; warehouseType: string; warehouseIdentifier: string
  procedures: string[]; additionalProcedures: string[]; preference: string
  holders: { category: string; identifier: string }[]
}
const present = (v: unknown): v is string => typeof v === "string" && !!v.trim()
const date = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v

/** Initial GB/H2/A/7100/000 adapter. Other entry and release paths remain
 * separate deliverables, not inferred equivalents of this treatment. */
export function warehouseEntryEstimate(item: CalculationItem, context: Context, worksheet: WarehouseEntryWorksheet | undefined): { item?: CalculationItem; issues: string[] } {
  const issues: string[] = []
  if (context.direction !== "import" || context.jurisdiction !== "GB" || context.category !== "H2" || context.declarationType !== "A") issues.push("This warehouse-entry estimate requires a GB import H2 standard declaration; other routes need their own treatment.")
  if (!date(context.date) || context.date < "2026-09-14") issues.push("Historic warehouse treatment requires the rules applicable on that date.")
  if (!context.procedures.length || context.procedures.some(code => code !== "7100") || context.additionalProcedures.some(code => code !== "000")) issues.push("This entry estimate requires procedure 7100 with no additional treatment on every item; transfers and releases need separate rules.")
  if (context.preference !== "100" || item.valuationMethod !== "1") issues.push("Warehouse preference and alternative valuation need their own evidenced treatment.")
  const category = context.warehouseType === "U" ? "CWP" : context.warehouseType === "R" ? "CW1" : undefined
  if (!category || !present(context.warehouseIdentifier)) issues.push("Select the authorised GB private or public type 1 warehouse and its identifier.")
  if (!worksheet || typeof worksheet !== "object") return { issues: [...issues, "Record the warehouse authorisation and entry conditions before estimating suspended amounts."] }
  if (worksheet.event !== "entry") issues.push("This worksheet is for warehouse entry, not release to free circulation.")
  if (worksheet.warehouseCountry !== "GB") issues.push("Confirm the authorised warehouse is in Great Britain; Northern Ireland and overseas warehouses need their own treatment.")
  if (worksheet.warehouseIdentifier !== context.warehouseIdentifier) issues.push("The authorisation evidence must cover the warehouse selected on this declaration.")
  if (!present(worksheet.authorisationNumber) || !present(worksheet.holderEori) || !context.holders.some(holder => holder.category === category && holder.identifier === worksheet.holderEori)) issues.push("Match the warehouse authorisation holder EORI and record the separate authorisation decision number.")
  if (!date(worksheet.validFrom) || !date(worksheet.validTo) || worksheet.validFrom > context.date || worksheet.validTo < context.date || worksheet.validFrom > worksheet.validTo) issues.push("Record an authorisation validity period covering the calculation date.")
  for (const [key, label] of [
    ["activeAuthorisationEvidence", "current authorisation status"],
    ["goodsCoveredEvidence", "authorisation coverage for these goods"],
    ["entryConditionsEvidence", "entry without delay in unchanged condition and applicable entry conditions"],
    ["securityReviewEvidence", "applicable security conditions (not a mandatory H2 guarantee field)"],
  ] as const) if (!present(worksheet[key])) issues.push(`Record evidence of ${label}.`)
  if (!["holder", "agent"].includes(worksheet.representation)) issues.push("Confirm whether the holder or an agent is making this warehouse entry.")
  if (worksheet.representation === "agent" && (!present(worksheet.agentApprovalEvidence) || !present(worksheet.declarationCopyEvidence))) issues.push("An agent needs prior written holder approval and arrangements to return the declaration copy.")
  // Suspension changes payment disposition, not the selected tariff formula.
  // Keep quantities, currency conversions and bounds intact for the common
  // calculation engine to validate and evaluate; never flatten to a percentage.
  if (item.measures.length !== 1 || item.measures[0].taxType !== "A00" || item.measures[0].jurisdiction !== "UK" || item.measures[0].disposition !== "payable" || !["gb-standard", "specific-compound"].includes(item.measures[0].family)) issues.push("Warehouse estimates for excise, remedies and other tariff treatments require their corresponding treatment adapter.")
  if (issues.length) return { issues }
  const evidence = `Draft warehouse entry estimate: ${worksheet.authorisationNumber}; holder ${worksheet.holderEori}; warehouse ${worksheet.warehouseIdentifier}. ${worksheet.entryConditionsEvidence}. Recalculate on release using the applicable liability event; this is not a fixed release assessment.`
  const reference: Reference = { source: WAREHOUSE_ENTRY_SOURCE, reference: "7100-entry-estimate-v1", validFrom: context.date, validTo: context.date, retrievedAt: context.retrievedAt }
  return { issues, item: {
    ...item, families: [...new Set([...item.families, "special-procedure" as const])], procedureEvidence: evidence,
    measures: item.measures.map(measure => ({ ...measure, disposition: "suspended", evidence: [...measure.evidence, evidence] })),
    vatTreatment: { disposition: "suspended", evidence, reference, includedTaxReferences: item.measures.map(({ source, reference }) => ({ source, reference })) },
  } }
}
