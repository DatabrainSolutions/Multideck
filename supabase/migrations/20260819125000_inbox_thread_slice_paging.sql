-- Keep Inbox list reads proportional to the visible page rather than the
-- mailbox history. A thread may have different latest visible messages in
-- Inbox, Sent, Spam and provider-owned folders, so CommThread_LastMessageID is
-- not a correct substitute for this maintained per-slice read model.

begin;

create table if not exists public."Comm_InboxThreadSlices" (
  "CommInboxSlice_ThreadID" uuid not null
    references public."Comm_Threads"("CommThread_ID") on delete cascade,
  "CommInboxSlice_MailboxID" uuid not null
    references public."Comm_Mailboxes"("CommMailbox_ID") on delete cascade,
  "CommInboxSlice_Key" text not null,
  "CommInboxSlice_LatestMessageID" uuid not null
    references public."Comm_Messages"("CommMessage_ID") on delete cascade,
  "CommInboxSlice_LastMessageAt" timestamptz not null,
  "CommInboxSlice_MessageCount" integer not null,
  "CommInboxSlice_HasAttachments" boolean not null default false,
  "CommInboxSlice_UpdatedAt" timestamptz not null default now(),
  primary key (
    "CommInboxSlice_ThreadID",
    "CommInboxSlice_MailboxID",
    "CommInboxSlice_Key"
  ),
  constraint "CK_Comm_InboxThreadSlices_key" check (
    "CommInboxSlice_Key" in ('all', 'inbox', 'sent', 'drafts', 'spam', 'trash')
    or "CommInboxSlice_Key" ~* '^folder:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  constraint "CK_Comm_InboxThreadSlices_count" check (
    "CommInboxSlice_MessageCount" > 0
  )
);

alter table public."Comm_InboxThreadSlices" enable row level security;
revoke all on table public."Comm_InboxThreadSlices" from public, anon, authenticated;
grant select, insert, update, delete on table public."Comm_InboxThreadSlices" to service_role;

create index if not exists "IX_Comm_InboxThreadSlices_page"
  on public."Comm_InboxThreadSlices" (
    "CommInboxSlice_MailboxID",
    "CommInboxSlice_Key",
    "CommInboxSlice_LastMessageAt" desc,
    "CommInboxSlice_ThreadID"
  ) include (
    "CommInboxSlice_LatestMessageID",
    "CommInboxSlice_MessageCount",
    "CommInboxSlice_HasAttachments"
  );

create or replace function public._comm_inbox_refresh_thread_slices(
  p_thread_id uuid,
  p_mailbox_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_thread_id is null or p_mailbox_id is null then
    return;
  end if;

  -- Provider sync and user actions may touch the same conversation at once.
  -- Serialize only this thread/mailbox pair so delete-and-rebuild cannot lose
  -- a concurrent message while unrelated mail continues in parallel.
  perform pg_advisory_xact_lock(
    hashtextextended(p_thread_id::text || ':' || p_mailbox_id::text, 0)
  );

  delete from public."Comm_InboxThreadSlices" as slice
  where slice."CommInboxSlice_ThreadID" = p_thread_id
    and slice."CommInboxSlice_MailboxID" = p_mailbox_id;

  with scoped as materialized (
    select
      message."CommMessage_ID" as message_id,
      message."CommMessage_ThreadID" as thread_id,
      message."CommMessage_MailboxID" as mailbox_id,
      coalesce(
        message."CommMessage_MessageDate",
        message."CommMessage_ReceivedAt",
        message."CommMessage_SentAt",
        message."CommMessage_CreatedAt"
      ) as occurred_at,
      message."CommMessage_StatusCode" as status_code,
      message."CommMessage_IsInbound" as is_inbound,
      message."CommMessage_IsDraft" as is_draft,
      message."CommMessage_IsSpam" as is_spam,
      message."CommMessage_HasAttachments" as has_attachments,
      exists (
        select 1
        from public."Comm_MessageFolders" as membership
        where membership."CommMessageFolder_MessageID" = message."CommMessage_ID"
      ) as has_folder,
      exists (
        select 1
        from public."Comm_MessageFolders" as membership
        join public."Comm_MailFolders" as folder
          on folder."CommMailFolder_ID" = membership."CommMessageFolder_FolderID"
        where membership."CommMessageFolder_MessageID" = message."CommMessage_ID"
          and folder."CommMailFolder_RoleCode" = 'inbox'
      ) as is_inbox,
      exists (
        select 1
        from public."Comm_MessageFolders" as membership
        join public."Comm_MailFolders" as folder
          on folder."CommMailFolder_ID" = membership."CommMessageFolder_FolderID"
        where membership."CommMessageFolder_MessageID" = message."CommMessage_ID"
          and folder."CommMailFolder_RoleCode" = 'sent'
      ) as is_sent,
      exists (
        select 1
        from public."Comm_MessageFolders" as membership
        join public."Comm_MailFolders" as folder
          on folder."CommMailFolder_ID" = membership."CommMessageFolder_FolderID"
        where membership."CommMessageFolder_MessageID" = message."CommMessage_ID"
          and folder."CommMailFolder_RoleCode" = 'drafts'
      ) as is_drafts,
      exists (
        select 1
        from public."Comm_MessageFolders" as membership
        join public."Comm_MailFolders" as folder
          on folder."CommMailFolder_ID" = membership."CommMessageFolder_FolderID"
        where membership."CommMessageFolder_MessageID" = message."CommMessage_ID"
          and folder."CommMailFolder_RoleCode" = 'spam'
      ) as is_spam_folder,
      exists (
        select 1
        from public."Comm_MessageFolders" as membership
        join public."Comm_MailFolders" as folder
          on folder."CommMailFolder_ID" = membership."CommMessageFolder_FolderID"
        where membership."CommMessageFolder_MessageID" = message."CommMessage_ID"
          and folder."CommMailFolder_RoleCode" = 'trash'
      ) as is_trash
    from public."Comm_Messages" as message
    where message."CommMessage_ThreadID" = p_thread_id
      and message."CommMessage_MailboxID" = p_mailbox_id
      and not message."CommMessage_IsDeleted"
  ),
  message_slices as (
    select scoped.*, 'all'::text as slice_key from scoped
    union all
    select scoped.*, 'inbox'::text from scoped
    where (scoped.is_inbox or (not scoped.has_folder and scoped.is_inbound))
      and not scoped.is_draft
    union all
    select scoped.*, 'sent'::text from scoped
    where scoped.is_sent
      or (not scoped.has_folder and not scoped.is_inbound and scoped.status_code = 'sent')
    union all
    select scoped.*, 'drafts'::text from scoped
    where scoped.is_drafts or scoped.is_draft
    union all
    select scoped.*, 'spam'::text from scoped
    where scoped.is_spam_folder or scoped.is_spam
    union all
    select scoped.*, 'trash'::text from scoped
    where scoped.is_trash
    union all
    select
      scoped.*,
      'folder:' || membership."CommMessageFolder_FolderID"::text
    from scoped
    join public."Comm_MessageFolders" as membership
      on membership."CommMessageFolder_MessageID" = scoped.message_id
  ),
  grouped as (
    select
      thread_id,
      mailbox_id,
      slice_key,
      (array_agg(message_id order by occurred_at desc, message_id desc))[1] as latest_message_id,
      max(occurred_at) as last_message_at,
      count(*)::integer as message_count,
      bool_or(has_attachments) as has_attachments
    from message_slices
    group by thread_id, mailbox_id, slice_key
  )
  insert into public."Comm_InboxThreadSlices" (
    "CommInboxSlice_ThreadID",
    "CommInboxSlice_MailboxID",
    "CommInboxSlice_Key",
    "CommInboxSlice_LatestMessageID",
    "CommInboxSlice_LastMessageAt",
    "CommInboxSlice_MessageCount",
    "CommInboxSlice_HasAttachments",
    "CommInboxSlice_UpdatedAt"
  )
  select
    grouped.thread_id,
    grouped.mailbox_id,
    grouped.slice_key,
    grouped.latest_message_id,
    grouped.last_message_at,
    grouped.message_count,
    grouped.has_attachments,
    now()
  from grouped;
end;
$$;

revoke all on function public._comm_inbox_refresh_thread_slices(uuid, uuid) from public, anon, authenticated;
grant execute on function public._comm_inbox_refresh_thread_slices(uuid, uuid) to service_role;

create or replace function public._comm_inbox_refresh_slices_from_message()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' or (
    tg_op = 'UPDATE' and (
      old."CommMessage_ThreadID" is distinct from new."CommMessage_ThreadID"
      or old."CommMessage_MailboxID" is distinct from new."CommMessage_MailboxID"
    )
  ) then
    perform public._comm_inbox_refresh_thread_slices(
      old."CommMessage_ThreadID",
      old."CommMessage_MailboxID"
    );
  end if;

  if tg_op <> 'DELETE' then
    perform public._comm_inbox_refresh_thread_slices(
      new."CommMessage_ThreadID",
      new."CommMessage_MailboxID"
    );
  end if;

  return coalesce(new, old);
end;
$$;

create or replace function public._comm_inbox_refresh_slices_from_membership()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_message record;
begin
  if tg_op = 'DELETE' or (
    tg_op = 'UPDATE' and (
      old."CommMessageFolder_MessageID" is distinct from new."CommMessageFolder_MessageID"
      or old."CommMessageFolder_FolderID" is distinct from new."CommMessageFolder_FolderID"
    )
  ) then
    select
      message."CommMessage_ThreadID" as thread_id,
      message."CommMessage_MailboxID" as mailbox_id
    into v_message
    from public."Comm_Messages" as message
    where message."CommMessage_ID" = old."CommMessageFolder_MessageID";

    if found then
      perform public._comm_inbox_refresh_thread_slices(v_message.thread_id, v_message.mailbox_id);
    end if;
  end if;

  if tg_op <> 'DELETE' and (
    tg_op = 'INSERT'
    or old."CommMessageFolder_MessageID" is distinct from new."CommMessageFolder_MessageID"
    or old."CommMessageFolder_FolderID" is distinct from new."CommMessageFolder_FolderID"
  ) then
    select
      message."CommMessage_ThreadID" as thread_id,
      message."CommMessage_MailboxID" as mailbox_id
    into v_message
    from public."Comm_Messages" as message
    where message."CommMessage_ID" = new."CommMessageFolder_MessageID";

    if found then
      perform public._comm_inbox_refresh_thread_slices(v_message.thread_id, v_message.mailbox_id);
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

create or replace function public._comm_inbox_refresh_slices_from_folder()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_pair record;
begin
  if old."CommMailFolder_RoleCode" is not distinct from new."CommMailFolder_RoleCode"
     and old."CommMailFolder_MailboxID" is not distinct from new."CommMailFolder_MailboxID" then
    return new;
  end if;

  for v_pair in
    select distinct
      message."CommMessage_ThreadID" as thread_id,
      message."CommMessage_MailboxID" as mailbox_id
    from public."Comm_MessageFolders" as membership
    join public."Comm_Messages" as message
      on message."CommMessage_ID" = membership."CommMessageFolder_MessageID"
    where membership."CommMessageFolder_FolderID" = new."CommMailFolder_ID"
  loop
    perform public._comm_inbox_refresh_thread_slices(v_pair.thread_id, v_pair.mailbox_id);
  end loop;

  return new;
end;
$$;

revoke all on function public._comm_inbox_refresh_slices_from_message() from public, anon, authenticated;
revoke all on function public._comm_inbox_refresh_slices_from_membership() from public, anon, authenticated;
revoke all on function public._comm_inbox_refresh_slices_from_folder() from public, anon, authenticated;

-- Build the initial read model set-wise. This creates derived index rows only;
-- it does not create fixture mail or alter any operator record.
-- Keep provider sync writes outside the brief backfill window so no thread can
-- change between the snapshot and trigger installation.
lock table public."Comm_Messages", public."Comm_MessageFolders", public."Comm_MailFolders"
  in share row exclusive mode;

with scoped as materialized (
  select
    message."CommMessage_ID" as message_id,
    message."CommMessage_ThreadID" as thread_id,
    message."CommMessage_MailboxID" as mailbox_id,
    coalesce(
      message."CommMessage_MessageDate",
      message."CommMessage_ReceivedAt",
      message."CommMessage_SentAt",
      message."CommMessage_CreatedAt"
    ) as occurred_at,
    message."CommMessage_StatusCode" as status_code,
    message."CommMessage_IsInbound" as is_inbound,
    message."CommMessage_IsDraft" as is_draft,
    message."CommMessage_IsSpam" as is_spam,
    message."CommMessage_HasAttachments" as has_attachments,
    coalesce(folder_flags.has_folder, false) as has_folder,
    coalesce(folder_flags.is_inbox, false) as is_inbox,
    coalesce(folder_flags.is_sent, false) as is_sent,
    coalesce(folder_flags.is_drafts, false) as is_drafts,
    coalesce(folder_flags.is_spam, false) as is_spam_folder,
    coalesce(folder_flags.is_trash, false) as is_trash
  from public."Comm_Messages" as message
  left join lateral (
    select
      true as has_folder,
      bool_or(folder."CommMailFolder_RoleCode" = 'inbox') as is_inbox,
      bool_or(folder."CommMailFolder_RoleCode" = 'sent') as is_sent,
      bool_or(folder."CommMailFolder_RoleCode" = 'drafts') as is_drafts,
      bool_or(folder."CommMailFolder_RoleCode" = 'spam') as is_spam,
      bool_or(folder."CommMailFolder_RoleCode" = 'trash') as is_trash
    from public."Comm_MessageFolders" as membership
    join public."Comm_MailFolders" as folder
      on folder."CommMailFolder_ID" = membership."CommMessageFolder_FolderID"
    where membership."CommMessageFolder_MessageID" = message."CommMessage_ID"
    having count(*) > 0
  ) as folder_flags on true
  where message."CommMessage_MailboxID" is not null
    and not message."CommMessage_IsDeleted"
),
message_slices as (
  select scoped.*, 'all'::text as slice_key from scoped
  union all
  select scoped.*, 'inbox'::text from scoped
  where (scoped.is_inbox or (not scoped.has_folder and scoped.is_inbound))
    and not scoped.is_draft
  union all
  select scoped.*, 'sent'::text from scoped
  where scoped.is_sent
    or (not scoped.has_folder and not scoped.is_inbound and scoped.status_code = 'sent')
  union all
  select scoped.*, 'drafts'::text from scoped
  where scoped.is_drafts or scoped.is_draft
  union all
  select scoped.*, 'spam'::text from scoped
  where scoped.is_spam_folder or scoped.is_spam
  union all
  select scoped.*, 'trash'::text from scoped
  where scoped.is_trash
  union all
  select
    scoped.*,
    'folder:' || membership."CommMessageFolder_FolderID"::text
  from scoped
  join public."Comm_MessageFolders" as membership
    on membership."CommMessageFolder_MessageID" = scoped.message_id
),
grouped as (
  select
    thread_id,
    mailbox_id,
    slice_key,
    (array_agg(message_id order by occurred_at desc, message_id desc))[1] as latest_message_id,
    max(occurred_at) as last_message_at,
    count(*)::integer as message_count,
    bool_or(has_attachments) as has_attachments
  from message_slices
  group by thread_id, mailbox_id, slice_key
)
insert into public."Comm_InboxThreadSlices" (
  "CommInboxSlice_ThreadID",
  "CommInboxSlice_MailboxID",
  "CommInboxSlice_Key",
  "CommInboxSlice_LatestMessageID",
  "CommInboxSlice_LastMessageAt",
  "CommInboxSlice_MessageCount",
  "CommInboxSlice_HasAttachments",
  "CommInboxSlice_UpdatedAt"
)
select
  grouped.thread_id,
  grouped.mailbox_id,
  grouped.slice_key,
  grouped.latest_message_id,
  grouped.last_message_at,
  grouped.message_count,
  grouped.has_attachments,
  now()
from grouped
on conflict (
  "CommInboxSlice_ThreadID",
  "CommInboxSlice_MailboxID",
  "CommInboxSlice_Key"
) do update set
  "CommInboxSlice_LatestMessageID" = excluded."CommInboxSlice_LatestMessageID",
  "CommInboxSlice_LastMessageAt" = excluded."CommInboxSlice_LastMessageAt",
  "CommInboxSlice_MessageCount" = excluded."CommInboxSlice_MessageCount",
  "CommInboxSlice_HasAttachments" = excluded."CommInboxSlice_HasAttachments",
  "CommInboxSlice_UpdatedAt" = excluded."CommInboxSlice_UpdatedAt";

drop trigger if exists "TR_Comm_Messages_inbox_thread_slices" on public."Comm_Messages";
create trigger "TR_Comm_Messages_inbox_thread_slices"
after insert or delete or update of
  "CommMessage_ThreadID",
  "CommMessage_MailboxID",
  "CommMessage_StatusCode",
  "CommMessage_MessageDate",
  "CommMessage_ReceivedAt",
  "CommMessage_SentAt",
  "CommMessage_HasAttachments",
  "CommMessage_IsInbound",
  "CommMessage_IsDraft",
  "CommMessage_IsSpam",
  "CommMessage_IsDeleted"
on public."Comm_Messages"
for each row execute function public._comm_inbox_refresh_slices_from_message();

drop trigger if exists "TR_Comm_MessageFolders_inbox_thread_slices" on public."Comm_MessageFolders";
create trigger "TR_Comm_MessageFolders_inbox_thread_slices"
after insert or update or delete on public."Comm_MessageFolders"
for each row execute function public._comm_inbox_refresh_slices_from_membership();

drop trigger if exists "TR_Comm_MailFolders_inbox_thread_slices" on public."Comm_MailFolders";
create trigger "TR_Comm_MailFolders_inbox_thread_slices"
after update of "CommMailFolder_RoleCode", "CommMailFolder_MailboxID"
on public."Comm_MailFolders"
for each row execute function public._comm_inbox_refresh_slices_from_folder();

create or replace function public.comm_inbox_thread_slice_page(
  p_user_id uuid,
  p_mailbox_id uuid,
  p_folder text,
  p_provider_folder_id uuid,
  p_limit integer,
  p_after_at timestamptz,
  p_after_thread_id uuid
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
  v_folder text := lower(coalesce(nullif(trim(p_folder), ''), 'inbox'));
  v_slice_key text;
  v_result jsonb;
begin
  if (p_after_at is null) <> (p_after_thread_id is null) then
    return jsonb_build_object(
      'permissionGranted', true,
      'mailboxFound', true,
      'folderValid', true,
      'cursorValid', false,
      'items', '[]'::jsonb
    );
  end if;

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
    return jsonb_build_object('permissionGranted', false, 'mailboxFound', false, 'items', '[]'::jsonb);
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
    return jsonb_build_object('permissionGranted', true, 'mailboxFound', false, 'items', '[]'::jsonb);
  end if;

  if p_provider_folder_id is not null then
    if not exists (
      select 1
      from public."Comm_MailFolders" as folder
      where folder."CommMailFolder_ID" = p_provider_folder_id
        and folder."CommMailFolder_MailboxID" = p_mailbox_id
        and folder."CommMailFolder_CanHoldMessages"
        and not folder."CommMailFolder_IsHidden"
    ) then
      return jsonb_build_object(
        'permissionGranted', true,
        'mailboxFound', true,
        'folderValid', false,
        'items', '[]'::jsonb
      );
    end if;
    v_slice_key := 'folder:' || p_provider_folder_id::text;
  else
    if v_folder not in ('inbox', 'sent', 'archive', 'all', 'spam', 'trash', 'deleted') then
      return jsonb_build_object(
        'permissionGranted', true,
        'mailboxFound', true,
        'folderValid', false,
        'items', '[]'::jsonb
      );
    end if;
    v_slice_key := case
      when v_folder = 'archive' then 'all'
      when v_folder = 'deleted' then 'trash'
      else v_folder
    end;
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
    return jsonb_build_object('permissionGranted', true, 'mailboxFound', false, 'items', '[]'::jsonb);
  end if;

  with candidates as materialized (
    select
      slice."CommInboxSlice_ThreadID" as thread_id,
      slice."CommInboxSlice_LastMessageAt" as last_message_at,
      coalesce(state."CommRead_ReadAt", '-infinity'::timestamptz) as read_at,
      coalesce(state."CommRead_IsArchived", false) as is_archived,
      coalesce(state."CommRead_IsStarred", false) as is_starred
    from public."Comm_InboxThreadSlices" as slice
    left join public."Comm_ReadStates" as state
      on state."CommRead_ThreadID" = slice."CommInboxSlice_ThreadID"
     and state."CommRead_UserID" = p_user_id
     and state."CommRead_MessageID" is null
    where slice."CommInboxSlice_MailboxID" = p_mailbox_id
      and slice."CommInboxSlice_Key" = v_slice_key
      and (
        p_provider_folder_id is not null
        or v_folder <> 'inbox'
        or not coalesce(state."CommRead_IsArchived", false)
      )
      and (
        p_provider_folder_id is not null
        or v_folder <> 'archive'
        or coalesce(state."CommRead_IsArchived", false)
      )
      and (
        p_after_at is null
        or slice."CommInboxSlice_LastMessageAt" < p_after_at
        or (
          slice."CommInboxSlice_LastMessageAt" = p_after_at
          and slice."CommInboxSlice_ThreadID" > p_after_thread_id
        )
      )
    order by
      slice."CommInboxSlice_LastMessageAt" desc,
      slice."CommInboxSlice_ThreadID"
    limit v_limit + 1
  ),
  visible as materialized (
    select candidates.*
    from candidates
    order by candidates.last_message_at desc, candidates.thread_id
    limit v_limit
  ),
  message_scope as materialized (
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
      message."CommMessage_CreatedBy" as created_by,
      message."CommMessage_StatusCode" as status_code,
      message."CommMessage_IsInbound" as is_inbound,
      message."CommMessage_IsDraft" as is_draft,
      message."CommMessage_IsSpam" as is_spam,
      message."CommMessage_HasAttachments" as has_attachments,
      visible.read_at,
      visible.is_archived,
      visible.is_starred,
      coalesce(folder_roles.roles, '{}'::text[]) as folder_roles
    from visible
    join public."Comm_Messages" as message
      on message."CommMessage_ThreadID" = visible.thread_id
     and message."CommMessage_MailboxID" = p_mailbox_id
     and not message."CommMessage_IsDeleted"
    left join lateral (
      select array_agg(distinct folder."CommMailFolder_RoleCode")
        filter (where folder."CommMailFolder_RoleCode" is not null) as roles
      from public."Comm_MessageFolders" as membership
      join public."Comm_MailFolders" as folder
        on folder."CommMailFolder_ID" = membership."CommMessageFolder_FolderID"
      where membership."CommMessageFolder_MessageID" = message."CommMessage_ID"
    ) as folder_roles on true
    where case
      when p_provider_folder_id is not null then exists (
        select 1
        from public."Comm_MessageFolders" as membership
        where membership."CommMessageFolder_MessageID" = message."CommMessage_ID"
          and membership."CommMessageFolder_FolderID" = p_provider_folder_id
      )
      when v_folder = 'inbox' then
        ('inbox' = any(coalesce(folder_roles.roles, '{}'::text[]))
          or (cardinality(coalesce(folder_roles.roles, '{}'::text[])) = 0 and message."CommMessage_IsInbound"))
        and not message."CommMessage_IsDraft"
      when v_folder = 'sent' then
        'sent' = any(coalesce(folder_roles.roles, '{}'::text[]))
        or (
          cardinality(coalesce(folder_roles.roles, '{}'::text[])) = 0
          and not message."CommMessage_IsInbound"
          and message."CommMessage_StatusCode" = 'sent'
        )
      when v_folder = 'spam' then
        'spam' = any(coalesce(folder_roles.roles, '{}'::text[]))
        or message."CommMessage_IsSpam"
      when v_folder in ('trash', 'deleted') then
        'trash' = any(coalesce(folder_roles.roles, '{}'::text[]))
      else true
    end
  ),
  page_threads as materialized (
    select
      message_scope.thread_id,
      (array_agg(message_scope.message_id order by message_scope.occurred_at desc, message_scope.message_id desc))[1] as latest_message_id,
      max(message_scope.occurred_at) as last_message_at,
      count(*)::integer as message_count,
      count(*) filter (
        where message_scope.is_inbound and message_scope.occurred_at > message_scope.read_at
      )::integer as unread_count,
      bool_or(message_scope.has_attachments) as has_attachments,
      bool_or(message_scope.is_starred) as is_starred,
      bool_or(message_scope.is_archived) as is_archived
    from message_scope
    group by message_scope.thread_id
  )
  select jsonb_build_object(
    'permissionGranted', true,
    'mailboxFound', true,
    'folderValid', true,
    'cursorValid', true,
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'threadId', page_threads.thread_id,
          'mailboxId', latest."CommMessage_MailboxID",
          'provider', v_provider,
          'subject', latest."CommMessage_Subject",
          'preview', latest."CommMessage_BodyPreview",
          'lastMessageAt', page_threads.last_message_at,
          'unreadCount', page_threads.unread_count,
          'messageCount', page_threads.message_count,
          'hasAttachments', page_threads.has_attachments,
          'starred', page_threads.is_starred,
          'archived', page_threads.is_archived,
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
              where thread_message.thread_id = page_threads.thread_id
              order by recipient."CommRecipient_NormalizedAddress"
              limit 8
            ) as participant
          ), '[]'::jsonb),
          'summary', (
            select to_jsonb(summary)
            from public."Comm_ThreadSummaries" as summary
            where summary."CommThreadSummary_ThreadID" = page_threads.thread_id
              and summary."CommThreadSummary_SupersededAt" is null
            order by summary."CommThreadSummary_GeneratedAt" desc
            limit 1
          )
        )
        order by visible.last_message_at desc, visible.thread_id
      )
      from visible
      join page_threads on page_threads.thread_id = visible.thread_id
      join public."Comm_Messages" as latest
        on latest."CommMessage_ID" = page_threads.latest_message_id
    ), '[]'::jsonb),
    'hasMore', (select count(*) > v_limit from candidates),
    'nextLastMessageAt', case
      when (select count(*) > v_limit from candidates)
        then (select visible.last_message_at from visible order by visible.last_message_at, visible.thread_id desc limit 1)
      else null
    end,
    'nextThreadId', case
      when (select count(*) > v_limit from candidates)
        then (select visible.thread_id from visible order by visible.last_message_at, visible.thread_id desc limit 1)
      else null
    end
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.comm_inbox_thread_slice_page(
  uuid, uuid, text, uuid, integer, timestamptz, uuid
) from public, anon, authenticated;
grant execute on function public.comm_inbox_thread_slice_page(
  uuid, uuid, text, uuid, integer, timestamptz, uuid
) to service_role;

comment on function public.comm_inbox_thread_slice_page(
  uuid, uuid, text, uuid, integer, timestamptz, uuid
) is 'Service-role-only keyset Inbox page. Preserves mailbox ACL, folder and per-user read-state semantics while hydrating only visible threads.';

-- This is an internal read-path replacement with identical Inbox and Dexter
-- email capability semantics. It creates no new write action or watch signal,
-- so Dexter chat and event-driven Watching for you require no parity change.

commit;
