begin;

-- Shutdown progress is not a claim that every provider has been verified offline.
create table private.tenant_lifecycle (
  singleton boolean primary key default true check(singleton),
  tenant_id uuid not null,
  revision bigint not null check(revision>0),
  request_id uuid not null,
  last_action text not null check(last_action in ('shutdown','recover')),
  state text not null check(state in ('active','shutting_down','offline')),
  requested_at timestamptz not null default now(),
  offline_verified_at timestamptz,
  previous_cron jsonb not null default '[]',
  provider_evidence jsonb not null default '{}'
);
alter table private.tenant_lifecycle enable row level security;
revoke all on private.tenant_lifecycle from public,anon,authenticated,service_role;
create table private.tenant_lifecycle_events (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null,
  revision bigint not null, request_id uuid not null, action text not null,
  occurred_at timestamptz not null default now(), unique(tenant_id,revision)
);
alter table private.tenant_lifecycle_events enable row level security;
revoke all on private.tenant_lifecycle_events from public,anon,authenticated,service_role;

create function private.tenant_access_enabled() returns boolean
language sql stable security definer set search_path='' as $$
  select not exists(select 1 from private.tenant_lifecycle where state <> 'active');
$$;
revoke all on function private.tenant_access_enabled() from public;
grant execute on function private.tenant_access_enabled() to anon,authenticated,service_role,supabase_auth_admin;

create function public.multideck_tenant_access_enabled() returns boolean
language sql stable security invoker set search_path='' as $$
  select private.tenant_access_enabled();
$$;
revoke all on function public.multideck_tenant_access_enabled() from public,anon,authenticated;
grant execute on function public.multideck_tenant_access_enabled() to service_role;

-- Restrictive policies AND with existing company/role policies; they never
-- grant an additional row. The service role is separately denied by the
-- PostgREST pre-request hook and the operational Edge entrypoint guard.
do $$ declare target record; begin
  for target in select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where c.relkind in ('r','p') and c.relrowsecurity and
      (n.nspname in ('public','document_api') or (n.nspname='storage' and c.relname='objects'))
  loop
    execute format('create policy multideck_lifecycle_gate on %I.%I as restrictive for all to anon,authenticated using ((select private.tenant_access_enabled())) with check ((select private.tenant_access_enabled()))',target.nspname,target.relname);
  end loop;
end $$;

create function public.multideck_lifecycle_pre_request() returns void
language plpgsql security invoker set search_path='' as $$
begin
  if private.tenant_access_enabled() then return; end if;
  if current_setting('role',true)='service_role' and '/'||ltrim(current_setting('request.path',true),'/') in
    ('/rpc/multideck_tenant_access_enabled','/rpc/multideck_cloud_installation_health','/rpc/multideck_cloud_lifecycle') then return; end if;
  raise exception 'This customer installation is offline' using errcode='42501';
end;
$$;
revoke all on function public.multideck_lifecycle_pre_request() from public;
grant execute on function public.multideck_lifecycle_pre_request() to anon,authenticated,service_role;
-- Fail instead of silently replacing a customer's existing security hook.
do $$ declare configured text; begin
  select substring(setting from length('pgrst.db_pre_request=')+1) into configured
    from pg_roles cross join lateral unnest(coalesce(rolconfig,'{}'::text[])) setting
    where rolname='authenticator' and setting like 'pgrst.db_pre_request=%';
  if coalesce(configured,'') not in ('','public.multideck_lifecycle_pre_request') then
    raise exception 'An existing Data API security hook requires reviewed composition';
  end if;
  if exists(select 1 from pg_db_role_setting s cross join lateral unnest(s.setconfig) setting
    where s.setrole='authenticator'::regrole and setting like 'pgrst.db_pre_request=%'
      and setting <> 'pgrst.db_pre_request=public.multideck_lifecycle_pre_request') then
    raise exception 'A database-specific Data API hook requires reviewed composition';
  end if;
  alter role authenticator set pgrst.db_pre_request='public.multideck_lifecycle_pre_request';
end $$;
notify pgrst,'reload config';

create function public.multideck_lifecycle_auth_hook(event jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
  if not private.tenant_access_enabled() then
    return jsonb_build_object('error',jsonb_build_object('http_code',403,'message','This customer installation is offline'));
  end if;
  if event ? 'claims' then return jsonb_build_object('claims',event->'claims'); end if;
  return '{}'::jsonb;
end;
$$;
revoke all on function public.multideck_lifecycle_auth_hook(jsonb) from public,anon,authenticated,service_role;
grant usage on schema private to supabase_auth_admin;
grant execute on function public.multideck_lifecycle_auth_hook(jsonb) to supabase_auth_admin;

create function public.multideck_cloud_lifecycle(p_tenant_id uuid,p_action text,p_revision bigint default null,p_request_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare saved private.tenant_lifecycle%rowtype; jobs jsonb; saved_job jsonb;
begin
  if not exists(select 1 from private.cloud_product_state where singleton and tenant_id=p_tenant_id) then
    raise exception 'Customer identity does not match' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(934712,3);
  select * into saved from private.tenant_lifecycle where singleton for update;
  if p_action='status' then
    return jsonb_build_object('tenantId',p_tenant_id,'state',coalesce(saved.state,'active'),'revision',coalesce(saved.revision,0),
      'shutdownVerified',coalesce(saved.state='offline' and saved.offline_verified_at is not null,false),'offlineVerifiedAt',saved.offline_verified_at);
  end if;
  if p_action not in ('shutdown','recover') or p_revision is null or p_revision<1 or p_request_id is null then
    raise exception 'Invalid lifecycle command' using errcode='22023';
  end if;
  if saved.revision is not null then
    if saved.revision=p_revision and saved.request_id=p_request_id and saved.last_action=p_action then
      return jsonb_build_object('tenantId',p_tenant_id,'state',saved.state,'revision',saved.revision,'shutdownVerified',false);
    end if;
    if saved.revision>=p_revision then raise exception 'Lifecycle revision conflict' using errcode='40001'; end if;
  end if;
  if p_action='recover' then
    if saved.state is null or saved.state='active' then raise exception 'No shutdown to recover' using errcode='22023'; end if;
    for saved_job in select * from jsonb_array_elements(saved.previous_cron) loop
      if not exists(select 1 from cron.job j where j.jobid=(saved_job->>'jobid')::bigint and j.jobname is not distinct from saved_job->>'jobname'
        and j.schedule=saved_job->>'schedule' and md5(j.command)=saved_job->>'commandChecksum') then
        raise exception 'A scheduled job changed; review recovery before resuming work';
      end if;
      update cron.job set active=(saved_job->>'active')::boolean where jobid=(saved_job->>'jobid')::bigint;
    end loop;
    update private.tenant_lifecycle set state='active',revision=p_revision,request_id=p_request_id,last_action='recover',offline_verified_at=null where singleton;
    insert into private.tenant_lifecycle_events(tenant_id,revision,request_id,action) values(p_tenant_id,p_revision,p_request_id,p_action);
    return jsonb_build_object('tenantId',p_tenant_id,'state','active','revision',p_revision,'shutdownVerified',false);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('jobid',jobid,'jobname',jobname,'active',active,'schedule',schedule,'commandChecksum',md5(command))),'[]') into jobs from cron.job;
  insert into private.tenant_lifecycle(singleton,tenant_id,revision,request_id,last_action,state,previous_cron)
    values(true,p_tenant_id,p_revision,p_request_id,'shutdown','shutting_down',jobs)
    on conflict(singleton) do update set revision=excluded.revision,request_id=excluded.request_id,last_action='shutdown',state='shutting_down',offline_verified_at=null,
      previous_cron=case when private.tenant_lifecycle.state='active' then excluded.previous_cron else private.tenant_lifecycle.previous_cron end;
  update cron.job set active=false where active;
  delete from auth.sessions;
  insert into private.tenant_lifecycle_events(tenant_id,revision,request_id,action) values(p_tenant_id,p_revision,p_request_id,p_action);
  -- Deliberately cannot transition to verified offline here. Provider Auth
  -- hooks, existing signed file URLs and active requests must be reconciled.
  return jsonb_build_object('tenantId',p_tenant_id,'state','shutting_down','revision',p_revision,'shutdownVerified',false);
end;
$$;
revoke all on function public.multideck_cloud_lifecycle(uuid,text,bigint,uuid) from public,anon,authenticated;
grant execute on function public.multideck_cloud_lifecycle(uuid,text,bigint,uuid) to service_role;

commit;
