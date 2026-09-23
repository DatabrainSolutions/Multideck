import type { QuoteChargeParty, UnifiedQuoteChargeRow } from "@/components/multideck/unified-quote-charges-workspace"

/** Private planning-set contract. This is not an operational costing line. */
export type BookingPlanningCharge = {
  id: string
  code: string
  description: string
  cost: number
  sell: number
  costCurrency: string
  sellCurrency: string
  costRoe: number
  sellRoe: number
  quantity: number
  calculationBasis: string | null
  supplierId?: string | null
  customerId?: string | null
}

export type BookingPlanningChargeSet = {
  jobId: string
  revision: number
  baseCurrency: string
  rows: BookingPlanningCharge[]
}

export type BookingPlanningWorkspace = { supported: false } | {
  supported: true
  editable: boolean
  blockedReason: string | null
  chargeSet: BookingPlanningChargeSet | null
  currencies: { code: string; name: string; symbol: string; decimalPlaces: number }[]
  bookingUpdatedAt: string
  parties: QuoteChargeParty[]
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const currency = /^[A-Z]{3}$/

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Planning charge data is incomplete. Reload before continuing.")
  }
  return value as Record<string, unknown>
}

function number(value: unknown, label: string, positive = false): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1e12 || (positive && value === 0)) {
    throw new Error(`Enter a valid ${label} for each planning charge.`)
  }
  return value
}

export function readBookingChargeRows(value: unknown, baseCurrency: string): BookingPlanningCharge[] {
  if (!Array.isArray(value) || value.length > 200) throw new Error("Planning charges must contain no more than 200 rows.")
  const ids = new Set<string>()
  return value.map((item) => {
    const row = object(item)
    for (const field of ["supplierId", "customerId"] as const) {
      if (row[field] != null && (typeof row[field] !== "string" || !uuid.test(row[field]))) {
        throw new Error("Choose a valid planning charge party.")
      }
    }
    if (typeof row.id !== "string" || !uuid.test(row.id) || ids.has(row.id.toLowerCase())) {
      throw new Error("Each planning charge needs a unique valid identifier.")
    }
    ids.add(row.id.toLowerCase())
    if (typeof row.description !== "string" || !row.description.trim() || row.description.trim().length > 240) {
      throw new Error("Enter a description of up to 240 characters for each planning charge.")
    }
    if (row.code !== undefined && (typeof row.code !== "string" || row.code.length > 80)) throw new Error("Charge codes can contain up to 80 characters.")
    if (row.calculationBasis != null && (typeof row.calculationBasis !== "string" || row.calculationBasis.length > 80)) throw new Error("Check the charge calculation basis.")
    if (typeof row.costCurrency !== "string" || !currency.test(row.costCurrency)
      || typeof row.sellCurrency !== "string" || !currency.test(row.sellCurrency)) {
      throw new Error("Choose a cost and sell currency for each planning charge.")
    }
    const costRoe = number(row.costRoe, "cost exchange rate", true)
    const sellRoe = number(row.sellRoe, "sell exchange rate", true)
    if ((row.costCurrency === baseCurrency && costRoe !== 1) || (row.sellCurrency === baseCurrency && sellRoe !== 1)) {
      throw new Error("The base-currency exchange rate must be 1.")
    }
    return {
      id: row.id,
      code: (row.code as string | undefined) ?? "",
      description: row.description,
      cost: number(row.cost, "cost"),
      sell: number(row.sell, "sell price"),
      costCurrency: row.costCurrency,
      sellCurrency: row.sellCurrency,
      costRoe,
      sellRoe,
      quantity: number(row.quantity, "quantity"),
      calculationBasis: (row.calculationBasis as string | null | undefined) ?? null,
      ...(row.supplierId !== undefined ? { supplierId: row.supplierId as string | null } : {}),
      ...(row.customerId !== undefined ? { customerId: row.customerId as string | null } : {}),
    }
  })
}

/** Decode only a returned set for the requested Booking; absence is not an empty set. */
export function readBookingPlanningChargeSet(value: unknown, expectedJobId: string): BookingPlanningChargeSet {
  const set = object(value)
  if (!uuid.test(expectedJobId) || typeof set.job_id !== "string" || set.job_id.toLowerCase() !== expectedJobId.toLowerCase()) {
    throw new Error("Planning charges do not belong to this Booking.")
  }
  if (typeof set.revision !== "number" || !Number.isSafeInteger(set.revision) || set.revision < 0) {
    throw new Error("Planning charge revision is missing. Reload before continuing.")
  }
  if (typeof set.base_currency !== "string" || !currency.test(set.base_currency)) {
    throw new Error("Planning charge base currency is missing.")
  }
  return { jobId: set.job_id, revision: set.revision, baseCurrency: set.base_currency, rows: readBookingChargeRows(set.rows, set.base_currency) }
}

/** Pin saved rates. The shared editor otherwise resolves them against today's rates. */
export function bookingPlanningEditorRows(set: BookingPlanningChargeSet): UnifiedQuoteChargeRow[] {
  return set.rows.map((row) => ({ ...row, costRoeSource: "manual", sellRoeSource: "manual" }))
}

/** Build the narrow save body, never serialising UI totals or a caller identity. */
export function bookingPlanningSavePayload(set: BookingPlanningChargeSet, editorRows: readonly UnifiedQuoteChargeRow[]) {
  if (!uuid.test(set.jobId) || !Number.isSafeInteger(set.revision) || set.revision < 0 || !currency.test(set.baseCurrency)) {
    throw new Error("Reload planning charges before saving.")
  }
  const rows = readBookingChargeRows(editorRows.map((row) => ({ ...row, quantity: row.quantity ?? 1 })), set.baseCurrency)
  if (new TextEncoder().encode(JSON.stringify(rows)).length > 262144) throw new Error("Planning charge details are too large to save.")
  return { jobId: set.jobId, expectedRevision: set.revision, baseCurrency: set.baseCurrency, rows }
}

export function readBookingPlanningWorkspace(value: unknown, expectedJobId: string): BookingPlanningWorkspace {
  const response = object(value)
  if (response.supported === false) return { supported: false }
  if (response.supported !== true || typeof response.editable !== "boolean"
    || (response.blockedReason !== null && typeof response.blockedReason !== "string")
    || !Array.isArray(response.currencies) || !Array.isArray(response.parties) || typeof response.bookingUpdatedAt !== "string"
    || !Number.isFinite(Date.parse(response.bookingUpdatedAt))) {
    throw new Error("Planning charge access could not be confirmed. Reload before continuing.")
  }
  const chargeSet = response.chargeSet === null ? null : readBookingPlanningChargeSet(response.chargeSet, expectedJobId)
  if (response.editable && (!chargeSet || response.blockedReason !== null)) throw new Error("Planning charge editing is not ready.")
  const currencies = response.currencies.map((value) => {
    const entry = object(value)
    if (typeof entry.code !== "string" || !currency.test(entry.code) || typeof entry.name !== "string" || typeof entry.symbol !== "string"
      || typeof entry.decimalPlaces !== "number" || !Number.isInteger(entry.decimalPlaces) || entry.decimalPlaces < 0 || entry.decimalPlaces > 6) {
      throw new Error("Planning currencies could not be loaded.")
    }
    return { code: entry.code, name: entry.name, symbol: entry.symbol, decimalPlaces: entry.decimalPlaces }
  })
  if (response.editable && !currencies.some((entry) => entry.code === chargeSet?.baseCurrency)) throw new Error("Planning base currency is unavailable.")
  const parties: QuoteChargeParty[] = response.parties.map((value) => {
    const party = object(value)
    if (typeof party.id !== "string" || !uuid.test(party.id) || typeof party.name !== "string" || typeof party.code !== "string"
      || !Array.isArray(party.roles) || !party.roles.length || party.roles.some((role) => role !== "supplier" && role !== "customer")) {
      throw new Error("Planning charge parties could not be loaded.")
    }
    return { id: party.id, name: party.name, code: party.code, roles: party.roles }
  })
  return { supported: true, editable: response.editable, blockedReason: response.blockedReason, chargeSet, currencies, parties, bookingUpdatedAt: response.bookingUpdatedAt }
}
