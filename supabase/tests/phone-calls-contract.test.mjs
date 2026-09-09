import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const migrationPath = new URL("../migrations/20260822141406_phone_calls_crm_foundation.sql", import.meta.url)
const triggerHardeningPath = new URL("../migrations/20260822141634_phone_call_trigger_acl_hardening.sql", import.meta.url)
const viewHardeningPath = new URL("../migrations/20260822141842_phone_call_summary_view_hardening.sql", import.meta.url)
const privacyHardeningPath = new URL("../migrations/20260823075526_phone_call_retention_privacy_hardening.sql", import.meta.url)
const consentRetryPath = new URL("../migrations/20260823075534_phone_call_consent_and_retry_safety.sql", import.meta.url)
const continuousWorkersPath = new URL("../migrations/20260823080657_phone_call_continuous_workers.sql", import.meta.url)
const safetyParityPath = new URL("../migrations/20260823083757_phone_call_crm_safety_and_dexter_watch_parity.sql", import.meta.url)
const actionEffectPath = new URL("../migrations/20260823092500_phone_call_dexter_action_effect.sql", import.meta.url)
const matchInvariantPath = new URL("../migrations/20260823100630_phone_call_match_invariant.sql", import.meta.url)
const reviewableLeadTargetPath = new URL("../migrations/20260823103036_phone_call_reviewable_lead_target.sql", import.meta.url)
const confirmedCrmLinksPath = new URL("../migrations/20260823144119_phone_call_confirmed_crm_links.sql", import.meta.url)
const threeCxXapiSchedulePath = new URL("../migrations/20260823144126_phone_call_3cx_xapi_schedule.sql", import.meta.url)
const confirmedMatchStatePath = new URL("../migrations/20260823160931_phone_call_confirmed_match_state_invariant.sql", import.meta.url)
const transcriptUpsertIndexPath = new URL("../migrations/20260823172644_phone_call_transcript_segment_upsert_index.sql", import.meta.url)
const functionPath = new URL("../functions/phone-calls/index.ts", import.meta.url)
const threeCxXapiPath = new URL("../functions/phone-calls/three_cx_xapi.ts", import.meta.url)
const dexterFunctionPath = new URL("../functions/agent-dexter/index.ts", import.meta.url)
const configPath = new URL("../config.toml", import.meta.url)
const liveProofPath = new URL("./phone-calls-security-live-proof.sql", import.meta.url)

const [
  migration,
  triggerHardening,
  viewHardening,
  privacyHardening,
  consentRetry,
  continuousWorkers,
  safetyParity,
  actionEffect,
  matchInvariant,
  reviewableLeadTarget,
  confirmedCrmLinks,
  threeCxXapiSchedule,
  confirmedMatchState,
  transcriptUpsertIndex,
  edgeFunction,
  threeCxXapi,
  dexterFunction,
  config,
  liveProof,
] = await Promise.all([
  readFile(migrationPath, "utf8"),
  readFile(triggerHardeningPath, "utf8"),
  readFile(viewHardeningPath, "utf8"),
  readFile(privacyHardeningPath, "utf8"),
  readFile(consentRetryPath, "utf8"),
  readFile(continuousWorkersPath, "utf8"),
  readFile(safetyParityPath, "utf8"),
  readFile(actionEffectPath, "utf8"),
  readFile(matchInvariantPath, "utf8"),
  readFile(reviewableLeadTargetPath, "utf8"),
  readFile(confirmedCrmLinksPath, "utf8"),
  readFile(threeCxXapiSchedulePath, "utf8"),
  readFile(confirmedMatchStatePath, "utf8"),
  readFile(transcriptUpsertIndexPath, "utf8"),
  readFile(functionPath, "utf8"),
  readFile(threeCxXapiPath, "utf8"),
  readFile(dexterFunctionPath, "utf8"),
  readFile(configPath, "utf8"),
  readFile(liveProofPath, "utf8"),
])

function sourceSection(source, start, end) {
  const startIndex = source.indexOf(start)
  const endIndex = source.indexOf(end, startIndex + start.length)
  assert.notEqual(startIndex, -1, `Missing source section start: ${start}`)
  assert.notEqual(endIndex, -1, `Missing source section end: ${end}`)
  return source.slice(startIndex, endIndex)
}

test("phone call provider data is server-only and permission scoped", () => {
  assert.match(migration, /CRM\.PhoneCalls\.Read/)
  assert.match(migration, /CRM\.PhoneCalls\.Review/)
  assert.match(migration, /revoke all on table public\."Comm_CallLogs"[\s\S]*from public, anon, authenticated;/)
  assert.match(migration, /grant all on table public\."Comm_CallLogs"[\s\S]*to service_role;/)
  assert.match(edgeFunction, /requirePermission\(admin, actor\.User_ID, "CRM\.PhoneCalls\.Read"\)/)
  assert.match(edgeFunction, /requirePermission\(admin, actor\.User_ID, "CRM\.PhoneCalls\.Review"\)/)
})

test("legacy call review records and every call summary view share the service-only boundary", () => {
  for (const table of [
    "CRM_CallReviewDecisions",
    "CRM_CallEntityLinks",
    "CRM_CallSummaryNotes",
  ]) {
    assert.match(privacyHardening, new RegExp(`alter table public\\."${table}" enable row level security`))
    assert.match(privacyHardening, new RegExp(`revoke all on table[\\s\\S]*public\\."${table}"[\\s\\S]*from public, anon, authenticated`))
  }
  for (const view of [
    "Comm_CallLogSummary",
    "CRM_CallActionAcceptanceSummary",
    "CRM_CallReviewTodoQueue",
    "CRM_PostCallReviewQueue",
  ]) {
    const source = view === "Comm_CallLogSummary" ? viewHardening : privacyHardening
    assert.match(source, new RegExp(`alter view public\\."${view}" set \\(security_invoker = true\\)`))
    assert.match(source, new RegExp(`revoke all on table[\\s\\S]*public\\."${view}"[\\s\\S]*from public, anon, authenticated`))
  }
})

test("actor, call and action predicates prevent cross-company or inactive-user access", () => {
  const actorBoundary = sourceSection(
    migration,
    "create or replace function public._multideck_phone_assert_actor(",
    "create or replace function public.multideck_phone_call_match_candidates(",
  )
  assert.match(actorBoundary, /actor\."User_ID" = p_user_id/)
  assert.match(actorBoundary, /actor\."Company_ID" = p_company_id/)
  assert.match(actorBoundary, /coalesce\(actor\."User_AccessStatus", 'active'\) = 'active'/)
  assert.match(actorBoundary, /_multideck_crm_has_permission\(p_user_id, p_permission\)/)

  const reviewAction = sourceSection(
    migration,
    "create or replace function public._multideck_phone_call_review_action_for_actor(",
    "create or replace function public.multideck_phone_call_review_action(",
  )
  assert.match(reviewAction, /call\."CommCall_ID" = p_call_id/)
  assert.match(reviewAction, /call\."CommCall_CompanyID" = p_company_id/)
  assert.match(reviewAction, /action\."CRMCallAction_ID" = p_action_id/)
  assert.match(reviewAction, /for update of action/)
  assert.match(reviewAction, /suggested lead is outside this workspace/i)
})

test("ingestion is durable, idempotent and keeps provider provenance", () => {
  assert.match(migration, /"Comm_CallIngestionEvents"/)
  assert.match(migration, /"UX_Comm_CallIngestionEvents_delivery" unique/)
  assert.match(migration, /"Comm_CallProviderLegs"/)
  assert.match(migration, /"UX_Comm_CallProviderLegs_provider_id" unique/)
  assert.match(migration, /"UX_Comm_CallTranscriptSegments_source_segment"/)
  assert.match(edgeFunction, /verifyElevenLabsSignature/)
  assert.match(edgeFunction, /verifyTwilioSignature/)
  assert.match(edgeFunction, /candidateIsSafe/)
  assert.match(edgeFunction, /payloadHash\.slice\(0, 16\)/)
  assert.match(edgeFunction, /CommCallEvent_AttemptCount:[\s\S]*\+ 1/)
})

test("transcript segment upserts use an inferable unique conflict target", () => {
  assert.match(
    transcriptUpsertIndex,
    /drop index if exists public\."UX_Comm_CallTranscriptSegments_source_segment"/,
  )
  assert.match(
    transcriptUpsertIndex,
    /create unique index "UX_Comm_CallTranscriptSegments_source_segment"[\s\S]*"CommCallSeg_SourceLegID"[\s\S]*"CommCallSeg_ProviderSegmentID"/,
  )
  assert.doesNotMatch(transcriptUpsertIndex, /\)\s*where\b/i)
  const transcriptWriter = sourceSection(
    edgeFunction,
    "async function writeTranscript(",
    "async function refreshTranscriptRollup(",
  )
  assert.match(
    transcriptWriter,
    /onConflict: "CommCallSeg_SourceLegID,CommCallSeg_ProviderSegmentID"/,
  )
})

test("call detail provider references are deduplicated before rendering", () => {
  const referenceFormatter = sourceSection(
    edgeFunction,
    "function providerReferencesForClient(",
    "async function detail(",
  )
  assert.match(referenceFormatter, /const seen = new Set<string>\(\)/)
  assert.match(referenceFormatter, /const referenceKey = `\$\{provider\}:\$\{kind\}:\$\{id\}`/)
  assert.match(referenceFormatter, /if \(seen\.has\(referenceKey\)\) continue/)
  assert.match(edgeFunction, /providerReferences: providerReferencesForClient\(legs\)/)
})

test("duplicate provider event IDs cannot hide a conflicting payload", () => {
  const recorder = sourceSection(
    edgeFunction,
    "async function recordEvent(admin: SupabaseClient",
    "async function finishEvent(",
  )
  assert.match(
    recorder,
    /CommCallEvent_PayloadHashSHA256[\s\S]*constantTimeEqual\([\s\S]*input\.payloadHash/,
  )
  assert.match(
    recorder,
    /new PhoneCallInputError\([\s\S]*409,[\s\S]*provider event ID was reused with different content/,
  )
})

test("generated actions stay reviewable and use the real To Do boundary", () => {
  assert.match(migration, /CRMCallAction_DecisionStatus" <> 'pending'/)
  assert.match(migration, /_multideck_todo_create_for_actor/)
  assert.match(migration, /p_decision not in \('approve', 'dismiss'\)/)
  assert.match(migration, /Comm_CallAccessEvents/)
  assert.match(edgeFunction, /CommCallAccess_AccessTypeCode: "view"/)
  assert.match(actionEffect, /"AIDexterAction_HasExternalEffect" = true/)
  assert.match(edgeFunction, /from\("OPS_UserTasks"\)\.select/)
  assert.match(edgeFunction, /TodoTask_StatusCode === "completed"/)
  assert.match(edgeFunction, /followUpStatus: completed/)
})

test("an edited lead-link target reaches the same review, permission and audit boundary", () => {
  const reviewHandler = sourceSection(
    edgeFunction,
    "async function reviewRoute(",
    "Deno.serve(async (request) =>",
  )
  assert.match(reviewHandler, /multideck_phone_call_review_action_v2/)
  assert.match(reviewHandler, /p_edited_lead_id: uuid\(draft\.leadId\) \|\| null/)
  assert.match(reviewableLeadTarget, /perform public\._multideck_phone_assert_actor\(p_company_id, p_user_id, 'CRM\.PhoneCalls\.Review'\)/)
  assert.match(reviewableLeadTarget, /for update of action/)
  assert.match(reviewableLeadTarget, /coalesce\(p_edited_lead_id, v_original_lead_id\)/)
  assert.match(reviewableLeadTarget, /The selected lead is outside this workspace/)
  assert.match(reviewableLeadTarget, /multideck_crm_company_can_access_account/)
  assert.match(reviewableLeadTarget, /CRMCallDecision_MetadataJSON/)
  assert.match(reviewableLeadTarget, /'originalLeadId', v_original_lead_id/)
  assert.match(reviewableLeadTarget, /'reviewedLeadId', v_lead_id/)
  assert.match(reviewableLeadTarget, /multideck_dexter_action_review_phone_call/)
  assert.match(reviewableLeadTarget, /edited_lead_id/)
  assert.match(reviewableLeadTarget, /"AIDexterAction_HasExternalEffect" = true/)
  assert.match(reviewableLeadTarget, /revoke all on function public\.multideck_phone_call_review_action_v2/)
  assert.match(reviewableLeadTarget, /grant execute on function public\.multideck_phone_call_review_action_v2[\s\S]*to service_role/)
})

test("large phone analytics ranges disclose their bounded analysis scope", () => {
  const analytics = sourceSection(
    edgeFunction,
    "async function overview(admin: SupabaseClient, actor: Actor, url: URL)",
    "function confidence(value: unknown)",
  )
  assert.match(analytics, /count: "exact"/)
  assert.match(analytics, /analysisComplete/)
  assert.match(analytics, /status: analysisComplete \? "complete" : "partial"/)
  assert.match(analytics, /total call volume remains exact/i)
})

test("retention maintenance keeps recording deletion retryable and company scoped", () => {
  assert.match(edgeFunction, /maintenance\/retention/)
  assert.match(edgeFunction, /multideck_phone_call_purge_expired/)
  assert.match(edgeFunction, /CommCall_CompanyID[^\n]*companyId/)
  assert.match(edgeFunction, /RecordingStatusCode",\s*"purge_pending"/)
  assert.match(edgeFunction, /admin\.storage\.from\(bucket\)\.remove\(\[path\]\)/)
  assert.match(edgeFunction, /multideck_phone_call_mark_recording_purged/)
  assert.match(edgeFunction, /recordingsPurged/)
})

test("call analytics use tenant-local reporting days", () => {
  assert.match(edgeFunction, /localDateBoundary/)
  assert.match(edgeFunction, /dateKeyInTimeZone/)
  assert.match(edgeFunction, /reportingTimeZone/)
  assert.doesNotMatch(edgeFunction, /CommCall_StartedAt\)\.slice\(5, 10\)/)
})

test("Dexter and Watching for you have explicit phone-call parity", () => {
  assert.match(migration, /multideck_dexter_domain_phone_calls/)
  assert.match(migration, /review_phone_call_suggestion/)
  assert.match(migration, /'phone_calls', 'Phone calls'/)
  assert.match(migration, /TR_Comm_CallLogs_dexter_watch/)
  assert.match(migration, /TR_CRM_CallActionCandidates_dexter_watch/)
  assert.match(migration, /TR_CRM_CallReviews_dexter_watch/)
  assert.match(dexterFunction, /capability === "phone_calls"/)
  assert.match(dexterFunction, /domain === "phone_calls"/)
  assert.match(dexterFunction, /Never claim a partial transcript is complete or choose a caller match/)
})

test("Watching for you is event-driven, company scoped and callable only by service role", () => {
  for (const functionName of [
    "_multideck_phone_call_watch_source_change",
    "_multideck_phone_call_action_watch_source_change",
    "_multideck_phone_call_review_watch_source_change",
  ]) {
    assert.match(triggerHardening, new RegExp(`revoke all on function public\\.${functionName}\\(\\) from public, anon, authenticated`))
    assert.match(triggerHardening, new RegExp(`grant execute on function public\\.${functionName}\\(\\) to service_role`))
  }
  assert.match(migration, /watch\."AIDexterWatch_CompanyID" = new\."CommCall_CompanyID"/)
  assert.match(migration, /watch\."AIDexterWatch_StatusCode" = 'active'/)
  assert.match(migration, /watch\."AIDexterWatch_TargetID" is null or watch\."AIDexterWatch_TargetID" = new\."CommCall_ID"/)
  assert.match(migration, /insert into public\."AI_DexterWatchSignals"/)
})

test("retention removes linked raw and AI-derived content without orphaning recordings", () => {
  assert.match(privacyHardening, /CommCallSeg_RawEventID/)
  assert.match(privacyHardening, /CommCallEvent_RawPayloadJSON" = '\{\}'::jsonb/)
  assert.match(privacyHardening, /CommCallEvent_CompanyID" = p_company_id/)
  assert.match(privacyHardening, /CommCallLeg_CallID" = any\(v_call_ids\)/)
  assert.match(privacyHardening, /CommCallLeg_ProviderConversationID/)
  assert.match(privacyHardening, /CommCallLeg_ProviderHistoryID/)
  assert.match(privacyHardening, /CommCallLeg_ProviderConferenceID/)
  assert.match(privacyHardening, /CommCallEvent_EventType" = 'conversation_initiation'/)
  assert.match(privacyHardening, /delete from public\."Comm_CallActionItems"/)
  assert.match(privacyHardening, /delete from public\."Comm_CallAIOutputs"/)
  assert.match(privacyHardening, /CRMCallReview_AISummary" = null/)
  assert.match(privacyHardening, /CommCall_RecordingStatusCode" = case[\s\S]*else 'purge_pending'/)
  assert.doesNotMatch(privacyHardening, /delete from storage\.objects/i)

  const actionExpiry = sourceSection(
    privacyHardening,
    "update public.\"CRM_CallActionCandidates\" action",
    "update public.\"CRM_CallReviews\" review",
  )
  assert.match(actionExpiry, /CRMCallAction_Title" = 'Expired call suggestion'/)
  assert.match(actionExpiry, /CRMCallAction_DecisionStatus" = 'expired'/)
  assert.match(actionExpiry, /CRMCallAction_DecisionStatus" = 'pending'/)
  assert.match(actionExpiry, /CRMCallAction_MetadataJSON" @> '\{"generated":true\}'::jsonb/)
  assert.doesNotMatch(actionExpiry, /accepted|edited/)
  assert.doesNotMatch(privacyHardening, /CRMCallDecision_OriginalText" = null/)

  const recordingFinalizer = sourceSection(
    privacyHardening,
    "create or replace function public.multideck_phone_call_mark_recording_purged(",
    "revoke all on function public.multideck_phone_call_mark_recording_purged",
  )
  assert.match(recordingFinalizer, /call\."CommCall_CompanyID" = p_company_id/)
  assert.match(recordingFinalizer, /call\."CommCall_RetentionUntil" <= now\(\)/)
  assert.match(recordingFinalizer, /call\."CommCall_RecordingStatusCode" = 'purge_pending'/)
})

test("the deployment proof checks RLS, view mode, ACLs, triggers and Dexter registry without writes", () => {
  assert.match(liveProof, /relation\.relrowsecurity/)
  assert.match(liveProof, /security_invoker=true/)
  assert.match(liveProof, /has_function_privilege\('anon'/)
  assert.match(liveProof, /TR_Comm_CallLogs_dexter_watch/)
  assert.match(liveProof, /AIDexterAction_RequiredPermissionsJSON/)
  assert.doesNotMatch(liveProof, /\b(insert|update|delete|truncate)\b/i)
})

test("provider routes own their authentication because JWT verification is disabled", () => {
  assert.match(config, /\[functions\.phone-calls\]\s+verify_jwt = false/)
  assert.match(edgeFunction, /ELEVENLABS_PERSONALIZATION_SECRET/)
  assert.match(edgeFunction, /ELEVENLABS_WEBHOOK_SECRET/)
  assert.match(edgeFunction, /TWILIO_AUTH_TOKEN/)
  assert.match(edgeFunction, /PHONE_CALLS_WORKER_SECRET/)
  assert.match(edgeFunction, /type: "conversation_initiation_client_data"/)
  assert.match(edgeFunction, /"call_id"/)
})

test("Jenkar conference and ElevenLabs SIP legs share the stable screening ID", () => {
  assert.match(edgeFunction, /webhooks\/jenkar\/screening/)
  assert.match(edgeFunction, /sip_screening_id/)
  assert.match(edgeFunction, /system__call_sid/)
  assert.match(edgeFunction, /sip_call_id/)
  assert.match(edgeFunction, /jenkar_screening_id/)
  assert.match(edgeFunction, /findCallByCorrelation/)
  assert.match(edgeFunction, /multideck_worker_secret/)
  assert.match(edgeFunction, /normalizeJenkarScreeningOutcome/)
  assert.match(edgeFunction, /CommCall_TransferAcceptedAt/)
})

test("Twilio Sync polling is leased and advances only after event ingestion", () => {
  const sync = sourceSection(
    edgeFunction,
    "async function handleTwilioSync(request: Request)",
    "async function handleTwilioStatus(request: Request)",
  )
  assert.match(edgeFunction, /sync\/twilio/)
  assert.match(sync, /collectTwilioSyncDocuments/)
  assert.match(sync, /multideck_phone_call_provider_sync_claim/)
  assert.match(sync, /for \(const snapshot of collection\.snapshots\)[\s\S]*for \(const event of snapshot\.events\)[\s\S]*ingestJenkarScreeningPayload/)
  assert.match(sync, /multideck_phone_call_provider_sync_commit/)
  assert.match(sync, /multideck_phone_call_provider_sync_fail/)
  assert.ok(
    sync.indexOf("ingestJenkarScreeningPayload(") <
      sync.indexOf('"multideck_phone_call_provider_sync_commit"'),
    "provider events must be ingested before the cursor is committed",
  )
})

test("Twilio Sync snapshot fan-out is bounded, worker-authenticated and reuses idempotent ingestion", () => {
  const handler = sourceSection(
    edgeFunction,
    "async function handleJenkarSyncSnapshot(request: Request)",
    "function readTwilioSyncCheckpoint(value: unknown)",
  )
  assert.match(edgeFunction, /webhooks\/jenkar\/sync-snapshot/)
  assert.match(handler, /x-multideck-worker-secret/)
  assert.match(handler, /constantTimeEqual\(supplied, expected\)/)
  assert.match(handler, /TWILIO_SYNC_SNAPSHOT_MAX_BYTES/)
  assert.match(handler, /normalizeTwilioSyncDocument\(payload\)/)
  assert.match(handler, /!snapshot \|\| !snapshot\.checkpointEligible/)
  assert.match(handler, /for \(const event of snapshot\.events\)[\s\S]*ingestJenkarScreeningPayload/)
  assert.match(handler, /"multideck_worker_secret"/)
})

test("Twilio Sync Service webhooks are signed, service-scoped and reuse idempotent ingestion", () => {
  const handler = sourceSection(
    edgeFunction,
    "async function handleTwilioSyncWebhook(request: Request)",
    "function readTwilioSyncCheckpoint(value: unknown)",
  )
  assert.match(edgeFunction, /webhooks\/twilio\/sync/)
  assert.match(handler, /application\/x-www-form-urlencoded/)
  assert.match(handler, /TWILIO_SYNC_WEBHOOK_MAX_BYTES/)
  assert.match(handler, /x-twilio-signature/)
  assert.match(handler, /if \(!signature\) throw new HttpError\(401/)
  assert.match(handler, /verifyTwilioSignature/)
  assert.match(handler, /TWILIO_AUTH_TOKEN/)
  assert.match(handler, /expectedServiceSid: secret\("TWILIO_SYNC_SERVICE_SID"\)/)
  assert.match(handler, /parseTwilioSyncWebhook/)
  assert.match(handler, /normalizeTwilioSyncDocument\(webhook\.document\)/)
  assert.match(handler, /for \(const event of snapshot\.events\)[\s\S]*ingestJenkarScreeningPayload/)
  assert.match(handler, /"twilio_signature"/)
  assert.ok(
    handler.indexOf("if (!signature)") <
      handler.indexOf('secret("TWILIO_AUTH_TOKEN")'),
    "unsigned requests must fail closed even when provider signing configuration is absent",
  )
  assert.ok(
    handler.indexOf("verifyTwilioSignature(") <
      handler.indexOf("normalizeTwilioSyncDocument("),
    "unverified Sync content must never reach normalization or ingestion",
  )
})

test("Twilio status persistence failures remain retryable after durable event recording", () => {
  const handler = sourceSection(
    edgeFunction,
    "async function handleTwilioStatus(request: Request)",
    "async function correlate3cx(",
  )
  assert.match(handler, /const delivery = replay[\s\S]*await recordEvent\(admin,/)
  assert.match(handler, /try \{[\s\S]*await finishEvent\([\s\S]*delivery\.event\.CommCallEvent_ID,[\s\S]*"complete",[\s\S]*retryLease,[\s\S]*\)/)
  assert.match(handler, /catch \(error\) \{[\s\S]*await finishEvent\([\s\S]*delivery\.event\.CommCallEvent_ID,[\s\S]*"retryable",[\s\S]*error,[\s\S]*\)/)
})

test("one external caller is shared across correlated provider legs", () => {
  assert.match(edgeFunction, /CommCallParticipant_ProviderParticipantID: `\$\{callId\}:caller`/)
  assert.match(edgeFunction, /input\.legType === "carrier" \|\| input\.provider === "elevenlabs"/)
  assert.doesNotMatch(edgeFunction, /`\$\{input\.providerCallId\}:caller`/)
})

test("overview separates provider-leg facts from derived decision support", () => {
  const analytics = sourceSection(
    edgeFunction,
    "async function overview(admin: SupabaseClient, actor: Actor, url: URL)",
    "function confidence(value: unknown)",
  )
  assert.match(edgeFunction, /const timeZone = reportingTimeZone\(url\)/)
  assert.match(edgeFunction, /dateFilter\(url\.searchParams\.get\("to"\), true, timeZone\)/)
  assert.match(edgeFunction, /label: "Missed · declined · voicemail"/)
  assert.match(edgeFunction, /label: "Answer · handling time"/)
  assert.match(edgeFunction, /kind: "provider_confirmed"[\s\S]*source: "3cx"/)
  assert.match(edgeFunction, /kind: "provider_confirmed"[\s\S]*source: "twilio"/)
  assert.match(edgeFunction, /kind: "derived"[\s\S]*source: "multideck"/)
  assert.match(edgeFunction, /outcomeForClient\(leg\.CommCallLeg_OutcomeCode\)/)
  assert.match(edgeFunction, /threeCxLegsByCall/)
  assert.match(edgeFunction, /twilioTransferRequestedCallIds/)
  assert.match(edgeFunction, /twilioTransferAcceptedCallIds/)
  assert.match(edgeFunction, /No confirmed Twilio transfers/)
  assert.doesNotMatch(edgeFunction, /CommCall_TransferStatusCode !== "not_requested"/)
  assert.match(edgeFunction, /label: "Follow-up completion"/)
  assert.match(edgeFunction, /approvedFollowupCallIds/)
  assert.match(edgeFunction, /completedFollowupCallIds/)
  assert.match(edgeFunction, /\["create_todo", "follow_up"\]\.includes/)
  assert.match(edgeFunction, /No approved follow-up tasks/)
  assert.match(edgeFunction, /Comm_CallProviderSyncCursors/)
  assert.match(edgeFunction, /label: "ElevenLabs receptionist"/)
  assert.match(edgeFunction, /label: "Twilio screening"/)
  assert.match(edgeFunction, /label: "3CX employee calls"/)
  assert.match(edgeFunction, /\? "not_configured"/)
  assert.match(edgeFunction, /consecutiveFailures: failures/)
  assert.match(edgeFunction, /if \(outcome !== "answered" && outcome !== "missed"\) continue/)
  assert.doesNotMatch(edgeFunction, /outcomeForClient\(call\.CommCall_OutcomeCode\) === "answered"[\s\S]{0,100}\? "Answered"[\s\S]{0,100}: "Missed"/)
  assert.match(analytics, /CommCallLeg_DirectionCode/)
  assert.match(analytics, /for \(const leg of threeCxLegsByCall\.values\(\)\)/)
  assert.match(analytics, /threeCxLegsByCall\.get\(String\(review\.CRMCallReview_CommCallID\)\)/)
  assert.match(analytics, /const confirmedLeg = threeCxLegsByCall\.get\(String\(call\.CommCall_ID\)\)/)
  assert.doesNotMatch(analytics, /outcomeForClient\(call\.CommCall_OutcomeCode\)/)
  assert.match(analytics, /evidence: \{ kind: "provider_confirmed", source: "3cx", observedAt: to \}/)
  assert.match(analytics, /evidence: \{ kind: "derived", source: "multideck", observedAt: to \}/)
})

test("3CX call and transcript roll-ups use CRM-safe states", () => {
  assert.match(edgeFunction, /callWorkflowStatus\([\s\S]*record\.outcome,[\s\S]*record\.endedAt/)
  assert.match(edgeFunction, /refreshTranscriptRollup\(admin, created\.callId\)/)
  assert.doesNotMatch(edgeFunction, /CommCall_StatusCode: record\.endedAt \? "completed" : "in_progress"/)
  assert.match(edgeFunction, /unique_phone_extension_time/)
  assert.match(edgeFunction, /missing_employee_extension/)
  assert.match(edgeFunction, /started - 2 \* 60_000/)
  assert.doesNotMatch(edgeFunction, /started - 10 \* 60_000/)
  assert.match(edgeFunction, /CommCall_TransferAcceptedAt: record\.transferAcceptedAt/)
  assert.doesNotMatch(edgeFunction, /CommCall_TransferAcceptedAt: record\.transferStatus === "accepted"[\s\S]{0,100}record\.answeredAt/)
})

test("3CX correlation fails closed for a history ID spanning multiple calls", () => {
  const correlation = sourceSection(
    edgeFunction,
    "async function correlate3cx(",
    "async function ingest3cxRecord(",
  )
  assert.match(correlation, /\.eq\("CommCallLeg_ProviderCallID", record\.cdrId\)/)
  assert.match(correlation, /method: "3cx_cdr_id"/)
  assert.match(correlation, /\.eq\("CommCallLeg_ProviderHistoryID", record\.callHistoryId\)/)
  assert.match(correlation, /callIds\.length === 1/)
  assert.match(correlation, /reason: "duplicate_history_call_ids"/)
  assert.doesNotMatch(correlation, /\.or\(exactFilters/)
})

test("summaries and review-only actions refresh from the combined transcript", () => {
  const combined = sourceSection(
    edgeFunction,
    "async function refreshCombinedTranscriptInsights(",
    "async function handlePersonalization(",
  )
  assert.match(combined, /deriveCombinedTranscriptInsights/)
  assert.match(combined, /combined_chronological_transcript/)
  assert.match(combined, /transcriptTruncated/)
  assert.match(combined, /CRMCallReview_AISummary: insights\.summary/)
  assert.match(combined, /CommCall_AISummary: insights\.summary/)
  assert.match(combined, /CRMCallAction_DecisionStatus[\s\S]*=== "pending"/)
  assert.match(combined, /requiresReview: true/)
  assert.match(combined, /segmentIds: suggestion\.evidenceSegmentIds/)
  assert.match(edgeFunction, /await refreshCombinedTranscriptInsights\([\s\S]*legResult\.callId/)
  assert.match(edgeFunction, /await refreshCombinedTranscriptInsights\([\s\S]*created\.callId/)
  assert.doesNotMatch(combined, /CRMCallReview_UserApprovedSummary/)
})

test("Lead and Company call filters expose only canonical approved links", () => {
  const list = sourceSection(
    edgeFunction,
    "async function readCalls(",
    "async function overview(",
  )
  assert.match(list, /url\.searchParams\.has\("companyId"\)/)
  assert.match(list, /url\.searchParams\.has\("leadId"\)/)
  assert.match(list, /CommCall_MatchStatusCode", "matched"/)
  assert.match(list, /"user_review", "approved_action", "approved_action_edited"/)
  assert.match(list, /CommCall_MatchedOrgID/)
  assert.match(list, /CommCall_MatchedLeadID/)
  assert.doesNotMatch(list, /multideck_phone_call_match_candidates|CRM_CallMatchCandidates/)

  assert.match(confirmedCrmLinks, /CRMCallEntity_IsConfirmed" = true/)
  assert.match(confirmedCrmLinks, /CommCall_MatchStatusCode" = 'matched'/)
  assert.match(confirmedCrmLinks, /'user_review'[\s\S]*'approved_action'[\s\S]*'approved_action_edited'/)
  assert.match(confirmedCrmLinks, /TargetTable" in \([\s\S]*'Org_Master'[\s\S]*'CRM_Leads'/)
  assert.match(confirmedCrmLinks, /revoke all on function public\._multideck_phone_call_sync_confirmed_entity_links\(\)/)
})

test("call list exposes an exact Lead object only for a canonical confirmed match", () => {
  const listRow = sourceSection(
    edgeFunction,
    "function mapListRow(",
    "async function related(",
  )
  assert.match(listRow, /CommCall_MatchStatusCode === "matched"/)
  for (const method of ["user_review", "approved_action", "approved_action_edited"]) {
    assert.match(listRow, new RegExp(`"${method}"`))
  }
  assert.match(listRow, /lead: hasConfirmedCrmMatch && lead[\s\S]*id: lead\.CRMLead_ID/)
  assert.match(listRow, /CRMLead_CompanyName[\s\S]*CRMLead_PersonName[\s\S]*"Unnamed lead"/)
  assert.doesNotMatch(listRow, /CRM_CallMatchCandidates|matchCandidates/)

  const relation = sourceSection(
    edgeFunction,
    "async function related(",
    "async function readCalls(",
  )
  assert.match(relation, /CommCall_MatchStatusCode === "matched"/)
  assert.match(relation, /"user_review", "approved_action", "approved_action_edited"/)
  assert.match(relation, /CRMLead_ID, CRMLead_CompanyName, CRMLead_PersonName, CRMLead_IsDeleted/)
  assert.match(relation, /\.eq\("CRMLead_IsDeleted", false\)/)
  assert.doesNotMatch(relation, /CRM_CallMatchCandidates|matchCandidates/)
})

test("3CX XAPI polling is credential and scope gated, leased and bounded", () => {
  const handler = sourceSection(
    edgeFunction,
    "async function handle3cxXapiSync(",
    "async function handleRetentionMaintenance(",
  )
  for (const name of [
    "THREE_CX_BASE_URL",
    "THREE_CX_CLIENT_ID",
    "THREE_CX_CLIENT_SECRET",
    "THREE_CX_CALL_LOG_FILTERS_JSON",
  ]) assert.match(handler, new RegExp(name))
  assert.match(handler, /status: "not_connected"/)
  assert.match(handler, /call_log_scope_not_configured/)
  assert.match(handler, /multideck_phone_call_provider_sync_claim/)
  assert.match(handler, /p_provider_code: "3cx"/)
  assert.match(handler, /previousThroughAt[\s\S]*- 5 \* 60_000/)
  assert.match(handler, /maxPages: 3/)
  assert.match(handler, /maxRecords: 250/)
  assert.match(handler, /await ingest3cxRecord/)
  assert.match(handler, /multideck_phone_call_provider_sync_commit/)
  assert.match(handler, /multideck_phone_call_provider_sync_fail/)
  assert.match(edgeFunction, /parts\.join\("\/"\) === "sync\/3cx-xapi"/)

  assert.match(threeCxXapi, /\/connect\/token/)
  assert.match(threeCxXapi, /grant_type: "client_credentials"/)
  assert.match(threeCxXapi, /ReportCallLogData\/Pbx\.GetCallLogData/)
  assert.match(threeCxXapi, /"\$orderby", "SegmentId asc"/)
  assert.match(threeCxXapi, /safeNextLink/)
  assert.match(threeCxXapi, /skip \+= pageSize/)
  assert.match(threeCxXapi, /three_cx_xapi_page_bound/)
  assert.match(threeCxXapi, /three_cx_xapi_record_bound/)
  assert.match(threeCxXapi, /source_boundary_unknown_speakers/)
  assert.doesNotMatch(threeCxXapi, /transfer_accepted_at/)
})

test("3CX XAPI cron remains an explicit disabled-by-default Vault opt-in", () => {
  assert.match(threeCxXapiSchedule, /multideck_phone_calls_3cx_xapi_sync_enabled/)
  assert.match(threeCxXapiSchedule, /v_3cx_xapi_enabled boolean := false/)
  assert.match(threeCxXapiSchedule, /cron\.unschedule\(v_job_id\)/)
  assert.match(threeCxXapiSchedule, /multideck-phone-calls-3cx-xapi-sync/)
  assert.match(threeCxXapiSchedule, /'\/sync\/3cx-xapi'/)
  assert.match(threeCxXapiSchedule, /if coalesce\(v_3cx_xapi_enabled, false\) then/)
  assert.match(threeCxXapiSchedule, /revoke all on function public\.multideck_phone_call_configure_worker_schedules\(\)/)
  assert.match(threeCxXapiSchedule, /grant execute on function public\.multideck_phone_call_configure_worker_schedules\(\)[\s\S]*to service_role/)
  assert.match(liveProof, /multideck_phone_calls_3cx_xapi_sync_enabled/)
  assert.match(liveProof, /multideck-phone-calls-3cx-xapi-sync/)
  assert.match(liveProof, /3CX XAPI worker schedule does not match its explicit provider-ready marker/)
})

test("live proof covers the confirmed CRM-link trigger-only security boundary", () => {
  assert.match(liveProof, /_multideck_phone_call_sync_confirmed_entity_links\(\)/)
  assert.match(liveProof, /TR_Comm_CallLogs_sync_confirmed_entity_links/)
  assert.match(liveProof, /IX_CRM_CallEntityLinks_confirmed_target/)
  assert.match(liveProof, /has_function_privilege\('service_role', function_ref, 'execute'\)/)
  assert.match(liveProof, /CommCall_MatchMethodCode" not in[\s\S]*'approved_action_edited'/)
})

test("AI disclosure and recording and transcription consent are separate evidence-only facts", () => {
  for (const column of [
    "CommCall_AIDisclosureStatusCode",
    "CommCall_RecordingConsentStatusCode",
    "CommCall_TranscriptionConsentStatusCode",
  ]) assert.match(consentRetry, new RegExp(column))
  assert.match(consentRetry, /"Comm_CallConsentEvidence"/)
  assert.match(consentRetry, /"CommCallConsent_RawEventID" uuid not null references public\."Comm_CallIngestionEvents"/)
  assert.match(consentRetry, /event\."CommCallEvent_CompanyID" = p_company_id/)
  assert.match(consentRetry, /event\."CommCallEvent_ProviderCode" = p_provider_code/)
  assert.match(consentRetry, /event\."CommCallEvent_SignatureVerified" = true/)
  assert.match(consentRetry, /'conflict'/)
  assert.match(consentRetry, /CommCall_ConsentStatusCode" = v_legacy/)

  const parser = sourceSection(
    edgeFunction,
    "function explicitConsentEvidence(values: Json)",
    "async function persistConsentEvidence(",
  )
  assert.match(parser, /multideck_ai_disclosure_status/)
  assert.match(parser, /multideck_recording_consent_status/)
  assert.match(parser, /multideck_transcription_consent_status/)
  assert.match(parser, /multideck_consent_disclosure_version/)
  assert.match(parser, /multideck_consent_disclosed_at/)
  assert.doesNotMatch(parser, /parseElevenLabsTranscript|parse3cxTranscript|RecordingSid|recording_url|CommCall_RecordingStatus/i)
})

test("only verified payload contracts populate consent and missing provider facts remain unknown", () => {
  const eleven = sourceSection(
    edgeFunction,
    "async function handleElevenLabsPostCall(request: Request)",
    "function twilioOutcome(value: string)",
  )
  assert.match(eleven, /verifyElevenLabsSignature/)
  assert.match(eleven, /explicitConsentEvidence\(variables\)/)
  assert.match(eleven, /persistConsentEvidence/)
  assert.match(edgeFunction, /multideck_phone_call_record_consent_evidence/)

  const jenkar = sourceSection(
    edgeFunction,
    "async function ingestJenkarScreeningPayload(",
    "async function handleJenkarScreening(request: Request)",
  )
  assert.match(jenkar, /signatureVerified: true/)
  assert.match(jenkar, /explicitConsentEvidence\(payload\)/)

  const twilioStatus = sourceSection(
    edgeFunction,
    "async function handleTwilioStatus(request: Request)",
    "async function correlate3cx(",
  )
  assert.match(twilioStatus, /verifyTwilioSignature/)
  assert.match(twilioStatus, /RecordingSid/)
  assert.match(twilioStatus, /CommCall_RecordingStatusCode: "recorded"/)
  assert.doesNotMatch(twilioStatus, /explicitConsentEvidence|persistConsentEvidence/)

  const threeCx = sourceSection(
    edgeFunction,
    "async function ingest3cxRecord(",
    "async function handle3cxSync(request: Request)",
  )
  assert.doesNotMatch(threeCx, /explicitConsentEvidence|persistConsentEvidence/)
})

test("consent evidence and APIs preserve least privilege and backwards compatibility", () => {
  assert.match(consentRetry, /alter table public\."Comm_CallConsentEvidence" force row level security/)
  assert.match(consentRetry, /revoke all on table public\."Comm_CallConsentEvidence" from public, anon, authenticated/)
  assert.match(consentRetry, /grant select, insert, update, delete on table public\."Comm_CallConsentEvidence" to service_role/)
  assert.match(consentRetry, /revoke all on function public\.multideck_phone_call_record_consent_evidence[\s\S]*from public, anon, authenticated/)
  assert.match(consentRetry, /grant execute on function public\.multideck_phone_call_record_consent_evidence[\s\S]*to service_role/)
  for (const field of [
    "aiDisclosureStatus",
    "recordingConsentStatus",
    "transcriptionConsentStatus",
    "consentDisclosureVersion",
    "consentDisclosedAt",
    "consentEvidence",
  ]) assert.match(edgeFunction, new RegExp(field))
  assert.match(edgeFunction, /recordingConsent:[\s\S]*CommCall_ConsentStatusCode === "received"/)
})

test("new phone calls fail closed without a validated retention policy", () => {
  const retention = sourceSection(
    edgeFunction,
    "function configuredRetentionDays()",
    "function secret(name: string)",
  )
  assert.match(retention, /PHONE_CALLS_RETENTION_DAYS/)
  assert.match(retention, /days < 1 \|\| days > 3650/)
  assert.match(retention, /throw new HttpError\(\s*503/)
  assert.match(edgeFunction, /const retentionDays = configuredRetentionDays\(\)/)
  assert.match(edgeFunction, /CommCall_RetentionUntil: new Date\(/)
  assert.match(edgeFunction, /configurationRequired: true/)
  assert.doesNotMatch(edgeFunction, /Date\.now\(\) \+ 365 \* 24 \* 60 \* 60_000/)
})

test("retry maintenance leases verified durable events and never fabricates signatures", () => {
  assert.match(consentRetry, /for update skip locked/)
  assert.match(consentRetry, /CommCallEvent_SignatureVerified" = true/)
  assert.match(consentRetry, /CommCallEvent_LeaseToken" = gen_random_uuid\(\)/)
  assert.match(consentRetry, /CommCallEvent_LeaseExpiresAt" = now\(\) \+ make_interval/)
  assert.match(consentRetry, /CommCallEvent_AttemptCount" < 8/)
  assert.match(consentRetry, /v_attempts >= 8 then 'dead_letter'/)
  assert.match(consentRetry, /unsupported_replay_type/)
  for (const functionName of [
    "multideck_phone_call_claim_retries",
    "multideck_phone_call_finish_retry",
    "multideck_phone_call_dead_letter_unsupported_retries",
  ]) {
    assert.match(consentRetry, new RegExp(`revoke all on function public\\.${functionName}[\\s\\S]*from public, anon, authenticated`))
    assert.match(consentRetry, new RegExp(`grant execute on function public\\.${functionName}[\\s\\S]*to service_role`))
  }

  const retry = sourceSection(
    edgeFunction,
    "async function handleRetryMaintenance(request: Request)",
    "async function actorContext(request: Request)",
  )
  assert.match(retry, /PHONE_CALLS_WORKER_SECRET/)
  assert.match(retry, /multideck_phone_call_dead_letter_unsupported_retries/)
  assert.match(retry, /multideck_phone_call_claim_retries/)
  assert.match(retry, /ingest3cxRecord/)
  assert.match(retry, /ingestJenkarScreeningPayload/)
  assert.match(retry, /ingestTwilioStatusPayload/)
  assert.match(retry, /ingestElevenLabsPayload/)
  assert.match(retry, /unsupportedReplayAdapters/)
  assert.match(retry, /verification !== "twilio_signature"/)
  assert.doesNotMatch(retry, /verifyElevenLabsSignature|verifyTwilioSignature|x-twilio-signature|elevenlabs-signature/)
  assert.match(edgeFunction, /parts\.join\("\/"\) === "maintenance\/retry"/)
  assert.match(consentRetry, /CommCallEvent_ProviderCode" = 'twilio' and event\."CommCallEvent_EventType" = 'call_status'/)
  assert.match(consentRetry, /CommCallEvent_ProviderCode" = 'elevenlabs' and event\."CommCallEvent_EventType" <> 'conversation_initiation'/)
})

test("tenant-local phone workers are Vault-backed, idempotent and service-only", () => {
  assert.match(continuousWorkers, /create extension if not exists pg_cron/)
  assert.match(continuousWorkers, /create extension if not exists pg_net/)
  assert.match(continuousWorkers, /multideck_phone_calls_worker_endpoint/)
  assert.match(continuousWorkers, /multideck_phone_calls_worker_secret/)
  assert.match(continuousWorkers, /vault\.decrypted_secrets/)
  assert.match(continuousWorkers, /raise exception 'Phone calls worker endpoint is missing/)
  assert.match(continuousWorkers, /raise exception 'Phone calls worker secret is missing/)
  assert.match(continuousWorkers, /for v_job_id in[\s\S]*cron\.unschedule\(v_job_id\)/)
  assert.match(continuousWorkers, /multideck_phone_calls_twilio_sync_enabled/)
  assert.match(continuousWorkers, /if coalesce\(v_twilio_enabled, false\) then[\s\S]*multideck-phone-calls-twilio-sync/)
  assert.match(continuousWorkers, /multideck_phone_calls_elevenlabs_sync_enabled/)
  assert.match(continuousWorkers, /if coalesce\(v_elevenlabs_enabled, false\) then[\s\S]*multideck-phone-calls-elevenlabs-sync/)

  const schedules = [
    ["multideck-phone-calls-twilio-sync", "\\* \\* \\* \\* \\*", "/sync/twilio"],
    ["multideck-phone-calls-elevenlabs-sync", "\\*/2 \\* \\* \\* \\*", "/sync/elevenlabs"],
    ["multideck-phone-calls-retry", "\\* \\* \\* \\* \\*", "/maintenance/retry"],
    ["multideck-phone-calls-retention", "17 2 \\* \\* \\*", "/maintenance/retention"],
  ]
  for (const [name, cadence, path] of schedules) {
    assert.match(
      continuousWorkers,
      new RegExp(`cron\\.schedule\\(\\s*'${name}',\\s*'${cadence}'[\\s\\S]*?${path.replaceAll("/", "\\/")}`),
    )
  }

  assert.match(continuousWorkers, /'x-multideck-worker-secret'/)
  assert.match(continuousWorkers, /revoke all on function public\.multideck_phone_call_configure_worker_schedules\(\)[\s\S]*from public, anon, authenticated/)
  assert.match(continuousWorkers, /grant execute on function public\.multideck_phone_call_configure_worker_schedules\(\)[\s\S]*to service_role/)
  assert.doesNotMatch(continuousWorkers, /PHONE_CALLS_WORKER_SECRET\s*=/)
})

test("consent exceptions reach Dexter and event-driven Watching for you without broadening access", () => {
  assert.match(consentRetry, /v_context\.company_id <> p_company_id/)
  assert.match(consentRetry, /CRM\.PhoneCalls\.Read/)
  assert.match(consentRetry, /grant execute on function public\.multideck_dexter_domain_phone_calls[\s\S]*to service_role/)
  for (const field of [
    "aiDisclosureStatus",
    "recordingConsentStatus",
    "transcriptionConsentStatus",
    "recordingStatus",
  ]) assert.match(consentRetry, new RegExp(field))
  assert.match(consentRetry, /AIDexterWatch_CompanyID" = new\."CommCall_CompanyID"/)
  assert.match(consentRetry, /AIDexterWatch_StatusCode" = 'active'/)
  assert.match(consentRetry, /AIDexterWatch_TargetID" is null or watch\."AIDexterWatch_TargetID" = new\."CommCall_ID"/)
  assert.match(consentRetry, /insert into public\."AI_DexterWatchSignals"/)
  assert.doesNotMatch(consentRetry, /openai|anthropic|language model|llm/i)
})

test("provider leg updates preserve stronger timestamps and transcript evidence", () => {
  const createCall = sourceSection(
    edgeFunction,
    "async function createCall(admin: SupabaseClient",
    "function duration(start: string | null, end: string | null)",
  )
  assert.match(createCall, /const existingLeg = await findLeg/)
  assert.match(createCall, /already attached to a different phone call/)
  assert.match(createCall, /CommCallLeg_StartedAt: earliestTimestamp/)
  assert.match(createCall, /CommCallLeg_AnsweredAt: earliestTimestamp/)
  assert.match(createCall, /CommCallLeg_EndedAt: latestTimestamp/)
  assert.match(createCall, /CommCallLeg_TranscriptStatusCode: strongerTranscriptStatus/)
  assert.match(edgeFunction, /ignoreDuplicates: false/)
})

test("ElevenLabs reconciliation is worker-authenticated, agent-scoped, discoverable and leased", () => {
  const reconciliation = sourceSection(
    edgeFunction,
    "async function handleElevenLabsSync(request: Request)",
    "function twilioOutcome(value: string)",
  )
  assert.match(reconciliation, /PHONE_CALLS_WORKER_SECRET/)
  assert.match(reconciliation, /ELEVENLABS_API_KEY/)
  assert.match(reconciliation, /ELEVENLABS_AGENT_ID/)
  assert.match(reconciliation, /multideck_phone_call_provider_sync_claim/)
  assert.match(reconciliation, /discoverElevenLabsConversations/)
  assert.match(reconciliation, /discoveryWindowStart/)
  assert.match(reconciliation, /pendingConversationIds/)
  assert.match(reconciliation, /discoveryThroughAt/)
  assert.match(reconciliation, /CommCallLeg_ProviderCode",\s*"elevenlabs"/)
  assert.match(reconciliation, /CommCallLeg_TranscriptStatusCode", \[\s*"pending",\s*"processing",\s*"partial"/)
  assert.match(reconciliation, /reconcileElevenLabsConversations/)
  assert.match(reconciliation, /expectedAgentId: agentId/)
  assert.match(reconciliation, /ingestElevenLabsPayload/)
  assert.match(edgeFunction, /includesEmployeeTranscript: false/)
  assert.match(reconciliation, /multideck_phone_call_provider_sync_commit/)
  assert.match(reconciliation, /multideck_phone_call_provider_sync_fail/)
  assert.ok(
    reconciliation.indexOf("ingestElevenLabsPayload(") <
      reconciliation.indexOf('"multideck_phone_call_provider_sync_commit"'),
    "reconciled conversations must be persisted before the worker lease commits",
  )
  assert.match(edgeFunction, /parts\.join\("\/"\) === "sync\/elevenlabs"/)
})

test("transfer acceptance uses the explicit accepted boundary rather than staff screening answer time", () => {
  const jenkar = sourceSection(
    edgeFunction,
    "async function ingestJenkarScreeningPayload(",
    "async function handleJenkarScreening(request: Request)",
  )
  assert.match(jenkar, /const transferAcceptedAt = parseDate\(payload\.transfer_accepted_at\)/)
  assert.match(jenkar, /const transcriptBoundaryAt = parseDate\(payload\.transcript_boundary_at\)/)
  assert.match(jenkar, /CommCall_TransferAcceptedAt: transferStatus === "accepted"[\s\S]*transferAcceptedAt/)
  assert.doesNotMatch(jenkar, /CommCall_TransferAcceptedAt:[\s\S]{0,220}answeredAt \|\| occurredAt/)
  assert.match(jenkar, /CommCallLeg_AnsweredAt: earliestTimestamp/)
  assert.match(jenkar, /CommCallLeg_EndedAt: latestTimestamp/)
})

test("CRM match review derives one consistent company boundary and rejects conflicting links", () => {
  const reviewMatch = sourceSection(
    safetyParity,
    "create or replace function public.multideck_phone_call_review_match(",
    "revoke all on function public.multideck_phone_call_review_match(",
  )
  assert.match(reviewMatch, /p_contact_target_id is not null and p_lead_target_id is not null/)
  assert.match(reviewMatch, /Link the call to a contact or a lead, not both/)
  assert.match(reviewMatch, /select contact\."Org_ID"[\s\S]*into v_contact_org_id/)
  assert.match(reviewMatch, /select lead\."CRMLead_OrgID"[\s\S]*into v_lead_org_id/)
  assert.match(reviewMatch, /The company linked to that lead is outside this workspace/)
  assert.match(reviewMatch, /That contact does not belong to the selected company/)
  assert.match(reviewMatch, /That lead is not linked to the selected company/)
  assert.match(reviewMatch, /v_resolved_org_id := case[\s\S]*coalesce\(v_contact_org_id, v_lead_org_id, p_company_target_id\)/)
  assert.match(reviewMatch, /"CommCall_MatchedOrgID" = v_resolved_org_id/)
  assert.match(reviewMatch, /call\."CommCall_CompanyID" = p_company_id/)
  assert.match(safetyParity, /revoke all on function public\.multideck_phone_call_review_match\([\s\S]*from public, anon, authenticated/)
  assert.match(safetyParity, /grant execute on function public\.multideck_phone_call_review_match\([\s\S]*to service_role/)
})

test("Dexter phone reads expose bounded evidence and exact pending suggestion identities", () => {
  const dexterRead = sourceSection(
    safetyParity,
    "create or replace function public.multideck_dexter_domain_phone_calls(",
    "revoke all on function public.multideck_dexter_domain_phone_calls(",
  )
  assert.match(dexterRead, /v_context\.company_id <> p_company_id/)
  assert.match(dexterRead, /CRM\.PhoneCalls\.Read/)
  assert.match(dexterRead, /call\."CommCall_CompanyID" = p_company_id/)
  assert.match(dexterRead, /'meetingNotes', left\(review\."CRMCallReview_MeetingNotes", 4000\)/)
  assert.match(dexterRead, /limit 12/)
  assert.match(dexterRead, /limit 40/)
  assert.match(dexterRead, /'text', left\(segment\."CommCallSeg_Text", 1200\)/)
  assert.match(dexterRead, /'untrustedEvidence', true/)
  assert.match(dexterRead, /limit 8/)
  assert.match(dexterRead, /action\."CRMCallAction_DecisionStatus" = 'pending'/)
  for (const field of ["id", "callId", "title", "sourceKey", "requiresReview"]) {
    assert.match(dexterRead, new RegExp(`'${field}'`))
  }
  assert.match(dexterRead, /limit greatest\(1, least\(coalesce\(p_take, 10\), 25\)\)/)
  assert.match(safetyParity, /revoke all on function public\.multideck_dexter_domain_phone_calls\([\s\S]*from public, anon, authenticated/)
  assert.match(safetyParity, /grant execute on function public\.multideck_dexter_domain_phone_calls\([\s\S]*to service_role/)
})

test("phone Watches preserve complete old and new snapshots and ignore no-op changes", () => {
  const callWatch = sourceSection(
    safetyParity,
    "create or replace function public._multideck_phone_call_watch_source_change()",
    "create or replace function public._multideck_phone_call_action_watch_source_change()",
  )
  const actionWatch = sourceSection(
    safetyParity,
    "create or replace function public._multideck_phone_call_action_watch_source_change()",
    "create or replace function public._multideck_phone_call_review_watch_source_change()",
  )
  const reviewWatch = sourceSection(
    safetyParity,
    "create or replace function public._multideck_phone_call_review_watch_source_change()",
    "drop trigger if exists \"TR_Comm_CallLogs_dexter_watch\"",
  )

  for (const field of [
    "outcome",
    "companyId",
    "companyName",
    "contactId",
    "leadId",
    "callReason",
    "pendingActionCount",
  ]) assert.match(safetyParity, new RegExp(`'${field}'`))

  assert.match(callWatch, /old\."CommCall_MatchedOrgID"/)
  assert.match(callWatch, /old\."CommCall_MatchedContactID"/)
  assert.match(callWatch, /old\."CommCall_MatchedLeadID"/)
  assert.match(callWatch, /v_old is not distinct from v_new then return new/)
  assert.match(actionWatch, /v_old_pending := greatest/)
  assert.match(actionWatch, /old\."CRMCallAction_DecisionStatus" = 'pending'/)
  assert.match(actionWatch, /v_old is not distinct from v_new then return new/)
  assert.equal((reviewWatch.match(/if tg_op = 'INSERT'/g) ?? []).length, 1)
  assert.match(reviewWatch, /nullif\(btrim\(new\."CRMCallReview_CallReason"\), ''\) is null/)
  assert.match(reviewWatch, /old\."CRMCallReview_CallReason"[\s\S]*is not distinct from new\."CRMCallReview_CallReason"/)
  assert.match(reviewWatch, /v_old is not distinct from v_new then return new/)
  assert.match(safetyParity, /after insert or update of[\s\S]*"CommCall_MatchedOrgID"[\s\S]*"CommCall_MatchedContactID"[\s\S]*"CommCall_MatchedLeadID"/)
  assert.match(safetyParity, /after insert or update of "CRMCallReview_CallReason"/)
})

test("phone Watches pause owners who lose read permission and remain event driven", () => {
  const pause = sourceSection(
    safetyParity,
    "create or replace function public._multideck_phone_call_pause_unauthorised_watches(",
    "create or replace function public._multideck_phone_call_watch_source_change()",
  )
  assert.match(pause, /watch\."AIDexterWatch_CompanyID" = p_company_id/)
  assert.match(pause, /watch\."AIDexterWatch_StatusCode" = 'active'/)
  assert.match(pause, /not public\._multideck_crm_has_permission\([\s\S]*CRM\.PhoneCalls\.Read/)
  assert.match(pause, /"AIDexterWatch_StatusCode" = 'paused'/)

  for (const sourceFunction of [
    "_multideck_phone_call_watch_source_change",
    "_multideck_phone_call_action_watch_source_change",
    "_multideck_phone_call_review_watch_source_change",
  ]) {
    const source = sourceSection(
      safetyParity,
      `create or replace function public.${sourceFunction}()`,
      `revoke all on function public.${sourceFunction}()`,
    )
    assert.match(source, /_multideck_phone_call_pause_unauthorised_watches/)
    assert.match(source, /_multideck_crm_has_permission\([\s\S]*CRM\.PhoneCalls\.Read/)
    assert.match(source, /AIDexterWatch_StatusCode" = 'active'/)
    assert.match(source, /AIDexterWatch_TargetID" is null/)
  }
  assert.doesNotMatch(safetyParity, /openai|anthropic|language model|\bllm\b/i)
})

test("orphan ingestion-event retention is tenant scoped, service only and PII redacting", () => {
  const purge = sourceSection(
    safetyParity,
    "create or replace function public.multideck_phone_call_purge_expired_events(",
    "revoke all on function public.multideck_phone_call_purge_expired_events(",
  )
  assert.match(safetyParity, /add column if not exists "CommCallEvent_RetentionUntil" timestamptz/)
  assert.doesNotMatch(safetyParity, /CommCallEvent_RetentionUntil"[^;]*default/i)
  assert.match(purge, /auth\.role\(\) <> 'service_role'/)
  assert.match(purge, /event\."CommCallEvent_CompanyID" = p_company_id/)
  assert.match(purge, /event\."CommCallEvent_RetentionUntil" <= now\(\)/)
  assert.match(purge, /for update skip locked/)
  assert.match(purge, /"CommCallEvent_RawPayloadJSON" = '\{\}'::jsonb/)
  assert.match(purge, /"CommCallEvent_ErrorMessage" = null/)
  assert.match(purge, /"CommCallEvent_NextAttemptAt" = null/)
  assert.match(purge, /"CommCallEvent_LeaseToken" = null/)
  assert.match(purge, /'retentionExpired', true/)
  assert.match(safetyParity, /revoke all on function public\.multideck_phone_call_purge_expired_events\([\s\S]*from public, anon, authenticated/)
  assert.match(safetyParity, /grant execute on function public\.multideck_phone_call_purge_expired_events\([\s\S]*to service_role/)
  assert.match(edgeFunction, /CommCallEvent_RetentionUntil: retentionUntil/)
  assert.match(edgeFunction, /multideck_phone_call_purge_expired_events/)
})

test("every privileged call match path enforces one CRM company boundary", () => {
  const invariant = sourceSection(
    matchInvariant,
    "create or replace function public._multideck_phone_call_enforce_match_consistency()",
    "drop trigger if exists \"TR_Comm_CallLogs_match_consistency\"",
  )
  assert.match(
    invariant,
    /CommCall_MatchedContactID[\s\S]*CommCall_MatchedLeadID[\s\S]*cannot be linked to both a contact and a lead/,
  )
  assert.match(invariant, /from public\."Org_Contacts"/)
  assert.match(invariant, /from public\."CRM_Leads"[\s\S]*not lead\."CRMLead_IsDeleted"/)
  assert.match(
    invariant,
    /new\."CommCall_MatchedOrgID" := v_expected_org_id/,
  )
  assert.match(
    invariant,
    /multideck_crm_company_can_access_account\([\s\S]*new\."CommCall_CompanyID"/,
  )
  assert.match(
    matchInvariant,
    /before insert or update of[\s\S]*"CommCall_CompanyID"[\s\S]*"CommCall_MatchedOrgID"[\s\S]*"CommCall_MatchedContactID"[\s\S]*"CommCall_MatchedLeadID"/,
  )
  assert.match(
    matchInvariant,
    /revoke all on function public\._multideck_phone_call_enforce_match_consistency\(\)[\s\S]*from public, anon, authenticated/,
  )
  assert.match(
    matchInvariant,
    /grant execute on function public\._multideck_phone_call_enforce_match_consistency\(\)[\s\S]*to service_role/,
  )
})

test("canonical CRM call links exist only after a confirmed review boundary", () => {
  const invariant = sourceSection(
    confirmedMatchState,
    "create or replace function public._multideck_phone_call_enforce_match_consistency()",
    "drop trigger if exists \"TR_Comm_CallLogs_match_consistency\"",
  )

  assert.match(
    confirmedMatchState,
    /CommCall_MatchedOrgID" is not null[\s\S]*CommCall_MatchStatusCode" is distinct from 'matched'/,
  )
  assert.match(
    confirmedMatchState,
    /CommCall_MatchMethodCode" not in \([\s\S]*'user_review'[\s\S]*'approved_action'[\s\S]*'approved_action_edited'/,
  )
  assert.match(
    invariant,
    /Phone-call CRM links require an operator-reviewed or approved match/,
  )
  assert.match(
    confirmedMatchState,
    /before insert or update of[\s\S]*"CommCall_MatchStatusCode"[\s\S]*"CommCall_MatchMethodCode"[\s\S]*"CommCall_MatchedOrgID"/,
  )
  assert.match(
    confirmedMatchState,
    /constraint "CK_Comm_CallLogs_confirmed_match_links"[\s\S]*"CommCall_MatchStatusCode" = 'matched'[\s\S]*"CommCall_MatchMethodCode" in/,
  )
  assert.match(
    confirmedMatchState,
    /revoke all on function public\._multideck_phone_call_enforce_match_consistency\(\)[\s\S]*from public, anon, authenticated/,
  )
  assert.match(liveProof, /CK_Comm_CallLogs_confirmed_match_links/)
  assert.match(liveProof, /An unreviewed Phone call has a canonical CRM target/)
})
