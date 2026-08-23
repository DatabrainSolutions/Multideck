import type {
  PhoneCallDetail,
  PhoneCallListInput,
  PhoneCallListItem,
  PhoneCallListResponse,
  PhoneCallOverview,
} from "@/lib/phone-calls-api"

const previewRows: PhoneCallListItem[] = [
  {
    id: "preview-call-alex",
    callerName: "Alex Thompson",
    callerPhone: "+44 7712 345678",
    company: null,
    lead: null,
    matchStatus: "review",
    direction: "inbound",
    outcome: "answered",
    startedAt: "2026-08-22T09:21:03Z",
    endedAt: "2026-08-22T09:26:18Z",
    durationSeconds: 315,
    answerSeconds: 8,
    handlingSeconds: 307,
    transcriptStatus: "complete",
    followUpStatus: "suggested",
  },
  {
    id: "preview-call-maya",
    callerName: "Maya Stone",
    callerPhone: "+44 161 555 0198",
    company: { id: "preview-company-northstar", name: "Northstar Logistics" },
    lead: null,
    matchStatus: "matched",
    direction: "inbound",
    outcome: "answered",
    startedAt: "2026-08-22T08:42:00Z",
    endedAt: "2026-08-22T08:45:42Z",
    durationSeconds: 222,
    answerSeconds: 6,
    handlingSeconds: 216,
    transcriptStatus: "complete",
    followUpStatus: "approved",
  },
  {
    id: "preview-call-unknown",
    callerName: null,
    callerPhone: "+44 113 496 0184",
    company: null,
    lead: null,
    matchStatus: "unmatched",
    direction: "inbound",
    outcome: "missed",
    startedAt: "2026-08-21T16:18:31Z",
    endedAt: "2026-08-21T16:19:03Z",
    durationSeconds: 32,
    answerSeconds: null,
    handlingSeconds: null,
    transcriptStatus: "pending",
    followUpStatus: "suggested",
  },
  {
    id: "preview-call-priya",
    callerName: "Priya Shah",
    callerPhone: "+44 20 7946 0241",
    company: { id: "preview-company-bluewater", name: "Bluewater Export" },
    lead: null,
    matchStatus: "matched",
    direction: "inbound",
    outcome: "voicemail",
    startedAt: "2026-08-21T14:06:14Z",
    endedAt: "2026-08-21T14:07:05Z",
    durationSeconds: 51,
    answerSeconds: null,
    handlingSeconds: 51,
    transcriptStatus: "partial",
    followUpStatus: "suggested",
  },
  {
    id: "preview-call-jamie",
    callerName: "Jamie Reed",
    callerPhone: "+44 191 555 0137",
    company: null,
    lead: null,
    matchStatus: "review",
    direction: "inbound",
    outcome: "declined",
    startedAt: "2026-08-20T11:33:27Z",
    endedAt: "2026-08-20T11:34:02Z",
    durationSeconds: 35,
    answerSeconds: null,
    handlingSeconds: null,
    transcriptStatus: "partial",
    followUpStatus: "none",
  },
  {
    id: "preview-call-sophie",
    callerName: "Sophie Williams",
    callerPhone: "+44 117 496 0112",
    company: { id: "preview-company-vantage", name: "Vantage Foods" },
    lead: null,
    matchStatus: "matched",
    direction: "outbound",
    outcome: "answered",
    startedAt: "2026-08-19T10:12:08Z",
    endedAt: "2026-08-19T10:16:44Z",
    durationSeconds: 276,
    answerSeconds: 11,
    handlingSeconds: 265,
    transcriptStatus: "complete",
    followUpStatus: "completed",
  },
]

const alexDetail: PhoneCallDetail = {
  ...previewRows[0],
  preview: true,
  editVersion: 1,
  summary: "Alex called about a revised quote for a 40ft shipment to Hamburg. The receptionist captured the request and transferred the call to Chris.",
  summarySource: "ai_generated",
  meetingNotes: "Review the existing 40ft Hamburg quote before replying.",
  capturedCallerName: "Alex Thompson",
  capturedCompanyName: "Global Retail",
  callReason: "A revised quote for a 40ft shipment to Hamburg",
  participants: [
    { id: "preview-participant-alex", name: "Alex Thompson", phone: "+44 7712 345678", role: "caller" },
    { id: "preview-participant-receptionist", name: "Jenkar receptionist", phone: null, role: "receptionist" },
    { id: "preview-participant-chris", name: "Chris Lee", phone: "601", role: "employee" },
  ],
  contact: null,
  lead: null,
  matchCandidates: [
    { id: "preview-company-global-retail", recordType: "company", name: "Global Retail Group", secondaryLabel: "Company · phone and name match", confidence: "high", reasons: ["Phone match", "Name match"] },
    { id: "preview-lead-global-rfq", recordType: "lead", name: "Global Retail Group — May RFQ", secondaryLabel: "Lead · company name match", confidence: "medium", reasons: ["Company match", "Similar request"] },
  ],
  transcriptSegments: [
    { id: "preview-segment-1", source: "elevenlabs", sourceLabel: "ElevenLabs", speakerLabel: "Receptionist", speakerRole: "receptionist", startedAt: "2026-08-22T09:21:03Z", offsetMs: 0, text: "Hi, thanks for calling Jenkar. How can I help today?", state: "complete" },
    { id: "preview-segment-2", source: "elevenlabs", sourceLabel: "ElevenLabs", speakerLabel: "Alex Thompson", speakerRole: "caller", startedAt: "2026-08-22T09:21:10Z", offsetMs: 7000, text: "Hi, it’s Alex from Global Retail. I need a revised quote for our 40ft shipment to Hamburg.", state: "complete" },
    { id: "preview-segment-3", source: "elevenlabs", sourceLabel: "ElevenLabs", speakerLabel: "Receptionist", speakerRole: "receptionist", startedAt: "2026-08-22T09:21:19Z", offsetMs: 16000, text: "Of course, Alex. I’ll pass the Hamburg quote request to Chris now.", state: "complete" },
    { id: "preview-segment-4", source: "3cx", sourceLabel: "3CX", speakerLabel: "Handler transcript", speakerRole: "employee", startedAt: null, sourceSequence: 1, globalSequence: 4, timingProvenance: "source_boundary_only", speakerProvenance: "unknown", offsetMs: null, text: "Hi Alex, it’s Chris. I have your revised quote request here.", state: "complete" },
  ],
  suggestedActions: [
    { id: "preview-action-quote", type: "todo", title: "Alex asked for a revised quote — add this to the To Do list?", reason: "Alex requested the revised quote during the receptionist portion of the call.", confidence: "high", draft: { title: "Prepare revised 40ft quote for Global Retail Group.", scheduledDate: "2026-08-22", leadId: null }, status: "pending", error: null, todoTaskId: null, todoTaskStatus: null, todoCompletedAt: null, reviewedAt: null },
    { id: "preview-action-lead", type: "lead_link", title: "Attach this call to lead “Global Retail Group — May RFQ”?", reason: "The company and request are similar, but need review.", confidence: "medium", draft: { title: null, leadId: "preview-lead-global-rfq", leadLabel: "Global Retail Group — May RFQ" }, status: "pending", error: null, todoTaskId: null, todoTaskStatus: null, todoCompletedAt: null, reviewedAt: null },
  ],
  transfer: { offeredAt: "2026-08-22T09:21:41Z", acceptedAt: "2026-08-22T09:22:31Z", completedAt: "2026-08-22T09:22:35Z", status: "accepted" },
  providerReferences: [
    { provider: "elevenlabs", kind: "conversation", id: "conv_preview_jenkar_1042" },
    { provider: "twilio", kind: "call", id: "CA_preview_79d16a" },
    { provider: "3cx", kind: "CDR", id: "preview-cdr-88412" },
  ],
  aiDisclosureStatus: "disclosed",
  recordingConsentStatus: "received",
  transcriptionConsentStatus: "received",
  consentDisclosureVersion: "jenkar-receptionist-v1",
  consentDisclosedAt: "2026-08-22T09:21:04Z",
  consentEvidence: { provider: "elevenlabs", sourceEventId: "preview-consent-event-1042", updatedAt: "2026-08-22T09:21:05Z", sourceFields: ["ai_disclosure_status", "recording_consent_status", "transcription_consent_status"] },
  recordingConsent: "received",
  recordingState: "recorded",
  retentionUntil: "2027-02-22T09:26:18Z",
  timezone: "Europe/London",
}

function genericDetail(row: PhoneCallListItem): PhoneCallDetail {
  const caller = row.callerName || "Caller"
  return {
    ...row,
    preview: true,
    editVersion: 1,
    summary: row.outcome === "answered" ? `${caller} called about an active shipment and spoke with the Jenkar team.` : null,
    summarySource: row.outcome === "answered" ? "ai_generated" : "none",
    meetingNotes: null,
    capturedCallerName: row.callerName,
    capturedCompanyName: row.company?.name ?? null,
    callReason: row.outcome === "answered" ? "Help with an active shipment" : null,
    participants: [{ id: `${row.id}-caller`, name: row.callerName, phone: row.callerPhone, role: "caller" }],
    contact: row.matchStatus === "matched" ? { id: `${row.id}-contact`, name: caller } : null,
    lead: null,
    matchCandidates: [],
    transcriptSegments: row.transcriptStatus === "pending" ? [] : [
      { id: `${row.id}-segment-1`, source: "elevenlabs", sourceLabel: "ElevenLabs", speakerLabel: "Receptionist", speakerRole: "receptionist", startedAt: row.startedAt, offsetMs: 0, text: "Hi, thanks for calling Jenkar. How can I help today?", state: "complete" },
      { id: `${row.id}-segment-2`, source: "elevenlabs", sourceLabel: "ElevenLabs", speakerLabel: caller, speakerRole: "caller", startedAt: row.startedAt, offsetMs: 6500, text: "I’m calling about an active shipment and need someone from the team to help.", state: row.transcriptStatus === "partial" ? "processing" : "complete" },
    ],
    suggestedActions: [],
    transfer: { offeredAt: null, acceptedAt: null, completedAt: null, status: "not_offered" },
    providerReferences: [{ provider: "3cx", kind: "CDR", id: `preview-${row.id}` }],
    aiDisclosureStatus: "unknown",
    recordingConsentStatus: "unknown",
    transcriptionConsentStatus: "unknown",
    consentDisclosureVersion: null,
    consentDisclosedAt: null,
    consentEvidence: { provider: null, sourceEventId: null, updatedAt: null, sourceFields: [] },
    recordingConsent: "unknown",
    recordingState: row.transcriptStatus === "pending" ? "unavailable" : "recorded",
    retentionUntil: null,
    timezone: "Europe/London",
  }
}

const previewDetails = new Map(previewRows.map((row) => [row.id, row.id === alexDetail.id ? alexDetail : genericDetail(row)]))

export function getLocalPhoneCallOverview(timezone: string): PhoneCallOverview {
  return {
    preview: true,
    generatedAt: "2026-08-22T10:00:00Z",
    timezone,
    metrics: [
      { id: "volume", label: "Calls", value: "184", comparison: "+12% vs prior period", detail: "112 inbound · 72 outbound", tone: "neutral", evidence: { kind: "derived", source: "multideck", observedAt: null } },
      { id: "answer-rate", label: "Answer rate", value: "86%", comparison: "+4 points", detail: "158 answered", tone: "green", evidence: { kind: "provider_confirmed", source: "3cx", observedAt: null } },
      { id: "missed", label: "Missed", value: "14", comparison: "−3 calls", detail: "7 need follow-up", tone: "red", evidence: { kind: "provider_confirmed", source: "3cx", observedAt: null } },
      { id: "transfer", label: "Transfer acceptance", value: "78%", comparison: "+6 points", detail: "Receptionist to team", tone: "blue", evidence: { kind: "provider_confirmed", source: "twilio", observedAt: null } },
      { id: "handling", label: "Avg. handling", value: "04:18", comparison: null, detail: "Answered calls", tone: "neutral", evidence: { kind: "derived", source: "multideck", observedAt: null } },
      { id: "followup", label: "Follow-up completion", value: "63%", comparison: "+9 points", detail: "12 of 19 approved follow-ups completed", tone: "teal", evidence: { kind: "derived", source: "multideck", observedAt: null } },
    ],
    volumeSeries: [
      { period: "Mon", inboundAnswered: 18, inboundMissed: 3, outboundAnswered: 8, outboundMissed: 1, answerRate: 86 },
      { period: "Tue", inboundAnswered: 22, inboundMissed: 2, outboundAnswered: 11, outboundMissed: 2, answerRate: 90 },
      { period: "Wed", inboundAnswered: 19, inboundMissed: 5, outboundAnswered: 9, outboundMissed: 1, answerRate: 79 },
      { period: "Thu", inboundAnswered: 25, inboundMissed: 2, outboundAnswered: 12, outboundMissed: 1, answerRate: 92 },
      { period: "Fri", inboundAnswered: 21, inboundMissed: 4, outboundAnswered: 10, outboundMissed: 2, answerRate: 84 },
    ],
    attention: [
      { id: "preview-attention-1", callId: "preview-call-alex", title: "Alex asked for a revised quote", occurredAt: "2026-08-22T09:21:03Z", stateLabel: "Suggested action", tone: "amber" },
      { id: "preview-attention-2", callId: "preview-call-unknown", title: "Unknown caller needs identity review", occurredAt: "2026-08-21T16:18:31Z", stateLabel: "Unmatched caller", tone: "red" },
    ],
    reasons: [
      { id: "quote", label: "Quote request", count: 34, share: 32, evidence: { kind: "derived", source: "multideck", observedAt: null } },
      { id: "tracking", label: "Shipment tracking", count: 26, share: 25, evidence: { kind: "derived", source: "multideck", observedAt: null } },
      { id: "documents", label: "Documents", count: 18, share: 17, evidence: { kind: "derived", source: "multideck", observedAt: null } },
    ],
    coverage: [
      { id: "company", label: "Company", count: 132, share: 72 },
      { id: "contact", label: "Contact", count: 118, share: 64 },
      { id: "lead", label: "Lead", count: 84, share: 46 },
      { id: "needs_review", label: "Needs review", count: 31, share: 17 },
      { id: "unmatched", label: "Unmatched", count: 21, share: 11 },
    ],
    providerStatus: [
      { provider: "elevenlabs", label: "ElevenLabs receptionist", detail: "Exact-agent conversation reconciliation", state: "healthy", lastAttemptAt: "2026-08-22T10:00:00Z", lastSucceededAt: "2026-08-22T10:00:00Z", lastFailedAt: null, consecutiveFailures: 0, errorCode: null },
      { provider: "twilio", label: "Twilio screening", detail: "Screening and transfer Sync polling", state: "healthy", lastAttemptAt: "2026-08-22T10:00:00Z", lastSucceededAt: "2026-08-22T10:00:00Z", lastFailedAt: null, consecutiveFailures: 0, errorCode: null },
      { provider: "3cx", label: "3CX employee calls", detail: "3CX call-detail and transcript collector", state: "not_configured", lastAttemptAt: null, lastSucceededAt: null, lastFailedAt: null, consecutiveFailures: 0, errorCode: null },
    ],
  }
}

export function getLocalPhoneCallList(input: PhoneCallListInput): PhoneCallListResponse {
  const search = input.search?.trim().toLowerCase() ?? ""
  const filtered = previewRows.filter((row) => {
    if (input.companyId && row.company?.id !== input.companyId) return false
    if (input.leadId && previewDetails.get(row.id)?.lead?.id !== input.leadId) return false
    if (input.from && row.startedAt.slice(0, 10) < input.from) return false
    if (input.to && row.startedAt.slice(0, 10) > input.to) return false
    if (input.direction && input.direction !== "all" && row.direction !== input.direction) return false
    if (input.outcome && input.outcome !== "all" && row.outcome !== input.outcome) return false
    if (input.matchStatus && input.matchStatus !== "all" && row.matchStatus !== input.matchStatus) return false
    if (input.transcriptStatus && input.transcriptStatus !== "all" && row.transcriptStatus !== input.transcriptStatus) return false
    if (search && !`${row.callerName ?? ""} ${row.callerPhone} ${row.company?.name ?? ""}`.toLowerCase().includes(search)) return false
    return true
  })
  return { preview: true, rows: filtered.slice(input.offset, input.offset + input.limit), total: filtered.length, limit: input.limit, offset: input.offset }
}

export function getLocalPhoneCall(callId: string): PhoneCallDetail {
  return previewDetails.get(callId) ?? alexDetail
}
