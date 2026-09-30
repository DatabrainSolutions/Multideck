/** UK input-tax clawback arithmetic for an invoice-basis purchase. This is a
 * calculation only: a reviewed, posted adjustment and period sign-off must
 * exist before any result can affect Box 4. All source payment amounts use the
 * invoice currency; the VAT originally deducted is in GBP. */
export interface InputTaxClawbackInput {
  taxPoint: string
  paymentDueDate: string | null
  periodEnd: string
  originalGross: string
  paidByPeriodEnd: string
  originallyDeductedVatGbp: string
  previouslyRepaidVatGbp: string
}

export interface InputTaxClawbackResult {
  firstRequiredDate: string
  unpaidAtPeriodEnd: string
  targetClawbackGbp: string
  previouslyRepaidVatGbp: string
  /** Negative reduces Box 4; positive restores input VAT after payment. */
  box4DeltaGbp: string
  action: "not_due" | "repay" | "restore" | "none"
}

export interface InputTaxFirstPeriodInput extends Omit<InputTaxClawbackInput, "paidByPeriodEnd" | "previouslyRepaidVatGbp"> {
  periodStart: string
  paidByFirstDate: string
  paidByPeriodEnd: string
}

export interface InputTaxFirstPeriodResult {
  firstRequiredDate: string
  unpaidAtFirstDate: string
  unpaidAtPeriodEnd: string
  initialRepaymentGbp: string
  samePeriodRestorationGbp: string
  box4DeltaGbp: string
}

const moneyPattern = /^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/
const datePattern = /^\d{4}-\d{2}-\d{2}$/

function parseMoney(value: string): bigint {
  if (!moneyPattern.test(value)) throw new Error("VAT clawback needs non-negative source amounts with at most four decimals.")
  const [whole, fraction = ""] = value.split(".")
  return BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, "0"))
}

function formatMoney(value: bigint, decimals: 2 | 4): string {
  const scale = decimals === 2 ? 100n : 10000n
  return `${value / scale}.${String(value % scale).padStart(decimals, "0")}`
}

function validDate(value: string): boolean {
  if (!datePattern.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function sixMonthsAfter(value: string): string {
  const [year, month, day] = value.split("-").map(Number)
  const targetMonth = month - 1 + 6
  const targetYear = year + Math.floor(targetMonth / 12)
  const targetMonthIndex = targetMonth % 12
  const lastDay = new Date(Date.UTC(targetYear, targetMonthIndex + 1, 0)).getUTCDate()
  return `${String(targetYear).padStart(4, "0")}-${String(targetMonthIndex + 1).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`
}

export function calculateUkInputTaxClawback(input: InputTaxClawbackInput): InputTaxClawbackResult {
  if (!validDate(input.taxPoint) || !validDate(input.periodEnd)
    || (input.paymentDueDate !== null && !validDate(input.paymentDueDate))) {
    throw new Error("VAT clawback needs valid tax-point, payment-due and period-end dates.")
  }
  const gross = parseMoney(input.originalGross)
  const paid = parseMoney(input.paidByPeriodEnd)
  const inputVat = parseMoney(input.originallyDeductedVatGbp)
  const previous = parseMoney(input.previouslyRepaidVatGbp)
  if (gross === 0n || paid > gross || previous > inputVat || previous % 100n !== 0n) {
    throw new Error("VAT clawback amounts must match the original gross, payments and prior repayment.")
  }
  const relevantDate = input.paymentDueDate && input.paymentDueDate > input.taxPoint
    ? input.paymentDueDate : input.taxPoint
  const firstRequiredDate = sixMonthsAfter(relevantDate)
  const unpaid = gross - paid
  if (input.periodEnd < firstRequiredDate) {
    if (previous !== 0n) throw new Error("Input VAT was repaid before the six-month date.")
    return { firstRequiredDate, unpaidAtPeriodEnd: formatMoney(unpaid, 4),
      targetClawbackGbp: "0.00", previouslyRepaidVatGbp: "0.00",
      box4DeltaGbp: "0.00", action: "not_due" }
  }
  // Notice 700/18's example £200 × £700/£1,200 yields £116.66: truncate
  // the proportional repayment to pennies, then compare it with the amount
  // already repaid. A full later payment restores the entire earlier amount.
  const targetPennies = (inputVat * unpaid / gross) / 100n
  const previousPennies = previous / 100n
  const deltaPennies = previousPennies - targetPennies
  return { firstRequiredDate, unpaidAtPeriodEnd: formatMoney(unpaid, 4),
    targetClawbackGbp: formatMoney(targetPennies, 2),
    previouslyRepaidVatGbp: formatMoney(previousPennies, 2),
    box4DeltaGbp: deltaPennies < 0n ? `-${formatMoney(-deltaPennies, 2)}` : formatMoney(deltaPennies, 2),
    action: deltaPennies < 0n ? "repay" : deltaPennies > 0n ? "restore" : "none" }
}

/** Preserve both VAT-account entries when a supplier is paid after the six-month
 * date but before the end of that same VAT period. */
export function calculateUkInputTaxFirstPeriod(input: InputTaxFirstPeriodInput): InputTaxFirstPeriodResult {
  if (!validDate(input.periodStart) || input.periodStart > input.periodEnd) {
    throw new Error("VAT clawback needs a valid first period.")
  }
  const firstPaid = parseMoney(input.paidByFirstDate)
  const endPaid = parseMoney(input.paidByPeriodEnd)
  if (endPaid < firstPaid) throw new Error("VAT clawback payments cannot decrease within a period.")
  const initial = calculateUkInputTaxClawback({ ...input,
    periodEnd: input.periodEnd, paidByPeriodEnd: input.paidByFirstDate,
    previouslyRepaidVatGbp: "0.00" })
  if (initial.firstRequiredDate < input.periodStart || initial.firstRequiredDate > input.periodEnd) {
    throw new Error("The six-month date is outside the first repayment period.")
  }
  const final = calculateUkInputTaxClawback({ ...input,
    previouslyRepaidVatGbp: initial.targetClawbackGbp })
  if (final.action === "repay") throw new Error("The later payment cannot increase the initial repayment.")
  const initialPennies = parseMoney(initial.targetClawbackGbp) / 100n
  const restorationPennies = parseMoney(final.box4DeltaGbp) / 100n
  const netPennies = restorationPennies - initialPennies
  return {
    firstRequiredDate: initial.firstRequiredDate,
    unpaidAtFirstDate: initial.unpaidAtPeriodEnd,
    unpaidAtPeriodEnd: final.unpaidAtPeriodEnd,
    initialRepaymentGbp: initial.targetClawbackGbp,
    samePeriodRestorationGbp: final.box4DeltaGbp,
    box4DeltaGbp: netPennies < 0n ? `-${formatMoney(-netPennies, 2)}` : formatMoney(netPennies, 2),
  }
}
