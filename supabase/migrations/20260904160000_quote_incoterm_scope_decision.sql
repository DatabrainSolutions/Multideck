-- Let sales draft without an Incoterm, while requiring an explicit scope
-- decision before issue and a named place/port for every official rule.

begin;

create or replace function booking_api.quote_readiness(requested_quote_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  quote_row record;
  facts jsonb;
  routing_legs jsonb;
  missing text[] := '{}'::text[];
  warnings text[] := '{}'::text[];
  incoterm_value text;
  incoterm_code text;
  incoterm_not_supplied boolean;
  mode_value text;
  shipment_value text;
  service_value text;
  has_customs boolean;
  is_containerised boolean;
begin
  select quote.* into quote_row
  from public."CusQuote_Header" quote
  where quote."CusQuoteHeader_ID" = requested_quote_id
    and not quote."CusQuoteHeader_IsDeleted";
  if not found then
    raise exception 'That quote could not be found.' using errcode = 'P0002';
  end if;

  facts := coalesce(quote_row."CusQuoteHeader_ShipmentFactsJSON", '{}'::jsonb);
  routing_legs := case when jsonb_typeof(facts->'routingLegs')='array' then facts->'routingLegs' else '[]'::jsonb end;
  incoterm_value := upper(btrim(coalesce(quote_row."CusQuoteHeader_Incoterm", '')));
  incoterm_code := split_part(incoterm_value, ' ', 1);
  incoterm_not_supplied := incoterm_value in ('N/A', 'NA', 'NOT SUPPLIED', 'NOT APPLICABLE', 'NOT SUPPLIED / NOT APPLICABLE');
  mode_value := lower(coalesce(quote_row."CusQuoteHeader_ModeCode", ''));
  shipment_value := lower(coalesce(quote_row."CusQuoteHeader_ShipmentTypeCode", ''));
  service_value := lower(coalesce(quote_row."CusQuoteHeader_ServiceLevel", ''));
  has_customs := lower(coalesce(facts->>'customsIncluded', 'no')) in ('true', 'yes', '1');
  is_containerised := shipment_value like '%fcl%' or shipment_value like '%container%';

  if quote_row."CusQuoteHeader_CustomerID" is null then missing := array_append(missing, 'Customer'); end if;
  if nullif(btrim(quote_row."CusQuoteHeader_ContactEmailSnapshot"), '') is null then missing := array_append(missing, 'Customer email'); end if;
  if nullif(btrim(quote_row."CusQuoteHeader_LoadingPoint"), '') is null then missing := array_append(missing, 'Origin / loading point'); end if;
  if nullif(btrim(quote_row."CusQuoteHeader_DischargePoint"), '') is null then missing := array_append(missing, 'Destination / discharge point'); end if;
  if quote_row."CusQuoteHeader_CreatedDate" is null then missing := array_append(missing, 'Quote date'); end if;
  if quote_row."CusQuoteHeader_ValidFrom" is null then missing := array_append(missing, 'Validity start'); end if;
  if quote_row."CusQuoteHeader_ValidTo" is null then missing := array_append(missing, 'Validity end'); end if;
  if quote_row."CusQuoteHeader_ValidFrom" is not null and quote_row."CusQuoteHeader_ValidTo" is not null
     and quote_row."CusQuoteHeader_ValidTo" < quote_row."CusQuoteHeader_ValidFrom" then
    missing := array_append(missing, 'A validity end on or after the start');
  end if;
  if mode_value = '' then missing := array_append(missing, 'Transport mode'); end if;
  if shipment_value = '' then missing := array_append(missing, 'Shipment / equipment type'); end if;
  if nullif(btrim(coalesce(facts->>'knownCargo', facts->>'commodity')), '') is null then missing := array_append(missing, 'Goods description'); end if;

  if incoterm_value = '' then
    missing := array_append(missing, 'Incoterm or Not supplied / not applicable');
  elsif incoterm_not_supplied then
    if lower(coalesce(facts->>'collectionRequired', '')) not in ('true', 'false', 'yes', 'no', '1', '0') then
      missing := array_append(missing, 'Collection scope');
    end if;
    if lower(coalesce(facts->>'deliveryRequired', '')) not in ('true', 'false', 'yes', 'no', '1', '0') then
      missing := array_append(missing, 'Delivery scope');
    end if;
    if lower(coalesce(facts->>'customsIncluded', '')) not in ('true', 'false', 'yes', 'no', '1', '0') then
      missing := array_append(missing, 'Customs clearance scope');
    end if;
  elsif not incoterm_not_supplied
        and incoterm_code not in ('EXW', 'FCA', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP', 'FAS', 'FOB', 'CFR', 'CIF') then
    missing := array_append(missing, 'A supported Incoterm or Not supplied / not applicable');
  elsif incoterm_code = 'EXW'
        and coalesce(
          nullif(btrim(facts->>'namedPlace'), ''),
          nullif(btrim(quote_row."CusQuoteHeader_CollectionAddress"), ''),
          nullif(btrim(facts->>'shipperAddress'), '')
        ) is null then
    missing := array_append(missing, 'EXW named place or collection address');
  elsif incoterm_code in ('DAP', 'DPU', 'DDP')
        and coalesce(
          nullif(btrim(facts->>'namedPlace'), ''),
          nullif(btrim(quote_row."CusQuoteHeader_DeliveryAddress"), ''),
          nullif(btrim(facts->>'consigneeAddress'), '')
        ) is null then
    missing := array_append(missing, 'Incoterm named place or delivery address');
  elsif incoterm_code in ('FCA', 'CPT', 'CIP', 'FAS', 'FOB', 'CFR', 'CIF')
        and nullif(btrim(facts->>'namedPlace'), '') is null then
    missing := array_append(missing, 'Incoterm named place / port');
  end if;

  -- N/A is an explicit commercial-scope decision. The included/not-included
  -- answers remain visible on the quote, but do not silently turn the Incoterm
  -- named-place field back into a send blocker.
  if not incoterm_not_supplied
     and (lower(coalesce(facts->>'collectionRequired', 'false')) in ('true','yes','1')
     or service_value like '%door%') then
    if coalesce(
      nullif(btrim(quote_row."CusQuoteHeader_CollectionAddress"), ''),
      nullif(btrim(facts->>'namedPlace'), ''),
      nullif(btrim(facts->>'shipperAddress'), '')
    ) is null then
      missing := array_append(missing, 'Collection address or Incoterm named place');
    end if;
  end if;
  if not incoterm_not_supplied
     and (lower(coalesce(facts->>'deliveryRequired', 'false')) in ('true','yes','1')
     or service_value like '%door%') then
    if coalesce(
      nullif(btrim(quote_row."CusQuoteHeader_DeliveryAddress"), ''),
      nullif(btrim(facts->>'namedPlace'), ''),
      nullif(btrim(facts->>'consigneeAddress'), '')
    ) is null then
      missing := array_append(missing, 'Delivery address or Incoterm named place');
    end if;
  end if;

  if jsonb_array_length(routing_legs)>1 and exists (
    select 1 from jsonb_array_elements(routing_legs) item(leg)
    where nullif(btrim(coalesce(leg#>>'{origin,unlocode}',leg#>>'{origin,place}')),'') is null
       or nullif(btrim(coalesce(leg#>>'{destination,unlocode}',leg#>>'{destination,place}')),'') is null
       or nullif(btrim(leg->>'mode'),'') is null
  ) then
    missing := array_append(missing, 'Complete every routing leg');
  end if;

  if mode_value in ('sea','ocean') and is_containerised
     and nullif(btrim(facts->>'container'), '') is null then
    missing := array_append(missing, 'Container details');
  end if;
  if not is_containerised and nullif(btrim(facts->>'packageQuantity'), '') is null then
    missing := array_append(missing, 'Package / piece quantity');
  end if;
  if not is_containerised and nullif(btrim(facts->>'packageType'), '') is null then
    missing := array_append(missing, 'Package type');
  end if;
  if mode_value in ('air','courier')
     and nullif(btrim(coalesce(facts->>'chargeableWeightKg', facts->>'grossWeightKg')), '') is null then
    missing := array_append(missing, 'Chargeable or gross weight');
  end if;
  if mode_value in ('sea','road','rail')
     and not is_containerised
     and nullif(btrim(coalesce(facts->>'volumeCbm', facts->>'grossWeightKg')), '') is null then
    missing := array_append(missing, 'Volume or gross weight');
  end if;
  if has_customs and (
    case when coalesce(facts->>'entries', '') ~ '^\d+$' then (facts->>'entries')::integer else 0 end
  ) < 1 then
    missing := array_append(missing, 'Customs entry-line count');
  end if;
  if not exists (
    select 1 from public."CusQuote_Lines" line
    where line."CusQuoteHeader_ID" = requested_quote_id
      and line."CusQuoteLine_ShowToCustomer"
      and coalesce(line."CusQuoteLine_RevenueAmountLocal", 0) <> 0
  ) then missing := array_append(missing, 'At least one customer charge'); end if;

  return jsonb_build_object(
    'ready', cardinality(missing) = 0,
    'missing', to_jsonb(missing),
    'warnings', to_jsonb(warnings)
  );
end;
$$;

revoke all on function booking_api.quote_readiness(uuid) from public, anon, authenticated;
grant execute on function booking_api.quote_readiness(uuid) to service_role;

update public."sys_AIDexterDataDomains" set
  "AIDexterDomain_Description"='Customer quote routing and commercial evidence with exact-reference-first recovery. A draft may omit Incoterms; issue readiness requires an official rule with its named place or port, or an explicit Not supplied / not applicable scope decision. Customer terms remain optional and every saved multi-leg route is validated before issue.',
  "AIDexterDomain_UpdatedAt"=now()
where "AIDexterDomain_Code"='quotes';

update public."sys_AIDexterWatchCapabilities" set
  "AIDexterWatchCapability_Description"='Quote status, customer response, deadline, validity, route, Incoterm scope and multi-leg changes. Readiness remains derived from saved quote data and uses the existing event-driven quote watch path.',
  "AIDexterWatchCapability_UpdatedAt"=now()
where "AIDexterWatchCapability_Code"='quotes';

commit;
