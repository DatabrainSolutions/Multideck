begin;
set local lock_timeout='5s';

-- Shared by the existing canonical save, dimensions, and public save stages.
-- Keep all existing numeric-field validation and privileges intact.
alter function booking_api.normalise_cargo_numbers(jsonb)
  rename to normalise_cargo_numbers_before_chargeable_weight_20260907;

create function booking_api.normalise_cargo_numbers(lines jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare result jsonb:='[]'; item jsonb; raw text; amount numeric; line_no integer:=0;
begin
  for item in select value from jsonb_array_elements(
    booking_api.normalise_cargo_numbers_before_chargeable_weight_20260907(lines)) loop
    line_no:=line_no+1;
    if item ? 'chargeableWeightKg' then
      if jsonb_typeof(item->'chargeableWeightKg') not in ('string','number','null') then
        raise exception 'Cargo line %: chargeable weight (kg) must be a number.',line_no using errcode='22023';
      end if;
      raw:=nullif(btrim(item->>'chargeableWeightKg'),'');
      if raw is null then
        item:=jsonb_set(item,'{chargeableWeightKg}','null');
      else
        if length(raw)>64 or (raw !~ '^[0-9]+([.][0-9]+)?$' and raw !~ '^[0-9]{1,3}(,[0-9]{3})+([.][0-9]+)?$') then
          raise exception 'Cargo line %: chargeable weight (kg) must be a non-negative decimal number.',line_no using errcode='22023';
        end if;
        amount:=replace(raw,',','')::numeric;
        -- Match the Quote cargo bound without imposing the gross-weight scale.
        if amount>999999999999 then
          raise exception 'Cargo line %: chargeable weight (kg) exceeds the supported maximum.',line_no using errcode='22023';
        end if;
        item:=jsonb_set(item,'{chargeableWeightKg}',to_jsonb(amount::text));
      end if;
    end if;
    result:=result||jsonb_build_array(item);
  end loop;
  return result;
end $$;

revoke all on function booking_api.normalise_cargo_numbers(jsonb),
  booking_api.normalise_cargo_numbers_before_chargeable_weight_20260907(jsonb)
  from public,anon,authenticated,service_role;
commit;
