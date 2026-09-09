-- Attachment names are identifying email evidence (for example an invoice or
-- booking reference). Index names only; attachment bytes remain private and
-- are still loaded through the bounded read_email_attachment tool.
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
    setweight(to_tsvector(
      'simple'::regconfig,
      coalesce(participants.participant_text, '') || ' ' ||
      coalesce(attachments.attachment_text, '')
    ), 'B') ||
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
  left join lateral (
    select string_agg(
      regexp_replace(coalesce(attachment."CommAttachment_FileName", ''), '[^[:alnum:]@]+', ' ', 'g'),
      ' '
    ) as attachment_text
    from public."Comm_MessageAttachments" attachment
    where attachment."CommAttachment_MessageID" = message."CommMessage_ID"
      and not attachment."CommAttachment_IsInline"
  ) attachments on true
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
    perform public._multideck_refresh_dexter_email_search_document(v_old_message_id);
  end if;
  if v_new_message_id is not null and v_new_message_id is distinct from v_old_message_id then
    perform public._multideck_refresh_dexter_email_search_document(v_new_message_id);
  end if;
  return null;
end;
$$;

drop trigger if exists "TR_Comm_MessageAttachments_dexter_email_search" on public."Comm_MessageAttachments";
create trigger "TR_Comm_MessageAttachments_dexter_email_search"
after insert or update of
  "CommAttachment_MessageID",
  "CommAttachment_FileName",
  "CommAttachment_IsInline"
or delete
on public."Comm_MessageAttachments"
for each row execute function public._multideck_refresh_dexter_email_search_from_attachment();

do $$
begin
  perform public._multideck_refresh_dexter_email_search_document(message."CommMessage_ID")
  from public."Comm_Messages" message
  where message."CommMessage_HasAttachments";
end;
$$;

revoke all on function public._multideck_refresh_dexter_email_search_document(uuid) from public, anon, authenticated;
revoke all on function public._multideck_refresh_dexter_email_search_from_attachment() from public, anon, authenticated;
