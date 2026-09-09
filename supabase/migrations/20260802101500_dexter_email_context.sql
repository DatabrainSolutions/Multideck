-- Read-only Gmail and Outlook context for Agent Dexter.
--
-- Email bodies remain in the tenant's existing communications tables. These
-- functions expose only authenticated, permission-checked projections and do
-- not return provider credentials, raw HTML or attachment bytes.

begin;

update public."SEC_Permissions"
set "SECPerm_Name" = 'Use email with AI',
    "SECPerm_Description" = 'Allow Dexter and Inbox summaries to read authorised email content and selected attachments.'
where "SECPerm_Code" = 'Email.AIRead';

update public."sys_Permissions"
set "sys_Permission_Name" = 'Use email with AI',
    "sys_Permission_Description" = 'Allow Dexter and Inbox summaries to read authorised email content and selected attachments.'
where "sys_Permission_Value" = 'Email.AIRead';

-- The search projection always excludes deleted, draft and spam messages, so a
-- partial GIN index keeps the index smaller and matches the hot query exactly.
create index if not exists "IX_Comm_Messages_dexter_email_search"
  on public."Comm_Messages" using gin (
    to_tsvector(
      'simple'::regconfig,
      coalesce("CommMessage_Subject", '') || ' ' ||
      coalesce("CommMessage_BodyPreview", '') || ' ' ||
      coalesce("CommMessage_BodyText", '')
    )
  )
  where not "CommMessage_IsDeleted"
    and not "CommMessage_IsDraft"
    and not "CommMessage_IsSpam";

create index if not exists "IX_Comm_Messages_dexter_thread_page"
  on public."Comm_Messages" (
    "CommMessage_ThreadID",
    "CommMessage_MessageDate" desc,
    "CommMessage_ID" desc
  )
  where not "CommMessage_IsDeleted"
    and not "CommMessage_IsDraft"
    and not "CommMessage_IsSpam";

create index if not exists "IX_Comm_MessageRecipients_dexter_search"
  on public."Comm_MessageRecipients" (
    "CommRecipient_MessageID",
    "CommRecipient_NormalizedAddress"
  );

create or replace function public._multideck_dexter_has_permission(
  p_user_id uuid,
  p_permission text
)
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

create or replace function public._multideck_dexter_email_mailboxes(
  p_user_id uuid,
  p_company_id uuid
)
returns table(mailbox_id uuid, provider text)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with readable as (
    select access."CommMailboxAccess_MailboxID" as mailbox_id
    from public."Comm_MailboxAccess" access
    where access."CommMailboxAccess_UserID" = p_user_id
      and access."CommMailboxAccess_CanRead"
      and access."CommMailboxAccess_RevokedAt" is null
      and (
        access."CommMailboxAccess_ExpiresAt" is null
        or access."CommMailboxAccess_ExpiresAt" > now()
      )

    union

    select mailbox."CommMailbox_ID"
    from public."Comm_Mailboxes" mailbox
    join public."Comm_ProviderConnections" connection
      on connection."CommConn_ID" = mailbox."CommMailbox_ConnectionID"
     and connection."CommConn_UserID" = p_user_id
     and connection."CommConn_StatusCode" = 'active'
     and connection."CommConn_InboundEnabled"
     and not connection."CommConn_IsDeleted"
    where mailbox."CommMailbox_UserID" = p_user_id
      and mailbox."CommMailbox_TypeCode" = 'personal'
      and mailbox."CommMailbox_InboundEnabled"
      and not mailbox."CommMailbox_IsDeleted"
  )
  select distinct
    mailbox."CommMailbox_ID",
    case connection."CommConn_ProviderTypeCode"
      when 'google_workspace' then 'gmail'
      when 'microsoft_365' then 'outlook'
    end
  from readable
  join public."Comm_Mailboxes" mailbox
    on mailbox."CommMailbox_ID" = readable.mailbox_id
   and mailbox."CommMailbox_InboundEnabled"
   and not mailbox."CommMailbox_IsDeleted"
  join public."Comm_ProviderConnections" connection
    on connection."CommConn_ID" = mailbox."CommMailbox_ConnectionID"
   and connection."CommConn_StatusCode" = 'active'
   and connection."CommConn_InboundEnabled"
   and not connection."CommConn_IsDeleted"
  join public."cmp_Users" connection_owner
    on connection_owner."User_ID" = connection."CommConn_UserID"
   and connection_owner."Company_ID" = p_company_id
  where connection."CommConn_ProviderTypeCode" in ('google_workspace', 'microsoft_365');
$$;

create or replace function public.multideck_dexter_search_email(
  p_providers text[],
  p_query text,
  p_after timestamptz default null,
  p_before timestamptz default null,
  p_take integer default 10
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_context record;
  v_query text := left(btrim(coalesce(p_query, '')), 300);
  v_take integer := greatest(1, least(coalesce(p_take, 10), 20));
  v_providers text[];
  v_result jsonb;
begin
  select * into v_context from public._multideck_dexter_context();
  if not public._multideck_dexter_has_permission(v_context.user_id, 'Email.Read')
     or not public._multideck_dexter_has_permission(v_context.user_id, 'Email.AIRead') then
    raise exception 'You do not have permission to use email with Dexter.' using errcode = '42501';
  end if;

  select coalesce(array_agg(distinct lower(btrim(provider))), array[]::text[])
  into v_providers
  from unnest(coalesce(p_providers, array[]::text[])) provider
  where lower(btrim(provider)) in ('gmail', 'outlook');

  if cardinality(v_providers) = 0
     or cardinality(v_providers) <> cardinality(coalesce(p_providers, array[]::text[])) then
    raise exception 'Choose Gmail, Outlook, or both as the email source.' using errcode = '22023';
  end if;
  if v_query = '' then
    raise exception 'Enter an email search term.' using errcode = '22023';
  end if;
  if p_after is not null and p_before is not null and p_after >= p_before then
    raise exception 'The email search date range is invalid.' using errcode = '22023';
  end if;

  with permitted_mailboxes as materialized (
    select *
    from public._multideck_dexter_email_mailboxes(v_context.user_id, v_context.company_id)
    where provider = any(v_providers)
  ),
  parameters as (
    select
      websearch_to_tsquery('simple'::regconfig, v_query) as search_query,
      to_tsquery(
        'simple'::regconfig,
        replace(plainto_tsquery('simple'::regconfig, v_query)::text, ' & ', ' | ')
      ) as fallback_query
  ),
  candidates as (
    select
      message.*,
      permitted.provider,
      mailbox."CommMailbox_LastSyncedAt" as synced_at,
      coalesce(mailbox."CommMailbox_IndexStatus", 'pending') as index_status,
      setweight(to_tsvector('simple'::regconfig, coalesce(message."CommMessage_Subject", '')), 'A') ||
      setweight(to_tsvector('simple'::regconfig, coalesce(participants.participant_text, '')), 'B') ||
      setweight(to_tsvector(
        'simple'::regconfig,
        coalesce(message."CommMessage_BodyPreview", '') || ' ' ||
        coalesce(message."CommMessage_BodyText", '')
      ), 'C') as search_vector
    from public."Comm_Messages" message
    join permitted_mailboxes permitted
      on permitted.mailbox_id = message."CommMessage_MailboxID"
    join public."Comm_Mailboxes" mailbox
      on mailbox."CommMailbox_ID" = message."CommMessage_MailboxID"
    left join lateral (
      select string_agg(
        coalesce(recipient."CommRecipient_Address", '') || ' ' ||
        coalesce(recipient."CommRecipient_NormalizedAddress", '') || ' ' ||
        coalesce(recipient."CommRecipient_DisplayNameSnapshot", ''),
        ' '
      ) as participant_text
      from public."Comm_MessageRecipients" recipient
      where recipient."CommRecipient_MessageID" = message."CommMessage_ID"
    ) participants on true
  ),
  matches as (
    select
      candidate."CommMessage_ID" as message_id,
      candidate."CommMessage_ThreadID" as thread_id,
      candidate."CommMessage_MailboxID" as mailbox_id,
      candidate.provider,
      coalesce(nullif(candidate."CommMessage_Subject", ''), '(No subject)') as subject,
      left(coalesce(candidate."CommMessage_BodyPreview", candidate."CommMessage_BodyText", ''), 1000) as preview,
      coalesce(
        candidate."CommMessage_MessageDate",
        candidate."CommMessage_ReceivedAt",
        candidate."CommMessage_SentAt",
        candidate."CommMessage_CreatedAt"
      ) as occurred_at,
      candidate."CommMessage_HasAttachments" as has_attachments,
      candidate.synced_at,
      candidate.index_status,
      case
        when candidate.search_vector @@ parameters.search_query
          then 1 + ts_rank_cd(candidate.search_vector, parameters.search_query)
        else 0.35 + ts_rank_cd(candidate.search_vector, parameters.fallback_query)
      end as search_rank
    from candidates candidate
    cross join parameters
    where not candidate."CommMessage_IsDeleted"
      and not candidate."CommMessage_IsDraft"
      and not candidate."CommMessage_IsSpam"
      and (
        p_after is null
        or coalesce(
          candidate."CommMessage_MessageDate",
          candidate."CommMessage_ReceivedAt",
          candidate."CommMessage_SentAt",
          candidate."CommMessage_CreatedAt"
        ) >= p_after
      )
      and (
        p_before is null
        or coalesce(
          candidate."CommMessage_MessageDate",
          candidate."CommMessage_ReceivedAt",
          candidate."CommMessage_SentAt",
          candidate."CommMessage_CreatedAt"
        ) < p_before
      )
      and not exists (
        select 1
        from public."Comm_MessageFolders" membership
        join public."Comm_MailFolders" folder
          on folder."CommMailFolder_ID" = membership."CommMessageFolder_FolderID"
        where membership."CommMessageFolder_MessageID" = candidate."CommMessage_ID"
          and folder."CommMailFolder_RoleCode" in ('drafts', 'spam', 'trash')
      )
      and (
        candidate.search_vector @@ parameters.search_query
        or candidate.search_vector @@ parameters.fallback_query
      )
  ),
  thread_matches as (
    select distinct on (matches.thread_id)
      matches.*
    from matches
    order by matches.thread_id, matches.search_rank desc, matches.occurred_at desc, matches.message_id desc
  ),
  ordered as (
    select *
    from thread_matches
    order by search_rank desc, occurred_at desc, thread_id
    limit v_take + 1
  ),
  output_rows as (
    select jsonb_build_object(
      'threadId', ordered.thread_id,
      'matchMessageId', ordered.message_id,
      'mailboxId', ordered.mailbox_id,
      'provider', ordered.provider,
      'subject', ordered.subject,
      'preview', ordered.preview,
      'occurredAt', ordered.occurred_at,
      'hasAttachments', ordered.has_attachments,
      'syncedAt', ordered.synced_at,
      'indexStatus', ordered.index_status,
      'stale', ordered.synced_at is null
        or ordered.synced_at < now() - interval '30 minutes'
        or ordered.index_status = 'error',
      'participants', coalesce((
        select jsonb_agg(participant_row.value order by participant_row.sort_address)
        from (
          select distinct on (recipient."CommRecipient_NormalizedAddress")
            jsonb_build_object(
              'address', recipient."CommRecipient_Address",
              'displayName', recipient."CommRecipient_DisplayNameSnapshot",
              'role', recipient."CommRecipient_RecipientTypeCode"
            ) as value,
            recipient."CommRecipient_NormalizedAddress" as sort_address
          from public."Comm_MessageRecipients" recipient
          where recipient."CommRecipient_MessageID" = ordered.message_id
          order by recipient."CommRecipient_NormalizedAddress", recipient."CommRecipient_RecipientTypeCode"
        ) participant_row
      ), '[]'::jsonb),
      '_citation', jsonb_build_object(
        'title', ordered.subject,
        'url', '/inbox?provider=' || ordered.provider || '&mailbox=' || ordered.mailbox_id || '&thread=' || ordered.thread_id,
        'description', case ordered.provider when 'gmail' then 'Gmail email thread' else 'Outlook email thread' end
      )
    ) as value,
    ordered.search_rank,
    ordered.occurred_at,
    ordered.thread_id
    from ordered
    order by ordered.search_rank desc, ordered.occurred_at desc, ordered.thread_id
    limit v_take
  )
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(output_rows.value order by output_rows.search_rank desc, output_rows.occurred_at desc, output_rows.thread_id), '[]'::jsonb),
    'hasMore', (select count(*) from ordered) > v_take,
    'query', v_query
  )
  into v_result
  from output_rows;

  return coalesce(v_result, jsonb_build_object('items', '[]'::jsonb, 'hasMore', false, 'query', v_query));
end;
$$;

create or replace function public.multideck_dexter_read_email_thread(
  p_providers text[],
  p_thread_id uuid,
  p_before timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_context record;
  v_providers text[];
  v_mailbox_id uuid;
  v_provider text;
  v_subject text;
  v_synced_at timestamptz;
  v_index_status text;
  v_result jsonb;
begin
  select * into v_context from public._multideck_dexter_context();
  if not public._multideck_dexter_has_permission(v_context.user_id, 'Email.Read')
     or not public._multideck_dexter_has_permission(v_context.user_id, 'Email.AIRead') then
    raise exception 'You do not have permission to use email with Dexter.' using errcode = '42501';
  end if;

  select coalesce(array_agg(distinct lower(btrim(provider))), array[]::text[])
  into v_providers
  from unnest(coalesce(p_providers, array[]::text[])) provider
  where lower(btrim(provider)) in ('gmail', 'outlook');
  if cardinality(v_providers) = 0
     or cardinality(v_providers) <> cardinality(coalesce(p_providers, array[]::text[])) then
    raise exception 'Choose Gmail, Outlook, or both as the email source.' using errcode = '22023';
  end if;

  select
    message."CommMessage_MailboxID",
    permitted.provider,
    coalesce(nullif(message."CommMessage_Subject", ''), '(No subject)'),
    mailbox."CommMailbox_LastSyncedAt",
    coalesce(mailbox."CommMailbox_IndexStatus", 'pending')
  into v_mailbox_id, v_provider, v_subject, v_synced_at, v_index_status
  from public."Comm_Messages" message
  join public._multideck_dexter_email_mailboxes(v_context.user_id, v_context.company_id) permitted
    on permitted.mailbox_id = message."CommMessage_MailboxID"
   and permitted.provider = any(v_providers)
  join public."Comm_Mailboxes" mailbox
    on mailbox."CommMailbox_ID" = message."CommMessage_MailboxID"
  where message."CommMessage_ThreadID" = p_thread_id
    and not message."CommMessage_IsDeleted"
    and not message."CommMessage_IsDraft"
    and not message."CommMessage_IsSpam"
  order by coalesce(
    message."CommMessage_MessageDate",
    message."CommMessage_ReceivedAt",
    message."CommMessage_SentAt",
    message."CommMessage_CreatedAt"
  ) desc
  limit 1;

  if v_mailbox_id is null or exists (
    select 1
    from public."Comm_Messages" message
    where message."CommMessage_ThreadID" = p_thread_id
      and not message."CommMessage_IsDeleted"
      and not exists (
        select 1
        from public._multideck_dexter_email_mailboxes(v_context.user_id, v_context.company_id) permitted
        where permitted.mailbox_id = message."CommMessage_MailboxID"
          and permitted.provider = any(v_providers)
      )
  ) then
    raise exception 'This email thread was not found.' using errcode = 'P0002';
  end if;

  with eligible as (
    select
      message.*,
      coalesce(
        message."CommMessage_MessageDate",
        message."CommMessage_ReceivedAt",
        message."CommMessage_SentAt",
        message."CommMessage_CreatedAt"
      ) as occurred_at
    from public."Comm_Messages" message
    where message."CommMessage_ThreadID" = p_thread_id
      and message."CommMessage_MailboxID" = v_mailbox_id
      and not message."CommMessage_IsDeleted"
      and not message."CommMessage_IsDraft"
      and not message."CommMessage_IsSpam"
      and (
        p_before is null
        or coalesce(
          message."CommMessage_MessageDate",
          message."CommMessage_ReceivedAt",
          message."CommMessage_SentAt",
          message."CommMessage_CreatedAt"
        ) < p_before
      )
      and not exists (
        select 1
        from public."Comm_MessageFolders" membership
        join public."Comm_MailFolders" folder
          on folder."CommMailFolder_ID" = membership."CommMessageFolder_FolderID"
        where membership."CommMessageFolder_MessageID" = message."CommMessage_ID"
          and folder."CommMailFolder_RoleCode" in ('drafts', 'spam', 'trash')
      )
  ),
  newest as (
    select *
    from eligible
    order by occurred_at desc, "CommMessage_ID" desc
    limit 31
  ),
  page as (
    select *
    from newest
    order by occurred_at desc, "CommMessage_ID" desc
    limit 30
  ),
  message_rows as (
    select jsonb_build_object(
      'messageId', page."CommMessage_ID",
      'threadId', page."CommMessage_ThreadID",
      'mailboxId', page."CommMessage_MailboxID",
      'direction', case when page."CommMessage_IsInbound" then 'inbound' else 'outbound' end,
      'subject', coalesce(nullif(page."CommMessage_Subject", ''), '(No subject)'),
      'occurredAt', page.occurred_at,
      'bodyText', left(coalesce(page."CommMessage_BodyText", page."CommMessage_BodyPreview", ''), 12000),
      'bodyWasRedacted', page."CommMessage_IsBodyRedacted",
      'recipients', coalesce((
        select jsonb_agg(recipient_row.value order by recipient_row.sort_order, recipient_row.sort_address)
        from (
          select
            jsonb_build_object(
              'address', recipient."CommRecipient_Address",
              'displayName', recipient."CommRecipient_DisplayNameSnapshot",
              'role', recipient."CommRecipient_RecipientTypeCode"
            ) as value,
            case recipient."CommRecipient_RecipientTypeCode"
              when 'from' then 0 when 'to' then 1 when 'cc' then 2 else 3
            end as sort_order,
            recipient."CommRecipient_NormalizedAddress" as sort_address
          from public."Comm_MessageRecipients" recipient
          where recipient."CommRecipient_MessageID" = page."CommMessage_ID"
        ) recipient_row
      ), '[]'::jsonb),
      'attachments', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'attachmentId', attachment."CommAttachment_ID",
            'fileName', attachment."CommAttachment_FileName",
            'mimeType', attachment."CommAttachment_MimeType",
            'sizeBytes', attachment."CommAttachment_FileSizeBytes",
            '_citation', jsonb_build_object(
              'title', attachment."CommAttachment_FileName",
              'url', '/inbox?provider=' || v_provider || '&mailbox=' || v_mailbox_id || '&thread=' || p_thread_id,
              'description', 'Email attachment in ' || v_subject
            )
          )
          order by attachment."CommAttachment_CreatedAt", attachment."CommAttachment_ID"
        )
        from public."Comm_MessageAttachments" attachment
        where attachment."CommAttachment_MessageID" = page."CommMessage_ID"
          and not attachment."CommAttachment_IsInline"
      ), '[]'::jsonb),
      '_citation', jsonb_build_object(
        'title', v_subject,
        'url', '/inbox?provider=' || v_provider || '&mailbox=' || v_mailbox_id || '&thread=' || p_thread_id,
        'description', case v_provider when 'gmail' then 'Gmail email thread' else 'Outlook email thread' end
      )
    ) as value,
    page.occurred_at,
    page."CommMessage_ID" as message_id
    from page
  )
  select jsonb_build_object(
    'threadId', p_thread_id,
    'mailboxId', v_mailbox_id,
    'provider', v_provider,
    'subject', v_subject,
    'syncedAt', v_synced_at,
    'indexStatus', v_index_status,
    'stale', v_synced_at is null
      or v_synced_at < now() - interval '30 minutes'
      or v_index_status = 'error',
    'messages', coalesce(jsonb_agg(message_rows.value order by message_rows.occurred_at, message_rows.message_id), '[]'::jsonb),
    'hasMore', (select count(*) from newest) > 30,
    'nextCursor', case when (select count(*) from newest) > 30 then (select min(occurred_at) from page) else null end,
    '_citation', jsonb_build_object(
      'title', v_subject,
      'url', '/inbox?provider=' || v_provider || '&mailbox=' || v_mailbox_id || '&thread=' || p_thread_id,
      'description', case v_provider when 'gmail' then 'Gmail email thread' else 'Outlook email thread' end
    )
  )
  into v_result
  from message_rows;

  return coalesce(v_result, jsonb_build_object(
    'threadId', p_thread_id,
    'mailboxId', v_mailbox_id,
    'provider', v_provider,
    'subject', v_subject,
    'syncedAt', v_synced_at,
    'indexStatus', v_index_status,
    'stale', v_synced_at is null
      or v_synced_at < now() - interval '30 minutes'
      or v_index_status = 'error',
    'messages', '[]'::jsonb,
    'hasMore', false,
    'nextCursor', null,
    '_citation', jsonb_build_object(
      'title', v_subject,
      'url', '/inbox?provider=' || v_provider || '&mailbox=' || v_mailbox_id || '&thread=' || p_thread_id,
      'description', case v_provider when 'gmail' then 'Gmail email thread' else 'Outlook email thread' end
    )
  ));
end;
$$;

create or replace function public.multideck_dexter_resolve_email_attachment(
  p_providers text[],
  p_attachment_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_context record;
  v_providers text[];
  v_result jsonb;
begin
  select * into v_context from public._multideck_dexter_context();
  if not public._multideck_dexter_has_permission(v_context.user_id, 'Email.Read')
     or not public._multideck_dexter_has_permission(v_context.user_id, 'Email.AIRead') then
    raise exception 'You do not have permission to use email with Dexter.' using errcode = '42501';
  end if;

  select coalesce(array_agg(distinct lower(btrim(provider))), array[]::text[])
  into v_providers
  from unnest(coalesce(p_providers, array[]::text[])) provider
  where lower(btrim(provider)) in ('gmail', 'outlook');
  if cardinality(v_providers) = 0
     or cardinality(v_providers) <> cardinality(coalesce(p_providers, array[]::text[])) then
    raise exception 'Choose Gmail, Outlook, or both as the email source.' using errcode = '22023';
  end if;

  select jsonb_build_object(
    'attachmentId', attachment."CommAttachment_ID",
    'messageId', message."CommMessage_ID",
    'threadId', message."CommMessage_ThreadID",
    'mailboxId', message."CommMessage_MailboxID",
    'provider', permitted.provider,
    'subject', coalesce(nullif(message."CommMessage_Subject", ''), '(No subject)'),
    'fileName', attachment."CommAttachment_FileName",
    'mimeType', attachment."CommAttachment_MimeType",
    'sizeBytes', attachment."CommAttachment_FileSizeBytes",
    '_citation', jsonb_build_object(
      'title', attachment."CommAttachment_FileName",
      'url', '/inbox?provider=' || permitted.provider || '&mailbox=' || message."CommMessage_MailboxID" || '&thread=' || message."CommMessage_ThreadID",
      'description', 'Email attachment in ' || coalesce(nullif(message."CommMessage_Subject", ''), '(No subject)')
    )
  )
  into v_result
  from public."Comm_MessageAttachments" attachment
  join public."Comm_Messages" message
    on message."CommMessage_ID" = attachment."CommAttachment_MessageID"
  join public._multideck_dexter_email_mailboxes(v_context.user_id, v_context.company_id) permitted
    on permitted.mailbox_id = message."CommMessage_MailboxID"
   and permitted.provider = any(v_providers)
  where attachment."CommAttachment_ID" = p_attachment_id
    and not attachment."CommAttachment_IsInline"
    and not message."CommMessage_IsDeleted"
    and not message."CommMessage_IsDraft"
    and not message."CommMessage_IsSpam"
    and not exists (
      select 1
      from public."Comm_MessageFolders" membership
      join public."Comm_MailFolders" folder
        on folder."CommMailFolder_ID" = membership."CommMessageFolder_FolderID"
      where membership."CommMessageFolder_MessageID" = message."CommMessage_ID"
        and folder."CommMailFolder_RoleCode" in ('drafts', 'spam', 'trash')
    );

  if v_result is null then
    raise exception 'This email attachment was not found.' using errcode = 'P0002';
  end if;
  return v_result;
end;
$$;

revoke all on function public._multideck_dexter_has_permission(uuid, text) from public, anon, authenticated;
revoke all on function public._multideck_dexter_email_mailboxes(uuid, uuid) from public, anon, authenticated;
revoke all on function public.multideck_dexter_search_email(text[], text, timestamptz, timestamptz, integer) from public, anon;
revoke all on function public.multideck_dexter_read_email_thread(text[], uuid, timestamptz) from public, anon;
revoke all on function public.multideck_dexter_resolve_email_attachment(text[], uuid) from public, anon;

grant execute on function public.multideck_dexter_search_email(text[], text, timestamptz, timestamptz, integer) to authenticated;
grant execute on function public.multideck_dexter_read_email_thread(text[], uuid, timestamptz) to authenticated;
grant execute on function public.multideck_dexter_resolve_email_attachment(text[], uuid) to authenticated;

create or replace function public.multideck_dexter_conversation_email_context(
  p_conversation_id uuid,
  p_history_message_ids uuid[] default null
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
  if p_conversation_id is null then return '[]'::jsonb; end if;

  if not exists (
    select 1
    from public."AI_Conversations" conversation
    where conversation."AICNV_ID" = p_conversation_id
      and conversation."AICNV_CompanyID" = v_context.company_id
      and conversation."AICNV_OwnerUserID" = v_context.user_id
      and conversation."AICNV_Channel" = 'chat'
      and conversation."AICNV_EndedAt" is null
  ) then
    raise exception 'This conversation does not exist or is outside your workspace.' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(context_row.attachment order by context_row.created_at desc, context_row.ordinality), '[]'::jsonb)
  into v_result
  from (
    select attachment.value as attachment, message."AIMSG_CreatedAt" as created_at, attachment.ordinality
    from public."AI_Messages" message
    cross join lateral jsonb_array_elements(
      case
        when jsonb_typeof(message."AIMSG_ContentJSON" #> '{metadata,emailAttachments}') = 'array'
          then message."AIMSG_ContentJSON" #> '{metadata,emailAttachments}'
        else '[]'::jsonb
      end
    ) with ordinality attachment(value, ordinality)
    where message."AIMSG_ConversationID" = p_conversation_id
      and message."AIMSG_Role" = 'assistant'
      and (p_history_message_ids is null or message."AIMSG_ID" = any(p_history_message_ids))
      and jsonb_typeof(attachment.value) = 'object'
      and coalesce(attachment.value ->> 'id', '') ~ '^[0-9a-fA-F-]{36}$'
      and attachment.value ->> 'provider' in ('gmail', 'outlook')
    order by message."AIMSG_CreatedAt" desc, attachment.ordinality
    limit 5
  ) context_row;

  return v_result;
end;
$$;

revoke all on function public.multideck_dexter_conversation_email_context(uuid, uuid[]) from public, anon;
grant execute on function public.multideck_dexter_conversation_email_context(uuid, uuid[]) to authenticated;

-- Include server-validated email attachment references in saved assistant
-- messages. The bytes remain at the provider and are fetched again through the
-- authenticated Inbox Edge boundary only when the operator chooses View or
-- Download.
create or replace function public._multideck_dexter_conversation_json(
  p_conversation_id uuid,
  p_user_id uuid,
  p_company_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'id', conversation."AICNV_ID",
    'title', coalesce(conversation."AICNV_Title", 'Dexter conversation'),
    'summary', coalesce(conversation."AICNV_SummaryText", ''),
    'updatedAt', conversation."AICNV_UpdatedAt",
    'messages', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', message."AIMSG_ID",
          'role', message."AIMSG_Role",
          'content', message."AIMSG_ContentText",
          'createdAt', message."AIMSG_CreatedAt",
          'specialist', nullif(message."AIMSG_ContentJSON" ->> 'specialist', ''),
          'parentResponseMessageId', nullif(
            message."AIMSG_ContentJSON" #>> '{metadata,parentResponseMessageId}',
            ''
          ),
          'pendingAction', case
            when jsonb_typeof(message."AIMSG_ContentJSON" #> '{metadata,pendingAction}') = 'object'
              then message."AIMSG_ContentJSON" #> '{metadata,pendingAction}'
            else null
          end,
          'reasoningSummary', nullif(
            message."AIMSG_ContentJSON" #>> '{metadata,reasoningSummary}',
            ''
          ),
          'emailAttachments', case
            when jsonb_typeof(message."AIMSG_ContentJSON" #> '{metadata,emailAttachments}') = 'array'
              then message."AIMSG_ContentJSON" #> '{metadata,emailAttachments}'
            else '[]'::jsonb
          end,
          'responseToUserMessageId', nullif(
            message."AIMSG_ContentJSON" #>> '{metadata,responseToUserMessageId}',
            ''
          ),
          'responseVersion', case
            when coalesce(
              message."AIMSG_ContentJSON" #>> '{metadata,responseVersion}',
              ''
            ) ~ '^[1-9][0-9]*$'
              then (message."AIMSG_ContentJSON" #>> '{metadata,responseVersion}')::integer
            else null
          end
        )
        order by message."AIMSG_CreatedAt", message."AIMSG_ID"
      )
      from public."AI_Messages" message
      where message."AIMSG_ConversationID" = conversation."AICNV_ID"
        and message."AIMSG_ContentText" is not null
    ), '[]'::jsonb)
  )
  from public."AI_Conversations" conversation
  where conversation."AICNV_ID" = p_conversation_id
    and conversation."AICNV_CompanyID" = p_company_id
    and conversation."AICNV_OwnerUserID" = p_user_id
    and conversation."AICNV_Channel" = 'chat'
    and conversation."AICNV_EndedAt" is null
    and conversation."AICNV_DomainCode" in ('multideck', 'warehouse');
$$;

commit;
