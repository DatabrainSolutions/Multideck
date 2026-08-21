begin;

update public."sys_AIDexterActions"
set
  "AIDexterAction_ParametersJSON" = case "AIDexterAction_Code"
    when 'run_screening_check' then jsonb_set(
      "AIDexterAction_ParametersJSON",
      '{required}',
      '["subject_name", "country", "org_id", "reason"]'::jsonb,
      true
    )
    when 'manage_quote_lifecycle' then jsonb_build_object(
      'type', 'object',
      'properties', jsonb_build_object(
        'target_id', jsonb_build_object(
          'type', 'string',
          'description', 'The exact quote recordId returned by the quotes data tool.'
        ),
        'transition', jsonb_build_object(
          'type', 'string',
          'description', 'The requested quote lifecycle transition.'
        ),
        'reason', jsonb_build_object(
          'type', jsonb_build_array('string', 'null'),
          'description', 'A concise operator-facing reason, or null.'
        ),
        'followUpAt', jsonb_build_object(
          'type', jsonb_build_array('string', 'null'),
          'description', 'The requested ISO follow-up date-time, or null.'
        )
      ),
      'required', jsonb_build_array('target_id', 'transition', 'reason', 'followUpAt'),
      'additionalProperties', false
    )
    else "AIDexterAction_ParametersJSON"
  end,
  "AIDexterAction_UpdatedAt" = now()
where "AIDexterAction_Code" in ('run_screening_check', 'manage_quote_lifecycle');

commit;
