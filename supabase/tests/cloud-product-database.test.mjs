import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { withProductPostgres } from './local-product-postgres.mjs'

// Use only a freshly created local PostgreSQL cluster.
// Failure to reach PostgreSQL is a failure, never a skipped security check.
test('durable feature revisions, atomic audit, identity denial and protected phone entitlement', () => {
  withProductPostgres((query, ok) => {
    const database = 'postgres'
    const sql = (_database, input) => query(input)
    const migration = readFileSync(new URL('../migrations/20260915090134_cloud_product_entitlements.sql', import.meta.url), 'utf8')
    // Supabase environments may inherit broad server grants. The migration must
    // explicitly narrow those, not merely rely on a pristine PostgreSQL default.
    ok(sql(database, `alter default privileges grant all on tables to service_role;
      alter default privileges grant all on sequences to service_role;`))
    ok(sql(database, migration))
    ok(sql(database, `
      insert into private.cloud_product_state(tenant_id) values('11111111-1111-4111-8111-111111111111');
      set role service_role;
      select public.multideck_cloud_apply_features('11111111-1111-4111-8111-111111111111',1,array['icustoms']);
      select public.multideck_cloud_apply_features('11111111-1111-4111-8111-111111111111',1,array['icustoms']);
      do $$begin
        if not public.multideck_cloud_product_access('icustoms') then raise exception 'Enable failed'; end if;
        if public.multideck_cloud_product_access('jenkar_phone') then raise exception 'Phone enabled'; end if;
        if (select count(*) from private.cloud_product_events) <> 1 then raise exception 'Duplicate audit'; end if;
      end$$;
      select public.multideck_cloud_apply_features('11111111-1111-4111-8111-111111111111',3,'{}');
      do $$begin
        if public.multideck_cloud_product_access('icustoms') then raise exception 'Disable failed'; end if;
      end$$;
    `))
    for (const query of [
      "select public.multideck_cloud_apply_features('11111111-1111-4111-8111-111111111111',2,array['icustoms'])",
      "select public.multideck_cloud_apply_features('11111111-1111-4111-8111-111111111111',3,array['icustoms'])",
      "select public.multideck_cloud_apply_features('22222222-2222-4222-8222-222222222222',4,array['icustoms'])",
      "select public.multideck_cloud_apply_features('11111111-1111-4111-8111-111111111111',4,array['jenkar_phone'])",
      'update private.cloud_product_state set jenkar_phone_verified=true',
      'delete from private.cloud_product_events',
      'truncate private.cloud_product_events',
      'delete from private.cloud_product_state',
      "update private.cloud_product_state set tenant_id='22222222-2222-4222-8222-222222222222'",
    ]) assert.notEqual(sql(database, `set role service_role; ${query};`).status, 0, query)
    for (const role of ['anon', 'authenticated']) {
      assert.notEqual(sql(database, `set role ${role}; select public.multideck_cloud_apply_features('11111111-1111-4111-8111-111111111111',4,array['icustoms']);`).status, 0)
      assert.notEqual(sql(database, `set role ${role}; select * from private.cloud_product_state;`).status, 0)
    }
    ok(sql(database, `do $$begin
      if (select revision from private.cloud_product_state) <> 3 or (select count(*) from private.cloud_product_events) <> 2 then
        raise exception 'Denied requests changed state'; end if;
    end$$;`))
  })
})
