import { Decimal } from "./customs-calculation-decimal.mts"

export const COMPUTED_VALUE_SOURCE = "https://www.gov.uk/guidance/valuing-imported-goods-using-method-5-computed-value"
export const computedValueCategories = ["materials", "processing", "buyer-assists", "containers-packing", "profit-general-expenses", "border-transport", "border-insurance", "border-loading-handling"] as const
type Category = typeof computedValueCategories[number]
export type ComputedValueWorksheet = {
  producerAccountsEvidence: string
  accountingPrinciplesEvidence: string
  usualProfitEvidence: string
  earlierMethodReasons: { "1": string; "2": string; "3": string }
  method4Decision: { treatment: "unsuccessful" | "method5-first"; evidence: string }
  components: { category: Category; amount: string; currency: string; evidence: string; includedIn?: Category }[]
}

/** An evidenced build-up, never an inferred alternative value. Full eligibility
 * and precision certification remain separate from worksheet arithmetic. */
export function computedCustomsValue(worksheet: ComputedValueWorksheet, convert: (amount: string, currency: string) => Decimal) {
  const evidence = (value: unknown) => typeof value === "string" && value.trim().length > 0
  if (!worksheet || !evidence(worksheet.producerAccountsEvidence) || !evidence(worksheet.accountingPrinciplesEvidence) || !evidence(worksheet.usualProfitEvidence)) throw new Error("Method 5 requires producer accounts, accounting-principle evidence and usual profit/general-expense evidence.")
  if (!["1", "2", "3"].every(method => evidence(worksheet.earlierMethodReasons?.[method as "1" | "2" | "3"]))) throw new Error("Explain why valuation methods 1, 2 and 3 could not be used.")
  if (!["unsuccessful", "method5-first"].includes(worksheet.method4Decision?.treatment) || !evidence(worksheet.method4Decision?.evidence)) throw new Error("Record the decision to try Method 5 before Method 4, or why Method 4 failed.")
  if (!Array.isArray(worksheet.components) || worksheet.components.length !== computedValueCategories.length || new Set(worksheet.components.map(component => component.category)).size !== computedValueCategories.length || worksheet.components.some(component => !computedValueCategories.includes(component.category))) throw new Error("Complete each Method 5 cost category exactly once, including evidenced zero amounts.")
  const workings: { category: Category; amount: Decimal; includedIn?: Category }[] = []
  for (const component of worksheet.components) {
    if (!evidence(component.evidence)) throw new Error(`Method 5 needs evidence for ${component.category}.`)
    const amount = Decimal.parse(component.amount)
    if (amount.n < 0n) throw new Error("Method 5 component amounts cannot be negative.")
    if (component.includedIn) {
      const target = worksheet.components.find(value => value.category === component.includedIn)
      if (!target || target === component || target.includedIn || amount.n !== 0n) throw new Error("An included Method 5 cost must identify a separate, directly valued component and have zero additional amount.")
      workings.push({ category: component.category, amount: Decimal.parse("0"), includedIn: component.includedIn })
    } else {
      workings.push({ category: component.category, amount: convert(component.amount, component.currency) })
    }
  }
  const value = workings.reduce((total, component) => total.add(component.amount), Decimal.parse("0"))
  if (value.n <= 0n) throw new Error("The evidenced Method 5 customs value must be greater than zero.")
  return { value, workings, source: COMPUTED_VALUE_SOURCE }
}
