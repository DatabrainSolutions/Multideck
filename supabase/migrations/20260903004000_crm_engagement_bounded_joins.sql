-- Evidence: the 20-account engagement plan performed 1.69m correlated checks
-- and took 2.1s. Independent joins reuse existing indexes; no new index is needed.
-- Preserve scores and de-duplicate linked threads before counting messages.
-- Apply the same mailbox read boundary as CRM follow-up opportunities.
CREATE OR REPLACE FUNCTION public.multideck_crm_engagement_signals(p_account_ids uuid[] DEFAULT '{}'::uuid[], p_lead_ids uuid[] DEFAULT '{}'::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
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

  with accessible_mailboxes as materialized (
    select mailbox."CommMailbox_ID" as id
    from public."Comm_Mailboxes" mailbox
    where v_email_allowed
      and not mailbox."CommMailbox_IsDeleted"
      and mailbox."CommMailbox_UserID" = v_context.user_id
      and mailbox."CommMailbox_TypeCode" = 'personal'
    union
    select access."CommMailboxAccess_MailboxID"
    from public."Comm_MailboxAccess" access
    join public."Comm_Mailboxes" mailbox
      on mailbox."CommMailbox_ID" = access."CommMailboxAccess_MailboxID"
     and not mailbox."CommMailbox_IsDeleted"
    where v_email_allowed
      and access."CommMailboxAccess_UserID" = v_context.user_id
      and access."CommMailboxAccess_CanRead"
      and access."CommMailboxAccess_RevokedAt" is null
      and (access."CommMailboxAccess_ExpiresAt" is null or access."CommMailboxAccess_ExpiresAt" > now())
  ), account_records as materialized (
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
    -- Separate associations let Postgres join once per relation instead of
    -- testing every requested account against every thread.
    select account.id as record_id, thread."CommThread_ID" as thread_id
    from account_records account
    join public."Comm_Threads" thread on thread."CommThread_CustomerOrgID" = account.id
    where v_email_allowed and not thread."CommThread_IsDeleted"
    union
    select account.id, thread."CommThread_ID"
    from account_records account
    join public."Comm_ThreadParticipants" participant on participant."CommThreadPart_OrgID" = account.id
    join public."Comm_Threads" thread on thread."CommThread_ID" = participant."CommThreadPart_ThreadID"
    where v_email_allowed and not thread."CommThread_IsDeleted"
    union
    select account.id, thread."CommThread_ID"
    from account_records account
    join public."Comm_Identities" identity on identity."CommIdentity_OrgID" = account.id and not identity."CommIdentity_IsDeleted"
    join public."Comm_ThreadParticipants" participant on participant."CommThreadPart_IdentityID" = identity."CommIdentity_ID"
    join public."Comm_Threads" thread on thread."CommThread_ID" = participant."CommThreadPart_ThreadID"
    where v_email_allowed and not thread."CommThread_IsDeleted"
  ), lead_threads as materialized (
    select lead.id as record_id, thread."CommThread_ID" as thread_id
    from lead_records lead
    join public."Comm_Threads" thread on thread."CommThread_PrimaryTargetID" = lead.id
    where v_email_allowed and not thread."CommThread_IsDeleted"
    union
    select lead.id, thread."CommThread_ID"
    from lead_records lead
    join public."Comm_Threads" thread on thread."CommThread_CustomerOrgID" = lead.org_id
    where v_email_allowed and not thread."CommThread_IsDeleted"
    union
    select lead.id, thread."CommThread_ID"
    from lead_records lead
    join public."Comm_ThreadParticipants" participant on participant."CommThreadPart_OrgID" = lead.org_id
    join public."Comm_Threads" thread on thread."CommThread_ID" = participant."CommThreadPart_ThreadID"
    where v_email_allowed and not thread."CommThread_IsDeleted"
    union
    select lead.id, thread."CommThread_ID"
    from lead_records lead
    join public."Comm_Identities" identity on identity."CommIdentity_OrgID" = lead.org_id and not identity."CommIdentity_IsDeleted"
    join public."Comm_ThreadParticipants" participant on participant."CommThreadPart_IdentityID" = identity."CommIdentity_ID"
    join public."Comm_Threads" thread on thread."CommThread_ID" = participant."CommThreadPart_ThreadID"
    where v_email_allowed and not thread."CommThread_IsDeleted"
    union
    select lead.id, thread."CommThread_ID"
    from lead_records lead
    join public."Comm_Identities" identity on lower(identity."CommIdentity_NormalizedAddress") = lead.email and not identity."CommIdentity_IsDeleted"
    join public."Comm_ThreadParticipants" participant on participant."CommThreadPart_IdentityID" = identity."CommIdentity_ID"
    join public."Comm_Threads" thread on thread."CommThread_ID" = participant."CommThreadPart_ThreadID"
    where v_email_allowed and not thread."CommThread_IsDeleted"
    union
    select lead.id, thread."CommThread_ID"
    from lead_records lead
    join public."Comm_ThreadParticipants" participant on lower(participant."CommThreadPart_AddressSnapshot") = lead.email
    left join public."Comm_Identities" identity on identity."CommIdentity_ID" = participant."CommThreadPart_IdentityID" and not identity."CommIdentity_IsDeleted"
    join public."Comm_Threads" thread on thread."CommThread_ID" = participant."CommThreadPart_ThreadID"
    where v_email_allowed and not thread."CommThread_IsDeleted"
      and identity."CommIdentity_NormalizedAddress" is null
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
     and message."CommMessage_MailboxID" in (select id from accessible_mailboxes)
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
     and message."CommMessage_MailboxID" in (select id from accessible_mailboxes)
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
$function$
;

