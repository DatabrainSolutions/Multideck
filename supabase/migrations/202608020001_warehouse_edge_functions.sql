-- Transactional write boundary for the warehouse Edge Function.
-- It is deliberately callable only with the tenant project's service role. The Edge
-- Function authenticates the Supabase user and supplies the already-resolved actor scope.

insert into storage.buckets (id, name, public, file_size_limit)
values ('multideck-warehouse', 'multideck-warehouse', false, 26214400)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit;

create or replace function public.warehouse_edge_order_mutation(
  p_action text,
  p_order_id uuid,
  p_payload jsonb,
  p_actor_user_id uuid,
  p_actor_portal_user_id uuid,
  p_allowed_facility_ids uuid[],
  p_allowed_organisation_ids uuid[]
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public."WMS_Orders"%rowtype;
  v_line public."WMS_OrderLines"%rowtype;
  v_item public."WMS_Items"%rowtype;
  v_facility public."WMS_Facilities"%rowtype;
  v_input jsonb;
  v_order_id uuid := coalesce(p_order_id, gen_random_uuid());
  v_line_id uuid;
  v_transaction_id uuid;
  v_primary_transaction_id uuid;
  v_receipt_id uuid;
  v_dispatch_id uuid;
  v_advice_id uuid;
  v_balance public."WMS_InventoryBalances"%rowtype;
  v_balance_id uuid;
  v_lot_id uuid;
  v_location_id uuid;
  v_quantity numeric;
  v_damaged numeric;
  v_good numeric;
  v_remaining numeric;
  v_take numeric;
  v_before numeric;
  v_now timestamptz := now();
  v_complete boolean;
  v_index integer := 0;
  v_type text;
  v_customs text;
  v_status text;
  v_number text;
begin
  if p_action = 'create' then
    v_type := lower(trim(p_payload->>'typeCode'));
    if v_type not in ('inbound', 'outbound') then raise exception 'WMS400: Warehouse orders must be inbound or outbound.'; end if;
    if not ((p_payload->>'facilityId')::uuid = any(p_allowed_facility_ids)) then raise exception 'WMS400: Choose a warehouse in your workspace.'; end if;
    if not ((p_payload->>'customerOrgId')::uuid = any(p_allowed_organisation_ids)) then raise exception 'WMS400: Choose a valid customer.'; end if;
    if jsonb_typeof(p_payload->'lines') <> 'array' or jsonb_array_length(p_payload->'lines') = 0 then raise exception 'WMS400: Add at least one item line.'; end if;
    select * into v_facility from public."WMS_Facilities" where "WMSFacility_ID" = (p_payload->>'facilityId')::uuid and not "WMSFacility_IsDeleted" and "WMSFacility_IsActive" for share;
    if not found then raise exception 'WMS400: Choose a warehouse in your workspace.'; end if;
    v_number := upper(left(v_type, 2)) || '-' || to_char(v_now, 'YYYYMMDD-HH24MISS') || '-' || lpad((floor(random() * 9000) + 1000)::int::text, 4, '0');
    insert into public."WMS_Orders" (
      "WMSOrder_ID","WMSOrder_FacilityID","WMSOrder_OrgOfficeID","WMSOrder_CustomerOrgID","WMSOrder_OrderNumber","WMSOrder_TypeCode","WMSOrder_StatusCode","WMSOrder_PriorityCode","WMSOrder_CustomerReference","WMSOrder_RequestedDate","WMSOrder_AppointmentStartAt","WMSOrder_AppointmentEndAt","WMSOrder_VehicleReg","WMSOrder_ContainerNumber","WMSOrder_SealNumber","WMSOrder_RequiresCustomsRelease","WMSOrder_RequiresComplianceRelease","WMSOrder_RequiresFinanceRelease","WMSOrder_ReleaseGateStatusCode","WMSOrder_Instructions","WMSOrder_MetadataJSON","WMSOrder_CreatedAt","WMSOrder_CreatedBy","WMSOrder_UpdatedAt","WMSOrder_UpdatedBy","WMSOrder_IsDeleted"
    ) values (
      v_order_id,(p_payload->>'facilityId')::uuid,v_facility."WMSFacility_OrgOfficeID",(p_payload->>'customerOrgId')::uuid,v_number,v_type,'booked',coalesce(nullif(trim(p_payload->>'priorityCode'),''),'normal'),nullif(trim(p_payload->>'customerReference'),''),nullif(p_payload->>'requestedDate','')::date,nullif(p_payload->>'appointmentStartAt','')::timestamptz,nullif(p_payload->>'appointmentEndAt','')::timestamptz,nullif(trim(p_payload->>'vehicleReg'),''),upper(nullif(trim(p_payload->>'containerNumber'),'')),nullif(trim(p_payload->>'sealNumber'),''),false,false,false,'not_checked',nullif(trim(p_payload->>'instructions'),''),'{}',v_now,p_actor_user_id,v_now,p_actor_user_id,false
    );
    if p_actor_portal_user_id is not null and v_type='inbound' then
      v_advice_id:=gen_random_uuid();
      insert into public."WMS_InboundAdvices" ("WMSAdvice_ID","WMSAdvice_FacilityID","WMSAdvice_OrderID","WMSAdvice_AdviceNumber","WMSAdvice_StatusCode","WMSAdvice_CustomerOrgID","WMSAdvice_ExpectedArrivalAt","WMSAdvice_ContainerNumber","WMSAdvice_SealNumber","WMSAdvice_MetadataJSON","WMSAdvice_CreatedAt") values(v_advice_id,(p_payload->>'facilityId')::uuid,v_order_id,'ASN-'||v_number,'booked',(p_payload->>'customerOrgId')::uuid,nullif(p_payload->>'appointmentStartAt','')::timestamptz,upper(nullif(trim(p_payload->>'containerNumber'),'')),nullif(trim(p_payload->>'sealNumber'),''),'{"source":"customer_portal"}',v_now);
    end if;
    for v_input in select value from jsonb_array_elements(p_payload->'lines') loop
      v_index := v_index + 1; v_quantity := (v_input->>'quantity')::numeric;
      if v_quantity <= 0 then raise exception 'WMS400: Quantity must be greater than zero.'; end if;
      select * into v_item from public."WMS_Items" where "WMSItem_ID" = (v_input->>'itemId')::uuid and "WMSItem_CustomerOrgID" = (p_payload->>'customerOrgId')::uuid and "WMSItem_DefaultFacilityID" = (p_payload->>'facilityId')::uuid and "WMSItem_IsActive" and not "WMSItem_IsDeleted";
      if not found then raise exception 'WMS400: One or more selected items are not available.'; end if;
      v_customs := coalesce(nullif(trim(v_input->>'customsStatusCode'),''),v_facility."WMSFacility_DefaultCustomsStatusCode");
      if v_type = 'outbound' and (select coalesce(sum("WMSBalance_AvailableQuantity"),0) from public."WMS_InventoryBalances" where "WMSBalance_FacilityID" = v_facility."WMSFacility_ID" and "WMSBalance_CustomerOrgID" = v_item."WMSItem_CustomerOrgID" and "WMSBalance_ItemID" = v_item."WMSItem_ID" and "WMSBalance_InventoryStatusCode" = 'available' and "WMSBalance_CustomsStatusCode" = v_customs and "WMSBalance_AvailableQuantity" > 0 and ((v_input->>'sourceLocationId') is null or "WMSBalance_LocationID" = (v_input->>'sourceLocationId')::uuid)) < v_quantity then raise exception 'WMS400: There is not enough available stock for this outbound line.'; end if;
      v_line_id:=gen_random_uuid();
      insert into public."WMS_OrderLines" ("WMSOrderLine_ID","WMSOrderLine_OrderID","WMSOrderLine_LineNo","WMSOrderLine_ItemID","WMSOrderLine_StatusCode","WMSOrderLine_OrderedQuantity","WMSOrderLine_ReceivedQuantity","WMSOrderLine_AllocatedQuantity","WMSOrderLine_PickedQuantity","WMSOrderLine_PackedQuantity","WMSOrderLine_DispatchedQuantity","WMSOrderLine_UOMCode","WMSOrderLine_LotNumber","WMSOrderLine_ExpiryDate","WMSOrderLine_SourceLocationID","WMSOrderLine_TargetLocationID","WMSOrderLine_InventoryStatusCode","WMSOrderLine_CustomsStatusCode","WMSOrderLine_GoodsValue","WMSOrderLine_CurrencyCode","WMSOrderLine_Instructions","WMSOrderLine_MetadataJSON","WMSOrderLine_CreatedAt")
      values (v_line_id,v_order_id,v_index,v_item."WMSItem_ID",'open',v_quantity,0,0,0,0,0,upper(coalesce(nullif(trim(v_input->>'uomCode'),''),v_item."WMSItem_BaseUOMCode")),nullif(trim(v_input->>'lotNumber'),''),nullif(v_input->>'expiryDate','')::date,nullif(v_input->>'sourceLocationId','')::uuid,nullif(v_input->>'targetLocationId','')::uuid,'available',v_customs,nullif(v_input->>'goodsValue','')::numeric,upper(nullif(trim(v_input->>'currencyCode'),'')),nullif(trim(v_input->>'instructions'),''),'{}',v_now);
      if v_advice_id is not null then insert into public."WMS_InboundAdviceLines" ("WMSAdviceLine_ID","WMSAdviceLine_AdviceID","WMSAdviceLine_OrderLineID","WMSAdviceLine_LineNo","WMSAdviceLine_ItemID","WMSAdviceLine_ExpectedQuantity","WMSAdviceLine_UOMCode","WMSAdviceLine_LotNumber","WMSAdviceLine_ExpiryDate","WMSAdviceLine_CustomsStatusCode") values(gen_random_uuid(),v_advice_id,v_line_id,v_index,v_item."WMSItem_ID",v_quantity,upper(coalesce(nullif(trim(v_input->>'uomCode'),''),v_item."WMSItem_BaseUOMCode")),nullif(trim(v_input->>'lotNumber'),''),nullif(v_input->>'expiryDate','')::date,v_customs); end if;
    end loop;
    return v_order_id;
  end if;

  select * into v_order from public."WMS_Orders" where "WMSOrder_ID" = p_order_id and not "WMSOrder_IsDeleted" and "WMSOrder_FacilityID" = any(p_allowed_facility_ids) and "WMSOrder_CustomerOrgID" = any(p_allowed_organisation_ids) for update;
  if not found then raise exception 'WMS400: This warehouse order does not exist in your workspace.'; end if;
  if v_order."WMSOrder_StatusCode" in ('complete','cancelled') then raise exception 'WMS409: This order is already final.'; end if;

  if p_action = 'cancel' then
    if exists(select 1 from public."WMS_OrderLines" where "WMSOrderLine_OrderID"=p_order_id and ("WMSOrderLine_ReceivedQuantity">0 or "WMSOrderLine_DispatchedQuantity">0)) then raise exception 'WMS409: An order with posted stock movements cannot be cancelled.'; end if;
    update public."WMS_OrderLines" set "WMSOrderLine_StatusCode"='cancelled' where "WMSOrderLine_OrderID"=p_order_id;
    update public."WMS_Orders" set "WMSOrder_StatusCode"='cancelled',"WMSOrder_UpdatedAt"=v_now,"WMSOrder_UpdatedBy"=p_actor_user_id where "WMSOrder_ID"=p_order_id;
    return p_order_id;
  end if;

  if jsonb_typeof(p_payload->'lines') <> 'array' or jsonb_array_length(p_payload->'lines') = 0 then raise exception 'WMS400: Add at least one posting line.'; end if;
  if p_action = 'receive' then
    if v_order."WMSOrder_TypeCode" <> 'inbound' then raise exception 'WMS400: Only inbound orders can be received.'; end if;
    v_receipt_id := gen_random_uuid(); v_number := 'GRN-'||to_char(v_now,'YYYYMMDD-HH24MISS')||'-'||lpad((floor(random()*9000)+1000)::int::text,4,'0');
    insert into public."WMS_Receipts" ("WMSReceipt_ID","WMSReceipt_FacilityID","WMSReceipt_OrderID","WMSReceipt_JobID","WMSReceipt_ReceiptNumber","WMSReceipt_StatusCode","WMSReceipt_ReceivingLocationID","WMSReceipt_ReceivedAt","WMSReceipt_ReceivedBy","WMSReceipt_HasDiscrepancy","WMSReceipt_Notes","WMSReceipt_MetadataJSON","WMSReceipt_CreatedAt","WMSReceipt_CreatedBy") values (v_receipt_id,v_order."WMSOrder_FacilityID",p_order_id,v_order."WMSOrder_JobID",v_number,'complete',nullif(p_payload->>'receivingLocationId','')::uuid,v_now,p_actor_user_id,false,nullif(trim(p_payload->>'notes'),''),'{}',v_now,p_actor_user_id);
    for v_input in select value from jsonb_array_elements(p_payload->'lines') loop
      v_index:=v_index+1; v_primary_transaction_id:=null;
      select * into v_line from public."WMS_OrderLines" where "WMSOrderLine_ID"=(v_input->>'orderLineId')::uuid and "WMSOrderLine_OrderID"=p_order_id for update; if not found then raise exception 'WMS400: A received line does not belong to this order.'; end if;
      v_quantity := (v_input->>'quantity')::numeric; v_damaged := coalesce((v_input->>'damagedQuantity')::numeric,0); if v_quantity<=0 or v_damaged<0 or v_damaged>v_quantity then raise exception 'WMS400: Check the received and damaged quantities.'; end if;
      v_location_id := coalesce(nullif(v_input->>'targetLocationId','')::uuid,v_line."WMSOrderLine_TargetLocationID",nullif(p_payload->>'receivingLocationId','')::uuid); if v_location_id is null then raise exception 'WMS400: Choose a receiving location.'; end if;
      if not exists(select 1 from public."WMS_Locations" where "WMSLocation_ID"=v_location_id and "WMSLocation_FacilityID"=v_order."WMSOrder_FacilityID" and "WMSLocation_IsActive" and not "WMSLocation_IsDeleted") then raise exception 'WMS400: Choose an active receiving location.'; end if;
      v_lot_id := null; if coalesce(nullif(trim(v_input->>'lotNumber'),''),nullif(trim(v_input->>'batchNumber'),''),v_line."WMSOrderLine_LotNumber") is not null then select "WMSLot_ID" into v_lot_id from public."WMS_InventoryLots" where "WMSLot_FacilityID"=v_order."WMSOrder_FacilityID" and "WMSLot_ItemID"=v_line."WMSOrderLine_ItemID" and "WMSLot_LotNumber"=coalesce(nullif(trim(v_input->>'lotNumber'),''),v_line."WMSOrderLine_LotNumber",nullif(trim(v_input->>'batchNumber'),'')) limit 1; if v_lot_id is null then v_lot_id:=gen_random_uuid(); insert into public."WMS_InventoryLots" ("WMSLot_ID","WMSLot_FacilityID","WMSLot_CustomerOrgID","WMSLot_ItemID","WMSLot_LotNumber","WMSLot_BatchNumber","WMSLot_ManufactureDate","WMSLot_ExpiryDate","WMSLot_CustomsStatusCode","WMSLot_AttributesJSON","WMSLot_CreatedAt") values(v_lot_id,v_order."WMSOrder_FacilityID",v_order."WMSOrder_CustomerOrgID",v_line."WMSOrderLine_ItemID",coalesce(nullif(trim(v_input->>'lotNumber'),''),v_line."WMSOrderLine_LotNumber",trim(v_input->>'batchNumber')),coalesce(nullif(trim(v_input->>'batchNumber'),''),nullif(trim(v_input->>'lotNumber'),'')),nullif(v_input->>'manufactureDate','')::date,coalesce(nullif(v_input->>'expiryDate','')::date,v_line."WMSOrderLine_ExpiryDate"),v_line."WMSOrderLine_CustomsStatusCode",'{}',v_now); end if; end if;
      foreach v_status in array array['available','damaged'] loop v_good := case when v_status='available' then v_quantity-v_damaged else v_damaged end; if v_good<=0 then continue; end if; select * into v_balance from public."WMS_InventoryBalances" where "WMSBalance_FacilityID"=v_order."WMSOrder_FacilityID" and "WMSBalance_CustomerOrgID"=v_order."WMSOrder_CustomerOrgID" and "WMSBalance_ItemID"=v_line."WMSOrderLine_ItemID" and "WMSBalance_LocationID"=v_location_id and "WMSBalance_LotID" is not distinct from v_lot_id and "WMSBalance_InventoryStatusCode"=v_status and "WMSBalance_CustomsStatusCode"=v_line."WMSOrderLine_CustomsStatusCode" and "WMSBalance_UOMCode"=v_line."WMSOrderLine_UOMCode" for update; if not found then v_balance_id:=gen_random_uuid(); v_before:=0; insert into public."WMS_InventoryBalances" ("WMSBalance_ID","WMSBalance_FacilityID","WMSBalance_CustomerOrgID","WMSBalance_ItemID","WMSBalance_LocationID","WMSBalance_LotID","WMSBalance_InventoryStatusCode","WMSBalance_CustomsStatusCode","WMSBalance_UOMCode","WMSBalance_OnHandQuantity","WMSBalance_ReservedQuantity","WMSBalance_AllocatedQuantity","WMSBalance_HeldQuantity","WMSBalance_AvailableQuantity","WMSBalance_FirstReceiptAt","WMSBalance_LastMovementAt","WMSBalance_IsBonded","WMSBalance_MetadataJSON","WMSBalance_CreatedAt","WMSBalance_UpdatedAt") values(v_balance_id,v_order."WMSOrder_FacilityID",v_order."WMSOrder_CustomerOrgID",v_line."WMSOrderLine_ItemID",v_location_id,v_lot_id,v_status,v_line."WMSOrderLine_CustomsStatusCode",v_line."WMSOrderLine_UOMCode",v_good,0,0,case when v_status='damaged' then v_good else 0 end,case when v_status='available' then v_good else 0 end,v_now,v_now,v_line."WMSOrderLine_CustomsStatusCode"<>'free_circulation','{}',v_now,v_now); else v_balance_id:=v_balance."WMSBalance_ID"; v_before:=v_balance."WMSBalance_OnHandQuantity"; update public."WMS_InventoryBalances" set "WMSBalance_OnHandQuantity"="WMSBalance_OnHandQuantity"+v_good,"WMSBalance_HeldQuantity"="WMSBalance_HeldQuantity"+case when v_status='damaged' then v_good else 0 end,"WMSBalance_AvailableQuantity"=greatest(0,"WMSBalance_OnHandQuantity"+v_good-"WMSBalance_ReservedQuantity"-"WMSBalance_AllocatedQuantity"-("WMSBalance_HeldQuantity"+case when v_status='damaged' then v_good else 0 end)),"WMSBalance_LastMovementAt"=v_now,"WMSBalance_UpdatedAt"=v_now where "WMSBalance_ID"=v_balance_id; end if; v_transaction_id:=gen_random_uuid(); v_primary_transaction_id:=coalesce(v_primary_transaction_id,v_transaction_id); insert into public."WMS_InventoryTransactions" ("WMSTransaction_ID","WMSTransaction_FacilityID","WMSTransaction_BalanceID","WMSTransaction_TypeCode","WMSTransaction_ItemID","WMSTransaction_CustomerOrgID","WMSTransaction_ToLocationID","WMSTransaction_LotID","WMSTransaction_Quantity","WMSTransaction_UOMCode","WMSTransaction_BeforeOnHandQuantity","WMSTransaction_AfterOnHandQuantity","WMSTransaction_InventoryStatusCode","WMSTransaction_CustomsStatusCode","WMSTransaction_OrderID","WMSTransaction_OrderLineID","WMSTransaction_ReceiptID","WMSTransaction_SourceTable","WMSTransaction_SourceID","WMSTransaction_Reference","WMSTransaction_Notes","WMSTransaction_MetadataJSON","WMSTransaction_CreatedAt","WMSTransaction_CreatedBy") values(v_transaction_id,v_order."WMSOrder_FacilityID",v_balance_id,'receipt',v_line."WMSOrderLine_ItemID",v_order."WMSOrder_CustomerOrgID",v_location_id,v_lot_id,v_good,v_line."WMSOrderLine_UOMCode",v_before,v_before+v_good,v_status,v_line."WMSOrderLine_CustomsStatusCode",p_order_id,v_line."WMSOrderLine_ID",v_receipt_id,'WMS_Receipts',v_receipt_id,v_number,nullif(trim(p_payload->>'notes'),''),'{}',v_now,p_actor_user_id); end loop;
      insert into public."WMS_ReceiptLines" ("WMSReceiptLine_ID","WMSReceiptLine_ReceiptID","WMSReceiptLine_OrderLineID","WMSReceiptLine_ItemID","WMSReceiptLine_LineNo","WMSReceiptLine_ExpectedQuantity","WMSReceiptLine_ReceivedQuantity","WMSReceiptLine_DamagedQuantity","WMSReceiptLine_OverQuantity","WMSReceiptLine_ShortQuantity","WMSReceiptLine_UOMCode","WMSReceiptLine_LotNumber","WMSReceiptLine_ExpiryDate","WMSReceiptLine_TargetLocationID","WMSReceiptLine_InventoryTransactionID","WMSReceiptLine_CustomsStatusCode","WMSReceiptLine_CreatedAt") values(gen_random_uuid(),v_receipt_id,v_line."WMSOrderLine_ID",v_line."WMSOrderLine_ItemID",v_index,greatest(0,v_line."WMSOrderLine_OrderedQuantity"-v_line."WMSOrderLine_ReceivedQuantity"),v_quantity,v_damaged,greatest(0,v_quantity-(v_line."WMSOrderLine_OrderedQuantity"-v_line."WMSOrderLine_ReceivedQuantity")),greatest(0,(v_line."WMSOrderLine_OrderedQuantity"-v_line."WMSOrderLine_ReceivedQuantity")-v_quantity),v_line."WMSOrderLine_UOMCode",(select "WMSLot_LotNumber" from public."WMS_InventoryLots" where "WMSLot_ID"=v_lot_id),coalesce(nullif(v_input->>'expiryDate','')::date,v_line."WMSOrderLine_ExpiryDate"),v_location_id,v_primary_transaction_id,v_line."WMSOrderLine_CustomsStatusCode",v_now);
      if v_damaged>0 or v_quantity>v_line."WMSOrderLine_OrderedQuantity"-v_line."WMSOrderLine_ReceivedQuantity" then update public."WMS_Receipts" set "WMSReceipt_HasDiscrepancy"=true where "WMSReceipt_ID"=v_receipt_id; end if;
      update public."WMS_OrderLines" set "WMSOrderLine_ReceivedQuantity"="WMSOrderLine_ReceivedQuantity"+v_quantity,"WMSOrderLine_StatusCode"=case when "WMSOrderLine_ReceivedQuantity"+v_quantity >= "WMSOrderLine_OrderedQuantity" then 'received' else 'open' end where "WMSOrderLine_ID"=v_line."WMSOrderLine_ID";
    end loop;
  elsif p_action = 'dispatch' then
    if v_order."WMSOrder_TypeCode" <> 'outbound' then raise exception 'WMS400: Only outbound orders can be dispatched.'; end if;
    v_dispatch_id:=gen_random_uuid(); v_number:='DSP-'||to_char(v_now,'YYYYMMDD-HH24MISS')||'-'||lpad((floor(random()*9000)+1000)::int::text,4,'0'); insert into public."WMS_Dispatches" ("WMSDispatch_ID","WMSDispatch_FacilityID","WMSDispatch_OrderID","WMSDispatch_JobID","WMSDispatch_DispatchNumber","WMSDispatch_StatusCode","WMSDispatch_VehicleReg","WMSDispatch_ContainerNumber","WMSDispatch_SealNumber","WMSDispatch_DispatchedAt","WMSDispatch_DispatchedBy","WMSDispatch_MetadataJSON","WMSDispatch_CreatedAt") values(v_dispatch_id,v_order."WMSOrder_FacilityID",p_order_id,v_order."WMSOrder_JobID",v_number,'complete',coalesce(nullif(trim(p_payload->>'vehicleReg'),''),v_order."WMSOrder_VehicleReg"),coalesce(upper(nullif(trim(p_payload->>'containerNumber'),'')),v_order."WMSOrder_ContainerNumber"),coalesce(nullif(trim(p_payload->>'sealNumber'),''),v_order."WMSOrder_SealNumber"),v_now,p_actor_user_id,jsonb_build_object('notes',nullif(trim(p_payload->>'notes'),'')),v_now);
    for v_input in select value from jsonb_array_elements(p_payload->'lines') loop select * into v_line from public."WMS_OrderLines" where "WMSOrderLine_ID"=(v_input->>'orderLineId')::uuid and "WMSOrderLine_OrderID"=p_order_id for update; if not found then raise exception 'WMS400: A dispatch line does not belong to this order.'; end if; v_quantity:=(v_input->>'quantity')::numeric; if v_quantity<=0 or v_quantity>v_line."WMSOrderLine_OrderedQuantity"-v_line."WMSOrderLine_DispatchedQuantity" then raise exception 'WMS400: Check the dispatch quantity.'; end if; v_remaining:=v_quantity; for v_balance in select * from public."WMS_InventoryBalances" where "WMSBalance_FacilityID"=v_order."WMSOrder_FacilityID" and "WMSBalance_CustomerOrgID"=v_order."WMSOrder_CustomerOrgID" and "WMSBalance_ItemID"=v_line."WMSOrderLine_ItemID" and "WMSBalance_InventoryStatusCode"='available' and "WMSBalance_CustomsStatusCode"=v_line."WMSOrderLine_CustomsStatusCode" and "WMSBalance_AvailableQuantity">0 and ((v_input->>'sourceLocationId') is null or "WMSBalance_LocationID"=(v_input->>'sourceLocationId')::uuid) and ((v_input->>'lotId') is null or "WMSBalance_LotID"=(v_input->>'lotId')::uuid) order by "WMSBalance_FirstReceiptAt" for update loop exit when v_remaining<=0; v_take:=least(v_remaining,v_balance."WMSBalance_AvailableQuantity"); v_before:=v_balance."WMSBalance_OnHandQuantity"; update public."WMS_InventoryBalances" set "WMSBalance_OnHandQuantity"="WMSBalance_OnHandQuantity"-v_take,"WMSBalance_AvailableQuantity"=greatest(0,"WMSBalance_AvailableQuantity"-v_take),"WMSBalance_LastMovementAt"=v_now,"WMSBalance_UpdatedAt"=v_now where "WMSBalance_ID"=v_balance."WMSBalance_ID"; insert into public."WMS_InventoryTransactions" ("WMSTransaction_ID","WMSTransaction_FacilityID","WMSTransaction_BalanceID","WMSTransaction_TypeCode","WMSTransaction_ItemID","WMSTransaction_CustomerOrgID","WMSTransaction_FromLocationID","WMSTransaction_LotID","WMSTransaction_Quantity","WMSTransaction_UOMCode","WMSTransaction_BeforeOnHandQuantity","WMSTransaction_AfterOnHandQuantity","WMSTransaction_InventoryStatusCode","WMSTransaction_CustomsStatusCode","WMSTransaction_OrderID","WMSTransaction_OrderLineID","WMSTransaction_SourceTable","WMSTransaction_SourceID","WMSTransaction_Reference","WMSTransaction_Notes","WMSTransaction_MetadataJSON","WMSTransaction_CreatedAt","WMSTransaction_CreatedBy") values(gen_random_uuid(),v_order."WMSOrder_FacilityID",v_balance."WMSBalance_ID",'dispatch',v_line."WMSOrderLine_ItemID",v_order."WMSOrder_CustomerOrgID",v_balance."WMSBalance_LocationID",v_balance."WMSBalance_LotID",v_take,v_line."WMSOrderLine_UOMCode",v_before,v_before-v_take,'available',v_line."WMSOrderLine_CustomsStatusCode",p_order_id,v_line."WMSOrderLine_ID",'WMS_Dispatches',v_dispatch_id,v_number,nullif(trim(p_payload->>'notes'),''),'{}',v_now,p_actor_user_id); v_remaining:=v_remaining-v_take; end loop; if v_remaining>0 then raise exception 'WMS409: There is not enough available stock to complete this dispatch.'; end if; update public."WMS_OrderLines" set "WMSOrderLine_AllocatedQuantity"=greatest("WMSOrderLine_AllocatedQuantity","WMSOrderLine_DispatchedQuantity"+v_quantity),"WMSOrderLine_PickedQuantity"=greatest("WMSOrderLine_PickedQuantity","WMSOrderLine_DispatchedQuantity"+v_quantity),"WMSOrderLine_PackedQuantity"=greatest("WMSOrderLine_PackedQuantity","WMSOrderLine_DispatchedQuantity"+v_quantity),"WMSOrderLine_DispatchedQuantity"="WMSOrderLine_DispatchedQuantity"+v_quantity,"WMSOrderLine_StatusCode"=case when "WMSOrderLine_DispatchedQuantity"+v_quantity >= "WMSOrderLine_OrderedQuantity" then 'dispatched' else 'open' end where "WMSOrderLine_ID"=v_line."WMSOrderLine_ID"; end loop;
  else raise exception 'WMS400: Unsupported warehouse order action.'; end if;
  select case when v_order."WMSOrder_TypeCode"='inbound' then bool_and("WMSOrderLine_ReceivedQuantity">="WMSOrderLine_OrderedQuantity") else bool_and("WMSOrderLine_DispatchedQuantity">="WMSOrderLine_OrderedQuantity") end into v_complete from public."WMS_OrderLines" where "WMSOrderLine_OrderID"=p_order_id;
  update public."WMS_Orders" set "WMSOrder_StatusCode"=case when v_complete then 'complete' else 'part_complete' end,"WMSOrder_UpdatedAt"=v_now,"WMSOrder_UpdatedBy"=p_actor_user_id where "WMSOrder_ID"=p_order_id;
  return p_order_id;
end;
$$;

revoke all on function public.warehouse_edge_order_mutation(text,uuid,jsonb,uuid,uuid,uuid[],uuid[]) from public, anon, authenticated;
grant execute on function public.warehouse_edge_order_mutation(text,uuid,jsonb,uuid,uuid,uuid[],uuid[]) to service_role;

create or replace function public.warehouse_edge_portal_users(p_customer_org_id uuid)
returns jsonb language sql security definer set search_path=public,pg_temp as $$
  with facilities as (
    select coalesce(jsonb_agg("WMSCustomerFacilityAccess_FacilityID" order by "WMSCustomerFacilityAccess_FacilityID"), '[]'::jsonb) ids
    from public."WMS_CustomerFacilityAccess" where "WMSCustomerFacilityAccess_CustomerOrgID"=p_customer_org_id and "WMSCustomerFacilityAccess_IsActive"
  ), users as (
    select u."PortalUser_ID",u."PortalUser_DisplayName",u."PortalUser_Email",u."PortalUser_StatusCode",u."PortalUser_LastLoginAt",
      coalesce((select r."PortalRole_Code" from public."Portal_UserRoles" ur join public."Portal_Roles" r on r."PortalRole_ID"=ur."PortalUserRole_RoleID" where ur."PortalUserRole_PortalUserID"=u."PortalUser_ID" and ur."PortalUserRole_OrgID"=p_customer_org_id and ur."PortalUserRole_StatusCode"='active' limit 1),'warehouse_viewer') role_code
    from public."Portal_UserOrganisations" uo join public."Portal_Users" u on u."PortalUser_ID"=uo."PortalUserOrg_PortalUserID"
    where uo."PortalUserOrg_OrgID"=p_customer_org_id and uo."PortalUserOrg_StatusCode"<>'revoked' and not u."PortalUser_IsDeleted"
  ) select coalesce(jsonb_agg(jsonb_build_object('id',"PortalUser_ID",'displayName',"PortalUser_DisplayName",'email',"PortalUser_Email",'status',"PortalUser_StatusCode",'roleCode',role_code,'facilityIds',facilities.ids,'lastLoginAt',"PortalUser_LastLoginAt") order by "PortalUser_DisplayName"),'[]'::jsonb) from users cross join facilities;
$$;
revoke all on function public.warehouse_edge_portal_users(uuid) from public,anon,authenticated;
grant execute on function public.warehouse_edge_portal_users(uuid) to service_role;

create or replace function public.warehouse_edge_portal_mutation(p_action text,p_customer_org_id uuid,p_portal_user_id uuid,p_payload jsonb,p_actor_user_id uuid,p_actor_portal_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user_id uuid:=p_portal_user_id; v_role_id uuid; v_site_id uuid; v_role_code text:=lower(trim(p_payload->>'roleCode')); v_email text:=lower(trim(p_payload->>'email')); v_facilities uuid[]; v_result jsonb; v_now timestamptz:=now(); v_invited boolean:=false;
begin
  if p_action in ('invite','update') and v_role_code not in ('warehouse_viewer','warehouse_operator','warehouse_customer_admin') then raise exception 'WMS400: Choose a valid warehouse customer role.'; end if;
  select "PortalSite_ID" into v_site_id from public."Portal_Sites" where "PortalSite_SiteTypeCode"='warehouse_customer' and "PortalSite_IsActive" and not "PortalSite_IsDeleted" order by "PortalSite_CreatedAt" limit 1;
  if v_site_id is null then
    v_site_id:=gen_random_uuid(); insert into public."Portal_Sites" ("PortalSite_ID","PortalSite_Code","PortalSite_Name","PortalSite_Description","PortalSite_SiteTypeCode","PortalSite_DefaultAudienceTypeCode","PortalSite_DefaultLanguageCode","PortalSite_DefaultTimeZone","PortalSite_AllowedAuthMethodsJSON","PortalSite_FieldPolicyJSON","PortalSite_FeatureFlagsJSON","PortalSite_IsActive","PortalSite_CreatedAt","PortalSite_CreatedBy","PortalSite_UpdatedAt","PortalSite_UpdatedBy","PortalSite_IsDeleted") values(v_site_id,'warehouse-'||replace(gen_random_uuid()::text,'-',''),'Warehouse customer portal','Customer self-service inventory and warehouse requests.','warehouse_customer','customer','en-GB','UTC','["password","magic_link"]','{}','{"warehouse":true}',true,v_now,p_actor_user_id,v_now,p_actor_user_id,false);
  end if;
  select "PortalRole_ID" into v_role_id from public."Portal_Roles" where "PortalRole_SiteID"=v_site_id and "PortalRole_Code"=v_role_code limit 1;
  if v_role_id is null and p_action in ('invite','update') then v_role_id:=gen_random_uuid(); insert into public."Portal_Roles" ("PortalRole_ID","PortalRole_SiteID","PortalRole_Code","PortalRole_Name","PortalRole_Description","PortalRole_AudienceTypeCode","PortalRole_IsSystemRole","PortalRole_IsEnabled","PortalRole_CreatedAt","PortalRole_CreatedBy") values(v_role_id,v_site_id,v_role_code,replace(initcap(replace(v_role_code,'_',' ')),'Warehouse Warehouse','Warehouse'),'Warehouse customer access.','customer',true,true,v_now,p_actor_user_id); end if;
  if p_action in ('invite','update') then
    insert into public."Portal_RolePermissions" ("PortalRolePerm_ID","PortalRolePerm_RoleID","PortalRolePerm_ResourceTypeCode","PortalRolePerm_ActionCode","PortalRolePerm_IsAllowed","PortalRolePerm_RequiresExplicitShare","PortalRolePerm_RequiresInternalReview","PortalRolePerm_FieldAllowListJSON","PortalRolePerm_FieldDenyListJSON","PortalRolePerm_CreatedAt")
    select gen_random_uuid(),v_role_id,grant_row.resource_code,grant_row.action_code,true,false,false,'[]','[]',v_now
    from (values
      ('warehouse_inventory','read','warehouse_viewer'),('warehouse_items','read','warehouse_viewer'),('warehouse_orders','read','warehouse_viewer'),
      ('warehouse_inventory','read','warehouse_operator'),('warehouse_items','read','warehouse_operator'),('warehouse_items','manage','warehouse_operator'),('warehouse_orders','read','warehouse_operator'),('warehouse_orders','create_inbound','warehouse_operator'),('warehouse_orders','create_outbound','warehouse_operator'),('warehouse_orders','cancel','warehouse_operator'),('warehouse_documents','upload','warehouse_operator'),
      ('warehouse_inventory','read','warehouse_customer_admin'),('warehouse_items','read','warehouse_customer_admin'),('warehouse_items','manage','warehouse_customer_admin'),('warehouse_orders','read','warehouse_customer_admin'),('warehouse_orders','create_inbound','warehouse_customer_admin'),('warehouse_orders','create_outbound','warehouse_customer_admin'),('warehouse_orders','cancel','warehouse_customer_admin'),('warehouse_documents','upload','warehouse_customer_admin'),('warehouse_users','manage','warehouse_customer_admin')
    ) grant_row(resource_code,action_code,role_code)
    where grant_row.role_code=v_role_code and not exists(select 1 from public."Portal_RolePermissions" existing where existing."PortalRolePerm_RoleID"=v_role_id and existing."PortalRolePerm_ResourceTypeCode"=grant_row.resource_code and existing."PortalRolePerm_ActionCode"=grant_row.action_code);
  end if;
  if p_action='invite' then
    if v_email is null or position('@' in v_email)=0 then raise exception 'WMS400: Enter a valid customer email address.'; end if;
    select "PortalUser_ID" into v_user_id from public."Portal_Users" where lower("PortalUser_Email")=v_email limit 1;
    if v_user_id is null then
      if nullif(p_payload->>'authUserId','') is null then raise exception 'WMS409: The Supabase invitation did not return a user identity.'; end if;
      v_user_id:=gen_random_uuid(); v_invited:=true;
      insert into public."Portal_Users" ("PortalUser_ID","PortalUser_DefaultSiteID","PortalUser_AudienceTypeCode","PortalUser_StatusCode","PortalUser_PrimaryOrgID","PortalUser_DisplayName","PortalUser_Email","PortalUser_PreferredLanguageCode","PortalUser_MFARequired","PortalUser_FailedLoginCount","PortalUser_ValidFrom","PortalUser_PreferencesJSON","PortalUser_CreatedAt","PortalUser_CreatedBy","PortalUser_UpdatedAt","PortalUser_UpdatedBy","PortalUser_IsDeleted") values(v_user_id,v_site_id,'customer','active',p_customer_org_id,coalesce(nullif(trim(p_payload->>'displayName'),''),v_email),v_email,'en-GB',false,0,v_now,'{}',v_now,p_actor_user_id,v_now,p_actor_user_id,false);
      insert into public."Portal_ExternalIdentities" ("PortalIdentity_ID","PortalIdentity_PortalUserID","PortalIdentity_AuthProviderCode","PortalIdentity_ExternalSubject","PortalIdentity_ExternalUsername","PortalIdentity_EmailSnapshot","PortalIdentity_StatusCode","PortalIdentity_MetadataJSON","PortalIdentity_CreatedAt","PortalIdentity_UpdatedAt") values(gen_random_uuid(),v_user_id,'supabase',p_payload->>'authUserId',v_email,v_email,'active','{}',v_now,v_now);
    end if;
  elsif p_action='revoke' then
    if v_user_id=p_actor_portal_user_id then raise exception 'WMS400: You cannot revoke your own portal access.'; end if;
    update public."Portal_UserOrganisations" set "PortalUserOrg_StatusCode"='revoked' where "PortalUserOrg_PortalUserID"=v_user_id and "PortalUserOrg_OrgID"=p_customer_org_id;
    update public."Portal_UserRoles" set "PortalUserRole_StatusCode"='revoked' where "PortalUserRole_PortalUserID"=v_user_id and "PortalUserRole_OrgID"=p_customer_org_id;
    return null;
  end if;
  if v_user_id is null then raise exception 'WMS400: This customer portal user does not exist.'; end if;
  insert into public."Portal_UserOrganisations" ("PortalUserOrg_ID","PortalUserOrg_PortalUserID","PortalUserOrg_OrgID","PortalUserOrg_AudienceTypeCode","PortalUserOrg_StatusCode","PortalUserOrg_IsPrimary","PortalUserOrg_CanManageOrgUsers","PortalUserOrg_FieldPolicyJSON","PortalUserOrg_CreatedAt","PortalUserOrg_CreatedBy") values(gen_random_uuid(),v_user_id,p_customer_org_id,'customer','active',true,v_role_code='warehouse_customer_admin','{}',v_now,p_actor_user_id) on conflict ("PortalUserOrg_PortalUserID","PortalUserOrg_OrgID") do update set "PortalUserOrg_StatusCode"='active',"PortalUserOrg_CanManageOrgUsers"=excluded."PortalUserOrg_CanManageOrgUsers";
  update public."Portal_UserRoles" set "PortalUserRole_StatusCode"='revoked' where "PortalUserRole_PortalUserID"=v_user_id and "PortalUserRole_OrgID"=p_customer_org_id;
  insert into public."Portal_UserRoles" ("PortalUserRole_ID","PortalUserRole_PortalUserID","PortalUserRole_RoleID","PortalUserRole_SiteID","PortalUserRole_OrgID","PortalUserRole_StatusCode","PortalUserRole_ValidFrom","PortalUserRole_AssignedAt","PortalUserRole_AssignedBy") values(gen_random_uuid(),v_user_id,v_role_id,v_site_id,p_customer_org_id,'active',v_now,v_now,p_actor_user_id);
  if p_actor_user_id is not null and jsonb_typeof(p_payload->'facilityIds')='array' then
    select array_agg(value::uuid) into v_facilities from jsonb_array_elements_text(p_payload->'facilityIds'); if coalesce(array_length(v_facilities,1),0)=0 then raise exception 'WMS400: Choose at least one warehouse for this customer.'; end if;
    update public."WMS_CustomerFacilityAccess" set "WMSCustomerFacilityAccess_IsActive"=("WMSCustomerFacilityAccess_FacilityID"=any(v_facilities)),"WMSCustomerFacilityAccess_UpdatedAt"=v_now where "WMSCustomerFacilityAccess_CustomerOrgID"=p_customer_org_id;
    insert into public."WMS_CustomerFacilityAccess" ("WMSCustomerFacilityAccess_ID","WMSCustomerFacilityAccess_CustomerOrgID","WMSCustomerFacilityAccess_FacilityID","WMSCustomerFacilityAccess_IsActive","WMSCustomerFacilityAccess_CreatedAt","WMSCustomerFacilityAccess_CreatedBy","WMSCustomerFacilityAccess_UpdatedAt") select gen_random_uuid(),p_customer_org_id,f,true,v_now,p_actor_user_id,v_now from unnest(v_facilities) f on conflict ("WMSCustomerFacilityAccess_CustomerOrgID","WMSCustomerFacilityAccess_FacilityID") do update set "WMSCustomerFacilityAccess_IsActive"=true,"WMSCustomerFacilityAccess_UpdatedAt"=v_now;
  end if;
  select public.warehouse_edge_portal_users(p_customer_org_id) into v_result;
  select value into v_result from jsonb_array_elements(v_result) where value->>'id'=v_user_id::text limit 1;
  return case when p_action='invite' then jsonb_build_object('user',v_result,'invited',v_invited) else v_result end;
end; $$;
revoke all on function public.warehouse_edge_portal_mutation(text,uuid,uuid,jsonb,uuid,uuid) from public,anon,authenticated;
grant execute on function public.warehouse_edge_portal_mutation(text,uuid,uuid,jsonb,uuid,uuid) to service_role;
