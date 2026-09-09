-- Restore the server-only indexing RPC used by both interactive and scheduled
-- provider sync. Tenant projects provisioned before the indexed-search
-- migration can still have the original single-vector search table; keep this
-- compatibility implementation self-contained so message persistence cannot
-- stop halfway through.

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
  insert into public."AI_DexterEmailSearchDocuments" (
    "AIDexterEmailSearch_MessageID",
    "AIDexterEmailSearch_Document",
    "AIDexterEmailSearch_UpdatedAt"
  )
  select
    message."CommMessage_ID",
    setweight(
      to_tsvector(
        'simple'::regconfig,
        coalesce(message."CommMessage_Subject", '')
      ),
      'A'
    ) ||
    setweight(
      to_tsvector('simple'::regconfig, coalesce(participants.value, '')),
      'B'
    ) ||
    setweight(
      to_tsvector(
        'simple'::regconfig,
        left(
          coalesce(message."CommMessage_BodyPreview", '') || ' ' ||
          coalesce(p_body_text, message."CommMessage_BodyText", ''),
          512000
        )
      ),
      'C'
    ) ||
    setweight(
      to_tsvector('simple'::regconfig, coalesce(attachments.value, '')),
      'B'
    ),
    now()
  from public."Comm_Messages" message
  left join lateral (
    select string_agg(
      coalesce(recipient."CommRecipient_Address", '') || ' ' ||
      coalesce(recipient."CommRecipient_NormalizedAddress", '') || ' ' ||
      coalesce(recipient."CommRecipient_DisplayNameSnapshot", ''),
      ' '
    ) as value
    from public."Comm_MessageRecipients" recipient
    where recipient."CommRecipient_MessageID" = message."CommMessage_ID"
  ) participants on true
  left join lateral (
    select string_agg(
      regexp_replace(
        coalesce(attachment."CommAttachment_FileName", ''),
        '[^[:alnum:]@]+',
        ' ',
        'g'
      ),
      ' '
    ) as value
    from public."Comm_MessageAttachments" attachment
    where attachment."CommAttachment_MessageID" = message."CommMessage_ID"
      and not attachment."CommAttachment_IsInline"
  ) attachments on true
  where message."CommMessage_ID" = p_message_id
    and message."CommMessage_SourceTypeCode" = 'provider_sync'
  on conflict ("AIDexterEmailSearch_MessageID") do update
  set "AIDexterEmailSearch_Document" = excluded."AIDexterEmailSearch_Document",
      "AIDexterEmailSearch_UpdatedAt" = excluded."AIDexterEmailSearch_UpdatedAt";

  if not found then
    raise exception 'The provider email does not exist.' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.multideck_index_dexter_email_body(uuid, text)
  from public, anon, authenticated;
grant execute on function public.multideck_index_dexter_email_body(uuid, text)
  to service_role;

grant execute on function public._multideck_refresh_retained_email_threads(uuid[])
  to service_role;
