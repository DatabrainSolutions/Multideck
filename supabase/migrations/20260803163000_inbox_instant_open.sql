-- Keep the Inbox startup response small. Unread counts are calculated inside
-- Postgres and only the per-mailbox totals cross the Edge/PostgREST boundary.

begin;

create index if not exists "IX_Comm_Messages_mailbox_unread"
  on public."Comm_Messages" (
    "CommMessage_MailboxID",
    "CommMessage_ThreadID",
    (coalesce("CommMessage_ReceivedAt", "CommMessage_MessageDate", "CommMessage_CreatedAt"))
  )
  where "CommMessage_IsInbound"
    and not "CommMessage_IsDraft"
    and not "CommMessage_IsDeleted";

create or replace function public.comm_inbox_mailbox_unread_counts(
  p_user_id uuid,
  p_mailbox_ids uuid[]
)
returns table(mailbox_id uuid, unread_count bigint)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    message."CommMessage_MailboxID" as mailbox_id,
    count(*) filter (
      where coalesce(
        message."CommMessage_ReceivedAt",
        message."CommMessage_MessageDate",
        message."CommMessage_CreatedAt"
      ) > coalesce(state."CommRead_ReadAt", '-infinity'::timestamptz)
    ) as unread_count
  from public."Comm_Messages" as message
  left join public."Comm_ReadStates" as state
    on state."CommRead_ThreadID" = message."CommMessage_ThreadID"
   and state."CommRead_UserID" = p_user_id
   and state."CommRead_MessageID" is null
  where message."CommMessage_MailboxID" = any(coalesce(p_mailbox_ids, '{}'::uuid[]))
    and message."CommMessage_IsInbound"
    and not message."CommMessage_IsDraft"
    and not message."CommMessage_IsDeleted"
  group by message."CommMessage_MailboxID";
$$;

revoke all on function public.comm_inbox_mailbox_unread_counts(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.comm_inbox_mailbox_unread_counts(uuid, uuid[]) to service_role;

commit;
