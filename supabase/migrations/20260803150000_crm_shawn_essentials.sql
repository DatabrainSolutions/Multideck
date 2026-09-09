-- Shawn CRM essentials: a user-scoped dashboard, controlled lead ownership,
-- and idempotent deal-to-customer conversion.

begin;

insert into public."sys_Permissions" (
  "sys_Permission_Value",
  "sys_Permission_Group",
  "sys_Permission_Name",
  "sys_Permission_Description",
  "sys_Permission_IsDangerous"
)
values
  ('CRM.Leads.Reassign', 'Sales & CRM', 'Reassign CRM leads', 'Override CRM lead ownership with a recorded reason.', true),
  ('CRM.Deals.Win', 'Sales & CRM', 'Mark CRM deals won', 'Convert a won CRM deal into an operational customer.', true)
on conflict ("sys_Permission_Value") do update
set "sys_Permission_Group" = excluded."sys_Permission_Group",
    "sys_Permission_Name" = excluded."sys_Permission_Name",
    "sys_Permission_Description" = excluded."sys_Permission_Description",
    "sys_Permission_IsDangerous" = excluded."sys_Permission_IsDangerous";

insert into public."sys_UserRole_Permissions" ("sys_UserRole_ID", "sys_Permission_ID")
select role."sys_UserRole_ID", permission."sys_Permission_ID"
from public."sys_UserRoles" role
cross join public."sys_Permissions" permission
where lower(role."sys_UserRole_Name") in ('administrator', 'operations manager')
  and permission."sys_Permission_Value" in ('CRM.Leads.Reassign', 'CRM.Deals.Win')
on conflict do nothing;

insert into public."sys_UserRole_Permissions" ("sys_UserRole_ID", "sys_Permission_ID")
select role."sys_UserRole_ID", permission."sys_Permission_ID"
from public."sys_UserRoles" role
cross join public."sys_Permissions" permission
where lower(role."sys_UserRole_Name") = 'operator'
  and permission."sys_Permission_Value" = 'CRM.Deals.Win'
on conflict do nothing;

create table if not exists public."CRM_LeadTransferRequests" (
  "CRMLeadTransfer_ID" uuid primary key default gen_random_uuid(),
  "Company_ID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "CRMLeadTransfer_LeadID" uuid not null references public."CRM_Leads"("CRMLead_ID") on delete cascade,
  "CRMLeadTransfer_RequesterUserID" uuid not null references public."cmp_Users"("User_ID") on delete cascade,
  "CRMLeadTransfer_FromUserID" uuid not null references public."cmp_Users"("User_ID") on delete cascade,
  "CRMLeadTransfer_ToUserID" uuid not null references public."cmp_Users"("User_ID") on delete cascade,
  "CRMLeadTransfer_Status" text not null default 'pending'
    check ("CRMLeadTransfer_Status" in ('pending', 'approved', 'declined', 'cancelled', 'superseded')),
  "CRMLeadTransfer_RequestNote" text,
  "CRMLeadTransfer_DecisionReason" text,
  "CRMLeadTransfer_RequestedAt" timestamptz not null default now(),
  "CRMLeadTransfer_DecidedAt" timestamptz,
  "CRMLeadTransfer_DecidedBy" uuid references public."cmp_Users"("User_ID") on delete set null,
  "CRMLeadTransfer_CancelledAt" timestamptz,
  "CRMLeadTransfer_UpdatedAt" timestamptz not null default now()
);

create unique index if not exists "UX_CRM_LeadTransferRequests_pending_lead_target"
  on public."CRM_LeadTransferRequests" ("CRMLeadTransfer_LeadID", "CRMLeadTransfer_ToUserID")
  where "CRMLeadTransfer_Status" = 'pending';
create index if not exists "IX_CRM_LeadTransferRequests_owner_status_requested"
  on public."CRM_LeadTransferRequests" ("Company_ID", "CRMLeadTransfer_FromUserID", "CRMLeadTransfer_Status", "CRMLeadTransfer_RequestedAt" desc);
create index if not exists "IX_CRM_LeadTransferRequests_requester_status_requested"
  on public."CRM_LeadTransferRequests" ("Company_ID", "CRMLeadTransfer_RequesterUserID", "CRMLeadTransfer_Status", "CRMLeadTransfer_RequestedAt" desc);

alter table public."CRM_LeadTransferRequests" enable row level security;
revoke all on table public."CRM_LeadTransferRequests" from public, anon, authenticated;
grant all on table public."CRM_LeadTransferRequests" to service_role;

create or replace function public._multideck_crm_has_permission(p_user_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public."cmp_Users_Roles" user_role
    join public."sys_UserRole_Permissions" role_permission
      on role_permission."sys_UserRole_ID" = user_role."sys_UserRole_ID"
    join public."sys_Permissions" permission
      on permission."sys_Permission_ID" = role_permission."sys_Permission_ID"
    where user_role."User_ID" = p_user_id
      and permission."sys_Permission_Value" = p_permission
  );
$$;

create or replace function public._multideck_crm_transfer_request_json(p_request_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'id', request."CRMLeadTransfer_ID",
    'leadId', request."CRMLeadTransfer_LeadID",
    'leadName', coalesce(nullif(btrim(lead."CRMLead_CompanyName"), ''), nullif(btrim(lead."CRMLead_PersonName"), ''), 'Unnamed lead'),
    'requesterId', request."CRMLeadTransfer_RequesterUserID",
    'requesterName', coalesce(nullif(btrim(concat_ws(' ', requester."User_Firstname", requester."User_Lastname")), ''), requester."User_Email"),
    'fromUserId', request."CRMLeadTransfer_FromUserID",
    'fromUserName', coalesce(nullif(btrim(concat_ws(' ', owner_user."User_Firstname", owner_user."User_Lastname")), ''), owner_user."User_Email"),
    'toUserId', request."CRMLeadTransfer_ToUserID",
    'toUserName', coalesce(nullif(btrim(concat_ws(' ', target_user."User_Firstname", target_user."User_Lastname")), ''), target_user."User_Email"),
    'status', request."CRMLeadTransfer_Status",
    'requestNote', request."CRMLeadTransfer_RequestNote",
    'decisionReason', request."CRMLeadTransfer_DecisionReason",
    'requestedAt', request."CRMLeadTransfer_RequestedAt",
    'decidedAt', request."CRMLeadTransfer_DecidedAt",
    'canDecide', request."CRMLeadTransfer_Status" = 'pending'
  )
  from public."CRM_LeadTransferRequests" request
  join public."CRM_Leads" lead on lead."CRMLead_ID" = request."CRMLeadTransfer_LeadID"
  join public."cmp_Users" requester on requester."User_ID" = request."CRMLeadTransfer_RequesterUserID"
  join public."cmp_Users" owner_user on owner_user."User_ID" = request."CRMLeadTransfer_FromUserID"
  join public."cmp_Users" target_user on target_user."User_ID" = request."CRMLeadTransfer_ToUserID"
  where request."CRMLeadTransfer_ID" = p_request_id;
$$;

create or replace function public.multideck_crm_get_dashboard(
  p_inactivity_days integer default 90,
  p_area text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_context record;
  v_area text := nullif(lower(btrim(coalesce(p_area, ''))), '');
  v_result jsonb;
begin
  select * into v_context from public._multideck_crm_context();
  if p_inactivity_days not in (30, 90, 180) then
    raise exception 'Choose an inactivity threshold of 30, 90 or 180 days.' using errcode = '22023';
  end if;

  with owned_leads as (
    select
      lead.*,
      status."CRMLeadStatus_Name" as status_name,
      status."CRMLeadStatus_IsOpen" as is_open,
      coalesce(nullif(btrim(lead."CRMLead_CompanyName"), ''), organisation."Org_Name", nullif(btrim(lead."CRMLead_PersonName"), ''), 'Unnamed lead') as company_name,
      coalesce(nullif(btrim(lead."CRMLead_PersonName"), ''), nullif(btrim(concat_ws(' ', contact."OrgContact_FirstName", contact."OrgContact_LastName")), '')) as contact_name,
      coalesce(nullif(btrim(lead."CRMLead_Email"), ''), contact_email.email, address."OrgAdd_MainEmail") as email,
      greatest(lead."CRMLead_LastInteractionAt", activity.last_activity_at) as last_contact_at,
      activity.last_subject,
      address.area_label,
      address.area_key,
      coalesce(lead."CRMLead_EstimatedValueCurrencyCode", 'GBP') as currency_code
    from public."CRM_Leads" lead
    join public."sys_CRMLeadStatuses" status on status."CRMLeadStatus_Code" = lead."CRMLead_StatusCode"
    left join public."Org_Master" organisation on organisation."Org_id" = lead."CRMLead_OrgID"
    left join public."Org_Contacts" contact on contact."OrgContact_ID" = lead."CRMLead_PrimaryContactID"
    left join lateral (
      select nullif(btrim(email_row."OrgContactEmail_Email"), '') as email
      from public."OrgContact_Emails" email_row
      where email_row."OrgContact_ID" = contact."OrgContact_ID"
      order by email_row."OrgContactEmail_Type", email_row."OrgContactEmail_ID"
      limit 1
    ) contact_email on true
    left join lateral (
      select
        nullif(concat_ws(' · ', nullif(btrim(a."OrgAdd_TownCity"), ''), nullif(btrim(a."OrgAdd_CountyState"), ''),
          nullif(split_part(btrim(a."OrgAdd_PostZipCode"), ' ', 1), ''), nullif(upper(btrim(a."OrgAdd_Country")), '')), '') as area_label,
        lower(nullif(concat_ws('|', nullif(btrim(a."OrgAdd_TownCity"), ''), nullif(btrim(a."OrgAdd_CountyState"), ''),
          nullif(split_part(btrim(a."OrgAdd_PostZipCode"), ' ', 1), ''), nullif(upper(btrim(a."OrgAdd_Country")), '')), '')) as area_key,
        a."OrgAdd_MainEmail"
      from public."Org_Addresses" a
      where a."Org_ID" = lead."CRMLead_OrgID"
      order by a."OrgAdd_ID"
      limit 1
    ) address on true
    left join lateral (
      select max(a."CRMActivity_ActivityAt") as last_activity_at,
             (array_agg(a."CRMActivity_Subject" order by a."CRMActivity_ActivityAt" desc))[1] as last_subject
      from public."CRM_Activities" a
      where a."CRMActivity_LeadID" = lead."CRMLead_ID" and not a."CRMActivity_IsDeleted"
    ) activity on true
    where lead."CRMLead_OwnerUserID" = v_context.user_id
      and not lead."CRMLead_IsDeleted"
  ), filtered_leads as (
    select * from owned_leads where v_area is null or area_key = v_area
  ), owned_deals as (
    select opportunity.*,
           stage."CRMPipelineStage_Name" as pipeline_stage_name,
           pipeline."CRMPipeline_Name" as pipeline_name
    from public."CRM_Opportunities" opportunity
    join public."CRM_Pipelines" pipeline on pipeline."CRMPipeline_ID" = opportunity."CRMOppty_PipelineID"
      and pipeline."Company_ID" = v_context.company_id and not pipeline."Is_Deleted"
    join public."CRM_PipelineStages" stage on stage."CRMPipelineStage_ID" = opportunity."CRMOppty_PipelineStageID"
      and not stage."Is_Deleted"
    where opportunity."CRMOppty_OwnerUserID" = v_context.user_id and not opportunity."CRMOppty_IsDeleted"
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'openLeads', (select count(*) from filtered_leads where is_open),
      'staleLeads', (select count(*) from filtered_leads where is_open and (last_contact_at is null or last_contact_at < now() - make_interval(days => p_inactivity_days))),
      'openDeals', (select count(*) from owned_deals where "CRMOppty_WonAt" is null and "CRMOppty_LostAt" is null),
      'pipelineValue', coalesce((select sum("CRMOppty_ExpectedValueAmount") from owned_deals where "CRMOppty_WonAt" is null and "CRMOppty_LostAt" is null), 0),
      'currencyCode', coalesce((select nullif(btrim("CRMOppty_CurrencyCode"), '') from owned_deals where "CRMOppty_ExpectedValueAmount" is not null order by "CRMOppty_CreatedAt" desc limit 1), 'GBP'),
      'dueFollowUps', (select count(*) from filtered_leads where is_open and "CRMLead_NextActionDueAt" <= now())
    ),
    'areas', coalesce((select jsonb_agg(jsonb_build_object('key', area_key, 'label', area_label, 'count', lead_count) order by area_label)
      from (select area_key, area_label, count(*) lead_count from owned_leads where area_key is not null group by area_key, area_label) areas), '[]'::jsonb),
    'followUps', coalesce((select jsonb_agg(jsonb_build_object(
      'id', "CRMLead_ID", 'companyName', company_name, 'decisionMaker', contact_name, 'email', email,
      'location', area_label, 'lastContactAt', last_contact_at, 'previousConversation', last_subject,
      'laneContext', coalesce(nullif(btrim("CRMLead_TradeLane"), ''), nullif(btrim("CRMLead_ServiceInterest"), '')),
      'nextActionAt', "CRMLead_NextActionDueAt", 'stage', status_name,
      'opportunityValue', "CRMLead_EstimatedValueAmount", 'currencyCode', currency_code,
      'contactAgeDays', case when last_contact_at is null then null else floor(extract(epoch from (now() - last_contact_at)) / 86400)::integer end,
      'neverContacted', last_contact_at is null
    ) order by (last_contact_at is not null), last_contact_at asc, "CRMLead_CreatedAt" asc)
    from filtered_leads where is_open and (last_contact_at is null or last_contact_at < now() - make_interval(days => p_inactivity_days))), '[]'::jsonb),
    'pipeline', coalesce((select jsonb_agg(jsonb_build_object(
      'stageId', "CRMOppty_PipelineStageID", 'stage', pipeline_stage_name, 'pipeline', pipeline_name,
      'count', deal_count, 'value', deal_value, 'currencyCode', currency_code
    ) order by stage_order)
    from (select "CRMOppty_PipelineStageID", pipeline_stage_name, pipeline_name, min("CRMOppty_CurrencyCode") currency_code,
      count(*) deal_count, coalesce(sum("CRMOppty_ExpectedValueAmount"), 0) deal_value,
      min((select s."CRMPipelineStage_SortOrder" from public."CRM_PipelineStages" s where s."CRMPipelineStage_ID" = owned_deals."CRMOppty_PipelineStageID")) stage_order
      from owned_deals where "CRMOppty_WonAt" is null and "CRMOppty_LostAt" is null
      group by "CRMOppty_PipelineStageID", pipeline_stage_name, pipeline_name) pipeline_groups), '[]'::jsonb),
    'activity', coalesce((select jsonb_agg(jsonb_build_object(
      'id', activity."CRMActivity_ID", 'leadId', activity."CRMActivity_LeadID", 'dealId', activity."CRMActivity_OpportunityID",
      'subject', activity."CRMActivity_Subject", 'summary', activity."CRMActivity_Summary", 'at', activity."CRMActivity_ActivityAt"
    ) order by activity."CRMActivity_ActivityAt" desc)
    from (select activity.* from public."CRM_Activities" activity
      where not activity."CRMActivity_IsDeleted" and activity."CRMActivity_OwnerUserID" = v_context.user_id
      order by activity."CRMActivity_ActivityAt" desc limit 12) activity), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.multideck_crm_list_transfer_users()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare v_context record; v_result jsonb;
begin
  select * into v_context from public._multideck_crm_context();
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', user_row."User_ID", 'name', coalesce(nullif(btrim(concat_ws(' ', user_row."User_Firstname", user_row."User_Lastname")), ''), user_row."User_Email"),
    'email', user_row."User_Email", 'isCurrentUser', user_row."User_ID" = v_context.user_id
  ) order by user_row."User_Firstname", user_row."User_Lastname", user_row."User_Email"), '[]'::jsonb)
  into v_result
  from public."cmp_Users" user_row
  where user_row."Company_ID" = v_context.company_id and user_row."Auth_User_ID" is not null;
  return v_result;
end;
$$;

create or replace function public.multideck_crm_list_transfer_requests(p_lead_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare v_context record; v_result jsonb;
begin
  select * into v_context from public._multideck_crm_context();
  select coalesce(jsonb_agg(public._multideck_crm_transfer_request_json(request."CRMLeadTransfer_ID") order by request."CRMLeadTransfer_RequestedAt" desc), '[]'::jsonb)
  into v_result
  from public."CRM_LeadTransferRequests" request
  where request."Company_ID" = v_context.company_id
    and (p_lead_id is null or request."CRMLeadTransfer_LeadID" = p_lead_id)
    and (request."CRMLeadTransfer_RequesterUserID" = v_context.user_id
      or request."CRMLeadTransfer_FromUserID" = v_context.user_id
      or request."CRMLeadTransfer_ToUserID" = v_context.user_id
      or public._multideck_crm_has_permission(v_context.user_id, 'CRM.Leads.Reassign'));
  return v_result;
end;
$$;

create or replace function public._multideck_crm_apply_lead_transfer(
  p_lead_id uuid,
  p_expected_owner_id uuid,
  p_target_user_id uuid,
  p_actor_user_id uuid,
  p_company_id uuid,
  p_reason text,
  p_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_lead public."CRM_Leads"%rowtype; v_activity_type text; v_now timestamptz := now();
begin
  perform pg_advisory_xact_lock(hashtextextended(p_lead_id::text, 7231));
  select * into v_lead from public."CRM_Leads" where "CRMLead_ID" = p_lead_id and not "CRMLead_IsDeleted" for update;
  if not found then raise exception 'This lead no longer exists.' using errcode = 'P0002'; end if;
  if v_lead."CRMLead_OwnerUserID" is distinct from p_expected_owner_id then
    raise exception 'The lead owner changed while this request was open. Refresh and try again.' using errcode = '40001';
  end if;
  if not exists (select 1 from public."cmp_Users" where "User_ID" = p_target_user_id and "Company_ID" = p_company_id and "Auth_User_ID" is not null) then
    raise exception 'Choose an active user in this workspace.' using errcode = '22023';
  end if;
  if p_target_user_id = p_expected_owner_id then raise exception 'This user already owns the lead.' using errcode = '22023'; end if;

  update public."CRM_LeadAssignments" set "CRMLeadAssign_IsActive" = false, "CRMLeadAssign_EndedAt" = v_now
  where "CRMLeadAssign_LeadID" = p_lead_id and "CRMLeadAssign_IsActive";
  insert into public."CRM_LeadAssignments" ("CRMLeadAssign_LeadID", "CRMLeadAssign_AssignedUserID", "CRMLeadAssign_AssignmentRole", "CRMLeadAssign_AssignedAt", "CRMLeadAssign_AssignedBy")
  values (p_lead_id, p_target_user_id, 'owner', v_now, p_actor_user_id);
  update public."CRM_Leads" set "CRMLead_OwnerUserID" = p_target_user_id, "CRMLead_UpdatedAt" = v_now, "CRMLead_UpdatedBy" = p_actor_user_id
  where "CRMLead_ID" = p_lead_id;
  update public."CRM_Opportunities" opportunity
  set "CRMOppty_OwnerUserID" = p_target_user_id, "CRMOppty_UpdatedAt" = v_now, "CRMOppty_UpdatedBy" = p_actor_user_id
  from public."sys_CRMOpportunityStatuses" status
  where opportunity."CRMOppty_SourceLeadID" = p_lead_id and opportunity."CRMOppty_StatusCode" = status."CRMOpptyStatus_Code"
    and status."CRMOpptyStatus_IsOpen" and not opportunity."CRMOppty_IsDeleted";

  update public."CRM_LeadTransferRequests"
  set "CRMLeadTransfer_Status" = case when "CRMLeadTransfer_ID" = p_request_id then 'approved' else 'superseded' end,
      "CRMLeadTransfer_DecisionReason" = case when "CRMLeadTransfer_ID" = p_request_id then nullif(btrim(p_reason), '') else 'Ownership changed before this request was decided.' end,
      "CRMLeadTransfer_DecidedAt" = v_now, "CRMLeadTransfer_DecidedBy" = p_actor_user_id, "CRMLeadTransfer_UpdatedAt" = v_now
  where "CRMLeadTransfer_LeadID" = p_lead_id and "CRMLeadTransfer_Status" = 'pending';

  select "CRMActType_Code" into v_activity_type from public."sys_CRMActivityTypes" where "CRMActType_IsActive" order by "CRMActType_SortOrder" limit 1;
  if v_activity_type is not null then
    insert into public."CRM_Activities" ("CRMActivity_ActivityTypeCode", "CRMActivity_LeadID", "CRMActivity_Subject", "CRMActivity_Summary", "CRMActivity_OwnerUserID", "CRMActivity_MetadataJSON", "CRMActivity_CreatedBy", "CRMActivity_UpdatedBy")
    values (v_activity_type, p_lead_id, 'Lead ownership changed', nullif(btrim(p_reason), ''), p_target_user_id,
      jsonb_build_object('event', 'lead_ownership_changed', 'fromUserId', p_expected_owner_id, 'toUserId', p_target_user_id, 'requestId', p_request_id), p_actor_user_id, p_actor_user_id);
  end if;
  insert into public."Comm_Notifications" ("CommNotif_UserID", "CommNotif_Title", "CommNotif_Body", "CommNotif_TargetTable", "CommNotif_TargetID", "CommNotif_LinkTypeCode", "CommNotif_MetadataJSON", "CommNotif_CreatedBy")
  select recipient_id, 'CRM lead ownership changed', coalesce(nullif(btrim(p_reason), ''), 'The lead owner was updated.'), 'CRM_Leads', p_lead_id, null,
    jsonb_build_object('event', 'lead_ownership_changed', 'fromUserId', p_expected_owner_id, 'toUserId', p_target_user_id), p_actor_user_id
  from (values (p_expected_owner_id), (p_target_user_id)) recipients(recipient_id)
  where recipient_id is not null;
  return public._multideck_crm_lead_json(p_lead_id) || jsonb_build_object('pendingTransfer', null);
end;
$$;

create or replace function public.multideck_crm_request_lead_transfer(p_lead_id uuid, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare v_context record; v_lead public."CRM_Leads"%rowtype; v_id uuid;
begin
  select * into v_context from public._multideck_crm_context();
  perform pg_advisory_xact_lock(hashtextextended(p_lead_id::text, 7231));
  select * into v_lead from public."CRM_Leads" where "CRMLead_ID" = p_lead_id and not "CRMLead_IsDeleted" for update;
  if not found then raise exception 'This lead no longer exists.' using errcode = 'P0002'; end if;
  if v_lead."CRMLead_OwnerUserID" = v_context.user_id then raise exception 'You already own this lead.' using errcode = '22023'; end if;
  if v_lead."CRMLead_OwnerUserID" is null then raise exception 'This lead has no current owner. Ask a CRM manager to assign it.' using errcode = '22023'; end if;
  if not exists (select 1 from public."cmp_Users" where "User_ID" = v_lead."CRMLead_OwnerUserID" and "Company_ID" = v_context.company_id) then
    raise exception 'The current owner is not in this workspace.' using errcode = '22023';
  end if;
  insert into public."CRM_LeadTransferRequests" ("Company_ID", "CRMLeadTransfer_LeadID", "CRMLeadTransfer_RequesterUserID", "CRMLeadTransfer_FromUserID", "CRMLeadTransfer_ToUserID", "CRMLeadTransfer_RequestNote")
  values (v_context.company_id, p_lead_id, v_context.user_id, v_lead."CRMLead_OwnerUserID", v_context.user_id, nullif(btrim(p_note), ''))
  returning "CRMLeadTransfer_ID" into v_id;
  insert into public."Comm_Notifications" ("CommNotif_UserID", "CommNotif_Title", "CommNotif_Body", "CommNotif_TargetTable", "CommNotif_TargetID", "CommNotif_LinkTypeCode", "CommNotif_MetadataJSON", "CommNotif_CreatedBy")
  values (v_lead."CRMLead_OwnerUserID", 'Lead ownership requested', coalesce(nullif(btrim(p_note), ''), 'A colleague asked to take ownership of this CRM lead.'), 'CRM_LeadTransferRequests', v_id, null, jsonb_build_object('event', 'lead_transfer_requested', 'leadId', p_lead_id), v_context.user_id);
  return public._multideck_crm_transfer_request_json(v_id);
exception when unique_violation then
  raise exception 'You already have a pending ownership request for this lead.' using errcode = '23505';
end;
$$;

create or replace function public.multideck_crm_decide_lead_transfer(p_request_id uuid, p_decision text, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare v_context record; v_request public."CRM_LeadTransferRequests"%rowtype; v_decision text := lower(btrim(coalesce(p_decision, ''))); v_result jsonb;
begin
  select * into v_context from public._multideck_crm_context();
  select * into v_request from public."CRM_LeadTransferRequests" where "CRMLeadTransfer_ID" = p_request_id for update;
  if not found or v_request."Company_ID" <> v_context.company_id then raise exception 'This transfer request was not found.' using errcode = 'P0002'; end if;
  if v_request."CRMLeadTransfer_Status" <> 'pending' then raise exception 'This transfer request has already been decided.' using errcode = '22023'; end if;
  if v_request."CRMLeadTransfer_FromUserID" <> v_context.user_id and not public._multideck_crm_has_permission(v_context.user_id, 'CRM.Leads.Reassign') then
    raise exception 'Only the current owner can decide this request.' using errcode = '42501';
  end if;
  if v_decision = 'approved' then
    return public._multideck_crm_apply_lead_transfer(v_request."CRMLeadTransfer_LeadID", v_request."CRMLeadTransfer_FromUserID", v_request."CRMLeadTransfer_ToUserID", v_context.user_id, v_context.company_id, p_reason, p_request_id);
  elsif v_decision = 'declined' then
    update public."CRM_LeadTransferRequests" set "CRMLeadTransfer_Status" = 'declined', "CRMLeadTransfer_DecisionReason" = nullif(btrim(p_reason), ''),
      "CRMLeadTransfer_DecidedAt" = now(), "CRMLeadTransfer_DecidedBy" = v_context.user_id, "CRMLeadTransfer_UpdatedAt" = now()
    where "CRMLeadTransfer_ID" = p_request_id;
    insert into public."Comm_Notifications" ("CommNotif_UserID", "CommNotif_Title", "CommNotif_Body", "CommNotif_TargetTable", "CommNotif_TargetID", "CommNotif_LinkTypeCode", "CommNotif_MetadataJSON", "CommNotif_CreatedBy")
    values (v_request."CRMLeadTransfer_RequesterUserID", 'Lead ownership request declined', coalesce(nullif(btrim(p_reason), ''), 'The current owner declined the request.'), 'CRM_LeadTransferRequests', p_request_id, null, jsonb_build_object('event', 'lead_transfer_declined'), v_context.user_id);
    return public._multideck_crm_transfer_request_json(p_request_id);
  end if;
  raise exception 'Choose approved or declined.' using errcode = '22023';
end;
$$;

create or replace function public.multideck_crm_cancel_lead_transfer(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare v_context record; v_request public."CRM_LeadTransferRequests"%rowtype;
begin
  select * into v_context from public._multideck_crm_context();
  select * into v_request from public."CRM_LeadTransferRequests" where "CRMLeadTransfer_ID" = p_request_id for update;
  if not found or v_request."Company_ID" <> v_context.company_id then raise exception 'This transfer request was not found.' using errcode = 'P0002'; end if;
  if v_request."CRMLeadTransfer_RequesterUserID" <> v_context.user_id then raise exception 'Only the requester can cancel this request.' using errcode = '42501'; end if;
  if v_request."CRMLeadTransfer_Status" <> 'pending' then raise exception 'Only a pending request can be cancelled.' using errcode = '22023'; end if;
  update public."CRM_LeadTransferRequests" set "CRMLeadTransfer_Status" = 'cancelled', "CRMLeadTransfer_CancelledAt" = now(), "CRMLeadTransfer_UpdatedAt" = now()
  where "CRMLeadTransfer_ID" = p_request_id;
  return public._multideck_crm_transfer_request_json(p_request_id);
end;
$$;

create or replace function public.multideck_crm_transfer_lead(p_lead_id uuid, p_target_user_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare v_context record; v_lead public."CRM_Leads"%rowtype; v_is_override boolean;
begin
  select * into v_context from public._multideck_crm_context();
  select * into v_lead from public."CRM_Leads" where "CRMLead_ID" = p_lead_id and not "CRMLead_IsDeleted";
  if not found then raise exception 'This lead no longer exists.' using errcode = 'P0002'; end if;
  if not exists (
    select 1 from public."cmp_Users" workspace_owner
    where workspace_owner."User_ID" = v_lead."CRMLead_OwnerUserID" and workspace_owner."Company_ID" = v_context.company_id
  ) then raise exception 'This lead is outside your CRM workspace.' using errcode = '42501'; end if;
  v_is_override := v_lead."CRMLead_OwnerUserID" is distinct from v_context.user_id;
  if v_is_override and not public._multideck_crm_has_permission(v_context.user_id, 'CRM.Leads.Reassign') then
    raise exception 'Only the current owner or an authorised CRM manager can transfer this lead.' using errcode = '42501';
  end if;
  if v_is_override and nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'Give a reason for overriding lead ownership.' using errcode = '22023';
  end if;
  return public._multideck_crm_apply_lead_transfer(p_lead_id, v_lead."CRMLead_OwnerUserID", p_target_user_id, v_context.user_id, v_context.company_id, p_reason, null);
end;
$$;

create or replace function public.multideck_crm_win_deal(p_deal_id uuid, p_pipeline_stage_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_context record; v_deal public."CRM_Opportunities"%rowtype; v_stage public."CRM_PipelineStages"%rowtype;
  v_won_stage text; v_won_status text; v_customer_status text; v_customer_type uuid; v_account_id uuid; v_activity_type text; v_now timestamptz := now();
begin
  select * into v_context from public._multideck_crm_context();
  perform pg_advisory_xact_lock(hashtextextended(p_deal_id::text, 7299));
  select * into v_deal from public."CRM_Opportunities" where "CRMOppty_ID" = p_deal_id and not "CRMOppty_IsDeleted" for update;
  if not found then raise exception 'This deal no longer exists.' using errcode = 'P0002'; end if;
  if not exists (select 1 from public."CRM_Pipelines" where "CRMPipeline_ID" = v_deal."CRMOppty_PipelineID" and "Company_ID" = v_context.company_id and not "Is_Deleted") then
    raise exception 'This deal is outside your CRM workspace.' using errcode = '42501';
  end if;
  if v_deal."CRMOppty_OwnerUserID" is distinct from v_context.user_id and not public._multideck_crm_has_permission(v_context.user_id, 'CRM.Deals.Win') then
    raise exception 'You do not have permission to mark this deal won.' using errcode = '42501';
  end if;
  select * into v_stage from public."CRM_PipelineStages" where "CRMPipelineStage_ID" = p_pipeline_stage_id
    and "CRMPipeline_ID" = v_deal."CRMOppty_PipelineID" and "Company_ID" = v_context.company_id and not "Is_Deleted";
  if not found or not v_stage."CRMPipelineStage_IsConversion" then raise exception 'Choose the configured customer-conversion stage.' using errcode = '22023'; end if;
  if v_deal."CRMOppty_WonAt" is not null then
    return public._multideck_crm_deal_json(p_deal_id, v_context.company_id) || jsonb_build_object('isWon', true, 'wonAt', v_deal."CRMOppty_WonAt", 'isCustomer', true, 'wasAlreadyConverted', true);
  end if;
  select "CRMStage_Code" into v_won_stage from public."sys_CRMOpportunityStages" where "CRMStage_IsActive" and "CRMStage_IsWon" order by "CRMStage_SortOrder" limit 1;
  select "CRMOpptyStatus_Code" into v_won_status from public."sys_CRMOpportunityStatuses" where "CRMOpptyStatus_IsActive" and not "CRMOpptyStatus_IsOpen"
  order by (lower("CRMOpptyStatus_Code") like '%won%' or lower("CRMOpptyStatus_Name") like '%won%') desc, "CRMOpptyStatus_SortOrder" limit 1;
  select "CRMRelStatus_Code" into v_customer_status from public."sys_CRMRelationshipStatuses" where "CRMRelStatus_IsActive" and "CRMRelStatus_IsCustomer" order by "CRMRelStatus_SortOrder" limit 1;
  select "OrgType_ID" into v_customer_type from public."Org_Types" where lower("OrgType_Name") = 'customer' order by "OrgType_Order" nulls last limit 1;
  if v_won_stage is null or v_won_status is null or v_customer_status is null or v_customer_type is null then
    raise exception 'Customer conversion lookups are incomplete for this workspace.' using errcode = '55000';
  end if;
  insert into public."CRM_AccountProfiles" ("CRMAccount_OrgID", "CRMAccount_RelationshipStatusCode", "CRMAccount_OwnerUserID", "CRMAccount_CreatedBy", "CRMAccount_UpdatedBy")
  values (v_deal."CRMOppty_OrgID", v_customer_status, v_deal."CRMOppty_OwnerUserID", v_context.user_id, v_context.user_id)
  on conflict ("CRMAccount_OrgID") do update set "CRMAccount_RelationshipStatusCode" = excluded."CRMAccount_RelationshipStatusCode",
    "CRMAccount_OwnerUserID" = coalesce(public."CRM_AccountProfiles"."CRMAccount_OwnerUserID", excluded."CRMAccount_OwnerUserID"),
    "CRMAccount_UpdatedAt" = v_now, "CRMAccount_UpdatedBy" = v_context.user_id, "CRMAccount_IsDeleted" = false
  returning "CRMAccount_ID" into v_account_id;
  insert into public."Org_Master_Type" ("Org_ID", "OrgType_ID")
  select v_deal."CRMOppty_OrgID", v_customer_type
  where not exists (select 1 from public."Org_Master_Type" where "Org_ID" = v_deal."CRMOppty_OrgID" and "OrgType_ID" = v_customer_type);
  update public."Org_Master" set "Org_CRMRelationshipStatusCode" = v_customer_status, "Org_CRMIsLead" = false,
    "Org_CRMIsPotentialCustomer" = false, "Org_CRMUpdatedAt" = v_now where "Org_id" = v_deal."CRMOppty_OrgID";
  update public."CRM_Opportunities" set "CRMOppty_AccountID" = v_account_id, "CRMOppty_PipelineStageID" = p_pipeline_stage_id,
    "CRMOppty_StageCode" = v_won_stage, "CRMOppty_StatusCode" = v_won_status, "CRMOppty_ProbabilityPct" = 100,
    "CRMOppty_WonAt" = v_now, "CRMOppty_LostAt" = null, "CRMOppty_UpdatedAt" = v_now, "CRMOppty_UpdatedBy" = v_context.user_id,
    "CRMOppty_MetadataJSON" = coalesce("CRMOppty_MetadataJSON", '{}'::jsonb) || jsonb_build_object('customerConvertedAt', v_now, 'customerConvertedBy', v_context.user_id)
  where "CRMOppty_ID" = p_deal_id;
  select "CRMActType_Code" into v_activity_type from public."sys_CRMActivityTypes" where "CRMActType_IsActive" order by "CRMActType_SortOrder" limit 1;
  if v_activity_type is not null then
    insert into public."CRM_Activities" ("CRMActivity_ActivityTypeCode", "CRMActivity_AccountID", "CRMActivity_LeadID", "CRMActivity_OpportunityID", "CRMActivity_Subject", "CRMActivity_Summary", "CRMActivity_OwnerUserID", "CRMActivity_MetadataJSON", "CRMActivity_CreatedBy", "CRMActivity_UpdatedBy")
    values (v_activity_type, v_account_id, v_deal."CRMOppty_SourceLeadID", p_deal_id, 'Deal won — customer created', nullif(btrim(p_reason), ''),
      v_deal."CRMOppty_OwnerUserID", jsonb_build_object('event', 'customer_converted', 'organisationId', v_deal."CRMOppty_OrgID"), v_context.user_id, v_context.user_id);
  end if;
  return public._multideck_crm_deal_json(p_deal_id, v_context.company_id) || jsonb_build_object('isWon', true, 'wonAt', v_now, 'isCustomer', true, 'customerOrgId', v_deal."CRMOppty_OrgID", 'wasAlreadyConverted', false);
end;
$$;

create or replace function public._multideck_crm_lead_transfer_state(p_lead_id uuid)
returns jsonb language sql stable security definer set search_path = pg_catalog, public as $$
  select jsonb_build_object('pendingTransfer', (
    select public._multideck_crm_transfer_request_json(request."CRMLeadTransfer_ID")
    from public."CRM_LeadTransferRequests" request
    where request."CRMLeadTransfer_LeadID" = p_lead_id and request."CRMLeadTransfer_Status" = 'pending'
    order by request."CRMLeadTransfer_RequestedAt" desc limit 1
  ));
$$;

create or replace function public.multideck_crm_list_leads_essential(p_search text default null)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public, auth as $$
declare v_rows jsonb;
begin
  v_rows := public.multideck_crm_list_leads(p_search);
  return coalesce((select jsonb_agg(item || public._multideck_crm_lead_transfer_state((item->>'id')::uuid)) from jsonb_array_elements(v_rows) item), '[]'::jsonb);
end;
$$;

create or replace function public.multideck_crm_get_lead_essential(p_lead_id uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public, auth as $$
begin
  return public.multideck_crm_get_lead(p_lead_id) || public._multideck_crm_lead_transfer_state(p_lead_id);
end;
$$;

create or replace function public._multideck_crm_deal_conversion_state(p_deal_id uuid)
returns jsonb language sql stable security definer set search_path = pg_catalog, public as $$
  select jsonb_build_object(
    'isWon', opportunity."CRMOppty_WonAt" is not null,
    'wonAt', opportunity."CRMOppty_WonAt",
    'customerOrgId', case when customer_type."Org_ID" is not null then opportunity."CRMOppty_OrgID" else null end,
    'isCustomer', customer_type."Org_ID" is not null
  )
  from public."CRM_Opportunities" opportunity
  left join lateral (
    select link."Org_ID" from public."Org_Master_Type" link join public."Org_Types" type on type."OrgType_ID" = link."OrgType_ID"
    where link."Org_ID" = opportunity."CRMOppty_OrgID" and lower(type."OrgType_Name") = 'customer' limit 1
  ) customer_type on true
  where opportunity."CRMOppty_ID" = p_deal_id;
$$;

create or replace function public.multideck_crm_list_deals_essential()
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public, auth as $$
declare v_rows jsonb;
begin
  v_rows := public.multideck_crm_list_deals();
  return coalesce((select jsonb_agg(item || public._multideck_crm_deal_conversion_state((item->>'id')::uuid)) from jsonb_array_elements(v_rows) item), '[]'::jsonb);
end;
$$;

revoke all on function public._multideck_crm_has_permission(uuid, text) from public, anon, authenticated;
revoke all on function public._multideck_crm_transfer_request_json(uuid) from public, anon, authenticated;
revoke all on function public._multideck_crm_apply_lead_transfer(uuid, uuid, uuid, uuid, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public._multideck_crm_lead_transfer_state(uuid) from public, anon, authenticated;
revoke all on function public._multideck_crm_deal_conversion_state(uuid) from public, anon, authenticated;
revoke all on function public.multideck_crm_get_dashboard(integer, text) from public, anon;
revoke all on function public.multideck_crm_list_transfer_users() from public, anon;
revoke all on function public.multideck_crm_list_transfer_requests(uuid) from public, anon;
revoke all on function public.multideck_crm_request_lead_transfer(uuid, text) from public, anon;
revoke all on function public.multideck_crm_decide_lead_transfer(uuid, text, text) from public, anon;
revoke all on function public.multideck_crm_cancel_lead_transfer(uuid) from public, anon;
revoke all on function public.multideck_crm_transfer_lead(uuid, uuid, text) from public, anon;
revoke all on function public.multideck_crm_win_deal(uuid, uuid, text) from public, anon;
revoke all on function public.multideck_crm_list_leads_essential(text) from public, anon;
revoke all on function public.multideck_crm_get_lead_essential(uuid) from public, anon;
revoke all on function public.multideck_crm_list_deals_essential() from public, anon;
grant execute on function public.multideck_crm_get_dashboard(integer, text) to authenticated;
grant execute on function public.multideck_crm_list_transfer_users() to authenticated;
grant execute on function public.multideck_crm_list_transfer_requests(uuid) to authenticated;
grant execute on function public.multideck_crm_request_lead_transfer(uuid, text) to authenticated;
grant execute on function public.multideck_crm_decide_lead_transfer(uuid, text, text) to authenticated;
grant execute on function public.multideck_crm_cancel_lead_transfer(uuid) to authenticated;
grant execute on function public.multideck_crm_transfer_lead(uuid, uuid, text) to authenticated;
grant execute on function public.multideck_crm_win_deal(uuid, uuid, text) to authenticated;
grant execute on function public.multideck_crm_list_leads_essential(text) to authenticated;
grant execute on function public.multideck_crm_get_lead_essential(uuid) to authenticated;
grant execute on function public.multideck_crm_list_deals_essential() to authenticated;

commit;
