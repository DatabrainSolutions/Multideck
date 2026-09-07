begin;
set local lock_timeout='5s';
do $$declare definition text; anchor text;
begin
  definition:=pg_get_functiondef('booking_api.cargo_public_values(public."Job_Cargo")'::regprocedure);
  anchor:='''archived'', item."JobCargo_IsDeleted"';
  if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then
    raise exception 'Review cargo read projection before adding chargeable weight';end if;
  execute replace(definition,anchor,'''chargeableWeightKg'', item."JobCargo_ChargeableWeightKg"::text, '||anchor);
  definition:=pg_get_functiondef('public.multideck_dexter_action_update_booking_cargo(uuid,uuid,jsonb)'::regprocedure);
  anchor:='''packageType'',''grossWeightKg''';
  if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then
    raise exception 'Review cargo action allowlist before adding chargeable weight';end if;
  -- Preserve exact input text. The existing canonical normalizer validates it.
  execute replace(definition,anchor,'''packageType'',''chargeableWeightKg'',''grossWeightKg''');
end $$;

update public."sys_AIDexterActions" set
  "AIDexterAction_ParametersJSON"=jsonb_set("AIDexterAction_ParametersJSON",'{properties,field,enum}',
    ("AIDexterAction_ParametersJSON"#>'{properties,field,enum}')||'"chargeableWeightKg"'::jsonb),
  "AIDexterAction_Description"="AIDexterAction_Description"||' Chargeable weight is an exact per-line operational kilogram value, not a shipment override or issued AWB amendment.',
  "AIDexterAction_UpdatedAt"=now()
where "AIDexterAction_Code"='update_booking_cargo'
  and not ("AIDexterAction_ParametersJSON"#>'{properties,field,enum}' ? 'chargeableWeightKg');
update public."sys_AIDexterDataDomains" set
  "AIDexterDomain_Description"="AIDexterDomain_Description"||' Includes typed per-line chargeable weight in kilograms; unknown remains null and is not inferred from gross weight or AWB documents.',
  "AIDexterDomain_UpdatedAt"=now() where "AIDexterDomain_Code"='booking_cargo';
update public."sys_AIDexterWatchCapabilities" set
  "AIDexterWatchCapability_FieldsJSON"="AIDexterWatchCapability_FieldsJSON"||'"chargeableWeightKg"'::jsonb,
  "AIDexterWatchCapability_Description"="AIDexterWatchCapability_Description"||' Chargeable weight watches use typed per-line kilograms, including explicit clearing.',
  "AIDexterWatchCapability_UpdatedAt"=now()
where "AIDexterWatchCapability_Code"='booking_cargo'
  and not ("AIDexterWatchCapability_FieldsJSON" ? 'chargeableWeightKg');
do $$begin
  if not exists(select 1 from public."sys_AIDexterActions" where "AIDexterAction_Code"='update_booking_cargo'
    and "AIDexterAction_AlwaysRequiresApproval" and "AIDexterAction_ParametersJSON"#>'{properties,field,enum}' ? 'chargeableWeightKg')
    then raise exception 'Chargeable cargo action must retain mandatory approval';end if;
end $$;
commit;
