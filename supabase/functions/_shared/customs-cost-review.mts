/** Monetary Method 1 additions. These prompts require an operator's valuation
 * review; they do not certify eligibility or derive an assist's lifetime value. */
export const monetaryAdditionReview: Readonly<Record<string, string>> = {
  AB: "Confirm selling commission or brokerage, not buying commission, and the amount attributable to these goods.",
  AD: "Confirm packing materials/labour or containers forming part of the goods. Separate hired freight containers and evidence any reusable-container allocation.",
  AE: "Evidence the materials or parts supplied for these goods and the dutiable amount attributable to this importation.",
  AF: "Evidence tooling value, previous use and the allocation across production/importations. Do not allocate the full lifetime cost again on later entries.",
  AG: "Evidence production materials consumed and the dutiable amount attributable to this importation.",
  AH: "Explain the design/development treatment, where and by whom the work was provided, exclusions and the amount allocated to these goods.",
  AI: "Evidence that the royalty relates to these goods and is a condition of sale. Separate non-dutiable rights and identify only the attributable amount.",
  AJ: "Evidence the seller's share of subsequent resale, disposal or use attributable to these goods.",
  AL: "Explain the indirect payment, its relationship to the imported goods and why it forms part of the price paid or payable.",
}

export const percentageAdjustmentCode: Readonly<Record<string, string>> = { AC: "AB", AX: "AF", AZ: "AH", AM: "AI", BI: "BH" }
