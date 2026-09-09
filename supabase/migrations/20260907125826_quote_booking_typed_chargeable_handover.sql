begin;
set local lock_timeout='5s';

-- These two accepted-Quote writers intentionally bypass ordinary Booking save.
-- Extend their typed projection without replacing approval, locks or audit.
do $$declare definition text; target_function text; pair record;
begin
  foreach target_function in array array[
    'booking_api.insert_accepted_quote_cargo(uuid,uuid,uuid)',
    'booking_api.apply_quote_cargo_fields(uuid,uuid,uuid,jsonb,jsonb)'
  ] loop
    definition:=pg_get_functiondef(target_function::regprocedure);
    for pair in select * from (values
      ('"JobCargo_PackageTypeCodeSnapshot","JobCargo_GrossKilos","JobCargo_NettKilos","JobCargo_VolumeCBM",',
       '"JobCargo_PackageTypeCodeSnapshot","JobCargo_GrossKilos","JobCargo_NettKilos","JobCargo_VolumeCBM","JobCargo_ChargeableWeightKg",')
    ) replacements(old_text,new_text) loop
      if (length(definition)-length(replace(definition,pair.old_text,'')))/length(pair.old_text)<>1 then
        raise exception 'Review typed cargo insertion in %',target_function; end if;
      definition:=replace(definition,pair.old_text,pair.new_text);
    end loop;
    if target_function like 'booking_api.insert_accepted_quote_cargo%' then
      for pair in select * from (values
        ('package_type,gross_weight_kg,net_weight_kg,volume_cbm,length,width,height,',
         'package_type,gross_weight_kg,net_weight_kg,volume_cbm,chargeable_weight_kg,length,width,height,')
      ) replacements(old_text,new_text) loop
        if (length(definition)-length(replace(definition,pair.old_text,'')))/length(pair.old_text)<>1 then
          raise exception 'Review accepted Quote cargo projection'; end if;
        definition:=replace(definition,pair.old_text,pair.new_text);
      end loop;
    else
      for pair in select * from (values
        ($old$target->>'packageType',(target->>'grossWeightKg')::numeric,(target->>'netWeightKg')::numeric,(target->>'volumeCbm')::numeric,$old$,
         $new$target->>'packageType',(target->>'grossWeightKg')::numeric,(target->>'netWeightKg')::numeric,(target->>'volumeCbm')::numeric,(target->>'chargeableWeightKg')::numeric,$new$),
        ($old$"JobCargo_GrossKilos"=case when write_fields ? (field_prefix||'grossWeightKg')$old$,
         $new$"JobCargo_ChargeableWeightKg"=case when write_fields ? (field_prefix||'chargeableWeightKg') then (target->>'chargeableWeightKg')::numeric else "JobCargo_ChargeableWeightKg" end,
        "JobCargo_GrossKilos"=case when write_fields ? (field_prefix||'grossWeightKg')$new$)
      ) replacements(old_text,new_text) loop
        if (length(definition)-length(replace(definition,pair.old_text,'')))/length(pair.old_text)<>1 then
          raise exception 'Review selective Quote cargo weight projection'; end if;
        definition:=replace(definition,pair.old_text,pair.new_text);
      end loop;
    end if;
    execute definition;
  end loop;
end $$;
commit;
