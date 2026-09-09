-- Permission-aware activity and email roll-up for CRM register temperature.
-- The result is deliberately derived at read time: no opaque score is stored,
-- and every pill can be explained from recent activity and email counts.

begin;

create or replace function public.multideck_crm_engagement_signals(
  p_account_ids uuid[] default '{}'::uuid[],
  p_lead_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_context record;
  v_email_allowed boolean := false;
  v_result jsonb;
begin
  select * into v_context from public._multideck_crm_context();

  if cardinality(coalesce(p_account_ids, '{}'::uuid[])) > 0
     and not public._multideck_crm_has_permission(v_context.user_id, 'Customers.Read') then
    raise exception 'You do not have permission to view CRM accounts.' using errcode = '42501';
  end if;

  if cardinality(coalesce(p_lead_ids, '{}'::uuid[])) > 0
     and not public._multideck_crm_has_permission(v_context.user_id, 'CRM.Read') then
    raise exception 'You do not have permission to view CRM leads.' using errcode = '42501';
  end if;

  v_email_allowed := public._multideck_crm_has_permission(v_context.user_id, 'Email.Read');

  with account_records as materialized (
    select requested.id, profile."CRMAccount_ID" as profile_id, profile."CRMAccount_LastContactAt" as recorded_last_at
    from unnest(coalesce(p_account_ids, '{}'::uuid[])) requested(id)
    join public.multideck_crm_accessible_account_ids(v_context.company_id) accessible
      on accessible.account_id = requested.id
    left join public."CRM_AccountProfiles" profile
      on profile."CRMAccount_OrgID" = requested.id
     and not profile."CRMAccount_IsDeleted"
  ), lead_records as materialized (
    select
      lead."CRMLead_ID" as id,
      lead."CRMLead_OrgID" as org_id,
      lower(nullif(btrim(lead."CRMLead_Email"), '')) as email,
      lead."CRMLead_LastInteractionAt" as recorded_last_at
    from public."CRM_Leads" lead
    where lead."CRMLead_ID" = any(coalesce(p_lead_ids, '{}'::uuid[]))
      and public._multideck_crm_lead_is_reachable(lead."CRMLead_ID", v_context.company_id)
      and lower(coalesce(lead."CRMLead_MetadataJSON" ->> 'isDemo', 'false')) <> 'true'
  ), account_activity as (
    select
      account.id,
      max(activity."CRMActivity_ActivityAt") as last_at,
      count(*) filter (where activity."CRMActivity_ActivityAt" >= now() - interval '30 days')::integer as count_30d
    from account_records account
    left join public."CRM_Activities" activity
      on activity."CRMActivity_AccountID" = account.profile_id
     and not activity."CRMActivity_IsDeleted"
    group by account.id
  ), lead_activity as (
    select
      lead.id,
      max(activity."CRMActivity_ActivityAt") as last_at,
      count(*) filter (where activity."CRMActivity_ActivityAt" >= now() - interval '30 days')::integer as count_30d
    from lead_records lead
    left join public."CRM_Activities" activity
      on activity."CRMActivity_LeadID" = lead.id
     and not activity."CRMActivity_IsDeleted"
    group by lead.id
  ), account_threads as materialized (
    select distinct account.id as record_id, thread."CommThread_ID" as thread_id
    from account_records account
    join public."Comm_Threads" thread
      on v_email_allowed
     and not thread."CommThread_IsDeleted"
     and (
       thread."CommThread_CustomerOrgID" = account.id
       or exists (
         select 1
         from public."Comm_ThreadParticipants" participant
         left join public."Comm_Identities" identity
           on identity."CommIdentity_ID" = participant."CommThreadPart_IdentityID"
          and not identity."CommIdentity_IsDeleted"
         where participant."CommThreadPart_ThreadID" = thread."CommThread_ID"
           and (participant."CommThreadPart_OrgID" = account.id or identity."CommIdentity_OrgID" = account.id)
       )
     )
  ), lead_threads as materialized (
    select distinct lead.id as record_id, thread."CommThread_ID" as thread_id
    from lead_records lead
    join public."Comm_Threads" thread
      on v_email_allowed
     and not thread."CommThread_IsDeleted"
     and (
       thread."CommThread_PrimaryTargetID" = lead.id
       or (lead.org_id is not null and thread."CommThread_CustomerOrgID" = lead.org_id)
       or exists (
         select 1
         from public."Comm_ThreadParticipants" participant
         left join public."Comm_Identities" identity
           on identity."CommIdentity_ID" = participant."CommThreadPart_IdentityID"
          and not identity."CommIdentity_IsDeleted"
         where participant."CommThreadPart_ThreadID" = thread."CommThread_ID"
           and (
             (lead.org_id is not null and (participant."CommThreadPart_OrgID" = lead.org_id or identity."CommIdentity_OrgID" = lead.org_id))
             or (lead.email is not null and lower(coalesce(identity."CommIdentity_NormalizedAddress", participant."CommThreadPart_AddressSnapshot")) = lead.email)
           )
       )
     )
  ), account_email as (
    select
      link.record_id as id,
      max(coalesce(message."CommMessage_MessageDate", message."CommMessage_ReceivedAt", message."CommMessage_SentAt", message."CommMessage_CreatedAt")) as last_at,
      count(*) filter (
        where coalesce(message."CommMessage_MessageDate", message."CommMessage_ReceivedAt", message."CommMessage_SentAt", message."CommMessage_CreatedAt") >= now() - interval '30 days'
      )::integer as count_30d,
      count(*) filter (
        where message."CommMessage_DirectionCode" = 'inbound'
          and coalesce(message."CommMessage_MessageDate", message."CommMessage_ReceivedAt", message."CommMessage_SentAt", message."CommMessage_CreatedAt") >= now() - interval '30 days'
      )::integer as inbound_count_30d
    from account_threads link
    join public."Comm_Messages" message
      on message."CommMessage_ThreadID" = link.thread_id
     and not message."CommMessage_IsDeleted"
    group by link.record_id
  ), lead_email as (
    select
      link.record_id as id,
      max(coalesce(message."CommMessage_MessageDate", message."CommMessage_ReceivedAt", message."CommMessage_SentAt", message."CommMessage_CreatedAt")) as last_at,
      count(*) filter (
        where coalesce(message."CommMessage_MessageDate", message."CommMessage_ReceivedAt", message."CommMessage_SentAt", message."CommMessage_CreatedAt") >= now() - interval '30 days'
      )::integer as count_30d,
      count(*) filter (
        where message."CommMessage_DirectionCode" = 'inbound'
          and coalesce(message."CommMessage_MessageDate", message."CommMessage_ReceivedAt", message."CommMessage_SentAt", message."CommMessage_CreatedAt") >= now() - interval '30 days'
      )::integer as inbound_count_30d
    from lead_threads link
    join public."Comm_Messages" message
      on message."CommMessage_ThreadID" = link.thread_id
     and not message."CommMessage_IsDeleted"
    group by link.record_id
  ), raw_signals as (
    select
      'account'::text as record_type,
      account.id as record_id,
      greatest(account.recorded_last_at, activity.last_at, email.last_at) as last_engagement_at,
      coalesce(activity.count_30d, 0) as activity_count_30d,
      coalesce(email.count_30d, 0) as email_count_30d,
      coalesce(email.inbound_count_30d, 0) as inbound_email_count_30d
    from account_records account
    left join account_activity activity on activity.id = account.id
    left join account_email email on email.id = account.id

    union all

    select
      'lead'::text,
      lead.id,
      greatest(lead.recorded_last_at, activity.last_at, email.last_at),
      coalesce(activity.count_30d, 0),
      coalesce(email.count_30d, 0),
      coalesce(email.inbound_count_30d, 0)
    from lead_records lead
    left join lead_activity activity on activity.id = lead.id
    left join lead_email email on email.id = lead.id
  ), scored as (
    select
      signal.*,
      least(100,
        case
          when signal.last_engagement_at >= now() - interval '7 days' then 45
          when signal.last_engagement_at >= now() - interval '30 days' then 25
          when signal.last_engagement_at >= now() - interval '90 days' then 10
          else 0
        end
        + least(signal.activity_count_30d * 10, 30)
        + least(signal.email_count_30d * 5, 20)
        + least(signal.inbound_email_count_30d * 5, 10)
      )::integer as score
    from raw_signals signal
  ), labelled as (
    select
      scored.*,
      case when scored.score >= 70 then 'Hot' when scored.score >= 30 then 'Warm' else 'Cold' end as temperature
    from scored
  )
  select jsonb_build_object(
    'emailAvailable', v_email_allowed,
    'accounts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'recordId', item.record_id,
        'temperature', item.temperature,
        'score', item.score,
        'lastEngagementAt', item.last_engagement_at,
        'activityCount30d', item.activity_count_30d,
        'emailCount30d', item.email_count_30d,
        'inboundEmailCount30d', item.inbound_email_count_30d
      ) order by item.record_id)
      from labelled item where item.record_type = 'account'
    ), '[]'::jsonb),
    'leads', coalesce((
      select jsonb_agg(jsonb_build_object(
        'recordId', item.record_id,
        'temperature', item.temperature,
        'score', item.score,
        'lastEngagementAt', item.last_engagement_at,
        'activityCount30d', item.activity_count_30d,
        'emailCount30d', item.email_count_30d,
        'inboundEmailCount30d', item.inbound_email_count_30d
      ) order by item.record_id)
      from labelled item where item.record_type = 'lead'
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.multideck_crm_engagement_signals(uuid[], uuid[]) from public, anon;
grant execute on function public.multideck_crm_engagement_signals(uuid[], uuid[]) to authenticated, service_role;

comment on function public.multideck_crm_engagement_signals(uuid[], uuid[]) is
  'Permission-aware CRM register roll-up of recent CRM activity and connected email exchanges.';

-- Dexter exception: this is a derived presentation of records already exposed
-- through Dexter's permission-scoped customers, CRM and email domains. It adds
-- no new source records, write action or event semantics, so no new watch
-- adapter or recurring model evaluation is required.

commit;
