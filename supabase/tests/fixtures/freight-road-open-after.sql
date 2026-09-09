do $$declare pair record;changed boolean;signature text:='public.booking_workflow_open_road(uuid,uuid,text)';begin
  for pair in select * from (values
    ('CusQuote_Versions','versions_before'),('CusQuote_Header','headers_before'),
    ('Job_Header','jobs_before'),('Job_Cargo','cargo_before'),('Job_Containers','containers_before'),
    ('Job_Routing','routes_before'),('Job_PackCargoContainer','memberships_before'),
    ('AI_DexterWatchSignals','signals_before'),('sys_AIDexterDataDomains','road_domains_before'),
    ('sys_AIDexterActions','road_actions_before'),('sys_AIDexterWatchCapabilities','road_capabilities_before'),
    ('Job_CargoDangerousGoods','road_dg_before'),('Job_RouteMilestones','road_milestones_before')
  ) tables(actual,previous) loop
    execute format('select exists((select to_jsonb(t) from public.%I t except select to_jsonb(t) from freight_rehearsal.%I t)
      union all (select to_jsonb(t) from freight_rehearsal.%I t except select to_jsonb(t) from public.%I t))',
      pair.actual,pair.previous,pair.previous,pair.actual) into changed;
    if changed then raise exception 'Existing full-row evidence changed: %',pair.actual;end if;
  end loop;
  if exists(select 1 from freight_rehearsal.road_functions_before old
    left join pg_proc current on current.oid=to_regprocedure(old.signature)
    where old.definition is distinct from pg_get_functiondef(current.oid) or old.proacl is distinct from current.proacl)
    then raise exception 'Canonical open/save definition or grants changed';end if;
  if to_regprocedure(signature) is null or has_function_privilege('anon',signature,'execute')
    or has_function_privilege('authenticated',signature,'execute')
    or not has_function_privilege('service_role',signature,'execute') then raise exception 'Road adapter grants incorrect';end if;
  if not exists(select 1 from pg_proc where oid=to_regprocedure(signature)
    and prosecdef and proconfig @> array['search_path=""']) then raise exception 'Road adapter search path incorrect';end if;
end $$;
