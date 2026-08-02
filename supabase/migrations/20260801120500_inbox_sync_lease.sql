alter table public."Comm_Mailboxes"
  add column if not exists "CommMailbox_SyncLeaseToken" uuid,
  add column if not exists "CommMailbox_SyncLeaseUntil" timestamptz;

create or replace function public."Comm_AcquireMailboxSyncLease"(
  p_mailbox_id uuid,
  p_lease_token uuid,
  p_lease_seconds integer default 180
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  affected_rows integer;
begin
  update public."Comm_Mailboxes"
  set
    "CommMailbox_SyncLeaseToken" = p_lease_token,
    "CommMailbox_SyncLeaseUntil" = now() + make_interval(secs => greatest(15, least(p_lease_seconds, 300)))
  where "CommMailbox_ID" = p_mailbox_id
    and "CommMailbox_IsDeleted" = false
    and (
      "CommMailbox_SyncLeaseUntil" is null
      or "CommMailbox_SyncLeaseUntil" <= now()
      or "CommMailbox_SyncLeaseToken" = p_lease_token
    );

  get diagnostics affected_rows = row_count;
  return affected_rows = 1;
end;
$$;

create or replace function public."Comm_ReleaseMailboxSyncLease"(
  p_mailbox_id uuid,
  p_lease_token uuid
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public."Comm_Mailboxes"
  set
    "CommMailbox_SyncLeaseToken" = null,
    "CommMailbox_SyncLeaseUntil" = null
  where "CommMailbox_ID" = p_mailbox_id
    and "CommMailbox_SyncLeaseToken" = p_lease_token;
$$;

revoke all on function public."Comm_AcquireMailboxSyncLease"(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public."Comm_ReleaseMailboxSyncLease"(uuid, uuid) from public, anon, authenticated;
grant execute on function public."Comm_AcquireMailboxSyncLease"(uuid, uuid, integer) to service_role;
grant execute on function public."Comm_ReleaseMailboxSyncLease"(uuid, uuid) to service_role;
