-- Preserve provider-supplied video links on mirrored Google and Microsoft
-- events so the signed-in calendar owner can join from the existing details
-- popover. The URL remains tenant/user scoped with the event mirror.
begin;

alter table public."CAL_ProviderEvents"
  add column if not exists "CALProviderEvent_JoinURL" text;

comment on column public."CAL_ProviderEvents"."CALProviderEvent_JoinURL" is
  'Provider-supplied HTTPS video entry point for the signed-in event owner; null when no online meeting exists.';

create or replace function public.multideck_dexter_domain_external_events(p_company_id uuid, p_search text, p_take integer)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select coalesce(jsonb_agg(row.data order by row.start_at), '[]'::jsonb)
  from (
    select event."CALProviderEvent_StartAt" as start_at,
      jsonb_strip_nulls(jsonb_build_object(
        'recordId', event."CALProviderEvent_ID", 'recordType', 'external_event',
        'title', case when event."CALProviderEvent_IsPrivate" then 'Busy' else coalesce(event."CALProviderEvent_Title",'Busy') end,
        'startAt', event."CALProviderEvent_StartAt", 'endAt', event."CALProviderEvent_EndAt",
        'source', connection."CALConnection_ProviderCode", 'private', event."CALProviderEvent_IsPrivate",
        'joinUrl', event."CALProviderEvent_JoinURL",
        'canEdit', connection."CALConnection_StatusCode" in ('connected','syncing')
          and connection."CALConnection_ProviderCode" in ('google','microsoft')
          and event."CALProviderEvent_IsOrganiser",
        'canRespond', connection."CALConnection_StatusCode" in ('connected','syncing')
          and connection."CALConnection_ProviderCode" in ('google','microsoft')
          and not event."CALProviderEvent_IsOrganiser"
          and event."CALProviderEvent_ResponseCode" is not null,
        'response', event."CALProviderEvent_ResponseCode",
        'route', '/calendar?date=' || to_char(event."CALProviderEvent_StartAt" at time zone 'UTC','YYYY-MM-DD')
      )) as data
    from public."CAL_ProviderEvents" event
    join public."CAL_ProviderConnections" connection on connection."CALConnection_ID"=event."CALProviderEvent_ConnectionID"
      and connection."CALConnection_CompanyID"=event."CALProviderEvent_CompanyID"
      and connection."CALConnection_UserID"=event."CALProviderEvent_OwnerUserID"
    where event."CALProviderEvent_CompanyID" = p_company_id
      and event."CALProviderEvent_OwnerUserID" = (
        select profile."User_ID"
        from public."cmp_Users" profile
        where profile."Company_ID" = p_company_id
          and profile."Auth_User_ID" = auth.uid()
        limit 1
      )
      and event."CALProviderEvent_MeetingID" is null
      and event."CALProviderEvent_IsCancelled" = false
      and event."CALProviderEvent_EndAt" > now() - interval '1 day'
      and (nullif(btrim(coalesce(p_search,'')),'') is null
        or (event."CALProviderEvent_IsPrivate" = false and event."CALProviderEvent_Title" ilike '%' || btrim(p_search) || '%'))
    order by event."CALProviderEvent_StartAt"
    limit greatest(1, least(coalesce(p_take,10),25))
  ) row;
$$;

revoke all on function public.multideck_dexter_domain_external_events(uuid,text,integer) from public, anon, authenticated;
grant execute on function public.multideck_dexter_domain_external_events(uuid,text,integer) to service_role;

update public."sys_AIDexterDataDomains" set
  "AIDexterDomain_Description"='Upcoming Google and Microsoft calendar events mirrored for the signed-in operator, including whether each event can be edited or answered, the operator''s current response, and a provider-supplied join link when one exists.',
  "AIDexterDomain_UpdatedAt"=now()
where "AIDexterDomain_Code"='external_events';

-- Join-link readiness is a meaningful operator change. Emit a dedicated,
-- deterministic signal only when the provider URL actually changes.
create or replace function public._multideck_calendar_provider_join_watch_signal()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if old."CALProviderEvent_JoinURL" is not distinct from new."CALProviderEvent_JoinURL"
    or new."CALProviderEvent_MeetingID" is not null then
    return new;
  end if;
  insert into public."AI_DexterWatchSignals" (
    "AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode","AIDexterWatchSignal_SourceTable",
    "AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON"
  ) select new."CALProviderEvent_CompanyID",'calendar','CAL_ProviderEvents',new."CALProviderEvent_ID",
      jsonb_build_object('joinUrl',old."CALProviderEvent_JoinURL",'joinReady',old."CALProviderEvent_JoinURL" is not null),
      jsonb_build_object('joinUrl',new."CALProviderEvent_JoinURL",'joinReady',new."CALProviderEvent_JoinURL" is not null)
    where exists (
      select 1 from public."AI_DexterWatches" watch
      where watch."AIDexterWatch_CompanyID"=new."CALProviderEvent_CompanyID"
        and watch."AIDexterWatch_OwnerUserID"=new."CALProviderEvent_OwnerUserID"
        and watch."AIDexterWatch_CapabilityCode"='calendar'
        and watch."AIDexterWatch_StatusCode"='active'
        and (watch."AIDexterWatch_TargetID" is null or watch."AIDexterWatch_TargetID"=new."CALProviderEvent_ID")
    );
  return new;
end;
$$;

drop trigger if exists "CAL_ProviderEvents_JoinWatchSignal" on public."CAL_ProviderEvents";
create trigger "CAL_ProviderEvents_JoinWatchSignal"
after update of "CALProviderEvent_JoinURL" on public."CAL_ProviderEvents"
for each row execute function public._multideck_calendar_provider_join_watch_signal();
revoke all on function public._multideck_calendar_provider_join_watch_signal() from public, anon, authenticated;

commit;
