begin;

-- CargoWise-style shipment direction is relative to the operating branch:
-- branch -> overseas = export; overseas -> branch = import;
-- branch -> branch = domestic; overseas -> overseas = cross trade.

create or replace function booking_api.country_code_from_location(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when regexp_replace(upper(coalesce(value, '')), '[^A-Z0-9]', '', 'g') ~ '^[A-Z]{2}[A-Z0-9]{3}$'
      then left(regexp_replace(upper(value), '[^A-Z0-9]', '', 'g'), 2)
    when upper(btrim(coalesce(value, ''))) ~ '^[A-Z]{2}$'
      then upper(btrim(value))
    else null
  end;
$$;

create or replace function booking_api.operating_country_code(requested_office_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    upper(nullif(btrim(office."Office_CountryCode"), '')),
    upper(nullif(btrim(linked_entity."LegalEntity_CountryCode"), '')),
    upper(nullif(btrim(default_entity."LegalEntity_CountryCode"), ''))
  )
  from public."cmp_Offices" office
  left join public."cmp_LegalEntities" linked_entity
    on linked_entity."LegalEntity_ID" = office."Office_LegalEntityID"
   and linked_entity."Company_ID" = office."Company_ID"
   and linked_entity."LegalEntity_IsActive"
  left join lateral (
    select entity."LegalEntity_CountryCode"
    from public."cmp_LegalEntities" entity
    where entity."Company_ID" = office."Company_ID"
      and entity."LegalEntity_IsActive"
      and nullif(btrim(entity."LegalEntity_CountryCode"), '') is not null
    order by entity."LegalEntity_IsDefault" desc, entity."LegalEntity_UpdatedAt" desc nulls last
    limit 1
  ) default_entity on true
  where office."Office_ID" = requested_office_id
    and office."Office_IsActive";
$$;

create or replace function booking_api.resolve_freight_direction(
  operating_country_code text,
  origin_country_code text,
  destination_country_code text
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when not coalesce(upper(nullif(btrim(operating_country_code), '')) ~ '^[A-Z]{2}$', false)
      or not coalesce(upper(nullif(btrim(origin_country_code), '')) ~ '^[A-Z]{2}$', false)
      or not coalesce(upper(nullif(btrim(destination_country_code), '')) ~ '^[A-Z]{2}$', false)
      then null
    when upper(btrim(origin_country_code)) = upper(btrim(operating_country_code))
      and upper(btrim(destination_country_code)) = upper(btrim(operating_country_code))
      then 'domestic'
    when upper(btrim(origin_country_code)) = upper(btrim(operating_country_code))
      then 'export'
    when upper(btrim(destination_country_code)) = upper(btrim(operating_country_code))
      then 'import'
    else 'cross_trade'
  end;
$$;

create or replace function booking_api.direction_for_route(
  requested_office_id uuid,
  origin_location text,
  destination_location text
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select booking_api.resolve_freight_direction(
    booking_api.operating_country_code(requested_office_id),
    booking_api.country_code_from_location(origin_location),
    booking_api.country_code_from_location(destination_location)
  );
$$;

create or replace function booking_api.direction_label(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case booking_api.normalise_direction(value)
    when 'cross_trade' then 'Cross trade'
    when 'domestic' then 'Domestic'
    when 'import' then 'Import'
    when 'export' then 'Export'
    else 'Direction needed'
  end;
$$;

-- Fill missing office countries only when the office already has an explicit
-- legal-entity relationship. Ambiguous offices remain untouched.
update public."cmp_Offices" office
set "Office_CountryCode" = upper(entity."LegalEntity_CountryCode")
from public."cmp_LegalEntities" entity
where office."Office_LegalEntityID" = entity."LegalEntity_ID"
  and entity."Company_ID" = office."Company_ID"
  and office."Office_CountryCode" is null
  and entity."LegalEntity_CountryCode" ~ '^[A-Z]{2}$';

create or replace function quote_api.enforce_branch_relative_direction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected_direction text;
  origin_location text;
  destination_location text;
begin
  origin_location := coalesce(
    nullif(new."CusQuoteHeader_ShipmentFactsJSON"->>'originUnlocode', ''),
    nullif(new."CusQuoteHeader_ShipmentFactsJSON"->>'originCountry', ''),
    nullif(new."CusQuoteHeader_LoadingPoint", ''),
    nullif(new."CusQuoteHeader_OriginExtra", '')
  );
  destination_location := coalesce(
    nullif(new."CusQuoteHeader_ShipmentFactsJSON"->>'destinationUnlocode', ''),
    nullif(new."CusQuoteHeader_ShipmentFactsJSON"->>'destinationCountry', ''),
    nullif(new."CusQuoteHeader_DischargePoint", ''),
    nullif(new."CusQuoteHeader_DestinationExtra", '')
  );
  expected_direction := booking_api.direction_for_route(
    coalesce(new."CusQuoteHeader_OrgOfficeID", new."OrgOffice_ID"),
    origin_location,
    destination_location
  );

  if expected_direction is not null then
    new."CusQuoteHeader_Direction" := expected_direction;
    new."CusQuoteHeader_ShipmentFactsJSON" := jsonb_set(
      coalesce(new."CusQuoteHeader_ShipmentFactsJSON", '{}'::jsonb),
      '{quoteType}',
      to_jsonb(booking_api.direction_label(expected_direction)),
      true
    );
  end if;
  return new;
end;
$$;

drop trigger if exists "TR_CusQuote_Header_branch_relative_direction" on public."CusQuote_Header";
create trigger "TR_CusQuote_Header_branch_relative_direction"
before insert or update of
  "CusQuoteHeader_OrgOfficeID", "OrgOffice_ID", "CusQuoteHeader_Direction",
  "CusQuoteHeader_LoadingPoint", "CusQuoteHeader_DischargePoint",
  "CusQuoteHeader_OriginExtra", "CusQuoteHeader_DestinationExtra",
  "CusQuoteHeader_ShipmentFactsJSON"
on public."CusQuote_Header"
for each row execute function quote_api.enforce_branch_relative_direction();

create or replace function quote_api.enforce_version_branch_relative_direction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  office_id uuid;
  quote_payload jsonb;
  expected_direction text;
begin
  quote_payload := new."CusQuoteVersion_SnapshotJSON"->'quote';
  if jsonb_typeof(quote_payload) <> 'object' then return new; end if;

  select coalesce(quote."CusQuoteHeader_OrgOfficeID", quote."OrgOffice_ID")
    into office_id
  from public."CusQuote_Header" quote
  where quote."CusQuoteHeader_ID" = new."CusQuoteHeader_ID";

  expected_direction := booking_api.direction_for_route(
    office_id,
    coalesce(
      nullif(quote_payload#>>'{shipmentFacts,originUnlocode}', ''),
      nullif(quote_payload#>>'{shipmentFacts,originCountry}', ''),
      nullif(quote_payload->>'loadingPoint', '')
    ),
    coalesce(
      nullif(quote_payload#>>'{shipmentFacts,destinationUnlocode}', ''),
      nullif(quote_payload#>>'{shipmentFacts,destinationCountry}', ''),
      nullif(quote_payload->>'dischargePoint', '')
    )
  );
  if expected_direction is null then return new; end if;

  new."CusQuoteVersion_SnapshotJSON" := jsonb_set(
    jsonb_set(
      new."CusQuoteVersion_SnapshotJSON",
      '{quote,direction}',
      to_jsonb(expected_direction),
      true
    ),
    '{quote,shipmentFacts,quoteType}',
    to_jsonb(booking_api.direction_label(expected_direction)),
    true
  );
  return new;
end;
$$;

drop trigger if exists "TR_CusQuote_Versions_branch_relative_direction" on public."CusQuote_Versions";
create trigger "TR_CusQuote_Versions_branch_relative_direction"
before insert or update of "CusQuoteVersion_SnapshotJSON"
on public."CusQuote_Versions"
for each row execute function quote_api.enforce_version_branch_relative_direction();

create or replace function booking_api.enforce_branch_relative_direction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected_direction text;
begin
  expected_direction := booking_api.direction_for_route(
    coalesce(new."Job_OrgOfficeID", new."Job_OfficeID"),
    new."Job_OriginUNLocode",
    new."Job_DestinationUNLocode"
  );
  if expected_direction is not null then
    new."Job_Direction" := expected_direction;
  end if;
  return new;
end;
$$;

drop trigger if exists "TR_Job_Header_branch_relative_direction" on public."Job_Header";
create trigger "TR_Job_Header_branch_relative_direction"
before insert or update of
  "Job_OrgOfficeID", "Job_OfficeID", "Job_Direction",
  "Job_OriginUNLocode", "Job_DestinationUNLocode"
on public."Job_Header"
for each row execute function booking_api.enforce_branch_relative_direction();

create or replace function booking_api.normalise_booking_direction_payload(
  requested_job_id uuid,
  payload jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  job_row record;
  route_count integer := case when jsonb_typeof(payload->'routes') = 'array' then jsonb_array_length(payload->'routes') else 0 end;
  origin_location text;
  destination_location text;
  expected_direction text;
begin
  select job.* into job_row
  from public."Job_Header" job
  where job."Job_ID" = requested_job_id
    and not job."Job_IsDeleted";
  if not found then return payload; end if;

  origin_location := coalesce(
    nullif(payload->>'originUnlocode', ''),
    nullif(payload#>>'{route,originUnlocode}', ''),
    case when route_count > 0 then nullif(payload->'routes'->0->>'originUnlocode', '') end,
    job_row."Job_OriginUNLocode"
  );
  destination_location := coalesce(
    nullif(payload->>'destinationUnlocode', ''),
    case when route_count > 0 then nullif(payload->'routes'->(route_count - 1)->>'destinationUnlocode', '') end,
    nullif(payload#>>'{route,destinationUnlocode}', ''),
    job_row."Job_DestinationUNLocode"
  );
  expected_direction := booking_api.direction_for_route(
    coalesce(job_row."Job_OrgOfficeID", job_row."Job_OfficeID"),
    origin_location,
    destination_location
  );
  if expected_direction is null then return payload; end if;

  return jsonb_set(coalesce(payload, '{}'::jsonb), '{direction}', to_jsonb(expected_direction), true);
end;
$$;

alter function public.booking_workflow_save(uuid, uuid, jsonb)
  rename to booking_workflow_save_before_branch_direction_20260904;

create or replace function public.booking_workflow_save(
  caller_auth_user_id uuid,
  requested_job_id uuid,
  payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalised_payload jsonb;
begin
  normalised_payload := booking_api.normalise_booking_direction_payload(requested_job_id, payload);
  return public.booking_workflow_save_before_branch_direction_20260904(
    caller_auth_user_id,
    requested_job_id,
    normalised_payload
  );
end;
$$;

-- Add the calculated direction evidence to Dexter's existing tenant-safe
-- domains. Existing Job/Header watch triggers already emit direction changes.
alter function public.multideck_dexter_domain_quotes(uuid, text, integer)
  rename to multideck_dexter_quotes_before_branch_direction_20260904;

create or replace function public.multideck_dexter_domain_quotes(
  p_company_id uuid,
  p_search text,
  p_take integer
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    item.value || jsonb_strip_nulls(jsonb_build_object(
      'operatingCountryCode', booking_api.operating_country_code(coalesce(quote."CusQuoteHeader_OrgOfficeID", quote."OrgOffice_ID")),
      'calculatedDirection', booking_api.direction_for_route(
        coalesce(quote."CusQuoteHeader_OrgOfficeID", quote."OrgOffice_ID"),
        coalesce(quote."CusQuoteHeader_ShipmentFactsJSON"->>'originUnlocode', item.value->>'origin'),
        coalesce(quote."CusQuoteHeader_ShipmentFactsJSON"->>'destinationUnlocode', item.value->>'destination')
      ),
      'directionMatchesRoute', case
        when booking_api.direction_for_route(
          coalesce(quote."CusQuoteHeader_OrgOfficeID", quote."OrgOffice_ID"),
          coalesce(quote."CusQuoteHeader_ShipmentFactsJSON"->>'originUnlocode', item.value->>'origin'),
          coalesce(quote."CusQuoteHeader_ShipmentFactsJSON"->>'destinationUnlocode', item.value->>'destination')
        ) is null then null
        else booking_api.normalise_direction(item.value->>'direction') = booking_api.direction_for_route(
          coalesce(quote."CusQuoteHeader_OrgOfficeID", quote."OrgOffice_ID"),
          coalesce(quote."CusQuoteHeader_ShipmentFactsJSON"->>'originUnlocode', item.value->>'origin'),
          coalesce(quote."CusQuoteHeader_ShipmentFactsJSON"->>'destinationUnlocode', item.value->>'destination')
        )
      end
    )) order by item.ordinality
  ), '[]'::jsonb)
  from jsonb_array_elements(
    public.multideck_dexter_quotes_before_branch_direction_20260904(p_company_id, p_search, p_take)
  ) with ordinality item(value, ordinality)
  left join public."CusQuote_Header" quote
    on quote."CusQuoteHeader_ID" = nullif(item.value->>'recordId', '')::uuid
   and not quote."CusQuoteHeader_IsDeleted";
$$;

alter function public.multideck_dexter_domain_bookings(uuid, text, integer)
  rename to multideck_dexter_bookings_before_branch_direction_20260904;

create or replace function public.multideck_dexter_domain_bookings(
  p_company_id uuid,
  p_search text,
  p_take integer
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    item.value || jsonb_strip_nulls(jsonb_build_object(
      'operatingCountryCode', booking_api.operating_country_code(coalesce(job."Job_OrgOfficeID", job."Job_OfficeID")),
      'calculatedDirection', booking_api.direction_for_route(
        coalesce(job."Job_OrgOfficeID", job."Job_OfficeID"),
        coalesce(job."Job_OriginUNLocode", item.value->>'origin'),
        coalesce(job."Job_DestinationUNLocode", item.value->>'destination')
      ),
      'directionMatchesRoute', case
        when booking_api.direction_for_route(
          coalesce(job."Job_OrgOfficeID", job."Job_OfficeID"),
          coalesce(job."Job_OriginUNLocode", item.value->>'origin'),
          coalesce(job."Job_DestinationUNLocode", item.value->>'destination')
        ) is null then null
        else booking_api.normalise_direction(item.value->>'direction') = booking_api.direction_for_route(
          coalesce(job."Job_OrgOfficeID", job."Job_OfficeID"),
          coalesce(job."Job_OriginUNLocode", item.value->>'origin'),
          coalesce(job."Job_DestinationUNLocode", item.value->>'destination')
        )
      end
    )) order by item.ordinality
  ), '[]'::jsonb)
  from jsonb_array_elements(
    public.multideck_dexter_bookings_before_branch_direction_20260904(p_company_id, p_search, p_take)
  ) with ordinality item(value, ordinality)
  left join public."Job_Header" job
    on job."Job_ID" = nullif(item.value->>'recordId', '')::uuid
   and not job."Job_IsDeleted";
$$;

update public."sys_AIDexterDataDomains"
set "AIDexterDomain_Description" = case "AIDexterDomain_Code"
  when 'quotes' then 'Customer quotes with branch-relative calculated direction, route, response evidence, delivery evidence, linked booking provenance, outcomes and pricing.'
  when 'bookings' then 'Canonical freight bookings with branch-relative calculated direction, accepted-quote provenance and the main route and cargo summary.'
  else "AIDexterDomain_Description"
end,
"AIDexterDomain_UpdatedAt" = now()
where "AIDexterDomain_Code" in ('quotes', 'bookings');

update public."sys_AIDexterWatchCapabilities"
set "AIDexterWatchCapability_Description" = case "AIDexterWatchCapability_Code"
  when 'quotes' then 'Event-driven quote lifecycle, calculated direction, route, schedule, validity, customer response and linked-booking changes.'
  when 'bookings' then 'Event-driven freight booking status, calculated direction, route, delivery, ownership, risk and Customs handoff changes.'
  else "AIDexterWatchCapability_Description"
end,
"AIDexterWatchCapability_UpdatedAt" = now()
where "AIDexterWatchCapability_Code" in ('quotes', 'bookings');

revoke all on function booking_api.country_code_from_location(text) from public, anon, authenticated;
revoke all on function booking_api.operating_country_code(uuid) from public, anon, authenticated;
revoke all on function booking_api.resolve_freight_direction(text, text, text) from public, anon, authenticated;
revoke all on function booking_api.direction_for_route(uuid, text, text) from public, anon, authenticated;
revoke all on function booking_api.direction_label(text) from public, anon, authenticated;
revoke all on function booking_api.normalise_booking_direction_payload(uuid, jsonb) from public, anon, authenticated;
revoke all on function quote_api.enforce_branch_relative_direction() from public, anon, authenticated;
revoke all on function quote_api.enforce_version_branch_relative_direction() from public, anon, authenticated;
revoke all on function booking_api.enforce_branch_relative_direction() from public, anon, authenticated;
revoke all on function public.booking_workflow_save_before_branch_direction_20260904(uuid, uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.booking_workflow_save(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.multideck_dexter_quotes_before_branch_direction_20260904(uuid, text, integer) from public, anon, authenticated, service_role;
revoke all on function public.multideck_dexter_bookings_before_branch_direction_20260904(uuid, text, integer) from public, anon, authenticated, service_role;
revoke all on function public.multideck_dexter_domain_quotes(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.multideck_dexter_domain_bookings(uuid, text, integer) from public, anon, authenticated;

grant execute on function booking_api.country_code_from_location(text) to service_role;
grant execute on function booking_api.operating_country_code(uuid) to service_role;
grant execute on function booking_api.resolve_freight_direction(text, text, text) to service_role;
grant execute on function booking_api.direction_for_route(uuid, text, text) to service_role;
grant execute on function booking_api.direction_label(text) to service_role;
grant execute on function booking_api.normalise_booking_direction_payload(uuid, jsonb) to service_role;
grant execute on function public.booking_workflow_save(uuid, uuid, jsonb) to service_role;
grant execute on function public.multideck_dexter_domain_quotes(uuid, text, integer) to service_role;
grant execute on function public.multideck_dexter_domain_bookings(uuid, text, integer) to service_role;

comment on function booking_api.resolve_freight_direction(text, text, text) is
  'Calculates Export, Import, Domestic or Cross trade from the operating branch country and the shipment overall origin/final destination.';
comment on function booking_api.direction_for_route(uuid, text, text) is
  'Returns branch-relative freight direction for an office and two country/UNLOCODE values.';
comment on function public.booking_workflow_save(uuid, uuid, jsonb) is
  'Persists booking edits after calculating direction from the operating office and the overall route.';

commit;
