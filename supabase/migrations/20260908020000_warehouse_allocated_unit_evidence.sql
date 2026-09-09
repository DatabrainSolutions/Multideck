begin;
create function public._warehouse_edge_task_balance_quantity(p_quantity numeric,p_task_uom text,p_balance_uom text,p_metadata jsonb)
returns numeric language plpgsql immutable set search_path='' as $$
declare conversion jsonb:=p_metadata->'quantityConversion'; result numeric; task_factor numeric; balance_factor numeric;
begin
  if p_quantity is null or p_quantity<0 or p_quantity::text in ('NaN','Infinity','-Infinity') then raise exception 'WMS400: Check the task quantity.'; end if;
  if conversion is null then
    if p_task_uom is distinct from p_balance_uom then raise exception 'WMS409: This older task needs its unit conversion reviewed before stock can move.'; end if;
    result:=p_quantity;
  else
    if conversion->>'taskUom' is distinct from p_task_uom or conversion->>'balanceUom' is distinct from p_balance_uom then raise exception 'WMS409: Task and stock units changed after allocation.'; end if;
    task_factor:=(conversion->>'taskFactor')::numeric; balance_factor:=(conversion->>'balanceFactor')::numeric;
    if task_factor is null or balance_factor is null or task_factor<=0 or balance_factor<=0 or task_factor::text in ('NaN','Infinity','-Infinity') or balance_factor::text in ('NaN','Infinity','-Infinity') then raise exception 'WMS409: Task conversion evidence is invalid.'; end if;
    result:=p_quantity*task_factor/balance_factor;
  end if;
  if result<>round(result,6) then raise exception 'WMS409: This quantity cannot be represented in the stock unit. Repack stock into a suitable unit first.'; end if;
  return result;
end;
$$;
revoke all on function public._warehouse_edge_task_balance_quantity(numeric,text,text,jsonb) from public,anon,authenticated;
grant execute on function public._warehouse_edge_task_balance_quantity(numeric,text,text,jsonb) to service_role;

create or replace function public.warehouse_edge_release_order_mutation(
  p_order_id uuid, p_payload jsonb, p_actor_user_id uuid,
  p_allowed_facility_ids uuid[], p_allowed_organisation_ids uuid[]
) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  v_order public."WMS_Orders"%rowtype; v_line public."WMS_OrderLines"%rowtype; v_balance public."WMS_InventoryBalances"%rowtype;
  v_request_id uuid:=nullif(p_payload->>'requestId','')::uuid; v_needed numeric; v_balance_take numeric; v_conversion jsonb; v_base_uom text; v_take numeric; v_task_id uuid; v_now timestamptz:=now();
begin
  if p_actor_user_id is null then raise exception 'WMS403: Outbound release is reserved for the warehouse team.'; end if;
  if v_request_id is null then raise exception 'WMS400: A request identifier is required.'; end if;
  select * into v_order from public."WMS_Orders" where "WMSOrder_ID"=p_order_id and "WMSOrder_FacilityID"=any(coalesce(p_allowed_facility_ids,'{}'::uuid[])) and "WMSOrder_CustomerOrgID"=any(coalesce(p_allowed_organisation_ids,'{}'::uuid[])) and not "WMSOrder_IsDeleted" for update;
  if not found then raise exception 'WMS404: This warehouse order does not exist in your workspace.'; end if;
  if v_order."WMSOrder_TypeCode"<>'outbound' or v_order."WMSOrder_StatusCode" in ('complete','cancelled') then raise exception 'WMS409: This outbound order cannot be released.'; end if;
  if coalesce(v_order."WMSOrder_MetadataJSON"->'releaseRequestIds','[]'::jsonb) ? v_request_id::text then return p_order_id; end if;
  for v_line in select * from public."WMS_OrderLines" where "WMSOrderLine_OrderID"=p_order_id and "WMSOrderLine_StatusCode"<>'cancelled' order by "WMSOrderLine_LineNo" for update loop
    v_needed:=v_line."WMSOrderLine_OrderedQuantity"-v_line."WMSOrderLine_AllocatedQuantity";
    if v_needed<=0 then continue; end if;
    for v_balance in select * from public."WMS_InventoryBalances" where "WMSBalance_FacilityID"=v_order."WMSOrder_FacilityID" and "WMSBalance_CustomerOrgID"=v_order."WMSOrder_CustomerOrgID" and "WMSBalance_ItemID"=v_line."WMSOrderLine_ItemID" and "WMSBalance_InventoryStatusCode"='available' and "WMSBalance_CustomsStatusCode"=v_line."WMSOrderLine_CustomsStatusCode" and "WMSBalance_AvailableQuantity">0 and (v_line."WMSOrderLine_SourceLocationID" is null or "WMSBalance_LocationID"=v_line."WMSOrderLine_SourceLocationID") order by "WMSBalance_FirstReceiptAt", "WMSBalance_ID" for update loop
      exit when v_needed<=0;
      select "WMSItem_BaseUOMCode" into v_base_uom from public."WMS_Items" where "WMSItem_ID"=v_line."WMSOrderLine_ItemID" for share;
      v_conversion:=jsonb_build_object('taskUom',v_line."WMSOrderLine_UOMCode",'balanceUom',v_balance."WMSBalance_UOMCode",
        'taskFactor',public._warehouse_edge_quantity_in_uom(v_line."WMSOrderLine_ItemID",1,v_line."WMSOrderLine_UOMCode",v_base_uom),
        'balanceFactor',public._warehouse_edge_quantity_in_uom(v_line."WMSOrderLine_ItemID",1,v_balance."WMSBalance_UOMCode",v_base_uom));
      v_take:=least(v_needed,v_balance."WMSBalance_AvailableQuantity"*(v_conversion->>'balanceFactor')::numeric/(v_conversion->>'taskFactor')::numeric);
      if v_take<>round(v_take,6) then raise exception 'WMS409: Allocated quantity exceeds task unit precision. Repack stock first.'; end if;
      v_balance_take:=public._warehouse_edge_task_balance_quantity(v_take,v_line."WMSOrderLine_UOMCode",v_balance."WMSBalance_UOMCode",jsonb_build_object('quantityConversion',v_conversion));
      v_task_id:=gen_random_uuid();
      update public."WMS_InventoryBalances" set "WMSBalance_AllocatedQuantity"="WMSBalance_AllocatedQuantity"+v_balance_take,"WMSBalance_AvailableQuantity"="WMSBalance_AvailableQuantity"-v_balance_take,"WMSBalance_UpdatedAt"=v_now where "WMSBalance_ID"=v_balance."WMSBalance_ID";
      insert into public."WMS_Tasks" ("WMSTask_ID","WMSTask_FacilityID","WMSTask_OrderID","WMSTask_OrderLineID","WMSTask_JobID","WMSTask_TypeCode","WMSTask_StatusCode","WMSTask_PriorityCode","WMSTask_Title","WMSTask_Instructions","WMSTask_SourceLocationID","WMSTask_TargetLocationID","WMSTask_ItemID","WMSTask_BalanceID","WMSTask_HU_ID","WMSTask_Quantity","WMSTask_CompletedQuantity","WMSTask_UOMCode","WMSTask_LotID","WMSTask_MetadataJSON","WMSTask_CreatedBy")
      values(v_task_id,v_order."WMSOrder_FacilityID",p_order_id,v_line."WMSOrderLine_ID",v_order."WMSOrder_JobID",'pick','queued',v_order."WMSOrder_PriorityCode",'Pick stock for '||v_order."WMSOrder_OrderNumber",'Scan the source location and item before confirming the pick.',v_balance."WMSBalance_LocationID",v_line."WMSOrderLine_TargetLocationID",v_line."WMSOrderLine_ItemID",v_balance."WMSBalance_ID",v_balance."WMSBalance_HU_ID",v_take,0,v_line."WMSOrderLine_UOMCode",v_balance."WMSBalance_LotID",jsonb_build_object('releaseRequestId',v_request_id,'dispatchedQuantity',0,'quantityConversion',v_conversion),p_actor_user_id);
      insert into public."WMS_PickTasks" ("WMSPick_ID","WMSPick_TaskID","WMSPick_OrderLineID","WMSPick_BalanceID","WMSPick_SourceLocationID","WMSPick_TargetLocationID","WMSPick_QuantityToPick","WMSPick_QuantityPicked","WMSPick_UOMCode","WMSPick_StatusCode") values(gen_random_uuid(),v_task_id,v_line."WMSOrderLine_ID",v_balance."WMSBalance_ID",v_balance."WMSBalance_LocationID",v_line."WMSOrderLine_TargetLocationID",v_take,0,v_line."WMSOrderLine_UOMCode",'queued');
      insert into public."WMS_TaskEvents" ("WMSTaskEvent_TaskID","WMSTaskEvent_EventTypeCode","WMSTaskEvent_ToStatusCode","WMSTaskEvent_MetadataJSON","WMSTaskEvent_EventBy") values(v_task_id,'created','queued',jsonb_build_object('releaseRequestId',v_request_id),p_actor_user_id);
      v_needed:=v_needed-v_take;
    end loop;
    if v_needed>0 then raise exception 'WMS409: There is not enough available stock to release this order.'; end if;
    update public."WMS_OrderLines" set "WMSOrderLine_AllocatedQuantity"="WMSOrderLine_OrderedQuantity","WMSOrderLine_StatusCode"='allocated' where "WMSOrderLine_ID"=v_line."WMSOrderLine_ID";
  end loop;
  update public."WMS_Orders" set "WMSOrder_StatusCode"='in_progress',"WMSOrder_MetadataJSON"=jsonb_set("WMSOrder_MetadataJSON",'{releaseRequestIds}',coalesce("WMSOrder_MetadataJSON"->'releaseRequestIds','[]'::jsonb)||to_jsonb(v_request_id::text),true),"WMSOrder_UpdatedAt"=v_now,"WMSOrder_UpdatedBy"=p_actor_user_id where "WMSOrder_ID"=p_order_id;
  return p_order_id;
end;
$$;
create or replace function public.warehouse_edge_cancel_order_mutation(
  p_order_id uuid, p_actor_user_id uuid,
  p_allowed_facility_ids uuid[], p_allowed_organisation_ids uuid[]
) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_order public."WMS_Orders"%rowtype; v_task public."WMS_Tasks"%rowtype; v_now timestamptz:=now(); v_balance public."WMS_InventoryBalances"%rowtype; v_return numeric;
begin
  select * into v_order from public."WMS_Orders" where "WMSOrder_ID"=p_order_id and "WMSOrder_FacilityID"=any(coalesce(p_allowed_facility_ids,'{}'::uuid[])) and "WMSOrder_CustomerOrgID"=any(coalesce(p_allowed_organisation_ids,'{}'::uuid[])) and not "WMSOrder_IsDeleted" for update;
  if not found then raise exception 'WMS404: This warehouse order does not exist in your workspace.'; end if;
  if v_order."WMSOrder_StatusCode" in ('complete','cancelled') then raise exception 'WMS409: This order is already final.'; end if;
  if exists(select 1 from public."WMS_OrderLines" where "WMSOrderLine_OrderID"=p_order_id and ("WMSOrderLine_ReceivedQuantity">0 or "WMSOrderLine_PickedQuantity">0 or "WMSOrderLine_DispatchedQuantity">0)) then raise exception 'WMS409: An order with received, picked, or dispatched stock cannot be cancelled.'; end if;
  if v_order."WMSOrder_TypeCode"='outbound' then
    for v_task in select * from public."WMS_Tasks" where "WMSTask_OrderID"=p_order_id and "WMSTask_TypeCode"='pick' and "WMSTask_StatusCode" not in ('complete','cancelled') for update loop
      select * into v_balance from public."WMS_InventoryBalances" where "WMSBalance_ID"=v_task."WMSTask_BalanceID" for update;
      if not found then raise exception 'WMS409: Allocated balance is missing.'; end if;
      v_return:=public._warehouse_edge_task_balance_quantity(v_task."WMSTask_Quantity",v_task."WMSTask_UOMCode",v_balance."WMSBalance_UOMCode",v_task."WMSTask_MetadataJSON");
      if v_balance."WMSBalance_AllocatedQuantity"<v_return then raise exception 'WMS409: Task no longer matches its allocated balance.'; end if;
      update public."WMS_InventoryBalances" set "WMSBalance_AllocatedQuantity"=greatest(0,"WMSBalance_AllocatedQuantity"-v_return),"WMSBalance_AvailableQuantity"="WMSBalance_AvailableQuantity"+v_return,"WMSBalance_UpdatedAt"=v_now where "WMSBalance_ID"=v_task."WMSTask_BalanceID";
      update public."WMS_Tasks" set "WMSTask_StatusCode"='cancelled',"WMSTask_CompletedAt"=v_now,"WMSTask_CompletedBy"=p_actor_user_id where "WMSTask_ID"=v_task."WMSTask_ID";
      update public."WMS_PickTasks" set "WMSPick_StatusCode"='cancelled' where "WMSPick_TaskID"=v_task."WMSTask_ID";
      insert into public."WMS_TaskEvents" ("WMSTaskEvent_TaskID","WMSTaskEvent_EventTypeCode","WMSTaskEvent_FromStatusCode","WMSTaskEvent_ToStatusCode","WMSTaskEvent_EventBy") values(v_task."WMSTask_ID",'cancelled',v_task."WMSTask_StatusCode",'cancelled',p_actor_user_id);
    end loop;
  end if;
  update public."WMS_OrderLines" set "WMSOrderLine_AllocatedQuantity"=0,"WMSOrderLine_StatusCode"='cancelled' where "WMSOrderLine_OrderID"=p_order_id;
  update public."WMS_Orders" set "WMSOrder_StatusCode"='cancelled',"WMSOrder_UpdatedAt"=v_now,"WMSOrder_UpdatedBy"=p_actor_user_id where "WMSOrder_ID"=p_order_id;
  return p_order_id;
end;
$$;
create or replace function public.warehouse_edge_dispatch_mutation(
  p_order_id uuid, p_payload jsonb, p_actor_user_id uuid,
  p_allowed_facility_ids uuid[], p_allowed_organisation_ids uuid[]
) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  v_order public."WMS_Orders"%rowtype; v_line public."WMS_OrderLines"%rowtype; v_task public."WMS_Tasks"%rowtype; v_balance public."WMS_InventoryBalances"%rowtype;
  v_input jsonb; v_request_id uuid:=nullif(p_payload->>'requestId','')::uuid; v_dispatch_id uuid; v_number text; v_quantity numeric; v_remaining numeric; v_take numeric; v_before numeric; v_balance_take numeric; v_complete boolean; v_now timestamptz:=now();
begin
  if p_actor_user_id is null then raise exception 'WMS403: Dispatch is reserved for the warehouse team.'; end if;
  if v_request_id is null then raise exception 'WMS400: A request identifier is required.'; end if;
  select * into v_order from public."WMS_Orders" where "WMSOrder_ID"=p_order_id and "WMSOrder_FacilityID"=any(coalesce(p_allowed_facility_ids,'{}'::uuid[])) and "WMSOrder_CustomerOrgID"=any(coalesce(p_allowed_organisation_ids,'{}'::uuid[])) and not "WMSOrder_IsDeleted" for update;
  if not found then raise exception 'WMS404: This warehouse order does not exist in your workspace.'; end if;
  if v_order."WMSOrder_TypeCode"<>'outbound' or v_order."WMSOrder_StatusCode" in ('complete','cancelled') then raise exception 'WMS409: This outbound order cannot be dispatched.'; end if;
  if exists(select 1 from public."WMS_Dispatches" where "WMSDispatch_OrderID"=p_order_id and "WMSDispatch_MetadataJSON"->>'requestId'=v_request_id::text) then return p_order_id; end if;
  if jsonb_typeof(p_payload->'lines')<>'array' or jsonb_array_length(p_payload->'lines')=0 then raise exception 'WMS400: Add at least one dispatch line.'; end if;
  v_dispatch_id:=gen_random_uuid(); v_number:='DSP-'||to_char(v_now,'YYYYMMDD-HH24MISS')||'-'||lpad((floor(random()*9000)+1000)::int::text,4,'0');
  insert into public."WMS_Dispatches" ("WMSDispatch_ID","WMSDispatch_FacilityID","WMSDispatch_OrderID","WMSDispatch_JobID","WMSDispatch_DispatchNumber","WMSDispatch_StatusCode","WMSDispatch_VehicleReg","WMSDispatch_ContainerNumber","WMSDispatch_SealNumber","WMSDispatch_DispatchedAt","WMSDispatch_DispatchedBy","WMSDispatch_MetadataJSON") values(v_dispatch_id,v_order."WMSOrder_FacilityID",p_order_id,v_order."WMSOrder_JobID",v_number,'complete',coalesce(nullif(btrim(p_payload->>'vehicleReg'),''),v_order."WMSOrder_VehicleReg"),coalesce(upper(nullif(btrim(p_payload->>'containerNumber'),'')),v_order."WMSOrder_ContainerNumber"),coalesce(nullif(btrim(p_payload->>'sealNumber'),''),v_order."WMSOrder_SealNumber"),v_now,p_actor_user_id,jsonb_build_object('requestId',v_request_id,'notes',nullif(btrim(p_payload->>'notes'),'')));
  for v_input in select value from jsonb_array_elements(p_payload->'lines') loop
    select * into v_line from public."WMS_OrderLines" where "WMSOrderLine_ID"=(v_input->>'orderLineId')::uuid and "WMSOrderLine_OrderID"=p_order_id for update;
    if not found then raise exception 'WMS400: A dispatch line does not belong to this order.'; end if;
    v_quantity:=nullif(v_input->>'quantity','')::numeric;
    if coalesce(v_quantity,0)<=0 or v_quantity>v_line."WMSOrderLine_PickedQuantity"-v_line."WMSOrderLine_DispatchedQuantity" then raise exception 'WMS409: Dispatch only quantities that warehouse staff have picked.'; end if;
    v_remaining:=v_quantity;
    for v_task in select task.* from public."WMS_Tasks" task where task."WMSTask_TypeCode"='pick' and task."WMSTask_OrderLineID"=v_line."WMSOrderLine_ID" and task."WMSTask_CompletedQuantity">coalesce((task."WMSTask_MetadataJSON"->>'dispatchedQuantity')::numeric,0) order by task."WMSTask_CreatedAt",task."WMSTask_ID" for update loop
      exit when v_remaining<=0; v_take:=least(v_remaining,v_task."WMSTask_CompletedQuantity"-coalesce((v_task."WMSTask_MetadataJSON"->>'dispatchedQuantity')::numeric,0));
      select * into v_balance from public."WMS_InventoryBalances" where "WMSBalance_ID"=v_task."WMSTask_BalanceID" for update;
      if not found then raise exception 'WMS409: Picked stock balance is missing.'; end if;
      v_balance_take:=public._warehouse_edge_task_balance_quantity(v_take,v_task."WMSTask_UOMCode",v_balance."WMSBalance_UOMCode",v_task."WMSTask_MetadataJSON");
      if v_balance."WMSBalance_OnHandQuantity"<v_balance_take or v_balance."WMSBalance_AllocatedQuantity"<v_balance_take then raise exception 'WMS409: Picked stock no longer matches its allocated balance.'; end if;
      v_before:=v_balance."WMSBalance_OnHandQuantity";
      update public."WMS_InventoryBalances" set "WMSBalance_OnHandQuantity"="WMSBalance_OnHandQuantity"-v_balance_take,"WMSBalance_AllocatedQuantity"="WMSBalance_AllocatedQuantity"-v_balance_take,"WMSBalance_UpdatedAt"=v_now,"WMSBalance_LastMovementAt"=v_now where "WMSBalance_ID"=v_balance."WMSBalance_ID";
      update public."WMS_Tasks" set "WMSTask_MetadataJSON"=jsonb_set("WMSTask_MetadataJSON",'{dispatchedQuantity}',to_jsonb(coalesce(("WMSTask_MetadataJSON"->>'dispatchedQuantity')::numeric,0)+v_take),true) where "WMSTask_ID"=v_task."WMSTask_ID";
      insert into public."WMS_InventoryTransactions" ("WMSTransaction_FacilityID","WMSTransaction_BalanceID","WMSTransaction_TypeCode","WMSTransaction_ItemID","WMSTransaction_CustomerOrgID","WMSTransaction_FromLocationID","WMSTransaction_LotID","WMSTransaction_HU_ID","WMSTransaction_Quantity","WMSTransaction_UOMCode","WMSTransaction_BeforeOnHandQuantity","WMSTransaction_AfterOnHandQuantity","WMSTransaction_InventoryStatusCode","WMSTransaction_CustomsStatusCode","WMSTransaction_OrderID","WMSTransaction_OrderLineID","WMSTransaction_TaskID","WMSTransaction_SourceTable","WMSTransaction_SourceID","WMSTransaction_Reference","WMSTransaction_Notes","WMSTransaction_MetadataJSON","WMSTransaction_ReasonCode","WMSTransaction_IdempotencyKey","WMSTransaction_CreatedBy") values(v_order."WMSOrder_FacilityID",v_balance."WMSBalance_ID",'dispatch',v_line."WMSOrderLine_ItemID",v_order."WMSOrder_CustomerOrgID",v_balance."WMSBalance_LocationID",v_balance."WMSBalance_LotID",v_balance."WMSBalance_HU_ID",v_balance_take,v_balance."WMSBalance_UOMCode",v_before,v_before-v_balance_take,'available',v_line."WMSOrderLine_CustomsStatusCode",p_order_id,v_line."WMSOrderLine_ID",v_task."WMSTask_ID",'WMS_Dispatches',v_dispatch_id,v_number,nullif(btrim(p_payload->>'notes'),''),jsonb_build_object('requestId',v_request_id),'dispatch_picked_stock',v_request_id,p_actor_user_id);
      v_remaining:=v_remaining-v_take;
    end loop;
    if v_remaining>0 then raise exception 'WMS409: Picked stock evidence is incomplete for this dispatch.'; end if;
    update public."WMS_OrderLines" set "WMSOrderLine_DispatchedQuantity"="WMSOrderLine_DispatchedQuantity"+v_quantity,"WMSOrderLine_StatusCode"=case when "WMSOrderLine_DispatchedQuantity"+v_quantity>="WMSOrderLine_OrderedQuantity" then 'dispatched' else 'picked' end where "WMSOrderLine_ID"=v_line."WMSOrderLine_ID";
  end loop;
  select bool_and("WMSOrderLine_DispatchedQuantity">="WMSOrderLine_OrderedQuantity") into v_complete from public."WMS_OrderLines" where "WMSOrderLine_OrderID"=p_order_id and "WMSOrderLine_StatusCode"<>'cancelled';
  update public."WMS_Orders" set "WMSOrder_StatusCode"=case when v_complete then 'complete' else 'part_complete' end,"WMSOrder_UpdatedAt"=v_now,"WMSOrder_UpdatedBy"=p_actor_user_id where "WMSOrder_ID"=p_order_id;
  return p_order_id;
end;
$$;
revoke all on function public.warehouse_edge_release_order_mutation(uuid,jsonb,uuid,uuid[],uuid[]) from public,anon,authenticated;
grant execute on function public.warehouse_edge_release_order_mutation(uuid,jsonb,uuid,uuid[],uuid[]) to service_role;
revoke all on function public.warehouse_edge_cancel_order_mutation(uuid,uuid,uuid[],uuid[]) from public,anon,authenticated;
grant execute on function public.warehouse_edge_cancel_order_mutation(uuid,uuid,uuid[],uuid[]) to service_role;
revoke all on function public.warehouse_edge_dispatch_mutation(uuid,jsonb,uuid,uuid[],uuid[]) from public,anon,authenticated;
grant execute on function public.warehouse_edge_dispatch_mutation(uuid,jsonb,uuid,uuid[],uuid[]) to service_role;
commit;
