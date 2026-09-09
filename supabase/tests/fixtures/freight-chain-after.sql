do $$declare table_pair record;changed boolean;begin
  begin
    update public."CusQuote_Versions" set "CusQuoteVersion_SnapshotJSON"='{}'
      where "CusQuoteVersion_ID"='20000000-0000-4000-8000-000000000003';
    raise exception 'Submitted Quote snapshot was editable';
  exception when invalid_parameter_value then
    if sqlerrm<>'Submitted quote versions are immutable.' then raise;end if;
  end;
  begin
    delete from public."CusQuote_Versions" where "CusQuoteVersion_ID"='20000000-0000-4000-8000-000000000003';
    raise exception 'Submitted Quote was deletable';
  exception when invalid_parameter_value then
    if sqlerrm<>'Submitted quote versions are immutable.' then raise;end if;
  end;
  begin
    update public."CusQuote_Versions" set "CusQuoteVersion_SnapshotJSON"=jsonb_set("CusQuoteVersion_SnapshotJSON",
      '{quote,shipmentFacts,cargoLines}','null') where "CusQuoteVersion_ID"='20000000-0000-4000-8000-000000000004';
    raise exception 'Invalid draft cargo was accepted';
  exception when invalid_parameter_value then
    if sqlerrm<>'Cargo lines must be a list.' then raise;end if;
  end;
  for table_pair in select * from (values
    ('Job_Header','jobs_before',array['Job_GoodsValueAmount','Job_GoodsValueCurrencyCode']),
    ('Job_Cargo','cargo_before',array['JobCargo_SourceQuoteVersionID','JobCargo_SourceQuoteLineID']),
    ('Job_Containers','containers_before','{}'::text[]),
    ('Job_Routing','routes_before','{}'::text[]),
    ('Job_PackCargoContainer','memberships_before','{}'::text[]),
    ('AI_DexterWatchSignals','signals_before','{}'::text[])
  ) pairs(actual,previous,new_columns) loop
    execute format('select exists((select to_jsonb(t)-$1 from public.%I t except select to_jsonb(t) from freight_rehearsal.%I t)
      union all (select to_jsonb(t) from freight_rehearsal.%I t except select to_jsonb(t)-$1 from public.%I t))',
      table_pair.actual,table_pair.previous,table_pair.previous,table_pair.actual) into changed using table_pair.new_columns;
    if changed then raise exception 'Existing Booking evidence changed: %',table_pair.actual;end if;
  end loop;
  if exists(select 1 from public."Job_Header" where "Job_GoodsValueAmount" is not null or "Job_GoodsValueCurrencyCode" is not null)
    or exists(select 1 from public."Job_Cargo" where "JobCargo_SourceQuoteVersionID" is not null or "JobCargo_SourceQuoteLineID" is not null)
    or exists(select 1 from booking_api.cargo_equipment_allocations) then
    raise exception 'Migration invented shipment values, source identities or allocations';end if;
  if exists(select 1 from public."CusQuote_Versions" actual full join freight_rehearsal.versions_before previous
    using("CusQuoteVersion_ID") where to_jsonb(actual) is distinct from to_jsonb(previous)) then
    raise exception 'Migration changed existing Quote version evidence';end if;
  if exists(select 1 from public."CusQuote_Header" actual full join freight_rehearsal.headers_before previous
    using("CusQuoteHeader_ID") where to_jsonb(actual) is distinct from to_jsonb(previous)) then
    raise exception 'Migration changed existing Quote headers';end if;
  if (select count(*) from quote_api.version_cargo_lines)<>4 then raise exception 'Expected two projected lines per structured version only';end if;
  if exists(select 1 from quote_api.version_cargo_lines where version_id in (
    '20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002')) then
    raise exception 'Migration invented cargo allocations for legacy summaries';end if;
  if (select count(*) from quote_api.version_cargo_lines where description='Original text'
    and package_quantity=450 and gross_weight_kg=1500.1234 and country_of_origin='GB')<>2 then
    raise exception 'Typed projection lost precise values';end if;
  if (select count(*) from quote_api.version_cargo_lines where package_quantity=0 and volume_cbm=0.0001
    and gross_weight_kg is null and is_hazardous)<>2 then raise exception 'Zero, unknown or safety flag changed';end if;
  if (select to_jsonb(actual) from public."sys_AIDexterDataDomains" actual where "AIDexterDomain_Code"='rehearsal_unrelated')
    is distinct from (select to_jsonb(previous) from freight_rehearsal.unrelated_before previous) then
    raise exception 'Unrelated registry configuration changed';end if;
  if not exists(select 1 from public."sys_AIDexterActions" where "AIDexterAction_Code"='update_booking_cargo'
    and "AIDexterAction_IsActive" and "AIDexterAction_AlwaysRequiresApproval"
    and "AIDexterAction_RequiredPermissionsJSON"='["Bookings.Read","Bookings.Write"]'::jsonb) then
    raise exception 'Existing action did not receive current approval and permission guards';end if;
  if not exists(select 1 from public."sys_AIDexterDataDomains" where "AIDexterDomain_Code"='booking_cargo' and "AIDexterDomain_IsActive")
    or not exists(select 1 from public."sys_AIDexterWatchCapabilities" where "AIDexterWatchCapability_Code"='booking_cargo' and "AIDexterWatchCapability_IsActive") then
    raise exception 'Existing cargo registries not updated';end if;
end $$;
