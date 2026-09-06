-- Overall commercial Mode is not an instruction to relabel a planned leg.
-- Keep the legacy derived A-B behavior only while the Booking still has that
-- one matching leg. Explicit Quote plans and operational routing are separate.
begin;
set local lock_timeout='5s';

do $migration$
declare definition text; anchor text;
begin
  definition:=pg_get_functiondef('public.booking_workflow_apply_quote_sync_before_payer_20260904(uuid,uuid,uuid,jsonb)'::regprocedure);
  anchor:='  perform booking_api.save_booking(caller_auth_user_id,requested_job_id,save_payload);';
  if strpos(definition,anchor)=0 then raise exception 'Expected reviewed Quote apply save boundary missing';end if;
  definition:=replace(definition,anchor,$replacement$
  if selected_fields ? 'mode' and (
    coalesce(review_row.baseline_snapshot->'routingIsExplicit'='true'::jsonb,false)
    or coalesce(proposed->'routingIsExplicit'='true'::jsonb,false)
    or selected_fields ? 'routing'
    or (select count(*)<>1 or not coalesce(bool_and(
        booking_api.normalise_mode(route."JobRoute_ModeCode") is not distinct from
          booking_api.normalise_mode(before_snapshot->>'mode')),false)
      from public."Job_Routing" route
      where route."Job_ID"=requested_job_id
        and coalesce(route."JobRoute_Status",'planned')<>'superseded')
  ) then
    save_payload:=save_payload #- '{route,mode}';
    -- Do not send an empty compatibility route: even an empty object causes
    -- the legacy saver to touch the first leg and can revive stale defaults.
    if save_payload->'route'='{}'::jsonb then save_payload:=save_payload-'route';end if;
  end if;
  perform booking_api.save_booking(caller_auth_user_id,requested_job_id,save_payload);$replacement$);
  execute definition;

  -- Compatibility date/address edits must not take their mode from the Job
  -- header. An existing leg changes mode only when route.mode is explicit;
  -- a newly created legacy leg may still derive its initial mode from the job.
  definition:=pg_get_functiondef('booking_api.save_before_goods_value_20260905(uuid,uuid,jsonb)'::regprocedure);
  anchor:='"JobRoute_ModeCode" = mode_value,';
  if strpos(definition,anchor)=0 then raise exception 'Expected primary-route mode assignment missing';end if;
  definition:=replace(definition,anchor,$replacement$"JobRoute_ModeCode" = case
          when nullif(btrim(payload#>>'{route,mode}'),'') is not null
            then booking_api.normalise_mode(payload#>>'{route,mode}')
          else route."JobRoute_ModeCode" end,$replacement$);
  anchor:='requested_job_id, 1, ''planned'', mode_value,';
  if strpos(definition,anchor)=0 then raise exception 'Expected new primary-route mode assignment missing';end if;
  definition:=replace(definition,anchor,$replacement$requested_job_id, 1, 'planned', case
          when nullif(btrim(payload#>>'{route,mode}'),'') is not null
            then booking_api.normalise_mode(payload#>>'{route,mode}')
          else mode_value end,$replacement$);
  execute definition;
end;
$migration$;

-- The checked v2 approval entrypoint remains the only external apply boundary.
revoke all on function public.booking_workflow_apply_quote_sync_before_payer_20260904(uuid,uuid,uuid,jsonb)
  from public,anon,authenticated,service_role;
revoke all on function booking_api.save_before_goods_value_20260905(uuid,uuid,jsonb)
  from public,anon,authenticated,service_role;
commit;
