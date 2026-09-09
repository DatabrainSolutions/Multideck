-- Upload provenance belongs to the prepared action/audit, not to the domain
-- mutation schema. Keep all permission, intent, approval and retry checks.
begin;
set local lock_timeout='5s';
do $patch$
declare definition text;
  dispatch text:='using v_context.company_id,v_context.user_id,v_prepared."AIDexterPrepared_ArgumentsJSON";';
  call_start text:='    execute format(''select public.%I($1,$2,$3)'',v_action_function) into v_result';
begin
  definition:=pg_get_functiondef('public.multideck_dexter_execute_prepared_action(uuid,uuid,uuid,uuid)'::regprocedure);
  if (length(definition)-length(replace(definition,dispatch,'')))/length(dispatch)<>1
    or (length(definition)-length(replace(definition,call_start,'')))/length(call_start)<>1 then
    raise exception 'Review the current Dexter dispatch before separating document provenance';
  end if;
  definition:=replace(definition,call_start,$guard$
    if v_prepared."AIDexterPrepared_ArgumentsJSON" ? '_document_evidence'
      and jsonb_typeof(v_prepared."AIDexterPrepared_ArgumentsJSON"->'_document_evidence') is distinct from 'object' then
      raise exception 'Document provenance must be an audit object.' using errcode='22023';
    end if;
$guard$||call_start);
  definition:=replace(definition,dispatch,'using v_context.company_id,v_context.user_id,v_prepared."AIDexterPrepared_ArgumentsJSON"-''_document_evidence'';');
  execute definition;
end $patch$;
-- CREATE OR REPLACE preserves existing grants; assert the intended private API.
revoke all on function public.multideck_dexter_execute_prepared_action(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.multideck_dexter_execute_prepared_action(uuid,uuid,uuid,uuid) to service_role;
commit;
