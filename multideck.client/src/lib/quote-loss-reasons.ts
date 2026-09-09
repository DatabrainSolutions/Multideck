export const quoteLossReasons = [
  "Price too high",
  "Chose a competitor",
  "Timing or project changed",
  "Service or routing did not fit",
  "No response from customer",
  "Other",
] as const

export type QuoteLossReason = (typeof quoteLossReasons)[number]

export const quoteCustomerDeclineReasons = [
  { code: "cost_too_high", label: "Cost too high" },
  { code: "estimated_times_too_late", label: "Estimated times too late" },
  { code: "found_cheaper_quote", label: "Found a cheaper quote" },
  { code: "research_only", label: "Quoting for research purposes only" },
  { code: "job_no_longer_needed", label: "Job no longer needed" },
  { code: "other", label: "Other" },
] as const

export type QuoteCustomerDeclineReasonCode = (typeof quoteCustomerDeclineReasons)[number]["code"]

export function formatQuoteLossReason(reason: string, detail: string) {
  const cleanReason = reason.trim()
  const cleanDetail = detail.trim()
  if (!cleanReason) return ""
  if (cleanReason === "Other") return cleanDetail
  return [cleanReason, cleanDetail].filter(Boolean).join(": ")
}
