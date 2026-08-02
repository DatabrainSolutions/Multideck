-- Maintain one private, indexed search document per synced email message.
create table if not exists public."AI_DexterEmailSearchDocuments" (
  "AIDexterEmailSearch_MessageID" uuid primary key
    references public."Comm_Messages" ("CommMessage_ID") on delete cascade,
  "AIDexterEmailSearch_Document" tsvector not null,
  "AIDexterEmailSearch_UpdatedAt" timestamptz not null default now()
);

alter table public."AI_DexterEmailSearchDocuments" enable row level security;
revoke all on table public."AI_DexterEmailSearchDocuments" from public, anon, authenticated;

create or replace function public._multideck_refresh_dexter_email_search_document(
  p_message_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public."AI_DexterEmailSearchDocuments" (
    "AIDexterEmailSearch_MessageID",
    "AIDexterEmailSearch_Document",
    "AIDexterEmailSearch_UpdatedAt"
  )
  select
    message."CommMessage_ID",
    setweight(to_tsvector('simple'::regconfig, coalesce(message."CommMessage_Subject", '')), 'A') ||
    setweight(to_tsvector('simple'::regconfig, coalesce(participants.participant_text, '')), 'B') ||
    setweight(to_tsvector(
      'simple'::regconfig,
      coalesce(message."CommMessage_BodyPreview", '') || ' ' ||
      coalesce(message."CommMessage_BodyText", '')
    ), 'C'),
    now()
  from public."Comm_Messages" message
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
  where message."CommMessage_ID" = p_message_id
  on conflict ("AIDexterEmailSearch_MessageID") do update
  set
    "AIDexterEmailSearch_Document" = excluded."AIDexterEmailSearch_Document",
    "AIDexterEmailSearch_UpdatedAt" = excluded."AIDexterEmailSearch_UpdatedAt";

  if not found then
    delete from public."AI_DexterEmailSearchDocuments"
    where "AIDexterEmailSearch_MessageID" = p_message_id;
  end if;
end;
$$;

create or replace function public._multideck_refresh_dexter_email_search_from_message()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public._multideck_refresh_dexter_email_search_document(new."CommMessage_ID");
  return new;
end;
$$;

create or replace function public._multideck_refresh_dexter_email_search_from_recipient()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_old_message_id uuid := case when tg_op in ('UPDATE', 'DELETE') then old."CommRecipient_MessageID" else null end;
  v_new_message_id uuid := case when tg_op in ('INSERT', 'UPDATE') then new."CommRecipient_MessageID" else null end;
begin
  if v_old_message_id is not null then
    perform public._multideck_refresh_dexter_email_search_document(v_old_message_id);
  end if;
  if v_new_message_id is not null and v_new_message_id is distinct from v_old_message_id then
    perform public._multideck_refresh_dexter_email_search_document(v_new_message_id);
  end if;
  return null;
end;
$$;

drop trigger if exists "TR_Comm_Messages_dexter_email_search" on public."Comm_Messages";
create trigger "TR_Comm_Messages_dexter_email_search"
after insert or update of
  "CommMessage_Subject",
  "CommMessage_BodyPreview",
  "CommMessage_BodyText"
on public."Comm_Messages"
for each row execute function public._multideck_refresh_dexter_email_search_from_message();

drop trigger if exists "TR_Comm_MessageRecipients_dexter_email_search" on public."Comm_MessageRecipients";
create trigger "TR_Comm_MessageRecipients_dexter_email_search"
after insert or update of
  "CommRecipient_MessageID",
  "CommRecipient_Address",
  "CommRecipient_NormalizedAddress",
  "CommRecipient_DisplayNameSnapshot"
or delete
on public."Comm_MessageRecipients"
for each row execute function public._multideck_refresh_dexter_email_search_from_recipient();

insert into public."AI_DexterEmailSearchDocuments" (
  "AIDexterEmailSearch_MessageID",
  "AIDexterEmailSearch_Document",
  "AIDexterEmailSearch_UpdatedAt"
)
select
  message."CommMessage_ID",
  setweight(to_tsvector('simple'::regconfig, coalesce(message."CommMessage_Subject", '')), 'A') ||
  setweight(to_tsvector('simple'::regconfig, coalesce(participants.participant_text, '')), 'B') ||
  setweight(to_tsvector(
    'simple'::regconfig,
    coalesce(message."CommMessage_BodyPreview", '') || ' ' ||
    coalesce(message."CommMessage_BodyText", '')
  ), 'C'),
  now()
from public."Comm_Messages" message
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
on conflict ("AIDexterEmailSearch_MessageID") do update
set
  "AIDexterEmailSearch_Document" = excluded."AIDexterEmailSearch_Document",
  "AIDexterEmailSearch_UpdatedAt" = excluded."AIDexterEmailSearch_UpdatedAt";

create index if not exists "IX_AI_DexterEmailSearchDocuments_document"
  on public."AI_DexterEmailSearchDocuments"
  using gin ("AIDexterEmailSearch_Document");

revoke all on function public._multideck_refresh_dexter_email_search_document(uuid) from public, anon, authenticated;
revoke all on function public._multideck_refresh_dexter_email_search_from_message() from public, anon, authenticated;
revoke all on function public._multideck_refresh_dexter_email_search_from_recipient() from public, anon, authenticated;

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
      search_document."AIDexterEmailSearch_Document" as search_vector
    from public."Comm_Messages" message
    join permitted_mailboxes permitted
      on permitted.mailbox_id = message."CommMessage_MailboxID"
    join public."Comm_Mailboxes" mailbox
      on mailbox."CommMailbox_ID" = message."CommMessage_MailboxID"
    join public."AI_DexterEmailSearchDocuments" search_document
      on search_document."AIDexterEmailSearch_MessageID" = message."CommMessage_ID"
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
