begin;
set local lock_timeout='5s';

-- Warehouse report sources: warehouse orders (goods in and goods out), the
-- stock movement ledger, and current stock on hand with days in storage.
--
-- Access matches the Warehouse Edge Function for internal users:
-- Warehouse.Read (checked by the reporting catalogue) and only facilities that
-- belong to an office the user is assigned to, inside the user's own company.
-- Customer portal users never reach report_api (report_api.context requires an
-- active cmp_Users company member).
--
-- Dexter parity: chat discovers these through the existing report_sources
-- domain (filtered by the same catalogue permission), saves reports through the
-- approval-gated save_report action, and Watching for you uses the existing
-- report definition/run watch. No new write path or watch event is introduced.

create or replace function report_api.warehouse_source_rows(actor uuid, source text) returns setof jsonb
language plpgsql stable security definer set search_path='' as $$
declare u public."cmp_Users";
begin
  u:=report_api.context(actor);
  if not booking_api.has_permission(actor,'Warehouse.Read') then
    raise exception 'You do not have access to this report data.' using errcode='42501';end if;

  if source='warehouse_orders' then return query
    with scope as (
      select distinct facility."WMSFacility_ID" id, facility."WMSFacility_Name" name
      from public."cmp_Users_Offices" link
      join public."cmp_Offices" office on office."Office_ID"=link."Office_ID" and office."Company_ID"=u."Company_ID"
      join public."WMS_Facilities" facility on facility."WMSFacility_OrgOfficeID"=office."Office_ID" and not facility."WMSFacility_IsDeleted"
      where link."User_ID"=u."User_ID")
    select jsonb_build_object('id',o."WMSOrder_ID",'sourceUrl','/warehouse/orders/'||lower(o."WMSOrder_OrderNumber"),
      'reference',o."WMSOrder_OrderNumber",'customer',customer."Org_Name",'warehouse',scope.name,
      'direction',case o."WMSOrder_TypeCode" when 'inbound' then 'Goods in' when 'outbound' then 'Goods out' else initcap(replace(o."WMSOrder_TypeCode",'_',' ')) end,
      'status',coalesce(status."WMSOrderStatus_Name",initcap(replace(o."WMSOrder_StatusCode",'_',' '))),
      'sourceType',initcap(replace(o."WMSOrder_SourceTypeCode",'_',' ')),'sourceReference',o."WMSOrder_SourceReference",
      'customerReference',o."WMSOrder_CustomerReference",'created',o."WMSOrder_CreatedAt"::date,
      'expected',coalesce(o."WMSOrder_AppointmentStartAt"::date,o."WMSOrder_RequestedDate"),
      'completed',coalesce((select max(r."WMSReceipt_ReceivedAt")::date from public."WMS_Receipts" r where r."WMSReceipt_OrderID"=o."WMSOrder_ID"),
        (select max(d."WMSDispatch_DispatchedAt")::date from public."WMS_Dispatches" d where d."WMSDispatch_OrderID"=o."WMSOrder_ID")),
      'lines',totals.lines,'ordered',totals.ordered,'received',totals.received,'dispatched',totals.dispatched,
      'createdBy',nullif(concat_ws(' ',creator."User_Firstname",creator."User_Lastname"),''))
    from public."WMS_Orders" o
    join scope on scope.id=o."WMSOrder_FacilityID"
    left join public."Org_Master" customer on customer."Org_id"=o."WMSOrder_CustomerOrgID"
    left join public."sys_WMSOrderStatuses" status on status."WMSOrderStatus_Code"=o."WMSOrder_StatusCode"
    left join public."cmp_Users" creator on creator."User_ID"=o."WMSOrder_CreatedBy" and creator."Company_ID"=u."Company_ID"
    cross join lateral (select count(*)::integer lines,coalesce(sum(l."WMSOrderLine_OrderedQuantity"),0) ordered,
        coalesce(sum(l."WMSOrderLine_ReceivedQuantity"),0) received,coalesce(sum(l."WMSOrderLine_DispatchedQuantity"),0) dispatched
      from public."WMS_OrderLines" l where l."WMSOrderLine_OrderID"=o."WMSOrder_ID") totals
    where not o."WMSOrder_IsDeleted";

  elsif source='warehouse_movements' then return query
    with scope as (
      select distinct facility."WMSFacility_ID" id, facility."WMSFacility_Name" name
      from public."cmp_Users_Offices" link
      join public."cmp_Offices" office on office."Office_ID"=link."Office_ID" and office."Company_ID"=u."Company_ID"
      join public."WMS_Facilities" facility on facility."WMSFacility_OrgOfficeID"=office."Office_ID" and not facility."WMSFacility_IsDeleted"
      where link."User_ID"=u."User_ID")
    select jsonb_build_object('id',t."WMSTransaction_ID",
      'sourceUrl',case when o."WMSOrder_OrderNumber" is not null then '/warehouse/orders/'||lower(o."WMSOrder_OrderNumber") else '/warehouse/inventory' end,
      'date',t."WMSTransaction_CreatedAt"::date,'recordedAt',to_char(t."WMSTransaction_CreatedAt" at time zone 'UTC','YYYY-MM-DD HH24:MI "UTC"'),
      'reference',t."WMSTransaction_Reference",'order',o."WMSOrder_OrderNumber",'customer',customer."Org_Name",'warehouse',scope.name,
      'movement',coalesce(kind."WMSTransactionType_Name",initcap(replace(t."WMSTransaction_TypeCode",'_',' '))),
      'sku',item."WMSItem_SKU",'item',item."WMSItem_Description",'lot',lot."WMSLot_LotNumber",
      'fromLocation',from_location."WMSLocation_Code",'toLocation',to_location."WMSLocation_Code",
      'quantity',t."WMSTransaction_Quantity",'unit',t."WMSTransaction_UOMCode",
      'onHandBefore',t."WMSTransaction_BeforeOnHandQuantity",'onHandAfter',t."WMSTransaction_AfterOnHandQuantity",
      'status',coalesce(stock_status."WMSInventoryStatus_Name",initcap(replace(t."WMSTransaction_InventoryStatusCode",'_',' '))),
      'reason',initcap(replace(t."WMSTransaction_ReasonCode",'_',' ')),'notes',t."WMSTransaction_Notes",
      'recordedBy',nullif(concat_ws(' ',recorder."User_Firstname",recorder."User_Lastname"),''))
    from public."WMS_InventoryTransactions" t
    join scope on scope.id=t."WMSTransaction_FacilityID"
    join public."WMS_Items" item on item."WMSItem_ID"=t."WMSTransaction_ItemID"
    left join public."WMS_Orders" o on o."WMSOrder_ID"=t."WMSTransaction_OrderID"
    left join public."Org_Master" customer on customer."Org_id"=coalesce(t."WMSTransaction_CustomerOrgID",item."WMSItem_CustomerOrgID")
    left join public."sys_WMSTransactionTypes" kind on kind."WMSTransactionType_Code"=t."WMSTransaction_TypeCode"
    left join public."sys_WMSInventoryStatuses" stock_status on stock_status."WMSInventoryStatus_Code"=t."WMSTransaction_InventoryStatusCode"
    left join public."WMS_InventoryLots" lot on lot."WMSLot_ID"=t."WMSTransaction_LotID"
    left join public."WMS_Locations" from_location on from_location."WMSLocation_ID"=t."WMSTransaction_FromLocationID"
    left join public."WMS_Locations" to_location on to_location."WMSLocation_ID"=t."WMSTransaction_ToLocationID"
    left join public."cmp_Users" recorder on recorder."User_ID"=t."WMSTransaction_CreatedBy" and recorder."Company_ID"=u."Company_ID";

  elsif source='warehouse_stock' then return query
    with scope as (
      select distinct facility."WMSFacility_ID" id, facility."WMSFacility_Name" name
      from public."cmp_Users_Offices" link
      join public."cmp_Offices" office on office."Office_ID"=link."Office_ID" and office."Company_ID"=u."Company_ID"
      join public."WMS_Facilities" facility on facility."WMSFacility_OrgOfficeID"=office."Office_ID" and not facility."WMSFacility_IsDeleted"
      where link."User_ID"=u."User_ID")
    select jsonb_build_object('id',b."WMSBalance_ID",'sourceUrl','/warehouse/inventory','asAt',current_date,
      'received',coalesce(b."WMSBalance_FirstReceiptAt",b."WMSBalance_CreatedAt")::date,
      'lastMovement',coalesce(b."WMSBalance_LastMovementAt",b."WMSBalance_UpdatedAt")::date,
      'daysInStorage',greatest(0,current_date-coalesce(b."WMSBalance_FirstReceiptAt",b."WMSBalance_CreatedAt")::date),
      'customer',customer."Org_Name",'warehouse',scope.name,'sku',item."WMSItem_SKU",'item',item."WMSItem_Description",
      'location',location."WMSLocation_Code",'lot',lot."WMSLot_LotNumber",'expiry',lot."WMSLot_ExpiryDate",
      'status',coalesce(stock_status."WMSInventoryStatus_Name",initcap(replace(b."WMSBalance_InventoryStatusCode",'_',' '))),
      'customsStatus',coalesce(customs_status."WMSCustomsStatus_Name",initcap(replace(b."WMSBalance_CustomsStatusCode",'_',' '))),
      'onHand',b."WMSBalance_OnHandQuantity",'available',b."WMSBalance_AvailableQuantity",
      'allocated',b."WMSBalance_AllocatedQuantity",'held',b."WMSBalance_HeldQuantity",'unit',b."WMSBalance_UOMCode")
    from public."WMS_InventoryBalances" b
    join scope on scope.id=b."WMSBalance_FacilityID"
    join public."WMS_Items" item on item."WMSItem_ID"=b."WMSBalance_ItemID"
    left join public."Org_Master" customer on customer."Org_id"=coalesce(b."WMSBalance_CustomerOrgID",item."WMSItem_CustomerOrgID")
    left join public."WMS_Locations" location on location."WMSLocation_ID"=b."WMSBalance_LocationID"
    left join public."WMS_InventoryLots" lot on lot."WMSLot_ID"=b."WMSBalance_LotID"
    left join public."sys_WMSInventoryStatuses" stock_status on stock_status."WMSInventoryStatus_Code"=b."WMSBalance_InventoryStatusCode"
    left join public."sys_WMSCustomsStatuses" customs_status on customs_status."WMSCustomsStatus_Code"=b."WMSBalance_CustomsStatusCode"
    where b."WMSBalance_OnHandQuantity"<>0;
  end if;
end $$;
revoke all on function report_api.warehouse_source_rows(uuid,text) from public,anon,authenticated;

-- Route the new sources through the existing adapter before its generic
-- permission lookup, which still enforces the catalogue permission.
do $$ declare definition text; marker text:='u:=report_api.context(actor);'; begin
  definition:=pg_get_functiondef('report_api.source_rows(uuid,text)'::regprocedure);
  if strpos(definition,'report_api.warehouse_source_rows')>0 then return;end if;
  if strpos(definition,marker)=0 then raise exception 'Reporting source adapter marker changed';end if;
  definition:=replace(definition,marker,marker||$add$
  if source in ('warehouse_orders','warehouse_movements','warehouse_stock') then
    return query select r from report_api.warehouse_source_rows(actor,source) r;
    return;
  end if;$add$);
  execute definition;
end $$;

-- The catalogue is also the field allowlist. Extend the installed catalogue
-- rather than re-typing the existing sources.
do $$ declare current jsonb; additions jsonb:=$json$[
 {"id":"warehouse_orders","label":"Warehouse orders","permission":"Warehouse.Read","description":"One row per goods-in or goods-out warehouse order in warehouses linked to your offices. Quantities are totals across the order lines in each line's own unit; cancelled orders are included with their status.","defaultDate":"created","fields":[
  {"id":"reference","label":"Order number","type":"text"},{"id":"customer","label":"Customer","type":"text"},
  {"id":"warehouse","label":"Warehouse","type":"text"},{"id":"direction","label":"Direction","type":"text"},
  {"id":"status","label":"Status","type":"text"},{"id":"expected","label":"Expected date","type":"date"},
  {"id":"ordered","label":"Ordered quantity","type":"number"},
  {"id":"received","label":"Received quantity","type":"number"},{"id":"dispatched","label":"Dispatched quantity","type":"number"},
  {"id":"lines","label":"Lines","type":"number"},{"id":"created","label":"Created date","type":"date"},
  {"id":"completed","label":"Last received or dispatched date","type":"date"},
  {"id":"sourceType","label":"Source type","type":"text"},{"id":"sourceReference","label":"Source reference","type":"text"},
  {"id":"customerReference","label":"Customer reference","type":"text"},{"id":"createdBy","label":"Created by","type":"text"}]},
 {"id":"warehouse_movements","label":"Stock movements","permission":"Warehouse.Read","description":"One row per recorded stock movement — receipts, putaway, picks, dispatches, moves, status changes and samples — with who recorded it and the on-hand quantity before and after. This is the warehouse audit ledger.","defaultDate":"date","fields":[
  {"id":"date","label":"Movement date","type":"date"},{"id":"movement","label":"Movement","type":"text"},
  {"id":"customer","label":"Customer","type":"text"},{"id":"sku","label":"SKU","type":"text"},
  {"id":"quantity","label":"Quantity","type":"number"},{"id":"warehouse","label":"Warehouse","type":"text"},
  {"id":"recordedBy","label":"Recorded by","type":"text"},{"id":"recordedAt","label":"Recorded at","type":"text"},
  {"id":"reference","label":"Reference","type":"text"},{"id":"order","label":"Order number","type":"text"},
  {"id":"item","label":"Item description","type":"text"},{"id":"lot","label":"Lot","type":"text"},
  {"id":"fromLocation","label":"From location","type":"text"},{"id":"toLocation","label":"To location","type":"text"},
  {"id":"unit","label":"Unit","type":"text"},
  {"id":"onHandBefore","label":"On hand before","type":"number"},{"id":"onHandAfter","label":"On hand after","type":"number"},
  {"id":"status","label":"Stock status","type":"text"},{"id":"reason","label":"Reason","type":"text"},
  {"id":"notes","label":"Notes","type":"text"}]},
 {"id":"warehouse_stock","label":"Stock on hand","permission":"Warehouse.Read","description":"One row per current stock balance with a non-zero quantity, by customer, warehouse, location and lot. This is current stock, so any period that includes today shows all of it; choose First received date instead to report on stock by when it arrived. Days in storage are counted to today.","defaultDate":"asAt","fields":[
  {"id":"customer","label":"Customer","type":"text"},{"id":"warehouse","label":"Warehouse","type":"text"},
  {"id":"sku","label":"SKU","type":"text"},{"id":"item","label":"Item description","type":"text"},
  {"id":"location","label":"Location","type":"text"},{"id":"onHand","label":"On hand","type":"number"},
  {"id":"daysInStorage","label":"Days in storage","type":"number"},
  {"id":"unit","label":"Unit","type":"text"},{"id":"lot","label":"Lot","type":"text"},
  {"id":"asAt","label":"Stock as at (today)","type":"date"},
  {"id":"received","label":"First received date","type":"date"},{"id":"lastMovement","label":"Last movement date","type":"date"},
  {"id":"expiry","label":"Expiry date","type":"date"},
  {"id":"status","label":"Stock status","type":"text"},{"id":"customsStatus","label":"Customs status","type":"text"},
  {"id":"available","label":"Available","type":"number"},
  {"id":"allocated","label":"Allocated","type":"number"},{"id":"held","label":"Held","type":"number"}]}]$json$::jsonb;
begin
  current:=report_api.catalogue();
  if exists(select 1 from jsonb_array_elements(current) c where c->>'id' like 'warehouse_%') then return;end if;
  execute format('create or replace function report_api.catalogue() returns jsonb language sql immutable set search_path=%L as %s',
    '',quote_literal('select '||quote_literal((current||additions)::text)||'::jsonb'));
end $$;

commit;
