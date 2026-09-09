-- Initial conversion only. Accepted-revision comparison/application remains
-- behind the existing explicit review, never this initial insert helper.
begin;
set local lock_timeout='5s';

alter table public."Job_Cargo"
  add column "JobCargo_SourceQuoteVersionID" uuid,
  add column "JobCargo_SourceQuoteLineID" uuid,
  add constraint "Job_Cargo_quote_line_source_fk" foreign key ("JobCargo_SourceQuoteVersionID","JobCargo_SourceQuoteLineID")
    references quote_api.version_cargo_lines(version_id,line_id) match full on delete restrict;
create index "Job_Cargo_quote_line_source_idx" on public."Job_Cargo" ("JobCargo_SourceQuoteVersionID","JobCargo_SourceQuoteLineID")
  where "JobCargo_SourceQuoteVersionID" is not null;
create unique index "Job_Cargo_active_quote_line_idx" on public."Job_Cargo" ("JobCargo_JobID","JobCargo_SourceQuoteLineID")
  where not "JobCargo_IsDeleted" and "JobCargo_SourceQuoteLineID" is not null;

create function quote_api.cargo_booking_missing(lines jsonb)
returns text[] language plpgsql immutable set search_path='' as $$
declare item jsonb; key text; number_value numeric; line_number integer:=0; missing text[]:='{}';
begin
  -- Match actual typed Booking columns; do not silently truncate or round.
  for item in select value from jsonb_array_elements(quote_api.normalise_cargo_lines(lines,false)) loop
    line_number:=line_number+1;
    foreach key in array array['grossWeightKg','netWeightKg','length','width','height'] loop
      number_value:=(item->>key)::numeric;
      if number_value<>round(number_value,2) then
        missing:=array_append(missing,format('Cargo line %s: %s supports up to 2 decimal places in Booking',line_number,
          case key when 'grossWeightKg' then 'gross weight (kg)' when 'netWeightKg' then 'net weight (kg)' else key end));
      end if;
    end loop;
    number_value:=(item->>'volumeCbm')::numeric;
    if number_value<>round(number_value,6) then missing:=array_append(missing,format('Cargo line %s: volume supports up to 6 decimal places in Booking',line_number)); end if;
    if length(item->>'commodity')>50 then missing:=array_append(missing,format('Cargo line %s: commodity supports up to 50 characters; use goods description for additional detail',line_number)); end if;
    if length(item->>'packageType')>40 then missing:=array_append(missing,format('Cargo line %s: package type supports up to 40 characters',line_number)); end if;
    if length(item->>'hsCode')>30 then missing:=array_append(missing,format('Cargo line %s: HS code supports up to 30 characters',line_number)); end if;
  end loop;
  return missing;
exception when invalid_parameter_value then
  return array['Correct cargo line data before Booking handover: '||sqlerrm];
end;
$$;
revoke all on function quote_api.cargo_booking_missing(jsonb) from public,anon,authenticated;
grant execute on function quote_api.cargo_booking_missing(jsonb) to service_role;

do $migration$
declare definition text:=pg_get_functiondef('booking_api.quote_readiness(uuid)'::regprocedure);
  anchor text:=E'      coalesce(version_facts->''cargoLines'',facts->''cargoLines''),mode_value,shipment_value);';
begin
  if position(anchor in definition)=0 then raise exception 'Review cargo readiness before adding lossless handover checks.'; end if;
  execute replace(definition,anchor,anchor||E'\n    missing := missing || quote_api.cargo_booking_missing(coalesce(version_facts->''cargoLines'',facts->''cargoLines''));');
end;
$migration$;

create function booking_api.insert_accepted_quote_cargo(requested_job_id uuid, requested_version_id uuid, actor_user_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare snapshot jsonb; facts jsonb; lines jsonb; missing text[];
begin
  -- Internal-only helper, called inside initial conversion's transaction.
  -- Bind both the job and the source lines to the exact accepted version.
  select version."CusQuoteVersion_SnapshotJSON" into snapshot
    from public."CusQuote_Versions" version
    join public."Job_Header" job on job."Job_SourceQuoteVersionID"=version."CusQuoteVersion_ID"
      and job."Job_SourceQuoteID"=version."CusQuoteHeader_ID"
    join public."CusQuote_Header" quote on quote."CusQuoteHeader_ID"=version."CusQuoteHeader_ID"
      and quote."CusQuoteHeader_AcceptedVersionID"=version."CusQuoteVersion_ID"
    where job."Job_ID"=requested_job_id and not job."Job_IsDeleted"
      and version."CusQuoteVersion_ID"=requested_version_id and version."CusQuoteVersion_IsSubmitted"
      and quote."CusQuoteHeader_LifecycleCode"='accepted' and not quote."CusQuoteHeader_IsDeleted";
  if not found then raise exception 'Cargo handover requires the exact accepted quote version.' using errcode='22023'; end if;
  facts:=snapshot#>'{quote,shipmentFacts}';
  lines:=quote_api.normalise_cargo_lines(facts->'cargoLines',true);
  missing:=quote_api.cargo_booking_missing(lines);
  if cardinality(missing)>0 then raise exception 'Correct cargo before Booking handover.' using errcode='22023',detail=to_jsonb(missing)::text; end if;
  if exists(select 1 from public."Job_Cargo" where "JobCargo_JobID"=requested_job_id) then
    raise exception 'Initial cargo handover cannot replace existing Booking cargo.' using errcode='22023';
  end if;
  if (select count(*) from quote_api.version_cargo_lines where version_id=requested_version_id)<>jsonb_array_length(lines) then
    raise exception 'Accepted cargo projection is incomplete.' using errcode='22023';
  end if;
  insert into public."Job_Cargo" (
    "JobCargo_JobID","JobCargo_LineNo","JobCargo_Description","JobCargo_Commodity","JobCargo_Qty","JobCargo_PackageQty",
    "JobCargo_PackageTypeCodeSnapshot","JobCargo_GrossKilos","JobCargo_NettKilos","JobCargo_VolumeCBM",
    "JobCargo_Length","JobCargo_Width","JobCargo_Height","JobCargo_LengthUnit","JobCargo_HSCode","JobCargo_CountryOfOriginCodeSnapshot",
    "JobCargo_IsHazardous","JobCargo_IsTemperatureControlled",
    "JobCargo_DeclaredValueAmount","JobCargo_DeclaredValueCurrencyCodeSnapshot",
    "JobCargo_SourceQuoteVersionID","JobCargo_SourceQuoteLineID","JobCargo_CargoJSON","JobCargo_UpdatedBy"
  ) select requested_job_id,line_number,description,commodity,package_quantity,package_quantity,
    package_type,gross_weight_kg,net_weight_kg,volume_cbm,length,width,height,length_unit,hs_code,country_of_origin,
    is_hazardous,is_temperature_controlled,
    case when jsonb_array_length(lines)=1 then nullif(regexp_replace(coalesce(facts->>'goodsValue',''),'[^0-9.-]','','g'),'')::numeric end,
    case when jsonb_array_length(lines)=1 then coalesce(nullif(upper(facts->>'goodsValueCurrency'),''),nullif(upper(snapshot#>>'{quote,currency}'),'')) end,
    version_id,line_id,
    -- Compatibility for existing dimension/chargeable readers, not a replacement
    -- for typed provenance or an allocation of shipment-wide declared value.
    lines->(line_number-1)||jsonb_build_object('source','accepted_quote','quoteVersionId',version_id,'quoteCargoLineId',line_id),actor_user_id
    from quote_api.version_cargo_lines where version_id=requested_version_id order by line_number;
end;
$$;
revoke all on function booking_api.insert_accepted_quote_cargo(uuid,uuid,uuid) from public,anon,authenticated,service_role;

do $migration$
declare
  definition text:=pg_get_functiondef('booking_api.convert_accepted_quote_before_sync_review_20260904(uuid,uuid,uuid)'::regprocedure);
  anchor text:=$anchor$  if nullif(btrim(coalesce(facts->>'knownCargo', facts->>'commodity')), '') is not null then$anchor$;
begin
  if position(anchor in definition)=0 or position('insert_accepted_quote_cargo' in definition)>0 then
    raise exception 'Initial Quote conversion changed; review cargo integration before applying.';
  end if;
  execute replace(definition,anchor,E'  if facts ? ''cargoLines'' then\n    perform booking_api.insert_accepted_quote_cargo(job_id,version_row."CusQuoteVersion_ID",actor_user_id);\n  elsif nullif(btrim(coalesce(facts->>''knownCargo'', facts->>''commodity'')), '''') is not null then');
end;
$migration$;
commit;
