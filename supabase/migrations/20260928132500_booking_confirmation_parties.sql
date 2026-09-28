-- Include customer-visible Booking parties in the reviewed, immutable confirmation snapshot.
-- The existing function retains its authorization and pricing boundaries.
begin;
set local lock_timeout = '5s';

create or replace function document_api.booking_confirmation_review(
  caller_auth_user_id uuid, requested_job_id uuid
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  actor record;
  job record;
  details jsonb;
  scope jsonb;
  cargo_lines jsonb;
  routes jsonb;
  price_lines jsonb;
  price_totals jsonb;
  invalid_price_count integer;
  visible_price_count integer;
  price_available boolean;
  review jsonb;
begin
  select u."User_ID", u."Company_ID",
    nullif(btrim(concat_ws(' ', u."User_Firstname", u."User_Lastname")), '') as name
  into strict actor from public."cmp_Users" u
  where u."Auth_User_ID" = caller_auth_user_id and u."User_AccessStatus" = 'active';
  if not document_api.has_permission(caller_auth_user_id, 'Documents.Generate')
     or not booking_api.has_permission(caller_auth_user_id, 'Bookings.Read') then
    raise exception 'Booking document generation is not authorised.' using errcode = '42501';
  end if;
  select j.* into strict job from public."Job_Header" j
  join public."cmp_Offices" o on o."Office_ID" = coalesce(j."Job_OrgOfficeID", j."Job_OfficeID")
    and o."Company_ID" = actor."Company_ID" and o."Office_IsActive"
  join public."cmp_Users_Offices" uo on uo."Office_ID" = o."Office_ID"
    and uo."User_ID" = actor."User_ID"
  where j."Job_ID" = requested_job_id and not j."Job_IsDeleted";
  if lower(job."Job_Status") = 'cancelled' then
    raise exception 'Reopen the Booking before creating a customer document.' using errcode = '55000';
  end if;
  if job."Job_Customer" is null then
    raise exception 'Choose a customer before creating a Booking PDF.' using errcode = '22023';
  end if;
  details := coalesce(job."Job_EditableDetailsJSON", '{}'::jsonb);
  scope := jsonb_build_object(
    'collection', details->>'scopeCollection' = 'true',
    'mainTransport', details->>'scopeMainTransport' = 'true',
    'delivery', details->>'scopeDelivery' = 'true'
  );
  if not ((scope->>'collection')::boolean or (scope->>'mainTransport')::boolean or (scope->>'delivery')::boolean) then
    raise exception 'Choose the work Jenkar is arranging before creating a Booking PDF.' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'description', c."JobCargo_Description", 'marksAndNumbers', coalesce(
      nullif(c."JobCargo_CargoJSON"->>'marksAndNumbers', ''), c."JobCargo_MarksNumbers"),
    'packages', c."JobCargo_PackageQty", 'packageType', c."JobCargo_PackageTypeCodeSnapshot",
    'grossWeightKg', c."JobCargo_GrossKilos", 'volumeCbm', c."JobCargo_VolumeCBM"
  )) order by c."JobCargo_LineNo", c."JobCargo_ID"), '[]'::jsonb)
  into cargo_lines from public."Job_Cargo" c
  where c."JobCargo_JobID" = requested_job_id and not c."JobCargo_IsDeleted";

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'sequence', r."JobRoute_OrderNo", 'mode', r."JobRoute_ModeCode",
    'origin', coalesce(r."JobRoute_OriginNameSnapshot", r."JobRoute_OriginUNLocode"),
    'destination', coalesce(r."JobRoute_DestinationNameSnapshot", r."JobRoute_DestinationUNLocode"),
    'plannedDepartureAt', r."JobRoute_PlannedDepartureAt", 'plannedArrivalAt', r."JobRoute_PlannedArrivalAt",
    'carrierBookingReference', r."JobRoute_CarrierBookingReference",
    'flightNumber', r."JobRoute_FlightNumber", 'vessel', r."JobRoute_Vessel",
    'voyageNumber', r."JobRoute_VoyageNumber", 'railService', r."JobRoute_RailService"
  )) order by r."JobRoute_OrderNo", r."JobRoute_ID"), '[]'::jsonb)
  into routes from public."Job_Routing" r where r."Job_ID" = requested_job_id;

  with visible as (
    select c."JobCostingLine_ID" as id, c."JobCostingLine_Number" as line_number,
      c."JobCostingLine_Description" as description,
      c."JobCostingLine_RevenueAmountCurrency" as amount,
      coalesce(
        c."JobCostingLine_SourceMetadataJSON" #>> '{bookingCharge,sellCurrency}',
        c."JobCostingLine_SourceMetadataJSON" #>> '{quoteCharge,sellCurrency}',
        c."JobCostingLine_SourceMetadataJSON" #>> '{planningCharge,sellCurrency}'
      ) as currency
    from public."Job_Costing_Lines" c
    where c."Job_ID" = requested_job_id
      and c."JobCostingLine_DomainCode" = 'freight'
      and c."JobCostingLine_ShowToCustomer" = true
  )
  select count(*), count(*) filter (where amount is null or currency is null or currency !~ '^[A-Z]{3}$'
    or nullif(btrim(description), '') is null),
    coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'description', description, 'sellAmount', amount, 'currency', currency
    ) order by line_number, id), '[]'::jsonb)
  into visible_price_count, invalid_price_count, price_lines from visible;

  price_available := lower(job."Job_Status") in ('open', 'in_progress')
    and visible_price_count > 0 and invalid_price_count = 0;
  if price_available then
    select coalesce(jsonb_agg(jsonb_build_object('currency', currency, 'amount', amount) order by currency), '[]'::jsonb)
    into price_totals from (
      select line->>'currency' as currency, sum((line->>'sellAmount')::numeric) as amount
      from jsonb_array_elements(price_lines) line group by line->>'currency'
    ) totals;
  else
    price_totals := '[]'::jsonb;
  end if;

  review := jsonb_build_object(
    'jobId', job."Job_ID", 'bookingReference', job."Job_BookingReference",
    'direction', case lower(job."Job_Direction")
      when 'import' then 'Import' when 'export' then 'Export'
      when 'cross_trade' then 'Cross-trade' when 'domestic' then 'Domestic'
      else null end,
    'customerReference', coalesce(nullif(details->>'customerReference', ''), nullif(job."Job_CustomerReference", '')),
    'sourceQuoteVersionId', job."Job_SourceQuoteVersionID",
    'status', job."Job_Status", 'provisional', lower(job."Job_Status") in ('draft', 'provisional'),
    'preparedBy', coalesce(actor.name, 'Multideck operator'),
    'customer', jsonb_build_object('id', job."Job_Customer", 'name',
      (select o."Org_Name" from public."Org_Master" o where o."Org_id" = job."Job_Customer")),
    'shipper', (select jsonb_strip_nulls(jsonb_build_object(
      'name', p."JobParty_NameSnapshot", 'address', p."JobParty_AddressSnapshot"
    )) from public."Job_Parties" p
      where p."JobParty_JobID" = requested_job_id and p."JobParty_Role" in ('shipper', 'consignor')
      order by case when p."JobParty_Role" = 'shipper' then 0 else 1 end,
        p."JobParty_IsPrimary" desc, p."JobParty_Sequence", p."JobParty_ID" limit 1),
    'consignee', (select jsonb_strip_nulls(jsonb_build_object(
      'name', p."JobParty_NameSnapshot", 'address', p."JobParty_AddressSnapshot"
    )) from public."Job_Parties" p
      where p."JobParty_JobID" = requested_job_id and p."JobParty_Role" = 'consignee'
      order by p."JobParty_IsPrimary" desc, p."JobParty_Sequence", p."JobParty_ID" limit 1),
    'scope', scope,
    'collection', case when (scope->>'collection')::boolean then jsonb_build_object(
      'address', job."Job_CollectionAddress", 'plannedAt',
      coalesce((select min(r."JobRoute_PlannedPickupAt")::text from public."Job_Routing" r where r."Job_ID" = requested_job_id), job."Job_ReadyDate"::text),
      'plannedAtLabel', coalesce(
        (select to_char(min(r."JobRoute_PlannedPickupAt") at time zone 'UTC', 'DD Mon YYYY')
         from public."Job_Routing" r where r."Job_ID" = requested_job_id),
        to_char(job."Job_ReadyDate", 'DD Mon YYYY')),
      'remarks', nullif(details->>'collectionRemarks', '')) end,
    'mainTransport', case when (scope->>'mainTransport')::boolean then routes end,
    'delivery', case when (scope->>'delivery')::boolean then jsonb_build_object(
      'address', job."Job_DeliveryAddress", 'plannedAt',
      coalesce((select max(r."JobRoute_PlannedDeliveryAt")::text from public."Job_Routing" r where r."Job_ID" = requested_job_id), job."Job_RequiredDeliveryDate"::text),
      'plannedAtLabel', coalesce(
        (select to_char(max(r."JobRoute_PlannedDeliveryAt") at time zone 'UTC', 'DD Mon YYYY')
         from public."Job_Routing" r where r."Job_ID" = requested_job_id),
        to_char(job."Job_RequiredDeliveryDate", 'DD Mon YYYY')),
      'remarks', nullif(details->>'deliveryRemarks', '')) end,
    'cargo', cargo_lines, 'specialInstructions', nullif(details->>'specialInstructions', ''),
    'priceAvailable', price_available, 'chargeLines', price_lines, 'chargeTotals', price_totals
  );
  return review || jsonb_build_object('reviewToken', md5(review::text));
exception
  when no_data_found or too_many_rows then
    raise exception 'Booking document identity is incomplete.' using errcode = '42501';
end $$;
commit;
