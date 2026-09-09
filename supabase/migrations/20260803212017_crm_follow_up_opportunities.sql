-- Build a deterministic CRM follow-up queue from the signed-in operator's
-- mailbox activity and assigned CRM records. Ordinary queue evaluation does
-- not call an LLM: it follows explicit reply and follow-up timing rules.

begin;

create index if not exists "IX_Comm_Messages_follow_up_mailbox_date"
  on public."Comm_Messages" (
    "CommMessage_MailboxID",
    (coalesce("CommMessage_MessageDate", "CommMessage_ReceivedAt", "CommMessage_SentAt", "CommMessage_CreatedAt")) desc,
    "CommMessage_ThreadID"
  )
  where not "CommMessage_IsDeleted" and not "CommMessage_IsDraft" and not "CommMessage_IsSpam";

create index if not exists "IX_CRM_Leads_follow_up_email_owner"
  on public."CRM_Leads" (lower(btrim("CRMLead_Email")), "CRMLead_OwnerUserID")
  where not "CRMLead_IsDeleted" and "CRMLead_Email" is not null;

create index if not exists "IX_OrgContact_Emails_follow_up_email"
  on public."OrgContact_Emails" (lower(btrim("OrgContactEmail_Email")));

create or replace function public.multideck_crm_get_follow_up_opportunities(
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

  with accessible_mailboxes as materialized (
    select mailbox."CommMailbox_ID" as mailbox_id, lower(btrim(mailbox."CommMailbox_Address")) as mailbox_address
    from public."Comm_Mailboxes" mailbox
    where not mailbox."CommMailbox_IsDeleted"
      and mailbox."CommMailbox_UserID" = v_context.user_id
      and mailbox."CommMailbox_TypeCode" = 'personal'
    union
    select access."CommMailboxAccess_MailboxID", lower(btrim(mailbox."CommMailbox_Address"))
    from public."Comm_MailboxAccess" access
    join public."Comm_Mailboxes" mailbox on mailbox."CommMailbox_ID" = access."CommMailboxAccess_MailboxID" and not mailbox."CommMailbox_IsDeleted"
    where access."CommMailboxAccess_UserID" = v_context.user_id
      and access."CommMailboxAccess_CanRead"
      and access."CommMailboxAccess_RevokedAt" is null
      and (access."CommMailboxAccess_ExpiresAt" is null or access."CommMailboxAccess_ExpiresAt" > now())
  ), meaningful_messages as materialized (
    select
      message."CommMessage_ID",
      message."CommMessage_ThreadID",
      message."CommMessage_MailboxID",
      message."CommMessage_Subject",
      message."CommMessage_BodyPreview",
      message."CommMessage_IsInbound",
      coalesce(message."CommMessage_MessageDate", message."CommMessage_ReceivedAt", message."CommMessage_SentAt", message."CommMessage_CreatedAt") as occurred_at
    from public."Comm_Messages" message
    where message."CommMessage_MailboxID" in (select mailbox_id from accessible_mailboxes)
      and message."CommMessage_ChannelCode" = 'email'
      and not message."CommMessage_IsDeleted"
      and not message."CommMessage_IsDraft"
      and not message."CommMessage_IsSpam"
      and coalesce(message."CommMessage_MessageDate", message."CommMessage_ReceivedAt", message."CommMessage_SentAt", message."CommMessage_CreatedAt") >= now() - interval '21 days'
      and lower(coalesce(message."CommMessage_Subject", '')) !~ '(newsletter|daily digest|weekly digest|monthly digest|unsubscribe|promotional|special offer|webinar|event reminder|automatic reply|out of office|undeliverable|delivery status notification|failure notice|mail delivery failed|password reset|verification code|support ticket|ticket #[0-9]|zoho desk)'
      and lower(coalesce(message."CommMessage_HeaderJSON", '{}'::jsonb)::text) not like '%list-unsubscribe%'
  ), thread_rollup as materialized (
    select
      thread_id,
      max(occurred_at) as latest_at,
      max(occurred_at) filter (where is_inbound) as last_inbound_at,
      max(occurred_at) filter (where not is_inbound) as last_outbound_at
    from (
      select
        message."CommMessage_ThreadID" as thread_id,
        message.occurred_at,
        message."CommMessage_IsInbound" as is_inbound
      from meaningful_messages message
    ) rows
    group by thread_id
  ), latest_messages as materialized (
    select distinct on (message."CommMessage_ThreadID")
      message."CommMessage_ThreadID" as thread_id,
      message."CommMessage_ID" as message_id,
      message."CommMessage_MailboxID" as mailbox_id,
      message."CommMessage_Subject" as subject,
      message."CommMessage_BodyPreview" as preview,
      message."CommMessage_IsInbound" as is_inbound,
      message.occurred_at
    from meaningful_messages message
    order by message."CommMessage_ThreadID", message.occurred_at desc, message."CommMessage_ID" desc
  ), outbound_counts as materialized (
    select
      message."CommMessage_ThreadID" as thread_id,
      count(*)::integer as outbound_since_reply
    from meaningful_messages message
    join thread_rollup rollup on rollup.thread_id = message."CommMessage_ThreadID"
    where not message."CommMessage_IsInbound"
      and (rollup.last_inbound_at is null or message.occurred_at > rollup.last_inbound_at)
    group by message."CommMessage_ThreadID"
  ), email_threads as materialized (
    select
      latest.thread_id,
      latest.message_id,
      latest.mailbox_id,
      latest.subject,
      latest.preview,
      latest.is_inbound,
      latest.occurred_at,
      party.email,
      party.display_name,
      party.contact_id,
      party.org_id,
      rollup.last_inbound_at,
      rollup.last_outbound_at,
      coalesce(outbound.outbound_since_reply, 0) as outbound_since_reply
    from latest_messages latest
    join thread_rollup rollup on rollup.thread_id = latest.thread_id
    left join outbound_counts outbound on outbound.thread_id = latest.thread_id
    join lateral (
      select
        lower(btrim(recipient."CommRecipient_NormalizedAddress")) as email,
        nullif(btrim(recipient."CommRecipient_DisplayNameSnapshot"), '') as display_name,
        recipient."CommRecipient_ContactID" as contact_id,
        recipient."CommRecipient_OrgID" as org_id
      from public."Comm_MessageRecipients" recipient
      where recipient."CommRecipient_MessageID" = latest.message_id
        and recipient."CommRecipient_IsExternal"
        and (
          (latest.is_inbound and recipient."CommRecipient_RecipientTypeCode" = 'from')
          or (not latest.is_inbound and recipient."CommRecipient_RecipientTypeCode" in ('to', 'cc'))
        )
      order by case when recipient."CommRecipient_RecipientTypeCode" in ('from', 'to') then 0 else 1 end,
        recipient."CommRecipient_CreatedAt"
      limit 1
    ) party on true
    where party.email <> ''
      and split_part(party.email, '@', 1) !~ '^(no-?reply|do-?not-?reply|mailer-daemon|postmaster|notifications?|newsletters?|marketing|support|tickets?)$'
      and not exists (
        select 1 from accessible_mailboxes own_mailbox
        where split_part(own_mailbox.mailbox_address, '@', 2) <> ''
          and split_part(own_mailbox.mailbox_address, '@', 2) not in (
            'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com',
            'icloud.com', 'me.com', 'yahoo.com', 'proton.me', 'protonmail.com'
          )
          and split_part(own_mailbox.mailbox_address, '@', 2) = split_part(party.email, '@', 2)
      )
      and lower(coalesce(latest.subject, '') || ' ' || coalesce(latest.preview, '')) !~ '((^|[^a-z])ooo([^a-z]|$)|out of (the )?office|automatic reply|auto.?reply|office closed|currently away|annual leave|returning on|mailbox is unattended|has not been forwarded|reacted via gmail|delivery status|undeliverable|failure notice|mail delivery failed|your receipt|subscription|booking reminder|password|verification code|security alert|confirm your email|support ticket|ticket #[0-9]|zoho desk|not at this time|not interested|no thank(s| you)|remove me|stop emailing|this is my final note|my last email|should i close this out|should i move on)'
      and (
        (latest.is_inbound and rollup.last_outbound_at is not null and latest.occurred_at > rollup.last_outbound_at)
        or (
          not latest.is_inbound
          and (
            (rollup.last_inbound_at is null and latest.occurred_at <= now() - interval '3 days')
            or (rollup.last_inbound_at is not null and latest.occurred_at > rollup.last_inbound_at and latest.occurred_at <= now() - interval '3 days')
          )
        )
      )
  ), matched_email_threads as materialized (
    select
      email.*,
      lead."CRMLead_ID" as lead_id,
      lead."CRMLead_CompanyName" as lead_company_name,
      lead."CRMLead_PersonName" as lead_person_name,
      lead_status."CRMLeadStatus_Name" as lead_status_name,
      contact."OrgContact_ID" as matched_contact_id,
      nullif(btrim(concat_ws(' ', contact."OrgContact_FirstName", contact."OrgContact_LastName")), '') as contact_name,
      organisation."Org_id" as matched_org_id,
      organisation."Org_Name" as organisation_name,
      account."CRMAccount_ID" as account_id,
      coalesce(address.area_key, '') as area_key,
      coalesce(address.area_label, '') as area_label
    from email_threads email
    left join lateral (
      select candidate.*
      from public."CRM_Leads" candidate
      join public."sys_CRMLeadStatuses" candidate_status
        on candidate_status."CRMLeadStatus_Code" = candidate."CRMLead_StatusCode"
       and candidate_status."CRMLeadStatus_IsOpen"
      where not candidate."CRMLead_IsDeleted"
        and candidate."CRMLead_OwnerUserID" = v_context.user_id
        and lower(btrim(candidate."CRMLead_Email")) = email.email
      order by candidate."CRMLead_UpdatedAt" desc
      limit 1
    ) lead on true
    left join public."sys_CRMLeadStatuses" lead_status on lead_status."CRMLeadStatus_Code" = lead."CRMLead_StatusCode"
    left join lateral (
      select contact_row.*
      from public."OrgContact_Emails" contact_email
      join public."Org_Contacts" contact_row on contact_row."OrgContact_ID" = contact_email."OrgContact_ID"
      where lower(btrim(contact_email."OrgContactEmail_Email")) = email.email
      order by contact_email."OrgContactEmail_Type", contact_email."OrgContactEmail_ID"
      limit 1
    ) contact on true
    left join public."Org_Master" organisation
      on organisation."Org_id" = coalesce(contact."Org_ID", email.org_id, lead."CRMLead_OrgID")
    left join public."CRM_AccountProfiles" account
      on account."CRMAccount_OrgID" = organisation."Org_id"
     and not account."CRMAccount_IsDeleted"
     and (account."CRMAccount_OwnerUserID" is null or account."CRMAccount_OwnerUserID" = v_context.user_id)
    left join lateral (
      select
        lower(nullif(concat_ws('|', nullif(btrim(a."OrgAdd_TownCity"), ''), nullif(btrim(a."OrgAdd_CountyState"), ''),
          nullif(split_part(btrim(a."OrgAdd_PostZipCode"), ' ', 1), ''), nullif(upper(btrim(a."OrgAdd_Country")), '')), '')) as area_key,
        nullif(concat_ws(' · ', nullif(btrim(a."OrgAdd_TownCity"), ''), nullif(btrim(a."OrgAdd_CountyState"), ''),
          nullif(split_part(btrim(a."OrgAdd_PostZipCode"), ' ', 1), ''), nullif(upper(btrim(a."OrgAdd_Country")), '')), '') as area_label
      from public."Org_Addresses" a
      where a."Org_ID" = organisation."Org_id"
      order by a."OrgAdd_ID"
      limit 1
    ) address on true
  ), email_opportunities_raw as (
    select jsonb_build_object(
      'id', 'email:' || thread_id::text,
      'source', 'email',
      'threadId', thread_id,
      'mailboxId', mailbox_id,
      'recordType', case when lead_id is not null then 'lead' when matched_contact_id is not null then 'contact' when account_id is not null then 'account' else 'unmatched' end,
      'recordId', coalesce(lead_id, matched_contact_id, account_id),
      'companyName', coalesce(nullif(btrim(lead_company_name), ''), organisation_name),
      'personName', coalesce(nullif(btrim(lead_person_name), ''), contact_name, display_name),
      'email', email,
      'subject', coalesce(nullif(btrim(subject), ''), 'No subject'),
      'context', nullif(btrim(preview), ''),
      'lastActivityAt', occurred_at,
      'lastDirection', case when is_inbound then 'inbound' else 'outbound' end,
      'reasonCode', case
        when is_inbound then 'reply_due'
        when outbound_since_reply >= 2 and occurred_at <= now() - interval '5 days' then 'second_follow_up'
        else 'first_follow_up'
      end,
      'dueAt', case
        when is_inbound then occurred_at
        when outbound_since_reply >= 2 then occurred_at + interval '5 days'
        else occurred_at + interval '3 days'
      end,
      'daysWaiting', greatest(0, floor(extract(epoch from (now() - occurred_at)) / 86400)::integer),
      'stage', coalesce(lead_status_name, case when matched_contact_id is not null then 'Contact' when account_id is not null then 'Account' else 'Not in CRM' end),
      'location', nullif(area_label, ''),
      'canCreate', lead_id is null and matched_contact_id is null and account_id is null,
      'outboundAttempts', outbound_since_reply
    ) as item,
    case when is_inbound then 0 when outbound_since_reply >= 2 then 1 else 2 end as priority,
    occurred_at as sort_at
    from matched_email_threads
    where (v_area is null or area_key = v_area or (area_key = '' and lead_id is null and matched_contact_id is null and account_id is null))
      and (is_inbound or outbound_since_reply <= 2)
  ), email_opportunities as (
    select item, priority, sort_at
    from (
      select raw.*,
        row_number() over (
          partition by lower(raw.item->>'email'),
            regexp_replace(lower(raw.item->>'subject'), '^(re|fw|fwd):[[:space:]]*', ''),
            raw.item->>'reasonCode'
          order by raw.sort_at desc
        ) as duplicate_rank
      from email_opportunities_raw raw
    ) ranked
    where duplicate_rank = 1
  ), activity_leads as materialized (
    select
      lead.*,
      status."CRMLeadStatus_Name" as status_name,
      coalesce(nullif(btrim(lead."CRMLead_CompanyName"), ''), organisation."Org_Name", nullif(btrim(lead."CRMLead_PersonName"), ''), 'Unnamed lead') as company_name,
      coalesce(nullif(btrim(lead."CRMLead_PersonName"), ''), nullif(btrim(concat_ws(' ', contact."OrgContact_FirstName", contact."OrgContact_LastName")), '')) as person_name,
      coalesce(nullif(btrim(lead."CRMLead_Email"), ''), contact_email.email) as email,
      greatest(lead."CRMLead_LastInteractionAt", latest_activity.activity_at) as last_activity_at,
      latest_activity.subject as activity_subject,
      coalesce(address.area_key, '') as area_key,
      address.area_label
    from public."CRM_Leads" lead
    join public."sys_CRMLeadStatuses" status on status."CRMLeadStatus_Code" = lead."CRMLead_StatusCode" and status."CRMLeadStatus_IsOpen"
    left join public."Org_Master" organisation on organisation."Org_id" = lead."CRMLead_OrgID"
    left join public."Org_Contacts" contact on contact."OrgContact_ID" = lead."CRMLead_PrimaryContactID"
    left join lateral (
      select lower(btrim(row."OrgContactEmail_Email")) as email
      from public."OrgContact_Emails" row
      where row."OrgContact_ID" = contact."OrgContact_ID"
      order by row."OrgContactEmail_Type", row."OrgContactEmail_ID" limit 1
    ) contact_email on true
    left join lateral (
      select activity."CRMActivity_ActivityAt" as activity_at, activity."CRMActivity_Subject" as subject
      from public."CRM_Activities" activity
      where activity."CRMActivity_LeadID" = lead."CRMLead_ID" and not activity."CRMActivity_IsDeleted"
      order by activity."CRMActivity_ActivityAt" desc limit 1
    ) latest_activity on true
    left join lateral (
      select
        lower(nullif(concat_ws('|', nullif(btrim(a."OrgAdd_TownCity"), ''), nullif(btrim(a."OrgAdd_CountyState"), ''),
          nullif(split_part(btrim(a."OrgAdd_PostZipCode"), ' ', 1), ''), nullif(upper(btrim(a."OrgAdd_Country")), '')), '')) as area_key,
        nullif(concat_ws(' · ', nullif(btrim(a."OrgAdd_TownCity"), ''), nullif(btrim(a."OrgAdd_CountyState"), ''),
          nullif(split_part(btrim(a."OrgAdd_PostZipCode"), ' ', 1), ''), nullif(upper(btrim(a."OrgAdd_Country")), '')), '') as area_label
      from public."Org_Addresses" a where a."Org_ID" = lead."CRMLead_OrgID" order by a."OrgAdd_ID" limit 1
    ) address on true
    where lead."CRMLead_OwnerUserID" = v_context.user_id and not lead."CRMLead_IsDeleted"
      and (
        lead."CRMLead_NextActionDueAt" <= now()
        or (lead."CRMLead_NextActionDueAt" is null and coalesce(greatest(lead."CRMLead_LastInteractionAt", latest_activity.activity_at), lead."CRMLead_CreatedAt") <= now() - interval '3 days')
      )
  ), activity_opportunities as (
    select jsonb_build_object(
      'id', 'lead:' || lead."CRMLead_ID"::text,
      'source', 'activity',
      'threadId', null,
      'mailboxId', null,
      'recordType', 'lead',
      'recordId', lead."CRMLead_ID",
      'companyName', lead.company_name,
      'personName', lead.person_name,
      'email', lead.email,
      'subject', coalesce(lead.activity_subject, 'CRM follow-up due'),
      'context', coalesce(nullif(btrim(lead."CRMLead_TradeLane"), ''), nullif(btrim(lead."CRMLead_ServiceInterest"), '')),
      'lastActivityAt', coalesce(lead.last_activity_at, lead."CRMLead_CreatedAt"),
      'lastDirection', null,
      'reasonCode', case when lead.last_activity_at is null then 'never_contacted' else 'scheduled_due' end,
      'dueAt', coalesce(lead."CRMLead_NextActionDueAt", coalesce(lead.last_activity_at, lead."CRMLead_CreatedAt") + interval '3 days'),
      'daysWaiting', greatest(0, floor(extract(epoch from (now() - coalesce(lead.last_activity_at, lead."CRMLead_CreatedAt"))) / 86400)::integer),
      'stage', lead.status_name,
      'location', lead.area_label,
      'canCreate', false,
      'outboundAttempts', 0
    ) as item,
    3 as priority,
    coalesce(lead."CRMLead_NextActionDueAt", lead.last_activity_at, lead."CRMLead_CreatedAt") as sort_at
    from activity_leads lead
    where (v_area is null or lead.area_key = v_area)
      and not exists (
        select 1 from matched_email_threads email
        where email.lead_id = lead."CRMLead_ID"
      )
  ), all_opportunities as (
    select * from email_opportunities
    union all
    select * from activity_opportunities
  ), prioritised_opportunities as materialized (
    select * from all_opportunities
    order by priority, sort_at asc
    limit 50
  )
  select jsonb_build_object(
    'generatedAt', now(),
    'cadence', jsonb_build_object('firstFollowUpDays', 3, 'secondFollowUpDays', 5),
    'summary', jsonb_build_object(
      'total', count(*),
      'repliesDue', count(*) filter (where item->>'reasonCode' = 'reply_due'),
      'awaitingReply', count(*) filter (where item->>'reasonCode' in ('first_follow_up', 'second_follow_up')),
      'notInCrm', count(*) filter (where (item->>'canCreate')::boolean)
    ),
    'items', coalesce(jsonb_agg(item order by priority, sort_at asc), '[]'::jsonb)
  ) into v_result
  from prioritised_opportunities;

  return v_result;
end;
$$;

create or replace function public.multideck_crm_create_follow_up_lead(
  p_email text,
  p_person_name text default null,
  p_company_name text default null,
  p_thread_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_context record;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_id uuid;
begin
  select * into v_context from public._multideck_crm_context();
  if v_email = '' or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Enter a valid email address.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public."CRM_Leads" lead
    where not lead."CRMLead_IsDeleted" and lower(btrim(lead."CRMLead_Email")) = v_email
  ) or exists (
    select 1 from public."OrgContact_Emails" email
    where lower(btrim(email."OrgContactEmail_Email")) = v_email
  ) then
    raise exception 'This email is already connected to a CRM record.' using errcode = '23505';
  end if;

  insert into public."CRM_Leads" (
    "CRMLead_SourceCode", "CRMLead_StatusCode", "CRMLead_RatingCode", "CRMLead_OwnerUserID",
    "CRMLead_CompanyName", "CRMLead_PersonName", "CRMLead_Email", "CRMLead_MetadataJSON",
    "CRMLead_CreatedBy", "CRMLead_UpdatedBy"
  ) values (
    'manual', 'new', 'unrated', v_context.user_id,
    nullif(btrim(p_company_name), ''), nullif(btrim(p_person_name), ''), v_email,
    jsonb_strip_nulls(jsonb_build_object('source', 'follow_up_opportunity', 'threadId', p_thread_id)),
    v_context.user_id, v_context.user_id
  ) returning "CRMLead_ID" into v_id;

  return public._multideck_crm_lead_json(v_id);
end;
$$;

comment on function public.multideck_crm_get_follow_up_opportunities(text) is
  'Deterministic CRM dashboard worklist over authorised mailbox and CRM activity. Dexter reads the same source domains separately; this composed dashboard view is not an additional Dexter data capability.';
comment on function public.multideck_crm_create_follow_up_lead(text, text, text, uuid) is
  'Dashboard-only assisted creation from reviewed mailbox evidence. Not exposed as a generic Dexter write because it requires the dedicated preview and approval UI.';

revoke all on function public.multideck_crm_get_follow_up_opportunities(text) from public, anon;
revoke all on function public.multideck_crm_create_follow_up_lead(text, text, text, uuid) from public, anon;
grant execute on function public.multideck_crm_get_follow_up_opportunities(text) to authenticated;
grant execute on function public.multideck_crm_create_follow_up_lead(text, text, text, uuid) to authenticated;

commit;
