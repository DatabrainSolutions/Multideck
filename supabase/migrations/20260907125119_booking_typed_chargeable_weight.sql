begin;
set local lock_timeout='5s';
alter table public."Job_Cargo" add column "JobCargo_ChargeableWeightKg" numeric
  check ("JobCargo_ChargeableWeightKg">=0 and "JobCargo_ChargeableWeightKg"<=999999999999);

-- Validate before converting; retain the original JSON verbatim as evidence.
-- Any malformed legacy value aborts the migration for explicit review.
update public."Job_Cargo" c set "JobCargo_ChargeableWeightKg"=
  (booking_api.normalise_cargo_numbers(jsonb_build_array(jsonb_build_object(
    'chargeableWeightKg',c."JobCargo_CargoJSON"->'chargeableWeightKg')))#>>'{0,chargeableWeightKg}')::numeric
where c."JobCargo_CargoJSON" ? 'chargeableWeightKg'
  and c."JobCargo_CargoJSON"->'chargeableWeightKg'<>'null'::jsonb;

-- Extend the actual stable-identity writer, not a second mutation path.
-- Fail closed if its reviewed insertion/upsert shape has changed.
do $$declare definition text; pair record;
begin
  definition:=pg_get_functiondef('booking_api.save_before_goods_value_20260905(uuid,uuid,jsonb)'::regprocedure);
  for pair in select * from (values
    ('"JobCargo_IsHazardous", "JobCargo_IsTemperatureControlled", "JobCargo_CargoJSON", "JobCargo_UpdatedBy"',
     '"JobCargo_ChargeableWeightKg", "JobCargo_IsHazardous", "JobCargo_IsTemperatureControlled", "JobCargo_CargoJSON", "JobCargo_UpdatedBy"'),
    ('coalesce((line->>''isHazardous'')::boolean, false), coalesce((line->>''isTemperatureControlled'')::boolean, false),',
     '(line->>''chargeableWeightKg'')::numeric, coalesce((line->>''isHazardous'')::boolean, false), coalesce((line->>''isTemperatureControlled'')::boolean, false),'),
    ('"JobCargo_CargoJSON" = public."Job_Cargo"."JobCargo_CargoJSON" || excluded."JobCargo_CargoJSON",',
     '"JobCargo_ChargeableWeightKg" = case when excluded."JobCargo_CargoJSON" ? ''chargeableWeightKg'' then excluded."JobCargo_ChargeableWeightKg" else public."Job_Cargo"."JobCargo_ChargeableWeightKg" end,
          "JobCargo_CargoJSON" = public."Job_Cargo"."JobCargo_CargoJSON" || excluded."JobCargo_CargoJSON",')
  ) replacements(old_text,new_text) loop
    if (length(definition)-length(replace(definition,pair.old_text,'')))/length(pair.old_text)<>1 then
      raise exception 'Review canonical cargo writer before adding typed chargeable weight';end if;
    definition:=replace(definition,pair.old_text,pair.new_text);
  end loop;
  execute definition;
end $$;

create or replace function booking_api.cargo_decimal_values(item public."Job_Cargo")
returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object(
    'pieces',item."JobCargo_Qty"::text,'packageQuantity',item."JobCargo_PackageQty"::text,
    'grossWeightKg',item."JobCargo_GrossKilos"::text,'netWeightKg',item."JobCargo_NettKilos"::text,
    'volumeCbm',item."JobCargo_VolumeCBM"::text,'length',item."JobCargo_Length"::text,
    'width',item."JobCargo_Width"::text,'height',item."JobCargo_Height"::text,
    'declaredValue',item."JobCargo_DeclaredValueAmount"::text,
    'chargeableWeightKg',item."JobCargo_ChargeableWeightKg"::text);
$$;

-- Quote revision comparison now reads operational typed values, never stale JSON.
do $$declare definition text; source_text text:='cargo."JobCargo_CargoJSON"->''chargeableWeightKg''';
begin
  definition:=pg_get_functiondef('booking_api.current_source_cargo_lines(uuid)'::regprocedure);
  if (length(definition)-length(replace(definition,source_text,'')))/length(source_text)<>1 then
    raise exception 'Review Quote cargo comparison before changing chargeable source';end if;
  execute replace(definition,source_text,'to_jsonb(cargo."JobCargo_ChargeableWeightKg")');
end $$;
commit;
