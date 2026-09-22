import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {withProductPostgres} from './local-product-postgres.mjs'

test('installation refuses a database-specific empty hook that would override the shutdown guard',()=>{
  withProductPostgres((sql,ok)=>{
    ok(sql(`
      create role supabase_auth_admin; create role authenticator;
      create schema auth; create table auth.sessions(id uuid);
      create schema cron; create table cron.job(jobid bigint,jobname text,active boolean,schedule text,command text);
      ${readFileSync(new URL('../migrations/20260915090134_cloud_product_entitlements.sql',import.meta.url),'utf8')}
      alter role authenticator in database postgres set pgrst.db_pre_request='';
    `));
    const result=sql(readFileSync(new URL('../migrations/20260922134231_tenant_lifecycle_controls.sql',import.meta.url),'utf8'));
    assert.notEqual(result.status,0);
    assert.match(result.stderr,/database-specific Data API hook requires reviewed composition/);
    ok(sql(`do $$ begin
      if to_regclass('private.tenant_lifecycle') is not null then raise exception 'Failed installation left partial changes'; end if;
    end $$;`));
  });
});

test('shutdown is tenant-bound, waits for prior access expiry, verifies offline and recovers safely',()=>{
  withProductPostgres((sql,ok)=>{
    ok(sql(`
      create role supabase_auth_admin;
      create role authenticator;
      create schema auth; create table auth.sessions(id uuid);
      create schema cron; create table cron.job(jobid bigint,jobname text,active boolean,schedule text,command text);
      insert into cron.job values(1,'multideck-test',true,'* * * * *','select 1');
      -- State-machine fixture only. The local Supabase HTTP test exercises
      -- the real extension permissions and supported cron.alter_job API.
      create function cron.alter_job(job_id bigint,active boolean) returns void language sql as 'update cron.job set active=$2 where jobid=$1';
      insert into auth.sessions values(gen_random_uuid());
      create table public.lifecycle_probe(id integer);
      alter table public.lifecycle_probe enable row level security;
      grant select on public.lifecycle_probe to anon,authenticated;
      create policy existing_access on public.lifecycle_probe for select to anon,authenticated using(true);
      insert into public.lifecycle_probe values(1);
      ${readFileSync(new URL('../migrations/20260915090134_cloud_product_entitlements.sql',import.meta.url),'utf8')}
      ${readFileSync(new URL('../migrations/20260922134231_tenant_lifecycle_controls.sql',import.meta.url),'utf8')}
      ${readFileSync(new URL('../migrations/20260922144245_lifecycle_supported_cron_controls.sql',import.meta.url),'utf8')}
      ${readFileSync(new URL('../migrations/20260922152910_lifecycle_verified_offline_transition.sql',import.meta.url),'utf8')}
      insert into private.cloud_product_state(tenant_id) values('00000000-0000-4000-8000-000000000001');
      set role authenticated;
      do $$ begin if (select count(*) from public.lifecycle_probe)<>1 then raise exception 'Active access changed'; end if; end $$;
      reset role;
    `));
    assert.notEqual(sql(`set role authenticated; select public.multideck_cloud_lifecycle('00000000-0000-4000-8000-000000000001','shutdown',1,gen_random_uuid());`).status,0);
    assert.notEqual(sql(`set role service_role; select public.multideck_cloud_lifecycle('00000000-0000-4000-8000-000000000002','shutdown',1,gen_random_uuid());`).status,0);
    ok(sql(`set role service_role;
      select public.multideck_cloud_lifecycle('00000000-0000-4000-8000-000000000001','shutdown',1,'00000000-0000-4000-8000-000000000003');
      select public.multideck_cloud_lifecycle('00000000-0000-4000-8000-000000000001','shutdown',1,'00000000-0000-4000-8000-000000000003');
      do $$ begin
        if (public.multideck_cloud_lifecycle('00000000-0000-4000-8000-000000000001','status')->>'shutdownVerified')::boolean then raise exception 'Unverified shutdown accepted'; end if;
      end $$;
      reset role;
      do $$ begin
        if exists(select 1 from cron.job where active) or exists(select 1 from auth.sessions) then raise exception 'Jobs or sessions remain'; end if;
        if (select previous_cron->0->>'active' from private.tenant_lifecycle)<>'true' then raise exception 'Recovery snapshot overwritten'; end if;
      end $$;
      set role authenticated;
      do $$ begin if exists(select 1 from public.lifecycle_probe) then raise exception 'Old token role still reads data'; end if; end $$;
      reset role;
      set role anon;
      do $$ begin if exists(select 1 from public.lifecycle_probe) then raise exception 'Anonymous reads data'; end if; end $$;
    `));
    assert.notEqual(sql(`set role service_role; select public.multideck_cloud_lifecycle('00000000-0000-4000-8000-000000000001','shutdown',1,gen_random_uuid());`).status,0);
    assert.notEqual(sql(`set role service_role; select public.multideck_cloud_lifecycle('00000000-0000-4000-8000-000000000001','verify_shutdown',2,'00000000-0000-4000-8000-000000000005');`).status,0);
    ok(sql(`update private.tenant_lifecycle set access_may_remain_until=clock_timestamp()-interval '1 second';
      set role service_role;
      select public.multideck_cloud_lifecycle('00000000-0000-4000-8000-000000000001','verify_shutdown',2,'00000000-0000-4000-8000-000000000005');
      select public.multideck_cloud_lifecycle('00000000-0000-4000-8000-000000000001','verify_shutdown',2,'00000000-0000-4000-8000-000000000005');
      do $$ declare status jsonb; begin
        status:=public.multideck_cloud_lifecycle('00000000-0000-4000-8000-000000000001','status');
        if status->>'state'<>'offline' or not (status->>'shutdownVerified')::boolean then raise exception 'Verified offline was not recorded'; end if;
        if not (status->'providerEvidence'->>'existingAccessWindowElapsed')::boolean then raise exception 'Access expiry evidence missing'; end if;
      end $$;`));
    assert.notEqual(sql(`set role service_role; select set_config('request.path','/rpc/operational_rpc',false); select public.multideck_lifecycle_pre_request();`).status,0);
    ok(sql(`set role service_role; select set_config('request.path','/rpc/multideck_cloud_installation_health',false); select public.multideck_lifecycle_pre_request();
      reset role; set role supabase_auth_admin;
      do $$ begin if (public.multideck_lifecycle_auth_hook('{}')->'error'->>'http_code')<>'403' then raise exception 'Offline Auth hook allowed token'; end if; end $$;`));
    ok(sql(`update cron.job set command='select 2' where jobid=1;`));
    assert.notEqual(sql(`set role service_role; select public.multideck_cloud_lifecycle('00000000-0000-4000-8000-000000000001','recover',3,'00000000-0000-4000-8000-000000000004');`).status,0);
    ok(sql(`update cron.job set command='select 1' where jobid=1;
      set role service_role;
      select public.multideck_cloud_lifecycle('00000000-0000-4000-8000-000000000001','recover',3,'00000000-0000-4000-8000-000000000004');
      select public.multideck_cloud_lifecycle('00000000-0000-4000-8000-000000000001','recover',3,'00000000-0000-4000-8000-000000000004');
      reset role;
      do $$ begin
        if not exists(select 1 from cron.job where active) then raise exception 'Original job was not restored'; end if;
        if exists(select 1 from auth.sessions) then raise exception 'Revoked sessions were recreated'; end if;
        if (select count(*) from private.tenant_lifecycle_events)<>3 then raise exception 'Missing or duplicate lifecycle audit'; end if;
      end $$;
      set role authenticated;
      do $$ begin if (select count(*) from public.lifecycle_probe)<>1 then raise exception 'Recovered data missing'; end if; end $$;`));
  });
});
