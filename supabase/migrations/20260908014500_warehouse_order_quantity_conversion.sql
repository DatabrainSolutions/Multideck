begin;

-- Internal conversion only. Callers must first establish item/customer/facility scope.
create function public._warehouse_edge_quantity_in_uom(
  p_item_id uuid, p_quantity numeric, p_source_uom text, p_target_uom text
) returns numeric language plpgsql stable security definer set search_path='' as $$
declare
  base_uom text;
  source_factor numeric;
  target_factor numeric;
begin
  if p_quantity is null or p_quantity::text in ('NaN','Infinity','-Infinity') or p_quantity<0 then
    raise exception 'WMS400: Check the stock quantity.';
  end if;
  select upper(btrim("WMSItem_BaseUOMCode")) into base_uom from public."WMS_Items" where "WMSItem_ID"=p_item_id;
  if not found then raise exception 'WMS400: Product unavailable for unit conversion.'; end if;
  if upper(btrim(p_source_uom))=base_uom then source_factor:=1;
  else
    select "WMSItemUOM_QuantityInBaseUOM" into source_factor from public."WMS_ItemUOMs"
      where "WMSItemUOM_ItemID"=p_item_id and "WMSItemUOM_UOMCode"=upper(btrim(p_source_uom));
  end if;
  if upper(btrim(p_target_uom))=base_uom then target_factor:=1;
  else
    select "WMSItemUOM_QuantityInBaseUOM" into target_factor from public."WMS_ItemUOMs"
      where "WMSItemUOM_ItemID"=p_item_id and "WMSItemUOM_UOMCode"=upper(btrim(p_target_uom));
  end if;
  if source_factor is null or target_factor is null or source_factor<=0 or target_factor<=0
    or source_factor::text in ('NaN','Infinity','-Infinity') or target_factor::text in ('NaN','Infinity','-Infinity') then
    raise exception 'WMS409: The product needs valid unit conversions before this stock can be used.';
  end if;
  return p_quantity*source_factor/target_factor;
end;
$$;
revoke all on function public._warehouse_edge_quantity_in_uom(uuid,numeric,text,text) from public,anon,authenticated;
grant execute on function public._warehouse_edge_quantity_in_uom(uuid,numeric,text,text) to service_role;

-- Preserve the scoped creation routine and convert each eligible balance to the
-- requested line unit. An unknown packaging conversion must never become 1:1.
do $migration$
declare
  definition text:=pg_get_functiondef('public.warehouse_edge_create_order_mutation(jsonb,uuid,uuid,uuid[],uuid[])'::regprocedure);
  old_total text:='sum(balance."WMSBalance_AvailableQuantity")';
  new_total text:='sum(public._warehouse_edge_quantity_in_uom(v_item."WMSItem_ID",balance."WMSBalance_AvailableQuantity",balance."WMSBalance_UOMCode",upper(coalesce(nullif(btrim(v_input->>''uomCode''),''''),v_item."WMSItem_BaseUOMCode"))))';
begin
  if position(old_total in definition)=0 then raise exception 'Order availability validation changed; review the conversion migration'; end if;
  execute replace(definition,old_total,new_total);
end;
$migration$;
commit;
