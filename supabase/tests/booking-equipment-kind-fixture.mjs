import { readFileSync } from 'node:fs'
import { addBookingEquipment } from './booking-container-client-fixture.mjs'
export const equipmentKindMigration=readFileSync(new URL('../migrations/20260906062554_booking_equipment_kind_preservation.sql',import.meta.url),'utf8')
// Actual client-created rows through the real privileged canonical save. Auth,
// broad workspace assembly and existing unrelated domains are declared fixtures.
const newRows=['uld','vehicle','trailer','wagon'].map(kind=>({...addBookingEquipment({containers:[]},kind).containers[0],number:`MODE-${kind}`,type:`CUSTOM-${kind}`}))
export const equipmentKindAssertions=`
begin;
do $test$
declare actor uuid:='10000000-0000-4000-8000-000000000001'; company uuid; job uuid; equipment uuid;
  lines jsonb; result jsonb; before_rows jsonb; before_events integer; row_value jsonb; kind text; watcher uuid; weight_watch uuid; proposal jsonb;
begin
  select "Company_ID" into company from public."cmp_Users" where "User_ID"=actor;
  select "Job_ID" into job from public."Job_Header" where "Job_BookingReference"='TEST1';
  perform set_config('test.actor',actor::text,false);
  lines:=booking_api.workspace_extended(actor,'TEST1')->'containers';
  perform public.booking_workflow_save(actor,job,jsonb_build_object('containers',lines||'${JSON.stringify(newRows)}'::jsonb));
  foreach kind in array array['uld','vehicle','trailer','wagon'] loop
    select "JobContainers_ID" into equipment from public."Job_Containers" where "Job_ID"=job and "JobContainer_Number"='MODE-'||kind and not "JobContainer_IsDeleted";
    if equipment is null then raise exception 'New equipment missing: %',kind; end if;
    result:=public.multideck_dexter_query_domain('booking_containers',equipment::text,10)->'data'->0;
    if result->>'equipmentKind'<>kind or result->>'containerType'<>'CUSTOM-'||kind or result->>'targetLabel' like '% · Container %' then raise exception 'Equipment evidence mislabelled: %',result; end if;
    if not exists(select 1 from booking_api.events where event_type='equipment_identity_changed' and actor_user_id=actor and metadata->>'equipmentId'=equipment::text and metadata#>>'{after,equipmentKind}'=kind) then raise exception 'Creation identity audit missing'; end if;
  end loop;
  select "JobContainers_ID" into equipment from public."Job_Containers" where "Job_ID"=job and "JobContainer_Number"='MODE-uld';
  result:=public.multideck_dexter_create_watch('booking_containers','ULD identity','ULD number changed','Watch number',equipment,'MODE-uld','{"field":"containerNumber","operator":"changed"}');
  watcher:=(result->>'id')::uuid;
  lines:=booking_api.workspace_extended(actor,'TEST1')->'containers';
  select jsonb_agg(case when line->>'id'=equipment::text then (line-'equipmentKind')||'{"number":"MODE-uld-updated"}' else line end order by ordinal) into lines
    from jsonb_array_elements(lines) with ordinality entries(line,ordinal);
  perform public.booking_workflow_save(actor,job,jsonb_build_object('containers',lines));
  if (select "JobContainer_EquipmentKind" from public."Job_Containers" where "JobContainers_ID"=equipment)<>'uld' then raise exception 'Old client reclassified ULD'; end if;
  if (select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher)<>1 then raise exception 'Equipment watch missing or duplicated'; end if;
  if not exists(select 1 from booking_api.events where metadata->>'equipmentId'=equipment::text and metadata#>>'{before,number}'='MODE-uld' and metadata#>>'{after,number}'='MODE-uld-updated') then raise exception 'Before/after identity missing'; end if;
  update public."Job_Containers" set "JobContainer_Notes"='Retain notes',"JobContainer_Status"='loaded' where "JobContainers_ID"=equipment;
  select jsonb_agg(case when line->>'id'=equipment::text then line-array['number','type','status','notes'] else line end) into lines from jsonb_array_elements(lines) line;
  select count(*) into before_events from booking_api.events where event_type='equipment_identity_changed';
  perform public.booking_workflow_save(actor,job,jsonb_build_object('containers',lines));
  if not exists(select 1 from public."Job_Containers" where "JobContainers_ID"=equipment and "JobContainer_Number"='MODE-uld-updated' and "JobContainer_TypeCodeSnapshot"='CUSTOM-uld' and "JobContainer_Status"='loaded' and "JobContainer_Notes"='Retain notes') then raise exception 'Partial payload erased identity evidence'; end if;
  if before_events<>(select count(*) from booking_api.events where event_type='equipment_identity_changed') or (select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher)<>1 then raise exception 'No-op identity save duplicated history'; end if;
  result:=public.multideck_dexter_create_watch('booking_containers','ULD weight','ULD weight changed','Watch weight',equipment,'MODE-uld-updated','{"field":"grossWeightKg","operator":"changed"}');
  weight_watch:=(result->>'id')::uuid;
  result:=public.multideck_dexter_query_domain('booking_containers',equipment::text,10)->'data'->0;
  proposal:=jsonb_build_object('target_id',job,'container_id',equipment,'expected_updated_at',result->>'updatedAt',
    'expected_container_updated_at',result->>'containerUpdatedAt','field','grossWeightKg','value','12345.123456','reason','ULD weighing evidence');
  result:=public.multideck_dexter_action_update_booking_container(company,actor,proposal);
  if result->>'after'<>'12345.123456' or (select "JobContainer_EquipmentKind" from public."Job_Containers" where "JobContainers_ID"=equipment)<>'uld'
    or (select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=weight_watch)<>1 then raise exception 'ULD operational action/watch failed'; end if;
  proposal:=proposal||jsonb_build_object('expected_updated_at',result->>'updatedAt','expected_container_updated_at',result->>'containerUpdatedAt','field','verifiedGrossMassKg');
  begin perform public.multideck_dexter_action_update_booking_container(company,actor,proposal);raise exception 'ULD VGM action allowed';exception when invalid_parameter_value then null;end;
  lines:=booking_api.workspace_extended(actor,'TEST1')->'containers';
  select count(*) into before_events from booking_api.events;
  select jsonb_agg(to_jsonb(c) order by "JobContainers_ID") into before_rows from public."Job_Containers" c;
  for row_value in select value from jsonb_array_elements('[{"equipmentKind":null},{"equipmentKind":""},{"equipmentKind":true},{"equipmentKind":"carton"},{"verifiedGrossMassKg":"500"},{"vgmMethod":"1"},{"type":"12345678901234567890123456789012345678901"},{"number":"123456789012345678901234567890123456789012345678901"},{"type":true}]') loop
    begin
      perform public.booking_workflow_save(actor,job,jsonb_build_object('containers',(select jsonb_agg(case when line->>'id'=equipment::text then line||row_value else line end) from jsonb_array_elements(lines) line)));
      raise exception 'Invalid equipment edit allowed: %',row_value;
    exception when invalid_parameter_value then null; end;
  end loop;
  if before_rows is distinct from (select jsonb_agg(to_jsonb(c) order by "JobContainers_ID") from public."Job_Containers" c) or before_events<>(select count(*) from booking_api.events) then raise exception 'Rejected kind change partially saved'; end if;
  select jsonb_agg(case when line->>'id'=equipment::text then line||'{"equipmentKind":"wagon"}' else line end) into lines from jsonb_array_elements(lines) line;
  perform public.booking_workflow_save(actor,job,jsonb_build_object('containers',lines));
  if not exists(select 1 from booking_api.events where metadata->>'equipmentId'=equipment::text and metadata#>>'{before,equipmentKind}'='uld' and metadata#>>'{after,equipmentKind}'='wagon') then raise exception 'Kind correction history missing'; end if;
  if (select "JobContainer_GrossKilos" from public."Job_Containers" where "JobContainers_ID"=equipment)<>12345.123456 then raise exception 'Kind correction rewrote weight'; end if;
  -- A pre-existing specialist kind is not rewritten or used for new records.
  update public."Job_Containers" set "JobContainer_EquipmentKind"='legacy-special' where "JobContainers_ID"=equipment;
  lines:=booking_api.workspace_extended(actor,'TEST1')->'containers';
  perform public.booking_workflow_save(actor,job,jsonb_build_object('containers',lines));
  if (select "JobContainer_EquipmentKind" from public."Job_Containers" where "JobContainers_ID"=equipment)<>'legacy-special' then raise exception 'Legacy kind lost'; end if;
  begin
    perform public.booking_workflow_save(actor,job,jsonb_build_object('containers',lines||'[{"equipmentKind":"legacy-special","number":"NEW"}]'::jsonb));
    raise exception 'New unknown kind allowed';
  exception when invalid_parameter_value then null; end;
  foreach kind in array array['anon','authenticated','service_role'] loop
    if has_function_privilege(kind,'booking_api.equipment_kind_for_save(jsonb,uuid)','execute') or has_function_privilege(kind,'booking_api.audit_equipment_identity()','execute') then raise exception 'Private equipment helper exposed'; end if;
  end loop;
end $test$;
rollback;
`;
