/** HMRC VAT Notice 700/45 method selection for errors on submitted returns.
 * Call only after classifying each item as an error, checking its discovery
 * date and statutory time limit, and gathering every error found in the period.
 * Ordinary accounting adjustments use their own VAT rules instead. */
export interface PriorPeriodVatErrorDecisionInput {
  errors: Array<{
    /** Positive is due to HMRC; negative is due to the trader. */
    signedVatErrorGbp: string
    conduct: "undetermined" | "reasonable_care" | "careless" | "deliberate"
  }>
  /** Box 6 for the return period in which the errors were discovered. */
  currentBox6Gbp: string | null
  chooseSeparateNotification?: boolean
}

export interface PriorPeriodVatErrorDecision {
  netErrorGbp: string
  method: "current_return_adjustment" | "separate_notification" | "needs_current_box6"
  reason: "within_10000" | "within_one_percent" | "over_one_percent" | "over_50000" | "deliberate" | "elected_separate" | "box6_missing"
  conductReviewRequired: boolean
  carelessDisclosureAdvisory: boolean
}

function pennies(value: string, signed: boolean): bigint {
  if (!(signed ? /^-?(?:0|[1-9]\d*)(?:\.\d{1,2})?$/ : /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/).test(value)) {
    throw new Error("VAT correction values must be GBP amounts to the penny.")
  }
  const negative = value.startsWith("-")
  const [whole, fraction = ""] = (negative ? value.slice(1) : value).split(".")
  const amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"))
  return negative ? -amount : amount
}

function formatPennies(amount: bigint): string {
  const absolute = amount < 0n ? -amount : amount
  return `${amount < 0n && absolute !== 0n ? "-" : ""}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`
}

export function decideUkVatPriorPeriodErrorMethod(input: PriorPeriodVatErrorDecisionInput): PriorPeriodVatErrorDecision {
  if (!input.errors.length) throw new Error("At least one previous-return error is required.")
  for (const error of input.errors) {
    if (!["undetermined", "reasonable_care", "careless", "deliberate"].includes(error.conduct)) {
      throw new Error("Every previous-return error needs a valid conduct classification.")
    }
  }
  const net = input.errors.reduce((total, error) => total + pennies(error.signedVatErrorGbp, true), 0n)
  const absolute = net < 0n ? -net : net
  const result = (method: PriorPeriodVatErrorDecision["method"], reason: PriorPeriodVatErrorDecision["reason"]): PriorPeriodVatErrorDecision =>
    ({ netErrorGbp: formatPennies(net), method, reason,
      conductReviewRequired: input.errors.some(error => error.conduct === "undetermined"),
      carelessDisclosureAdvisory: input.errors.some(error => error.conduct === "careless") })
  if (input.errors.some(error => error.conduct === "deliberate")) return result("separate_notification", "deliberate")
  if (input.chooseSeparateNotification) return result("separate_notification", "elected_separate")
  if (absolute > 5_000_000n) return result("separate_notification", "over_50000")
  if (absolute <= 1_000_000n) return result("current_return_adjustment", "within_10000")
  if (input.currentBox6Gbp === null) return result("needs_current_box6", "box6_missing")
  const box6 = pennies(input.currentBox6Gbp, false)
  return absolute * 100n <= box6
    ? result("current_return_adjustment", "within_one_percent")
    : result("separate_notification", "over_one_percent")
}
