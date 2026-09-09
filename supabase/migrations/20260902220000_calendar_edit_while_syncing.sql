-- Syncing means a cache refresh is queued, not that OAuth was disconnected.
-- Keep Dexter reads and approved writes aligned with the Calendar API.
-- Existing CAL_ProviderEvents watch triggers remain unchanged: only a
-- provider-confirmed mirror update emits the existing deterministic signal.

-- ---------------------------------------------------------------------------
-- Dexter: mirrored Google / Microsoft events
-- ---------------------------------------------------------------------------
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
        'canEdit', connection."CALConnection_StatusCode" in ('connected','syncing') and connection."CALConnection_ProviderCode" in ('google','microsoft'),
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

create or replace function public._multideck_calendar_queue_external_event_change(p_company_id uuid, p_user_id uuid, p_event_id uuid, p_cancel boolean, p_change jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_event public."CAL_ProviderEvents"; v_connection public."CAL_ProviderConnections"; v_key text;
begin
  if not public._multideck_calendar_has_permission(p_user_id,'Calendar.ManageOwn') then
    raise exception 'You do not have permission to change calendar events.' using errcode='42501';
  end if;
  select * into v_event from public."CAL_ProviderEvents"
  where "CALProviderEvent_ID"=p_event_id and "CALProviderEvent_CompanyID"=p_company_id and "CALProviderEvent_OwnerUserID"=p_user_id for update;
  if not found then raise exception 'That calendar event is not available to change.' using errcode='42501'; end if;
  if v_event."CALProviderEvent_MeetingID" is not null then raise exception 'That event is a Multideck meeting. Use the meeting actions instead.' using errcode='22023'; end if;
  if v_event."CALProviderEvent_IsCancelled" then raise exception 'That event was already removed from the provider.' using errcode='22023'; end if;
  select * into v_connection from public."CAL_ProviderConnections" where "CALConnection_ID"=v_event."CALProviderEvent_ConnectionID"
    and "CALConnection_CompanyID"=p_company_id and "CALConnection_UserID"=p_user_id;
  if not found or v_connection."CALConnection_StatusCode" not in ('connected','syncing') or v_connection."CALConnection_ProviderCode" not in ('google','microsoft') then
    raise exception 'Reconnect the calendar this event came from before changing it.' using errcode='22023';
  end if;
  if not p_cancel then
    if p_change->>'title' is not null and v_event."CALProviderEvent_IsPrivate" then
      raise exception 'Private provider events keep their title. You can still move or delete them.' using errcode='22023';
    end if;
    if p_change->>'title' is null and p_change->>'startAt' is null then
      raise exception 'Nothing to change on this event.' using errcode='22023';
    end if;
    if p_change->>'startAt' is not null and ((p_change->>'endAt')::timestamptz <= (p_change->>'startAt')::timestamptz) then
      raise exception 'The event must finish after it starts.' using errcode='22023';
    end if;
  end if;
  v_key := 'external-event:'||p_event_id||':'||case when p_cancel then 'cancel' else 'update' end||':'||to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS');
  insert into public."CAL_Deliveries" ("CALDelivery_CompanyID","CALDelivery_KindCode","CALDelivery_IdempotencyKey","CALDelivery_RenderedJSON")
  values (p_company_id, case when p_cancel then 'external_event_cancel' else 'external_event_update' end, v_key,
    jsonb_strip_nulls(jsonb_build_object('providerEventId',p_event_id,'requestedBy',p_user_id,'title',p_change->>'title','startAt',p_change->>'startAt','endAt',p_change->>'endAt','timeZone',p_change->>'timeZone')));
  return jsonb_build_object('id',p_event_id,'source',v_connection."CALConnection_ProviderCode",'status','sync_pending',
    'title',case when v_event."CALProviderEvent_IsPrivate" then 'Busy' else v_event."CALProviderEvent_Title" end,
    'currentStartAt',v_event."CALProviderEvent_StartAt",'currentEndAt',v_event."CALProviderEvent_EndAt",
    'requestedStartAt',p_change->>'startAt','requestedEndAt',p_change->>'endAt');
end;
$$;


revoke all on function public.multideck_dexter_domain_external_events(uuid,text,integer) from public, anon, authenticated;
revoke all on function public._multideck_calendar_queue_external_event_change(uuid,uuid,uuid,boolean,jsonb) from public, anon, authenticated;
grant execute on function public.multideck_dexter_domain_external_events(uuid,text,integer) to service_role;
grant execute on function public._multideck_calendar_queue_external_event_change(uuid,uuid,uuid,boolean,jsonb) to service_role;

