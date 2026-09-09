import type { FollowUpRecommendationCode } from "@/lib/follow-up-recommendation"
import { getCrmFollowUpOpportunities, type CrmFollowUpOpportunity } from "@/lib/lead-api"

export type HomeFollowUp = {
  threadId: string | null
  mailboxId: string | null
  recordType: CrmFollowUpOpportunity["recordType"]
  recordId: string | null
  name: string
  address: string | null
  subject: string
  recommendationCode?: FollowUpRecommendationCode
  waitingFor: number
}

function readableName(opportunity: CrmFollowUpOpportunity) {
  const recorded = opportunity.personName?.trim() || opportunity.companyName?.trim()
  if (recorded) return recorded
  const address = opportunity.email?.trim()
  if (!address) return "Unknown contact"
  const local = address.split("@")[0] ?? address
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toLocaleUpperCase() + part.slice(1))
    .join(" ") || address
}

/**
 * Home and CRM intentionally read the same contextual queue. The server has
 * the thread direction, delivery evidence and CRM next-action context that an
 * unread inbox row alone cannot provide.
 */
export async function loadHomeFollowUps(limit = 4, signal?: AbortSignal): Promise<HomeFollowUp[]> {
  const data = await getCrmFollowUpOpportunities()
  if (signal?.aborted) return []
  const now = Date.now()
  return data.items.slice(0, limit).map((opportunity) => ({
    threadId: opportunity.threadId,
    mailboxId: opportunity.mailboxId,
    recordType: opportunity.recordType,
    recordId: opportunity.recordId,
    name: readableName(opportunity),
    address: opportunity.email,
    subject: opportunity.subject.trim(),
    recommendationCode: opportunity.recommendationCode,
    waitingFor: Math.max(0, now - new Date(opportunity.lastActivityAt).getTime()),
  }))
}
