-- Typed cargo belongs to a Quote VERSION, not the mutable master or Booking.
-- Snapshot JSON remains the immutable document evidence. This projection has
-- no independent write API: the normal Quote save/submission boundary owns it.
begin;

create function quote_api.normalise_cargo_lines(lines jsonb, require_complete boolean default false)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  item jsonb; result jsonb := '[]'; normalised jsonb; key text; raw text;
  line_id uuid; seen uuid[] := '{}'; number_value numeric;
  text_fields constant text[] := array['description','commodity','packageType','hsCode','countryOfOrigin'];
  number_fields constant text[] := array['packageQuantity','grossWeightKg','netWeightKg','volumeCbm','chargeableWeightKg','length','width','height'];
  boolean_fields constant text[] := array['isHazardous','isTemperatureControlled'];
begin
  if jsonb_typeof(lines) is distinct from 'array' then
    raise exception 'Cargo lines must be a list.' using errcode = '22023';
  end if;
  if jsonb_array_length(lines) > 500 then
    raise exception 'A quote supports up to 500 cargo lines.' using errcode = '22023';
  end if;
  if require_complete and jsonb_array_length(lines) = 0 then
    raise exception 'Add at least one cargo line before submitting the quote.' using errcode = '22023';
  end if;
  for item in select value from jsonb_array_elements(lines) loop
    if jsonb_typeof(item) <> 'object' then
      raise exception 'Each cargo line must be an object.' using errcode = '22023';
    end if;
    for key in select jsonb_object_keys(item) loop
      if not key = any(text_fields || number_fields || boolean_fields || array['id','lengthUnit']) then
        raise exception 'Unsupported quote cargo field: %.', key using errcode = '22023';
      end if;
    end loop;
    if jsonb_typeof(item->'id') is distinct from 'string'
       or (item->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Each cargo line needs a stable identifier.' using errcode = '22023';
    end if;
    line_id := (item->>'id')::uuid;
    if line_id = any(seen) then
      raise exception 'Cargo line identifiers cannot be duplicated.' using errcode = '22023';
    end if;
    seen := array_append(seen, line_id);
    normalised := jsonb_build_object('id', line_id);
    foreach key in array text_fields loop
      if item ? key and jsonb_typeof(item->key) not in ('string','null') then
        raise exception 'Cargo % must be text.', key using errcode = '22023';
      end if;
      raw := nullif(btrim(item->>key), '');
      if length(raw) > 4000 then
        raise exception 'Cargo % is too long.', key using errcode = '22023';
      end if;
      if key = 'countryOfOrigin' then
        raw := upper(raw);
        if raw is not null and raw !~ '^[A-Z]{2}$' then
          raise exception 'Cargo origin must use a two-letter country code.' using errcode = '22023';
        end if;
      end if;
      normalised := normalised || jsonb_build_object(key, raw);
    end loop;
    if require_complete and normalised->>'description' is null then
      raise exception 'Describe every cargo line before submitting the quote.' using errcode = '22023';
    end if;
    foreach key in array number_fields loop
      if item ? key and jsonb_typeof(item->key) not in ('string','number','null') then
        raise exception 'Cargo % must be a non-negative number.', key using errcode = '22023';
      end if;
      raw := nullif(btrim(item->>key), '');
      if raw is not null and (length(raw) > 32 or raw !~ '^[0-9]+([.][0-9]+)?$') then
        raise exception 'Cargo % must be a finite non-negative number.', key using errcode = '22023';
      end if;
      number_value := raw::numeric;
      if number_value > 999999999999 then
        raise exception 'Cargo % exceeds the supported amount.', key using errcode = '22023';
      end if;
      if key = 'packageQuantity' and number_value <> trunc(number_value) then
        raise exception 'Cargo package quantity must be a whole number.' using errcode = '22023';
      end if;
      normalised := normalised || jsonb_build_object(key, number_value);
    end loop;
    raw := coalesce(nullif(btrim(item->>'lengthUnit'), ''), 'cm');
    if raw not in ('cm','m','in') then
      raise exception 'Cargo dimensions must use cm, m or in.' using errcode = '22023';
    end if;
    normalised := normalised || jsonb_build_object('lengthUnit', raw);
    foreach key in array boolean_fields loop
      if item ? key and jsonb_typeof(item->key) is distinct from 'boolean' then
        raise exception 'Cargo % must be true or false.', key using errcode = '22023';
      end if;
      normalised := normalised || jsonb_build_object(key, coalesce((item->>key)::boolean, false));
    end loop;
    result := result || jsonb_build_array(normalised);
  end loop;
  return result;
end;
$$;

create table quote_api.version_cargo_lines (
  version_id uuid not null references public."CusQuote_Versions"("CusQuoteVersion_ID") on delete cascade,
  line_id uuid not null,
  line_number integer not null check (line_number between 1 and 500),
  description text,
  commodity text,
  package_quantity numeric check (package_quantity >= 0 and package_quantity <= 999999999999 and package_quantity = trunc(package_quantity)),
  package_type text,
  gross_weight_kg numeric check (gross_weight_kg >= 0 and gross_weight_kg <= 999999999999),
  net_weight_kg numeric check (net_weight_kg >= 0 and net_weight_kg <= 999999999999),
  volume_cbm numeric check (volume_cbm >= 0 and volume_cbm <= 999999999999),
  chargeable_weight_kg numeric check (chargeable_weight_kg >= 0 and chargeable_weight_kg <= 999999999999),
  length numeric check (length >= 0 and length <= 999999999999),
  width numeric check (width >= 0 and width <= 999999999999),
  height numeric check (height >= 0 and height <= 999999999999),
  length_unit text not null check (length_unit in ('cm','m','in')),
  hs_code text,
  country_of_origin text check (country_of_origin ~ '^[A-Z]{2}$'),
  is_hazardous boolean not null,
  is_temperature_controlled boolean not null,
  primary key (version_id, line_id),
  unique (version_id, line_number) deferrable initially deferred
);

alter table quote_api.version_cargo_lines enable row level security;
revoke all on quote_api.version_cargo_lines from public, anon, authenticated, service_role;
grant select on quote_api.version_cargo_lines to service_role;
comment on table quote_api.version_cargo_lines is
  'Internal typed projection of version snapshot cargoLines. No independent write API. Legacy flat snapshots are not rewritten or guessed. Company and Quote identity are inherited through version_id.';

create function quote_api.validate_version_cargo()
returns trigger language plpgsql security definer set search_path = '' as $$
declare lines jsonb;
begin
  -- The existing submitted-version mutation guard remains authoritative.
  -- Never normalise or rewrite already-submitted evidence on a status update.
  if tg_op = 'UPDATE' and old."CusQuoteVersion_IsSubmitted" then return new; end if;
  lines := new."CusQuoteVersion_SnapshotJSON" #> '{quote,shipmentFacts,cargoLines}';
  if lines is not null then
    new."CusQuoteVersion_SnapshotJSON" := jsonb_set(new."CusQuoteVersion_SnapshotJSON",
      '{quote,shipmentFacts,cargoLines}',
      quote_api.normalise_cargo_lines(lines, new."CusQuoteVersion_IsSubmitted"));
  end if;
  return new;
end;
$$;

create function quote_api.project_version_cargo(requested_version_id uuid, snapshot jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare lines jsonb;
begin
  -- This helper is not callable by any application role. A version trigger
  -- invokes it within the same save transaction, including draft collapsing.
  lines := quote_api.normalise_cargo_lines(coalesce(snapshot #> '{quote,shipmentFacts,cargoLines}', '[]'::jsonb));
  delete from quote_api.version_cargo_lines existing
    where version_id = requested_version_id
      and not exists(select 1 from jsonb_array_elements(lines) item where (item->>'id')::uuid = existing.line_id);
  insert into quote_api.version_cargo_lines as existing (
    version_id,line_id,line_number,description,commodity,package_quantity,package_type,
    gross_weight_kg,net_weight_kg,volume_cbm,chargeable_weight_kg,length,width,height,length_unit,
    hs_code,country_of_origin,is_hazardous,is_temperature_controlled
  )
  select requested_version_id,(item->>'id')::uuid,ordinality::integer,item->>'description',item->>'commodity',
    (item->>'packageQuantity')::numeric,item->>'packageType',(item->>'grossWeightKg')::numeric,
    (item->>'netWeightKg')::numeric,(item->>'volumeCbm')::numeric,(item->>'chargeableWeightKg')::numeric,
    (item->>'length')::numeric,(item->>'width')::numeric,(item->>'height')::numeric,item->>'lengthUnit',
    item->>'hsCode',item->>'countryOfOrigin',(item->>'isHazardous')::boolean,(item->>'isTemperatureControlled')::boolean
  from jsonb_array_elements(lines) with ordinality as cargo(item,ordinality)
  on conflict (version_id,line_id) do update set
    line_number=excluded.line_number,description=excluded.description,commodity=excluded.commodity,
    package_quantity=excluded.package_quantity,package_type=excluded.package_type,
    gross_weight_kg=excluded.gross_weight_kg,net_weight_kg=excluded.net_weight_kg,
    volume_cbm=excluded.volume_cbm,chargeable_weight_kg=excluded.chargeable_weight_kg,
    length=excluded.length,width=excluded.width,height=excluded.height,length_unit=excluded.length_unit,
    hs_code=excluded.hs_code,country_of_origin=excluded.country_of_origin,
    is_hazardous=excluded.is_hazardous,is_temperature_controlled=excluded.is_temperature_controlled
  where to_jsonb(existing) is distinct from to_jsonb(excluded);
end;
$$;

create function quote_api.sync_version_cargo()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new."CusQuoteVersion_SnapshotJSON" = old."CusQuoteVersion_SnapshotJSON" then return new; end if;
  perform quote_api.project_version_cargo(new."CusQuoteVersion_ID",new."CusQuoteVersion_SnapshotJSON");
  return new;
end;
$$;

create trigger quote_version_validate_cargo
before insert or update of "CusQuoteVersion_SnapshotJSON", "CusQuoteVersion_IsSubmitted" on public."CusQuote_Versions"
for each row execute function quote_api.validate_version_cargo();
create trigger quote_version_project_cargo
after insert or update of "CusQuoteVersion_SnapshotJSON" on public."CusQuote_Versions"
for each row execute function quote_api.sync_version_cargo();

-- Existing structured snapshots, if any, are projected without changing their
-- forensic source. Legacy summaries remain absent, not invented allocations.
do $$
declare version record;
begin
  for version in select "CusQuoteVersion_ID", "CusQuoteVersion_SnapshotJSON"
    from public."CusQuote_Versions"
    where "CusQuoteVersion_SnapshotJSON" #> '{quote,shipmentFacts,cargoLines}' is not null loop
    perform quote_api.project_version_cargo(version."CusQuoteVersion_ID",version."CusQuoteVersion_SnapshotJSON");
  end loop;
end;
$$;

revoke all on function quote_api.normalise_cargo_lines(jsonb,boolean) from public,anon,authenticated;
grant execute on function quote_api.normalise_cargo_lines(jsonb,boolean) to service_role;
revoke all on function quote_api.validate_version_cargo() from public,anon,authenticated,service_role;
revoke all on function quote_api.project_version_cargo(uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function quote_api.sync_version_cargo() from public,anon,authenticated,service_role;
commit;
