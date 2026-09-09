-- Keep customer detail reads bounded at the data boundary.
-- The customers Edge Function uses the service role for its already-authenticated
-- request, so these helpers are deliberately not exposed to browser roles.

begin;

create index if not exists "IX_Comm_Messages_crm_customer_recent"
  on public."Comm_Messages" (
    "CommMessage_MailboxID",
    coalesce(
      "CommMessage_MessageDate",
      "CommMessage_ReceivedAt",
      "CommMessage_SentAt",
      "CommMessage_CreatedAt"
    ) desc,
    "CommMessage_ID" desc
  )
  where not "CommMessage_IsDeleted"
    and not "CommMessage_IsDraft"
    and not "CommMessage_IsSpam";

create index if not exists "IX_Comm_MessageRecipients_crm_contact_message"
  on public."Comm_MessageRecipients" ("CommRecipient_ContactID", "CommRecipient_MessageID")
  where "CommRecipient_ContactID" is not null;

create index if not exists "IX_Comm_MessageRecipients_crm_address_message"
  on public."Comm_MessageRecipients" ("CommRecipient_NormalizedAddress", "CommRecipient_MessageID")
  where "CommRecipient_NormalizedAddress" is not null;

create index if not exists "IX_Comm_Threads_crm_customer_recent"
  on public."Comm_Threads" ("CommThread_CustomerOrgID", "CommThread_LastMessageAt" desc, "CommThread_ID" desc)
  where not "CommThread_IsDeleted";

create index if not exists "IX_CRM_ActivityParticipants_contact_activity"
  on public."CRM_ActivityParticipants" ("CRMActPart_OrgContactID", "CRMActPart_ActivityID")
  where "CRMActPart_OrgContactID" is not null;

create or replace function public.multideck_crm_customer_recent_emails(
  p_user_id uuid,
  p_account_id uuid,
  p_contact_ids uuid[] default '{}'::uuid[],
  p_contact_emails text[] default '{}'::text[],
  p_include_account_threads boolean default true,
  p_limit integer default 12
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_limit integer := least(12, greatest(1, coalesce(p_limit, 12)));
  v_result jsonb;
begin
  if not exists (
    select 1
    from public."cmp_Users" as user_row
    where user_row."User_ID" = p_user_id
      and user_row."Auth_User_ID" is not null
  ) then
    raise exception 'The signed-in CRM user could not be verified.' using errcode = '42501';
  end if;

  if not public._multideck_crm_has_permission(p_user_id, 'Email.Read') then
    return jsonb_build_object('available', false, 'items', '[]'::jsonb);
  end if;

  with candidate_messages as materialized (
    select
      message."CommMessage_ID" as message_id,
      message."CommMessage_ThreadID" as thread_id,
      message."CommMessage_Subject" as subject,
      message."CommMessage_BodyPreview" as body_preview,
      message."CommMessage_IsBodyRedacted" as body_redacted,
      message."CommMessage_HasAttachments" as has_attachments,
      message."CommMessage_IsInbound" as is_inbound,
      message."CommMessage_DirectionCode" as direction_code,
      coalesce(
        message."CommMessage_MessageDate",
        message."CommMessage_ReceivedAt",
        message."CommMessage_SentAt",
        message."CommMessage_CreatedAt"
      ) as occurred_at
    from public."Comm_Messages" as message
    where not message."CommMessage_IsDeleted"
      and not message."CommMessage_IsDraft"
      and not message."CommMessage_IsSpam"
      and exists (
        select 1
        from public."Comm_MailboxAccess" as mailbox_access
        where mailbox_access."CommMailboxAccess_MailboxID" = message."CommMessage_MailboxID"
          and mailbox_access."CommMailboxAccess_UserID" = p_user_id
          and mailbox_access."CommMailboxAccess_CanRead"
          and mailbox_access."CommMailboxAccess_RevokedAt" is null
          and (
            mailbox_access."CommMailboxAccess_ExpiresAt" is null
            or mailbox_access."CommMailboxAccess_ExpiresAt" > now()
          )
      )
      and (
        exists (
          select 1
          from public."Comm_MessageRecipients" as recipient
          where recipient."CommRecipient_MessageID" = message."CommMessage_ID"
            and (
              recipient."CommRecipient_ContactID" = any(coalesce(p_contact_ids, '{}'::uuid[]))
              or lower(recipient."CommRecipient_NormalizedAddress") = any(coalesce(p_contact_emails, '{}'::text[]))
            )
        )
        or (
          coalesce(p_include_account_threads, false)
          and exists (
            select 1
            from public."Comm_Threads" as thread
            where thread."CommThread_ID" = message."CommMessage_ThreadID"
              and thread."CommThread_CustomerOrgID" = p_account_id
              and not thread."CommThread_IsDeleted"
          )
        )
      )
    order by occurred_at desc nulls last, message."CommMessage_ID" desc
    limit v_limit
  )
  select jsonb_build_object(
    'available', true,
    'items', coalesce(jsonb_agg(
      jsonb_build_object(
        'id', candidate.message_id,
        'threadId', candidate.thread_id,
        'direction', case when candidate.is_inbound or candidate.direction_code = 'inbound' then 'inbound' else 'outbound' end,
        'subject', coalesce(nullif(candidate.subject, ''), '(No subject)'),
        'preview', case when candidate.body_redacted then null else candidate.body_preview end,
        'occurredAt', candidate.occurred_at,
        'contactName', selected_recipient.display_name,
        'contactEmail', selected_recipient.address,
        'hasAttachments', coalesce(candidate.has_attachments, false)
      )
      order by candidate.occurred_at desc nulls last, candidate.message_id desc
    ), '[]'::jsonb)
  )
  into v_result
  from candidate_messages as candidate
  left join lateral (
    select
      recipient."CommRecipient_DisplayNameSnapshot" as display_name,
      recipient."CommRecipient_Address" as address
    from public."Comm_MessageRecipients" as recipient
    where recipient."CommRecipient_MessageID" = candidate.message_id
    order by
      case
        when recipient."CommRecipient_ContactID" = any(coalesce(p_contact_ids, '{}'::uuid[])) then 0
        when recipient."CommRecipient_IsExternal" then 1
        else 2
      end,
      recipient."CommRecipient_CreatedAt" asc nulls last,
      recipient."CommRecipient_ID" asc
    limit 1
  ) as selected_recipient on true;

  return v_result;
end;
$$;

create or replace function public.multideck_crm_contact_activity_page(
  p_user_id uuid,
  p_contact_id uuid,
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_limit integer := least(20, greatest(1, coalesce(p_limit, 20)));
  v_result jsonb;
begin
  if not exists (
    select 1
    from public."cmp_Users" as user_row
    where user_row."User_ID" = p_user_id
      and user_row."Auth_User_ID" is not null
  ) then
    raise exception 'The signed-in CRM user could not be verified.' using errcode = '42501';
  end if;

  if not public._multideck_crm_has_permission(p_user_id, 'Customers.Read') then
    raise exception 'You do not have permission to read CRM customers.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', activity."CRMActivity_ID",
      'subject', activity."CRMActivity_Subject",
      'summary', activity."CRMActivity_Summary",
      'occurredAt', activity."CRMActivity_ActivityAt",
      'type', activity."CRMActivity_ActivityTypeCode"
    )
    order by activity."CRMActivity_ActivityAt" desc nulls last, activity."CRMActivity_ID" desc
  ), '[]'::jsonb)
  into v_result
  from (
    select activity.*
    from public."CRM_Activities" as activity
    where not activity."CRMActivity_IsDeleted"
      and exists (
        select 1
        from public."CRM_ActivityParticipants" as participant
        where participant."CRMActPart_ActivityID" = activity."CRMActivity_ID"
          and participant."CRMActPart_OrgContactID" = p_contact_id
      )
    order by activity."CRMActivity_ActivityAt" desc nulls last, activity."CRMActivity_ID" desc
    limit v_limit
  ) as activity;

  return v_result;
end;
$$;

revoke all on function public.multideck_crm_customer_recent_emails(uuid, uuid, uuid[], text[], boolean, integer) from public, anon, authenticated;
revoke all on function public.multideck_crm_contact_activity_page(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.multideck_crm_customer_recent_emails(uuid, uuid, uuid[], text[], boolean, integer) to service_role;
grant execute on function public.multideck_crm_contact_activity_page(uuid, uuid, integer) to service_role;

commit;
