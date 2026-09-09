-- Moving a booking on the warehouse calendar needs somewhere to write the new slot.
-- Before this, the order mutation boundary could create and cancel an order and post
-- receipts and dispatches, but nothing could change an appointment once it was booked,
-- so a dragged event had no way to persist.
--
-- `reschedule` writes only the appointment window. It deliberately leaves
-- WMSOrder_RequestedDate alone: that is the date the customer asked for, and moving the
-- slot the warehouse booked must not rewrite the request it was booked against.
--
-- The function is restated in full because `create or replace` replaces the whole body.
-- The only change from 202608020001 is the `reschedule` branch.

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

  if p_action = 'reschedule' then
    if nullif(p_payload->>'appointmentStartAt','') is null or nullif(p_payload->>'appointmentEndAt','') is null then raise exception 'WMS400: A slot needs both a start and an end.'; end if;
    if (p_payload->>'appointmentEndAt')::timestamptz <= (p_payload->>'appointmentStartAt')::timestamptz then raise exception 'WMS400: A slot has to end after it starts.'; end if;
    update public."WMS_Orders" set "WMSOrder_AppointmentStartAt"=(p_payload->>'appointmentStartAt')::timestamptz,"WMSOrder_AppointmentEndAt"=(p_payload->>'appointmentEndAt')::timestamptz,"WMSOrder_UpdatedAt"=v_now,"WMSOrder_UpdatedBy"=p_actor_user_id where "WMSOrder_ID"=p_order_id;
    -- The inbound advice quotes the same slot back to the customer, so it moves with it.
    update public."WMS_InboundAdvices" set "WMSAdvice_ExpectedArrivalAt"=(p_payload->>'appointmentStartAt')::timestamptz where "WMSAdvice_OrderID"=p_order_id;
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
