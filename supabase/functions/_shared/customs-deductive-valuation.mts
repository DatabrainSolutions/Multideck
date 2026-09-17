import { Decimal } from "./customs-calculation-decimal.mts"

export const deductiveCategories = ["commission-or-profit", "uk-delivery", "uk-duties-and-taxes", "uk-processing"] as const
export type DeductiveValueWorksheet = {
  quantity: string; unit: string; earlierMethodReasons: { "1": string; "2": string; "3": string }
  salesEvidence: string; timingEvidence: string
  commercialDeduction: "commission" | "profit-general-expenses"
  processedGoods: boolean; processingEligibilityEvidence?: string
  sales: { id: string; unitPriceGbp: string; quantity: string; unrelatedUkBuyer: boolean; evidence: string }[]
  deductions: { category: typeof deductiveCategories[number]; amountPerUnitGbp: string; evidence: string }[]
}

/** Actual-sales lane. Deposit estimates and account-sales schemes require their
 * separate treatment; these are not invented from unsold stock or a price list. */
export function deductiveCustomsValue(worksheet: DeductiveValueWorksheet) {
  const evidence = (value: unknown) => typeof value === "string" && value.trim().length > 0
  const positive = (value: string) => { const amount = Decimal.parse(value); if (amount.n <= 0n) throw new Error("Method 4 sale prices and quantities must be positive."); return amount }
  if (!worksheet || !evidence(worksheet.unit) || !evidence(worksheet.salesEvidence) || !evidence(worksheet.timingEvidence) ||
    !["1", "2", "3"].every(method => evidence(worksheet.earlierMethodReasons?.[method as "1" | "2" | "3"]))) throw new Error("Method 4 needs sales/timing evidence, a quantity unit and reasons earlier methods failed.")
  if (typeof worksheet.processedGoods !== "boolean" || (worksheet.processedGoods && !evidence(worksheet.processingEligibilityEvidence))) throw new Error("Confirm the goods' condition and evidence eligibility after processing where applicable.")
  if (!["commission", "profit-general-expenses"].includes(worksheet.commercialDeduction)) throw new Error("Choose commission or usual profit and general expenses, not both.")
  const quantity = positive(worksheet.quantity)
  if (!Array.isArray(worksheet.sales) || !worksheet.sales.length || worksheet.sales.length > 1000) throw new Error("Record the relevant actual UK sales. Unsold goods need the deposit-value workflow.")
  const ids = new Set<string>(), prices = new Map<string, { price: Decimal; quantity: Decimal }>()
  for (const sale of worksheet.sales) {
    if (!sale || !evidence(sale.id) || ids.has(sale.id) || !evidence(sale.evidence) || sale.unrelatedUkBuyer !== true) throw new Error("Each sale needs a unique reference, evidence and an unrelated UK buyer.")
    ids.add(sale.id)
    const price = positive(sale.unitPriceGbp), sold = positive(sale.quantity), key = `${price.n}/${price.d}`
    const prior = prices.get(key)
    prices.set(key, { price, quantity: prior ? prior.quantity.add(sold) : sold })
  }
  const groups = [...prices.values()].sort((a, b) => b.quantity.compare(a.quantity))
  if (groups.length > 1 && groups[0].quantity.compare(groups[1].quantity) === 0) throw new Error("Sales have tied greatest aggregate quantities at different prices. Resolve the applicable unit price with supporting valuation evidence.")
  if (!Array.isArray(worksheet.deductions) || worksheet.deductions.length !== deductiveCategories.length || new Set(worksheet.deductions.map(d => d.category)).size !== deductiveCategories.length) throw new Error("Record each Method 4 deduction once, including evidenced zero amounts.")
  const deductions = worksheet.deductions.map(deduction => {
    if (!deductiveCategories.includes(deduction.category) || !evidence(deduction.evidence)) throw new Error("Each Method 4 deduction needs its category and supporting evidence.")
    const amount = Decimal.parse(deduction.amountPerUnitGbp)
    if (amount.n < 0n || (!worksheet.processedGoods && deduction.category === "uk-processing" && amount.n !== 0n)) throw new Error("Method 4 deductions must be non-negative; unprocessed goods cannot have a processing deduction.")
    return { category: deduction.category, amount }
  })
  const unitPrice = groups[0].price
  const netUnit = deductions.reduce((value, deduction) => value.sub(deduction.amount), unitPrice)
  if (netUnit.n <= 0n) throw new Error("Deductions must leave a positive customs value.")
  return { value: netUnit.mul(quantity), unitPrice, greatestAggregateQuantity: groups[0].quantity, deductions,
    grossSalesValue: unitPrice.mul(quantity), netUnit }
}
