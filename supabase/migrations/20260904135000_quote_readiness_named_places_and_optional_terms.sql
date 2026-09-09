-- A named Incoterm place is valid route evidence and optional customer terms
-- must never block an otherwise issuable quote.

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
  incoterm_value := upper(coalesce(quote_row."CusQuoteHeader_Incoterm", ''));
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
  if incoterm_value = '' then missing := array_append(missing, 'Incoterms'); end if;
  if nullif(btrim(coalesce(facts->>'knownCargo', facts->>'commodity')), '') is null then missing := array_append(missing, 'Goods description'); end if;

  if incoterm_value = 'EXW' or lower(coalesce(facts->>'collectionRequired', 'false')) in ('true','yes','1')
     or service_value like '%door%' then
    if nullif(btrim(coalesce(quote_row."CusQuoteHeader_CollectionAddress", facts->>'namedPlace')), '') is null then
      missing := array_append(missing, 'Collection address or Incoterm named place');
    end if;
  end if;
  if incoterm_value in ('DAP','DPU','DDP') or lower(coalesce(facts->>'deliveryRequired', 'false')) in ('true','yes','1')
     or service_value like '%door%' then
    if nullif(btrim(coalesce(quote_row."CusQuoteHeader_DeliveryAddress", facts->>'namedPlace')), '') is null then
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

revoke all on function booking_api.quote_readiness(uuid) from public,anon,authenticated;

update public."sys_AIDexterDataDomains" set
  "AIDexterDomain_Description"='Customer quote routing and commercial evidence with exact-reference-first recovery. Readiness accepts an Incoterm named place as route-address evidence, treats customer terms as optional, and validates every saved multi-leg route before issue.',
  "AIDexterDomain_UpdatedAt"=now()
where "AIDexterDomain_Code"='quotes';

update public."sys_AIDexterWatchCapabilities" set
  "AIDexterWatchCapability_Description"='Quote status, customer response, deadline, validity, route and multi-leg changes. Readiness changes are derived from saved quote data and do not generate polling work.',
  "AIDexterWatchCapability_UpdatedAt"=now()
where "AIDexterWatchCapability_Code"='quotes';

commit;
