-- Read-only preflight for the PRE-EXISTING function bodies patched by the
-- pending freight migrations. Run before the first freight migration, not
-- after: successful patches deliberately replace these markers.
-- A pass proves these selected prerequisites only, not full chain readiness.
with expected(signature, marker, purpose) as (values
  ('public._multideck_dexter_evaluate_watch_signal()',
   'if v_matches and not coalesce(v_previously_matched, false) then', 'watch match transition'),
  ('public._multideck_dexter_evaluate_watch_signal()',
   'and watch_row."AIDexterWatch_StatusCode" = ''active''', 'watch owner boundary'),
  ('public.multideck_dexter_execute_prepared_action(uuid,uuid,uuid,uuid)',
   'if v_prepared."AIDexterPrepared_AccessMode"=''full'' and v_prepared."AIDexterPrepared_TargetID" is not null', 'mandatory operational approval'),
  ('booking_api.quote_readiness(uuid)',
   E'  return jsonb_build_object(\n    ''ready'', cardinality(missing) = 0,', 'structured cargo readiness'),
  ('booking_api.convert_accepted_quote_before_sync_review_20260904(uuid,uuid,uuid)',
   '  if nullif(btrim(coalesce(facts->>''knownCargo'', facts->>''commodity'')), '''') is not null then', 'accepted cargo conversion'),
  ('public.booking_workflow_apply_quote_sync_before_payer_20260904(uuid,uuid,uuid,jsonb)',
   '  proposed := review_row.proposed_snapshot;', 'selective cargo review'),
  ('public.booking_workflow_save_before_branch_direction_20260904(uuid,uuid,jsonb)',
   'perform booking_api.save_booking(caller_auth_user_id, requested_job_id, payload);', 'single route authority'),
  ('public.booking_workflow_save_before_branch_direction_20260904(uuid,uuid,jsonb)',
   'perform booking_api.save_booking_route_legs(caller_auth_user_id, requested_job_id, payload);', 'multi-leg save stage')
), definitions as (
  select *, case when to_regprocedure(signature) is not null
    then pg_get_functiondef(to_regprocedure(signature)) end as definition
  from expected
), observations as (
  select *, case when definition is not null then
    (length(definition)-length(replace(definition,marker,'')))/length(marker) end as marker_count
  from definitions
)
select signature,purpose,marker_count,
  case when definition is null then 'missing_function'
       when marker_count=1 then 'matched_once'
       else 'review_body_drift' end as status,
  md5(definition) as definition_hash
from observations
order by signature,purpose;
