import { edgeFetch } from "@/lib/api"
import { getSupabaseSession } from "@/lib/supabase"

const phoneCallsFunctionName = "phone-calls"

export type PhoneCallDirection = "inbound" | "outbound"
export type PhoneCallOutcome = "answered" | "missed" | "declined" | "voicemail" | "abandoned" | "unknown"
export type PhoneCallMatchStatus = "matched" | "review" | "unmatched"
export type PhoneCallTranscriptStatus = "complete" | "partial" | "pending" | "failed" | "unavailable"
export type PhoneCallEvidenceKind = "provider_confirmed" | "derived"
export type PhoneCallAIDisclosureStatus = "unknown" | "disclosed" | "not_required" | "conflict"
export type PhoneCallConsentStatus = "unknown" | "not_required" | "received" | "declined" | "conflict"

export type PhoneCallConsentEvidence = {
  provider: string | null
  sourceEventId: string | null
  updatedAt: string | null
  sourceFields: string[]
}

export type PhoneCallEvidence = {
  kind: PhoneCallEvidenceKind
  source: "3cx" | "elevenlabs" | "twilio" | "multideck"
  observedAt: string | null
}

export type PhoneCallMetric = {
  id: string
  label: string
  value: string
  comparison: string | null
  detail: string
  tone: "neutral" | "green" | "amber" | "red" | "blue" | "teal"
  evidence: PhoneCallEvidence
}

export type PhoneCallVolumePoint = {
  period: string
  inboundAnswered: number
  inboundMissed: number
  outboundAnswered: number
  outboundMissed: number
  answerRate: number
}

export type PhoneCallAttentionItem = {
  id: string
  callId: string
  title: string
  occurredAt: string
  stateLabel: string
  tone: "amber" | "red" | "teal"
}

export type PhoneCallReason = {
  id: string
  label: string
  count: number
  share: number
  evidence: PhoneCallEvidence
}

export type PhoneCallCoverageItem = {
  id: "company" | "contact" | "lead" | "needs_review" | "unmatched"
  label: string
  count: number
  share: number
}

export type PhoneCallProviderStatus = {
  provider: "elevenlabs" | "twilio" | "3cx"
  label: string
  detail: string
  state: "healthy" | "delayed" | "error" | "not_configured"
  lastAttemptAt: string | null
  lastSucceededAt: string | null
  lastFailedAt: string | null
  consecutiveFailures: number
  errorCode: string | null
}

export type PhoneCallOverview = {
  preview?: boolean
  generatedAt: string
  timezone: string
  analysisScope?: {
    status: "complete" | "partial"
    totalCalls: number
    analysedCalls: number
    limit: number
    message: string | null
  }
  metrics: PhoneCallMetric[]
  volumeSeries: PhoneCallVolumePoint[]
  reasons: PhoneCallReason[]
  coverage: PhoneCallCoverageItem[]
  attention: PhoneCallAttentionItem[]
  providerStatus: PhoneCallProviderStatus[]
  analysis?: {
    averageHandlingSeconds: number
    followup: {
      approvedCalls: number
      completedCalls: number
      openCalls: number
    }
  }
}

export type PhoneCallListItem = {
  id: string
  callerName: string | null
  callerPhone: string
  company: { id: string; name: string } | null
  lead: { id: string; name: string } | null
  matchStatus: PhoneCallMatchStatus
  direction: PhoneCallDirection
  outcome: PhoneCallOutcome
  startedAt: string
  endedAt: string | null
  durationSeconds: number | null
  answerSeconds: number | null
  handlingSeconds: number | null
  transcriptStatus: PhoneCallTranscriptStatus
  followUpStatus: "none" | "suggested" | "approved" | "completed"
}

export type PhoneCallListResponse = {
  preview?: boolean
  rows: PhoneCallListItem[]
  total: number
  limit: number
  offset: number
}

export type PhoneCallParticipant = {
  id: string
  name: string | null
  phone: string | null
  role: "caller" | "receptionist" | "employee" | "external"
}

export type PhoneCallMatchCandidate = {
  id: string
  recordType: "contact" | "company" | "lead"
  name: string
  secondaryLabel: string | null
  confidence: "high" | "medium" | "low"
  reasons: string[]
}

export type PhoneCallTranscriptSegment = {
  id: string
  providerSegmentId?: string | null
  sourceSequence?: number | null
  globalSequence?: number | null
  source: "elevenlabs" | "3cx"
  sourceLabel: string
  speakerLabel: string
  speakerRole: "caller" | "receptionist" | "employee" | "external"
  startedAt: string | null
  endedAt?: string | null
  timingProvenance?: "provider_absolute" | "provider_offset" | "source_sequence_only" | "source_boundary_only" | null
  speakerProvenance?: string | null
  offsetMs: number | null
  text: string
  state: "complete" | "processing" | "failed"
}

export type PhoneCallSuggestedAction = {
  id: string
  type: "todo" | "crm_update" | "lead_link" | "quote_follow_up" | "other"
  title: string
  reason: string | null
  confidence: "high" | "medium" | "low"
  draft: PhoneCallActionDraft
  status: "pending" | "approved" | "dismissed" | "failed"
  error: string | null
  todoTaskId: string | null
  todoTaskStatus: "open" | "completed" | "deleted" | null
  todoCompletedAt: string | null
  reviewedAt: string | null
}

export type PhoneCallActionDraft = {
  title: string | null
  scheduledDate?: string | null
  priority?: string | null
  reason?: string | null
  leadId?: string | null
  leadLabel?: string | null
}

export type PhoneCallDetail = PhoneCallListItem & {
  preview?: boolean
  editVersion: number
  summary: string | null
  summarySource: "user_approved" | "ai_generated" | "none"
  meetingNotes: string | null
  capturedCallerName: string | null
  capturedCompanyName: string | null
  callReason: string | null
  participants: PhoneCallParticipant[]
  contact: { id: string; name: string } | null
  lead: { id: string; name: string } | null
  matchCandidates: PhoneCallMatchCandidate[]
  transcriptSegments: PhoneCallTranscriptSegment[]
  suggestedActions: PhoneCallSuggestedAction[]
  transfer: {
    offeredAt: string | null
    acceptedAt: string | null
    completedAt: string | null
    status: "accepted" | "declined" | "not_offered" | "unknown"
  }
  providerReferences: Array<{ provider: "elevenlabs" | "3cx" | "twilio"; kind: string; id: string }>
  aiDisclosureStatus: PhoneCallAIDisclosureStatus
  recordingConsentStatus: PhoneCallConsentStatus
  transcriptionConsentStatus: PhoneCallConsentStatus
  consentDisclosureVersion: string | null
  consentDisclosedAt: string | null
  consentEvidence: PhoneCallConsentEvidence
  recordingConsent: "received" | "not_recorded" | "unknown"
  recordingState: "recorded" | "not_recorded" | "unavailable"
  retentionUntil: string | null
  timezone: string
}

export type PhoneCallListInput = {
  offset: number
  limit: number
  timezone: string
  companyId?: string | null
  leadId?: string | null
  search?: string
  from?: string | null
  to?: string | null
  direction?: PhoneCallDirection | "all"
  outcome?: PhoneCallOutcome | "all"
  matchStatus?: PhoneCallMatchStatus | "all"
  transcriptStatus?: PhoneCallTranscriptStatus | "all"
  sort?: { id: string; direction: "asc" | "desc" } | null
}

export type PhoneCallMatchReview = {
  contactId?: string | null
  companyId?: string | null
  leadId?: string | null
  resolution: "link" | "create_contact" | "leave_unmatched"
  editVersion: number
}

export type PhoneCallNotesUpdate = {
  summary: string | null
  meetingNotes: string | null
  editVersion: number
}

export type PhoneCallActionReview = {
  decision: "approve" | "dismiss"
  editedDraft?: Partial<PhoneCallActionDraft>
  editVersion: number
}

async function accessToken() {
  const session = await getSupabaseSession()
  if (!session?.access_token) throw new Error("Sign in again to open phone calls.")
  return session.access_token
}

async function parseError(response: Response) {
  const fallback = `${response.status} ${response.statusText}`.trim()
  try {
    const body = await response.json() as { detail?: string; title?: string; message?: string }
    return body.detail || body.title || body.message || fallback
  } catch {
    return fallback
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await accessToken()
  const headers = new Headers(init?.headers)
  headers.set("Accept", "application/json")
  if (init?.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json")
  const response = await edgeFetch(phoneCallsFunctionName, path, token, { ...init, headers })
  if (!response.ok) throw new Error(await parseError(response))
  return response.json() as Promise<T>
}

function append(parameters: URLSearchParams, key: string, value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "" || value === "all") return
  parameters.set(key, String(value))
}

function canUseLocalPreview(cause: unknown) {
  if (!import.meta.env.DEV || import.meta.env.VITE_PHONE_CALLS_PREVIEW !== "true") return false
  const message = cause instanceof Error ? cause.message : String(cause)
  return cause instanceof TypeError || /failed to fetch|404 not found/i.test(message)
}

async function localPreviewModule() {
  return import("@/lib/phone-calls-preview-data")
}

export async function getPhoneCallOverview(input: { from?: string | null; to?: string | null; timezone: string }, signal?: AbortSignal) {
  const query = new URLSearchParams()
  append(query, "from", input.from)
  append(query, "to", input.to)
  append(query, "timezone", input.timezone)
  try {
    return await request<PhoneCallOverview>(`/overview?${query.toString()}`, { signal })
  } catch (cause) {
    if (!canUseLocalPreview(cause)) throw cause
    const preview = await localPreviewModule()
    return preview.getLocalPhoneCallOverview(input.timezone)
  }
}

export async function listPhoneCalls(input: PhoneCallListInput, signal?: AbortSignal) {
  const query = new URLSearchParams()
  append(query, "offset", input.offset)
  append(query, "limit", input.limit)
  append(query, "timezone", input.timezone)
  append(query, "companyId", input.companyId)
  append(query, "leadId", input.leadId)
  append(query, "search", input.search?.trim())
  append(query, "from", input.from)
  append(query, "to", input.to)
  append(query, "direction", input.direction)
  append(query, "outcome", input.outcome)
  append(query, "matchStatus", input.matchStatus)
  append(query, "transcriptStatus", input.transcriptStatus)
  if (input.sort) {
    append(query, "sort", input.sort.id)
    append(query, "sortDirection", input.sort.direction)
  }
  try {
    return await request<PhoneCallListResponse>(`/calls?${query.toString()}`, { signal })
  } catch (cause) {
    if (!canUseLocalPreview(cause)) throw cause
    const preview = await localPreviewModule()
    return preview.getLocalPhoneCallList(input)
  }
}

export async function getPhoneCall(callId: string, signal?: AbortSignal) {
  try {
    return await request<PhoneCallDetail>(`/calls/${encodeURIComponent(callId)}`, { signal })
  } catch (cause) {
    if (!canUseLocalPreview(cause)) throw cause
    const preview = await localPreviewModule()
    return preview.getLocalPhoneCall(callId)
  }
}

export function reviewPhoneCallMatch(callId: string, input: PhoneCallMatchReview) {
  return request<PhoneCallDetail>(`/calls/${encodeURIComponent(callId)}/match`, {
    method: "PATCH",
    body: JSON.stringify(input),
  })
}

export function updatePhoneCallNotes(callId: string, input: PhoneCallNotesUpdate) {
  return request<PhoneCallDetail>(`/calls/${encodeURIComponent(callId)}/notes`, {
    method: "PATCH",
    body: JSON.stringify(input),
  })
}

export function reviewPhoneCallAction(callId: string, actionId: string, input: PhoneCallActionReview) {
  return request<PhoneCallDetail>(`/calls/${encodeURIComponent(callId)}/actions/${encodeURIComponent(actionId)}/review`, {
    method: "POST",
    body: JSON.stringify(input),
  })
}
