-- Approval-safe create/edit parity for connected operational records.
-- Edge-owned warehouse mutations remain fail-closed in Postgres and are
-- delegated by agent-dexter with the signed-in user's JWT.

begin;

create or replace function public.multideck_dexter_domain_warehouse_reference(
  p_company_id uuid,
  p_search text,
  p_take integer
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
with parameters as (
  select nullif(btrim(p_search), '') search, greatest(1, least(coalesce(p_take, 10), 25)) take
), company_facilities as (
  select facility.*, office."Company_ID"
  from public."WMS_Facilities" facility
  join public."cmp_Offices" office
    on office."Office_ID" = facility."WMSFacility_OrgOfficeID"
   and office."Company_ID" = p_company_id
  where not facility."WMSFacility_IsDeleted"
), facilities as (
  select jsonb_build_object(
    'recordId', facility."WMSFacility_ID", 'recordType', 'facility',
    'code', facility."WMSFacility_Code", 'name', facility."WMSFacility_Name",
    'typeCode', facility."WMSFacility_TypeCode", 'officeId', facility."WMSFacility_OrgOfficeID",
    'unlocode', facility."WMSFacility_UNLOCODE", 'address1', facility."WMSFacility_Address1",
    'address2', facility."WMSFacility_Address2", 'townCity', facility."WMSFacility_TownCity",
    'countyState', facility."WMSFacility_CountyState", 'postZipCode', facility."WMSFacility_PostZipCode",
    'countryCode', facility."WMSFacility_CountryCode", 'timeZone', facility."WMSFacility_TimeZone",
    'isBonded', facility."WMSFacility_IsBonded",
    'defaultCustomsStatusCode', facility."WMSFacility_DefaultCustomsStatusCode",
    'isActive', facility."WMSFacility_IsActive"
  ) value
  from company_facilities facility, parameters p
  where p.search is null or concat_ws(' ', facility."WMSFacility_Code", facility."WMSFacility_Name",
    facility."WMSFacility_UNLOCODE", facility."WMSFacility_TownCity", facility."WMSFacility_CountryCode") ilike '%' || p.search || '%'
  order by facility."WMSFacility_Name"
  limit (select take from parameters)
), locations as (
  select jsonb_build_object(
    'recordId', location."WMSLocation_ID", 'recordType', 'location',
    'facilityId', location."WMSLocation_FacilityID", 'facilityCode', facility."WMSFacility_Code",
    'code', location."WMSLocation_Code", 'barcode', location."WMSLocation_Barcode",
    'typeCode', location."WMSLocation_TypeCode", 'statusCode', location."WMSLocation_StatusCode",
    'zoneTypeCode', zone."WMSZone_TypeCode", 'aisle', location."WMSLocation_Aisle",
    'bay', location."WMSLocation_Bay", 'level', location."WMSLocation_Level",
    'position', location."WMSLocation_Position", 'lengthM', location."WMSLocation_LengthM",
    'widthM', location."WMSLocation_WidthM", 'heightM', location."WMSLocation_HeightM",
    'maxWeightKg', location."WMSLocation_MaxWeightKG", 'maxVolumeCbm', location."WMSLocation_MaxVolumeCBM",
    'temperatureMinC', location."WMSLocation_TemperatureMinC", 'temperatureMaxC', location."WMSLocation_TemperatureMaxC",
    'allowsMultiSku', location."WMSLocation_AllowsMultiSKU",
    'allowsBondedStock', location."WMSLocation_AllowsBondedStock", 'isActive', location."WMSLocation_IsActive"
  ) value
  from public."WMS_Locations" location
  join company_facilities facility on facility."WMSFacility_ID" = location."WMSLocation_FacilityID"
  left join public."WMS_Zones" zone on zone."WMSZone_ID" = location."WMSLocation_ZoneID"
  cross join parameters p
  where not location."WMSLocation_IsDeleted"
    and (p.search is null or concat_ws(' ', location."WMSLocation_Code", location."WMSLocation_Barcode",
      facility."WMSFacility_Code", zone."WMSZone_Name") ilike '%' || p.search || '%')
  order by facility."WMSFacility_Code", location."WMSLocation_Code"
  limit (select take from parameters)
), items as (
  select jsonb_build_object(
    'recordId', item."WMSItem_ID", 'recordType', 'item',
    'customerOrgId', item."WMSItem_CustomerOrgID", 'facilityId', item."WMSItem_DefaultFacilityID",
    'sku', item."WMSItem_SKU", 'description', item."WMSItem_Description",
    'commodityDescription', item."WMSItem_CommodityDescription", 'hsCode', item."WMSItem_HSCode",
    'countryOfOriginCode', item."WMSItem_CountryOfOriginCode",
    'baseUomCode', item."WMSItem_BaseUOMCode", 'quantityBasisCode', item."WMSItem_QuantityBasisCode",
    'quantityScale', item."WMSItem_QuantityScale", 'minimumMovementQuantity', item."WMSItem_MinimumMovementQuantity",
    'allowsFractionalQuantity', item."WMSItem_AllowsFractionalQuantity",
    'lengthM', item."WMSItem_LengthM", 'widthM', item."WMSItem_WidthM", 'heightM', item."WMSItem_HeightM",
    'netWeightKg', item."WMSItem_NetWeightKG", 'grossWeightKg', item."WMSItem_GrossWeightKG",
    'isDangerousGoods', item."WMSItem_IsDangerousGoods", 'isExciseGoods', item."WMSItem_IsExciseGoods",
    'isHighValue', item."WMSItem_IsHighValue", 'isBondedEligible', item."WMSItem_IsBondedEligible",
    'requiresLot', item."WMSItem_RequiresLot", 'requiresSerial', item."WMSItem_RequiresSerial",
    'requiresExpiry', item."WMSItem_RequiresExpiry", 'temperatureMinC', item."WMSItem_TemperatureMinC",
    'temperatureMaxC', item."WMSItem_TemperatureMaxC", 'isActive', item."WMSItem_IsActive",
    'uoms', coalesce((select jsonb_agg(jsonb_build_object(
      'code', uom."WMSItemUOM_UOMCode", 'quantityInBaseUom', uom."WMSItemUOM_QuantityInBaseUOM",
      'grossWeightKg', uom."WMSItemUOM_GrossWeightKG", 'purchasing', uom."WMSItemUOM_IsPurchasingUOM",
      'stocking', uom."WMSItemUOM_IsStockingUOM", 'selling', uom."WMSItemUOM_IsSellingUOM"
    ) order by uom."WMSItemUOM_UOMCode") from public."WMS_ItemUOMs" uom where uom."WMSItemUOM_ItemID" = item."WMSItem_ID"), '[]'::jsonb)
  ) value
  from public."WMS_Items" item
  join company_facilities facility on facility."WMSFacility_ID" = item."WMSItem_DefaultFacilityID"
  cross join parameters p
  where not item."WMSItem_IsDeleted"
    and (p.search is null or concat_ws(' ', item."WMSItem_SKU", item."WMSItem_Description",
      item."WMSItem_CommodityDescription", item."WMSItem_HSCode") ilike '%' || p.search || '%')
  order by item."WMSItem_SKU"
  limit (select take from parameters)
), offices as (
  select jsonb_build_object('recordId', office."Office_ID", 'name', office."Office_Name", 'address', office."Office_Address") value
  from public."cmp_Offices" office where office."Company_ID" = p_company_id order by office."Office_Name"
)
select case when public._multideck_dexter_can_manage(
  (select user_row."User_ID" from public."cmp_Users" user_row
   where user_row."Auth_User_ID" = auth.uid() and user_row."Company_ID" = p_company_id limit 1)
) then jsonb_build_object(
  'facilities', coalesce((select jsonb_agg(value) from facilities), '[]'::jsonb),
  'locations', coalesce((select jsonb_agg(value) from locations), '[]'::jsonb),
  'items', coalesce((select jsonb_agg(value) from items), '[]'::jsonb),
  'offices', coalesce((select jsonb_agg(value) from offices), '[]'::jsonb)
) else jsonb_build_object('facilities','[]'::jsonb,'locations','[]'::jsonb,'items','[]'::jsonb,'offices','[]'::jsonb) end;
$$;

revoke all on function public.multideck_dexter_domain_warehouse_reference(uuid, text, integer) from public, anon, authenticated;

insert into public."sys_AIDexterDataDomains" (
  "AIDexterDomain_Code", "AIDexterDomain_Name", "AIDexterDomain_Description",
  "AIDexterDomain_QueryFunction", "AIDexterDomain_SortOrder", "AIDexterDomain_IsActive", "AIDexterDomain_UpdatedAt"
) values (
  'warehouse_reference', 'Warehouse setup',
  'Warehouse facilities, offices, locations and item master data used to resolve exact IDs before a create or edit action.',
  'multideck_dexter_domain_warehouse_reference', 16, true, now()
)
on conflict ("AIDexterDomain_Code") do update set
  "AIDexterDomain_Name" = excluded."AIDexterDomain_Name",
  "AIDexterDomain_Description" = excluded."AIDexterDomain_Description",
  "AIDexterDomain_QueryFunction" = excluded."AIDexterDomain_QueryFunction",
  "AIDexterDomain_SortOrder" = excluded."AIDexterDomain_SortOrder",
  "AIDexterDomain_IsActive" = true,
  "AIDexterDomain_UpdatedAt" = now();

-- These functions are registry sentinels. The authenticated Edge runtime owns
-- the actual warehouse mutation and will never fall back to direct table writes.
create or replace function public._multideck_dexter_edge_action_only()
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  raise exception 'This action must be completed through its authenticated product runtime.' using errcode = '42501';
end;
$$;
revoke all on function public._multideck_dexter_edge_action_only() from public, anon, authenticated;

create or replace function public.multideck_dexter_action_create_warehouse_facility(uuid, uuid, jsonb)
returns jsonb language sql security definer set search_path = pg_catalog, public as $$ select public._multideck_dexter_edge_action_only() $$;
create or replace function public.multideck_dexter_action_update_warehouse_facility(uuid, uuid, jsonb)
returns jsonb language sql security definer set search_path = pg_catalog, public as $$ select public._multideck_dexter_edge_action_only() $$;
create or replace function public.multideck_dexter_action_create_warehouse_location(uuid, uuid, jsonb)
returns jsonb language sql security definer set search_path = pg_catalog, public as $$ select public._multideck_dexter_edge_action_only() $$;
create or replace function public.multideck_dexter_action_update_warehouse_location(uuid, uuid, jsonb)
returns jsonb language sql security definer set search_path = pg_catalog, public as $$ select public._multideck_dexter_edge_action_only() $$;
create or replace function public.multideck_dexter_action_create_warehouse_item(uuid, uuid, jsonb)
returns jsonb language sql security definer set search_path = pg_catalog, public as $$ select public._multideck_dexter_edge_action_only() $$;
create or replace function public.multideck_dexter_action_update_warehouse_item(uuid, uuid, jsonb)
returns jsonb language sql security definer set search_path = pg_catalog, public as $$ select public._multideck_dexter_edge_action_only() $$;
create or replace function public.multideck_dexter_action_create_warehouse_order(uuid, uuid, jsonb)
returns jsonb language sql security definer set search_path = pg_catalog, public as $$ select public._multideck_dexter_edge_action_only() $$;
create or replace function public.multideck_dexter_action_reschedule_warehouse_order(uuid, uuid, jsonb)
returns jsonb language sql security definer set search_path = pg_catalog, public as $$ select public._multideck_dexter_edge_action_only() $$;
create or replace function public.multideck_dexter_action_create_warehouse_handling_unit(uuid, uuid, jsonb)
returns jsonb language sql security definer set search_path = pg_catalog, public as $$ select public._multideck_dexter_edge_action_only() $$;
create or replace function public.multideck_dexter_action_report_warehouse_location_empty(uuid, uuid, jsonb)
returns jsonb language sql security definer set search_path = pg_catalog, public as $$ select public._multideck_dexter_edge_action_only() $$;

do $$
declare function_name text;
begin
  foreach function_name in array array[
    'multideck_dexter_action_create_warehouse_facility','multideck_dexter_action_update_warehouse_facility',
    'multideck_dexter_action_create_warehouse_location','multideck_dexter_action_update_warehouse_location',
    'multideck_dexter_action_create_warehouse_item','multideck_dexter_action_update_warehouse_item',
    'multideck_dexter_action_create_warehouse_order','multideck_dexter_action_reschedule_warehouse_order',
    'multideck_dexter_action_create_warehouse_handling_unit','multideck_dexter_action_report_warehouse_location_empty'
  ] loop
    execute format('revoke all on function public.%I(uuid, uuid, jsonb) from public, anon, authenticated', function_name);
  end loop;
end $$;

create or replace function public.multideck_dexter_action_create_booking(
  p_company_id uuid, p_user_id uuid, p_arguments jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_job_id uuid := gen_random_uuid();
  v_job_number integer;
  v_office_id uuid;
  v_customer_id uuid;
  v_carrier_id uuid;
begin
  v_customer_id := nullif(p_arguments->>'customer_id','')::uuid;
  v_carrier_id := nullif(p_arguments->>'carrier_id','')::uuid;
  v_office_id := nullif(p_arguments->>'office_id','')::uuid;
  if v_customer_id is null then raise exception 'Choose the exact customer before creating a booking.' using errcode='22023'; end if;
  if v_office_id is null then
    select office."Office_ID" into v_office_id from public."cmp_Offices" office
    where office."Company_ID" = p_company_id order by office."Office_ID" limit 1;
  end if;
  if not exists (select 1 from public."cmp_Offices" office where office."Office_ID"=v_office_id and office."Company_ID"=p_company_id) then
    raise exception 'Choose an office in this workspace.' using errcode='42501';
  end if;
  if not exists (
    select 1 from public."Org_Master" customer where customer."Org_id"=v_customer_id and (
      customer."Org_CRMIsPotentialCustomer" or exists (
        select 1 from public."Org_Master_Type" link join public."Org_Types" kind on kind."OrgType_ID"=link."OrgType_ID"
        where link."Org_ID"=customer."Org_id" and lower(kind."OrgType_Name")='customer'
      )
    )
  ) then raise exception 'Choose a customer available in this workspace.' using errcode='42501'; end if;
  if v_carrier_id is not null and not exists (select 1 from public."Org_Master" carrier where carrier."Org_id"=v_carrier_id) then
    raise exception 'Choose a valid carrier.' using errcode='22023';
  end if;
  insert into public."Job_Header" (
    "Job_ID","Job_Period","Job_CreatedBy","Job_Customer","Job_Carrier","Job_OfficeID","Job_OrgOfficeID",
    "Job_Status","Job_Direction","Job_TransportModeSummary","Job_OriginUNLocode","Job_OriginNameSnapshot",
    "Job_DestinationUNLocode","Job_DestinationNameSnapshot","Job_ReadyDate","Job_RequiredDeliveryDate",
    "Job_TrackingStatus","Job_CurrentLocationNameSnapshot","Job_PredictedDeliveryAt","Job_InternalNotes","Job_UpdatedBy"
  ) values (
    v_job_id,to_char(current_date,'YYYYMM'),p_user_id,v_customer_id,v_carrier_id,v_office_id,v_office_id,
    coalesce(nullif(btrim(p_arguments->>'status'),''),'open'),nullif(btrim(p_arguments->>'direction'),''),
    lower(nullif(btrim(p_arguments->>'mode'),'')),upper(nullif(btrim(p_arguments->>'origin_unlocode'),'')),
    nullif(btrim(p_arguments->>'origin_name'),''),upper(nullif(btrim(p_arguments->>'destination_unlocode'),'')),
    nullif(btrim(p_arguments->>'destination_name'),''),nullif(p_arguments->>'ready_date','')::date,
    nullif(p_arguments->>'required_delivery_date','')::date,coalesce(nullif(btrim(p_arguments->>'tracking_status'),''),'planning'),
    coalesce(nullif(btrim(p_arguments->>'current_location'),''),'Planning'),nullif(p_arguments->>'predicted_delivery_at','')::timestamptz,
    nullif(btrim(p_arguments->>'internal_notes'),''),p_user_id
  ) returning "Job_Number" into v_job_number;
  if nullif(btrim(p_arguments->>'origin_name'),'') is not null or nullif(btrim(p_arguments->>'destination_name'),'') is not null then
    insert into public."Job_Routing" (
      "Job_ID","JobRoute_OrderNo","JobRoute_Status","JobRoute_ModeCode","JobRoute_OriginUNLocode","JobRoute_OriginNameSnapshot",
      "JobRoute_DestinationUNLocode","JobRoute_DestinationNameSnapshot","JobRoute_PlannedDepartureAt","JobRoute_PlannedArrivalAt",
      "JobRoute_Carrier","JobRoute_TransportMeansName","JobRoute_IsMainCarriage","JobRoute_UpdatedBy"
    ) values (
      v_job_id,1,'planned',lower(nullif(btrim(p_arguments->>'mode'),'')),upper(nullif(btrim(p_arguments->>'origin_unlocode'),'')),
      nullif(btrim(p_arguments->>'origin_name'),''),upper(nullif(btrim(p_arguments->>'destination_unlocode'),'')),
      nullif(btrim(p_arguments->>'destination_name'),''),nullif(p_arguments->>'departure_at','')::timestamptz,
      nullif(p_arguments->>'arrival_at','')::timestamptz,v_carrier_id,nullif(btrim(p_arguments->>'transport_reference'),''),true,p_user_id
    );
  end if;
  if nullif(btrim(p_arguments->>'cargo_description'),'') is not null then
    insert into public."Job_Cargo" ("JobCargo_JobID","JobCargo_LineNo","JobCargo_Description","JobCargo_Qty","JobCargo_PackageQty","JobCargo_GrossKilos","JobCargo_UpdatedBy")
    values (v_job_id,1,btrim(p_arguments->>'cargo_description'),nullif(p_arguments->>'package_quantity','')::numeric,
      nullif(p_arguments->>'package_quantity','')::numeric,nullif(p_arguments->>'gross_weight_kg','')::numeric,p_user_id);
  end if;
  return jsonb_build_object('recordId',v_job_id,'bookingReference','MD-'||v_job_number,'jobReference','JOB-'||v_job_number);
end;
$$;

create or replace function public.multideck_dexter_action_update_booking(
  p_company_id uuid, p_user_id uuid, p_arguments jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_job public."Job_Header";
  v_target_id uuid := nullif(p_arguments->>'target_id','')::uuid;
  v_route_id uuid;
  v_cargo_id uuid;
begin
  select job.* into v_job from public."Job_Header" job
  join public."cmp_Offices" office on office."Office_ID"=coalesce(job."Job_OrgOfficeID",job."Job_OfficeID")
  where job."Job_ID"=v_target_id and office."Company_ID"=p_company_id and not job."Job_IsDeleted" for update;
  if not found then raise exception 'That booking is outside this workspace or no longer exists.' using errcode='P0002'; end if;
  update public."Job_Header" job set
    "Job_Status"=coalesce(nullif(btrim(p_arguments->>'status'),''),job."Job_Status"),
    "Job_Direction"=coalesce(nullif(btrim(p_arguments->>'direction'),''),job."Job_Direction"),
    "Job_TransportModeSummary"=coalesce(lower(nullif(btrim(p_arguments->>'mode'),'')),job."Job_TransportModeSummary"),
    "Job_OriginUNLocode"=coalesce(upper(nullif(btrim(p_arguments->>'origin_unlocode'),'')),job."Job_OriginUNLocode"),
    "Job_OriginNameSnapshot"=coalesce(nullif(btrim(p_arguments->>'origin_name'),''),job."Job_OriginNameSnapshot"),
    "Job_DestinationUNLocode"=coalesce(upper(nullif(btrim(p_arguments->>'destination_unlocode'),'')),job."Job_DestinationUNLocode"),
    "Job_DestinationNameSnapshot"=coalesce(nullif(btrim(p_arguments->>'destination_name'),''),job."Job_DestinationNameSnapshot"),
    "Job_ReadyDate"=coalesce(nullif(p_arguments->>'ready_date','')::date,job."Job_ReadyDate"),
    "Job_RequiredDeliveryDate"=coalesce(nullif(p_arguments->>'required_delivery_date','')::date,job."Job_RequiredDeliveryDate"),
    "Job_TrackingStatus"=coalesce(nullif(btrim(p_arguments->>'tracking_status'),''),job."Job_TrackingStatus"),
    "Job_CurrentLocationNameSnapshot"=coalesce(nullif(btrim(p_arguments->>'current_location'),''),job."Job_CurrentLocationNameSnapshot"),
    "Job_PredictedDeliveryAt"=coalesce(nullif(p_arguments->>'predicted_delivery_at','')::timestamptz,job."Job_PredictedDeliveryAt"),
    "Job_InternalNotes"=coalesce(p_arguments->>'internal_notes',job."Job_InternalNotes"),
    "Job_UpdatedAt"=now(),"Job_UpdatedBy"=p_user_id
  where job."Job_ID"=v_target_id;
  select route."JobRoute_ID" into v_route_id from public."Job_Routing" route where route."Job_ID"=v_target_id order by route."JobRoute_OrderNo" nulls last limit 1;
  if v_route_id is not null then
    update public."Job_Routing" route set
      "JobRoute_ModeCode"=coalesce(lower(nullif(btrim(p_arguments->>'mode'),'')),route."JobRoute_ModeCode"),
      "JobRoute_OriginUNLocode"=coalesce(upper(nullif(btrim(p_arguments->>'origin_unlocode'),'')),route."JobRoute_OriginUNLocode"),
      "JobRoute_OriginNameSnapshot"=coalesce(nullif(btrim(p_arguments->>'origin_name'),''),route."JobRoute_OriginNameSnapshot"),
      "JobRoute_DestinationUNLocode"=coalesce(upper(nullif(btrim(p_arguments->>'destination_unlocode'),'')),route."JobRoute_DestinationUNLocode"),
      "JobRoute_DestinationNameSnapshot"=coalesce(nullif(btrim(p_arguments->>'destination_name'),''),route."JobRoute_DestinationNameSnapshot"),
      "JobRoute_PlannedDepartureAt"=coalesce(nullif(p_arguments->>'departure_at','')::timestamptz,route."JobRoute_PlannedDepartureAt"),
      "JobRoute_PlannedArrivalAt"=coalesce(nullif(p_arguments->>'arrival_at','')::timestamptz,route."JobRoute_PlannedArrivalAt"),
      "JobRoute_TransportMeansName"=coalesce(nullif(btrim(p_arguments->>'transport_reference'),''),route."JobRoute_TransportMeansName"),
      "JobRoute_UpdatedAt"=now(),"JobRoute_UpdatedBy"=p_user_id
    where route."JobRoute_ID"=v_route_id;
  end if;
  if nullif(btrim(p_arguments->>'cargo_description'),'') is not null then
    select cargo."JobCargo_ID" into v_cargo_id from public."Job_Cargo" cargo
    where cargo."JobCargo_JobID"=v_target_id and not cargo."JobCargo_IsDeleted" order by cargo."JobCargo_LineNo" nulls last limit 1;
    if v_cargo_id is null then
      insert into public."Job_Cargo" ("JobCargo_JobID","JobCargo_LineNo","JobCargo_Description","JobCargo_Qty","JobCargo_PackageQty","JobCargo_GrossKilos","JobCargo_UpdatedBy")
      values (v_target_id,1,btrim(p_arguments->>'cargo_description'),nullif(p_arguments->>'package_quantity','')::numeric,
        nullif(p_arguments->>'package_quantity','')::numeric,nullif(p_arguments->>'gross_weight_kg','')::numeric,p_user_id);
    else
      update public."Job_Cargo" cargo set "JobCargo_Description"=btrim(p_arguments->>'cargo_description'),
        "JobCargo_Qty"=coalesce(nullif(p_arguments->>'package_quantity','')::numeric,cargo."JobCargo_Qty"),
        "JobCargo_PackageQty"=coalesce(nullif(p_arguments->>'package_quantity','')::numeric,cargo."JobCargo_PackageQty"),
        "JobCargo_GrossKilos"=coalesce(nullif(p_arguments->>'gross_weight_kg','')::numeric,cargo."JobCargo_GrossKilos"),
        "JobCargo_UpdatedAt"=now(),"JobCargo_UpdatedBy"=p_user_id where cargo."JobCargo_ID"=v_cargo_id;
    end if;
  end if;
  return jsonb_build_object('recordId',v_target_id,'bookingReference','MD-'||v_job."Job_Number",'updatedAt',now());
end;
$$;

create or replace function public._multideck_dexter_customs_patch(p_arguments jsonb)
returns jsonb language sql immutable set search_path = pg_catalog as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'declarationCategory',p_arguments->'declaration_category','declarationType',p_arguments->'declaration_type',
    'traderReference',p_arguments->'trader_reference','internalReference',p_arguments->'internal_reference',
    'totalAmount',p_arguments->'total_amount','currency',p_arguments->'currency','totalPackages',p_arguments->'total_packages',
    'totalGrossMass',p_arguments->'total_gross_mass','totalNetMass',p_arguments->'total_net_mass',
    'exporter',p_arguments->'exporter','consignee',p_arguments->'consignee','carrier',p_arguments->'carrier',
    'declarant',p_arguments->'declarant','representative',p_arguments->'representative',
    'exportCountry',p_arguments->'export_country','destinationCountry',p_arguments->'destination_country',
    'borderMode',p_arguments->'border_mode','exitOffice',p_arguments->'exit_office',
    'previousDocumentCategory',p_arguments->'previous_document_category','previousDocumentType',p_arguments->'previous_document_type',
    'previousDocumentReference',p_arguments->'previous_document_reference','isContainerised',p_arguments->'is_containerised',
    'containerId',p_arguments->'container_id','items',p_arguments->'items'
  ));
$$;

create or replace function public.multideck_dexter_action_create_customs_declaration(
  p_company_id uuid, p_user_id uuid, p_arguments jsonb
)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, auth as $$
declare v_saved record;
begin
  if not exists (select 1 from public."cmp_Users" user_row where user_row."User_ID"=p_user_id and user_row."Company_ID"=p_company_id and user_row."Auth_User_ID"=auth.uid()) then
    raise exception 'Your signed-in account is not linked to this workspace.' using errcode='42501';
  end if;
  select * into v_saved from public.save_customs_export_draft(null, public._multideck_dexter_customs_patch(p_arguments));
  return jsonb_build_object('recordId',v_saved.declaration_id,'reference',v_saved.local_reference_number,'updatedAt',v_saved.updated_at);
end;
$$;

create or replace function public.multideck_dexter_action_update_customs_declaration(
  p_company_id uuid, p_user_id uuid, p_arguments jsonb
)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, auth as $$
declare v_target_id uuid := nullif(p_arguments->>'target_id','')::uuid; v_current jsonb; v_icustoms_external_id text; v_saved record;
begin
  select declaration."CUST_GenericPayloadJSON", declaration."CUST_iCustomsExternalID" into v_current, v_icustoms_external_id from public."Customs_Declarations" declaration
  join public."cmp_Users" user_row on user_row."Auth_User_ID"=declaration."CUST_CreatedBy" and user_row."Company_ID"=p_company_id
  where declaration."CUST_id"=v_target_id and declaration."CUST_CreatedBy"=auth.uid()
    and declaration."CUST_Status"='draft' and not declaration."CUST_IsDeleted";
  if not found then raise exception 'This Customs draft is unavailable or can no longer be edited.' using errcode='42501'; end if;
  if nullif(btrim(v_icustoms_external_id),'') is not null then
    raise exception 'This declaration already has an iCustoms draft. Edit and save it in the Customs workspace so every field and goods item stays synchronised.' using errcode='22023';
  end if;
  select * into v_saved from public.save_customs_export_draft(v_target_id, coalesce(v_current,'{}'::jsonb) || public._multideck_dexter_customs_patch(p_arguments));
  return jsonb_build_object('recordId',v_saved.declaration_id,'reference',v_saved.local_reference_number,'updatedAt',v_saved.updated_at);
end;
$$;

revoke all on function public.multideck_dexter_action_create_booking(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.multideck_dexter_action_update_booking(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public._multideck_dexter_customs_patch(jsonb) from public,anon,authenticated;
revoke all on function public.multideck_dexter_action_create_customs_declaration(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.multideck_dexter_action_update_customs_declaration(uuid,uuid,jsonb) from public,anon,authenticated;

create or replace function public.multideck_dexter_record_external_action(
  p_action text, p_arguments jsonb, p_access_mode text, p_result jsonb
)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, auth as $$
declare v_context record; v_code text:=lower(btrim(coalesce(p_action,''))); v_mode text:=lower(btrim(coalesce(p_access_mode,'')));
begin
  select * into v_context from public._multideck_dexter_context();
  if not public._multideck_dexter_can_manage(v_context.user_id) then raise exception 'You do not have permission to let Dexter change workspace data.' using errcode='42501'; end if;
  if v_mode not in ('approve','full') then raise exception 'Choose Approve or Full access before changing data.' using errcode='22023'; end if;
  if not exists (select 1 from public."sys_AIDexterActions" action where action."AIDexterAction_Code"=v_code and action."AIDexterAction_IsActive") then
    raise exception 'That Dexter action is not available in this workspace.' using errcode='22023';
  end if;
  insert into public."AI_DexterActionAudit" (
    "AIDexterAudit_CompanyID","AIDexterAudit_UserID","AIDexterAudit_ActionCode","AIDexterAudit_AccessMode","AIDexterAudit_ArgumentsJSON","AIDexterAudit_ResultJSON"
  ) values (v_context.company_id,v_context.user_id,v_code,v_mode,coalesce(p_arguments,'{}'::jsonb),coalesce(p_result,'{}'::jsonb));
  return jsonb_build_object('action',v_code,'recorded',true);
end;
$$;
revoke all on function public.multideck_dexter_record_external_action(text,jsonb,text,jsonb) from public,anon;
grant execute on function public.multideck_dexter_record_external_action(text,jsonb,text,jsonb) to authenticated;

-- Master-data signals are deterministic and reuse the existing warehouse watch
-- queue. No LLM is called unless a stored rule later matches the event.
create or replace function public._multideck_dexter_watch_warehouse_master_change()
returns trigger language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare v_company_id uuid; v_source_id uuid; v_old jsonb:='{}'::jsonb; v_new jsonb;
begin
  if tg_table_name='WMS_Facilities' then
    select office."Company_ID" into v_company_id from public."cmp_Offices" office where office."Office_ID"=new."WMSFacility_OrgOfficeID";
    v_source_id:=new."WMSFacility_ID"; if tg_op<>'INSERT' then v_old:=jsonb_build_object('code',old."WMSFacility_Code",'name',old."WMSFacility_Name",'isActive',old."WMSFacility_IsActive"); end if;
    v_new:=jsonb_build_object('recordType','facility','code',new."WMSFacility_Code",'name',new."WMSFacility_Name",'isActive',new."WMSFacility_IsActive");
  elsif tg_table_name='WMS_Locations' then
    select office."Company_ID" into v_company_id from public."WMS_Facilities" facility join public."cmp_Offices" office on office."Office_ID"=facility."WMSFacility_OrgOfficeID" where facility."WMSFacility_ID"=new."WMSLocation_FacilityID";
    v_source_id:=new."WMSLocation_ID"; if tg_op<>'INSERT' then v_old:=jsonb_build_object('code',old."WMSLocation_Code",'status',old."WMSLocation_StatusCode",'isActive',old."WMSLocation_IsActive"); end if;
    v_new:=jsonb_build_object('recordType','location','code',new."WMSLocation_Code",'status',new."WMSLocation_StatusCode",'isActive',new."WMSLocation_IsActive");
  else
    select office."Company_ID" into v_company_id from public."WMS_Facilities" facility join public."cmp_Offices" office on office."Office_ID"=facility."WMSFacility_OrgOfficeID" where facility."WMSFacility_ID"=new."WMSItem_DefaultFacilityID";
    v_source_id:=new."WMSItem_ID"; if tg_op<>'INSERT' then v_old:=jsonb_build_object('sku',old."WMSItem_SKU",'description',old."WMSItem_Description",'isActive',old."WMSItem_IsActive"); end if;
    v_new:=jsonb_build_object('recordType','item','sku',new."WMSItem_SKU",'description',new."WMSItem_Description",'isActive',new."WMSItem_IsActive");
  end if;
  if v_company_id is not null and exists (select 1 from public."AI_DexterWatches" watch where watch."AIDexterWatch_CompanyID"=v_company_id and watch."AIDexterWatch_CapabilityCode"='warehouse' and watch."AIDexterWatch_StatusCode"='active' and (watch."AIDexterWatch_TargetID" is null or watch."AIDexterWatch_TargetID"=v_source_id)) then
    insert into public."AI_DexterWatchSignals" ("AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode","AIDexterWatchSignal_SourceTable","AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON")
    values (v_company_id,'warehouse',tg_table_name,v_source_id,v_old,v_new);
  end if;
  return new;
end;
$$;
revoke all on function public._multideck_dexter_watch_warehouse_master_change() from public,anon,authenticated;
drop trigger if exists "TR_WMS_Facilities_dexter_watch" on public."WMS_Facilities";
create trigger "TR_WMS_Facilities_dexter_watch" after insert or update on public."WMS_Facilities" for each row execute function public._multideck_dexter_watch_warehouse_master_change();
drop trigger if exists "TR_WMS_Locations_dexter_watch" on public."WMS_Locations";
create trigger "TR_WMS_Locations_dexter_watch" after insert or update on public."WMS_Locations" for each row execute function public._multideck_dexter_watch_warehouse_master_change();
drop trigger if exists "TR_WMS_Items_dexter_watch" on public."WMS_Items";
create trigger "TR_WMS_Items_dexter_watch" after insert or update on public."WMS_Items" for each row execute function public._multideck_dexter_watch_warehouse_master_change();

update public."sys_AIDexterWatchCapabilities" set
  "AIDexterWatchCapability_Description"='Warehouse orders, inventory exceptions, facilities, locations and item master changes.',
  "AIDexterWatchCapability_FieldsJSON"='["status","priority","releaseGateStatus","requestedDate","customerReference","containerNumber","exceptionStatus","severity","title","recordType","code","name","description","isActive"]'::jsonb,
  "AIDexterWatchCapability_IsActive"=true
where "AIDexterWatchCapability_Code"='warehouse';

-- Strict action schemas. Nullable fields mean "leave unchanged" on edits.
insert into public."sys_AIDexterActions" (
  "AIDexterAction_Code","AIDexterAction_DomainCode","AIDexterAction_Name","AIDexterAction_Description",
  "AIDexterAction_Function","AIDexterAction_ParametersJSON","AIDexterAction_SortOrder","AIDexterAction_IsActive","AIDexterAction_UpdatedAt"
) values
('create_warehouse_facility','warehouse_reference','Create warehouse facility','Create a facility through the real Warehouse validation boundary.','multideck_dexter_action_create_warehouse_facility',
 '{"type":"object","properties":{"code":{"type":"string"},"name":{"type":"string"},"typeCode":{"type":"string"},"officeId":{"type":["string","null"]},"unlocode":{"type":["string","null"]},"address1":{"type":["string","null"]},"address2":{"type":["string","null"]},"townCity":{"type":["string","null"]},"countyState":{"type":["string","null"]},"postZipCode":{"type":["string","null"]},"countryCode":{"type":["string","null"]},"timeZone":{"type":["string","null"]},"isBonded":{"type":"boolean"},"defaultCustomsStatusCode":{"type":["string","null"]},"reason":{"type":"string"}},"required":["code","name","typeCode","officeId","unlocode","address1","address2","townCity","countyState","postZipCode","countryCode","timeZone","isBonded","defaultCustomsStatusCode","reason"],"additionalProperties":false}'::jsonb,101,true,now()),
('update_warehouse_facility','warehouse_reference','Edit warehouse facility','Edit an exact facility while preserving fields not included in the requested change.','multideck_dexter_action_update_warehouse_facility',
 '{"type":"object","properties":{"target_id":{"type":"string"},"code":{"type":["string","null"]},"name":{"type":["string","null"]},"typeCode":{"type":["string","null"]},"officeId":{"type":["string","null"]},"unlocode":{"type":["string","null"]},"address1":{"type":["string","null"]},"address2":{"type":["string","null"]},"townCity":{"type":["string","null"]},"countyState":{"type":["string","null"]},"postZipCode":{"type":["string","null"]},"countryCode":{"type":["string","null"]},"timeZone":{"type":["string","null"]},"isBonded":{"type":["boolean","null"]},"defaultCustomsStatusCode":{"type":["string","null"]},"isActive":{"type":["boolean","null"]},"reason":{"type":"string"}},"required":["target_id","code","name","typeCode","officeId","unlocode","address1","address2","townCity","countyState","postZipCode","countryCode","timeZone","isBonded","defaultCustomsStatusCode","isActive","reason"],"additionalProperties":false}'::jsonb,102,true,now()),
('create_warehouse_location','warehouse_reference','Create warehouse location','Create a location in an exact facility through Warehouse validation.','multideck_dexter_action_create_warehouse_location',
 '{"type":"object","properties":{"facilityId":{"type":"string"},"code":{"type":"string"},"typeCode":{"type":"string"},"statusCode":{"type":["string","null"]},"zoneTypeCode":{"type":["string","null"]},"barcode":{"type":["string","null"]},"aisle":{"type":["string","null"]},"bay":{"type":["string","null"]},"level":{"type":["string","null"]},"position":{"type":["string","null"]},"lengthM":{"type":["number","null"]},"widthM":{"type":["number","null"]},"heightM":{"type":["number","null"]},"maxWeightKg":{"type":["number","null"]},"maxVolumeCbm":{"type":["number","null"]},"temperatureMinC":{"type":["number","null"]},"temperatureMaxC":{"type":["number","null"]},"allowsMultiSku":{"type":"boolean"},"allowsBondedStock":{"type":"boolean"},"reason":{"type":"string"}},"required":["facilityId","code","typeCode","statusCode","zoneTypeCode","barcode","aisle","bay","level","position","lengthM","widthM","heightM","maxWeightKg","maxVolumeCbm","temperatureMinC","temperatureMaxC","allowsMultiSku","allowsBondedStock","reason"],"additionalProperties":false}'::jsonb,103,true,now()),
('update_warehouse_location','warehouse_reference','Edit warehouse location','Edit an exact warehouse location while preserving unchanged fields.','multideck_dexter_action_update_warehouse_location',
 '{"type":"object","properties":{"target_id":{"type":"string"},"facilityId":{"type":"string"},"code":{"type":["string","null"]},"typeCode":{"type":["string","null"]},"statusCode":{"type":["string","null"]},"zoneTypeCode":{"type":["string","null"]},"barcode":{"type":["string","null"]},"aisle":{"type":["string","null"]},"bay":{"type":["string","null"]},"level":{"type":["string","null"]},"position":{"type":["string","null"]},"lengthM":{"type":["number","null"]},"widthM":{"type":["number","null"]},"heightM":{"type":["number","null"]},"maxWeightKg":{"type":["number","null"]},"maxVolumeCbm":{"type":["number","null"]},"temperatureMinC":{"type":["number","null"]},"temperatureMaxC":{"type":["number","null"]},"allowsMultiSku":{"type":["boolean","null"]},"allowsBondedStock":{"type":["boolean","null"]},"isActive":{"type":["boolean","null"]},"reason":{"type":"string"}},"required":["target_id","facilityId","code","typeCode","statusCode","zoneTypeCode","barcode","aisle","bay","level","position","lengthM","widthM","heightM","maxWeightKg","maxVolumeCbm","temperatureMinC","temperatureMaxC","allowsMultiSku","allowsBondedStock","isActive","reason"],"additionalProperties":false}'::jsonb,104,true,now()),
('create_warehouse_item','warehouse_reference','Create warehouse item','Create an item master record through Warehouse validation.','multideck_dexter_action_create_warehouse_item',
 '{"type":"object","properties":{"customerOrgId":{"type":"string"},"facilityId":{"type":"string"},"sku":{"type":"string"},"description":{"type":"string"},"commodityDescription":{"type":["string","null"]},"hsCode":{"type":["string","null"]},"countryOfOriginCode":{"type":["string","null"]},"baseUomCode":{"type":["string","null"]},"quantityBasisCode":{"type":"string","enum":["count","weight","volume"]},"quantityScale":{"type":"number"},"minimumMovementQuantity":{"type":"number"},"allowsFractionalQuantity":{"type":"boolean"},"uoms":{"type":"array","items":{"type":"object","properties":{"code":{"type":"string"},"quantityInBaseUom":{"type":"number"},"grossWeightKg":{"type":["number","null"]},"purchasing":{"type":"boolean"},"stocking":{"type":"boolean"},"selling":{"type":"boolean"}},"required":["code","quantityInBaseUom","grossWeightKg","purchasing","stocking","selling"],"additionalProperties":false}},"isDangerousGoods":{"type":"boolean"},"isExciseGoods":{"type":"boolean"},"isHighValue":{"type":"boolean"},"isBondedEligible":{"type":"boolean"},"requiresLot":{"type":"boolean"},"requiresSerial":{"type":"boolean"},"requiresExpiry":{"type":"boolean"},"reason":{"type":"string"}},"required":["customerOrgId","facilityId","sku","description","commodityDescription","hsCode","countryOfOriginCode","baseUomCode","quantityBasisCode","quantityScale","minimumMovementQuantity","allowsFractionalQuantity","uoms","isDangerousGoods","isExciseGoods","isHighValue","isBondedEligible","requiresLot","requiresSerial","requiresExpiry","reason"],"additionalProperties":false}'::jsonb,105,true,now()),
('update_warehouse_item','warehouse_reference','Edit warehouse item','Edit an exact item master record while preserving unchanged fields.','multideck_dexter_action_update_warehouse_item',
 '{"type":"object","properties":{"target_id":{"type":"string"},"facilityId":{"type":["string","null"]},"sku":{"type":["string","null"]},"description":{"type":["string","null"]},"commodityDescription":{"type":["string","null"]},"hsCode":{"type":["string","null"]},"countryOfOriginCode":{"type":["string","null"]},"baseUomCode":{"type":["string","null"]},"quantityBasisCode":{"type":["string","null"],"enum":["count","weight","volume",null]},"quantityScale":{"type":["number","null"]},"minimumMovementQuantity":{"type":["number","null"]},"allowsFractionalQuantity":{"type":["boolean","null"]},"uoms":{"type":["array","null"],"items":{"type":"object","properties":{"code":{"type":"string"},"quantityInBaseUom":{"type":"number"},"grossWeightKg":{"type":["number","null"]},"purchasing":{"type":"boolean"},"stocking":{"type":"boolean"},"selling":{"type":"boolean"}},"required":["code","quantityInBaseUom","grossWeightKg","purchasing","stocking","selling"],"additionalProperties":false}},"isDangerousGoods":{"type":["boolean","null"]},"isExciseGoods":{"type":["boolean","null"]},"isHighValue":{"type":["boolean","null"]},"isBondedEligible":{"type":["boolean","null"]},"requiresLot":{"type":["boolean","null"]},"requiresSerial":{"type":["boolean","null"]},"requiresExpiry":{"type":["boolean","null"]},"isActive":{"type":["boolean","null"]},"reason":{"type":"string"}},"required":["target_id","facilityId","sku","description","commodityDescription","hsCode","countryOfOriginCode","baseUomCode","quantityBasisCode","quantityScale","minimumMovementQuantity","allowsFractionalQuantity","uoms","isDangerousGoods","isExciseGoods","isHighValue","isBondedEligible","requiresLot","requiresSerial","requiresExpiry","isActive","reason"],"additionalProperties":false}'::jsonb,106,true,now()),
('create_warehouse_order','warehouse','Create warehouse order','Create an inbound or outbound order, including lines, through Warehouse validation.','multideck_dexter_action_create_warehouse_order',
 '{"type":"object","properties":{"facilityId":{"type":"string"},"customerOrgId":{"type":"string"},"typeCode":{"type":"string","enum":["inbound","outbound"]},"priorityCode":{"type":["string","null"]},"customerReference":{"type":["string","null"]},"requestedDate":{"type":["string","null"]},"appointmentStartAt":{"type":["string","null"]},"appointmentEndAt":{"type":["string","null"]},"vehicleReg":{"type":["string","null"]},"containerNumber":{"type":["string","null"]},"sealNumber":{"type":["string","null"]},"instructions":{"type":["string","null"]},"lines":{"type":"array","minItems":1,"items":{"type":"object","properties":{"itemId":{"type":"string"},"quantity":{"type":"number","exclusiveMinimum":0},"uomCode":{"type":["string","null"]},"lotNumber":{"type":["string","null"]},"expiryDate":{"type":["string","null"]},"sourceLocationId":{"type":["string","null"]},"targetLocationId":{"type":["string","null"]},"customsStatusCode":{"type":["string","null"]},"goodsValue":{"type":["number","null"]},"currencyCode":{"type":["string","null"]},"instructions":{"type":["string","null"]}},"required":["itemId","quantity","uomCode","lotNumber","expiryDate","sourceLocationId","targetLocationId","customsStatusCode","goodsValue","currencyCode","instructions"],"additionalProperties":false}},"reason":{"type":"string"}},"required":["facilityId","customerOrgId","typeCode","priorityCode","customerReference","requestedDate","appointmentStartAt","appointmentEndAt","vehicleReg","containerNumber","sealNumber","instructions","lines","reason"],"additionalProperties":false}'::jsonb,107,true,now()),
('reschedule_warehouse_order','warehouse','Reschedule warehouse order','Move the appointment window for an exact non-final warehouse order.','multideck_dexter_action_reschedule_warehouse_order',
 '{"type":"object","properties":{"target_id":{"type":"string"},"appointmentStartAt":{"type":"string"},"appointmentEndAt":{"type":"string"},"reason":{"type":"string"}},"required":["target_id","appointmentStartAt","appointmentEndAt","reason"],"additionalProperties":false}'::jsonb,108,true,now()),
('create_warehouse_handling_unit','warehouse','Create warehouse object','Create a pallet, carton, container or other handling unit through Warehouse validation.','multideck_dexter_action_create_warehouse_handling_unit',
 '{"type":"object","properties":{"facilityId":{"type":"string"},"customerOrgId":{"type":["string","null"]},"locationId":{"type":["string","null"]},"typeCode":{"type":"string"},"code":{"type":["string","null"]},"sscc":{"type":["string","null"]},"externalReference":{"type":["string","null"]},"customsStatusCode":{"type":["string","null"]},"notes":{"type":["string","null"]},"reason":{"type":"string"}},"required":["facilityId","customerOrgId","locationId","typeCode","code","sscc","externalReference","customsStatusCode","notes","reason"],"additionalProperties":false}'::jsonb,109,true,now()),
('report_warehouse_location_empty','warehouse','Report warehouse location empty','Report an exact warehouse location as unexpectedly empty through Warehouse validation.','multideck_dexter_action_report_warehouse_location_empty',
 '{"type":"object","properties":{"facilityId":{"type":"string"},"locationId":{"type":"string"},"notes":{"type":["string","null"]},"reason":{"type":"string"}},"required":["facilityId","locationId","notes","reason"],"additionalProperties":false}'::jsonb,110,true,now()),
('create_booking','bookings','Create freight booking','Create a canonical freight booking with route and cargo planning details.','multideck_dexter_action_create_booking',
 '{"type":"object","properties":{"customer_id":{"type":"string"},"carrier_id":{"type":["string","null"]},"office_id":{"type":["string","null"]},"status":{"type":["string","null"]},"direction":{"type":"string"},"mode":{"type":"string"},"origin_unlocode":{"type":["string","null"]},"origin_name":{"type":"string"},"destination_unlocode":{"type":["string","null"]},"destination_name":{"type":"string"},"ready_date":{"type":["string","null"]},"required_delivery_date":{"type":["string","null"]},"tracking_status":{"type":["string","null"]},"current_location":{"type":["string","null"]},"predicted_delivery_at":{"type":["string","null"]},"departure_at":{"type":["string","null"]},"arrival_at":{"type":["string","null"]},"transport_reference":{"type":["string","null"]},"cargo_description":{"type":"string"},"package_quantity":{"type":["number","null"]},"gross_weight_kg":{"type":["number","null"]},"internal_notes":{"type":["string","null"]},"reason":{"type":"string"}},"required":["customer_id","carrier_id","office_id","status","direction","mode","origin_unlocode","origin_name","destination_unlocode","destination_name","ready_date","required_delivery_date","tracking_status","current_location","predicted_delivery_at","departure_at","arrival_at","transport_reference","cargo_description","package_quantity","gross_weight_kg","internal_notes","reason"],"additionalProperties":false}'::jsonb,120,true,now()),
('update_booking','bookings','Edit freight booking','Edit an exact canonical freight booking, route or cargo summary.','multideck_dexter_action_update_booking',
 '{"type":"object","properties":{"target_id":{"type":"string"},"status":{"type":["string","null"]},"direction":{"type":["string","null"]},"mode":{"type":["string","null"]},"origin_unlocode":{"type":["string","null"]},"origin_name":{"type":["string","null"]},"destination_unlocode":{"type":["string","null"]},"destination_name":{"type":["string","null"]},"ready_date":{"type":["string","null"]},"required_delivery_date":{"type":["string","null"]},"tracking_status":{"type":["string","null"]},"current_location":{"type":["string","null"]},"predicted_delivery_at":{"type":["string","null"]},"departure_at":{"type":["string","null"]},"arrival_at":{"type":["string","null"]},"transport_reference":{"type":["string","null"]},"cargo_description":{"type":["string","null"]},"package_quantity":{"type":["number","null"]},"gross_weight_kg":{"type":["number","null"]},"internal_notes":{"type":["string","null"]},"reason":{"type":"string"}},"required":["target_id","status","direction","mode","origin_unlocode","origin_name","destination_unlocode","destination_name","ready_date","required_delivery_date","tracking_status","current_location","predicted_delivery_at","departure_at","arrival_at","transport_reference","cargo_description","package_quantity","gross_weight_kg","internal_notes","reason"],"additionalProperties":false}'::jsonb,121,true,now()),
('create_customs_declaration','customs_declarations','Create Customs declaration','Create an operator-owned UK CDS export draft. This does not submit it to iCustoms.','multideck_dexter_action_create_customs_declaration',
 '{"type":"object","properties":{"declaration_category":{"type":["string","null"]},"declaration_type":{"type":["string","null"]},"trader_reference":{"type":["string","null"]},"internal_reference":{"type":["string","null"]},"total_amount":{"type":["string","null"]},"currency":{"type":["string","null"]},"total_packages":{"type":["string","null"]},"total_gross_mass":{"type":["string","null"]},"total_net_mass":{"type":["string","null"]},"exporter":{"type":["string","null"]},"consignee":{"type":["string","null"]},"carrier":{"type":["string","null"]},"declarant":{"type":["string","null"]},"representative":{"type":["string","null"]},"export_country":{"type":["string","null"]},"destination_country":{"type":["string","null"]},"border_mode":{"type":["string","null"]},"exit_office":{"type":["string","null"]},"previous_document_category":{"type":["string","null"]},"previous_document_type":{"type":["string","null"]},"previous_document_reference":{"type":["string","null"]},"is_containerised":{"type":["string","null"]},"container_id":{"type":["string","null"]},"items":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string"},"commodityCode":{"type":"string"},"description":{"type":"string"},"packageKind":{"type":"string"},"packageCount":{"type":"string"},"grossMass":{"type":"string"},"netMass":{"type":"string"},"itemPrice":{"type":"string"},"currency":{"type":"string"},"procedureCode":{"type":"string"},"nonPreferentialOrigin":{"type":"string"}},"required":["id","commodityCode","description","packageKind","packageCount","grossMass","netMass","itemPrice","currency","procedureCode","nonPreferentialOrigin"],"additionalProperties":false}},"reason":{"type":"string"}},"required":["declaration_category","declaration_type","trader_reference","internal_reference","total_amount","currency","total_packages","total_gross_mass","total_net_mass","exporter","consignee","carrier","declarant","representative","export_country","destination_country","border_mode","exit_office","previous_document_category","previous_document_type","previous_document_reference","is_containerised","container_id","items","reason"],"additionalProperties":false}'::jsonb,130,true,now()),
('update_customs_declaration','customs_declarations','Edit Customs declaration','Edit an exact operator-owned draft. This cannot file or submit to iCustoms.','multideck_dexter_action_update_customs_declaration',
 '{"type":"object","properties":{"target_id":{"type":"string"},"declaration_category":{"type":["string","null"]},"declaration_type":{"type":["string","null"]},"trader_reference":{"type":["string","null"]},"internal_reference":{"type":["string","null"]},"total_amount":{"type":["string","null"]},"currency":{"type":["string","null"]},"total_packages":{"type":["string","null"]},"total_gross_mass":{"type":["string","null"]},"total_net_mass":{"type":["string","null"]},"exporter":{"type":["string","null"]},"consignee":{"type":["string","null"]},"carrier":{"type":["string","null"]},"declarant":{"type":["string","null"]},"representative":{"type":["string","null"]},"export_country":{"type":["string","null"]},"destination_country":{"type":["string","null"]},"border_mode":{"type":["string","null"]},"exit_office":{"type":["string","null"]},"previous_document_category":{"type":["string","null"]},"previous_document_type":{"type":["string","null"]},"previous_document_reference":{"type":["string","null"]},"is_containerised":{"type":["string","null"]},"container_id":{"type":["string","null"]},"items":{"type":["array","null"],"items":{"type":"object","properties":{"id":{"type":"string"},"commodityCode":{"type":"string"},"description":{"type":"string"},"packageKind":{"type":"string"},"packageCount":{"type":"string"},"grossMass":{"type":"string"},"netMass":{"type":"string"},"itemPrice":{"type":"string"},"currency":{"type":"string"},"procedureCode":{"type":"string"},"nonPreferentialOrigin":{"type":"string"}},"required":["id","commodityCode","description","packageKind","packageCount","grossMass","netMass","itemPrice","currency","procedureCode","nonPreferentialOrigin"],"additionalProperties":false}},"reason":{"type":"string"}},"required":["target_id","declaration_category","declaration_type","trader_reference","internal_reference","total_amount","currency","total_packages","total_gross_mass","total_net_mass","exporter","consignee","carrier","declarant","representative","export_country","destination_country","border_mode","exit_office","previous_document_category","previous_document_type","previous_document_reference","is_containerised","container_id","items","reason"],"additionalProperties":false}'::jsonb,131,true,now())
on conflict ("AIDexterAction_Code") do update set
  "AIDexterAction_DomainCode"=excluded."AIDexterAction_DomainCode",
  "AIDexterAction_Name"=excluded."AIDexterAction_Name",
  "AIDexterAction_Description"=excluded."AIDexterAction_Description",
  "AIDexterAction_Function"=excluded."AIDexterAction_Function",
  "AIDexterAction_ParametersJSON"=excluded."AIDexterAction_ParametersJSON",
  "AIDexterAction_SortOrder"=excluded."AIDexterAction_SortOrder",
  "AIDexterAction_IsActive"=true,
  "AIDexterAction_UpdatedAt"=now();

update public."sys_AIDexterDataDomains" set
  "AIDexterDomain_Description"='Freight jobs and bookings that Dexter can inspect, create and edit through explicit tenant-safe actions.',
  "AIDexterDomain_UpdatedAt"=now() where "AIDexterDomain_Code"='bookings';
update public."sys_AIDexterDataDomains" set
  "AIDexterDomain_Description"='Operator-owned UK CDS export drafts and recorded filing evidence. Dexter may create and edit drafts but cannot submit to iCustoms.',
  "AIDexterDomain_UpdatedAt"=now() where "AIDexterDomain_Code"='customs_declarations';

commit;
