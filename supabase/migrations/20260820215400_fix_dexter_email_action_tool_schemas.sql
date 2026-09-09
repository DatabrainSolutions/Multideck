begin;

-- Email actions are executed from Dexter's server-owned prepared-action payload,
-- so their model-facing function schemas intentionally accept no arguments.
-- OpenAI strict tools still require an explicit required array, including when
-- the properties object is empty.
update public."sys_AIDexterActions"
set
  "AIDexterAction_ParametersJSON" = jsonb_build_object(
    'type', 'object',
    'properties', jsonb_build_object(),
    'required', jsonb_build_array(),
    'additionalProperties', false
  ),
  "AIDexterAction_UpdatedAt" = now()
where "AIDexterAction_Code" in ('create_email_draft', 'send_email');

commit;
