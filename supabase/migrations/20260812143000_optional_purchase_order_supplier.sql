-- Supplier is free text and optional on purchase orders. The original schema
-- keeps an empty string for compatibility with the existing non-null column.

begin;

do $migration$
declare
  definition text;
begin
  select pg_get_functiondef(
    'public.warehouse_edge_purchase_order_mutation(text,uuid,jsonb,uuid,uuid[])'::regprocedure
  ) into definition;

  definition := replace(
    definition,
    'IF COALESCE(NULLIF(btrim((p_payload ->> ''supplierName''::text)), ''''::text), ''''::text) = ''''::text THEN
        RAISE EXCEPTION ''WMS400: Enter the supplier name.'';
    END IF;',
    ''
  );
  definition := replace(
    definition,
    '"left"(btrim((p_payload ->> ''supplierName''::text)), 240)',
    '"left"(COALESCE(btrim((p_payload ->> ''supplierName''::text)), ''''::text), 240)'
  );

  execute definition;
end
$migration$;

revoke all on function public.warehouse_edge_purchase_order_mutation(text,uuid,jsonb,uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.warehouse_edge_purchase_order_mutation(text,uuid,jsonb,uuid,uuid[]) to service_role;

update public."sys_AIDexterActions"
set "AIDexterAction_ParametersJSON" = ("AIDexterAction_ParametersJSON" #- '{required}') ||
  jsonb_build_object(
    'required',
    coalesce("AIDexterAction_ParametersJSON"->'required', '[]'::jsonb) - 'supplier_name' - 'supplier_org_id'
  ),
  "AIDexterAction_UpdatedAt" = now()
where "AIDexterAction_Code" = 'create_purchase_order';

commit;
