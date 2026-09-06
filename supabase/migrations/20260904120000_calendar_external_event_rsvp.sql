-- Let the connected calendar owner answer Google and Microsoft invitations
-- without exposing a private event's attendee list. Provider writes remain
-- approval-safe in Dexter and deterministic for Watching for you.
begin;

alter table public."CAL_ProviderEvents"
  add column if not exists "CALProviderEvent_ResponseCode" varchar(20),
  add column if not exists "CALProviderEvent_IsOrganiser" boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'CK_CAL_ProviderEvents_response'
      and conrelid = 'public."CAL_ProviderEvents"'::regclass
  ) then
    alter table public."CAL_ProviderEvents"
      add constraint "CK_CAL_ProviderEvents_response"
      check ("CALProviderEvent_ResponseCode" is null or "CALProviderEvent_ResponseCode" in ('needs_action','accepted','tentative','declined'));
  end if;
end;
$$;

comment on column public."CAL_ProviderEvents"."CALProviderEvent_ResponseCode" is
  'The connected calendar owner response, separate from attendee presentation so private invitations remain answerable.';
comment on column public."CAL_ProviderEvents"."CALProviderEvent_IsOrganiser" is
  'Whether the connected calendar owner organised the provider event; organisers edit events while invitees answer them.';

-- Existing public mirrors can be classified immediately. Private mirrors are
-- filled by the next provider sync without persisting their attendee list.
with owner_state as (
  select event."CALProviderEvent_ID" as event_id, self.attendee
  from public."CAL_ProviderEvents" event
  join public."CAL_ProviderConnections" connection
    on connection."CALConnection_ID" = event."CALProviderEvent_ConnectionID"
    and connection."CALConnection_CompanyID" = event."CALProviderEvent_CompanyID"
    and connection."CALConnection_UserID" = event."CALProviderEvent_OwnerUserID"
  cross join lateral (
    select attendee
    from jsonb_array_elements(event."CALProviderEvent_AttendeesJSON") attendee
    where lower(attendee->>'email') = lower(connection."CALConnection_Email")
    order by (attendee->>'role' = 'organiser') desc
    limit 1
  ) self
  where event."CALProviderEvent_ResponseCode" is null
)
update public."CAL_ProviderEvents" event
set "CALProviderEvent_ResponseCode" = case
      when owner_state.attendee->>'role' = 'organiser' then 'accepted'
      when owner_state.attendee->>'response' in ('needs_action','accepted','tentative','declined') then owner_state.attendee->>'response'
      else null
    end,
    "CALProviderEvent_IsOrganiser" = owner_state.attendee->>'role' = 'organiser'
from owner_state
where event."CALProviderEvent_ID" = owner_state.event_id;

alter table public."CAL_Deliveries" drop constraint if exists "CK_CAL_Deliveries_kind";
alter table public."CAL_Deliveries" add constraint "CK_CAL_Deliveries_kind" check (
  "CALDelivery_KindCode" in (
    'provider_create','provider_update','provider_cancel','crm_link','booking_verification','management',
    'standalone_confirmation','reminder','rescheduled','cancelled','group_reschedule_request','group_reschedule_outcome',
    'external_event_update','external_event_cancel','external_event_rsvp'
  )
);

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

create or replace function public.multideck_dexter_action_respond_external_event(p_company_id uuid, p_user_id uuid, p_arguments jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_event public."CAL_ProviderEvents";
  v_connection public."CAL_ProviderConnections";
  v_response text := lower(btrim(coalesce(p_arguments->>'response','')));
  v_key text;
begin
  if not public._multideck_calendar_has_permission(p_user_id,'Calendar.ManageOwn') then
    raise exception 'You do not have permission to respond to calendar invitations.' using errcode='42501';
  end if;
  if v_response not in ('accepted','tentative','declined') then
    raise exception 'Choose accepted, tentative or declined.' using errcode='22023';
  end if;
  select * into v_event from public."CAL_ProviderEvents"
  where "CALProviderEvent_ID"=(p_arguments->>'target_id')::uuid
    and "CALProviderEvent_CompanyID"=p_company_id
    and "CALProviderEvent_OwnerUserID"=p_user_id
  for update;
  if not found then raise exception 'That calendar invitation is not available to answer.' using errcode='42501'; end if;
  if v_event."CALProviderEvent_IsCancelled" then raise exception 'That invitation was already removed from the provider.' using errcode='22023'; end if;
  if v_event."CALProviderEvent_IsOrganiser" then raise exception 'You organised this event, so there is no invitation to answer.' using errcode='22023'; end if;
  if v_event."CALProviderEvent_ResponseCode" is null then raise exception 'The provider has not identified this event as an invitation you can answer.' using errcode='22023'; end if;
  select * into v_connection from public."CAL_ProviderConnections"
  where "CALConnection_ID"=v_event."CALProviderEvent_ConnectionID"
    and "CALConnection_CompanyID"=p_company_id and "CALConnection_UserID"=p_user_id;
  if not found or v_connection."CALConnection_StatusCode" not in ('connected','syncing') or v_connection."CALConnection_ProviderCode" not in ('google','microsoft') then
    raise exception 'Reconnect the calendar this invitation came from before responding.' using errcode='22023';
  end if;
  if v_event."CALProviderEvent_ResponseCode" = v_response then
    return jsonb_build_object('id',v_event."CALProviderEvent_ID",'source',v_connection."CALConnection_ProviderCode",'status','confirmed','response',v_response);
  end if;
  v_key := 'external-event:'||v_event."CALProviderEvent_ID"||':rsvp:'||v_response||':'||to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS');
  insert into public."CAL_Deliveries" ("CALDelivery_CompanyID","CALDelivery_KindCode","CALDelivery_IdempotencyKey","CALDelivery_RenderedJSON")
  values (p_company_id,'external_event_rsvp',v_key,jsonb_build_object('providerEventId',v_event."CALProviderEvent_ID",'requestedBy',p_user_id,'response',v_response));
  return jsonb_build_object('id',v_event."CALProviderEvent_ID",'source',v_connection."CALConnection_ProviderCode",'status','sync_pending','currentResponse',v_event."CALProviderEvent_ResponseCode",'requestedResponse',v_response);
end;
$$;

revoke all on function public.multideck_dexter_domain_external_events(uuid,text,integer) from public, anon, authenticated;
revoke all on function public.multideck_dexter_action_respond_external_event(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.multideck_dexter_domain_external_events(uuid,text,integer) to service_role;
grant execute on function public.multideck_dexter_action_respond_external_event(uuid,uuid,jsonb) to service_role;

update public."sys_AIDexterDataDomains" set
  "AIDexterDomain_Description"='Upcoming Google and Microsoft calendar events mirrored for the signed-in operator, including whether the event can be edited or answered and the operator''s current response.',
  "AIDexterDomain_UpdatedAt"=now()
where "AIDexterDomain_Code"='external_events';

insert into public."sys_AIDexterActions" (
  "AIDexterAction_Code","AIDexterAction_DomainCode","AIDexterAction_Name","AIDexterAction_Description",
  "AIDexterAction_Function","AIDexterAction_ParametersJSON","AIDexterAction_SortOrder","AIDexterAction_IsActive",
  "AIDexterAction_UpdatedAt","AIDexterAction_RequiredPermissionsJSON","AIDexterAction_IntentFamily",
  "AIDexterAction_ScopeStrategy","AIDexterAction_HasExternalEffect"
) values (
  'respond_external_event','external_events','Respond to synced invitation','Accept, tentatively accept or decline one Google or Microsoft invitation after approval. The provider receives the response.',
  'multideck_dexter_action_respond_external_event',
  '{"type":"object","properties":{"target_id":{"type":"string"},"response":{"type":"string","enum":["accepted","tentative","declined"]},"reason":{"type":"string"}},"required":["target_id","response","reason"],"additionalProperties":false}'::jsonb,
  21,true,now(),'["Calendar.ManageOwn"]'::jsonb,'external_event_rsvp','owner',true
)
on conflict ("AIDexterAction_Code") do update set
  "AIDexterAction_DomainCode"=excluded."AIDexterAction_DomainCode","AIDexterAction_Name"=excluded."AIDexterAction_Name",
  "AIDexterAction_Description"=excluded."AIDexterAction_Description","AIDexterAction_Function"=excluded."AIDexterAction_Function",
  "AIDexterAction_ParametersJSON"=excluded."AIDexterAction_ParametersJSON","AIDexterAction_SortOrder"=excluded."AIDexterAction_SortOrder",
  "AIDexterAction_IsActive"=true,"AIDexterAction_UpdatedAt"=now(),
  "AIDexterAction_RequiredPermissionsJSON"=excluded."AIDexterAction_RequiredPermissionsJSON",
  "AIDexterAction_IntentFamily"=excluded."AIDexterAction_IntentFamily",
  "AIDexterAction_ScopeStrategy"=excluded."AIDexterAction_ScopeStrategy",
  "AIDexterAction_HasExternalEffect"=true;

-- A response changed outside Multideck can matter to an operator's Calendar
-- watch. Emit only when the provider-owned response actually changes.
create or replace function public._multideck_calendar_provider_response_watch_signal()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if old."CALProviderEvent_ResponseCode" is not distinct from new."CALProviderEvent_ResponseCode"
    or new."CALProviderEvent_MeetingID" is not null then
    return new;
  end if;
  insert into public."AI_DexterWatchSignals" (
    "AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode","AIDexterWatchSignal_SourceTable",
    "AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON"
  ) select new."CALProviderEvent_CompanyID",'calendar','CAL_ProviderEvents',new."CALProviderEvent_ID",
      jsonb_build_object('response',old."CALProviderEvent_ResponseCode"),
      jsonb_build_object('response',new."CALProviderEvent_ResponseCode")
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

drop trigger if exists "CAL_ProviderEvents_ResponseWatchSignal" on public."CAL_ProviderEvents";
create trigger "CAL_ProviderEvents_ResponseWatchSignal"
after update of "CALProviderEvent_ResponseCode" on public."CAL_ProviderEvents"
for each row execute function public._multideck_calendar_provider_response_watch_signal();
revoke all on function public._multideck_calendar_provider_response_watch_signal() from public, anon, authenticated;

commit;
