-- Durable mailbox indexing state for the tenant-isolated Inbox.
--
-- Provider cursors remain the source of truth for continuation. These fields
-- expose only bounded progress metadata; browser clients still read it through
-- the authenticated Inbox Edge Function rather than querying mail tables.

alter table public."Comm_Mailboxes"
  add column if not exists "CommMailbox_IndexStatus" varchar(24) not null default 'pending',
  add column if not exists "CommMailbox_IndexProcessedCount" integer not null default 0,
  add column if not exists "CommMailbox_IndexTotalEstimate" integer,
  add column if not exists "CommMailbox_IndexStartedAt" timestamptz,
  add column if not exists "CommMailbox_IndexCompletedAt" timestamptz;

do $constraints$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'CK_Comm_Mailboxes_index_status'
      and conrelid = 'public."Comm_Mailboxes"'::regclass
  ) then
    alter table public."Comm_Mailboxes"
      add constraint "CK_Comm_Mailboxes_index_status"
      check ("CommMailbox_IndexStatus" in ('pending', 'indexing', 'ready', 'error'));
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'CK_Comm_Mailboxes_index_counts'
      and conrelid = 'public."Comm_Mailboxes"'::regclass
  ) then
    alter table public."Comm_Mailboxes"
      add constraint "CK_Comm_Mailboxes_index_counts"
      check (
        "CommMailbox_IndexProcessedCount" >= 0
        and (
          "CommMailbox_IndexTotalEstimate" is null
          or "CommMailbox_IndexTotalEstimate" >= 0
        )
      );
  end if;
end;
$constraints$;

with message_counts as (
  select
    message."CommMessage_MailboxID" as mailbox_id,
    count(*)::integer as message_count
  from public."Comm_Messages" as message
  where not message."CommMessage_IsDeleted"
  group by message."CommMessage_MailboxID"
)
update public."Comm_Mailboxes" as mailbox
set "CommMailbox_IndexProcessedCount" = coalesce(message_counts.message_count, 0),
    "CommMailbox_IndexStatus" = case
      when mailbox."CommMailbox_SyncCursor" is null then 'pending'
      when mailbox."CommMailbox_SyncCursor" like '{"kind":"gmail_snapshot"%'
        or mailbox."CommMailbox_SyncCursor" ilike '%$skiptoken%'
        or mailbox."CommMailbox_SyncCursor" ilike '%\%24skiptoken%'
        then 'indexing'
      else 'ready'
    end,
    "CommMailbox_IndexStartedAt" = case
      when mailbox."CommMailbox_SyncCursor" is not null
        then coalesce(mailbox."CommMailbox_LastSyncedAt", mailbox."CommMailbox_CreatedAt", now())
      else null
    end,
    "CommMailbox_IndexCompletedAt" = case
      when mailbox."CommMailbox_SyncCursor" is not null
        and mailbox."CommMailbox_SyncCursor" not like '{"kind":"gmail_snapshot"%'
        and mailbox."CommMailbox_SyncCursor" not ilike '%$skiptoken%'
        and mailbox."CommMailbox_SyncCursor" not ilike '%\%24skiptoken%'
        then coalesce(mailbox."CommMailbox_LastSyncedAt", now())
      else null
    end
from message_counts
where message_counts.mailbox_id = mailbox."CommMailbox_ID";

update public."Comm_Mailboxes" as mailbox
set "CommMailbox_IndexStatus" = 'pending',
    "CommMailbox_IndexProcessedCount" = 0,
    "CommMailbox_IndexStartedAt" = null,
    "CommMailbox_IndexCompletedAt" = null
where not exists (
  select 1
  from public."Comm_Messages" as message
  where message."CommMessage_MailboxID" = mailbox."CommMailbox_ID"
    and not message."CommMessage_IsDeleted"
)
and mailbox."CommMailbox_SyncCursor" is null;

create index if not exists "IX_Comm_Mailboxes_indexing"
  on public."Comm_Mailboxes" (
    "CommMailbox_IndexStatus",
    "CommMailbox_UpdatedAt",
    "CommMailbox_ID"
  )
  where not "CommMailbox_IsDeleted"
    and "CommMailbox_IndexStatus" in ('pending', 'indexing', 'error');
