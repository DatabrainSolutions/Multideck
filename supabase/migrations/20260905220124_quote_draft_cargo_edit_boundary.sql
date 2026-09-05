-- Keep every save caller on the same cargo summary contract as the editor.
-- The private exact-line edit is deliberately not a Dexter action until its
-- read/approval/watch adapters are connected and verified together.
begin;
set local lock_timeout = '5s';

create function quote_api.normalise_cargo_facts(facts jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  lines jsonb; key text; total numeric; present integer; distinct_values integer; label text;
begin
  if jsonb_typeof(facts) is distinct from 'object' then
    raise exception 'Shipment facts must be an object.' using errcode = '22023';
  end if;
  if not facts ? 'cargoLines' then return facts; end if;
  lines := quote_api.normalise_cargo_lines(facts->'cargoLines', false);
  facts := jsonb_set(facts, '{cargoLines}', lines);
  foreach key in array array['packageQuantity','grossWeightKg','volumeCbm','chargeableWeightKg'] loop
    select count(line->>key), sum((line->>key)::numeric) into present,total
      from jsonb_array_elements(lines) line;
    -- An incomplete total is unknown, not a partial sum or an invented zero.
    facts := jsonb_set(facts, array[key], to_jsonb(case
      when present > 0 and present = jsonb_array_length(lines) then trim_scale(total)::text else '' end));
  end loop;
  foreach key in array array['commodity','packageType'] loop
    select count(line->>key), count(distinct line->>key), min(line->>key)
      into present,distinct_values,label from jsonb_array_elements(lines) line;
    facts := jsonb_set(facts, array[key], to_jsonb(case
      when present = jsonb_array_length(lines) and distinct_values = 1 then label else '' end));
  end loop;
  return facts;
end $$;

alter function quote_api.save_quote(uuid,uuid,jsonb) rename to save_quote_before_cargo_totals_20260905;
create function quote_api.save_quote(caller_auth_user_id uuid,requested_quote_id uuid,payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if payload->'shipmentFacts' ? 'cargoLines' then
    payload := jsonb_set(payload, '{shipmentFacts}', quote_api.normalise_cargo_facts(payload->'shipmentFacts'));
  end if;
  return quote_api.save_quote_before_cargo_totals_20260905(caller_auth_user_id,requested_quote_id,payload);
end $$;

create function quote_api.edit_draft_cargo(caller_auth_user_id uuid,arguments jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor record; quote public."CusQuote_Header"; version public."CusQuote_Versions";
  payload jsonb; lines jsonb; item jsonb; before_line jsonb; after_line jsonb; saved jsonb;
  field text := arguments->>'field'; line_id uuid; ordinal integer;
begin
  if not coalesce(quote_api.has_permission(caller_auth_user_id,'Quotes.Read'),false)
    or not coalesce(quote_api.has_permission(caller_auth_user_id,'Quotes.Write'),false) then
    raise exception 'You do not have permission to edit Quote cargo.' using errcode = '42501';
  end if;
  select "User_ID","Company_ID" into actor from public."cmp_Users"
    where "Auth_User_ID"=caller_auth_user_id and "User_AccessStatus"='active';
  if not found then raise exception 'An active operator is required.' using errcode='42501';end if;
  if jsonb_typeof(arguments) is distinct from 'object'
    or not (arguments ?& array['target_id','version_id','line_id','expected_updated_at','expected_snapshot_hash','field','value','reason'])
    or exists(select 1 from jsonb_object_keys(arguments) key where key not in
      ('target_id','version_id','line_id','expected_updated_at','expected_snapshot_hash','field','value','reason'))
    or jsonb_typeof(arguments->'reason') is distinct from 'string'
    or nullif(btrim(arguments->>'reason'),'') is null or length(arguments->>'reason')>2000
    or coalesce(arguments->>'expected_snapshot_hash','') !~ '^[0-9a-f]{32}$'
    or nullif(arguments->>'expected_updated_at','') is null then
    raise exception 'Read the exact Quote draft and cargo line before proposing an edit.' using errcode='22023';
  end if;
  if field is null or field not in ('description','commodity','packageType','hsCode','countryOfOrigin',
    'packageQuantity','grossWeightKg','netWeightKg','volumeCbm','chargeableWeightKg','length','width','height',
    'lengthUnit','isHazardous','isTemperatureControlled') then
    raise exception 'That field is not an editable Quote cargo field.' using errcode='22023';
  end if;
  if field in ('packageQuantity','grossWeightKg','netWeightKg','volumeCbm','chargeableWeightKg','length','width','height')
    and jsonb_typeof(arguments->'value') not in ('string','null') then
    raise exception 'Use exact decimal text, or null to clear a cargo measurement.' using errcode='22023';
  end if;
  line_id := (arguments->>'line_id')::uuid;
  -- Match submission's lock order. The hash is an optimistic version token,
  -- not authorization; current operator, office and record checks are separate.
  select q.* into quote from public."CusQuote_Header" q join public."cmp_Offices" office
    on office."Office_ID"=coalesce(q."CusQuoteHeader_OrgOfficeID",q."OrgOffice_ID")
    where q."CusQuoteHeader_ID"=(arguments->>'target_id')::uuid
      and office."Company_ID"=actor."Company_ID" and not q."CusQuoteHeader_IsDeleted" for update of q;
  if not found then raise exception 'That Quote is outside this workspace.' using errcode='42501';end if;
  select v.* into version from public."CusQuote_Versions" v
    where v."CusQuoteHeader_ID"=quote."CusQuoteHeader_ID" and v."Company_ID"=actor."Company_ID"
      and v."CusQuoteVersion_ID"=(arguments->>'version_id')::uuid and v."CusQuoteVersion_IsCurrent" for update;
  if not found or quote."CusQuoteHeader_LastEditedDate" is distinct from (arguments->>'expected_updated_at')::timestamp
    or md5(version."CusQuoteVersion_SnapshotJSON"::text) is distinct from arguments->>'expected_snapshot_hash' then
    raise exception 'The Quote draft changed. Read it again and request fresh approval.' using errcode='40001';
  end if;
  if version."CusQuoteVersion_IsSubmitted" or version."CusQuoteVersion_StatusCode" is distinct from 'draft'
    or coalesce(quote."CusQuoteHeader_LifecycleCode",'') not in ('draft','calculated','revised')
    or exists(select 1 from quote_api.customer_response_links where quote_version_id=version."CusQuoteVersion_ID")
    or exists(select 1 from quote_api.customer_responses where quote_version_id=version."CusQuoteVersion_ID") then
    raise exception 'Only a working draft can be edited. Open a revised draft before changing an issued Quote.' using errcode='22023';
  end if;
  payload := version."CusQuoteVersion_SnapshotJSON"->'quote';
  if jsonb_typeof(payload) is distinct from 'object'
    or jsonb_typeof(payload#>'{shipmentFacts,cargoLines}') is distinct from 'array' then
    raise exception 'This Quote needs its legacy cargo reviewed in the Quote screen first.' using errcode='22023';
  end if;
  lines := quote_api.normalise_cargo_lines(payload#>'{shipmentFacts,cargoLines}',false);
  select value, (position-1)::integer into before_line,ordinal
    from jsonb_array_elements(lines) with ordinality rows(value,position) where (value->>'id')::uuid=line_id;
  if not found then raise exception 'That cargo line is not in this Quote draft.' using errcode='42501';end if;
  item := jsonb_set(before_line,array[field],arguments->'value');
  after_line := quote_api.normalise_cargo_lines(jsonb_build_array(item),false)->0;
  if before_line is distinct from after_line then
    lines := jsonb_set(lines,array[ordinal::text],after_line);
    payload := jsonb_set(payload,'{shipmentFacts,cargoLines}',lines);
    -- Reuse the complete current saved payload: no party, payer, charge,
    -- route or commercial value is reconstructed from a partial model input.
    saved := public.quote_workflow_save_quote(caller_auth_user_id,quote."CusQuoteHeader_ID",payload);
    if saved->>'versionId' is distinct from version."CusQuoteVersion_ID"::text then
      raise exception 'The working draft changed during the save. No cargo edit was applied.' using errcode='40001';
    end if;
    insert into public."CusQuote_Events"("Company_ID","CusQuoteHeader_ID","CusQuoteVersion_ID",
      "CusQuoteEvent_TypeCode","CusQuoteEvent_Summary","CusQuoteEvent_MetadataJSON","CusQuoteEvent_ActorUserID")
    values(actor."Company_ID",quote."CusQuoteHeader_ID",version."CusQuoteVersion_ID",'cargo_updated',
      'Approved Quote draft cargo updated; issued versions and Booking unchanged.',
      jsonb_build_object('lineId',line_id,'field',field,'before',before_line->field,'after',after_line->field,
        'reason',btrim(arguments->>'reason')),actor."User_ID");
  end if;
  return jsonb_build_object('quoteId',quote."CusQuoteHeader_ID",'versionId',version."CusQuoteVersion_ID",
    'lineId',line_id,'field',field,'before',before_line->field,'after',after_line->field,'changed',before_line is distinct from after_line);
end $$;

revoke all on function quote_api.normalise_cargo_facts(jsonb),quote_api.edit_draft_cargo(uuid,jsonb),
  quote_api.save_quote_before_cargo_totals_20260905(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function quote_api.save_quote(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function quote_api.save_quote(uuid,uuid,jsonb) to service_role;
commit;
