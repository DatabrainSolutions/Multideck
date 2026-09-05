export type BookingWorkflowAction = "open" | "workspace" | "save" | "customs-readiness" | "send-to-customs" | "quote-sync-review" | "apply-quote-sync"

export class BookingWorkflowError extends Error {
  constructor(public readonly status: number, public readonly clientMessage: string, public readonly auditMessage = clientMessage) {
    super(auditMessage)
  }
}

export function parseAction(value: unknown): BookingWorkflowAction {
  if (value === "open" || value === "workspace" || value === "save" || value === "customs-readiness" || value === "send-to-customs" || value === "quote-sync-review" || value === "apply-quote-sync") return value
  throw new BookingWorkflowError(400, "Choose a supported booking action.")
}

export function parseUuid(value: unknown, label: string) {
  const candidate = typeof value === "string" ? value.trim() : ""
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)) {
    throw new BookingWorkflowError(400, `${label} is invalid.`)
  }
  return candidate
}

export function parseReference(value: unknown) {
  const reference = typeof value === "string" ? value.trim().toUpperCase() : ""
  if (
    !reference ||
    reference.length > 80 ||
    !/^[A-Z0-9 _./-]+$/.test(reference) ||
    reference.includes("..") ||
    reference.includes("//") ||
    reference.startsWith("/") ||
    reference.endsWith("/")
  ) {
    throw new BookingWorkflowError(400, "Choose a valid booking reference.")
  }
  return reference
}

export function parseSequenceKey(value: unknown) {
  const candidate = typeof value === "string" && value.trim() ? value.trim().toLowerCase() : "default"
  if (!/^[a-z0-9_-]{1,40}$/.test(candidate)) throw new BookingWorkflowError(400, "Choose a valid booking reference sequence.")
  return candidate
}

export function parsePayload(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BookingWorkflowError(400, "Booking details are required.")
  }
  const payload = value as Record<string, unknown>
  if (JSON.stringify(payload).length > 500_000) throw new BookingWorkflowError(413, "This booking update is too large.")
  return payload
}

export function parseQuoteSyncFields(value: unknown) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 8030) {
    throw new BookingWorkflowError(400, "Choose at least one quote field to apply.")
  }
  const fields = [...new Set(value.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean))]
  const cargoField = /^cargo:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:(description|commodity|packageQuantity|packageType|grossWeightKg|netWeightKg|volumeCbm|chargeableWeightKg|length|width|height|lengthUnit|hsCode|countryOfOrigin|isHazardous|isTemperatureControlled|line)$/
  if (fields.length !== value.length || fields.some((field) => field.length > 80 || (!/^[a-z][A-Za-z]*$/.test(field) && !cargoField.test(field)))
    || fields.filter((field) => !field.startsWith("cargo:")).length > 30
    || fields.filter((field) => field.startsWith("cargo:")).length > 8000) {
    throw new BookingWorkflowError(400, "One or more selected quote fields are invalid.")
  }
  return fields
}

export function parseQuoteReviewToken(value: unknown) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
    throw new BookingWorkflowError(409, "Refresh the quote review before applying changes.")
  }
  return value
}

export function parseModeChangeConfirmation(value: unknown) {
  if (value === undefined) return false
  if (typeof value !== "boolean") {
    throw new BookingWorkflowError(400, "Mode change confirmation is invalid.")
  }
  return value
}

export function toClientError(error: unknown) {
  if (error instanceof BookingWorkflowError) return error
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : ""
  const message = typeof error === "object" && error && "message" in error ? String(error.message) : ""
  if (code === "42501") return new BookingWorkflowError(403, "You are not authorised to use this booking.", message)
  if (code === "P0002") return new BookingWorkflowError(404, message || "That booking could not be found.", message)
  if (code === "22023" || code === "23514") return new BookingWorkflowError(400, message || "Check the booking details and try again.", message)
  if (code === "23505") return new BookingWorkflowError(409, "That booking action has already completed.", message)
  if (code === "40001") return new BookingWorkflowError(409, "The Booking or quote review changed. Refresh the review and check your selections before applying.", message)
  return new BookingWorkflowError(500, "The booking workflow could not complete the request.", message || "Unexpected booking workflow failure")
}
