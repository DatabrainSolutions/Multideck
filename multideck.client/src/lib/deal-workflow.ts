import type { DealActionType, DealLossReasonCode } from "./deal-api"

export const dealActionTypes: ReadonlyArray<{ value: DealActionType; label: string }> = [
  { value: "call", label: "Call" }, { value: "email", label: "Email" },
  { value: "meeting", label: "Meeting" }, { value: "quote", label: "Prepare quote" },
  { value: "follow_up", label: "Follow up" }, { value: "other", label: "Other" },
]

export const dealLossReasons: ReadonlyArray<{ code: DealLossReasonCode; label: string }> = [
  { code: "price", label: "Price" }, { code: "timing", label: "Timing" },
  { code: "competitor", label: "Chose a competitor" }, { code: "service_fit", label: "Service not suitable" },
  { code: "no_response", label: "No response" }, { code: "cancelled", label: "Requirement cancelled" },
  { code: "other", label: "Other" },
]

export function isLostDealStage(stage: { name: string }) {
  return /^(closed[\s_-]+)?lost$/i.test(stage.name.trim())
}

export function isOpenDealStage(stage: { name: string; isConversion: boolean }) {
  return !stage.isConversion && !/^(closed[\s_-]+)?(lost|won)$/i.test(stage.name.trim())
}

/** datetime-local is the operator's local clock, never a sliced UTC string. */
export function dealLocalDateTime(value: string | Date) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
}

export function validateDealNextAction(input: { title: string; ownerId: string; dueAt: string }) {
  if (!input.title.trim()) return "Describe the next action so someone can pick it up."
  if (input.title.trim().length > 240) return "Keep the next action to 240 characters or fewer."
  if (!input.ownerId) return "Choose who will take this action."
  if (!input.dueAt || Number.isNaN(new Date(input.dueAt).getTime())) return "Choose a date and time for the action."
  return null
}

export function validateDealLoss(input: { reasonCode: string; details: string; revisitDate: string }) {
  if (!dealLossReasons.some((reason) => reason.code === input.reasonCode)) return "Choose the main reason this deal was lost."
  if (input.reasonCode === "other" && !input.details.trim()) return "Add a short explanation for Other."
  if (input.revisitDate && (!/^\d{4}-\d{2}-\d{2}$/.test(input.revisitDate) || Number.isNaN(new Date(input.revisitDate).getTime()) || new Date(input.revisitDate).toISOString().slice(0, 10) !== input.revisitDate)) return "Choose a valid revisit date."
  return null
}

/** Older imported outcomes may have no date; never turn null into 1 January 1970. */
export function formatDealDate(value: string | null | undefined, locale: string) {
  if (!value) return "Not recorded"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Not recorded"
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(date)
}
