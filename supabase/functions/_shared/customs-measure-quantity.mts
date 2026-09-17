import { Decimal } from "./customs-calculation-decimal.mts"

/** Official tariff mass and volume equivalents. Qualifiers are
 * semantically significant; litres are never implicitly litres of pure alcohol.
 * Source: https://uktrade.github.io/tariff-data-manual/documentation/data-structures/measurement-units.html
 * Checked 15 September 2026. No mass/volume or item/pair equivalence is inferred. */
export function quantityForMeasure(input: { quantity: string; sourceUnit: string; targetUnit: string; sourceQualifier?: string; targetQualifier?: string; alcoholByVolume?: string; strengthEvidence?: string }) {
  const quantity = Decimal.parse(input.quantity)
  if (quantity.n < 0n) throw new Error("Measure quantities cannot be negative.")
  if (!input.sourceUnit?.trim() || !input.targetUnit?.trim()) throw new Error("Record the quantity unit and tariff measure unit.")
  if ((input.sourceQualifier ?? "") !== (input.targetQualifier ?? "")) throw new Error("The quantity qualifier must match the tariff requirement. Gross, net and drained weights are not interchangeable.")
  if (input.sourceUnit === input.targetUnit) return quantity
  if (input.targetUnit === "LPA" && ["LTR", "HLT"].includes(input.sourceUnit)) {
    // HMRC Alcohol Duty guidance: litres of finished product × ABV / 100.
    // A separately evidenced strength is required; volume alone is not LPA.
    if (input.sourceQualifier || input.targetQualifier || !input.strengthEvidence?.trim()) throw new Error("Litres of pure alcohol require supporting alcohol-strength evidence and unqualified product volume.")
    const strength = Decimal.parse(input.alcoholByVolume ?? "")
    if (strength.n < 0n || strength.compare(Decimal.parse("100")) > 0) throw new Error("Alcohol strength must be between 0 and 100% ABV.")
    return quantity.mul(Decimal.parse(input.sourceUnit === "HLT" ? "100" : "1")).mul(strength).div(Decimal.parse("100"))
  }
  const units: Record<string, { dimension: string; factor: string }> = {
    KGM: { dimension: "mass", factor: "1" }, DTN: { dimension: "mass", factor: "100" },
    TNE: { dimension: "mass", factor: "1000" }, GRM: { dimension: "mass", factor: "0.001" },
    LTR: { dimension: "volume", factor: "1" }, HLT: { dimension: "volume", factor: "100" },
    KLT: { dimension: "volume", factor: "1000" }, MLT: { dimension: "volume", factor: "0.001" },
  }
  const source = units[input.sourceUnit], target = units[input.targetUnit]
  if (!source || !target || source.dimension !== target.dimension) throw new Error("Supply a quantity in the tariff's required unit. This unit conversion needs a separate evidenced calculation.")
  return quantity.mul(Decimal.parse(source.factor)).div(Decimal.parse(target.factor))
}
