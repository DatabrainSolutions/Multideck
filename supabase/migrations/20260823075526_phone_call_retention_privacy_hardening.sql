begin;

-- Legacy call-review objects pre-date the service-only Phone calls API. Keep
-- them behind the same Edge Function boundary as the newer call tables.
alter table public."CRM_CallReviewDecisions" enable row level security;
alter table public."CRM_CallEntityLinks" enable row level security;
alter table public."CRM_CallSummaryNotes" enable row level security;

revoke all on table public."CRM_CallReviewDecisions", public."CRM_CallEntityLinks",
  public."CRM_CallSummaryNotes"
from public, anon, authenticated;

grant all on table public."CRM_CallReviewDecisions", public."CRM_CallEntityLinks",
  public."CRM_CallSummaryNotes"
to service_role;

alter view public."CRM_CallActionAcceptanceSummary" set (security_invoker = true);
alter view public."CRM_CallReviewTodoQueue" set (security_invoker = true);
alter view public."CRM_PostCallReviewQueue" set (security_invoker = true);

revoke all on table public."CRM_CallActionAcceptanceSummary",
  public."CRM_CallReviewTodoQueue", public."CRM_PostCallReviewQueue"
from public, anon, authenticated;

grant select on table public."CRM_CallActionAcceptanceSummary",
  public."CRM_CallReviewTodoQueue", public."CRM_PostCallReviewQueue"
to service_role;

-- Purge the raw and AI-derived content that belongs to an expired transcript.
-- Curated CRM notes, approved summaries, approved/edited suggestions, linked
-- tasks, provider identifiers and decision history remain as the minimum
-- operational/audit record.
create or replace function public.multideck_phone_call_purge_expired(
  p_company_id uuid,
  p_limit integer default 100
)
returns integer
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_call_ids uuid[];
  v_count integer;
begin
  select coalesce(array_agg(expired.call_id), '{}'::uuid[])
  into v_call_ids
  from (
    select call."CommCall_ID" as call_id
    from public."Comm_CallLogs" call
    where call."CommCall_CompanyID" = p_company_id
      and call."CommCall_RetentionUntil" is not null
      and call."CommCall_RetentionUntil" <= now()
      and (
        call."CommCall_TranscriptStatusCode" <> 'expired'
        or (
          call."CommCall_RecordingStoragePath" is not null
          and coalesce(call."CommCall_RecordingStatusCode", '') <> 'purge_pending'
        )
      )
    order by call."CommCall_RetentionUntil"
    limit greatest(1, least(coalesce(p_limit, 100), 500))
    for update skip locked
  ) expired;

  v_count := coalesce(cardinality(v_call_ids), 0);
  if v_count = 0 then return 0; end if;

  -- Provider events can otherwise retain the same phone, participant and
  -- transcript PII after the readable call content has expired. Segment event
  -- IDs are authoritative. Stable provider leg identifiers also cover Twilio
  -- status/screening and ElevenLabs personalisation events which have no
  -- transcript segment of their own. Preserve delivery IDs and hashes for
  -- idempotency, but remove the linked provider body and error text.
  update public."Comm_CallIngestionEvents" event
  set "CommCallEvent_RawPayloadJSON" = '{}'::jsonb,
      "CommCallEvent_ErrorMessage" = null,
      "CommCallEvent_MetadataJSON" = jsonb_build_object(
        'retentionExpired', true,
        'redactedAt', now()
      )
  where event."CommCallEvent_CompanyID" = p_company_id
    and (
      event."CommCallEvent_ID" in (
        select distinct segment."CommCallSeg_RawEventID"
        from public."Comm_CallTranscriptSegments" segment
        where segment."CommCallSeg_CallID" = any(v_call_ids)
          and segment."CommCallSeg_RawEventID" is not null
      )
      or exists (
      select 1
      from public."Comm_CallProviderLegs" leg
      where leg."CommCallLeg_CompanyID" = p_company_id
        and leg."CommCallLeg_CallID" = any(v_call_ids)
        and (
          (
            event."CommCallEvent_ProviderCode" = leg."CommCallLeg_ProviderCode"
            and event."CommCallEvent_SourceObjectID" = any(array_remove(array[
              leg."CommCallLeg_ProviderCallID",
              leg."CommCallLeg_ParentProviderCallID",
              leg."CommCallLeg_ProviderConversationID",
              leg."CommCallLeg_ProviderConferenceID",
              leg."CommCallLeg_ProviderHistoryID",
              leg."CommCallLeg_ProviderSegmentID"
            ], null))
          )
          or (
            event."CommCallEvent_ProviderCode" = 'elevenlabs'
            and event."CommCallEvent_EventType" = 'conversation_initiation'
            and leg."CommCallLeg_ProviderCode" = 'twilio'
            and event."CommCallEvent_SourceObjectID" = any(array_remove(array[
              leg."CommCallLeg_ProviderCallID",
              leg."CommCallLeg_ParentProviderCallID",
              leg."CommCallLeg_ProviderConferenceID"
            ], null))
          )
        )
      )
    );

  delete from public."Comm_CallActionItems" action_item
  where action_item."CommCallAction_CallID" = any(v_call_ids);

  delete from public."Comm_CallAIOutputs" ai_output
  where ai_output."CommCallAI_CallID" = any(v_call_ids);

  update public."CRM_CallActionCandidates" action
  set "CRMCallAction_Title" = 'Expired call suggestion',
      "CRMCallAction_Description" = null,
      "CRMCallAction_ConfidenceScore" = null,
      "CRMCallAction_DecisionReason" = null,
      "CRMCallAction_DecisionStatus" = 'expired',
      "CRMCallAction_ActionPayloadJSON" = '{}'::jsonb,
      "CRMCallAction_MetadataJSON" = jsonb_build_object('retentionExpired', true),
      "CRMCallAction_EditVersion" = "CRMCallAction_EditVersion" + 1,
      "CRMCallAction_UpdatedAt" = now()
  from public."CRM_CallReviews" review
  where action."CRMCallAction_CallReviewID" = review."CRMCallReview_ID"
    and review."CRMCallReview_CommCallID" = any(v_call_ids)
    and action."CRMCallAction_DecisionStatus" = 'pending'
    and action."CRMCallAction_MetadataJSON" @> '{"generated":true}'::jsonb;

  update public."CRM_CallReviews" review
  set "CRMCallReview_AISummary" = null,
      "CRMCallReview_AISentimentCode" = null,
      "CRMCallReview_AIUrgencyScore" = null,
      "CRMCallReview_MetadataJSON" = coalesce(review."CRMCallReview_MetadataJSON", '{}'::jsonb)
        || jsonb_build_object('retentionExpired', true, 'redactedAt', now()),
      "CRMCallReview_EditVersion" = "CRMCallReview_EditVersion" + 1,
      "CRMCallReview_UpdatedAt" = now()
  where review."CRMCallReview_CommCallID" = any(v_call_ids);

  delete from public."Comm_CallTranscriptSegments" segment
  where segment."CommCallSeg_CallID" = any(v_call_ids);

  update public."Comm_CallLogs" call
  set "CommCall_TranscriptText" = null,
      "CommCall_AISummary" = null,
      "CommCall_AIActionItemsJSON" = '[]'::jsonb,
      "CommCall_TranscriptStatusCode" = 'expired',
      -- Storage objects must be deleted with the Storage API. Do not orphan a
      -- recording by clearing its pointer before that separate job succeeds.
      "CommCall_RecordingStatusCode" = case
        when call."CommCall_RecordingStoragePath" is null then 'expired'
        else 'purge_pending'
      end,
      "CommCall_MetadataJSON" = coalesce(call."CommCall_MetadataJSON", '{}'::jsonb)
        || jsonb_build_object(
          'retentionExpiredAt', now(),
          'retentionPurgeVersion', 'phone-call-retention-v2'
        ),
      "CommCall_UpdatedAt" = now()
  where call."CommCall_ID" = any(v_call_ids);

  return v_count;
end;
$$;

revoke all on function public.multideck_phone_call_purge_expired(uuid, integer)
from public, anon, authenticated;
grant execute on function public.multideck_phone_call_purge_expired(uuid, integer)
to service_role;

-- The storage worker calls this only after Storage API deletion succeeds. The
-- company predicate prevents one tenant-scoped worker request finalising a call
-- from another physical workspace by mistake.
create or replace function public.multideck_phone_call_mark_recording_purged(
  p_company_id uuid,
  p_call_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
begin
  update public."Comm_CallLogs" call
  set "CommCall_RecordingStorageBucket" = null,
      "CommCall_RecordingStoragePath" = null,
      "CommCall_RecordingStatusCode" = 'expired',
      "CommCall_MetadataJSON" = coalesce(call."CommCall_MetadataJSON", '{}'::jsonb)
        || jsonb_build_object('recordingPurgedAt', now()),
      "CommCall_UpdatedAt" = now()
  where call."CommCall_ID" = p_call_id
    and call."CommCall_CompanyID" = p_company_id
    and call."CommCall_RetentionUntil" is not null
    and call."CommCall_RetentionUntil" <= now()
    and call."CommCall_RecordingStatusCode" = 'purge_pending';

  return found;
end;
$$;

revoke all on function public.multideck_phone_call_mark_recording_purged(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.multideck_phone_call_mark_recording_purged(uuid, uuid)
to service_role;

commit;
