-- Mirror provider-owned Gmail labels and Outlook folders without weakening the
-- mailbox access boundary. Provider identifiers remain server-side; clients
-- select the local folder UUID after the Edge Function has checked access.

begin;

alter table public."Comm_Mailboxes"
  add column if not exists "CommMailbox_FolderCatalogSyncedAt" timestamptz;

alter table public."Comm_MailFolders"
  add column if not exists "CommMailFolder_TotalCount" integer,
  add column if not exists "CommMailFolder_UnreadCount" integer,
  add column if not exists "CommMailFolder_BackgroundColor" varchar(32),
  add column if not exists "CommMailFolder_TextColor" varchar(32),
  add column if not exists "CommMailFolder_CatalogTypeCode" varchar(40) not null default 'provider';

alter table public."Comm_MailFolders"
  drop constraint if exists "CK_Comm_MailFolders_counts";

alter table public."Comm_MailFolders"
  add constraint "CK_Comm_MailFolders_counts" check (
    ("CommMailFolder_TotalCount" is null or "CommMailFolder_TotalCount" >= 0)
    and ("CommMailFolder_UnreadCount" is null or "CommMailFolder_UnreadCount" >= 0)
  );

create or replace function public.comm_inbox_provider_folder_thread_page(
  p_user_id uuid,
  p_mailbox_id uuid,
  p_folder_id uuid,
  p_query text,
  p_limit integer,
  p_offset integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_provider text;
  v_limit integer := least(100, greatest(1, coalesce(p_limit, 25)));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_query text := lower(coalesce(trim(p_query), ''));
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
    return jsonb_build_object('permissionGranted', false, 'mailboxFound', false, 'folderValid', false, 'items', '[]'::jsonb);
  end if;

  if not (
    exists (
      select 1
      from public."Comm_MailboxAccess" as access
      where access."CommMailboxAccess_MailboxID" = p_mailbox_id
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
      where mailbox."CommMailbox_ID" = p_mailbox_id
        and mailbox."CommMailbox_UserID" = p_user_id
        and mailbox."CommMailbox_TypeCode" = 'personal'
        and not mailbox."CommMailbox_IsDeleted"
        and connection."CommConn_UserID" = p_user_id
        and not connection."CommConn_IsDeleted"
    )
  ) then
    return jsonb_build_object('permissionGranted', true, 'mailboxFound', false, 'folderValid', false, 'items', '[]'::jsonb);
  end if;

  if not exists (
    select 1
    from public."Comm_MailFolders" as folder
    where folder."CommMailFolder_ID" = p_folder_id
      and folder."CommMailFolder_MailboxID" = p_mailbox_id
      and folder."CommMailFolder_CanHoldMessages"
      and not folder."CommMailFolder_IsHidden"
  ) then
    return jsonb_build_object('permissionGranted', true, 'mailboxFound', true, 'folderValid', false, 'items', '[]'::jsonb);
  end if;

  select case
    when lower(connection."CommConn_ProviderTypeCode") like '%gmail%'
      or lower(connection."CommConn_ProviderTypeCode") like '%google%'
      then 'gmail'
    else 'outlook'
  end
  into v_provider
  from public."Comm_Mailboxes" as mailbox
  join public."Comm_ProviderConnections" as connection
    on connection."CommConn_ID" = mailbox."CommMailbox_ConnectionID"
  where mailbox."CommMailbox_ID" = p_mailbox_id
    and not mailbox."CommMailbox_IsDeleted"
    and not connection."CommConn_IsDeleted"
  limit 1;

  if v_provider is null then
    return jsonb_build_object('permissionGranted', true, 'mailboxFound', false, 'folderValid', false, 'items', '[]'::jsonb);
  end if;

  with message_scope as materialized (
    select
      message."CommMessage_ID" as message_id,
      message."CommMessage_ThreadID" as thread_id,
      message."CommMessage_MailboxID" as mailbox_id,
      message."CommMessage_Subject" as subject,
      message."CommMessage_BodyPreview" as preview,
      coalesce(
        message."CommMessage_MessageDate",
        message."CommMessage_ReceivedAt",
        message."CommMessage_SentAt",
        message."CommMessage_CreatedAt"
      ) as occurred_at,
      message."CommMessage_IsInbound" as is_inbound,
      message."CommMessage_HasAttachments" as has_attachments,
      state."CommRead_ReadAt" as read_at,
      coalesce(state."CommRead_IsArchived", false) as is_archived,
      coalesce(state."CommRead_IsStarred", false) as is_starred
    from public."Comm_Messages" as message
    join public."Comm_MessageFolders" as membership
      on membership."CommMessageFolder_MessageID" = message."CommMessage_ID"
     and membership."CommMessageFolder_FolderID" = p_folder_id
    left join public."Comm_ReadStates" as state
      on state."CommRead_ThreadID" = message."CommMessage_ThreadID"
     and state."CommRead_UserID" = p_user_id
     and state."CommRead_MessageID" is null
    where message."CommMessage_MailboxID" = p_mailbox_id
      and not message."CommMessage_IsDeleted"
      and (
        v_query = ''
        or lower(coalesce(message."CommMessage_Subject", '') || ' ' || coalesce(message."CommMessage_BodyPreview", '')) like '%' || v_query || '%'
      )
  ),
  grouped as materialized (
    select
      thread_id,
      (array_agg(message_id order by occurred_at desc nulls last))[1] as latest_message_id,
      max(occurred_at) as last_message_at,
      count(*)::integer as message_count,
      count(*) filter (
        where is_inbound and occurred_at > coalesce(read_at, '-infinity'::timestamptz)
      )::integer as unread_count,
      bool_or(has_attachments) as has_attachments,
      bool_or(is_starred) as is_starred,
      bool_or(is_archived) as is_archived
    from message_scope
    group by thread_id
  ),
  ordered as materialized (
    select
      grouped.*,
      row_number() over (order by last_message_at desc nulls last, thread_id) as row_number,
      count(*) over () as total_count
    from grouped
  ),
  visible as materialized (
    select *
    from ordered
    where row_number > v_offset
      and row_number <= v_offset + v_limit
    order by row_number
  )
  select jsonb_build_object(
    'permissionGranted', true,
    'mailboxFound', true,
    'folderValid', true,
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'threadId', visible.thread_id,
          'mailboxId', latest."CommMessage_MailboxID",
          'provider', v_provider,
          'subject', latest."CommMessage_Subject",
          'preview', latest."CommMessage_BodyPreview",
          'lastMessageAt', visible.last_message_at,
          'unreadCount', visible.unread_count,
          'messageCount', visible.message_count,
          'hasAttachments', visible.has_attachments,
          'starred', visible.is_starred,
          'archived', visible.is_archived,
          'participants', coalesce((
            select jsonb_agg(jsonb_build_object(
              'address', participant."CommRecipient_Address",
              'displayName', participant."CommRecipient_DisplayNameSnapshot"
            ))
            from (
              select distinct on (recipient."CommRecipient_NormalizedAddress")
                recipient."CommRecipient_NormalizedAddress",
                recipient."CommRecipient_Address",
                recipient."CommRecipient_DisplayNameSnapshot"
              from public."Comm_MessageRecipients" as recipient
              join message_scope as thread_message
                on thread_message.message_id = recipient."CommRecipient_MessageID"
              where thread_message.thread_id = visible.thread_id
              order by recipient."CommRecipient_NormalizedAddress"
              limit 8
            ) as participant
          ), '[]'::jsonb),
          'summary', (
            select to_jsonb(summary)
            from public."Comm_ThreadSummaries" as summary
            where summary."CommThreadSummary_ThreadID" = visible.thread_id
              and summary."CommThreadSummary_SupersededAt" is null
            limit 1
          )
        )
        order by visible.row_number
      )
      from visible
      join public."Comm_Messages" as latest
        on latest."CommMessage_ID" = visible.latest_message_id
    ), '[]'::jsonb),
    'hasMore', coalesce((select max(total_count) > v_offset + v_limit from visible), false),
    'nextOffset', case
      when coalesce((select max(total_count) > v_offset + v_limit from visible), false)
        then v_offset + v_limit
      else null
    end
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.comm_inbox_provider_folder_thread_page(uuid, uuid, uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.comm_inbox_provider_folder_thread_page(uuid, uuid, uuid, text, integer, integer) to service_role;

-- Dexter may explain which visible folders or labels a thread belongs to, but
-- receives neither provider folder identifiers nor access beyond its existing
-- Email.Read + Email.AIRead mailbox boundary.
create or replace function public.multideck_dexter_email_thread_folders(
  p_thread_id uuid
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
begin
  select * into v_context from public._multideck_dexter_context();
  if not public._multideck_dexter_has_permission(v_context.user_id, 'Email.Read')
     or not public._multideck_dexter_has_permission(v_context.user_id, 'Email.AIRead') then
    raise exception 'You do not have permission to use email with Dexter.' using errcode = '42501';
  end if;

  with permitted_mailboxes as materialized (
    select mailbox_id
    from public._multideck_dexter_email_mailboxes(v_context.user_id, v_context.company_id)
  ),
  visible_folders as (
    select distinct
      folder."CommMailFolder_ID" as folder_id,
      folder."CommMailFolder_DisplayName" as display_name,
      folder."CommMailFolder_RoleCode" as role_code,
      folder."CommMailFolder_CatalogTypeCode" as catalog_type
    from public."Comm_Messages" as message
    join permitted_mailboxes as permitted
      on permitted.mailbox_id = message."CommMessage_MailboxID"
    join public."Comm_MessageFolders" as membership
      on membership."CommMessageFolder_MessageID" = message."CommMessage_ID"
    join public."Comm_MailFolders" as folder
      on folder."CommMailFolder_ID" = membership."CommMessageFolder_FolderID"
    where message."CommMessage_ThreadID" = p_thread_id
      and not message."CommMessage_IsDeleted"
      and not folder."CommMailFolder_IsHidden"
      and folder."CommMailFolder_CanHoldMessages"
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', visible_folders.folder_id,
    'displayName', visible_folders.display_name,
    'role', visible_folders.role_code,
    'kind', visible_folders.catalog_type
  ) order by visible_folders.display_name), '[]'::jsonb)
  into v_result
  from visible_folders;

  return v_result;
end;
$$;

revoke all on function public.multideck_dexter_email_thread_folders(uuid) from public, anon;
grant execute on function public.multideck_dexter_email_thread_folders(uuid) to authenticated;

commit;
