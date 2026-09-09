-- The live email worker runs every ten seconds. Claim a small, fair owner batch
-- so one invocation never enumerates every connected account and overlapping
-- cron requests do not repeat the same work.

create table if not exists public."Comm_EmailWatchWorkerState" (
  "CommWatchWorker_OwnerUserID" uuid not null
    references public."cmp_Users" ("User_ID") on delete cascade,
  "CommWatchWorker_ModeCode" text not null
    check ("CommWatchWorker_ModeCode" in ('live', 'backfill')),
  "CommWatchWorker_LeaseToken" uuid,
  "CommWatchWorker_LeaseUntil" timestamptz,
  "CommWatchWorker_LastClaimedAt" timestamptz,
  primary key ("CommWatchWorker_OwnerUserID", "CommWatchWorker_ModeCode")
);

create index if not exists "IX_Comm_EmailWatchWorkerState_claim"
  on public."Comm_EmailWatchWorkerState" (
    "CommWatchWorker_ModeCode",
    "CommWatchWorker_LeaseUntil",
    "CommWatchWorker_LastClaimedAt",
    "CommWatchWorker_OwnerUserID"
  );

create index if not exists "IX_Comm_ProviderConnections_watch_owner"
  on public."Comm_ProviderConnections" ("CommConn_UserID")
  where "CommConn_StatusCode" = 'active'
    and "CommConn_InboundEnabled"
    and not "CommConn_IsDeleted";

alter table public."Comm_EmailWatchWorkerState" enable row level security;
revoke all on table public."Comm_EmailWatchWorkerState"
  from public, anon, authenticated, service_role;

create or replace function public.comm_claim_email_watch_owners(
  p_mode text,
  p_lease_token uuid,
  p_limit integer default 5
)
returns table (owner_user_id uuid)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_mode text := case when p_mode = 'backfill' then 'backfill' else 'live' end;
  v_limit integer := greatest(1, least(coalesce(p_limit, 5), 10));
  v_lease_seconds integer := case when p_mode = 'backfill' then 300 else 120 end;
begin
  if p_lease_token is null then
    raise exception 'A worker lease token is required.' using errcode = '22023';
  end if;

  insert into public."Comm_EmailWatchWorkerState" (
    "CommWatchWorker_OwnerUserID",
    "CommWatchWorker_ModeCode"
  )
  select distinct connection."CommConn_UserID", v_mode
  from public."Comm_ProviderConnections" connection
  join public."cmp_Users" profile
    on profile."User_ID" = connection."CommConn_UserID"
   and profile."Company_ID" is not null
  where connection."CommConn_StatusCode" = 'active'
    and connection."CommConn_InboundEnabled"
    and not connection."CommConn_IsDeleted"
    and connection."CommConn_UserID" is not null
  on conflict ("CommWatchWorker_OwnerUserID", "CommWatchWorker_ModeCode") do nothing;

  return query
  with candidates as (
    select state."CommWatchWorker_OwnerUserID", state."CommWatchWorker_ModeCode"
    from public."Comm_EmailWatchWorkerState" state
    where state."CommWatchWorker_ModeCode" = v_mode
      and (
        state."CommWatchWorker_LeaseUntil" is null
        or state."CommWatchWorker_LeaseUntil" <= clock_timestamp()
      )
      and exists (
        select 1
        from public."Comm_ProviderConnections" connection
        where connection."CommConn_UserID" = state."CommWatchWorker_OwnerUserID"
          and connection."CommConn_StatusCode" = 'active'
          and connection."CommConn_InboundEnabled"
          and not connection."CommConn_IsDeleted"
        limit 1
      )
    order by state."CommWatchWorker_LastClaimedAt" asc nulls first,
      state."CommWatchWorker_OwnerUserID"
    for update of state skip locked
    limit v_limit
  ), claimed as (
    update public."Comm_EmailWatchWorkerState" state
    set "CommWatchWorker_LeaseToken" = p_lease_token,
        "CommWatchWorker_LeaseUntil" = clock_timestamp() + make_interval(secs => v_lease_seconds),
        "CommWatchWorker_LastClaimedAt" = clock_timestamp()
    from candidates
    where state."CommWatchWorker_OwnerUserID" = candidates."CommWatchWorker_OwnerUserID"
      and state."CommWatchWorker_ModeCode" = candidates."CommWatchWorker_ModeCode"
    returning state."CommWatchWorker_OwnerUserID"
  )
  select claimed."CommWatchWorker_OwnerUserID"
  from claimed
  order by claimed."CommWatchWorker_OwnerUserID";
end;
$$;

create or replace function public.comm_release_email_watch_owner(
  p_mode text,
  p_owner_user_id uuid,
  p_lease_token uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_released integer := 0;
begin
  update public."Comm_EmailWatchWorkerState"
  set "CommWatchWorker_LeaseToken" = null,
      "CommWatchWorker_LeaseUntil" = null
  where "CommWatchWorker_OwnerUserID" = p_owner_user_id
    and "CommWatchWorker_ModeCode" = case when p_mode = 'backfill' then 'backfill' else 'live' end
    and "CommWatchWorker_LeaseToken" = p_lease_token;

  get diagnostics v_released = row_count;
  return v_released > 0;
end;
$$;

revoke all on function public.comm_claim_email_watch_owners(text, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.comm_release_email_watch_owner(text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.comm_claim_email_watch_owners(text, uuid, integer)
  to service_role;
grant execute on function public.comm_release_email_watch_owner(text, uuid, uuid)
  to service_role;
