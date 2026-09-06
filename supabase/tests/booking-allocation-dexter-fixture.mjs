import { readFileSync } from 'node:fs'
export const allocationDexterMigration = readFileSync(new URL('../migrations/20260906060021_dexter_booking_allocation_parity.sql', import.meta.url), 'utf8')
// Real adapters/registry/approval executor/watch evaluator/notification writes.
// Reuses the stable-items fixture's declared Auth, permissions and broad workspace.
export const allocationDexterAssertions = `
create or replace function booking_api.has_permission(uuid,text) returns boolean language sql as $$
  select $1='10000000-0000-4000-8000-000000000001'::uuid and coalesce(current_setting('test.booking_access',true),'on')<>'off'$$;
select set_config('test.booking_access','on',false);
select set_config('test.actor','10000000-0000-4000-8000-000000000001',false);
do $test$
declare actor uuid:='10000000-0000-4000-8000-000000000001';company uuid;job uuid;other_job uuid;other_actor uuid;other_company uuid;
  cargo uuid;equipment uuid;second_equipment uuid;watcher uuid;other_watch uuid;result jsonb;plan jsonb;proposal jsonb;after_plan jsonb;bad jsonb;
  a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();before_count integer;before_audit integer;before_cargo jsonb;before_equipment jsonb;
  mode_value text;session_id uuid;intent_id uuid;grant_id uuid;prepared_id uuid;
begin
  select "Company_ID" into company from public."cmp_Users" where "User_ID"=actor;
  select "Job_ID" into job from public."Job_Header" where "Job_BookingReference"='TEST1';
  select "Job_ID" into other_job from public."Job_Header" where "Job_BookingReference"='TEST2';
  select "User_ID","Company_ID" into other_actor,other_company from public."cmp_Users" where "Company_ID"<>company limit 1;
  perform public.booking_workflow_save(actor,job,'{"cargo":[{"description":"Allocation test goods","packageQuantity":"10","grossWeightKg":"1000.5","volumeCbm":"14.25"}],"containers":[{"number":"ALLOC-A","type":"40GP","verifiedGrossMassKg":"4321"},{"number":"ALLOC-B","type":"20GP"}]}');
  result:=public.multideck_dexter_query_domain('booking_allocations','TEST1',25)->'data';
  if jsonb_array_length(result)<>1 or result#>>'{0,complete}'<>'true' or result#>'{0,allocations}'<>'[]'::jsonb
    or result#>>'{0,allocationScope}'<>'booking_plan' then raise exception 'Complete empty plan read failed: %',result;end if;
  plan:=result->0;
  cargo:=(plan#>>'{cargo,0,id}')::uuid;
  select (row->>'id')::uuid into equipment from jsonb_array_elements(plan->'equipment') row where row->>'number'='ALLOC-A';
  select (row->>'id')::uuid into second_equipment from jsonb_array_elements(plan->'equipment') row where row->>'number'='ALLOC-B';
  if plan ?| array['supplierCost','profit','quoteSnapshot','containerTotals','vgm'] then raise exception 'Private fields leaked';end if;
  if jsonb_array_length(public.multideck_dexter_domain_booking_allocations(company,other_job::text,1))<>0
    or jsonb_array_length(public.multideck_dexter_domain_booking_allocations(company,'',1))<>0 then raise exception 'Broad/foreign allocation read';end if;
  after_plan:=jsonb_build_array(jsonb_build_object('id',a,'cargoId',cargo,'containerId',equipment,'routeId',null,'packageQuantity','6','grossWeightKg','600.25','volumeCbm','8.125','notes','Original split'),
    jsonb_build_object('id',b,'cargoId',cargo,'containerId',second_equipment,'routeId',null,'packageQuantity','4','grossWeightKg','400.25','volumeCbm','6.125','notes',null));
  proposal:=jsonb_build_object('target_id',job,'expected_updated_at',plan->>'updatedAt','expected_review_hash',plan->>'reviewHash','allocations',after_plan,'reason','Packing plan reviewed');
  result:=public.multideck_dexter_create_watch('booking_allocations','Allocation plan changed','Saved plan','Watch allocations',job,'TEST1','{"field":"allocations","operator":"changed"}');
  watcher:=(result->>'id')::uuid;
  select jsonb_agg(to_jsonb(c) order by "JobCargo_ID") into before_cargo from public."Job_Cargo" c;
  select jsonb_agg(to_jsonb(c) order by "JobContainers_ID") into before_equipment from public."Job_Containers" c;
  result:=public.multideck_dexter_action_replace_booking_allocations(company,actor,proposal);
  if jsonb_array_length(result->'after')<>2 then raise exception 'Split plan did not save';end if;
  if (select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher)<>1 then raise exception 'Plan saved multiple/missing watch events';end if;
  if not exists(select 1 from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher
    and "AIDexterWatchEvent_Body"='TEST1: cargo allocation plan changed (0 allocations before, 2 now). Review the Booking for details.'
    and "AIDexterWatchEvent_ChangedJSON"->>'sourceUrl'='/bookings/test1') then raise exception 'Allocation notification is not concise/source linked';end if;
  if (select count(*) from public."Comm_Notifications" where "CommNotif_TargetID"=watcher and "CommNotif_UserID"=actor
    and "CommNotif_LinkTypeCode"='dexter_watch' and "CommNotif_MetadataJSON"->>'url'='/agent-dexter?watch='||watcher::text)<>1 then raise exception 'Exact allocation notification routing missing/duplicated';end if;
  if before_cargo is distinct from (select jsonb_agg(to_jsonb(c) order by "JobCargo_ID") from public."Job_Cargo" c)
    or before_equipment is distinct from (select jsonb_agg(to_jsonb(c) order by "JobContainers_ID") from public."Job_Containers" c) then raise exception 'Allocation changed cargo/equipment/VGM';end if;
  begin perform public.multideck_dexter_action_replace_booking_allocations(company,actor,proposal);raise exception 'Stale review executed';exception when serialization_failure then null;end;
  plan:=public.multideck_dexter_domain_booking_allocations(company,job::text,1)->0;
  proposal:=proposal||jsonb_build_object('expected_updated_at',plan->>'updatedAt','expected_review_hash',plan->>'reviewHash','allocations',plan->'allocations');
  select count(*) into before_audit from booking_api.events;
  perform public.multideck_dexter_action_replace_booking_allocations(company,actor,proposal);
  if before_audit<>(select count(*) from booking_api.events) or (select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher)<>1 then raise exception 'No-op emitted audit/watch';end if;
  for bad in select value from jsonb_array_elements(jsonb_build_array(
    '{"expected_review_hash":"wrong"}'::jsonb,'{"expected_updated_at":"2000-01-01T00:00:00Z"}',
    '{"reason":""}','{"unexpected":true}',jsonb_build_object('target_id',other_job),
    jsonb_build_object('allocations',jsonb_set(plan->'allocations','{0,packageQuantity}','"11"')),
    jsonb_build_object('allocations',jsonb_set(plan->'allocations','{0,cargoId}',to_jsonb(gen_random_uuid()))),
    jsonb_build_object('allocations',jsonb_set(plan->'allocations','{0,grossWeightKg}','"0.001"')))) loop
    begin perform public.multideck_dexter_action_replace_booking_allocations(company,actor,proposal||bad);raise exception 'Invalid plan accepted: %',bad;
    exception when insufficient_privilege or invalid_parameter_value or serialization_failure or check_violation then null;end;
  end loop;
  if before_audit<>(select count(*) from booking_api.events) then raise exception 'Invalid proposal wrote audit';end if;
  begin perform public.multideck_dexter_action_replace_booking_allocations(company,other_actor,proposal);raise exception 'Other actor executed plan';exception when insufficient_privilege then null;end;
  -- Both modes go through the actual opaque prepare/approve/execute boundary.
  perform set_config('request.jwt.claim.role','service_role',false);
  foreach mode_value in array array['approve','full'] loop
    plan:=public.multideck_dexter_domain_booking_allocations(company,job::text,1)->0;
    after_plan:=jsonb_set(plan->'allocations','{0,notes}',to_jsonb(mode_value||' approved'));
    proposal:=proposal||jsonb_build_object('expected_updated_at',plan->>'updatedAt','expected_review_hash',plan->>'reviewHash','allocations',after_plan);
    session_id:=gen_random_uuid();grant_id:=null;
    if mode_value='full' then insert into public."AI_DexterConversationGrants"("AIDexterGrant_CompanyID","AIDexterGrant_UserID","AIDexterGrant_ClientSessionID","AIDexterGrant_Mode","AIDexterGrant_ExpiresAt")
      values(company,actor,session_id,'full',now()+interval '1 hour') returning "AIDexterGrant_ID" into grant_id;end if;
    insert into public."AI_DexterIntentPlans"("AIDexterIntent_CompanyID","AIDexterIntent_UserID","AIDexterIntent_ClientSessionID","AIDexterIntent_PromptSHA256","AIDexterIntent_AllowedActionsJSON","AIDexterIntent_Specialist","AIDexterIntent_AccessMode","AIDexterIntent_ExpiresAt")
      values(company,actor,session_id,repeat('0',64),'["replace_booking_allocations"]','freight',mode_value,now()+interval '1 hour') returning "AIDexterIntent_ID" into intent_id;
    insert into public."AI_DexterPreparedActions"("AIDexterPrepared_CompanyID","AIDexterPrepared_UserID","AIDexterPrepared_ClientSessionID","AIDexterPrepared_IntentID","AIDexterPrepared_GrantID","AIDexterPrepared_ActionCode","AIDexterPrepared_ArgumentsJSON","AIDexterPrepared_TargetID","AIDexterPrepared_Title","AIDexterPrepared_Description","AIDexterPrepared_AccessMode","AIDexterPrepared_ExpiresAt")
      values(company,actor,session_id,intent_id,grant_id,'replace_booking_allocations',proposal,job,'Review plan','Exact allocation plan',mode_value,now()+interval '20 minutes') returning "AIDexterPrepared_ID" into prepared_id;
    select count(*) into before_audit from booking_api.events;
    begin result:=public.multideck_dexter_execute_prepared_action(prepared_id,company,actor,null);
      if coalesce((result->>'updated')::boolean,false) then raise exception 'Unapproved plan executed';end if;
    exception when insufficient_privilege then null;end;
    if before_audit<>(select count(*) from booking_api.events) then raise exception 'Unapproved plan wrote data';end if;
    if not public.multideck_dexter_approve_prepared_action(prepared_id,company,actor,null) then raise exception 'Approval failed';end if;
    result:=public.multideck_dexter_execute_prepared_action(prepared_id,company,actor,null);
    if result->>'updated' is distinct from 'true' then raise exception 'Approved allocation execution failed: %',result;end if;
    select count(*) into before_audit from booking_api.events;
    result:=public.multideck_dexter_execute_prepared_action(prepared_id,company,actor,null);
    if result->>'replayed' is distinct from 'true' or before_audit<>(select count(*) from booking_api.events) then raise exception 'Replay duplicated allocation edit';end if;
  end loop;
  -- One event for an atomic two-container swap through the normal UI RPC.
  plan:=public.multideck_dexter_domain_booking_allocations(company,job::text,1)->0;
  select jsonb_agg(row||jsonb_build_object('containerId',case when row->>'containerId'=equipment::text then second_equipment else equipment end)) into after_plan from jsonb_array_elements(plan->'allocations') row;
  select count(*) into before_count from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher;
  perform public.booking_workflow_save(actor,job,jsonb_build_object('expectedUpdatedAt',plan->>'updatedAt','cargoAllocations',after_plan));
  if (select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher)<>before_count+1 then raise exception 'Swap event not singular';end if;
  update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='paused' where "AIDexterWatch_ID"=watcher;
  plan:=public.multideck_dexter_domain_booking_allocations(company,job::text,1)->0;
  perform public.booking_workflow_save(actor,job,jsonb_build_object('expectedUpdatedAt',plan->>'updatedAt','cargoAllocations',jsonb_set(plan->'allocations','{0,notes}','"Paused change"')));
  if (select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher)<>before_count+1 then raise exception 'Paused watch fired';end if;
  update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='active' where "AIDexterWatch_ID"=watcher;
  plan:=public.multideck_dexter_domain_booking_allocations(company,job::text,1)->0;
  perform public.booking_workflow_save(actor,job,jsonb_build_object('expectedUpdatedAt',plan->>'updatedAt','cargoAllocations','[]'::jsonb));
  if exists(select 1 from booking_api.cargo_equipment_allocations where job_id=job and not is_deleted)
    or (select count(*) from booking_api.cargo_equipment_allocations where job_id=job and is_deleted)<>2 then raise exception 'Removal lost history';end if;
  if (select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher)<>before_count+2 then raise exception 'Resume/removal watch failed';end if;
  select count(*) into before_count from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher;
  perform public.booking_workflow_save(actor,job,'{"internalNotes":"Unrelated job edit"}');
  if (select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher)<>before_count then raise exception 'Unrelated edit fired allocation watch';end if;
  -- Source evidence changes invalidate review even if no allocation changed.
  plan:=public.multideck_dexter_domain_booking_allocations(company,job::text,1)->0;
  update public."Job_Cargo" set "JobCargo_Description"='New goods description' where "JobCargo_ID"=cargo;
  begin perform public.multideck_dexter_action_replace_booking_allocations(company,actor,proposal||jsonb_build_object('expected_updated_at',plan->>'updatedAt','expected_review_hash',plan->>'reviewHash','allocations','[]'::jsonb));raise exception 'Changed source evidence accepted';exception when serialization_failure then null;end;
  -- A revoked watch owner is not notified by another authorised save.
  update public."cmp_Users" set "User_AccessStatus"='revoked' where "User_ID"=actor;
  insert into public."AI_DexterWatchSignals"("AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode","AIDexterWatchSignal_SourceTable","AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON")
    values(company,'booking_allocations','booking_api.cargo_equipment_allocations',job,'{"allocations":[]}','{"allocations":[{"notes":"Changed by another operator"}]}');
  if (select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher)<>before_count then raise exception 'Revoked owner notified';end if;
  begin perform public.multideck_dexter_action_replace_booking_allocations(company,actor,proposal);raise exception 'Revoked actor edited';exception when insufficient_privilege then null;end;
  update public."cmp_Users" set "User_AccessStatus"='active' where "User_ID"=actor;
  begin perform public.multideck_dexter_create_watch('booking_allocations','Bad','Bad','Bad',other_job,'Other','{"field":"allocations","operator":"changed"}');raise exception 'Foreign watch accepted';exception when insufficient_privilege then null;end;
  begin perform public.multideck_dexter_create_watch('booking_allocations','Bad','Bad','Bad',job,'TEST1','{"field":"allocations","operator":"changed"}','{"action":"replace_booking_allocations"}');raise exception 'Autonomous watch accepted';exception when invalid_parameter_value then null;end;
  begin perform public.multideck_dexter_create_watch('booking_allocations','Bad','Bad','Bad',job,'TEST1','{"field":"allocations","operator":"gt","value":"0"}');raise exception 'Non-change watch accepted';exception when invalid_parameter_value then null;end;
  if exists(select 1 from public."AI_DexterWatches" where "AIDexterWatch_HealthStatusCode"='error') then raise exception 'Watch swallowed an error';end if;
  if not exists(select 1 from public."Comm_Notifications" where "CommNotif_UserID"=actor and "CommNotif_LinkTypeCode"='dexter_watch') then raise exception 'Notification missing';end if;
  set local role authenticated;
  if not exists(select 1 from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher) then raise exception 'Owner cannot read history';end if;
  reset role;
  perform set_config('test.actor',other_actor::text,false);
  set local role authenticated;
  if exists(select 1 from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher) then raise exception 'Other actor read history';end if;
  reset role;
  perform set_config('test.actor',actor::text,false);
  if has_function_privilege('authenticated','public.multideck_dexter_domain_booking_allocations(uuid,text,integer)','execute')
    or has_function_privilege('authenticated','public.multideck_dexter_action_replace_booking_allocations(uuid,uuid,jsonb)','execute')
    or has_function_privilege('service_role','booking_api.replace_cargo_allocations_before_watches_20260906(uuid,uuid,jsonb)','execute') then raise exception 'Private helper exposed';end if;
end $test$;
select set_config('test.booking_access','off',false);
do $denied$
begin
  begin perform public.multideck_dexter_query_domain('booking_allocations','TEST1',25);raise exception 'Revoked read accepted';exception when insufficient_privilege then null;end;
  if exists(select 1 from jsonb_array_elements(public.multideck_dexter_list_watches()) row where row->>'capability'='booking_allocations') then raise exception 'Revoked privileged list leaked';end if;
  set local role authenticated;
  if exists(select 1 from public."AI_DexterWatches" where "AIDexterWatch_CapabilityCode"='booking_allocations') then raise exception 'Revoked watch RLS leaked';end if;
  reset role;
end $denied$;
`
