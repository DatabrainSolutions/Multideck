begin;
insert into public."sys_AIDexterActions" (
  "AIDexterAction_Code", "AIDexterAction_DomainCode", "AIDexterAction_Name", "AIDexterAction_Description",
  "AIDexterAction_Function", "AIDexterAction_ParametersJSON", "AIDexterAction_SortOrder", "AIDexterAction_IsActive",
  "AIDexterAction_RequiredPermissionsJSON", "AIDexterAction_IntentFamily", "AIDexterAction_HasExternalEffect", "AIDexterAction_UpdatedAt", "AIDexterAction_AlwaysRequiresApproval"
) values
('calculate_customs_duties', 'customs_calculations', 'Calculate Customs duty and VAT estimates',
 'After approval, calculate the saved import declaration using the same authorised calculation service as the UI. Save an immutable audit snapshot. Never submit or change declared tax fields.',
 'multideck_dexter_action_icustoms_edge_only',
 '{"type":"object","properties":{"target_id":{"type":"string"},"reason":{"type":"string","minLength":10,"maxLength":2000}},"required":["target_id","reason"],"additionalProperties":false}'::jsonb,
 134, true, '["Customs.Write"]'::jsonb, 'calculate_customs_duties', true, now(), true),
('override_customs_calculation', 'customs_calculations', 'Record an audited estimate override',
 'After approval, record exact replacement duty/VAT amounts and a mandatory reason against an existing current calculation and item. Original figures remain immutable. This is estimate-only, not a manual CDS tax override.',
 'multideck_dexter_action_icustoms_edge_only',
 '{"type":"object","properties":{"target_id":{"type":"string"},"calculation_id":{"type":"string"},"item_id":{"type":"string"},"duty":{"type":"string","pattern":"^[0-9]{1,16}\\.[0-9]{2}$"},"vat":{"type":"string","pattern":"^[0-9]{1,16}\\.[0-9]{2}$"},"reason":{"type":"string","minLength":10,"maxLength":2000}},"required":["target_id","calculation_id","item_id","duty","vat","reason"],"additionalProperties":false}'::jsonb,
 135, true, '["Customs.Write"]'::jsonb, 'override_customs_calculation', true, now(), true)
on conflict ("AIDexterAction_Code") do update set
 "AIDexterAction_DomainCode"=excluded."AIDexterAction_DomainCode", "AIDexterAction_Name"=excluded."AIDexterAction_Name",
 "AIDexterAction_Description"=excluded."AIDexterAction_Description", "AIDexterAction_Function"=excluded."AIDexterAction_Function",
 "AIDexterAction_ParametersJSON"=excluded."AIDexterAction_ParametersJSON", "AIDexterAction_IsActive"=true,
 "AIDexterAction_RequiredPermissionsJSON"=excluded."AIDexterAction_RequiredPermissionsJSON",
 "AIDexterAction_IntentFamily"=excluded."AIDexterAction_IntentFamily", "AIDexterAction_HasExternalEffect"=true,
 "AIDexterAction_AlwaysRequiresApproval"=true,
 "AIDexterAction_UpdatedAt"=now();
commit;
