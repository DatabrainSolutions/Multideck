export const quoteLossReasons = [
  "Price too high",
  "Chose a competitor",
  "Timing or project changed",
  "Service or routing did not fit",
  "No response from customer",
  "Other",
] as const

export type QuoteLossReason = (typeof quoteLossReasons)[number]

export function formatQuoteLossReason(reason: string, detail: string) {
  const cleanReason = reason.trim()
  const cleanDetail = detail.trim()
  if (!cleanReason) return ""
  if (cleanReason === "Other") return cleanDetail
  return [cleanReason, cleanDetail].filter(Boolean).join(": ")
}
