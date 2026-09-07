-- Expected receipts use the same active product/warehouse assignments as orders.
-- Keep the existing routine, authorisation, audit and lifecycle intact.
begin;
do $migration$
declare
  definition text := pg_get_functiondef('public.warehouse_edge_purchase_order_mutation(text,uuid,jsonb,uuid,uuid[])'::regprocedure);
  old_guard text := 'select 1 from public."WMS_Items" where "WMSItem_ID"=v_item_id and "WMSItem_DefaultFacilityID"=v_facility_id and "WMSItem_CustomerOrgID"=v_customer_org_id and not "WMSItem_IsDeleted"';
  new_guard text := 'select 1 from public."WMS_Items" item
        join public."WMS_ItemFacilityAssignments" assignment
          on assignment."WMSItemFacility_ItemID"=item."WMSItem_ID"
          and assignment."WMSItemFacility_FacilityID"=v_facility_id
          and assignment."WMSItemFacility_IsActive"
        where item."WMSItem_ID"=v_item_id and item."WMSItem_CustomerOrgID"=v_customer_org_id
          and item."WMSItem_IsActive" and not item."WMSItem_IsDeleted"';
begin
  if position(old_guard in definition)=0 then
    raise exception 'Purchase order validation changed; review the assignment migration before applying it';
  end if;
  execute replace(definition,old_guard,new_guard);
end;
$migration$;
revoke all on function public.warehouse_edge_purchase_order_mutation(text,uuid,jsonb,uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.warehouse_edge_purchase_order_mutation(text,uuid,jsonb,uuid,uuid[]) to service_role;
commit;
