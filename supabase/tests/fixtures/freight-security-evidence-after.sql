do $$declare pair record;changed boolean;changed_functions text;begin
  for pair in select * from (values
    ('CusQuote_Versions','versions_before'),('CusQuote_Header','headers_before'),
    ('Job_Header','jobs_before'),('Job_Cargo','cargo_before'),('Job_Containers','containers_before'),
    ('Job_Routing','routes_before'),('Job_PackCargoContainer','memberships_before'),
    ('AI_DexterWatchSignals','signals_before'),('Job_CargoDangerousGoods','security_dg_before'),
    ('Job_RouteMilestones','milestones_before')
  ) tables(actual,previous) loop
    execute format('select exists((select to_jsonb(t) from public.%I t except select to_jsonb(t) from freight_rehearsal.%I t)
      union all (select to_jsonb(t) from freight_rehearsal.%I t except select to_jsonb(t) from public.%I t))',
      pair.actual,pair.previous,pair.previous,pair.actual) into changed;
    if changed then raise exception 'Screening migration changed existing rows: %',pair.actual;end if;
  end loop;
  for pair in select * from (values
    ('sys_AIDexterDataDomains','domains_before','AIDexterDomain_Code'),
    ('sys_AIDexterActions','actions_before','AIDexterAction_Code'),
    ('sys_AIDexterWatchCapabilities','capabilities_before','AIDexterWatchCapability_Code')
  ) tables(actual,previous,key) loop
    execute format('select exists(select 1 from freight_rehearsal.%I old left join public.%I current using (%I)
      where to_jsonb(old) is distinct from to_jsonb(current))',pair.previous,pair.actual,pair.key) into changed;
    if changed then raise exception 'Screening changed existing registry: %',pair.actual;end if;
  end loop;
  select string_agg(old.signature,', ' order by old.signature) into changed_functions from freight_rehearsal.security_functions_before old
    left join pg_proc current on current.oid=to_regprocedure(old.signature)
    where old.signature not in ('booking_api.workspace_extended(uuid,text)',
      'multideck_dexter_create_watch(text,text,text,text,uuid,text,jsonb,jsonb)',
      'multideck_dexter_list_watches()', '_multideck_dexter_evaluate_watch_signal()',
      'multideck_dexter_execute_prepared_action(uuid,uuid,uuid,uuid)')
    and (old.definition is distinct from pg_get_functiondef(current.oid) or old.proacl is distinct from current.proacl);
  if changed_functions is not null then raise exception 'Unrelated function definition or ACL changed: %',changed_functions;end if;
  if exists(select 1 from booking_api.cargo_security_evidence) then raise exception 'Migration invented screening evidence';end if;
end $$;
