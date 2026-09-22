import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { withProductPostgres } from './local-product-postgres.mjs'

test('installation health is tenant-bound, evidence-backed and detects database regressions', () => {
  withProductPostgres((sql, ok) => {
    ok(sql(`
      create schema storage;
      create table storage.buckets(id text, public boolean);
      grant usage on schema storage to service_role;
      grant select on storage.buckets to service_role;
      insert into storage.buckets values ('multideck-documents',false),('multideck-generated',false),('multideck-template-sources',false);
      create table public."cmp_Company"(id uuid);
      create table public."cmp_Users"(id uuid);
      create table public."cmp_Users_Roles"(id uuid);
      alter table public."cmp_Company" enable row level security;
      alter table public."cmp_Users" enable row level security;
      alter table public."cmp_Users_Roles" enable row level security;
      ${readFileSync(new URL('../migrations/20260915090134_cloud_product_entitlements.sql', import.meta.url),'utf8')}
      ${readFileSync(new URL('../migrations/20260922130328_tenant_installation_evidence.sql', import.meta.url),'utf8')}
      insert into private.cloud_product_state(tenant_id) values('00000000-0000-4000-8000-000000000001');
      set role service_role;
      do $$ begin
        if (public.multideck_cloud_installation_health('00000000-0000-4000-8000-000000000001')->>'healthy')::boolean then raise exception 'Missing evidence accepted'; end if;
      end $$;
      reset role;
      insert into private.cloud_installation_evidence(tenant_id,environment,version,commit_sha,database_sha256,functions_sha256,status,verified_at,function_receipts,external_checks)
      values('00000000-0000-4000-8000-000000000001','main','1.2.1',repeat('a',40),repeat('b',64),repeat('c',64),'verified',now(),'[{"slug":"tested"}]','{"auth":true,"integrations":true,"isolation":true}');
      set role service_role;
      do $$ begin
        if not (public.multideck_cloud_installation_health('00000000-0000-4000-8000-000000000001')->>'healthy')::boolean then raise exception 'Verified evidence rejected'; end if;
      end $$;
    `))
    assert.notEqual(sql(`set role service_role; update private.cloud_installation_evidence set status='verified';`).status, 0)
    assert.notEqual(sql(`set role authenticated; select public.multideck_cloud_installation_health('00000000-0000-4000-8000-000000000001');`).status, 0)
    assert.notEqual(sql(`set role service_role; select public.multideck_cloud_installation_health('00000000-0000-4000-8000-000000000002');`).status, 0)
    ok(sql(`alter table public."cmp_Users" disable row level security;
      set role service_role;
      do $$ begin
        if (public.multideck_cloud_installation_health('00000000-0000-4000-8000-000000000001')->>'healthy')::boolean then raise exception 'RLS regression accepted'; end if;
      end $$;`))
  })
})
