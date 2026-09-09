-- Close the remaining review, Dexter-read and Watching-for-you safety gaps
-- without broadening browser access to the underlying phone-call tables.

begin;

create or replace function public.multideck_phone_call_review_match(
  p_company_id uuid,
  p_user_id uuid,
  p_call_id uuid,
  p_resolution text,
  p_company_target_id uuid default null,
  p_contact_target_id uuid default null,
  p_lead_target_id uuid default null,
  p_expected_version integer default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_call public."Comm_CallLogs"%rowtype;
  v_review_id uuid;
  v_contact_org_id uuid;
  v_lead_org_id uuid;
  v_resolved_org_id uuid;
begin
  perform public._multideck_phone_assert_actor(
    p_company_id,
    p_user_id,
    'CRM.PhoneCalls.Review'
  );

  select *
  into v_call
  from public."Comm_CallLogs" call
  where call."CommCall_ID" = p_call_id
    and call."CommCall_CompanyID" = p_company_id
  for update;

  if not found then
    raise exception 'Phone call not found.' using errcode = 'P0002';
  end if;
  if p_expected_version is not null
    and v_call."CommCall_EditVersion" <> p_expected_version then
    raise exception 'PHONE_CALL_CONFLICT: Reload this call before saving.'
      using errcode = 'P0001';
  end if;
  if p_resolution not in ('link', 'unmatched') then
    raise exception 'Choose whether to link the caller or leave the call unmatched.'
      using errcode = '22023';
  end if;
  if p_resolution = 'link'
    and num_nonnulls(
      p_company_target_id,
      p_contact_target_id,
      p_lead_target_id
    ) = 0 then
    raise exception 'Choose a company, contact or lead to link.'
      using errcode = '22023';
  end if;
  if p_resolution = 'unmatched'
    and num_nonnulls(
      p_company_target_id,
      p_contact_target_id,
      p_lead_target_id
    ) > 0 then
    raise exception 'An unmatched call cannot keep a CRM link.'
      using errcode = '22023';
  end if;
  if p_contact_target_id is not null and p_lead_target_id is not null then
    raise exception 'Link the call to a contact or a lead, not both.'
      using errcode = '22023';
  end if;

  if p_company_target_id is not null
    and not public.multideck_crm_company_can_access_account(
      p_company_id,
      p_company_target_id
    ) then
    raise exception 'That company is outside this workspace.'
      using errcode = '42501';
  end if;

  if p_contact_target_id is not null then
    select contact."Org_ID"
    into v_contact_org_id
    from public."Org_Contacts" contact
    where contact."OrgContact_ID" = p_contact_target_id
      and public.multideck_crm_company_can_access_account(
        p_company_id,
        contact."Org_ID"
      );
    if not found then
      raise exception 'That contact is outside this workspace.'
        using errcode = '42501';
    end if;
  end if;

  if p_lead_target_id is not null then
    select lead."CRMLead_OrgID"
    into v_lead_org_id
    from public."CRM_Leads" lead
    left join public."cmp_Users" owner
      on owner."User_ID" = lead."CRMLead_OwnerUserID"
    where lead."CRMLead_ID" = p_lead_target_id
      and not lead."CRMLead_IsDeleted"
      and (
        owner."Company_ID" = p_company_id
        or public.multideck_crm_company_can_access_account(
          p_company_id,
          lead."CRMLead_OrgID"
        )
      );
    if not found then
      raise exception 'That lead is outside this workspace.'
        using errcode = '42501';
    end if;
    if v_lead_org_id is not null
      and not public.multideck_crm_company_can_access_account(
        p_company_id,
        v_lead_org_id
      ) then
      raise exception 'The company linked to that lead is outside this workspace.'
        using errcode = '42501';
    end if;
  end if;

  if p_company_target_id is not null
    and v_contact_org_id is not null
    and p_company_target_id <> v_contact_org_id then
    raise exception 'That contact does not belong to the selected company.'
      using errcode = '22023';
  end if;
  if p_company_target_id is not null
    and p_lead_target_id is not null
    and (
      v_lead_org_id is null
      or p_company_target_id <> v_lead_org_id
    ) then
    raise exception 'That lead is not linked to the selected company.'
      using errcode = '22023';
  end if;

  v_resolved_org_id := case
    when p_resolution = 'unmatched' then null
    else coalesce(v_contact_org_id, v_lead_org_id, p_company_target_id)
  end;

  update public."Comm_CallLogs"
  set "CommCall_MatchedOrgID" = v_resolved_org_id,
      "CommCall_MatchedContactID" = case
        when p_resolution = 'link' then p_contact_target_id
        else null
      end,
      "CommCall_MatchedLeadID" = case
        when p_resolution = 'link' then p_lead_target_id
        else null
      end,
      "CommCall_MatchStatusCode" = case
        when p_resolution = 'link' then 'matched'
        else 'unmatched'
      end,
      "CommCall_MatchMethodCode" = 'user_review',
      "CommCall_MatchConfidence" = case
        when p_resolution = 'link' then 1
        else null
      end,
      "CommCall_EditVersion" = "CommCall_EditVersion" + 1,
      "CommCall_UpdatedAt" = now(),
      "CommCall_UpdatedBy" = p_user_id
  where "CommCall_ID" = p_call_id
  returning * into v_call;

  select "CRMCallReview_ID"
  into v_review_id
  from public."CRM_CallReviews"
  where "CRMCallReview_CommCallID" = p_call_id;

  if v_review_id is not null then
    update public."CRM_CallReviews"
    set "CRMCallReview_EditVersion" = "CRMCallReview_EditVersion" + 1,
        "CRMCallReview_UpdatedAt" = now(),
        "CRMCallReview_UpdatedBy" = p_user_id
    where "CRMCallReview_ID" = v_review_id;

    update public."CRM_CallMatchCandidates"
    set "CRMCallMatch_StatusCode" = case
          when p_resolution = 'link'
            and "CRMCallMatch_TargetID" in (
              p_company_target_id,
              p_contact_target_id,
              p_lead_target_id
            ) then 'selected'
          else 'rejected'
        end,
        "CRMCallMatch_ReviewedAt" = now(),
        "CRMCallMatch_ReviewedBy" = p_user_id
    where "CRMCallMatch_CallReviewID" = v_review_id;
  end if;

  insert into public."Comm_CallAccessEvents" (
    "CommCallAccess_CompanyID",
    "CommCallAccess_CallID",
    "CommCallAccess_UserID",
    "CommCallAccess_AccessTypeCode",
    "CommCallAccess_MetadataJSON"
  ) values (
    p_company_id,
    p_call_id,
    p_user_id,
    'match_review',
    jsonb_build_object(
      'resolution', p_resolution,
      'companyId', v_resolved_org_id,
      'contactId', p_contact_target_id,
      'leadId', p_lead_target_id
    )
  );

  return jsonb_build_object(
    'id', v_call."CommCall_ID",
    'editVersion', v_call."CommCall_EditVersion",
    'matchStatus', v_call."CommCall_MatchStatusCode",
    'companyId', v_call."CommCall_MatchedOrgID",
    'contactId', v_call."CommCall_MatchedContactID",
    'leadId', v_call."CommCall_MatchedLeadID"
  );
end;
$$;

revoke all on function public.multideck_phone_call_review_match(
  uuid, uuid, uuid, text, uuid, uuid, uuid, integer
) from public, anon, authenticated;
grant execute on function public.multideck_phone_call_review_match(
  uuid, uuid, uuid, text, uuid, uuid, uuid, integer
) to service_role;

-- Dexter receives enough bounded evidence to identify the exact inert suggestion
-- it is allowed to review. Provider transcript text remains explicitly untrusted.
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
declare
  v_context record;
  v_result jsonb;
  v_term text := nullif(btrim(p_search), '');
begin
  select * into v_context from public._multideck_dexter_context();
  if v_context.company_id <> p_company_id
    or not public._multideck_crm_has_permission(
      v_context.user_id,
      'CRM.PhoneCalls.Read'
    ) then
    raise exception 'Phone calls are outside this workspace or permission.'
      using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(call_row.row_data order by call_row.started_at desc),
    '[]'::jsonb
  )
  into v_result
  from (
    select
      jsonb_build_object(
        'recordId', call."CommCall_ID",
        'callerName', coalesce(
          call."CommCall_FromDisplayNameSnapshot",
          call."CommCall_ToDisplayNameSnapshot"
        ),
        'phoneNumber', case
          when call."CommCall_DirectionCode" = 'outbound'
            then call."CommCall_ToNumber"
          else call."CommCall_FromNumber"
        end,
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
        'contactId', call."CommCall_MatchedContactID",
        'leadId', call."CommCall_MatchedLeadID",
        'summary', coalesce(
          review."CRMCallReview_UserApprovedSummary",
          review."CRMCallReview_AISummary",
          call."CommCall_AISummary"
        ),
        'meetingNotes', left(review."CRMCallReview_MeetingNotes", 4000),
        'meetingNotesTruncated', length(
          coalesce(review."CRMCallReview_MeetingNotes", '')
        ) > 4000,
        'callReason', review."CRMCallReview_CallReason",
        'participants', coalesce(participants.items, '[]'::jsonb),
        'participantsTruncated', coalesce(participants.total, 0) > 12,
        'transcriptSegments', coalesce(transcript.items, '[]'::jsonb),
        'transcriptTruncated', coalesce(transcript.total, 0) > 40
          or coalesce(transcript.has_long_text, false),
        'pendingSuggestions', coalesce(suggestions.items, '[]'::jsonb),
        'pendingSuggestionCount', coalesce(suggestions.total, 0),
        'pendingSuggestionsTruncated', coalesce(suggestions.total, 0) > 8,
        'providerEvidence', jsonb_build_object(
          'source', call."CommCall_SourceProviderCode",
          'providerCallId', call."CommCall_ProviderCallID",
          'correlationId', call."CommCall_CorrelationID",
          'consentSourceProvider', call."CommCall_ConsentSourceProviderCode",
          'consentSourceEventId', call."CommCall_ConsentSourceEventID"
        ),
        'route', '/crm/phone-calls/' || call."CommCall_ID"::text
      ) as row_data,
      call."CommCall_StartedAt" as started_at
    from public."Comm_CallLogs" call
    left join public."CRM_CallReviews" review
      on review."CRMCallReview_CommCallID" = call."CommCall_ID"
      and review."CRMCallReview_CompanyID" = p_company_id
    left join public."Org_Master" organisation
      on organisation."Org_id" = call."CommCall_MatchedOrgID"
    left join lateral (
      select
        coalesce(jsonb_agg(item.row_data order by item.joined_at), '[]'::jsonb) as items,
        (
          select count(*)
          from public."Comm_CallParticipants" participant_count
          where participant_count."CommCallParticipant_CallID" = call."CommCall_ID"
            and participant_count."CommCallParticipant_CompanyID" = p_company_id
        ) as total
      from (
        select
          jsonb_build_object(
            'id', participant."CommCallParticipant_ID",
            'name', participant."CommCallParticipant_DisplayName",
            'phone', participant."CommCallParticipant_Phone",
            'role', participant."CommCallParticipant_TypeCode",
            'joinedAt', participant."CommCallParticipant_JoinedAt",
            'leftAt', participant."CommCallParticipant_LeftAt"
          ) as row_data,
          participant."CommCallParticipant_JoinedAt" as joined_at
        from public."Comm_CallParticipants" participant
        where participant."CommCallParticipant_CallID" = call."CommCall_ID"
          and participant."CommCallParticipant_CompanyID" = p_company_id
        order by participant."CommCallParticipant_JoinedAt" nulls last,
          participant."CommCallParticipant_CreatedAt"
        limit 12
      ) item
    ) participants on true
    left join lateral (
      select
        coalesce(
          jsonb_agg(item.row_data order by item.started_at nulls last, item.sequence_no),
          '[]'::jsonb
        ) as items,
        (
          select count(*)
          from public."Comm_CallTranscriptSegments" segment_count
          where segment_count."CommCallSeg_CallID" = call."CommCall_ID"
        ) as total,
        (
          select coalesce(bool_or(length(segment_length."CommCallSeg_Text") > 1200), false)
          from public."Comm_CallTranscriptSegments" segment_length
          where segment_length."CommCallSeg_CallID" = call."CommCall_ID"
        ) as has_long_text
      from (
        select
          jsonb_build_object(
            'id', segment."CommCallSeg_ID",
            'source', segment."CommCallSeg_SourceProviderCode",
            'sourceLegId', segment."CommCallSeg_SourceLegID",
            'providerSegmentId', segment."CommCallSeg_ProviderSegmentID",
            'sequence', segment."CommCallSeg_SourceSequenceNo",
            'startedAt', segment."CommCallSeg_StartedAt",
            'endedAt', segment."CommCallSeg_EndedAt",
            'speakerLabel', segment."CommCallSeg_SpeakerLabel",
            'speakerType', segment."CommCallSeg_SpeakerType",
            'state', segment."CommCallSeg_StateCode",
            'text', left(segment."CommCallSeg_Text", 1200),
            'untrustedEvidence', true
          ) as row_data,
          segment."CommCallSeg_StartedAt" as started_at,
          segment."CommCallSeg_SequenceNo" as sequence_no
        from public."Comm_CallTranscriptSegments" segment
        where segment."CommCallSeg_CallID" = call."CommCall_ID"
        order by segment."CommCallSeg_StartedAt" nulls last,
          segment."CommCallSeg_SequenceNo"
        limit 40
      ) item
    ) transcript on true
    left join lateral (
      select
        coalesce(
          jsonb_agg(item.row_data order by item.created_at),
          '[]'::jsonb
        ) as items,
        (
          select count(*)
          from public."CRM_CallActionCandidates" action_count
          where action_count."CRMCallAction_CallReviewID" = review."CRMCallReview_ID"
            and action_count."CRMCallAction_DecisionStatus" = 'pending'
        ) as total
      from (
        select
          jsonb_build_object(
            'id', action."CRMCallAction_ID",
            'callId', call."CommCall_ID",
            'type', action."CRMCallAction_ActionTypeCode",
            'title', action."CRMCallAction_Title",
            'reason', action."CRMCallAction_Description",
            'confidence', action."CRMCallAction_ConfidenceScore",
            'status', action."CRMCallAction_DecisionStatus",
            'requiresReview', true,
            'sourceKey', action."CRMCallAction_SourceKey"
          ) as row_data,
          action."CRMCallAction_CreatedAt" as created_at
        from public."CRM_CallActionCandidates" action
        where action."CRMCallAction_CallReviewID" = review."CRMCallReview_ID"
          and action."CRMCallAction_DecisionStatus" = 'pending'
        order by action."CRMCallAction_CreatedAt"
        limit 8
      ) item
    ) suggestions on true
    where call."CommCall_CompanyID" = p_company_id
      and (
        v_term is null
        or concat_ws(
          ' ',
          call."CommCall_FromDisplayNameSnapshot",
          call."CommCall_ToDisplayNameSnapshot",
          call."CommCall_FromNumber",
          call."CommCall_ToNumber",
          organisation."Org_Name",
          review."CRMCallReview_CallReason",
          review."CRMCallReview_AISummary"
        ) ilike '%' || v_term || '%'
      )
    order by call."CommCall_StartedAt" desc nulls last,
      call."CommCall_CreatedAt" desc
    limit greatest(1, least(coalesce(p_take, 10), 25))
  ) call_row;

  return v_result;
end;
$$;

revoke all on function public.multideck_dexter_domain_phone_calls(
  uuid, text, integer
) from public, anon, authenticated;
grant execute on function public.multideck_dexter_domain_phone_calls(
  uuid, text, integer
) to service_role;

create or replace function public._multideck_phone_call_watch_snapshot(
  p_company_id uuid,
  p_call_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce((
    select jsonb_build_object(
      'outcome', call."CommCall_OutcomeCode",
      'transferStatus', call."CommCall_TransferStatusCode",
      'transcriptStatus', call."CommCall_TranscriptStatusCode",
      'matchStatus', call."CommCall_MatchStatusCode",
      'companyId', call."CommCall_MatchedOrgID",
      'companyName', organisation."Org_Name",
      'contactId', call."CommCall_MatchedContactID",
      'leadId', call."CommCall_MatchedLeadID",
      'callReason', review."CRMCallReview_CallReason",
      'pendingActionCount', coalesce(action_count.pending_count, 0),
      'aiDisclosureStatus', call."CommCall_AIDisclosureStatusCode",
      'recordingConsentStatus', call."CommCall_RecordingConsentStatusCode",
      'transcriptionConsentStatus', call."CommCall_TranscriptionConsentStatusCode",
      'recordingStatus', call."CommCall_RecordingStatusCode"
    )
    from public."Comm_CallLogs" call
    left join public."Org_Master" organisation
      on organisation."Org_id" = call."CommCall_MatchedOrgID"
    left join public."CRM_CallReviews" review
      on review."CRMCallReview_CommCallID" = call."CommCall_ID"
      and review."CRMCallReview_CompanyID" = p_company_id
    left join lateral (
      select count(*) filter (
        where action."CRMCallAction_DecisionStatus" = 'pending'
      )::integer as pending_count
      from public."CRM_CallActionCandidates" action
      where action."CRMCallAction_CallReviewID" = review."CRMCallReview_ID"
    ) action_count on true
    where call."CommCall_ID" = p_call_id
      and call."CommCall_CompanyID" = p_company_id
  ), '{}'::jsonb);
$$;

create or replace function public._multideck_phone_call_pause_unauthorised_watches(
  p_company_id uuid
)
returns integer
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare v_count integer;
begin
  update public."AI_DexterWatches" watch
  set "AIDexterWatch_StatusCode" = 'paused',
      "AIDexterWatch_IsArmed" = true,
      "AIDexterWatch_UpdatedAt" = now()
  where watch."AIDexterWatch_CompanyID" = p_company_id
    and watch."AIDexterWatch_CapabilityCode" = 'phone_calls'
    and watch."AIDexterWatch_StatusCode" = 'active'
    and not public._multideck_crm_has_permission(
      watch."AIDexterWatch_OwnerUserID",
      'CRM.PhoneCalls.Read'
    );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public._multideck_phone_call_watch_source_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_old jsonb := '{}'::jsonb;
  v_new jsonb;
  v_old_company_name text;
begin
  if new."CommCall_CompanyID" is null then return new; end if;
  perform public._multideck_phone_call_pause_unauthorised_watches(
    new."CommCall_CompanyID"
  );
  if not exists (
    select 1
    from public."AI_DexterWatches" watch
    where watch."AIDexterWatch_CompanyID" = new."CommCall_CompanyID"
      and watch."AIDexterWatch_CapabilityCode" = 'phone_calls'
      and watch."AIDexterWatch_StatusCode" = 'active'
      and public._multideck_crm_has_permission(
        watch."AIDexterWatch_OwnerUserID",
        'CRM.PhoneCalls.Read'
      )
      and (
        watch."AIDexterWatch_TargetID" is null
        or watch."AIDexterWatch_TargetID" = new."CommCall_ID"
      )
  ) then
    return new;
  end if;

  v_new := public._multideck_phone_call_watch_snapshot(
    new."CommCall_CompanyID",
    new."CommCall_ID"
  );

  if tg_op = 'UPDATE' then
    select organisation."Org_Name"
    into v_old_company_name
    from public."Org_Master" organisation
    where organisation."Org_id" = old."CommCall_MatchedOrgID";

    v_old := v_new || jsonb_build_object(
      'outcome', old."CommCall_OutcomeCode",
      'transferStatus', old."CommCall_TransferStatusCode",
      'transcriptStatus', old."CommCall_TranscriptStatusCode",
      'matchStatus', old."CommCall_MatchStatusCode",
      'companyId', old."CommCall_MatchedOrgID",
      'companyName', v_old_company_name,
      'contactId', old."CommCall_MatchedContactID",
      'leadId', old."CommCall_MatchedLeadID",
      'aiDisclosureStatus', old."CommCall_AIDisclosureStatusCode",
      'recordingConsentStatus', old."CommCall_RecordingConsentStatusCode",
      'transcriptionConsentStatus', old."CommCall_TranscriptionConsentStatusCode",
      'recordingStatus', old."CommCall_RecordingStatusCode"
    );
  end if;

  if v_old is not distinct from v_new then return new; end if;
  insert into public."AI_DexterWatchSignals" (
    "AIDexterWatchSignal_CompanyID",
    "AIDexterWatchSignal_CapabilityCode",
    "AIDexterWatchSignal_SourceTable",
    "AIDexterWatchSignal_SourceID",
    "AIDexterWatchSignal_OldJSON",
    "AIDexterWatchSignal_NewJSON"
  ) values (
    new."CommCall_CompanyID",
    'phone_calls',
    'Comm_CallLogs',
    new."CommCall_ID",
    v_old,
    v_new
  );
  return new;
end;
$$;

create or replace function public._multideck_phone_call_action_watch_source_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_call_id uuid;
  v_company_id uuid;
  v_pending integer;
  v_old_pending integer;
  v_old jsonb;
  v_new jsonb;
begin
  select call."CommCall_ID", call."CommCall_CompanyID"
  into v_call_id, v_company_id
  from public."CRM_CallReviews" review
  join public."Comm_CallLogs" call
    on call."CommCall_ID" = review."CRMCallReview_CommCallID"
  where review."CRMCallReview_ID" = new."CRMCallAction_CallReviewID";

  if v_call_id is null then return new; end if;
  perform public._multideck_phone_call_pause_unauthorised_watches(v_company_id);
  if not exists (
    select 1
    from public."AI_DexterWatches" watch
    where watch."AIDexterWatch_CompanyID" = v_company_id
      and watch."AIDexterWatch_CapabilityCode" = 'phone_calls'
      and watch."AIDexterWatch_StatusCode" = 'active'
      and public._multideck_crm_has_permission(
        watch."AIDexterWatch_OwnerUserID",
        'CRM.PhoneCalls.Read'
      )
      and (
        watch."AIDexterWatch_TargetID" is null
        or watch."AIDexterWatch_TargetID" = v_call_id
      )
  ) then
    return new;
  end if;

  select count(*) filter (
    where action."CRMCallAction_DecisionStatus" = 'pending'
  )::integer
  into v_pending
  from public."CRM_CallActionCandidates" action
  where action."CRMCallAction_CallReviewID" = new."CRMCallAction_CallReviewID";

  v_old_pending := greatest(
    0,
    coalesce(v_pending, 0)
      - case
          when new."CRMCallAction_DecisionStatus" = 'pending' then 1
          else 0
        end
      + case
          when tg_op = 'UPDATE'
            and old."CRMCallAction_DecisionStatus" = 'pending' then 1
          else 0
        end
  );
  v_new := public._multideck_phone_call_watch_snapshot(
    v_company_id,
    v_call_id
  ) || jsonb_build_object(
    'actionStatus', new."CRMCallAction_DecisionStatus"
  );
  v_old := v_new || jsonb_build_object(
    'pendingActionCount', v_old_pending,
    'actionStatus', case
      when tg_op = 'UPDATE' then old."CRMCallAction_DecisionStatus"
      else null
    end
  );

  if v_old is not distinct from v_new then return new; end if;
  insert into public."AI_DexterWatchSignals" (
    "AIDexterWatchSignal_CompanyID",
    "AIDexterWatchSignal_CapabilityCode",
    "AIDexterWatchSignal_SourceTable",
    "AIDexterWatchSignal_SourceID",
    "AIDexterWatchSignal_OldJSON",
    "AIDexterWatchSignal_NewJSON"
  ) values (
    v_company_id,
    'phone_calls',
    'CRM_CallActionCandidates',
    v_call_id,
    v_old,
    v_new
  );
  return new;
end;
$$;

create or replace function public._multideck_phone_call_review_watch_source_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_call_id uuid;
  v_company_id uuid;
  v_old jsonb;
  v_new jsonb;
begin
  if tg_op = 'INSERT'
    and nullif(btrim(new."CRMCallReview_CallReason"), '') is null then
    return new;
  end if;
  if tg_op = 'UPDATE'
    and old."CRMCallReview_CallReason"
      is not distinct from new."CRMCallReview_CallReason" then
    return new;
  end if;

  select call."CommCall_ID", call."CommCall_CompanyID"
  into v_call_id, v_company_id
  from public."Comm_CallLogs" call
  where call."CommCall_ID" = new."CRMCallReview_CommCallID";

  if v_call_id is null then return new; end if;
  perform public._multideck_phone_call_pause_unauthorised_watches(v_company_id);
  if not exists (
    select 1
    from public."AI_DexterWatches" watch
    where watch."AIDexterWatch_CompanyID" = v_company_id
      and watch."AIDexterWatch_CapabilityCode" = 'phone_calls'
      and watch."AIDexterWatch_StatusCode" = 'active'
      and public._multideck_crm_has_permission(
        watch."AIDexterWatch_OwnerUserID",
        'CRM.PhoneCalls.Read'
      )
      and (
        watch."AIDexterWatch_TargetID" is null
        or watch."AIDexterWatch_TargetID" = v_call_id
      )
  ) then
    return new;
  end if;

  v_new := public._multideck_phone_call_watch_snapshot(
    v_company_id,
    v_call_id
  );
  v_old := v_new || jsonb_build_object(
    'callReason', case
      when tg_op = 'UPDATE' then old."CRMCallReview_CallReason"
      else null
    end
  );

  if v_old is not distinct from v_new then return new; end if;
  insert into public."AI_DexterWatchSignals" (
    "AIDexterWatchSignal_CompanyID",
    "AIDexterWatchSignal_CapabilityCode",
    "AIDexterWatchSignal_SourceTable",
    "AIDexterWatchSignal_SourceID",
    "AIDexterWatchSignal_OldJSON",
    "AIDexterWatchSignal_NewJSON"
  ) values (
    v_company_id,
    'phone_calls',
    'CRM_CallReviews',
    v_call_id,
    v_old,
    v_new
  );
  return new;
end;
$$;

drop trigger if exists "TR_Comm_CallLogs_dexter_watch"
  on public."Comm_CallLogs";
create trigger "TR_Comm_CallLogs_dexter_watch"
after insert or update of
  "CommCall_OutcomeCode",
  "CommCall_TransferStatusCode",
  "CommCall_TranscriptStatusCode",
  "CommCall_MatchStatusCode",
  "CommCall_MatchedOrgID",
  "CommCall_MatchedContactID",
  "CommCall_MatchedLeadID",
  "CommCall_AIDisclosureStatusCode",
  "CommCall_RecordingConsentStatusCode",
  "CommCall_TranscriptionConsentStatusCode",
  "CommCall_RecordingStatusCode"
on public."Comm_CallLogs"
for each row execute function public._multideck_phone_call_watch_source_change();

drop trigger if exists "TR_CRM_CallActionCandidates_dexter_watch"
  on public."CRM_CallActionCandidates";
create trigger "TR_CRM_CallActionCandidates_dexter_watch"
after insert or update of "CRMCallAction_DecisionStatus"
on public."CRM_CallActionCandidates"
for each row execute function public._multideck_phone_call_action_watch_source_change();

drop trigger if exists "TR_CRM_CallReviews_dexter_watch"
  on public."CRM_CallReviews";
create trigger "TR_CRM_CallReviews_dexter_watch"
after insert or update of "CRMCallReview_CallReason"
on public."CRM_CallReviews"
for each row execute function public._multideck_phone_call_review_watch_source_change();

revoke all on function public._multideck_phone_call_watch_snapshot(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public._multideck_phone_call_watch_snapshot(uuid, uuid)
  to service_role;
revoke all on function public._multideck_phone_call_pause_unauthorised_watches(uuid)
  from public, anon, authenticated;
grant execute on function public._multideck_phone_call_pause_unauthorised_watches(uuid)
  to service_role;
revoke all on function public._multideck_phone_call_watch_source_change()
  from public, anon, authenticated;
grant execute on function public._multideck_phone_call_watch_source_change()
  to service_role;
revoke all on function public._multideck_phone_call_action_watch_source_change()
  from public, anon, authenticated;
grant execute on function public._multideck_phone_call_action_watch_source_change()
  to service_role;
revoke all on function public._multideck_phone_call_review_watch_source_change()
  from public, anon, authenticated;
grant execute on function public._multideck_phone_call_review_watch_source_change()
  to service_role;

update public."sys_AIDexterWatchCapabilities"
set "AIDexterWatchCapability_Description" =
      'Phone call outcomes, transcript readiness, transfer acceptance, CRM match state, consent exceptions and follow-up suggestions.',
    "AIDexterWatchCapability_FieldsJSON" =
      '["outcome","transferStatus","transcriptStatus","matchStatus","companyId","companyName","contactId","leadId","callReason","pendingActionCount","aiDisclosureStatus","recordingConsentStatus","transcriptionConsentStatus","recordingStatus"]'::jsonb,
    "AIDexterWatchCapability_UpdatedAt" = now()
where "AIDexterWatchCapability_Code" = 'phone_calls';

-- Give every durable raw event its own eventual-redaction boundary. The column
-- remains nullable until the Edge Function writes the validated tenant policy;
-- no historical legal policy is invented by this migration.
alter table public."Comm_CallIngestionEvents"
  add column if not exists "CommCallEvent_RetentionUntil" timestamptz;

create index if not exists "IX_Comm_CallIngestionEvents_retention"
  on public."Comm_CallIngestionEvents" (
    "CommCallEvent_CompanyID",
    "CommCallEvent_RetentionUntil"
  )
  where "CommCallEvent_RetentionUntil" is not null
    and "CommCallEvent_RawPayloadJSON" <> '{}'::jsonb;

create or replace function public.multideck_phone_call_purge_expired_events(
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
  v_event_ids uuid[];
  v_count integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'server_only' using errcode = '42501';
  end if;

  select coalesce(array_agg(expired.event_id), '{}'::uuid[])
  into v_event_ids
  from (
    select event."CommCallEvent_ID" as event_id
    from public."Comm_CallIngestionEvents" event
    where event."CommCallEvent_CompanyID" = p_company_id
      and event."CommCallEvent_RetentionUntil" is not null
      and event."CommCallEvent_RetentionUntil" <= now()
      and event."CommCallEvent_RawPayloadJSON" <> '{}'::jsonb
    order by event."CommCallEvent_RetentionUntil",
      event."CommCallEvent_ReceivedAt"
    limit greatest(1, least(coalesce(p_limit, 100), 500))
    for update skip locked
  ) expired;

  v_count := coalesce(cardinality(v_event_ids), 0);
  if v_count = 0 then return 0; end if;

  update public."Comm_CallIngestionEvents" event
  set "CommCallEvent_RawPayloadJSON" = '{}'::jsonb,
      "CommCallEvent_ErrorCode" = null,
      "CommCallEvent_ErrorMessage" = null,
      "CommCallEvent_NextAttemptAt" = null,
      "CommCallEvent_LeaseToken" = null,
      "CommCallEvent_LeaseExpiresAt" = null,
      "CommCallEvent_StatusCode" = case
        when event."CommCallEvent_StatusCode" in (
          'received', 'processing', 'partial', 'retryable'
        ) then 'terminal'
        else event."CommCallEvent_StatusCode"
      end,
      "CommCallEvent_ProcessedAt" = coalesce(
        event."CommCallEvent_ProcessedAt",
        now()
      ),
      "CommCallEvent_MetadataJSON" = jsonb_build_object(
        'retentionExpired', true,
        'retentionScope', 'raw_event',
        'redactedAt', now()
      )
  where event."CommCallEvent_CompanyID" = p_company_id
    and event."CommCallEvent_ID" = any(v_event_ids);

  return v_count;
end;
$$;

revoke all on function public.multideck_phone_call_purge_expired_events(
  uuid, integer
) from public, anon, authenticated;
grant execute on function public.multideck_phone_call_purge_expired_events(
  uuid, integer
) to service_role;

commit;
