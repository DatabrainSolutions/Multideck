-- 1.2.2: remove direct API execution from trigger-only functions and the
-- anonymous customs correction grant. No function body or lookup path changes.
-- Trigger execution uses the trigger binding, not a browser EXECUTE grant.

do $$
declare
  signature text;
begin
  foreach signature in array array[
    'public._multideck_broadcast_watch_guard()',
    'public._multideck_broadcast_watch_signal()',
    'public._multideck_dexter_action_volume_alert()',
    'public._multideck_dexter_crm_essential_signal()',
    'public._multideck_dexter_egress_anomaly_alert()',
    'public._multideck_dexter_lead_address_signal()',
    'public._multideck_dexter_screening_signal()',
    'public._multideck_dexter_security_event_notify()',
    'public._quote_intelligence_header_changed()',
    'public._quote_intelligence_job_cost_changed()',
    'public._quote_intelligence_line_changed()',
    'public._quote_intelligence_rate_changed()',
    'public._quote_intelligence_watch_change()',
    'public.rls_auto_enable()',
    'public.sync_cmp_user_from_auth_user()'
  ] loop
    if to_regprocedure(signature) is null then
      raise exception 'Required internal function is missing: %', signature;
    end if;
    execute format('revoke execute on function %s from anon, authenticated', signature);
  end loop;

  if to_regprocedure('public.reopen_rejected_customs_declaration(uuid)') is null then
    raise exception 'Required customs correction function is missing';
  end if;
  revoke execute on function public.reopen_rejected_customs_declaration(uuid) from anon;
end;
$$;
