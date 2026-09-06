-- Preserve stable cargo/equipment identities on ordinary Booking saves.
-- No schema, permission, acceptance, document or audit boundary is relaxed.
-- Full previous function body matched the development database before this change.
begin;

create or replace function booking_api.save_booking(
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
  app_user record;
  job_row record;
  route_id uuid;
  cargo_id uuid;
  container_id uuid;
  customer_id uuid;
  direction_value text;
  mode_value text;
  status_value text;
  party jsonb;
  line jsonb;
  line_number integer;
  retained_ids uuid[];
begin
  if caller_auth_user_id is null
     or not booking_api.has_permission(caller_auth_user_id, 'Bookings.Write') then
    raise exception 'Booking changes are not authorised.' using errcode = '42501';
  end if;
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'Booking details are required.' using errcode = '22023';
  end if;
  select "User_ID", "Company_ID" into strict app_user
  from public."cmp_Users"
  where "Auth_User_ID" = caller_auth_user_id and "User_AccessStatus" = 'active';
  select job.* into job_row
  from public."Job_Header" job
  join public."cmp_Offices" office on office."Office_ID" = coalesce(job."Job_OrgOfficeID", job."Job_OfficeID")
  where job."Job_ID" = requested_job_id and office."Company_ID" = app_user."Company_ID" and not job."Job_IsDeleted"
  for update;
  if not found then raise exception 'That booking is outside this workspace.' using errcode = '42501'; end if;

  customer_id := case when payload ? 'customerId' then nullif(payload->>'customerId', '')::uuid else job_row."Job_Customer" end;
  if customer_id is not null and not exists (select 1 from public."Org_Master" organisation where organisation."Org_id" = customer_id) then
    raise exception 'Choose a valid customer.' using errcode = '22023';
  end if;
  direction_value := case when payload ? 'direction' then booking_api.normalise_direction(payload->>'direction') else coalesce(job_row."Job_Direction", 'unknown') end;
  mode_value := case when payload ? 'mode' then booking_api.normalise_mode(payload->>'mode') else job_row."Job_TransportModeSummary" end;
  status_value := case when payload ? 'status' then lower(btrim(payload->>'status')) else job_row."Job_Status" end;
  if status_value not in (select status."JS_Code" from public."sys_JobStatuses" status where status."JS_IsActive") then
    raise exception 'Choose a valid booking status.' using errcode = '22023';
  end if;
  if status_value <> 'draft' and customer_id is null then
    raise exception 'Choose a customer before moving this booking out of draft.' using errcode = '22023';
  end if;

  update public."Job_Header" job set
    "Job_Customer" = customer_id,
    "Job_Carrier" = case when payload ? 'carrierId' then nullif(payload->>'carrierId', '')::uuid else job."Job_Carrier" end,
    "Job_Supplier" = case when payload ? 'supplierId' then nullif(payload->>'supplierId', '')::uuid else job."Job_Supplier" end,
    "Job_Status" = status_value,
    "Job_Direction" = direction_value,
    "Job_TransportModeSummary" = mode_value,
    "Job_OriginUNLocode" = case when payload ? 'originUnlocode' then upper(nullif(btrim(payload->>'originUnlocode'), '')) else job."Job_OriginUNLocode" end,
    "Job_OriginNameSnapshot" = case when payload ? 'origin' then nullif(btrim(payload->>'origin'), '') else job."Job_OriginNameSnapshot" end,
    "Job_DestinationUNLocode" = case when payload ? 'destinationUnlocode' then upper(nullif(btrim(payload->>'destinationUnlocode'), '')) else job."Job_DestinationUNLocode" end,
    "Job_DestinationNameSnapshot" = case when payload ? 'destination' then nullif(btrim(payload->>'destination'), '') else job."Job_DestinationNameSnapshot" end,
    "Job_ReadyDate" = case when payload ? 'readyDate' then nullif(payload->>'readyDate', '')::date else job."Job_ReadyDate" end,
    "Job_RequiredDeliveryDate" = case when payload ? 'requiredDeliveryDate' then nullif(payload->>'requiredDeliveryDate', '')::date else job."Job_RequiredDeliveryDate" end,
    "Job_CustomerDeadline" = case when payload ? 'customerDeadline' then nullif(payload->>'customerDeadline', '')::date else job."Job_CustomerDeadline" end,
    "Job_PredictedDeliveryAt" = case when payload ? 'predictedDeliveryAt' then nullif(payload->>'predictedDeliveryAt', '')::timestamptz else job."Job_PredictedDeliveryAt" end,
    "Job_TrackingStatus" = case when payload ? 'trackingStatus' then nullif(btrim(payload->>'trackingStatus'), '') else job."Job_TrackingStatus" end,
    "Job_CurrentLocationNameSnapshot" = case when payload ? 'currentLocation' then nullif(btrim(payload->>'currentLocation'), '') else job."Job_CurrentLocationNameSnapshot" end,
    "Job_InternalNotes" = case when payload ? 'internalNotes' then nullif(btrim(payload->>'internalNotes'), '') else job."Job_InternalNotes" end,
    "Job_IncotermsCode" = case when payload ? 'incoterm' then upper(nullif(btrim(payload->>'incoterm'), '')) else job."Job_IncotermsCode" end,
    "Job_IncotermsLocation" = case when payload ? 'incotermLocation' then nullif(btrim(payload->>'incotermLocation'), '') else job."Job_IncotermsLocation" end,
    "Job_FreightChargeAmount" = case when payload ? 'freightChargeAmount' then nullif(payload->>'freightChargeAmount', '')::numeric else job."Job_FreightChargeAmount" end,
    "Job_FreightChargeCurrencyCode" = case when payload ? 'freightChargeCurrency' then upper(nullif(btrim(payload->>'freightChargeCurrency'), '')) else job."Job_FreightChargeCurrencyCode" end,
    "Job_CollectionAddress" = case when payload ? 'collectionAddress' then nullif(btrim(payload->>'collectionAddress'), '') else job."Job_CollectionAddress" end,
    "Job_DeliveryAddress" = case when payload ? 'deliveryAddress' then nullif(btrim(payload->>'deliveryAddress'), '') else job."Job_DeliveryAddress" end,
    "Job_UpdatedAt" = now(), "Job_UpdatedBy" = app_user."User_ID"
  where job."Job_ID" = requested_job_id;

  if payload ? 'route' and jsonb_typeof(payload->'route') = 'object' then
    select route."JobRoute_ID" into route_id from public."Job_Routing" route
    where route."Job_ID" = requested_job_id order by route."JobRoute_OrderNo" nulls last limit 1;
    if route_id is null then
      insert into public."Job_Routing" (
        "Job_ID", "JobRoute_OrderNo", "JobRoute_Status", "JobRoute_ModeCode",
        "JobRoute_OriginUNLocode", "JobRoute_OriginNameSnapshot", "JobRoute_OriginAddressSnapshot",
        "JobRoute_DestinationUNLocode", "JobRoute_DestinationNameSnapshot", "JobRoute_DestinationAddressSnapshot",
        "JobRoute_PlannedPickupAt", "JobRoute_PlannedDepartureAt", "JobRoute_PlannedArrivalAt", "JobRoute_PlannedDeliveryAt",
        "JobRoute_Carrier", "JobRoute_CarrierBookingReference", "JobRoute_MasterTransportReference",
        "JobRoute_HouseTransportReference", "JobRoute_ServiceLevel", "JobRoute_TransportMeansName",
        "JobRoute_Vessel", "JobRoute_VoyageNumber", "JobRoute_FlightNumber", "JobRoute_VehicleRegistration",
        "JobRoute_TrailerNumber", "JobRoute_RailService", "JobRoute_IsMainCarriage", "JobRoute_RouteJSON", "JobRoute_UpdatedBy"
      ) values (
        requested_job_id, 1, 'planned', mode_value,
        upper(nullif(payload#>>'{route,originUnlocode}', '')), nullif(payload#>>'{route,origin}', ''), nullif(payload#>>'{route,originAddress}', ''),
        upper(nullif(payload#>>'{route,destinationUnlocode}', '')), nullif(payload#>>'{route,destination}', ''), nullif(payload#>>'{route,destinationAddress}', ''),
        nullif(payload#>>'{route,plannedPickupAt}', '')::timestamptz, nullif(payload#>>'{route,plannedDepartureAt}', '')::timestamptz,
        nullif(payload#>>'{route,plannedArrivalAt}', '')::timestamptz, nullif(payload#>>'{route,plannedDeliveryAt}', '')::timestamptz,
        nullif(payload#>>'{route,carrierId}', '')::uuid, nullif(payload#>>'{route,carrierBookingReference}', ''),
        nullif(payload#>>'{route,masterTransportReference}', ''), nullif(payload#>>'{route,houseTransportReference}', ''),
        nullif(payload#>>'{route,serviceLevel}', ''), nullif(payload#>>'{route,transportMeansName}', ''),
        nullif(payload#>>'{route,vessel}', ''), nullif(payload#>>'{route,voyageNumber}', ''),
        nullif(payload#>>'{route,flightNumber}', ''), nullif(payload#>>'{route,vehicleRegistration}', ''),
        nullif(payload#>>'{route,trailerNumber}', ''), nullif(payload#>>'{route,railService}', ''),
        true, coalesce(payload->'route', '{}'::jsonb), app_user."User_ID"
      ) returning "JobRoute_ID" into route_id;
    else
      update public."Job_Routing" route set
        "JobRoute_ModeCode" = mode_value,
        "JobRoute_OriginUNLocode" = case when payload#>>'{route,originUnlocode}' is not null then upper(nullif(payload#>>'{route,originUnlocode}', '')) else route."JobRoute_OriginUNLocode" end,
        "JobRoute_OriginNameSnapshot" = case when payload#>>'{route,origin}' is not null then nullif(payload#>>'{route,origin}', '') else route."JobRoute_OriginNameSnapshot" end,
        "JobRoute_OriginAddressSnapshot" = case when payload#>>'{route,originAddress}' is not null then nullif(payload#>>'{route,originAddress}', '') else route."JobRoute_OriginAddressSnapshot" end,
        "JobRoute_DestinationUNLocode" = case when payload#>>'{route,destinationUnlocode}' is not null then upper(nullif(payload#>>'{route,destinationUnlocode}', '')) else route."JobRoute_DestinationUNLocode" end,
        "JobRoute_DestinationNameSnapshot" = case when payload#>>'{route,destination}' is not null then nullif(payload#>>'{route,destination}', '') else route."JobRoute_DestinationNameSnapshot" end,
        "JobRoute_DestinationAddressSnapshot" = case when payload#>>'{route,destinationAddress}' is not null then nullif(payload#>>'{route,destinationAddress}', '') else route."JobRoute_DestinationAddressSnapshot" end,
        "JobRoute_PlannedPickupAt" = case when payload#>>'{route,plannedPickupAt}' is not null then nullif(payload#>>'{route,plannedPickupAt}', '')::timestamptz else route."JobRoute_PlannedPickupAt" end,
        "JobRoute_PlannedDepartureAt" = case when payload#>>'{route,plannedDepartureAt}' is not null then nullif(payload#>>'{route,plannedDepartureAt}', '')::timestamptz else route."JobRoute_PlannedDepartureAt" end,
        "JobRoute_PlannedArrivalAt" = case when payload#>>'{route,plannedArrivalAt}' is not null then nullif(payload#>>'{route,plannedArrivalAt}', '')::timestamptz else route."JobRoute_PlannedArrivalAt" end,
        "JobRoute_PlannedDeliveryAt" = case when payload#>>'{route,plannedDeliveryAt}' is not null then nullif(payload#>>'{route,plannedDeliveryAt}', '')::timestamptz else route."JobRoute_PlannedDeliveryAt" end,
        "JobRoute_Carrier" = case when payload#>>'{route,carrierId}' is not null then nullif(payload#>>'{route,carrierId}', '')::uuid else route."JobRoute_Carrier" end,
        "JobRoute_CarrierBookingReference" = case when payload#>>'{route,carrierBookingReference}' is not null then nullif(payload#>>'{route,carrierBookingReference}', '') else route."JobRoute_CarrierBookingReference" end,
        "JobRoute_MasterTransportReference" = case when payload#>>'{route,masterTransportReference}' is not null then nullif(payload#>>'{route,masterTransportReference}', '') else route."JobRoute_MasterTransportReference" end,
        "JobRoute_HouseTransportReference" = case when payload#>>'{route,houseTransportReference}' is not null then nullif(payload#>>'{route,houseTransportReference}', '') else route."JobRoute_HouseTransportReference" end,
        "JobRoute_ServiceLevel" = case when payload#>>'{route,serviceLevel}' is not null then nullif(payload#>>'{route,serviceLevel}', '') else route."JobRoute_ServiceLevel" end,
        "JobRoute_TransportMeansName" = case when payload#>>'{route,transportMeansName}' is not null then nullif(payload#>>'{route,transportMeansName}', '') else route."JobRoute_TransportMeansName" end,
        "JobRoute_Vessel" = case when payload#>>'{route,vessel}' is not null then nullif(payload#>>'{route,vessel}', '') else route."JobRoute_Vessel" end,
        "JobRoute_VoyageNumber" = case when payload#>>'{route,voyageNumber}' is not null then nullif(payload#>>'{route,voyageNumber}', '') else route."JobRoute_VoyageNumber" end,
        "JobRoute_FlightNumber" = case when payload#>>'{route,flightNumber}' is not null then nullif(payload#>>'{route,flightNumber}', '') else route."JobRoute_FlightNumber" end,
        "JobRoute_VehicleRegistration" = case when payload#>>'{route,vehicleRegistration}' is not null then nullif(payload#>>'{route,vehicleRegistration}', '') else route."JobRoute_VehicleRegistration" end,
        "JobRoute_TrailerNumber" = case when payload#>>'{route,trailerNumber}' is not null then nullif(payload#>>'{route,trailerNumber}', '') else route."JobRoute_TrailerNumber" end,
        "JobRoute_RailService" = case when payload#>>'{route,railService}' is not null then nullif(payload#>>'{route,railService}', '') else route."JobRoute_RailService" end,
        "JobRoute_RouteJSON" = route."JobRoute_RouteJSON" || coalesce(payload->'route', '{}'::jsonb),
        "JobRoute_UpdatedAt" = now(), "JobRoute_UpdatedBy" = app_user."User_ID"
      where route."JobRoute_ID" = route_id;
    end if;
  end if;

  if payload ? 'parties' then
    if jsonb_typeof(payload->'parties') <> 'array' or jsonb_array_length(payload->'parties') > 30 then
      raise exception 'Booking parties are invalid.' using errcode = '22023';
    end if;
    delete from public."Job_Parties" where "JobParty_JobID" = requested_job_id;
    for party in select value from jsonb_array_elements(payload->'parties') loop
      if nullif(btrim(party->>'role'), '') is null then raise exception 'Each booking party needs a role.' using errcode = '22023'; end if;
      insert into public."Job_Parties" (
        "JobParty_JobID", "JobParty_Role", "JobParty_OrgID", "JobParty_AddressID", "JobParty_ContactID",
        "JobParty_Sequence", "JobParty_NameSnapshot", "JobParty_AddressSnapshot", "JobParty_ContactNameSnapshot",
        "JobParty_EmailSnapshot", "JobParty_PhoneSnapshot", "JobParty_CountryCodeSnapshot",
        "JobParty_IdentifierType", "JobParty_IdentifierValueSnapshot", "JobParty_IsPrimary",
        "JobParty_RawSnapshot", "JobParty_CreatedBy"
      ) values (
        requested_job_id, left(lower(btrim(party->>'role')), 60), nullif(party->>'organisationId', '')::uuid,
        nullif(party->>'addressId', '')::uuid, nullif(party->>'contactId', '')::uuid,
        greatest(coalesce(nullif(party->>'sequence', '')::integer, 1), 1), left(nullif(btrim(party->>'name'), ''), 240),
        nullif(btrim(party->>'address'), ''), left(nullif(btrim(party->>'contactName'), ''), 180),
        left(nullif(btrim(party->>'email'), ''), 254), left(nullif(btrim(party->>'phone'), ''), 80),
        upper(left(nullif(btrim(party->>'countryCode'), ''), 2)), left(nullif(btrim(party->>'identifierType'), ''), 80),
        left(nullif(btrim(party->>'identifierValue'), ''), 120), coalesce((party->>'isPrimary')::boolean, false),
        party, app_user."User_ID"
      );
    end loop;
  end if;

  if payload ? 'cargo' then
    if jsonb_typeof(payload->'cargo') <> 'array' or jsonb_array_length(payload->'cargo') > 200 then
      raise exception 'Booking cargo lines are invalid.' using errcode = '22023';
    end if;
    -- Validate identities before retiring omitted items. Never accept another job's ID,
    -- resurrect archived cargo, or let a duplicate ID silently collapse two rows.
    retained_ids := '{}'::uuid[];
    for line in select value from jsonb_array_elements(payload->'cargo') loop
      if jsonb_typeof(line) is distinct from 'object' or nullif(btrim(line->>'description'), '') is null then
        raise exception 'Every cargo line needs a goods description.' using errcode = '22023';
      end if;
      cargo_id := nullif(line->>'id', '')::uuid;
      if cargo_id is not null then
        if cargo_id = any(retained_ids) then
          raise exception 'Duplicate cargo identity.' using errcode = '22023';
        end if;
        if not exists (
          select 1 from public."Job_Cargo"
          where "JobCargo_ID" = cargo_id and "JobCargo_JobID" = requested_job_id
            and not "JobCargo_IsDeleted"
        ) then
          raise exception 'That cargo record is no longer active in this booking. Reload before saving.' using errcode = '42501';
        end if;
        retained_ids := array_append(retained_ids, cargo_id);
      end if;
    end loop;
    -- Soft retirement preserves historical documents and allocations. Retained IDs
    -- are updated in place, including fields not exposed by the current editor.
    update public."Job_Cargo" set "JobCargo_IsDeleted" = true,
      "JobCargo_UpdatedAt" = now(), "JobCargo_UpdatedBy" = app_user."User_ID"
    where "JobCargo_JobID" = requested_job_id and not "JobCargo_IsDeleted"
      and not ("JobCargo_ID" = any(retained_ids));
    -- Release active line numbers inside the same locked transaction so reordering is safe.
    update public."Job_Cargo" set "JobCargo_LineNo" = null
    where "JobCargo_JobID" = requested_job_id and not "JobCargo_IsDeleted";
    line_number := 0;
    for line in select value from jsonb_array_elements(payload->'cargo') loop
      if nullif(btrim(line->>'description'), '') is not null then
        line_number := line_number + 1;
        insert into public."Job_Cargo" (
          "JobCargo_ID",
          "JobCargo_JobID", "JobCargo_LineNo", "JobCargo_Description", "JobCargo_Commodity", "JobCargo_Qty",
          "JobCargo_PackageTypeCodeSnapshot", "JobCargo_PackageQty", "JobCargo_GrossKilos", "JobCargo_NettKilos",
          "JobCargo_HSCode", "JobCargo_CountryOfOriginCodeSnapshot", "JobCargo_VolumeCBM",
          "JobCargo_DeclaredValueAmount", "JobCargo_DeclaredValueCurrencyCodeSnapshot",
          "JobCargo_IsHazardous", "JobCargo_IsTemperatureControlled", "JobCargo_CargoJSON", "JobCargo_UpdatedBy"
        ) values (
          coalesce(nullif(line->>'id', '')::uuid, gen_random_uuid()),
          requested_job_id, line_number, btrim(line->>'description'), left(nullif(btrim(line->>'commodity'), ''), 50),
          nullif(line->>'pieces', '')::numeric, left(nullif(btrim(line->>'packageType'), ''), 40),
          nullif(line->>'packageQuantity', '')::numeric, nullif(line->>'grossWeightKg', '')::numeric,
          nullif(line->>'netWeightKg', '')::numeric, left(nullif(btrim(line->>'hsCode'), ''), 30),
          upper(left(nullif(btrim(line->>'countryOfOrigin'), ''), 2)), nullif(line->>'volumeCbm', '')::numeric,
          nullif(line->>'declaredValue', '')::numeric, upper(left(nullif(btrim(line->>'declaredValueCurrency'), ''), 3)),
          coalesce((line->>'isHazardous')::boolean, false), coalesce((line->>'isTemperatureControlled')::boolean, false),
          line, app_user."User_ID"
        ) on conflict ("JobCargo_ID") do update set
          "JobCargo_LineNo" = excluded."JobCargo_LineNo",
          "JobCargo_Description" = excluded."JobCargo_Description",
          "JobCargo_Commodity" = excluded."JobCargo_Commodity",
          "JobCargo_Qty" = excluded."JobCargo_Qty",
          "JobCargo_PackageTypeCodeSnapshot" = excluded."JobCargo_PackageTypeCodeSnapshot",
          "JobCargo_PackageQty" = excluded."JobCargo_PackageQty",
          "JobCargo_GrossKilos" = excluded."JobCargo_GrossKilos",
          "JobCargo_NettKilos" = excluded."JobCargo_NettKilos",
          "JobCargo_HSCode" = excluded."JobCargo_HSCode",
          "JobCargo_CountryOfOriginCodeSnapshot" = excluded."JobCargo_CountryOfOriginCodeSnapshot",
          "JobCargo_VolumeCBM" = excluded."JobCargo_VolumeCBM",
          "JobCargo_DeclaredValueAmount" = excluded."JobCargo_DeclaredValueAmount",
          "JobCargo_DeclaredValueCurrencyCodeSnapshot" = excluded."JobCargo_DeclaredValueCurrencyCodeSnapshot",
          "JobCargo_IsHazardous" = excluded."JobCargo_IsHazardous",
          "JobCargo_IsTemperatureControlled" = excluded."JobCargo_IsTemperatureControlled",
          "JobCargo_CargoJSON" = public."Job_Cargo"."JobCargo_CargoJSON" || excluded."JobCargo_CargoJSON",
          "JobCargo_UpdatedBy" = excluded."JobCargo_UpdatedBy",
          "JobCargo_UpdatedAt" = now();
      end if;
    end loop;
  end if;

  if payload ? 'containers' then
    if jsonb_typeof(payload->'containers') <> 'array' or jsonb_array_length(payload->'containers') > 100 then
      raise exception 'Booking containers are invalid.' using errcode = '22023';
    end if;
    -- Validate identities before retiring omitted items. Never accept another job's ID,
    -- resurrect archived cargo, or let a duplicate ID silently collapse two rows.
    retained_ids := '{}'::uuid[];
    for line in select value from jsonb_array_elements(payload->'containers') loop
      if jsonb_typeof(line) is distinct from 'object' then
        raise exception 'Every equipment line must be an object.' using errcode = '22023';
      end if;
      container_id := nullif(line->>'id', '')::uuid;
      if container_id is not null then
        if container_id = any(retained_ids) then
          raise exception 'Duplicate containers identity.' using errcode = '22023';
        end if;
        if not exists (
          select 1 from public."Job_Containers"
          where "JobContainers_ID" = container_id and "Job_ID" = requested_job_id
            and not "JobContainer_IsDeleted"
        ) then
          raise exception 'That containers record is no longer active in this booking. Reload before saving.' using errcode = '42501';
        end if;
        retained_ids := array_append(retained_ids, container_id);
      end if;
    end loop;
    -- Soft retirement preserves historical documents and allocations. Retained IDs
    -- are updated in place, including fields not exposed by the current editor.
    update public."Job_Containers" set "JobContainer_IsDeleted" = true,
      "JobContainer_UpdatedAt" = now(), "JobContainer_UpdatedBy" = app_user."User_ID"
    where "Job_ID" = requested_job_id and not "JobContainer_IsDeleted"
      and not ("JobContainers_ID" = any(retained_ids));
    for line in select value from jsonb_array_elements(payload->'containers') loop
      if quote_api.jsonb_has_content(line) then
        insert into public."Job_Containers" (
          "JobContainers_ID",
          "Job_ID", "JobContainer_Number", "JobContainer_TypeCodeSnapshot", "JobContainer_EquipmentKind",
          "JobContainer_Status", "JobContainer_GrossKilos", "JobContainer_Notes", "JobContainer_JSON", "JobContainer_UpdatedBy"
        ) values (
          coalesce(nullif(line->>'id', '')::uuid, gen_random_uuid()),
          requested_job_id, left(nullif(btrim(line->>'number'), ''), 50), left(nullif(btrim(line->>'type'), ''), 40),
          coalesce(left(nullif(btrim(line->>'equipmentKind'), ''), 40), 'container'),
          coalesce(left(nullif(btrim(line->>'status'), ''), 40), 'planned'), nullif(line->>'grossWeightKg', '')::numeric,
          nullif(btrim(line->>'notes'), ''), line, app_user."User_ID"
        ) on conflict ("JobContainers_ID") do update set
          "JobContainer_Number" = excluded."JobContainer_Number",
          "JobContainer_TypeCodeSnapshot" = excluded."JobContainer_TypeCodeSnapshot",
          "JobContainer_EquipmentKind" = excluded."JobContainer_EquipmentKind",
          "JobContainer_Status" = excluded."JobContainer_Status",
          "JobContainer_GrossKilos" = excluded."JobContainer_GrossKilos",
          "JobContainer_Notes" = excluded."JobContainer_Notes",
          "JobContainer_JSON" = public."Job_Containers"."JobContainer_JSON" || excluded."JobContainer_JSON",
          "JobContainer_UpdatedBy" = excluded."JobContainer_UpdatedBy",
          "JobContainer_UpdatedAt" = now();
      end if;
    end loop;
  end if;

  insert into booking_api.events (company_id, job_id, event_type, summary, metadata, actor_user_id)
  values (
    app_user."Company_ID", requested_job_id, 'saved', 'Booking changes saved.',
    jsonb_build_object('fields', (select jsonb_agg(field_name) from jsonb_object_keys(payload) as field_name)),
    app_user."User_ID"
  );

  return booking_api.workspace(caller_auth_user_id, job_row."Job_BookingReference");
exception
  when no_data_found or too_many_rows then raise exception 'Your workspace identity is incomplete.' using errcode = '42501';
end;
$$;

revoke all on function booking_api.save_booking(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function booking_api.save_booking(uuid, uuid, jsonb) to service_role;

commit;
