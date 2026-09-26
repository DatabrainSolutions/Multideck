/**
 * Pure UK standard-basis VAT calculation for standard and annual accounting.
 * Callers must supply immutable, posted GBP
 * evidence after checking legal entity, tax point, scheme and source versions.
 * No value returned here is authority to submit a return to HMRC.
 */
export type VatBox = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
export type VatTreatment =
  | "domestic_sale"
  | "zero_rated_sale"
  | "exempt_sale"
  | "outside_uk_service_sale"
  | "domestic_purchase"
  | "nonrecoverable_purchase"
  | "zero_rated_purchase"
  | "exempt_purchase"
  | "outside_scope"
  | "reverse_charge"
  | "postponed_import_vat"
  | "import_vat"
  | "export"
  | "bad_debt_relief"
  | "partial_exemption"
  | "ni_eu_goods_sale"
  | "ni_eu_goods_purchase"

export interface VatEvidence {
  id: string
  legalEntityId: string
  documentId: string
  documentLineId: string
  taxPoint: string
  treatment: VatTreatment
  /** Signed amounts: a credit or reversal negates the original supply. */
  netGbp: string
  vatGbp: string
  sourceVersion: string
  reviewedRuleId: string
}

export interface VatPeriodInput {
  legalEntityId: string
  start: string
  end: string
  scheme: "standard" | "cash" | "flat_rate" | "annual" | "retail" | "margin"
  evidence: VatEvidence[]
}

export interface VatBoxLine {
  evidenceId: string
  documentId: string
  documentLineId: string
  sourceVersion: string
  reviewedRuleId: string
  amountGbp: string
}

export interface VatCalculation {
  boxes: Record<VatBox, string>
  lines: Record<VatBox, VatBoxLine[]>
  exceptions: string[]
  /** Calculation only; completeness, reconciliation and approval are separate gates. */
  calculationValid: boolean
}

const zeroBoxes = (): Record<VatBox, bigint> => ({ 1: 0n, 2: 0n, 3: 0n, 4: 0n, 5: 0n, 6: 0n, 7: 0n, 8: 0n, 9: 0n })
const moneyPattern = /^-?(?:0|[1-9]\d*)(?:\.\d{1,4})?$/
const datePattern = /^\d{4}-\d{2}-\d{2}$/

function parseMoney(value: string): bigint {
  if (!moneyPattern.test(value)) throw new Error(`Invalid GBP amount: ${value}`)
  const negative = value.startsWith("-")
  const [pounds, fraction = ""] = (negative ? value.slice(1) : value).split(".")
  const units = BigInt(pounds) * 10000n + BigInt(fraction.padEnd(4, "0"))
  return negative ? -units : units
}

function roundPennies(units: bigint): bigint {
  const negative = units < 0n
  const absolute = negative ? -units : units
  // Round the aggregate, not each source line, to avoid drift at 4 decimal places.
  const pennies = (absolute + 50n) / 100n
  return negative ? -pennies : pennies
}

function formatPennies(pennies: bigint): string {
  const negative = pennies < 0n
  const absolute = negative ? -pennies : pennies
  return `${negative && absolute !== 0n ? "-" : ""}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`
}

function formatSourceMoney(units: bigint): string {
  const negative = units < 0n
  const absolute = negative ? -units : units
  return `${negative ? "-" : ""}${absolute / 10000n}.${String(absolute % 10000n).padStart(4, "0")}`
}

function validDate(value: string): boolean {
  if (!datePattern.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

/** Unsupported treatments stay visible as exceptions and block review. */
export function calculateUkVatNineBoxes(input: VatPeriodInput): VatCalculation {
  if (!input.legalEntityId || !validDate(input.start) || !validDate(input.end) || input.start > input.end) {
    throw new Error("A legal entity and valid VAT period are required.")
  }
  const amounts = zeroBoxes()
  const lines = Object.fromEntries(Array.from({ length: 9 }, (_, index) => [index + 1, []])) as Record<VatBox, VatBoxLine[]>
  const exceptions: string[] = []
  // Annual Accounting changes the return frequency and payment schedule, not
  // the nine-box arithmetic. Instalments are never deducted from Box 5.
  if (input.scheme !== "standard" && input.scheme !== "annual") {
    return {
      boxes: Object.fromEntries(Array.from({ length: 9 }, (_, index) => [index + 1, "0.00"])) as Record<VatBox, string>,
      lines,
      exceptions: [`VAT scheme ${input.scheme} requires reviewed scheme-specific rules.`],
      calculationValid: false,
    }
  }
  const seen = new Set<string>()

  for (const event of input.evidence) {
    if (!event.id || seen.has(event.id)) {
      exceptions.push(`Duplicate or missing VAT evidence ID: ${event.id || "unknown"}.`)
      continue
    }
    seen.add(event.id)
    if (event.legalEntityId !== input.legalEntityId || !validDate(event.taxPoint) || event.taxPoint < input.start || event.taxPoint > input.end) {
      exceptions.push(`VAT evidence ${event.id} belongs to another entity or period.`)
      continue
    }
    if (!event.documentId || !event.documentLineId || !event.sourceVersion || !event.reviewedRuleId) {
      exceptions.push(`VAT evidence ${event.id} lacks source or reviewed treatment provenance.`)
      continue
    }
    let net: bigint
    let vat: bigint
    try {
      net = parseMoney(event.netGbp)
      vat = parseMoney(event.vatGbp)
    } catch {
      exceptions.push(`VAT evidence ${event.id} has an invalid GBP amount.`)
      continue
    }
    let contributions: [VatBox, bigint][]
    switch (event.treatment) {
      case "domestic_sale":
        contributions = [[1, vat], [6, net]]
        break
      case "zero_rated_sale":
      case "exempt_sale":
      case "outside_uk_service_sale":
        if (vat !== 0n) {
          exceptions.push(`VAT evidence ${event.id} has VAT on a sale that requires zero UK VAT.`)
          continue
        }
        contributions = [[6, net]]
        break
      case "domestic_purchase":
        contributions = [[4, vat], [7, net]]
        break
      case "nonrecoverable_purchase":
        contributions = [[7, net]]
        break
      case "zero_rated_purchase":
      case "exempt_purchase":
        if (vat !== 0n) {
          exceptions.push(`VAT evidence ${event.id} has VAT on a zero-rated or exempt purchase.`)
          continue
        }
        contributions = [[7, net]]
        break
      case "outside_scope":
        exceptions.push(`VAT evidence ${event.id} is outside scope and needs a reviewed box-6/box-7 inclusion rule.`)
        continue
      default:
        exceptions.push(`VAT evidence ${event.id} uses ${event.treatment}, which needs a reviewed treatment rule.`)
        continue
    }
    for (const [box, amount] of contributions) {
      amounts[box] += amount
      lines[box].push({ evidenceId: event.id, documentId: event.documentId, documentLineId: event.documentLineId, sourceVersion: event.sourceVersion, reviewedRuleId: event.reviewedRuleId, amountGbp: formatSourceMoney(amount) })
    }
  }
  const rounded = Object.fromEntries(Array.from({ length: 9 }, (_, index) => [index + 1, roundPennies(amounts[(index + 1) as VatBox])])) as Record<VatBox, bigint>
  // HMRC checks the submitted totals against the submitted (already rounded)
  // boxes. Retain four-decimal source lines separately for the audit trail.
  rounded[3] = rounded[1] + rounded[2]
  rounded[5] = rounded[3] >= rounded[4] ? rounded[3] - rounded[4] : rounded[4] - rounded[3]
  const boxes = Object.fromEntries(Array.from({ length: 9 }, (_, index) => [index + 1, formatPennies(rounded[(index + 1) as VatBox])])) as Record<VatBox, string>
  return { boxes, lines, exceptions, calculationValid: exceptions.length === 0 }
}
