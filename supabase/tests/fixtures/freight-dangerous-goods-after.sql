-- Exact current-schema upgrade preservation; no migration-created field is
-- excluded from any unrelated table, including the already-live milestones.
do $$declare pair record;changed boolean;signature text;role_name text;begin
  for pair in select * from (values
    ('CusQuote_Versions','versions_before'),('CusQuote_Header','headers_before'),
    ('Job_Header','jobs_before'),('Job_Cargo','cargo_before'),('Job_Containers','containers_before'),
    ('Job_Routing','routes_before'),('Job_PackCargoContainer','memberships_before'),
    ('Job_RouteMilestones','milestones_before'),('AI_DexterWatchSignals','signals_before')
  ) tables(actual,previous) loop
    execute format('select exists((select to_jsonb(t) from public.%I t except select to_jsonb(t) from freight_rehearsal.%I t)
      union all (select to_jsonb(t) from freight_rehearsal.%I t except select to_jsonb(t) from public.%I t))',
      pair.actual,pair.previous,pair.previous,pair.actual) into changed;
    if changed then raise exception 'Existing evidence changed: %',pair.actual;end if;
  end loop;
  if exists(select 1 from public."Job_CargoDangerousGoods" actual full join freight_rehearsal.dangerous_goods_before previous
    using("JobCargoDG_ID") where to_jsonb(actual)-array['JobCargoDG_Source','JobCargoDG_SourceReference',
      'JobCargoDG_Status','JobCargoDG_CreatedBy','JobCargoDG_UpdatedBy','JobCargoDG_UpdatedAt'] is distinct from to_jsonb(previous)) then
    raise exception 'Legacy dangerous-goods values changed';end if;
  if (select count(*) from public."Job_CargoDangerousGoods")<>4 or exists(select 1 from public."Job_CargoDangerousGoods" d
    where "JobCargoDG_Source"<>'legacy' or "JobCargoDG_Status"<>'recorded'
      or "JobCargoDG_SourceReference" is not null or "JobCargoDG_CreatedBy" is not null
      or "JobCargoDG_UpdatedBy" is not null or "JobCargoDG_UpdatedAt" is null
      or (booking_api.cargo_dangerous_goods_values(d)->>'operatorEditable')::boolean) then
    raise exception 'Invented provenance or editable legacy evidence';end if;
  if exists(select to_jsonb(t) from freight_rehearsal.domains_before t except select to_jsonb(t) from public."sys_AIDexterDataDomains" t)
    or exists(select to_jsonb(t) from freight_rehearsal.actions_before t except select to_jsonb(t) from public."sys_AIDexterActions" t)
    or exists(select to_jsonb(t) from freight_rehearsal.capabilities_before t except select to_jsonb(t) from public."sys_AIDexterWatchCapabilities" t) then
    raise exception 'Pre-existing registry changed';end if;
  if exists(select definition,proacl from freight_rehearsal.finance_function_before except
    select pg_get_functiondef(oid),proacl from pg_proc where oid=to_regprocedure('public.multideck_finance_customer_account_snapshot(uuid,uuid[],boolean)')) then
    raise exception 'Separate finance function changed';end if;
  if not (select relrowsecurity from pg_class where oid='public."Job_CargoDangerousGoods"'::regclass) then
    raise exception 'Dangerous-goods RLS missing';end if;
  foreach role_name in array array['anon','authenticated','service_role'] loop
    if has_table_privilege(role_name,'public."Job_CargoDangerousGoods"','SELECT,INSERT,UPDATE,DELETE') then
      raise exception 'Direct dangerous-goods access remains: %',role_name;end if;
    if has_function_privilege(role_name,'booking_api.save_cargo_dangerous_goods(uuid,uuid,jsonb)','execute') then
      raise exception 'Private mutation helper exposed: %',role_name;end if;
  end loop;
  foreach signature in array array['public.booking_workflow_save_dangerous_goods(uuid,uuid,jsonb)',
    'public.multideck_dexter_domain_booking_dangerous_goods(uuid,text,integer)',
    'public.multideck_dexter_action_record_booking_dangerous_goods(uuid,uuid,jsonb)'] loop
    if has_function_privilege('anon',signature,'execute') or has_function_privilege('authenticated',signature,'execute')
      or not has_function_privilege('service_role',signature,'execute') then raise exception 'Adapter boundary incorrect: %',signature;end if;
  end loop;
  if not exists(select 1 from public."sys_AIDexterActions" where "AIDexterAction_Code"='record_booking_dangerous_goods'
    and "AIDexterAction_AlwaysRequiresApproval") then raise exception 'Mandatory approval missing';end if;
  if not exists(select 1 from pg_trigger where tgrelid='public."Job_CargoDangerousGoods"'::regclass
    and tgname='TR_Job_CargoDangerousGoods_dexter_watch' and tgenabled='O') then raise exception 'Watch trigger missing';end if;
end $$;

-- Exercise actual post-upgrade defaults, not just catalog declarations.
begin;
insert into public."Job_CargoDangerousGoods"("JobCargoDG_ID","JobCargoDG_JobCargoID")
values('60000000-0000-4000-8000-000000000005','40000000-0000-4000-8000-000000000002');
do $$begin
  if exists(select 1 from public."Job_CargoDangerousGoods" where "JobCargoDG_ID"='60000000-0000-4000-8000-000000000005'
    and ("JobCargoDG_MarinePollutant" is not null or "JobCargoDG_LimitedQuantity" is not null)) then
    raise exception 'Unknown dangerous-goods flags defaulted to a claim';end if;
end $$;
rollback;
