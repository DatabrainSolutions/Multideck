export const pricingStages = [
  { value: "receipt", label: "Goods in", description: "Each inbound booking" },
  { value: "storage", label: "Storage", description: "Quantity × time kept" },
  { value: "dispatch", label: "Goods out", description: "Each outbound booking" },
  { value: "transaction", label: "Transactions", description: "Additional handling" },
] as const
export const pricingBases = [
  { value: "pallet", label: "Pallet" }, { value: "unit", label: "Unit" },
  { value: "m3", label: "Cubic metre" }, { value: "kg", label: "Kilogram" },
  { value: "fixed", label: "Fixed charge" },
] as const
export const pricingPeriods = [
  { value: "once", label: "Per booking / transaction" },
  { value: "night", label: "Per night" }, { value: "hour", label: "Per hour" },
  { value: "day", label: "Per started 24 hours" }, { value: "week", label: "Per started 7 nights" },
] as const
export type PricingStage = typeof pricingStages[number]["value"]
export type PricingBasis = typeof pricingBases[number]["value"]
export type PricingPeriod = typeof pricingPeriods[number]["value"]
export type WarehouseRate = {
  id: string; code: string; name: string; stage: PricingStage; basis: PricingBasis;
  period: PricingPeriod; amount: number; currency: string; minimum: number;
  freePeriods: number; from: string; to: string;
}
export type ResolvedWarehouseRate = WarehouseRate & { source: "default" | "customer" }
export type WarehousePricingState = { rates: WarehouseRate[]; defaults: WarehouseRate[]; version: number; defaultVersion: number; canManage: boolean; updatedAt: string | null }
export type PricingScenario = {
  date: string; pallet: number; unit: number; m3: number; kg: number;
  nights: number; hours: number; receipt: number; dispatch: number; transaction: number;
}
export const pricingCurrencies = ["GBP", "EUR", "USD", "CAD", "AUD"]

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
}
export function validateWarehouseRates(rates: WarehouseRate[]): string | null {
  if (rates.length > 100) return "Use no more than 100 rates per rate card."
  const ids = new Set<string>()
  for (const rate of rates) {
    if (!rate.id || ids.has(rate.id)) return "Each rate must have a unique identifier."
    ids.add(rate.id)
    if (!/^[A-Z][A-Z0-9_-]{0,39}$/.test(rate.code)) return "Use a charge code starting with a letter, followed by letters, numbers, underscores or hyphens."
    if (!rate.name.trim() || rate.name.length > 120) return "Enter a charge name of up to 120 characters."
    if (!pricingStages.some(x => x.value === rate.stage) || !pricingBases.some(x => x.value === rate.basis) || !pricingPeriods.some(x => x.value === rate.period)) return "Choose a valid stage, measurement and frequency."
    if ((rate.stage === "storage") === (rate.period === "once")) return "Storage needs a time period. Other charges apply per booking or transaction."
    if (!pricingCurrencies.includes(rate.currency)) return "Choose a supported currency."
    if (![rate.amount, rate.minimum].every(x => Number.isFinite(x) && x >= 0 && x <= 1000000 && Math.abs(x * 10000 - Math.round(x * 10000)) < 0.00001)) return "Rates and minimum charges must be between 0 and 1,000,000, with up to four decimal places."
    if (!Number.isInteger(rate.freePeriods) || rate.freePeriods < 0 || rate.freePeriods > 365 || (rate.stage !== "storage" && rate.freePeriods !== 0)) return "Free periods must be a whole number between 0 and 365, for storage only."
    if (!validDate(rate.from) || (rate.to && (!validDate(rate.to) || rate.to < rate.from))) return "Enter valid effective dates. The end date cannot be before the start date."
  }
  for (let i = 0; i < rates.length; i++) for (let j = i + 1; j < rates.length; j++) {
    const a = rates[i], b = rates[j]
    if (a.code === b.code && a.from <= (b.to || "9999-12-31") && b.from <= (a.to || "9999-12-31")) return `The effective dates for ${a.code} overlap. End the earlier rate before starting its replacement.`
  }
  return null
}

/** A code is the identity of a charge, independent of its measurement or price. */
export function resolveWarehouseRates(defaults: WarehouseRate[], overrides: WarehouseRate[], date: string): ResolvedWarehouseRate[] {
  const resolved = new Map<string, ResolvedWarehouseRate>()
  for (const [rates, source] of [[defaults, "default"], [overrides, "customer"]] as const) {
    for (const rate of rates) if (rate.from <= date && (!rate.to || rate.to >= date)) resolved.set(rate.code, { ...rate, source })
  }
  return [...resolved.values()]
}

/** Preview only: quantities are constant; no ledger entries or stock events are created. */
export function previewWarehouseRates(rates: ResolvedWarehouseRate[], scenario: PricingScenario) {
  if (!validDate(scenario.date) || Object.entries(scenario).some(([key, value]) => key !== "date" && (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1000000))) throw new Error("Enter a valid date and quantities between 0 and 1,000,000.")
  if (![scenario.nights, scenario.receipt, scenario.dispatch, scenario.transaction].every(Number.isInteger)) throw new Error("Nights and booking / transaction counts must be whole numbers.")
  return rates.map(rate => {
    const quantity = rate.basis === "fixed" ? 1 : scenario[rate.basis]
    const periods = rate.period === "night" ? scenario.nights : rate.period === "hour" ? scenario.hours
      : rate.period === "day" ? Math.ceil(scenario.hours / 24) : rate.period === "week" ? Math.ceil(scenario.nights / 7) : 1
    const billablePeriods = Math.max(0, periods - rate.freePeriods)
    const occurrences = rate.stage === "storage" ? 1 : scenario[rate.stage]
    // A minimum applies once per booking/transaction, or once over the storage stay.
    // No event, no quantity or a wholly free stay must never produce a minimum charge.
    const perOccurrence = quantity > 0 && billablePeriods > 0 ? Math.max(rate.minimum, quantity * billablePeriods * rate.amount) : 0
    const total = Math.round((perOccurrence * occurrences + Number.EPSILON) * 100) / 100
    return { rate, quantity, billablePeriods, occurrences, total }
  })
}

export function newWarehouseRate(stage: PricingStage, date: string): WarehouseRate {
  return { id: crypto.randomUUID(), code: "", name: "", stage, basis: "pallet", period: stage === "storage" ? "night" : "once", amount: 0, currency: "GBP", minimum: 0, freePeriods: 0, from: date, to: "" }
}
