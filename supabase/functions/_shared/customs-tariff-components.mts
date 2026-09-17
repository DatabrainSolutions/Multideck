import type { TaxMeasure } from "./customs-duty-calculation.mts"
import { Decimal } from "./customs-calculation-decimal.mts"
import { quantityForMeasure } from "./customs-measure-quantity.mts"
import { convertEuroTariffAmount, type TariffExchangeRate } from "./customs-tariff-exchange-rate.mts"

export type TariffQuantity = { quantity: string; unit: string; qualifier?: string; evidence: string; alcoholByVolume?: string; strengthEvidence?: string }

/** Decode structured additive expressions only. This establishes arithmetic,
 * not eligibility, currency conversion or CDS precision certification.
 * https://raw.githubusercontent.com/trade-tariff/trade-tariff-api-docs/main/source/the-trade-tariff-api.html.md.erb
 */
export function tariffComponents(rows: { attributes: Record<string, unknown> }[], quantities: TariffQuantity[], conversion?: TariffExchangeRate): TaxMeasure["components"] {
  if (quantities.length > 20) throw new Error("Use no more than 20 tariff quantities per item.")
  if (!rows.length || rows.filter(row => row.attributes.duty_expression_id === "01").length !== 1) throw new Error("The tariff needs one base duty expression.")
  if (rows.some(row => !["01", "04"].includes(String(row.attributes.duty_expression_id)))) throw new Error("This tariff expression needs its own formula; it cannot be treated as an addition.")
  if (new Set(rows.map(row => row.attributes.duty_expression_id)).size !== rows.length) throw new Error("A duty expression cannot occur twice in the same measure.")
  // JSON:API relationship order is not arithmetic order.
  return decodeComponents([...rows].sort((a, b) => String(a.attributes.duty_expression_id).localeCompare(String(b.attributes.duty_expression_id))), quantities, conversion)
}

/** MIN/MAX start a new comparison group, not an additive tax. Subsequent
 * additive expressions belong to that group until the next MIN/MAX.
 * https://uktrade.github.io/tariff-data-manual/documentation/data-structures/measure-components.html
 */
export function tariffFormula(rows: { attributes: Record<string, unknown> }[], quantities: TariffQuantity[], conversion?: TariffExchangeRate): Pick<TaxMeasure, "components" | "bounds"> {
  if (quantities.length > 20) throw new Error("Use no more than 20 tariff quantities per item.")
  const codes = rows.map(row => String(row.attributes.duty_expression_id))
  if (codes.filter(code => code === "01").length !== 1) throw new Error("The tariff needs one base duty expression.")
  if (new Set(codes).size !== codes.length) throw new Error("A duty expression cannot occur twice in the same measure.")
  if (codes.some(code => !["01", "04", "15", "17", "19", "20", "35"].includes(code))) throw new Error("This tariff expression needs its own formula; it cannot be treated as an addition.")
  const base: typeof rows = [], groups: { type: "minimum" | "maximum"; rows: typeof rows }[] = []
  for (const row of [...rows].sort((a, b) => Number(a.attributes.duty_expression_id) - Number(b.attributes.duty_expression_id))) {
    const code = String(row.attributes.duty_expression_id)
    if (code === "15" || code === "17" || code === "35") groups.push({ type: code === "15" ? "minimum" : "maximum", rows: [row] })
    else (groups.at(-1)?.rows ?? base).push(row)
  }
  return { components: decodeComponents(base, quantities, conversion), bounds: groups.map(group => ({ type: group.type, components: decodeComponents(group.rows, quantities, conversion) })) }
}

function decodeComponents(rows: { attributes: Record<string, unknown> }[], quantities: TariffQuantity[], conversion?: TariffExchangeRate): TaxMeasure["components"] {
  return rows.map(({ attributes: a }) => {
    const rate = String(a.duty_amount ?? "")
    if (Decimal.parse(rate).n < 0n) throw new Error("The tariff rate cannot be negative.")
    const currency = a.monetary_unit_code, unit = a.measurement_unit_code, qualifier = a.measurement_unit_qualifier_code
    if (!currency && !unit && !qualifier) return { type: "percent" as const, rate }
    if ((currency !== "GBP" && currency !== "EUR") || (currency === "EUR" && !conversion) || typeof unit !== "string" || !unit.trim() || (qualifier != null && typeof qualifier !== "string")) throw new Error("Specific tariff components need a GBP rate and an explicit unit. Foreign tariff rates require their own conversion evidence.")
    if (currency === "EUR") convertEuroTariffAmount(Decimal.parse(rate), conversion, conversion!.calculationDate)
    const targetQualifier = typeof qualifier === "string" ? qualifier : undefined
    const candidates = quantities.filter(q => {
      if (!q.evidence?.trim()) return false
      try { quantityForMeasure({ quantity: q.quantity, sourceUnit: q.unit, targetUnit: unit, sourceQualifier: q.qualifier, targetQualifier, alcoholByVolume: q.alcoholByVolume, strengthEvidence: q.strengthEvidence }); return true } catch { return false }
    })
    if (candidates.length !== 1) throw new Error(`Provide one evidenced quantity for ${unit}${targetQualifier ? ` (${targetQualifier})` : ""}; missing or competing quantities cannot determine duty.`)
    const q = candidates[0]
    return { type: "specific" as const, rate, currency, ...(currency === "EUR" ? { tariffConversion: { ...conversion! } } : {}), quantity: q.quantity, quantityUnit: q.unit, quantityQualifier: q.qualifier, quantityEvidence: q.evidence, alcoholByVolume: q.alcoholByVolume, strengthEvidence: q.strengthEvidence, unit, unitQualifier: targetQualifier, per: "1" }
  })
}
