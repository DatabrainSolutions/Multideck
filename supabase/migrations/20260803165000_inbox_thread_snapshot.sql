-- Read one complete, tenant-safe Inbox thread in one PostgREST round trip.
-- The function is service-role only; the actor id comes from the verified
-- Supabase session resolved by inbox-api.

begin;

create or replace function public.comm_inbox_thread_snapshot(
  p_user_id uuid,
  p_thread_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_message_count integer;
  v_accessible_count integer;
  v_result jsonb;
begin
  if not exists (
    select 1
    from public."cmp_Users_Roles" as user_role
    join public."sys_UserRole_Permissions" as role_permission
      on role_permission."sys_UserRole_ID" = user_role."sys_UserRole_ID"
    join public."sys_Permissions" as permission
      on permission."sys_Permission_ID" = role_permission."sys_Permission_ID"
    where user_role."User_ID" = p_user_id
      and permission."sys_Permission_Value" = 'Email.Read'
  ) then
    return jsonb_build_object('permissionGranted', false, 'found', false);
  end if;

  select count(*)
  into v_message_count
  from public."Comm_Messages" as message
  where message."CommMessage_ThreadID" = p_thread_id
    and not message."CommMessage_IsDeleted";

  select count(*)
  into v_accessible_count
  from public."Comm_Messages" as message
  where message."CommMessage_ThreadID" = p_thread_id
    and not message."CommMessage_IsDeleted"
    and (
      exists (
        select 1
        from public."Comm_MailboxAccess" as access
        where access."CommMailboxAccess_MailboxID" = message."CommMessage_MailboxID"
          and access."CommMailboxAccess_UserID" = p_user_id
          and access."CommMailboxAccess_CanRead"
          and access."CommMailboxAccess_RevokedAt" is null
          and (access."CommMailboxAccess_ExpiresAt" is null or access."CommMailboxAccess_ExpiresAt" > now())
      )
      or exists (
        select 1
        from public."Comm_Mailboxes" as mailbox
        join public."Comm_ProviderConnections" as connection
          on connection."CommConn_ID" = mailbox."CommMailbox_ConnectionID"
        where mailbox."CommMailbox_ID" = message."CommMessage_MailboxID"
          and mailbox."CommMailbox_UserID" = p_user_id
          and mailbox."CommMailbox_TypeCode" = 'personal'
          and not mailbox."CommMailbox_IsDeleted"
          and connection."CommConn_UserID" = p_user_id
          and not connection."CommConn_IsDeleted"
      )
    );

  if v_message_count = 0 or v_accessible_count <> v_message_count then
    return jsonb_build_object('permissionGranted', true, 'found', false);
  end if;

  with thread_messages as materialized (
    select message.*
    from public."Comm_Messages" as message
    where message."CommMessage_ThreadID" = p_thread_id
      and not message."CommMessage_IsDeleted"
  ),
  message_ids as materialized (
    select message."CommMessage_ID" as id
    from thread_messages as message
  )
  select jsonb_build_object(
    'permissionGranted', true,
    'found', true,
    'messages', coalesce((
      select jsonb_agg(
        to_jsonb(message)
        order by coalesce(
          message."CommMessage_MessageDate",
          message."CommMessage_ReceivedAt",
          message."CommMessage_SentAt",
          message."CommMessage_CreatedAt"
        )
      )
      from thread_messages as message
    ), '[]'::jsonb),
    'recipients', coalesce((
      select jsonb_agg(to_jsonb(recipient))
      from public."Comm_MessageRecipients" as recipient
      where recipient."CommRecipient_MessageID" in (select id from message_ids)
    ), '[]'::jsonb),
    'attachments', coalesce((
      select jsonb_agg(to_jsonb(attachment))
      from public."Comm_MessageAttachments" as attachment
      where attachment."CommAttachment_MessageID" in (select id from message_ids)
    ), '[]'::jsonb),
    'deliveryEvents', coalesce((
      select jsonb_agg(to_jsonb(event) order by event."CommDelivery_EventAt")
      from public."Comm_DeliveryEvents" as event
      where event."CommDelivery_MessageID" in (select id from message_ids)
    ), '[]'::jsonb),
    'trackingTokens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'CommTrack_MessageID', token."CommTrack_MessageID",
        'CommTrack_FirstOpenedAt', token."CommTrack_FirstOpenedAt"
      ))
      from public."Comm_MessageTrackingTokens" as token
      where token."CommTrack_MessageID" in (select id from message_ids)
    ), '[]'::jsonb),
    'state', (
      select to_jsonb(state)
      from public."Comm_ReadStates" as state
      where state."CommRead_UserID" = p_user_id
        and state."CommRead_ThreadID" = p_thread_id
        and state."CommRead_MessageID" is null
      limit 1
    ),
    'summary', (
      select to_jsonb(summary)
      from public."Comm_ThreadSummaries" as summary
      where summary."CommThreadSummary_ThreadID" = p_thread_id
        and summary."CommThreadSummary_SupersededAt" is null
      limit 1
    ),
    'sendMailboxIds', coalesce((
      select jsonb_agg(distinct message."CommMessage_MailboxID")
      from thread_messages as message
      where exists (
        select 1
        from public."Comm_MailboxAccess" as access
        where access."CommMailboxAccess_MailboxID" = message."CommMessage_MailboxID"
          and access."CommMailboxAccess_UserID" = p_user_id
          and access."CommMailboxAccess_CanSend"
          and (access."CommMailboxAccess_ScopeCode" = 'personal' or access."CommMailboxAccess_CanSendAs")
          and access."CommMailboxAccess_RevokedAt" is null
          and (access."CommMailboxAccess_ExpiresAt" is null or access."CommMailboxAccess_ExpiresAt" > now())
      ) or exists (
        select 1
        from public."Comm_Mailboxes" as mailbox
        join public."Comm_ProviderConnections" as connection
          on connection."CommConn_ID" = mailbox."CommMailbox_ConnectionID"
        where mailbox."CommMailbox_ID" = message."CommMessage_MailboxID"
          and mailbox."CommMailbox_UserID" = p_user_id
          and mailbox."CommMailbox_TypeCode" = 'personal'
          and not mailbox."CommMailbox_IsDeleted"
          and connection."CommConn_UserID" = p_user_id
          and not connection."CommConn_IsDeleted"
      )
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.comm_inbox_thread_snapshot(uuid, uuid) from public, anon, authenticated;
grant execute on function public.comm_inbox_thread_snapshot(uuid, uuid) to service_role;

commit;
