-- One-off quotes are valid customer-facing records, but an operational booking
-- cannot move beyond draft until it is linked to a CRM organisation. Preserve
-- the accepted quote snapshot and create a draft instead of violating the
-- existing Job_Header customer constraint.

begin;

create or replace function booking_api.convert_accepted_quote(
  requested_quote_id uuid,
  requested_actor_user_id uuid default null,
  requested_response_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  quote_row record;
  version_row record;
  actor_user_id uuid;
  company_id uuid;
  office_id uuid;
  customer_id uuid;
  job_status text;
  booking_reference text;
  job_id uuid;
  payload jsonb;
  facts jsonb;
  party jsonb;
  charge jsonb;
  charge_number integer := 0;
  mode_code text;
  direction_code text;
  existing_job record;
begin
  select job.* into existing_job
  from public."Job_Header" job
  where job."Job_SourceQuoteID" = requested_quote_id
    and not job."Job_IsDeleted"
  limit 1;
  if found then
    if requested_response_id is not null and existing_job."Job_SourceQuoteResponseID" is null then
      update public."Job_Header"
      set "Job_SourceQuoteResponseID" = requested_response_id,
          "Job_UpdatedAt" = now()
      where "Job_ID" = existing_job."Job_ID";
    end if;
    return jsonb_build_object(
      'jobId', existing_job."Job_ID",
      'bookingReference', existing_job."Job_BookingReference",
      'status', existing_job."Job_Status",
      'requiresCustomerLink', existing_job."Job_Customer" is null,
      'reused', true
    );
  end if;

  select quote.* into quote_row
  from public."CusQuote_Header" quote
  where quote."CusQuoteHeader_ID" = requested_quote_id
    and quote."CusQuoteHeader_LifecycleCode" = 'accepted'
    and not quote."CusQuoteHeader_IsDeleted"
  for update;
  if not found then
    raise exception 'Only an accepted quote can create a booking.' using errcode = '22023';
  end if;

  select version.* into version_row
  from public."CusQuote_Versions" version
  where version."CusQuoteVersion_ID" = coalesce(
    quote_row."CusQuoteHeader_AcceptedVersionID",
    (select current_version."CusQuoteVersion_ID"
     from public."CusQuote_Versions" current_version
     where current_version."CusQuoteHeader_ID" = requested_quote_id
       and current_version."CusQuoteVersion_IsCurrent"
     limit 1)
  );
  if not found then
    raise exception 'The accepted quote version is unavailable.' using errcode = 'P0002';
  end if;

  payload := coalesce(version_row."CusQuoteVersion_SnapshotJSON"->'quote', '{}'::jsonb);
  facts := coalesce(payload->'shipmentFacts', '{}'::jsonb);
  office_id := coalesce(
    nullif(payload->>'officeId', '')::uuid,
    quote_row."CusQuoteHeader_OrgOfficeID",
    quote_row."OrgOffice_ID"
  );
  select office."Company_ID" into company_id
  from public."cmp_Offices" office
  where office."Office_ID" = office_id;
  if company_id is null then
    raise exception 'The accepted quote office is unavailable.' using errcode = 'P0002';
  end if;

  actor_user_id := coalesce(
    requested_actor_user_id,
    quote_row."CusQuoteHeader_SalesOwnerID",
    quote_row."CusQuoteHeader_LastEditedBy",
    quote_row."CusQuoteHeader_CreatedBy"
  );
  if not exists (
    select 1 from public."cmp_Users" app_user
    where app_user."User_ID" = actor_user_id
      and app_user."Company_ID" = company_id
  ) then
    select app_user."User_ID" into actor_user_id
    from public."cmp_Users" app_user
    where app_user."Company_ID" = company_id
      and app_user."User_AccessStatus" = 'active'
    order by app_user."User_ID"
    limit 1;
  end if;
  if actor_user_id is null then
    raise exception 'No active operator can own the accepted booking.' using errcode = 'P0002';
  end if;

  booking_reference := booking_api.allocate_reference(company_id, 'default');
  direction_code := booking_api.normalise_direction(coalesce(payload->>'direction', quote_row."CusQuoteHeader_Direction"));
  mode_code := booking_api.normalise_mode(coalesce(payload->>'mode', quote_row."CusQuoteHeader_ModeCode"));
  customer_id := coalesce(nullif(payload->>'customerId', '')::uuid, quote_row."CusQuoteHeader_CustomerID");
  job_status := case when customer_id is null then 'draft' else 'open' end;

  insert into public."Job_Header" (
    "Job_Period", "Job_CreatedBy", "Job_Customer", "Job_Carrier", "Job_Supplier",
    "Job_OfficeID", "Job_OrgOfficeID", "Job_Status", "Job_Direction", "Job_TransportModeSummary",
    "Job_OriginNameSnapshot", "Job_DestinationNameSnapshot", "Job_ReadyDate", "Job_RequiredDeliveryDate",
    "Job_TrackingStatus", "Job_CurrentLocationNameSnapshot", "Job_InternalNotes", "Job_UpdatedBy",
    "Job_BookingReference", "Job_SourceQuoteID", "Job_SourceQuoteVersionID", "Job_SourceQuoteResponseID",
    "Job_IncotermsCode", "Job_IncotermsLocation", "Job_CollectionAddress", "Job_DeliveryAddress",
    "Job_CustomerDeadline", "Job_SourceSnapshotJSON"
  ) values (
    to_char(current_date, 'YYYYMM'), actor_user_id,
    customer_id,
    coalesce(nullif(payload->>'carrierId', '')::uuid, quote_row."CusQuoteHeader_CarrierID"),
    coalesce(nullif(payload->>'supplierId', '')::uuid, quote_row."CusQuoteHeader_SupplierID"),
    office_id, office_id, job_status, direction_code, mode_code,
    coalesce(nullif(payload->>'loadingPoint', ''), quote_row."CusQuoteHeader_LoadingPoint"),
    coalesce(nullif(payload->>'dischargePoint', ''), quote_row."CusQuoteHeader_DischargePoint"),
    nullif(payload->>'validFrom', '')::date,
    nullif(payload->>'deadline', '')::date,
    'planning', 'Planning', nullif(payload->>'internalNotes', ''), actor_user_id,
    booking_reference, requested_quote_id, version_row."CusQuoteVersion_ID", requested_response_id,
    upper(nullif(payload->>'incoterm', '')), nullif(facts->>'namedPlace', ''),
    nullif(payload->>'collectionAddress', ''), nullif(payload->>'deliveryAddress', ''),
    nullif(payload->>'deadline', '')::date,
    jsonb_strip_nulls(jsonb_build_object(
      'source', 'accepted_quote',
      'quoteId', requested_quote_id,
      'quoteVersionId', version_row."CusQuoteVersion_ID",
      'quoteReference', coalesce(quote_row."CusQuoteHeader_CustomerReference", 'Q-' || quote_row."CusQuoteHeader_Number"),
      'customerName', coalesce(nullif(payload->>'customerName', ''), quote_row."CusQuoteHeader_CustomerNameSnapshot"),
      'contactName', coalesce(nullif(payload->>'contactName', ''), quote_row."CusQuoteHeader_ContactNameSnapshot"),
      'contactEmail', coalesce(nullif(payload->>'contactEmail', ''), quote_row."CusQuoteHeader_ContactEmailSnapshot"),
      'requiresCustomerLink', customer_id is null,
      'acceptedSnapshot', version_row."CusQuoteVersion_SnapshotJSON"
    ))
  ) returning "Job_ID" into job_id;

  party := payload->'shipper';
  if quote_api.jsonb_has_content(party) then
    insert into public."Job_Parties" (
      "JobParty_JobID", "JobParty_Role", "JobParty_OrgID", "JobParty_Sequence",
      "JobParty_NameSnapshot", "JobParty_AddressSnapshot", "JobParty_ContactNameSnapshot",
      "JobParty_IsPrimary", "JobParty_RawSnapshot", "JobParty_CreatedBy"
    ) values (
      job_id, 'shipper', nullif(party->>'orgId', '')::uuid, 1,
      left(nullif(btrim(party->>'name'), ''), 240), nullif(btrim(party->>'address'), ''),
      left(nullif(btrim(party->>'contact'), ''), 180), true, party, actor_user_id
    );
  end if;
  party := payload->'consignee';
  if quote_api.jsonb_has_content(party) then
    insert into public."Job_Parties" (
      "JobParty_JobID", "JobParty_Role", "JobParty_OrgID", "JobParty_Sequence",
      "JobParty_NameSnapshot", "JobParty_AddressSnapshot", "JobParty_ContactNameSnapshot",
      "JobParty_IsPrimary", "JobParty_RawSnapshot", "JobParty_CreatedBy"
    ) values (
      job_id, 'consignee', nullif(party->>'orgId', '')::uuid, 1,
      left(nullif(btrim(party->>'name'), ''), 240), nullif(btrim(party->>'address'), ''),
      left(nullif(btrim(party->>'contact'), ''), 180), true, party, actor_user_id
    );
  end if;

  insert into public."Job_Routing" (
    "Job_ID", "JobRoute_OrderNo", "JobRoute_Status", "JobRoute_ModeCode",
    "JobRoute_OriginNameSnapshot", "JobRoute_OriginAddressSnapshot",
    "JobRoute_DestinationNameSnapshot", "JobRoute_DestinationAddressSnapshot",
    "JobRoute_Carrier", "JobRoute_ServiceLevel", "JobRoute_IsMainCarriage",
    "JobRoute_RouteJSON", "JobRoute_UpdatedBy"
  ) values (
    job_id, 1, 'planned', mode_code,
    coalesce(nullif(payload->>'loadingPoint', ''), quote_row."CusQuoteHeader_LoadingPoint"),
    nullif(payload->>'collectionAddress', ''),
    coalesce(nullif(payload->>'dischargePoint', ''), quote_row."CusQuoteHeader_DischargePoint"),
    nullif(payload->>'deliveryAddress', ''),
    coalesce(nullif(payload->>'carrierId', '')::uuid, quote_row."CusQuoteHeader_CarrierID"),
    nullif(payload->>'serviceLevel', ''), true,
    jsonb_build_object('source', 'accepted_quote', 'shipmentFacts', facts), actor_user_id
  );

  if nullif(btrim(coalesce(facts->>'knownCargo', facts->>'commodity')), '') is not null then
    insert into public."Job_Cargo" (
      "JobCargo_JobID", "JobCargo_LineNo", "JobCargo_Description", "JobCargo_Qty",
      "JobCargo_PackageTypeCodeSnapshot", "JobCargo_PackageQty", "JobCargo_GrossKilos",
      "JobCargo_NettKilos", "JobCargo_HSCode", "JobCargo_VolumeCBM",
      "JobCargo_DeclaredValueAmount", "JobCargo_DeclaredValueCurrencyCodeSnapshot",
      "JobCargo_CargoJSON", "JobCargo_UpdatedBy"
    ) values (
      job_id, 1, coalesce(facts->>'knownCargo', facts->>'commodity'),
      nullif(coalesce(facts->>'pieces', facts->>'packageQuantity'), '')::numeric,
      left(nullif(facts->>'packageType', ''), 40),
      nullif(coalesce(facts->>'packageQuantity', facts->>'pieces'), '')::numeric,
      nullif(facts->>'grossWeightKg', '')::numeric,
      nullif(facts->>'netWeightKg', '')::numeric,
      left(nullif(facts->>'hsCode', ''), 30),
      nullif(facts->>'volumeCbm', '')::numeric,
      nullif(regexp_replace(coalesce(facts->>'goodsValue', ''), '[^0-9.-]', '', 'g'), '')::numeric,
      coalesce(nullif(upper(facts->>'goodsValueCurrency'), ''), nullif(upper(payload->>'currency'), '')),
      facts, actor_user_id
    );
  end if;

  if nullif(btrim(facts->>'container'), '') is not null then
    insert into public."Job_Containers" (
      "Job_ID", "JobContainer_TypeCodeSnapshot", "JobContainer_EquipmentKind",
      "JobContainer_Status", "JobContainer_JSON", "JobContainer_UpdatedBy"
    ) values (
      job_id, left(facts->>'container', 40),
      case when lower(coalesce(payload->>'mode', '')) in ('air','courier') then 'unit_load_device' else 'container' end,
      'planned', jsonb_build_object('description', facts->>'container', 'source', 'accepted_quote'), actor_user_id
    );
  end if;

  for charge in select value from jsonb_array_elements(coalesce(payload->'charges', '[]'::jsonb)) loop
    charge_number := charge_number + 1;
    insert into public."Job_Costing_Lines" (
      "Job_ID", "JobCostingLine_Number", "JobCostingLine_SupplierID",
      "JobCostingLine_Description", "JobCostingLine_InternalNotes", "JobCostingLine_CustomerNotes",
      "JobCostingLine_CostROE", "JobCostingLine_CostAmountCurrency", "JobCostingLine_CostAmountLocal",
      "JobCostingLine_RevenueROE", "JobCostingLine_RevenueAmountCurrency", "JobCostingLine_RevenueAmountLocal",
      "JobCostingLine_ShowToCustomer", "JobCostingLine_CreatedBy", "JobCostingLine_UpdatedBy"
    ) values (
      job_id, charge_number, nullif(charge->>'supplierId', '')::uuid,
      left(coalesce(nullif(btrim(charge->>'description'), ''), 'Charge'), 240),
      nullif(charge->>'internalNotes', ''), nullif(charge->>'customerNotes', ''),
      greatest(coalesce(nullif(charge->>'costRoe', '')::numeric, 1), 0.00001),
      coalesce(nullif(charge->>'costAmount', '')::numeric, 0),
      coalesce(nullif(charge->>'costLocal', '')::numeric, 0),
      greatest(coalesce(nullif(charge->>'sellRoe', '')::numeric, 1), 0.00001),
      coalesce(nullif(charge->>'sellAmount', '')::numeric, 0),
      coalesce(nullif(charge->>'sellLocal', '')::numeric, 0),
      coalesce((charge->>'showToCustomer')::boolean, true), actor_user_id, actor_user_id
    );
  end loop;

  update public."CusQuote_Header"
  set "CusQuoteHeader_JobID" = job_id,
      "CusQuoteHeader_LastEditedDate" = now()
  where "CusQuoteHeader_ID" = requested_quote_id;

  insert into booking_api.events (
    company_id, job_id, event_type, summary, metadata, actor_user_id
  ) values (
    company_id, job_id, 'created_from_quote',
    case when customer_id is null
      then 'Draft booking created from accepted one-off quote; link a customer before progressing.'
      else 'Booking created from accepted quote.'
    end,
    jsonb_build_object(
      'quoteId', requested_quote_id,
      'quoteVersionId', version_row."CusQuoteVersion_ID",
      'status', job_status,
      'requiresCustomerLink', customer_id is null
    ),
    actor_user_id
  );

  return jsonb_build_object(
    'jobId', job_id,
    'bookingReference', booking_reference,
    'status', job_status,
    'requiresCustomerLink', customer_id is null,
    'reused', false
  );
exception
  when unique_violation then
    select job.* into existing_job
    from public."Job_Header" job
    where job."Job_SourceQuoteID" = requested_quote_id
      and not job."Job_IsDeleted"
    limit 1;
    if found then
      return jsonb_build_object(
        'jobId', existing_job."Job_ID",
        'bookingReference', existing_job."Job_BookingReference",
        'status', existing_job."Job_Status",
        'requiresCustomerLink', existing_job."Job_Customer" is null,
        'reused', true
      );
    end if;
    raise;
end;
$$;

revoke all on function booking_api.convert_accepted_quote(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function booking_api.convert_accepted_quote(uuid,uuid,uuid) to service_role;

commit;
