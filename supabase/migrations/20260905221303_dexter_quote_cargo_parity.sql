begin;
set local lock_timeout='5s';

-- This stable watch identity includes the VERSION. It is not an authority token.
create function quote_api.cargo_record_id(version_id uuid,line_id uuid)
returns uuid language sql immutable strict set search_path='' as $$
  select md5(version_id::text||':'||line_id::text)::uuid
$$;
create unique index version_cargo_watch_identity on quote_api.version_cargo_lines
  (quote_api.cargo_record_id(version_id,line_id));

create function quote_api.cargo_read_values(line quote_api.version_cargo_lines)
returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object('description',line.description,'commodity',line.commodity,
    'packageQuantity',line.package_quantity::text,'packageType',line.package_type,
    'grossWeightKg',line.gross_weight_kg::text,'netWeightKg',line.net_weight_kg::text,'volumeCbm',line.volume_cbm::text,
    'chargeableWeightKg',line.chargeable_weight_kg::text,'length',line.length::text,'width',line.width::text,
    'height',line.height::text,'lengthUnit',line.length_unit,'hsCode',line.hs_code,'countryOfOrigin',line.country_of_origin,
    'isHazardous',line.is_hazardous,'isTemperatureControlled',line.is_temperature_controlled,'archived',false)
$$;
create function public.multideck_dexter_domain_quote_cargo(p_company_id uuid,p_search text,p_take integer)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(result order by reference,line_number),'[]'::jsonb) from (
    select quote_api.cargo_read_values(line)||jsonb_build_object(
      'recordId',quote_api.cargo_record_id(line.version_id,line.line_id),'quoteId',q."CusQuoteHeader_ID",
      'versionId',line.version_id,'lineId',line.line_id,'lineNumber',line.line_number,'cargoScope','quote_version',
      'quoteReference',v."CusQuoteVersion_SnapshotJSON"->>'reference','versionNumber',v."CusQuoteVersion_Number",
      'updatedAt',q."CusQuoteHeader_LastEditedDate",'snapshotHash',md5(v."CusQuoteVersion_SnapshotJSON"::text),
      'editable',not v."CusQuoteVersion_IsSubmitted" and v."CusQuoteVersion_StatusCode"='draft'
        and q."CusQuoteHeader_LifecycleCode" in ('draft','calculated','revised')
        and not exists(select 1 from quote_api.customer_response_links where quote_version_id=line.version_id)
        and not exists(select 1 from quote_api.customer_responses where quote_version_id=line.version_id),
      'sourceTable','quote_api.version_cargo_lines',
      'sourceUrl','/quotes/'||lower(v."CusQuoteVersion_SnapshotJSON"->>'reference'),
      'targetLabel',coalesce(v."CusQuoteVersion_SnapshotJSON"->>'reference','Quote')||' · Version '||v."CusQuoteVersion_Number"||' · Cargo '||line.line_number
    ) result, v."CusQuoteVersion_SnapshotJSON"->>'reference' reference,line.line_number
    from quote_api.version_cargo_lines line join public."CusQuote_Versions" v on v."CusQuoteVersion_ID"=line.version_id
    join public."CusQuote_Header" q on q."CusQuoteHeader_ID"=v."CusQuoteHeader_ID" and not q."CusQuoteHeader_IsDeleted"
    join public."cmp_Offices" office on office."Office_ID"=coalesce(q."CusQuoteHeader_OrgOfficeID",q."OrgOffice_ID")
    where office."Company_ID"=p_company_id and v."Company_ID"=p_company_id and v."CusQuoteVersion_IsCurrent"
      and (nullif(btrim(p_search),'') is null or q."CusQuoteHeader_ID"::text=btrim(p_search)
        or line.version_id::text=btrim(p_search) or line.line_id::text=btrim(p_search)
        or quote_api.cargo_record_id(line.version_id,line.line_id)::text=btrim(p_search)
        or v."CusQuoteVersion_SnapshotJSON"->>'reference' ilike '%'||btrim(p_search)||'%'
        or line.description ilike '%'||btrim(p_search)||'%')
    order by reference,line.line_number limit greatest(1,least(coalesce(p_take,10),25))
  ) selected
$$;
create function public.multideck_dexter_action_update_quote_cargo(p_company_id uuid,p_user_id uuid,p_arguments jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; result jsonb;
begin
  select "Auth_User_ID" into actor from public."cmp_Users"
    where "User_ID"=p_user_id and "Company_ID"=p_company_id and "User_AccessStatus"='active';
  if actor is null then raise exception 'An active operator in this workspace is required.' using errcode='42501';end if;
  result:=quote_api.edit_draft_cargo(actor,p_arguments);
  return result||jsonb_build_object('recordId',quote_api.cargo_record_id((result->>'versionId')::uuid,(result->>'lineId')::uuid));
end $$;

create function public._multideck_dexter_quote_cargo_watch_change()
returns trigger language plpgsql security definer set search_path='' as $$
declare item quote_api.version_cargo_lines; source_id uuid;company uuid;reference text;before_value jsonb;after_value jsonb;
begin
  item:=case when tg_op='DELETE' then old else new end;
  source_id:=quote_api.cargo_record_id(item.version_id,item.line_id);
  select v."Company_ID",v."CusQuoteVersion_SnapshotJSON"->>'reference' into company,reference
    from public."CusQuote_Versions" v join public."CusQuote_Header" q on q."CusQuoteHeader_ID"=v."CusQuoteHeader_ID"
    join public."cmp_Offices" office on office."Office_ID"=coalesce(q."CusQuoteHeader_OrgOfficeID",q."OrgOffice_ID")
    where v."CusQuoteVersion_ID"=item.version_id and not q."CusQuoteHeader_IsDeleted" and office."Company_ID"=v."Company_ID";
  if not found or not exists(select 1 from public."AI_DexterWatches" where "AIDexterWatch_CompanyID"=company
    and "AIDexterWatch_CapabilityCode"='quote_cargo' and "AIDexterWatch_TargetID"=source_id and "AIDexterWatch_StatusCode"='active') then return null;end if;
  before_value:=case when tg_op='INSERT' then '{}'::jsonb else quote_api.cargo_read_values(old) end;
  after_value:=case when tg_op='DELETE' then before_value||'{"archived":true}'::jsonb else quote_api.cargo_read_values(new) end;
  if before_value=after_value then return null;end if;
  insert into public."AI_DexterWatchSignals"("AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode",
    "AIDexterWatchSignal_SourceTable","AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON")
    values(company,'quote_cargo','quote_api.version_cargo_lines',source_id,before_value,after_value||jsonb_build_object(
      'versionId',item.version_id,'lineId',item.line_id,'quoteReference',reference,'sourceUrl','/quotes/'||lower(reference)));
  return null;
end $$;
create trigger quote_cargo_dexter_watch after insert or update or delete on quote_api.version_cargo_lines
  for each row execute function public._multideck_dexter_quote_cargo_watch_change();

insert into public."sys_AIDexterDataDomains"("AIDexterDomain_Code","AIDexterDomain_Name","AIDexterDomain_Description",
  "AIDexterDomain_QueryFunction","AIDexterDomain_RequiredPermissionsJSON","AIDexterDomain_DataCategoriesJSON")
values('quote_cargo','Quote version cargo','Exact current-version cargo lines with draft editability, source identities and exact decimals. No charges, margins or raw snapshots.',
  'multideck_dexter_domain_quote_cargo','["Quotes.Read"]','["operational"]');
insert into public."sys_AIDexterActions"("AIDexterAction_Code","AIDexterAction_DomainCode","AIDexterAction_Name","AIDexterAction_Description",
  "AIDexterAction_Function","AIDexterAction_ParametersJSON","AIDexterAction_RequiredPermissionsJSON","AIDexterAction_IntentFamily","AIDexterAction_AlwaysRequiresApproval")
values('update_quote_cargo','quote_cargo','Review Quote draft cargo','Always requires approval. Read the exact current editable version and cargo line first. Changes one field, recalculates cargo totals, retains other draft details. Prices are not recalculated: review charges before issuing. Never issues a Quote, creates a revision or updates a Booking.',
  'multideck_dexter_action_update_quote_cargo',
  '{"type":"object","properties":{"target_id":{"type":"string","description":"Exact quoteId from quote_cargo"},"version_id":{"type":"string"},"line_id":{"type":"string"},"expected_updated_at":{"type":"string"},"expected_snapshot_hash":{"type":"string"},"field":{"type":"string","enum":["description","commodity","packageQuantity","packageType","grossWeightKg","netWeightKg","volumeCbm","chargeableWeightKg","length","width","height","lengthUnit","hsCode","countryOfOrigin","isHazardous","isTemperatureControlled"]},"value":{"type":["string","boolean","null"],"description":"Exact decimal or text, Boolean for safety flags, null to clear nullable fields"},"reason":{"type":"string"}},"required":["target_id","version_id","line_id","expected_updated_at","expected_snapshot_hash","field","value","reason"],"additionalProperties":false}',
  '["Quotes.Read","Quotes.Write"]','update_quote_cargo',true);
insert into public."sys_AIDexterWatchCapabilities"("AIDexterWatchCapability_Code","AIDexterWatchCapability_Name","AIDexterWatchCapability_Description",
  "AIDexterWatchCapability_FieldsJSON","AIDexterWatchCapability_RequiredPermissionsJSON")
values('quote_cargo','Quote version cargo','Notify on saved changes to one exact version and cargo line. Does not follow later versions. Changes only, no autonomous edits or recurring AI.',
  '["description","commodity","packageQuantity","packageType","grossWeightKg","netWeightKg","volumeCbm","chargeableWeightKg","length","width","height","lengthUnit","hsCode","countryOfOrigin","isHazardous","isTemperatureControlled","archived"]','["Quotes.Read"]');

create function public.multideck_dexter_can_read_quote_cargo_watch(p_company_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public."cmp_Users" u where u."Auth_User_ID"=auth.uid() and u."Company_ID"=p_company_id
    and u."User_AccessStatus"='active' and quote_api.has_permission(u."Auth_User_ID",'Quotes.Read'))
$$;
do $patch$
declare definition text;marker text;
begin
  definition:=pg_get_functiondef('public._multideck_dexter_evaluate_watch_signal()'::regprocedure);
  marker:='and watch_row."AIDexterWatch_StatusCode" = ''active''';
  if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 then raise exception 'Review Quote cargo watch owner guard';end if;
  definition:=replace(definition,marker,marker||$guard$
    and (watch_row."AIDexterWatch_CapabilityCode"<>'quote_cargo' or exists(select 1 from public."cmp_Users" owner_user
      where owner_user."User_ID"=watch_row."AIDexterWatch_OwnerUserID" and owner_user."Company_ID"=watch_row."AIDexterWatch_CompanyID"
      and owner_user."User_AccessStatus"='active' and quote_api.has_permission(owner_user."Auth_User_ID",'Quotes.Read')))$guard$);
  marker:='watch."AIDexterWatch_CapabilityCode" in (''booking_cargo'',''booking_containers'',''booking_routes'',''booking_shipment_value'')';
  if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 then raise exception 'Review Quote cargo changed-event semantics';end if;
  execute replace(definition,marker,replace(marker,'(''booking_cargo''','(''quote_cargo'',''booking_cargo'''));
  definition:=pg_get_functiondef('public.multideck_dexter_execute_prepared_action(uuid,uuid,uuid,uuid)'::regprocedure);
  marker:='(''update_booking_cargo'',''update_booking_container'',''update_booking_route'',''change_booking_route_mode'',''update_booking_shipment_value'')';
  if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 then raise exception 'Review Quote cargo mandatory approval guard';end if;
  execute replace(definition,marker,replace(marker,'(''update_booking_cargo''','(''update_quote_cargo'',''update_booking_cargo'''));
end $patch$;
alter function public.multideck_dexter_create_watch(text,text,text,text,uuid,text,jsonb,jsonb) rename to _multideck_dexter_create_watch_before_quote_cargo_20260905;
create function public.multideck_dexter_create_watch(p_capability text,p_title text,p_summary text,p_request text,p_target_id uuid,p_target_label text,p_rule jsonb,p_action jsonb default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare context record;
begin
  select * into context from public._multideck_dexter_context();
  if lower(btrim(p_capability))='quote_cargo' then
    if not public.multideck_dexter_can_read_quote_cargo_watch(context.company_id) or p_target_id is null
      or not exists(select 1 from jsonb_array_elements(public.multideck_dexter_domain_quote_cargo(context.company_id,p_target_id::text,1)) row
        where row->>'recordId'=p_target_id::text and (row->>'editable')::boolean) then
      raise exception 'Choose one current editable Quote cargo line in this workspace.' using errcode='42501';end if;
    if p_action is not null or p_rule->>'operator' is distinct from 'changed' then
      raise exception 'Quote cargo watches notify on changes only. Edits need fresh approval.' using errcode='22023';end if;
  end if;
  return public._multideck_dexter_create_watch_before_quote_cargo_20260905(p_capability,p_title,p_summary,p_request,p_target_id,p_target_label,p_rule,p_action);
end $$;
create policy "Quote cargo watches require Quote access" on public."AI_DexterWatches"
as restrictive for select to authenticated using("AIDexterWatch_CapabilityCode"<>'quote_cargo'
  or public.multideck_dexter_can_read_quote_cargo_watch("AIDexterWatch_CompanyID"));
-- Existing restrictive watch-history policy checks visible parent watches.
alter function public.multideck_dexter_list_watches() rename to _multideck_dexter_list_watches_before_quote_cargo_20260905;
create function public.multideck_dexter_list_watches() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare context record;result jsonb;
begin
  select * into context from public._multideck_dexter_context();
  select coalesce(jsonb_agg(item order by ordinal),'[]'::jsonb) into result
    from jsonb_array_elements(public._multideck_dexter_list_watches_before_quote_cargo_20260905()) with ordinality rows(item,ordinal)
    where item->>'capability'<>'quote_cargo' or public.multideck_dexter_can_read_quote_cargo_watch(context.company_id);
  return result;
end $$;
revoke all on function quote_api.cargo_record_id(uuid,uuid),quote_api.cargo_read_values(quote_api.version_cargo_lines),
 public._multideck_dexter_quote_cargo_watch_change(),public._multideck_dexter_create_watch_before_quote_cargo_20260905(text,text,text,text,uuid,text,jsonb,jsonb),
 public._multideck_dexter_list_watches_before_quote_cargo_20260905() from public,anon,authenticated,service_role;
revoke all on function public.multideck_dexter_domain_quote_cargo(uuid,text,integer),public.multideck_dexter_action_update_quote_cargo(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.multideck_dexter_domain_quote_cargo(uuid,text,integer),public.multideck_dexter_action_update_quote_cargo(uuid,uuid,jsonb) to service_role;
revoke all on function public.multideck_dexter_can_read_quote_cargo_watch(uuid),public.multideck_dexter_create_watch(text,text,text,text,uuid,text,jsonb,jsonb),
 public.multideck_dexter_list_watches() from public,anon;
grant execute on function public.multideck_dexter_can_read_quote_cargo_watch(uuid),public.multideck_dexter_create_watch(text,text,text,text,uuid,text,jsonb,jsonb),
 public.multideck_dexter_list_watches() to authenticated,service_role;
commit;
