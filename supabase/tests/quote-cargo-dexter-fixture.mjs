import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read = name => readFileSync(new URL(`../migrations/${name}.sql`, import.meta.url),'utf8')
const lifecycle = read('20260903120100_quote_draft_version_lifecycle')
const start = lifecycle.indexOf('create or replace function quote_api.prevent_submitted_quote_version_mutation()')
const end = lifecycle.indexOf('-- Keep the original implementation',start)
assert.ok(start >= 0 && end > start)

// Broad Quote save and identity/permission resolution are explicit fixtures.
// Real version collapse/projection, canonical cargo save, action dispatch,
// prepared approval/replay, deterministic watch evaluation and RLS execute.
export const quoteCargoDexterFixture = `
create or replace function booking_api.has_permission(uuid,text) returns boolean language sql as $$select $1='10000000-0000-4000-8000-000000000001'::uuid$$;
create function quote_api.has_permission(uuid,text) returns boolean language sql stable as $$
  select coalesce(current_setting('test.quote_access',true),'on')<>'off'
    and $2 in ('Quotes.Read','Quotes.Write') and exists(select 1 from public."cmp_Users"
      where "Auth_User_ID"=$1 and "User_AccessStatus"='active')
$$;
create or replace function public._multideck_dexter_has_permissions(uuid,jsonb) returns boolean language sql stable as $$
  select exists(select 1 from public."cmp_Users" u where u."User_ID"=$1 and u."User_AccessStatus"='active'
    and not exists(select 1 from jsonb_array_elements_text($2) permission
      where not case when permission like 'Quotes.%' then quote_api.has_permission(u."Auth_User_ID",permission)
        else booking_api.has_permission(u."Auth_User_ID",permission) end))
$$;
create table public."CusQuote_Header"(
  "CusQuoteHeader_ID" uuid primary key,"CusQuoteHeader_CustomerID" uuid,"CusQuoteHeader_IsDeleted" boolean default false,
  "CusQuoteHeader_LifecycleCode" text default 'draft',"CusQuoteHeader_OrgOfficeID" uuid,"OrgOffice_ID" uuid,
  "CusQuoteHeader_LastEditedDate" timestamp default now(),"CusQuoteHeader_ShipmentFactsJSON" jsonb);
create table public."CusQuote_Versions"(
  "CusQuoteVersion_ID" uuid primary key default gen_random_uuid(),"Company_ID" uuid not null,
  "CusQuoteHeader_ID" uuid references public."CusQuote_Header","CusQuoteVersion_Number" integer,
  "CusQuoteVersion_StatusCode" text default 'draft',"CusQuoteVersion_IsSubmitted" boolean default false,
  "CusQuoteVersion_CreatedAt" timestamptz default now(),"CusQuoteVersion_CreatedBy" uuid,
  "CusQuoteVersion_IsCurrent" boolean default true,"CusQuoteVersion_SnapshotJSON" jsonb,
  "CusQuoteVersion_SubmittedAt" timestamptz,"CusQuoteVersion_SubmittedBy" uuid);
create unique index quote_current_fixture on public."CusQuote_Versions"("CusQuoteHeader_ID") where "CusQuoteVersion_IsCurrent";
create table public."CusQuote_Events"("Company_ID" uuid,"CusQuoteHeader_ID" uuid,"CusQuoteVersion_ID" uuid,
  "CusQuoteEvent_TypeCode" text,"CusQuoteEvent_Summary" text,"CusQuoteEvent_MetadataJSON" jsonb,"CusQuoteEvent_ActorUserID" uuid);
create table quote_api.customer_response_links(quote_id uuid,quote_version_id uuid);
create table quote_api.customer_responses(quote_id uuid,quote_version_id uuid);
create function quote_api.save_quote_legacy_20260903(actor uuid,quote_id uuid,payload jsonb)
returns jsonb language plpgsql as $$
declare version_id uuid; company uuid;number integer;
begin
  select "Company_ID" into company from public."cmp_Users" where "Auth_User_ID"=actor;
  select coalesce(max("CusQuoteVersion_Number"),0)+1 into number from public."CusQuote_Versions" where "CusQuoteHeader_ID"=quote_id;
  update public."CusQuote_Header" set "CusQuoteHeader_LastEditedDate"=clock_timestamp(),
    "CusQuoteHeader_ShipmentFactsJSON"=payload->'shipmentFacts' where "CusQuoteHeader_ID"=quote_id;
  update public."CusQuote_Versions" set "CusQuoteVersion_IsCurrent"=false where "CusQuoteHeader_ID"=quote_id;
  insert into public."CusQuote_Versions"("Company_ID","CusQuoteHeader_ID","CusQuoteVersion_Number","CusQuoteVersion_SnapshotJSON")
    values(company,quote_id,number,jsonb_build_object('reference','JQTEST','quote',payload)) returning "CusQuoteVersion_ID" into version_id;
  return jsonb_build_object('quoteId',quote_id,'versionId',version_id,'versionNumber',number);
end $$;
${lifecycle.slice(start,end)}
${read('20260904142000_enforce_quote_customer_identity')}
${read('20260905115938_quote_version_structured_cargo')}
${read('20260905160621_quote_open_structured_cargo')}
${read('20260905163327_quote_cargo_safety_summary')}
create function public.quote_workflow_save_quote(actor uuid,quote_id uuid,payload jsonb)
returns jsonb language sql as $$select quote_api.save_quote(actor,quote_id,payload)$$;
${read('20260905220124_quote_draft_cargo_edit_boundary')}
${read('20260905221303_dexter_quote_cargo_parity')}
`

export const quoteCargoDexterAssertions = `
do $test$
declare actor uuid:='10000000-0000-4000-8000-000000000001';company uuid;office uuid;other_actor uuid;other_company uuid;
  quote_id uuid:=gen_random_uuid();version_id uuid:=gen_random_uuid();line1 uuid:=gen_random_uuid();line2 uuid:=gen_random_uuid();
  payload jsonb;source jsonb;proposal jsonb;result jsonb;watcher uuid;nonmatching uuid;archived_watch uuid;
  session_id uuid;intent_id uuid;grant_id uuid;prepared_id uuid;access_mode text;
  audit_count integer;event_count integer;history jsonb;before_jobs jsonb;bad jsonb;
begin
  perform set_config('test.actor',actor::text,false);perform set_config('request.jwt.claim.role','service_role',false);
  select "Company_ID" into company from public."cmp_Users" where "User_ID"=actor;
  select "Office_ID" into office from public."cmp_Offices" where "Company_ID"=company limit 1;
  select "User_ID","Company_ID" into other_actor,other_company from public."cmp_Users" where "Company_ID"<>company limit 1;
  select jsonb_agg(to_jsonb(j) order by "Job_ID") into before_jobs from public."Job_Header" j;
  payload:=jsonb_build_object('customerId',gen_random_uuid(),'charges',jsonb_build_array(jsonb_build_object('costAmount',100,'sellAmount',150)),
    'payer',jsonb_build_object('name','Original payer'),'shipmentFacts',jsonb_build_object('cargoLines',jsonb_build_array(
      jsonb_build_object('id',line1,'description','Machinery','grossWeightKg','0.1234567890123456789'),
      jsonb_build_object('id',line2,'description','Spares','grossWeightKg','200'))));
  insert into public."CusQuote_Header"("CusQuoteHeader_ID","CusQuoteHeader_OrgOfficeID","CusQuoteHeader_CustomerID")
    values(quote_id,office,(payload->>'customerId')::uuid);
  insert into public."CusQuote_Versions"("CusQuoteVersion_ID","Company_ID","CusQuoteHeader_ID","CusQuoteVersion_Number","CusQuoteVersion_SnapshotJSON")
    values(version_id,company,quote_id,1,jsonb_build_object('reference','JQTEST','quote',payload));
  source:=public.multideck_dexter_query_domain('quote_cargo',line1::text,1)#>'{data,0}';
  if source->>'lineId'<>line1::text or source->>'grossWeightKg'<>'0.1234567890123456789' or source->>'editable'<>'true'
    or source ?| array['charges','costAmount','payer','snapshot','profit'] then raise exception 'Quote cargo read scope/precision failed: %',source;end if;
  if jsonb_array_length(public.multideck_dexter_domain_quote_cargo(other_company,quote_id::text,25))<>0 then raise exception 'Foreign Quote cargo leaked';end if;
  result:=public.multideck_dexter_create_watch('quote_cargo','Quote goods changed','Exact V1 cargo','Watch Quote cargo',(source->>'recordId')::uuid,source->>'targetLabel','{"field":"grossWeightKg","operator":"changed"}');
  watcher:=(result->>'id')::uuid;
  result:=public.multideck_dexter_create_watch('quote_cargo','Description changed','Exact V1 cargo','Watch description',(source->>'recordId')::uuid,source->>'targetLabel','{"field":"description","operator":"changed"}');
  nonmatching:=(result->>'id')::uuid;
  result:=public.multideck_dexter_create_watch('quote_cargo','Cargo removed','Exact V1 cargo','Watch removal',(source->>'recordId')::uuid,source->>'targetLabel','{"field":"archived","operator":"changed"}');
  archived_watch:=(result->>'id')::uuid;
  begin perform public.multideck_dexter_create_watch('quote_cargo','Unscoped','No','No',quote_id,'Quote','{"field":"grossWeightKg","operator":"changed"}');raise exception 'Quote ID accepted instead of exact version/line';exception when insufficient_privilege then null;end;
  begin perform public.multideck_dexter_create_watch('quote_cargo','Auto','No','No',(source->>'recordId')::uuid,'Cargo','{"field":"grossWeightKg","operator":"changed"}','{}');raise exception 'Autonomous Quote cargo watch accepted';exception when invalid_parameter_value then null;end;
  foreach access_mode in array array['approve','full'] loop
    source:=public.multideck_dexter_query_domain('quote_cargo',line1::text,1)#>'{data,0}';
    proposal:=jsonb_build_object('target_id',quote_id,'version_id',version_id,'line_id',line1,
      'expected_updated_at',source->>'updatedAt','expected_snapshot_hash',source->>'snapshotHash',
      'field','grossWeightKg','value',case when access_mode='approve' then '123.456789012345678901' else '0' end,'reason','Customer confirmed cargo',
      '_document_evidence',jsonb_build_object('uploadId',gen_random_uuid(),'fileName','Packing list.pdf'));
    session_id:=gen_random_uuid();grant_id:=null;
    if access_mode='full' then
      insert into public."AI_DexterConversationGrants"("AIDexterGrant_CompanyID","AIDexterGrant_UserID","AIDexterGrant_ClientSessionID","AIDexterGrant_Mode","AIDexterGrant_ExpiresAt")
        values(company,actor,session_id,'full',now()+interval '1 hour') returning "AIDexterGrant_ID" into grant_id;end if;
    insert into public."AI_DexterIntentPlans"("AIDexterIntent_CompanyID","AIDexterIntent_UserID","AIDexterIntent_ClientSessionID","AIDexterIntent_PromptSHA256","AIDexterIntent_AllowedActionsJSON","AIDexterIntent_Specialist","AIDexterIntent_AccessMode","AIDexterIntent_ExpiresAt")
      values(company,actor,session_id,repeat('0',64),'["update_quote_cargo"]','freight',access_mode,now()+interval '1 hour') returning "AIDexterIntent_ID" into intent_id;
    insert into public."AI_DexterPreparedActions"("AIDexterPrepared_CompanyID","AIDexterPrepared_UserID","AIDexterPrepared_ClientSessionID","AIDexterPrepared_IntentID","AIDexterPrepared_GrantID","AIDexterPrepared_ActionCode","AIDexterPrepared_ArgumentsJSON","AIDexterPrepared_TargetID","AIDexterPrepared_Title","AIDexterPrepared_Description","AIDexterPrepared_AccessMode","AIDexterPrepared_ExpiresAt")
      values(company,actor,session_id,intent_id,grant_id,'update_quote_cargo',proposal,quote_id,'Review Quote cargo','Draft only',access_mode,now()+interval '20 minutes') returning "AIDexterPrepared_ID" into prepared_id;
    select count(*) into audit_count from public."CusQuote_Events";
    begin result:=public.multideck_dexter_execute_prepared_action(prepared_id,company,actor,null);if coalesce((result->>'updated')::boolean,false) then raise exception 'Unapproved Quote write';end if;exception when insufficient_privilege then null;end;
    if (select count(*) from public."CusQuote_Events")<>audit_count then raise exception 'Proposal changed Quote';end if;
    if not public.multideck_dexter_approve_prepared_action(prepared_id,company,actor,null) then raise exception 'Quote approval failed';end if;
    result:=public.multideck_dexter_execute_prepared_action(prepared_id,company,actor,null);
    if result->>'updated' is distinct from 'true' or result#>>'{result,after}'<>proposal->>'value' then raise exception 'Quote execution failed: %',result;end if;
    if not exists(select 1 from public."AI_DexterActionAudit" where "AIDexterAudit_PreparedActionID"=prepared_id
      and "AIDexterAudit_Status"='succeeded' and "AIDexterAudit_ArgumentsJSON"->'_document_evidence'=proposal->'_document_evidence')
      then raise exception 'Quote edit lost supporting document provenance';end if;
    select count(*) into audit_count from public."CusQuote_Events";
    result:=public.multideck_dexter_execute_prepared_action(prepared_id,company,actor,null);
    if result->>'replayed' is distinct from 'true' or (select count(*) from public."CusQuote_Events")<>audit_count then raise exception 'Quote retry executed twice';end if;
    result:=public.multideck_dexter_execute_prepared_action(prepared_id,other_company,other_actor,null);
    if result#>>'{error,code}' is distinct from 'prepared_action_unavailable' then raise exception 'Foreign proposal accessible';end if;
  end loop;
  if (select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher)<>2
    or exists(select 1 from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=nonmatching) then raise exception 'Quote changed signal duplicated, lost or misrouted';end if;
  if (select count(*) from public."CusQuote_Versions" where "CusQuoteHeader_ID"=quote_id)<>1 then raise exception 'Draft save created history clutter';end if;
  proposal:=proposal-'_document_evidence';
  begin perform public.multideck_dexter_action_update_quote_cargo(company,actor,proposal);raise exception 'Stale Quote approval accepted';exception when serialization_failure then null;end;
  source:=public.multideck_dexter_query_domain('quote_cargo',line1::text,1)#>'{data,0}';
  proposal:=proposal||jsonb_build_object('expected_updated_at',source->>'updatedAt','expected_snapshot_hash',source->>'snapshotHash');
  result:=public.multideck_dexter_action_update_quote_cargo(company,actor,proposal);
  if (result->>'changed')::boolean then raise exception 'No-op cargo changed';end if;
  update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='paused' where "AIDexterWatch_ID"=watcher;
  perform public.multideck_dexter_action_update_quote_cargo(company,actor,proposal||'{"value":"42"}');
  if (select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher)<>2 then raise exception 'Paused Quote watch fired';end if;
  source:=public.multideck_dexter_query_domain('quote_cargo',line1::text,1)#>'{data,0}';
  proposal:=proposal||jsonb_build_object('expected_updated_at',source->>'updatedAt','expected_snapshot_hash',source->>'snapshotHash');
  update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='active' where "AIDexterWatch_ID"=watcher;
  perform public.multideck_dexter_action_update_quote_cargo(company,actor,proposal||'{"value":"43"}');
  if (select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher)<>3 then raise exception 'Resumed Quote watch failed';end if;
  select "CusQuoteVersion_SnapshotJSON" into history from public."CusQuote_Versions" where "CusQuoteVersion_ID"=version_id;
  if history#>'{quote,charges}' is distinct from payload->'charges' or history#>'{quote,payer}' is distinct from payload->'payer'
    or history#>>'{quote,shipmentFacts,cargoLines,1,grossWeightKg}'<>'200' then raise exception 'Unselected cargo/commercial payload changed';end if;
  update public."CusQuote_Versions" set "CusQuoteVersion_IsSubmitted"=true where "CusQuoteVersion_ID"=version_id;
  source:=public.multideck_dexter_query_domain('quote_cargo',line1::text,1)#>'{data,0}';
  if source->>'editable'<>'false' then raise exception 'Issued cargo advertised as editable';end if;
  proposal:=proposal||jsonb_build_object('expected_updated_at',source->>'updatedAt','expected_snapshot_hash',source->>'snapshotHash');
  begin perform public.multideck_dexter_action_update_quote_cargo(company,actor,proposal);raise exception 'Issued cargo edited';exception when invalid_parameter_value then null;end;
  -- Later draft carries the same line UUID but gets a different watch identity.
  perform quote_api.save_quote(actor,quote_id,jsonb_set(history->'quote','{shipmentFacts,cargoLines,0,grossWeightKg}','"900"'));
  source:=public.multideck_dexter_query_domain('quote_cargo',line1::text,1)#>'{data,0}';
  if source->>'versionId'=version_id::text or source->>'recordId'=quote_api.cargo_record_id(version_id,line1)::text
    or (select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher)<>3 then raise exception 'V1 watch followed V2';end if;
  if (select "CusQuoteVersion_SnapshotJSON" from public."CusQuote_Versions" where "CusQuoteVersion_ID"=version_id) is distinct from history then raise exception 'Issued evidence changed';end if;
  result:=public.multideck_dexter_create_watch('quote_cargo','V2 cargo removed','Exact V2 cargo','Watch removal',(source->>'recordId')::uuid,source->>'targetLabel','{"field":"archived","operator":"changed"}');
  archived_watch:=(result->>'id')::uuid;
  -- An ordinary operator save removes a line; its exact V2 removal signal fires once.
  perform quote_api.save_quote(actor,quote_id,jsonb_set(history->'quote','{shipmentFacts,cargoLines}',jsonb_build_array(payload#>'{shipmentFacts,cargoLines,1}')));
  if (select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=archived_watch)<>1
    or (select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher)<>3 then raise exception 'Removal signal crossed versions or failed';end if;
  if (select jsonb_agg(to_jsonb(j) order by "Job_ID") from public."Job_Header" j) is distinct from before_jobs then raise exception 'Quote edit changed Bookings';end if;
  source:=public.multideck_dexter_query_domain('quote_cargo',line2::text,1)#>'{data,0}';
  perform public.multideck_dexter_create_watch('quote_cargo','Revoked Quote cargo','Exact remaining line','Watch description',(source->>'recordId')::uuid,source->>'targetLabel','{"field":"description","operator":"changed"}');
  if has_function_privilege('authenticated','public.multideck_dexter_action_update_quote_cargo(uuid,uuid,jsonb)','execute')
    or has_function_privilege('anon','public.multideck_dexter_domain_quote_cargo(uuid,text,integer)','execute')
    or has_function_privilege('service_role','quote_api.edit_draft_cargo(uuid,jsonb)','execute') then raise exception 'Quote cargo direct-write bypass';end if;
  set local role authenticated;
  if not exists(select 1 from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher) then raise exception 'Owner Quote watch history missing';end if;
  reset role;
  perform set_config('test.actor',other_actor::text,false);
  set local role authenticated;
  if exists(select 1 from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watcher) then raise exception 'Other operator read Quote watch history';end if;
  reset role;
  perform set_config('test.actor',actor::text,false);
end $test$;
select set_config('test.quote_access','off',false);
do $denied$
declare company uuid;events integer;source jsonb;
begin
  select "Company_ID" into company from public."cmp_Users" where "Auth_User_ID"=auth.uid();
  begin perform public.multideck_dexter_query_domain('quote_cargo','JQTEST',25);raise exception 'Revoked Quote read accepted';exception when insufficient_privilege then null;end;
  begin perform public.multideck_dexter_action_update_quote_cargo(company,auth.uid(),'{}');raise exception 'Revoked Quote edit accepted';exception when insufficient_privilege then null;end;
  if exists(select 1 from jsonb_array_elements(public.multideck_dexter_list_watches()) item where item->>'capability'='quote_cargo') then raise exception 'Revoked Quote watch list leaked';end if;
  select count(*) into events from public."AI_DexterWatchEvents";
  -- External valid data changes must not notify an owner who lost Quote access.
  update public."CusQuote_Versions" set "CusQuoteVersion_SnapshotJSON"=jsonb_set("CusQuoteVersion_SnapshotJSON",'{quote,shipmentFacts,cargoLines,0,description}','"Updated externally"') where "CusQuoteVersion_IsCurrent";
  if (select count(*) from public."AI_DexterWatchEvents")<>events then raise exception 'Revoked owner received Quote cargo notification';end if;
  set local role authenticated;
  if exists(select 1 from public."AI_DexterWatches" where "AIDexterWatch_CapabilityCode"='quote_cargo')
    or exists(select 1 from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_Title" in ('Quote goods changed','V2 cargo removed','Cargo removed','Description changed','Revoked Quote cargo'))
    then raise exception 'Revoked Quote history leaked';end if;
  reset role;
end $denied$;
`
