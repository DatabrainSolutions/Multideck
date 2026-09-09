-- Warehouse purchase orders are customer-provided operational inbound
-- instructions. They are deliberately distinct from supplier purchase orders
-- in the finance purchase subledger and must never be used for AP matching.

begin;

alter table public."WMS_PurchaseOrders"
  add column if not exists "WMSPO_RecordRoleCode" varchar(50);

update public."WMS_PurchaseOrders"
set "WMSPO_RecordRoleCode" = 'customer_inbound_instruction'
where "WMSPO_RecordRoleCode" is null;

alter table public."WMS_PurchaseOrders"
  alter column "WMSPO_RecordRoleCode" set default 'customer_inbound_instruction',
  alter column "WMSPO_RecordRoleCode" set not null;

alter table public."WMS_PurchaseOrders"
  drop constraint if exists "CK_WMS_PurchaseOrders_record_role";

alter table public."WMS_PurchaseOrders"
  add constraint "CK_WMS_PurchaseOrders_record_role"
  check ("WMSPO_RecordRoleCode" = 'customer_inbound_instruction');

comment on table public."WMS_PurchaseOrders" is
  'Customer-provided warehouse purchase orders used only to describe expected inbound goods. Not a finance or accounts-payable purchase order.';

comment on column public."WMS_PurchaseOrders"."WMSPO_RecordRoleCode" is
  'Fixed operational role. customer_inbound_instruction records expected goods-in and is excluded from supplier purchase-subledger matching.';

create or replace function public.multideck_dexter_domain_purchase_orders(
  p_user_id uuid,
  p_search text default null,
  p_take integer default 10
) returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
with actor as (
  select "Company_ID" company_id
  from public."cmp_Users"
  where "User_ID" = p_user_id
), facilities as (
  select facility."WMSFacility_ID"
  from public."WMS_Facilities" facility
  join public."cmp_Offices" office
    on office."Office_ID" = facility."WMSFacility_OrgOfficeID"
  join actor on actor.company_id = office."Company_ID"
  where not facility."WMSFacility_IsDeleted"
), rows as (
  select
    po.*,
    facility."WMSFacility_Code",
    customer."Org_Name" customer_name,
    (
      select jsonb_agg(
        jsonb_build_object(
          'recordId', line."WMSPOLine_ID",
          'lineNumber', line."WMSPOLine_LineNo",
          'itemId', line."WMSPOLine_ItemID",
          'sku', line."WMSPOLine_SKU",
          'description', line."WMSPOLine_Description",
          'quantity', line."WMSPOLine_OrderedQuantity",
          'receivedQuantity', line."WMSPOLine_ReceivedQuantity",
          'uom', line."WMSPOLine_UOMCode",
          'unitPrice', line."WMSPOLine_UnitPrice",
          'totalAmount', line."WMSPOLine_TotalAmount"
        ) order by line."WMSPOLine_LineNo"
      )
      from public."WMS_PurchaseOrderLines" line
      where line."WMSPOLine_PurchaseOrderID" = po."WMSPO_ID"
    ) lines
  from public."WMS_PurchaseOrders" po
  join facilities f on f."WMSFacility_ID" = po."WMSPO_FacilityID"
  join public."WMS_Facilities" facility
    on facility."WMSFacility_ID" = po."WMSPO_FacilityID"
  join public."Org_Master" customer
    on customer."Org_id" = po."WMSPO_CustomerOrgID"
  where not po."WMSPO_IsDeleted"
    and (
      coalesce(btrim(p_search), '') = ''
      or concat_ws(' ', po."WMSPO_Number", customer."Org_Name", po."WMSPO_SupplierName", po."WMSPO_BuyerReference", po."WMSPO_SupplierReference")
        ilike '%' || btrim(p_search) || '%'
    )
  order by po."WMSPO_UpdatedAt" desc
  limit greatest(1, least(coalesce(p_take, 10), 25))
)
select coalesce(
  jsonb_agg(
    jsonb_build_object(
      'recordId', "WMSPO_ID",
      'recordRole', "WMSPO_RecordRoleCode",
      'financePurchaseOrder', false,
      'facilityId', "WMSPO_FacilityID",
      'facilityCode', "WMSFacility_Code",
      'customerOrgId', "WMSPO_CustomerOrgID",
      'customerName', customer_name,
      'purchaseOrderNumber', "WMSPO_Number",
      'supplierName', "WMSPO_SupplierName",
      'status', "WMSPO_StatusCode",
      'issueDate', "WMSPO_IssueDate",
      'expectedDeliveryDate', "WMSPO_ExpectedDeliveryDate",
      'currency', "WMSPO_CurrencyCode",
      'netAmount', "WMSPO_NetAmount",
      'taxAmount', "WMSPO_TaxAmount",
      'totalAmount', "WMSPO_TotalAmount",
      'warehouseOrderId', "WMSPO_WarehouseOrderID",
      'lines', coalesce(lines, '[]'::jsonb),
      'source', jsonb_build_object(
        'table', 'WMS_PurchaseOrders',
        'id', "WMSPO_ID",
        'observedAt', "WMSPO_UpdatedAt"
      )
    )
  ),
  '[]'::jsonb
)
from rows;
$$;

revoke all on function public.multideck_dexter_domain_purchase_orders(uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.multideck_dexter_domain_purchase_orders(uuid, text, integer)
  to service_role;

update public."sys_AIDexterDataDomains"
set
  "AIDexterDomain_Name" = 'Warehouse customer purchase orders',
  "AIDexterDomain_Description" = 'Customer-provided operational purchase orders describing stock expected into a warehouse, their matched warehouse items and linked goods-in order. These records are not finance supplier purchase orders and are excluded from AP matching.',
  "AIDexterDomain_UpdatedAt" = now()
where "AIDexterDomain_Code" = 'purchase_orders';

update public."sys_AIDexterWatchCapabilities"
set
  "AIDexterWatchCapability_Name" = 'Warehouse customer purchase orders',
  "AIDexterWatchCapability_Description" = 'Customer inbound purchase-order status, stock owner, expected goods, source supplier, reference values, expected delivery and linked goods-in changes. This is an operational warehouse watch, not an AP purchase-order watch.'
where "AIDexterWatchCapability_Code" = 'purchase_orders';

update public."sys_AIDexterActions"
set
  "AIDexterAction_Name" = 'Create warehouse customer purchase order',
  "AIDexterAction_Description" = 'Create a reviewed customer-provided inbound instruction through the Warehouse Edge Function. It never creates a finance supplier purchase order. Approval is always required.',
  "AIDexterAction_UpdatedAt" = now()
where "AIDexterAction_Code" = 'create_purchase_order';

commit;
