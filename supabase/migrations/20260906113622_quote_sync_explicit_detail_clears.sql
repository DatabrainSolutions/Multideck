begin;
set local lock_timeout = '5s';

-- Keep explicit clears for selected fields. Stripping all nulls resurrected
-- old editableDetails through the compatibility read fallback after an apply.
-- Patch the existing canonical body, retaining its permissions, audit, routing
-- guards and all later wrappers. Never rewrite issued Quote snapshots or jobs.
do $migration$
declare
  definition text := pg_get_functiondef(
    'public.booking_workflow_apply_quote_sync_before_payer_20260904(uuid,uuid,uuid,jsonb)'::regprocedure);
  old_block text := $old$    save_payload := save_payload || jsonb_build_object('editableDetails',jsonb_strip_nulls(jsonb_build_object(
      'shipmentType',case when selected_fields ? 'shipmentType' then proposed->>'shipmentType' end,
      'customerNotes',case when selected_fields ? 'customerNotes' then proposed->>'customerNotes' end,
      'termsAndConditions',case when selected_fields ? 'terms' then proposed->>'terms' end,
      'subjectToTerms',case when selected_fields ? 'subjectToTerms' then proposed->>'subjectToTerms' end
    )));$old$;
  new_block text := $new$    save_payload := save_payload || jsonb_build_object('editableDetails',
      (case when selected_fields ? 'shipmentType' then jsonb_build_object('shipmentType',proposed->>'shipmentType') else '{}'::jsonb end)
      || (case when selected_fields ? 'customerNotes' then jsonb_build_object('customerNotes',proposed->>'customerNotes') else '{}'::jsonb end)
      || (case when selected_fields ? 'terms' then jsonb_build_object('termsAndConditions',proposed->>'terms') else '{}'::jsonb end)
      || (case when selected_fields ? 'subjectToTerms' then jsonb_build_object('subjectToTerms',proposed->>'subjectToTerms') else '{}'::jsonb end)
    );$new$;
begin
  if (length(definition) - length(replace(definition,old_block,''))) / length(old_block) <> 1 then
    raise exception 'Review the current Quote apply body before fixing explicit detail clears.';
  end if;
  execute replace(definition,old_block,new_block);
end;
$migration$;

commit;
