// Extends the existing Quote version fixture. The canonical draft collapse,
// cargo normalisation/projection, immutable guard and new edit boundary are real.
// Auth/office resolution and the broad header/party/charge save remain fixtures.
export const quoteDraftCargoEditFixture = `
reset role;
alter table public."CusQuote_Header"
  add column "CusQuoteHeader_OrgOfficeID" uuid,
  add column "OrgOffice_ID" uuid,
  add column "CusQuoteHeader_LastEditedDate" timestamp default now(),
  add column "CusQuoteHeader_ShipmentFactsJSON" jsonb;
alter table public."CusQuote_Events"
  add column "Company_ID" uuid, add column "CusQuoteHeader_ID" uuid,
  add column "CusQuoteEvent_Summary" text, add column "CusQuoteEvent_MetadataJSON" jsonb,
  add column "CusQuoteEvent_ActorUserID" uuid;
create table public."cmp_Offices"("Office_ID" uuid primary key,"Company_ID" uuid);
create table public."cmp_Users"("Auth_User_ID" uuid,"User_ID" uuid,"Company_ID" uuid,"User_AccessStatus" text);
create function quote_api.has_permission(actor uuid,permission text) returns boolean language sql as $$
  select permission in ('Quotes.Read','Quotes.Write') and exists(select 1 from public."cmp_Users"
    where "Auth_User_ID"=actor and "User_AccessStatus"='active')
$$;
alter function quote_api.save_quote_legacy_20260903(uuid,uuid,jsonb) rename to broad_quote_save_fixture;
create function quote_api.save_quote_legacy_20260903(actor uuid,quote_id uuid,payload jsonb)
returns jsonb language plpgsql as $$ declare saved jsonb;begin
  saved:=quote_api.broad_quote_save_fixture(actor,quote_id,payload);
  update public."CusQuote_Header" set "CusQuoteHeader_LastEditedDate"=clock_timestamp(),
    "CusQuoteHeader_ShipmentFactsJSON"=payload->'shipmentFacts' where "CusQuoteHeader_ID"=(saved->>'quoteId')::uuid;
  return saved;
end $$;
create function public.quote_workflow_save_quote(actor uuid,quote_id uuid,payload jsonb)
returns jsonb language sql as $$ select quote_api.save_quote(actor,quote_id,payload) $$;
`;

export const quoteDraftCargoEditAssertions = `
do $test$
declare
  actor uuid:=gen_random_uuid(); operator_id uuid:=gen_random_uuid(); company uuid:=gen_random_uuid(); office uuid:=gen_random_uuid();
  quote_id uuid:=gen_random_uuid(); version_id uuid:=gen_random_uuid(); old_version_id uuid:=gen_random_uuid();
  c1 uuid:=gen_random_uuid(); c2 uuid:=gen_random_uuid(); customer uuid:=gen_random_uuid();
  payload jsonb; args jsonb; result jsonb; initial_snapshot jsonb; preserved jsonb; current_payload jsonb; invalid jsonb;
  before_events bigint; hash text; stamp timestamp;
begin
  insert into public."cmp_Users" values(actor,operator_id,company,'active');
  insert into public."cmp_Offices" values(office,company);
  insert into public."CusQuote_Header"("CusQuoteHeader_ID","CusQuoteHeader_CustomerID","CusQuoteHeader_OrgOfficeID","CusQuoteHeader_LifecycleCode")
    values(quote_id,customer,office,'revised');
  payload:=jsonb_build_object('customerId',customer,'officeId',office,'salesOwnerId',operator_id,
    'currency','GBP','terms','Payer terms remain intact','internalNotes','Private commercial note',
    'payer',jsonb_build_object('name','Paying sister company'),'shipper',jsonb_build_object('name','Factory A'),
    'consignee',jsonb_build_object('name','Warehouse B'),'charges',jsonb_build_array(jsonb_build_object('costAmount',91,'sellAmount',130)),
    'shipmentFacts',jsonb_build_object('cargoLines',jsonb_build_array(
      jsonb_build_object('id',c1,'description','Machines','commodity','Parts','packageType','Crates','packageQuantity','2','grossWeightKg','0.10','volumeCbm','0.123456789012345678901234'),
      jsonb_build_object('id',c2,'description','Spares','commodity','Parts','packageType','Crates','packageQuantity','3','grossWeightKg','0.20','volumeCbm','0.000001')),
      'grossWeightKg','9000','packageQuantity','999','volumeCbm','99','commodity','Stale commodity','packageType','Stale packaging',
      'goodsValue','45000.1234','container','2 x 40GP','routingLegs',jsonb_build_array(jsonb_build_object('mode','Sea','vessel','Keep vessel'))));
  insert into public."CusQuote_Versions"("CusQuoteVersion_ID","Company_ID","CusQuoteHeader_ID","CusQuoteVersion_Number",
    "CusQuoteVersion_IsSubmitted","CusQuoteVersion_IsCurrent","CusQuoteVersion_SnapshotJSON")
    values(old_version_id,company,quote_id,1,true,false,jsonb_build_object('quote',payload)),
      (version_id,company,quote_id,2,false,true,jsonb_build_object('quote',payload));
  select "CusQuoteVersion_SnapshotJSON" into initial_snapshot from public."CusQuote_Versions" where "CusQuoteVersion_ID"=old_version_id;
  insert into quote_api.customer_response_links(quote_id,quote_version_id) values(quote_id,old_version_id);
  perform quote_api.save_quote(actor,quote_id,payload);
  select "CusQuoteVersion_SnapshotJSON"->'quote' into current_payload from public."CusQuote_Versions" where "CusQuoteVersion_ID"=version_id;
  if current_payload#>>'{shipmentFacts,grossWeightKg}'<>'0.3' or current_payload#>>'{shipmentFacts,packageQuantity}'<>'5'
    or current_payload#>>'{shipmentFacts,volumeCbm}'<>'0.123457789012345678901234'
    or current_payload#>>'{shipmentFacts,chargeableWeightKg}'<>'' or current_payload#>>'{shipmentFacts,commodity}'<>'Parts'
    or current_payload#>>'{shipmentFacts,packageType}'<>'Crates' then raise exception 'Canonical cargo summaries are stale or rounded';end if;
  if current_payload->'shipmentFacts' is distinct from (select "CusQuoteHeader_ShipmentFactsJSON" from public."CusQuote_Header" where "CusQuoteHeader_ID"=quote_id)
    then raise exception 'Header and draft cargo diverged';end if;
  preserved:=current_payload #- '{shipmentFacts,cargoLines}' #- '{shipmentFacts,packageType}';
  select "CusQuoteHeader_LastEditedDate" into stamp from public."CusQuote_Header" where "CusQuoteHeader_ID"=quote_id;
  select md5("CusQuoteVersion_SnapshotJSON"::text) into hash from public."CusQuote_Versions" where "CusQuoteVersion_ID"=version_id;
  args:=jsonb_build_object('target_id',quote_id,'version_id',version_id,'line_id',c2,'expected_updated_at',stamp,
    'expected_snapshot_hash',hash,'field','packageType','value','Cartons','reason','Supplier confirmed packing');
  result:=quote_api.edit_draft_cargo(actor,args);
  if result->>'after'<>'Cartons' or result->>'before'<>'Crates' or not (result->>'changed')::boolean then raise exception 'Wrong line updated';end if;
  select "CusQuoteVersion_SnapshotJSON"->'quote' into current_payload from public."CusQuote_Versions" where "CusQuoteVersion_ID"=version_id;
  if current_payload#>>'{shipmentFacts,packageType}'<>'' then raise exception 'Mixed package types represented as one type';end if;
  if current_payload #- '{shipmentFacts,cargoLines}' #- '{shipmentFacts,packageType}' is distinct from preserved then
    raise exception 'Cargo edit changed party, charge, route, ownership or unrelated facts';end if;
  if current_payload#>>'{shipmentFacts,cargoLines,0,packageType}'<>'Crates' or current_payload#>>'{shipmentFacts,cargoLines,1,packageType}'<>'Cartons'
    or (select count(*) from public."CusQuote_Versions" where "CusQuoteHeader_ID"=quote_id)<>2 then raise exception 'Line or version identity lost';end if;
  if not exists(select 1 from public."CusQuote_Events" where "CusQuoteVersion_ID"=version_id and "CusQuoteEvent_TypeCode"='cargo_updated'
    and "CusQuoteEvent_ActorUserID"=operator_id and "CusQuoteEvent_MetadataJSON"->>'reason'='Supplier confirmed packing'
    and "CusQuoteEvent_MetadataJSON"->>'before'='Crates' and "CusQuoteEvent_MetadataJSON"->>'after'='Cartons') then raise exception 'Missing exact audit evidence';end if;
  begin perform quote_api.edit_draft_cargo(actor,args);raise exception 'Stale approval accepted';exception when serialization_failure then null;end;
  args:=args||jsonb_build_object('expected_updated_at',(select "CusQuoteHeader_LastEditedDate" from public."CusQuote_Header" where "CusQuoteHeader_ID"=quote_id),
    'expected_snapshot_hash',(select md5("CusQuoteVersion_SnapshotJSON"::text) from public."CusQuote_Versions" where "CusQuoteVersion_ID"=version_id));
  select count(*) into before_events from public."CusQuote_Events";
  result:=quote_api.edit_draft_cargo(actor,args);
  if (result->>'changed')::boolean or (select count(*) from public."CusQuote_Events")<>before_events then raise exception 'No-op saved or audited twice';end if;
  -- Reject malformed, financial and extra fields before reaching the broad save.
  for invalid in select value from jsonb_array_elements(jsonb_build_array(
    args||'{"field":"costAmount","value":"1"}', args||'{"unexpected":true}',args||'{"reason":""}',
    args||'{"field":"grossWeightKg","value":0.5}',args||'{"field":"grossWeightKg","value":"-1"}',
    args||'{"field":"isHazardous","value":"false"}',args||'{"field":"countryOfOrigin","value":"England"}',
    args||'{"expected_snapshot_hash":""}'
  )) loop
    begin perform quote_api.edit_draft_cargo(actor,invalid);raise exception 'Invalid edit accepted: %',invalid;exception when invalid_parameter_value then null;end;
  end loop;
  begin perform quote_api.edit_draft_cargo(actor,args||jsonb_build_object('line_id',gen_random_uuid()));raise exception 'Foreign line accepted';exception when insufficient_privilege then null;end;
  begin perform quote_api.edit_draft_cargo(gen_random_uuid(),args);raise exception 'Foreign operator accepted';exception when insufficient_privilege then null;end;
  update public."cmp_Users" set "User_AccessStatus"='revoked' where "Auth_User_ID"=actor;
  begin perform quote_api.edit_draft_cargo(actor,args);raise exception 'Revoked operator accepted';exception when insufficient_privilege then null;end;
  update public."cmp_Users" set "User_AccessStatus"='active' where "Auth_User_ID"=actor;
  update public."cmp_Offices" set "Company_ID"=gen_random_uuid() where "Office_ID"=office;
  begin perform quote_api.edit_draft_cargo(actor,args);raise exception 'Foreign workspace accepted';exception when insufficient_privilege then null;end;
  update public."cmp_Offices" set "Company_ID"=company where "Office_ID"=office;
  -- An edit without a header timestamp update still invalidates the hash.
  update public."CusQuote_Versions" set "CusQuoteVersion_SnapshotJSON"=jsonb_set("CusQuoteVersion_SnapshotJSON",'{quote,internalNotes}','"Another operator edited"') where "CusQuoteVersion_ID"=version_id;
  begin perform quote_api.edit_draft_cargo(actor,args);raise exception 'Snapshot conflict accepted';exception when serialization_failure then null;end;
  args:=args||jsonb_build_object('expected_snapshot_hash',(select md5("CusQuoteVersion_SnapshotJSON"::text) from public."CusQuote_Versions" where "CusQuoteVersion_ID"=version_id));
  result:=quote_api.edit_draft_cargo(actor,args||'{"field":"grossWeightKg","value":null}');
  if (select "CusQuoteVersion_SnapshotJSON"#>>'{quote,shipmentFacts,grossWeightKg}' from public."CusQuote_Versions" where "CusQuoteVersion_ID"=version_id)<>''
    then raise exception 'Unknown weight became a misleading partial sum';end if;
  args:=args||jsonb_build_object('expected_updated_at',(select "CusQuoteHeader_LastEditedDate" from public."CusQuote_Header" where "CusQuoteHeader_ID"=quote_id),
    'expected_snapshot_hash',(select md5("CusQuoteVersion_SnapshotJSON"::text) from public."CusQuote_Versions" where "CusQuoteVersion_ID"=version_id));
  insert into quote_api.customer_response_links(quote_id,quote_version_id) values(quote_id,version_id);
  begin perform quote_api.edit_draft_cargo(actor,args);raise exception 'Pending send edited';exception when invalid_parameter_value then null;end;
  delete from quote_api.customer_response_links where quote_version_id=version_id;
  update public."CusQuote_Versions" set "CusQuoteVersion_IsSubmitted"=true where "CusQuoteVersion_ID"=version_id;
  begin perform quote_api.edit_draft_cargo(actor,args);raise exception 'Submitted version edited';exception when invalid_parameter_value then null;end;
  if (select "CusQuoteVersion_SnapshotJSON" from public."CusQuote_Versions" where "CusQuoteVersion_ID"=old_version_id) is distinct from initial_snapshot
    then raise exception 'Historical Quote evidence changed';end if;
  if has_function_privilege('service_role','quote_api.edit_draft_cargo(uuid,jsonb)','EXECUTE')
    or has_function_privilege('authenticated','quote_api.edit_draft_cargo(uuid,jsonb)','EXECUTE')
    or has_function_privilege('anon','quote_api.normalise_cargo_facts(jsonb)','EXECUTE')
    or has_function_privilege('service_role','quote_api.save_quote_before_cargo_totals_20260905(uuid,uuid,jsonb)','EXECUTE')
    then raise exception 'Unreviewed adapter or normaliser bypass is exposed';end if;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='quote_api' and p.proname in ('edit_draft_cargo','save_quote')
      and (not p.prosecdef or not coalesce('search_path=""'=any(p.proconfig),false)))
    then raise exception 'Unsafe private save execution context';end if;
end $test$;
`;
