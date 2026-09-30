export const modules = new Set(["operations", "quotes", "crm", "finance", "warehouse", "customs", "documents", "dexter", "admin", "other"])
export const flows = new Set(["lead_create", "lead_convert", "quote_create", "quote_send", "booking_create"])
const states = new Set(["started", "step", "validation_failed", "completed", "cancelled"])
const steps = new Set(["opened", "details", "cargo", "pricing", "review", "saved", "submitted", "converted"])
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export function validateTelemetry(input: unknown, now = Date.now()) {
  const value = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {}
  if (typeof value.id !== "string" || !uuid.test(value.id)) throw new Error("Choose a valid event identifier.")
  if (value.kind === "time") {
    const start = Date.parse(String(value.from ?? "")), end = Date.parse(String(value.to ?? ""))
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end || end - start > 60_000 || start < now - 300_000 || end > now + 5000) throw new Error("Send a recent measured interval of at most one minute.")
    if (!modules.has(String(value.module)) || !["active", "idle"].includes(String(value.state))) throw new Error("Choose a supported usage state.")
    return { id: value.id, kind: "time", from: new Date(start).toISOString(), to: new Date(end).toISOString(), module: value.module, state: value.state }
  }
  if (value.kind !== "flow" || !flows.has(String(value.flow)) || !states.has(String(value.state)) || !steps.has(String(value.step))) throw new Error("Choose a supported commercial workflow event.")
  if (typeof value.flowId !== "string" || !uuid.test(value.flowId)) throw new Error("Choose a valid workflow identifier.")
  if (value.recordId != null && (typeof value.recordId !== "string" || !uuid.test(value.recordId))) throw new Error("Choose a valid source record.")
  // Only names from the fixed vocabulary survive. Never accept form values, URLs or free text.
  return { id: value.id, kind: "flow", flowId: value.flowId, flow: value.flow, state: value.state, step: value.step, recordId: value.recordId ?? null }
}

export function reportingDates(from: string | null, to: string | null) {
  const valid = (value: string | null) => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
    const date = new Date(`${value}T00:00:00Z`)
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  }
  if (!valid(from) || !valid(to) || from! > to! || Date.parse(to!) - Date.parse(from!) > 365 * 86_400_000) throw new Error("Choose a valid reporting period of at most one year.")
  return { from, to }
}
