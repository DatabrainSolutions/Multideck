-- No exclusions for columns already present in the current schema. The old
-- 29-migration freight-chain-after fixture intentionally remains unchanged.
do $$declare pair record;changed boolean;begin
  for pair in select * from (values
    ('CusQuote_Versions','versions_before'),('CusQuote_Header','headers_before'),
    ('Job_Header','jobs_before'),('Job_Cargo','cargo_before'),('Job_Containers','containers_before'),
    ('Job_Routing','routes_before'),('Job_PackCargoContainer','memberships_before'),('AI_DexterWatchSignals','signals_before')
  ) tables(actual,previous) loop
    execute format('select exists((select to_jsonb(t) from public.%I t except select to_jsonb(t) from freight_rehearsal.%I t)
      union all (select to_jsonb(t) from freight_rehearsal.%I t except select to_jsonb(t) from public.%I t))',
      pair.actual,pair.previous,pair.previous,pair.actual) into changed;
    if changed then raise exception 'Existing evidence changed: %',pair.actual;end if;
  end loop;
  if exists(select 1 from public."Job_RouteMilestones" actual full join freight_rehearsal.milestones_before previous
    using("JobRouteMilestone_ID") where to_jsonb(actual)-array['JobRouteMilestone_RecordedMode','JobRouteMilestone_CreatedBy',
      'JobRouteMilestone_UpdatedBy','JobRouteMilestone_UpdatedAt'] is distinct from to_jsonb(previous)) then
    raise exception 'Legacy milestone fields changed';end if;
  if (select count(*) from public."Job_RouteMilestones")<>4 or exists(select 1 from public."Job_RouteMilestones" m
    where "JobRouteMilestone_RecordedMode" is not null or "JobRouteMilestone_CreatedBy" is not null or "JobRouteMilestone_UpdatedBy" is not null
      or "JobRouteMilestone_UpdatedAt" is null or (booking_api.route_milestone_values(m)->>'operatorEditable')::boolean) then
    raise exception 'Migration invented provenance or made legacy evidence editable';end if;
  if exists(select 1 from public."Job_RouteMilestones" m where booking_api.route_milestone_values(m) ? 'payload'
    or booking_api.route_milestone_values(m) ? 'JobRouteMilestone_PayloadJSON') then
    raise exception 'Raw legacy payload exposed';end if;
  if exists(select to_jsonb(t) from freight_rehearsal.domains_before t except select to_jsonb(t) from public."sys_AIDexterDataDomains" t)
    or exists(select to_jsonb(t) from freight_rehearsal.actions_before t except select to_jsonb(t) from public."sys_AIDexterActions" t)
    or exists(select to_jsonb(t) from freight_rehearsal.capabilities_before t except select to_jsonb(t) from public."sys_AIDexterWatchCapabilities" t) then
    raise exception 'Pre-existing registry changed';end if;
  if exists(select definition,proacl from freight_rehearsal.finance_function_before except
    select pg_get_functiondef(oid),proacl from pg_proc where oid=to_regprocedure('public.multideck_finance_customer_account_snapshot(uuid,uuid[],boolean)')) then
    raise exception 'Separate finance function changed';end if;
end $$;
