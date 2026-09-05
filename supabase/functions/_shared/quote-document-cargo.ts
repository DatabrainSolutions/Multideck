// Customer-safe, version-snapshot-only projection. Never spread a cargo object:
// future operational/internal fields must not become public by accident.
export type QuoteDocumentCargo = {
  line: string
  description: string
  details: string
  packages: string
  weights: string
  measurements: string
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function amount(value: unknown) {
  if (value === null || value === undefined || value === "") return ""
  if (typeof value !== "number" && typeof value !== "string") throw new Error("Invalid saved cargo measurement")
  const input = String(value).trim()
  if (!input) return ""
  const parsed = Number(input)
  if (input.length > 32 || !Number.isFinite(parsed) || parsed < 0 || !/^[0-9]+(?:\.[0-9]+)?$/.test(input)) {
    throw new Error("Invalid saved cargo measurement")
  }
  // Preserve saved precision and zero; do not recalculate operational amounts.
  return input
}

export function quoteDocumentCargo(facts: Record<string, unknown>): QuoteDocumentCargo[] {
  const structured = Object.hasOwn(facts, "cargoLines")
  const lines = structured ? facts.cargoLines : [{
    description: text(facts.goodsDescription) || text(facts.knownCargo) || text(facts.commodity),
    commodity: facts.commodity,
    packageQuantity: facts.packageQuantity,
    packageType: facts.packageType,
    grossWeightKg: facts.grossWeightKg,
    netWeightKg: facts.netWeightKg,
    chargeableWeightKg: facts.chargeableWeightKg,
    volumeCbm: facts.volumeCbm,
  }]
  if (!Array.isArray(lines) || lines.length > 500) throw new Error("Invalid saved quote cargo list")
  return lines.map((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid saved quote cargo line")
    const cargo = value as Record<string, unknown>
    if (structured) {
      for (const flag of ['isHazardous', 'isTemperatureControlled']) {
        if (Object.hasOwn(cargo, flag) && typeof cargo[flag] !== "boolean") throw new Error("Invalid saved cargo safety flag")
      }
    }
    const description = text(cargo.description)
    const quantity = amount(cargo.packageQuantity)
    const gross = amount(cargo.grossWeightKg), net = amount(cargo.netWeightKg), chargeable = amount(cargo.chargeableWeightKg)
    const volume = amount(cargo.volumeCbm)
    const dimensions = [amount(cargo.length), amount(cargo.width), amount(cargo.height)]
    const unit = text(cargo.lengthUnit) || "cm"
    if (!['cm', 'm', 'in'].includes(unit)) throw new Error("Invalid saved cargo dimension unit")
    const flags = [
      cargo.isHazardous === true ? "Hazardous" : "",
      cargo.isTemperatureControlled === true ? "Temperature controlled" : "",
    ]
    return {
      line: String(index + 1),
      description: description || "No cargo description recorded",
      details: [
        text(cargo.commodity) !== description ? text(cargo.commodity) : "",
        text(cargo.hsCode) ? `HS ${text(cargo.hsCode)}` : "",
        text(cargo.countryOfOrigin) ? `Origin ${text(cargo.countryOfOrigin)}` : "",
        ...flags,
      ].filter(Boolean).join(" · "),
      packages: [quantity, text(cargo.packageType)].filter(Boolean).join(" · ") || "—",
      weights: [gross ? `Gross ${gross} kg` : "", net ? `Net ${net} kg` : "", chargeable ? `Chargeable ${chargeable} kg` : ""].filter(Boolean).join(" · ") || "—",
      measurements: [
        dimensions.some(Boolean) ? `${dimensions.map((dimension) => dimension || "—").join(" × ")} ${unit} (L × W × H)` : "",
        volume ? `${volume} CBM` : "",
      ].filter(Boolean).join(" · ") || "—",
    }
  })
}

export function quoteDocumentCargoTotals(facts: Record<string, unknown>) {
  const fields = ['packageQuantity', 'grossWeightKg', 'volumeCbm'] as const
  if (!Object.hasOwn(facts, 'cargoLines')) return Object.fromEntries(fields.map((key) => [key, amount(facts[key])]))
  if (!Array.isArray(facts.cargoLines)) throw new Error("Invalid saved quote cargo list")
  return Object.fromEntries(fields.map((key) => {
    const values = (facts.cargoLines as Record<string, unknown>[]).map((line) => amount(line[key]))
    // A partially measured shipment must not be presented as a complete total.
    if (!values.length || values.some((value) => value === "")) return [key, ""]
    const precision = Math.max(...values.map((value) => value.split('.')[1]?.length ?? 0))
    const scale = 10n ** BigInt(precision)
    const total = values.reduce((sum, value) => {
      const [whole, fraction = ''] = value.split('.')
      return sum + BigInt(whole) * scale + BigInt(fraction.padEnd(precision, '0') || '0')
    }, 0n)
    const whole = total / scale, fraction = (total % scale).toString().padStart(precision, '0').replace(/0+$/, '')
    return [key, fraction ? `${whole}.${fraction}` : String(whole)]
  }))
}
