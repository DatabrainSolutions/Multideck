begin;

-- Only trusted deployment SQL can write receipts. The App service key can read
-- them, but cannot claim that it installed or verified its own release.
create table private.cloud_installation_evidence (
  singleton boolean primary key default true check (singleton),
  tenant_id uuid not null,
  environment text not null check (environment in ('main','training')),
  version text not null check (version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  commit_sha text not null check (commit_sha ~ '^[a-f0-9]{40}$'),
  database_sha256 text not null check (database_sha256 ~ '^[a-f0-9]{64}$'),
  functions_sha256 text not null check (functions_sha256 ~ '^[a-f0-9]{64}$'),
  status text not null default 'installing' check (status in ('installing','verifying','verified','failed')),
  migration_receipts jsonb not null default '[]' check (jsonb_typeof(migration_receipts)='array'),
  function_receipts jsonb not null default '[]' check (jsonb_typeof(function_receipts)='array'),
  external_checks jsonb not null default '{}' check (jsonb_typeof(external_checks)='object'),
  verified_at timestamptz,
  updated_at timestamptz not null default now(),
  check (status <> 'verified' or (verified_at is not null and jsonb_array_length(function_receipts)>0))
);
alter table private.cloud_installation_evidence enable row level security;
revoke all on private.cloud_installation_evidence from public,anon,authenticated,service_role;
grant select on private.cloud_installation_evidence to service_role;

create function public.multideck_cloud_installation_health(p_tenant_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare evidence private.cloud_installation_evidence%rowtype; identity private.cloud_product_state%rowtype;
  rls_ok boolean; storage_ok boolean; checks jsonb;
begin
  select * into identity from private.cloud_product_state where singleton;
  if not found or identity.tenant_id is distinct from p_tenant_id then
    raise exception 'Customer identity does not match' using errcode='42501';
  end if;
  select * into evidence from private.cloud_installation_evidence where singleton and tenant_id=p_tenant_id;
  if not found then return jsonb_build_object('tenantId',p_tenant_id,'healthy',false,'status','unverified'); end if;
  select count(*)=3 and bool_and(c.relrowsecurity) into rls_ok
    from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in ('cmp_Company','cmp_Users','cmp_Users_Roles');
  rls_ok := rls_ok and not exists (
    select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p') and not c.relrowsecurity
      and (has_table_privilege('anon',c.oid,'select') or has_table_privilege('authenticated',c.oid,'select'))
  );
  select count(*)=3 and bool_and(not public) into storage_ok from storage.buckets
    where id in ('multideck-documents','multideck-generated','multideck-template-sources');
  checks := jsonb_build_object(
    'rls',coalesce(rls_ok,false), 'storage',coalesce(storage_ok,false),
    'auth',coalesce(evidence.external_checks->'auth'='true'::jsonb,false),
    'integrations',coalesce(evidence.external_checks->'integrations'='true'::jsonb,false),
    'isolation',coalesce(evidence.external_checks->'isolation'='true'::jsonb,false)
  );
  return jsonb_build_object('tenantId',evidence.tenant_id,'environment',evidence.environment,
    'version',evidence.version,'commitSha',evidence.commit_sha,'databaseSha256',evidence.database_sha256,
    'functionsSha256',evidence.functions_sha256,'status',evidence.status,'verifiedAt',evidence.verified_at,
    'checks',checks,'migrations',evidence.migration_receipts,
    'healthy',evidence.status='verified' and not exists(select 1 from jsonb_each(checks) where value <> 'true'::jsonb));
end;
$$;
revoke all on function public.multideck_cloud_installation_health(uuid) from public,anon,authenticated;
grant execute on function public.multideck_cloud_installation_health(uuid) to service_role;

commit;
