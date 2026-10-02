begin;
set local lock_timeout='5s';

-- Quote pricing needs equipment/packing, not a completed goods declaration.
-- Keep strict types, stable IDs, safety flags and saved-version consistency.
do $migration$
declare definition text; block text;
begin
  definition:=pg_get_functiondef('quote_api.normalise_cargo_lines(jsonb,boolean)'::regprocedure);
  block:=$block$  if require_complete and jsonb_array_length(lines) = 0 then
    raise exception 'Add at least one cargo line before submitting the quote.' using errcode = '22023';
  end if;$block$;
  if position(block in definition)=0 then raise exception 'Review cargo normalisation before making goods optional.'; end if;
  definition:=replace(definition,block,'');
  block:=$block$    if require_complete and normalised->>'description' is null then
      raise exception 'Describe every cargo line before submitting the quote.' using errcode = '22023';
    end if;$block$;
  if position(block in definition)=0 then raise exception 'Review cargo description validation before making goods optional.'; end if;
  execute replace(definition,block,'');

  definition:=pg_get_functiondef('booking_api.readiness_before_goods_value_20260905(uuid)'::regprocedure);
  block:=$block$  if nullif(btrim(coalesce(facts->>'knownCargo', facts->>'commodity')), '') is null then missing := array_append(missing, 'Goods description'); end if;$block$;
  if position(block in definition)=0 then raise exception 'Review legacy Quote readiness before making goods optional.'; end if;
  execute replace(definition,block,'');
end $migration$;

create or replace function quote_api.cargo_issue_missing(lines jsonb, mode_code text, shipment_type text)
returns text[] language plpgsql immutable set search_path='' as $$
declare
  normalised jsonb; item jsonb; line_number integer:=0; label text;
  missing text[]:='{}'; dimension_count integer;
  containerised boolean:=lower(coalesce(shipment_type,'')) like '%fcl%'
    or lower(coalesce(shipment_type,'')) like '%container%';
begin
  begin
    normalised:=quote_api.normalise_cargo_lines(lines,false);
  exception when invalid_parameter_value then
    return array['Correct cargo line data: '||sqlerrm];
  end;
  -- Container quantity/type is enforced by the existing header equipment gate.
  if containerised then return missing; end if;
  if jsonb_array_length(normalised)=0 then return array['At least one cargo line']; end if;
  for item in select value from jsonb_array_elements(normalised) loop
    line_number:=line_number+1;
    label:=format('Cargo line %s: ',line_number);
    if coalesce((item->>'packageQuantity')::numeric,0)<=0 then
      missing:=array_append(missing,label||'positive package / piece quantity');
    end if;
    if item->>'packageType' is null then missing:=array_append(missing,label||'package type'); end if;
    select count(*) into dimension_count from unnest(array['length','width','height']) key
      where coalesce((item->>key)::numeric,0)>0;
    if dimension_count between 1 and 2 then
      missing:=array_append(missing,label||'complete positive length, width and height');
    elsif dimension_count=0
      and coalesce((item->>'grossWeightKg')::numeric,0)<=0
      and coalesce((item->>'chargeableWeightKg')::numeric,0)<=0
      and coalesce((item->>'volumeCbm')::numeric,0)<=0 then
      missing:=array_append(missing,label||'dimensions, weight or volume for pricing');
    end if;
  end loop;
  return missing;
end;
$$;
revoke all on function quote_api.cargo_issue_missing(jsonb,text,text) from public,anon,authenticated;
grant execute on function quote_api.cargo_issue_missing(jsonb,text,text) to service_role;

-- Existing cargo reads/writes/watches use these same saved fields; no new
-- adapter, automatic write or recurring LLM evaluation is introduced.
update public."sys_AIDexterDataDomains" set
  "AIDexterDomain_Description"="AIDexterDomain_Description"||' Quote goods details are optional. Pricing uses container requests or package quantity/type with dimensions, weight or volume; never invent missing goods data.',
  "AIDexterDomain_UpdatedAt"=now()
where "AIDexterDomain_Code" in ('quotes','quote_cargo');
update public."sys_AIDexterWatchCapabilities" set
  "AIDexterWatchCapability_Description"="AIDexterWatchCapability_Description"||' Goods details may be absent at Quote stage; notify only on actual saved changes to the selected cargo fields.',
  "AIDexterWatchCapability_UpdatedAt"=now()
where "AIDexterWatchCapability_Code"='quote_cargo';
commit;
