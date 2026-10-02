-- Exclude numbered equipment retained from an unrelated Booking mode while
-- allowing equipment on any active route mode in a mixed-mode journey.
-- The review function retains its authorization, price and snapshot boundaries.
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
  equipment jsonb;
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
    'sequence', r."JobRoute_OrderNo", 'mode', case lower(r."JobRoute_ModeCode")
      when 'ocean' then 'Sea' when 'sea' then 'Sea' when 'air' then 'Air'
      when 'road' then 'Road' when 'rail' then 'Rail' else initcap(r."JobRoute_ModeCode") end,
    'origin', coalesce(r."JobRoute_OriginNameSnapshot", r."JobRoute_OriginUNLocode"),
    'destination', coalesce(r."JobRoute_DestinationNameSnapshot", r."JobRoute_DestinationUNLocode"),
    'plannedDepartureAt', r."JobRoute_PlannedDepartureAt", 'plannedArrivalAt', r."JobRoute_PlannedArrivalAt",
    'details', concat_ws(' · ',
      case when nullif(btrim(carrier."Org_Name"), '') is not null then 'Carrier: ' || carrier."Org_Name" end,
      case when nullif(btrim(r."JobRoute_CarrierBookingReference"), '') is not null
        then 'Booking ref: ' || r."JobRoute_CarrierBookingReference" end,
      case lower(r."JobRoute_ModeCode")
        when 'air' then nullif(concat('Flight: ', r."JobRoute_FlightNumber"), 'Flight: ')
        when 'sea' then nullif(concat('Vessel: ', r."JobRoute_Vessel"), 'Vessel: ')
        when 'ocean' then nullif(concat('Vessel: ', r."JobRoute_Vessel"), 'Vessel: ')
        when 'road' then nullif(concat('Vehicle: ', r."JobRoute_VehicleRegistration"), 'Vehicle: ')
        when 'rail' then nullif(concat('Rail service: ', r."JobRoute_RailService"), 'Rail service: ')
        else nullif(concat('Service: ', r."JobRoute_TransportMeansName"), 'Service: ') end,
      case when lower(r."JobRoute_ModeCode") in ('sea', 'ocean')
        and nullif(btrim(r."JobRoute_VoyageNumber"), '') is not null
        then 'Voyage: ' || r."JobRoute_VoyageNumber" end,
      case when lower(r."JobRoute_ModeCode") = 'road'
        and nullif(btrim(r."JobRoute_TrailerNumber"), '') is not null
        then 'Trailer: ' || r."JobRoute_TrailerNumber" end,
      case when nullif(btrim(r."JobRoute_MasterTransportReference"), '') is not null then
        (case lower(r."JobRoute_ModeCode") when 'air' then 'MAWB' when 'sea' then 'MBL'
          when 'ocean' then 'MBL' when 'road' then 'CMR' when 'rail' then 'CIM / SMGS'
          else 'Master ref' end) || ': ' || r."JobRoute_MasterTransportReference" end,
      case when nullif(btrim(r."JobRoute_HouseTransportReference"), '') is not null then
        (case lower(r."JobRoute_ModeCode") when 'air' then 'HAWB' when 'sea' then 'HBL'
          when 'ocean' then 'HBL' else 'Forwarder ref' end) || ': ' || r."JobRoute_HouseTransportReference" end,
      case when nullif(btrim(r."JobRoute_ServiceLevel"), '') is not null
        then 'Service: ' || r."JobRoute_ServiceLevel" end)
  )) order by r."JobRoute_OrderNo", r."JobRoute_ID"), '[]'::jsonb)
  into routes from public."Job_Routing" r
  left join public."Org_Master" carrier on carrier."Org_id" = r."JobRoute_Carrier"
  where r."Job_ID" = requested_job_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'kind', case lower(e."JobContainer_EquipmentKind")
      when 'uld' then 'ULD' when 'vehicle' then 'Vehicle' when 'wagon' then 'Wagon'
      when 'trailer' then 'Trailer' else 'Container' end,
    'number', e."JobContainer_Number", 'type', e."JobContainer_TypeCodeSnapshot"
  ) order by e."JobContainer_CreatedAt", e."JobContainers_ID"), '[]'::jsonb)
  into equipment from public."Job_Containers" e
  where e."Job_ID" = requested_job_id and not e."JobContainer_IsDeleted"
    and nullif(btrim(e."JobContainer_Number"), '') is not null
    and (
      (lower(e."JobContainer_EquipmentKind") = 'container'
        and (lower(job."Job_TransportModeSummary") in ('sea', 'ocean', 'rail')
          or exists (select 1 from public."Job_Routing" er
            where er."Job_ID" = requested_job_id and lower(er."JobRoute_ModeCode") in ('sea', 'ocean', 'rail'))))
      or (lower(e."JobContainer_EquipmentKind") = 'wagon'
        and (lower(job."Job_TransportModeSummary") = 'rail'
          or exists (select 1 from public."Job_Routing" er
            where er."Job_ID" = requested_job_id and lower(er."JobRoute_ModeCode") = 'rail')))
      or (lower(e."JobContainer_EquipmentKind") = 'uld'
        and (lower(job."Job_TransportModeSummary") = 'air'
          or exists (select 1 from public."Job_Routing" er
            where er."Job_ID" = requested_job_id and lower(er."JobRoute_ModeCode") = 'air')))
      or (lower(e."JobContainer_EquipmentKind") in ('vehicle', 'trailer')
        and (lower(job."Job_TransportModeSummary") = 'road'
          or exists (select 1 from public."Job_Routing" er
            where er."Job_ID" = requested_job_id and lower(er."JobRoute_ModeCode") = 'road')))
    );

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
    'mode', case lower(job."Job_TransportModeSummary")
      when 'ocean' then 'Sea' when 'sea' then 'Sea' when 'air' then 'Air'
      when 'road' then 'Road' when 'rail' then 'Rail'
      else initcap(job."Job_TransportModeSummary") end,
    'shipmentType', nullif(details->>'shipmentType', ''),
    'incoterm', nullif(concat_ws(' ', job."Job_IncotermsCode", job."Job_IncotermsLocation"), ''),
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
    'cargo', cargo_lines, 'equipment', equipment,
    'hasEquipment', jsonb_array_length(equipment) > 0,
    'specialInstructions', nullif(details->>'specialInstructions', ''),
    'priceAvailable', price_available, 'chargeLines', price_lines, 'chargeTotals', price_totals
  );
  return review || jsonb_build_object('reviewToken', md5(review::text));
exception
  when no_data_found or too_many_rows then
    raise exception 'Booking document identity is incomplete.' using errcode = '42501';
end $$;
commit;
