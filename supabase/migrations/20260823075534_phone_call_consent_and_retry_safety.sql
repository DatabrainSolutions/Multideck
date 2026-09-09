-- Keep AI disclosure, recording consent and transcription consent as separate,
-- provider-evidenced facts. Missing provider evidence intentionally remains
-- unknown; neither a transcript nor the existence of a recording proves consent.

alter table public."Comm_CallLogs"
  add column if not exists "CommCall_AIDisclosureStatusCode" varchar(24) not null default 'unknown',
  add column if not exists "CommCall_RecordingConsentStatusCode" varchar(24) not null default 'unknown',
  add column if not exists "CommCall_TranscriptionConsentStatusCode" varchar(24) not null default 'unknown',
  add column if not exists "CommCall_ConsentSourceProviderCode" varchar(32),
  add column if not exists "CommCall_ConsentSourceEventID" uuid references public."Comm_CallIngestionEvents"("CommCallEvent_ID") on delete set null,
  add column if not exists "CommCall_ConsentEvidenceUpdatedAt" timestamptz,
  add column if not exists "CommCall_ConsentEvidenceJSON" jsonb not null default '{}'::jsonb;

alter table public."Comm_CallLogs"
  drop constraint if exists "CK_Comm_CallLogs_ai_disclosure_status",
  add constraint "CK_Comm_CallLogs_ai_disclosure_status" check (
    "CommCall_AIDisclosureStatusCode" in ('unknown', 'disclosed', 'not_required', 'conflict')
  ),
  drop constraint if exists "CK_Comm_CallLogs_recording_consent_status",
  add constraint "CK_Comm_CallLogs_recording_consent_status" check (
    "CommCall_RecordingConsentStatusCode" in ('unknown', 'not_required', 'received', 'declined', 'conflict')
  ),
  drop constraint if exists "CK_Comm_CallLogs_transcription_consent_status",
  add constraint "CK_Comm_CallLogs_transcription_consent_status" check (
    "CommCall_TranscriptionConsentStatusCode" in ('unknown', 'not_required', 'received', 'declined', 'conflict')
  ),
  drop constraint if exists "CK_Comm_CallLogs_consent_evidence_object",
  add constraint "CK_Comm_CallLogs_consent_evidence_object" check (
    jsonb_typeof("CommCall_ConsentEvidenceJSON") = 'object'
  );

create table if not exists public."Comm_CallConsentEvidence" (
  "CommCallConsent_ID" uuid primary key default gen_random_uuid(),
  "CommCallConsent_CompanyID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "CommCallConsent_CallID" uuid not null references public."Comm_CallLogs"("CommCall_ID") on delete cascade,
  "CommCallConsent_RawEventID" uuid not null references public."Comm_CallIngestionEvents"("CommCallEvent_ID") on delete cascade,
  "CommCallConsent_ProviderCode" varchar(32) not null,
  "CommCallConsent_AIDisclosureStatusCode" varchar(24) not null default 'unknown',
  "CommCallConsent_RecordingStatusCode" varchar(24) not null default 'unknown',
  "CommCallConsent_TranscriptionStatusCode" varchar(24) not null default 'unknown',
  "CommCallConsent_DisclosureVersion" varchar(80),
  "CommCallConsent_DisclosedAt" timestamptz,
  "CommCallConsent_SourceFieldsJSON" jsonb not null default '[]'::jsonb,
  "CommCallConsent_ObservedAt" timestamptz not null default now(),
  constraint "UX_Comm_CallConsentEvidence_event" unique (
    "CommCallConsent_RawEventID"
  ),
  constraint "CK_Comm_CallConsentEvidence_provider" check (
    "CommCallConsent_ProviderCode" in ('elevenlabs', 'twilio', '3cx')
  ),
  constraint "CK_Comm_CallConsentEvidence_disclosure" check (
    "CommCallConsent_AIDisclosureStatusCode" in ('unknown', 'disclosed', 'not_required')
  ),
  constraint "CK_Comm_CallConsentEvidence_recording" check (
    "CommCallConsent_RecordingStatusCode" in ('unknown', 'not_required', 'received', 'declined')
  ),
  constraint "CK_Comm_CallConsentEvidence_transcription" check (
    "CommCallConsent_TranscriptionStatusCode" in ('unknown', 'not_required', 'received', 'declined')
  ),
  constraint "CK_Comm_CallConsentEvidence_source_fields" check (
    jsonb_typeof("CommCallConsent_SourceFieldsJSON") = 'array'
  )
);

create index if not exists "IX_Comm_CallConsentEvidence_company_call"
  on public."Comm_CallConsentEvidence" (
    "CommCallConsent_CompanyID", "CommCallConsent_CallID", "CommCallConsent_ObservedAt" desc
  );

alter table public."Comm_CallConsentEvidence" enable row level security;
alter table public."Comm_CallConsentEvidence" force row level security;
revoke all on table public."Comm_CallConsentEvidence" from public, anon, authenticated;
grant select, insert, update, delete on table public."Comm_CallConsentEvidence" to service_role;

create or replace function public._multideck_phone_call_merge_fact(
  p_current text,
  p_incoming text
)
returns text
language sql
immutable
security invoker
set search_path = pg_catalog
as $$
  select case
    when coalesce(p_incoming, 'unknown') = 'unknown' then coalesce(p_current, 'unknown')
    when coalesce(p_current, 'unknown') = 'unknown' then p_incoming
    when p_current = p_incoming then p_current
    when p_current = 'conflict' then 'conflict'
    else 'conflict'
  end
$$;

revoke all on function public._multideck_phone_call_merge_fact(text, text) from public, anon, authenticated;
grant execute on function public._multideck_phone_call_merge_fact(text, text) to service_role;

create or replace function public.multideck_phone_call_record_consent_evidence(
  p_company_id uuid,
  p_call_id uuid,
  p_raw_event_id uuid,
  p_provider_code text,
  p_ai_disclosure_status text default 'unknown',
  p_recording_consent_status text default 'unknown',
  p_transcription_consent_status text default 'unknown',
  p_disclosure_version text default null,
  p_disclosed_at timestamptz default null,
  p_source_fields jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_call public."Comm_CallLogs"%rowtype;
  v_disclosure text;
  v_recording text;
  v_transcription text;
  v_legacy text;
begin
  if coalesce(p_provider_code, '') not in ('elevenlabs', 'twilio', '3cx')
    or coalesce(p_ai_disclosure_status, '') not in ('unknown', 'disclosed', 'not_required')
    or coalesce(p_recording_consent_status, '') not in ('unknown', 'not_required', 'received', 'declined')
    or coalesce(p_transcription_consent_status, '') not in ('unknown', 'not_required', 'received', 'declined')
    or jsonb_typeof(coalesce(p_source_fields, '[]'::jsonb)) <> 'array'
  then
    raise exception 'Invalid phone-call consent evidence.' using errcode = '22023';
  end if;
  if p_ai_disclosure_status = 'unknown'
    and p_recording_consent_status = 'unknown'
    and p_transcription_consent_status = 'unknown'
    and nullif(btrim(p_disclosure_version), '') is null
    and p_disclosed_at is null
  then
    return jsonb_build_object('recorded', false, 'reason', 'no_explicit_evidence');
  end if;

  select call.* into v_call
  from public."Comm_CallLogs" call
  where call."CommCall_ID" = p_call_id
    and call."CommCall_CompanyID" = p_company_id
  for update;
  if not found then
    raise exception 'Phone call is outside this workspace.' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public."Comm_CallIngestionEvents" event
    where event."CommCallEvent_ID" = p_raw_event_id
      and event."CommCallEvent_CompanyID" = p_company_id
      and event."CommCallEvent_ProviderCode" = p_provider_code
      and event."CommCallEvent_SignatureVerified" = true
  ) then
    raise exception 'Consent evidence requires a verified provider event in this workspace.' using errcode = '42501';
  end if;

  insert into public."Comm_CallConsentEvidence" (
    "CommCallConsent_CompanyID", "CommCallConsent_CallID", "CommCallConsent_RawEventID",
    "CommCallConsent_ProviderCode", "CommCallConsent_AIDisclosureStatusCode",
    "CommCallConsent_RecordingStatusCode", "CommCallConsent_TranscriptionStatusCode",
    "CommCallConsent_DisclosureVersion", "CommCallConsent_DisclosedAt",
    "CommCallConsent_SourceFieldsJSON"
  ) values (
    p_company_id, p_call_id, p_raw_event_id, p_provider_code, p_ai_disclosure_status,
    p_recording_consent_status, p_transcription_consent_status,
    nullif(btrim(p_disclosure_version), ''), p_disclosed_at, coalesce(p_source_fields, '[]'::jsonb)
  ) on conflict ("CommCallConsent_RawEventID") do nothing;

  v_disclosure := public._multideck_phone_call_merge_fact(
    v_call."CommCall_AIDisclosureStatusCode", p_ai_disclosure_status
  );
  v_recording := public._multideck_phone_call_merge_fact(
    v_call."CommCall_RecordingConsentStatusCode", p_recording_consent_status
  );
  v_transcription := public._multideck_phone_call_merge_fact(
    v_call."CommCall_TranscriptionConsentStatusCode", p_transcription_consent_status
  );
  v_legacy := case
    when 'conflict' in (v_disclosure, v_recording, v_transcription) then 'conflict'
    when 'declined' in (v_recording, v_transcription) then 'declined'
    when v_recording in ('received', 'not_required')
      and v_transcription in ('received', 'not_required')
      and 'received' in (v_recording, v_transcription) then 'received'
    when v_recording = 'not_required' and v_transcription = 'not_required' then 'not_required'
    when v_recording <> 'unknown' or v_transcription <> 'unknown' then 'partial'
    when v_disclosure = 'disclosed' then 'disclosed'
    when v_disclosure = 'not_required' then 'not_required'
    else 'unknown'
  end;

  update public."Comm_CallLogs" call
  set "CommCall_AIDisclosureStatusCode" = v_disclosure,
      "CommCall_RecordingConsentStatusCode" = v_recording,
      "CommCall_TranscriptionConsentStatusCode" = v_transcription,
      "CommCall_ConsentStatusCode" = v_legacy,
      "CommCall_ConsentDisclosureVersion" = coalesce(
        nullif(btrim(p_disclosure_version), ''), call."CommCall_ConsentDisclosureVersion"
      ),
      "CommCall_ConsentDisclosedAt" = coalesce(
        p_disclosed_at, call."CommCall_ConsentDisclosedAt"
      ),
      "CommCall_ConsentSourceProviderCode" = p_provider_code,
      "CommCall_ConsentSourceEventID" = p_raw_event_id,
      "CommCall_ConsentEvidenceUpdatedAt" = now(),
      "CommCall_ConsentEvidenceJSON" = jsonb_build_object(
        'provider', p_provider_code,
        'sourceEventId', p_raw_event_id,
        'sourceFields', coalesce(p_source_fields, '[]'::jsonb)
      ),
      "CommCall_UpdatedAt" = now()
  where call."CommCall_ID" = p_call_id
    and call."CommCall_CompanyID" = p_company_id;

  return jsonb_build_object(
    'recorded', true,
    'aiDisclosureStatus', v_disclosure,
    'recordingConsentStatus', v_recording,
    'transcriptionConsentStatus', v_transcription,
    'legacyConsentStatus', v_legacy
  );
end;
$$;

revoke all on function public.multideck_phone_call_record_consent_evidence(uuid, uuid, uuid, text, text, text, text, text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.multideck_phone_call_record_consent_evidence(uuid, uuid, uuid, text, text, text, text, text, timestamptz, jsonb) to service_role;

-- Durable retry claims are leased so overlapping maintenance invocations cannot
-- process the same provider event concurrently. Stored raw payloads are only
-- eligible when their original ingress was signature/secret verified.
alter table public."Comm_CallIngestionEvents"
  add column if not exists "CommCallEvent_LeaseToken" uuid,
  add column if not exists "CommCallEvent_LeaseExpiresAt" timestamptz,
  add column if not exists "CommCallEvent_LastAttemptAt" timestamptz;

create index if not exists "IX_Comm_CallIngestionEvents_retry_lease"
  on public."Comm_CallIngestionEvents" (
    "CommCallEvent_CompanyID", "CommCallEvent_StatusCode",
    "CommCallEvent_NextAttemptAt", "CommCallEvent_LeaseExpiresAt"
  ) where "CommCallEvent_StatusCode" in ('received', 'processing', 'retryable');

create or replace function public.multideck_phone_call_claim_retries(
  p_company_id uuid,
  p_limit integer default 20,
  p_lease_seconds integer default 120
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare v_result jsonb;
begin
  if p_company_id is null or p_limit < 1 or p_limit > 50
    or p_lease_seconds < 30 or p_lease_seconds > 600
  then
    raise exception 'Invalid phone-call retry claim.' using errcode = '22023';
  end if;
  with candidates as (
    select event."CommCallEvent_ID"
    from public."Comm_CallIngestionEvents" event
    where event."CommCallEvent_CompanyID" = p_company_id
      and event."CommCallEvent_SignatureVerified" = true
      and event."CommCallEvent_AttemptCount" < 8
      and (
        (event."CommCallEvent_ProviderCode" = '3cx' and event."CommCallEvent_EventType" = 'cdr')
        or (event."CommCallEvent_ProviderCode" = 'twilio' and event."CommCallEvent_EventType" like 'jenkar\_%' escape '\')
        or (event."CommCallEvent_ProviderCode" = 'twilio' and event."CommCallEvent_EventType" = 'call_status')
        or (event."CommCallEvent_ProviderCode" = 'elevenlabs' and event."CommCallEvent_EventType" <> 'conversation_initiation')
      )
      and (
        (event."CommCallEvent_StatusCode" = 'retryable'
          and coalesce(event."CommCallEvent_NextAttemptAt", now()) <= now())
        or (event."CommCallEvent_StatusCode" = 'received'
          and event."CommCallEvent_ReceivedAt" <= now() - interval '5 minutes')
        or (event."CommCallEvent_StatusCode" = 'processing'
          and event."CommCallEvent_LeaseExpiresAt" < now())
      )
    order by coalesce(event."CommCallEvent_NextAttemptAt", event."CommCallEvent_ReceivedAt")
    for update skip locked
    limit p_limit
  ), claimed as (
    update public."Comm_CallIngestionEvents" event
    set "CommCallEvent_StatusCode" = 'processing',
        "CommCallEvent_LeaseToken" = gen_random_uuid(),
        "CommCallEvent_LeaseExpiresAt" = now() + make_interval(secs => p_lease_seconds),
        "CommCallEvent_LastAttemptAt" = now()
    from candidates
    where event."CommCallEvent_ID" = candidates."CommCallEvent_ID"
    returning event.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'eventId', claimed."CommCallEvent_ID",
    'provider', claimed."CommCallEvent_ProviderCode",
    'eventType', claimed."CommCallEvent_EventType",
    'payload', claimed."CommCallEvent_RawPayloadJSON",
    'metadata', claimed."CommCallEvent_MetadataJSON",
    'leaseToken', claimed."CommCallEvent_LeaseToken",
    'attemptCount', claimed."CommCallEvent_AttemptCount"
  )), '[]'::jsonb) into v_result from claimed;
  return v_result;
end;
$$;

revoke all on function public.multideck_phone_call_claim_retries(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.multideck_phone_call_claim_retries(uuid, integer, integer) to service_role;

create or replace function public.multideck_phone_call_finish_retry(
  p_company_id uuid,
  p_event_id uuid,
  p_lease_token uuid,
  p_status text,
  p_error_code text default null,
  p_error_message text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare v_event public."Comm_CallIngestionEvents"%rowtype; v_attempts integer; v_status text;
begin
  if coalesce(p_status, '') not in ('complete', 'partial', 'retryable', 'terminal') then
    raise exception 'Invalid phone-call retry result.' using errcode = '22023';
  end if;
  select event.* into v_event
  from public."Comm_CallIngestionEvents" event
  where event."CommCallEvent_ID" = p_event_id
    and event."CommCallEvent_CompanyID" = p_company_id
  for update;
  if not found or v_event."CommCallEvent_StatusCode" <> 'processing'
    or v_event."CommCallEvent_LeaseToken" is distinct from p_lease_token
    or v_event."CommCallEvent_LeaseExpiresAt" is null
    or v_event."CommCallEvent_LeaseExpiresAt" <= now()
  then
    raise exception 'Phone-call retry lease is missing or expired.' using errcode = '42501';
  end if;
  v_attempts := coalesce(v_event."CommCallEvent_AttemptCount", 0) + 1;
  v_status := case when p_status = 'retryable' and v_attempts >= 8 then 'dead_letter' else p_status end;
  update public."Comm_CallIngestionEvents" event
  set "CommCallEvent_StatusCode" = v_status,
      "CommCallEvent_ProcessedAt" = case when v_status = 'retryable' then null else now() end,
      "CommCallEvent_AttemptCount" = v_attempts,
      "CommCallEvent_NextAttemptAt" = case when v_status = 'retryable'
        then now() + make_interval(secs => least(3600, 300 * (2 ^ least(v_attempts - 1, 4)))::integer)
        else null end,
      "CommCallEvent_ErrorCode" = nullif(left(coalesce(p_error_code, ''), 120), ''),
      "CommCallEvent_ErrorMessage" = nullif(left(coalesce(p_error_message, ''), 500), ''),
      "CommCallEvent_LeaseToken" = null,
      "CommCallEvent_LeaseExpiresAt" = null
  where event."CommCallEvent_ID" = p_event_id;
  return jsonb_build_object('eventId', p_event_id, 'status', v_status, 'attemptCount', v_attempts);
end;
$$;

revoke all on function public.multideck_phone_call_finish_retry(uuid, uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.multideck_phone_call_finish_retry(uuid, uuid, uuid, text, text, text) to service_role;

create or replace function public.multideck_phone_call_dead_letter_unsupported_retries(
  p_company_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare v_result jsonb;
begin
  with unsupported as (
    update public."Comm_CallIngestionEvents" event
    set "CommCallEvent_StatusCode" = 'dead_letter',
        "CommCallEvent_ProcessedAt" = now(),
        "CommCallEvent_NextAttemptAt" = null,
        "CommCallEvent_ErrorCode" = 'unsupported_replay_type',
        "CommCallEvent_ErrorMessage" = 'Stored event needs a provider-specific replay adapter; it was not marked complete.',
        "CommCallEvent_LeaseToken" = null,
        "CommCallEvent_LeaseExpiresAt" = null
    where event."CommCallEvent_CompanyID" = p_company_id
      and event."CommCallEvent_SignatureVerified" = true
      and event."CommCallEvent_StatusCode" in ('received', 'retryable')
      and (
        (event."CommCallEvent_StatusCode" = 'retryable'
          and coalesce(event."CommCallEvent_NextAttemptAt", now()) <= now())
        or (event."CommCallEvent_StatusCode" = 'received'
          and event."CommCallEvent_ReceivedAt" <= now() - interval '5 minutes')
      )
      and not (
        (event."CommCallEvent_ProviderCode" = '3cx' and event."CommCallEvent_EventType" = 'cdr')
        or (event."CommCallEvent_ProviderCode" = 'twilio' and event."CommCallEvent_EventType" like 'jenkar\_%' escape '\')
        or (event."CommCallEvent_ProviderCode" = 'twilio' and event."CommCallEvent_EventType" = 'call_status')
        or (event."CommCallEvent_ProviderCode" = 'elevenlabs' and event."CommCallEvent_EventType" <> 'conversation_initiation')
      )
    returning event."CommCallEvent_ProviderCode", event."CommCallEvent_EventType"
  )
  select jsonb_build_object(
    'count', count(*),
    'eventTypes', coalesce(jsonb_agg(distinct unsupported."CommCallEvent_ProviderCode" || ':' || unsupported."CommCallEvent_EventType"), '[]'::jsonb)
  ) into v_result from unsupported;
  return v_result;
end;
$$;

revoke all on function public.multideck_phone_call_dead_letter_unsupported_retries(uuid) from public, anon, authenticated;
grant execute on function public.multideck_phone_call_dead_letter_unsupported_retries(uuid) to service_role;

-- Dexter reads the separated privacy facts through the same company and
-- CRM.PhoneCalls.Read boundary as the rest of the phone-call domain.
create or replace function public.multideck_dexter_domain_phone_calls(
  p_company_id uuid,
  p_search text,
  p_take integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare v_context record; v_result jsonb; v_term text := nullif(btrim(p_search), '');
begin
  select * into v_context from public._multideck_dexter_context();
  if v_context.company_id <> p_company_id or not public._multideck_crm_has_permission(v_context.user_id, 'CRM.PhoneCalls.Read') then
    raise exception 'Phone calls are outside this workspace or permission.' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(row_data order by started_at desc), '[]'::jsonb) into v_result
  from (
    select jsonb_build_object(
      'recordId', call."CommCall_ID",
      'callerName', coalesce(call."CommCall_FromDisplayNameSnapshot", call."CommCall_ToDisplayNameSnapshot"),
      'phoneNumber', case when call."CommCall_DirectionCode" = 'outbound' then call."CommCall_ToNumber" else call."CommCall_FromNumber" end,
      'direction', call."CommCall_DirectionCode",
      'outcome', call."CommCall_OutcomeCode",
      'startedAt', call."CommCall_StartedAt",
      'answeredAt', call."CommCall_AnsweredAt",
      'endedAt', call."CommCall_EndedAt",
      'durationSeconds', call."CommCall_DurationSeconds",
      'transferStatus', call."CommCall_TransferStatusCode",
      'transcriptStatus', call."CommCall_TranscriptStatusCode",
      'matchStatus', call."CommCall_MatchStatusCode",
      'aiDisclosureStatus', call."CommCall_AIDisclosureStatusCode",
      'recordingConsentStatus', call."CommCall_RecordingConsentStatusCode",
      'transcriptionConsentStatus', call."CommCall_TranscriptionConsentStatusCode",
      'consentDisclosureVersion', call."CommCall_ConsentDisclosureVersion",
      'consentDisclosedAt', call."CommCall_ConsentDisclosedAt",
      'recordingStatus', call."CommCall_RecordingStatusCode",
      'companyId', call."CommCall_MatchedOrgID",
      'companyName', organisation."Org_Name",
      'leadId', call."CommCall_MatchedLeadID",
      'summary', coalesce(review."CRMCallReview_UserApprovedSummary", review."CRMCallReview_AISummary", call."CommCall_AISummary"),
      'callReason', review."CRMCallReview_CallReason",
      'providerEvidence', jsonb_build_object(
        'source', call."CommCall_SourceProviderCode",
        'providerCallId', call."CommCall_ProviderCallID",
        'correlationId', call."CommCall_CorrelationID",
        'consentSourceProvider', call."CommCall_ConsentSourceProviderCode",
        'consentSourceEventId', call."CommCall_ConsentSourceEventID"
      ),
      'route', '/crm/phone-calls/' || call."CommCall_ID"::text
    ) row_data, call."CommCall_StartedAt" started_at
    from public."Comm_CallLogs" call
    left join public."CRM_CallReviews" review
      on review."CRMCallReview_CommCallID" = call."CommCall_ID"
      and review."CRMCallReview_CompanyID" = p_company_id
    left join public."Org_Master" organisation on organisation."Org_id" = call."CommCall_MatchedOrgID"
    where call."CommCall_CompanyID" = p_company_id
      and (
        v_term is null or concat_ws(' ', call."CommCall_FromDisplayNameSnapshot", call."CommCall_ToDisplayNameSnapshot",
          call."CommCall_FromNumber", call."CommCall_ToNumber", organisation."Org_Name",
          review."CRMCallReview_CallReason", review."CRMCallReview_AISummary") ilike '%' || v_term || '%'
      )
    order by call."CommCall_StartedAt" desc nulls last, call."CommCall_CreatedAt" desc
    limit greatest(1, least(coalesce(p_take, 10), 25))
  ) calls;
  return v_result;
end;
$$;

revoke all on function public.multideck_dexter_domain_phone_calls(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.multideck_dexter_domain_phone_calls(uuid, text, integer) to service_role;

update public."sys_AIDexterWatchCapabilities"
set "AIDexterWatchCapability_Description" =
      'Phone call outcomes, transcript readiness, transfer acceptance, CRM match state, consent exceptions and follow-up suggestions.',
    "AIDexterWatchCapability_FieldsJSON" =
      '["outcome","transferStatus","transcriptStatus","matchStatus","companyName","callReason","pendingActionCount","aiDisclosureStatus","recordingConsentStatus","transcriptionConsentStatus","recordingStatus"]'::jsonb,
    "AIDexterWatchCapability_UpdatedAt" = now()
where "AIDexterWatchCapability_Code" = 'phone_calls';

create or replace function public._multideck_phone_call_watch_source_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_old jsonb := '{}'::jsonb; v_new jsonb; v_company_name text; v_reason text; v_actions integer;
begin
  if new."CommCall_CompanyID" is null then return new; end if;
  if not exists (
    select 1 from public."AI_DexterWatches" watch
    where watch."AIDexterWatch_CompanyID" = new."CommCall_CompanyID"
      and watch."AIDexterWatch_CapabilityCode" = 'phone_calls'
      and watch."AIDexterWatch_StatusCode" = 'active'
      and (watch."AIDexterWatch_TargetID" is null or watch."AIDexterWatch_TargetID" = new."CommCall_ID")
  ) then return new; end if;
  select organisation."Org_Name", review."CRMCallReview_CallReason",
    count(action."CRMCallAction_ID") filter (where action."CRMCallAction_DecisionStatus" = 'pending')::integer
  into v_company_name, v_reason, v_actions
  from public."CRM_CallReviews" review
  left join public."CRM_CallActionCandidates" action on action."CRMCallAction_CallReviewID" = review."CRMCallReview_ID"
  left join public."Org_Master" organisation on organisation."Org_id" = new."CommCall_MatchedOrgID"
  where review."CRMCallReview_CommCallID" = new."CommCall_ID"
    and review."CRMCallReview_CompanyID" = new."CommCall_CompanyID"
  group by organisation."Org_Name", review."CRMCallReview_CallReason";
  if tg_op = 'UPDATE' then
    v_old := jsonb_build_object(
      'outcome', old."CommCall_OutcomeCode", 'transferStatus', old."CommCall_TransferStatusCode",
      'transcriptStatus', old."CommCall_TranscriptStatusCode", 'matchStatus', old."CommCall_MatchStatusCode",
      'aiDisclosureStatus', old."CommCall_AIDisclosureStatusCode",
      'recordingConsentStatus', old."CommCall_RecordingConsentStatusCode",
      'transcriptionConsentStatus', old."CommCall_TranscriptionConsentStatusCode",
      'recordingStatus', old."CommCall_RecordingStatusCode",
      'companyName', v_company_name, 'callReason', v_reason,
      'pendingActionCount', coalesce(v_actions, 0)
    );
  end if;
  v_new := jsonb_build_object(
    'outcome', new."CommCall_OutcomeCode", 'transferStatus', new."CommCall_TransferStatusCode",
    'transcriptStatus', new."CommCall_TranscriptStatusCode", 'matchStatus', new."CommCall_MatchStatusCode",
    'companyName', v_company_name, 'callReason', v_reason, 'pendingActionCount', coalesce(v_actions, 0),
    'aiDisclosureStatus', new."CommCall_AIDisclosureStatusCode",
    'recordingConsentStatus', new."CommCall_RecordingConsentStatusCode",
    'transcriptionConsentStatus', new."CommCall_TranscriptionConsentStatusCode",
    'recordingStatus', new."CommCall_RecordingStatusCode"
  );
  if v_old is not distinct from v_new then return new; end if;
  insert into public."AI_DexterWatchSignals" (
    "AIDexterWatchSignal_CompanyID", "AIDexterWatchSignal_CapabilityCode",
    "AIDexterWatchSignal_SourceTable", "AIDexterWatchSignal_SourceID",
    "AIDexterWatchSignal_OldJSON", "AIDexterWatchSignal_NewJSON"
  ) values (
    new."CommCall_CompanyID", 'phone_calls', 'Comm_CallLogs', new."CommCall_ID", v_old, v_new
  );
  return new;
end;
$$;

revoke all on function public._multideck_phone_call_watch_source_change() from public, anon, authenticated;
grant execute on function public._multideck_phone_call_watch_source_change() to service_role;

drop trigger if exists "TR_Comm_CallLogs_dexter_watch" on public."Comm_CallLogs";
create trigger "TR_Comm_CallLogs_dexter_watch"
after insert or update of
  "CommCall_OutcomeCode", "CommCall_TransferStatusCode", "CommCall_TranscriptStatusCode",
  "CommCall_MatchStatusCode", "CommCall_AIDisclosureStatusCode",
  "CommCall_RecordingConsentStatusCode", "CommCall_TranscriptionConsentStatusCode",
  "CommCall_RecordingStatusCode"
on public."Comm_CallLogs"
for each row execute function public._multideck_phone_call_watch_source_change();
