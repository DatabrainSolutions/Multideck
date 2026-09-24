import type { QuoteChargeCatalogue } from "@/lib/quote-workflow-api"

export type ChargeChoice = { id: string; code: string; name: string; description: string }

export function chargeDirection(value: string): "import" | "export" | "cross_trade" | "other" {
  const direction = value.trim().toLowerCase().replace(/[\s-]+/g, "_")
  return direction === "import" || direction === "export" || direction === "cross_trade" ? direction : "other"
}

export function chargeMode(value: string): "air" | "sea" | "road" | "mix" | "other" {
  const mode = value.trim().toLowerCase()
  if (/^(multi|mix)/.test(mode)) return "mix"
  if (/^(sea|ocean)/.test(mode)) return "sea"
  if (/^air/.test(mode)) return "air"
  if (/^road/.test(mode)) return "road"
  return "other"
}

export function availableChargeChoices(catalogue: QuoteChargeCatalogue, kind: "quote" | "booking", direction: string, mode: string): ChargeChoice[] {
  const resolvedDirection = chargeDirection(direction)
  const resolvedMode = chargeMode(mode)
  return catalogue.codes.filter(code => !code.RATECharge_ScopeConfigured || catalogue.scopes.some(scope =>
    scope.charge_id === code.RATECharge_ID && scope.record_kind === kind && scope.direction === resolvedDirection && scope.mode === resolvedMode,
  )).map(code => ({
    id: code.RATECharge_ID,
    code: code.RATECharge_Code,
    name: code.RATECharge_Name,
    description: code.RATECharge_Description?.trim() || code.RATECharge_Name,
  }))
}
