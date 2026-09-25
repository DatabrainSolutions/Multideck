import type { VatBox } from "./uk-vat-nine-box.mts"

/** The approved, immutable calculation must supply these strings verbatim.
 * This contract checks HMRC's wire format; it does not approve a return. */
export interface HmrcVatReturnInput {
  periodKey: string
  boxes: Record<VatBox, string>
  declarationConfirmed: boolean
}

const pennyLimit = 999999999999999n
const netPennyLimit = 9999999999999n
const poundLimit = 9999999999999n
const periodKeyPattern = /^(?:[A-Za-z0-9]{4}|#[A-Za-z0-9]{3})$/
const moneyPattern = /^-?(?:0|[1-9]\d*)\.\d{2}$/

function amount(value: unknown, box: VatBox): bigint {
  if (typeof value !== "string" || !moneyPattern.test(value)) {
    throw new Error(`VAT Box ${box} must be an exact two-decimal GBP string.`)
  }
  const negative = value.startsWith("-")
  const [pounds, pence] = (negative ? value.slice(1) : value).split(".")
  const pennies = BigInt(pounds) * 100n + BigInt(pence)
  const signed = negative ? -pennies : pennies
  if (box <= 4 && (signed < -pennyLimit || signed > pennyLimit)) {
    throw new Error(`VAT Box ${box} is outside HMRC's allowed range.`)
  }
  if (box === 5 && (signed < 0n || signed > netPennyLimit)) {
    throw new Error("VAT Box 5 is outside HMRC's allowed range.")
  }
  if (box >= 6 && (pence !== "00" || signed < -poundLimit * 100n || signed > poundLimit * 100n)) {
    throw new Error(`VAT Box ${box} needs a reviewed whole-pound value within HMRC's range.`)
  }
  return signed
}

/** Returns an exact JSON body with numeric fields; no IEEE-754 conversion or
 * implicit rounding occurs. The caller must separately verify the open HMRC
 * obligation, approval lock, current fingerprint, authority and fraud headers. */
export function buildHmrcVatReturnBody(input: HmrcVatReturnInput): string {
  if (!periodKeyPattern.test(input.periodKey)) throw new Error("HMRC VAT period key is invalid.")
  if (input.declarationConfirmed !== true) throw new Error("The final VAT declaration has not been confirmed.")
  if (!input.boxes || typeof input.boxes !== "object" || Array.isArray(input.boxes)) {
    throw new Error("The reviewed nine VAT boxes are required.")
  }
  const values = Array.from({ length: 9 }, (_, index) => amount(input.boxes[(index + 1) as VatBox], (index + 1) as VatBox))
  if (values[2] !== values[0] + values[1]) throw new Error("VAT Box 3 must equal Boxes 1 and 2.")
  const difference = values[2] - values[3]
  if (values[4] !== (difference < 0n ? -difference : difference)) {
    throw new Error("VAT Box 5 must equal the absolute difference between Boxes 3 and 4.")
  }
  // Validated two-decimal strings are inserted as JSON numbers to retain the
  // exact approved decimal spelling even near the maximum HMRC value.
  return `{"periodKey":${JSON.stringify(input.periodKey)},"vatDueSales":${input.boxes[1]},"vatDueAcquisitions":${input.boxes[2]},"totalVatDue":${input.boxes[3]},"vatReclaimedCurrPeriod":${input.boxes[4]},"netVatDue":${input.boxes[5]},"totalValueSalesExVAT":${input.boxes[6]},"totalValuePurchasesExVAT":${input.boxes[7]},"totalValueGoodsSuppliedExVAT":${input.boxes[8]},"totalAcquisitionsExVAT":${input.boxes[9]},"finalised":true}`
}

const boxFields = [
  "vatDueSales", "vatDueAcquisitions", "totalVatDue", "vatReclaimedCurrPeriod",
  "netVatDue", "totalValueSalesExVAT", "totalValuePurchasesExVAT",
  "totalValueGoodsSuppliedExVAT", "totalAcquisitionsExVAT",
] as const

/** Parse the flat HMRC response without passing monetary JSON numbers through
 * IEEE-754. The readback comparison is exact down to the penny. */
export function parseHmrcVatReturnReadbackText(raw: string, expected: HmrcVatReturnInput) {
  if (typeof raw !== "string" || raw.length < 2 || raw.length > 8192
    || !periodKeyPattern.test(expected.periodKey)) {
    throw new Error("HMRC VAT return readback is invalid.")
  }
  try { JSON.parse(raw) } catch { throw new Error("HMRC VAT return readback is invalid.") }
  let index = 0
  const fields = new Map<string, { kind: "string" | "number" | "boolean" | "null"; value: string }>()
  const space = () => { while (/\s/.test(raw[index] || "")) index++ }
  const stringToken = () => {
    if (raw[index] !== '"') throw new Error("HMRC VAT return readback is invalid.")
    const start = index++
    let escaped = false
    while (index < raw.length) {
      const character = raw[index++]
      if (character === '"' && !escaped) return JSON.parse(raw.slice(start, index)) as string
      if (character === "\\" && !escaped) escaped = true
      else escaped = false
    }
    throw new Error("HMRC VAT return readback is invalid.")
  }
  space()
  if (raw[index++] !== "{") throw new Error("HMRC VAT return readback is invalid.")
  space()
  while (raw[index] !== "}") {
    const key = stringToken()
    if (fields.has(key)) throw new Error("HMRC VAT return readback has duplicate fields.")
    space()
    if (raw[index++] !== ":") throw new Error("HMRC VAT return readback is invalid.")
    space()
    let kind: "string" | "number" | "boolean" | "null"
    let value: string
    if (raw[index] === '"') { kind = "string"; value = stringToken() }
    else {
      const match = /^(?:-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/.exec(raw.slice(index))
      if (!match) throw new Error("HMRC VAT return readback is invalid.")
      value = match[0]
      kind = value === "true" || value === "false" ? "boolean" : value === "null" ? "null" : "number"
      index += value.length
    }
    fields.set(key, { kind, value })
    space()
    if (raw[index] === "}") break
    if (raw[index++] !== ",") throw new Error("HMRC VAT return readback is invalid.")
    space()
    if (raw[index] === "}") throw new Error("HMRC VAT return readback is invalid.")
  }
  index++
  space()
  if (index !== raw.length) throw new Error("HMRC VAT return readback is invalid.")
  const allowed = new Set<string>(["periodKey", "finalised", ...boxFields])
  if (fields.size !== (fields.has("finalised") ? 11 : 10)
    || [...fields.keys()].some((key) => !allowed.has(key))) {
    throw new Error("HMRC VAT return readback is invalid.")
  }
  if (fields.get("periodKey")?.kind !== "string"
    || fields.get("periodKey")?.value !== expected.periodKey
    || (fields.has("finalised") && (fields.get("finalised")?.kind !== "boolean"
      || fields.get("finalised")?.value !== "true"))) {
    throw new Error("HMRC VAT return readback does not match the submitted period.")
  }
  const boxes = {} as Record<VatBox, string>
  for (let offset = 0; offset < boxFields.length; offset++) {
    const box = (offset + 1) as VatBox
    const field = fields.get(boxFields[offset])
    if (field?.kind !== "number") throw new Error(`HMRC VAT return readback Box ${box} is invalid.`)
    const match = /^(-?)(0|[1-9]\d*)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(field.value)
    if (!match || field.value.length > 80) throw new Error(`HMRC VAT return readback Box ${box} is invalid.`)
    const exponent = Number(match[4] || "0")
    if (!Number.isInteger(exponent) || Math.abs(exponent) > 30) {
      throw new Error(`HMRC VAT return readback Box ${box} is invalid.`)
    }
    const fraction = match[3] || ""
    const coefficient = BigInt(match[2] + fraction)
    const shift = 2 - fraction.length + exponent
    const pennies = shift >= 0 ? coefficient * 10n ** BigInt(shift) : (() => {
      const divisor = 10n ** BigInt(-shift)
      if (coefficient % divisor !== 0n) {
        throw new Error(`HMRC VAT return readback Box ${box} has more than two decimal places.`)
      }
      return coefficient / divisor
    })()
    const signed = match[1] === "-" ? -pennies : pennies
    const absolute = signed < 0n ? -signed : signed
    const canonical = `${signed < 0n ? "-" : ""}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`
    try { amount(canonical, box) } catch {
      throw new Error(`HMRC VAT return readback Box ${box} is invalid.`)
    }
    if (amount(canonical, box) !== amount(expected.boxes[box], box)) {
      throw new Error(`HMRC VAT return readback Box ${box} differs from the submitted return.`)
    }
    boxes[box] = canonical
  }
  return { periodKey: expected.periodKey, boxes }
}
