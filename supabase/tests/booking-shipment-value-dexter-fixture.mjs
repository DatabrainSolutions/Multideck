import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read = name => readFileSync(new URL(`../migrations/${name}.sql`, import.meta.url), 'utf8')
const valueMigration = read('20260905151617_booking_shipment_goods_value')
function valueFunction(name) {
  const start = valueMigration.indexOf(`create function ${name}(`)
  assert.ok(start >= 0)
  return valueMigration.slice(start, valueMigration.indexOf('\n$$;', start) + 4)
}
export const shipmentValueDexterFixture = `
create or replace function booking_api.has_permission(uuid,text) returns boolean language sql as $$select $1='10000000-0000-4000-8000-000000000001'::uuid$$;
${valueMigration.slice(valueMigration.indexOf('alter table public."Job_Header"'), valueMigration.indexOf('\ncreate function booking_api.normalise_shipment_value'))}
${valueFunction('booking_api.normalise_shipment_value')}
revoke all on function booking_api.normalise_shipment_value(jsonb) from public,anon,authenticated,service_role;
-- Install the actual shipment-value save stage at its existing inner boundary.
-- Auth and the broad prior workspace remain the parent suite's explicit fixtures.
${valueFunction('booking_api.save_booking').replace('create function booking_api.save_booking(', 'create or replace function booking_api.save_before_cargo_decimals_20260905(')}
create or replace function booking_api.workspace(uuid,text) returns jsonb language sql stable as $$
  select jsonb_set(booking_api.workspace_extended($1,$2),'{booking,shipmentGoodsValue}',jsonb_build_object(
    'amount',"Job_GoodsValueAmount"::text,'currency',"Job_GoodsValueCurrencyCode"))
  from public."Job_Header" where "Job_BookingReference"=$2$$;
revoke all on function booking_api.workspace(uuid,text) from public,anon,authenticated;
${read('20260905214653_dexter_shipment_value_parity')}
`

export const shipmentValueDexterAssertions = `
do $test$
declare actor uuid:='10000000-0000-4000-8000-000000000001';company uuid;job uuid;foreign_job uuid;other_actor uuid;other_company uuid;
  proposal jsonb;result jsonb;bad jsonb;before_job jsonb;before_cargo jsonb;source jsonb;watcher uuid;currency_watch uuid;
  audit_count integer;watch_count integer;mode_value text;session_id uuid;intent_id uuid;grant_id uuid;prepared_id uuid;
begin
  perform set_config('test.actor',actor::text,false);perform set_config('request.jwt.claim.role','service_role',false);
  select "Company_ID" into company from public."cmp_Users" where "User_ID"=actor;
  select "User_ID","Company_ID" into other_actor,other_company from public."cmp_Users" where "Company_ID"<>company limit 1;
  select "Job_ID" into job from public."Job_Header" where "Job_BookingReference"='TEST1';
  select "Job_ID" into foreign_job from public."Job_Header" where "Job_BookingReference"='TEST2';
  source:=public.multideck_dexter_query_domain('booking_shipment_value','TEST1',25)#>'{data,0}';
  if source->'amount' is distinct from 'null'::jsonb or source->'currency' is distinct from 'null'::jsonb or source->>'recordId'<>job::text
    or source ?| array['profit','supplierCost','cargo','Job_SourceSnapshotJSON'] then raise exception 'Uninitialised/private value read failed: %',source;end if;
  if jsonb_array_length(public.multideck_dexter_domain_booking_shipment_value(company,foreign_job::text,25))<>0 then raise exception 'Foreign shipment value leaked';end if;
  select to_jsonb(j)-array['Job_GoodsValueAmount','Job_GoodsValueCurrencyCode','Job_UpdatedAt','Job_UpdatedBy'] into before_job from public."Job_Header" j where "Job_ID"=job;
  select jsonb_agg(to_jsonb(c) order by "JobCargo_ID") into before_cargo from public."Job_Cargo" c;
  result:=public.multideck_dexter_create_watch('booking_shipment_value','Goods amount changes','Shipment value','Watch amount',job,'TEST1','{"field":"amount","operator":"changed"}');
  watcher:=(result->>'id')::uuid;
  result:=public.multideck_dexter_create_watch('booking_shipment_value','Currency changes','Shipment currency','Watch currency',job,'TEST1','{"field":"currency","operator":"changed"}');
  currency_watch:=(result->>'id')::uuid;
  begin perform public.multideck_dexter_create_watch('booking_shipment_value','Foreign','No','No',foreign_job,'Other','{"field":"amount","operator":"changed"}');raise exception 'Foreign watch accepted';exception when insufficient_privilege then null;end;
  begin perform public.multideck_dexter_create_watch('booking_shipment_value','Unscoped','No','No',null,'All','{"field":"amount","operator":"changed"}');raise exception 'Unscoped value watch accepted';exception when insufficient_privilege then null;end;
  begin perform public.multideck_dexter_create_watch('booking_shipment_value','Threshold','No','No',job,'TEST1','{"field":"amount","operator":"gt","value":100}');raise exception 'Currency-free monetary threshold accepted';exception when invalid_parameter_value then null;end;
  begin perform public.multideck_dexter_create_watch('booking_shipment_value','Automatic','No','No',job,'TEST1','{"field":"amount","operator":"changed"}','{"actionCode":"update_booking_shipment_value"}');raise exception 'Autonomous value edit accepted';exception when invalid_parameter_value then null;end;
  foreach mode_value in array array['approve','full'] loop
    source:=public.multideck_dexter_query_domain('booking_shipment_value',job::text,1)#>'{data,0}';
    proposal:=jsonb_build_object('target_id',job,'expected_updated_at',source->>'updatedAt','amount',
      case when mode_value='approve' then '12345678901234.5678' else '0' end,'currency','gbp','reason','Verified customer commercial invoice',
      '_document_evidence',jsonb_build_object('uploadId',gen_random_uuid(),'fileName','Goods invoice.pdf'));
    session_id:=gen_random_uuid();grant_id:=null;
    if mode_value='full' then
      insert into public."AI_DexterConversationGrants"("AIDexterGrant_CompanyID","AIDexterGrant_UserID","AIDexterGrant_ClientSessionID","AIDexterGrant_Mode","AIDexterGrant_ExpiresAt")
        values(company,actor,session_id,'full',now()+interval '1 hour') returning "AIDexterGrant_ID" into grant_id;end if;
    insert into public."AI_DexterIntentPlans"("AIDexterIntent_CompanyID","AIDexterIntent_UserID","AIDexterIntent_ClientSessionID","AIDexterIntent_PromptSHA256","AIDexterIntent_AllowedActionsJSON","AIDexterIntent_Specialist","AIDexterIntent_AccessMode","AIDexterIntent_ExpiresAt")
      values(company,actor,session_id,repeat('0',64),'["update_booking_shipment_value"]','freight',mode_value,now()+interval '1 hour') returning "AIDexterIntent_ID" into intent_id;
    insert into public."AI_DexterPreparedActions"("AIDexterPrepared_CompanyID","AIDexterPrepared_UserID","AIDexterPrepared_ClientSessionID","AIDexterPrepared_IntentID","AIDexterPrepared_GrantID","AIDexterPrepared_ActionCode","AIDexterPrepared_ArgumentsJSON","AIDexterPrepared_TargetID","AIDexterPrepared_Title","AIDexterPrepared_Description","AIDexterPrepared_AccessMode","AIDexterPrepared_ExpiresAt")
      values(company,actor,session_id,intent_id,grant_id,'update_booking_shipment_value',proposal,job,'Review shipment value','Allocations unchanged',mode_value,now()+interval '20 minutes') returning "AIDexterPrepared_ID" into prepared_id;
    select count(*) into audit_count from booking_api.events;
    begin result:=public.multideck_dexter_execute_prepared_action(prepared_id,company,actor,null);if coalesce((result->>'updated')::boolean,false) then raise exception 'Unapproved value edit';end if;exception when insufficient_privilege then null;end;
    if audit_count<>(select count(*) from booking_api.events) then raise exception 'Proposal wrote value';end if;
    if not public.multideck_dexter_approve_prepared_action(prepared_id,company,actor,null) then raise exception 'Value approval failed';end if;
    result:=public.multideck_dexter_execute_prepared_action(prepared_id,company,actor,null);
    if result->>'updated' is distinct from 'true' or result#>>'{result,after,currency}'<>'GBP'
      or (result#>>'{result,after,amount}')::numeric<>(proposal->>'amount')::numeric then raise exception 'Approved value save failed: %',result;end if;
    source:=public.multideck_dexter_query_domain('booking_shipment_value',job::text,1)#>'{data,0}';
    if mode_value='approve' and (source->>'amount'<>'12345678901234.5678' or jsonb_typeof(source->'amount')<>'string') then raise exception 'Value precision lost: %',source;end if;
    select count(*) into audit_count from booking_api.events;
    result:=public.multideck_dexter_execute_prepared_action(prepared_id,company,actor,null);
    if result->>'replayed' is distinct from 'true' or audit_count<>(select count(*) from booking_api.events) then raise exception 'Value retry wrote twice';end if;
  end loop;
  proposal:=proposal-'_document_evidence';
  if (select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher)<>2
    or (select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=currency_watch)<>1 then raise exception 'Value watch did not distinguish amount/currency';end if;
  for bad in select value from jsonb_array_elements(jsonb_build_array('{"amount":"-1"}'::jsonb,'{"amount":"1.00001"}','{"amount":"100000000000000"}',
    '{"amount":123}','{"amount":"NaN"}','{"amount":"1","currency":null}','{"currency":"bad currency"}','{"reason":""}',
    '{"profit":50}',jsonb_build_object('target_id',foreign_job),'{"expected_updated_at":"2000-01-01"}')) loop
    begin perform public.multideck_dexter_action_update_booking_shipment_value(company,actor,proposal||bad);raise exception 'Invalid value proposal accepted: %',bad;
      exception when insufficient_privilege or invalid_parameter_value or serialization_failure then null;end;
  end loop;
  begin perform public.multideck_dexter_action_update_booking_shipment_value(company,other_actor,proposal);raise exception 'Foreign actor changed value';exception when insufficient_privilege then null;end;
  perform public.multideck_dexter_action_update_booking_shipment_value(company,actor,proposal||'{"currency":"EUR"}');
  if (select "Job_GoodsValueAmount" from public."Job_Header" where "Job_ID"=job)<>0 then raise exception 'Currency changed amount';end if;
  if (select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher)<>2 then raise exception 'Currency-only change fired amount watch';end if;
  update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='paused' where "AIDexterWatch_ID"=watcher;
  perform public.multideck_dexter_action_update_booking_shipment_value(company,actor,proposal||'{"amount":"4"}');
  if (select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher)<>2 then raise exception 'Paused value watch fired';end if;
  update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='active' where "AIDexterWatch_ID"=watcher;
  perform public.multideck_dexter_action_update_booking_shipment_value(company,actor,proposal||'{"amount":null,"currency":null}');
  select count(*) into audit_count from booking_api.events where event_type='dexter_shipment_value_updated';
  perform public.multideck_dexter_action_update_booking_shipment_value(company,actor,proposal||'{"amount":null,"currency":null}');
  if audit_count<>(select count(*) from booking_api.events where event_type='dexter_shipment_value_updated')
    or (select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher)<>3 then raise exception 'Clear/no-op value event failed';end if;
  if before_job is distinct from (select to_jsonb(j)-array['Job_GoodsValueAmount','Job_GoodsValueCurrencyCode','Job_UpdatedAt','Job_UpdatedBy'] from public."Job_Header" j where "Job_ID"=job)
    or before_cargo is distinct from (select jsonb_agg(to_jsonb(c) order by "JobCargo_ID") from public."Job_Cargo" c) then raise exception 'Value edit changed accepted evidence, freight or allocations';end if;
  if has_function_privilege('authenticated','public.multideck_dexter_action_update_booking_shipment_value(uuid,uuid,jsonb)','execute')
    or has_function_privilege('anon','public.multideck_dexter_domain_booking_shipment_value(uuid,text,integer)','execute') then raise exception 'Value adapter exposed';end if;
  set local role authenticated;
  if not exists(select 1 from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher) then raise exception 'Owner value history unavailable';end if;
  reset role;
  perform set_config('test.actor',other_actor::text,false);
  set local role authenticated;
  if exists(select 1 from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher) then raise exception 'Other owner read value history';end if;
  reset role;
  perform set_config('test.actor',actor::text,false);
end $test$;
create or replace function booking_api.has_permission(uuid,text) returns boolean language sql as $$select false$$;
do $denied$
declare actor uuid:='10000000-0000-4000-8000-000000000001';company uuid;event_count integer;
begin
  select "Company_ID" into company from public."cmp_Users" where "User_ID"=actor;
  begin perform public.multideck_dexter_query_domain('booking_shipment_value','TEST1',1);raise exception 'Revoked value read';exception when insufficient_privilege then null;end;
  begin perform public.multideck_dexter_action_update_booking_shipment_value(company,actor,'{}');raise exception 'Revoked value write';exception when insufficient_privilege then null;end;
  select count(*) into event_count from public."AI_DexterWatchEvents";
  update public."Job_Header" set "Job_GoodsValueAmount"=8,"Job_GoodsValueCurrencyCode"='GBP' where "Job_BookingReference"='TEST1';
  if event_count<>(select count(*) from public."AI_DexterWatchEvents") then raise exception 'Revoked owner received a value event';end if;
  if jsonb_array_length(public.multideck_dexter_list_watches())<>0 then raise exception 'Revoked value watch list';end if;
  set local role authenticated;
  if exists(select 1 from public."AI_DexterWatches") or exists(select 1 from public."AI_DexterWatchEvents") then raise exception 'Revoked value history leaked';end if;
  reset role;
end $denied$;
`
