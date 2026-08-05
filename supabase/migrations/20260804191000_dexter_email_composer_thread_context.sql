begin;

create or replace function public.multideck_dexter_resolve_email_compose_context(
  p_message_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_context record;
  v_source jsonb;
  v_thread_id uuid;
  v_messages jsonb;
begin
  select * into v_context from public._multideck_dexter_context();
  if not public._multideck_dexter_has_permission(v_context.user_id, 'Email.Read')
     or not public._multideck_dexter_has_permission(v_context.user_id, 'Email.AIRead') then
    raise exception 'You do not have permission to use email with Dexter.' using errcode = '42501';
  end if;

  v_source := public.multideck_dexter_resolve_email_draft_source(p_message_id);
  v_thread_id := nullif(v_source ->> 'threadId', '')::uuid;

  select coalesce(jsonb_agg(item.payload order by item.occurred_at, item.message_id), '[]'::jsonb)
    into v_messages
  from (
    select
      message."CommMessage_ID" message_id,
      coalesce(message."CommMessage_ReceivedAt", message."CommMessage_SentAt", message."CommMessage_MessageDate", message."CommMessage_CreatedAt") occurred_at,
      jsonb_build_object(
        'messageId', message."CommMessage_ID",
        'direction', message."CommMessage_DirectionCode",
        'occurredAt', coalesce(message."CommMessage_ReceivedAt", message."CommMessage_SentAt", message."CommMessage_MessageDate", message."CommMessage_CreatedAt"),
        'from', coalesce((
          select jsonb_agg(jsonb_build_object(
            'address', recipient."CommRecipient_Address",
            'displayName', recipient."CommRecipient_DisplayNameSnapshot"
          ) order by recipient."CommRecipient_CreatedAt", recipient."CommRecipient_ID")
          from public."Comm_MessageRecipients" recipient
          where recipient."CommRecipient_MessageID" = message."CommMessage_ID"
            and recipient."CommRecipient_RecipientTypeCode" = 'from'
            and not recipient."CommRecipient_IsSuppressed"
        ), '[]'::jsonb),
        'bodyText', left(coalesce(message."CommMessage_BodyText", message."CommMessage_BodyPreview", ''), 20000)
      ) payload
    from public."Comm_Messages" message
    join public._multideck_dexter_email_mailboxes(v_context.user_id, v_context.company_id) permitted
      on permitted.mailbox_id = message."CommMessage_MailboxID"
    where message."CommMessage_ThreadID" = v_thread_id
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
      )
    order by coalesce(message."CommMessage_ReceivedAt", message."CommMessage_SentAt", message."CommMessage_MessageDate", message."CommMessage_CreatedAt") desc
    limit 30
  ) item;

  return v_source || jsonb_build_object('messages', v_messages);
end;
$$;

revoke all on function public.multideck_dexter_resolve_email_compose_context(uuid)
  from public, anon;
grant execute on function public.multideck_dexter_resolve_email_compose_context(uuid)
  to authenticated;

comment on function public.multideck_dexter_resolve_email_compose_context(uuid) is
  'Returns the selected source plus a bounded tenant-safe thread transcript for the Inbox Dexter composer. This read capability already exists in Dexter chat; it creates no watchable record change.';

commit;
