-- Keep the tenant Inbox fast and bounded without turning Multideck into a
-- second attachment archive. Provider mail is retained for twelve calendar
-- months, while Spam and Trash are retained for thirty days. Drafts remain
-- until the provider reports their deletion.

begin;

alter table public."Comm_Mailboxes"
  add column if not exists "CommMailbox_RetentionPurgedAt" timestamptz,
  add column if not exists "CommMailbox_RetentionPurgedCount" bigint not null default 0,
  add column if not exists "CommMailbox_RetentionCompactedAt" timestamptz,
  add column if not exists "CommMailbox_RetentionCompactedCount" bigint not null default 0,
  add column if not exists "CommMailbox_RetentionError" text;

comment on column public."Comm_Mailboxes"."CommMailbox_RetentionPurgedAt" is
  'Last successful bounded provider-mail retention pass.';

-- Imported documents already retain their own stored object and evidence
-- snapshot. Expiring the source email must not delete or block that durable
-- customer record.
alter table public."CRM_CustomerDocuments"
  alter column "CRMCustomerDocument_SourceMessageID" drop not null,
  alter column "CRMCustomerDocument_SourceAttachmentID" drop not null;

do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select constraint_name
    from information_schema.constraint_column_usage
    where table_schema = 'public'
      and table_name = 'CRM_CustomerDocuments'
      and column_name in (
        'CRMCustomerDocument_SourceMessageID',
        'CRMCustomerDocument_SourceAttachmentID'
      )
  loop
    execute format(
      'alter table public."CRM_CustomerDocuments" drop constraint if exists %I',
      v_constraint.constraint_name
    );
  end loop;
end;
$$;

alter table public."CRM_CustomerDocuments"
  add constraint "FK_CRMCustomerDocuments_source_message"
    foreign key ("CRMCustomerDocument_SourceMessageID")
    references public."Comm_Messages"("CommMessage_ID") on delete set null,
  add constraint "FK_CRMCustomerDocuments_source_attachment"
    foreign key ("CRMCustomerDocument_SourceAttachmentID")
    references public."Comm_MessageAttachments"("CommAttachment_ID") on delete set null;

create index if not exists "IX_Comm_Messages_provider_retention"
  on public."Comm_Messages" (
    "CommMessage_MailboxID",
    (coalesce(
      "CommMessage_MessageDate",
      "CommMessage_ReceivedAt",
      "CommMessage_SentAt",
      "CommMessage_CreatedAt"
    )),
    "CommMessage_ID"
  )
  where "CommMessage_SourceTypeCode" = 'provider_sync'
    and not "CommMessage_IsDraft"
    and not "CommMessage_IsDeleted";

-- Split the indexed email document into independently maintained sections.
-- Recipient/attachment changes can then refresh their own terms without
-- replacing the fuller body vector with the compact display fallback.
alter table public."AI_DexterEmailSearchDocuments"
  add column if not exists "AIDexterEmailSearch_SubjectDocument" tsvector not null default ''::tsvector,
  add column if not exists "AIDexterEmailSearch_ParticipantDocument" tsvector not null default ''::tsvector,
  add column if not exists "AIDexterEmailSearch_BodyDocument" tsvector not null default ''::tsvector,
  add column if not exists "AIDexterEmailSearch_AttachmentDocument" tsvector not null default ''::tsvector,
  add column if not exists "AIDexterEmailSearch_IsSegmented" boolean not null default false;

drop trigger if exists "TR_Comm_Messages_dexter_email_search" on public."Comm_Messages";
drop trigger if exists "TR_Comm_MessageRecipients_dexter_email_search" on public."Comm_MessageRecipients";
drop trigger if exists "TR_Comm_MessageAttachments_dexter_email_search" on public."Comm_MessageAttachments";

create or replace function public._multideck_compose_dexter_email_search_document(
  p_message_id uuid
)
returns void
language sql
volatile
security definer
set search_path = pg_catalog, public
as $$
  update public."AI_DexterEmailSearchDocuments"
  set "AIDexterEmailSearch_Document" =
        "AIDexterEmailSearch_SubjectDocument" ||
        "AIDexterEmailSearch_ParticipantDocument" ||
        "AIDexterEmailSearch_BodyDocument" ||
        "AIDexterEmailSearch_AttachmentDocument",
      "AIDexterEmailSearch_UpdatedAt" = now()
  where "AIDexterEmailSearch_MessageID" = p_message_id
    and "AIDexterEmailSearch_IsSegmented";
$$;

create or replace function public._multideck_refresh_dexter_email_message_document(
  p_message_id uuid,
  p_body_text text default null
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
    "AIDexterEmailSearch_SubjectDocument",
    "AIDexterEmailSearch_BodyDocument",
    "AIDexterEmailSearch_IsSegmented"
  )
  select
    message."CommMessage_ID",
    ''::tsvector,
    setweight(to_tsvector('simple'::regconfig, coalesce(message."CommMessage_Subject", '')), 'A'),
    setweight(to_tsvector(
      'simple'::regconfig,
      left(
        coalesce(message."CommMessage_BodyPreview", '') || ' ' ||
        coalesce(p_body_text, message."CommMessage_BodyText", ''),
        512000
      )
    ), 'C'),
    true
  from public."Comm_Messages" message
  where message."CommMessage_ID" = p_message_id
  on conflict ("AIDexterEmailSearch_MessageID") do update
  set
    "AIDexterEmailSearch_SubjectDocument" = excluded."AIDexterEmailSearch_SubjectDocument",
    "AIDexterEmailSearch_BodyDocument" = excluded."AIDexterEmailSearch_BodyDocument",
    "AIDexterEmailSearch_IsSegmented" = true;

  perform public._multideck_compose_dexter_email_search_document(p_message_id);
end;
$$;

create or replace function public._multideck_refresh_dexter_email_participant_document(
  p_message_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
begin
  update public."AI_DexterEmailSearchDocuments"
  set "AIDexterEmailSearch_ParticipantDocument" = setweight(
    to_tsvector('simple'::regconfig, coalesce((
      select string_agg(
        coalesce(recipient."CommRecipient_Address", '') || ' ' ||
        coalesce(recipient."CommRecipient_NormalizedAddress", '') || ' ' ||
        coalesce(recipient."CommRecipient_DisplayNameSnapshot", ''),
        ' '
      )
      from public."Comm_MessageRecipients" recipient
      where recipient."CommRecipient_MessageID" = p_message_id
    ), '')),
    'B'
  )
  where "AIDexterEmailSearch_MessageID" = p_message_id;

  perform public._multideck_compose_dexter_email_search_document(p_message_id);
end;
$$;

create or replace function public._multideck_refresh_dexter_email_attachment_document(
  p_message_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
begin
  update public."AI_DexterEmailSearchDocuments"
  set "AIDexterEmailSearch_AttachmentDocument" = setweight(
    to_tsvector('simple'::regconfig, coalesce((
      select string_agg(
        regexp_replace(coalesce(attachment."CommAttachment_FileName", ''), '[^[:alnum:]@]+', ' ', 'g'),
        ' '
      )
      from public."Comm_MessageAttachments" attachment
      where attachment."CommAttachment_MessageID" = p_message_id
        and not attachment."CommAttachment_IsInline"
    ), '')),
    'B'
  )
  where "AIDexterEmailSearch_MessageID" = p_message_id;

  perform public._multideck_compose_dexter_email_search_document(p_message_id);
end;
$$;

-- Compatibility rebuild used by existing recovery/admin paths.
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
  if not exists (
    select 1 from public."Comm_Messages"
    where "CommMessage_ID" = p_message_id
  ) then
    delete from public."AI_DexterEmailSearchDocuments"
    where "AIDexterEmailSearch_MessageID" = p_message_id;
    return;
  end if;

  perform public._multideck_refresh_dexter_email_message_document(p_message_id, null);
  perform public._multideck_refresh_dexter_email_participant_document(p_message_id);
  perform public._multideck_refresh_dexter_email_attachment_document(p_message_id);
end;
$$;

create or replace function public.multideck_index_dexter_email_body(
  p_message_id uuid,
  p_body_text text
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
begin
  if not exists (
    select 1 from public."Comm_Messages"
    where "CommMessage_ID" = p_message_id
      and "CommMessage_SourceTypeCode" = 'provider_sync'
  ) then
    raise exception 'The provider email does not exist.' using errcode = '22023';
  end if;

  perform public._multideck_refresh_dexter_email_message_document(
    p_message_id,
    left(coalesce(p_body_text, ''), 512000)
  );
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
  perform public._multideck_refresh_dexter_email_message_document(new."CommMessage_ID", null);
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
    perform public._multideck_refresh_dexter_email_participant_document(v_old_message_id);
  end if;
  if v_new_message_id is not null and v_new_message_id is distinct from v_old_message_id then
    perform public._multideck_refresh_dexter_email_participant_document(v_new_message_id);
  end if;
  return null;
end;
$$;

create or replace function public._multideck_refresh_dexter_email_search_from_attachment()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_old_message_id uuid := case when tg_op in ('UPDATE', 'DELETE') then old."CommAttachment_MessageID" else null end;
  v_new_message_id uuid := case when tg_op in ('INSERT', 'UPDATE') then new."CommAttachment_MessageID" else null end;
begin
  if v_old_message_id is not null then
    perform public._multideck_refresh_dexter_email_attachment_document(v_old_message_id);
  end if;
  if v_new_message_id is not null and v_new_message_id is distinct from v_old_message_id then
    perform public._multideck_refresh_dexter_email_attachment_document(v_new_message_id);
  end if;
  return null;
end;
$$;

create trigger "TR_Comm_Messages_dexter_email_search"
after insert or update of
  "CommMessage_Subject",
  "CommMessage_BodyPreview",
  "CommMessage_BodyText"
on public."Comm_Messages"
for each row execute function public._multideck_refresh_dexter_email_search_from_message();

create trigger "TR_Comm_MessageRecipients_dexter_email_search"
after insert or update of
  "CommRecipient_MessageID",
  "CommRecipient_Address",
  "CommRecipient_NormalizedAddress",
  "CommRecipient_DisplayNameSnapshot"
or delete on public."Comm_MessageRecipients"
for each row execute function public._multideck_refresh_dexter_email_search_from_recipient();

create trigger "TR_Comm_MessageAttachments_dexter_email_search"
after insert or update of
  "CommAttachment_MessageID",
  "CommAttachment_FileName",
  "CommAttachment_IsInline"
or delete on public."Comm_MessageAttachments"
for each row execute function public._multideck_refresh_dexter_email_search_from_attachment();

-- Retention and provider-deletion maintenance must not manufacture Watch
-- signals while cascading recipient/attachment rows are removed.
create or replace function public._multideck_dexter_watch_email_source_change()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_message_id uuid;
begin
  if current_setting('multideck.retention_cleanup', true) = 'on' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_table_name = 'Comm_Messages' then
    v_message_id := case when tg_op = 'DELETE' then old."CommMessage_ID" else new."CommMessage_ID" end;
  elsif tg_table_name = 'Comm_MessageRecipients' then
    if coalesce(new."CommRecipient_RecipientTypeCode", old."CommRecipient_RecipientTypeCode") <> 'from' then
      if tg_op = 'DELETE' then return old; else return new; end if;
    end if;
    v_message_id := case when tg_op = 'DELETE' then old."CommRecipient_MessageID" else new."CommRecipient_MessageID" end;
  elsif tg_table_name = 'Comm_MessageAttachments' then
    v_message_id := case when tg_op = 'DELETE' then old."CommAttachment_MessageID" else new."CommAttachment_MessageID" end;
  end if;
  if v_message_id is not null then
    perform public._multideck_dexter_emit_email_watch_signal(v_message_id);
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public._multideck_refresh_retained_email_threads(
  p_thread_ids uuid[]
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_thread_id uuid;
  v_latest public."Comm_Messages";
begin
  foreach v_thread_id in array coalesce(p_thread_ids, '{}'::uuid[])
  loop
    select message.* into v_latest
    from public."Comm_Messages" message
    where message."CommMessage_ThreadID" = v_thread_id
      and not message."CommMessage_IsDeleted"
    order by coalesce(
      message."CommMessage_MessageDate",
      message."CommMessage_ReceivedAt",
      message."CommMessage_SentAt",
      message."CommMessage_CreatedAt"
    ) desc, message."CommMessage_ID" desc
    limit 1;

    if found then
      update public."Comm_Threads"
      set "CommThread_LastMessageID" = v_latest."CommMessage_ID",
          "CommThread_LastMessageAt" = coalesce(
            v_latest."CommMessage_MessageDate",
            v_latest."CommMessage_ReceivedAt",
            v_latest."CommMessage_SentAt",
            v_latest."CommMessage_CreatedAt"
          ),
          "CommThread_Subject" = coalesce(v_latest."CommMessage_Subject", "CommThread_Subject"),
          "CommThread_IsDeleted" = false,
          "CommThread_UpdatedAt" = now()
      where "CommThread_ID" = v_thread_id;
    else
      update public."Comm_Threads"
      set "CommThread_LastMessageID" = null,
          "CommThread_LastMessageAt" = null,
          "CommThread_IsDeleted" = case
            when "CommThread_SourceTypeCode" = 'provider_sync' then true
            else "CommThread_IsDeleted"
          end,
          "CommThread_UpdatedAt" = now()
      where "CommThread_ID" = v_thread_id;
    end if;
  end loop;
end;
$$;

create or replace function public.comm_remove_provider_messages(
  p_mailbox_id uuid,
  p_provider_message_ids text[]
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_thread_ids uuid[];
  v_deleted integer := 0;
begin
  perform set_config('multideck.retention_cleanup', 'on', true);

  with deleted as (
    delete from public."Comm_Messages" message
    where message."CommMessage_MailboxID" = p_mailbox_id
      and message."CommMessage_SourceTypeCode" = 'provider_sync'
      and message."CommMessage_ProviderMessageID" = any(coalesce(p_provider_message_ids, '{}'::text[]))
    returning message."CommMessage_ThreadID"
  )
  select count(*), coalesce(array_agg(distinct "CommMessage_ThreadID"), '{}'::uuid[])
  into v_deleted, v_thread_ids
  from deleted;

  perform public._multideck_refresh_retained_email_threads(v_thread_ids);
  return jsonb_build_object('deleted', v_deleted);
end;
$$;

create or replace function public.comm_purge_expired_provider_mail(
  p_mailbox_id uuid,
  p_batch_size integer default 250
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_core_cutoff timestamptz := now() - interval '12 months';
  v_waste_cutoff timestamptz := now() - interval '30 days';
  v_thread_ids uuid[];
  v_deleted integer := 0;
begin
  if p_batch_size < 1 or p_batch_size > 1000 then
    raise exception 'Retention batch size must be between 1 and 1000.' using errcode = '22023';
  end if;

  perform set_config('multideck.retention_cleanup', 'on', true);

  with candidates as materialized (
    select
      message."CommMessage_ID",
      message."CommMessage_ThreadID"
    from public."Comm_Messages" message
    where message."CommMessage_MailboxID" = p_mailbox_id
      and message."CommMessage_SourceTypeCode" = 'provider_sync'
      and not message."CommMessage_IsDraft"
      and not message."CommMessage_IsDeleted"
      and (
        coalesce(
          message."CommMessage_MessageDate",
          message."CommMessage_ReceivedAt",
          message."CommMessage_SentAt",
          message."CommMessage_CreatedAt"
        ) < v_core_cutoff
        or (
          coalesce(
            message."CommMessage_MessageDate",
            message."CommMessage_ReceivedAt",
            message."CommMessage_SentAt",
            message."CommMessage_CreatedAt"
          ) < v_waste_cutoff
          and (
            message."CommMessage_IsSpam"
            or exists (
              select 1
              from public."Comm_MessageFolders" membership
              join public."Comm_MailFolders" folder
                on folder."CommMailFolder_ID" = membership."CommMessageFolder_FolderID"
              where membership."CommMessageFolder_MessageID" = message."CommMessage_ID"
                and folder."CommMailFolder_RoleCode" in ('spam', 'trash')
            )
          )
        )
      )
    order by coalesce(
      message."CommMessage_MessageDate",
      message."CommMessage_ReceivedAt",
      message."CommMessage_SentAt",
      message."CommMessage_CreatedAt"
    ), message."CommMessage_ID"
    limit p_batch_size
    for update of message skip locked
  ),
  deleted as (
    delete from public."Comm_Messages" message
    using candidates
    where message."CommMessage_ID" = candidates."CommMessage_ID"
    returning candidates."CommMessage_ThreadID"
  )
  select count(*), coalesce(array_agg(distinct "CommMessage_ThreadID"), '{}'::uuid[])
  into v_deleted, v_thread_ids
  from deleted;

  perform public._multideck_refresh_retained_email_threads(v_thread_ids);

  update public."Comm_Mailboxes"
  set "CommMailbox_RetentionPurgedAt" = now(),
      "CommMailbox_RetentionPurgedCount" = "CommMailbox_RetentionPurgedCount" + v_deleted,
      "CommMailbox_RetentionError" = null,
      "CommMailbox_UpdatedAt" = now()
  where "CommMailbox_ID" = p_mailbox_id;

  return jsonb_build_object(
    'deleted', v_deleted,
    'hasMore', v_deleted = p_batch_size,
    'coreCoverageStart', v_core_cutoff,
    'wasteCoverageStart', v_waste_cutoff
  );
end;
$$;

-- Existing retained rows are indexed from their full body before the duplicate
-- HTML text and provider headers are compacted. This is deliberately bounded;
-- the one-minute worker repeats it after expired rows have been drained.
create or replace function public.comm_compact_provider_mail(
  p_mailbox_id uuid,
  p_batch_size integer default 100
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_message record;
  v_compacted integer := 0;
begin
  if p_batch_size < 1 or p_batch_size > 500 then
    raise exception 'Compaction batch size must be between 1 and 500.' using errcode = '22023';
  end if;

  perform set_config('multideck.retention_cleanup', 'on', true);

  for v_message in
    select
      message."CommMessage_ID" as message_id,
      message."CommMessage_BodyText" as body_text
    from public."Comm_Messages" message
    left join public."AI_DexterEmailSearchDocuments" search_document
      on search_document."AIDexterEmailSearch_MessageID" = message."CommMessage_ID"
    where message."CommMessage_MailboxID" = p_mailbox_id
      and message."CommMessage_SourceTypeCode" = 'provider_sync'
      and not message."CommMessage_IsDeleted"
      and not coalesce(search_document."AIDexterEmailSearch_IsSegmented", false)
    order by message."CommMessage_CreatedAt", message."CommMessage_ID"
    limit p_batch_size
    for update of message skip locked
  loop
    update public."Comm_Messages"
    set "CommMessage_BodyText" = case
          when "CommMessage_ContentFormatCode" = 'html'
            then left("CommMessage_BodyText", 20000)
          else "CommMessage_BodyText"
        end,
        "CommMessage_HeaderJSON" = jsonb_strip_nulls(jsonb_build_object(
          'references', "CommMessage_HeaderJSON"->>'references',
          'in-reply-to', "CommMessage_HeaderJSON"->>'in-reply-to',
          'list-unsubscribe', "CommMessage_HeaderJSON"->>'list-unsubscribe',
          'list-unsubscribe-post', "CommMessage_HeaderJSON"->>'list-unsubscribe-post',
          'list-id', "CommMessage_HeaderJSON"->>'list-id',
          'auto-submitted', "CommMessage_HeaderJSON"->>'auto-submitted',
          'precedence', "CommMessage_HeaderJSON"->>'precedence'
        )),
        "CommMessage_UpdatedAt" = now()
    where "CommMessage_ID" = v_message.message_id;

    -- The BodyText update above fires the normal message trigger with the
    -- compact display copy. Restore the independently stored body vector from
    -- the full value held by this transaction before moving to the next row.
    perform public._multideck_refresh_dexter_email_message_document(
      v_message.message_id,
      left(coalesce(v_message.body_text, ''), 512000)
    );
    perform public._multideck_refresh_dexter_email_participant_document(v_message.message_id);
    perform public._multideck_refresh_dexter_email_attachment_document(v_message.message_id);

    v_compacted := v_compacted + 1;
  end loop;

  update public."Comm_Mailboxes"
  set "CommMailbox_RetentionCompactedAt" = now(),
      "CommMailbox_RetentionCompactedCount" = "CommMailbox_RetentionCompactedCount" + v_compacted,
      "CommMailbox_RetentionError" = null,
      "CommMailbox_UpdatedAt" = now()
  where "CommMailbox_ID" = p_mailbox_id;

  return jsonb_build_object(
    'compacted', v_compacted,
    'hasMore', v_compacted = p_batch_size
  );
end;
$$;

-- Attach retention coverage to Dexter results without duplicating the mature
-- permission, ranking and citation query.
alter function public.multideck_dexter_search_email(
  text[], text, timestamptz, timestamptz, integer, text, boolean
) rename to multideck_dexter_search_email_retained_internal;

revoke all on function public.multideck_dexter_search_email_retained_internal(
  text[], text, timestamptz, timestamptz, integer, text, boolean
) from public, anon, authenticated;

create function public.multideck_dexter_search_email(
  p_providers text[],
  p_query text,
  p_after timestamptz default null,
  p_before timestamptz default null,
  p_take integer default 10,
  p_sender text default null,
  p_has_attachment boolean default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_coverage_start timestamptz := now() - interval '12 months';
  v_result jsonb;
begin
  v_result := public.multideck_dexter_search_email_retained_internal(
    p_providers,
    p_query,
    p_after,
    p_before,
    p_take,
    p_sender,
    p_has_attachment
  );

  return coalesce(v_result, '{}'::jsonb) || jsonb_build_object(
    'coreCoverageStart', v_coverage_start,
    'outsideRetentionWindow',
      (p_before is not null and p_before <= v_coverage_start)
      or (p_after is not null and p_after < v_coverage_start)
  );
end;
$$;

revoke all on function public.multideck_dexter_search_email(
  text[], text, timestamptz, timestamptz, integer, text, boolean
) from public, anon;
grant execute on function public.multideck_dexter_search_email(
  text[], text, timestamptz, timestamptz, integer, text, boolean
) to authenticated;

revoke all on function public._multideck_compose_dexter_email_search_document(uuid) from public, anon, authenticated;
revoke all on function public._multideck_refresh_dexter_email_message_document(uuid, text) from public, anon, authenticated;
revoke all on function public._multideck_refresh_dexter_email_participant_document(uuid) from public, anon, authenticated;
revoke all on function public._multideck_refresh_dexter_email_attachment_document(uuid) from public, anon, authenticated;
revoke all on function public._multideck_refresh_dexter_email_search_document(uuid) from public, anon, authenticated;
revoke all on function public._multideck_refresh_dexter_email_search_from_message() from public, anon, authenticated;
revoke all on function public._multideck_refresh_dexter_email_search_from_recipient() from public, anon, authenticated;
revoke all on function public._multideck_refresh_dexter_email_search_from_attachment() from public, anon, authenticated;
revoke all on function public.multideck_index_dexter_email_body(uuid, text) from public, anon, authenticated;
grant execute on function public.multideck_index_dexter_email_body(uuid, text) to service_role;
revoke all on function public._multideck_refresh_retained_email_threads(uuid[]) from public, anon, authenticated;
revoke all on function public.comm_remove_provider_messages(uuid, text[]) from public, anon, authenticated;
grant execute on function public.comm_remove_provider_messages(uuid, text[]) to service_role;
revoke all on function public.comm_purge_expired_provider_mail(uuid, integer) from public, anon, authenticated;
grant execute on function public.comm_purge_expired_provider_mail(uuid, integer) to service_role;
revoke all on function public.comm_compact_provider_mail(uuid, integer) from public, anon, authenticated;
grant execute on function public.comm_compact_provider_mail(uuid, integer) to service_role;

-- Force one safe cursor restart so legacy full-mailbox cursors cannot continue
-- walking or reintroduce history outside the new window. Live sync remains
-- independent and continues to surface current messages during this backfill.
update public."Comm_Mailboxes"
set "CommMailbox_SyncCursor" = null,
    "CommMailbox_IndexStatus" = 'pending',
    "CommMailbox_IndexProcessedCount" = 0,
    "CommMailbox_IndexTotalEstimate" = null,
    "CommMailbox_IndexStartedAt" = null,
    "CommMailbox_IndexCompletedAt" = null,
    "CommMailbox_UpdatedAt" = now()
where not "CommMailbox_IsDeleted";

update public."Comm_MailFolders"
set "CommMailFolder_SyncCursor" = null,
    "CommMailFolder_UpdatedAt" = now()
where not "CommMailFolder_IsHidden"
  and "CommMailFolder_CanHoldMessages";

commit;
