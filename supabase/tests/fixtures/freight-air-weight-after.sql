set search_path='';
do $$declare pair record;changed boolean;signature text;
begin
  for pair in select * from (values
    ('CusQuote_Versions','versions_before'),('CusQuote_Header','headers_before'),('Job_Header','jobs_before'),
    ('Job_Containers','containers_before'),('Job_Routing','routes_before'),('Job_PackCargoContainer','memberships_before'),
    ('AI_DexterWatchSignals','signals_before')
  ) tables(actual,previous) loop
    execute format('select exists((select to_jsonb(t) from public.%I t except select to_jsonb(t) from freight_rehearsal.%I t)
      union all (select to_jsonb(t) from freight_rehearsal.%I t except select to_jsonb(t) from public.%I t))',
      pair.actual,pair.previous,pair.previous,pair.actual) into changed;
    if changed then raise exception 'Air migration changed existing full-row evidence: %',pair.actual;end if;
  end loop;
  if exists((select to_jsonb(c)-'JobCargo_ChargeableWeightKg' from public."Job_Cargo" c except select to_jsonb(c) from freight_rehearsal.cargo_before c)
    union all (select to_jsonb(c) from freight_rehearsal.cargo_before c except select to_jsonb(c)-'JobCargo_ChargeableWeightKg' from public."Job_Cargo" c)) then raise exception 'Legacy cargo values changed';end if;
  if exists(select 1 from public."Job_Cargo" c where "JobCargo_ChargeableWeightKg" is distinct from ("JobCargo_CargoJSON"->>'chargeableWeightKg')::numeric)
    or (select count(*) from public."Job_Cargo" where "JobCargo_ChargeableWeightKg" is null)<>1
    or (select count(*) from public."Job_Cargo" where "JobCargo_ChargeableWeightKg"=0)<>1 then raise exception 'Backfill precision/unknown/zero mismatch';end if;
  if exists(select 1 from freight_rehearsal.air_functions_before old left join pg_proc current on current.oid=to_regprocedure(old.signature)
    where old.proacl is distinct from current.proacl) then raise exception 'Existing function grants changed';end if;
  if exists(select 1 from freight_rehearsal.air_functions_before old left join pg_proc current on current.oid=to_regprocedure(old.signature)
    where old.definition is distinct from pg_get_functiondef(current.oid) and old.signature not in (
      'booking_api.normalise_cargo_numbers(jsonb)','booking_api.save_before_goods_value_20260905(uuid,uuid,jsonb)',
      'booking_api.cargo_decimal_values(public."Job_Cargo")','booking_api.current_source_cargo_lines(uuid)',
      'booking_api.cargo_public_values(public."Job_Cargo")','public.multideck_dexter_action_update_booking_cargo(uuid,uuid,jsonb)',
      'booking_api.insert_accepted_quote_cargo(uuid,uuid,uuid)','booking_api.apply_quote_cargo_fields(uuid,uuid,uuid,jsonb,jsonb)',
      'booking_api.save_booking_detail_fields(uuid,uuid,jsonb)','booking_api.shipment_value_dexter_values(public."Job_Header")',
      'public.multideck_dexter_execute_prepared_action(uuid,uuid,uuid,uuid)','public.multideck_dexter_domain_booking_shipment_value(uuid,text,integer)'
    )) then raise exception 'Unrelated application function changed';end if;
  signature:='public.multideck_dexter_action_update_booking_weight_override(uuid,uuid,jsonb)';
  if has_function_privilege('anon',signature,'execute') or has_function_privilege('authenticated',signature,'execute')
    or not has_function_privilege('service_role',signature,'execute') then raise exception 'Weight override action boundary incorrect';end if;
  if not exists(select 1 from public."sys_AIDexterActions" where "AIDexterAction_Code"='update_booking_weight_override' and "AIDexterAction_AlwaysRequiresApproval") then raise exception 'Mandatory override approval missing';end if;
  if not exists(select 1 from public."sys_AIDexterWatchCapabilities" where "AIDexterWatchCapability_Code"='booking_shipment_value'
    and "AIDexterWatchCapability_FieldsJSON" ?& array['amount','currency','chargeableWeightOverrideKg']) then raise exception 'Shipment watch fields lost';end if;
end $$;
reset search_path;
