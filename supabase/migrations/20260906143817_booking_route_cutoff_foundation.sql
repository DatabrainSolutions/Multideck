begin;
set local lock_timeout='5s';

-- Carrier deadlines are not movement dates or completed tracking milestones.
-- No ETD-derived defaults, historical backfill or tracking integration.
alter table public."Job_Routing"
  add column "JobRoute_CargoCutoffAt" timestamptz,
  add column "JobRoute_DocumentationCutoffAt" timestamptz,
  add column "JobRoute_VgmCutoffAt" timestamptz,
  add constraint "JobRoute_cutoffs_finite" check (
    isfinite("JobRoute_CargoCutoffAt") and isfinite("JobRoute_DocumentationCutoffAt") and isfinite("JobRoute_VgmCutoffAt")),
  add constraint "JobRoute_vgm_cutoff_sea_only" check ("JobRoute_VgmCutoffAt" is null or "JobRoute_ModeCode" is not distinct from 'sea');

create function booking_api.parse_route_cutoff(value jsonb)
returns timestamptz language plpgsql immutable set search_path='' set timezone='UTC' as $$
declare text_value text;
begin
  if value is null or value='null'::jsonb then return null;end if;
  if jsonb_typeof(value)<>'string' then
    raise exception 'A cut-off needs a date, time and explicit timezone, or can be cleared.' using errcode='22023';end if;
  text_value:=nullif(btrim(value#>>'{}'),'');
  if text_value is null then return null;end if;
  if text_value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9]([.][0-9]{1,6})?)?(Z|[+-]((0[0-9]|1[0-3]):[0-5][0-9]|14:00))$' then
    raise exception 'Enter the complete cut-off date and time with an explicit timezone. A date alone is not a deadline.' using errcode='22023';end if;
  return text_value::timestamptz;
exception when invalid_datetime_format or datetime_field_overflow or invalid_time_zone_displacement_value then
  raise exception 'That cut-off date, time or timezone is invalid.' using errcode='22023';
end $$;

create function booking_api.route_cutoff_values(item public."Job_Routing")
returns jsonb language sql stable set search_path='' set timezone='UTC' as $$
  select jsonb_build_object('cargoCutoffAt',item."JobRoute_CargoCutoffAt",
    'documentationCutoffAt',item."JobRoute_DocumentationCutoffAt",'vgmCutoffAt',item."JobRoute_VgmCutoffAt");
$$;

-- Extend the one authoritative route save in place. Preserve permissions,
-- ownership checks and transaction boundaries. Old clients omit new keys:
-- omission preserves a deadline; an explicit null/empty string clears it.
do $patch$
declare definition text;marker text;replacement text;field_name text;column_name text;
begin
  definition:=pg_get_functiondef('booking_api.save_booking_route_legs(uuid,uuid,jsonb)'::regprocedure);
  for field_name,column_name in select * from (values
    ('cargoCutoffAt','JobRoute_CargoCutoffAt'),('documentationCutoffAt','JobRoute_DocumentationCutoffAt'),('vgmCutoffAt','JobRoute_VgmCutoffAt')) fields(field_name,column_name) loop
    marker:='"JobRoute_Carrier", "JobRoute_CarrierBookingReference"';
    if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 then raise exception 'Review route insert columns before adding cut-offs';end if;
    definition:=replace(definition,marker,format('"%s", %s',column_name,marker));
    marker:='nullif(leg->>''carrierId'', '''')::uuid, left(nullif(btrim(leg->>''carrierBookingReference'')';
    if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 then raise exception 'Review route insert values before adding cut-offs';end if;
    definition:=replace(definition,marker,format('booking_api.parse_route_cutoff(leg->%L), %s',field_name,marker));
    marker:='"JobRoute_Carrier" = nullif(leg->>''carrierId'', '''')::uuid,';
    if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 then raise exception 'Review route update before adding cut-offs';end if;
    replacement:=format('"%s" = case when leg ? %L then booking_api.parse_route_cutoff(leg->%L) else route."%s" end,',column_name,field_name,field_name,column_name);
    definition:=replace(definition,marker,replacement||E'\n        '||marker);
  end loop;
  execute definition;
end $patch$;

-- A copied deadline must not silently become a deadline for a different mode.
-- Keep the prior values in audit. Fresh explicit values can be supplied for
-- the new mode, subject to the same VGM and timestamp constraints.
create function booking_api.guard_route_cutoffs()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='UPDATE' and new."JobRoute_ModeCode" is distinct from old."JobRoute_ModeCode" then
    if new."JobRoute_CargoCutoffAt" is not distinct from old."JobRoute_CargoCutoffAt" then new."JobRoute_CargoCutoffAt":=null;end if;
    if new."JobRoute_DocumentationCutoffAt" is not distinct from old."JobRoute_DocumentationCutoffAt" then new."JobRoute_DocumentationCutoffAt":=null;end if;
    if new."JobRoute_VgmCutoffAt" is not distinct from old."JobRoute_VgmCutoffAt" then new."JobRoute_VgmCutoffAt":=null;end if;
  end if;
  if new."JobRoute_VgmCutoffAt" is not null and new."JobRoute_ModeCode" is distinct from 'sea' then
    raise exception 'A VGM cut-off belongs to a Sea routing leg only.' using errcode='22023';end if;
  return new;
end $$;
create trigger "TR_Job_Routing_cutoff_guard" before insert or update on public."Job_Routing"
  for each row execute function booking_api.guard_route_cutoffs();

create function booking_api.audit_route_cutoffs()
returns trigger language plpgsql security definer set search_path='' as $$
declare before_values jsonb;after_values jsonb;company_id uuid;
begin
  before_values:=case when tg_op='INSERT' then '{"cargoCutoffAt":null,"documentationCutoffAt":null,"vgmCutoffAt":null}'::jsonb else booking_api.route_cutoff_values(old) end;
  after_values:=booking_api.route_cutoff_values(new);
  if before_values=after_values then return new;end if;
  select office."Company_ID" into company_id from public."Job_Header" job
    join public."cmp_Offices" office on office."Office_ID"=coalesce(job."Job_OrgOfficeID",job."Job_OfficeID") where job."Job_ID"=new."Job_ID";
  insert into booking_api.events(company_id,job_id,event_type,summary,metadata,actor_user_id)
    values(company_id,new."Job_ID",'route_cutoffs_updated','Routing deadlines updated',jsonb_build_object(
      'routeId',new."JobRoute_ID",'before',before_values,'after',after_values,
      'previousMode',case when tg_op='UPDATE' then old."JobRoute_ModeCode" end,'mode',new."JobRoute_ModeCode",
      'source','manual_or_approved_action'),new."JobRoute_UpdatedBy");
  return new;
end $$;
create trigger "TR_Job_Routing_cutoff_audit" after insert or update on public."Job_Routing"
  for each row execute function booking_api.audit_route_cutoffs();

alter function booking_api.workspace_extended(uuid,text) rename to workspace_before_cutoffs_20260906;
create function booking_api.workspace_extended(caller_auth_user_id uuid,requested_reference text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;routes jsonb;job_id uuid;
begin
  result:=booking_api.workspace_before_cutoffs_20260906(caller_auth_user_id,requested_reference);
  job_id:=nullif(result#>>'{booking,jobId}','')::uuid;
  if job_id is null then return result;end if;
  select coalesce(jsonb_agg(line||booking_api.route_cutoff_values(route) order by ordinal),'[]'::jsonb) into routes
    from jsonb_array_elements(coalesce(result->'routes','[]'::jsonb)) with ordinality entries(line,ordinal)
    join public."Job_Routing" route on route."JobRoute_ID"::text=line->>'id' and route."Job_ID"=job_id;
  return jsonb_set(result,'{routes}',routes)||'{"routeCutoffsSupported":true}'::jsonb;
end $$;

-- Chat and deterministic watches read the same typed deadlines. The existing
-- approved action still owns exact-record, fresh-version and access checks.
do $patch$
declare definition text;marker text;
begin
  definition:=pg_get_functiondef('booking_api.route_dexter_values(public."Job_Routing")'::regprocedure);
  marker:='select jsonb_build_object(';
  if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 then raise exception 'Review routing domain before cut-offs';end if;
  execute replace(definition,marker,'select booking_api.route_cutoff_values(item)||jsonb_build_object(');
  definition:=pg_get_functiondef('public.multideck_dexter_action_update_booking_route(uuid,uuid,jsonb)'::regprocedure);
  marker:='''plannedPickupAt'',''plannedDepartureAt'',''plannedArrivalAt'',''plannedDeliveryAt'')';
  if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 then raise exception 'Review routing action allowlist before cut-offs';end if;
  definition:=replace(definition,marker,'''plannedPickupAt'',''plannedDepartureAt'',''plannedArrivalAt'',''plannedDeliveryAt'',''cargoCutoffAt'',''documentationCutoffAt'',''vgmCutoffAt'')');
  marker:='if field_name like ''planned%At'' and text_value is not null then';
  if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 then raise exception 'Review routing date validation before cut-offs';end if;
  definition:=replace(definition,marker,$replacement$if field_name in ('cargoCutoffAt','documentationCutoffAt','vgmCutoffAt') then
    field_value:=coalesce(to_jsonb(booking_api.parse_route_cutoff(field_value)),'null'::jsonb);
  elsif field_name like 'planned%At' and text_value is not null then$replacement$);
  marker:='field_name in (''vessel'',''voyageNumber'')';
  if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>2 then raise exception 'Review Sea field guards before cut-offs';end if;
  -- Both occurrences: a harmless unused string-length branch and the mode guard.
  definition:=replace(definition,marker,'field_name in (''vessel'',''voyageNumber'',''vgmCutoffAt'')');
  execute definition;
end $patch$;

-- Mode approval must explicitly disclose and bind every deadline being cleared.
-- Existing prepared proposals without this evidence require a fresh review.
do $patch$
declare definition text;marker text;
begin
  definition:=pg_get_functiondef('booking_api.dexter_route_mode_review(uuid,uuid,jsonb)'::regprocedure);
  marker:='''beforeReferences'',references_before)';
  if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 then raise exception 'Review mode evidence before adding deadlines';end if;
  definition:=replace(definition,marker,'''beforeReferences'',references_before,''beforeCutoffs'',booking_api.route_cutoff_values(leg))');
  marker:='  -- Optional upload provenance';
  if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 then raise exception 'Review mode change card before adding deadlines';end if;
  definition:=replace(definition,marker,$replacement$  for field in select * from (values('cargoCutoffAt','Cargo cut-off'),('documentationCutoffAt','Documentation cut-off'),('vgmCutoffAt','VGM cut-off')) fields(key,label) loop
    if booking_api.route_cutoff_values(leg)->>field.key is not null then
      changes:=changes||jsonb_build_array(jsonb_build_object('field',field.label,'before',booking_api.route_cutoff_values(leg)->field.key,'after',null,'value',null,'beforeKnown',true,'kind','removed'));
    end if;
  end loop;
  -- Optional upload provenance$replacement$);
  marker:='changing this leg mode clears its shared transport references.';
  if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 then raise exception 'Review mode warning before adding deadlines';end if;
  execute replace(definition,marker,'changing this leg mode clears its shared transport references and carrier cut-offs. Previous cut-offs remain in audit history.');
end $patch$;

update public."sys_AIDexterActions" set
  "AIDexterAction_Description"='Propose one operational reference, planned date or carrier cut-off on one exact routing leg. Cut-offs require date, time and timezone. VGM is Sea only. Always requires approval and fresh Booking/route timestamps. No actual/tracking dates, mode, location, carrier, adding/removing legs or commercial edits.',
  "AIDexterAction_ParametersJSON"=jsonb_set(jsonb_set("AIDexterAction_ParametersJSON",'{properties,field,enum}',
    "AIDexterAction_ParametersJSON"#>'{properties,field,enum}'||'["cargoCutoffAt","documentationCutoffAt","vgmCutoffAt"]'::jsonb),
    '{properties,value,description}','"Text, planned ISO date, timestamp with timezone, or null to clear. Cut-offs require a complete date, time and timezone; never infer from ETD. VGM is Sea only."'::jsonb)
  where "AIDexterAction_Code"='update_booking_route';
update public."sys_AIDexterDataDomains" set "AIDexterDomain_Description"="AIDexterDomain_Description"||' Includes manually recorded cargo, documentation and Sea VGM cut-offs; not actual completion or tracking events.'
  where "AIDexterDomain_Code"='booking_routes';
update public."sys_AIDexterWatchCapabilities" set "AIDexterWatchCapability_FieldsJSON"="AIDexterWatchCapability_FieldsJSON"||'["cargoCutoffAt","documentationCutoffAt","vgmCutoffAt"]'::jsonb
  where "AIDexterWatchCapability_Code"='booking_routes';

revoke all on function booking_api.parse_route_cutoff(jsonb),booking_api.route_cutoff_values(public."Job_Routing"),
  booking_api.guard_route_cutoffs(),booking_api.audit_route_cutoffs(),booking_api.workspace_before_cutoffs_20260906(uuid,text)
  from public,anon,authenticated,service_role;
revoke all on function booking_api.workspace_extended(uuid,text) from public,anon,authenticated;
grant execute on function booking_api.workspace_extended(uuid,text) to service_role;
commit;
