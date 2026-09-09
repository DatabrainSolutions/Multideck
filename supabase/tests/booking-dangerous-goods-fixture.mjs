import { readFileSync } from 'node:fs'

const migration = readFileSync(new URL('../migrations/20260907102754_booking_cargo_dangerous_goods_evidence.sql', import.meta.url), 'utf8')

// Runs in the existing disposable PostgreSQL suite with its actual save/read
// chain. Auth/permission fixtures are not a claim of hosted tenant isolation.
export const dangerousGoodsFixture = `
create temporary table dg_legacy_before as select to_jsonb(d) original from public."Job_CargoDangerousGoods" d;
alter table public."Job_CargoDangerousGoods" add primary key ("JobCargoDG_ID");
${migration}
create function booking_api.fixture_dg_payload(job uuid,cargo uuid,record_id uuid,changes jsonb)
returns jsonb language sql as $$
  select jsonb_build_object('id',record_id,'cargoId',cargo,'expectedUpdatedAt',j."Job_UpdatedAt",
    'expectedCargoUpdatedAt',c."JobCargo_UpdatedAt",'expectedRecordUpdatedAt',d."JobCargoDG_UpdatedAt",
    'changes',changes,'reason','Synthetic supplied evidence')
  from public."Job_Header" j join public."Job_Cargo" c on c."JobCargo_JobID"=j."Job_ID" and c."JobCargo_ID"=cargo
  left join public."Job_CargoDangerousGoods" d on d."JobCargoDG_ID"=record_id where j."Job_ID"=job
$$;
do $dg_test$
declare actor uuid:='10000000-0000-4000-8000-000000000001'; job uuid; other_job uuid;
  cargo uuid; other_cargo uuid; record_id uuid; first_id uuid; legacy_id uuid; mode text; payload jsonb;
  result jsonb; readback jsonb; before_rows jsonb; before_quotes jsonb; before_routes jsonb; before_job jsonb;
  before_audit bigint; bad jsonb; permission_definition text;
begin
  perform set_config('test.actor',actor::text,false);
  select "Job_ID" into job from public."Job_Header" where "Job_BookingReference"='TEST1';
  select "Job_ID" into other_job from public."Job_Header" where "Job_BookingReference"='TEST2';
  insert into public."Job_Cargo" ("JobCargo_JobID","JobCargo_LineNo","JobCargo_Description")
    values(job,90,'Synthetic DG test cargo') returning "JobCargo_ID" into cargo;
  insert into public."Job_Cargo" ("JobCargo_JobID","JobCargo_LineNo","JobCargo_Description")
    values(other_job,90,'Other Booking cargo') returning "JobCargo_ID" into other_cargo;
  insert into public."Job_CargoDangerousGoods" ("JobCargoDG_JobCargoID","JobCargoDG_UNNumber","JobCargoDG_MarinePollutant")
    values(cargo,'1234',false) returning "JobCargoDG_ID" into legacy_id;
  if exists(select 1 from dg_legacy_before b left join public."Job_CargoDangerousGoods" d
    on d."JobCargoDG_ID"::text=b.original->>'JobCargoDG_ID'
    where d."JobCargoDG_ID" is null or not(to_jsonb(d) @> b.original)
      or d."JobCargoDG_Source"<>'legacy' or d."JobCargoDG_CreatedBy" is not null
      or (booking_api.cargo_dangerous_goods_values(d)->>'operatorEditable')::boolean) then
    raise exception 'Upgrade rewrote or invented legacy attribution'; end if;
  if has_table_privilege('anon','public."Job_CargoDangerousGoods"','TRUNCATE')
    or has_table_privilege('authenticated','public."Job_CargoDangerousGoods"','SELECT')
    or has_table_privilege('service_role','public."Job_CargoDangerousGoods"','UPDATE')
    or has_function_privilege('authenticated','public.booking_workflow_save_dangerous_goods(uuid,uuid,jsonb)','EXECUTE')
    or has_function_privilege('service_role','booking_api.save_cargo_dangerous_goods(uuid,uuid,jsonb)','EXECUTE')
    or not has_function_privilege('service_role','public.booking_workflow_save_dangerous_goods(uuid,uuid,jsonb)','EXECUTE')
    or not(select relrowsecurity from pg_class where oid='public."Job_CargoDangerousGoods"'::regclass) then
    raise exception 'Dangerous-goods access bypasses canonical service boundary'; end if;
  select jsonb_agg(to_jsonb(v) order by "CusQuoteVersion_ID") into before_quotes from public."CusQuote_Versions" v;
  select jsonb_agg(to_jsonb(r) order by "JobRoute_ID") into before_routes from public."Job_Routing" r;
  foreach mode in array array['sea','air','road','rail','multimodal'] loop
    update public."Job_Header" set "Job_TransportModeSummary"=mode where "Job_ID"=job;
    record_id:=gen_random_uuid(); first_id:=coalesce(first_id,record_id);
    payload:=booking_api.fixture_dg_payload(job,cargo,record_id,
      jsonb_build_object('unNumber','1234','properShippingName','Synthetic supplied name','sourceReference','Synthetic source; not a shipment'));
    result:=public.booking_workflow_save_dangerous_goods(actor,job,payload);
    readback:=public.booking_workflow_workspace(actor,'TEST1');
    if result is distinct from readback then raise exception 'DG Save differs from Open'; end if;
    select d into readback from jsonb_array_elements(result->'cargo') c,
      lateral jsonb_array_elements(c->'dangerousGoods') d where d->>'id'=record_id::text;
    if readback is null or readback->>'source'<>'operator' or readback->>'createdBy'<>actor::text
      or readback->'marinePollutant'<>'null'::jsonb or readback->'limitedQuantity'<>'null'::jsonb
      or readback->>'operatorEditable'<>'true' or result->>'dangerousGoodsSupported'<>'true'
      or result#>>'{documents,0,category}'<>'quote' then raise exception 'DG identity/unknown flags/document metadata failed: %',readback; end if;
    begin perform public.booking_workflow_save_dangerous_goods(actor,job,payload);
      raise exception 'Stale DG creation repeated'; exception when sqlstate 'PT409' then null; end;
  end loop;
  select jsonb_agg(to_jsonb(d) order by "JobCargoDG_ID") into before_rows from public."Job_CargoDangerousGoods" d;
  select to_jsonb(j) into before_job from public."Job_Header" j where "Job_ID"=job;
  select count(*) into before_audit from booking_api.events;
  payload:=booking_api.fixture_dg_payload(job,cargo,first_id,'{"notes":"Must not save"}');
  for bad in select value from jsonb_array_elements(jsonb_build_array(
    '{"expectedUpdatedAt":"2000-01-01T00:00Z"}'::jsonb,
    '{"expectedCargoUpdatedAt":"2000-01-01T00:00Z"}'::jsonb,
    '{"expectedRecordUpdatedAt":"2000-01-01T00:00Z"}'::jsonb)) loop
    begin perform public.booking_workflow_save_dangerous_goods(actor,job,payload||bad);
      raise exception 'Stale DG write allowed'; exception when sqlstate 'PT409' then null; end;
  end loop;
  for bad in select value from jsonb_array_elements(jsonb_build_array(
    '{"marinePollutant":"false"}'::jsonb,'{"limitedQuantity":0}'::jsonb,'{"source":"operator"}'::jsonb,
    '{"sourceReference":null}'::jsonb,'{"status":"approved"}'::jsonb,
    '{"status":"voided","notes":"Rewrite history"}'::jsonb,jsonb_build_object('class',repeat('x',21)))) loop
    begin perform public.booking_workflow_save_dangerous_goods(actor,job,payload||jsonb_build_object('changes',bad));
      raise exception 'Invalid DG evidence accepted: %',bad; exception when invalid_parameter_value then null; end;
  end loop;
  begin perform public.booking_workflow_save_dangerous_goods(actor,job,payload||jsonb_build_object('cargoId',other_cargo));
    raise exception 'Foreign cargo accepted'; exception when insufficient_privilege then null; end;
  begin perform public.booking_workflow_save_dangerous_goods(actor,job,booking_api.fixture_dg_payload(job,cargo,legacy_id,'{"notes":"Rewrite legacy"}'));
    raise exception 'Legacy evidence editable'; exception when insufficient_privilege then null; end;
  begin perform public.booking_workflow_save_dangerous_goods(gen_random_uuid(),job,payload);
    raise exception 'Unknown caller accepted'; exception when insufficient_privilege then null; end;
  select pg_get_functiondef('booking_api.has_permission(uuid,text)'::regprocedure) into permission_definition;
  execute 'create or replace function booking_api.has_permission(uuid,text) returns boolean language sql as ''select false''';
  begin perform public.booking_workflow_save_dangerous_goods(actor,job,payload);
    raise exception 'Revoked permissions allowed DG save'; exception when insufficient_privilege then null; end;
  execute permission_definition;
  if before_rows is distinct from (select jsonb_agg(to_jsonb(d) order by "JobCargoDG_ID") from public."Job_CargoDangerousGoods" d)
    or before_job is distinct from (select to_jsonb(j) from public."Job_Header" j where "Job_ID"=job)
    or before_audit<>(select count(*) from booking_api.events) then raise exception 'Denied DG edits changed data or audit'; end if;
  payload:=booking_api.fixture_dg_payload(job,cargo,first_id,'{"marinePollutant":false,"limitedQuantity":true,"notes":"Supplied values"}');
  perform public.booking_workflow_save_dangerous_goods(actor,job,payload);
  if not exists(select 1 from public."Job_CargoDangerousGoods" where "JobCargoDG_ID"=first_id
    and "JobCargoDG_MarinePollutant"=false and "JobCargoDG_LimitedQuantity"=true) then raise exception 'Explicit flags lost'; end if;
  perform public.booking_workflow_save_dangerous_goods(actor,job,
    booking_api.fixture_dg_payload(job,cargo,first_id,'{"marinePollutant":null}'));
  if not exists(select 1 from public."Job_CargoDangerousGoods" where "JobCargoDG_ID"=first_id
    and "JobCargoDG_MarinePollutant" is null and "JobCargoDG_LimitedQuantity"=true
    and "JobCargoDG_Notes"='Supplied values') then raise exception 'Clear lost unselected evidence'; end if;
  select count(*) into before_audit from booking_api.events;
  perform public.booking_workflow_save_dangerous_goods(actor,job,
    booking_api.fixture_dg_payload(job,cargo,first_id,'{"marinePollutant":null}'));
  if before_audit<>(select count(*) from booking_api.events) then raise exception 'No-op added DG audit'; end if;
  perform public.booking_workflow_save_dangerous_goods(actor,job,
    booking_api.fixture_dg_payload(job,cargo,first_id,'{"status":"voided"}'));
  begin perform public.booking_workflow_save_dangerous_goods(actor,job,
    booking_api.fixture_dg_payload(job,cargo,first_id,'{"notes":"Rewrite void"}'));
    raise exception 'Voided evidence editable'; exception when invalid_parameter_value then null; end;
  if not exists(select 1 from booking_api.events where event_type='cargo_dangerous_goods_recorded'
    and actor_user_id=actor and metadata->>'dangerousGoodsId'=first_id::text
    and metadata#>>'{before,status}'='recorded' and metadata#>>'{after,status}'='voided'
    and metadata->>'reason'='Synthetic supplied evidence') then raise exception 'Attributed void audit missing'; end if;
  update public."Job_Cargo" set "JobCargo_IsDeleted"=true where "JobCargo_ID"=cargo;
  begin perform public.booking_workflow_save_dangerous_goods(actor,job,
    booking_api.fixture_dg_payload(job,cargo,record_id,'{"notes":"Retired cargo"}'));
    raise exception 'Retired cargo DG editable'; exception when insufficient_privilege then null; end;
  if before_quotes is distinct from (select jsonb_agg(to_jsonb(v) order by "CusQuoteVersion_ID") from public."CusQuote_Versions" v)
    or before_routes is distinct from (select jsonb_agg(to_jsonb(r) order by "JobRoute_ID") from public."Job_Routing" r) then
    raise exception 'DG evidence changed Quote or routing records'; end if;
end $dg_test$;
`
