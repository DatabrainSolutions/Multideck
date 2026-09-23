-- Only handover readiness changes; incomplete Quote/Booking saves remain allowed.
do $migration$
declare
  definition text;
  anchor text;
  readiness_gate text := $gate$  readiness := booking_api.customs_readiness(caller_auth_user_id, requested_job_id);
  if not coalesce((readiness->>'eligible')::boolean, false) then
    raise exception 'This booking is not eligible for a UK import or export Customs handoff.' using errcode = '22023';
  end if;
  if not coalesce((readiness->>'ready')::boolean, false) then
    raise exception 'Complete the required Customs fields before sending this booking.' using errcode = '22023', detail = readiness::text;
  end if;
$gate$;
begin
  definition := pg_get_functiondef('booking_api.customs_readiness(uuid,uuid)'::regprocedure);
  anchor := '  result_value := jsonb_set(result_value, ''{missing}'', filtered_missing, true);';
  if position(anchor in definition) = 0 or position('''commodity_code''' in definition) > 0 then
    raise exception 'Unexpected readiness definition; review before applying.';
  end if;
  execute replace(definition, anchor, $checks$
  -- Temporary product rule agreed 22 September 2026; review with senior staff.
  -- Presence/shape checks only, not a legal tariff classification decision.
  if not exists (
    select 1 from public."Job_Cargo" cargo where cargo."JobCargo_JobID" = requested_job_id and not cargo."JobCargo_IsDeleted"
  ) or exists (
    select 1 from public."Job_Cargo" cargo where cargo."JobCargo_JobID" = requested_job_id and not cargo."JobCargo_IsDeleted"
      and coalesce(btrim(cargo."JobCargo_HSCode"), '') !~ '^[0-9]{6,10}$'
  ) then
    filtered_missing := filtered_missing || jsonb_build_array(jsonb_build_object('key','commodity_code','label','Commodity code on every cargo line (6–10 digits)','section','Cargo'));
  end if;
  if not exists (
    select 1 from public."Job_Cargo" cargo where cargo."JobCargo_JobID" = requested_job_id and not cargo."JobCargo_IsDeleted"
  ) or exists (
    select 1 from public."Job_Cargo" cargo where cargo."JobCargo_JobID" = requested_job_id and not cargo."JobCargo_IsDeleted"
      and coalesce(cargo."JobCargo_NettKilos", 0) <= 0
  ) then
    filtered_missing := filtered_missing || jsonb_build_array(jsonb_build_object('key','net_weight','label','Net weight greater than zero on every cargo line','section','Cargo'));
  end if;
  if coalesce((
    select upper(btrim(party."JobParty_CountryCodeSnapshot")) from public."Job_Parties" party
    where party."JobParty_JobID" = requested_job_id and lower(party."JobParty_Role") in ('exporter','shipper','consignor')
    order by party."JobParty_IsPrimary" desc, party."JobParty_Sequence" limit 1
  ), '') !~ '^[A-Z]{2}$' then
    filtered_missing := filtered_missing || jsonb_build_array(jsonb_build_object('key','exporter_country','label','Consignor / shipper country code (two letters)','section','Parties'));
  end if;
  if coalesce((
    select upper(btrim(party."JobParty_CountryCodeSnapshot")) from public."Job_Parties" party
    where party."JobParty_JobID" = requested_job_id and lower(party."JobParty_Role") in ('importer','consignee')
    order by party."JobParty_IsPrimary" desc, party."JobParty_Sequence" limit 1
  ), '') !~ '^[A-Z]{2}$' then
    filtered_missing := filtered_missing || jsonb_build_array(jsonb_build_object('key','importer_country','label','Importer / consignee country code (two letters)','section','Parties'));
  end if;
$checks$ || anchor);

  definition := pg_get_functiondef('public.booking_workflow_customs_readiness(uuid,uuid)'::regprocedure);
  if position('total_checks := 15' in definition) = 0 then raise exception 'Unexpected readiness count'; end if;
  execute replace(definition, 'total_checks := 15', 'total_checks := 19');

  -- A new handover request must not bypass readiness merely because a draft exists.
  -- Opening that draft directly remains unaffected.
  definition := pg_get_functiondef('booking_api.send_to_customs(uuid,uuid,uuid)'::regprocedure);
  anchor := '  select declaration.* into existing_declaration';
  if position(readiness_gate in definition) = 0 or position(anchor in definition) = 0 then
    raise exception 'Unexpected handover definition; review before applying.';
  end if;
  definition := replace(definition, readiness_gate, '');
  definition := overlay(definition placing readiness_gate from position(anchor in definition) for 0);
  execute definition;
end;
$migration$;
