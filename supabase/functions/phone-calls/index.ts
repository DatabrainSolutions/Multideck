import type { SupabaseClient } from "npm:@supabase/supabase-js@2.108.2";
import {
  adminClient,
  authenticate,
  body,
  corsHeaders,
  currentInternalUser,
  HttpError,
  json,
  requirePermission,
  routeParts,
} from "../_shared/backend.ts";
import {
  candidateIsSafe,
  constantTimeEqual,
  dateKeyInTimeZone,
  deriveCombinedTranscriptInsights,
  firstText,
  isObject,
  type Json,
  localDateBoundary,
  normalize3cxRecord,
  normalizeCapturedAnalysisValue,
  type Normalized3cxRecord,
  normalizeJenkarScreeningOutcome,
  normalizePhone,
  parse3cxTranscript,
  parseDate,
  parseElevenLabsTranscript,
  PhoneCallInputError,
  readBoundedBody,
  resolveTranscriptRollup,
  sha256,
  text,
  type UnifiedTranscriptSegment,
  verifyElevenLabsSignature,
  verifyTwilioSignature,
} from "./core.ts";
import {
  collectTwilioSyncDocuments,
  normalizeTwilioSyncDocument,
  parseTwilioSyncWebhook,
  type TwilioSyncCheckpoint,
  TwilioSyncCollectorError,
  TwilioSyncWebhookError,
} from "./twilio_sync.ts";
import {
  discoverElevenLabsConversations,
  type ElevenLabsReconciliationResult,
  isSafeElevenLabsConversationId,
  reconcileElevenLabsConversations,
} from "./elevenlabs_reconcile.ts";
import {
  collectThreeCxXapiRecords,
  normalizeThreeCxBaseUrl,
  parseThreeCxXapiFilters,
  ThreeCxXapiError,
} from "./three_cx_xapi.ts";

type Actor = { User_ID: string; Company_ID: string };
type StoredEvent = {
  CommCallEvent_ID: string;
  CommCallEvent_StatusCode: string;
  CommCallEvent_AttemptCount: number;
  CommCallEvent_PayloadHashSHA256?: string;
};
type RetryLease = { companyId: string; leaseToken: string };
type ConsentEvidence = {
  aiDisclosureStatus: "unknown" | "disclosed" | "not_required";
  recordingConsentStatus: "unknown" | "not_required" | "received" | "declined";
  transcriptionConsentStatus:
    | "unknown"
    | "not_required"
    | "received"
    | "declined";
  disclosureVersion: string | null;
  disclosedAt: string | null;
  sourceFields: string[];
};

function providerResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function uuid(value: unknown) {
  const candidate = text(value, 36);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(candidate)
    ? candidate
    : "";
}

function configuredCompanyId() {
  const companyId = uuid(Deno.env.get("PHONE_CALLS_COMPANY_ID"));
  if (!companyId) {
    throw new HttpError(
      503,
      "Phone-call ingestion is not bound to this tenant.",
    );
  }
  return companyId;
}

function configuredRetentionDays() {
  const raw = Deno.env.get("PHONE_CALLS_RETENTION_DAYS")?.trim() ?? "";
  if (!/^\d{1,4}$/.test(raw)) {
    throw new HttpError(
      503,
      "Phone-call retention must be configured before ingestion can run.",
    );
  }
  const days = Number(raw);
  if (!Number.isSafeInteger(days) || days < 1 || days > 3650) {
    throw new HttpError(
      503,
      "Phone-call retention must be between 1 and 3650 days.",
    );
  }
  return days;
}

function secret(name: string) {
  const value = Deno.env.get(name)?.trim() ?? "";
  if (!value) {
    throw new HttpError(
      503,
      "Phone-call provider verification is not configured.",
    );
  }
  return value;
}

function optionalSecret(name: string) {
  return Deno.env.get(name)?.trim() || undefined;
}

function parseJson(raw: Uint8Array) {
  try {
    const value = JSON.parse(new TextDecoder().decode(raw));
    if (!isObject(value)) throw new Error("not object");
    return value;
  } catch {
    throw new PhoneCallInputError(400, "Send a valid JSON object.");
  }
}

async function recordEvent(admin: SupabaseClient, input: {
  companyId: string;
  provider: "elevenlabs" | "twilio" | "3cx";
  eventId: string;
  eventType: string;
  objectId?: string;
  payloadHash: string;
  signatureVerified: boolean;
  occurredAt?: string | null;
  payload: Json;
  metadata?: Json;
}) {
  const retentionUntil = new Date(
    Date.now() + configuredRetentionDays() * 24 * 60 * 60_000,
  ).toISOString();
  const values = {
    CommCallEvent_CompanyID: input.companyId,
    CommCallEvent_ProviderCode: input.provider,
    CommCallEvent_ExternalEventID: input.eventId.slice(0, 300),
    CommCallEvent_EventType: input.eventType.slice(0, 120),
    CommCallEvent_SourceObjectID: input.objectId?.slice(0, 300) || null,
    CommCallEvent_PayloadHashSHA256: input.payloadHash,
    CommCallEvent_SignatureVerified: input.signatureVerified,
    CommCallEvent_OccurredAt: input.occurredAt ?? null,
    CommCallEvent_RawPayloadJSON: input.payload,
    CommCallEvent_MetadataJSON: input.metadata ?? {},
    CommCallEvent_RetentionUntil: retentionUntil,
  };
  const { data, error } = await admin.from("Comm_CallIngestionEvents").insert(
    values,
  ).select(
    "CommCallEvent_ID, CommCallEvent_StatusCode, CommCallEvent_AttemptCount",
  ).single();
  if (!error) return { event: data as StoredEvent, duplicate: false };
  if (error.code !== "23505") throw error;
  const existing = await admin.from("Comm_CallIngestionEvents")
    .select(
      "CommCallEvent_ID, CommCallEvent_StatusCode, CommCallEvent_AttemptCount, CommCallEvent_PayloadHashSHA256",
    )
    .eq("CommCallEvent_CompanyID", input.companyId)
    .eq("CommCallEvent_ProviderCode", input.provider)
    .eq("CommCallEvent_ExternalEventID", input.eventId.slice(0, 300))
    .single();
  if (existing.error) throw existing.error;
  if (
    !constantTimeEqual(
      String(existing.data.CommCallEvent_PayloadHashSHA256 ?? ""),
      input.payloadHash,
    )
  ) {
    throw new PhoneCallInputError(
      409,
      "A provider event ID was reused with different content.",
    );
  }
  return { event: existing.data as StoredEvent, duplicate: true };
}

async function finishEvent(
  admin: SupabaseClient,
  eventId: string,
  status: "complete" | "partial" | "retryable" | "terminal",
  error?: unknown,
  retryLease?: RetryLease,
) {
  const detail = error instanceof Error
    ? error.message
    : isObject(error)
    ? [text(error.code, 40), text(error.message, 440)].filter(Boolean).join(
      ": ",
    )
    : error
    ? String(error)
    : null;
  if (retryLease) {
    const result = await admin.rpc("multideck_phone_call_finish_retry", {
      p_company_id: retryLease.companyId,
      p_event_id: eventId,
      p_lease_token: retryLease.leaseToken,
      p_status: status,
      p_error_code: detail ? "provider_processing_failed" : null,
      p_error_message: detail?.slice(0, 500) ?? null,
    });
    if (result.error) throw result.error;
    return;
  }
  const attempts = await admin.from("Comm_CallIngestionEvents").select(
    "CommCallEvent_AttemptCount",
  ).eq("CommCallEvent_ID", eventId).maybeSingle();
  if (attempts.error) console.error(attempts.error);
  const nextAttemptCount = Math.max(
    1,
    Number(attempts.data?.CommCallEvent_AttemptCount ?? 0) + 1,
  );
  const storedStatus = status === "retryable" && nextAttemptCount >= 8
    ? "dead_letter"
    : status;
  const { error: updateError } = await admin.from("Comm_CallIngestionEvents")
    .update({
      CommCallEvent_StatusCode: storedStatus,
      CommCallEvent_ProcessedAt: storedStatus === "retryable"
        ? null
        : new Date().toISOString(),
      CommCallEvent_AttemptCount: nextAttemptCount,
      CommCallEvent_NextAttemptAt: storedStatus === "retryable"
        ? new Date(Date.now() + 5 * 60_000).toISOString()
        : null,
      CommCallEvent_ErrorCode: detail ? "provider_processing_failed" : null,
      CommCallEvent_ErrorMessage: detail?.slice(0, 500) ?? null,
      CommCallEvent_LeaseToken: null,
      CommCallEvent_LeaseExpiresAt: null,
    }).eq("CommCallEvent_ID", eventId);
  if (updateError) console.error(updateError);
}

async function findLeg(
  admin: SupabaseClient,
  companyId: string,
  provider: string,
  ids: string[],
) {
  const values = [...new Set(ids.filter(Boolean))];
  if (!values.length) return null;
  const { data, error } = await admin.from("Comm_CallProviderLegs")
    .select("*")
    .eq("CommCallLeg_CompanyID", companyId)
    .eq("CommCallLeg_ProviderCode", provider)
    .in("CommCallLeg_ProviderCallID", values)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as Json | null;
}

async function findCallByCorrelation(
  admin: SupabaseClient,
  companyId: string,
  correlationId: string,
) {
  if (!correlationId) return "";
  const result = await admin.from("Comm_CallLogs").select("CommCall_ID")
    .eq("CommCall_CompanyID", companyId)
    .eq("CommCall_CorrelationID", correlationId)
    .maybeSingle();
  if (result.error) throw result.error;
  return String(result.data?.CommCall_ID ?? "");
}

function callWorkflowStatus(outcome: string, endedAt: string | null) {
  if (!endedAt) return "ringing";
  if (["no_answer", "busy"].includes(outcome)) return "no_answer";
  if (outcome === "failed") return "failed";
  if (outcome === "cancelled") return "cancelled";
  if (outcome === "voicemail") return "voicemail";
  if (["missed", "declined"].includes(outcome)) return "missed";
  return "answered";
}

function earliestTimestamp(...values: unknown[]) {
  const parsed = values.map(parseDate).filter((value): value is string =>
    Boolean(value)
  );
  return parsed.length
    ? parsed.reduce((earliest, value) => value < earliest ? value : earliest)
    : null;
}

function latestTimestamp(...values: unknown[]) {
  const parsed = values.map(parseDate).filter((value): value is string =>
    Boolean(value)
  );
  return parsed.length
    ? parsed.reduce((latest, value) => value > latest ? value : latest)
    : null;
}

function strongerTranscriptStatus(current: unknown, incoming: unknown) {
  const rank: Record<string, number> = {
    unavailable: 0,
    pending: 1,
    processing: 2,
    failed: 3,
    partial: 4,
    complete: 5,
    expired: 6,
  };
  const currentValue = text(current, 40) || "pending";
  const incomingValue = text(incoming, 40) || "pending";
  return (rank[incomingValue] ?? 1) > (rank[currentValue] ?? 1)
    ? incomingValue
    : currentValue;
}

async function createCall(admin: SupabaseClient, input: {
  companyId: string;
  provider: "elevenlabs" | "twilio" | "3cx";
  providerCallId: string;
  parentProviderCallId?: string;
  providerConversationId?: string;
  providerHistoryId?: string;
  providerSegmentId?: string;
  providerConferenceId?: string;
  correlationId?: string;
  legType:
    | "receptionist"
    | "carrier"
    | "transfer"
    | "employee"
    | "voicemail"
    | "unknown";
  direction: "inbound" | "outbound";
  fromNumber: string;
  toNumber: string;
  startedAt: string | null;
  answeredAt?: string | null;
  endedAt?: string | null;
  outcome?: string;
  transferStatus?: string;
  transcriptStatus?: string;
  correlationMethod?: string;
  correlationConfidence?: number;
  correlationEvidence?: Json;
  attachToCallId?: string;
}) {
  const existingLeg = await findLeg(admin, input.companyId, input.provider, [
    input.providerCallId,
  ]);
  const existingCallId = text(existingLeg?.CommCallLeg_CallID, 36);
  if (
    existingCallId && input.attachToCallId &&
    existingCallId !== input.attachToCallId
  ) {
    throw new HttpError(
      409,
      "The provider leg is already attached to a different phone call.",
    );
  }
  let callId = input.attachToCallId ?? existingCallId;
  if (!callId) {
    const retentionDays = configuredRetentionDays();
    callId = crypto.randomUUID();
    const { error } = await admin.from("Comm_CallLogs").insert({
      CommCall_ID: callId,
      CommCall_CompanyID: input.companyId,
      CommCall_CorrelationID: input.correlationId || callId,
      CommCall_SourceProviderCode: input.provider,
      CommCall_ProviderCallID: input.providerCallId,
      CommCall_DirectionCode: input.direction,
      CommCall_StatusCode: callWorkflowStatus(
        input.outcome ?? "unknown",
        input.endedAt ?? null,
      ),
      CommCall_FromNumber: input.fromNumber || null,
      CommCall_ToNumber: input.toNumber || null,
      CommCall_StartedAt: input.startedAt,
      CommCall_AnsweredAt: input.answeredAt ?? null,
      CommCall_EndedAt: input.endedAt ?? null,
      CommCall_DurationSeconds: duration(
        input.startedAt,
        input.endedAt ?? null,
      ),
      CommCall_OutcomeCode: input.outcome ?? "unknown",
      CommCall_Outcome: input.outcome ?? "unknown",
      CommCall_TransferStatusCode: input.transferStatus ?? "not_requested",
      CommCall_TranscriptStatusCode: input.transcriptStatus ?? "pending",
      CommCall_MatchStatusCode: "unmatched",
      CommCall_RetentionUntil: new Date(
        Date.now() + retentionDays * 24 * 60 * 60_000,
      )
        .toISOString(),
      CommCall_MetadataJSON: {
        correlationState: input.correlationMethod === "ambiguous"
          ? "review"
          : "exact",
        retentionPolicy: {
          source: "PHONE_CALLS_RETENTION_DAYS",
          days: retentionDays,
          configurationRequired: true,
        },
      },
    });
    if (error) throw error;
    const review = await admin.from("CRM_CallReviews").upsert({
      CRMCallReview_CommCallID: callId,
      CRMCallReview_CompanyID: input.companyId,
    }, { onConflict: "CRMCallReview_CommCallID" });
    if (review.error) throw review.error;
  }

  const legValues = {
    CommCallLeg_CompanyID: input.companyId,
    CommCallLeg_CallID: callId,
    CommCallLeg_ProviderCode: input.provider,
    CommCallLeg_ProviderCallID: input.providerCallId,
    CommCallLeg_ParentProviderCallID: input.parentProviderCallId ||
      existingLeg?.CommCallLeg_ParentProviderCallID || null,
    CommCallLeg_ProviderConversationID: input.providerConversationId ||
      existingLeg?.CommCallLeg_ProviderConversationID || null,
    CommCallLeg_ProviderHistoryID: input.providerHistoryId ||
      existingLeg?.CommCallLeg_ProviderHistoryID || null,
    CommCallLeg_ProviderSegmentID: input.providerSegmentId ||
      existingLeg?.CommCallLeg_ProviderSegmentID || null,
    CommCallLeg_ProviderConferenceID: input.providerConferenceId ||
      existingLeg?.CommCallLeg_ProviderConferenceID || null,
    CommCallLeg_LegTypeCode: input.legType,
    CommCallLeg_DirectionCode: input.direction,
    CommCallLeg_StatusCode: input.endedAt || existingLeg?.CommCallLeg_EndedAt
      ? "completed"
      : text(existingLeg?.CommCallLeg_StatusCode, 40) || "in_progress",
    CommCallLeg_OutcomeCode: input.outcome && input.outcome !== "unknown"
      ? input.outcome
      : text(existingLeg?.CommCallLeg_OutcomeCode, 40) || "unknown",
    CommCallLeg_FromNumber: input.fromNumber ||
      existingLeg?.CommCallLeg_FromNumber || null,
    CommCallLeg_ToNumber: input.toNumber || existingLeg?.CommCallLeg_ToNumber ||
      null,
    CommCallLeg_StartedAt: earliestTimestamp(
      existingLeg?.CommCallLeg_StartedAt,
      input.startedAt,
    ),
    CommCallLeg_AnsweredAt: earliestTimestamp(
      existingLeg?.CommCallLeg_AnsweredAt,
      input.answeredAt,
    ),
    CommCallLeg_EndedAt: latestTimestamp(
      existingLeg?.CommCallLeg_EndedAt,
      input.endedAt,
    ),
    CommCallLeg_TranscriptStatusCode: strongerTranscriptStatus(
      existingLeg?.CommCallLeg_TranscriptStatusCode,
      input.transcriptStatus,
    ),
    CommCallLeg_SortOrder: input.legType === "receptionist"
      ? 10
      : input.legType === "employee"
      ? 30
      : 20,
    CommCallLeg_CorrelationMethodCode: input.correlationMethod ?? "provider_id",
    CommCallLeg_CorrelationConfidence: input.correlationConfidence ?? 1,
    CommCallLeg_CorrelationEvidenceJSON: input.correlationEvidence ?? {},
  };
  const leg = await admin.from("Comm_CallProviderLegs").upsert(legValues, {
    onConflict:
      "CommCallLeg_CompanyID,CommCallLeg_ProviderCode,CommCallLeg_ProviderCallID",
  }).select("*").single();
  if (leg.error) throw leg.error;
  const externalPhone = input.direction === "inbound"
    ? input.fromNumber
    : input.toNumber;
  const participantValues: Json[] = [];
  // The external caller spans provider legs. Use one call-scoped identity instead
  // of manufacturing a new "Caller" for every carrier, receptionist and staff leg.
  if (
    input.legType === "carrier" || input.provider === "elevenlabs" ||
    input.legType === "employee"
  ) {
    participantValues.push({
      CommCallParticipant_CompanyID: input.companyId,
      CommCallParticipant_CallID: callId,
      CommCallParticipant_LegID: leg.data.CommCallLeg_ID,
      CommCallParticipant_ProviderParticipantID: `${callId}:caller`,
      CommCallParticipant_TypeCode: "caller",
      CommCallParticipant_RoleCode: "external",
      CommCallParticipant_DisplayName: "Caller",
      CommCallParticipant_Phone: externalPhone || null,
      CommCallParticipant_NormalizedPhone: externalPhone || null,
      CommCallParticipant_JoinedAt: input.startedAt,
      CommCallParticipant_LeftAt: input.endedAt ?? null,
    });
  }
  if (input.legType === "receptionist" || input.legType === "employee") {
    participantValues.push({
      CommCallParticipant_CompanyID: input.companyId,
      CommCallParticipant_CallID: callId,
      CommCallParticipant_LegID: leg.data.CommCallLeg_ID,
      CommCallParticipant_ProviderParticipantID:
        `${input.providerCallId}:${input.legType}`,
      CommCallParticipant_TypeCode: input.legType,
      CommCallParticipant_RoleCode: input.legType === "receptionist"
        ? "ai_receptionist"
        : "jenkar_employee",
      CommCallParticipant_DisplayName: input.legType === "receptionist"
        ? "Jenkar receptionist"
        : "Jenkar team",
      CommCallParticipant_JoinedAt: input.answeredAt ?? input.startedAt,
      CommCallParticipant_LeftAt: input.endedAt ?? null,
    });
  }
  if (participantValues.length) {
    const participants = await admin.from("Comm_CallParticipants").upsert(
      participantValues,
      {
        onConflict:
          "CommCallParticipant_CompanyID,CommCallParticipant_ProviderParticipantID,CommCallParticipant_TypeCode",
        ignoreDuplicates: true,
      },
    );
    if (participants.error) throw participants.error;
  }
  return { callId, leg: leg.data as Json };
}

function duration(start: string | null, end: string | null) {
  if (!start || !end) return null;
  const seconds = Math.round(
    (new Date(end).getTime() - new Date(start).getTime()) / 1000,
  );
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

function dateFilter(
  value: string | null,
  endOfDay = false,
  timeZone = "Europe/London",
) {
  const candidate = text(value, 80);
  if (/^\d{4}-\d{2}-\d{2}$/.test(candidate)) {
    return localDateBoundary(candidate, timeZone, endOfDay);
  }
  return parseDate(candidate);
}

function reportingTimeZone(url: URL) {
  const value = text(url.searchParams.get("timezone"), 80) || "Europe/London";
  if (!dateKeyInTimeZone(new Date().toISOString(), value)) {
    throw new PhoneCallInputError(400, "Choose a valid reporting timezone.");
  }
  return value;
}

async function writeTranscript(
  admin: SupabaseClient,
  callId: string,
  leg: Json,
  eventId: string,
  provider: "elevenlabs" | "3cx",
  segments: UnifiedTranscriptSegment[],
) {
  if (!segments.length) return;
  const legId = String(leg.CommCallLeg_ID);
  const sortBase = Number(leg.CommCallLeg_SortOrder ?? 10) * 10_000;
  const values = segments.map((segment) => ({
    CommCallSeg_CallID: callId,
    CommCallSeg_SequenceNo: sortBase + segment.sourceSequence,
    CommCallSeg_SpeakerLabel: segment.speakerLabel,
    CommCallSeg_SpeakerType: segment.speakerType,
    CommCallSeg_StartSeconds: segment.startSeconds,
    CommCallSeg_EndSeconds: segment.endSeconds,
    CommCallSeg_Text: segment.text,
    CommCallSeg_ProviderMetadataJSON: segment.metadata,
    CommCallSeg_SourceProviderCode: provider,
    CommCallSeg_SourceLegID: legId,
    CommCallSeg_ProviderSegmentID: segment.providerSegmentId,
    CommCallSeg_SourceSequenceNo: segment.sourceSequence,
    CommCallSeg_StartedAt: segment.startedAt,
    CommCallSeg_EndedAt: segment.endedAt,
    CommCallSeg_StateCode: segment.state,
    CommCallSeg_RawEventID: eventId,
  }));
  const inserted = await admin.from("Comm_CallTranscriptSegments").upsert(
    values,
    {
      onConflict: "CommCallSeg_SourceLegID,CommCallSeg_ProviderSegmentID",
      // A reconciliation pass may upgrade a processing/partial turn with the
      // provider's final text and timing. Stable provider segment IDs make the
      // update idempotent without freezing weaker first-seen evidence.
      ignoreDuplicates: false,
    },
  );
  if (inserted.error) throw inserted.error;
  const all = await admin.from("Comm_CallTranscriptSegments")
    .select("CommCallSeg_SpeakerLabel, CommCallSeg_Text")
    .eq("CommCallSeg_CallID", callId)
    .order("CommCallSeg_StartedAt", { ascending: true, nullsFirst: false })
    .order("CommCallSeg_SequenceNo", { ascending: true });
  if (all.error) throw all.error;
  const transcriptText = (all.data ?? []).map((row) =>
    `${row.CommCallSeg_SpeakerLabel || "Participant"}: ${row.CommCallSeg_Text}`
  ).join("\n");
  const update = await admin.from("Comm_CallLogs").update({
    CommCall_TranscriptText: transcriptText,
  }).eq("CommCall_ID", callId);
  if (update.error) throw update.error;
}

async function refreshTranscriptRollup(
  admin: SupabaseClient,
  callId: string,
) {
  const [legs, segments] = await Promise.all([
    admin.from("Comm_CallProviderLegs").select(
      "CommCallLeg_LegTypeCode, CommCallLeg_TranscriptStatusCode",
    ).eq("CommCallLeg_CallID", callId),
    admin.from("Comm_CallTranscriptSegments").select(
      "CommCallSeg_SourceProviderCode, CommCallSeg_StateCode",
    ).eq("CommCallSeg_CallID", callId),
  ]);
  if (legs.error) throw legs.error;
  if (segments.error) throw segments.error;
  const status = resolveTranscriptRollup(
    (legs.data ?? []).map((leg) => ({
      legType: String(leg.CommCallLeg_LegTypeCode ?? "unknown"),
      transcriptStatus: String(
        leg.CommCallLeg_TranscriptStatusCode ?? "pending",
      ),
    })),
    (segments.data ?? []).map((segment) => ({
      provider: String(
        segment.CommCallSeg_SourceProviderCode ?? "unknown",
      ),
      state: String(segment.CommCallSeg_StateCode ?? "complete"),
    })),
  );
  const update = await admin.from("Comm_CallLogs").update({
    CommCall_TranscriptStatusCode: status,
    CommCall_UpdatedAt: new Date().toISOString(),
  }).eq("CommCall_ID", callId);
  if (update.error) throw update.error;
  return status;
}

function elevenData(payload: Json) {
  return isObject(payload.data) ? payload.data : payload;
}

function elevenDynamicVariables(data: Json) {
  const initiation = isObject(data.conversation_initiation_client_data)
    ? data.conversation_initiation_client_data
    : {};
  return isObject(initiation.dynamic_variables)
    ? initiation.dynamic_variables
    : isObject(data.dynamic_variables)
    ? data.dynamic_variables
    : {};
}

function explicitFact(
  value: unknown,
  allowed: readonly string[],
): string {
  if (typeof value !== "string") return "unknown";
  const normalized = value.trim().toLowerCase();
  return allowed.includes(normalized) ? normalized : "unknown";
}

function explicitConsentEvidence(values: Json): ConsentEvidence | null {
  // These names form Multideck's explicit signed-payload contract. Do not infer
  // consent from transcript text, a provider recording ID, or generic booleans.
  const disclosureField = "multideck_ai_disclosure_status";
  const recordingField = "multideck_recording_consent_status";
  const transcriptionField = "multideck_transcription_consent_status";
  const versionField = "multideck_consent_disclosure_version";
  const disclosedAtField = "multideck_consent_disclosed_at";
  const aiDisclosureStatus = explicitFact(values[disclosureField], [
    "disclosed",
    "not_required",
  ]) as ConsentEvidence["aiDisclosureStatus"];
  const recordingConsentStatus = explicitFact(values[recordingField], [
    "not_required",
    "received",
    "declined",
  ]) as ConsentEvidence["recordingConsentStatus"];
  const transcriptionConsentStatus = explicitFact(
    values[transcriptionField],
    ["not_required", "received", "declined"],
  ) as ConsentEvidence["transcriptionConsentStatus"];
  const disclosureVersion = text(values[versionField], 80) || null;
  const disclosedAt = parseDate(values[disclosedAtField]);
  const sourceFields = [
    aiDisclosureStatus !== "unknown" ? disclosureField : "",
    recordingConsentStatus !== "unknown" ? recordingField : "",
    transcriptionConsentStatus !== "unknown" ? transcriptionField : "",
    disclosureVersion ? versionField : "",
    disclosedAt ? disclosedAtField : "",
  ].filter(Boolean);
  if (!sourceFields.length) return null;
  return {
    aiDisclosureStatus,
    recordingConsentStatus,
    transcriptionConsentStatus,
    disclosureVersion,
    disclosedAt,
    sourceFields,
  };
}

async function persistConsentEvidence(
  admin: SupabaseClient,
  companyId: string,
  callId: string,
  eventId: string,
  provider: "elevenlabs" | "twilio" | "3cx",
  evidence: ConsentEvidence | null,
) {
  if (!evidence) return;
  const result = await admin.rpc(
    "multideck_phone_call_record_consent_evidence",
    {
      p_company_id: companyId,
      p_call_id: callId,
      p_raw_event_id: eventId,
      p_provider_code: provider,
      p_ai_disclosure_status: evidence.aiDisclosureStatus,
      p_recording_consent_status: evidence.recordingConsentStatus,
      p_transcription_consent_status: evidence.transcriptionConsentStatus,
      p_disclosure_version: evidence.disclosureVersion,
      p_disclosed_at: evidence.disclosedAt,
      p_source_fields: evidence.sourceFields,
    },
  );
  if (result.error) throw result.error;
}

function analysisField(analysis: Json, names: string[]) {
  const collected = isObject(analysis.data_collection_results)
    ? analysis.data_collection_results
    : {};
  for (const name of names) {
    const value = collected[name];
    if (isObject(value)) {
      const extracted = normalizeCapturedAnalysisValue(
        value.value ?? value.result,
      );
      if (extracted) return extracted;
    }
    const direct = normalizeCapturedAnalysisValue(value ?? analysis[name]);
    if (direct) return direct;
  }
  return "";
}

async function updateReviewFromElevenLabs(
  admin: SupabaseClient,
  callId: string,
  payload: Json,
) {
  const data = elevenData(payload);
  const analysis = isObject(data.analysis) ? data.analysis : {};
  const name = analysisField(analysis, ["caller_name", "name", "full_name"]);
  const company = analysisField(analysis, [
    "company",
    "company_name",
    "organisation",
  ]);
  const reason = analysisField(analysis, [
    "call_reason",
    "reason",
    "regarding",
  ]);
  const review = await admin.from("CRM_CallReviews").select(
    "CRMCallReview_ID",
  ).eq("CRMCallReview_CommCallID", callId).single();
  if (review.error) throw review.error;
  const captured: Json = {};
  if (name) captured.CRMCallReview_CapturedCallerName = name;
  if (company) captured.CRMCallReview_CapturedCompanyName = company;
  if (reason) captured.CRMCallReview_CallReason = reason;
  if (Object.keys(captured).length) {
    const updated = await admin.from("CRM_CallReviews").update(captured).eq(
      "CRMCallReview_ID",
      review.data.CRMCallReview_ID,
    );
    if (updated.error) throw updated.error;
  }
  if (name) {
    const updated = await admin.from("Comm_CallLogs").update({
      CommCall_FromDisplayNameSnapshot: name,
    }).eq("CommCall_ID", callId);
    if (updated.error) throw updated.error;
  }
}

async function refreshCombinedTranscriptInsights(
  admin: SupabaseClient,
  callId: string,
  transcriptStatus: ReturnType<typeof resolveTranscriptRollup>,
) {
  const [review, segments] = await Promise.all([
    admin.from("CRM_CallReviews").select(
      "CRMCallReview_ID, CRMCallReview_CapturedCallerName, CRMCallReview_MetadataJSON",
    ).eq("CRMCallReview_CommCallID", callId).single(),
    admin.from("Comm_CallTranscriptSegments").select(
      "CommCallSeg_ID, CommCallSeg_SourceProviderCode, CommCallSeg_SequenceNo, CommCallSeg_SpeakerLabel, CommCallSeg_SpeakerType, CommCallSeg_StartedAt, CommCallSeg_Text, CommCallSeg_StateCode",
    ).eq("CommCallSeg_CallID", callId).order("CommCallSeg_StartedAt", {
      ascending: true,
      nullsFirst: false,
    }).order("CommCallSeg_SequenceNo", { ascending: true }).limit(501),
  ]);
  if (review.error) throw review.error;
  if (segments.error) throw segments.error;
  const transcriptTruncated = (segments.data ?? []).length > 500;
  const boundedSegments = (segments.data ?? []).slice(0, 500);
  const effectiveStatus = transcriptTruncated ? "partial" : transcriptStatus;
  const insights = deriveCombinedTranscriptInsights(
    boundedSegments.map((segment) => ({
      id: String(segment.CommCallSeg_ID),
      provider: segment.CommCallSeg_SourceProviderCode === "3cx"
        ? "3cx" as const
        : "elevenlabs" as const,
      globalSequence: Number(segment.CommCallSeg_SequenceNo ?? 0),
      speakerLabel: text(segment.CommCallSeg_SpeakerLabel, 120) ||
        "Participant",
      speakerType: ["caller", "receptionist", "employee"].includes(
          String(segment.CommCallSeg_SpeakerType),
        )
        ? segment.CommCallSeg_SpeakerType as
          | "caller"
          | "receptionist"
          | "employee"
        : "external" as const,
      startedAt: parseDate(segment.CommCallSeg_StartedAt),
      text: text(segment.CommCallSeg_Text, 20_000),
      state: ["processing", "failed"].includes(
          String(segment.CommCallSeg_StateCode),
        )
        ? segment.CommCallSeg_StateCode as "processing" | "failed"
        : "complete" as const,
    })),
    effectiveStatus,
    text(review.data.CRMCallReview_CapturedCallerName, 180),
  );
  if (!insights.summary) return;
  const currentMetadata = isObject(review.data.CRMCallReview_MetadataJSON)
    ? review.data.CRMCallReview_MetadataJSON
    : {};
  const analysisMetadata = {
    version: 1,
    scope: "combined_chronological_transcript",
    transcriptStatus: effectiveStatus,
    providers: insights.providers,
    segmentCount: insights.segmentCount,
    transcriptTruncated,
    generatedAt: new Date().toISOString(),
  };
  const reviewUpdate = await admin.from("CRM_CallReviews").update({
    CRMCallReview_AISummary: insights.summary,
    CRMCallReview_MetadataJSON: {
      ...currentMetadata,
      combinedTranscriptAnalysis: analysisMetadata,
    },
  }).eq("CRMCallReview_ID", review.data.CRMCallReview_ID);
  if (reviewUpdate.error) throw reviewUpdate.error;
  const callUpdate = await admin.from("Comm_CallLogs").update({
    CommCall_AISummary: insights.summary,
  }).eq("CommCall_ID", callId);
  if (callUpdate.error) throw callUpdate.error;

  for (const suggestion of insights.suggestions) {
    const existing = await admin.from("CRM_CallActionCandidates").select(
      "CRMCallAction_ID, CRMCallAction_DecisionStatus",
    ).eq("CRMCallAction_CallReviewID", review.data.CRMCallReview_ID).eq(
      "CRMCallAction_SourceKey",
      suggestion.sourceKey,
    ).maybeSingle();
    if (existing.error) throw existing.error;
    const values = {
      CRMCallAction_CallReviewID: review.data.CRMCallReview_ID,
      CRMCallAction_SourceKey: suggestion.sourceKey,
      CRMCallAction_ActionTypeCode: "create_todo",
      CRMCallAction_Title: suggestion.title,
      CRMCallAction_Description: suggestion.reason,
      CRMCallAction_ConfidenceScore: suggestion.confidence,
      CRMCallAction_ActionPayloadJSON: {
        evidence: "transcript",
        scope: "combined_chronological_transcript",
        segmentIds: suggestion.evidenceSegmentIds,
        providers: suggestion.evidenceProviders,
      },
      CRMCallAction_MetadataJSON: {
        generated: true,
        requiresReview: true,
        analysisScope: "combined_chronological_transcript",
        transcriptStatus: effectiveStatus,
        transcriptTruncated,
      },
    };
    if (!existing.data) {
      const inserted = await admin.from("CRM_CallActionCandidates").insert(
        values,
      );
      if (inserted.error) throw inserted.error;
    } else if (existing.data.CRMCallAction_DecisionStatus === "pending") {
      const updated = await admin.from("CRM_CallActionCandidates").update(
        values,
      ).eq("CRMCallAction_ID", existing.data.CRMCallAction_ID).eq(
        "CRMCallAction_DecisionStatus",
        "pending",
      );
      if (updated.error) throw updated.error;
    }
  }
}

async function handlePersonalization(request: Request, parts: string[]) {
  const expected = secret("ELEVENLABS_PERSONALIZATION_SECRET");
  const supplied = request.headers.get("x-multideck-webhook-secret")?.trim() ||
    decodeURIComponent(parts[3] ?? "");
  if (!constantTimeEqual(supplied, expected)) {
    throw new HttpError(401, "Webhook verification failed.");
  }
  const raw = await readBoundedBody(request);
  const payload = parseJson(raw);
  const companyId = configuredCompanyId();
  const admin = adminClient();
  const callSid = firstText(payload, [
    "call_sid",
    "callSid",
    "call_id",
    "callId",
    "system__call_sid",
  ], 300);
  if (!callSid) {
    throw new PhoneCallInputError(400, "Twilio CallSid is required.");
  }
  const callerPhone = normalizePhone(payload.caller_id ?? payload.callerId);
  let knownCallerName = "";
  let knownCompanyName = "";
  if (callerPhone) {
    const previous = await admin.from("Comm_CallLogs").select(
      "CommCall_FromDisplayNameSnapshot, CommCall_MatchedOrgID",
    ).eq("CommCall_CompanyID", companyId).eq(
      "CommCall_FromNumber",
      callerPhone,
    ).eq("CommCall_MatchStatusCode", "matched").order("CommCall_StartedAt", {
      ascending: false,
      nullsFirst: false,
    }).limit(1).maybeSingle();
    if (previous.error) throw previous.error;
    knownCallerName = text(
      previous.data?.CommCall_FromDisplayNameSnapshot,
      180,
    );
    if (previous.data?.CommCall_MatchedOrgID) {
      const company = await admin.from("Org_Master").select("Org_Name").eq(
        "Org_id",
        previous.data.CommCall_MatchedOrgID,
      ).maybeSingle();
      if (company.error) throw company.error;
      knownCompanyName = text(company.data?.Org_Name, 240);
    }
  }
  const existing = await findLeg(admin, companyId, "twilio", [callSid]);
  let callId = existing ? String(existing.CommCallLeg_CallID) : "";
  if (!callId) {
    const created = await createCall(admin, {
      companyId,
      provider: "twilio",
      providerCallId: callSid,
      legType: "carrier",
      direction: "inbound",
      fromNumber: callerPhone,
      toNumber: normalizePhone(payload.called_number ?? payload.calledNumber),
      startedAt: new Date().toISOString(),
      transcriptStatus: "pending",
    });
    callId = created.callId;
  }
  const payloadHash = await sha256(raw);
  const delivery = await recordEvent(admin, {
    companyId,
    provider: "elevenlabs",
    eventId: `personalization:${callSid}`,
    eventType: "conversation_initiation",
    objectId: callSid,
    payloadHash,
    signatureVerified: true,
    payload,
  });
  await finishEvent(admin, delivery.event.CommCallEvent_ID, "complete");
  return providerResponse({
    type: "conversation_initiation_client_data",
    dynamic_variables: {
      multideck_call_id: callId,
      twilio_call_sid: callSid,
      caller_phone: callerPhone,
      reviewed_caller_name: knownCallerName,
      reviewed_company_name: knownCompanyName,
      reviewed_identity_available: Boolean(
        knownCallerName || knownCompanyName,
      ),
    },
  });
}

async function handleElevenLabsPostCall(request: Request) {
  const raw = await readBoundedBody(request);
  const bodyText = new TextDecoder().decode(raw);
  const verified = await verifyElevenLabsSignature(
    bodyText,
    request.headers.get("elevenlabs-signature") ?? "",
    secret("ELEVENLABS_WEBHOOK_SECRET"),
  );
  if (!verified) throw new HttpError(401, "Webhook verification failed.");
  const payload = parseJson(raw);
  return providerResponse(
    await ingestElevenLabsPayload(payload, raw, "elevenlabs_webhook"),
  );
}

async function ingestElevenLabsPayload(
  payload: Json,
  raw: Uint8Array | string,
  verification:
    | "elevenlabs_webhook"
    | "elevenlabs_api_key"
    | "stored_verified_event",
  replay?: { eventId: string; leaseToken: string },
) {
  const data = elevenData(payload);
  const companyId = configuredCompanyId();
  const conversationId = firstText(data, ["conversation_id"], 300);
  if (!conversationId) {
    throw new PhoneCallInputError(
      400,
      "ElevenLabs conversation ID is required.",
    );
  }
  const eventType = firstText(payload, ["type", "event_type"], 120) ||
    "post_call_transcription";
  const payloadHash = await sha256(raw);
  const admin = adminClient();
  const delivery = replay
    ? {
      event: {
        CommCallEvent_ID: replay.eventId,
        CommCallEvent_StatusCode: "processing",
        CommCallEvent_AttemptCount: 0,
      } as StoredEvent,
      duplicate: true,
    }
    : await recordEvent(admin, {
      companyId,
      provider: "elevenlabs",
      eventId: firstText(payload, ["event_id"], 300) ||
        `${eventType}:${conversationId}:${payloadHash.slice(0, 16)}`,
      eventType,
      objectId: conversationId,
      payloadHash,
      signatureVerified: true,
      payload,
      metadata: { verification },
    });
  const retryLease = replay
    ? { companyId, leaseToken: replay.leaseToken }
    : undefined;
  if (
    delivery.duplicate && delivery.event.CommCallEvent_StatusCode === "complete"
  ) return { ok: true, duplicate: true };
  try {
    const variables = elevenDynamicVariables(data);
    const callIdFromProvider = uuid(variables.multideck_call_id);
    const screeningId = uuid(variables.sip_screening_id);
    const callSid = firstText(variables, [
      "system__call_sid",
      "sip_call_id",
      "twilio_call_sid",
      "call_sid",
    ], 300);
    const existingEleven = await findLeg(admin, companyId, "elevenlabs", [
      conversationId,
    ]);
    const screeningCallId = callIdFromProvider
      ? ""
      : await findCallByCorrelation(admin, companyId, screeningId);
    const twilioLeg = callIdFromProvider
      ? null
      : await findLeg(admin, companyId, "twilio", [callSid]);
    let callId = callIdFromProvider ||
      String(
        existingEleven?.CommCallLeg_CallID || screeningCallId ||
          twilioLeg?.CommCallLeg_CallID || "",
      );
    if (callIdFromProvider) {
      const callExists = await admin.from("Comm_CallLogs").select("CommCall_ID")
        .eq("CommCall_ID", callIdFromProvider).eq(
          "CommCall_CompanyID",
          companyId,
        ).maybeSingle();
      if (callExists.error) throw callExists.error;
      if (!callExists.data) callId = "";
    }
    const startedAt = parseDate(
      (isObject(data.metadata) ? data.metadata.start_time_unix_secs : null) ??
        data.started_at,
    ) ?? new Date().toISOString();
    const parsedTranscript = parseElevenLabsTranscript(payload, startedAt);
    const providerConversationState = firstText(data, ["status"], 40)
      .toLowerCase();
    const explicitTranscriptState = firstText(payload, [
      "transcript_state",
    ], 40).toLowerCase();
    const transcriptStatus = explicitTranscriptState === "complete" ||
        eventType.includes("transcription")
      ? "complete"
      : explicitTranscriptState === "partial"
      ? "partial"
      : providerConversationState === "failed" || eventType.includes("failure")
      ? "failed"
      : explicitTranscriptState === "processing"
      ? "processing"
      : "pending";
    const transcript = parsedTranscript.map((segment) => ({
      ...segment,
      state: transcriptStatus === "processing"
        ? "processing" as const
        : transcriptStatus === "failed"
        ? "failed" as const
        : "complete" as const,
    }));
    const endedAt = parseDate(data.reconciliation_ended_at) ??
      transcript.at(-1)?.endedAt ?? transcript.at(-1)?.startedAt ?? null;
    const legResult = await createCall(admin, {
      companyId,
      provider: "elevenlabs",
      providerCallId: conversationId,
      providerConversationId: conversationId,
      parentProviderCallId: callSid,
      legType: "receptionist",
      direction: "inbound",
      fromNumber: normalizePhone(
        variables.caller_phone ?? variables.system__caller_id,
      ),
      toNumber: normalizePhone(
        variables.called_number ?? variables.system__called_number,
      ),
      startedAt,
      endedAt,
      outcome: providerConversationState === "failed" ||
          eventType.includes("failure")
        ? "failed"
        : "answered",
      transcriptStatus,
      correlationMethod: callIdFromProvider
        ? "multideck_call_id"
        : screeningCallId
        ? "sip_screening_id"
        : twilioLeg
        ? "sip_call_id"
        : screeningId
        ? "pending_screening_id"
        : "unmatched_provider_event",
      correlationConfidence: callId ? 1 : 0,
      correlationId: screeningId || undefined,
      correlationEvidence: {
        screeningId: screeningId || null,
        sipCallId: callSid || null,
      },
      attachToCallId: callId || undefined,
    });
    await persistConsentEvidence(
      admin,
      companyId,
      legResult.callId,
      delivery.event.CommCallEvent_ID,
      "elevenlabs",
      explicitConsentEvidence(variables),
    );
    await writeTranscript(
      admin,
      legResult.callId,
      legResult.leg,
      delivery.event.CommCallEvent_ID,
      "elevenlabs",
      transcript,
    );
    if (transcriptStatus === "complete") {
      await updateReviewFromElevenLabs(
        admin,
        legResult.callId,
        payload,
      );
    }
    const rollupStatus = await refreshTranscriptRollup(
      admin,
      legResult.callId,
    );
    await refreshCombinedTranscriptInsights(
      admin,
      legResult.callId,
      rollupStatus,
    );
    await finishEvent(
      admin,
      delivery.event.CommCallEvent_ID,
      transcriptStatus === "complete" ? "complete" : "partial",
      undefined,
      retryLease,
    );
    return {
      ok: true,
      callId: legResult.callId,
      duplicate: delivery.duplicate,
    };
  } catch (error) {
    await finishEvent(
      admin,
      delivery.event.CommCallEvent_ID,
      "retryable",
      error,
      retryLease,
    );
    throw error;
  }
}

function reconciliationPayload(result: ElevenLabsReconciliationResult) {
  const envelope = result.ingestionEnvelope;
  if (envelope) {
    return {
      ...envelope,
      data: {
        ...envelope.data,
        reconciliation_ended_at: result.endedAt,
      },
    } as Json;
  }
  if (
    result.transcriptTurns < 1 &&
    result.conversationState !== "failed"
  ) return null;
  return {
    event_id: result.eventId,
    event_type: "conversation_reconciliation",
    source_provider: "elevenlabs",
    source_conversation_id: result.conversationId,
    verification: "elevenlabs_api_key",
    transcript_state: result.transcriptState,
    data: {
      ...result.detail,
      reconciliation_source: "get_conversation_api",
      reconciliation_ended_at: result.endedAt,
      transcript_scope: "elevenlabs_conversation_only",
      includes_employee_transcript: false,
    },
  } as Json;
}

function elevenLabsPendingConversationIds(checkpoint: Json) {
  const value = checkpoint.pendingConversationIds;
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 150) {
    throw new Error("ElevenLabs discovery checkpoint is invalid.");
  }
  const ids = value.map((candidate) => text(candidate, 240));
  if (ids.some((candidate) => !isSafeElevenLabsConversationId(candidate))) {
    throw new Error("ElevenLabs discovery checkpoint is invalid.");
  }
  return [...new Set(ids)];
}

async function updateElevenLabsReconciliationState(
  admin: SupabaseClient,
  leg: Json,
  result: ElevenLabsReconciliationResult,
) {
  const currentMetrics = isObject(leg.CommCallLeg_ProviderMetricsJSON)
    ? leg.CommCallLeg_ProviderMetricsJSON
    : {};
  const update = await admin.from("Comm_CallProviderLegs").update({
    CommCallLeg_StatusCode: result.providerStatus ||
      text(leg.CommCallLeg_StatusCode, 40) || "unknown",
    CommCallLeg_StartedAt: earliestTimestamp(
      leg.CommCallLeg_StartedAt,
      result.startedAt,
    ),
    CommCallLeg_EndedAt: latestTimestamp(
      leg.CommCallLeg_EndedAt,
      result.endedAt,
    ),
    CommCallLeg_TranscriptStatusCode: strongerTranscriptStatus(
      leg.CommCallLeg_TranscriptStatusCode,
      result.transcriptState,
    ),
    CommCallLeg_ProviderMetricsJSON: {
      ...currentMetrics,
      reconciliationSource: "get_conversation_api",
      providerStatus: result.providerStatus,
      transcriptState: result.transcriptState,
      transcriptTurns: result.transcriptTurns,
      transcriptCharacters: result.transcriptCharacters,
      transcriptTruncated: result.transcriptTruncated,
      transcriptScope: result.transcriptScope,
      includesEmployeeTranscript: false,
      transferBoundaryEvidence: result.transferBoundaryEvidence,
      reconciledAt: new Date().toISOString(),
    },
    CommCallLeg_UpdatedAt: new Date().toISOString(),
  }).eq("CommCallLeg_ID", leg.CommCallLeg_ID).eq(
    "CommCallLeg_CompanyID",
    leg.CommCallLeg_CompanyID,
  );
  if (update.error) throw update.error;
  await refreshTranscriptRollup(admin, String(leg.CommCallLeg_CallID));
}

async function handleElevenLabsSync(request: Request) {
  const expected = secret("PHONE_CALLS_WORKER_SECRET");
  const supplied = request.headers.get("x-multideck-worker-secret")?.trim() ??
    "";
  if (!constantTimeEqual(supplied, expected)) {
    throw new HttpError(401, "Worker verification failed.");
  }
  const apiKey = secret("ELEVENLABS_API_KEY");
  const agentId = secret("ELEVENLABS_AGENT_ID");
  const companyId = configuredCompanyId();
  const admin = adminClient();
  const sourceKey = "conversation-reconciliation";
  const claimed = await admin.rpc(
    "multideck_phone_call_provider_sync_claim",
    {
      p_company_id: companyId,
      p_provider_code: "elevenlabs",
      p_source_key: sourceKey,
      p_lease_seconds: 300,
    },
  );
  if (claimed.error) throw claimed.error;
  const lease = isObject(claimed.data) ? claimed.data : {};
  if (lease.claimed !== true) {
    return providerResponse({
      ok: true,
      busy: true,
      retryAt: parseDate(lease.retryAt),
    }, 202);
  }
  const leaseToken = uuid(lease.leaseToken);
  if (!leaseToken) {
    throw new Error("Provider sync lease did not return a token.");
  }
  const requestedLimit = Number(new URL(request.url).searchParams.get("limit"));
  const limit = Number.isSafeInteger(requestedLimit) && requestedLimit > 0
    ? Math.min(requestedLimit, 50)
    : 50;

  try {
    const checkpoint = isObject(lease.checkpoint) ? lease.checkpoint : {};
    const runStartedAt = new Date();
    const runStartedUnixSeconds = Math.floor(runStartedAt.getTime() / 1_000);
    const previousThroughAt = parseDate(
      checkpoint.discoveryThroughAt ?? checkpoint.lastRunAt,
    );
    const previousThroughUnixSeconds = previousThroughAt
      ? Math.min(
        runStartedUnixSeconds,
        Math.floor(new Date(previousThroughAt).getTime() / 1_000),
      )
      : runStartedUnixSeconds - 10 * 60;
    const discoveryWindowStart = Math.max(
      0,
      Math.min(
        runStartedUnixSeconds - 1,
        previousThroughUnixSeconds - 5 * 60,
      ),
    );
    const discovery = await discoverElevenLabsConversations({
      apiKey,
      agentId,
      windowStartUnixSeconds: discoveryWindowStart,
      windowEndUnixSeconds: runStartedUnixSeconds,
      maxConversations: 100,
      maxPages: 3,
    });
    const pending = await admin.from("Comm_CallProviderLegs").select(
      "CommCallLeg_ID, CommCallLeg_CompanyID, CommCallLeg_CallID, CommCallLeg_ProviderConversationID, CommCallLeg_StatusCode, CommCallLeg_StartedAt, CommCallLeg_EndedAt, CommCallLeg_TranscriptStatusCode, CommCallLeg_ProviderMetricsJSON",
    ).eq("CommCallLeg_CompanyID", companyId).eq(
      "CommCallLeg_ProviderCode",
      "elevenlabs",
    ).in("CommCallLeg_TranscriptStatusCode", [
      "pending",
      "processing",
      "partial",
    ]).not("CommCallLeg_ProviderConversationID", "is", null).order(
      "CommCallLeg_UpdatedAt",
      { ascending: true },
    ).limit(limit);
    if (pending.error) throw pending.error;
    const legs = (pending.data ?? []) as Json[];
    const knownConversationIds = [
      ...new Set(
        legs.map((leg) => text(leg.CommCallLeg_ProviderConversationID, 240))
          .filter(Boolean),
      ),
    ];
    const queuedConversationIds = elevenLabsPendingConversationIds(checkpoint);
    const discoveredConversationIds = discovery.conversations.map((item) =>
      item.conversationId
    );
    const allConversationIds = [
      ...new Set([
        ...queuedConversationIds,
        ...knownConversationIds,
        ...discoveredConversationIds,
      ]),
    ];
    const conversationIds = allConversationIds.slice(0, limit);
    const deferredConversationIds = allConversationIds.slice(limit);
    if (deferredConversationIds.length > 150) {
      throw new Error(
        "ElevenLabs discovery exceeded the bounded pending queue.",
      );
    }
    const batch = await reconcileElevenLabsConversations({
      apiKey,
      conversationIds,
      expectedAgentId: agentId,
      maxConversations: limit,
    });
    const results: Json[] = [];
    const pendingConversationIds = new Set(deferredConversationIds);
    for (const result of batch.results) {
      if (!result.ok) {
        if (result.retryable) {
          pendingConversationIds.add(result.conversationId);
        }
        results.push({
          conversationId: result.conversationId,
          status: "failed",
          errorCode: result.errorCode,
          retryable: result.retryable,
        });
        continue;
      }
      if (
        result.conversationState === "processing" ||
        result.conversationState === "unknown"
      ) {
        pendingConversationIds.add(result.conversationId);
      }
      const payload = reconciliationPayload(result);
      if (payload) {
        await ingestElevenLabsPayload(
          payload,
          JSON.stringify(payload),
          "elevenlabs_api_key",
        );
      }
      for (
        const leg of legs.filter((candidate) =>
          text(candidate.CommCallLeg_ProviderConversationID, 240) ===
            result.conversationId
        )
      ) {
        await updateElevenLabsReconciliationState(admin, leg, result);
      }
      results.push({
        conversationId: result.conversationId,
        providerStatus: result.providerStatus,
        transcriptState: result.transcriptState,
        transcriptTurns: result.transcriptTurns,
        transcriptTruncated: result.transcriptTruncated,
      });
    }
    if (pendingConversationIds.size > 150) {
      throw new Error(
        "ElevenLabs discovery exceeded the bounded pending queue.",
      );
    }
    const committed = await admin.rpc(
      "multideck_phone_call_provider_sync_commit",
      {
        p_company_id: companyId,
        p_provider_code: "elevenlabs",
        p_source_key: sourceKey,
        p_lease_token: leaseToken,
        p_checkpoint: {
          lastRunAt: runStartedAt.toISOString(),
          discoveryThroughAt: runStartedAt.toISOString(),
          discoveryWindowStartedAt: new Date(
            discovery.windowStartUnixSeconds * 1_000,
          ).toISOString(),
          discoveryPagesRead: discovery.pagesRead,
          discoveryConversationsFound: discovery.conversations.length,
          discoveryDuplicateCount: discovery.duplicateCount,
          pendingConversationIds: [...pendingConversationIds],
          conversationsRequested: batch.uniqueRequested,
          conversationsSucceeded: batch.succeeded,
          conversationsFailed: batch.failed,
        },
      },
    );
    if (committed.error) throw committed.error;
    return providerResponse({
      ok: batch.failed === 0,
      agentScoped: true,
      discovered: discovery.conversations.length,
      pending: pendingConversationIds.size,
      requested: batch.uniqueRequested,
      succeeded: batch.succeeded,
      failed: batch.failed,
      results,
    }, batch.failed ? 207 : 200);
  } catch (error) {
    const failed = await admin.rpc(
      "multideck_phone_call_provider_sync_fail",
      {
        p_company_id: companyId,
        p_provider_code: "elevenlabs",
        p_source_key: sourceKey,
        p_lease_token: leaseToken,
        p_error_code: "elevenlabs_reconciliation_failed",
        p_error_message: error instanceof Error
          ? error.message.slice(0, 500)
          : "ElevenLabs reconciliation failed.",
      },
    );
    if (failed.error) console.error(failed.error);
    throw error;
  }
}

function twilioOutcome(value: string) {
  const status = value.toLowerCase();
  // Twilio completed means media connected; it does not prove a human answer.
  // The reconciled 3CX record remains authoritative for the CRM outcome.
  if (status === "completed") return "unknown";
  if (status === "busy") return "busy";
  if (status === "no-answer") return "no_answer";
  if (status === "failed") return "failed";
  if (status === "canceled") return "cancelled";
  return "unknown";
}

function jenkarLegType(label: string) {
  const value = label.toLowerCase();
  if (value.includes("agent") || value.includes("receptionist")) {
    return "receptionist" as const;
  }
  if (value.includes("staff") || value.includes("employee")) {
    return "employee" as const;
  }
  if (value.includes("voicemail")) return "voicemail" as const;
  if (value.includes("caller")) return "carrier" as const;
  return "unknown" as const;
}

async function ingestJenkarScreeningPayload(
  payload: Json,
  raw: Uint8Array | string,
  verification:
    | "multideck_worker_secret"
    | "twilio_sync_api"
    | "twilio_signature",
  replay?: { eventId: string; leaseToken: string },
) {
  const conferenceName = firstText(payload, ["conference_name"], 300);
  const screeningId = uuid(payload.screening_id) ||
    uuid(conferenceName.replace(/^jenkar-screening-/, ""));
  if (!screeningId) {
    throw new PhoneCallInputError(400, "Jenkar screening ID is required.");
  }
  const eventType = firstText(payload, ["event_type"], 120) ||
    "conference_participant";
  const conferenceSid = firstText(payload, ["conference_sid"], 300);
  const callSid = firstText(payload, ["call_sid"], 300);
  const participantLabel = firstText(payload, ["participant_label"], 120);
  const employeeExtension = firstText(payload, [
    "extension",
    "employee_extension",
  ], 40);
  const sequence = firstText(payload, ["sequence_number"], 40);
  const eventId = firstText(payload, ["event_id"], 300) ||
    `screening:${screeningId}:${eventType}:${
      sequence || callSid || conferenceSid
    }`;
  if (!callSid && !conferenceSid) {
    throw new PhoneCallInputError(
      400,
      "A Twilio call or conference ID is required.",
    );
  }
  const companyId = configuredCompanyId();
  const admin = adminClient();
  const delivery = replay
    ? {
      event: {
        CommCallEvent_ID: replay.eventId,
        CommCallEvent_StatusCode: "processing",
        CommCallEvent_AttemptCount: 0,
      } as StoredEvent,
      duplicate: true,
    }
    : await recordEvent(admin, {
      companyId,
      provider: "twilio",
      eventId,
      eventType: `jenkar_${eventType}`,
      objectId: callSid || conferenceSid,
      payloadHash: await sha256(raw),
      signatureVerified: true,
      occurredAt: parseDate(payload.occurred_at),
      payload,
      metadata: {
        verification,
        screeningId,
        conferenceSid: conferenceSid || null,
      },
    });
  const retryLease = replay
    ? { companyId, leaseToken: replay.leaseToken }
    : undefined;
  if (
    delivery.duplicate && delivery.event.CommCallEvent_StatusCode === "complete"
  ) return { ok: true, duplicate: true };

  try {
    const legType = jenkarLegType(participantLabel);
    const status = firstText(payload, ["call_status"], 80);
    const explicitOutcome = firstText(payload, ["outcome"], 80)
      .toLowerCase();
    const outcome = explicitOutcome || twilioOutcome(status);
    const normalized = normalizeJenkarScreeningOutcome(outcome, legType);
    const { callOutcome, transferStatus } = normalized;
    const occurredAt = parseDate(payload.occurred_at) ??
      new Date().toISOString();
    const startedAt = parseDate(payload.started_at) ?? occurredAt;
    const answeredAt = parseDate(payload.answered_at);
    const transferRequestedAt = parseDate(payload.transfer_requested_at);
    const transferAcceptedAt = parseDate(payload.transfer_accepted_at);
    const transcriptBoundaryAt = parseDate(payload.transcript_boundary_at);
    const terminal = [
      "completed",
      "busy",
      "no-answer",
      "failed",
      "canceled",
    ].includes(status);
    const endedAt = parseDate(payload.ended_at) ??
      (terminal ? occurredAt : null);
    const direction = firstText(payload, ["direction"], 40).includes(
        "outbound",
      ) || ["receptionist", "employee"].includes(legType)
      ? "outbound"
      : "inbound";
    const providerCallId = callSid ||
      `${conferenceSid}:${participantLabel || eventType}`;
    const existingLeg = await findLeg(admin, companyId, "twilio", [
      providerCallId,
    ]);
    const existingMetrics = isObject(
        existingLeg?.CommCallLeg_ProviderMetricsJSON,
      )
      ? existingLeg.CommCallLeg_ProviderMetricsJSON
      : {};
    const currentSequence = Number(existingMetrics.sequenceNumber ?? -1);
    const incomingSequence = Number(sequence);
    if (
      sequence && Number.isFinite(currentSequence) &&
      Number.isFinite(incomingSequence) && incomingSequence < currentSequence
    ) {
      await finishEvent(
        admin,
        delivery.event.CommCallEvent_ID,
        "complete",
        undefined,
        retryLease,
      );
      return { ok: true, screeningId, stale: true };
    }
    const correlatedCallId = await findCallByCorrelation(
      admin,
      companyId,
      screeningId,
    );
    const created = existingLeg
      ? { callId: String(existingLeg.CommCallLeg_CallID), leg: existingLeg }
      : await createCall(admin, {
        companyId,
        provider: "twilio",
        providerCallId,
        providerConferenceId: conferenceSid || undefined,
        providerSegmentId: screeningId,
        correlationId: screeningId,
        legType,
        direction,
        fromNumber: normalizePhone(payload.from_number),
        toNumber: normalizePhone(payload.to_number),
        startedAt,
        answeredAt,
        endedAt,
        outcome: callOutcome,
        transferStatus,
        transcriptStatus: "pending",
        correlationMethod: "jenkar_screening_id",
        correlationConfidence: 1,
        correlationEvidence: {
          screeningId,
          conferenceSid: conferenceSid || null,
          participantLabel: participantLabel || null,
          employeeExtension: employeeExtension || null,
        },
        attachToCallId: correlatedCallId || undefined,
      });
    await persistConsentEvidence(
      admin,
      companyId,
      created.callId,
      delivery.event.CommCallEvent_ID,
      "twilio",
      explicitConsentEvidence(payload),
    );
    const legUpdate = await admin.from("Comm_CallProviderLegs").update({
      CommCallLeg_ProviderConferenceID: conferenceSid ||
        created.leg.CommCallLeg_ProviderConferenceID || null,
      CommCallLeg_ProviderSegmentID: screeningId,
      CommCallLeg_StatusCode: status ||
        text(created.leg.CommCallLeg_StatusCode, 40) ||
        (endedAt ? "completed" : "in_progress"),
      CommCallLeg_OutcomeCode: outcome && outcome !== "unknown"
        ? outcome
        : text(created.leg.CommCallLeg_OutcomeCode, 40) || "unknown",
      CommCallLeg_AnsweredAt: earliestTimestamp(
        created.leg.CommCallLeg_AnsweredAt,
        answeredAt,
      ),
      CommCallLeg_EndedAt: latestTimestamp(
        created.leg.CommCallLeg_EndedAt,
        endedAt,
      ),
      CommCallLeg_CorrelationMethodCode: "jenkar_screening_id",
      CommCallLeg_CorrelationConfidence: 1,
      CommCallLeg_CorrelationEvidenceJSON: {
        screeningId,
        conferenceSid: conferenceSid || null,
        participantLabel: participantLabel || null,
        employeeExtension: employeeExtension || null,
      },
      CommCallLeg_ProviderMetricsJSON: {
        ...existingMetrics,
        sequenceNumber: sequence || null,
        providerStatus: status || null,
        eventType,
        employeeExtension: employeeExtension || null,
        transferRequestedAt,
        transferAcceptedAt,
        transcriptBoundaryAt,
        transcriptBoundarySource: firstText(payload, [
          "transcript_boundary_source",
        ], 160) || null,
      },
    }).eq("CommCallLeg_ID", created.leg.CommCallLeg_ID);
    if (legUpdate.error) throw legUpdate.error;

    const current = await admin.from("Comm_CallLogs").select("*").eq(
      "CommCall_ID",
      created.callId,
    ).single();
    if (current.error) throw current.error;
    const currentStartedAt = parseDate(current.data.CommCall_StartedAt);
    const nextStartedAt = currentStartedAt && currentStartedAt < startedAt
      ? currentStartedAt
      : startedAt;
    const currentEndedAt = parseDate(current.data.CommCall_EndedAt);
    const nextEndedAt = endedAt && (!currentEndedAt || endedAt > currentEndedAt)
      ? endedAt
      : currentEndedAt;
    const callerLeg = legType === "carrier" && direction === "inbound";
    const currentOutcome = normalizeJenkarScreeningOutcome(
      text(current.data.CommCall_OutcomeCode, 40),
      legType,
    ).callOutcome;
    const nextOutcome = legType === "employee"
      ? callOutcome
      : currentOutcome !== "unknown"
      ? currentOutcome
      : callOutcome;
    const callUpdate = await admin.from("Comm_CallLogs").update({
      CommCall_DirectionCode: "inbound",
      CommCall_StatusCode: callWorkflowStatus(
        nextOutcome,
        nextEndedAt,
      ),
      CommCall_FromNumber: callerLeg
        ? normalizePhone(payload.from_number) ||
          current.data.CommCall_FromNumber
        : current.data.CommCall_FromNumber,
      CommCall_ToNumber: callerLeg
        ? normalizePhone(payload.to_number) || current.data.CommCall_ToNumber
        : current.data.CommCall_ToNumber,
      CommCall_StartedAt: nextStartedAt,
      CommCall_AnsweredAt: earliestTimestamp(
        current.data.CommCall_AnsweredAt,
        answeredAt,
      ),
      CommCall_EndedAt: nextEndedAt,
      CommCall_DurationSeconds: duration(nextStartedAt, nextEndedAt),
      CommCall_OutcomeCode: nextOutcome,
      CommCall_Outcome: nextOutcome,
      CommCall_TransferStatusCode: transferStatus !== "not_requested"
        ? transferStatus
        : current.data.CommCall_TransferStatusCode || "not_requested",
      CommCall_TransferRequestedAt:
        legType === "employee" && transferStatus !== "not_requested"
          ? earliestTimestamp(
            current.data.CommCall_TransferRequestedAt,
            transferRequestedAt,
            startedAt,
          )
          : current.data.CommCall_TransferRequestedAt,
      CommCall_TransferAcceptedAt: transferStatus === "accepted"
        ? earliestTimestamp(
          current.data.CommCall_TransferAcceptedAt,
          transferAcceptedAt,
        )
        : current.data.CommCall_TransferAcceptedAt,
      CommCall_TranscriptStatusCode:
        current.data.CommCall_TranscriptStatusCode || "pending",
      CommCall_MetadataJSON: {
        ...(isObject(current.data.CommCall_MetadataJSON)
          ? current.data.CommCall_MetadataJSON
          : {}),
        screeningId,
        conferenceSid: conferenceSid || null,
        lastJenkarEventType: eventType,
        transcriptBoundaryAt: transcriptBoundaryAt ||
          (isObject(current.data.CommCall_MetadataJSON)
            ? current.data.CommCall_MetadataJSON.transcriptBoundaryAt
            : null),
        transcriptBoundarySource: firstText(payload, [
          "transcript_boundary_source",
        ], 160) ||
          (isObject(current.data.CommCall_MetadataJSON)
            ? current.data.CommCall_MetadataJSON.transcriptBoundarySource
            : null),
      },
      CommCall_UpdatedAt: new Date().toISOString(),
    }).eq("CommCall_ID", created.callId);
    if (callUpdate.error) throw callUpdate.error;
    const rollupStatus = await refreshTranscriptRollup(admin, created.callId);
    await refreshCombinedTranscriptInsights(
      admin,
      created.callId,
      rollupStatus,
    );
    await finishEvent(
      admin,
      delivery.event.CommCallEvent_ID,
      "complete",
      undefined,
      retryLease,
    );
    return {
      ok: true,
      callId: created.callId,
      screeningId,
      duplicate: delivery.duplicate,
    };
  } catch (error) {
    await finishEvent(
      admin,
      delivery.event.CommCallEvent_ID,
      "retryable",
      error,
      retryLease,
    );
    throw error;
  }
}

async function handleJenkarScreening(request: Request) {
  const expected = secret("PHONE_CALLS_WORKER_SECRET");
  const supplied = request.headers.get("x-multideck-worker-secret")?.trim() ??
    "";
  if (!constantTimeEqual(supplied, expected)) {
    throw new HttpError(401, "Webhook verification failed.");
  }
  const raw = await readBoundedBody(request);
  const payload = parseJson(raw);
  return providerResponse(
    await ingestJenkarScreeningPayload(
      payload,
      raw,
      "multideck_worker_secret",
    ),
  );
}

const TWILIO_SYNC_SNAPSHOT_MAX_BYTES = 32 * 1024;
const TWILIO_SYNC_WEBHOOK_MAX_BYTES = 64 * 1024;

async function handleJenkarSyncSnapshot(request: Request) {
  const expected = secret("PHONE_CALLS_WORKER_SECRET");
  const supplied = request.headers.get("x-multideck-worker-secret")?.trim() ??
    "";
  if (!constantTimeEqual(supplied, expected)) {
    throw new HttpError(401, "Webhook verification failed.");
  }
  const raw = await readBoundedBody(request, TWILIO_SYNC_SNAPSHOT_MAX_BYTES);
  const payload = parseJson(raw);
  const snapshot = normalizeTwilioSyncDocument(payload);
  if (!snapshot || !snapshot.checkpointEligible) {
    throw new PhoneCallInputError(
      400,
      "Send one current Jenkar Twilio Sync Document with a stable revision and update timestamp.",
    );
  }

  let eventsProcessed = 0;
  for (const event of snapshot.events) {
    await ingestJenkarScreeningPayload(
      event,
      JSON.stringify(event),
      "multideck_worker_secret",
    );
    eventsProcessed += 1;
  }
  return providerResponse({
    ok: true,
    screeningId: snapshot.screeningId,
    sourceDocumentSid: snapshot.source.sid,
    sourceRevision: snapshot.source.revision,
    eventsProcessed,
    partial: !snapshot.complete,
    missingFields: snapshot.missingFields,
  });
}

async function handleTwilioSyncWebhook(request: Request) {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]
    .trim().toLowerCase();
  if (contentType !== "application/x-www-form-urlencoded") {
    throw new HttpError(
      415,
      "Twilio Sync webhooks must use form encoding.",
    );
  }
  const raw = await readBoundedBody(request, TWILIO_SYNC_WEBHOOK_MAX_BYTES);
  const rawText = new TextDecoder().decode(raw);
  const form = new URLSearchParams(rawText);
  const signature = request.headers.get("x-twilio-signature")?.trim() ?? "";
  if (!signature) throw new HttpError(401, "Webhook verification failed.");
  const valid = await verifyTwilioSignature(
    request.url,
    form,
    signature,
    secret("TWILIO_AUTH_TOKEN"),
  );
  if (!valid) throw new HttpError(401, "Webhook verification failed.");

  let webhook;
  try {
    webhook = parseTwilioSyncWebhook(form, {
      expectedServiceSid: secret("TWILIO_SYNC_SERVICE_SID"),
      expectedAccountSid: optionalSecret("TWILIO_ACCOUNT_SID") || undefined,
      receivedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof TwilioSyncWebhookError) {
      throw new PhoneCallInputError(400, error.message);
    }
    throw error;
  }
  if (webhook.kind === "ignored") {
    return providerResponse({
      ok: true,
      ignored: true,
      eventType: webhook.eventType || null,
    });
  }

  const snapshot = normalizeTwilioSyncDocument(webhook.document);
  if (!snapshot) {
    return providerResponse({
      ok: true,
      ignored: true,
      eventType: webhook.eventType,
      reason: "not_a_jenkar_screening_document",
    });
  }
  let eventsProcessed = 0;
  for (const event of snapshot.events) {
    await ingestJenkarScreeningPayload(
      event,
      JSON.stringify(event),
      "twilio_signature",
    );
    eventsProcessed += 1;
  }
  return providerResponse({
    ok: true,
    eventType: webhook.eventType,
    screeningId: snapshot.screeningId,
    sourceDocumentSid: snapshot.source.sid,
    sourceRevision: snapshot.source.revision,
    eventsProcessed,
    partial: !snapshot.complete,
    missingFields: snapshot.missingFields,
    sourceTimestampBasis: snapshot.events[0]?.source_timestamp_basis ??
      "unavailable",
  });
}

function readTwilioSyncCheckpoint(value: unknown): TwilioSyncCheckpoint | null {
  if (!isObject(value)) return null;
  const updatedAt = parseDate(value.updatedAt);
  const documentSid = text(value.documentSid, 34);
  const revision = text(value.revision, 300);
  return updatedAt && /^ET[0-9a-f]{32}$/i.test(documentSid) && revision
    ? { updatedAt, documentSid, revision }
    : null;
}

function providerSyncFailure(error: unknown) {
  if (error instanceof TwilioSyncCollectorError) {
    return {
      code: error.status
        ? `twilio_sync_http_${error.status}`
        : "twilio_sync_failed",
      message: error.message,
    };
  }
  if (error instanceof PhoneCallInputError) {
    return { code: "twilio_sync_invalid_snapshot", message: error.message };
  }
  return {
    code: "twilio_sync_ingestion_failed",
    message: "A provider snapshot could not be persisted.",
  };
}

async function handleTwilioSync(request: Request) {
  const expected = secret("PHONE_CALLS_WORKER_SECRET");
  const supplied = request.headers.get("x-multideck-worker-secret")?.trim() ??
    "";
  if (!constantTimeEqual(supplied, expected)) {
    throw new HttpError(401, "Worker verification failed.");
  }
  const companyId = configuredCompanyId();
  const serviceSid = secret("TWILIO_SYNC_SERVICE_SID");
  const admin = adminClient();
  const claimed = await admin.rpc(
    "multideck_phone_call_provider_sync_claim",
    {
      p_company_id: companyId,
      p_provider_code: "twilio",
      p_source_key: serviceSid,
      p_lease_seconds: 300,
    },
  );
  if (claimed.error) throw claimed.error;
  const lease = isObject(claimed.data) ? claimed.data : {};
  if (lease.claimed !== true) {
    return providerResponse({
      ok: true,
      busy: true,
      retryAt: parseDate(lease.retryAt),
    }, 202);
  }
  const leaseToken = uuid(lease.leaseToken);
  if (!leaseToken) {
    throw new Error("Provider sync lease did not return a token.");
  }
  const checkpoint = readTwilioSyncCheckpoint(lease.checkpoint);

  try {
    const collection = await collectTwilioSyncDocuments({
      accountSid: optionalSecret("TWILIO_ACCOUNT_SID"),
      authToken: optionalSecret("TWILIO_AUTH_TOKEN"),
      apiKeySid: optionalSecret("TWILIO_API_KEY_SID"),
      apiKeySecret: optionalSecret("TWILIO_API_KEY_SECRET"),
      serviceSid,
      checkpoint,
    });
    let eventsProcessed = 0;
    for (const snapshot of collection.snapshots) {
      for (const event of snapshot.events) {
        await ingestJenkarScreeningPayload(
          event,
          JSON.stringify(event),
          "twilio_sync_api",
        );
        eventsProcessed += 1;
      }
    }
    const nextCheckpoint = collection.proposedCheckpoint ?? checkpoint ?? {};
    const committed = await admin.rpc(
      "multideck_phone_call_provider_sync_commit",
      {
        p_company_id: companyId,
        p_provider_code: "twilio",
        p_source_key: serviceSid,
        p_lease_token: leaseToken,
        p_checkpoint: nextCheckpoint,
      },
    );
    if (committed.error) throw committed.error;
    return providerResponse({
      ok: true,
      documentsSeen: collection.documentsSeen,
      snapshotsProcessed: collection.snapshots.length,
      eventsProcessed,
      ignoredDocuments: collection.ignoredDocuments,
      duplicateDocuments: collection.duplicateDocuments,
      checkpointAdvanced: !collection.checkpointBlocked &&
        Boolean(collection.proposedCheckpoint),
      checkpointBlocked: collection.checkpointBlocked,
    });
  } catch (error) {
    const failure = providerSyncFailure(error);
    const failed = await admin.rpc(
      "multideck_phone_call_provider_sync_fail",
      {
        p_company_id: companyId,
        p_provider_code: "twilio",
        p_source_key: serviceSid,
        p_lease_token: leaseToken,
        p_error_code: failure.code,
        p_error_message: failure.message,
      },
    );
    if (failed.error) console.error(failed.error);
    throw error;
  }
}

async function handleTwilioStatus(request: Request) {
  const raw = await readBoundedBody(request);
  const rawText = new TextDecoder().decode(raw);
  const form = new URLSearchParams(rawText);
  const valid = await verifyTwilioSignature(
    request.url,
    form,
    request.headers.get("x-twilio-signature") ?? "",
    secret("TWILIO_AUTH_TOKEN"),
  );
  if (!valid) throw new HttpError(401, "Webhook verification failed.");
  const payload = Object.fromEntries(form.entries()) as Json;
  return providerResponse(
    await ingestTwilioStatusPayload(payload, raw, "twilio_signature"),
  );
}

async function ingestTwilioStatusPayload(
  payload: Json,
  raw: Uint8Array | string,
  verification: "twilio_signature" | "stored_verified_event",
  replay?: { eventId: string; leaseToken: string },
) {
  const companyId = configuredCompanyId();
  const callSid = firstText(payload, ["CallSid"], 300);
  const parentSid = firstText(payload, ["ParentCallSid"], 300);
  const status = firstText(payload, ["CallStatus"], 80);
  if (!callSid) {
    throw new PhoneCallInputError(400, "Twilio CallSid is required.");
  }
  const sequence = firstText(payload, ["SequenceNumber"], 30) || "0";
  const eventId = `status:${callSid}:${sequence}:${status}`;
  const admin = adminClient();
  const delivery = replay
    ? {
      event: {
        CommCallEvent_ID: replay.eventId,
        CommCallEvent_StatusCode: "processing",
        CommCallEvent_AttemptCount: 0,
      } as StoredEvent,
      duplicate: true,
    }
    : await recordEvent(admin, {
      companyId,
      provider: "twilio",
      eventId,
      eventType: "call_status",
      objectId: callSid,
      payloadHash: await sha256(raw),
      signatureVerified: true,
      payload,
      metadata: { verification },
    });
  const retryLease = replay
    ? { companyId, leaseToken: replay.leaseToken }
    : undefined;
  if (
    delivery.duplicate && delivery.event.CommCallEvent_StatusCode === "complete"
  ) return { ok: true, duplicate: true };
  try {
    const current = await findLeg(admin, companyId, "twilio", [callSid]);
    const parent = current
      ? null
      : await findLeg(admin, companyId, "twilio", [parentSid]);
    const startedAt = parseDate(payload.Timestamp) ?? new Date().toISOString();
    const created = current
      ? { callId: String(current.CommCallLeg_CallID), leg: current }
      : await createCall(admin, {
        companyId,
        provider: "twilio",
        providerCallId: callSid,
        parentProviderCallId: parentSid,
        legType: parent ? "transfer" : "carrier",
        direction: firstText(payload, ["Direction"], 40).includes("outbound")
          ? "outbound"
          : "inbound",
        fromNumber: normalizePhone(payload.From),
        toNumber: normalizePhone(payload.To),
        startedAt,
        outcome: twilioOutcome(status),
        correlationMethod: parent ? "parent_call_sid" : "provider_id",
        attachToCallId: parent ? String(parent.CommCallLeg_CallID) : undefined,
      });
    const currentMetrics = isObject(created.leg.CommCallLeg_ProviderMetricsJSON)
      ? created.leg.CommCallLeg_ProviderMetricsJSON
      : {};
    const recordingSid = firstText(payload, ["RecordingSid"], 300);
    const currentSequence = Number(currentMetrics.sequenceNumber ?? -1);
    const incomingSequence = Number(sequence);
    if (
      Number.isFinite(currentSequence) && Number.isFinite(incomingSequence) &&
      incomingSequence < currentSequence
    ) {
      await finishEvent(
        admin,
        delivery.event.CommCallEvent_ID,
        "complete",
        undefined,
        retryLease,
      );
      return {
        ok: true,
        callId: created.callId,
        stale: true,
      };
    }
    const incomingAnsweredAt = status === "in-progress" ||
        status === "completed"
      ? startedAt
      : null;
    const incomingEndedAt = [
        "completed",
        "busy",
        "no-answer",
        "failed",
        "canceled",
      ].includes(status)
      ? startedAt
      : null;
    const updateLeg = await admin.from("Comm_CallProviderLegs").update({
      CommCallLeg_ProviderRecordingID: recordingSid ||
        created.leg.CommCallLeg_ProviderRecordingID || null,
      CommCallLeg_StatusCode: status || "unknown",
      CommCallLeg_OutcomeCode: twilioOutcome(status) !== "unknown"
        ? twilioOutcome(status)
        : text(created.leg.CommCallLeg_OutcomeCode, 40) || "unknown",
      CommCallLeg_ParentProviderCallID: parentSid ||
        created.leg.CommCallLeg_ParentProviderCallID || null,
      CommCallLeg_AnsweredAt: earliestTimestamp(
        created.leg.CommCallLeg_AnsweredAt,
        incomingAnsweredAt,
      ),
      CommCallLeg_EndedAt: latestTimestamp(
        created.leg.CommCallLeg_EndedAt,
        incomingEndedAt,
      ),
      CommCallLeg_ProviderMetricsJSON: {
        ...currentMetrics,
        sequenceNumber: sequence,
        providerStatus: status,
        hasProviderRecordingId: Boolean(recordingSid),
      },
    }).eq("CommCallLeg_ID", created.leg.CommCallLeg_ID);
    if (updateLeg.error) throw updateLeg.error;
    const currentCall = await admin.from("Comm_CallLogs").select(
      "CommCall_OutcomeCode, CommCall_TransferStatusCode, CommCall_EndedAt",
    ).eq("CommCall_ID", created.callId).eq(
      "CommCall_CompanyID",
      companyId,
    ).single();
    if (currentCall.error) throw currentCall.error;
    const currentOutcome = text(currentCall.data.CommCall_OutcomeCode, 40);
    const providerOutcome = twilioOutcome(status);
    const nextOutcome = currentOutcome && currentOutcome !== "unknown"
      ? currentOutcome
      : providerOutcome;
    const currentTransferStatus = text(
      currentCall.data.CommCall_TransferStatusCode,
      40,
    );
    const transferLeg = Boolean(
      parentSid || created.leg.CommCallLeg_ParentProviderCallID,
    );
    const providerTransferStatus = transferLeg
      ? (["completed", "in-progress", "ringing", "queued"].includes(status)
        ? "requested"
        : status === "no-answer"
        ? "unknown"
        : "failed")
      : "not_requested";
    const nextTransferStatus = currentTransferStatus === "accepted"
      ? "accepted"
      : providerTransferStatus === "not_requested" && currentTransferStatus
      ? currentTransferStatus
      : providerTransferStatus;
    const twilioEndedAt = latestTimestamp(
      currentCall.data.CommCall_EndedAt,
      incomingEndedAt,
    );
    const updateCall = await admin.from("Comm_CallLogs").update({
      CommCall_StatusCode: callWorkflowStatus(
        nextOutcome,
        twilioEndedAt,
      ),
      CommCall_OutcomeCode: nextOutcome,
      CommCall_Outcome: nextOutcome,
      CommCall_TransferStatusCode: nextTransferStatus,
      ...(recordingSid ? { CommCall_RecordingStatusCode: "recorded" } : {}),
      CommCall_UpdatedAt: new Date().toISOString(),
    }).eq("CommCall_ID", created.callId);
    if (updateCall.error) throw updateCall.error;
    await finishEvent(
      admin,
      delivery.event.CommCallEvent_ID,
      "complete",
      undefined,
      retryLease,
    );
    return { ok: true, callId: created.callId };
  } catch (error) {
    await finishEvent(
      admin,
      delivery.event.CommCallEvent_ID,
      "retryable",
      error,
      retryLease,
    );
    throw error;
  }
}

async function correlate3cx(
  admin: SupabaseClient,
  companyId: string,
  record: Normalized3cxRecord,
) {
  // CdrId is the installed XAPI report's stable record identity and is unique
  // within the provider/company boundary. Query it without interpolating an
  // untrusted provider value into a PostgREST expression.
  const exact = await admin.from("Comm_CallProviderLegs")
    .select("CommCallLeg_CallID")
    .eq("CommCallLeg_CompanyID", companyId)
    .eq("CommCallLeg_ProviderCode", "3cx")
    .eq("CommCallLeg_ProviderCallID", record.cdrId)
    .maybeSingle();
  if (exact.error) throw exact.error;
  if (exact.data) {
    return {
      callId: String(exact.data.CommCallLeg_CallID),
      method: "3cx_cdr_id",
      confidence: 1,
      evidence: { cdrId: record.cdrId },
    };
  }
  if (record.callHistoryId) {
    const history = await admin.from("Comm_CallProviderLegs").select(
      "CommCallLeg_CallID",
      { count: "exact" },
    ).eq("CommCallLeg_CompanyID", companyId).eq(
      "CommCallLeg_ProviderCode",
      "3cx",
    ).eq("CommCallLeg_ProviderHistoryID", record.callHistoryId).limit(100);
    if (history.error) throw history.error;
    const callIds = [
      ...new Set(
        (history.data ?? []).map((leg) => String(leg.CommCallLeg_CallID)),
      ),
    ];
    if (callIds.length === 1 && Number(history.count ?? 0) <= 100) {
      return {
        callId: callIds[0],
        method: "3cx_history_id",
        confidence: 1,
        evidence: { callHistoryId: record.callHistoryId },
      };
    }
    if (callIds.length > 1 || Number(history.count ?? 0) > 100) {
      return {
        callId: "",
        method: "ambiguous",
        confidence: 0,
        evidence: {
          callHistoryId: record.callHistoryId,
          historyLegCount: Number(history.count ?? history.data?.length ?? 0),
          historyCallCount: callIds.length,
          reason: "duplicate_history_call_ids",
        },
      };
    }
  }
  if (!record.startedAt) {
    return {
      callId: "",
      method: "ambiguous",
      confidence: 0,
      evidence: { reason: "missing_start_time" },
    };
  }
  const externalPhone = record.direction === "inbound"
    ? record.fromNumber
    : record.toNumber;
  const employeeExtension = firstText(
    record.raw,
    record.direction === "inbound"
      ? ["destination_dn_number", "destination_number"]
      : ["source_dn_number", "source_number"],
    40,
  );
  const started = new Date(record.startedAt).getTime();
  const lower = new Date(started - 2 * 60_000).toISOString();
  const upper = new Date(started + 2 * 60_000).toISOString();
  const calls = await admin.from("Comm_CallLogs")
    .select(
      "CommCall_ID, CommCall_StartedAt, CommCall_FromNumber, CommCall_ToNumber",
    )
    .eq("CommCall_CompanyID", companyId)
    .gte("CommCall_StartedAt", lower)
    .lte("CommCall_StartedAt", upper)
    .limit(20);
  if (calls.error) throw calls.error;
  const phoneCandidates = (calls.data ?? []).flatMap((call) => {
    const callPhone = normalizePhone(
      record.direction === "inbound"
        ? call.CommCall_FromNumber
        : call.CommCall_ToNumber,
    );
    const callStarted = call.CommCall_StartedAt
      ? new Date(call.CommCall_StartedAt).getTime()
      : Number.NaN;
    if (
      !externalPhone || callPhone !== externalPhone ||
      !Number.isFinite(callStarted)
    ) return [];
    return [{
      callId: String(call.CommCall_ID),
      differenceSeconds: Math.abs(callStarted - started) / 1000,
    }];
  });
  const candidateIds = phoneCandidates.map((candidate) => candidate.callId);
  const employeeLegs = employeeExtension && candidateIds.length
    ? await admin.from("Comm_CallProviderLegs").select(
      "CommCallLeg_CallID, CommCallLeg_CorrelationEvidenceJSON",
    ).eq("CommCallLeg_CompanyID", companyId).eq(
      "CommCallLeg_LegTypeCode",
      "employee",
    ).in("CommCallLeg_CallID", candidateIds)
    : { data: [], error: null };
  if (employeeLegs.error) throw employeeLegs.error;
  const extensionMatches = new Set((employeeLegs.data ?? []).flatMap((leg) => {
    const evidence = isObject(leg.CommCallLeg_CorrelationEvidenceJSON)
      ? leg.CommCallLeg_CorrelationEvidenceJSON
      : {};
    return text(evidence.employeeExtension, 40) === employeeExtension
      ? [String(leg.CommCallLeg_CallID)]
      : [];
  }));
  const candidates = phoneCandidates.filter((candidate) =>
    extensionMatches.has(candidate.callId)
  );
  const safe = employeeExtension ? candidateIsSafe(candidates) : null;
  return safe
    ? {
      callId: safe.callId,
      method: "unique_phone_extension_time",
      confidence: 0.92,
      evidence: {
        phone: externalPhone,
        employeeExtension,
        differenceSeconds: safe.differenceSeconds,
      },
    }
    : {
      callId: "",
      method: "ambiguous",
      confidence: 0,
      evidence: {
        phone: externalPhone,
        employeeExtension: employeeExtension || null,
        phoneCandidateCount: phoneCandidates.length,
        extensionCandidateCount: candidates.length,
        reason: employeeExtension
          ? "no_unique_phone_extension_time_match"
          : "missing_employee_extension",
      },
    };
}

async function ingest3cxRecord(
  admin: SupabaseClient,
  companyId: string,
  rawRecord: Json,
  replay?: { eventId: string; leaseToken: string },
) {
  const record = normalize3cxRecord(rawRecord);
  if (!record.cdrId) {
    throw new PhoneCallInputError(400, "Each 3CX CDR needs a stable cdr_id.");
  }
  const delivery = replay
    ? {
      event: {
        CommCallEvent_ID: replay.eventId,
        CommCallEvent_StatusCode: "processing",
        CommCallEvent_AttemptCount: 0,
      } as StoredEvent,
      duplicate: true,
    }
    : await (async () => {
      const payloadHash = await sha256(JSON.stringify(rawRecord));
      return await recordEvent(admin, {
        companyId,
        provider: "3cx",
        eventId: `cdr:${record.cdrId}:${payloadHash.slice(0, 16)}`,
        eventType: "cdr",
        objectId: record.cdrId,
        payloadHash,
        signatureVerified: true,
        occurredAt: record.endedAt ?? record.startedAt,
        payload: rawRecord,
      });
    })();
  const retryLease = replay
    ? { companyId, leaseToken: replay.leaseToken }
    : undefined;
  if (
    delivery.duplicate && delivery.event.CommCallEvent_StatusCode === "complete"
  ) return { duplicate: true };
  try {
    const correlation = await correlate3cx(admin, companyId, record);
    const created = await createCall(admin, {
      companyId,
      provider: "3cx",
      providerCallId: record.cdrId,
      parentProviderCallId: record.parentCallId,
      providerHistoryId: record.callHistoryId,
      providerSegmentId: record.cdrId,
      legType: "employee",
      direction: record.direction,
      fromNumber: record.fromNumber,
      toNumber: record.toNumber,
      startedAt: record.startedAt,
      answeredAt: record.answeredAt,
      endedAt: record.endedAt,
      outcome: record.outcome,
      transferStatus: record.transferStatus,
      transcriptStatus: record.transcriptState,
      correlationMethod: correlation.method,
      correlationConfidence: correlation.confidence,
      correlationEvidence: correlation.evidence,
      attachToCallId: correlation.callId || undefined,
    });
    const segments = parse3cxTranscript(rawRecord, record.startedAt);
    await writeTranscript(
      admin,
      created.callId,
      created.leg,
      delivery.event.CommCallEvent_ID,
      "3cx",
      segments,
    );
    const update = await admin.from("Comm_CallLogs").update({
      CommCall_OutcomeCode: record.outcome,
      CommCall_Outcome: record.outcome,
      CommCall_TransferStatusCode: record.transferStatus,
      CommCall_TransferAcceptedAt: record.transferAcceptedAt,
      CommCall_EndedAt: record.endedAt,
      CommCall_DurationSeconds: duration(record.startedAt, record.endedAt),
      CommCall_StatusCode: callWorkflowStatus(
        record.outcome,
        record.endedAt,
      ),
      CommCall_UpdatedAt: new Date().toISOString(),
    }).eq("CommCall_ID", created.callId);
    if (update.error) throw update.error;
    const rollupStatus = await refreshTranscriptRollup(admin, created.callId);
    await refreshCombinedTranscriptInsights(
      admin,
      created.callId,
      rollupStatus,
    );
    await finishEvent(
      admin,
      delivery.event.CommCallEvent_ID,
      segments.length || record.transcriptState !== "pending"
        ? "complete"
        : "partial",
      undefined,
      retryLease,
    );
    return {
      callId: created.callId,
      duplicate: false,
      correlation: correlation.method,
    };
  } catch (error) {
    await finishEvent(
      admin,
      delivery.event.CommCallEvent_ID,
      "retryable",
      error,
      retryLease,
    );
    throw error;
  }
}

async function handle3cxSync(request: Request) {
  const expected = secret("PHONE_CALLS_WORKER_SECRET");
  const supplied = request.headers.get("x-multideck-worker-secret")?.trim() ??
    "";
  if (!constantTimeEqual(supplied, expected)) {
    throw new HttpError(401, "Worker verification failed.");
  }
  const payload = await body<Json>(request);
  const records = Array.isArray(payload.records)
    ? payload.records.filter(isObject)
    : [];
  if (!records.length || records.length > 250) {
    throw new PhoneCallInputError(400, "Send between 1 and 250 3CX records.");
  }
  const admin = adminClient();
  const companyId = configuredCompanyId();
  const results = [];
  for (const record of records) {
    results.push(await ingest3cxRecord(admin, companyId, record));
  }
  return providerResponse({ ok: true, processed: results.length, results });
}

function threeCxXapiFailure(error: unknown) {
  return error instanceof ThreeCxXapiError
    ? { code: error.code, message: error.message }
    : {
      code: "three_cx_xapi_ingestion_failed",
      message: "A 3CX XAPI call-log batch could not be persisted.",
    };
}

async function handle3cxXapiSync(request: Request) {
  const expected = secret("PHONE_CALLS_WORKER_SECRET");
  const supplied = request.headers.get("x-multideck-worker-secret")?.trim() ??
    "";
  if (!constantTimeEqual(supplied, expected)) {
    throw new HttpError(401, "Worker verification failed.");
  }
  const baseUrl = normalizeThreeCxBaseUrl(optionalSecret("THREE_CX_BASE_URL"));
  const clientId = optionalSecret("THREE_CX_CLIENT_ID") ?? "";
  const clientSecret = optionalSecret("THREE_CX_CLIENT_SECRET") ?? "";
  let configuredFilters = null;
  try {
    const raw = optionalSecret("THREE_CX_CALL_LOG_FILTERS_JSON");
    configuredFilters = raw ? parseThreeCxXapiFilters(JSON.parse(raw)) : null;
  } catch {
    configuredFilters = null;
  }
  if (!baseUrl || !clientId || !clientSecret || !configuredFilters) {
    return providerResponse({
      ok: true,
      connected: false,
      status: "not_connected",
      reason: !configuredFilters
        ? "call_log_scope_not_configured"
        : "credentials_not_configured",
      requiredConfiguration: [
        "THREE_CX_BASE_URL",
        "THREE_CX_CLIENT_ID",
        "THREE_CX_CLIENT_SECRET",
        "THREE_CX_CALL_LOG_FILTERS_JSON",
      ],
    });
  }

  const companyId = configuredCompanyId();
  const admin = adminClient();
  const sourceKey = `xapi:${new URL(baseUrl).hostname}`.slice(0, 300);
  const claimed = await admin.rpc(
    "multideck_phone_call_provider_sync_claim",
    {
      p_company_id: companyId,
      p_provider_code: "3cx",
      p_source_key: sourceKey,
      p_lease_seconds: 300,
    },
  );
  if (claimed.error) throw claimed.error;
  const lease = isObject(claimed.data) ? claimed.data : {};
  if (lease.claimed !== true) {
    return providerResponse({
      ok: true,
      connected: true,
      busy: true,
      retryAt: parseDate(lease.retryAt),
    }, 202);
  }
  const leaseToken = uuid(lease.leaseToken);
  if (!leaseToken) {
    throw new Error("Provider sync lease did not return a token.");
  }
  const checkpoint = isObject(lease.checkpoint) ? lease.checkpoint : {};
  const runThroughAt = new Date().toISOString();
  const previousThroughAt = parseDate(checkpoint.throughAt);
  const windowFrom = new Date(
    previousThroughAt
      ? new Date(previousThroughAt).getTime() - 5 * 60_000
      : Date.now() - 10 * 60_000,
  ).toISOString();

  try {
    const collection = await collectThreeCxXapiRecords({
      baseUrl,
      clientId,
      clientSecret,
      filters: configuredFilters,
      windowFrom,
      windowTo: runThroughAt,
      maxPages: 3,
      maxRecords: 250,
    });
    const results = [];
    for (const record of collection.records) {
      results.push(await ingest3cxRecord(admin, companyId, record));
    }
    const nextCheckpoint = {
      throughAt: runThroughAt,
      overlapSeconds: 300,
      providerVersion: collection.providerVersion,
      lastRecordCount: collection.records.length,
    };
    const committed = await admin.rpc(
      "multideck_phone_call_provider_sync_commit",
      {
        p_company_id: companyId,
        p_provider_code: "3cx",
        p_source_key: sourceKey,
        p_lease_token: leaseToken,
        p_checkpoint: nextCheckpoint,
      },
    );
    if (committed.error) throw committed.error;
    return providerResponse({
      ok: true,
      connected: true,
      processed: results.length,
      pagesRead: collection.pagesRead,
      windowFrom: collection.windowFrom,
      windowTo: collection.windowTo,
      providerVersion: collection.providerVersion,
      checkpointAdvanced: true,
    });
  } catch (error) {
    const failure = threeCxXapiFailure(error);
    const failed = await admin.rpc(
      "multideck_phone_call_provider_sync_fail",
      {
        p_company_id: companyId,
        p_provider_code: "3cx",
        p_source_key: sourceKey,
        p_lease_token: leaseToken,
        p_error_code: failure.code,
        p_error_message: failure.message,
      },
    );
    if (failed.error) console.error(failed.error);
    throw error;
  }
}

async function handleRetentionMaintenance(request: Request) {
  const expected = secret("PHONE_CALLS_WORKER_SECRET");
  const supplied = request.headers.get("x-multideck-worker-secret")?.trim() ??
    "";
  if (!constantTimeEqual(supplied, expected)) {
    throw new HttpError(401, "Worker verification failed.");
  }
  const companyId = configuredCompanyId();
  const admin = adminClient();
  const purged = await admin.rpc("multideck_phone_call_purge_expired", {
    p_company_id: companyId,
    p_limit: 100,
  });
  if (purged.error) throw purged.error;
  const purgedEvents = await admin.rpc(
    "multideck_phone_call_purge_expired_events",
    {
      p_company_id: companyId,
      p_limit: 100,
    },
  );
  if (purgedEvents.error) throw purgedEvents.error;

  const pending = await admin.from("Comm_CallLogs").select(
    "CommCall_ID, CommCall_RecordingStorageBucket, CommCall_RecordingStoragePath",
  ).eq("CommCall_CompanyID", companyId).eq(
    "CommCall_RecordingStatusCode",
    "purge_pending",
  ).order("CommCall_RetentionUntil", { ascending: true }).limit(100);
  if (pending.error) throw pending.error;

  let recordingsPurged = 0;
  const retryable: Array<{ callId: string; reason: string }> = [];
  for (const call of pending.data ?? []) {
    const callId = uuid(call.CommCall_ID);
    const bucket = text(call.CommCall_RecordingStorageBucket, 120);
    const path = text(call.CommCall_RecordingStoragePath, 1_000);
    if (
      !callId || !bucket || !path || path.startsWith("/") || path.includes("..")
    ) {
      retryable.push({
        callId: callId || "unknown",
        reason: "The recording storage reference is invalid.",
      });
      continue;
    }
    const removed = await admin.storage.from(bucket).remove([path]);
    if (removed.error) {
      retryable.push({
        callId,
        reason: "The recording could not be deleted from storage.",
      });
      continue;
    }
    const marked = await admin.rpc(
      "multideck_phone_call_mark_recording_purged",
      {
        p_company_id: companyId,
        p_call_id: callId,
      },
    );
    if (marked.error || marked.data !== true) {
      retryable.push({
        callId,
        reason: "The recording deletion could not be finalised.",
      });
      continue;
    }
    recordingsPurged += 1;
  }

  return providerResponse({
    ok: retryable.length === 0,
    expiredCalls: Number(purged.data ?? 0),
    expiredRawEvents: Number(purgedEvents.data ?? 0),
    recordingsPurged,
    retryable,
  }, retryable.length ? 207 : 200);
}

async function handleRetryMaintenance(request: Request) {
  const expected = secret("PHONE_CALLS_WORKER_SECRET");
  const supplied = request.headers.get("x-multideck-worker-secret")?.trim() ??
    "";
  if (!constantTimeEqual(supplied, expected)) {
    throw new HttpError(401, "Worker verification failed.");
  }
  const companyId = configuredCompanyId();
  const admin = adminClient();
  const requestedLimit = Number(new URL(request.url).searchParams.get("limit"));
  const limit = Number.isSafeInteger(requestedLimit) && requestedLimit > 0
    ? Math.min(requestedLimit, 50)
    : 20;

  // Unsupported stored event types are deliberately dead-lettered, never
  // marked complete. Replaying them safely requires extracting their verified
  // provider handler rather than reconstructing a signature.
  const unsupported = await admin.rpc(
    "multideck_phone_call_dead_letter_unsupported_retries",
    { p_company_id: companyId },
  );
  if (unsupported.error) throw unsupported.error;
  const claimed = await admin.rpc("multideck_phone_call_claim_retries", {
    p_company_id: companyId,
    p_limit: limit,
    p_lease_seconds: 120,
  });
  if (claimed.error) throw claimed.error;
  const events = Array.isArray(claimed.data)
    ? claimed.data.filter(isObject)
    : [];
  const unsupportedResult = isObject(unsupported.data)
    ? unsupported.data
    : { count: 0, eventTypes: [] };
  const unsupportedCount = Number(unsupportedResult.count ?? 0);
  const results: Json[] = [];
  for (const event of events) {
    const eventId = uuid(event.eventId);
    const leaseToken = uuid(event.leaseToken);
    const provider = text(event.provider, 32);
    const eventType = text(event.eventType, 120);
    const payload = isObject(event.payload) ? event.payload : null;
    if (!eventId || !leaseToken || !payload) {
      if (eventId && leaseToken) {
        await finishEvent(
          admin,
          eventId,
          "terminal",
          new Error("Stored retry payload is invalid."),
          { companyId, leaseToken },
        );
      }
      results.push({ eventId: eventId || null, status: "terminal" });
      continue;
    }
    try {
      if (provider === "3cx" && eventType === "cdr") {
        await ingest3cxRecord(admin, companyId, payload, {
          eventId,
          leaseToken,
        });
      } else if (provider === "twilio" && eventType.startsWith("jenkar_")) {
        const metadata = isObject(event.metadata) ? event.metadata : {};
        const verification = text(metadata.verification, 40);
        if (
          verification !== "multideck_worker_secret" &&
          verification !== "twilio_sync_api" &&
          verification !== "twilio_signature"
        ) {
          await finishEvent(
            admin,
            eventId,
            "terminal",
            new Error("Stored Jenkar event has no verified ingress method."),
            { companyId, leaseToken },
          );
          results.push({ eventId, status: "terminal" });
          continue;
        }
        await ingestJenkarScreeningPayload(
          payload,
          JSON.stringify(payload),
          verification,
          { eventId, leaseToken },
        );
      } else if (provider === "twilio" && eventType === "call_status") {
        await ingestTwilioStatusPayload(
          payload,
          JSON.stringify(payload),
          "stored_verified_event",
          { eventId, leaseToken },
        );
      } else if (
        provider === "elevenlabs" && eventType !== "conversation_initiation"
      ) {
        await ingestElevenLabsPayload(
          payload,
          JSON.stringify(payload),
          "stored_verified_event",
          { eventId, leaseToken },
        );
      } else {
        await finishEvent(
          admin,
          eventId,
          "terminal",
          new Error("Stored provider event has no safe replay adapter."),
          { companyId, leaseToken },
        );
      }
      results.push({ eventId, status: "processed" });
    } catch (error) {
      results.push({
        eventId,
        status: "retryable",
        error: error instanceof Error
          ? error.message.slice(0, 240)
          : "Provider replay failed.",
      });
    }
  }
  return providerResponse(
    {
      ok: unsupportedCount === 0 &&
        results.every((result) => result.status === "processed"),
      claimed: events.length,
      results,
      unsupported: unsupportedResult,
      replayAdapters: [
        "3cx:cdr",
        "twilio:jenkar_*",
        "twilio:call_status",
        "elevenlabs:post-call-and-reconciliation",
      ],
      unsupportedReplayAdapters: ["elevenlabs:conversation_initiation"],
    },
    unsupportedCount > 0 ||
      results.some((result) => result.status !== "processed")
      ? 207
      : 200,
  );
}

async function actorContext(request: Request) {
  const { admin, user } = await authenticate(request);
  const actor = await currentInternalUser(admin, user) as unknown as Actor;
  await requirePermission(admin, actor.User_ID, "CRM.PhoneCalls.Read");
  return { admin, actor };
}

function outcomeForClient(value: unknown) {
  const outcome = text(value, 40);
  if (["answered", "missed", "declined", "voicemail"].includes(outcome)) {
    return outcome;
  }
  if (["no_answer", "busy", "failed", "cancelled"].includes(outcome)) {
    return "missed";
  }
  return "unknown";
}

function transcriptForClient(value: unknown) {
  const status = text(value, 40);
  if (["complete", "partial", "pending", "failed"].includes(status)) {
    return status;
  }
  return "unavailable";
}

function mapListRow(
  call: Json,
  review: Json | null,
  organisation: Json | null,
  lead: Json | null,
  actions: Json[],
  tasks: Json[],
) {
  const started = String(call.CommCall_StartedAt ?? call.CommCall_CreatedAt);
  const answerSeconds = call.CommCall_AnsweredAt
    ? duration(started, String(call.CommCall_AnsweredAt))
    : null;
  const pending = actions.some((action) =>
    action.CRMCallAction_DecisionStatus === "pending"
  );
  const approved = actions.some((action) =>
    ["accepted", "edited"].includes(String(action.CRMCallAction_DecisionStatus))
  );
  const hasConfirmedCrmMatch = call.CommCall_MatchStatusCode === "matched" &&
    ["user_review", "approved_action", "approved_action_edited"].includes(
      String(call.CommCall_MatchMethodCode),
    );
  const completed = actions.some((action) => {
    if (
      !["accepted", "edited"].includes(
        String(action.CRMCallAction_DecisionStatus),
      ) || !action.CRMCallAction_TodoTaskID
    ) return false;
    return tasks.some((task) =>
      String(task.TodoTask_ID) === String(action.CRMCallAction_TodoTaskID) &&
      task.TodoTask_StatusCode === "completed" && !task.TodoTask_IsDeleted
    );
  });
  return {
    id: call.CommCall_ID,
    callerName: call.CommCall_DirectionCode === "outbound"
      ? call.CommCall_ToDisplayNameSnapshot
      : call.CommCall_FromDisplayNameSnapshot,
    callerPhone: String(
      call.CommCall_DirectionCode === "outbound"
        ? call.CommCall_ToNumber ?? ""
        : call.CommCall_FromNumber ?? "",
    ),
    company: organisation
      ? { id: organisation.Org_id, name: organisation.Org_Name }
      : null,
    // Lead record sections may use this exact canonical record. A fuzzy or
    // pending candidate is deliberately never surfaced as a linked Lead.
    lead: hasConfirmedCrmMatch && lead
      ? {
        id: lead.CRMLead_ID,
        name: text(lead.CRMLead_CompanyName, 240) ||
          text(lead.CRMLead_PersonName, 240) || "Unnamed lead",
      }
      : null,
    matchStatus: call.CommCall_MatchStatusCode ?? "unmatched",
    direction: call.CommCall_DirectionCode === "outbound"
      ? "outbound"
      : "inbound",
    outcome: outcomeForClient(call.CommCall_OutcomeCode),
    startedAt: started,
    endedAt: call.CommCall_EndedAt,
    durationSeconds: call.CommCall_DurationSeconds,
    answerSeconds,
    handlingSeconds: call.CommCall_AnsweredAt && call.CommCall_EndedAt
      ? duration(
        String(call.CommCall_AnsweredAt),
        String(call.CommCall_EndedAt),
      )
      : null,
    transcriptStatus: transcriptForClient(call.CommCall_TranscriptStatusCode),
    followUpStatus: completed
      ? "completed"
      : approved
      ? "approved"
      : pending
      ? "suggested"
      : "none",
    _review: review,
  };
}

async function related(admin: SupabaseClient, calls: Json[]) {
  const callIds = calls.map((call) => String(call.CommCall_ID));
  if (!callIds.length) {
    return {
      reviews: [] as Json[],
      actions: [] as Json[],
      organisations: [] as Json[],
      leads: [] as Json[],
      tasks: [] as Json[],
    };
  }
  const reviewsResult = await admin.from("CRM_CallReviews").select("*").in(
    "CRMCallReview_CommCallID",
    callIds,
  );
  if (reviewsResult.error) throw reviewsResult.error;
  const reviews = (reviewsResult.data ?? []) as Json[];
  const reviewIds = reviews.map((review) => String(review.CRMCallReview_ID));
  const actionsResult = reviewIds.length
    ? await admin.from("CRM_CallActionCandidates").select("*").in(
      "CRMCallAction_CallReviewID",
      reviewIds,
    )
    : { data: [], error: null };
  if (actionsResult.error) throw actionsResult.error;
  const actions = (actionsResult.data ?? []) as Json[];
  const taskIds = [
    ...new Set(
      actions.map((action) => text(action.CRMCallAction_TodoTaskID, 36)).filter(
        Boolean,
      ),
    ),
  ];
  const companyId = text(calls[0]?.CommCall_CompanyID, 36);
  const tasksResult = taskIds.length && companyId
    ? await admin.from("OPS_UserTasks").select(
      "TodoTask_ID, TodoTask_StatusCode, TodoTask_CompletedAt, TodoTask_ScheduledDate, TodoTask_IsDeleted",
    ).eq("TodoTask_CompanyID", companyId).in("TodoTask_ID", taskIds)
    : { data: [], error: null };
  if (tasksResult.error) throw tasksResult.error;
  const orgIds = calls.map((call) => text(call.CommCall_MatchedOrgID, 36))
    .filter(Boolean);
  const orgResult = orgIds.length
    ? await admin.from("Org_Master").select("Org_id, Org_Name").in(
      "Org_id",
      orgIds,
    )
    : { data: [], error: null };
  if (orgResult.error) throw orgResult.error;
  const leadIds = [
    ...new Set(
      calls.filter((call) =>
        call.CommCall_MatchStatusCode === "matched" &&
        ["user_review", "approved_action", "approved_action_edited"].includes(
          String(call.CommCall_MatchMethodCode),
        )
      ).map((call) => uuid(call.CommCall_MatchedLeadID)).filter(Boolean),
    ),
  ];
  const leadsResult = leadIds.length
    ? await admin.from("CRM_Leads").select(
      "CRMLead_ID, CRMLead_CompanyName, CRMLead_PersonName, CRMLead_IsDeleted",
    ).in("CRMLead_ID", leadIds).eq("CRMLead_IsDeleted", false)
    : { data: [], error: null };
  if (leadsResult.error) throw leadsResult.error;
  return {
    reviews,
    actions,
    organisations: (orgResult.data ?? []) as Json[],
    leads: (leadsResult.data ?? []) as Json[],
    tasks: (tasksResult.data ?? []) as Json[],
  };
}

async function readCalls(admin: SupabaseClient, actor: Actor, url: URL) {
  const limit = Math.max(
    1,
    Math.min(Number(url.searchParams.get("limit") ?? 50), 100),
  );
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0));
  let query = admin.from("Comm_CallLogs").select("*", { count: "exact" }).eq(
    "CommCall_CompanyID",
    actor.Company_ID,
  );
  const requestedCompanyId = url.searchParams.has("companyId")
    ? uuid(url.searchParams.get("companyId"))
    : "";
  const requestedLeadId = url.searchParams.has("leadId")
    ? uuid(url.searchParams.get("leadId"))
    : "";
  if (url.searchParams.has("companyId") && !requestedCompanyId) {
    throw new PhoneCallInputError(400, "Choose a valid company record.");
  }
  if (url.searchParams.has("leadId") && !requestedLeadId) {
    throw new PhoneCallInputError(400, "Choose a valid lead record.");
  }
  if (requestedCompanyId || requestedLeadId) {
    // CRM record sections are strict relationship views, never a second fuzzy
    // matcher. Only an operator-reviewed or approved action may expose a call.
    query = query.eq("CommCall_MatchStatusCode", "matched").in(
      "CommCall_MatchMethodCode",
      ["user_review", "approved_action", "approved_action_edited"],
    );
    if (requestedCompanyId) {
      query = query.eq("CommCall_MatchedOrgID", requestedCompanyId);
    }
    if (requestedLeadId) {
      query = query.eq("CommCall_MatchedLeadID", requestedLeadId);
    }
  }
  const direction = url.searchParams.get("direction");
  const match = url.searchParams.get("matchStatus");
  const transcript = url.searchParams.get("transcriptStatus");
  if (direction && direction !== "all") {
    query = query.eq("CommCall_DirectionCode", direction);
  }
  if (match && match !== "all") {
    query = query.eq("CommCall_MatchStatusCode", match);
  }
  if (transcript && transcript !== "all") {
    query = query.eq("CommCall_TranscriptStatusCode", transcript);
  }
  const outcome = url.searchParams.get("outcome");
  if (outcome === "missed") {
    query = query.in("CommCall_OutcomeCode", [
      "missed",
      "no_answer",
      "busy",
      "failed",
      "cancelled",
    ]);
  } else if (
    outcome && ["answered", "declined", "voicemail"].includes(outcome)
  ) {
    query = query.eq("CommCall_OutcomeCode", outcome);
  }
  const timeZone = reportingTimeZone(url);
  const from = dateFilter(url.searchParams.get("from"), false, timeZone);
  const to = dateFilter(url.searchParams.get("to"), true, timeZone);
  if (from) query = query.gte("CommCall_StartedAt", from);
  if (to) query = query.lte("CommCall_StartedAt", to);
  const search = text(url.searchParams.get("search"), 120).replace(
    /[,%()]/g,
    " ",
  );
  if (search) {
    const companies = await admin.from("Org_Master").select("Org_id").ilike(
      "Org_Name",
      `%${search}%`,
    ).limit(50);
    if (companies.error) throw companies.error;
    const companyIds = (companies.data ?? []).map((company) => company.Org_id)
      .filter(Boolean);
    const searchParts = [
      `CommCall_FromNumber.ilike.%${search}%`,
      `CommCall_ToNumber.ilike.%${search}%`,
      `CommCall_FromDisplayNameSnapshot.ilike.%${search}%`,
      `CommCall_ToDisplayNameSnapshot.ilike.%${search}%`,
      companyIds.length
        ? `CommCall_MatchedOrgID.in.(${companyIds.join(",")})`
        : "",
    ].filter(Boolean);
    query = query.or(
      searchParts.join(","),
    );
  }
  const result = await query.order("CommCall_StartedAt", {
    ascending: false,
    nullsFirst: false,
  }).range(offset, offset + limit - 1);
  if (result.error) throw result.error;
  const calls = (result.data ?? []) as Json[];
  const relation = await related(admin, calls);
  const rows = calls.map((call) => {
    const review = relation.reviews.find((item) =>
      item.CRMCallReview_CommCallID === call.CommCall_ID
    ) ?? null;
    const actions = relation.actions.filter((item) =>
      item.CRMCallAction_CallReviewID === review?.CRMCallReview_ID
    );
    const organisation = relation.organisations.find((item) =>
      item.Org_id === call.CommCall_MatchedOrgID
    ) ?? null;
    const lead = relation.leads.find((item) =>
      item.CRMLead_ID === call.CommCall_MatchedLeadID
    ) ?? null;
    return mapListRow(
      call,
      review,
      organisation,
      lead,
      actions,
      relation.tasks,
    );
  }).map(({ _review: _discard, ...row }) => row);
  return { rows, total: result.count ?? rows.length, limit, offset };
}

async function overview(admin: SupabaseClient, actor: Actor, url: URL) {
  const timeZone = reportingTimeZone(url);
  const from = dateFilter(url.searchParams.get("from"), false, timeZone) ??
    new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString();
  const to = dateFilter(url.searchParams.get("to"), true, timeZone) ??
    new Date().toISOString();
  const analysisLimit = 5_000;
  const result = await admin.from("Comm_CallLogs").select("*", {
    count: "exact",
  }).eq(
    "CommCall_CompanyID",
    actor.Company_ID,
  ).gte("CommCall_StartedAt", from).lte("CommCall_StartedAt", to).order(
    "CommCall_StartedAt",
    { ascending: true },
  ).limit(analysisLimit);
  if (result.error) throw result.error;
  const calls = (result.data ?? []) as Json[];
  const totalCalls = result.count ?? calls.length;
  const analysisComplete = calls.length >= totalCalls;
  const relation = await related(admin, calls);
  const callIds = calls.map((call) => String(call.CommCall_ID));
  const legResult = callIds.length
    ? await admin.from("Comm_CallProviderLegs").select(
      "CommCallLeg_CallID, CommCallLeg_ProviderCode, CommCallLeg_LegTypeCode, CommCallLeg_DirectionCode, CommCallLeg_OutcomeCode, CommCallLeg_StartedAt, CommCallLeg_AnsweredAt, CommCallLeg_EndedAt, CommCallLeg_TransferRequestedAt, CommCallLeg_SortOrder, CommCallLeg_ProviderMetricsJSON",
    ).eq("CommCallLeg_CompanyID", actor.Company_ID).in(
      "CommCallLeg_ProviderCode",
      ["3cx", "twilio"],
    ).in("CommCallLeg_CallID", callIds)
    : { data: [], error: null };
  if (legResult.error) throw legResult.error;
  const providerLegs = (legResult.data ?? []) as Json[];
  const threeCxLegsByCall = new Map<string, Json>();
  const orderedThreeCxLegs = providerLegs.filter((leg) =>
    leg.CommCallLeg_ProviderCode === "3cx"
  ).sort((left, right) => {
    const leftEmployee = left.CommCallLeg_LegTypeCode === "employee" ? 1 : 0;
    const rightEmployee = right.CommCallLeg_LegTypeCode === "employee" ? 1 : 0;
    if (leftEmployee !== rightEmployee) return rightEmployee - leftEmployee;
    const sortOrder = Number(right.CommCallLeg_SortOrder ?? 0) -
      Number(left.CommCallLeg_SortOrder ?? 0);
    if (sortOrder) return sortOrder;
    return Date.parse(String(right.CommCallLeg_EndedAt ?? "")) -
      Date.parse(String(left.CommCallLeg_EndedAt ?? ""));
  });
  for (const leg of orderedThreeCxLegs) {
    const callId = String(leg.CommCallLeg_CallID);
    if (!threeCxLegsByCall.has(callId)) threeCxLegsByCall.set(callId, leg);
  }
  const twilioTransferRequestedCallIds = new Set<string>();
  const twilioTransferAcceptedCallIds = new Set<string>();
  for (
    const leg of providerLegs.filter((item) =>
      item.CommCallLeg_ProviderCode === "twilio"
    )
  ) {
    const callId = String(leg.CommCallLeg_CallID);
    const metrics = isObject(leg.CommCallLeg_ProviderMetricsJSON)
      ? leg.CommCallLeg_ProviderMetricsJSON
      : {};
    const requestedAt = parseDate(
      leg.CommCallLeg_TransferRequestedAt ?? metrics.transferRequestedAt,
    );
    const acceptedAt = parseDate(metrics.transferAcceptedAt);
    if (requestedAt || acceptedAt) twilioTransferRequestedCallIds.add(callId);
    if (acceptedAt) twilioTransferAcceptedCallIds.add(callId);
  }
  const cursorResult = await admin.from("Comm_CallProviderSyncCursors").select(
    "CommCallSyncCursor_ProviderCode, CommCallSyncCursor_LastAttemptAt, CommCallSyncCursor_LastSucceededAt, CommCallSyncCursor_LastFailedAt, CommCallSyncCursor_ConsecutiveFailures, CommCallSyncCursor_LastErrorCode",
  ).eq("CommCallSyncCursor_CompanyID", actor.Company_ID);
  if (cursorResult.error) throw cursorResult.error;
  const cursors = (cursorResult.data ?? []) as Json[];
  const cursorByProvider = new Map(cursors.map((cursor) => [
    String(cursor.CommCallSyncCursor_ProviderCode),
    cursor,
  ]));
  const providerStatus = [
    {
      provider: "elevenlabs",
      label: "ElevenLabs receptionist",
      detail: "Exact-agent conversation reconciliation",
      staleAfterMinutes: 8,
    },
    {
      provider: "twilio",
      label: "Twilio screening",
      detail: "Screening and transfer Sync polling",
      staleAfterMinutes: 5,
    },
    {
      provider: "3cx",
      label: "3CX employee calls",
      detail: "3CX call-detail and transcript collector",
      staleAfterMinutes: 20,
    },
  ].map((definition) => {
    const cursor = cursorByProvider.get(definition.provider);
    const failures = Number(
      cursor?.CommCallSyncCursor_ConsecutiveFailures ?? 0,
    );
    const lastSucceededAt = cursor?.CommCallSyncCursor_LastSucceededAt
      ? String(cursor.CommCallSyncCursor_LastSucceededAt)
      : null;
    const succeededMs = lastSucceededAt
      ? Date.parse(lastSucceededAt)
      : Number.NaN;
    const stale = Number.isFinite(succeededMs) &&
      Date.now() - succeededMs > definition.staleAfterMinutes * 60_000;
    const state = !cursor
      ? "not_configured"
      : failures > 0
      ? "error"
      : !lastSucceededAt || stale
      ? "delayed"
      : "healthy";
    return {
      provider: definition.provider,
      label: definition.label,
      detail: definition.detail,
      state,
      lastAttemptAt: cursor?.CommCallSyncCursor_LastAttemptAt ?? null,
      lastSucceededAt,
      lastFailedAt: cursor?.CommCallSyncCursor_LastFailedAt ?? null,
      consecutiveFailures: failures,
      errorCode: cursor?.CommCallSyncCursor_LastErrorCode ?? null,
    };
  });
  const confirmedOutcomeLegs = [...threeCxLegsByCall.values()].filter((leg) =>
    outcomeForClient(leg.CommCallLeg_OutcomeCode) !== "unknown"
  );
  const allInbound = calls.filter((call) =>
    call.CommCall_DirectionCode !== "outbound"
  );
  const answered = confirmedOutcomeLegs.filter((leg) =>
    outcomeForClient(leg.CommCallLeg_OutcomeCode) === "answered"
  );
  const missed = confirmedOutcomeLegs.filter((leg) =>
    outcomeForClient(leg.CommCallLeg_OutcomeCode) === "missed"
  );
  const declined = confirmedOutcomeLegs.filter((leg) =>
    outcomeForClient(leg.CommCallLeg_OutcomeCode) === "declined"
  );
  const voicemail = confirmedOutcomeLegs.filter((leg) =>
    outcomeForClient(leg.CommCallLeg_OutcomeCode) === "voicemail"
  );
  const transferRequested = twilioTransferRequestedCallIds.size;
  const transferAccepted = twilioTransferAcceptedCallIds.size;
  const average = (values: Array<number | null>) => {
    const valid = values.filter((value): value is number =>
      typeof value === "number"
    );
    return valid.length
      ? Math.round(valid.reduce((sum, value) => sum + value, 0) / valid.length)
      : 0;
  };
  const answerTimes = answered.map((leg) =>
    leg.CommCallLeg_AnsweredAt
      ? duration(
        String(leg.CommCallLeg_StartedAt),
        String(leg.CommCallLeg_AnsweredAt),
      )
      : null
  );
  const handling = answered.map((leg) =>
    leg.CommCallLeg_EndedAt
      ? duration(
        String(leg.CommCallLeg_AnsweredAt),
        String(leg.CommCallLeg_EndedAt),
      )
      : null
  );
  const averageAnswerSeconds = average(answerTimes);
  const averageHandlingSeconds = average(handling);
  const compactDuration = (seconds: number) =>
    `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${
      (seconds % 60).toString().padStart(2, "0")
    }`;
  const dayMap = new Map<
    string,
    {
      period: string;
      inboundAnswered: number;
      inboundMissed: number;
      outboundAnswered: number;
      outboundMissed: number;
    }
  >();
  for (const leg of threeCxLegsByCall.values()) {
    const outcome = outcomeForClient(leg.CommCallLeg_OutcomeCode);
    if (outcome !== "answered" && outcome !== "missed") continue;
    const direction = String(leg.CommCallLeg_DirectionCode ?? "").toLowerCase();
    if (direction !== "inbound" && direction !== "outbound") continue;
    const period = dateKeyInTimeZone(
      leg.CommCallLeg_StartedAt,
      timeZone,
    ).slice(5, 10);
    if (!period) continue;
    const row = dayMap.get(period) ??
      {
        period,
        inboundAnswered: 0,
        inboundMissed: 0,
        outboundAnswered: 0,
        outboundMissed: 0,
      };
    const key = `${direction}${
      outcome === "answered" ? "Answered" : "Missed"
    }` as keyof typeof row;
    if (key !== "period") row[key] += 1;
    dayMap.set(period, row);
  }
  const volumeSeries = [...dayMap.values()].map((row) => ({
    ...row,
    answerRate: Math.round(
      100 * (row.inboundAnswered + row.outboundAnswered) /
        Math.max(
          1,
          row.inboundAnswered + row.inboundMissed + row.outboundAnswered +
            row.outboundMissed,
        ),
    ),
    evidence: { kind: "provider_confirmed", source: "3cx", observedAt: to },
  }));
  const reasonCounts = new Map<string, number>();
  for (const review of relation.reviews) {
    const leg = threeCxLegsByCall.get(String(review.CRMCallReview_CommCallID));
    if (!leg || outcomeForClient(leg.CommCallLeg_OutcomeCode) !== "answered") {
      continue;
    }
    const reason = text(review.CRMCallReview_CallReason, 120);
    if (reason) reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
  }
  const reasonsTotal = [...reasonCounts.values()].reduce(
    (sum, value) => sum + value,
    0,
  );
  const reasons = [...reasonCounts.entries()].sort((a, b) => b[1] - a[1]).slice(
    0,
    5,
  ).map(([label, count], index) => ({
    id: `reason-${index}`,
    label,
    count,
    share: Math.round(100 * count / Math.max(1, reasonsTotal)),
    evidence: { kind: "derived", source: "multideck", observedAt: to },
  }));
  const coverageCounts = {
    company: 0,
    contact: 0,
    lead: 0,
    needs_review: 0,
    unmatched: 0,
  };
  for (const call of calls) {
    if (call.CommCall_MatchedOrgID) coverageCounts.company += 1;
    if (call.CommCall_MatchedContactID) coverageCounts.contact += 1;
    if (call.CommCall_MatchedLeadID) coverageCounts.lead += 1;
    if (call.CommCall_MatchStatusCode === "review") {
      coverageCounts.needs_review += 1;
    }
    if (
      call.CommCall_MatchStatusCode === "unmatched" &&
      !call.CommCall_MatchedOrgID && !call.CommCall_MatchedContactID &&
      !call.CommCall_MatchedLeadID
    ) coverageCounts.unmatched += 1;
  }
  const coverage =
    (Object.keys(coverageCounts) as Array<keyof typeof coverageCounts>).map((
      id,
    ) => ({
      id,
      label: id === "needs_review"
        ? "Needs review"
        : id[0].toUpperCase() + id.slice(1),
      count: coverageCounts[id],
      share: Math.round(100 * coverageCounts[id] / Math.max(1, calls.length)),
    }));
  const attention = calls.flatMap((call) => {
    const review = relation.reviews.find((item) =>
      item.CRMCallReview_CommCallID === call.CommCall_ID
    );
    const pending = relation.actions.find((item) =>
      item.CRMCallAction_CallReviewID === review?.CRMCallReview_ID &&
      item.CRMCallAction_DecisionStatus === "pending"
    );
    if (pending) {
      return [{
        id: String(pending.CRMCallAction_ID),
        callId: String(call.CommCall_ID),
        title: String(pending.CRMCallAction_Title),
        occurredAt: String(call.CommCall_StartedAt),
        stateLabel: "Suggested action",
        tone: "teal",
      }];
    }
    if (call.CommCall_MatchStatusCode !== "matched") {
      return [{
        id: `match-${call.CommCall_ID}`,
        callId: String(call.CommCall_ID),
        title: `${
          call.CommCall_FromDisplayNameSnapshot || call.CommCall_FromNumber ||
          "Caller"
        } needs CRM review`,
        occurredAt: String(call.CommCall_StartedAt),
        stateLabel: "Needs review",
        tone: "amber",
      }];
    }
    const confirmedLeg = threeCxLegsByCall.get(String(call.CommCall_ID));
    if (
      confirmedLeg &&
      outcomeForClient(confirmedLeg.CommCallLeg_OutcomeCode) === "missed"
    ) {
      return [{
        id: `missed-${call.CommCall_ID}`,
        callId: String(call.CommCall_ID),
        title: `Missed call from ${
          call.CommCall_FromDisplayNameSnapshot || call.CommCall_FromNumber ||
          "unknown caller"
        }`,
        occurredAt: String(
          confirmedLeg.CommCallLeg_StartedAt ?? call.CommCall_StartedAt,
        ),
        stateLabel: "Missed",
        tone: "red",
        evidence: { kind: "provider_confirmed", source: "3cx", observedAt: to },
      }];
    }
    return [];
  }).slice(-8).reverse();
  const providerEvidence = {
    kind: "provider_confirmed",
    source: "3cx",
    observedAt: to,
  };
  const twilioEvidence = {
    kind: "provider_confirmed",
    source: "twilio",
    observedAt: to,
  };
  const derivedEvidence = {
    kind: "derived",
    source: "multideck",
    observedAt: to,
  };
  const answeredIds = new Set(
    answered.map((leg) => String(leg.CommCallLeg_CallID)),
  );
  const reviewCallIds = new Map(
    relation.reviews.map((review) => [
      String(review.CRMCallReview_ID),
      String(review.CRMCallReview_CommCallID),
    ]),
  );
  const taskById = new Map(
    relation.tasks.map((task) => [String(task.TodoTask_ID), task]),
  );
  const approvedFollowupCallIds = new Set(
    relation.actions.flatMap((action) => {
      if (
        !["accepted", "edited"].includes(
          String(action.CRMCallAction_DecisionStatus),
        ) ||
        !["create_todo", "follow_up"].includes(
          String(action.CRMCallAction_ActionTypeCode),
        ) || !action.CRMCallAction_TodoTaskID
      ) return [];
      const callId = reviewCallIds.get(
        String(action.CRMCallAction_CallReviewID),
      );
      return callId && answeredIds.has(callId) ? [callId] : [];
    }),
  );
  const completedFollowupCallIds = new Set(
    relation.actions.flatMap((action) => {
      if (
        !["accepted", "edited"].includes(
          String(action.CRMCallAction_DecisionStatus),
        ) ||
        !["create_todo", "follow_up"].includes(
          String(action.CRMCallAction_ActionTypeCode),
        ) || !action.CRMCallAction_TodoTaskID
      ) return [];
      const task = taskById.get(String(action.CRMCallAction_TodoTaskID));
      if (
        !task || task.TodoTask_StatusCode !== "completed" ||
        task.TodoTask_IsDeleted
      ) return [];
      const callId = reviewCallIds.get(
        String(action.CRMCallAction_CallReviewID),
      );
      return callId && answeredIds.has(callId) ? [callId] : [];
    }),
  );
  const approvedFollowups = approvedFollowupCallIds.size;
  const completedFollowups = completedFollowupCallIds.size;
  const hasConfirmedCalls = confirmedOutcomeLegs.length > 0;
  return {
    generatedAt: new Date().toISOString(),
    timezone: timeZone,
    metrics: [
      {
        id: "volume",
        label: "Total calls",
        value: String(totalCalls),
        comparison: null,
        detail: analysisComplete
          ? `${allInbound.length} inbound · ${
            calls.length - allInbound.length
          } outbound`
          : `Exact total · ${calls.length} calls analysed in detail`,
        tone: "neutral",
        evidence: derivedEvidence,
      },
      {
        id: "answered",
        label: "Answered",
        value: hasConfirmedCalls
          ? `${
            Math.round(100 * answered.length / confirmedOutcomeLegs.length)
          }%`
          : "—",
        comparison: null,
        detail: hasConfirmedCalls
          ? `${answered.length} calls`
          : "No confirmed 3CX data",
        tone: "green",
        evidence: providerEvidence,
      },
      {
        id: "outcomes",
        label: "Missed · declined · voicemail",
        value: hasConfirmedCalls
          ? `${missed.length} · ${declined.length} · ${voicemail.length}`
          : "—",
        comparison: null,
        detail: hasConfirmedCalls
          ? "Provider-confirmed outcomes"
          : "No confirmed 3CX data",
        tone: "red",
        evidence: providerEvidence,
      },
      {
        id: "transfer",
        label: "Transfer acceptance",
        value: transferRequested
          ? `${Math.round(100 * transferAccepted / transferRequested)}%`
          : "—",
        comparison: null,
        detail: transferRequested
          ? `${transferAccepted} of ${transferRequested} offered`
          : "No confirmed Twilio transfers",
        tone: "blue",
        evidence: twilioEvidence,
      },
      {
        id: "timing",
        label: "Answer · handling time",
        value: answered.length
          ? `${averageAnswerSeconds}s · ${
            compactDuration(averageHandlingSeconds)
          }`
          : "—",
        comparison: null,
        detail: answered.length
          ? "Start to answer · answer to end"
          : "No answered 3CX calls",
        tone: "amber",
        evidence: derivedEvidence,
      },
      {
        id: "followup",
        label: "Follow-up completion",
        value: approvedFollowups
          ? `${Math.round(100 * completedFollowups / approvedFollowups)}%`
          : "—",
        comparison: null,
        detail: approvedFollowups
          ? `${completedFollowups} of ${approvedFollowups} approved follow-ups completed`
          : "No approved follow-up tasks",
        tone: "teal",
        evidence: derivedEvidence,
      },
    ],
    volumeSeries,
    reasons,
    coverage,
    attention,
    providerStatus,
    analysisScope: {
      status: analysisComplete ? "complete" : "partial",
      totalCalls,
      analysedCalls: calls.length,
      limit: analysisLimit,
      message: analysisComplete
        ? null
        : "Detailed rates and trends cover only the bounded analysed calls; total call volume remains exact.",
    },
    analysis: {
      averageHandlingSeconds,
      followup: {
        approvedCalls: approvedFollowups,
        completedCalls: completedFollowups,
        openCalls: Math.max(0, approvedFollowups - completedFollowups),
      },
    },
  };
}

function confidence(value: unknown) {
  const score = Number(value ?? 0);
  return score >= 0.86 ? "high" : score >= 0.6 ? "medium" : "low";
}

function providerReferencesForClient(legs: Json[]) {
  const seen = new Set<string>();
  const references: Array<{ provider: string; kind: string; id: string }> = [];
  for (const leg of legs) {
    const provider = text(leg.CommCallLeg_ProviderCode, 32);
    for (
      const [kind, value] of [
        ["call", leg.CommCallLeg_ProviderCallID],
        ["conversation", leg.CommCallLeg_ProviderConversationID],
        ["history", leg.CommCallLeg_ProviderHistoryID],
        ["conference", leg.CommCallLeg_ProviderConferenceID],
        ["segment", leg.CommCallLeg_ProviderSegmentID],
        ["parent call", leg.CommCallLeg_ParentProviderCallID],
        ["recording", leg.CommCallLeg_ProviderRecordingID],
      ] as const
    ) {
      const id = text(value, 300);
      if (!provider || !id) continue;
      const referenceKey = `${provider}:${kind}:${id}`;
      if (seen.has(referenceKey)) continue;
      seen.add(referenceKey);
      references.push({ provider, kind, id });
    }
  }
  return references;
}

async function detail(admin: SupabaseClient, actor: Actor, callId: string) {
  if (!uuid(callId)) throw new HttpError(404, "Phone call not found.");
  const callResult = await admin.from("Comm_CallLogs").select("*").eq(
    "CommCall_ID",
    callId,
  ).eq("CommCall_CompanyID", actor.Company_ID).maybeSingle();
  if (callResult.error) throw callResult.error;
  if (!callResult.data) throw new HttpError(404, "Phone call not found.");
  let call = callResult.data as Json;
  if (
    call.CommCall_MatchStatusCode !== "matched" &&
    call.CommCall_MatchMethodCode !== "user_review"
  ) {
    const matched = await admin.rpc("multideck_phone_call_match_candidates", {
      p_company_id: actor.Company_ID,
      p_user_id: actor.User_ID,
      p_call_id: callId,
      p_take: 8,
    });
    if (matched.error) throw matched.error;
    const refreshed = await admin.from("Comm_CallLogs").select("*").eq(
      "CommCall_ID",
      callId,
    ).eq("CommCall_CompanyID", actor.Company_ID).single();
    if (refreshed.error) throw refreshed.error;
    call = refreshed.data as Json;
  }
  const relation = await related(admin, [call]);
  const review = relation.reviews[0] ?? null;
  const [
    segmentsResult,
    participantsResult,
    legsResult,
    candidatesResult,
    contactResult,
  ] = await Promise.all([
    admin.from("Comm_CallTranscriptSegments").select("*").eq(
      "CommCallSeg_CallID",
      callId,
    ).order("CommCallSeg_StartedAt", { ascending: true, nullsFirst: false })
      .order("CommCallSeg_SequenceNo", { ascending: true }),
    admin.from("Comm_CallParticipants").select("*").eq(
      "CommCallParticipant_CallID",
      callId,
    ).order("CommCallParticipant_JoinedAt", { ascending: true }),
    admin.from("Comm_CallProviderLegs").select("*").eq(
      "CommCallLeg_CallID",
      callId,
    ).order("CommCallLeg_SortOrder", { ascending: true }),
    review
      ? admin.from("CRM_CallMatchCandidates").select("*").eq(
        "CRMCallMatch_CallReviewID",
        review.CRMCallReview_ID,
      ).eq("CRMCallMatch_StatusCode", "candidate").order(
        "CRMCallMatch_Rank",
        { ascending: true },
      )
      : Promise.resolve({ data: [], error: null }),
    call.CommCall_MatchedContactID
      ? admin.from("Org_Contacts").select(
        "OrgContact_ID, OrgContact_FirstName, OrgContact_LastName",
      ).eq(
        "OrgContact_ID",
        call.CommCall_MatchedContactID,
      ).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  for (
    const result of [
      segmentsResult,
      participantsResult,
      legsResult,
      candidatesResult,
      contactResult,
    ]
  ) if (result.error) throw result.error;
  const organisation = relation.organisations[0] ?? null;
  const lead = relation.leads[0] ?? null;
  const actions = relation.actions.filter((action) =>
    action.CRMCallAction_CallReviewID === review?.CRMCallReview_ID
  );
  const base = mapListRow(
    call,
    review,
    organisation,
    lead,
    actions,
    relation.tasks,
  );
  const legs = (legsResult.data ?? []) as Json[];
  const consentEvidence = isObject(call.CommCall_ConsentEvidenceJSON)
    ? call.CommCall_ConsentEvidenceJSON
    : {};
  const approvedSummary = text(
    review?.CRMCallReview_UserApprovedSummary,
    4_000,
  );
  const generatedSummary = text(
    review?.CRMCallReview_AISummary ?? call.CommCall_AISummary,
    4_000,
  );
  const evidenceReasons = (evidence: unknown) => {
    if (!isObject(evidence)) return [];
    return Object.entries(evidence).filter(([, value]) =>
      value === true || typeof value === "number"
    ).map(([key]) => key.replace(/([A-Z])/g, " $1").toLowerCase());
  };
  const access = await admin.from("Comm_CallAccessEvents").insert({
    CommCallAccess_CompanyID: actor.Company_ID,
    CommCallAccess_CallID: callId,
    CommCallAccess_UserID: actor.User_ID,
    CommCallAccess_AccessTypeCode: "view",
    CommCallAccess_MetadataJSON: { route: "phone_call_detail" },
  });
  if (access.error) throw access.error;
  return {
    ...base,
    editVersion: Number(call.CommCall_EditVersion ?? 1),
    summary: approvedSummary || generatedSummary || null,
    summarySource: approvedSummary
      ? "user_approved"
      : generatedSummary
      ? "ai_generated"
      : "none",
    meetingNotes: review?.CRMCallReview_MeetingNotes ?? null,
    capturedCallerName: review?.CRMCallReview_CapturedCallerName ?? null,
    capturedCompanyName: review?.CRMCallReview_CapturedCompanyName ?? null,
    callReason: review?.CRMCallReview_CallReason ?? null,
    participants: (participantsResult.data ?? []).map((item: Json) => ({
      id: item.CommCallParticipant_ID,
      name: item.CommCallParticipant_DisplayName,
      phone: item.CommCallParticipant_Phone,
      role: ["caller", "receptionist", "employee"].includes(
          String(item.CommCallParticipant_TypeCode),
        )
        ? item.CommCallParticipant_TypeCode
        : "external",
    })),
    contact: call.CommCall_MatchedContactID
      ? {
        id: call.CommCall_MatchedContactID,
        name: [
          contactResult.data?.OrgContact_FirstName,
          contactResult.data?.OrgContact_LastName,
        ].filter(Boolean).join(" ").trim() || "Contact",
      }
      : null,
    matchCandidates: (candidatesResult.data ?? []).map((item: Json) => ({
      id: item.CRMCallMatch_TargetID,
      recordType: item.CRMCallMatch_EntityTypeCode,
      name: item.CRMCallMatch_TargetLabel,
      secondaryLabel: null,
      confidence: confidence(item.CRMCallMatch_Confidence),
      reasons: evidenceReasons(item.CRMCallMatch_EvidenceJSON),
    })),
    transcriptSegments: (segmentsResult.data ?? []).map((item: Json) => ({
      id: item.CommCallSeg_ID,
      providerSegmentId: item.CommCallSeg_ProviderSegmentID ?? null,
      sourceSequence: item.CommCallSeg_SourceSequenceNo ?? null,
      globalSequence: item.CommCallSeg_SequenceNo ?? null,
      source: item.CommCallSeg_SourceProviderCode === "3cx"
        ? "3cx"
        : "elevenlabs",
      sourceLabel: item.CommCallSeg_SourceProviderCode === "3cx"
        ? "3CX / Jenkar team"
        : "ElevenLabs receptionist",
      speakerLabel: item.CommCallSeg_SpeakerLabel ?? "Participant",
      speakerRole: ["caller", "receptionist", "employee"].includes(
          String(item.CommCallSeg_SpeakerType),
        )
        ? item.CommCallSeg_SpeakerType
        : "external",
      startedAt: item.CommCallSeg_StartedAt ?? null,
      endedAt: item.CommCallSeg_EndedAt ?? null,
      timingProvenance: isObject(item.CommCallSeg_ProviderMetadataJSON)
        ? item.CommCallSeg_ProviderMetadataJSON.timingProvenance ??
          (item.CommCallSeg_StartedAt
            ? "provider_absolute"
            : "source_sequence_only")
        : item.CommCallSeg_StartedAt
        ? "provider_absolute"
        : "source_sequence_only",
      speakerProvenance: isObject(item.CommCallSeg_ProviderMetadataJSON)
        ? item.CommCallSeg_ProviderMetadataJSON.speakerProvenance ?? null
        : null,
      offsetMs: item.CommCallSeg_StartSeconds == null
        ? null
        : Math.round(Number(item.CommCallSeg_StartSeconds) * 1000),
      text: item.CommCallSeg_Text,
      state:
        ["processing", "failed"].includes(String(item.CommCallSeg_StateCode))
          ? item.CommCallSeg_StateCode
          : "complete",
    })),
    suggestedActions: actions.map((item) => {
      const actionPayload = isObject(item.CRMCallAction_ActionPayloadJSON)
        ? item.CRMCallAction_ActionPayloadJSON
        : {};
      const todoTask = relation.tasks.find((task) =>
        String(task.TodoTask_ID) === String(item.CRMCallAction_TodoTaskID)
      ) ?? null;
      return {
        id: item.CRMCallAction_ID,
        type: item.CRMCallAction_ActionTypeCode === "link_lead"
          ? "lead_link"
          : item.CRMCallAction_ActionTypeCode === "create_todo" ||
              item.CRMCallAction_ActionTypeCode === "follow_up"
          ? "todo"
          : "other",
        title: item.CRMCallAction_Title,
        reason: item.CRMCallAction_Description,
        confidence: confidence(item.CRMCallAction_ConfidenceScore),
        draft: {
          title: item.CRMCallAction_Title,
          scheduledDate: todoTask?.TodoTask_ScheduledDate
            ? String(todoTask.TodoTask_ScheduledDate).slice(0, 10)
            : item.CRMCallAction_SuggestedDueAt
            ? String(item.CRMCallAction_SuggestedDueAt).slice(0, 10)
            : null,
          leadId: text(actionPayload.leadId, 36) || null,
          leadLabel: text(actionPayload.leadLabel, 240) || null,
        },
        status: item.CRMCallAction_DecisionStatus === "pending"
          ? "pending"
          : ["accepted", "edited"].includes(
              String(item.CRMCallAction_DecisionStatus),
            )
          ? "approved"
          : "dismissed",
        error: null,
        todoTaskId: item.CRMCallAction_TodoTaskID ?? null,
        todoTaskStatus: todoTask?.TodoTask_IsDeleted
          ? "deleted"
          : todoTask?.TodoTask_StatusCode ?? null,
        todoCompletedAt: todoTask?.TodoTask_CompletedAt ?? null,
        reviewedAt: item.CRMCallAction_DecidedAt ?? null,
      };
    }),
    transfer: {
      offeredAt: call.CommCall_TransferRequestedAt,
      acceptedAt: call.CommCall_TransferAcceptedAt,
      completedAt:
        legs.find((leg) => leg.CommCallLeg_LegTypeCode === "employee")
          ?.CommCallLeg_EndedAt ?? null,
      status: call.CommCall_TransferStatusCode === "accepted"
        ? "accepted"
        : call.CommCall_TransferStatusCode === "declined"
        ? "declined"
        : call.CommCall_TransferStatusCode === "not_requested"
        ? "not_offered"
        : "unknown",
    },
    providerReferences: providerReferencesForClient(legs),
    aiDisclosureStatus: call.CommCall_AIDisclosureStatusCode ?? "unknown",
    recordingConsentStatus: call.CommCall_RecordingConsentStatusCode ??
      "unknown",
    transcriptionConsentStatus: call.CommCall_TranscriptionConsentStatusCode ??
      "unknown",
    consentDisclosureVersion: call.CommCall_ConsentDisclosureVersion ?? null,
    consentDisclosedAt: call.CommCall_ConsentDisclosedAt ?? null,
    consentEvidence: {
      provider: call.CommCall_ConsentSourceProviderCode ?? null,
      sourceEventId: call.CommCall_ConsentSourceEventID ?? null,
      updatedAt: call.CommCall_ConsentEvidenceUpdatedAt ?? null,
      sourceFields: Array.isArray(consentEvidence.sourceFields)
        ? consentEvidence.sourceFields
        : [],
    },
    recordingConsent: call.CommCall_RecordingConsentStatusCode === "received" ||
        call.CommCall_ConsentStatusCode === "received"
      ? "received"
      : call.CommCall_RecordingStatusCode === "not_recorded"
      ? "not_recorded"
      : "unknown",
    recordingState: call.CommCall_RecordingStatusCode === "recorded"
      ? "recorded"
      : call.CommCall_RecordingStatusCode === "not_recorded"
      ? "not_recorded"
      : "unavailable",
    retentionUntil: call.CommCall_RetentionUntil,
    timezone: "Europe/London",
  };
}

async function reviewRoute(
  request: Request,
  admin: SupabaseClient,
  actor: Actor,
  parts: string[],
) {
  await requirePermission(admin, actor.User_ID, "CRM.PhoneCalls.Review");
  const callId = parts[1];
  const payload = await body<Json>(request);
  if (request.method === "PATCH" && parts[2] === "match") {
    const resolution = text(payload.resolution, 30);
    if (resolution === "create_contact") {
      throw new HttpError(
        422,
        "Create the contact in CRM first, then link this call to the confirmed record.",
      );
    }
    const result = await admin.rpc("multideck_phone_call_review_match", {
      p_company_id: actor.Company_ID,
      p_user_id: actor.User_ID,
      p_call_id: callId,
      p_resolution: resolution === "leave_unmatched" ? "unmatched" : "link",
      p_company_target_id: uuid(payload.companyId) || null,
      p_contact_target_id: uuid(payload.contactId) || null,
      p_lead_target_id: uuid(payload.leadId) || null,
      p_expected_version: Number(payload.editVersion ?? 0) || null,
    });
    if (result.error) throw result.error;
  } else if (request.method === "PATCH" && parts[2] === "notes") {
    const result = await admin.rpc("multideck_phone_call_save_notes", {
      p_company_id: actor.Company_ID,
      p_user_id: actor.User_ID,
      p_call_id: callId,
      p_summary: text(payload.summary, 4_000) || null,
      p_meeting_notes: text(payload.meetingNotes, 12_000) || null,
      p_expected_version: Number(payload.editVersion ?? 0) || null,
    });
    if (result.error) throw result.error;
  } else if (
    request.method === "POST" && parts[2] === "actions" && parts[4] === "review"
  ) {
    const draft = isObject(payload.editedDraft) ? payload.editedDraft : {};
    const result = await admin.rpc("multideck_phone_call_review_action_v2", {
      p_company_id: actor.Company_ID,
      p_user_id: actor.User_ID,
      p_call_id: callId,
      p_action_id: parts[3],
      p_decision: text(payload.decision, 20),
      p_edited_title: text(draft.title, 240) || null,
      p_scheduled_date: text(draft.scheduledDate, 10) || null,
      p_priority: text(draft.priority, 20) || null,
      p_reason: text(draft.reason, 1_000) || null,
      p_edited_lead_id: uuid(draft.leadId) || null,
    });
    if (result.error) throw result.error;
  } else throw new HttpError(404, "Phone-call action not found.");
  return json(request, await detail(admin, actor, callId));
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  const parts = routeParts(request, "phone-calls");
  try {
    if (
      request.method === "POST" && parts[0] === "webhooks" &&
      parts[1] === "elevenlabs" && parts[2] === "personalization"
    ) return await handlePersonalization(request, parts);
    if (
      request.method === "POST" &&
      parts.join("/") === "webhooks/elevenlabs/post-call"
    ) return await handleElevenLabsPostCall(request);
    if (
      request.method === "POST" && parts.join("/") === "webhooks/twilio/status"
    ) return await handleTwilioStatus(request);
    if (
      request.method === "POST" && parts.join("/") === "webhooks/twilio/sync"
    ) return await handleTwilioSyncWebhook(request);
    if (
      request.method === "POST" &&
      parts.join("/") === "webhooks/jenkar/screening"
    ) return await handleJenkarScreening(request);
    if (
      request.method === "POST" &&
      parts.join("/") === "webhooks/jenkar/sync-snapshot"
    ) return await handleJenkarSyncSnapshot(request);
    if (request.method === "POST" && parts.join("/") === "sync/twilio") {
      return await handleTwilioSync(request);
    }
    if (request.method === "POST" && parts.join("/") === "sync/elevenlabs") {
      return await handleElevenLabsSync(request);
    }
    if (request.method === "POST" && parts.join("/") === "sync/3cx-xapi") {
      return await handle3cxXapiSync(request);
    }
    if (request.method === "POST" && parts.join("/") === "sync/3cx") {
      return await handle3cxSync(request);
    }
    if (
      request.method === "POST" &&
      parts.join("/") === "maintenance/retention"
    ) return await handleRetentionMaintenance(request);
    if (
      request.method === "POST" &&
      parts.join("/") === "maintenance/retry"
    ) return await handleRetryMaintenance(request);

    const { admin, actor } = await actorContext(request);
    if (request.method === "GET" && parts[0] === "overview") {
      return json(request, await overview(admin, actor, new URL(request.url)));
    }
    if (
      request.method === "GET" && parts.length === 1 && parts[0] === "calls"
    ) {
      return json(request, await readCalls(admin, actor, new URL(request.url)));
    }
    if (
      request.method === "GET" && parts.length === 2 && parts[0] === "calls"
    ) {
      return json(request, await detail(admin, actor, parts[1]));
    }
    if (parts[0] === "calls" && parts.length >= 3) {
      return await reviewRoute(request, admin, actor, parts);
    }
    throw new HttpError(404, "Phone-call route not found.");
  } catch (error) {
    console.error(error);
    const code = isObject(error) ? text(error.code, 20) : "";
    const knownStatus = code === "42501"
      ? 403
      : code === "P0002"
      ? 404
      : code === "P0001" || code === "23505"
      ? 409
      : code === "22023"
      ? 422
      : 500;
    const status = error instanceof HttpError ||
        error instanceof PhoneCallInputError
      ? error.status
      : knownStatus;
    const providerRoute = parts[0] === "webhooks" || parts[0] === "sync";
    const safeDatabaseMessage = ["42501", "P0002", "P0001", "22023"].includes(
        code,
      ) && isObject(error)
      ? text(error.message, 300)
      : "";
    const message = error instanceof HttpError ||
        error instanceof PhoneCallInputError
      ? error.message
      : safeDatabaseMessage ||
        "The phone-call workflow could not complete the request.";
    return providerRoute
      ? providerResponse({ ok: false, detail: message }, status)
      : json(request, { detail: message }, status);
  }
});
