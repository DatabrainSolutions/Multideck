begin;

alter table public."CRM_CallReviewDecisions"
  add column if not exists "CRMCallDecision_MetadataJSON" jsonb not null default '{}'::jsonb;

create or replace function public._multideck_phone_call_review_action_v2_for_actor(
  p_company_id uuid,
  p_user_id uuid,
  p_call_id uuid,
  p_action_id uuid,
  p_decision text,
  p_edited_title text,
  p_scheduled_date date,
  p_priority text,
  p_reason text,
  p_edited_lead_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_action public."CRM_CallActionCandidates"%rowtype;
  v_review public."CRM_CallReviews"%rowtype;
  v_title text;
  v_todo_title text;
  v_original_title text;
  v_todo jsonb;
  v_original_lead_id uuid;
  v_lead_id uuid;
  v_lead_target_edited boolean := false;
begin
  perform public._multideck_phone_assert_actor(p_company_id, p_user_id, 'CRM.PhoneCalls.Review');
  select action.* into v_action
  from public."CRM_CallActionCandidates" action
  join public."CRM_CallReviews" review on review."CRMCallReview_ID" = action."CRMCallAction_CallReviewID"
  join public."Comm_CallLogs" call on call."CommCall_ID" = review."CRMCallReview_CommCallID"
  where action."CRMCallAction_ID" = p_action_id
    and call."CommCall_ID" = p_call_id
    and call."CommCall_CompanyID" = p_company_id
  for update of action;
  if not found then raise exception 'Suggested action not found.' using errcode = 'P0002'; end if;

  select review.* into strict v_review
  from public."CRM_CallReviews" review
  where review."CRMCallReview_ID" = v_action."CRMCallAction_CallReviewID";

  if v_action."CRMCallAction_DecisionStatus" <> 'pending' then
    return jsonb_build_object(
      'id', v_action."CRMCallAction_ID",
      'status', v_action."CRMCallAction_DecisionStatus",
      'todoTaskId', v_action."CRMCallAction_TodoTaskID",
      'leadId', nullif(v_action."CRMCallAction_ActionPayloadJSON" ->> 'leadId', ''),
      'replayed', true
    );
  end if;
  if p_decision not in ('approve', 'dismiss') then
    raise exception 'Choose Approve or Dismiss.' using errcode = '22023';
  end if;
  if p_edited_lead_id is not null and v_action."CRMCallAction_ActionTypeCode" <> 'link_lead' then
    raise exception 'A lead target can only be edited for a lead-link suggestion.' using errcode = '22023';
  end if;

  v_original_title := v_action."CRMCallAction_Title";
  v_title := left(coalesce(nullif(btrim(p_edited_title), ''), v_action."CRMCallAction_Title"), 240);
  v_todo_title := left(regexp_replace(v_title, '\s+—\s+add this to the to-do list\?$', '', 'i'), 240);

  if v_action."CRMCallAction_ActionTypeCode" = 'link_lead' then
    begin
      v_original_lead_id := nullif(v_action."CRMCallAction_ActionPayloadJSON" ->> 'leadId', '')::uuid;
    exception when invalid_text_representation then
      v_original_lead_id := null;
    end;
  end if;

  if p_decision = 'approve' and v_action."CRMCallAction_ActionTypeCode" in ('create_todo', 'follow_up') then
    v_todo := public._multideck_todo_create_for_actor(
      p_company_id, p_user_id, v_todo_title, coalesce(p_scheduled_date, current_date), p_priority,
      jsonb_build_array(jsonb_build_object('label', 'Phone call', 'url', '/crm/phone-calls/' || p_call_id::text)),
      jsonb_build_array(jsonb_build_object('label', 'Phone call follow-up', 'href', '/crm/phone-calls/' || p_call_id::text)),
      'dexter_action', null
    );
  elsif p_decision = 'approve' and v_action."CRMCallAction_ActionTypeCode" = 'link_lead' then
    v_lead_id := coalesce(p_edited_lead_id, v_original_lead_id);
    if v_lead_id is null then
      raise exception 'The suggested lead link is invalid.' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public."CRM_Leads" lead
      left join public."cmp_Users" owner on owner."User_ID" = lead."CRMLead_OwnerUserID"
      where lead."CRMLead_ID" = v_lead_id and not lead."CRMLead_IsDeleted"
        and (owner."Company_ID" = p_company_id or public.multideck_crm_company_can_access_account(p_company_id, lead."CRMLead_OrgID"))
    ) then raise exception 'The selected lead is outside this workspace.' using errcode = '42501'; end if;

    v_lead_target_edited := p_edited_lead_id is not null
      and p_edited_lead_id is distinct from v_original_lead_id;
    update public."Comm_CallLogs"
    set "CommCall_MatchedLeadID" = v_lead_id,
        "CommCall_MatchStatusCode" = 'matched',
        "CommCall_MatchMethodCode" = case when v_lead_target_edited then 'approved_action_edited' else 'approved_action' end,
        "CommCall_EditVersion" = "CommCall_EditVersion" + 1,
        "CommCall_UpdatedAt" = now(),
        "CommCall_UpdatedBy" = p_user_id
    where "CommCall_ID" = p_call_id;
  elsif p_decision = 'approve' then
    raise exception 'That generated action is review-only and cannot yet change CRM data.' using errcode = '22023';
  end if;

  update public."CRM_CallActionCandidates"
  set "CRMCallAction_Title" = v_title,
      "CRMCallAction_ActionPayloadJSON" = case
        when p_decision = 'approve' and v_action."CRMCallAction_ActionTypeCode" = 'link_lead'
          then jsonb_set(coalesce("CRMCallAction_ActionPayloadJSON", '{}'::jsonb), '{leadId}', to_jsonb(v_lead_id::text), true)
        else "CRMCallAction_ActionPayloadJSON"
      end,
      "CRMCallAction_DecisionStatus" = case
        when p_decision = 'dismiss' then 'rejected'
        when p_edited_title is not null or v_lead_target_edited then 'edited'
        else 'accepted'
      end,
      "CRMCallAction_DecisionReason" = nullif(left(btrim(coalesce(p_reason, '')), 1000), ''),
      "CRMCallAction_TodoTaskID" = case when v_todo is null then null else (v_todo ->> 'id')::uuid end,
      "CRMCallAction_DecidedAt" = now(),
      "CRMCallAction_DecidedBy" = p_user_id,
      "CRMCallAction_AppliedAt" = case when p_decision = 'approve' then now() else null end,
      "CRMCallAction_EditVersion" = "CRMCallAction_EditVersion" + 1,
      "CRMCallAction_UpdatedAt" = now()
  where "CRMCallAction_ID" = p_action_id
  returning * into v_action;

  insert into public."CRM_CallReviewDecisions" (
    "CRMCallDecision_CallReviewID", "CRMCallDecision_ActionCandidateID", "CRMCallDecision_Decision",
    "CRMCallDecision_OriginalText", "CRMCallDecision_EditedText", "CRMCallDecision_Reason",
    "CRMCallDecision_DecidedBy", "CRMCallDecision_MetadataJSON"
  ) values (
    v_review."CRMCallReview_ID", p_action_id, p_decision,
    v_original_title, nullif(btrim(p_edited_title), ''), nullif(btrim(p_reason), ''), p_user_id,
    jsonb_strip_nulls(jsonb_build_object(
      'actionType', v_action."CRMCallAction_ActionTypeCode",
      'originalLeadId', v_original_lead_id,
      'reviewedLeadId', v_lead_id,
      'leadTargetEdited', v_lead_target_edited
    ))
  );
  insert into public."Comm_CallAccessEvents" (
    "CommCallAccess_CompanyID", "CommCallAccess_CallID", "CommCallAccess_UserID",
    "CommCallAccess_AccessTypeCode", "CommCallAccess_MetadataJSON"
  ) values (
    p_company_id, p_call_id, p_user_id, 'action_review',
    jsonb_strip_nulls(jsonb_build_object(
      'actionId', p_action_id,
      'decision', p_decision,
      'reviewedLeadId', v_lead_id,
      'leadTargetEdited', v_lead_target_edited
    ))
  );

  return jsonb_build_object(
    'id', v_action."CRMCallAction_ID",
    'status', v_action."CRMCallAction_DecisionStatus",
    'title', v_action."CRMCallAction_Title",
    'todoTaskId', v_action."CRMCallAction_TodoTaskID",
    'leadId', v_lead_id,
    'appliedAt', v_action."CRMCallAction_AppliedAt"
  );
end;
$$;

revoke all on function public._multideck_phone_call_review_action_v2_for_actor(uuid, uuid, uuid, uuid, text, text, date, text, text, uuid)
from public, anon, authenticated;

create or replace function public.multideck_phone_call_review_action_v2(
  p_company_id uuid,
  p_user_id uuid,
  p_call_id uuid,
  p_action_id uuid,
  p_decision text,
  p_edited_title text,
  p_scheduled_date date,
  p_priority text,
  p_reason text,
  p_edited_lead_id uuid
)
returns jsonb
language sql
volatile
security definer
set search_path = pg_catalog, public
as $$
  select public._multideck_phone_call_review_action_v2_for_actor(
    p_company_id, p_user_id, p_call_id, p_action_id, p_decision,
    p_edited_title, p_scheduled_date, p_priority, p_reason, p_edited_lead_id
  )
$$;

revoke all on function public.multideck_phone_call_review_action_v2(uuid, uuid, uuid, uuid, text, text, date, text, text, uuid)
from public, anon, authenticated;
grant execute on function public.multideck_phone_call_review_action_v2(uuid, uuid, uuid, uuid, text, text, date, text, text, uuid)
to service_role;

create or replace function public.multideck_dexter_action_review_phone_call(
  p_company_id uuid,
  p_user_id uuid,
  p_arguments jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
begin
  return public._multideck_phone_call_review_action_v2_for_actor(
    p_company_id,
    p_user_id,
    (p_arguments ->> 'call_id')::uuid,
    (p_arguments ->> 'target_id')::uuid,
    p_arguments ->> 'decision',
    nullif(p_arguments ->> 'edited_title', ''),
    nullif(p_arguments ->> 'scheduled_date', '')::date,
    nullif(p_arguments ->> 'priority', ''),
    p_arguments ->> 'reason',
    nullif(p_arguments ->> 'edited_lead_id', '')::uuid
  );
end;
$$;

revoke all on function public.multideck_dexter_action_review_phone_call(uuid, uuid, jsonb)
from public, anon, authenticated;

update public."sys_AIDexterActions"
set
  "AIDexterAction_Description" = 'Approve, edit or dismiss one exact generated call suggestion. An edited lead target is revalidated before an approved CRM link changes.',
  "AIDexterAction_ParametersJSON" = '{"type":"object","properties":{"target_id":{"type":"string"},"call_id":{"type":"string"},"decision":{"type":"string","enum":["approve","dismiss"]},"edited_title":{"type":["string","null"]},"edited_lead_id":{"type":["string","null"]},"scheduled_date":{"type":["string","null"]},"priority":{"type":["string","null"],"enum":["low","medium","high","urgent",null]},"reason":{"type":"string"}},"required":["target_id","call_id","decision","edited_title","edited_lead_id","scheduled_date","priority","reason"],"additionalProperties":false}'::jsonb,
  "AIDexterAction_HasExternalEffect" = true,
  "AIDexterAction_UpdatedAt" = now()
where "AIDexterAction_Code" = 'review_phone_call_suggestion';

do $$
begin
  if not exists (
    select 1
    from public."sys_AIDexterActions" action
    where action."AIDexterAction_Code" = 'review_phone_call_suggestion'
      and action."AIDexterAction_HasExternalEffect" = true
      and action."AIDexterAction_ParametersJSON" -> 'properties' ? 'edited_lead_id'
      and action."AIDexterAction_ParametersJSON" -> 'required' ? 'edited_lead_id'
  ) then
    raise exception 'The phone-call review action registry entry is missing edited lead support.';
  end if;
end;
$$;

commit;
