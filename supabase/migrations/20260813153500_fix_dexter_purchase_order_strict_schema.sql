-- OpenAI strict function schemas require every property to appear in required.
-- Optional purchase-order supplier fields remain nullable, but are always
-- represented in Dexter's tool call.

begin;

update public."sys_AIDexterActions"
set "AIDexterAction_ParametersJSON" = jsonb_set(
      jsonb_set(
        "AIDexterAction_ParametersJSON",
        '{properties,supplier_name,type}',
        '["string", "null"]'::jsonb,
        true
      ),
      '{required}',
      '["facility_id", "customer_org_id", "number", "supplier_name", "supplier_org_id", "currency_code", "issue_date", "expected_delivery_date", "notes", "lines"]'::jsonb,
      true
    ),
    "AIDexterAction_UpdatedAt" = now()
where "AIDexterAction_Code" = 'create_purchase_order';

commit;
