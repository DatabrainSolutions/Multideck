-- Persisted booking workspace reads and saves for the canonical Job aggregate.

begin;

create or replace function booking_api.workspace(
  caller_auth_user_id uuid,
  requested_reference text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  app_user record;
  job_row record;
  booking_value jsonb;
  parties_value jsonb;
  cargo_value jsonb;
  containers_value jsonb;
  routes_value jsonb;
  documents_value jsonb;
  declarations_value jsonb;
  charges_value jsonb;
  events_value jsonb;
  source_quote_value jsonb;
begin
  if caller_auth_user_id is null
     or not booking_api.has_permission(caller_auth_user_id, 'Bookings.Read') then
    raise exception 'Booking access is not authorised.' using errcode = '42501';
  end if;
  select "User_ID", "Company_ID" into strict app_user
  from public."cmp_Users"
  where "Auth_User_ID" = caller_auth_user_id
    and "User_AccessStatus" = 'active';

  select job.* into job_row
  from public."Job_Header" job
  join public."cmp_Offices" office
    on office."Office_ID" = coalesce(job."Job_OrgOfficeID", job."Job_OfficeID")
  where office."Company_ID" = app_user."Company_ID"
    and not job."Job_IsDeleted"
    and (
      upper(job."Job_BookingReference") = upper(btrim(requested_reference))
      or job."Job_ID"::text = btrim(requested_reference)
      or ('MD-' || job."Job_Number") = upper(btrim(requested_reference))
      or ('JOB-' || job."Job_Number") = upper(btrim(requested_reference))
    )
  limit 1;
  if not found then
    raise exception 'That booking could not be found in this workspace.' using errcode = 'P0002';
  end if;

  select jsonb_strip_nulls(jsonb_build_object(
    'jobId', job_row."Job_ID",
    'bookingReference', coalesce(job_row."Job_BookingReference", 'MD-' || job_row."Job_Number"),
    'jobReference', 'JOB-' || job_row."Job_Number",
    'jobNumber', job_row."Job_Number",
    'status', job_row."Job_Status",
    'direction', job_row."Job_Direction",
    'mode', job_row."Job_TransportModeSummary",
    'customerId', job_row."Job_Customer",
    'customerName', customer."Org_Name",
    'customerCode', customer."Org_AccCode",
    'carrierId', job_row."Job_Carrier",
    'carrierName', carrier."Org_Name",
    'supplierId', job_row."Job_Supplier",
    'supplierName', supplier."Org_Name",
    'officeId', coalesce(job_row."Job_OrgOfficeID", job_row."Job_OfficeID"),
    'origin', coalesce(job_row."Job_OriginNameSnapshot", job_row."Job_OriginUNLocode"),
    'originUnlocode', job_row."Job_OriginUNLocode",
    'destination', coalesce(job_row."Job_DestinationNameSnapshot", job_row."Job_DestinationUNLocode"),
    'destinationUnlocode', job_row."Job_DestinationUNLocode",
    'readyDate', job_row."Job_ReadyDate",
    'requiredDeliveryDate', job_row."Job_RequiredDeliveryDate",
    'customerDeadline', job_row."Job_CustomerDeadline",
    'predictedDeliveryAt', job_row."Job_PredictedDeliveryAt",
    'trackingStatus', job_row."Job_TrackingStatus",
    'currentLocation', job_row."Job_CurrentLocationNameSnapshot",
    'trackingRiskScore', job_row."Job_TrackingRiskScore",
    'internalNotes', job_row."Job_InternalNotes",
    'incoterm', job_row."Job_IncotermsCode",
    'incotermLocation', job_row."Job_IncotermsLocation",
    'freightChargeAmount', job_row."Job_FreightChargeAmount",
    'freightChargeCurrency', job_row."Job_FreightChargeCurrencyCode",
    'collectionAddress', job_row."Job_CollectionAddress",
    'deliveryAddress', job_row."Job_DeliveryAddress",
    'sourceQuoteId', job_row."Job_SourceQuoteID",
    'sourceQuoteVersionId', job_row."Job_SourceQuoteVersionID",
    'sourceQuoteResponseId', job_row."Job_SourceQuoteResponseID",
    'sourceSnapshot', job_row."Job_SourceSnapshotJSON",
    'createdAt', job_row."Job_CreatedDate",
    'updatedAt', job_row."Job_UpdatedAt"
  )) into booking_value
  from (select 1 as marker) base
  left join public."Org_Master" customer on customer."Org_id" = job_row."Job_Customer"
  left join public."Org_Master" carrier on carrier."Org_id" = job_row."Job_Carrier"
  left join public."Org_Master" supplier on supplier."Org_id" = job_row."Job_Supplier"
  limit 1;

  -- A right join above keeps the JSON row available for blank drafts. If a
  -- legacy customer reference is broken, build the same record without names.
  if booking_value is null then
    booking_value := jsonb_strip_nulls(jsonb_build_object(
      'jobId', job_row."Job_ID",
      'bookingReference', coalesce(job_row."Job_BookingReference", 'MD-' || job_row."Job_Number"),
      'jobReference', 'JOB-' || job_row."Job_Number",
      'jobNumber', job_row."Job_Number",
      'status', job_row."Job_Status",
      'direction', job_row."Job_Direction",
      'mode', job_row."Job_TransportModeSummary",
      'customerId', job_row."Job_Customer",
      'carrierId', job_row."Job_Carrier",
      'supplierId', job_row."Job_Supplier",
      'officeId', coalesce(job_row."Job_OrgOfficeID", job_row."Job_OfficeID"),
      'origin', coalesce(job_row."Job_OriginNameSnapshot", job_row."Job_OriginUNLocode"),
      'destination', coalesce(job_row."Job_DestinationNameSnapshot", job_row."Job_DestinationUNLocode"),
      'trackingStatus', job_row."Job_TrackingStatus",
      'currentLocation', job_row."Job_CurrentLocationNameSnapshot",
      'internalNotes', job_row."Job_InternalNotes",
      'incoterm', job_row."Job_IncotermsCode",
      'incotermLocation', job_row."Job_IncotermsLocation",
      'collectionAddress', job_row."Job_CollectionAddress",
      'deliveryAddress', job_row."Job_DeliveryAddress",
      'sourceQuoteId', job_row."Job_SourceQuoteID",
      'sourceQuoteVersionId', job_row."Job_SourceQuoteVersionID",
      'sourceQuoteResponseId', job_row."Job_SourceQuoteResponseID",
      'sourceSnapshot', job_row."Job_SourceSnapshotJSON",
      'createdAt', job_row."Job_CreatedDate",
      'updatedAt', job_row."Job_UpdatedAt"
    ));
  end if;

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id', party."JobParty_ID", 'role', party."JobParty_Role", 'organisationId', party."JobParty_OrgID",
    'addressId', party."JobParty_AddressID", 'contactId', party."JobParty_ContactID",
    'sequence', party."JobParty_Sequence", 'name', party."JobParty_NameSnapshot",
    'address', party."JobParty_AddressSnapshot", 'contactName', party."JobParty_ContactNameSnapshot",
    'email', party."JobParty_EmailSnapshot", 'phone', party."JobParty_PhoneSnapshot",
    'countryCode', party."JobParty_CountryCodeSnapshot", 'identifierType', party."JobParty_IdentifierType",
    'identifierValue', party."JobParty_IdentifierValueSnapshot", 'isPrimary', party."JobParty_IsPrimary",
    'rawSnapshot', party."JobParty_RawSnapshot"
  )) order by party."JobParty_Sequence", party."JobParty_Role"), '[]'::jsonb)
  into parties_value
  from public."Job_Parties" party where party."JobParty_JobID" = job_row."Job_ID";

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id', cargo."JobCargo_ID", 'lineNumber', cargo."JobCargo_LineNo", 'description', cargo."JobCargo_Description",
    'commodity', cargo."JobCargo_Commodity", 'pieces', cargo."JobCargo_Qty",
    'packageType', cargo."JobCargo_PackageTypeCodeSnapshot", 'packageQuantity', cargo."JobCargo_PackageQty",
    'grossWeightKg', cargo."JobCargo_GrossKilos", 'netWeightKg', cargo."JobCargo_NettKilos",
    'volumeCbm', cargo."JobCargo_VolumeCBM", 'hsCode', cargo."JobCargo_HSCode",
    'countryOfOrigin', cargo."JobCargo_CountryOfOriginCodeSnapshot",
    'declaredValue', cargo."JobCargo_DeclaredValueAmount",
    'declaredValueCurrency', cargo."JobCargo_DeclaredValueCurrencyCodeSnapshot",
    'isHazardous', cargo."JobCargo_IsHazardous", 'isTemperatureControlled', cargo."JobCargo_IsTemperatureControlled",
    'cargoData', cargo."JobCargo_CargoJSON"
  )) order by cargo."JobCargo_LineNo" nulls last, cargo."JobCargo_CreatedAt"), '[]'::jsonb)
  into cargo_value from public."Job_Cargo" cargo
  where cargo."JobCargo_JobID" = job_row."Job_ID" and not cargo."JobCargo_IsDeleted";

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id', container."JobContainers_ID", 'number', container."JobContainer_Number",
    'type', container."JobContainer_TypeCodeSnapshot", 'equipmentKind', container."JobContainer_EquipmentKind",
    'status', container."JobContainer_Status", 'grossWeightKg', container."JobContainer_GrossKilos",
    'notes', container."JobContainer_Notes", 'data', container."JobContainer_JSON"
  )) order by container."JobContainer_CreatedAt"), '[]'::jsonb)
  into containers_value from public."Job_Containers" container
  where container."Job_ID" = job_row."Job_ID" and not container."JobContainer_IsDeleted";

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id', route."JobRoute_ID", 'order', route."JobRoute_OrderNo", 'status', route."JobRoute_Status",
    'mode', route."JobRoute_ModeCode", 'origin', route."JobRoute_OriginNameSnapshot",
    'originUnlocode', route."JobRoute_OriginUNLocode", 'originAddress', route."JobRoute_OriginAddressSnapshot",
    'originTerminal', route."JobRoute_OriginTerminal", 'destination', route."JobRoute_DestinationNameSnapshot",
    'destinationUnlocode', route."JobRoute_DestinationUNLocode", 'destinationAddress', route."JobRoute_DestinationAddressSnapshot",
    'destinationTerminal', route."JobRoute_DestinationTerminal", 'plannedPickupAt', route."JobRoute_PlannedPickupAt",
    'plannedDepartureAt', route."JobRoute_PlannedDepartureAt", 'plannedArrivalAt', route."JobRoute_PlannedArrivalAt",
    'plannedDeliveryAt', route."JobRoute_PlannedDeliveryAt", 'carrierId', route."JobRoute_Carrier",
    'carrierBookingReference', route."JobRoute_CarrierBookingReference",
    'masterTransportReference', route."JobRoute_MasterTransportReference",
    'houseTransportReference', route."JobRoute_HouseTransportReference",
    'serviceLevel', route."JobRoute_ServiceLevel", 'transportMeansName', route."JobRoute_TransportMeansName",
    'vessel', route."JobRoute_Vessel", 'voyageNumber', route."JobRoute_VoyageNumber",
    'flightNumber', route."JobRoute_FlightNumber", 'vehicleRegistration', route."JobRoute_VehicleRegistration",
    'trailerNumber', route."JobRoute_TrailerNumber", 'railService', route."JobRoute_RailService",
    'isMainCarriage', route."JobRoute_IsMainCarriage",
    'routeData', route."JobRoute_RouteJSON"
  )) order by route."JobRoute_OrderNo" nulls last), '[]'::jsonb)
  into routes_value from public."Job_Routing" route where route."Job_ID" = job_row."Job_ID";

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id', document."JobDoc_ID", 'typeCode', document."JobDoc_DocTypeCodeSnapshot",
    'title', document."JobDoc_Title", 'description', document."JobDoc_Description",
    'status', document."JobDoc_Status", 'source', document."JobDoc_Source",
    'fileName', document."JobDoc_FileName", 'mimeType', document."JobDoc_FileMimeType",
    'fileSizeBytes', document."JobDoc_FileSizeBytes", 'version', document."JobDoc_VersionNo",
    'isCurrent', document."JobDoc_IsCurrentVersion", 'documentDate', document."JobDoc_DocumentDate",
    'receivedAt', document."JobDoc_ReceivedAt", 'metadata', document."JobDoc_MetadataJSON"
  )) order by document."JobDoc_CreatedAt" desc), '[]'::jsonb)
  into documents_value from public."Job_Documents" document
  where document."JobDoc_JobID" = job_row."Job_ID" and not document."JobDoc_IsDeleted";

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id', declaration."CUST_id", 'direction', declaration."CUST_Direction",
    'kind', declaration."CUST_DeclarationKind", 'status', declaration."CUST_Status",
    'localReference', declaration."CUST_LocalReferenceNumber",
    'customsReference', declaration."CUST_CustomsReferenceNumber",
    'mrn', declaration."CUST_MasterReferenceNumber", 'providerStatus', declaration."CUST_iCustomsStatusSnapshot",
    'createdAt', declaration."CUST_CreatedAt", 'updatedAt', declaration."CUST_UpdatedAt"
  )) order by declaration."CUST_CreatedAt" desc), '[]'::jsonb)
  into declarations_value from public."Customs_Declarations" declaration
  where declaration."CUST_JobID" = job_row."Job_ID" and not declaration."CUST_IsDeleted";

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id', charge."JobCostingLine_ID", 'lineNumber', charge."JobCostingLine_Number",
    'supplierId', charge."JobCostingLine_SupplierID", 'description', charge."JobCostingLine_Description",
    'internalNotes', charge."JobCostingLine_InternalNotes", 'customerNotes', charge."JobCostingLine_CustomerNotes",
    'costRoe', charge."JobCostingLine_CostROE", 'costAmount', charge."JobCostingLine_CostAmountCurrency",
    'costLocal', charge."JobCostingLine_CostAmountLocal", 'sellRoe', charge."JobCostingLine_RevenueROE",
    'sellAmount', charge."JobCostingLine_RevenueAmountCurrency", 'sellLocal', charge."JobCostingLine_RevenueAmountLocal",
    'showToCustomer', charge."JobCostingLine_ShowToCustomer"
  )) order by charge."JobCostingLine_Number"), '[]'::jsonb)
  into charges_value from public."Job_Costing_Lines" charge where charge."Job_ID" = job_row."Job_ID";

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id', event.event_id, 'type', event.event_type, 'summary', event.summary,
    'metadata', event.metadata, 'occurredAt', event.occurred_at,
    'actor', nullif(concat_ws(' ', actor."User_Firstname", actor."User_Lastname"), '')
  )) order by event.occurred_at desc), '[]'::jsonb)
  into events_value from booking_api.events event
  left join public."cmp_Users" actor on actor."User_ID" = event.actor_user_id
  where event.job_id = job_row."Job_ID";

  if job_row."Job_SourceQuoteID" is not null then
    select jsonb_strip_nulls(jsonb_build_object(
      'id', quote."CusQuoteHeader_ID",
      'reference', coalesce(quote."CusQuoteHeader_CustomerReference", 'Q-' || quote."CusQuoteHeader_Number"),
      'lifecycle', quote."CusQuoteHeader_LifecycleCode",
      'acceptedVersionId', quote."CusQuoteHeader_AcceptedVersionID"
    )) into source_quote_value
    from public."CusQuote_Header" quote where quote."CusQuoteHeader_ID" = job_row."Job_SourceQuoteID";
  end if;

  return jsonb_build_object(
    'booking', booking_value,
    'parties', parties_value,
    'cargo', cargo_value,
    'containers', containers_value,
    'routes', routes_value,
    'documents', documents_value,
    'declarations', declarations_value,
    'charges', charges_value,
    'events', events_value,
    'sourceQuote', source_quote_value
  );
exception
  when no_data_found or too_many_rows then
    raise exception 'Your workspace identity is incomplete.' using errcode = '42501';
end;
$$;

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
    update public."Job_Cargo" set "JobCargo_IsDeleted" = true, "JobCargo_UpdatedAt" = now(), "JobCargo_UpdatedBy" = app_user."User_ID"
    where "JobCargo_JobID" = requested_job_id and not "JobCargo_IsDeleted";
    line_number := 0;
    for line in select value from jsonb_array_elements(payload->'cargo') loop
      if nullif(btrim(line->>'description'), '') is not null then
        line_number := line_number + 1;
        insert into public."Job_Cargo" (
          "JobCargo_JobID", "JobCargo_LineNo", "JobCargo_Description", "JobCargo_Commodity", "JobCargo_Qty",
          "JobCargo_PackageTypeCodeSnapshot", "JobCargo_PackageQty", "JobCargo_GrossKilos", "JobCargo_NettKilos",
          "JobCargo_HSCode", "JobCargo_CountryOfOriginCodeSnapshot", "JobCargo_VolumeCBM",
          "JobCargo_DeclaredValueAmount", "JobCargo_DeclaredValueCurrencyCodeSnapshot",
          "JobCargo_IsHazardous", "JobCargo_IsTemperatureControlled", "JobCargo_CargoJSON", "JobCargo_UpdatedBy"
        ) values (
          requested_job_id, line_number, btrim(line->>'description'), left(nullif(btrim(line->>'commodity'), ''), 50),
          nullif(line->>'pieces', '')::numeric, left(nullif(btrim(line->>'packageType'), ''), 40),
          nullif(line->>'packageQuantity', '')::numeric, nullif(line->>'grossWeightKg', '')::numeric,
          nullif(line->>'netWeightKg', '')::numeric, left(nullif(btrim(line->>'hsCode'), ''), 30),
          upper(left(nullif(btrim(line->>'countryOfOrigin'), ''), 2)), nullif(line->>'volumeCbm', '')::numeric,
          nullif(line->>'declaredValue', '')::numeric, upper(left(nullif(btrim(line->>'declaredValueCurrency'), ''), 3)),
          coalesce((line->>'isHazardous')::boolean, false), coalesce((line->>'isTemperatureControlled')::boolean, false),
          line, app_user."User_ID"
        );
      end if;
    end loop;
  end if;

  if payload ? 'containers' then
    if jsonb_typeof(payload->'containers') <> 'array' or jsonb_array_length(payload->'containers') > 100 then
      raise exception 'Booking containers are invalid.' using errcode = '22023';
    end if;
    update public."Job_Containers" set "JobContainer_IsDeleted" = true, "JobContainer_UpdatedAt" = now(), "JobContainer_UpdatedBy" = app_user."User_ID"
    where "Job_ID" = requested_job_id and not "JobContainer_IsDeleted";
    for line in select value from jsonb_array_elements(payload->'containers') loop
      if quote_api.jsonb_has_content(line) then
        insert into public."Job_Containers" (
          "Job_ID", "JobContainer_Number", "JobContainer_TypeCodeSnapshot", "JobContainer_EquipmentKind",
          "JobContainer_Status", "JobContainer_GrossKilos", "JobContainer_Notes", "JobContainer_JSON", "JobContainer_UpdatedBy"
        ) values (
          requested_job_id, left(nullif(btrim(line->>'number'), ''), 50), left(nullif(btrim(line->>'type'), ''), 40),
          coalesce(left(nullif(btrim(line->>'equipmentKind'), ''), 40), 'container'),
          coalesce(left(nullif(btrim(line->>'status'), ''), 40), 'planned'), nullif(line->>'grossWeightKg', '')::numeric,
          nullif(btrim(line->>'notes'), ''), line, app_user."User_ID"
        );
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

create or replace function public.booking_workflow_has_permission(
  caller_auth_user_id uuid,
  permission_value text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select booking_api.has_permission(caller_auth_user_id, permission_value) $$;

create or replace function public.booking_workflow_workspace(
  caller_auth_user_id uuid,
  requested_reference text
)
returns jsonb language sql stable security definer set search_path = ''
as $$ select booking_api.workspace(caller_auth_user_id, requested_reference) $$;

create or replace function public.booking_workflow_save(
  caller_auth_user_id uuid,
  requested_job_id uuid,
  payload jsonb
)
returns jsonb language sql security definer set search_path = ''
as $$ select booking_api.save_booking(caller_auth_user_id, requested_job_id, payload) $$;

revoke all on function booking_api.workspace(uuid,text) from public, anon, authenticated;
revoke all on function booking_api.save_booking(uuid,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.booking_workflow_has_permission(uuid,text) from public, anon, authenticated;
revoke all on function public.booking_workflow_workspace(uuid,text) from public, anon, authenticated;
revoke all on function public.booking_workflow_save(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.booking_workflow_has_permission(uuid,text) to service_role;
grant execute on function public.booking_workflow_workspace(uuid,text) to service_role;
grant execute on function public.booking_workflow_save(uuid,uuid,jsonb) to service_role;

commit;
