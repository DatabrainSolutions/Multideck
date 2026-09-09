-- Structured cargo must be checked before creating a response link or sending
-- email, not only by the submitted-version trigger after delivery.
begin;

create function quote_api.cargo_issue_missing(lines jsonb, mode_code text, shipment_type text)
returns text[] language plpgsql immutable set search_path = '' as $$
declare
  normalised jsonb; item jsonb; line_number integer := 0; label text;
  missing text[] := '{}'; mode_value text := lower(coalesce(mode_code,''));
  containerised boolean := lower(coalesce(shipment_type,'')) like '%fcl%'
    or lower(coalesce(shipment_type,'')) like '%container%';
begin
  -- Incomplete values are allowed in a draft; issue returns actionable labels.
  begin
    normalised := quote_api.normalise_cargo_lines(lines, false);
  exception when invalid_parameter_value then
    return array['Correct cargo line data: ' || sqlerrm];
  end;
  if jsonb_array_length(normalised)=0 then return array['At least one cargo line']; end if;
  for item in select value from jsonb_array_elements(normalised) loop
    line_number := line_number + 1;
    label := format('Cargo line %s: ',line_number);
    if item->>'description' is null then missing := array_append(missing,label || 'goods description'); end if;
    if not containerised then
      if coalesce((item->>'packageQuantity')::numeric,0)<=0 then
        missing := array_append(missing,label || 'positive package / piece quantity');
      end if;
      if item->>'packageType' is null then missing := array_append(missing,label || 'package type'); end if;
    end if;
    if mode_value in ('air','courier')
       and coalesce((item->>'chargeableWeightKg')::numeric,0)<=0
       and coalesce((item->>'grossWeightKg')::numeric,0)<=0 then
      missing := array_append(missing,label || 'positive chargeable or gross weight');
    end if;
    if mode_value in ('sea','ocean','road','rail') and not containerised
       and coalesce((item->>'volumeCbm')::numeric,0)<=0
       and coalesce((item->>'grossWeightKg')::numeric,0)<=0 then
      missing := array_append(missing,label || 'positive volume or gross weight');
    end if;
  end loop;
  return missing;
end;
$$;
revoke all on function quote_api.cargo_issue_missing(jsonb,text,text) from public,anon,authenticated;
grant execute on function quote_api.cargo_issue_missing(jsonb,text,text) to service_role;

-- Keep the current customer, Incoterm/scope, route, equipment and charge rules
-- in place. Fail the migration if that boundary has changed unexpectedly.
do $migration$
declare
  definition text := pg_get_functiondef('booking_api.quote_readiness(uuid)'::regprocedure);
  anchor text := E'  return jsonb_build_object(\n    ''ready'', cardinality(missing) = 0,';
  replacement text := $replacement$
  -- Both header and version must refer to the same saved cargo. Comparing the
  -- normalised values permits benign numeric/country formatting differences.
  select version."CusQuoteVersion_SnapshotJSON" #> '{quote,shipmentFacts}'
    into version_facts from public."CusQuote_Versions" version
    where version."CusQuoteHeader_ID"=requested_quote_id and version."CusQuoteVersion_IsCurrent";
  if facts ? 'cargoLines' or coalesce(version_facts ? 'cargoLines',false) then
    select coalesce(array_agg(value order by position),'{}'::text[]) into missing
      from unnest(missing) with ordinality as item(value,position)
      where value <> all(array['Goods description','Package / piece quantity','Package type',
        'Chargeable or gross weight','Volume or gross weight']);
    if not facts ? 'cargoLines' or not coalesce(version_facts ? 'cargoLines',false) then
      missing := array_append(missing,'Save cargo lines to the current quote version before sending');
    else
      begin
        if quote_api.normalise_cargo_lines(facts->'cargoLines',false)
          is distinct from quote_api.normalise_cargo_lines(version_facts->'cargoLines',false) then
          missing := array_append(missing,'Save cargo changes to the current quote version before sending');
        end if;
      exception when invalid_parameter_value then
        missing := array_append(missing,'Correct and save cargo line data before sending');
      end;
    end if;
    missing := missing || quote_api.cargo_issue_missing(
      coalesce(version_facts->'cargoLines',facts->'cargoLines'),mode_value,shipment_value);
  end if;
  return jsonb_build_object(
    'ready', cardinality(missing) = 0,$replacement$;
begin
  if position(anchor in definition)=0 or position('  routing_legs jsonb;' in definition)=0
    or position('version_facts' in definition)>0 then
    raise exception 'Quote readiness changed; review structured cargo integration before applying.';
  end if;
  definition := replace(definition,'  routing_legs jsonb;',E'  routing_legs jsonb;\n  version_facts jsonb;');
  execute replace(definition,anchor,replacement);
end;
$migration$;

-- Readiness is returned through existing authorised Quote reads and send
-- actions. It adds no independent write/watch surface or polling behaviour.
update public."sys_AIDexterDataDomains" set
  "AIDexterDomain_Description"="AIDexterDomain_Description" || ' Issue readiness checks every structured cargo line and its saved-version consistency; incomplete drafts can still autosave.',
  "AIDexterDomain_UpdatedAt"=now()
where "AIDexterDomain_Code"='quotes';
commit;
